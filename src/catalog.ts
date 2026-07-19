import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  CANONICALIZATION,
  canonicalJson,
  executeScenario,
  parseScenario,
  scenarioIdentity,
  type Scenario,
} from "./scenario.js";
import type { SimulationReport } from "./simulation.js";

const HASH_PATTERN = /^[0-9a-f]{64}$/;

export type CatalogErrorCode = "corruption" | "schema" | "missing";

export class CatalogError extends Error {
  override readonly name = "CatalogError";
  constructor(message: string, readonly code: CatalogErrorCode) {
    super(message);
  }
}
const MIGRATION = readFileSync(
  new URL("../schema/sqlite/001_catalog.sql", import.meta.url),
  "utf8",
);

export type ScenarioReference = Readonly<{
  id: string;
  canonicalization: typeof CANONICALIZATION;
}>;

export type StoredScenario = ScenarioReference & Readonly<{ scenario: Scenario }>;

export type StoredRun = Readonly<{
  id: string;
  scenarioId: string;
  traceSha256: string;
  processedEvents: number;
  converged: boolean;
  report: SimulationReport;
}>;

export class ScenarioCatalog {
  readonly #database: DatabaseSync;

  constructor(path: string) {
    if (path.length === 0) {
      throw new Error("catalog path cannot be empty");
    }
    if (path !== ":memory:") {
      if (existsSync(path) && lstatSync(path).isSymbolicLink()) {
        throw new Error("catalog path cannot be a symbolic link");
      }
      mkdirSync(dirname(path), { mode: 0o700, recursive: true });
    }
    this.#database = new DatabaseSync(path, {
      allowExtension: false,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
      timeout: 5_000,
    });
    try {
      this.#database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;");
      this.#migrate();
      this.assertHealthy();
      if (path !== ":memory:") {
        chmodSync(path, 0o600);
      }
    } catch (error) {
      this.#database.close();
      throw error;
    }
  }

  putScenario(scenario: Scenario): ScenarioReference {
    executeScenario(scenario);
    const identity = scenarioIdentity(scenario);
    this.#database
      .prepare(
        "INSERT OR IGNORE INTO scenarios " +
          "(scenario_id, canonicalization, canonical_json, definition_bytes) VALUES (?, ?, ?, ?)",
      )
      .run(identity.id, CANONICALIZATION, identity.canonical, Buffer.byteLength(identity.canonical));
    const row = this.#database
      .prepare("SELECT canonicalization, canonical_json FROM scenarios WHERE scenario_id = ?")
      .get(identity.id) as { canonicalization: string; canonical_json: string } | undefined;
    if (
      row?.canonicalization !== CANONICALIZATION ||
      row.canonical_json !== identity.canonical
    ) {
      throw new CatalogError("scenario digest collision or catalog corruption", "corruption");
    }
    return { id: identity.id, canonicalization: CANONICALIZATION };
  }

  getScenario(id: string): StoredScenario | undefined {
    if (!HASH_PATTERN.test(id)) {
      return undefined;
    }
    const row = this.#database
      .prepare(
        "SELECT canonicalization, canonical_json, definition_bytes " +
          "FROM scenarios WHERE scenario_id = ?",
      )
      .get(id) as
      | { canonicalization: string; canonical_json: string; definition_bytes: number }
      | undefined;
    if (row === undefined) {
      return undefined;
    }
    if (row.canonicalization !== CANONICALIZATION) {
      throw new CatalogError("catalog canonicalization is not supported", "schema");
    }
    if (Buffer.byteLength(row.canonical_json) !== row.definition_bytes) {
      throw new CatalogError("stored scenario byte count does not match its content", "corruption");
    }
    const scenario = parseScenario(JSON.parse(row.canonical_json) as unknown);
    if (scenarioIdentity(scenario).id !== id) {
      throw new CatalogError("stored scenario failed its content identity check", "corruption");
    }
    return { id, canonicalization: CANONICALIZATION, scenario };
  }

  putRun(scenarioId: string, report: SimulationReport): StoredRun {
    if (this.getScenario(scenarioId) === undefined) {
      throw new CatalogError("scenario does not exist", "missing");
    }
    const reportJson = canonicalJson(report);
    const traceSha256 = digest(canonicalJson(report.trace));
    const id = digest(`${scenarioId}\0${reportJson}`);
    this.#database
      .prepare(
        "INSERT OR IGNORE INTO runs " +
          "(run_id, scenario_id, report_json, trace_sha256, processed_events, converged) " +
          "VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, scenarioId, reportJson, traceSha256, report.processedEvents, report.converged ? 1 : 0);
    const stored = this.getRun(id);
    if (
      stored === undefined ||
      stored.scenarioId !== scenarioId ||
      canonicalJson(stored.report) !== reportJson
    ) {
      throw new CatalogError("run digest collision or catalog corruption", "corruption");
    }
    return stored;
  }

  getRun(id: string): StoredRun | undefined {
    if (!HASH_PATTERN.test(id)) {
      return undefined;
    }
    const row = this.#database
      .prepare(
        "SELECT scenario_id, report_json, trace_sha256, processed_events, converged " +
          "FROM runs WHERE run_id = ?",
      )
      .get(id) as
      | {
          scenario_id: string;
          report_json: string;
          trace_sha256: string;
          processed_events: number;
          converged: number;
        }
      | undefined;
    if (row === undefined) {
      return undefined;
    }
    const report = JSON.parse(row.report_json) as SimulationReport;
    if (
      digest(`${row.scenario_id}\0${row.report_json}`) !== id ||
      digest(canonicalJson(report.trace)) !== row.trace_sha256 ||
      report.processedEvents !== row.processed_events ||
      report.converged !== (row.converged === 1)
    ) {
      throw new CatalogError("stored run failed its receipt checks", "corruption");
    }
    return {
      id,
      scenarioId: row.scenario_id,
      traceSha256: row.trace_sha256,
      processedEvents: row.processed_events,
      converged: row.converged === 1,
      report,
    };
  }

  assertHealthy(): void {
    const migration = this.#database
      .prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations")
      .get() as { version: number };
    if (migration.version !== 1) {
      throw new CatalogError("catalog schema version is not supported", "schema");
    }
    const integrity = this.#database.prepare("PRAGMA integrity_check").all() as Array<{
      integrity_check: string;
    }>;
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok") {
      throw new CatalogError("catalog integrity check failed", "corruption");
    }
    const foreignKeys = this.#database.prepare("PRAGMA foreign_key_check").all();
    if (foreignKeys.length !== 0) {
      throw new CatalogError("catalog foreign-key check failed", "corruption");
    }
  }

  close(): void {
    if (this.#database.isOpen) {
      this.#database.close();
    }
  }

  #migrate(): void {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      this.#database.exec(MIGRATION);
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

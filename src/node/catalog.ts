import { backup, DatabaseSync } from "node:sqlite";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { ContractError, utf8Length } from "../crdt.js";
import { sha256Hex } from "../sha256.js";
import { readBundle } from "../verify/bundle.js";
import { parseVerificationCase } from "../verify/case.js";
import { jcs, parseJsonText } from "../verify/json.js";
import type { ReplayBundle, Status } from "../verify/types.js";
const migration = readFileSync(
  new URL("../../schema/sqlite/002_verification.sql", import.meta.url),
  "utf8",
);
const options = {
  allowExtension: false,
  enableForeignKeyConstraints: true,
  enableDoubleQuotedStringLiterals: false,
  timeout: 5000,
};
function ordinary(path: string): void {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat !== undefined && (!stat.isFile() || stat.isSymbolicLink()))
    throw new ContractError("catalog path must be an ordinary file");
}
function schema(db: DatabaseSync): string {
  return jcs(
    db
      .prepare(
        "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
      )
      .all(),
  );
}
const expectedSchema = (() => {
  const db = new DatabaseSync(":memory:", options);
  try {
    db.exec(migration);
    return schema(db);
  } finally {
    db.close();
  }
})();
function checkSchema(db: DatabaseSync): void {
  if (schema(db) !== expectedSchema)
    throw new ContractError(
      "verification catalog schema or owner is incompatible",
    );
  if (
    jcs(
      db
        .prepare(
          "SELECT version,owner FROM verification_schema_migrations ORDER BY version",
        )
        .all(),
    ) !== jcs([{ version: 1, owner: "causal-lab-verification" }])
  )
    throw new ContractError("verification catalog version is incompatible");
  if (
    jcs(db.prepare("PRAGMA integrity_check").all()) !==
      jcs([{ integrity_check: "ok" }]) ||
    db.prepare("PRAGMA foreign_key_check").all().length !== 0
  )
    throw new ContractError("verification catalog integrity failed");
}
type RunRow = {
  run_id: string;
  case_id: string;
  receipt_json: string;
  receipt_bytes: number;
  model_id: string;
  status: Status;
  format_version: number;
  canonical_json: string;
  definition_bytes: number;
};
function bundleFrom(row: RunRow): ReplayBundle {
  const definition = parseVerificationCase(
    parseJsonText(row.canonical_json, 2 * 1024 * 1024),
  );
  if (
    jcs(definition) !== row.canonical_json ||
    utf8Length(row.canonical_json) !== row.definition_bytes ||
    utf8Length(row.receipt_json) !== row.receipt_bytes ||
    row.format_version !== 2
  )
    throw new ContractError("stored bytes are inconsistent");
  const receipt = parseJsonText(row.receipt_json);
  if (jcs(receipt) !== row.receipt_json)
    throw new ContractError("stored receipt is not canonical");
  const bundle = readBundle({
    format_version: 2,
    caseDefinition: definition,
    case_id: row.case_id,
    receipt,
    run_id: row.run_id,
  });
  if (
    bundle.receipt.status !== row.status ||
    bundle.receipt.manifest.model_id !== row.model_id
  )
    throw new ContractError("stored columns differ from receipt");
  return bundle;
}
const select =
  "SELECT r.*, c.canonical_json,c.definition_bytes FROM verification_runs r JOIN verification_cases c ON c.case_id=r.case_id";
function checkRows(db: DatabaseSync): void {
  for (const raw of db.prepare("SELECT * FROM verification_cases").iterate()) {
    const row = raw as {
      case_id: string;
      canonical_json: string;
      definition_bytes: number;
      format_version: number;
    };
    const definition = parseVerificationCase(
      parseJsonText(row.canonical_json, 2 * 1024 * 1024),
    );
    if (
      jcs(definition) !== row.canonical_json ||
      utf8Length(row.canonical_json) !== row.definition_bytes ||
      row.format_version !== 2 ||
      row.case_id !== sha256Hex("causal-lab-case-v2\0" + row.canonical_json)
    )
      throw new ContractError("stored case is inconsistent");
  }
  for (const row of db.prepare(select).iterate()) bundleFrom(row as RunRow);
}
export class VerificationCatalog {
  readonly #db: DatabaseSync;
  constructor(readonly path: string) {
    if (path.length === 0) throw new ContractError("catalog path is required");
    if (path !== ":memory:") {
      ordinary(path);
      if (existsSync(path)) {
        const readOnly = new DatabaseSync(path, { ...options, readOnly: true });
        try {
          checkSchema(readOnly);
          checkRows(readOnly);
        } finally {
          readOnly.close();
        }
      } else mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    }
    this.#db = new DatabaseSync(path, options);
    try {
      if (path === ":memory:" || schema(this.#db) === "[]")
        this.#db.exec(migration);
      checkSchema(this.#db);
      checkRows(this.#db);
      this.#db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL");
      if (path !== ":memory:") chmodSync(path, 0o600);
    } catch (error) {
      this.#db.close();
      throw error;
    }
  }
  put(input: unknown): string {
    const bundle = readBundle(input);
    const caseText = jcs(bundle.caseDefinition);
    const receiptText = jcs(bundle.receipt);
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const existingCase = this.#db
        .prepare(
          "SELECT canonical_json,definition_bytes FROM verification_cases WHERE case_id=?",
        )
        .get(bundle.case_id) as
        | { canonical_json: string; definition_bytes: number }
        | undefined;
      if (existingCase !== undefined) {
        if (
          existingCase.canonical_json !== caseText ||
          existingCase.definition_bytes !== utf8Length(caseText)
        )
          throw new ContractError("existing case bytes conflict");
      } else
        this.#db
          .prepare("INSERT INTO verification_cases VALUES(?,?,?,?)")
          .run(bundle.case_id, 2, caseText, utf8Length(caseText));
      const existing = this.get(bundle.run_id);
      if (existing !== undefined) {
        if (jcs(existing) !== jcs(bundle))
          throw new ContractError("existing run bytes conflict");
      } else
        this.#db
          .prepare("INSERT INTO verification_runs VALUES(?,?,?,?,?,?,?)")
          .run(
            bundle.run_id,
            bundle.case_id,
            2,
            bundle.receipt.manifest.model_id,
            bundle.receipt.status,
            receiptText,
            utf8Length(receiptText),
          );
      this.#db.exec("COMMIT");
      return bundle.run_id;
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }
  get(id: string): ReplayBundle | undefined {
    if (!/^[0-9a-f]{64}$/.test(id)) return undefined;
    const row = this.#db.prepare(select + " WHERE r.run_id=?").get(id) as
      | RunRow
      | undefined;
    return row === undefined ? undefined : bundleFrom(row);
  }
  list(caseId: string, model: string, status: Status): readonly string[] {
    return Object.freeze(
      this.#db
        .prepare(
          "SELECT run_id FROM verification_runs WHERE case_id=? AND model_id=? AND status=? ORDER BY run_id",
        )
        .all(caseId, model, status)
        .map((row) => row.run_id as string),
    );
  }
  assertHealthy(): void {
    checkSchema(this.#db);
    checkRows(this.#db);
  }
  async backup(destination: string): Promise<void> {
    destination = resolve(destination);
    ordinary(destination);
    if (existsSync(destination))
      throw new ContractError("backup destination exists");
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    const temporary = destination + "." + randomUUID() + ".tmp";
    try {
      this.assertHealthy();
      await backup(this.#db, temporary);
      const readOnly = new DatabaseSync(temporary, {
        ...options,
        readOnly: true,
      });
      try {
        checkSchema(readOnly);
        checkRows(readOnly);
      } finally {
        readOnly.close();
      }
      ordinary(destination);
      if (existsSync(destination))
        throw new ContractError("backup destination exists");
      chmodSync(temporary, 0o600);
      renameSync(temporary, destination);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }
  close(): void {
    this.#db.close();
  }
}
export async function restoreVerificationCatalog(
  source: string,
  destination: string,
): Promise<void> {
  ordinary(source);
  ordinary(destination);
  if (!existsSync(source) || existsSync(destination))
    throw new ContractError("restore source/destination is invalid");
  const db = new DatabaseSync(source, { ...options, readOnly: true });
  const temporary = resolve(destination) + "." + randomUUID() + ".tmp";
  mkdirSync(dirname(resolve(destination)), { recursive: true, mode: 0o700 });
  try {
    checkSchema(db);
    checkRows(db);
    await backup(db, temporary);
    const restored = new DatabaseSync(temporary, {
      ...options,
      readOnly: true,
    });
    try {
      checkSchema(restored);
      checkRows(restored);
    } finally {
      restored.close();
    }
    ordinary(destination);
    if (existsSync(destination))
      throw new ContractError("restore destination exists");
    chmodSync(temporary, 0o600);
    renameSync(temporary, destination);
  } finally {
    db.close();
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

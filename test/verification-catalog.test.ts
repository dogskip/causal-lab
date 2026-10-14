import { mkdtempSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import {
  VerificationCatalog,
  restoreVerificationCatalog,
} from "../src/node/catalog.js";
import { ScenarioCatalog } from "../src/catalog.js";
import { createBuiltinContext } from "../src/node/registry.js";
import { executeVerification } from "../src/verify/runtime.js";
const root = mkdtempSync(join(tmpdir(), "causal-v2-db-"));
const definition = {
  format_version: 2,
  model_id: "or-map",
  profile: "independent-updates",
  replicas: ["a"],
  bootstrap: { a: { values: { k: "v" } } },
  seed: 1,
  network: { minLatency: 0, maxLatency: 0, dropRate: 0, duplicateRate: 0 },
  steps: [{ at: 0, action: "heal" }],
  checks: [{ id: "convergence", parameters: null }],
};
function bundle() {
  return executeVerification(definition, createBuiltinContext(definition));
}
it("stores immutable verified receipts, reopens, backs up and restores consistently", async () => {
  const path = join(root, "catalog.sqlite");
  const result = bundle();
  const catalog = new VerificationCatalog(path);
  expect(catalog.put(result)).toBe(result.run_id);
  expect(catalog.put(result)).toBe(result.run_id);
  expect(catalog.list(result.case_id, "or-map", "passed")).toEqual([
    result.run_id,
  ]);
  const backup = join(root, "backup.sqlite");
  await catalog.backup(backup);
  catalog.close();
  const restored = join(root, "restored.sqlite");
  await restoreVerificationCatalog(backup, restored);
  const reopened = new VerificationCatalog(restored);
  expect(reopened.get(result.run_id)).toEqual(result);
  reopened.close();
});
it("rejects legacy files before changing their bytes or tables", () => {
  const path = join(root, "legacy.sqlite");
  new ScenarioCatalog(path).close();
  const before = readFileSync(path);
  expect(() => new VerificationCatalog(path)).toThrow();
  expect(readFileSync(path)).toEqual(before);
  const db = new DatabaseSync(path, { readOnly: true });
  expect(
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE name LIKE 'verification_%'",
      )
      .all(),
  ).toEqual([]);
  db.close();
});
it("blocks SQL replace, ignore, upsert, update and delete on existing records", () => {
  const path = join(root, "guards.sqlite");
  const catalog = new VerificationCatalog(path);
  const result = bundle();
  catalog.put(result);
  catalog.close();
  const db = new DatabaseSync(path);
  for (const mode of ["OR REPLACE", "OR IGNORE", ""]) {
    expect(() =>
      db.exec(
        `INSERT ${mode} INTO verification_runs SELECT * FROM verification_runs;`,
      ),
    ).toThrow();
  }
  expect(() => db.exec("UPDATE verification_runs SET status=status")).toThrow();
  expect(() => db.exec("DELETE FROM verification_cases")).toThrow();
  db.close();
});
it("rejects altered schema and a dangling link without creating the target", () => {
  const path = join(root, "corrupt.sqlite");
  new VerificationCatalog(path).close();
  const db = new DatabaseSync(path);
  db.exec("DROP TRIGGER verification_runs_no_update");
  db.close();
  expect(() => new VerificationCatalog(path)).toThrow();
  const link = join(root, "link.sqlite");
  symlinkSync(join(root, "absent.sqlite"), link);
  expect(() => new VerificationCatalog(link)).toThrow();
});

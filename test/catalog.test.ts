import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { ScenarioCatalog } from "../src/catalog.js";
import { executeScenario, parseScenario } from "../src/scenario.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("scenario catalog", () => {
  it("persists content-addressed scenarios and immutable run receipts across reopen", () => {
    const directory = mkdtempSync(join(tmpdir(), "causal-lab-"));
    directories.push(directory);
    const path = join(directory, "catalog.sqlite");
    const scenario = parseScenario(sampleScenario());

    const first = new ScenarioCatalog(path);
    const reference = first.putScenario(scenario);
    const repeated = first.putScenario(scenario);
    expect(repeated).toEqual(reference);
    const run = first.putRun(reference.id, executeScenario(scenario));
    expect(first.putRun(reference.id, executeScenario(scenario))).toEqual(run);
    first.assertHealthy();
    first.close();

    const reopened = new ScenarioCatalog(path);
    expect(reopened.getScenario(reference.id)?.scenario).toEqual(scenario);
    expect(reopened.getRun(run.id)).toEqual(run);
    expect(reopened.getRun("not-a-digest")).toBeUndefined();
    reopened.close();

    const database = new DatabaseSync(path);
    expect(() => database.prepare("UPDATE scenarios SET definition_bytes = 1").run()).toThrow(
      /immutable/,
    );
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(database.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
    database.close();
  });
});

function sampleScenario(): unknown {
  return {
    config: {
      replicas: ["a", "b"],
      seed: 7,
      minLatency: 1,
      maxLatency: 2,
      dropRate: 0,
      duplicateRate: 0,
    },
    steps: [
      { at: 0, action: "put", replica: "a", key: "mode", value: "safe" },
      { at: 3, action: "heal" },
    ],
  };
}

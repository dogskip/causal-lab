import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import { readBundle } from "../src/verify/bundle.js";
const root = mkdtempSync(join(tmpdir(), "causal-cli-"));
const fixture = {
  format_version: 2,
  model_id: "or-map",
  profile: "independent-updates",
  replicas: ["a", "b"],
  bootstrap: { a: { values: {} }, b: { values: {} } },
  seed: 1,
  network: { minLatency: 0, maxLatency: 0, dropRate: 0, duplicateRate: 0 },
  steps: [{ at: 0, action: "heal" }],
  checks: [{ id: "convergence", parameters: null }],
};
function run(args: string[]) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", resolve("src/verify-cli.ts"), ...args],
    { encoding: "utf8", timeout: 15_000 },
  );
}
it("verifies and replays in separate processes, preserving status exit codes", () => {
  for (const [label, definition, code] of [
    ["pass", fixture, 0],
    [
      "fail",
      {
        ...fixture,
        checks: [
          ...fixture.checks,
          { id: "expected-state", parameters: { state: { wrong: true } } },
        ],
      },
      1,
    ],
    ["incomplete", { ...fixture, steps: [] }, 3],
  ] as const) {
    const input = join(root, label + ".json");
    const output = join(root, label);
    writeFileSync(input, JSON.stringify(definition));
    const first = run(["verify", input, "--out", output]);
    expect(first.stderr).not.toContain("Error:");
    expect(first.status, first.stdout + first.stderr).toBe(code);
    const record = readdirSync(output).find((name) =>
      name.endsWith(".bundle.json"),
    )!;
    const path = join(output, record);
    readBundle(readFileSync(path, "utf8"));
    const replay = run(["replay", path]);
    expect(replay.status, replay.stdout + replay.stderr).toBe(code);
    expect((JSON.parse(replay.stdout) as { matched: boolean }).matched).toBe(
      true,
    );
  }
});
it("exposes run --target yjs and --version for the public name", () => {
  const version = run(["--version"]);
  expect(version.status, version.stdout + version.stderr).toBe(0);
  expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/u);
  const result = run(["run", "--target", "yjs"]);
  expect(result.status, result.stdout + result.stderr).toBe(0);
  const summary = JSON.parse(result.stdout) as {
    status: string;
    receipts: { status: string }[];
  };
  expect(summary.status).toBe("passed");
  expect(summary.receipts[0]?.status).toBe("passed");
});
it("rejects duplicate JSON keys and returns error status without a receipt", () => {
  const input = join(root, "bad.json");
  writeFileSync(input, '{"format_version":2,"format_version":2}');
  const result = run(["verify", input]);
  expect(result.status).toBe(2);
  expect(
    (JSON.parse(result.stdout) as { receipts: unknown[] }).receipts,
  ).toEqual([]);
});
it("terminates a real non-cooperative target without inventing IDs or states", () => {
  const marker = join(root, "marker");
  const module = join(root, "hang.mjs");
  writeFileSync(
    module,
    `import {writeFileSync} from 'node:fs'; export function createContext(){writeFileSync(${JSON.stringify(marker)},'started');while(true){}}`,
  );
  const input = join(root, "hang.json");
  writeFileSync(input, JSON.stringify(fixture));
  const result = run([
    "verify",
    input,
    "--module",
    module,
    "--timeout",
    "1500",
  ]);
  expect(readFileSync(marker, "utf8")).toBe("started");
  expect(result.status).toBe(3);
  const summary: unknown = JSON.parse(result.stdout);
  expect((summary as { receipts: unknown[] }).receipts).toEqual([]);
  expect(summary).not.toHaveProperty("run_id");
  expect(summary).not.toHaveProperty("states");
});

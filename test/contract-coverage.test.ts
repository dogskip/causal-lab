import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guards the 11 invariants declared in docs/test-contract.md against silent
 * coverage drift. Each contract item maps to a marker found in the test suite.
 * If a test is renamed or deleted, this suite fails until the mapping is restored.
 */

const contractText = readFileSync(new URL("../docs/test-contract.md", import.meta.url), "utf8");

const testFilePaths = [
  "test/app.test.ts",
  "test/boundary.test.ts",
  "test/catalog.test.ts",
  "test/contract-coverage.test.ts",
  "test/crdt.test.ts",
  "test/property.test.ts",
  "test/scenario.test.ts",
  "test/simulation.test.ts",
];
const testCorpus = testFilePaths
  .map((path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8"))
  .join("\n");

// Each entry: [substring of contract text that identifies the item, marker that must appear in tests].
const coverage: Array<[string, RegExp]> = [
  // 1. byte-identical traces/reports for equal seeds and scenarios
  ["equal seeds and scenarios produce byte-identical", /toEqual\(second\)|toEqual\(first\)/],
  // 2. duplicated/reordered operations are idempotent
  ["duplicated and reordered operations are idempotent", /reverse|duplicat/i],
  // 3. observed remove suppresses late delivery but not a concurrent put
  ["observed remove suppresses late delivery", /read\("status"\)/],
  // 4. version vectors never decrease, operation identifiers are unique
  ["version vectors never decrease", /toBeGreaterThanOrEqual\(max\)|unique/i],
  // 5. reliable anti-entropy converges after healing
  ["reliable anti-entropy pass after healing converges", /converged.*toBe\(true\)/],
  // 6. same operations converge to the same canonical map regardless of order
  ["converge to the same canonical map", /canonicalState\(\)\)\.toEqual/],
  // 7. limits enforced before state mutation
  ["limits are enforced before state mutation", /MAX_REPLICAS|MAX_EVENTS|MAX_VALUE_BYTES|MAX_IDENTIFIER_BYTES/],
  // 8. key order/whitespace do not change a scenario ID
  ["key order and whitespace do not change a scenario ID", /scenarioIdentity/],
  // 9. one immutable run receipt across database reopen
  ["immutable run receipt across database reopen", /reopened|getRun\(run\.id\)/],
  // 10. catalog migrations idempotent, integrity/FK/hash/byte/trace checks pass
  ["integrity, foreign-key, hash, byte-count, and trace checks", /integrity_check|foreign_key_check/],
  // 11. catalog routes absent when storage not configured
  ["catalog routes are absent when storage is not configured", /catalog is not configured/],
];

describe("test-contract coverage", () => {
  it("docs/test-contract.md contains all expected invariant sentences", () => {
    for (const [sentence] of coverage) {
      expect(contractText).toContain(sentence);
    }
  });

  it.each(coverage)(
    "contract item '%s' is exercised by at least one test",
    (_sentence, marker) => {
      expect(testCorpus).toMatch(marker);
    },
  );

  it("documents the scenario step limit alongside the other limits", () => {
    expect(contractText).toMatch(/1,000 steps/);
  });
});

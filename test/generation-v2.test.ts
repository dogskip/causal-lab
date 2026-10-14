import { expect, it } from "vitest";
import { generateVerification } from "../src/verify/generate.js";
import { createBuiltinContext } from "../src/node/registry.js";
import { parseVerificationCase } from "../src/verify/case.js";
import { readBundle } from "../src/verify/bundle.js";
const base = parseVerificationCase({
  format_version: 2,
  model_id: "or-map",
  profile: "independent-updates",
  replicas: ["a", "b"],
  bootstrap: { a: { values: {} }, b: { values: {} } },
  seed: 1,
  network: { minLatency: 0, maxLatency: 2, dropRate: 0.5, duplicateRate: 0.5 },
  steps: [],
  checks: [{ id: "convergence", parameters: null }],
});
it("executes exactly the requested cases, with repeatable generation", () => {
  const first = generateVerification(base, createBuiltinContext, {
    numRuns: 30,
    seed: 9,
  });
  const second = generateVerification(base, createBuiltinContext, {
    numRuns: 30,
    seed: 9,
  });
  expect(first.status).toBe("passed");
  expect(first.actualRuns).toBe(30);
  expect(first).toEqual(second);
});
it("retains original and shrunk failures of the same independent check", () => {
  const source = {
    ...base,
    checks: [
      ...base.checks,
      { id: "expected-state", parameters: { state: { impossible: true } } },
    ],
  };
  const result = generateVerification(source, createBuiltinContext, {
    numRuns: 50,
    seed: 9,
  });
  expect(result.status).toBe("failed");
  expect(result.actualRuns).toBeLessThan(50);
  expect(result.original).toBeDefined();
  expect(result.shrunk).toBeDefined();
  expect(readBundle(result.shrunk).receipt.status).toBe("failed");
  expect(result.failureChecks).toContain("expected-state");
  expect(result.path).toMatch(/\d/);
  expect(result.shrunk!.caseDefinition.steps.length).toBeLessThanOrEqual(
    result.original!.caseDefinition.steps.length,
  );
});

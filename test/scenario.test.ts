import { describe, expect, it } from "vitest";
import { executeScenario, parseScenario, scenarioIdentity } from "../src/scenario.js";

const scenarioInput = {
  config: {
    replicas: ["a", "b"],
    seed: 19,
    minLatency: 1,
    maxLatency: 3,
    dropRate: 0.25,
    duplicateRate: 0.5,
  },
  steps: [
    { at: 0, action: "partition", left: "a", right: "b" },
    { at: 1, action: "put", replica: "a", key: "mode", value: "safe" },
    { at: 5, action: "heal" },
  ],
};

describe("reproducible scenarios", () => {
  it("assigns the same identity regardless of object key order", () => {
    const reordered = {
      steps: scenarioInput.steps.map((step) => Object.fromEntries(Object.entries(step).reverse())),
      config: Object.fromEntries(Object.entries(scenarioInput.config).reverse()),
    };

    const first = parseScenario(scenarioInput);
    const second = parseScenario(reordered);
    expect(scenarioIdentity(first)).toEqual(scenarioIdentity(second));
  });

  it("executes the same validated scenario byte-identically", () => {
    const scenario = parseScenario(scenarioInput);
    expect(executeScenario(scenario)).toEqual(executeScenario(scenario));
  });
});

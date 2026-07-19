import { describe, expect, it } from "vitest";
import { executeScenario, parseScenario, scenarioIdentity } from "../src/scenario.js";
import { partitionScenarioInput } from "./fixtures.js";

describe("reproducible scenarios", () => {
  it("assigns the same identity regardless of object key order", () => {
    const reordered = {
      steps: partitionScenarioInput.steps.map((step) =>
        Object.fromEntries(Object.entries(step).reverse()),
      ),
      config: Object.fromEntries(Object.entries(partitionScenarioInput.config).reverse()),
    };

    const first = parseScenario(partitionScenarioInput);
    const second = parseScenario(reordered);
    expect(scenarioIdentity(first)).toEqual(scenarioIdentity(second));
  });

  it("executes the same validated scenario byte-identically", () => {
    const scenario = parseScenario(partitionScenarioInput);
    expect(executeScenario(scenario)).toEqual(executeScenario(scenario));
  });
});

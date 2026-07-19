import { describe, expect, it } from "vitest";
import { Simulation } from "../src/simulation.js";
import { partitionSimulationConfig } from "./fixtures.js";

function runScenario() {
  const simulation = new Simulation(partitionSimulationConfig);
  simulation.partition("north", "south");
  simulation.put("north", "status", "draft");
  simulation.put("south", "status", "ready");
  simulation.advance(30);
  simulation.remove("west", "status");
  simulation.healAll();
  simulation.runUntilIdle();
  return simulation.report();
}

describe("deterministic virtual network", () => {
  it("reproduces a trace and converges after reliable anti-entropy", () => {
    const first = runScenario();
    const second = runScenario();

    expect(first).toEqual(second);
    expect(first.converged).toBe(true);
    expect(first.processedEvents).toBeLessThanOrEqual(10_000);
  });
});

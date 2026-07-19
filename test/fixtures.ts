import type { SimulationConfig } from "../src/simulation.js";

/**
 * Two validated scenario shapes reused across the test suite. Kept here so every
 * test references the same fixtures rather than redefining near-identical data.
 */

export const partitionScenarioInput = {
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
} as const;

export const catalogScenarioInput = {
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
} as const;

/** Returns a fresh deep copy so callers can mutate without leaking into shared state. */
export function partitionScenario(): unknown {
  return structuredClone(partitionScenarioInput);
}

export function catalogScenario(): unknown {
  return structuredClone(catalogScenarioInput);
}

export const partitionSimulationConfig: SimulationConfig = {
  replicas: ["north", "south", "west"],
  seed: 0x5eed,
  minLatency: 2,
  maxLatency: 17,
  dropRate: 0.2,
  duplicateRate: 0.5,
};

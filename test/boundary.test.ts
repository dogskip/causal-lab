import { describe, expect, it } from "vitest";
import { MAX_IDENTIFIER_BYTES, MAX_VALUE_BYTES, Replica } from "../src/crdt.js";
import { MAX_STEPS } from "../src/scenario.js";
import { executeScenario, parseScenario } from "../src/scenario.js";
import {
  MAX_EVENTS,
  MAX_REPLICAS,
  Simulation,
  type SimulationConfig,
} from "../src/simulation.js";
import { catalogScenario } from "./fixtures.js";

function baseConfig(overrides: Partial<SimulationConfig> = {}): SimulationConfig {
  return {
    replicas: ["a", "b"],
    seed: 1,
    minLatency: 1,
    maxLatency: 2,
    dropRate: 0,
    duplicateRate: 0,
    ...overrides,
  };
}

function scenarioWith(config: Partial<SimulationConfig>, steps: unknown[]): unknown {
  return { config: { ...baseConfig(), ...config }, steps };
}

describe("limits enforced before state mutation", () => {
  it("accepts the replica cap (12) and rejects 13", () => {
    const replicas = Array.from({ length: MAX_REPLICAS }, (_, index) => `r${index}`);
    expect(() => new Simulation(baseConfig({ replicas }))).not.toThrow();
    expect(() =>
      new Simulation(baseConfig({ replicas: [...replicas, "r13"] })),
    ).toThrow(/replicas/);
  });

  it("rejects fewer than 2 replicas and duplicate identifiers", () => {
    expect(() => new Simulation(baseConfig({ replicas: ["a"] }))).toThrow(/replicas/);
    expect(() => new Simulation(baseConfig({ replicas: ["a", "a"] }))).toThrow(/unique/);
  });

  it("rejects an unsigned 32-bit seed outside [0, 0xffffffff]", () => {
    expect(() => new Simulation(baseConfig({ seed: 0 }))).not.toThrow();
    expect(() => new Simulation(baseConfig({ seed: 0xffff_ffff }))).not.toThrow();
    expect(() => new Simulation(baseConfig({ seed: 0x1_0000_0000 }))).toThrow(/seed/);
    expect(() => new Simulation(baseConfig({ seed: -1 }))).toThrow(/seed/);
  });

  it("accepts latency edges and rejects inverted or oversized ranges", () => {
    expect(() => new Simulation(baseConfig({ minLatency: 5, maxLatency: 5 }))).not.toThrow();
    expect(() => new Simulation(baseConfig({ minLatency: 3, maxLatency: 1 }))).toThrow(/latency/);
    expect(() => new Simulation(baseConfig({ maxLatency: 60_001 }))).toThrow(/latency/);
  });

  it("accepts network probabilities at 0 and 1, rejects out of range", () => {
    expect(() => new Simulation(baseConfig({ dropRate: 0, duplicateRate: 0 }))).not.toThrow();
    expect(() => new Simulation(baseConfig({ dropRate: 1, duplicateRate: 1 }))).not.toThrow();
    expect(() => new Simulation(baseConfig({ dropRate: -0.1 }))).toThrow(/probabilities/);
    expect(() => new Simulation(baseConfig({ duplicateRate: 1.1 }))).toThrow(/probabilities/);
  });

  it("rejects a replica partitioned from itself", () => {
    const simulation = new Simulation(baseConfig());
    expect(() => simulation.partition("a", "a")).toThrow(/itself/);
  });

  it("rejects a negative or non-integer advance duration", () => {
    const simulation = new Simulation(baseConfig());
    expect(() => simulation.advance(-1)).toThrow(/duration/);
    expect(() => simulation.advance(1.5)).toThrow(/duration/);
  });

  it("enforces the event cap", () => {
    const simulation = new Simulation(
      baseConfig({ replicas: ["a", "b"], maxLatency: 1, dropRate: 0, duplicateRate: 0 }),
    );
    // Each put schedules one event to the other replica. Exceeding MAX_EVENTS throws.
    for (let index = 0; index < MAX_EVENTS; index += 1) {
      simulation.put("a", "k", "v");
    }
    expect(() => simulation.put("a", "k", "v")).toThrow(/events/);
  });

  it("accepts the identifier byte cap and rejects one over", () => {
    const atCap = "a".repeat(MAX_IDENTIFIER_BYTES);
    expect(() => new Replica(atCap)).not.toThrow();
    expect(() => new Replica(`${atCap}x`)).toThrow(/invalid/);
  });

  it("accepts the value byte cap and rejects one over", () => {
    const replica = new Replica("a");
    const atCap = "x".repeat(MAX_VALUE_BYTES);
    expect(() => replica.put("k", atCap)).not.toThrow();
    expect(() => replica.put("k", `${atCap}x`)).toThrow(/value/);
  });

  it("enforces the scenario step cap", () => {
    const steps = Array.from({ length: MAX_STEPS }, () => ({
      at: 0,
      action: "put" as const,
      replica: "a",
      key: "k",
      value: "v",
    }));
    expect(() => executeScenario(parseScenario(scenarioWith({}, steps)))).not.toThrow();
    expect(() =>
      executeScenario(parseScenario(scenarioWith({}, [...steps, steps[0]]))),
    ).toThrow(/steps/);
  });

  it("enforces non-decreasing step times", () => {
    const steps = [
      { at: 5, action: "put", replica: "a", key: "k", value: "v" },
      { at: 3, action: "heal" },
    ];
    expect(() => executeScenario(parseScenario(scenarioWith({}, steps)))).toThrow(/non-decreasing/);
  });

  it("rejects unknown step actions and unknown step fields", () => {
    expect(() =>
      executeScenario(
        parseScenario(
          scenarioWith({}, [{ at: 0, action: "explode", replica: "a", key: "k", value: "v" }]),
        ),
      ),
    ).toThrow(/action/);
    expect(() =>
      executeScenario(
        parseScenario(
          scenarioWith({}, [{ at: 0, action: "put", replica: "a", key: "k", value: "v", extra: 1 }]),
        ),
      ),
    ).toThrow(/unknown field/);
  });

  it("rejects a non-string replica entry", () => {
    expect(() =>
      parseScenario(scenarioWith({ replicas: ["a", 5] as unknown as string[] }, [])),
    ).toThrow(/replicas/);
  });

  it("preserves determinism at the event cap boundary", () => {
    const base = catalogScenario();
    const first = executeScenario(parseScenario(base));
    const second = executeScenario(parseScenario(catalogScenario()));
    expect(first).toEqual(second);
  });
});

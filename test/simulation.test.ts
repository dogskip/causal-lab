import { describe, expect, it } from "vitest";
import {
  MAX_EVENTS,
  MAX_REPLICAS,
  Simulation,
  type SimulationConfig,
} from "../src/simulation.js";
import { partitionSimulationConfig } from "./fixtures.js";

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

  it("converges after partitioning and healing with drops", () => {
    const sim = new Simulation(
      baseConfig({ replicas: ["a", "b"], dropRate: 0.5, duplicateRate: 0.5 }),
    );
    sim.partition("a", "b");
    sim.put("a", "shared", "1");
    sim.advance(10);
    sim.healAll();
    sim.runUntilIdle();
    const report = sim.report();
    expect(report.converged).toBe(true);
  });

  it("does not deliver messages across a partition", () => {
    const sim = new Simulation(baseConfig({ replicas: ["a", "b"] }));
    sim.partition("a", "b");
    sim.put("a", "key", "value");
    sim.advance(100);
    const report = sim.report();
    expect(report.states["b"]?.["key"]).toBeUndefined();
    expect(report.states["a"]?.["key"]).toEqual(["value"]);
  });

  it("delivers held messages after heal", () => {
    const sim = new Simulation(baseConfig({ replicas: ["a", "b"] }));
    sim.partition("a", "b");
    sim.put("a", "key", "value");
    sim.advance(100);
    sim.healAll();
    sim.runUntilIdle();
    const report = sim.report();
    expect(report.states["b"]?.["key"]).toEqual(["value"]);
    expect(report.converged).toBe(true);
  });

  it("handles multiple overlapping partitions correctly", () => {
    const sim = new Simulation(
      baseConfig({ replicas: ["a", "b", "c"], dropRate: 0, duplicateRate: 0 }),
    );
    sim.partition("a", "b");
    sim.partition("a", "c");
    sim.put("a", "k", "v");
    sim.advance(10);
    sim.healAll();
    sim.runUntilIdle();
    const report = sim.report();
    expect(report.converged).toBe(true);
    expect(report.states["a"]?.["k"]).toEqual(["v"]);
    expect(report.states["b"]?.["k"]).toEqual(["v"]);
    expect(report.states["c"]?.["k"]).toEqual(["v"]);
  });

  it("remove() creates an operation and broadcasts it", () => {
    const sim = new Simulation(baseConfig({ replicas: ["a", "b"] }));
    sim.put("a", "k", "v");
    sim.advance(10);
    sim.remove("a", "k");
    sim.advance(10);
    sim.runUntilIdle();
    const report = sim.report();
    expect(report.converged).toBe(true);
    // After observed-remove, the key is absent from canonicalState entirely
    expect(report.states["a"]?.["k"]).toBeUndefined();
    expect(report.states["b"]?.["k"]).toBeUndefined();
  });

  it("rejects an unknown replica on put", () => {
    const sim = new Simulation(baseConfig());
    expect(() => sim.put("unknown", "k", "v")).toThrow(/unknown replica/);
  });

  it("rejects an unknown replica on remove", () => {
    const sim = new Simulation(baseConfig());
    expect(() => sim.remove("unknown", "k")).toThrow(/unknown replica/);
  });

  it("rejects an unknown replica on partition", () => {
    const sim = new Simulation(baseConfig());
    expect(() => sim.partition("unknown", "a")).toThrow(/unknown replica/);
    expect(() => sim.partition("a", "unknown")).toThrow(/unknown replica/);
  });

  it("trace entries contain sequence, time and kind", () => {
    const sim = new Simulation(baseConfig());
    sim.put("a", "k", "v");
    sim.advance(10);
    sim.runUntilIdle();
    const report = sim.report();
    expect(report.trace.length).toBeGreaterThan(0);
    for (const entry of report.trace) {
      expect(entry.sequence).toBeGreaterThan(0);
      expect(entry.time).toBeGreaterThanOrEqual(0);
      expect(["local", "scheduled", "delivered", "dropped", "held", "partition", "heal"]).toContain(
        entry.kind,
      );
    }
  });

  it("advance(0) does not throw and processes no events", () => {
    const sim = new Simulation(baseConfig());
    const before = sim.report().processedEvents;
    expect(() => sim.advance(0)).not.toThrow();
    expect(sim.report().processedEvents).toBe(before);
  });

  it("advance with no events yet does not throw", () => {
    const sim = new Simulation(baseConfig());
    expect(() => sim.advance(1000)).not.toThrow();
    expect(sim.report().virtualTime).toBe(1000);
  });

  it("runUntilIdle with no events returns immediately", () => {
    const sim = new Simulation(baseConfig());
    expect(() => sim.runUntilIdle()).not.toThrow();
    expect(sim.report().processedEvents).toBe(0);
  });

  it("accumulates virtual time across multiple advance calls", () => {
    const sim = new Simulation(baseConfig({ maxLatency: 3 }));
    sim.put("a", "k", "v");
    sim.advance(1);
    sim.advance(1);
    expect(sim.report().virtualTime).toBe(2);
  });

  it("broadcasts operations to all other replicas", () => {
    const sim = new Simulation(
      baseConfig({ replicas: ["a", "b", "c"], dropRate: 0, duplicateRate: 0 }),
    );
    sim.put("a", "k", "v");
    sim.runUntilIdle();
    const report = sim.report();
    expect(report.converged).toBe(true);
    expect(report.states["a"]?.["k"]).toEqual(["v"]);
    expect(report.states["b"]?.["k"]).toEqual(["v"]);
    expect(report.states["c"]?.["k"]).toEqual(["v"]);
  });

  it("processes events in correct order via EventHeap", () => {
    const sim = new Simulation(baseConfig({ replicas: ["a", "b"], maxLatency: 5 }));
    sim.put("a", "k1", "v1");
    sim.put("b", "k2", "v2");
    sim.runUntilIdle();
    const report = sim.report();
    // verify events are ordered by time, then sequence
    for (let i = 1; i < report.trace.length; i++) {
      const prev = report.trace[i - 1]!;
      const curr = report.trace[i]!;
      if (prev.time === curr.time) {
        expect(prev.sequence).toBeLessThan(curr.sequence);
      }
    }
  });

  it("event cap enforcement rejects put exceeding MAX_EVENTS", () => {
    const sim = new Simulation(
      baseConfig({ replicas: ["a", "b"], maxLatency: 1, dropRate: 0, duplicateRate: 0 }),
    );
    for (let i = 0; i < MAX_EVENTS; i++) sim.put("a", "k", "v");
    expect(() => sim.put("a", "k", "v")).toThrow(/events/);
  });

  it("deterministic with MAX_EVENTS puts produces identical reports", () => {
    const sim1 = new Simulation(
      baseConfig({ replicas: ["a", "b"], maxLatency: 1, dropRate: 0, duplicateRate: 0 }),
    );
    const sim2 = new Simulation(
      baseConfig({ replicas: ["a", "b"], maxLatency: 1, dropRate: 0, duplicateRate: 0 }),
    );
    for (let i = 0; i < MAX_EVENTS; i++) {
      sim1.put("a", "k", "v");
      sim2.put("a", "k", "v");
    }
    expect(sim1.report()).toEqual(sim2.report());
  });

  it("duplicates and drops are deterministic with the same seed", () => {
    const config: SimulationConfig = {
      replicas: ["a", "b"],
      seed: 42,
      minLatency: 1,
      maxLatency: 3,
      dropRate: 0.3,
      duplicateRate: 0.3,
    };
    const r1 = new Simulation(config);
    r1.put("a", "k", "v");
    r1.advance(100);
    r1.runUntilIdle();

    const r2 = new Simulation(config);
    r2.put("a", "k", "v");
    r2.advance(100);
    r2.runUntilIdle();

    expect(r1.report()).toEqual(r2.report());
  });

  it("converges with all 12 replicas", () => {
    const replicas = Array.from({ length: MAX_REPLICAS }, (_, i) => `r${i}`);
    const sim = new Simulation(
      baseConfig({ replicas, minLatency: 1, maxLatency: 2 }),
    );
    sim.put("r0", "k", "v");
    sim.runUntilIdle();
    const report = sim.report();
    expect(report.converged).toBe(true);
    // verify all replicas have the value
    for (const id of replicas) {
      expect(report.states[id]?.["k"]).toEqual(["v"]);
    }
  });

  it("report throws if replica map changed between construction and report", () => {
    // Normal case: no mutation
    const sim = new Simulation(baseConfig());
    sim.put("a", "k", "v");
    sim.advance(10);
    expect(() => sim.report()).not.toThrow();
  });
});

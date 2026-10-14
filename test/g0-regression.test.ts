import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ScenarioCatalog } from "../src/catalog.js";
import { VersionVector } from "../src/crdt.js";
import { executeScenario } from "../src/scenario.js";
import {
  MAX_EVENTS,
  Simulation,
  type SimulationConfig,
  type SimulationReport,
  type TraceEntry,
} from "../src/simulation.js";
import { traceToMermaid } from "../src/trace.js";
import {
  createReplay,
  frameAt,
  snapshotAt,
  type Snapshot,
} from "../web/frame.js";

const config: SimulationConfig = {
  replicas: ["a", "b"],
  seed: 19,
  minLatency: 1,
  maxLatency: 1,
  dropRate: 1,
  duplicateRate: 0,
};

describe("G0 requirement regressions", () => {
  it("preserves every valid replica name as an own property before comparing states", () => {
    const sim = new Simulation({
      ...config,
      replicas: ["__proto__", "constructor", "toString"],
    });
    sim.put("__proto__", "k", "first");
    sim.put("constructor", "k", "second");
    const report = sim.report();
    expect(Object.keys(report.states)).toEqual([
      "__proto__",
      "constructor",
      "toString",
    ]);
    expect(Object.hasOwn(report.states, "__proto__")).toBe(true);
    expect(report.states["__proto__"]).toEqual({ k: ["first"] });
    expect(Object.keys(report.versions)).toEqual(Object.keys(report.states));
    expect(report.converged).toBe(false);
  });

  it("orders version counters without locale-dependent collation", () => {
    const vector = new VersionVector();
    vector.observe({ replica: "i", counter: 1 });
    vector.observe({ replica: "I", counter: 1 });
    expect(Object.keys(vector.toJSON())).toEqual(["I", "i"]);
  });

  for (const action of ["put", "remove"] as const) {
    it(`leaves all public state unchanged when ${action} exceeds the event budget`, () => {
      const sim = new Simulation(config);
      for (let index = 0; index < MAX_EVENTS; index += 1)
        sim.put("a", "k", "before");
      const before = sim.report();
      expect(() =>
        action === "put" ? sim.put("a", "k", "after") : sim.remove("a", "k"),
      ).toThrow(/events/);
      expect(sim.report()).toEqual(before);
    });
  }

  it("leaves held messages, partitions, counters and RNG unchanged when heal exceeds the budget", () => {
    const sim = new Simulation({ ...config, dropRate: 0 });
    sim.partition("a", "b");
    for (let index = 0; index < MAX_EVENTS - 1; index += 1)
      sim.put("a", "k", "before");
    sim.advance(1);
    const before = sim.report();
    expect(() => sim.healAll()).toThrow(/events/);
    expect(sim.report()).toEqual(before);
    expect(() => sim.healAll()).toThrow(/events/);
    expect(sim.report()).toEqual(before);
  });

  it("rejects an overflowing scheduled arrival before changing the local replica", () => {
    const sim = new Simulation({ ...config, dropRate: 0 });
    sim.advance(Number.MAX_SAFE_INTEGER);
    const before = sim.report();
    expect(() => sim.put("a", "k", "overflow")).toThrow(/time|overflow/);
    expect(sim.report()).toEqual(before);
  });

  it("does not display a future operation before the first recorded state", () => {
    expect(
      snapshotAt([{ at: 10, states: { a: { k: ["future"] }, b: {} } }], 0),
    ).toBeUndefined();
  });

  it("captures actual state immediately after a message delivery", () => {
    const initial: SimulationReport["states"] = { a: {}, b: {} };
    const snapshots: Snapshot[] = [{ at: 0, states: initial }];
    const report = executeScenario(
      {
        config: { ...config, dropRate: 0, minLatency: 5, maxLatency: 5 },
        steps: [{ at: 0, action: "put", replica: "a", key: "k", value: "v" }],
      },
      undefined,
      (event: TraceEntry, states: SimulationReport["states"]) => {
        snapshots.push({ at: event.time, states });
      },
    );
    const replay = createReplay(report, snapshots);
    expect(frameAt(replay, 0).states).toEqual({ a: { k: ["v"] }, b: {} });
    expect(frameAt(replay, 5).states).toEqual({
      a: { k: ["v"] },
      b: { k: ["v"] },
    });
  });

  it("puts the receiver before the Mermaid label separator", () => {
    const output = traceToMermaid([
      {
        sequence: 1,
        time: 5,
        kind: "delivered",
        from: "a",
        to: "b",
        operation: "a:1",
      },
    ]);
    expect(output).toContain("a->>b: deliver a:1 (t=5)");
  });

  it("rejects a dangling symbolic link without creating its target", () => {
    const dir = mkdtempSync(join(tmpdir(), "causal-g0-link-"));
    const target = join(dir, "not-created.sqlite");
    const link = join(dir, "link.sqlite");
    let catalog: ScenarioCatalog | undefined;
    try {
      symlinkSync(target, link);
      expect(() => {
        catalog = new ScenarioCatalog(link);
      }).toThrow(/symbolic link/);
      expect(existsSync(target)).toBe(false);
    } finally {
      catalog?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

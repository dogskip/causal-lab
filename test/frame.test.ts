import { describe, expect, it } from "vitest";
import { executeScenario, parseScenario, type SimulationReport, type TraceEntry } from "../web/core.js";
import {
  bandsAt,
  createReplay,
  differencesOf,
  frameAt,
  partitionBands,
  snapshotAt,
  type Snapshot,
} from "../web/frame.js";

const entry = (sequence: number, time: number, kind: TraceEntry["kind"], from?: string, to?: string): TraceEntry => ({
  sequence,
  time,
  kind,
  ...(from === undefined ? {} : { from }),
  ...(to === undefined ? {} : { to }),
});

const scenario = {
  config: {
    replicas: ["a", "b"],
    seed: 19,
    minLatency: 1,
    maxLatency: 1,
    dropRate: 0,
    duplicateRate: 0,
  },
  steps: [
    { at: 0, action: "partition", left: "a", right: "b" },
    { at: 1, action: "put", replica: "a", key: "mode", value: "safe" },
    { at: 1, action: "put", replica: "b", key: "mode", value: "fast" },
    { at: 5, action: "heal" },
  ],
};

function replayOf(): { replay: ReturnType<typeof createReplay>; report: SimulationReport } {
  const snapshots: Snapshot[] = [];
  const report = executeScenario(parseScenario(scenario), (step, states) => {
    snapshots.push({ at: step.at, states });
  });
  snapshots.push({ at: report.virtualTime, states: report.states });
  return { replay: createReplay(report, snapshots), report };
}

describe("partition bands", () => {
  it("returns nothing for a trace without partitions", () => {
    expect(partitionBands([])).toEqual([]);
    expect(partitionBands([entry(1, 0, "local", "a")])).toEqual([]);
  });

  it("closes a band at the heal that follows it", () => {
    const trace = [entry(1, 0, "partition", "a", "b"), entry(2, 4, "heal")];
    expect(partitionBands(trace)).toEqual([{ from: "a", to: "b", start: 0, end: 4 }]);
  });

  it("leaves a band open when no heal follows", () => {
    const trace = [entry(1, 2, "partition", "a", "b")];
    expect(partitionBands(trace)).toEqual([{ from: "a", to: "b", start: 2, end: null }]);
  });

  it("keeps one band per link while it stays partitioned", () => {
    const trace = [
      entry(1, 0, "partition", "a", "b"),
      entry(2, 1, "partition", "b", "a"),
      entry(3, 2, "heal"),
      entry(4, 3, "partition", "a", "b"),
    ];
    expect(partitionBands(trace)).toEqual([
      { from: "a", to: "b", start: 0, end: 2 },
      { from: "a", to: "b", start: 3, end: null },
    ]);
  });

  it("clips open bands and hides future bands at a given time", () => {
    const bands = partitionBands([entry(1, 4, "partition", "a", "b")]);
    expect(bandsAt(bands, 3)).toEqual([]);
    expect(bandsAt(bands, 9)).toEqual([{ from: "a", to: "b", start: 4, end: 9 }]);
  });
});

describe("snapshots", () => {
  const snapshots: Snapshot[] = [
    { at: 1, states: { a: {}, b: {} } },
    { at: 4, states: { a: { k: ["1"] }, b: { k: ["1"] } } },
  ];

  it("picks the latest snapshot at or before the time", () => {
    expect(snapshotAt(snapshots, 0)).toBeUndefined();
    expect(snapshotAt(snapshots, 1)).toBe(snapshots[0]);
    expect(snapshotAt(snapshots, 2)).toBe(snapshots[0]);
    expect(snapshotAt(snapshots, 4)).toBe(snapshots[1]);
    expect(snapshotAt(snapshots, 99)).toBe(snapshots[1]);
  });

  it("has nothing to pick from an empty list", () => {
    expect(snapshotAt([], 3)).toBeUndefined();
  });
});

describe("state differences", () => {
  it("marks a key that replicas share", () => {
    expect(differencesOf({ a: { k: ["1"] }, b: { k: ["1"] } })).toEqual([
      { key: "k", values: { a: ["1"], b: ["1"] }, agrees: true },
    ]);
  });

  it("marks a key that replicas hold differently, including a missing key", () => {
    const differences = differencesOf({ a: { k: ["1"], only: ["a"] }, b: { k: ["2"] } });
    expect(differences).toEqual([
      { key: "k", values: { a: ["1"], b: ["2"] }, agrees: false },
      { key: "only", values: { a: ["a"], b: [] }, agrees: false },
    ]);
  });

  it("treats replicas with equal states as agreeing", () => {
    expect(differencesOf({ a: { k: ["1", "2"] }, b: { k: ["1", "2"] } })[0]?.agrees).toBe(true);
  });
});

describe("replay frames", () => {
  it("reveals entries up to the playhead and reads the matching snapshot", () => {
    const { replay } = replayOf();
    const divergent = frameAt(replay, 1);
    const converged = frameAt(replay, replay.span[1]);

    expect(replay.span[0]).toBe(0);
    expect(divergent.time).toBe(1);
    expect(divergent.entries.every((item) => item.time <= 1)).toBe(true);
    expect(divergent.entries.length).toBeLessThan(converged.entries.length);
    expect(divergent.bands).toEqual([
      { from: "a", to: "b", start: 0, end: 1 },
    ]);
    expect(divergent.differences).toEqual([
      { key: "mode", values: { a: ["safe"], b: ["fast"] }, agrees: false },
    ]);
  });

  it("shows both concurrent values once the replicas have healed", () => {
    const { replay, report } = replayOf();
    const converged = frameAt(replay, replay.span[1]);
    expect(report.converged).toBe(true);
    expect(converged.differences).toEqual([
      { key: "mode", values: { a: ["fast", "safe"], b: ["fast", "safe"] }, agrees: true },
    ]);
  });

  it("renders an empty report without failing", () => {
    const report = executeScenario(
      parseScenario({ config: scenario.config, steps: [] }),
    );
    const replay = createReplay(report, []);
    const frame = frameAt(replay, 0);
    expect(frame.entries).toEqual([]);
    expect(frame.bands).toEqual([]);
    expect(frame.states).toEqual(report.states);
  });
});

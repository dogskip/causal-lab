import { linkKey, type SimulationReport, type TraceEntry } from "./core.js";

/** Per-replica states read at a step boundary. */
export type Snapshot = Readonly<{ at: number; states: SimulationReport["states"] }>;

/** A partition link, open from `start` until `end` (null while still open). */
export type Band = Readonly<{ from: string; to: string; start: number; end: number | null }>;

/** One key's values per replica, with whether every replica agrees on them. */
export type Difference = Readonly<{
  key: string;
  values: Readonly<Record<string, readonly string[]>>;
  agrees: boolean;
}>;

/** Everything one replay position needs: what to draw and what to compare. */
export type Frame = Readonly<{
  time: number;
  entries: readonly TraceEntry[];
  bands: readonly Band[];
  states: SimulationReport["states"];
  differences: readonly Difference[];
}>;

export type Replay = Readonly<{
  report: SimulationReport;
  snapshots: readonly Snapshot[];
  bands: readonly Band[];
  span: readonly [number, number];
}>;

export function createReplay(report: SimulationReport, snapshots: readonly Snapshot[]): Replay {
  let end = report.virtualTime;
  for (const entry of report.trace) {
    end = Math.max(end, entry.time);
  }
  return { report, snapshots, bands: partitionBands(report.trace), span: [0, end] };
}

/** Partition links with the window in which they were open. */
export function partitionBands(trace: readonly TraceEntry[]): readonly Band[] {
  const bands: Band[] = [];
  const open = new Map<string, number>();
  for (const entry of trace) {
    if (entry.kind === "partition" && entry.from !== undefined && entry.to !== undefined) {
      const key = linkKey(entry.from, entry.to);
      if (!open.has(key)) {
        open.set(key, bands.length);
        bands.push({ from: entry.from, to: entry.to, start: entry.time, end: null });
      }
    } else if (entry.kind === "heal") {
      for (const index of open.values()) {
        const band = bands[index];
        if (band !== undefined) {
          bands[index] = { ...band, end: entry.time };
        }
      }
      open.clear();
    }
  }
  return bands;
}

/** Bands already started at `time`, with an open end clamped to that time. */
export function bandsAt(bands: readonly Band[], time: number): readonly Band[] {
  return bands
    .filter((band) => band.start <= time)
    .map((band) => ({ ...band, end: band.end === null ? time : Math.min(band.end, time) }));
}

/** Whether a partition link is open at `time`. */
export function isPartitioned(bands: readonly Band[], time: number): boolean {
  return bands.some((band) => band.start <= time && (band.end === null || band.end > time));
}

/** The latest snapshot at or before `time`, or the first one when none qualifies. */
export function snapshotAt(snapshots: readonly Snapshot[], time: number): Snapshot | undefined {
  let found: Snapshot | undefined;
  for (const snapshot of snapshots) {
    if (snapshot.at <= time) {
      found = snapshot;
    }
  }
  return found ?? snapshots[0];
}

/** Per-key values across replicas, marking keys the replicas do not yet share. */
export function differencesOf(states: SimulationReport["states"]): readonly Difference[] {
  const replicas = Object.keys(states);
  const keys = new Set<string>();
  for (const state of Object.values(states)) {
    for (const key of Object.keys(state)) {
      keys.add(key);
    }
  }
  return [...keys].sort().map((key) => {
    const values: Record<string, readonly string[]> = {};
    for (const replica of replicas) {
      values[replica] = states[replica]?.[key] ?? [];
    }
    const distinct = new Set(Object.values(values).map((list) => JSON.stringify(list)));
    return { key, values, agrees: distinct.size <= 1 };
  });
}

export function frameAt(replay: Replay, time: number): Frame {
  const states = snapshotAt(replay.snapshots, time)?.states ?? replay.report.states;
  return {
    time,
    entries: replay.report.trace.filter((entry) => entry.time <= time),
    bands: bandsAt(replay.bands, time),
    states,
    differences: differencesOf(states),
  };
}

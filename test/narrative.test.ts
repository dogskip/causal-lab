import { describe, expect, it } from "vitest";
import { executeScenario, parseScenario, type SimulationReport } from "../web/core.js";
import { createReplay, type Replay, type Snapshot } from "../web/frame.js";
import { STORIES } from "../web/stories.js";
import { beatAt, statsUpTo } from "../web/narrative.js";

const scenario = {
  config: { replicas: ["a", "b"], seed: 19, minLatency: 1, maxLatency: 1, dropRate: 0, duplicateRate: 0 },
  steps: [
    { at: 0, action: "partition", left: "a", right: "b" },
    { at: 1, action: "put", replica: "a", key: "mode", value: "safe" },
    { at: 5, action: "heal" },
  ],
};

function replayOf(source: unknown): Replay {
  const snapshots: Snapshot[] = [];
  const report: SimulationReport = executeScenario(parseScenario(source), (step, states) => {
    snapshots.push({ at: step.at, states });
  });
  snapshots.push({ at: report.virtualTime, states: report.states });
  return createReplay(report, snapshots);
}

describe("run stats", () => {
  it("counts events by kind up to a point in time", () => {
    const replay = replayOf(scenario);
    const early = statsUpTo(replay.report.trace, 1);
    const late = statsUpTo(replay.report.trace, replay.span[1]);
    expect(early.local).toBe(1);
    expect(early.delivered).toBe(0);
    expect(late.local).toBe(1);
    expect(late.scheduled).toBeGreaterThan(early.scheduled);
    expect(late.delivered).toBeGreaterThanOrEqual(2);
  });

  it("counts nothing before the first event", () => {
    const replay = replayOf(scenario);
    expect(statsUpTo(replay.report.trace, -1)).toEqual({
      local: 0,
      scheduled: 0,
      delivered: 0,
      dropped: 0,
      held: 0,
    });
  });
});

describe("beats", () => {
  it("asks for a story when nothing has been run", () => {
    const empty = createReplay(executeScenario(parseScenario({ config: scenario.config, steps: [] })), []);
    expect(beatAt(empty, 0).phase).toBe("empty");
  });

  it("explains a partition as diverged and a healed run as converged", () => {
    const replay = replayOf(scenario);
    const diverged = beatAt(replay, 1);
    const converged = beatAt(replay, replay.span[1]);

    expect(diverged.phase).toBe("diverged");
    expect(diverged.headline).toContain("mode");
    expect(diverged.detail).toContain("분할");
    expect(converged.phase).toBe("converged");
    expect(converged.headline).toContain("같은 값");
  });

  it("reports agreement for every story once it ends", () => {
    for (const story of STORIES) {
      const replay = replayOf(story.scenario);
      const beat = beatAt(replay, replay.span[1]);
      expect(beat.phase, story.id).toBe("converged");
    }
  });
});

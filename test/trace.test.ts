import { describe, expect, it } from "vitest";
import { Simulation, type TraceEntry } from "../src/simulation.js";
import { executeScenario, parseScenario } from "../src/scenario.js";
import { traceToMermaid } from "../src/trace.js";

describe("traceToMermaid", () => {
  it("emits a valid sequenceDiagram header with sorted participants", () => {
    const trace: TraceEntry[] = [
      { sequence: 1, time: 0, kind: "partition", from: "b", to: "a" },
      { sequence: 2, time: 1, kind: "local", from: "a", operation: "a:1" },
    ];
    const out = traceToMermaid(trace);
    const lines = out.split("\n");
    expect(lines[0]).toBe("sequenceDiagram");
    expect(lines[1]).toBe("participant a");
    expect(lines[2]).toBe("participant b");
  });

  it("maps every trace kind to a mermaid line", () => {
    const trace: TraceEntry[] = [
      { sequence: 1, time: 0, kind: "local", from: "a", operation: "a:1" },
      { sequence: 2, time: 0, kind: "scheduled", from: "a", to: "b", operation: "a:1" },
      { sequence: 3, time: 0, kind: "dropped", from: "a", to: "b", operation: "a:1" },
      { sequence: 4, time: 1, kind: "partition", from: "a", to: "b" },
      { sequence: 5, time: 2, kind: "held", from: "a", to: "b", operation: "a:1" },
      { sequence: 6, time: 3, kind: "heal" },
      { sequence: 7, time: 3, kind: "delivered", from: "a", to: "b", operation: "a:1" },
    ];
    const out = traceToMermaid(trace);
    expect(out).toContain("Note over a: local a:1 (t=0)");
    expect(out).toContain("a ->> schedule a:1 (t=0): b");
    expect(out).toContain("a --x drop a:1 (t=0): b");
    expect(out).toContain("Note over a: partition a<->b (t=1)");
    expect(out).toContain("a --) hold a:1 (t=2): b");
    expect(out).toContain("Note over system: heal (t=3)");
    expect(out).toContain("a ->> deliver a:1 (t=3): b");
  });

  it("is deterministic: same trace yields byte-identical output", () => {
    const sim = new Simulation({
      replicas: ["a", "b"],
      seed: 19,
      minLatency: 1,
      maxLatency: 3,
      dropRate: 0.25,
      duplicateRate: 0.5,
    });
    sim.put("a", "mode", "safe");
    sim.runUntilIdle();
    const trace = sim.report().trace;
    const first = traceToMermaid(trace);
    const second = traceToMermaid(trace);
    expect(second).toBe(first);
  });

  it("renders the README quickstart scenario end-to-end", () => {
    const report = executeScenario(
      parseScenario({
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
      }),
    );
    const mermaid = traceToMermaid(report.trace);
    expect(mermaid.split("\n")[0]).toBe("sequenceDiagram");
    expect(mermaid).toContain("partition a<->b");
    expect(mermaid).toContain("heal");
    expect(report.converged).toBe(true);
  });
});

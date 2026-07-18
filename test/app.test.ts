import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("scenario API", () => {
  it("runs a bounded scenario and returns a convergence report", async () => {
    const app = createApp();
    const response = await app.request("/v1/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
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
    });

    expect(response.status).toBe(200);
    const report = (await response.json()) as { converged: boolean; trace: unknown[] };
    expect(report.converged).toBe(true);
    expect(report.trace.length).toBeGreaterThan(0);
  });

  it("rejects unknown scenario fields", async () => {
    const app = createApp();
    const response = await app.request("/v1/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config: {}, steps: [], executable: "rm -rf /" }),
    });
    expect(response.status).toBe(422);
  });
});

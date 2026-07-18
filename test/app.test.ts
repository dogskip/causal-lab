import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { ScenarioCatalog } from "../src/catalog.js";

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

  it("stores, runs, and reads a content-addressed scenario when a catalog is configured", async () => {
    const catalog = new ScenarioCatalog(":memory:");
    const app = createApp(catalog);
    const created = await app.request("/v1/scenarios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sampleScenario()),
    });
    expect(created.status).toBe(201);
    const reference = (await created.json()) as { id: string };

    const fetched = await app.request(`/v1/scenarios/${reference.id}`);
    expect(fetched.status).toBe(200);

    const executed = await app.request(`/v1/scenarios/${reference.id}/runs`, { method: "POST" });
    expect(executed.status).toBe(201);
    const run = (await executed.json()) as { id: string; traceSha256: string };
    expect(run.traceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await app.request(`/v1/runs/${run.id}`)).status).toBe(200);
    catalog.close();
  });

  it("does not catalog a scenario that fails semantic simulation validation", async () => {
    const catalog = new ScenarioCatalog(":memory:");
    const app = createApp(catalog);
    const invalid = sampleScenario() as {
      config: { replicas: string[] };
      steps: Array<Record<string, unknown>>;
    };
    invalid.steps = [{ at: 0, action: "put", replica: "missing", key: "mode", value: "safe" }];

    const response = await app.request("/v1/scenarios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(invalid),
    });
    expect(response.status).toBe(422);
    catalog.close();
  });
});

function sampleScenario(): unknown {
  return {
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
  };
}

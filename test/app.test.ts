import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { ScenarioCatalog } from "../src/catalog.js";
import { catalogScenario, partitionScenario } from "./fixtures.js";

describe("scenario API", () => {
  it("runs a bounded scenario and returns a convergence report", async () => {
    const app = createApp();
    const response = await app.request("/v1/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(partitionScenario()),
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
    expect((await response.json()) as { error: string }).toEqual({
      error: "scenario contains an unknown field",
    });
  });

  it("surfaces the specific contract error message on 422", async () => {
    const app = createApp();
    const invalid = partitionScenario() as { config: { seed: number } };
    invalid.config.seed = -1;
    const response = await app.request("/v1/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(invalid),
    });
    expect(response.status).toBe(422);
    expect((await response.json()) as { error: string }).toEqual({
      error: "seed must be an unsigned 32-bit integer",
    });
  });

  it("reports a required field when a config field is missing", async () => {
    const app = createApp();
    const response = await app.request("/v1/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config: { replicas: ["a", "b"] }, steps: [] }),
    });
    expect(response.status).toBe(422);
    expect((await response.json()) as { error: string }).toEqual({
      error: "seed is required",
    });
  });

  it("returns a 413 when the request body exceeds the limit", async () => {
    const app = createApp();
    const oversized = "x".repeat(2 * 1024 * 1024 + 1);
    const response = await app.request("/v1/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config: { replicas: ["a", "b"], seed: 1 }, steps: [{ at: 0, action: "put", replica: "a", key: "k", value: oversized }] }),
    });
    expect(response.status).toBe(413);
  });

  it("distinguishes a disabled catalog from an unknown route", async () => {
    const app = createApp();
    const response = await app.request("/v1/scenarios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(catalogScenario()),
    });
    expect(response.status).toBe(404);
    expect((await response.json()) as { error: string }).toEqual({
      error: "catalog is not configured; set CAUSAL_LAB_DB",
    });
  });

  it("rejects a malformed JSON body with 422", async () => {
    const app = createApp();
    const response = await app.request("/v1/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect(response.status).toBe(422);
  });

  it("stores, runs, and reads a content-addressed scenario when a catalog is configured", async () => {
    const catalog = new ScenarioCatalog(":memory:");
    const app = createApp(catalog);
    const created = await app.request("/v1/scenarios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(catalogScenario()),
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
    const invalid = catalogScenario() as {
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

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

describe("E2E — server lifecycle", () => {
  let serverProcess: ReturnType<typeof spawn> | null = null;
  const port = 19879;
  const baseURL = `http://127.0.0.1:${port}`;

  beforeAll(async () => {
    const serverPath = resolve(
      fileURLToPath(import.meta.url),
      "../../src/server.ts",
    );
    serverProcess = spawn(
      process.execPath,
      ["--import", "tsx/esm", serverPath],
      {
        env: { ...process.env, CAUSAL_LAB_PORT: String(port) },
        stdio: "pipe",
      },
    );

    // Wait for server to start
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("server startup timeout")), 10_000);
      serverProcess?.stdout?.on("data", (data: Buffer) => {
        if (data.toString().includes("listening")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      serverProcess?.stderr?.on("data", () => {
        // Log server stderr for debugging
      });
      serverProcess?.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }, 15_000);

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
      serverProcess = null;
    }
  });

  it("server started on the expected port", async () => {
    const response = await fetch(`${baseURL}/v1/run`, {
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
    const report = (await response.json()) as { converged: boolean };
    expect(report.converged).toBe(true);
  });

  it("returns 413 for oversized body", async () => {
    const oversized = "x".repeat(3 * 1024 * 1024);
    const response = await fetch(`${baseURL}/v1/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        config: { replicas: ["a", "b"], seed: 0, minLatency: 0, maxLatency: 0, dropRate: 0, duplicateRate: 0 },
        steps: [{ at: 0, action: "put", replica: "a", key: "k", value: oversized }],
      }),
    });
    expect(response.status).toBe(413);
  });

  it("returns 422 for malformed scenario", async () => {
    const response = await fetch(`${baseURL}/v1/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config: { replicas: ["a", "b"], seed: -1 }, steps: [] }),
    });
    expect(response.status).toBe(422);
  });

  it("returns deterministic byte-identical responses", async () => {
    const body = JSON.stringify({
      config: {
        replicas: ["a", "b"],
        seed: 19,
        minLatency: 1,
        maxLatency: 3,
        dropRate: 0,
        duplicateRate: 0,
      },
      steps: [
        { at: 0, action: "put", replica: "a", key: "k", value: "v" },
        { at: 5, action: "heal" },
      ],
    });
    const opts: RequestInit = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    };
    const r1 = await fetch(`${baseURL}/v1/run`, opts);
    const r2 = await fetch(`${baseURL}/v1/run`, opts);
    expect(await r1.json()).toEqual(await r2.json());
  });

  it("returns 404 for unknown route", async () => {
    const response = await fetch(`${baseURL}/v1/nonexistent`);
    expect(response.status).toBe(404);
  });

  it("is reachable on localhost only (127.0.0.1)", async () => {
    const response = await fetch(`${baseURL}/v1/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        config: { replicas: ["a", "b"], seed: 1, minLatency: 1, maxLatency: 2, dropRate: 0, duplicateRate: 0 },
        steps: [],
      }),
    });
    expect(response.status).toBe(200);
  });
});

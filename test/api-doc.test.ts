import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guards docs/openapi.json and the JSON Schemas against drift from the actual
 * routes and limits. If a route is added/removed in src/app.ts without a matching
 * OpenAPI entry, or a limit constant changes without a schema update, this fails.
 */

const openApiText = readFileSync(new URL("../docs/openapi.json", import.meta.url), "utf8");
const openApi = JSON.parse(openApiText) as { openapi: string; paths: Record<string, Record<string, unknown>> };
const scenarioSchemaText = readFileSync(
  new URL("../schema/scenario.schema.json", import.meta.url),
  "utf8",
);
const reportSchemaText = readFileSync(new URL("../schema/report.schema.json", import.meta.url), "utf8");

const appText = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const simulationText = readFileSync(new URL("../src/simulation.ts", import.meta.url), "utf8");
const crdtText = readFileSync(new URL("../src/crdt.ts", import.meta.url), "utf8");
const scenarioText = readFileSync(new URL("../src/scenario.ts", import.meta.url), "utf8");

describe("OpenAPI document", () => {
  it("is valid JSON with the expected top-level structure", () => {
    expect(openApi.openapi).toBe("3.1.0");
    expect(openApi.paths).toBeTypeOf("object");
  });

  it("documents every route registered in app.ts", () => {
    // Extract route paths from app.post("/v1/...", ...) and app.get("/v1/...", ...).
    // app.on(["POST","GET"], "/v1/scenarios/*", ...) is a catalog-disabled fallback
    // that shadows the documented /v1/scenarios/:id routes; skip wildcard routes.
    const routePattern = /app\.(post|get)\(\s*"([^"]+)"/g;
    const routes = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = routePattern.exec(appText)) !== null) {
      const method = match[1] ?? "";
      const rawPath = match[2] ?? "";
      if (rawPath.endsWith("/*")) continue;
      const path = rawPath
        .replace("/:id", "/{id}")
        .replace("/:id/runs", "/{id}/runs");
      routes.add(`${method.toUpperCase()} ${path}`);
    }
    for (const route of routes) {
      const [method, path] = route.split(" ");
      if (method === undefined || path === undefined) continue;
      const pathItem = openApi.paths[path];
      expect(pathItem, `route ${route} not in OpenAPI`).toBeDefined();
      const lowerMethod = method.toLowerCase();
      expect(pathItem, `method ${method} not documented for ${path}`).toHaveProperty(lowerMethod);
    }
  });

  it("documents the catalog-disabled and limit behavior", () => {
    expect(openApiText).toContain("CAUSAL_LAB_DB");
    expect(openApiText).toContain("2 MiB");
  });
});

describe("JSON Schemas", () => {
  it("scenario schema reflects the enforced limits", () => {
    expect(scenarioSchemaText).toContain('"maxItems": 12'); // replicas
    expect(scenarioSchemaText).toContain('"maxItems": 1000'); // steps
    expect(scenarioSchemaText).toContain('"maxLength": 128'); // identifiers
    expect(scenarioSchemaText).toContain('"maxLength": 4096'); // values
    expect(scenarioSchemaText).toContain('"maximum": 4294967295'); // seed
  });

  it("report schema reflects the event cap and trace kinds", () => {
    expect(reportSchemaText).toContain('"maximum": 10000');
    expect(reportSchemaText).toContain("local");
    expect(reportSchemaText).toContain("delivered");
    expect(reportSchemaText).toContain("partition");
    expect(reportSchemaText).toContain("heal");
  });

  it("scenario schema actions match the code's action union", () => {
    for (const action of ["put", "remove", "partition", "heal"]) {
      expect(scenarioSchemaText).toContain(`"const": "${action}"`);
    }
  });
});

describe("source limits stay in sync with schemas", () => {
  it("MAX_REPLICAS, MAX_EVENTS, MAX_STEPS, byte caps are unchanged", () => {
    expect(simulationText).toMatch(/MAX_REPLICAS\s*=\s*12/);
    expect(simulationText).toMatch(/MAX_EVENTS\s*=\s*10_000/);
    expect(scenarioText).toMatch(/MAX_STEPS\s*=\s*1_000/);
    expect(crdtText).toMatch(/MAX_IDENTIFIER_BYTES\s*=\s*128/);
    expect(crdtText).toMatch(/MAX_VALUE_BYTES\s*=\s*4\s*\*\s*1024/);
  });
});

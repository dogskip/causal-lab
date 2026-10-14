import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { ScenarioCatalog } from "../src/catalog.js";
import { catalogScenario } from "./fixtures.js";
import { parseScenario } from "../src/scenario.js";

const scenarioSchema: unknown = JSON.parse(
  readFileSync(
    new URL("../schema/scenario.schema.json", import.meta.url),
    "utf8",
  ),
);
const reportSchema: unknown = JSON.parse(
  readFileSync(
    new URL("../schema/report.schema.json", import.meta.url),
    "utf8",
  ),
);
const api = JSON.parse(
  readFileSync(new URL("../docs/openapi.json", import.meta.url), "utf8"),
) as { components: { schemas: Record<string, unknown> } };
const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addKeyword({
  keyword: "x-maxUtf8Bytes",
  type: "string",
  schemaType: "number",
  validate: (limit: number, value: string) =>
    Buffer.byteLength(value, "utf8") <= limit,
});
const base = "https://causal-lab.test/docs/openapi.json";
ajv.addSchema(
  scenarioSchema as object,
  "https://causal-lab.test/schema/scenario.schema.json",
);
ajv.addSchema(
  reportSchema as object,
  "https://causal-lab.test/schema/report.schema.json",
);
const defs = JSON.parse(
  JSON.stringify(api.components.schemas).replaceAll(
    "#/components/schemas/",
    "#/$defs/",
  ),
) as object;
ajv.addSchema({ $id: base, $defs: defs });
const validate = (name: string, input: unknown): boolean =>
  ajv.compile({ $ref: `${base}#/$defs/${name}` })(input);

describe("actual HTTP and documented schema contract", () => {
  it("accepts actual stored scenario and run responses with no contradictory allOf restriction", async () => {
    const catalog = new ScenarioCatalog(":memory:");
    try {
      const app = createApp(catalog);
      const referenceResponse = await app.request("/v1/scenarios", {
        method: "POST",
        body: JSON.stringify(catalogScenario()),
        headers: { "content-type": "application/json" },
      });
      const reference = (await referenceResponse.json()) as { id: string };
      expect(validate("ScenarioReference", reference)).toBe(true);
      const stored = await app.request(`/v1/scenarios/${reference.id}`);
      expect(stored.status).toBe(200);
      expect(validate("StoredScenario", await stored.json())).toBe(true);
      const run = await app.request(`/v1/scenarios/${reference.id}/runs`, {
        method: "POST",
      });
      expect(run.status).toBe(201);
      expect(validate("StoredRun", await run.json())).toBe(true);
    } finally {
      catalog.close();
    }
  });

  it("enforces the documented UTF-8 value cap as well as character length", async () => {
    const source = parseScenario(catalogScenario());
    const scenario = {
      config: source.config,
      steps: [
        {
          at: 0,
          action: "put",
          replica: source.config.replicas[0],
          key: "k",
          value: "한".repeat(2_000),
        },
      ],
    };
    const response = await createApp().request("/v1/run", {
      method: "POST",
      body: JSON.stringify(scenario),
      headers: { "content-type": "application/json" },
    });
    expect(response.status).toBe(422);
    expect(validate("Scenario", scenario)).toBe(false);
    const valid = {
      ...scenario,
      steps: [{ ...scenario.steps[0], value: "한".repeat(1_365) }],
    };
    expect(validate("Scenario", valid)).toBe(true);
  });

  it("executes an actual internal failure and returns only the documented safe error", async () => {
    const catalog = new ScenarioCatalog(":memory:");
    const app = createApp(catalog);
    catalog.close();
    const response = await app.request(`/v1/scenarios/${"a".repeat(64)}`);
    expect(response.status).toBe(500);
    const error: unknown = await response.json();
    expect(validate("Error", error)).toBe(true);
    expect(error).toEqual({ error: "simulation failed" });
  });
});

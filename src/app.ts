import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ScenarioCatalog } from "./catalog.js";
import { ContractError } from "./crdt.js";
import { executeScenario, parseScenario } from "./scenario.js";

export const MAX_HTTP_BODY_BYTES = 2 * 1024 * 1024;

export function createApp(catalog?: ScenarioCatalog): Hono {
  const app = new Hono();
  app.post(
    "/v1/run",
    bodyLimit({
      maxSize: MAX_HTTP_BODY_BYTES,
      onError: (context) => context.json({ error: "request body is too large" }, 413),
    }),
    async (context) => {
      try {
        return context.json(executeScenario(parseScenario(await context.req.json<unknown>())));
      } catch (error) {
        if (error instanceof ContractError || error instanceof SyntaxError) {
          return context.json({ error: "scenario violates the simulation contract" }, 422);
        }
        throw error;
      }
    },
  );

  if (catalog !== undefined) {
    app.post(
      "/v1/scenarios",
      bodyLimit({
        maxSize: MAX_HTTP_BODY_BYTES,
        onError: (context) => context.json({ error: "request body is too large" }, 413),
      }),
      async (context) => {
        try {
          const stored = catalog.putScenario(parseScenario(await context.req.json<unknown>()));
          return context.json(stored, 201);
        } catch (error) {
          if (error instanceof ContractError || error instanceof SyntaxError) {
            return context.json({ error: "scenario violates the simulation contract" }, 422);
          }
          throw error;
        }
      },
    );
    app.get("/v1/scenarios/:id", (context) => {
      const scenario = catalog.getScenario(context.req.param("id"));
      return scenario === undefined
        ? context.json({ error: "scenario was not found" }, 404)
        : context.json(scenario);
    });
    app.post("/v1/scenarios/:id/runs", (context) => {
      const scenario = catalog.getScenario(context.req.param("id"));
      if (scenario === undefined) {
        return context.json({ error: "scenario was not found" }, 404);
      }
      return context.json(catalog.putRun(scenario.id, executeScenario(scenario.scenario)), 201);
    });
    app.get("/v1/runs/:id", (context) => {
      const run = catalog.getRun(context.req.param("id"));
      return run === undefined
        ? context.json({ error: "run was not found" }, 404)
        : context.json(run);
    });
  }

  app.notFound((context) => context.json({ error: "route was not found" }, 404));
  app.onError((_error, context) => context.json({ error: "simulation failed" }, 500));
  return app;
}

import { Hono, type Context, type Handler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { CatalogError, type ScenarioCatalog } from "./catalog.js";
import { ContractError } from "./crdt.js";
import { executeScenario, parseScenario } from "./scenario.js";

export const MAX_HTTP_BODY_BYTES = 2 * 1024 * 1024;

const bodyLimitMiddleware = bodyLimit({
  maxSize: MAX_HTTP_BODY_BYTES,
  onError: (context) => context.json({ error: "request body is too large" }, 413),
});

/**
 * Wraps a route handler so a `ContractError` (simulation contract violation) or a
 * `SyntaxError` (malformed JSON body) maps to 422 with the specific, safe message.
 * The threat model sanctions reporting contract errors; messages never carry
 * paths, env vars, or stack traces (audited across all throw sites).
 */
function contractRoute(handler: (context: Context) => Promise<Response> | Response): Handler {
  return async (context) => {
    try {
      return await handler(context);
    } catch (error) {
      if (error instanceof ContractError || error instanceof SyntaxError) {
        return context.json({ error: error.message }, 422);
      }
      throw error;
    }
  };
}

export function createApp(catalog?: ScenarioCatalog): Hono {
  const app = new Hono();

  app.post(
    "/v1/run",
    bodyLimitMiddleware,
    contractRoute(async (context) => context.json(executeScenario(parseScenario(await context.req.json<unknown>())))),
  );

  if (catalog !== undefined) {
    app.post(
      "/v1/scenarios",
      bodyLimitMiddleware,
      contractRoute(async (context) =>
        context.json(catalog.putScenario(parseScenario(await context.req.json<unknown>())), 201),
      ),
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
  } else {
    // Distinguish "catalog not configured" from "unknown route/id" so a beginner
    // enabling CAUSAL_LAB_DB against the wrong port gets an actionable message.
    app.on(["POST", "GET"], "/v1/scenarios/*", (context) =>
      context.json({ error: "catalog is not configured; set CAUSAL_LAB_DB" }, 404),
    );
    app.on(["GET"], "/v1/runs/*", (context) =>
      context.json({ error: "catalog is not configured; set CAUSAL_LAB_DB" }, 404),
    );
  }

  app.notFound((context) => context.json({ error: "route was not found" }, 404));
  app.onError((error, context) => {
    if (error instanceof CatalogError) {
      return context.json({ error: "catalog failure", code: error.code }, 500);
    }
    return context.json({ error: "simulation failed" }, 500);
  });
  return app;
}

#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { ScenarioCatalog } from "./catalog.js";

const hostname = process.env.CAUSAL_LAB_HOST ?? "127.0.0.1";
const port = Number(process.env.CAUSAL_LAB_PORT ?? "8787");

if (!["127.0.0.1", "::1"].includes(hostname)) {
  console.error("CAUSAL_LAB_HOST must be 127.0.0.1 or ::1");
  process.exit(2);
}
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  console.error("CAUSAL_LAB_PORT must be an integer between 1 and 65535");
  process.exit(2);
}

const databasePath = process.env.CAUSAL_LAB_DB;
const catalog = databasePath === undefined ? undefined : new ScenarioCatalog(databasePath);
const server = serve({ fetch: createApp(catalog).fetch, hostname, port });
console.log(`causal-lab listening on http://${hostname}:${port}`);

const shutdown = (): void => {
  server.close((error) => {
    catalog?.close();
    if (error !== undefined) {
      console.error("causal-lab shutdown failed");
      process.exitCode = 1;
    }
  });
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

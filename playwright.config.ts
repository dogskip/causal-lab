import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile:
          ".planning/evidence/implementation-2026-10-14/browser-results.json",
      },
    ],
  ],
  outputDir: ".planning/evidence/implementation-2026-10-14/browser",
  use: {
    baseURL: "http://127.0.0.1:48123",
    headless: true,
    ...(process.env.CI ? {} : { channel: "chrome" }),
    screenshot: "on",
    trace: "on",
  },
  webServer: {
    command: "node --import tsx e2e/server.ts",
    url: "http://127.0.0.1:48123",
    reuseExistingServer: false,
  },
});

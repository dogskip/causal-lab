import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("opens a validated bundle without a file picker", async ({ page }) => {
  const directory = mkdtempSync(join(tmpdir(), "crdt-open-e2e-"));
  const generated = spawnSync(
    process.execPath,
    [
      "dist/cli/main.js",
      "run",
      "--target",
      "or-map",
      "--out",
      directory,
      "--json",
    ],
    { cwd: resolve("."), encoding: "utf8", timeout: 30_000 },
  );
  expect(generated.status, generated.stderr).toBe(0);
  const bundle = readdirSync(directory).find((name) =>
    name.endsWith(".bundle.json"),
  )!;
  const child = spawn(
    process.execPath,
    [
      "dist/cli/main.js",
      "open",
      join(directory, bundle),
      "--no-open",
      "--json",
    ],
    { cwd: resolve("."), stdio: ["ignore", "pipe", "pipe"] },
  );
  try {
    const info = await new Promise<{ url: string; run_id: string }>(
      (done, reject) => {
        let output = "";
        const timer = setTimeout(
          () => reject(new Error("viewer did not start")),
          15_000,
        );
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
          output += chunk;
          const line = output.split("\n")[0];
          if (line !== undefined && line.startsWith("{")) {
            clearTimeout(timer);
            done(JSON.parse(line) as { url: string; run_id: string });
          }
        });
        child.once("exit", (code) =>
          reject(new Error("viewer exited with " + String(code))),
        );
      },
    );
    await page.goto(info.url);
    await expect(page.locator("#verification-result")).toBeVisible();
    await expect(page.locator("#verification-status")).toHaveText("통과");
    await expect(page.locator("#verification-info")).toContainText(info.run_id);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
  }
});

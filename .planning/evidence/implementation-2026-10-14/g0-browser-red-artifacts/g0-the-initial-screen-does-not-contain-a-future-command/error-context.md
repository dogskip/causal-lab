# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: g0.spec.ts >> the initial screen does not contain a future command
- Location: e2e/g0.spec.ts:29:1

# Error details

```
Error: expect(locator).not.toContainText(expected) failed

Locator: locator('#state-table')
Expected substring: not "later"
Received string: "keyabfuture ≠later—"
Timeout: 5000ms

Call log:
  - Expect "not toContainText" locator('#state-table') with timeout 5000ms
  - waiting for locator('#state-table')
    14 × locator resolved to <table border="1" cellspacing="0" cellpadding="4" id="state-table">…</table>
       - unexpected value "keyabfuture ≠later—"

```

```yaml
- table:
  - rowgroup:
    - row "key a b":
      - cell "key"
      - cell "a"
      - cell "b"
  - rowgroup:
    - row "future ≠ later —":
      - cell "future ≠"
      - cell "later"
      - cell "—"
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | import type { Mermaid } from "mermaid";
  3  | import { traceToMermaid } from "../src/trace.js";
  4  | 
  5  | const config = { replicas: ["a", "b"], seed: 19, minLatency: 5, maxLatency: 5, dropRate: 0, duplicateRate: 0 };
  6  | const consoleErrors = new WeakMap<object, string[]>();
  7  | test.beforeEach(async ({ page }) => {
  8  |   const errors: string[] = [];
  9  |   consoleErrors.set(page, errors);
  10 |   page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  11 |   page.on("pageerror", (error) => { errors.push(error.message); });
  12 |   await page.goto("/");
  13 |   await expect(page.locator("#stories button")).toHaveCount(6);
  14 |   await page.locator("#editor").evaluate((node) => { (node as HTMLDetailsElement).open = true; });
  15 |   test.info().annotations.push({ type: "headless", description: "true; Playwright CLI" });
  16 | });
  17 | test.afterEach(async ({ page }) => { expect(consoleErrors.get(page)).toEqual([]); });
  18 | 
  19 | test("state follows the actual delivery at time five", async ({ page }) => {
  20 |   await page.locator("#file-input").setInputFiles({ name: "delivery.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ config, steps: [{ at: 0, action: "put", replica: "a", key: "k", value: "v" }, { at: 10, action: "heal" }] })) });
  21 |   await expect(page.locator("#clock")).toHaveText("t=15");
  22 |   await page.locator("#scrub").evaluate((node) => { (node as HTMLInputElement).value = "5"; node.dispatchEvent(new Event("input", { bubbles: true })); });
  23 |   await expect(page.locator("#clock")).toHaveText("t=5");
  24 |   const row = page.locator("#state-table tr").nth(1);
  25 |   await expect(row.locator("td")).toHaveText(["k", "v", "v"]);
  26 |   await page.screenshot({ path: test.info().outputPath("delivery-state.png"), fullPage: true });
  27 | });
  28 | 
  29 | test("the initial screen does not contain a future command", async ({ page }) => {
  30 |   await page.locator("#file-input").setInputFiles({ name: "future.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ config, steps: [{ at: 10, action: "put", replica: "a", key: "future", value: "later" }] })) });
  31 |   await expect(page.locator("#clock")).toHaveText("t=15");
  32 |   await page.locator("#restart").click();
  33 |   await expect(page.locator("#clock")).toHaveText("t=0");
> 34 |   await expect(page.locator("#state-table")).not.toContainText("later");
     |                                                  ^ Error: expect(locator).not.toContainText(expected) failed
  35 |   await page.screenshot({ path: test.info().outputPath("initial-state.png"), fullPage: true });
  36 | });
  37 | 
  38 | test("reserved replica names are visible and different values remain different", async ({ page }) => {
  39 |   await page.locator("#file-input").setInputFiles({ name: "membership.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ config: { ...config, replicas: ["__proto__", "b"], dropRate: 1 }, steps: [{ at: 0, action: "put", replica: "__proto__", key: "k", value: "left" }, { at: 0, action: "put", replica: "b", key: "k", value: "right" }] })) });
  40 |   await expect(page.locator("#state-table tr").first().locator("td")).toHaveText(["key", "__proto__", "b"]);
  41 |   await expect(page.locator("#state-table")).toContainText("left");
  42 |   await expect(page.locator("#state-table")).toContainText("right");
  43 |   await expect(page.locator("#verdict")).toContainText("미수렴");
  44 | });
  45 | 
  46 | test("the real Mermaid parser preserves sender and receiver", async ({ page }) => {
  47 |   const source = traceToMermaid([{ sequence: 1, time: 5, kind: "delivered", from: "a", to: "b", operation: "a:1" }]);
  48 |   const messages = await page.evaluate(async (text) => {
  49 |     const path = "/__mermaid/mermaid.esm.min.mjs";
  50 |     const module = await import(path) as { default: Mermaid };
  51 |     module.default.initialize({ startOnLoad: false, securityLevel: "strict" });
  52 |     const diagram = await module.default.mermaidAPI.getDiagramFromText(text);
  53 |     const db = diagram.db as { getMessages(): { from: string; to: string; message: string }[] };
  54 |     return db.getMessages().map(({ from, to, message }) => ({ from, to, message }));
  55 |   }, source);
  56 |   expect(messages).toEqual([{ from: "a", to: "b", message: "deliver a:1 (t=5)" }]);
  57 | });
  58 | 
```
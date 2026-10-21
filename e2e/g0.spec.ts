import { expect, test } from "@playwright/test";
import { traceToMermaid } from "../src/trace.js";

const config = {
  replicas: ["a", "b"],
  seed: 19,
  minLatency: 5,
  maxLatency: 5,
  dropRate: 0,
  duplicateRate: 0,
};
const consoleErrors = new WeakMap<object, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  consoleErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await page.goto("/ko/index.html");
  await expect(page.locator("#stories button")).toHaveCount(6);
  await page.locator("#editor").evaluate((node) => {
    (node as HTMLDetailsElement).open = true;
  });
  test
    .info()
    .annotations.push({
      type: "headless",
      description: "true; Playwright CLI",
    });
});
test.afterEach(({ page }) => {
  expect(consoleErrors.get(page)).toEqual([]);
});

test("state follows the actual delivery at time five", async ({ page }) => {
  await page.locator("#file-input").setInputFiles({
    name: "delivery.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        config,
        steps: [
          { at: 0, action: "put", replica: "a", key: "k", value: "v" },
          { at: 10, action: "heal" },
        ],
      }),
    ),
  });
  await expect(page.locator("#clock")).toHaveText("t=15");
  await page.locator("#scrub").evaluate((node) => {
    (node as HTMLInputElement).value = "5";
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#clock")).toHaveText("t=5");
  const row = page.locator("#state-table tr").nth(1);
  await expect(row.locator("td")).toHaveText(["k", "v", "v"]);
  await page.screenshot({
    path: test.info().outputPath("delivery-state.png"),
    fullPage: true,
  });
});

test("the initial screen does not contain a future command", async ({
  page,
}) => {
  await page
    .locator("#file-input")
    .setInputFiles({
      name: "future.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          config,
          steps: [
            {
              at: 10,
              action: "put",
              replica: "a",
              key: "future",
              value: "later",
            },
          ],
        }),
      ),
    });
  await expect(page.locator("#clock")).toHaveText("t=15");
  await page.locator("#restart").click();
  await expect(page.locator("#clock")).toHaveText("t=0");
  await expect(page.locator("#state-table")).not.toContainText("later");
  await page.screenshot({
    path: test.info().outputPath("initial-state.png"),
    fullPage: true,
  });
});

test("reserved replica names are visible and different values remain different", async ({
  page,
}) => {
  await page.locator("#file-input").setInputFiles({
    name: "membership.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        config: { ...config, replicas: ["__proto__", "b"], dropRate: 1 },
        steps: [
          {
            at: 0,
            action: "put",
            replica: "__proto__",
            key: "k",
            value: "left",
          },
          { at: 0, action: "put", replica: "b", key: "k", value: "right" },
        ],
      }),
    ),
  });
  await expect(
    page.locator("#state-table tr").first().locator("td"),
  ).toHaveText(["key", "__proto__", "b"]);
  await expect(page.locator("#state-table")).toContainText("left");
  await expect(page.locator("#state-table")).toContainText("right");
  await expect(page.locator("#verdict")).toContainText("미수렴");
});

test("the real Mermaid parser preserves sender and receiver", async ({
  page,
}) => {
  const source = traceToMermaid([
    {
      sequence: 1,
      time: 5,
      kind: "delivered",
      from: "a",
      to: "b",
      operation: "a:1",
    },
  ]);
  const messages = await page.evaluate(async (text) => {
    const path = "/__mermaid/mermaid.esm.min.mjs";
    const module = (await import(path)) as {
      default: {
        initialize(config: {
          startOnLoad: boolean;
          securityLevel: string;
        }): void;
        mermaidAPI: {
          getDiagramFromText(text: string): Promise<{ db: unknown }>;
        };
      };
    };
    module.default.initialize({ startOnLoad: false, securityLevel: "strict" });
    const diagram = await module.default.mermaidAPI.getDiagramFromText(text);
    const db = diagram.db as {
      getMessages(): { from: string; to: string; message: string }[];
    };
    return db
      .getMessages()
      .map(({ from, to, message }) => ({ from, to, message }));
  }, source);
  expect(messages).toEqual([
    { from: "a", to: "b", message: "deliver a:1 (t=5)" },
  ]);
});

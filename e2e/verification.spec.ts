import { expect, test } from "@playwright/test";
import { createBuiltinContext } from "../src/node/registry.js";
import { executeVerification } from "../src/verify/runtime.js";
import { jcs } from "../src/verify/json.js";
function fixture(mode = "passed") {
  const definition = {
    format_version: 2,
    model_id: "yjs-map",
    profile: "independent-updates",
    replicas: ["a", "b"],
    bootstrap: {
      a: { clientID: 1, guid: "ui", values: { start: "initial" } },
      b: { clientID: 2, guid: "ui", values: {} },
    },
    seed: 9,
    network: { minLatency: 0, maxLatency: 0, dropRate: 0, duplicateRate: 0 },
    steps:
      mode === "inconclusive"
        ? []
        : [
            {
              at: 0,
              action: "command",
              replica: "a",
              command: {
                action: "put",
                key: "k",
                value: "<script>unsafe</script>",
              },
            },
            { at: 0, action: "heal" },
          ],
    checks: [
      { id: "convergence", parameters: null },
      ...(mode === "failed"
        ? [{ id: "expected-state", parameters: { state: { wrong: true } } }]
        : []),
    ],
  };
  return executeVerification(definition, createBuiltinContext(definition));
}
const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/verification.html");
});
test.afterEach(() => expect(errors).toEqual([]));
test("imports a verified file, shows actual initial state and exact same-time events", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:48123/"))
      requests.push(request.url());
  });
  const bundle = fixture();
  await page
    .getByLabel("검증 파일")
    .setInputFiles({
      name: "result.json",
      mimeType: "application/json",
      buffer: Buffer.from(jcs(bundle)),
    });
  await expect(page.locator("#verification-status")).toHaveText("통과");
  await expect(page.locator("#verification-states")).toContainText("initial");
  await expect(page.locator("#verification-states")).not.toContainText(
    "unsafe",
  );
  await page.getByRole("button", { name: "다음 사건" }).click();
  await expect(page.locator("#verification-states")).toContainText(
    "<script>unsafe</script>",
  );
  await expect(page.locator("#verification-event")).toContainText("시각 0");
  await page.getByRole("button", { name: "최종 상태" }).click();
  await expect(page.locator("#verification-states")).toContainText('"b"');
  await expect(page.locator("#verification-states")).toContainText("unsafe");
  expect(requests).toEqual([]);
});
for (const mode of ["failed", "inconclusive"])
  test(`shows honest ${mode} status`, async ({ page }) => {
    await page
      .getByLabel("검증 파일")
      .setInputFiles({
        name: mode + ".json",
        mimeType: "application/json",
        buffer: Buffer.from(jcs(fixture(mode))),
      });
    await expect(page.locator("#verification-status")).toHaveText(
      mode === "failed" ? "실패" : "판정 불가",
    );
    if (mode === "failed")
      await expect(page.locator("#verification-checks")).toContainText(
        "expected-state",
      );
  });
test("clears a previous result and refuses tampered files", async ({
  page,
}) => {
  await page
    .getByLabel("검증 파일")
    .setInputFiles({
      name: "valid.json",
      mimeType: "application/json",
      buffer: Buffer.from(jcs(fixture())),
    });
  await page
    .getByLabel("검증 파일")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from(jcs({ ...fixture(), run_id: "0".repeat(64) })),
    });
  await expect(page.locator("#verification-error")).toContainText("파일");
  await expect(page.locator("#verification-result")).toBeHidden();
  await page.reload();
  await expect(page.locator("#verification-result")).toBeHidden();
});

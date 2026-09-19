import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type * as WebCore from "../web/core.js";
import { executeScenario, parseScenario, scenarioIdentity } from "../src/scenario.js";

/**
 * The playground ships the core, so the browser bundle must run outside the
 * bundler and produce what the Node core produces. `pnpm build` runs first in CI.
 */

const BUNDLE = new URL("../dist/web/core.js", import.meta.url);
const BUILT_HINT = "dist/web/core.js is missing — run `pnpm build` before `pnpm test`";

const scenario: unknown = {
  config: {
    replicas: ["a", "b"],
    seed: 19,
    minLatency: 1,
    maxLatency: 3,
    dropRate: 0.25,
    duplicateRate: 0.5,
  },
  steps: [
    { at: 0, action: "partition", left: "a", right: "b" },
    { at: 1, action: "put", replica: "a", key: "mode", value: "safe" },
    { at: 1, action: "put", replica: "b", key: "mode", value: "fast" },
    { at: 5, action: "heal" },
  ],
};

describe("browser bundle", () => {
  it("is built", () => {
    expect(existsSync(BUNDLE), BUILT_HINT).toBe(true);
  });

  it("runs outside the bundler and reports what the core reports", async () => {
    const bundled = (await import(BUNDLE.href)) as typeof WebCore;
    const fromBundle = bundled.executeScenario(bundled.parseScenario(scenario));
    const fromCore = executeScenario(parseScenario(scenario));
    expect(fromBundle).toEqual(fromCore);
    expect(bundled.scenarioIdentity(bundled.parseScenario(scenario)).id).toBe(
      scenarioIdentity(parseScenario(scenario)).id,
    );
  });

  it("carries no Node builtin", () => {
    expect(readFileSync(BUNDLE, "utf8")).not.toMatch(/node:/);
    expect(readFileSync(BUNDLE, "utf8")).not.toMatch(/\bBuffer\b/);
  });
});

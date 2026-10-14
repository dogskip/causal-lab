import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { createBuiltinContext } from "../src/node/registry.js";
import { executeVerification } from "../src/verify/runtime.js";
import { parseJsonText } from "../src/verify/json.js";
import { readBundle } from "../src/verify/bundle.js";
for (const [name, status] of [
  ["yjs", "passed"],
  ["failure", "failed"],
] as const) {
  it(`runs documented v2 ${name} example with actual Yjs`, () => {
    const definition = parseJsonText(
      readFileSync(
        new URL(`../examples/verification/${name}.json`, import.meta.url),
        "utf8",
      ),
    );
    const bundle = executeVerification(
      definition,
      createBuiltinContext(definition),
    );
    expect(readBundle(bundle).receipt.status).toBe(status);
  });
}

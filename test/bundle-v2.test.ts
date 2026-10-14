import { describe, expect, it } from "vitest";
import { createBuiltinContext } from "../src/node/registry.js";
import {
  executeVerification,
  replayVerification,
} from "../src/verify/runtime.js";
import { readBundle, statesAt } from "../src/verify/bundle.js";
import { jcs } from "../src/verify/json.js";
import { sha256Hex } from "../src/sha256.js";
import { parseVerificationCase } from "../src/verify/case.js";
const definition = () =>
  parseVerificationCase({
    format_version: 2,
    model_id: "yjs-map",
    profile: "independent-updates",
    replicas: ["a", "b"],
    bootstrap: {
      a: { clientID: 1, guid: "x", values: {} },
      b: { clientID: 2, guid: "x", values: {} },
    },
    seed: 1,
    network: { minLatency: 0, maxLatency: 0, dropRate: 0, duplicateRate: 0 },
    steps: [
      {
        at: 0,
        action: "command",
        replica: "a",
        command: { action: "put", key: "k", value: "v" },
      },
      { at: 0, action: "heal" },
    ],
    checks: [{ id: "convergence", parameters: null }],
  });
function bundle() {
  const d = definition();
  return executeVerification(d, createBuiltinContext(d));
}
function changed(change: (source: ReturnType<typeof bundle>) => void) {
  const data = JSON.parse(jcs(bundle())) as ReturnType<typeof bundle>;
  change(data);
  return data;
}
function resigned(data: ReturnType<typeof bundle>) {
  return {
    ...data,
    run_id: sha256Hex("causal-lab-run-v2\0" + jcs(data.receipt)),
  };
}
describe("self-contained verification files", () => {
  it("validates a real receipt and folds exact same-time events", () => {
    const result = readBundle(jcs(bundle()));
    expect(result.receipt.status).toBe("passed");
    expect(statesAt(result, 0)).toEqual({ a: {}, b: {} });
    expect(statesAt(result, 1)).toEqual({ a: { k: "v" }, b: {} });
    expect(statesAt(result, result.receipt.events.length)).toEqual(
      result.receipt.finalStates,
    );
  });
  it("rejects changed identifiers and binary packet content", () => {
    expect(() =>
      readBundle(changed((x) => Object.assign(x, { run_id: "0".repeat(64) }))),
    ).toThrow();
    expect(() =>
      readBundle(
        resigned(
          changed((x) =>
            Object.assign(x.receipt.packets[0]!, { bytes: "AAAA" }),
          ),
        ),
      ),
    ).toThrow();
  });
  it("rejects contradictory counters and state even with recomputed IDs", () => {
    expect(() =>
      readBundle(
        resigned(
          changed((x) =>
            Object.assign(x.receipt.counts, { deliveredMessages: 0 }),
          ),
        ),
      ),
    ).toThrow();
    expect(() =>
      readBundle(
        resigned(
          changed((x) =>
            Object.assign(x.receipt, { finalStates: { a: {}, b: {} } }),
          ),
        ),
      ),
    ).toThrow();
  });
  it("rejects missing recovery proof, unknown fields and duplicate raw keys", () => {
    expect(() =>
      readBundle(
        resigned(changed((x) => Object.assign(x.receipt, { recovery: null }))),
      ),
    ).toThrow();
    expect(() => readBundle({ ...bundle(), unknown: true })).toThrow();
    expect(() =>
      readBundle('{"format_version":2,"format_version":2}'),
    ).toThrow();
  });
  it("rejects a forged receipt before target creation", () => {
    const d = definition();
    const options = createBuiltinContext(d);
    let created = 0;
    const create = options.adapter.create.bind(options.adapter);
    const adapter = {
      ...options.adapter,
      create: (...args: Parameters<typeof create>) => {
        created++;
        return create(...args);
      },
    };
    expect(() =>
      replayVerification(
        changed((x) => Object.assign(x, { run_id: "0".repeat(64) })),
        { ...options, adapter },
      ),
    ).toThrow();
    expect(created).toBe(0);
  });
  it("accepts honest failed and incomplete receipts without reclassifying them", () => {
    const d = definition();
    for (const source of [
      { ...d, steps: [] },
      {
        ...d,
        checks: [
          ...d.checks,
          { id: "expected-state", parameters: { state: { wrong: true } } },
        ],
      },
    ]) {
      const result = executeVerification(source, createBuiltinContext(source));
      expect(readBundle(result).receipt.status).toBe(result.receipt.status);
    }
  });
});
it("requires each completed pair to emit an actual recovery packet", () => {
  const d = { ...definition(), steps: [{ at: 0, action: "heal" }] };
  const data = executeVerification(d, createBuiltinContext(d));
  const receipt = data.receipt;
  const events = receipt.events.filter(
    (event) => event.kind !== "scheduled" && event.kind !== "delivery",
  );
  const replacement = {
    ...receipt,
    events: events.map((event, index) => ({ ...event, sequence: index + 1 })),
    packets: [],
    counts: { ...receipt.counts, scheduledMessages: 0, deliveredMessages: 0 },
    recovery: {
      ...receipt.recovery!,
      startedAtSequence: 1,
      completedAtSequence: events.length,
      requiredMessages: [],
    },
    checks: receipt.checks.map((check) => ({
      ...check,
      eventSequence: events.length,
    })),
  };
  expect(() =>
    readBundle({
      ...data,
      receipt: replacement,
      run_id: sha256Hex("causal-lab-run-v2\0" + jcs(replacement)),
    }),
  ).toThrow();
});

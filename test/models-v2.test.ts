import { describe, expect, it } from "vitest";
import { createBuiltinContext } from "../src/node/registry.js";
import { parseVerificationCase } from "../src/verify/case.js";
import {
  executeVerification,
  replayVerification,
} from "../src/verify/runtime.js";

export function modelCase(model_id = "yjs-map") {
  const replicas = ["a", "b", "c"];
  return parseVerificationCase({
    format_version: 2,
    model_id,
    profile: "independent-updates",
    replicas,
    bootstrap: Object.fromEntries(
      replicas.map((id, index) => [
        id,
        model_id === "yjs-map"
          ? { clientID: index + 1, guid: "test-document", values: {} }
          : { values: {} },
      ]),
    ),
    seed: 19,
    network: {
      minLatency: 0,
      maxLatency: 5,
      dropRate: 0.5,
      duplicateRate: 0.5,
    },
    steps: [
      {
        at: 0,
        action: "command",
        replica: "a",
        command: { action: "put", key: "k", value: "v" },
      },
      { at: 10, action: "heal" },
    ],
    checks: [
      { id: "convergence", parameters: null },
      {
        id: "expected-state",
        parameters: {
          state: model_id === "yjs-map" ? { k: "v" } : { k: ["v"] },
        },
      },
    ],
  });
}
describe("actual built-in model implementations", () => {
  for (const model of ["or-map", "yjs-map"]) {
    it(`${model} repeats and verifies the same receipt using actual target APIs`, () => {
      const definition = modelCase(model);
      const first = executeVerification(
        definition,
        createBuiltinContext(definition),
      );
      const second = executeVerification(
        definition,
        createBuiltinContext(definition),
      );
      expect(first.receipt.status).toBe("passed");
      expect(second.run_id).toBe(first.run_id);
      expect(
        replayVerification(first, createBuiltinContext(definition)).run_id,
      ).toBe(first.run_id);
    });
    it(`${model} processes a delivery before an equal-time remove`, () => {
      const source = modelCase(model);
      const definition = parseVerificationCase({
        ...source,
        network: {
          minLatency: 5,
          maxLatency: 5,
          dropRate: 0,
          duplicateRate: 0,
        },
        steps: [
          {
            at: 0,
            action: "command",
            replica: "a",
            command: { action: "put", key: "k", value: "v" },
          },
          {
            at: 5,
            action: "command",
            replica: "b",
            command: { action: "remove", key: "k" },
          },
          { at: 10, action: "heal" },
        ],
        checks: [
          { id: "convergence", parameters: null },
          { id: "expected-state", parameters: { state: {} } },
        ],
      });
      expect(
        executeVerification(definition, createBuiltinContext(definition))
          .receipt.status,
      ).toBe("passed");
    });
  }
  it("keeps model-specific concurrent conflict semantics", () => {
    for (const model of ["or-map", "yjs-map"]) {
      const source = modelCase(model);
      const definition = parseVerificationCase({
        ...source,
        network: { ...source.network, dropRate: 1 },
        steps: [
          {
            at: 0,
            action: "command",
            replica: "a",
            command: { action: "put", key: "k", value: "left" },
          },
          {
            at: 0,
            action: "command",
            replica: "b",
            command: { action: "put", key: "k", value: "right" },
          },
          { at: 1, action: "heal" },
        ],
        checks: [{ id: "convergence", parameters: null }],
      });
      const result = executeVerification(
        definition,
        createBuiltinContext(definition),
      );
      expect(result.receipt.status).toBe("passed");
      if (model === "or-map")
        expect(result.receipt.finalStates.a).toEqual({ k: ["left", "right"] });
      else expect(result.receipt.finalStates.a).toEqual({ k: "right" });
    }
  });
  it("rejects reused Yjs client identity and releases the document created before failure", () => {
    const source = modelCase();
    const definition = parseVerificationCase({
      ...source,
      bootstrap: {
        ...source.bootstrap,
        b: { clientID: 1, guid: "test-document", values: {} },
      },
    });
    const context = createBuiltinContext(definition);
    expect(executeVerification(definition, context).receipt.status).toBe(
      "error",
    );
    expect(executeVerification(definition, context).receipt.status).toBe(
      "error",
    );
  });
});

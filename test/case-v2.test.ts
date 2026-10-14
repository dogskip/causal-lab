import { describe, expect, it } from "vitest";
import { parseVerificationCase } from "../src/verify/case.js";

const input = () => ({
  format_version: 2,
  model_id: "counter",
  profile: "independent-updates",
  replicas: ["__proto__", "b"],
  bootstrap: Object.fromEntries([
    ["__proto__", {}],
    ["b", {}],
  ]),
  seed: 19,
  network: { minLatency: 0, maxLatency: 5, dropRate: 0.5, duplicateRate: 0.5 },
  steps: [
    {
      at: 0,
      action: "command",
      replica: "__proto__",
      command: { action: "put", key: "k", value: "v" },
    },
    { at: 1, action: "heal" },
  ],
  checks: [{ id: "convergence", parameters: null }],
});

describe("v2 specification boundary", () => {
  it("owns the full definition and preserves exact bootstrap membership", () => {
    const source = input();
    const result = parseVerificationCase(source);
    source.steps.length = 0;
    expect(result.steps).toHaveLength(2);
    expect(Object.hasOwn(result.bootstrap, "__proto__")).toBe(true);
    expect(Object.isFrozen(result.network)).toBe(true);
  });
  it("rejects unregistered format, unsupported delivery and unknown fields", () => {
    for (const patch of [
      { format_version: 1 },
      { profile: "ordered-session" },
      { executable: "module.js" },
      { seed: -1 },
      { seed: 2 ** 32 },
      { bootstrap: { b: {} } },
      { replicas: ["b", "b"] },
    ])
      expect(() => parseVerificationCase({ ...input(), ...patch })).toThrow();
  });
  it("requires a final convergence contract and unique check names", () => {
    expect(() => parseVerificationCase({ ...input(), checks: [] })).toThrow(
      /convergence/,
    );
    expect(() =>
      parseVerificationCase({
        ...input(),
        checks: [
          { id: "convergence", parameters: null },
          { id: "convergence", parameters: null },
        ],
      }),
    ).toThrow(/unique/);
  });
  it("validates every stage and preserves equal-time input order", () => {
    const base = input();
    expect(() =>
      parseVerificationCase({
        ...base,
        steps: [
          { at: 2, action: "heal" },
          { at: 1, action: "heal" },
        ],
      }),
    ).toThrow(/time/);
    expect(() =>
      parseVerificationCase({
        ...base,
        steps: [{ at: 0, action: "partition", left: "b", right: "b" }],
      }),
    ).toThrow();
    expect(() =>
      parseVerificationCase({
        ...base,
        steps: [
          {
            at: 0,
            action: "command",
            replica: "missing",
            command: { action: "put" },
          },
        ],
      }),
    ).toThrow(/replica/);
    const equal = parseVerificationCase({
      ...base,
      steps: [
        { at: 0, action: "partition", left: "b", right: "__proto__" },
        { at: 0, action: "heal" },
      ],
    });
    expect(equal.steps.map((step) => step.action)).toEqual([
      "partition",
      "heal",
    ]);
  });
  it("rejects oversized input and too many stages", () => {
    expect(() =>
      parseVerificationCase({
        ...input(),
        steps: Array.from({ length: 1001 }, () => ({ at: 0, action: "heal" })),
      }),
    ).toThrow(/steps/);
    expect(() =>
      parseVerificationCase({
        ...input(),
        bootstrap: Object.fromEntries<unknown>([
          ["b", {}],
          ["__proto__", "x".repeat(2_097_153)],
        ]),
      }),
    ).toThrow(/bytes/);
  });
});

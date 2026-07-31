import { describe, expect, it } from "vitest";
import {
  MAX_STEPS,
  canonicalJson,
  executeScenario,
  parseScenario,
  scenarioIdentity,
} from "../src/scenario.js";
import { catalogScenario, catalogScenarioInput, partitionScenario, partitionScenarioInput } from "./fixtures.js";

describe("reproducible scenarios", () => {
  it("assigns the same identity regardless of object key order", () => {
    const input = partitionScenarioInput as unknown as {
      config: Record<string, unknown>;
      steps: Array<Record<string, unknown>>;
    };
    const reordered = {
      steps: input.steps.map((step) => Object.fromEntries(Object.entries(step).reverse())),
      config: Object.fromEntries(Object.entries(input.config).reverse()),
    };

    const first = parseScenario(partitionScenario());
    const second = parseScenario(reordered);
    expect(scenarioIdentity(first)).toEqual(scenarioIdentity(second));
  });

  it("executes the same validated scenario byte-identically", () => {
    const scenario = parseScenario(partitionScenario());
    expect(executeScenario(scenario)).toEqual(executeScenario(scenario));
  });

  it("different semantic content produces different identity", () => {
    const input = catalogScenarioInput as unknown as { config: Record<string, unknown> };
    const a = parseScenario(catalogScenario());
    const b = parseScenario({ config: { ...input.config, seed: 999 }, steps: catalogScenarioInput.steps });
    expect(scenarioIdentity(a)).not.toEqual(scenarioIdentity(b));
  });

  it("includes a remove step in execution", () => {
    const scenario = parseScenario({
      config: {
        replicas: ["a", "b"],
        seed: 1,
        minLatency: 1,
        maxLatency: 2,
        dropRate: 0,
        duplicateRate: 0,
      },
      steps: [
        { at: 0, action: "put", replica: "a", key: "k", value: "v" },
        { at: 1, action: "remove", replica: "a", key: "k" },
        { at: 2, action: "heal" },
      ],
    });
    const report = executeScenario(scenario);
    expect(report.converged).toBe(true);
    // After observed-remove, key is absent from canonicalState (not an empty array)
    expect(report.states["a"]?.["k"]).toBeUndefined();
  });

  it("handles steps with actions on different replicas", () => {
    const scenario = parseScenario({
      config: {
        replicas: ["a", "b"],
        seed: 1,
        minLatency: 1,
        maxLatency: 2,
        dropRate: 0,
        duplicateRate: 0,
      },
      steps: [
        { at: 0, action: "put", replica: "a", key: "k", value: "1" },
        { at: 0, action: "put", replica: "b", key: "k", value: "2" },
        { at: 2, action: "heal" },
      ],
    });
    const report = executeScenario(scenario);
    expect(report.converged).toBe(true);
    // Both replicas converge to the same state
    expect(report.states["a"]).toEqual(report.states["b"]);
  });
});

describe("canonicalJson", () => {
  it("serializes primitives deterministically", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson(true)).toBe("true");
    expect(canonicalJson(false)).toBe("false");
    expect(canonicalJson("hello")).toBe('"hello"');
    expect(canonicalJson(42)).toBe("42");
    expect(canonicalJson(0)).toBe("0");
    expect(canonicalJson(-1)).toBe("-1");
  });

  it("serializes arrays", () => {
    expect(canonicalJson([1, 2, 3])).toBe("[1,2,3]");
    expect(canonicalJson([])).toBe("[]");
  });

  it("serializes objects with sorted keys", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("serializes nested objects", () => {
    const result = canonicalJson({ outer: { c: 3, b: { d: 4, a: 1 } } });
    expect(result).toBe('{"outer":{"b":{"a":1,"d":4},"c":3}}');
  });

  it("rejects non-finite numbers", () => {
    expect(() => canonicalJson(NaN)).toThrow(/finite/);
    expect(() => canonicalJson(Infinity)).toThrow(/finite/);
    expect(() => canonicalJson(-Infinity)).toThrow(/finite/);
  });

  it("rejects undefined as a root value", () => {
    expect(() => canonicalJson(undefined)).toThrow();
  });

  it("rejects a function", () => {
    expect(() => canonicalJson(() => {})).toThrow();
  });

  it("produces the same output for semantically equivalent objects regardless of insertion order", () => {
    const obj1 = { a: 1, b: 2, c: 3 };
    const obj2 = Object.fromEntries(Object.entries(obj1).reverse());
    expect(canonicalJson(obj1)).toBe(canonicalJson(obj2));
  });
});

describe("parseScenario", () => {
  it("rejects non-object input", () => {
    expect(() => parseScenario("string")).toThrow(/must be an object/);
    expect(() => parseScenario(null)).toThrow(/must be an object/);
    expect(() => parseScenario(42)).toThrow(/must be an object/);
    expect(() => parseScenario([])).toThrow(/must be an object/);
  });

  it("rejects a missing config", () => {
    expect(() => parseScenario({ steps: [] })).toThrow(/config/);
  });

  it("rejects a missing steps", () => {
    expect(() => parseScenario({ config: { replicas: ["a", "b"], seed: 1 } })).toThrow(/steps/);
  });

  it("rejects steps exceeding MAX_STEPS", () => {
    const steps = Array.from({ length: MAX_STEPS + 1 }, (_, i) => ({
      at: i,
      action: "put" as const,
      replica: "a",
      key: "k",
      value: "v",
    }));
    expect(() =>
      parseScenario({
        config: { replicas: ["a", "b"], seed: 1, minLatency: 1, maxLatency: 2, dropRate: 0, duplicateRate: 0 },
        steps,
      }),
    ).toThrow(/steps/);
  });

  it("rejects a step time that is too large", () => {
    expect(() =>
      parseScenario({
        config: { replicas: ["a", "b"], seed: 1, minLatency: 1, maxLatency: 2, dropRate: 0, duplicateRate: 0 },
        steps: [{ at: 2_000_000_000, action: "put", replica: "a", key: "k", value: "v" }],
      }),
    ).toThrow(/step times/);
  });

  it("rejects a step time that exceeds MAX_STEPS boundary at 1e9+1", () => {
    expect(() =>
      parseScenario({
        config: { replicas: ["a", "b"], seed: 1, minLatency: 1, maxLatency: 2, dropRate: 0, duplicateRate: 0 },
        steps: [{ at: 1_000_000_001, action: "put", replica: "a", key: "k", value: "v" }],
      }),
    ).toThrow(/step times/);
  });

  it("rejects a heald step that has extra fields", () => {
    expect(() =>
      parseScenario({
        config: { replicas: ["a", "b"], seed: 1, minLatency: 1, maxLatency: 2, dropRate: 0, duplicateRate: 0 },
        steps: [{ at: 0, action: "heal", extra: true }],
      }),
    ).toThrow(/unknown field/);
  });

  it("rejects a partition step missing a field", () => {
    expect(() =>
      parseScenario({
        config: { replicas: ["a", "b"], seed: 1, minLatency: 1, maxLatency: 2, dropRate: 0, duplicateRate: 0 },
        steps: [{ at: 0, action: "partition", left: "a" }],
      }),
    ).toThrow(/right replica is required/);
  });

  it("rejects a put step missing a value", () => {
    expect(() =>
      parseScenario({
        config: { replicas: ["a", "b"], seed: 1, minLatency: 1, maxLatency: 2, dropRate: 0, duplicateRate: 0 },
        steps: [{ at: 0, action: "put", replica: "a", key: "k" }],
      }),
    ).toThrow(/value is required/);
  });

  it("rejects a remove step missing key", () => {
    expect(() =>
      parseScenario({
        config: { replicas: ["a", "b"], seed: 1, minLatency: 1, maxLatency: 2, dropRate: 0, duplicateRate: 0 },
        steps: [{ at: 0, action: "remove", replica: "a" }],
      }),
    ).toThrow(/key is required/);
  });

  it("rejects non-finite number for config fields", () => {
    expect(() =>
      parseScenario({
        config: { replicas: ["a", "b"], seed: NaN, minLatency: 1, maxLatency: 2, dropRate: 0, duplicateRate: 0 },
        steps: [],
      }),
    ).toThrow(/finite/);
  });

  it("accepts a valid scenario with MAX_STEPS boundary", () => {
    const steps = Array.from({ length: MAX_STEPS }, (_, i) => ({
      at: i,
      action: "heal" as const,
    }));
    expect(() =>
      parseScenario({
        config: { replicas: ["a", "b"], seed: 0, minLatency: 0, maxLatency: 1000, dropRate: 0, duplicateRate: 0 },
        steps,
      }),
    ).not.toThrow();
  });
});

describe("executeScenario", () => {
  it("handles an empty steps array", () => {
    const input = catalogScenarioInput as unknown as { config: Record<string, unknown> };
    const report = executeScenario(parseScenario({ config: input.config, steps: [] }));
    expect(report.processedEvents).toBe(0);
    expect(report.converged).toBe(true);
  });
});

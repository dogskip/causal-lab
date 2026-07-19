import { assert, property, uint8Array } from "fast-check";
import { describe, expect, it } from "vitest";
import { Replica, type Operation } from "../src/crdt.js";
import { executeScenario, parseScenario, scenarioIdentity } from "../src/scenario.js";
import { type SimulationConfig } from "../src/simulation.js";

// Reproducible fast-check runs: pin a base seed so failures are stable across CI.
const FAST_CHECK_SEED = 0xcafe;

const identifier = /^[A-Za-z0-9._-]+$/u;
const replicaName = (raw: string) => {
  const cleaned = raw.replace(/[^A-Za-z0-9._-]/gu, "").slice(0, 16) || "replica";
  return identifier.test(cleaned) ? cleaned : "replica";
};

const at = (bytes: Uint8Array, index: number, fallback: number): number =>
  index < bytes.length ? (bytes[index] ?? fallback) : fallback;

const configArbitrary = uint8Array({ minLength: 4, maxLength: 8 }).map((bytes) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const seed = view.getUint32(0, true);
  const replicas = ["alpha", "beta", "gamma"].slice(0, 2 + (at(bytes, 0, 0) % 2));
  const minLatency = 1 + (at(bytes, 1, 0) % 3);
  const maxLatency = minLatency + (at(bytes, 2, 0) % 8);
  const dropRate = (at(bytes, 3, 0) % 10) / 10;
  const duplicateRate = (bytes.length > 4 ? at(bytes, 4, 0) % 5 : 0) / 10;
  const config: SimulationConfig = {
    replicas,
    seed,
    minLatency,
    maxLatency,
    dropRate,
    duplicateRate,
  };
  return config;
});

const stepsArbitrary = uint8Array({ minLength: 2, maxLength: 8 }).map((bytes) => {
  const steps: Array<Record<string, unknown>> = [];
  let at = 0;
  for (const byte of bytes) {
    at += byte % 4;
    const choice = byte % 4;
    if (choice === 0) {
      steps.push({ at, action: "put", replica: "alpha", key: "k", value: "v" });
    } else if (choice === 1) {
      steps.push({ at, action: "remove", replica: "alpha", key: "k" });
    } else if (choice === 2) {
      steps.push({ at, action: "partition", left: "alpha", right: "beta" });
    } else {
      steps.push({ at, action: "heal" });
    }
  }
  steps.push({ at: at + 10, action: "heal" });
  return steps;
});

function scenarioFrom(config: SimulationConfig, steps: Array<Record<string, unknown>>): unknown {
  return { config, steps };
}

describe("determinism and CRDT properties (fast-check)", () => {
  it("produces byte-identical reports for equal seeds and scenarios", () => {
    assert(
      property(configArbitrary, stepsArbitrary, (config, steps) => {
        const scenario = scenarioFrom(config, steps);
        const first = executeScenario(parseScenario(scenario));
        const second = executeScenario(parseScenario(JSON.parse(JSON.stringify(scenario))));
        expect(first).toEqual(second);
      }),
      { seed: FAST_CHECK_SEED, numRuns: 100 },
    );
  });

  it("converges every replica after a final reliable heal", () => {
    assert(
      property(configArbitrary, stepsArbitrary, (config, steps) => {
        const scenario = scenarioFrom({ ...config, dropRate: 0, duplicateRate: 0 }, steps);
        const report = executeScenario(parseScenario(scenario));
        expect(report.converged).toBe(true);
      }),
      { seed: FAST_CHECK_SEED, numRuns: 100 },
    );
  });

  it("assigns the same scenario identity regardless of object key order", () => {
    assert(
      property(configArbitrary, stepsArbitrary, (config, steps) => {
        const scenario = scenarioFrom(config, steps);
        const reordered = {
          steps: steps.map((step) => Object.fromEntries(Object.entries(step).reverse())),
          config: Object.fromEntries(Object.entries(config).reverse()),
        };
        expect(scenarioIdentity(parseScenario(scenario))).toEqual(
          scenarioIdentity(parseScenario(reordered)),
        );
      }),
      { seed: FAST_CHECK_SEED, numRuns: 100 },
    );
  });

  it("applies duplicated and reordered operations idempotently", () => {
    assert(
      property(uint8Array({ minLength: 3, maxLength: 8 }), (bytes) => {
        const source = new Replica("src");
        const ops: Operation[] = [];
        for (const byte of bytes) {
          ops.push(source.put("k", byte % 2 === 0 ? "v1" : "v2"));
        }
        const observer = new Replica("obs");
        // Apply the same multiset in original, reversed, and duplicated order.
        observer.put("__seed__", "0"); // consume first dot to diverge versions
        for (const op of ops) observer.apply(op);
        const first = observer.canonicalState();

        const second = new Replica("obs");
        second.put("__seed__", "0");
        for (const op of [...ops].reverse()) second.apply(op);
        const secondState = second.canonicalState();

        const third = new Replica("obs");
        third.put("__seed__", "0");
        for (const op of [...ops, ...ops]) third.apply(op);
        const thirdState = third.canonicalState();

        expect(secondState).toEqual(first);
        expect(thirdState).toEqual(first);
      }),
      { seed: FAST_CHECK_SEED, numRuns: 100 },
    );
  });

  it("preserves a concurrent put when a removed dot is delivered late", () => {
    // alice puts draft, bob observes and removes, alice concurrently puts ready.
    // Observer receives: removal, concurrent put, then the removed dot late.
    // observed-remove must suppress the late removed dot but keep the concurrent put.
    assert(
      property(uint8Array({ minLength: 1, maxLength: 1 }), () => {
        const alice = new Replica("alice");
        const bob = new Replica("bob");
        const observer = new Replica("observer");

        const draft = alice.put("status", "draft");
        bob.apply(draft);
        const removal = bob.remove("status");
        const ready = alice.put("status", "ready"); // concurrent with removal

        observer.apply(removal);
        observer.apply(ready);
        observer.apply(draft); // late delivery of the removed dot

        expect(observer.read("status")).toEqual(["ready"]);
        // The concurrent put must survive and not be suppressed by the removal.
        expect(observer.read("status")).not.toContain("draft");
      }),
      { seed: FAST_CHECK_SEED, numRuns: 100 },
    );
  });

  it("keeps version vectors monotonic and operation identifiers unique", () => {
    assert(
      property(uint8Array({ minLength: 2, maxLength: 8 }), (bytes) => {
        const replica = new Replica("r");
        const seen = new Set<string>();
        let max = 0;
        for (const byte of bytes) {
          const op = byte % 2 === 0 ? replica.put("k", "v") : replica.remove("k");
          const id = `${op.dot.replica}:${op.dot.counter}`;
          expect(seen.has(id)).toBe(false);
          seen.add(id);
          const version = replica.version();
          const counter = version["r"] ?? 0;
          expect(counter).toBeGreaterThanOrEqual(max);
          max = counter;
        }
      }),
      { seed: FAST_CHECK_SEED, numRuns: 100 },
    );
  });

  it("converges to the same canonical state regardless of delivery order", () => {
    assert(
      property(uint8Array({ minLength: 3, maxLength: 8 }), (bytes) => {
        const source = new Replica("src");
        const ops: Operation[] = [];
        for (const byte of bytes) {
          ops.push(byte % 2 === 0 ? source.put("k", "v") : source.put("k", "w"));
        }
        const left = new Replica("left");
        const right = new Replica("right");
        for (const op of ops) left.apply(op);
        for (const op of [...ops].reverse()) right.apply(op);
        expect(left.canonicalState()).toEqual(right.canonicalState());
      }),
      { seed: FAST_CHECK_SEED, numRuns: 100 },
    );
  });

  it("uses replica names that survive the identifier contract", () => {
    assert(
      property(uint8Array({ minLength: 1, maxLength: 16 }), (bytes) => {
        const name = replicaName(String.fromCharCode(...bytes));
        expect(() => new Replica(name)).not.toThrow();
      }),
      { seed: FAST_CHECK_SEED, numRuns: 50 },
    );
  });
});

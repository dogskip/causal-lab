import { assert, property, uint8Array } from "fast-check";
import { describe, expect, it } from "vitest";
import { ContractError, MAX_VALUE_BYTES, Replica, type Operation } from "../src/crdt.js";
import { MAX_STEPS, executeScenario, parseScenario, scenarioIdentity, type ScenarioStep } from "../src/scenario.js";
import { MAX_REPLICAS, type SimulationConfig, type SimulationReport } from "../src/simulation.js";
import { expectedConvergedState, referenceState, statesAgree } from "./oracle.js";

// Reproducible fast-check runs: pin a base seed so failures are stable across CI.
const FAST_CHECK_SEED = 0xcafe;
// CI runs a few hundred; `pnpm test:deep` raises this to thousands.
const NUM_RUNS = Number(process.env["CAUSAL_LAB_PROPERTY_RUNS"] ?? 300);
const RUN_OPTIONS = { seed: FAST_CHECK_SEED, numRuns: NUM_RUNS };

const REPLICA_POOL = ["r0", "r1", "r2", "r3"];

const byteAt = (bytes: Uint8Array, index: number): number => bytes[index] ?? 0;

const pick = <T>(items: readonly T[], index: number): T => {
  const item = items[((index % items.length) + items.length) % items.length];
  if (item === undefined) {
    throw new Error("cannot pick from an empty list");
  }
  return item;
};

const seedOf = (bytes: Uint8Array): number =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);

// Latency stays at least 1 so writes sharing a step time cannot observe each other.
const configFrom = (bytes: Uint8Array, replicas: string[]): SimulationConfig => {
  const minLatency = 1 + (byteAt(bytes, 2) % 3);
  return {
    replicas,
    seed: seedOf(bytes),
    minLatency,
    maxLatency: minLatency + (byteAt(bytes, 5) % 6),
    dropRate: byteAt(bytes, 3) / 255,
    duplicateRate: byteAt(bytes, 4) / 255,
  };
};

/** Runs a scenario and checks it against the oracle, never against `converged`. */
function expectConverged(config: SimulationConfig, steps: readonly ScenarioStep[]): SimulationReport {
  const report = executeScenario(parseScenario({ config, steps }));
  const expected = expectedConvergedState(steps);
  const independentlyConverged = statesAgree(report.states);
  expect(report.converged).toBe(independentlyConverged);
  expect(independentlyConverged).toBe(true);
  for (const replica of config.replicas) {
    expect(report.states[replica]).toEqual(expected);
  }
  return report;
}

// Writes of one key share a step time, so every writer of that key is concurrent.
const losslessScenario = uint8Array({ minLength: 8, maxLength: 24 }).map((bytes) => {
  const replicas = REPLICA_POOL.slice(0, 2 + (byteAt(bytes, 0) % 3));
  const keys = ["k0", "k1"].slice(0, 1 + (byteAt(bytes, 1) % 2));
  const steps: ScenarioStep[] = [];
  for (const [index, replica] of replicas.entries()) {
    if (index > 0 && byteAt(bytes, 6 + index) % 2 === 0) {
      steps.push({ at: 0, action: "partition", left: pick(replicas, 0), right: replica });
    }
  }
  let at = 1;
  for (const key of keys) {
    for (const [index, replica] of replicas.entries()) {
      if (byteAt(bytes, 6 + index) % 2 === 0) {
        steps.push({ at, action: "put", replica, key, value: `${replica}.${key}` });
      }
    }
    at += 1;
  }
  steps.push({ at, action: "heal" });
  return { config: configFrom(bytes, replicas), steps };
});

// Both writers put both keys while partitioned, then one side removes one key.
const observedRemoveScenario = uint8Array({ minLength: 8, maxLength: 24 }).map((bytes) => {
  const left = "w0";
  const right = "w1";
  const replicas = byteAt(bytes, 0) % 2 === 0 ? [left, right] : [left, right, "w2"];
  const remover = byteAt(bytes, 1) % 2 === 0 ? left : right;
  const survivor = remover === left ? right : left;
  const removedKey = byteAt(bytes, 6) % 2 === 0 ? "shared" : "kept";
  const steps: ScenarioStep[] = [
    { at: 0, action: "partition", left, right },
    { at: 1, action: "put", replica: left, key: "shared", value: `${left}.shared` },
    { at: 1, action: "put", replica: right, key: "shared", value: `${right}.shared` },
    { at: 1, action: "put", replica: left, key: "kept", value: `${left}.kept` },
    { at: 1, action: "put", replica: right, key: "kept", value: `${right}.kept` },
    { at: 2, action: "remove", replica: remover, key: removedKey },
    { at: 3, action: "heal" },
  ];
  return { config: configFrom(bytes, replicas), steps, removedKey, survivor };
});

describe("disproof attempts (fast-check)", () => {
  it("produces byte-identical reports for equal seeds and scenarios", () => {
    assert(
      property(losslessScenario, ({ config, steps }) => {
        const scenario = { config, steps };
        const first = executeScenario(parseScenario(scenario));
        const second = executeScenario(parseScenario(JSON.parse(JSON.stringify(scenario)) as unknown));
        expect(first).toEqual(second);
      }),
      RUN_OPTIONS,
    );
  });

  it("loses no value across partitions, drops, and duplicates", () => {
    assert(
      property(losslessScenario, ({ config, steps }) => {
        expectConverged(config, steps);
      }),
      RUN_OPTIONS,
    );
  });

  it("keeps a concurrent value when the peer removes the key it wrote", () => {
    assert(
      property(observedRemoveScenario, ({ config, steps, removedKey, survivor }) => {
        const report = expectConverged(config, steps);
        const first = config.replicas[0];
        // The remover's own value is tombstoned; the concurrent writer's value survives.
        const state = first === undefined ? undefined : report.states[first];
        expect(state?.[removedKey]).toEqual([`${survivor}.${removedKey}`]);
      }),
      RUN_OPTIONS,
    );
  });

  it("merges a fully delivered operation set to the state the specification predicts", () => {
    assert(
      property(uint8Array({ minLength: 4, maxLength: 16 }), (bytes) => {
        const authors = ["a", "b", "c"].map((id) => new Replica(id));
        const issued: Operation[] = [];
        for (const byte of bytes) {
          const author = pick(authors, byte);
          if (issued.length > 0 && byte % 7 === 0) {
            // Deliver an earlier operation to another replica, which shapes its later removes.
            const observed = issued[byte % issued.length];
            if (observed !== undefined) {
              pick(authors, byte >> 3).apply(observed);
            }
            continue;
          }
          issued.push(byte % 3 === 0 ? author.remove("k") : author.put(`k${byte % 2}`, `v${byte % 4}`));
        }
        const reference = referenceState(issued);
        for (const replica of authors) {
          for (const operation of issued) {
            replica.apply(operation);
          }
          expect(replica.canonicalState()).toEqual(reference);
        }
      }),
      RUN_OPTIONS,
    );
  });

  it("measures the value cap in UTF-8 bytes, not code units", () => {
    assert(
      property(uint8Array({ minLength: 0, maxLength: 24 }), (bytes) => {
        const encoder = new TextEncoder();
        const body = [...bytes].map((byte) => (byte % 2 === 0 ? "a" : "한")).join("");
        const atCap = body + "x".repeat(MAX_VALUE_BYTES - encoder.encode(body).length);
        expect(encoder.encode(atCap).length).toBe(MAX_VALUE_BYTES);
        const replica = new Replica("probe");
        expect(() => replica.put("k", atCap)).not.toThrow();
        expect(() => replica.put("k", `${atCap}y`)).toThrow(/value/);
      }),
      RUN_OPTIONS,
    );
  });

  it("applies duplicated and reordered operations idempotently", () => {
    assert(
      property(uint8Array({ minLength: 3, maxLength: 8 }), (bytes) => {
        const source = new Replica("src");
        const operations: Operation[] = [];
        for (const byte of bytes) {
          operations.push(source.put("k", byte % 2 === 0 ? "v1" : "v2"));
        }
        const stateAfter = (order: readonly Operation[]): Record<string, string[]> => {
          const observer = new Replica("obs");
          observer.put("__seed__", "0");
          for (const operation of order) {
            observer.apply(operation);
          }
          return observer.canonicalState();
        };
        const original = stateAfter(operations);
        expect(stateAfter([...operations].reverse())).toEqual(original);
        expect(stateAfter([...operations, ...operations])).toEqual(original);
      }),
      RUN_OPTIONS,
    );
  });

  it("keeps version vectors monotonic and operation identifiers unique", () => {
    assert(
      property(uint8Array({ minLength: 2, maxLength: 8 }), (bytes) => {
        const replica = new Replica("r");
        const seen = new Set<string>();
        let max = 0;
        for (const byte of bytes) {
          const operation = byte % 2 === 0 ? replica.put("k", "v") : replica.remove("k");
          const id = `${operation.dot.replica}:${operation.dot.counter}`;
          expect(seen.has(id)).toBe(false);
          seen.add(id);
          const counter = replica.version()["r"] ?? 0;
          expect(counter).toBeGreaterThanOrEqual(max);
          max = counter;
        }
      }),
      RUN_OPTIONS,
    );
  });

  it("assigns the same scenario identity regardless of object key order", () => {
    assert(
      property(losslessScenario, ({ config, steps }) => {
        const reordered = {
          steps: steps.map((step) => Object.fromEntries(Object.entries(step).reverse())),
          config: Object.fromEntries(Object.entries(config).reverse()),
        };
        expect(scenarioIdentity(parseScenario({ config, steps }))).toEqual(
          scenarioIdentity(parseScenario(reordered)),
        );
      }),
      RUN_OPTIONS,
    );
  });

  it("rejects an over-limit scenario before any state is produced", () => {
    const base = {
      replicas: ["a", "b"],
      seed: 7,
      minLatency: 1,
      maxLatency: 2,
      dropRate: 0,
      duplicateRate: 0,
    };
    const overLimit = [
      { config: { ...base, replicas: Array.from({ length: MAX_REPLICAS + 1 }, (_, index) => `r${index}`) }, steps: [] },
      {
        config: base,
        steps: Array.from({ length: MAX_STEPS + 1 }, () => ({ at: 0, action: "put", replica: "a", key: "k", value: "v" })),
      },
      { config: base, steps: [{ at: 0, action: "put", replica: "a", key: "k", value: "x".repeat(MAX_VALUE_BYTES + 1) }] },
      { config: base, steps: [{ at: 0, action: "explode" }] },
      { config: { ...base, dropRate: 1.5 }, steps: [] },
    ];
    assert(
      property(uint8Array({ minLength: 1, maxLength: 1 }), (bytes) => {
        const scenario = pick(overLimit, byteAt(bytes, 0));
        expect(() => executeScenario(parseScenario(scenario))).toThrow(ContractError);
      }),
      RUN_OPTIONS,
    );
  });

  it("preserves a concurrent put when a removed dot is delivered late", () => {
    // alice puts draft, bob observes and removes, alice concurrently puts ready.
    // The observer receives the removal, the concurrent put, then the removed dot late.
    const alice = new Replica("alice");
    const bob = new Replica("bob");
    const observer = new Replica("observer");

    const draft = alice.put("status", "draft");
    bob.apply(draft);
    const removal = bob.remove("status");
    const ready = alice.put("status", "ready");

    observer.apply(removal);
    observer.apply(ready);
    observer.apply(draft);

    expect(observer.read("status")).toEqual(["ready"]);
  });
});

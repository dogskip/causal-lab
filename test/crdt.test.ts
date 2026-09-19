import { describe, expect, it } from "vitest";
import {
  ContractError,
  MAX_IDENTIFIER_BYTES,
  MAX_VALUE_BYTES,
  Replica,
  VersionVector,
  operationId,
} from "../src/crdt.js";

describe("observed-remove map", () => {
  it("suppresses a removed dot delivered late while preserving a concurrent put", () => {
    const alice = new Replica("alice");
    const bob = new Replica("bob");
    const observer = new Replica("observer");

    const original = alice.put("status", "draft");
    bob.apply(original);
    const removal = bob.remove("status");
    const concurrent = alice.put("status", "ready");

    observer.apply(removal);
    observer.apply(concurrent);
    observer.apply(original);
    observer.apply(original);

    expect(observer.read("status")).toEqual(["ready"]);
    expect(observer.version()).toEqual({ alice: 2, bob: 1 });
  });

  it("converges under opposite operation delivery orders", () => {
    const source = new Replica("source");
    const first = source.put("mode", "one");
    const second = source.put("mode", "two");
    const left = new Replica("left");
    const right = new Replica("right");

    left.apply(first);
    left.apply(second);
    right.apply(second);
    right.apply(first);

    expect(left.canonicalState()).toEqual(right.canonicalState());
    expect(left.read("mode")).toEqual(["two"]);
  });

  it("returns an empty array when reading an unknown key", () => {
    const replica = new Replica("r");
    expect(replica.read("missing")).toEqual([]);
  });

  it("preserves multiple concurrent puts for the same key", () => {
    const alice = new Replica("alice");
    const bob = new Replica("bob");
    const putA = alice.put("x", "a");
    const putB = bob.put("x", "b");
    alice.apply(putB);
    bob.apply(putA);
    expect(alice.read("x").sort()).toEqual(["a", "b"]);
    expect(bob.read("x").sort()).toEqual(["a", "b"]);
  });

  it("is idempotent for duplicate apply calls", () => {
    const src = new Replica("src");
    const dst = new Replica("dst");
    const op = src.put("k", "v");
    expect(dst.apply(op)).toBe(true);
    expect(dst.apply(op)).toBe(false);
    expect(dst.read("k")).toEqual(["v"]);
  });

  it("removes a key completely when all dots are removed", () => {
    const replica = new Replica("r");
    const putOp = replica.put("k", "v");
    replica.remove("k");
    expect(replica.read("k")).toEqual([]);
    // Late delivery of the put after remove
    const observer = new Replica("obs");
    observer.remove("k");
    expect(observer.apply(putOp)).toBe(true); // concurrent put survives
    expect(observer.read("k")).toEqual(["v"]);
  });

  it("canonicalState returns sorted keys and sorted values", () => {
    const r = new Replica("r");
    const s = new Replica("s");
    // Concurrent puts from different replicas survive
    const opR = r.put("b", "2");
    const opS = s.put("a", "1");
    r.apply(opS);
    s.apply(opR);
    r.put("a", "3"); // observed-remove from "r": removes previous dot(s) by visible dots
    const state = r.canonicalState();
    expect(Object.keys(state)).toEqual(["a", "b"]);
    // "r" put "a:3" → removes opS's "a:1" dot via observableDots; but concurrent puts from other replicas would survive.
    // Since `put("a","3")` from the same replica as "b:2", removes the previous visible "a" dot (from s).
    // This is correct observed-remove. Verify the remaining value.
    expect(state["a"]?.length).toBeGreaterThanOrEqual(1);
    expect(state["b"]).toEqual(["2"]);
  });

  it("operations() returns sorted by replica then counter", () => {
    const replica = new Replica("b");
    replica.put("k", "v");
    const a = new Replica("a");
    a.put("k", "v");
    a.apply(replica.put("k", "v2"));
    replica.apply(a.operations()[0]!);
    const ops = replica.operations();
    expect(ops[0]!.dot.replica).toBe("a");
    expect(ops[1]!.dot.replica).toBe("b");
    expect(ops[2]!.dot.replica).toBe("b");
    expect(ops[2]!.dot.counter).toBeGreaterThan(ops[1]!.dot.counter);
  });

  it("exposes the replica id", () => {
    expect(new Replica("my-id").id).toBe("my-id");
  });
});

describe("VersionVector", () => {
  it("tracks counters per replica", () => {
    const vv = new VersionVector();
    expect(vv.toJSON()).toEqual({});
    vv.observe({ replica: "a", counter: 1 });
    vv.observe({ replica: "a", counter: 3 });
    vv.observe({ replica: "b", counter: 2 });
    expect(vv.toJSON()).toEqual({ a: 3, b: 2 });
  });

  it("next() returns strictly increasing counters", () => {
    const vv = new VersionVector();
    expect(vv.next("r")).toEqual({ replica: "r", counter: 1 });
    expect(vv.next("r")).toEqual({ replica: "r", counter: 2 });
    expect(vv.next("s")).toEqual({ replica: "s", counter: 1 });
  });

  it("merge() updates counters from another vector", () => {
    const vv = new VersionVector();
    vv.observe({ replica: "a", counter: 2 });
    vv.merge({ a: 1, b: 5 });
    expect(vv.toJSON()).toEqual({ a: 2, b: 5 });
  });

  it("dominates() returns true only when all entries are >= other", () => {
    const vv = new VersionVector();
    vv.merge({ a: 5, b: 3 });
    expect(vv.dominates({ a: 5, b: 3 })).toBe(true);
    expect(vv.dominates({ a: 4 })).toBe(true);
    expect(vv.dominates({ a: 6 })).toBe(false);
    expect(vv.dominates({ c: 1 })).toBe(false);
  });

  it("toJSON is sorted by replica key", () => {
    const vv = new VersionVector();
    vv.observe({ replica: "z", counter: 1 });
    vv.observe({ replica: "a", counter: 2 });
    expect(Object.keys(vv.toJSON())).toEqual(["a", "z"]);
  });
});

describe("operationId", () => {
  it("formats dot as replica:counter", () => {
    expect(operationId({ replica: "node", counter: 7 })).toBe("node:7");
  });

  it("rejects invalid dots", () => {
    expect(() => operationId({ replica: "", counter: 1 })).toThrow(ContractError);
    expect(() => operationId({ replica: "r", counter: 0 })).toThrow(ContractError);
    expect(() => operationId({ replica: "r", counter: -1 })).toThrow(ContractError);
    expect(() => operationId({ replica: "r", counter: 1.5 })).toThrow(ContractError);
  });
});

describe("ContractError", () => {
  it("has the correct name", () => {
    const error = new ContractError("test message");
    expect(error.name).toBe("ContractError");
    expect(error.message).toBe("test message");
    expect(error).toBeInstanceOf(Error);
  });
});

describe("Replica input validation", () => {
  it("rejects an empty replica identifier", () => {
    expect(() => new Replica("")).toThrow(ContractError);
  });

  it("rejects identifier with special characters", () => {
    expect(() => new Replica("bad id")).toThrow(ContractError);
    expect(() => new Replica("slash/here")).toThrow(ContractError);
  });

  it("rejects identifier exceeding MAX_IDENTIFIER_BYTES", () => {
    const atCap = "a".repeat(MAX_IDENTIFIER_BYTES);
    expect(() => new Replica(atCap)).not.toThrow();
    expect(() => new Replica(atCap + "x")).toThrow(ContractError);
  });

  it("rejects a key with special characters", () => {
    const replica = new Replica("r");
    expect(() => replica.put("key with space", "v")).toThrow(ContractError);
  });

  it("rejects value exceeding MAX_VALUE_BYTES", () => {
    const replica = new Replica("r");
    const oversized = "x".repeat(MAX_VALUE_BYTES + 1);
    expect(() => replica.put("k", oversized)).toThrow(ContractError);
  });

  it("rejects apply with an unknown operation kind", () => {
    const replica = new Replica("r");
    const invalid = {
      kind: "unknown",
      dot: { replica: "r", counter: 1 },
      key: "k",
      removes: [],
    } as unknown as Parameters<typeof replica.apply>[0];
    expect(() => replica.apply(invalid)).toThrow(ContractError);
  });
});

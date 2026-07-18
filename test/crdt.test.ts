import { describe, expect, it } from "vitest";
import { Replica } from "../src/crdt.js";

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
});

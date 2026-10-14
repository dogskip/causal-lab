import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { jcs, ownJson, parseJsonText } from "../src/verify/json.js";
import { sha256Bytes } from "../src/sha256.js";

describe("RFC 8785 and bounded recursive input", () => {
  it("matches the RFC primitive serialization and UTF-16 property order", () => {
    expect(
      jcs({
        numbers: [Number("333333333.33333329"), 1e30, 4.5, 2e-3, 1e-27],
        literals: [null, true, false],
      }),
    ).toBe(
      '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27]}',
    );
    const input = Object.fromEntries(
      ["\u20ac", "\r", "\ufb33", "1", "😀", "\u0080", "ö"].map((key) => [
        key,
        1,
      ]),
    );
    expect(jcs(input)).toBe(
      '{"\\r":1,"1":1,"\u0080":1,"ö":1,"€":1,"😀":1,"דּ":1}',
    );
    expect(jcs([-0, 1e-7, 1e-6, 1e21])).toBe("[0,1e-7,0.000001,1e+21]");
  });

  it("rejects duplicate names including escaped duplicates before they can disappear", () => {
    for (const raw of [
      '{"a":1,"a":2}',
      '{"a":1,"\\u0061":2}',
      '{"nested":{"x":1,"x":2}}',
    ])
      expect(() => parseJsonText(raw)).toThrow(/duplicate/);
    expect(parseJsonText('{"a":{"x":1},"b":{"x":2}}')).toEqual({
      a: { x: 1 },
      b: { x: 2 },
    });
  });

  it("rejects invalid Unicode, non-finite values and unsupported JavaScript objects", () => {
    for (const input of [
      NaN,
      Infinity,
      "\ud800",
      "\udfff",
      new Date(),
      { value: undefined },
      [undefined],
      BigInt(1),
    ])
      expect(() => ownJson(input)).toThrow();
    expect(() => parseJsonText('"\\ud800"')).toThrow(/Unicode/);
    expect(() => parseJsonText("1e999")).toThrow(/finite/);
  });

  it("copies and freezes returned values without freezing target state", () => {
    const input = { nested: { value: 1 } };
    const copy = ownJson(input);
    input.nested.value = 2;
    expect(copy).toEqual({ nested: { value: 1 } });
    expect(Object.isFrozen(copy)).toBe(true);
    expect(Object.isFrozen(input)).toBe(false);
    const proto = parseJsonText('{"__proto__":{"safe":1}}');
    expect(Object.hasOwn(proto as object, "__proto__")).toBe(true);
  });

  it("rejects 10000-level input and circular references with a controlled limit", () => {
    expect(() =>
      parseJsonText("[".repeat(10_000) + "0" + "]".repeat(10_000)),
    ).toThrow(/depth/);
    const cycle: { next?: unknown } = {};
    cycle.next = cycle;
    expect(() => ownJson(cycle)).toThrow(/circular/);
    let deep: unknown = 0;
    for (let i = 0; i < 10_000; i += 1) deep = [deep];
    expect(() => ownJson(deep)).toThrow(/depth/);
    expect(() => parseJsonText(" ".repeat(2_097_153), 2_097_152)).toThrow(
      /bytes/,
    );
  });

  it("hashes original binary bytes exactly like native SHA-256", () => {
    for (const size of [0, 1, 55, 56, 64, 257, 4096]) {
      const bytes = Uint8Array.from({ length: size }, (_, i) => i % 256);
      expect(sha256Bytes(bytes)).toBe(
        createHash("sha256").update(bytes).digest("hex"),
      );
    }
  });
});
it("rejects array subclasses and hidden properties instead of silently dropping data", () => {
  const value = [1];
  Object.defineProperty(value, "hidden", { value: 2 });
  expect(() => ownJson(value)).toThrow();
  class Special extends Array<number> {}
  expect(() => ownJson(new Special(1))).toThrow();
});

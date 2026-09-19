import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseScenario, scenarioIdentity } from "../src/scenario.js";
import { sha256Hex } from "../src/sha256.js";

const nodeDigest = (value: string): string => createHash("sha256").update(value).digest("hex");

describe("sha256Hex", () => {
  it("matches the published vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("matches node:crypto at every padding boundary", () => {
    for (const length of [0, 1, 54, 55, 56, 57, 63, 64, 65, 127, 128, 1000, 10_000]) {
      const value = "a".repeat(length);
      expect(sha256Hex(value)).toBe(nodeDigest(value));
    }
  });

  it("matches node:crypto for multibyte text and lone surrogates", () => {
    // deslop-ignore-next-line 15: the emoji is a 4-byte UTF-8 fixture, not decoration.
    for (const value of ["한글", "é", "🎧", "\ud800", "a\ud800b", "\u0000\0\0", "분할-복구"]) {
      expect(sha256Hex(value)).toBe(nodeDigest(value));
    }
  });

  it("keeps scenario receipts byte-identical to node:crypto", () => {
    const scenario = parseScenario({
      config: {
        replicas: ["a", "b"],
        seed: 19,
        minLatency: 1,
        maxLatency: 3,
        dropRate: 0.25,
        duplicateRate: 0.5,
      },
      steps: [
        { at: 0, action: "partition", left: "a", right: "b" },
        { at: 1, action: "put", replica: "a", key: "mode", value: "safe" },
        { at: 5, action: "heal" },
      ],
    });
    const { id, canonical } = scenarioIdentity(scenario);
    expect(id).toBe(
      createHash("sha256")
        .update("causal-lab-json-v1")
        .update("\0")
        .update(canonical)
        .digest("hex"),
    );
  });
});

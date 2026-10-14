import { describe, expect, it } from "vitest";
import {
  executeVerification,
  replayVerification,
} from "../src/verify/runtime.js";
import { createInvariantSet } from "../src/verify/checks.js";
import { parseVerificationCase } from "../src/verify/case.js";
import type {
  Context,
  Json,
  Manifest,
  ModelAdapter,
  VerifierOptions,
} from "../src/verify/types.js";

type State = { value: Record<string, Json> };
const engine = {
  engineVersion: "test-v2",
  engineSha256: "e".repeat(64),
  lockSha256: "f".repeat(64),
  randomVersion: "mulberry32-v1",
  schedulerVersion: "arrival-sequence-v1",
  canonicalization: "RFC8785",
} as const;
const base = () => ({
  format_version: 2,
  model_id: "fixture-map",
  profile: "independent-updates",
  replicas: ["a", "b", "c"],
  bootstrap: { a: {}, b: {}, c: {} },
  seed: 19,
  network: { minLatency: 0, maxLatency: 0, dropRate: 1, duplicateRate: 1 },
  steps: [
    {
      at: 0,
      action: "command",
      replica: "a",
      command: { action: "put", key: "k", value: "v" },
    },
    { at: 1, action: "heal" },
  ],
  checks: [
    { id: "convergence", parameters: null },
    { id: "expected-state", parameters: { state: { k: "v" } } },
  ],
});
function fixture(mode = "normal"): {
  options: VerifierOptions<State>;
  closed: string[];
  created: string[];
} {
  const closed: string[] = [];
  const created: string[] = [];
  const states = new Map<State, string>();
  const manifest: Manifest = {
    adapterApi: "causal-lab-adapter-v2",
    model_id: "fixture-map",
    adapterId: "fixture-map",
    adapterVersion: "1",
    adapterSha256: "a".repeat(64),
    implementation: {
      name: "fixture",
      version: "1",
      integrity: "sha256:" + "b".repeat(64),
    },
    profile: "independent-updates",
    recoveryPolicy: "full-state-exchange-v1",
    observationVersion: "values-v1",
    supportedCommands: ["put", "remove", "noop", "deny"],
    supportedChecks: ["convergence", "expected-state"],
  };
  const outgoing = (value: Json, to: string, context: Context) => ({
    to,
    sessionId: context.sessionId,
    bytes: new TextEncoder().encode(JSON.stringify(value)),
  });
  const adapter: ModelAdapter<State> = {
    manifest,
    create(_bootstrap, context) {
      const state = { value: {} };
      states.set(state, context.replica);
      created.push(context.replica);
      return state;
    },
    command(state, input, context) {
      const command = input as { action: string; key: string; value: string };
      if (command.action === "deny")
        return {
          outcome: "rejected",
          result: { reason: "policy" },
          outgoing: [],
        };
      if (command.action === "noop")
        return { outcome: "accepted", result: null, outgoing: [] };
      if (mode === "throw") {
        state.value.bad = true;
        throw new Error("private exception");
      }
      if (command.action === "remove") delete state.value[command.key];
      else if (mode !== "wrong-accept")
        state.value[command.key] = command.value;
      return {
        outcome: "accepted",
        result: null,
        outgoing: ["a", "b", "c"]
          .filter((peer) => peer !== context.replica)
          .map((peer) => outgoing(state.value, peer, context)),
      };
    },
    receive(state, _from, _session, bytes) {
      Object.assign(
        state.value,
        JSON.parse(new TextDecoder().decode(bytes)) as object,
      );
      return [];
    },
    reconcile(state, peer, _session, context) {
      return mode === "empty-recovery"
        ? []
        : [outgoing(state.value, peer, context)];
    },
    observe(state) {
      return state.value;
    },
    close(state) {
      closed.push(states.get(state) as string);
    },
  };
  return {
    options: {
      adapter,
      invariants: createInvariantSet("c".repeat(64)),
      engine,
    },
    closed,
    created,
  };
}

describe("committed verification and recovery", () => {
  it("uses all six reliable directed exchanges despite complete configured loss", () => {
    const ctx = fixture();
    const bundle = executeVerification(base(), ctx.options);
    expect(bundle.receipt.status).toBe("passed");
    expect(bundle.receipt.recovery?.expectedPairs).toHaveLength(6);
    expect(bundle.receipt.recovery?.completedPairs).toHaveLength(6);
    expect(
      bundle.receipt.recovery?.requiredMessages.every(
        (entry) => entry.receivedAtSequence !== null,
      ),
    ).toBe(true);
    expect(bundle.receipt.finalStates).toEqual({
      a: { k: "v" },
      b: { k: "v" },
      c: { k: "v" },
    });
    expect(ctx.closed).toEqual(["a", "b", "c"]);
    expect(replayVerification(bundle, fixture().options).run_id).toBe(
      bundle.run_id,
    );
  });
  it("detects converged wrong accepted values with an independent rule", () => {
    const bundle = executeVerification(base(), fixture("wrong-accept").options);
    expect(bundle.receipt.status).toBe("failed");
    expect(
      bundle.receipt.checks.some(
        (entry) =>
          entry.result.checkId === "expected-state" && !entry.result.passed,
      ),
    ).toBe(true);
    expect(
      replayVerification(bundle, fixture("wrong-accept").options).run_id,
    ).toBe(bundle.run_id);
  });
  it("records accepted no-ops and rejected commands separately", () => {
    const source = base();
    source.steps.unshift(
      {
        at: 0,
        action: "command",
        replica: "a",
        command: { action: "noop", key: "k", value: "v" },
      },
      {
        at: 0,
        action: "command",
        replica: "a",
        command: { action: "deny", key: "k", value: "v" },
      },
    );
    const bundle = executeVerification(source, fixture().options);
    expect(bundle.receipt.status).toBe("passed");
    expect(
      bundle.receipt.events
        .filter((entry) => entry.kind === "command")
        .map((entry) => entry.outcome),
    ).toEqual(["accepted", "rejected", "accepted"]);
    expect(bundle.receipt.counts).toMatchObject({
      attemptedCommands: 3,
      committedCommands: 3,
      acceptedCommands: 2,
      rejectedCommands: 1,
    });
  });
  it("never reuses completed recovery after a new command or partition", () => {
    for (const step of [
      {
        at: 2,
        action: "command",
        replica: "a",
        command: { action: "noop", key: "k", value: "v" },
      },
      { at: 2, action: "partition", left: "a", right: "b" },
    ]) {
      const source = { ...base(), steps: [...base().steps, step] };
      expect(
        executeVerification(source, fixture().options).receipt.status,
      ).toBe("inconclusive");
    }
  });
  it("keeps the last committed observations on adapter exception and releases every replica", () => {
    const ctx = fixture("throw");
    const bundle = executeVerification(base(), ctx.options);
    expect(bundle.receipt.status).toBe("error");
    expect(bundle.receipt.finalStates).toEqual({ a: {}, b: {}, c: {} });
    expect(bundle.receipt.events).toEqual([]);
    expect(ctx.closed).toHaveLength(3);
  });
  it("treats missing recovery messages and missing final recovery as non-pass", () => {
    expect(
      executeVerification(base(), fixture("empty-recovery").options).receipt
        .status,
    ).toBe("error");
    expect(
      executeVerification(
        { ...base(), steps: base().steps.slice(0, 1) },
        fixture().options,
      ).receipt.status,
    ).toBe("inconclusive");
  });
  it("terminates at a controlled network limit without accepting the failed attempt", () => {
    const ctx = fixture();
    const bundle = executeVerification(base(), {
      ...ctx.options,
      limits: { maxEvents: 1 },
    });
    expect(bundle.receipt.status).toBe("inconclusive");
    expect(bundle.receipt.events).toEqual([]);
    expect(bundle.receipt.finalStates).toEqual({ a: {}, b: {}, c: {} });
    expect(ctx.closed).toHaveLength(3);
  });
  it("rejects unsupported command/check/metadata before creating a target", () => {
    const ctx = fixture();
    expect(() =>
      executeVerification(
        {
          ...base(),
          checks: [
            { id: "convergence", parameters: null },
            { id: "missing", parameters: null },
          ],
        },
        ctx.options,
      ),
    ).toThrow(/check/);
    expect(ctx.created).toEqual([]);
    expect(() =>
      replayVerification(executeVerification(base(), fixture().options), {
        ...ctx.options,
        engine: { ...engine, engineVersion: "changed" },
      }),
    ).toThrow(/manifest/);
  });
  it("copies observations so later local mutation cannot rewrite earlier events", () => {
    const source = base();
    source.network.dropRate = 0;
    source.steps.splice(1, 0, {
      at: 0,
      action: "command",
      replica: "a",
      command: { action: "put", key: "later", value: "value" },
    });
    const bundle = executeVerification(source, fixture().options);
    const first = bundle.receipt.events.find(
      (entry) => entry.kind === "command",
    );
    expect(first?.state_after).toEqual({ k: "v" });
    expect(Object.isFrozen(first?.state_after)).toBe(true);
    expect(parseVerificationCase(source).steps).toHaveLength(3);
  });
});

it("bounds an endless response exchange and retains a valid partial receipt", () => {
  const ctx = fixture();
  ctx.options.adapter.receive = (_state, from, session, bytes) => [
    { to: from, sessionId: session, bytes },
  ];
  const bundle = executeVerification(base(), {
    ...ctx.options,
    limits: { maxEvents: 20 },
  });
  expect(bundle.receipt.status).toBe("inconclusive");
  expect(bundle.receipt.counts.scheduledMessages).toBe(20);
  expect(ctx.closed).toHaveLength(3);
  expect(() =>
    replayVerification(bundle, {
      ...fixture().options,
      limits: { maxEvents: 20 },
    }),
  ).toThrow();
});
it("pins target methods and check phases before target execution", () => {
  const ctx = fixture();
  const original = ctx.options.adapter.command.bind(ctx.options.adapter);
  ctx.options.adapter.create = (_bootstrap, context) => {
    ctx.created.push(context.replica);
    ctx.options.adapter.command = () => {
      throw new Error("registry changed");
    };
    return { value: {} };
  };
  ctx.options.adapter.command = original;
  const bundle = executeVerification(base(), ctx.options);
  expect(bundle.receipt.status).toBe("passed");
});

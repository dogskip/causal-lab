import { ContractError } from "../crdt.js";
import { hashOf, jcs, objectOf, ownJson } from "./json.js";
import type { Invariant } from "./types.js";

export function createInvariantSet(sha256: string): readonly Invariant[] {
  hashOf(sha256, "invariant source hash");
  return Object.freeze([
    {
      id: "convergence",
      version: "1",
      sha256,
      phases: ["recovery", "final"],
      check(context) {
        const expected = objectOf(context.caseDefinition, "case").replicas;
        if (
          !Array.isArray(expected) ||
          Object.keys(context.states).length !== expected.length ||
          expected.some(
            (id) =>
              typeof id !== "string" || !Object.hasOwn(context.states, id),
          )
        )
          throw new ContractError(
            "observation replica membership does not match the definition",
          );
        if (!context.completedRecovery)
          throw new ContractError("convergence requires completed recovery");
        const values = Object.values(context.states).map(jcs);
        const passed = values.every((value) => value === values[0]);
        return {
          checkId: "convergence",
          passed,
          reason: passed
            ? "all recorded observations agree after completed recovery"
            : "recorded observations differ after completed recovery",
          evidence: ownJson({ replicas: expected }),
        };
      },
    },
    {
      id: "expected-state",
      version: "1",
      sha256,
      phases: ["final"],
      check(context, parameters) {
        const expected = objectOf(parameters, "expected-state parameters", [
          "state",
        ]);
        if (!Object.hasOwn(expected, "state"))
          throw new ContractError("expected state is required");
        const wanted = jcs(expected.state);
        const passed = Object.values(context.states).every(
          (state) => jcs(state) === wanted,
        );
        return {
          checkId: "expected-state",
          passed,
          reason: passed
            ? "observations preserve the independent expected state"
            : "observations do not match the independent expected state",
          evidence: ownJson({ expected: expected.state }),
        };
      },
    },
  ] satisfies Invariant[]);
}

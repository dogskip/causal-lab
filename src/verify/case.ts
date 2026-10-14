import { ContractError, utf8Length } from "../crdt.js";
import { identifier, jcs, objectOf, type Json } from "./json.js";
import type { VerificationCase, VerificationStep } from "./types.js";

export const MAX_CASE_BYTES = 2 * 1024 * 1024;

function integer(
  input: unknown,
  label: string,
  min: number,
  max: number,
): number {
  if (
    typeof input !== "number" ||
    !Number.isSafeInteger(input) ||
    input < min ||
    input > max
  )
    throw new ContractError(`${label} is outside its integer range`);
  return input;
}
function probability(input: unknown, label: string): number {
  if (
    typeof input !== "number" ||
    !Number.isFinite(input) ||
    input < 0 ||
    input > 1
  )
    throw new ContractError(`${label} must be between zero and one`);
  return input;
}

export function parseVerificationCase(input: unknown): VerificationCase {
  const source = objectOf(input, "verification case", [
    "format_version",
    "model_id",
    "profile",
    "replicas",
    "bootstrap",
    "seed",
    "network",
    "steps",
    "checks",
  ]);
  if (utf8Length(jcs(source)) > MAX_CASE_BYTES)
    throw new ContractError("verification case exceeds maximum bytes");
  if (source.format_version !== 2)
    throw new ContractError("verification case format_version must be 2");
  if (source.profile !== "independent-updates")
    throw new ContractError("delivery profile is not supported");
  const model_id = identifier(source.model_id, "model_id");
  if (
    !Array.isArray(source.replicas) ||
    source.replicas.length < 1 ||
    source.replicas.length > 12
  )
    throw new ContractError("replicas must contain 1 to 12 identifiers");
  const replicas = source.replicas.map((replica) =>
    identifier(replica, "replica"),
  );
  if (new Set(replicas).size !== replicas.length)
    throw new ContractError("replica identifiers must be unique");
  const membership = new Set(replicas);
  const bootstrap = objectOf(source.bootstrap, "bootstrap");
  if (
    Object.keys(bootstrap).length !== replicas.length ||
    Object.keys(bootstrap).some((replica) => !membership.has(replica))
  )
    throw new ContractError(
      "bootstrap replica membership must match the definition",
    );
  const networkInput = objectOf(source.network, "network", [
    "minLatency",
    "maxLatency",
    "dropRate",
    "duplicateRate",
  ]);
  const minLatency = integer(networkInput.minLatency, "minLatency", 0, 60_000);
  const maxLatency = integer(
    networkInput.maxLatency,
    "maxLatency",
    minLatency,
    60_000,
  );
  const network = Object.freeze({
    minLatency,
    maxLatency,
    dropRate: probability(networkInput.dropRate, "dropRate"),
    duplicateRate: probability(networkInput.duplicateRate, "duplicateRate"),
  });
  const replica = (value: unknown): string => {
    const name = identifier(value, "step replica");
    if (!membership.has(name))
      throw new ContractError("step references an unknown replica");
    return name;
  };
  if (!Array.isArray(source.steps) || source.steps.length > 1000)
    throw new ContractError("steps must contain at most 1000 entries");
  let previous = 0;
  const steps = source.steps.map((item): VerificationStep => {
    const step = objectOf(item, "step");
    const at = integer(step.at, "step time", previous, 1_000_000_000);
    previous = at;
    if (step.action === "heal") {
      objectOf(step, "heal step", ["at", "action"]);
      return Object.freeze({ at, action: "heal" });
    }
    if (step.action === "partition") {
      objectOf(step, "partition step", ["at", "action", "left", "right"]);
      const left = replica(step.left);
      const right = replica(step.right);
      if (left === right)
        throw new ContractError(
          "partition must reference two different replicas",
        );
      return Object.freeze({ at, action: "partition", left, right });
    }
    if (step.action === "command") {
      objectOf(step, "command step", ["at", "action", "replica", "command"]);
      const command = objectOf(step.command, "command");
      identifier(command.action, "command action");
      return Object.freeze({
        at,
        action: "command",
        replica: replica(step.replica),
        command,
      });
    }
    throw new ContractError("step action is not supported");
  });
  if (
    !Array.isArray(source.checks) ||
    source.checks.length < 1 ||
    source.checks.length > 32
  )
    throw new ContractError(
      "checks must contain convergence and at most 32 entries",
    );
  const checks = source.checks.map((item) => {
    const check = objectOf(item, "check", ["id", "parameters"]);
    if (!Object.hasOwn(check, "parameters"))
      throw new ContractError("check parameters are required");
    return Object.freeze({
      id: identifier(check.id, "check id"),
      parameters: check.parameters as Json,
    });
  });
  if (new Set(checks.map((check) => check.id)).size !== checks.length)
    throw new ContractError("check ids must be unique");
  if (!checks.some((check) => check.id === "convergence"))
    throw new ContractError("convergence is a required check");
  return Object.freeze({
    format_version: 2,
    model_id,
    profile: "independent-updates",
    replicas: Object.freeze(replicas),
    bootstrap,
    seed: integer(source.seed, "seed", 0, 0xffff_ffff),
    network,
    steps: Object.freeze(steps),
    checks: Object.freeze(checks),
  });
}

import { ContractError, utf8Length } from "../crdt.js";
import { hashOf, identifier, jcs, objectOf, ownJson } from "./json.js";
import type {
  EngineIdentity,
  ExecutionManifest,
  Invariant,
  Manifest,
  ModelAdapter,
  Phase,
  VerificationCase,
} from "./types.js";

const PHASES: readonly Phase[] = [
  "initial",
  "command",
  "delivery",
  "recovery",
  "final",
];
function text(input: unknown, label: string, max = 4096): string {
  if (
    typeof input !== "string" ||
    input.length < 1 ||
    !input.isWellFormed() ||
    utf8Length(input) > max
  )
    throw new ContractError(`${label} must be a bounded string`);
  return input;
}
export function validateManifest(input: unknown): Manifest {
  const source = objectOf(input, "adapter manifest", [
    "adapterApi",
    "model_id",
    "adapterId",
    "adapterVersion",
    "adapterSha256",
    "implementation",
    "profile",
    "recoveryPolicy",
    "observationVersion",
    "supportedCommands",
    "supportedChecks",
  ]);
  if (
    source.adapterApi !== "causal-lab-adapter-v2" ||
    source.profile !== "independent-updates" ||
    source.recoveryPolicy !== "full-state-exchange-v1"
  )
    throw new ContractError("adapter manifest contract is not supported");
  const implementation = objectOf(source.implementation, "implementation", [
    "name",
    "version",
    "integrity",
  ]);
  const list = (input: unknown, label: string): readonly string[] => {
    if (!Array.isArray(input) || input.length > 64)
      throw new ContractError(`${label} must be a bounded array`);
    const result = input.map((value) => identifier(value, label));
    if (new Set(result).size !== result.length)
      throw new ContractError(`${label} must be unique`);
    return Object.freeze(result);
  };
  return Object.freeze({
    adapterApi: "causal-lab-adapter-v2",
    model_id: identifier(source.model_id, "model_id"),
    adapterId: identifier(source.adapterId, "adapterId"),
    adapterVersion: text(source.adapterVersion, "adapterVersion", 128),
    adapterSha256: hashOf(source.adapterSha256, "adapterSha256"),
    implementation: Object.freeze({
      name: text(implementation.name, "implementation name", 128),
      version: text(implementation.version, "implementation version", 128),
      integrity: text(implementation.integrity, "implementation integrity"),
    }),
    profile: "independent-updates",
    recoveryPolicy: "full-state-exchange-v1",
    observationVersion: identifier(
      source.observationVersion,
      "observationVersion",
    ),
    supportedCommands: list(source.supportedCommands, "supportedCommands"),
    supportedChecks: list(source.supportedChecks, "supportedChecks"),
  });
}
export function buildManifest<S>(
  definition: VerificationCase,
  adapter: ModelAdapter<S>,
  invariants: readonly Invariant[],
  engineInput: EngineIdentity,
): ExecutionManifest {
  for (const method of [
    "create",
    "command",
    "receive",
    "reconcile",
    "observe",
    "close",
  ] as const)
    if (typeof adapter[method] !== "function")
      throw new ContractError(`adapter ${method} is missing`);
  const manifest = validateManifest(adapter.manifest);
  if (
    manifest.model_id !== definition.model_id ||
    manifest.profile !== definition.profile
  )
    throw new ContractError(
      "adapter does not match case model or delivery profile",
    );
  for (const step of definition.steps)
    if (
      step.action === "command" &&
      !manifest.supportedCommands.includes(
        objectOf(step.command, "command").action as string,
      )
    )
      throw new ContractError("command is not supported by the adapter");
  const engine = objectOf(engineInput, "engine identity", [
    "engineVersion",
    "engineSha256",
    "lockSha256",
    "randomVersion",
    "schedulerVersion",
    "canonicalization",
  ]);
  if (
    engine.randomVersion !== "mulberry32-v1" ||
    engine.schedulerVersion !== "arrival-sequence-v1" ||
    engine.canonicalization !== "RFC8785"
  )
    throw new ContractError("engine manifest contract is not supported");
  const registry = new Map<string, Invariant>();
  for (const invariant of invariants) {
    identifier(invariant.id, "check id");
    hashOf(invariant.sha256, "check code hash");
    text(invariant.version, "check version", 128);
    if (typeof invariant.check !== "function" || registry.has(invariant.id))
      throw new ContractError("check registry is invalid or duplicated");
    if (
      !Array.isArray(invariant.phases) ||
      invariant.phases.length < 1 ||
      (invariant.phases as readonly unknown[]).some(
        (phase) => !PHASES.includes(phase as Phase),
      )
    )
      throw new ContractError("check phases are invalid");
    registry.set(invariant.id, invariant);
  }
  const checks = definition.checks.map(({ id }) => {
    const check = registry.get(id);
    if (check === undefined || !manifest.supportedChecks.includes(id))
      throw new ContractError("requested check is not registered or supported");
    if (id === "convergence" && !check.phases.includes("final"))
      throw new ContractError("convergence check must include the final phase");
    return Object.freeze({
      id,
      version: check.version,
      sha256: check.sha256,
      phases: Object.freeze([...check.phases]),
    });
  });
  return ownJson({
    ...manifest,
    engineVersion: text(engine.engineVersion, "engineVersion", 128),
    engineSha256: hashOf(engine.engineSha256, "engineSha256"),
    lockSha256: hashOf(engine.lockSha256, "lockSha256"),
    randomVersion: "mulberry32-v1",
    schedulerVersion: "arrival-sequence-v1",
    canonicalization: "RFC8785",
    checks,
  }) as ExecutionManifest;
}
export function sameManifest(
  left: ExecutionManifest,
  right: ExecutionManifest,
): boolean {
  return jcs(left) === jcs(right);
}

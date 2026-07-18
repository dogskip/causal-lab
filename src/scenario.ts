import { createHash } from "node:crypto";
import { ContractError } from "./crdt.js";
import { Simulation, type SimulationConfig, type SimulationReport } from "./simulation.js";

export const MAX_STEPS = 1_000;
export const CANONICALIZATION = "causal-lab-json-v1";

export type ScenarioStep =
  | Readonly<{ at: number; action: "put"; replica: string; key: string; value: string }>
  | Readonly<{ at: number; action: "remove"; replica: string; key: string }>
  | Readonly<{ at: number; action: "partition"; left: string; right: string }>
  | Readonly<{ at: number; action: "heal" }>;

export type Scenario = Readonly<{
  config: SimulationConfig;
  steps: readonly ScenarioStep[];
}>;

export function parseScenario(input: unknown): Scenario {
  const scenario = expectObject(input, ["config", "steps"], "scenario");
  const configInput = expectObject(
    scenario.config,
    ["replicas", "seed", "minLatency", "maxLatency", "dropRate", "duplicateRate"],
    "config",
  );
  if (!Array.isArray(configInput.replicas) || !configInput.replicas.every(isString)) {
    throw new ContractError("replicas must be strings");
  }
  if (!Array.isArray(scenario.steps) || scenario.steps.length > MAX_STEPS) {
    throw new ContractError(`steps must contain at most ${MAX_STEPS} entries`);
  }
  const config: SimulationConfig = {
    replicas: [...configInput.replicas],
    seed: expectNumber(configInput.seed, "seed"),
    minLatency: expectNumber(configInput.minLatency, "minLatency"),
    maxLatency: expectNumber(configInput.maxLatency, "maxLatency"),
    dropRate: expectNumber(configInput.dropRate, "dropRate"),
    duplicateRate: expectNumber(configInput.duplicateRate, "duplicateRate"),
  };

  let previousTime = 0;
  const steps = scenario.steps.map((inputStep): ScenarioStep => {
    const base = expectObject(inputStep, undefined, "step");
    const action = base.action;
    if (!isAction(action)) {
      throw new ContractError("step action is invalid");
    }
    const allowed = {
      put: ["at", "action", "replica", "key", "value"],
      remove: ["at", "action", "replica", "key"],
      partition: ["at", "action", "left", "right"],
      heal: ["at", "action"],
    }[action];
    const step = expectObject(inputStep, allowed, "step");
    const at = expectNumber(step.at, "step time");
    if (!Number.isSafeInteger(at) || at < previousTime || at > 1_000_000_000) {
      throw new ContractError("step times must be non-decreasing safe integers");
    }
    previousTime = at;
    switch (action) {
      case "put":
        return {
          at,
          action,
          replica: expectString(step.replica, "replica"),
          key: expectString(step.key, "key"),
          value: expectString(step.value, "value"),
        };
      case "remove":
        return {
          at,
          action,
          replica: expectString(step.replica, "replica"),
          key: expectString(step.key, "key"),
        };
      case "partition":
        return {
          at,
          action,
          left: expectString(step.left, "left replica"),
          right: expectString(step.right, "right replica"),
        };
      case "heal":
        return { at, action };
    }
  });
  return { config, steps };
}

export function executeScenario(scenario: Scenario): SimulationReport {
  const simulation = new Simulation(scenario.config);
  let previousTime = 0;
  for (const step of scenario.steps) {
    simulation.advance(step.at - previousTime);
    previousTime = step.at;
    switch (step.action) {
      case "put":
        simulation.put(step.replica, step.key, step.value);
        break;
      case "remove":
        simulation.remove(step.replica, step.key);
        break;
      case "partition":
        simulation.partition(step.left, step.right);
        break;
      case "heal":
        simulation.healAll();
        break;
    }
  }
  simulation.runUntilIdle();
  return simulation.report();
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ContractError("canonical JSON requires finite numbers");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new ContractError("value is not representable as canonical JSON");
}

export function scenarioIdentity(scenario: Scenario): Readonly<{ id: string; canonical: string }> {
  const canonical = canonicalJson(scenario);
  const id = createHash("sha256")
    .update(CANONICALIZATION)
    .update("\0")
    .update(canonical)
    .digest("hex");
  return { id, canonical };
}

function expectObject(
  value: unknown,
  allowed: readonly string[] | undefined,
  field: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ContractError(`${field} must be an object`);
  }
  const object = value as Record<string, unknown>;
  if (allowed !== undefined) {
    const allowedFields = new Set(allowed);
    if (Object.keys(object).some((key) => !allowedFields.has(key))) {
      throw new ContractError(`${field} contains an unknown field`);
    }
  }
  return object;
}

function expectString(value: unknown, field: string): string {
  if (!isString(value)) {
    throw new ContractError(`${field} must be a string`);
  }
  return value;
}

function expectNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ContractError(`${field} must be a finite number`);
  }
  return value;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isAction(value: unknown): value is ScenarioStep["action"] {
  return isString(value) && ["put", "remove", "partition", "heal"].includes(value);
}

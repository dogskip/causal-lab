import { operationId, type Operation } from "../src/crdt.js";
import type { ScenarioStep } from "../src/scenario.js";

/** Expected results computed outside the core. A disagreement is a counterexample. */

/** Per-key live values after an operation set reaches every replica. */
export function referenceState(operations: readonly Operation[]): Record<string, string[]> {
  const tombstones = new Set<string>();
  for (const operation of operations) {
    for (const removed of operation.removes) {
      tombstones.add(removed);
    }
  }
  const live = new Map<string, Map<string, string>>();
  for (const operation of operations) {
    if (operation.kind !== "put") {
      continue;
    }
    const id = operationId(operation.dot);
    if (tombstones.has(id)) {
      continue;
    }
    const values = live.get(operation.key) ?? new Map<string, string>();
    values.set(id, operation.value);
    live.set(operation.key, values);
  }
  return Object.fromEntries(
    [...live.keys()].sort().map((key) => [key, [...(live.get(key)?.values() ?? [])].sort()] as const),
  );
}

/**
 * The converged state for a scenario whose writes are concurrent and whose
 * removes run while the remover is partitioned from the other writers: a value
 * survives unless its own writer removed that key.
 */
export function expectedConvergedState(steps: readonly ScenarioStep[]): Record<string, string[]> {
  const writers = new Map<string, Map<string, string>>();
  const removers = new Map<string, Set<string>>();
  for (const step of steps) {
    if (step.action === "put") {
      const values = writers.get(step.key) ?? new Map<string, string>();
      values.set(step.value, step.replica);
      writers.set(step.key, values);
    } else if (step.action === "remove") {
      const replicas = removers.get(step.key) ?? new Set<string>();
      replicas.add(step.replica);
      removers.set(step.key, replicas);
    }
  }
  const expected: Array<readonly [string, string[]]> = [];
  for (const key of [...writers.keys()].sort()) {
    const removed = removers.get(key) ?? new Set<string>();
    const values = [...(writers.get(key)?.entries() ?? [])]
      .filter(([, replica]) => !removed.has(replica))
      .map(([value]) => value)
      .sort();
    if (values.length > 0) {
      expected.push([key, values]);
    }
  }
  return Object.fromEntries(expected);
}

/** Convergence recomputed from reported states: per-key value sets must match. */
export function statesAgree(
  states: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>,
): boolean {
  const all = Object.values(states);
  const first = all[0];
  if (first === undefined) {
    return true;
  }
  return all.every((state) => statesMatch(state, first));
}

function statesMatch(
  left: Readonly<Record<string, readonly string[]>>,
  right: Readonly<Record<string, readonly string[]>>,
): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    const leftValues = new Set(left[key] ?? []);
    const rightValues = new Set(right[key] ?? []);
    if (leftValues.size !== rightValues.size) {
      return false;
    }
    for (const value of leftValues) {
      if (!rightValues.has(value)) {
        return false;
      }
    }
  }
  return true;
}

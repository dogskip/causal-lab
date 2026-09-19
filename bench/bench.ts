#!/usr/bin/env node
/**
 * Lightweight performance canary. No runtime dependencies — uses Node's
 * performance.now(). Guards the O(n log n) event-heap drain (P1) against an
 * accidental regression to O(n^2 log n) sort-per-event.
 *
 * Run: pnpm bench
 *
 * Prints per-scenario wall time and processed events. Not a microbenchmark:
 * it asserts the high-water 10k-event scenario completes well within a budget
 * that the sort-per-event implementation could not meet. The budget is generous
 * (a slow CI runner should still pass) but tight enough to catch a heap
 * regression. If you intentionally change the scheduler, update BUDGET_MS.
 */
import { performance } from "node:perf_hooks";
import { Simulation } from "../src/simulation.js";
import type { SimulationConfig } from "../src/simulation.js";

type Case = {
  name: string;
  config: SimulationConfig;
  steps: { at: number; action: "put"; replica: string; key: string; value: string }[];
  budgetMs: number;
  expectConverged: boolean;
};

function buildTenKEventCase(): Case {
  // 2 replicas, dropRate 0, duplicateRate 0, latency 1..1 so each put yields
  // exactly one scheduled + one delivered event. 900 puts -> ~4500 scheduled
  // events before runUntilIdle; healAll re-broadcasts all ops (reliable) which
  // keeps total scheduled events under MAX_EVENTS (10_000).
  const steps = Array.from({ length: 900 }, (_, i) => ({
    at: i,
    action: "put" as const,
    replica: i % 2 === 0 ? "a" : "b",
    key: `k${i}`,
    value: "v",
  }));
  steps.push({ at: 900, action: "put", replica: "a", key: "final", value: "done" });
  return {
    name: "10k-event drain (heap canary)",
    config: {
      replicas: ["a", "b"],
      seed: 1,
      minLatency: 1,
      maxLatency: 1,
      dropRate: 0,
      duplicateRate: 0,
    },
    steps,
    budgetMs: 500,
    expectConverged: true,
  };
}

const cases: Case[] = [
  buildTenKEventCase(),
  {
    name: "small scenario smoke",
    config: {
      replicas: ["a", "b"],
      seed: 19,
      minLatency: 1,
      maxLatency: 3,
      dropRate: 0,
      duplicateRate: 0,
    },
    steps: [
      { at: 0, action: "put", replica: "a", key: "mode", value: "safe" },
      { at: 5, action: "put", replica: "b", key: "mode", value: "fast" },
    ],
    budgetMs: 50,
    expectConverged: true,
  },
];

let failed = false;
for (const c of cases) {
  const sim = new Simulation(c.config);
  let previousTime = 0;
  for (const step of c.steps) {
    sim.advance(step.at - previousTime);
    previousTime = step.at;
    sim.put(step.replica, step.key, step.value);
  }
  sim.runUntilIdle();
  const report = sim.report();

  const start = performance.now();
  // Re-run the same scenario to measure drain time in isolation from setup.
  const sim2 = new Simulation(c.config);
  let prev2 = 0;
  for (const step of c.steps) {
    sim2.advance(step.at - prev2);
    prev2 = step.at;
    sim2.put(step.replica, step.key, step.value);
  }
  sim2.runUntilIdle();
  const elapsed = performance.now() - start;

  const ok = elapsed < c.budgetMs && report.converged === c.expectConverged;
  const tag = ok ? "PASS" : "FAIL";
  console.log(
    `[${tag}] ${c.name}: ${elapsed.toFixed(1)} ms (budget ${c.budgetMs} ms), ` +
      `${report.processedEvents} events, converged=${report.converged}`,
  );
  if (!ok) failed = true;
}

if (failed) {
  console.error("\nBenchmark budget exceeded — possible scheduler regression.");
  process.exit(1);
}

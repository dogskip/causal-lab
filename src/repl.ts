#!/usr/bin/env node
/**
 * Interactive REPL for exploring the simulator without writing JSON.
 *
 * Why: a newcomer's first wall is "I have to hand-write a scenario JSON before
 * I see anything happen." The REPL lets them type `put a k v`, `partition a b`,
 * `heal`, `report` and watch convergence form live, then `mermaid` to see the
 * sequence diagram. Once they understand the model, the JSON format is obvious.
 *
 * Pure over the core: this file imports Simulation/traceToMermaid and touches
 * none of their internals. The simulator's determinism and contract are
 * unchanged. The REPL is a thin readline wrapper.
 *
 * Event-driven (not question/await): works identically with a TTY and with
 * piped stdin, so `printf 'put a k v\nheal\nreport\nexit\n' | pnpm repl` is
 * a valid smoke test.
 *
 * Run: pnpm repl
 */
import * as readline from "node:readline";
import { Simulation, type SimulationConfig } from "./simulation.js";
import { traceToMermaid } from "./trace.js";

const DEFAULT_CONFIG: SimulationConfig = {
  replicas: ["a", "b"],
  seed: 19,
  minLatency: 1,
  maxLatency: 3,
  dropRate: 0.25,
  duplicateRate: 0.5,
};

function help(): string {
  return [
    "commands:",
    "  put <replica> <key> <value>     write a value",
    "  remove <replica> <key>          remove a key (observed-remove)",
    "  partition <left> <right>        split the network between two replicas",
    "  heal                            clear all partitions + reliable anti-entropy",
    "  advance <ticks>                 advance virtual time",
    "  run                             drain all scheduled events (runUntilIdle) and report",
    "  report                          print convergence + states + version vectors",
    "  trace                           print the raw trace (compact)",
    "  mermaid                         print the trace as a Mermaid sequenceDiagram",
    "  reset                           discard the current simulation and start over",
    "  config <json>                   start over with a custom config (see README)",
    "  help                            show this help",
    "  exit                            quit",
  ].join("\n");
}

function main(): void {
  let config = DEFAULT_CONFIG;
  let sim = new Simulation(config);

  const rl = readline.createInterface({ input: process.stdin, terminal: false });

  console.log("causal-lab repl — type 'help' for commands, 'exit' to quit.");
  console.log(
    `config: replicas=${config.replicas.join(",")} seed=${config.seed} ` +
      `latency=${config.minLatency}..${config.maxLatency} drop=${config.dropRate} dup=${config.duplicateRate}`,
  );
  console.log("");

  const prompt = (): void => {
    if (process.stdin.isTTY) process.stdout.write("> ");
  };
  prompt();

  rl.on("line", (raw) => {
    const line = raw.trim();
    if (line === "") {
      prompt();
      return;
    }
    const [cmd, ...args] = line.split(/\s+/);
    try {
      switch (cmd) {
        case "exit":
        case "quit":
          rl.close();
          return;
        case "help":
          console.log(help());
          break;
        case "put": {
          const [replica, key, ...rest] = args;
          const value = rest.join(" ");
          if (replica === undefined || key === undefined || value === "") {
            console.log("usage: put <replica> <key> <value>");
            break;
          }
          sim.put(replica, key, value);
          console.log(`put ${replica}:${key}=${value}`);
          break;
        }
        case "remove": {
          const [replica, key] = args;
          if (replica === undefined || key === undefined) {
            console.log("usage: remove <replica> <key>");
            break;
          }
          sim.remove(replica, key);
          console.log(`remove ${replica}:${key}`);
          break;
        }
        case "partition": {
          const [left, right] = args;
          if (left === undefined || right === undefined) {
            console.log("usage: partition <left> <right>");
            break;
          }
          sim.partition(left, right);
          console.log(`partition ${left} <-> ${right}`);
          break;
        }
        case "heal":
          sim.healAll();
          console.log("heal");
          break;
        case "advance": {
          const ticks = Number(args[0] ?? 0);
          if (!Number.isSafeInteger(ticks) || ticks < 0) {
            console.log("usage: advance <non-negative integer>");
            break;
          }
          sim.advance(ticks);
          console.log(`advanced ${ticks} ticks (now=${sim.report().virtualTime})`);
          break;
        }
        case "run": {
          sim.runUntilIdle();
          const r = sim.report();
          console.log(
            `run: converged=${r.converged} virtualTime=${r.virtualTime} processedEvents=${r.processedEvents}`,
          );
          console.log(JSON.stringify(r.states, null, 2));
          break;
        }
        case "report": {
          const r = sim.report();
          console.log(
            JSON.stringify(
              {
                converged: r.converged,
                virtualTime: r.virtualTime,
                processedEvents: r.processedEvents,
                states: r.states,
                versions: r.versions,
              },
              null,
              2,
            ),
          );
          break;
        }
        case "trace": {
          const r = sim.report();
          for (const e of r.trace) {
            const op = e.operation ? ` ${e.operation}` : "";
            const fromTo =
              e.from && e.to ? ` ${e.from}->${e.to}` : e.from ? ` ${e.from}` : "";
            console.log(`#${e.sequence} t=${e.time} ${e.kind}${fromTo}${op}`);
          }
          break;
        }
        case "mermaid": {
          const r = sim.report();
          console.log(traceToMermaid(r.trace));
          break;
        }
        case "reset":
          sim = new Simulation(config);
          console.log("reset");
          break;
        case "config": {
          const json = args.join(" ");
          try {
            const parsed = JSON.parse(json) as SimulationConfig;
            sim = new Simulation(parsed);
            config = parsed;
            console.log(`config set: replicas=${parsed.replicas.join(",")} seed=${parsed.seed}`);
          } catch {
            console.log(
              'usage: config {"replicas":["a","b"],"seed":1,"minLatency":1,"maxLatency":2,"dropRate":0,"duplicateRate":0}',
            );
          }
          break;
        }
        default:
          console.log(`unknown command: ${cmd} (type 'help')`);
      }
    } catch (error) {
      console.log(`error: ${error instanceof Error ? error.message : String(error)}`);
    }
    prompt();
  });

  rl.on("close", () => {
    // stdin ended (piped EOF or 'exit'). Nothing to clean up: Simulation holds
    // no external resources.
  });
}

main();

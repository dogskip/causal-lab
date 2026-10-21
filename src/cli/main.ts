#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { ContractError } from "../crdt.js";
import { jcs } from "../verify/json.js";
import type { Status } from "../verify/types.js";
import { EXIT_CODES, runCli } from "../verify-cli.js";
import { BUILTIN_CHECKS, BUILTIN_TARGETS } from "./catalog.js";
import { initProject } from "./init.js";
import { openBrowser, startViewerServer } from "./open.js";

const USAGE = `crdt-fuzz — deterministic fault injection for CRDTs

Usage:
  crdt-fuzz init [--target yjs|or-map] [--ts] [--force] [--json]
  crdt-fuzz run [CASE] [--target yjs|or-map] [--module FILE] [--seeds N]
                [--time SECONDS] [--out DIR] [--json]
  crdt-fuzz verify CASE [--module FILE] [--runs N --seed N --path PATH]
                  [--out DIR] [--json]
  crdt-fuzz replay BUNDLE [--json]
  crdt-fuzz open BUNDLE [--no-open] [--port N] [--json]
  crdt-fuzz list [--json]

Exit codes:
  0 passed, 1 failed, 2 error, 3 inconclusive
`;

type Receipt = Readonly<{
  role: string;
  run_id: string;
  case_id: string;
  model_id?: string;
  status: Status;
  path?: string;
  failed_checks?: readonly Readonly<{
    checkId: string;
    phase: string;
    eventSequence: number;
    reason: string;
  }>[];
}>;

function version(): string {
  const pkg = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  return pkg.version;
}

function short(value: string): string {
  return value.length <= 12 ? value : value.slice(0, 12);
}

function numberText(value: unknown, fallback: string): string {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : fallback;
}

function render(result: Readonly<Record<string, unknown>>): string {
  const status =
    typeof result.status === "string" ? result.status : "error";
  const symbol =
    status === "passed"
      ? "✓"
      : status === "failed"
        ? "✗"
        : status === "inconclusive"
          ? "?"
          : "!";
  const receipts = Array.isArray(result.receipts)
    ? (result.receipts as Receipt[])
    : [];
  const record = receipts.find((item) => item.role === "result") ??
    receipts.at(-1);
  const header = [`${symbol} ${status}`];
  if (record?.model_id !== undefined) header.push(record.model_id);
  if (record !== undefined) header.push("case " + short(record.case_id));
  const lines = [header.join("  ")];
  if (typeof result.reason === "string") lines.push("  " + result.reason);
  if (typeof result.requestedRuns === "number") {
    lines.push(
      `  runs ${numberText(result.actualRuns, "?")}/${numberText(result.requestedRuns, "?")}  seed ${numberText(result.seed, "?")}  shrinks ${numberText(result.numShrinks, "0")}`,
    );
  } else if (typeof result.seed === "number") {
    lines.push(
      `  seed ${numberText(result.seed, "?")}  ${numberText(result.replicas, "?")} replicas  ${numberText(result.steps, "?")} steps`,
    );
  }
  if (result.matched === true) lines.push("  replay matched the recorded receipt");
  if (Array.isArray(result.failureChecks)) {
    const failed = result.failureChecks.filter(
      (name): name is string => typeof name === "string",
    );
    if (failed.length > 0)
      lines.push("  failed checks: " + failed.join(", "));
  }
  if (receipts.length > 1) {
    const counts = new Map<string, number>();
    for (const item of receipts)
      counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
    lines.push(
      "  receipts " +
        [...counts]
          .map(([name, count]) => `${name} ${String(count)}`)
          .join(" · "),
    );
  } else if (record !== undefined) {
    lines.push(
      `  ${record.role}  ${record.status}  ${short(record.run_id)}` +
        (record.path === undefined ? "" : "  " + record.path),
    );
  }
  for (const item of receipts)
    for (const check of item.failed_checks ?? [])
      lines.push(
        `  ${check.checkId} failed at ${check.phase} event ${String(check.eventSequence)}: ${check.reason}`,
      );
  const replayPath = [...receipts].reverse().find((item) => item.path)?.path;
  if (replayPath !== undefined)
    lines.push(`  replay: npx crdt-fuzz replay ${replayPath}`);
  return lines.join("\n") + "\n";
}

function mapRunOptions(args: readonly string[]): string[] {
  const output: string[] = [];
  let index = 0;
  if (args[0] !== undefined && !args[0].startsWith("--")) {
    output.push(args[0]);
    index = 1;
  }
  for (; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (key === undefined || value === undefined)
      throw new ContractError("invalid CLI option");
    if (key === "--seeds") output.push("--runs", value);
    else if (key === "--time") {
      if (!/^\d+$/u.test(value))
        throw new ContractError("--time must be whole seconds");
      const milliseconds = Number(value) * 1000;
      if (
        !Number.isSafeInteger(milliseconds) ||
        milliseconds < 100 ||
        milliseconds > 300_000
      )
        throw new ContractError("--time must be between 1 and 300 seconds");
      output.push("--timeout", String(milliseconds));
    } else output.push(key, value);
  }
  return output;
}

async function execute(command: string, args: readonly string[]): Promise<number> {
  const json = args.includes("--json");
  const flags = args.filter((argument) => argument !== "--json");
  if (flags.includes("--help") || flags.includes("-h")) {
    process.stdout.write(USAGE);
    return 0;
  }
  const mapped = command === "run" ? mapRunOptions(flags) : [...flags];
  let result: Readonly<Record<string, unknown>>;
  try {
    result = await runCli([command, ...mapped]);
  } catch (error) {
    if (!json) throw error;
    process.stdout.write(
      jcs({
        status: "error",
        reason:
          error instanceof ContractError
            ? error.message
            : "input could not be processed",
        receipts: [],
      }) + "\n",
    );
    return 2;
  }
  if (json) process.stdout.write(jcs(result) + "\n");
  else process.stdout.write(render(result));
  return EXIT_CODES[result.status as Status] ?? 2;
}

function list(args: readonly string[]): number {
  const { values } = parseArgs({
    args: [...args],
    options: {
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
    strict: true,
  });
  if (values.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (values.json) {
    process.stdout.write(
      jcs({ targets: BUILTIN_TARGETS, checks: BUILTIN_CHECKS }) + "\n",
    );
    return 0;
  }
  const lines = ["Targets"];
  for (const target of BUILTIN_TARGETS)
    lines.push(
      `  ${target.id.padEnd(8)} ${target.label.padEnd(20)} ${target.note}`,
    );
  lines.push("", "Checks");
  for (const check of BUILTIN_CHECKS) lines.push("  " + check);
  process.stdout.write(lines.join("\n") + "\n");
  return 0;
}

function init(args: readonly string[]): number {
  const { values } = parseArgs({
    args: [...args],
    options: {
      target: { type: "string", default: "yjs" },
      ts: { type: "boolean" },
      force: { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
    strict: true,
  });
  if (values.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  const result = initProject({
    cwd: process.cwd(),
    target: values.target,
    typescript: values.ts === true,
    force: values.force === true,
  });
  if (values.json) {
    process.stdout.write(jcs(result) + "\n");
    return 0;
  }
  const lines = result.files.map((file) => "Created " + file);
  lines.push(
    "",
    "Next:",
    "  npm install -D crdt-fuzz",
    `  npx crdt-fuzz verify cases/${result.target}.json --module ${result.adapter}`,
  );
  process.stdout.write(lines.join("\n") + "\n");
  return 0;
}

function waitForSignal(close: () => Promise<void>): Promise<void> {
  return new Promise((done) => {
    let stopped = false;
    const stop = (): void => {
      if (stopped) return;
      stopped = true;
      void close().then(done, done);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

async function open(args: readonly string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: [...args],
    options: {
      "no-open": { type: "boolean" },
      port: { type: "string" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
    strict: true,
  });
  if (values.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (positionals.length !== 1)
    throw new ContractError("open requires one bundle path");
  const bundlePath = resolve(positionals[0]!);
  const port = values.port === undefined ? 0 : Number(values.port);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535)
    throw new ContractError("--port must be between 0 and 65535");
  const viewer = await startViewerServer({ bundlePath, port });
  if (values.json) {
    process.stdout.write(
      jcs({ url: viewer.url, run_id: viewer.runId, bundle: bundlePath }) + "\n",
    );
  } else {
    process.stdout.write(
      `Viewer: ${viewer.url}\nBundle: ${bundlePath}\nRun: ${viewer.runId}\nPress Ctrl+C to stop.\n`,
    );
  }
  if (values["no-open"] !== true) openBrowser(viewer.url);
  await waitForSignal(viewer.close);
  return 0;
}

async function main(args: readonly string[]): Promise<number> {
  const command = args[0];
  if (
    command === undefined ||
    command === "--help" ||
    command === "-h" ||
    command === "help"
  ) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (command === "--version" || command === "-v" || command === "version") {
    process.stdout.write(version() + "\n");
    return 0;
  }
  if (command === "list") return list(args.slice(1));
  if (command === "init") return init(args.slice(1));
  if (command === "open") return open(args.slice(1));
  if (command === "run" || command === "verify" || command === "replay")
    return execute(command, args.slice(1));
  throw new ContractError("unknown command: " + command + "\n\n" + USAGE);
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(
    "crdt-fuzz: " +
      (error instanceof ContractError
        ? error.message
        : "input could not be processed") +
      "\n",
  );
  process.exitCode = 2;
}

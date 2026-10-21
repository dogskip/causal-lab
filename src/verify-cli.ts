#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContractError } from "./crdt.js";
import { parseVerificationCase } from "./verify/case.js";
import { readBundle } from "./verify/bundle.js";
import { jcs, objectOf, parseJsonText } from "./verify/json.js";
import { readJsonFile, writeBundle } from "./node/files.js";
import type { Status } from "./verify/types.js";
export const EXIT_CODES: Readonly<Record<Status, number>> = {
  passed: 0,
  failed: 1,
  error: 2,
  inconclusive: 3,
};
export async function runCli(
  args: readonly string[],
): Promise<Readonly<Record<string, unknown>>> {
  if (args.length === 1 && (args[0] === "--version" || args[0] === "-v")) {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    return { version: pkg.version };
  }
  const [rawMode, second, ...rest] = args;
  let mode: string;
  let inputPath: string | undefined;
  let flags: string[];
  if (rawMode === "run") {
    mode = "verify";
    if (second === undefined || second.startsWith("--")) {
      inputPath = fileURLToPath(
        new URL("../examples/verification/yjs.json", import.meta.url),
      );
      flags = args.slice(1);
    } else {
      inputPath = second;
      flags = rest;
    }
  } else {
    mode = rawMode ?? "";
    inputPath = second;
    flags = rest;
  }
  if ((mode !== "verify" && mode !== "replay") || inputPath === undefined)
    throw new ContractError(
      "usage: crdt-fuzz run [--target yjs] | crdt-fuzz verify|replay FILE [--out DIR] [--module FILE] [--timeout MS] [--runs N --seed N --path PATH]",
    );
  const options = new Map<string, string>();
  for (let i = 0; i < flags.length; i += 2) {
    const key = flags[i];
    const value = flags[i + 1];
    if (
      key === undefined ||
      value === undefined ||
      ![
        "--out",
        "--module",
        "--timeout",
        "--runs",
        "--seed",
        "--path",
        "--target",
      ].includes(key) ||
      options.has(key)
    )
      throw new ContractError("invalid CLI option");
    options.set(key, value);
  }
  if (options.has("--target") && options.get("--target") !== "yjs")
    throw new ContractError("only --target yjs is supported in this alpha");
  const integer = (
    name: string,
    fallback: number,
    min: number,
    max: number,
  ) => {
    const raw = options.get(name);
    if (raw !== undefined && !/^-?\d+$/.test(raw))
      throw new ContractError("invalid integer option");
    const value = raw === undefined ? fallback : Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max)
      throw new ContractError("integer option outside bounds");
    return value;
  };
  const timeout = integer("--timeout", 30000, 100, 300000);
  const runs = options.has("--runs")
    ? integer("--runs", 1, 1, 10000)
    : undefined;
  const seed = integer("--seed", 1, -2147483648, 2147483647);
  if (
    mode === "replay" &&
    (runs !== undefined || options.has("--seed") || options.has("--path"))
  )
    throw new ContractError("generation options require verify");
  const raw = readJsonFile(
    inputPath,
    mode === "verify" ? 2 * 1024 * 1024 : 32 * 1024 * 1024,
  );
  const input =
    mode === "verify" ? parseVerificationCase(raw) : readBundle(raw);
  const request = {
    mode,
    input,
    ...(options.has("--module")
      ? { module: resolve(options.get("--module")!) }
      : {}),
    ...(runs === undefined ? {} : { runs, seed }),
    ...(options.has("--path") ? { path: options.get("--path")! } : {}),
  };
  const worker = new URL(
    "./node/worker" + (import.meta.url.endsWith(".ts") ? ".ts" : ".js"),
    import.meta.url,
  );
  const child = spawn(
    process.execPath,
    [...process.execArgv, fileURLToPath(worker)],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  const receipts: {
    role: string;
    run_id: string;
    case_id: string;
    status: Status;
    path?: string;
  }[] = [];
  let summary: Record<string, unknown> | undefined;
  let partial = "";
  let stopped = false;
  let invalid = false;
  const timer = setTimeout(() => {
    stopped = true;
    child.kill("SIGKILL");
  }, timeout);
  child.stderr.on("data", () => {});
  child.stdin.on("error", () => {});
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    if (invalid) return;
    try {
      partial += chunk;
      if (Buffer.byteLength(partial) > 34 * 1024 * 1024)
        throw new ContractError("child output exceeds limit");
      let end: number;
      while ((end = partial.indexOf("\n")) >= 0) {
        const line = partial.slice(0, end);
        partial = partial.slice(end + 1);
        const frame = objectOf(
          parseJsonText(line, 34 * 1024 * 1024),
          "child frame",
        );
        if (summary !== undefined)
          throw new ContractError("output after summary");
        if (frame.type === "receipt") {
          const bundle = readBundle(frame.bundle);
          if (
            !["sample", "original", "shrunk", "result"].includes(
              frame.role as string,
            ) ||
            receipts.length >= 10002
          )
            throw new ContractError("invalid receipt role/count");
          const role = frame.role as string;
          const directory = options.get("--out");
          const path =
            directory === undefined
              ? undefined
              : writeBundle(
                  join(directory, role + "-" + bundle.run_id + ".bundle.json"),
                  bundle,
                );
          receipts.push({
            role,
            run_id: bundle.run_id,
            case_id: bundle.case_id,
            status: bundle.receipt.status,
            ...(path === undefined ? {} : { path }),
          });
        } else if (frame.type === "summary") {
          summary = { ...frame };
        } else throw new ContractError("unknown child frame");
      }
    } catch {
      invalid = true;
      child.kill("SIGKILL");
    }
  });
  const ended = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((done, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => done({ code, signal }));
  });
  child.stdin.end(jcs(request));
  let exit: { code: number | null; signal: NodeJS.Signals | null };
  try {
    exit = await ended;
  } finally {
    clearTimeout(timer);
  }
  if (stopped)
    return {
      status: "inconclusive",
      reason: "execution timeout before a complete summary",
      receipts,
    };
  if (invalid)
    return {
      status: "error",
      reason: "invalid child output or output file conflict",
      receipts,
    };
  if (summary === undefined || partial.length !== 0 || exit.signal !== null)
    return {
      status: "inconclusive",
      reason: "child terminated before a complete summary",
      receipts,
    };
  if (!Object.hasOwn(EXIT_CODES, summary.status as string))
    return { status: "error", reason: "invalid child status", receipts };
  if (
    summary.status === "passed" &&
    (receipts.length === 0 ||
      receipts.some((record) => record.status !== "passed") ||
      (runs !== undefined && summary.actualRuns !== runs))
  )
    return {
      status: "inconclusive",
      reason: "requested verification was not completed",
      receipts,
    };
  const result = { ...summary };
  delete result.type;
  return { ...result, receipts };
}
if (
  process.argv[1] !== undefined &&
  realpathSync(resolve(process.argv[1])) ===
    realpathSync(fileURLToPath(import.meta.url))
) {
  let result: Readonly<Record<string, unknown>>;
  try {
    result = await runCli(process.argv.slice(2));
  } catch (error) {
    result = {
      status: "error",
      reason:
        error instanceof ContractError
          ? error.message
          : "input could not be processed",
      receipts: [],
    };
  }
  if (typeof result.version === "string" && result.status === undefined) {
    process.stdout.write(result.version + "\n");
    process.exitCode = 0;
  } else {
    process.stdout.write(jcs(result) + "\n");
    process.exitCode = EXIT_CODES[result.status as Status] ?? 2;
  }
}

import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { ContractError } from "../crdt.js";
import { readBundle } from "../verify/bundle.js";
import { jcs, parseJsonText } from "../verify/json.js";
import type { ReplayBundle } from "../verify/types.js";
export function readJsonFile(
  path: string,
  maxBytes = 32 * 1024 * 1024,
): unknown {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes)
    throw new ContractError("input must be a bounded ordinary file");
  const bytes = readFileSync(path);
  if (bytes.length > maxBytes)
    throw new ContractError("file exceeds byte limit");
  return parseJsonText(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    maxBytes,
  );
}
export function atomicWrite(path: string, text: string): string {
  path = resolve(path);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const check = () => {
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (stat !== undefined && (!stat.isFile() || stat.isSymbolicLink()))
      throw new ContractError("output must be an ordinary file");
  };
  check();
  const lock = path + ".lock";
  const descriptor = openSync(lock, "wx", 0o600);
  const temporary = path + "." + randomUUID() + ".tmp";
  try {
    check();
    if (existsSync(path)) {
      if (readFileSync(path, "utf8") !== text)
        throw new ContractError("output conflicts with existing bytes");
      return path;
    }
    const target = openSync(temporary, "wx", 0o600);
    try {
      writeFileSync(target, text, "utf8");
      fsyncSync(target);
    } finally {
      closeSync(target);
    }
    check();
    renameSync(temporary, path);
    const folder = openSync(dirname(path), "r");
    try {
      fsyncSync(folder);
    } finally {
      closeSync(folder);
    }
    return path;
  } finally {
    closeSync(descriptor);
    unlinkSync(lock);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}
export function writeBundle(path: string, input: unknown): string {
  const bundle = readBundle(input);
  return atomicWrite(path, jcs(bundle) + "\n");
}
export function readBundleFile(path: string): ReplayBundle {
  return readBundle(readJsonFile(path));
}

import { ContractError, utf8Length } from "../crdt.js";

export type Json =
  | null
  | boolean
  | number
  | string
  | readonly Json[]
  | { readonly [key: string]: Json };
export const MAX_JSON_DEPTH = 64;
export const MAX_JSON_NODES = 1_000_000;

function validString(value: string): string {
  if (!value.isWellFormed())
    throw new ContractError("JSON string contains invalid Unicode");
  return value;
}

export function ownJson(input: unknown): Json {
  const ancestors = new WeakSet<object>();
  let nodes = 0;
  const copy = (value: unknown, depth: number): Json => {
    if (depth > MAX_JSON_DEPTH)
      throw new ContractError("JSON depth limit exceeded");
    if (++nodes > MAX_JSON_NODES)
      throw new ContractError("JSON node limit exceeded");
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "string") return validString(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value))
        throw new ContractError("JSON numbers must be finite");
      return value;
    }
    if (typeof value !== "object")
      throw new ContractError("unsupported JSON value");
    if (ancestors.has(value))
      throw new ContractError("circular JSON reference");
    const prototype: unknown = Object.getPrototypeOf(value);
    if (
      !Array.isArray(value) &&
      prototype !== Object.prototype &&
      prototype !== null
    )
      throw new ContractError("JSON object must be plain");
    if (Object.getOwnPropertySymbols(value).length > 0)
      throw new ContractError("JSON object contains symbol properties");
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        if (
          prototype !== Array.prototype ||
          Object.getOwnPropertyNames(value).length !== value.length + 1
        )
          throw new ContractError(
            "JSON array has a custom prototype or hidden properties",
          );
        const output: Json[] = [];
        if (Object.keys(value).length !== value.length)
          throw new ContractError("JSON array has missing or extra entries");
        for (let index = 0; index < value.length; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(
            value,
            String(index),
          );
          if (descriptor === undefined || !Object.hasOwn(descriptor, "value"))
            throw new ContractError("JSON array contains an accessor");
          output.push(copy(descriptor.value, depth + 1));
        }
        return Object.freeze(output);
      }
      const output: Record<string, Json> = {};
      for (const key of Object.getOwnPropertyNames(value)) {
        validString(key);
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (
          descriptor?.enumerable !== true ||
          !Object.hasOwn(descriptor, "value")
        )
          throw new ContractError(
            "JSON object contains an accessor or hidden property",
          );
        Object.defineProperty(output, key, {
          value: copy(descriptor.value, depth + 1),
          enumerable: true,
          writable: false,
          configurable: false,
        });
      }
      return Object.freeze(output);
    } finally {
      ancestors.delete(value);
    }
  };
  return copy(input, 0);
}

export function jcs(input: unknown): string {
  const value = ownJson(input);
  const encode = (item: Json): string => {
    if (item === null || typeof item !== "object") return JSON.stringify(item);
    if (Array.isArray(item)) return "[" + item.map(encode).join(",") + "]";
    const object = item as Readonly<Record<string, Json>>;
    return (
      "{" +
      Object.keys(object)
        .sort()
        .map((key) => JSON.stringify(key) + ":" + encode(object[key] as Json))
        .join(",") +
      "}"
    );
  };
  return encode(value);
}

export function parseJsonText(text: string, maxBytes = 32 * 1024 * 1024): Json {
  if (utf8Length(text) > maxBytes)
    throw new ContractError("JSON input exceeds maximum bytes");
  let offset = 0;
  let nodes = 0;
  const whitespace = (): void => {
    while (offset < text.length && " \n\r\t".includes(text[offset] as string))
      offset += 1;
  };
  const fail = (): never => {
    throw new ContractError("invalid JSON syntax");
  };
  const string = (): string => {
    if (text[offset] !== '"') return fail();
    const start = offset++;
    while (offset < text.length) {
      const char = text[offset++];
      if (char === "\\") offset += 1;
      else if (char === '"') {
        try {
          return validString(JSON.parse(text.slice(start, offset)) as string);
        } catch (error) {
          if (error instanceof ContractError) throw error;
          return fail();
        }
      }
    }
    return fail();
  };
  const value = (depth: number): Json => {
    if (depth > MAX_JSON_DEPTH)
      throw new ContractError("JSON depth limit exceeded");
    if (++nodes > MAX_JSON_NODES)
      throw new ContractError("JSON node limit exceeded");
    whitespace();
    const char = text[offset];
    if (char === '"') return string();
    if (char === "{") {
      offset += 1;
      whitespace();
      const object: Record<string, Json> = {};
      const keys = new Set<string>();
      if (text[offset] === "}") {
        offset += 1;
        return Object.freeze(object);
      }
      for (;;) {
        const key = string();
        whitespace();
        if (keys.has(key)) throw new ContractError("duplicate JSON property");
        keys.add(key);
        if (text[offset++] !== ":") return fail();
        Object.defineProperty(object, key, {
          value: value(depth + 1),
          enumerable: true,
        });
        whitespace();
        const next = text[offset++];
        if (next === "}") return Object.freeze(object);
        if (next !== ",") return fail();
        whitespace();
      }
    }
    if (char === "[") {
      offset += 1;
      whitespace();
      const array: Json[] = [];
      if (text[offset] === "]") {
        offset += 1;
        return Object.freeze(array);
      }
      for (;;) {
        array.push(value(depth + 1));
        whitespace();
        const next = text[offset++];
        if (next === "]") return Object.freeze(array);
        if (next !== ",") return fail();
      }
    }
    for (const [token, literal] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ] as const) {
      if (text.startsWith(token, offset)) {
        offset += token.length;
        return literal;
      }
    }
    const numberPattern =
      /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
    numberPattern.lastIndex = offset;
    const match = numberPattern.exec(text);
    if (match === null) return fail();
    offset = numberPattern.lastIndex;
    const number = Number(match[0]);
    if (!Number.isFinite(number))
      throw new ContractError("JSON numbers must be finite");
    return number;
  };
  const result = value(0);
  whitespace();
  if (offset !== text.length) return fail();
  return result;
}

export function objectOf(
  input: unknown,
  label: string,
  allowed?: readonly string[],
): Readonly<Record<string, Json>> {
  if (input === null || typeof input !== "object" || Array.isArray(input))
    throw new ContractError(`${label} must be an object`);
  const result = ownJson(input) as Readonly<Record<string, Json>>;
  if (
    allowed !== undefined &&
    Object.keys(result).some((key) => !allowed.includes(key))
  )
    throw new ContractError(`${label} contains an unknown field`);
  return result;
}

export function identifier(input: unknown, label: string): string {
  if (typeof input !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(input))
    throw new ContractError(`${label} is invalid`);
  return input;
}

export function hashOf(input: unknown, label: string): string {
  if (typeof input !== "string" || !/^[0-9a-f]{64}$/.test(input))
    throw new ContractError(`${label} must be a SHA-256 digest`);
  return input;
}

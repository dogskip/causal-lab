export const MAX_IDENTIFIER_BYTES = 128;
export const MAX_VALUE_BYTES = 4 * 1024;

export type Dot = Readonly<{
  replica: string;
  counter: number;
}>;

export type PutOperation = Readonly<{
  kind: "put";
  dot: Dot;
  key: string;
  value: string;
  removes: readonly string[];
}>;

export type RemoveOperation = Readonly<{
  kind: "remove";
  dot: Dot;
  key: string;
  removes: readonly string[];
}>;

export type Operation = PutOperation | RemoveOperation;

export class ContractError extends Error {
  override readonly name = "ContractError";
}

export class VersionVector {
  readonly #counters = new Map<string, number>();

  observe(dot: Dot): void {
    validateDot(dot);
    const current = this.#counters.get(dot.replica) ?? 0;
    if (dot.counter > current) {
      this.#counters.set(dot.replica, dot.counter);
    }
  }

  next(replica: string): Dot {
    validateIdentifier(replica, "replica");
    const dot = { replica, counter: (this.#counters.get(replica) ?? 0) + 1 };
    this.observe(dot);
    return dot;
  }

  merge(other: Readonly<Record<string, number>>): void {
    for (const [replica, counter] of Object.entries(other)) {
      this.observe({ replica, counter });
    }
  }

  dominates(other: Readonly<Record<string, number>>): boolean {
    return Object.entries(other).every(
      ([replica, counter]) => (this.#counters.get(replica) ?? 0) >= counter,
    );
  }

  toJSON(): Record<string, number> {
    return Object.fromEntries(
      [...this.#counters.entries()].sort(([left], [right]) => left.localeCompare(right)),
    );
  }
}

export class Replica {
  readonly #id: string;
  readonly #clock = new VersionVector();
  readonly #values = new Map<string, Map<string, string>>();
  readonly #tombstones = new Set<string>();
  readonly #operations = new Map<string, Operation>();

  constructor(id: string) {
    validateIdentifier(id, "replica");
    this.#id = id;
  }

  get id(): string {
    return this.#id;
  }

  put(key: string, value: string): Operation {
    validateKey(key);
    if (Buffer.byteLength(value, "utf8") > MAX_VALUE_BYTES) {
      throw new ContractError(`value exceeds ${MAX_VALUE_BYTES} bytes`);
    }
    const operation: PutOperation = {
      kind: "put",
      dot: this.#clock.next(this.#id),
      key,
      value,
      removes: this.#visibleDots(key),
    };
    this.apply(operation);
    return cloneOperation(operation);
  }

  remove(key: string): Operation {
    validateKey(key);
    const operation: RemoveOperation = {
      kind: "remove",
      dot: this.#clock.next(this.#id),
      key,
      removes: this.#visibleDots(key),
    };
    this.apply(operation);
    return cloneOperation(operation);
  }

  apply(input: Operation): boolean {
    validateOperation(input);
    const operation = cloneOperation(input);
    const id = operationId(operation.dot);
    if (this.#operations.has(id)) {
      return false;
    }

    const values = this.#values.get(operation.key) ?? new Map<string, string>();
    for (const removed of operation.removes) {
      this.#tombstones.add(removed);
      values.delete(removed);
    }
    if (operation.kind === "put" && !this.#tombstones.has(id)) {
      values.set(id, operation.value);
    }
    if (values.size === 0) {
      this.#values.delete(operation.key);
    } else {
      this.#values.set(operation.key, values);
    }
    this.#operations.set(id, operation);
    this.#clock.observe(operation.dot);
    return true;
  }

  read(key: string): string[] {
    validateKey(key);
    return [...(this.#values.get(key)?.values() ?? [])].sort();
  }

  version(): Record<string, number> {
    return this.#clock.toJSON();
  }

  operations(): Operation[] {
    return [...this.#operations.values()]
      .sort((left, right) =>
        left.dot.replica < right.dot.replica
          ? -1
          : left.dot.replica > right.dot.replica
            ? 1
            : left.dot.counter - right.dot.counter,
      )
      .map(cloneOperation);
  }

  canonicalState(): Record<string, string[]> {
    return Object.fromEntries(
      [...this.#values.keys()]
        .sort()
        .map((key) => [key, this.read(key)] as const),
    );
  }

  #visibleDots(key: string): string[] {
    return [...(this.#values.get(key)?.keys() ?? [])].sort();
  }
}

export function operationId(dot: Dot): string {
  validateDot(dot);
  return `${dot.replica}:${dot.counter}`;
}

function cloneOperation(operation: Operation): Operation {
  const common = {
    dot: { ...operation.dot },
    key: operation.key,
    removes: [...operation.removes],
  };
  return operation.kind === "put"
    ? { ...common, kind: "put", value: operation.value }
    : { ...common, kind: "remove" };
}

function validateOperation(operation: Operation): void {
  if (operation.kind !== "put" && operation.kind !== "remove") {
    throw new ContractError("operation kind is invalid");
  }
  validateDot(operation.dot);
  validateKey(operation.key);
  if (
    !Array.isArray(operation.removes) ||
    operation.removes.length > 10_000 ||
    !operation.removes.every(
      (removed: unknown) =>
        typeof removed === "string" && /^[A-Za-z0-9._-]+:[1-9][0-9]*$/u.test(removed),
    )
  ) {
    throw new ContractError("operation removal context is invalid");
  }
  if (operation.kind === "put" && Buffer.byteLength(operation.value, "utf8") > MAX_VALUE_BYTES) {
    throw new ContractError(`value exceeds ${MAX_VALUE_BYTES} bytes`);
  }
}

function validateDot(dot: Dot): void {
  validateIdentifier(dot.replica, "replica");
  if (!Number.isSafeInteger(dot.counter) || dot.counter < 1) {
    throw new ContractError("operation counter must be a positive safe integer");
  }
}

function validateKey(key: string): void {
  validateIdentifier(key, "key");
}

function validateIdentifier(value: string, field: string): void {
  if (
    value.length === 0 ||
    Buffer.byteLength(value, "utf8") > MAX_IDENTIFIER_BYTES ||
    !/^[A-Za-z0-9._-]+$/u.test(value)
  ) {
    throw new ContractError(`${field} is invalid`);
  }
}

import { ContractError, Replica, operationId, type Operation } from "./crdt.js";

export const MAX_REPLICAS = 12;
export const MAX_EVENTS = 10_000;

export type SimulationConfig = Readonly<{
  replicas: readonly string[];
  seed: number;
  minLatency: number;
  maxLatency: number;
  dropRate: number;
  duplicateRate: number;
}>;

export type TraceEntry = Readonly<{
  sequence: number;
  time: number;
  kind: "local" | "scheduled" | "dropped" | "held" | "delivered" | "partition" | "heal";
  from?: string;
  to?: string;
  operation?: string;
}>;

export type SimulationReport = Readonly<{
  seed: number;
  virtualTime: number;
  processedEvents: number;
  converged: boolean;
  states: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;
  versions: Readonly<Record<string, Readonly<Record<string, number>>>>;
  trace: readonly TraceEntry[];
}>;

type Event = Readonly<{
  sequence: number;
  at: number;
  from: string;
  to: string;
  operation: Operation;
}>;

export class Simulation {
  readonly #config: SimulationConfig;
  readonly #replicas = new Map<string, Replica>();
  readonly #random: DeterministicRandom;
  readonly #partitions = new Set<string>();
  readonly #events: Event[] = [];
  readonly #held: Event[] = [];
  readonly #trace: TraceEntry[] = [];
  #now = 0;
  #nextSequence = 1;
  #scheduledEvents = 0;
  #processedEvents = 0;

  constructor(config: SimulationConfig) {
    validateConfig(config);
    this.#config = {
      ...config,
      replicas: [...config.replicas],
    };
    this.#random = new DeterministicRandom(config.seed);
    for (const id of config.replicas) {
      this.#replicas.set(id, new Replica(id));
    }
  }

  put(replica: string, key: string, value: string): Operation {
    const operation = this.#replica(replica).put(key, value);
    this.#record({ kind: "local", from: replica, operation: operationId(operation.dot) });
    this.#broadcast(replica, operation, false);
    return operation;
  }

  remove(replica: string, key: string): Operation {
    const operation = this.#replica(replica).remove(key);
    this.#record({ kind: "local", from: replica, operation: operationId(operation.dot) });
    this.#broadcast(replica, operation, false);
    return operation;
  }

  partition(left: string, right: string): void {
    this.#replica(left);
    this.#replica(right);
    if (left === right) {
      throw new ContractError("a replica cannot be partitioned from itself");
    }
    this.#partitions.add(linkKey(left, right));
    this.#record({ kind: "partition", from: left, to: right });
  }

  healAll(): void {
    this.#partitions.clear();
    this.#record({ kind: "heal" });
    for (const event of this.#held.splice(0)) {
      this.#enqueue(event.from, event.to, event.operation, true);
    }
    for (const [from, replica] of this.#replicas) {
      for (const operation of replica.operations()) {
        this.#broadcast(from, operation, true);
      }
    }
  }

  advance(duration: number): void {
    if (!Number.isSafeInteger(duration) || duration < 0) {
      throw new ContractError("advance duration must be a non-negative integer");
    }
    const target = this.#now + duration;
    if (!Number.isSafeInteger(target)) {
      throw new ContractError("virtual time overflow");
    }
    while (this.#events.some((event) => event.at <= target)) {
      const event = this.#takeNext();
      if (event.at > target) {
        this.#events.push(event);
        break;
      }
      this.#now = event.at;
      this.#process(event);
    }
    this.#now = target;
  }

  runUntilIdle(): void {
    while (this.#events.length > 0) {
      const event = this.#takeNext();
      this.#now = Math.max(this.#now, event.at);
      this.#process(event);
    }
  }

  report(): SimulationReport {
    const states: Record<string, Record<string, string[]>> = {};
    const versions: Record<string, Record<string, number>> = {};
    for (const id of [...this.#replicas.keys()].sort()) {
      const replica = this.#replicas.get(id);
      if (replica === undefined) {
        throw new Error("replica map changed during report");
      }
      states[id] = replica.canonicalState();
      versions[id] = replica.version();
    }
    const canonical = Object.values(states).map((state) => JSON.stringify(state));
    return {
      seed: this.#config.seed,
      virtualTime: this.#now,
      processedEvents: this.#processedEvents,
      converged: canonical.every((state) => state === canonical[0]),
      states,
      versions,
      trace: this.#trace.map((entry) => ({ ...entry })),
    };
  }

  #broadcast(from: string, operation: Operation, reliable: boolean): void {
    for (const to of this.#config.replicas) {
      if (to !== from) {
        this.#enqueue(from, to, operation, reliable);
      }
    }
  }

  #enqueue(from: string, to: string, operation: Operation, reliable: boolean): void {
    this.#consumeEventBudget();
    if (!reliable && this.#random.next() < this.#config.dropRate) {
      this.#record({ kind: "dropped", from, to, operation: operationId(operation.dot) });
      return;
    }
    this.#pushEvent(from, to, operation);
    if (!reliable && this.#random.next() < this.#config.duplicateRate) {
      this.#consumeEventBudget();
      this.#pushEvent(from, to, operation);
    }
  }

  #pushEvent(from: string, to: string, operation: Operation): void {
    const event: Event = {
      sequence: this.#nextSequence++,
      at: this.#now + this.#random.integer(this.#config.minLatency, this.#config.maxLatency),
      from,
      to,
      operation,
    };
    this.#events.push(event);
    this.#record({
      kind: "scheduled",
      from,
      to,
      operation: operationId(operation.dot),
    });
  }

  #process(event: Event): void {
    this.#processedEvents += 1;
    if (this.#partitions.has(linkKey(event.from, event.to))) {
      this.#held.push(event);
      this.#record({
        kind: "held",
        from: event.from,
        to: event.to,
        operation: operationId(event.operation.dot),
      });
      return;
    }
    this.#replica(event.to).apply(event.operation);
    this.#record({
      kind: "delivered",
      from: event.from,
      to: event.to,
      operation: operationId(event.operation.dot),
    });
  }

  #takeNext(): Event {
    this.#events.sort((left, right) => left.at - right.at || left.sequence - right.sequence);
    const event = this.#events.shift();
    if (event === undefined) {
      throw new Error("event queue is empty");
    }
    return event;
  }

  #replica(id: string): Replica {
    const replica = this.#replicas.get(id);
    if (replica === undefined) {
      throw new ContractError(`unknown replica: ${id}`);
    }
    return replica;
  }

  #consumeEventBudget(): void {
    if (this.#scheduledEvents >= MAX_EVENTS) {
      throw new ContractError(`simulation exceeds ${MAX_EVENTS} scheduled events`);
    }
    this.#scheduledEvents += 1;
  }

  #record(entry: Omit<TraceEntry, "sequence" | "time">): void {
    this.#trace.push({ sequence: this.#trace.length + 1, time: this.#now, ...entry });
  }
}

class DeterministicRandom {
  #state: number;

  constructor(seed: number) {
    this.#state = seed >>> 0;
  }

  next(): number {
    this.#state = (this.#state + 0x6d2b_79f5) >>> 0;
    let value = this.#state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  integer(minimum: number, maximum: number): number {
    return minimum + Math.floor(this.next() * (maximum - minimum + 1));
  }
}

function validateConfig(config: SimulationConfig): void {
  if (config.replicas.length < 2 || config.replicas.length > MAX_REPLICAS) {
    throw new ContractError(`simulation requires 2 to ${MAX_REPLICAS} replicas`);
  }
  if (new Set(config.replicas).size !== config.replicas.length) {
    throw new ContractError("replica identifiers must be unique");
  }
  for (const id of config.replicas) {
    new Replica(id);
  }
  if (!Number.isSafeInteger(config.seed) || config.seed < 0 || config.seed > 0xffff_ffff) {
    throw new ContractError("seed must be an unsigned 32-bit integer");
  }
  if (
    !Number.isSafeInteger(config.minLatency) ||
    !Number.isSafeInteger(config.maxLatency) ||
    config.minLatency < 0 ||
    config.maxLatency < config.minLatency ||
    config.maxLatency > 60_000
  ) {
    throw new ContractError("latency range is invalid");
  }
  for (const probability of [config.dropRate, config.duplicateRate]) {
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new ContractError("network probabilities must be between zero and one");
    }
  }
}

function linkKey(left: string, right: string): string {
  return left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;
}

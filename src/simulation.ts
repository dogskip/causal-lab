import { EventHeap } from "./scheduler.js";
import { DeterministicRandom } from "./random.js";
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

export type StateObserver = (event: TraceEntry, states: SimulationReport["states"]) => void;

type Transfer = Readonly<{ from: string; to: string; operation: Operation; reliable: boolean }>;
type NetworkPlan = Readonly<{ random: DeterministicRandom; budget: number; nextSequence: number; entries: readonly (Event | Transfer)[] }>;

export class Simulation {
  readonly #config: SimulationConfig;
  readonly #replicas = new Map<string, Replica>();
  readonly #random: DeterministicRandom;
  readonly #partitions = new Set<string>();
  readonly #events = new EventHeap<Event>();
  readonly #held: Event[] = [];
  readonly #trace: TraceEntry[] = [];
  #now = 0;
  #nextSequence = 1;
  #scheduledEvents = 0;
  #processedEvents = 0;

  constructor(config: SimulationConfig, private readonly observeState?: StateObserver) {
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
    const target = this.#replica(replica);
    const operation = target.preparePut(key, value);
    const plan = this.#prepare(this.#broadcast(replica, operation, false));
    target.apply(operation);
    this.#record({ kind: "local", from: replica, operation: operationId(operation.dot) });
    this.#commit(plan);
    return operation;
  }

  remove(replica: string, key: string): Operation {
    const target = this.#replica(replica);
    const operation = target.prepareRemove(key);
    const plan = this.#prepare(this.#broadcast(replica, operation, false));
    target.apply(operation);
    this.#record({ kind: "local", from: replica, operation: operationId(operation.dot) });
    this.#commit(plan);
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
    const plan = this.#prepare(this.#recoveryTransfers());
    this.#partitions.clear();
    this.#held.length = 0;
    this.#record({ kind: "heal" });
    this.#commit(plan);
  }

  *#recoveryTransfers(): Generator<Transfer> {
    for (const event of this.#held) {
      yield { from: event.from, to: event.to, operation: event.operation, reliable: true };
    }
    for (const [from, replica] of this.#replicas) {
      for (const operation of replica.operations()) {
        yield* this.#broadcast(from, operation, true);
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
    // Drain every event scheduled at or before target. peek() avoids popping an
    // event that belongs to a future tick — the heap preserves total order, so
    // this is byte-identical to the previous sort+shift drain.
    while (this.#events.size > 0 && (this.#events.peek()?.at ?? Number.POSITIVE_INFINITY) <= target) {
      const event = this.#events.pop();
      if (event === undefined) {
        throw new Error("event queue is empty");
      }
      this.#now = event.at;
      this.#process(event);
    }
    this.#now = target;
  }

  runUntilIdle(): void {
    while (this.#events.size > 0) {
      const event = this.#events.pop();
      if (event === undefined) {
        throw new Error("event queue is empty");
      }
      this.#now = Math.max(this.#now, event.at);
      this.#process(event);
    }
  }

  states(): SimulationReport["states"] {
    return Object.fromEntries([...this.#replicas.keys()].sort().map((id) => [id, this.#replica(id).canonicalState()]));
  }

  report(): SimulationReport {
    const states = this.states();
    const versions = Object.fromEntries([...this.#replicas.keys()].sort().map((id) => [id, this.#replica(id).version()]));
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

  *#broadcast(from: string, operation: Operation, reliable: boolean): Generator<Transfer> {
    for (const to of this.#config.replicas) {
      if (to !== from) yield { from, to, operation, reliable };
    }
  }

  #prepare(transfers: Iterable<Transfer>): NetworkPlan {
    const random = this.#random.clone();
    let budget = this.#scheduledEvents;
    let nextSequence = this.#nextSequence;
    const entries: (Event | Transfer)[] = [];
    const consume = (): void => {
      if (budget >= MAX_EVENTS) throw new ContractError(`simulation exceeds ${MAX_EVENTS} scheduled events`);
      budget += 1;
    };
    const schedule = (transfer: Transfer): void => {
      const at = this.#now + random.integer(this.#config.minLatency, this.#config.maxLatency);
      if (!Number.isSafeInteger(at)) throw new ContractError("scheduled time overflow");
      entries.push({ sequence: nextSequence++, at, from: transfer.from, to: transfer.to, operation: transfer.operation });
    };
    for (const transfer of transfers) {
      consume();
      if (!transfer.reliable && random.next() < this.#config.dropRate) {
        entries.push(transfer);
        continue;
      }
      schedule(transfer);
      if (!transfer.reliable && random.next() < this.#config.duplicateRate) {
        consume();
        schedule(transfer);
      }
    }
    return { random, budget, nextSequence, entries };
  }

  #commit(plan: NetworkPlan): void {
    this.#random.copyFrom(plan.random);
    this.#scheduledEvents = plan.budget;
    this.#nextSequence = plan.nextSequence;
    for (const entry of plan.entries) {
      if ("at" in entry) this.#events.push(entry);
      this.#record({ kind: "at" in entry ? "scheduled" : "dropped", from: entry.from, to: entry.to, operation: operationId(entry.operation.dot) });
    }
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

  #replica(id: string): Replica {
    const replica = this.#replicas.get(id);
    if (replica === undefined) {
      throw new ContractError(`unknown replica: ${id}`);
    }
    return replica;
  }

  #record(entry: Omit<TraceEntry, "sequence" | "time">): void {
    const recorded = { sequence: this.#trace.length + 1, time: this.#now, ...entry };
    this.#trace.push(recorded);
    if (entry.kind === "local" || entry.kind === "delivered") this.observeState?.({ ...recorded }, this.states());
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

export function linkKey(left: string, right: string): string {
  return left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;
}

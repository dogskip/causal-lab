import { ContractError, utf8Length } from "../crdt.js";
import { DeterministicRandom } from "../random.js";
import { EventHeap } from "../scheduler.js";
import { sha256Hex } from "../sha256.js";
import { linkKey } from "../simulation.js";
import { parseVerificationCase } from "./case.js";
import { readBundle } from "./bundle.js";
import { identifier, jcs, objectOf, ownJson, type Json } from "./json.js";
import { buildManifest, sameManifest } from "./manifest.js";
import { decodePacket, packetOf } from "./packet.js";
import {
  DEFAULT_LIMITS,
  type CheckResult,
  type Context,
  type ExecutionManifest,
  type Limits,
  type Manifest,
  type Outgoing,
  type Packet,
  type Phase,
  type ReceiptBody,
  type RecoveryEvidence,
  type ReplayBundle,
  type VerificationCase,
  type VerificationEvent,
  type VerifierOptions,
} from "./types.js";

class LimitError extends Error {}
type Message = Readonly<{
  at: number;
  sequence: number;
  from: string;
  to: string;
  sessionId: string;
  packet_id: string;
  recoveryGeneration?: number;
}>;
type Recovery = {
  generation: number;
  startedAtSequence: number;
  completedAtSequence: number | null;
  expectedPairs: { from: string; to: string }[];
  completedPairs: { from: string; to: string }[];
  requiredMessages: {
    messageSequence: number;
    from: string;
    to: string;
    packet_id: string;
    receivedAtSequence: number | null;
  }[];
  invalidatedAtSequence: number | null;
};
type Plan = {
  random: DeterministicRandom;
  budget: number;
  messageSequence: number;
  packets: Packet[];
  entries: { message: Message; dropped: boolean }[];
  bytes: number;
};

function synchronous<T>(value: T): T {
  if (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    "then" in value &&
    typeof value.then === "function"
  )
    throw new ContractError("adapter and checker methods must be synchronous");
  return value;
}
function limitsOf(input: Partial<Limits> = {}): Limits {
  const limits = { ...DEFAULT_LIMITS, ...input };
  for (const name of Object.keys(DEFAULT_LIMITS) as (keyof Limits)[])
    if (
      !Number.isSafeInteger(limits[name]) ||
      limits[name] < (name === "maxBundleBytes" ? 65536 : 0) ||
      limits[name] > DEFAULT_LIMITS[name]
    )
      throw new ContractError("verification limit is invalid");
  return Object.freeze(limits);
}

class Runner<S> {
  readonly options: VerifierOptions<S>;
  readonly definition: VerificationCase;
  readonly manifest: ExecutionManifest;
  readonly case_id: string;
  readonly limits: Limits;
  readonly states = new Map<string, S>();
  readonly observations = new Map<string, Json>();
  readonly initialStates = new Map<string, Json>();
  readonly packets = new Map<string, Packet>();
  readonly events: VerificationEvent[] = [];
  readonly results: {
    phase: Phase;
    eventSequence: number;
    result: CheckResult;
  }[] = [];
  readonly queue = new EventHeap<Message>();
  readonly held: Message[] = [];
  readonly partitions = new Set<string>();
  readonly targetRandom = new Map<string, DeterministicRandom>();
  readonly networkRandom: DeterministicRandom;
  readonly counts = {
    attemptedCommands: 0,
    committedCommands: 0,
    acceptedCommands: 0,
    rejectedCommands: 0,
    scheduledMessages: 0,
    deliveredMessages: 0,
  };
  now = 0;
  nextMessageSequence = 1;
  recoveryGeneration = 0;
  recovery: Recovery | null = null;
  byteCost = 0;
  uniquePacketBytes = 0;
  constructor(
    input: unknown,
    options: VerifierOptions<S>,
    readonly expected?: ReplayBundle,
  ) {
    this.definition = parseVerificationCase(input);
    this.manifest = buildManifest(
      this.definition,
      options.adapter,
      options.invariants,
      options.engine,
    );
    const adapter = options.adapter;
    this.options = Object.freeze({
      ...options,
      adapter: Object.freeze({
        manifest: ownJson(adapter.manifest) as Manifest,
        create: adapter.create.bind(adapter),
        command: adapter.command.bind(adapter),
        receive: adapter.receive.bind(adapter),
        reconcile: adapter.reconcile.bind(adapter),
        observe: adapter.observe.bind(adapter),
        close: adapter.close.bind(adapter),
      }),
      invariants: Object.freeze(
        this.manifest.checks.map((descriptor) => ({
          ...descriptor,
          check: options.invariants
            .find((invariant) => invariant.id === descriptor.id)!
            .check.bind(
              options.invariants.find(
                (invariant) => invariant.id === descriptor.id,
              ),
            ),
        })),
      ),
    });
    this.limits = limitsOf(options.limits);
    this.case_id = sha256Hex("causal-lab-case-v2\0" + jcs(this.definition));
    if (
      expected !== undefined &&
      (!sameManifest(this.manifest, expected.receipt.manifest) ||
        expected.case_id !== this.case_id)
    )
      throw new ContractError(
        "replay manifest does not match the current execution",
      );
    this.networkRandom = new DeterministicRandom(this.definition.seed);
    for (const [index, replica] of this.definition.replicas.entries())
      this.targetRandom.set(
        replica,
        new DeterministicRandom(
          (this.definition.seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0,
        ),
      );
    this.byteCost =
      utf8Length(jcs(this.definition)) +
      utf8Length(jcs(this.manifest)) +
      16_384;
  }
  context(
    replica: string,
    sessionId = "command",
    eventSequence = this.events.length + 1,
  ): Context {
    const random = this.targetRandom.get(replica);
    if (random === undefined)
      throw new ContractError("target random source is missing");
    return Object.freeze({
      replica,
      virtualTime: this.now,
      eventSequence,
      sessionId,
      randomUint32: () => Math.floor(random.next() * 4294967296),
    });
  }
  state(replica: string): S {
    if (!this.states.has(replica))
      throw new ContractError("replica was not created");
    return this.states.get(replica) as S;
  }
  observation(replica: string): Json {
    const value = ownJson(
      synchronous(this.options.adapter.observe(this.state(replica))),
    );
    if (utf8Length(jcs(value)) > this.limits.maxBundleBytes / 4)
      throw new LimitError("observation exceeds resource limit");
    return value;
  }
  recordedStates(): Readonly<Record<string, Json>> {
    return Object.freeze(Object.fromEntries(this.observations));
  }
  evidence(): RecoveryEvidence | null {
    if (this.recovery === null) return null;
    return ownJson({
      policy: "full-state-exchange-v1",
      ...this.recovery,
      pending: this.queue.size,
      held: this.held.length,
    }) as RecoveryEvidence;
  }
  completed(): boolean {
    return (
      this.recovery !== null &&
      this.recovery.completedAtSequence !== null &&
      this.recovery.invalidatedAtSequence === null &&
      this.queue.size === 0 &&
      this.held.length === 0
    );
  }
  ensureBytes(extra: number, nextStates = this.recordedStates()): void {
    if (
      this.byteCost + extra + utf8Length(jcs(nextStates)) >
      this.limits.maxBundleBytes
    )
      throw new LimitError("result bundle exceeds resource limit");
  }
  record(
    input: Omit<VerificationEvent, "sequence" | "time">,
  ): VerificationEvent {
    const event = ownJson({
      sequence: this.events.length + 1,
      time: this.now,
      ...input,
    }) as VerificationEvent;
    const bytes = utf8Length(jcs(event)) + 1;
    this.ensureBytes(bytes);
    if (
      this.expected !== undefined &&
      jcs(this.expected.receipt.events[this.events.length]) !== jcs(event)
    )
      throw new ContractError("replay event or observation mismatch");
    this.events.push(event);
    this.byteCost += bytes;
    return event;
  }
  invalidate(): void {
    if (this.recovery !== null && this.recovery.invalidatedAtSequence === null)
      this.recovery.invalidatedAtSequence = this.events.length + 1;
  }
  plan(
    from: string,
    output: readonly Outgoing[],
    generation?: number,
    peer?: string,
  ): Plan {
    if (!Array.isArray(output))
      throw new ContractError("adapter outgoing messages must be an array");
    const random = this.networkRandom.clone();
    let budget = this.counts.scheduledMessages;
    let messageSequence = this.nextMessageSequence;
    const packets: Packet[] = [];
    const entries: Plan["entries"] = [];
    const seen = new Set(this.packets.keys());
    const copied = new WeakMap<Uint8Array, Packet>();
    let addedRawBytes = 0;
    let bytes = 0;
    const add = (
      to: string,
      sessionId: string,
      packet: Packet,
      dropped: boolean,
    ): void => {
      if (budget >= this.limits.maxEvents)
        throw new LimitError("network event budget exceeded");
      budget += 1;
      const at = dropped
        ? this.now
        : this.now +
          random.integer(
            this.definition.network.minLatency,
            this.definition.network.maxLatency,
          );
      if (!Number.isSafeInteger(at))
        throw new LimitError("scheduled time overflow");
      const message: Message = {
        at,
        sequence: messageSequence++,
        from,
        to,
        sessionId,
        packet_id: packet.packet_id,
        ...(generation === undefined ? {} : { recoveryGeneration: generation }),
      };
      const event = {
        sequence: this.events.length + entries.length + 2,
        time: this.now,
        kind: dropped ? "dropped" : "scheduled",
        from,
        to,
        packet_id: packet.packet_id,
        messageSequence: message.sequence,
        sessionId,
        arrival: at,
        ...(generation === undefined ? {} : { recoveryGeneration: generation }),
      };
      bytes += utf8Length(jcs(event)) + 1;
      if (generation !== undefined) bytes += 512;
      entries.push({ message, dropped });
    };
    for (const raw of output as readonly unknown[]) {
      if (raw === null || typeof raw !== "object")
        throw new ContractError("outgoing message is invalid");
      const value = raw as {
        to?: unknown;
        sessionId?: unknown;
        bytes?: unknown;
      };
      if (value === null || typeof value !== "object")
        throw new ContractError("outgoing message is invalid");
      const to = identifier(value.to, "message recipient");
      if (
        to === from ||
        !this.definition.replicas.includes(to) ||
        (peer !== undefined && to !== peer)
      )
        throw new ContractError("message recipient is not permitted");
      const sessionId = identifier(value.sessionId, "message session");
      if (
        !(value.bytes instanceof Uint8Array) ||
        !(value.bytes.buffer instanceof ArrayBuffer)
      )
        throw new ContractError("message must contain ordinary binary bytes");
      if (value.bytes.length > this.limits.maxPacketBytes)
        throw new LimitError("packet exceeds resource limit");
      let packet = copied.get(value.bytes);
      if (packet === undefined) {
        packet = packetOf(value.bytes);
        copied.set(value.bytes, packet);
      }
      if (this.expected !== undefined) {
        const recorded = this.expected.receipt.packets.find(
          (item) => item.packet_id === packet.packet_id,
        );
        if (recorded === undefined || jcs(recorded) !== jcs(packet))
          throw new ContractError("replay generated packet mismatch");
      }
      if (!seen.has(packet.packet_id)) {
        addedRawBytes += packet.byteLength;
        if (
          this.uniquePacketBytes + addedRawBytes >
          this.limits.maxUniquePacketBytes
        )
          throw new LimitError("unique packets exceed resource limit");
        seen.add(packet.packet_id);
        packets.push(packet);
        bytes += utf8Length(jcs(packet)) + 1;
      }
      const dropped =
        generation === undefined &&
        random.next() < this.definition.network.dropRate;
      add(to, sessionId, packet, dropped);
      if (
        !dropped &&
        generation === undefined &&
        random.next() < this.definition.network.duplicateRate
      )
        add(to, sessionId, packet, false);
    }
    this.ensureBytes(bytes);
    return { random, budget, messageSequence, packets, entries, bytes };
  }
  commit(plan: Plan): void {
    this.networkRandom.copyFrom(plan.random);
    this.nextMessageSequence = plan.messageSequence;
    this.counts.scheduledMessages = plan.budget;
    for (const packet of plan.packets) {
      this.packets.set(packet.packet_id, packet);
      this.uniquePacketBytes += packet.byteLength;
      this.byteCost += utf8Length(jcs(packet)) + 1;
    }
    for (const { message, dropped } of plan.entries) {
      this.record({
        kind: dropped ? "dropped" : "scheduled",
        from: message.from,
        to: message.to,
        packet_id: message.packet_id,
        messageSequence: message.sequence,
        sessionId: message.sessionId,
        arrival: message.at,
        ...(message.recoveryGeneration === undefined
          ? {}
          : { recoveryGeneration: message.recoveryGeneration }),
      });
      if (dropped) this.invalidate();
      else {
        this.queue.push(message);
        if (
          message.recoveryGeneration !== undefined &&
          this.recovery?.generation === message.recoveryGeneration
        ) {
          this.recovery.requiredMessages.push({
            messageSequence: message.sequence,
            from: message.from,
            to: message.to,
            packet_id: message.packet_id,
            receivedAtSequence: null,
          });
          this.byteCost += 512;
        }
      }
    }
  }
  checks(phase: Phase): void {
    const requested = this.definition.checks.filter(
      (request) =>
        this.manifest.checks
          .find((check) => check.id === request.id)
          ?.phases.includes(phase) &&
        (request.id !== "convergence" || this.completed()),
    );
    if (requested.length === 0) return;
    const evidence = this.evidence();
    const context = Object.freeze({
      caseDefinition: this.definition,
      eventSequence: this.events.length,
      virtualTime: this.now,
      states: this.recordedStates(),
      phase,
      currentEvent: this.events.at(-1) ?? null,
      history: Object.freeze([...this.events]),
      completedRecovery: this.completed(),
      recoveryEvidence: evidence,
    });
    for (const request of requested) {
      const invariant = this.options.invariants.find(
        (item) => item.id === request.id,
      );
      if (invariant === undefined)
        throw new ContractError("check disappeared from its registry");
      const resultInput = synchronous(
        invariant.check(context, request.parameters),
      );
      const result = objectOf(resultInput, "check result", [
        "checkId",
        "passed",
        "reason",
        "evidence",
      ]);
      if (
        result.checkId !== request.id ||
        typeof result.passed !== "boolean" ||
        typeof result.reason !== "string" ||
        utf8Length(result.reason) > 4096 ||
        !Object.hasOwn(result, "evidence")
      )
        throw new ContractError("check result contract is invalid");
      const record = ownJson({
        phase,
        eventSequence: this.events.length,
        result,
      }) as { phase: Phase; eventSequence: number; result: CheckResult };
      const bytes = utf8Length(jcs(record)) + 1;
      if (bytes > 128 * 1024)
        throw new ContractError("check evidence exceeds its byte limit");
      this.ensureBytes(bytes);
      if (
        this.expected !== undefined &&
        jcs(this.expected.receipt.checks[this.results.length]) !== jcs(record)
      )
        throw new ContractError("replay check result mismatch");
      this.results.push(record);
      this.byteCost += bytes;
    }
  }
  recoverIfComplete(): void {
    const recovery = this.recovery;
    if (
      recovery === null ||
      recovery.completedAtSequence !== null ||
      recovery.invalidatedAtSequence !== null ||
      this.queue.size > 0 ||
      this.held.length > 0 ||
      recovery.completedPairs.length !== recovery.expectedPairs.length ||
      recovery.requiredMessages.some((item) => item.receivedAtSequence === null)
    )
      return;
    const event = this.record({
      kind: "recovery-complete",
      recoveryGeneration: recovery.generation,
    });
    recovery.completedAtSequence = event.sequence;
    this.checks("recovery");
  }
  deliver(message: Message): void {
    this.now = message.at;
    if (this.partitions.has(linkKey(message.from, message.to))) {
      this.record({
        kind: "held",
        from: message.from,
        to: message.to,
        packet_id: message.packet_id,
        messageSequence: message.sequence,
        ...(message.recoveryGeneration === undefined
          ? {}
          : { recoveryGeneration: message.recoveryGeneration }),
      });
      this.held.push(message);
      this.invalidate();
      return;
    }
    const packet =
      this.expected?.receipt.packets.find(
        (item) => item.packet_id === message.packet_id,
      ) ?? this.packets.get(message.packet_id);
    if (packet === undefined)
      throw new ContractError("scheduled packet is missing");
    const output = synchronous(
      this.options.adapter.receive(
        this.state(message.to),
        message.from,
        message.sessionId,
        decodePacket(packet),
        this.context(message.to, message.sessionId),
      ),
    );
    const plan = this.plan(message.to, output, message.recoveryGeneration);
    const observation = this.observation(message.to);
    this.ensureBytes(plan.bytes + utf8Length(jcs(observation)) + 2048, {
      ...this.recordedStates(),
      [message.to]: observation,
    });
    const event = this.record({
      kind: "delivery",
      from: message.from,
      to: message.to,
      packet_id: message.packet_id,
      messageSequence: message.sequence,
      sessionId: message.sessionId,
      state_after: observation,
      ...(message.recoveryGeneration === undefined
        ? {}
        : { recoveryGeneration: message.recoveryGeneration }),
    });
    this.observations.set(message.to, observation);
    this.counts.deliveredMessages += 1;
    const required = this.recovery?.requiredMessages.find(
      (item) => item.messageSequence === message.sequence,
    );
    if (required !== undefined) required.receivedAtSequence = event.sequence;
    this.commit(plan);
    this.checks("delivery");
    this.recoverIfComplete();
  }
  drain(until = Number.POSITIVE_INFINITY): void {
    while (
      this.queue.size > 0 &&
      (this.queue.peek()?.at ?? Number.POSITIVE_INFINITY) <= until
    ) {
      const message = this.queue.pop();
      if (message === undefined)
        throw new ContractError("scheduled queue changed during delivery");
      this.deliver(message);
    }
  }
  command(replica: string, request: Json): void {
    this.counts.attemptedCommands += 1;
    const output = synchronous(
      this.options.adapter.command(
        this.state(replica),
        request,
        this.context(replica),
      ),
    );
    const result = ownJson({ outcome: output.outcome, result: output.result });
    const fields = objectOf(result, "command result");
    if (fields.outcome !== "accepted" && fields.outcome !== "rejected")
      throw new ContractError("command outcome is invalid");
    const plan = this.plan(replica, output.outgoing);
    const observation = this.observation(replica);
    this.ensureBytes(
      plan.bytes + utf8Length(jcs({ request, result, observation })) + 2048,
      { ...this.recordedStates(), [replica]: observation },
    );
    this.invalidate();
    this.record({
      kind: "command",
      from: replica,
      request,
      outcome: fields.outcome,
      result: fields.result as Json,
      state_after: observation,
    });
    this.observations.set(replica, observation);
    this.counts.committedCommands += 1;
    if (fields.outcome === "accepted") this.counts.acceptedCommands += 1;
    else this.counts.rejectedCommands += 1;
    this.commit(plan);
    this.checks("command");
  }
  heal(): void {
    const generation = ++this.recoveryGeneration;
    const session = (from: string, to: string): string =>
      sha256Hex(`recovery\0${generation}\0${from}\0${to}`);
    const expectedPairs = this.definition.replicas.flatMap((from) =>
      this.definition.replicas
        .filter((to) => to !== from)
        .map((to) => ({ from, to })),
    );
    const plan = this.planHeld(generation);
    const event = this.record({ kind: "heal", recoveryGeneration: generation });
    this.recovery = {
      generation,
      startedAtSequence: event.sequence,
      completedAtSequence: null,
      expectedPairs,
      completedPairs: [],
      requiredMessages: [],
      invalidatedAtSequence: null,
    };
    this.byteCost += utf8Length(jcs(expectedPairs)) * 2 + 2048;
    this.partitions.clear();
    this.held.length = 0;
    this.commit(plan);
    for (const { from, to } of expectedPairs) {
      const output = synchronous(
        this.options.adapter.reconcile(
          this.state(from),
          to,
          session(from, to),
          this.context(from, session(from, to)),
        ),
      );
      if (!Array.isArray(output) || output.length === 0)
        throw new ContractError(
          "full-state recovery must emit a message for each pair",
        );
      const outgoing = this.plan(from, output, generation, to);
      const observation = this.observation(from);
      this.ensureBytes(outgoing.bytes + utf8Length(jcs(observation)) + 2048, {
        ...this.recordedStates(),
        [from]: observation,
      });
      this.record({
        kind: "reconcile",
        from,
        to,
        recoveryGeneration: generation,
        state_after: observation,
      });
      this.observations.set(from, observation);
      this.recovery.completedPairs.push({ from, to });
      this.commit(outgoing);
    }
    this.recoverIfComplete();
  }
  planHeld(generation: number): Plan {
    const random = this.networkRandom.clone();
    let budget = this.counts.scheduledMessages;
    let sequence = this.nextMessageSequence;
    const entries: Plan["entries"] = [];
    for (const previous of [...this.held].sort(
      (a, b) => a.sequence - b.sequence,
    )) {
      if (budget >= this.limits.maxEvents)
        throw new LimitError("network event budget exceeded");
      budget += 1;
      entries.push({
        message: {
          ...previous,
          at:
            this.now +
            random.integer(
              this.definition.network.minLatency,
              this.definition.network.maxLatency,
            ),
          sequence: sequence++,
          recoveryGeneration: generation,
        },
        dropped: false,
      });
    }
    const bytes = entries.length * 2048;
    this.ensureBytes(bytes);
    return {
      random,
      budget,
      messageSequence: sequence,
      packets: [],
      entries,
      bytes,
    };
  }
  run(): ReplayBundle {
    let status: ReceiptBody["status"] = "passed";
    let reason = "all requested checks and recovery completed";
    let abortedEventSequence: number | null = null;
    try {
      for (const replica of this.definition.replicas) {
        const state = synchronous(
          this.options.adapter.create(
            this.definition.bootstrap[replica] as Json,
            this.context(replica),
          ),
        );
        this.states.set(replica, state);
        const observation = this.observation(replica);
        this.ensureBytes(utf8Length(jcs(observation)) * 2 + 512);
        this.observations.set(replica, observation);
        this.initialStates.set(replica, observation);
        this.byteCost += utf8Length(jcs(observation)) + 256;
      }
      this.checks("initial");
      for (const step of this.definition.steps) {
        this.drain(step.at);
        this.now = step.at;
        if (step.action === "command") this.command(step.replica, step.command);
        else if (step.action === "heal") this.heal();
        else {
          this.invalidate();
          this.record({ kind: "partition", from: step.left, to: step.right });
          this.partitions.add(linkKey(step.left, step.right));
        }
      }
      this.drain();
      this.recoverIfComplete();
      if (!this.completed()) {
        status = "inconclusive";
        reason = "required final recovery is incomplete or invalidated";
      } else {
        this.checks("final");
        if (this.results.some((result) => !result.result.passed)) {
          status = "failed";
          reason = "an independent rule failed";
        } else if (
          this.definition.checks.some(
            (check) =>
              !this.results.some(
                (result) => result.result.checkId === check.id,
              ),
          )
        ) {
          status = "inconclusive";
          reason = "a required check did not execute";
        }
      }
    } catch (error) {
      status = error instanceof LimitError ? "inconclusive" : "error";
      reason =
        error instanceof LimitError
          ? error.message
          : error instanceof ContractError &&
              error.message.isWellFormed() &&
              utf8Length(error.message) <= 4096
            ? error.message
            : "adapter or checker method threw";
      abortedEventSequence = this.events.length + 1;
    } finally {
      for (const state of this.states.values()) {
        try {
          synchronous(this.options.adapter.close(state));
        } catch {
          status = "error";
          reason = "adapter cleanup failed";
        }
      }
    }
    const receipt = ownJson({
      format_version: 2,
      case_id: this.case_id,
      manifest: this.manifest,
      initialStates: Object.fromEntries(this.initialStates),
      finalStates: this.recordedStates(),
      packets: [...this.packets.values()],
      events: this.events,
      recovery: this.evidence(),
      checks: this.results,
      counts: this.counts,
      status,
      reason,
      abortedEventSequence,
    }) as ReceiptBody;
    const run_id = sha256Hex("causal-lab-run-v2\0" + jcs(receipt));
    const bundle = Object.freeze({
      format_version: 2 as const,
      caseDefinition: this.definition,
      case_id: this.case_id,
      receipt,
      run_id,
    });
    if (utf8Length(jcs(bundle)) > this.limits.maxBundleBytes)
      throw new LimitError("complete result bundle exceeds resource limit");
    if (this.expected !== undefined && jcs(bundle) !== jcs(this.expected))
      throw new ContractError("replay final receipt mismatch");
    return bundle;
  }
}

export function executeVerification<S>(
  input: unknown,
  options: VerifierOptions<S>,
): ReplayBundle {
  return new Runner(input, options).run();
}
export function replayVerification<S>(
  input: unknown,
  options: VerifierOptions<S>,
): ReplayBundle {
  const bundle = readBundle(input);
  return new Runner(bundle.caseDefinition, options, bundle).run();
}

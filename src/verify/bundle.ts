import { ContractError, utf8Length } from "../crdt.js";
import { sha256Hex } from "../sha256.js";
import { parseVerificationCase } from "./case.js";
import {
  hashOf,
  jcs,
  objectOf,
  ownJson,
  parseJsonText,
  type Json,
} from "./json.js";
import { buildManifest } from "./manifest.js";
import { decodePacket } from "./packet.js";
import {
  DEFAULT_LIMITS,
  type ExecutionManifest,
  type ModelAdapter,
  type Packet,
  type Phase,
  type ReplayBundle,
  type VerificationCase,
} from "./types.js";

const phases: readonly Phase[] = [
  "initial",
  "command",
  "delivery",
  "recovery",
  "final",
];
function reject(message: string): never {
  throw new ContractError("invalid verification file: " + message);
}
function integer(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > max
  )
    reject("integer");
  return value;
}
function array(value: unknown, max: number): readonly Json[] {
  if (!Array.isArray(value) || value.length > max) reject("array");
  return value as readonly Json[];
}
function text(value: unknown, max = 4096): string {
  if (typeof value !== "string" || utf8Length(value) > max) reject("text");
  return value;
}
function manifestOf(
  value: unknown,
  definition: VerificationCase,
): ExecutionManifest {
  const data = objectOf(value, "execution manifest", [
    "adapterApi",
    "model_id",
    "adapterId",
    "adapterVersion",
    "adapterSha256",
    "implementation",
    "profile",
    "recoveryPolicy",
    "observationVersion",
    "supportedCommands",
    "supportedChecks",
    "engineVersion",
    "engineSha256",
    "lockSha256",
    "randomVersion",
    "schedulerVersion",
    "canonicalization",
    "checks",
  ]);
  const descriptors = array(data.checks, 32).map((value) => {
    const item = objectOf(value, "check descriptor", [
      "id",
      "version",
      "sha256",
      "phases",
    ]);
    return {
      ...item,
      check: () => reject("checker must not execute while validating"),
    };
  });
  const adapterData = Object.fromEntries(
    [
      "adapterApi",
      "model_id",
      "adapterId",
      "adapterVersion",
      "adapterSha256",
      "implementation",
      "profile",
      "recoveryPolicy",
      "observationVersion",
      "supportedCommands",
      "supportedChecks",
    ].map((key) => [key, data[key]]),
  );
  const forbidden = () => reject("target must not execute while validating");
  const adapter = {
    manifest: adapterData,
    create: forbidden,
    command: forbidden,
    receive: forbidden,
    reconcile: forbidden,
    observe: forbidden,
    close: forbidden,
  } as unknown as ModelAdapter<never>;
  const engine = Object.fromEntries(
    [
      "engineVersion",
      "engineSha256",
      "lockSha256",
      "randomVersion",
      "schedulerVersion",
      "canonicalization",
    ].map((key) => [key, data[key]]),
  );
  const validated = buildManifest(
    definition,
    adapter,
    descriptors as unknown as Parameters<typeof buildManifest>[2],
    engine as unknown as Parameters<typeof buildManifest>[3],
  );
  if (jcs(validated) !== jcs(data))
    reject("manifest is not canonical or complete");
  return validated;
}
export function statesAt(
  bundle: ReplayBundle,
  sequence: number,
): Readonly<Record<string, Json>> {
  integer(sequence, bundle.receipt.events.length);
  const states: Record<string, Json> = Object.fromEntries(
    Object.entries(bundle.receipt.initialStates),
  );
  for (const event of bundle.receipt.events) {
    if (event.sequence > sequence) break;
    if (Object.hasOwn(event, "state_after")) {
      const actor = event.kind === "delivery" ? event.to : event.from;
      if (actor === undefined) reject("state actor");
      Object.defineProperty(states, actor, {
        value: event.state_after,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }
  return Object.freeze(states);
}
export function readBundle(input: unknown): ReplayBundle {
  const source =
    typeof input === "string" ? parseJsonText(input) : ownJson(input);
  if (utf8Length(jcs(source)) > DEFAULT_LIMITS.maxBundleBytes)
    reject("bundle byte limit");
  const data = objectOf(source, "verification file", [
    "format_version",
    "caseDefinition",
    "case_id",
    "receipt",
    "run_id",
  ]);
  if (data.format_version !== 2) reject("format");
  const definition = parseVerificationCase(data.caseDefinition);
  const caseId = sha256Hex("causal-lab-case-v2\0" + jcs(definition));
  if (data.case_id !== caseId) reject("case hash");
  const receipt = objectOf(data.receipt, "receipt", [
    "format_version",
    "case_id",
    "manifest",
    "initialStates",
    "finalStates",
    "packets",
    "events",
    "recovery",
    "checks",
    "counts",
    "status",
    "reason",
    "abortedEventSequence",
  ]);
  if (receipt.format_version !== 2 || receipt.case_id !== caseId)
    reject("receipt case");
  manifestOf(receipt.manifest, definition);
  const statuses = ["passed", "failed", "inconclusive", "error"];
  if (!statuses.includes(text(receipt.status, 16))) reject("status");
  text(receipt.reason);
  const packets = new Map<string, Packet>();
  let rawBytes = 0;
  for (const value of array(receipt.packets, DEFAULT_LIMITS.maxEvents)) {
    const packet = objectOf(value, "packet", [
      "packet_id",
      "encoding",
      "byteLength",
      "bytes",
    ]) as Packet;
    hashOf(packet.packet_id, "packet hash");
    integer(packet.byteLength, DEFAULT_LIMITS.maxPacketBytes);
    text(packet.bytes, Math.ceil(DEFAULT_LIMITS.maxPacketBytes / 3) * 4);
    if (packets.has(packet.packet_id)) reject("duplicate packet");
    decodePacket(packet);
    rawBytes += packet.byteLength;
    packets.set(packet.packet_id, packet);
  }
  if (rawBytes > DEFAULT_LIMITS.maxUniquePacketBytes)
    reject("unique packet byte limit");
  const initial = objectOf(receipt.initialStates, "initial states");
  const final = objectOf(receipt.finalStates, "final states");
  for (const id of [...Object.keys(initial), ...Object.keys(final)])
    if (!definition.replicas.includes(id)) reject("unknown state replica");
  const terminal = receipt.status === "passed" || receipt.status === "failed";
  if (terminal && Object.keys(initial).length !== definition.replicas.length)
    reject("missing initial states");
  const events = array(receipt.events, 100_000);
  let lastTime = 0;
  let commands = 0;
  let accepted = 0;
  let rejected = 0;
  let delivered = 0;
  let nextMessage = 1;
  let stepIndex = 0;
  const messages = new Map<number, Readonly<Record<string, Json>>>();
  const deliveries = new Map<number, number>();
  const held = new Set<number>();
  const parsedEvents = events.map((value, index) => {
    const event = objectOf(value, "event", [
      "sequence",
      "time",
      "kind",
      "from",
      "to",
      "packet_id",
      "messageSequence",
      "recoveryGeneration",
      "request",
      "outcome",
      "result",
      "state_after",
      "arrival",
      "sessionId",
    ]);
    if (event.sequence !== index + 1) reject("event order");
    const time = integer(event.time);
    if (time < lastTime) reject("event time");
    lastTime = time;
    const kind = text(event.kind, 32);
    if (
      ![
        "command",
        "scheduled",
        "dropped",
        "held",
        "delivery",
        "partition",
        "heal",
        "reconcile",
        "recovery-complete",
      ].includes(kind)
    )
      reject("event kind");
    for (const key of ["from", "to"])
      if (
        event[key] !== undefined &&
        !definition.replicas.includes(event[key] as string)
      )
        reject("event actor");
    if (event.recoveryGeneration !== undefined) {
      integer(event.recoveryGeneration);
      if (event.recoveryGeneration === 0) reject("generation");
    }
    if (["command", "partition", "heal"].includes(kind)) {
      const step = definition.steps[stepIndex++];
      if (step === undefined || step.at !== time) reject("step time/order");
      if (kind === "command") {
        if (
          step.action !== "command" ||
          step.replica !== event.from ||
          jcs(step.command) !== jcs(event.request)
        )
          reject("command request");
      } else if (kind === "partition") {
        if (
          step.action !== "partition" ||
          step.left !== event.from ||
          step.right !== event.to
        )
          reject("partition request");
      } else if (step.action !== "heal") reject("heal request");
    }
    if (kind === "command") {
      commands++;
      if (event.outcome === "accepted") accepted++;
      else if (event.outcome === "rejected") rejected++;
      else reject("command outcome");
      if (!Object.hasOwn(event, "result")) reject("command result");
    }
    if (["command", "delivery", "reconcile"].includes(kind)) {
      if (
        !Object.hasOwn(event, "state_after") ||
        !Object.hasOwn(
          initial,
          (kind === "delivery" ? event.to : event.from) as string,
        )
      )
        reject("state observation");
    } else if (Object.hasOwn(event, "state_after")) reject("unexpected state");
    if (["scheduled", "dropped", "delivery", "held"].includes(kind)) {
      if (
        event.from === undefined ||
        event.to === undefined ||
        event.from === event.to ||
        !packets.has(event.packet_id as string)
      )
        reject("message actors/packet");
      const id = integer(event.messageSequence, DEFAULT_LIMITS.maxEvents);
      if (kind === "scheduled" || kind === "dropped") {
        if (id !== nextMessage++) reject("message creation order");
        integer(event.arrival);
        if ((event.arrival as number) < time) reject("arrival");
        text(event.sessionId, 128);
        messages.set(id, event);
      } else {
        const message = messages.get(id);
        if (
          message === undefined ||
          message.kind !== "scheduled" ||
          message.from !== event.from ||
          message.to !== event.to ||
          message.packet_id !== event.packet_id ||
          message.arrival !== time ||
          deliveries.has(id) ||
          held.has(id) ||
          message.recoveryGeneration !== event.recoveryGeneration
        )
          reject("delivery does not match scheduling");
        if (kind === "delivery") {
          if (message.sessionId !== event.sessionId) reject("session");
          deliveries.set(id, index + 1);
          delivered++;
        } else held.add(id);
      }
    }
    return event;
  });
  const counts = objectOf(receipt.counts, "counts", [
    "attemptedCommands",
    "committedCommands",
    "acceptedCommands",
    "rejectedCommands",
    "scheduledMessages",
    "deliveredMessages",
  ]);
  for (const value of Object.values(counts))
    integer(value, DEFAULT_LIMITS.maxEvents + 1000);
  if (
    counts.committedCommands !== commands ||
    counts.acceptedCommands !== accepted ||
    counts.rejectedCommands !== rejected ||
    counts.deliveredMessages !== delivered ||
    counts.scheduledMessages !== messages.size ||
    (counts.attemptedCommands as number) < commands ||
    (counts.attemptedCommands as number) > commands + 1
  )
    reject("counter contradiction");
  if (terminal && stepIndex !== definition.steps.length)
    reject("missing steps");
  if (
    receipt.abortedEventSequence !== null &&
    receipt.abortedEventSequence !== events.length + 1
  )
    reject("aborted sequence");
  const bundle = data as unknown as ReplayBundle;
  if (jcs(statesAt(bundle, events.length)) !== jcs(final))
    reject("final state differs from events");
  let complete = false;
  if (receipt.recovery !== null) {
    const recovery = objectOf(receipt.recovery, "recovery", [
      "policy",
      "generation",
      "startedAtSequence",
      "completedAtSequence",
      "expectedPairs",
      "completedPairs",
      "requiredMessages",
      "pending",
      "held",
      "invalidatedAtSequence",
    ]);
    if (recovery.policy !== "full-state-exchange-v1") reject("recovery policy");
    const generation = integer(recovery.generation);
    const start = integer(recovery.startedAtSequence, events.length);
    if (
      parsedEvents[start - 1]?.kind !== "heal" ||
      parsedEvents[start - 1]?.recoveryGeneration !== generation
    )
      reject("recovery start");
    const expected = definition.replicas.flatMap((from) =>
      definition.replicas
        .filter((to) => to !== from)
        .map((to) => ({ from, to })),
    );
    if (jcs(expected) !== jcs(recovery.expectedPairs)) reject("recovery pairs");
    const pairEvents = parsedEvents
      .slice(start)
      .filter(
        (event) =>
          event.kind === "reconcile" && event.recoveryGeneration === generation,
      )
      .map(({ from, to }) => ({ from, to }));
    if (
      jcs(pairEvents) !== jcs(recovery.completedPairs) ||
      jcs(pairEvents) !== jcs(expected.slice(0, pairEvents.length))
    )
      reject("reconciled pairs");
    const reconciliations = parsedEvents.filter(
      (event) =>
        event.kind === "reconcile" && event.recoveryGeneration === generation,
    );
    for (const [index, pair] of reconciliations.entries()) {
      const next = reconciliations[index + 1]?.sequence ?? events.length + 1;
      if (
        !parsedEvents.some(
          (event) =>
            event.kind === "scheduled" &&
            event.recoveryGeneration === generation &&
            event.from === pair.from &&
            event.to === pair.to &&
            (event.sequence as number) > (pair.sequence as number) &&
            (event.sequence as number) < (next as number),
        )
      )
        reject("reconciled pair did not emit full-state bytes");
    }
    const required = array(recovery.requiredMessages, DEFAULT_LIMITS.maxEvents);
    const scheduled = parsedEvents.filter(
      (event) =>
        event.kind === "scheduled" && event.recoveryGeneration === generation,
    );
    if (required.length !== scheduled.length)
      reject("required recovery messages");
    for (const [index, value] of required.entries()) {
      const item = objectOf(value, "required message", [
        "messageSequence",
        "from",
        "to",
        "packet_id",
        "receivedAtSequence",
      ]);
      const event = scheduled[index];
      if (
        event === undefined ||
        item.messageSequence !== event.messageSequence ||
        item.from !== event.from ||
        item.to !== event.to ||
        item.packet_id !== event.packet_id ||
        item.receivedAtSequence !==
          (deliveries.get(item.messageSequence as number) ?? null)
      )
        reject("recovery delivery proof");
    }
    integer(recovery.pending, DEFAULT_LIMITS.maxEvents);
    integer(recovery.held, DEFAULT_LIMITS.maxEvents);
    if (recovery.invalidatedAtSequence !== null)
      integer(recovery.invalidatedAtSequence, events.length + 1);
    if (recovery.completedAtSequence !== null) {
      const end = integer(recovery.completedAtSequence, events.length);
      if (
        end <= start ||
        parsedEvents[end - 1]?.kind !== "recovery-complete" ||
        parsedEvents[end - 1]?.recoveryGeneration !== generation ||
        pairEvents.length !== expected.length ||
        required.some(
          (value) =>
            (value as Record<string, Json>).receivedAtSequence === null,
        ) ||
        required.some(
          (value) =>
            ((value as Record<string, Json>).receivedAtSequence as number) >=
            end,
        )
      )
        reject("recovery completion");
      complete =
        recovery.invalidatedAtSequence === null &&
        recovery.pending === 0 &&
        recovery.held === 0;
    }
  }
  const checks = array(receipt.checks, 100_000);
  let failed = false;
  const executed = new Set<string>();
  const uniqueChecks = new Set<string>();
  let finalConvergence = false;
  for (const value of checks) {
    const record = objectOf(value, "check record", [
      "phase",
      "eventSequence",
      "result",
    ]);
    if (!phases.includes(record.phase as Phase)) reject("check phase");
    integer(record.eventSequence, events.length);
    if (
      (record.phase === "initial" && record.eventSequence !== 0) ||
      (record.phase === "final" && record.eventSequence !== events.length) ||
      (record.phase === "command" &&
        parsedEvents[(record.eventSequence as number) - 1]?.kind !==
          "command") ||
      (record.phase === "delivery" &&
        parsedEvents[(record.eventSequence as number) - 1]?.kind !==
          "delivery") ||
      (record.phase === "recovery" &&
        parsedEvents[(record.eventSequence as number) - 1]?.kind !==
          "recovery-complete")
    )
      reject("check phase does not match event");
    const result = objectOf(record.result, "check result", [
      "checkId",
      "passed",
      "reason",
      "evidence",
    ]);
    const descriptor = (
      receipt.manifest as unknown as ExecutionManifest
    ).checks.find((check) => check.id === result.checkId);
    if (
      descriptor === undefined ||
      !descriptor.phases.includes(record.phase as Phase) ||
      typeof result.passed !== "boolean" ||
      !Object.hasOwn(result, "evidence")
    )
      reject("check contract");
    text(result.reason);
    const key = jcs([record.phase, record.eventSequence, result.checkId]);
    if (uniqueChecks.has(key)) reject("duplicate check record");
    uniqueChecks.add(key);
    if (result.checkId === "convergence" && record.phase === "final")
      finalConvergence = true;
    executed.add(result.checkId as string);
    if (!result.passed) failed = true;
  }
  if (
    terminal &&
    (!complete ||
      !finalConvergence ||
      counts.attemptedCommands !== commands ||
      receipt.abortedEventSequence !== null ||
      definition.checks.some((check) => !executed.has(check.id)) ||
      (receipt.status === "passed" && failed) ||
      (receipt.status === "failed" && !failed))
  )
    reject("status lacks completed proof");
  hashOf(data.run_id, "run hash");
  if (data.run_id !== sha256Hex("causal-lab-run-v2\0" + jcs(receipt)))
    reject("run hash");
  return bundle;
}

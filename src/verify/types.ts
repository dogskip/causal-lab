import type { Json } from "./json.js";
export type { Json } from "./json.js";

export type Status = "passed" | "failed" | "inconclusive" | "error";
export type DeliveryProfile = "independent-updates" | "ordered-session";
export type Phase = "initial" | "command" | "delivery" | "recovery" | "final";
export type Context = Readonly<{
  replica: string;
  virtualTime: number;
  eventSequence: number;
  sessionId: string;
  randomUint32(): number;
}>;
export type Outgoing = Readonly<{
  to: string;
  sessionId: string;
  bytes: Uint8Array;
}>;
export type CommandResult = Readonly<{
  outcome: "accepted" | "rejected";
  result: Json;
  outgoing: readonly Outgoing[];
}>;
export type Manifest = Readonly<{
  adapterApi: "causal-lab-adapter-v2";
  model_id: string;
  adapterId: string;
  adapterVersion: string;
  adapterSha256: string;
  implementation: Readonly<{
    name: string;
    version: string;
    integrity: string;
  }>;
  profile: DeliveryProfile;
  recoveryPolicy: "full-state-exchange-v1";
  observationVersion: string;
  supportedCommands: readonly string[];
  supportedChecks: readonly string[];
}>;
export interface ModelAdapter<State> {
  readonly manifest: Manifest;
  create(bootstrap: Json, context: Context): State;
  command(state: State, command: Json, context: Context): CommandResult;
  receive(
    state: State,
    from: string,
    sessionId: string,
    bytes: Uint8Array,
    context: Context,
  ): readonly Outgoing[];
  reconcile(
    state: State,
    peer: string,
    sessionId: string,
    context: Context,
  ): readonly Outgoing[];
  observe(state: State): Json;
  close(state: State): void;
}
export type CheckResult = Readonly<{
  checkId: string;
  passed: boolean;
  reason: string;
  evidence: Json;
}>;
export type CheckContext = Readonly<{
  caseDefinition: Json;
  eventSequence: number;
  virtualTime: number;
  states: Readonly<Record<string, Json>>;
  phase: Phase;
  currentEvent: Json | null;
  history: readonly Json[];
  completedRecovery: boolean;
  recoveryEvidence: Json | null;
}>;
export interface Invariant {
  readonly id: string;
  readonly version: string;
  readonly sha256: string;
  readonly phases: readonly Phase[];
  check(context: CheckContext, parameters: Json): CheckResult;
}

export type VerificationStep =
  | Readonly<{ at: number; action: "command"; replica: string; command: Json }>
  | Readonly<{ at: number; action: "partition"; left: string; right: string }>
  | Readonly<{ at: number; action: "heal" }>;
export type VerificationCase = Readonly<{
  format_version: 2;
  model_id: string;
  profile: "independent-updates";
  replicas: readonly string[];
  bootstrap: Readonly<Record<string, Json>>;
  seed: number;
  network: Readonly<{
    minLatency: number;
    maxLatency: number;
    dropRate: number;
    duplicateRate: number;
  }>;
  steps: readonly VerificationStep[];
  checks: readonly Readonly<{ id: string; parameters: Json }>[];
}>;
export type EngineIdentity = Readonly<{
  engineVersion: string;
  engineSha256: string;
  lockSha256: string;
  randomVersion: "mulberry32-v1";
  schedulerVersion: "arrival-sequence-v1";
  canonicalization: "RFC8785";
}>;
export type ExecutionManifest = Manifest &
  EngineIdentity &
  Readonly<{
    checks: readonly Readonly<{
      id: string;
      version: string;
      sha256: string;
      phases: readonly Phase[];
    }>[];
  }>;
export type Packet = Readonly<{
  packet_id: string;
  encoding: "base64";
  byteLength: number;
  bytes: string;
}>;
export type VerificationEvent = Readonly<{
  sequence: number;
  time: number;
  kind:
    | "command"
    | "scheduled"
    | "dropped"
    | "held"
    | "delivery"
    | "partition"
    | "heal"
    | "reconcile"
    | "recovery-complete";
  from?: string;
  to?: string;
  packet_id?: string;
  messageSequence?: number;
  recoveryGeneration?: number;
  request?: Json;
  outcome?: "accepted" | "rejected";
  result?: Json;
  state_after?: Json;
  arrival?: number;
  sessionId?: string;
}>;
export type RecoveryEvidence = Readonly<{
  policy: "full-state-exchange-v1";
  generation: number;
  startedAtSequence: number;
  completedAtSequence: number | null;
  expectedPairs: readonly Readonly<{ from: string; to: string }>[];
  completedPairs: readonly Readonly<{ from: string; to: string }>[];
  requiredMessages: readonly Readonly<{
    messageSequence: number;
    from: string;
    to: string;
    packet_id: string;
    receivedAtSequence: number | null;
  }>[];
  pending: number;
  held: number;
  invalidatedAtSequence: number | null;
}>;
export type ReceiptBody = Readonly<{
  format_version: 2;
  case_id: string;
  manifest: ExecutionManifest;
  initialStates: Readonly<Record<string, Json>>;
  finalStates: Readonly<Record<string, Json>>;
  packets: readonly Packet[];
  events: readonly VerificationEvent[];
  recovery: RecoveryEvidence | null;
  checks: readonly Readonly<{
    phase: Phase;
    eventSequence: number;
    result: CheckResult;
  }>[];
  counts: Readonly<{
    attemptedCommands: number;
    committedCommands: number;
    acceptedCommands: number;
    rejectedCommands: number;
    scheduledMessages: number;
    deliveredMessages: number;
  }>;
  status: Status;
  reason: string;
  abortedEventSequence: number | null;
}>;
export type ReplayBundle = Readonly<{
  format_version: 2;
  caseDefinition: VerificationCase;
  case_id: string;
  receipt: ReceiptBody;
  run_id: string;
}>;
export type Limits = Readonly<{
  maxEvents: number;
  maxPacketBytes: number;
  maxUniquePacketBytes: number;
  maxBundleBytes: number;
}>;
export type VerifierOptions<State> = Readonly<{
  adapter: ModelAdapter<State>;
  invariants: readonly Invariant[];
  engine: EngineIdentity;
  limits?: Partial<Limits>;
}>;
export const DEFAULT_LIMITS: Limits = Object.freeze({
  maxEvents: 10_000,
  maxPacketBytes: 1024 * 1024,
  maxUniquePacketBytes: 8 * 1024 * 1024,
  maxBundleBytes: 32 * 1024 * 1024,
});

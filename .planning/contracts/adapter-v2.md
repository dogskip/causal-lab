---
title: "동기식 대상 연결 계약 v2 타입 초안"
authority_level: authority
ssot: true
owner: architecture
status: approved
last_updated: 2026-10-14
derived_from: [".planning/PROJECT.md", ".planning/DESIGN.md"]
source_of_truth_for: ["제안 ModelAdapter와 Invariant의 타입"]
must_not_be_overridden_by: []
ai_edit_policy: editable-but-must-not-contradict-sources
---

# 대상 연결 계약 v2

아직 배포한 API가 아니다. 이 구간을 임시 .d.ts 파일로 추출해 TypeScript 5.9.3 strict 검사한다.
전달 조건의 실행 가능성·JSON/바이트 검증·해시·자원 제한은 DESIGN.md의 합격 조건이며 타입 검사만으로 입증하지 않는다.

```typescript
export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
export type Status = "passed" | "failed" | "inconclusive" | "error";
export type DeliveryProfile = "independent-updates" | "ordered-session";
export type Context = Readonly<{ replica: string; virtualTime: number; eventSequence: number; sessionId: string; randomUint32(): number }>;
export type Outgoing = Readonly<{ to: string; sessionId: string; bytes: Uint8Array }>;
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
  implementation: Readonly<{ name: string; version: string; integrity: string }>;
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
  receive(state: State, from: string, sessionId: string, bytes: Uint8Array, context: Context): readonly Outgoing[];
  reconcile(state: State, peer: string, sessionId: string, context: Context): readonly Outgoing[];
  observe(state: State): Json;
  close(state: State): void;
}
export type CheckResult = Readonly<{ checkId: string; passed: boolean; reason: string; evidence: Json }>;
export type CheckContext = Readonly<{
  caseDefinition: Json;
  eventSequence: number;
  virtualTime: number;
  states: Readonly<Record<string, Json>>;
  phase: "initial" | "command" | "delivery" | "recovery" | "final";
  currentEvent: Json | null;
  history: readonly Json[];
  recoveryEvidence: Json | null;
  completedRecovery: boolean;
}>;
export interface Invariant {
  readonly id: string;
  readonly version: string;
  readonly sha256: string;
  readonly phases: readonly CheckContext["phase"][];
  check(context: CheckContext, parameters: Json): CheckResult;
}
```

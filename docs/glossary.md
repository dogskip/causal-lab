---
title: "Causal Lab 용어"
authority_level: authority
ssot: true
owner: architecture
status: approved
last_updated: 2026-10-14
derived_from: ["현재 코드", ".planning/PROJECT.md", ".planning/DESIGN.md"]
source_of_truth_for: ["현재 기능과 제안 검증 계약의 용어"]
must_not_be_overridden_by: [".planning/RESEARCH.md"]
ai_edit_policy: editable-but-must-not-contradict-sources
---

# Glossary

- **CRDT (Conflict-free Replicated Data Type)** — A data structure that replicas can update independently and merge without coordination, always converging to the same state once they have received the same set of operations. Causal Lab implements an *observed-remove map*.
- **Observed-remove map (OR-Map)** — A map where a `remove` only deletes the values the remover had *observed* at the time of removal. Values written concurrently with the remove survive. This is what makes concurrent edits safe.
- **Dot** — A unique operation identifier of the form `{ replica, counter }`. Each `put` and `remove` is tagged with a dot drawn from the issuing replica's version vector.
- **Version vector** — A map from replica id to that replica's highest observed counter. The highest counter is a summary, not a proof that every preceding dot arrived. Replica's operation map detects duplicate dots; `dominates` compares these summaries.
- **Tombstone** — A dot that has been removed. Once a dot is a tombstone, a late-arriving `put` of that dot is suppressed (idempotent), but a concurrent put with a fresh dot is not.
- **Anti-entropy** — A reliable pass that resends every known operation to every replica so they converge. Causal Lab performs this on `heal`; delivery in this pass is reliable; completion still requires the event budget and valid report membership.
- **Virtual time** — An integer tick the simulator advances manually (`advance`, step `at` times). There is no wall clock in the core — virtual time is what makes runs deterministic and reproducible.
- **Deterministic simulation** — The intended contract is byte-identical output for the same scenario and complete execution manifest. Current violations and the proposed manifest are documented in `.planning/DESIGN.md`. The scheduler, RNG, and clock are all controlled; there is no `Date.now()`, `Math.random()`, or socket in the core.
- **Content-addressing** — Scenario identifiers are SHA-256 over validated canonical definition bytes. Execution identifiers additionally depend on their execution record; reproducibility requires the complete execution contract. An identifier checks content equality, not correctness or authorship.
- **Canonical JSON** — A normalized JSON form (`causal-lab-json-v1`) with sorted object keys, preserved array order, and finite numbers only. Used so that semantically-equal scenarios produce identical bytes and thus identical ids.
- **Receipt** — An immutable scenario or execution record keyed by its SHA-256 digest. Byte-identical executions produce the same receipt; the catalog rejects updates and deletes to stored receipts. Current determinism violations and proposed v2 verification are documented in `.planning/DESIGN.md`.
- **Trace** — The ordered list of events (`local`, `scheduled`, `dropped`, `held`, `delivered`, `partition`, `heal`) the simulator recorded. The trace is what makes a run inspectable and reproducible.
- **Partition** — A network split between two replicas; messages between them are held until a `heal`.
- **Heal** — Clears partitions and requests the built-in reliable reconciliation pass. A verified completed pass is a precondition for the corresponding convergence check.
- **Playground** — The browser app that edits a scenario and replays its trace as a timeline. It reuses the core modules and stays outside the simulation contract.
- **Frame** — One replay position: replica lanes, message arrows, partition bands, and the per-replica state differences at that point.
- **Snapshot** — The current v1 replay records states at step boundaries. The proposed v2 contract records the actual initial observation and immutable observations after committed events.
- **Oracle** — An expected result computed outside the core, against which a property is checked.
- **Counterexample** — The shrunk command sequence and seed that a property test failed on.

## 제안 검증 도구의 용어

아래는 .planning/PROJECT.md와 DESIGN.md의 목표 계약이며 현재 배포한 기능이 아니다.

- **ModelAdapter** — 실제 대상의 변경·수신·복구·관찰을 공통 실행기에 연결하는 신뢰한 코드.
- **VerificationCase** — 대상 의미와 전달 조건, 초기 상태·ID, 명령·장애, 검사 매개변수를 가진 시험 정의.
- **Invariant** — 대상 내부의 판정과 독립적으로 검사하는 업무 규칙과 그 코드·호출 시점.
- **Verdict** — passed/failed/inconclusive/error 중 하나인 검사 판정.
- **ExecutionManifest** — 재현에 필요한 실행·난수·자료 규약과 대상·연결·검사 코드의 정확한 버전·해시·초기화 조건.
- **ReplayBundle** — 시험 정의와 메시지·사건·검사 결과·ID를 함께 보관한 JSON 결과 묶음.
- **CommittedEvent** — 구조·크기를 검증하고 참조를 분리해 확정한 사건과 관찰값. 이후 변경이 과거 기록을 바꾸지 않는다.
- **Reconciliation** — 대상의 실제 전체 상태 API로 모든 서로 다른 순서쌍에 신뢰 전달하는 첫 복구 정책. 완료 증거·무효화는 DESIGN §5를 따르며 실제 수렴은 독립 검사가 판단한다.

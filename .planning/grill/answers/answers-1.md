# Grill Round 1 — 2026-09-19

브랜치: feature/quality-usability-perf

## 확정된 결정

| # | 질문 | 답 |
|---|---|---|
| 1 | WASM의 의미 | **브라우저 번들만** — WASM 모듈 없음. 기존 TS 코어를 번들 |
| 2 | 웹 UI 범위 | **작성 + 재생** — partition/put/heal 조작 + 타임라인 재생 + 예제 JSON 로드 |
| 3 | "수학적 증명"의 정의 | **반증 강화 + 논증 문서** — 적대적 손실/중복/재정렬, 규모 확대, 모델 기반 테스트 + docs 논증. 속성 테스트는 증명이 아니라 반증임을 명시 |
| 4 | 패키지 구조 | **같은 패키지 + 새 디렉터리** — 번들러는 devDependency, npm files에서 제외 |
| 5 | 배포 | **수동 배포 워크플로** — workflow_dispatch로만 Pages 게시, push 트리거 없음 |
| 6 | 착수 순서 | **속성 테스트 먼저** — 코어 신뢰 강화 후 웹 앱 |
| 7 | 용어집 SSOT | **docs/glossary.md 유지** — 루트 CONTEXT.md 신설하지 않음 |

## 질문에 실린 근거 (조사 결과)

- 시뮬레이션 코어 `src/simulation.ts`(384줄), `src/crdt.ts`(227줄), `src/trace.ts`(67줄)는 `node:` import 0건인 순수 TS.
- Node 전용 모듈: `src/scenario.ts:1` (node:crypto — `scenarioIdentity`만 사용, `parseScenario`/`executeScenario`는 해시 불필요), `src/catalog.ts` (node:sqlite/fs/path), `src/repl.ts:20` (node:readline), `src/server.ts` (@hono/node-server).
- `test/property.test.ts`(208줄)에 fast-check 속성 8개 존재. 수렴 속성은 `{ ...config, dropRate: 0, duplicateRate: 0 }`로 설정을 고정한 뒤 `converged === true`만 확인 → 반증력 약함. `numRuns: 100`, `seed: 0xcafe`.
- `docs/test-contract.md`가 불변식 SSOT(11개 항목 + 한도 문장), `test/contract-coverage.test.ts`가 계약 문장 ↔ 테스트 마커 매핑을 강제.
- `.github/workflows/ci.yml`: lint/typecheck/test/build, ubuntu+macos 매트릭스, timeout 10분, 배포 단계 없음.
- 단일 패키지, pnpm 워크스페이스 없음, 의존성 전부 정확 버전 고정(^ 없음).
- `docs/glossary.md` 16줄 / 용어 12개 (CRDT, OR-Map, Dot, Version vector, Tombstone, Anti-entropy, Virtual time, Deterministic simulation, Content-addressing, Canonical JSON, Receipt, Trace, Partition, Heal).

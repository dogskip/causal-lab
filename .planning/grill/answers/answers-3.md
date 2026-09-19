# Grill Round 3 — 2026-09-19

주제: 수렴 단언 방식, 시나리오 생성 전략, Node 전역 제거, 중간 상태 스냅샷, CI 실행 규모, 웹 빌드 배선, 논증 위치

## 확정된 결정

| # | 질문 | 답 |
|---|---|---|
| 1 | 수렴 단언 | **report.states로 독립 재계산** — 키별 값 집합 비교 + 플래그 일치 확인 |
| 2 | 시나리오 생성 | **명령 기반 + 참조 모델** — 마지막 heal 후 기대 상태를 독립 계산해 대조 |
| 3 | Node 전역 제거 | **코어에서 둘 다 제거** — 순수 TS SHA-256 하나 + TextEncoder |
| 4 | 중간 상태 스냅샷 | **뷰어가 Simulation 직접 구동** — 코어·스키마·영수증 해시 변경 0 |
| 5 | CI 실행 규모 | **CI 수백 회 + 심층 별도** — 심층(수천 회, 시드 순회)은 별도 스크립트 |
| 6 | 웹 빌드 | **web/ + 번들러, pnpm build에 포함** — files에는 넣지 않음 |
| 7 | 논증 위치 | **docs/test-contract.md 확장** — 계약과 논증을 한 파일에서 관리 |

## 근거 (조사)

- `SimulationReport`는 `states`(복제본별 canonical state)와 `versions`를 담음(`simulation.ts:24-32`). `converged`는 같은 문자열 비교로 계산(`simulation.ts:148-153`)되므로 플래그만 단언하면 판정 로직이 검증되지 않음.
- `Simulation` 공개 API: `put`, `remove`, `partition`, `healAll`, `advance`, `runUntilIdle`, `report`. 복제본 맵은 비공개이므로 중간 상태는 `report().states`로만 얻을 수 있음.
- 현행 생성기는 `uint8Array.map`으로 설정·스텝을 사상하고 스텝이 `alpha`에서만 쓰며 키가 `k` 고정(`test/property.test.ts:21-58`).
- 수렴 판정과 계산이 같은 모듈에 있고, 마지막 heal은 신뢰성 anti-entropy이므로 수렴은 구성상 보장 → 반증 대상은 네트워크 계층(드롭·중복·보류·재전송 완전성)과 병합 규칙.
- CI 2 OS × 10분 예산, bench는 CI에서 돌지 않음(`.github/workflows/ci.yml:48-52`).
- `package.json` files는 dist/schema/examples만 포함 → 웹 산출물은 배포 패키지에 들어가지 않음.
- `test/contract-coverage.test.ts`가 테스트 코퍼스를 정규식 마커로 검사하므로 테스트 재작성 시 마커 갱신이 필요.

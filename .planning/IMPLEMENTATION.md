---
title: "개발팀용 검증 도구 구현 계획"
authority_level: execution
ssot: true
owner: shared
status: partial
last_updated: 2026-10-14
derived_from: [".planning/PROJECT.md", ".planning/DESIGN.md", "사용자의 SDD/TDD/E2E·재귀·회귀 구현 지시"]
source_of_truth_for: ["구현 작업, 요구별 검사, 완료 증거"]
must_not_be_overridden_by: []
ai_edit_policy: editable-but-must-not-contradict-sources
---

# 검증 도구 구현 계획

**Goal:** 실제 CRDT와 업무 규칙을 검사하고 실패를 파일로 공유·재생하여 자동 검사에 연결한다.
**Architecture:** 기존 core와 v1 계약을 계승하고 순수 verify, 실제 대상 연결, Node 파일/CLI/선택 저장, 사건별 웹 조회로 책임을 구분한다. 같은 결과 검증 코드를 파일·CLI·웹·저장에서 재사용한다.
**Tech Stack:** TypeScript, Node 24, 기존 fast-check/Vitest/Vite/Hono, 고정 Yjs, SQLite, headless Playwright CLI.
**Decisions settled:** PROJECT/DESIGN/REVIEW의 3심 수락과 사용자의 구현 지시로 확정했다. 새 운영 서비스·Automerge·ordered-session은 추가하지 않는다.
**Verification:** 최소 실패 검사 → 최소 구현 → 해당 검사 → 관련 회귀 → 설치·CLI·실패 공유·웹·DB 전체 절차. 최종 lint/typecheck/build/test/test:deep와 두 외부 소비 프로젝트, 10,000 사건·메모리 측정으로 확인한다.

## 순서와 요구 추적

| 단계 | 파일·변경 | 먼저 실패시킬 조건 | 합격 증거 | 상태 |
| --- | --- | --- | --- | --- |
| G0 | src/crdt·simulation·scenario·trace, web/frame·main, schema, app/catalog 검사 | __proto__, 지역 설정, put/remove/heal/시간 상한의 원자성, 전달 직후·최초 명령 이전 화면, Mermaid 수신자, 응답 스키마·UTF-8·실제 500·연결 파일 | 단위·실제 파서·HTTP·headless DOM, 기존 회귀 | 로컬 회귀·화면 확인 |
| G1 | src/core·verify·node 공개 진입점, package exports·선언·고정 의존성 | 설치 후 import, 순수 번들의 Node 의존성, v1 ID/서버/DB | 실제 pack/install·ESM/types·번들 | 구현, 설치 검사 대기 |
| G2 | v2 정의·연결·검사·실행·회복 증거, OR-Map/Yjs | 정상/거절/no-op/잘못된 수락, 순서쌍/전달 누락·무효화, 독립 규칙, 가변 참조·함수 오류·상한 | 실제 대상·같은 시각·반복·예외 검사 | 실제 대상·반례 검사 통과 |
| G3 | 원문 JSON·JCS·묶음·재생·생성/축소·CLI 자식·파일 | 중복 키·유니코드·변조·코드/버전 불일치, 원래/축소 실패, 횟수 미달·정지·강제 종료·파일 충돌 | 표준 벡터·재귀 입력·별도 과정 재생·실제 종료 코드 | 기본 구현·재현 통과, 추가 상한 검증 대기 |
| G4 | 웹 검증 묶음 조회, Node 선택 저장·보관·복원 | 사건/판정 불일치·새 분할·초기 상태, SQL 우회·오염·v1 파일·재열기·복원 | Playwright CLI headless DOM/화면·오류 수집, 실제 SQLite·파일 비교 | 기본 구현·화면·DB 통과, 부정 입력 확대 대기 |
| G5 | 소비 예제·사용 문서·자동 검사·성능 측정 | 두 다른 프로젝트의 설치→검사→실패 공유→재생, 최대 사건·메모리 | 실제 설치한 두 프로젝트·10,000 사건·RSS 기록 | 대기 |

R01/R04/R05/R06은 G2, R02/R07은 G3, R08/R11은 G0/G1, R09/R10은 G4, R12는 전체와 G5에 연결한다. 재귀 검사는 깊은 JSON·순환 참조·응답 반복의 제한과 안전한 중단을 포함한다. 회귀는 정상 입력·v1 ID·장애·실패 재생을 함께 반복한다.

## 실행 원칙

TDD 스킬의 RED→GREEN→정비 순서를 따른다. 기존 검사가 결함을 성공으로 기대하는 경우에는 요구와 반례로 기대값을 수정하고 그 변경을 증거에 기록한다. 구현은 executing-plans 절차를 사용하며 이 작업에서는 직접 수행한다.

현재 승인된 문서와 작업 파일을 같은 작업 경로에서 유지한다. 기존 미저장 변경을 제거하거나 별도 경로로 분산하지 않는다. 제품·실제 DB·외부 서비스의 배포나 공개는 이번 구현에 포함하지 않는다.

설계 시점의 evidence/2026-10-14는 과거 증거다. 새 검사의 실패·통과·명령·버전·해시는 evidence/implementation-2026-10-14에 기록한다. 과거의 productAcceptance:false를 구현 성공으로 다시 해석하지 않는다.

## 2026-10-14 부분 마감

사용자의 빠른 부분 마감·문서 최신화·커밋·푸시 요청으로 기본 구현을 마감한다. G0–G4의 기능과 로컬 검증을 보관하되 모든 합격 조건의 종료로 표시하지 않는다. G1 설치 검사, 생성 출력·사용자 상한·SQL 입력 확대, G5 외부 소비 두 곳과 10,000건·RSS 검사는 후속 범위다. 사용과 제한은 docs/verification.md, 이번 실행 증거는 evidence/implementation-2026-10-14에 있다.

이번 변경은 feature/verification-tool-v2에서 작업하며 기존 변경을 유지했다. 설계 3심은 설계에 대한 증거이며 구현의 독립 3심을 대신하지 않는다.

최종 로컬 확인은 lint/typecheck/build, 전체 301개 검사, 깊은 속성 검사 10개, headless E2E 16회다. 운영 의존성 점검은 알려진 취약점 0건이다. 증거와 미완료 항목은 evidence/implementation-2026-10-14/summary.md에 기록했다.

# Causal Lab — Test Strategy Enhancement

## Goal
기존 테스트 스위트(12개 파일, ~95% 커버리지)의 간극을 메우고, Playwright E2E 테스트를 포함한 완전한 검증 전략을 수립한다.

## Scope
- CRDT 단위 테스트 확장 (VersionVector, operationId, ContractError)
- Simulation 경계값/오버플로우 테스트
- Canonical JSON 엣지 케이스
- Catalog 오류 경로 및 corruption 테스트
- REPL 전체 명령어 커버리지
- E2E: 서버 생명주기 + Playwright API 테스트

## Architecture Decision
- 기존 `test/` 디렉토리 내 파일 네이밍 규칙 (`*.test.ts`) 유지
- 각 파일 500줄 이하 유지
- 중복 fixture는 `test/fixtures.ts`로 통합
- Playwright E2E는 `@playwright/test` request fixture 사용

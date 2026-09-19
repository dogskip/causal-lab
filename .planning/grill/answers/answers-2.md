# Grill Round 2 — 2026-09-19

주제: 브라우저 이식, 영수증 ID, 렌더 보안 정책, 입력 경로, 작성 UI, 타임라인, 웹 테스트, 계약 지위

## 확정된 결정

| # | 질문 | 답 |
|---|---|---|
| 1 | Node 전역에 기대는 검증 경로 이식 | **검증은 코어, 플랫폼 의존만 분리** — 바이트 길이는 코어 한 곳, 해시는 분리 |
| 2 | 브라우저에서 영수증 ID 표시 | **순수 TS SHA-256 + 동등성 테스트** — 서버·CLI와 같은 콘텐츠 주소 표시 |
| 3 | 사용자 문자열 렌더 정책 | **텍스트 전용 + 자기완결 번들** — 내부 HTML 주입 API 금지, 외부 스크립트·CDN 0건, CSP 고정 |
| 4 | 시나리오 입력 경로 | **로컬 입력만** — 붙여넣기·파일 선택·예제 로드, URL·localStorage 없음 |
| 5 | 작성 UI | **스텝 목록 편집** — REPL 동작과 1:1 |
| 6 | 타임라인 | **Canvas + 재생/스크럽/이벤트 클릭** |
| 7 | 웹 테스트 | **순수 함수 + 번들 동등성 테스트** — 브라우저 인프라 없음 |
| 8 | 계약 지위 | **코어 계약 밖** — threat-model.md에 브라우저 표면 추가 |

## 근거 (조사)

- `src/crdt.ts:85,203,222` Buffer.byteLength, `src/scenario.ts:1,140`·`src/catalog.ts:1,86,117` node:crypto.
- `src/index.ts` 배럴이 여섯 모듈을 모두 재수출하므로 배럴을 그대로 브라우저에 쓰면 Node 모듈이 딸려옵니다.
- 값은 상한(4 KiB)만 검사되고 임의 문자 허용, trace에는 값이 실리지 않음(`simulation.ts:15-22`).
- 저장소에 HTML·SVG·CSP·프레임워크·번들러 설정 0건. vite 8.1.5·esbuild 0.28.1은 vitest 전이 의존(`pnpm-lock.yaml:552,926`).
- CI: ubuntu+macos 매트릭스, 10분 타임아웃, lint/typecheck/test/build. Playwright 미설치(`.planning/PROJECT.md:12`에 계획만).
- `docs/test-contract.md` 11개 항목을 `test/contract-coverage.test.ts`가 강제, `src/trace.ts`의 `traceToMermaid`는 "not part of the simulation contract" 선례.

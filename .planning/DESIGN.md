# Causal Lab — playground와 수렴 반증 강화 설계

결정 기록: `.planning/grill/answers/answers-1.md` ~ `answers-4.md`
상태: 사용자 확정 대기

## 0. 범위

요청 3건을 2개 작업으로 수렴한다.

| 요청 | 처리 |
|---|---|
| 인터랙티브 웹 시각화 | playground의 타임라인 재생으로 흡수 |
| WASM/브라우저 독립 실행 | WASM 없이 기존 TS 코어를 브라우저 번들로 재사용 (결정 1) |
| 속성 기반 테스트 | 1단계로 먼저 진행, "증명"은 반증 시도 + 논증으로 실현 (결정 3·6) |

경계: playground는 시뮬레이션 계약 밖이다(`src/trace.ts`의 `traceToMermaid`가 만든 선례). 용어 SSOT는 `docs/glossary.md`이며 루트 `CONTEXT.md`는 만들지 않는다. 보안은 별도 단계가 아니라 각 단계의 완료 조건이다.

## 1. 설계 근거 (조사·실측)

- 코어 순수성: `src/simulation.ts`, `src/crdt.ts`, `src/trace.ts`는 `node:` import 0건. Node 잔여는 `crdt.ts:85,203,222`(`Buffer.byteLength`), `scenario.ts:1,140`과 `catalog.ts:1,86,117`(`node:crypto` `createHash`).
- `SimulationReport = {seed, virtualTime, processedEvents, converged, states, versions, trace}` (`simulation.ts:24-32`). `converged`는 `states`를 만든 뒤 같은 문자열 비교로 계산한다(`simulation.ts:148-153`).
- `Simulation` 공개 API는 `put/remove/partition/healAll/advance/runUntilIdle/report` 7개이고 복제본 맵은 비공개다 → 중간 상태는 `report().states`로만 얻는다.
- trace 항목은 `{sequence, time, kind, from?, to?, operation?}`이고 값은 담기지 않는다(`simulation.ts:15-22`). 예약 이벤트 예산은 10,000(`simulation.ts:4`), trace 줄 수는 그보다 많다.
- `docs/test-contract.md` 11개 항목을 `test/contract-coverage.test.ts`가 정규식 마커로 강제한다.
- CI: ubuntu+macos 매트릭스, 10분 타임아웃, `lint → typecheck → test → build`, `pnpm audit --prod`만 수행(`.github/workflows/ci.yml`).
- 실측(Node v24.18.1): 13개 파일 197개 테스트 5.92초. 그중 `test/property.test.ts` 8개 속성 × 100회가 281ms.
- `vite@8.1.5`, `esbuild@0.28.1`은 vitest 전이 의존으로 이미 lockfile에 있다(`pnpm-lock.yaml:552,926`). Playwright·jsdom은 미설치.
- 로컬 기본 Node는 v22.23.2이고 이 패키지는 `>=24`를 요구한다 → 검증은 nvm의 v24.18.1 또는 CI에서 수행한다.

## 2. 1단계 — 수렴 반증 강화

### 2.1 코어에서 Node 전역 제거 (결정 3)

- 새 파일 `src/sha256.ts`: 순수 TS SHA-256(동기, hex, 스트리밍). 비밀이 없는 콘텐츠 주소 전용이므로 부채널은 위협이 아니고, 감사된 구현이 아니라는 사실은 위협 모델에 적는다.
- `src/scenario.ts`: `node:crypto` 제거, `scenarioIdentity`가 `sha256.ts`를 사용. 기존 영수증과 바이트가 같아야 하므로 표준 벡터 + `node:crypto` 대조 테스트로 고정한다.
- `src/catalog.ts`: `createHash` 두 곳(`:86`, `:117` 검증 경로)을 같은 구현으로, `Buffer.byteLength`를 새 헬퍼로 교체.
- `src/crdt.ts`: 세 검증 지점(`:85`, `:203`, `:222`)을 한 헬퍼(`utf8Length`)로 모은다. 상한 의미(UTF-8 바이트 길이)는 불변이고 `test/boundary.test.ts`가 지킨다.
- 완료 조건: 기존 `test/scenario.test.ts`, `test/catalog.test.ts`를 한 줄도 고치지 않고 통과(= 영수증 바이트 불변).

### 2.2 속성 테스트 재작성 (결정 1·2·5)

생성기를 명령 기반으로 바꾸고 오라클을 코어 밖에 둔다. 새 파일 `test/oracle.ts`가 기대 상태를 독립 계산한다.

- **A. 무손실 계열** — put만 생성하고 파티션·지연·손실·중복을 무작위화. 오라클: 마지막 heal·drain 후 각 복제본 상태가 시나리오의 put 값 집합(키별)과 정확히 일치. 드롭·중복·보류·anti-entropy 재전송을 통째로 반증 대상으로 만든다.
- **B. observed-remove 계열** — 파티션 스코프 명령으로 구성한다: `partition A B` → `A put k v1`, `B put k v2` → `A remove k` → `heal`. 오라클: `v1`은 최종 상태에 없고 `v2`는 남는다(add-wins). 시나리오 자체가 기대값을 결정하므로 네트워크 구현과 독립이다.
- **C. 병합 규칙 대조** — `Replica.operations()`가 내놓는 연산 스트림을 소형 참조 모델(값 맵 + tombstone 집합, 약 30줄)에 모두 적용한 결과와 `Replica.apply` 결과를 비교한다. 사양 해석을 공유하는 사각은 남지만 병합 구현 버그를 잡는다.
- **수렴 단언의 독립성**(결정 1) — `report.states`에서 키별 값 집합이 모든 복제본에서 같은지 직접 계산하고, `report.converged`와 일치하는지도 확인한다. 판정 로직도 검증 대상이 된다.
- **경계 반증** — 13 복제본, 1001 스텝, 4 KiB+1 값, 129바이트 키, `dropRate > 1`을 생성해 `parseScenario`가 상태 변경 전에 `ContractError`로 거부하는지 확인한다(계약 7번).
- **보존** — 결정론(byte-identical report), 키 순서 무관 ID, 중복·재정렬 멱등, 버전 벡터 단조, 식별자 계약.
- **규모**(결정 5) — CI는 고정 시드 + `numRuns 300`(실측 281ms/100회 → 약 0.9초). 심층은 `pnpm test:deep`: `numRuns 5,000`과 시드 순회로 분리한다.
- **실패 재현** — fast-check 축소 시퀀스를 그대로 남기고 고정 시드로 재현한다.
- **가드 갱신** — 테스트 이름이 바뀌면 `test/contract-coverage.test.ts`의 마커가 깨진다(의도된 강제). 마커를 함께 갱신한다.

### 2.3 논증 (결정 7)

`docs/test-contract.md`에 절을 추가한다.

1. 수렴이 구성상 보장되는 이유: `healAll`이 분할을 지우고 보류 이벤트를 재투입한 뒤 모든 연산을 신뢰성 있게 재전송한다(`simulation.ts:91-102`).
2. 그래서 반증 대상은 네트워크 계층(드롭·중복·보류·전송 완전성)과 병합 규칙이다.
3. 반증되지 않은 범위: 12 복제본·10,000 예약 이벤트·1,000 스텝 한도 안에서만, 명시된 가정(메시지 손실·중복·재정렬, 비잔틴 없음) 안에서만.
4. 속성 테스트는 증명이 아니라 반증이며, 통과는 반증 실패의 누적일 뿐이다.

`docs/glossary.md` 추가 용어: **Playground**, **Frame**, **Snapshot**, **Oracle**, **Counterexample**.

## 3. 2단계 — playground

### 3.1 파일 (4개)

| 파일 | 역할 |
|---|---|
| `web/index.html` | meta CSP, 캔버스, 스텝 편집 폼, 상태 패널 |
| `web/frame.ts` | 순수 함수: trace·스냅샷 → 레인·화살표·분할 구간·상태 차이 |
| `web/main.ts` | 조립: 입력 → `parseScenario` → 실행 → 프레임 → 캔버스/패널, 재생 루프, 히트테스트 |
| `web/core.ts` | 브라우저용 코어 재수출(`app`·`catalog` 제외). 번들 산출물을 Node에서 검사하는 진입점 |

배럴 `src/index.ts`는 쓰지 않는다 — `catalog`까지 끌고 오기 때문이다.

### 3.2 데이터 흐름

- 입력(결정 4): 텍스트 붙여넣기, 파일 선택(`file.text()`), `examples/*.json` 로드. 셋 모두 `parseScenario`(`scenario.ts:19`) 한 경계를 통과한다. 사람이 쓴 텍스트 크기는 HTTP 본문 상한과 같은 값으로 먼저 거부한다.
- 실행(결정 4): 영수증 경로는 `executeScenario`, 중간 상태는 `Simulation`을 직접 구동해 각 스텝 직후와 종료 시점에 `report().states`를 스냅샷한다(≤1,000개, 복제본 맵이 비공개이므로 유일한 공식 경로). 코어·스키마·영수증 해시는 변하지 않는다.
- 작성 UI(결정 5): `{at, action, ...}` 스텝 목록을 편집한다. REPL의 `advance`는 스텝의 `at`이 그 역할을 하므로 별도 동작이 필요 없다.
- 타임라인(결정 6): 레인 = 복제본, 화살표 = `scheduled`/`delivered`/`dropped`/`held`, 음영 = `partition`~`heal` 구간, 시간축 = 가상 시간. 재생/정지/스크럽/이벤트 클릭(상세: kind·time·from·to·operation). 프레임은 보이는 구간만 그린다.
- 상태 패널: 복제본별 키 값 비교, 불일치 강조. 마지막 프레임에서 수렴이 눈에 보이는 장면을 만든다.

### 3.3 보안 (사용자 지시)

- 렌더는 `fillText`/`textContent`만. 내부 HTML 주입 API·`eval`·`new Function`·`document.write` 금지.
- 네트워크 요청 0건. 외부 스크립트·스타일·폰트 0건, 자기완결 번들.
- CSP는 meta로 `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'`. meta로는 `frame-ancestors`·`sandbox`를 지정할 수 없다는 한계를 문서화한다.
- 강제 수단(결정 1): `test/web-security.test.ts`가 `web/` 소스와 `dist/web` 산출물을 읽어 금지 패턴 부재, meta CSP 존재, 외부 URL 부재, `fetch`/`WebSocket` 부재, `node:`·`Buffer` 문자열 부재를 검사한다. `test/contract-coverage.test.ts`가 텍스트를 검사하는 방식과 같은 결이다.
- `docs/threat-model.md` 확장: 자산(붙여넣은 시나리오 텍스트, 화면에 그리는 값), 방어(위 정책 전부), 비목표(인증 없음, 다중 사용자 아님, 호스팅 무결성은 사업자 의존, 브라우저 확장·로컬 침해는 범위 밖)를 적는다.
- 상한 상수 SSOT: `app.ts:7`의 `MAX_HTTP_BODY_BYTES`를 코어로 옮겨 웹이 재사용한다. `app.ts`를 직접 import하면 번들에 hono가 들어온다.

### 3.4 빌드·배포 (결정 6)

- `vite@8.1.5`를 devDependency로 명시(전이 의존 → 직접 선언, 정확 버전 고정). `vite.config.ts` 하나에 입력 2개(app: `web/index.html`, core: `web/core.ts`), 출력 `dist/web`.
- `"build": "tsc -p tsconfig.build.json && vite build"`, `"dev:web": "vite"`. `tsconfig.json` include에 `web` 추가.
- `package.json` `files`는 그대로 둔다(웹 산출물은 배포 패키지에 넣지 않는다).
- CI 순서를 `build → test`로 바꾼다. 번들 동등성 테스트가 `dist/web/core.js`를 읽기 때문이다.
- `pnpm audit --prod`는 dev 의존을 감사하지 않는다 → 새 devDependency는 감사 범위 밖임을 문서화한다.
- 배포: `.github/workflows/pages.yml` 신설, 트리거는 `workflow_dispatch`만, 권한 `pages:write`·`id-token:write`, 산출물 `dist/web`. 저장소 설정(Pages 소스 = GitHub Actions)은 사용자가 1회 켠다.

### 3.5 웹 테스트 (결정 7)

- `test/frame.test.ts`: 프레임 계산 순수 함수. 경계는 0 이벤트, 12 레인, 10,000 이벤트, 겹친 분할 구간.
- `test/web-bundle.test.ts`: `dist/web/core.js`를 import해 같은 시나리오의 report가 `src` 코어와 같음을 확인한다. 브라우저 산출물에 Node 의존이 없다는 런타임 증거다.
- 브라우저 인프라(Playwright·jsdom)는 쓰지 않는다. 실제 렌더 회귀는 정적 검사와 순수 함수 테스트 범위 밖이며 의도적으로 수용한다.

## 4. 커밋 순서 (각 단계에서 CI 그린)

1. `docs/glossary.md` 용어 추가 + 이 설계 문서
2. 순수 TS SHA-256 도입과 `crdt`·`scenario`·`catalog`의 Node 전역 제거 + `test/sha256.test.ts`
3. 속성 테스트 재작성(`test/oracle.ts`, 생성기 2계열, 독립 수렴 단언, `pnpm test:deep`) + 계약 마커 갱신
4. `docs/test-contract.md` 논증 절
5. `web/frame.ts` + `test/frame.test.ts` (DOM 없음)
6. `web/index.html`·`main.ts`·`core.ts` + vite 설정 + 빌드·typecheck 배선
7. `test/web-security.test.ts`, `test/web-bundle.test.ts`, CI 순서 변경
8. `docs/threat-model.md` 확장, README·tutorial 갱신, `pages.yml`

## 5. 완료 판정

- 1단계: 기존 197개 테스트가 무수정 통과하고, 새 속성이 `numRuns 300`에서 통과하며, 실패 시 축소 시퀀스가 남는다.
- 2단계: `dist/web/core.js`가 Node에서 `src` 코어와 같은 report를 낸다. 정적 검사가 통과한다. 배포 워크플로가 `workflow_dispatch`로만 돈다.
- 검증 명령: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (Node v24.18.1).

## 6. 남은 위험

- 손으로 쓴 SHA-256은 감사된 구현이 아니다 — 표준 벡터와 `node:crypto` 대조로 고정하되, 비밀을 다루지 않는다는 전제에 의존한다.
- meta CSP는 `frame-ancestors`·`sandbox`를 지정할 수 없다 → 프레임 삽입 보호는 호스팅 수준 과제로 남는다.
- 웹 UI의 실제 브라우저 동작은 미검증이다(의도적 수용).
- 12 복제본 × 1,000 스냅샷의 메모리 사용은 값 크기(≤4 KiB)에 좌우된다 → 필요하면 스냅샷 간격을 조정한다.

## 7. 구현 중 확정된 세부 (설계 대비 변경)

- **스냅샷 경로**: `Simulation`을 직접 구동하는 대신 `executeScenario(scenario, observe?)`에 선택적 관찰자를 추가하고 `Simulation.states()`를 공개했다. 스텝 디스패치 루프가 한 곳에 남고, 보고서·영수증·스키마는 그대로다.
- **빌드**: `minify: false`(배포 번들을 읽을 수 있게 두고 export 이름을 보존), `modulePreload: false`(폴리필의 `fetch()`를 CSP가 막는다), `minifyInternalExports: false`(`core.js`가 앱의 의존 청크라서 이름 유지), `base: "./"`(하위 경로 배포).
- **상수 SSOT**: `MAX_SCENARIO_BYTES`를 `scenario.ts`로 옮기고 `MAX_HTTP_BODY_BYTES`는 별칭으로 남겼다(공개 API 유지).
- **링크 키**: `linkKey`를 코어에서 내보내 타임라인 밴드와 엔진이 같은 규칙을 쓴다.
- **CI**: 번들 동등성 테스트가 `dist/web/core.js`를 읽으므로 단계 순서를 `build → test`로 바꿨다.
- **브라우저 확인(CI 밖, 수동)**: 헤드리스 Chromium으로 로드·재생·스텝 편집을 확인했다. 요청은 같은 출처 4건뿐이고 콘솔 오류는 없었다.

## 8. playground 재작성 (v2)

첫 버전은 빈 폼과 얇은 레인만 보여줘 무엇을 하는 프로젝트인지 전달하지 못했다. 구조를 이야기 중심으로 바꿨다.

- `web/stories.ts`: 예제 4종을 이름·약속 문장과 함께 카드로 정의하고, `test/stories.test.ts`가 카드가 약속한 결과(수렴, add-wins로 두 값 보존, 제거 후 최신 값 생존)를 실제 실행으로 검증한다.
- `web/narrative.ts`: 재생 시점의 사건 수·분할 여부·불일치에서 평문 해설(beat)을 계산한다. 판정과 문장이 순수 함수라 `test/narrative.test.ts`로 고정한다.
- 화면: 히어로(무엇을 보는지), 스토리 카드(클릭 즉시 실행·자동 재생), 해설 줄, 카운터, 캔버스 타임라인(레인·분할 띠·전달 호·손실/보류 표식·분할/복구 표식·재생 헤드), 복제본 카드(값 칩과 불일치 강조), 영수증 판정 줄, 접힌 고급 편집기.
- 조작: 재생/정지, 처음, 다음 사건, 속도, 스크럽, Space·←→·Home/End 단축키, 스텝 클릭 설명, 스텝 자동 시간 정렬, 시나리오 내려받기, 영수증 id 복사.
- 검증: Playwright CLI headless 스크린샷과 헤드리스 상호작용 확인(스토리 전환·재생·스텝 추가), 같은 출처 요청만 발생, 콘솔 오류 0건.

## 9. 화면 문법 확정 (v3)

카드 그리드·강조색 문장·알약 배지는 여전히 랜딩 페이지 문법이라 "AI가 만든 티"가 났다. 실험 노트 문법으로 바꾼다.

- 레이아웃: 라벨이 왼쪽 여백에 서고 내용이 본문 열에 오는 2단 스펙 시트. 섹션은 헤어라인으로만 나눈다. 카드·그림자·라운드(2px 초과)·표면 채움 없음.
- 목록과 표: 실험 선택은 문서 행 목록(이름·설명·파일 경로), 복제본 상태는 키×복제본 표, 영수증은 정의 목록. 불일치는 행에 `≠`, 빈 값은 `—`.
- 색: 색은 데이터에만 쓴다 — delivered 한 가지(무채도 청회색), dropped·held 두 가지(무채도 적·황토), 나머지는 먹색과 종이색. 문장은 색으로 강조하지 않는다.
- 서체: mono는 기계 데이터(값·영수증 id·파일 경로·수치)에만, 라벨과 문장은 본문 서체.
- 검증: 스캐너 0건(의도 유지 항목은 deslop-ignore로 근거 고정), 241 테스트, 헤드리스 확인(콘솔 오류 0, 외부 요청 0).

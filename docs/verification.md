---
title: "실제 대상 검증 도구 사용과 구현 범위"
authority_level: implementation
ssot: true
owner: shared
status: partial
last_updated: 2026-10-14
derived_from: [".planning/DESIGN.md", "src/verify/types.ts", "src/verify/runtime.ts", "src/node/catalog.ts"]
source_of_truth_for: ["v2 도구 사용, 현재 구현 범위, 미완료 검증"]
must_not_be_overridden_by: []
ai_edit_policy: editable-but-must-not-contradict-sources
---

# 실제 대상 검증

실제 OR-Map 또는 Yjs 13.6.27을 실행하고, 수렴과 독립 기대값을 검사한다. 정의와 실행 기록을 포함한 단일 파일을 동료에게 전달할 수 있다. 기존 v1 실험·서버·DB는 유지한다. 이번 변경은 0.2.0 개발 버전이며 배포나 공개 출시를 의미하지 않는다.

## 실행과 재현

Node 24 이상을 사용한다. 개발 경로에서는 `pnpm verify`, 설치된 배포 파일에서는 `causal-lab-verify`를 사용한다.

```sh
pnpm build
pnpm verify verify examples/verification/yjs.json --out ./verification-results
pnpm verify verify examples/verification/failure.json --out ./verification-results
```

`--out`에 생성한 `.bundle.json` 파일을 `replay`의 입력으로 지정한다. 같은 배포 버전·실행 코드·의존성·대상 초기화와 검사 정의가 필요하다. 소스 실행과 설치된 배포 파일의 코드 해시는 다르므로 서로의 기록을 동일 실행으로 간주하지 않는다.

```sh
causal-lab-verify replay ./verification-results/result-RUN_ID.bundle.json
causal-lab-verify verify ./case.json --runs 100 --seed 19 --out ./verification-results
```

생성 검사는 `fast-check` 3.23.2를 사용한다. 실패 시 최초 실패와 같은 실패 규칙의 축소 파일을 보관하고, 요청·실제 검사 횟수, 난수 초기값, 재현 경로와 축소 횟수를 반환한다. 전체 가능한 입력의 최소 실패라는 보장은 없다. 현재 기본 생성기는 put/remove와 최종 heal을 생성하며 분할 생성 확대는 후속 항목이다.

| 판정 | 종료 코드 | 의미 |
| --- | --- | --- |
| passed | 0 | 필수 회복과 요청한 규칙 검사가 완료되고 모두 통과 |
| failed | 1 | 회복 후 독립 규칙 위반 확인 |
| error | 2 | 입력·계약·대상 함수 오류 또는 재현 불일치 |
| inconclusive | 3 | 회복 미완료, 제한 초과, 검사 횟수 미달 또는 기한 종료 |

명령행 도구는 자식 과정 하나에 기본 30초, 최대 300초를 적용한다. `--timeout`은 밀리초다. 완전한 기록을 수신하기 전에 종료되면 결과 상태나 실행 ID를 추정하지 않는다. 이미 수신하여 검증한 기록은 유지한다. 별도 과정은 보안 격리가 아니며, `--module`은 신뢰하는 로컬 코드만 명시적으로 지정한다.

## SDK와 사용자 대상

`causal-lab/core`는 기존 순수 실행 코드, `causal-lab/verify`는 v2 정의·실행·기록 검증·생성, `causal-lab/node`는 실제 대상 선택·파일·선택 DB를 제공한다. 기존 최상위 export와 `causal-lab` 서버 명령도 유지한다.

```ts
import { executeVerification, replayVerification } from 'causal-lab/verify';
import { createBuiltinContext, readJsonFile, writeBundle } from 'causal-lab/node';
const definition = readJsonFile('./case.json', 2 * 1024 * 1024);
const context = createBuiltinContext(definition);
const bundle = executeVerification(definition, context);
writeBundle('./result.bundle.json', bundle);
const reproduced = replayVerification(bundle, createBuiltinContext(definition));
```

연결 계약은 create/command/receive/reconcile/observe/close의 동기식 함수 6개다. `reconcile(state, peer, sessionId, context)`는 실제 대상의 상태 교환 API를 사용한다. accepted와 rejected를 명시하고, 관찰값과 결과는 JSON이어야 한다. 실행기는 복사한 관찰값과 메시지를 보관한다. 함수나 검사 단계 정의를 실행 도중 교체해도 실행 시작 시 고정한 정의를 사용한다.

사용자 모듈은 `createContext(definition, engine)`을 내보내고 `VerifierOptions`를 반환한다. 명령행 도구는 모듈 본문의 SHA-256을 연결 코드 식별자로 기록하며 대상 의존성의 정확한 버전·내용 식별자는 작성자가 명세에 제공해야 한다. 기본 대상은 실제 설치된 Yjs 및 관련 의존성의 내용을 확인한다. 임의 모듈의 모든 간접 의존성을 자동 탐색하지 않는다.

SDK에서 낮춘 자원 상한을 사용한 기록은 재현 시 같은 `limits`를 전달해야 한다. 현재 명령행 도구는 고정 기본 상한을 사용한다. 실행 명세에 사용자 상한을 포함하는 개선과 전체 생성 검사 출력의 추가 자원 검증은 후속 항목이다.

## 기록·화면·DB

v2 정의와 기록에는 RFC 8785 정규 JSON과 서로 다른 해시 구분자를 사용한다. 원문 중복 키·잘못된 Unicode·순환 참조·과도한 중첩은 거부한다. 메시지는 원본 바이트의 SHA-256과 base64를 함께 보관한다. `readBundle`은 식별자, 메시지, 사건 순서, 상태 누적, 횟수, 검사 단계, 회복 순서쌍과 전달 증거를 공통 검증한다. 해시는 내용의 일관성 검사이며 작성자의 신원을 인증하지 않는다.

브라우저의 `verification.html`에서 파일을 열어 실제 초기 상태와 사건별 상태를 조회한다. 동일 시각도 사건 번호로 구분한다. 외부 대상 코드를 실행하거나 파일을 전송하지 않는다. 화면 조회와 실제 대상 코드의 재현 검사는 별개다.

선택 저장은 `VerificationCatalog`를 사용한다. v1 DB와 별도 파일을 지정한다. 기존 파일은 읽기 전용으로 소유·버전·구조·무결성과 기록을 확인한 뒤 사용한다. 기존 ID는 전체 바이트 비교 후 반환한다. SQL의 REPLACE/IGNORE/UPDATE/DELETE 우회는 거부한다. `backup()`과 `restoreVerificationCatalog()`는 SQLite의 일관된 보관 기능을 사용한다. 동작 중인 본 파일만 복사하지 않는다.

| 표 | 주요 열 | 계약 |
| --- | --- | --- |
| verification_schema_migrations | version, owner | 검증 전용 소유, 현재 구조 버전 1 |
| verification_cases | case_id, format_version, canonical_json, definition_bytes | 자료 버전 2, 정의 2 MiB 이하, 실제 UTF-8 크기 |
| verification_runs | run_id, case_id, format_version, model_id, status, receipt_json, receipt_bytes | 정의 외래키, 명세·판정 일치, 기록 32 MiB 이하 |

구조와 변경 거부 규칙은 `schema/sqlite/002_verification.sql`에 있다. 앱의 정규 JSON·해시·기록 검증은 SQL 제약과 함께 적용한다. SQL만으로 실제 대상 실행의 진위를 증명하지 않는다.

## 이번 마감 범위

실제 대상 실행·독립 검사·파일 재현·별도 과정 명령행·생성/축소·사건 조회·선택 DB의 기본 구현을 마감한다. 기존 결함과 회귀, 실제 대상, 원문 JSON, 파일 모순, 강제 종료, 실제 SQLite, headless 브라우저 검사를 수행한다. 새 증거는 `.planning/evidence/implementation-2026-10-14`에 보관한다.

G1의 설치 배포 파일 검증, G3/G4의 추가 상한·전체 생성 출력·SQL 부정 입력 확대, G5의 외부 소비 프로젝트 두 곳과 정확히 10,000건 성능·RSS 검증은 남아 있다. 독립 3심은 이전 설계의 검토 결과이며 이번 구현 전체에 대한 독립 재심을 완료했다는 뜻이 아니다. 전체 제품 합격이나 결함 부재를 선언하지 않는다.

최종 로컬 검사: lint/typecheck/build 성공, 301개 검사와 headless E2E 16회 통과, 운영 의존성의 알려진 취약점 0건. 세부 증거는 `.planning/evidence/implementation-2026-10-14/summary.md`에 있다. 원격 자동 검사와 실제 운영 검증은 별도다.

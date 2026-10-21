---
title: "구조 개선 설계: 하나의 표면, 증명 가능한 실패"
authority_level: proposal
ssot: false
owner: architecture
status: draft
last_updated: 2026-10-21
derived_from:
  - ".planning/MARKET.md"
  - ".planning/GROWTH.md"
  - ".planning/PROJECT.md, .planning/DESIGN.md, .planning/IMPLEMENTATION.md"
  - "src/, test/, web/, package.json, 2026-10-21 조회"
source_of_truth_for: []
must_not_be_overridden_by: [".planning/PROJECT.md", ".planning/DESIGN.md"]
ai_edit_policy: editable-but-must-not-contradict-sources
scope: "제품 표면·공개 경계·생성기·검사·기록 형식의 구조 개선안. 구현 완료나 제품 합격의 증거가 아니다."
---

# 구조 개선 설계: 하나의 표면, 증명 가능한 실패

## 0. 설계 목표

1. **표면을 하나로 줄인다.** 지금은 모의 실험기(v1), 검증기(v2), 한국어 학습 화면, 검증 파일 조회 화면이 따로 있다. 새 사용자는 무엇을 먼저 봐야 하는지 알 수 없다.
2. **주장을 코드로 증명한다.** "수렴했지만 틀린 결과를 찾는다"는 첫 문장을, 분할·동시 쓰기·손실을 실제로 만들고 위반을 판정하는 코드로 뒷받침한다.
3. **실패를 파일로 만든다.** 판정은 화면이 아니라 기록 묶음에 남는다. 동료가 같은 명령으로 같은 결과를 재생할 수 있어야 한다.
4. **기존 자산을 다시 만들지 않는다.** 가상 시간, 고정 난수, 사건 전체 순서, 정규 JSON, 해시, 영수증은 이미 충분히 강하다. 새로 만드는 것은 공개 경계와 생성기와 검사다.
5. **더하지 말고 줄인다.** 새 프레임워크, 새 저장소, 새 서비스, 새 언어 실행기를 추가하지 않는다. 첫 출시는 Yjs와 자체 OR-Map만 지원한다.

## 1. 현재 구조와 문제

| 영역 | 현재 파일 | 역할 | 문제 |
| --- | --- | --- | --- |
| v1 모의 실험기 | `src/simulation.ts`, `src/scenario.ts`, `src/app.ts`, `src/server.ts`, `src/catalog.ts` | HTTP `/v1/run`, 시나리오, SQLite | 첫 화면에서 제품의 중심처럼 보인다 |
| v2 검증 | `src/verify/*`, `src/verify-cli.ts`, `src/node/*` | 실제 대상 실행, 기록, 재생 | 공개 이름이 `verify` 하나뿐이고, 연결 규약이 문서화되지 않았다 |
| 연결기 | `src/adapters/or-map.ts`, `src/adapters/yjs.ts` | 실제 대상 | 대상이 둘뿐이고, 공개 연결기 규약이 없다 |
| 생성기 | `src/verify/generate.ts` | 속성 기반 입력 생성 | put/remove와 마지막 heal만 만든다. 분할·동시 쓰기가 없다 |
| 검사 | `src/verify/checks.ts` | 수렴, 기대 상태 | "수렴했지만 틀림"을 자동으로 찾는 규칙이 없다 |
| 화면 | `web/index.html`(한국어), `web/verification.html` | 학습·조회 | 영어 기본이 아니고, 배포되지 않았다 |
| 꾸러미 | `package.json` | 4개 공개 경계, 2개 명령 | npm에 없고, 저장소·홈페이지 항목이 없다 |
| 검사 실행 | `vitest` | 301개 | 새 복제에서 `pnpm build` 없이는 웹 검사가 실패한다 |

가장 큰 문제는 기능 부족이 아니라 **서로 다른 세 제품이 한 저장소에 있는 것처럼 보이는 것**이다. 첫 화면에서 v1 서버, v2 검증기, 학습 화면을 모두 설명하면 독자는 아무것도 시작하지 못한다.

## 2. 목표 구조

```text
src/
  engine/            기존 실행기 (이동만, 의미 변경 없음)
    index.ts         기존 core.ts를 대체하는 묶음 내보내기
    scheduler.ts
    random.ts
    sha256.ts
    simulation.ts
    crdt.ts          OR-Map 기준 구현
    trace.ts
  sdk/               새 공개 경계
    index.ts         공개 경계 `.`
    types.ts         Adapter, Effect, Invariant
    define.ts        defineAdapter
    invariants.ts    invariant.convergence() 등
  runtime/
    index.ts
    execute.ts       기존 verify/runtime.ts
    registry.ts      기존 node/registry.ts
    catalog.ts       기존 node/catalog.ts (v2 카탈로그)
    files.ts         기존 node/files.ts
    worker.ts        기존 node/worker.ts
    bundle.ts        기록 묶음 v3 (v2 읽기 유지)
    json.ts
    packet.ts
    manifest.ts
  generate/
    schedule.ts      분할·동시 쓰기 일정 생성
    shrink.ts        실패를 유지하는 축소
  checks/
    index.ts
    convergence.ts
    lost-write.ts
    idempotence.ts
    schema.ts
  adapters/
    or-map.ts        기준 예제
    yjs.ts           첫 실제 대상
    loro.ts          2차 (승인 후)
    automerge.ts     2차 (승인 후)
  cli/
    main.ts          parseArgs 기반 진입점
    init.ts
    run.ts
    replay.ts
    open.ts
  legacy/
    index.ts         v1 내보내기 (공개 경계 아님)
    server.ts        v1 HTTP (보존)
    app.ts           v1 HTTP 처리 (보존)
    scenario.ts      v1 시나리오 (보존)
    catalog.ts       v1 SQLite (보존)
    repl.ts
web/
  index.html         영어 첫 화면
  ko/index.html      한국어 보조 화면
  viewer.html        기록 묶음 조회 (기존 verification.html)
  gallery.html       정확성 보고서 사례
  core.ts            시연 공유 묶음 (기존 유지)
```

공개 경계는 세 개로 줄인다.

| 경계 | 내용 | 대상 |
| --- | --- | --- |
| `crdt-fuzz` | 연결기 정의, 검사 정의, 실행, 기록 읽기 | 앱 개발자 |
| `crdt-fuzz/engine` | 가상 시간, 일정, 난수, 해시 | 도구 제작자·연구자 |
| `crdt-fuzz/bundle` | 기록 묶음 v3 읽기·쓰기·검증 | 재생 도구·화면 |

`causal-lab` 명령은 한 판 동안 별칭으로 유지한다. `causal-lab-verify`는 `crdt-fuzz`의 `replay`로 대체하고, 다음 판에서 제거한다.

R08이 요구하는 core/verify의 순수 경계는 없애지 않는다. `core`는 `engine`, `verify`는 `sdk`와 `bundle`로 이름을 바꾸어 같은 조건(Node 저장·HTTP·DOM을 가져오지 않음)을 유지한다.

## 3. 공개 연결 규약

연결기는 앱의 동기화 경계를 감싸는 얇은 코드다. 라이브러리 내부를 다시 구현하지 않는다.

```ts
import * as Y from "yjs";
import { defineAdapter, type Json } from "crdt-fuzz";

export type Op =
  | { kind: "set"; key: string; value: string }
  | { kind: "remove"; key: string };

export default defineAdapter<import("yjs").Doc, Op, Uint8Array>({
  name: "yjs-map",
  version: "13.6.27",

  open({ replica, bootstrap }) {
    const doc = new Y.Doc({ guid: bootstrap.guid });
    doc.clientID = bootstrap.clientID;
    return doc;
  },

  local(doc, op, ctx) {
    const map = doc.getMap<string>("values");
    if (op.kind === "set") {
      map.set(op.key, op.value);
      return {
        accepted: true,
        effect: { kind: "set", path: [op.key], value: op.value },
        messages: [Y.encodeStateAsUpdate(doc)],
      };
    }
    map.delete(op.key);
    return {
      accepted: true,
      effect: { kind: "remove", path: [op.key] },
      messages: [Y.encodeStateAsUpdate(doc)],
    };
  },

  receive(doc, update) {
    Y.applyUpdate(doc, update);
  },

  sync(doc, peer, ctx) {
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer));
    return [Y.encodeStateAsUpdate(doc)];
  },

  snapshot(doc): Json {
    return Object.fromEntries(doc.getMap<string>("values").entries());
  },

  close(doc) {
    doc.destroy();
  },
});
```

규약의 의미:

| 함수 | 책임 | 하면 안 되는 일 |
| --- | --- | --- |
| `open` | 복제본 상태를 만든다. 초기값은 명세에서 받는다 | 현재 시각·난수로 식별자를 만들지 않는다 |
| `local` | 업무 연산을 적용하고, 수락 결과·효과·보낼 메시지를 반환한다 | 검사기가 기대하는 값을 미리 계산하지 않는다 |
| `receive` | 받은 메시지를 적용한다 | 다른 복제본의 상태를 직접 읽지 않는다 |
| `sync` | 복구 시 상대와 상태를 교환한다 | 검사기가 정답 문서를 대체하지 않는다 |
| `snapshot` | 검사에 쓸 JSON 관찰값을 반환한다 | 내부 바이트를 그대로 노출하지 않는다 |
| `close` | 자원을 해제한다 | 파일·네트워크를 남기지 않는다 |

`effect`는 앱이 의도한 결과다. 검사기는 이 값을 이용해 "쓰기가 살아남았는가"를 판정한다. 연결기가 `effect`를 생략하면 손실 검사는 `inconclusive`가 되고, 통과로 처리하지 않는다.

`version`은 대상 라이브러리의 정확한 판을 적는다. 기록 묶음에는 연결기 본문의 SHA-256과 대상 꾸러미의 판·내용 식별자가 들어간다. 임의 모듈의 모든 간접 의존성을 자동으로 찾는다고 주장하지 않는다.

## 4. CLI

```sh
crdt-fuzz init [--target yjs]        # 설정과 예제 연결기 생성
crdt-fuzz run [--target yjs] [--seeds 100] [--time 60] [--json]
crdt-fuzz replay <bundle.json>       # 같은 일정·같은 판정
crdt-fuzz open <bundle.json>         # 127.0.0.1에서 조회 화면 열기
crdt-fuzz list                       # 내장 검사와 대상
crdt-fuzz report [--out dir]         # 정적 보고서 생성
crdt-fuzz repl                       # 대화형 학습(기존 REPL)
```

- 인자 해석은 Node 24의 `node:util` `parseArgs`를 사용한다. 새 의존성을 넣지 않는다.
- 종료 코드는 기존 계약을 유지한다: 통과 0, 위반 1, 오류 2, 판정 불가 3.
- `--json`은 CI용 한 줄 요약과 위반 목록을 반환한다.
- `run`의 기본값은 3복제본, 100회 실행, 60초, 분할 1회 이상, 동시 쓰기 1회 이상이다.
- 출력은 한 화면에 들어가야 한다.

```text
✗ no-lost-write  seed 19  (3 replicas, 2 partitions, 41 messages)
  replica b lost "mode=fast" written at t=3 and acknowledged at t=3
  minimal case: 4 steps, 2 messages
  replay: npx crdt-fuzz replay ./failures/no-lost-write-19.bundle.json
```

- `init`은 `crdt-fuzz.config.mjs`와 `adapters/example.mjs`를 만든다. TypeScript 사용자는 `--ts`로 `.ts`를 만들 수 있다. Node 24의 타입 제거로 실행되는지 설치 검사에서 확인한다.
- `open`은 `127.0.0.1` 또는 `::1`에만 열고, 외부 요청을 받지 않는다.
- `report`는 정적 HTML을 만들고, 네트워크 요청 없이 열린다.

## 5. 생성기

### 5.1 일정 문법

```ts
type Step =
  | { at: number; action: "partition"; left: string; right: string }
  | { at: number; action: "heal" }
  | { at: number; action: "command"; replica: string; op: Op }
  | { at: number; action: "disconnect"; replica: string }
  | { at: number; action: "reconnect"; replica: string }
  | { at: number; action: "restart"; replica: string };

type Network = {
  minLatency: number; maxLatency: number;
  dropRate: number; duplicateRate: number; reorder: boolean;
};
```

첫 출시는 `partition`, `heal`, `command`만 생성한다. `disconnect`·`reconnect`·`restart`는 문법에만 두고 2차에서 생성한다. 문법을 먼저 고정해야 기록 묶음 v3가 흔들리지 않는다.

### 5.2 생성 알고리즘

1. 복제본 2–4개를 고른다.
2. 분할 구간 1–3개를 만든다. 각 구간은 서로 다른 두 복제본을 가르고, 구간 안에서 양쪽에 하나 이상의 쓰기를 둔다.
3. 분할 구간마다 같은 키에 동시에 기록하는 명령을 최소 1개 둔다. 이것이 없으면 수렴 검사만으로는 아무것도 발견하지 못한다.
4. 손실률·중복률·재정렬을 난수로 정한다.
5. 마지막에 `heal`을 두고, 모든 순서쌍의 복구 라운드를 예약한다.
6. 일정을 검증한다. 끊긴 복제본에 명령을 넣거나, 같은 시각에 순서가 뒤집히는 일정은 버린다.

fast-check에는 작은 정수 배열을 생성하게 하고, 해석기가 이를 유효한 일정으로 바꾼다. 축소는 배열을 줄이거나 값을 낮춘 뒤 다시 검증한다. 유효하지 않으면 `pre`로 거부한다. 이렇게 하면 축소 결과도 항상 실행 가능한 일정이 된다.

### 5.3 결정성

- 모든 시간은 가상 시간이다. `Date.now`, `Math.random`, `crypto.randomUUID`를 실행 경로에서 사용하지 않는다.
- 난수는 seed에서만 나온다.
- 기록 묶음에는 seed와 함께 **해석된 일정 전체**를 넣는다. 재생은 fast-check의 경로에 의존하지 않는다.
- 같은 묶음은 같은 판에서 같은 해시를 반환한다. 다른 판에서는 판 번호가 달라진다.

### 5.4 합격 조건

- 기본 실행 100개 중 분할과 동시 쓰기가 없는 일정은 0개다.
- 1,000개 생성에서 유효하지 않은 일정은 0개다.
- 축소 후에도 같은 위반이 재현된다.
- 기본 100개 실행이 60초 안에 끝난다(10,000사건 성능 증명은 별도).

## 6. 검사

| 검사 | 판정 | 잡는 것 | 오탐 방지 |
| --- | --- | --- | --- |
| `convergence` | 복구 완료 후 모든 관찰값이 같다 | 수렴 실패 | 복구 미완료는 `inconclusive` |
| `no-lost-write` | 수락된 쓰기가 인과적으로 뒤따르는 덮어쓰기 없이 사라지지 않았다 | 조용한 자료 손실 | `effect`가 없으면 `inconclusive` |
| `idempotence` | 모든 메시지를 두 번 전달해도 결과가 같다 | 중복 적용 결함 | 메시지 식별자가 없는 대상은 제외 |
| `schema` | 모든 관찰값이 사용자 검사를 통과한다 | 스키마 위반 상태의 전파 | 검사 함수 오류는 `error` |
| `causal-visibility` | 원인을 보지 않은 결과를 보여 주지 않는다 | 인과 위반 | 2차. 메시지-연산 대응이 필요 |
| `commutativity` | 전달 순서를 바꿔도 최종 상태가 같다 | 교환 법칙 위반 | 2차. 상태 기반 대상에만 |

### 6.1 `no-lost-write`의 정확한 의미

쓰기 `O`가 수락되었고, 같은 대상(키·경로)에 `O`를 관찰한 뒤 발행된 쓰기 `O'`가 없다고 하자. 복구 후 관찰값은 `O`의 효과를 보여야 한다. `O`가 제거라면 대상이 없어야 한다.

동시 쓰기가 있으면 둘 중 하나가 남는 것은 허용한다. 다만 남은 값은 동시에 기록한 값 중 하나여야 한다. 어느 쪽도 아닌 값이 나타나면 위반이다.

이 정의는 CRDT의 충돌 해결 규칙을 검사기가 다시 구현하지 않게 한다. 검사기는 "인과적으로 뒤따르는 쓰기가 있었는가"만 판단하고, 최종 값의 선택은 대상에 맡긴다.

### 6.2 검사마다 고정 사례

모든 검사는 통과 사례와 실패 사례를 함께 가진다. 실패 사례는 일부러 잘못된 연결기를 만들어 확인한다. 새 검사를 넣을 때 이 두 사례가 없으면 병합하지 않는다.

## 7. 기록 묶음 v3

```json
{
  "format": "crdt-fuzz/bundle@3",
  "engine": { "version": "0.3.0", "commit": "..." },
  "target": { "id": "yjs-map", "version": "13.6.27", "digest": "sha256-..." },
  "adapter": { "name": "yjs-map", "source_sha256": "..." },
  "case": {
    "replicas": ["a", "b"],
    "seed": 19,
    "network": { "minLatency": 1, "maxLatency": 3, "dropRate": 0.5, "duplicateRate": 0.5 },
    "schedule": [{ "at": 0, "action": "partition", "left": "a", "right": "b" }]
  },
  "invariants": [{ "id": "no-lost-write", "version": "1", "parameters": null }],
  "result": {
    "status": "failed",
    "violations": [
      { "id": "no-lost-write", "at": 7, "path": ["mode"], "expected": "fast", "actual": null }
    ]
  },
  "events": [],
  "messages": [
    { "id": "...", "from": "a", "to": "b", "sha256": "...", "bytes_b64": "..." }
  ],
  "integrity": { "canonical_sha256": "..." }
}
```

- 정규 JSON은 RFC 8785를 유지한다. 해시는 내용 일관성만 확인하며 작성자 신원을 인증하지 않는다.
- v2 묶음 읽기를 유지한다. v2를 v3로 다시 해석하지 않는다.
- `result.violations`는 사람이 읽을 수 있어야 하고, `events`는 화면이 사건을 재생할 수 있을 만큼 충분해야 한다.
- 메시지 본문은 재생에 필요할 때만 넣고, 바이트 수 상한을 둔다.

## 8. 조회 화면

- 왼쪽: 시간축. 분할 구간, 메시지 화살표, 손실·중복·보류 표시.
- 오른쪽: 선택한 사건의 복제본별 관찰값과 위반 카드.
- 아래: 최소 일정, 재생 명령, 판·연결기 식별자.
- 위반 카드는 "기대", "실제", "규격 상태", "회피"를 함께 보여 준다.
- 영어가 기본이다. 한국어는 `/ko/`다.
- 대상 코드를 실행하지 않는다. 외부 요청을 보내지 않는다. `connect-src 'none'`을 유지한다.
- 사례 모음은 빌드 시 JSON을 묶어 넣는다. 실행 중 가져오지 않는다.
- 키보드: Space 재생/정지, ← → 사건 이동, Home/End 처음/끝.
- 좁은 화면에서는 시간축 위, 상태 아래로 쌓는다.

## 9. 저장소·꾸러미 정리

| 항목 | 현재 | 목표 |
| --- | --- | --- |
| 이름 | `causal-lab` | `crdt-fuzz` |
| npm | 없음 | `crdt-fuzz@0.3.0` |
| 첫 화면 | 기능 설명 | 결과 한 문장 + 명령 한 줄 + 시연 한 장 |
| 시연 언어 | 한국어 | 영어 기본, 한국어 보조 |
| 배포 | 수동, 404 | `main` 또는 판 꼬리표에서 자동, 살아 있는 URL |
| 명령 | 2개 | `crdt-fuzz` 하나 + `causal-lab` 별칭 |
| 공개 경계 | 4개 | 3개 |
| README 방어 문구 | 첫 화면 | `## Limits`로 이동 |
| 기여 안내 | 없음 | `CONTRIBUTING.md`, 문제 서식, 기록 묶음 첨부 |
| 새 복제 검사 | `pnpm build` 필요 | `pnpm test`만으로 통과 |
| 꾸러미 정보 | 저장소·홈페이지 없음 | `repository`, `homepage`, `bugs`, `keywords` |
| 주제 꼬리표 | 7개 | `crdt`, `local-first`, `testing`, `fuzzing`, `distributed-systems`, `yjs`, `replication` |
| 사회 미리보기 | 없음 | 1280×640 한 장 |

`dist/`는 이미 추적되지 않는다. 추가 조치는 필요 없다. Node 24 요구는 유지한다. 대신 새 복제에서 `pnpm install && pnpm test`가 바로 통과하도록 `test` 앞에 웹 묶음 생성을 붙이거나, 웹 검사가 필요할 때만 빌드하게 나눈다.

## 10. 걷어낼 것과 미룰 것

| 대상 | 조치 | 이유 |
| --- | --- | --- |
| v1 HTTP 서버 | `causal-lab` 별칭으로 유지, 계약은 유지 | 첫 화면을 흐린다. R11은 보존해야 한다 |
| v1 SQLite 카탈로그 | 선택 기능으로 유지, 기본 설치에서 제외 | 첫 사용에 저장소가 필요 없다. v1 서버와 DB 계약은 R11에 따라 그대로 둔다 |
| REPL | `crdt-fuzz repl`로 유지 | 학습에는 좋지만 첫 화면의 중심은 아니다 |
| OR-Map | 기준 예제로 유지 | 검사기 자체를 시험하는 대상이 필요하다 |
| 한국어 학습 화면 | `/ko/`로 이동 | 글로벌 독자 진입을 막는다 |
| 네 번째 공개 경계 | 제거 | 표면을 줄인다 |
| 10,000사건 성능 증명 | 출시 후로 미룸 | 첫 사용자는 속도보다 정확한 실패를 원한다 |
| Loro·Automerge | 2차, 승인 후 | 첫 출시의 범위를 지킨다 |
| 호스팅 서비스 | 하지 않음 | 무네트워크 원칙과 유지 부담 |

## 11. 호환성

- `/v1/run`, v1 시나리오·실행 ID, v1 DB는 그대로 둔다. 새 자료를 v1로 다시 해석하지 않는다.
- v2 기록 묶음은 읽기만 하고, 새로 쓰지는 않는다.
- v3 묶음은 v2와 다른 형식 번호를 사용한다. 같은 해시를 다른 뜻으로 재사용하지 않는다.
- `causal-lab-verify`는 한 판 동안 `crdt-fuzz replay`로 넘기는 안내를 표시한다.
- npm에 공개된 적이 없으므로 `./core`, `./verify`, `./node` 하위 경로의 이름 변경은 외부 사용자에게 영향을 주지 않는다. 별칭은 명령에만 둔다.
- 기존 검사 301개는 새 구조에서도 통과해야 한다. 이동은 하되 의미를 바꾸지 않는다.

## 12. 검사 계획

| 검사 | 파일 | 확인 |
| --- | --- | --- |
| 연결 규약 | `test/sdk.test.ts` | 타입, 필수 함수, `effect` 누락 시 판정 불가 |
| 생성기 | `test/generate.test.ts` | 유효 일정 100%, 분할·동시 쓰기 포함, 결정성 |
| 축소 | `test/shrink.test.ts` | 축소 후 같은 위반, 유효 일정 유지 |
| 검사 | `test/checks/*.test.ts` | 통과·실패 고정 사례, 오탐 0 |
| 기록 | `test/bundle-v3.test.ts` | 왕복, 해시, 변조 거부, v2 읽기 |
| 명령 | `test/cli.test.ts` | 종료 코드, `--json`, `init`, `replay` |
| 설치 | `test/install.test.ts` | `npm pack` → 임시 프로젝트 설치 → 실행 |
| 새 복제 | CI | `pnpm install && pnpm test`가 빌드 없이 통과 |
| 화면 | `test/web-security.test.ts`, `test/e2e` | 외부 요청 0, 대상 코드 실행 0, 재생 일치 |
| 호환 | 기존 301개 | v1·v2 동작 유지 |

## 13. 작업 꾸러미

| ID | 결과 | 주요 파일 | 완료 조건 | 예상 |
| --- | --- | --- | --- | --- |
| WP-01 | 만날 수 있는 제품 | `package.json`, `README.md`, `web/index.html`, 배포 워크플로 | `npx crdt-fuzz --version`과 `run --target yjs`가 새 폴더에서 동작, 시연 URL 200, 영어 첫 화면(중간 판) | 2–3일 |
| WP-02 | 명령 표면 | `src/cli/*` | `init`·`run`·`replay`·`open`, 종료 코드, `--json` | 3–4일 |
| WP-03 | 공개 연결 규약 | `src/sdk/*`, `docs/adapters.md` | 30줄 Yjs 연결기, 외부 소비 프로젝트 1곳 | 3일 |
| WP-04 | 분할 생성기 | `src/generate/*` | 기본 100개에 분할·동시 쓰기 포함, 1,000개 유효 | 4–5일 |
| WP-05 | 손실 검사 | `src/checks/*` | 통과·실패 고정 사례, 오탐 0 | 5–7일 |
| WP-06 | 조회 화면 | `web/*`, `src/runtime/bundle.ts` | 묶음 재생, 위반 카드, 외부 요청 0, 좁은 화면, 첫 화면 정식 판 | 4일 |
| WP-07 | 첫 사례 3개 | `examples/cases/*` | 고정 판에서 재현, 유지관리자 사전 통지 | 3–5일 |
| WP-08 | 보고서 1판 | 정적 사이트 | 사례 10개(재현된 것만), 전부 재생 가능, 규격 상태 표기 | 5–7일 |
| WP-09 | CI 행동 | `action.yml`, 문서 | 샘플 저장소에서 실행, 기록 첨부 | 2일 |
| WP-10 | 기여 경로 | `CONTRIBUTING.md`, 문제 서식 | 낯선 사람이 묶음을 첨부해 보고 | 1일 |
| WP-11 | 2차 대상 | `src/adapters/loro.ts`, `automerge.ts` | 3개 대상 × 4개 검사, 승인 후 | 5–7일 |
| WP-12 | 성능 증명 | `bench/` | 10,000사건·메모리 측정, 필요할 때 | 2일 |

순서: WP-01 → WP-02·03 → WP-04 → WP-05 → WP-06·07 → WP-08. WP-09·10은 WP-06과 함께. WP-11은 첫 설계 파트너가 생긴 뒤. WP-12는 사용자가 물을 때. WP-01의 첫 화면은 중간 판이고, "사라진 쓰기" 문구는 WP-05 뒤에 켠다.

## 14. 파일별 조치

| 현재 | 조치 |
| --- | --- |
| `src/index.ts` | `src/legacy/index.ts`로 이동. v1 모듈은 보존하되 공개 내보내기에서는 제외하고, 새 `src/sdk/index.ts`가 `.` 경계가 된다 |
| `src/core.ts` | `src/engine/index.ts`로 이동 |
| `src/simulation.ts`, `src/crdt.ts`, `src/scheduler.ts`, `src/random.ts`, `src/sha256.ts`, `src/trace.ts` | `src/engine/`로 이동. 의미 변경 없음 |
| `src/verify.ts` | `src/sdk/index.ts`, `src/runtime/index.ts`, `src/checks/index.ts`로 분리 |
| `src/node.ts` | `src/runtime/index.ts`로 흡수. 공개 경계에서 제외 |
| `src/node/files.ts`, `src/node/worker.ts`, `src/node/registry.ts` | `src/runtime/`로 이동 |
| `src/node/catalog.ts` | `src/runtime/catalog.ts`로 이동(v2 카탈로그) |
| `src/verify-cli.ts` | `src/cli/main.ts`로 이동, 하위 명령 추가 |
| `src/verify/runtime.ts` | `src/runtime/execute.ts`로 이동 |
| `src/verify/checks.ts` | `src/checks/*`로 분리, 검사 추가 |
| `src/verify/generate.ts` | `src/generate/schedule.ts`로 교체 |
| `src/verify/bundle.ts` | `src/runtime/bundle.ts`로 이동, v3 추가 |
| `src/verify/case.ts`, `src/verify/types.ts` | `src/sdk/`로 이동 |
| `src/verify/json.ts`, `src/verify/packet.ts`, `src/verify/manifest.ts` | `src/runtime/`로 이동 |
| `src/adapters/yjs.ts` | 유지, `defineAdapter`로 감싼다 |
| `src/adapters/or-map.ts` | 유지, 기준 예제로 |
| `src/server.ts`, `src/app.ts`, `src/catalog.ts`, `src/scenario.ts` | `src/legacy/`로 이동, 계약 유지 |
| `src/repl.ts` | `src/legacy/repl.ts`로 이동, `crdt-fuzz repl`로 노출 |
| `web/index.html` | 영어 첫 화면으로 교체, 기존 학습 화면은 `web/ko/` |
| `web/verification.html` | `web/viewer.html`로 이름 변경 |
| `vite.config.ts` | 입력: `index`, `ko/index`, `viewer`, `gallery`, `core` |
| `package.json` | 이름·명령·공개 경계·꾸러미 정보·검사 순서 |
| `.github/workflows/pages.yml` | `main` 또는 판 꼬리표에서 자동 배포(승인 후) |
| `docs/verification.md` | 사용자 문서로 다시 작성(영어), 한국어는 `docs/ko/` |
| `README.md` | 첫 화면 교체, 한계 절 유지 |

## 15. 하지 않을 것

- CRDT 라이브러리를 새로 만들지 않는다.
- 호스팅 서비스, 계정, 과금, 조직 기능을 넣지 않는다.
- 실제 운영 서버에 장애를 주입하지 않는다.
- 모든 언어 실행기를 만들지 않는다.
- 완전 상태 탐색기를 만들지 않는다.
- 화면에 UI 프레임워크를 넣지 않는다. 지금의 정적 HTML·Canvas로 충분하다.
- 원격 측정을 넣지 않는다.
- 검사 결과를 과장하지 않는다. 통과는 정확성의 증명이 아니다.

## 16. 합격 조건

1. 새 폴더에서 `npx crdt-fuzz run --target yjs`가 60초 안에 끝난다.
2. 기본 실행에 분할과 동시 쓰기가 최소 한 번씩 들어간다.
3. 위반이 나오면 `replay`가 같은 판정과 같은 해시를 반환한다.
4. 조회 화면이 위반 사건과 복제본별 상태 차이를 보여 준다.
5. 검사마다 통과·실패 고정 사례가 있고, 내장 묶음에서 오탐이 0이다.
6. 새 복제에서 `pnpm install && pnpm test`가 빌드 없이 통과한다.
7. `npm pack` 후 임시 프로젝트에 설치해 실행된다.
8. 영어가 기본이고 한국어 화면이 함께 동작한다.
9. v1 `/v1/run`과 v2 묶음 읽기가 유지된다.
10. 첫 사례 3개가 고정 판에서 재현되고, 보고서 1판의 사례가 전부 재생 가능하며 각 묶음이 저장소에 있다.

이 10개가 통과하기 전에는 공개 출시를 하지 않는다. 별표보다 이 목록이 먼저다.

## 관련 문서

- [MARKET.md](MARKET.md): 시장·채널·상한의 근거
- [GROWTH.md](GROWTH.md): 이름·첫 화면·보고서·출시 일정
- [PROJECT.md](PROJECT.md), [DESIGN.md](DESIGN.md): 범위와 기술 조건의 정본

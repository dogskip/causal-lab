---
title: "인기 설계: 수렴은 정답이 아니다"
authority_level: proposal
ssot: false
owner: product
status: draft
last_updated: 2026-10-21
derived_from:
  - ".planning/MARKET.md"
  - ".planning/PROJECT.md"
  - ".planning/DESIGN.md"
source_of_truth_for: []
must_not_be_overridden_by: [".planning/PROJECT.md", ".planning/DESIGN.md"]
ai_edit_policy: editable-but-must-not-contradict-sources
scope: "자리매김·첫 화면·출시 설계. 기술 합격 조건과 구현 범위는 PROJECT/DESIGN이 정본이다."
---

# 인기 설계: 수렴은 정답이 아니다

## 0. 한 문장

**"CRDT는 수렴한다. 하지만 맞다는 뜻은 아니다."**

이 문장이 제품의 이름이고, 첫 화면이고, 출시 글의 제목이고, 사람들이 저장소를 기억하는 이유다. 지금 저장소의 첫 문장("Verify actual CRDT implementations…")은 기능 설명이라서 아무도 기억하지 못한다.

## 1. 이름

### 1.1 권고: `crdt-fuzz`

| 항목 | 판단 |
| --- | --- |
| npm | `crdt-fuzz` 사용 가능(2026-10-21 조회, 404) [M21] |
| GitHub | 같은 이름의 저장소 없음(검색 0건) [M21] |
| 검색성 | "CRDT 테스트", "CRDT fuzz"를 그대로 담는다 |
| 명령 | `npx crdt-fuzz run --target yjs`가 곧 설명이다 |
| 확장 | 나중에 동기화 엔진으로 넓히면 `syncfuzz`를 별도로 검토한다 |

`causal-lab`은 정확한 이름이지만 추상적이고, "lab"이 미완성을 암시하며, 검색어와 맞지 않는다. 별표 0개인 지금이 이름을 바꾸는 비용이 가장 낮은 시점이다. 저장소 이름, npm 이름, 명령 이름을 모두 `crdt-fuzz`로 맞춘다.

`Causal Lab`은 없애지 않는다. 결정적 실행기(engine)의 내부 이름으로 유지하고, 구조 문서에서만 사용한다. 제품 이름과 실행기 이름을 분리하면 기존 문서·기록과의 연결도 유지된다.

### 1.2 대안

| 이름 | 장점 | 단점 |
| --- | --- | --- |
| `syncfuzz` | 동기화 엔진까지 포괄 | 첫 출시는 CRDT만 지원하므로 이름과 범위가 어긋난다 |
| `crdt-probe` | 진단 느낌 | GitHub에 동명 저장소가 있고 npm은 비어 있음. "fuzz"보다 약하다 |
| `causal-lab` 유지 | 기존 문서·기록 보존 | 검색성·기억성·명령 이름이 모두 약하다 |

## 2. 무엇을 파는가

도구가 아니라 **증거**를 판다. 사용자가 얻는 것은 "내 앱이 안전하다" 또는 "여기 재현 가능한 손실이 있다"는 판정과, 그 판정을 동료에게 그대로 전달할 수 있는 파일이다.

| 지금 파는 것 | 새로 팔 것 |
| --- | --- |
| 결정적 CRDT 모의 실행기 | 손실된 쓰기를 찾는 장애 주입기 |
| 검증 SDK와 CLI | 2분 안에 끝나는 첫 실행 |
| 재생 가능한 영수증 | 동료가 그대로 재생하는 실패 묶음 |
| 한국어 학습 화면 | 영어 첫 화면 + 한국어 보조 화면 |
| 수렴 검사 | 수렴 + 손실 + 멱등 + 업무 규칙(인과는 2차) |

핵심 메시지는 "우리는 CRDT 라이브러리가 아니다"가 아니라 "수렴만 검사하는 도구가 아니다"이다. 경쟁 상대는 Yjs가 아니라, 사람이 직접 작성하는 재현 스크립트와 "그냥 다시 동기화하면 되겠지"라는 희망이다.

## 3. 첫 화면

README 첫 화면은 다음 순서를 지킨다. 스크린샷·움직이는 그림 한 장이 반드시 들어간다.

````md
# crdt-fuzz

**CRDTs converge. That doesn't mean they're correct.**

Deterministic fault injection for CRDTs and local-first sync.
Find the write that vanished, replay the exact failure, and share a bundle
your teammate can reproduce.

```sh
npx crdt-fuzz run --target yjs
```

[60-second demo](https://dogskip.github.io/crdt-fuzz/) · [correctness report](https://dogskip.github.io/crdt-fuzz/gallery.html) · [docs](docs/verification.md)

## What it catches

- A write acknowledged on one replica but missing after recovery.
- A concurrent write that disappears without a conflict.
- A remove that resurrects an old value.
- An adapter that converges but violates your schema.

## Why not just test the library?

Library tests check the library. Your bugs live in the adapter, the schema,
and the recovery path. crdt-fuzz runs your code through partitions, drops,
duplicates and reordering, then checks what the user meant to keep.

## Status

Yjs 13.6.27 and the built-in OR-Map are covered today. Loro and Automerge are
next. If it does not find a violation, that is not a proof of correctness.
````

첫 화면에서 지켜야 할 금지 사항:

- "아직 제품이 아니다", "합격을 선언하지 않는다" 같은 방어 문구를 첫 화면에 두지 않는다. 그런 문구는 `## Limits`로 내린다.
- 설치 방법을 세 단계로 늘어놓지 않는다. `npx` 한 줄이 먼저다.
- 저장소 구조·검사 개수·SQLite 표를 첫 화면에 두지 않는다.
- 한국어 시연을 기본으로 두지 않는다. 영어가 기본, 한국어는 `/ko/`다.

이 화면은 손실 검사가 붙은 뒤(4주 차)의 정식 판이다. 1주 차에는 같은 구조로 현재 가능한 것만 적는다. 결정적 재현, 수렴·기대 상태 검사, Yjs·OR-Map이 그 범위다. "Find the write that vanished"와 손실 관련 항목은 검사가 실제로 그 실패를 만들 때 켠다.

## 4. 첫 5분 경로

목표는 "저장소를 복제하지 않고, 2분 안에 실패 하나를 재생하는 것"이다.

| 시간 | 사용자가 하는 일 | 제품이 보여 주는 것 |
| --- | --- | --- |
| 0:00 | README 첫 화면 | 한 문장, 명령 한 줄, 시연 한 장 |
| 0:20 | `npx crdt-fuzz run --target yjs` | 30초 안에 끝나는 기본 실행, 통과/위반 요약 |
| 0:50 | 시연 페이지에서 "실패 사례" 클릭 | 분할 → 동시 쓰기 → 복구 시간축, 사라진 값 |
| 1:30 | "이 실패 재생" 클릭 | 같은 기록 묶음, 같은 판정, 복사 가능한 명령 |
| 2:00 | "내 앱에 연결" 클릭 | 30줄 연결기 예제, `init` 명령, CI 설정 |

이 경로가 안 되면 다른 모든 개선은 의미가 없다. 첫 출시의 합격 조건은 기능 수가 아니라 이 경로의 완주다.

## 5. 증거물: CRDT 정확성 보고서

출시의 중심은 도구 소개가 아니라 **보고서**다. 이름은 `CRDT Correctness Report`로 한다.

### 5.1 형식

각 사례는 다음을 갖는다.

| 항목 | 내용 |
| --- | --- |
| ID | `case-001` |
| 대상 | 라이브러리·정확한 버전 |
| 장면 | 사용자가 한 일을 일상 말로 |
| 기대 | 사용자가 유지되리라 생각한 것 |
| 실제 | 복구 후 관찰값 |
| 규격 상태 | 문서화된 동작 / 설계상 선택 / 모호함 / 결함 |
| 영향 | 자료 손실, 순서 뒤바뀜, 성능, 놀라움 |
| 재생 | 기록 묶음 파일과 명령 |
| 회피 | 앱에서 어떻게 막는가 |

"규격 상태" 열이 핵심이다. 이것이 없으면 유지관리자와 독자 모두에게 공격으로 읽힌다. 이 프로젝트의 목적은 라이브러리를 이기는 것이 아니라, 앱 개발자가 자기 통합을 검사하게 하는 것이다.

### 5.2 후보 사례

아래는 후보이며, 공개 전에 고정 버전에서 직접 재현하고 유지관리자에게 먼저 알린다. 재현되지 않으면 버린다.

1. 한 키에 객체 전체를 저장할 때, 두 복제본이 서로 다른 필드를 고치면 한 필드가 사라진다.
2. 같은 키를 동시에 지우고 기록하면, 사용자가 기대한 값이 아니라 다른 값이 남는다.
3. 스키마에 맞지 않는 노드가 조용히 삭제되고, 그 삭제가 모든 복제본으로 퍼진다.
4. 원격 변경 뒤에 실행한 되돌리기가 더 새로운 값을 대체한다.
5. 오래 끊긴 복제본이 다시 붙을 때, 그 사이 정리된 항목 때문에 자료가 사라진다.
6. 같은 `clientID`를 가진 두 문서가 충돌해 문서가 영구히 손상된다.
7. 중첩 맵을 일반 값으로 대체하면, 그 안의 동시 변경이 모두 사라진다.
8. 같은 위치에 동시에 삽입한 항목의 순서가 사용자 기대와 다르게 정해진다.
9. 삭제 후 삽입으로 만든 "이동"이 동시 편집을 잃는다.
10. 재연결 절차가 라이브러리의 전제와 다르면, 수렴은 하지만 사용자의 쓰기가 사라진다.

1·2·7·8은 지도(map) 의미론, 3·4·5는 실제 응용 경계, 6은 초기화, 9는 목록, 10은 연결 절차다. 1판은 Yjs 하나에서 재현되는 사례만 싣는다. 10개를 채우지 못하면 수를 줄인다. Loro·Automerge 사례는 승인 후 2판에 넣으며, 그때 "한 라이브러리의 결함"이 아니라 "CRDT 통합의 공통 함정"이 된다. [M18]

### 5.3 왜 보고서가 도구보다 강한가

- 도구는 설치해야 하지만 보고서는 읽기만 하면 된다.
- 보고서는 검색·인용·번역이 된다. 도구는 그렇지 않다.
- 보고서는 유지관리자와 대화를 만든다. 도구는 조용히 설치된다.
- 보고서는 다음 판이 있다. 한 번의 출시로 끝나지 않는다.

보고서의 모든 사례는 `crdt-fuzz`로 재생된다. 이것이 "그럴듯한 글"과 "증거"를 가른다. 도구는 보고서를 만드는 기계이고, 보고서는 도구를 사용하게 만드는 이유다.

## 6. 출시까지의 일정

날짜는 2026-10-21 기준의 계획이며, 준비가 안 되면 출시를 미룬다. 늦게 공개하는 것이 준비 안 된 채 공개하는 것보다 낫다. 아래 표는 13주 분량이고, 연휴 두 주를 한 줄로 묶었다.

| 주 | 기간 | 결과 | 통과 조건 |
| --- | --- | --- | --- |
| 1 | 10/26–10/30 | 도달 가능성 | npm·배포 페이지·영어 첫 화면(중간 판), `npx crdt-fuzz run --target yjs` 동작 |
| 2 | 11/02–11/06 | CLI·SDK | `init`·`run`·`replay`·`open`, 30줄 연결기 |
| 3 | 11/09–11/13 | 생성기 | 분할·동시 쓰기가 들어간 일정 |
| 4 | 11/16–11/20 | 검사 | 손실·멱등·스키마 |
| 5 | 11/23–11/27 | 화면 | 시간축·위반 카드·재생, 첫 화면 정식 판 |
| 6 | 11/30–12/04 | 첫 사례 3개 | 고정 버전에서 재현, 유지관리자에게 사전 통지 |
| 7 | 12/07–12/11 | 설계 파트너 | 2팀이 자기 앱에 연결, 인용문과 기록 확보 |
| 8 | 12/14–12/18 | 소프트 공개 | 블로그·시연, `0.3.0` 공개, 한국어·일본어 초안 |
| 9 | 12/21–01/01 | 동결 | 새 기능 금지, 오탐 수정, 문서 정리 |
| 10 | 01/04–01/08 | 보고서 1판 | 사례 10개(재현된 것만), 전부 재생 가능 |
| 11 | 01/11–01/15 | 주요 공개 | Show HN·Lobsters·GeekNews·뉴스레터 |
| 12 | 01/18–01/22 | 후속 | 사례 2판, Action, 번역, 회고 |

소프트 공개와 주요 공개를 나누는 이유는 두 가지다. 첫째, 12월 하순은 Hacker News의 주의가 분산된다. 둘째, 소프트 공개에서 나온 "이해가 안 된다"는 반응을 첫 화면과 보고서에 반영할 시간이 필요하다.

사례는 7–9주 차에 설계 파트너와 실행 기록에서 모으고, 10주 차에는 재현 확인과 편집만 한다. 10개를 채우지 못하면 수를 줄인다. 1주 차의 npm 공개는 `0.3.0-alpha.1`이고, `run`은 기존 `verify`를 호출하는 별칭으로 먼저 노출한다. 정식 `0.3.0`은 소프트 공개에 맞춘다.

## 7. 채널 실행안

### 7.1 순서

1. **설계 파트너 2팀** (소프트 공개 1주 전, 주요 공개 5주 전): 자기 앱의 연결기를 함께 만들고, 실제 실패 1건을 확보한다. 인용문과 사례가 생긴다.
2. **소프트 공개** (12월 셋째 주): 블로그 + npm + 시연. Hacker News는 아직 가지 않는다.
3. **보고서 1판** (1월 첫째 주): 재현된 사례(목표 10개), 전부 재생 가능, 유지관리자 답변 반영.
4. **Show HN** (1월 둘째 주, 화~목): 보고서를 링크한다. 저장소만 링크하지 않는다.
5. **Lobsters** (다음 날): 같은 글. 제목만 기술적으로 바꾼다.
6. **GeekNews** (같은 주): 한국어 글. "CRDT는 수렴한다. 하지만 맞다는 뜻은 아니다."
7. **Yjs 토론** (둘째 주): "검토해 주세요" 형식. 버그 주장이 아니라 재현 요청. Loro·Automerge는 그 대상의 사례가 생긴 뒤에 찾아간다.
8. **뉴스레터** (셋째 주): Changelog, JavaScript Weekly, Node Weekly, local-first 소식지.
9. **GitHub Action Marketplace** (넷째 주): CI 사용자를 만든다.
10. **일본어·한국어 재배포** (한 달 안): Qiita/Zenn, OKKY/velog.

### 7.2 하지 않을 것

- r/selfhosted, r/LocalLLaMA, awesome-selfhosted, Product Hunt에 먼저 가지 않는다. 독자가 다르다.
- 별표를 요청하지 않는다. HN·Reddit 규칙 위반이고, 역효과다.
- 유지관리자를 지목해 "당신 라이브러리가 틀렸다"고 말하지 않는다. 사례는 앱 통합의 함정으로 작성한다.
- 같은 글을 여러 채널에 동시에 올리지 않는다. 채널마다 문장을 바꾼다.
- 12월 하순에 주요 공개를 하지 않는다.

### 7.3 문안 초안

**블로그 제목**: `CRDTs converge. That doesn't mean they're correct.`

**부제**: `Ten replayable cases where the merge succeeded and the user still lost data.`

**Show HN 제목**: `Show HN: crdt-fuzz – replayable fault injection for CRDTs`

**한국어 제목**: `CRDT는 수렴한다. 하지만 맞다는 뜻은 아니다`

**일본어 제목**: `CRDTは収束する。しかし正しいとは限らない`

**첫 문단**:

> A CRDT merge is allowed to succeed and still lose the thing your user cared about. I built a fault lab that runs real CRDT code through partitions, drops, duplicates and reconnects, then records the exact failure in a file anyone can replay. This post is ten cases I could reproduce, with the version, the schedule, and the state diff.

**마지막 문단**:

> If you maintain a CRDT or a sync engine, I would rather have your review than your stars. If you build on one, run the harness on your adapter and send me the bundle. The next report will include the cases I cannot explain yet.

이 문안은 "내가 만들었다"보다 "이것을 재현했다"에 무게를 둔다. 도구 소개는 마지막에 둔다. 부제의 숫자는 실제로 재현된 사례 수로 바꾼다. 10개를 채우지 못한 채 숫자를 유지하지 않는다.

## 8. 지표

원격 측정은 넣지 않는다. 이 프로젝트의 무네트워크 원칙과 충돌한다. 대신 외부에서 관찰 가능한 값만 사용한다.

| 지표 | 측정 | 목표(가설) |
| --- | --- | --- |
| 별표 증가 | 7일 증가량 | 소프트 공개 30, 주요 공개 100(2주) |
| npm 내려받기 | 주간 | 주요 공개 후 500/주 |
| 외부 기록 묶음 | 문제·변경 요청 첨부 | 60일 안에 3건 |
| 설계 파트너 | 직접 확인 | 공개 전 2팀 |
| 첫 결과까지 시간 | 5명 관찰 | 2분 이내 |
| 보고서 인용 | 검색·링크 | 6개월 3건 |
| CI 채택 | Action 사용·언급 | 6개월 10곳 |

배포 페이지 방문은 원격 측정 없이 잴 수 없으므로 지표에서 제외한다.

별표는 뒤따르는 값이다. 별표를 뺀 나머지 지표가 0이면 별표도 0이다. 회고는 별표가 아니라 "첫 결과까지 시간"과 "외부 묶음"으로 한다.

## 9. 위험과 대응

| 위험 | 신호 | 대응 |
| --- | --- | --- |
| 유지관리자 반발 | "문서화된 동작이다" | 사례를 "결함"이 아니라 "함정"으로 분류하고, 규격 상태 열을 먼저 채운다 |
| 오탐 | 정상 코드에 위반 판정 | 검사마다 통과·실패 고정 사례를 만들고, 오탐 0이 아니면 공개하지 않는다 |
| 과장 | "CRDT는 안전하지 않다"로 읽힘 | "수렴은 정답이 아니다"로 한정하고, 한계 절을 유지한다 |
| 유지 부담 | 연결기 3개, 검사 6개 | 첫 출시는 Yjs 하나. Loro·Automerge는 파트너가 생길 때 |
| 일회성 출시 | 보고서 1판 후 정지 | 분기별 2판, 버전별 회귀, "고쳐진 사례" 표시 |
| 언어 장벽 | 한국어만 있는 시연 | 영어 기본, 한국어·일본어는 보조 |
| 이름 변경 비용 | 문서·링크 | 별표 0인 지금이 가장 싸다. 저장소 이름·npm·명령을 한 번에 바꾼다 |
| 법적 위험 | "Jepsen" 이름 사용 | 제품 이름에 사용하지 않는다. 비교 문구로만 사용한다 |

## 10. 승인이 필요한 결정

1. 저장소·npm·명령 이름을 `crdt-fuzz`로 바꾼다.
2. npm에 공개하고, 시연 페이지를 공개 URL에 배포한다.
3. `CRDT Correctness Report`를 외부에 공개한다(사례별 유지관리자 사전 통지 포함).
4. Loro·Automerge 연결기를 추가한다(PROJECT.md의 첫 지원 범위 변경).
5. 시연 페이지를 `main` 푸시에서 자동 배포한다(현재는 수동).
6. 주요 공개 시점을 2027-01-12–14로 둔다.

1–3은 이 계획의 전제다. 4는 첫 출시 후로 미뤄도 된다. 5는 배포 사고 위험을 낮추는 쪽으로 판단해야 한다. 6은 준비 상태에 따라 조정한다.

## 관련 문서

- [MARKET.md](MARKET.md): 시장·채널·상한의 근거
- [REFACTOR.md](REFACTOR.md): 이 계획을 받치는 코드 구조와 작업 꾸러미
- [PROJECT.md](PROJECT.md), [DESIGN.md](DESIGN.md): 범위와 기술 조건의 정본

---
title: "CRDT 검증 도구의 시장·채널 조사"
authority_level: derived
ssot: false
owner: product
status: draft
last_updated: 2026-10-21
derived_from:
  - "사용자의 인기·관심 요청"
  - ".planning/PROJECT.md, .planning/DESIGN.md, .planning/RESEARCH.md"
  - "M01–M23 원자료(2026-10-21 조회)"
source_of_truth_for: []
must_not_be_overridden_by: [".planning/PROJECT.md", ".planning/DESIGN.md"]
ai_edit_policy: editable-but-must-not-contradict-sources
scope: "인기·채널 판단의 근거. 시장 규모의 확정도, 제품 합격의 증거도 아니다."
---

# CRDT 검증 도구의 시장·채널 조사

## 0. 질문에 대한 직접 답

"이 프로젝트가 의미가 없는가"에 대한 답은 **아니다. 다만 지금 형태로는 의미를 전달하지 못한다**이다.

- **의미가 있는 부분**: 결정적 실행기, 가상 시간, 사건 전체 순서, 정규 JSON과 해시, 재생 가능한 영수증은 다른 도구가 쉽게 흉내 내지 못하는 자산이다. 301개 검사가 이를 뒷받침한다.
- **의미가 없는 부분**: 지금의 공개 표면은 "무엇을 해 주는가"를 말하지 않는다. npm·시연·출시 글이 없어서 아무도 평가할 기회를 얻지 못했다. 실제 대상은 Yjs 하나이고, 생성기는 분할을 만들지 않으며, "수렴했지만 틀림"을 자동으로 찾는 규칙은 아직 없다.
- **별표 0개의 원인**: 시장의 거절이 아니라 노출의 부재다. 이 저장소를 발견한 사람이 몇 명인지 알 수 없지만, 발견 경로가 없었다는 사실은 확인된다.
- **현실적인 결론**: 이 범주에서 "완벽하게 인기를 끄는" 설계는 없다. 할 수 있는 일은 만날 수 있게 만들고, 첫 실제 사례로 주장을 증명하고, 같은 증거를 반복 발행하는 것이다. 그 결과의 현실적인 범위는 300–800개이며, 3,000개를 넘으려면 검증기가 아니라 참조·학습 자료가 되어야 한다.

## 판단 요약

1. **별표 0개는 시장의 거절이 아니라 노출의 부재다.** 이 저장소는 npm에 없고, 배포 페이지가 404이며, 시연 화면은 한국어이고, 출시 글이 확인되지 않는다. 평가받을 경로가 없었다. [M12–M15, M20]
2. **통증은 이미 공개적으로 문서화되어 있다.** 2026년 3월 Hacker News에서 272포인트·160댓글을 받은 글은 "CRDT는 수렴만 보장하므로 무엇이 틀렸는지 알 수 없다"고 적었다. 이 프로젝트가 풀겠다고 주장하는 바로 그 지점이다. [M03, M04]
3. **시장은 실재하지만 좁다.** Yjs는 한 달에 4,018만 회 내려받고, Loro는 98만 회, Automerge는 30만 회 내려받는다. 그러나 "CRDT 검증 도구"를 찾는 사람은 그중 극소수다. [M05]
4. **기술 깊이는 별표를 만들지 않는다.** Automerge 모델 검사기(AMC)는 13개, 널리 인용되는 `crdt-benchmarks`는 542개다. 반면 학습용 워크벤치 Maelstrom은 3,731개, 2026년에 만든 시각적 학습 도구 breakscale은 1,772개다. [M06, M08]
5. **지금 저장소는 주장을 아직 증명하지 못한다.** 실제 대상은 Yjs 하나이고, 자동 생성기는 분할을 만들지 않으며, 검사는 수렴과 직접 작성한 기대 상태 두 개뿐이다. "수렴했지만 틀린 결과"를 자동으로 찾는 규칙은 아직 없다(사용자가 기대 상태를 직접 작성해야 한다). [M15]
6. **따라서 결론은 "더 정교한 검증기"가 아니다.** 만날 수 있게 만들고, 첫 실제 사례로 주장을 증명하고, 같은 증거를 반복 발행해야 한다. 이 세 가지가 이 계획의 전부다.

## 1. 현재 상태 측정

| 항목 | 측정값 | 의미 |
| --- | --- | --- |
| 별표·포크·지켜보기 | 0·0·0 | 외부 유입이 없었다 |
| 만든 날·마지막 푸시 | 2026-07-18·2026-10-14 | 3개월 됨, 최근 작업은 있음 |
| 커밋 | 19 | 기능 개발은 진행됐다 |
| 검사 | 301개 통과(4.06초) | 기술 품질은 확보됐다 |
| npm | `causal-lab` 404 | 설치 경로가 없다 |
| 배포 페이지 | `dogskip.github.io/causal-lab` 404 | 시연 경로가 없다 |
| README 첫 문장 | "Verify actual CRDT implementations…" | 결과가 아니라 기능 설명이다 |
| 시연 언어 | `<html lang="ko">` | 글로벌 독자가 진입할 수 없다 |
| 실제 대상 | Yjs 13.6.27 + 자체 OR-Map | 증거 범위가 좁다 |
| 생성기 | put/remove + 마지막 heal | 분할·동시 쓰기를 만들지 않는다 |
| 검사 규칙 | 수렴, 기대 상태 | "수렴했지만 틀림"을 자동으로 찾는 규칙이 없다 |
| 열린 항목 | 1(의존성 자동 갱신 PR) | 외부 보고가 없다 |
| 공개 토론 | 없음(`has_discussions: false`) | 질문·사례가 쌓일 곳이 없다 |

측정 근거는 M12–M15다. 301개 검사는 직접 실행해 확인했다(2026-10-21, `pnpm test`).

## 2. 시장 증거

### 2.1 설치 기반은 크다

| 패키지 | 월간 내려받기 | 별표 | 비고 |
| --- | ---: | ---: | --- |
| `yjs` | 40,188,870 | 22,966 | 사실상 표준 |
| `loro-crdt` | 985,160 | 6,235 | 빠르게 크는 대안 |
| `@automerge/automerge` | 303,790 | 6,675 | JSON형 CRDT |
| `@automerge/automerge-repo` | 137,368 | — | 동기화 계층 |
| `json-joy` | 589,402 | 1,098 | JSON CRDT |
| `tinybase` | 67,220 | 5,197 | 동기화 저장소 |

내려받기 수치는 npm 통계 API의 최근 한 달 값이다(2026-10-21). 별표는 GitHub API 값이다. [M05, M06]

### 2.2 별표는 무엇을 따르는가

| 프로젝트 | 별표 | 성격 | 해석 |
| --- | ---: | --- | --- |
| Yjs | 22,966 | CRDT 라이브러리 | 사용 기반이 별표를 만든다 |
| Automerge | 6,675 | CRDT 라이브러리 | 제품·논문·동기화 도구가 함께 작동했다 |
| Loro | 6,235 | CRDT 라이브러리 | 성능·문서·Rust 구현이 함께 작동했다 |
| TigerBeetle | 17,223 | 데이터베이스 | 제품 자체가 크다 |
| Jepsen | 7,533 | 분산 시스템 검증 | 브랜드와 실제 결함 보고가 만들었다 |
| Maelstrom | 3,731 | 학습용 워크벤치 | "배우는 도구"가 더 넓은 층에 닿았다 |
| Stateright | 1,906 | 모델 검사기 | 깊이 있는 도구의 상단 |
| Turmoil | 1,277 | 결정적 네트워크 시험 | Rust 사용자층에서 사용된다 |
| Madsim | 1,173 | 결정적 시뮬레이터 | 위와 같다 |
| `crdt-benchmarks` | 542 | 성능 비교 | 인용되는 참조 도구의 현실적인 선 |
| AMC | 13 | Automerge 모델 검사 | 기술 깊이만으로는 확산되지 않는다 |

AMC는 특히 중요하다. Automerge의 실제 Rust 코드를 모델 검사하는, 기술적으로 야심찬 도구다. 그 도구가 13개라는 사실은 "검증 기능을 더 잘 만들면 별표가 온다"는 가설을 반증한다. [M06]

2026년에 만든 개발 도구의 상단도 참고가 된다. E2E 시험 프레임워크 `tester-army/e2e`는 11,596개, 부하로 시스템의 한계를 드러내는 학습 도구 `breakscale`은 1,772개, Cloudflare 기반 동기화 엔진 `yaos`는 1,061개다. 공통점은 "무엇을 검사하는가"보다 "무엇을 느끼게 하는가"가 분명하다는 점이다. [M08]

### 2.3 Hacker News에서 무엇이 화제가 됐나

| 글 | 포인트 | 댓글 | 날짜 | 성격 |
| --- | ---: | ---: | --- | --- |
| CRDTs are the future | 1,181 | 312 | 2020-09-28 | 강한 주장의 에세이 |
| An interactive intro to CRDTs | 922 | 130 | 2023-10-04 | 직접 만져보는 학습 |
| Local-first software | 883 | 297 | 2025-07-05 | 개념 에세이 |
| Why we don't use Yjs | 272 | 160 | 2026-03-13 | 실제 도입 경험의 반대 주장 |

이 표의 교훈은 분명하다. 도구 공지보다 **주장이 있는 글**과 **직접 만져보는 학습**이 앞선다. 이 프로젝트의 출시 글은 "기능 목록"이 아니라 "수렴은 정답이 아니다"라는 주장이어야 한다. [M02, M04]

### 2.4 가장 강한 인용

Moment의 2026년 글은 이 프로젝트의 존재 이유를 대신 말해 준다.

> "Definitionally, the state is only guaranteed to converge. So how do you even know if something is transiently diverged, or simply incorrect? Of course, you can't. Not really."
>
> — Moment, *Lies I was told about collaborative editing, Part 2*, 2026-03-13 [M03]

번역하면 "정의상 보장되는 것은 수렴뿐이다. 그러면 무엇이 일시적으로 갈라진 것인지, 아니면 그냥 틀린 것인지 어떻게 아는가. 사실상 알 수 없다"이다. 이 문장은 공격이 아니라 시장 조사다. 이 프로젝트는 이 문장에 "알 수 있다. 재생 가능한 증거가 여기 있다"고 답해야 한다.

### 2.5 빈 자리와 경고

GitHub에서 `crdt fuzz`로 찾으면 10개, `crdt invariant`로 찾으면 6개다. 그중 검증 전용 도구는 사실상 없고, 검색 결과는 노트 앱이나 부품 수준이다. [M07] 학계에는 Isabelle/HOL 증명과 Katara 합성 같은 설계 검증이 있지만, 이는 배포된 라이브러리를 실제 장애 순서로 시험하는 도구가 아니다. [M17]

빈 자리는 기회이자 경고다. 아무도 만들지 않았다는 것은 아무도 찾지 않는다는 뜻일 수도 있다. 그래서 이 계획은 "검증 도구"가 아니라 "손실된 쓰기를 찾는 도구"로 말한다. 후자는 훨씬 많은 사람이 자기 문제로 인식한다.

## 3. 글로벌 채널 판정

### 3.1 핵심 다섯 곳

| 곳 | 이 제품에 맞나 | 판단 |
| --- | --- | --- |
| GitHub Trending | 결과이지 채널이 아니다 | 제출할 수 없다. 단기 급증의 결과로만 나타난다 |
| Hacker News | 최우선 | CRDT·local-first 주제가 270–1,180포인트를 받았다. 문제를 정면으로 다룬다 |
| Reddit | 선택 | r/programming은 홍보에 엄격하다. 기술 에세이만 시도한다. r/selfhosted·r/LocalLLaMA는 맞지 않는다 |
| Product Hunt | 낮음 | 소비자·메이커 제품 위주다. CLI 도구의 전환을 기대하기 어렵다 |
| Hugging Face | 없음 | 모델·스페이스·데이터셋이 아니다 |

### 3.2 채널 전체 판정

| 채널 | 실제 성격 | 적합도 | 판단 |
| --- | --- | --- | --- |
| Show HN / HN 프론트 | 기술 토론 | 높음 | 출시의 중심. 주장이 있는 글과 함께 간다 |
| Lobsters | 초대제 기술 토론 | 높음 | 양은 적지만 정확한 독자. 출시 다음 날 시도 |
| r/programming | 대형 기술 토론 | 중간 | 저장소 홍보가 아니라 "수렴은 정답이 아니다" 글만 올린다 |
| r/opensource | 작은 오픈소스 토론 | 중간 | 출시 후 사례 공유에 적합 |
| r/selfhosted, r/homelab | 셀프호스팅 | 없음 | 이 제품은 서비스가 아니다 |
| r/LocalLLaMA | LLM | 없음 | CRDT와 무관하다 |
| r/SideProject, Indie Hackers | 개인 제작 | 낮음 | 소비자 제품 독자다. 우선순위 낮음 |
| Product Hunt | 제품 발견 | 낮음 | 시도할 수는 있지만 준비 비용 대비 전환이 낮다 |
| Hugging Face | 모델·데이터셋 | 없음 | 해당 없음 |
| whatstrending.ai | AI/ML 별표 순위 | 없음 | 2,256개 AI 저장소만 다룬다. 측정 사이트이지 채널이 아니다 |
| offhype.dev | AI를 제외한 신규 저장소 | 낮음 | 별표 순위다. 성공한 뒤에 나타난다 |
| findarepo.com | 7일 증가량 순위 | 낮음 | 10,000개 이상을 추적하는 측정 사이트다. 제출 채널이 아니다 |
| GitHub topic·awesome 목록 | 지속 발견 | 높음 | `awesome-crdt`, `awesome-local-first`에 등재한다 |
| npm | 설치 경로 | 필수 | 발견 채널은 아니지만 전환의 전제다 |
| GitHub Actions Marketplace | 자동 검사 | 중간 | 출시 후 CI 사용자를 만든다 |
| localfirst.fm / local-first 사용자 모임 | 정확한 독자 | 높음 | 문제를 이미 아는 사람들이 모인다 |
| Yjs·Loro·Automerge 토론 | 유지관리자·사용자 | 높음 | 사례를 들고 찾아간다. 홍보가 아니라 검토 요청으로 |
| GeekNews(한국) | 한국 HN | 높음 | 사용자 목록에 없지만 한국에서 가장 정확한 채널이다 |
| OKKY·velog(한국) | 국내 개발자 | 중간 | 한국어 글은 여기서 재활용한다 |
| Qiita·Zenn(일본) | 일본 개발자 | 중간 | 일본어 기술 글 한 편이면 충분하다 |
| Juejin·Gitee·OSChina(중국) | 중국 개발자 | 낮음 | 중국어 문서와 현지 담당이 없으면 효과가 없다 |
| dev.to·Hashnode | 블로그 재배포 | 중간 | 같은 글을 복제해 검색 유입을 만든다 |
| Changelog·JS Weekly·Node Weekly | 뉴스레터 | 중간 | 보고서가 나온 뒤에 투고한다 |
| YouTube | 영상 | 조건부 | 60초 시연 영상이 먼저다. 대형 채널보다 작은 채널·직접 게시 |
| AlternativeTo·OpenSourceAlternative | 대체재 목록 | 없음 | "무엇의 대체재"인지 성립하지 않는다 |
| awesome-selfhosted | 셀프호스팅 목록 | 없음 | 서비스가 아니다 |
| CNCF Landscape | 클라우드 인프라 | 없음 | 해당 없음 |
| 재단·연간 보고서 | 구조 분석 | 없음 | 출시 채널이 아니다. 맥락 자료로만 |

이 표의 결론은 "목록이 길다고 채널이 많은 것이 아니다"이다. 실제로 시도할 곳은 다섯 개 안쪽이다. Hacker News, Lobsters, local-first 사용자 모임, Yjs·Loro·Automerge 토론, GeekNews다. 나머지는 같은 글의 재배포 또는 측정이다.

### 3.3 사용자 목록에 없던 채널

- **GeekNews(news.hada.io)**: 한국의 Hacker News다. CRDT·local-first 주제가 영어권보다 늦게 도착하므로, 한국어 설명이 있으면 "아직 모르는 것"을 먼저 보여줄 수 있다.
- **GitHub Actions Marketplace**: 검증 도구의 자연스러운 배포 지점이다. "동기화 시험을 CI에 넣는다"는 사용 장면이 저장소 방문보다 오래 남는다.
- **awesome-crdt / awesome-local-first**: 별표보다 오래가는 유입이다. 등재 기준을 지켜야 하므로 홍보 문구가 아니라 설명을 적는다.
- **localfirst.fm 사용자 모임**: 문제를 이미 아는 사람이 모인다. 팟캐스트 출연은 보고서가 나온 뒤에 요청한다.

### 3.4 목록의 나머지 사이트

사용자가 제시한 목록에는 순위·모멘텀 사이트가 많다. 이 제품에 대한 판정은 다음과 같다. 모두 2026-10-21에 직접 열어 성격을 확인했다.

| 묶음 | 사이트 | 판정 |
| --- | --- | --- |
| 순위·모멘텀 | [GitStar](https://gitstar.space), [EvanLi/Github-Ranking](https://github.com/EvanLi/Github-Ranking), [yuxiaopeng/Github-Ranking-AI](https://github.com/yuxiaopeng/Github-Ranking-AI), [OpenGithubs daily-rank](https://github.com/OpenGithubs/github-daily-rank), [trending-collection](https://github.com/hanishrao/trending-collection), [github-trending-archive](https://github.com/jigexiansen/github-trending-archive), [oss-pulse](https://github.com/ErcinDedeoglu/oss-pulse) | 측정·기록이다. 제출 채널이 아니다. 출시 후 7일 증가량을 확인하는 데만 사용한다 |
| 꾸러미 채택 | [libraries.io](https://libraries.io), [npm trends](https://npmtrends.com), [PyPI Stats](https://pypistats.org), [pepy.tech](https://pepy.tech), [crates.io](https://crates.io), [Packagist](https://packagist.org) | npm·crates.io는 배포 경로다. 나머지는 사후 측정이다. 이 제품은 npm 하나면 충분하다 |
| 언어·시장 맥락 | [TIOBE](https://www.tiobe.com/tiobe-index), [PYPL](https://pypl.github.io/PYPL.html), [Stack Overflow Survey](https://survey.stackoverflow.co), [GitHub Octoverse](https://github.blog/news-insights/octoverse) | 의사결정의 맥락 자료다. 출시 채널이 아니다 |
| 대체재·카탈로그 | [AlternativeTo](https://alternativeto.net), [OpenSourceAlternative.to](https://www.opensourcealternative.to), [Slant](https://www.slant.co), [SourceForge](https://sourceforge.net), [FossHub](https://www.fosshub.com), [F-Droid](https://f-droid.org), [Flathub](https://flathub.org), [CNCF Landscape](https://landscape.cncf.io) | "무엇의 대체재"인지 성립하지 않는다. F-Droid·Flathub는 앱, CNCF는 클라우드 인프라다 |
| 모델·에이전트 | [Hugging Face](https://huggingface.co), [Ollama](https://ollama.com/library), MCP 서버 목록, Discord, X | 해당 없음. 모델도 MCP 서버도 아니다. X는 소식 전달용으로만 |
| awesome 목록 | [awesome-crdt](https://github.com/alangibson/awesome-crdt), [awesome-local-first](https://github.com/alexanderop/awesome-local-first), [sindresorhus/awesome](https://github.com/sindresorhus/awesome) | 등재 가치가 있다. 별표보다 오래가는 유입이다 |

핵심은 "측정 사이트를 출시 채널로 착각하지 않는 것"이다. findarepo·offhype·whatstrending은 성공한 뒤에 나타난다. 이 제품은 그 전에 HN·Lobsters·사용자 모임에서 시작해야 한다.

### 3.5 국가별 판정

| 권역 | 시도할 곳 | 판단 |
| --- | --- | --- |
| 한국 | GeekNews, OKKY, velog, 클리앙 개발한당 | 높음. GeekNews가 우선. 한국어 글은 여기서 재배포한다 |
| 일본 | Qiita, Zenn, connpass, はてなブックマーク | 중간. 일본어 기술 글 한 편이면 충분하다 |
| 중국 | Gitee, 掘金, OSChina, V2EX, SegmentFault, ModelScope | 낮음. 중국어 문서와 현지 담당이 없으면 효과가 없다 |
| 인도 | r/developersIndia, IndiaFOSS, Hasgeek, FOSS United | 낮음~중간. 영어 글이면 시도할 수 있다 |
| 미국·영국·호주·캐나다 | HN, Lobsters, Reddit, Product Hunt, Meetup | 높음~중간. 글로벌 채널이 곧 현지 채널이다 |
| 독일·네덜란드·북유럽 | heise, Golem, t3n, Tweakers, FSFE, Joinup | 낮음. 현지어 글이 없으면 어렵다 |
| 프랑스 | LinuxFr, Journal du Hacker, Developpez, Korben | 낮음. 같은 이유다 |
| 브라질·중남미 | TabNews, Dev.to(pt), Alura, Telegram | 낮음. 현지어·현지 담당이 필요하다 |
| 러시아·동유럽 | Habr, VC.ru, DOU.ua, 4programmers | 낮음. 지정학·언어 장벽이 있다 |
| 동남아 | Dicoding, Tech in Asia, KompasTekno, Telegram | 낮음. 이 제품의 독자 밀도가 낮다 |
| 스페인·이탈리아·터키 | Genbeta, MuyLinux, HTML.it, Donanımhaber | 낮음. 현지어 글 없이는 닿지 않는다 |
| 대만·싱가포르 | iThome, PTT Soft_Job, HardwareZone | 낮음. 규모가 작다 |

국가별 채널은 "번역이 있으면 1곳, 없으면 0곳"으로 정리한다. 20개국에 한꺼번에 배포하는 방식은 이 제품에 맞지 않는다.

### 3.6 실전 루틴과 영상

주간 루틴은 다음 다섯 줄이면 충분하다.

1. HN 첫 화면과 Show HN에서 CRDT·local-first·동기화 관련 글을 확인한다.
2. Lobsters의 기술 글 목록을 확인한다.
3. local-first 사용자 모임과 Yjs·Loro·Automerge 토론에서 새 문제를 확인한다.
4. npm 내려받기와 7일 별표 증가량을 기록한다.
5. 한국어 채널(GeekNews) 한 곳을 확인한다.

매일 GitHub Trending을 보는 루틴은 이 제품에는 필요 없다. 트렌딩은 결과이지 입력이 아니다.

YouTube는 채널 목록이 아니라 배포 형식이다. 이 제품에 필요한 영상은 하나다. 60초 안에 "분할 → 동시 쓰기 → 복구 → 사라진 값"을 보여 주는 화면 녹화다. 큰 채널(Fireship, Theo, ThePrimeagen)은 이미 화제가 된 뒤에 접근한다. 처음부터 이들을 상대로 홍보하는 것은 시간 낭비다.

## 4. 수용자 사다리

| 층 | 규모 | 원하는 것 | 이 제품이 주는 것 | 별표 기여 |
| --- | --- | --- | --- | --- |
| CRDT 라이브러리 유지관리자 | 수십 명 | 최소 실패 사례, 정확한 버전 | 재생 가능한 기록 묶음 | 신뢰 |
| Yjs·Loro·Automerge를 사용하는 앱 개발팀 | 수천~수만 | 내 앱의 동기화 손실 | 연결기, 검사, CI | 사용 |
| 분산 시스템 학습자 | 수십만 | 눈으로 보는 원리 | 시연, 보고서, 시간축 | 확산 |

별표는 3층에서 오고, 신뢰는 1층에서 오고, 사용은 2층에서 온다. 지금 저장소는 1층에게만, 그것도 한국어 시연과 규격 문서로 말한다. 2층과 3층이 들어올 문이 없다.

## 5. 현실적인 상한

이 범주에서 "완벽하게 인기를 끄는" 설계는 없다. 근거가 허락하는 범위는 다음과 같다.

| 수준 | 별표 | 조건 |
| --- | ---: | --- |
| 하한 | 30–100 | 출시 후 2주. 도달 가능성만 고쳐도 가능 |
| 기본 | 300–800 | 6개월. 첫 사례와 보고서가 실제로 인용될 때 |
| 상한 | 1,500–3,000 | 12–24개월. 보고서가 참조 자료가 되고 유지관리자가 인용할 때 |

AMC의 13개는 "검증기를 더 잘 만들면"의 결과다. `crdt-benchmarks`의 542개는 "쓸모 있는 참조 도구"의 결과다. Maelstrom의 3,731개는 "배우는 도구"의 결과다. 이 프로젝트가 3,000개를 넘으려면 검증기가 아니라 학습·참조 자료가 되어야 한다. 그렇지 않으면 500개 안팎이 현실적인 상한이다. [M06]

별표 1만 개를 목표로 한다면 이 범주가 아니다. 그때는 제품을 바꿔야 한다. 예를 들어 "로컬퍼스트 앱의 동기화 문제를 잡는 개발자 도구"로 넓히거나, "여러 에이전트가 공유하는 기억의 일관성"으로 인접 시장을 노릴 수 있다. 다만 후자는 아직 근거가 없다. 이 문서는 그 확장을 권하지 않는다.

## 6. 이 계획을 반증하는 신호

| 시점 | 신호 | 해석 |
| --- | --- | --- |
| 출시 2주 | 하루 별표 20개 미만, 주간 npm 내려받기 100회 미만 | 문안이나 채널이 틀렸다 |
| 출시 30일 | 외부에서 보낸 기록 묶음 0건 | 연결 비용이 너무 높다 |
| 출시 30일 | "그건 문서화된 동작이다"라는 유지관리자 반응 | "결함"이 아니라 "함정"으로 말을 바꾼다 |
| 출시 60일 | 설계 파트너가 두 번째 실행을 하지 않음 | CI 가치가 약하다 |
| 출시 60일 | 시연 방문은 많은데 설치가 없음 | 구경하는 재미와 사용하는 이유가 다르다 |
| 6개월 | 보고서 인용 0건 | 참조 자료가 되지 못했다. 범위를 좁힌다 |

이 신호를 미리 정해 두는 이유는, 실패했을 때 "홍보가 부족했다"는 막연한 결론을 피하기 위해서다.

## 7. 원자료

| ID | 원자료·조회일 | 사용한 사실 |
| --- | --- | --- |
| M01 | [GitHub Trending](https://github.com/trending), 2026-10-21 | 일·주·월 및 언어별 순위. 제출 기능 없음 |
| M02 | [HN Algolia API](https://hn.algolia.com/api), 2026-10-21 | CRDT·local-first·Yjs 검색 결과의 포인트·댓글·날짜 |
| M03 | [Moment, Lies I was told… Part 2](https://www.moment.dev/blog/lies-i-was-told-pt-2), 2026-10-21 | "Definitionally… you can't. Not really." 및 Yjs 도입 경험 |
| M04 | [HN 24617542](https://news.ycombinator.com/item?id=24617542), [37764581](https://news.ycombinator.com/item?id=37764581), [44473135](https://news.ycombinator.com/item?id=44473135), [47359712](https://news.ycombinator.com/item?id=47359712), 2026-10-21 | 1,181/312, 922/130, 883/297, 272/160 |
| M05 | [npm downloads API](https://api.npmjs.org/downloads/point/last-month/yjs), 2026-10-21 | yjs 40,188,870; loro-crdt 985,160; @automerge/automerge 303,790 등 |
| M06 | [GitHub REST API](https://api.github.com/repos/yjs/yjs), 2026-10-21 | 저장소별 별표·설명·생성일. Yjs 22,966, AMC 13, Jepsen 7,533 등 |
| M07 | [GitHub 검색: crdt fuzz](https://github.com/search?q=crdt+fuzz&type=repositories), [crdt invariant](https://github.com/search?q=crdt+invariant&type=repositories), 2026-10-21 | 10건·6건. 검증 전용 도구의 부재 |
| M08 | [GitHub 검색: 2026년 생성 저장소](https://github.com/search?q=testing+in%3Adescription+created%3A%3E2026-01-01&type=repositories), 2026-10-21 | e2e 11,596; breakscale 1,772; yaos 1,061 |
| M09 | [whatstrending.ai/repos](https://whatstrending.ai/repos), 2026-10-21 | 2,256개 AI/ML 저장소, 별표·신뢰 점수 순위 |
| M10 | [offhype.dev](https://offhype.dev/), 2026-10-21 | 주간 1위 16k Android debloat. AI 잡음 제거, 별표 순위 |
| M11 | [findarepo.com](https://findarepo.com/), 2026-10-21 | 10,000개 이상 추적, 7일 증가량, 649 MCP 서버, 141 Claude 도구 |
| M12 | [dogskip/causal-lab API](https://api.github.com/repos/dogskip/causal-lab), 2026-10-21 | 0·0·0, 2026-07-18 생성, 2026-10-14 푸시, 1 open |
| M13 | [npm registry: causal-lab](https://registry.npmjs.org/causal-lab), 2026-10-21 | 404 |
| M14 | [dogskip.github.io/causal-lab](https://dogskip.github.io/causal-lab/), 2026-10-21 | 404 |
| M15 | `README.md`, `package.json`, `src/verify/generate.ts`, `src/verify/checks.ts`, `src/adapters/`, `web/index.html`, `git rev-list --count HEAD`, `pnpm test`, 2026-10-21 | 현재 표면·생성기·검사·시연 언어·301개 검사 |
| M16 | [localfirst.fm](https://localfirst.fm), 2026-10-21 | 팟캐스트·사용자 모임·회의 |
| M17 | [Gomes et al., Verifying SEC](https://arxiv.org/abs/1707.01747), [Katara](https://arxiv.org/html/2205.12425v2), 2026-10-21 | 설계 검증·합성. 배포 라이브러리 시험 도구가 아님 |
| M18 | [Yjs issue #699](https://github.com/yjs/yjs/issues/699), 2026-10-21 | 2025-03-17 이후 열린 "possible corruption from UndoManager" |
| M19 | [GitHub topic: crdt](https://github.com/topics/crdt), 2026-10-21 | 1,259개 저장소. 주제 태그의 크기 |
| M20 | `.github/workflows/pages.yml`, `.github/workflows/ci.yml`, 2026-10-21 | 배포는 수동, CI는 린트·타입·빌드·검사 |
| M21 | npm registry 이름 조회, GitHub 이름 검색, 2026-10-21 | `crdt-fuzz`·`syncfuzz` 사용 가능(404), `crdt-fuzz` 저장소 0건, `divergence` 사용 중(200) |
| M22 | [GitHub 검색: automerge model checker](https://github.com/search?q=automerge+model+checker&type=repositories), 2026-10-21 | AMC 13개 |
| M23 | [GeekNews](https://news.hada.io), 2026-10-21 | 한국의 기술 뉴스·토론 사이트. 한국어 공개 채널 |

## 8. 이 문서가 하지 않는 주장

- 이 시장의 크기를 금액으로 환산하지 않는다. 근거가 없다.
- "이렇게 하면 반드시 인기를 끈다"고 말하지 않는다. 그런 설계는 없다.
- 경쟁 제품의 능력을 이 문서만으로 평가하지 않는다. 별표와 내려받기 수는 사용 규모의 대리 지표일 뿐이다.
- 기술적 합격 조건은 `.planning/PROJECT.md`와 `.planning/DESIGN.md`가 정본이다. 이 문서는 그 조건을 바꾸지 않는다.

## 관련 문서

- [GROWTH.md](GROWTH.md): 이 조사의 결론을 제품 이름·첫 화면·출시 일정으로 옮긴 문서
- [REFACTOR.md](REFACTOR.md): 그 출시를 받치도록 코드 구조를 바꾸는 설계
- [PROJECT.md](PROJECT.md), [DESIGN.md](DESIGN.md): 범위와 기술 조건의 정본

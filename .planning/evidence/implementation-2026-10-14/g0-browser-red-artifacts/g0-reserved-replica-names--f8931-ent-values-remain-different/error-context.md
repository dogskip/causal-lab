# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: g0.spec.ts >> reserved replica names are visible and different values remain different
- Location: e2e/g0.spec.ts:38:1

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: locator('#state-table tr').first().locator('td')
Timeout: 5000ms
- Expected  - 1
+ Received  + 0

  Array [
    "key",
-   "__proto__",
    "b",
  ]

Call log:
  - Expect "toHaveText" locator('#state-table tr').first().locator('td') with timeout 5000ms
  - waiting for locator('#state-table tr').first().locator('td')
    14 × locator resolved to 2 elements

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - heading "Causal Lab" [level=1] [ref=e2]
  - paragraph [ref=e3]: 분할 · 지연 · 손실 · 중복 · 재정렬을 겪은 뒤에도 복제본들이 같은 값으로 모이는지 재생한다. 관찰-제거 맵(OR-Map) 구현이고, 가상 시간만 쓰며 서버와 네트워크를 쓰지 않는다. 같은 시나리오는 어디서나 같은 결과를 낸다.
  - paragraph [ref=e4]:
    - link "실험" [ref=e5] [cursor=pointer]:
      - /url: "#stories"
    - link "재생" [ref=e6] [cursor=pointer]:
      - /url: "#replay"
    - link "복제본 상태" [ref=e7] [cursor=pointer]:
      - /url: "#state"
    - link "영수증" [ref=e8] [cursor=pointer]:
      - /url: "#receipt"
    - link "시나리오 편집" [ref=e9] [cursor=pointer]:
      - /url: "#editor"
  - separator [ref=e10]
  - heading "실험" [level=2] [ref=e11]
  - list [ref=e12]:
    - listitem [ref=e13]:
      - button "분할 → 복구" [ref=e14]
      - text: 한쪽이 끊긴 사이에 쓴 값이, 복구하면 반대편에도 도착합니다. 패킷 25% 손실·50% 중복을 견딥니다.
      - code [ref=e15]: examples/partition-heal.json
    - listitem [ref=e16]:
      - button "동시 쓰기 보존" [ref=e17]
      - text: 두 복제본이 같은 키를 동시에 씁니다. 마지막 쓰기가 이기는 대신 두 값이 모두 남습니다.
      - code [ref=e18]: examples/concurrent-put.json
    - listitem [ref=e19]:
      - button "관찰된 제거" [ref=e20]
      - text: 지운 값은 사라지고, 지운 뒤 다른 복제본이 쓴 값은 살아남습니다.
      - code [ref=e21]: examples/observed-remove.json
    - listitem [ref=e22]:
      - button "중복 도착" [ref=e23]
      - text: 모든 메시지가 두 번씩 도착합니다. 그래도 상태는 한 번 받은 것과 같습니다.
      - code [ref=e24]: examples/duplicates.json
    - listitem [ref=e25]:
      - button "5복제본 전파" [ref=e26]
      - text: 한 번의 쓰기가 다섯 복제본으로 퍼집니다. 한 링크가 끊겨 있어도 복구 후 모두 같은 값입니다.
      - code [ref=e27]: examples/fan-out.json
    - listitem [ref=e28]:
      - button "3복제본 + 패킷 손실" [ref=e29]
      - text: 셋이 각자 다르게 읽던 상태가, 복구 후에는 모두 같은 값으로 모입니다.
      - code [ref=e30]: examples/three-replica-drop.json
  - separator [ref=e31]
  - heading "재생" [level=2] [ref=e32]
  - paragraph [ref=e33]:
    - button "처음" [ref=e34]
    - button "재생" [ref=e35]
    - button "다음 사건" [ref=e36]
    - text: 속도
    - combobox [ref=e37]:
      - option "0.5×"
      - option "1×" [selected]
      - option "2×"
    - slider "시간 이동" [ref=e38]: "0"
    - status [ref=e39]: t=0
  - paragraph [ref=e40]: 복제본들이 같은 값을 가지고 있습니다
  - paragraph [ref=e41]: 2건의 쓰기·제거 · 전달 0건
  - paragraph [ref=e42]: __proto__ k = left (t=0) → b k = right (t=0)
  - paragraph [ref=e43]: 쓰기·제거 2 · 전송 대기 0 · 도착 0 · 보류 0 · 손실 2
  - paragraph [ref=e45]: 표시 — ● 로컬 쓰기 · ─ 도착 · ┄ 손실 · ┈ 보류 · 연한 상자 분할 구간
  - paragraph
  - paragraph [ref=e46]: 타임라인을 클릭하면 그 사건을 설명한다. 단축키 Space 재생/정지 · ← → 사건 이동 · Home End 처음/끝.
  - separator [ref=e47]
  - heading "복제본 상태" [level=2] [ref=e48]
  - table [ref=e49]:
    - rowgroup [ref=e50]:
      - row [ref=e51]:
        - cell "key" [ref=e52]
        - cell "b" [ref=e53]
    - rowgroup [ref=e54]:
      - row [ref=e55]:
        - cell "k" [ref=e56]
        - cell "right" [ref=e57]
  - separator [ref=e58]
  - heading "영수증" [level=2] [ref=e59]
  - generic [ref=e60]:
    - term [ref=e61]: 결과
    - definition [ref=e62]: 수렴
    - term [ref=e63]: 화면
    - definition [ref=e64]: t=0 · 복제본 값 동일
    - term [ref=e65]: 사건
    - definition [ref=e66]: 0건 처리
    - term [ref=e67]: 시나리오
    - definition [ref=e68]: 직접 편집
    - term [ref=e69]: 영수증
    - definition [ref=e70]: 8721d122bd2e130b171ad6dbccb3480c7be82fcaffc3a42e1ce23c7ff725ba08
  - paragraph [ref=e71]: 같은 시나리오면 어디서나 같은 영수증 id가 나온다. 마지막 쓰기가 이기는 일반 저장소라면 동시에 쓴 값 중 하나가 사라진다.
  - separator [ref=e72]
  - group [ref=e73]:
    - generic "시나리오 편집" [ref=e74] [cursor=pointer]
    - paragraph [ref=e75]:
      - text: 복제본(쉼표)
      - textbox [ref=e76]: __proto__,b
      - text: seed
      - textbox [ref=e77]: "19"
      - text: minLatency
      - textbox [ref=e78]: "5"
      - text: maxLatency
      - textbox [ref=e79]: "5"
      - text: dropRate
      - textbox [ref=e80]: "1"
      - text: duplicateRate
      - textbox [ref=e81]: "0"
    - paragraph [ref=e82]:
      - text: 동작
      - combobox [ref=e83]:
        - option "put" [selected]
        - option "remove"
        - option "partition"
        - option "heal"
      - text: at
      - spinbutton [ref=e84]: "0"
      - text: replica
      - textbox [ref=e85]: a
      - text: left
      - textbox [ref=e86]: a
      - text: right
      - textbox [ref=e87]: b
      - text: key
      - textbox [ref=e88]: mode
      - text: value
      - textbox [ref=e89]: safe
      - button "스텝 추가" [ref=e90]
    - table [ref=e92]:
      - rowgroup [ref=e93]:
        - row [ref=e94]:
          - cell "1" [ref=e95]
          - cell [ref=e96]:
            - spinbutton [ref=e97]: "0"
          - cell "put" [ref=e98]
          - cell "__proto__ k = left" [ref=e99]
          - cell [ref=e100]:
            - button "삭제" [ref=e101]
        - row [ref=e102]:
          - cell "2" [ref=e103]
          - cell [ref=e104]:
            - spinbutton [ref=e105]: "0"
          - cell "put" [ref=e106]
          - cell "b k = right" [ref=e107]
          - cell [ref=e108]:
            - button "삭제" [ref=e109]
    - paragraph [ref=e110]:
      - text: JSON 파일 열기
      - button "Choose File" [ref=e111]
      - button "시나리오 내려받기" [ref=e112]
      - button "영수증 id 복사" [ref=e113]
    - alert
  - separator [ref=e114]
  - paragraph [ref=e115]: 용어 — 분할 partition · 복구 heal · 보류 held · 손실 dropped · 복제본 replica · 영수증 receipt
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | import type { Mermaid } from "mermaid";
  3  | import { traceToMermaid } from "../src/trace.js";
  4  | 
  5  | const config = { replicas: ["a", "b"], seed: 19, minLatency: 5, maxLatency: 5, dropRate: 0, duplicateRate: 0 };
  6  | const consoleErrors = new WeakMap<object, string[]>();
  7  | test.beforeEach(async ({ page }) => {
  8  |   const errors: string[] = [];
  9  |   consoleErrors.set(page, errors);
  10 |   page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  11 |   page.on("pageerror", (error) => { errors.push(error.message); });
  12 |   await page.goto("/");
  13 |   await expect(page.locator("#stories button")).toHaveCount(6);
  14 |   await page.locator("#editor").evaluate((node) => { (node as HTMLDetailsElement).open = true; });
  15 |   test.info().annotations.push({ type: "headless", description: "true; Playwright CLI" });
  16 | });
  17 | test.afterEach(async ({ page }) => { expect(consoleErrors.get(page)).toEqual([]); });
  18 | 
  19 | test("state follows the actual delivery at time five", async ({ page }) => {
  20 |   await page.locator("#file-input").setInputFiles({ name: "delivery.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ config, steps: [{ at: 0, action: "put", replica: "a", key: "k", value: "v" }, { at: 10, action: "heal" }] })) });
  21 |   await expect(page.locator("#clock")).toHaveText("t=15");
  22 |   await page.locator("#scrub").evaluate((node) => { (node as HTMLInputElement).value = "5"; node.dispatchEvent(new Event("input", { bubbles: true })); });
  23 |   await expect(page.locator("#clock")).toHaveText("t=5");
  24 |   const row = page.locator("#state-table tr").nth(1);
  25 |   await expect(row.locator("td")).toHaveText(["k", "v", "v"]);
  26 |   await page.screenshot({ path: test.info().outputPath("delivery-state.png"), fullPage: true });
  27 | });
  28 | 
  29 | test("the initial screen does not contain a future command", async ({ page }) => {
  30 |   await page.locator("#file-input").setInputFiles({ name: "future.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ config, steps: [{ at: 10, action: "put", replica: "a", key: "future", value: "later" }] })) });
  31 |   await expect(page.locator("#clock")).toHaveText("t=15");
  32 |   await page.locator("#restart").click();
  33 |   await expect(page.locator("#clock")).toHaveText("t=0");
  34 |   await expect(page.locator("#state-table")).not.toContainText("later");
  35 |   await page.screenshot({ path: test.info().outputPath("initial-state.png"), fullPage: true });
  36 | });
  37 | 
  38 | test("reserved replica names are visible and different values remain different", async ({ page }) => {
  39 |   await page.locator("#file-input").setInputFiles({ name: "membership.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ config: { ...config, replicas: ["__proto__", "b"], dropRate: 1 }, steps: [{ at: 0, action: "put", replica: "__proto__", key: "k", value: "left" }, { at: 0, action: "put", replica: "b", key: "k", value: "right" }] })) });
> 40 |   await expect(page.locator("#state-table tr").first().locator("td")).toHaveText(["key", "__proto__", "b"]);
     |                                                                       ^ Error: expect(locator).toHaveText(expected) failed
  41 |   await expect(page.locator("#state-table")).toContainText("left");
  42 |   await expect(page.locator("#state-table")).toContainText("right");
  43 |   await expect(page.locator("#verdict")).toContainText("미수렴");
  44 | });
  45 | 
  46 | test("the real Mermaid parser preserves sender and receiver", async ({ page }) => {
  47 |   const source = traceToMermaid([{ sequence: 1, time: 5, kind: "delivered", from: "a", to: "b", operation: "a:1" }]);
  48 |   const messages = await page.evaluate(async (text) => {
  49 |     const path = "/__mermaid/mermaid.esm.min.mjs";
  50 |     const module = await import(path) as { default: Mermaid };
  51 |     module.default.initialize({ startOnLoad: false, securityLevel: "strict" });
  52 |     const diagram = await module.default.mermaidAPI.getDiagramFromText(text);
  53 |     const db = diagram.db as { getMessages(): { from: string; to: string; message: string }[] };
  54 |     return db.getMessages().map(({ from, to, message }) => ({ from, to, message }));
  55 |   }, source);
  56 |   expect(messages).toEqual([{ from: "a", to: "b", message: "deliver a:1 (t=5)" }]);
  57 | });
  58 | 
```
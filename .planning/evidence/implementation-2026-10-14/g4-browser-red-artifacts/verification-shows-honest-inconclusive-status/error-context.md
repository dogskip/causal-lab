# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: verification.spec.ts >> shows honest inconclusive status
- Location: e2e/verification.spec.ts:13:45

# Error details

```
Error: page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at http://127.0.0.1:48123/verification.html
Call log:
  - navigating to "http://127.0.0.1:48123/verification.html", waiting until "load"

```

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 3

- Array []
+ Array [
+   "Failed to load resource: the server responded with a status of 404 ()",
+ ]
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e6]:
    - heading "127.0.0.1 페이지를 찾을 수 없음" [level=1] [ref=e7]
    - paragraph [ref=e9]:
      - text: 다음 웹 주소(
      - strong [ref=e10]: http://127.0.0.1:48123/verification.html
      - text: )에 대해 발견된 웹페이지가 없습니다.
    - generic [ref=e11]: HTTP ERROR 404
  - button "새로고침" [ref=e14] [cursor=pointer]
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | import { createBuiltinContext } from '../src/node/registry.js';
  3  | import { executeVerification } from '../src/verify/runtime.js';
  4  | import { jcs } from '../src/verify/json.js';
  5  | function fixture(mode='passed'){
  6  |  const definition={format_version:2,model_id:'yjs-map',profile:'independent-updates',replicas:['a','b'],bootstrap:{a:{clientID:1,guid:'ui',values:{start:'initial'}},b:{clientID:2,guid:'ui',values:{}}},seed:9,network:{minLatency:0,maxLatency:0,dropRate:0,duplicateRate:0},steps:mode==='inconclusive'?[]:[{at:0,action:'command',replica:'a',command:{action:'put',key:'k',value:'<script>unsafe</script>'}},{at:0,action:'heal'}],checks:[{id:'convergence',parameters:null},...(mode==='failed'?[{id:'expected-state',parameters:{state:{wrong:true}}}]:[])]};
  7  |  return executeVerification(definition,createBuiltinContext(definition));
  8  | }
  9  | const errors:string[]=[];
  10 | test.beforeEach(async({page})=>{errors.length=0;page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});await page.goto('/verification.html');});
> 11 | test.afterEach(()=>expect(errors).toEqual([]));
     |                                   ^ Error: expect(received).toEqual(expected) // deep equality
  12 | test('imports a verified file, shows actual initial state and exact same-time events',async({page})=>{const requests:string[]=[];page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:48123/'))requests.push(request.url());});const bundle=fixture();await page.getByLabel('검증 파일').setInputFiles({name:'result.json',mimeType:'application/json',buffer:Buffer.from(jcs(bundle))});await expect(page.locator('#verification-status')).toHaveText('통과');await expect(page.locator('#verification-states')).toContainText('initial');await expect(page.locator('#verification-states')).not.toContainText('unsafe');await page.getByRole('button',{name:'다음 사건'}).click();await expect(page.locator('#verification-states')).toContainText('<script>unsafe</script>');await expect(page.locator('#verification-event')).toContainText('시각 0');await page.getByRole('button',{name:'최종 상태'}).click();await expect(page.locator('#verification-states')).toContainText('"b"');await expect(page.locator('#verification-states')).toContainText('unsafe');expect(requests).toEqual([]);});
  13 | for(const mode of ['failed','inconclusive'])test(`shows honest ${mode} status`,async({page})=>{await page.getByLabel('검증 파일').setInputFiles({name:mode+'.json',mimeType:'application/json',buffer:Buffer.from(jcs(fixture(mode)))});await expect(page.locator('#verification-status')).toHaveText(mode==='failed'?'실패':'판정 불가');if(mode==='failed')await expect(page.locator('#verification-checks')).toContainText('expected-state');});
  14 | test('clears a previous result and refuses tampered files',async({page})=>{await page.getByLabel('검증 파일').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(jcs(fixture()))});await page.getByLabel('검증 파일').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(jcs({...fixture(),run_id:'0'.repeat(64)}))});await expect(page.locator('#verification-error')).toContainText('파일');await expect(page.locator('#verification-result')).toBeHidden();await page.reload();await expect(page.locator('#verification-result')).toBeHidden();});
  15 | 
```
---
title: "실제 대상 연결과 저장 정의의 설계 실험"
authority_level: execution
ssot: true
owner: qa
status: approved
last_updated: 2026-10-14
derived_from: [".planning/DESIGN.md", ".planning/RESEARCH.md"]
source_of_truth_for: ["설계 실험의 원문"]
must_not_be_overridden_by: []
ai_edit_policy: editable-but-must-not-contradict-sources
---

# 설계 실험

제품 구현 코드가 아니다. 아래 JavaScript 구간을 임시 .mjs 파일로 추출하여 Node 24.18.1에서 실행한다.
Yjs는 임시 패키지에 13.6.27을 정확히 고정한다. CAUSAL_PROOF_DIR은 그 패키지의 디렉터리다.
SQLite는 contracts/verification-catalog.sql과 결과 JSON 경로를 인자로 사용한다.
결과는 yjs-results.json / sqlite-results.json이며 제품 합격을 의미하지 않는다.
원문과 의존성 고정 파일의 SHA-256은 최종 manifest.json에 기록한다.

## Yjs

```javascript
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(resolve(process.env.CAUSAL_PROOF_DIR, 'package.json'));
const Y = require('yjs');
const packageInfo = require('yjs/package.json');
const shaBytes = bytes => createHash('sha256').update(bytes).digest('hex');
const codeSha256 = shaBytes(readFileSync(process.argv[1]));
const canonical = value => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
};
function own(value) {
  const copy = JSON.parse(JSON.stringify(value));
  const freeze = item => {
    if (item !== null && typeof item === 'object') {
      for (const child of Object.values(item)) freeze(child);
      Object.freeze(item);
    }
    return item;
  };
  return freeze(copy);
}
const random = seed => {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
};
const makeDocs = () => Array.from({ length: 4 }, (_, index) => {
  const doc = new Y.Doc({ guid: 'proof-document' });
  doc.clientID = index + 1;
  return doc;
});
const observe = doc => own(doc.getMap('values').toJSON());
const expected = Object.fromEntries(Array.from({ length: 4 }, (_, index) => ['key' + index, 'value' + index]));
function applyCommand(doc, command, mode) {
  let update;
  doc.once('update', bytes => { update = Uint8Array.from(bytes); });
  const key = mode === 'wrong-command' && command.key === 'key0' ? 'wrong-key0' : command.key;
  doc.getMap('values').set(key, command.value);
  assert.ok(update);
  return update;
}
function assess(states, recovered) {
  const converged = states.every(state => canonical(state) === canonical(states[0]));
  const preservesRequestedValues = states.every(state => canonical(state) === canonical(expected));
  return { converged, preservesRequestedValues, verdict: !recovered ? 'inconclusive' : preservesRequestedValues ? 'passed' : 'failed' };
}
function execute(seed, mode = 'normal') {
  assert.ok(['normal','wrong-command','skip-recovery'].includes(mode));
  const docs = makeDocs();
  const next = random(seed);
  const trace = [];
  const packets = [];
  const save = bytes => {
    const id = shaBytes(bytes);
    if (!packets.some(packet => packet.id === id)) packets.push({ id, encoding: 'base64', bytes: Buffer.from(bytes).toString('base64'), byteLength: bytes.length });
    return id;
  };
  const record = event => trace.push(own({ sequence: trace.length + 1, ...event, state_after: observe(docs[event.target]) }));
  try {
    const initialStates = docs.map(observe);
    const localPackets = [];
    for (let source = 0; source < docs.length; source += 1) {
      const command = { key: 'key' + source, value: 'value' + source };
      const bytes = applyCommand(docs[source], command, mode);
      const packet = save(bytes);
      localPackets.push({ source, packet });
      record({ kind: 'local', source, target: source, command, packet });
    }
    const deliveries = [];
    for (const packet of localPackets) {
      for (let target = 0; target < docs.length; target += 1) {
        if (target === packet.source || next() < 0.35) continue;
        deliveries.push({ ...packet, target, order: next() });
        if (next() < 0.5) deliveries.push({ ...packet, target, order: next() });
      }
    }
    deliveries.sort((a, b) => a.order - b.order);
    for (const delivery of deliveries) {
      const packet = packets.find(item => item.id === delivery.packet);
      Y.applyUpdate(docs[delivery.target], Buffer.from(packet.bytes, 'base64'));
      record({ kind: 'delivered', source: delivery.source, target: delivery.target, packet: delivery.packet });
    }
    if (mode !== 'skip-recovery') {
      for (let source = 0; source < docs.length; source += 1) {
        for (let target = 0; target < docs.length; target += 1) {
          if (target === source) continue;
          const bytes = Y.encodeStateAsUpdate(docs[source]);
          const packet = save(bytes);
          Y.applyUpdate(docs[target], bytes);
          record({ kind: 'reconciled', source, target, packet });
        }
      }
    }
    const states = docs.map(observe);
    const recovered = trace.filter(event => event.kind === 'reconciled').length === 12;
    assert.deepEqual(docs.map(doc => doc.clientID), [1,2,3,4]);
    return { seed, mode, codeSha256, implementation: { name: 'yjs', version: packageInfo.version }, bootstrap: docs.map(doc => ({ clientID: doc.clientID, guid: doc.guid })), initialStates, packets, trace, states, recovered, ...assess(states, recovered) };
  } finally { for (const doc of docs) doc.destroy(); }
}
function replay(input) {
  assert.equal(input.codeSha256, codeSha256);
  assert.equal(input.implementation.version, packageInfo.version);
  assert.ok(['normal','wrong-command','skip-recovery'].includes(input.mode));
  const docs = makeDocs();
  try {
    assert.deepEqual(input.bootstrap, docs.map(doc => ({ clientID: doc.clientID, guid: doc.guid })));
    assert.equal(canonical(docs.map(observe)), canonical(input.initialStates));
    let reconciled = 0;
    for (const event of input.trace) {
      const packet = input.packets.find(item => item.id === event.packet);
      assert.ok(packet);
      const bytes = Buffer.from(packet.bytes,'base64');
      assert.equal(bytes.length,packet.byteLength);
      assert.equal(shaBytes(bytes),packet.id);
      if (event.kind === 'local') {
        assert.equal(shaBytes(applyCommand(docs[event.target],event.command,input.mode)),event.packet);
      } else {
        if (event.kind === 'reconciled') {
          assert.equal(shaBytes(Y.encodeStateAsUpdate(docs[event.source])),event.packet);
          reconciled += 1;
        }
        Y.applyUpdate(docs[event.target],bytes);
      }
      assert.equal(canonical(observe(docs[event.target])),canonical(event.state_after));
    }
    const states=docs.map(observe);
    assert.equal(canonical(states),canonical(input.states));
    const outcome=assess(states,reconciled===12);
    assert.equal(outcome.verdict,input.verdict);
    return { pid:process.pid, states, ...outcome };
  } finally { for(const doc of docs)doc.destroy(); }
}

if (process.argv[2] === '--replay') {
  const result=replay(JSON.parse(readFileSync(process.argv[3],'utf8')));
  writeFileSync(process.argv[4],JSON.stringify(result,null,2)+'\n');
} else {
  const outputFile=process.argv[2];
  const checks=[];
  for(let seed=0;seed<256;seed+=1){
    const first=execute(seed);
    const second=execute(seed);
    assert.equal(first.verdict,'passed');
    assert.equal(canonical(first),canonical(second));
  }
  checks.push({id:'external-repeatability',passed:true,seeds:256,executions:512});
  const sample=execute(19);
  const faulty=execute(19,'wrong-command');
  const incomplete=execute(19,'skip-recovery');
  assert.equal(faulty.verdict,'failed');
  assert.equal(faulty.converged,true);
  assert.equal(incomplete.verdict,'inconclusive');
  checks.push({id:'converged-wrong-state-detected',passed:true,recoveryCompleted:faulty.recovered});
  checks.push({id:'incomplete-recovery-not-passed',passed:true});
  for(const [name,input] of [['normal',sample],['failure',faulty],['incomplete',incomplete]]){
    const inputFile=outputFile+'.'+name+'.json';
    const resultFile=outputFile+'.'+name+'.replay.json';
    writeFileSync(inputFile,JSON.stringify(input));
    const child=spawnSync(process.execPath,[process.argv[1],'--replay',inputFile,resultFile],{env:process.env,encoding:'utf8'});
    assert.equal(child.status,0,child.stderr);
    const result=JSON.parse(readFileSync(resultFile,'utf8'));
    assert.notEqual(result.pid,process.pid);
    assert.equal(result.verdict,input.verdict);
    checks.push({id:'separate-process-'+name+'-replay',passed:true,parentPid:process.pid,replayPid:result.pid});
  }
  const conflictDocs=makeDocs();
  try {
    conflictDocs[0].getMap('values').set('shared','left');
    conflictDocs[1].getMap('values').set('shared','right');
    const first=Y.encodeStateAsUpdate(conflictDocs[0]);
    const second=Y.encodeStateAsUpdate(conflictDocs[1]);
    Y.applyUpdate(conflictDocs[0],second);Y.applyUpdate(conflictDocs[1],first);
    const left=conflictDocs[0].getMap('values').get('shared');
    const right=conflictDocs[1].getMap('values').get('shared');
    assert.equal(left,right);assert.ok(left==='left'||left==='right');
    checks.push({id:'model-specific-conflict-rule',passed:true,concurrentValuesRetained:1});
  } finally { for(const doc of conflictDocs)doc.destroy(); }
  for(const kind of ['code','version','packet','bootstrap']){
    const changed=JSON.parse(JSON.stringify(sample));
    if(kind==='code')changed.codeSha256='f'.repeat(64);
    if(kind==='version')changed.implementation.version='unmatched';
    if(kind==='packet')changed.packets[0].bytes=Buffer.from('corrupt').toString('base64');
    if(kind==='bootstrap')changed.bootstrap[0].clientID=999;
    const inputFile=outputFile+'.tampered-'+kind+'.json';
    writeFileSync(inputFile,JSON.stringify(changed));
    const child=spawnSync(process.execPath,[process.argv[1],'--replay',inputFile,inputFile+'.result'],{env:process.env,encoding:'utf8'});
    assert.notEqual(child.status,0);
    checks.push({id:'reject-'+kind+'-mismatch',passed:true});
  }
  const aliased={nested:{value:1}};
  const snapshot=own(aliased);aliased.nested.value=2;
  assert.equal(snapshot.nested.value,1);
  assert.ok(Object.isFrozen(snapshot.nested));
  checks.push({id:'observation-copy-and-freeze',passed:true});
  const output={scope:'design-feasibility-prototype',productAcceptance:false,node:process.version,implementation:{name:'yjs',version:packageInfo.version},reconciliation:'self document encodeStateAsUpdate full-state exchange',checks,sampleReceipt:shaBytes(canonical(sample)),sample};
  writeFileSync(outputFile,JSON.stringify(output,null,2)+'\n');
  console.log(JSON.stringify({...output,sample:undefined},null,2));
}
```

## SQLite

```javascript
import assert from 'node:assert/strict';
import { DatabaseSync, backup } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const sql = readFileSync(process.argv[2], 'utf8');
const folder = mkdtempSync(join(tmpdir(), 'causal-sql-proof-'));
const path = join(folder, 'proof.sqlite');
const checks = [];
const record = (id, fn) => { fn(); checks.push({ id, passed: true }); };
const sha = text => createHash('sha256').update(text).digest('hex');
let db;
try {
  db = new DatabaseSync(path, { enableForeignKeyConstraints: true, allowExtension: false });
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  record('migration-idempotent', () => { db.exec(sql); db.exec(sql); assert.equal(db.prepare('SELECT count(*) AS n FROM verification_schema_migrations').get().n, 1); });
  record('foreign-keys-enabled', () => assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1));
  const definition = JSON.stringify({ format_version: 2, model_id: 'yjs-map', value: '한' });
  const caseId = sha('case-proof' + definition);
  const insertCase = db.prepare('INSERT INTO verification_cases VALUES(?,?,?,?)');
  const insertRun = db.prepare('INSERT INTO verification_runs VALUES(?,?,?,?,?,?,?)');
  insertCase.run(caseId, 2, definition, Buffer.byteLength(definition));
  const body = JSON.stringify({ format_version: 2, case_id: caseId, manifest: { model_id: 'yjs-map' }, status: 'passed' });
  const runId = sha('run-proof' + body);
  const args = [runId, caseId, 2, 'yjs-map', 'passed', body, Buffer.byteLength(body)];
  insertRun.run(...args);
  record('valid-case-and-run', () => assert.equal(db.prepare('SELECT count(*) AS n FROM verification_runs').get().n, 1));
  record('invalid-hash-shape', () => assert.throws(() => insertCase.run('g'.repeat(64), 2, definition, Buffer.byteLength(definition))));
  record('wrong-definition-bytes', () => assert.throws(() => insertCase.run('b'.repeat(64), 2, definition, definition.length)));
  record('invalid-json', () => assert.throws(() => insertCase.run('b'.repeat(64), 2, '{', 1)));
  record('wrong-format', () => assert.throws(() => insertCase.run('b'.repeat(64), 1, definition, Buffer.byteLength(definition))));
  const invalidRun = (patch, bodyPatch = {}) => {
    const changedBody = JSON.stringify({ format_version: 2, case_id: caseId, manifest: { model_id: 'yjs-map' }, status: 'passed', ...bodyPatch });
    return insertRun.run('c'.repeat(64), ...[caseId,2,'yjs-map','passed',changedBody,Buffer.byteLength(changedBody)].map((value, index) => Object.hasOwn(patch,index) ? patch[index] : value));
  };
  record('foreign-key-orphan', () => assert.throws(() => invalidRun({0:'d'.repeat(64)}, {case_id:'d'.repeat(64)})));
  record('status-mismatch', () => assert.throws(() => invalidRun({}, {status:'failed'})));
  record('model-mismatch', () => assert.throws(() => invalidRun({}, {manifest:{model_id:'other'}})));
  record('missing-required-json-field', () => assert.throws(() => invalidRun({}, {status:undefined})));
  record('wrong-receipt-bytes', () => assert.throws(() => invalidRun({5:1})));
  for(const [name,id] of [['case',caseId],['run',runId]]){
    for(const method of ['REPLACE','IGNORE']){
      const table=name==='case'?'verification_cases':'verification_runs';
      const command=db.prepare('INSERT OR '+method+' INTO '+table+' VALUES('+ (name==='case'?'?,?,?,?':'?,?,?,?,?,?,?') +')');
      record('reject-'+name+'-'+method.toLowerCase(),()=>assert.throws(()=>command.run(...(name==='case'?[caseId,2,definition,Buffer.byteLength(definition)]:args))));
    }
    record('reject-'+name+'-nul',()=>{
      const bad='a'.repeat(64)+'\u0000g';
      if(name==='case')assert.throws(()=>insertCase.run(bad,2,definition,Buffer.byteLength(definition)));
      else assert.throws(()=>insertRun.run(bad,...args.slice(1)));
    });
  }
  record('missing-case-format',()=>assert.throws(()=>insertCase.run('f'.repeat(64),2,'{}',2)));
  record('immutable-update', () => assert.throws(() => db.prepare('UPDATE verification_runs SET status=? WHERE run_id=?').run('failed',runId)));
  record('immutable-delete', () => assert.throws(() => db.prepare('DELETE FROM verification_cases WHERE case_id=?').run(caseId)));
  record('transaction-rollback', () => {
    const id='e'.repeat(64);
    db.exec('BEGIN IMMEDIATE');
    try {
      insertCase.run(id,2,definition,Buffer.byteLength(definition));
      invalidRun({0:'d'.repeat(64)}, {case_id:'d'.repeat(64)});
      throw new Error('expected constraint rejection');
    } catch { db.exec('ROLLBACK'); }
    assert.equal(db.prepare('SELECT count(*) AS n FROM verification_cases WHERE case_id=?').get(id).n,0);
  });
  const before = db.prepare('SELECT * FROM verification_runs').all();
  const backupPath=join(folder,'backup.sqlite');
  await backup(db,backupPath);
  const copy=new DatabaseSync(backupPath,{readOnly:true});
  try { record('live-backup-consistency', () => assert.deepEqual(copy.prepare('SELECT * FROM verification_runs').all(),before)); }
  finally { copy.close(); }
  const sqliteVersion=db.prepare('SELECT sqlite_version() AS version').get().version;
  db.close();
  db=new DatabaseSync(path,{enableForeignKeyConstraints:true});
  record('reopen-preserves-receipt', () => assert.deepEqual(db.prepare('SELECT * FROM verification_runs').all(),before));
  record('integrity-and-foreign-keys', () => {
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  });
  const output={scope:'proposed-schema-fixture',productAcceptance:false,node:process.version,sqliteVersion,checks};
  writeFileSync(process.argv[3],JSON.stringify(output,null,2)+'\n');
  console.log(JSON.stringify(output,null,2));
} finally {
  if(db?.isOpen)db.close();
  rmSync(folder,{recursive:true,force:true});
}
```

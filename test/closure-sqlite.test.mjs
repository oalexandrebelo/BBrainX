import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';
import { ensureWalMode } from '../src/sqlite-init.mjs';
import { BrainStore } from '../src/store.mjs';
import { indexProject } from '../src/retrieval.mjs';
import { SharedAdmission } from '../src/shared-admission.mjs';

function dir(t) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-closure-')); t.after(() => fs.rmSync(d, {recursive:true, force:true})); return d; }
function core(t) { const home=dir(t), store=new BrainStore(home), work=path.join(home,'work'); fs.mkdirSync(work); store.register('p',work); t.after(()=>store.close()); return store; }

test('F01: warm WAL initialization preserves busy timeout and persisted content', t => {
  const db = new DatabaseSync(path.join(dir(t), 'journal.sqlite')); t.after(()=>db.close());
  db.exec('PRAGMA busy_timeout=83; CREATE TABLE probe(value); INSERT INTO probe VALUES(7)');
  assert.equal(ensureWalMode(db,100).mode,'wal'); assert.equal(ensureWalMode(db,100).attempts,1);
  assert.equal(db.prepare('PRAGMA busy_timeout').get().timeout,83);
  assert.equal(db.prepare('SELECT value FROM probe').get().value,7);
});
test('F01: a real reader blocking journal conversion gives bounded ADMISSION_BUSY, then recovers', t => {
  const file=path.join(dir(t),'blocked.sqlite'), db=new DatabaseSync(file), reader=new DatabaseSync(file);
  t.after(()=>{reader.close();db.close();});
  db.exec('CREATE TABLE probe(value); INSERT INTO probe VALUES(1); PRAGMA busy_timeout=97');
  reader.exec('BEGIN DEFERRED'); reader.prepare('SELECT * FROM probe').all();
  const began=performance.now();
  assert.throws(()=>ensureWalMode(db,30),e=>e.code==='ADMISSION_BUSY'&&(e.cause.errcode&255)===5);
  const elapsed=performance.now()-began; assert(elapsed>=25&&elapsed<2000,'bounded retry, not timing SLA');
  assert.equal(db.prepare('PRAGMA busy_timeout').get().timeout,97);
  assert.equal(db.isTransaction,false); reader.exec('ROLLBACK');
  assert.equal(ensureWalMode(db,100).mode,'wal');
});
test('F01: readonly journal conversion does not become a contention retry', t => {
  const file=path.join(dir(t),'readonly.sqlite'); let db=new DatabaseSync(file);db.exec('CREATE TABLE probe(value)');db.close();
  db=new DatabaseSync(file,{readOnly:true}); t.after(()=>db.close());
  assert.throws(()=>ensureWalMode(db,100),e=>e.errcode===8);
});
test('F01: initializer refuses use inside a transaction without rolling it back', t => {
  const db=new DatabaseSync(path.join(dir(t),'active.sqlite'));t.after(()=>db.close());
  db.exec('CREATE TABLE probe(value); BEGIN IMMEDIATE');
  assert.throws(()=>ensureWalMode(db,100),/INVALID_WAL_INITIALIZATION/);
  assert.equal(db.isTransaction,true);db.exec('ROLLBACK');
});
test('F01: unsupported in-memory journal is not reported as WAL',()=>{
  const db=new DatabaseSync(':memory:');try {assert.throws(()=>ensureWalMode(db,100),{code:'ADMISSION_WAL_REQUIRED'});}finally{db.close();}
});
test('F02: legitimate absence of both sidecars permits cold reopen',t=>{
  const home=dir(t);const first=new SharedAdmission(home),id=first.ledgerId,file=first.location;first.close();
  assert.equal(fs.existsSync(file+'-wal'),false);assert.equal(fs.existsSync(file+'-shm'),false);
  const second=new SharedAdmission(home);try{assert.equal(second.ledgerId,id);}finally{second.close();}
});
test('F02: dangling symlinks and hardlinks are not mistaken for absent sidecars',t=>{
  const home=dir(t),first=new SharedAdmission(home),file=first.location;first.close();
  fs.symlinkSync(path.join(home,'missing-target'),file+'-wal','file');
  assert.throws(()=>new SharedAdmission(home),{code:'UNSAFE_ADMISSION_FILE'});fs.unlinkSync(file+'-wal');
  const sibling=path.join(home,'sibling');fs.writeFileSync(sibling,'',{mode:0o600});fs.linkSync(sibling,file+'-shm');
  assert.throws(()=>new SharedAdmission(home),{code:'UNSAFE_ADMISSION_FILE'});fs.unlinkSync(file+'-shm');
});
test('F02: sidecar directory remains unsafe, not a recoverable absence',t=>{
  const home=dir(t),first=new SharedAdmission(home),file=first.location;first.close();fs.mkdirSync(file+'-wal');
  assert.throws(()=>new SharedAdmission(home),{code:'UNSAFE_ADMISSION_FILE'});
});
test('F03: SQLITE_FULL remains the primary public error and has no partial durable rows',t=>{
  const s=core(t); indexProject(s,'p'); const pages=s.db.prepare('PRAGMA page_count').get().page_count;s.db.exec('PRAGMA max_page_count='+pages);
  assert.throws(()=>s.checkpoint('p','T',{objective:'x'.repeat(3900),nextAction:'y'.repeat(3900),status:'review_needed',decisions:['z'.repeat(600)]},0,'k'),e=>e.errcode===13);
  for(const table of ['tasks','task_history','idempotency'])assert.equal(s.db.prepare('SELECT count(*) n FROM '+table).get().n,0);
  assert.equal(s.db.prepare("SELECT count(*) n FROM events WHERE type='checkpoint.created'").get().n,0);
  assert.equal(s.db.isTransaction,false);assert.equal(s.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('F03: a callback failure is propagated by identity and the connection remains usable',t=>{
  const s=core(t),primary=new Error('owned-failure');
  assert.throws(()=>s.transaction(()=>{s.db.prepare('INSERT INTO meta VALUES(?,?)').run('temporary','value');throw primary;}),e=>e===primary);
  assert.equal(s.db.prepare("SELECT * FROM meta WHERE key='temporary'").get(),undefined);
  s.transaction(()=>s.db.prepare('INSERT INTO meta VALUES(?,?)').run('after','ok'));
  assert.equal(s.db.prepare("SELECT value FROM meta WHERE key='after'").get().value,'ok');
});
test('F03: callback that already rolled back retains its original exception',t=>{
  const s=core(t),primary=new Error('after-automatic-abort');
  assert.throws(()=>s.transaction(()=>{s.db.exec('ROLLBACK');throw primary;}),e=>e===primary);
  assert.equal(s.db.isTransaction,false);
});
test('F03: failed COMMIT on a real reader lock keeps original SQLITE_BUSY and rolls back',t=>{
  const s=core(t);s.db.exec('PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=10');
  const reader=new DatabaseSync(path.join(s.home,'brain.sqlite'));t.after(()=>reader.close());
  reader.exec('BEGIN DEFERRED');reader.prepare('SELECT * FROM meta').all();
  assert.throws(()=>s.transaction(()=>s.db.prepare('INSERT INTO meta VALUES(?,?)').run('uncommitted','v')),e=>(e.errcode&255)===5);
  assert.equal(s.db.isTransaction,false);reader.exec('ROLLBACK');
  assert.equal(s.db.prepare("SELECT * FROM meta WHERE key='uncommitted'").get(),undefined);
});
test('F03: real connection closed by a failing callback cannot mask the primary exception',t=>{
 const s=new BrainStore(dir(t)),primary=new Error('callback-closed-connection');
 assert.throws(()=>s.transaction(()=>{s.close();throw primary;}),e=>e===primary);
 assert.throws(()=>s.db.prepare('SELECT 1'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { BrainStore } from '../src/store.mjs';
import { indexProject, search } from '../src/retrieval.mjs';
import { symbolContext } from '../src/aci.mjs';

const V2_HASH='7dcc9080324502f865551922fededa75143c0a4aa56ca71d78ec64c6f1e40493', backup='brain.v2-backup.sqlite';
const tables=['tasks','task_history','memories','idempotency'];
const durableRows=db=>Object.fromEntries(tables.map(table=>[table,db.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all()]));
function legacy(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-retrieval-migration-')),root=path.join(dir,'repo'),home=path.join(dir,'state');fs.mkdirSync(root);
  fs.writeFileSync(path.join(root,'code.ts'),'export function f() {}\nexport class T {}\n');
  const store=new BrainStore(home);store.register('app',root);indexProject(store,'app');
  store.checkpoint('app','task',{objective:'Preserve contracts',nextAction:'Review',status:'review_needed'},0,'replay');
  const proposed=store.proposeMemory('app','Keep contracts','fixture');store.reviewMemory('app',proposed.id,'approved',1);
  // Schema 2 has the same columns; only its derived terms and the new memory index differ.
  store.db.exec('DROP INDEX IF EXISTS memories_by_project_status_id; PRAGMA user_version=2;');
  store.db.prepare("UPDATE chunks SET defs='' ").run();store.db.prepare("UPDATE meta SET value=? WHERE key='schema'").run(V2_HASH);
  const rows=durableRows(store.db),snapshot=store.project('app').snapshot;store.close();
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {home,root,rows,snapshot};
}
test('schema 2 migration indexes approved memories and invalidates obsolete declaration terms without changing durable state',t=>{
  const f=legacy(t),store=new BrainStore(f.home);
  try{
    assert.equal(store.db.prepare('PRAGMA user_version').get().user_version,3);assert.deepEqual(durableRows(store.db),f.rows);
    assert.equal(store.project('app').snapshot,null);assert.equal(store.db.prepare('SELECT count(*) AS n FROM chunks').get().n,0);
    for(const sql of ["SELECT count(*) FROM memories WHERE project=? AND status='approved'","SELECT * FROM memories WHERE project=? AND status='approved' ORDER BY id"]){
      const plan=store.db.prepare('EXPLAIN QUERY PLAN '+sql).all('app').map(x=>x.detail).join('\n');
      assert.match(plan,/SEARCH memories USING (?:COVERING )?INDEX memories_by_project_status_id/);assert.doesNotMatch(plan,/SCAN memories|TEMP B-TREE/);
    }
    indexProject(store,'app');for(const symbol of ['f','T']){assert.equal(symbolContext(store,{project:'app',symbol}).items[0].name,symbol);assert(search(store,'app',symbol).items[0].declares);}
    assert.equal(store.events('app').filter(x=>x.type==='schema.migrated').length,1);
    assert.deepEqual(store.checkpoint('app','task',{objective:'Preserve contracts',nextAction:'Review',status:'review_needed'},0,'replay'),JSON.parse(f.rows.idempotency[0].response));
  }finally{store.close();}
  const reopened=new BrainStore(f.home);try{assert.equal(reopened.events('app').filter(x=>x.type==='schema.migrated').length,1);}finally{reopened.close();}
});
test('schema 2 rollback restores a working old database with its original FTS and durable rows',t=>{
  const f=legacy(t);new BrainStore(f.home).close();
  const restored=path.join(f.home,'restored');fs.mkdirSync(restored);fs.copyFileSync(path.join(f.home,backup),path.join(restored,'brain.sqlite'));
  const db=new DatabaseSync(path.join(restored,'brain.sqlite'));
  try{
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,2);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    assert.equal(db.prepare("SELECT value FROM meta WHERE key='schema'").get().value,V2_HASH);assert.deepEqual(durableRows(db),f.rows);
    assert.equal(db.prepare("SELECT snapshot FROM projects WHERE id='app'").get().snapshot,f.snapshot);
    assert.match(db.prepare("SELECT body FROM chunk_search WHERE chunk_search MATCH 'function'").get().body,/function f/);
    assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE name='memories_by_project_status_id'").all(),[]);
  }finally{db.close();}
});
test('a failed schema 2 migration rolls back its DDL, manifest and metadata and can be retried',t=>{
  const f=legacy(t),file=path.join(f.home,'brain.sqlite'),db=new DatabaseSync(file);db.exec('CREATE INDEX memories_by_project_status_id ON memories(project)');db.close();
  assert.throws(()=>new BrainStore(f.home),/already exists/);
  const check=new DatabaseSync(file);
  try{
    assert.equal(check.prepare('PRAGMA user_version').get().user_version,2);assert.deepEqual(durableRows(check),f.rows);
    assert.equal(check.prepare("SELECT snapshot FROM projects WHERE id='app'").get().snapshot,f.snapshot);
    assert.equal(check.prepare('SELECT count(*) AS n FROM chunks').get().n,1);assert.equal(check.prepare("SELECT value FROM meta WHERE key='schema'").get().value,V2_HASH);
    check.exec('DROP INDEX memories_by_project_status_id');
  }finally{check.close();}
  const retry=new BrainStore(f.home);try{assert.equal(retry.db.prepare('PRAGMA user_version').get().user_version,3);}finally{retry.close();}
});

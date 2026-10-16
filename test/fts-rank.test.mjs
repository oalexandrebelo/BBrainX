import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BrainStore } from '../src/store.mjs';
import { indexProject, search } from '../src/retrieval.mjs';
import { legacyRetrieval, legacySelect, rankCorpus, rankQueries, regressionQueries, repository } from './fixtures/fts-rank.mjs';
function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-fts-rank-')),store=new BrainStore(path.join(dir,'state'));
  t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});return {dir,store};
}
test('FTS search uses native weighted rank without a temporary sorting B-tree',t=>{
  const {dir,store}=fixture(t),root=path.join(dir,'repo');rankCorpus(root,3);store.register('app',root);indexProject(store,'app');
  // Observa as consultas reais; cada preparação e leitura ainda usa o mesmo SQLite, sem substituir resultados.
  const statements=[],prepare=store.stmt.bind(store);store.stmt=sql=>{statements.push(sql);return prepare(sql);};
  assert(search(store,'app','context',2).items.length);
  const sql=statements.find(x=>x.includes('FROM chunk_search JOIN'));assert(sql);
  const plan=store.db.prepare('EXPLAIN QUERY PLAN '+sql).all('"context"','app',21).map(x=>x.detail).join('\n');
  assert.doesNotMatch(plan,/TEMP B-TREE/);assert.match(sql,/ORDER BY chunk_search\.rank/);
  const native=store.db.prepare(sql).all('"context"','app',21),legacy=store.db.prepare(legacySelect).all('"context"','app',21);assert.deepEqual(native,legacy);
});
test('native FTS rank preserves complete results on tied chunks and every labeled retrieval query',async t=>{
  const {dir,store}=fixture(t),root=path.join(dir,'repo');rankCorpus(root,40);store.register('synthetic',root);indexProject(store,'synthetic');
  store.register('self',repository);indexProject(store,'self');const baseline=await legacyRetrieval(dir);
  for(const [project,queries] of [['synthetic',rankQueries],['self',regressionQueries()]])for(const query of queries)for(const byFile of [true,false]){
    assert.deepEqual(search(store,project,query,50,{byFile}),baseline.search(store,project,query,50,{byFile}),project+': '+query+' byFile='+byFile);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BrainStore, normalizeCheckpoint } from '../src/store.mjs';
import { watchIndex } from '../src/index-watch.mjs';
import { search } from '../src/retrieval.mjs';
import * as core from '../src/ab-bbx.mjs';
import * as legacy from '../src/capability.mjs';
import { LaneStore } from '../src/lanes/store.mjs';
import { laneFixture } from './fixtures/lane-setup.mjs';

test('AB-BBX preserves error identity and public imports',()=>{
  for(const key of Object.keys(legacy))assert.equal(legacy[key],core[key]);
});
test('watch discovers new files and removes deleted files without restart',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bbx-watch-')),root=path.join(dir,'repo');
  fs.mkdirSync(root);fs.writeFileSync(path.join(root,'old.ts'),'export const oldMarker=1;');
  const store=new BrainStore(path.join(dir,'state'));store.register('test',root);
  t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
  const stop=new AbortController();let cycles=0;
  await watchIndex(store,'test',{intervalMs:1000,signal:stop.signal,onCycle:receipt=>{
    cycles++;assert.equal(receipt.root,fs.realpathSync.native(root));
    if(cycles===1){
      assert.equal(search(store,'test','oldMarker').items.length,1);
      fs.unlinkSync(path.join(root,'old.ts'));fs.writeFileSync(path.join(root,'new.ts'),'export const newMarker=2;');
    }else{
      assert.equal(search(store,'test','oldMarker').items.length,0);
      assert.equal(search(store,'test','newMarker').items[0].path,'new.ts');
      assert.equal(receipt.removed,1);stop.abort();
    }
  }});assert.equal(cycles,2);
});
test('watch reconciles only the bound lane, not canonical or sibling roots',async t=>{
  const f=laneFixture(t), lane=new LaneStore(f.home,'product','alpha'),stop=new AbortController();
  try { await watchIndex(lane,'product',{signal:stop.signal,onCycle:receipt=>{
    assert.equal(receipt.lane,'alpha');
    const found=search(lane,'product','workspaceMarker');
    assert.ok(found.items[0].body.includes('ALPHA_MARKER'));stop.abort();
  }}); }finally{lane.close();}
});
test('watch rejects invalid cadence and surfaces failures',async()=>{
  await assert.rejects(watchIndex({},'test',{intervalMs:0}),{code:'INVALID_INTERVAL'});
  await assert.rejects(watchIndex({project(){throw new Error('binding lost');}},'test'),/binding lost/);
});
test('checkpoint accepts useful 2000-character notes while rejecting external paths',()=>{
  const content={objective:'ship',nextAction:'verify',status:'in_progress',done:['a'.repeat(2000)]};
  assert.equal(normalizeCheckpoint(content).done[0].length,2000);
  assert.throws(()=>normalizeCheckpoint({...content,done:['a'.repeat(2001)]}));
  assert.throws(()=>normalizeCheckpoint({...content,filesTouched:['../another-repo/file.ts']}),{code:'INVALID_CHECKPOINT'});
});

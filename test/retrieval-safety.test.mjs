import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BrainStore } from '../src/store.mjs';
import { indexProject, refreshFiles, readSafe, search, verifyChunk } from '../src/retrieval.mjs';

function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-retrieval-safety-'));
  const root=path.join(dir,'project');fs.mkdirSync(root);
  fs.writeFileSync(path.join(root,'a.md'),'AUTHORIZED_MARKER\n');
  const store=new BrainStore(path.join(dir,'state'));store.register('project',root);indexProject(store,'project');
  t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
  return {dir,root:store.project('project').root,store};
}
function symlink(t,target,link) {
  try {fs.symlinkSync(target,link,'junction');return true;}
  catch(e){if(e.code==='EPERM'){t.skip('OS does not allow directory symlinks');return false;}throw e;}
}
test('replaced root is refused before enumeration, read and refresh, preserving the authorized index',t=>{
  const {dir,root,store}=fixture(t),external=path.join(dir,'external');fs.mkdirSync(external);
  fs.writeFileSync(path.join(external,'a.md'),'OUTSIDE_MARKER\n');
  fs.renameSync(root,root+'-original');if(!symlink(t,external,root))return;
  const snapshot=store.project('project').snapshot,events=store.events('project').length;
  const chunk=search(store,'project','AUTHORIZED_MARKER').items[0];
  for(const call of [()=>indexProject(store,'project'),()=>refreshFiles(store,'project',['a.md']),()=>verifyChunk(store,'project',chunk)])
    assert.throws(call,{code:'PROJECT_ROOT_CHANGED'});
  assert.throws(()=>readSafe(root,'a.md'),{code:'SYMLINK_REJECTED'});
  assert.equal(store.project('project').snapshot,snapshot);assert.equal(store.events('project').length,events);
  assert.equal(search(store,'project','OUTSIDE_MARKER').items.length,0);
});
test('replaced ancestor is refused even when the final root itself is a regular directory',t=>{
  const {dir,store}=fixture(t),external=path.join(dir,'external');fs.mkdirSync(external);
  const parent=path.join(dir,'workspace');fs.mkdirSync(parent);const nested=path.join(parent,'project');fs.mkdirSync(nested);
  fs.writeFileSync(path.join(nested,'a.md'),'NESTED_MARKER\n');store.register('nested',nested);indexProject(store,'nested');
  fs.mkdirSync(path.join(external,'project'));fs.writeFileSync(path.join(external,'project','a.md'),'OUTSIDE_MARKER\n');
  fs.renameSync(parent,parent+'-original');if(!symlink(t,external,parent))return;
  const chunk=search(store,'nested','NESTED_MARKER').items[0];
  assert.throws(()=>verifyChunk(store,'nested',chunk),{code:'PROJECT_ROOT_CHANGED'});
  assert.throws(()=>refreshFiles(store,'nested',['a.md']),{code:'PROJECT_ROOT_CHANGED'});
  assert.throws(()=>indexProject(store,'nested'),{code:'PROJECT_ROOT_CHANGED'});
  assert.equal(search(store,'project','AUTHORIZED_MARKER').items[0].path,'a.md');
});
test('root aliases accepted at registration retain their canonical authorized destination',t=>{
  const {dir,root,store}=fixture(t),alias=path.join(dir,'alias');if(!symlink(t,root,alias))return;
  assert.equal(store.register('project',alias).root,root);
  assert.equal(indexProject(store,'project').files,1);
  assert.match(readSafe(root,'a.md').body,/AUTHORIZED_MARKER/);
});
test('direct readSafe preserves valid ancestor aliases supplied by the local caller',t=>{
  const {dir,store}=fixture(t),rawRoot=path.join(dir,'project');
  assert.equal(fs.realpathSync.native(rawRoot),store.project('project').root);
  assert.match(readSafe(rawRoot,'a.md').body,/AUTHORIZED_MARKER/);
});
test('partial refresh rolls back files, FTS, snapshot and event when total bytes exceed the host ceiling',t=>{
  const {root,store}=fixture(t),snapshot=store.project('project').snapshot,events=store.events('project').length;
  fs.writeFileSync(path.join(root,'a.md'),'UPDATED_MARKER\n'+('public words for a bounded fixture.\n').repeat(2200));
  assert.throws(()=>refreshFiles(store,'project',['a.md'],{maxBytes:65536}),{code:'INDEX_BYTE_LIMIT'});
  assert.equal(store.project('project').snapshot,snapshot);assert.equal(store.events('project').length,events);
  assert.equal(search(store,'project','AUTHORIZED_MARKER').items[0].path,'a.md');
  assert.equal(search(store,'project','UPDATED_MARKER').items.length,0);
});
test('partial refresh also enforces total file count without publishing a partial index',t=>{
  const {root,store}=fixture(t),snapshot=store.project('project').snapshot;
  fs.writeFileSync(path.join(root,'b.md'),'SECOND_MARKER\n');
  assert.throws(()=>refreshFiles(store,'project',['b.md'],{maxFiles:1}),{code:'INDEX_FILE_LIMIT'});
  assert.equal(store.project('project').snapshot,snapshot);assert.equal(search(store,'project','SECOND_MARKER').items.length,0);
});
test('partial refresh inside the host ceilings remains supported',t=>{
  const {root,store}=fixture(t);fs.writeFileSync(path.join(root,'a.md'),'UPDATED_MARKER\n');
  const result=refreshFiles(store,'project',['a.md'],{maxFiles:1,maxBytes:65536});
  assert.deepEqual(result.changed,['a.md']);assert.equal(search(store,'project','UPDATED_MARKER').items[0].path,'a.md');
});
test('bootstrap cannot refresh past the host byte ceiling or publish a context event',async t=>{
  const {compileContext}=await import('../src/context.mjs');
  const {root,store}=fixture(t),snapshot=store.project('project').snapshot,events=store.events('project').length;
  fs.writeFileSync(path.join(root,'a.md'),'AUTHORIZED_MARKER changed\n'+('public words for a bounded fixture.\n').repeat(2200));
  const previous=process.env.BBRAINX_MAX_BYTES;process.env.BBRAINX_MAX_BYTES='65536';
  try {
    assert.throws(()=>compileContext(store,{project:'project',query:'AUTHORIZED_MARKER',budget:1000}),{code:'INDEX_BYTE_LIMIT'});
    assert.equal(store.project('project').snapshot,snapshot);assert.equal(store.events('project').length,events);
  } finally {if(previous===undefined)delete process.env.BBRAINX_MAX_BYTES;else process.env.BBRAINX_MAX_BYTES=previous;}
});

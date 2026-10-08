import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {sourceManifest} from '../scripts/package.mjs';

function repository(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'bb-source-package-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'0.4.0'}));
  fs.writeFileSync(path.join(root,'package-lock.json'),'{}');fs.writeFileSync(path.join(root,'README.md'),'Committed source.\n');
  git('add','.');git('-c','core.hooksPath=/dev/null','commit','-m','fixture');return {root,git};
}
test('source manifest stays bound to committed blobs across edits, staged changes and checkout timestamps',t=>{
  const {root,git}=repository(t),before=sourceManifest(root);
  fs.writeFileSync(path.join(root,'README.md'),'Uncommitted source must never claim HEAD identity.\n');
  fs.writeFileSync(path.join(root,'untracked.txt'),'Outside distribution.');git('add','README.md');
  assert.deepEqual(sourceManifest(root),before);
  assert.equal(before.archive,'BBrainX-v0.4.0-source.zip');assert.equal(before.contentSource,'git-blobs');
  assert.equal(before.dependencyLocks['package-lock.json'],before.files['package-lock.json']);
});
test('source manifest rejects symlink blobs without consulting a link target',t=>{
  const {root,git}=repository(t);
  const oid=execFileSync('git',['hash-object','-w','--stdin'],{cwd:root,input:'/outside/private-file',encoding:'utf8'}).trim();
  git('update-index','--add','--cacheinfo','120000',oid,'external-link');git('-c','core.hooksPath=/dev/null','commit','-m','link fixture');
  assert.throws(()=>sourceManifest(root),/Unsupported source entry: external-link/);
});
test('source manifest ignores local Git replace refs that change bytes without changing HEAD',t=>{
  const {root,git}=repository(t),before=sourceManifest(root),original=git('rev-parse','HEAD:README.md');
  const replacement=execFileSync('git',['hash-object','-w','--stdin'],{cwd:root,input:'Replacement outside the committed tree.\n',encoding:'utf8'}).trim();
  git('replace',original,replacement);
  assert.notEqual(git('show','HEAD:README.md'),'Committed source.');
  assert.deepEqual(sourceManifest(root),before);
});
test('source manifest retains regular filenames that overlap Object prototype properties',t=>{
  const {root,git}=repository(t);
  for(const name of ['__proto__','constructor'])fs.writeFileSync(path.join(root,name),'Regular committed source.\n');
  git('add','.');git('-c','core.hooksPath=/dev/null','commit','-m','filename fixture');
  const manifest=JSON.parse(JSON.stringify(sourceManifest(root)));
  for(const name of ['__proto__','constructor']){
    assert.ok(Object.hasOwn(manifest.files,name));assert.match(manifest.files[name],/^[a-f0-9]{64}$/);
    assert.equal(manifest.modes[name],'100644');
  }
});

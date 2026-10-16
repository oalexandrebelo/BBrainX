import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {BrainStore} from '../src/store.mjs';
import {indexProject,clearScanCache} from '../src/retrieval.mjs';

// Revisão 2.1.1 (D4): um GIT_DIR herdado e inválido fazia a listagem cair na varredura de pastas, sem as exclusões do Git.
test('inherited GIT_* variables never change which repository the index lists, nor bypass its ignore rules',t=>{
  const base=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'bb-gitenv-'))),root=path.join(base,'repo');
  t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'playwright-report'),{recursive:true});
  const git=(...args)=>execFileSync('git',['-c','user.name=T','-c','user.email=t@example.invalid','-C',root,...args],{encoding:'utf8',env:Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('GIT_')))});
  git('init','-q','-b','main');
  fs.writeFileSync(path.join(root,'.gitignore'),'playwright-report/\n');fs.writeFileSync(path.join(root,'app.ts'),'export const a=1;\n');
  fs.writeFileSync(path.join(root,'playwright-report','trace.ts'),'export const leaked=1;\n');
  git('add','-A');git('commit','-q','-m','base');
  const store=new BrainStore(path.join(base,'state'));t.after(()=>store.close());store.register('p',root);
  const saved=Object.fromEntries(['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE'].map(k=>[k,process.env[k]]));
  Object.assign(process.env,{GIT_DIR:path.join(base,'nowhere'),GIT_WORK_TREE:base,GIT_INDEX_FILE:path.join(base,'bogus-index')});
  try{clearScanCache();const result=indexProject(store,'p');
    const files=store.db.prepare('SELECT path FROM files WHERE project=? ORDER BY path').all('p').map(r=>r.path);
    assert.deepEqual(files,['app.ts'],'the ignored playwright-report/trace.ts must stay out');
    assert.equal(result.files,files.length);}
  finally{for(const [k,v] of Object.entries(saved))if(v===undefined)delete process.env[k];else process.env[k]=v;}
});

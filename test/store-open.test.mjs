import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {BrainStore} from '../src/store.mjs';
function temporary(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-schema-'));try{return fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
test('schema atual abre com um escritor concorrente sem esperar BEGIN IMMEDIATE',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-schema-')),store=new BrainStore(dir);
 const child=fork(fileURLToPath(new URL('./fixtures/store-read-open.mjs',import.meta.url)),[],{stdio:['ignore','ignore','ignore','ipc']});
 const exited=once(child,'exit'); let locked=false;
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
 try{
   await once(child,'message',{signal:controller.signal});store.db.exec('BEGIN IMMEDIATE');locked=true;
   const reply=once(child,'message',{signal:controller.signal});child.send({home:dir});const [result]=await reply;
   assert.equal(result.opened,true,JSON.stringify(result));assert.equal(result.projects,0);
 }finally{clearTimeout(timeout);if(locked)store.db.exec('ROLLBACK');if(child.exitCode===null)child.kill();await exited;store.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('fast path continua validando o hash do schema',()=>temporary(dir=>{const s=new BrainStore(dir);s.db.prepare('UPDATE meta SET value=? WHERE key=?').run('wrong','schema');s.close();assert.throws(()=>new BrainStore(dir),error=>error.code==='MIGRATION_REQUIRED');}));
test('schema futuro continua recusado, sem apagá-lo',()=>temporary(dir=>{const s=new BrainStore(dir);s.db.exec('PRAGMA user_version=99');s.close();assert.throws(()=>new BrainStore(dir),error=>error.code==='MIGRATION_REQUIRED');}));
test('reabrir estado atual preserva o registro e a revisão',()=>temporary(dir=>{const root=path.join(dir,'repo');fs.mkdirSync(root);const a=new BrainStore(dir);a.register('sample',root);a.close();const b=new BrainStore(dir);try{assert.equal(b.project('sample').root,fs.realpathSync.native(root));assert.equal(b.db.prepare('PRAGMA user_version').get().user_version,2);}finally{b.close();}}));

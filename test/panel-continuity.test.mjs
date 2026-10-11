import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ensurePanel} from '../src/panel/lifecycle.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
function area(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bb-panel-continuity-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return directory;}
function build(directory){fs.mkdirSync(path.join(directory,'observatory'),{recursive:true});for(const file of ['index.html','atlas.html','observatory/index.html'])fs.writeFileSync(path.join(directory,file),'<html><title>Lifecycle test</title></html>');return directory;}
async function availablePort(){const server=http.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const port=server.address().port;await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));return port;}

test('panel CLI resolves current alias before deciding whether to execute',async t=>{
  const directory=area(t),release=path.join(directory,'release'),alias=path.join(directory,'current');
  for(const file of ['scripts/panel.mjs','src/panel/probe.mjs','src/panel/assets.mjs','src/panel/lifecycle.mjs','src/state-home.mjs','src/main-module.mjs']){
    const dest=path.join(release,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,file),dest);
  }
  fs.symlinkSync(release,alias,process.platform==='win32'?'junction':'dir');
  const port=await availablePort();
  const stdout=execFileSync(process.execPath,[path.join(alias,'scripts/panel.mjs'),'status','--port',String(port)],{encoding:'utf8',timeout:5000,env:{...process.env,BBRAINX_HOME:path.join(directory,'state')}});
  assert.notEqual(stdout.trim(),'','status must not silently exit without executing');
  const result=JSON.parse(stdout);assert.equal(result.port,port);assert.equal(result.state,'unreachable');
  assert.equal(fs.existsSync(path.join(directory,'state')),false);assert.equal(fs.existsSync(path.join(release,'node_modules')),false);
});

test('concurrent close callers await the same physical shutdown completion',async t=>{
  const directory=area(t),url='http://127.0.0.1:'+await availablePort();
  const handle=await ensurePanel(url,{home:path.join(directory,'state'),assetsDir:build(path.join(directory,'dist'))});
  t.after(()=>handle.close());assert.equal(handle.owned,true);
  const first=handle.close(),second=handle.close();
  try{assert.strictEqual(first,second,'a second close must await the original operation, not return early');}
  finally{await Promise.all([first,second]);}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { BrainStore } from '../src/store.mjs';
import { startServer } from '../src/server.mjs';
import { panelTarget, probePanel } from '../src/panel/probe.mjs';
import { inspectPanelAssets } from '../src/panel/assets.mjs';
import { ensurePanel } from '../src/panel/lifecycle.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
function area(t){const p=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-panel-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));return p;}
function assets(p){fs.mkdirSync(path.join(p,'observatory'),{recursive:true});for(const f of ['index.html','atlas.html','observatory/index.html'])fs.writeFileSync(path.join(p,f),'<html><script src="/app.js"></script><link rel="stylesheet" href="/style.css"></html>');fs.writeFileSync(path.join(p,'app.js'),'document.title="test-domain";');fs.writeFileSync(path.join(p,'style.css'),'body{margin:0}');return p;}
async function raw(t,handler){const s=http.createServer(handler);await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>{s.closeAllConnections();return new Promise(r=>s.close(r));});return {s,url:'http://127.0.0.1:'+s.address().port};}
async function freePort(){const s=http.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const n=s.address().port;await new Promise(r=>s.close(r));return n;}

for(const x of ['https://127.0.0.1:4317','http://evil.test:4317','http://127.1:4317','http://2130706433:4317','http://0x7f000001:4317','http://localhost.evil:4317','http://user@localhost:4317','http://localhost:4317/?token=secret','http://localhost:0','http://localhost:65536','http://localhost:4317/../','http://localhost:4317/#x'])
 test('panel URL rejects unsafe or ambiguous target '+x,()=>assert.throws(()=>panelTarget(x)));
test('explicit loopback aliases normalize to bind and retain port/path',()=>{
  assert.deepEqual(panelTarget('http://localhost:49221/atlas.html'),{url:'http://127.0.0.1:49221/atlas.html',origin:'http://127.0.0.1:49221',port:49221,normalized:true});
  assert.equal(panelTarget('http://[::1]:49222/observatory').url,'http://127.0.0.1:49222/observatory/');
});
test('no listener reports unreachable, never ready',async()=>assert.equal((await probePanel('http://127.0.0.1:'+await freePort())).state,'unreachable'));
test('an arbitrary HTTP 200 is not readiness',async t=>{const {url}=await raw(t,(_,r)=>r.end('hello'));assert.equal((await probePanel(url)).state,'incompatible');});
test('redirects are refused and target is not contacted',async t=>{
 let touched=0;const target=await raw(t,(_,r)=>{touched++;r.end();});const a=await raw(t,(_,r)=>{r.writeHead(302,{Location:target.url});r.end();});
 assert.equal((await probePanel(a.url)).state,'incompatible');assert.equal(touched,0);
});
test('deadline covers never-ending body; response byte limit is enforced',async t=>{
 const slow=await raw(t,(_,r)=>{r.writeHead(200,{'Content-Type':'application/json'});r.write('{');});
 assert.equal((await probePanel(slow.url,{timeoutMs:30})).state,'timeout');
 const big=await raw(t,(_,r)=>{r.writeHead(200,{'Content-Type':'application/json'});r.end('x'.repeat(4096));});
 assert.equal((await probePanel(big.url,{maxBytes:128})).state,'incompatible');
});
test('readiness does not expose CSRF, paths, project names or start models',async t=>{
 const dir=area(t),store=new BrainStore(path.join(dir,'state'));t.after(()=>store.close());
 const server=await startServer(store,{port:0,assetsDir:assets(path.join(dir,'dist'))});t.after(()=>server.close());
 const before=store.db.prepare('SELECT count(*) n FROM events').get().n;
 const r=await fetch(server.url+'/api/readiness');assert.equal(r.status,200);const data=await r.json();
 assert.equal(data.service,'bbrainx-panel');assert.equal(data.ready,true);assert(!JSON.stringify(data).includes(dir));assert.equal(data.csrf,undefined);assert.equal(data.projects,undefined);
 assert.equal(store.db.prepare('SELECT count(*) n FROM events').get().n,before);
 assert.equal((await probePanel(server.url)).state,'ready');
 assert.equal((await fetch(server.url+'/api/readiness',{headers:{Origin:'https://evil.test'}})).status,403);
});
test('server with missing assets returns 503 and is distinct from no listener',async t=>{
 const dir=area(t),store=new BrainStore(path.join(dir,'state'));t.after(()=>store.close());const server=await startServer(store,{port:0,assetsDir:path.join(dir,'none')});t.after(()=>server.close());
 assert.equal((await probePanel(server.url)).state,'missing-assets');assert.equal((await fetch(server.url+'/api/readiness')).status,503);
});
test('asset inspection detects missing direct file and remote asset reference',async t=>{
 const dir=area(t),build=assets(path.join(dir,'dist'));assert(inspectPanelAssets(build).ready);fs.unlinkSync(path.join(build,'app.js'));assert(!inspectPanelAssets(build).ready);
 fs.writeFileSync(path.join(build,'app.js'),'ok');fs.writeFileSync(path.join(build,'atlas.html'),'<script src="https://evil.test/a.js"></script>');assert(!inspectPanelAssets(build).ready);
});
test('concurrent ensure calls share one server and close is idempotent',async t=>{
 const dir=area(t),url='http://127.0.0.1:'+await freePort(),opts={home:path.join(dir,'state'),assetsDir:assets(path.join(dir,'dist'))};
 const many=await Promise.all(Array.from({length:8},()=>ensurePanel(url,opts)));t.after(()=>many[0].close());
 assert(many.every(x=>x===many[0]));assert(many[0].owned);assert.equal(many[0].status.state,'ready');
 const reused=await ensurePanel(url,opts);assert(!reused.owned);await reused.close();assert.equal((await probePanel(url)).state,'ready');
 await many[0].close();await many[0].close();assert.equal((await probePanel(url)).state,'unreachable');
});
test('start refuses incompatible occupant without killing it or creating state',async t=>{
 const dir=area(t),a=await raw(t,(_,r)=>r.end('other'));const h=await ensurePanel(a.url,{home:path.join(dir,'state'),assetsDir:assets(path.join(dir,'dist'))});
 assert.equal(h.status.state,'incompatible');assert(!fs.existsSync(path.join(dir,'state')));assert.equal(await (await fetch(a.url)).text(),'other');
});
test('missing build does not initialize state or download dependencies',async t=>{
 const dir=area(t),h=await ensurePanel('http://127.0.0.1:'+await freePort(),{home:path.join(dir,'state'),assetsDir:path.join(dir,'none')});
 assert.equal(h.status.state,'missing-assets');assert(!fs.existsSync(path.join(dir,'state')));
});
test('panel status runs in source copy without node_modules',t=>{
 const dir=area(t);for(const f of ['scripts/panel.mjs','src/panel/probe.mjs','src/panel/assets.mjs','src/panel/lifecycle.mjs','src/state-home.mjs','src/main-module.mjs']){fs.mkdirSync(path.dirname(path.join(dir,f)),{recursive:true});fs.copyFileSync(path.join(root,f),path.join(dir,f));}
 const report=JSON.parse(execFileSync(process.execPath,[path.join(dir,'scripts/panel.mjs'),'status','--port','1'],{encoding:'utf8',timeout:5000}));assert.equal(report.state,'unreachable');assert(!fs.existsSync(path.join(dir,'node_modules')));
});
test('real command respects selected port and reports missing build without side effects',t=>{
 const dir=area(t),entry=path.join(root,'scripts/panel.mjs');
 const r=JSON.parse(execFileSync(process.execPath,[entry,'status','--url','http://localhost:1'],{env:{...process.env,BBRAINX_HOME:dir},encoding:'utf8',timeout:5000}));assert.equal(r.port,1);assert.equal(r.state,'unreachable');assert(!fs.existsSync(path.join(dir,'brain.sqlite')));
});
test('same service on another state home is not reused',async t=>{
 const dir=area(t),store=new BrainStore(path.join(dir,'first'));t.after(()=>store.close());
 const server=await startServer(store,{port:0,assetsDir:assets(path.join(dir,'dist'))});t.after(()=>server.close());
 const wrong=await ensurePanel(server.url,{home:path.join(dir,'second')});assert.equal(wrong.status.state,'different-state');assert(!wrong.owned);assert(!fs.existsSync(path.join(dir,'second')));
});
test('two real launchers share one listener; loser never terminates owner',async t=>{
 const dir=area(t),url='http://127.0.0.1:'+await freePort(),home=path.join(dir,'state'),build=assets(path.join(dir,'dist'));
 const children=[];t.after(async()=>{for(const x of children){if(x.child.exitCode===null&&x.child.signalCode===null)x.child.kill();await x.closed;}});
 const launch=()=>{
  const child=spawn(process.execPath,[path.join(root,'test/fixtures/panel-launch-worker.mjs'),url,home,build],{stdio:['ignore','pipe','pipe']});
  const closed=once(child,'close');children.push({child,closed});let buf='';
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('LAUNCHER_TIMEOUT')),10000);
   child.once('error',e=>{clearTimeout(timer);reject(e);});child.stdout.on('data',c=>{buf+=c;if(buf.includes('\n')){clearTimeout(timer);resolve({child,closed,report:JSON.parse(buf.split('\n')[0])});}});
   child.once('close',()=>{clearTimeout(timer);if(!buf.includes('\n'))reject(new Error('NO_LAUNCHER_REPORT'));});
  });
 };
 const results=await Promise.all([launch(),launch()]);assert.equal(results.filter(x=>x.report.owned).length,1);assert(results.every(x=>x.report.status.state==='ready'));
 const owner=results.find(x=>x.report.owned),reuser=results.find(x=>!x.report.owned);await reuser.closed;
 assert.equal((await probePanel(url)).state,'ready');owner.child.kill();await owner.closed;assert.equal((await probePanel(url)).state,'unreachable');
});
test('readiness cache expires after deletion of a build asset',async t=>{
 const dir=area(t),store=new BrainStore(path.join(dir,'state'));t.after(()=>store.close());const build=assets(path.join(dir,'dist'));
 const server=await startServer(store,{port:0,assetsDir:build});t.after(()=>server.close());assert.equal((await probePanel(server.url)).state,'ready');
 fs.unlinkSync(path.join(build,'app.js'));await new Promise(r=>setTimeout(r,1050));assert.equal((await probePanel(server.url)).state,'missing-assets');
});

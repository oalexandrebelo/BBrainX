import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import http from 'node:http';
import {probePanel} from '../src/panel/probe.mjs';
const {createPanelController}=createRequire(import.meta.url)('../extensions/vscode/panel-controller.cjs');
// Ports são funções do host sob teste, não uma simulação de ativação VS Code nativa.
test('simultaneous clicks create one terminal and share readiness',async()=>{
 let started=0,live=false;const c=createPanelController({probe:async url=>({url,state:live?'ready':'unreachable'}),start:async()=>{started++;live=true;return {};},alive:()=>live,delay:async()=>{}});
 const r=await Promise.all(Array.from({length:10},()=>c.ensure('http://127.0.0.1:4317/')));assert.equal(started,1);assert(r.every(x=>x.state==='ready'));c.dispose();
});
test('dead terminal allows a new generation instead of displaying an old terminal',async()=>{
 let live=false,started=0;const c=createPanelController({probe:async url=>({url,state:live?'ready':'unreachable'}),start:async()=>{started++;live=true;return {};},alive:()=>live,delay:async()=>{}});
 await c.ensure('x');live=false;await c.ensure('x');assert.equal(started,2);c.dispose();
});
test('unknown occupant or missing assets never starts another process',async()=>{
 for(const state of ['incompatible','missing-assets','timeout']){let starts=0;const c=createPanelController({probe:async url=>({url,state}),start:()=>{starts++;},alive:()=>false});assert.equal((await c.ensure('x')).state,state);assert.equal(starts,0);c.dispose();}
});
test('live terminal without listener times out and is not duplicated',async()=>{
 let time=0,starts=0;const c=createPanelController({probe:async url=>({url,state:'unreachable'}),start:async()=>{starts++;return {};},alive:()=>true,clock:()=>time,delay:async()=>{time+=200;},timeoutMs:400});
 assert.equal((await c.ensure('x')).state,'startup-timeout');assert.equal((await c.ensure('x')).state,'startup-timeout');assert.equal(starts,1);c.dispose();
});
test('configuration change during flight cannot open the wrong panel',async()=>{
 let resolve;const ready=new Promise(r=>resolve=r);const c=createPanelController({probe:()=>ready,start:async()=>{},alive:()=>false});const first=c.ensure('a');await assert.rejects(c.ensure('b'),/PANEL_CONFIGURATION_CHANGED/);resolve({state:'ready',url:'a'});await first;c.dispose();
});
test('dispose during probe cannot start a terminal',async()=>{
 let resolve,starts=0;const c=createPanelController({probe:()=>new Promise(r=>resolve=r),start:async()=>{starts++;},alive:()=>false});const p=c.ensure('a');c.dispose();resolve({state:'unreachable',url:'a'});await assert.rejects(p,/PANEL_DISPOSED/);assert.equal(starts,0);
});

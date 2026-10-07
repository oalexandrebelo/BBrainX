import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {GiB,MiB,INFRASTRUCTURE,infrastructurePlan,mediumEvidenceGate} from '../src/infrastructure.mjs';
import {ResourceAdmission} from '../src/resource-admission.mjs';
import {readBoundedJson,workstationMain} from '../scripts/workstation.mjs';
const hw=(g,c=8)=>({totalMemoryBytes:g*GiB,cpuCount:c});
const clocked=(options={})=>{let now=0;const governor=new ResourceAdmission({...options,clock:()=>now});return {governor,advance:n=>{now+=n;},observe:(more={})=>governor.observe({availableBytes:16*GiB,observedAtMs:now,thermal:'nominal',onBattery:false,...more})};};

test('cinco perfis imutáveis e MEDIUM como centro, sem autoativar modelos',()=>{
 assert.equal(INFRASTRUCTURE.length,5);assert.equal(INFRASTRUCTURE.filter(p=>p.reference).length,1);
 for(const p of INFRASTRUCTURE){assert(Object.isFrozen(p));assert(p.runtimeBudgetBytes+p.hostReserveBytes<p.minMemoryBytes);assert.equal(p.autoTrain,false);}
 assert.equal(infrastructurePlan(hw(128,32)).selected,'MEDIUM');assert.equal(infrastructurePlan(hw(128,32)).capabilityCeiling,'MAX');
});
test('fronteiras exatas de RAM, sem arredondamento promocional',()=>{
 assert.equal(infrastructurePlan(hw(8,2)).selected,'LOW');assert.equal(infrastructurePlan(hw(16,4)).selected,'MEDIUM');
 assert.equal(infrastructurePlan({totalMemoryBytes:16*GiB-1,cpuCount:8}).selected,'LOW');assert.equal(infrastructurePlan(hw(7)).eligible,false);
});
test('limite do processo e CPU restringem perfil',()=>{
 assert.equal(infrastructurePlan({...hw(128,32),constrainedMemoryBytes:8*GiB}).capabilityCeiling,'LOW');
 assert.equal(infrastructurePlan(hw(32,2),'HIGH').eligible,false);assert.equal(infrastructurePlan(hw(64,16),'PRO').selected,'PRO');
});
test('perfil solicitado inválido ou maior não cai silenciosamente em outro',()=>{
 assert.throws(()=>infrastructurePlan(hw(16),'ULTRA'),/UNKNOWN_PROFILE/);assert.equal(infrastructurePlan(hw(16),'HIGH').selected,null);
 for(const bad of [NaN,0,-1,Infinity])assert.throws(()=>infrastructurePlan({totalMemoryBytes:bad,cpuCount:4}));
});
test('nenhum manifesto vazio autoriza anúncio de MEDIUM',()=>{
 const result=mediumEvidenceGate([],'a'.repeat(40));assert.equal(result.eligibleForReview,false);assert.equal(result.claimAllowed,false);
});
test('dois manifestos elegíveis são revisão humana, não certificação',()=>{
 const record=i=>({revision:'a'.repeat(40),kind:'native-task-benchmark',requestedProfile:'MEDIUM',runId:'run'+i,machineId:'mac'+i,rawEvidenceSha256:String(i).repeat(64),hardware:{totalMemoryBytes:16*GiB,cpuCount:8,platform:'darwin'},virtualized:false,withForegroundWorkload:true,acceptedTasks:45,totalTasks:50,durationSeconds:3600,foregroundP95Regression:0.03});
 const result=mediumEvidenceGate([record(1),record(2)],'a'.repeat(40));assert.equal(result.eligibleForReview,true);assert.equal(result.claimAllowed,false);assert.equal(result.acceptedTasks,90);
});
test('reutilizar o mesmo recibo ou usar VM não amplia evidência',()=>{
 const r={revision:'a'.repeat(40),kind:'native-task-benchmark',requestedProfile:'MEDIUM',runId:'same',machineId:'mac',rawEvidenceSha256:'b'.repeat(64),hardware:{totalMemoryBytes:16*GiB,cpuCount:8,platform:'darwin'},virtualized:false,withForegroundWorkload:true,acceptedTasks:50,totalTasks:50,durationSeconds:3600,foregroundP95Regression:0};
 assert(mediumEvidenceGate([r,r],'a'.repeat(40)).reasons.includes('DUPLICATE_EVIDENCE'));
 assert(mediumEvidenceGate([{...r,virtualized:true}],'a'.repeat(40)).reasons.includes('INELIGIBLE_RECORD'));
});
test('governador não admite sem medição recente',()=>{
 const f=clocked();assert.equal(f.governor.acquire({bytes:MiB}).reason,'STALE_RESOURCE_SAMPLE');
 f.observe();assert.equal(f.governor.acquire({bytes:MiB}).reason,'RESOURCE_PRESSURE');
 for(let i=0;i<5;i++){f.advance(1000);f.observe();}assert.equal(f.governor.acquire({bytes:MiB}).ok,true);
});
test('reservas respeitam simultaneamente capacidade de execução e bytes',()=>{
 const f=clocked();f.observe();const a=f.governor.acquire({bytes:GiB}),b=f.governor.acquire({bytes:GiB});assert(a.ok&&b.ok);
 assert.equal(f.governor.acquire({bytes:MiB}).reason,'CONCURRENCY_LIMIT');assert.equal(f.governor.stats().reservedBytes,2*GiB);
 assert.equal(f.governor.release(a.token),true);assert.equal(f.governor.release(a.token),false);assert.equal(f.governor.release({...b.token}),false);
 assert.equal(f.governor.acquire({bytes:3*GiB}).reason,'MEMORY_BUDGET');f.governor.release(b.token);assert.equal(f.governor.stats().reservedBytes,0);
});
test('um token de outro governador não libera a reserva',()=>{const a=clocked(),b=clocked();a.observe();b.observe();const lease=a.governor.acquire({bytes:MiB});assert.equal(b.governor.release(lease.token),false);assert.equal(a.governor.stats().active,1);});
test('expiração e pressão não liberam trabalho ainda vivo',()=>{const f=clocked();f.observe();f.governor.acquire({bytes:MiB});f.advance(3000);assert.equal(f.governor.acquire({bytes:MiB}).reason,'STALE_RESOURCE_SAMPLE');assert.equal(f.governor.stats().active,1);});
test('reaquecer exige janela de observações e evita flapping',()=>{
 const f=clocked();f.observe({thermal:'critical'});assert.equal(f.governor.acquire({bytes:1}).reason,'RESOURCE_PRESSURE');
 f.advance(1000);f.observe();for(let i=0;i<4;i++){f.advance(1000);f.observe();assert.equal(f.governor.acquire({bytes:1}).reason,'RESOURCE_PRESSURE');}
 f.advance(1000);f.observe();assert.equal(f.governor.acquire({bytes:1}).ok,true);
});
test('tempo sem amostras não é uma recuperação observada',()=>{
 const f=clocked();f.observe({thermal:'warning'});f.advance(1000);f.observe();f.advance(6000);f.observe();assert.equal(f.governor.acquire({bytes:1}).reason,'RESOURCE_PRESSURE');
});
test('modelo e background requerem consentimento e estado térmico',()=>{
 const f=clocked();f.observe({thermal:'unknown'});assert.equal(f.governor.acquire({bytes:MiB,kind:'model'}).reason,'EXPLICIT_CONSENT_REQUIRED');
 assert.equal(f.governor.acquire({bytes:MiB,kind:'model',consent:true}).reason,'THERMAL_STATE_NOT_VERIFIED');
 f.advance(1);f.observe({onBattery:true});assert.equal(f.governor.acquire({bytes:MiB,kind:'background',consent:true}).reason,'AC_POWER_NOT_VERIFIED');
});
test('LOW não carrega modelo e MEDIUM admite só um por governador',()=>{
 const low=clocked({profile:'LOW'});low.observe();assert.equal(low.governor.acquire({bytes:MiB,kind:'model',consent:true}).reason,'MODEL_LIMIT');
 const f=clocked();f.observe();assert.equal(f.governor.acquire({bytes:MiB,kind:'model',consent:true}).ok,true);assert.equal(f.governor.acquire({bytes:MiB,kind:'model',consent:true}).reason,'MODEL_LIMIT');
});
test('rejeita amostra futura, fora de ordem e relógio regressivo',()=>{
 const f=clocked();assert.throws(()=>f.observe({observedAtMs:1}),/INVALID_RESOURCE_SAMPLE/);f.advance(10);f.observe();assert.throws(()=>f.observe({observedAtMs:9}),/OUT_OF_ORDER_SAMPLE/);
 f.advance(-1);assert.throws(()=>f.governor.stats()&&f.governor.acquire({bytes:1}),/INVALID_MONOTONIC_CLOCK/);
});
test('entrada de replay limitada e UTF8 estrito',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-world-')),file=path.join(dir,'world.cases');
 try{fs.writeFileSync(file,'{"ok":true}');assert.deepEqual(readBoundedJson(file,100),{ok:true});assert.throws(()=>readBoundedJson(file,2),/INVALID_INPUT_FILE/);fs.writeFileSync(file,Buffer.from([0xff]));assert.throws(()=>readBoundedJson(file,100));assert.throws(()=>readBoundedJson(dir));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('CLI recusa parâmetros não usados ou duplicados',async()=>{
 assert.equal((await workstationMain(['help'])).coreReference,'MEDIUM');
 for(const argv of [['profiles','--cost','1'],['profiles','--profile','LOW','--profile','MEDIUM'],['replay'],['evidence']])await assert.rejects(workstationMain(argv));
});

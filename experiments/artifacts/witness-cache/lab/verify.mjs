import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { WitnessCache, digest, VERSION } from './witness-cache.mjs';

const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const out=path.join(root,'evidence');fs.mkdirSync(out,{recursive:true});
const sourcePath=path.join(root,'lab/witness-cache.mjs'),testPath=path.join(root,'lab/witness-cache.test.mjs');
const sha=x=>createHash('sha256').update(x).digest('hex');
const original=fs.readFileSync(sourcePath),testSource=fs.readFileSync(testPath);
const run=spawnSync(process.execPath,['--test','--test-reporter=tap',testPath],{encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});
const log=(run.stdout??'')+(run.stderr??'');fs.writeFileSync(path.join(out,'tests.log'),log);
const totals=Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(k=>[k,Number(log.match(new RegExp('^# '+k+' (\\d+)$','m'))?.[1]??NaN)]));
assert(!run.error&&run.status===0&&totals.tests===34&&totals.pass===totals.tests&&['fail','cancelled','skipped','todo'].every(k=>totals[k]===0),'TEST_SUITE_FAILED_OR_INCOMPLETE');
const mutants=[
  {id:'stale-publication',target:'mudança durante await',from:"if(!r||r.digest===null||r.version!==d.version||r.digest!==d.digest)return reject('DEPENDENCY_CHANGED');",to:"if(false)return reject('DEPENDENCY_CHANGED');"},
  {id:'revocation-not-checked',target:'revogação depois de begin',from:"if(!g?.allowed||g.version!==t.grantVersion)return reject('AUTHORIZATION_CHANGED');",to:"if(false)return reject('AUTHORIZATION_CHANGED');"},
  {id:'shared-buffer-poisoning',target:'hit preserva bytes',from:'return Buffer.from(e.payload);',to:'return e.payload;'},
  {id:'missing-negative-dependency',target:'search exige geração',from:"check(required.every(n=>names.includes(n)),'MISSING_REQUIRED_DEPENDENCY');",to:"check(true,'MISSING_REQUIRED_DEPENDENCY');"}
];
const negative=[];
for(const m of mutants){
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-witness-negative-'));
  try{
    const text=original.toString();assert.equal(text.split(m.from).length,2,'AMBIGUOUS_MUTATION');
    const changed=text.replace(m.from,m.to);assert.notEqual(sha(changed),sha(original));
    fs.writeFileSync(path.join(tmp,'witness-cache.mjs'),changed);
    fs.writeFileSync(path.join(tmp,'witness-cache.test.mjs'),testSource);
    const child=spawnSync(process.execPath,['--test','--test-reporter=tap','--test-name-pattern',m.target,path.join(tmp,'witness-cache.test.mjs')],{encoding:'utf8',timeout:10000,maxBuffer:2*1024*1024});
    const textLog=(child.stdout??'')+(child.stderr??'');
    fs.writeFileSync(path.join(out,'negative-'+m.id+'.log'),textLog);
    const failed=Number(textLog.match(/^# fail (\d+)$/m)?.[1]??0);
    const detected=!child.error&&child.status!==0&&failed>0&&textLog.includes('ERR_ASSERTION');
    negative.push({id:m.id,detected,assertionFailures:failed,exitCode:child.status,mutantSha256:sha(changed)});
    assert(detected,'NEGATIVE_CONTROL_SURVIVED:'+m.id);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
assert.equal(sha(fs.readFileSync(sourcePath)),sha(original),'ORIGINAL_WAS_MODIFIED');
assert.equal(sha(fs.readFileSync(testPath)),sha(testSource),'TESTS_WERE_MODIFIED');
fs.writeFileSync(path.join(out,'negative-controls.json'),JSON.stringify({allDetected:negative.every(x=>x.detected),cases:negative,isolatedTemporaryCopies:true},null,2)+'\n');

// Experimento de invalidação: nenhum provedor, parser externo, SSD ou dataset do usuário.
const c=new WitnessCache({clock:()=>0,maxEntries:128,maxScopeEntries:128});
c.setGrant('demo','reader',true,0);
const resources=[{name:'policy/context',digest:digest('approved-policy-v1'),expectedVersion:0},{name:'index/generation',digest:digest('indexed-corpus-v1'),expectedVersion:0},...Array.from({length:100},(_,i)=>({name:'content/'+i,digest:digest('file='+i),expectedVersion:0}))];
for(let i=0;i<resources.length;i+=64)c.updateResources('demo',resources.slice(i,i+64));
const request=(kind,which)=>({project:'demo',principal:'reader',kind,queryHash:digest('query='+which),contractHash:digest('deterministic-transform-v1'),dependencies:kind==='search'?['policy/context','index/generation','content/0']:['policy/context','content/'+which]});
for(let i=0;i<100;i++)c.commit(c.begin(request('artifact',i)),'parsed:'+i);
c.commit(c.begin(request('search',0)),'best-document=0');
const before=c.stats();assert.equal(before.entries,101);
c.updateResources('demo',[{name:'content/42',digest:digest('modified-file=42'),expectedVersion:1},{name:'index/generation',digest:digest('indexed-corpus-v2'),expectedVersion:1}]);
let hits=0,misses=0;
for(let i=0;i<100;i++){const t=c.begin(request('artifact',i)),r=c.lookup(t);if(r===null){misses++;c.cancel(t);assert.equal(i,42);}else{hits++;assert.equal(r.toString(),'parsed:'+i);}}
const t=c.begin(request('search',0)),searchResult=c.lookup(t);assert.equal(searchResult,null);c.cancel(t);
assert.equal(hits,99);assert.equal(misses,1);assert.equal(c.stats().invalidated,2);
const experiment={kind:'synthetic-invalidation-retention-not-performance',beforeEntries:101,changedArtifacts:1,
  observed:{artifactHits:hits,artifactMisses:misses,searchInvalidatedDespiteUnchangedSelectedDocument:searchResult===null,entriesAfter:c.stats().entries,totalInvalidations:c.stats().invalidated},
  coarseBaseline:{kind:'declared-global-generation-policy-count-not-executed-system',entriesToInvalidate:101},
  baselineExplanation:'Uma política explicitamente global invalida as 101 entradas; a contagem é derivada da definição, não benchmark de outro produto.',
  modelCalls:0,providerBillingSavings:null,endToEndSpeedup:null,taskAccuracy:null,
  limitation:'Retenção de trabalho independente em cenário construído; 99 hits não representam 99% de acerto de agentes. A autoridade atualizou corretamente a geração de índice.'};
fs.writeFileSync(path.join(out,'invalidation-experiment.json'),JSON.stringify(experiment,null,2)+'\n');
const report={schemaVersion:1,moduleVersion:VERSION,observedAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,architecture:process.arch,release:os.release(),pythonNotRequired:true},
  tests:totals,boundedEnumeration:{sequences:1296,eventsPerSequence:4,alphabetSize:6,readsCompared:1728},negativeControls:negative,experiment,
  sources:[{file:'lab/witness-cache.mjs',bytes:original.length,sha256:sha(original)},{file:'lab/witness-cache.test.mjs',bytes:testSource.length,sha256:sha(testSource)}],
  productionDependenciesAdded:0,scope:'standalone-module-local-verification',githubPublished:false,bbrainxRuntimeIntegrated:false,bbrainxFullSuiteRun:false,
  macOSBenchmarked:false,modelInference:false,externalBillingVerified:false,formalUnboundedProof:false,
  limitations:['Um isolate Node; não há persistência, watcher, transporte, sandbox ou cache KV.','Host deve autenticar o principal e informar todas as dependências e revisões; o módulo não demonstra sua completude.','Limites de bytes contabilizados não são teto de RSS; Hash não é assinatura.','Testes finitos e corpus construído não certificam uso em produção crítica nem tolerância a falhas de armazenamento.']};
fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({tests:totals,negativeControls:negative.map(({id,detected})=>({id,detected})),experiment,validation:path.join(out,'validation.json')},null,2));

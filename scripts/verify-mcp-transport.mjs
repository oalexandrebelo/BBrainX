import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {execFileSync,spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';import {parseArgs} from 'node:util';

const {values}=parseArgs({options:{out:{type:'string',default:'artifacts/mcp-transport'},'minimum-tests':{type:'string',default:'396'},repeat:{type:'string',default:'5'}}});
const minimum=Number(values['minimum-tests']),repetitions=Number(values.repeat);
if(!Number.isSafeInteger(minimum)||minimum<1||!Number.isSafeInteger(repetitions)||repetitions<1||repetitions>10)throw new Error('INVALID_VERIFICATION_POLICY');
const out=path.resolve(values.out);fs.mkdirSync(out,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(...args)=>execFileSync('git',['--no-optional-locks','-c','core.fsmonitor=false',...args],{encoding:'utf8',timeout:10000,maxBuffer:16*1024*1024});
const revision=git('rev-parse','HEAD').trim(),tree=git('rev-parse','HEAD^{tree}').trim();
if(git('status','--porcelain','--untracked-files=no').trim())throw new Error('CLEAN_TRACKED_CHECKOUT_REQUIRED');
const tracked=git('ls-files','-z').split('\0').filter(Boolean).sort();
const snapshot=()=>hash(JSON.stringify(tracked.map(file=>{
 const stat=fs.lstatSync(file);if(!stat.isFile()&&!stat.isSymbolicLink())throw new Error('UNSUPPORTED_TRACKED_ENTRY');
 const body=stat.isSymbolicLink()?Buffer.from(fs.readlinkSync(file)):fs.readFileSync(file);
 return [file,stat.isSymbolicLink()?'link':'file',body.length,hash(body)];
})));
const before=snapshot(),steps=[];
function run(name,args,timeout=300000){
 const began=performance.now(),p=spawnSync(process.execPath,args,{encoding:'utf8',timeout,maxBuffer:32*1024*1024});
 const log=(p.stdout??'')+(p.stderr??'');fs.writeFileSync(path.join(out,name+'.log'),log);
 const result={name,args,durationMs:performance.now()-began,exitCode:p.status,signal:p.signal,error:p.error?.code??null,success:!p.error&&p.status===0,
  log:{name:name+'.log',bytes:Buffer.byteLength(log),sha256:hash(Buffer.from(log))}};
 steps.push(result);return {result,log};
}
function counts(log){return Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(k=>{
 const found=[...log.matchAll(new RegExp('^# '+k+' (\\d+)$','gm'))];return [k,found.length?Number(found.at(-1)[1]):null];
}));}
const good=(c,n)=>c.tests>=n&&c.tests===c.pass&&['fail','cancelled','skipped','todo'].every(k=>c[k]===0);
const files=fs.readdirSync('test').filter(f=>f.endsWith('.test.mjs')).sort().map(f=>'test/'+f);
const full=run('runtime',['--test','--test-reporter=tap',...files]);full.result.counts=counts(full.log);full.result.success&&=good(full.result.counts,minimum);
run('build',['node_modules/vite/bin/vite.js','build']);
const selected=['test/mcp-flow.test.mjs','test/mcp-admission.test.mjs','test/mcp-pressure-process.test.mjs'];
for(let i=0;i<repetitions;i++){
 const sample=run('focused-'+(i+1),['--test','--test-reporter=tap',...selected],90000);
 sample.result.counts=counts(sample.log);sample.result.success&&=good(sample.result.counts,54)&&sample.result.counts.tests===54;
}
run('negative',['scripts/mcp-negative.mjs',path.join(out,'negative')],120000);
run('baseline-probe',['scripts/mcp-baseline-probe.mjs',path.join(out,'baseline-probe')],30000);
run('benchmark',['scripts/benchmark-mcp-flow.mjs',path.join(out,'benchmark')],120000);
const after=snapshot(),clean=!git('status','--porcelain','--untracked-files=no').trim();
const report={schemaVersion:1,kind:'state03b-mcp-transport-verification',observedAt:new Date().toISOString(),revision,tree,
 accepted:steps.every(s=>s.success)&&before===after&&clean,minimumTests:minimum,counts:full.result.counts,focusedUniqueTests:54,focusedRepetitions:repetitions,
 sourceBefore:before,sourceAfter:after,trackedUnchanged:before===after&&clean,lockDigest:hash(fs.readFileSync('package-lock.json')),
 environment:{node:process.version,sqlite:process.versions.sqlite??null,platform:process.platform,architecture:process.arch,memoryBytes:os.totalmem(),logicalCpus:os.cpus().length},
 github:{runId:process.env.GITHUB_RUN_ID??null,attempt:process.env.GITHUB_RUN_ATTEMPT??null},steps,
 limitations:['Fixtures exercitam contrato, streams e processos; não são modelos de IA.','Métricas de ring são microbenchmark, não ganho de tarefa/harness.',
 'Quota é por conexão e conta promessas do motor; não limita processos que ignorem o protocolo.','Hash local não autentica o produtor nem congela o filesystem.',
 'Não executa IDEs autenticadas, modelos, faturas, Docker ou certificação de segurança.','Tipos públicos possuem consumidor separado; compilador não é dependência adicionada ao runtime.']};
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({accepted:report.accepted,revision,counts:report.counts,steps:steps.map(({name,success})=>({name,success}))},null,2));
if(!report.accepted)process.exitCode=1;

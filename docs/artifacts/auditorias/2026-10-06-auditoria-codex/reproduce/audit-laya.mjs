import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {LAYA,layaPaths} from '../src/laya.mjs';
const home='/private/tmp/bbrainx-audit-20261006/laya-home';
const out='/private/tmp/bbrainx-audit-20261006/evidence';
const paths=layaPaths(home), assets=[];
for(const f of LAYA.files){const bytes=fs.readFileSync(paths.model+'/'+f.path);const digest=createHash('sha256').update(bytes).digest('hex');assets.push({path:f.path,bytes:bytes.length,sha256:digest,match:bytes.length===f.bytes&&digest===f.sha256});if(!assets.at(-1).match)throw new Error('Weight mismatch: '+f.path);}
const began=performance.now();
const child=spawn(process.execPath,['scripts/laya-bench.mjs','--memory','test/fixtures/eval-memory.cases','--out',out+'/laya-real-benchmark.json'],{env:{...process.env,BBRAINX_HOME:home},stdio:['ignore','pipe','pipe']});
let stdout='',stderr='',peakWorkerRssKiB=0,peakNodeRssKiB=0,observations=0;
child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
const sample=()=>{const r=spawnSync('ps',['-axo','pid=,ppid=,rss=,comm='],{encoding:'utf8'});if(r.status!==0)return;observations++;for(const l of r.stdout.trim().split('\n')){const m=l.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);if(!m)continue;if(Number(m[1])===child.pid)peakNodeRssKiB=Math.max(peakNodeRssKiB,Number(m[3]));if(Number(m[2])===child.pid&&m[4].toLowerCase().includes('python'))peakWorkerRssKiB=Math.max(peakWorkerRssKiB,Number(m[3]));}};
const timer=setInterval(sample,250),watchdog=setTimeout(()=>child.kill('SIGKILL'),120000);
const exit=await new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
clearInterval(timer);clearTimeout(watchdog);fs.writeFileSync(out+'/laya-real-stdout.log',stdout);fs.writeFileSync(out+'/laya-real-stderr.log',stderr);
fs.writeFileSync(out+'/laya-resource.json',JSON.stringify({observedAt:new Date().toISOString(),testedRevision:'a9636e9402e3fa673ae05b3489202da1048aef5e',exit,elapsedMs:performance.now()-began,assets,platform:process.platform,architecture:process.arch,node:process.versions.node,peakWorkerRssKiB,peakNodeRssKiB,observations,samplingIntervalMs:250,modelDirectoryCopy:true,providerCalls:0,caveats:['Copied previously installed weights; no installation or download.','Existing hand-labeled synthetic memory pairs: not an independent holdout.','ps RSS is not a measurement of GPU allocated memory or total machine energy.','Resource sampling introduces overhead; benchmark is exploratory.']},null,2)+'\n');
if(exit.code!==0)throw new Error('Real Laya benchmark failed: '+JSON.stringify(exit));

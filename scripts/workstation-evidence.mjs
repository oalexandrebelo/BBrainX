import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {replayWorld,REPLAY_STRATEGIES} from '../src/replay.mjs';
import {infrastructurePlan} from '../src/infrastructure.mjs';

const dir=path.resolve('artifacts/workstation');fs.mkdirSync(dir,{recursive:true});
const files=['test/workstation.test.mjs','test/replay.test.mjs','test/codex-project.test.mjs','test/store-open.test.mjs','test/native-memory.test.mjs'];
const tests=spawnSync(process.execPath,['--test','--test-reporter=tap',...files],{encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024,shell:false});
const log=(tests.stdout??'')+(tests.stderr??'');fs.writeFileSync(path.join(dir,'tests.log'),log);
const last=name=>Number([...log.matchAll(new RegExp('^# '+name+' (\\d+)\\s*$','gm'))].at(-1)?.[1]??-1);
const count={tests:last('tests'),passed:last('pass'),failed:last('fail'),skipped:last('skipped'),cancelled:last('cancelled')};
if(tests.error||tests.status!==0||count.tests<45||count.passed!==count.tests||count.failed!==0||count.skipped!==0||count.cancelled!==0)throw new Error('WORKSTATION_TESTS_NOT_GREEN');
function fixture(size){const nodes=[{id:'root',parent:null,ordinal:0,score:0,accepted:false,cost:0}];for(let i=1;i<=size;i++)nodes.push({id:'n'+i,parent:i%10===1?'root':'n'+(i-1),ordinal:i,score:(i%101)/100,accepted:false,cost:1});return {schemaVersion:1,worldId:'generated-'+size,project:'fixture-only',snapshot:'a'.repeat(64),evaluatorVersion:'synthetic-v1',verifierSha256:createHash('sha256').update('synthetic-score-not-quality').digest('hex'),costUnit:'recorded-attempt',origin:'fixture',nodes};}
const benchmark=[];
for(const size of [200,2000,8000])for(const strategy of REPLAY_STRATEGIES){
 const world=fixture(size),r=await replayWorld(world,{strategy,maxSteps:20000,maxCost:1000000,stopOnAccepted:false});
 benchmark.push({nodes:size,strategy,observedNodes:r.observedNodes,coverage:r.coverage,supportMisses:r.supportMisses,wallMs:r.replayWallMs,processCpuMs:r.replayProcessCpuMs,origin:r.origin,worldSha256:r.worldSha256});
 if(r.observedNodes!==size)throw new Error('SYNTHETIC_REPLAY_INCOMPLETE');
}
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const rawHardware={totalMemoryBytes:os.totalmem(),cpuCount:os.availableParallelism(),constrainedMemoryBytes:process.constrainedMemory?.()??0};
fs.writeFileSync(path.join(dir,'hardware-observed.json'),JSON.stringify(rawHardware,null,2)+'\n');
const plan=infrastructurePlan(rawHardware);
const report={schemaVersion:1,revision,observedAt:new Date().toISOString(),environment:{platform:process.platform,arch:process.arch,node:process.versions.node,ci:process.env.GITHUB_ACTIONS==='true',runner:process.env.RUNNER_OS??null,totalMemoryBytes:os.totalmem(),availableParallelism:os.availableParallelism()},tests:count,
  plan,benchmark:{kind:'synthetic-replay-kernel',samples:benchmark,notTaskQuality:true},
  measuredMedium:false,providerCalls:0,weightsChanged:false,policyPromoted:false,billingSavings:null,taskAccuracy:null,
  limits:['CI runner is not a declared native MEDIUM user workstation.','Replay costs are historical units, not provider invoices.','This suite does not run Laya inference.','Cooperative admission is not an OS RSS ceiling.']};
fs.writeFileSync(path.join(dir,'validation.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(dir,'demo-world.cases'),JSON.stringify(fixture(200),null,2)+'\n');
console.log(JSON.stringify({revision,tests:count,benchmarkCases:benchmark.length,measuredMedium:false},null,2));

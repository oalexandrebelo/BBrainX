import fs from 'node:fs';
import path from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
const dir=path.resolve('artifacts/workstation');fs.mkdirSync(dir,{recursive:true});
const run=file=>spawnSync(process.execPath,['--test','--test-reporter=tap',file],{encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024,shell:false});
const cases=[
 {id:'auto-escalation',file:'src/infrastructure.mjs',test:'test/workstation.test.mjs',from:"supported.filter(p => ['LOW','MEDIUM'].includes(p.id)).at(-1)",to:'supported.at(-1)'},
 {id:'stale-admission',file:'src/resource-admission.mjs',test:'test/workstation.test.mjs',from:'if (!s || now - s.at > this.maxSampleAgeMs)',to:'if (!s)'},
 {id:'invalid-reward',file:'src/replay.mjs',test:'test/replay.test.mjs',from:'n.score >= 0 && n.score <= 1',to:'n.score >= 0'},
 {id:'baseline-store-open',file:'src/store.mjs',test:'test/store-open.test.mjs',baseline:'a9636e9402e3fa673ae05b3489202da1048aef5e:src/store.mjs'}
];
const results=[];
for(const c of cases){
 const original=fs.readFileSync(c.file,'utf8');
 const clean=run(c.test);if(clean.error||clean.status!==0)throw new Error('CANDIDATE_NOT_GREEN:'+c.id);
 try{
  let altered;
  if(c.baseline)altered=execFileSync('git',['show',c.baseline],{encoding:'utf8',maxBuffer:1024*1024});
  else{if(original.split(c.from).length!==2)throw new Error('MUTATION_ANCHOR_NOT_UNIQUE:'+c.id);altered=original.replace(c.from,c.to);}
  if(altered===original)throw new Error('MUTATION_NOT_APPLIED');
  fs.writeFileSync(c.file,altered);
  const result=run(c.test),log=(result.stdout??'')+(result.stderr??'');
  fs.writeFileSync(path.join(dir,c.id+'.log'),log);
  const failed=Number([...log.matchAll(/^# fail (\d+)\s*$/gm)].at(-1)?.[1]??0);
  if(result.error||result.status===0||failed<1||!log.includes('AssertionError'))throw new Error('MUTATION_NOT_CAUGHT_BY_ASSERTION:'+c.id);
  results.push({id:c.id,detected:true,failedTests:failed});
 }finally{fs.writeFileSync(c.file,original);}
}
fs.writeFileSync(path.join(dir,'mutations.json'),JSON.stringify({schemaVersion:1,kind:'targeted-negative-controls',results,scope:'Each mutation runs alone. Not a full mutation score or model-quality benchmark.'},null,2)+'\n');
console.log(JSON.stringify(results,null,2));

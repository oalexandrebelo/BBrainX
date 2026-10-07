import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
const BASE='a9636e9402e3fa673ae05b3489202da1048aef5e';
assert.equal(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),'','ISOLATED_CLEAN_WORKTREE_REQUIRED');
const out='artifacts/core-contracts';fs.mkdirSync(out,{recursive:true});
const cases=[
  {id:'unbounded-access',file:'src/capability.mjs',name:'authorization wait consumes'},
  {id:'late-principal-mutation',file:'src/capability.mjs',name:'principal is snapshotted'},
  {id:'mutable-schema-catalog',file:'src/capability.mjs',name:'catalog descriptors cannot'},
  {id:'lost-checkpoint-obligations',file:'src/context.mjs',name:'trimmed checkpoints retain'}
];
const reports=[];
for(const c of cases){
  const saved=fs.readFileSync(c.file),original=execFileSync('git',['show',BASE+':'+c.file],{maxBuffer:1000000});
  try{
    fs.writeFileSync(c.file,original);assert(execFileSync('git',['diff','--',c.file],{encoding:'utf8'}).trim(),'ORIGINAL_NOT_RESTORED');
    const run=spawnSync(process.execPath,['--test','--test-reporter=tap','--test-name-pattern',c.name,'test/contracts-regression.test.mjs'],{encoding:'utf8',timeout:30000,maxBuffer:4000000});
    const log=(run.stdout||'')+(run.stderr||'');fs.writeFileSync(path.join(out,'negative-'+c.id+'.log'),log);
    const failures=Number(log.match(/^# fail (\d+)/m)?.[1]??0);
    const detected=!run.error&&run.status!==0&&failures>0&&log.includes('ERR_ASSERTION');
    reports.push({id:c.id,originalRevision:BASE,detected,assertionFailures:failures});assert(detected,'NEGATIVE_CONTROL_NOT_DETECTED:'+c.id);
  }finally{fs.writeFileSync(c.file,saved);}
}
assert.equal(execFileSync('git',['diff','--name-only'],{encoding:'utf8'}).trim(),'','RESTORATION_FAILED');
fs.writeFileSync(path.join(out,'negative-controls.json'),JSON.stringify({cases:reports,allDetected:reports.every(r=>r.detected)},null,2)+'\n');
console.log(JSON.stringify(reports));

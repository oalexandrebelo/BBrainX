import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const source=path.resolve('experiments/artifacts/witness-cache');
const target=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-consolidated-lab-'));
const out=path.resolve('artifacts/consolidated/labs/witness-cache');
fs.mkdirSync(out,{recursive:true});
const digest=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const before=digest(path.join(source,'lab/witness-cache.mjs'));
try {
  fs.cpSync(source,target,{recursive:true,errorOnExist:false});
  const run=spawnSync(process.execPath,['lab/verify.mjs'],{cwd:target,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
  fs.writeFileSync(path.join(out,'run.log'),(run.stdout??'')+(run.stderr??''));
  if(fs.existsSync(path.join(target,'evidence')))fs.cpSync(path.join(target,'evidence'),out,{recursive:true});
  assert(!run.error&&run.status===0,'WITNESS_LAB_FAILED');
  assert.equal(digest(path.join(source,'lab/witness-cache.mjs')),before,'LAB_SOURCE_MODIFIED');
  const report=JSON.parse(fs.readFileSync(path.join(out,'validation.json'),'utf8'));
  fs.writeFileSync(path.join(out,'consolidation.json'),JSON.stringify({kind:'explicit-isolated-reexecution',coreIntegrated:false,originalReportFieldsPreserved:true,tests:report.tests,sourceSha256:before},null,2)+'\n');
  console.log(JSON.stringify({lab:'witness-cache',tests:report.tests,output:out}));
} finally {fs.rmSync(target,{recursive:true,force:true});}

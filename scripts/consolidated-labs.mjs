import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const root=process.cwd(),outputs=path.resolve('artifacts/consolidated/labs');
fs.mkdirSync(outputs,{recursive:true});
const results=[];
for(const name of ['witness-cache','consistency-protocol']){
  const source=path.join(root,'experiments/artifacts',name);
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-consolidated-lab-'));
  const out=path.join(outputs,name);fs.mkdirSync(out,{recursive:true});
  const main=name==='witness-cache'?'lab/witness-cache.mjs':'verification/protocol_checks.py';
  const original=hash(fs.readFileSync(path.join(source,main)));
  try{
    fs.cpSync(source,temp,{recursive:true});
    const command=name==='witness-cache'?process.execPath:'python3';
    const args=name==='witness-cache'?['lab/verify.mjs']:['verification/test_protocol.py'];
    const run=spawnSync(command,args,{cwd:temp,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
    fs.writeFileSync(path.join(out,'run.log'),(run.stdout??'')+(run.stderr??''));
    if(fs.existsSync(path.join(temp,'evidence')))fs.cpSync(path.join(temp,'evidence'),out,{recursive:true});
    assert(!run.error&&run.status===0,'LAB_FAILED:'+name);
    assert.equal(hash(fs.readFileSync(path.join(source,main))),original,'LAB_SOURCE_MODIFIED');
    const report=JSON.parse(fs.readFileSync(path.join(out,name==='witness-cache'?'validation.json':'verification.json'),'utf8'));
    const tests=name==='witness-cache'?report.tests:{tests:report.tests_run,pass:report.passed,fail:report.failures,errors:report.errors,skipped:report.skipped};
    assert.equal(tests.tests,name==='witness-cache'?34:35);
    assert.equal(tests.pass,tests.tests);assert.equal(tests.fail,0);assert.equal(tests.skipped,0);
    if(name==='consistency-protocol'){
      assert.equal(tests.errors,0);
      const plan=JSON.parse(fs.readFileSync(path.join(source,'parts.json'),'utf8'));
      const parts=plan.parts.map(part=>{
        assert(/^parts\/[a-z0-9-]+\.md$/.test(part.file),'INVALID_ARCHIVE_PART');
        const bytes=fs.readFileSync(path.join(source,part.file));
        assert.equal(bytes.length,part.bytes);assert.equal(hash(bytes),part.sha256,'PART_CHANGED:'+part.file);return bytes;
      });
      const whole=Buffer.concat(parts);assert.equal(whole.length,plan.bytes);assert.equal(hash(whole),plan.sha256);
      fs.writeFileSync(path.join(out,'PROTOCOLO_X99-original.md'),whole);
    }
    const current={kind:'explicit-isolated-reexecution',name,observedAt:new Date().toISOString(),runId:process.env.GITHUB_RUN_ID??null,
      coreIntegrated:false,originalReportFieldsPreserved:true,tests,sourceSha256:original,environment:report.environment};
    fs.writeFileSync(path.join(out,'consolidation.json'),JSON.stringify(current,null,2)+'\n');
    results.push(current);console.log(JSON.stringify(current));
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
fs.writeFileSync(path.join(outputs,'index.json'),JSON.stringify({scope:'standalone-labs-not-runtime-test-count',results},null,2)+'\n');

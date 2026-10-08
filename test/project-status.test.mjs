import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {projectStatus} from '../scripts/project-status.mjs';

function repository(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'bb-project-status-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'0.4.0'}));
  fs.writeFileSync(path.join(root,'package-lock.json'),'{}');fs.writeFileSync(path.join(root,'.gitignore'),'artifacts/\n');
  fs.mkdirSync(path.join(root,'test'),{recursive:true});
  fs.writeFileSync(path.join(root,'test/example.test.mjs'),"import {test} from 'node:test'; test('fixture one',()=>{});\n");
  fs.writeFileSync(path.join(root,'test/second.test.mjs'),"import {test} from 'node:test'; test('fixture two',()=>{});\n");
  git('add','.');git('-c','core.hooksPath=/dev/null','commit','-m','fixture');
  const revision=git('rev-parse','HEAD'),file=path.join(root,'artifacts/consolidated/validation.json');fs.mkdirSync(path.dirname(file),{recursive:true});
  const report={schemaVersion:1,revision,runId:null,observedAt:'2026-10-07T12:00:00.000Z',passed:true,
    environment:{node:'v24.21.0',platform:process.platform,architecture:process.arch},
    tests:{tests:3,pass:3,fail:0,cancelled:0,skipped:0,todo:0},testFiles:['test/example.test.mjs','test/second.test.mjs']};
  return {root,file,report,write:(value=report)=>fs.writeFileSync(file,JSON.stringify(value))};
}
test('handoff binds a complete local report to a clean revision and detects subsequent edits',t=>{
  const f=repository(t);assert.equal(projectStatus(f.root).evidence.status,'missing');
  f.write();assert.equal(projectStatus(f.root).evidence.status,'matches-clean-revision');
  assert.equal(projectStatus(f.root).startHere.every(item=>!item.present),true);
  fs.writeFileSync(path.join(f.root,'new-source.mjs'),'export const changed=true;\n');
  const status=projectStatus(f.root);assert.equal(status.dirty,true);assert.equal(status.evidence.status,'dirty-worktree');
  assert.ok(status.changes.some(line=>line.includes('new-source.mjs')));
});
test('handoff never presents old, skipped, empty or malformed test evidence as current',t=>{
  const f=repository(t);f.write({...f.report,revision:'0'.repeat(40)});assert.equal(projectStatus(f.root).evidence.status,'different-revision');
  for(const tests of [{tests:0,pass:0,fail:0,cancelled:0,skipped:0,todo:0},{...f.report.tests,skipped:1},{...f.report.tests,pass:2},null]){
    f.write({...f.report,tests});assert.equal(projectStatus(f.root).evidence.status,'failed-or-incomplete');
  }
  fs.writeFileSync(f.file,'invalid JSON');assert.equal(projectStatus(f.root).evidence.status,'unreadable');
});
test('handoff rejects missing or invalid report schema, timestamp, test inventory and environment',t=>{
  const f=repository(t);
  const invalidReports=[
    {...f.report,schemaVersion:undefined},
    {...f.report,schemaVersion:2},
    {...f.report,observedAt:undefined},
    {...f.report,observedAt:'not-a-date'},
    {...f.report,observedAt:'2026-10-07'},
    {...f.report,testFiles:undefined},
    {...f.report,testFiles:[]},
    {...f.report,testFiles:['test/example.test.mjs','test/example.test.mjs']},
    {...f.report,testFiles:['test/example.test.mjs']},
    {...f.report,environment:undefined},
    {...f.report,environment:{node:'v24.21.0',platform:'darwin'}},
  ];
  for(const report of invalidReports){
    f.write(report);
    assert.equal(projectStatus(f.root).evidence.status,'failed-or-incomplete');
  }
  f.write();
  assert.equal(projectStatus(f.root).evidence.status,'matches-clean-revision');
});

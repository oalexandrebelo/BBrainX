import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const startHere=['AGENTS.md','docs/engineering/CONTINUITY.md','docs/engineering/ROADMAP.md','docs/RELEASE_READINESS.md'];
/** Read-only handoff: a local report is evidence to inspect, never an attestation or merge permission. */
export function projectStatus(root=process.cwd()){
  const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
  const revision=git('rev-parse','HEAD'),branch=git('branch','--show-current');
  const changes=git('status','--porcelain=v1','--untracked-files=all');
  const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
  const lockSha256=createHash('sha256').update(fs.readFileSync(path.join(root,'package-lock.json'))).digest('hex');
  const reportPath='artifacts/consolidated/validation.json';
  let evidence={status:'missing',path:reportPath};
  if(fs.existsSync(path.join(root,reportPath))){
    try{
      const report=JSON.parse(fs.readFileSync(path.join(root,reportPath),'utf8')),t=report.tests;
      const testFiles=fs.readdirSync(path.join(root,'test')).filter(file=>file.endsWith('.test.mjs')).sort().map(file=>'test/'+file);
      const metadata=report.schemaVersion===1&&typeof report.observedAt==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(report.observedAt)&&Number.isFinite(Date.parse(report.observedAt))
        &&new Date(report.observedAt).toISOString()===report.observedAt
        &&Array.isArray(report.testFiles)&&report.testFiles.length>0&&new Set(report.testFiles).size===report.testFiles.length
        &&report.testFiles.every(file=>typeof file==='string'&&/^test\/[^/]+\.test\.mjs$/.test(file))
        &&JSON.stringify([...report.testFiles].sort())===JSON.stringify(testFiles)
        &&['node','platform','architecture'].every(key=>typeof report.environment?.[key]==='string'&&report.environment[key].length>0);
      const complete=metadata&&report.passed===true&&t&&Number.isSafeInteger(t.tests)&&t.tests>0&&t.pass===t.tests&&['fail','cancelled','skipped','todo'].every(k=>t[k]===0);
      evidence={status:!complete?'failed-or-incomplete':report.revision!==revision?'different-revision':changes?'dirty-worktree':'matches-clean-revision',path:reportPath,revision:report.revision??null,tests:t??null,runId:report.runId??null,observedAt:report.observedAt??null,environment:report.environment??null,testFiles:report.testFiles??null};
    }catch{evidence={status:'unreadable',path:reportPath};}
  }
  return {schemaVersion:1,revision,branch:branch||null,dirty:Boolean(changes),changes:changes?changes.split('\n'):[],version,node:process.version,dependencyLockSha256:lockSha256,
    startHere:startHere.map(file=>({file,present:fs.existsSync(path.join(root,file))})),evidence,
    limitations:['Local evidence is not authenticated; inspect the CI run and its tested tree before promotion.','Revision equality does not establish recency: inspect observedAt, environment and current dependency advisories.','No fetch is performed: branch names and local refs do not establish the current remote state.'],
    nextCommands:['node scripts/consolidated-evidence.mjs','npm run build']};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(projectStatus(),null,2));

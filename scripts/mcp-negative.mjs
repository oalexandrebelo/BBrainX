import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.resolve(process.argv[2]??'artifacts/mcp-transport/negative');
fs.mkdirSync(out,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const before=['mcp.mjs','mcp-flow.mjs','mcp-transport.mjs'].map(f=>[f,hash(fs.readFileSync(path.join(root,'src',f)))]);
const mutations=[
 {id:'inflight-cap-removed',file:'mcp.mjs',from:'if(running.size>=maxInFlightCalls)',to:'if(false)',test:'mcp-admission.test.mjs',pattern:'^in-flight invocation capacity'},
 {id:'active-id-overwrite',file:'mcp.mjs',from:'if(running.has(id))return',to:'if(false)return',test:'mcp-admission.test.mjs',pattern:'^duplicate active handler ID'},
 {id:'utf8-replacement-accepted',file:'mcp-flow.mjs',from:"new TextDecoder('utf-8', { fatal: true })",to:"new TextDecoder('utf-8', { fatal: false })",test:'mcp-flow.test.mjs',pattern:'^malformed UTF8'},
 {id:'frame-cap-removed',file:'mcp-flow.mjs',from:'if (needed > this.#limit)',to:'if (false)',test:'mcp-flow.test.mjs',pattern:'^frame cap is in bytes'},
 {id:'output-byte-cap-removed',file:'mcp-flow.mjs',from:'bytes + this.#bytes > this.#maxBytes',to:'false',test:'mcp-flow.test.mjs',pattern:'^output bytes include'},
 {id:'rate-boundary-regression',file:'mcp-flow.mjs',from:'time - this.#times[this.#head] >= this.#perMs',to:'time - this.#times[this.#head] > this.#perMs',test:'mcp-flow.test.mjs',pattern:'^window boundary is exact'},
 {id:'late-output-deadline-bypass',file:'mcp-flow.mjs',from:'if (performance.now() - entry.enqueuedAt >= this.#deadline)',to:'if (false)',test:'mcp-flow.test.mjs',pattern:'^synchronous delay cannot extend'}
];
const results=[];
for(const m of mutations){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-mcp-mutant-'));
 try{
  fs.cpSync(path.join(root,'src'),path.join(dir,'src'),{recursive:true});fs.mkdirSync(path.join(dir,'test/fixtures'),{recursive:true});
  fs.copyFileSync(path.join(root,'test',m.test),path.join(dir,'test',m.test));
  fs.copyFileSync(path.join(root,'test/fixtures/contract-engine.mjs'),path.join(dir,'test/fixtures/contract-engine.mjs'));
  const target=path.join(dir,'src',m.file),original=fs.readFileSync(target,'utf8');
  assert.equal(original.split(m.from).length,2,'mutation target must exist exactly once');
  const mutant=original.replace(m.from,m.to);fs.writeFileSync(target,mutant);
  const run=spawnSync(process.execPath,['--test','--test-reporter=tap','--test-name-pattern',m.pattern,'test/'+m.test],{cwd:dir,encoding:'utf8',timeout:15000,maxBuffer:4*1024*1024});
  const log=(run.stdout??'')+(run.stderr??'');fs.writeFileSync(path.join(out,m.id+'.log'),log);
  const assertions=(log.match(/code: 'ERR_ASSERTION'/g)??[]).length;
  results.push({id:m.id,source:m.file,selected:m.pattern,detected:!run.error&&run.status!==0&&assertions>0&&!log.includes('ERR_MODULE_NOT_FOUND')&&!log.includes('SyntaxError:'),
    assertionFailures:assertions,exitCode:run.status,sourceSha256:hash(mutant)});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
for(const [file,digest] of before)assert.equal(hash(fs.readFileSync(path.join(root,'src',file))),digest,'production source changed');
const report={schemaVersion:1,observedAt:new Date().toISOString(),node:process.version,platform:process.platform,results,scope:'seven-selected-regressions-not-universal-mutation-score',
 note:'A suíte completa roda sem filtros. Estes controles selecionam intencionalmente o teste que confronta cada defeito; outros testes não são executados neste ensaio.'};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
if(results.some(r=>!r.detected))process.exitCode=1;

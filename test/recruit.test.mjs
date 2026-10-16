import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {cleanup} from './fixtures/cleanup.mjs';
import {BrainStore} from '../src/store.mjs';
import {indexProject} from '../src/retrieval.mjs';
import {makeEngine} from '../src/engine.mjs';
import {toolCatalog} from '../src/mcp.mjs';
import {LaneRegistry} from '../src/lanes/registry.mjs';
import {controlOverview} from '../src/control.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {parseRecruitSpec,normalizeModel,normalizeEffort,planRecruits,startRecruits,recruitStatus,dismissRecruit,recruitDoctor,harnessCommand,locateHarness,LIMITS} from '../src/recruit.mjs';

const entry=fileURLToPath(new URL('../bin/bbrainx.mjs',import.meta.url));
const fixtures=fileURLToPath(new URL('./fixtures/',import.meta.url));
const principal={principal:{id:'host'}};
const git=(cwd,...args)=>execFileSync('git',['-c','core.hooksPath=/dev/null','-c','commit.gpgsign=false','-c','user.name=Test','-c','user.email=test@example.invalid','-C',cwd,...args],{encoding:'utf8',timeout:20000,stdio:['ignore','pipe','pipe']}).trimEnd();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/** Executáveis reais (shell + Node) que falam o contrato das CLIs; apontados por BBRAINX_CLAUDE/BBRAINX_CODEX. */
function installFakeClis(dir){
  const bins={};
  for(const name of ['claude','codex']){
    const file=path.join(dir,name);
    fs.writeFileSync(file,'#!/bin/sh\nexec '+JSON.stringify(process.execPath)+' '+JSON.stringify(path.join(fixtures,'fake-'+name+'.mjs'))+' "$@"\n',{mode:0o755});
    bins[name]=file;
  }
  return bins;
}
function fixture(t){
  const base=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'bb-recruit-'))),home=path.join(base,'state'),root=path.join(base,'repo'),bins=path.join(base,'bin');
  fs.mkdirSync(root);fs.mkdirSync(bins);
  git(root,'init','-q','-b','main');fs.writeFileSync(path.join(root,'app.ts'),'export function verifySession(){ return true; }\n');git(root,'add','-A');git(root,'commit','-q','-m','base');
  const cli=installFakeClis(bins);
  const store=new BrainStore(home);store.register('p',root);indexProject(store,'p');
  const defer=cleanup(t);defer(()=>fs.rmSync(base,{recursive:true,force:true,maxRetries:5}));defer(()=>store.close());
  const previous={BBRAINX_CLAUDE:process.env.BBRAINX_CLAUDE,BBRAINX_CODEX:process.env.BBRAINX_CODEX,FAKE_LOGGED_OUT:process.env.FAKE_LOGGED_OUT,CLAUDECODE:process.env.CLAUDECODE};
  process.env.BBRAINX_CLAUDE=cli.claude;process.env.BBRAINX_CODEX=cli.codex;delete process.env.FAKE_LOGGED_OUT;process.env.CLAUDECODE='1';
  defer(()=>{for(const [k,v] of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v;});
  return {base,home,root,store,cli,engine:makeEngine(store,['p'],{recruit:true})};
}
async function settled(store,project,ids,timeoutMs=40000){
  const until=Date.now()+timeoutMs;
  for(;;){
    const status=recruitStatus(store,project,{ids});
    if(status.items.every(i=>!['running','starting'].includes(i.status)))return status;
    assert(Date.now()<until,'recruits did not settle: '+JSON.stringify(status.items.map(i=>[i.id,i.status])));
    await sleep(200);
  }
}

test('spec text, aliases and efforts normalize to the ids the CLIs accept',()=>{
  assert.deepEqual(parseRecruitSpec('recrute um agent CODEX ASTRA 6 high e 2 Opus 5.5 XHIGH'),[{harness:'codex',model:'gpt-6-astra',effort:'high',count:1},{harness:'claude',model:'claude-opus-5-5',effort:'xhigh',count:2}]);
  assert.deepEqual(parseRecruitSpec('1 codex gpt-6-astra high, 1 claude sonnet'),[{harness:'codex',model:'gpt-6-astra',effort:'high',count:1},{harness:'claude',model:'sonnet',effort:'medium',count:1}]);
  assert.deepEqual(parseRecruitSpec('3x fable 5.1 max'),[{harness:'claude',model:'claude-fable-5-1',effort:'max',count:3}]);
  assert.equal(normalizeModel('codex','GPT 5.6 sol'),'gpt-5.6-sol');assert.equal(normalizeModel('codex','luna 6'),'gpt-6-luna');assert.equal(normalizeModel('claude','claude-opus-5-5'),'claude-opus-5-5');
  assert.equal(normalizeEffort('claude','extra-high'),'xhigh');
  assert.throws(()=>normalizeEffort('codex','turbo'),{code:'RECRUIT_EFFORT_INVALID'});
  assert.throws(()=>normalizeModel('claude','opus; rm -rf /'),{code:'RECRUIT_MODEL_INVALID'});
  assert.throws(()=>parseRecruitSpec('11 opus'),{code:'RECRUIT_COUNT_INVALID'});
  assert.throws(()=>parseRecruitSpec('6 opus e 5 sonnet'),{code:'RECRUIT_COUNT_INVALID'});
  assert.equal(parseRecruitSpec('10 codex sol 6.1 xhigh')[0].count,10,'up to ten agents in one call');
  assert.throws(()=>parseRecruitSpec('high'),{code:'RECRUIT_SPEC_INVALID'});
  assert.throws(()=>parseRecruitSpec('2 mystery-model'),{code:'RECRUIT_SPEC_INVALID'});
});

test('recruitment is a host grant: without --recruit the catalog keeps six tools; with it, nine, still scoped to the allowlist',async t=>{
  const f=fixture(t);
  assert.equal(toolCatalog(makeEngine(f.store,['p'])).tools.length,6);
  const tools=toolCatalog(f.engine).tools.map(x=>x.name);assert.equal(tools.length,9);
  for(const name of ['agents_recruit','agents_status','agents_dismiss'])assert(tools.includes(name),name);
  await assert.rejects(f.engine.invoke('agents.status',{project:'other'},principal),{code:'FORBIDDEN'});
  await assert.rejects(f.engine.invoke('agents.recruit',{project:'p',task:'x'},{principal:null}),{code:'UNAUTHENTICATED'});
});

test('planning refuses bad input before any worktree exists',t=>{
  const f=fixture(t);
  assert.throws(()=>planRecruits(f.store,{project:'p',spec:'1 opus',task:''}),{code:'RECRUIT_TASK_INVALID'});
  assert.throws(()=>planRecruits(f.store,{project:'p',task:'do it'}),{code:'RECRUIT_SPEC_INVALID'});
  assert.throws(()=>planRecruits(f.store,{project:'p',spec:'1 opus',recruits:[{harness:'claude',model:'opus'}],task:'do it'}),{code:'RECRUIT_SPEC_INVALID'});
  assert.throws(()=>planRecruits(f.store,{project:'p',spec:'1 opus',task:'do it',base:'no-such-ref'}),{code:'RECRUIT_BASE_INVALID'});
  assert.throws(()=>planRecruits(f.store,{project:'p',spec:'1 opus',task:'do it',mode:'destroy'}),{code:'RECRUIT_MODE_INVALID'});
  assert.throws(()=>planRecruits(f.store,{project:'p',spec:'1 opus',task:'do it',timeoutMinutes:1}),{code:'RECRUIT_TIMEOUT_INVALID'});
  assert.throws(()=>planRecruits(f.store,{project:'p',spec:'1 opus',task:'do it',account:'/definitely/missing'}),{code:'RECRUIT_ACCOUNT_INVALID'});
  process.env.FAKE_LOGGED_OUT='1';
  assert.throws(()=>planRecruits(f.store,{project:'p',spec:'1 opus',task:'do it'}),{code:'RECRUIT_HARNESS_UNAVAILABLE'});
  delete process.env.FAKE_LOGGED_OUT;
  const plan=planRecruits(f.store,{project:'p',spec:'1 codex astra 6 high e 1 opus 5.5 xhigh',task:'Rename verifySession to checkSession'});
  assert.equal(plan.members.length,2);assert.equal(plan.base.commit,git(f.root,'rev-parse','HEAD'));assert.equal(plan.title,'Rename verifySession to checkSession');
  assert(!fs.existsSync(plan.worktreeRoot),'planning creates nothing');
});

test('claude and codex recruits run in their own worktrees with a lane-scoped BBrainX, get committed and reported',async t=>{
  const f=fixture(t);
  const started=await f.engine.invoke('agents.recruit',{project:'p',spec:'1 opus 5.5 xhigh e 1 codex astra 6 high',task:'Rename verifySession to checkSession and keep the tests green.',title:'rename'},principal);
  assert.equal(started.ok,true,JSON.stringify(started));assert.equal(started.data.started.length,2);assert.deepEqual(started.data.failed,[]);
  const ids=started.data.started.map(x=>x.id);
  const status=await settled(f.store,'p',ids);
  for(const item of status.items){
    assert.equal(item.status,'completed',JSON.stringify(item));
    assert(item.worktree.startsWith(path.join(f.base,'repo.bbx')),item.worktree);
    assert.equal(item.branch,'bbx/'+item.id);assert.equal(item.lane,item.id);
    const observed=JSON.parse(fs.readFileSync(path.join(item.worktree,'recruit-observed.json'),'utf8'));
    assert.equal(fs.realpathSync.native(observed.cwd),item.worktree,'the CLI ran inside the worktree');
    assert.equal(fs.readFileSync(path.join(item.worktree,'app.ts'),'utf8'),'export function verifySession(){ return true; }\n','the base commit is checked out');
    assert.equal(item.commitError,null,'auto-commit: '+item.commitError);assert.equal(item.commitsAhead,1,'the supervisor committed the recruit output');assert.equal(item.dirtyFiles,0);
    assert.match(git(item.worktree,'log','-1','--format=%s'),/^bbx recruit r\d+-[0-9a-f]{6}: rename$/);
    assert.match(fs.readFileSync(item.log,'utf8'),/lane index: 1 files/);
    if(item.harness==='claude'){
      assert.equal(observed.model,'claude-opus-5-5');assert.equal(observed.effort,'xhigh');assert.equal(observed.mode,'acceptEdits');
      assert.equal(observed.env.CLAUDECODE,null,'nested-session variables are stripped');
      const server=observed.mcpConfig.mcpServers.bbrainx;assert.equal(server.env.BBRAINX_HOME,f.home);
      assert.deepEqual(server.args.slice(1),['mcp','--project','p','--lane',item.id,'--workspace',item.worktree,'--harness','claude']);
      assert(observed.allowedTools.includes('Bash(git commit:*)'));assert.match(observed.promptHead,/^You are recruit /);
      assert.equal(item.costUsd,0.0123);assert.equal(item.sessionId,'fixture-session-1');assert.equal(item.usage.inputTokens,10);assert.equal(item.resultSummary,'done: changed recruit-output.txt');
    }else{
      assert.equal(observed.model,'gpt-6-astra');assert.equal(observed.sandbox,'workspace-write');
      assert(observed.configs.includes('model_reasoning_effort="high"'));assert(observed.configs.some(c=>c.startsWith('mcp_servers.bbrainx.args=[')&&c.includes('"--lane","'+item.id+'"')));
      assert.equal(item.sessionId,'fixture-thread-9');assert.equal(item.usage.inputTokens,30);assert.equal(item.usage.reasoningTokens,2);assert.equal(item.resultSummary,'codex done');assert.equal(item.costUsd,null);
    }
  }
  assert.equal(git(f.root,'status','--porcelain'),'','the primary checkout was never touched');
  const registry=new LaneRegistry(f.home);try{for(const id of ids)assert.equal(registry.get('p',id).status,'active');}finally{registry.close();}
  const overview=controlOverview(f.store,'p');assert.equal(overview.recruits.length,2);assert(overview.recruits.every(r=>r.status==='completed'));
  const viaTool=await f.engine.invoke('agents.status',{project:'p',ids:[ids[0]],includeLog:true},principal);assert.equal(viaTool.data.items.length,1);assert.match(viaTool.data.items[0].logTail,/exit code 0/);
  const kept=await f.engine.invoke('agents.dismiss',{project:'p',id:ids[0]},principal);assert.equal(kept.ok,true);assert.equal(kept.data.branch,'bbx/'+ids[0]);
  assert(!fs.existsSync(status.items.find(i=>i.id===ids[0]).worktree));assert.equal(git(f.root,'rev-parse','--verify','bbx/'+ids[0]).length,40,'branch kept');
  const removed=dismissRecruit(f.store,'p',ids[1],{deleteBranch:true});assert.equal(removed.branch,null);
  assert.equal(spawnSync('git',['-C',f.root,'rev-parse','--verify','bbx/'+ids[1]]).status,128,'branch deleted');
  const after=new LaneRegistry(f.home);try{for(const id of ids)assert.equal(after.get('p',id).status,'closed');}finally{after.close();}
  assert.throws(()=>dismissRecruit(f.store,'p',ids[0]),{code:'RECRUIT_ALREADY_DISMISSED'});
  assert.equal(recruitStatus(f.store,'p').items.filter(i=>i.status==='dismissed').length,2);
});

test('a failing CLI, a review-only recruit and a stop request are reported truthfully',async t=>{
  const f=fixture(t);
  const started=startRecruits(f.store,planRecruits(f.store,{project:'p',spec:'1 opus e 1 codex sol 5.6',task:'FAIL_PLEASE for claude; review only for codex',mode:'review'}));
  const status=await settled(f.store,'p',started.started.map(x=>x.id));
  const claude=status.items.find(i=>i.harness==='claude'),codex=status.items.find(i=>i.harness==='codex');
  assert.equal(claude.status,'failed');assert.equal(claude.reason,'HARNESS_ERROR');assert.equal(claude.exitCode,1);assert.equal(claude.resultSummary,'could not finish');
  assert.equal(codex.status,'completed');assert.equal(codex.commitsAhead,0,'review mode never commits');
  assert.equal(JSON.parse(fs.readFileSync(path.join(codex.worktree,'recruit-observed.json'),'utf8')).sandbox,'read-only');
  assert.equal(JSON.parse(fs.readFileSync(path.join(claude.worktree,'recruit-observed.json'),'utf8')).mode,'plan');
  const sleeper=startRecruits(f.store,planRecruits(f.store,{project:'p',spec:'1 haiku',task:'SLEEP_FOREVER'}));
  const id=sleeper.started[0].id;
  for(let i=0;i<100&&recruitStatus(f.store,'p',{ids:[id]}).items[0].status!=='running';i++)await sleep(100);
  assert.equal(recruitStatus(f.store,'p',{ids:[id]}).items[0].status,'running');
  assert.throws(()=>dismissRecruit(f.store,'p',id),{code:'RECRUIT_STILL_RUNNING'});
  const stopped=dismissRecruit(f.store,'p',id,{stop:true});assert.equal(stopped.status,'dismissed');
  const final=recruitStatus(f.store,'p',{ids:[id]}).items[0];assert.equal(final.status,'dismissed');assert.equal(final.reason,'STOPPED');assert(!fs.existsSync(final.worktree));
});

test('doctor reports the CLIs, their login and the Codex rate-limit windows without reading any credential',async t=>{
  const f=fixture(t);
  const report=await recruitDoctor();
  const claude=report.harnesses.find(h=>h.harness==='claude'),codex=report.harnesses.find(h=>h.harness==='codex');
  assert.equal(claude.binary,f.cli.claude);assert.equal(claude.loggedIn,true);assert.equal(claude.version,'9.9.9 (Claude Code fixture)');
  assert.equal(codex.loggedIn,true);assert.equal(report.codexRateLimits.available,true);assert.equal(report.codexRateLimits.primary.usedPercent,12);assert.equal(report.codexRateLimits.primary.windowSeconds,18000);assert.equal(report.codexRateLimits.planType,'fixture');assert.equal(report.codexRateLimits.primary.resetsAt,'2030-03-17T17:46:40.000Z');
  process.env.FAKE_LOGGED_OUT='1';assert.equal((await recruitDoctor()).harnesses[0].loggedIn,false);delete process.env.FAKE_LOGGED_OUT;
  assert.deepEqual(locateHarness('claude'),{binary:f.cli.claude,source:'env'});
  delete process.env.BBRAINX_CLAUDE;const located=locateHarness('claude',{env:{PATH:path.dirname(f.cli.claude)}});assert.equal(located.source,'PATH');
  const fallback=locateHarness('codex',{env:{PATH:'/nonexistent'},home:f.base});assert(fallback===null||(fallback.source==='known-install'&&path.isAbsolute(fallback.binary)),'only a real native install may answer without PATH');
  assert.throws(()=>locateHarness('codex',{env:{BBRAINX_CODEX:'relative/codex'}}),{code:'RECRUIT_HARNESS_OVERRIDE_INVALID'});
});

test('network is opt-in for Codex implement recruits and never widens a review',()=>{
  const record={id:'r1',project:'p',lane:'r1',harness:'codex',model:'gpt-6-astra',effort:'max',mode:'implement',worktree:'/tmp/wt',branch:'bbx/r1',base:{commit:'a'.repeat(40)},log:'/tmp/rn.log',budgetUsd:null,tools:null};
  fs.writeFileSync('/tmp/rn.task.md','T');
  const flag='sandbox_workspace_write.network_access=true';
  assert(!harnessCommand(record,{node:'/n',entry:'/e',home:'/h',binary:'/b/codex'}).includes(flag),'off by default');
  assert(harnessCommand({...record,network:true},{node:'/n',entry:'/e',home:'/h',binary:'/b/codex'}).includes(flag));
  assert(!harnessCommand({...record,network:true,mode:'review'},{node:'/n',entry:'/e',home:'/h',binary:'/b/codex'}).includes(flag),'review stays read-only and offline');
  fs.rmSync('/tmp/rn.task.md',{force:true});
});

test('harness argv is exact, shell-free and never forwards --recruit to the recruit\'s own server',()=>{
  const record={id:'r1',project:'p',lane:'r1',harness:'codex',model:'gpt-6-astra',effort:'high',mode:'implement',worktree:'/tmp/wt',branch:'bbx/r1',base:{commit:'a'.repeat(40)},log:'/tmp/r1.log',budgetUsd:null,tools:null};
  fs.writeFileSync('/tmp/r1.task.md','TASK TEXT');
  const codex=harnessCommand(record,{node:'/n/node',entry:'/e/bbrainx.mjs',home:'/h',binary:'/b/codex'});
  assert.deepEqual(codex.slice(0,10),['/b/codex','exec','--skip-git-repo-check','-C','/tmp/wt','--sandbox','workspace-write','-m','gpt-6-astra','-c']);
  assert(codex.includes('mcp_servers.bbrainx.args=["/e/bbrainx.mjs","mcp","--project","p","--lane","r1","--workspace","/tmp/wt","--harness","codex"]'));
  assert(!codex.some(a=>a.includes('--recruit')));assert.match(codex.at(-1),/TASK:\nTASK TEXT$/);
  const claude=harnessCommand({...record,harness:'claude',model:'opus',effort:'max',budgetUsd:5,tools:['Bash(make test:*)']},{node:'/n/node',entry:'/e/bbrainx.mjs',home:'/h',binary:'/b/claude'});
  assert.equal(claude[0],'/b/claude');assert(claude.includes('--max-budget-usd')&&claude.includes('5'));assert(claude.includes('Bash(make test:*)'));
  assert.equal(JSON.parse(claude[claude.indexOf('--mcp-config')+1]).mcpServers.bbrainx.args.at(-1),'claude');
  fs.rmSync('/tmp/r1.task.md',{force:true});
});

test('CLI: start without --apply only plans; status and doctor are read-only; the catalog limits are published',t=>{
  const f=fixture(t);
  const run=(...args)=>spawnSync(process.execPath,[entry,...args],{encoding:'utf8',env:{...process.env,BBRAINX_HOME:f.home}});
  const plan=run('recruit','start','--project','p','--spec','2 opus','--task','just plan');
  assert.equal(plan.status,0,plan.stderr);assert.equal(JSON.parse(plan.stdout).plan.members.length,2);assert(!fs.existsSync(path.join(f.base,'repo.bbx')));
  const status=run('recruit','status','--project','p');assert.equal(status.status,0,status.stderr);assert.equal(JSON.parse(status.stdout).count,0);
  const doctor=run('recruit','doctor');assert.equal(doctor.status,0,doctor.stderr);assert.equal(JSON.parse(doctor.stdout).limits.perCall,LIMITS.perCall);
  const missing=run('recruit','start','--project','p','--spec','1 opus');assert.equal(missing.status,1);assert.match(missing.stderr,/TASK_REQUIRED/);
  assert.match(run('help').stdout,/recruit start --project/);
});

test('a real stdio server started with --recruit lists nine tools and says so in its instructions; without the flag, six and silence',async t=>{
  const f=fixture(t);
  for(const [flags,expected] of [[['--recruit'],9],[[],6]]){
    const client=new Client({name:'recruit-probe',version:'1'});
    const transport=new StdioClientTransport({command:process.execPath,args:[entry,'mcp','--project','p',...flags],env:{...process.env,BBRAINX_HOME:f.home},stderr:'pipe'});
    transport.stderr?.on('data',()=>{});
    try{
      await client.connect(transport);
      const tools=(await client.listTools()).tools.map(x=>x.name);assert.equal(tools.length,expected,flags.join(' '));
      assert.equal(tools.includes('agents_recruit'),expected===9);
      const instructions=client.getInstructions()||'';assert.equal(/agents_recruit/.test(instructions),expected===9,'instructions mention recruitment only when granted');
    }finally{await client.close();}
  }
});

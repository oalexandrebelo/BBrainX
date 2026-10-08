import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {BrainStore} from '../src/store.mjs';
import {compileContext} from '../src/context.mjs';
import {CLAUDE_IMPORT_LIMITS,HARNESS_CONTEXT_CATALOG,discoverClaudeSessions,importClaudeSession,discoverHarnessContexts,importHarnessContext} from '../src/context-import.mjs';

function fixture(t){
  const temp=fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()),'bb-import-')),userHome=path.join(temp,'user'),root=path.join(temp,'repo'),foreign=path.join(temp,'other');
  fs.mkdirSync(userHome);fs.mkdirSync(root);fs.mkdirSync(foreign);fs.writeFileSync(path.join(root,'README.md'),'Fixture repository evidence.');
  const store=new BrainStore(path.join(temp,'state'));store.register('project',root);store.register('foreign',foreign);
  t.after(()=>{store.close();fs.rmSync(temp,{recursive:true,force:true});});
  const session=(records,{harness='claude',folder='repo',name='session',nested=''}={})=>{
    const directory=path.join(userHome,'.'+harness,harness==='codex'?'sessions':'projects',folder,...(harness==='cursor'?['agent-transcripts']:[]),nested);
    fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,name+'.jsonl');
    fs.writeFileSync(file,records.map(record=>typeof record==='string'?record:JSON.stringify(record)).join('\n')+'\n');return file;
  };
  return {temp,userHome,root,foreign,store,session};
}
const message=(cwd,type,content,extra={})=>({cwd,type,message:{content},...extra});
test('Claude discovery returns historical metadata without conversation text',t=>{
  const f=fixture(t),file=f.session([message(f.root,'user','PRIVATE_CHAT'),message(f.root,'assistant','PRIVATE_ANSWER')]);
  f.session([message(f.foreign,'user','OTHER_CHAT')],{name:'other'});
  const result=discoverClaudeSessions({userHome:f.userHome,root:f.root});
  assert.equal(result.activity,'historical');assert.equal(result.sessions.length,1);assert.equal(result.sessions[0].path,file);
  assert.equal(result.sessions[0].workspace,f.root);assert(!JSON.stringify(result).includes('PRIVATE_CHAT'));assert(!JSON.stringify(result).includes('OTHER_CHAT'));
});
test('Claude import retains only visible text as untrusted checkpoint evidence',t=>{
  const f=fixture(t),file=f.session([
    message(f.root,'user','Continue authentication'),
    message(f.root,'assistant',[{type:'text',text:'Visible answer'},{type:'thinking',thinking:'HIDDEN_THINKING'},{type:'tool_use',input:{secret:'HIDDEN_TOOL_INPUT'}}]),
    message(f.root,'user',[{type:'tool_result',content:'HIDDEN_TOOL_RESULT'}]),message(f.root,'system','HIDDEN_SYSTEM'),message(f.root,'user','HIDDEN_META',{isMeta:true})
  ]);
  const result=importClaudeSession(f.store,{project:'project',file,userHome:f.userHome}),checkpoint=f.store.task('project',result.task);
  assert.equal(result.messagesRetained,2);assert(!JSON.stringify(result).includes('Visible answer'));assert(checkpoint.content.done.some(item=>item.includes('Visible answer')));
  for(const hidden of ['HIDDEN_THINKING','HIDDEN_TOOL_INPUT','HIDDEN_TOOL_RESULT','HIDDEN_SYSTEM','HIDDEN_META'])assert(!JSON.stringify(checkpoint).includes(hidden));
  assert(checkpoint.content.done.every(item=>item.startsWith('[untrusted imported ')));assert.deepEqual(f.store.memories('project'),[]);
  assert.equal(fs.readFileSync(path.join(result.artifactPath,'source.jsonl'),'utf8'),fs.readFileSync(file,'utf8'));
  if(process.platform!=='win32'){assert.equal(fs.statSync(result.artifactPath).mode&0o777,0o700);assert.equal(fs.statSync(path.join(result.artifactPath,'source.jsonl')).mode&0o777,0o600);}
  assert(compileContext(f.store,{project:'project',task:result.task,query:'authentication',budget:4000}).text.includes('Visible answer'));
});
test('import repeat replays the historical checkpoint and changed sources use CAS',t=>{
  const f=fixture(t),file=f.session([message(f.root,'user','First objective')]),args={project:'project',file,userHome:f.userHome};
  const first=importClaudeSession(f.store,args),again=importClaudeSession(f.store,args);
  assert.equal(again.duplicate,true);assert.equal(again.checkpointVersion,1);assert.equal(again.task,first.task);assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM task_history').get().n,1);
  assert.throws(()=>importClaudeSession(f.store,{...args,expectedVersion:2}),{code:'IDEMPOTENCY_CONFLICT'});
  fs.appendFileSync(file,JSON.stringify(message(f.root,'assistant','New evidence'))+'\n');
  assert.throws(()=>importClaudeSession(f.store,{...args,expectedVersion:0}),{code:'VERSION_CONFLICT'});
  const changed=importClaudeSession(f.store,args);assert.equal(changed.checkpointVersion,2);assert.equal(changed.task,first.task);assert.notEqual(changed.sourceSha256,first.sourceSha256);
});
test('compaction boundaries and compact summaries replace earlier excerpts',t=>{
  const f=fixture(t),file=f.session([message(f.root,'user','PRE_BOUNDARY'),{type:'system',subtype:'compact_boundary',cwd:f.root},message(f.root,'assistant','PRE_SUMMARY'),message(f.root,'user','Compact summary',{isCompactSummary:true}),message(f.root,'assistant','Continue from summary')]);
  const result=importClaudeSession(f.store,{project:'project',file,userHome:f.userHome}),content=f.store.task('project',result.task).content;
  assert.equal(result.compactions,2);assert(!JSON.stringify(content).includes('PRE_BOUNDARY'));assert(!JSON.stringify(content).includes('PRE_SUMMARY'));assert(JSON.stringify(content).includes('Compact summary'));
});
test('all declared workspaces must match the registered root exactly',t=>{
  const f=fixture(t),nested=path.join(f.root,'nested');fs.mkdirSync(nested);
  for(const cwd of [f.foreign,nested]){
    const file=f.session([message(f.root,'user','Matching first record'),message(cwd,'assistant','Wrong workspace')],{name:path.basename(cwd)});
    assert.throws(()=>importClaudeSession(f.store,{project:'project',file,userHome:f.userHome}),{code:'CLAUDE_PROJECT_MISMATCH'});
  }
  assert.equal(f.store.tasks('project').length,0);assert(!fs.existsSync(path.join(f.store.home,'imports-v1')));
});
test('import refuses missing workspace, sidechains and malformed or partial JSON',t=>{
  const f=fixture(t);
  for(const [records,code] of [
    [[{type:'user',message:{content:'No workspace'}}],'CLAUDE_WORKSPACE_MISSING'],
    [[message(f.root,'user','Subagent',{isSidechain:true})],'CLAUDE_SIDECHAIN_FORBIDDEN'],
    [[message(f.root,'user','Okay'),'{"type":'],'CLAUDE_JSON_INVALID']
  ]){
    const file=f.session(records,{name:code});assert.throws(()=>importClaudeSession(f.store,{project:'project',file,userHome:f.userHome}),{code});
  }
  assert.equal(f.store.tasks('project').length,0);
});
test('import refuses source symlinks, traversal and subagent directories',t=>{
  const f=fixture(t),file=f.session([message(f.root,'user','Safe')]),link=path.join(path.dirname(file),'link.jsonl');fs.symlinkSync(file,link,'file');
  const subagent=f.session([message(f.root,'user','Subagent')],{nested:'subagents'}),outside=path.join(f.temp,'outside.jsonl');fs.copyFileSync(file,outside);
  for(const candidate of [link,subagent,outside])assert.throws(()=>importClaudeSession(f.store,{project:'project',file:candidate,userHome:f.userHome}));
  assert.equal(discoverClaudeSessions({userHome:f.userHome}).sessions.length,1);
});
test('import refuses oversized files and lines without publishing checkpoints',t=>{
  const f=fixture(t),file=f.session([message(f.root,'user','Initial')]),large=f.session([message(f.root,'user','x'.repeat(CLAUDE_IMPORT_LIMITS.lineBytes))],{name:'line'});
  fs.truncateSync(file,CLAUDE_IMPORT_LIMITS.fileBytes+1);
  assert.throws(()=>importClaudeSession(f.store,{project:'project',file,userHome:f.userHome}),{code:'CLAUDE_FILE_LIMIT'});
  assert.throws(()=>importClaudeSession(f.store,{project:'project',file:large,userHome:f.userHome}),{code:'CLAUDE_LINE_LIMIT'});
  assert.equal(f.store.tasks('project').length,0);
});
test('import bounds retained messages and checkpoint bytes with explicit truncation',t=>{
  const f=fixture(t),file=f.session(Array.from({length:30},(_,i)=>message(f.root,i%2?'assistant':'user',String(i)+' '+'界'.repeat(2000))));
  const result=importClaudeSession(f.store,{project:'project',file,userHome:f.userHome}),checkpoint=f.store.task('project',result.task);
  assert(result.messagesRetained<=20);assert(result.truncated);assert(Buffer.byteLength(JSON.stringify(checkpoint.content))<16384);assert(checkpoint.content.done.every(item=>item.length<=600));
  assert(checkpoint.content.done.at(-1).includes('29'));assert(!checkpoint.content.done.some(item=>item.includes('[untrusted imported user] 0 ')));
  const context=compileContext(f.store,{project:'project',task:result.task,query:'continue imported task',budget:4000});
  assert(context.checkpointTrimmed);assert(context.text.includes('untrusted user excerpt: 28'));assert(context.text.includes('Last assistant excerpt (untrusted): 29'));
});
test('invalid UTF-8 cannot silently change imported evidence',t=>{
  const f=fixture(t),file=f.session([message(f.root,'user','Initial')]);fs.appendFileSync(file,Buffer.from([0x7b,0x22,0x78,0x22,0x3a,0x22,0xff,0x22,0x7d,0x0a]));
  assert.throws(()=>importClaudeSession(f.store,{project:'project',file,userHome:f.userHome}),{code:'CLAUDE_UTF8_INVALID'});
});
test('JSON escaping cannot expand checkpoint excerpts beyond the durable payload limit',t=>{
  const f=fixture(t),file=f.session(Array.from({length:20},(_,i)=>message(f.root,i%2?'assistant':'user','Control '+i+' '+String.fromCharCode(1).repeat(2000))));
  const result=importClaudeSession(f.store,{project:'project',file,userHome:f.userHome});
  assert(result.truncated);assert(Buffer.byteLength(JSON.stringify(f.store.task('project',result.task).content))<=16384);
});
test('discovery limits directories and reads only metadata prefixes',t=>{
  const f=fixture(t);
  for(let i=0;i<130;i++)f.session([message(f.root,'user','Not returned')],{folder:'dir'+i});
  const discovered=discoverClaudeSessions({userHome:f.userHome});assert(discovered.truncated);assert(discovered.sessions.length<=128);assert(!JSON.stringify(discovered).includes('Not returned'));
});
test('identical source bytes at different session paths retain separate manifests',t=>{
  const f=fixture(t),records=[message(f.root,'user','Same text')],one=f.session(records,{name:'one'}),two=f.session(records,{name:'two'});
  const a=importClaudeSession(f.store,{project:'project',file:one,userHome:f.userHome}),b=importClaudeSession(f.store,{project:'project',file:two,userHome:f.userHome});
  assert.equal(a.sourceSha256,b.sourceSha256);assert.notEqual(a.artifactPath,b.artifactPath);assert.notEqual(a.task,b.task);
});
test('Cursor embedded workspace transcripts share the bounded importer without SQLite access',t=>{
  const f=fixture(t),file=f.session([{role:'user',cwd:f.root,message:{content:'Cursor objective'}},{role:'assistant',cwd:f.root,message:{content:[{type:'text',text:'Cursor answer'},{type:'thinking',text:'Hidden thought'}]}}],{harness:'cursor'});
  const discovered=discoverHarnessContexts({harness:'cursor',userHome:f.userHome,root:f.root});assert.equal(discovered.sessions[0].path,file);
  const result=importHarnessContext(f.store,{harness:'cursor',project:'project',file,userHome:f.userHome});assert(result.task.startsWith('cursor-'));assert(f.store.task('project',result.task).content.done.some(item=>item.includes('Cursor answer')));
});
test('Cursor missing cwd requires a separate explicit confirmation and stays unverified',t=>{
  const f=fixture(t),folder=f.root.replaceAll('/','-').replace(/^-/,'');
  const file=f.session([{role:'user',message:{content:'Cursor without cwd'}}],{harness:'cursor',folder});
  assert.equal(discoverHarnessContexts({harness:'cursor',userHome:f.userHome}).sessions.length,0);
  const detected=discoverHarnessContexts({harness:'cursor',userHome:f.userHome,root:f.root});assert.equal(detected.sessions.length,0);assert(detected.warnings.includes('CURSOR_WORKSPACE_UNVERIFIED'));
  assert.throws(()=>importHarnessContext(f.store,{harness:'cursor',project:'project',file,userHome:f.userHome}),{code:'CURSOR_WORKSPACE_UNVERIFIED'});
  const imported=importHarnessContext(f.store,{harness:'cursor',project:'project',file,userHome:f.userHome,confirmedWorkspace:f.root});assert.equal(imported.checkpointVersion,1);assert.equal(imported.workspaceSource,'host-confirmed-not-source-verified');assert(imported.warnings.includes('CURSOR_WORKSPACE_UNVERIFIED'));
  assert.throws(()=>importHarnessContext(f.store,{harness:'cursor',project:'foreign',file,userHome:f.userHome,confirmedWorkspace:f.root}),{code:'CURSOR_WORKSPACE_UNVERIFIED'});
});
test('Cursor lossy folder encoding never decides ownership between registered projects',t=>{
  const f=fixture(t),one=path.join(f.temp,'a-b','c'),two=path.join(f.temp,'a','b-c');fs.mkdirSync(one,{recursive:true});fs.mkdirSync(two,{recursive:true});f.store.register('one',one);f.store.register('two',two);
  const folder=one.replaceAll('/','-').replace(/^-/,'');assert.equal(folder,two.replaceAll('/','-').replace(/^-/,''));
  const file=f.session([{role:'user',message:{content:'Ambiguous objective'}}],{harness:'cursor',folder});
  for(const [project,confirmedWorkspace] of [['one',one],['two',two]])assert.throws(()=>importHarnessContext(f.store,{harness:'cursor',project,file,userHome:f.userHome,confirmedWorkspace}),{code:'CURSOR_WORKSPACE_AMBIGUOUS'});
  assert.equal(f.store.tasks('one').length,0);assert.equal(f.store.tasks('two').length,0);
});
const codexMessage=(role,text,extra=[])=>({type:'message',role,content:[{type:role==='user'?'input_text':'output_text',text},...extra]});
test('Codex native discovery reads metadata and imports visible native messages only',t=>{
  const f=fixture(t),file=f.session([{type:'session_meta',payload:{id:'thread-id',cwd:f.root,base_instructions:'HIDDEN_INSTRUCTIONS'}},{type:'response_item',payload:codexMessage('user','NATIVE_PRIVATE_MESSAGE')},{type:'response_item',payload:codexMessage('assistant','Native answer',[{type:'input_image',image_url:'HIDDEN_IMAGE'}])},{type:'response_item',payload:codexMessage('developer','HIDDEN_DEVELOPER')},{type:'response_item',payload:{type:'function_call_output',output:'HIDDEN_TOOL'}},{type:'response_item',payload:{type:'reasoning',summary:[{text:'HIDDEN_REASONING'}]}},{type:'event_msg',payload:{type:'user_message',message:'HIDDEN_EVENT_DUPLICATE'}}],{harness:'codex',folder:'2026',nested:'10/08',name:'rollout-id'});
  f.session([{type:'session_meta',payload:{id:'subagent',cwd:f.root,parent_thread_id:'parent'}}],{harness:'codex',folder:'2026',name:'subagent'});
  const result=discoverHarnessContexts({harness:'codex',userHome:f.userHome,root:f.root});assert.equal(result.sessions.length,1);assert.equal(result.sessions[0].id,'thread-id');assert.equal(result.sessions[0].path,file);assert(!JSON.stringify(result).includes('NATIVE_PRIVATE_MESSAGE'));
  const imported=importHarnessContext(f.store,{harness:'codex',project:'project',file,userHome:f.userHome}),content=JSON.stringify(f.store.task('project',imported.task).content);
  assert.equal(imported.messagesRetained,2);assert(content.includes('Native answer'));assert(!JSON.stringify(imported).includes('Native answer'));
  for(const hidden of ['HIDDEN_INSTRUCTIONS','HIDDEN_IMAGE','HIDDEN_DEVELOPER','HIDDEN_TOOL','HIDDEN_REASONING','HIDDEN_EVENT_DUPLICATE'])assert(!content.includes(hidden));
  assert.equal(importHarnessContext(f.store,{harness:'codex',project:'project',file,userHome:f.userHome}).duplicate,true);
  assert.deepEqual(HARNESS_CONTEXT_CATALOG.filter(item=>item.import).map(item=>item.id),['claude','cursor','codex']);
});
test('Codex compaction uses replacement history and summary fallback without replaying tools',t=>{
  const f=fixture(t),file=f.session([{type:'session_meta',payload:{cwd:f.root}},{type:'response_item',payload:codexMessage('user','BEFORE_COMPACT')},{type:'compacted',payload:{message:'IGNORED_WHEN_REPLACEMENT_PRESENT',replacement_history:[codexMessage('developer','HIDDEN_DEVELOPER'),codexMessage('user','Replaced objective'),{type:'function_call_output',output:'HIDDEN_TOOL'},codexMessage('assistant','Replaced answer')]}},{type:'event_msg',payload:{type:'context_compacted'}},{type:'response_item',payload:codexMessage('assistant','Continue after compaction')}],{harness:'codex'});
  const first=importHarnessContext(f.store,{harness:'codex',project:'project',file,userHome:f.userHome});let content=JSON.stringify(f.store.task('project',first.task).content);
  assert.equal(first.compactions,1);assert.equal(first.messagesRetained,3);assert(content.includes('Replaced objective'));assert(content.includes('Continue after compaction'));
  for(const hidden of ['BEFORE_COMPACT','IGNORED_WHEN_REPLACEMENT_PRESENT','HIDDEN_DEVELOPER','HIDDEN_TOOL'])assert(!content.includes(hidden));
  fs.appendFileSync(file,JSON.stringify({type:'compacted',payload:{message:'Summary fallback'}})+'\n');
  const second=importHarnessContext(f.store,{harness:'codex',project:'project',file,userHome:f.userHome});content=JSON.stringify(f.store.task('project',second.task).content);
  assert.equal(second.compactions,2);assert.equal(second.messagesRetained,1);assert(content.includes('Summary fallback'));assert(!content.includes('Replaced objective'));
});
test('Codex import rejects cross-project metadata, child agents, missing cwd and symlinks',t=>{
  const f=fixture(t);
  for(const [meta,extra,code] of [[{cwd:f.root},[{type:'turn_context',payload:{cwd:f.foreign}}],'CLAUDE_PROJECT_MISMATCH'],[{cwd:f.root,parent_thread_id:'parent'},[],'CLAUDE_SIDECHAIN_FORBIDDEN'],[{},[],'CLAUDE_WORKSPACE_MISSING']]){
    const file=f.session([{type:'session_meta',payload:meta},{type:'response_item',payload:codexMessage('user','Native objective')},...extra],{harness:'codex',name:code});
    assert.throws(()=>importHarnessContext(f.store,{harness:'codex',project:'project',file,userHome:f.userHome}),{code});
  }
  const file=f.session([{type:'session_meta',payload:{cwd:f.root}},{type:'response_item',payload:codexMessage('user','Safe')}],{harness:'codex'}),link=path.join(path.dirname(file),'link.jsonl');fs.symlinkSync(file,link);
  assert.throws(()=>importHarnessContext(f.store,{harness:'codex',project:'project',file:link,userHome:f.userHome}),{code:'UNSAFE_CLAUDE_PATH'});assert.equal(f.store.tasks('project').length,0);
});
test('Codex rejects real SessionSource and thread_source child-agent metadata without parent ids',t=>{
  const f=fixture(t);
  for(const [i,meta] of [{source:{subagent:'thread_spawn'}},{source:{subagent:{guardian_review:{review_id:'review'}}}},{thread_source:'subagent'},{thread_source:'guardian_review'},{source:'subagent'}].entries()){
    const file=f.session([{type:'session_meta',payload:{cwd:f.root,...meta}},{type:'response_item',payload:codexMessage('user','Child-agent message')}],{harness:'codex',name:'child-'+i});
    assert.throws(()=>importHarnessContext(f.store,{harness:'codex',project:'project',file,userHome:f.userHome}),{code:'CLAUDE_SIDECHAIN_FORBIDDEN'});
  }
  assert.equal(discoverHarnessContexts({harness:'codex',userHome:f.userHome}).sessions.length,0);assert.equal(f.store.tasks('project').length,0);
});
test('Codex imports bounded local text and never follows referenced rollout history',t=>{
  const f=fixture(t),file=f.session([{type:'session_meta',payload:{cwd:f.root,history_base:{path:path.join(f.foreign,'secret.jsonl')}}},...Array.from({length:30},(_,i)=>({type:'response_item',payload:codexMessage(i%2?'assistant':'user',String(i)+' '+'z'.repeat(3000))}))],{harness:'codex'});
  const result=importHarnessContext(f.store,{harness:'codex',project:'project',file,userHome:f.userHome});
  assert(result.historyIncomplete);assert(result.truncated);assert(result.messagesRetained<=20);assert(Buffer.byteLength(JSON.stringify(f.store.task('project',result.task).content))<16384);
  assert(f.store.task('project',result.task).content.evidence[0].result.includes('referenced history is not followed'));
});
test('default discovery gathers every validated driver and reports unsupported MCP clients explicitly',t=>{
  const f=fixture(t);
  f.session([message(f.root,'user','CLAUDE_PRIVATE')]);f.session([{role:'user',cwd:f.root,message:{content:'CURSOR_PRIVATE'}}],{harness:'cursor'});f.session([{type:'session_meta',payload:{cwd:f.root}},{type:'response_item',payload:codexMessage('user','CODEX_PRIVATE')}],{harness:'codex'});
  const result=discoverHarnessContexts({userHome:f.userHome,root:f.root});assert.equal(result.source,'all');assert.deepEqual(result.sessions.map(item=>item.source).sort(),['claude','codex','cursor']);assert.equal(result.sources.length,3);
  for(const privateText of ['CLAUDE_PRIVATE','CURSOR_PRIVATE','CODEX_PRIVATE'])assert(!JSON.stringify(result).includes(privateText));
  for(const harness of ['kilo','antigravity']){const unsupported=discoverHarnessContexts({harness,userHome:f.userHome});assert.equal(unsupported.status,'unsupported');assert.equal(unsupported.sessions.length,0);assert.equal(HARNESS_CONTEXT_CATALOG.find(item=>item.id===harness).mcp,true);assert.throws(()=>importHarnessContext(f.store,{harness,project:'project',file:'unread',userHome:f.userHome}),{code:'HARNESS_CONTEXT_IMPORT_UNSUPPORTED'});}
  assert.equal(HARNESS_CONTEXT_CATALOG.find(item=>item.id==='omniroute').providerOnly,true);assert.throws(()=>discoverHarnessContexts({harness:'unknown',userHome:f.userHome}),{code:'HARNESS_CONTEXT_UNSUPPORTED'});
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensure, hash, identifier, canonical } from './primitives.mjs';
import { safeDirectory } from './host.mjs';
import { saveCheckpoint } from './session.mjs';
import { verifyRoot } from './source-root.mjs';

export const CLAUDE_IMPORT_LIMITS=Object.freeze({directories:128,files:1024,metadataBytes:65536,fileBytes:32*1024*1024,lineBytes:1024*1024,records:100000,messages:20,tailBytes:32768,checkpointTextBytes:9000});
export const HARNESS_CONTEXT_CATALOG=Object.freeze([
  Object.freeze({id:'claude',discovery:true,import:true,config:true,mcp:true,format:'claude-project-jsonl'}),
  Object.freeze({id:'cursor',discovery:true,import:true,config:true,mcp:true,format:'cursor-agent-transcript-jsonl'}),
  Object.freeze({id:'codex',discovery:true,import:true,config:true,mcp:true,format:'codex-native-rollout-jsonl'}),
  ...['kilo','antigravity','antigravity-cli','gemini','vscode','opencode-v1','opencode-v2','generic'].map(id=>Object.freeze({id,discovery:false,import:false,config:true,mcp:true,reason:'Historical session format is not validated; use project-bound MCP checkpoints.'})),
  Object.freeze({id:'omniroute',discovery:false,import:false,config:false,mcp:false,providerOnly:true,reason:'Model routing provider; does not own harness sessions.'})
]);
const adapter=id=>{const value=HARNESS_CONTEXT_CATALOG.find(item=>item.id===id);ensure(value,'HARNESS_CONTEXT_UNSUPPORTED');return value;};
const inside=(root,file)=>{const relative=path.relative(root,file);return relative!==''&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);};
function projectsRoot(userHome,harness='claude'){
  adapter(harness);
  const home=fs.realpathSync.native(userHome),directory=path.join(home,'.'+harness),projects=path.join(directory,harness==='codex'?'sessions':'projects');
  for(const item of [directory,projects])ensure(!fs.lstatSync(item).isSymbolicLink()&&fs.statSync(item).isDirectory(),'UNSAFE_CLAUDE_PATH');
  return projects;
}
function sourceFile(base,file,harness='claude'){
  ensure(typeof file==='string'&&path.isAbsolute(file)&&inside(base,file),'CLAUDE_SOURCE_FORBIDDEN');
  const relative=path.relative(base,file),parts=relative.split(path.sep);
  ensure(parts.length<=16&&parts.at(-1).endsWith('.jsonl')&&!parts.at(-1).startsWith('agent-')&&!parts.includes('subagents'),'CLAUDE_SOURCE_FORBIDDEN');
  ensure(harness==='codex'||(harness==='claude'?parts.length===2:parts.length>=3&&parts[1]==='agent-transcripts'),'CLAUDE_SOURCE_FORBIDDEN');
  let parent=base;
  for(const part of parts.slice(0,-1)){parent=path.join(parent,part);ensure(!fs.lstatSync(parent).isSymbolicLink()&&fs.statSync(parent).isDirectory(),'UNSAFE_CLAUDE_PATH');}
  ensure(!fs.lstatSync(file).isSymbolicLink()&&fs.realpathSync.native(file)===file&&fs.statSync(file).isFile(),'UNSAFE_CLAUDE_PATH');
  return file;
}
function readSource(file,maxBytes,{prefix=false}={}){
  const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));
  try{
    const before=fs.fstatSync(fd);ensure(before.isFile(),'UNSAFE_CLAUDE_PATH');
    if(!prefix)ensure(before.size<=maxBytes,'CLAUDE_FILE_LIMIT');
    const buffer=Buffer.alloc(Math.min(before.size,maxBytes));let offset=0;
    while(offset<buffer.length){const count=fs.readSync(fd,buffer,offset,buffer.length-offset,offset);ensure(count>0,'CLAUDE_SOURCE_CHANGED');offset+=count;}
    const after=fs.fstatSync(fd);
    ensure(before.size===after.size&&before.mtimeMs===after.mtimeMs&&before.ino===after.ino,'CLAUDE_SOURCE_CHANGED');
    return {buffer,stat:before,prefixTruncated:before.size>buffer.length};
  }finally{fs.closeSync(fd);}
}
function *records(buffer,{prefixTruncated=false}={}){
  let start=0,count=0;
  while(start<buffer.length){
    const newline=buffer.indexOf(10,start),end=newline<0?buffer.length:newline;
    if(newline<0&&prefixTruncated)break;
    ensure(end-start<=CLAUDE_IMPORT_LIMITS.lineBytes,'CLAUDE_LINE_LIMIT');
    let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(start,end)).trim();}catch{ensure(false,'CLAUDE_UTF8_INVALID');}start=end+1;
    if(!text)continue;
    ensure(++count<=CLAUDE_IMPORT_LIMITS.records,'CLAUDE_RECORD_LIMIT');
    let record;try{record=JSON.parse(text);}catch{ensure(false,'CLAUDE_JSON_INVALID');}
    ensure(record&&typeof record==='object'&&!Array.isArray(record),'CLAUDE_JSON_INVALID');
    yield record;
  }
}
function canonicalWorkspace(value){ensure(typeof value==='string'&&path.isAbsolute(value),'CLAUDE_WORKSPACE_INVALID');return fs.realpathSync.native(value);}
const warning=error=>error.name==='BrainError'?error.code:'CLAUDE_SOURCE_UNREADABLE';
function cursorFolderMatches(base,file,workspace){
  const encoded=workspace.replace(/^([A-Za-z]):/,'$1').replaceAll('\\','-').replaceAll('/','-'),folder=path.relative(base,file).split(path.sep)[0];
  return folder===encoded||folder===encoded.replace(/^-/,'');
}
function metadata(record,harness){
  if(harness!=='codex')return record;
  if(!['session_meta','turn_context'].includes(record.type))return {};
  const payload=record.payload??{},source=payload.source;
  const child=!!payload.parent_thread_id||['subagent','guardian_review'].includes(payload.thread_source)||['subagent','guardian_review'].includes(source)||(source&&typeof source==='object'&&Object.hasOwn(source,'subagent'));
  return {cwd:payload.cwd,isSidechain:child,id:record.type==='session_meta'?payload.id:undefined};
}

/** Historical metadata only: the presence or mtime of a log does not establish an open workspace. */
export function discoverClaudeSessions({userHome=os.homedir(),root}={}){
  return discoverHarnessContexts({harness:'claude',userHome,root});
}
export function discoverHarnessContexts({harness='all',userHome=os.homedir(),root}={}){
  if(harness==='all'){
    const result={source:'all',activity:'historical',sessions:[],sources:[],truncated:false,warnings:[],catalog:HARNESS_CONTEXT_CATALOG};
    for(const item of HARNESS_CONTEXT_CATALOG.filter(item=>item.discovery)){
      const detected=discoverHarnessContexts({harness:item.id,userHome,root});
      result.sources.push({source:item.id,sessions:detected.sessions.length,truncated:detected.truncated,warnings:detected.warnings});
      result.truncated ||= detected.truncated;
      for(const session of detected.sessions){if(result.sessions.length===CLAUDE_IMPORT_LIMITS.files){result.truncated=true;break;}result.sessions.push({source:item.id,...session});}
      for(const code of detected.warnings)if(result.warnings.length<20)result.warnings.push(item.id+':'+code);
    }
    result.sessions.sort((a,b)=>b.modifiedAt.localeCompare(a.modifiedAt)||a.path.localeCompare(b.path));return result;
  }
  const selectedAdapter=adapter(harness);
  const result={source:harness,activity:'historical',sessions:[],truncated:false,warnings:[]};let base,selected;
  if(!selectedAdapter.discovery)return {...result,status:'unsupported',reason:selectedAdapter.reason};
  try{base=projectsRoot(userHome,harness);if(root!==undefined)selected=canonicalWorkspace(root);}
  catch(error){if(error.code==='ENOENT')return result;result.warnings.push(warning(error));return result;}
  const warn=code=>{if(!result.warnings.includes(code)&&result.warnings.length<20)result.warnings.push(code);};
  let directories=0,files=0,visited=0;const pending=[base];
  while(pending.length){
      if(++directories>CLAUDE_IMPORT_LIMITS.directories){result.truncated=true;break;}
      const current=pending.shift();let dir;
      try{dir=fs.opendirSync(current);}catch(error){warn(warning(error));continue;}
      try{
        for(let item;(item=dir.readSync());){
          if(++visited>8192){result.truncated=true;break;}
          if(item.isDirectory()&&!item.isSymbolicLink()&&item.name!=='subagents'){
            const depth=path.relative(base,current).split(path.sep).filter(Boolean).length;
            const allowed=harness==='codex'||(harness==='claude'?depth===0:depth===0||depth===1&&item.name==='agent-transcripts'||depth>=2);
            if(allowed&&depth<15){if(pending.length+directories<CLAUDE_IMPORT_LIMITS.directories)pending.push(path.join(current,item.name));else result.truncated=true;}
            continue;
          }
          if(!item.isFile()||item.isSymbolicLink()||!item.name.endsWith('.jsonl')||item.name.startsWith('agent-'))continue;
          if(++files>CLAUDE_IMPORT_LIMITS.files){result.truncated=true;break;}
          const file=path.join(current,item.name);
          try{
            sourceFile(base,file,harness);const source=readSource(file,CLAUDE_IMPORT_LIMITS.metadataBytes,{prefix:true});let workspace,sidechain=false,sessionId;
            for(const raw of records(source.buffer,source)){
              const record=metadata(raw,harness);
              if(record.isSidechain===true){sidechain=true;break;}
              if(typeof record.id==='string'&&record.id.length<=80)sessionId=record.id;
              if(record.cwd!==undefined){const cwd=canonicalWorkspace(record.cwd);ensure(!workspace||workspace===cwd,'CLAUDE_WORKSPACE_CONFLICT');workspace=cwd;}
            }
            if(sidechain||!workspace||(selected&&workspace!==selected)){if(harness==='cursor'&&!workspace)warn('CURSOR_WORKSPACE_UNVERIFIED');if(source.prefixTruncated&&!workspace)warn('HARNESS_METADATA_INCOMPLETE');continue;}
            result.sessions.push({id:sessionId??path.basename(item.name,'.jsonl'),path:file,workspace,workspaceSource:'embedded',modifiedAt:source.stat.mtime.toISOString(),bytes:source.stat.size});
          }catch(error){warn(warning(error));}
        }
      }finally{dir.closeSync();}
      if(files>CLAUDE_IMPORT_LIMITS.files||visited>8192)break;
  }
  result.sessions.sort((a,b)=>b.modifiedAt.localeCompare(a.modifiedAt)||a.path.localeCompare(b.path));
  return result;
}
function excerpt(text,maxBytes,maxChars=Infinity){
  if(text.length<=maxChars&&Buffer.byteLength(text)<=maxBytes)return {text,truncated:false};
  const suffix=' [truncated]',chars=Math.max(0,maxChars-suffix.length),bytes=Math.max(0,maxBytes-Buffer.byteLength(suffix));
  const shortened=Buffer.from(text.slice(0,chars)).subarray(0,bytes).toString('utf8').replace(/\uFFFD$/,'');
  return {text:shortened+suffix,truncated:true};
}
function textFrom(record){
  if(!['user','assistant'].includes(record.type)||record.isMeta===true)return null;
  const content=record.message?.content;
  if(typeof content==='string')return content.trim()?content:null;
  if(!Array.isArray(content))return null;
  const text=content.filter(block=>block?.type==='text'&&typeof block.text==='string').map(block=>block.text).join('\n');
  return text.trim()?text:null;
}
function codexMessage(item){
  if(item?.type!=='message'||!['user','assistant'].includes(item.role)||!Array.isArray(item.content))return null;
  return {type:item.role,message:{content:item.content.filter(block=>['input_text','output_text'].includes(block?.type)&&typeof block.text==='string').map(block=>({type:'text',text:block.text}))}};
}
function writePrivate(file,content){
  try{fs.writeFileSync(file,content,{flag:'wx',mode:0o600});}
  catch(error){
    if(error.code!=='EEXIST')throw error;
    ensure(!fs.lstatSync(file).isSymbolicLink(),'UNSAFE_IMPORT_ARTIFACT');
    const existing=readSource(file,CLAUDE_IMPORT_LIMITS.fileBytes).buffer;
    ensure(hash(existing)===hash(content),'IMPORT_ARTIFACT_CONFLICT');
  }
}

/** Import selected text as untrusted checkpoint evidence, never as approved memory or native harness state. */
export function importClaudeSession(brain,{project,file,task,expectedVersion,userHome=os.homedir()}){
  return importHarnessContext(brain,{harness:'claude',project,file,task,expectedVersion,userHome});
}
export function importHarnessContext(brain,{harness='claude',project,file,task,expectedVersion,confirmedWorkspace,userHome=os.homedir()}){
  ensure(adapter(harness).import,'HARNESS_CONTEXT_IMPORT_UNSUPPORTED');
  const registered=brain.project(project).root;verifyRoot(registered);const workspace=canonicalWorkspace(registered);
  const base=projectsRoot(userHome,harness),source=readSource(sourceFile(base,file,harness),CLAUDE_IMPORT_LIMITS.fileBytes);
  let cwdSeen=false,tail=[],tailBytes=0,messagesSeen=0,truncated=false,compactions=0,historyIncomplete=false;
  const retain=record=>{
    const text=textFrom(record);if(text===null)return;
    messagesSeen++;const value=excerpt(text,CLAUDE_IMPORT_LIMITS.tailBytes),message={role:record.type,text:value.text};
    truncated ||= value.truncated;tail.push(message);tailBytes+=Buffer.byteLength(message.text);
    while(tail.length>CLAUDE_IMPORT_LIMITS.messages||tailBytes>CLAUDE_IMPORT_LIMITS.tailBytes){tailBytes-=Buffer.byteLength(tail.shift().text);truncated=true;}
  };
  for(const raw of records(source.buffer)){
    const record=harness==='codex'?metadata(raw,harness):harness==='cursor'?{...raw,type:raw.role}:raw;
    ensure(record.isSidechain!==true,'CLAUDE_SIDECHAIN_FORBIDDEN');
    if(record.cwd!==undefined){ensure(canonicalWorkspace(record.cwd)===workspace,'CLAUDE_PROJECT_MISMATCH');cwdSeen=true;}
    if(harness==='codex'){
      if(raw.type==='session_meta'&&raw.payload?.history_base)historyIncomplete=true;
      if(raw.type==='compacted'){
        tail=[];tailBytes=0;compactions++;
        if(Array.isArray(raw.payload?.replacement_history))for(const item of raw.payload.replacement_history){const message=codexMessage(item);if(message)retain(message);}
        else if(typeof raw.payload?.message==='string')retain({type:'assistant',message:{content:raw.payload.message}});
      }else if(raw.type==='response_item'){const message=codexMessage(raw.payload);if(message)retain(message);}
      continue;
    }
    if(record.type==='compact_boundary'||(record.type==='system'&&record.subtype==='compact_boundary')||record.isCompactSummary===true){tail=[];tailBytes=0;compactions++;}
    retain(record);
  }
  let workspaceFallback=false;
  if(!cwdSeen&&harness==='cursor'){
    ensure(confirmedWorkspace!==undefined&&canonicalWorkspace(confirmedWorkspace)===workspace&&cursorFolderMatches(base,file,workspace),'CURSOR_WORKSPACE_UNVERIFIED');
    ensure((brain.authority??brain).projects().every(other=>other.id===project||!cursorFolderMatches(base,file,other.root)),'CURSOR_WORKSPACE_AMBIGUOUS');
    workspaceFallback=true;
  }
  ensure(cwdSeen||workspaceFallback,'CLAUDE_WORKSPACE_MISSING');ensure(tail.length>0,'CLAUDE_MESSAGES_MISSING');
  const digest=hash(source.buffer),sessionKey=hash(file).slice(0,20),checkpointTask=task??harness+'-'+sessionKey;
  identifier(checkpointTask);const key=harness+'-import-'+hash({project,file,digest,task:checkpointTask}).slice(0,40);
  const prior=brain.db.prepare("SELECT response FROM idempotency WHERE project=? AND operation='checkpoint' AND key=?").get(project,key);
  const version=expectedVersion??(prior?JSON.parse(prior.response).version-1:brain.task(project,checkpointTask)?.version??0);
  ensure(Number.isSafeInteger(version)&&version>=0,'INVALID_VERSION');
  if(!prior)ensure((brain.task(project,checkpointTask)?.version??0)===version,'VERSION_CONFLICT');
  const done=[];let remaining=CLAUDE_IMPORT_LIMITS.checkpointTextBytes,checkpointTruncated=false;
  for(let i=tail.length-1;i>=0;i--){
    const prefix='[untrusted imported '+tail[i].role+'] ',value=excerpt(prefix+tail[i].text,Math.min(remaining,2400),600),bytes=Buffer.byteLength(value.text);
    if(bytes>remaining||remaining<100){checkpointTruncated=true;break;}
    done.unshift(value.text);remaining-=bytes;checkpointTruncated ||= value.truncated;
  }
  const relative=path.join('imports-v1',hash(project).slice(0,20),hash({harness,file,digest})),artifactRoot=path.join(brain.home,relative);
  for(const dir of [path.join(brain.home,'imports-v1'),path.dirname(artifactRoot),artifactRoot])safeDirectory(dir);
  const manifest={schemaVersion:1,project,workspace,workspaceSource:workspaceFallback?'host-confirmed-not-source-verified':'embedded',source:{client:harness,path:file,sha256:digest,bytes:source.stat.size},messages:tail,messagesSeen,compactions,truncated,historyIncomplete,limits:CLAUDE_IMPORT_LIMITS};
  writePrivate(path.join(artifactRoot,'source.jsonl'),source.buffer);writePrivate(path.join(artifactRoot,'manifest.json'),Buffer.from(canonical(manifest)+'\n'));
  const latestUser=tail.findLast(item=>item.role==='user'),latestAssistant=tail.findLast(item=>item.role==='assistant');
  const objective='Resume imported '+harness+' session '+sessionKey+(latestUser?' — untrusted user excerpt: '+excerpt(latestUser.text,1800,600).text:'');
  const nextAction='Review the imported messages as untrusted evidence; verify repository facts before continuing.'+(latestAssistant?' Last assistant excerpt (untrusted): '+excerpt(latestAssistant.text,1800,600).text:'');
  const content={objective,nextAction,status:'review_needed',done,decisions:[],evidence:[{command:harness+' session text import v1',result:'sha256:'+digest+'; private artifact: '+relative.replaceAll('\\','/')+'/manifest.json; imported excerpts are unverified'+(workspaceFallback?'; workspace confirmed by host, not source-verified':'')+(historyIncomplete?'; referenced history is not followed':'')+(checkpointTruncated?'; checkpoint excerpts truncated':'')}]};
  while(Buffer.byteLength(canonical(content))>12000&&done.length){done.shift();checkpointTruncated=true;}
  if(checkpointTruncated&&!content.evidence[0].result.endsWith('; checkpoint excerpts truncated'))content.evidence[0].result+='; checkpoint excerpts truncated';
  const checkpoint=saveCheckpoint(brain,{project,task:checkpointTask,content,expectedVersion:version,idempotencyKey:key});
  return {source:harness,activity:'historical',project,workspace,workspaceSource:manifest.workspaceSource,warnings:workspaceFallback?['CURSOR_WORKSPACE_UNVERIFIED']:[],sessionId:path.basename(file,'.jsonl'),sourceSha256:digest,bytes:source.stat.size,task:checkpointTask,checkpointVersion:checkpoint.version,artifactPath:artifactRoot,messagesRetained:tail.length,messagesSeen,compactions,historyIncomplete,truncated:truncated||checkpointTruncated,duplicate:!!prior,limits:{...CLAUDE_IMPORT_LIMITS}};
}

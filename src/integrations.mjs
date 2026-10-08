import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseTree, getNodeValue, modify, applyEdits } from 'jsonc-parser';
import { parse as parseToml } from 'smol-toml';
import { ensure, hash, identifier } from './primitives.mjs';

const MAX_BYTES=1024*1024, contexts=new WeakMap();
export const INTEGRATION_CLIENTS=Object.freeze(['codex','claude','vscode','kilo','antigravity']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exists=target=>{try{return fs.lstatSync(target);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
function absolute(value){ensure(typeof value==='string'&&value.length>0&&value.length<=4096&&path.isAbsolute(value)&&!/[\x00-\x1f\x7f]/.test(value),'ABSOLUTE_CONFIG_PATH_REQUIRED');return path.resolve(value);}
// /tmp and /var are OS symlinks on macOS. Canonicalize the trusted anchor, then reject
// symlinks in every configurable descendant (including the destination itself).
function safePath(anchor,target){
  ensure(target===anchor||target.startsWith(anchor+path.sep),'INTEGRATION_PATH_OUTSIDE_ROOT');
  let current=anchor;
  for(const part of path.relative(anchor,target).split(path.sep).filter(Boolean)){
    current=path.join(current,part);const stat=exists(current);
    ensure(!stat?.isSymbolicLink(),'INTEGRATION_SYMLINK_REJECTED');
    if(current!==target)ensure(!stat||stat.isDirectory(),'INTEGRATION_PARENT_NOT_DIRECTORY');
  }
}
function readFile(anchor,target){
  safePath(anchor,target);const stat=exists(target);if(!stat)return {bytes:null,sha:null,mode:0o600};
  ensure(stat.isFile(),'INTEGRATION_NOT_FILE');ensure(stat.size<=MAX_BYTES,'INTEGRATION_FILE_TOO_LARGE');
  const fd=fs.openSync(target,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  try{const actual=fs.fstatSync(fd);ensure(actual.isFile()&&actual.size<=MAX_BYTES,'INTEGRATION_FILE_TOO_LARGE');
    const bytes=fs.readFileSync(fd);ensure(bytes.length<=MAX_BYTES,'INTEGRATION_FILE_TOO_LARGE');return {bytes,sha:hash(bytes),mode:stat.mode&0o777};
  }finally{fs.closeSync(fd);}
}
function canonicalAnchor(value){const resolved=absolute(value),stat=exists(resolved);ensure(stat&&(stat.isDirectory()||stat.isSymbolicLink()),'INTEGRATION_DIRECTORY_REQUIRED');const canonical=fs.realpathSync(resolved);ensure(fs.statSync(canonical).isDirectory(),'INTEGRATION_DIRECTORY_REQUIRED');return canonical;}
function stateAnchor(home){
  let ancestor=absolute(home),parts=[];
  while(!exists(ancestor)){parts.unshift(path.basename(ancestor));ancestor=path.dirname(ancestor);}
  const anchor=fs.realpathSync(ancestor),target=path.join(anchor,...parts);safePath(anchor,target);
  ensure(!exists(target)||exists(target).isDirectory(),'INTEGRATION_DIRECTORY_REQUIRED');return {anchor,target};
}
function privateDirectory(anchor,target){
  safePath(anchor,target);fs.mkdirSync(target,{recursive:true,mode:0o700});const stat=fs.statSync(target);
  ensure(stat.isDirectory()&&(process.platform==='win32'||((stat.mode&0o077)===0&&stat.uid===process.getuid())),'INTEGRATION_PRIVATE_DIRECTORY_REQUIRED');
}
function binary(name,env,platform){
  const extensions=platform==='win32'?(env.PATHEXT||'.EXE;.CMD;.BAT').split(';'):[''];
  for(const dir of (env.PATH||'').split(platform==='win32'?';':path.delimiter).filter(path.isAbsolute))for(const suffix of extensions){
    const target=path.join(dir,name+suffix);
    try{if(fs.statSync(target).isFile()){fs.accessSync(target,platform==='win32'?fs.constants.F_OK:fs.constants.X_OK);return target;}}catch{/* no executable here */}
  }
  return null;
}

/** Inventory only: no process launch, config/credential read, provider lookup or network call. */
export function discoverIntegrations({userHome=os.homedir(),platform=process.platform,env=process.env}={}){
  userHome=absolute(userHome);const extensionRoots=[path.join(userHome,'.vscode','extensions'),path.join(userHome,'.vscode-insiders','extensions')];
  const extensions=extensionRoots.flatMap(dir=>{try{return fs.readdirSync(dir).filter(name=>/^(openai\.chatgpt|anthropic\.claude-code|kilocode\.kilo-code)-/i.test(name)).map(name=>({name,path:path.join(dir,name)}));}catch{return [];}});
  const apps=platform==='darwin'?['/Applications',path.join(userHome,'Applications')]:[];
  const specs=[['codex','Codex','codex',['ChatGPT.app','Codex.app'],'openai.chatgpt'],['claude','Claude Code','claude',[],'anthropic.claude-code'],['vscode','VS Code','code',['Visual Studio Code.app'],null],['kilo','Kilo Code','kilo',[],'kilocode.kilo-code'],['antigravity','Antigravity IDE','antigravity',['Antigravity IDE.app'],null]];
  const clients=specs.map(([id,name,cli,bundles,extension])=>{
    const executable=binary(cli,env,platform),evidence=[];
    if(executable)evidence.push({kind:'binary',path:executable});
    for(const bundle of bundles)for(const dir of apps){const target=path.join(dir,bundle);if(exists(target)?.isDirectory()){
      evidence.push({kind:'app',path:target,bundle,product:id==='codex'?'Codex desktop':name});
      if(id==='codex')for(const relative of [path.join('Contents','Resources','codex-cli','bin','codex'),path.join('Contents','Resources','codex-cli','CodexCLI.app','Contents','MacOS','codex')]){
        const embedded=path.join(target,relative);if(exists(embedded)?.isFile())evidence.push({kind:'embedded-binary',path:embedded,product:'Codex desktop bundled CLI',executed:false});
      }
    }}
    if(extension)for(const item of extensions.filter(item=>item.name.toLowerCase().startsWith(extension+'-')))evidence.push({kind:'extension',path:item.path});
    return {id,name,detected:evidence.length>0,evidence,version:null};
  });
  return {schemaVersion:1,clients,warnings:['Installed paths do not prove version, enabled extension, native connection or model use.']};
}

function location(root,client){
  if(client==='codex')return path.join(root,'.codex','config.toml');
  if(client==='claude')return path.join(root,'.mcp.json');
  if(client==='vscode')return path.join(root,'.vscode','mcp.json');
  const candidates=['kilo.json','kilo.jsonc',path.join('.kilo','kilo.json'),path.join('.kilo','kilo.jsonc')];
  const present=candidates.filter(candidate=>exists(path.join(root,candidate)));
  ensure(present.length<=1,'INTEGRATION_AMBIGUOUS_KILO_CONFIG');return path.join(root,present[0]||path.join('.kilo','kilo.json'));
}
function owned(home,target,sha){
  const records=path.join(home,'integrations');if(!exists(records))return false;
  safePath(home,records);const names=fs.readdirSync(records).filter(name=>/^[a-f0-9-]{36}$/.test(name));
  ensure(names.length<=512,'INTEGRATION_RECEIPT_LIMIT');
  for(const name of names){const receiptPath=path.join(records,name,'receipt.json');
    if(!exists(receiptPath))continue;
    const file=readFile(home,receiptPath);let receipt;try{receipt=JSON.parse(file.bytes.toString('utf8'));}catch{continue;}
    if(receipt.status==='applied'&&receipt.files?.some(file=>file.target===target&&file.afterSha256===sha))return true;
  }return false;
}

// Parsers validate before edits. JSONC edits and TOML managed blocks retain unrelated bytes.
function legacyServer(client,current,server){
  if(!object(current))return false;
  const legacy=client==='kilo'?{...server,command:server.command.slice(0,-4)}:{...server,args:server.args.slice(0,-4)};
  if(client==='claude'&&current.type==='stdio')legacy.type='stdio';
  if(client==='codex')for(const key of ['enabled','required','startup_timeout_sec','tool_timeout_sec'])if(Object.hasOwn(current,key)){
    if(key==='enabled'&&current[key]!==true||key==='required'&&current[key]!==false)return false;
    if(key.endsWith('_sec')&&!(Number.isFinite(current[key])&&current[key]>=1&&current[key]<=3600))return false;
    legacy[key]=current[key];
  }
  return hash(current)===hash(legacy);
}
function withoutLegacyToml(text,current){
  let ownTable=false,envTable=false,found=0;const kept=[];
  for(const line of text.match(/[^\n]*\n|[^\n]+$/g)||[]){
    const raw=line.replace(/\r?\n$/,'');
    if(/^\s*\[/.test(raw)){
      ownTable=/^\s*\[mcp_servers\.(?:bbrainx|"bbrainx"|'bbrainx')(?:\.env)?\]\s*$/.test(raw);
      if(ownTable){envTable=/\.env\]/.test(raw);found++;continue;}
    }
    if(ownTable&&raw.trim()&&!/^\s*#/.test(raw)){
      // Old generators used a single assignment per line. Inline/multiline tables,
      // nested extra sections and comment-bearing assignments need manual review.
      const assignment=/^\s*(command|args|enabled|required|startup_timeout_sec|tool_timeout_sec|BBRAINX_HOME)\s*=\s*(.+?)\s*$/.exec(raw);
      ensure(assignment&&envTable===(assignment[1]==='BBRAINX_HOME'),'INTEGRATION_LEGACY_TOML_AMBIGUOUS');
      let value;try{value=JSON.parse(assignment[2]);}catch{ensure(false,'INTEGRATION_LEGACY_TOML_AMBIGUOUS');}
      const expected=envTable?current.env.BBRAINX_HOME:current[assignment[1]];
      ensure(expected!==undefined&&hash(value)===hash(expected),'INTEGRATION_LEGACY_TOML_AMBIGUOUS');
      continue;
    }
    kept.push(line);
  }
  ensure(found===2,'INTEGRATION_LEGACY_TOML_AMBIGUOUS');return kept.join('');
}
function renderConfig(client,bytes,server,canUpdate,adoptExisting){
  const text=bytes?bytes.toString('utf8'):'';
  ensure(!bytes||Buffer.from(text).equals(bytes),'INTEGRATION_CONFIG_ENCODING');
  if(client==='codex'){
    let config;try{config=parseToml(text);}catch{ensure(false,'INTEGRATION_TOML_INVALID');}
    ensure(config.mcp_servers===undefined||object(config.mcp_servers),'INTEGRATION_CONFIG_SHAPE');
    const desired={command:server.command,args:server.args,env:server.env},current=config.mcp_servers?.bbrainx;
    if(object(current))for(const key of ['enabled','required','startup_timeout_sec','tool_timeout_sec'])if(Object.hasOwn(current,key))desired[key]=current[key];
    if(current!==undefined&&hash(current)===hash(desired))return {bytes,adoption:false};
    const adopting=!canUpdate&&current!==undefined&&adoptExisting&&legacyServer(client,current,desired);
    if(adopting)for(const key of ['enabled','required','startup_timeout_sec','tool_timeout_sec'])if(Object.hasOwn(current,key))desired[key]=current[key];
    const begin='# BEGIN BBRAINX INTEGRATION',end='# END BBRAINX INTEGRATION';
    const start=text.indexOf(begin),finish=text.indexOf(end);
    let remainder=text;
    if(start!==-1||finish!==-1){
      ensure(start!==-1&&finish>start&&text.indexOf(begin,start+begin.length)===-1&&text.indexOf(end,finish+end.length)===-1,'INTEGRATION_MANAGED_BLOCK_INVALID');
      ensure((start===0||text[start-1]==='\n')&&(text[finish+end.length]==='\n'||text[finish+end.length]==='\r'||finish+end.length===text.length),'INTEGRATION_MANAGED_BLOCK_INVALID');
      ensure(canUpdate,'INTEGRATION_SERVER_COLLISION');
      remainder=text.slice(0,start)+text.slice(finish+end.length).replace(/^\r?\n/,'');
      let outside;try{outside=parseToml(remainder);}catch{ensure(false,'INTEGRATION_MANAGED_BLOCK_INVALID');}
      ensure(outside.mcp_servers?.bbrainx===undefined,'INTEGRATION_SERVER_COLLISION');
    }else if(adopting){
      remainder=withoutLegacyToml(text,current);let outside;try{outside=parseToml(remainder);}catch{ensure(false,'INTEGRATION_LEGACY_TOML_AMBIGUOUS');}
      const expected={...config,mcp_servers:{...config.mcp_servers}};delete expected.mcp_servers.bbrainx;
      if(!Object.keys(expected.mcp_servers).length&&!outside.mcp_servers)delete expected.mcp_servers;
      ensure(hash(outside)===hash(expected),'INTEGRATION_LEGACY_TOML_AMBIGUOUS');
    }else ensure(current===undefined,'INTEGRATION_SERVER_COLLISION');
    const eol=text.includes('\r\n')?'\r\n':'\n';
    const block=[begin,'[mcp_servers.bbrainx]','command = '+JSON.stringify(server.command),'args = '+JSON.stringify(server.args),
      ...['enabled','required','startup_timeout_sec','tool_timeout_sec'].filter(key=>Object.hasOwn(desired,key)).map(key=>key+' = '+JSON.stringify(desired[key])),
      '','[mcp_servers.bbrainx.env]','BBRAINX_HOME = '+JSON.stringify(server.env.BBRAINX_HOME),end,''].join(eol);
    const after=remainder+(remainder&&!remainder.endsWith('\n')?eol:'')+block;
    try{parseToml(after);}catch{ensure(false,'INTEGRATION_TOML_INVALID');}return {bytes:Buffer.from(after),adoption:adopting};
  }
  const source=text||'{}',errors=[],tree=parseTree(source,errors,{allowTrailingComma:true,disallowComments:false});
  ensure(tree?.type==='object'&&errors.length===0,'INTEGRATION_JSON_INVALID');
  // Duplicate object keys make collision/ownership ambiguous. Do not repair them.
  const pending=[tree];while(pending.length){const item=pending.pop();if(item.type==='object'){
    const keys=new Set();for(const property of item.children||[]){const key=property.children[0].value;ensure(!keys.has(key),'INTEGRATION_DUPLICATE_JSON_KEY');keys.add(key);}
  }pending.push(...(item.children||[]));}
  const config=getNodeValue(tree),key=client==='kilo'?'mcp':client==='vscode'?'servers':'mcpServers';
  ensure(config[key]===undefined||object(config[key]),'INTEGRATION_CONFIG_SHAPE');
  const current=config[key]?.bbrainx;
  if(current!==undefined&&hash(current)===hash(server))return {bytes,adoption:false};
  ensure(current===undefined||canUpdate||(adoptExisting&&legacyServer(client,current,server)),'INTEGRATION_SERVER_COLLISION');
  const desired=client==='claude'&&current?.type==='stdio'?{type:'stdio',...server}:server;
  const edited=applyEdits(source,modify(source,[key,'bbrainx'],desired,{formattingOptions:{insertSpaces:true,tabSize:2,eol:text.includes('\r\n')?'\r\n':'\n'}}));
  return {bytes:Buffer.from(edited+(edited.endsWith('\n')?'':'\n')),adoption:!canUpdate&&current!==undefined&&adoptExisting};
}

/** root/project/lane are authorized and checked against the host registry by the caller. */
export function planIntegrations(options){
  const {project,lane}=options;identifier(project);if(lane!==undefined)identifier(lane);
  ensure(options.adoptExisting===undefined||typeof options.adoptExisting==='boolean','INVALID_INTEGRATION_ADOPTION');
  const root=canonicalAnchor(options.root);ensure(root===absolute(options.root),'INTEGRATION_ROOT_NOT_CANONICAL');
  const node=absolute(options.node),entry=absolute(options.entry),state=stateAnchor(options.home),home=state.target;
  const discovery=discoverIntegrations(options),requested=options.clients??discovery.clients.filter(client=>client.detected).map(client=>client.id);
  ensure(Array.isArray(requested)&&requested.every(client=>INTEGRATION_CLIENTS.includes(client)),'UNKNOWN_INTEGRATION_CLIENT');
  const clients=[...new Set(requested)],files=[],drafts=[];
  for(const client of clients){
    const detected=discovery.clients.find(item=>item.id===client).detected;
    if(client==='antigravity'){files.push({client,detected,target:null,scope:'manual',status:'manual-required',reason:'ANTIGRAVITY_IDE_WORKSPACE_NOT_VERIFIED',serverName:'bbrainx'});continue;}
    let target;
    try{
      target=location(root,client);const before=readFile(root,target),args=[entry,'mcp','--project',project,...(lane?['--lane',lane]:[]),'--workspace',root,'--harness',client];
      const env={BBRAINX_HOME:home},server=client==='kilo'?{type:'local',command:[node,...args],environment:env,enabled:true,timeout:60000}:{...(client==='vscode'?{type:'stdio'}:{}),command:node,args,env};
      const canUpdate=before.sha!==null&&owned(home,target,before.sha),rendered=renderConfig(client,before.bytes,server,canUpdate,options.adoptExisting===true),after=rendered.bytes,afterSha256=hash(after);
      const file={client,detected,target,scope:'project',status:before.sha===afterSha256?'unchanged':before.bytes?'update':'create',beforeSha256:before.sha,afterSha256,serverName:'bbrainx'};
      if(rendered.adoption)file.adoption='exact-legacy-generator';
      files.push(file);drafts.push({file,before,after});
    }catch(e){files.push({client,detected,target:target||null,scope:'project',status:'blocked',reason:e.code||'INTEGRATION_CONFIG_INVALID',serverName:'bbrainx'});}
  }
  const publicPlan={schemaVersion:1,id:hash({root,project,lane:lane??null,home,node,entry,files}),project,root,...(lane?{lane}:{}),clients,files,
    ready:files.some(file=>['create','update','unchanged'].includes(file.status)),warnings:['Host registration grants scope. This installer does not change trust, approvals, credentials or inference providers.','Antigravity IDE requires native scope verification; no global multi-project grant is generated.']};
  contexts.set(publicPlan,{root,home,state,drafts,publicSha:hash(publicPlan)});return publicPlan;
}

function compare(root,draft){const current=readFile(root,draft.file.target);ensure(current.sha===draft.file.beforeSha256&&(process.platform==='win32'||current.mode===draft.before.mode),'INTEGRATION_CONFIG_CHANGED');}
function replace(anchor,target,bytes,mode=0o600){
  safePath(anchor,target);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});safePath(anchor,target);
  const temp=path.join(path.dirname(target),'.bbrainx-'+randomUUID()+'.tmp');
  try{const fd=fs.openSync(temp,'wx',mode);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,target);}finally{if(exists(temp))fs.unlinkSync(temp);}
}
function receiptReport(receipt){return {schemaVersion:1,id:receipt.id,status:receipt.status,project:receipt.project,root:receipt.root,files:receipt.files.map(({client,target,beforeSha256,afterSha256})=>({client,target,beforeSha256,afterSha256}))};}

/** Accepts only the original in-process plan; serialized or altered plans cannot write files. */
export function applyIntegrationPlan(plan){
  const ctx=contexts.get(plan);ensure(ctx&&hash(plan)===ctx.publicSha,'INTEGRATION_PLAN_UNTRUSTED');
  ensure(!plan.files.some(file=>file.status==='blocked'),'INTEGRATION_PLAN_BLOCKED');
  const changes=ctx.drafts.filter(draft=>draft.file.status!=='unchanged');
  for(const draft of ctx.drafts)compare(ctx.root,draft);
  if(!changes.length)return {schemaVersion:1,id:plan.id,status:'unchanged',project:plan.project,root:plan.root,files:plan.files};
  const id=randomUUID(),directory=path.join(ctx.home,'integrations',id),records=path.dirname(directory);
  privateDirectory(ctx.state.anchor,ctx.home);privateDirectory(ctx.home,records);privateDirectory(ctx.home,directory);
  const receipt={schemaVersion:1,id,status:'preparing',project:plan.project,root:ctx.root,files:changes.map(({file,before},index)=>({...file,backup:before.bytes?index+'.bak':null,mode:before.mode}))};
  for(let index=0;index<changes.length;index++){const bytes=changes[index].before.bytes;if(bytes)fs.writeFileSync(path.join(directory,index+'.bak'),bytes,{flag:'wx',mode:0o600});}
  const receiptPath=path.join(directory,'receipt.json');replace(ctx.home,receiptPath,JSON.stringify(receipt,null,2)+'\n');
  try{
    for(const draft of changes){compare(ctx.root,draft);replace(ctx.root,draft.file.target,draft.after,draft.before.mode);}
    receipt.status='applied';replace(ctx.home,receiptPath,JSON.stringify(receipt,null,2)+'\n');return receiptReport(receipt);
  }catch(e){
    // The prepared receipt also survives a process crash. Restore only when all targets
    // still equal their before/after fingerprints; never clobber a concurrent writer.
    try{rollbackIntegration({home:ctx.home,id});}catch{throw Object.assign(new Error('Apply failed; receipt is retained for guarded recovery.'),{code:'INTEGRATION_PARTIAL_APPLY',id});}
    throw e;
  }
}

export function rollbackIntegration({home,id}){
  ensure(typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id),'INVALID_INTEGRATION_RECEIPT');
  const state=stateAnchor(home);home=state.target;const directory=path.join(home,'integrations',id),receiptPath=path.join(directory,'receipt.json');
  const saved=readFile(home,receiptPath);ensure(saved.bytes,'INTEGRATION_RECEIPT_NOT_FOUND');
  let receipt;try{receipt=JSON.parse(saved.bytes.toString('utf8'));}catch{ensure(false,'INVALID_INTEGRATION_RECEIPT');}
  ensure(receipt.schemaVersion===1&&receipt.id===id&&Array.isArray(receipt.files)&&receipt.files.length<=INTEGRATION_CLIENTS.length,'INVALID_INTEGRATION_RECEIPT');
  if(receipt.status==='rolled-back')return receiptReport(receipt);
  ensure(['applied','preparing'].includes(receipt.status),'INVALID_INTEGRATION_RECEIPT');
  const root=canonicalAnchor(receipt.root),restores=[];
  for(const file of receipt.files){
    ensure(INTEGRATION_CLIENTS.includes(file.client)&&file.client!=='antigravity'&&file.target===location(root,file.client),'INVALID_INTEGRATION_RECEIPT');
    const current=readFile(root,file.target);ensure(current.sha===file.afterSha256||current.sha===file.beforeSha256,'INTEGRATION_ROLLBACK_CHANGED');
    let bytes=null;if(file.backup!==null){ensure(/^\d\.bak$/.test(file.backup),'INVALID_INTEGRATION_RECEIPT');bytes=readFile(home,path.join(directory,file.backup)).bytes;ensure(bytes&&hash(bytes)===file.beforeSha256,'INTEGRATION_BACKUP_INVALID');}
    else ensure(file.beforeSha256===null,'INTEGRATION_BACKUP_INVALID');
    if(current.sha===file.afterSha256)restores.push({file,bytes});
  }
  for(const {file,bytes} of restores){ensure(readFile(root,file.target).sha===file.afterSha256,'INTEGRATION_ROLLBACK_CHANGED');if(bytes)replace(root,file.target,bytes,file.mode);else fs.unlinkSync(file.target);}
  receipt.status='rolled-back';replace(home,receiptPath,JSON.stringify(receipt,null,2)+'\n');return receiptReport(receipt);
}

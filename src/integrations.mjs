import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { renderConfig } from './integration-config.mjs';
import { abS00sServer } from './ab-s00s-config.mjs';
import { ensure, hash, identifier } from './primitives.mjs';

const MAX_BYTES=1024*1024, contexts=new WeakMap();
export const INTEGRATION_CLIENTS=Object.freeze(['codex','claude','vscode','kilo','antigravity']);
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
function canonicalAnchor(value){const resolved=absolute(value),stat=exists(resolved);ensure(stat&&(stat.isDirectory()||stat.isSymbolicLink()),'INTEGRATION_DIRECTORY_REQUIRED');const canonical=fs.realpathSync.native(resolved);ensure(fs.statSync(canonical).isDirectory(),'INTEGRATION_DIRECTORY_REQUIRED');return canonical;}
function stateAnchor(home){
  let ancestor=absolute(home),parts=[];
  while(!exists(ancestor)){parts.unshift(path.basename(ancestor));ancestor=path.dirname(ancestor);}
  const anchor=fs.realpathSync.native(ancestor),target=path.join(anchor,...parts);safePath(anchor,target);
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
function owned(home,target,sha,serverName='bbrainx'){
  const records=path.join(home,'integrations');if(!exists(records))return false;
  safePath(home,records);const names=fs.readdirSync(records).filter(name=>/^[a-f0-9-]{36}$/.test(name));
  ensure(names.length<=512,'INTEGRATION_RECEIPT_LIMIT');
  for(const name of names){const receiptPath=path.join(records,name,'receipt.json');
    if(!exists(receiptPath))continue;
    const file=readFile(home,receiptPath);let receipt;try{receipt=JSON.parse(file.bytes.toString('utf8'));}catch{continue;}
    if(receipt.status==='applied'&&receipt.files?.some(file=>file.target===target&&file.afterSha256===sha&&(file.serverNames??[file.serverName??'bbrainx']).includes(serverName)))return true;
  }return false;
}

/** root/project/lane are authorized and checked against the host registry by the caller. */
export function planIntegrations(options){
  const {project,lane}=options;identifier(project);if(lane!==undefined)identifier(lane);
  ensure(options.adoptExisting===undefined||typeof options.adoptExisting==='boolean','INVALID_INTEGRATION_ADOPTION');
  const root=canonicalAnchor(options.root);ensure(root===absolute(options.root),'INTEGRATION_ROOT_NOT_CANONICAL');
  const node=absolute(options.node),entry=absolute(options.entry),state=stateAnchor(options.home),home=state.target;
  const discovery=discoverIntegrations(options),requested=options.clients??discovery.clients.filter(client=>client.detected).map(client=>client.id);
  ensure(Array.isArray(requested)&&requested.every(client=>INTEGRATION_CLIENTS.includes(client)),'UNKNOWN_INTEGRATION_CLIENT');
  const clients=[...new Set(requested)],files=[],drafts=[],companion=abS00sServer({...options,node,home});
  for(const client of clients){
    const detected=discovery.clients.find(item=>item.id===client).detected;
    if(client==='antigravity'){files.push({client,detected,target:null,scope:'manual',status:'manual-required',reason:'ANTIGRAVITY_IDE_WORKSPACE_NOT_VERIFIED',serverName:'bbrainx'});continue;}
    let target;
    try{
      target=location(root,client);const before=readFile(root,target),args=[entry,'mcp','--project',project,...(lane?['--lane',lane]:[]),...(options.recruit===true?['--recruit']:[]),...(options.files===true?['--files']:[]),'--workspace',root,'--harness',client];
      const env={BBRAINX_HOME:home,...(options.recruit===true?{}:{BBRAINX_RECRUIT:'false'})},server=client==='kilo'?{type:'local',command:[node,...args],environment:env,enabled:true,timeout:60000}:{...(client==='vscode'?{type:'stdio'}:{}),command:node,args,env};
      const canUpdate=before.sha!==null&&owned(home,target,before.sha),rendered=renderConfig(client,before.bytes,server,canUpdate,options.adoptExisting===true);
      const companionOwned=before.sha!==null&&owned(home,target,before.sha,'ab-s00s'),supportsCompanion=['codex','claude','vscode'].includes(client);
      const after=companion!==undefined&&supportsCompanion
        ?renderConfig(client,rendered.bytes,companion&&client==='vscode'?{type:'stdio',...companion}:companion,companionOwned,false,'ab-s00s').bytes:rendered.bytes;
      ensure(after.length<=MAX_BYTES,'INTEGRATION_FILE_TOO_LARGE');const afterSha256=hash(after);
      const file={client,detected,target,scope:'project',status:before.sha===afterSha256?'unchanged':before.bytes?'update':'create',beforeSha256:before.sha,afterSha256,serverName:'bbrainx'};
      if(supportsCompanion&&(companionOwned||companion))file.serverNames=['bbrainx',...(companion===null?[]:['ab-s00s'])];
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
  try{const fd=fs.openSync(temp,'wx',mode);try{fs.writeFileSync(fd,bytes);fs.fchmodSync(fd,mode);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,target);}finally{if(exists(temp))fs.unlinkSync(temp);}
}
function receiptReport(receipt){return {schemaVersion:1,id:receipt.id,status:receipt.status,project:receipt.project,root:receipt.root,files:receipt.files.map(({client,target,beforeSha256,afterSha256})=>({client,target,beforeSha256,afterSha256}))};}

/** Diferenças linha a linha de cada arquivo do plano, para mostrar antes de aplicar. Só do plano original deste processo. */
export function planDiff(plan,{maxLines=4000}={}){
  const ctx=contexts.get(plan);ensure(ctx&&hash(plan)===ctx.publicSha,'INTEGRATION_PLAN_UNTRUSTED');
  return ctx.drafts.filter(draft=>draft.file.status!=='unchanged').map(({file,before,after})=>({client:file.client,target:file.target,status:file.status,
    diff:lineDiff(before.bytes?before.bytes.toString('utf8'):'',after.toString('utf8'),maxLines)}));
}
/** Diff mínimo (LCS) em linhas, com 2 linhas de contexto; arquivo grande demais devolve só o resumo. */
export function lineDiff(a,b,maxLines=4000){
  const x=a===''?[]:a.replace(/\n$/,'').split('\n'),y=b===''?[]:b.replace(/\n$/,'').split('\n');
  if(x.length*y.length>maxLines*maxLines)return [{op:'note',text:x.length+' → '+y.length+' linhas (grande demais para mostrar)'}];
  const n=x.length,m=y.length,table=Array.from({length:n+1},()=>new Uint32Array(m+1));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)table[i][j]=x[i]===y[j]?table[i+1][j+1]+1:Math.max(table[i+1][j],table[i][j+1]);
  const ops=[];let i=0,j=0;
  while(i<n||j<m){if(i<n&&j<m&&x[i]===y[j]){ops.push({op:' ',text:x[i]});i++;j++;}else if(j<m&&(i===n||table[i][j+1]>=table[i+1][j])){ops.push({op:'+',text:y[j]});j++;}else{ops.push({op:'-',text:x[i]});i++;}}
  const keep=new Set();ops.forEach((o,k)=>{if(o.op!==' ')for(let d=-2;d<=2;d++)keep.add(k+d);});
  const out=[];let skipped=0;
  ops.forEach((o,k)=>{if(keep.has(k)){if(skipped){out.push({op:'note',text:skipped+' linha(s) iguais'});skipped=0;}out.push(o);}else skipped++;});
  if(skipped)out.push({op:'note',text:skipped+' linha(s) iguais'});
  return out;
}

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

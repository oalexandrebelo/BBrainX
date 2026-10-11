import fs from 'node:fs';
import path from 'node:path';
import {ensure,hash} from './primitives.mjs';
import {verifyRoot} from './source-root.mjs';

export const SDD_RUBRIC_VERSION='sdd-document-coverage-v1';
const quota={maxDepth:4,maxDocuments:128,maxFileBytes:65536,maxTotalBytes:524288,maxVisitedEntries:2048,maxIds:256,maxIdLength:80};
const draftMarker='BBRAINX_SDD_DRAFT_V1';
const secretName=/(?:^\.env(?:\.|$)|credentials|secrets?|id_rsa|id_ed25519|\.pem$|\.key$|\.p12$)/i;
const secretBody=/-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[a-zA-Z0-9_-]{20,}|gh[pousr]_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{30,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[abprs]-[0-9A-Za-z-]{20,}|[sr]k_live_[0-9A-Za-z]{20,})\b/;
const allIds=value=>[...new Set(value.match(/\b(?:FR|REQ|AC|NFR)-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*\b/g)||[])].sort();
const ids=value=>allIds(value).filter(id=>id.length<=quota.maxIdLength).slice(0,quota.maxIds);
function clean(body){
  const reference=/^(?:[ xX]|P|US[0-9]+|(?:FR|REQ|AC|NFR)-[A-Za-z0-9-]+(?:\s*[,/]\s*(?:FR|REQ|AC|NFR)-[A-Za-z0-9-]+)*)$/;
  const lines=body.replace(/<!--[\s\S]*?(?:-->|$)/g,'').replace(/```[\s\S]*?(?:```|$)/g,'').split('\n').filter(line=>{
    // Bracketed template fields invalidate the whole line; retained scaffolding must not count as evidence.
    return [...line.matchAll(/\[([^\]\n]+)\](?!\()/g)].every(match=>reference.test(match[1]));
  });
  return lines.filter((line,index)=>{
    if(line.includes('|')&&/^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/.test(lines[index+1]||''))return false;
    const value=line.replace(/^\s*(?:#+|[-*+]\s*(?:\[[ xX]\])?)\s*/,'').trim();
    return value&&!/^\|?\s*:?-+:?\s*(?:\||$)/.test(value)&&!/^\*?\[.*\]\*?$/.test(value)&&!/^\*?(?:TODO|TBD|TBC|FIXME|N\/A|placeholder|preencher|a definir|a confirmar|não definido|não inferido)\b/i.test(value);
  }).join('\n');
}
function substantive(body){return clean(body).split('\n').filter(line=>!/^\s*#/.test(line)).some(line=>line.replace(/[^\p{L}\p{N}]/gu,'').length>=20);}
function sectionText(body,heading){
  const lines=body.split('\n');let active=false,level=0,selected=[];
  for(const line of lines){
    const title=/^\s*(#{1,6})\s+(.+)$/.exec(line);
    if(title){
      if(active&&title[1].length<=level)active=false;
      if(heading.test(title[2])){active=true;level=title[1].length;}
      continue;
    }
    if(active)selected.push(line);
  }
  return selected.join('\n');
}
const section=(body,heading)=>substantive(sectionText(body,heading));
const sameFile=(a,b)=>a.ino===b.ino&&a.dev===b.dev;
function assertRoot(root,initial){verifyRoot(root);ensure(sameFile(fs.lstatSync(root),initial),'PROJECT_ROOT_CHANGED');}
function ancestry(root,relative){
  verifyRoot(root);const result=[{file:root,stat:fs.lstatSync(root)}],canonical=fs.realpathSync.native(root);let cursor=root;
  for(const part of relative.split('/')){
    ensure(part&&part!=='.'&&part!=='..','SDD_UNSAFE_PATH');cursor=path.join(cursor,part);
    const stat=fs.lstatSync(cursor);ensure(!stat.isSymbolicLink(),'SDD_UNSAFE_PATH');
    ensure(fs.realpathSync.native(cursor)===path.join(canonical,...relative.split('/').slice(0,result.length)),'SDD_UNSAFE_PATH');
    result.push({file:cursor,stat});
  }
  return result;
}
function unchanged(root,relative,before){
  const after=ancestry(root,relative);ensure(after.length===before.length&&after.every((entry,index)=>sameFile(entry.stat,before[index].stat)),'SDD_INSPECTION_CHANGED');
}
function probe(root,relative){
  let cursor=root;
  for(const part of relative.split('/')){
    ensure(part&&part!=='.'&&part!=='..','SDD_UNSAFE_PATH');cursor=path.join(cursor,part);
    let stat;try{stat=fs.lstatSync(cursor);}catch(e){if(e.code==='ENOENT')return null;throw e;}
    ensure(!stat.isSymbolicLink(),'SDD_UNSAFE_PATH');
  }
  return fs.lstatSync(cursor);
}
function readDocument(root,relative,stat,{maxBytes=quota.maxFileBytes,onRead=()=>{}}={}){
  const ancestors=ancestry(root,relative);ensure(sameFile(ancestors.at(-1).stat,stat),'SDD_INSPECTION_CHANGED');
  const descriptor=fs.openSync(path.join(root,relative),fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0)|(fs.constants.O_NONBLOCK||0));
  try{
    const opened=fs.fstatSync(descriptor);ensure(opened.isFile()&&opened.ino===stat.ino&&opened.dev===stat.dev,'SDD_UNSAFE_PATH');
    ensure(opened.size<=quota.maxFileBytes,'SDD_FILE_LIMIT');ensure(opened.size<=maxBytes,'SDD_TOTAL_LIMIT');
    unchanged(root,relative,ancestors);
    const bytes=Buffer.alloc(maxBytes);let length=0;
    while(length<bytes.length){const count=fs.readSync(descriptor,bytes,length,bytes.length-length,null);if(!count)break;length+=count;onRead(count);}
    const content=bytes.subarray(0,length),body=new TextDecoder('utf-8',{fatal:true}).decode(content);
    ensure(!content.includes(0)&&!secretBody.test(body),'SDD_CONTENT_REJECTED');
    const after=fs.fstatSync(descriptor);ensure(opened.size===after.size&&opened.mtimeMs===after.mtimeMs,'SDD_INSPECTION_CHANGED');
    unchanged(root,relative,ancestors);
    return {body,sha256:hash(content),bytes:length};
  }finally{fs.closeSync(descriptor);}
}
function classify(relative){
  const parts=relative.split('/'),name=parts.at(-1).toLowerCase();
  if(relative==='.specify/memory/constitution.md')return {kind:'governance',feature:'governance',format:'spec-kit'};
  if(parts[0]==='specs')return {kind:name==='tasks.md'?'tasks':name==='plan.md'?'plan':name==='spec.md'?'spec':'overview',feature:'specs:'+(parts.slice(1,-1).join('/')||'project'),format:'spec-kit'};
  if(parts[0]==='docs')return {kind:name==='tasks.md'?'tasks':name==='plan.md'?'plan':name==='readme.md'?'overview':'spec',feature:'docs:'+(parts.length>3?parts.slice(2,-1).join('/'):['spec.md','plan.md','tasks.md','readme.md'].includes(name)?'project':name.replace(/\.md$/,'')),format:'docs-specs'};
  return {kind:'spec',feature:'project',format:'generic'};
}
function inspect(root){
  verifyRoot(root);const rootStat=fs.lstatSync(root),documents=[],reached=new Set(),observedIds=new Set();let totalBytes=0,visited=0;
  const issue=reason=>reached.add(reason);
  function add(relative,stat){
    if(documents.length>=quota.maxDocuments){issue('maxDocuments');return;}
    if(secretName.test(path.posix.basename(relative))){issue('secretName');return;}
    if(!stat.isFile()){issue('nonRegularArtifact');return;}
    if(stat.size>quota.maxFileBytes){issue('maxFileBytes');return;}
    if(totalBytes+stat.size>quota.maxTotalBytes){issue('maxTotalBytes');return;}
    try{
      const content=readDocument(root,relative,stat,{maxBytes:Math.min(quota.maxFileBytes,quota.maxTotalBytes-totalBytes),onRead:count=>{totalBytes+=count;}});
      for(const id of allIds(clean(content.body))){if(id.length>quota.maxIdLength)issue('maxIdLength');else observedIds.add(id);}
      if(observedIds.size>quota.maxIds)issue('maxIds');
      documents.push({path:relative,...classify(relative),...content});
    }catch(e){issue(e.code==='SDD_TOTAL_LIMIT'?'maxTotalBytes':e.code==='SDD_FILE_LIMIT'?'maxFileBytes':e.code||'unreadableArtifact');}
  }
  function walk(relative){
    let stat;try{stat=probe(root,relative);}catch(e){issue(e.code||'unreadableArtifact');return;}
    if(!stat)return;
    if(!stat.isDirectory()){issue('nonDirectoryArtifact');return;}
    if(relative.split('/').length>=quota.maxDepth){issue('maxDepth');return;}
    const entries=[];let dir;
    try{
      const ancestors=ancestry(root,relative);ensure(sameFile(ancestors.at(-1).stat,stat),'SDD_INSPECTION_CHANGED');
      dir=fs.opendirSync(path.join(root,relative));
      unchanged(root,relative,ancestors);
      for(let entry;(entry=dir.readSync());){
        if(++visited>quota.maxVisitedEntries){issue('maxVisitedEntries');break;}entries.push(entry.name);
      }
      unchanged(root,relative,ancestors);
    }catch(e){entries.length=0;issue(e.code||'unreadableArtifact');}finally{try{dir?.closeSync();}catch{issue('unreadableArtifact');}}
    for(const name of entries.sort()){
      if(secretName.test(name)){issue('secretName');continue;}
      const child=relative+'/'+name;let next;
      try{next=probe(root,child);}catch(e){issue(e.code||'unreadableArtifact');continue;}
      if(!next){issue('SDD_INSPECTION_CHANGED');continue;}
      if(next.isDirectory())walk(child);else if(/\.md$/i.test(name))add(child,next);
      if(visited>quota.maxVisitedEntries)break;
    }
  }
  for(const relative of ['SPEC.md','SDD.md','.specify/memory/constitution.md']){
    try{const stat=probe(root,relative);if(stat)add(relative,stat);}catch(e){issue(e.code||'unreadableArtifact');}
  }
  walk('specs');walk('docs/specs');assertRoot(root,rootStat);
  return {documents:documents.sort((a,b)=>a.path.localeCompare(b.path)),reached:[...reached].sort()};
}
const weights={objective:15,requirements:25,architecture:15,acceptance:20,tasks:15,traceability:10};
const dimensionLabel={objective:'objetivo e escopo',requirements:'requisitos substantivos',architecture:'plano de arquitetura',acceptance:'critérios de aceite',tasks:'tarefas concretas',traceability:'requisitos ligados a tarefas'};
function grade(id,documents){
  const specs=documents.filter(d=>d.kind==='spec'),plans=documents.filter(d=>d.kind==='plan'),tasks=documents.filter(d=>d.kind==='tasks');
  const spec=clean(specs.map(d=>d.body).join('\n')),plan=clean(plans.map(d=>d.body).join('\n')),task=clean(tasks.map(d=>d.body).join('\n'));
  const definitions=sectionText(spec,/requirements?|requisitos?|user stor|histórias?/i).split('\n').flatMap(line=>{
    const match=/^\s*(?:[-*+]\s+)?(?:\*\*)?((?:FR|REQ|NFR)-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)(?:\*\*)?\s*:\s*(.+)$/.exec(line);
    return match&&match[1].length<=quota.maxIdLength&&substantive(match[2])?[match[1]]:[];
  });
  const requirementIds=[...new Set(definitions)].sort().slice(0,quota.maxIds);
  const taskBodies=task+'\n'+sectionText(spec,/tasks|tarefas|implementation plan|plano de implementação/i);
  const taskReferences=ids(taskBodies),coveredRequirementIds=requirementIds.filter(value=>taskReferences.includes(value));
  const uncoveredRequirementIds=requirementIds.filter(value=>!taskReferences.includes(value)),orphanTaskReferences=taskReferences.filter(value=>!requirementIds.includes(value)&&!value.startsWith('AC-'));
  const flags={
    objective:section(spec,/objective|objetivo|scope|escopo|overview|visão/i),
    requirements:section(spec,/requirements?|requisitos?|user stor|histórias?/i),
    architecture:section(spec+'\n'+plan,/architecture|arquitetura|technical|técnic|design|projeto estrutural/i),
    acceptance:section(spec,/acceptance|aceite|success criteria|critérios de sucesso|testing|testes/i),
    tasks:substantive(task)||section(spec,/tasks|tarefas|implementation plan|plano de implementação/i),
    traceability:requirementIds.length>0&&coveredRequirementIds.length===requirementIds.length&&orphanTaskReferences.length===0
  };
  const dimensions=Object.fromEntries(Object.entries(weights).map(([key,max])=>[key,{covered:flags[key],points:flags[key]?max:0,max}]));
  const draft=documents.some(d=>d.body.includes(draftMarker));
  const gaps=Object.keys(weights).filter(key=>!flags[key]).map(key=>'Falta evidência de '+dimensionLabel[key]+'.');
  if(uncoveredRequirementIds.length)gaps.push('Requisitos sem tarefas: '+uncoveredRequirementIds.join(', ')+'.');
  if(orphanTaskReferences.length)gaps.push('Referências de tarefas sem requisito: '+orphanTaskReferences.join(', ')+'.');
  if(draft)gaps.push('Rascunho gerado: revisão humana pendente.');
  return {id,score:Math.min(draft?49:100,Object.values(dimensions).reduce((sum,d)=>sum+d.points,0)),dimensions,gaps,traceability:{requirementIds,taskReferences,coveredRequirementIds,uncoveredRequirementIds,orphanTaskReferences,coverageRatio:requirementIds.length?coveredRequirementIds.length/requirementIds.length:null}};
}
function report(project,inspection,created=false){
  const {documents,reached}=inspection,groups=new Map();
  for(const document of documents){if(!groups.has(document.feature))groups.set(document.feature,[]);groups.get(document.feature).push(document);}
  const features=[...groups].map(([id,docs])=>grade(id,docs));
  const hasDraft=documents.some(d=>d.body.includes(draftMarker)),hasSpec=documents.some(d=>d.kind==='spec'&&substantive(d.body));
  const scored=features.filter(f=>f.id!=='governance'),score=scored.length?Math.round(scored.reduce((sum,f)=>sum+f.score,0)/scored.length):0;
  return {version:1,project,status:hasDraft?'draft':hasSpec?'present':documents.length||reached.length?'partial':'absent',created,completeInspection:reached.length===0,score:hasDraft?Math.min(score,49):score,rubricVersion:SDD_RUBRIC_VERSION,semanticQuality:'not_assessed',formats:[...new Set(documents.map(d=>d.format))].sort(),documents:documents.map(({path,sha256,bytes,kind,feature})=>({path,sha256,bytes,kind,feature})),features,gaps:[...features.flatMap(f=>f.gaps.map(g=>f.id+': '+g)),...reached.map(reason=>'Inspeção incompleta: '+reason+'.')],limits:{...quota,reached},revision:{documentsSha256:hash(documents.map(({path,sha256})=>({path,sha256})))}};
}
function baseDraft(root,project){
  const sources=[],commands=[];let packageName=null;
  for(const relative of ['package.json','README.md']){
    const stat=probe(root,relative);if(!stat)continue;
    ensure(stat.isFile()&&stat.size<=quota.maxFileBytes,'SDD_INVENTORY_INCOMPLETE');const source=readDocument(root,relative,stat);sources.push({path:relative,sha256:source.sha256,bytes:source.bytes});
    if(relative==='package.json'){
      let data;try{data=JSON.parse(source.body);}catch{ensure(false,'SDD_INVENTORY_INCOMPLETE','package.json inválido; nenhum rascunho criado.');}
      if(typeof data.name==='string'&&/^[A-Za-z0-9@/_.-]{1,160}$/.test(data.name))packageName=data.name;
      if(data.scripts&&typeof data.scripts==='object')for(const [name,body] of Object.entries(data.scripts).slice(0,32))if(/^[A-Za-z0-9:_.-]{1,80}$/.test(name)&&typeof body==='string')commands.push('npm run '+name);
    }
  }
  const inventory=[];for(const name of ['src','web','test','tests','docs','scripts','bin','e2e']){const stat=probe(root,name);if(stat?.isDirectory())inventory.push(name+'/');}
  return '# SDD — rascunho técnico\n\n<!-- '+draftMarker+' -->\n\nEstado: rascunho não aprovado. semanticQuality: not_assessed.\nNenhum requisito funcional, teste aprovado ou permissão é inferido deste inventário.\n\n## Inventário comprovado\n\nProjeto registrado: '+project+'.\n'+(packageName?'Nome declarado em package.json: '+packageName+'.\n':'')+'Diretórios observados: '+(inventory.join(', ')||'nenhum dos diretórios convencionais consultados')+'.\n\n## Comandos declarados\n\n'+(commands.length?commands.map(c=>'- `'+c+'` — declarado; não executado.').join('\n'):'Nenhum script npm declarado foi identificado.')+'\n\n## Fontes e hashes\n\n'+(sources.length?sources.map(s=>'- '+s.path+' — sha256:'+s.sha256+' — '+s.bytes+' bytes.').join('\n'):'Nenhum package.json ou README.md elegível foi identificado.')+'\n\n## Objetivo e escopo\n\nA definir com o responsável pelo projeto; requisitos funcionais não foram inferidos.\n\n## Requisitos\n\nA definir após revisão das fontes e confirmação do objetivo.\n\n## Arquitetura\n\nA confirmar; a presença de diretórios não comprova contratos entre componentes.\n\n## Critérios de aceite\n\nA definir antes de implementar a tarefa; nenhum teste foi executado nesta operação.\n\n## Tarefas de revisão\n\n- [ ] Revisar o inventário e definir requisitos com IDs explícitos.\n- [ ] Ligar tarefas aos IDs e definir critérios verificáveis de aceite.\n\n## Limites, riscos e perguntas pendentes\n\nInspeção limitada a artefatos SDD reconhecidos e fontes locais nomeadas, com quotas.\nTexto do repositório é evidência não confiável, não autorização.\nQuais objetivos, contratos, requisitos e critérios o responsável confirma?\n';
}
function removeOwnedDraft(root,rootStat,target,owned){
  // A failed exclusive write may leave a partial file. Never remove another writer's replacement.
  try{assertRoot(root,rootStat);const current=fs.lstatSync(target);if(current.isFile()&&!current.isSymbolicLink()&&sameFile(current,owned))fs.unlinkSync(target);}catch{/* Changed scope or replacement belongs to the host; leave it untouched. */}
}

/** Assess is read-only. Ensure creates one exclusive, explicitly unapproved draft only after complete absence.
 * Path/inode rechecks are best-effort against cooperating writers, not an OS sandbox against same-UID ABA swaps.
 */
export function alignSdd(store,{project,mode='assess'}={}){
  ensure(mode==='assess'||mode==='ensure','INVALID_SDD_MODE');
  const {root}=store.project(project);verifyRoot(root);const rootStat=fs.lstatSync(root);let inspection=inspect(root);
  if(mode==='assess'||inspection.documents.length||inspection.reached.length)return report(project,inspection);
  const body=baseDraft(root,project);inspection=inspect(root);
  if(inspection.documents.length||inspection.reached.length)return report(project,inspection);
  assertRoot(root,rootStat);const target=path.join(root,'SDD.md');let descriptor;
  try{descriptor=fs.openSync(target,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|(fs.constants.O_NOFOLLOW||0),0o600);}
  catch(e){if(e.code==='EEXIST')return report(project,inspect(root));throw e;}
  const owned=fs.fstatSync(descriptor);
  let writeError;
  try{
    assertRoot(root,rootStat);const current=fs.lstatSync(target);
    ensure(current.isFile()&&!current.isSymbolicLink()&&sameFile(current,owned),'SDD_CREATION_RACE');
    fs.writeFileSync(descriptor,body);fs.fsyncSync(descriptor);assertRoot(root,rootStat);
  }
  catch(error){writeError=error;}
  finally{try{fs.closeSync(descriptor);}catch(error){writeError??=error;}}
  if(writeError){removeOwnedDraft(root,rootStat,target,owned);throw writeError;}
  try{
    inspection=inspect(root);assertRoot(root,rootStat);
    if(inspection.reached.length||inspection.documents.some(document=>document.path!=='SDD.md')){
      removeOwnedDraft(root,rootStat,target,owned);return report(project,inspect(root));
    }
    return report(project,inspection,true);
  }catch(error){removeOwnedDraft(root,rootStat,target,owned);throw error;}
}

import path from 'node:path';
import { z } from 'zod';
import { ensure } from './primitives.mjs';
import { readSafe, requireFreshIndex, resolveLimits } from './retrieval.mjs';
import { verifyRoot } from './source-root.mjs';
import { declarationsIn } from './declarations.mjs';

export const ACI_LIMITS=Object.freeze({lines:400,defaultLines:200,bytes:65536,symbols:50,chunks:200});
const relativePath=z.string().min(1).max(4096),line=z.number().int().min(1).max(Number.MAX_SAFE_INTEGER-ACI_LIMITS.lines);
export const readShape={path:relativePath,start:line.optional(),end:line.optional()};
export const symbolShape={symbol:z.string().min(1).max(128).refine(value=>/^[A-Za-z_$][\w$]*$/.test(value),'Use um nome de símbolo exato.'),path:relativePath.optional(),limit:z.number().int().min(1).max(ACI_LIMITS.symbols).optional()};

function safeRelative(relative){
  ensure(!path.isAbsolute(relative)&&!path.win32.isAbsolute(relative)&&!/[\\:\x00-\x1f\x7f]/.test(relative)&&relative.split('/').every(p=>p&&p!=='.'&&p!=='..'),'UNSAFE_PATH');
}
function indexedFile(store,project,relative){
  safeRelative(relative);
  const known=store.stmt('SELECT hash,kind FROM files WHERE project=? AND path=?').get(project,relative);
  ensure(known,'FILE_NOT_INDEXED','O arquivo não pertence ao índice autorizado deste projeto.');
  return known;
}
function verifiedFile(store,project,relative){
  const known=indexedFile(store,project,relative);let file;
  const {root}=store.project(project);verifyRoot(root);
  try{file=readSafe(root,relative,resolveLimits().maxFileBytes);}
  catch(e){
    if(e.name==='BrainError'||['ENOENT','EACCES','EPERM','ENOTDIR','ELOOP'].includes(e.code))ensure(false,'INDEX_STALE','Arquivo indisponível ou alterado. Chame context_index e repita.');
    throw e;
  }
  ensure(file.hash===known.hash,'INDEX_STALE','Arquivo alterado após a verificação de frescor. Chame context_index e repita.');
  return {...file,kind:known.kind};
}
const linesOf=body=>body===''?[]:body.replace(/\r\n/g,'\n').replace(/\n$/,'').split('\n');

/** Janela inclusiva sem estado de cursor, nunca lê um caminho ausente do índice. */
export function readContext(store,{project,path:relative,start=1,end=start+ACI_LIMITS.defaultLines-1}){
  safeRelative(relative);
  ensure(end>=start&&end-start+1<=ACI_LIMITS.lines,'INVALID_READ_RANGE','Use uma janela inclusiva de até 400 linhas.');
  const freshness=requireFreshIndex(store,project),file=verifiedFile(store,project,relative),lines=linesOf(file.body);
  ensure(start<=Math.max(1,lines.length),'INVALID_READ_RANGE','A linha inicial está além do fim do arquivo.');
  end=Math.min(end,lines.length);
  const text=lines.slice(start-1,end).map((value,i)=>String(start+i).padStart(6,' ')+'| '+value).join('\n');
  ensure(Buffer.byteLength(text)<=ACI_LIMITS.bytes,'READ_WINDOW_TOO_LARGE','A janela ultrapassa 64 KiB; solicite menos linhas.');
  return {project,snapshot:freshness.snapshot,path:relative,hash:file.hash,start,end,totalLines:lines.length,text,freshness};
}

/** Definições lexicais já admitidas pelo índice; não devolve usos nem corpos inteiros. */
export function symbolContext(store,{project,symbol,path:relative,limit=20}){
  if(relative!==undefined)safeRelative(relative);
  const freshness=requireFreshIndex(store,project);
  if(relative!==undefined)indexedFile(store,project,relative);
  const rows=store.stmt("SELECT path,file_hash,start_line,end_line FROM chunks WHERE project=? AND kind!='doc' AND instr(' '||defs||' ',?)>0"+(relative===undefined?'':' AND path=?')+' ORDER BY path,start_line LIMIT ?')
    .all(project,' '+symbol+' ',...(relative===undefined?[]:[relative]),ACI_LIMITS.chunks+1);
  const items=[],seen=new Set();let currentPath,file,lines;
  for(const row of rows.slice(0,ACI_LIMITS.chunks)){
    if(currentPath!==row.path){currentPath=row.path;file=verifiedFile(store,project,row.path);lines=linesOf(file.body);}
    ensure(file.hash===row.file_hash,'INDEX_STALE','Definição desatualizada. Chame context_index e repita.');
    for(let i=row.start_line-1;i<Math.min(row.end_line,lines.length);i++){
      if(lines[i].length>2000)continue; // mesmo limite por linha do analisador do índice
      for(const declaration of declarationsIn(lines[i]))if(declaration.name===symbol){
        const key=row.path+':'+i+':'+declaration.kind;if(seen.has(key))continue;seen.add(key);
        items.push({name:symbol,path:row.path,startLine:i+1,endLine:i+1,kind:declaration.kind,hash:file.hash});
        if(items.length>limit)break;
      }
      if(items.length>limit)break;
    }
    if(items.length>limit)break;
  }
  return {project,snapshot:freshness.snapshot,symbol,items:items.slice(0,limit),truncated:items.length>limit||rows.length>ACI_LIMITS.chunks,analysis:'lexical-declarations',freshness};
}

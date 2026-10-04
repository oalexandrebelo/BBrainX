import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ensure, hash, text } from './primitives.mjs';

const allowed = new Set(['.md','.txt','.ts','.tsx','.js','.jsx','.mjs','.cjs','.py','.rs','.go','.java','.rb','.css','.html','.json','.yaml','.yml','.toml','.sql','.sh','.swift','.kt']);
const deniedPart = /^(?:\.git|node_modules|vendor|dist|build|coverage|\.next|\.venv|venv|\.bbrainx|\.obsidian)$/i;
const secretName = /(?:^\.env(?:\.|$)|credentials|secrets?|id_rsa|id_ed25519|\.pem$|\.key$|\.p12$|package-lock\.json$|yarn\.lock$)/i;
const secretBody = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[a-zA-Z0-9_-]{20,}|gh[pousr]_[a-zA-Z0-9]{20,})\b/;
export function included(relative) {
  const parts=relative.replaceAll('\\','/').split('/');
  return parts.every(x=>x!=='.'&&x!=='..'&&!deniedPart.test(x))&&!secretName.test(parts.at(-1))&&allowed.has(path.extname(relative).toLowerCase());
}
export function readSafe(root, relative, maxBytes=262144) {
  ensure(typeof relative==='string'&&!path.isAbsolute(relative),'UNSAFE_PATH');
  const full=path.resolve(root,relative), rel=path.relative(root,full);
  ensure(rel&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel),'UNSAFE_PATH');
  let cursor=root;
  for(const component of rel.split(path.sep)){cursor=path.join(cursor,component);ensure(!fs.lstatSync(cursor).isSymbolicLink(),'SYMLINK_REJECTED');}
  const stat=fs.statSync(full);ensure(stat.isFile()&&stat.size<=maxBytes,'FILE_TOO_LARGE');
  const bytes=fs.readFileSync(full);ensure(bytes.length<=maxBytes&&!bytes.includes(0),'BINARY_OR_LARGE_FILE');
  const body=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  ensure(!secretBody.test(body),'SECRET_PATTERN_REJECTED');
  return {body,hash:hash(bytes),bytes:bytes.length};
}
function candidates(root) {
  try {
    const top=execFileSync('git',['-C',root,'rev-parse','--show-toplevel'],{encoding:'utf8',timeout:5000}).trim();
    if(fs.realpathSync(top)===fs.realpathSync(root)) return [...new Set(execFileSync('git',['-C',root,'ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8',timeout:15000,maxBuffer:8*1024*1024}).split('\0').filter(Boolean))];
  } catch { /* Diretórios não Git usam walker limitado. */ }
  const names=[];
  function walk(dir,base='') {
    ensure(names.length<=5000,'INDEX_FILE_LIMIT');
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      if(entry.isSymbolicLink()||deniedPart.test(entry.name)||secretName.test(entry.name))continue;
      const rel=path.join(base,entry.name);
      if(entry.isDirectory())walk(path.join(dir,entry.name),rel); else if(entry.isFile())names.push(rel);
    }
  }
  walk(root); return names;
}
export function indexProject(store, project) {
  const {root}=store.project(project), names=candidates(root).filter(included).sort();
  ensure(names.length<=5000,'INDEX_FILE_LIMIT');
  const records=[], skipped=[];let totalBytes=0;
  for(const relative of names){
    try {
      const file=readSafe(root,relative);totalBytes+=file.bytes;ensure(totalBytes<=32*1024*1024,'INDEX_BYTE_LIMIT');
      records.push({path:relative.replaceAll('\\','/'),...file});
    } catch(e){if(['ENOENT','SYMLINK_REJECTED','FILE_TOO_LARGE','BINARY_OR_LARGE_FILE','SECRET_PATTERN_REJECTED'].includes(e.code))skipped.push({path:relative,reason:e.code});else throw e;}
  }
  const snapshot=hash(records.map(x=>({path:x.path,hash:x.hash}))), db=store.db;
  return store.transaction(()=>{
    const previous=new Map(db.prepare('SELECT path,hash FROM files WHERE project=?').all(project).map(x=>[x.path,x.hash]));
    const present=new Set(records.map(x=>x.path));let changed=0,reused=0,removed=0;
    function remove(file){db.prepare('DELETE FROM chunk_search WHERE project=? AND path=?').run(project,file);db.prepare('DELETE FROM chunks WHERE project=? AND path=?').run(project,file);db.prepare('DELETE FROM files WHERE project=? AND path=?').run(project,file);}
    for(const old of previous.keys())if(!present.has(old)){remove(old);removed++;}
    for(const file of records){
      if(previous.get(file.path)===file.hash){reused++;continue;}
      remove(file.path);changed++;
      db.prepare('INSERT INTO files VALUES(?,?,?,?)').run(project,file.path,file.hash,file.bytes);
      const lines=file.body.split('\n');
      for(let offset=0;offset<lines.length;offset+=60){
        const body=lines.slice(offset,offset+60).join('\n'), id=hash({project,path:file.path,hash:file.hash,offset});
        db.prepare('INSERT INTO chunks VALUES(?,?,?,?,?,?,?)').run(id,project,file.path,file.hash,offset+1,Math.min(offset+60,lines.length),body);
        db.prepare('INSERT INTO chunk_search VALUES(?,?,?,?)').run(id,project,file.path,body);
      }
    }
    db.prepare('UPDATE projects SET snapshot=? WHERE id=?').run(snapshot,project);
    const result={project,snapshot,files:records.length,changed,reused,removed,bytes:totalBytes,skipped,scope:'supported-text-files',automaticWatcher:false};
    store.event(project,'index.completed',{snapshot,files:records.length,changed,reused,removed}); return result;
  });
}
export function search(store,project,query,limit=12){
  const meta=store.project(project);text(query,1000);ensure(Number.isInteger(limit)&&limit>=1&&limit<=50,'INVALID_LIMIT');
  const words=query.match(/[\p{L}\p{N}_]+/gu)?.slice(0,20)||[];
  if(!words.length)return {project,snapshot:meta.snapshot,items:[],truncated:false};
  const expression=words.map(x=>'"'+x.replaceAll('"','""')+'"').join(' OR ');
  const rows=store.db.prepare('SELECT c.*, bm25(chunk_search) AS rank FROM chunk_search JOIN chunks c ON c.id=chunk_search.id WHERE chunk_search MATCH ? AND c.project=? ORDER BY rank,c.path,c.start_line LIMIT ?').all(expression,project,limit+1);
  return {project,snapshot:meta.snapshot,items:rows.slice(0,limit),truncated:rows.length>limit};
}
export function verifyChunk(store, project, chunk){
  ensure(chunk.project===project,'FORBIDDEN');
  const file=readSafe(store.project(project).root,chunk.path);
  ensure(file.hash===chunk.file_hash,'STALE_INDEX','Arquivo alterado após indexação. Execute index novamente.');
  return file;
}

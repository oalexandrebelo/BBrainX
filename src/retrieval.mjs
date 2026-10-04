import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { ensure, hash, text } from './primitives.mjs';
import { classify, definitions, splitIdentifier, symbolTerms } from './analyze.mjs';

const allowed = new Set(['.md','.txt','.ts','.tsx','.js','.jsx','.mjs','.cjs','.py','.rs','.go','.java','.rb','.css','.html','.json','.yaml','.yml','.toml','.sql','.sh','.swift','.kt']);
const deniedPart = /^(?:\.git|node_modules|vendor|dist|build|coverage|artifacts|\.next|\.venv|venv|\.bbrainx|\.obsidian)$/i;
const secretName = /(?:^\.env(?:\.|$)|credentials|secrets?|id_rsa|id_ed25519|\.pem$|\.key$|\.p12$|package-lock\.json$|yarn\.lock$)/i;
// Formatos inequívocos de credencial. Falso positivo só tira o arquivo do índice, com o motivo declarado.
const secretBody = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[a-zA-Z0-9_-]{20,}|gh[pousr]_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{30,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[abprs]-[0-9A-Za-z-]{20,}|[sr]k_live_[0-9A-Za-z]{20,})\b/;
const skippable = new Set(['ENOENT','SYMLINK_REJECTED','FILE_TOO_LARGE','BINARY_OR_LARGE_FILE','INVALID_UTF8','SECRET_PATTERN_REJECTED']);
const CHUNK_LINES = 60;

const defaults = {maxFiles:20000, maxBytes:256*1048576, maxFileBytes:262144};
const bounds = {maxFiles:[1,200000], maxBytes:[65536,4*1073741824], maxFileBytes:[1024,4*1048576]};
const variables = {maxFiles:'BBRAINX_MAX_FILES', maxBytes:'BBRAINX_MAX_BYTES', maxFileBytes:'BBRAINX_MAX_FILE_BYTES'};
/** Tetos de segurança. Vêm do host (ambiente ou chamada local), nunca de argumento de ferramenta. */
export function resolveLimits(override = {}, env = process.env) {
  const limits = {};
  for (const name of Object.keys(defaults)) {
    const raw = override[name] ?? (env[variables[name]] ? Number(env[variables[name]]) : defaults[name]);
    ensure(Number.isSafeInteger(raw) && raw >= bounds[name][0] && raw <= bounds[name][1], 'INVALID_LIMIT', variables[name] + ' precisa ser inteiro entre ' + bounds[name][0] + ' e ' + bounds[name][1] + '.');
    limits[name] = raw;
  }
  return limits;
}

export function included(relative) {
  const parts=relative.replaceAll('\\','/').split('/');
  return parts.every(x=>x!=='.'&&x!=='..'&&!deniedPart.test(x)&&!x.startsWith('.ci-'))&&!secretName.test(parts.at(-1))&&allowed.has(path.extname(relative).toLowerCase());
}
export function readSafe(root, relative, maxBytes=defaults.maxFileBytes) {
  ensure(typeof relative==='string'&&!path.isAbsolute(relative),'UNSAFE_PATH');
  const full=path.resolve(root,relative), rel=path.relative(root,full);
  ensure(rel&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel),'UNSAFE_PATH');
  let cursor=root;
  for(const component of rel.split(path.sep)){cursor=path.join(cursor,component);ensure(!fs.lstatSync(cursor).isSymbolicLink(),'SYMLINK_REJECTED');}
  const stat=fs.statSync(full);ensure(stat.isFile()&&stat.size<=maxBytes,'FILE_TOO_LARGE');
  const bytes=fs.readFileSync(full);ensure(bytes.length<=maxBytes&&!bytes.includes(0),'BINARY_OR_LARGE_FILE');
  let body;
  try{body=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{ensure(false,'INVALID_UTF8');}
  ensure(!secretBody.test(body),'SECRET_PATTERN_REJECTED');
  return {body,hash:hash(bytes),bytes:bytes.length};
}
function candidates(root, limits) {
  const base=['-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null','-C',root];
  const options={encoding:'utf8',timeout:5000,maxBuffer:65536,stdio:['ignore','pipe','pipe'],windowsHide:true,shell:false,env:{...process.env,LC_ALL:'C'}};
  const probe=spawnSync('git',[...base,'rev-parse','--is-inside-work-tree'],options);
  ensure(!probe.error,'GIT_UNAVAILABLE');
  if(probe.status===0&&probe.stdout.trim()==='true'){
    try{
      // Caminhos relativos à raiz escolhida; preserva ignores também em subdiretórios.
      return [...new Set(execFileSync('git',[...base,'ls-files','--cached','--others','--exclude-standard','-z','--','.'],{...options,timeout:30000,maxBuffer:64*1048576}).split('\0').filter(Boolean))];
    }catch{ensure(false,'GIT_INDEX_READ_FAILED','Não será usado fallback que desconsidere as exclusões Git.');}
  }
  ensure(probe.status===128&&/not a git repository/i.test(probe.stderr),'GIT_SCOPE_UNVERIFIED');
  const names=[], maxVisited=limits.maxFiles*4;let visited=0;
  function walk(dir,base='',depth=0) {
    ensure(depth<=64,'INDEX_FILE_LIMIT','Árvore com mais de 64 níveis.');
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      visited++;ensure(visited<=maxVisited,'INDEX_FILE_LIMIT','Mais de '+maxVisited+' entradas percorridas. Registre uma raiz menor ou aumente '+variables.maxFiles+'.');
      if(entry.isSymbolicLink()||deniedPart.test(entry.name)||secretName.test(entry.name)||entry.name.startsWith('.ci-'))continue;
      const rel=path.join(base,entry.name);
      if(entry.isDirectory())walk(path.join(dir,entry.name),rel,depth+1); else if(entry.isFile())names.push(rel);
    }
  }
  walk(root); return names;
}

const byPath=(a,b)=>a.path<b.path?-1:a.path>b.path?1:0;
/** Identidade do manifesto textual indexado: caminhos normalizados em ordem fixa + hash de cada arquivo. */
function snapshotOf(entries){return hash(entries.sort(byPath).map(({path,hash})=>({path,hash})));}
function removeFile(store,project,file){
  store.stmt('DELETE FROM chunks WHERE project=? AND path=?').run(project,file); // o gatilho limpa o índice FTS
  store.stmt('DELETE FROM files WHERE project=? AND path=?').run(project,file);
}
function replaceFile(store,project,file,content){
  removeFile(store,project,file);
  const kind=classify(file), extension=path.extname(file).toLowerCase(), lines=content.body.split('\n');
  store.stmt('INSERT INTO files(project,path,hash,bytes,kind) VALUES(?,?,?,?,?)').run(project,file,content.hash,content.bytes,kind);
  const insert=store.stmt('INSERT INTO chunks(id,project,path,file_hash,start_line,end_line,kind,body,defs,symbols) VALUES(?,?,?,?,?,?,?,?,?,?)');
  for(let offset=0;offset<lines.length;offset+=CHUNK_LINES){
    const body=lines.slice(offset,offset+CHUNK_LINES).join('\n');
    insert.run(hash({project,path:file,hash:content.hash,offset}),project,file,content.hash,offset+1,Math.min(offset+CHUNK_LINES,lines.length),kind,body,definitions(body,extension),symbolTerms(body));
  }
}
function megabytes(bytes){return (bytes/1048576).toFixed(1)+' MiB';}

/**
 * Reconcilia o índice com a worktree. Um arquivo por vez: a memória não cresce com o repositório.
 * Arquivo inalterado (mesmo hash) mantém seus trechos. Nada é executado; nada sai da máquina.
 */
export function indexProject(store, project, override) {
  const limits=resolveLimits(override), {root}=store.project(project);
  const names=[...new Set(candidates(root,limits).filter(included).map(x=>x.replaceAll('\\','/')))].sort();
  return store.transaction(()=>{
    const previous=new Map(store.stmt('SELECT path,hash FROM files WHERE project=?').all(project).map(x=>[x.path,x.hash]));
    const entries=[], skipped=[], skippedByReason={};let totalBytes=0,changed=0,reused=0,removed=0;
    for(const relative of names){
      let file;
      try{file=readSafe(root,relative,limits.maxFileBytes);}
      catch(e){
        if(!skippable.has(e.code))throw e;
        // Checkout esparso lista caminhos que não estão no disco: conta, mas não infla a resposta.
        skippedByReason[e.code]=(skippedByReason[e.code]||0)+1;if(skipped.length<100)skipped.push({path:relative,reason:e.code});continue;
      }
      // O teto conta arquivos lidos de fato, não caminhos listados pelo Git.
      ensure(entries.length<limits.maxFiles,'INDEX_FILE_LIMIT','Mais de '+limits.maxFiles+' arquivos elegíveis. Registre uma raiz menor, ignore diretórios pelo Git ou aumente '+variables.maxFiles+'.');
      totalBytes+=file.bytes;
      ensure(totalBytes<=limits.maxBytes,'INDEX_BYTE_LIMIT','O texto elegível passou de '+megabytes(limits.maxBytes)+' (em '+relative+'). Registre uma raiz menor, ignore diretórios pelo Git ou aumente '+variables.maxBytes+'.');
      entries.push({path:relative,hash:file.hash});
      if(previous.get(relative)===file.hash){reused++;continue;}
      replaceFile(store,project,relative,file);changed++;
    }
    const present=new Set(entries.map(x=>x.path));
    for(const old of previous.keys())if(!present.has(old)){removeFile(store,project,old);removed++;}
    const snapshot=snapshotOf(entries);
    store.stmt('UPDATE projects SET snapshot=? WHERE id=?').run(snapshot,project);
    const result={project,snapshot,files:entries.length,changed,reused,removed,bytes:totalBytes,skipped,skippedByReason,limits,scope:'supported-text-files',automaticWatcher:false};
    store.event(project,'index.completed',{snapshot,files:entries.length,changed,reused,removed}); return result;
  });
}

/**
 * Atualiza só os caminhos informados (alterados, apagados ou que deixaram de ser elegíveis) e recalcula o snapshot.
 * Não descobre arquivos novos nem mudanças de regra de ignore: isso continua sendo papel de indexProject.
 */
export function refreshFiles(store, project, paths, override) {
  const limits=resolveLimits(override), {root}=store.project(project);
  return store.transaction(()=>{
    const changed=[], removed=[];
    for(const relative of new Set(paths)){
      const known=store.stmt('SELECT hash FROM files WHERE project=? AND path=?').get(project,relative);
      let file=null;
      if(included(relative))try{file=readSafe(root,relative,limits.maxFileBytes);}catch(e){if(!skippable.has(e.code))throw e;}
      if(!file){if(known){removeFile(store,project,relative);removed.push(relative);}}
      else if(!known||known.hash!==file.hash){replaceFile(store,project,relative,file);changed.push(relative);}
    }
    const snapshot=snapshotOf(store.stmt('SELECT path,hash FROM files WHERE project=?').all(project));
    store.stmt('UPDATE projects SET snapshot=? WHERE id=?').run(snapshot,project);
    if(changed.length||removed.length)store.event(project,'index.refreshed',{snapshot,changed:changed.length,removed:removed.length});
    return {project,snapshot,changed,removed};
  });
}

// Peso por coluna do FTS5: caminho, corpo, nomes declarados, partes de identificadores.
const columnWeights='2.0, 1.0, 8.0, 1.5';
const kindWeight={source:1,doc:.7,config:.6,test:.4,generated:.25};
const asksForTests=/\b(?:tests?|testes?|specs?|fixtures?|mocks?)\b/i;
/**
 * Busca lexical ordenada: BM25 por coluna, reforço quando o termo é um nome DECLARADO no trecho,
 * e desconto para teste, documentação e gerado (a menos que a consulta peça testes).
 */
export function search(store,project,query,limit=12){
  const meta=store.project(project);text(query,1000);ensure(Number.isInteger(limit)&&limit>=1&&limit<=50,'INVALID_LIMIT');
  const words=query.match(/[\p{L}\p{N}_$]+/gu)?.slice(0,24)||[];
  if(!words.length)return {project,snapshot:meta.snapshot,items:[],truncated:false};
  // Um identificador composto também casa, como frase, com suas partes nas colunas de nomes: eraseUserData ↔ erase_user_data.
  const quote=value=>'"'+value.replaceAll('"','""')+'"', clauses=new Set(words.map(quote));
  for(const word of words){const parts=splitIdentifier(word);if(parts.length)clauses.add('{defs symbols} : '+quote(parts.join(' ')));}
  const expression=[...clauses].join(' OR '), pool=Math.min(400,limit*10);
  const rows=store.stmt('SELECT c.id,c.project,c.path,c.file_hash,c.start_line,c.end_line,c.kind,c.body,c.defs, bm25(chunk_search,'+columnWeights+') AS rank FROM chunk_search JOIN chunks c ON c.seq=chunk_search.rowid WHERE chunk_search MATCH ? AND c.project=? ORDER BY rank LIMIT ?').all(expression,project,pool+1);
  const lowered=[...new Set(words.flatMap(word=>[word,...splitIdentifier(word)]).map(x=>x.toLowerCase()))], keepTests=asksForTests.test(query);
  const items=rows.slice(0,pool).map(({defs,...row})=>{
    // Reforço proporcional à fração dos termos que o trecho DECLARA: um identificador sozinho triplica; uma palavra entre seis quase não pesa.
    const declared=new Set(defs.toLowerCase().split(' ')), share=lowered.filter(x=>declared.has(x)).length/lowered.length;
    return {...row,declares:share>0,score:-row.rank*(row.kind==='test'&&keepTests?1:kindWeight[row.kind]??1)*(1+2*share)};
  }).sort((a,b)=>b.score-a.score||byPath(a,b)||a.start_line-b.start_line);
  return {project,snapshot:meta.snapshot,items:items.slice(0,limit),truncated:rows.length>pool||items.length>limit};
}
export function verifyChunk(store, project, chunk){
  ensure(chunk.project===project,'FORBIDDEN');
  const file=readSafe(store.project(project).root,chunk.path,resolveLimits().maxFileBytes);
  ensure(file.hash===chunk.file_hash,'STALE_INDEX','Arquivo alterado após indexação. Execute index novamente.');
  return file;
}
/** O trecho ainda corresponde ao arquivo em disco? Falso para alterado, apagado, ilegível ou não mais elegível. */
export function isFresh(store, project, chunk){
  try{verifyChunk(store,project,chunk);return included(chunk.path);}
  catch(e){if(e.code==='STALE_INDEX'||skippable.has(e.code))return false;throw e;}
}

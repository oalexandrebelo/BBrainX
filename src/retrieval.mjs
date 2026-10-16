import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { ensure, hash, text } from './primitives.mjs';
import { classify, definitions, isStopword, plainWord, splitIdentifier, stemPrefix, symbolTerms } from './analyze.mjs';
import { translate } from './glossary.mjs';
import { verifyRoot } from './source-root.mjs';

const allowed = new Set(['.md','.txt','.ts','.tsx','.js','.jsx','.mjs','.cjs','.py','.rs','.go','.java','.rb','.css','.html','.json','.yaml','.yml','.toml','.sql','.sh','.swift','.kt']);
const deniedPart = /^(?:\.git|node_modules|vendor|dist|build|coverage|artifacts|\.next|\.venv|venv|\.bbrainx|\.obsidian)$/i;
const secretName = /(?:^\.env(?:\.|$)|credentials|secrets?|id_rsa|id_ed25519|\.pem$|\.key$|\.p12$|package-lock\.json$|yarn\.lock$)/i;
// Formatos inequívocos de credencial. Falso positivo só tira o arquivo do índice, com o motivo declarado.
const secretBody = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[a-zA-Z0-9_-]{20,}|gh[pousr]_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{30,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[abprs]-[0-9A-Za-z-]{20,}|[sr]k_live_[0-9A-Za-z]{20,})\b/;
// EACCES/EPERM: um arquivo ilegível sai do manifesto com o motivo declarado, nos dois lados (índice e verificação), em vez de derrubar toda busca.
const skippable = new Set(['ENOENT','EACCES','EPERM','SYMLINK_REJECTED','FILE_TOO_LARGE','BINARY_OR_LARGE_FILE','INVALID_UTF8','SECRET_PATTERN_REJECTED']);
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
  // Chamadas locais podem usar aliases de ancestrais (por exemplo /var no macOS).
  // O vínculo canonicalizado do registro é conferido pelas operações do projeto.
  ensure(!fs.lstatSync(root).isSymbolicLink(),'SYMLINK_REJECTED');
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
  verifyRoot(root);
  const base=['-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null','-C',root];
  const options={encoding:'utf8',timeout:5000,maxBuffer:65536,stdio:['ignore','pipe','pipe'],windowsHide:true,shell:false,env:{...process.env,LC_ALL:'C'}};
  // Um processo só: ls-files dentro do repositório lista; fora dele sai com 128 "not a git repository".
  const listed=spawnSync('git',[...base,'ls-files','--cached','--others','--exclude-standard','-z','--','.'],{...options,timeout:30000,maxBuffer:64*1048576});
  if(listed.error)ensure(false,listed.error.code==='ENOENT'?'GIT_UNAVAILABLE':'GIT_INDEX_READ_FAILED','Não será usado fallback que desconsidere as exclusões Git.');
  if(listed.status===0)return [...new Set(listed.stdout.split('\0').filter(Boolean))];
  // Só "não é repositório" autoriza a varredura sem Git; qualquer outra falha (dono duvidoso, índice corrompido) recusa.
  ensure(listed.status===128&&/not a git repository/i.test(listed.stderr),'GIT_SCOPE_UNVERIFIED');
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
 * Cache da verificação de frescor, por processo (o servidor MCP fica aberto entre buscas). A chave é o caminho
 * e o teto de bytes; o valor só vale enquanto a assinatura do arquivo (dispositivo, inode, tamanho, mtime e ctime
 * em nanossegundos) for a mesma. Qualquer escrita muda o ctime, que nenhum processo do usuário consegue
 * restaurar, então um conteúdo diferente nunca reaproveita o hash antigo. Guarda também recusas (segredo,
 * binário, UTF-8 inválido) para não reler arquivos que continuam inelegíveis.
 */
const scanCache=new Map(), SCAN_CACHE_MAX=200000;
const signature=st=>st.dev+':'+st.ino+':'+st.size+':'+st.mtimeNs+':'+st.ctimeNs;
function readForScan(root,relative,maxBytes,verifiedDirs){
  ensure(typeof relative==='string'&&!path.isAbsolute(relative),'UNSAFE_PATH');
  const full=path.resolve(root,relative), rel=path.relative(root,full);
  ensure(rel&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel),'UNSAFE_PATH');
  // Mesma recusa de links do readSafe, com cada diretório conferido uma vez por varredura.
  const parts=rel.split(path.sep);let cursor=root;
  for(let i=0;i<parts.length;i++){
    cursor=path.join(cursor,parts[i]);
    if(i<parts.length-1&&verifiedDirs.has(cursor))continue;
    ensure(!fs.lstatSync(cursor).isSymbolicLink(),'SYMLINK_REJECTED');
    if(i<parts.length-1)verifiedDirs.add(cursor);
  }
  const st=fs.statSync(full,{bigint:true});
  const key=full+'\0'+maxBytes, sig=signature(st), hit=scanCache.get(key);
  if(hit&&hit.sig===sig){if(hit.code)ensure(false,hit.code);return hit.file;}
  let file,code;
  try{file=readSafe(root,relative,maxBytes);}catch(e){if(!skippable.has(e.code)||e.code==='ENOENT')throw e;code=e.code;}
  if(scanCache.size>=SCAN_CACHE_MAX)scanCache.clear();
  // Só a assinatura e o hash: o corpo não fica em memória.
  scanCache.set(key,{sig,code,file:file&&{hash:file.hash,bytes:file.bytes}});
  if(code)ensure(false,code);
  return {hash:file.hash,bytes:file.bytes};
}
export function clearScanCache(){scanCache.clear();}

/** Read-only scan with the same eligibility, limits and secret policy as indexing. */
function scanProject(root,limits){
  const names=[...new Set(candidates(root,limits).filter(included).map(x=>x.replaceAll('\\','/')))].sort();
  const entries=[], skipped=[], skippedByReason={};let totalBytes=0;
  const verifiedDirs=new Set();
  ensure(!fs.lstatSync(root).isSymbolicLink(),'SYMLINK_REJECTED');
  for(const relative of names){
    let file;
    try{file=readForScan(root,relative,limits.maxFileBytes,verifiedDirs);}
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
  }
  return {entries,skipped,skippedByReason,totalBytes};
}

/** A scan is an observation interval, never an atomic filesystem snapshot. */
export function inspectIndex(store,project,override){
  const started=performance.now(), meta=store.project(project), limits=resolveLimits(override);
  const {entries,skippedByReason,totalBytes}=scanProject(meta.root,limits);
  const current=new Map(entries.map(x=>[x.path,x.hash]));
  const indexed=new Map(store.stmt('SELECT path,hash FROM files WHERE project=?').all(project).map(x=>[x.path,x.hash]));
  let added=0,changed=0,removed=0;const paths=[];
  const record=(file,kind)=>{if(paths.length<25)paths.push({path:file,kind});};
  for(const [file,digest] of current){
    if(!indexed.has(file)){added++;record(file,'added');}
    else if(indexed.get(file)!==digest){changed++;record(file,'changed');}
  }
  for(const file of indexed.keys())if(!current.has(file)){removed++;record(file,'removed');}
  const observedSnapshot=snapshotOf(entries);
  return {project,root:meta.root,lane:store.binding?.id??null,
    status:!meta.snapshot?'missing':meta.snapshot===observedSnapshot&&added+changed+removed===0?'current':'stale',
    indexedSnapshot:meta.snapshot,observedSnapshot,files:entries.length,bytes:totalBytes,
    changes:{added,changed,removed,paths,truncated:added+changed+removed>paths.length},
    skippedByReason,observedAt:new Date().toISOString(),durationMs:Math.round(performance.now()-started),
    consistency:'content-hash-scan-not-atomic'};
}
export function requireFreshIndex(store,project){
  requireIndex(store,project);
  const report=inspectIndex(store,project);
  ensure(report.status==='current','INDEX_STALE','Index differs from the registered worktree. Call context_index and retry; CLI: bbrainx index --project '+project+(store.binding?' --lane '+store.binding.id:'')+'.');
  return {status:report.status,observedAt:report.observedAt,consistency:report.consistency,
    root:report.root,lane:report.lane,snapshot:report.observedSnapshot};
}

// Escrita do índice em lotes curtos: o lock de escrita do banco é segurado só durante os INSERTs de um lote, nunca durante leitura de arquivos.
const INDEX_BATCH_FILES=250, INDEX_BATCH_BYTES=4*1048576;
/**
 * Reconcilia o índice com a worktree. Um arquivo por vez: a memória não cresce com o repositório.
 * Arquivo inalterado (mesmo hash) mantém seus trechos. Nada é executado; nada sai da máquina.
 * Duas fases: (1) varredura sem lock de escrita (lê e confere cada arquivo, aplica os tetos; só guarda caminho e hash), de modo que
 * recusas não alteram nada; (2) gravação dos arquivos que mudaram em lotes curtos. Cada lote publica o snapshot calculado sobre o
 * manifesto realmente indexado, então todo estado confirmado tem snapshot coerente com seus arquivos; a remoção dos que sumiram e o
 * snapshot final saem numa última transação. Falha no meio deixa um índice coerente que a próxima chamada completa.
 */
export function indexProject(store, project, override) {
  const limits=resolveLimits(override), {root}=store.project(project);
  const {entries,skipped,skippedByReason,totalBytes}=scanProject(root,limits);
  const previous=new Map(store.stmt('SELECT path,hash FROM files WHERE project=?').all(project).map(x=>[x.path,x.hash]));
  const present=new Set(entries.map(x=>x.path)), stale=entries.filter(x=>previous.get(x.path)!==x.hash);
  const publish=()=>{const snapshot=snapshotOf(store.stmt('SELECT path,hash FROM files WHERE project=?').all(project));store.stmt('UPDATE projects SET snapshot=? WHERE id=?').run(snapshot,project);return snapshot;};
  let changed=0;
  for(let at=0;at<stale.length;){
    const batch=[];let batchBytes=0;
    while(at<stale.length&&batch.length<INDEX_BATCH_FILES&&batchBytes<INDEX_BATCH_BYTES){
      const {path:relative}=stale[at++];
      let file=null;
      // O arquivo é lido de novo aqui, fora do lock: vale o conteúdo de agora, mesmo que tenha mudado desde a varredura.
      try{file=readSafe(root,relative,limits.maxFileBytes);batchBytes+=file.bytes;}catch(e){if(!skippable.has(e.code))throw e;}
      batch.push({relative,file});
    }
    store.transaction(()=>{
      for(const {relative,file} of batch){
        const known=store.stmt('SELECT hash FROM files WHERE project=? AND path=?').get(project,relative);
        if(!file){if(known)removeFile(store,project,relative);}
        else if(known?.hash!==file.hash){replaceFile(store,project,relative,file);changed++;}
      }
      publish();
    });
  }
  return store.transaction(()=>{
    let removed=0;
    for(const {path:old} of store.stmt('SELECT path FROM files WHERE project=?').all(project))if(!present.has(old)){removeFile(store,project,old);removed++;}
    const snapshot=publish(), files=store.stmt('SELECT count(*) AS n FROM files WHERE project=?').get(project).n;
    const result={project,snapshot,files,changed,reused:entries.length-stale.length,removed,bytes:totalBytes,skipped,skippedByReason,limits,scope:'supported-text-files',automaticWatcher:false};
    store.event(project,'index.completed',{snapshot,files,changed,reused:result.reused,removed}); return result;
  });
}

/**
 * Atualiza só os caminhos informados (alterados, apagados ou que deixaram de ser elegíveis) e recalcula o snapshot.
 * Não descobre arquivos novos nem mudanças de regra de ignore: isso continua sendo papel de indexProject.
 */
export function refreshFiles(store, project, paths, override) {
  const limits=resolveLimits(override), {root}=store.project(project);
  verifyRoot(root);
  return store.transaction(()=>{
    const changed=[], removed=[];
    for(const relative of new Set(paths)){
      const known=store.stmt('SELECT hash FROM files WHERE project=? AND path=?').get(project,relative);
      let file=null;
      if(included(relative))try{file=readSafe(root,relative,limits.maxFileBytes);}catch(e){if(!skippable.has(e.code))throw e;}
      if(!file){if(known){removeFile(store,project,relative);removed.push(relative);}}
      else if(!known||known.hash!==file.hash){replaceFile(store,project,relative,file);changed.push(relative);}
    }
    // Refresh tem a mesma política de admissão do index integral; falha reverte também chunks/FTS.
    const totals=store.stmt('SELECT count(*) AS files,coalesce(sum(bytes),0) AS bytes FROM files WHERE project=?').get(project);
    ensure(totals.files<=limits.maxFiles,'INDEX_FILE_LIMIT','Mais de '+limits.maxFiles+' arquivos elegíveis após atualização.');
    ensure(totals.bytes<=limits.maxBytes,'INDEX_BYTE_LIMIT','O texto elegível passou de '+megabytes(limits.maxBytes)+' após atualização.');
    const snapshot=snapshotOf(store.stmt('SELECT path,hash FROM files WHERE project=?').all(project));
    store.stmt('UPDATE projects SET snapshot=? WHERE id=?').run(snapshot,project);
    if(changed.length||removed.length)store.event(project,'index.refreshed',{snapshot,changed:changed.length,removed:removed.length});
    return {project,snapshot,changed,removed};
  });
}

// Peso por coluna do FTS5: caminho, corpo, nomes declarados, partes de identificadores.
const columnWeights='2.0, 1.0, 8.0, 1.5';
const kindWeight={source:1,doc:.5,config:.6,test:.4,generated:.25};
const asksForTests=/\b(?:tests?|testes?|specs?|fixtures?|mocks?)\b/i;
// Peso do segundo estágio (radicais e glossário pt → en) em relação ao casamento exato.
const LOOSE_WEIGHT=.5;
/**
 * Busca lexical ordenada, em dois estágios somados: (1) termos exatos, com BM25 por coluna; (2) os mesmos termos
 * por radical e pela ponte pt → en, com metade do peso. Depois: reforço quando o termo é um nome DECLARADO no
 * trecho e desconto para teste, documentação e gerado (a menos que a consulta peça testes).
 * Palavras vazias saem da consulta sempre que sobra algum termo que discrimina.
 * Por padrão (`byFile`) cada arquivo ocupa uma vaga só, com o seu melhor trecho; os outros trechos do arquivo entre os acertos (até 2)
 * viram `also`, faixas `inicio-fim` sem corpo. `limit` conta arquivos. `byFile:false` devolve os trechos crus, como o pacote precisa.
 */
const ALSO_RANGES=2;
/** Projeto (ou lane) registrado e com índice. Sem índice a busca não devolve "nada encontrado": recusa e diz o que chamar. */
export function requireIndex(store,project){
  const meta=store.project(project);
  ensure(meta.snapshot,'INDEX_REQUIRED','Projeto sem índice. Chame context_index e repita.');
  return meta;
}
export function search(store,project,query,limit=12,{byFile=true}={}){
  const meta=requireIndex(store,project);text(query,1000);ensure(Number.isInteger(limit)&&limit>=1&&limit<=50,'INVALID_LIMIT');
  const all=query.match(/[\p{L}\p{N}_$]+/gu)?.slice(0,24)||[];
  if(!all.length)return {project,snapshot:meta.snapshot,items:[],truncated:false};
  const content=all.filter(word=>!isStopword(word)), words=content.length?content:all;
  // Um identificador composto também casa, como frase, com suas partes nas colunas de nomes: eraseUserData ↔ erase_user_data.
  const quote=value=>'"'+value.replaceAll('"','""')+'"', exact=new Set(words.map(quote)), loose=new Set();
  for(const word of words){const parts=splitIdentifier(word);if(parts.length)exact.add('{defs symbols} : '+quote(parts.join(' ')));}
  for(const word of words){
    const plain=plainWord(word);if(!plain)continue;
    const stem=stemPrefix(plain);if(stem)loose.add(quote(stem)+' *');
    for(const term of translate(plain))loose.add(quote(term)+' *');
  }
  const pool=Math.min(400,limit*10), found=new Map();let overflow=false;
  const select=store.stmt('SELECT c.id,c.project,c.path,c.file_hash,c.start_line,c.end_line,c.kind,c.body,c.defs, bm25(chunk_search,'+columnWeights+') AS rank FROM chunk_search JOIN chunks c ON c.seq=chunk_search.rowid WHERE chunk_search MATCH ? AND c.project=? ORDER BY rank LIMIT ?');
  for(const [clauses,weight] of [[exact,1],[loose,LOOSE_WEIGHT]]){
    if(!clauses.size)continue;
    const rows=select.all([...clauses].join(' OR '),project,pool+1);if(rows.length>pool)overflow=true;
    for(const row of rows.slice(0,pool)){const known=found.get(row.id);if(known)known.rank+=row.rank*weight;else found.set(row.id,{...row,rank:row.rank*weight});}
  }
  const lowered=[...new Set(words.flatMap(word=>[word,...splitIdentifier(word)]).map(x=>x.toLowerCase()))], keepTests=asksForTests.test(query);
  const items=[...found.values()].map(({defs,...row})=>{
    // Reforço proporcional à fração dos termos que o trecho DECLARA: um identificador sozinho triplica; uma palavra entre seis quase não pesa.
    const declared=new Set(defs.toLowerCase().split(' ')), share=lowered.filter(x=>declared.has(x)).length/lowered.length;
    return {...row,declares:share>0,score:-row.rank*(row.kind==='test'&&keepTests?1:kindWeight[row.kind]??1)*(1+2*share)};
  }).sort((a,b)=>b.score-a.score||byPath(a,b)||a.start_line-b.start_line);
  if(!byFile)return {project,snapshot:meta.snapshot,items:items.slice(0,limit),truncated:overflow||items.length>limit};
  const files=new Map();
  for(const item of items){const chunks=files.get(item.path);if(chunks)chunks.push(item);else files.set(item.path,[item]);}
  const hits=[...files.values()].map(([best,...rest])=>rest.length?{...best,also:rest.slice(0,ALSO_RANGES).map(chunk=>chunk.start_line+'-'+chunk.end_line)}:best);
  return {project,snapshot:meta.snapshot,items:hits.slice(0,limit),truncated:overflow||hits.length>limit};
}
export function verifyChunk(store, project, chunk){
  ensure(chunk.project===project,'FORBIDDEN');
  const {root}=store.project(project);verifyRoot(root);
  const file=readSafe(root,chunk.path,resolveLimits().maxFileBytes);
  ensure(file.hash===chunk.file_hash,'STALE_INDEX','Arquivo alterado após indexação. Execute index novamente.');
  return file;
}
/** O trecho ainda corresponde ao arquivo em disco? Falso para alterado, apagado, ilegível ou não mais elegível. */
export function isFresh(store, project, chunk){
  try{verifyChunk(store,project,chunk);return included(chunk.path);}
  catch(e){if(e.code==='STALE_INDEX'||skippable.has(e.code))return false;throw e;}
}

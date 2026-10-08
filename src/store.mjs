import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { canonical, ensure, hash, identifier, newId, now, text } from './primitives.mjs';
import { gitState, safeDirectory, stateHome } from './host.mjs';

// Estado durável: não pode ser reconstruído a partir da worktree.
const durable = `
CREATE TABLE projects(id TEXT PRIMARY KEY, root TEXT NOT NULL UNIQUE, created TEXT NOT NULL, snapshot TEXT);
CREATE TABLE tasks(project TEXT NOT NULL REFERENCES projects(id), id TEXT NOT NULL, version INTEGER NOT NULL, body TEXT NOT NULL, updated TEXT NOT NULL, PRIMARY KEY(project,id));
CREATE TABLE task_history(project TEXT NOT NULL, task TEXT NOT NULL, version INTEGER NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL, PRIMARY KEY(project,task,version));
CREATE TABLE memories(id TEXT PRIMARY KEY, project TEXT NOT NULL REFERENCES projects(id), statement TEXT NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('proposed','approved','revoked')), version INTEGER NOT NULL, created TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'always' CHECK(mode IN ('always','relevant')));
CREATE TABLE idempotency(project TEXT NOT NULL, operation TEXT NOT NULL, key TEXT NOT NULL, fingerprint TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY(project,operation,key));
CREATE TABLE events(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, project TEXT NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL, created TEXT NOT NULL);
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;
// Índice derivado: a migração pode descartá-lo, porque `index` o recria a partir dos arquivos.
// chunk_search usa conteúdo externo (o corpo fica só em chunks); seq explícito porque VACUUM renumera rowid implícito.
const derived = `
CREATE TABLE files(project TEXT NOT NULL REFERENCES projects(id), path TEXT NOT NULL, hash TEXT NOT NULL, bytes INTEGER NOT NULL, kind TEXT NOT NULL, PRIMARY KEY(project,path));
CREATE TABLE chunks(seq INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, project TEXT NOT NULL REFERENCES projects(id), path TEXT NOT NULL, file_hash TEXT NOT NULL, start_line INTEGER NOT NULL, end_line INTEGER NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL, defs TEXT NOT NULL, symbols TEXT NOT NULL);
CREATE INDEX chunks_by_file ON chunks(project,path);
CREATE VIRTUAL TABLE chunk_search USING fts5(path, body, defs, symbols, content='chunks', content_rowid='seq', tokenize='unicode61');
CREATE TRIGGER chunks_after_insert AFTER INSERT ON chunks BEGIN INSERT INTO chunk_search(rowid,path,body,defs,symbols) VALUES(new.seq,new.path,new.body,new.defs,new.symbols); END;
CREATE TRIGGER chunks_after_delete AFTER DELETE ON chunks BEGIN INSERT INTO chunk_search(chunk_search,rowid,path,body,defs,symbols) VALUES('delete',old.seq,old.path,old.body,old.defs,old.symbols); END;
CREATE TRIGGER chunks_after_update AFTER UPDATE ON chunks BEGIN INSERT INTO chunk_search(chunk_search,rowid,path,body,defs,symbols) VALUES('delete',old.seq,old.path,old.body,old.defs,old.symbols); INSERT INTO chunk_search(rowid,path,body,defs,symbols) VALUES(new.seq,new.path,new.body,new.defs,new.symbols); END;
`;
const SCHEMA_VERSION = 2, schemaHash = hash(durable + derived);
export const BRAIN_SCHEMA_VERSION=SCHEMA_VERSION, BRAIN_SCHEMA_HASH=schemaHash;
const SCHEMA_V1_HASH = '5e4aaf7f64696418b88d9a77f457a74a3c2c82a301f2359800d83c4f1e4b87fc';
export const V1_BACKUP = 'brain.v1-backup.sqlite';

const statuses = ['in_progress','paused','blocked','review_needed'];
const lists = {done:[40,600], decisions:[40,600], blockers:[20,600]};
const declaredFields = new Set(['objective','nextAction','snapshot','status','done','decisions','blockers','filesTouched','evidence']);
function relativePath(value) {
  ensure(typeof value === 'string' && value.length > 0 && value.length <= 400 && !value.includes('\0') && !path.isAbsolute(value) && !/^[A-Za-z]:/.test(value), 'INVALID_CHECKPOINT', 'filesTouched aceita só caminhos relativos à raiz do projeto.');
  const parts = value.replaceAll('\\','/').split('/');
  ensure(parts.every(part => part && part !== '.' && part !== '..'), 'INVALID_CHECKPOINT', 'filesTouched aceita só caminhos relativos à raiz do projeto.');
  return parts.join('/');
}
/** Uma só validação para CLI, MCP e painel: o que o agente DECLARA. O que o host observa entra à parte, em `host`. */
export function normalizeCheckpoint(content) {
  ensure(content && typeof content === 'object' && !Array.isArray(content), 'INVALID_CHECKPOINT');
  for (const key of Object.keys(content)) ensure(declaredFields.has(key), 'INVALID_CHECKPOINT', 'Campo desconhecido no checkpoint: ' + key);
  const declared = {objective:text(content.objective,4000), nextAction:text(content.nextAction,4000)};
  ensure(statuses.includes(content.status), 'INVALID_STATUS'); declared.status = content.status;
  if (content.snapshot !== undefined) { ensure(typeof content.snapshot === 'string' && /^[0-9a-f]{64}$/.test(content.snapshot), 'SNAPSHOT_CONFLICT'); declared.snapshot = content.snapshot; }
  for (const [name,[max,each]] of Object.entries(lists)) if (content[name] !== undefined) {
    ensure(Array.isArray(content[name]) && content[name].length <= max, 'INVALID_CHECKPOINT', name + ' aceita até ' + max + ' itens.');
    declared[name] = content[name].map(item => text(item, each));
  }
  if (content.filesTouched !== undefined) {
    ensure(Array.isArray(content.filesTouched) && content.filesTouched.length <= 300, 'INVALID_CHECKPOINT', 'filesTouched aceita até 300 caminhos.');
    declared.filesTouched = content.filesTouched.map(relativePath);
  }
  if (content.evidence !== undefined) {
    ensure(Array.isArray(content.evidence) && content.evidence.length <= 40, 'INVALID_CHECKPOINT', 'evidence aceita até 40 itens.');
    declared.evidence = content.evidence.map(item => {
      ensure(item && typeof item === 'object' && Object.keys(item).every(key => key === 'command' || key === 'result'), 'INVALID_CHECKPOINT', 'evidence aceita itens {command, result}.');
      return {command:text(item.command,600), result:text(item.result,600)};
    });
  }
  return declared;
}

/** Autoridade local por usuário do SO. O host MCP restringe projetos antes de invocar este domínio. */
export class BrainStore {
  #statements = new Map();
  constructor(home = stateHome()) {
    this.home = safeDirectory(home);
    const file = path.join(this.home, 'brain.sqlite');
    if (fs.existsSync(file)) ensure(!fs.lstatSync(file).isSymbolicLink(), 'UNSAFE_DB_PATH');
    this.db = new DatabaseSync(file);
    if (process.platform !== 'win32') fs.chmodSync(file, 0o600);
    // O tempo de espera vem primeiro: trocar o modo do journal já disputa a trava com outros processos.
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    try {
      // VACUUM INTO não roda dentro de transação: a cópia de segurança vem antes; a troca de schema, atômica, depois.
      if (this.#version() === 1) this.#backupV1();
      if (this.#version() === SCHEMA_VERSION) {
        // Schema atual: verificar em snapshot de leitura, sem reservar o escritor apenas para conectar.
        this.db.exec('BEGIN DEFERRED');
        try { this.#prepareSchema(); this.db.exec('COMMIT'); }
        catch (e) { this.db.exec('ROLLBACK'); throw e; }
      } else this.transaction(() => this.#prepareSchema());
    } catch (e) { this.db.close(); throw e; }
  }
  #version() { return this.db.prepare('PRAGMA user_version').get().user_version; }
  #backupV1() {
    // Sempre refeita enquanto o banco ainda é v1: uma cópia que sobrou de tentativa anterior pode estar velha.
    // Só substitui a existente depois de conferir que a cópia nova é mesmo v1 (outro processo pode ter migrado no intervalo).
    const target = path.join(this.home, V1_BACKUP), temporary = target + '.' + process.pid + '.tmp';
    fs.rmSync(temporary, {force:true});
    try {
      this.db.prepare('VACUUM INTO ?').run(temporary);
      if (process.platform !== 'win32') fs.chmodSync(temporary, 0o600);
      const copy = new DatabaseSync(temporary, {readOnly:true});
      let version; try { version = copy.prepare('PRAGMA user_version').get().user_version; } finally { copy.close(); }
      if (version === 1) fs.renameSync(temporary, target);
    } finally { fs.rmSync(temporary, {force:true}); }
  }
  #prepareSchema() {
    const version = this.#version(), recorded = () => this.db.prepare('SELECT value FROM meta WHERE key=?').get('schema')?.value;
    if (version === 0) { this.db.exec(durable + derived + 'PRAGMA user_version=' + SCHEMA_VERSION); this.db.prepare('INSERT INTO meta VALUES(?,?)').run('schema', schemaHash); }
    else if (version === 1) {
      ensure(recorded() === SCHEMA_V1_HASH, 'MIGRATION_REQUIRED');
      ensure(fs.existsSync(path.join(this.home, V1_BACKUP)), 'MIGRATION_REQUIRED', 'Cópia de segurança da versão 1 ausente; a migração não será feita sem ela.');
      this.db.exec('DROP TABLE chunk_search; DROP TABLE chunks; DROP TABLE files;' + derived + "ALTER TABLE memories ADD COLUMN mode TEXT NOT NULL DEFAULT 'always' CHECK(mode IN ('always','relevant')); UPDATE projects SET snapshot=NULL; PRAGMA user_version=" + SCHEMA_VERSION);
      this.db.prepare('UPDATE meta SET value=? WHERE key=?').run(schemaHash, 'schema');
      for (const {id} of this.db.prepare('SELECT id FROM projects').all()) this.event(id, 'schema.migrated', {from:1, to:SCHEMA_VERSION, backup:V1_BACKUP, reindexRequired:true});
    }
    else ensure(version === SCHEMA_VERSION && recorded() === schemaHash, 'MIGRATION_REQUIRED');
  }
  close() { this.#statements.clear(); this.db.close(); }
  /** Instrução preparada uma vez por conexão: os laços de indexação repetem as mesmas poucas consultas. */
  stmt(sql) {
    let statement = this.#statements.get(sql);
    if (!statement) { statement = this.db.prepare(sql); this.#statements.set(sql, statement); }
    return statement;
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  event(project, type, payload) {
    this.stmt('INSERT INTO events(id,project,type,payload,created) VALUES(?,?,?,?,?)').run(newId(), project, type, canonical(payload), now());
  }
  register(project, root) {
    identifier(project);
    const actual = fs.realpathSync(path.resolve(root));
    ensure(fs.statSync(actual).isDirectory() && actual !== path.parse(actual).root, 'UNSAFE_PROJECT_ROOT');
    return this.transaction(()=>{
      const existing = this.db.prepare('SELECT * FROM projects WHERE id=?').get(project);
      ensure(!existing || existing.root === actual, 'PROJECT_ROOT_CONFLICT');
      const owner = this.db.prepare('SELECT id FROM projects WHERE root=?').get(actual);
      ensure(!owner || owner.id === project, 'PROJECT_ROOT_ALREADY_REGISTERED', 'Esta pasta já está registrada como "' + owner?.id + '". Use esse nome ou registre outra raiz.');
      const inside=(parent,child)=>{const relative=path.relative(parent,child);return relative===''||(!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep));};
      ensure(this.db.prepare('SELECT id,root FROM projects').all().every(other=>other.id===project||(!inside(other.root,actual)&&!inside(actual,other.root))),'PROJECT_ROOT_OVERLAP');
      this.db.prepare('INSERT OR IGNORE INTO projects(id,root,created) VALUES(?,?,?)').run(project, actual, now());
      return this.project(project);
    });
  }
  project(project) {
    identifier(project);
    const record = this.stmt('SELECT * FROM projects WHERE id=?').get(project);
    ensure(record, 'PROJECT_NOT_REGISTERED');
    return record;
  }
  projects() {
    return this.db.prepare('SELECT p.*, (SELECT count(*) FROM files WHERE project=p.id) AS fileCount, (SELECT count(*) FROM chunks WHERE project=p.id) AS chunkCount FROM projects p ORDER BY id').all();
  }
  approvedMemoryCount(project) {
    this.project(project);
    return this.db.prepare("SELECT count(*) AS total FROM memories WHERE project=? AND status='approved'").get(project).total;
  }
  commitContextEvent(project, payload) { this.transaction(() => this.event(project, 'context.compiled', payload)); }
  /**
   * Grava o estado de uma tarefa. `snapshot` declarado precisa ser o do índice atual; omitido, o host carimba o atual.
   * `host` (snapshot, Git, hora) é observado aqui e nunca aceito do chamador.
   */
  checkpoint(project, task, content, expectedVersion, key) {
    const {root} = this.project(project); identifier(task); identifier(key);
    ensure(Number.isSafeInteger(expectedVersion) && expectedVersion >= 0, 'INVALID_VERSION');
    const declared = normalizeCheckpoint(content), fingerprint = hash({task, content:declared, expectedVersion});
    // Resposta histórica imutável: ler uma chave já comprometida dispensa observar o Git de novo.
    // Se ainda não existe, a consulta dentro da transação continua arbitrando escritores concorrentes.
    const replay = this.db.prepare('SELECT * FROM idempotency WHERE project=? AND operation=? AND key=?').get(project, 'checkpoint', key);
    if (replay) { ensure(replay.fingerprint === fingerprint, 'IDEMPOTENCY_CONFLICT'); return JSON.parse(replay.response); }
    const host = {git:gitState(root), stampedAt:now()};
    return this.transaction(() => {
      const prior = this.db.prepare('SELECT * FROM idempotency WHERE project=? AND operation=? AND key=?').get(project, 'checkpoint', key);
      if (prior) { ensure(prior.fingerprint === fingerprint, 'IDEMPOTENCY_CONFLICT'); return JSON.parse(prior.response); }
      const {snapshot} = this.project(project);
      ensure(snapshot && (declared.snapshot === undefined || declared.snapshot === snapshot), 'SNAPSHOT_CONFLICT', snapshot ? 'O snapshot informado não é o do índice atual. Reindexe ou omita o campo para o host carimbar o atual.' : 'Projeto sem índice. Execute index antes do checkpoint.');
      const stored = {...declared, snapshot, host};
      ensure(Buffer.byteLength(canonical(stored)) <= 16384, 'PAYLOAD_TOO_LARGE', 'O checkpoint gravado passa de 16 KiB. Resuma as listas; o detalhe pertence ao repositório, não ao checkpoint.');
      const old = this.task(project, task);
      ensure((old?.version || 0) === expectedVersion, 'VERSION_CONFLICT');
      const version = expectedVersion + 1, body = canonical(stored), updated = now();
      this.db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?) ON CONFLICT(project,id) DO UPDATE SET version=excluded.version,body=excluded.body,updated=excluded.updated').run(project, task, version, body, updated);
      this.db.prepare('INSERT INTO task_history VALUES(?,?,?,?,?)').run(project, task, version, body, updated);
      const response = {project, task, version, content:stored, updated};
      this.db.prepare('INSERT INTO idempotency VALUES(?,?,?,?,?)').run(project, 'checkpoint', key, fingerprint, canonical(response));
      this.event(project, 'checkpoint.created', {task, version, snapshot, gitHead:host.git?.head || null});
      return response;
    });
  }
  /** Já existe resposta gravada para esta chave? Permite repetir uma chamada sem refazer efeitos anteriores a ela. */
  hasCheckpointKey(project, key) {
    this.project(project); identifier(key);
    return !!this.db.prepare('SELECT 1 FROM idempotency WHERE project=? AND operation=? AND key=?').get(project, 'checkpoint', key);
  }
  task(project, task) {
    this.project(project); identifier(task);
    const row = this.db.prepare('SELECT * FROM tasks WHERE project=? AND id=?').get(project,task);
    return row ? {project, task, version:row.version, content:JSON.parse(row.body), updated:row.updated} : null;
  }
  tasks(project) {
    this.project(project);
    return this.db.prepare('SELECT id,version,body,updated FROM tasks WHERE project=? ORDER BY updated DESC LIMIT 100').all(project).map(x=>({...x, content:JSON.parse(x.body), body:undefined}));
  }
  /**
   * `always` entra em todo pacote; `relevant` só quando casa com o objetivo. A mesma afirmação não é proposta duas vezes.
   * O modo de uma proposta é sugestão: ao aprovar, vale `always` a menos que o humano escolha `relevant`.
   */
  proposeMemory(project, statement, source, mode = 'always') {
    this.project(project); text(statement,4000); text(source,1000);
    ensure(mode === 'always' || mode === 'relevant', 'INVALID_MODE');
    return this.transaction(()=>{
      const same = this.db.prepare("SELECT id,status,version,mode FROM memories WHERE project=? AND statement=? AND status<>'revoked' ORDER BY created LIMIT 1").get(project, statement);
      if (same) return {...same, duplicate:true};
      const id = newId();
      this.db.prepare('INSERT INTO memories(id,project,statement,source,status,version,created,mode) VALUES(?,?,?,?,?,?,?,?)').run(id,project,statement,source,'proposed',1,now(),mode);
      this.event(project,'memory.proposed',{id,mode}); return {id,status:'proposed',version:1,mode,duplicate:false};
    });
  }
  reviewMemory(project, id, status, expectedVersion, mode) {
    ensure(['approved','revoked'].includes(status),'INVALID_STATUS'); this.project(project);
    ensure(mode === undefined || mode === 'always' || mode === 'relevant', 'INVALID_MODE');
    return this.transaction(()=>{
      const row=this.db.prepare('SELECT * FROM memories WHERE id=? AND project=?').get(id,project);
      ensure(row && row.version===expectedVersion,'VERSION_CONFLICT');
      const next=status==='approved'?(mode||'always'):row.mode;
      this.db.prepare('UPDATE memories SET status=?,mode=?,version=version+1 WHERE id=? AND project=?').run(status,next,id,project);
      this.event(project,'memory.'+status,{id,version:expectedVersion+1,mode:next}); return {id,status,version:expectedVersion+1,mode:next};
    });
  }
  memories(project, approvedOnly=false) {
    this.project(project);
    return this.db.prepare('SELECT * FROM memories WHERE project=? AND (?=0 OR status=\'approved\') ORDER BY created,id LIMIT 100').all(project,approvedOnly?1:0);
  }
  events(project, after=0) {
    this.project(project); ensure(Number.isSafeInteger(after)&&after>=0,'INVALID_CURSOR');
    return this.db.prepare('SELECT * FROM events WHERE project=? AND seq>? ORDER BY seq LIMIT 200').all(project,after).map(x=>({...x,payload:JSON.parse(x.payload)}));
  }
  backup(destination) {
    const target=path.resolve(destination); ensure(!fs.existsSync(target),'BACKUP_EXISTS');
    fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
    this.db.prepare('VACUUM INTO ?').run(target);
    if(process.platform!=='win32')fs.chmodSync(target,0o600);
    return {path:target,bytes:fs.statSync(target).size};
  }
}

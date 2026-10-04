import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { canonical, ensure, hash, identifier, newId, now, text } from './primitives.mjs';
import { safeDirectory, stateHome } from './host.mjs';

const schema = `
CREATE TABLE projects(id TEXT PRIMARY KEY, root TEXT NOT NULL UNIQUE, created TEXT NOT NULL, snapshot TEXT);
CREATE TABLE files(project TEXT NOT NULL REFERENCES projects(id), path TEXT NOT NULL, hash TEXT NOT NULL, bytes INTEGER NOT NULL, PRIMARY KEY(project,path));
CREATE TABLE chunks(id TEXT PRIMARY KEY, project TEXT NOT NULL REFERENCES projects(id), path TEXT NOT NULL, file_hash TEXT NOT NULL, start_line INTEGER NOT NULL, end_line INTEGER NOT NULL, body TEXT NOT NULL);
CREATE VIRTUAL TABLE chunk_search USING fts5(id UNINDEXED, project UNINDEXED, path, body, tokenize='unicode61');
CREATE TABLE tasks(project TEXT NOT NULL REFERENCES projects(id), id TEXT NOT NULL, version INTEGER NOT NULL, body TEXT NOT NULL, updated TEXT NOT NULL, PRIMARY KEY(project,id));
CREATE TABLE task_history(project TEXT NOT NULL, task TEXT NOT NULL, version INTEGER NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL, PRIMARY KEY(project,task,version));
CREATE TABLE memories(id TEXT PRIMARY KEY, project TEXT NOT NULL REFERENCES projects(id), statement TEXT NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('proposed','approved','revoked')), version INTEGER NOT NULL, created TEXT NOT NULL);
CREATE TABLE idempotency(project TEXT NOT NULL, operation TEXT NOT NULL, key TEXT NOT NULL, fingerprint TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY(project,operation,key));
CREATE TABLE events(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, project TEXT NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL, created TEXT NOT NULL);
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

/** Autoridade local por usuário do SO. O host MCP restringe projetos antes de invocar este domínio. */
export class BrainStore {
  constructor(home = stateHome()) {
    this.home = safeDirectory(home);
    const file = path.join(this.home, 'brain.sqlite');
    if (fs.existsSync(file)) ensure(!fs.lstatSync(file).isSymbolicLink(), 'UNSAFE_DB_PATH');
    this.db = new DatabaseSync(file);
    if (process.platform !== 'win32') fs.chmodSync(file, 0o600);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
    try {
      this.transaction(() => {
        const version = this.db.prepare('PRAGMA user_version').get().user_version;
        if (version === 0) { this.db.exec(schema); this.db.prepare('INSERT INTO meta VALUES(?,?)').run('schema', hash(schema)); this.db.exec('PRAGMA user_version=1'); }
        else ensure(version === 1 && this.db.prepare('SELECT value FROM meta WHERE key=?').get('schema')?.value === hash(schema), 'MIGRATION_REQUIRED');
      });
    } catch (e) { this.db.close(); throw e; }
  }
  close() { this.db.close(); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  event(project, type, payload) {
    this.db.prepare('INSERT INTO events(id,project,type,payload,created) VALUES(?,?,?,?,?)').run(newId(), project, type, canonical(payload), now());
  }
  register(project, root) {
    identifier(project);
    const actual = fs.realpathSync(path.resolve(root));
    ensure(fs.statSync(actual).isDirectory() && actual !== path.parse(actual).root, 'UNSAFE_PROJECT_ROOT');
    const existing = this.db.prepare('SELECT * FROM projects WHERE id=?').get(project);
    ensure(!existing || existing.root === actual, 'PROJECT_ROOT_CONFLICT');
    this.db.prepare('INSERT OR IGNORE INTO projects(id,root,created) VALUES(?,?,?)').run(project, actual, now());
    return this.project(project);
  }
  project(project) {
    identifier(project);
    const record = this.db.prepare('SELECT * FROM projects WHERE id=?').get(project);
    ensure(record, 'PROJECT_NOT_REGISTERED');
    return record;
  }
  projects() {
    return this.db.prepare('SELECT p.*, (SELECT count(*) FROM files WHERE project=p.id) AS fileCount, (SELECT count(*) FROM chunks WHERE project=p.id) AS chunkCount FROM projects p ORDER BY id').all();
  }
  checkpoint(project, task, content, expectedVersion, key) {
    this.project(project); identifier(task); identifier(key);
    ensure(Number.isSafeInteger(expectedVersion) && expectedVersion >= 0, 'INVALID_VERSION');
    text(content.objective, 4000); text(content.nextAction, 4000);
    ensure(['in_progress','paused','blocked','review_needed'].includes(content.status), 'INVALID_STATUS');
    ensure(content.snapshot === this.project(project).snapshot && content.snapshot, 'SNAPSHOT_CONFLICT');
    ensure(Buffer.byteLength(canonical(content)) <= 16384, 'PAYLOAD_TOO_LARGE');
    const fingerprint = hash({task, content, expectedVersion});
    return this.transaction(() => {
      const prior = this.db.prepare('SELECT * FROM idempotency WHERE project=? AND operation=? AND key=?').get(project, 'checkpoint', key);
      if (prior) { ensure(prior.fingerprint === fingerprint, 'IDEMPOTENCY_CONFLICT'); return JSON.parse(prior.response); }
      const old = this.task(project, task);
      ensure((old?.version || 0) === expectedVersion, 'VERSION_CONFLICT');
      const version = expectedVersion + 1, body = canonical(content), updated = now();
      this.db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?) ON CONFLICT(project,id) DO UPDATE SET version=excluded.version,body=excluded.body,updated=excluded.updated').run(project, task, version, body, updated);
      this.db.prepare('INSERT INTO task_history VALUES(?,?,?,?,?)').run(project, task, version, body, updated);
      const response = {project, task, version, content, updated};
      this.db.prepare('INSERT INTO idempotency VALUES(?,?,?,?,?)').run(project, 'checkpoint', key, fingerprint, canonical(response));
      this.event(project, 'checkpoint.created', {task, version, snapshot:content.snapshot});
      return response;
    });
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
  proposeMemory(project, statement, source) {
    this.project(project); text(statement,4000); text(source,1000);
    const id = newId();
    return this.transaction(()=>{
      this.db.prepare('INSERT INTO memories VALUES(?,?,?,?,?,?,?)').run(id,project,statement,source,'proposed',1,now());
      this.event(project,'memory.proposed',{id}); return {id,status:'proposed',version:1};
    });
  }
  reviewMemory(project, id, status, expectedVersion) {
    ensure(['approved','revoked'].includes(status),'INVALID_STATUS'); this.project(project);
    return this.transaction(()=>{
      const row=this.db.prepare('SELECT * FROM memories WHERE id=? AND project=?').get(id,project);
      ensure(row && row.version===expectedVersion,'VERSION_CONFLICT');
      this.db.prepare('UPDATE memories SET status=?,version=version+1 WHERE id=? AND project=?').run(status,id,project);
      this.event(project,'memory.'+status,{id,version:expectedVersion+1}); return {id,status,version:expectedVersion+1};
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

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { ensure, hash, identifier, now } from '../primitives.mjs';
import { safeDirectory } from '../host.mjs';

export const LANE_SCHEMA = 1;
const schema = `
CREATE TABLE lane_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE lanes(project TEXT NOT NULL,id TEXT NOT NULL,root TEXT NOT NULL UNIQUE,common_root TEXT NOT NULL,epoch TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('active','closed')),created TEXT NOT NULL,PRIMARY KEY(project,id));
CREATE TABLE services(project TEXT NOT NULL,lane TEXT NOT NULL,name TEXT NOT NULL,generation TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('starting','listening','closed')),port INTEGER,pid INTEGER,created TEXT NOT NULL,PRIMARY KEY(project,lane,name));
CREATE TABLE lane_events(seq INTEGER PRIMARY KEY,type TEXT NOT NULL,project TEXT NOT NULL,lane TEXT NOT NULL,body TEXT NOT NULL,created TEXT NOT NULL);
`;
const schemaHash = hash(schema);
const inside = (parent,child) => {const r=path.relative(parent,child);return r===''||(!path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep));};
const key = (project,lane) => hash({project,lane});

/** Rev-parse only. No checkout, status, filters, hooks, network or repository scripts are run. */
export function gitWorkspace(root) {
  const actual=fs.realpathSync(path.resolve(root));
  ensure(fs.statSync(actual).isDirectory()&&actual!==path.parse(actual).root,'INVALID_WORKSPACE_ROOT');
  const env={...process.env};
  for(const name of Object.keys(env))if(name.startsWith('GIT_'))delete env[name];
  Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',GIT_OPTIONAL_LOCKS:'0'});
  let values;
  try {
    values=execFileSync('git',['--no-optional-locks','-c','core.fsmonitor=false','-C',actual,'rev-parse','--path-format=absolute','--show-toplevel','--git-common-dir'],
      {encoding:'utf8',env,timeout:5000,maxBuffer:65536,windowsHide:true,stdio:['ignore','pipe','pipe']}).trimEnd().split(/\r?\n/);
  } catch { ensure(false,'WORKSPACE_GIT_UNAVAILABLE'); }
  ensure(values.length===2,'INVALID_GIT_WORKSPACE');
  const top=fs.realpathSync(values[0]),common=fs.realpathSync(values[1]);
  ensure(top===actual,'WORKSPACE_MUST_BE_REPOSITORY_ROOT');
  return {root:actual,common};
}

/** Host-owned local registry. Two active lanes globally by default, not two LLMs forcibly scheduled. */
export class LaneRegistry {
  constructor(home,{maxActive=2}={}) {
    ensure(Number.isSafeInteger(maxActive)&&maxActive>=1&&maxActive<=16,'INVALID_LANE_CAPACITY');
    this.home=safeDirectory(home);this.maxActive=maxActive;
    const file=path.join(this.home,'lanes-v1.sqlite');
    if(fs.existsSync(file))ensure(!fs.lstatSync(file).isSymbolicLink(),'UNSAFE_LANE_DB');
    this.db=new DatabaseSync(file);
    try {
      if(process.platform!=='win32')fs.chmodSync(file,0o600);
      this.db.exec('PRAGMA busy_timeout=1500; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
      const validate=()=>{
        ensure(this.db.prepare('PRAGMA user_version').get().user_version===LANE_SCHEMA,'LANE_SCHEMA_VERSION');
        ensure(this.db.prepare("SELECT value FROM lane_meta WHERE key='schema'").get()?.value===schemaHash,'LANE_SCHEMA_HASH');
      };
      if(this.db.prepare('PRAGMA user_version').get().user_version===0)this.transaction(()=>{
        if(this.db.prepare('PRAGMA user_version').get().user_version===0){this.db.exec(schema+'PRAGMA user_version=1;');this.db.prepare('INSERT INTO lane_meta VALUES(?,?)').run('schema',schemaHash);}
        validate();
      });
      else validate();
    } catch(e){this.db.close();throw e;}
  }
  close(){this.db.close();}
  transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();ensure(!r||typeof r.then!=='function','ASYNC_REGISTRY_TRANSACTION');this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  event(project,lane,type,body){this.db.prepare('INSERT INTO lane_events(type,project,lane,body,created) VALUES(?,?,?,?,?)').run(type,project,lane,JSON.stringify(body),now());}
  stateDirectory(project,lane){identifier(project);identifier(lane);return path.join(safeDirectory(path.join(this.home,'lanes')),key(project,lane));}
  register(authority,project,lane,workspace){
    identifier(project);identifier(lane);
    const primary=gitWorkspace(authority.project(project).root),candidate=gitWorkspace(workspace);
    ensure(primary.common===candidate.common,'UNRELATED_WORKSPACE');
    ensure(!inside(primary.root,candidate.root)&&!inside(candidate.root,primary.root),'OVERLAPPING_WORKSPACE');
    ensure(!inside(candidate.root,this.home)&&!inside(this.home,candidate.root),'STATE_WORKSPACE_OVERLAP');
    return this.transaction(()=>{
      const old=this.get(project,lane);
      if(old){ensure(old.root===candidate.root&&old.common_root===candidate.common,'LANE_IDENTITY_CONFLICT');ensure(old.status==='active','LANE_CLOSED');return {...old,duplicate:true};}
      const all=this.db.prepare('SELECT root,status FROM lanes').all();
      ensure(all.length<1000,'LANE_RETENTION_LIMIT');
      ensure(all.filter(r=>r.status==='active').length<this.maxActive,'LANE_CAPACITY');
      ensure(all.every(r=>!inside(r.root,candidate.root)&&!inside(candidate.root,r.root)),'WORKSPACE_ALREADY_REGISTERED');
      const epoch=randomUUID();
      this.db.prepare('INSERT INTO lanes VALUES(?,?,?,?,?,?,?)').run(project,lane,candidate.root,candidate.common,epoch,'active',now());
      this.event(project,lane,'lane.registered',{epoch});
      return {...this.get(project,lane),duplicate:false};
    });
  }
  get(project,lane){identifier(project);identifier(lane);return this.db.prepare('SELECT * FROM lanes WHERE project=? AND id=?').get(project,lane)??null;}
  active(project,lane,epoch){const r=this.get(project,lane);ensure(r&&r.status==='active','LANE_NOT_ACTIVE');if(epoch!==undefined)ensure(r.epoch===epoch,'LANE_GENERATION_CONFLICT');return r;}
  verifyBinding(project,lane,epoch){const r=this.active(project,lane,epoch),g=gitWorkspace(r.root);ensure(g.root===r.root&&g.common===r.common_root,'WORKSPACE_BINDING_CHANGED');return r;}
  list(project){identifier(project);return this.db.prepare('SELECT * FROM lanes WHERE project=? ORDER BY id LIMIT 1001').all(project);}
  retire(project,lane,epoch){return this.transaction(()=>{
    const r=this.active(project,lane,epoch);
    ensure(!this.db.prepare("SELECT 1 FROM services WHERE project=? AND lane=? AND status<>'closed'").get(project,lane),'LANE_HAS_OBSERVED_SERVICES');
    this.db.prepare("UPDATE lanes SET status='closed' WHERE project=? AND id=?").run(project,lane);this.event(project,lane,'lane.closed',{epoch:r.epoch});
    return {project,lane,status:'closed',filesRemoved:false};
  });}
  reserveService(project,lane,name,epoch){identifier(name);return this.transaction(()=>{
    this.active(project,lane,epoch);
    const existing=this.db.prepare('SELECT * FROM services WHERE project=? AND lane=? AND name=?').get(project,lane,name);
    ensure(!existing||existing.status==='closed','SERVICE_OUTCOME_UNKNOWN_OR_ACTIVE');
    ensure(this.db.prepare("SELECT count(*) AS n FROM services WHERE status<>'closed'").get().n<8,'SERVICE_CAPACITY');
    const generation=randomUUID();
    this.db.prepare("INSERT INTO services VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(project,lane,name) DO UPDATE SET generation=excluded.generation,status='starting',port=NULL,pid=excluded.pid,created=excluded.created").run(project,lane,name,generation,'starting',null,process.pid,now());
    return generation;
  });}
  serviceListening(project,lane,name,generation,port){
    ensure(Number.isInteger(port)&&port>0&&port<65536,'INVALID_SERVICE_PORT');
    return this.transaction(()=>{this.active(project,lane);const result=this.db.prepare("UPDATE services SET status='listening',port=? WHERE project=? AND lane=? AND name=? AND generation=? AND status='starting'").run(port,project,lane,name,generation);ensure(result.changes===1,'SERVICE_GENERATION_CONFLICT');this.event(project,lane,'service.listening',{name,generation,port});});
  }
  releaseService(project,lane,name,generation){return this.transaction(()=>{const r=this.db.prepare("UPDATE services SET status='closed' WHERE project=? AND lane=? AND name=? AND generation=? AND status<>'closed'").run(project,lane,name,generation);if(r.changes)this.event(project,lane,'service.closed',{name,generation});return r.changes===1;});}
  services(project,lane){this.active(project,lane);return this.db.prepare('SELECT * FROM services WHERE project=? AND lane=? ORDER BY name LIMIT 100').all(project,lane).map(row=>({...row,liveness:'not-verified',pidIsSignalAuthority:false}));}
}

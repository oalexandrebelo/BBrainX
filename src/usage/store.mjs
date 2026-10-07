import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { safeDirectory } from '../host.mjs';
import { identifier } from '../primitives.mjs';
import { check, normalizeCall, digest, canonical, comparePair } from './contract.mjs';

export const USAGE_DB = 'usage-v1.sqlite';
const SCHEMA=`
CREATE TABLE usage_heads(project TEXT NOT NULL, key TEXT NOT NULL, revision INTEGER NOT NULL, fingerprint TEXT NOT NULL, occurred TEXT NOT NULL, PRIMARY KEY(project,key));
CREATE TABLE usage_history(project TEXT NOT NULL,key TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,created TEXT NOT NULL,PRIMARY KEY(project,key,revision));
CREATE INDEX usage_recent ON usage_heads(project,occurred DESC,key);
CREATE TABLE usage_pairs(project TEXT NOT NULL,id TEXT NOT NULL,fingerprint TEXT NOT NULL,body TEXT NOT NULL,created TEXT NOT NULL,PRIMARY KEY(project,id));
CREATE TABLE usage_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
`;
const SCHEMA_HASH=digest(SCHEMA);
export const RECORD_LIMIT = 5000;
/** Ledger separado: não migra brain.sqlite. Escrita é explícita via CLI ou importação do host. */
export class UsageStore {
  constructor(home,{readOnly=false}={}) {
    this.home=readOnly?fs.realpathSync(home):safeDirectory(home);
    const file=path.join(this.home,USAGE_DB);
    if(fs.existsSync(file))check(!fs.lstatSync(file).isSymbolicLink(),'UNSAFE_USAGE_DB');
    this.db=new DatabaseSync(file,{readOnly});this.readOnly=readOnly;
    try {
      this.db.exec('PRAGMA busy_timeout=1500;');
      if(!readOnly){
        if(process.platform!=='win32')fs.chmodSync(file,0o600);
        this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
        this.transaction(()=>{
          const version=this.db.prepare('PRAGMA user_version').get().user_version;
          if(version===0){this.db.exec(SCHEMA+'PRAGMA user_version=1;');this.db.prepare('INSERT INTO usage_meta VALUES(?,?)').run('schema',SCHEMA_HASH);}
          else this.validate();
        });
      } else {this.db.exec('PRAGMA query_only=ON');this.validate();}
    }catch(error){this.db.close();throw error;}
  }
  validate(){check(this.db.prepare('PRAGMA user_version').get().user_version===1,'USAGE_SCHEMA_VERSION');check(this.db.prepare("SELECT value FROM usage_meta WHERE key='schema'").get()?.value===SCHEMA_HASH,'USAGE_SCHEMA_HASH');}
  close(){this.db.close();}
  transaction(fn){check(!this.readOnly,'READ_ONLY');this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  import(project,items){
    identifier(project);check(Array.isArray(items)&&items.length>0&&items.length<=100,'INVALID_IMPORT_SIZE');
    // Toda entrada é validada antes da transação. Nenhum caminho ou projeto vem do recibo.
    const rows=items.map(item=>{
      check(item&&Object.keys(item).every(k=>['expectedVersion','call'].includes(k)),'INVALID_IMPORT');
      check(Number.isSafeInteger(item.expectedVersion)&&item.expectedVersion>=0,'INVALID_EXPECTED_VERSION');
      const call=normalizeCall(item.call);return {expectedVersion:item.expectedVersion,call,key:digest({provider:call.provider,account:call.account,callId:call.callId}),fingerprint:digest(call)};
    });
    check(new Set(rows.map(r=>r.key)).size===rows.length,'DUPLICATE_BATCH_KEY');
    return this.transaction(()=>{
      let count=this.db.prepare('SELECT count(*) AS n FROM usage_history').get().n;
      const result=[];
      for(const row of rows){
        const old=this.db.prepare('SELECT * FROM usage_heads WHERE project=? AND key=?').get(project,row.key);
        if(old?.fingerprint===row.fingerprint){result.push({key:row.key,version:old.revision,duplicate:true});continue;}
        check(count<100000,'USAGE_RETENTION_LIMIT');
        check((old?.revision??0)===row.expectedVersion,'USAGE_VERSION_CONFLICT');
        if(old){
          const prior=JSON.parse(this.db.prepare('SELECT body FROM usage_history WHERE project=? AND key=? AND revision=?').get(project,row.key,old.revision).body);
          check(['callId','account','provider','model','harness','task','run','snapshot','configurationHash','occurredAt','format'].every(k=>prior[k]===row.call[k]),'IMMUTABLE_CALL_IDENTITY');
        }
        const revision=row.expectedVersion+1;
        this.db.prepare('INSERT INTO usage_history VALUES(?,?,?,?,?)').run(project,row.key,revision,canonical(row.call),new Date().toISOString());
        this.db.prepare('INSERT INTO usage_heads VALUES(?,?,?,?,?) ON CONFLICT(project,key) DO UPDATE SET revision=excluded.revision,fingerprint=excluded.fingerprint,occurred=excluded.occurred').run(project,row.key,revision,row.fingerprint,row.call.occurredAt);
        count++;result.push({key:row.key,version:revision,duplicate:false});
      }
      return result;
    });
  }
  records(project){
    identifier(project);
    const rows=this.db.prepare('SELECT h.body,c.revision FROM usage_heads c JOIN usage_history h ON h.project=c.project AND h.key=c.key AND h.revision=c.revision WHERE c.project=? ORDER BY c.occurred DESC,c.key LIMIT ?').all(project,RECORD_LIMIT+1);
    return {records:rows.slice(0,RECORD_LIMIT).map(r=>({...JSON.parse(r.body),revision:r.revision})),truncated:rows.length>RECORD_LIMIT,limit:RECORD_LIMIT};
  }
  recordPair(project,spec){
    identifier(project);comparePair([],spec); // Valida o contrato sem presumir que o par já esteja completo.
    return this.transaction(()=>{
      const fingerprint=digest(spec),old=this.db.prepare('SELECT fingerprint FROM usage_pairs WHERE project=? AND id=?').get(project,spec.id);
      if(old){check(old.fingerprint===fingerprint,'PAIR_IDENTITY_CONFLICT');return {id:spec.id,duplicate:true};}
      check(this.db.prepare('SELECT count(*) AS n FROM usage_pairs WHERE project=?').get(project).n<1000,'PAIR_LIMIT');
      this.db.prepare('INSERT INTO usage_pairs VALUES(?,?,?,?,?)').run(project,spec.id,fingerprint,canonical(spec),new Date().toISOString());
      return {id:spec.id,duplicate:false};
    });
  }
  snapshot(project){
    this.db.exec('BEGIN');try{
      const calls=this.records(project);
      const rows=this.db.prepare('SELECT body FROM usage_pairs WHERE project=? ORDER BY created DESC,id LIMIT 101').all(project);
      const pairs=rows.slice(0,100).map(r=>{
        const spec=JSON.parse(r.body),result=comparePair(calls.records,spec);
        if(calls.truncated)return {...result,comparable:false,money:[],baselineTokens:null,candidateTokens:null,savedTokens:null,savingsPercent:null,reasons:[...result.reasons,'CALL_WINDOW_TRUNCATED']};
        return result;
      });
      this.db.exec('COMMIT');return {...calls,pairs,pairsTruncated:rows.length>100};
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
}
export function readUsage(home,project){
  const file=path.join(home,USAGE_DB);if(!fs.existsSync(file))return {records:[],pairs:[],truncated:false,pairsTruncated:false,limit:RECORD_LIMIT};
  const store=new UsageStore(home,{readOnly:true});try{return store.snapshot(project);}finally{store.close();}
}

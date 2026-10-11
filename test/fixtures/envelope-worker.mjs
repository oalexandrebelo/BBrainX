// JS stand-in for profiles/laya/worker.py's request admission. No model, no inference claim.
// The numbers are copied from worker.py on purpose (an independent oracle); laya-envelope.test.mjs parses worker.py
// and fails if they drift. Usage: envelope-worker.mjs <audit-file>
import readline from 'node:readline';
import fs from 'node:fs';
const [audit]=process.argv.slice(2),send=message=>process.stdout.write(JSON.stringify(message)+'\n');
const MAX_STATES=64,MAX_QUESTIONS=16,MAX_STATE_CHARS=50000,MAX_REQUEST_BYTES=4*1024*1024,MAX_BATCH_ROWS=128,MAX_BATCH_TOKENS=131072,DEFAULT_MAX_LEN=512;
const log=entry=>{if(audit)fs.appendFileSync(audit,JSON.stringify(entry)+'\n');};
log({event:'spawn'});
send({op:'ready',ok:true,laya:'envelope-fixture',torch:'none',device:'cpu',loadMs:1});
const refuse=(id,detail)=>send({id,ok:false,error:'ValueError',detail});
for await(const line of readline.createInterface({input:process.stdin,crlfDelay:Infinity})){
  if(Buffer.byteLength(line)+1>MAX_REQUEST_BYTES){send({id:null,ok:false,error:'ValueError',detail:'request exceeds 4 MiB'});continue;}
  let request;try{request=JSON.parse(line);}catch{send({id:null,ok:false,error:'JSONDecodeError',detail:'invalid'});continue;}
  const id=request.id,{states,questions}=request,strictHead=request.strictHead??false,maxLen=request.maxLen;
  if(states?.[0]==='refuse-null-id'){send({id:null,ok:false,error:'ValueError',detail:'request exceeds 4 MiB'});continue;}
  if(states?.[0]==='refuse')log({event:'refused',id});
  if(states?.[0]==='refuse'){refuse(id,'batch exceeds admitted envelope');continue;}
  if(typeof strictHead!=='boolean'){refuse(id,'strictHead must be a boolean');continue;}
  if(maxLen!==undefined&&(typeof maxLen!=='number'||!Number.isInteger(maxLen)||maxLen<32||maxLen>8192)){refuse(id,'maxLen must be an integer from 32 to 8192');continue;}
  if(!Array.isArray(states)||states.length<1||states.length>MAX_STATES){refuse(id,'states must be a list of 1 to 64 items');continue;}
  if(questions===null||typeof questions!=='object'||Array.isArray(questions)||Object.keys(questions).length<1||Object.keys(questions).length>MAX_QUESTIONS){refuse(id,'questions must be an object with 1 to 16 entries');continue;}
  if(states.some(s=>typeof s!=='string'||[...s].length>MAX_STATE_CHARS)){refuse(id,'each state must be a string of at most 50000 characters');continue;}
  const rows=states.length*Object.keys(questions).length;
  if(rows>MAX_BATCH_ROWS||rows*(maxLen??DEFAULT_MAX_LEN)>MAX_BATCH_TOKENS){log({event:'refused',id,rows});refuse(id,'batch exceeds admitted envelope');continue;}
  log({event:'accepted',id,rows,maxLen:maxLen??null});
  const answers=Object.fromEntries(Object.entries(questions).map(([name,q])=>[name,q.type==='choice'?{choice:Object.keys(q.criteria)[0],confidence:.7}:q.type==='score'?{score:0}:{noul:.5,confidence:.5}]));
  send({id,ok:true,ms:1,results:states.map(()=>({answers,truncated:false,stateTokensDropped:0,inputTokens:1,headTruncated:false,headWarnings:[]}))});
}

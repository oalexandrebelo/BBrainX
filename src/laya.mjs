import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { BrainError, ensure } from './primitives.mjs';
import { stateHome } from './host.mjs';

/**
 * Perfil Laya: modelo local de decisão (encoder + cabeça, não gera texto), Apache-2.0, de NandhaKishorM/laya.
 * Fica fora do núcleo: ambiente Python próprio e pesos na pasta de estado, ligado só por comando do usuário.
 * Tudo é fixado: versão do pacote, revisão do repositório de pesos e SHA-256 de cada arquivo.
 */
export const LAYA=Object.freeze({
  package:'laya',version:'0.3.26',license:'Apache-2.0',source:'https://github.com/NandhaKishorM/laya',
  repository:'convaiinnovations/laya',revision:'1c5edc17a7acd8701df6fc341c0d179f1c62c982',checkpoint:'multilingual',
  files:Object.freeze([
    {path:'rl_agent_config.json',bytes:472,sha256:'25061739243b617ad88d1219ba6f8a9c86c5881ca28df024fa2d9b3b2fcc30c6'},
    {path:'encoder/config.json',bytes:1938,sha256:'83f6916d13ef0f556ac461f28308dc2bffa7ebeadee8ec9e2db5812020ea5bb4'},
    {path:'tokenizer/tokenizer_config.json',bytes:524,sha256:'6c6b2d8e3c84ce0e671c129cd6b374b235d6f9863042a5836358d00a89bbb5a1'},
    {path:'tokenizer/tokenizer.json',bytes:34363188,sha256:'609d8f4c067cd3950f88594c5a802616cea245823836ef5848ee4fc40aab5b6f'},
    {path:'model.safetensors',bytes:643835514,sha256:'9d628fd971b700382ac6f65920a86f149777b2e748e0c955fb3b19695aa8f204'}
  ])
});
const assets=fileURLToPath(new URL('../profiles/laya/',import.meta.url));
// Conferidos a cada carga, antes de qualquer peso ser lido. O tokenizer_config.json fica de fora: o Laya pode reescrevê-lo.
const guarded=Object.fromEntries(LAYA.files.filter(file=>file.path!=='tokenizer/tokenizer_config.json').map(file=>[file.path,file.sha256]));

export function layaPaths(home=stateHome()){
  const root=path.join(home,'profiles','laya'), venv=path.join(root,'venv');
  const python=process.platform==='win32'?path.join(venv,'Scripts','python.exe'):path.join(venv,'bin','python');
  return {root,venv,python,model:path.join(root,'models',LAYA.checkpoint),receipt:path.join(root,'receipt.json'),bench:path.join(root,'bench.json')};
}
async function sha256(file){const digest=createHash('sha256');await pipeline(fs.createReadStream(file),digest);return digest.digest('hex');}
const readJson=file=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}};

/** Baixa só o que falta ou não confere. Um arquivo só troca de nome para o definitivo depois de bater tamanho e hash. */
export async function fetchWeights({home,log=()=>{},fetchImpl=fetch,files=LAYA.files}={}){
  const {model}=layaPaths(home), report=[];
  for(const file of files){
    const target=path.join(model,file.path);
    if(fs.existsSync(target)&&fs.statSync(target).size===file.bytes&&await sha256(target)===file.sha256){report.push({path:file.path,action:'kept'});continue;}
    fs.mkdirSync(path.dirname(target),{recursive:true});
    log('baixando '+file.path+' ('+Math.round(file.bytes/1048576)+' MiB)');
    const response=await fetchImpl('https://huggingface.co/'+LAYA.repository+'/resolve/'+LAYA.revision+'/'+LAYA.checkpoint+'/'+file.path);
    ensure(response.ok&&response.body,'LAYA_DOWNLOAD_FAILED',file.path+': HTTP '+response.status);
    const partial=target+'.partial', digest=createHash('sha256');let bytes=0;
    const meter=new Transform({transform(chunk,_,done){bytes+=chunk.length;digest.update(chunk);done(bytes>file.bytes?new BrainError('LAYA_DIGEST_MISMATCH',file.path+' é maior que o esperado.'):null,chunk);}});
    try{
      await pipeline(Readable.fromWeb(response.body),meter,fs.createWriteStream(partial));
      ensure(bytes===file.bytes&&digest.digest('hex')===file.sha256,'LAYA_DIGEST_MISMATCH',file.path+' não confere com o SHA-256 fixado; nada foi instalado.');
      fs.renameSync(partial,target);
    }finally{fs.rmSync(partial,{force:true});}
    report.push({path:file.path,action:'downloaded'});
  }
  return report;
}

function runtimeVersion(command,env){
  const result=spawnSync(command,['--version'],{encoding:'utf8',timeout:2500,maxBuffer:65536,windowsHide:true,shell:false,env:workerEnv(env)});
  return {available:!result.error&&result.status===0,version:result.status===0?(result.stdout||result.stderr).trim():null};
}
const supportedPython=version=>typeof version==='string'&&/^Python 3\.(?:10|11|12|13)\.\d+$/.test(version);
/** Python 3.10–3.13. Explicit host choice is absolute and never falls back on failure. */
export function findPython(env=process.env){
  if(env.BBRAINX_PYTHON!==undefined){
    const selected=env.BBRAINX_PYTHON;
    ensure(typeof selected==='string'&&path.isAbsolute(selected),'LAYA_PYTHON_INVALID','BBRAINX_PYTHON precisa ser um caminho absoluto para Python 3.10–3.13.');
    let executable;
    try{executable=fs.realpathSync.native(selected);ensure(fs.statSync(executable).isFile(),'LAYA_PYTHON_INVALID');}
    catch{ensure(false,'LAYA_PYTHON_INVALID','BBRAINX_PYTHON não aponta para um executável Python disponível.');}
    const result=runtimeVersion(executable,env);
    ensure(result.available&&supportedPython(result.version),'LAYA_PYTHON_INVALID','BBRAINX_PYTHON precisa executar --version com sucesso e informar Python 3.10–3.13.');
    return {tool:executable,version:result.version};
  }
  const uv=runtimeVersion('uv',env);
  if(uv.available)return {tool:'uv',version:uv.version};
  for(const name of ['python3.12','python3.13','python3.11','python3.10','python3']){const found=runtimeVersion(name,env);if(found.available&&supportedPython(found.version))return {tool:name,version:found.version};}
  return null;
}
function run(command,args){
  // A saída do instalador vai para a saída de erro: a saída padrão do CLI é sempre um JSON.
  const result=spawnSync(command,args,{stdio:['ignore',2,2],shell:false,windowsHide:true});
  ensure(!result.error&&result.status===0,'LAYA_INSTALL_FAILED',command+' '+args.slice(0,3).join(' ')+' terminou com '+(result.error?.code||result.status)+'.');
}
/** Cria o ambiente isolado e instala as versões fixadas. Não usa sudo e não toca no Python do sistema. */
export function installRuntime({home,log=()=>{}}={}){
  const paths=layaPaths(home), found=findPython(), requirements=path.join(assets,'requirements.txt');
  ensure(found,'LAYA_PYTHON_REQUIRED','Instale o uv (https://docs.astral.sh/uv/) ou um Python de 3.10 a 3.13 e repita.');
  fs.mkdirSync(paths.root,{recursive:true,mode:0o700});
  if(!fs.existsSync(paths.python)){
    log('criando o ambiente Python em '+paths.venv);
    if(found.tool==='uv')run('uv',['venv','--python','3.12',paths.venv]);else run(found.tool,['-m','venv',paths.venv]);
  }
  log('instalando '+LAYA.package+' '+LAYA.version+' e dependências fixadas');
  if(found.tool==='uv')run('uv',['pip','install','--python',paths.python,'-r',requirements]);else run(paths.python,['-m','pip','install','--disable-pip-version-check','-r',requirements]);
  return {tool:found.tool,python:paths.python};
}

/**
 * O perfil não altera o pacote de contexto: medido em 04/10/2026, sem ajuste fino ele acertou menos que o caminho
 * lexical nas duas decisões testadas (docs/FEASIBILITY.md). Serve para perguntar (`laya ask`) e medir (`laya bench`).
 */
export function layaStatus(home){
  const paths=layaPaths(home), runtime=fs.existsSync(paths.python);
  const weights=LAYA.files.every(file=>{try{return fs.statSync(path.join(paths.model,file.path)).size===file.bytes;}catch{return false;}});
  return {profile:'laya',package:LAYA.package+' '+LAYA.version,license:LAYA.license,checkpoint:LAYA.checkpoint,revision:LAYA.revision,runtime,weights,installed:runtime&&weights,changesContextPack:false,location:paths.root,receipt:readJson(paths.receipt),bench:readJson(paths.bench)};
}
/** Apaga só a pasta do perfil (ambiente e pesos). O banco e as memórias não ficam nela. */
export function removeProfile(home){const {root}=layaPaths(home);fs.rmSync(root,{recursive:true,force:true});return {removed:root};}

const FAILURES_TO_OPEN=3, OPEN_MS=300000, FRAME_BYTES=1048576, REQUEST_BYTES=4*1048576;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const counter=value=>Number.isSafeInteger(value)&&value>=0;
const boundedText=value=>typeof value==='string'&&value.length>0&&value.length<=16000;
const duration=value=>Number.isInteger(value)&&value>0&&value<=2147483647;
function requestInput(states,questions,maxLen){
  if(!Array.isArray(states)||states.length<1||states.length>64||states.some(s=>typeof s!=='string'||s.length>50000))return false;
  if(!plain(questions)||Object.keys(questions).length<1||Object.keys(questions).length>16)return false;
  if(maxLen!==undefined&&(!Number.isSafeInteger(maxLen)||maxLen<256||maxLen>8192))return false;
  for(const [name,q] of Object.entries(questions)){
    if(!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(name)||!plain(q)||Object.keys(q).some(k=>!['type','instructions','criteria'].includes(k)))return false;
    // Empty questions remain compatible with the old broker protocol; new callers declare a type.
    if(q.type!==undefined&&!['choice','noul','score'].includes(q.type))return false;
    if(q.instructions!==undefined&&!boundedText(q.instructions))return false;
    if(q.type==='choice'&&!plain(q.criteria)||q.type==='score'&&!Array.isArray(q.criteria))return false;
    if(q.criteria!==undefined){
      const criteria=q.criteria;
      if(Array.isArray(criteria)){
        if(q.type==='choice'||q.type==='noul'||criteria.length<1||criteria.length>64||criteria.some(c=>!boundedText(c)))return false;
      }else if(!plain(criteria)||Object.keys(criteria).length<1||Object.keys(criteria).length>64||Object.entries(criteria).some(([k,v])=>!boundedText(k)||!boundedText(v)))return false;
      if(q.type==='noul'&&Object.keys(criteria).some(k=>!['true','false'].includes(k.toLowerCase())))return false;
    }
  }
  return true;
}
function answersValid(results,states,questions,strictHead){
  if(!Array.isArray(results)||results.length!==states.length)return false;
  const names=Object.keys(questions), fields=['choice','score','noul','answer_confidence','confidence','probabilities'];
  return results.every(result=>{
    if(!plain(result)||Object.keys(result).some(k=>!['answers','truncated','stateTokensDropped','inputTokens','headTruncated','headWarnings'].includes(k))||typeof result.truncated!=='boolean'||!counter(result.stateTokensDropped)||!counter(result.inputTokens)||!plain(result.answers))return false;
    if(strictHead&&!Object.hasOwn(result,'headTruncated'))return false;
    if(Object.hasOwn(result,'headTruncated')||Object.hasOwn(result,'headWarnings')){
      if(typeof result.headTruncated!=='boolean'||!Array.isArray(result.headWarnings)||result.headWarnings.length>16||result.headTruncated!==(result.headWarnings.length>0)||new Set(result.headWarnings).size!==result.headWarnings.length||result.headWarnings.some(id=>!names.includes(id)))return false;
      if(strictHead&&result.headTruncated)return result.truncated===true&&Object.keys(result.answers).length===0;
    }
    if(Object.keys(result.answers).length!==names.length||names.some(name=>!Object.hasOwn(result.answers,name)))return false;
    return names.every(name=>{
      const a=result.answers[name],q=questions[name];
      if(!plain(a)||Object.keys(a).some(k=>!fields.includes(k)))return false;
      const type=q.type;if(type?!Object.hasOwn(a,type):!['choice','score','noul'].some(k=>Object.hasOwn(a,k)))return false;
      for(const [key,value] of Object.entries(a)){
        if(key==='choice'){
          if(!boundedText(value)||(q.type==='choice'&&plain(q.criteria)&&!Object.hasOwn(q.criteria,value)))return false;
        }else if(key==='probabilities'){
          if(!Array.isArray(value)&&!plain(value))return false;
          const values=Object.values(value);if(values.length<1||values.length>64||values.some(v=>!finite(v)||v<0||v>1))return false;
          if(q.type){
            if(Math.abs(values.reduce((sum,v)=>sum+v,0)-1)>.01)return false;
            const expected=q.type==='choice'?Object.keys(q.criteria):q.type==='score'?q.criteria.map((_,i)=>String(i)):null;
            if(expected&&(values.length!==expected.length||Object.keys(value).some(k=>!expected.includes(k))||q.type==='choice'&&!plain(value)))return false;
          }
        }else if(!finite(value)||(key!=='score'&&(value<0||value>1))||(key==='score'&&q.type==='score'&&Array.isArray(q.criteria)&&(value<0||value>q.criteria.length-1)))return false;
      }
      return true;
    });
  });
}
/** Retain only runtime paths, never provider credentials, PYTHONPATH or Node injection flags.
 * Offline library flags are not an OS network sandbox.
 */
function workerEnv(source=process.env){
  const env={};
  for(const name of ['PATH','HOME','USERPROFILE','SYSTEMROOT','SystemRoot','WINDIR','TEMP','TMP','TMPDIR','LANG','LC_ALL'])if(source[name]!==undefined)env[name]=source[name];
  return {...env,HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',HF_HUB_DISABLE_TELEMETRY:'1',TOKENIZERS_PARALLELISM:'false',PYTHONNOUSERSITE:'1'};
}

/** One bounded request in flight. Deadline includes loading; abort/timeout retires its worker generation. */
export class LayaBroker{
  #generation=null;#active=null;#sequence=0;#failures=0;#openUntil=0;
  info=null;
  constructor({home,startMs=90000,deadlineMs=4000,command}={}){this.paths=layaPaths(home);this.startMs=startMs;this.deadlineMs=deadlineMs;this.command=command;}
  #fail(reason){if(++this.#failures>=FAILURES_TO_OPEN){this.#openUntil=Date.now()+OPEN_MS;this.#failures=0;}return {ok:false,reason};}
  #finish(operation,result){
    if(operation.done)return;
    operation.done=true;clearTimeout(operation.timer);operation.signal?.removeEventListener('abort',operation.abort);
    if(this.#active===operation)this.#active=null;
    operation.resolve(result);
  }
  #retire(generation,reason='UNAVAILABLE'){
    if(!generation||generation.closed)return;
    generation.closed=true;clearTimeout(generation.timer);generation.resolveReady(false);
    if(this.#generation===generation){this.#generation=null;this.info=null;}
    if(this.#active?.generation===generation)this.#finish(this.#active,{ok:false,reason});
    generation.parts=[];generation.bytes=0;
    generation.child.stdin.destroy();generation.child.kill('SIGKILL');
  }
  #line(generation,bytes){
    if(this.#generation!==generation||generation.closed)return;
    let message;
    try{message=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return this.#retire(generation,'INVALID_RESPONSE');}
    if(!plain(message))return this.#retire(generation,'INVALID_RESPONSE');
    if(!generation.ready){
      if(message.op!=='ready'||typeof message.ok!=='boolean')return this.#retire(generation,'INVALID_RESPONSE');
      if(!message.ok)return this.#retire(generation,'UNAVAILABLE');
      if(!['laya','torch','device'].every(k=>typeof message[k]==='string'&&message[k].length>0&&message[k].length<=120)||!finite(message.loadMs)||message.loadMs<0)return this.#retire(generation,'INVALID_RESPONSE');
      generation.ready=true;clearTimeout(generation.timer);
      this.info={laya:message.laya,torch:message.torch,device:message.device,loadMs:message.loadMs};generation.resolveReady(true);return;
    }
    const operation=this.#active;
    if(!operation||operation.generation!==generation||message.id!==operation.id||typeof message.ok!=='boolean')return this.#retire(generation,'INVALID_RESPONSE');
    if(performance.now()>=operation.expiresAt)return this.#retire(generation,'TIMEOUT');
    if(!message.ok)return this.#finish(operation,{ok:false,reason:'ERROR'});
    if(!finite(message.ms)||message.ms<0||!answersValid(message.results,operation.states,operation.questions,operation.strictHead))return this.#retire(generation,'INVALID_RESPONSE');
    this.#finish(operation,{ok:true,results:message.results,ms:message.ms});
  }
  start(){
    if(this.#generation?.ready)return Promise.resolve(true);
    if(this.#generation)return this.#generation.readyPromise;
    if(!duration(this.startMs))return Promise.resolve(false);
    let command,args,child;
    try{
      [command,...args]=this.command??[this.paths.python,path.join(assets,'worker.py'),this.paths.model,JSON.stringify(guarded)];
      child=spawn(command,args,{stdio:['pipe','pipe','ignore'],shell:false,windowsHide:true,env:workerEnv()});
    }catch{return Promise.resolve(false);}
    let resolveReady;const readyPromise=new Promise(resolve=>{resolveReady=resolve;});
    const generation={child,readyPromise,resolveReady,ready:false,closed:false,parts:[],bytes:0};this.#generation=generation;
    child.once('error',()=>this.#retire(generation));child.once('exit',()=>this.#retire(generation));
    child.stdin.on('error',()=>this.#retire(generation));
    child.stdout.on('error',()=>this.#retire(generation));
    child.stdout.on('data',chunk=>{
      if(generation.closed||this.#generation!==generation)return;
      let start=0;
      while(start<chunk.length){
        const end=chunk.indexOf(10,start),until=end<0?chunk.length:end;
        generation.bytes+=until-start;
        if(generation.bytes>FRAME_BYTES)return this.#retire(generation,'INVALID_RESPONSE');
        generation.parts.push(chunk.subarray(start,until));
        if(end<0)return;
        const line=Buffer.concat(generation.parts,generation.bytes);generation.parts=[];generation.bytes=0;
        this.#line(generation,line);if(generation.closed)return;start=end+1;
      }
    });
    generation.timer=setTimeout(()=>this.#retire(generation,'TIMEOUT'),this.startMs);
    return readyPromise;
  }
  async decide(states,questions,options={}){
    const began=performance.now();
    let request,deadlineMs,maxLen,signal,strictHead,id;
    try{
      ({deadlineMs=this.deadlineMs,maxLen,signal,strictHead=false}=options);
      if(!duration(deadlineMs)||!requestInput(states,questions,maxLen)||typeof strictHead!=='boolean'||(signal!==undefined&&!(signal instanceof AbortSignal)))return {ok:false,reason:'INVALID_INPUT'};
      id='d'+(++this.#sequence);
      request={id,op:'decide',states,questions,...(maxLen===undefined?{}:{maxLen}),...(strictHead?{strictHead:true}:{})};
      request=JSON.stringify(request)+'\n';if(Buffer.byteLength(request)>REQUEST_BYTES)return {ok:false,reason:'INVALID_INPUT'};
      // Own the exact input snapshot across startup awaits, not mutable caller arrays/objects.
      const cloned=JSON.parse(request);states=cloned.states;questions=cloned.questions;
      if(!requestInput(states,questions,cloned.maxLen))return {ok:false,reason:'INVALID_INPUT'};
    }catch{return {ok:false,reason:'INVALID_INPUT'};}
    if(signal?.aborted)return {ok:false,reason:'CANCELLED'};
    if(this.#active)return {ok:false,reason:'BUSY'};
    if(Date.now()<this.#openUntil)return {ok:false,reason:'DEGRADED'};
    const expiresAt=began+deadlineMs;
    if(performance.now()>=expiresAt)return this.#fail('TIMEOUT');
    let resolve;const result=new Promise(r=>{resolve=r;});
    const operation={id,states,questions,strictHead,expiresAt,resolve,signal,done:false,generation:null};this.#active=operation;
    const abort=reason=>{
      if(operation.done)return;
      this.#finish(operation,{ok:false,reason});this.#retire(operation.generation,reason);
    };
    operation.abort=()=>abort('CANCELLED');signal?.addEventListener('abort',operation.abort,{once:true});
    operation.timer=setTimeout(()=>abort('TIMEOUT'),Math.max(1,expiresAt-performance.now()));
    const ready=this.start();operation.generation=this.#generation;
    void ready.then(ok=>{
      if(operation.done)return;
      if(!ok)return this.#finish(operation,{ok:false,reason:'UNAVAILABLE'});
      if(performance.now()>=expiresAt)return abort('TIMEOUT');
      try{
        // Exactly one bounded frame is written; no producer queue or further writes before response.
        operation.generation.child.stdin.write(request,error=>{if(error&&!operation.done)this.#retire(operation.generation);});
      }catch{this.#retire(operation.generation);}
    }).catch(()=>abort('UNAVAILABLE'));
    const reply=await result;
    if(reply.ok){this.#failures=0;return reply;}
    return ['CANCELLED','BUSY','INVALID_INPUT'].includes(reply.reason)?reply:this.#fail(reply.reason);
  }
  stop(){
    if(this.#active)this.#finish(this.#active,{ok:false,reason:'UNAVAILABLE'});
    this.#retire(this.#generation);this.info=null;
  }
}

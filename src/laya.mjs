import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { LayaTransport } from './laya-transport.mjs';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { BrainError, ensure } from './primitives.mjs';
import { commandVersion, stateHome } from './host.mjs';

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
    const partial=target+'.partial.'+randomUUID(), digest=createHash('sha256');let bytes=0;
    const meter=new Transform({transform(chunk,_,done){bytes+=chunk.length;digest.update(chunk);done(bytes>file.bytes?new BrainError('LAYA_DIGEST_MISMATCH',file.path+' é maior que o esperado.'):null,chunk);}});
    try{
      await pipeline(Readable.fromWeb(response.body),meter,fs.createWriteStream(partial,{flags:'wx',mode:0o600}));
      ensure(bytes===file.bytes&&digest.digest('hex')===file.sha256,'LAYA_DIGEST_MISMATCH',file.path+' não confere com o SHA-256 fixado; nada foi instalado.');
      fs.renameSync(partial,target);
    }finally{fs.rmSync(partial,{force:true});}
    report.push({path:file.path,action:'downloaded'});
  }
  return report;
}

/** Python 3.10–3.13, na ordem em que o Laya foi medido. O 3.14 não está na lista de versões do pacote. */
export function findPython(){
  const uv=commandVersion('uv');
  if(uv.available)return {tool:'uv',version:uv.version};
  for(const name of ['python3.12','python3.13','python3.11','python3.10']){const found=commandVersion(name);if(found.available)return {tool:name,version:found.version};}
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

/** Transporte limitado por geração. Não habilita cache, altera pesos ou a seleção lexical. */
export class LayaBroker extends LayaTransport {
  constructor({home,command,...options}={}) {
    const paths=layaPaths(home);
    super({...options,command:command??[paths.python,path.join(assets,'worker.py'),paths.model,JSON.stringify(guarded)]});
    this.paths=paths;
  }
}

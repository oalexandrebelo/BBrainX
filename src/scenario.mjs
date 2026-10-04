import fs from 'node:fs';
import path from 'node:path';
import { doctor } from './host.mjs';
import { LAYA, layaStatus } from './laya.mjs';

/** Procura um executável no PATH sem executá-lo. */
export function onPath(name,env=process.env,platform=process.platform){
  const extensions=platform==='win32'?(env.PATHEXT||'.EXE;.CMD;.BAT').split(';'):[''];
  for(const directory of (env.PATH||'').split(path.delimiter).filter(Boolean))for(const extension of extensions){
    const candidate=path.join(directory,name+extension);
    try{if(fs.statSync(candidate).isFile())return candidate;}catch{/* não está aqui */}
  }
  return null;
}
const HARNESSES={claude:'Claude Code',codex:'Codex CLI','cursor-agent':'Cursor CLI',gemini:'Gemini CLI',opencode:'OpenCode'};
const PYTHONS=['python3.12','python3.13','python3.11','python3.10'];

/**
 * Melhor cenário possível nesta máquina: o que o núcleo já entrega, quais harnesses estão instalados e quais
 * perfis opcionais podem ser ligados, com o comando de cada passo. Só observa: não instala, não executa
 * as ferramentas encontradas e não lê configuração de nenhum harness.
 */
export function scenario({home,env=process.env}={}){
  const core=doctor(), laya=layaStatus(home);
  const tools={uv:!!onPath('uv',env),python:PYTHONS.filter(name=>onPath(name,env)),docker:!!onPath('docker',env),ffmpeg:!!onPath('ffmpeg',env)};
  const harnesses=Object.fromEntries(Object.keys(HARNESSES).map(name=>[name,!!onPath(name,env)]));
  const steps=[];
  if(!core.ready)steps.push({area:'núcleo',state:'bloqueado',detail:'Instale Node 24 LTS e Git. Nada mais é necessário para o núcleo.'});
  else steps.push({area:'núcleo',state:'pronto',detail:'Busca, pacote de contexto, checkpoints e memórias funcionam sem modelo, rede ou conta.',command:'node bin/bbrainx.mjs up --root /caminho/do/projeto'});
  const found=Object.entries(harnesses).filter(([,present])=>present).map(([name])=>name);
  if(found.length)for(const name of found)steps.push({area:'harness',state:'encontrado',detail:HARNESSES[name]+' está no PATH. O comando imprime a configuração; quem grava é você.',command:'node bin/bbrainx.mjs config --project <id> --client '+(name==='cursor-agent'?'cursor':name)});
  else steps.push({area:'harness',state:'não encontrado',detail:'Nenhum CLI de harness no PATH. Editores com MCP (VS Code, Cursor) usam o mesmo servidor.',command:'node bin/bbrainx.mjs config --project <id> --client vscode'});
  const canInstall=tools.uv||tools.python.length>0;
  if(laya.installed)steps.push({area:'perfil laya',state:'instalado',detail:'Modelo local de decisão ('+LAYA.package+' '+LAYA.version+'). Não altera o pacote de contexto; serve para perguntar e medir.',command:'node bin/bbrainx.mjs laya ask --state "texto" --file perguntas.json'});
  else if(canInstall)steps.push({area:'perfil laya',state:'disponível',detail:'Opcional. Baixa cerca de 0,7 GB de ambiente Python e 0,68 GB de pesos, conferidos por SHA-256.'+(core.hardware.platform==='darwin'&&core.hardware.architecture==='arm64'?' Medido em Apple Silicon (GPU via MPS).':' Ainda não medido neste tipo de máquina.'),command:'node bin/bbrainx.mjs laya install'});
  else steps.push({area:'perfil laya',state:'indisponível',detail:'Falta o uv ou um Python de 3.10 a 3.13. O núcleo não depende disso.'});
  steps.push({area:'sandbox',state:tools.docker?'possível':'indisponível',detail:tools.docker?'Docker encontrado. O BBrainX não executa código: um executor isolado (ex.: OpenHands) consome o contexto por MCP.':'Sem Docker. Executores isolados como o OpenHands ficam fora; o núcleo não precisa deles.'});
  return {core:{ready:core.ready,node:core.node,platform:core.hardware.platform+' '+core.hardware.architecture,memoryGiB:core.hardware.memoryGiB},tools,harnesses,profiles:{laya:{installed:laya.installed,runtime:laya.runtime,weights:laya.weights,changesContextPack:false}},steps};
}

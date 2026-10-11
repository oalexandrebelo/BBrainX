import { parseArgs } from 'node:util';
import { isMainModule } from '../src/main-module.mjs';
import { spawn } from 'node:child_process';
import { panelTarget } from '../src/panel/probe.mjs';
import { panelStatus, ensurePanel } from '../src/panel/lifecycle.mjs';

export async function panelCommand(args=process.argv.slice(2)) {
  const {values,positionals}=parseArgs({args,allowPositionals:true,options:{url:{type:'string'},port:{type:'string'},project:{type:'string'},file:{type:'string'},help:{type:'boolean'}}});
  const action=positionals[0]||'status';
  if(values.help){console.log('panel status|start|open [--port 4317 | --url http://127.0.0.1:4317]\npanel export --project ID --file /novo/relatorio.html\nNão instala dependências ou autostart. start/open permanecem em primeiro plano quando criam o servidor.');return;}
  if(positionals.length>1||!['status','start','open','export'].includes(action)||values.url&&values.port)throw new Error('INVALID_PANEL_ARGUMENTS');
  if(action==='export'){
    if(!values.project||!values.file||values.url||values.port)throw new Error('PANEL_EXPORT_ARGUMENTS');
    const {exportPanelSnapshot}=await import('../src/panel/offline.mjs');
    console.log(JSON.stringify(await exportPanelSnapshot(values.project,values.file)));return;
  }
  if(values.project||values.file)throw new Error('INVALID_PANEL_ARGUMENTS');
  const target=panelTarget(values.url??'http://127.0.0.1:'+ (values.port??'4317'));
  if(action==='status'){console.log(JSON.stringify({...await panelStatus(target.url),normalized:target.normalized}));return;}
  let handle,stopRequested=false,resolveStopped;
  const stopped=new Promise(resolve=>{resolveStopped=resolve;});
  const stop=()=>{stopRequested=true;resolveStopped();};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try{
    handle=await ensurePanel(target.url);
    console.log(JSON.stringify({...handle.status,normalized:target.normalized,owned:handle.owned}));
    if(stopRequested)return;
    if(handle.status.state!=='ready'){process.exitCode=1;return;}
    if(action==='open'&&process.platform==='darwin'){
      const child=spawn('/usr/bin/open',[target.url],{stdio:'ignore',shell:false});
      child.once('error',()=>console.error('PANEL_BROWSER_FAILED: abra o endereço informado manualmente.'));
    }
    if(handle.owned)await stopped;
  }finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);await handle?.close();}
}
if(isMainModule(import.meta.url)){
  try{await panelCommand();}catch(e){console.error(JSON.stringify({error:e.code==='ERR_MODULE_NOT_FOUND'?'PANEL_DEPENDENCY_MISSING':/^[A-Z_]+$/.test(e.message)?e.message:'PANEL_START_FAILED',hint:'Confira Node/SQLite; instale explicitamente pelo lockfile e execute npm run build. Nenhuma instalação automática foi feita.'}));process.exitCode=1;}
}

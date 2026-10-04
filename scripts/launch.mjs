import {spawn} from 'node:child_process';
import {BrainStore} from '../src/store.mjs';
import {startServer} from '../src/server.mjs';
const store=new BrainStore();
let server;
try{
  server=await startServer(store);console.log('BBrainX: '+server.url+' · Ctrl+C para encerrar');
  if(process.platform==='darwin'){
    const browser=spawn('open',[server.url],{stdio:'ignore',shell:false});
    browser.on('error',()=>console.error('Abra o endereço acima no navegador.'));
  }
  await new Promise(resolve=>{let closing=false;const stop=async()=>{if(closing)return;closing=true;await server.close();resolve();};process.once('SIGINT',stop);process.once('SIGTERM',stop);});
}catch(error){console.error(error.message);process.exitCode=1;}finally{store.close();}

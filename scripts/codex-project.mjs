import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {BrainStore} from '../src/store.mjs';
import {codexProjectConfig} from '../src/codex-project.mjs';
import {identifier} from '../src/primitives.mjs';
import {stateHome} from '../src/host.mjs';

try {
  const {values}=parseArgs({options:{project:{type:'string'},help:{type:'boolean'}},strict:true,allowPositionals:false});
  if(values.help){console.log('node scripts/codex-project.mjs --project ID\nImprime um fragmento local, sem escrever configurações ou mudar confiança.');}
  else{
    identifier(values.project);
    const store=new BrainStore();
    try{
      const {root}=store.project(values.project);
      const config=codexProjectConfig({project:values.project,root,node:process.execPath,entry:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../bin/bbrainx.mjs'),home:stateHome()});
      console.log(JSON.stringify(config,null,2));
    }finally{store.close();}
  }
}catch(error){console.error(JSON.stringify({ok:false,error:error.code??error.message}));process.exitCode=1;}

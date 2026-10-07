#!/usr/bin/env node
import fs from 'node:fs';
import { TextDecoder } from 'node:util';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { BrainStore } from '../src/store.mjs';
import { UsageStore } from '../src/usage/store.mjs';
import { usageOverview } from '../src/usage/summary.mjs';
import { check } from '../src/usage/contract.mjs';

/** Não abre arquivos globais de harness, não segue symlink final e limita leitura antes de JSON.parse. */
export function readUsageFile(file){
  const stat=fs.lstatSync(file);check(stat.isFile()&&!stat.isSymbolicLink(),'UNSAFE_IMPORT_FILE');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));
  try{
    const opened=fs.fstatSync(fd);check(opened.isFile()&&opened.size<=1024*1024,'IMPORT_TOO_LARGE');
    const buf=Buffer.alloc(1024*1024+1);let offset=0;
    while(offset<buf.length){const n=fs.readSync(fd,buf,offset,buf.length-offset,null);if(!n)break;offset+=n;}
    check(offset<=1024*1024,'IMPORT_TOO_LARGE');
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buf.subarray(0,offset)));
  }finally{fs.closeSync(fd);}
}
export async function main(argv){
  const {positionals,values}=parseArgs({args:argv,allowPositionals:true,strict:true,options:{project:{type:'string'},file:{type:'string'},help:{type:'boolean'}}});
  if(values.help||!positionals.length){console.log('BBrainX Observatory\n\nnode scripts/usage.mjs import --project ID --file recibos.json\nnode scripts/usage.mjs compare --project ID --file par.json\nnode scripts/usage.mjs report --project ID\n\nImporte somente objetos usage finais sanitizados. API privada de cada harness não é interceptada.\nAbra /observatory/ no painel local depois de npm run build.');return;}
  check(positionals.length===1&&['import','compare','report'].includes(positionals[0]),'UNKNOWN_COMMAND');
  check(typeof values.project==='string','PROJECT_REQUIRED');
  const brain=new BrainStore();let usage;
  try{
    brain.project(values.project);
    if(positionals[0]==='report'){check(!values.file,'UNEXPECTED_FILE');console.log(JSON.stringify(usageOverview(brain,values.project),null,2));return;}
    check(values.file,'FILE_REQUIRED');const data=readUsageFile(values.file);
    usage=new UsageStore(brain.home);
    const result=positionals[0]==='import'?usage.import(values.project,data):usage.recordPair(values.project,data);
    console.log(JSON.stringify({project:values.project,result},null,2));
  }finally{usage?.close();brain.close();}
}
if(process.argv[1]===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(e=>{console.error(JSON.stringify({error:e.code||'INVALID_IMPORT'}));process.exitCode=1;});

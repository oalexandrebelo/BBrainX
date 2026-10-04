import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { BrainStore } from '../src/store.mjs';
import { readSafe } from '../src/retrieval.mjs';
import { hash } from '../src/primitives.mjs';

// uso: node scripts/make-definition-cases.mjs --project <id> --out <casos.json> [--sample 200]
// Gera casos rotulados SEM julgamento humano: cada nome exportado/declarado em um único arquivo-fonte do projeto
// vira a consulta, e esse arquivo é a resposta esperada. Serve para `scripts/eval-retrieval.mjs`.
// Os padrões abaixo são propositalmente mais estreitos que os do indexador: só formas inequívocas de declaração.
const {values}=parseArgs({options:{project:{type:'string'},out:{type:'string'},sample:{type:'string'}}});
if(!values.project||!values.out){console.error('uso: node scripts/make-definition-cases.mjs --project <id> --out <casos.json> [--sample 200]');process.exit(2);}
const strict=[/^export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm,/^export\s+(?:const|class)\s+([A-Za-z_$][\w$]*)/gm,/^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/gm,/^class\s+([A-Za-z_]\w*)\s*[(:]/gm,/^func\s+([A-Z]\w*)\s*\(/gm];
const store=new BrainStore();
try{
  const {root}=store.project(values.project), owners=new Map();
  for(const {path:file} of store.db.prepare("SELECT path FROM files WHERE project=? AND kind='source' ORDER BY path").all(values.project)){
    let body;try{body=readSafe(root,file).body;}catch{continue;}
    for(const pattern of strict)for(const match of body.matchAll(pattern)){const name=match[1];if(name.length<6)continue;if(!owners.has(name))owners.set(name,new Set());owners.get(name).add(file);}
  }
  const unique=[...owners].filter(([,files])=>files.size===1).map(([name,files])=>({kind:'declaracao',query:name,expect:[...files]}));
  // Amostra determinística: ordena pelo hash do nome, não pela ordem dos arquivos.
  const cases=unique.sort((a,b)=>hash(a.query)<hash(b.query)?-1:1).slice(0,Number(values.sample||200));
  fs.writeFileSync(values.out,JSON.stringify(cases,null,1)+'\n');
  console.log(JSON.stringify({project:values.project,declaredOnce:unique.length,sampled:cases.length,out:values.out}));
}finally{store.close();}

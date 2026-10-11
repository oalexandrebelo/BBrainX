import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import { performance } from 'node:perf_hooks';import { fileURLToPath } from 'node:url';import { parseArgs } from 'node:util';
import { BrainStore } from '../src/store.mjs';import { indexProject, search } from '../src/retrieval.mjs';import { fitSearch, tokenCount } from '../src/context.mjs';
// Custo em tokens da resposta de context_search e o que ela localiza, sobre os casos rotulados deste repositório (arquivo esperado por consulta).
// Compara o comportamento anterior (12 trechos crus, sem teto), só o orçamento e o padrão atual (orçamento + um acerto por arquivo).
// Tokens são o200k_base do gpt-tokenizer: proxy do payload, não cobrança do provedor. Sem rede, sem modelo, sem escrita no repositório.
// uso: node scripts/measure-search-tokens.mjs [--cases test/fixtures/eval-natural.cases] [--limit 12] [--budget 4000]
const {values}=parseArgs({options:{cases:{type:'string',default:'test/fixtures/eval-natural.cases'},limit:{type:'string',default:'12'},budget:{type:'string',default:'4000'}}});
const root=fileURLToPath(new URL('../',import.meta.url)), limit=Number(values.limit), budget=Number(values.budget);
const cases=JSON.parse(fs.readFileSync(path.resolve(root,values.cases),'utf8'));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bbrainx-tokens-')), store=new BrainStore(dir);
try{
  store.register('self',root);const index=indexProject(store,'self');
  const paths=answer=>[...(answer.items??[]).map(item=>item.path),...(answer.more??[]).map(pointer=>pointer.slice(0,pointer.lastIndexOf(':')))];
  const modes={
    'before (12 raw chunks, no cap)':query=>search(store,'self',query,limit,{byFile:false}),
    'budget only (raw chunks)':query=>fitSearch(search(store,'self',query,limit,{byFile:false}),budget),
    'default (budget + one hit per file)':query=>fitSearch(search(store,'self',query,limit),budget)
  };
  const rows={};
  for(const [name,run] of Object.entries(modes)){
    let tokens=0,items=0,served=0,located=0,duplicates=0,milliseconds=0;
    for(const item of cases){
      const begin=performance.now(), answer=run(item.query);milliseconds+=performance.now()-begin;tokens+=tokenCount(JSON.stringify(answer));items+=answer.items.length;
      served+=answer.items.some(hit=>item.expect.includes(hit.path))?1:0;located+=paths(answer).some(file=>item.expect.includes(file))?1:0;
      duplicates+=answer.items.length-new Set(answer.items.map(hit=>hit.path)).size;
    }
    rows[name]={meanTokens:Math.round(tokens/cases.length),meanItemsWithBody:+(items/cases.length).toFixed(2),expectedFileWithBody:served+'/'+cases.length,expectedFileLocated:located+'/'+cases.length,duplicateFilesInAnswer:duplicates,meanMs:+(milliseconds/cases.length).toFixed(1)};
  }
  // Qualidade da ordem (a mesma de test/godmode.test.mjs): sobre a lista ranqueada de 50, antes e depois de um acerto por arquivo.
  const ranking={};
  for(const [name,options] of [['chunks',{byFile:false}],['one hit per file',{}]]){
    let h1=0,h3=0,h10=0,duplicates=0;
    for(const item of cases){
      const list=search(store,'self',item.query,50,options).items, at=list.findIndex(hit=>item.expect.includes(hit.path)), top=list.slice(0,10);
      h1+=at===0;h3+=at>=0&&at<3;h10+=at>=0&&at<10;duplicates+=top.length-new Set(top.map(hit=>hit.path)).size;
    }
    ranking[name]={hit1:+(h1/cases.length).toFixed(3),hit3:+(h3/cases.length).toFixed(3),hit10:+(h10/cases.length).toFixed(3),duplicateSlotsInTop10:duplicates};
  }
  console.log(JSON.stringify({kind:'search-token-cost-labeled-queries',snapshot:index.snapshot,files:index.files,cases:cases.length,limit,budget,encoding:'o200k_base',billingSavings:null,answer:rows,ranking},null,2));
}finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}

import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { BrainStore } from '../src/store.mjs';
import { evaluateRetrieval } from '../src/evaluation.mjs';

// uso: node scripts/eval-retrieval.mjs --project <id> --cases <casos.json> [--out <relatorio.json>] [--rows]
// O projeto precisa estar registrado e indexado no BBRAINX_HOME atual. Casos: [{"query","expect":["caminho"],"kind"}]. Guarde-os fora das extensões indexadas (ex.: .cases), senão o próprio arquivo de casos vira o 1.º resultado.
const {values}=parseArgs({options:{project:{type:'string'},cases:{type:'string'},out:{type:'string'},rows:{type:'boolean'}}});
if(!values.project||!values.cases){console.error('uso: node scripts/eval-retrieval.mjs --project <id> --cases <casos.json> [--out <relatorio.json>] [--rows]');process.exit(2);}
const store=new BrainStore();
try{
  const report=evaluateRetrieval(store,values.project,JSON.parse(fs.readFileSync(values.cases,'utf8')));
  const output={...report,observedAt:new Date().toISOString(),node:process.versions.node,platform:process.platform,caveats:['Mede a posição do trecho esperado, não tarefa aceita.','Casos rotulados à mão; amostra pequena, sem alegação estatística.']};
  if(!values.rows)delete output.rows;
  if(values.out)fs.writeFileSync(values.out,JSON.stringify({...report,observedAt:output.observedAt},null,2)+'\n');
  console.log(JSON.stringify(output,null,2));
}finally{store.close();}

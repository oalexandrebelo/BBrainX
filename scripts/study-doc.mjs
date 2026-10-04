import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { situations, tools, measuredOn } from '../web/study-map.js';

// uso: node scripts/study-doc.mjs          (grava docs/STUDY_MAP.md a partir de web/study-map.js)
// O painel e o documento saem da mesma fonte; o teste test/study.test.mjs reprova se divergirem.
const basis={medido:'medido neste projeto',spec:'documento oficial lido',leitura:'leitura do código do upstream, sem executar','decisão':'decisão de projeto'};
export function renderStudy(){
  const lines=['# Mapa do estudo: por que cada coisa está onde está','',
    'Este documento é gerado de `web/study-map.js`, a mesma fonte do mapa interativo do painel (aba **Mapa do estudo**). Não edite à mão: altere a fonte e rode `node scripts/study-doc.mjs`.','',
    'Medições: '+measuredOn+'. Cada item informa de onde vem a evidência: **medido** (executado e medido aqui), **documento oficial**, **leitura** (código do upstream lido, sem executar) ou **decisão de projeto**. O que é leitura não foi reexecutado e vale como estudo, não como prova.','',
    '| Situação | Itens | O que significa |','|---|---|---|',
    ...situations.map(situation=>'| **'+situation.label+'** | '+tools.filter(tool=>tool.group===situation.id).length+' | '+situation.summary+' |'),''];
  for(const situation of situations){
    lines.push('## '+situation.label,'',situation.summary,'');
    for(const tool of tools.filter(item=>item.group===situation.id)){
      lines.push('### '+tool.name,'','*'+tool.kind+' · licença: '+tool.license+' · evidência: '+basis[tool.basis]+'*','',
        '**O que é.** '+tool.what,'','**Por que está aqui.** '+tool.why,'','**Evidência.** '+tool.evidence,'');
      if(tool.activate)lines.push('**Como ativar.** `'+tool.activate+'`','');
      lines.push(tool.change?'**O que mudaria o veredito.** '+tool.change:'**Próximo passo.** '+tool.next,'','Fonte: <'+tool.url+'>','');
    }
  }
  return lines.join('\n');
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const target=fileURLToPath(new URL('../docs/STUDY_MAP.md',import.meta.url));
  fs.writeFileSync(target,renderStudy());console.log('gravado: '+target+' ('+tools.length+' itens)');
}

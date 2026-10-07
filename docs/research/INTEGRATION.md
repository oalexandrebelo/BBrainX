# Contrato da consolidação

Data: 07/10/2026. Branch de entrega: `feat/consolidated-research-delivery`. Destino: `main`. Nenhum merge na main foi autorizado por este documento.

## Revisões fixadas

| Origem | Head incorporado |
|---|---|
| main | `a9636e9402e3fa673ae05b3489202da1048aef5e` |
| #6 Atlas | `2c87f61c3d6355adf61e8675e2f3ee96c5cb2489` |
| #7 Auditoria | `76f573ef6382841ada38427fee27f970176e9ca9` |
| #8 MEDIUM/replay | `5e922488d0552828881985bdf24a53b37f011c6a` |
| #9 Observatory | `4a0fc1d06de81f158fda271bd9fb1ce258d8008a` |
| #10 Contratos | `9e8424cbc95e2d80cdab25c970bdd216aba3f720` |
| #11 Lanes | `50d927338eac604ba468cee593060e8d42599a19` |

Os commits de origem permanecem identificáveis. Não fechar ou apagar PRs/branches anteriores automaticamente: servem para revisão granular e histórico. Depois do merge da consolidação, o mantenedor pode encerrar duplicatas, conferindo o que foi realmente incorporado.

## Conflitos reconciliados

**src/store.mjs:** manter o startup de leitura do schema atual e os métodos de acesso/publicação usados por LaneStore. Não aplicar uma cópia antiga sobre os ports da lane. Migração v1→v2, backup e hash do schema permanecem como na base. Novos bancos opcionais continuam separados.

**src/context.mjs:** manter decisões/blockers obrigatórios do #10, verificação de arquivo por versão e cabeçalho da lane do #11. Acrescentar medição opt-in do #9 sobre o mesmo cabeçalho e candidatos. Publicar via `store.commitContextEvent`, nunca voltar à escrita direta que contornaria a revisão central da memória. Eventos da lane conservam `lane`, `laneEpoch`, `memoryRevision`, `measurementVersion` e `referenceTokens`.

**web e build:** Vite inclui painel e Atlas; assets estáticos Observatory continuam em `public/observatory`. A suíte de navegador principal ignora somente a suíte Observatory, que tem seu próprio servidor/configuração e é executada adicionalmente. O Atlas é documental, não representa automaticamente a maturidade desta combinação.

**Doctor e MEDIUM:** manter as observações de memória e perfis do #8. O limite cooperativo de replay não governa todos os processos, e a capacidade de duas lanes não é limite global de RSS ou de modelos. Uma integração de arquivos não transforma esses controladores em supervisor da estação.

**Uso/lanes:** o agregador pode ler eventos do LaneStore; o dashboard principal não enumera automaticamente todos os bancos de lanes. As métricas continuam por armazenamento consultado. Não anunciar captura universal de chamadas privadas dos editores.

## Novos testes de composição

A suíte `consolidated-integration.test.mjs` verifica conjuntamente: duas worktrees, memória aprovada comum, medições locais separadas, contagem BPE exata, revisão de memória preservada no evento, recusa de revogação na publicação e decisões/blockers mantidos com instrumentação ligada. Não substitui os testes específicos de cada módulo.

Os testes de paridade antigos comparam cenários delimitados ao compilador original. A correção de obrigatoriedade pode mudar resultados que antes omitiam uma decisão; nesses casos não se exige paridade com um comportamento incorreto. Nunca alterar gold/threshold para esconder uma regressão desconhecida.

## Reproduzir

```sh
git fetch origin
git worktree add ../BBrainX-consolidado origin/feat/consolidated-research-delivery
cd ../BBrainX-consolidado
npm ci --ignore-scripts
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npx playwright test --config playwright.usage.config.mjs
```

Usar Node suportado pelo projeto. A ausência de rede/dependências no container da conversa não é uma aprovação local da suíte; a CI identificada pelo commit deve executar a combinação completa. Testes finitos não certificam ausência de todos os defeitos.

Laboratórios independentes são executados de suas pastas em `experiments`, sem importá-los pelo core. O candidato X99 antigo precisa de sua própria base e não deve sobrescrever os arquivos integrados. Preservar o código de um experimento não habilita sua política.

## Publicação de evidências

Os workflows específicos antigos continuam para reproduzir suas rodadas. `consolidated.yml` reexecuta os caminhos compatíveis na combinação, com controles negativos e navegador. A suíte geral testa os sistemas suportados. Conteúdo de teste é sintético ou da própria base, sem projetos consumidores e sem inferência de modelo autenticado.

Relatórios anteriores mantêm suas revisões. O relatório consolidado informa a revisão real e não soma a mesma suíte duas vezes. Sem evidência final do commit, o estado é candidato em validação, não release pronta.

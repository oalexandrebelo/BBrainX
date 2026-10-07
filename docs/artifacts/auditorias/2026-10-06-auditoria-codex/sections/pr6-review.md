# PR #6 — revisão independente do Atlas X99

Data da revisão: 06/10/2026. Base informada e examinada: `a9636e9402e3fa673ae05b3489202da1048aef5e`. Head informado pela metadata da PR: `2c87f61c3d6355adf61e8675e2f3ee96c5cb2489`. Objeto local: clone dessa base com o patch da PR aplicado pelo agente principal em `/private/tmp/bbrainx-audit-20261006/pr6-source`. A revisão não produziu mudanças no produto, não executou código, npm, modelos ou navegação de aplicação; leu fonte, dependência instalada, logs, JSONs e capturas produzidos pelo agente principal. Verificação adicional do agente principal comparou o objeto com a árvore remota desse head: os 125 blobs rastreados coincidem, sem divergências e sem truncamento da árvore (`evidence/pr6-tree-verification.json`). Scripts untracked de auditoria ficam fora dessa comparação.

**Parecer: pedir correção de um P1 no gate dedicado de CI e do P2 de seleção por teclado antes de considerar a entrega encerrada. Não foi encontrado P0.** O desenho documental preserva a separação entre base, opt-in, candidato, laboratório e proposta. Os resultados atuais são verdes, mas o workflow pode informar sucesso quando seu teste unitário falha; e o canvas anuncia uma interação de teclado que não atualiza o inspetor. O segundo comportamento foi reproduzido no pacote estático real pelo agente principal. Os demais P2 e recomendações abaixo têm prioridade menor e condições explícitas.

## Escopo lido e evidência disponível

Todos os **15 arquivos alterados** foram lidos integralmente, incluindo código, documentação, testes e workflow. Imports relevantes, configuração Playwright, workflow geral, dependência React Flow instalada e HTML/JS gerados foram examinados nos pontos que explicam os achados.

| Arquivo alterado | Resultado da inspeção |
|---|---|
| `.github/workflows/atlas.yml` | Gate unitário mascara falha de pipeline; empacotamento local e upload de evidência, sem deploy. |
| `atlas.html` | Entrada em pt-BR; depende inteiramente de JS; nenhuma alternativa visível em falha de carregamento. |
| `docs/ATLAS_X99.md` | Distingue maturidade, populações de testes, exportação documental e publicação; ressalvas corretas. |
| `docs/POSICIONAMENTO_X99.md` | Comparação documental, sem ranking ou benchmark pareado; não homologa concorrentes nem integrações. |
| `e2e/atlas.spec.mjs` | Seis jornadas Chromium de renderização/interação; ausência de API verificada na primeira jornada. |
| `scripts/atlas-export.mjs` | Cinco visões JSON/SVG; manifesto depende dos JSON/SVG já existentes no diretório. |
| `scripts/atlas-publish.mjs` | Allowlist e rejeição de symlink; copia `index.html` antes de validar. Não publica em host externo. |
| `test/atlas.test.mjs` | Dez testes úteis de dados, relações, maturidade, filtros e escape SVG; não exercitam scripts de filesystem. |
| `vite.atlas.config.mjs` | Build separado, assets relativos, sem `public/` nem source map. |
| `vite.config.mjs` | Converte o build normal em duas entradas; compartilhamento de React/React Flow altera os chunks da página principal. |
| `web/atlas/Atlas.jsx` | Estado de seleção/URL consistente por clique/lista; canvas de teclado desconectado; padrão de tabs incompleto. |
| `web/atlas/atlas.css` | Layout desktop/mobile, foco visível, redução de movimento; sem fonte externa importada. Sem certificação de contraste. |
| `web/atlas/data.js` | 32 componentes, cinco visões e sete maturidades; base fixada; fontes externas documentais, não carregadas como runtime. |
| `web/atlas/entry.jsx` | Render React direto, sem tratamento visível de erro de inicialização. |
| `web/atlas/export.js` | Exportação determinística e texto SVG escapado; JSON leva IDs de fontes sem o catálogo que resolve esses IDs. |

Evidências preservadas pelo agente principal, examinadas nesta revisão:

| Evidência | Resultado observado | Limite da conclusão |
|---|---|---|
| `evidence/github-pr6.json`, `evidence/github-pr6.patch` | PR aberta; oito checks `SUCCESS`; `publish-evidence` `SKIPPED`. | Estado GitHub registrado na coleta, não nova consulta remota desta revisão; skipped é coerente com o job geral restrito a push em `main`. |
| `evidence/pr6-unit.log` | 10/10 aprovados; 35,77 ms reportados pelo runner. | Não testa falha do próprio gate, teclado ou scripts de empacotamento. |
| `evidence/pr6-build.log` | Build normal exit 0; 70 ms; assets de `main` e `atlas`. | Uma execução local; não é p50/p95 nem medida de carregamento em dispositivo. |
| `evidence/pr6-browser.json` | Seis testes Chromium aprovados; 3,266 s; um worker; zero unexpected/skipped/flaky, conforme resumo do agente principal. | Não é auditoria de acessibilidade, nem cobertura Safari/Firefox, nem bateria de adversários. |
| `evidence/pr6-static-build.log`, `evidence/pr6-static-package.log` | Build estático exit 0, 88 ms; pacote aceito com quatro arquivos, antes do manifesto. | Caso normal com saída construída; não valida diretório contaminado/symlink nem política de headers do futuro host. |
| `evidence/pr6-static-browser.json` | Página estática real; Enter no nó MCP mantém `node=context`; Enter no botão MCP da lista muda para `node=mcp`; zero `/api/` e zero page errors na sondagem. | Uma página Chromium local; comprova esse defeito e a alternativa de lista, não certifica toda interação de teclado. |
| `pr6-source/artifacts/atlas/atlas-target-desktop.png`, `atlas-mobile.png` | Capturas reais examinadas: composição, legenda, inspetor e evidências presentes; mobile em coluna. | Inspeção visual de capturas redimensionadas; não mediu contraste, tamanho físico, zoom de texto ou leitor de tela. |

Os números 96/43/35 exibidos no atlas são **populações anteriores** e não devem ser somados a esses 10/6. As ressalvas que os mantêm separados estão em `web/atlas/data.js:93–97`, `test/atlas.test.mjs:50–52` e `docs/ATLAS_X99.md:64–72`. Não se reexecutaram o patch X99 anterior nem seu laboratório nesta revisão.

## Achados com prioridade e solução mínima

### P1 — falha unitária pode virar sucesso no workflow dedicado

**Fonte:** `.github/workflows/atlas.yml:22–26`; contraste com a proteção explícita de pipeline no workflow geral `.github/workflows/verify.yml`. O passo executa `node --test ... | tee ...` e depois `node scripts/atlas-export.mjs`, sem `shell: bash` ou `set -o pipefail`.

**Mecanismo:** no runner Linux, um `run` sem shell especificado usa `bash -e`; declarar `bash` usa também `-o pipefail`. Sem essa opção, a pipeline informa o status do `tee`, não o do processo de teste à esquerda. Portanto, um teste que sai com código não zero pode ser seguido por exportação bem-sucedida e deixar esse passo verde. A documentação oficial descreve essa diferença entre shell implícito e explícito. [GitHub Actions — workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsshell)

**Impacto e escopo:** o gate que afirma validar dados e SVG pode aprovar artefatos inválidos em `workflow_dispatch` ou no push da branch do atlas. O workflow geral roda a suíte completa com proteção da pipeline e reduz o risco no conjunto atual da PR. Não foi examinada a configuração de checks obrigatórios de branch; não se afirma que uma falha passaria todos os gates de merge. Os 10 testes atualmente passam, portanto não há alegação de falha ocultada nesta execução.

**Correção mínima:** adicionar `shell: bash` ao passo ou `set -o pipefail` antes da pipeline. Não é necessário trocar runner, adicionar dependência ou criar uma abstração de testes.

**Critério de aceitação:** uma execução isolada com uma asserção deliberadamente falsa deve encerrar o passo/job como falha; o log TAP pode ser preservado pelo upload `if: always()`, mas a etapa de empacotamento `if: success()` não deve rodar. Restaurar a asserção e confirmar os dez testes. A prova negativa ainda não foi executada; verificar essa propriedade é diferente de repetir a suíte verde.

**Risco colateral:** o job passará a rejeitar falhas que antes podia omitir, comportamento desejado. Preservar o upload de logs em falha para não reduzir diagnóstico.

### P2 — Enter/Espaço no canvas não selecionam o componente do inspetor

**Fonte:** `web/atlas/Atlas.jsx:33–43,58–62`; dependência instalada `node_modules/@xyflow/react/dist/esm/index.mjs:2282–2311,3550–3560`. A aplicação controla `nodes[].selected` a partir de `state.selected`, mas só muda esse estado em `onNodeClick`, na lista e no percurso manual. Não fornece `onNodesChange`/equivalente que traduza seleção de teclado para o estado da aplicação.

**Mecanismo:** React Flow chama `onClick` no caminho de ponteiro; Enter/Espaço percorrem a seleção interna da biblioteca, sem chamar esse callback. Com nodes controlados, as mudanças são emitidas para um handler que não foi conectado. O nó continua focável e a instrução padrão da dependência promete seleção por teclado. O foco do usuário, o estado visual e o inspetor/URL não são um estado único.

**Reprodução real recebida:** `evidence/pr6-static-browser.json`: antes `context`; Enter no nó canvas MCP continua `context` (`canvasKeyboardSelectedMcp: false`); Enter no botão nativo da lista muda para `mcp` (`listKeyboardSelectedMcp: true`). Zero page errors; defeito funcional, não exceção JavaScript.

**Correção mínima:** conectar as mudanças de seleção de nodes ao `select(id)` existente, com política explícita para Escape/deseleção e sem autorizar exclusão/movimentação do grafo documental. Alternativa menor, caso o contrato seja seleção exclusivamente pela lista: retirar o canvas da navegação interativa de teclado e comunicar a lista como caminho de seleção; não manter controles que anunciam uma ação sem efeito. A primeira opção preserva melhor a interação já anunciada.

**Critério de aceitação:** focar um nó diferente do inicial e pressionar Enter e Espaço deve atualizar `aria-pressed` da lista, título do inspetor, destaque e `node` na URL; reload deve preservar o novo nó. Escape deve seguir a política documentada. Confirmar que seleção por clique/lista continua funcionando e não remove componentes.

**Risco colateral:** seleção interna múltipla e Escape podem produzir eventos de desmarcação; não escolher arbitrariamente o primeiro evento nem introduzir estado circular entre `onNodesChange` e render. Filtrar apenas a mudança pertinente e manter uma única fonte `state.selected`.

### P2 — semântica de tabs incompleta e instruções da biblioteca inconsistentes com a página

**Fonte:** `web/atlas/Atlas.jsx:53,55,58`; `node_modules/@xyflow/system/dist/esm/index.mjs:29–41`. Cada botão tem `role=tab` e `aria-selected`, mas todos ficam no Tab normal; não há navegação por setas, IDs de tabs nem `aria-labelledby` do painel. React Flow mantém labels/instruções padrão em inglês, incluindo instrução para excluir nó em uma visualização documental controlada.

**Mecanismo:** declarar um tablist cria expectativa de teclado diferente de uma fileira de botões. O padrão APG entra na tab ativa com Tab, usa setas entre tabs e associa painel à tab que o rotula. Isso é uma lacuna do padrão escolhido, não uma certificação automática de violação WCAG a partir de código. [W3C WAI-ARIA APG — Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)

**Correção mínima:** roving `tabIndex`, setas esquerda/direita e ligação `id`/`aria-labelledby` para as cinco tabs; ou usar botões de navegação comuns com estado pressionado, sem afirmar o padrão tabs. Configurar `ariaLabelConfig` em pt-BR e refletir as ações permitidas. Home/End são opcionais no APG; não são condição obrigatória desta revisão.

**Critério de aceitação:** um caminho completo de teclado entre visões, busca, lista e inspetor; confirmar nome acessível do painel e foco visível; verificar leitor de tela em uma jornada curta. Os seis testes existentes usam clique nos tabs e não demonstram esse comportamento.

**Risco colateral:** a ativação automática pode causar render/fit ao mover foco; para este dataset pequeno não se observou custo impeditivo, mas pode-se usar ativação manual se o foco não deve trocar visão imediatamente. Não capturar setas fora do tablist.

### P2 condicional — o empacotador escreve antes de rejeitar symlink

**Fonte:** `scripts/atlas-publish.mjs:4–9`. `copyFileSync(atlas.html,index.html)` ocorre antes de `walk()` verificar entradas com `isSymbolicLink()`.

**Condição necessária:** `dist-atlas/index.html` já existir como symlink para um arquivo fora desse diretório, ou a entrada fonte ser um symlink. A cópia segue o destino e pode sobrescrevê-lo antes de o script rejeitar o pacote. O build normal usa `emptyOutDir:true`, o que evita esse cenário usualmente. Não se executou nem se observou sobrescrita; é um defeito de ordem sob saída contaminada, não evidência de incidente ou exploração remota.

**Correção mínima:** validar diretório raiz, entrada e destinos com `lstat` antes de qualquer escrita; percorrer a árvore antes da cópia; criar/renomear o novo `index.html` sem seguir um destino preexistente. Manter a allowlist e a rejeição de symlink também antes de escrever o manifesto.

**Critério de aceitação:** fixture temporário isolado com symlink de `index.html` para sentinel externo deve falhar e preservar o sentinel byte a byte; fixture limpa deve gerar o mesmo pacote permitido. Testar o caso negativo do script, sem envolver o banco ou arquivos reais de projeto.

**Risco colateral:** ambientes que usam deliberadamente symlink de saída deixam de ser aceitos, coerente com a política já escrita. Uma alteração só para mover `walk()` depois de outra escrita não resolve a ordem; uma alteração que segue links para validá-los enfraquece o próprio limite.

### P2 de qualidade do artefato — fonte documental perde resolução no JSON exportado

**Fonte:** `web/atlas/data.js:15–35,72`; `web/atlas/export.js:1–5`; uso online em `web/atlas/Atlas.jsx:62`. O nó exportado mantém, por exemplo, `source: 'medusa'`, mas o JSON não leva `sources` nem incorpora sua URL/label. A interface resolve o ID usando um catálogo externo ao documento. Alguns nós possuem `code` fixado na base; referências/propostas sem `code` não têm equivalente resolvível no JSON isolado.

**Impacto:** o consumidor offline consegue ver propósito, limite, gate e maturidade, mas perde o link da fonte de referência. Não invalida os dados exportados nem constitui vazamento. É uma lacuna de portabilidade/proveniência para um atlas destinado a compartilhar evidência.

**Correção mínima:** exportar o subconjunto de `sources` utilizado pelos nodes, ou URL/label por node, mantendo a revisão e classificação atuais. O SVG foi explicitamente definido como desenho simplificado, não espelho integral do inspetor; não exigir que ele vire HTML embutido.

**Critério de aceitação:** todo `node.data.source` do JSON deve resolver para um registro de URL HTTPS no próprio arquivo. Arquivo determinístico para os mesmos filtros. Não usar teste de rede como prova de esquema nem introduzir chamadas remotas na exportação.

**Risco colateral:** o catálogo aumenta o JSON e exige uma pequena definição de esquema; evitar duplicar desnecessariamente o mesmo registro em muitos nodes. IDs atuais podem continuar para compatibilidade.

## URLs, maturidade e veracidade do conteúdo

`initialState()` em `web/atlas/Atlas.jsx:24–29` aceita só visões e maturidades conhecidas, limita a busca inicial a 120 caracteres e escolhe um nó visível; `change()` em `:41` ajusta seleção após filtros. `replaceState()` em `:42` torna o deep link atualizável sem acumular histórico para cada tecla. O teste de reload demonstra o caso válido. Não se promete que o botão Voltar percorra todas as seleções: o uso de replace é um comportamento explícito, não um bug por si só.

Busca faz normalização de acentos e caixa em `web/atlas/data.js:81–86`; consulta título, camada e propósito, não o catálogo inteiro de limites/gates/IDs. O placeholder “componente, técnica ou camada” é razoável para esse escopo, mas um usuário que procurar um termo existente só no gate pode receber zero resultados. Expandir o corpus só se houver necessidade de produto; não é correção necessária para esta PR.

Links de código usam HTTPS e fixam `a963…`, enquanto fontes externas de branch/documentação podem evoluir. Isso está explicado em `docs/POSICIONAMENTO_X99.md:61`. O teste `test/atlas.test.mjs:11–13` comprova formato, existência do ID local e presença da revisão, **não** que a página remota responda ou que sustente todas as afirmações. Não foi realizado healthcheck dessas URLs nesta revisão. Links de repositório privado podem exigir login; essa limitação é documentada e não foi confundida com página inexistente.

Fontes de laboratório/candidato não substituem o recibo da execução específica. Os cards 43/35 têm escopo e ausência de integração descritos, mas não incluem URL direta de seu relatório (`web/atlas/data.js:93–97`). A melhoria útil é anexar o recibo durável do patch/laboratório, quando disponível e autorizado, com SHA e população; não inventar um link público nem apresentar o upstream como prova de teste local.

O nó `ui` marcado shipped chama-se “Atlas / laboratório UI” e aponta `web/main.jsx` na base: o laboratório UI existe na base; **este atlas novo** não existe nela. A ressalva desse nó explica que o atlas novo é documental. Para reduzir ambiguidade ao exportar uma visão sem contexto, o título pode distinguir “Laboratório UI da base” do “Atlas documental desta PR”. Trata-se de clareza editorial, não descoberta de capacidade runtime falsa.

O posicionamento preserva o escopo host: não acrescenta daemon, autoridade global, Laya automático, integração SuperTokens/Infisical/Medusa/SigNoz/Unkey, cache candidato ou sincronização. Não toca checkpoints, CAS, idempotência, SQLite ou políticas de autorização do engine. A visualização de uma autoridade futura não a instala. Não há base para homologar as capacidades dos concorrentes a partir desta entrega.

## Privacidade, bundle e publicação

O grafo de imports novo parte de `web/atlas/entry.jsx` para React, React Flow, dataset e exportadores client-side. Não foi observado import de `src/`, store, credenciais, Laya, memória de projeto ou módulo Node no cliente. O dataset leva caminhos de código e links documentais fixos. React escapa a busca; o SVG escapa texto e não usa `foreignObject`, scripts ou recursos remotos. As posições e cores interpoladas são dados internos fixos, não entrada livre recebida da URL; não se alega uma injeção explorável a partir de busca.

A implementação não realiza fetch da API do produto nem polling. A primeira jornada e a sondagem estática não observaram `/api/`; os listeners não cobrem todas as jornadas nem afirmam ausência de toda requisição externa possível. Links externos são abertos só por ação do usuário e recebem `rel=noreferrer`. Não há cookie, analytics, armazenamento local ou leitura de arquivo de projeto no caminho examinado.

O estado `q` é gravado na URL e incluído no JSON exportado. Isso faz parte do recurso de deep link/exportação; no pacote estático não representa envio a um backend BBrainX. O compartilhamento do link/arquivo compartilha a consulta. Se o produto vier a coletar URLs de navegação, a política deverá tratar esse campo; esta PR não instala tal coleta.

`vite.atlas.config.mjs` usa `publicDir:false`, `sourcemap:false`, `base:'./'` e entrada exclusiva. O pacote estático real foi construído e servido pelo agente principal sem chamadas API na sondagem. Já `vite.config.mjs` constrói também a UI principal e conserva seu diretório público; **não** usar o `dist` normal como sinônimo de pacote documental isolado. Os comandos e diretórios estão separados nos docs.

`atlas-publish.mjs` valida nomes/extensões, tamanho e hashes. Os campos `containsBackend:false` e `containsProjectMemory:false` são declarados no manifesto, não resultados de análise de conteúdo. A pureza do pacote atual também depende do grafo de imports e da configuração de build examinados; uma allowlist de `.js` não impediria que uma futura importação trouxesse informação indevida para dentro de um arquivo permitido. Não foi observado vazamento no pacote atual. Para manter a afirmação, review de imports e inspeção do bundle pertinente têm mais valor que confiar só no log “sem backend”.

O script chamado publish prepara `index.html`/manifesto local; não envia a Vercel, VPS ou outro host. A PR e os workflows não equivalem a publicação pública ou mudança de visibilidade GitHub. Nenhum deploy foi realizado por este revisor. Headers/CSP/Cache-Control do futuro host estático continuam dependentes desse host; a configuração do servidor local do produto não é transportada por arquivos estáticos.

## Custo e regressão de build

Com 32 componentes fixos e no máximo 16 visíveis, os filtros e buscas são varreduras pequenas, a criação de arestas fica limitada ao dataset e a lista oferece alternativa ao grafo minúsculo em mobile. `memo(AtlasNode)`, `nodeTypes` estável, `useMemo` e `nodeClick` estável já evitam trabalho redundante comum. Não há motivo evidenciado para virtualização, web worker, cache complexo ou nova dependência nessa PR. O refit ocorre ao mudar visão/filtro/busca; não foi medido seu tempo de interação.

| Build observado | JavaScript necessário da página | CSS necessário da página | Observação |
|---|---:|---:|---|
| Base, UI principal | 452,34 kB; gzip 144,64 kB | 31,08 kB; gzip 6,49 kB | `evidence/build-main.log`. |
| PR, UI principal | 398,79 + 53,99 = **452,78 kB**; gzip 144,96 kB | 15,41 + 15,67 = **31,08 kB**; gzip 6,75 kB | Shared vendor + entrada main; o browser não precisa buscar a entrada atlas. |
| PR, atlas no build normal | 398,79 + 34,72 = **433,51 kB**; gzip 138,75 kB | 15,41 + 16,38 = **31,79 kB**; gzip 6,51 kB | Entry de 34,72 kB não é o custo total do atlas. |
| PR, atlas estático separado | **433,18 kB**; gzip 138,28 kB | **31,79 kB**; gzip 6,22 kB | `evidence/pr6-static-build.log`; JS usa React/React Flow já existentes. |

O total de JS único distribuído no build normal passa de 452,34 para 487,50 kB, aproximadamente +35,16 kB, por incluir a entrada adicional. O custo normal de transferência da UI principal fica próximo da base (+0,44 kB de JS, ~0,1%), mas há arquivo/chunk adicional compartilhado, alteração de hashes e possibilidade de novo miss de cache. Não se comprovou regressão perceptível nem melhoria de loading. Build de 116 ms na base versus 70 ms/88 ms na PR são execuções únicas em ambiente local, não benchmark pareado; não concluir ganho de desempenho.

Aviso `"use client"` do React Flow aparece tanto na base quanto na PR. O `@import url('')` do CSS da UI principal também precede esta PR; não é efeito de uma importação de fonte externa do atlas. O pacote estático só apresenta o aviso da diretiva. Os builds saíram com código zero; avisos não foram renomeados como falhas nem ignorados como garantia de compatibilidade futura.

## Cobertura UI, fallback e pontos não bloqueantes

As seis jornadas demonstram contagem/renderização de nodes, alternância das cinco visões, lista, filtros, zero-resultados, deep link/reload, downloads e ausência de overflow horizontal em viewport 390 px. Downloads são reais; a asserção de SVG é superficial (`<svg`), enquanto o unitário cobre escape de texto. Não há prova de teclado canvas/tabs, foco após filtros, leitor de tela, contraste, 200%/400% de zoom, Safari/Firefox, latência de fit, toque real ou ausência de API em cada jornada. A sondagem independente já encontrou o defeito de teclado que a cobertura por clique deixou passar.

As capturas mostram um mapa ajustado a quatro colunas em mobile, com nós pequenos; a lista nativa e o inspetor em coluna mantêm um caminho de consulta. Isso é uma escolha com alternativa disponível, não prova de legibilidade plena. O CSS inclui foco visível e `prefers-reduced-motion`; nenhum teste de preferência de movimento foi executado. Não chamar o resultado de “certificado acessível”.

**Fallback client-side:** `atlas.html:1` contém só raiz vazia e módulo; `web/atlas/entry.jsx:4` faz render direto. Sem JS, erro de carregamento de asset ou exceção antes do mount, a página fica sem mensagem útil. Não há promessa de operação sem JS nos docs, portanto é recomendação de resiliência P2, não bloqueio de segurança nem regressão comprovada. Solução mínima, se o atlas será publicado: mensagem HTML/noscript com finalidade documental e alternativa, e estado de erro visível para falha de render; não adicionar backend ou CDN de contingência. Testar com JS desabilitado e um asset interrompido. Um error boundary React sozinho não captura falha de download do módulo inicial.

**Manifesto de exportação:** `scripts/atlas-export.mjs:8` inclui qualquer `.json`/`.svg` já presente em `artifacts/atlas`, além dos dez arquivos de visão. Depois de downloads/testes, uma reexecução pode incluir `download-laya.json`, `browser-report.json` ou artefatos antigos. Isso não falsifica hash dos bytes lidos, mas torna a população do manifesto dependente de resíduos. Se o contrato é manifesto das cinco visões, enumerar esses dez nomes explicitamente; manter reports separados. Teste mínimo: um arquivo residual não entra no manifesto de arquitetura. Se o contrato for manifesto de todos os artefatos atuais, documentar isso e regenerá-lo após a geração final — o workflow atual o escreve antes do browser.

**Manutenção do gate:** o workflow dedicado só dispara na branch `docs/x99-architecture-atlas` e manualmente (`atlas.yml:2–5`). A suíte geral cobre unitários/browser da PR, mas o build estático/allowlist/exportação dedicados não passam automaticamente a todo futuro PR sobre atlas após merge. Vincular essas checagens a mudanças pertinentes ou incorporá-las à CI geral se forem contrato permanente; sem necessidade de executar o atlas inteiro em toda mudança de backend. Não se conhecem as regras de proteção da branch para declarar check obrigatório ausente.

## Critério prático de fechamento da review

1. Corrigir pipeline e provar que falha unitária torna o job dedicado vermelho, preservando logs.
2. Unificar seleção por teclado/click/lista, provar Enter/Espaço/inspetor/URL no artefato estático e manter a suíte verde.
3. Resolver o padrão escolhido para tabs e labels de teclado, com uma jornada de teclado; registrar os outros P2 como correções pequenas ou limitações explícitas conforme o destino de publicação.
4. Preservar separação de `dist`/`dist-atlas`, revisão auditada, maturidade, populações de evidência e integrações opt-in. Aprovação desta review não promoveria cache/worker/daemon nem homologaria uso público.

Não há `results_pending` para os testes positivos locais descritos: logs e a sondagem estática foram recebidos. Continuam **não executadas** a prova negativa de CI, fixtures adversárias do empacotador e auditoria de acessibilidade abrangente. O revisor não alterou a PR, não abriu comentários remotos, não publicou o atlas e não mudou dados/configuração de runtime.

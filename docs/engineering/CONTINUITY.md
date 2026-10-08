# Ponto de retomada da engenharia

Estado entregue EV-12: implementação `e36e712`, correção visual `abbdd0d` e correções de portabilidade `4a9e453`/`a22954f` e runtime instalado `a21f42ccab511da82906d0a9034389c8478a8d3c`. Operação atual e pendências: [MAC_MINI.md](../integrations/MAC_MINI.md). A revisão de portabilidade passou 402/402 testes no Node 24 e no Node mínimo 22.20, além do build. A entrega anterior passou 18/18 testes de navegador e quinze controles negativos em cópia isolada; conferir a CI da ponta da [PR #15](https://github.com/oalexandrebelo/BBrainX/pull/15) para aprovação da árvore final em cada ambiente. O MCP global Antigravity foi retirado; OmniRoute aguarda URL/modelo. A publicação comercial permanece pendente dos critérios próprios.


Este é o contexto operacional para quem assume o BBrainX. Leia com `AGENTS.md`, execute `npm run project:status` e confira a revisão remota antes de trabalhar. O [handoff de outubro](../HANDOFF.md) conserva o histórico; não define sozinho a prioridade atual.

Quem for otimizar começa pelo [norte de otimização](OPTIMIZATION_NORTH.md), que transforma a fila em experimentos delimitados, com invariantes e critérios de decisão.

## Estado conhecido e identidade

- Baseline histórica validada: `7329ece31adb5b23aa50ba42bde9cf7553b764bd`, [PR #14](https://github.com/oalexandrebelo/BBrainX/pull/14), [run 37703988565](https://github.com/oalexandrebelo/BBrainX/actions/runs/37703988565): 310 testes por ambiente, 15 E2E, 15 controles negativos e 3 testes de distribuição; laboratórios separados 34/35. O merge de teste `bcc138da46248852240ac00555ebdce406743da4` tinha árvore idêntica àquela baseline. Esses checks não aprovam automaticamente os commits posteriores.
- EV-12 começou em 08/10/2026 sobre `3bb09b0ea68763cc5dd708446ed9d8a4fab5b3bb`, branch `feat/continuous-evolution-2026-10-07`, checkout `release-audit`. Foi entregue na branch `feat/project-control-plane-2026-10-08`, commits `e36e712` e `abbdd0d`; a evidência local está nos documentos ligados acima. Antes de retomar, conferir HEAD/diff, ponta remota e evidência da revisão que efetivamente será integrada.
- Base histórica da PR #14: `38904c38f1d27b84afaeb56fed702d233ad4e25f`, [PR #13](https://github.com/oalexandrebelo/BBrainX/pull/13), sobre a [consolidação #12](https://github.com/oalexandrebelo/BBrainX/pull/12). As PRs #6–#11 já são ancestrais de #12. Verificar se foram incorporadas antes de abrir outra branch; não reaplicar ZIPs antigos nem ramificar automaticamente da base histórica.
- Evidência histórica da PR #13: [run 37675622182](https://github.com/oalexandrebelo/BBrainX/actions/runs/37675622182), 289 testes distintos em cada SO e no Node mínimo. Isso descreve aquela revisão, não a evolução seguinte.
- Versão declarada: 0.4.0 developer preview; Node mínimo 22.20, Node 24 recomendado. A tag publicada anteriormente não representa automaticamente os novos commits.
- Repositório consultado em 07/10/2026: **público**. O registro histórico de que era privado está desatualizado. Consultar o GitHub antes de qualquer decisão de publicação ou de compartilhar informação confidencial.
- Registre o estado de trabalho com `npm run project:status`. O comando informa HEAD, branch, alterações, lockfile e se o relatório local corresponde à revisão limpa. Não consulta o remoto e não autentica o relatório: CI e revisão humana continuam necessárias para promover uma versão.

## Evolução entregue nesta rodada

Na baseline funcional acima: ownership MCP contra IDs em voo duplicados; replay de checkpoint sem Git e writer transaction redundantes; distribuição pelos blobs Git com manifesto v2 e ZIP verificável; SBOMs separados; status/contexto/roadmap versionados. A justificativa e os custos de desempenho estão no [livro de experimentos](PERFORMANCE.md). Consulte os checks da PR/revisão atual antes de integrar; os resultados da baseline não certificam commits posteriores.

Próxima ação: conferir a CI da ponta remota, revisar a entrega EV-12 e tratar as lacunas nativas documentadas. A prioridade de otimização permanece EV-05 (corpus fixado e tarefas aceitas), EV-06 (trabalho síncrono limitado) e EV-07 (restauração do conjunto de bancos). EV-11 documenta a reprodução de saída MCP acumulada com consumidor lento. Não apresentar esses itens como concluídos.

## EV-12 — integração e controle por projeto

[Escopo](../integrations/SCOPE.md), [instalador](../integrations/INSTALLER.md), [importação](../integrations/CONTEXT_IMPORT.md) e [runner opt-in](../integrations/TEST_RUNS.md) definem os contratos. Implementação local: registro sem roots sobrepostas, binding canonical de cwd/projeto/lane, overview de bancos existentes, plano/aplicação/rollback conservadores, observação MCP e receipts de editores, painel por projeto, orçamento advisory e histórico de testes. Bin principal e entrypoint legado de lanes anunciam a marca própria e instrumentam o ciclo de conexão.

Importadores históricos validados: Claude/Cursor e JSONL nativo do Codex, com descoberta all por padrão. Não significa importação universal de todos os clientes MCP. Cursor sem cwd falha fechado, salvo confirmação explícita marcada como não verificada pela fonte; roots registradas com encoding coincidente recusam. Codex recusa subagents e não segue history_base. Artefatos originais/manifests privados podem conter dados sensíveis e não são contexto aprovado.

Limites que o próximo colaborador deve preservar: overview de 16 lanes ativas/32 linhas e 20 tarefas por workspace; checkpoints de até 16 KiB; observação cooperativa de até 256 sessões por projeto, lease 90 segundos; janela ativa de 128 execuções com arquivo terminal recuperável e até 50 resultados no painel. Arquivos arquivados não têm quota global de disco. Runner Node é ação explícita, sem shell/chaves herdadas, mas executa código local com a autoridade do usuário. Orçamento não bloqueia o provedor e gastos não observados continuam desconhecidos. Antigravity IDE não recebe configuração automática/global; presença do app não prova conexão nativa.

Evidência focada observada nesta árvore, Node 24.21.0: `test/context-import.test.mjs` 22/22; importer+workspace 40/40 antes da fatia final de control; `test/control.test.mjs` 11/11 após correção e novo teste real do entrypoint legado; conjunto final `test/control.test.mjs test/control-cli.test.mjs test/workspace.test.mjs test/lanes-mcp.test.mjs` 41/41. A reprodução vermelha demonstrou que `integrate --lane` criava estado ao mostrar um plano; agora consulta registry readOnly e só abre LaneStore depois de --apply. Teste real confirma que openWorkspaces exclui receipt de outro projeto e mantém lanes do mesmo projeto. Esses resultados não substituem `npm test`, build, E2E e CI da revisão entregue; a consolidação mantém responsabilidade por esses gates e pela implantação. Não atribuir resultado de outro commit a esta árvore.

Retomada concreta: conferir revisão instalada e CI remota, estabilizar o escopo nativo Antigravity e validar Kilo/OmniRoute quando houver URL e modelo/combo. Rollback de configuração usa recibos/fingerprints; não restaura bancos. Backup do núcleo ainda não inclui automaticamente usage, registry, lanes, control-v1, imports-v1 ou backups do instalador. EV-07 continua necessária antes de prometer recuperação do conjunto.

## O que sustentar

| Área | Invariante | Onde conferir |
| --- | --- | --- |
| Autoridade | O host concede projeto; texto recuperado/argumentos não ampliam grants. | `src/engine.mjs`, `src/source-root.mjs`, `docs/SECURITY_MODEL.md` |
| Estado | CAS, fingerprint, histórico e evento do checkpoint permanecem coerentes; replay devolve resposta histórica. | `src/store.mjs`, `src/session.mjs` |
| Contexto | Obrigações aprovadas cabem integralmente ou a operação recusa; payload BPE não equivale à fatura do provedor. | `src/context.mjs`, `docs/core-contracts/REVIEW.md` |
| Lanes | Índice/checkpoint por workspace; memória aprovada vem da autoridade compartilhada. | `src/lanes/`, `docs/lanes/ARCHITECTURE.md` |
| Observatory | Recibos, estimativas e valores desconhecidos mantêm semânticas distintas. | `src/usage/`, `docs/observatory/README.md` |
| Escopo | Indexar/compilar contexto não executa código do projeto; testes executam somente por ação explícita do host, fora de sandbox do SO. | `AGENTS.md`, `docs/integrations/TEST_RUNS.md`, `THIRD_PARTY_NOTICES.md` |
| EV-12 | Plano é somente leitura; aplicação usa backup/CAS; reports e openWorkspaces do painel mantêm o projeto; importação não aprova contexto. | `src/control-cli.mjs`, `src/control.mjs`, `src/integrations.mjs`, `src/context-import.mjs` |

## Ciclo por contribuição

1. **Retomar:** conferir HEAD, diff, CI e [fila priorizada](ROADMAP.md). Ler apenas os módulos e decisões relevantes; recuperar o restante sob demanda. Não carregar todos os estudos em cada sessão.
2. **Delimitar:** escolher um item, declarar arquivos sob responsabilidade do colaborador, invariante, hipótese e critério de aceite. Em trabalho paralelo, coordenar arquivos compartilhados e usar clones/worktrees para mutações.
3. **Pesquisar:** registrar a pergunta específica, fonte primária, data, conclusão aplicável e condições em que ela não vale. Um link ou nome de framework não prova necessidade de integração.
4. **Demonstrar:** preservar reprodução antes da correção. Para desempenho, comparar o mesmo corpus/configuração, alternar baseline/candidato, guardar amostras e efeitos determinísticos. Rejeitar complexidade cujo ganho não supera o ruído.
5. **Verificar:** testes relevantes, `npm test`, `npm run build`; E2E para UI. Schema exige migração/rollback. Executar controles negativos apenas em checkout descartável. Não reduzir um gate para acomodar uma mudança.
6. **Revisar e entregar:** outro colaborador revisa contratos e evidência; commit pequeno, PR com revisão-base e limitações, CI da árvore entregue. Atualizar o item, a decisão alterada e o próximo ponto de retomada.

Ao interromper, deixar na PR ou no checkpoint: revisão/branch, item, resultado observado, arquivos alterados, testes executados e não executados, falha conhecida, próxima ação concreta e condições para rollback. Não declarar concluído com teste pendente. Relatório de agente é hipótese até conferir os artefatos relevantes.

## Divisão de trabalho

O mantenedor decide prioridade de produto, licença, versão/release e critérios de aceite. Colaboradores de domínio implementam fatias; um revisor distinto contesta integridade, custo e evidência. Agentes menores ficam com pesquisas delimitadas, inventários e execução reprodutível; decisões que atravessam domínios recebem revisão central. Uma pessoa ou modelo pode desempenhar papéis diferentes, mas não se deve confundir execução com revisão independente.

## Armadilhas que não devem ser repetidas

- A busca sobre o próprio repositório muda quando o corpus muda. Não mover funções ou excluir documentos só para recuperar um score. Registrar a regressão e avaliar um corpus fixado independente antes de alterar ranking.
- X99 worker/cache e laboratórios de WitnessCache/protocolo não são funcionalidades integradas. Preservar os limites em `docs/research/INTEGRATION.md`.
- Redução de leituras, tokens de payload e tempo de microbenchmark são métricas diferentes de tarefas aceitas, cobrança e receita.
- `main` pode receber um commit automático de evidências depois da CI. Conferir o remoto antes de derivar uma branch; a revisão testada e a árvore distribuída precisam de vínculo explícito.
- Não copiar banco SQLite em uso com `cp`. Usar o mecanismo de backup aplicável e ensaiar a restauração em diretório isolado. O backup do núcleo não inclui automaticamente os bancos separados de usage/lanes nem os arquivos privados de control/imports/integrações.

Decisão de continuidade: [ADR-0001](../decisions/0001-evidence-and-continuity.md). Preparação de produto e comercialização: [critérios](COMMERCIAL_READINESS.md). A rotina é acionada em cada contribuição; não depende de uma conversa, serviço pago ou agente permanentemente ativo.

Operação entre clientes no Mac mini: [guia de harnesses](../MAC_MINI_HARNESSES.md). Os geradores incluem Antigravity IDE e Kilo Code atual. Configuração, handshake, conexão nativa e tarefa com LLM têm critérios separados; uma instalação local não promove os itens EV-05/06/07 nem certifica todos os clientes.

## Verificação EV-12 inicial — 08/10/2026

A árvore da entrega passou 397/397 testes no Node 24.21.0, build e 18/18 testes de navegador (9 Workbench/Atlas, 6 Observatory, 3 painel). A suíte completa também passou 397/397 no Node mínimo 22.20.0, sem silenciar warnings; os controles independentes e a instalação são descritos separadamente. Manifesto de arquivos e limites: [verification-2026-10-08.json](../integrations/verification-2026-10-08.json).

Próximo colaborador: verificar a revisão instalada e o último recibo operacional antes de alterar configs; fechar a prova nativa de escopo do Antigravity por workspace, mantendo falha fechada; ampliar importadores somente com fixtures de formatos oficiais e provas de isolamento. Depois retomar EV-05/06/07 com corpus congelado. Nunca confundir cache de contexto BBrainX com cache KV ou cobrança do provedor.

## Correção de portabilidade — 4a9e453

A primeira CI da PR #15 passou nos demais jobs e falhou em oito casos Windows. A causa relevante era a comparação de caminhos 8.3 com caminhos longos: isso podia ocultar uma lane no painel, recusar uma configuração válida e perder a recusa de escopo de um projeto filho legado. Registro e comparações agora usam identidade nativa do SO; linhas legadas permanecem intactas e `verifyRoot` continua recusando redirecionamentos. Cursor reconhece os encodings de drive/separadores observados no Codex, sem conceder ownership pelo nome da pasta. Fixtures de executáveis respeitam PATHEXT e bancos de lanes fecham antes da limpeza.

[Evidência da correção](../integrations/portability-2026-10-08.json): 402 testes em cada Node suportado, zero falhas/skips, build e provas reais repetidas no Mac mini. O registro verifica O(P) raízes de projetos com I/O de canonicalização fora do caminho de busca; não foi alegado ganho de velocidade. Próximo gate: conferir a execução remota da ponta da PR #15, incluindo Windows; a execução inicial falha não constitui aprovação. Preservar os testes de aliases, sobreposição e recibos redirecionados ao ampliar o catálogo.

A segunda CI isolou uma falha restante em `up`, corrigida em `a22954f`: lookup de ID também canonicaliza registros legados, e o registro continua validando a raiz antes da indexação. A extensão `0.1.1` (`a21f42c`) remove o fundo do SVG para a máscara monocromática da Activity Bar; o BX foi confirmado visualmente no VS Code. Essa revisão está instalada e as provas MCP/nativas foram repetidas. O teste de redirecionamento de raiz do runner passou a usar junction no Windows; encerramento de descendentes via process group permanece específico de POSIX. Conferir a CI da ponta da PR #15 antes de promover.

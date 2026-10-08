# Norte para as próximas otimizações

## Objetivo e autoridade

Otimizar o BBrainX para concluir e retomar trabalho verificável com menor custo total de execução e manutenção, preservando autoridade do host, integridade do estado e qualidade do contexto. Latência, RSS, CPU, I/O e tokens são custos a medir; a métrica de produto é trabalho aceito sob critérios definidos antes da execução. Uma redução de payload ou um microbenchmark isolado não prova esse resultado.

Este documento define a direção e como começar. [ROADMAP.md](ROADMAP.md) mantém prioridade, estado e aceite dos itens; [PERFORMANCE.md](PERFORMANCE.md) mantém os experimentos, custos e alternativas rejeitadas. [CONTINUITY.md](CONTINUITY.md) é a entrada operacional. Ao mudar a direção, atualizar esses vínculos no mesmo commit; não criar outra fila concorrente nem depender de relatórios que existam somente na máquina do autor.

## Ponto de partida verificável

Baseline funcional deste guia: `7329ece31adb5b23aa50ba42bde9cf7553b764bd`, [PR #14](https://github.com/oalexandrebelo/BBrainX/pull/14). A [CI 37703988565](https://github.com/oalexandrebelo/BBrainX/actions/runs/37703988565) testou `bcc138da46248852240ac00555ebdce406743da4`, cuja árvore é idêntica à dessa baseline: 310 testes distintos repetidos em Linux/macOS/Windows e Node mínimo 22.20; 15 E2E, 15 controles negativos e 3 testes Python aprovados. Laboratórios separados: 34 e 35 testes. Esses resultados não aprovam automaticamente o próximo commit.

O replay otimizado já remove Git e writer transaction redundantes no banco principal. As amostras completas e hashes estão versionados em `docs/artifacts/engineering-2026-10-07/`. Gravações novas pagam um SELECT extra; lanes ainda travam o registry. Não redescobrir esse ganho nem apresentá-lo como aceleração de todos os checkpoints. O manifesto de fontes é v2 e a versão do produto continua 0.4.0 developer preview.

A EV-12 de 08/10/2026 parte de `3bb09b0ea68763cc5dd708446ed9d8a4fab5b3bb` e acrescenta integração/controle por projeto; conferir o estado corrente em [CONTINUITY.md](CONTINUITY.md). São mudanças funcionais e evidência focada local, não um ganho de performance ou aprovação pelos números históricos acima. [SCOPE.md](../integrations/SCOPE.md) delimita a fatia; gates completos e verificação de clientes reais pertencem à revisão consolidada.

Antes de editar, no checkout escolhido:

```sh
git status --short
git rev-parse HEAD
npm run project:status
```

Conferir também a ponta e os checks remotos da PR. Não trocar de branch, limpar ou sobrescrever alterações de outro colaborador. A pilha conhecida é #12 → #13 → #14; #6–#11 já são ancestrais de #12. Revalidar essa relação antes de integrar, pois ela pode mudar.

## Primeira entrega recomendada: EV-05

**Construir uma baseline de avaliação fixada, antes de modificar a busca.** É uma fatia executável sem API paga ou dados privados; a validação com usuários vem depois.

1. Ler `docs/EVALUATION.md`, `scripts/benchmark.mjs`, `scripts/eval-retrieval.mjs` e `src/evaluation.mjs`. O benchmark existente gera 60 arquivos sintéticos e verifica marcadores; é um instrumento inicial, não uma avaliação de tarefas completas.
2. Criar uma fixture sintética pequena, versionada por commit/hash, com perguntas, evidências esperadas e tarefas de aceite determinístico. Separar calibração e holdout antes de escolher parâmetros. Resultados de holdout não voltam para a calibração sem declarar um novo experimento.
3. Registrar corpus, filtros, snapshot, queries, budgets, perfil de memória e configuração. Fixar a distribuição de casos: acerto, ausência de evidência, arquivo alterado, memória revogada e obrigação que não cabe no budget. Definir sucesso e efeito mínimo relevante antes de medir; não escolher um percentual depois de ver o resultado.
4. Coletar somente a baseline inicial: acerto/recusa correta, contexto entregue, tempo total, p50/p95, dispersão, CPU/RSS e operações de I/O pertinentes. Medir caminhos frios e aquecidos separadamente. Não introduzir uma otimização no mesmo commit que redefine o instrumento de avaliação.
5. Entregar fixture, executor reproduzível, amostras, hashes, limites e revisão independente. O holdout deve detectar uma degradação deliberada sem ajustar gold, filtros ou thresholds para esconder a falha. Marcar EV-05 como parcial enquanto faltarem tarefas representativas aceitas e custo completo do uso real.

Ponto inicial já executável: `node scripts/benchmark.mjs`; escreve `artifacts/benchmark.json` e limpa a fixture temporária. Para EV-05, preservar a identidade do novo corpus e das amostras em arquivos versionados; não depender somente desse diretório ignorado. Os casos `eval-self` e `eval-natural` continuam gates de regressão do repositório atual, cuja documentação também altera o corpus.

## Próximas frentes com escopo delimitado

| Frente | Onde começar | Primeiro experimento / condição de saída |
| --- | --- | --- |
| EV-06 — custo síncrono e cancelamento | `src/retrieval.mjs` (`indexProject`, `refreshFiles`), `src/context.mjs`, `test/retrieval-safety.test.mjs`, `test/turbo.test.mjs` | Medir event-loop delay, CPU/RSS e latência com tamanho/número de arquivos e linhas limítrofes controlados. Comparar implementação atual, fatiamento e worker somente depois de localizar o custo. Demonstrar cancelamento sem publicação parcial, perda de obrigações ou evasão de quotas. |
| EV-07 — recuperação do conjunto | `src/store.mjs` (`backup`), `src/usage/store.mjs`, `src/lanes/registry.mjs`, `src/lanes/store.mjs`, `test/retention.test.mjs` | Inventariar bancos e relações, ensaiar backup/restore em diretório isolado, checar permissões, versões, integridade e falha parcial; medir RPO/RTO sob carga definida. O backup atual do núcleo não inclui automaticamente usage, registry e lanes; snapshots individuais não formam uma transação entre bancos. |
| EV-11 — saída MCP sob consumidor lento | `src/mcp.mjs` (`serveMcpStdio`), `test/mcp-wire.test.mjs`, `test/mcp-ownership.test.mjs` | Reproduzir com streams reais, high-water mark pequeno e consumidor lento/parado. A observação anterior acumulou 743.360 bytes com limite de 65.536. Medir bytes enfileirados e chamadas pendentes; limitar ambos, preservando framing, correlação por ID, cancelamento, EOF e EPIPE. Pausar apenas novas entradas não limita respostas das chamadas já iniciadas. Não impor serialização global que bloqueie cancelamento. |
| EV-08/09 — consistência e integrações opcionais | `src/lanes/`, `src/context.mjs`, `src/laya.mjs`, `docs/research/INTEGRATION.md` | Definir o ponto de linearização e as invalidações antes de cache/worker/modelo. Laya exige filas/frames limitados, deadline total e isolamento de respostas tardias; benefício de tarefa e inferência real precedem ativação no núcleo. |
| EV-12 — integração e controle por projeto | `src/workspace.mjs`, `src/integrations.mjs`, `src/control.mjs`, `src/context-import.mjs`, `src/test-runner.mjs` | Validar isolamento e comportamento dos limites com fixtures, CLI/MCP e painel reais. Medir overhead de heartbeat/descoberta/retorno do painel antes de otimizar; não chamar presença de configuração de conexão, histórico de pasta aberta ou orçamento advisory de controle de gastos. |

EV-06 e EV-11 podem avançar em paralelo a EV-05 com ownership de arquivos separado. EV-07 antecede promessas de recuperação. Prioridade e mudanças de estado continuam na fila; essa tabela não declara nenhuma dessas correções implementada.

## Invariantes que nenhuma aceleração pode negociar

- Grants vêm do host; texto recuperado e argumentos de ferramenta não ampliam projeto, lane ou permissões.
- Checkpoint mantém fingerprint, CAS, resposta histórica e efeito único. Preservar a checagem transacional depois de um miss; não colocar processo Git lento dentro da trava de escrita para facilitar o fast path.
- Índice, contexto e memória aprovada mantêm os contratos de snapshot, revogação, leitura segura e obrigação integral ou recusa. Não servir contexto inválido como fallback de desempenho.
- Cancelamento, limites e backpressure precisam de contratos explícitos sob saturação; apenas configurar um timeout não interrompe trabalho síncrono.
- Não copiar SQLite ativo com `cp`, expor dados privados no corpus ou executar código durante indexação/recuperação. Runner de testes exige ação explícita do host e não é sandbox; modelos e integrações continuam opt-in.
- Plano de integração não cria estado da lane; aplicação e rollback conservam fingerprints/recibos. Descoberta histórica não concede root, importação não aprova memória e relatórios do painel não misturam projetos.
- Preservar as distinções de custo unknown/reported/estimated e as coberturas locais. Testes arquivados são recuperáveis, não quota global de disco; controle de orçamento advisory não governa chamadas externas.
- Não remover testes, documentos, arquivos do índice, casos difíceis ou recusas legítimas para aumentar um score. Qualquer mudança de política de indexação exige justificativa própria e avaliação independente.

## Quando aceitar ou rejeitar uma otimização

Aceitar somente com paridade/correção demonstrada e benefício no workload declarado. Fixar baseline, candidato, corpus e configuração; alternar pares, registrar warmup, amostras e variabilidade. Separar instrumento sintético, cliente real e cobrança observada. Comparações de bytes precisam identificar encoding; comparações de tempo precisam identificar ambiente e instrumentação.

Relatar o caminho beneficiado **e** quem paga o custo: misses, primeira gravação, invalidação, inicialização, retenção, nova dependência e complexidade operacional. Para mistura de replay e escrita, medir a proporção real; não extrapolar a mediana de um único caminho. Identificar complexidade temporal/espacial e alocações no hot path; só justificar micro-otimização quando o perfil apontar esse custo.

Rejeitar cache, worker, LLM, abstração ou dependência cujo ganho não supere o ruído ou cujo custo de coerência/manutenção não esteja demonstrado. Registrar o resultado negativo no livro de experimentos. Gates de CI devem privilegiar paridade e limites determinísticos; runner compartilhado não justifica thresholds frágeis de microssegundos.

## Verificação e passagem para o próximo colaborador

Testes focados existentes, conforme a frente:

```sh
node --test test/turbo.test.mjs test/retrieval-safety.test.mjs
node --test test/mcp-wire.test.mjs test/mcp-ownership.test.mjs
node --test test/retention.test.mjs test/usage-store.test.mjs test/lanes-host.test.mjs
```

Depois da fatia, `npm test` e `npm run build`; verificar Node mínimo 22.20 e Node 24. UI exige E2E; distribuição exige `python3 test/archive_test.py`. Controles negativos que alteram código rodam em checkout descartável limpo. Novo schema exige migração e rollback. Não repetir suítes sem mudança ou hipótese que justifique a repetição.

O commit/PR deve deixar: item e revisão-base; hipótese e workload; arquivos sob responsabilidade; comando e identidade das entradas; resultados, amostras e limites; alternativas descartadas; regressão observada ou custo introduzido; rollback; próxima ação concreta. Revisão independente verifica contratos e evidência, não apenas a contagem de testes. Atualizar a fila e o livro no mesmo conjunto de commits; tornar o ponto de retomada legível sem o chat.

Para dados que sustentam uma alegação histórica, versionar amostras compactadas sem perda e hashes, ou outro armazenamento durável explicitamente referenciado. Não apresentar arquivos locais não commitados ou artifacts temporários como conhecimento disponível para todo colaborador. O coletor em main conserva resumos, mas não todas as amostras brutas.

## Critério de valor para comercialização

Antes de promover números ao material comercial, demonstrar instalação/retomada por terceiro, tarefas aceitas com baseline comparável, recuperação ensaiada e custo de suporte/operação. Manter direitos e notices rastreáveis. [COMMERCIAL_READINESS.md](COMMERCIAL_READINESS.md) detalha os gates; EV-10 depende dessas evidências. A direção é construir vantagem verificável e transferível; benchmark isolado, número de agentes e volume de código não estimam valor de venda.

## Operação EV-12 confirmada em 08/10/2026

Runtime `4a9e453` instalado com isolamento de quatro projetos e 12 recusas cruzadas; documentação operacional em [MAC_MINI.md](../integrations/MAC_MINI.md). A correção de portabilidade preserva raízes legadas e compara identidade nativa, com testes de aliases Windows e recusa de escopo. Antes de ampliar automação, provar a identidade do workspace em chamadas nativas Antigravity; sua entrada global foi retirada. Preservar os parsers CLI sob warnings do Node mínimo e testar o painel com evidências estruturadas reais, não somente listas vazias. A busca usa prior de docs `.5`, validado em 79 casos independentes: cinco ranks melhores, nenhum pior no top 50; isso não demonstra economia de API nem aceleração. Os casos tornam-se corpus de regressão observado: a próxima seleção de parâmetro precisa de novo holdout.

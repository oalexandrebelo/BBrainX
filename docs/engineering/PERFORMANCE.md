# Livro de experimentos de desempenho

Guardar as tentativas mantidas e rejeitadas evita reotimizar o mesmo problema sem evidência. Ganhos precisam de paridade e comparação equivalente; números abaixo não medem tarefas aceitas, tokens faturados ou throughput de agentes completos.

## Checkpoints idempotentes — 07/10/2026

Hipótese: a repetição de uma chave já comprometida consulta Git e reserva o escritor SQLite antes de devolver uma resposta imutável. A leitura indexada da chave, após validação de projeto/entrada/fingerprint, pode retornar essa mesma resposta sem novo Git ou writer lock. Na ausência, a checagem dentro de `BEGIN IMMEDIATE` permanece e resolve escritores concorrentes.

Base: `38904c38f1d27b84afaeb56fed702d233ad4e25f`. Candidato inicialmente medido na árvore de trabalho; identidade pelo SHA-256 de `src/store.mjs`: `375819c3fb5a1d8fe2bc52620e74516ff6b51085cbd5822ee0f01ada437c48f0`. O head Git ainda era a base, portanto não se atribui a ela a implementação otimizada. O JSON gerado contém hashes dos módulos, ambiente e amostras.

Comando: `node scripts/checkpoint-replay-benchmark.mjs 38904c38f1d27b84afaeb56fed702d233ad4e25f 100 5`. Git histórico completo, Node 24 e `tar` são necessários ao experimento, não ao uso do núcleo. O script usa uma fixture Git/SQLite real e sintética, 20 aquecimentos por variante/caso, cinco rodadas alternadas e o mesmo processo/DB. Tempos incluem instrumentação de operações reais; comparação de hash fica fora do intervalo cronometrado.

| Caso no Mac M4 / Node 24.21 | Pares | Mediana base → candidato | Trabalho redundante removido | Veredito |
| --- | ---: | --- | --- | --- |
| Replay sem snapshot explícito | 500 | 8,854 → 0,0286 ms | 500 chamadas Git e 500 writer transactions → 0 | Mantido por redução de trabalho e paridade. |
| Replay com snapshot explícito | 500 | 8,844 → 0,0210 ms | 500 Git/transactions → 0 | Mantido. |
| Chave repetida com fingerprint conflitante | 500 | 8,812 → 0,0339 ms | 500 Git/transactions → 0; continua recusando | Mantido. |
| Primeira gravação | 100 | 8,969 → 8,970 ms | Nenhum; um SELECT adicional | Ganho não demonstrado, dentro do ruído. |

Node mínimo 22.20 também foi medido: replay sem snapshot 8,873 → 0,0313 ms; primeira gravação 9,077 → 9,073 ms, abaixo da dispersão observada. A cauda p95 da primeira gravação variou; não se afirma ausência absoluta de regressão de latência nesse caminho. A resposta de replay preservou os 379 bytes canônicos, sem novos eventos ou versões. Testes cobrem validação, colisão, writer concorrente, duas conexões e dois processos.

Com `I` chaves de idempotência e `R` bytes da resposta histórica, a consulta usa a chave primária composta: busca B-tree `O(log I)` e leitura/parse `O(R)`. A nova leitura usa memória `O(R)`, sem cache persistente adicional. O benefício está em remover o processo Git e a reserva de escritor; não se mudou a classe assintótica da busca. Primeiras gravações pagam um SELECT extra; replay em lanes ainda adquire a trava externa do registry. Não houve alteração de schema, retenção ou payload.

A CI reexecuta o experimento e conserva JSON bruto em `artifacts/engineering/checkpoint-replay.json`, com diagnóstico separado. Gates são paridade e contagens determinísticas; não há threshold de microssegundos sobre runner compartilhado. Dados locais completos do ensaio original ficam em `docs/artifacts/engineering-2026-10-07/`, comprimidos sem perda como `.json.gz`, com hashes dos bytes originais e comprimidos em `manifest.json`. Para ler: `gzip -dc docs/artifacts/engineering-2026-10-07/checkpoint-replay-node24.json.gz`. São evidência dessa execução, não baseline de produção.

Na publicação de evidências em main, a CI preserva metadados e resultados sem as amostras individuais em `docs/validation/engineering/checkpoint-replay-summary.json`, incluindo o hash do JSON bruto. O log do Node mínimo também é preservado. A coleta recusa candidato sujo, revisão divergente, contagens incompletas ou invariantes violadas; resumos permanecem disponíveis depois da retenção dos artifacts. Para um experimento que sustente uma alegação histórica, preservar também as amostras completas, como nesta rodada.

## Tokens do que o agente lê — 10/10/2026

Hipótese: `context_search` e o pacote entregam mais tokens do que o agente usa (12 trechos de 60 linhas por chamada, cauda sem relação com o objetivo, hash de 64 hex em cada cabeçalho, esquemas repetidos em `tools/list`), e um teto com ponteiros reduz o payload sem perder onde olhar. Base: `5acad77`. Tokens são o200k_base do `gpt-tokenizer`, um proxy do payload: não medem cobrança, `billingSavings` continua `null`, e não se verificou quais campos de `content`/`structuredContent`/`outputSchema` cada harness injeta no prompt.

Reprodução: `node scripts/measure-search-tokens.mjs` (36 consultas de `test/fixtures/eval-natural.cases` sobre este repositório, só leitura, sem rede) e `test/token-budget.test.mjs`, `test/index-required.test.mjs` para as garantias. As cinco tarefas com linhas de referência (`src/ test/ docs/` do `c874a22`, 140 arquivos) e os demais ensaios ficaram em pasta de auditoria local, não versionada: o que importa delas está nos números abaixo.

| Caminho (servidor real por stdio) | Antes | Depois | Observação |
| --- | --- | --- | --- |
| `context_search`, resposta padrão, 36 consultas | 17.397 tokens, 12 trechos | 3.517 tokens (-79,8%), 2,8 com corpo + ponteiros | arquivo esperado localizado 31/36 antes e depois; **com corpo 31/36 → 23/36** |
| `context_search`, resposta padrão, 5 tarefas | 15.513 tokens | 3.466 (-77,7%) | arquivos de referência 0,90 → 0,90; linhas de referência com corpo 0,90 → 0,72, localizadas (corpo, `also`, `more`) 0,90 → 0,92 |
| `context_search`, `limit: 50`, 5 tarefas | 64.368 | 3.720 | arquivos de referência localizados 1,00 → 1,00 |
| Ranking (mesma conta do `godmode.test.mjs`) | acerto em 3: 0,639; em 10: 0,861; 41 vagas repetidas no top-10 | 0,667 (0,694 no corpus `5acad77`); 0,889; 0 | o piso 0,85 do teste passa de 31/36 para 32/36 |
| `context_bootstrap`, 5 tarefas | 4.818 | 4.126 (-14,4%) | linhas e arquivos de referência iguais (0,83 e 0,90) |
| `context_bootstrap`, 60 consultas (36 naturais, 24 de identificador) | 4.573 | 4.389 (-4,0%) | arquivo esperado presente 45/60 antes e depois; naturais +0,9%, identificadores -11,6% |
| Por turno: instruções + definições das ferramentas | 1.498 | 1.396 (-6,8%) | esquemas -7,7%, frase de `context_index` +1,0% |
| `tools/list` no fio | 2.431 | 1.925 (-20,8%) | |

Quem paga: a resposta padrão de `context_search` traz corpo de 2 a 3 arquivos em vez de 12 trechos; nos outros o agente recebe `caminho:linhas` (cerca de 10 tokens) e precisa ler o trecho ou pedir `budget` maior. O corpo do arquivo esperado cai de 31/36 para 23/36 das consultas naturais; a localização não cai. As linhas de referência com corpo caem de 0,90 para 0,72 porque a segunda faixa do mesmo arquivo passa a vir em `also`. O piso de relevância corta a cauda do pacote, mas o orçamento continua sendo preenchido por trechos acima do piso: nas consultas naturais o pacote não diminui (+0,9%). O cabeçalho curto sozinho aumenta o pacote em 1,7% (mais uma seção cabe). A frase nova das instruções custa 14 tokens em todo turno. O erro de índice ausente custa 29 tokens contra 31 da resposta vazia; o de obrigatório que não cabe passa de 25 para ~110 tokens, só quando ocorre.

Complexidade: a contagem de tokens de `fitSearch` é `O(T)` no texto dos até 50 acertos; o agrupamento por arquivo é `O(n)` sobre os até 400 candidatos já ordenados; `mandatoryDetail` só roda na recusa. Custo observado pelo script (execuções únicas, ruidosas): 6 a 7 ms por chamada antes, 12 a 14 ms com `limit` 12 e cerca de 21 ms com `limit` 50.

Rollback sem código: `budget: 16000` e `limit` restauram respostas grandes; `BBRAINX_PACK_MIN_RELEVANCE=0` desliga o piso do pacote; `search(..., {byFile:false})` devolve a lista crua de trechos.

Próxima ação concreta: o corpo servido é um trecho inteiro de 60 linhas e só 26% das linhas servidas caem nas faixas de referência (precisão de linhas 0,26). Reduzir o corpo às linhas ao redor dos termos casados, com `start_line`/`end_line` ajustados, serviria 3 vezes mais arquivos no mesmo teto; precisa de gabarito de linhas maior que as 5 tarefas para não cortar a resposta. Também medido e não tratado: `content[0].text` e `structuredContent` repetem o mesmo JSON (tarefa T1: 10.125 tokens no fio contra 4.978 do texto), `sources[].id` e `.hash` sem consumidor no repositório, o `initialize` do `5acad77` pesa ~4,9 mil tokens no fio (eram 228) por causa dos ícones PNG em base64 (não se verificou se algum harness os põe no prompt do modelo).

## Alternativas rejeitadas ou ainda não justificadas

- Mover Git para dentro de `BEGIN IMMEDIATE`: eliminaria o custo do replay, mas alongaria a trava de escritor com processo externo no caminho novo.
- Cache em memória/TTL de resposta: duplica estado e complica coerência entre processos; a chave persistida e indexada já resolve o problema.
- Trocar tokenização sem medir: `countTokens` já está em uso e não é alvo desta otimização.
- Centralizar ownership MCP com um AbortController em todo ping: a revisão encontrou o mesmo contrato com apenas um guard antes do despacho e os controladores já existentes nas chamadas assíncronas. Escolhida a menor mudança; nenhum ganho de throughput do produto alegado.
- Fundir os trechos do mesmo arquivo num item só, com corpo: menor custo nas 5 tarefas (3.673 contra 3.729 tokens), mesmas linhas com corpo (0,83), mas o corpo deixa de ser uma fatia contígua de `start_line`..`end_line` e os itens maiores servem menos arquivos (2,81 contra 3,06 por resposta). Escolhido `also`, que dá a mesma localização sem mudar o significado do item.
- No máximo 2 trechos por arquivo: deixa 32 das 38 vagas repetidas no top-10 e não melhora o acerto em 3 (0,639). Máximo 1 sem `also`: perde a segunda faixa sem ponteiro (linhas localizadas 0,72).
- Piso de relevância 0,4 no pacote: sem perda de acerto nesta amostra (45/60), mas com menos evidência que 0,3; mantido 0,3 até haver outro conjunto.
- Reescrever `INSTRUCTIONS` para economizar tokens: já derrubou o `godmode.test.mjs` uma vez (acerto em 10 de 0,833); a frase nova foi acrescentada sem reescrever o resto.
- Mudar ranking, gold ou corpus para melhorar o placar: não executado. A sensibilidade do self-index exige um experimento independente de busca.

## Fontes e validade

[SQLite isolation](https://sqlite.org/isolation.html) e [transactions](https://sqlite.org/lang_transaction.html) fundamentam leitura de estado comprometido e arbitragem do escritor; não tornam uma sequência de várias conexões uma transação única. [Node child_process](https://nodejs.org/api/child_process.html) documenta o bloqueio das chamadas síncronas; [perf_hooks](https://nodejs.org/api/perf_hooks.html) fornece o relógio usado. Consultadas em 07/10/2026. A decisão depende da imutabilidade das respostas de idempotência na API atual; retenção/pruning futuros precisam reavaliar esse contrato.

## AB-BBX — frescor operacional, 12/10/2026

Hipótese: índice reconciliado na worktree correta remove uma causa de baixa adoção, sem alegar melhoria do ranking. Baseline `e3977cc`: busca persistente e reindexação explícita. Candidato: processo CLI periódico, intervalo após conclusão, mesmo indexador e mesmas exclusões; custo O(bytes) por ciclo. Alternativa rejeitada nesta fatia: depender apenas de eventos do filesystem, que não garantem reconciliação após perda de eventos. Não se adicionou cache/LLM/serviço distribuído.

Fixture causal: criar marcador, executar ciclo, remover arquivo/criar novo marcador, executar segundo ciclo e pesquisar; repetir escopo por lane. `node --test test/ab-bbx.test.mjs test/engine.test.mjs test/checkpoint-replay.test.mjs`: 25/25. `npm test`: 740/740; `npm run build`: passou. Ambiente Linux/Node 24.19.0. Esses resultados provam comportamento na fixture, não tempo economizado no DoneFitt. [Operação, falhas e próximas medições](../AB_BBX.md).


## Custo de frescor — candidata 2.0, 12/10/2026

`node scripts/measure-index-freshness.mjs` alterna 12 pares de busca lexical e busca com varredura integral sobre corpus sintético fixado. Amostras, hash de fonte/manifesto e ambiente em artifacts/engineering/index-freshness.json; execução também na CI. [Resultados e limitações](../BBRAINX_2_0.md#contrato-de-frescor-e-seu-custo). A verificação adiciona I/O e hashing; não é anunciada como speedup. Medição nos Macs físicos, energia e tarefas aceitas continuam pendentes. Próxima otimização deve preservar detecção de novo arquivo, ignore e conteúdo alterado com mesmo tamanho/mtime.

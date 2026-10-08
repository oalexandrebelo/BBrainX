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

## Alternativas rejeitadas ou ainda não justificadas

- Mover Git para dentro de `BEGIN IMMEDIATE`: eliminaria o custo do replay, mas alongaria a trava de escritor com processo externo no caminho novo.
- Cache em memória/TTL de resposta: duplica estado e complica coerência entre processos; a chave persistida e indexada já resolve o problema.
- Trocar tokenização sem medir: `countTokens` já está em uso e não é alvo desta otimização.
- Centralizar ownership MCP com um AbortController em todo ping: a revisão encontrou o mesmo contrato com apenas um guard antes do despacho e os controladores já existentes nas chamadas assíncronas. Escolhida a menor mudança; nenhum ganho de throughput do produto alegado.
- Mudar ranking, gold ou corpus para melhorar o placar: não executado. A sensibilidade do self-index exige um experimento independente de busca.

## Fontes e validade

[SQLite isolation](https://sqlite.org/isolation.html) e [transactions](https://sqlite.org/lang_transaction.html) fundamentam leitura de estado comprometido e arbitragem do escritor; não tornam uma sequência de várias conexões uma transação única. [Node child_process](https://nodejs.org/api/child_process.html) documenta o bloqueio das chamadas síncronas; [perf_hooks](https://nodejs.org/api/perf_hooks.html) fornece o relógio usado. Consultadas em 07/10/2026. A decisão depende da imutabilidade das respostas de idempotência na API atual; retenção/pruning futuros precisam reavaliar esse contrato.

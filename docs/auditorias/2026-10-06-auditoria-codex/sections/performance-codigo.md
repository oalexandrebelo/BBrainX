# Caminho real e custos locais do núcleo BBrainX

Escopo desta seção: leitura de fonte de `src/context.mjs`, `retrieval.mjs`, `engine.mjs`, `store.mjs`, `primitives.mjs`, `evaluation.mjs`, `session.mjs`, `host.mjs`, `analyze.mjs`, `glossary.mjs`, transportes relevantes e `scripts/benchmark.mjs`, para a revisão informada pelo coordenador `a9636e9402e3fa673ae05b3489202da1048aef5e`. As referências abaixo são relativas a `/Users/alexandrebelo/Projetos/BBrainX/repo`. Não executei testes, builds, benchmarks, inferência, indexação nem comandos que abram o banco real. Nenhum código/configuração foi alterado. **Tudo nesta seção é observado na implementação ou inferido de sua estrutura; latência, CPU, RSS e I/O reais ficam para a medição isolada do coordenador.** A fonte da dependência instalada foi consultada como complemento; seu número de versão observado é `gpt-tokenizer@4.0.0`, igual ao pin de `package.json`.

## Diagnóstico que a fonte sustenta

O núcleo reutiliza chunks persistidos quando o SHA do arquivo não mudou; não oferece indexação incremental de leitura. Um `index` sem mudanças continua enumerando a árvore, lendo todos os bytes elegíveis, decodificando UTF-8, verificando segredos e calculando SHA-256. O bootstrap seleciona até 30 chunks, relê o arquivo de **cada chunk**, reexecuta a busca quando atualiza um candidato e conta repetidamente o texto acumulado. Portanto, `changed: 0` e `singleChangeFilesReindexed: 1` descrevem escrita/análise reaproveitada, sem comprovar redução de leitura ou tempo proporcional ao número de mudanças.

As primeiras otimizações justificáveis são reduzir leituras repetidas por caminho dentro de uma rodada, usar a contagem exata sem materializar o vetor completo de tokens, evitar uma segunda tokenização quando a quota documental já recusou o candidato e serializar uma única vez o checkpoint já validado. Não há evidência suficiente para recomendar trocar SQLite, criar índice vetorial, usar modelos, ativar watcher, adicionar dependência ou relaxar `synchronous=FULL`.

## Fluxos reconstruídos

### `context.index`

`makeEngine` autoriza o projeto na allowlist do host e invoca `indexProject` (`engine.mjs:20-39`). `indexProject` resolve limites do ambiente/chamada local, encontra a raiz registrada e enumera candidatos (`retrieval.mjs:95-97`). Em Git, são dois processos síncronos: `rev-parse` e `ls-files --cached --others --exclude-standard -z`; a listagem de até 64 MiB é materializada integralmente. Fora de Git, a recursão materializa nomes e limita profundidade a 64 e entradas visitadas a `4 × maxFiles` (`retrieval.mjs:47-69`).

Só depois da enumeração começa `BEGIN IMMEDIATE` (`retrieval.mjs:98`, `store.mjs:116-119`). A transação carrega todos os `(path,hash)` anteriores para um `Map`, lê um arquivo por vez com `readSafe`, mantém o manifesto dos aceitos, evita `replaceFile` quando o hash coincide e remove os ausentes. `readSafe` faz `lstat` de todos os componentes, `stat` do arquivo, leitura integral, teste de NUL, decode fatal UTF-8, regex de segredo e SHA (`retrieval.mjs:34-45`). Uma substituição remove chunks antigos, grava `files`, divide o corpo por linhas e grava chunks de 60 linhas com `defs`/`symbols`; os gatilhos atualizam FTS5 (`retrieval.mjs:75-87`, `store.mjs:20-26`). Finalmente o manifesto é ordenado/canonizado/hasheado, `projects.snapshot` é atualizado e um evento é gravado antes de `COMMIT` (`retrieval.mjs:117-123`).

**Consequência:** a atualização do índice é atômica em SQLite e uma falha tardia de limite reverte as alterações. A observação dos arquivos não é uma captura atômica da filesystem: arquivos podem mudar durante o percurso. Remover a transação ou usar apenas `mtime` para melhorar o número perderia garantias existentes.

### `context.search`

Consulta o projeto, valida texto/limite, usa no máximo 24 palavras da consulta e constrói cláusulas exatas, partes de identificadores, radicais e glossário português→inglês (`retrieval.mjs:160-172`). Executa até duas consultas FTS5, uma exata e outra de prefixos, com `pool = min(400, limit × 10)` e um item adicional para detectar excesso (`retrieval.mjs:173-179`). Cada consulta já traz `body` e `defs` para todos os candidatos. A união soma ranks dos dois estágios, reforça declarações, aplica peso por tipo e ordena até 800 candidatos na aplicação, devolvendo até 50 (`retrieval.mjs:180-186`).

**Consequência:** o limite final não limita o trabalho do FTS ao mesmo número de ocorrências. O índice FTS é compartilhado pelos projetos; o filtro `c.project=?` fica no join, e a estatística BM25 pertence ao corpus FTS global (`store.mjs:23`, `retrieval.mjs:174`). Não foi medido o plano SQL; uma busca ampla deve ser perfilada com corpus global crescente. O contrato evita devolver chunks de outro projeto, mas não isola o custo nem as estatísticas de ranking de outros projetos. `search` não faz verificação de frescor no disco; ela acontece no bootstrap.

### `context.bootstrap`

Exige snapshot e busca 30 chunks. Para cada item, `isFresh` chama `verifyChunk`, que consulta o projeto e relê/hasheia o arquivo inteiro. Só **depois** das leituras, um `Set` elimina paths duplicados na lista de stale (`context.mjs:16-23`, `retrieval.mjs:188-198`). Se encontrou stale, `refreshFiles` relê os paths, substitui/remove chunks e recalcula o manifesto completo. A busca se repete: são no máximo três buscas e duas atualizações; stale na terceira rodada causa recusa (`context.mjs:18-24`). A atualização parcial não descobre arquivos novos nem mudanças de `.gitignore` (`retrieval.mjs:126-145`).

Depois lê checkpoint opcional, conta memórias aprovadas, recusa mais de 100, escolhe `always` ou memórias lexicalmente relacionadas e constrói contexto obrigatório. Um checkpoint com mais de metade do orçamento é resumido (`context.mjs:25-46`). Para até 30 candidatos, calcula hash do corpo para deduplicação, tokeniza a seção documental isoladamente, tokeniza `rendered + section` para o orçamento e só então aceita o candidato. Por fim conta novamente `rendered`, calcula `packId` e grava `context.compiled` em transação (`context.mjs:47-59`).

**Consequência:** até mesmo bootstrap idêntico e sem stale escreve evento e força commit. Um pack é evidência limitada; não é cobertura completa, contagem de billing ou cache de provedor. As propriedades explícitas `coverageComplete:false` e campos financeiros `null` são corretas e devem continuar assim.

### `session.checkpoint`

`saveCheckpoint` normaliza a declaração antes de qualquer indexação. Se o snapshot foi omitido e a chave ainda não existe, chama um `indexProject` completo; depois chama `store.checkpoint` (`session.mjs:10-13`). Dentro do store, normaliza de novo, calcula fingerprint canônico, executa `gitState` síncrono e abre **outra** transação. A chave existente é conferida contra fingerprint e devolve sua resposta anterior. Para chave nova, snapshot e versão são validados, o corpo observado pelo host recebe limite de 16 KiB, e `tasks`, `task_history`, resposta de idempotência e evento são gravados no mesmo commit (`store.mjs:148-169`).

**Consequência:** replay evita reindexação, mas ainda executa `gitState` antes de descobrir a resposta anterior. CAS/checkpoint/histórico/resposta/evento são atômicos; indexação antecedente e checkpoint são duas transações. Um conflito de versão posterior pode deixar uma indexação concluída e seu evento, sem checkpoint novo. Isso não autoriza simplificar CAS nem remover a conferência do fingerprint. O snapshot explícito usa o contrato estrito do índice atual e não provoca full scan; não se deve preenchê-lo automaticamente apenas para acelerar um handoff que deveria ser reindexado pelo host.

### Caminho de transporte e custo não coberto pela função de domínio

`createEngine.invoke` valida com Zod, clona a entrada, clona a visão usada para acesso, cria deadline e valida a saída (`capability.mjs:92-113`). `engine.mjs:31` faz `JSON.stringify` seguido de `JSON.parse` de todo resultado. MCP gera um campo `content[].text` com JSON do mesmo resultado, mantém também `structuredContent` e serializa o envelope final (`mcp.mjs:70-74,124`). O resultado de busca pode, portanto, passar por múltiplas cópias/serializações e aparecer duas vezes na mensagem MCP. Isto faz parte da superfície pública atual, não é um cache de resposta.

Todos os caminhos de domínio acima usam APIs síncronas de FS/processo/SQLite, além de tokenizer/canonical/JSON síncronos. O `timeoutMs:30000` é um timer no mesmo event loop (`engine.mjs:26`, `capability.mjs:53-58,104-105`). Ele não preempta uma longa leitura, SQL, canonical ou merge BPE: a capacidade pode terminar e cumprir as promises em microtasks antes que o timer atrasado rode. Sem medição, não afirmar que o teto de 30 s governa o consumo real desses caminhos.

## Modelo de custo e limites efetivos

Notação: `F` arquivos indexados; `B` bytes de texto aceitos; `N` caminhos enumerados antes do filtro; `D` profundidade média; `L` linhas do corpus; `C` chunks; `K` candidatos unidos (`K≤800`, `K≤600` no bootstrap de limite 30); `R≤30` chunks devolvidos ao bootstrap; `U≤R` paths únicos; `W≤24` palavras; `G` entradas do glossário; `M` memórias totais no banco; `E` eventos globais; `T` tarefas de um projeto; `J` bytes do JSON devolvido. Os custos de SQLite/FTS abaixo são condicionais ao plano e aos dados; não foram cronometrados.

| Operação | CPU / complexidade inferida | RSS / materialização | I/O / efeito persistido |
|---|---|---|---|
| Index inicial | enumeração + `O(F×D+B+F log F)`; análise `defs` tem número fixo de regex por chunk; inserções e postings dependem de `C` | não retém todos os corpos, mas retém nomes, `previous`, `entries`, `present`, snapshot serializado e o maior arquivo/array de linhas; **`O(N+F+maior arquivo)`**, além de caches SQLite/tokenizer | leitura lógica de `B`; metadados por componente; escrita chunks/FTS/manifesto/evento e WAL |
| Index unchanged | ainda `O(F×D+B+F log F)`; evita chunking/análise/inserts do corpo | mesmos mapas/manifesto, um arquivo por vez | ainda lê `B`; ainda atualiza snapshot e grava evento/commit |
| Refresh `U` paths | `O(U×D + bytes desses paths + F log F)` | manifesto `.all()` de **todo** o projeto e canonical completo | só lê os paths enviados, mas percorre todos os hashes do banco; commit writer |
| Search | geração `O(W×G)`; FTS/postings/rank/sort dependem dos matches globais; ranking JS `O(K log K + K×W)` | `.all()` traz corpos completos de até 401 linhas por estágio; até 800 bodies únicos antes do recorte | consulta banco/FTS; não lê FS nem grava evento |
| Bootstrap fresh | search + `Σ tamanho(file de cada chunk)` + repetidas tokenizações acumuladas | bodies do pool de busca + buffers lidos + strings cumulativas + vetor de tokens/cache BPE | até 30 leituras integrais, inclusive repetições do mesmo arquivo; commit de evento |
| Bootstrap stale | até 3 searches + 90 verificações por chunk + 2 refreshes, antes do rendering | mesmos picos; refresh acrescenta manifesto global | paths stale são lidos na verificação, novamente no refresh e novamente na rodada seguinte |
| Checkpoint sem snapshot | full index + Git + canonical/JSON de até limite do payload | corpos duráveis até 16 KiB cada, clones de entrada/saída | dois commits FULL: índice e checkpoint; quatro registros duráveis na transação do checkpoint |
| Checkpoint replay | normalização + fingerprint + Git + parse da resposta | pequeno para payload válido, mas não zero | sem full index; `BEGIN IMMEDIATE`/consulta chave e retorno anterior |
| MCP search | domínio + `O(J)` várias vezes | objeto resultado, clone JSON, string `content`, envelope final/queue de stdout | wire contém representação textual e estruturada; `write` não espera backpressure |

Os limites do host são defaults `20.000` arquivos, `256 MiB` totais e `256 KiB` por arquivo, com máximos configuráveis de `200.000`, `4 GiB` e `4 MiB` (`retrieval.mjs:16-27`). São tetos de entrada, não garantias de latência. O teto de arquivos/bytes é aplicado **depois** que cada arquivo foi lido; a lista de candidatos já pode ser grande. O Git limita o buffer a 64 MiB, separado desses tetos. O fallback sem Git limita entradas visitadas; o Git não tem esse contador de percurso.

Chunking por 60 linhas não impõe teto de tokens/bytes por chunk. Um arquivo de uma linha cabe inteiro num chunk, enquanto um arquivo de 256 KiB composto de quebras de linha pode gerar aproximadamente `ceil((262144+1)/60)=4.370` chunks. Sob o teto total de 256 MiB, a combinatória permite milhões de chunks pequenos. Esses são extremos permitidos pela fonte, não workloads observados nem estimativas de banco real.

Uma busca de limite 50 pode materializar até 800 bodies e ler 802 linhas SQL contando os sentinelas. Usando o teto default por arquivo como teto frouxo de body, só o conteúdo poderia alcançar cerca de 200 MiB nos candidatos; com override de 4 MiB, o teto frouxo supera 3 GiB. O limite final 50 ainda permite cerca de 12,5 MiB de texto default e 200 MiB com override, antes da duplicação MCP. Esses limites são envelopes conservadores, não picos medidos: chunks usuais são menores e corpos únicos/string sharing alteram o RSS real. **A declaração de limite por arquivo não é um limite de saída nem de memória por consulta.**

## Caches reais e regras de invalidação

| Cache/reuso | Existe e onde | Invalidação e ressalva |
|---|---|---|
| Statements preparados por conexão | `BrainStore.#statements`, `stmt()` (`store.mjs:68,110-114`) | chave SQL; limpo no `close`. Index/refresh/search/event/project reutilizam; vários métodos de checkpoint/memórias/painel ainda usam `db.prepare` diretamente. Sem cache de resultados |
| Conteúdo/indexação por hash | `files.hash`, chunks e FTS (`retrieval.mjs:99,114-115`) | full index compara bytes atuais; refresh atualiza apenas paths dados. O conteúdo persistido é derivado, não histórico de arquivo |
| Identidade do snapshot | SHA de manifesto ordenado (`retrieval.mjs:72-74`) | full index ou refresh; não cobre arquivos novos ainda não indexados, ignore novo, conteúdo fora das extensões/tetos ou estado Git completo |
| Deduplicação de corpos do pack | `seen` por SHA do body (`context.mjs:47,51,54`) | só dura a chamada; adicionado apenas após servir. Mesmo corpo em múltiplos paths/chunks pode aparecer no pool e ser verificado/tokenizado antes da dedup no rendering |
| Resposta idempotente de checkpoint | tabela `idempotency`, chave/fingerprint (`store.mjs:13,151,154-155,166`) | persistente, sem TTL implementado; retorna resposta original com host stamp original. Não é uma cache que se possa expirar silenciosamente |
| BPE por pretoken | dependência `gpt-tokenizer`: singleton da encoding, `mergeCache` LRU de até 100.000 entradas (`node_modules/gpt-tokenizer/esm/encoding/o200k_base.js:6-9`, `BytePairEncodingCore.js:28-34,239-258`, `constants.js:3`) | processo local; chave é string exata do pretoken, sem depender do snapshot. Limite por número de entradas, não por bytes. Ajuda corpus repetitivo, retém texto/token arrays e não evita regex/concat/contagem acumulada |
| Descrições/catálogo de capacidades | `capability.mjs:79-91`, `mcp.mjs:55` | por engine/handler. No MCP duram a sessão; no painel `makeEngine` é recriado a cada invoke (`server.mjs:37`) |
| `SingleFlight` | classe em `primitives.mjs:25-34`; teste em `test/domain.test.mjs:31` | não é utilizada em `src/` ou `bin/` além da própria definição. Coalesceria somente promises pendentes, não memoizaria resultado. Não há coalescing ativo de bootstrap/index |
| Page cache OS/SQLite | depende do runtime/host | não foi instrumentado nem atribuído a um ganho; warm OS não elimina leitura lógica/hash. WAL habilitado não significa cache de bootstrap |

Não há watcher, cache de query/pack/token-count completo, cache de frescor entre chamadas, embeddings ou camada de modelo nesse caminho. A Laya é carregada só no comando opcional e não deve ser ativada para resolver custos do núcleo (`bin/bbrainx.mjs:49-70`; `context.mjs` não a importa).

## Hotspots e menor alteração defensável

Prioridades: **P0-medir** é risco de bloqueio/consumo que precisa de evidência antes de promessa operacional; **P1** é redução local de trabalho repetido sem alterar contrato; **P2-condicional** só justifica implementação se o perfil confirmar e o ganho superar a complexidade. Nenhuma linha abaixo afirma ganho medido.

### H01 — frescor repetido por chunk, não por arquivo — P1

**Fonte:** `context.mjs:19-23`; `retrieval.mjs:188-197`, `34-45`. Se 30 chunks vêm de um arquivo de 256 KiB, o bootstrap fresh pode ler/decodificar/escanear/hash esse mesmo arquivo 30 vezes, aproximadamente 7,5 MiB de leitura lógica. Com override de 4 MiB, o mesmo padrão chega a 120 MiB por rodada. Isto precede o filtro de orçamento: um candidato que nunca será servido também é verificado.

**Mecanismo de escala/falha:** custo de I/O/CPU acompanha ocorrências, em vez de paths únicos. O teste de frescor também repete `store.project` e `resolveLimits`, custos menores mas evitáveis. Stale induz outra leitura no refresh e mais uma na busca seguinte. É especialmente ruim em arquivos longos com o mesmo termo em muitos chunks.

**Solução mínima:** agrupar verificação por `(project,path)` **dentro de cada rodada** e ler uma vez; comparar o hash lido com **todos** os `file_hash` candidatos daquele caminho. Guardar só hash/status no cache local; não manter todos os buffers/body. Resolver raiz/limites uma vez por rodada sem deixar o chamador escolher outra raiz. Descartar o cache após refresh e ao terminar a chamada. Um caminho com hashes divergentes não pode ser declarado fresh por ter conferido apenas o primeiro chunk.

**Risco colateral:** cache por path entre chamadas ou por `stat`/TTL serviria conteúdo alterado com mesmo tamanho/tempo e enfraqueceria a garantia. A verificação continua sendo uma observação do arquivo num instante, não um snapshot atômico da FS; esta limitação já existe. Não trocar a inspeção por `git diff/status` que possa executar filtros do repo.

**Benchmark/gate:** corpus com 1 arquivo/30 chunks retornados contra 30 arquivos/1 chunk; fresh, stale, removido, arquivo que ganhou segredo, rename e override de arquivo grande. Contador de leitura deve cair de `R` para `U` por rodada, saída/packId/snapshot iguais em corpus estável, sem servir segredo/stale. Registrar p50/p95/p99, CPU, bytes lidos lógicos e RSS, cold/warm. Gate proposto: queda relevante no p95 do caso repetido e nenhuma regressão >10% no caso de paths distintos; o ganho de byte count é uma propriedade verificável, sem prometer determinado número de ms.

### H02 — contagem aloca vetor completo de tokens — P1; pretoken adversarial — P0-medir

**Fonte:** `context.mjs:1,6,35,46,52-56`; `node_modules/gpt-tokenizer/esm/GptEncoding.js:148-154,216-238`; `BytePairEncodingCore.js:95-145,260-296`. `encode(...).length` materializa o vetor de tokens que o chamador descarta. A versão instalada expõe `countTokens`, cuja implementação soma comprimentos sem construir esse vetor final, e `isWithinTokenLimit`, que para após ultrapassar o teto entre pretokens.

**Solução mínima:** substituir a implementação de `tokenCount` pelo `countTokens` da **mesma encoding e mesmas opções de especiais**. Para perguntas binárias de orçamento, avaliar `isWithinTokenLimit` preservando o resultado exato quando cabe; reutilizar a contagem exata do último rendering aceito para o payload final. Isto remove alocação, não troca o tokenizer nem a semântica de orçamento. O uso de `new Set()` vazio por chamada é custo secundário; compartilhar opções privadas só é seguro se ninguém puder mutá-las.

**Falha maior inferida:** o `bytePairMerge` varre todos os ranks e faz `splice` a cada fusão; para um pretoken longo com muitas fusões, o pior caso é quadrático no comprimento em bytes do pretoken (`BytePairEncodingCore.js:268-287`). A regex da encoding pode produzir palavras/trechos de whitespace longos. O corte de linhas de 2.000 caracteres limita `definitions`, **não** o corpo que vai ao tokenizer (`analyze.mjs:17,43-44`). `test/turbo.test.mjs:64-76` mede indexação/definitions em linhas hostis; não cobre bootstrap/tokenização dessas linhas. `countTokens` ainda chama o mesmo merge e o gerador só verifica o limite depois de produzir um pretoken; nenhuma das trocas corrige esse pior caso. Também há `tokensArray.push(...tokens)` no `encodeNative` (`BytePairEncodingCore.js:110`), potencial limite de argumentos para pretokens com vetores enormes; não observei RangeError em execução.

**Risco colateral:** somar contagens de seções separadas não garante a contagem do texto concatenado: BPE pode variar na fronteira. Não estimar tokens por chars nem truncar código sem atualizar provenance/linhas. Não reduzir uma linha arbitrariamente e chamá-la de evidência completa. Um futuro teto de pretoken/chunk ou isolamento por worker precisa de erro declarado, política/versionamento e avaliação própria; não é uma micro-otimização autorizada aqui.

**Benchmark/gate:** mesmos textos em português/inglês/Unicode, CRLF, código, tokens especiais tratados como texto e orçamento exatamente na fronteira. As contagens, aceitação/rejeição, `payloadTokens`, texto e packId devem coincidir com a implementação atual. Medir alocação/peak RSS e p95 fresh. Para linhas adversariais, testar em **subprocesso com watchdog externo**, em degraus de tamanho, e registrar timeout censurado em vez de deixar travar o harness; incluir cold BPE e warm após o mesmo texto. Gate proposto: queda de alocação/pico sem aumento >10% de p95; não declarar tempo linear do bootstrap enquanto o caso de merge longo não tiver sido medido.

### H03 — tokenização cumulativa repetida e quota checada tarde — P1

**Fonte:** `context.mjs:45-56`. Para cada item, `tokenCount(rendered+section)` recodifica todo o contexto aceito até ali. Documentos fazem também `tokenCount(section)`. O `||` verifica primeiro o orçamento total; mesmo quando `docTokens+cost` já ultrapassou a quota, a concatenação inteira é codificada. Com até 30 itens, o trabalho é aproximadamente `Σ encodeBytes(prefixo_i + seção_i)`, além dos merges BPE; se o número de candidatos fosse variável, isso cresceria quadraticamente com o número de seções de tamanho parecido. Hoje o fator é limitado a 30, mas cada seção continua podendo ter bytes do arquivo inteiro.

**Solução mínima:** após computar custo documental, recusar quota documental excedida antes de codificar o texto acumulado; manter exatamente `sourcesOmittedByBudget`. Reusar a contagem exata do rendering aceito e da base obrigatória para não recontar a última string. `isWithinTokenLimit` pode tornar a pergunta do orçamento parcial, sem mudar a seleção. Seções documentais estáveis poderiam ter contagem memoizada por identidade completa/header/encoding, mas começar com reuso por chamada, sem cache durável novo.

**Risco colateral:** não substituir o cálculo combinado por `tokensBase + tokensSection`. Não aplicar dedup apenas por caminho — chunks diferentes do mesmo arquivo são evidências diferentes. Manter a quota de metade quando há código candidato, inclusive quando o código não cabe; alterá-la seria mudança de produto, não otimização.

**Benchmark/gate:** 30 documentos longos que ultrapassam a quota, mistura doc/código, 30 corpos duplicados, zero código, obrigatório quase lotando budget, budgets 256/4.000/16.000. Identidade de saída inteira e contadores obrigatória. Comparar número/bytes de chamadas ao tokenizer e p50/p95/p99 cold/warm; gate proposto de ≥20% menos trabalho contabilizado no caso de recusa documental, sem regressão material nos demais. Percentual é objetivo de aceitação proposto, não resultado.

### H04 — candidatos FTS trazem corpos antes do reranking — P2-condicional

**Fonte:** `retrieval.mjs:173-186`, `store.mjs:21-23`. `.all()` materializa até 401 rows por estágio; o corpo não participa do reranking JS, que usa rank/kind/defs/metadata. Só até `limit` itens sobrevivem. O corpo fica armazenado uma vez em `chunks`; external-content FTS evita uma segunda cópia textual completa na tabela virtual. Ainda há postings e colunas de análise que repetem nomes, intencionalmente.

**Solução mínima candidata:** primeira consulta buscar metadados/rank/defs sem `body`; fazer o mesmo reranking e buscar bodies somente para os vencedores. Preservar pesos, pool, tie-break e `truncated`. Medir plano SQL e custo de ordenação antes de alterar consultas. Fazer as duas leituras sob snapshot de leitura consistente, ou tratar a corrida de atualização/remoção explícita; buscar bodies depois sem isso pode misturar índice antigo e novo. Não usar `BEGIN IMMEDIATE` desnecessário para a leitura nem introducir transação aninhada não suportada pelo store.

**Risco colateral:** dois estágios + fetch posterior elevam consultas; para chunks curtos o overhead pode piorar. Um pool menor ou LIMIT antecipado muda recall e pode perder a declaração que só ganha após reranking. Acrescentar projeto como coluna FTS indexada pode reduzir postings examinados, mas não torna automaticamente BM25 independente do corpus global; exigiria migração/rollback e nova avaliação. Um índice por projeto não é a solução mínima sem perfil e necessidade de isolamento estatístico comprovados.

**Benchmark/gate:** consulta específica, termo comum, prefixo/glossário amplo, no-hit; corpo curto e arquivo de uma linha grande; mesmo projeto sozinho e acompanhado por projeto grande no mesmo DB. Mesma sequência de IDs/scores/metadata, hit@k/MRR invariantes para troca apenas de materialização. Medir RSS pico, bytes SQL retornados, p50/p95/p99 e `EXPLAIN QUERY PLAN` na cópia. Gate proposto: redução de body bytes candidatos de `O(K)` para `O(limit)` e p95/RSS melhores no caso grande, sem >10% regressão p95 em consultas pequenas. Não prometer melhora do FTS sem verificar seu plano.

### H05 — snapshot partial-refresh varre/serializa o manifesto inteiro — P2-condicional

**Fonte:** `retrieval.mjs:72-74,119,141`; `primitives.mjs:15-21`. Um único arquivo stale faz SELECT de todos os hashes, sort de `F`, map de objetos e canonical completo. O full index já percorre nomes ordenados e depois ordena de novo os entries. Este é full scan de metadados, não full scan dos corpos; não confundir as duas métricas.

**Solução mínima candidata:** produzir o SHA canônico por streaming de `[` + objetos canonizados individuais + vírgulas + `]`, na mesma ordenação JS existente, evitando a string grande e o array intermediário de objetos. Aproveitar ordem conhecida só onde demonstrável; keep sort no caminho que não tem a garantia. Uma árvore Merkle/incremental mudaria a identidade do snapshot e está fora da otimização mínima.

**Risco colateral:** `ORDER BY path` do SQLite não deve substituir silenciosamente a comparação JS `<` sem provar equivalência para todos os paths Unicode; UTF-8 BINARY e ordem de unidades UTF-16 podem diferir para caracteres suplementares/BMP. Canonical ordena as chaves (`hash` antes de `path`), não usa a ordem literal do objeto. Qualquer diferença mudaria snapshot, checkpointStale, hashes de IDs e comparação de evidência. Não alterar assinatura de `hash` geral para alimentar streaming por conveniência.

**Benchmark/gate:** refresh de um path em 2k/10k/20k entries, Unicode incluindo BMP/suplementares, rename/delete, reorder dos entries. Hash idêntico ao atual para toda a matriz; medir p95, alocação/peak RSS e número de objetos/string bytes. Gate proposto: RSS/alocação menor no manifesto grande sem perda de identidade; p99 só com amostra suficiente. Esta alteração continua `O(F log F)` onde precisa ordenar e não deve ser anunciada como atualização `O(1)`.

### H06 — replay de checkpoint ainda observa Git; canonical do corpo é repetido — P1

**Fonte:** `session.mjs:11-13`; `store.mjs:151-166`; `host.mjs:27-32`. Checkpoint replay evita index, mas `gitState` spawnSync ocorre antes da consulta de idempotência. O corpo `stored` é canonizado para limite e depois outra vez para `body`; normalização acontece no service e no store. Tudo é pequeno perto do full index, mas Git pode consumir até 5 s em erro/host lento.

**Solução mínima:** canonizar `stored` uma vez e usar a mesma string em `byteLength`/gravação. Para replay, acrescentar fast path de consulta da chave e fingerprint antes do Git, **retendo** a conferência dentro da transação para a corrida em que outro processo grava depois do fast path. A resposta anterior é imutável no contrato atual. Caso de chave nova continua com Git host-observed e CAS no commit. Reusar uma normalização interna somente se nenhum caminho público puder passar declaração não validada.

**Risco colateral:** mover Git para dentro da transação evita spawn em replay mas aumenta o tempo de writer lock de toda gravação nova; o fast path anterior evita esse trade-off. Nunca devolver apenas porque `hasCheckpointKey` é true, sem fingerprint. Nunca permitir que o agente injete `host`. Não usar a versão lida antes do index como substituta de CAS; outros processos podem avançar a versão.

**Benchmark/gate:** primeiro checkpoint com snapshot omitido/expresso, replay exato, colisão de conteúdo/chave, versão stale e dois handles. Replay exato deve devolver JSON idêntico, zero reindex e zero `gitState` spawn no caminho estável; histórico/evento contam uma vez. Caso de colisão permanece erro, sem escrever resposta nova. Medir p50/p95/p99 replay e p95 first-write, Git slow/failure injetado somente com fixture local controlada. Gate proposto: o número de processos Git cai para zero no replay, sem regressão >10% de p95 em gravação nova.

### H07 — serialização/clonagem de transporte amplifica saída grande — P2-condicional

**Fonte:** `engine.mjs:31`; `capability.mjs:97-105`; `mcp.mjs:73,124`. O engine adapta dados via roundtrip JSON antes de validar saída; MCP inclui saída estruturada e uma string com a mesma saída. Busca pode devolver corpos muito maiores que o budget do bootstrap. Zod/clones/stringify são síncronos `O(J)` e podem dominar RSS/CPU após um domínio rápido.

**Solução mínima candidata:** perfilar fases separadas; se comprovado, tornar os produtores explicitamente JSON-safe e substituir o roundtrip redundante sem mudar o shape público nem permitir `undefined`/valores não finitos. Alternativamente normalizar só as folhas problemáticas. Manter validação de saída e clones que protegem a fronteira de acesso. A duplicação textual/estruturada MCP é compatibilidade pública; não removê-la em uma micro-otimização não avaliada.

**Risco colateral:** `BrainStore.tasks()` usa `body:undefined` (`store.mjs:183`), e é preciso auditar todos os produtores antes de remover uma normalização que hoje elimina campos/normaliza números. Um `structuredClone` cego não reproduz JSON: conserva undefined e tipos que `z.json()` recusa. Chunk body clipping sem metadados precisos faria a evidência/linhas enganosas. Um teto novo de saída seria alteração de contrato e teria de devolver truncamento/erro declarado, não perda silenciosa.

**Benchmark/gate:** direct domain versus `engine.invoke` versus MCP real, saída típica e saída máxima controlada, um item e limite 50. Registrar bytes serializados, CPU por fase, RSS peak, latência até resposta completa e até parse pelo cliente. Golden output de ambos os protocolos e erros deve ser idêntico. Gate proposto: pico/CPU cai no resultado grande, sem retirar output validation/access; não aceitar “melhoria” que apenas para de incluir campos relevantes.

### H08 — scans de estado durável e crescimento sem retenção — P2-condicional

**Fonte:** `store.mjs:9-15,142,163-167,181-217`; `context.mjs:26-28`. O schema só explicita `chunks_by_file` além das PK/UNIQUE. `count approved`/consulta de memories por project/status podem percorrer `M` global; events filtram projeto e cursor usando PK de seq, sem índice `(project,seq)`; tasks precisam ordenar por updated após filtrar projeto. Cada checkpoint mantém body em tasks, history e response de idempotência; com versões subsequentes, history e resposta acrescentam aproximadamente duas representações do conteúdo por versão, mais índices/metadados/evento. Não há TTL/compaction desses dados neste módulo.

**Solução mínima:** reutilizar `stmt()` nas consultas fixas quentes e medir `EXPLAIN QUERY PLAN`/latência com vários projetos e histórico grande. Só se a medição justificar, índices `(project,status,created,id)` ou `(project,seq)` e `(project,updated)` em migração com rollback; escolher pelo plano real, não acrescentar os três por prevenção. PK de `(project,path)` e `chunks_by_file(project,path)` já dão acesso e counts por projeto ao índice derivado.

**Risco colateral:** índices aumentam I/O, WAL e tamanho, podendo piorar gravações/checkpoints. A expiração de `idempotency` muda garantia de replay e pode criar efeito duplicado; não tratar como “limpeza de cache”. Retenção de history/events é decisão de produto/recuperação, não micro. A contagem de aprovadas acima de 100 deve continuar recusando o pack; usar `LIMIT 100` para mascarar overflow viola a regra de não omitir política.

**Benchmark/gate:** estado com muitos projetos, projeto raro nos events, 100 memórias aprovadas + milhares propostas/revogadas e histórico por versões. Medir p95 bootstrap/get/events/checkpoint, db/WAL bytes e plano. Gate proposto: ≥20% redução p95 do scan identificado, overhead p95 de gravação <10%, resultado/pagina/cursor invariantes. Nenhum número de capacidade ou retenção foi homologado pela fonte.

### H09 — write lock cobre FS/hash inteiro; abertura também disputa writer — P0-medir / P2-condicional

**Fonte:** `retrieval.mjs:98-123`; `store.mjs:76,79-81,116-119`. Um index unchanged mantém `BEGIN IMMEDIATE` durante todas as leituras/decodes/hashes, bloqueando outros writers pelo custo do corpus. Toda construção de `BrainStore`, mesmo schema v2 já correto, passa por uma transação IMMEDIATE de preparação. `busy_timeout=5000` é espera síncrona na disputa, que pode bloquear o event loop de outro servidor MCP/painel por 5 s. WAL permite readers, mas não writers simultâneos.

**Solução mínima agora:** remover trabalho repetido nos outros hotspots e instrumentar duração da transação/espera. Manter FULL, atomicidade e rollback dos tetos. Se o perfil de muitos harnesses mostrar contenção de abertura, avaliar fast path de verificação de schema atual sem abrir writer, preservando verificação de versão/hash e rechecagem para migração concorrente. Tirar leituras para fora da transação ou criar staging implica projeto de reconciliação: observar mudanças do DB entre preflight e commit, limites/falhas, outros processos e memória limitada. Não apresentar isso como mudança de duas linhas.

**Risco colateral:** transação por arquivo perde rollback integral quando o teto falha perto do fim e expõe índice/snapshot parcial. Reconciliar fora da transação sem CAS pode aplicar resultado antigo após outro index. `Promise.all` de todos os reads acumula corpos até `B`, além de não resolver atomicidade. Reduzir `synchronous`/foreign keys/timeout para “ganhar performance” troca durabilidade/semântica por um número menor e não está autorizado.

**Benchmark/gate:** dois processos com homes isolados que compartilham apenas o DB de fixture: writer index large versus checkpoint/get/search/abertura; registrar wait/busy, latência de cada chamada, RSS/event-loop delay e commit duration. Não usar banco/registro reais. Critério funcional: snapshot integral, conflitos determinísticos, nenhuma perda de checkpoint/duplicação de evento; nenhuma alegação de concorrência fluida antes de medir tail latency.

### H10 — entrada bounded não garante leitura/pipeline bounded — P0-medir / P2-condicional

**Fonte:** `retrieval.mjs:39-45,81-86,110-112`; `mcp.mjs:54-75,120-154`. `readSafe` confere tamanho por stat, depois usa `readFileSync` integral e só após a alocação confere `bytes.length`. Se arquivo crescer entre stat e read, o teto posterior não protege o pico. Chunking de 60 linhas não tem teto próprio de número de chunks ou bytes/token por chunk. Em MCP, `maxLineBytes` limita uma linha, a rate window limita chamadas, mas `pending`/batch e stdout não têm orçamento de bytes; `output.write` ignora o retorno false/backpressure. O volume de respostas em fila pode ser maior que o resultado individual.

**Solução mínima candidata:** leitura por descritor com no máximo `maxFileBytes+1` bytes e recusa explícita ao exceder, sem retirar verificações de caminho/symlink/UTF-8/segredo. Admissão e backpressure de transporte devem ser limites do **host**, nunca poderes de argumentos/tool text. Preservar ambas as eras MCP, comportamento de cancelamento e resposta de recusa. Limite novo de chunks ou quebra por bytes precisaria versionamento de indexação/identidades e erro declarado; não ajustar `CHUNK_LINES` sozinho, pois arquivos de hash igual hoje são reused e não seriam rechunked.

**Risco colateral:** leitura por fd não deve ser vendida como solução automática para todas as corridas de symlink; o escopo/path continua sendo responsabilidade do reader. Buffer prealocado sempre em 4 MiB pode piorar RSS de arquivos pequenos. Pausar toda entrada por backpressure pode atrasar notificações de cancelamento; bounded queue precisa considerar esse protocolo. Enfileirar operações de mutation não as torna coalescíveis: `SingleFlight` foi declarado somente para leitura e não pode juntar checkpoints/index/bootstrap com eventos.

**Benchmark/gate:** fixture que cresce enquanto é lida, linhas muito curtas e muito longas, batch/múltiplas linhas com stdout consumidor lento, cancelamentos de IDs diferentes. Medir max bytes efetivamente lidos por arquivo, número de chunks, queue bytes, p95/p99 de resposta completa e RSS sob burst. Critério: consumo limitado/recusa legível, sem cross-project e sem resposta após cancelamento. Evitar teste adversarial sem watchdog externo.

### H11 — timer de capacidade não preempta domínio síncrono — P0-medir

**Fonte:** `capability.mjs:53-58,100-105`; `engine.mjs:26,29-31`; uso sync em retrieval/store/host. `async run` e `await run(args)` não tornam filesystem/SQLite/tokenizer assíncronos. Enquanto o domínio roda, o mesmo event loop não atende timeout, cancelamento MCP, painel e outros requests. A fase de clone/validação inicial ainda antecede a criação do deadline.

**Solução mínima agora:** medir event-loop delay e separar tempos por fase; tratar o prazo como best effort onde há trabalho sync. Evitar os fatores multiplicativos anteriores. Para garantia forte futura, um executor com ownership exclusivo da conexão SQLite e fila de mutations/read boundary poderia rodar fora do loop do transporte, com scope/limites entregues pelo host. Isso é mudança arquitetural com testes de crash/replay/rollback e continua opt-in; não misturar modelos/GPU ou servidor remoto.

**Risco colateral:** adicionar `setImmediate` dentro de transação compartilhada pode permitir outra chamada tentar um `BEGIN` aninhado ou observar estado parcial. Cancelar depois que uma mutation comitou não desfaz o commit; a resposta deve seguir replay/idempotência, sem prometer rollback do mundo. Matar processo de fixture por watchdog precisa verificar recuperação WAL e retry; jamais aplicar esse experimento no banco real.

**Benchmark/gate:** long search/long tokenizer/large index junto com `session.get` curto e notificação de cancelamento. Medir atraso do heartbeat/event loop, latência de get e prazo externo de resposta, reportando chamadas que finalizaram após 30 s como tal. Testes existentes de timeout usam promises cooperativas (`test/engine.test.mjs:35-61`); não provam preempção das operações reais. Gate proposto: risco longo demonstrado e bounded por executor externo ou erro antecipado antes de usar qualquer claim operacional de 30 s.

### H12 — custo de cold start do tokenizer e engine recriado no painel — P2-condicional

**Fonte:** `engine.mjs:4`; `context.mjs:1`; `node_modules/gpt-tokenizer/esm/encoding/o200k_base.js:3-7`; `GptEncoding.js:26-40`; `BytePairEncodingCore.js:30-46`; `server.mjs:37`. Importar engine carrega context/encoding; a dependência constrói mapas de vocabulário na importação. MCP que só faz `session.get` também paga esse startup. Já CLI `index/search` usa imports dinâmicos de retrieval sem importar context (`bin/bbrainx.mjs:90-93`). No painel, cada invoke reconstroi seis capacidades/JSON schemas, embora o conjunto de projetos possa ser estável.

**Solução mínima candidata:** carregar context sob demanda no callback async de bootstrap, aproveitando cache ESM, se cold `session.get/search/index` justificar; isto desloca o custo para o primeiro bootstrap e não elimina o custo total de startup+bootstrap. No painel, cachear engine por versão da lista registrada de projetos, invalidando após mudança dessa lista, caso o perfil mostre custo perceptível. No MCP o engine já é único.

**Risco colateral:** contabilizar só domínio depois do import para declarar melhora esconde o custo real. Cache de engine deve reconstruir a allowlist quando o host muda projetos; cache por argumentos/retrieved text abriria escopo indevido. Dependência carregada sob demanda não vira requisito de modelo, rede ou instalação opcional.

**Benchmark/gate:** processo novo até handshake/catalog/get e processo novo até primeiro bootstrap; depois 100 calls warm. Separar import/init/DB/schema/invoke/wire, medir RSS após import e depois do cache BPE aquecido. Critério: reduzir cold caminhos que não usam tokenizer sem regressão >10% do tempo total cold startup+bootstrap, e allowlist correta após registro de projeto.

## O benchmark atual prova um recorte pequeno

`scripts/benchmark.mjs:15-19` cria 60 documentos quase idênticos, 27 linhas por arquivo e marcadores repetidos. Há uma medição de index inicial, uma unchanged e uma full-index após append em um arquivo (`22-26`). Dez consultas diferentes chamam **compileContext**, não search isolado, com budget de 1.500 (`28-32`). O script verifica marcador encontrado, teto de tokens, 60 reused e um arquivo reindexado; isso é um bom smoke do caminho sintético. Não é throughput/scale test, cold-start test, sucesso de tarefa ou custo de provedor.

Limitações concretas para interpretar qualquer JSON produzido por ele:

- Importação do tokenizer, criação dos arquivos, abertura/schema/registro do DB ocorrem antes do timing de `index`/query; o valor de query não inclui inicialização do processo/encoding (`1-8,15-22`).
- Há só uma amostra por tipo de indexação. `p50`/`p95` das queries usam dez casos; com `floor(10×.95)` o p95 é simplesmente o máximo dessas dez medições. Não há p99 nem repetição por consulta. Warm e cold não são separados.
- Todas as fontes são documentos pequenos e repetitivos, que beneficiam o cache BPE por pretoken. Nenhum checkpoint, memória aprovada, caminho profundo, arquivo grande/linha longa, corpus misto, ignore, Git real, muitos projetos, candidato stale ou contenção de writer participa desse recorte.
- Não coleta `process.cpuUsage`, RSS, heap/external, peak RSS do processo, db/WAL bytes, bytes lidos lógicos, subprocessos, número de calls de tokenizer, atraso do event loop, bytes de wire ou backpressure. `unchangedFilesReused` não mede I/O poupado.
- `corpusTokens` usa o array `documents` anterior ao append de `module-000` (`25,35`), enquanto o snapshot/query são posteriores. É diferença pequena nesse fixture, mas corpus/token baseline não representa exatamente o corpus final.
- `testedRevision` é apenas `GITHUB_SHA` ou null (`37`), não confirmação automática da revisão local. A evidência de SHA/copy pertence ao coordenador, sem inferi-la do report.
- A comparação com tokens do corpus inteiro não modela a melhor prática de um agente usando busca/leitura dirigida. O caveat do próprio script reconhece isso (`43`); manter esses caveats e campos financeiros/`harnessTaskSuccess` null (`42`).

`evaluateRetrieval` (`evaluation.mjs:19-27`) mede search puro uma vez por caso rotulado, rank de caminho e p50/p95; não mede bootstrap/frescor/packing/MCP. O limite default 50 usa pool de 400, diferente da search default 12 e do bootstrap 30. A agregação de casos diferentes mede distribuição dessa lista específica, não a distribuição de uma mesma chamada. `summary` (`11-13`) não trata lista vazia: divisão por zero produz NaN nas proporções/MRR, que JSON transforma em null. Um report vazio deve ser recusado ou explicitamente marcado sem dados, nunca tratado como score válido. Wilson existe para hit1/hit10, não para latência, MRR ou tarefa aceita.

## Protocolo de medição local proposto

Este protocolo é uma proposta para a cópia isolada, sem valores observados nesta seção. Usar somente corpus sintético ou repositório autorizado de código/docs, nenhum dado bruto de saúde nem estado BBrainX real. Não chamar provedores, não baixar/carregar modelo, não ativar integração. Cada rodada mantém seu `BBRAINX_HOME` isolado e copia a candidata e baseline sob a mesma configuração de host.

### Fases e dados que cada amostra precisa registrar

1. **Identidade:** SHA baseline/candidata, hash/manifesto do corpus, limites de host, Node/SQLite/OS/arquitetura, CPU/RAM disponíveis, tipo de filesystem, flags de processo e versão tokenizer. Registrar essas condições, sem supor hardware ou disponibilidade do AB-SRV.
2. **Cold de processo:** início externo → import/init DB → engine/catalog → operação → wire completo. Novo processo não significa page cache OS frio. Classificar como `process-cold/OS-unspecified`; não limpar caches do sistema nem alterar host. Para DB cold, usar home novo; para conexão cold, abrir processo novo com DB já indexado; distinguir ambos.
3. **Warm:** processo/DB/encoding já carregados; warmup registrado e excluído apenas como warmup previamente definido. Medir p50/p95/p99 e máximo de latência de domínio e fim a fim, número de erro/timeout/censura. Repetir a mesma lista em ordem determinística alternada baseline/candidata para reduzir viés térmico/cache; não comparar baseline cold com candidata warm.
4. **Recursos:** delta de `process.cpuUsage()` por operação; RSS/heapUsed/external antes/depois e maxRSS externo do subprocesso; db/WAL bytes antes/depois; número de readSafe/read calls e soma dos bytes retornados como **leitura lógica**. RSS apenas no final pode perder um pico e retenção do GC; não apresentar delta de RSS como alocação total. I/O físico requer contador do SO/instrumentação própria, não deriva da soma dos buffers lidos.
5. **Fases de domínio:** enumeração Git/walk, metadados, read/decode/secret/hash, chunking/defs/symbols, SQL/FTS, snapshot canonical/hash, frescor/refresh, tokenizer, memória/checkpoint, commit e JSON/wire. Instrumentação deve ser em cópia e temporária; o patch/probe é identificado no report e não precisa entrar em produção.
6. **Correção:** comparar objetos de saída estáveis desconsiderando só timestamps/IDs de evento aleatórios declarados; pack text/packId/snapshot/IDs/scores/linhas/hash/omissions precisam continuar iguais quando a proposta não altera ranking. Conferir FTS external-content integrity, versão/conflitos, history/idempotency/evento exatamente uma vez, rollback sob limite, cross-project negado e memória revogada não servida. Rodar os testes existentes pertinentes na candidata apenas quando houver implementação; esta análise não os executou.

### Matriz mínima por custo

| Grupo | Casos | Amostragem sugerida | O que separa |
|---|---|---|---|
| Index | inicial, unchanged, uma alteração, 1% alteração, rename/delete, novo ignore; Git e non-Git | 5-10 execuções por variante em corpus pequeno/médio; corpus grande 3 execuções se orçamento permitir | custo de read versus chunk rewrite, rollback, writer hold |
| Escala | 2k/32 MiB; 10k/128 MiB; 20k/256 MiB dentro dos defaults; arquivos curtos/linha longa/deep paths | ramp-up; abortar cenário acima do teto local definido | crescimento F/B/C/depth e diferença manifesto versus bodies |
| Search | identificador exato, natural pt/en, prefixo comum, no-hit; limit12/30/50; outro projeto grande no DB | pelo menos 1.000 chamadas warm **por classe relevante** para p99 de gate; amostra menor rotulada exploratória | FTS global, rerank, candidate bodies, recall |
| Bootstrap | fresh com U=R, fresh com U=1/R=30, stale/removido/secret; budget256/4k/16k; docs/código/duplicados | 1.000 warm em casos baratos para p99; ≥100 por caso caro e reportar p99 exploratório | leituras por path, tokenizer, quota, refresh global |
| Estado | memória0/100, proposta/revogação, checkpoint pequeno/perto16KiB, omitido/expresso/replay/conflito | ≥100 por write/replay; combinar com latência de leitura concorrente | FULL commit, Git, idempotência, global scans |
| Transporte | domain versus engine versus MCP; resultado curto/grande; slow stdout; cancel/batch | ≥100 fim a fim; ≥1.000 respostas típicas para p99 | clones/JSON/wire/backpressure/event loop |
| Cold | engine/get/search/bootstrap com processo novo, DB novo ou existente | 10-20 execuções; divulgar máximo e p50/p95 exploratórios, **não homologar p99** | import tokenizer/schema/abertura/processo |

O mínimo de 1.000 samples não dá alta precisão mágica: p99 tem poucos pontos de cauda mesmo nesse tamanho. Reportar amostra, percentil calculado, máximo, distribuição por classe e repetições; não juntar milhares de no-hit rápidos para esconder poucos broad-prefix caros. A latência muda com o número de memórias/corpus/limite; nenhuma conclusão pode omitir esses parâmetros.

### Orçamento local e critérios de parada

**Orçamento proposto da auditoria:** primeira rodada até 8 minutos de wall time, um subprocesso de carga por vez (exceto cenário explícito de dois handles/processos), zero provedor/modelo, até 256 MiB de corpus sintético e home/artifacts em `/private/tmp`. Priorizar 2k/32 MiB e repetir o cenário de maior custo observado antes de avançar para 10k/20k. Medição estendida de p99 por classe pode exigir rodada adicional declarada; não inventar p99 se o orçamento não comportar a amostra.

**Watchdog externo proposto por filho:** 30 s por chamada interativa; 60 s por index/backup do corpus grande; RSS máximo 512 MiB por processo de fixture ou limite menor definido pelo coordenador conforme RAM disponível. São limites da bancada, **não SLA/capacidade já comprovada do produto**. Chamadas interrompidas devem entrar no report como timeout/RSS-limit censurado, com o tamanho e fase; nunca excluí-las da distribuição sem divulgar. Parar ramp-up ao cruzar o teto, preservar a evidência e validar recuperação do DB isolado. Não tocar caches globais do macOS/Windows/Linux ou alterar prioridades/governor/credenciais para melhorar o resultado.

**Metas interativas candidatas para 2k/32 MiB em host local documentado:** p95 search warm ≤100 ms, p95 bootstrap fresh warm ≤250 ms, p95 session.get/replay warm ≤100 ms, sem p99 acima de 1 s ou aumento progressivo de RSS entre blocos após warmup. Para index de 32 MiB, meta inicial p95 ≤5 s e writer wait de outros clientes explicitamente publicado; a meta não é resultado nem compromisso. Ajustar as metas depois de medir baseline/host; separar casos adversariais e corpo de uma linha grande. A escolha de thresholds deve ficar no relatório de execução, para evitar selecionar retrospectivamente só os números favoráveis.

**Gate de promoção de uma micro-otimização:** identidade/correção mantidas; delta útil no hotspot (CPU/I/O lógico/RSS e p95); nenhum aumento >10% de p95 em cenários fora do alvo nem aumento >10% de peak RSS; p99 não piora além do ruído/intervalo e amostra publicada. Comparação relativa e repetições valem mais que um único ms. Se o ganho fica abaixo do ruído, manter a versão mais simples. Integrações/worker/modelo novo permanecem fora do gate automático.

## Ordem recomendada para alterações futuras

1. Medir **H01/H02/H03** no bootstrap e caso de linha longa com watchdog, além de writer hold/latência concorrente **H09/H11**. Esses resultados distinguem repetição evitável de limite estrutural.
2. Implementar, em issue/PR próprios se autorizados: **H01** cache de hash por path/rodada; **H02** `countTokens` exato; **H03** short-circuit da quota/reuso de contagem; **H06** canonical única e replay antes de Git. Cada alteração isolada permite atribuir o ganho sem trocar quatro variáveis ao mesmo tempo.
3. Depois do perfil, avaliar **H04** materialização tardia de body e **H05** snapshot por streaming byte-idêntico. Exigir leitura consistente entre queries e igualdade de hash Unicode. Não diminuir pool/ranking para facilitar aprovação de benchmark.
4. Só com evidência de escala/múltiplos harnesses: índices de estado durável **H08**, cold import/painel **H12**, bounded reader/transport **H10**, executor/transaction staging **H09/H11**. São trabalhos com riscos de migração/concorrência/protocolo, não “micro” por contagem de linhas.

**Itens que não entram como atalho:** cache de frescor por stat/TTL; `git diff/status` para supor mudança; coalescer bootstrap/index/checkpoint pelo `SingleFlight`; expirar idempotency sem novo contrato; diminuir FULL; fracionar commit por arquivo; limitar pool alterando recall; tokenizer aproximado; atribuir saved tokens a billing; ativar Laya/GPU/desktop/browser/remote provider para provar performance do núcleo. O host continua concedendo escopo, todas as integrações continuam opt-in, e checkpoint/CAS/idempotência continuam critérios de correção antes de qualquer ganho de tempo.

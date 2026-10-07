# 16. Extensão distribuída com quotas escrow

## 16.1. Autoridade e particionamento

No perfil de equipe, particionar por projeto/organização e definir um dono de autoridade por shard. Réplicas de leitura recebem políticas e snapshots com revisão. Escritas críticas atravessam a autoridade ou um consenso apropriado; conexões entre regiões não são substituídas por relógios físicos sincronizados “o suficiente”.

Uma operação sobre vários shards precisa de um contrato de atomicidade explícito. A primeira versão distribuída deve evitar transações cross-project. Agregar resultados de leitura não implica autorização para escrever em todos os projetos participantes.

## 16.2. Escrow para teto global

Quotas locais independentes com limite L permitem que N regiões aceitem até N*L antes de convergir. Para um teto global estrito sem consulta remota por operação, repartir direitos disjuntos `r_i`, garantindo `sum(r_i)<=L`. Cada região gasta somente seus direitos e precisa de transferência controlada para ampliar sua cota.

O bounded counter de Balegas e colaboradores adapta ideias de escrow para invariantes numéricas em bases eventualmente consistentes. Isso exige metadados e transições apropriados; um contador CRDT comum não basta. [S37]

Direitos de uma região particionada não podem ser concedidos novamente apenas porque ela deixou de responder. Ela pode continuar gastando os direitos antigos. Recuperação exige prova de que não os utilizará, fencing efetivo ou reconciliação que preserve a soma. Disponibilidade local melhora dentro dos direitos pré-alocados; a transferência continua podendo exigir coordenação.

## 16.3. Failover de autoridade

Cada liderança recebe termo/geração persistente. Publicações carregam o termo; destinos rejeitam líderes antigos. Um número aleatório não fornece ordem de fencing. Restaurar backup não pode reduzir epoch de autorização e ressuscitar grants revogados sem um procedimento de recuperação explícito.

A disponibilidade de dados não implica disponibilidade de autorização. Sob partição, a política estrita recusa ações sensíveis sem frescor verificável. Um modo com bounded staleness precisa de outro nome e outro SLA; não pode continuar sendo chamado de revogação imediata.

# 17. Cenários de falha que devem virar gates

| Falha | Resultado exigido | Evidência a produzir |
|---|---|---|
| Crash antes do COMMIT | Nenhum saldo/evento parcialmente confirmado | Interrupção de processo e leitura após restart |
| Crash depois do COMMIT, antes de responder | Estado e evento preservados; replay idempotente | Segundo processo repete operation_id |
| Outbox indisponível | Mutação crítica não confirma sem evento | Injeção de falha transacional |
| Revogação durante inferência | Resultado não cruza publicação sob grant antigo | Interleavings e teste de publicação real |
| Worker não responde | Capacidade não é liberada ficticiamente | Processo travado, kill e fence de geração |
| Saída sem newline/JSON válido | Frame limitado e erro protocolar | Produtor de falhas, sem modelo fictício |
| Disco cheio | Mutação falha; leitura permitida só conforme política | Fault injection de filesystem, ainda a implementar |
| Índice antigo termina depois do novo | Não é promovido | Duas gerações com ordem invertida |
| Clock de parede retrocede | Não estende lease/rate limit | Relógio de teste e retomada após suspensão |
| Evento de invalidação perdido | Detectar lacuna e reconciliar | Stream com offsets e falhas controladas |
| Partição regional | Não duplicar direitos escrow | Modelo de duas autoridades e recuperação |
| Telemetria congestionada | Diagnóstico degrada, auditoria crítica permanece | Saturação por bytes com contadores de drops |
| Perfil de modelo alterado | Não reutilizar decisão/calibração incompatível | Hash/revisão/shape diferentes |
| Cache com entrada de outro projeto | Recusa antes da leitura/entrega | Testes negativos de escopo |

Os testes desta entrega cobrem apenas a parcela declarada no relatório. A matriz é o contrato do roadmap, não uma lista de verificações já concluídas.

# 18. Protocolo de avaliação científica e performance

## 18.1. Comparações independentes

Congelar uma baseline: versão do BBrainX, commit do corpus, hardware, SO, Node/Python, pesos, tokenizer, precisão, provider e workload. Comparar separadamente: cache exato; daemon compartilhado; mudança de IPC; política de admissão; tokenização; Laya; redução de contexto. Não alterar tudo e atribuir o ganho a um único componente.

Cada experimento possui pergunta, hipótese, métrica primária e critério de aceitação definidos antes da execução. A literatura de métodos formais na AWS reforça a utilidade de modelar estados/falhas antes de depender apenas de testes de caminho feliz. A inspiração não equivale a dizer que este laboratório recebeu a mesma garantia de um sistema formalmente verificado em produção. [S36]

## 18.2. Camadas de benchmark

**Micro:** hash, parse, serialização, lookup, contador, tokenização; input e tamanho fixados.  
**IPC:** ponta a ponta com framing, cópia, filas e resposta; mesma semântica de segurança.  
**Modelo:** load, warmup, encoder/head, validação e tokens; sincronizar o dispositivo antes de atribuir tempo de execução.  
**Agente:** tarefa aceita com testes/revisão; inclui releituras, retries, ferramentas e troca de harness.

Reportar p50/p95/p99, throughput admitido/concluído, erros e recusas. Uma amostra de dez chamadas não sustenta uma conclusão robusta sobre p99. Usar carga aberta para medir filas e evitar coordinated omission, além de um cenário de sessão real para a experiência observada.

Rodar perfis frio/quente e em bateria/energia quando o Mac for o alvo. Identificar interferência de compilação, aquecimento térmico, cache de filesystem, modelos concorrentes e downloads. Fazer warmup fora da amostra e descrevê-lo; não esconder cold start do relatório de produto.

## 18.3. SLOs versus objetivos experimentais

“Sub-3 ms” pode ser uma meta de um caminho especificado: por exemplo, metadados residentes, payload pequeno, sem inferência, sem acesso remoto. Não pode cobrir ingestão de documento, cold start, recuperação de disco, GPU e tarefa completa sem evidência.

O SLO deve nomear início/fim do timer, distribuição de tamanho, concorrência, hardware, percentile e taxa de erros. Recusar metade dos pedidos e medir só os restantes não demonstra melhoria sem reportar a queda de cobertura.

Dean e Barroso discutem a relevância das caudas em serviços de larga escala. Aplicação ao BBrainX: cuidar de contenção, fan-out, pausa do runtime e percentis, não apenas acelerar a função isolada. [S35]

## 18.4. Qualidade e não inferioridade

A economia exige qualidade preservada. Usar tarefas por repositório com split independente e critérios de aceitação observáveis. Avaliar referências obsoletas, perda de restrições, sucesso de patch, falhas de teste e número de retomadas necessárias.

Um gate concreto pode exigir nenhum bypass de autorização nos casos adversariais, não inferioridade de sucesso de tarefa dentro da margem pré-registrada e redução de tempo/custo com intervalo de confiança. A margem não deve ser escolhida depois de ver o resultado. Não converter hit rate em dinheiro economizado sem uso/cobrança real.

# 19. Literatura convertida em mecanismos, não decoração

| Trabalho/autor | Questão técnica | Mecanismo proposto | Limite da transferência |
|---|---|---|---|
| Zanzibar — Pang e colaboradores | ACL e conteúdo mudam em paralelo | Revisões e ordem causal na liberação | Não copiamos a escala ou a infraestrutura Google |
| Hazard pointers — Maged Michael | Reutilização segura de memória | Avaliar SMR provado para eventual núcleo nativo | Não autoriza `unsafe Sync` em protocolo incompleto |
| EBR — Trevor Brown | Leitores parados e reclamation | Incluir crash/stall no modelo | Processo remoto acrescenta hipóteses |
| Epochs Too Epic — Kim/Brown/Singh | Batch free causa picos | Manutenção/reclamation amortizadas | Precisa de perfil de alocação real |
| Bounded counters — Balegas e colaboradores | Teto global com pouca coordenação | Direitos escrow disjuntos | Não duplica direitos durante failover |
| TinyLFU — Einziger/Friedman/Manes | Evitar poluição de cache | Admissão por frequência observada | Frequência não garante validade |
| S3-FIFO — Yang e colaboradores | Custo de manutenção do cache | Experimentar filas S/M/G | Resultado de trace não é universal |
| Tail at Scale — Dean/Barroso | Cauda domina fan-out | Medir fila, p99 e carga aberta | Não reduzir tudo à média |
| AWS — Brooker e colaboradores | Retry amplia incidentes | Budget de retry, jitter e idempotência | Mutação desconhecida não é retry seguro |
| Guo e colaboradores | Confiança neural descalibrada | Holdout, temperatura e risco seletivo | Calibração não substitui política de acesso |
| Newcombe e colaboradores | Bugs de protocolo escapam do happy path | Estados finitos e fault injection | Modelo precisa corresponder à implementação |

As referências são [S31]–[S44]. Não extraí constantes de calibração ou metas de latência dos títulos desses trabalhos. A notoriedade do autor não substitui os pressupostos experimentais.

# 20. Licenças, supply chain e adoção dos cinco ecossistemas

A proposta reutiliza princípios e contratos, não incorpora cinco codebases ao núcleo. Copiar código exige preservar licença e atribuição por arquivo. Infisical e SigNoz distinguem áreas de licença aberta de exceções enterprise; Unkey possui AGPL e exceções por componente. Verificar o caminho exato que será distribuído, não apenas o badge da raiz. [S10][S18][S22]

Um checksum confirma correspondência com um digest confiável; não demonstra que a origem é legítima nem que o software é seguro. Fixar versões, origem, lockfiles e artefatos; assinatura/atestado quando disponíveis. Um install deve ser reversível, sem copiar credenciais nativas, desabilitar proteções do SO ou ativar egress remoto para “fazer funcionar”.

No BBrainX, a seleção inicial é: técnicas de autenticação/autorização SuperTokens; integração de segredos Infisical opcional; padrões de reserva/workflow Medusa; instrumentação OTel compatível com SigNoz; rate limiting e cache inspirados em análise de Unkey. Nenhum desses serviços é requisito do caminho lexical local.

# 21. Plano de integração sem regressão da base

**P0 — correção:** concluir a validação integral do patch X99 anterior no runtime suportado; não substituir o núcleo pelo Rust A01. Revisar logs, limites de frame, lifecycle de worker, revalidação e memória obrigatória.

**P1 — autoridade local:** daemon por usuário, identidade de workspace/tarefa, revisão comum e um worker Laya por perfil. Demonstrar dois harnesses consultando e retomando a mesma tarefa sem duplicar instâncias de modelo.

**P2 — governança de recursos:** admissão GCRA por classe, semáforos reais, ledger de reserva, outbox e reconciliação. Conectar o laboratório a testes de integração sem reaproveitar suas fixtures como prova de operação produtiva.

**P3 — desempenho:** perfil por fase, otimizações incrementais, cache de conteúdo, prefixos estáveis, tokenização e corpus independente. Só experimentar mmap nativo quando a cópia IPC for parcela relevante medida.

**P4 — equipe e egress:** autenticação remota, secrets broker e direitos escrow quando necessários. Garantias estritas e bounded-stale são perfis distintos. SigNoz/ClickHouse são consumidores opcionais de telemetria, não autoridade de memória.

**P5 — lançamento:** publicar código, metodologia, testes, limites e evidências vinculadas a commits. A comunidade precisa conseguir reproduzir uma falha e validar a correção, não apenas ver um contador de ms animado. Ranking de estrelas não é critério de correção nem resultado prometido.

# 22. O laboratório incluído e sua reprodução

Arquivos:

```text
verification/protocol_checks.py   enumeradores, GCRA e ledger SQLite de laboratório
verification/test_protocol.py    35 verificações
verification/verify_attachment.py confirmação dos trechos auditados e hash do anexo
sources.json                     registro das fontes
REFERENCIAS.md                   referências legíveis
evidence/verification.json       ambiente, resultados e limites
evidence/tests.log               saída do teste
evidence/analytical_report.json  contraprovas e cálculos
```

Com Python 3.11+ que inclua SQLite com WAL/RETURNING:

```sh
cd verification
python3 test_protocol.py
python3 protocol_checks.py
```

O executado nesta entrega foi Python 3.13.5 e SQLite 3.46.1 em Linux x86_64. O código cria bancos em diretórios temporários; os testes controlam e encerram seus próprios processos. Não lê segredos, não altera projetos existentes, não instala dependências e não faz rede.

Resultados observados: 35 aprovados, zero falhas, zero erros, zero pulados. O tempo de execução da suíte é apenas duração dos testes e não aparece como benchmark de API ou modelo. Há 20 interleavings de escritores com 18 violações do modelo original; quatro de revogação com duas liberações indevidas no modelo sem guarda; zero no modelo com guarda atômica; 5.670 histórias GCRA comparadas a token bucket racional.

Os testes reais de SQLite incluem dois processos disputando orçamento, operação idempotente repetida entre processos, falha de outbox que reverte a transação, kill antes/depois de COMMIT, reserva preservada em estado desconhecido, liquidação idempotente e fence contra escritor antigo. `SIGKILL` de processo não simula falha de energia, firmware de disco ou perda de writes confirmados pelo hardware.

Não executado: compilação do Rust anexado, ONNX/CUDA/TensorRT/CoreML, Laya real, benchmarks dos cinco produtos, integração desta proposta com BBrainX, Mac/Windows nativos e publicação GitHub. O laboratório não prova o modelo de memória ARM nem todos os schedules possíveis de uma implementação futura.

# 23. Decisão de arquitetura

**Preservar a autoridade local e o contexto verificável. Incorporar controle de recursos e invalidação com semântica precisa. Usar Laya como decisão seletiva sob política independente.** Os mecanismos de alto desempenho ficam subordinados a essas propriedades.

A versão tecnicamente defensável não precisa de um postulado “Einstein-Laya”. Ela precisa de uma especificação que diga onde cada operação lineariza, qual estado pode estar obsoleto, como um custo é reservado, como um processo antigo é impedido de publicar e o que acontece quando o sistema não consegue comprovar a validade do próximo passo.

## Referências e material de origem

Todas as referências Sxx estão em `REFERENCIAS.md` e `sources.json`. A01 é o anexo enviado nesta conversa; seu hash e os pontos identificados ficam em `evidence/attachment-audit.json`. Nenhum texto integral de projeto de terceiro, peso neural, credencial ou arquivo de fonte tipográfica é redistribuído neste kit.

[S01]: https://github.com/oalexandrebelo/BBrainX/tree/a9636e9402e3fa673ae05b3489202da1048aef5e
[S02]: https://github.com/oalexandrebelo/BBrainX/blob/a9636e9402e3fa673ae05b3489202da1048aef5e/src/laya.mjs
[S03]: https://supertokens.com/docs/post-authentication/session-management/advanced-workflows/access-token-blacklisting
[S04]: https://supertokens.com/docs/additional-verification/session-verification/protect-api-routes
[S05]: https://supertokens.com/docs/additional-verification/session-verification/with-websocket
[S06]: https://github.com/supertokens/supertokens-core/blob/master/src/main/java/io/supertokens/Main.java
[S07]: https://infisical.com/docs/integrations/platforms/infisical-agent
[S08]: https://raw.githubusercontent.com/Infisical/agent-vault/main/README.md
[S09]: https://infisical.com/docs/documentation/getting-started/concepts/internals
[S10]: https://raw.githubusercontent.com/Infisical/infisical/main/LICENSE
[S11]: https://docs.medusajs.com/resources/infrastructure-modules/locking
[S12]: https://docs.medusajs.com/learn/fundamentals/workflows/compensation-function
[S13]: https://docs.medusajs.com/resources/infrastructure-modules/caching
[S14]: https://github.com/medusajs/medusa
[S15]: https://github.com/SigNoz/signoz
[S16]: https://signoz.io/docs/traces-management/guides/tail-sampling/
[S17]: https://raw.githubusercontent.com/open-telemetry/opentelemetry-collector-contrib/main/processor/tailsamplingprocessor/README.md
[S18]: https://raw.githubusercontent.com/SigNoz/signoz/main/LICENSE
[S19]: https://github.com/unkeyed/unkey/blob/f6180ba4e045839872d72d6765b74032f3601ee4/internal/services/ratelimit/ratelimit.go
[S20]: https://github.com/unkeyed/unkey
[S21]: https://www.unkey.com/docs/llms.txt
[S22]: https://raw.githubusercontent.com/unkeyed/unkey/main/LICENSE
[S23]: https://raw.githubusercontent.com/NandhaKishorM/laya/main/laya-ts/README.md
[S24]: https://raw.githubusercontent.com/receptron/laya/main/src/laya.ts
[S25]: https://onnxruntime.ai/docs/execution-providers/TensorRT-ExecutionProvider.html
[S26]: https://onnxruntime.ai/docs/execution-providers/CoreML-ExecutionProvider.html
[S27]: https://docs.kernel.org/core-api/circular-buffers.html
[S28]: https://docs.rs/crossbeam-epoch/latest/crossbeam_epoch/
[S29]: https://docs.rs/memmap2/latest/memmap2/struct.MmapOptions.html
[S30]: https://www.rfc-editor.org/rfc/rfc1950
[S31]: https://research.google/pubs/zanzibar-googles-consistent-global-authorization-system/
[S32]: https://research.ibm.com/publications/hazard-pointers-safe-memory-reclamation-for-lock-free-objects
[S33]: https://arxiv.org/abs/1712.01044
[S34]: https://arxiv.org/abs/2401.11347
[S35]: https://research.google/pubs/the-tail-at-scale/
[S36]: https://www.amazon.science/publications/how-amazon-web-services-uses-formal-methods
[S37]: https://arxiv.org/abs/1503.09052
[S38]: https://arxiv.org/abs/1512.00727
[S39]: https://github.com/Thesys-lab/sosp23-s3fifo
[S40]: https://blog.junchengyang.com/system/cache/2023/08/01/s3fifo
[S41]: https://github.com/brandur/redis-cell
[S42]: https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/
[S43]: https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html
[S44]: https://arxiv.org/abs/1706.04599
[S45]: https://libsodium.gitbook.io/doc/secret-key_cryptography/aead/chacha20-poly1305/xchacha20-poly1305_construction

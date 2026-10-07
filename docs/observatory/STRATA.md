# Strata: técnicas aproveitáveis sem converter o BBrainX em servidor de 125B

**Código lido:** `Niko1221/Strata@82f46a8c8f475f001ad76d92f58f4a4f8ffb0253`, de 6 de outubro de 2026. Leitura de README, arquitetura, detalhes, adapter de usage e ensaios de paridade. Não instalamos o runtime, baixamos pesos, executamos kernels nem reproduzimos os números do mantenedor. [R05–R09]

## 1. Encaixe por hardware

Strata distribui a execução de um modelo MoE grande entre GPU, RAM, CPU e SSD. Seu README exige normalmente Windows/Linux, pelo menos 32 GB de RAM e GPU dedicada com 12 GB de VRAM; perfis comunitários possuem condições diferentes. O carregamento volumoso de pesos é reconhecido como capaz de prejudicar temporariamente a responsividade. [R05]

Isso o coloca como backend generativo opcional de HIGH/PRO/MAX a avaliar, não como dependência MEDIUM macOS/16 GiB. A base BBrainX e Laya possuem outro recorte. Um normalizador de recibos Strata não significa que o BBrainX agora instala ou administra esse engine. A meta de não comprometer a estação tem precedência sobre a possibilidade de encaixar o maior modelo.

O código é MIT com componentes e modelos de licenças próprias. Esta rodada não copia implementações nem artefatos de modelo. Transformar a técnica em requisito, comparar o custo e escrever um adapter próprio é diferente de incorporar o engine inteiro.

## 2. Hierarquia de memória orientada ao custo de miss

No desenho documentado, experts muito usados ficam na GPU; outros são computados na CPU a partir de RAM, com trabalho concorrente onde possível. Tabelas específicas ficam em SSD. A residência adapta-se ao uso. Esse cache é de pesos/experts, não de respostas nem da memória de decisões do usuário. [R06]

A aplicação proposta no BBrainX é uma hierarquia distinta: políticas/checkpoints pequenos e índices quentes em memória, estado durável no SQLite, artefatos imutáveis grandes no disco. A admissão de uma entrada considera custo de recomputação, frequência e tamanho, além de validade. Uma entrada inválida não ganha elegibilidade por ser popular.

Não compartilhar um cache de contexto entre projetos somente por hash. O armazenamento físico pode deduplicar conteúdo em um domínio autorizado; cada recuperação ainda precisa comprovar identidade, escopo e revisão. Compartilhamento por conteúdo é oportunidade de armazenamento, não uma concessão de acesso.

A seleção de política LRU/FIFO/frequência deve usar rastros sanitizados. Sem rastros, uma heurística de hotness sofisticada pode competir por CPU e RAM com a própria busca que pretendia acelerar.

## 3. Conversation parking: o estado completo é maior que o KV óbvio

Strata conserva e restaura conversas para alternância entre clientes. O ensaio de paridade registra fingerprints de múltiplos componentes internos, não apenas um hash de mensagens. O teste exige evidência de restauração e saída correspondente, com configuração controlada. [R08]

Para o BBrainX, há dois objetos diferentes. O checkpoint portável do projeto é estado de aplicação (objetivo, requisitos, fontes, próxima ação). O snapshot de inferência pertence a um modelo/runtime. Este último não pode ser transportado de um modelo a outro como se fosse o primeiro.

O melhor teste futuro para o daemon compartilhado é A → B → A: executar A sem interrupção como baseline; intercalar B e restaurar A no candidato; verificar identidade, fontes, revisão e, quando o backend oferecer contrato determinístico, tokens/estado. Incluir expulsão por bytes, slots e pressão física como cenários distintos. Não contar um miss correto como evidência de que houve restauração.

As sugestões documentadas de múltiplos GiB para estacionar conversas não cabem automaticamente no orçamento total MEDIUM do BBrainX. O cache deve ser admitido no orçamento do grupo de processos; a política de manter várias conversas precisa competir explicitamente com memória da IDE e do usuário.

## 4. Ensaios de pressão que demonstram o caminho exercitado

O arquivo `tools/conversation_cache_parity.py` é especialmente útil. O teste verifica que snapshots cabem isoladamente, não cabem juntos, e que a expulsão realmente ocorreu. Diferencia exceder o orçamento de cache de ser recusado por memória física insuficiente. Requer metadados completos e encerra em erro quando faltam. Executa engines privados sequencialmente; dry-run é o padrão. [R08]

Esse método é transferível diretamente à disciplina de testes: cada cenário precisa provar sua precondição. Um teste de cache que nunca produz hit não testa reuso. Um teste de memória cheia com byte budget folgado pode testar apenas slots. Um teste que termina cedo não comprova cancelamento de kernel.

No Observatory, adotamos essa postura para metadados: dados desconhecidos impedem um percentual total; a janela truncada impede comparação pareada; recibos duplicados não viram duas chamadas; custo fornecido e estimado ficam em trilhas diferentes. Não afirmamos que os testes de inferência Strata foram executados como parte dessa rodada.

## 5. Draft-and-verify não é executar uma ação especulativa

Strata documenta drafting MTP e prompt lookup em condições nas quais a aceitação compensa o custo. São mecanismos de geração de tokens verificados pelo modelo alvo. Isso não concede licença para disparar uma ferramenta externa de um ramo ainda não escolhido. [R06]

No BBrainX, especulação segura inicialmente se limita a operações de leitura idempotentes, autorizadas, com orçamento e invalidação: pré-buscar chunks prováveis, por exemplo. Não especular deploy, envio de e-mail, migração ou modificação de permissão. O benefício precisa superar trabalho desperdiçado e pressão de cache.

Laya encoder/head não possui o mesmo loop autorregressivo que o gerador Strata. Sua otimização deve focar estado selecionado, residência do worker, duplicatas exatas e batching controlado. Importar o nome “speculative decoding” não acrescenta esse mecanismo ao encoder.

## 6. Prefill, decode e I/O têm perfis diferentes

O engine documenta prefill em blocos e sobreposição de transferência de experts com trabalho de camada. Decode usa outras características de latência. [R06–R07]

A analogia útil é separar indexação pesada e operações interativas. O futuro indexador do BBrainX deve produzir uma nova geração fora do event loop interativo e publicá-la atomicamente. Não manter transação de escrita enquanto espera disco, rede ou modelo. O Observatory não implementa esse worker; ele evita polling e usa leituras delimitadas para não adicionar um fluxo constante de consultas.

A vazão de prefill de um modelo não é o tempo até o primeiro token da aplicação. O relatório deve incluir fila, tokenização, preparação, kernel, transporte e tempo de renderização quando pertinente. Por isso não transplantamos as tabelas de tokens/s do README como metas do BBrainX.

## 7. Quantização: needle test e qualidade da tarefa são testes diferentes

Os detalhes do Strata registram que uma opção de KV mais agressiva pode passar testes de needle e ainda piorar perplexidade em documentos longos. Também registram diferenças numéricas conforme kernel, residência CPU/GPU e estado de cache. [R07]

A lição é abandonar o slogan genérico de “mesma precisão” antes de definir a métrica. Um teste de recuperação literal não cobre planejamento multiarquivo ou manutenção de requisitos. Greedy/temperatura zero também não garante paridade bit a bit entre todos os backends, precisões e schedules.

O candidato de quantização Laya deve ser comparado com seu checkpoint/tokenizer exato, mesmos critérios e ordem, domínio holdout e telemetria de truncamento. Aceitação mede cobertura e risco seletivo além de acurácia média. O controlador não altera automaticamente a precisão apenas porque há pouca memória; primeiro recusa ou degrada o trabalho opcional segundo um contrato claro.

## 8. Parser de ferramentas: exemplos não são ordens

O commit fixado corrige detecção de tool calls em exemplos de código e spans inline. O estado de parser atravessa chunks do stream, e a prova compara divisões diferentes da mesma saída. [R09]

Esse é um teste metamórfico forte para qualquer adapter de SSE/NDJSON: interpretar a mensagem inteira ou qualquer fragmentação válida deve produzir a mesma sequência de eventos. Opener dentro de uma citação/código permanece texto; evento incompleto não é sucesso; JSON inválido não dispara mutação.

O Observatory recebe somente usage terminal consolidado e não interpreta conteúdo de ferramentas. Assim, ele não cria outro parser textual de comandos nem tenta “recuperar” tool calls da resposta. Um adapter de captura em streaming é trabalho posterior e deve incluir esses testes antes de entrar no runtime.

## 9. Integração de dados realmente adicionada

O Strata expõe contadores de reuso no shape OpenAI para `/v1/responses` e chat. Acrescentamos `strata-responses` e `strata-chat` ao normalizador, com identidade `strata-local`. Os testes verificam a leitura de cache dentro da entrada e impedem aplicar a tarifa OpenAI a um alias local. [R10]

A inexistência de campo de criação de cache permanece desconhecida. Não fabricamos preço local nem somamos tokens de drafting como tokens finais sem documentação do endpoint. Esta integração é de **formato de metadados importados**; não é captura automática, proxy, instalação de engine ou leitura de seus logs particulares.

## 10. Sequência de adoção proposta

1. Adotar disciplina de contagem, paridade e pressão agora; normalizador de recibos está na branch.
2. Construir benchmark A/B/A para o futuro worker compartilhado BBrainX, começando pelo estado de aplicação.
3. Instrumentar residência e custos por estágio antes de escolher política de cache sofisticada.
4. Avaliar Strata numa máquina HIGH/PRO suportada e isolada, usando modelos e licenças explicitamente aprovados.
5. Avaliar backend macOS separadamente; CUDA/HIP não provam Metal/MLX.
6. Manter o serviço de memória utilizável quando o engine generativo está ausente, ocupado ou indisponível.

Critério de aceitação: tarefa aceita, estado correto e impacto limitado na estação. Um screenshot agradável gerado pelo modelo ou uma taxa máxima de tokens/s não substitui esse experimento.

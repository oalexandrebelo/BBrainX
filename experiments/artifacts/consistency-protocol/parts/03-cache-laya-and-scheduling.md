# 10. Invalidação em grafo sem tempestade de eventos

## 10.1. Grafo de dependência, não cascata cega

Os nós são objetos versionados; as arestas indicam derivação. Um pacote pode depender de um documento, de um checkpoint e de uma política. O índice de dependências permite identificar candidatos à invalidação, mas a verificação de revisões na leitura é o mecanismo final de validade.

Uma alteração publica `resource_id`, `new_version`, `sequence`, `reason` e `scope`. Não publica plaintext. Assinantes autenticados mantêm offset e época do stream. A sequência tem um domínio definido: por shard/projeto ou global, não “número crescente” sem indicar quem o produz.

Se um assinante observa uma lacuna, perde o cursor ou reconecta com época incompatível, invalida seu cache de derivados ou reconcilia a base de revisões. Não presume que “não recebi revogação” significa autorização válida.

## 10.2. Coalescência e recomputação

Para cem atualizações do mesmo recurso antes de processá-las, pode bastar uma tarefa de reconciliar sua versão atual. Isso reduz trabalho. Porém, um evento de revogação não pode ser engolido por uma atualização que reintroduza a versão antiga. A máquina de estados e a comparação de versão prevalecem sobre arrival order.

Single-flight deve incluir principal/ACL, snapshot, consulta e política. Dois consumidores de projetos distintos não compartilham uma resposta apenas por hash semelhante. Ao cancelar um assinante, remover sua espera; ao cancelar todos, sinalizar o produtor. A vaga de execução só retorna quando o trabalho termina ou o processo é encerrado e confirmado.

## 10.3. Reconstrução depois de crash

Outbox usa entrega pelo menos uma vez. O consumidor registra evento processado ou aplica uma transição idempotente por versão. A confirmação de consumo não pode anteceder a publicação do índice correspondente.

Índices são construídos numa geração privada e promovidos por compare-and-swap lógico da revisão esperada. Um worker antigo não pode promover seu índice depois que um novo processo terminou uma geração mais recente. Manter anterior para rollback operacional não permite retorná-la como atual sem sinalização.

# 11. Cache rápido com limites reais

## 11.1. Validade antes de política de substituição

TinyLFU estuda admissão por frequência; S3-FIFO usa três filas para filtrar objetos de uso único e reduzir custo de atualização. Esses trabalhos fornecem alternativas à LRU, mas não resolvem revogação, escopo ou frescor. Resultados em workloads publicados não são resultados do BBrainX. [S38][S39][S40]

Para o cache pequeno do perfil local, iniciar com política simples instrumentada. Uma troca é autorizada depois de replay da distribuição real de tamanhos e acessos, preservando os mesmos filtros de validade. Não instalar uma estrutura complexa somente porque venceu LRU em outro trace.

O valor de uma entrada pode ser estimado por `frequencia_estimada * custo_de_miss_evitado / bytes`. Isso é uma heurística de engenharia para seleção de candidatos, não prova de ótimo global. Custos de embeddings, preservação de segurança e invalidação continuam fora da autoridade desse score.

## 11.2. Limites em todas as dimensões

Uma especificação de cache precisa limitar entradas, bytes de chaves, bytes serializados de valores, número de waiters, bytes pendentes e custo de computação de miss. O limite de 2 MiB de JSON não limita heap/RSS a 2 MiB. A contabilização deve medir overhead e tempo de coleta.

A admissão rejeita objeto maior que a capacidade antes de mantê-lo no cache. Uma API que primeiro serializa um objeto ilimitado e depois verifica o tamanho não protege contra o pico da serialização. Limites de frame e schema precisam anteceder esse passo.

TTL serve a retenção e frescor de classes específicas. Ele não substitui revogação. Cache stale de decisão consultiva só pode ser usado quando o contrato diz explicitamente que o estado continua equivalente. Cache stale de autorização para ação sensível não é permitido no perfil estrito.

## 11.3. Cache stampede e expiração

Usar single-flight e refresh agendado com jitter para conteúdos que admitem renovação antecipada. Não estender permissão revogada com “grace period”. O worker que renova uma entrada carrega a versão esperada; a resposta tardia é descartada se outra revisão já venceu.

Implementar retry numa única camada, com limite global por operação. Backoff sem jitter sincroniza clientes. Jitter sem limite de tentativas apenas espalha uma sobrecarga infinita. A análise da AWS sobre retries e side effects é a referência aplicada a esse desenho. [S42]

## 11.4. Defesa contra envenenamento de cache

Resultados de Laya passam pela validação do contrato antes de armazenamento. Campos desconhecidos, distribuições não finitas, opção inexistente, contagem incorreta, truncamento e calibração incompatível recusam a entrada.

Nunca reutilizar a resposta da permissão de um principal em outro principal. Também não tratar “mesma string” como mesma finalidade. A chave lógica inclui versão de contrato e domínio da operação. Intercâmbio entre harnesses compartilha estado aprovado e evidências, não a confiança cega de um cliente em outro.

# 12. Laya: sistema de decisão seletivo, não sistema de autorização

## 12.1. Ordem de processamento

**Sistema determinístico:** tipos, tamanhos, identidade, autorização, snapshot, cache válido, regras explícitas, pré-condições e reservas.

**Laya:** escolha consultiva entre opções já permitidas, quando o workload foi avaliado. O modelo não pode reabrir uma ação proibida, liberar gasto sem saldo ou aprovar memória.

**Modelo generativo/humano:** tarefas que exigem geração ou avaliação que não foi reduzida corretamente a uma decisão curta. O fallback não ativa provedor externo sem consentimento e política de dados.

## 12.2. Contrato do artefato neural

Fixar código, pesos, tokenizer, formato do estado, ordem de perguntas/alternativas, maxLen, precisão, provider e calibração. Verificar na inicialização nomes e shapes das entradas/saídas. O adapter `receptron/laya` consultado usa entradas e saídas específicas, não o `safety_logit` presumido em A01. Um export customizado poderia ter outra cabeça, mas seu artefato e teste de paridade precisam existir. [S23][S24]

`CUDAExecutionProvider` não é `TensorRTExecutionProvider`. TensorRT é uma rota NVIDIA; CoreML é outro provider com requisitos próprios. Nenhum deles garante que todo grafo Laya rodará acelerado no Mac ou que não ocorrerá fallback parcial para CPU. [S25][S26]

## 12.3. Opções colapsadas são outra classe de truncamento

O README Laya TypeScript examinado documenta telemetria de truncamento de estado e de opções que se tornam indistinguíveis após tokenização/corte. Uma decisão pode ter estado íntegro, mas alternativas longas com prefixos iguais colapsarem no head. Isso deve causar abstenção ou reformulação, não confiança artificial. [S23]

O gate precisa avaliar tanto `state_tokens_dropped` quanto opções distintas/total, revisão de schema e distribuição. O adapter que não fornece o metadado devolve “desconhecido”, não false. Nunca preencher truncamento desconhecido com “não truncado” para obter hits.

## 12.4. Calibração e risco seletivo

A01 fornece A e B sem dados de fitting. Esses coeficientes não podem ser considerados válidos para o BBrainX. A literatura de calibração mostra por que confiança bruta não deve ser interpretada diretamente como probabilidade de acerto; métodos pós-processamento são avaliados em conjuntos específicos. [S44]

Separar treino, calibração e teste por repositório, tarefa e janela temporal. Métricas mínimas: cobertura das decisões aceitas, erro entre aceitas, log-loss/Brier quando aplicáveis, confiabilidade por estrato, taxa de abstenção, truncamento e sensibilidade à permutação de alternativas.

Zero erros observados não prova erro zero. Num modelo binomial independente e representativo, com zero erros em n decisões aceitas, o limite superior unilateral de 95% é `1 - 0,05^(1/n)`. Para que ele fique abaixo de 0,1%, são necessárias aproximadamente 2.995 decisões sem erro. Isso é cálculo sob hipóteses fortes, não garantia contra mudança de distribuição ou ataque.

Mesmo uma calibração perfeita de acerto não demonstra “ação segura”. Segurança inclui identidade, intenção, estado, destino e efeito; não é uma etiqueta aprendida que substitui esses controles.

## 12.5. Scheduling e batching

Usar um worker residente por perfil carregado, sob autoridade comum, em vez de um modelo por harness. O fluxo interativo tem admissão limitada. Indexação e treinamento não disputam a mesma fila sem prioridades explícitas.

Microbatching só agrega itens com checkpoint, tokenizer, schema/ordem, precisão e calibração compatíveis. A região de batch não mistura resultados entre projetos. Comprimentos similares reduzem padding: para atenção densa, o custo do batch aproximado com padding é proporcional a `B*Lmax²`, não à soma ideal de `Li²`.

No primeiro perfil, microbatching permanece desligado. Um experimento posterior pode limitar sua espera a 2 ms e comparar throughput, latência p99 e qualidade. Esse é um parâmetro proposto, não uma garantia de que o custo total será inferior a 3 ms.

Cancelamento depois da submissão à GPU pode não interromper o kernel. Marcar assinante cancelado não libera capacidade física enquanto execução continua. Encerrar um worker exige confirmar término e invalidar a geração; um callback tardio não pode satisfazer uma chamada do novo processo.

# 13. Shared memory e EBR: somente depois de justificar o risco

## 13.1. Transporte local padrão

Para o Mac, começar com daemon por usuário e Unix socket em diretório privado, com framing limitado e autenticação do peer. Windows recebe named pipes e ACL própria. Os adapters stdio mantêm MCP no formato que o cliente reconhece; um plugin nativo opcional pode negociar outra interface.

Verificar UID é apenas uma parte do modelo: não isola automaticamente clientes maliciosos sob o mesmo usuário. O servidor resolve projeto e capacidades a partir de configuração/grant do host, não da confiança no texto do pedido.

## 13.2. Onde mmap pode entrar

O candidato inicial é leitura de blobs grandes e imutáveis já autorizados, não estado mutável compartilhado. A referência contém hash, comprimento, versão e tipo. O consumidor valida o descritor e a leitura; não recebe ponteiros absolutos de outro processo.

Uma região read-only reduz certos riscos do consumidor, mas não apaga dados já lidos. Unlink de um objeto não necessariamente revoga mapeamentos já abertos. Dados secretos não devem ser distribuídos a todos os participantes só porque o sistema local possui permissões de arquivo.

O custo de cópia precisa ser medido antes da adoção: tamanho dos payloads, frequência, page faults, residência, pressão de memória e número de consumidores. Compartilhar páginas não elimina parse de textos, montagem de tokens ou cópia para formatos exigidos pelo backend.

## 13.3. Requisitos de uma fila nativa real

Uma fila MPMC exige algoritmo e prova/validação próprios: reserva de posição, sequência por slot, publicação, consumo, wrap-around, capacidade, tratamento de produtor morto e ordem de memória. Uma fila SPSC por peer mais um agregador serial é uma alternativa com invariantes menores.

EBR exige anúncio de leitores, regiões críticas, nós retirados e condição de coleta. Um leitor travado pode bloquear reclamation; removê-lo por timeout e reciclar memória ainda mapeada pode causar use-after-free. A literatura de hazard pointers e EBR trata precisamente esses trade-offs. [S28][S32][S33]

Interprocesso acrescenta morte sem cleanup, PID reutilizado, suspensão, remapeamento e propriedade do recurso. Um algoritmo seguro dentro de um processo não pode ser copiado sem revisar essas hipóteses. A documentação de memmap2 também exige atenção às condições de segurança do mapeamento. [S29]

## 13.4. Reclamation também produz latência

Coletar milhares de objetos de uma vez pode introduzir pausas no alocador. “É lock-free” não implica percentil de latência bounded nem ausência de picos ao liberar memória. O trabalho de Kim, Brown e Singh estuda exatamente o impacto de batch free no desempenho. [S34]

Usar coleta incremental e orçamentos de manutenção quando a medição justificar, preservando a regra de segurança de cada reclamation. Não executar coleta pesada, rotação de segredos e flush de telemetria no mesmo tick do loop interativo.

# 14. Micro-otimizações ordenadas por retorno e risco

## 14.1. Remover trabalho repetido

Prioridade 1: hash de um arquivo uma vez por montagem, statements preparados por conexão, schema compilado uma vez, reutilização de tokenizer/vocabulário e objetos imutáveis, busca incremental em vez de reindexação total. Medir antes/depois no mesmo corpus e estado de disco.

A validação não deve desaparecer: mover trabalho estável para inicialização e trabalho dependente do input para a admissão. Validar uma versão em cache não significa aceitar qualquer versão depois.

## 14.2. Reduzir alocação e fragmentação

Preferir armazenamento contíguo de vetores quando uma etapa realmente usar vetores binários; evitar um `Vec` alocado por candidato. Validar dimensão exata, finitude e capacidade antes de escrever. Separar metadados de payload quente quando isso reduzir tráfego de cache medido.

`count_ones` pode ser compilado para instruções adequadas ao alvo; sua presença não comprova AVX-512/NEON vetorizado nem desempenho equivalente. Instruções largas, downclock, bandwidth e tamanho do working set precisam ser avaliados no hardware efetivo.

Padding fixo de 64 bytes não demonstra eliminação universal de false sharing. Alinhamento, layout, granularidade de linha/coerência e acessos reais devem orientar a escolha. A aplicação não deve fixar core 0 como política padrão de notebook: isso pode concentrar trabalho e piorar caudas, energia e responsividade.

## 14.3. Evitar picos de manutenção

Jitter em refresh e reconciliação distribui carga. Manutenção tem budget de tempo e de bytes, para não bloquear queries. Filas separadas por classe evitam que treinamento ou ingestão documental monopolizem os mesmos recursos da leitura interativa.

Além de taxa de sucesso, medir event-loop delay, tempo de garbage collection, memória comprometida, page faults e quantidade de workers vivos. Vagas “liberadas” enquanto o processo antigo continua vivo são um vazamento de concorrência, não capacidade recuperada.

## 14.4. Modelo de fila explícito

Como exemplo analítico M/D/1, com chegadas Poisson e serviço determinístico de 8 ms, a capacidade nominal é 125 pedidos/s. A 100 pedidos/s, `rho=0,8` e:

\[
E[W_q]=\frac{\lambda S^2}{2(1-\rho)}=16\,ms
\]

O tempo médio total nesse modelo é 24 ms, embora o serviço isolado leve 8 ms. Não é benchmark de Laya. Serve para demonstrar por que uma inferência rápida pode coexistir com uma experiência lenta quando a admissão permite saturação.

Num serviço real, caudas de chegada e serviço podem ser mais pesadas. Usar histogramas e carga aberta; não esconder filas medindo somente o trecho que começa depois da admissão.

# 15. Perfil operacional inicial proposto

Os números abaixo são **limites de segurança e parâmetros experimentais**, não resultados de medição ou configurações já implementadas.

| Recurso | Limite inicial proposto | Motivo |
|---|---|---|
| Frame de entrada local | 1 MiB | Limitar memória antes de parse |
| Resposta/framing do worker | 2 MiB | Detectar corrupção ou verbosidade inesperada |
| Fila global | 32 pedidos e 8 MiB, o que ocorrer primeiro | Não transformar latência em consumo ilimitado |
| Fila por cliente | 8 pedidos | Impedir monopolização por um harness |
| Inferência por worker/perfil | Uma execução distinta em voo | Compatibilidade com worker serial; expansão mediante teste |
| Cache de decisão | 128 entradas e 2 MiB serializados | Perfil pequeno observável; RSS medido separadamente |
| TTL máximo inicial desse cache | 5 minutos | Retenção limitada; revisões continuam obrigatórias |
| Retry de montagem por revisão | Até três montagens completas | Limitar contenção e livelock |
| Microbatch | Desligado | Prioridade a latência e paridade na primeira fase |
| Provedores remotos | Nenhum habilitado por fallback implícito | Egress requer autorização explícita |

Perder uma conexão não transforma essas cotas em saldo livre. Um processo encerrado não deve ser substituído antes de concluir o ciclo de desligamento definido. Ao sair de suspensão, reconciliar relógios, geração e estado antes de aceitar inferências pendentes.

O `doctor` deve verificar capacidades e informar o observado: plataforma, arquitetura, memória, dependências, providers disponíveis e efetivamente usados, hashes de pesos e status do serviço. “Melhor cenário” exige benchmark comparável, não uma heurística que ativa a GPU por detectar a palavra Apple.


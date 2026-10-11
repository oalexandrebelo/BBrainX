## 5.5. Limite de isolamento

Um agente com shell irrestrito sob o mesmo usuário pode ter meios de ler arquivos, processos ou configurações acessíveis a esse usuário. Socket 0600 e Keychain não criam automaticamente isolamento contra todos esses poderes. O perfil com exigência forte precisa de sandbox, identidade distinta ou host separado, coerente com o alerta do Agent Vault. [S08]

Esconder a credencial não impede seu abuso por uma rota permitida: o proxy ainda precisa limitar métodos, alvos, payloads, custo e dados de resposta. Redação e detecção de PII complementam autorização; não a substituem.

# 6. Medusa v2: recursos de IA tratados como reservas, não como contadores decorativos

## 6.1. O mecanismo pertinente

Medusa possui módulos, providers de locking, workflows e compensação. O módulo de cache atual é distinto do cache legado e tem requisitos de versão/feature flag. Não assumir que “v2” significa que todo módulo é um microsserviço remoto ou que uma instalação já usa determinada política Redis. [S11][S12][S13][S14]

A transferência de técnica mais valiosa é o problema de estoque: dois compradores não podem reservar a última unidade. No BBrainX, “estoque” significa orçamento de provedor, slots de worker, memória de fila e direito de modificar determinada revisão.

## 6.2. Ledger de orçamento

O contrato proposto mantém valores inteiros em unidade monetária mínima escolhida ou unidades de quota verificáveis:

\[
B_{total}=B_{disponivel}+B_{reservado}+B_{consumido}
\]

Todos os termos são não negativos. A reserva deve preceder a chamada externa. Seu valor é uma cota conservadora verificável, incluindo input efetivo, máximo de output e cobrança de cache/rota aplicável. Se o provedor não oferece um limite confiável para uma classe de cobrança, a interface deve indicar que o teto não pode ser garantido, em vez de inventar reserva exata.

Uma operação tem ID único por projeto, fingerprint do pedido, montante reservado, estado e referência da eventual resposta do provedor. Repetição com mesmo ID/outro conteúdo é conflito. Repetição igual devolve o estado existente, não reserva novamente.

O laboratório usa SQL condicionado e uma transação para atualizar saldo, operação e outbox. Com limite 10 e duas reservas concorrentes de 7 em processos reais, uma é aceita e a outra recusada. Não há janela de “consultar saldo, depois decrementar” sem exclusão transacional.

## 6.3. Timeout e compensação

A sequência de estados proposta é:

```text
PROPOSED → RESERVED → STARTED → SETTLED
                       └──→ OUTCOME_UNKNOWN → RECONCILED/SETTLED
RESERVED → CANCELLED_BEFORE_START
```

Cancelamento antes de enviar pode liberar a reserva. Timeout depois de enviar deixa a operação desconhecida até reconciliação. O sistema não devolve saldo automaticamente e dispara uma segunda chamada que pode duplicar cobrança.

Compensação é um novo efeito que tenta reparar outro efeito. Ela não apaga tokens já faturados, e-mail enviado, publicação externa ou dado vazado. A documentação Medusa permite modelar compensações; não promete rollback ACID de toda dependência remota. [S12]

## 6.4. Fencing e versões

Um lock com TTL não impede um cliente pausado de voltar depois de o lease expirar. A escrita precisa carregar uma geração monotônica reconhecida pelo recurso protegido. Depois de aceitar a geração 12, o destino rejeita a geração 11. O teste do laboratório exercita essa condição no SQLite. [S43]

Fencing também não é universal por cabeçalho: se o serviço remoto ignora o token, nenhum isolamento foi criado. Nesse destino, usar idempotência nativa, controle condicional suportado, um único executor ou reconhecer a impossibilidade de execução concorrente segura naquele contrato.

## 6.5. Regras e DAGs

O planejamento de contexto pode ser representado como DAG de dependências: snapshot → índice → candidatos → seleção → pacote. A revisão de regras pertence à identidade do resultado. Mudança em uma regra invalida somente os descendentes que dependem dela.

Detectar ciclos na aprovação das regras, não em cada request. Compilar predicados de escopo e tipos uma vez por revisão, sem executar código arbitrário vindo de memória ou documento. Um grafo de dependência otimiza recomputação; não é a autoridade que aprova suas próprias regras.

# 7. SigNoz e OpenTelemetry: a observabilidade não pode causar o incidente

## 7.1. Uso que faz sentido

SigNoz organiza métricas, traces e logs com OpenTelemetry e ClickHouse. Para o BBrainX local, métricas internas e exportação opt-in são suficientes inicialmente. A stack completa é apropriada ao ambiente compartilhado que realmente a opere. Não adicionar ClickHouse como condição para executar uma consulta local. [S15][S16]

## 7.2. Duas filas, duas garantias

**Diagnóstico:** fila limitada por bytes e registros. Sob saturação, descartar/amostrar classes de baixa prioridade e incrementar contadores de perda. Nunca bloquear o event loop esperando rede de telemetria.

**Auditoria crítica:** operação de memória, autorização ou orçamento e seu evento na mesma transação de outbox. Falha de armazenamento obrigatório impede confirmar aquela mutação. Outbox não é uma garantia de exactly-once de ponta a ponta: consumers devem deduplicar por evento.

Um ring buffer é apropriado ao primeiro caso; não substitui o ledger do segundo. “Todos os logs no mesmo ring lock-free” mistura objetivos contraditórios.

## 7.3. Amostragem de cauda e consumo de memória

O processador tail sampling do OTel retém estado e decisões, lida com spans tardios e impõe limites. A documentação atual também expõe sharding, que distribui cotas de forma aproximada e pode alterar bursts agregados. Portanto, uma opção de paralelismo pode mudar semântica de limite, não apenas performance. [S17]

A estimativa de payload retido é:

\[
M\approx \lambda_{traces}\,W\,b_{medio}
\]

Para 2.000 traces/s, janela de 8 s e 4 KiB por trace, são **62,5 MiB de payload**, antes de maps, strings, índices, alocador e decision cache. Traces individualmente grandes precisam de cap próprio; limitar apenas o número de traces não limita os bytes.

Há uma inconsistência textual na seção de tuning do README consultado: ela agrupa aumentar `num_traces` e reduzir `decision_wait` como se ambos aumentassem memória. Em carga e tamanho médios constantes, reduzir o tempo de retenção reduz a ocupação esperada pela equação acima. Não transferir essa frase a uma regra automática de dimensionamento.

Spans de um mesmo trace devem alcançar uma instância compatível do sampler. Decisão antes de todos os spans chegarem não é conhecimento da totalidade. Cache de decisão reduz inconsistências em spans tardios, mas sua própria expiração precisa estar no modelo. [S16][S17]

## 7.4. Métricas sem viés operacional

Contadores de requests, recusas, tokens observáveis e custos são produzidos antes de sampling. Histogramas essenciais de latência também precisam de população explicitamente definida. Uma amostra que privilegia falhas ou lentidão não deve alimentar percentis apresentados como toda a carga.

Separar `provider_usage_observed`, `estimated_usage` e `unknown`. `trace_id`, `task_id` e query hash não entram como labels irrestritos de métricas. Reservar identificadores de alta cardinalidade para logs/traces sob política de retenção. Prompts, respostas, credenciais e trechos sensíveis não são atributos padrão.

## 7.5. ClickHouse e ingestão

No perfil de servidor, gravar em batches limitados por bytes, linhas e deadline. O tamanho ótimo não vem de um número mágico: medir taxa de ingestão, pressão de merge, latência aceitável e custo do flush. Um batch maior melhora amortização, mas aumenta memória e atraso de observação.

O desenho analítico usa atributos de baixa cardinalidade nas agregações: projeto autorizado, operação, backend, estado, faixa de tamanho, hit/miss e classe de erro. O banco de observabilidade não determina o saldo disponível nem a autorização atual.

# 8. Unkey: limites rápidos com semântica conhecida

## 8.1. Inspeção do código atual

O arquivo `internal/services/ratelimit/ratelimit.go` na revisão `f6180ba4e045839872d72d6765b74032f3601ee4` implementa contagem de janela deslizante aproximada com contribuições locais/regionais, hidratação da origem, CAS limitado e caminho de recusa. Seus comentários registram snapshots de outras regiões com atualização periódica. Isso não equivale a uma transação global linearizável a cada decisão. [S19]

A fórmula observada é aproximadamente `atual + anterior*(1-fracao_decorrida)`. Ela supõe uma distribuição temporal ao estimar a parte restante da janela anterior. Contenção local e consistência entre regiões são problemas diferentes.

O mesmo arquivo tem operação múltipla com incrementos especulativos e rollback se um limite falha, podendo produzir recusas conservadoras transitórias. Isso não deve ser transplantado como ledger financeiro sem análise de falhas, durabilidade e reconciliação. A leitura foi focal; não foi auditoria integral de Unkey.

## 8.2. Três controles independentes

**Rate limit:** quanto trabalho pode ser admitido por unidade de tempo.  
**Concurrency limit:** quanto trabalho está efetivamente vivo agora.  
**Budget:** quanto direito acumulado ainda existe para gastar.

Um token bucket não limita o número de operações presas; um semáforo não limita gasto total; um contador regional aproximado não garante teto financeiro global.

## 8.3. GCRA ponderado para admissão local

GCRA elimina a necessidade de uma rotina de drip periódica. O redis-cell é uma referência pública desse mecanismo, não uma dependência exigida nesta proposta. [S41]

Definir `T` como intervalo por unidade, `B` como capacidade total de burst, `c` como custo inteiro e `t` como tempo monotônico da autoridade:

\[
M=\max(TAT,t),\quad admissivel \iff M+cT\le t+BT
\]

Em aceitação, `TAT←M+cT`. Em recusa, preservar TAT e devolver o atraso mínimo. Rejeitar `c>B`, valores negativos, overflow ou configuração inválida. Nesta convenção, B é capacidade total; APIs que chamam um campo de `max_burst` podem ter outra contagem.

O laboratório compara a função GCRA com um token bucket independente usando aritmética racional: **5.670 sequências**, cada uma com quatro pedidos, sem divergências. Isso verifica aquela equivalência no domínio enumerado. Não implementa clock distribuído nem armazenamento concorrente da função pura.

## 8.4. Admissão multidimensional atômica

Para admitir um pedido, precisam caber simultaneamente: taxa do peer, taxa do projeto, bytes da fila, vaga de worker e eventual reserva de budget. Ordenar a verificação não basta se cada dimensão sofre commit separado.

No host local, a autoridade realiza a decisão como operação serial e persiste o que exigir durabilidade. No serviço distribuído, recursos financeiros exigem autoridade transacional ou quotas escrow. Não consumir limite de usuário e depois falhar no limite de projeto sem um contrato explícito de contabilização.

## 8.5. Bloom/Cuckoo: filtro de existência não concede acesso

Um filtro pode evitar consultas para IDs definitivamente ausentes na geração representada. Positivos exigem lookup real. False positive é aceitável como trabalho extra; não como autorização.

O Bloom filter estático não tem falsos negativos para os itens corretamente inseridos na sua geração. Um filtro desatualizado após criar uma chave pode rejeitar uma chave nova: é falha do protocolo de atualização. Portanto, a resposta negativa só pode ser definitiva quando a geração garante cobertura de todas as criações relevantes.

Para n itens e probabilidade alvo p, o dimensionamento clássico aproximado é `m=-n*ln(p)/(ln(2)^2)` bits e `k≈(m/n)*ln(2)` hashes. Esse custo precisa ser comparado à taxa de misses reais. O BBrainX não deve instalar um filtro probabilístico sobre meia dúzia de capabilities para parecer mais rápido. Não foi confirmado que os cinco produtos utilizam todos os filtros citados na mensagem do usuário.

# 9. Protocolo de memória inter-harness: versões que não podem ser confundidas

## 9.1. Identidade lógica

Um único `global_epoch` não pode representar simultaneamente memória, autorização, índice e processo. A proposta separa:

```text
project_id                 identidade lógica estável
workspace_id               checkout/worktree autorizado
task_id                    unidade de trabalho
snapshot_id                conteúdo examinado
memory_revision            conjunto governado de memórias
policy_revision            regras de operação/contexto
authz_revision             direitos atuais do principal no projeto
index_generation           conjunto pesquisável e configuração de recuperação
model_revision             pesos e arquitetura efetivos
tokenizer_revision         vocabulário e pré-processamento
calibration_revision       ajuste do workload
worker_generation          processo carregado e sua identidade operacional
operation_id / attempt_id  intenção idempotente e tentativa física
```

Um projeto pode compartilhar decisões entre workspaces. Já “o teste passou” pertence ao snapshot/ambiente exato. O ID de operação permite repetir a intenção sem duplicá-la; o ID de tentativa permite distinguir retries e eventos tardios. Não derivar autorização de uma string `project_id` enviada pelo modelo.

## 9.2. Revisões mínimas de cada cache

| Cache | Identidade pertinente | O que não garante |
|---|---|---|
| Parse e chunks | Escopo, hash de conteúdo, parser, opções | Referência semântica correta após mudar dependências |
| Embeddings | Hash, modelo, dimensão, normalização, autorização | Validade de um fato recuperado |
| Candidatos de busca | Consulta, projeto, índice, política, ACL | Imutabilidade do filesystem depois da busca |
| Pacote | Snapshot, task/checkpoint, memória, política, ACL, tokenizer, orçamento | Retenção do pacote no harness |
| Decisão Laya | Estado/perguntas exatos e ordenados, modelo, runtime, calibração, escopo | Permissão para executar a capacidade escolhida |
| Resultado de ferramenta | Operação de leitura, snapshot e dependências externas declaradas | Reexecução de efeito ou de teste em ambiente que mudou |
| KV/prompt cache | Contrato do servidor/provedor e prefixo compatível | Transporte de estado entre modelos incompatíveis |

Reutilizar parse de conteúdo inalterado é diferente de reutilizar o ranking final. Um arquivo novo pode introduzir candidato melhor sem modificar nenhum dos trechos retornados antes; por isso o cache de busca exige geração do índice, não apenas hashes do resultado antigo.

## 9.3. Máquina de estados de um pedido de contexto

```text
RECEIVED
  → FRAME_VALIDATED
  → AUTHENTICATED
  → ADMITTED
  → AUTHORIZED
  → SNAPSHOT_READ
  → RETRIEVED
  → OPTIONAL_DECISION
  → OUTPUT_VALIDATED
  → REVISIONS_RECHECKED
  → PUBLISHED
  → DELIVERED_OR_DISCONNECTED
```

A autorização acontece antes de recuperar fontes. A revalidação final acontece antes da publicação. O resultado intermediário não ganha o status de fato aprovado. Uma falha em qualquer etapa termina com erro explícito e reconcilia reservas.

Entre `SNAPSHOT_READ` e `REVISIONS_RECHECKED`, nenhuma transação de escrita fica aberta esperando inferência ou rede. Se o vetor de revisões mudou, descartar/recalcular o derivado. Permitir no máximo três montagens completas sob a mesma tentativa lógica; a quarta não existe: retorna conflito de revisão com indicação para nova leitura. Esse limite é uma escolha de protocolo, não um número medido ótimo.

O ponto de publicação grava identificador do pacote, revisões, evidências e evento no mesmo commit do domínio que confirme o resultado. A entrega de rede não é atomicamente transacionada com SQLite. O cliente pode perder a resposta depois do commit; a repetição por operation_id recupera o mesmo resultado ou informa sua validade, não inventa que a primeira tentativa falhou.

## 9.4. Conteúdo obrigatório e compactação

Objetivo, restrições aprovadas, bloqueios abertos e próximo passo não podem desaparecer para satisfazer uma métrica de tokens. O compilador recusa o orçamento insuficiente e apresenta o requisito faltante.

A compactação remove redundâncias ou substitui artefatos grandes por referências quando o cliente consegue recuperá-los. O hash não contém o texto para o modelo. Quando o harness reiniciou ou compactou sua própria sessão de forma opaca, entregar um bootstrap autossuficiente, não um delta que pressupõe memória ativa.

Distinguir bytes de transporte, tokens do pacote, tokens totais reportados pelo cliente e cobrança do provedor. Melhorar uma dessas métricas não demonstra melhora nas demais. Tokens em cache continuam fazendo parte do contexto processado sob o contrato do provedor; a redução substantiva vem de selecionar melhor o que precisa estar presente.

## 9.5. Revisão estável para aproveitar prefixos

Regras `always` aprovadas e contratos pertinentes podem ser serializados deterministicamente antes do estado variável. Datas de execução, IDs efêmeros e listas em ordem aleatória não devem romper prefixos estáveis sem necessidade.

Mudança de permissão ou regra invalida o material dependente, mesmo que cause perda de hit. Afinidade de cache é critério secundário entre rotas já autorizadas e adequadas. Não é justificativa para enviar dados a outro fornecedor nem para manter uma regra revogada no começo do prompt.


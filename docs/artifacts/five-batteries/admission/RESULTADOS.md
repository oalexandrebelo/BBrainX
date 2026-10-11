# State Commit 03A — resultados observados e continuação

Data: 09/10/2026. Base remota: `b8d2c4730b797828244e914675890990eb1f2558`. Código desta rodada: commit **`54c20025107303b5327b639b336fd343b5ccb956`**, tree **`d05a0450dce08c698ed7505ea99d14dcf83171b4`**. O commit é local e seu parent é o commit remoto citado; não foi enviado ao GitHub. O objeto do parent e a árvore de origem foram conferidos por seus hashes Git. Esta publicação documental é descendente do código testado e preserva a identidade dessa execução.

## Entrega que foi concluída

Foi implementado um ledger cooperativo de admissão compartilhado por processos, uma ponte de residência do worker Laya, inspeção/reconciliação explícita pelo host, CLI opt-in, tipos públicos, teste de modelo de estados, ensaios com processos reais e método de medição replicável. O banco é separado de `brain.sqlite`; não existe migração de memória, alteração de worktree do usuário, edição de configuração de harness nem mudança das seis capacidades MCP.

**Não é o encerramento da Bateria 3 inteira.** Backpressure completo do transporte MCP, indexação cancelável por gerações, reconciliação do registro de serviços das lanes, daemon compartilhado de pesos e homologação MEDIUM permanecem etapas seguintes. Nenhum desses itens foi promovido a implementado por existir num diagrama.

## Antes e depois — comparação funcional

| Propriedade | Base `b8d2c47` | Código desta rodada |
|---|---|---|
| Quota de modelos | Por objeto `ResourceAdmission` | `SharedAdmission` opcional, mesma autoridade SQLite entre processos cooperantes |
| Processo reiniciado | Reservas em memória da instância deixam de existir com ela | Reservas persistem; uma conexão nova observa a ocupação |
| Timeout/desconexão | Broker local observa seu ciclo de vida; não há ledger global | Trabalho incerto conserva slots/bytes, sem reciclagem por relógio |
| Worker ocioso entre decisões | Perfil residente por processo | Residência inteira contabilizada enquanto o worker existe |
| Token/generation anterior | Sem novo contrato persistente global | Identidade do ledger, token, geração, revisão e transição conferidos |
| Recuperação | Processo do próprio broker; serviços de lane são outro contrato | Reconciliação explícita do ledger com verificador host-owned ou atestado operacional rotulado |
| Código de modelo | Laya opcional, sem alterar seleção lexical | Mesmos pesos e contrato existentes; nenhuma nova inferência nessa rodada |

O teste de contraprova da base cria dois governadores locais e mostra duas admissões sob limites separados de um. Isso não denuncia quebra do contrato anterior: demonstra que ele não oferece a nova garantia global. O ensaio correspondente com dois processos do novo broker e um recurso compartilhado permite somente um worker residente; o concorrente recebe `SHARED_SLOT_LIMIT` antes de criar seu worker.

## Testes e evidências

| Ensaio | Resultado observado |
|---|---|
| Suíte completa | **393/393 aprovados**; 0 falhas, cancelamentos, skips e TODOs |
| Novos testes | **51** — 26 ledger, 8 multiprocesso, 11 broker, 5 CLI e 1 modelo de estados |
| Modelo de estados | **1.200 transições** comparadas a um modelo independente, com duas conexões SQLite |
| Produtores em contenção | **8 processos × 100 tentativas**; máximos e contadores dentro da política nos casos exercitados |
| Repetição | Cinco reexecuções da mesma bateria de 51 casos, todas aprovadas; não são 255 testes diferentes |
| Defeitos injetados | **6/6 detectados por assertion**; não contam erros de parse/import como detecção |
| Build Vite | Concluído, avisos registrados |
| Tipos públicos | Consumidor TypeScript 5.8.3 em strict/noEmit aprovado; não é tipagem integral do runtime |
| Fonte durante a suíte | Hash rastreado antes/depois idêntico |

As seis regressões removem: limite de slots, limite de bytes, conferência de token, persistência da reserva ao fechar conexão, evento de aquisição e exigência de reconciliação para unknown. A remoção de limites também remove seu CHECK correspondente no banco; isso evita contar uma segunda barreira como se o teste tivesse observado a primeira.

O crash pré-COMMIT usa uma transação SQLite real do produtor de falhas e testa rollback da base. O crash pós-COMMIT ocorre após a aquisição real pelo módulo. Não há claim de injeção em todas as instruções de máquina nem teste de falta de energia. O processo com stdout herdado é real e tem término próprio: `exit` do pai não é assumido como `close` de seus streams.

Os fixtures devolvem mensagens construídas para exercitar transporte e lifecycle. Não contêm pesos, não produzem rótulos de qualidade de Laya e não simulam ganhos de inferência. Dois processos de broker não são duas IDEs autenticadas; a homologação Codex/Claude reais é separada.

## Desempenho medido, com a unidade correta

Ambiente: Node **v24.21.0**, SQLite **3.53.4**, Linux x64, **5 CPUs lógicas** e **6,236,880,896 bytes de RAM** em container. Filesystem temporário não classificado. Esse host **não é um Mac MEDIUM nativo**, e a reserva não impõe RSS/VRAM no SO.

Após 100 ciclos de aquecimento, foram medidas 1.000 aquisições e 1.000 liberações, em ms:

| Operação | p50 | p95 | p99 | Máximo |
|---|---:|---:|---:|---:|
| acquire | 0.046739 | 0.141680 | 0.319323 | 0.562282 |
| release | 0.042914 | 0.141068 | 0.229600 | 0.595621 |

WAL e `synchronous=FULL` estavam habilitados. O resultado inclui a operação local tal como observada no container; não certifica o armazenamento físico, prazo hard real-time, throughput sob contenção ou cauda de produção. O percentil empírico de mil amostras não vira SLO.

### Ablação do índice de reservas ativas

Corpus criado pelo módulo: 10.000 reservas concluídas e uma ativa. Consulta de soma/contagem para o mesmo recurso, com resultado idêntico conferido. Comparação forçada entre `NOT INDEXED` e `INDEXED BY admission_active`: sete pares com ordem alternada, 1.000 consultas por braço em cada par. Os planos EXPLAIN e todos os pares estão em `evidence/benchmark.json`.

Mediana por lote de 1.000 consultas: **1186.101 ms no scan** e **2.146 ms no índice parcial**. É uma ablação do acesso SQL para esse corpus. Não é aceleração de 500× do BBrainX, do modelo ou da tarefa. A execução normal de acquire/release usa contadores de recurso; a ablação descreve consulta de agregados, não troca a baseline do produto inteiro.

O índice parcial evita consultar reservas concluídas ao validar o conjunto ativo. A autoridade conserva histórico, e a política limita seu crescimento. O limite inicial de 100.000 aquisições é finito e recusa novas admissões ao esgotar; não existe rotação automática nesta implementação. Planejar compactação com identidade/fencing é trabalho futuro, não apagar o banco para recuperar capacidade.

## Custo e benefício ainda não medidos

`providerTokensSaved`, `billingSavings`, `inferenceLatencyMs` e `taskAccuracy` permanecem null. O novo componente evita oversubscription cooperativa e contagem incorreta de residência; não reduz por definição os tokens do contexto. Uma fila global mais correta pode aumentar recusas e reduzir concorrência aparente. Isso é uma troca explícita em favor do orçamento, não uma regressão ocultada.

Um slot significa no máximo um trabalhador residente no resourceId. O peso não é compartilhado entre harnesses por esta ponte. Reutilização entre decisões funciona no mesmo broker; outro broker precisa aguardar stop/close do detentor. Um daemon com multiplexer e quotas por assinante continua fora do escopo.

## Fastino: oportunidade registrada, não instalação presumida

O estudo primário desta rodada está em `FASTINO_E_FONTES.md`: modelo de decisão dedicado e multilíngue, múltiplas cabeças no mesmo texto, diferença de single-label/multi-label e separação de dados públicos de desenvolvimento de teste retido. O perfil de decisão Fastino poderá consumir o mesmo ledger quando existir adapter validado. Não foi adicionado um wrapper vazio nem atribuída a Laya a semântica dos outputs Fastino.

## Publicação e recuperação

A sessão confirmou a base e os PRs pela conexão GitHub, mas os 48 métodos disponíveis nesta rodada são de leitura. As buscas por escrita e por plugin alternativo não disponibilizaram publicação. Não houve push, merge, novo CI remoto ou troca de visibilidade. A entrega fornece commit local com parent correto, patch, fonte completa e evidências. O workflow novo é um candidato executável para a futura PR, não um job já verde no GitHub.

Para aplicar, usar uma worktree limpa da base indicada e o patch validado do kit. Primeiro executar os testes e o build; depois avaliar a PR incremental, mantendo a main intacta. O rollback encerra workers próprios e preserva o ledger para reconciliação. Retirar a ponte elimina sua garantia de quota global: não é um rollback invisível.

## Próxima missão

Homologar o ledger e a ponte em CI dos três sistemas; conectar o novo contrato ao plano de governança escolhido; implementar backpressure/correlação MCP e indexação cancelável; depois medir duas ferramentas autenticadas em Mac MEDIUM. Não iniciar novo treinamento para contornar um problema de lifecycle que já possui teste determinístico.

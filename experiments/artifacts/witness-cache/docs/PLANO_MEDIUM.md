# Plano de validação: da referência executável ao BBrainX MEDIUM

**Proposta, não resultado medido.** O laboratório atual não governa o runtime completo, não está integrado ao MCP e não foi executado em Mac. Sua aprovação local é condição necessária para continuar, não autorização para afirmar prontidão de produção.

## 1. Prioridade zero: integrar a base correta

A main consultada continua `a9636e9`; o PR #10 permanece aberto. Antes de uma nova feature produtiva, reconciliar as alterações concorrentes de `src/context.mjs`, os limites de worker e a instrumentação do Observatory. Suítes verdes isoladas não certificam a combinação. Manter notas de contrato, bytes de payload e mensagens de erro relevantes nos testes de regressão.

Não iniciar substituição universal por FastMCP/LangGraph e cache novo simultaneamente. Isso destruiria a atribuição do experimento: qualquer melhoria ou defeito poderia vir de transporte, seleção ou reuso. Uma intervenção por ensaio, com revision pinning e rollback explícito.

## 2. Definir exatamente a máquina e o orçamento

O alvo de referência do produto é uma estação de 16 GiB, não uma exigência de que todos os usuários tenham exatamente esse hardware. Registrar chip, CPU disponível, RAM física, pressão/compressão, versão do SO/Node, disco e alimentação. Tratar Intel e Apple Silicon como variantes diferentes. Não arredondar RAM insuficiente para promover perfil.

O orçamento global precisa abranger coordenador, caches, indexadores, brokers, runtimes de linguagem e modelos. Medir um filho isolado enquanto outros cinco copiam o mesmo modelo subestima a interferência. A soma de RSS pode contar páginas compartilhadas várias vezes; escolher e documentar uma métrica de memória que corresponda ao objetivo, incluindo a leitura por processo e do host.

O cache do laboratório tem limite serializado de 2 MiB; esse número não representa a RAM de um Laya, de um language server ou do BBrainX. Não iniciar downloads ou aumentar concorrência por detectar máquina HIGH/MAX. A mudança de perfil e de egress deve ser consentida.

## 3. Três modalidades de teste

**Conformidade local:** contratos do módulo, cancelamentos e negativas. Reproduzível sem modelos e sem serviços. Esta modalidade foi executada na entrega, com limites descritos.

**Integração em sombra:** o resultado frio é o que atende a tarefa; o cache recebe o mesmo input de leitura e seu resultado é comparado, sem duplicar mutações. Registrar divergências, falsos hits, memória, bytes e tempo de validação. O shadow aumenta custo temporariamente, portanto precisa de orçamento e período delimitado.

**Tarefa pareada:** mesmas tarefas e modelos, BBrainX com a otimização desligada versus ligada; ordem randomizada e estado quente/frio separados. Não usar dependências corrigidas depois para favorecer somente um braço. A aceitação usa verificador externo à política que escolhe contexto.

## 4. Matriz de falhas

1. Memória aprovada revogada entre início e fim do cálculo; estado pendente precisa falhar antes de publicar.
2. Alteração de arquivo que não era resultado anterior; a geração de índice deve invalidar a busca.
3. Alteração e reversão para os mesmos bytes; tickets anteriores à remoção/reaprovação não podem reviver.
4. Dois clientes editando o checkpoint; CAS recusa o segundo ou exige reconciliação.
5. Resultado pós-timeout de worker antigo; nenhuma resposta deve ser atribuída à nova geração.
6. Freeze/sleep do host; métricas e permissões precisam ser revalidadas após retorno.
7. Saturação de fila por um cliente; outra identidade não deve perder a autoridade nem receber bytes do primeiro.
8. Relatório duplicado de usage; a importação é idempotente por tentativa, não pelo ID da tarefa inteira.
9. Política nova muda o formato obrigatório do contexto; prefix cache antigo não conserva norma revogada.
10. Falha no canal de invalidação; leitura deve confirmar revisão autoritativa quando não houver comprovação de sincronismo.
11. Conteúdo recuperado tenta alterar destinos/allowlist; permanece dado, sem promover permissões.
12. Resposta cacheada semanticamente próxima mas com operação distinta; execução não a reutiliza como efeito confirmado.
13. Dados multimodais com mesmo ID mas bytes diferentes; identity/UUID remoto não substitui validação do conteúdo.
14. Falha de disco ou banco cheio durante commit; nenhum pacote ou evento incompleto é anunciado como concluído.

Os testes 1–3 possuem versões locais delimitadas no laboratório. Os cenários de SO, MCP, disco e inferência exigem integração futura; não são cobertos pelo uso da mesma terminologia no teste unitário.

## 5. Métricas que podem sustentar uma alegação

| Eixo | Medida |
|---|---|
| Correção | Tarefas aceitas, testes F2P/P2P pertinentes, requisitos sem evidência, divergência frio/cacheado |
| Governança | Leituras não autorizadas, revogações respeitadas, dados obsoletos apresentados como atuais |
| Reuso | Hits exatos válidos, misses por versão, invalidações, artefatos recompilados, bytes lidos/copied |
| Custo | Usage final por tentativa; estimativa por tarifa versionada; custo real informado separado |
| Responsividade | p50/p95/p99 por estágio, tempo de cancelamento, fila e taxa de rejeição |
| Estação | Memória, CPU e interferência no workload foreground comparado ao controle |
| Retomada | Tempo até a primeira ação correta após trocar harness e quantidade de releituras |

Sem uso final do provedor, tokens economizados permanecem desconhecidos. Sem baseline comparável, a diferença monetária é apenas soma de eventos. Não misturar templates synthetics, benchmarks de software real e resultados dos autores dos papers.

## 6. Estatística e incentivo contra autopromoção

Fixar tarefas e critérios antes da otimização. Separar treino/calibração, desenvolvimento e holdout final. Repetir consultas ao holdout para escolher parâmetros o torna parte do desenvolvimento; reservar outro conjunto. Publicar resultados negativos e a causa dos descartes.

Para comparar qualidade, usar diferenças pareadas por tarefa e intervalos de incerteza. Agregar tokens por tarefa aceita e também relatar tarefas não aceitas, para evitar “economizar” abandonando difíceis. Medir cold start e hot path separadamente; aquecimento de cache é parte do método, não detalhe omitido.

O objetivo “99% de acerto” precisa de definição de população e amostragem. Passar 34 testes de contrato ou ter 99 hits de artefatos num corpus construído não estima essa probabilidade. Um modelo pode ter confiança 0,99 e estar mal calibrado no subgrupo mais crítico. Nenhuma decisão de segurança é promovida por essa confiança.

## 7. Sequência de adoção proposta

**Gate A:** suíte combinada do core estável, sem cortes de obrigações nem ausência de deadline nas etapas.

**Gate B:** um artefato de leitura determinístico passa por adapter de dependências autorizado, com invalidação observada. Nada de cache semântico de ações como primeiro caso.

**Gate C:** identidade de índice e catálogo está correta diante de adições/remoções; testes de falsos hits e resultados negativos passam.

**Gate D:** shadow em estação MEDIUM confirma paridade e custo aceitável, sem leitores extras ocultos ou pressão sobre IDE.

**Gate E:** dois harnesses reais compartilham a tarefa e a autoridade, mantendo escopo e sem carregar um modelo por cliente.

**Gate F:** alegação de eficiência é apoiada por ensaio pareado reproduzido por terceiros, com hardware e versões declarados.

Cada promoção mantém mecanismo de desligar o cache e recomputar sem perder o estado canônico. O rollback não altera memórias aprovadas nem reverte dados de usuário que evoluíram desde a instalação.

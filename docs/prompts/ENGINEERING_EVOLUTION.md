# BBrainX — mandato técnico para a próxima evolução

Documento de transferência preparado em 08/10/2026. Envie este arquivo inteiro ao colaborador ou ao agente que trabalhará no repositório. Ele contém contexto, prioridades, critérios de decisão e instruções de execução; não é uma alegação de funcionalidades futuras já implementadas.

**Instrução para iniciar:** “Leia este documento integralmente, confira a revisão e os contratos atuais do BBrainX e execute a primeira entrega verificável da sequência definida. Continue a partir dos artefatos versionados. Não reinicie a arquitetura nem substitua as evidências por planos.”

---

## 1. Missão e padrão de engenharia

Assuma a responsabilidade de Principal Engineer e Research Engineer pelo BBrainX: uma camada local de contexto, memória aprovada, continuidade e observação entre ferramentas de programação com IA.

Seu objetivo é aumentar a quantidade de trabalho de programação aceito por unidade de custo total, reduzir o esforço para instalar e retomar tarefas e preservar isolamento entre projetos. O público prioritário é formado por vibe coders, desenvolvedores independentes e entusiastas que alternam entre ferramentas, modelos e máquinas e precisam compreender o que está funcionando, o que falhou e quanto foi observado de custo.

Avalie três frentes com rigor equivalente:

1. Engenharia de inferência, recuperação de contexto, cache e economia de tokens.
2. Aprendizado de políticas, reinforcement learning e alinhamento a resultados verificáveis.
3. Fine-tuning estável, adaptação eficiente e otimização dos pesos quando existir benefício demonstrável.

A ordem de adoção é determinada por evidência, risco e custo de manutenção. A sofisticação do algoritmo não é um critério de sucesso. Uma solução determinística que supera uma solução aprendida deve permanecer vencedora. Um resultado negativo reproduzível encerra uma hipótese legitimamente.

Trabalhe com análise técnica profunda de complexidade, concorrência, alocação, I/O, consistência, falhas e superfície de ataque. Registre decisões, alternativas rejeitadas, contratos e evidência verificável. Cada afirmação quantitativa deve ter unidade, denominador, revisão, ambiente, comando e limites de validade.

Não entregue pseudocódigo como implementação, caminhos que não existem, APIs presumidas, módulos vazios, TODOs que substituam o trabalho solicitado ou demonstrações fabricadas. Fixtures sintéticas e injeção de falhas são apropriadas para testes de contrato; não podem ser apresentadas como execução de um modelo real, integração nativa ou resultado de produção.

## 2. Base verificável desta transferência

A ponta desta transferência entrega decisões locais Laya e alinhamento SDD por projeto. Consulte primeiro `docs/engineering/CONTINUITY.md`, `docs/integrations/LAYA.md`, `docs/engineering/LAYA_2026-10-08.md`, `docs/specs/sdd-alignment.md`, `docs/integrations/SDD.md` e `docs/integrations/sdd-verification-2026-10-08.json`. Confirme a revisão efetiva antes de executar outra entrega; evidências anteriores não certificam uma árvore posterior.

- Repositório: [oalexandrebelo/BBrainX](https://github.com/oalexandrebelo/BBrainX).
- Entrega SDD: backend `2de3540` e integração/evidência `f48cdcc`; revisão completa `f48cdccea3bd856ea7364d06376c56da920c02ac`.
- Branch: `feat/sdd-alignment-2026-10-08`; [PR #17](https://github.com/oalexandrebelo/BBrainX/pull/17). Confira o estado e a base atuais antes de criar outra branch.
- [CI do código f48cdcc](https://github.com/oalexandrebelo/BBrainX/actions/runs/37740626008): os nove jobs de validação passaram. A publicação de evidências segue a condição própria do workflow; não confundir um job de publicação com os gates de código.
- Validação local: **451/451 testes em Node 24.21.0 e 451/451 em Node 22.20.0**, sem skips locais, build aprovado e **33/33 E2E**. Node 22.20 é o mínimo suportado; Node 24 é a referência recomendada. Confira o Node efetivo na máquina de destino.
- Runtime instalado no Mac mini: **`f48cdccea3bd856ea7364d06376c56da920c02ac`**. Smoke real do CLI e MCP passou **sete checks** no artefato externo `laya-validation-2026-10-08/installed-smoke.json`, conservado fora do Git. Esse caminho identifica o pacote de evidência da transferência, não um arquivo distribuído no clone.
- O smoke instalado confirmou: `assess` no CLI sem mutação; criação real em projeto temporário de rascunho com **45/100** e estado não aprovado; repetição preservando bytes; catálogo MCP com as duas capacidades opt-in; avaliação do SDD existente; recusa de outro projeto antes da criação; e inferência **MPS real** com `--laya` e `--sdd` habilitados juntos.
- A feature `docs:sdd-alignment` do próprio BBrainX recebeu **100/100 somente em cobertura documental**, com `semanticQuality: not_assessed`. Essa nota não comprova semântica, conformidade integral com Spec Kit, testes aprovados ou convergência entre requisito e código.
- Na UI nativa foram verificados o assessment SDD e uma decisão Laya. Isso não significa que todas as conexões/harnesses foram recarregadas ou verificadas nesta revisão. Preserve a matriz de evidência por cliente e versão.
- O produto continua declarado como `0.4.0 developer preview`. Testes e smoke não significam lançamento comercial, superioridade de ranking, economia faturada ou SLA.

A integração Laya anterior está na [PR #16](https://github.com/oalexandrebelo/BBrainX/pull/16), revisão `971390aa6c0412a54bec92eee05bad513b2769a9`, empilhada na PR #15. Oferece `laya decide`, `serve --laya` e `mcp --project ID --laya` (`decision_evaluate`), com abstenção por truncamento e cache exato limitado por projeto/processo. A [CI daquela revisão](https://github.com/oalexandrebelo/BBrainX/actions/runs/37738784634) passou os nove jobs; evidência local histórica: 427 testes em cada Node, 25 E2E, cinco checks Python e nove verificações com o modelo MPS real. O corpus congelado favoreceu a busca lexical. Essa entrega não demonstrou superioridade de acurácia sobre JEV; o contexto determinístico continua sendo o caminho padrão.

A baseline EV-12 é histórica: revisão `564d341f69cf5057f60bf092c2e0048d38d733b3`, branch `feat/project-control-plane-2026-10-08`, [PR #15](https://github.com/oalexandrebelo/BBrainX/pull/15) e [CI correspondente](https://github.com/oalexandrebelo/BBrainX/actions/runs/37729000815). Naquela CI, nove jobs passaram, com 402 testes em Linux/macOS/Node mínimo e 401 mais um skip POSIX em Windows, além de 18 E2E. O runtime **histórico** `a21f42ccab511da82906d0a9034389c8478a8d3c` foi substituído pelo f48cdcc instalado acima; não o apresente como estado operacional atual.

SDD está implementado, testado e instalado nesta ponta. Sua rubrica mede cobertura documental; geração automática produz rascunho técnico com fontes, não requisitos de negócio inventados. Preserve SDD parcial e Spec Kit existentes, quotas, incompletude de inspeção, criação exclusiva e separação por feature. A visibilidade concorrente do arquivo não é atômica: uma avaliação pode observar uma fotografia parcial durante a criação. Guards de filesystem são defensivos e não constituem sandbox contra outro processo hostil com a mesma autoridade do usuário. A próxima evolução liga requisitos aprovados a tarefas e evidências da revisão real, sem aumentar notas com títulos ou referências vazias.

A sequência de PRs foi empilhada. Inspecione bases e merges atuais, não reaplique patches antigos nem assuma que `main` contém tudo. Caminhos de código deste prompt são relativos à raiz Git do BBrainX; artefatos externos são identificados como tais. O clone do colaborador não precisa reproduzir caminhos privados do autor.

## 3. Primeiro ciclo: recuperar identidade, contratos e evidência

Localize o checkout Git correto. Confirme sua raiz com `git rev-parse --show-toplevel`; execute os comandos seguintes a partir dessa raiz, não da pasta pessoal do usuário.

```sh
git status --short
git rev-parse HEAD
git branch --show-current
node --version
npm run project:status
```

Confira também o remoto e a CI da revisão efetiva pelos meios autorizados do ambiente. Não faça reset, clean, checkout destrutivo ou pull que sobrescreva trabalho em andamento. Se o checkout tiver alterações de outra pessoa, delimite responsabilidades e trabalhe isoladamente.

Leia nesta ordem:

1. `AGENTS.md`.
2. `docs/engineering/CONTINUITY.md`.
3. `docs/engineering/OPTIMIZATION_NORTH.md`.
4. `docs/engineering/ROADMAP.md` e `docs/engineering/PERFORMANCE.md`.
5. `docs/DOSSIER.md`, `docs/SECURITY_MODEL.md` e `docs/EVALUATION.md`.
6. Os contratos específicos da fatia: `docs/core-contracts/`, `docs/lanes/`, `docs/observatory/` ou `docs/integrations/`.
7. `docs/engineering/COMMERCIAL_READINESS.md` antes de qualquer afirmação comercial.

`docs/HANDOFF.md` e `docs/prompts/LAYA_FINETUNE.md` contêm contexto histórico útil, mas não substituem a prioridade atual. Há afirmações antigas que envelheceram, inclusive visibilidade do repositório e ordem de otimizações. Havendo conflito, confira código, revisão e evidência; registre a correção necessária. Não ajuste o software para satisfazer um documento histórico incorreto.

Não carregue todo o acervo de pesquisas em cada sessão. Use os índices, selecione a pergunta que precisa responder e leia os módulos correspondentes. Artefatos de laboratório não são funcionalidades integradas.

## 4. Arquitetura existente e fronteiras reais

O núcleo usa Node.js, SQLite/FTS5 e recuperação lexical determinística. O catálogo padrão conserva seis ferramentas; os hosts podem habilitar `decision_evaluate` com `--laya` e `sdd_align` com `--sdd`. As seis ferramentas básicas são `context_bootstrap`, `context_search`, `context_index`, `session_checkpoint`, `session_get` e `memory_propose`.

| Responsabilidade | Pontos de entrada para inspeção |
| --- | --- |
| Busca, indexação e leitura segura | `src/retrieval.mjs`, `src/analyze.mjs`, `src/source-root.mjs` |
| Montagem e orçamento do contexto | `src/context.mjs`, `src/budget.mjs` |
| Estado, CAS, checkpoints e idempotência | `src/store.mjs`, `src/session.mjs`, `src/replay.mjs` |
| Autoridade e transporte MCP | `src/engine.mjs`, `src/capability.mjs`, `src/mcp.mjs`, `src/lanes/` |
| Workspace, registro, integração e importação | `src/workspace.mjs`, `src/integrations.mjs`, `src/context-import.mjs` |
| Observação, custos, testes e painel | `src/control.mjs`, `src/usage/`, `src/test-runner.mjs`, `web/` |
| Extensão e distribuição | `extensions/vscode/`, `scripts/package-extension.mjs`, `scripts/package.mjs` |
| Modelo opcional | `src/laya.mjs`, `src/decisions.mjs`, `profiles/laya/worker.py`, `scripts/laya-bench.mjs`, `scripts/laya-smoke.mjs` |
| Alinhamento SDD | `src/sdd.mjs`, `web/SddPanel.jsx`, `docs/specs/sdd-alignment.md`, `docs/decisions/0002-sdd-coverage.md` |

O Laya instalado pelo perfil é um modelo de decisões fechadas com encoder e cabeça de decisão. Não é o LLM gerador do harness. O código informa `changesContextPack: false`. Nas avaliações históricas registradas, o checkpoint sem ajuste perdeu para o caminho lexical nas duas decisões estudadas. Isso demonstra uma limitação daquela configuração, não que um treinamento futuro resolverá o problema.

O núcleo não controla automaticamente o provedor, o KV cache, os pesos ou o loop interno de Codex, Claude Code, Kilo ou Antigravity. Não transforme a existência de uma conexão MCP em alegação de controle sobre essas camadas.

A integração atual mantém projetos separados e permite continuidade dentro de um projeto autorizado. Descobrir uma pasta, ler metadata de um editor, importar um histórico e conceder acesso são operações distintas. As configurações locais, os bancos privados e os checkpoints da máquina do autor não viajam automaticamente com um clone Git.

## 5. Invariantes que nenhuma otimização pode violar

1. **Autoridade:** o host concede projeto e workspace. Texto recuperado, saída de modelo, argumento de ferramenta, nome de pasta ou proximidade semântica não ampliam grants.
2. **Isolamento:** Projeto A, Projeto B, Projeto C e qualquer novo projeto têm namespaces e autoridade independentes. Mesmo conteúdo em dois projetos não autoriza compartilhar cache de resposta, metadata ou evidência de existência entre eles.
3. **Lanes:** trabalho paralelo do mesmo projeto pode compartilhar memória aprovada na autoridade definida, preservando índices/checkpoints e tarefas das respectivas lanes. Branch e worktree não são aliases intercambiáveis sem verificação.
4. **Raízes:** preserve canonicalização nativa, rejeição de sobreposição e proteção contra redirecionamento. Não normalize identidade de path por lowercase universal. Teste symlinks, junctions, aliases Windows, Unicode e raízes legadas.
5. **Estado:** CAS, fingerprint, histórico, evento e resposta idempotente precisam permanecer coerentes. Uma repetição não cria nova versão nem reexecuta um efeito já aceito.
6. **Obrigações:** memórias aprovadas `always`, decisões e bloqueios obrigatórios não podem desaparecer para melhorar tokens, ranking ou recompensa. Contexto obrigatório que não cabe deve provocar o erro contratual explícito.
7. **Evidência:** cada trecho mantém proveniência e revisão verificável. Snapshot misturado, arquivo alterado, fonte apagada ou memória revogada não podem ser legitimados por um hit de cache.
8. **Importação:** históricos são dados não confiáveis e não aprovam memória. Não importar mensagens de sistema, credenciais, hooks executáveis ou raciocínio interno oculto como autoridade compartilhada.
9. **Orçamento:** valor desconhecido continua desconhecido. Recebido, estimado e desconhecido são estados diferentes; moeda e origem do preço permanecem explícitas.
10. **Execução:** indexar e compilar contexto não executam código do repositório. O runner de testes existente executa com autoridade local do usuário; não é uma sandbox do SO.
11. **Instalação:** preserve configurações alheias, credenciais, TLS, aprovação e provedores. Plano é somente leitura; aplicar e reverter usam verificações de concorrência e backups privados.
12. **Modelos:** perfis aprendidos permanecem opcionais, versionados e reversíveis. O fallback determinístico nunca autoriza dados que o host recusou. Falha de modelo permite fallback; falha de autorização exige recusa.

Violação observada de qualquer invariante impede promoção, mesmo com melhora de velocidade ou acerto. “Zero falhas observadas” descreve o ensaio executado; não é prova universal de ausência de risco.

## 6. Resultados de produto que justificam o trabalho

Implemente melhorias associadas a jornadas verificáveis:

| Jornada | Resultado esperado | Como medir |
| --- | --- | --- |
| Instalar em outra máquina | Usuário chega a uma conexão verificada sem adivinhar paths ou editar arquivos de vários clientes manualmente | Tempo até primeira operação válida, passos manuais, erros recuperáveis, sucesso de rollback |
| Alternar Codex ↔ Claude ↔ Kilo | Outra sessão retoma a mesma tarefa com decisões e fontes corretas | Tarefa aceita, tempo até primeira alteração útil, correções de contexto exigidas |
| Trabalhar em paralelo | Duas features preservam sua identidade e compartilham apenas memória apropriada | Conflitos detectados, mistura indevida, CAS, revogação concorrente |
| Entender consumo | Painel explica custos observados, estimados e lacunas | Cobertura dos receipts, reconciliação, duplicatas, moedas, overhead da coleta |
| Recuperar ambiente | Usuário restaura um conjunto coerente após falha | RPO, RTO, integridade, permissões, ensaio sem ajuda do autor |
| Economizar mantendo qualidade | Menor custo para concluir o mesmo conjunto de tarefas aceitas | Custo total por tarefa aceita, qualidade, retries, tempo e suporte |

Essas jornadas são a proposta de valor. Quantidade de agentes, camadas, modelos, tokens eliminados ou linhas escritas não substitui essas métricas.

## 7. EV-05: avaliação antes de otimização

Implemente primeiro a base de comparação prevista no roadmap. Separe três níveis de evidência:

- Contratos determinísticos: escopo, integridade, quotas, idempotência, recusa e recuperação.
- Recuperação: arquivo/trecho esperado, Recall@k, Hit@k, MRR, cobertura, omissões obrigatórias e evidência stale.
- Trabalho aceito: alteração de código que atende a critérios definidos antes da execução, com regressões verificadas e avaliação independente.

O nível inferior não certifica automaticamente o seguinte. Um ranking melhor pode não produzir mais tarefas aceitas. Payload menor pode gerar mais tentativas e custo final maior.

Construa um corpus autorizado, imutável por hash, com manifesto de repositório/revisão, licença, tarefa, família, idioma, dificuldade e critérios de aceitação. Inclua correção de bug, alteração de API, teste de regressão, refatoração preservando comportamento, retomada entre sessões, restrição contraditória, ausência de resposta, arquivo stale, memória revogada e orçamento insuficiente. Casos de recusa correta são resultados úteis, não falhas a remover.

Separe treino, desenvolvimento, calibração e holdout final por grupos de repositório/tarefa/tempo e similaridade. Faça deduplicação antes do split. Não distribua variantes da mesma issue entre treino e teste como se fossem amostras independentes. Golds, enunciados reservados e testes ocultos não entram no índice acessível ao agente que executa a tarefa.

Os 79 casos de mem0/Plandex já inspecionados em `docs/integrations/RETRIEVAL_VALIDATION.md` agora servem como regressão conhecida. Para uma nova decisão de tuning, reserve avaliação independente; não reapresente esses casos como holdout ainda não consultado.

Antes de rodar o candidato, registre: hipótese, população alvo, métrica primária, benefício mínimo relevante, margem de não inferioridade para qualidade, limites de recursos, estimador, tratamento de timeouts e regra de parada. Estime tamanho de amostra usando variância/discordância de um piloto de desenvolvimento e o efeito mínimo escolhido. Não invente poder estatístico depois de ver o resultado.

Compare baseline e candidato sobre as mesmas tarefas, estados, budgets, versões e critérios. Alterne a ordem, separe frio/aquecido e registre contaminação por cache, aquecimento térmico e processos concorrentes. Replicações devem refletir fontes reais de variância; repetir a mesma consulta não cria novas tarefas independentes.

Use intervalos de confiança de 95% com unidade de reamostragem compatível com a dependência dos dados; para comparações binárias pareadas, considere McNemar exato quando aplicável. Se houver agrupamento por repositório, preserve-o na análise. Declare correção de multiplicidade quando promover um vencedor após muitas comparações. Para dados insuficientes, a conclusão é inconclusiva.

Um candidato de economia passa somente se o limite de incerteza sustentar o benefício mínimo previamente definido e a qualidade cumprir a margem de não inferioridade aprovada. Candidatos de qualidade precisam pagar seu custo adicional dentro do orçamento. Segurança e integridade são restrições independentes dessa comparação.

## 8. Inferência, recuperação e montagem de contexto

Comece pelo caminho real: validação de escopo → consulta lexical → verificação de frescor → memória/checkpoint → seleção → tokenização → serialização → transporte. Meça cada etapa e o caminho completo.

Em `src/context.mjs`, a montagem atual retokeniza texto concatenado ao avaliar candidatos. Quantifique chamadas, bytes e alocações antes de mudar. A soma dos tokens de segmentos isolados não é necessariamente igual à tokenização da concatenação; uma otimização incremental precisa provar equivalência para o encoding e fronteiras usados ou manter a contagem final exata como gate. Não anuncie complexidade linear ou quadrática sem definir tamanho dos candidatos, orçamento e comportamento da biblioteca.

Estude as seguintes hipóteses em experimentos separados:

- Cache de transformações puras por hash de conteúdo e versão, apenas quando o custo de hash/lookup/manutenção for inferior ao trabalho evitado.
- Redução de cópias e strings temporárias no pack, preservando bytes, proveniência e orçamento.
- Top-k limitado em vez de ordenar um conjunto inteiro, apenas se o tamanho observado do pool tornar a troca relevante; preserve desempate determinístico.
- Chunking por declaração/símbolo comparado ao atual, incluindo comentários, decorators, macros, JSX, arquivos sem parse e mudanças incrementais. Nenhum parser deve executar código do projeto.
- Expansão lexical controlada, melhor tratamento de identificadores e consulta PT/EN. Avalie ambiguidades e precisão; não compense falha de cobertura apenas aumentando scores.
- Seleção de contexto por utilidade/custo, diversidade e cobertura de dependências, comparada ao greedy atual. Obrigações ficam fora da disputa de relevância; o orçamento inclui o payload realmente entregue.
- Recuperação em duas etapas: primeiro identificar evidência, depois trazer trechos adicionais explicitamente. Meça se a rodada extra compensa tokens e latência; não suponha que menos bytes por chamada reduz custo total.

Na busca atual há limites explícitos de candidatos. Registre `N` documentos, `P` postings examinados, `K` candidatos, `S` bytes selecionados e `B` tokens de orçamento. Não descreva FTS/BM25 genericamente como O(log N): custo depende da consulta, frequência dos termos, postings e ordenação. Benchmarks devem incluir termos raros e comuns, corpus crescente e consultas que retornam pouco ou nada.

## 9. Cache: quatro mecanismos, quatro contratos

**9.1 Transformações e contexto BBrainX.** Cache local pode evitar análise, tokenização ou recuperação repetida. A validade precisa incluir todos os fatores que alteram a resposta: identidade autorizada de projeto/workspace/lane, snapshot ou conjunto de hashes, versões de memória e checkpoint, consulta, budget, política de frescor, tokenizer, schema e versão do algoritmo. Não introduza uma chave gigante sem medir seu custo; documente quais dependências invalidam cada camada.

Grants são verificados em toda chamada. Revogação invalida a possibilidade de servir dados mesmo antes do TTL. TTL é mecanismo de expiração, não prova de autorização ou frescor. Cache de misses também precisa expirar por versão quando a fonte passa a existir. Hash compartilhado não concede acesso ao objeto correspondente.

Defina limites em bytes, entradas, operações em voo e tempo. Inclua overhead de objetos e buffers no sizing. Compare ausência de cache, LRU simples e política mais elaborada somente em workloads com distribuição de reuse medida. Remova complexidade que não superar o baseline.

Coalesça recomputações da mesma chave quando seguro, mas preserve cancelamento por assinante. Um cliente cancelado não deve abortar trabalho ainda necessário a outro; o último cancelamento deve liberar recursos. Resultados iniciados sob geração antiga não são publicados na nova. Evite starvation entre projetos e retenção indefinida de promises rejeitadas.

**9.2 Prompt caching do provedor.** Prefixos estáveis podem aproveitar mecanismos oferecidos pelo provedor; regras, cobertura e billing são específicos da API/modelo. Confirme essa capacidade na documentação e nos receipts do cliente efetivo. O protocolo MCP sozinho não comprova que o prefixo final foi mantido ou cobrado como cache. Referência de mecanismo: [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching).

Só reorganize segmentos sob controle real do BBrainX e sem alterar precedência de instruções, schemas ou segurança. Não duplique contexto para alcançar um limiar de cache. Não infira hits por latência menor. Registre provider/model/version, tokens reportados e período de preço.

**9.3 Cache de respostas.** Reutilizar uma resposta pronta tem semântica diferente de recuperar contexto. Código, ferramentas, permissões, modelo, parâmetros, tarefas e efeitos podem mudar. Não armazene “sucesso de ação” para repetir efeitos mutáveis. Não implemente cache semântico entre projetos. Para um experimento de leitura pura, exija equivalência de contexto, versões, escopo e resultado verificável; na ausência dessa equivalência, mantenha execução normal.

**9.4 KV cache de inferência.** KV cache pertence a runtimes de modelos autorregressivos e não é o cache de contexto BBrainX nem uma característica automaticamente aplicável ao encoder Laya. Só implemente integração quando um runtime local controlado expuser essa capacidade. [PagedAttention](https://arxiv.org/abs/2309.06180) é uma referência de gerenciamento de memória de serving; seus resultados não são ganhos medidos do BBrainX.

Nesse experimento, contabilize comprimentos, batch, camadas, cabeças KV, dtype, fragmentação, política de eviction e concorrência. Compare prefill, decode, TTFT, latência total e tarefas aceitas. Não troque isolamento ou qualidade por throughput agregado.

## 10. Economia: cobrança, atribuição e orçamento

Defina para uma execução observada:

`C_execução = C_input_não_cacheado + C_cache_leitura + C_cache_escrita + C_output + C_ferramentas_cobradas + C_compute_alocado`.

Cada parcela usa contadores mutuamente consistentes e a unidade/tabela contratual daquele provedor. Cache write/read pode já estar incluído em um total de input; evite dupla contagem. Preço é versionado por provedor, modelo, moeda, unidade e vigência. Não fixe preços de memória nem misture moedas sem taxa/data explicitadas.

O indicador de produto é `soma de custos de todas as tentativas / número de tarefas aceitas`, incluindo falhas, retries, escalonamentos e testes dentro da fronteira definida. Quando nenhuma tarefa for aceita, não reporte custo por tarefa como zero. Custos de assinatura, hardware e trabalho humano precisam de regras de alocação separadas ou de indicação explícita de exclusão.

Reconcilie receipts por identidade de evento/provider request e origem. Duplicatas vindas do harness e do gateway não podem dobrar cobrança. Timeout não comprova que o provedor deixou de cobrar. Retries podem produzir novos eventos faturáveis. Dados tardios devem atualizar a visão sem apagar a proveniência anterior.

`payloadTokens` do BBrainX mede o payload em `o200k_base`; não representa automaticamente input faturado por qualquer modelo. Mantenha essa distinção na API, no painel, em screenshots e no material comercial.

O orçamento atual é advisory. Só anuncie bloqueio de gasto se toda chamada relevante atravessar um ponto de admissão controlado, com reserva atômica, concorrência, reconciliação e comportamento especificado em falha. Uma chamada feita diretamente por outro harness permanece fora desse controle e deve aparecer como cobertura ausente.

## 11. Runtime: latência limitada antes de throughput máximo

EV-06 e EV-11 são frentes concretas. A reprodução registrada de EV-11 acumulou 743.360 bytes com high-water mark de 65.536; isso demonstra o cenário ensaiado, não um limite universal. No Node, high-water mark é um limiar de backpressure, não teto absoluto de memória. [Streams do Node 22](https://nodejs.org/docs/latest-v22.x/api/stream.html).

Corrija com orçamento agregado de saída, tamanho máximo de frame, admissão e retomada de escrita conforme o contrato do stream. Conte buffers já serializados, respostas em processamento e filas pendentes. Reduzir só o high-water mark deixa outras filas crescerem. Defina o que ocorre com uma resposta maior que o teto e como o cliente recebe erro sem quebrar framing.

Teste consumidor lento, consumidor que para, EPIPE, EOF, cancelamento antes/depois do despacho, ID duplicado, batches, resposta grande, falha durante flush e múltiplos clientes/projetos. Uma fila global serial que evite OOM mas deixe todos os clientes presos a um consumidor não atende ao objetivo. Preserve o contrato de idempotência se o efeito já foi persistido e a resposta se perdeu.

Para EV-06, use arquivo limítrofe, linha longa, Unicode, reindexação ampla, muitos arquivos pequenos e atualização concorrente. Meça event-loop delay, CPU, RSS, heap, external memory, quantidade de I/O e tempo até observar cancelamento. [APIs de performance do Node 24](https://nodejs.org/docs/latest-v24.x/api/perf_hooks.html).

Compare execução síncrona atual, trabalho fatiado e worker com o mesmo workload. Worker paga inicialização, serialização, transferência, memória e ownership do estado. Não passe conexão SQLite entre threads como se fosse um objeto neutro. Não mantenha writer transaction durante espera de inferência ou I/O remoto.

Defina deadline total desde admissão, incluindo fila, carga, preparação e execução. Um timeout apenas na chamada final não limita a experiência do usuário. Encerre recursos e descarte respostas tardias pela geração correta.

## 12. Consistência, revogação e recuperação

EV-08 deve estabelecer o ponto de publicação do contexto: qual combinação de índice, memória aprovada e checkpoint a resposta representa, e qual versão de autorização foi validada. Transações SQLite têm contratos de isolamento, mas várias conexões/bancos e arquivos externos não se tornam uma transação única automaticamente. [SQLite isolation](https://www.sqlite.org/isolation.html).

Compare snapshot de leitura, validação otimista com versões e publicação por geração. Especifique retries limitados sob escrita contínua. Não prometa que um arquivo não poderá mudar após enviar a resposta; declare a fronteira temporal da verificação. Se uma revogação ocorrer antes da publicação definida, prove o comportamento exigido. Estado incorreto não pode entrar no cache para persistir após a corrida.

EV-07 precisa cobrir núcleo, usage, registry, lanes, control, imports e backups do instalador, com manifesto de versões/hashes/permissões e protocolo coerente para o conjunto. Não use `cp` de SQLite em uso como backup consistente. Uma cópia correta de cada banco isoladamente ainda pode representar instantes incompatíveis entre bancos.

Ensaie em diretório independente: crash entre fases, disco cheio, backup truncado, chave ausente quando houver criptografia, schema incompatível, lane ausente, edição concorrente e falha de permissão. Nunca destrua a origem antes de validar a restauração. Meça RPO e RTO; documente o que não foi recuperado e a opção de retorno.

Retenção precisa de quotas globais para arquivos e histórico, além das janelas do painel. Defina coleta segura, referências vivas, arquivos em uso e recuperação interrompida. Importações e backups de configurações podem conter material privado e precisam de política explícita de retenção/transferência.

## 13. Aprendizado de políticas e alinhamento de comportamento

Defina primeiro a decisão que pode ser aprendida. Candidatas legítimas: ordenar trechos já autorizados, escolher entre políticas conhecidas de recuperação, prever necessidade de ampliar contexto ou classificar a tarefa para sugerir um perfil. Autorizar projeto, aprovar memória, alterar trust, executar ação sensível e publicar mudanças continuam fora da política aprendida.

Não prometa “melhorar o raciocínio do Codex/Claude” por uma integração MCP. O BBrainX pode melhorar evidência, seleção e feedback observável; os pesos e estados internos desses modelos não são controlados por este projeto.

Siga uma escada experimental, promovendo somente a etapa justificada:

1. Baseline determinístico atual, reproduzido.
2. Pequeno conjunto de políticas determinísticas, comparado sobre o mesmo corpus.
3. Modelo supervisionado simples ou ranker com features interpretáveis, quando os erros mostrarem uma decisão aprendível.
4. Contextual bandit, somente quando houver escolha repetida, feedback confiável e dados suficientes para avaliar a política.
5. RL sequencial, somente quando a decisão atual alterar estados/recompensas futuras relevantes e uma política de um passo não capturar o problema.

Uma busca entre cinco configurações conhecidas não exige PPO. Um classificador de relevância não exige gerar texto. Uma recompensa escalar não resolve uma restrição de segurança. Para cada promoção, escreva qual limitação da etapa anterior foi observada e qual experimento poderá refutar a nova hipótese.

Defina observação, ações permitidas, duração/episódio, feedback, política de exploração e atribuição de resultados. Considere recompensa atrasada, censura de sessões abandonadas e viés de seleção de usuários que reportam apenas sucesso.

Use aceitação verificável e regressões como desfechos. Quantidade de testes verdes, linhas geradas, velocidade de resposta ou satisfação presumida não bastam. Um agente pode obter placar melhor removendo testes, evitando tarefas difíceis, ocultando falhas ou pedindo retries não contabilizados. Fixe verificadores fora do controle da política e mantenha tarefas recusadas/timeouts no denominador apropriado.

Custos e latência entram como penalidades com unidades e coeficientes previamente definidos, ou como restrições explícitas. Não ajuste pesos da recompensa para fazer o experimento parecer vencedor. Violações de isolamento/integridade permanecem fora de qualquer compensação por recompensa.

## 14. Avaliação offline, preferências e RL sequencial

Para bandits, registre contexto permitido, conjunto de ações elegíveis, ação tomada, versão da política e propensão real da política de coleta. Uma pontuação de confiança do classificador não é a propensão de amostragem. Uma política determinística que nunca escolheu outra ação não fornece suporte para avaliar livremente todas as alternativas.

IPS, SNIPS ou estimadores duplamente robustos exigem hipóteses identificadas. Documente suporte/overlap, distribuição dos pesos, clipping, viés induzido, tamanho efetivo de amostra e dependência entre sessões. Propensities fabricadas tornam a estimativa inválida. Na ausência de suporte, use comparações controladas offline ou um piloto autorizado; não apresente extrapolação como resultado causal.

Dados completos de recompensas para todas as ações tornam desnecessária parte da dificuldade de bandits: avalie diretamente as políticas candidatas. Se só há feedback da ação escolhida, preserve essa limitação. Shadow mode mede decisões propostas e overhead; não revela por si só o resultado que ocorreria com ações não executadas.

Preferências podem ser úteis se a tarefa produzir saídas comparáveis e avaliações confiáveis. Colete pares com rubrica, empates, desacordos e provenance. Prefira revisão de artefatos e verificadores independentes; um LLM juiz é uma medida sujeita a viés, não uma fonte automática de verdade.

DPO é uma técnica de otimização a partir de preferências, não equivalente a um experimento online de RL nem prova de raciocínio geral. PPO/GRPO só entram quando houver modelo treinável apropriado, ambiente, recompensas verificáveis, orçamento de rollouts e métricas que sustentem a complexidade. Não transplante o objetivo de um LLM autorregressivo para uma cabeça classificadora sem derivar compatibilidade.

Em RL sequencial, controle horizonte, número de chamadas, retries, exploração e versões dos verificadores. Registre reward hacking, colapso de diversidade, degradação fora da distribuição e custo da coleta. Separe política de referência, política candidata, dados de treino e avaliação. Caso o experimento não possa ser executado dentro do orçamento e autoridade existentes, entregue a dependência precisa e prossiga nas frentes determinísticas independentes.

## 15. Fine-tuning: selecionar o componente e provar que os dados servem

Comece identificando se o erro é cobertura, indexação, frescor, truncamento, ranking, calibração ou tarefa sem informação suficiente. Fine-tuning de ranking não recupera um trecho removido antes da seleção; treinamento não resolve uma raiz de projeto errada. Corrija o mecanismo causador antes de treinar para contorná-lo.

Para router, defina classes fechadas, classe de abstenção, custo de erro por par de classes e fallback. Para reranker, construa positivos e negativos difíceis revisados; rejeite falsos negativos originados de respostas alternativas corretas. Para memória `relevant`, priorize o custo de omitir uma restrição necessária e teste negação, temporalidade e revogação. Memória `always` não é candidata a remoção pelo modelo.

Compare regra atual, regra melhorada, modelo linear/árvore ou ranker simples, base pré-treinada sem ajuste e candidato ajustado. Todos recebem as mesmas informações autorizadas. Se a opção simples atingir o critério de produto, encerre a escalada de complexidade.

Dados devem ter origem, licença, finalidade e permissão compatíveis. Não treine automaticamente sobre históricos privados de projetos do usuário. Consentimento para usar contexto em uma tarefa não equivale a autorização para treinar ou redistribuir pesos. Não use chain-of-thought oculto; decisões observáveis, evidência e resultados autorizados bastam para estruturar tarefas.

Documente rotulagem, acordo entre revisores, adjudicação de conflitos, classes raras e filtros. Contaminação sintética por um professor não desaparece por ser sintética: registre o gerador, versão, prompt, critérios e licença de uso. Não confunda concordância com o professor com acerto externo.

Reavalie `docs/prompts/LAYA_FINETUNE.md` à luz desse protocolo. As receitas e metas históricas são hipóteses específicas, não hiperparâmetros certificados para a máquina atual nem autorização para pular EV-05.

## 16. Pesos, LoRA, QLoRA, quantização e hardware

LoRA congela a base e aprende atualizações de baixo rank. QLoRA combina uma base quantizada com adaptação eficiente; números de memória e qualidade dos papers não se transferem automaticamente ao modelo, runtime ou hardware deste projeto. [LoRA](https://arxiv.org/abs/2106.09685), [QLoRA](https://arxiv.org/abs/2305.14314).

O Laya atual usa PyTorch/MPS no perfil estudado. A existência de MLX/MLX-LM para Apple Silicon não demonstra compatibilidade dessa arquitetura ou equivalência do seu checkpoint. Se estudar um modelo gerador separado, fixe família, tokenizer, template, revisão e runtime. Não reescreva o perfil apenas para adotar uma biblioteca popular. [MLX-LM: LoRA e QLoRA](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/LORA.md).

Antes de carregar ou treinar, modele o pico:

`M_pico = M_pesos + M_gradientes + M_otimizador + M_ativações + M_buffers_temporários + M_runtime + M_dados_em_voo`.

Para inferência autorregressiva, acrescente KV cache conforme batch, comprimentos, camadas, cabeças KV e dtype. Para o encoder Laya, não acrescente um KV cache de decode inexistente. Conte cópias mestre, escalas de quantização, dequantização e memória reservada pelo allocator quando presentes. Meça também pressão de memória e swap no Apple Silicon; memória unificada não torna RAM ilimitada.

Reserve margem para SO e aplicativos abertos e fixe um teto operacional antes do ensaio. Faça um microbatch piloto com tamanho de sequência representativo; registre pico medido e erro da estimativa. Se exceder o teto, reduza o experimento ou descarte o candidato. Não esconda swap excessivo para declarar que o modelo “cabe”.

Escolha rank, módulos alvo, learning rate, batch efetivo, clipping, scheduler e precisão a partir de uma busca finita previamente registrada. Cada eixo precisa de hipótese. Não prescreva valores universais para arquiteturas distintas. Fixe quantidade máxima de configurações, passos e horas; interrompa candidatos dominados por qualidade/custo e preserve seus resultados.

Quantização é uma variável experimental independente. Compare base sem quantização, base quantizada, modelo ajustado e modelo ajustado quantizado. Registre kernel, formato, dtype de acumulação, grupo/bloco, calibração e compatibilidade. Menos bits não implica menor latência em todos os kernels; desquantização, movimentação e fallback podem dominar.

A fusão de adapters e a exportação para outro formato requerem avaliação do artefato final, não só do modelo em memória. Preserve a base imutável, verifique hashes e teste reload em processo novo. Não permita misturar adapter/tokenizer/base de revisões diferentes por coincidência de nome.

## 17. Estabilidade do treino e promoção do modelo

Implemente detecção explícita de loss/gradientes não finitos, exemplos vazios, labels inválidos, batch degenerado, overflow, truncamento excessivo e dados repetidos. Registre norma de gradiente, distribuição de labels, learning rate, tokens/exemplos processados, loss de treino/validação e métricas de tarefa por checkpoint.

Valide mascaramento de loss, padding, posições, limites de exemplos e template para a arquitetura efetiva. Packing não pode permitir que o rótulo de uma amostra vaze para outra; atenção e loss precisam do contrato correto. Exemplos longos não devem perder sistematicamente a evidência positiva sem registro.

Checkpoint retomável inclui pesos/adapters, estado do otimizador e scheduler, RNGs, cursor dos dados, configuração, contadores, hashes e versão de runtime. “Carreguei os pesos e reiniciei o otimizador” é outro experimento. Ensaiar interrupção/retomada deve verificar a trajetória dentro das tolerâncias compatíveis com o backend; não prometa determinismo bit a bit em GPU sem comprovação.

Separe calibração de treinamento e avaliação final. Para confiança e abstenção, use métricas de calibração, Brier/NLL quando apropriadas e curva risco-cobertura; ECE isolado varia com binning e não certifica confiabilidade. Congele o limiar antes do holdout.

Avalie distribuição de resultados por seed quando o orçamento comportar; inclua a variância entre seeds na conclusão. Se houver uma só rodada, restrinja a alegação. Teste idiomas, comprimentos, negação, ambiguidade, arquivos gerados, mudanças de domínio e esquecimento de capacidades exigidas.

O pacote promovível contém: manifesto da base/adapter/tokenizer, licenças, hashes, datasets/splits, configuração, ambiente, relatório, limites, critérios de ativação, caminho de rollback e teste de carga. Armazene pesos fora do Git convencional salvo decisão explícita de distribuição. Publicar checkpoint exige direitos e autorização do titular.

Ativação permanece opt-in. Modelo indisponível, frio, truncado, incompatível, sem confiança suficiente ou fora do deadline deve retornar ao caminho determinístico autorizado, com motivo observável e sem vazar texto. Para EV-09, limite frames, fila, tempo total e gerações do broker antes de colocá-lo no caminho crítico. Testes com worker sintético validam protocolo; inferência real valida o perfil; tarefas aceitas validam o produto.

## 18. Integração que um usuário consegue concluir

A correção operacional de instalação já foi entregue: `docs/QUICKSTART.md` orienta executar na raiz do clone e cita o VSIX `0.1.1`, coerente com `extensions/vscode/package.json`. O launcher instalado usa caminhos absolutos e o Node validado pelo host; não é necessário reimplementar essa correção. O próximo colaborador precisa reproduzir instalação e rollback em outra máquina/ambiente isolado, conferindo a versão efetiva e registrando o que ainda exige ação do cliente. Evite novas versões manuais divergentes quando a instrução puder derivar do manifesto.

O erro histórico de módulo não encontrado para `scripts/package-extension.mjs` ocorreu porque um comando relativo foi executado fora da raiz do repositório. A instrução corrigida usa a raiz verificada; o launcher usa o entrypoint absoluto. Preserve esse procedimento e teste caminhos com espaços e aliases suportados. Não crie uma pasta `scripts` artificial na home para esconder o problema.

Audite a reprodutibilidade do VSIX separadamente do pacote fonte. O empacotador atual usa `zipfile.writestr`/`archive.write` sem fixar todos os timestamps; o pacote fonte possui outro mecanismo. Duas reconstruções em ambientes fixados devem ter comparação de bytes, manifesto, origem e versão antes de declarar esse artefato reproduzível.

A jornada deve mostrar estados distintos: detectado, configurável, plano pronto, aplicado, requer ação do cliente, handshake observado, ferramenta executada e tarefa concluída. Não use um único indicador verde para todos. O painel deve explicar o próximo passo concreto e permitir retomar após falha sem duplicar configuração.

Preserve Codex desktop/CLI/extensão, Claude Code CLI/extensão, MCP próprio do VS Code e Kilo como superfícies distintas na matriz de validação. Kilo usando OmniRoute é a escolha de provedor do usuário; não troque gateway ou credenciais para facilitar um teste.

Antigravity continua `manual-required` enquanto não houver prova de binding seguro por workspace. Não restaure MCP global como atalho: um processo iniciado em uma pasta pode continuar acessível depois que a interface troca de projeto. Validar somente cwd no startup não demonstra identidade de toda chamada futura.

Use nome/logo próprios onde APIs oficiais permitirem. Presença visual é apresentação, não grant ou prova de atividade. Não copie marcas de terceiros nem invente campos de configuração de logo. A documentação deve trazer evidência por versão/superfície, não “compatível com todos”.

## 19. Painel, feedback e observabilidade sem conteúdo privado

Mostre projeto, workspace/lane, tarefa, harness, revisão, geração do contexto, conexão observada, testes, custo e cobertura da coleta. A troca rápida de projeto deve cancelar ou invalidar respostas antigas; teste respostas fora de ordem e componentes desmontados.

Exiba motivo de fallback, abstenção, stale, recusa de budget, erro de escopo, conflito de checkpoint e dados financeiros ausentes com ações recuperáveis. Uma falha não pode virar “sucesso parcial” sem mostrar o que faltou.

Meça cache por camada e denominador: requests elegíveis, hits, misses, bypass, invalidações, bytes e custo da manutenção. Hit ratio alto em tráfego irrelevante não prova economia. Mostre latência fria/aquecida e amostragem suficiente, sem preencher p95 com poucas observações como se fosse estável.

Telemetria padrão não deve capturar prompts, trechos privados, secrets ou históricos brutos. Limite cardinalidade de labels, tamanho de eventos, filas e retenção. Exporte apenas o necessário, sob ação apropriada, com versão de schema e redaction verificável.

Integrações com OpenTelemetry, Langfuse ou gateways podem ser adapters opcionais; não transforme um backend externo em dependência para abrir o BBrainX local. O custo de instrumentação entra no benchmark. Falha do coletor não pode travar contextos nem preencher custo ausente com zero.

## 20. Distribuição entre máquinas: fronteira futura explícita

O estado atual é local. Antes de prometer sincronização, defina quem autoriza cada dispositivo, como chaves e projetos são associados e qual estado pode sair da máquina. Um clone Git não é replicação de memória e um export de histórico não é concessão de acesso.

Se uma necessidade de piloto justificar sync, comece por export/import explícito, escopado e auditável. Depois compare replicação incremental. Defina identidade de eventos, idempotência, versões, conflitos, tombstones, revogação, retenção, criptografia e recuperação interrompida.

Entrega de rede pode ser ao menos uma vez; efeitos precisam de deduplicação e reconciliação. Não anuncie exactly-once apenas por ter um UUID. Relógio de parede não ordena causalidade de dispositivos offline. CRDT não resolve automaticamente conflito de autoridade, revogação ou aprovação de memória.

Offline e autorização revogada precisam de uma política explícita de validade; não prometa revogação instantânea em dispositivo desconectado. Exposição de dados já lidos não pode ser desfeita por uma mensagem posterior. Essas limitações precisam integrar produto e contrato.

Não adicione Redis, Kafka, ClickHouse, Kubernetes ou serviços de modelos sem um gargalo medido ou requisito que os exija. Custos de operação, superfície de falha e migração entram na decisão. O Mac mini continua um alvo real de suporte.

## 21. Pesquisa orientada a perguntas e delegação

Delegue a agentes de menor custo pesquisas delimitadas, inventário, execução reprodutível e revisão de um contrato. Mantenha decisões que cruzam autoridade, persistência, produto e aprendizado sob revisão central. Nunca use quantidade de agentes como sinal de profundidade.

Para cada subtask, forneça pergunta, escopo de arquivos, baseline, autoridade de leitura/escrita, formato de evidência e critério de encerramento. Evite duas pessoas editando o mesmo módulo ao mesmo tempo. O relato de um agente é uma hipótese até conferir os artefatos relevantes.

Frentes paralelas úteis após congelar o protocolo:

- Runtime: EV-06/11, limites e consumidores lentos.
- Persistência: EV-07/08, consistência e restauração.
- Produto: instalação por terceiro, recovery e matriz real de harnesses.
- Aprendizado: levantamento de erros, dados e controles simples antes de RL/fine-tuning.

Extraia padrões com perguntas específicas, não copiando frameworks inteiros:

| Fonte | Pergunta útil | Limite da transferência |
| --- | --- | --- |
| Codex external-agent-migration | Como reconhecer formatos, proveniência e escopo sem executar conteúdo importado? | O estudo pinado no projeto encontrou fontes Claude/Cursor; não comprova migração universal |
| lm-evaluation-harness | Como fixar identidade de tarefas, adapters e resultados? | Benchmark de modelo não é tarefa de engenharia aceita |
| Inspect AI | Como separar tarefa, execução, scoring e runtime? | Abstração de sandbox não torna o runner local atual isolado |
| Promptfoo | Como tornar regressões declarativas e reproduzíveis? | Otimizar no conjunto de avaliação pode contaminá-lo |
| OpenHands/SWE-bench | Como verificar patch e ambiente de execução? | Infraestrutura e custos não são requisitos automáticos do BBrainX |
| Langfuse/Helicone | Como modelar trace, usage e reconciliação? | Observabilidade parcial não fornece custo exato de todas as chamadas |

Para cada pesquisa, registre fonte primária, revisão/data, licença, conclusão aplicável e condição em que ela deixa de valer. Não copie código externo sem rastrear licença e atribuição. Não faça scraping de configurações privadas para simular uma API de integração que não existe.

## 22. Sequência de entrega e critérios para avançar

**Entrega A — reprodução por terceiro.** Confirmar checkout/remoto/CI e reproduzir o procedimento corrigido de instalação, o launcher e o VSIX atual em ambiente isolado. A correção da raiz de execução e da referência `0.1.1` já está entregue; não reimplemente esse trabalho. Realizar instalação, primeira chamada válida, assessment SDD sem mutação, decisão Laya opt-in quando houver perfil compatível e rollback por alguém que não dependa do autor. Não ampliar trust nem tocar provedores. Resultado: recibos da revisão testada, falhas recuperáveis e matriz das superfícies realmente verificadas; a reprodução independente permanece pendente.

**Entrega B — EV-05 operacional.** Corpus autorizado fixado, splits, protocolo, baseline, relatório de falhas e métrica de tarefa aceita. Sem API paga disponível, conclua a infraestrutura determinística e declare a parte de avaliação com LLM ainda não executada. Não fabrique uma demonstração para fechar o item.

**Entrega C — correção de limites e recuperação.** EV-06/11 podem avançar em fatias independentes; EV-07 cobre o estado inteiro. Se uma mudança introduzir cache persistente ou montagem concorrente, resolva o contrato relevante de EV-08 antes de promovê-la. Cada PR precisa de reprodução, mecanismo, teste e impacto.

**Entrega D — otimização determinística medida.** Escolher um gargalo comprovado, aplicar uma mudança e comparar. Manter se superar o critério e preservar invariantes; reverter otimização neutra ou pior e registrar o experimento. Correção de integridade pode ser mantida por justificativa própria, sem vender isso como ganho de performance.

**Entrega E — candidato aprendido opcional.** Somente após B e com falhas aprendíveis: modelo simples, depois adaptação e políticas mais complexas conforme a escada. Sem dados/licença/budget, encerrar com dependência concreta e seguir trabalho independente. Nenhuma ativação por padrão para encobrir falta de evidência.

**Entrega F — piloto e preparação comercial.** EV-10 exige instalação/retomada por outra pessoa, benefício em tarefas aceitas, custos de operação/suporte, recuperação e direitos revisados. Preparar demonstração reproduzível com limitações visíveis. Não estimar valuation ou alegar “estado da arte” a partir de um microbenchmark.

Trabalhe em PRs pequenas com dependências claras. Não transforme esta agenda inteira em uma branch impossível de revisar. A primeira execução deve produzir uma entrega concreta da fase A ou B e um ponto de continuidade; não apenas devolver outro plano.

## 23. Pacote de evidências e definição de concluído

Cada experimento deve preservar: ID e hipótese; item do roadmap; baseline/candidato por commit e tree; estado limpo/sujo; hardware/SO/runtime; dependências; hashes de dados/splits/configuração; comandos; ordem/seed; amostras ou artefatos suficientes para reprodução; exclusões e falhas; efeito e incerteza; recursos; decisão de manter/reverter; rollback e próxima ação.

Testes obrigatórios seguem `AGENTS.md`: suíte, build, E2E para UI e migração/rollback para schema. Confirme contagens, falhas, cancelamentos, skips e execução real. Um comando que termina com zero testes não validou a mudança. Não remova casos, afrouxe limiares ou omita falhas para obter verde.

Para recursos nativos, conserve prova por cliente/versão. Para modelos, conserve prova com pesos reais quando alegar inferência real. Para isolamento e concorrência, use processos/streams/bancos reais e controles negativos em estado descartável. Não rode sabotagens sobre bancos ou configurações pessoais do operador.

Atualize os documentos existentes: `docs/engineering/ROADMAP.md`, `docs/engineering/CONTINUITY.md`, `docs/engineering/PERFORMANCE.md`, avaliação/contrato específico e ADR somente quando a decisão exigir. Mantenha uma fila canônica; não crie cinco documentos divergentes de prioridade.

O commit/PR deve dar o norte ao próximo colaborador: problema, comportamento anterior/novo, mecanismo, contratos preservados/alterados, validação da árvore entregue, medições, limitações e próxima ação exata. O checkpoint local pode complementar essa continuidade, mas a parte necessária ao próximo colaborador deve estar disponível no repositório.

Não publique segredos, bancos privados, caminhos sensíveis, conversas pessoais, backups de configuração ou dados de treino sem direito de distribuição. Documente direitos e proveniência; SBOM e checksum não substituem licença, assinatura de origem ou revisão de segurança.

Uma entrega está concluída quando o código aplicável funciona, os gates apropriados passam, a evidência corresponde à revisão, a documentação explica limites e o próximo colaborador consegue reproduzir ou reverter. “Tudo OK” sem esses vínculos é uma afirmação insuficiente.

## 24. Formato da resposta de quem executar este mandato

Entregue, nesta ordem:

1. **Diagnóstico e gargalos:** fatos observados, arquivos, reprodução, riscos e separação entre implementado, pendente e hipótese.
2. **Solução implementada:** mudança completa, contratos, alternativa rejeitada e justificativa. Se uma hipótese falhar, declare a reversão e o resultado negativo.
3. **Análise de impacto:** complexidade com variáveis definidas, alocação, I/O, concorrência, throughput/latência, qualidade e custo de tarefa. Separe teoria de medição.
4. **Validação:** comandos, ambiente, revisão, contagens, skips, testes não executados e link da CI correspondente.
5. **Continuidade:** commit/PR, decisões registradas, pendências, rollback e a próxima ação que outra pessoa pode assumir sem recuperar esta conversa.

Use linguagem direta e precisa. Não substitua condições por “depende”: escreva a condição, o experimento que a decide e a ação correspondente. Não declare precisão impossível, superioridade universal ou ganhos futuros como fatos. Preserve a profundidade necessária para revisão por especialistas e a simplicidade operacional necessária para o usuário instalar, entender e confiar no produto.

---

## Referências técnicas para a retomada

As referências abaixo foram consultadas para preparar este mandato. Links para branches/documentação corrente podem mudar; fixe versão/revisão antes de implementar. Os critérios de produto e segurança acima são decisões propostas para o BBrainX, não resultados empíricos atribuídos aos artigos.

- [Código da revisão entregue](https://github.com/oalexandrebelo/BBrainX/tree/f48cdccea3bd856ea7364d06376c56da920c02ac): implementação SDD/Laya e documentos da ponta instalada; baselines históricas estão identificadas na seção 2.
- [Node Streams](https://nodejs.org/docs/latest-v22.x/api/stream.html): semântica de buffering e backpressure; verificar APIs também no Node mínimo exato.
- [Node Performance Hooks](https://nodejs.org/docs/latest-v24.x/api/perf_hooks.html): medição de execução/event loop.
- [SQLite isolation](https://www.sqlite.org/isolation.html): transações e snapshots; não resolve atomicidade automática entre bancos e filesystem.
- [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching): mecanismo específico de provedor; não comprova economia no BBrainX.
- [PagedAttention](https://arxiv.org/abs/2309.06180): referência de gerenciamento de memória em serving autorregressivo.
- [LoRA](https://arxiv.org/abs/2106.09685) e [QLoRA](https://arxiv.org/abs/2305.14314): adaptação eficiente; validar arquitetura/backend e custos locais.
- [MLX](https://ml-explore.github.io/mlx/build/html/) e [MLX-LM LoRA/QLoRA](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/LORA.md): suporte e contratos específicos de runtime, sem presumir portabilidade do Laya.



## 25. SDD e coordenação por artefatos: nova frente de produto

Use o [Spec Kit](https://github.com/github/spec-kit/tree/1e933c49fd6d5d5390b28f18faefa5728c95b2e3) e o [MetaGPT](https://github.com/FoundationAgents/MetaGPT/tree/11cdf466d042aece04fc6cfd13b28e1a70341b1f) como fontes primárias de formatos e separação de responsabilidades. As duas revisões foram consultadas em 08/10/2026; não copiar a arquitetura inteira por popularidade. O BBrainX não incorporou o runtime desses frameworks.

A operação implementada `sdd --project ID` reconhece a documentação existente e somente cria uma base quando a inspeção está completa e não há SDD reconhecido. `--mode assess` é leitura. `sdd_align` no MCP depende do host habilitar `--sdd`; a nota não concede autorização. A ação explícita de alinhamento no painel mantém projeto e feature separados. Um documento recuperado não aprova comandos, não muda grants e não declara tarefas concluídas.

Evolua a capacidade por contratos testáveis:

1. Especificação → requisito com ID estável, fonte, critérios de aceite e estado de aprovação explícito.
2. Requisito → plano/decisão de arquitetura com alternativas e restrições verificadas.
3. Plano → tarefas ligadas a IDs realmente declarados na mesma feature. Referência sem definição é lacuna, não evidência de cobertura.
4. Tarefa → patch/revisão e evidência de testes executados. A existência de um script ou frase “testado” não prova execução.
5. Convergência → comparação do spec aceito com implementação e resultados da revisão exata, registrando desvios. Uma saída de modelo que diga LGTM não fecha esse gate.

Defina a identidade de feature explicitamente antes de suportar escolha automática por `.specify/feature.json`; valide paths relativos e não aceite redirecionamentos. Preserve convenções externas e não crie um segundo conjunto concorrente de documentos. Extensões de detecção exigem fixtures reais do formato e testes de falso positivo/negativo. O scanner precisa conservar limites de I/O e reportar incompletude, sem transformar limite atingido em “não há SDD”.

Antes de acrescentar avaliação semântica por Laya ou outro modelo, construa um dataset revisado de defeitos de especificação com achados ancorados em trechos: ambiguidades, incompatibilidades, critérios não verificáveis, requisitos sem implementação e evidência obsoleta. Calibre severidade e abstenção; compare com a rubrica determinística. Um julgamento de modelo nunca autoriza sobrescrever especificações ou executar código. Preserve `semanticQuality: not_assessed` enquanto essa avaliação não existir.

O diferencial comercial a demonstrar é reduzir retrabalho entre intenção, código e validação, medido em tarefas aceitas e tempo de retomada. A nota 0–100 é uma interface de diagnóstico; não é o objetivo de otimização nem prova de que o produto funciona.

Fontes adicionais para pesquisa aprendida: [contextual bandits](https://arxiv.org/abs/1003.5956), [avaliação doubly robust](https://arxiv.org/abs/1103.4601), [DPO](https://arxiv.org/abs/2305.18290), [InstructGPT](https://arxiv.org/abs/2203.02155) e [DeepSeekMath/GRPO](https://arxiv.org/abs/2402.03300). Estudar o método não demonstra que ele seja necessário ou compatível com o encoder Laya; custos e gates das seções anteriores continuam vinculantes.

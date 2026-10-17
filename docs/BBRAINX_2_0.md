# BBrainX 2.0 — contrato de entrega

Revisão: 12/10/2026. Proposta de versão: **2.0.0**, concentrada na [PR #22](https://github.com/oalexandrebelo/BBrainX/pull/22). Alvos prioritários do mantenedor: **Mac mini e MacBook Pro M5**. O produto atende projetos distintos; nenhum aplicativo consumidor determina o domínio do núcleo. Windows está no backlog por decisão explícita do mantenedor. Linux é ambiente auxiliar de validação, não substituto da comprovação nos Macs físicos.

## Produto entregue

BBrainX fornece contexto verificável, memória aprovada e continuidade de tarefas entre harnesses. AB-BBX executa os contratos de capacidades. O agente continua trabalhando em seu cliente; o host concede projeto/lane, enquanto texto recuperado, argumentos e propostas de memória não concedem permissões.

| Necessidade | Comportamento da 2.0 | Evidência executável |
|---|---|---|
| Encontrar código que acabou de mudar | Search/bootstrap públicos varrem o corpus elegível, comparam hashes e recusam com `INDEX_STALE` quando necessário. `context_index` atualiza e permite repetir. Arquivos novos, removidos e novas regras de ignore entram na comparação. | `test/index-freshness.test.mjs`, `test/lanes-mcp.test.mjs` |
| Entender o estado do índice | CLI `index-status`; MCP `context_index` com `mode: status`. Retorna missing/current/stale, snapshots, contagens e até 25 caminhos, sem corpos de arquivos e sem gravar índice/eventos. | Testes de ausência de escrita, exclusões, limite de resposta e autorização |
| Manter a worktree operacional | `watch` em processo separado, imediato e periódico, com recibo por ciclo. `--lane` resolve a associação registrada; não assume que a raiz principal é a worktree ativa. | `test/ab-bbx.test.mjs` |
| Retomar sem reconstruir a conversa | Checkpoints versionados, CAS, fingerprints e replay preservados. Notas done/decisions/blockers até 2.000 caracteres por item; teto total de 16 KiB. | Testes de checkpoint e limites em `test/ab-bbx.test.mjs` |
| Ver se o agente usa o produto | Observação local de chamadas, falhas e duração agregadas por capacidade. Painel mostra busca, contexto e checkpoints por sessão; registros antigos sem detalhe não viram zero observado. | `test/control.test.mjs`, `e2e/control-panel.spec.mjs` |
| Evoluir o núcleo sem prender o produto a um consumidor | `src/ab-bbx.mjs` é a implementação canônica. `src/capability.mjs` preserva reexports e identidade de erros para consumidores existentes. | Identidade de exports, testes de engine/MCP e controles negativos existentes |

A apresentação do repositório, arquitetura e Atlas identifica AB-BBX como núcleo próprio. Avisos legais e estudos históricos permanecem: retirar marcas da apresentação atual não autoriza apagar atribuições. A revisão não introduz modelo, embeddings, servidor remoto, dependência nativa, banco novo ou migração de schema.

## Contrato de frescor e seu custo

A diferença funcional deliberada da versão major: `context_search`, `context_bootstrap` e seus comandos CLI deixam de aceitar silenciosamente um manifesto antigo. Sem índice: `INDEX_REQUIRED`. Manifesto divergente: `INDEX_STALE`. O remédio é a ferramenta já existente `context_index`; o catálogo padrão continua com seis ferramentas. Search permanece sem escrita. Status usa a mesma capacidade de indexação com um modo de leitura, portanto a anotação MCP da capacidade continua indicando que ela pode escrever no modo padrão.

A varredura reutiliza exatamente a seleção de arquivos, os filtros de segredos, a verificação de raiz e os limites do indexador. Hash de conteúdo detecta alteração de mesmo tamanho e mtime; somente mtime/size não oferece esse contrato. Um banco vazio já indexado é current; um banco nunca indexado é missing. A conferência compara tanto o snapshot quanto o manifesto de arquivos, recusando divergência interna observável.

O resultado de sucesso inclui `freshness` com raiz, lane, snapshot, instante e `consistency: content-hash-scan-not-atomic`. Isso descreve **uma observação**, não uma transação sobre o filesystem. Outro processo pode editar um arquivo depois de ele ser lido. O compilador conserva a validação adicional de fontes selecionadas. Não se promete isolamento serializável entre filesystem, índice, memória e checkpoint. Os exports internos `search` e `compileContext` conservam os contratos anteriores; quem os usa diretamente deve aplicar a política de frescor que seu adaptador exige.

Custo de consulta verificada: leitura/hash O(bytes elegíveis), manifesto O(arquivos) e ordenação O(arquivos log arquivos), acrescido de Git e FTS. Tetos padrão: 20.000 arquivos, 256 MiB de texto elegível e 256 KiB por arquivo. A execução é síncrona: não há preempção de varredura nem garantia de latência máxima. A resposta de status limita caminhos a 25; contagens continuam completas. Caminhos e raízes são metadados privados e não devem ser publicados como telemetria pública.

O watcher grava somente diferenças, mas lê o corpus em cada ciclo. Intervalo padrão: 30 s **após** o término do ciclo anterior. Use um watcher por banco/worktree. Não existe lease global para excluir um segundo watcher; SQLite protege transações, não cria liderança distribuída. Um merge remoto não faz pull na máquina. Um processo encerrado não continua atualizando o índice.

Medição reproduzível: `node scripts/measure-index-freshness.mjs`. Gera arquivos reais, indexa SQLite, alterna 12 pares lexical/verificado depois de aquecimento, fixa hashes de corpus e código e salva amostras em `artifacts/engineering/index-freshness.json`. A CI executa o mesmo programa por plataforma. A primeira execução local da candidata (Linux x64, Node 24.19.0) observou:

| Corpus sintético | Bytes | Mediana lexical sem varredura | Mediana verificada | p95 verificado |
|---|---:|---:|---:|---:|
| 60 arquivos | 241.660 | 0,28 ms | 13,22 ms | 17,37 ms |
| 500 arquivos | 2.014.780 | 0,20 ms | 28,73 ms | 35,60 ms |
| 2.000 arquivos | 8.061.780 | 0,15 ms | 87,54 ms | 386,85 ms |

A máquina executava também validações; cache de filesystem quente e interferência de carga limitam a interpretação do p95. Isso mede o preço da garantia adicional, não aceleração do produto, desempenho do Mac, consumo de bateria ou economia de tokens. Ganho de produto exige tarefas aceitas pareadas (EV-05). A próxima otimização de runtime (EV-06) deve comparar processo dedicado/invalidação incremental com esta baseline e manter os testes de novos arquivos, ignores e mesmo mtime. Não promover cache baseado apenas no tempo para anunciar um índice como atual.

## Recrutamento de agentes (BYO)

Referência adotada: o Orca (`stablyai/orca`, 1.4.214) não cria conta nem chave; acha o `claude`/`codex` do usuário, aponta cada conta para uma pasta (`CLAUDE_CONFIG_DIR`/`CODEX_HOME`), dispara o login oficial da CLI, lê uso pelo `codex app-server` e lança os agentes como `claude -p --model --effort` e `codex exec -m -c model_reasoning_effort` em worktrees. A 2.0 aplica o mesmo mecanismo como capacidade AB-BBX: `agents_recruit` (spec em texto livre ou lista, tarefa, modo, base, prazo), `agents_status`, `agents_dismiss`. Concessão pelo host (`--recruit` nos args do servidor, gravado por `integrate`); servidor do recruta sem o flag; worktree e lane por recruta; supervisor desacoplado com batimento, prazo e commit do que a CLI deixou; registro sem prompt nem saída integral. Contrato, comandos, medição real e limites: [RECRUIT.md](RECRUIT.md). Não lê token, não altera trust/aprovações/provedores, não faz merge nem push.

## Observação sem conteúdo

Cada sessão instrumentada mantém contadores por capacidade conhecida e um único bucket `unknown`. IDs desconhecidos não se tornam chaves arbitrárias. São gravados calls, failures, totalMs e maxMs; argumentos, consulta, corpos retornados, tokens de capacidade e mensagens livres de erro não entram nesse registro. Erros usam códigos limitados. Duração usa relógio monotônico e inclui a execução observada; não é latência de rede do harness nem tempo humano.

O armazenamento continua local, limitado pelas cotas existentes de sessões/registro; não houve migração. Encerrar um processo não apaga o histórico imediatamente. Sessões antigas podem ser removidas pela retenção existente. Falha da observação não deve alterar o resultado da capacidade. O painel distingue ausência de medição de zero medido. Contar menos grep não é critério isolado de sucesso: fallback ao código permanece legítimo.

## Revisão dos repositórios e decisões AB-BBX

Revisões fixadas e código primário inspecionado em 12/10/2026. Popularidade, número de agentes/linguagens e alegações de velocidade dos autores não foram tratados como provas do BBrainX.

| Fonte e revisão | Mecanismo observado | Aplicação / decisão concreta | Custo e critério de promoção |
|---|---|---|---|
| [mattpocock/skills](https://github.com/mattpocock/skills/tree/49dd158d1076134a641b33efb035946536778336), `skills/engineering/tdd/tests.md`, `domain-modeling/GLOSSARY-FORMAT.md` | Testes por comportamento público e glossário compartilhado | Adotado como disciplina nos testes CLI/MCP/SQLite reais e no glossário abaixo. Não instala um catálogo de skills no usuário. | Evitar testes que recalculam a mesma implementação. Aceite por sintomas externos: arquivo novo antes/depois da indexação, recusa e isolamento. |
| [vinilana/dotcontext](https://github.com/vinilana/dotcontext/tree/f742f371e152dc826d17a03d9b1daf8636b69c4d), `taskContractsService.ts`, `hookTracePolicy.ts` | Contratos de tarefa/handoff e traces limitados/sanitizados | Adotada observação mínima por capacidade. Importação interoperável fica em backlog: envelope versionado, origem, limites e revisão humana. | Segunda autoridade de memória criaria divergência/revogação incompleta. Contagem de artefatos não comprova qualidade; requer evidência causal e testes de payload malicioso. |
| [vinilana/jev-gateway](https://github.com/vinilana/jev-gateway/tree/37ff982949f0cb9bb131963f82a6f34f8ba38edd), `src/decide.ts`, `test/failopen.test.ts` | Decisões tipadas, confiança, abstenção e preservação do fluxo original em falha/incerteza | Mantido como pesquisa para decisões opcionais; nenhum gateway ou provedor alterado. | Exigir experimento pareado on/off, chamada extra contabilizada, deadline, nomes maliciosos e ausência de ampliação de autorização. Não confundir fail-open de roteamento com fail-open de permissões. |
| [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents/tree/f99f6aa910a442b0197b768ce0ea7751e35e2060), `engineering/engineering-sre.md` | Papéis, SLOs, error budgets e rubricas operacionais | Adotado critério de prontidão por evidência e falha observável. Personas não são uma nova camada de execução. | Especialização deve reduzir erro/retrabalho medido; mais agentes sem coordenação aumentam custo e conflito. |
| [DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp/tree/4d9592b5fbceb80d3f7fc9c43020e50b77ad806a), `src/watcher/watcher.h`, `src/daemon/project_lock.h`, `src/daemon/version_cohort.h` | AST/grafo, polling adaptativo, lock por projeto, identidade de build/ABI e ativação coordenada | **Maior oportunidade futura de retrieval:** adaptador estrutural opt-in, read-only e independente do núcleo. A 2.0 entrega primeiro frescor verificável da busca existente. | Binário/ABI, consumo, inicialização e atualização ampliam operação. Antes de integrar: corpus fixado, impacto/definições com evidência de arquivo/hash/linhas, isolamento de lane, retirada do sidecar sem perda de checkpoint. Claims do upstream não são benchmark nosso. |
| [morluto/rea](https://github.com/morluto/rea/tree/3bdc8730bd98e073522bcb8ba86527be402c0cbe), ferramenta 6.4.0 | Investigação e relatório com cobertura/limitações explícitas | Ferramenta de auditoria; não participa do runtime. Execução realizada e falha ambiental registrada em AB_BBX.md. | O ambiente recusou `prepare_owned_process` com `unsupported_provider`; `ps` falhou. Inventário parcial de 825 fontes não demonstra grafo completo. Reexecutar em host compatível, sem desabilitar ownership. |
| [vinilana/invokta](https://github.com/vinilana/invokta/tree/f1e2f04f98c967ab4bb73bd02c3fa581f04ce0e5), `packages/core/src/engine.ts` | Contratos históricos de capacidades/adaptação | Nenhum delta de main frente à revisão já auditada. AB-BBX consolida a implementação própria existente; não há pacote de runtime para remover nesta versão. | Preservar avisos MIT e identidade de exports de compatibilidade. Refazer todo o motor por mudança de marca arriscaria cancelamento, autorização e efeito duplicado sem ganho demonstrado. |

Ordem de investimento: frescor/observação → custo de varredura e tarefas aceitas → adaptador AST/impacto → intercâmbio de handoff → roteamento experimental. As oportunidades integram a fila única em `docs/engineering/ROADMAP.md`; esta tabela registra a justificativa, não cria outra fila paralela.

## Glossário de domínio

| Termo | Significado / fronteira |
|---|---|
| Projeto | Identidade concedida pelo host, com raiz registrada e autoridade de memória. Similaridade de nome/origin não concede acesso. |
| Lane | Worktree registrada com índice/checkpoints próprios e memória aprovada compartilhada do projeto. |
| Snapshot textual | Hash do manifesto de caminhos elegíveis e hashes. Não é commit Git, imagem de disco nem hash de tudo no repositório. |
| Freshness | Comparação observada entre índice e corpus elegível; não congela edições posteriores. |
| Checkpoint | Estado de continuidade versionado, com CAS/idempotência; não é transcrição nem aprovação de memória. |
| Memória aprovada | Política/referência promovida por humano, com versão e possibilidade de revogação. |
| Capacidade AB-BBX | Contrato de entrada/saída/acesso/prazo; não é autorização de shell ou concessão implícita de projeto. |
| Evidência | Resultado com origem, revisão e limites; não vira instrução por estar num arquivo recuperado. |

## Notas da revisão independente de 13/10/2026

Revisão do diff `e3977cc..8ed6285` em macOS (reproduções em diretórios de scratch): paridade exata entre `inspectIndex` e `indexProject` (mesma seleção, ignores, tetos e filtros de segredo; sem laço permanente de `INDEX_STALE`); lanes e contadores corretos; custo medido por busca de 33 ms (357 arquivos) a ~100 ms (2.600 arquivos sintéticos) e 0,52 s por processo CLI em 2.588 arquivos reais no M4. Corrigido nesta revisão: `EACCES`/`EPERM` entram em `skippable` (antes derrubavam toda busca com `EXECUTION_FAILED` opaco); a dica de `INDEX_STALE` inclui `--lane`. Registrado como limite: `watch` concorrente pode produzir `INDEX_STALE` transitório (o agente reindexa e repete; converge) e muda o snapshot entre `context_bootstrap` e `session_checkpoint` (omitir `snapshot`, como as instruções pedem); `BBRAINX_MAX_*` devem ser iguais no watcher e no servidor, senão cada processo "corrige" o outro; `--strict` do `context` é legado.

## Falhas, recuperação e escala

| Falha | Regra operacional |
|---|---|
| Crash entre lotes de indexação | Manifesto confirmado permanece coerente; próximo refresh reconcilia. Não há rollback global do filesystem. |
| Banco cheio ou indisponível | Propagar falha primária, preservar transação e não repetir efeitos de domínio automaticamente. |
| Processo neural com término incerto | Reserva permanece ocupada/unknown até prova de close ou reconciliação autorizada. TTL não prova término. |
| Mudança/revogação de lane | Validar associação e epoch; negar publicação posterior à revogação. |
| Watcher parado ou varredura falha | Não emitir recibo de sucesso. Search/status expõem divergência; corrigir causa e reiniciar. |
| Duas máquinas escrevendo no mesmo SQLite | Não suportado como sincronização. Cada Mac mantém estado local. Não colocar o banco vivo em pasta sincronizada/rede. |
| Rollback de runtime | Fixar revisão anterior e reiniciar processos. Schema não mudou; checkpoint longo já persistido não é truncado, mas writers antigos conservam seus limites. |
| Backup parcial | Backup do núcleo não cobre automaticamente usage, lanes, control e recibos. EV-07 continua aberta; ensaiar restauração de cada escopo antes de alegar recuperação completa. |

Não há ganho em adicionar Redis, Kubernetes ou fila distribuída ao produto local sem gargalo demonstrado. Eventual sincronização entre Macs exigirá identidade de dispositivo, concessão de projeto, deduplicação, conflito/revogação e protocolo de retomada; relógio de parede e clone Git não resolvem isso.

## Aceite nos dispositivos prioritários

O runtime deve ser fixado por SHA completo, com Node absoluto e `BBRAINX_HOME` privado preservados. A instalação registrada no Mac mini é histórica; esta revisão não acessou nem atualizou os Macs físicos. O relatório de M5 Pro 24 GB existente é uma medição anterior, não inventário novo do MacBook Pro M5 do mantenedor.

1. Conferir PR/commit aprovado, `npm ci --ignore-scripts`, `npm test` e `npm run build` no runtime isolado. Registrar modelo real, macOS, arquitetura e Node com o recibo local; não copiar configurações privadas para Git.
2. Rodar `doctor` com o Node absoluto do launcher e `node scripts/measure-index-freshness.mjs`; registrar latência/RSS/CPU e bateria/energia quando disponíveis. O teste sintético não substitui a worktree real.
3. Na raiz/lane autorizada: `index-status`, `index`, `search`; adicionar um símbolo de teste, confirmar `INDEX_STALE`, atualizar e encontrar o símbolo. Remover o arquivo e reconciliar. Confirmar que outra lane não retorna seu marcador.
4. Iniciar um único `watch` para o escopo, guardar dois recibos e comprovar uma mudança pesquisável. Encerrar e reiniciar; confirmar fechamento dos bancos e convergência. Não instala LaunchAgent implicitamente.
5. Fazer chamada MCP pelo cliente real, observar busca/contexto/checkpoint no painel e retomar o mesmo checkpoint em outro harness do mesmo projeto. Testar projeto estrangeiro e confirmar recusa. Não alterar credenciais, trust, TLS ou gateways.
6. Só então selecionar a nova revisão em `app/current` e reiniciar sessões BBrainX afetadas. Guardar runtime anterior e recibo de verificação para rollback. Um processo já iniciado conserva código carregado.

Comandos operacionais: [AB_BBX.md](AB_BBX.md). Instalação anterior e integração por projeto: [integrations/MAC_MINI.md](integrations/MAC_MINI.md). Nenhuma alegação de certificação nativa decorre de um runner macOS da CI.

## Estado de validação desta candidata

Linux local, Node 24.19.0: **749/749 testes**, sem falhas/skips, e build aprovado. A CI da ponta é registrada na PR. Uma execução anterior sob carga encontrou o prazo incidental de 40 ms em um teste de identidade; esse teste recebeu prazo de 2 s, preservando todos os testes específicos de deadline. Testes novos cobrem frescor sem escrita, mtime preservado, arquivos novos, exclusões, segredo, manifesto divergente, CLI e métricas sem payload. O benchmark registra amostras e hashes. O build mantém o aviso de `use client` de dependência, sem suprimi-lo.

A tentativa local de Playwright não iniciou o Chromium: o binário estava ausente e o download retornou arquivo inválido. Isso não é teste de UI aprovado. A CI da mesma revisão deve fornecer o resultado dos quatro testes do painel e da suíte geral de navegador.

Windows permanece observado com `continue-on-error` nos três workflows de matriz, identificado como backlog também no coletor de evidência. Nenhum skip foi inserido nos testes para simular aprovação. macOS, Linux, Node mínimo, isolamento, MCP e controles negativos continuam obrigatórios. A PR permanece única; não foi criada release/tag nem feita instalação nos dispositivos nesta revisão.

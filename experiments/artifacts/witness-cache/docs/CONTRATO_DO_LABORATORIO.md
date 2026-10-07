# Contrato executável do WitnessCache

## 1. Objeto e limite da contribuição

O módulo `lab/witness-cache.mjs` é uma implementação experimental completa de cache exato de resultados com testemunho de dependências. Executa num único isolate Node; não abre rede, arquivos, banco, processos ou modelo. O teste de paridade usa uma função determinística de estado sintético e não se apresenta como simulação de Laya.

A autoridade é o host que fornece o estado. Este objeto não autentica um usuário, não verifica a assinatura de grants e não impede um código malicioso do mesmo processo de chamar seus métodos administrativos. Uma integração RPC deve expor métodos separados ao consumidor e manter atualização de recursos e permissões numa fronteira privilegiada.

**Hipótese H1:** o host atualiza as revisões de todos os recursos relevantes antes de autorizar operações que usam aquele estado. **H2:** as dependências declaradas cobrem todo input semanticamente relevante. **H3:** transformação e configuração correspondem ao hash informado. **H4:** somente o host confiável administra grants e revisões. **H5:** funções JavaScript síncronas da classe executam sem concorrência interna de outro isolate. **H6:** SHA-256 não colide no experimento. Não demonstramos H1–H4 para o runtime BBrainX existente.

## 2. API e estados

`updateResources(project, updates)` valida o lote de `{name,digest,expectedVersion}` antes de modificar o estado. Um hash idêntico na revisão esperada é early cutoff. Uma edição real incrementa revisão; tombstone é digest nulo. Recriação não volta à revisão anterior. Isso evita ABA mesmo quando bytes retornam à versão antiga.

`setGrant(project, principal, allowed, expectedVersion)` incrementa a revisão de autorização e invalida entradas daquele escopo. Reaprovar não torna tickets anteriores válidos. O principal já deve ser autenticado fora do módulo.

`begin(request)` recebe `{project,principal,kind,queryHash,contractHash,dependencies}`. Produz objeto opaco local não serializável como autorização remota. Consome uma vaga de ticket, captura a revisão do grant e de cada dependência e calcula a identidade exata. Não carrega o conteúdo descrito por um hash.

`lookup(ticket)` revalida ticket e estado. Hit consome o ticket e devolve cópia do Buffer; miss conserva o ticket para uma possível publicação. `commit(ticket,payload)` revalida depois da computação, consome o ticket e copia o resultado antes de armazenar. `cancel(ticket)` abandona somente o ticket; não cancela um trabalho externo que o host iniciou.

`clear()` remove resultados, tickets e índices reversos, mas conserva as revisões de recursos e grants do host. Reiniciar o processo elimina toda a instância. Não existe recovery durável nesta implementação.

## 3. Classes admitidas

| Classe | Dependências obrigatórias além da identidade |
|---|---|
| `artifact` | `policy/context` e pelo menos um `content/...` |
| `search` | `policy/context`, `index/generation` |
| `context` | anteriores, `memory/revision` e pelo menos um `task/...` |
| `decision` | `policy/context`, `model/revision`, `calibration/revision`, pelo menos um `state/...` |

Os tipos `authorization`, `mutation`, `test-execution` e `usage-receipt` são recusados. Eles não podem virar uma falsa evidência de efeito atual. O host ainda pode armazenar documentos históricos que descrevem esses efeitos; isso é arquivo/evidência histórica, não execução de novo teste.

A biblioteca não comprova que uma decisão é determinística. Se duas publicações para a mesma identidade produziram bytes diferentes, invalida a entrada e emite `INCONSISTENT_RESULT`. A ausência desse conflito num teste não demonstra determinismo universal. O produtor deve validar schema, completude, truncamento e domínio antes de publicar.

As dependências obrigatórias são uma defesa mínima: o chamador poderia omitir uma configuração adicional sem que o módulo a adivinhasse. O adapter que cria `contractHash` e a lista de dependências é parte da correção. Descobrir reads automaticamente seria uma evolução adicional, não implementada.

## 4. Por que geração de índice é dependência obrigatória

Uma busca não depende só dos documentos retornados. Outro documento pode ser criado, removido, mudar score, tornar-se elegível ou alterar estatísticas globais do ranking. A resposta “não existe” também depende do universo pesquisado. O recurso `index/generation` representa essa condição negativa da consulta.

No experimento, o documento antes retornado não muda, mas um concorrente muda e o host avança a geração. A busca é invalidada. Já o parse de outro documento inalterado permanece elegível. O sistema distingue invalidação de resultado de busca de invalidação de artefato.

Uma versão de índice por subsistema pode reduzir invalidação: consultas estruturais por nome podem depender de um shard de símbolos; BM25 sobre corpus completo precisa dos fatores globais aplicáveis. Essa granularidade exige prova de completude. Não substituir toda dependência global por shard apenas para aumentar hit rate.

## 5. Invariantes implementadas e seus limites

**I1 — Escopo:** chave inclui projeto e principal. Um grant novo não recupera entrada de outro escopo. Isso protege isolamento lógico do módulo, não acesso a memória por outro código no mesmo processo.

**I2 — Atualidade na fronteira:** antes de leitura e publicação, todas as revisões capturadas precisam coincidir com o estado do host; dependência inexistente/tombstoned é recusa. O teste de mudança durante await demonstra essa fronteira local.

**I3 — Revogação:** mudança de grant invalida entradas e tickets antigos deixam de publicar. Um Buffer copiado antes da revogação permanece com o consumidor. Não alegamos retração de bytes.

**I4 — Integridade de referências:** input Buffer e output Buffer não compartilham a região retida. Array de dependências do chamador não modifica retroativamente o ticket. Objetos opacos de outra instância ou reconstruídos não são válidos.

**I5 — Retenção limitada:** entradas, bytes contabilizados, escopos, tickets, recursos, dependências e projetos possuem limites. Evicção afeta cache, não a fonte canônica externa.

**I6 — TTL absoluto:** hits não renovam deadline da entrada. Duplicata byte-idêntica também não renova. Prazo de ticket é independente. Acesso com relógio regressivo/ inválido falha fechado, limpa resultados/tickets e exige uma nova instância.

**I7 — Lote atômico local:** conflito detectado na preparação não deixa recursos anteriores do mesmo lote parcialmente atualizados. Isso cobre erros de validação/conflito ordinários. Não garante recovery de falta de memória fatal, falha do processo ou transações entre banco e isolate.

**I8 — Identidade determinística:** nomes de dependências são ordenados; os argumentos reais são representados por hashes construídos pelo host, preservando qualquer ordem semântica. Não normalizamos os critérios do modelo para forçar reuso.

## 6. Dimensionamento implementado

Padrões: 128 entradas; 2 MiB de bytes contabilizados; payload individual 64 KiB; 64 entradas e 1 MiB por escopo; 128 tickets; 4.096 recursos; 256 grants; 32 projetos; 64 dependências por operação; TTL de entrada de 5 minutos; prazo de ticket de 30 segundos.

Esses limites são do laboratório e não dos perfis MEDIUM publicados em outro PR. Não configuram o orçamento de modelos, não reservam RAM, não são limite de RSS e não provam adequação à máquina do usuário. O mapa de recursos de um repositório de 20 mil arquivos exigiria outra estratégia de cobertura/retenção ou limites deliberadamente alterados.

Bytes contabilizados incluem tamanho do resultado, identidade serializada e chave. Estruturas Map/Set, números, referências, alocador e cópias transitórias adicionam overhead. A entrada de string já existe antes de `commit`; o módulo evita reter uma entrada excessiva, não controla a alocação feita pelo chamador.

Evicção primeiro respeita a quota do próprio escopo, depois o LRU global. Isso limita monopolização por um cliente, mas não reserva capacidade mínima garantida aos outros; ainda pode haver expulsão global entre escopos. Uma política de fairness e admissão seria responsabilidade do coordenador.

## 7. Complexidade e micro-otimizações

Defina E como entradas, T como tickets, D como dependências, P como bytes copiados, A como entradas afetadas por uma atualização. Map/Set têm custo médio esperado constante, não garantia universal adversarial de O(1).

| Operação | Custo relevante |
|---|---|
| `begin` | Varre expirações limitadas, verifica dependências e ordena nomes: O(E·D + T + D log D + bytes da identidade) no caso com muitas expirações; sem expiração de entradas, O(E + T + D log D + identidade) |
| `lookup` | O(D + P) mais manutenção média constante dos maps; hit copia payload |
| `commit` | O(D + P + E·D + T) no pior caso de expiração/evicção dos limites atuais |
| Atualizar recurso | Preparação linear no lote; remoções aproximadamente O(A·D), usando índice reverso |
| `stats` | Inclui varredura de conjuntos do índice reverso; não é operação gratuita |

Não há fila de prioridades de TTL: para 128 entradas, uma varredura limitada pode ser mais simples que manter heap. A escolha deve mudar se um perfil demonstrar que a varredura pesa. Não anunciamos O(1) para toda consulta porque a biblioteca usa hash map.

O índice reverso evita visitar cada artefato em toda edição. Early cutoff evita invalidação quando o hash não muda. Buffers copiados evitam corrupção por aliasing, ao custo explícito de cópia. Tickets opacos evitam serializar uma identidade a cada etapa interna, mas a integração RPC ainda precisará de outro contrato de autorização e transporte.

A versão inicial não usa lock-free ring, EBR, shared memory ou zero-copy. Nenhum perfil medido justificou introduzir essas responsabilidades no escopo. Redução de trabalho e isolamento de referências vieram antes de otimização de instruções de CPU.

## 8. Resultados desta execução

- 34 testes aprovados; zero falhas, skips, cancelamentos ou TODOs.
- Um teste enumera 1.296 sequências de quatro eventos e compara 1.728 leituras com um oráculo frio independente do cache.
- Quatro mutações em cópias temporárias isoladas são detectadas por assertions: publicação obsoleta, autorização ignorada, Buffer compartilhado e ausência da dependência de índice.
- Experimento com 101 entradas: 100 artefatos independentes e uma busca. Ao alterar um artefato e avançar o índice, 99 artefatos permanecem, um artefato e a busca são invalidados. Uma política global declarada invalidaria as 101 por definição; não executamos um produto concorrente como baseline.

Isso não mede acurácia de IA, p95 de API, tokens ou faturamento. Não usa modelos, gateways, bancos reais do usuário ou observadores do filesystem. A enumeração é finita e sequencial; não prova uma implementação futura entre processos nem todas as execuções de JavaScript.

O relatório `evidence/validation.json` registra Node, OS, arquitetura, hash dos fontes e limitações. A duração TAP é somente tempo de teste, não benchmark de engine. O código original permanece intacto depois dos negativos. O script não altera Git ou qualquer branch.

## 9. Critério para entrada no produto

Implementar adapter host-owned que leia revisões canônicas sob snapshot, declare dependências, recupere somente artefatos de leitura e revalide antes da entrega. A publicação de um evento SQLite e a troca do espelho de recursos precisam de ordenação clara. Se houver janela de inconsistência, não usar o espelho como fonte definitiva de autorização.

O modo inicial deve ser sombra: comparar artefato frio e cacheado no mesmo input controlado, descartando hits no resultado de produção até confirmar paridade. Não duplicar efeitos externos em modo sombra. Depois, habilitar por classe pequena e permitir desligamento que retorna ao cálculo frio sem perda do estado canônico.

A integração só pode declarar menos processamento após medir os contadores pertinentes. Menos tokens exigem observação no adapter/provedor; tarefa melhor exige aceite independente. Nenhum desses estados é derivado de um teste verde isolado do WitnessCache.

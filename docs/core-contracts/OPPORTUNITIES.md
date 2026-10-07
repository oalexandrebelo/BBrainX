# Oportunidades priorizadas: memória, recuperação e continuidade

**Natureza:** plano de implementação proposto em 7/10/2026. Exceto as correções explicitamente descritas em REVIEW.md, os mecanismos abaixo não são implementados por esta branch. Fontes [Sxx] estão em SOURCES.md. Prioridade não significa promessa de prazo ou ganho. O perfil de referência continua MEDIUM; o PR #8 ainda não governa todos os processos do produto.

## 1. Memória legível com revisão, não dois bancos concorrentes

**Origem:** Basic Memory e Serena, com as distinções entre recursos locais e Cloud. [S10–S13,S20]

**Problema do BBrainX:** a aprovação explícita é útil, mas o caminho puramente CLI/SQLite dificulta revisão de conhecimento por humanos. Não resolver isso tornando qualquer arquivo escrito pelo agente uma política aprovada.

**Proposta:** exportação Markdown reversível de memória, com `memory_id`, `project_id`, revisão-base, hash do conteúdo exportado, fonte, estado e âncoras. A pasta de intercâmbio deve ser escolhida pelo usuário e excluída da ingestão genérica, evitando que uma exportação volte como evidência independente. IDs do documento não concedem acesso; o host resolve seu projeto autorizado.

A edição externa gera uma proposta vinculada à revisão exportada. Não aceita `approved: true` vindo do frontmatter como aprovação. Se a revisão canônica mudou, realizar comparação a três vias ou retornar conflito; não sobrescrever a memória atual com o arquivo antigo. A aprovação atualiza o ledger e emite evento para projeções. Os arquivos são uma interface de autoria e exportação, enquanto estado de aprovação e CAS continuam canônicos no banco.

Não armazenar YAML arbitrário, tags de execução ou includes capazes de abrir outros caminhos. Parser e serializador precisam de limites e semântica definida de newline/Unicode. Exportação recusa arquivos existentes não gerenciados, symlink final e escapes da raiz. Revisar antes de versionar material que pode conter dados particulares.

**Gate:** round-trip sem perda de texto, duas edições concorrentes, memória revogada entre export/import, origem falsa, caminho escapando, documento grande, arquivo copiado entre projetos e falha entre persistência e projeção. Falha de exportação não desfaz aprovação confirmada nem anuncia sincronização completa.

## 2. Retrieval Inspector: tornar o erro localizável antes de treinar

**Origem:** `bm inspect query` e `inspect chunks`, e ferramentas por símbolos do Serena. [S11,S12,S19]

**Proposta:** uma execução de busca pode produzir um trace local de etapas: índice/generation, termos normalizados, métodos acionados, scores por origem, filtros, deduplicação, quota e orçamento. O diagnóstico vem da mesma execução que devolveu o resultado; não repetir a consulta para fabricar uma explicação potencialmente divergente.

Retornar duas visões: metadados pequenos por padrão e detalhes locais explícitos para revisão. Não registrar query/texto por padrão. IDs e hashes também podem permitir inferência por dicionário; exportação pública deve usar dados sintéticos ou pseudônimos de sessão. O inspetor não revela quantidades ou nomes de outros projetos.

Estados separados: não indexado, indexado mas fora dos candidatos, rejeitado por escopo, obsoleto, omitido por orçamento, superado por ranking e falha de backend. Sem essa distinção, fine-tuning pode tentar corrigir um problema de cobertura de índice com mais pesos.

**Gate:** trace reproduz os mesmos IDs do retorno, sem segunda busca; respeita escopo; informa orçamento efetivo; não registra conteúdo sensível por acidente. O diagnóstico fica desativado no caminho de produção que não o solicitou.

## 3. Recuperação estrutural como adapter de leitura

**Origem:** Serena, Aider/repomap e a trilha de código do Cognee. [S18–S21]

**Proposta:** `CodeIntelligencePort` host-owned para declaração, referências e outline, inicialmente em TypeScript e Python. Não expor o shell do language server como ferramenta genérica. Iniciar processo sob consentimento e orçamento, com versão do backend, linguagem e workspace no manifesto.

Uma evidência de símbolo carrega caminho relativo, intervalo, identidade do símbolo, versão do documento e hash da representação consultada. Documento aberto na IDE pode incluir alterações não salvas: o adapter deve indicar `disk` ou `editor-buffer`, nunca atribuir um hash de disco a outro texto. Antes de editar, o executor valida sua precondição de versão.

LSP não é AST e AST não resolve toda chamada dinâmica. Relações inferidas têm um `extraction_method` e confiança separada da autorização. Renomeações cross-file exigem validação do conjunto de alterações e permissões; ficam fora da primeira integração de leitura.

O núcleo mantém FTS quando o perfil semântico está ausente. Falha de um modo explicitamente solicitado não deve ser ocultada: devolver erro ou `degraded` apenas se o chamador/host autorizou esse contrato. Um timeout não mata automaticamente um indexador de linguagem; a vaga só volta após encerramento real.

**Gate:** corpus por linguagem, nomes iguais em módulos diferentes, overloads, imports relativos, arquivos novos, buffers não salvos e referências externas. Comparar com Serena no mesmo contexto permitido, sem concluir superioridade pela latência de uma função isolada.

## 4. Recuperação híbrida sem obrigar embeddings em toda consulta

**Origem:** Basic Memory, Mem0 e Graphiti. [S11,S14,S15]

**Proposta:** consultas de identificador exato e caminho começam no lexical/estrutural. Consultas conceituais podem consultar um índice vetorial opcional. Criar embeddings por hash do chunk, modelo, dimensões e prefixos; mudança desses parâmetros invalida a compatibilidade, não apenas a cache de respostas.

A geração vetorial é publicada com um manifesto de cobertura. `pending`, `ready`, `stale` e `failed` não viram silenciosamente “pronto”. Não manter transação SQLite de escrita enquanto espera o modelo. Batches precisam de limites de bytes, tempo, concorrência e pausa sob pressão do host.

Comparar fusão por ranks (por exemplo soma ponderada de `1/(k+rank)`) com lexical puro. Não somar BM25 e cosseno sem definir normalização e estudar a distribuição. Reordenação por modelo continua opt-in; o histórico do Laya do projeto já mostrou regressão em dois workloads.

**Gate:** dataset cego de português/inglês com identificadores, acesso filtrado antes de recuperar, nenhuma mistura de modelos de embedding, cobertura declarada, recall por categoria e impacto de RAM/p95. A origem manda mais que popularidade: embeddings não aprovam uma memória.

## 5. Tempo e proveniência: aprender com Graphiti sem importar um servidor por padrão

**Origem:** fatos temporais e episódios do Graphiti, retenção ADD-only do Mem0. [S14,S15]

**Proposta:** separar o intervalo em que um fato vale de quando o sistema registrou essa informação. Manter um ID estável e revisões com `valid_from`, `valid_to`, `recorded_at`, `supersedes`, estado de revisão e âncoras. Para a primeira versão, SQLite relacional é suficiente para representar esses intervalos; isso não implementa o motor Graphiti.

Correção retroativa não apaga a resposta para “o que o sistema sabia na revisão anterior?”. Revogação de permissão interrompe recuperação futura mesmo que o fato histórico continue semanticamente verdadeiro. Exclusão por privacidade tem contrato próprio de retenção/backups e não é igual a expirar um fato.

Hash alterado coloca a âncora em estado `needs_revalidation`; não prova que a afirmação se tornou falsa. Também não basta o corpo da função ser idêntico se sua semântica depende de um contrato importado que mudou. As dependências de validade precisam ser explícitas ou a afirmação tratada de forma conservadora.

**Gate:** fatos retroativos, relógio fora de ordem, alteração de âncora, decisão substituída, reabertura de histórico, expurgo de projeto e cache antigo depois da revogação. Princípios: dado recuperado não é instrução privilegiada; memória aprovada não certifica o teste declarado pelo agente.

## 6. Handoff como contrato de tarefa, não transcrição

**Origem:** Invokta agent-session, Letta stateful e OpenMemory. [S04,S09,S16,S17]

**Proposta:** uma identidade durável da tarefa liga sessões nativas diferentes. Handoff contém objetivo, requisitos abertos, decisões, blockers, snapshot, artefatos, comandos/evidências declarados e próxima ação. Introduzir verificação separada quando houver execução observável. Um evento `tool_completed` não fecha a tarefa.

Ganchos de início e retomada são opcionais e específicos por versão de harness. Registrar somente eventos de observação que não alterem a política de autorização do cliente. Uma ferramenta instalada globalmente pode permanecer visível fora da pasta: escopo do host e carregamento da configuração local continuam controles complementares.

O modelo pode ignorar o contexto ou o cliente pode compactá-lo. Manter `delivered`, `acknowledged` e `retained` separados. Quando retenção não é demonstrável, gerar bootstrap pequeno; não mandar só IDs como se o texto estivesse na janela.

**Gate:** A → B → A em processos reais, mudança de worktree, snapshot distinto, falha entre commit e resposta, evento duplicado, cancelamento e sessões paralelas. Registrar as versões efetivas de Claude Code/Codex/VS Code; cinco exemplos de JSON não equivalem a cinco homologações.

## 7. Aprendizado com orçamento e verificador externo

**Origem:** Cognee, Letta e Dream-RSI; os mecanismos alteram objetos diferentes. [S16–S18,S26]

**Proposta:** feedback pode propor peso de ranking, nova memória ou política de recuperação. Cada proposta fixa baseline, dados de desenvolvimento, holdout, verificador, limites e rollback. A mesma entidade que gera o candidato não pode remover os casos que o reprovam ou alterar a política de segurança para passar.

O replay do PR #8 é um instrumento limitado ao histórico, não um estimador causal geral de ações inéditas. Nenhum score futuro pode aparecer na decisão antes de revelado. Hiperparâmetros escolhidos em um holdout repetidamente deixam de ser realmente fora da amostra; separar dev, validação e um conjunto final reservado.

Treinamento DPO/RLHF/RLVR é outro perfil, com pesos e custo; não deve rodar silenciosamente no MEDIUM. Sem ganho demonstrado sobre heurística simples, Laya permanece consultivo/opcional. ECE depende de binning e distribuição; confiança calibrada em média não autoriza ações nem garante todo subgrupo.

**Gate:** não inferioridade em sucesso aceito, zero violações nas invariantes testadas, gasto limitado e impacto foreground medido. Fixar previamente margem e análise; não prometer 99% apenas por ter testes unitários verdes.

## 8. Observabilidade útil sem coletar tudo

**Origem:** Langfuse, Helicone, LiteLLM e Phoenix. [S22–S25]

**Proposta:** exporter opt-in por adapter entrega usage terminal, ID da tentativa e contexto não secreto. Duplicatas usam identidade idempotente; correções usam revisão. Custo informado, estimativa por tarifa e diferença experimental permanecem trilhas separadas. Redução de payload não é token de API evitado por definição.

Langfuse permite uso/custo ingerido ou inferido e regras por preço/tier. Isso sugere preservar a fonte, validade e abrangência da tarifa, não instalar sua plataforma inteira no Mac. Helicone tem caminho assíncrono que dispensa trocar a base URL de toda chamada; ele ainda exige instrumentação. LiteLLM gerencia budget de chamadas roteadas por ele, não das que o cliente executa fora dele. Phoenix calcula ou recebe métricas conforme a instrumentação; não conhece automaticamente toda conta do usuário.

O PR #9 importa recibos explicitamente; não tem captura automática. Seu banco novo e seus testes não estão implicitamente nesta branch. Um exporter é a próxima peça antes de multiplicar gráficos. Avaliar indexação/materialização do histórico por projeto antes de elevar a frequência de atualização do painel.

**Gate:** cada retry tem ID próprio, deltas de stream não duplicam usage, recibo ausente não vira zero, nenhuma credencial/prompt cru no export, remoção por escopo e nenhuma chamada externa sem opt-in.

## 9. Ordem de execução e interface de contribuição

| Ordem | Entrega | Critério para promover |
|---|---|---|
| P0 | Corrigir contratos e integrar PRs sem perdas | CI da combinação, regressões de prazo/identidade/obrigatórios |
| P1 | Inspector e autoria legível governada | Diagnóstico fiel à mesma consulta; round-trip e CAS |
| P1 | Tarefa/verificador e handoff real | Execução aceita e evidência vinculada à revisão |
| P2 | Adapter de símbolos e indexação em worker | Recall/memória/latência medidos; cancelamento e geração segura |
| P2 | Memória temporal com âncoras | Consultas históricas e revogações testadas |
| P3 | Busca híbrida e aprendizagem opcional | Ablation e holdout demonstram benefício líquido |

Cada contribuição deve declarar perfil mínimo, dependências, destinos de rede, schema de entrada/saída, limites, versão, testes de conformidade e migração. Não carregar código de plugin descoberto num documento sem consentimento do host. Assinatura pode autenticar o autor de um pacote; não demonstra que seu comportamento é seguro.

A avaliação comparativa deve usar tarefas comuns, snapshot congelado, mesmo harness/modelo e permissões equivalentes. Registrar cold start, uso estável, cancelamento, degradação, atualização e remoção. Comparar apenas fluxos funcionalmente equivalentes: uma busca lexical sem geração não vence uma resposta fundamentada completa só por executar menos etapas.

Revisão externa significa terceiros executarem ou auditarem o método, não apenas terem uma issue ou estrela. A contribuição mais valiosa para o lançamento é um relatório reproduzível de tarefa aceita e consumo observado em MEDIUM, inclusive resultados negativos.

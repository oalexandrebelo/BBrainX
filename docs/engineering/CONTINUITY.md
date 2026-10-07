# Ponto de retomada da engenharia

Este é o contexto operacional para quem assume o BBrainX. Leia com `AGENTS.md`, execute `npm run project:status` e confira a revisão remota antes de trabalhar. O [handoff de outubro](../HANDOFF.md) conserva o histórico; não define sozinho a prioridade atual.

## Estado conhecido e identidade

- Base desta rodada: `38904c38f1d27b84afaeb56fed702d233ad4e25f`, [PR #13](https://github.com/oalexandrebelo/BBrainX/pull/13), sobre a [consolidação #12](https://github.com/oalexandrebelo/BBrainX/pull/12). As PRs #6–#11 já são ancestrais de #12. Verificar se foram incorporadas antes de abrir outra branch; não reaplicar ZIPs antigos.
- Evidência da base: [run 37675622182](https://github.com/oalexandrebelo/BBrainX/actions/runs/37675622182), 289 testes distintos em cada SO e no Node mínimo. Isso descreve essa revisão, não revisões futuras.
- Versão declarada: 0.4.0 developer preview; Node mínimo 22.20, Node 24 recomendado. A tag publicada anteriormente não representa automaticamente os novos commits.
- Repositório consultado em 07/10/2026: **público**. O registro histórico de que era privado está desatualizado. Consultar o GitHub antes de qualquer decisão de publicação ou de compartilhar informação confidencial.
- Registre o estado de trabalho com `npm run project:status`. O comando informa HEAD, branch, alterações, lockfile e se o relatório local corresponde à revisão limpa. Não consulta o remoto e não autentica o relatório: CI e revisão humana continuam necessárias para promover uma versão.

## Evolução entregue nesta rodada

Sobre a base acima: ownership MCP contra IDs em voo duplicados; replay de checkpoint sem Git e writer transaction redundantes; distribuição pelos blobs Git com manifesto v2 e ZIP verificável; SBOMs separados; status/contexto/roadmap versionados. A justificativa e os custos de desempenho estão no [livro de experimentos](PERFORMANCE.md). Consulte os checks da PR/revisão atual antes de integrar; os 289 testes da base não certificam esta evolução.

Próximo trabalho prioritário: EV-05 (corpus fixado e tarefas aceitas), EV-06 (trabalho síncrono limitado) e EV-07 (restauração do conjunto de bancos). EV-11 documenta a reprodução de saída MCP acumulada com consumidor lento. Não apresentar esses itens como concluídos.

## O que sustentar

| Área | Invariante | Onde conferir |
| --- | --- | --- |
| Autoridade | O host concede projeto; texto recuperado/argumentos não ampliam grants. | `src/engine.mjs`, `src/source-root.mjs`, `docs/SECURITY_MODEL.md` |
| Estado | CAS, fingerprint, histórico e evento do checkpoint permanecem coerentes; replay devolve resposta histórica. | `src/store.mjs`, `src/session.mjs` |
| Contexto | Obrigações aprovadas cabem integralmente ou a operação recusa; payload BPE não equivale à fatura do provedor. | `src/context.mjs`, `docs/core-contracts/REVIEW.md` |
| Lanes | Índice/checkpoint por workspace; memória aprovada vem da autoridade compartilhada. | `src/lanes/`, `docs/lanes/ARCHITECTURE.md` |
| Observatory | Recibos, estimativas e valores desconhecidos mantêm semânticas distintas. | `src/usage/`, `docs/observatory/README.md` |
| Escopo | Núcleo local, integrações/modelos opcionais; nenhum código do projeto indexado é executado. | `AGENTS.md`, `THIRD_PARTY_NOTICES.md` |

## Ciclo por contribuição

1. **Retomar:** conferir HEAD, diff, CI e [fila priorizada](ROADMAP.md). Ler apenas os módulos e decisões relevantes; recuperar o restante sob demanda. Não carregar todos os estudos em cada sessão.
2. **Delimitar:** escolher um item, declarar arquivos sob responsabilidade do colaborador, invariante, hipótese e critério de aceite. Em trabalho paralelo, coordenar arquivos compartilhados e usar clones/worktrees para mutações.
3. **Pesquisar:** registrar a pergunta específica, fonte primária, data, conclusão aplicável e condições em que ela não vale. Um link ou nome de framework não prova necessidade de integração.
4. **Demonstrar:** preservar reprodução antes da correção. Para desempenho, comparar o mesmo corpus/configuração, alternar baseline/candidato, guardar amostras e efeitos determinísticos. Rejeitar complexidade cujo ganho não supera o ruído.
5. **Verificar:** testes relevantes, `npm test`, `npm run build`; E2E para UI. Schema exige migração/rollback. Executar controles negativos apenas em checkout descartável. Não reduzir um gate para acomodar uma mudança.
6. **Revisar e entregar:** outro colaborador revisa contratos e evidência; commit pequeno, PR com revisão-base e limitações, CI da árvore entregue. Atualizar o item, a decisão alterada e o próximo ponto de retomada.

Ao interromper, deixar na PR ou no checkpoint: revisão/branch, item, resultado observado, arquivos alterados, testes executados e não executados, falha conhecida, próxima ação concreta e condições para rollback. Não declarar concluído com teste pendente. Relatório de agente é hipótese até conferir os artefatos relevantes.

## Divisão de trabalho

O mantenedor decide prioridade de produto, licença, versão/release e critérios de aceite. Colaboradores de domínio implementam fatias; um revisor distinto contesta integridade, custo e evidência. Agentes menores ficam com pesquisas delimitadas, inventários e execução reprodutível; decisões que atravessam domínios recebem revisão central. Uma pessoa ou modelo pode desempenhar papéis diferentes, mas não se deve confundir execução com revisão independente.

## Armadilhas que não devem ser repetidas

- A busca sobre o próprio repositório muda quando o corpus muda. Não mover funções ou excluir documentos só para recuperar um score. Registrar a regressão e avaliar um corpus fixado independente antes de alterar ranking.
- X99 worker/cache e laboratórios de WitnessCache/protocolo não são funcionalidades integradas. Preservar os limites em `docs/research/INTEGRATION.md`.
- Redução de leituras, tokens de payload e tempo de microbenchmark são métricas diferentes de tarefas aceitas, cobrança e receita.
- `main` pode receber um commit automático de evidências depois da CI. Conferir o remoto antes de derivar uma branch; a revisão testada e a árvore distribuída precisam de vínculo explícito.
- Não copiar banco SQLite em uso com `cp`. Usar o mecanismo de backup aplicável e ensaiar a restauração em diretório isolado. O backup do núcleo não inclui automaticamente os bancos separados de usage/lanes.

Decisão de continuidade: [ADR-0001](../decisions/0001-evidence-and-continuity.md). Preparação de produto e comercialização: [critérios](COMMERCIAL_READINESS.md). A rotina é acionada em cada contribuição; não depende de uma conversa, serviço pago ou agente permanentemente ativo.

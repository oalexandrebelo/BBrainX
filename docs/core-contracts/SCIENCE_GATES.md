# Avaliação além de recall: novos critérios para as oportunidades

Consulta em 7 de outubro de 2026. Abaixo há síntese de fontes primárias e propostas específicas; nenhum dos benchmarks acadêmicos foi executado nesta rodada. Valores dos artigos não são valores do BBrainX. Esta trilha complementa OPPORTUNITIES.md e não instala dependências.

## 1. LongMemEval: atualizações e abstenção fazem parte da qualidade

LongMemEval separa extração, raciocínio entre sessões, raciocínio temporal, atualização de conhecimento e abstenção. Seu framework diferencia indexação, recuperação e leitura. Isso é relevante para evitar que um único hit@k esconda um problema no restante do fluxo.

**Fonte:** Di Wu et al., *LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory*, ICLR 2025, arXiv:2410.10813v2. https://arxiv.org/abs/2410.10813v2

**Aplicação proposta:** incluir mudanças retroativas de decisão, duas sessões com instruções incompatíveis e pergunta sem suporte. Medir separadamente se a evidência correta foi recuperada, se o agente a usou e se deveria abster-se. Um teste de conversa não substitui execução de mudanças num repositório. A matriz deve ter trilhas separadas de memória conversacional e engenharia de código, mantendo modelos/permissões/configuração comparáveis.

## 2. GateMem: governança precisa de benchmark próprio

O benchmark GateMem avalia agentes com memória compartilhada entre vários principals, combinando utilidade de longo prazo, fronteiras de autorização e esquecimento após exclusão. Os autores reportam que os métodos examinados não satisfazem bem todas essas dimensões ao mesmo tempo. Isso não é um teste já executado pelo BBrainX.

**Fonte:** Zhe Ren et al., *GateMem: Benchmarking Memory Governance in Multi-Principal Shared-Memory Agents*, arXiv:2606.18829v1. https://arxiv.org/abs/2606.18829v1

**Aplicação proposta:** antes de um modo de equipe, demonstrar consulta em A que não revela memória de B, permissão revogada entre busca e entrega, exclusão que invalida derivados e restauração de backup que não reativa inadvertidamente uma autorização. Não resumir tudo a recall. No modo atual, vários processos do mesmo usuário do SO não são principals isolados contra ataque: testes lógicos de allowlist não demonstram isolamento do usuário local que pode abrir o banco diretamente.

## 3. MINJA: o atacante pode influenciar memória sem acesso direto ao banco

O trabalho MINJA investiga injeção de memória por interação com o agente, não pressupondo que o atacante edite diretamente o armazenamento. A versão atualizada chama-se *Memory Injection Attacks on LLM Agents via Query-Only Interaction*. Logo, uma proteção de arquivo não elimina o risco de o próprio agente propor uma memória inadequada a partir de conteúdo externo.

**Fonte:** Shen Dong et al., arXiv:2503.03704v5. https://arxiv.org/abs/2503.03704v5

**Aplicação proposta:** registrar a origem e a transformação entre observação, proposta e aprovação; manter fonte externa como dado, nunca como autoridade para ampliar escopo; e testar tentativas de promover instruções recuperadas a regras permanentes. Aprovação humana reduz a superfície automática, mas não comprova que a pessoa nunca aprove conteúdo errado. Egress e permissões de ação continuam controles separados. Os ensaios devem usar segredos-canário sintéticos e ambientes descartáveis, sem alvos ou credenciais reais.

## 4. LazyMem: preservar o original e construir contexto sob demanda

LazyMem v2 adia construção/seleção de memória para a consulta e avalia compressão condicionada ao objetivo. Seu seletor envolve modelo treinado e processamento adicional. A versão revisada altera a comparação do resumo, então não copiar multiplicadores de um snippet de v1 para v2.

**Fonte:** Jing Yu et al., *LazyMem: Retrieve Broadly, Construct Selectively for Efficient Long-Term Agent Memory*, arXiv:2607.22690v2. https://arxiv.org/abs/2607.22690v2

**Aplicação proposta:** preservar evidências canônicas e gerar materializações pequenas por consulta, ao invés de reescrever toda a história em um resumo irreversível. Antes de um seletor neural, testar a seleção determinística atual. Medir ingestão, recuperação, seleção, prefill e saída. Poucos tokens no contexto da resposta não significam poucos tokens ou pouca energia no pipeline completo. O modelo 4B da pesquisa não é uma recomendação automática para o orçamento MEDIUM do BBrainX.

## 5. RRF: combinar ordens sem confundir escalas de scores

Reciprocal Rank Fusion, de Cormack, Clarke e Buettcher, combina rankings. Seus resultados originais são de coleções de recuperação e não garantem o mesmo ganho em memória ou código.

**Fonte:** *Reciprocal rank fusion outperforms condorcet and individual rank learning methods*, SIGIR 2009, DOI:10.1145/1571941.1572114. https://doi.org/10.1145/1571941.1572114

**Hipótese a comparar:** `score(d) = soma_j peso_j / (k + rank_j(d))`, somente para resultados presentes na lista j, com ranks 1-based e parâmetros fixados no desenvolvimento. Duplicatas dentro de uma lista não acumulam votos. Filtrar autorização antes da consulta/expansão; fundir apenas índices cuja geração/cobertura foram declaradas. Candidate truncation muda o ranking e precisa constar na evidência.

Não comparar BM25 negativo do SQLite com cosseno por soma sem normalização. Não afirmar que RRF é implementação do Basic Memory: a documentação consultada daquele projeto descreve sua própria fusão de scores. Nossa hipótese precisa de ablation contra lexical puro e não deve acionar embeddings em cada busca exata de identificador.

## 6. Matriz de promoção de recursos

| Linha | Controle de qualidade | Controle de custo | Controle de segurança |
|---|---|---|---|
| Memória editável | round-trip, revisão-base, conflitos | bytes e lotes limitados | edição não herda estado aprovado |
| Memória temporal | consultas atuais/retroativas e âncoras | índices de intervalo e cobertura | revogação de acesso domina recuperação |
| Recuperação híbrida | recall/uso da evidência/tarefa aceita | ingestão + consulta + reranking | filtros antes da busca e expansão |
| Handoff | requisito e snapshot preservados | releituras/chamadas/tempo de retomada | projetos não se fundem por nome |
| Melhoria de política | holdout congelado e abstenção | orçamento por experimento | verificador/autorizações fora do controle do candidato |

**Condição de lançamento proposta:** métricas separadas de correção, governança e economia, hardware exato, versões de modelos/harnesses, negativos publicados e reprodução por terceiros. Nenhuma coluna pode ser trocada por estrelas, percentuais de confiança do modelo ou uma declaração de “zero overhead”.

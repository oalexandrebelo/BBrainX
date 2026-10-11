# Programa de benchmark MEDIUM

**Estado:** protocolo proposto e instrumentos iniciais. Esta rodada não produziu benchmark de tarefas reais em estações MEDIUM. Fixtures e runners de CI não são contabilizados como esse resultado.

## 1. Referência física e coexistência

O perfil central de lançamento é um Mac Apple Silicon com 16–24 GiB de RAM, SSD local e ao menos quatro unidades de paralelismo disponíveis. Registrar modelo exato, macOS, Node, energia, temperatura quando observável, memória total e disponível e todas as versões dos clientes. Essa faixa é uma escolha de referência, não prova estatística de que represente a maioria dos computadores da comunidade.

O programa não mantém o editor fechado para fabricar um benchmark de laboratório favorável. Executar um workload foreground versionado: IDE, language server e ações de compilação/interação definidas. Medir primeiro esse workload sem BBrainX; repetir com BBrainX na mesma sessão de energia e sob condições comparáveis. Registrar p50/p95, erros, swap/pressão quando disponível e recursos de toda a árvore BBrainX, não apenas o processo pai.

O alvo inicial é regressão de p95 foreground de no máximo 5%, sem crescimento sustentado de pressão/swap nem starvation. Esse número é critério experimental de projeto, não uma garantia já cumprida. O governador cooperativo não substitui medição nem limita sozinho RSS, energia ou GPU. A configuração de 3 GiB deve contabilizar processos auxiliares; cada harness não ganha uma cota nova independente.

Exercitar também LOW, HIGH, PRO e MAX, com o mesmo contrato de segurança e qualidade. Tiers superiores medem a curva de capacidade, não autorizam reduzir verificação ou ampliar o acesso aos projetos.

## 2. Gates antes de uma afirmação pública

`mediumEvidenceGate` aceita manifestos com revisão exata, identificador único, hash do artefato, hardware, duração e resultados. Exige pelo menos dois Macs MEDIUM nativos, 100 tarefas registradas e duas horas agregadas. Os números são uma barreira operacional inicial, não cálculo de poder estatístico ou prova de 99% de acerto.

O gate recusa duplicatas, VMs, registros sem foreground workload ou regressão fora do limite. O retorno continua `claimAllowed: false`: uma pessoa precisa conferir os artefatos e a definição das tarefas. Hash não autentica a qualidade de um experimento.

Para declarar 'a maior parte da validação de lançamento ocorreu em MEDIUM', propomos uma condição adicional de portfólio: mais da metade das execuções únicas de tarefas de aceitação da release e mais da metade de suas horas auditáveis devem pertencer à coorte MEDIUM. Publicar denominadores, não contar novamente o mesmo teste em vários relatórios e não incluir fixtures/unittests nesse universo. Essa condição ainda não tem coleta automática nesta branch.

Um resultado pode sustentar 'testado no Mac X' e não sustentar 'validado em qualquer Mac'. A extrapolação precisa de amostragem mais ampla.

## 3. Desenho pareado por tarefa

Congelar harness, modelo/revisão, snapshot inicial, permissões, dependências e critério de aceite. Comparar A, fluxo nativo, com B, mesmo fluxo mais BBrainX. Randomizar a ordem; repetir tarefas não determinísticas; separar observações frias e aquecidas. Não misturar uma chamada remota de modelo com inferência local e atribuir toda diferença à memória.

Cada tarefa deve preservar testes F2P relevantes e P2P de regressão. Solução aceita exige cumprir requisitos, manter os testes protegidos e não alterar seu verificador para obter aprovação. Um teste que foi removido não conta como reparado. Timeouts, falhas de instalação e desistências pertencem ao denominador; não medir somente casos que concluíram.

Separar conjuntos de desenvolvimento, calibração, validação e teste final por repositório ou período. Uma issue e sua solução não podem aparecer simultaneamente no treinamento do Laya, memória de contexto e holdout final. Os arquivos `.cases` não devem ser indexados como documentação da própria tarefa. Publicar hashes, processo de seleção e restrições de uso; conteúdo privado só sai mediante autorização própria.

Medições históricas de localização não são avaliações de tarefa. Os 84% top-10 da base são uma medida diferente de F2P/P2P, preservação de requisitos ou economia faturada.

## 4. Métricas e denominadores

| Métrica | Definição operacional |
|---|---|
| Task acceptance | Tarefas que satisfazem todos os critérios divididas pelas tarefas iniciadas no conjunto fixado. |
| Loc@k | Proporção dos locais de edição rotulados presentes nos k resultados, com rótulos cegos ao método avaliado. |
| F2P / P2P | Testes que passaram de falha a sucesso e testes antes aprovados que continuam aprovados; reportar ambos. |
| Requirement evidence gap | Requisitos marcados como atendidos sem evidência válida, por requisito e por tarefa. |
| Stale-fact rate | Fatos ancorados servidos com âncora/revisão incompatível, sobre fatos ancorados servidos. |
| Repeated reads | Leituras repetidas do mesmo conteúdo por tarefa, distinguindo releitura deliberada de reconstrução redundante. |
| Context payload | Tokens do pacote no encoding indicado; não confundir com input faturado do cliente. |
| Total cost per accepted task | Todas as tentativas, ingestão, recuperação e uso medido divididos por tarefas aceitas. Custos desconhecidos permanecem desconhecidos. |
| Foreground interference | Regressão pareada de latência do workload cotidiano e pressão da estação. |
| Replay support | Fração do histórico revelado e operações sem continuação registrada; não acurácia contrafactual. |
| Selective decision quality | Erro e cobertura entre decisões Laya aceitas, estratificados por tarefa, idioma e tamanho. |

Erosão, complexidade e duplicação exigem definição versionada e revisão de exceções. Um limiar absoluto de linhas por função pode induzir refatorações artificiais; usar o conjunto de restrições arquiteturais e comportamento, não uma única proxy.

Agregar métricas por tarefa/repositório antes de calcular a média geral para que um monorepo com muitos testes não domine o resultado. Usar intervalos de confiança e análise pareada, não percentuais sem incerteza. Um pequeno conjunto repetido com muitas seeds não substitui diversidade de tarefas.

## 5. Replay e contaminação

O replay atual avalia estratégias fixas sobre uma árvore registrada. Mudar prompt, modelo, ferramentas ou estado altera a distribuição das tentativas; um resultado antigo não prova o desfecho desse novo caminho. O replay nunca preenche branches não observados com pontuação inventada.

Na comparação de candidatos, manter um holdout que não foi consultado durante seleção. Limitar número de tentativas, custo e volume de explicações entregues ao melhorador. Repetir seleção sobre o mesmo teste final é overfitting adaptativo. Ganhos no histórico são sinais para um experimento online controlado, não aprovação automática.

A futura promoção deve obedecer ao vetor de restrições: zero nova violação de escopo observada, nenhuma perda de requisito obrigatório, regressão de qualidade dentro do critério pré-declarado e respeito ao orçamento de recursos. Score agregado não pode compensar vazamento de dados por alguns milissegundos ganhos.

## 6. Evidência desta branch

`node scripts/workstation-evidence.mjs` executa os testes específicos e nove combinações sintéticas de replay: 200, 2.000 e 8.000 nós com três estratégias. Mede o kernel de replay, não inferência ou qualidade de tarefa. Um único sample por combinação é um teste exploratório, não um percentil ou comparação estatística.

`node scripts/workstation-mutations.mjs` introduz três defeitos pontuais e restaura a abertura original do banco como quarto controle negativo. Cada alteração deve produzir falha de asserção, não somente erro de sintaxe. O arquivo é restaurado mesmo em falha, e a CI exige árvore limpa depois da execução. Isso não é uma taxa completa de mutation testing.

A CI geral também roda domínio, MCP e build em macOS, Linux e Windows. A identificação final é a revisão efetivamente testada; um merge ref do GitHub pode ser diferente do head da branch e precisa ser registrado como tal. Números só entram no relatório final depois de consultar a execução concluída.

## 7. Série de evolução para contribuição pública

Cada release precisa de manifesto com protocolo, revisão, conjuntos, hardware, métricas, falhas e mudanças aceitas. Uma contribuição deve trazer reprodução mínima e um teste negativo que detecte o defeito. Resultados negativos de modelo e otimização são publicados junto dos positivos. A comunidade deve conseguir rejeitar uma proposta que não preserva as invariantes, mesmo que sua demo seja visualmente impressionante.

# Oportunidades System One — decisões de escopo, 11/10/2026

Leitura focal de fontes primárias. Nada dos projetos abaixo foi instalado ou executado nesta rodada; não há benchmark neural, qualidade de tarefa ou economia financeira do BBrainX inferida dos números upstream. Os materiais descrevem mecanismos, não homologam integrações. A entrega de código deste ciclo continua sendo o lifecycle do painel.

## 1. Laya Ultrafast já existe

`ipenywis/laya-ultrafast` é um port declarado do browser-use/jev-ultrafast, com decisões locais via MLX e uma chamada de planejamento por tarefa. O planner é configurável e pode continuar remoto. O README restringe a execução a Apple Silicon, descreve perguntas pequenas combinadas com regras e ressalva que DONE precisa de verificação independente. Não é um novo nome disponível para reivindicar como invenção BBrainX. A revisão consultada por arquivo foi `571431b7d142d54f49ad962d9d083d9b7bb20040`; o README foi reconferido nesta data.

**Decisão BBrainX:** não duplicar o agente de navegador. Estudar uma ponte opcional para decisões delimitadas, com identidade de modelo e estado, custo total do planner e verificação da tarefa. O core lexical não depende desse runtime. A existência de MLX não comprova desempenho no Mac M5 do usuário.

Fonte: https://github.com/ipenywis/laya-ultrafast

## 2. Jev Ultrafast: perguntar em paralelo não significa executar em paralelo

O projeto produz uma tabela de alvos observados e pergunta operação e alvos compatíveis na mesma requisição. Só o alvo correspondente à operação escolhida é executado. Também distingue a sugestão de conclusão da verificação do resultado. Revisão consultada: `1231850a0bf1a0c0341fe408ef1668dbbfdfac46`.

**Decisão BBrainX:** a técnica útil é diminuir round trips entre consultas compatíveis sem antecipar efeitos externos. A seleção deve ficar vinculada à observação e às capacidades permitidas pelo host. Não executar duas escritas por terem sido duas perguntas no mesmo batch. Não importar credenciais, scripts de sites ou permissões de navegador.

Fonte: https://github.com/browser-use/jev-ultrafast

## 3. fast-jev-compaction: preservar texto remanescente não torna a poda sem perda

O README agrupa tool_use/tool_result por ID e conserva mensagens protegidas/recentes. Também permite remover pares ou truncar resultados. O estado enviado ao avaliador omite corpos dos resultados e pode abreviar outros campos para caber; há contagem aproximada de tokens e repetição do estado entre lotes. Logo, verbatim descreve o texto mantido, não preservação garantida de toda a informação necessária.

**Decisão BBrainX:** estudar integridade dos pares e métricas de entrada repetida. Qualquer experimento precisa comparar tarefa resolvida, requisito preservado, custo do avaliador e reidratação, além de tamanho do payload. Um hash não recupera o original sozinho; reexecutar uma ferramenta com efeitos não é descompactação. Não habilitar hook automaticamente nem substituir a compilação de contexto atual.

Fonte: https://github.com/tamaratran/fast-jev-compaction (README lido nesta data; não executado).

## 4. Jarvis: observação, sugestão e envio são estados diferentes

O projeto descreve avaliação da conversa, propostas de resposta e preenchimento do campo; o usuário envia. A documentação também diz que requisições seguem ao provedor configurado, com a chave do usuário.

**Decisão BBrainX:** reaproveitar a separação visual entre sugestão, preparação e efeito confirmado. Não incorporar leitura global de chats, screenshots ou credenciais. Uma decisão local não deve ocultar a saída de dados de outra etapa do fluxo.

Fonte: https://github.com/jev-chat/jev-chat-jarvis (README lido nesta data).

## 5. SemIf: padrão de interface não equivale ao modelo Jev

O README afirma independência de Jev/TypeSafe e leitura de probabilidades de opções de modelos abertos. Documenta caminhos Apple Silicon e compartilhamento de estado exato entre critérios. Seus resultados distinguem comparação de sistemas de equivalência semântica e registram revisão de pesos e hash do prompt.

**Decisão BBrainX:** o experimento futuro deve fixar modelo, tokenizer, backend, quantização, estado e ordem das opções. Não transportar KV entre modelos ou tratar valores numericamente parecidos como calibração demonstrada. O custo da carga e o uso de memória pertencem ao ensaio. Nenhum backend SemIf foi ativado aqui.

Fonte: https://github.com/TheoLeeCJ/SemIf-OpenJev (README lido nesta data).

## 6. ECC: concorrente concreto de memória entre harnesses

O documento Memory Vault especifica Markdown humano como fonte, adaptadores CLI/MCP, entradas não revisadas e busca lexical limitada. Leituras diretas recusam alegações de completude quando o scan está truncado ou inválido. Links de substituição não são revogação automática e memória não vira política silenciosamente.

**Decisão BBrainX:** manter a distinção entre parcial, desconhecido e vazio no painel; exportar somente escopo explícito. Avaliar interoperabilidade em uma proposta separada, sem copiar uma segunda autoridade de memória ou transformar um texto importado em memória aprovada. O documento foi lido; o runtime ECC não foi auditado integralmente nem executado.

Fonte: https://github.com/affaan-m/ECC/blob/main/docs/design/ecc-memory-vault.md

## 7. Catálogos e geração estruturada

O README AAS Core descreve composição de seleções do agente com validação estrutural, planos e níveis experimentais de suporte. A oportunidade é instalar apenas o que o host escolheu e registrar limites, não injetar milhares de skills.

Fonte: https://github.com/sickn33/agentic-awesome-skills (README lido nesta data).

Hermes, Headroom, Outlines, LM Format Enforcer e ExtractThinker permanecem candidatos do backlog, não dependências incorporadas nesta entrega. As alegações fornecidas sobre latência, liderança e zero erro não foram adotadas como medições. Uma gramática não comprova verdade factual, e uma CFG geral não se reduz a uma máquina finita equivalente sem restrições adicionais. Esse tema exige estudo e avaliação próprios, não migração do painel.

## 8. Checkpoint operacional desta rodada

Publicados: `6ee96bec` (continuidade), `b27ad6f` (alias do entrypoint e close compartilhado) e `0b89842` (timeout explícito dos testes e preservação de logs/screenhots). PR #21 está draft contra `feat/v2-macos-readiness`; versão pública continua 1.5.0.

A escrita anterior do Fastlane e a escrita posterior do módulo offline revisado foram bloqueadas pela ferramenta. Não foram reenviadas por outro canal. Um blob isolado de control.mjs não altera a branch; a mudança incompleta não foi integrada. A exportação offline endurecida permanece pendente. Não distribuir patches locais dessa tentativa como forma de contornar o bloqueio.

Próximo passo: conferir a CI do checkpoint de diagnóstico, preservar o caso Windows que não terminou, e entregar artefatos da árvore efetivamente publicada. Não confundir testes locais do módulo não publicado com validação da branch. A próxima rodada precisa de uma decisão explícita sobre as pendências e de homologação nativa do editor; não deve prometer lançamento 2.0 com esses gates abertos.

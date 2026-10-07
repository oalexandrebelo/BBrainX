# Matriz de evidência: material recebido versus verificação externa

A coluna “material recebido” preserva o sentido do anexo/mensagem. A coluna “revisão” é pesquisa externa e análise, não substituição silenciosa do texto do usuário. Fontes [Rxx] estão em FONTES.md. Leitura de abstract, método ou documentação não equivale a reproduzir um experimento.

## 1. RSI e raciocínio

| Fonte | Material recebido | Revisão e aplicação delimitada |
|---|---|---|
| Dream-RSI, arXiv:2609.14858 | Históricos como sonhos para melhorar exploração sem alterar pesos | Registro v2 consultado; replay se limita ao espaço histórico realizado. Não inferir sucesso de ramos inéditos nem ganho causal na produção. A política de exploração é diferente do modelo base e do verificador. [R36] |
| DeepSeek-R1, arXiv:2501.12948 | Raciocínio emerge por RL sobre modelo base | R1-Zero e a receita de R1 não devem ser fundidos como um único procedimento sem SFT. É pesquisa de treinamento, não método de cache do agente. Usar como referência de avaliação verificável, não instalar RL automaticamente na estação. [R37] |
| Absolute Zero, arXiv:2505.03335 | Proposer e solver em self-play sem dados humanos | “Zero data” qualifica o regime descrito de geração de tarefas; não significa modelo sem pré-treinamento ou mundo sem verificador. Executor fornece validação, e sua integridade deve ficar fora do controle do candidato. [R38] |
| STaR, arXiv:2203.14465 | Gerar justificativas corretas e ajustá-las por SFT | O método inclui bootstrapping e racionalização com respostas corretas disponíveis. Registrar como alteração de pesos, não mera memória de sessão. Selecionar pela resposta final não certifica todo passo intermediário. [R39] |
| Self-Rewarding Language Models, arXiv:2401.10020 | O modelo aprende a gerar e julgar respostas | Estudar o acoplamento entre gerador e juiz e conservar avaliação externa. Não usar autojulgamento como permissão para aprovar requisitos ou alterar política de acesso. [R40] |

## 2. RLHF, preferências e supervisão

| Fonte | Material recebido | Revisão e aplicação delimitada |
|---|---|---|
| InstructGPT, arXiv:2203.02155 | SFT → reward model → PPO | Referência de treinamento com demonstrações e preferências humanas. Não fornece implementação de memória local, cancelamento, controle de orçamento ou cache semântico. [R41] |
| DPO, arXiv:2305.18290 | Dispensa modelo de recompensa separado/PPO | Otimiza parâmetros por preferências; não garante respostas determinísticas nem substitui um conjunto de avaliação independente. Não melhora uma consulta FTS por ser importado como biblioteca. [R42] |
| Constitutional AI, arXiv:2212.08073 | Regras substituem avaliação humana | Princípios ainda são escolhidos por pessoas; método envolve crítica/revisão e feedback de IA. Não transformar a constituição em autorização probabilística ou regra que o agente possa reescrever para se aprovar. [R43] |
| Let's Verify Step by Step, arXiv:2305.20050 | Prova redução de alucinação por recompensa intermediária | A evidência é de supervisão de processo no domínio matemático estudado. “Prova” universal sobre alucinação e código não é sustentada. Transferência proposta: verificar etapas observáveis e snapshots de testes. [R44] |

## 3. Grafos, agentes e avaliação

| Fonte | Material recebido | Revisão e aplicação delimitada |
|---|---|---|
| Agent Lightning, arXiv:2508.03680 | Treinar qualquer agente com RL, separando execução e treinamento | A arquitetura desacoplada é pertinente. Uma integração de logs não concede acesso aos pesos de qualquer API proprietária e não cria recompensa válida automaticamente. [R45] |
| arXiv:2607.19297 | Graph-Based Agentic AI with LangGraph: Workflow Pathways | Título atual inclui “for Long-Running Stateful Business Processes”; o registro descreve guia de padrões e receitas, não comparação universal de qualidade/performance. [R46] |
| arXiv:2411.13768 | An Evaluation-Driven Approach to Designing LLM Agents | Registro atual: “Evaluation-Driven Development and Operations of LLM Agents: A Process Model and Reference Architecture”. Apoia avaliação ao longo do ciclo; não comprova RL automático a partir do LangSmith. [R47] |
| arXiv:2502.14820 | Postman Context Graph | Referência incorreta: é “eC-Tab2Text: Aspect-Based Text Generation from e-Commerce Product Tables”. Não usar o identificador como evidência de grafo de APIs. [R48] |
| PDF Postman fornecido | Benchmark de context graph de APIs | A tentativa de obtenção falhou. Nenhuma tabela ou imagem foi inspecionada nesta rodada; não há percentuais desse PDF na entrega. [R49] |

## 4. Jev, Laya e Ollaya

Os três títulos enviados usam a mesma homepage `awesomejev.com`, sem link individual de paper, autores, versão ou relatório de ensaio. A consulta ao catálogo não estabeleceu a fonte dos valores ECE 0,041 e Brier 0,048 nem reproduziu o ensaio. Mantemos os números como **alegações do material recebido não verificadas nesta rodada**, não como falsa medição do Laya. [R50]

“RLCD”, “Nautilus Assay” e um runtime de decisão são coisas diferentes. Mesmo com um paper identificado, ECE e Brier dependem do conjunto, classes, agregação, calibração, cobertura e baseline. Uma distribuição calibrada em média não autoriza ações e não estabelece segurança por projeto. Um engine local precisa de paridade de tokenização, packing, truncamento e checkpoint.

O histórico BBrainX fornecido descreve Laya como perfil opcional e resultados locais que não justificavam alterar o contexto por padrão. Isso é evidência histórica do mantenedor, não um benchmark desta rodada. Não se deve confundir encoder de decisão com decoder generativo e aplicar automaticamente a ele o mesmo mecanismo de cache autoregressivo.

## 5. Correções adicionais ao mapa de tecnologias

| Afirmação recebida | Estado da verificação |
|---|---|
| FastMCP Python/TS como um único projeto da comunidade Anthropic | Identificar PrefectHQ Python, counterpart `@prefecthq/fastmcp-ts` e pacote independente `punkpeye/fastmcp`. São nomes de pacote/linhas de compatibilidade diferentes. [R03–R04] |
| SDK oficial garante 100% da especificação atual | Tier, versão, feature e transporte precisam ser confrontados com os anúncios e comportamento do servidor. [R05] |
| Tool layer isola execução | Framework de orquestração não concede, por si só, sandbox de SO ou egress controlado. Proposta de isolamento é arquitetura nossa. |
| Workflow retoma exatamente a instrução que caiu | Recupera progresso lógico persistido; efeitos sem confirmação podem exigir retry/idempotência/reconciliação. [R11–R13] |
| RedisVL KNN implica submilissegundo end-to-end | Nenhum ensaio neste trabalho mediu embedding + busca + rede + validação no alvo MEDIUM. O limiar é distância, não probabilidade de equivalência. [R22–R23] |
| SGLang/vLLM implicam 80–90% de TTFT menor em todo agente | Não há comparação pareada aplicável à configuração BBrainX que sustente esse multiplicador. Reuso atua em componentes da execução, não elimina toda latência. [R24–R29] |
| Memory Layers at Scale reduz contexto de agentes sem mudança de modelo | Trata de parâmetros treináveis integrados à rede, não banco de memórias por projeto. [R14] |
| Llama 3.2 1B/3B são modelos multimodais de visão | O anúncio Meta distingue modelos textuais 1B/3B e modelos de visão 11B/90B. [R18] |
| Cada etapa de pesquisa publicada é recurso do BBrainX | Documentação não promove status. Nesta entrega só o laboratório WitnessCache foi executado; não está integrado. |

## 6. Proveniência dos dados desta entrega

**Fornecido pelo usuário:** texto do anexo, visão do produto e meta MEDIUM. Não foram enviados ao GitHub nem adicionados inteiros ao pacote de código.

**Observado por ferramenta:** main/PR #10 consultados, documentação web, execução dos 34 testes, quatro negativos e experimento do laboratório.

**Análise própria:** priorização, identidades de cache, condições de integração, invariantes, critérios MEDIUM e interpretação dos limites.

**Não observado:** speedup de tarefas reais, fatura, acurácia Laya, desempenho de Redis/SGLang/Temporal em hardware do usuário, resultados do PDF Postman ou homologação atual de todos os harnesses.

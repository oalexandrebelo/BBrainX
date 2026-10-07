# BBrainX — índice mestre de pesquisa e consolidação

**Consolidação solicitada em 07/10/2026.** Esta é a porta de entrada para os estudos e entregas antes distribuídos em branches e arquivos. O objetivo é uma PR contra `main`, sem merge automático, mudança de visibilidade, credenciais, gateways, configuração de harness ou instalação de modelos.

O histórico conserva suas datas, revisões, linguagem e limitações. Frases como “não integrado nesta rodada” descrevem a entrega original. O estado da combinação atual está em [INTEGRATION.md](INTEGRATION.md), não é inferido pela data de um documento nem pela quantidade de testes de outra branch. As fontes externas não foram reconsultadas nesta consolidação documental.

## 1. Rodadas reunidas

| Rodada | Conteúdo e entrada | Estado nesta consolidação |
|---|---|---|
| Fundação / prévias 0.2–0.4 | [Dossiê](../DOSSIER.md), [viabilidade](../FEASIBILITY.md), [perfis](../OPTIONAL_PROFILES.md), [mapa das ferramentas](../STUDY_MAP.md) | Já faz parte da base; hipóteses não viram implementação |
| Avaliação e handoff históricos | [Método](../EVALUATION.md), [handoff](../HANDOFF.md), [primeiro uso](../QUICKSTART.md) | Preservados; instruções específicas da combinação abaixo |
| Atlas X99 / PR #6 | [Atlas React Flow](../ATLAS_X99.md), [posicionamento](../POSICIONAMENTO_X99.md), `web/atlas` | Página documental incluída; estados de maturidade são históricos |
| Auditoria integral / PR #7 | [Dossiê e evidências](../auditorias/2026-10-06-auditoria-codex/README.md) | Auditoria, backlog, reproduções e evidências preservados; achado não significa corrigido |
| MEDIUM e RSI / PR #8 | [Estudo](../medium-rsi/README.md), [benchmark](../medium-rsi/BENCHMARK.md), [fontes](../medium-rsi/SOURCES.md) | Perfis, admissão cooperativa e replay incluídos; não governo global de processos |
| Observatory / PR #9 | [Guia](../observatory/README.md), [pesquisa](../observatory/RESEARCH.md), [Strata](../observatory/STRATA.md), [fontes](../observatory/SOURCES.md) | UI, normalizadores, ledger e medição opt-in incluídos |
| Contratos e concorrentes / PR #10 | [Revisão](../core-contracts/REVIEW.md), [oportunidades](../core-contracts/OPPORTUNITIES.md), [ciência](../core-contracts/SCIENCE_GATES.md) | Correções de contrato incluídas; roteiro continua separado |
| Lanes / PR #11 | [Guia](../lanes/README.md), [arquitetura](../lanes/ARCHITECTURE.md), [pesquisa](../lanes/RESEARCH.md), [regressões](../lanes/REGRESSION_HISTORY.md) | Frentes paralelas cooperativas incluídas; não sandbox do SO |
| Reuso verificável / MCP / Meta | Laboratório e estudo da entrega independente WitnessCache | Publicação como experimento; sem acoplamento automático ao core |
| Protocolo X99 de consistência e desempenho | Estudo e verificações independentes | Modelo experimental; não certifica o runtime inteiro |
| Candidato X99 de worker/cache Laya | Patch e estudo da revisão `a9636e9` | Preservação como candidato histórico; não substituir silenciosamente o compilador integrado |
| Primeiros masterplans Power Code / BBRrainX | Histórico de desenho, componentes e objetivos | Referências conceituais; código vigente tem precedência sobre alegações antigas |

## 2. Índice temático dos estudos

**Contexto e código:** FTS5, declaração versus uso, partes de identificador, glossário pt/en, orçamento BPE exato, quota de documentação, chunking por símbolos, Aider, Serena/LSP, LightRAG, análise estrutural e validade por snapshot. Consultar DOSSIER, FEASIBILITY, EVALUATION, STUDY_MAP e core-contracts/OPPORTUNITIES.

**Memória e continuidade:** OpenMemory, Basic Memory, Mem0, Graphiti/Zep, Letta/MemGPT e Cognee; autoria Markdown, CAS, proveniência, tempo de validade versus tempo de registro, propostas/aprovação/revogação, handoff por tarefa e risco de injeção de memória. Consultar core-contracts/REVIEW, OPPORTUNITIES e SCIENCE_GATES.

**RSI, treinamento e avaliação:** awesome-rsi, Dream-RSI, DeepSeek-R1/GRPO, Absolute Zero, STaR, Self-Rewarding, InstructGPT, DPO, Constitutional AI, PRM800K, Agent Lightning e LangGraph. Consultar medium-rsi e observatory/RESEARCH. Pesos, política, memória, verificador e orçamento são objetos distintos; replay não fornece resultados de ações inéditas.

**Laya e serving:** encoder de decisão, identidade de modelo/tokenizer/packing, truncamento, quantização, MPS/MLX/ONNX, SGLang/RadixAttention, vLLM/prefix caching, Unsloth, BitNet, LMCache/Mooncake e cache exato. Consultar perfis, dossiê, mapa e trilha X99. Não há promessa de shared KV entre modelos nem de ganho do Laya zero-shot.

**Strata:** hierarquia GPU/CPU/RAM/SSD, conversation parking, teste A/B/A, pressão por bytes/slots, paridade, drafting/verificação, fragmentação de tool calls e formatos de usage. Consultar observatory/STRATA. Engine não instalado por esta PR.

**MCP, contratos e execução:** Invokta, FastMCP e SDKs oficiais; transportes, autorização, identidade, deadlines, validação assíncrona Zod, LangChain/LangGraph, CrewAI/AutoGen, Temporal/Hatchet/Inngest e resultado externo desconhecido. Consultar core-contracts, estudo WitnessCache e a auditoria integral.

**Infraestrutura e algoritmos:** SuperTokens, Infisical, Medusa, SigNoz e Unkey; invalidação, rate limits, reservas, concorrência, telemetria e testes. Consultar Atlas, seu dataset e dossiê de protocolo. Estudar a técnica não instala ou incorpora a plataforma.

**Observabilidade e economia:** Langfuse, Helicone, LiteLLM, Phoenix, diferenças de `usage` OpenAI/Anthropic/Gemini/Strata, custo informado versus inferido, tarifas versionadas, moedas separadas e comparação de tarefas aceitas. Consultar observatory. Redução local de payload não é economia de cobrança comprovada.

**Meta e multimodalidade:** Memory Layers at Scale, SAM 2, S-EMBER, Llama Stack, Movie Gen, Chameleon e Spirit LM; parâmetros aprendidos versus memória de projeto e ativações; âncoras/janela recente; temporalidade causal. Consultar a rodada MCP/Meta/WitnessCache, mantendo resultados de papers separados de resultados do BBrainX.

**Paralelismo e isolamento:** Dify Sandbox, Sealos, Nocalhost, frp, werf, KubeSphere, Apple Container, Docker/OCI, Coder envbuilder e gestores de worktrees. Consultar lanes/RESEARCH e ARCHITECTURE. Worktree não confina o shell; endpoint, PID e geração não são identidades intercambiáveis.

**Interface e publicação:** React Flow/XYFlow, Atlas, painel operacional, infográfico Observatory, Remotion, monograma BX, acessibilidade e assets. Consultar BRAND, ATLAS_X99 e auditoria. Visualização de um componente não prova sua implementação.

## 3. Hierarquia de evidências

1. Código e teste da revisão integrada, com logs e ambiente.
2. Resultados históricos vinculados à sua própria revisão e população.
3. Estudo documental de fonte externa, com versão/data quando fornecidas.
4. Hipótese de arquitetura e gate ainda não executado.

Essas classes não formam uma escala automática de verdade. CI verde não é homologação de todos os harnesses, benchmark MEDIUM nativo, certificação de segurança, estudo clínico ou fatura auditada. Somar testes repetidos entre plataformas ou entre branches duplica evidência.

## 4. Preservação e privacidade

Não publicar pesos, node_modules, fontes tipográficas, bancos de usuários, transcripts, `.env`, tokens, configurações globais completas ou clones de produtos consumidores. As sínteses e códigos genéricos do projeto são o objeto da PR. Materiais de terceiros continuam referenciados, não redistribuídos integralmente.

Os documentos antigos permanecem reconhecíveis e não recebem números novos retroativamente. Links indisponíveis, atribuições corrigidas e hipóteses não verificadas permanecem registrados nos estudos originais. A consolidação não refaz todos os ensaios científicos citados.

# Fontes consultadas — 7 de outubro de 2026

Leitura documental e inspeção dos caminhos indicados, não reprodução de benchmarks dos autores. Fonte comercial descreve seu produto; não constitui validação independente. Commits fixados quando disponíveis. Links em main/documentação devem ser reconferidos antes de instalação ou alegação futura.

- **S01** Invokta main `f1e2f04f98c967ab4bb73bd02c3fa581f04ce0e5`: https://github.com/vinilana/invokta/commit/f1e2f04f98c967ab4bb73bd02c3fa581f04ce0e5 — revisão idêntica à auditoria anterior.
- **S02** Invokta README: https://github.com/vinilana/invokta/blob/f1e2f04f98c967ab4bb73bd02c3fa581f04ce0e5/README.md — contratos, entrypoints, tooling e escopo.
- **S03** Invokta changelog: https://github.com/vinilana/invokta/blob/f1e2f04f98c967ab4bb73bd02c3fa581f04ce0e5/CHANGELOG.md — dependências, OpenAPI, paths MCP e instalação.
- **S04** Agent Session Engine: https://github.com/vinilana/invokta/blob/f1e2f04f98c967ab4bb73bd02c3fa581f04ce0e5/examples/agent-session-engine/README.md — persistência, limites, hooks e controle de revisão.
- **S05** BBrainX capability base: https://github.com/oalexandrebelo/BBrainX/blob/a9636e9402e3fa673ae05b3489202da1048aef5e/src/capability.mjs — código do prazo e isolamento.
- **S06** BBrainX context base: https://github.com/oalexandrebelo/BBrainX/blob/a9636e9402e3fa673ae05b3489202da1048aef5e/src/context.mjs — compactação e leitura repetida.
- **S07** Remoção de OpenMemory no monorepo: https://github.com/mem0ai/mem0/commit/ea2ee0758635a9230bd60855c3fe339170f6cd18 — 29/07/2026, commit #6530.
- **S08** Lançamento OpenMemory: https://mem0.ai/blog/introducing-openmemory-mcp — guia histórico com armazenamento local e configuração de chave externa.
- **S09** OpenMemory atual: https://mem0.ai/openmemory — página de produto, captura e memória por projeto.
- **S10** Basic Memory README: https://github.com/basicmachines-co/basic-memory — AGPL-3.0 declarada, Markdown, grafo e modos de distribuição.
- **S11** Basic Memory semantic search: https://docs.basicmemory.com/concepts/semantic-search — modos, índices e custo do reranking.
- **S12** Basic Memory inspection: https://docs.basicmemory.com/concepts/semantic-search#inspecting-retrieval — diagnóstico da mesma execução e estados do índice.
- **S13** Basic Memory MCP App: https://docs.basicmemory.com/cloud/mcp-app — UI de revisão no escopo Cloud documentado.
- **S14** Mem0 README: https://github.com/mem0ai/mem0 — algoritmo atual e distinção de placar gerenciado/OSS.
- **S15** Graphiti README: https://github.com/getzep/graphiti — tempo, episódios, recuperação e distinção de Zep.
- **S16** Letta repositório: https://github.com/letta-ai/letta — redireciona desenvolvimento atual a letta-code.
- **S17** Letta stateful agents: https://docs.letta.com/concepts/stateful-agents — MemFS, conversas e armazenamento local/nuvem.
- **S18** Cognee README: https://github.com/topoteretes/cognee — GLiNER local, código, sessões e limites do extrator de demonstração.
- **S19** Serena README: https://github.com/oraios/serena — LSP/IDE, símbolos e capacidades por backend.
- **S20** Serena memories: https://oraios.github.io/serena/02-usage/045_memories.html — Markdown, escopos, read-only, descoberta e manutenção.
- **S21** Serena configuração: https://oraios.github.io/serena/02-usage/050_configuration.html — configuração em camadas e projetos confiáveis.
- **S22** Langfuse tokens e custos: https://langfuse.com/docs/observability/features/token-and-cost-tracking — uso/custo ingerido ou inferido, tiers e versões.
- **S23** Helicone async: https://docs.helicone.ai/getting-started/integration-method/async — referência de integração sem proxy; adoção pendente.
- **S24** LiteLLM cost tracking: https://docs.litellm.ai/docs/proxy/cost_tracking — referência para chamadas que passam pelo proxy.
- **S25** Phoenix cost tracking: https://arize.com/docs/phoenix/tracing/how-to-tracing/cost-tracking — referência de custo a partir da instrumentação.
- **S26** Dream-RSI v2: https://arxiv.org/abs/2609.14858 — registro consultado; alteração em 06/10/2026; replay não é contrafactual irrestrito.
- **S27** arXiv 2502.14820: https://arxiv.org/abs/2502.14820 — eC-Tab2Text, não Postman Context Graph.

**Fonte indisponível nesta rodada:** https://voyager.postman.com/pdf/postman-context-graph-api-benchmarking-report.pdf — a nova tentativa de acesso falhou. Não citamos tabelas do PDF como inspecionadas.

Os quatro documentos recebidos foram utilizados como contexto histórico e de requisitos. Não foram copiados para o repositório, nem seus caminhos particulares, bancos ou configurações de produtos consumidores. Código de Basic Memory, Mem0, Graphiti, Cognee, Serena, Letta e Invokta não foi incorporado nesta branch.

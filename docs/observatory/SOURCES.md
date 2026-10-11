# Fontes primárias e limites

Consulta: 7 de outubro de 2026. Leitura não equivale a reprodução de benchmark. Referências de bibliotecas não significam dependências adicionadas.

- **R01 — OpenAI Prompt Caching**: https://developers.openai.com/api/docs/guides/prompt-caching — documentação consultada; contadores e partições de cache.
- **R02 — Anthropic Prompt Caching**: https://platform.claude.com/docs/en/build-with-claude/prompt-caching — documentação consultada; input/read/write/TTL.
- **R03 — Gemini UsageMetadata**: https://ai.google.dev/api/generate-content#UsageMetadata — documentação consultada; prompt, candidates, thoughts.
- **R04 — SQLite WAL**: https://sqlite.org/wal.html — contrato de armazenamento local.
- **R05 — Strata README**: https://github.com/Niko1221/Strata/blob/82f46a8c8f475f001ad76d92f58f4a4f8ffb0253/README.md — código/documentação lidos; requisitos, sem execução.
- **R06 — Strata arquitetura**: https://github.com/Niko1221/Strata/blob/82f46a8c8f475f001ad76d92f58f4a4f8ffb0253/docs/HOW_IT_WORKS.md — leitura de arquitetura, sem reprodução.
- **R07 — Strata detalhes**: https://github.com/Niko1221/Strata/blob/82f46a8c8f475f001ad76d92f58f4a4f8ffb0253/docs/DETAILS.md — leitura; quantização e reprodutibilidade relatadas pelo autor.
- **R08 — Strata paridade**: https://github.com/Niko1221/Strata/blob/82f46a8c8f475f001ad76d92f58f4a4f8ffb0253/tools/conversation_cache_parity.py — inspeção de código, não execução.
- **R09 — Strata parser de ferramentas**: https://github.com/Niko1221/Strata/commit/82f46a8c8f475f001ad76d92f58f4a4f8ffb0253 — commit lido; invariância de fragmentação.
- **R10 — Strata usage Responses**: https://github.com/Niko1221/Strata/blob/82f46a8c8f475f001ad76d92f58f4a4f8ffb0253/serve/responses.py — shape de usage inspecionado.
- **R11 — Invokta**: https://github.com/vinilana/invokta — README consultado; contrato, acesso, adapters.
- **R12 — MCP transports**: https://modelcontextprotocol.io/specification/2026-07-28/basic/transports — especificação consultada.
- **R13 — Dream-RSI**: https://arxiv.org/abs/2609.14858 — registro e texto v2 consultados; sem reprodução.
- **R14 — DeepSeek-R1**: https://arxiv.org/abs/2501.12948 — registro/abordagem consultados.
- **R15 — Absolute Zero**: https://arxiv.org/abs/2505.03335 — registro/abordagem consultados.
- **R16 — STaR**: https://arxiv.org/abs/2203.14465 — registro/abordagem consultados.
- **R17 — Self-Rewarding Language Models**: https://arxiv.org/abs/2401.10020 — registro/abordagem consultados.
- **R18 — InstructGPT**: https://arxiv.org/abs/2203.02155 — fonte original de treinamento, não método implementado.
- **R19 — DPO**: https://arxiv.org/abs/2305.18290 — fonte original de treinamento, não método implementado.
- **R20 — Constitutional AI**: https://arxiv.org/abs/2212.08073 — registro consultado, sem reprodução.
- **R21 — Lets Verify Step by Step**: https://arxiv.org/abs/2305.20050 — registro consultado; domínio matemático.
- **R22 — Agent Lightning**: https://arxiv.org/abs/2508.03680 — registro consultado, não integrado.
- **R23 — LangGraph Workflow Pathways**: https://arxiv.org/abs/2607.19297 — registro consultado; guia de padrões.
- **R24 — Evaluation-Driven Development and Operations**: https://arxiv.org/abs/2411.13768 — registro consultado; título atual corrigido.
- **R25 — eC-Tab2Text, não Postman**: https://arxiv.org/abs/2502.14820 — atribuição do prompt corrigida.
- **R26 — Postman Context Graph**: https://blog.postman.com/introducing-the-context-graph-api-one-map-of-your-api-ecosystem/ — artigo oficial consultado; PDF fornecido indisponível nesta sessão.
- **R27 — Ollaya**: https://github.com/ollaya-dev/ollaya — README atual consultado; não instalado.
- **R28 — Langfuse uso/custo**: https://langfuse.com/docs/observability/features/token-and-cost-tracking — documentação consultada.
- **R29 — Helicone propriedades**: https://docs.helicone.ai/features/advanced-usage/custom-properties — documentação consultada.
- **R30 — LiteLLM custos**: https://docs.litellm.ai/docs/proxy/cost_tracking — documentação consultada.
- **R31 — Phoenix custos**: https://arize.com/docs/phoenix/tracing/how-to-tracing/cost-tracking — documentação consultada.
- **R32 — Blueprint**: https://github.com/palantir/blueprint — referência de UI, não instalada.
- **R33 — OpenAI Node SDK**: https://github.com/openai/openai-node — referência de SDK, não instalada nesta rodada.
- **R34 — Octokit**: https://github.com/octokit/octokit.js — referência de SDK, não instalada nesta rodada.
- **R35 — OpenAPI TypeScript**: https://github.com/openapi-ts/openapi-typescript — referência de tipos, não validação em runtime.
- **R36 — MCP TypeScript SDK**: https://github.com/modelcontextprotocol/typescript-sdk — referência de interoperabilidade; já usado em testes da base.

PDF fornecido: https://voyager.postman.com/pdf/postman-context-graph-api-benchmarking-report.pdf — tentativa de acesso falhou; não inspecionamos tabelas ou imagens deste arquivo.

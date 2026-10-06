# Fontes e rastreabilidade — consulta de 6 de outubro de 2026

A seleção abaixo é primária: artigos dos autores, implementação ou documentação dos mantenedores. Não representa execução de todos os repositórios nem reprodução de todas as pesquisas. A aplicação específica ao BBrainX é proposta própria, salvo o código e as provas explicitamente entregues. Não foi importado o catálogo inteiro do awesome-rsi para o runtime.

## RSI, treinamento e avaliação

| ID | Fonte | Natureza e uso |
|---|---|---|
| S01 | https://github.com/theseus-labs-rsi/awesome-rsi | Catálogo e taxonomia L1–L5; separar objeto alterado, persistência e controle externo. |
| S02 | https://arxiv.org/abs/2609.11873 | Survey: The Last AI Built by Humans: Toward Genuine Recursive Self-Improvement. |
| S03 | https://arxiv.org/html/2609.14858v1 | Dream-RSI; inspeção da interface de replay e limites da seleção no histórico. Código indicado pelos autores: https://github.com/zhengkid/Dream-RSI . |
| S04 | https://arxiv.org/abs/2203.02155 | Training language models to follow instructions with human feedback; RLHF. |
| S05 | https://arxiv.org/abs/2305.18290 | Direct Preference Optimization: Your Language Model is Secretly a Reward Model. |
| S06 | https://arxiv.org/abs/2212.08073 | Constitutional AI: Harmlessness from AI Feedback. |
| S07 | https://arxiv.org/abs/2212.10560v2 | Self-Instruct: Aligning Language Models with Self-Generated Instructions. |
| S08 | https://arxiv.org/abs/2310.01377v2 | UltraFeedback; usar título/versão atuais, não transformar feedback sintético em verdade independente. |
| S09 | https://arxiv.org/abs/2305.20050 | Let's Verify Step by Step; supervisão de processo no domínio avaliado. |
| S10 | https://arxiv.org/abs/2203.14465v2 | STaR: Bootstrapping Reasoning With Reasoning. |
| S11 | https://arxiv.org/abs/2401.10020v3 | Self-Rewarding Language Models. |
| S12 | https://arxiv.org/abs/2402.01306 | KTO: Model Alignment as Prospect Theory. |
| S13 | https://arxiv.org/abs/2310.12036 | A General Theoretical Paradigm to Understand Learning from Human Preferences; IPO. |
| S14 | https://arxiv.org/abs/2402.03300v3 | DeepSeekMath; origem do GRPO no trabalho citado. |
| S15 | https://arxiv.org/abs/2609.37143 | LoLBench; distinguir assistência derivada das referências de um localizador cego. |
| S16 | https://arxiv.org/abs/2606.30573 | SWE-INTERACT; interação e falhas de agentes. A proporção aproximada citada no anexo não foi reafirmada nesta revisão. |
| S17 | https://arxiv.org/abs/2603.24755 | SlopCodeBench, revisão v2 consultada: percentuais diferentes dos do documento recebido. |
| S18 | https://arxiv.org/abs/2503.09089v2 | LocAgent; localização com grafos e modelos específicos. |
| S19 | https://arxiv.org/abs/2603.27277 | Codebase-Memory; qualidade de respostas não equivale ao ranking de arquivos do BBrainX. |
| S20 | https://arxiv.org/abs/2510.04618 | Agentic Context Engineering; atualizações estruturadas de contexto. |
| S21 | https://github.com/karpathy/autoresearch | Programa de experimentos delimitados; não executado nesta rodada. |
| S22 | https://arxiv.org/abs/2507.19457 | GEPA; evolução de prompts por reflexão e avaliação. |
| S23 | https://arxiv.org/abs/2505.22954 | Darwin Gödel Machine; melhoria empírica de agentes. |
| S24 | https://arxiv.org/abs/2609.24974 | Harness-Zero: Harness Distillation via Agent-as-Harness. |
| S25 | https://arxiv.org/abs/2601.21557 | Meta Context Engineering via Agentic Skill Evolution. |

## Runtime, conexão e comparadores

| ID | Fonte | Natureza e uso |
|---|---|---|
| S26 | https://github.com/NandhaKishorM/laya | Laya existente; nenhum peso modificado ou inferência executada nesta rodada. Alternativa estudada: https://github.com/receptron/laya . |
| S27 | https://github.com/DeusData/codebase-memory-mcp | Comparador de recuperação estrutural; efeitos de instalação e claims precisam de validação própria. |
| S28 | https://github.com/oraios/serena | Recuperação e navegação semântica por language servers. |
| S29 | https://aider.chat/docs/repomap.html | Mapa de repositório sob orçamento e orientação por relações. |
| S30 | https://sqlite.org/isolation.html | Snapshots e isolamento; base do tratamento de startup sem writer desnecessário. |
| S31 | https://developers.openai.com/codex/config-basic | Configuração Codex, precedência e projetos confiáveis. |
| S32 | https://developers.openai.com/codex/mcp | MCP no Codex, comando stdio e opções da conexão. |
| S33 | https://github.com/morluto/rea | Evidências e inspeção; somente padrões foram considerados. |
| S34 | https://github.com/zhaoxuya520/reverse-skill | Registro declarativo e regressões; nenhuma ferramenta ou skill instalada. |
| S35 | https://github.com/ScrapeGraphAI/Scrapegraph-ai | Pipeline de ingestão, distinto de memória de projeto. |
| S36 | https://github.com/getmaxun/maxun | Referência de automação/empacotamento; não incorporada ao código. |
| S37 | https://nodejs.org/api/process.html | Sondagens do runtime e contabilidade de CPU/memória; não substituem pressão/energia nativas. |

## Materiais recebidos

- `CODEX-PROJECT-CONNECTION.md`: orientação local de 06/10/2026 e pendências de implementação.
- `HANDOFF.md`: estado e medições históricas, com complemento de conexão em 06/10/2026.
- `QUICKSTART.md`: primeiro uso e limites reais dos contratos.
- `BBrainX-conceito-e-benchmark.md`: hipóteses de arquitetura, dimensionamento e método.

A síntese preserva a diferença entre os três documentos operacionais e o documento conceitual. Os quatro originais não são copiados automaticamente para a publicação. Os resultados do mantenedor permanecem históricos; números de papers permanecem resultados daqueles autores e configurações. Reproduções novas pertencem aos artefatos da CI e ao futuro programa MEDIUM, com sua revisão exata.

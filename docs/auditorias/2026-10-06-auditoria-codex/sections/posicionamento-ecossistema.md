# Posicionamento e interoperabilidade — 6 de outubro de 2026

O posicionamento defensável é **contexto local verificável, memória aprovada e continuidade por checkpoint para agentes de código**. A base 0.4.0, SHA `a9636e9402e3fa673ae05b3489202da1048aef5e`, compõe mecanismos conhecidos com governança explícita. Ainda falta demonstrar ganho em tarefas aceitas, independência entre ambientes e troca real de harness. MCP funcionando, classificação neural rápida ou um atlas navegável não estabelecem essas propriedades.

Esta seção consultou fontes primárias atuais na web e documentos/código local, sem instalar, executar upstreams, alterar configurações ou acessar credenciais. Branches upstream móveis foram observadas nesta data; não são as revisões pinadas do perfil instalado. Resultados locais de execução citados foram produzidos pela seção de bancada desta auditoria.

## Os 37 itens do estudo versus dependências reais

`docs/STUDY_MAP.md` contém **6 núcleo + 3 perfil + 14 técnica + 6 referência + 8 fora = 37 itens**, não 37 dependências. A tabela conserva as categorias editoriais. Todas as linhas referem-se a `/Users/alexandrebelo/Projetos/BBrainX/repo/`.

| Item | Categoria | Relação efetiva e limite | STUDY_MAP linhas |
|---|---|---|---|
| SQLite/FTS5 | Núcleo | Embutido em Node; persistência/busca | 19–31 |
| Motor de capacidades próprio | Núcleo | Código local; sem Invokta runtime | 33–45 |
| MCP próprio | Núcleo | Transporte e adaptação locais | 47–59 |
| Busca PT/EN em duas etapas | Núcleo | Técnica local lexical | 61–73 |
| Contexto com orçamento | Núcleo | Código local; checkpoint abreviado pode perder decisões | 75–87 |
| Zod/tokenizador/React Flow | Núcleo | Três pacotes agrupados em um item | 89–101 |
| Laya | Perfil | Python opt-in; não decide contexto | 107–121 |
| Remotion | Perfil | Material de apresentação; pacote separado | 123–137 |
| SDK MCP oficial | Perfil | Dependência de desenvolvimento/teste legado | 139–153 |
| Invokta | Técnica | Desenho aproveitado; dependência removida | 159–171 |
| Contrato de decisão Laya | Técnica | Inspirou validação/abstenção; não autoridade | 173–185 |
| fast-jev-compaction | Técnica | Preservação determinística; lacuna no checkpoint | 187–199 |
| jev-ultrafast | Técnica | Validação antes de agir | 201–213 |
| SemIf-OpenJev | Técnica | Recusar truncamento; modelo não instalado | 215–227 |
| LightRAG | Técnica | Recuperação em níveis; sem grafo no núcleo | 229–241 |
| OmniRoute | Técnica | Gateway do host; fora das chamadas BBrainX | 243–255 |
| plandex | Técnica | Reforço de declarações; sem parser estrutural | 257–269 |
| mem0 | Técnica | Deduplicação/relevância; sem SDK importado | 271–283 |
| ECC | Técnica | Separar observado de declarado; sem pacote completo | 285–297 |
| agy-staff | Técnica | Handoff local inspirado; não delegação instalada | 299–311 |
| Artigos Akita | Técnica | Método; OKF não implementado | 313–325 |
| Literatura científica | Técnica | Avaliação pareada/intervalos; não dependência | 327–339 |
| LOGO-DESIGN-SKILL | Técnica | Processo de identidade; fora do runtime | 341–353 |
| system-design-101 | Referência | Consulta; sem material incorporado | 359–371 |
| awesome-system-design-resources | Referência | Lista consultada | 373–385 |
| system-design-and-architecture | Referência | Notas consultadas | 387–399 |
| Back-End-Developer-Interview-Questions | Referência | Perguntas consultadas | 401–413 |
| free-for.dev | Referência | Catálogo; nenhuma conta exigida | 415–427 |
| awesomejev.com | Referência | Triagem; nada executado | 429–441 |
| JEV hospedado | Fora | Nenhuma chamada; política de escopo local | 447–459 |
| jev-chat-jarvis | Fora | Captura de tela/conversa rejeitada | 461–473 |
| LlamaFactory | Fora | Sem gerador próprio; treinamento Laya separado | 475–487 |
| needle | Fora | Evidência insuficiente para recuperação | 489–501 |
| e5 multilíngue | Fora | Ablação inconclusiva; não integrado | 503–515 |
| OpenHands | Fora | Executor externo possível; cliente não homologado | 517–529 |
| Dossiê X99 Power Code | Fora | Instalação/configurações prometidas sem prova | 531–543 |
| Pilha X99: Biome/MetaGPT/kbar/MagicUI/Pixel-Agents/public-apis | Fora | Ferramentas alheias à função central | 545–557 |

`package.json:25–35` tem **cinco dependências diretas de produção** (`@xyflow/react`, `gpt-tokenizer`, React, React DOM, Zod) e três de desenvolvimento (SDK MCP, Playwright, Vite). Laya fica em ambiente Python separado; Remotion possui lock separado. A categoria “perfil” do SDK não significa serviço opcional do usuário. `docs/upstreams.json:1–17` lista somente **15 repositórios**, outro universo: não coincide com os 37 itens. `scripts/sources.mjs:8–24` resolve HEAD, opcionalmente clona, registra hash/licença e não executa scripts upstream; baixar fontes não instala capacidades. Não executei esse script.

## Onde as referências se encaixam

| Referência atual | Capacidade afirmada na fonte primária | Relação com BBrainX e limite da comparação |
|---|---|---|
| Serena | Recuperação e edição por símbolos; LSP padrão, alternativa JetBrains. Referências/diagnósticos dependem do backend; memória pode ser desativada e há ferramenta de shell. | É candidato a complementar precisão estrutural, hoje ausente. Consumir somente ferramentas concedidas pelo host; evitar segunda autoridade de memória. Não foi instalado nem comparado em tarefas. [Serena](https://github.com/oraios/serena). |
| Mem0 OSS/plataforma | OSS usa LLM, embeddings e armazenamento configuráveis. Documentação atual coloca Graph Memory na plataforma; métricas do README usam stack gerenciada e otimizações próprias. | Memória ativa automática tem governança diferente da aprovação humana local. Benchmark de conversa gerenciado não mede retrieval de arquivo, handoff ou o SDK local. Não copiar percentuais de economia para BBrainX. [Configuração OSS](https://docs.mem0.ai/open-source/configuration), [README Mem0](https://github.com/mem0ai/mem0). |
| Graphiti/Zep | Graphiti mantém episódios, validade temporal e recuperação híbrida incremental. OSS requer infraestrutura de grafo/provedores; Zep é plataforma gerenciada distinta. | Útil para relações que mudam no tempo, se casos reais exigirem. Acrescenta ingestão, modelos e operação; não substituir SQLite nem afirmar call graph a partir de relações inferidas. [Graphiti](https://github.com/getzep/graphiti). |
| Letta | Repositório atual `letta` encaminha desenvolvimento para `letta-code`. Harness possui memória/identidade e reescrita de contexto; estado e conversas podem residir na Letta Cloud, executando em máquinas distintas. | É um harness com estado, não só serviço de contexto. Trocar BBrainX por ele mudaria autoridade, armazenamento e fluxo. Capacidade de sincronização do Letta não prova sincronização do BBrainX. [Migração](https://github.com/letta-ai/letta), [Letta Code](https://github.com/letta-ai/letta-code). |

Essas referências demonstram que memória persistente, MCP e recuperação estruturada já existem no ecossistema. A hipótese de diferencial do BBrainX é a combinação pequena de **aprovação humana, escopo concedido pelo host, evidência de fonte e checkpoint transacional**, cuja utilidade precisa ser medida. Não há benchmark pareado atual, revisão externa de segurança ou evidência para classificá-lo como superior. O catálogo descreve estudo; não concede licença, compatibilidade ou autorização de execução.

## Laya: três superfícies, métricas diferentes

O perfil instalado usa **Python `laya` 0.3.26**, checkpoint multilingual pinado, PyTorch/MPS. O upstream original `NandhaKishorM/laya` hoje também publica `laya-ts` e suporte ONNX. Seu README reconhece limite padrão de 1.024 tokens, opção até 8.192 no multilingual e checkpoints excessivamente confiantes; limiar e precisão numérica exigem validação própria. Esse estado móvel não é uma atualização automática do pacote pinado. “33 ms” publicitário não especifica a população desta auditoria. [Laya original](https://github.com/NandhaKishorM/laya).

`receptron/laya` é outra implementação Node/TypeScript, com `onnxruntime-node`, tokenizador Hugging Face e provider padrão CPU; aceita bundle local e opções de sessão. README informa download fp32 de aproximadamente 1,7 GB e cerca de 2 GB de RAM mais batch. Não foi instalada, e esses tamanhos não são os pesos/PyTorch medidos aqui. Paridade de tokenizer, opções, truncamento, temperaturas, outputs e hardware precede qualquer troca. [Receptron README](https://github.com/receptron/laya), [implementação da sessão](https://github.com/receptron/laya/blob/main/src/laya.ts).

A bancada local desta auditoria repetiu o fixture existente: **64 pares sintéticos rotulados manualmente, 19 positivos**, sem holdout independente. Lexical: accuracy **0,734**, F1 **0,320**; Laya noul: **0,563/0,391**; choice: **0,516/0,492**. Prever sempre negativo acerta **0,703**. Assim, Laya ganhou recall/F1 e perdeu accuracy/precisão nesta amostra; a frase “pior em tudo” seria falsa. Nenhum desses resultados autoriza omitir políticas obrigatórias. Evidência: `../evidence/laya-real-benchmark.json`.

Carga **4.155 ms**; p50 **6,2 ms/par amortizado**, batch 16, não latência de requisição. Pico amostrado do worker **1.925.664 KiB ≈1,84 GiB**; memória GPU não avaliada. RSS, tamanho de pesos, latência individual, throughput, acurácia de decisão e tarefa aceita são medidas distintas. Evidência: `../evidence/laya-resource.json`. Recuperação lexical avaliada em 79 consultas tampouco se compara diretamente com esse classificador ou LoCoMo/LongMemEval.

## Interoperabilidade: o que está provado

`src/clients.mjs:8–18` imprime configurações para Claude Code, Codex CLI, Cursor, VS Code e Gemini CLI. Fixa `--project` e `BBRAINX_HOME`; não grava configurações. `docs/HANDOFF.md:22–23` relata conexão de Claude Code 2.1.263 e chamada real de busca por Codex CLI 0.160.0; faltam provas dos outros três e de tarefa real. Documentação de formato e testes do fio MCP não são execução de cliente nativo.

O processo stdio de cada harness é independente. Usar mesmo diretório de estado permite ler checkpoints/memórias do mesmo projeto; não cria daemon, worker ou cache compartilhados. MCP não transfere histórico privado, permissões nativas, contexto oculto, credenciais ou tensores KV do cliente. Não há prova de continuidade Mac→Windows, sincronização entre máquinas, Codex App, Claude Desktop ou de uma tarefa concluída após troca de harness. A CI de núcleo nas três plataformas não preenche essas lacunas.

Há uma divergência operacional: `src/clients.mjs:15` aconselha nomes por projeto, mas gera sempre `bbrainx`; `docs/prompts/ACTIVATE.md:18,70,81,96` oscila entre nome fixo e nome por projeto. Um cadastro global pode aparecer em sessões de outro repositório (`HANDOFF:150`); o argumento obrigatório identifica, sem ampliar autorização. Corrigir o gerador/procedimento antes de divulgar configuração multiprojeto.

O formato VS Code impresso, `.vscode/mcp.json` com `servers`, continua documentado, mas a orientação atual prefere `.mcp.json` portátil com `mcpServers`; Agent Host não lê diretamente `.vscode/mcp.json`. Servidor pode executar local ou remotamente conforme configuração. Sandbox stdio documentado existe no macOS/Linux, não Windows. Settings Sync replica configuração: inferir que isso replica SQLite/memórias seria indevido. [Documentação VS Code](https://code.visualstudio.com/docs/agent-customization/mcp-servers). Estas diferenças pedem teste por versão/ambiente, sem abrir configurações pessoais nesta auditoria.

## Seis oportunidades, com gate de adoção

| Ordem | Trabalho viável | Prova antes de ampliar dependências/capacidade |
|---|---|---|
| 1 | Fechar integridade de contexto: decisões/bloqueios obrigatórios e identidade da raiz autorizada | Regressões de orçamento, troca de symlink/rename e revogação; preservar conteúdo obrigatório ou recusar explicitamente. Achados atuais constam nas seções documental/runtime. |
| 2 | Validar continuidade entre clientes reais e nomes por projeto | Tarefa fixada: cliente A grava CAS; B retoma, encontra pendências, respeita revogação e entrega aceite. Registrar versões/SO/SHA; conflito, reinício e dois projetos. Testar Windows e Mac separadamente. |
| 3 | Consolidar autoridade local antes de daemon compartilhado | Primeiro medir duplicação de processos/RSS/carga. Só depois socket/pipe opt-in com identidade, grants, gerações, cancelamento por assinante e recuperação; nenhum grant ampliado pelo cache. |
| 4 | Experimentar símbolos/referências por perfil Serena/LSP ou parser limitado | Mesmo corpus, orçamento e holdout; comparar lexical com estrutura em tarefas multifile, p95, completude e erros. Somente leitura concedida; manter memória canônica no BBrainX. |
| 5 | Avaliar decisão estreita Laya sem alterar obrigatórios | Comparar lexical, maioria e modelo barato; separar treino/calibração/holdout. Reportar precisão/recall/F1, cobertura/risco, truncamento, frio/quente, RSS/GPU e latência de requisição. ONNX somente após paridade. |
| 6 | Intercâmbio explícito e avaliação do valor final | JSON/Markdown aprovado com IDs, fonte, versões e revogação; round-trip sem duplicar evidência. OKF apenas após schema/teste. Medir tarefa aceita/retrabalho e custo observável; tokens do pacote não viram billing. |

Manter lexical/SQLite como baseline e perfis opt-in. Publicar inicialmente uma demonstração reproduzível de handoff com limites e falhas visíveis. Adotar um mecanismo novo somente quando um gate mostrar ganho suficiente para seu custo operacional; o Atlas da PR #6 documenta arquitetura e não altera a maturidade do runtime.

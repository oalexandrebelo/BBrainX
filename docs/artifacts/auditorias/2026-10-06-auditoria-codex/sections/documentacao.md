# Auditoria documental do BBrainX — 6 de outubro de 2026

O conjunto sustenta uma **prévia local 0.4.0 com memória governada, checkpoints transacionais, recuperação lexical e perfil Laya opt-in**. Não sustenta um daemon compartilhado entre harnesses, cache global de decisões, integração do protocolo X99, economia financeira, tarefa completa homologada ou liderança de mercado. Há documentação cuidadosa sobre essas fronteiras, mas também uma divergência material sobre preservação de decisões/bloqueios na compactação de checkpoints e documentos históricos facilmente confundidos com o estado atual.

## Escopo, leitura e classificação

`git rev-parse HEAD`, executado somente para leitura em `/Users/alexandrebelo/Projetos/BBrainX/repo`, confirmou `a9636e9402e3fa673ae05b3489202da1048aef5e`. Os seis arquivos textuais/JSON de `pesquisa/news` foram lidos **integralmente**, incluindo referências: 2.130 linhas e 163.638 bytes. `.DS_Store` foi excluído. Foram lidos integralmente README, onze documentos pertinentes de `repo/docs`/prompts, o relatório CI e benchmark macOS, LEIA-ME e três dossiês/guias da raiz. O relatório de validação 0.2 da raiz foi consultado parcialmente, linhas 1–180, e não é apresentado como leitura integral. Manifesto verificável: `../evidence/leitura-news.json`.

Não executei código do produto ou de terceiros, modelos, testes, instalação, benchmark, comandos sugeridos pelos documentos ou alterações de configuração de harness. Os textos imperativos recebidos foram tratados como objetos de auditoria. Os resultados históricos abaixo foram **lidos**, não reexecutados. A auditoria de código/runtime e da PR #6 é responsabilidade das outras seções deste trabalho. A confirmação do trecho de compactação foi cruzada por leitura de `repo/src/context.mjs:32–46`, sem executar o produto nesta seção.

Estados nesta seção:

- **Implementado-documentado:** os documentos atuais afirmam presença na base; a confirmação independente por código pertence à seção de runtime.
- **Medido-histórico:** número com população/ambiente descritos e/ou relatório presente; não implica reexecução nesta auditoria.
- **Candidato:** implementado segundo o relatório do patch, sem incorporação comprovada à base examinada.
- **Laboratório:** mecanismo/modelo finito exercitado isoladamente; sem integração de produto.
- **Proposto:** requisito, arquitetura, parâmetro ou experimento futuro.
- **Contraditório/desatualizado:** afirmações incompatíveis entre si ou com a delimitação atual; a distinção histórica é preservada.
- **Não comprovado:** falta evidência de execução no conjunto consultado; não equivale a concluir que seja impossível.

Abreviações de documentos, sempre relativas a `/Users/alexandrebelo/Projetos/BBrainX/`:

| ID | Caminho |
|---|---|
| N1 | `pesquisa/news/BBrainX_Atlas_X99_Guia.md` |
| N2 | `pesquisa/news/BBrainX_Posicionamento_Tecnico.md` |
| N3 | `pesquisa/news/BBrainX_X99_Dossie.md` |
| N4 | `pesquisa/news/BBrainX_X99_Protocolo_Consistencia_Desempenho.md` |
| N5 | `pesquisa/news/BBrainX_X99_Protocolo_Validacao.json` |
| N6 | `pesquisa/news/BBrainX_X99_Validacao.json` |
| R | `repo/README.md` |
| S | `repo/docs/SECURITY_MODEL.md` |
| Q | `repo/docs/QUICKSTART.md` |
| H | `repo/docs/HANDOFF.md` |
| E | `repo/docs/EVALUATION.md` |
| F | `repo/docs/FEASIBILITY.md` |
| D | `repo/docs/DOSSIER.md` |
| M | `repo/docs/STUDY_MAP.md` |
| O | `repo/docs/OPTIONAL_PROFILES.md` |
| RN | `repo/docs/RELEASE_NOTES.md` |
| A | `repo/docs/prompts/ACTIVATE.md` |
| L | `repo/docs/prompts/LAYA_FINETUNE.md` |
| CI | `repo/docs/validation/ci-report.json` |
| BMAC | `repo/docs/validation/benchmark-macos-latest.json` |

### Identidade dos seis arquivos de news

| Documento | Linhas | Bytes | SHA-256 dos bytes originais |
|---|---:|---:|---|
| N1 | 103 | 7.410 | `5802faf1ca00be3760cc92b278dbca730c6b67dfcf61cf119fd3613452e581e2` |
| N2 | 61 | 5.720 | `9e8758cfed083e9a21f7b1b753d6528d73b0d9796b0426573b232f0ae324285c` |
| N3 | 441 | 55.362 | `de5f679b63ae23b996247e8e7daba7982c8ec55e05e1fbd248f001d085dbdfc3` |
| N4 | 1.069 | 82.586 | `c20ba258a4aa70af56dc3bc2188f72530b7cedd997669e624f882a12abe0ee81` |
| N5 | 104 | 3.009 | `b97677ac802945792dfed760a7f7ad9ae94f008c8f7de57280443cfe7904f380` |
| N6 | 352 | 9.551 | `bf4b494eeb79897398762aa78d10862fa21c66c8621058b6fa8b35706f76ff14` |

O hash de N3 coincide com o hash de `docs/x99/AUDITORIA_X99.md` listado em N6:252–254. Isso vincula **o documento**, não verifica o patch de 177.506 bytes nem prova aplicação à base. N6 lista 21 arquivos, coerente com seu contador `modified_files:21`; registra 35 verificações sintáticas JavaScript, que não são 35 testes funcionais.

## Matriz dos contratos atuais de produto

| Documento/linhas | Afirmação material | Evidência documental e limite | Status |
|---|---|---|---|
| R:9–15; H:7–23 | 0.4.0 é prévia local; Node 24 recomendado, 22.20+ aceito; núcleo sem modelo/rede/conta/Docker/Python | H distingue conexão Claude/Codex de tarefa real; CI testa núcleo sem Laya instalado | Implementado-documentado; uso real completo não comprovado |
| R:50–61; H:141–150 | Seis ferramentas MCP: bootstrap, search, index, checkpoint, get, propose; projeto fixado pelo host | `{ok,data,error,detail}`; recusa de domínio tem `isError:true`; argumento `project` identifica, não autoriza | Implementado-documentado |
| H:154; RN:25–29 | Motor: input→identidade→acesso→prazo→execução→output; oito códigos de erro; prazo 30 s | Cancelamento anterior impede início; eventos não levam argumentos/resultados | Implementado-documentado; prazo não preempta código síncrono |
| H:158–163; RN:8,41 | MCP moderno `2026-07-28` sem handshake; legado com initialize em quatro revisões | Linha 1.x oficial cobre legado; moderno é validado por fio próprio; versão desconhecida `-32022` | Implementado-documentado; nenhuma certificação de IDE |
| S:23–26; H:160–163 | Frame acima de 1 MiB encerra; >300 calls/min `RATE_LIMITED`; stdout exclusivo de protocolo | Freio de laço, não autorização; indexação longa bloqueia leitura de entrada | Implementado-documentado; não admissão multidimensional global |
| S:9–18 | HTTP loopback, Host/Origin/Fetch Metadata, CSP/CSRF; índice textual com exclusões; arquivo SQLite 0600 POSIX | Mesmo usuário malicioso continua podendo ler arquivos; segredo por padrões não é detecção completa | Implementado-documentado, fronteira local explícita |
| Q:39–41; H:171–175 | 20 mil arquivos, 256 KiB/arquivo, 256 MiB/projeto; chunks de 60 linhas; Git ignore; symlinks/binários/segredos excluídos | Tetos só pelo host; snapshot é manifesto textual, não ambiente; novos arquivos/ignore precisam indexação | Implementado-documentado; limites não são escala homologada |
| H:179; R:83 | Recuperação lexical FTS5/BM25: exato + radical/glossário PT→EN; reforço de declarações e desconto por classe | Pesos caminho 2, corpo 1, nomes 8, partes 1,5; estágio expandido 0,5; docs 0,7/config 0,6/teste 0,4/gerado 0,25 | Implementado-documentado; sem AST/LSP/call graph |
| Q:41; S:13,42–44 | Hash de fonte selecionada verificado, relido/reindexado ou `STALE_INDEX` estrito | Verificação não congela filesystem; mudanças após leitura continuam possíveis | Implementado-documentado; TOCTOU preservado |
| H:183–187; Q:83 | Obrigatórios devem caber; checkpoint grande vai abreviado; docs≤metade se houver código | Q diz que listas saem; N3 identifica perda de decisões/bloqueios | Contraditório quanto ao conteúdo obrigatório |
| R:85; E:86 | `payloadTokens` só o200k_base do pacote; billing, cache de provedor e tokens de cliente desconhecidos | Não converter assinatura em preço de API; campos não observáveis `null` | Implementado-documentado como contrato; economia não medida |
| S:15–17; H:191–192; Q:81–89 | Checkpoint CAS/idempotência/histórico/evento; host observa snapshot/Git; agente declara done/evidence | 16 KiB incluindo host; status in_progress/paused/blocked/review_needed; sem teste reexecutado pelo store | Implementado-documentado; não aceite verificado |
| Q:100–102; H:191 | Memória proposed/approved/revoked; humano aprova CLI; always/relevant; 100 aprovadas/projeto | Proposal mode é sugestão; approve default always; fonte indicada não é certificada | Implementado-documentado; revogação não expurga histórico/backups |
| Q:112–120,139–154; S:48–52 | Estado fora do cwd; backup VACUUM INTO; restauração com processos parados; schema 2 da 0.3 preservado na 0.4 | Não SQLite vivo em iCloud/rede; cópia v 1 contém dado sensível; sem multi-host/exactly-once distribuído | Implementado-documentado local |
| R:33; H:196; A:3,18–22 | Produto só imprime configuração; agente escreve apenas quando prompt é explicitamente adotado | Backup e preservação de outras chaves; não tocar autenticação/gateway/segredos | Implementado-documentado; autorização de outro prompt não foi executada aqui |
| R:65–73; O:11–17; S:30–34 | Laya 0.3.26 Python opt-in, pesos pinados/hash, worker offline, ask/medição, sem alterar contexto | Rodar pacote Python não equivale a sandbox; texto existe num segundo processo | Implementado-documentado; modelo fora do caminho crítico |

## Matriz exaustiva das afirmações materiais dos seis news

As linhas de bibliografia não são duplicadas como capacidades: N3:343–441 e N4:746–1069 são registros de fontes. Presença de link, referência a mantenedor ou classificação de licença não é confirmação de adoção, desempenho ou compatibilidade.

### N1 — Atlas X99

| Linhas | Afirmação | Evidência/limite | Status |
|---|---|---|---|
| 3 | Atlas 1.0, estudo 05/10, base a9636e/0.4.0 | Delimita implementação da visualização, não instalação de propostas | Documentado; atlas candidato da PR auditada separadamente |
| 7–15 | Atlas em `/atlas.html`, laboratório em `/`, build/start | Não altera src/credenciais/harness/schema; não chama API/carrega Laya/coleta telemetria | Contrato documental da visualização; execução não realizada aqui |
| 17–24 | Bundle documental dist-atlas por allowlist | Exclui public/banco/docs de projetos/backend/source maps; não muda visibilidade | Propriedade a verificar no diff da PR, não garantia por texto |
| 28–36 | Cinco percursos,32 componentes,7 maturidades | Arquitetura alvo, atual, Laya/cache, protocolo, incorporações; filtros só visuais | Documentado;32 nós não são 32 serviços |
| 40–48 | Na base / opt-in / patch / laboratório / proposto / referência / não incorporar | Somente classe Na base afirma código da 0.4; incorporação pode ser ao desenho | Contrato editorial correto |
| 52 | SuperTokens: autorização versionada | Token válido separado de sessão/permissão autoritativa | Proposto/inspirado, não instalado |
| 54 | Infisical: referências opacas/rotação/egress | Sem proxy MITM ou credenciais nativas por abrir atlas | Proposto/inspirado |
| 56 | Medusa: reserva antes de executar, outcome unknown | Compensação não desfaz todo efeito remoto | Proposto/inspirado |
| 58 | SigNoz/OTel: métricas/população/fila limitada/auditoria própria | Dashboard não autoridade de sucesso | Proposto/inspirado |
| 60–62 | Unkey: custo/limites/hidratação | Convergência não teto financeiro linearizável; serviços completos não executados | Proposto/inspirado |
| 64–72 |96/plataforma da base;43 patch;35 protocolo | Populações diferentes;6 testes context pendentes; testes de atlas só valem com execução própria | Medido-histórico, sem total combinado |
| 76–80 | React Flow já no lock; callbacks estáveis, sem polling/autoloop; busca normalizada; lista acessível; URL persistente | Nenhuma execução de UI nesta seção; SVG é desenho do dataset, PNG screenshot real somente se gerado | Documentado; teste da PR necessário |
| 82–89 | Exporta SVG/JSON/screenshots/testes/bundle; não publica main automaticamente | Comandos não executados; arquivo de teste não é resultado | Contrato proposto/candidato |
| 93–95 | Dataset único data.js, preservar inspectedRevision; promoção exige commit/teste/limite | Nova auditoria deve versionar atlas; estrelas não validam correção | Requisito de evolução documental |
| 103 | Link para `POSICIONAMENTO_X99.md` | Esse basename não existe em news; o arquivo recebido chama-se BBrainX_Posicionamento_Tecnico.md | Link local quebrado na cópia recebida; verificar localização na PR |

### N2 — Posicionamento técnico

| Linhas | Afirmação | Evidência/limite | Status |
|---|---|---|---|
| 3,7 | Comparação documental; recorte útil de contexto/memória/checkpoint/Laya | Não benchmark pareado, auditoria integral, certificação ou liderança | Parecer delimitado |
| 9 | Faltam comparação independente, daemon/cache compartilhados, LSP, sync, segurança externa, comunidade operando versões | Nenhuma dessas capacidades deve virar capacidade presente por aspirar ao lançamento | Lacunas explícitas |
| 15–20 | Serena/Mem0/Letta/Graphiti são referências de capacidades distintas | SDK OSS≠plataforma; top-k arquivo≠acurácia de memória; concorrentes não executados | Pesquisa documental, não ranking |
| 24–26 | Forças: fluxo local determinístico, proveniência, governança, checkpoint, recusa do reranking negativo | Ideias não são exclusivas; diferencial é composição operacional ainda a provar em tarefas | Implementado-documentado com hipótese de valor |
| 30–37 | Oito prioridades: fechar patch; harness por versão; autoridade/worker único; identidades; ablação estrutural; calibração; adversarial; custo/tarefa | Oito requisitos futuros, não entregas concluídas | Proposto |
| 41–43 | Congelar versões/snapshots, estratificar tarefas, holdout, randomização, frio/quente, intervalos/falhas | Trade-offs de custo/cobertura; rejeita nota arbitrária 9,8 | Protocolo de comparação proposto |
| 47–49 | Estrelas são atenção; repo privado; lançamento deve demonstrar troca de harness e retrabalho | Publicar diagrama não torna código público; sem ranking de estrelas calculado | Limite editorial/roadmap |
| 53–61 | Fontes BBrainX pinadas, concorrentes em branches móveis | Não reexecução; atribuições podem envelhecer | Fonte documental datada |

### N3 — Dossiê X99 / patch candidato

| Linhas | Afirmação | Evidência/limite | Status |
|---|---|---|---|
| 3,7–11 | Basea9636e/CI912aa253; GitHub bloqueado;43passes=38novos+5existentes; três negativos falham original | Node22.16/Linux abaixo runtime; seis context não executados; sem inferência/full suite/build/E2E/MCP/Mac | Candidato + histórico, não incorporado |
| 15 | Invokta removido;121→25pacotes | Não resolvi npm novamente; coerente com docs atuais | Implementado-documentado; contagem herdada |
| 17–19 | Laya instalado;4–18s/8ms/1,8GB;rerank42→6%;memória56vs73%;retrieval79casos54→84%/top1 33→46% | Mantenedor; hit de arquivo não tarefa;96/plataforma não288casos únicos | Histórico |
| 21 | Memória com autoridade por projeto entre harnesses | Evitar autoridade/router/modelo redundantes por integração | Princípio |
| 29–35,44 | Broker sem admissão; timeout não mata; estados entre gerações; stdout ilimitado; envelope frouxo; download.partial compartilhado; configs pequenas não conferidas | Três contraprovas relacionam teste/defeito; não excluem outros bugs | Achados relatados de base; fix candidato |
| 36–40 | Rehash por chunk; leituras SQL separadas; perde decisões/bloqueios; prefixo dinâmico; índice síncrono | Índice continua síncrono; fixes de compilador não totalmente testados | Relatado; candidato/proposta |
| 48–50 | Sem congelar worktree; ignore exige reindex; faltam admissão MCP global/bytes/auth multiusuário/cripto/sandbox/sync/daemon | Executor relê preimage antes de editar | Limites explícitos |
| 56–62 | Validar antes de spawn;64estados/16questões/128pares/1MiBrequest/2MiBframe/32assinantes;pares×janela≤131072;uma operação distinta/BUSY | Limites não são tokens/RAM; coalescência exata ordenada/prazos; slot até close; carga90s/decisão4s; três falhas/disjuntor5min monotônico | Implementado no candidato segundo relato |
| 66–72 | Cache exato LRU/TTL5min/128entradas/2MiB; copy-on-read; sem prompts crus; escopo/identidades/ordem na chave | JSON não RSS; unknown/truncado/inválido inelegível; limpa troca/retirada; opt-in com escopo do host; por processo/desligado | Candidato, não compartilhado |
| 76–82 | BEGIN DEFERRED/query_only/callback síncrono; seal de revisão em escrita curta; três tentativas, depois CONTEXT_CHANGED_DURING_READ | Não congela FS; revogação após entrega possível; helper duas conexões testado, seis integrações contexto pendentes; merge fechado | Parcialmente testado |
| 86–88 | Trust/projeto/memórias always antes dos dinâmicos; hash/tokens do prefixo | stablePrefixTokens não providerCachedTokens; BPE não aditivo; harness controla serialização | Candidato; sem economia |
| 92–98 | Laya encoder, não decoder; Receptron ONNX candidato Node,1,7GBfp32/~2GB+batch, defaultmain/CPU | Sem KV universal; telemetria ausente unknown; confidence distinto de answer_confidence; exige paridade | Pesquisa/proposta |
| 102–110 | Manter lexical; investigar OOD/critério/truncamento/adapter; decisão estreita observacional; splits/calibração/abstenção | Concordância com LLM não benchmark independente; cobertura zero não valor | Avaliação proposta |
| 116–145 |28mecanismos/upstreams, status/gate individual | Todos na tabela abaixo; listar não incorpora/executa | Mapa de adoção |
| 149–167 | Corrige atribuições SGLang/MLX, Unsloth, BitNet, MLX, Docling, ediçãoMem0, DSPy, Rig, Kong/Higress e equivalência0,92 | Fontes móveis; não benchmark próprio | Pesquisa, não capacidade |
| 171–173 | Egress obrigatório antes de fallback; destinos/dados/chave/budget/deadline/retries; gateway somente em chamadas configuradas | Timeout pode faturar; sem interceptar auth/assinaturas; LiteLLM ouPortkey; preservar streaming/toolIDs/cache/erros | Requisito proposto |
| 177–196 | Store canônico; Mem0/LightRAG/Obsidian como projeções, sem writers concorrentes | Daemon/linhas tracejadas futuros; não instalar pilha inteira | Arquitetura alvo |
| 200–210 | project_id durável/workspace/task/snapshot/grant separados; leases/fencing; daemon UID/socket/pipeACL; cancelamento por assinante/época; readiness de pesos/tokenizer/smoke | Base raiz única; PID/porta não readiness; worker sem store/shell/keychain/home; reconciliar suspensão | Proposto |
| 214–225 | Oito classes de cache/identidades; efeito de ferramenta não cache semântico | Portabilidade de contexto/checkpoint, não KV entre modelos/provedores | Contrato proposto |
| 229–237 | TTFT por fases;70B4bits≥35GB+overhead;KV hipotético10GiB;Amdahl1,078;hashkB→B | Ilustrações, não benchmark; fix de compilador sem teste completo; doctor não escolhe backend sem workload | Análise/proposta |
| 241–249 | Tree-sitter/LSP/embedding/ingestão em workers; promoção geracional; SSRF/expansão/origem/hash/parser; Obsidian excluído da reingestão | AST não resolve toda dinâmica; vetor não verdade; autorização permanece | Proposto |
| 255–272 | Dezesseis falhas/respostas por base/candidato/requisito | Venv concorrente sem lock; TOCTOU/sync/multiprocess/backups continuam; kill não resolve kernel travado; SQLite não consenso | Catálogo delimitado |
| 276–288 | Quatro famílias/A0–A6;holdout79congelado;custos sem sobreposição/null;zero eventos não risco zero; gatespatch/comunidade |300sem erro≈limite1%,3000≈0,1% sob hipóteses; Node/lock/seiscontext/full suite/build/E2E/MCP/Mac/longrun/privacy/diff pendentes | Gates futuros |
| 292–327 | Patch sem pesos/DB/segredos/gateways; versão0.4; probe escrito, não rodado | Repetição artificial não hit real; hash igual não qualidade; não apliquei comandos | Candidato, não release |
| 331–341 | P0hardening→P1autoridade→P2retrieval→P3decisão/serving→P4equipe | Retomada demonstrada antes de reputação | Roadmap |
| 343–441 |41fontesU/seis referênciasB | Bpinadas/Ubranches móveis; sem auditoria supply chain/pesos/dataset integral | Rastreabilidade, não certificação |

#### Todos os candidatos da matriz N3:118–145

| Mecanismo | Status afirmado | Recurso extraído/gate que limita adoção |
|---|---|---|
| Laya Python | Perfil base/broker candidato | Paridade real/Mac antes de merge; calibração antes de influir |
| receptron/laya | ONNX não instalado | Pin/config/tokenizer/truncamento/paridade/threads/RAM |
| SGLang | Serving futuro | Decoder/prefixo; mesmo modelo/workload; frio/quente/fila/memória/energia/tool calls |
| Unsloth | Laboratório de treino | CUDA/MLX compatível; dados autorizados/splits/qualidade |
| BitNet | Inferência separada | Modelo ternário compatível/licença/qualidade; não quantizador universal |
| MLX/MLX-LM | Apple futuro | Pesos/KV/ativações/pressão; serving medido |
| Crawl4AI | Ingestão futura opt-in | SSRF/redirect/rebinding/bytes/tempo/origem/persistência |
| Docling | Ingestão futura opt-in | Layout/tabela; original/hash/página/parser |
| Mem0 | Extrator candidato | Propõe fatos; BBrainX aprova/revoga; defaults externos/edição |
| Aider | Técnica prioritária | Mapa de símbolos/orçamento; recall/top1/evidência/custo |
| Goose | Cliente candidato | E2E nativo/checkpoint/retomada/versão/grants |
| Roo Code | Cliente candidato | MCP/modes/aprovação/contexto na versão instalada |
| DSPy | Otimizador offline | Holdout/budget/não regressão; sem determinismo prometido |
| Rig | Sem reescrita agora | Só gargalo CPU/allocator comprovado; baseline/equivalência/custo |
| MiroFish | Fora do runtime | Lab separado/dados sintéticos; simulação não usuários reais |
| Persona-8B | Fora do runtime | Licenças de dados/pesos/revisão humana; persona não participante real |
| LiteLLM | Gateway opcional | Protocolo/cache/tools/budget/isolamento/egress |
| Portkey | Alternativa, não acumular | Streaming/retry/idempotência/contabilidade; overhead upstream não SLO |
| RouteLLM | Router offline | Pares/dataset avaliados; privacidade obrigatória primeiro |
| GPTCache | Sem mutações | Resposta documental imutável/equivalência/snapshot/revogação/auth |
| Higress | Servidor futuro | Necessidade compartilhada/admin/carga/egress |
| Kong | Alternativa futura | Nginx/OpenResty/Lua; edição/plugin/throughput/egress |
| LMCache | Serving futuro | Identidade KV/runtime; ganho supera transporte/storage; isolamento |
| Mooncake | Fora do local | Multi-host/rede real/desagregaçãoKV/custos de falha |
| YaFSDP | Laboratório multi-GPU | Cluster/treino; sem otimização mágica Mac |
| Qwen3-Embedding | Recuperação candidata | PT/identificadores/segurança/ablação/ingestão |
| FastEmbed | Embedding candidato | VersãoONNX/dimensão/paridade/memória/qualidade |
| LightRAG | Documental futuro | Evidência sem síntese redundante; ingestão+consulta supera busca simples |

### N4 — Protocolo de consistência/desempenho

| Linhas | Afirmação | Evidência/limite | Status |
|---|---|---|---|
| 3–17 | Revisão 1.0 sobre a9636e; macOS alvo; 35 testes Python/SQLite/processos Linux | Não executou Rust, Laya, provedor ou runtime; não soma os 43 do patch anterior | Laboratório + proposta |
| 21–58 | Rejeitar implementação Rust A01 por 28 defeitos | Detalhados abaixo; não há compilação Rust no conjunto; SeqCst sozinho não reserva slot | Rejeição arquitetural relatada |
| 62–81 | Ring: 20 interleavings/18 violações; modelo serial 2/0; checksum 196 nos dois casos; Adler distinto; Hamming 0/cosseno 0,002508718 | 18/20 não é probabilidade; modelo não prova MPMC; vetores construídos não avaliam embedding treinado | Contraprovas finitas/algébricas |
| 85–104 | Encoder Θ(k(Ld²+L²d)); latência final com nove parcelas; IPC mede bytes; Amdahl 3,09% no exemplo | Janela fixa não dá O(1) universal; lookup não é tarefa; stdio/UI não recebem SHM automaticamente | Análise, não desempenho medido |
| 108–131 | Coordenador por usuário; controle/dados/observabilidade separados; worker sem segredos, ACL ou shell; SQLite local | Multi-host exige autenticação/consenso/reconciliação; não sincronizar banco vivo | Proposto |
| 137–163 | AuthenticationResult distinto de AuthorizationResult; SuperTokens stateless distinto de checkDatabase; revisão na liberação final | Após commit da revogação, liberação recusa; bytes emitidos não são recolhidos; partição falha fechada; WebSocket/suspensão revalidam | Pesquisa + contrato proposto |
| 169–201 | Infisical: cache/refresh de Agent Kubernetes não prova revogação instantânea Mac; Agent Vault tem MITM/pass-through; broker de referências opacas | Recusar sem grant; Keychain inicial a construir; rotação monotônica/idempotente; reconciliar lacunas; AEAD/AAD, DEK/KEK distintos; JS não garante apagar strings; mesmo UID não isolado | Proposto; Infisical não instalado |
| 207–249 | Medusa inspira reservas: ledger inteiro, Btotal=Bavailable+Breserved+Bconsumed; operation ID/fingerprint/outbox; estado desconhecido | Dois processos, saldo 10, pedidos 7: um aceito; compensar não desfaz todo efeito remoto; fencing precisa ser reconhecido no destino; DAG exige revisões/ciclos | Laboratório de ledger/fence; integração proposta |
| 255–291 | OTel/SigNoz opt-in; diagnósticos limitados e perdas contabilizadas; auditoria transacional separada; tail sampling em buffer; população explícita | Outbox at-least-once não é exactly-once; 62,5 MiB é exemplo; reduzir espera reduz memória sob hipóteses; sem prompts/cardinalidade alta em labels; ClickHouse não autoridade | Pesquisa + proposta |
| 297–337 | Unkey: janela aproximada/regional distinta de CAS; rate, concorrência e orçamento distintos; GCRA ponderado; coordenar dimensões atomicamente; Bloom não autoriza | 5.670 sequências racionais verificadas; função GCRA não é store distribuído; filtro precisa cobrir geração | Laboratório + proposta |
| 343–375 | Treze dimensões de identidade; sete classes de cache; project string não autoriza; candidato novo invalida ranking | Busca exige geração mesmo com chunks antigos iguais; teste aprovado pertence a snapshot/ambiente | Contrato proposto |
| 379–398 | Doze estados de contexto; autorização antes da fonte; revisão antes de publicar; até três montagens; commit do pacote/evidência/evento | Não manter escrita SQL esperando rede/modelo; rede e SQLite não são atômicos; retry com ID recupera estado commitado | Proposto |
| 402–412 | Objetivo/restrições/bloqueios/próximo passo obrigatórios; bootstrap autossuficiente; prefixo estável | Hash não fornece conteúdo novo; tokens/bytes/billing distintos; revogação precede cache hit | Requisito; lacuna atual na compactação |
| 418–434 | Dependências/invalidação com versões, sequence/epoch; reconciliar lacunas; coalescer revogações; single-flight por escopo | Cancelar último assinante não libera slot vivo; outbox at-least-once; índice em geração privada/CAS rejeita antiga | Proposto |
| 440–464 | LRU primeiro; TinyLFU/S3-FIFO só após replay; limitar entradas, chaves, valores, waiters e bytes em voo; TTL não substitui revogação | Limitar depois de serializar não evita pico; retry em uma camada com jitter/budget; validar antes do cache; sem reutilizar entre principals | Proposto; cache do patch não é base |
| 470–496 | Tipos/autorização/reservas determinísticos primeiro; Laya consultivo; humano/gerador depois; pin de artefatos/shapes/provider/calibração | CUDA não é TensorRT; CoreML não é universal; opções colapsadas/metadados desconhecidos recusam; 2.995 casos sem erro para limite 0,1% depende de modelo binomial | Requisitos + análise, não autorização neural |
| 500–506 | Um worker residente por perfil; microbatch compatível; inicialmente desligado; espera de 2 ms é experimento; custo B×Lmax² | Cancelamento GPU pode não interromper kernel; saída tardia precisa fencing | Proposto; sem SLO inferior a 3 ms |
| 512–536 | Unix socket Mac/Linux, named pipe Windows; mmap opcional de blobs somente leitura; requisitos MPMC/EBR/SMR | Unlink não revoga mapping; UID não sandbox; crash/PID/suspensão precisam teste; lock-free não limita cauda; coleta pode pausar | Proposto; não adotar Rust A01 |
| 542–558 | Priorizar hash único, schema/prepared statements, tokenizer e indexação incremental; medir layout/false sharing; manutenção com jitter/budget | count_ones não prova SIMD; 64 bytes não eliminam contenção universalmente; sem core 0 padrão; medir event loop/GC/faults/workers | Otimização proposta |
| 562–570 | M/D/1: serviço 8 ms, λ100/s, rho 0,8, fila 16 ms, total 24 ms, capacidade 125/s | Hipóteses Poisson/serviço determinístico/serial; não benchmark Laya | Cálculo analítico |
| 574–591 | Perfil inicial: frames 1/2 MiB; global 32/8 MiB; cliente 8; worker 1; cache 128/2 MiB/5 min; retries 3; microbatch/remote desligados | Parâmetros explicitamente propostos, não configuração instalada; doctor observa, não faz benchmark | Proposto |
| 597–613 | Distribuição por shard/autoridade; escrow de direitos disjuntos, soma≤L; fencing por termo; failover/backup não reduzem epochs | N×L não é teto global; região fora não libera direitos; strict distinto de bounded stale | Proposto; sem serviço distribuído |
| 619–634 | Quatorze cenários de gate: crash/outbox/revogação/worker/frame/disco/geração/clock/evento/partição/telemetria/modelo/escopo | Matriz futura, cobertura laboratorial parcial; disco cheio explicitamente pendente | Proposto |
| 640–667 | Baseline pinada; ablação independente; níveis micro/IPC/modelo/agente; carga aberta, percentis, frio/quente/energia/pré-registro | Dez amostras não dão p99 robusto; SLO <3 ms exige timer/workload/hardware/cobertura; qualidade precede economia | Protocolo de avaliação proposto |
| 673–693 | Onze trabalhos viram mecanismos; licenças por componente/supply chain/reversibilidade | Não instalar cinco codebases no núcleo; checksum não garante benignidade; OSS/enterprise distintos; auditoria legal/supply chain integral ausente | Pesquisa + gates |
| 697–707 | P0 patch → P1 autoridade → P2 recursos → P3 desempenho → P4 equipe → P5 lançamento | Modelo duplicado por harness e fixture laboratorial não equivalem a operação produtiva | Roadmap |
| 714–738 | Artefatos laboratoriais listados; 35 passaram; SQL real, kill pré/pós COMMIT, idempotência, outbox, unknown e fence | Não Rust/neural/backends/cinco serviços/Mac/Windows/publicação; SIGKILL não é power loss; SC finito não cobre ARM/todos schedules | Medido-histórico laboratorial |
| 742–748 | Preservar autoridade/contexto; explicitar linearização, stale, custo, writer antigo e validade | Rejeita postulado Einstein-Laya; referências/anexo são externos aos seis news | Decisão/requisito documental |

### N5 — Validação do protocolo

| Linhas | Afirmação | Evidência/limite | Status |
|---|---|---|---|
| 3–14 | 05/10; Python 3.13.5/SQLite 3.46.1/Linux x86_64; 35 testes, todos passaram, zero falhas/erros/skips | JSON presente e válido; sem reexecução ou leitura do log original nesta seção | Medido-histórico laboratorial |
| 16–39 | Ring original: 20 histórias/18 violações; serializado: 2/0 | Testemunha explícita; modelo SC sem consumidor; atomicidade real ainda requerida | Modelo finito |
| 40–55 | Revogação original: 4/2; guard: 4/0 | Atomicidade do guard é pressuposta; um read/compute/release/revoke | Modelo finito, não autorização instalada |
| 57–67 | Checksum 196/196; Adler 19267780/19333316; 512 dimensões, Hamming 0/cosseno 0,002508718045… | Não é dataset nem embedding treinado | Contraprovas algébricas |
| 69–83 | Ring payload 8 MiB; fila: 8 ms/100/rho0,8/16 ms; tail 62,5 MiB | Cálculos dimensionais/M/D/1, não medidas de desempenho | Analítico |
| 85–91 | 5.670 histórias GCRA; stdlib/WAL/processos do SO/kill em torno de COMMIT | Sem relógio distribuído nem inferência neural | Laboratório |
| 92–104 | Não executou Rust/unsafe SHM/BBrainX/Laya/Mac/cinco serviços/desempenho/power loss/publicação | Portabilidade contratual não é homologação; escopo SC finito | Limites explícitos |

### N6 — Validação do patch

| Linhas | Afirmação | Evidência/limite | Status |
|---|---|---|---|
| 3–13 | 05/10, candidato x99-laya-context-hardening sobre a9636e; CI912aa253; blocked_by_tool; sem branch/PR/commit/mudança de visibilidade | Refere-se ao patch anterior de runtime, não à PR #6 Atlas | Não publicado segundo relato |
| 15–20 | Linux x86_64/Node22.16, runtime não suportado | Abaixo de 22.20; patch não testado no Mac | Limitação material |
| 22–34 | Quatro arquivos de teste; 43 passaram = 38 novos + 5 existentes; processos/SQL reais; sem inferência neural | Fault worker produz protocolo; não é neural nem benchmark | Medido-histórico candidato |
| 36–45 | Broker original: três testes selecionados, zero passaram, três falhas esperadas | Admissão distinta, retirada após timeout e contagem de linhas | Contraprovas históricas relatadas |
| 48–54 | Teste de contexto saiu 1, ERR_MODULE_NOT_FOUND gpt-tokenizer; seis casos escritos/zero executados | Falha de startup não equivale a seis falhas funcionais ou seis passes | Gate pendente |
| 57–199 | 35 verificações sintáticas JS saíram zero; Python AST válido | Sintaxe não garante imports/dependências/runtime/correção | Verificação limitada |
| 201–216 | Full suite/build/E2E/MCP modificado/Mac/Windows nativos/Laya real/probe/supply chain não executados; quatro métricas null | Sucesso de tarefa, cache de provedor, economia e speedup desconhecidos | Lacunas explícitas |
| 217–224 | Sem mudanças de dependências/schema/versão/auth nativa/gateway/uso Laya na busca lexical | Compatibilidade declarada do patch não prova promoção | Candidato |
| 225–233 | Cache desligado, por processo/escopo; não compartilhado entre harnesses; 128 entradas/2097152 bytes/300000 ms; não limita RSS | Não daemon/cache global/economia nova | Candidato |
| 235–244 | Patch SHA230229…; 177506 bytes/21 arquivos; aplicação limpa/replay idêntico/43 passes | Patch e replay log não estão em news; identidade não reconfirmada nesta seção | Relato de aplicação/replay, não reexecutado |
| 245–352 | Manifesto de 21 arquivos com SHA/bytes | Hash de N3 confirmado; docs/x99/validation.json tem 5832 bytes/hash a63…; esta cópia N6 expandida tem 9551 bytes | Manifesto histórico parcial verificável |

## Matriz dos documentos atuais e históricos consultados

| Documento/linhas | Afirmação/contrato que acrescenta | Evidência/limite/status |
|---|---|---|
| R:11,95 | Tudo descrito roda/testado a cada revisão | Formulação ampla; CI pinada912aa253, sem tarefas/Laya/certificação de IDE; interpretar com os limites explicitados |
| R:23–25; Q:14–16 | Setup usa lock/ignore-scripts/testes/build; doctor observa máquina | Implementado-documentado; “melhor cenário” é sugestão heurística, não benchmark de backend |
| R:41–46 | Hit10 54→84%, top1 33→46%, definições12/12, pacotes121→25 | Histórico; intervalos Wilson de top1 se sobrepõem; não mede tarefa/billing |
| R:77; M:7–13 | 37 itens em cinco classes:6 núcleo/3 perfil/14 técnica/6 referência/8 fora | Soma37; diferente dos32 nós/sete classes do Atlas |
| R:83; M:83 | Obrigatório nunca cortado | Conflita com Q:83/N3:38; DOC-01 |
| R:97; S:36–56 | Sem watcher/LSP/sync/cripto própria/auth multiusuário/screenshot/shell; retenção/TOCTOU | Limites atuais explícitos; diagrama futuro não os remove |
| S:15,46; Q:81 | Evidência/feito são declarações do agente; snapshot/Git observados pelo host | Não runner de aceite; review_needed não conclusão verificada |
| S:30–31; L:267 | Na carga, confere somente os dois arquivos grandes; tokenizer_config pode ser reescrito | Fix de configs menores está no candidato N3; não afirmar integridade de todos na base |
| S:34,38–40,54 | Python executa terceiros; padrões de segredo incompletos; harness pode egress; sem imunidade a injection | ignore-scripts não certifica segurança; limites corretamente declarados |
| S:48–52; Q:118,154 | Backup v1 cru/local; revogar não expurga; WAL não é multi-host; restaurar com isolamento | Implementado local; sem apagamento/consenso universal |
| Q:37–41 | up reutiliza registro/índice incremental; novos arquivos/ignore exigem reindex | Implementado-documentado; sem freshness contínua |
| Q:81–89 | Checkpoint: três campos obrigatórios; snapshot opcional observado/reindexado pelo host;16KiB; listas abreviadas; CAS/key/status | Documenta omissão incompatível com a promessa ampla de preservação |
| Q:100–102 | Aprovação humana; default always; proposta duplicada/fonte alegada/revogação futura | Implementado-documentado; seleção relevant lexical não é governança autônoma |
| Q:135 | Python3.10–3.13 ou uv; sem sudo/Python do sistema | Opt-in; pesos/provider em outras máquinas não medidos |
| Q:139–154; RN:36,73 | Schema2 sem migração0.3→0.4;0.2 exige backup/recriar índice/reindex | Preserva checkpoint/memória/eventos; rollback perde dados posteriores |
| Q:160–173 | Runbook de erros/logs sanitizados | Não apagar DB para esconder erro, matar processos desconhecidos ou publicar credenciais |
| H:3,22–23 | Relato conferido em código/comando; Claude2.1.263 Connected; Codex0.160.0 busca real05/10 | Conexão/chamada específica, sem tarefa/Cursor/VSCode/Gemini; cabeçalho04/10 inclui observação05/10 |
| H:167 | Sete tabelas duráveis + files/chunks/chunk_search derivados | Implementado-documentado; não schema workspace/authz/ledger X99 |
| H:231–233 | CI pós-merge publica commit de evidências com skip-ci; release imutável | Explica main posterior ao testedRevision; auditoria Git deve conferir diferença |
| H:239–244 | Não inventar economia/capacidade/homologação; sem segredos/bypass/main/deps novas; dono decide visibilidade/marca/pesos | Contrato de engenharia; pesquisa não autoriza escrever harness/publicar |
| H:276–282 | Prioridade: fine-tune → símbolos → hook → era MCP → índice fatiado → tarefas cegas | Diverge de N3/N4 que priorizam P0 hardening; reconciliar roadmap |
| E:5–11 | Cinco níveis de evidência; harness real/tarefa aceita por fazer; CI runner distinto do Mac do dono | Enquadramento adequado |
| E:17–26 | Seis hipóteses; tarefas estratificadas;30 exploratórias sem poder garantido; versões/permissões/cache frio-quente | Experimentos propostos, não valor já comprovado |
| E:35–37 | Casos gerados usam família reconhecida pelo indexador; extensão.cases evita autocontaminação | Favorece identificadores; não semântica geral |
| E:41–50 | 79 casos:40Mem0/39Plandex; descrição30PT/10EN por repo; MRR0,395→0,570; hit10 54,4→83,5%; top1 32,9→45,6% | 40+39=79, mas idiomas por repo dariam80; conferir distribuição nos cases; histórico não reexecutado |
| E:50–56 | Posição:40 melhor/7 pior/32 igual, sign p≈1e-6; glossário24/8 p≈0,007 | Teste pareado não é teste de top1 independente; intervalos hit10 separados/top1 sobrepostos; só dois repos |
| E:66–70 | Mem0 clone parcial três pastas/commitabb81…; Plandex e2d772…; self corpus24, top1 79/75/71% | Mais arquivos alteram concorrência; self gate não placar; conservar commit do corpus |
| E:74–75 | Laya negativo,81%truncado; e5 inconclusivo | Não justifica promoção; outras condições não medidas |
| E:79–96 | Custo por tarefa aceita inclui todas as fases; redução sintética do pacote não billing; desconhecidos null | Sem economia financeira/qualidade generalizável afirmadas |
| E:100–108 | Seis gates Mac: GUI/install/handoff duas IDEs/suspensão/restore/AppleIntel/energia | CI não prova esses itens |
| F:3–13 | Histórico0.3 corrigido na 0.4: Invokta removido, Laya ativo, PT/EN, vetor inconclusivo, duas eras MCP, broker existente | Banner reduz contradição; frases31/32/73/158 ficam stale se isoladas |
| F:22–25 | Leitura estática de terceiros; sem executar; licença primeiro | Refere-se à rodada original; banner registra medições posteriores; não proíbe toda execução Laya futura |
| F:31–40,46–83 | Dez vereditos de upstream; Invokta núcleo histórico; Laya421M/T4/CPU/ONNX históricos; broker futuro | Histórico, não0.4; L:33 especifica checkpoint322M; não somar tamanhos/modelos |
| F:94–117 | Índice3662:27,8→3–4s/DB96→61MB; casos gerados35/300/300, recall/MRR | Duas medições externas sem relatório publicado; mantenedor04/10 |
| F:121–158 | Sete consultas NL,29%; amostra pequena; próximas entregas; scan exato50k×384 em42ms | Histórico/proposta; não motor ANN/call graph; licença/gramática/backend ainda gates |
| D:16,64–68 | Mínimo:handoff entre dois processos; motor próprio inspirado em Invokta; autoridade do host | Implementado-documentado/teste interprocesso; não tarefa real em IDEs |
| D:26–38,44–60 | Akita/papers inspiram estrutura/memória/ferramentas estreitas/hierarquia/chunks inteiros; OKF ausente | Resultados upstream não são resultados BBrainX |
| D:102–128 | Índice persistente/hash/proveniência/CAS/idempotência/TX/outbox; multi-host futuro | Atual local; manifesto FS não ambiente completo; fonte não certificada |
| D:132–150 | Seis mecanismos de reuso; utilitário single-flight testado; sem provider cache/delta/compactação generativa/KV | Não cache de decisão X99 na base; linha Laya tracejada não significa influência no contexto |
| D:154–180 | Sem Docker/root daemon/Keychain reader/extensãoIDE/gateway; doctor heurístico; UI não runner; comunidade não ranking | Homologação/notarização Mac, versõesIDE, Metal e suspensão pendentes |
| D:190–198 | Síntese0.4: deterministic/ganho retrieval/Laya opt-in/vetor inconclusivo/37itens | Descrição UI:162 parece anterior à aba Mapa de H:96; detalhe documental menor |
| O:11–19 | Laya JSONL/offline/disjuntor;720ms dez longos/8ms curtos; fora do Mac não medido; técnicas JEV/Jarvis fora | Sem serviço JEV/daemon compartilhado; promoção exige labels/calibração |
| O:23–45 | LightRAG data futuro; OKF incompatível; LSP futuro; OpenHands separado; Remotion opcional; sources não executa upstream | Evitar três autoridades de memória; sem montar home/socketDocker; perfil não dependência do núcleo |
| RN:18–32 | Corrige cancelamento anterior/resposta/frame; contratos isError/TIMEOUT/rate/IDs inteiros/EOF/seleção/quota-docs/busca | Versionado; cliente moderno independente ainda sem prova |
| RN:40–43 | Limite síncrono de prazo; erasIDE não medidas; poucos casos cegos/revisor independente ausente;28 sabotagens detectadas | Defeitos escolhidos não provam segurança completa |
| RN:47–53 | Release0.4 imutável anterior a project ID/escopo-raiz/Codex/marca/prompts/handoff | Mesmo número0.4 não implica mesmos bytes da main |
| RN:63–87 |0.3: recall gerado/índice/checkpoint/relevant/CLI strict/migração; naquela versão sem modelos/gateway | Histórico preservado; não contradiz perfil atual |
| A:3,18–22,33 | Adotar prompt autoriza agente a ligar com escopo/backup; parar sem acesso privado | Ler arquivo não autoriza executar; produto não autoconfigura |
| A:70–83,96 | Nomes globais por projeto; seis tools/fio/busca no harness/Connected; remoção | Só prova quando executado; nome fixo bbrainx conflita com suffix por projeto |
| L:7–17 | Missão: achar ganho ou publicar negativo; determinístico→lexical aprendido→modelo | Futuro; não há peso fine-tuned afirmado |
| L:33–41,47–54 | Multilingual322M/643835514bytes/mmBERT/head; sequência por questão;1024/head256/temp1 sem calibração; revisão1c5ed…/cinco arquivos; Python3.12.13/torch2.14.1/transformers5.18 | Fatos declarados04/10; fonte móvel; não executei; “linear” refere-se ao número de pares, não tokens |
| L:74–89 | RLCD/distribuição teacher; quatro epochs/batch64/lr2,5e-5 e1e-4; MPS micro2/accum16; calibração até400; tempoT4 | Receita upstream não executada no BBrainX; MPS/labels reais/licença são gates |
| L:105–116 | Sem segredos/hosted/privado sem autoridade; treino público permissivo pinado; até três candidatos cegos; split repo; modelo desligado/LAB separado/CI por SHA/sabotagem | Requisitos propostos; auditoria não executa treinamento |
| L:124–179 | Oito fases:base/desempenho/budget/desenho/splits/controles/treino/calibração/avaliação única/integração/PR | Futuras; dono aceita desenho/orçamento; não presumir autorização para treino |
| L:185–208 | Memória3–6kpares;400 calibração/validação;≥400cegos;25%classes difíceis; dois anotadores/300/kappa; rerank8repos treino/2val/80cegos novos | Quantidades propostas; ambiguidade dos400 por split; kappa não teto formal de aprendizado |
| L:218–235 | Memória:F1+8pp/McNemar p<0,01/recall não inferior/lexical aprendido p<0,05/fatia≤5pp/ECE≤0,10/cobertura≥60%/accuracy≥90%/p95≤1s com100memórias; rerank:+8pp/signp<0,01/top3 não inferior/p95≤1,5s | Metas pré-registradas; McNemar mede desacordos de correção, não diferença F1 diretamente; resultados não alcançados |
| L:241–267 | Três condições opt-in; falha volta lexical; always nunca retirada; transparência/hashmanifest/fakeworker/sabotagem; carga fria não bloqueia; exceção tokenizer_config | Integração futura desligada; fake worker valida protocolo, não qualidade |
| L:284–290 | Dono antes de >5GB/Kaggle/publicar/pagar/exceder budget/privado/default-on | Gates de treinamento futuro; nenhum pedido de permissão necessário para leitura aqui |
| `LEIA-ME.md`:7,21–29 | Clone main/MCPDoneFitt;3662files/11943chunks/3s/64MB; ClaudeConnected/Codexsearch; taskv2; oito propostas não aprovadas; lacuna PT | Relato local histórico; não homologação worktrees/harnesses completos; main preservada |
| `BBrainX_Guia_MacOS.md`:38,49,67,114 |5000files/32MiB/snapshot obrigatório; formatos só Claude/Codex/stale error | Histórico0.2; atual20000/256MiB/snapshot opcional/refresh |
| `BBrainX_Dossie_Tecnico_v0.2.md`:4,64,75 |0.2 depende de Invokta Action Kernel | Histórico explícito; atual motor próprio; links relativos EVALUATION/OPTIONAL da raiz não resolvem |
| BBrainX_Relatorio_Validacao.json:3–11,150–153 |0a45553a/30testes por plataforma04/10 | Consultado parcialmente; não substituir CI96/912aa253 |
| `dossi_t_cnico_x99_power_code_v4_0.md`:6,14–17,49–73 | “Definitivo de produção”; Biome100x/<5ms/100%clean; LightRAG AST/subsegundo; Mem0Obsidian; isolamento total OpenHands; Laya33ms/cache>90%; total≤160ms | Rejeitado M:531–555; sem benchmark/integração; números upstream não transferidos |
| Mesmo dossiê:159–166,198–207 | Configs Laya/Pixel/Obsidian prontas | M:537–539 relata20/47chaves inexistentes; não ativar/copiar |
| Mesmo dossiê:243–257,300–356 | Ações só console.log; bootstrap cria dirs/cinco arquivos/curl e anuncia tudo instalado | Leitura estática:nenhum pip/npm/Docker/harness/modelo instalado; não executado; falso pronto |

## Números de validação: populações e limites

| População | Número lido | Identidade/ambiente | Conclusão permitida | Conclusão indevida |
|---|---|---|---|---|
| CI base |96/96 passaram em Ubuntu/macOS/Windows |CI:3–5,9–11,207–209,407–409; tested912aa253/run37266010282 | Suíte daquela revisão nos três runners |288 casos distintos, patch/Atlas aprovado ou IDE certificada |
| Fixture CI |60 arquivos/26280tokens;10consultas/10markers; payload médio556,9tokens |BMAC:9–27; CI:103–121,499–516 | Seleção/reuso local, amostra10 | p99/SLO robusto, tarefa aceita, economia faturada |
| Latência fixture CI |Mac p50=1,107ms/p95=7,142ms; Linux2,516/12,177; Windows6,520/23,856 |BMAC:24–25; CI:118–119,513–514 | Microamostra/timer/corpus específico | Latência Laya, <3ms universal ou hardware equivalente |
| Retrieval cego |79casos; MRR0,395→0,570; hit10=54,4→83,5%; top1=32,9→45,6% |E:41–66; dois repos, Mem0 parcial | Ganho histórico na localização de arquivo | Tarefa/correção/billing/ranking geral |
| Regressão definições |12/12→12/12 |R:43; casos do próprio repo | Gate local de identificadores | Semântica multifile universal |
| Definições geradas |300TS:38→97,7%;300Python:42,3→94,3% |F:112–117; mantenedor04/10, relatório externo ausente | Relato favorecido por padrão gerado | Benchmark independente de tarefas |
| Índice real |3662arquivos/28MiB;27,8→3–4s;DB96→61MB |F:94–95;Q:39 | Desempenho relatado no M5Pro | Teto20k homologado/SLO de escala |
| Laya rerank MPS |36consultas;42%→6%; fusão28%;81%truncados;720ms |E:74;L:62,65–66 | Negativo justifica não influir no contexto | Utilidade por velocidade ou paridade de novo adapter |
| Laya memória MPS histórica |64pares;56% vs lexical73%/sempre-negativo70%;8ms |E:74;L:63,65 | Accuracy menor no recorte histórico | Fine-tune/calibração90% já alcançados, derrota em toda métrica |
| Laya carga/RAM histórica |4–18s/~1,8GB |O:15;M:115 | Relato M5Pro24GB | ONNX<2GB ou Linux/Windows medidos |
| Hybrid e5 |79:top1=45,6→55,7%;hit10=83,5→84,8%;26melhores/16piores,p≈0,16; regressão self |E:75 | Inconclusivo; perfil não adotado | Embedding sempre melhor/ganho provado |
| Patch X99 |43passes=38novos+5existentes; três controles negativos falham original |N6:21–54;Node22.16/Linux não suportado | Recorte protocolo/SQL/fault worker conforme relato | Integração/build/Mac/neural completos |
| Contexto do patch |Seis escritos/zero executados |N6:48–54;ERR_MODULE_NOT_FOUND | Gate pendente por startup | Seis passes ou seis falhas funcionais |
| Protocolo X99 |35passes;5670históriasGCRA;ring20/18violações;revoke4/2violações |N5:10–104;Python/Linux/processosSQL | Mecanismos/modelos finitos declarados | Rust/todos schedules/ARM/runtime/serviços/desempenho |
| Tarefa/billing/ganho neural geral |null/não executado |N6:211–216;CI:616–618;E:9,86 | Dado não observado | Zero erro/100%sucesso/economia arbitrária |

CI:616–618 registra `nativeHarnessApplicationsTested:false`, `maintainerMacTested:false`, `modelInferenceTested:false`. Isso não contradiz a medição do mantenedor ou uma conexão Codex relatada fora da CI; são populações diferentes. Também não autoriza transformar uma conexão em tarefa com aceite. A diferença entre main `a9636e` e tested `912aa253` deve ser conferida pela auditoria de Git/diff; não se deve concluir que toda a main foi testada só porque o README diz “a cada revisão”.

## Mapa do protocolo, autoridade e caches

### O que o conjunto descreve como base

```text
Host registra uma raiz/projeto e concede escopo
  → processo MCP stdio por cliente, fixado a esse projeto
  → motor próprio: schema, identidade/acesso, prazo, execução, output
  → SQLite local comum: projetos, checkpoints/histórico, memórias, idempotência, eventos
  → índice FTS5/chunks e hash da fonte selecionada
  → pacote lexical: contexto + checkpoint + memória aprovada + trechos no orçamento
  → harness interpreta e executa sob suas próprias aprovações

Laya opt-in: CLI ask/benchmark → broker Node → worker Python JSONL offline
  → não reordena contexto na 0.4
```

Um banco local compartilhado por processos não é um daemon compartilhado de inferência. O MCP não aprova memórias, não executa shell e não controla a autenticação nativa do harness. O que já está transacionado (checkpoint/histórico/idempotência/evento) não implica que toda montagem de contexto, política de egress ou orçamento monetário já tenha o protocolo X99.

### O que X99 propõe

```text
RECEIVED → FRAME_VALIDATED → AUTHENTICATED → ADMITTED → AUTHORIZED
  → SNAPSHOT_READ → RETRIEVED → OPTIONAL_DECISION → OUTPUT_VALIDATED
  → REVISIONS_RECHECKED → PUBLISHED → DELIVERED_OR_DISCONNECTED

Controle: grant/revisão, rate/concurrency/budget, operação/attempt, CAS/outbox/fencing
Dados: conteúdo imutável, chunks/parser, índice geracional, cache exato
Observabilidade: diagnóstico limitado/perdas + auditoria crítica transacional separada

Um coordenador por usuário + socket/pipe → um worker por perfil
  → identidade de projeto/workspace/tarefa/snapshot distinta
  → consulta autorizada + snapshot coerente + revalidação final
  → resultado por operação idempotente; sem transação de escrita durante rede/inferência
```

Revisões de N4:345–359: `project_id`, `workspace_id`, `task_id`, `snapshot_id`, `memory_revision`, `policy_revision`, `authz_revision`, `index_generation`, `model_revision`, `tokenizer_revision`, `calibration_revision`, `worker_generation`, `operation_id/attempt_id`. Um epoch global ou PID sozinho não representa essas dimensões. Memória arquitetural pode ser compartilhada por projeto; evidência “teste passou” pertence ao snapshot/ambiente. As identidades são requisito futuro, não schema que esta auditoria encontrou instalado.

### Cache: objeto, chave, invalidação e status

| Cache/reuso | Objeto e chave mínima | Invalidação/limite | Estado documental |
|---|---|---|---|
| Índice incremental | Chunk igual; path/hash/project | Novo/removido/ignore requer reindex; verificar hash/refrescar | Base |
| Single-flight | Mesma leitura em voo | Não cache persistente/distribuído | Utilitário base; coalescência Laya candidata |
| Conteúdo | Bytes autorizados; scope/hash | Retenção/expurgo/autorização atual | Plano específico proposto |
| Parse | Hash/parser/opções/linguagem/scope | Rename/relações de path/build config/deps podem invalidar sem mudar bytes | Proposto |
| Embedding | Hash/pesos/dimensão/pré-processamento/normalização/autorização | Não misturar espaços vetoriais; revogar fontes | Proposto; e5 não incorporado |
| Busca | Principal/ACL epoch/query/snapshot/index generation/policy | Novo candidato altera ranking; revalidar origem/autorização | Proposto; não basta hash de resultado antigo |
| Pacote | Tarefa/checkpoint/snapshot/memory-policy-ACL/tokenizer/budget | Revisão alterada: até três montagens; não presumir retenção no harness | Seal candidato parcialmente testado; protocolo proposto |
| Decisão Laya | Estados/questões/opções exatamente ordenados; modelo/tokenizer/package/runtime/calibração/projeto/snapshot/memory/policy | Unknown/truncado/inválido inelegível; geração troca e limpa; LRU128/2MiBserializado/TTL5min não RSS | Candidato por processo/desligado; daemon proposto |
| KV/prompt de provedor | Pesos/layout/tokenizer/posição/prefixo/runtime/scope | Só backend compatível; permissões invalidam; prefixo estável não hit de provedor | Fora do núcleo; serving futuro; sem transferência KV |
| Resposta documental | Fontes imutáveis/versionadas/questão/policy | Experimento restrito; revalidar autorização/revogação | Proposto; sem cache semântico de mutação |
| Ferramenta/efeito | Leitura:snapshot/deps externos; mutação:operation ID/fingerprint | Ambiente mudou: reexecutar; efeito remoto unknown: reconciliar; idempotência não cache semântico | Checkpoint idempotente local; executor futuro |
| Autorização/segredo | Principal/ação/recurso/authzrev/condições; secret_id/version/key_id/grant/destino | Nunca bearer/plaintext em prompt/cache; autoridade estrita antes do uso; eventos só otimizam | Proposto; não broker de segredos/multiusuário instalado |

As políticas de substituição LRU/TinyLFU/S3-FIFO vêm **depois** de validade, escopo e revisões. Cache hit é trabalho evitado de uma classe, não autorização nem confirmação de efeito. Não preencher campos desconhecidos com zero/false. Arquivos/comandos cache probe escritos não medem a taxa real de hit sem serem executados e sem workload representativo.

## Mapa de falhas

### A01: todas as 28 falhas relatadas por N4:29–56

O anexo A01 original não está entre os seis news lidos. A coluna abaixo registra o que a auditoria de protocolo afirma ter encontrado; não é uma nova verificação direta do Rust ou compilação nesta auditoria.

| ID | Falha relatada | Garantia invalidada / resposta requerida |
|---|---|---|
| A-01 | E=mc² sem unidades/modelo | Latência não refutável; decompor custos |
| A-02 | Encoder O(1) confundido com forward único | Custo varia com input; medir tokens/camadas/atenção |
| A-03 | /dev/shm como arquivo regular, sem shm_open | Não demonstra portabilidade POSIX/macOS; IPC por SO |
| A-04 | Criação sem exclusividade/readiness | Dois inicializadores; owner/generation/lock/ABI |
| A-05 | Attach chama set_len | Pode corromper mapeamento; attach nunca redimensiona |
| A-06 | Magic publicado antes do restante | Estado parcial; READY atômico após inicialização |
| A-07 | Sem validar dono/modo/links | Exposição de path/umask; criação privada |
| A-08 | Loadtail/storetail+1 | Perda MPMC; reserva atômica/produtor serializado |
| A-09 | Head global destrutivo | Não broadcast/memória; store canônico/cursor por consumidor |
| A-10 | Máscara de item bloqueia head | Starvation/HOL; filas/offsets |
| A-11 | Payload sem validar tamanho | Violação de bounds; validar antes do slice |
| A-12 | Soma modular chamada Adler | Colisão por permutação; checksum correto/autenticador |
| A-13 | Leitor não confere checksum/epoch | Prosa difere de código; testes correspondentes |
| A-14 | Máscara/contador não implementam pins/retire | EBR ausente; SMR validado |
| A-15 | unsafe Sync com operações não atômicas | Data race; API segura exige prova |
| A-16 | Cache match antes de autorizar | Reuso de capacidade indevido; autorização antes/depois |
| A-17 | add_capability nunca chamado | Fast path inalcançável; alimentação/chave/invalidação reais |
| A-18 | Dimensão/tamanho/NaN não validados | Panic/vetor inconsistente; validação exata |
| A-19 | Sinais iguais não implicam equivalência | Hamming0 falso match; verificar candidato; nunca autorizar por isso |
| A-20 | TensorRT anunciado com provider CUDA | Backend incorreto; observar provider efetivo |
| A-21 | safety_logit ONNX presumido | Falta contrato do artefato; shapes/dtypes/nomes/tokenizer |
| A-22 | Probabilidades sem tamanho/finitude | Decisão degenerada/panic; schema/abstenção |
| A-23 | Platt A/B constantes, sem fitting | Confiança sem validação; holdout/versão de calibração |
| A-24 | Cópias/Vec/ndarray/exps/JSON | Não zero-copy final; medir fronteiras |
| A-25 | Afinidade Linux/core0 ignora erros | Não portátil; contenção na cauda; sem pinning padrão |
| A-26 | SUCCESS significa enqueue | Aceito difere de concluído; estados separados |
| A-27 | Fallback é string | Não executa handoff; contrato de encaminhamento |
| A-28 | Mascote recebe1,2ms por default | Demo não telemetria; somente observação real |

### Falhas de produto e comportamento exigido

| Falha | Resposta requerida | Evidência atual / lacuna |
|---|---|---|
| JSON inválido/stdout sem newline/frame deformado | Limitar antes de parsear; erro/retirar geração |N3:255; fault worker histórico do patch, não hardening da base |
| Worker excede prazo e vive |TERM/KILL; slot preso até close; geração com fencing |N3:30,58–62,256; candidato; kernel travado não garantido |
| Saída tardia de worker antigo | Só waiter da geração original |N3:31,62,257; candidato |
| Pedidos distintos concorrentes/excesso de assinantes | Uma operação distinta/BUSY; iguais limitados/cópias independentes |N3:56–58; não global entre processos |
| Revogação durante contexto/inferência | Visão SQL coerente/revisão final; release após revogação recusa |N3:76–82:helper testado/contexto pendente;N4:151–155:futuro |
| Worktree muda após pacote | Executor revalida preimage hash |N3:48,259;S:42; requisito, não lock do FS |
| Arquivo novo/ignore alterado | Reindex conforme política |Q:41;N3:50; sem watcher |
| Instalação/download duplo | Temporário único/hash/rename; lock/staging de venv |N3:261–262; download candidato, lock venv faltante |
| Várias worktrees/teste de outra branch | Separar project/workspace/snapshot |N3:200–202,260; base registra raiz única |
| Indexador antigo termina depois | Promoção geracional CAS/fencing |N3:243,263;N4:434; proposto |
| Timeout remoto após efeito |OUTCOME_UNKNOWN; preservar reserva; reconciliação/idempotência |N4:230–243:lab; sem executor/PSP/gateway geral |
| Saldo10, duas reservas7 | Ledger/outbox/reserva SQL condicional na mesma TX |N4:223:dois processos reais; integração futura |
| Crash antes/depois COMMIT | Nenhuma alteração ou alteração preservada; replay por ID |N4:619–620,736:SQL laboratório; não power loss |
| Outbox crítico falha | Não confirmar mutação sem auditoria durável |N4:261,621,736; lab não é governança completa |
| Disco cheio | Mutação falha; leitura segue política |N4:625:gate explicitamente pendente |
| Relógio recua/suspensão/PID reutilizado | Monotônico/boot generation/reconciliar leases |N4:163,627; futura validação Mac |
| Lacuna/duplicação de invalidação | Sequence/offset/epoch/reconciliar/idempotência versionada |N4:420–434,628; proposto |
| Partição regional/failover | Direitos escrow disjuntos; fence líder antigo; não ressuscitar grant |N4:603–613,629; proposto |
| Telemetria congestionada | Descartar diagnóstico limitado/contar perdas; auditoria crítica separada |N4:259–291,630; proposto |
| Pesos/tokenizer/calibração mudam | Identidade exata/paridade/shapes/invalidação |N4:478–496,631; manifesto candidato; qualidade pendente |
| Cache de outro projeto/principal/ACL | Recusar antes da fonte/entrega; escopo single-flight |N4:428,464,632; escopo host base/cache novo futuro |
| Truncamento unknown/opções colapsadas | Abster/não cachear/não inventar false neutro; reformular |N3:70,96;N4:484–486; qualidade pendente |
| Reusar teste aprovado de revisão antiga | Proibir/reexecutar no ambiente atual |N3:265;D:142; contrato, sem esse cache instalado |
| Falha local tenta nuvem | Allowlist de egress antes de fallback |N3:171,266; remoto implícito desligado; nenhum gateway adicionado |
| Revogada ainda em histórico/backup | Excluir futuro; política de retenção/restauração |S:50;N3:267; sem expurgo imediato garantido |
| Harness reinicia/compacta opacamente | Bootstrap autossuficiente; não presumir delta |N3:269;N4:404; teste nativo pendente |
| Screenshot inclui chat pessoal | Plugin separado/opt-in/escopo |N3:270;R:97; sem capturador na base |
| Obrigatórios excedem orçamento | Erro explícito/preservar decisões e bloqueios |N3:38,82; base abrevia; integrações do patch pendentes |

## Inconsistências e riscos de comunicação

| ID / prioridade | Evidência | Diagnóstico preciso | Correção documental recomendada |
|---|---|---|---|
| DOC-01 / alta |R:83,M:83,D:44,112 versus Q:83,H:184,N3:38,78,82 | “Obrigatório nunca cortado” não cobre decisões/bloqueios do checkpoint abreviado. X99 reconhece; fix não incorporado/testado integralmente | Definir obrigatórios/limitação0.4; promover após seis casos de contexto e regressão completa |
| DOC-02 / média |GuiaMacOS:38,67 versus Q:39,83 | Cópia histórica sem versão clara no título usa5000/32MiB/snapshot obrigatório | Marcar histórico0.2 e apontar Q atual; preservar limites atuais |
| DOC-03 / média |A:18 versus A:70,81,96;src/clients.mjs:15 | “Só entrada bbrainx” conflita com multiprojeto bbrainx-<PROJETO>; gerador/prova/remoção ficam fixos | Uma SERVER_NAME consistente nas regras/testes/remove/config; preservar escopo do host |
| DOC-04 / média |M:145,527 versus R:59,H:22,RN:41,CI:616 | “Cliente oficial prova harness real”/“OpenHands já funciona” ultrapassam SDK/configuração | Declarar interoperabilidade protocolar; exigir versão e teste E2E nativo |
| DOC-05 / média |E:41 |40Mem0+39Plandex=79;30PT+10EN por repo descreveria80 | Conferir cases/idiomas; corrigir contagem sem reinventar benchmark |
| DOC-06 / média |H:276 versus N3:331–337,N4:697–703 | Handoff prioriza fine-tune; X99 exige hardening/admissão/consistência antes do modelo | Resolver roadmap com dono; não anunciar capacidade pela prioridade |
| DOC-07 / média |N1:103 | POSICIONAMENTO_X99.md não existe em news; recebido BBrainX_Posicionamento_Tecnico.md | Corrigir link da cópia/contexto da branch; verificar localização na PR |
| DOC-08 / média |N6:29,45,54,236–243;N4:714–748 | Logs/patch/lab/anexo referenciados não estão em news; manifesto não é replay | Vincular commit/digest/artefato acessível; manter limite documental |
| DOC-09 / média |CI:3 versus main a9636e;R:11,95 | “Toda revisão testada” amplia identidade CI; head pode ser commit posterior de evidências | Separar testedRevision/código de commit de evidências; conferir diff |
| DOC-10 / baixa |F:31–32,73,158 versus F:3–13 | História Invokta núcleo/Laya não medido/broker futuro contradiz estado atual se isolada | Priorizar M/R; conservar banner/contexto em links profundos |
| DOC-11 / média |L:36 versus N4:85–91 | “Custo linear” descreve número de sequências, não encoder por tokens | Especificar comprimentos fixos/#pares; medir atenção/tokens separadamente |
| DOC-12 / média |L:218 | F1+8pp acompanhado de McNemar sobre acertos | McNemar testa desacordo de correção, não intervalo da diferença F1; critérios distintos | Pré-registrar incerteza F1 e McNemar separadamente |
| DOC-13 / baixa |L:186,189 |400 calibração/validação ambíguos; “kappa teto aprendível” forte | Não explicita400 total/por split; concordância não teto formal | Especificar splits; kappa como diagnóstico |
| DOC-14 / baixa |R:25 versus Q:14,D:156,N4:591 | Doctor “melhor cenário” parece eleição técnica | Outros textos dizem observação, sem benchmark | Nomear sugestão condicional; evitar “melhor” sem workload |
| DOC-15 / alta se tratado como atual |Dossiê raiz:6,49–73,300–356 versus M:531–555 | “Definitivo/produção/pronto”,100x,<5ms,>90%cache/isolamento total sem prova; bootstrap não instala | Preservar rejeição/histórico; não copiar configs/adotar serviços automaticamente |
| DOC-16 / baixa |N6:282–284 versus N6 atual | Manifesto validation.json5832bytes distinto da cópia expandida9551 | Não autenticar cópia por digest de outro arquivo; explicitar identidades |

Confirmação atual de DOC-01: `repo/src/context.mjs:32–40` mede o checkpoint contra metade do orçamento. Quando ele excede essa fatia, mantém apenas `objective`, `nextAction`, `status`, `snapshot` e `host`; as demais listas viram contagens e uma sugestão de consultar `session_get`. As memórias aprovadas entram depois, em `repo/src/context.mjs:43`, e o teste de obrigatório caber no orçamento ocorre em `:46`. Portanto, a afirmação de preservação é correta para o bloco já reduzido e para as memórias selecionadas, mas não para o texto das decisões/bloqueios do checkpoint. O store preserva o original; o pacote pode perder a restrição necessária à próxima ação. A auditoria de runtime deste trabalho reproduziu isso na mesma base, com orçamento 1.000: `checkpointTrimmed:true`, decisão e bloqueio ausentes, `payloadTokens:241` e checkpoint original ainda armazenado (`../evidence/runtime-audit.json`). Essa execução pertence à seção de runtime, não foi repetida pela leitura documental.

Os itens legais dos mapas são **vereditos de adoção declarados pelo projeto**, não parecer jurídico nesta auditoria. Por exemplo, M:379 formula GPL como consequência sobre o repositório inteiro, uma simplificação que exige avaliação do caminho exato de distribuição/derivação; esta seção não transforma essa frase em conclusão jurídica. O mesmo cuidado vale às afirmações sobre concorrentes/edições/licenças: foram lidas em documentos datados, sem nova auditoria integral de upstream.

## O que precisa ser provado antes de mudar a descrição do produto

1. **Hardening candidato:** Node suportado/lockfile, suíte completa e seis casos de contexto, build/E2E, MCP legado/moderno, Laya real no Mac, duração longa timeout/restart, revisão de privacidade/diff e evidência por commit (N3:286). Os43passes seletivos não liberam esse gate.
2. **Autoridade compartilhada real:** identidade projeto/workspace/tarefa/snapshot e grant do host; daemon por usuário; um worker por perfil; limites globais/cliente/bytes; dois harnesses retomando a tarefa sem duplicar modelos (N3:333;N4:699). SQLite compartilhado não prova isso.
3. **Recursos/falhas:** admissão rate/concorrência/orçamento coordenada atomicamente; operation/attempt; ledger/reserva/outbox; unknown/reconciliação; fencing no destino; revogação linearizável; reconexão/suspensão/disco/stream/partição conforme perfil (N4:701,619–634).
4. **Qualidade:** holdout independente/versionado e controles lexicais; ablação/truncamento/opções colapsadas/calibração/cobertura/erro/custo de falso descarte; always nunca retirada; falhas voltam ao determinístico (L:218–247;N4:488–506). Os critérios do prompt são metas.
5. **Economia/tarefa:** tarefa aceita por teste/revisão; tempo completo, carga fria/retries/releituras/inferência/ingestão/custo observado; desconhecidos null; não converter hit10 ou556,9tokens em dólares (E:79–96;N2:37).

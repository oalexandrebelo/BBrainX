# BBrainX 2.1.1 — Developer Preview — 16/10/2026

Correções de recuperação em revisão: diretórios sensíveis excluídos também em candidatos Git; cota de bytes conferida antes de cada commit de lote; recuperação após `ENOTDIR`; orçamento de busca aplicado ao primeiro corpo e aos ponteiros; declarações em strings/comentários ignoradas e nomes como `f`/`T` localizáveis. FTS usa rank nativo com os mesmos pesos. **Schema 3:** backup `brain.v2-backup.sqlite`, preservação de estado durável e reconstrução obrigatória do índice; acrescenta índice `(project,status,id)` de memórias. [Testes, medição e roteiro de retorno](worklog-2026-10-16-retrieval-review.md).

Faixas (lanes) deixam de travar o recrutamento entre projetos.

| Antes | Agora |
|---|---|
| A faixa de um recruta só fechava na baixa manual (`recruit dismiss`); recruta concluído seguia ocupando vaga | O supervisor fecha a faixa quando a CLI termina (concluído, falhou, parado); worktree e ramo ficam para diff e merge |
| Capacidade contada sobre **todas** as faixas da máquina; cada chamador passava um limite diferente (2, 8, 12) | Capacidade **por projeto** (padrão 12); teto da máquina 64 só como proteção |
| Limite fixo no código | `BBRAINX_LANE_CAPACITY` de 1 a 32 |
| Supervisor morto (queda, reboot) prendia a vaga para sempre | `bbrainx recruit gc --project ID` ou `--all` fecha faixas de recrutas sem supervisor vivo; o recrutamento roda essa coleta no próprio projeto antes de pedir vaga |

Medido no Mac mini em 16/10: 9 faixas ativas, nenhuma com processo vivo (7 `ab-s00s`, 1 `bbrainx-dev`, 1 `services`), travavam o recrutamento de outro projeto.

# BBrainX 2.1.0 — Developer Preview — 16/10/2026

- **Integração AB-S00S opt-in:** `integrate --ab-s00s on|off` adiciona/remove a segunda entrada gerenciada em `.mcp.json`, `.codex/config.toml` e `.vscode/mcp.json`. Mesmo recibo por arquivo, backup privado, controle de hash e rollback. Sem a flag, mantém o comportamento anterior. Caminho por `--ab-s00s-bin` ou `realpath` de `~/.local/bin/ab-s00s`; `off` funciona sem o binário. Entradas alheias não são adotadas.
- **OpenHands Agent Canvas:** `config --client openhands` imprime JSON de `mcp_config` do Agent Server (`transport: "stdio"`), com `bbrainx` e AB-S00S quando solicitado. Formato conferido na referência local `0c7c225`; sem instalação ou certificação de conexão nativa.
- **ACI:** `context_read` entrega janela numerada `%6d| `, até 400 linhas/64 KiB, apenas de arquivos indexados, com hash conferido novamente após a varredura. `context_symbol` encontra declarações lexicais por nome exato, com arquivo, linha, tipo e hash; até 50 resultados/200 trechos candidatos. Ambas respeitam projeto/lane e recusam `INDEX_REQUIRED`/`INDEX_STALE`.
- **Catálogo:** oito ferramentas padrão (antes seis), onze com `--recruit` (antes nove). Asserções e manifesto MCPB atualizados explicitamente; opt-ins SDD/Laya continuam acrescentando uma ferramenta cada. Sem mudança de schema de banco ou dos contratos de checkpoint/memória.

[Uso e limites](QUICKSTART.md#ab-s00s-e-openhands-agent-canvas) · [Evidência e retomada do WP-B](worklog-2026-10-16-wp-b.md). Os números históricos abaixo permanecem vinculados às revisões em que foram medidos.

# BBrainX 2.0.2 — Developer Preview — 16/10/2026

| Medida | Valor |
|---|---|
| Recrutas por chamada | 10 (era 6); por entrada 10 (era 4); ativos por projeto 12 (era 8) |
| `--network` / `network: true` | recruta Codex de implementação com rede e `listen` local (sandbox recusava com EPERM); revisão segue sem rede |

# BBrainX 2.0.1 — Developer Preview — 15/10/2026

Hosts que instalam servidores MCP por bundle (Chat On Steroids, Claude Desktop) passam a ter o BBrainX com formulário de configuração.

| Medida | Valor |
|---|---|
| Bundle MCPB (`npm run package:mcpb`) | manifest 0.3, servidor `node`, 4 pacotes de execução travados pelo lockfile (zod, gpt-tokenizer, jsonc-parser, smol-toml); painel fora |
| Configuração sem argumentos | `BBRAINX_PROJECT`, `BBRAINX_HOME`, `BBRAINX_RECRUIT`, `BBRAINX_HARNESS`, `BBRAINX_LANE`, `BBRAINX_WORKSPACE` (argumento explícito vence; vazio é ausente) |
| `config --client cos` | executável, argumentos e ambiente para o Chat On Steroids (Plugins → Custom executable) |
| Testes | `test/mcpb.test.mjs`: o bundle lança pelo comando que o host expande e responde 9 ferramentas; `--client cos`; fallback por ambiente |

Oportunidades: catálogo do Chat On Steroids apontando para o bundle da release (fork `chat-on-steroids-bbx`, `docs/bbrainx-integration.md`); escrita do checkpoint no Compact & Resume do CoS; ponte LAN para o celular.

# BBrainX 2.0.0 — Developer Preview — 13/10/2026

| Medida | Valor |
|---|---|
| Recrutamento BYO (Claude Code + Codex reais, tarefa real) | 2 recrutas, 2 commits em branches próprias, checkout principal limpo; Codex fez 4 chamadas ao BBrainX da lane |
| Custo observado no recruta Claude (haiku, low, 3 turnos) | US$ 0,032 informado pela CLI |
| Tokens do recruta Codex (gpt-6-astra, low) | 137.177 entrada (117.760 em cache) · 653 saída |
| Verificação de frescor por busca (M4, árvores reais) | 2.588 arquivos: 0,52 s por processo CLI · 633 arquivos: 0,19 s |
| Testes automatizados | 758/758 no Node 24.21.0 (macOS arm64) |
| Ferramentas MCP | 6 por padrão · 9 com `--recruit` (`agents_recruit`, `agents_status`, `agents_dismiss`) |
| Limites de uso do Codex via `app-server` | janela, percentual, reset, plano e créditos, sem ler `auth.json` |

Mudanças: AB-BBX como núcleo próprio; `INDEX_STALE` quando a worktree diverge do índice; `index-status` e `watch`; checkpoint com notas de 2.000 caracteres; contadores por capacidade no painel; recrutamento de agentes nas CLIs já logadas (modelo BYO do Orca); `EACCES`/`EPERM` saem do manifesto em vez de derrubar a busca.

Oportunidades: painel de contas com vários `CLAUDE_CONFIG_DIR`/`CODEX_HOME`; limites do Claude Code por statusline opt-in; acompanhamento ao vivo dos recrutas; fila acima de 8 ativos; custo da varredura em repositórios grandes (processo dedicado ou invalidação incremental); Windows (15 falhas de CI, backlog). Detalhes em [RECRUIT.md](RECRUIT.md) e [BBRAINX_2_0.md](BBRAINX_2_0.md).

# BBrainX 1.5.0 — Developer Preview — 10/10/2026

| Medida | Valor |
|---|---|
| `context_search`, média por resposta, 36 consultas | 17.778 → 3.666 tokens (−79,4 %); arquivo localizado 31/36 → 31/36 |
| Piso de recuperação (godmode), hit@10 | 0,889 |
| Testes automatizados | 735/735 no Node 24.21.0 e no Node 22.22.2 (macOS arm64) |
| Playwright (painel · uso · controle) | 24/24 · 6/6 · 3/3 |
| Controles negativos MCP | 7/7 detectados |
| Clientes reais | Claude Code e Codex chamam `context_search` |

Oportunidades: gate MEDIUM em dois Macs; ícone por ferramenta e na barra de status do VS Code; favicon próprio de 16 px; wordmark para fundo claro; resultado enviado em `content` e `structuredContent`; eco do checkpoint; corrida rara do ledger de admissão Laya (2 em 9.000 aberturas). Detalhes em [HOMOLOGACAO_2026-10-10.md](HOMOLOGACAO_2026-10-10.md).

# Custo em tokens do que o agente lê — 10/10/2026

Base `5acad77`. Medido em payload com o200k_base (`gpt-tokenizer`), um proxy: não é cobrança do provedor, `billingSavings` continua `null`. Cada item abaixo traz o teste que o fixa; mudanças de contrato público estão marcadas.

- **Contrato:** `context_search` ganha `budget` (256 a 16000, padrão 4000 tokens) e a resposta ganha `omitted`; `truncated` também vale quando o orçamento corta. O que o orçamento deixa de fora volta em `more` como `caminho:linhas` (cerca de 10 tokens cada, até 25, dentro do mesmo orçamento). O melhor acerto é sempre servido. Antes, 12 trechos de 60 linhas custavam cerca de 15,5 mil tokens por chamada e `limit: 50` cerca de 62 mil; agora a resposta padrão tem cerca de 3,8 mil. Quem precisa de todos os trechos com corpo passa `budget: 16000`. A CLI `search` aceita `--budget`; o botão Buscar do painel recebe o mesmo teto.
- **Contrato:** `tools/list` deixa de repetir a regex dos identificadores como `pattern` em cada propriedade (a validação no servidor é a mesma: mesmos seis ids inválidos recusados, mensagem de erro de 55 para 43 tokens) e `outputSchema.data` passa a ser objeto JSON ou null, sem o esquema recursivo de `z.json()` repetido nas seis ferramentas. `tools/list` no fio: 2.431 para 1.925 tokens (-20,8%); o que o modelo vê por turno (instruções + nome, descrição e esquema de entrada): 1.498 para 1.382 (-7,7%), já com o `budget` novo de `context_search`. O ganho de `outputSchema` só chega ao modelo se o harness o injeta no prompt (não verificado).
- **Contrato:** o cabeçalho de cada seção do pacote traz 12 hex do hash do arquivo (o hash completo de 64 hex continua em `sources[].hash`), e trechos abaixo de `BBRAINX_PACK_MIN_RELEVANCE` (padrão 0,3 do melhor score; `0` desliga; valor fora de 0 a 1 é recusado com `INVALID_LIMIT`) deixam de entrar, exceto os dois melhores e o melhor de código e de documentação. Novo campo `sourcesOmittedByRelevance`. O piso vem do ambiente do host, nunca de argumento de ferramenta. Medido em 60 consultas rotuladas deste repositório (36 `eval-natural` e 24 `eval-self`, corpus `5acad77`): pacote entregue 4.573 para 4.389 tokens (-4,0%), arquivo esperado presente em 45 de 60 antes e depois; nas 5 tarefas com linhas de referência, 4.818 para 4.126 (-14,4%) com a mesma cobertura de linhas (0,83). O cabeçalho curto sozinho não reduz o pacote (4.650): o espaço liberado é preenchido com mais uma seção.
- **Contrato:** `context_search` devolve um acerto por arquivo, o melhor trecho, e `limit` passa a contar arquivos. Os outros trechos do mesmo arquivo entre os acertos (até 2) vêm no próprio item como `also`, faixas `inicio-fim` sem corpo. `search()` ganha `{byFile:false}` para a lista crua de trechos, que o pacote de contexto e os scripts de evidência continuam usando. Medido em 36 consultas de `eval-natural` (corpus `5acad77`): acerto em 3 de 0,639 para 0,694, em 10 de 0,861 para 0,889, vagas repetidas no top-10 de 38 para 0. Nas 5 tarefas com linhas de referência a resposta padrão passa de 3.831 para 3.466 tokens (-9,5%), as linhas de referência localizadas (corpo, `also` ou `more`) de 0,898 para 0,922, e as que chegam com corpo caem de 0,833 para 0,718: a segunda faixa do mesmo arquivo agora vem como `also` e o agente a lê com um `Read`. Com `limit: 50` os arquivos de referência localizados sobem de 0,90 para 1,00. Fundir os trechos num item só, com corpo, foi medido e descartado (ver o commit).
- **Contrato:** projeto ou lane sem índice deixa de passar por "nada encontrado". `context_search` (e `search()`) agora recusa com `INDEX_REQUIRED` em vez de `ok: true, items: []`, e `INDEX_REQUIRED` (também no `context_bootstrap`) traz `detail`: "Projeto sem índice. Chame context_index e repita." (antes `detail: null`). Um projeto indexado sem arquivo elegível continua devolvendo lista vazia legítima. As instruções do servidor ganham uma frase ("If a call returns INDEX_REQUIRED, call context_index once and retry."): 175 para 189 tokens, +14 por turno (1.382 para 1.396 no total por turno). A asserção de `test/turbo.test.mjs` que fixava `detail: null` foi atualizada para o texto novo.
- **Contrato:** `MANDATORY_CONTEXT_EXCEEDS_BUDGET` deixa de vir com `detail: null`. A mensagem diz quanto o obrigatório pesa (exato: com `budget` igual a esse número o pacote monta), de onde vem (memórias `always`, memórias casadas com o objetivo, checkpoint, cabeçalho) e o que fazer: aumentar `budget` (até 16000) ou pedir ao humano que revogue memórias ou as mude para `relevant`; se nem 16000 bastam, só a segunda opção. O obrigatório continua sem ser cortado em silêncio: o pacote ou monta inteiro ou é recusado. Com 50 memórias `always` de ~100 tokens, a recusa passa de 25 para ~110 tokens, só no caso de erro.

# Alinhamento SDD por projeto — 08/10/2026

Detecção de artefatos Spec Kit e SDD genérico, avaliação de cobertura documental por feature e criação exclusiva de rascunho técnico quando ausente. Inclui CLI, HTTP/painel e MCP opt-in `--sdd`, quotas, fontes por hash e testes de escopo/concorrência. A nota não é avaliação semântica ou certificação de qualidade. [Especificação](specs/sdd-alignment.md), [operação](integrations/SDD.md) e [ADR](decisions/0002-sdd-coverage.md). Nenhum runtime MetaGPT/Spec Kit ou chamada paga foi incorporado.

# Decisões locais Laya — 08/10/2026

Capacidade opcional no painel, CLI e MCP, com cache exato isolado, limites do broker, cancelamento e abstenção por perda de entrada. Perfil Python recuperável com seleção explícita de runtime compatível. O núcleo de contexto continua determinístico: o benchmark com janela maior ainda não superou a baseline lexical. [Contratos](integrations/LAYA.md) e [evidência](engineering/LAYA_2026-10-08.md). Sem alteração de pesos, API paga ou comparação vencedora com JEV.

# Candidato consolidado (PR #12) — incorporado na 1.5.0

A PR #12 reúne Atlas, MEDIUM/replay, Observatory, contratos, lanes e os laboratórios isolados das PRs #6–#11. O estado integrado está em [research/INTEGRATION.md](research/INTEGRATION.md); as notas anteriores abaixo conservam o escopo e os resultados de suas rodadas, não descrevem sozinhas o estado atual.

A revisão de lançamento acrescenta revalidação da raiz autorizada, quotas transacionais no refresh parcial, operação por teclado do Atlas e gates de CI que exigem a validação consolidada antes da publicação. Não muda o schema, não instala modelos e não incorpora automaticamente o candidato histórico de worker/cache Laya. Evidências e limites: [RELEASE_READINESS.md](RELEASE_READINESS.md).

---

# Histórico do candidato de integridade de contratos (PR #10)

Base de estudo: 0.4.0 em `a9636e9`. As alterações abaixo só entram no produto após revisão e merge; não alteram o schema ou as configurações dos harnesses.

## Contratos que mudam neste candidato

- O deadline cobre validação de entrada, autorização, execução e saída. Uma chamada já cancelada não inicia validação ou acesso. Conferências monotônicas nas fronteiras impedem prosseguir depois de um estágio síncrono esgotar o prazo; isso não preempta esse estágio nem desfaz seus efeitos.
- Entrada e principal são capturados antes do primeiro await. A autorização não modifica a identidade entregue à ação através de uma referência compartilhada.
- `describe()` retorna árvores de schema desconectadas do catálogo interno. Editar a descrição recebida não altera o contrato visto por outro cliente.
- `decisions` e `blockers` do checkpoint não são mais substituídos por contagens quando o histórico é compactado. Se os obrigatórios excedem o orçamento, a montagem é recusada. O histórico auxiliar continua podendo ser omitido com aviso. O teste anterior que exigia a omissão de decisões foi atualizado para exigir sua preservação literal; não foi removido.
- Schemas Zod assíncronos podem ser explicitamente adaptados por `asyncZodSchema`, usando a API pública `safeParseAsync` sem sondagem síncrona repetida. O motor permanece Standard Schema. Sem mudança silenciosa dos schemas existentes.

## Trabalho repetido evitado

Uma leitura/hash por arquivo e versão em cada rodada de montagem, e quota documental avaliada antes da retokenização integral. O mapa não persiste entre chamadas; BPE continua exato. Medições e limites estão em `docs/core-contracts/` e nos artefatos da CI do commit, não nos números históricos abaixo.

O candidato não incorpora automaticamente os PRs #6/#8/#9 ou o patch Laya anterior. Integração com #9 precisa preservar sua instrumentação de contexto e rerodar as duas suítes.

---

# BBrainX 0.4.0 — Developer Preview

Motor e servidor MCP próprios, busca em linguagem natural entre português e inglês, perfil Laya instalável e o mapa do estudo. Duas dependências a menos.

## Mudou

- **Motor e MCP próprios.** `@invokta/core`, `@invokta/mcp` e, com eles, o SDK oficial do MCP saíram da execução. Pacotes de produção no lockfile: de 121 para 25. O contrato segue o modelo do Invokta (aviso MIT completo em `THIRD_PARTY_NOTICES.md`); o cliente oficial continua nos testes, como prova de interoperabilidade.
- **Duas eras do MCP.** O servidor atende a revisão corrente (2026-07-28, sem handshake, com `server/discover` e metadados por requisição) e as revisões com `initialize` (de 2024-11-05 a 2025-11-25) no mesmo processo.
- **Busca em linguagem natural.** Dois estágios somados: termos exatos e, com metade do peso, os mesmos termos por radical e por um glossário de programação português → inglês. Palavras vazias saem da consulta quando sobra algum termo que discrimina. Em 79 perguntas cegas sobre dois repositórios de terceiros, o arquivo esperado ficou entre os 10 primeiros em 84 % dos casos (antes, 54 %) e em 1.º em 46 % (antes, 33 %).
- **Pacote de contexto.** Documentação fica com no máximo metade do orçamento enquanto houver código candidato.
- **Um passo para começar.** `bbrainx up --root <pasta>` registra, indexa e mostra como ligar cada harness. `doctor` passa a informar o melhor cenário da máquina. `config --client` imprime a configuração de Claude Code, Codex, Cursor, VS Code e Gemini CLI.
- **Perfil Laya.** `bbrainx laya install | status | ask | remove`: ambiente Python isolado, pesos fixados por revisão e SHA-256, bibliotecas em modo offline no processo (`HF_HUB_OFFLINE=1`; não é bloqueio de rede do sistema operacional). Medido no M5 Pro: não melhora as duas decisões testadas sem ajuste fino, então não altera o pacote.
- **Avaliação.** O relatório informa intervalo de confiança de 95 % e o snapshot do corpus. `scripts/laya-bench.mjs` mede o perfil contra o caminho determinístico.
- **Mapa do estudo.** Nova aba do painel e `docs/STUDY_MAP.md`, gerados da mesma fonte: 37 ferramentas em cinco situações, com o porquê de cada uma.

## Corrigido

- Uma chamada cancelada antes de começar ainda executava, e a rejeição ficava sem dono: chamada e cancelamento no mesmo bloco de leitura derrubavam o servidor. Reproduzido, corrigido e coberto por teste com processo real.
- Requisição cancelada recebia resposta; a especificação pede que não receba mais nenhuma mensagem.
- Uma linha completa acima do limite, dentro de um único bloco de leitura, era aceita.
- `init` com a mesma pasta e outro nome já devolvia erro claro na 0.3; `up` agora reaproveita o nome que a pasta já tem.

## Contratos que mudaram

- **Recusa do domínio vira erro de ferramenta.** Quando o resultado traz `ok:false` (conflito de versão, índice ausente, orçamento insuficiente), a resposta MCP passa a vir com `isError: true`. O envelope `ok/data/error/detail` continua igual.
- **`TIMEOUT` é um código novo**, distinto de `CANCELLED`.
- **Limite de chamadas.** Mais de 300 chamadas de ferramenta por minuto recebem `RATE_LIMITED` como erro de ferramenta.
- **Identificador de requisição** precisa ser texto ou inteiro; número fracionário é recusado.
- **Fim da entrada padrão** cancela o que estiver em andamento e encerra o servidor, sem esperar.
- **`selection`** do pacote passa de `lexical-ranked` para `lexical-ranked-with-doc-quota`.
- **A busca devolve mais resultados** para a mesma consulta, porque passa a casar por radical. Quem dependia de «só os arquivos com a palavra exata» precisa filtrar.
- A revisão `2024-10-07`, que nunca foi publicada, saiu da lista de versões aceitas.

## Não mudou

O esquema do banco é o mesmo da 0.3 (versão 2): não há migração. As seis ferramentas, os nomes e os argumentos são os mesmos. Nenhum comando altera a configuração dos harnesses.

## Limites desta versão

- O prazo de uma chamada não interrompe trabalho síncrono: uma indexação longa segue até o fim e o servidor não lê a entrada enquanto ela roda.
- Qual era do protocolo cada harness usa hoje não foi medido. O cliente oficial da linha 1.x prova a era com handshake; a era sem handshake é provada por testes próprios, com o fio cru.
- O glossário português → inglês foi escrito por quem viu os casos deste repositório; o ganho foi confirmado depois em perguntas cegas, mas o conjunto é pequeno.
- Esta rodada não teve revisor independente. Os testes novos foram provados por sabotagem (28 defeitos injetados, todos detectados).

## Em `main` depois da prévia

A release `v0.4.0-preview` é imutável e não traz estes itens.

- **O servidor informa o id do projeto.** A descrição do argumento `project` de cada ferramenta e as instruções da sessão passam a dizer qual projeto o processo atende. Antes, um agente numa sessão nova via o argumento obrigatório e não tinha de onde tirar o valor; o defeito apareceu na primeira ativação num projeto real. Nomes, argumentos e códigos de erro não mudaram. As instruções também nomeiam a pasta atendida e pedem que as ferramentas não sejam usadas em outro repositório, porque no Codex e no Gemini o registro de servidores é global.
- **Codex.** `config --client codex` passa a imprimir também o comando `codex mcp add`, executado como saiu no codex-cli 0.160.0, e lembra de pôr o projeto no nome do servidor quando a máquina tem mais de um.
- **Marca.** O monograma BX passa a ser a marca em uso, de forma provisória: ícone, cabeçalho do README, painel e filme. As três opções continuam em `public/brand/options/`, agora com um GIF que as alterna (`docs/BRAND.md`).
- **Prompts.** `docs/prompts/ACTIVATE.md` leva um agente, em qualquer harness, a ligar o BBrainX a um projeto e provar o resultado. `docs/prompts/LAYA_FINETUNE.md` dá a outro agente o contexto, as regras e os critérios de aceite para o ajuste fino do Laya.
- **Handoff.** `docs/HANDOFF.md`: estado, mapa do repositório, contratos, armadilhas e próximos passos.

---

# BBrainX 0.3.0 — Developer Preview

Núcleo revisto a partir de medições num repositório real. Sem dependência nova.

## Mudou

- **Busca:** a declaração de um nome vem antes dos usos e dos testes; identificador composto casa com suas partes (`eraseUserData` ↔ `erase_user_data`). Em 300 casos gerados automaticamente por repositório, o acerto em primeiro lugar foi de 38 % para 98 % (TypeScript) e de 42 % para 94 % (Python).
- **Arquivo alterado:** é relido antes de ser servido. O pacote deixa de falhar com `STALE_INDEX`, salvo no modo estrito (`context --strict`).
- **Indexação:** um arquivo por vez, tetos configuráveis pelo host (padrão 20.000 arquivos e 256 MiB). Primeira indexação de 3.662 arquivos: de 27,8 s para 3,2 s. Banco: de 96 MB para 61 MB.
- **Checkpoint:** aceita `done`, `decisions`, `blockers`, `filesTouched` e `evidence`. `snapshot` passa a ser opcional; o host carimba o snapshot, o commit e o ramo do Git.
- **Memória:** modo `relevant`, que só entra quando casa com o objetivo e é escolhido pelo humano na aprovação; proposta idêntica não duplica.
- **Avaliação:** `scripts/eval-retrieval.mjs` e `scripts/make-definition-cases.mjs`.
- **Erros:** as respostas trazem `detail` com a razão e a correção sugerida.

## Atenção ao atualizar

O banco é migrado na primeira abertura, com cópia íntegra em `brain.v1-backup.sqlite`. O índice de texto é descartado e precisa de `index` em cada projeto. Checkpoints, memórias e eventos são preservados. Roteiro e retorno em `docs/QUICKSTART.md`, seção 8.

Contratos alterados:

- `context_bootstrap` não recusa mais o pacote por arquivo alterado.
- O envelope de resposta ganhou o campo `detail`.
- `context_search` devolve os itens ordenados por `score`; o `rank` do BM25 continua no item.
- `context_index` devolve no máximo 100 itens em `skipped`, com o total por motivo em `skippedByReason`.
- Checkpoint com campo desconhecido é recusado também pela CLI (`INVALID_CHECKPOINT`). O teto de 16 KiB vale para o que é gravado, incluindo os campos do host.
- Registrar a mesma pasta com outro nome responde `PROJECT_ROOT_ALREADY_REGISTERED`.
- Padrões de credencial ampliados: arquivos com chave AWS, Google, Slack, Stripe de produção ou token fino do GitHub deixam de ser indexados.

## Não mudou

Nenhum modelo, gateway, daemon ou serviço externo foi introduzido. A análise de viabilidade das integrações está em `docs/FEASIBILITY.md`. Limite conhecido: a indexação roda numa única transação de escrita; durante a primeira indexação de um repositório grande, outra escrita no mesmo banco pode esperar e falhar por tempo esgotado.

---

# BBrainX 0.2.0 — Developer Preview

A local-first context and handoff layer for coding agents, with an inspectable React Flow workbench.

## Included

- SQLite/FTS5 persistent incremental text index, explicit project scope and verified source hashes.
- Invokta MCP stdio capabilities with structured inputs/outputs.
- Versioned durable checkpoints, idempotency and transactional event journal.
- Memory proposals with separate local approval/revocation.
- A bounded context compiler with actual o200k_base payload counts.
- macOS launcher, dependency doctor, exact npm lockfiles and reversible setup.
- Interactive architecture, working local context lab, research dossier and original Remotion presentation.
- CI evidence for native macOS, Windows and Linux, real independent MCP clients and Chromium desktop/mobile checks.

Download the source ZIP and verify SHA256SUMS. Read docs/QUICKSTART.md. Run npm run setup, npm run demo, then npm start.

## Scope

This is a developer preview, not a notarized Mac application or a production multi-tenant service. No model inference, provider cache savings, automatic desktop control or individual IDE certification is claimed. Optional model profiles remain opt-in research. The validation report names the exact tested revision and environment.

Source, screenshots, locks and the original video are included; installed node_modules, upstream reference checkouts, credentials and font files are not redistributed. Remotion has separate licensing. No private project data was used in tests.


## State 03B — alterações do contrato MCP (candidato incremental)

Limites de invocações e de frames por conexão, bytes de saída com backpressure e escrita com prazo. IDs em voo não podem ser reutilizados; duplicata encerra a conexão sem resposta concorrente. IDs numéricos precisam ser inteiros seguros e strings têm teto de 1024 bytes. UTF-8 inválido e cauda incompleta são recusados, não normalizados/descartados silenciosamente. EOF cancela tools e drena respostas concluídas sob prazo. O suporte de batch existente continua como extensão limitada a 32 membros.

A superfície de ferramentas, versões anunciadas, memória, credenciais e allowlist não mudam. O rate limiter continua 300 chamadas por minuto, agora com relógio monotônico e ring exato. Quota MCP é por conexão/engine promise, não um limite físico global. Consulte `MCP_TRANSPORT.md` para parâmetros, erros, limites e escopo da verificação.

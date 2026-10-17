<p align="center"><img src="public/brand/wordmark.svg" width="720" alt="BBrainX — GODMODCODE"/></p>

<p align="center"><strong>Continue o trabalho. Não reconstrua a conversa inteira.</strong><br/>Contexto local, memória governada e handoffs verificáveis entre agentes de programação.</p>

<p align="center"><a href="https://github.com/oalexandrebelo/BBrainX/actions/workflows/verify.yml"><img alt="CI: consulte a execução e a revisão testada" src="https://github.com/oalexandrebelo/BBrainX/actions/workflows/verify.yml/badge.svg"/></a> · <a href="docs/QUICKSTART.md">Começar</a> · <a href="docs/STUDY_MAP.md">Mapa do estudo</a> · <a href="docs/DOSSIER.md">Dossiê</a> · <a href="docs/SECURITY_MODEL.md">Segurança</a> · <a href="docs/EVALUATION.md">Avaliação</a> · <a href="README.en.md">English</a></p>

## BBrainX 2.0 · AB-BBX

O BBrainX nasceu para acelerar e otimizar projetos reais e foi compartilhado para permitir continuidade entre ferramentas e agentes. **AB-BBX** é a camada própria de execução de capacidades: validação, autorização, cancelamento, prazos e contratos MCP. A entrada pública é `src/ab-bbx.mjs`; o caminho anterior conserva compatibilidade. Não há dependência de um motor externo de ações no runtime.

A versão 2.0 atende projetos distintos, com prioridade para Mac mini e MacBook Pro M5. Busca e contexto verificam o corpus antes de responder: `INDEX_STALE` pede reindexação explícita, incluindo arquivos novos que a busca antiga não encontraria. `index-status --project ID` diagnostica sem alterar o índice. O painel mostra buscas, contextos e checkpoints por sessão, sem registrar consultas. Execute `node bin/bbrainx.mjs watch --project ID` em um processo separado; use `--lane ID` para uma lane já registrada. A cada ciclo, o processo reconcilia arquivos novos, alterações, remoções e regras Git. Não instala serviço nem modifica hooks. O intervalo padrão é 30 segundos **após** o término da varredura; não é uma garantia de atraso máximo.

[Contrato da 2.0, revisão dos repositórios e aceite nos Macs](docs/BBRAINX_2_0.md) · [Operação AB-BBX](docs/AB_BBX.md). Busca lexical e checkpoints são ferramentas de desenvolvimento; não integram o runtime do aplicativo nem certificam seu lançamento.

### Recrutar agentes (BYO: suas CLIs, seus logins)

Numa sessão ligada ao BBrainX, diga ao harness **"recrute 1 codex astra 6 high e 2 opus 5.5 xhigh para corrigir X"**. O BBrainX lança o Claude Code e o Codex que já estão instalados e logados nesta máquina, um por recruta, cada um em worktree, branch e lane próprios; o checkout principal não é tocado. Nenhuma assinatura nova, nenhum token lido. `integrate --apply` concede isso ao servidor com `--recruit` (onze ferramentas); sem o flag, oito. `bbrainx recruit doctor` mostra as CLIs, o login e os limites de uso do Codex. Medido em 13/10/2026 com as duas CLIs reais: dois recrutas, dois commits, checkout limpo. [docs/RECRUIT.md](docs/RECRUIT.md).

## O que é

O BBrainX roda na sua máquina e entrega ao agente de programação o que ele precisa para continuar uma tarefa: os trechos certos do repositório, o checkpoint da sessão anterior e as memórias que você aprovou. Fala MCP. Não usa modelo, conta, Docker nem Python no núcleo e não faz chamadas de rede de saída.

| Cliente | Estado na 2.0 |
|---|---|
| Claude Code | **Verificado.** `claude -p --mcp-config` chamou `context_search`; como recruta (haiku), trabalhou em worktree própria e commitou |
| Codex | **Verificado.** `codex exec` chamou `context_search`; como recruta (gpt-6-astra), chamou `context_bootstrap`, `context_search`, `session_checkpoint` e `session_get` na lane dele |
| VS Code | **Verificado em parte.** O `.vscode/mcp.json` gerado foi exercitado por um cliente do SDK MCP, do jeito que o VS Code o inicia. O início pela interface do VS Code é manual |
| OpenHands Agent Canvas | **Formato conferido na referência local.** `config --client openhands` imprime `mcp_config` stdio; conexão nativa não homologada |
| Cursor, Gemini CLI | **Não verificado.** Só imprime os fragmentos de configuração (`config --client cursor` e `--client gemini`) |

Esta branch propõe a **2.0.0** na única [PR #22](https://github.com/oalexandrebelo/BBrainX/pull/22). Versão declarada não significa atualização já instalada nos dispositivos. Windows fica no backlog por decisão do mantenedor; suas falhas continuam visíveis e não bloqueiam a entrega para Mac. Evidências históricas da 1.5.0: [docs/HOMOLOGACAO_2026-10-10.md](docs/HOMOLOGACAO_2026-10-10.md).

## Instalar em uma linha (macOS)

No Terminal:

```sh
curl -fsSL https://github.com/oalexandrebelo/BBrainX/releases/download/v2.3.0-preview/install.sh | bash
```

Ou cole no Claude Code, numa sessão aberta na pasta do seu projeto:

```text
Instale o BBrainX nesta máquina e ligue este projeto: rode
curl -fsSL https://github.com/oalexandrebelo/BBrainX/releases/download/v2.3.0-preview/install.sh | bash -s -- "$PWD" --apply
e depois ~/.local/bin/bbx ch --no-open. Mostre o resumo e me diga quais passos são meus.
```

O instalador baixa o kit da release e confere o SHA-256 de cada arquivo. Depois roda a suíte de testes nesta máquina, instala ao lado da versão anterior e cria os atalhos `bbrainx` e `bbx`. Com `--apply`, grava as configs do projeto (Claude Code, Codex, VS Code, Kilo) com backup e recibo. Não pede senha nem muda configuração global de harness. Em seguida, `bbx ch` abre o [manual integrador](docs/INTEGRADOR.md) com o que falta, em um clique. O Codex roda comandos num sandbox que não grava fora do projeto: para instalar, use o Terminal ou o Claude Code.

| Precisa | Por quê | Como |
|---|---|---|
| macOS | O instalador é para macOS (Windows e Linux: ainda não homologados) | — |
| Node 22.20+ (recomendado 24) com SQLite/FTS5 | Banco e busca | `brew install node@24` ou nodejs.org |
| Git | Verificar e instalar o código | `xcode-select --install` |
| Internet | Baixar o kit e as dependências exatas do `package-lock.json` (`npm ci`) | — |
| Opcional: Claude Code e Codex logados | Recrutar agentes | `claude auth login`, `codex login` |
| Opcional: VS Code com `code` no PATH | Extensão BBrainX (`--vscode`) | Command Palette → Shell Command |

## Comece em três comandos

Requisitos: **Node 24 LTS e Git** (Node 22.20 ou mais novo também atende). O foco desta fase é o macOS (arm64). macOS e Linux continuam obrigatórios na CI. Windows é observação de backlog. Confira a revisão da PR e o [contrato de entrega](docs/BBRAINX_2_0.md); relatórios anteriores não certificam esta versão.

```sh
git clone https://github.com/oalexandrebelo/BBrainX.git && cd BBrainX
npm run setup
node bin/bbrainx.mjs up --root /caminho/do/seu/projeto
```

- `npm run setup` confere a máquina, instala exatamente o que está no lockfile (sem scripts de pós-instalação), roda os testes e compila o painel.
- `up` registra a pasta, indexa e mostra o próximo passo para cada harness. Rodar de novo só atualiza o que mudou.
- `node bin/bbrainx.mjs doctor` diz qual é o melhor cenário para esta máquina e o comando de cada passo. Ele só observa: não instala nada e não executa as ferramentas que encontra.

Para ligar ao seu harness:

```sh
node bin/bbrainx.mjs integrate --root /caminho/do/seu/projeto
node bin/bbrainx.mjs integrate --root /caminho/do/seu/projeto --apply
```

Sem `--apply`, `integrate` mostra destinos, hashes e pendências. Com `--apply`, registra a raiz, aplica a entrada MCP do projeto com backups privados e indexa os arquivos; preserva credenciais, provedores, trust e aprovações. Descobre Codex, Claude Code, VS Code, Kilo e Antigravity IDE por metadados locais, sem executar clientes. Codex/Claude/VS Code/Kilo têm configuração automática; Antigravity IDE exige etapa manual e não recebe cadastro global de todos os projetos. `--clients codex,claude,vscode,kilo` permite selecionar os destinos, inclusive preparar cliente ainda não instalado. Instalações antigas só podem ser migradas com `--adopt-existing` quando coincidem exatamente com o gerador anterior. Rollback: `node bin/bbrainx.mjs integrations rollback --id ID_DO_RECIBO`; uma edição posterior impede sobrescrita. [Contrato do instalador](docs/integrations/INSTALLER.md).

Para adicionar o AB-S00S como segundo servidor nas configurações de Claude Code, Codex e VS Code:

```sh
node bin/bbrainx.mjs integrate --root /caminho/do/seu/projeto --clients claude,codex,vscode --apply --ab-s00s on --ab-s00s-bin /caminho/AB-S00S/bin/ab-s00s.mjs
node bin/bbrainx.mjs integrate --root /caminho/do/seu/projeto --clients claude,codex,vscode --apply --ab-s00s off
node bin/bbrainx.mjs config --project meu-projeto --client openhands --ab-s00s on --ab-s00s-bin /caminho/AB-S00S/bin/ab-s00s.mjs
```

`on` inclui `ab-s00s` no mesmo recibo e backup de `bbrainx`; `off` remove somente a entrada gerenciada e funciona mesmo após desinstalar o AB-S00S. Sem `--ab-s00s`, a entrada existente é preservada. Sem `--ab-s00s-bin`, resolve `~/.local/bin/ab-s00s` por `realpath`. Nenhum desses comandos instala ou inicia o AB-S00S. OpenHands recebe JSON puro de `mcp_config`, com `transport: "stdio"`; mescle-o nas configurações do Agent Server. [Passos e limites](docs/QUICKSTART.md#ab-s00s-e-openhands-agent-canvas).

`config --project meu-projeto --client cursor` continua imprimindo fragmentos para integração manual (também aceita claude, codex, vscode e gemini). Configuração presente não prova conexão nativa. `npm start` executa `node bin/bbrainx.mjs serve`: serve o painel em **http://127.0.0.1:4317** (porta: `serve --port N`) e **não abre o navegador**. Precisa do build feito pelo `npm run setup`. No macOS, `Start-BBrainX.command` (dois cliques) roda `npm run setup` e `npm run demo`, serve o painel e abre o navegador.

O [plugin próprio BBrainX](extensions/vscode/README.md) oferece marca, árvore de pastas abertas e comandos Detectar/Conectar no VS Code e um VSIX para avaliação no Antigravity IDE. Use `node scripts/package-extension.mjs` (Python 3 apenas para empacotar), instale o VSIX pelo editor e configure o executável em settings de usuário. Pastas confiáveis geram heartbeats de metadados a cada 30 s; expiram em 90 s e não registram nem indexam projetos sozinhas. `node bin/bbrainx.mjs discover --root /caminho/do/projeto` distingue pastas abertas reportadas, projetos registrados e históricos com raiz validada; não captura qualquer sessão ativa de qualquer IDE.

```sh
node bin/bbrainx.mjs test --project meu-projeto --file test/auth.test.mjs --timeout 300000
node bin/bbrainx.mjs control --project meu-projeto
node bin/bbrainx.mjs import-context --project meu-projeto --harness claude --file /caminho/absoluto/sessao.jsonl
```

`test` executa arquivos concretos de `node:test` dentro da raiz registrada, com progresso e diagnóstico limitados; roda com permissões locais e não é sandbox. `import-context` exige escolha explícita de arquivo nativo de Claude, Codex ou Cursor e gera checkpoint `review_needed` com trechos não confiáveis; não concede acesso nem aprova memória. Fontes privadas ficam no estado local. Outros formatos históricos são recusados. Cursor sem cwd exige `--confirm-workspace /raiz/canonica`, continua marcado como não verificado pela fonte e recusa nomes ambíguos. [Passos e limites](docs/QUICKSTART.md#4-conectar-harnesses).

Se preferir que o próprio agente faça a ligação, cole na sessão dele o prompt de [docs/prompts/ACTIVATE.md](docs/prompts/ACTIVATE.md). Quem assume o projeto começa por [docs/HANDOFF.md](docs/HANDOFF.md).

## O que foi medido

| Medida | 0.3 | 0.4 | 1.5.0 | Como foi medido |
|---|---|---|---|---|
| Arquivo certo entre os 10 primeiros, pergunta em linguagem natural | 54 % | **84 %** | não repetido | 79 perguntas cegas, escritas por outro autor que não viu o buscador, sobre dois repositórios de terceiros |
| Arquivo certo em 1.º lugar, mesmas perguntas | 33 % | **46 %** | não repetido | Os intervalos de 95 % se cruzam (24–44 % e 35–57 %); na comparação caso a caso a posição melhorou em 40 e piorou em 7 |
| Definição de um identificador em 1.º lugar | 12 de 12 | 12 de 12 | 12 de 12 | Casos rotulados sobre este repositório (`test/fixtures/eval-self.cases`), usados como portão de regressão |
| Pacotes de produção no lockfile | 121 | **25** | 27 | 121 → 25: [docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md). 27: `package-lock.json` desta revisão (7 dependências diretas) |

Perguntas cegas: medidas na versão 0.4 da busca (revisão 4785d4d, 4 de outubro de 2026). Não foram repetidas na 1.5.0. Esses números medem a posição do arquivo esperado, não tarefa concluída nem economia de tokens faturada. O método, os intervalos e os comandos para repetir estão em [docs/EVALUATION.md](docs/EVALUATION.md).

### Custo em tokens da 1.5.0

| Medida | Antes | Depois |
|---|---|---|
| `context_search`, média por resposta, 36 consultas, orçamento padrão de 4.000 tokens | 17.397 | **3.517** (−79,8 %) |
| Arquivo esperado localizado | 31/36 | 31/36 |
| Arquivo esperado com corpo no resultado | 31/36 | 23/36 |
| `tools/list` no fio | 2.431 | 1.925 (−20,8 %) |
| Instruções + definições das ferramentas, por turno | 1.498 | 1.396 (−6,8 %) |
| `context_bootstrap`, 5 tarefas | 4.818 | 4.126 (−14,4 %) |

Piso de recuperação (`test/godmode.test.mjs`, 36 consultas deste repositório, um acerto por arquivo): arquivo certo entre os 10 primeiros em **0,889** (32/36); o teste exige 0,85.

Fonte: [docs/engineering/PERFORMANCE.md](docs/engineering/PERFORMANCE.md), base `5acad77`. Repetição na revisão 77e6ddd (1.5.0) com `node scripts/measure-search-tokens.mjs`: 17.778 → 3.666 (−79,4 %), localizado 31/36 → 31/36, com corpo 31/36 → 20/36. O valor muda com o corpus indexado. Tokens são `o200k_base` sobre o payload, não cobrança do provedor. A resposta leva o mesmo JSON em `content` e em `structuredContent`; essa duplicação não foi tratada (tarefa T1: 10.125 tokens no fio contra 4.978 do texto).

## Oito ferramentas, um escopo (onze com `--recruit`)

| MCP | Responsabilidade |
|---|---|
| `context_bootstrap` | Montar um pacote com orçamento de tokens, com caminho, linhas e hash de cada trecho. |
| `context_search` | Buscar no índice; a declaração de um nome vem antes dos usos e dos testes. Um acerto por arquivo e no máximo `budget` tokens (padrão 4000); o que não cabe volta como `caminho:linhas`. |
| `context_read` | Ler uma janela numerada de arquivo indexado, até 400 linhas e 64 KiB, verificando o hash. |
| `context_symbol` | Localizar declarações lexicais pelo nome exato, com arquivo, linha, tipo e hash. |
| `context_index` | Atualizar o índice da pasta registrada. |
| `session_checkpoint` | Salvar o estado da tarefa: o que foi feito, decisões, arquivos tocados, evidências. |
| `session_get` | Recuperar o checkpoint, em outro harness ou em outra sessão. |
| `memory_propose` | Propor um aprendizado. Só você aprova, pelo terminal. |

O servidor é próprio e fala as **duas eras do protocolo MCP** no mesmo processo: a revisão corrente (2026-07-28, sem handshake) e as anteriores (com `initialize`). O cliente oficial do protocolo conversa com ele nos testes. Isso valida o protocolo; **não é homologação de cada versão de cada IDE**.

O servidor só enxerga o projeto com que foi iniciado, não executa comandos e não aprova memória. Texto recuperado é evidência, nunca instrução.

## Alinhamento SDD por projeto

O BBrainX detecta Spec Kit e documentos SDD reconhecidos, dá uma nota versionada de **cobertura documental** por feature e aponta requisitos sem tarefas ou referências órfãs. Quando não há SDD, a ação explícita de alinhamento cria `SDD.md` como rascunho técnico com fontes; preserva qualquer estrutura existente ou parcial.

```sh
node bin/bbrainx.mjs sdd --project meu-projeto
node bin/bbrainx.mjs sdd --project meu-projeto --mode assess
node bin/bbrainx.mjs mcp --project meu-projeto --sdd
```

A aba **SDD** oferece avaliação e alinhamento no painel. O primeiro comando cria somente quando ausente; `assess` é leitura. MCP expõe `sdd_align` por opt-in. A nota não certifica semântica, implementação ou testes: [contrato e rubrica](docs/integrations/SDD.md).

## Perfil opcional: Laya

O [Laya](https://github.com/NandhaKishorM/laya) é um modelo local de decisão: escolhe entre opções, dá nota ou responde sim/não, sem gerar texto. O BBrainX o instala **só por comando seu**, num ambiente Python isolado, com os pesos conferidos por SHA-256:

```sh
node bin/bbrainx.mjs laya install     # cerca de 0,7 GB de ambiente e 0,68 GB de pesos
node bin/bbrainx.mjs laya ask --state "O login quebrou em produção." --file perguntas.json
node bin/bbrainx.mjs laya remove
```

O perfil também oferece decisões locais no painel (`serve --laya`), no CLI (`laya decide --project ...`) e no MCP (`mcp --project ... --laya`, ferramenta `decision_evaluate`). Inclui cache exato por projeto/processo, cancelamento, limites de recursos e abstenção quando texto, pergunta ou opções são truncados. A confiança retornada não é calibrada. [Ativação, contrato e evidência](docs/integrations/LAYA.md).

Rede: o código só liga as flags de modo offline das bibliotecas no processo do modelo (`HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`, `HF_HUB_DISABLE_TELEMETRY=1`; `src/worker-env.mjs` e `profiles/laya/worker.py`). **Não há bloqueio de rede no nível do sistema operacional.** O ambiente do processo não herda chaves de API, `PYTHONPATH` nem `NODE_OPTIONS`. A instalação baixa dependências e pesos.

Medido em Apple M5 Pro, 24 GB, GPU (MPS), em 4 de outubro de 2026: carga em 4 a 18 s, cerca de 8 ms por decisão curta, pico de 1,8 GB de RAM ([docs/OPTIONAL_PROFILES.md](docs/OPTIONAL_PROFILES.md)). Os ensaios históricos de busca e relevância de memória não demonstraram benefício sobre a baseline lexical: sem ajuste fino, o primeiro lugar caiu de 42 % para 6 % ao reordenar ([docs/EVALUATION.md](docs/EVALUATION.md)). O modelo **não altera o pacote de contexto**. A integração comprova execução local e o ambiente sem chaves; não comprova superioridade sobre JEV, economia de API ou qualidade universal.

## Mapa do estudo

Trinta e sete ferramentas foram estudadas. Cada uma está numa de cinco situações: **núcleo**, **perfil ativável**, **só técnica**, **referência** ou **fora**, com o porquê, a evidência e o que mudaria o veredito. O mapa é interativo no painel (aba **Mapa do estudo**) e está por extenso em [docs/STUDY_MAP.md](docs/STUDY_MAP.md).

![Mapa do estudo](public/demo/bbrainx-study-map-desktop.png)

## Decisões que evitam desperdício

**Lexical antes de generativo.** O índice é o FTS5 do SQLite; não há LLM na indexação. A busca roda em dois estágios: termos exatos, depois radicais e um glossário de programação português → inglês. **Contexto é seleção, não despejo.** Cada trecho tem hash e localização; arquivo alterado é relido antes de ser servido; restrição obrigatória não é cortada para caber. **Memória não é verdade automática.** O agente propõe, você aprova. **Continuidade não é transcrição infinita.** O checkpoint carrega o que foi feito, o que falta e qual revisão sustenta o estado.

`payloadTokens` usa **o200k_base** só sobre o pacote. Tokens totais do cliente, tokenizador de outro modelo, cache do provedor e economia financeira não são inferidos: aparecem como desconhecidos, não como zero.

## Qualidade e limites

```sh
npm test            # domínio, protocolo com processos reais, perfis, mapa do estudo
npm run build
npm run test:e2e    # painel no navegador
```

Na 2.0.1: bundle MCPB para hosts como o Chat On Steroids (`npm run package:mcpb`; configuração por `BBRAINX_PROJECT`/`BBRAINX_HOME`/`BBRAINX_RECRUIT`) e `config --client cos`. Na 2.0.0: 758/758 testes no Node 24.21.0 (macOS arm64, Mac mini M4) e Playwright 24/24, 6/6 e 4/4; recrutamento exercitado com as duas CLIs reais ([docs/RECRUIT.md](docs/RECRUIT.md)). Na 1.5.0: 735/735 testes no Node 24.21.0 e no Node 22.22.2 (macOS arm64); Playwright 24/24 (painel), 6/6 (uso) e 3/3 (controle); controles negativos do MCP 7/7 detectados (`node scripts/mcp-negative.mjs`). O workflow de CI (`.github/workflows/verify.yml`) define macOS, Linux e Windows, mas **a 1.5.0 não tem relatório de CI publicado**: o de `docs/validation/ci-report.json` é da revisão 912aa25. Os controles negativos injetam defeitos em checkout isolado e exigem que sejam detectados. Isso não implica cobertura por mutação de todos os testes. Próximos passos: [docs/HOMOLOGACAO_2026-10-10.md](docs/HOMOLOGACAO_2026-10-10.md#oportunidades).

O que não existe: observador contínuo de arquivos, análise semântica por servidor de linguagem, sincronização entre máquinas, criptografia própria, autenticação multiusuário, captura de tela e execução de shell. O prazo de uma chamada não interrompe trabalho síncrono, como a indexação. Não use o banco ativo em iCloud ou em disco de rede. Revogar uma memória impede o uso futuro, mas não apaga cópias históricas nem backups. Veja o [modelo de segurança](docs/SECURITY_MODEL.md).

## Marca

A marca oficial é o **monograma BBX** com o wordmark do topo desta página: ícone do painel, do handshake MCP (Claude Code, Codex, VS Code) e da extensão VS Code. Paleta, superfícies e como regenerar estão em [docs/BRAND.md](docs/BRAND.md).

<p align="center"><img src="public/brand/icon.svg" width="96" alt="Ícone BBrainX: monograma BBX verde-menta sobre fundo grafite"/></p>

## Comunidade

Projeto de Alexandre Belo (**AB**), desenvolvido com assistência de IA e revisão orientada a evidências. Não implica endosso de OpenAI, Anthropic, Google ou dos projetos estudados. Queremos contribuições reproduzíveis: [CONTRIBUTING.md](CONTRIBUTING.md).

Para assumir a próxima contribuição, comece pelo [contexto de engenharia](docs/engineering/CONTINUITY.md), execute `npm run project:status` e escolha um item da [fila com critérios de aceite](docs/engineering/ROADMAP.md). O [livro de experimentos](docs/engineering/PERFORMANCE.md) distingue ganhos medidos, custos e tentativas descartadas.

O código original do BBrainX é MIT. O motor de capacidades AB-BBX é próprio. As atribuições históricas e os avisos completos estão em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). O perfil Laya e o Remotion mantêm seus próprios termos e não fazem parte do núcleo. Nomes, marcas, bibliotecas e referências mantêm seus direitos.

<!-- verified-preview -->
## Interface

![Arquitetura interativa BBrainX](public/demo/bbrainx-architecture-desktop.png)

[Último relatório de CI publicado (912aa25)](docs/validation/ci-report.json) · [Vídeo explicativo](public/demo/bbrainx-intro.mp4)

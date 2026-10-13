# Recrutar agentes (BYO) — BBrainX 2.1

Revisão: 13/10/2026. Código: `src/recruit.mjs`; capacidades `agents.recruit`, `agents.status`, `agents.dismiss` em `src/engine.mjs`; CLI `bbrainx recruit`; testes em `test/recruit.test.mjs`.

## O que é

Dentro de uma sessão ligada ao BBrainX, o usuário diz ao seu harness:

> recrute 1 codex astra 6 high e 2 opus 5.5 xhigh para corrigir a validação de sessão

O harness chama `agents_recruit` com essa frase em `spec` e o trabalho em `task`. O BBrainX lança, nesta máquina, as CLIs que o usuário **já tem instaladas e logadas** (Claude Code e Codex), uma por recruta, cada uma em **worktree, branch e lane próprios**. É o modelo *bring your own agent* do Orca: nenhuma assinatura nova, nenhuma chave de API, nenhum token lido ou copiado. O login pertence à CLI; o BBrainX só a executa. Isso funciona nos dois sentidos: Claude pode recrutar Codex, e Codex pode recrutar Claude. O harness principal precisa chamar `agents_status` até a conclusão e trazer o resultado ao chat; o recruta não publica sozinho uma mensagem na conversa principal. Veja as [opções de conexão e contas](integrations/HARNESS_CONNECTIONS.md).

| Pedido | Harness | Comando real (sem shell) |
|---|---|---|
| `codex astra 6 high` | Codex | `codex exec --skip-git-repo-check -C <worktree> --sandbox workspace-write -m gpt-6-astra -c model_reasoning_effort="high" -c mcp_servers.bbrainx.… --json -o <último.md> "<prompt>"` |
| `opus 5.5 xhigh` | Claude Code | `claude -p "<prompt>" --model claude-opus-5-5 --effort xhigh --output-format json --permission-mode acceptEdits --settings '{"availableModels":["claude-opus-5-5"]}' --name bbx-<id> --mcp-config '{…lane…}' --allowedTools …` |

Aliases aceitos: `fable`, `opus`, `sonnet`, `haiku` (com ou sem versão, por exemplo `opus 5.5` → `claude-opus-5-5`); `astra`, `sol`, `luna`, `terra` com versão (`astra 6` → `gpt-6-astra`), `gpt-5.5`; ids completos passam se forem seguros (`^[a-z][a-z0-9.-]{1,63}$`). Esforços: Claude `low|medium|high|xhigh|max`; Codex `minimal|low|medium|high|xhigh|max|ultra`. IDs Claude sem versão menor são preservados: `claude-opus-5` continua `claude-opus-5`, sem inventar `-0`. Use `luna 6`, não apenas `luna`, para selecionar `gpt-6-luna`. O conjunto de esforços aceito pelo parser não garante que cada modelo aceite todos eles. Um ID ou esforço indisponível para a conta é recusado pela própria CLI e aparece como `failed` com o log.

## Como ligar

`integrate --apply` inclui recrutamento por padrão e grava `--recruit` nos argumentos do servidor MCP (`.mcp.json`, `.codex/config.toml`, `.vscode/mcp.json`); `--no-recruit` omite. Sem o flag, o catálogo continua com seis ferramentas e qualquer pedido de recrutamento não tem ferramenta para chamar: a concessão vem do host (a configuração que o humano gravou), nunca de argumento de ferramenta nem de texto recuperado. O servidor de cada recruta é iniciado **sem** `--recruit`: não há recrutamento recursivo. Nos geradores `config`, o recrutamento exige `--recruit` explícito. `config --client claude-desktop --project ID --recruit` imprime o bloco para o chat normal do Claude desktop; não escreve no arquivo global.

```sh
bbrainx recruit doctor                                   # CLIs encontradas, versão, login, limites de uso do Codex
bbrainx recruit start --project ID --spec "1 codex astra 6 high e 2 opus 5.5 xhigh" --task "…" [--mode review] [--base ref] [--minutes 60]
bbrainx recruit start … --apply                          # sem --apply só mostra o plano
bbrainx recruit status --project ID [--id R] [--log]
bbrainx recruit dismiss --project ID --id R [--stop] [--delete-branch]
```

## O que acontece em cada recruta

1. `planRecruits` valida tudo antes de qualquer efeito: spec, tarefa (≤ 8.000 caracteres), modo, base (`HEAD` por padrão, resolvida a commit), capacidade (≤ 6 por chamada, ≤ 4 por entrada, ≤ 8 ativos por projeto), CLIs instaladas e logadas.
2. `git worktree add --no-track -b bbx/<id> <raiz>.bbx/<id> <commit>` ao lado do repositório (nunca dentro dele: lanes recusam sobreposição). O checkout principal não é tocado.
3. A worktree é registrada como lane `<id>` (capacidade 8 para recrutas). O supervisor indexa a lane antes de abrir a CLI.
4. Um supervisor desacoplado (`bbrainx recruit run`) lança a CLI com o ambiente do usuário menos as variáveis de sessão aninhada (`CLAUDECODE`, `CLAUDE_CODE_*`, `CODEX_SANDBOX*`), grava stdout/stderr em `control-v1/<projeto>/recruits/<id>.log`, bate o coração a cada 15 s e aplica o prazo (`--minutes`, 5 a 240, padrão 60).
5. O prompt diz ao recruta onde trabalhar, que o servidor `bbrainx` serve a lane dele (`context_bootstrap`, `context_search`, `session_checkpoint` com `task = <id>`), e, no modo `implement`, que rode a verificação do projeto e faça commit na branch. No modo `review` a CLI usa as políticas de revisão do harness (`--permission-mode plan` / `--sandbox read-only`) e não há commit. O Claude recebe também `--settings` com `availableModels` limitado ao modelo solicitado; na configuração validada, isso evita que o modo plan substitua Haiku por Sonnet. A restrição pertence apenas ao processo, sem editar settings globais ou reduzir permissões. Políticas gerenciadas e combinações de settings do próprio harness continuam aplicáveis.
6. Ao fechar, o supervisor interpreta a saída (Claude: JSON final com `session_id`, `total_cost_usd`, `usage`; Codex: JSONL com `thread.started`, `agent_message`, `turn.completed.usage`), faz o commit do que a CLI deixou sem commitar (`bbx recruit <id>: <título>`; o Codex em `workspace-write` não consegue criar `index.lock`), conta os commits à frente da base e grava o registro final.

Registro (`control-v1/<projeto>/recruits/<id>.json`, ≤ 64 KiB): sem prompt (só o digest; o texto fica em `<id>.task.md` com modo 0600 até a baixa) e sem saída integral (o resumo final é limitado a 4.000 caracteres). O painel (`control --project ID` e a aba Painel) lista os recrutas com estado, commits, custo e tokens.

Estados: `starting` → `running` → `completed` | `failed` (saída ≠ 0, erro declarado pela CLI ou prazo) | `stopped` (baixa com `stop`) → `dismissed`. `unknown` = sem batimento há mais de 90 s (supervisor morreu, máquina dormiu): leia o log. A baixa remove a worktree e fecha a lane; a branch fica, salvo `deleteBranch`. Só um supervisor com batimento recente recebe `SIGTERM`; PID antigo nunca é sinalizado.

## Contas e limites de uso

`recruit doctor` mostra, por CLI, binário, versão e login (`claude auth status`, `codex login status`). Para Codex, consulta as janelas de limite via `codex app-server` JSON-RPC (`account/rateLimits/read`: percentual usado, janela, reset, plano, créditos). Nada abre `auth.json`, `.credentials.json` ou o Keychain: quem usa o login é o binário da CLI.

A descoberta automática testa `--version` e pula candidatos quebrados no PATH antes de procurar instalações conhecidas de Claude/Codex e extensões do VS Code/Insiders. Diretórios de versões são ordenados numericamente. Um binário antigo funcional no PATH ainda tem prioridade; para escolher outro, use `BBRAINX_CLAUDE` ou `BBRAINX_CODEX` com o caminho absoluto. Um override inválido gera erro, sem trocar silenciosamente de executável. `integrate` e `config` incluem esses overrides explícitos no ambiente MCP somente quando o recrutamento está habilitado; não gravam credenciais.

Outra conta já configurada: passe `account: "/pasta/absoluta"` no recrutamento ou `--account /pasta/absoluta` na CLI. A pasta deve existir e ser o `CLAUDE_CONFIG_DIR` ou `CODEX_HOME` da conta pretendida. Para contas em pastas distintas, faça chamadas separadas por harness. Criar ou trocar login continua sendo uma operação da própria CLI, externa ao BBrainX. Limites de uso do Claude Code não são consultados por token ou statusline; o BBrainX não lê credenciais nem altera `~/.claude/settings.json`.

## Evidência que motivou a 2.1 — MacBook, 13/10/2026

Em uma instalação 2.0 com as correções locais, um cliente SDK MCP exercitou as configurações dos dois harnesses em repositório descartável, usando os logins nativos existentes:

| Direção | Pedido | Resultado observado |
|---|---|---|
| Claude → Codex | `gpt-6-luna`, `high`, revisão | `completed`, exit 0, resposta `OK`; a CLI recebeu esse ID, sem metadado adicional do modelo nos eventos finais |
| Codex → Claude, após correção | `claude-haiku-5-5`, `low`, revisão | `completed`, exit 0, `OK`; `modelUsage` confirmou somente Haiku 5.5, um turno, US$ 0,00539718 informado pela CLI |

A primeira tentativa Claude também respondeu `OK`, mas `modelUsage` revelou Sonnet 5.5 em vez de Haiku; ela demonstra o defeito, não fidelidade de modelo. O controle corretivo acima usou a restrição por processo. Os recrutas terminaram sem arquivos alterados ou commits e suas worktrees/branches descartáveis foram removidas.

O catálogo consultado nas CLIs continha 7 IDs base Codex e 12 Anthropic; os 19 IDs passaram pelo normalizador sem alteração indevida. Isso não significa inferência executada com todos os modelos, nem disponibilidade permanente em toda conta. Naquela instalação corrigida, 760 testes e o build passaram. Esses resultados históricos não substituem os testes da revisão 2.1 entregue; consulte [RELEASE_NOTES.md](RELEASE_NOTES.md). A prova bidirecional usou SDK MCP, não pedidos originados por um modelo na interface gráfica.

## Histórico 2.0 — medido em 13/10/2026 (Mac mini M4, macOS 26.6, Claude Code 2.1.286, Codex 0.162)

Este registro anterior mantém os nomes de modelo solicitados; não atesta o modelo efetivo de cada execução.

Tarefa real: "crie hello.txt com a palavra pong e faça commit", 1 `claude haiku low` + 1 `codex astra 6 low`, repositório de teste.

| Recruta | Resultado | Commits | Custo / tokens | Chamadas ao BBrainX da lane |
|---|---|---|---|---|
| Claude haiku | `completed`, commitou sozinho ("add hello") | 1 | US$ 0,032 · 3 turnos | 0 (conectou, não precisou) |
| Codex gpt-6-astra | `completed`; sandbox negou `index.lock`, supervisor commitou | 1 | 137.177 entrada (117.760 em cache) · 653 saída | 4: `context_bootstrap`, `context_search`, `session_checkpoint`, `session_get` |

Checkout principal: `git status` limpo. Suíte: `test/recruit.test.mjs` com executáveis reais que imitam as duas CLIs (fluxo completo, falha, revisão, interrupção, doctor, CLI).

## O que não faz

- Não faz merge, push, rebase nem apaga branches. Revisar e integrar o trabalho do recruta é do humano.
- Não é sandbox de SO: `acceptEdits` e `workspace-write` são as políticas das próprias CLIs; a allowlist de `Bash` do Claude cobre git, testes e scripts do projeto (`tools` acrescenta padrões).
- Não acompanha a sessão em tempo real: o estado vem do batimento e do log; `claude --resume <sessionId>` e `codex resume <threadId>` reabrem a conversa na CLI.
- Não instala serviço: um recruta sobrevive ao fechamento do servidor MCP (o supervisor é desacoplado), mas não a um reboot (`unknown`).

## Oportunidades

| Oportunidade | Critério |
|---|---|
| Painel de contas (vários `CLAUDE_CONFIG_DIR`/`CODEX_HOME` registrados, uso por conta) | Sem copiar credenciais; login sempre pela CLI; uso só pelo que a CLI expõe |
| Limites do Claude Code por *statusline* opt-in | Só com consentimento explícito gravado pelo humano em `settings.json` |
| Acompanhamento ao vivo (`--output-format stream-json`, `codex app-server` `turn/*`) | Custo de parsing medido; registro continua sem prompt nem corpo |
| Fila: iniciar além de 8 ativos quando um termina | Sem lease global novo; respeitar capacidade de lanes |

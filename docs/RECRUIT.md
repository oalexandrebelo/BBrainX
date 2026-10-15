# Recrutar agentes (BYO) — BBrainX 2.0

Revisão: 13/10/2026. Código: `src/recruit.mjs`; capacidades `agents.recruit`, `agents.status`, `agents.dismiss` em `src/engine.mjs`; CLI `bbrainx recruit`; testes em `test/recruit.test.mjs`.

## O que é

Dentro de uma sessão ligada ao BBrainX, o usuário diz ao seu harness:

> recrute 1 codex astra 6 high e 2 opus 5.5 xhigh para corrigir a validação de sessão

O harness chama `agents_recruit` com essa frase em `spec` e o trabalho em `task`. O BBrainX lança, nesta máquina, as CLIs que o usuário **já tem instaladas e logadas** (Claude Code e Codex), uma por recruta, cada uma em **worktree, branch e lane próprios**. É o modelo *bring your own agent* do Orca: nenhuma assinatura nova, nenhuma chave de API, nenhum token lido ou copiado. O login pertence à CLI; o BBrainX só a executa.

| Pedido | Harness | Comando real (sem shell) |
|---|---|---|
| `codex astra 6 high` | Codex | `codex exec --skip-git-repo-check -C <worktree> --sandbox workspace-write -m gpt-6-astra -c model_reasoning_effort="high" -c mcp_servers.bbrainx.… --json -o <último.md> "<prompt>"` |
| `opus 5.5 xhigh` | Claude Code | `claude -p "<prompt>" --model claude-opus-5-5 --effort xhigh --output-format json --permission-mode acceptEdits --name bbx-<id> --mcp-config '{…lane…}' --allowedTools …` |

Aliases aceitos: `fable`, `opus`, `sonnet`, `haiku` (com ou sem versão, por exemplo `opus 5.5` → `claude-opus-5-5`); `astra`, `sol`, `luna`, `terra` com versão (`astra 6` → `gpt-6-astra`), `gpt-5.5`; ids completos passam se forem seguros (`^[a-z][a-z0-9.-]{1,63}$`). Esforços: Claude `low|medium|high|xhigh|max`; Codex `minimal|low|medium|high|xhigh|max|ultra`. Um id desconhecido para a conta é recusado pela própria CLI e aparece como `failed` com o log.

## Como ligar

Em hosts que não passam argumentos (bundle MCPB no Chat On Steroids ou no Claude Desktop), o ambiente faz o mesmo papel: `BBRAINX_PROJECT`, `BBRAINX_HOME` e `BBRAINX_RECRUIT=true` (`npm run package:mcpb` gera o bundle; `config --client cos` imprime a forma por executável).

`integrate --apply` grava `--recruit` nos argumentos do servidor MCP (`.mcp.json`, `.codex/config.toml`, `.vscode/mcp.json`); `--no-recruit` omite. Sem o flag, o catálogo continua com seis ferramentas e qualquer pedido de recrutamento não tem ferramenta para chamar: a concessão vem do host (a configuração que o humano gravou), nunca de argumento de ferramenta nem de texto recuperado. O servidor de cada recruta é iniciado **sem** `--recruit`: não há recrutamento recursivo.

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
5. O prompt diz ao recruta onde trabalhar, que o servidor `bbrainx` serve a lane dele (`context_bootstrap`, `context_search`, `session_checkpoint` com `task = <id>`), e, no modo `implement`, que rode a verificação do projeto e faça commit na branch. No modo `review` a CLI roda só leitura (`--permission-mode plan` / `--sandbox read-only`) e não há commit.
6. Ao fechar, o supervisor interpreta a saída (Claude: JSON final com `session_id`, `total_cost_usd`, `usage`; Codex: JSONL com `thread.started`, `agent_message`, `turn.completed.usage`), faz o commit do que a CLI deixou sem commitar (`bbx recruit <id>: <título>`; o Codex em `workspace-write` não consegue criar `index.lock`), conta os commits à frente da base e grava o registro final.

Registro (`control-v1/<projeto>/recruits/<id>.json`, ≤ 64 KiB): sem prompt (só o digest; o texto fica em `<id>.task.md` com modo 0600 até a baixa) e sem saída integral (o resumo final é limitado a 4.000 caracteres). O painel (`control --project ID` e a aba Painel) lista os recrutas com estado, commits, custo e tokens.

Estados: `starting` → `running` → `completed` | `failed` (saída ≠ 0, erro declarado pela CLI ou prazo) | `stopped` (baixa com `stop`) → `dismissed`. `unknown` = sem batimento há mais de 90 s (supervisor morreu, máquina dormiu): leia o log. A baixa remove a worktree e fecha a lane; a branch fica, salvo `deleteBranch`. Só um supervisor com batimento recente recebe `SIGTERM`; PID antigo nunca é sinalizado.

## Contas e limites de uso

`recruit doctor` mostra, por CLI: binário (PATH, depois instalações conhecidas: `~/.local/bin/claude`, `ChatGPT.app`, `Codex.app`, extensão do VS Code; override por `BBRAINX_CLAUDE`/`BBRAINX_CODEX`), versão, login (`claude auth status`, `codex login status`) e, para o Codex, as janelas de limite via `codex app-server` JSON-RPC (`account/rateLimits/read`: percentual usado, janela, reset, plano, créditos). Nada abre `auth.json`, `.credentials.json` ou o Keychain: quem lê o login é o binário da CLI.

Outra conta: faça login com a CLI numa pasta separada (`CLAUDE_CONFIG_DIR=/pasta claude auth login`; `CODEX_HOME=/pasta codex login`) e passe `account: "/pasta"` no recrutamento ou `--account` na CLI. Limites de uso do Claude Code não têm comando de CLI; o Orca os obtém pelo endpoint OAuth com o token do usuário ou por um script de *statusline*. O BBrainX não faz nem um nem outro: isso exigiria ler o token ou alterar `~/.claude/settings.json`, e as duas coisas ficam fora do contrato.

## Medido em 13/10/2026 (Mac mini M4, macOS 26.6, Claude Code 2.1.286, Codex 0.162)

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

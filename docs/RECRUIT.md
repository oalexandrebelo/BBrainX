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

`integrate --apply` grava `--recruit` nos argumentos do servidor MCP (`.mcp.json`, `.codex/config.toml`, `.vscode/mcp.json`); `--no-recruit` omite esse argumento e persiste `BBRAINX_RECRUIT=false` no ambiente da entrada. Em `mcp`, `--no-recruit` prevalece sobre `BBRAINX_RECRUIT=true` e sobre `--recruit`, independentemente da ordem. Com recrutamento habilitado, o catálogo tem onze ferramentas. Desabilitado, são oito (incluindo `context_read` e `context_symbol`): a concessão vem do host (a configuração que o humano gravou), nunca de argumento de ferramenta nem de texto recuperado. O servidor de cada recruta é iniciado **sem** `--recruit`: não há recrutamento recursivo.

```sh
bbrainx recruit doctor                                   # CLIs encontradas, versão, login, limites de uso do Codex
bbrainx recruit start --project ID --spec "1 codex astra 6 high e 2 opus 5.5 xhigh" --task "…" [--mode review] [--base ref] [--minutes 60]
bbrainx recruit start … --apply                          # sem --apply só mostra o plano
bbrainx recruit status --project ID [--id R] [--log]
bbrainx recruit dismiss --project ID --id R [--stop] [--delete-branch]
```

`--ab-s00s on|off` em `integrate` controla um segundo servidor nas três configurações acima, usando o mesmo recibo/backup/rollback. Não concede recrutamento ao AB-S00S nem altera o modo dos recrutas. `config --client openhands` gera somente o fragmento do Agent Server, com AB-S00S opcional. [Como configurar](QUICKSTART.md#ab-s00s-e-openhands-agent-canvas).

As capacidades ACI também estão disponíveis na lane do recruta: leitura numerada de até 400 linhas e busca de declarações, ambas restritas ao índice da worktree e com hash verificado. O agente continua iniciando por `context_bootstrap`, buscando com `context_search` e salvando o checkpoint ao terminar.

## O que acontece em cada recruta

1. `planRecruits` valida tudo antes de qualquer efeito: spec, tarefa (≤ 8.000 caracteres), modo, base (`HEAD` por padrão, resolvida a commit), capacidade (≤ 10 por chamada, ≤ 10 por entrada, ≤ 12 ativos por projeto), CLIs instaladas e logadas.
2. O registro `<id>.json` é criado com exclusividade antes de tudo (reserva do ID). Depois, `git worktree add --no-track -b bbx/<id> <raiz>.bbx/<id> <commit>` ao lado do repositório (nunca dentro dele: lanes recusam sobreposição). Ramo ou pasta de mesmo nome que já existam não são deste início: o ID é trocado e nada existente é removido. O checkout principal não é tocado.
3. A worktree é registrada como lane `<id>` (capacidade 12 para recrutas). O supervisor indexa a lane antes de abrir a CLI.
4. Um supervisor desacoplado (`bbrainx recruit run`) publica a própria identidade (PID e início pelo `ps`) antes de indexar, lança a CLI num grupo de processos próprio e grava stdout/stderr em `control-v1/<projeto>/recruits/<id>.log` (credenciais redigidas, teto de 32 MiB em disco). Bate o coração a cada 15 s e aplica o prazo (`--minutes`, 5 a 240, padrão 60). Prazo, parada e fim da CLI encerram o grupo inteiro: um servidor de teste deixado para trás não segura o recruta.
   Ambiente da CLI: o do usuário, menos os marcadores da sessão que chamou (`CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_MESSAGING_*`, `CODEX_SANDBOX*`…), carregadores (`NODE_OPTIONS`, `DYLD_*`, `LD_*`) e entradas relativas do `PATH`. Ajustes do usuário como `CLAUDE_CODE_USE_BEDROCK` ou `CLAUDE_CODE_MAX_TURNS` ficam. O servidor `bbrainx` do recruta recebe `BBRAINX_RECRUIT=false`.
   O git do lado do host (worktree, status, commit automático) roda sem hooks, sem `core.fsmonitor` e com os filtros `clean`/`smudge`/`process` neutralizados: nenhum comando configurado no repositório executa fora do sandbox da CLI. Consequência: arquivos LFS chegam à worktree do recruta como ponteiros.
5. O prompt diz ao recruta onde trabalhar, que o servidor `bbrainx` serve a lane dele (`context_bootstrap`, `context_search`, `session_checkpoint` com `task = <id>`), e, no modo `implement`, que rode a verificação do projeto e faça commit na branch. No modo `review` a CLI roda só leitura (`--permission-mode plan` / `--sandbox read-only`) e não há commit.
6. Ao fechar, o supervisor interpreta a saída (Claude: JSON final com `session_id`, `total_cost_usd`, `usage`; Codex: JSONL com `thread.started`, `agent_message`, `turn.completed.usage`), faz o commit do que a CLI deixou sem commitar (`bbx recruit <id>: <título>`; o Codex em `workspace-write` não consegue criar `index.lock`), conta os commits à frente da base e grava o registro final.

Registro (`control-v1/<projeto>/recruits/<id>.json`, ≤ 64 KiB): sem prompt (só o digest; o texto fica em `<id>.task.md` com modo 0600 até a baixa) e sem saída integral (o resumo final é limitado a 4.000 caracteres). O painel (`control --project ID` e a aba Painel) lista os recrutas com estado, commits, custo e tokens.

No MCP, `agents_status` limita a resposta inteira a 512 KiB UTF-8, incluindo JSON-RPC, metadados e as duas representações do resultado. Quando os relatórios não cabem, `truncated:true` e `omittedAgentIds` identificam os removidos; consulte-os com `ids:[ID]`. Os relatórios retornados ficam integrais; `count` e `active` descrevem os itens retornados. Esse teto é do MCP, sem alterar a saída da CLI `recruit status`.

**Repetir sem lançar em dobro (2.4.0).** `idempotencyKey` (`agents_recruit`) ou `--key` (`recruit start`), com até 128 letras, dígitos e `. _ : -`, reserva um lote em `control-v1/<projeto>/recruit-batches/` sob a mesma trava dos registros, antes de qualquer worktree. Cada recruta guarda o lote em `batch`.

| Repetição com a mesma chave | Resultado |
|---|---|
| Lote fechado | A resposta original, com `replayed:true` e `complete:true`. Nada é lançado |
| Lote ainda lançando, ou interrompido depois do primeiro recruta | Só os recrutas que já existem, com `complete:false`. Nada é lançado |
| Dono da reserva morto antes de lançar qualquer recruta | A reserva é retomada e o lote é lançado uma vez |
| Início que não lançou ninguém | A reserva é apagada, e a mesma chave pode tentar de novo |
| Mesma chave, outro pedido (tarefa, membros, modo, base, prazo, rede…) | `RECRUIT_IDEMPOTENCY_CONFLICT` |

Lotes fechados vencem em 7 dias (no máximo 256 por projeto). Sem chave, o comportamento é o de antes.

Estados: `starting` → `running` → `completed` | `failed` (saída ≠ 0, erro declarado pela CLI, prazo ou falha do spawn: `SPAWN_FAILED`) | `stopped` (baixa com `stop`) → `dismissed`. `unknown` = sem batimento há mais de 90 s (supervisor morreu, máquina dormiu): leia o log. O estado final é gravado uma vez, depois de devolver a faixa; um registro `dismissed` nunca é reescrito.

Baixa (`recruit dismiss`, `agents_dismiss`):

- Processos do recruta (supervisor e grupo da CLI) são verificados por identidade, não só por PID: um PID reaproveitado por outro programa conta como morto e nunca recebe sinal. Zumbi conta como encerrado.
- Algum processo vivo: sem `stop`, recusa (`RECRUIT_STILL_RUNNING`), mesmo com o batimento vencido. Com `stop`, pede o fim ao supervisor (ou ao grupo da CLI, se o supervisor já morreu) e só segue com a saída confirmada; senão `RECRUIT_STOP_UNCONFIRMED` e nada é removido. Processo vivo que não dá para identificar (sem `ps`): `RECRUIT_LIVENESS_UNVERIFIED`.
- A faixa fecha antes de qualquer remoção: um bloqueio (serviço observado na faixa) recusa a baixa com a worktree intacta.
- Trabalho não commitado vira um commit no ramo (`uncommitted work kept at dismissal`), salvo com `deleteBranch`. A worktree sai; o ramo fica, salvo `deleteBranch`.

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

## Rede para recrutas do Codex (2.0.2)

O sandbox `workspace-write` do Codex recusa rede: `listen` em 127.0.0.1 falha com `EPERM` e downloads (`npx`, `git fetch`) não saem. Testes que sobem servidor local falham dentro do recruta. `--network` (CLI) ou `network: true` (`agents_recruit`) liga `sandbox_workspace_write.network_access` só para aquele recruta de implementação; revisão continua só leitura e sem rede. Medido em 16/10/2026 com `codex sandbox`: sem a opção, `LISTEN_FAIL EPERM`; com ela, `LISTEN_OK`. Commit continua com o supervisor (o `index.lock` da worktree fica fora da pasta gravável) e o Electron continua proibido no sandbox (aborta e abre diálogos de crash na tela).

## Faixas: vida e capacidade (2.1.1)

Cada recruta tem uma faixa (lane) para o seu servidor MCP. O supervisor a fecha assim que a CLI termina; o worktree e o ramo continuam até `recruit dismiss`. A capacidade é por projeto (`BBRAINX_LANE_CAPACITY`, padrão 12, de 1 a 32), com teto de 64 faixas ativas na máquina. `bbrainx recruit gc --project ID` (ou `--all`) percorre as faixas ativas de recrutas e fecha as que nenhum processo vivo usa: concluídos de versões antigas, quedas, reboot, criação interrompida e faixa de recruta sem registro. Supervisor e CLI são conferidos por identidade; vivo ou não verificável fica. Erros de fechamento voltam em `errors`. O recrutamento roda essa coleta no próprio projeto antes de pedir vaga.

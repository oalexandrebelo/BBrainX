# Homologação 2026-10-10 — versão de uso (0.5.0-rc1) e backlog

Escopo de uso: **Claude Code, Codex e VS Code** (Antigravity IDE usa o mesmo motor MCP do VS Code; conexão manual).
Esta versão é para uso diário do dono no Mac mini e no MacBook Pro. **Não é lançamento público**: publicação, divulgação e
aval final (revisão independente) continuam pendentes. `productionApproved:false`.

## O que esta versão é

Linha unificada: candidato endurecido c874a226 (State03A admissão entre processos, State03B fluxo MCP limitado, F01–F03
SQLite) + linha control-plane f48cdcc (PRs #15–#17: `integrate`, painel por projeto, SDD, Laya local, extensão VS Code),
que é a release instalada até então. Mesma schema de dados nos dois sentidos: atualizar e voltar não exige migração.

Mudanças desta homologação, além do merge:
- Ícone oficial: favicon do painel; ícone MCP em PNG (VS Code/Antigravity descartam SVG); extensão VS Code 0.1.2.
- Configs emitidas com caminho estável do Node (`/opt/homebrew/opt/node@24/...`) e entrada `app/current` (não quebram no
  `brew upgrade`); `BBRAINX_HOME` em iCloud/Dropbox/CloudStorage/rede é recusado (`STATE_HOME_SYNCED`); scripts chamados
  por symlink funcionam; Codex, Gemini e Antigravity com entrada por projeto (`bbrainx-<projeto>`), sem sobrescrita.
- ID MCP duplicado em voo é fatal para a conexão (semântica 03B; a resposta com o mesmo ID corrompia a correlação).
- Piso Node 22.20 (recomendado Node 24 LTS).

## Evidência (Mac mini M4, 16 GiB, macOS 26.6.2, Node 24.21.0/SQLite 3.53.4)

| Verificação | Resultado |
|---|---|
| Suíte completa | 678/678 no Node 24.21.0 e no Node 22.22.3 |
| Navegador (Playwright, Chromium fixado) | Workbench/Atlas 24/24, Observatory 6/6, Control 3/3 (build novo) |
| Matriz de abertura multiprocesso | 1000/1000 por execução (cold, preinitialized, anchor) |
| Controles negativos | MCP 7/7, admissão 6/6, fechamento F01–F03/companion 6/6 |
| Instalação limpa pelo registry | aprovada |
| Claude Code 2.1.286 real | `.mcp.json` gerado por `integrate` → `context_search` chamado, arquivo certo |
| Codex 0.162 real | config de projeto gerada por `integrate` → `mcp_tool_call` bbrainx, arquivo certo |
| Configs dos harnesses reais do usuário | `mcp --project --workspace --harness` aceito (claude/codex/antigravity); workspace divergente recusado |

Concorrência (processos reais, 3 execuções): isolamento de lanes, memória aprovada compartilhada, CAS com exatamente um
vencedor, revogação, recusa de escopo/traversal/symlink, 28 kill -9 sem perda (replay idempotente), troca de harness na
mesma lane preservando checkpoint.

## Backlog priorizado (não corrigido nesta versão)

Trabalho parcial preservado nas branches `fix/harness` e `fix/tokens` do clone de auditoria.

| Pri. | Item | Impacto | Referência |
|---|---|---|---|
| 1 | Worker Laya pelo caminho LayaTransport herda o ambiente completo (chaves de API) | segurança, só com Laya compartilhado | `fix/harness` 81ec313 (pronto) |
| 2 | Checkpoint de lane segura o lock global do registro enquanto espera o banco da lane: sob carga, lanes independentes recebem EXECUTION_FAILED | multi-lane pesado | preservar invariante "epoch encerrada não recebe checkpoint" |
| 3 | `context_search` sem teto de tokens (média 15,7k; 62k com limit=50); budget 4000 = −77% com o mesmo recall | tokens | `fix/tokens` (parcial) |
| 4 | Chamadas paralelas na mesma lane → LANE_BUSY (Claude chama tools em paralelo) | turnos/tokens | fila FIFO limitada |
| 5 | Lane sem índice responde vazio em silêncio; INSTRUCTIONS não citam `context_index` | tokens | — |
| 6 | Partida a frio simultânea: `journal_mode=WAL` sem retry em store/registry (10–17/100 em banco novo) | robustez | usar `ensureWalMode` (F01) |
| 7 | SQLITE_BUSY vira EXECUTION_FAILED opaco; `indexProject` segura escrita durante leitura+hash | índices grandes | — |
| 8 | Busca repete o mesmo arquivo no top-10 (~11% das vagas); 1 trecho/arquivo: hit@3 0,64→0,69 | qualidade/tokens | piso godmode com margem mínima |
| 9 | 50 memórias `always` → bootstrap falha inteiro com `detail:null` | robustez | — |
| 10 | Instalador oficial no repositório com smoke MCP real e backup do banco antes da troca de release | operação | o instalador usado no Mac mini está fora do repo |
| 11 | README: alegações não verificadas (Cursor/VS Code/Gemini), CI de 912aa25, paridade PT/EN | lançamento público | relatório docs×CLI |
| 12 | FR-008 MEDIUM: instrumento pronto; falta coleta longa com máquina quieta e segundo Mac 16–<32 GiB | gate público | `medium-native-benchmark.mjs` |
| 13 | Aval final independente (Fable, esforço máximo) antes de divulgar; decidir publicação/merge dos PRs #8–#19 | lançamento | `main` remota está em a9636e9 |

## Oportunidade avaliada: spinabot/brigade (MIT, ~11k estrelas, alegações do README não verificadas)

Runtime pessoal de agentes (gateway WebSocket, canais de mensagem, memória "Tideline", Team Mode). Não é concorrente direto:
o BBrainX é autoridade de contexto/memória entre harnesses de código; o Brigade é um agente pessoal que dirige o Claude Code
como provedor. Padrões que valem estudo para o backlog, sem dependência:
1. **Skills residentes no prompt só por nome+descrição, corpo lido sob demanda** → aplicar às memórias `always` e às
   descrições de tools (itens 3, 5 e 9): menos tokens fixos por turno.
2. **Leases em Team Mode** → hoje nada impede dois escritores na mesma lane além do CAS; um lease de escrita por lane com
   expiração e reconciliação explícita fecharia o cenário de retomada entre harnesses.
3. **Loop-runner com done-checks independentes** → alinhado ao estado `review_needed` do checkpoint: "feito" só com verificação.
4. **Credencial por turno, 256 bits, nunca registrada** e servidor MCP loopback por turno → referência para o painel/MCP HTTP.

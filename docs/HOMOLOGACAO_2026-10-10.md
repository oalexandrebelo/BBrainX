# Homologação 2026-10-10 — versão de uso (0.5.0-rc2) e backlog

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

## Incluído na rc2 (estudado, testado e aprovado nesta homologação)

| Melhoria | Resultado medido |
|---|---|
| `context_search` com teto de tokens (budget 4000), um acerto por arquivo, ponteiros `caminho:linhas` para o resto | 17.397 → 3.517 tokens em 36 consultas (−79,8%); arquivo certo localizado 31/36 antes e depois; com `limit:50` 64.368 → 3.720 |
| Esquemas sem repetição em `tools/list`; hash de seção curto e piso de relevância no pacote | `tools/list` −20,8%; custo fixo por turno −6,8%; bootstrap −14,4% (5 tarefas) |
| Projeto/lane sem índice e orçamento obrigatório estourado viram erro acionável (chame `context_index`; quantas memórias e quanto falta) | fim do "nada encontrado" silencioso e do `detail:null` |
| Chamadas paralelas na mesma lane entram em fila FIFO limitada (antes: `LANE_BUSY`) | 8 paralelas completam; acima do limite recusa tipada |
| Checkpoint de lane não segura mais o lock global do registro enquanto espera o banco da lane; epoch encerrada continua sem receber escrita | lanes independentes sem EXECUTION_FAILED sob carga; 4 testes de corrida close×checkpoint |
| Partida a frio simultânea com retry limitado do modo WAL; SQLITE_BUSY vira `STORE_BUSY` tipado e repetível; índice lê e calcula hash fora da transação | servidor não morre mais na criação simultânea do banco |
| Worker Laya (caminho compartilhado) com ambiente sanitizado: sem chaves de API, NODE_OPTIONS ou PYTHONPATH | teste injeta segredos e prova que não vazam |
| CLI com erro curto em JSON (sem stack trace, stdout vazio para o MCP) | — |
| Marca oficial BBX em README, painel, handshake MCP e extensão VS Code | ver `docs/BRAND.md` |

Suíte 734/734 no Node 24.21.0 e no 22.22.3; Playwright 24/24, 6/6, 3/3.

## Backlog (não incluído)

| Pri. | Item | Referência |
|---|---|---|
| 1 | Corpo do `context_search` reduzido às linhas ao redor dos termos (precisão de linhas hoje 0,26) | `docs/engineering/PERFORMANCE.md` |
| 2 | Lease de escrita por lane (hoje só CAS/idempotência impedem dois escritores) | ideia do Brigade abaixo |
| 3 | Memórias `always` e descrições de tools só por nome+resumo, corpo sob demanda | ideia do Brigade abaixo |
| 4 | Instalador oficial no repositório (o kit `INSTALAR.sh` cobre o uso pessoal) com backup do banco antes da troca | — |
| 5 | Hardlink externo é indexado; memória revogada pode ser reaprovada (sem máquina de estados) | relatório de concorrência |
| 6 | README: alegações não verificadas (Cursor/Gemini), CI de 912aa25, paridade PT/EN restante | relatório docs×CLI |
| 7 | Filme Remotion com a marca nova | `docs/BRAND.md` |
| 8 | FR-008 MEDIUM: coleta longa com máquina quieta + segundo Mac 16–<32 GiB | instrumento na auditoria |
| 9 | Aval final independente (Fable, esforço máximo) e decisão de publicação (main remota em a9636e9; PRs #8–#19) | antes de divulgar |

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

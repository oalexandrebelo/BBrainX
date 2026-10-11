# BBrainX 1.5.0 (Developer Preview): registro de 2026-10-10

Prévia de desenvolvimento. Os números abaixo são os medidos nesta versão; o que não foi medido está marcado.

## Números

Máquina: macOS 26.6.2 arm64, Apple M4, 16 GiB, SQLite 3.53.4.

| Medida | Resultado | Como repetir |
|---|---|---|
| Testes automatizados, Node 24.21.0 | 734/734 | `env BBRAINX_HOME=$(mktemp -d) node --test test/*.test.mjs` |
| Testes automatizados, Node 22.22.2 | 734/734 | idem |
| Playwright (Chromium): painel, uso, controle | 24/24, 6/6, 3/3 | `npm run test:e2e`; `playwright.usage.config.mjs`; `playwright.control.config.mjs` |
| Controles negativos do MCP | 7/7 defeitos injetados e detectados | `node scripts/mcp-negative.mjs` |
| `context_search`, 36 consultas, orçamento padrão de 4.000 tokens | 17.397 → **3.517** tokens (−79,8 %) | [engineering/PERFORMANCE.md](engineering/PERFORMANCE.md) |
| Arquivo esperado localizado | 31/36 antes e depois | idem |
| Arquivo esperado com corpo no resultado | 31/36 → 23/36 | idem |
| Piso de recuperação (conjunto godmode), arquivo certo entre os 10 primeiros | **0,889**, um acerto por arquivo (o teste exige 0,85) | `test/godmode.test.mjs` |
| `tools/list` no fio | 2.431 → 1.925 tokens (−20,8 %) | PERFORMANCE.md |
| Instruções + definições das ferramentas, por turno | 1.498 → 1.396 tokens (−6,8 %) | PERFORMANCE.md |
| `context_bootstrap`, 5 tarefas | 4.818 → 4.126 tokens (−14,4 %) | PERFORMANCE.md |
| Repetição do `context_search` na revisão 90f37e8 | 17.742 → 3.721 tokens (−79,0 %); localizado 31/36 → 31/36; com corpo 31/36 → 21/36 | `node scripts/measure-search-tokens.mjs` |
| Node | piso 22.20.0; recomendado 24 | `package.json` (`engines`) |

Tokens são `o200k_base` sobre o payload, um proxy: não medem cobrança do provedor. O valor muda com o corpus indexado.

## Clientes MCP

| Cliente | Estado | Evidência |
|---|---|---|
| Claude Code | verificado | `claude -p --mcp-config` chamou `context_search` |
| Codex | verificado | `codex exec` chamou `context_search` |
| VS Code | verificado em parte | `.vscode/mcp.json` gerado, exercitado por um cliente do SDK MCP do jeito que o VS Code o inicia; o início pela interface do VS Code é manual |
| Cursor | não verificado | só imprime o fragmento (`config --client cursor`) |
| Gemini CLI | não verificado | só imprime o fragmento (`config --client gemini`) |

## Incluído

- `context_search` com orçamento de tokens (padrão 4.000), um acerto por arquivo e ponteiros `caminho:linhas` para o resto.
- Esquemas de `tools/list` sem repetição; hash curto de seção e piso de relevância no pacote.
- Erro acionável para projeto ou lane sem índice (`INDEX_REQUIRED`) e para contexto obrigatório que não cabe no orçamento (`MANDATORY_CONTEXT_EXCEEDS_BUDGET`, com quanto falta).
- Chamadas paralelas na mesma lane em fila FIFO limitada; checkpoint de lane sem segurar o lock global do registro.
- Abertura simultânea do banco com retry limitado do modo WAL; `SQLITE_BUSY` vira `STORE_BUSY`, tipado e repetível.
- `integrate` para Codex, Claude Code, VS Code e Kilo; painel por projeto; alinhamento SDD; Laya local; extensão VS Code 0.1.3.
- Processo do Laya com ambiente sem chaves de API, `PYTHONPATH` e `NODE_OPTIONS`; flags offline das bibliotecas, sem bloqueio de rede do sistema operacional.
- Configurações emitidas com caminho estável do Node; `BBRAINX_HOME` em pasta sincronizada ou de rede é recusado (`STATE_HOME_SYNCED`).
- CLI com erro curto em JSON, sem stack trace.
- Marca BBX no README, no painel, no handshake MCP e na extensão VS Code ([BRAND.md](BRAND.md)).

## Oportunidades

1. Gate MEDIUM em dois Macs físicos com 16 a menos de 32 GiB.
2. Ícones das ferramentas MCP e ícone da barra de status no VS Code.
3. Favicon dedicado de 16 px.
4. Wordmark para fundo claro.
5. Payload enviado duas vezes (`content` e `structuredContent`; 10.125 tokens no fio contra 4.978 do texto na tarefa T1) e eco do checkpoint: decidir a economia no contrato.
6. Corrida rara na partida do ledger compartilhado de admissão do Laya (opcional): 2 em 9.000 aberturas simultâneas.
7. Padrões estudados em spinabot/brigade (MIT; alegações do README não verificadas), como candidatos: skills residentes no prompt só por nome e descrição, lease de escrita por lane, loop com verificação de "feito".
8. Corpo do `context_search` reduzido às linhas ao redor dos termos: precisão de linhas hoje 0,26.
9. Repetir as 79 perguntas cegas na 1.5.0 (última medida: 0.4, revisão 4785d4d).
10. Relatório de CI publicado para a 1.5.0 (o último é da revisão 912aa25).
11. Verificar Cursor e Gemini CLI com clientes reais.

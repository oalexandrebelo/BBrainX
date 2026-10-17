# Revisão integrações/MCP 2.1.1 — 16/10/2026

Tarefa `r2610161503-145737`; base `b3b05061e89f79bbe0e7747bcca6e12071eaa302`, branch `bbx/r2610161503-145737`. `git ls-remote origin HEAD refs/heads/main` observou `e3977cc45d05c564c469ebda83ebaca2bdab871a`. Revisão C lida antes das alterações; bootstrap e busca do BBrainX executados nesta lane. Estado: alterações prontas para revisão, sem commit por restrição do sandbox.

| Achado | Correção na origem | Regressão reproduzível |
|---|---|---|
| 1 / P1 | `src/integration-config.mjs:69`: compara o TOML restante com o documento original sem o servidor pretendido. Dados alheios no bloco fazem a operação recusar sem escrever. | `test/integrations.test.mjs`: `managed TOML update and removal refuse blocks containing foreign parsed data`; `companion receipt cannot authorize deleting a foreign server inside BBRAINX markers`. Ambos falharam antes da correção. Cobre os dois nomes gerenciados, update, remoção e recibo real com AB-S00S. |
| 2 / P2 | `bin/bbrainx.mjs:16`: opt-out explícito vence no fallback de ambiente de `mcp`. `src/integrations.mjs:107` e `src/integration-config.mjs:82`: persistem `BBRAINX_RECRUIT=false`, mantendo adoção legada exata. | `test/mcpb.test.mjs`: `mcp --no-recruit overrides inherited recruitment and an explicit --recruit` (catálogo real: 11 antes, 8 depois); `test/integrations.test.mjs`: `recruitment off is persisted in every installed client environment`. Ambos vermelhos antes. |
| 3 / P2 | `src/mcp.mjs:85`, contrato em `src/engine.mjs:55`: envelope completo limitado a 512 KiB; mantém relatórios integrais e devolve `omittedAgentIds` + `truncated:true`. Consulta por `ids` recupera o relatório. | `test/agents-status-envelope.test.mjs`: `agents_status bounds the complete legacy/modern MCP envelope and keeps omitted reports accessible (CJK/JSON escapes)`. Quatro casos com store, motor, handler e writer reais; sem o limite, falham com `MCP_RESPONSE_LIMIT`. |
| 4 / P2 | `src/integrations.mjs:112`: verifica o Buffer final, depois do segundo servidor, antes de admitir o plano. | `test/integrations.test.mjs`: `final rendered configuration above MAX_BYTES is blocked before any write` (vermelho antes); `exact MAX_BYTES output rolls back and a companion exceeding the final limit is blocked`. Saída de exatamente 1.048.576 bytes é aceita e restaurada; acima disso o plano bloqueia. |
| 5 / P2 | `src/integrations.mjs:128`: `fchmodSync` após escrita e antes de fsync/rename, compartilhado por aplicação e rollback. | `test/integrations.test.mjs`: `integration replace/rollback preserves recorded permissions under a restrictive umask`. Ambos vermelhos antes: `0644` em vez de `0664`; depois preservam `0664` sob umask `022`. |
| 6 / P3 | `scripts/package-mcpb.mjs:77`: busca do pacote importador para fora, só depois deduplica pelo caminho resolvido. | `test/mcpb.test.mjs`: `lockedClosure resolves nested dependencies before root and deduplicates resolved paths` (vermelho antes). Conserva `b@1` na raiz e `a/node_modules/b@2`, incluindo dependências compartilhadas e ciclo. |
| 7 / P3 | `src/ab-bbx.mjs:114`: conferência do prazo em `finally` de cada etapa, também em rejeições. | `test/engine.test.mjs`: `elapsed deadline wins over synchronous throws in run, validation and access` (vermelho antes). Operação síncrona de 40 ms, prazo de 10 ms: `TIMEOUT`, também nas validações de entrada/saída e no acesso. |
| 8 / P3 | `src/mcp.mjs:74`: somente `undefined` vira `{}`. | `test/engine.test.mjs`: `MCP rejects arguments null before execution but defaults omitted arguments to an empty object in both eras` (vermelho antes). `null` recebe `-32602` sem execução; omissão continua válida. |

Medição da fixture de 50 relatórios, cada resumo/log com 4.000 caracteres, em bytes UTF-8 incluindo LF do writer:

| Conteúdo / protocolo | Antes do limite | Depois do limite | Structured depois |
|---|---:|---:|---:|
| CJK / legado | 2.483.589 | 498.269 | 248.592 |
| CJK / moderno | 2.483.697 | 498.377 | 248.592 |
| Escapes JSON / legado | 3.083.589 | 494.999 | 199.041 |
| Escapes JSON / moderno | 3.083.697 | 495.107 | 199.041 |

O teto é 524.288 bytes, abaixo dos 2.097.152 do writer. A fixture CJK retém 10 relatórios e devolve 40 IDs; a de escapes retém 8 e devolve 42 IDs. Não há estimativa de tokens ou certificação de cliente nativo. O ajuste ocorre na fronteira MCP para medir a duplicação texto/structured, escaping e os metadados reais; não altera `recruit.mjs` nem trunca o relatório individual. Uma mutação invertendo a comparação de bytes também foi rejeitada pelas duas regressões CJK, e o arquivo foi restaurado byte a byte.

Verificação local em macOS arm64, Node 24.21.0:

```sh
env -u BBRAINX_ENTRY PATH="/opt/homebrew/opt/node@24/bin:$PATH" npm test
env -u BBRAINX_ENTRY PATH="/opt/homebrew/opt/node@24/bin:$PATH" npm run build -- --configLoader native
env -u BBRAINX_ENTRY PATH="/opt/homebrew/opt/node@24/bin:$PATH" python3 test/archive_test.py
git diff --check
```

Resultados: **803/803** testes Node, zero falhas/cancelados/skips/TODOs; **3/3** testes Python; build passou (187 módulos), com aviso do bundler sobre `use client` de `@xyflow/react`; diff sem erro de whitespace. O comando normal `npm run build` foi tentado e recusado com `EPERM` ao criar `node_modules/.vite-temp` no destino compartilhado do symlink. O carregador nativo evita essa escrita, sem alterar configuração do projeto. O shell inicial usava Node 24.18 enquanto `BBRAINX_NODE` indicava 24.21 e `BBRAINX_ENTRY` indicava outra instalação; os comandos acima alinham apenas o ambiente do processo de teste. Nenhuma configuração do host foi alterada. Não há script de lint; E2E não executado porque não houve mudança de UI. Node 22 e outros sistemas não foram executados nesta rodada.

Arquivos de produção alterados: `bin/bbrainx.mjs`, `scripts/package-mcpb.mjs`, `src/ab-bbx.mjs`, `src/engine.mjs`, `src/integration-config.mjs`, `src/integrations.mjs`, `src/mcp.mjs`. Testes: os quatro arquivos da tabela. Documentação: este registro, `docs/engineering/CONTINUITY.md`, `docs/RECRUIT.md` e `docs/RELEASE_NOTES.md`. Os arquivos reservados `src/recruit.mjs`, `src/control.mjs`, `src/lanes/registry.mjs` e o tratamento do subcomando `recruit` não foram alterados. `node_modules` permanece symlink ignorado pelo Git.

Pendência concreta: `git add` falhou ao criar `history/.git/worktrees/r2610161503-145737/index.lock` fora das raízes graváveis. Próxima ação do supervisor: revisar este diff e commitar nesta mesma branch, sem push/merge/rebase. Agrupamentos sugeridos: `fix(integrations): preserve foreign data and rollback invariants`, `fix(mcp): bound status envelopes and validate failure paths`, `fix(mcpb): resolve dependencies from each importer`. Conferir CI da revisão que vier a ser commitada antes de integrar; rollback das correções é reverter esses commits, sem migração de banco.

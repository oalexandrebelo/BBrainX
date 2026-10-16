# WP-B — integração AB-S00S, OpenHands e ACI — 16/10/2026

Base: `8b394b909f9f40ab40178c82d65ebea247c7a224`; branch `bbx/r2610160601-998a5f`. Contrato lido em `/Users/openclaw/Projetos/AB-S00S/docs/ARQUITETURA.md`, seção 5/WP-B. Todas as alterações de produto ficaram nesta worktree. Nenhum push, merge, rebase, instalação de pacote, alteração de credenciais ou abertura de janela.

## Resultado e decisões

- `integrate --ab-s00s on|off` gerencia a segunda entrada nas três configurações. Reutiliza plano em memória, recibo por arquivo, backup privado, hashes/CAS e rollback. Propriedade registrada por servidor impede que um recibo de `bbrainx` autorize sobrescrever um AB-S00S alheio. Omissão da flag preserva a entrada; `off` dispensa o executável; `on` resolve `--ab-s00s-bin` ou `~/.local/bin/ab-s00s` por realpath.
- `config --client openhands` imprime JSON puro de `mcp_config`, com `transport: "stdio"`, `bbrainx` e AB-S00S opt-in. O teste usa o contrato stdio derivado dos tipos do Canvas; a prova adicional executa os normalizadores reais da referência local, com SHA-256 fixado.
- `context.read`/`context_read`: janela inclusiva numerada `%6d| `, padrão 200/máximo 400 linhas e 64 KiB. Recusa travessia, symlink, arquivo fora do índice e índice desatualizado; relê e confere o hash após a varredura de frescor.
- `context.symbol`/`context_symbol`: declarações lexicais exatas do índice, com arquivo, linha da declaração, tipo e hash. Padrão 20/máximo 50 resultados; 200 trechos candidatos, com truncamento explícito. Compartilha as heurísticas existentes de declaração; não altera ranking, schema de banco, checkpoint ou memória.
- Catálogo padrão 8; com recrutamento 11; com SDD ou Laya isoladamente 9. Asserções e manifesto MCPB atualizados, sem relaxar gates.
- Revisão independente somente leitura apontou a perda de identidade de lane no comando AB-S00S. Corrigido com `AB_S00S_LANE_UNSUPPORTED` para `on` com lane; ausência da flag e `off` seguem compatíveis. O AB-S00S precisa de contrato explícito de lane antes de ampliar esse suporte. Também corrigida uma oração ambígua na documentação de recrutamento.

## Aceite → testes

| Item WP-B | Evidência automatizada |
|---|---|
| on/off/rollback em `.mcp.json`, `.codex/config.toml`, `.vscode/mcp.json` | `test/ab-s00s-config.test.mjs`: `AB-S00S <claude/codex/vscode>: on/off are idempotent, preserve peers and rollback exact bytes` (3 testes). Exercitam também omissão da flag, atualização intermediária e desligamento após remover o binário. |
| Mesmos recibos, propriedade e recuperação | No mesmo arquivo: `foreign entry is never adopted or removed by a BBrainX receipt` (3 clientes), `one receipt covers all three files; concurrent edits and corrupt backups fail closed`, `partial apply restores all original files through the same prepared receipt`. A suíte anterior de `test/integrations.test.mjs` permanece verde. |
| Caminho explícito/padrão e CLI | `default launcher resolves realpath; invalid modes and unavailable binaries refuse without writes`; `CLI: integrate --ab-s00s on/off and config --client openhands carry explicit flags`; `lane activation refuses before effects; off and flag omission keep lane support`. |
| OpenHands conforme Agent Canvas | `OpenHands: pure JSON matches the Agent Canvas canonical stdio type, with AB-S00S opt-in`; `scripts/verify-openhands-config.mjs`: `parseMcpConfig` e `toCanonicalMcpServer` reais, nos modos ausente/off/on. |
| ACI: numeração, limites, índice e hash | `test/aci.test.mjs`: `numbered inclusive window, exact file hash, EOF and 400-line maximum`; `blank files, CRLF and byte bounds are explicit`; `traversal, absolute paths, symlinks and files outside the index are refused`; `missing and stale indexes refuse both capabilities without implicit refresh`; `hash is verified again after the freshness scan` (read e symbol). |
| Símbolos, escopo e protocolo | No mesmo arquivo: `only exact indexed declarations, stable file/line/kind/hash and bounded results`; `candidate ceiling reports truncation even when candidates are only identifier parts`; `host allowlist and lane bindings apply to both capabilities`; `real MCP stdio exposes eight default tools and both read-only capabilities`. |
| Contagem e opt-ins | `test/recruit.test.mjs`: catálogo com oito/onze e processo stdio real; `test/mcp-wire.test.mjs`: lista exata; assertions de MCPB, lanes, SDD, Laya e domínio. |

## Comandos e resultados observados

Primeiro comando, na raiz:

```sh
ln -s /Users/openclaw/Projetos/BBrainX-homologacao/run.20261010T231307Z.2jZl/wt-pr22/node_modules node_modules
```

Resultado: exit 0. `node_modules` é apenas o link de dependências solicitado, não deve entrar no commit.

`context_bootstrap` e `context_search` do MCP BBrainX foram usados primeiro, no projeto `bbrainx-dev`, lane `r2610160601-998a5f`. `npm run project:status`: base/branch acima, Node inicial 24.18.0, evidência consolidada ausente, única alteração inicial era o link. `git ls-remote https://github.com/oalexandrebelo/BBrainX.git HEAD refs/pull/22/head`: HEAD remoto `e3977cc45d05c564c469ebda83ebaca2bdab871a`, PR #22 `8ed6285b363c3a5b5358dbc4fe0508076b1ba016`. Nenhuma referência/branch foi movida.

As provas finais usam Node **24.21.0**, macOS arm64. O shell inicial usava fnm 24.18.0, mas `BBRAINX_NODE` já apontava para Homebrew 24.21.0; `BBRAINX_ENTRY` herdado apontava para outra instalação. A correção abaixo vale somente no processo de validação, sem gravar configuração do host:

```sh
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
export BBRAINX_ENTRY="$PWD/bin/bbrainx.mjs"
env BBRAINX_HOME=$(mktemp -d) npm test
env BBRAINX_HOME=$(mktemp -d) node --test test/*.test.mjs
npm run build
npm run build -- --configLoader native
node scripts/verify-openhands-config.mjs /Users/openclaw/Projetos/reference/OpenHands
git diff --check
```

| Validação | Resultado real |
|---|---|
| `env BBRAINX_HOME=$(mktemp -d) npm test` | **784/784**, 0 falhas, 0 cancelados, 0 skips, 0 todo; 19,27 s. Log local `artifacts/wp-b/npm-test.log`. |
| `env BBRAINX_HOME=$(mktemp -d) node --test test/*.test.mjs` | **784/784**, 0 falhas, 0 cancelados, 0 skips, 0 todo; 19,08 s, após registrar este worklog. Log local `artifacts/wp-b/final-tests.log`. |
| `npm run build` | **Falhou**, exit 1: `EPERM` ao gravar `node_modules/.vite-temp` fora do sandbox, pelo link de dependências exigido. Log `artifacts/wp-b/build.log`. |
| `npm run build -- --configLoader native` | **Passou**, exit 0, 187 módulos, 157 ms. Não escreve temporário no checkout externo. Aviso preservado de `"use client"` em `@xyflow/react`; log `artifacts/wp-b/build-native.log`. |
| `node scripts/verify-openhands-config.mjs /Users/openclaw/Projetos/reference/OpenHands` | **Passou**, 3 modos, dois normalizadores reais. Warning experimental de `stripTypeScriptTypes` preservado. Log `artifacts/wp-b/openhands.log`. |
| `node --test test/aci.test.mjs test/ab-s00s-config.test.mjs test/token-budget.test.mjs` | **34/34**, sem falha/skip, 1,32 s. Log `artifacts/wp-b/focused-final.log`. |
| `git diff --check` | Passou, sem erros de whitespace. Não há script de lint no `package.json`. |

Rodadas anteriores, sem ocultar falhas: novos testes de configuração **0/10** e ACI **0/9** antes da implementação; configuração/instalador **26/26** após implementar; rodada de integração **107/109**, com duas recusas `RECRUIT_ENTRY_MISMATCH` do ambiente herdado; primeira suíte inteira **780/781**, por schema novo anunciar `pattern`. Corrigido com `refine` mantendo a mesma validação e preservando o teste existente. ACI + token-budget depois disso: **21/21**. Uma mutação temporária que retirou a comparação de hash produziu **9/10**, falhando especificamente `ACI read: hash is verified again after the freshness scan`; o arquivo original foi restaurado integralmente antes da suíte final. Log `artifacts/wp-b/mutation-hash.log`.

Referências somente leitura: OpenHands `0c7c2258a8acc309852ceb248b3ade606b79869c`, arquivos `src/utils/mcp-config.ts`, `src/types/mcp-server.ts`, `src/types/settings.ts` e teste do normalizador; SWE-agent `3ea751c087f32b16e039a2233dd6eefecef325d5`, ferramentas `windowed`/`search`. Hashes das fontes OpenHands ficam no verificador; nenhum código/licença/ativo da referência foi redistribuído.

## Arquivos e retomada

- Novos módulos: `src/ab-s00s-config.mjs`, `src/integration-config.mjs`, `src/aci.mjs`, `src/declarations.mjs`.
- Ligações mínimas: `bin/bbrainx.mjs`, `src/clients.mjs`, `src/control-cli.mjs`, `src/integrations.mjs`, `src/engine.mjs`, `src/analyze.mjs`.
- Provas novas: `test/ab-s00s-config.test.mjs`, `test/aci.test.mjs`, `scripts/verify-openhands-config.mjs`.
- Catálogos/asserções: `scripts/package-mcpb.mjs`, `scripts/laya-smoke.mjs`, `test/decisions.test.mjs`, `test/domain.test.mjs`, `test/godmode.test.mjs`, `test/lanes-mcp.test.mjs`, `test/mcp-wire.test.mjs`, `test/mcp.test.mjs`, `test/mcpb.test.mjs`, `test/recruit.test.mjs`, `test/sdd-integration.test.mjs`.
- Docs: `README.md`, `docs/QUICKSTART.md`, `docs/RECRUIT.md`, `docs/RELEASE_NOTES.md` (2.1.0 rascunho), `docs/integrations/INSTALLER.md`, `docs/engineering/CONTINUITY.md` e este worklog.

Commit não foi possível: `git add src/ab-s00s-config.mjs src/integration-config.mjs src/integrations.mjs src/clients.mjs src/control-cli.mjs bin/bbrainx.mjs test/ab-s00s-config.test.mjs` retornou exit 128, `Unable to create .../history/.git/worktrees/r2610160601-998a5f/index.lock: Operation not permitted`. Alterações preservadas na worktree, sem tentativa de contornar o sandbox. Sugestão de mensagem: `feat: integrar AB-S00S, OpenHands e contexto ACI verificado`.

Próxima ação concreta: supervisor revisar o diff e este aceite, adicionar os arquivos listados (excluir o link `node_modules`) e commitar **nesta branch**. Executar o build padrão em ambiente onde o temporário do Vite seja gravável; o build alternativo já passou. E2E/UI não executados: não houve alteração de interface e a tarefa proíbe iniciar navegador/Electron. Conexão nativa do Agent Canvas e execução do servidor AB-S00S pertencem à integração dos pacotes, não foram certificadas aqui. Falha de produto conhecida após os testes finais: nenhuma; pendências operacionais: commit e build padrão fora da restrição de escrita.

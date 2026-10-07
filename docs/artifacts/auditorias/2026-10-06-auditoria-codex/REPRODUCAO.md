# Reprodução dos ensaios — BBrainX, 06/10/2026

## Identidade e isolamento

Main: `a9636e9402e3fa673ae05b3489202da1048aef5e`, produto 0.4.0. PR #6: `2c87f61c3d6355adf61e8675e2f3ee96c5cb2489`. O clone da PR recebeu o patch completo; depois foi comparado com a árvore remota: 125 blobs, zero divergências, árvore não truncada. Scripts adicionais da bancada são untracked e não fazem parte da PR. A original `/Users/alexandrebelo/Projetos/BBrainX/repo` ficou limpa durante a auditoria.

As execuções ocorreram em `/private/tmp/bbrainx-audit-20261006/source` e `pr6-source`. Fixtures de corpus, banco e crash foram geradas em diretórios novos de `os.tmpdir()` e removidas em `finally`. Acesso loopback/processos/MPS foi permitido para os testes em cópia temporária. Falha de acesso no sandbox ou de DNS não foi usada como evidência de defeito do produto.

Os scripts em `reproduce/` são exatamente os utilizados. Seus caminhos absolutos preservam a proveniência desta execução. Para uma nova bancada, use diretório isolado com essas mesmas convenções ou altere **apenas** os caminhos `out`, `home`, destino de screenshot e entrypoints no cabeçalho dos scripts. Não rode contra o diretório operacional de estado. Não há instalação/download automático nos scripts de auditoria; o runtime/dependências e os pesos copiados precisam existir previamente.

## Comandos executados e códigos

| Diretório isolado | Comando efetivo | Código / resultado |
|---|---|---|
| source | `/Users/alexandrebelo/.nvm/versions/node/v22.23.2/bin/node --test test/*.test.mjs` | 1; 93/96 |
| source | `/Users/alexandrebelo/.nvm/versions/node/v24.18.0/bin/node --test test/*.test.mjs` | 0; 96/96 |
| source | `node scripts/benchmark.mjs` em Node 24 | 0; benchmark original, 60 docs, dez consultas |
| source | `node node_modules/vite/bin/vite.js build --outDir /private/tmp/bbrainx-audit-20261006/dist --emptyOutDir` | 0; dois avisos registrados |
| source | `node scripts/audit-runtime.mjs` | 0; 60/1.000/5.000 arquivos, 100 consultas cada, CAS/idempotência/SIGKILL/symlink/compactação |
| source | `node scripts/audit-tokenizer.mjs` | 0; 105 paridades, seis tamanhos; processo de 256 KiB morto pelo watchdog como resultado esperado |
| source | `node scripts/audit-laya.mjs` | 0; peso real copiado, 64 pares sintéticos rotulados, MPS/RSS |
| pr6-source | `node --test test/atlas.test.mjs` | 0; 10/10 |
| pr6-source | `node node_modules/vite/bin/vite.js build --configLoader native` | 0; MPA |
| pr6-source | `node node_modules/@playwright/test/cli.js test e2e/atlas.spec.mjs --reporter=json` | 0; Chromium 6/6 |
| pr6-source | `node node_modules/vite/bin/vite.js build --config vite.atlas.config.mjs --configLoader native` | 0; estático documental |
| pr6-source | `node scripts/atlas-publish.mjs` | 0; allowlist local, nenhum deploy remoto |
| pr6-source | `node scripts/audit-atlas-browser.mjs` | 0; probe Enter canvas/lista e ausência de API/page error |
| source | `bash -e -c 'node22 --test test/mcp-wire.test.mjs \| tee <log-temporário>'` com pipeline shell real | 0 apesar de 3/6 testes falharem; prova de mascaramento sem pipefail |

Nas linhas `node` acima, o PATH foi fixado no diretório do Node 24.18.0 instalado; `node22` na última linha denota o caminho absoluto 22.23.2 da primeira linha. A barra exibida antes de pipe na tabela é escape de Markdown, não parte do comando shell: o processo foi conectado por `|` real. O uso de `tee` foi reproduzido com testes existentes que falham no Node 22; não demonstra que o Atlas falhou no runner GitHub Node 24.

## Preparação da cópia usada

```sh
git clone --shared /Users/alexandrebelo/Projetos/BBrainX/repo /private/tmp/bbrainx-audit-20261006/source
ln -s /Users/alexandrebelo/Projetos/BBrainX/repo/node_modules /private/tmp/bbrainx-audit-20261006/source/node_modules
git clone --shared /Users/alexandrebelo/Projetos/BBrainX/repo /private/tmp/bbrainx-audit-20261006/pr6-source
git -C /private/tmp/bbrainx-audit-20261006/pr6-source apply /private/tmp/bbrainx-audit-20261006/evidence/github-pr6.patch
ln -s /Users/alexandrebelo/Projetos/BBrainX/repo/node_modules /private/tmp/bbrainx-audit-20261006/pr6-source/node_modules
```

Os diretórios já existem nesta máquina após a auditoria; não reaplique esses comandos sobre eles. Uma reprodução independente deve criar novo diretório de trabalho, checkout fixado e dependências do lock. Clone `--shared` usa a base de objetos do repositório original; não é arquivo de distribuição independente. Builds com configuração da PR usaram `--configLoader native` para não escrever cache de bundling em node_modules compartilhado.

Para Laya foram copiados **somente** os cinco arquivos do checkpoint instalado para `laya-home/profiles/laya/models/multilingual`; venv instalado foi usado por link somente como runtime. O modelo copiado pode reescrever tokenizer_config sem tocar o original. `audit-laya.mjs` verifica tamanho/digest de todos os cinco arquivos antes da inferência, chama o script existente `scripts/laya-bench.mjs --memory test/fixtures/eval-memory.cases` e mede RSS do processo Python por `ps` a cada 250 ms. Nenhum peso ou venv faz parte da entrega documental.

## Limites que não podem desaparecer na reprodução

- Corpus artificial de funções curtas não demonstra sucesso em tarefa, carga máxima ou custos de provedor.
- Ordem crescente e caches aquecidos não isolam perfeitamente cold/warm; três stores abertos influenciam RSS.
- CAS/crash foram processos reais, mas não queda física de energia nem disco cheio.
- Benchmark Laya usa fixture existente rotulada à mão, não holdout independente. 6,2 ms é custo amortizado por par no batch.
- O watchdog de 3 s inclui startup do subprocesso. O tempo de contagem reportado nos casos concluídos exclui startup. Para 256 KiB só existe limite inferior de parede, sem duração integral.
- Nenhum teste nativo de VS Code, Codex App, Claude Desktop, Antigravity ou Windows desktop foi executado nesta bancada.
- O mascote foi especificado por prompt; não foi renderizado ou integrado ao desktop.

## Integridade dos artefatos

`MANIFEST.json` enumera SHA-256 e tamanho de cada arquivo entregue, exceto o próprio manifesto para evitar autorreferência. `evidence/leitura-news.json` registra hashes das fontes originais e leitura integral. `evidence/pr6-tree-verification.json` liga a cópia testada aos blobs do head remoto. O manifesto verifica integridade de arquivos, não assinatura de identidade do autor nem atestado externo de qualidade.

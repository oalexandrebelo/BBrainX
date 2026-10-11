# Prontidão de lançamento — 7 de outubro de 2026

Base examinada: PR #12, `5c462b61fd650f67c8cf1beef81de4accf638ba1`. Os heads das PRs #6–#11 são ancestrais dessa revisão; não é necessário reaplicar os patches históricos. A revisão de lançamento é incremental sobre a consolidação e não efetua merge ou release automaticamente.

## Contratos corrigidos

- Raiz registrada: recusar uma raiz ou ancestral redirecionado por symlink/junction antes de indexar, reler ou atualizar fontes. A falha preserva índice, snapshot e eventos. Não oferece snapshot atômico do filesystem ou sandbox do sistema operacional.
- Atualização parcial: aplicar os mesmos limites totais de arquivos e bytes da indexação integral dentro da transação existente. Exceder a quota desfaz arquivos, chunks, FTS, snapshot e evento da tentativa.
- Atlas: seleção por teclado sincronizada com inspetor/deep link e navegação de abas por teclado; removido import CSS vazio.
- CI: o workflow geral chama a verificação consolidada na mesma revisão; a publicação depende do seu sucesso e dos testes/build no Node mínimo 22.20. Auditoria npm bloqueia vulnerabilidades altas/críticas e falhas de consulta. A suíte Atlas usa Bash com pipefail para preservar o erro antes de `tee`.
- MCP no Node 22: os testes separam somente o bloco exato do aviso experimental SQLite dos eventos JSON, preservam stderr bruto e continuam rejeitando diagnósticos inesperados. O produto não suprime os avisos do runtime.
- Documentação: índice da auditoria histórica corrigido; catálogo usa arquivos rastreados e links por commit.

## Evidência e números divulgáveis

A CI da base registrou **279 testes distintos**, aprovados em cada um dos três sistemas, não 837 testes distintos: [CI geral](https://github.com/oalexandrebelo/BBrainX/actions/runs/37618740993) e [CI consolidada](https://github.com/oalexandrebelo/BBrainX/actions/runs/37618734795). Essa contagem é anterior às regressões desta revisão. A execução da PR de correção é a evidência dos novos arquivos; não atribuir automaticamente os resultados antigos a um novo commit.

O experimento de I/O do compilador compara o mesmo payload sobre dez chunks de um arquivo sintético: **10 → 1 leituras completas** e **501.790 → 50.179 bytes retornados por essas leituras**. O cache do SO não é esvaziado; a redução de 90% desse trabalho não é prova de 10× de velocidade, economia de cobrança ou maior taxa de tarefas aceitas. Reproduzir com `node scripts/contracts-evidence.mjs` em checkout isolado.

O inventário de `Tunning_ChatGPT_WEB` cobre 218 arquivos físicos, 26.063.214 bytes, 36 ocorrências de ZIP incluindo arquivos aninhados e 1.668 entradas de arquivo. As 91 referências verificáveis de bytes/SHA-256 dos manifestos físicos coincidiram. Duplicatas e logs de CI preservados não são execuções independentes. Materiais originais permanecem fora da distribuição do produto; os estudos publicáveis estão em [research/INDEX.md](research/INDEX.md).

O protocolo de consistência e WitnessCache têm testes próprios em `experiments/artifacts`. Continuam isolados do núcleo. O candidato X99 de worker/cache Laya não está integrado. Nenhum percentual desses laboratórios comprova desempenho do produto atual.

## Limites para divulgação

Posicionamento verificável: contexto local com orçamento BPE, memória aprovada, checkpoints versionados e workspaces cooperativos separados por lane. O projeto permanece uma **developer preview**. Não anunciar imunidade a prompt injection, sandbox do SO, compartilhamento universal de KV cache, treinamento/autonomia RSI completos, certificação de todos os harnesses ou liderança de mercado.

Ainda faltam tarefas reais pareadas e aceitas, recibos completos dos provedores, repetição em estação MEDIUM sob carga e handoff nativo entre aplicativos. Ganhos históricos de recuperação permanecem vinculados aos seus corpora e revisões em [EVALUATION.md](EVALUATION.md). Tokenização e SQLite síncronos ainda podem bloquear o processo; deadlines são cooperativos. O novo guard de raiz não identifica troca de diretório regular pelo mesmo caminho nem elimina corridas posteriores à verificação.

O teste de busca no próprio repositório é sensível às fronteiras fixas de 60 linhas. Durante a correção, colocar o novo guard dentro de `retrieval.mjs` mudou hit@3 de 22/36 para 21/36; separá-lo em `source-root.mjs`, como política de identidade da raiz independente de FTS, restaurou 22/36 na ablação. Ranking, casos esperados e limiares permaneceram intactos. Isso é efeito do corpus, não ganho do algoritmo. Uma avaliação futura precisa também de corpus fixado e holdout independente; estes números não medem qualidade em tarefas externas.

## Reproduzir e publicar

Usar Node 24, Git e o lockfile versionado. Em checkout isolado: `npm ci --ignore-scripts`, `npm test`, `npm run build`, `npm run test:e2e`, `npx playwright test --config playwright.usage.config.mjs`, `node scripts/consolidated-labs.mjs`. Os coletores e controles negativos completos são definidos em `.github/workflows/consolidated.yml`; mutações exigem cópia limpa e descartável. Não rodar controles negativos no checkout de trabalho.

A release `v0.4.0-preview` existente é anterior à consolidação e não deve ser substituída. Uma nova publicação precisa de versão/tag explícitas, arquivo fonte e manifesto correspondentes ao commit validado. O workflow atual recusa substituir a tag antiga; não publica essas funcionalidades sob a release existente.

Antes da atualização, encerrar os processos BBrainX e copiar integralmente a pasta de estado para um backup privado. Esta revisão não migra bancos. Para rollback, parar os processos e voltar ao código anterior; preservar o estado atual para diagnóstico. Não reutilizar uma raiz redirecionada: restabelecer a pasta originalmente registrada. Se houver necessidade de restaurar o backup, fazê-lo em pasta vazia com todos os processos parados.

Referências dos gates: [workflows reutilizáveis](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows), [semântica de shell](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), [npm audit](https://docs.npmjs.com/cli/v11/commands/npm-audit/). São contratos das ferramentas; o sucesso da CI da revisão continua sendo necessário.

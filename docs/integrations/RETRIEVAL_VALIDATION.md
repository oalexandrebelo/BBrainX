# Validação do prior de documentação

Em 2026-10-08, reduzi o fator geral de documentos de `.7` para `.5` em `src/retrieval.mjs`. A hipótese é que documentação ampla estava ganhando de código-fonte que implementa o comportamento pesquisado. A mudança reduz a contribuição de qualquer documento em todas as consultas; não altera glossário, casos, limiar ou política de inclusão.

Antes de abrir os corpora cegos, congelei o candidato. Baseline e candidato diferem em um único valor de `kindWeight`: `.7` e `.5`. Seus SHA-256 são `fb010d6d23810ff5ad4367903d6fa7b84fec5e3d3a631d744f0a714c31371115` e `027ad0edaac4261855cd15c1dcb740338d81132aea4e759c681b9a0003dcd437`.

## Corpos cegos

Comparei ambos os pesos sobre cada mesmo índice, gerado uma vez por corpus em banco temporário novo. Usei os commits [mem0](https://github.com/mem0ai/mem0/tree/abb81c88e1f738a8117d8293530fbc31a5ef8fd9) e [Plandex](https://github.com/plandex-ai/plandex/tree/e2d772072efadbe41d2946d97d79be55532dbab5), fixados em [EVALUATION.md](../EVALUATION.md). Usei Node `24.21.0`, dois passes de aquecimento e nove passes medidos, alternando qual implementação pesquisava primeiro em cada consulta.

| Corpus | Arquivos indexados | Hit@3 `.7` → `.5` | Hit@10 `.7` → `.5` | MRR `.7` → `.5` | Casos cujo rank piorou |
| --- | ---: | ---: | ---: | ---: | ---: |
| mem0, 40 casos | 388 | 25/40 (62,5%) → 25/40 (62,5%) | 33/40 (82,5%) → 33/40 (82,5%) | 0,6020 → 0,6063 | 0 |
| Plandex, 39 casos | 610 | 26/39 (66,7%) → 27/39 (69,2%) | 31/39 (79,5%) → 31/39 (79,5%) | 0,5637 → 0,5659 | 0 |

Nenhum caso caiu para fora do top 3 ou top 10. Cinco casos melhoraram de posição: mem0 `28` e `33`; Plandex `08`, `26` e `38`. Os casos fora do top 50 ficaram iguais em cada corpus: `mem0-01`, `mem0-39`, `plandex-02`, `plandex-06`, `plandex-20` e `plandex-39`. O artefato ligado abaixo contém rank e top 3 por caso, incluindo os casos que não mudaram.

O tempo foi apenas descritivo, medido em uma execução local: mem0 p50/p95 foi `6,231/10,977 ms` com `.7` e `6,216/10,739 ms` com `.5`; Plandex foi `6,606/9,433 ms` e `6,529/9,373 ms`. Não infiro ganho ou ausência de ruído a partir dessa diferença.

## Gates do BBrainX

O prior `.5` também passa os gates atuais no Node `24.21.0`. No corpus local de 239 arquivos (snapshot `8fbab13887ca2f300fa32542dfa2adbae7ea1e218265fdd4f9c89da34821eaa2`), `eval-natural` passou de hit@3 `21/36` para `25/36`, mantendo hit@10 `31/36`; os limiares são `0,6` e `0,85`. `eval-self` manteve identificadores em hit@1 `12/12` e consultas de palavras em hit@3 `5/5`; o MRR total subiu de `0,8157` para `0,8657`, acima do limite `0,6`.

Comandos focados executados após a alteração:

```sh
/opt/homebrew/opt/node@24/bin/node --test --test-name-pattern='natural-language retrieval over this repository' test/godmode.test.mjs
/opt/homebrew/opt/node@24/bin/node --test --test-name-pattern='labeled retrieval over this repository keeps a minimum quality' test/turbo.test.mjs
```

Os dois passaram. Não rodei a suíte completa nem build nesta validação.

## Limites da evidência

O commit pinado do mem0 não contém `openmemory/` na árvore Git. Os casos cegos apontam arquivos em `mem0/` e `mem0-ts/`, e não esperam caminhos de OpenMemory; por isso medi esses dois diretórios. O repositório separado OpenMemory não tem uma revisão pinada em `EVALUATION.md`, então não afirmo que este resultado reproduz o corpus histórico que talvez o incluísse. A comparação é válida para os dois diretórios no commit declarado.

Baixei somente os arquivos dos dois commits públicos; não instalei dependências nem executei programas, testes ou scripts dos projetos indexados. O arquivo [retrieval-validation-2026-10-08.json](retrieval-validation-2026-10-08.json) guarda somente identificadores de casos, paths esperados e top 3, ranks, agregados, tempos e hashes; não contém o texto-fonte dos projetos. O candidato `.5` não regrediu os dois conjuntos cegos medidos e passou os gates locais sem alterar os golds ou limiares.

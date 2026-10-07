# BBrainX — Reuso Verificável, MCP e Memória

**Rodada de pesquisa: 7 de outubro de 2026.** Entrega independente, para revisão e experimentação. Não é release do BBrainX, não foi publicada no GitHub nesta rodada e não altera o runtime existente.

O repositório foi consultado pelo conector GitHub: `main` em `a9636e9402e3fa673ae05b3489202da1048aef5e`; PR #10 aberto, sem merge, head `9e8424cbc95e2d80cdab25c970bdd216aba3f720`. CI anterior desse PR não valida este laboratório. Não incorporamos implicitamente Atlas, MEDIUM/replay, Observatory ou patches Laya.

## Tese da entrega

Reutilizar uma computação exige provar a validade das dependências conhecidas, e não apenas encontrar uma pergunta parecida. A palavra “memória” cobre objetos diferentes: fonte canônica, materialização de contexto, estado do workflow, cache de resultado, ativações KV e parâmetros aprendidos.

O laboratório implementa cache exato por escopo, com revisões de autorização, dependências versionadas, invalidação seletiva, verificação antes da publicação, limites e resultados copiados. Ele não valida a verdade do conteúdo, a completude das dependências fornecidas, identidade de usuários ou execução de modelos.

## Conteúdo

- `docs/ESTUDO.md`: revisão dos grupos MCP, agentes, workflows, pesquisas Meta, inferência, cache e observabilidade; hipóteses e decisões propostas.
- `docs/MATRIZ_CIENTIFICA.md`: confronto entre os resumos enviados e as fontes primárias, sem reclassificar hipótese como resultado.
- `docs/CONTRATO_DO_LABORATORIO.md`: API, invariantes, custos assintóticos, ameaças, limites e evidência.
- `docs/PLANO_MEDIUM.md`: gates de integração, avaliação causal, falhas e coexistência com trabalho do usuário.
- `docs/FONTES.md` e `sources.json`: fontes consultadas e escopo da leitura.
- `lab/`: implementação e testes executáveis com Node e módulos nativos.
- `evidence/`: resultados reproduzíveis desta execução local; nenhum banco ou transcript de projeto particular.

## Executar

Ambiente efetivamente testado: **Node v22.16.0, Linux x64**. Não há dependências npm, modelo, navegador ou rede necessários ao laboratório.

```sh
node lab/example.mjs
node --test --test-reporter=tap lab/witness-cache.test.mjs
node lab/verify.mjs
```

`verify.mjs` reexecuta 34 testes, quatro controles negativos em cópias temporárias isoladas e o experimento de invalidação. Recusa zero testes, falhas, skips ou cancelamentos. Os negativos alteram apenas arquivos que o script criou na pasta temporária; a implementação original permanece intacta. O script não lê repositórios do usuário e não executa comandos Git.

Resultado observado: **34/34 testes; quatro regressões injetadas detectadas; 1.296 sequências enumeradas com 1.728 leituras comparadas ao cálculo frio**. Um experimento separado conservou 99 artefatos independentes após uma mudança, invalidando o artefato afetado e uma busca cujo universo de candidatos mudou. Isso não é 99% de acerto de agentes, ganho de faturamento ou benchmark MEDIUM.

## Limites não negociáveis

Não há daemon, watcher, persistência, integração Redis, autenticação, criptografia de dados, revisão de modelo, sandbox ou cache KV. A API de grants representa estado fornecido pelo host confiável; ela não autentica um principal. O processo que detém o objeto pode administrar o cache. Não o exponha diretamente a plugins não confiáveis.

Os limites de bytes são de payload + identidade serializada, não limites de RSS. A enumeração finita não é prova formal de todas as execuções. Há expiração monotônica e cache descartável; um restart elimina os dados. O plano de integração com o BBrainX precisa resolver atomicidade entre banco, filesystem, permissões, cancelamento e entrega.

Não copiamos código, pesos ou PDFs dos projetos pesquisados. Os documentos trazem fontes e análise própria. Licenças de frameworks, código de pesquisa, modelos e datasets devem ser examinadas separadamente antes de uma incorporação.

# Experimentos preservados — não habilitados no runtime

Publicados pela PR de consolidação de 07/10/2026. Os READMEs e relatórios internos preservam o estado da rodada original, inclusive `githubPublished:false`: isso não descreve a localização atual do arquivo, e sim a ausência de publicação naquela primeira entrega. Resultados novos ficam nos artefatos da CI consolidada, separados dos históricos.

## WitnessCache

[Estudo e execução](witness-cache/README.md). Cache exato com testemunho de dependências num único isolate Node; não é autenticação, KV cache, persistência ou cache já ligado ao BBrainX. Na rodada original: 34 testes, quatro controles negativos e enumeração finita de 1.296 sequências. A CI desta PR deve reexecutar o experimento em uma cópia temporária para não alterar evidências históricas.

## Protocolo de consistência e desempenho

[Estudo e execução](consistency-protocol/README.md). Implementações de referência e verificações de invariantes em Python. São modelos delimitados, não implantação SuperTokens/Infisical/Medusa/SigNoz/Unkey nem prova ilimitada de segurança do core. Seus testes e relatórios possuem escopo próprio.

## Candidato worker/cache Laya X99

A trilha histórica fica em `docs/research/history/laya-x99`. Ela foi criada contra a revisão `a9636e9`, antes das lanes e dos ports de publicação de memória. Não aplicar cegamente seu compilador sobre a combinação atual. O código permanece candidato de revisão, não uma configuração ativada.

Nenhum experimento é importado automaticamente por `src/`, nenhuma instalação de modelo é iniciada e nenhuma configuração do harness é alterada por manter esses arquivos no repositório. Aprovação de uma hipótese exige um gate separado da preservação documental.

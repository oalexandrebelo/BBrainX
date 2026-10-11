# Regressões e decisões da consolidação

## Primeira composição, `0eee843b`

A suíte conjunta executou 278 testes; 277 passaram. O gate de recuperação em linguagem natural no próprio repositório falhou com hit@3 de 0,5833, abaixo do piso de 0,60. Não baixamos o piso, não apagamos o teste e não transformamos o resultado em aprovação.

O acervo de auditoria contém logs, consultas, cópias de diffs e versões anteriores de código. Misturá-lo ao índice do produto faz exemplos históricos disputarem a mesma pergunta com o código vigente. Ele deve continuar consultável como pesquisa, mas não representar automaticamente o runtime atual.

A consolidação passou a guardar o acervo completo em `docs/artifacts/auditorias/`, com os blobs originais inalterados, e laboratórios em `experiments/artifacts/`. `artifacts` já era uma exclusão explícita de produção no indexador antes desta rodada. Não alteramos o código de ranking ou filtros para fabricar uma exceção exclusiva ao teste. O índice mestre e os pointers permanecem na documentação corrente, e o catálogo documental inclui também esses arquivos.

A preservação como artefato não corrige a capacidade geral de busca semântica. É uma separação explícita entre corpus operacional e evidência histórica. O resultado da suíte seguinte deve ser lido com esse escopo, não anunciado como melhoria do algoritmo. Para pesquisar o acervo em separado, extraia uma cópia intencional como projeto de pesquisa; nunca o confunda com a worktree que será modificada.

Novos testes verificam que a exclusão é a política já aplicada a artefatos e que a documentação operacional continua elegível. As métricas antigas e o log da primeira composição permanecem vinculados àquela revisão.

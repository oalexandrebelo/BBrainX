# Plano de implementação e validação

## Referência fixa

`github/spec-kit@0443760542e7e5269724744a2ac55c4bd386d095`, versão declarada `1.1.4.dev0`. A referência é de código e método, não dependência instalada. Leitura focal de README, guias, `templates/commands/converge.md`, `scripts/python/common.py` e `pyproject.toml`. CLI, modelos e agentes upstream não foram executados.

## Camadas preservadas

```text
Spec Kit / arquivos de intenção
    ↓ seleção explícita, nenhuma instrução executada
spec-evidence: captura, mapa de requisitos, recibos
    ↓ relatório somente leitura
revisão humana / processo de promoção independente

Harness A → lane A ┐
                  ├→ memória governada e admissão existentes
Harness B → lane B ┘
```

A constituição do workflow não substitui as regras do host. `memory_propose` continua proposta; não criar autoaprovação. Nenhuma nova tool MCP foi adicionada.

## Intervenções

1. `sqlite-init.mjs`: verificar modo atual e repetir apenas a etapa PRAGMA idempotente em SQLITE_BUSY/LOCKED. Temporariamente desabilitar o busy handler para não multiplicar waits; restaurá-lo no fim. Espera síncrona de bootstrap com jitter limitado, não um scheduler universal.
2. `shared-admission.mjs`: uma chamada de lstat com ausência opcional apenas para sidecars. O arquivo canônico continua obrigatório.
3. `store.mjs`: checar `isTransaction` antes de rollback e preservar a exceção original. Uma falha secundária de cleanup tenta fechar a conexão, sem repetir a mutação.
4. `spec-evidence.mjs` e CLI: leitura limitada e sem links, tasks identificadas, mapa explícito de requisitos, digest escopado, receipts vinculados à revisão e conferência de logs. Saída nunca concede publicação.

## Paralelismo e feature ativa

Na referência upstream, `.specify/feature.json` é estado de seleção, não derivação de Git HEAD. O host deve usar `SPECIFY_INIT_DIR`, `SPECIFY_FEATURE_DIRECTORY` e `SPECIFY_FEATURE_NO_PERSIST=1` por processo ao usar scripts Spec Kit. A ponte BBrainX recebe root/feature/project/lane explicitamente e ignora essas variáveis e esse arquivo. Não executar `integration switch` na mesma worktree enquanto outro harness trabalha.

## Não escopo

Sem JIT de schemas, isolated-vm, Saga distribuída, eBPF, novo grafo, treinamento, fallback de nuvem, REST inventado ou mudança da política de busca. Não proclamar que Spec Kit resolve race conditions, testa automaticamente todos os requisitos ou prova semântica de código.

## Oráculos

Repetir a matriz original de 1.000 aberturas e os dois braços de quota SQLite. Preservar resultado da base. Rodar testes novos de limites/erros e ponte, toda a suíte do projeto, assurance externa, restauração fria e build. Mutantes precisam falhar por assertion, não por importação/sintaxe. Instalação, navegador e native têm receipts separados e permanecem bloqueados quando não observados.

## Isolamento da ferramenta de desenvolvimento

A primeira combinação contendo a ponte em src/ e uma nova constituição na raiz reprovou o piso de recuperação lexical do próprio repositório (hit@3 21/36, hit@10 30/36). Esse negativo permanece no dossiê. Não alteramos as perguntas, gabaritos, pesos, pisos ou o buscador para absorver a regressão. A ponte é distribuída como companion externo e opcional, com seu próprio código e testes; não entra no runtime ou corpus padrão do produto. A especificação da correção permanece em docs/artifacts, segundo a política já existente para evidências e pesquisas. Isto é uma decisão de empacotamento e não uma alegação de melhora do buscador. Projetos que importarem templates devem avaliar sua própria política de contexto.

A revisão também moveu o helper de rollback para sqlite-init.mjs, mantendo a disposição dos métodos de domínio de store.mjs. A inclusão de linhas no bloco transacional havia alterado os limites dos chunks fixos de 60 linhas e reprovado novamente o piso local. A solução não alterou o algoritmo, corpus de gabarito ou expectativas: preservou o layout dos métodos não relacionados à correção. Os dois negativos intermediários permanecem nas evidências.

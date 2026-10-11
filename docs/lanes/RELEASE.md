# Candidato: Parallel Workspace Lanes

Não é nova release tag nem merge na main. A extensão está empilhada sobre o PR #10. O esquema `brain.sqlite` permanece na versão 2. O novo registro `lanes-v1.sqlite` e os bancos privados de cada lane são criados apenas ao usar os comandos opcionais.

## Novas superfícies

- `scripts/lanes.mjs`: register, list, config, mcp, close.
- `LaneRegistry` e `LaneStore`: mesma memória aprovada, checkpoints/índices independentes.
- `startLaneHttpServer`: listener Node cooperativo com porta efêmera realmente aberta e geração no registry.
- Nove targets de fragmentos de configuração; nenhuma edição automática de configuração.
- Testes com processos MCP e servidores reais, controle negativo e pacote de evidências.

## Contratos

Ferramentas e nomes MCP permanecem seis. Quando servido por lane, o resultado bem-sucedido recebe `data.workspace` e o pacote inclui a identidade da workspace em seu orçamento. Um argumento `lane` enviado pelo modelo não troca a vinculação. A ferramenta normal sem lane continua a atender a raiz original.

`SHARED_MEMORY_CHANGED` recusa pacote cuja revisão de memórias aprovadas mudou antes da publicação. Dentro de um processo, as chamadas paralelas de um harness (Claude Code emite várias ferramentas ao mesmo tempo) entram numa fila FIFO limitada: uma operação por vez, na ordem de chegada, até 8 chamadas admitidas (em execução + esperando; é o `maxInFlightCalls` padrão do handler MCP, então o handler recusa a 9.ª com `MCP_BUSY` antes da lane). Cancelamento (`AbortSignal`) de uma chamada que espera a retira da fila sem executá-la; uma espera nunca passa de 30 s. `LANE_BUSY` agora só recusa o que excede esses limites (fila cheia ou espera esgotada) e é repetível; antes recusava qualquer sobreposição, o que custava um turno do modelo por chamada paralela. A mudança de contrato está em `bindLaneEngine` (`LANE_QUEUE_DEPTH`, `LANE_QUEUE_WAIT_MS`); escritas continuam estritamente serializadas. `LANE_NOT_ACTIVE` bloqueia novos acessos após fechamento. `SERVICE_OUTCOME_UNKNOWN_OR_ACTIVE` impede reuso cego de serviço ainda registrado como vivo/incipiente. IDs de lanes não são reciclados nesta versão.

Uma lane fechada mantém dados e arquivos. Nenhum processo é morto por nome, porta ou PID encontrado. O SDK não substitui sandbox, supervisor de processos arbitrários ou orchestrator distribuído. O fechamento abrupto precisa de reconciliação administrativa futura com ownership verificável.

## Integração

A abertura de schema atual usa snapshot de leitura, seguindo a correção previamente estudada no PR #8; os perfis/replay daquele PR não foram incorporados. `src/context.mjs` também muda no PR #9: preservar sua instrumentação quando os PRs forem combinados. Antes de promover a versão integrada, executar todas as suítes da combinação.

O novo código não carrega Laya ou duplica seus pesos. Não implementa worker de modelos compartilhado, KV entre provedores, egress proxy, containers, clusters ou sincronização de arquivos em nuvem. Esses recursos permanecem em suas respectivas trilhas de arquitetura.

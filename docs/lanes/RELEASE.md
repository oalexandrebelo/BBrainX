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

`SHARED_MEMORY_CHANGED` recusa pacote cuja revisão de memórias aprovadas mudou antes da publicação. `LANE_BUSY` recusa sobreposição dentro de um processo. `LANE_NOT_ACTIVE` bloqueia novos acessos após fechamento. `SERVICE_OUTCOME_UNKNOWN_OR_ACTIVE` impede reuso cego de serviço ainda registrado como vivo/incipiente. IDs de lanes não são reciclados nesta versão.

Uma lane fechada mantém dados e arquivos. Nenhum processo é morto por nome, porta ou PID encontrado. O SDK não substitui sandbox, supervisor de processos arbitrários ou orchestrator distribuído. O fechamento abrupto precisa de reconciliação administrativa futura com ownership verificável.

## Integração

A abertura de schema atual usa snapshot de leitura, seguindo a correção previamente estudada no PR #8; os perfis/replay daquele PR não foram incorporados. `src/context.mjs` também muda no PR #9: preservar sua instrumentação quando os PRs forem combinados. Antes de promover a versão integrada, executar todas as suítes da combinação.

O novo código não carrega Laya ou duplica seus pesos. Não implementa worker de modelos compartilhado, KV entre provedores, egress proxy, containers, clusters ou sincronização de arquivos em nuvem. Esses recursos permanecem em suas respectivas trilhas de arquitetura.

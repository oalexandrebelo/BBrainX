# Rodada 1 — inventário completo do Invokta e fronteiras reutilizáveis

Consulta em 08/10/2026, revisão `f1e2f04f98c967ab4bb73bd02c3fa581f04ce0e5`. Todos os dez `package.json` foram lidos; fontes e testes dos mecanismos abaixo foram inspecionados de forma focal. Não é auditoria integral de todas as linhas, não executa a suíte do Invokta e não certifica todas as dependências. O snapshot textual e seu manifesto de hashes estão no artefato de referências da CI inicial.

## Matriz 10/10

| Pacote (todos em 0.9.0 nesta revisão) | Contrato observado | BBrainX antes | Decisão da rodada |
|---|---|---|---|
| `@invokta/core` | Standard Schema, execução, composição com procedência, seleção/rename, conectores com config síncrona | Motor próprio, mas sem composição de bibliotecas | Composição explícita adicionada ao motor próprio. Não reintroduzir dependência de runtime. Conectores arbitrários permanecem fora do core. |
| `@invokta/cli` | list/describe/run, principal obrigatório do host, entrada UTF-8, código de saída | Comandos específicos do produto; sem adapter CLI reutilizável do mesmo catálogo | Adapter CLI com stdin limitado, deadline e saída observada. Usa `engine.invoke`, inclusive em lane. |
| `@invokta/mcp` | stdio, Streamable HTTP stateless, client facade e OAuth efêmero; SDK isolado | MCP stdio próprio e testes com SDK oficial | Não confundir nosso painel HTTP com MCP HTTP. Manter stdio no core; servidor remoto só com contrato de autenticação, destino e clientes medidos. |
| `@invokta/installer` | planejamento por propriedade, snapshots de configuração, locks e mutações reconciliadas; registro produtivo ainda vazio | Fragmentos que não editam o harness | Conservar modo somente impressão. Uma edição automática futura deverá ser cirúrgica e reversível; não instalar agora um segundo gerenciador de configurações. |
| `@invokta/devtools` | diagnóstico, watch e comparação por adapters; captura limitada | Painel de contexto/Atlas/Observatory | Acrescentar paridade Direct/CLI/MCP nos testes. Não copiar captura de argumentos sensíveis para a telemetria padrão. |
| `@invokta/deploy` | plano puro de scaffold, empacotamento HTTP, probes e inspeção OAuth | Empacotamento de fonte, doctor, listener local | Separar liveness, readiness e prova funcional. Container/HTTP remoto permanece perfil proposto, não dependência MEDIUM. |
| `create-invokta-engine` | perfis, exemplo GitHub público, OpenAPI 3.1 local, confirmação e rollback restrito | Nenhum criador genérico de engine | Não gerar wrappers HTTP de qualquer OpenAPI como se fossem capacidades já autorizadas. Gerador completo é backlog com gates abaixo. |
| `create-invokta-capability` | pacote atômico de capacidade, teste por invoke e instruções compartilhadas | Capacidade própria declarada diretamente | Bibliotecas explícitas já podem exportar uma única capacidade. Não publicar novo pacote npm sem pipeline de distribuição. |
| `create-invokta-capability-library` | conjunto relacionado com seleção/remapeamento | Ausente | Suporte de biblioteca versionada, seleção e rename implementado; scaffold de arquivos e instalação continuam distintos. |
| `@invokta/tooling` | gates de composição e de colisão de nome MCP sem executar ação | Colisão MCP só na construção do catálogo | Testes novos exigem falha na composição e distinguem colisão de ID da colisão de ferramenta. CLI descreve o contrato efetivo. |

As dependências observadas confirmam separação de responsabilidade: core usa Standard Schema; CLI depende de core; MCP concentra o SDK; tooling é de desenvolvimento; deploy e os criadores atômicos não carregam um framework generativo. O criador de engine agrega deploy, tar e YAML. O installer usa parsers específicos para preservar formatos. A contagem de pacotes não mede por si só latência ou qualidade.

## O documento Action Engines muda o critério de comparação

`docs/action-engines.md` define uma fronteira de resultado de domínio independente de framework, linguagem, modelo e MCP. Essa definição não obriga que o Invokta selecione ferramentas por um LLM, nem diz que todo request usa modelo. Logo, a tabela recebida que atribui 1,2–3,5 segundos obrigatórios ao Invokta não corresponde ao seu contrato. O custo do handler pertence à implementação da capacidade.

A hipótese correta a medir é a mesma capacidade e os mesmos dados através de Direct, CLI e MCP. Não comparar uma resposta constante local com uma geração remota complexa e chamar a diferença de aceleração do framework.

A revisão pesquisada também afirma explicitamente que MCP HTTP é **stateless**. Não documentamos retenção de sessão como novidade confirmada. A busca textual no snapshot não encontrou `@dotcontext/harness`, PREVC, `required_sensors` ou `execution_evidence`; essa alegação do material recebido não foi estabelecida pelo repositório pesquisado.

## Composição implementada

`composeCapabilityLibraries` recebe seleção explícita do host, biblioteca com nome/versão, include e rename. Constrói uma tabela final e conserva procedência. Não há pesquisa de pacotes, importação automática de ESM, execução de fábrica, download ou autorização derivada da descoberta.

A ordem das declarações é mantida. Ordenar nomes de opções de um modelo ou reordenar schemas para aumentar cache pode alterar a semântica; a composição não faz esse tipo de transformação. Duplicatas de ID são recusadas antes de construir os schemas do engine. Duplicatas de nome MCP continuam recusadas pelo catálogo do transporte: `a.b` e `a_b` são IDs distintos, mas colidem depois da transformação do nome.

Os descritores aceitam somente registros ordinários com propriedades de dados. Proxies e accessors são recusados, inclusive nos arrays de seleção. O objetivo é que ler um manifesto não execute um getter ou obtenha valores diferentes em cada leitura. Isso não torna um módulo JavaScript não confiável seguro: importar um módulo ainda executa seu top-level. Os schemas e handlers são código do host e exigem revisão.

O snapshot conserva os handlers capturados, mas não congela a closure de uma função nem transforma objetos internos de schemas em memória protegida. O engine continua validando a chamada e sua autorização; importação de biblioteca não amplia o projeto permitido. Selecionar uma capacidade `authenticated` e chamá-la sem principal continua dando `UNAUTHENTICATED`.

Limites: até 64 bibliotecas e 4096 capacidades, IDs portáveis de até 128 caracteres no caminho de composição. Esses são tetos defensivos, não benchmark de 4096 ferramentas em todos os modelos. A preparação usa trabalho proporcional às declarações e metadados; não ocorre inferência. A proveniência exposta é metadado declarado, não assinatura da origem do pacote.

## CLI implementado

`runEngineCli` é um adapter do mesmo motor. `list` e `describe` não leem stdin. `run ID --stdin` evita argumentos JSON na linha de processo e possui limite de bytes e de espera. UTF-8 inválido é recusado, em vez de substituído por caracteres de reposição que poderiam modificar o sentido do input.

A identidade é capturada antes de esperar pela entrada. O JSON não contém um mecanismo para trocar de principal. A saída aguarda o callback de escrita: terminar `engine.invoke` não basta se o destino ainda não recebeu os bytes. Falha de escrita não retorna sucesso. Campos detalhados de validação de terceiros não são impressos nos erros desse adapter, porque podem incorporar fragmentos de input.

O CLI completo do produto é `scripts/capabilities.mjs --project ID [--lane ID] list|describe ID|run ID --stdin`. O wrapper só constrói o engine BBrainX conhecido e o store autorizado; não recebe caminho de módulo para importar. O modo de lane usa o mesmo `bindLaneEngine`. A abertura de um BrainStore pode criar/validar seu estado conforme o contrato existente; `list` não implica que nenhum arquivo de estado seja aberto.

Não adicionamos ferramenta de aprovação, shell ou autoexecução. O prazo do CLI cancela a invocação cooperativa, não preempta trabalho síncrono em JavaScript. O broker de inferência recebe tratamento separado na próxima rodada.

## Viabilidade das lacunas que não justificam instalação imediata

**Criadores de engine/capacidade.** Viáveis quando houver uma API de extensão estável e distribuição versionada. Gate: plano completo antes de escrita, destino ausente/vazio, componentes sem symlink, escrita exclusiva, rollback só dos arquivos possuídos, ausência de scripts de install implícitos, exemplos sem credenciais e duas formas reais de invocação. Gerar dez arquivos vazios não fecha essa lacuna. Os primitives de composição e CLI entregues são pré-requisitos úteis sem simular um CLI publicável no npm.

**OpenAPI.** A análise do criador mostra conectores privados e ports estreitos. A transferência correta é manter a credencial no conector, validar resposta externa e explicitar operações não suportadas. Nosso primeiro importador deveria produzir um plano de seleção, não automaticamente expor DELETE/POST a agentes. Autorização local e autenticação do upstream são controles distintos.

**Instalação no harness.** A mudança de uma seção MCP deve preservar edições concorrentes e campos vizinhos. Uma cópia de backup integral restaurada depois pode apagar mudanças do usuário. Usar hash/identidade da seção, snapshot do arquivo, lock curto e inverse patch por propriedade. Não tratar pasta como permissão suficiente; observar a identidade do arquivo aberto. Mantemos o gerador em modo de impressão até existir essa prova por formato/plataforma.

**Deploy HTTP.** Um probe que recebe HTTP 200 comprova pouco. O endpoint de liveness prova processo; readiness depende de schema, store e modelo opcional pronto; prova funcional deve fazer descoberta e chamada não destrutiva na revisão declarada. O `probe-contract.ts` do Invokta centraliza versão e timeout usados também pelo healthcheck gerado. Aplicamos essa disciplina aos recibos da rodada 3, sem abrir porta pública.

**Devtools.** A comparação de adapters é uma técnica útil. A interface deles também captura corpos para diagnóstico local; no BBrainX isso é opt-in e não deve entrar em relatório público. Nosso ganho imediato é a suíte de paridade e o CLI de catálogo, não duplicar outro dashboard.

## Evidência desta rodada

21 testes novos executados localmente em Node 22.16/Linux, com domínio determinístico real, streams Node e processo CLI real. O runtime suportado continua sendo o do BBrainX; a CI Node 24 reexecuta esses casos e toda a suíte. Casos incluem colisões, seleção ausente, getters, proxies, alias de transporte, cópia de principal, saída assíncrona, erro de escrita, stdin infinito, UTF-8 inválido e invocação Direct/MCP.

O fixture é uma capacidade de contagem de codepoints sob Standard Schema, não uma simulação de LLM. Tempo desses testes não é latência de inferência ou ganho de uso real. Nenhuma fonte upstream foi executada nem incorporada como dependência.

## Fontes fixadas

Base de todos os caminhos: `https://github.com/vinilana/invokta/tree/f1e2f04f98c967ab4bb73bd02c3fa581f04ce0e5`.

- `docs/action-engines.md`; `packages/*/package.json` (todos os dez).
- `packages/core/src/{composition,connector,engine,schema}.ts` e testes de composição/conectores.
- `packages/cli/src/{index,stdin}.ts`; `packages/tooling/src/check-capabilities.ts`.
- `packages/mcp/README.md`, `src/http.ts`, `src/client.ts`, `src/tool-name.ts`.
- `packages/create-invokta-engine/README.md`, `src/openapi.ts`, `src/scaffold.ts`.
- READMEs, starter e scaffold dos dois criadores de capabilities.
- `packages/deploy/src/probe-contract.ts`, `src/generate/write.ts` e README.
- `packages/installer/src/mutation-coordinator.ts`, `src/ownership-planner.ts`, `src/path-identity.ts` e `registry/README.md`.
- `packages/devtools/README.md`, `src/trace-store.ts`, `src/engine-host.ts`.

Não foram feitas alegações de superioridade universal, latência submilissegundo, eliminação de prompt injection ou compatibilidade integral entre SDKs.

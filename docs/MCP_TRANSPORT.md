# MCP stdio — contrato de fluxo State 03B

A superfície de seis ferramentas e a autoridade de projeto não mudam. `bin/bbrainx.mjs mcp` e `scripts/lanes.mjs ... mcp` utilizam o transporte endurecido por padrão. Não há instalação de modelo, alteração de credencial ou configuração automática de harness.

## Limites do host por conexão

| Opção | Padrão | Objeto limitado |
|---|---:|---|
| `maxInFlightCalls` | 8 | Promessas de `engine.invoke` ainda não concluídas |
| `rateLimit.calls` / `perMs` | 300 / 60000 | Chamadas admitidas na janela exata `(t-perMs,t]` |
| `maxPendingMessages` | 32 | Frames com resposta ainda não totalmente escrita |
| `maxBatchItems` | 32 | Membros do batch legado aceito como extensão de compatibilidade |
| `maxLineBytes` | 1048576 | Bytes de entrada antes do LF; CR conta no limite |
| `maxResponseBytes` | 2097152 | Um frame JSON de saída, incluindo LF |
| `maxOutputBytes` | 4194304 | Frames em espera mais o frame ativo no writer |
| `maxOutputFrames` | 64 | Quantidade de frames retidos no writer |
| `writeTimeoutMs` | 5000 | Idade máxima do frame, contando espera na fila |
| `shutdownMs` | 1500 | Espera de drenagem após EOF/erro |

São políticas defensivas iniciais, não SLOs de inferência. Configurações inválidas são recusadas. Os parâmetros vêm de quem constrói o servidor; argumentos de ferramenta não os alteram. O CLI continua usando os defaults.

`MCP_BUSY` é recusa estruturada de ferramenta: `isError:true`. A chamada recusada não executa e não consome a quota temporal. A leitura de cancelamento continua disponível com todas as vagas de tools ocupadas. Inundação de frames, batch excessivo ou fila de saída cheia encerram a conexão com erro, em vez de gerar uma quantidade ilimitada de respostas de recusa.

## Correlação

Um ID de request é string com até 1024 bytes UTF-8 ou inteiro seguro JavaScript. `0`, `""` e IDs string continuam válidos; `1` e `"1"` são distintos. IDs são retidos desde a admissão até a conclusão da escrita. Reuso sequencial depois da resposta permanece aceito.

Duplicata ainda ativa, inclusive entre métodos diferentes, gera `MCP_DUPLICATE_REQUEST_ID` e encerra a conexão. Não enviamos um segundo resultado com o mesmo ID: ele poderia completar a promessa original no cliente. Duplicatas internas a um batch são detectadas antes de executar qualquer membro.

Cancelamento só alcança a chamada daquele ID naquela conexão. Resposta de chamada ainda em andamento quando cancelada é suprimida. Respostas já concluídas/enfileiradas não são retratáveis. Callback de escrita e `drain` não certificam que o cliente consumiu ou aplicou o resultado.

## Framing e backpressure

Entrada é lida em quanta de até 64 KiB por volta do event loop. O acumulador copia para buffer geométrico e decodifica UTF-8 estrito depois de encontrar LF. Não guarda uma lista ilimitada de fragmentos nem usa substituição silenciosa de bytes inválidos. Cauda incompleta no EOF gera `MCP_INCOMPLETE_FRAME`.

Saída usa uma escrita em voo. Quando `write()` retorna `false`, o próximo frame só é submetido depois de `drain` e do callback de conclusão. O teto inclui o frame ativo. Erro, fechamento inesperado, timeout ou limite excedido cancelam as esperas e a sessão. Um guard sem captura de dados por stream observa erros tardios; listeners por operação são removidos.

`highWaterMark` é um limiar de sinalização, não um limite rígido de memória. O contrato de BBrainX limita seus próprios frames/contadores; não limita buffers do produtor, kernel, strings temporárias de JSON ou RSS. `JSON.stringify` e o handler ainda podem alocar antes de o frame ser recusado. Somente código confiável do host deve implementar o domínio.

## Encerramento

EOF solicita cancelamento dos tools e permite drenar respostas concluídas por até `shutdownMs`. Falhas fatais interrompem a saída imediatamente. Uma promessa não cooperativa não mantém `serveMcpStdio` aguardando indefinidamente: o erro é `MCP_SHUTDOWN_INCOMPLETE`.

Isso não interrompe código JavaScript síncrono, desfaz efeitos externos nem prova a parada de netos ou de um modelo remoto. O relatório retorna `physicalWorkStopped:null`. O motor de capacidades já pode retornar timeout antes de uma operação não cooperativa terminar; a quota de MCP conta as promessas desse motor, não todo trabalho físico escondido por elas. A residência de workers cooperantes continua sob o contrato separado de `SharedAdmission`/`SharedLayaBroker`, quando adotado.

## Resultado operacional

`serveMcpStdio` retorna, ao terminar normalmente, contadores por conexão: frames/bytes, picos de mensagens e IDs, estatísticas de admissão e writer, espera concluída e duração observada. Em erro, a mesma estrutura acompanha `error.report`. Esses metadados não incluem argumentos, textos de prompt, respostas, credenciais ou motivos arbitrários de cancelamento.

Não há telemetria em stdout além de JSON-RPC. O retorno JavaScript do servidor não é uma nova ferramenta MCP nem uma autorização para publicar logs.

## Mudança dos testes legados

O teste de tamanho de linha enviava três pings com ID 1 sem esperar respostas. Seus IDs passaram a 1/2/3; o teste de tamanho permanece igual. Um novo caso verifica reuso sequencial e outro recusa reuso em voo.

O gabarito da pergunta `what stops a client that never sends a newline` foi atualizado de `src/mcp.mjs` para `src/mcp-flow.mjs`, onde o limite e o acumulador agora são implementados. Nenhum piso, peso do ranking ou consulta foi alterado. O resultado anterior à remarcação é preservado no acervo de evidências; isso não é anunciado como ganho do algoritmo de busca.

O ensaio diferencial que executa a implementação antiga e a candidata fica em `test/artifacts/`, fora do corpus operacional pela política de exclusão de `artifacts` que já existia. Ele continua versionado e é executado explicitamente por `mcp-baseline-probe.mjs`. Os novos testes de contrato e o documento operacional continuam indexáveis. Esse isolamento corrige mistura de corpus, não melhora o algoritmo de recuperação.

## Fontes e escopo de compatibilidade

- Node 24.21.0, Streams: https://nodejs.org/download/release/v24.21.0/docs/api/stream.html
- MCP 2025-11-25, stdio/UTF-8: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- MCP 2025-11-25, cancelamento: https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation
- JSON-RPC 2.0: https://www.jsonrpc.org/specification

A revisão moderna 2026-07-28 já existia no produto e seus testes foram preservados. O endpoint web específico consultado para transportes dessa revisão devolveu uma página Overview, insuficiente para uma nova certificação integral de conformidade. Batch é extensão preservada da implementação, não capacidade nova atribuída a todas as revisões oficiais do MCP. Não foram homologadas versões atuais de todas as IDEs por esta alteração.

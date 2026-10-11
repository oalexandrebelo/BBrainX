# State Commit 03B — transporte previsível sob pressão

## Base e intervenção

Base cumulativa local: State 03A `b867262d5e0d355818ac0819924026eff2453eee`, tree `4efa5717d36b91cd17c64d82dbb1c90b8ae2133e`. A recuperação do bundle e a reprodução dos 393 testes anteriores foram executadas nesta rodada. Base remota observada do PR #18: `b8d2c4730b797828244e914675890990eb1f2558`. O transporte daquela revisão é byte-idêntico ao do State 03A.

O objetivo é reduzir estados ambíguos: ID concorrente sobrescrevendo cancelamento, invocações sem teto, fila de stdout crescendo sem observar backpressure, cauda UTF-8 alterada e teardown preso em promessa sem cooperação. Não substituímos a arquitetura de modelo, memória ou índice para tratar um problema de transporte.

O código novo está em `mcp-flow.mjs` e `mcp-transport.mjs`; `mcp.mjs` conserva catálogo, negociação e envelopes. Não acrescenta dependências. Os seis capabilities, o schema de memórias e a allowlist do host continuam iguais.

## Invariantes confrontadas

I1: cada ID ativo na conexão tem exatamente um proprietário; a inscrição sobrevive até a escrita concluir.
I2: a quota de invocações não depende da velocidade com que o cliente envia mais linhas.
I3: cancellation é control-plane, não disputa a mesma vaga de execução da chamada que precisa parar.
I4: recusas não ampliam ocupação da janela temporal.
I5: o writer conta frame ativo e fila, aguarda callback/drain e recusa antes de escrever um frame maior que o limite.
I6: bytes UTF-8 inválidos não se transformam em outro pedido válido por reposição.
I7: encerramento possui espera limitada, mas não declara uma computação física parada sem evidência.

São propriedades de implementação exercitadas por casos e oráculos finitos, não prova de ausência de toda corrida em qualquer extensão do produto.

## Complexidade e otimização

O ring temporal aloca `8*calls` bytes de timestamps uma vez. Cada evento aceito entra uma vez e expira uma vez: O(1) amortizado por evento, com pior caso O(calls) numa expiração em rajada. Não é lookup constante para todas as operações. O índice circular evita movimentar todos os elementos sobreviventes em cada remoção.

O framer tem cópia amortizada O(B) no volume de B bytes, em vez de concatenar prefixos indefinidamente. Crescimento geométrico pode manter simultaneamente buffer antigo e novo por um intervalo, além das strings de decode e JSON. A estrutura não é zero-copy, nem um limite de RSS igual ao tamanho do frame.

O writer mantém uma escrita em voo. Isso aumenta o controle sobre memória e caudas, mas pode reduzir batching implícito do Writable. A comparação de throughput end-to-end não foi inferida de um microbenchmark da janela. A fila é FIFO por resposta concluída, não necessariamente pela ordem de chegada de requests independentes.

## Testes e controles

Há 54 testes novos, incluindo pipes de processos reais, dois clientes com o mesmo ID, oito conexões com 240 chamadas, saída do filho intencionalmente não lida, UTF-8 fragmentado, saída tardia com erro, ID duplicado, EOF com trabalho não cooperativo e limite de batch. O oráculo de janela usa filtragem de lista independente e confronta 60.000 eventos, incluindo fronteiras e rajadas.

Dois probes adicionais, executados separadamente, reprovam por assertions no transporte original e aprovam no candidato: admissão e preservação do alvo de cancelamento. Não são acrescentados à contagem dos testes do runtime. Sete regressões deliberadas foram detectadas por assertions; syntax/import failure não conta como sucesso desses controles.

Um teste de processo inicialmente esperava `close` mantendo stdout pausado no lado do pai. O processo já tinha saído, mas o leitor não drenava o descritor. O teste foi corrigido para observar saída com prazo e drenar a pipe após o experimento. Isso preserva a distinção entre processo, descritor e consumidor, em vez de chamar o travamento do teste de falha do modelo.

O primeiro candidato também não acionava EOF depois de consumir exatamente o último byte via `read(n)`. Acrescentamos `read(0)` na fronteira; a suite legada de framing e os ensaios reais passam. A falha inicial e a correção ficam registradas, sem apresentar somente a primeira execução verde.

## Uma regressão de gabarito, não ganho de ranking

A suite integrada inicialmente retornou 445/446: o gate de busca natural ficou em hit@3=21/36 (0,5833), com a pergunta de framing ainda exigindo `src/mcp.mjs`. O limite havia sido movido a `McpLineBuffer` em `src/mcp-flow.mjs`, recuperado na posição 2. Atualizamos somente o caminho esperado dessa pergunta. Não reduzimos o piso 0,60, o piso hit@10, nem alteramos o buscador. O teste de tamanho de linha também ganhou IDs distintos para não conflitar com o novo teste de correlação.

A contagem final passou a 447 com o acréscimo do stress de oito conexões. O label atualizado documenta uma mudança estrutural; não é comparação de melhoria de qualidade de recuperação em dados novos.

## Leitura crítica dos materiais recebidos

O anexo de Sistema 1 descreve filas SPSC/MPMC e baixa latência de inferência. Esta rodada não valida esses kernels. Uma fila de um produtor/consumidor não se torna um multiplexador seguro entre vários harnesses por usar atomics. Nós mantivemos mensagens JSON-RPC interoperáveis e separação por conexão, antes de considerar IPC especializado.

O outro anexo implementa a suposta inferência TensorRT com `np.random.normal` e uma resposta System Two com espera fixa. Esses trechos são insumos de arquitetura, não dados de desempenho. Não foram executados como benchmarks de Laya. O documento SDD injeta pós-condições após retornos e usa ModuleType/exec no processo corrente; ele não entrou no transporte nem ganhou poder de editar arquivos do projeto.

Fonte dos materiais: anexos recebidos nesta conversa, seções e nomes originais preservados nas análises anteriores. Esta classificação é análise própria desta rodada. Não publicamos os anexos inteiros, conteúdo de terceiros, prompts privados ou alegações de calibração perfeita como se fossem resultados BBrainX.

## Publicação e independência do patch

A alteração MCP não importa SharedAdmission. Pode ser revisada sobre a base remota `b8d2c47`, preservando uma PR pequena e sem reescrever a branch #18. A distribuição cumulativa local inclui State 03A e a nova versão, com 447 testes. A árvore remota sem State 03A terá 396 testes: 342 anteriores + 54 novos. Os 51 testes de SharedAdmission não devem ser atribuídos a uma CI que não contém aquele módulo.

Os hashes e estado efetivo da publicação serão registrados no relatório de entrega. A existência de uma branch ou de um arquivo de workflow não significa CI concluída. O State 03A continua exigindo integração própria no remoto enquanto só existir como bundle nessa linha de trabalho.

## Próxima fronteira

O transporte permanece no event loop: não preempta indexação síncrona, getters de código hostil ou operações externas iniciadas por um handler não cooperativo. O próximo bloco é indexação por geração com preparação fora da transação longa e promoção verificada. Não colocar execução automática de modelo, busca vetorial e daemon global na mesma alteração e perder atribuição das regressões.

## Observação após compor a documentação

A primeira execução com documentação e scripts completos teve 446/447: o piso de recuperação hit@10 caiu para 30/36 (0,8333). A consulta sobre o catálogo encontrou o ensaio diferencial antes de `src/engine.mjs`. O ensaio que alterna código histórico/candidato foi classificado em `test/artifacts/`, seguindo a exclusão operacional já existente, e continua executado explicitamente. Não alteramos pesos/pisos nem ampliamos o gabarito dessa consulta. O documento operacional e todos os testes novos permanecem no corpus. Preservamos o log da falha e os ranks; separar experimento histórico de fonte operacional não é anúncio de melhoria de busca.

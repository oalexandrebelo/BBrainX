# Rodada 2 — lifecycle, limites e observabilidade de execução física

## Diagnóstico fixado na base

Na revisão consolidada `5c462b6`, o broker Laya mantém buffer/pending compartilhados entre gerações. Cada `decide` pode acrescentar trabalho enquanto o processo Python serial ainda executa o anterior. Timeout remove a promessa, não o trabalho em curso; stdout sem newline cresce sem teto. Conferir a latência só até o timeout esconderia a ocupação que permanece depois da resposta de erro.

O objetivo desta rodada não é acelerar uma rede neural sem executá-la. É alinhar admissão, cancelamento e devolução de capacidade com o processo efetivamente criado. Fontes: `src/laya.mjs`, `profiles/laya/worker.py` e documentação oficial Node de ChildProcess (`close`, `exit`, `kill`, `killed`).

## Implementação e estados

`JsonLineWorker` é um canal serial reutilizável. O executável e os argumentos são escolhas do host. Cada geração contém seu child, waiter, buffer, status e promessa de fechamento. Estados: `starting → ready → retiring → closed`. Uma conexão substituta não começa enquanto a anterior não chegar ao fechamento observado. O objeto ChildProcess é a referência de operação, nunca uma busca por nome/porta/PID persistido.

`start` compartilha apenas o handshake em andamento. `request` reserva a admissão antes de esperar o cold start; um segundo pedido recebe BUSY, mesmo que seja idêntico. Não há fila de inferências ou coalescência automática nesta versão. Isso torna a propriedade observável e evita implementar parcialmente cancelamento de múltiplos assinantes. Coalescência futura deve manter cotas e uma vida útil própria de cada consumidor.

A resposta e o timer competem pelo mesmo waiter. O primeiro desarma a espera; uma mensagem precisa trazer o ID atribuído pelo host. Mensagens de outra geração, ID desconhecido, UTF-8 inválido, JSON inválido ou saída sem framing correto recusam a comunicação. Na chegada de uma mensagem, o deadline monotônico também é comparado diretamente: atraso do callback do timer não amplia sua validade.

Timeout e cancelamento aposentam o processo. SIGTERM é seguido de SIGKILL após a graça, quando ainda não houve saída observada. `kill()` não é prova de término. O código registra `exit` para não tentar sinalizar um processo já observado como encerrado, mas conserva a reserva até `close`, que inclui stdio. `stop` aguarda até seu limite; se não observar `close`, mantém a geração como não disponível em vez de proclamar limpeza completa.

O perfil não contém descendentes arbitrários, mounts ou rede. Um processo que cria netos, ou um SO que não encerra um processo preso, exige outro runtime/supervisor. Worktrees e este canal são mecanismos cooperativos, não proteção contra código hostil executado sob o mesmo usuário.

## Memória e complexidade do framing

Em vez de concatenar strings em cada fragmento, o receptor utiliza buffer geométrico limitado. A capacidade cresce até o teto de frame e é reutilizada na próxima mensagem. Isso evita tanto a cópia quadrática de prefixos quanto uma lista gigantesca de fragmentos de um byte. Para B bytes recebidos num frame, as cópias de crescimento somam O(B); decodificação e parse continuam O(B) no volume textual ordinário. O buffer não torna JSON parsing O(1).

O limite padrão do canal é 2 MiB; o adapter Laya restringe request a aproximadamente 1 MiB, além de limites de estados, perguntas e janela. A soma das alocações temporárias no crescimento pode exceder a capacidade final do buffer; não se declara teto de RSS igual ao teto de frame. O produtor já possui seu input antes de invocar o adapter. JSON.stringify também pode alocar antes de a verificação final recusar um pedido; a API local não é um sandbox para getters/closures maliciosos.

Há no máximo uma escrita de pedido pendente nesse canal. Backpressure não vira uma fila de comandos adicionais. O deadline inclui espera pela resposta, e uma falha assíncrona de stdin é observada. O tempo de carga é separado do tempo de inferência; a duração total de uma chamada com falha pode incluir também a drenagem do processo. Nenhum desses campos é a latência real de um modelo não executado.

## Contrato do adapter Laya

`LayaBroker` conserva sua superfície de uso, delegando o transporte a `LayaTransport`. Resultados, ms e informações de runtime permanecem disponíveis. O circuito usa relógio monotônico, abre após três falhas, e recusa de capacidade/cancelamento do usuário não são contabilizados como falhas neurais. O circuito não é bypassado por `stop`.

A resposta exige quantidade de linhas compatível com estados e questões, valores numéricos finitos e dados de uso coerentes. Choice valida conjunto de alternativas e distribuição; score verifica domínio, normalização e expectativa. A tolerância numérica é do contrato de transporte, não um critério de qualidade/calibração. Compatibilidade de q:{} nos probes antigos continua explícita; questões sem tipo ainda são responsabilidade do modelo chamado, não uma declaração de schema neural correto.

Uso ausente não vira zero. A ponte Python mantém `null` para contagens/truncamento desconhecidos, recusa linhas maiores que 1 MiB e limita rows×maxLen antes do `predict_batch`. A janela omitida agora é explicitamente 1024 no protocolo, em vez de depender de um default implícito da biblioteca; isso é limite de admissão que deve entrar na homologação do modelo. Não houve troca de checkpoint ou versão Laya.

Os arquivos pequenos imutáveis do perfil entram na lista de hashes conferidos na carga, além de tokenizer/pesos grandes. `tokenizer_config.json` permanece a exceção já documentada de reescrita da biblioteca. Downloads usam temporários exclusivos por tentativa. Duas transferências dos mesmos bytes não compartilham um `.partial`. Isso não resolve a instalação simultânea no mesmo venv; seu lock/staging continua uma lacuna distinta.

## Falhas encontradas na própria rodada 1

A revisão adversarial encontrou que consultar rename por indexação ordinária herdava `constructor`/`toString` de Object.prototype. A correção usa `Object.hasOwn`, e um teste invoca os dois nomes como capacidades reais. Não se resolveu apenas proibindo mais IDs.

Também foi exercitada falha de Writable posterior ao timeout da CLI. Uma escrita já enfileirada pode emitir erro depois que o chamador retornou. O adapter conserva um guard sem captura de dados por stream via WeakSet, enquanto listeners por operação são retirados ao concluir. Não cria um listener permanente por chamada. O erro tardio não derruba o processo nem vira sucesso; bytes já submetidos à escrita não são retratáveis.

## Verificações executadas e não executadas

21 novos testes do worker e 2 novos testes da revisão de composição/CLI foram executados em Node22.16/Linux, usando processos e pipes reais, entradas malformadas, Unicode fragmentado, timeout, aborto, restart, saída inconsistente e downloads de conteúdo de teste. Esses testes não medem um modelo: o produtor de falhas está rotulado como tal. A bateria conjunta local soma 44 casos (23 da rodada 1/revisão +21 do worker).

O Node da conversa é inferior à versão suportada pelo produto. A aprovação de distribuição exige a CI com Node24 e os sistemas que ela efetivamente executar. A ponte Python foi inspecionada e validada sintaticamente, não carregada com pesos. Não declarar tempo de encoder, tokens de provider, diminuição de RSS neural, qualidade de decisão ou homologação de todos os harnesses.

## Oportunidades seguintes com critérios concretos

O próximo ganho de memória entre harnesses seria um daemon opcional por usuário, com um backend por perfil e admissão global. O canal atual é por processo BBrainX; duas instâncias ainda podem carregar modelos separados. A proposta só passa a feature depois de testar identidade de conexão, cancelamento de assinantes, fontes/revisões por lane e reconexão após suspensão no Mac.

Cache exato e batching entram depois. Uma resposta typed não é necessariamente deterministicamente correta; o cache precisa de modelo/tokenizer/calibração/estado e revisão. O batch só agrega contratos compatíveis e precisa medir padding e latência da espera. O menor tempo neural isolado não justifica uma fila que compromete a estação MEDIUM.

Fonte Node consultada: https://nodejs.org/download/release/v22.23.3/docs/api/child_process.html. As diferenças entre close, exit, killed e sinalização foram verificadas; o projeto continua testando o Node recomendado na CI, não nessa página de documentação por si só.

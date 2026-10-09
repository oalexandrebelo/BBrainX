# Correção de portabilidade — stdout síncrono no Windows

## Evidência negativa

Run `37889656372`, head `375049b087b0b9961d5368b496fe9d55caa1f80d`: Ubuntu e macOS passaram. Windows retornou 395/396 no runtime e 53/54 em cada uma das cinco repetições. O caso que falhou cria um processo real, deixa o leitor de stdout parado e exige timeout de escrita. Não houve skip nem ajuste do critério para passar.

## Causa

Node24.21 documenta a escrita de process.stdout em pipe como síncrona no Windows. A leitura do fonte lib/net.js confirma a seleção desse caminho para fd1/fd2. Com o consumidor parado, a chamada de sistema bloqueia o event loop; um timer JavaScript não pode interrompê-la. O comportamento não foi chamado de flakiness de CI.

## Correção aplicada

Somente quando o destino é o próprio process.stdout não-TTY no Windows, serveBoundedStdio cria um fs.WriteStream assíncrono sobre o descritor herdado, com autoClose:false. Custom Writable e o comportamento POSIX permanecem intactos. Nenhum método privado de process.stdout, binding nativo ou alteração global de runtime foi utilizado.

O escritor continua exclusivo, limitado a um frame em voo, com callback/drain, orçamento e prazo absoluto da fila. O teste original permanece habilitado em todos os sistemas; sua finalidade é justamente confrontar a fronteira nativa, não um Writable simulado.

## Limite que permanece

Cancelar a espera do protocolo não cancela necessariamente uma chamada de escrita já iniciada no thread pool. Se o leitor nunca drena nem fecha, esse trabalho físico pode continuar ocupado. O host precisa supervisionar o processo e observar exit/close. Não há promessa de hard real-time, encerramento de netos ou de rollback de bytes já enviados. O relatório mantém physicalWorkStopped:null.

Por isso o teste aguarda o aviso de timeout pelo canal IPC separado, só depois volta a drenar o pipe e observa o término. Não preenchemos uso de recurso desconhecido com zero e não devolvemos uma reserva SharedAdmission com base apenas nesse timeout.

## Fontes primárias

https://nodejs.org/download/release/v24.21.0/docs/api/process.html#a-note-on-process-io
https://github.com/nodejs/node/blob/v24.21.0/lib/net.js
https://nodejs.org/download/release/v24.21.0/docs/api/fs.html#fscreatewritestreampath-options

A aprovação da correção no Windows será a da execução ligada ao novo head, não herdada dos resultados do Linux. Os artefatos negativos do primeiro head devem permanecer disponíveis na entrega.

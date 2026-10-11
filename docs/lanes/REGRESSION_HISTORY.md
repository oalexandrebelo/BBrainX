# Histórico de verificação e mudança do corpus

O primeiro commit de lanes, `5c45dbb290c0cf5898402dca100aa5452bba6a76`, executou 43 testes dedicados com sucesso em Node 24. A execução completa não foi aprovada e suas falhas não foram apagadas.

## Controle negativo recusado corretamente

A mutação que fazia o adapter ler o banco local vazio em vez da autoridade central produzia uma exceção de acesso a elemento ausente antes da assertion pertinente. O verificador de negativos exige falha de assertion, não qualquer processo quebrado. Acrescentamos a assertion explícita de quantidade de memórias antes de ler o ID. O mecanismo de produção não foi relaxado e a mutação continua incorreta.

## Consulta de identificador tornou-se ambígua

O gate de recuperação do próprio repositório continha `reviewMemory` e `proposeMemory` com um único arquivo esperado: `src/store.mjs`. A extensão cria métodos reais de mesmo nome em `src/lanes/store.mjs`. Uma consulta sem classe ou caminho agora tem duas definições corretas. Na primeira CI, as duas definições de lane vieram em primeiro e a autoridade em segundo; os critérios antigos pontuaram apenas 10 de 12 consultas de identificador.

O ajuste é do gold para as duas perguntas ambíguas: aceitar ambas as definições existentes. Não alteramos o buscador, pesos, threshold de 0,9, exclusões do índice, número de perguntas ou perguntas do holdout de repositórios terceiros. Acrescentamos um teste mais restritivo: os dois arquivos devem estar entre os três primeiros e ser identificados como declarações. Isso impede que a ampliação do gold esconda a perda da autoridade original.

Este gate é uma regressão sobre corpus mutável, não uma medição cega independente. O placar antes/depois dessa mudança não deve ser anunciado como melhoria do ranking. Os outros casos conservam suas expectativas.

## Cenários adicionais

A rodada também inclui abertura de leitor de lane com escritor central ativo e morte abrupta de um processo de serviço real. O segundo teste confirma que o registro permanece conservador e impede reaproveitamento por PID, não que exista um reconciliador automático já implementado.

A aprovação final, contagens e revisão testada devem ser lidas no relatório da nova CI, nunca inferidas somente da existência deste documento.

## Caminhos Windows e resolução nativa

Na revisão intermediária `371e30d`, Linux e macOS passaram em 166 testes; Windows recusou a raiz de worktrees antes de iniciar os ensaios de lane. A comparação lexical entre a entrada resolvida pelo Node e a saída do Git não era apropriada para aliases de nome/caminho no Windows. A correção usa `fs.realpathSync.native` para os dois lados e para a raiz do estado antes de comparar. Não converte tudo para lowercase nem retira o teste de raiz de repositório.

Dois testes adicionais conferem a grafia nativa, identidade de arquivo/diretório e idempotência entre grafias normalizadas. A aprovação Windows continua dependente da nova execução nativa. A correção não torna o filesystem imune a TOCTOU, nem cria uma sandbox. Referência: https://nodejs.org/docs/latest-v24.x/api/fs.html#fsrealpathsyncnativepath-options.

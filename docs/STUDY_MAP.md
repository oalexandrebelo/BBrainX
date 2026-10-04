# Mapa do estudo: por que cada coisa está onde está

Este documento é gerado de `web/study-map.js`, a mesma fonte do mapa interativo do painel (aba **Mapa do estudo**). Não edite à mão: altere a fonte e rode `node scripts/study-doc.mjs`.

Medições: 4 de outubro de 2026, MacBook M5 Pro, 24 GB, macOS 26, Node 24. Cada item informa de onde vem a evidência: **medido** (executado e medido aqui), **documento oficial**, **leitura** (código do upstream lido, sem executar) ou **decisão de projeto**. O que é leitura não foi reexecutado e vale como estudo, não como prova.

| Situação | Itens | O que significa |
|---|---|---|
| **Núcleo** | 6 | Roda sempre. Sem modelo, sem rede, sem conta. |
| **Perfil ativável** | 3 | Existe e funciona, mas só entra por comando seu. |
| **Só técnica** | 14 | A ideia entrou, reescrita aqui. O projeto não é instalado. |
| **Referência** | 6 | Consultado. Não é copiado para este repositório. |
| **Fora** | 8 | Avaliado e recusado, com o motivo e o que mudaria o veredito. |

## Núcleo

Roda sempre. Sem modelo, sem rede, sem conta.

### SQLite + FTS5

*banco e índice · licença: domínio público (embutido no Node) · evidência: medido neste projeto*

**O que é.** Um arquivo local guarda projetos, trechos indexados, checkpoints, memórias e eventos. A busca textual é a do próprio SQLite.

**Por que está aqui.** Dispensa serviço, Docker e conta. Um único processo dá transação de verdade para checkpoint, idempotência e histórico.

**Evidência.** Primeira indexação de 3.662 arquivos em 3 a 4 s (medida da 0.3). Migração de esquema com cópia de segurança coberta por teste.

**Próximo passo.** Fatiar a indexação para não bloquear o servidor em repositórios muito grandes.

Fonte: <https://sqlite.org/fts5.html>

### Motor de capacidades próprio

*contrato das 6 ferramentas · licença: MIT (original; modelo: Invokta 0.9, MIT) · evidência: medido neste projeto*

**O que é.** Cada capacidade declara entrada, saída, regra de acesso e prazo. O motor valida, autoriza, limita o tempo e devolve erro de código estável.

**Por que está aqui.** Decisão do dono: ter o motor em casa. O contrato do Invokta foi o modelo; a implementação é nossa e não instala nenhum pacote dele.

**Evidência.** Pacotes de produção no lockfile: 121 → 25. Prazo (TIMEOUT) distinto de cancelamento. Sete defeitos injetados de propósito, todos pegos pelos testes.

**Próximo passo.** Saída tipada por capacidade, no lugar do envelope genérico ok/data/error.

Fonte: <https://github.com/oalexandrebelo/BBrainX/blob/main/src/capability.mjs>

### Servidor MCP próprio, duas eras

*protocolo com os harnesses · licença: MIT (original) · evidência: documento oficial lido*

**O que é.** JSON-RPC por stdio. Atende a revisão corrente do protocolo (2026-07-28, sem handshake) e as anteriores (com initialize) no mesmo processo.

**Por que está aqui.** A revisão corrente tirou o handshake: um servidor só legado deixa de fora o cliente só moderno. Falar as duas eras é o que mantém o «qualquer harness».

**Evidência.** O cliente oficial do protocolo conversa com o servidor nos testes. Onze defeitos injetados, todos pegos, incluindo uma queda real: chamada e cancelamento no mesmo bloco derrubavam o processo.

**Próximo passo.** Conferir, harness por harness, qual era cada um fala hoje. Isso ainda não foi medido.

Fonte: <https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning>

### Busca em dois estágios, pt → en

*recuperação · licença: MIT (original) · evidência: medido neste projeto*

**O que é.** Primeiro os termos exatos; depois os mesmos termos por radical e por um glossário de programação português → inglês, com metade do peso. Palavras vazias saem da consulta.

**Por que está aqui.** A pergunta costuma vir em português e o código está em inglês. A 0.3 achava nome de função, mas errava pergunta em linguagem natural.

**Evidência.** 79 perguntas cegas, escritas por outro autor sobre dois repositórios de terceiros: arquivo certo entre os 10 primeiros em 54 % → 84 %; em 1.º lugar, 33 % → 46 %. Posição melhorou em 40 casos e piorou em 7.

**Próximo passo.** Fatiar por declaração em vez de blocos de 60 linhas; mapa de símbolos.

Fonte: <https://github.com/oalexandrebelo/BBrainX/blob/main/src/retrieval.mjs>

### Pacote de contexto com orçamento

*o que o agente recebe · licença: MIT (original) · evidência: medido neste projeto*

**O que é.** Checkpoint, memórias aprovadas e trechos com caminho, linhas e hash, dentro de um teto de tokens. O que ficou de fora é declarado.

**Por que está aqui.** O agente precisa do suficiente, não do repositório inteiro. Documentação fica com no máximo metade do orçamento enquanto houver código candidato.

**Evidência.** Arquivo alterado depois da indexação é relido antes de ser servido. Restrição obrigatória nunca é cortada para caber: o pacote é recusado.

**Próximo passo.** Prefixo estável, para o cache do provedor aproveitar o começo do pacote.

Fonte: <https://github.com/oalexandrebelo/BBrainX/blob/main/src/context.mjs>

### Zod, gpt-tokenizer, React Flow

*dependências de execução · licença: MIT · evidência: decisão de projeto*

**O que é.** Zod valida entrada e saída; gpt-tokenizer conta os tokens do pacote (o200k_base); React Flow desenha o painel e este mapa.

**Por que está aqui.** São pequenas, maduras e não chamam rede. Reescrevê-las não traria nada.

**Evidência.** Versões fixadas no lockfile; a instalação roda sem scripts de ciclo de vida.

**Próximo passo.** Nenhuma troca prevista.

Fonte: <https://github.com/xyflow/xyflow>

## Perfil ativável

Existe e funciona, mas só entra por comando seu.

### Laya 0.3.26

*modelo local de decisão · licença: Apache-2.0 (código e pesos) · evidência: medido neste projeto*

**O que é.** Um codificador com cabeça de decisão: escolhe entre opções, dá nota ou responde sim/não. Não gera texto, por isso é rápido.

**Por que está aqui.** Foi reativado e medido. Sem ajuste fino ele acerta menos que o caminho lexical nas duas decisões testadas, então fica instalável para perguntar e medir, e não altera o pacote.

**Evidência.** Roda pela GPU do Mac (MPS): carga em 4 a 18 s, 8 ms por par curto, 720 ms para julgar 10 trechos, 1,8 GB de RAM. Como reordenador: acerto em 1.º caiu de 42 % para 6 %. Relevância de memória: 56 % contra 73 % do lexical.

**Como ativar.** `node bin/bbrainx.mjs laya install`

**Próximo passo.** Ajuste fino com rótulos do próprio uso. O upstream também diz que as bases ficam perto do acaso sem isso.

Fonte: <https://github.com/NandhaKishorM/laya>

### Remotion

*filme de apresentação · licença: licença própria do Remotion (não é MIT) · evidência: decisão de projeto*

**O que é.** Composição em React que gera o vídeo de apresentação. Vive em media/, com dependências e lockfile separados.

**Por que está aqui.** Serve à publicação, não ao produto. Por ter licença própria, não pode ser dependência do núcleo.

**Evidência.** A CI renderiza o filme a cada revisão. Os números que aparecem nele são os deste mapa.

**Como ativar.** `cd media && npm ci --ignore-scripts && npm run render`

**Próximo passo.** Confira a elegibilidade da licença gratuita antes de usar numa empresa.

Fonte: <https://www.remotion.dev/docs/license>

### SDK oficial do MCP

*só no teste de interoperabilidade · licença: MIT (linha 1.x) · evidência: decisão de projeto*

**O que é.** O cliente oficial do protocolo, instalado só como dependência de desenvolvimento.

**Por que está aqui.** Testar o servidor próprio só com cliente próprio não prova nada. O cliente oficial é a prova de que um harness de verdade conversa com ele.

**Evidência.** Dois clientes oficiais independentes gravam e leem o mesmo checkpoint nos testes.

**Como ativar.** `npm test`

**Próximo passo.** Acrescentar o cliente da linha 2.x para provar também a era sem handshake com código de terceiros.

Fonte: <https://github.com/modelcontextprotocol/typescript-sdk>

## Só técnica

A ideia entrou, reescrita aqui. O projeto não é instalado.

### Invokta

*motor de capacidades · licença: MIT · evidência: leitura do código do upstream, sem executar*

**O que é.** Motor de capacidades tipadas com adaptadores para CLI e MCP.

**Por que está aqui.** Era dependência até a 0.3. Virou o modelo do motor próprio: ordem entre validação, acesso e prazo, códigos de erro e nomes portáveis de ferramenta.

**Evidência.** O aviso completo da licença MIT acompanha o repositório, porque mensagens e regras foram adaptadas. O Invokta não usa o JEV: conferido nas dependências e no código publicado.

**Próximo passo.** Vale acompanhar: composição de capacidades e conectores não foram trazidos.

Fonte: <https://github.com/vinilana/invokta>

### Contrato de decisão do Laya

*ideias sem o modelo · licença: Apache-2.0 · evidência: leitura do código do upstream, sem executar*

**O que é.** Decisão só entre opções fechadas, abstenção explícita e aviso de truncamento.

**Por que está aqui.** Valem mesmo sem modelo: o pacote declara o que cortou, e qualquer decisão automática precisa poder dizer «não sei».

**Evidência.** O intermediário do perfil nunca lança: prazo, recusa e queda viram motivo, e três falhas seguidas abrem um disjuntor.

**Próximo passo.** Usar a abstenção calibrada quando houver um checkpoint ajustado.

Fonte: <https://github.com/NandhaKishorM/laya>

### fast-jev-compaction

*compactação de sessão sobre o JEV · licença: MIT · evidência: leitura do código do upstream, sem executar*

**O que é.** Usa o JEV para decidir o que sai de uma sessão longa. O valor está na política determinística que roda antes e depois do modelo.

**Por que está aqui.** O que nunca pode ser descartado é regra, não palpite de modelo. Essa parte já vale no pacote; a compactação de sessão em si não foi implementada.

**Evidência.** Segundo a leitura do código e das issues do projeto, a decisão por modelo ficou abaixo de regras triviais e um marcador de «conteúdo removido» foi imitado pelo agente.

**Próximo passo.** Compactar sessão com resíduo estruturado, só depois de medir com rótulos.

Fonte: <https://github.com/tamaratran/fast-jev-compaction>

### jev-ultrafast

*agente de navegador sobre o JEV · licença: MIT · evidência: leitura do código do upstream, sem executar*

**O que é.** Separa decidir de executar: o modelo rápido escolhe o alvo, o código valida que o alvo ainda existe e só então age.

**Por que está aqui.** A mesma disciplina já está no núcleo: trecho é conferido contra o arquivo antes de ser servido, e checkpoint só grava na versão esperada.

**Evidência.** Parte dos tempos anunciados pelo projeto não tem arquivo de resultado, segundo a leitura do repositório.

**Próximo passo.** Roteamento por regras (qual orçamento, quando compactar) antes de qualquer modelo.

Fonte: <https://github.com/browser-use/jev-ultrafast>

### SemIf-OpenJev

*condicional semântico local · licença: MIT (modelo Qwen: Apache-2.0) · evidência: leitura do código do upstream, sem executar*

**O que é.** Não é uma reimplementação do JEV. É um arnês que lê as letras de resposta de um modelo de linguagem congelado, de cerca de 9 GB.

**Por que está aqui.** A boa ideia é dar erro em vez de truncar a entrada em silêncio. O modelo é pesado demais para um perfil padrão.

**Evidência.** Tem medida em chip M5 no próprio repositório; nada foi medido aqui.

**Próximo passo.** Comparar com o Laya no mesmo conjunto rotulado, se um dia houver motivo.

Fonte: <https://github.com/TheoLeeCJ/SemIf-OpenJev>

### LightRAG

*recuperação por grafo de documentos · licença: MIT · evidência: leitura do código do upstream, sem executar*

**O que é.** Extrai entidades e relações dos documentos com um LLM e consulta em dois níveis: nomes específicos e temas.

**Por que está aqui.** A indexação chama LLM duas vezes por bloco e não entende código: o «grafo de chamadas» seria inferência, não fato. Ficou a ideia dos dois níveis, que aqui são nomes declarados e títulos.

**Evidência.** «Frações de segundo» e «90 % mais barato» não aparecem no código nem na documentação do projeto, segundo a leitura. Não suporta SQLite.

**Próximo passo.** Perfil para documentação em prosa, com servidor separado e só o caminho que devolve dados.

Fonte: <https://github.com/HKUDS/LightRAG>

### OmniRoute

*gateway de modelos · licença: MIT · evidência: leitura do código do upstream, sem executar*

**O que é.** Gateway de LLM com roteamento, cotas e compressão.

**Por que está aqui.** O BBrainX não é gateway. Entraram o formato de handoff do checkpoint e o disjuntor. As funções que imitam a impressão digital de outros clientes contornam termos de serviço e não serão reproduzidas.

**Evidência.** O checkpoint guarda o que foi feito, decisões, arquivos tocados e evidências desde a 0.3.

**Próximo passo.** Cliente opcional de um gateway que o usuário já opere.

Fonte: <https://github.com/diegosouzapw/OmniRoute>

### plandex

*agente de programação · licença: MIT · evidência: leitura do código do upstream, sem executar*

**O que é.** Agente em Go com mapa de símbolos por tree-sitter.

**Por que está aqui.** Projeto parado e dependente de Docker e chave de LLM. Ficou a ideia de pôr a declaração de um nome antes dos usos.

**Evidência.** Achar a definição de um identificador em 1.º lugar: 38 % → 98 % na 0.3 (300 casos gerados).

**Próximo passo.** Símbolos por tree-sitter, como perfil.

Fonte: <https://github.com/plandex-ai/plandex>

### mem0

*memória para agentes · licença: Apache-2.0 · evidência: leitura do código do upstream, sem executar*

**O que é.** Extrai fatos da conversa com um LLM e busca de forma híbrida.

**Por que está aqui.** Grava memória ativa sem humano e, por padrão, envia dados a um provedor. Aqui a memória é proposta pelo agente e aprovada por você. Ficaram a deduplicação e o filtro por relevância.

**Evidência.** Telemetria ligada por padrão no upstream, segundo a leitura do código. A sincronização com Obsidian citada em dossiês de terceiros não existe nele.

**Próximo passo.** Exportar memórias aprovadas em Markdown.

Fonte: <https://github.com/mem0ai/mem0>

### ECC

*catálogo de skills e hooks · licença: MIT · evidência: leitura do código do upstream, sem executar*

**O que é.** Coleção grande de skills, agentes e hooks para harnesses.

**Por que está aqui.** Instalar o pacote inteiro injeta dezenas de milhares de tokens fixos por sessão. Ficou a separação entre o que o host observa e o que o agente declara.

**Evidência.** Commit e ramo do Git são lidos pelo host e carimbados no checkpoint; o agente não consegue forjá-los.

**Próximo passo.** Hook de início de sessão que injeta o checkpoint sozinho.

Fonte: <https://github.com/affaan-m/ecc>

### agy-staff

*delegação entre harnesses · licença: MIT · evidência: leitura do código do upstream, sem executar*

**O que é.** Delega trabalho ao CLI Antigravity a partir de outro harness.

**Por que está aqui.** Exige conta, envia o repositório para fora e não tem teto de custo. A ideia de passar o bastão é a mesma do checkpoint, que aqui fica local.

**Evidência.** Handoff entre dois clientes independentes é testado a cada revisão.

**Próximo passo.** Nada previsto.

Fonte: <https://github.com/keli-wen/agy-staff>

### Artigos do Akita

*relatos de engenharia · licença: direitos do autor (só citação) · evidência: leitura do código do upstream, sem executar*

**O que é.** Série sobre agentes de programação, memória e código pesquisável.

**Por que está aqui.** Uma das técnicas daqui bate com uma medida dele: no ai-memory, só tirar palavras vazias da consulta levou o acerto entre os 5 primeiros de 0,617 para 0,668.

**Evidência.** O repositório do ai-memory publica 0,617 → 0,668 → 0,823; o artigo cita 0,779. Vale o repositório. O formato OKF de intercâmbio não foi implementado aqui.

**Próximo passo.** Importar e exportar memórias num formato aberto, com teste do esquema.

Fonte: <https://akitaonrails.com/>

### Literatura científica

*método de medição · licença: direitos dos autores (só citação) · evidência: leitura do código do upstream, sem executar*

**O que é.** Estudos sobre recuperação em código, posição da evidência no contexto e memória de agentes.

**Por que está aqui.** O que mais mudou o projeto foi o método: intervalo de confiança, comparação pareada, corpus fixado e casos escritos por quem não ajusta o buscador.

**Evidência.** Com 7 casos, «2 de 7» tem intervalo de 8 % a 64 %: não sustenta conclusão. Por isso a avaliação agora informa o intervalo e o snapshot do corpus.

**Próximo passo.** Tarefas reais com critério de aceite, que continuam por fazer.

Fonte: <https://github.com/oalexandrebelo/BBrainX/blob/main/docs/EVALUATION.md>

### LOGO-DESIGN-SKILL

*processo de identidade · licença: MIT · evidência: leitura do código do upstream, sem executar*

**O que é.** Método para chegar a uma marca simples e legível em tamanho pequeno.

**Por que está aqui.** Foi usado o processo, não a galeria. As três opções em public/brand/options são geometria original.

**Evidência.** Cada opção é um SVG de menos de 300 bytes, em uma cor.

**Próximo passo.** O monograma BX está em uso por escolha do dono, de forma provisória. Falta validar com usuários; nada aqui é parecer de marca.

Fonte: <https://github.com/KAANKIZILTUG/LOGO-DESIGN-SKILL>

## Referência

Consultado. Não é copiado para este repositório.

### system-design-101

*guia visual de arquitetura · licença: CC BY-NC-ND 4.0 · evidência: leitura do código do upstream, sem executar*

**O que é.** Explicações ilustradas de conceitos de arquitetura.

**Por que está aqui.** A licença proíbe uso comercial e obra derivada. Não pode entrar num repositório MIT.

**Evidência.** Nenhum texto ou imagem foi copiado.

**Próximo passo.** Você pode clonar e registrar como projeto de consulta no seu próprio computador.

Fonte: <https://github.com/ByteByteGoHq/system-design-101>

### awesome-system-design-resources

*lista de estudo · licença: GPL-3.0 · evidência: leitura do código do upstream, sem executar*

**O que é.** Lista de materiais de arquitetura de sistemas.

**Por que está aqui.** GPL-3.0 obrigaria o repositório inteiro a seguir a mesma licença se o conteúdo fosse incorporado.

**Evidência.** Só o link.

**Próximo passo.** Mesma saída: clone local do usuário, indexado como consulta.

Fonte: <https://github.com/ashishps1/awesome-system-design-resources>

### system-design-and-architecture

*notas de arquitetura · licença: nenhuma (todos os direitos reservados) · evidência: leitura do código do upstream, sem executar*

**O que é.** Notas e resumos de arquitetura.

**Por que está aqui.** Sem licença, nem redistribuir trecho é garantido.

**Evidência.** Só o link.

**Próximo passo.** Nenhuma.

Fonte: <https://github.com/puncsky/system-design-and-architecture>

### Back-End-Developer-Interview-Questions

*perguntas de revisão · licença: GPL-2.0 · evidência: leitura do código do upstream, sem executar*

**O que é.** Perguntas abertas sobre projeto de back-end.

**Por que está aqui.** Boas para revisar uma arquitetura, mas a licença não permite trazê-las para cá.

**Evidência.** Só o link. Pergunta de entrevista não é critério de aceite.

**Próximo passo.** Escrever perguntas de revisão originais, se fizer falta.

Fonte: <https://github.com/arialdomartini/Back-End-Developer-Interview-Questions>

### free-for.dev

*lista de camadas gratuitas · licença: nenhuma declarada · evidência: leitura do código do upstream, sem executar*

**O que é.** Lista de serviços com plano gratuito.

**Por que está aqui.** O núcleo não exige conta nenhuma, e camada gratuita some sem aviso.

**Evidência.** Só o link.

**Próximo passo.** Nenhuma.

Fonte: <https://free-for.dev/>

### awesomejev.com

*catálogo de produtos sobre o JEV · licença: catálogo de terceiros · evidência: leitura do código do upstream, sem executar*

**O que é.** Mais de mil projetos construídos sobre a API do JEV.

**Por que está aqui.** Serve para achar técnica, não para depender. Dos que tocam contexto e memória, o que se aproveita é método de medição.

**Evidência.** Contagem e triagem feitas pelo estudo; nada dali foi executado.

**Próximo passo.** Revisitar se surgir um conjunto público de decisões rotuladas em código.

Fonte: <https://awesomejev.com/>

## Fora

Avaliado e recusado, com o motivo e o que mudaria o veredito.

### JEV (API hospedada)

*modelo de decisão fechado · licença: serviço proprietário · evidência: decisão de projeto*

**O que é.** Serviço pago de decisões tipadas. O Laya fala o mesmo protocolo e roda na sua máquina.

**Por que está aqui.** O núcleo não envia código nem contexto a serviço de terceiros. Nenhuma linha do BBrainX chama o JEV.

**Evidência.** Limiar de confiança ajustado no JEV não se transfere para o Laya: os dois erram de jeitos diferentes.

**O que mudaria o veredito.** Nada. Quem quiser usar o JEV faz isso no próprio harness.

Fonte: <https://awesomejev.com/>

### jev-chat-jarvis

*assistente para Android · licença: MIT · evidência: leitura do código do upstream, sem executar*

**O que é.** Lê a tela do celular por acessibilidade e OCR e responde conversas.

**Por que está aqui.** Captura de tela e de conversa não tem lugar num motor de contexto de código. Segundo a leitura do repositório, o padrão envia o chat a um servidor de terceiro.

**Evidência.** Leitura parcial do código; o aplicativo não foi instalado.

**O que mudaria o veredito.** Nada.

Fonte: <https://github.com/jev-chat/jev-chat-jarvis>

### LlamaFactory

*ajuste fino de LLMs · licença: Apache-2.0 · evidência: leitura do código do upstream, sem executar*

**O que é.** Ferramenta para ajustar modelos de linguagem que geram texto.

**Por que está aqui.** Não treina classificador nem codificador, que é o que o Laya é. E treinar com o código do usuário faz o modelo memorizá-lo.

**Evidência.** O ajuste fino do Laya tem roteiro próprio no repositório dele.

**O que mudaria o veredito.** Se o projeto passar a ter um modelo gerador próprio, o que não está nos planos.

Fonte: <https://github.com/hiyouga/LlamaFactory>

### needle

*modelo minúsculo de chamada de ferramenta · licença: Apache-2.0 · evidência: leitura do código do upstream, sem executar*

**O que é.** Modelo pequeno para escolher ferramentas.

**Por que está aqui.** A versão publicada para vetores não tem a cabeça de embedding treinada nem avaliação de recuperação.

**Evidência.** Leitura do código e do cartão do modelo na 1.ª rodada.

**O que mudaria o veredito.** Uma avaliação de recuperação em código publicada pelo projeto.

Fonte: <https://github.com/cactus-compute/needle>

### Busca vetorial (e5 multilíngue)

*técnica testada · licença: MIT (modelos e5) · evidência: medido neste projeto*

**O que é.** Vetores de um modelo multilíngue pequeno, fundidos com a busca textual por posição.

**Por que está aqui.** Medido antes de construir, e o resultado não fecha. Nas perguntas cegas a fusão subiu o acerto em 1.º lugar, mas melhorou 26 casos e piorou 16, diferença que pode ser acaso; neste repositório ela piorou. Não entrou nesta rodada.

**Evidência.** 79 perguntas cegas: em 1.º lugar, 46 % com a busca textual e 56 % com a fusão; entre os 10, 84 % e 85 %. 36 perguntas sobre este repositório: 44 % e 42 % em 1.º; 94 % e 86 % entre os 10. Sozinho, o modelo ficou em 29 % e 22 %.

**O que mudaria o veredito.** Mais casos cegos e um modelo treinado em código. É o primeiro candidato a perfil: o ambiente do Laya já traz o que ele precisa.

Fonte: <https://huggingface.co/intfloat/multilingual-e5-small>

### OpenHands

*executor em sandbox · licença: MIT (pasta enterprise à parte) · evidência: leitura do código do upstream, sem executar*

**O que é.** Agente que executa código e comandos, com isolamento opcional por Docker.

**Por que está aqui.** O BBrainX não executa nada: serviço de memória com shell é risco sem contrapartida. O OpenHands pode consumir o contexto por MCP, como qualquer harness.

**Evidência.** Esta máquina não tem Docker; o diagnóstico informa isso em vez de tentar instalar.

**O que mudaria o veredito.** Nada no núcleo. Como cliente, já funciona pela configuração de MCP.

Fonte: <https://github.com/All-Hands-AI/OpenHands>

### Dossiê X99 Power Code V4.0

*documento de terceiros · licença: não se aplica (documento recebido) · evidência: leitura do código do upstream, sem executar*

**O que é.** Promete um ambiente pronto com doze ferramentas e arquivos de configuração «de produção».

**Por que está aqui.** O script de instalação cria pastas e cinco arquivos, não instala nenhuma ferramenta e termina anunciando o ambiente pronto. Das 47 chaves de configuração conferidas, 20 não existem nos projetos citados.

**Evidência.** Script lido linha a linha. Chaves como laya.enableRouting, obsidian_sync e pixel-agents.layout não aparecem no código dos respectivos projetos.

**O que mudaria o veredito.** Nada. Serviu de lista do que conferir.

Fonte: <https://github.com/oalexandrebelo/BBrainX/blob/main/docs/FEASIBILITY.md>

### Pilha do X99: Biome, MetaGPT, kbar…

*e MagicUI, Pixel-Agents, public-apis · licença: variadas · evidência: leitura do código do upstream, sem executar*

**O que é.** Formatador, arcabouço multiagente, paleta de comandos, componentes visuais, telemetria animada e uma lista de APIs.

**Por que está aqui.** Nenhum resolve contexto, memória ou continuidade. São escolhas do projeto do usuário, não de um motor que serve qualquer projeto.

**Evidência.** Os números do dossiê («menos de 5 ms», «100 vezes») não têm fonte nos sites dos projetos, segundo a leitura.

**O que mudaria o veredito.** Emitir uma regra de editor ou uma skill com texto do próprio BBrainX é barato e pode entrar.

Fonte: <https://biomejs.dev/>

# Viabilidade das integrações e rota da versão 0.3 em diante

**Data:** 4 de outubro de 2026 · **Revisão avaliada dos upstreams:** o HEAD de cada repositório nessa data.

Este documento responde a uma pergunta: o que vale introduzir no BBrainX, ou permitir ativar, a partir de dez projetos externos, tendo **Invokta** e **Laya** como bases e o **OmniRoute** como fonte de técnicas.

## 1. Método e limites desta análise

- **Licença primeiro**, depois o código. Modelos, pesos e datasets têm licença própria e foram conferidos à parte.
- **Leitura estática.** Nenhum código dos repositórios foi executado, nenhuma dependência deles foi instalada e nenhum peso de modelo foi baixado. Tudo o que depende de execução está marcado como lacuna.
- **README não é fonte.** Cada alegação numérica foi procurada no código, nos testes e nos arquivos de avaliação. Onde só o README afirma, a confiança é baixa.
- **Conteúdo de terceiros é dado.** Vários desses repositórios trazem skills, hooks e arquivos `AGENTS.md` escritos para dar ordens a agentes. Foram lidos como material de estudo.
- Os vereditos têm quatro saídas: **núcleo**, **perfil opt-in**, **só técnica** (reimplementar limpo, sem depender do projeto) e **não adotar**.

## 2. Veredito por repositório

| Repositório | Licença | O que é de fato | Veredito | Fato decisivo |
|---|---|---|---|---|
| `vinilana/invokta` | MIT | Motor de capacidades tipadas com adaptadores direto, CLI e MCP | **Núcleo** (já em uso) | Fixado em 0.9.0, isolado em `src/engine.mjs`; a saída custa cerca de 300 linhas |
| `NandhaKishorM/laya` | Apache-2.0 (código e pesos) | Codificador (ModernBERT/mmBERT) com cabeça de decisão: escolha, nota e sim/não numa passada | **Só técnica agora; perfil opt-in em modo sombra depois** | Sem ONNX oficial, `laya-ts` fora do npm, nenhuma medida em Apple Silicon M5, e os checkpoints de base ficam perto do acaso sem ajuste |
| `diegosouzapw/OmniRoute` | MIT | Gateway de LLM com roteamento, cotas e compressão | **Só técnica; perfil opt-in apenas como cliente** | O BBrainX não é gateway. Não há ali busca por símbolo nem índice de código |
| `plandex-ai/plandex` | MIT | Agente de programação em Go, com mapa de símbolos por tree-sitter | **Só técnica** | Parado desde 03/10/2025; a nuvem foi encerrada; exige Docker e chave de LLM |
| `affaan-m/ECC` | MIT | Catálogo de skills, agentes e hooks para harnesses | **Só técnica** | O pacote inteiro injeta cerca de 30 mil tokens fixos por sessão (estimado por caracteres) |
| `keli-wen/agy-staff` | MIT | Delegação de trabalho ao CLI Antigravity a partir de outro harness | **Só técnica** | Exige conta Google, envia o repositório para fora e não tem teto de custo |
| `mem0ai/mem0` | Apache-2.0 | Extração de fatos por LLM e busca híbrida | **Só técnica** | Grava memória ativa sem humano; os padrões enviam dados à OpenAI; telemetria ligada por padrão |
| `cactus-compute/needle` | Apache-2.0 | Modelo minúsculo de chamada de ferramenta | **Não adotar como embedder** | O `needle_embed` publicado não tem cabeça de embedding treinada; não há avaliação de recuperação |
| `hiyouga/LlamaFactory` | Apache-2.0 | Ajuste fino de LLMs causais | **Não adotar** | Não treina classificador, reordenador nem embedding; incompatível com Laya e needle |
| `ripienaar/free-for-dev` | **nenhuma** | Lista de camadas gratuitas de SaaS | **Não adotar** | Sem licença (todos os direitos reservados) e nada ali serve a um núcleo que não exige conta |

## 3. As duas bases

### 3.1 Invokta: núcleo, com saída documentada

O BBrainX usa `defineCapability`, `createEngine` e o adaptador MCP por stdio. O que a leitura do pacote instalado mostrou:

- O ciclo de uma invocação é: valida a entrada, consulta `access`, aplica o tempo-limite, valida a saída. Há três eventos por chamada.
- O núcleo do Invokta **não** tem middleware, progresso, repetição, idempotência nem fila. Essas responsabilidades continuam no domínio do BBrainX.
- O adaptador MCP cobre só ferramentas. Recursos, prompts e progresso teriam de ser escritos direto com o SDK do protocolo.
- O tempo-limite é uma corrida de promessas. Com `node:sqlite` síncrono, um laço longo bloqueia o laço de eventos e o tempo-limite não dispara. Por isso a indexação foi otimizada (seção 4) em vez de depender dele.
- Há um mantenedor humano e o projeto tem dois meses. A dependência fica fixada em versão exata e confinada a um arquivo.

Ainda não aproveitado, por ordem de valor: erros de domínio que chegam ao agente como erro do protocolo, esquema de saída por capacidade no lugar do envelope genérico, e a CLI passando pelo mesmo motor.

### 3.2 Laya: o contrato entra agora; o modelo, só depois de medido

O Laya não é um LLM. É um codificador com cerca de 421 milhões de parâmetros (pesos de 644 a 842 MB) que devolve uma probabilidade por opção, sem gerar texto.

O que impede ligá-lo hoje:

- Os pesos existem só em `safetensors`. O ONNX é gerado na máquina do usuário, com Python e PyTorch.
- O pacote `laya-ts` (execução em Node por `onnxruntime-node`) está no repositório, mas não está publicado no npm.
- O «33 ms» do README foi medido em GPU T4 com uma pergunta. Em CPU de 4 núcleos o repositório registra 580 ms por pergunta. Não há medida no M5 Pro.
- Os checkpoints de base ficam perto do acaso sem ajuste fino (0,36 de acerto contra 0,46 da classe majoritária numa das avaliações do próprio projeto), e não há avaliação em código-fonte.
- A origem dos dados de treino de dois dos três checkpoints não é verificável.

Duas técnicas do Laya entram desde já, reimplementadas no domínio do BBrainX, sem modelo:

1. **Truncamento declarado.** O pacote informa o que ficou de fora por orçamento (`sourcesOmittedByBudget`, `memoriesOmitted`).
2. **Avaliação por fatia com portão de regressão.** `scripts/eval-retrieval.mjs` e o teste de qualidade mínima sobre o próprio repositório.

O perfil `decision-broker` **não está implementado**. Fica especificado assim, para quando houver medida:

- Decisão só entre alternativas fechadas: o broker escolhe entre opções dadas, nunca inventa item nem altera conteúdo.
- Processo filho, desligado por padrão, falando JSON por linha em stdio. Sem shell, sem rede e sem escrita no banco.
- Pesos baixados só por comando explícito, com SHA-256 conferido.
- O broker só reordena ou filtra candidatos que a busca lexical já devolveu.
- Abstenção forçada em estado truncado, checkpoint ou tokenizador desconhecido, limiar não calibrado ou tempo esgotado.
- Com o broker desligado, lento ou abstendo-se, o resultado do núcleo é idêntico ao de hoje. Isso precisa ser provado por teste.
- Primeiro em **modo sombra**: registra a decisão que tomaria, sem aplicá-la, e compara com o que o usuário de fato aprovou.

Das decisões candidatas, a de melhor aderência é o roteamento (qual modelo ou harness para a tarefa). Reordenar a busca é a mais fraca: blocos de 60 linhas estouram a janela de 512 tokens do checkpoint em inglês.

## 4. O que a versão 0.3 implementa

Cada item nasceu de uma fraqueza medida na 0.2 e de uma técnica observada num dos projetos estudados. Nenhum código de terceiro foi copiado.

| Mudança | Origem da ideia | Medida |
|---|---|---|
| Ordenação que põe a declaração antes dos usos e dos testes | Mapa de símbolos do plandex | Tabela abaixo |
| Identificador composto casa com suas partes (`eraseUserData` ↔ `erase_user_data`) | — | Idem |
| Arquivo alterado é relido antes de ser servido, em vez de o pacote falhar | Atualização incremental por hash | Teste de regressão |
| Indexação um arquivo por vez, com tetos configuráveis pelo host | Indexação em lotes do plandex | 1.ª indexação de 3.662 arquivos: de 27,8 s para 3 a 4 s |
| Índice FTS5 sem duplicar o corpo | — | Banco: 96 MB → 61 MB |
| Checkpoint com o que foi feito, decisões, arquivos tocados e evidências | Esquema de handoff do OmniRoute | Teste de regressão |
| Campos observados pelo host (snapshot, commit e ramo do Git) separados dos declarados pelo agente | Hook determinístico do ECC | Teste de regressão |
| Memória `relevant`, que só entra quando casa com o objetivo, com a omissão declarada; quem escolhe o modo é o humano, na aprovação | Relevância do mem0 e do OmniRoute | Teste de regressão |
| Proposta de memória repetida não duplica | Deduplicação por hash do mem0 | Teste de regressão |
| Avaliação de recuperação com casos rotulados | `laya-evals` e o harness do OmniRoute | Tabela abaixo |

### Recuperação: antes e depois

Dois tipos de caso. **Gerados**, sem julgamento humano: cada nome declarado em um único arquivo-fonte vira a consulta, e esse arquivo é a resposta esperada (`scripts/make-definition-cases.mjs`). **Rotulados à mão**: `test/fixtures/eval-self.cases`, com identificadores, palavras soltas e perguntas em linguagem natural.

| Repositório | Casos | Versão | Acerto em 1.º | Entre os 3 | Entre os 10 | MRR |
|---|---|---|---|---|---|---|
| Este repositório | 35 gerados | 0.2 | 37,1 % | 71,4 % | 91,4 % | 0,574 |
| | | 0.3 | 97,1 % | 100 % | 100 % | 0,986 |
| Este repositório | 24 rotulados à mão | 0.2 | 25,0 % | 45,8 % | 83,3 % | 0,421 |
| | | 0.3 | 79,2 % | 91,7 % | 95,8 % | 0,854 |
| TypeScript, 3.662 arquivos | 300 gerados | 0.2 | 38,0 % | 69,7 % | 94,0 % | 0,566 |
| | | 0.3 | 97,7 % | 99,0 % | 99,7 % | 0,983 |
| Python, 811 arquivos (fora do ajuste de pesos) | 300 gerados | 0.2 | 42,3 % | 65,7 % | 86,7 % | 0,568 |
| | | 0.3 | 94,3 % | 97,3 % | 99,3 % | 0,961 |

As duas primeiras linhas se reproduzem neste repositório com os comandos de [EVALUATION.md](EVALUATION.md). Os dois repositórios externos não estão versionados aqui; os números deles foram medidos na máquina do mantenedor em 4 de outubro de 2026 e não têm evidência publicada.

O que esses números **não** dizem:

- Medem só a posição do arquivo esperado. Não medem tarefa aceita, custo nem qualidade de resposta.
- Consulta em linguagem natural continua fraca. Nos 7 casos dessa fatia rotulados à mão sobre este repositório, a 0.3 acerta em primeiro 29 % das vezes (MRR 0,50). Busca lexical não resolve sinônimo.
- Os pesos de ordenação foram ajustados olhando dois conjuntos pequenos rotulados à mão (24 e 18 casos). Os conjuntos gerados e o repositório de fora do ajuste existem para conter esse viés, mas não o eliminam.
- Os padrões que geram os casos são da mesma família dos que o indexador usa, então o conjunto gerado favorece nomes que o indexador reconhece.

## 5. Próximos passos, em ordem

| # | Entrega | O que resolve | Depende de |
|---|---|---|---|
| 1 | **Símbolos por tree-sitter** (perfil `symbols`): gramáticas em WASM, tabela de símbolos, trechos cortados na fronteira da declaração | Declaração partida entre dois blocos de 60 linhas; linguagens que a heurística por linha não cobre | Aceitar uma dependência nova (`web-tree-sitter`) e conferir a licença de cada gramática |
| 2 | **Hooks de ciclo de sessão** (perfil `hooks-lifecycle`): gravar o checkpoint no fim da sessão e antes da compactação | Hoje o checkpoint depende de o agente lembrar | Escolher os harnesses a homologar; o resumo vindo de transcrição é vetor de injeção e precisa de limite |
| 3 | **Pacote com prefixo estável e orçamento por destino**, com registro do que entrou e do que foi cortado | Pacote amigável ao cache do provedor; orçamento certo por modelo | Tabela local de janelas por modelo, mantida à mão |
| 4 | **Avaliação com tarefas reais** (30 a 100), com «agulhas» verificáveis e sem juiz LLM | O nível 5 de `EVALUATION.md` continua em aberto | Tarefas escolhidas pelo mantenedor |
| 5 | **Decision Broker em modo sombra** (seção 3.2) | Roteamento e relevância de memória por modelo local | Decisão do mantenedor: baixar 644 a 842 MB, instalar Python com PyTorch para exportar o ONNX, e medir no próprio Mac |
| 6 | **Busca híbrida** (lexical + vetorial, fusão por posição) | Consulta em linguagem natural | Um embedder com avaliação de recuperação em código e em português. O needle não serve |
| 7 | **Cliente de um gateway externo** (perfil `gateway-client`) | Recursos generativos opcionais | Um gateway que o usuário já opere; combinação de provedores só-local; lista de provedores permitidos conferida na resposta |

Uma varredura exata de 50 mil vetores de 384 dimensões em `node:sqlite` levou 42 ms nesta máquina. O item 6 não precisa de extensão nativa.

## 6. O que não entra, e por quê

- **OmniRoute como dependência.** O valor está nas técnicas. As funções de «furtividade» (imitar a impressão digital de CLIs e provedores por cookie) contornam termos de serviço e não serão reproduzidas.
- **Compressão com perda do texto recuperado.** O BBrainX entrega trechos íntegros com hash. Se um dia houver condensação, ela passa antes por um portão de fidelidade: âncoras, números e chaves preservados, ou o texto original segue intacto.
- **mem0 como pacote.** Gravar memória ativa sem aprovação contraria o desenho. A memória em grafo e a consolidação anunciadas no README não estão no SDK aberto.
- **ECC, agy-staff e plandex como pacotes.** Catálogo grande demais, delegação sem teto de custo e projeto encerrado, nessa ordem.
- **LlamaFactory.** Não há hoje dados suficientes para treinar nada, e treinar com o código do usuário faz o modelo memorizá-lo.
- **free-for-dev.** Sem licença, e camada gratuita some sem aviso.

## 7. Riscos que valem para qualquer integração futura

- **Telemetria ligada por padrão** em mem0 (PostHog) e needle. Um perfil opt-in precisa desligá-la de forma explícita e conferir.
- **Texto imperativo em repositórios de skills.** Instalar um catálogo de terceiros é aceitar instruções de terceiros dentro do agente.
- **Estrelas não medem maturidade.** Dois dos projetos passaram de 30 mil estrelas em semanas. Pesaram na análise os testes que rodam, o número de mantenedores e a existência de script por trás de cada número.
- **Um mantenedor só** em Invokta e OmniRoute. A defesa é fixar versão, isolar atrás de um arquivo e depender de contrato, não de implementação.

## 8. Lacunas

Latência, memória e partida a frio do Laya no M5 Pro; `laya-ts` com Node 24; licença dos dados de treino de dois checkpoints; licença de cada gramática WASM do tree-sitter; forma exata da API de saúde e de contagem de tokens do gateway; cobertura de testes do Invokta. Nada disso foi medido.

# BBrainX — MEDIUM-first e evolução verificável

**Data:** 6 de outubro de 2026. **Base examinada:** `a9636e9402e3fa673ae05b3489202da1048aef5e`, versão 0.4.0. **Entrega:** código candidato, estudo e testes no PR desta branch. Não é uma nova versão de modelo, certificação de produção crítica ou medição de qualidade em hardware MEDIUM.

Leia também [o protocolo de benchmark](BENCHMARK.md), [os comandos e limites](RUNBOOK.md) e [as fontes primárias](SOURCES.md). As referências S01–S37 distinguem documentação, implementação upstream e pesquisa. Os arquivos de validação são produzidos pela CI do commit: um teste antigo não se torna evidência de código novo.

## 1. O que os quatro documentos recebidos mudam

`CODEX-PROJECT-CONNECTION.md`, `HANDOFF.md` e `QUICKSTART.md` descrevem contratos operacionais e medições históricas. `BBrainX-conceito-e-benchmark.md` declara expressamente que é conceito e método, sem inspeção do código. Esta revisão não transforma as hipóteses desse quarto arquivo em funcionalidades existentes. Materiais completos, clones de estudo e dados de produtos consumidores não são copiados para o repositório; esta síntese contém apenas o necessário à engenharia genérica.

Preservamos a separação entre escopo do servidor e configuração do cliente. Um MCP com `--project A` não passa a servir B porque o usuário mudou o cwd. Uma configuração global pode continuar aparecendo em outras sessões. A configuração local do Codex e a allowlist do servidor são controles complementares, não substitutos.

O handoff informa que a base já tem persistência SQLite/FTS5, memória aprovada por pessoa, checkpoint com versão esperada, busca lexical e perfil Laya opt-in. Também afirma que ainda não há uma tarefa real com critério de aceite como prova de ganho. A base não oferece daemon Laya global, watcher contínuo, grafo semântico ou livro-razão de requisitos com verificação independente. A arquitetura futura não pode ser apresentada como estado instalado.

O conceito acrescenta cinco linhas úteis: mapa de orientação, requisitos com evidência, gates por diff, memória temporal ancorada e melhoria controlada do comportamento. A prioridade desta rodada é tornar sua fundação mensurável e corrigir problemas concretos, não adicionar imediatamente todos os subsistemas.

### Alterações realmente implementadas nesta branch

| Artefato | Efeito observável | Limite preservado |
|---|---|---|
| `src/infrastructure.mjs` | Cinco perfis, MEDIUM como referência e AUTO sem escalada silenciosa. | São políticas de dimensionamento, não quotas impostas pelo SO. |
| `src/host.mjs` | `doctor` inclui recomendação estruturada. | Não mede GPU, qualidade de modelo ou benchmarks nativos. |
| `src/resource-admission.mjs` | Reservas por bytes e slots, amostra recente, histerese e consentimento. | Um coordenador; não contabiliza automaticamente todos os processos dos harnesses. |
| `src/replay.mjs` | Percorre resultados históricos com estratégias fixas e sem observar scores futuros para escolher ações. | Não gera candidatos, não treina e não promove políticas. |
| `scripts/workstation.mjs` | CLI de perfis, replay explícito e conferência de manifestos. | Não instala nem altera configuração do usuário. |
| `src/codex-project.mjs` e script correspondente | Fragmento local do Codex, ligado ao projeto registrado. | O gerador global antigo continua existente; não há migração automática. |
| `src/store.mjs` | Valida schema atual numa transação de leitura em vez de exigir a vaga de escritor. | Migração e escrita mantêm transação; isso não remove todo lock do SQLite. |

Não houve alteração de schema, dependências de produção, pesos Laya, ranking lexical, credenciais ou gateways. A branch é independente do Atlas X99 e do patch de worker/cache anterior; não incorpora esses trabalhos implicitamente.

## 2. Cinco níveis de infraestrutura; uma única semântica de segurança

Os cinco níveis classificam capacidade operacional. Não são níveis de autonomia e não mudam o que constitui autorização, memória aprovada ou evidência válida.

| Nível | RAM mínima | Paralelismo disponível mínimo | Orçamento cooperativo | Reserva para a estação | Slots | Pack recomendado |
|---|---:|---:|---:|---:|---:|---:|
| LOW | 8 GiB | 2 | 768 MiB | 4 GiB | 1 | 3.000 tokens |
| **MEDIUM / CORE** | **16 GiB** | **4** | **3 GiB** | **8 GiB** | **2** | **6.000 tokens** |
| HIGH | 32 GiB | 8 | 6 GiB | 16 GiB | 3 | 8.000 tokens |
| PRO | 64 GiB | 12 | 12 GiB | 32 GiB | 4 | 12.000 tokens |
| MAX | 128 GiB | 16 | 24 GiB | 64 GiB | 6 | 16.000 tokens |

Valores são escolhas iniciais desta implementação e precisam ser avaliados. GiB significa 2^30 bytes. `availableParallelism` é disponibilidade de execução informada pelo runtime, não uma contagem de núcleos físicos nem uma equivalência entre CPUs diferentes.

`AUTO` seleciona no máximo MEDIUM, mesmo numa workstation MAX. O resultado informa separadamente o teto suportado e o perfil escolhido. HIGH, PRO e MAX exigem pedido explícito. Hardware abaixo da política LOW permanece identificável; não é promovido por arredondamento da memória. A disponibilidade do núcleo continua distinta da elegibilidade para uma configuração recomendada.

A RAM efetiva é o mínimo entre memória física e restrição aplicável do processo. A CI revelou uma restrição nativa representada por um número maior que `Number.MAX_SAFE_INTEGER`. O código agora aceita esse teto finito inteiro e o limita pela RAM física previamente validada antes de qualquer aritmética de capacidade. Isso evita quebrar o diagnóstico ou transformar um sentinela nativo em capacidade fictícia. Há testes com o valor extremo e com a sondagem real do host.

### Recursos recomendados não são recursos alocados

O `doctor` não reserva 3 GiB e não modifica o orçamento do compilador existente. O tamanho do pack, do cache e o orçamento da tabela são recomendações da política. Somente componentes ligados explicitamente ao governador podem usar suas reservas. Nesta rodada, o CLI de replay demonstra essa integração numa operação delimitada; não existe um limitador global de RSS para o produto inteiro.

A memória de um processo de modelo inclui pesos, ativações, tokenizer, runtime, buffers e caches. Aproximar 0,4 bilhão de parâmetros por 0,8 GB em determinada precisão descreve apenas uma parcela. O anexo usa MLX como hipótese; a medição histórica de Laya fornecida pelo projeto é MPS. Não converter uma em outra nem prometer a mesma latência em todo Mac. [S26]

LOW mantém operação determinística. MEDIUM reserva espaço para um único modelo de decisão opt-in, após medição. HIGH admite experimentar embeddings e reranking sob orçamento. PRO e MAX permitem investigar serving e treinamento isolado, sem que esses serviços sejam instalados por padrão. Treinamento não faz parte da execução cotidiana do núcleo.

## 3. Governador cooperativo: proteção da estação antes de throughput bruto

`ResourceAdmission` mantém um mapa de leases opacos, total de bytes estimados e contadores de tarefas ativas. Uma cópia do objeto-token não libera a reserva; uma liberação repetida não subtrai bytes novamente. O token só vale para a instância que o emitiu.

Amostras devem usar o mesmo domínio de relógio monotônico, ser recentes e não retroceder. Amostras futuras são recusadas. Duplicatas não contam como progresso de recuperação. Pressão de memória, alerta térmico ou lacuna de observação bloqueiam novas admissões até uma janela de amostras saudáveis consecutivas. A histerese evita alternar rapidamente entre executar e pausar.

O perfil inicial usa idade máxima de amostra de 2 segundos e recuperação de 5 segundos. São parâmetros configuráveis e testados por limites; não alegações de reação do SO nesses prazos. Estado térmico desconhecido não é nominal. Modelos e tarefas de fundo precisam de consentimento explícito e temperatura nominal; fundo exige alimentação AC confirmada. O CLI não inventa esses dados quando o host não os oferece.

Uma reserva precisa caber simultaneamente no orçamento da instância, na margem livre observada menos a reserva da estação e no número de slots. Recusar uma operação não apaga uma reserva anterior. Cancelamento ou timeout do chamador não significa que o trabalho terminou: o dono deve liberar o lease somente após conclusão ou fechamento real do filho.

Estimativas de bytes e amostras não impedem uma alocação inesperada ou uma aplicação externa de consumir RAM depois da admissão. Enforcement rígido precisa de suporte do host/supervisor e medição de todo o grupo de processos. Essa integração ainda não existe. Em particular, `os.freemem()` é um indicador conservador, não uma implementação completa de pressure, compressão e energia do macOS.

Complexidade: aquisição e liberação têm custo médio O(1), com estado proporcional às operações simultâneas; o limite de slots impede crescimento ilimitado dessa tabela. Nenhum thread de polling foi criado pelo módulo. O serviço que vier a usá-lo deverá fornecer amostras e definir backpressure.

## 4. Awesome RSI: fonte de classificação, não pacote de runtime

O catálogo consultado registra 524 trabalhos e separa o objeto alterado, o verificador, a mudança persistida e os controles externos. Sua taxonomia L1–L5 vai da execução de procedimentos definidos externamente à melhoria do mecanismo que produz futuras melhorias. Os níveis não são rankings de qualidade; trabalhos precursores e formas limitadas de autonomia estão explicitamente incluídos. Não foram reproduzidos ou auditados todos os 524 trabalhos. [S01][S02]

A aplicação proposta no BBrainX é um manifesto de experimento com campos distintos:

```text
objeto alterado | baseline | conjunto de desenvolvimento | holdout
verificador fixado | orçamento | critérios não negociáveis
artefatos de execução | decisão humana | versão aceita | rollback
```

Hardware MAX não concede autonomia L5. Memória persistente não significa treinamento. Um script que repete testes não é por si só autoaperfeiçoamento recursivo. A biblioteca adicionada nesta rodada oferece replay sob estratégias fixas; não fecha autonomamente um ciclo de criação, avaliação e promoção de novos mecanismos.

### Quatro objetos de evolução que não podem ser confundidos

**Contexto e memória:** atualizações incrementais de conhecimento, com proveniência e revisão.

**Política de busca/orquestração:** seleção de leituras, branches e critérios de parada dentro de um contrato autorizado.

**Código e ferramentas:** mudanças revisáveis em bibliotecas e adaptadores, testadas numa worktree isolada.

**Pesos e calibração:** treinamento supervisionado ou por preferências, com dataset próprio e runtime separado.

O critério de aceitação permanece fora do alcance do candidato. Uma política não pode remover testes, reduzir a matriz de requisitos ou alterar o que conta como sucesso para vencer seu próprio experimento. O orçamento limita tanto experimentos aceitos quanto tentativas descartadas.

## 5. Dream-RSI e o replay efetivamente implementado

Dream-RSI usa árvores históricas para avaliar políticas de exploração; o agente de descoberta e o avaliador permanecem fixos enquanto um desenvolvedor de políticas altera o código de busca. Sua regra de seleção garante apenas score médio de replay não inferior ao baseline incluído no mesmo histórico. Isso não garante melhoria em tarefas futuras. O trabalho tem autores de universidades e Google DeepMind, e não consiste em reexecutar gratuitamente toda uma descoberta. [S03]

### Contrato BBrainX desta rodada

O input representa raiz e cadeias registradas. Cada nó tem identificador único, pai anterior, ordinal crescente, score finito, aceitação booleana e custo inteiro. Exige projeto, snapshot, versão do avaliador, hash do verificador, unidade de custo e origem `recorded` ou `fixture`.

A raiz pode abrir várias cadeias; cada nó não raiz pode ter no máximo um sucessor registrado. Escolher raiz revela o próximo filho pela ordem gravada. Escolher uma folha revela somente sua continuação registrada. As três estratégias — round-robin, depth-first e best-observed — só priorizam informações já reveladas. Resultados futuros são acessíveis ao mecanismo de validação do arquivo, mas não à lógica que escolhe qual branch observar. O teste altera scores ocultos e exige a mesma primeira ação.

Não existe política executável recebida do arquivo. Uma string não vira função, shell ou plugin. Campos não conhecidos são recusados. A ausência de continuação é reportada, nunca completada por geração. Um custo futuro maior que o orçamento encerra o replay depois da escolha; o simulador não usa esse custo escondido para selecionar antecipadamente outro caminho barato.

Os limites são 10 mil nós, 20 mil passos e 8 MiB no leitor de arquivo. Validação e parse são síncronos, mas limitados; a navegação cede o event loop a cada 32 iterações. Cancelamento cooperativo é exercitado com eventos reais. Isso não demonstra preempção de um parser, de SQLite síncrono ou de um kernel de GPU.

A deque mantém inserção/remoção O(1) nas estratégias simples. Um heap binário estável ordena fronteira por score observado em O(log F), com F folhas candidatas. A indexação causal é O(N); não há cópia de toda a fronteira por decisão. O total é O(N + K log F) no pior caminho implementado e O(N + K) nas deques, além da serialização das ações devolvidas. O estado é O(N + K), ambos limitados.

O custo representado soma unidades históricas; o tempo do replay mede o programa atual, não a duração que uma nova execução dos agentes teria. A CPU é do processo durante a medição, não um contador por tarefa isolado de toda concorrência. O hash identifica bytes normalizados, mas não autentica a veracidade de um histórico.

Não foram implementados geração de políticas por LLM, rollout online, batches paralelos do artigo, promoção automática ou treinamento. A porta de replay é uma ferramenta de avaliação. É deliberadamente menor que o método completo e seus outputs declaram essas limitações.

## 6. RLHF, RLAIF e métodos de preferência: decisões de adoção

| Trabalho | O que a fonte sustenta | Uso proposto; não executado nesta rodada |
|---|---|---|
| InstructGPT | Demonstrações supervisionadas, preferências humanas, reward model e otimização por PPO. [S04] | Aprender a organizar dados e critérios; não instalar PPO no daemon local. |
| DPO | Otimiza diretamente a política a partir de pares de preferências na formulação apresentada, sem reward model explícito separado. [S05] | Experimento de modelo generativo com dados autorizados; não trata o encoder Laya como gerador. |
| Constitutional AI | Crítica/revisão e feedback de IA guiados por princípios definidos externamente. [S06] | Rubrica revisável para propostas, mantendo autorização e aprovação determinísticas. |
| Self-Instruct | Gera e filtra instruções/dados para ajustar modelos. [S07] | Ampliar candidatos de treino somente depois de deduplicação, revisão e separação de teste. |
| UltraFeedback | Dataset e feedback de IA em escala; título e versões mudam no registro. [S08] | Referência de curadoria, não verdade independente produzida pelo mesmo juiz. |
| Let's Verify Step by Step | Estuda supervisão de passos em raciocínio matemático. [S09] | Analogias com etapas públicas do workflow; não importar garantias matemáticas para código. |
| STaR | Bootstrapping de justificativas filtradas por respostas corretas, com ajuste do modelo. [S10] | Lembrar que correção exige sinal externo; não dizer que elimina gabaritos. |
| Self-Rewarding LMs | Usa julgamento pelo modelo em ciclos de treinamento por preferências. [S11] | Medir viés e reward hacking; nunca autoaprovar uma memória por concordância do gerador. |
| KTO | Alinhamento com sinal de desejabilidade, sem exigir pares explícitos no mesmo formato do DPO. [S12] | Investigar quando feedback real é binário; não alterar pesos automaticamente. |
| IPO | Oferece uma formulação teórica alternativa para aprender preferências, com objetivo e regularização próprios. [S13] | Não reduzi-lo a um patch universal que elimina todo overfitting do DPO. |
| GRPO / DeepSeekMath | Remove o critic separado usando comparações relativas do grupo; ainda requer sinal de recompensa/avaliação. [S14] | Laboratório de treinamento generativo; não mecanismo gratuito de cache ou segurança. |

Antes de treinar Laya, separar erro de tarefa fora da distribuição, instruções das alternativas, corte de opções, tokenizer e calibração. Publicar conjuntos de treino, calibração e holdout por escopo permitido, ou seus manifestos redigidos quando privados. A decisão do mantenedor de realizar fine-tuning em trabalho separado é preservada.

Uma precisão global desejada de 99% não é um contrato sem população. Medir acurácia seletiva junto de cobertura, por tarefa e idioma. Um classificador que se abstém em tudo não erra escolhas aceitas e também não presta o serviço esperado. Nenhum método acima remove essa exigência.

## 7. Correções e limites das evidências fornecidas

| Fonte | Leitura conferida nesta revisão | Consequência para o desenho |
|---|---|---|
| LoLBench | O ganho assistido por árvores/APIs usa contexto derivado das referências do benchmark; não é um grafo construído às cegas no BBrainX. [S15] | Não usar informação de solução durante localização ou aprendizado. |
| SWE-INTERACT | O trabalho analisa interação e falhas ao longo da tarefa. A afirmação de aproximadamente um terço de rótulos, do anexo, não foi confirmada aqui no registro consultado. [S16] | Preservar a hipótese do ledger sem publicar essa porcentagem como medição nossa. |
| SlopCodeBench | A versão atual consultada reporta erosão em 77% e aumento de verbosidade em 75,5% das trajetórias. O anexo menciona 80% e 89,8%. [S17] | Versionar citações e medir degradação estrutural; não propagar o número antigo sem sua versão. |
| LocAgent | Localização em grafo é avaliada com modelos e treinamento específicos, não um runtime local de 0,4B. [S18] | Comparar por tarefa, orçamento e modelo, sem importar seus percentuais. |
| Codebase-Memory | Os 83% versus 92% se referem à qualidade de respostas no experimento descrito, não ao Loc@k do BBrainX. [S19] | Orientação por grafo e confirmação por leitura é hipótese de composição, não ganho já demonstrado. |
| ACE | Trata evolução estruturada de contexto e problemas de atualização por compressão. [S20] | Atualizações de conhecimento por delta e proveniência; não proibir reconstrução de índices derivados. |

Também é necessário separar verdade observada de regra normativa. O conceito propõe `código > instruções do projeto > notas > backlog`. Isso não deve ser uma única precedência universal: código pode conter o bug que viola uma política aprovada. Para comportamento observado, código/testes na revisão são evidência; para obrigação, a política aprovada define o esperado. Divergência precisa ser exibida e resolvida, não apagar a regra.

Bitemporalidade deve separar tempo de validade do fato e tempo de registro no sistema. Hash alterado invalida uma observação ancorada naquele trecho, mas não revoga por si só uma decisão arquitetural durável. Esta rodada não adiciona tabelas bitemporais ou aprovação automática; descreve a migração que deverá ter suas próprias provas.

## 8. Ledger de requisitos: especificação para a próxima mudança de domínio

Cada requisito deve possuir identidade estável, origem aprovada, escopo, revisão, critério executável quando possível, responsável e evidências. Uma evidência tem snapshot, comando ou verificador, resultado e origem. Estado `declared` não equivale a `verified`.

O estado de conclusão só pode ocorrer se todos os requisitos obrigatórios estiverem verificados ou houver dispensa explícita por pessoa autorizada. Um commit é um artefato de mudança, não prova universal de cumprimento. Alterar o requisito ou o snapshot invalida as aprovações incompatíveis. Eventos e estado devem ser persistidos transacionalmente e controlados por versão esperada.

Contribuições de regras não recebem automaticamente capacidade de executar comandos. Manifestos declarativos devem indicar efeitos, inputs, outputs e budgets; validadores independentes decidem se podem entrar no pipeline. Nenhuma regra comunitária pode conceder acesso a outro projeto, remover testes obrigatórios ou alterar segredos como parte de um suposto ajuste de desempenho.

O próximo experimento de grafo deve começar com um comparador externo. Não construir outro parser universal sem comparar com Codebase-Memory MCP, Serena e o mapa de repositório do Aider. Sintaxe Tree-sitter, resolução LSP e relações inferidas precisam de tipos diferentes; representar uma aresta não prova seu significado em linguagens dinâmicas. [S27][S28][S29]

Busca binária para um orçamento só é correta quando a função de custo usada é monotônica no domínio pesquisado. A contagem BPE de serializações concatenadas pode mudar nas fronteiras; realizar contagem exata final e fallback conservador. Não cortar contratos obrigatórios para preservar um alvo de payload.

## 9. Conexão Codex e abertura do banco: correções concretas

O helper adicional usa a raiz registrada pelo host e produz o caminho `.codex/config.toml`, com executáveis absolutos, servidor opcional e nome TOML escapado. IDs com ponto não criam tabelas aninhadas porque a chave é citada. Caminhos com controles são recusados e strings com aspas recebem escape. O teste Windows verifica a serialização, não uma sessão autenticada do Codex no Windows. [S31][S32]

Não escreve arquivos, não amplia confiança, não altera outros MCPs e não migra o registro global anterior. Validar carregamento no projeto correto, ausência no outro projeto e uma chamada real são passos independentes. Trocar o nome do servidor não é autorização. A extensão Codex e o cliente MCP genérico do VS Code não compartilham necessariamente o mesmo arquivo de configuração.

No `BrainStore`, a abertura anterior sempre executava `BEGIN IMMEDIATE` para preparar o schema, inclusive quando a versão já estava atualizada. O novo caminho abre uma leitura `DEFERRED`, confere versão e hash no mesmo snapshot e encerra sem disputar a vaga de escritor. Quando criação ou migração é necessária, permanece o caminho de backup e transação de escrita com revalidação.

Um teste usa dois processos: o pai mantém `BEGIN IMMEDIATE`; o filho abre o banco atual e lê o catálogo. O teste reprova ao restaurar a implementação original e passa no candidato. Isso é uma contraprova de contenção evitável, não uma promessa de tempo fixo de startup sob qualquer filesystem. WAL permite leitores concorrentes, mas alterações do modo de journal, migrações e limites de armazenamento continuam podendo contender. [S30]

## 10. Oportunidades internacionais selecionadas

A seleção é por capacidade demonstrada, não por nacionalidade presumida de autores. Um nome asiático, russo ou europeu não aumenta o peso da evidência.

| Fonte | Técnica a estudar | Fronteira de adoção |
|---|---|---|
| Codebase-Memory MCP | Índice estrutural persistente e ferramentas MCP para navegação. [S27] | Comparador externo antes de novo grafo; revisar efeitos de instalação e licença da versão. |
| Serena | Referências e símbolos apoiados por servidores de linguagem. [S28] | Perfil opcional por linguagem, medindo custo e recuperação. |
| Aider | Mapa de repositório orientado por relações e orçamento. [S29] | Extrair a organização, não iniciar outro agente dentro de toda chamada. |
| morluto/rea | Evidências tipadas, inspeção e comparação de artefatos. [S33] | Aplicar ao contrato de evidência; não importar capacidades de exploração ofensiva. |
| reverse-skill | Registro declarativo e regressões para rotas de procedimentos. [S34] | Configuração verificável, não scripts comunitários executados sem revisão. |
| ScrapeGraphAI | Grafo de processamento com uso de LLM isolável. [S35] | Só quando ingestão externa fizer parte do escopo autorizado. |
| Maxun | Referência de empacotamento de automação e ingestão. [S36] | Não foi incorporado; licença e efeitos precisam de revisão por componente. |
| autoresearch | Experimentos delimitados com critério keep/revert. [S21] | Treinamento e uso de GPU são outro perfil, não baseline MEDIUM. |
| GEPA | Evolução guiada por feedback de programas/prompts. [S22] | Avaliação com holdout e guardrails externos, sem runtime automático nesta entrega. |
| Darwin Gödel Machine | Evolução empírica do código do agente. [S23] | Não confundir melhoria experimental com prova formal geral. |
| Harness-Zero e Meta Context Engineering | Exploram adaptação de harness/skills em recortes específicos. [S24][S25] | Candidatos de pesquisa; nenhuma superioridade do BBrainX foi inferida. |

As referências não viram dependências desta branch. Código original está separado de licenças de terceiros. A expressão de que uma licença 'contamina' qualquer estudo é imprecisa: obrigações precisam ser analisadas sobre o componente e a forma de distribuição. Esta rodada não copia código dos projetos listados nem seus datasets ou pesos.

## 11. Devolução científica para o produto

Toda proposta deve responder: qual falha reproduzida resolve, qual objeto muda, qual invariante preserva, qual baseline vence, quais custos adiciona e como reverter. O valor de uma melhoria é medido por tarefa aceita e impacto na estação, não pelo tamanho do catálogo bibliográfico.

O mapa de evolução recomendado é: menor contenção e conexão correta; programa de medições MEDIUM; replay de histórico curado; ledger de requisitos com evidência; grafo avaliado; calibração Laya; apenas depois um gerador de políticas sob limites. O mecanismo que mede qualidade não deve ser reescrito silenciosamente pelo mecanismo que busca vencer essa medida.

A afirmação de lançamento 'nossos maiores testes foram em MEDIUM' permanece bloqueada até existir uma série rastreável de execuções nativas e critérios de predominância. Os testes da CI validam código e protocolos; `measuredMedium` continua `false`. O próximo marco é operar com um editor e aplicações normais abertos, concluir tarefas reais e provar que essa coexistência preserva a experiência do usuário.

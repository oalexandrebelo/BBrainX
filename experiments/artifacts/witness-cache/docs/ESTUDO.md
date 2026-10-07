# BBrainX: MCP, execução durável e reuso com dependências verificáveis

**Data:** 07/10/2026. **Fonte da solicitação:** mensagem atual e `Markdown colado.md`, com os estudos anteriores de RSI e observabilidade. Os handoffs de 04–06/10/2026 são registros históricos, não medição atual do produto. As referências [Rxx] estão em FONTES.md. A matriz científica mantém separados o que o material recebido afirma e o que a fonte externa sustenta.

## 1. Diagnóstico arquitetural

O material organiza soluções em MCP, frameworks de agentes, execução durável e três camadas de cache. A organização é útil, mas não basta para escolher uma dependência. Faltam os objetos que cada sistema conserva, a autoridade que os valida e o contrato de falha. Um estado interno de atenção de um modelo não tem o mesmo ciclo de vida de uma decisão aprovada; um checkpoint de workflow não autoriza repetir uma transferência que pode ter sido concluída externamente.

O primeiro resultado da revisão é separar seis objetos: **evidência canônica**, **materialização recuperada**, **resultado exato de computação**, **histórico de execução**, **ativações de inferência** e **parâmetros treinados**. Acrescente um sétimo domínio separado: credenciais. Segredos não pertencem ao contexto por serem frequentemente usados.

A oportunidade fora do padrão é tratar a preparação do contexto como construção incremental. Em vez de inserir tudo em um banco de “memórias inteligentes”, cada derivado declara suas entradas e sua implementação. O cache pode reutilizá-lo se o host confirmar que as dependências e o acesso continuam compatíveis. Se essa confirmação custar mais que recomputar, o derivado não merece cache. Essa é uma proposta de aplicação ao BBrainX, não uma nova descoberta de computação incremental.

O repositório foi consultado nesta rodada: main permanece em `a9636e9`; PR #10 continua aberto, head `9e8424cb`. Essa entrega não altera nenhuma dessas revisões. Os controles publicados anteriormente são base de integração futura, não foram reexecutados como parte da suíte local entregue aqui. [R01–R02]

## 2. A. Ecossistema MCP direto e standard tooling

### 2.1 FastMCP: três identidades que não podem ser confundidas

A leitura atual identifica o projeto Python em **PrefectHQ/fastmcp**, anteriormente acessado por `jlowin/fastmcp`. Seu README aponta um counterpart TypeScript da mesma equipe, `@prefecthq/fastmcp-ts`. Há também o projeto distinto **punkpeye/fastmcp**, pacote `fastmcp` no npm. Este último documenta compatibilidade com revisões legacy com handshake e não com `2026-07-28`. O nome de uma biblioteca não identifica sua versão do protocolo. [R03–R04]

A designação “superior em alto desempenho” não foi demonstrada por um ensaio pareado das seis ferramentas do BBrainX. Reduzir boilerplate é um benefício de engenharia; não elimina serialização, validação, fila, processo filho, rede ou uma regra de autorização lenta. Nenhuma dessas bibliotecas foi instalada nesta rodada.

**Decisão proposta:** conservar o domínio BBrainX separado de um `TransportPort`. Implementar um adapter de referência em ambiente isolado só quando houver requisito novo ou ganho de manutenção verificável. Não trocar a camada atual para reproduzir o mesmo conjunto de ferramentas com mais dependências, e não manter protocolo próprio por orgulho se os testes mostrarem menor custo total com um SDK.

O manifesto de compatibilidade deve incluir nome completo do pacote, versão, revisão MCP, transporte, features anunciadas, limites, modelo de autenticação e clientes examinados. O loader não aceita nomes de executável ou pacote sugeridos por uma memória recuperada. Servidores são instalados pelo host, com consentimento, não por conteúdo de ferramenta.

### 2.2 SDK oficial não certifica a aplicação

A página oficial classifica SDKs por suporte e maturidade; TypeScript, Python e Go aparecem entre os Tier 1 consultados. Isso orienta escolha, mas não garante que um binário antigo implemente a revisão atual, que o aplicativo anuncie somente capacidades reais ou que sua autorização esteja correta. [R05]

A suíte diferencial proposta compara a camada existente a um SDK fixado: mensagens válidas, campos extras, IDs duplicados, UTF-8 fragmentado, cliente lento, cancelamento, fim de stdin, respostas grandes e matriz de revisões. O oráculo é o contrato da especificação, não “a outra implementação fez igual”. Divergência pode estar em qualquer lado.

Descoberta de catálogo merece cache exato por versão e escopo; catálogo parcialmente autorizado não deve ser reutilizado por outro usuário. O schema é uma superfície semântica: uma mudança de enumeração ou de descrição que afeta o agente precisa mudar a identidade relevante do pacote. Ordem das opções não deve ser alterada para obter mais hits quando ela muda a sequência efetiva enviada ao modelo.

### 2.3 Middleware e operações incompletas

FastMCP documenta ordem de middleware e distingue suas funcionalidades da especificação MCP. Interceptar retorno não equivale a confirmar um efeito de negócio, e uma interação que solicita entrada adicional não terminou a operação. [R06]

Para BBrainX, o pipeline deve explicitar **recebido**, **validado**, **autorizado**, **admitido**, **executado**, **verificado**, **publicado** e **entregue**. Não tratar todo HTTP 200, JSON válido ou `isError:false` como tarefa concluída. Observadores de métricas ficam fora da transação de decisão; auditoria obrigatória deve estar no commit pertinente, não apenas numa fila de telemetria.

## 3. B. Frameworks de agentes e isolamento de ferramentas

### 3.1 LangChain e LangGraph

A documentação vigente direciona a `langchain.mcp.MCPAdapter`, baseado em FastMCP, com `langchain[mcp]>=1.4.0` em beta e migração de `langchain-mcp-adapters`. Diferencia URL fornecida como string de script fornecido como `Path`. Essa restrição reduz a ambiguidade entre endereço remoto e execução de arquivo local. LangGraph distingue checkpointers por thread e stores entre threads; `InMemorySaver` perde estado ao reiniciar. [R07–R08]

**Aplicação proposta:** tratar LangGraph como consumidor opcional da mesma autoridade de contexto, não como segundo banco de aprovação. Seu checkpoint pode registrar o nó corrente do fluxo; o ledger BBrainX registra requisitos, decisões e revisões de conhecimento. Duplicar essas responsabilidades sem um dono definido produz divergência.

A combinação precisa responder: quando um grafo retoma, quais decisões podem reutilizar resultados antigos e quais leituras devem consultar o estado atual? O histórico de execução pode recuperar a resposta original de um passo sem fazer a chamada de novo; uma nova consulta de autorização deve consultar a política vigente. Misturar esses dois contratos pode ressuscitar uma permissão revogada.

Uma chamada rejeitada por capacidade não deve acionar outro agente mais privilegiado como fallback automático. O roteador escolhe entre destinos já autorizados. O tipo da operação, o destino e a classificação dos dados são filtros anteriores ao custo e à preferência de modelo.

### 3.2 CrewAI, AutoGen e sandbox

CrewAI documenta Flows para execução estruturada. O repositório AutoGen consultado informa modo de manutenção, sem novas funcionalidades, e remete novos projetos ao Microsoft Agent Framework. São situações atuais distintas, não uma única recomendação estática de multiagentes. [R09–R10]

Definir um especialista em QA e outro em código não cria isolamento de processo. Uma ferramenta que roda shell no host continua com as permissões desse host. Separação de função do agente, allowlist de ferramenta, sandbox do SO, namespace de memória e autorização de rede são controles diferentes.

Para o perfil MEDIUM, nossa proposta permanece um coordenador com quantidade limitada de trabalho adicional. Paralelizar análises de arquivos independentes pode ser útil; duplicar carregamento de modelos e indexadores por agente pode consumir o orçamento inteiro antes de haver progresso na tarefa. O custo de coordenação deve entrar no benchmark: mensagens entre agentes, contexto repetido, resultados abandonados e retrabalho de integração.

## 4. C. Engines de execução resiliente

### 4.1 O significado operacional de durabilidade

Temporal mantém Activities regulares no serviço com ciclo de vida, filas, timeouts e retries. Uma perda de tarefa é tratada pelo timeout e política configurada; cancelamento depende da comunicação da atividade. Inngest documenta resultados de steps concluídos, IDs estáveis e reexecução de código fora dos steps; afirma explicitamente que uma ação externa não se torna exactly-once só por estar num step. Hatchet baseia sua camada durável em eventos/checkpoints sob premissas específicas de espera e child tasks. [R11–R13]

**Consequência para o BBrainX:** checkpoint de execução não é cópia de instrução de CPU nem prova de que uma API externa não executou. Recuperar do “exato ponto da falha” é uma formulação incompleta; a fronteira observável é o último progresso persistido segundo aquele contrato.

### 4.2 Três classes de operação propostas

**Leitura recomputável:** busca ou parse. Pode repetir quando as dependências e o acesso continuam válidos. Não apresentar resultado histórico como leitura atual sem verificar a revisão.

**Mutação local transacional:** checkpoint, aprovação ou reserva no mesmo banco. Idempotência tem fingerprint e versão esperada; estado e evento relevante confirmam juntos. Um retry com mesma chave e outro conteúdo é conflito, não nova execução silenciosa.

**Efeito externo:** publicação, deploy, envio ou chamada faturada. Registrar intenção e ID de tentativa antes de executar. Se a resposta se perde, usar `OUTCOME_UNKNOWN`, manter reserva e reconciliar. O destino precisa de idempotência ou consulta confiável de resultado. Sem isso, exigir revisão em vez de repetir cegamente.

Uma compensação é nova ação, não viagem ao estado anterior. Tokens faturados e mensagens já entregues não desaparecem. Cancelar a espera do harness também não libera vaga enquanto o worker continua rodando. Uma reserva expirada não deve ser reutilizada se o escritor antigo ainda puder produzir efeitos; a geração deve ser verificada pelo destino.

### 4.3 Perfil local versus serviço compartilhado

Não recomendo instalar três engines duráveis no core. Para o primeiro produto, manter checkpoint e ledger locais bem definidos. Oferecer um `DurableExecutionPort` para operações que realmente exigirem sobrevivência entre hosts, esperas longas ou orquestração externa. A adoção precisa vir com plano de armazenamento, recuperação, migrations e operação.

Quando o Mac dorme, um serviço somente local também para de executar. Durabilidade conserva progresso; disponibilidade requer recursos ativos em outro lugar. Essa transferência deve ser explícita, pois muda egress, credenciais, faturamento e fronteira de privacidade. Soberania local não pode desaparecer quando falta RAM ou bateria.

## 5. Pesquisas Meta: o que pode ser transferido

### 5.1 Memory Layers at Scale: parâmetros, não histórico de usuário

O paper distingue explicitamente K e V treináveis de ativações produzidas por atenção. Emprega busca esparsa e product keys, além de compartilhamento de parâmetros entre camadas e paralelização de memória. Os custos incluem armazenamento, acesso e estados de otimização; não se trata de um banco de conversas revogável conectado a qualquer modelo. [R14]

A leitura detalhada não sustenta a afirmação de que essa arquitetura substitui o contexto de um agente existente sem treinamento. Tampouco permite apagar seletivamente uma decisão privada de pesos apenas porque sua linha foi removida do SQLite. Como cálculo dimensional, 128 bilhões de valores FP16 ocupam 256 bilhões de bytes antes dos demais estados. Isso não é configuração MEDIUM.

**Insight transferível, como proposta:** desacoplar capacidade de armazenamento da quantidade de informação ativa por decisão. Manter conhecimento e evidências completos no armazenamento autorizado; construir um conjunto pequeno de dependências para cada computação. Não ativar todos os recursos só porque existem. Essa analogia não reproduz as melhorias de qualidade do paper.

O README do projeto de implementação pesquisado declara CC-BY-NC; não incorporar seus arquivos ao core MIT sem analisar a licença específica e os arquivos efetivamente usados. Esta entrega não copia o código de treinamento ou kernels. [R15]

### 5.2 SAM 2: memória recente e âncoras de interação

SAM 2 distingue memórias de frames recentes e de frames com prompts. Compartilha features por frame, mas conserva estado por objeto; a memória inicial pode permanecer na tarefa de tracking. Em uso interativo, frames com prompts podem ser futuros em relação ao frame processado. Portanto, nem todo cenário descrito equivale a streaming estritamente causal. [R16]

**Hipótese para o BBrainX:** três conjuntos separados: âncoras aprovadas e requisitos ainda abertos; janela recente limitada; artefatos frios recuperáveis. A janela recente não pode expulsar a única restrição normativa. Compartilhar parse imutável dentro do mesmo domínio de confiança não significa compartilhar decisões ou permissões entre usuários.

O equivalente de uma oclusão seria uma evidência temporariamente indisponível. O sistema deve registrar `unknown` ou `needs_revalidation`, não inventar uma fonte porque tinha visto algo parecido. Isso é uma escolha de governança do BBrainX, não um resultado experimental do SAM 2 sobre agentes de programação.

### 5.3 S-EMBER: avaliação causal com localização da evidência

A pesquisa Meta S-EMBER, de julho de 2026, avalia recuperação episódica visual em streaming, exigindo localização temporal da evidência. É uma referência mais direta para distinguir observação causal e consulta offline do que importar cegamente números de segmentação. [R17]

**Proposta de ensaio:** para cada decisão do agente, expor somente eventos disponíveis naquele instante; avaliar não apenas a resposta, mas a revisão e intervalo que a sustentam. Uma solução publicada depois não pode entrar no cache ou treino que avalia uma tentativa anterior. Benchmarks de vídeo e software continuam trilhas separadas; o princípio de proveniência é transferível, o placar não.

### 5.4 Llama e Llama Stack

No lançamento Llama 3.2 consultado, 1B/3B são textuais e 11B/90B incluem visão. Llama Stack é apresentado como contratos/API e composições de providers. Esse desenho de substituição por interfaces é pertinente; a documentação atual do Stack tentada nesta sessão não foi obtida, então não aprovamos uma API ou versão de pacote corrente. [R18]

Para o BBrainX, um manifesto de backend deve declarar tokenizer, modelo, quantização, tarefas suportadas, limite de contexto, transporte, cancelamento, batch e contadores observados. Um endpoint OpenAI-compatible não garante a semântica de billing ou todos os recursos de outra API. Pesos de modelos e código de SDK podem ter licenças diferentes.

### 5.5 Movie Gen, Chameleon e Spirit LM

Movie Gen é pesquisa de geração/edição de mídia; Chameleon explora tokenização multimodal early-fusion; Spirit LM integra fala e texto. Nenhum desses trabalhos transforma automaticamente estado neural em memória de projeto governada. [R19–R21]

A oportunidade de engenharia é manter um contrato tipado de evidência multimodal: modalidade, codec, timestamp, origem, checksum, processamento aplicado e custo. A modalidade determina o parser e seus recursos. Não converter um vídeo inteiro para texto nem iniciar transcrição quando o objetivo só precisa de metadados. Essas integrações ficam fora do core MEDIUM até existirem tarefas que demonstrem necessidade.

## 6. Cache: objeto, identidade, invalidadores e observação

| Objeto | Identidade mínima proposta | Invalidadores | Não confundir com |
|---|---|---|---|
| Parse/outline | projeto, hash de conteúdo, parser/configuração | conteúdo ou parser incompatível | resultado de uma tarefa de código |
| Busca | consulta, corpus/índice, política, escopo | novo candidato, ranking, acesso | parse de um arquivo isolado |
| Contexto | busca, memória, tarefa, orçamento/tokenizer | revisões ou evidências relevantes | tokens faturados de um harness |
| Decisão | modelo, calibração, estado, perguntas ordenadas | entrada/versão/limites | autorização ou avaliação atual |
| Histórico de workflow | execução, etapa, tentativa, versão do fluxo | semântica da retomada | resposta para uma nova consulta |
| KV/prefixo | tokens efetivos, modelo, runtime, trust scope | prefixo/modelo/precisão incompatíveis | memória portátil entre modelos |
| Parâmetros treinados | checkpoint de modelo e configuração | treinamento/alteração de pesos | SQLite revogável por projeto |

### 6.1 RedisVL: TTL de uso não é limite de obsolescência

RedisVL SemanticCache trabalha com vetores, limiar de distância e filtros. A documentação consultada descreve distância cosseno, não probabilidade de correção. Seu fluxo de `check()` pode renovar TTL de entradas encontradas, inclusive das que não serão efetivamente usadas pelo chamador. Portanto, TTL deslizante não limita por si só o tempo de permanência de informação obsoleta muito consultada. [R22–R23]

A proposta BBrainX exige revisão de conteúdo/coleção, política e autorização antes de reutilizar. O filtro deve vir do host, não de um campo `project` escolhido pelo modelo. Uma busca vetorial em RAM também possui custo de embedding e transporte; não há base nesta revisão para prometer lookup end-to-end submilissegundo.

Para documentos imutáveis e escopo restrito, um cache semântico pode entrar em teste. Para ações, aprovações, nova execução de testes ou recibos de consumo, proximidade semântica não autoriza reutilizar sucesso. O laboratório entregue recusa essas classes. Uma consulta antiga pode sugerir onde procurar, sem se tornar resposta final aceita.

### 6.2 SGLang e vLLM: prefill evitado continua tendo fronteiras

HiCache documenta níveis GPU, memória do host e armazenamento, com políticas de prefetch e escrita. Os tamanhos configurados por rank precisam ser multiplicados pelos processos/ranks que recebem a reserva, conforme o perfil aplicado. O suporte Apple Metal/MLX existe na documentação atual, mas não demonstra que todo backend/otimização HiCache CUDA seja equivalente no Mac. [R24–R25]

vLLM documenta identidade de prefixos por blocos e extras, além de `cache_salt` para particionar a reutilização entre domínios de confiança contra canais laterais de timing. A aplicação precisa escolher esse domínio; a presença do parâmetro não o faz obrigatório ou correto por si só. [R26–R27]

A redução de prefill não elimina fila, tokenização, leitura de KV durante decode, primeiro token ou transporte. Não projetar TTFT zero. Mantenha prefixo estável quando semanticamente correto, mas não reutilize um prefixo normativo revogado para melhorar hit rate. O byte exato importa; ordenar alternativas, ferramentas ou mensagens pode alterar comportamento e custo.

### 6.3 APIs proprietárias

OpenAI e Anthropic têm contratos próprios de cache, janelas, identificação e usage. O material de preço/cache precisa ser versionado. Tokens de entrada cacheados não são automaticamente gratuitos, e não são adicionados outra vez à entrada total quando já inclusos. [R28–R29]

Um checksum local de prefixo apenas registra a identidade dos bytes locais sob a hipótese de ausência de colisão. Não prova que o provider fez hit, que o harness enviou exatamente esse prefixo ou que não houve wrapper adicional. Registrar essas observações separadamente: compilado, entregue, enviado pelo adapter, contabilizado pelo provedor. Não preencher ausências com zero.

## 7. Reuso verificável: resultado de construção incremental

Build Systems à la Carte distingue agendamento e decisão de reconstrução, incluindo traces de dependências. Adapton investiga computação incremental orientada à demanda. A aplicação proposta ao BBrainX adiciona escopo de acesso, revisões de política e negativações de consulta à reutilização de derivados. Não é implementação completa de nenhuma dessas plataformas nem prova formal inédita. [R30–R31]

A intuição é simples, mas sua fronteira é rigorosa: um outline depende do arquivo e do parser; uma busca depende também do universo pesquisável. Se outro arquivo se torna o melhor candidato, verificar somente os hashes do resultado antigo é insuficiente. Um “nenhum resultado” também depende da coleção completa naquela geração. O banco de índice precisa invalidar buscas por alterações relevantes do universo, não apenas por edição dos documentos retornados.

O laboratório entrega um ticket opaco criado pelo host antes do cálculo. Ele captura acesso, revisões e dependências. Tanto hit quanto publicação revalidam o ticket. Não há `await` no trecho de publicação dentro do isolate. Um escritor de política intercalado antes da publicação causa recusa. Isso não torna a operação distribuída nem revoga uma cópia já entregue ao cliente.

O índice reverso liga recurso a entradas derivadas. Uma edição isolada não elimina todos os parses de arquivos independentes. A geração do índice pode invalidar todas as buscas pertinentes, porque seus candidatos e estatísticas globais mudaram. A política conservadora garante mais misses, mas evita servir um ranking incorreto como atual.

O hash do contrato inclui versão da transformação, tokenizer, parâmetros e modelo quando relevantes. A ordem interna de opções do modelo continua representada pelo hash dos argumentos; só nomes de dependências independentes são ordenados para serialização estável. Resultados diferentes para a mesma identidade geram conflito e retirada da entrada; não se assume determinismo apenas por temperatura zero.

## 8. Observabilidade que mede causalidade sem capturar o mundo

O anexo lista Langfuse, Helicone, LiteLLM e Phoenix. Eles oferecem caminhos de ingestão/tracing/gateway; o contrato relevante é se o evento foi realmente observado, quais parcelas de usage estão presentes e qual tarifa se aplica. Langfuse distingue uso/custo fornecido e inferido, e conserva condições para cálculo. [R32–R35]

A proposta é uma trilha metadata-only por tentativa. Registre identificador, modelo, contrato, projeto, hashes autorizados, latência por estágio e contadores finais disponíveis. Não inferir fatura pelo tamanho do texto, não somar raciocínio novamente à saída e não somar a estimativa à mesma chamada com custo informado.

Para o WitnessCache, medir hits exatos, bytes retornados, invalidações por razão, rejeições de revisão e computações evitadas. Nada disso, isoladamente, é “tokens economizados”. O harness pode ler o resultado e consumir a mesma quantidade de tokens com ou sem cache. O primeiro benefício é evitar trabalho local; só uma comparação de tarefa completa poderá estabelecer economia do pipeline.

Sugerimos um orçamento de medição próprio. Hashing, traces e serialização podem consumir a economia prevista. Com custo de recomputação C, custo de lookup L, verificação V, gestão amortizada G e probabilidade de hit válido h, o ganho esperado exige aproximadamente `h*C > L+V+G`, mantidos os demais efeitos iguais. A desigualdade é análise de custo, não número medido em modelos.

## 9. Condições de falha e critérios de integração

| Falha | Comportamento exigido na integração futura |
|---|---|
| Processo morre depois do cálculo e antes do commit | Derivado não confirmado; miss/recomputação, nunca recibo de execução inventado |
| Banco confirma mudança mas invalidation event se perde | Revalidação contra revisão autoritativa detecta a diferença; pub/sub não é única proteção |
| Filesystem muda sem evento de watcher | Reconciliar geração ou reler/hash no ponto necessário; não confiar somente em TTL |
| Modelo/adapter muda mantendo alias | Fingerprint completo muda; não reutilizar pela string do alias |
| Clock wall-time anda para trás | TTL local usa relógio monotônico; não persistir seus deadlines entre processos |
| Principal perde acesso durante computação | Recusar publicação e nova leitura; bytes entregues antes não são recolhidos |
| Cliente cancela mas trabalho persiste | Não liberar slot/lease antes da parada real |
| Duas tentativas produzem respostas diferentes | Não promover o primeiro resultado como determinístico; registrar conflito |
| Quota de cache esgota | Evicção controlada ou recusa; memória canônica não é removida |
| Laptop dorme e volta com recursos desatualizados | Reamostrar pressão e reconciliar estado antes de admitir trabalho opcional |

A prioridade de integração é retirar divergências entre PRs já existentes, consolidar invariantes e executar a suíte da combinação. Em seguida, conectar este mecanismo somente a uma computação determinística de leitura, com autoridade única de revisão. Não começar por ações mutáveis ou decisões de segurança.

## 10. Veredito da rodada

Não há vencedor universal de memória/cache. Para o BBrainX MEDIUM, a decisão mais defensável é manter armazenamento e governança locais pequenos, adotar dependências opcionais por contrato e medir quando uma computação merece reutilização. FastMCP/SDK reduzem responsabilidade de protocolo; workflow engines conservam progresso; RedisVL encontra vizinhos; KV engines reutilizam ativações; Memory Layers alteram o modelo treinado. São peças de problemas diferentes.

A contribuição executada nesta entrega é um laboratório verificável de dependências e invalidação, acompanhado de revisão científica e plano de integração. Não é mais uma release anunciada antes do merge, nem uma instalação pesada para demonstrar quantidade de recursos. O produto ganha quando outro harness continua a tarefa correta, com o estado correto, sem inutilizar a estação de trabalho.

# BBrainX: revisão de contratos e comparação com o ecossistema

**Data:** 7 de outubro de 2026. **Base:** `a9636e9402e3fa673ae05b3489202da1048aef5e`, versão 0.4.0. Este documento acompanha a branch `fix/core-contract-integrity`; código candidato não é release implantada. A revisão não modifica a main, configurações de harness, credenciais, modelos ou schema. Leia também [oportunidades](OPPORTUNITIES.md), [verificação](VALIDATION.md) e [fontes](SOURCES.md).

## 1. Estado: não somar branches como se fossem um único produto

A consulta à main continua na mesma revisão. Os PRs #6 (Atlas), #8 (MEDIUM/replay) e #9 (Observatory) estão abertos na consulta desta rodada. Não são implicitamente parte da main ou desta branch. O patch anterior de worker/cache Laya também não foi incorporado aqui. A integração precisa reconciliar contratos e rerodar a suíte da combinação, não somar contagens de testes de revisões diferentes.

Os materiais recebidos registram duas conexões concretas, em versões específicas: Claude Code e Codex. Cursor, VS Code e Gemini CLI têm configurações documentadas, mas aquele handoff não apresenta a mesma prova de execução para todos. Compatibilidade protocolar e gerador de configuração são necessários, não uma homologação universal.

A base preserva índice lexical, checkpoints transacionais, memória proposta/aprovada/revogada e um modelo Laya opcional que não altera o contexto por padrão. O custo de LLM do caminho determinístico é nulo; a operação ainda consome CPU, RAM e disco, e uma capability pode devolver contexto privado a um harness que usa um provedor remoto. Não substituir essa fronteira por “nada sai da máquina durante toda a sessão”.

Evidência num checkpoint é uma declaração com proveniência, não execução independente do comando. Estado `review_needed` não significa tarefa concluída e verificada. SQLite versionado não é registro imutável contra o próprio administrador local. Essas distinções são parte do produto, não notas descartáveis.

## 2. Invokta: atualização conferida e comparação correta

A main consultada do Invokta é `f1e2f04f98c967ab4bb73bd02c3fa581f04ce0e5`, o mesmo commit já registrado no estudo anterior. Seu último commit observado é de 3/10/2026, atualização de dependência do site. Portanto não encontramos novo delta de main desde aquela revisão. O changelog ainda contém recursos úteis; não os apresentamos como se tivessem aparecido entre nossas duas consultas. [S01–S03]

O Invokta é mais abrangente em tooling de Action Engines: contratos, validação de composição, inspeção, scaffolding, importação OpenAPI limitada, distribuição de capability packages, instalação reconciliada por cliente e MCP HTTP com fronteira OAuth. O BBrainX especializa o domínio: repositório, recuperação, memória aprovada e checkpoint. Comparar as duas superfícies pelo número de módulos ou linhas de código seria improdutivo.

O exemplo `agent-session-engine` já persiste sessões, tarefas, proprietário, revisão e contexto de retomada. Seu conector usa lock por sessão, identidade do dono, arquivo temporário sincronizado e promoção atômica. O exemplo distingue observação de hook de avanço de estado, documenta capacidades indisponíveis por harness e não rouba lock de processo vivo só porque passou um prazo. Logo, memória/checkpoint entre harnesses não é uma ausência intrínseca do Invokta. [S04]

O changelog documenta OpenAPI local com limites de construção, nomes portáveis, proteção da origem antes de aplicar credenciais e verificação do projeto gerado; endpoints MCP montados em caminhos próprios, reconciliados com sua identidade OAuth; auditoria de lockfiles independentes; e remoção de instalações preservando outras entradas. Esses são padrões a aproveitar como requisitos, sem reintroduzir obrigatoriamente o framework no núcleo. [S03]

Não demonstramos que o BBrainX esteja globalmente “à frente”. Temos um recorte diferente e evidências próprias, ainda com lacunas. Um contrato menor pode ser vantagem operacional se tiver comportamento rigoroso e instalação simples. Menos dependências não demonstra menor risco total quando o protocolo próprio aumenta responsabilidade de manutenção.

## 3. Falhas corrigidas nesta branch

### Prazo cobre a invocação, não somente run

A implementação anterior iniciava o deadline depois da validação de entrada e autorização. Uma promessa de acesso que não resolvesse mantinha a chamada pendurada; o cancelamento durante essa etapa não encerrava a espera. [S05]

O candidato inicia o prazo antes dessas etapas e passa o sinal vinculado à regra de acesso. Validação, acesso, execução e saída atravessam o mesmo gate. Um timer mais uma verificação monotônica em cada fronteira impede entrar no estágio seguinte quando uma operação síncrona já consumiu o prazo.

Isso não preempta código síncrono nem desfaz efeitos. Uma operação externa já iniciada pode terminar depois de TIMEOUT. Seu executor precisa de idempotência/reconciliação, e uma operação com outcome desconhecido não deve ser repetida cegamente. Autorização não deve produzir efeitos de negócio; o cancelamento da espera não mata I/O que ignora o sinal.

Há um sinal e um timer por invocação, não um timer independente e cumulativo por etapa. Rejeições tardias continuam com observador para não derrubar o processo. Eventos observáveis mantêm metadados, sem argumentos ou resultados. Um observador síncrono host-owned ainda pode bloquear a thread; este contrato não é hard real-time.

### Identidade congelada no início

O candidato captura entrada e principal antes do primeiro await. A autorização recebe cópias que não podem mutar a identidade posteriormente entregue à ação. Um chamador que altera `principal.id` enquanto um validador assíncrono aguarda não transforma retrospectivamente a identidade da chamada. Isso é isolamento de referências, não autenticação de processo remoto: o host continua responsável por construir o principal.

### Catálogo não pode ser envenenado por um leitor

`describe()` agora devolve uma cópia desconectada das árvores de schema. A estrutura anterior congelava o wrapper, mas expunha objetos e arrays internos mutáveis. Uma alteração em `inputSchema.properties` podia influenciar a descrição vista por outro cliente sem alterar o validador real. A proteção preserva a correspondência entre contrato publicado e validação.

O custo de clonar a descrição é proporcional ao schema e ocorre na descoberta. Não é colocado no loop de recuperação de chunks. Schemas são definidos pelo host; esta mudança não adiciona um interpretador de schema recebido de documentos não confiáveis.

### Decisões e bloqueios não viram números

A base preserva cabeçalho e memórias, mas sua compactação acima de metade do orçamento remove listas do checkpoint, inclusive `decisions` e `blockers`, substituindo-as por contagens. Por isso a afirmação “restrições nunca são cortadas” era forte demais. [S06]

O candidato preserva essas duas listas literalmente. Pode omitir histórico auxiliar com aviso e referência a `session_get`. Quando os campos obrigatórios não cabem, devolve `MANDATORY_CONTEXT_EXCEEDS_BUDGET` e não grava um evento de pacote compilado. Memória obrigatória não é sacrificada para acomodar o checkpoint.

Esta é mudança intencional do contrato: pacotes antes aceitos podem passar a ser recusados. Não existe paridade obrigatória com um resultado antigo que perdia uma restrição. Paridade é exigida nos cenários não afetados por essa correção. `done`, `evidence` e `filesTouched` ainda são históricos auxiliares no resumo; não se afirma que o checkpoint inteiro sempre entra.

### Verificar arquivo uma vez por rodada

Antes, cada chunk selecionado relia e hasheava seu arquivo inteiro. Com C chunks e U versões distintas, o custo repetido era proporcional à soma dos bytes de cada arquivo por ocorrência. Agora o mapa local usa `(path,file_hash)` e verifica uma vez por versão na rodada. O custo passa a ser proporcional aos bytes dos U arquivos mais o lookup dos C candidatos.

O mapa não vive entre invocações. Uma segunda chamada volta a verificar o arquivo, e `onStale=fail` continua recusando alterações. A deduplicação não congela a worktree nem resolve alterações posteriores à leitura; o executor precisa verificar novamente antes de editar. Não elimina a necessidade futura de indexação assíncrona e de snapshot coerente da memória governada.

A quota documental é checada antes de uma retokenização do prefixo. A contagem exata do último texto aceito é reutilizada. Não supomos que tokens de fragmentos sejam aditivos em BPE. Parte dessa micro-otimização também aparece no PR #9: a integração deverá reconciliar seu flag de medição e evento, em vez de sobrescrever o arquivo.

## 4. O que a comparação com concorrentes corrige

### OpenMemory: separar história, produto atual e instalação

O diretório `openmemory` foi removido do monorepo Mem0 pelo commit `ea2ee0758635a9230bd60855c3fe339170f6cd18`, em 29/07/2026. O guia de lançamento de 2025 continua apontando para aquele caminho e solicita chave OpenAI para a configuração demonstrada. O site atual apresenta captura de padrões de código, memória por projeto e controles de acesso. Não é adequado descrever toda a oferta atual como “só conversa em vetor”, nem dizer que uma captura de site comprova um runtime local offline. [S07–S09]

O aprendizado prioritário é aquisição e entrega com pouco atrito: identificar projeto, mostrar de onde veio a memória e permitir revisar o que foi servido. BBrainX não deve copiar onboarding com criação silenciosa de contas, inferência externa ou escopo global. A própria instalação precisa de um manifesto de capacidades observadas por versão do cliente.

### Basic Memory: muito além de uma pasta Markdown

A documentação atual combina Markdown, observações/relações, índice incremental, busca híbrida e reranking opcional. O inspetor revela estágios e razões de descarte a partir da mesma consulta. Um modelo de embeddings novo implica reconstruir vetores; reranking pode aumentar bastante a latência e não deve ser suposto gratuito. [S10–S12]

O README consultado declara AGPL-3.0. Não incorporamos código desse projeto ao núcleo MIT nesta rodada; qualquer reuso literal exige revisão específica. Integração por formato e implementação própria dos princípios são decisões diferentes. A função de comentários/sugestões documentada no MCP App faz parte da oferta Cloud descrita; não a atribuímos indiscriminadamente a toda versão OSS. [S10,S13]

A oportunidade é manter edição humana de primeira classe sem transformar qualquer edição externa em aprovação automática: exportar uma projeção versionada, importar como proposta, comparar revisão de origem e exigir aceitação. Ver OPPORTUNITIES.md.

### Mem0: distinguir plataforma gerenciada e biblioteca

O README atual apresenta um algoritmo ADD-only, agentes como origem de fatos, ligação de entidades e recuperação multissinal/temporal. Também declara que os placares apresentados são da plataforma gerenciada e incluem otimizações proprietárias, não números garantidos do SDK aberto. Não usamos esse placar para comparar nosso FTS local. [S14]

O BBrainX pode aproveitar acumulação de evidências sem sobrescrever história, mas não deve dar automaticamente o mesmo peso normativo à declaração do agente e à decisão humana. Fonte, aceitação e validade precisam continuar separadas. Performance de armazenamento sem extração de LLM não é comparação homogênea com um pipeline que faz extração, vetores e temporalidade.

### Graphiti e Zep não são o mesmo pacote

Graphiti oferece fatos com janelas temporais, episódios de origem e recuperação híbrida. A documentação distingue o framework com banco de grafos trazido pelo usuário da infraestrutura gerenciada do Zep. O caminho padrão pode envolver LLM/embeddings externos; instalar Graphiti não torna automaticamente o sistema local/offline. [S15]

Transferimos o modelo de tempo e proveniência para o roadmap, não toda a infraestrutura. O primeiro caso é uma decisão aprovada substituída por outra em data conhecida, mantendo consultas históricas. A invalidação por hash de um arquivo indica necessidade de revalidação, não que todo fato se tornou falso.

### Letta: avaliar a implementação ativa, não só MemGPT histórico

O README de `letta-ai/letta` direciona o desenvolvimento atual a `letta-ai/letta-code`; o servidor V1 está no ramo histórico. A documentação atual descreve MemFS, memória compartilhada entre conversas e agentes locais sem conta, além de caminhos com sincronização em nuvem. A comparação não deve ficar presa ao modelo antigo de blocks apenas. [S16–S17]

O diferencial a investigar no BBrainX é continuidade entre harnesses externos preservando suas identidades, não obrigar o usuário a adotar outro agente persistente. Identidade da tarefa é distinta da identidade do agente. Toda importação de memória de outro sistema continua com proveniência e revisão, sem herdar automaticamente privilégios.

### Cognee: há ingestão local e contexto de código

O README atual documenta extração com GLiNER e embeddings locais quando nenhuma chave de LLM foi configurada, com downloads iniciais. O extrator bundled é qualificado como demonstração; etapas dependentes de LLM são omitidas nesse caminho. Também descreve grafo de símbolos/dependências de código e destilação de lições de sessão. Isso contradiz a caricatura de um componente apenas de conversa que exige sempre nuvem. [S18]

A aplicação útil é separar modalidades de ingestão e seus contratos: texto, código e eventos de sessão não deveriam passar pelo mesmo extrator genérico. Feedback pode priorizar candidatos, mas não certifica fatos ou muda o critério que o aprovou. Avaliação externa segue necessária.

### Serena: memória e controle humano coexistem com LSP

Serena documenta análise por language server, alternativas de backend e ferramentas por símbolo; também memórias Markdown locais e globais, regras read-only e descoberta progressiva. Seu sistema permite compartilhar conhecimento entre sessões e configurar quais ferramentas ficam disponíveis. Não é um concorrente “só de contexto de código sem memória”. [S19–S21]

Não afirmamos equivalência de todas as linguagens: capacidades variam conforme o language server ou backend. A rota preferida é medir um adapter de leitura por símbolos num perfil opcional, não reimplementar todo o LSP em nosso núcleo. Respostas precisam carregar versão de documento e caminho autorizados, porque a IDE pode manter buffers não salvos distintos do disco.

## 5. Veredito de posicionamento

Não há base para afirmar que ninguém combina código, memória e continuidade, nem para dar ao BBrainX liderança global. Há sobreposição real com Serena, Cognee, Basic Memory e os exemplos do Invokta. Estrelas, aporte e idade são dimensões separadas; não os usamos como substitutos de robustez ou avaliamos os competidores somente por sua versão de 2025.

A tese a demonstrar é mais concreta: menor custo total de contexto e retomada, política de memória explícita, resultado verificável por revisão e uso confortável em estação MEDIUM. O benchmark precisa comparar tarefas aceitas, não quantidade de componentes ou apenas posição de documentos. Publicações dos próprios mantenedores são evidência, mas não automaticamente validação independente.

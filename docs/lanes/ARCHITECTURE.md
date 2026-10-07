# Arquitetura: concorrência sem misturar evidências

## 1. Três autoridades, responsabilidades diferentes

O projeto lógico identifica o conhecimento aprovado. A workspace identifica uma árvore de arquivos. A lane é uma vinculação explícita do projeto à workspace e à sua história operacional. A sessão do harness é um cliente dessa lane, não seu proprietário canônico.

```text
Claude Code / feature A                 Codex / feature B
          |                                      |
     MCP stdio A                            MCP stdio B
          |                                      |
   LaneStore A                              LaneStore B
   índice + snapshot A                      índice + snapshot B
   checkpoint + CAS A                       checkpoint + CAS B
          |                                      |
          +------- memória aprovada comum --------+
                     BrainStore principal
                            |
              LaneRegistry: bindings e gerações
```

Os dois índices não dividem linhas sob a mesma chave `(project,path)`. Isso elimina o erro em que a indexação da feature B substitui o conteúdo que A esperava ler, preservando `project_id` igual para políticas compartilhadas. Não são dois conjuntos de decisões aprovadas que precisam de sincronização eventual: ambos leem a mesma autoridade central.

Não há cópia periódica de memórias entre bancos. Uma proposta de A é enviada à autoridade; o humano pode aprová-la no CLI padrão. Na próxima operação, B vê a revisão aprovada. Não se aprova automaticamente uma inferência local só porque ela seria útil à outra lane.

## 2. Estados e identidades implementados

O registro usa `project`, `lane`, `root`, `common_root`, `epoch` e `status`. O ID da lane não é reciclado ao fechar. Esse tombstone impede que uma conexão antiga interprete um novo diretório como a antiga frente de trabalho. A generation de um serviço muda em cada reserva; a callback de encerramento de A não fecha o registro de B que tomou seu lugar posteriormente.

Uma chave opaca derivada de `(project,lane)` nomeia o diretório de estado. Não é segredo nem credencial. O processo MCP resolve o projeto/lane no startup; argumentos de ferramenta não ampliam o escopo. O registro é host-owned. Um processo malicioso do mesmo usuário pode abrir os arquivos locais; não alegamos isolamento multiusuário por SQL.

Snapshots continuam representando o conjunto textual indexado: não incluem banco da aplicação, fila, binários, dependências externas ou todo o Git. Dois snapshots iguais em lanes diferentes ainda carregam roots/epochs diferentes. Um resultado de teste também precisa da identificação do ambiente em que foi produzido.

## 3. Memória coerente durante montagem

A primeira leitura do conjunto aprovado ocorre numa transação de leitura central. Ela captura as linhas e um hash ordenado de IDs, revisões, textos, fontes e modos. O limite de aprovadas é conferido na autoridade, não na tabela local vazia da lane. Cabeçalho, decisões e blockers continuam obrigatórios segundo o contrato do PR #10.

Na publicação do evento de contexto:

1. Abrir transação do registro e confirmar a lane ativa.
2. Reservar a escrita na autoridade central para serializar com aprovação/revogação.
3. Recalcular a revisão e recusar se divergir da capturada.
4. Confirmar o evento do pacote no banco da lane, anotando revisão e epoch.
5. Liberar as transações centrais e devolver o resultado.

A ordem global é **registro → autoridade → lane**. Nenhuma etapa de inferência, indexação ou leitura de arquivos do compilador ocorre dentro dessas transações de publicação. As esperas de SQLite continuam síncronas; busy timeouts individuais não constituem um limite rígido de tempo total da operação. Uma aprovação concorrente pode causar recusa conservadora ou espera.

**Isso não é um commit atômico entre três bancos.** O único dado novo nessa publicação é o evento da lane. Um crash após seu commit e antes da entrega pode deixar um evento sem resposta recebida; compilar não prova entrega nem cobrança. O protocolo não afirma exatamente uma vez para a entrega de contexto. Checkpoints usam o ledger idempotente do núcleo para replays da mesma chave.

A linearização da revisão é anterior à entrega de rede/stdio. Uma revogação posterior à verificação não recolhe bytes já publicados. Fechar a lane impede novas chamadas, mas não encerra automaticamente um servidor independente já em execução; os recursos de serviço precisam de seu próprio teardown.

## 4. Locks curtos, mas não sem locks

Indexação de A escreve no banco de A; não disputa o writer do índice B ou mantém o writer da memória global durante a varredura. O custo de dois índices semelhantes é armazenamento duplicado e algum parse repetido. Essa troca intencional prioriza correção e concorrência antes de deduplicação global.

Publicação de contexto e checkpoints têm seções curtas serializadas pelo registro. Checkpoint ainda consulta metadados Git e usa o caminho síncrono do núcleo, portanto não declaramos que toda reserva do registro seja livre de I/O. A otimização futura é separar observação prévia, condição de versão e commit, acompanhada de testes que mostrem ausência de janela incorreta.

No processo de uma lane, o wrapper aceita uma invocação de cada vez. Isso protege a visão transiente de memória contra interferência entre awaits. Outra conexão/processo pode trabalhar em outra lane em paralelo. Dois clientes escrevendo na mesma tarefa da mesma lane recebem conflitos de versão normais; não existe merge automático de texto de checkpoint.

A abertura do `BrainStore` atual foi ajustada para validar o schema em transação de leitura quando não há migração. Migrações e criação continuam usando escrita. Reutiliza o princípio examinado no PR MEDIUM sem trazer todos os recursos daquele PR. O schema v2 e seu hash permanecem inalterados.

## 5. Portas como recursos possuídos, não números disponíveis

O padrão perigoso é abrir temporariamente uma porta livre, fechar e pedir a outro processo para abri-la. Existe uma janela na qual qualquer processo pode ocupá-la. Um ledger de números reservados não impede o kernel de aceitar outro bind.

O SDK implementado faz `listen({host:'127.0.0.1',port:0,exclusive:true})` no servidor real. O socket permanece aberto. Só então publica seu endereço no registro. O estado é `starting` antes de bind, `listening` após confirmação e `closed` após fechar listener e sockets conhecidos.

O nome da porta deixa de ser identidade do recurso. A identidade é `(project,lane,service,generation)`; a porta é um atributo efêmero. O PID é observação, nunca permissão de sinalização. Uma resposta de outro serviço na mesma porta após reinício não deve ser aceita como prova de ownership.

O callback do usuário ainda pode criar outros processos/sockets; o SDK não os contém. Vite/Next/Python precisam de adapters próprios ou um runtime isolado. A integração futura com routing deve publicar apenas endpoints confirmados e removê-los por geração; não pode aceitar um pedido arbitrário do modelo para encaminhar `/var/run/docker.sock`, banco central ou porta de outro projeto.

## 6. Encerramento é uma sequência reconciliável

Não existe atomicidade de banco+kernel+filesystem+plataforma remota numa chamada de cleanup. Proposta de supervisor futuro:

`ACTIVE → DRAINING → STOP_REQUESTED → PROCESS_EXIT_OBSERVED → ROUTES_REMOVED → CLOSED`

Qualquer estágio pode falhar. Cada comando de cleanup identifica o recurso exato, executa idempotentemente e registra o que foi observado. `UNKNOWN` não significa morto. Um handle de processo confiável ou identidade do runtime é superior a um PID reutilizável. Remoção forçada de dados exige decisão independente de encerrar a computação.

A extensão atual implementa o lifecycle do listener que cria, não esse supervisor completo. Um crash abrupto pode deixar serviço registrado pendente. Por padrão recusa reutilização/retirada da lane nessas condições. Esse conservadorismo reduz disponibilidade, mas evita anunciar uma limpeza inexistente ou matar o processo errado.

## 7. O que ainda pode colidir

Worktrees isolam o checkout, não o armazenamento lógico de aplicações. Dois processos podem usar o mesmo schema PostgreSQL, bucket, fila, SMTP, cache Redis, volume, arquivo temporário ou credencial. Contrato proposto por execução:

- Namespace de banco/schema independente e migrações não concorrentes no mesmo schema.
- Nomes de filas e consumidores com projeto/lane/epoch.
- Diretórios temporários e arquivos de pid/socket por execução.
- Serviços de teste externos com credenciais/contas explicitamente limitadas.
- Caches imutáveis podem ser compartilhados quando seu formato é concorrente; cache mutável e `node_modules` via symlink não são assumidos seguros.

Não clonamos `.env`, tokens ou a pasta home para as lanes. Não rodamos `postCreateCommand`, npm lifecycle scripts ou hooks por localizar um `devcontainer.json`. Ambiente de desenvolvimento é código executável e pede aprovação separada.

## 8. Conflito de merge é semântico, não apenas textual

A e B podem alterar arquivos diferentes e mesmo assim violar o mesmo contrato. Exemplo: A muda o formato de uma mensagem; B altera o consumidor usando o formato anterior. `git merge` sem conflitos não demonstra compatibilidade.

Conceito proposto para evolução: **grafo de interfaces de mudança**. Cada tarefa declara áreas e contratos afetados; o host registra evidências observadas por diff/testes. Mudança em contrato comum cria uma dependência entre lanes e bloqueia integração até uma verificação conjunta. A decisão não é deixada apenas a um classificador Laya.

A fila de integração deve fixar base e heads das duas features, montar uma worktree de integração, executar os testes combinados e publicar evidência daquele resultado. As branches preservam o trabalho original; não há merge/rebase automático silencioso do usuário. Um único responsável integra cada snapshot final.

Esse grafo de interfaces e a fila de merge **não estão implementados nesta branch**. A contribuição atual impede mistura acidental de código/índice/checkpoint; não resolve compatibilidade funcional entre features por mágica.

## 9. Otimização e memória MEDIUM

A capacidade padrão de duas lanes evita uma multiplicação acidental de frentes cadastradas. Não é limite global de processos: várias conexões para a mesma lane ainda existem. Modelos, IDEs e browsers continuam fora desse controle.

O cache Laya residente compartilhado pertence a um serviço de decisão futuro. Esta rodada não inicializa uma cópia de Laya por lane e não integra inferência. A arquitetura proposta mantém o modelo único atrás de admissão global, com resultados de decisão particionados por revisão, projeto, tarefa e policy. KV de modelos diferentes não é compartilhado.

Hash das memórias aprovadas custa O(bytes do conjunto), hoje limitado a 100 registros. Não o apresentamos como O(1). Uma revisão monotônica materializada poderia substituir trabalho repetido, mas exige todas as mutações e migrações atualizando-a corretamente. SQLite B-trees dão custo de lookup dependente do tamanho; registro de novas lanes hoje percorre as raízes para verificar sobreposição, limitado a 1.000 linhas.

A publicação central serial pode virar gargalo com dezenas de lanes. O próximo passo antes de Redis/Kubernetes é medir tempo de lock, bytes processados, filas e p95 de operações. Dois índices separados podem reduzir contenção e aumentar uso de disco ao mesmo tempo; medir ambos, sem proclamar velocidade a partir do número de tabelas.

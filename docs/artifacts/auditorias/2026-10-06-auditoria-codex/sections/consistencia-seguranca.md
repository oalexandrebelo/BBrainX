# Consistência, concorrência, segurança e fronteira Laya

Revisão auditada por leitura: `main`, `a9636e9402e3fa673ae05b3489202da1048aef5e`, em `/Users/alexandrebelo/Projetos/BBrainX/repo`. Nenhum modelo, teste ou dependência foi executado/instalado nesta seção; nenhum arquivo de credenciais/configuração de harness foi lido. Os cenários abaixo são roteiros para a validação independente em runtime do agente principal, não resultados já observados.

Legenda: **F** = demonstrado diretamente pela fonte; **I** = consequência inferida da fonte, com condições indicadas; **H** = hipótese que exige experimento. Evidência de teste histórico é identificada como tal, sem transferi-la automaticamente para a revisão atual. Severidade descreve o impacto dentro da fronteira declarada; acesso malicioso com o mesmo usuário do SO já está fora do isolamento prometido (`docs/SECURITY_MODEL.md:5`).

## Veredito técnico

O núcleo possui uma implementação pequena e defensável de **checkpoint transacional local**, com CAS por tarefa, chave de idempotência por projeto/operação e histórico/evento no mesmo commit. Isso não constitui um coordenador de agentes: não há identidade de harness, lease de tarefa, fencing token, resolução de fork, sincronização entre hosts ou outbox com confirmação de entrega. Também não existe snapshot atômica da worktree ou da operação completa `reindexação → checkpoint → resposta`.

Os maiores limites são a raiz registrada mantida como caminho textual sem revalidação posterior, a ausência de isolamento do subprocesso Laya além do protocolo, o controle de acesso que concede ao processo MCP um projeto inteiro independentemente da sessão/cwd do harness, e leituras compostas do índice sem uma única snapshot SQLite. O perfil Laya não decide autorização, aprovação ou seleção do pacote na revisão atual, e esse limite deve permanecer explícito.

## 1. Invariantes reais e pontos de linearização

| Operação | Garantia que a fonte efetivamente oferece | Fronteira/limite |
|---|---|---|
| Abertura do store | `busy_timeout=5000`, FK ligadas, WAL, `synchronous=FULL`; preparação/migração de schema em `BEGIN IMMEDIATE` (`src/store.mjs:69–81`, `116–120`) | Configuração de durabilidade SQLite, não prova física de flush, disco saudável, filesystem local ou teste de power-loss |
| Checkpoint novo | Dentro de uma transação: chave prévia, snapshot atual, CAS, atualização de `tasks`, inserções de `task_history`, `idempotency`, `events` (`src/store.mjs:153–168`) | O commit é o ponto de publicação do estado SQLite; Git e filesystem não pertencem à transação |
| Retry idêntico | Fingerprint canônico inclui tarefa, conteúdo normalizado e versão esperada; mesma chave devolve a resposta gravada sem novo checkpoint/evento (`src/store.mjs:151`, `154–155`, `166`) | Pode devolver a versão originalmente gravada mesmo depois de outra atualização; essa é a semântica do retry, não a leitura do estado mais recente |
| Writer obsoleto | A versão vigente é lida **depois** de adquirir o writer lock; só a versão esperada atual grava (`src/store.mjs:160–164`) | Não há reserva de tarefa; dois agentes podem trabalhar externamente e somente descobrir conflito ao gravar |
| Indexação | Todas as alterações de arquivos/chunks/FTS e manifesto/evento entram na mesma transação (`src/retrieval.mjs:98–123`; triggers em `src/store.mjs:23–26`) | A lista de candidatos foi produzida antes do lock; leitura de cada arquivo ocorre em momentos distintos |
| Proposta de memória | Deduplicação exata de `statement`, dentro de transação, excluindo revogadas (`src/store.mjs:189–198`) | Não é equivalência semântica, não valida a fonte e não vincula um retry a uma chave |
| Aprovação/revogação | CAS da versão da memória, mudança de status/modo e evento no mesmo commit (`src/store.mjs:200–209`) | Não autentica um humano: é autoridade do processo que chama o método/CLI |
| Leitura simples de tarefa | Uma consulta SQL retorna corpo e versão da mesma linha (`src/store.mjs:176–179`) | Leituras compostas de projeto, busca, memórias e pacote usam várias consultas independentes |
| Backup | `VACUUM INTO`, destino inicialmente inexistente, chmod 0600 POSIX ao final (`src/store.mjs:219–224`) | Não é protocolo de restauração/replicação; diretório/destino não passam por `safeDirectory` |

**F:** o lock de escrita é do banco inteiro. Indexar um projeto prende o writer lock também para checkpoints/memórias de outro projeto: a leitura física e o processamento de chunks estão dentro de `BEGIN IMMEDIATE` (`src/retrieval.mjs:98–115`). Há espera de cinco segundos, sem backoff/retry de `SQLITE_BUSY`. Os métodos são síncronos (`DatabaseSync`), portanto essa espera e a varredura também bloqueiam o event loop do processo atendente.

**I:** sob dois writers do mesmo arquivo SQLite local, os commits de checkpoint são serializados e não existe lost update silencioso da mesma tarefa quando ambos usam corretamente `expectedVersion`. Isso não prova linearisabilidade do pacote inteiro: `search` lê `projects.snapshot`, faz duas consultas FTS e une os resultados sem read transaction (`src/retrieval.mjs:160–186`); `compileContext` busca/verifica arquivos, lê projeto/checkpoint/contagem/memórias e grava evento em momentos separados (`src/context.mjs:16–29`, `58`). Outro processo pode publicar uma nova geração entre essas consultas. É possível, em princípio, um conjunto misto de chunks de gerações diferentes ou um `snapshot` não correspondente à seleção. A verificação de cada hash selecionado protege o conteúdo contra um arquivo diferente em disco naquele instante, mas não transforma todas as consultas numa snapshot única.

**F:** `saveCheckpoint` valida o conteúdo, consulta a existência de chave, reindexa se o snapshot foi omitido e só depois chama `checkpoint` (`src/session.mjs:10–13`). Portanto são transações separadas. Uma chamada com versão obsoleta/chave concorrente pode reindexar e emitir `index.completed` antes de terminar em conflito. Kill/erro após reindexar e antes de checkpoint deixa o índice novo sem novo estado de tarefa. Um segundo writer pode publicar um índice entre a indexação do primeiro e o checkpoint do primeiro; o snapshot carimbado será o vigente dentro da segunda transação.

**F:** Git é observado antes do `BEGIN IMMEDIATE` (`src/store.mjs:152–153`). O Git observado pode anteceder a aquisição do lock e não atesta worktree limpa, testes, diff, dependências ou aceite. O checkpoint com `snapshot` explícito apenas compara com o índice já existente; não exige reindexação/freshness da worktree (`src/session.mjs:12`; `src/store.mjs:157`). O comentário “arquivos como estão agora” (`src/session.mjs:5–7`) deve ser lido como uma reconciliação best effort, não como instante atômico.

## 2. Concorrência, idempotência e reinício

### 2.1 Checkpoints são robustos no escopo específico que implementam

**F:** `(project, operation, key)` é a chave de idempotência, com `operation='checkpoint'`. A chave não é por tarefa; duas tarefas do mesmo projeto que reutilizam `attempt1` colidem, porque tarefa participa do fingerprint (`src/store.mjs:13`, `151`, `154`). Reordenar propriedades não cria fingerprint novo, pois `canonical` ordena chaves recursivamente (`src/primitives.mjs:15–21`). Reordenar listas ou mudar whitespace de strings muda o conteúdo.

**I:** se o processo morre depois do commit e antes de emitir resposta, um retry com a mesma chave/conteúdo/versão esperada recupera a resposta original. Se morre antes do commit, a transação SQLite não deve publicar apenas uma parte do checkpoint. Esse é o comportamento para o qual a fonte foi desenhada; kill9/power-loss desta revisão precisam ser medidos separadamente. Uma falha na comunicação não informa ao cliente se o commit aconteceu; ele deve usar a mesma chave, não gerar uma nova por tentativa. No CLI, omitir `--key` gera uma nova chave (`bin/bbrainx.mjs:93`), então reexecutar manualmente sem preservar chave não é retry idempotente.

### 2.2 Não há locks/leases/fencing de tarefas ou de harnesses

**F:** as tabelas não possuem owner/lease/expiry/harness/session/fencing token (`src/store.mjs:9–15`). O principal MCP é sempre `local-mcp-host`; os nomes `harness-A/B` do cliente não são persistidos (`bin/bbrainx.mjs:105`). Checkpoints e eventos não registram qual harness/agente os declarou. CAS impede overwrite de uma versão antiga; não impede que dois agentes executem comandos, editem a mesma worktree ou produzam efeitos externos antes de gravar.

**I:** abrir dois homes diferentes para a mesma raiz cria dois universos de versões, memórias e checkpoints sem detecção de split-brain. Copiar/sincronizar banco ativo entre hosts não é suportado e não há detecção de filesystem de rede (`src/host.mjs:8–17`; `src/store.mjs:69–76`). Esta restrição está corretamente documentada em `docs/SECURITY_MODEL.md:52` e `docs/DOSSIER.md:126–128`; é orientação operacional, não guarda executável.

### 2.3 Registro de projeto tem race de check-then-insert

**F:** `register` consulta id, consulta raiz e executa `INSERT OR IGNORE` sem transação envolvendo essas três etapas (`src/store.mjs:124–133`).

**I:** dois processos registrando o mesmo id com raízes diferentes podem ambos passar pelos SELECTs antes do primeiro INSERT. O segundo INSERT é ignorado e `return this.project(project)` devolve a raiz vencedora, sem `PROJECT_ROOT_CONFLICT`. O contrato de conflito válido em execução sequencial não cobre esse interleaving. Registrando a mesma raiz com ids distintos, o perdedor pode terminar com `PROJECT_NOT_REGISTERED`, não a mensagem de raiz já registrada. Não há corrupção de uniqueness no banco; há resposta/invariante semântica errada.

**Roteiro runtime:** banco vazio, dois diretórios reais A/B e dois processos novos compartilhando `BBRAINX_HOME`; soltar simultaneamente `register('same', A/B)` por barreira externa e repetir. Registrar argumentos, respostas e a linha final de `projects`. Sem monkeypatch, esse interleaving é probabilístico: uma tentativa que não reproduz não refuta a race demonstrada pelo código.

### 2.4 O “outbox” é um journal local

**F:** `events` tem seq global, id único e payload, mas não delivery state, consumer, ack, retry, destino ou publication lease (`src/store.mjs:14`, `121–123`, `215–217`). Não há consumidor/publicador nesta superfície. O CAS e o registro do evento no mesmo commit são bons; “outbox” aqui não significa exactly-once de efeitos externos. `events(project, after)` pagina 200 registros, mas não é uma das seis ferramentas MCP.

**F:** históricos, idempotência, eventos e memórias não têm TTL, pruning ou quota total implementada no store. Propostas têm 4.000 caracteres e fonte 1.000; o rate limit MCP é por processo, não por banco/usuário. A lista de memórias retorna apenas as primeiras 100 (`src/store.mjs:189–217`). Muitos candidatos podem esconder candidatos posteriores no listing. O compilador recusa mais de 100 aprovadas em vez de omitir política silenciosamente (`src/context.mjs:26–27`), o que é fail-closed quanto à omissão, mas bloqueia a montagem até revisão humana.

## 3. Crash durability, backups e filesystem

**F:** há configuração WAL/FULL, transações e backup de migração v1. Não existe chamada explícita Node a `fsync`/`fdatasync` do arquivo/diretório no store ou Laya. Isso não desmerece o flush feito pelo SQLite; significa que durabilidade deve ser dividida entre **SQLite**, que controla seu journal, e **operações de filesystem Node**, que não apresentam barreira de persistência explícita.

**F:** o wrapper transacional não é reentrante, não suporta callback async e não consulta estado de transação antes de `ROLLBACK` (`src/store.mjs:116–120`). Atualmente seus callers são síncronos e não aninham transações. **H:** se uma falha SQLite em disco cheio/I/O abortar a transação automaticamente, o `ROLLBACK` incondicional pode falhar e substituir a causa original. Não atribuir um código específico sem testar. `BEGIN IMMEDIATE` fica fora do try: falha ao adquirir o lock não tenta rollback, o que é adequado.

**F:** PRAGMAs são executados antes do try que fecha a conexão na falha de schema (`src/store.mjs:73–81`). Se o PRAGMA falhar, não há close explícito nesse caminho; o efeito relevante é diagnóstico/limpeza do processo, não promessa de corrupção.

**F:** migração v1 faz `VACUUM INTO` em nome temporário com pid, verifica **versão** do banco de cópia e usa `renameSync` para substituir o backup anterior; depois a transformação de schema é transacional (`src/store.mjs:84–108`). Isso preserva uma cópia consistente para rollback e evita publicar uma cópia que já é v2. Não verifica integridade/conteúdo/hash da cópia nem fsync do diretório após rename. Uma cópia de tentativa interrompida é refeita enquanto a origem ainda é v1. Há tratamento de concorrência parcial via versão reconsultada dentro da transação, sem migration lease externo.

**F:** a checagem de schema v2 compara `user_version` e valor `meta.schema`, não faz introspecção completa nem `integrity_check` ao abrir (`src/store.mjs:97–108`). Não é detector de toda corrupção ou alteração manual. Um erro desse tipo deve ser distinguido de “versão não suportada”.

**F:** backup genérico recusa destino já existente antes de `VACUUM INTO`, cria diretório e chmod 0600 depois da cópia (`src/store.mjs:219–224`). Não há temporary+rename, limpeza própria de saída parcial se `VACUUM` falhar, validação anti-symlink dos ancestrais, autenticação remota ou manifesto/restauração automática. `VACUUM INTO` é a escolha correta para evitar copiar somente o `.sqlite` sem WAL; isso não transforma uma pasta em armazenamento privado automaticamente.

**Cenários de falha que exigem evidência própria:** kill9 durante inserções e antes/depois do commit; kill9 depois de `index.completed` e antes de checkpoint; armazenamento temporário com quota para induzir SQLITE_FULL; copiar backup para home vazio com todos os processos parados; suspensão/retomada e power-loss físico/VM. O teste histórico `test/retention.test.mjs:5` confere `integrity_check`, tarefa e evento após backup normal; não injeta nenhuma dessas falhas.

## 4. Canonical paths, symlinks e isolamento de projetos

### 4.1 Raiz registrada pode ser substituída depois do registro

**F:** registro canonicaliza a raiz uma vez por `realpathSync` (`src/store.mjs:126–127`). No uso seguinte ela volta do banco como uma string. `readSafe` calcula caminho lexical e dá `lstat` **nos componentes abaixo da raiz**, mas não na raiz nem em seus ancestrais (`src/retrieval.mjs:34–41`). Não compara `realpath(full)`/identidade inode/device com a raiz originalmente autorizada, nem abre por descriptor ancorado. `git -C root`/fallback walk também usam esse caminho textual (`src/retrieval.mjs:47–69`).

**I, impacto alto quando a raiz pode mudar independentemente da autorização:** após registrar `/tmp/A`, renomear A e pôr um symlink `/tmp/A → /tmp/B` faz os arquivos regulares de B passarem pelo lstat de `/tmp/A/arquivo.md`. A autorização continua sendo o id de A, enquanto o destino efetivo virou B. Isso pode indexar/servir texto externo ao diretório autorizado, sujeito aos filtros de segredo, que não detectam todo dado sensível. Não precisa de corrida entre lstat/read: a substituição da própria raiz é persistente e determinística. Se a ameaça é um processo malicioso com mesmo UID, esse processo já possui leitura direta; o defeito ainda importa para fonte/projeto trocado por manutenção, checkout, mount ou diretório controlado por terceiros.

**Roteiro runtime seguro:** criar A e B temporários, com marcadores públicos distintos; registrar/indexar A; renomear A→A-original; criar symlink A→B; executar index/search/context de A; registrar que a raiz armazenada não mudou e que o marcador B entrou/foi servido. Usar somente fixtures sem segredos. O teste existente `test/domain.test.mjs:21` cobre symlink de arquivo filho, não a substituição da raiz.

**F/I:** mesmo para componentes filhos, lstat→stat→read não é atômico. Um componente pode ser substituído por symlink depois da checagem; hard links também não são rejeitados. Arquivo regular com hard link para conteúdo externo é elegível se passar pelo filtro. A documentação reconhece TOCTOU em `docs/SECURITY_MODEL.md:42`, mas “symlinks rejeitados” em `:12`, `:65` não explica a raiz/ancestrais e o interleaving acima.

### 4.2 Isolamento lógico não exige raízes disjuntas

**F:** SQL de busca/checkpoints/memórias é filtrado por projeto; `chunks.id` incorpora projeto e a uniqueness de raiz é global (`src/store.mjs:9–13`; `src/retrieval.mjs:86`, `174`). Entretanto, raiz pai e raiz filha são permitidas; worktrees diferentes são projetos diferentes; nenhum limite de acesso por arquivo/usuário existe. Indexar raiz pai pode incorporar conteúdo da raiz filha. “Nunca mistura projetos” é verdadeiro para o filtro SQL, não para disjunção do corpus registrado.

### 4.3 Pasta “privada” não é verificada para pasta existente

**F:** `safeDirectory` executa mkdir com mode 0700, rejeita apenas se o último componente é symlink e devolve realpath (`src/host.mjs:14–17`). Não faz chmod de diretório existente, não confere dono/mode, não rejeita symlinks em ancestrais. O DB final é verificado contra symlink e chmod 0600 em POSIX (`src/store.mjs:70–74`); essa sequência não é um open atômico com no-follow e não verifica explicitamente os sidecars WAL/SHM.

**Roteiro runtime:** criar state temporário com 0777 e abrir store; comparar mode antes/depois. Esperado pela fonte: diretório segue 0777, embora `brain.sqlite` seja 0600. Portanto `docs/SECURITY_MODEL.md:18` só é rigoroso para pasta recém-criada sob ancestrais apropriados. Isso não demonstra leitura do banco por outro UID: ela depende também de dono, ACL e permissões do arquivo/ancestrais; diretório gravável por outro UID adiciona risco de troca/remoção de entradas, não equivale por si só a leitura dos bytes 0600. O mesmo UID já está explicitamente fora do isolamento prometido. Windows não aplica chmod; proteção depende do ACL herdado, não verificado nesta implementação.

## 5. Autorização, harnesses e prompt injection

### 5.1 Acesso concedido pelo host é real, mas sua granularidade é o processo/projeto

**F:** `makeEngine` copia `allowedProjects` para Set e exige principal não nulo + `allowed.has(args.project)` antes do run (`src/engine.mjs:20–32`). Inputs são objetos estritos Zod; ferramentas não registram raízes, não aprovam memória e não alteram a allowlist. O motor valida/clona entrada, snapshot do principal, autoriza, instala deadline, executa e valida saída (`src/capability.mjs:92–105`). Isso sustenta o limite descrito em `docs/SECURITY_MODEL.md:10`.

**F:** MCP recebe principal fixo do launcher, e não identidade/autorização fornecida por ferramenta (`bin/bbrainx.mjs:99–105`). Não há verificação do cwd do cliente, path da sessão, identidade do harness, usuário autenticado ou escopo da tarefa. A instrução “não usar ferramentas para outro repositório” é texto ao modelo (`bin/bbrainx.mjs:100–101`).

**I:** registrar globalmente `bbrainx` para A no Codex/Gemini permite que uma sessão trabalhando em B leia/grave A se passar `project:A`. Não consegue abrir id fora da allowlist; o limite é que o contexto **do projeto permitido** pode ser encaminhado à conversa/provedor de uma sessão inadequada pelo executor. Não foi observado egress, nem isso representa bypass da allowlist: a concessão é intencionalmente ao processo/projeto. Um nome de servidor por projeto melhora identificação, não constitui autenticação da sessão. A documentação reconhece o registro global (`docs/HANDOFF.md:150`), mas sua prevenção é comportamental. Isso não deve ser vendido como isolamento entre harnesses. Memória/estado compartilhados entre harnesses é exatamente o propósito do produto; separar tarefas e verificar escopo segue sendo responsabilidade do executor.

**Roteiro runtime:** iniciar o mesmo `mcp --project A` a partir de cwd B (ambos fixtures públicas); chamar `session_get/context_search` com A e com B. A deve funcionar, B deve ser recusado. Não ler configuração/credenciais reais para demonstrar essa propriedade.

### 5.2 Aprovação “humana” é uma separação de superfície, não prova de presença humana

**F:** há somente `memory.propose` nas seis ferramentas, e aprovação/revogação no CLI direto (`src/engine.mjs:36–42`; `bin/bbrainx.mjs:95–96`). `reviewMemory` não solicita interação, não verifica credencial humana nem guarda aprovação fora do processo (`src/store.mjs:200–209`). Um harness com shell já autorizado pode invocar o CLI como qualquer outro processo local. BBrainX não concede shell; os controles do harness continuam responsáveis por essa execução.

**F:** `source` da memória é string livre, não documento/hash validado. `statement` é texto livre; deduplicação ignora a fonte/modo novos quando já existe afirmação não revogada. Uma memória aprovada é interpolada crua no pacote sob “Approved memory”, com a fonte declarada (`src/context.mjs:43`). CAS confirma uma versão/status, não verdade, procedência ou segurança semântica.

**I:** poisoning pode entrar como comentário/documento indexado, checkpoint declarado ou proposta. MCP não promove proposta sozinho; esse é um controle útil. Depois de aprovação por humano/CLI, a afirmação aparece obrigatoriamente no modo `always`, podendo bloquear o budget ou induzir o harness a ações se ele confundir evidência com autoridade. O design deliberadamente devolve evidência, não reexecuta testes, e nunca oferece status `done` (`src/store.mjs:32`, `42–63`; `docs/SECURITY_MODEL.md:46`). Não substituir a revisão da fonte por score Laya, popularidade do trecho ou “approved” como autoridade superior às instruções da sessão.

### 5.3 Delimitação é textual, não isolamento de instruções

**F:** o pacote inclui advertência no cabeçalho e separadores de fonte, mas corpos de arquivo e memórias são interpolados sem escape ou canais estruturais privilegiados (`src/context.mjs:30`, `43`, `52–54`). Um documento pode conter falsos cabeçalhos, comandos ou frases “ignore previous instructions”. A prevenção forte é a superfície limitada das seis ferramentas; o consumidor continua sendo um modelo/harness com suas próprias capacidades. `docs/SECURITY_MODEL.md:40` reconhece corretamente essa limitação.

**F/I:** o filtro de segredo cobre certos nomes/extensões e padrões de tokens, não passwords arbitrárias, saúde/dados pessoais, códigos internos ou todo formato de credencial (`src/retrieval.mjs:8–12`). `context_search` devolve os corpos persistidos **sem verificar freshness**; só `context_bootstrap` verifica/reindexa (`src/engine.mjs:37–38`; `src/context.mjs:18–24`). Alterar um arquivo já indexado para adicionar segredo não limpa imediatamente o trecho anterior de todas as buscas; novo arquivo/ignore também exige reindexação completa. O texto pode seguir para o provedor do harness. Localidade do store não é garantia de egress local fim a fim (`docs/SECURITY_MODEL.md:38`).

## 6. MCP, HTTP e limites de execução

### 6.1 Cancelamento/timeout não fazem rollback de efeito já iniciado

**F:** prazo de 30 s começa depois de validação/acesso; engine usa AbortController/race, mas não interrompe código síncrono e o domínio só verifica signal antes do run (`src/capability.mjs:99–105`; `src/engine.mjs:26`, `30`). Cancelamento já ativo impede início. Uma indexação longa bloqueia o loop, incluindo entrada stdio, notificações e timer. Isso está corretamente limitado em `docs/SECURITY_MODEL.md:26` e `docs/RELEASE_NOTES.md:40`. Não interpretar `TIMEOUT/CANCELLED` como “nenhum efeito gravado”.

**F:** `running` é um Map por request id, sem recusa de id duplicado (`src/mcp.mjs:55`, `68`, `104`). **I:** duas chamadas simultâneas com mesmo id substituem a entrada; cancelar esse id só sinaliza a última. A primeira ainda pode executar/responder com o mesmo id; `cancelAll` também só enxerga as entradas atuais. Trata-se de cliente malformado, mas a alegação universal “requisição cancelada não recebe mais nenhuma mensagem” requer essa condição ou detecção de ids duplicados.

**F:** linha limitada a 1 MiB e rate limit 300 tool calls/min/processo. Não há max in-flight/backpressure de saída; `output.write` ignora retorno, batches executam `Promise.all`, linhas podem acumular promises (`src/mcp.mjs:120–145`). Discovery/list não entram no rate limit. O loopbreaker ajuda, não é quota global ou controle de acesso. Fim de stdin marca closed, cancela e espera `Promise.allSettled(pending)` (`src/mcp.mjs:151–154`), apesar do comentário “sem esperar” em `:116`; na implementação atual a maioria das capacidades é síncrona e a espera é mitigada pelo aborto do race.

**F:** o servidor não mantém estado de handshake legado; `tools/list/call` é aceito mesmo sem `initialize`. `initialize` com versão desconhecida responde a primeira LEGACY_VERSION em vez de recusar; versão desconhecida **moderna** é recusada com -32022 (`src/mcp.mjs:77–110`). `docs/HANDOFF.md:159` generaliza o erro para toda versão desconhecida, e o comentário “sessão aberta por initialize” (`src/mcp.mjs:8`) descreve uma expectativa, não enforcement. Isso pode ser negociação permissiva deliberada, mas merece contrato exato.

**F:** cache de cinco minutos/public é para catálogo/discovery (`src/mcp.mjs:17–18`, `82–83`), não para resultado de contexto ou mutação. O catálogo inclui no schema a lista de projetos autorizados (`src/engine.mjs:23`) e instructions podem revelar root local (`bin/bbrainx.mjs:101`). Não há resposta cacheada nem delta/KV entre harnesses. SingleFlight existe só como utilitário, não usado pelo fluxo do store (`src/primitives.mjs:25–33`; `docs/DOSSIER.md:136–142`).

### 6.2 HTTP protege o browser externo, não autentica processos locais

**F:** bind 127.0.0.1; Host literal com porta; Origin ausente ou exato; rejeita `cross-site/same-site`; CSRF randômico para POST e body de até 64 KiB; CSP, nosniff, no-referrer, X-Frame-Options (`src/server.mjs:14`, `19–38`, `48–50`). Sem CORS aberto. Uma API GET bootstrap entrega token CSRF e todos os projetos ao chamador local válido; painel constrói allowlist com todos os projetos (`:29`, `37`). Processo local pode fazer bootstrap/invoke sem identidade externa; isso bate com a fronteira por usuário do SO e não com multi-tenant.

**F/I:** arquivo estático é limitado por prefixo lexical de dist, mas `statSync/createReadStream` seguem symlink sob dist (`src/server.mjs:41–45`). Um dist alterado com symlink para fora pode servir arquivo externo pelo loopback. Assim como a raiz, isso não resiste a atacante mesmo UID, e o dist local precisa ser artefato confiável. Traversal lexical simples é rejeitado; proteção contra symlink não é aplicada nessa rota.

## 7. Laya: o que é isolado e o que não é

### 7.1 Limite bom: nenhum score vira autorização nesta revisão

**F:** engine/context/retrieval não importam nem chamam `LayaBroker`; somente CLI `laya ask/install` e script de benchmark o usam (`src/engine.mjs:1–5`; `bin/bbrainx.mjs:49–69`; `scripts/laya-bench.mjs:17–38`). `changesContextPack:false` é compatível com a fonte. Laya devolve choice/score/noul/confidence/probabilities; benchmark usa isso para calcular ranking, sem persistir aprovação/checkpoint automaticamente (`profiles/laya/worker.py:22`, `65–75`). O score não prova fonte verdadeira, comando seguro, autorização, identidade nem aceite. Não promover uma decisão probabilística para trust policy.

### 7.2 Subprocesso não é sandbox

**F:** Node spawna Python com `shell:false`, stdio pipe e stderr ignorado, mas sem env sanitizado, cwd restrito, uid/gid separado, sandbox, restrição de syscalls ou política de rede (`src/laya.mjs:123–127`). O worker recebe só estados/perguntas no protocolo, porém herda ambiente e privilégios do processo pai. O caminho do modelo é argumento; banco não é argumento. Ausência de caminho no protocolo não revoga a capacidade do Python/dependências de abrir o banco/home ou fazer requests.

**F:** `HF_HUB_OFFLINE`, `TRANSFORMERS_OFFLINE`, disable telemetry são variáveis Python (`profiles/laya/worker.py:13–17`), não bloqueio de socket no SO. A frase “não acessa rede” em `docs/OPTIONAL_PROFILES.md:13` e comentário do worker `:5` é mais forte que o mecanismo demonstrado. Pode-se afirmar “downloads HF/Transformers são configurados offline”, não “processo sem capacidade de rede”. Importar pacotes executa código de terceiros com mesmo UID; venv separa dependências, não autoridade.

**I:** segredos do ambiente do harness/host, se existirem no processo que inicia Laya, também estarão no filho por herança. Não foi lido nenhum segredo para verificar isso. Uma dependência comprometida ou configuração alterada pode exfiltrar estado local apesar de o próprio protocolo não ter ferramentas/paths. Isso é supply-chain/local-process trust, não prompt injection que ganha shell diretamente do modelo.

### 7.3 Integridade é parcial e possui janela de concorrência

**F:** pesos têm revisão, tamanho e hashes fixos; download calcula hash do fluxo e só renomeia após sucesso (`src/laya.mjs:16–25`, `39–55`). O conjunto enviado ao worker para nova checagem tem apenas arquivos acima de 1 MiB: tokenizer.json e model.safetensors (`:28–29`, `123`; `profiles/laya/worker.py:39`). Configs menores não são conferidas por esse argumento em cada carga; tokenizer_config pode ser reescrito pelo pacote, deliberadamente. A implementação interna `laya.Agent(expected_sha256=...)` não está neste repositório, então esta auditoria confirma a passagem do contrato, não reexecuta/verifica sua implementação upstream.

**F:** `layaStatus` só confere existência do Python e tamanho de cada arquivo; o receipt é JSON informativo (`src/laya.mjs:91–94`). Uma alteração mantendo tamanho pode continuar sendo anunciada `installed:true`. O carregamento deve recusar adulteração nos dois arquivos grandes se o contrato upstream cumprir os hashes; status não equivale a integridade validada/capacidade saudável.

**F/I:** `target+'.partial'` é nome compartilhado entre processos, sem lock/id exclusivo (`src/laya.mjs:49–55`). Dois installs/fetches podem disputar o mesmo inode/nome e cleanup; um segundo rename pode falhar por inexistência. O hash é do fluxo recebido, não uma releitura do inode que será renomeado. Nenhum fsync de parcial/dir, e o conjunto dos cinco arquivos não é publicado atomicamente: falha no último conserva os anteriores já substituídos. Receipt também é escrito diretamente (`bin/bbrainx.mjs:59`). Não anunciar instalação transacional/crash-safe. Não foi reproduzida corrida de download nesta auditoria.

**F:** requirements fixa sete versões diretas, sem hashes/transitive lock/`--require-hashes`; instalador usa uv/pip e pode executar código de pacotes (`profiles/laya/requirements.txt:3–9`; `src/laya.mjs:74–84`). Pin de versão reduz drift; não prova cadeia completa immutable/reprodutível nem pacote confiável. Default instalador Windows só encontra uv ou nomes python3.10–3.13; não procura `py`/`python.exe` (`src/laya.mjs:62–66`). Não dizer que qualquer Windows instala sem esse pré-requisito.

### 7.4 Timeouts, circuit breaker e reinício do worker

**F:** uma instância coalesce start via `#starting`; broker correlaciona respostas por id; 3 falhas abrem disjuntor por cinco minutos, sucesso zera falhas (`src/laya.mjs:99–145`). Esse estado é em memória e desaparece ao recriar processo/broker. CLI ask/install usa deadline 120 s; default do broker é 4 s. Python processa sequencialmente cada linha, sem cancelamento de inferência (`profiles/laya/worker.py:46–77`). Timeout retira a entrada pending, mas não mata/reinicia a inferência lenta. Chamadas posteriores podem ficar atrás dela; disjuntor reduz envios temporariamente, não resolve trabalho já enfileirado.

**F:** stdout do filho tem buffer de string sem teto; mensagens JSON inválidas são ignoradas e `ready/results` não recebem schema estrito Node (`src/laya.mjs:109–117`, `127`, `140–144`). Worker limita número/tamanho de states depois de ler/parsear linha inteira, limita apenas quantidade de perguntas e não seus caracteres (`profiles/laya/worker.py:19–21`, `46–65`). Não confundir o teto de 1 MiB do MCP com teto do protocolo Laya. Falhas esperadas viram `{ok:false,reason}`; isso não prova “nunca lança” diante de todo input/erro de alocação/stream. Os testes do broker usam processo falso (`test/godmode.test.mjs:95–109`), logo não homologam crash/recovery/custo real da biblioteca Python.

## 8. Compatibilidade que pode ser afirmada

| Alvo | O que esta revisão contém | Prova/limite disponível |
|---|---|---|
| Claude Code | Configura comando `claude mcp add` e JSON `.mcp.json` (`src/clients.mjs:14`) | Fonte comenta execução em 2.1.263; handoff relata `Connected` em 04/10 (`docs/HANDOFF.md:22`). Conexão não é tarefa real aceita; não há nesta pasta log bruto específico de aceite de jornada |
| Codex CLI | Comando `codex mcp add` e TOML; avisa registro global (`src/clients.mjs:15`) | Fonte/handoff relatam comando em 0.160.0 e `context_search` por `codex exec`, 05/10. Isso é declaração documental datada, não execução independente desta auditoria |
| VS Code | JSON `servers.bbrainx` com type stdio (`src/clients.mjs:17`) | Teste checa shape (`test/godmode.test.mjs:144–155`); handoff explicitamente “sem prova”. Não houve sessão VS Code real comprovada por essa seção |
| Cursor / Gemini CLI | Formatos gerados próprios (`src/clients.mjs:16`, `18`) | Mesma distinção: formato/teste ≠ IDE real homologada |
| Antigravity | Não está em CLIENTS; nenhum adaptador/configuração específica (`src/clients.mjs:8`, `19`) | `docs/STUDY_MAP.md:303–307` estuda delegação agy-staff; handoff entre SDKs independentes não prova Antigravity. Pode ser hipótese de cliente stdio compatível, não suporte declarado |
| MCP legado | Cliente SDK oficial dev-only 1.x testado em processos separados (`test/mcp.test.mjs:3–17`) | A gravação/leitura é sequencial: fecha A antes de abrir B; prova handoff persistente/restart, não dois writers simultâneos |
| MCP moderno | Branch protocolVersion 2026-07-28, discovery e ferramentas (`src/mcp.mjs:12–14`, `77–85`) | Testes de fio próprios; docs dizem não ter cliente oficial 2.x/era de cada harness medida (`docs/RELEASE_NOTES.md:41`; `docs/STUDY_MAP.md:151`) |
| macOS/Windows/Linux núcleo | Paths por SO; CI matrix Node24 com tests/build/doctor (`src/host.mjs:8–12`; `.github/workflows/verify.yml:33–60`) | `ci-report.json:3` atesta `912aa2533c064aed81f1f81a17bde083ec4232fd`, **não** a9636e94. Report registra 96/96 nos três runners (`:8–11`, `206–209`, `406–409`); não atribuir automaticamente a SHA auditada |
| Laya macOS arm64 | Requirements declara medição M5 Pro/MPS/Python3.12 (`profiles/laya/requirements.txt:1–2`) | Não é medição desta auditoria; Windows/Linux/Mac Intel explicitamente não medidos (`docs/OPTIONAL_PROFILES.md:17`) |

**F:** `clientConfig` usa quoting de shell POSIX sem seleção por plataforma (`src/clients.mjs:9`, `14–15`), e os testes usam caminhos macOS. JSON/TOML estruturados preservam strings; comandos impressos não têm prova em cmd.exe/PowerShell, especialmente paths com apóstrofo. Não confundir suíte Windows em Git Bash com comando de ativação validado no shell padrão Windows.

**F:** todos os fragmentos gerados usam o mesmo nome `bbrainx`, embora o comentário peça `bbrainx-<project>` para múltiplos projetos (`src/clients.mjs:15`). O usuário precisa efetivamente editar o nome; o aviso não faz namespacing sozinho. Copiar a configuração de um segundo projeto pode substituir a primeira no harness global.

**F:** `doctor.ready` mede Node/SQLite/FTS5/Git, e declara backendBenchmarked=false (`src/host.mjs:35–49`), não protocolo, autorização do cliente, inferência ou jornada. Aceite Mac inclui IDEs reais, suspensão, restore e energia, explicitamente além da CI (`docs/EVALUATION.md:98–108`). Nada na fonte autoriza “qualquer harness/SO totalmente homologado”.

## 9. Contraste com o modelo de segurança e contratos

| Alegação documental | Conclusão desta auditoria |
|---|---|
| Scope definido pelo host; tool não registra/aprova (`SECURITY_MODEL:10`, `HANDOFF:150`) | Sustentada para a superfície MCP. Scope é projeto/processo, não identidade de harness/cwd. CLI/library têm autoridade local maior |
| Symlinks rejeitados, private state (`SECURITY_MODEL:12`, `18`, `65`) | Parcial: filhos estáveis rejeitados; raiz substituída/ancestrais/hard links/TOCTOU não cobertos; pasta existente não recebe modo privado |
| Hash antes de compilar, snapshot não é lock (`SECURITY_MODEL:13`, `42`, `44`) | Sustentada como freshness selecionada best effort. Search puro é persistido; reads compostas/whole-worktree não atômicas |
| Checkpoint + histórico + idempotência + outbox (`SECURITY_MODEL:16`, `DOSSIER:120`) | Sustentada no commit SQLite de checkpoint. Auto-reindex anterior tem efeito separado; outbox não implementa delivery/ack externo |
| Memória candidata separada de humano (`SECURITY_MODEL:17`, `71`) | Sustentada como APIs distintas. A fonte humana não é autenticada e um executor com shell pode chamar approve |
| Laya offline/sem banco (`SECURITY_MODEL:31–34`, `OPTIONAL_PROFILES:13`) | Sem paths do projeto no protocolo, flags HF offline e modelo fora do pack são sustentados. Ausência de capacidade FS/rede/segredos não é sustentada; filho possui privilégios e ambiente do pai |
| Qualquer versão desconhecida recebe -32022 (`HANDOFF:159`) | Verdade para modern `_meta`; initialize legado desconhecido negocia a mais nova legada |
| Cancelamento não responde (`SECURITY_MODEL:23`) | Caminho normal sustentado; ids duplicados em voo e efeitos síncronos requerem qualificação |
| Windows/macOS compatíveis e clientes reais (`RELEASE_NOTES:104`) | CI histórica para outra SHA + handoff SDK; somente Claude/Codex têm relatos de ativação real. Nenhuma prova Antigravity/VSCode real desta seção |

## 10. Gates de validação e decisão

1. **Validar agora sem modelos:** substituição da raiz por symlink; diretório de estado existente 0777; MCP iniciado fora do cwd autorizado; dois writers reais com CAS/idempotência e kill9 após commit; lock SQLite real maior que cinco segundos. São fixtures locais descartáveis, sem credenciais.
2. **Validar com instrumentação externa, se escopo permitir:** races de register; leituras de busca/pacote durante reindexação contínua por outro processo; disk-full em filesystem com quota. Não substituir por mock a propriedade que se pretende provar.
3. **Corrigir afirmações antes de ampliar confiança:** separar schema de config e IDE real; SQLite journaling e transação completa de tarefa; venv/offline HF e sandbox; proposta/CLI e presença humana; proveniência/hash e autoridade/verdade. Não conceder a texto recuperado ou scores probabilísticos o direito de mudar permissões.
4. **Escopo futuro que não existe:** task leases/actor provenance, fencing/split-brain, publish/ack outbox, quotas/retention, root binding por identidade e política de subprocessos. Escolher isso por necessidade medida, sem anunciá-lo como comportamento presente.

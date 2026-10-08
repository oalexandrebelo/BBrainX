# Primeiro uso — macOS antes de tudo

## 1. Pré-requisitos e instalação reversível

Instale Node 24 LTS pela distribuição oficial ou pelo gerenciador de versões que você já utiliza, e Git. O projeto não instala Homebrew, não solicita senha administrativa e não troca sua versão global silenciosamente. A pasta pode conter espaços; os fragmentos MCP usam caminhos absolutos.

```sh
git clone https://github.com/oalexandrebelo/BBrainX.git
cd BBrainX
node bin/bbrainx.mjs doctor
npm run setup
```

`doctor` informa versão do Node, SQLite/FTS5 utilizável, Git, arquitetura, RAM, quantidade de CPUs e diretório de estado. **Não mede Metal, MLX, qualidade de modelo ou taxa de cache.** O perfil inicial é determinístico para evitar carregar um modelo antes de existir benefício demonstrado.

`setup` exige `package-lock.json`, executa `npm ci --ignore-scripts`, testes e build. Uma falha não gera mensagem falsa de sucesso. Atualizações usam `git pull --ff-only` e novo setup, após revisar a mudança. Se um pacote exigir lifecycle script futuramente, essa exceção precisa ser auditada e documentada — não retire o bloqueio global por conveniência.

## 2. Experiência de demonstração

```sh
npm run demo
npm start
```

Abra http://127.0.0.1:4317. `demo` cria somente arquivos sintéticos no diretório privado de estado e não sobrescreve exemplos já alterados. O painel não abre portas públicas. Para outra porta: `node bin/bbrainx.mjs serve --port 4318`.

Na aba Laboratório, selecione `demo`, busque autenticação/sessão, compile o pacote e observe as fontes. Use Reindexar após editar os arquivos. O checkpoint do painel é de **revisão pendente**, não uma aprovação de testes inexistentes.

## 3. Seu repositório real

```sh
node bin/bbrainx.mjs up --root "/Users/seu-usuario/Projetos/meu-app"
node bin/bbrainx.mjs search --project meu-app --query "onde a sessão expirada é rejeitada"
node bin/bbrainx.mjs context --project meu-app --query "validação de sessão" --budget 4000
```

`up` registra a pasta com o nome dela (ou o de `--project`), indexa e imprime os próximos comandos. Rodar de novo reaproveita o registro e só reindexa o que mudou. `init` e `index` continuam existindo para quem prefere os dois passos. A pergunta pode vir em português mesmo com o código em inglês: a busca casa por radical e por um glossário de programação.

Registre uma raiz pequena e intencional, não o diretório home. O escopo padrão aceita até 20.000 arquivos textuais elegíveis, 256 KiB por arquivo e 256 MiB somados. Quem inicia o processo pode ajustar esses tetos por `BBRAINX_MAX_FILES`, `BBRAINX_MAX_BYTES` e `BBRAINX_MAX_FILE_BYTES`; argumento de ferramenta não os altera. Medido num Mac M5 Pro: 3.662 arquivos (28 MiB) indexam em cerca de 3 s e ocupam 61 MB no banco. Arquivos ignorados, muito grandes, binários e padrões de segredo aparecem no diagnóstico quando pertinentes. Esses limites são limites de segurança iniciais, **não metas de escalabilidade comprovadas**.

A snapshot é do conjunto textual indexado, não uma prova de revisão completa de binários, submódulos, banco de dados ou ambiente externo. A indexação usa o conteúdo da worktree, incluindo alterações não commitadas e arquivos não ignorados. Antes de servir um trecho selecionado, o serviço verifica seu hash atual. Se o arquivo mudou, foi apagado ou passou a conter um padrão de segredo, ele é relido (ou retirado do índice) antes de o pacote ser montado, e o pacote lista esses caminhos em `refreshedFiles`. Com `--strict`, o pacote é recusado com `STALE_INDEX`, como na 0.2. Arquivos novos e mudanças nas regras de ignore só entram com uma nova indexação.

## 4. Conectar harnesses

```sh
node bin/bbrainx.mjs integrate --root "/Users/seu-usuario/Projetos/meu-app"
node bin/bbrainx.mjs integrate --root "/Users/seu-usuario/Projetos/meu-app" --apply
```

O primeiro comando só planeja. `--apply` registra a raiz com o nome existente ou derivado da pasta (ou `--project ID`), aplica configurações suportadas e indexa. Uma raiz já concedida a outro ID ou sobreposta a outro projeto é recusada. Sem `--clients`, seleciona instalações detectadas; `--clients codex,claude,vscode,kilo` escolhe explicitamente os destinos, mesmo sem o cliente instalado. `--lane ID` exige lane existente com raiz correspondente.

Os destinos são `.codex/config.toml`, `.mcp.json`, `.vscode/mcp.json` e o único config Kilo reconhecido (por padrão `.kilo/kilo.json`). Preserva demais servidores, comentários, provedores/OmniRoute, credenciais, trust e aprovações. Codex só carrega a configuração de projeto quando o cliente confia nele. Antigravity IDE retorna `manual-required`; não há fallback global nem servidor com acesso a todos os projetos. Instalação detectada não comprova extensão habilitada, carregamento da configuração ou conexão nativa. [Formatos e fontes oficiais](integrations/INSTALLER.md).

Revise o plano antes de `--apply`. Uma colisão bloqueia todo o plano. Para instalação do gerador anterior, `--adopt-existing` aceita somente a forma exata com mesmo Node, script, estado, projeto e lane; outras entradas continuam bloqueadas. A aplicação retorna recibo e conserva bytes anteriores em backups privados. Para desfazer:

```sh
node bin/bbrainx.mjs integrations rollback --id ID_DO_RECIBO
```

Rollback recusa arquivos editados posteriormente. Se a indexação falhar após aplicação, a CLI retorna recibo e `indexError`: corrija a indexação ou use esse rollback. Configurações com caminhos absolutos do estado/runtime merecem revisão antes de serem versionadas. `config --project meu-app --client cursor` continua imprimindo fragmentos manuais (também claude, codex, vscode e gemini); ele não escreve arquivos.

### Plugin e descoberta de pastas abertas

```sh
node scripts/package-extension.mjs
node bin/bbrainx.mjs discover --root "/Users/seu-usuario/Projetos/meu-app"
```

O empacotador exige Python 3 para ZIP e gera `artifacts/extensions/bbrainx-workspace-0.1.1.vsix`, preview local não assinado. Instale pelo comando **Extensions: Install from VSIX** no editor. Configure **BBrainX: Executable** em settings de usuário; padrão `~/.local/bin/bbrainx`, launcher instalado separadamente. Para apontar direto para `bin/bbrainx.mjs`, configure também o caminho absoluto de **Node Executable**. Windows exige executável real ou Node + script; wrappers `.cmd` não recebem shell implícito.

A extensão usa `workspaceFolders` para listar pastas locais abertas e confiáveis. **Detectar** planeja; **Conectar** aplica a integração. Heartbeats de metadados a cada 30 s expiram em 90 s e não registram/indexam projetos automaticamente. Pastas virtuais, não salvas ou sem trust não iniciam processos. **Iniciar painel local** é explícito; **Abrir painel** usa URL HTTP loopback configurada. Host remoto exige launcher remoto e encaminhamento de porta. VSIX/API e MCP no Antigravity IDE ainda precisam de prova nativa na versão instalada. [Contrato do plugin](../extensions/vscode/README.md).

`discover` separa pastas abertas reportadas, projetos registrados e sessões históricas com raiz validada. Não analisa títulos de janelas, não inicia clientes e não afirma capturar sessões ativas de todos os harnesses. Histórico validado atualmente: Claude, Codex e Cursor. Os demais ficam explicitamente sem adapter histórico.

### Testes locais e contexto histórico

```sh
node bin/bbrainx.mjs test --project meu-app --task AUTH-1 --file test/auth.test.mjs,test/session.test.mjs --timeout 300000
node bin/bbrainx.mjs control --project meu-app
node bin/bbrainx.mjs test-history archive --project meu-app --id ID_DA_EXECUCAO
node bin/bbrainx.mjs import-context --project meu-app --harness claude --file "/caminho/absoluto/sessao.jsonl"
```

O runner suporta **node:test**, não `npm test` arbitrário nem shell: até 100 arquivos concretos relativos à raiz registrada, sem glob, travessia ou symlink. Timeout em milissegundos: 100–3.600.000, padrão 300.000. Guarda revisão, estado, contagens e até 20 falhas/32 KiB de diagnósticos, com truncamento indicado. Stderr é contado, não armazenado. Ambiente reduzido e HOME temporário não são sandbox de SO; o código de teste continua com permissões do usuário e pode acessar disco/rede. Execute somente testes de repositórios confiáveis. Falha, cancelamento ou timeout retornam exit code não zero. Arquivamento aceita apenas execução terminada; o painel mostra histórico, progresso e dados desconhecidos sem inventar aprovação ou custo.

Importação exige escolha explícita de um arquivo JSONL nas pastas nativas: `~/.claude/projects`, `~/.codex/sessions` ou `~/.cursor/projects/.../agent-transcripts`. Confere raiz canônica exata, recusa sessões filhas/subagents, symlinks, formatos desconhecidos e arquivos acima de 32 MiB. Só trechos textuais visíveis de usuário/assistente entram no checkpoint, até 20 mensagens/32 KiB de cauda e limites menores no checkpoint; não segue históricos referenciados. Prompts de sistema/developer, reasoning e saídas de ferramentas não são contexto importado.

A fonte completa selecionada e manifesto ficam privados no estado local; o checkpoint é `review_needed` e marca o texto como não confiável. Isso não promove memória nem concede acesso. `--task ID` escolhe o checkpoint; `--version N` aplica controle de versão. Repetir a mesma fonte é idempotente, mas uma versão conflitante é recusada. Cursor sem cwd embutido exige `--confirm-workspace /raiz/canonica`, mantém `CURSOR_WORKSPACE_UNVERIFIED` e recusa colisão de nomes entre projetos registrados. Não marque essa confirmação como origem verificada.

Se preferir que o próprio agente faça a ligação, cole na sessão dele o prompt de [prompts/ACTIVATE.md](prompts/ACTIVATE.md): ele registra, indexa, grava só a entrada `bbrainx` e prova o resultado pelo fio.

O servidor fala as duas eras do protocolo: a revisão corrente (2026-07-28, sem handshake) e as anteriores (com `initialize`). Para ver o que o harness está chamando, inicie com `BBRAINX_TRACE=1`: cada chamada vira uma linha na saída de erro, sem argumentos nem resultados.

O transporte é stdio, e o comando aponta para o `node` instalado e o script com caminho absoluto. Logs ficam em stderr; stdout pertence ao protocolo. Cada processo recebe um único `--project`, que não pode ser ampliado por argumentos de ferramenta.

No agente:

> Consulte `session_get` para a tarefa atual. Atualize `context_index` quando a worktree mudar. Use `context_bootstrap` com objetivo e orçamento. Ao encerrar, grave `session_checkpoint` com versão esperada e pendências reais. Proponha memórias, mas não assuma aprovação.

Não é necessário alterar `ANTHROPIC_BASE_URL`, a configuração da OpenAI, gateways ou a autenticação nativa do cliente. O BBrainX não chama nenhum serviço hospedado.

## 5. Checkpoint manual

A saída de `index` contém `snapshot`. Use esse valor no arquivo:

```json
{
  "objective": "Revisar o fluxo de autenticação",
  "nextAction": "Executar os testes no harness e revisar o diff",
  "status": "review_needed",
  "done": ["Li src/auth.ts e os testes de sessão"],
  "decisions": ["Manter o contrato público de authenticate()"],
  "filesTouched": ["src/auth.ts"],
  "evidence": [{"command": "npm test", "result": "30 passaram, 0 falharam"}]
}
```

Só `objective`, `nextAction` e `status` são obrigatórios. `filesTouched` aceita apenas caminhos relativos à raiz. O que o agente escreve em `done` e `evidence` é **declaração dele**, não verificação.

Sem `snapshot`, o serviço reindexa a worktree e carimba o snapshot resultante. Ele também registra, em `host`, o commit e o ramo do Git naquele momento. O checkpoint gravado é limitado a 16 KiB; dentro de um pacote com orçamento pequeno, as listas saem e ficam só o essencial e a contagem. Esses campos são observados pelo serviço e não podem ser enviados pelo agente. Se você informar `snapshot`, ele precisa ser o do índice atual, como na 0.2.

```sh
node bin/bbrainx.mjs checkpoint --project meu-app --task AUTH-1 --file checkpoint.json --version 0 --key auth-attempt-1
```

Para a próxima alteração, use a versão retornada. Não reutilize a mesma chave para conteúdo diferente. `VERSION_CONFLICT` significa reconciliar o checkpoint, não repetir cegamente. Os estados aceitos são `in_progress`, `paused`, `blocked`, `review_needed`.

## 6. Memória com revisão

```sh
node bin/bbrainx.mjs propose --project meu-app --statement "Preservar o contrato público de autenticação" --source "docs/adr/001-auth.md" --mode always
node bin/bbrainx.mjs memory --project meu-app
node bin/bbrainx.mjs approve --project meu-app --id ID_RETORNADO --version 1
node bin/bbrainx.mjs revoke --project meu-app --id ID_RETORNADO --version 2
```

`--mode always` (padrão) faz a memória aprovada entrar em todo pacote. `--mode relevant` a inclui só quando ela compartilha termos com o objetivo do pacote; quando fica de fora, o pacote diz quantas foram omitidas. O modo de uma proposta é só sugestão: ao aprovar, a memória vale como `always`, a menos que você aprove com `--mode relevant`. Propor de novo uma afirmação idêntica devolve a proposta já existente.

A fonte é registrada como evidência fornecida, não automaticamente certificada. Revogação evita entrada em novos pacotes. Ela não desfaz uma instrução que já foi enviada a outro programa ou apaga backups.

## 7. Estado, backup e remoção

| Plataforma | Diretório padrão |
|---|---|
| macOS | `~/Library/Application Support/BBrainX` |
| Linux | `$XDG_DATA_HOME/bbrainx` ou `~/.local/share/bbrainx` |
| Windows | `%LOCALAPPDATA%/BBrainX` |

`BBRAINX_HOME` fixa outro diretório, independentemente do cwd do harness. Não coloque o banco vivo em pastas de sincronização de arquivos.

```sh
node bin/bbrainx.mjs backup --file "/caminho/seguro/bbrainx-backup.sqlite"
```

O backup utiliza `VACUUM INTO`, não cópia parcial de um arquivo WAL em atividade. Para restaurar: pare todos os processos BBrainX, preserve o estado atual, restaure para uma pasta vazia, nomeie o arquivo `brain.sqlite`, use `BBRAINX_HOME` apontando para essa pasta e valide em modo de teste. Não substitua um banco com processos em execução.

Para remover, encerre servidor e clientes MCP, retire apenas o fragmento que você adicionou ao cliente e arquive ou exclua a pasta BBrainX depois de decidir a retenção. Nenhum daemon de sistema ou serviço autostart é instalado nesta versão.

## 8. Perfil opcional: Laya

O Laya é um modelo local de decisão (Apache-2.0). O núcleo não depende dele. Instale só se quiser experimentar ou medir:

```sh
node bin/bbrainx.mjs laya install    # ambiente Python isolado (cerca de 0,7 GB) e pesos (0,68 GB), conferidos por SHA-256
node bin/bbrainx.mjs laya status
node bin/bbrainx.mjs laya ask --state "O login quebrou em produção depois do deploy." --file perguntas.json
node bin/bbrainx.mjs laya remove     # apaga só a pasta do perfil
```

`perguntas.json` segue o contrato do Laya. Exemplo: `{"tipo":{"type":"choice","instructions":"Que tipo de tarefa é esta?","criteria":{"correcao":"corrigir um defeito","funcionalidade":"construir algo novo"}},"urgente":{"type":"noul","instructions":"O texto diz que é urgente?"}}`.

A instalação precisa do `uv` ou de um Python de 3.10 a 3.13; não usa `sudo` nem muda o Python do sistema. `BBRAINX_PYTHON=/caminho/absoluto/python3.12` seleciona explicitamente o interpretador. Execução usa pesos locais e flags offline das bibliotecas; isso não é sandbox de rede do SO.

Para decisões protegidas contra truncamento, use `node bin/bbrainx.mjs laya decide --project <id> --state "texto" --file perguntas.json`, `serve --laya` no painel ou `mcp --project <id> --laya`. O MCP acrescenta `decision_evaluate` somente quando habilitado. [Guia completo, limites, cache e verificação real](integrations/LAYA.md). O perfil continua sem alterar o pacote de contexto. O benchmark aceita `--max-len` de 256 a 8192 (padrão 1024), `--batch-size` de 1 a 64 (padrão 4), `--timeout-ms` de 1000 a 600000 (padrão 120000) e `--out <arquivo.json>`.

## Alinhar especificações do projeto

```sh
node bin/bbrainx.mjs sdd --project meu-projeto --mode assess
node bin/bbrainx.mjs sdd --project meu-projeto
```

O primeiro comando somente avalia. O segundo avalia e cria uma base `SDD.md` se não houver artefatos SDD reconhecidos; nunca substitui especificações existentes. O rascunho expõe fatos e lacunas para revisão. No painel, use a aba **SDD**. Para expor a capacidade ao harness, acrescente `--sdd` ao servidor MCP já autorizado para o projeto. `--sdd --laya` pode habilitar as duas capacidades opcionais; preserve workspace/lane/home e escopo. [Rubrica, formatos e limites](integrations/SDD.md).

## 9. Atualizar da 0.2 para a 0.3 ou a 0.4

Da 0.3 para a 0.4 não há migração: o esquema do banco é o mesmo. Vindo da 0.2, na primeira abertura o serviço migra o banco sozinho, numa transação:

1. Grava antes uma cópia íntegra em `brain.v1-backup.sqlite`, na pasta de estado.
2. Preserva projetos, checkpoints, histórico, memórias e eventos.
3. Descarta o índice de texto, que é derivado dos arquivos, e zera o snapshot de cada projeto.

Depois disso, execute `index` em cada projeto. Até lá, `context` responde `INDEX_REQUIRED`. Checkpoints antigos continuam legíveis; se os arquivos mudaram desde então, aparecem com o aviso de snapshot diferente.

Para voltar à 0.2:

1. Pare todos os processos BBrainX (servidor e clientes MCP).
2. Se quiser guardar o estado atual, use `node bin/bbrainx.mjs backup --file …`, não uma cópia do arquivo.
3. Crie uma pasta **nova e vazia** e copie `brain.v1-backup.sqlite` para dentro dela com o nome `brain.sqlite`.
4. Use o código da 0.2 com `BBRAINX_HOME` apontando para essa pasta.

Não copie a cópia por cima do `brain.sqlite` em uso: os arquivos `brain.sqlite-wal` e `brain.sqlite-shm` que sobram ao lado dele pertencem ao banco novo e corrompem o restaurado. O que foi gravado depois da migração não volta junto. A cópia tem o mesmo conteúdo sensível do banco; apague-a quando não precisar mais dela.

## 10. Solução de problemas

| Código / sintoma | Ação |
|---|---|
| Node incompatível | Use Node 24 no terminal e no caminho absoluto do cliente. |
| Lockfile ausente | Atualize para uma revisão publicada após CI bem-sucedida; não use dependências flutuantes sem revisão. |
| `PROJECT_NOT_REGISTERED` | Registre o ID e raiz pelo CLI no mesmo `BBRAINX_HOME`. |
| `PROJECT_ROOT_ALREADY_REGISTERED` | A pasta já tem um nome; a mensagem diz qual. Use esse nome. |
| `STALE_INDEX` | Só ocorre com `--strict` ou quando o arquivo muda sem parar. Reindexe; não aceite código antigo como atual. |
| `INDEX_FILE_LIMIT` / `INDEX_BYTE_LIMIT` | Registre uma raiz menor, ignore diretórios pelo Git ou aumente o teto pela variável indicada na mensagem. |
| `SNAPSHOT_CONFLICT` | O snapshot informado não é o do índice atual. Omita o campo ou reindexe. |
| `MANDATORY_CONTEXT_EXCEEDS_BUDGET` | Aumente o orçamento ou revise memórias; não corte restrições silenciosamente. |
| `MIGRATION_REQUIRED` | O banco é de uma versão que este código não conhece, ou foi alterado por fora. Preserve backup; não apague o banco para esconder o erro. |
| Painel vazio / assets 404 | Execute build e use o servidor local, não abra `index.html` por file://. |
| Porta em uso | Escolha `--port`; não mate processos desconhecidos. |
| Clientes sem MCP | Exporte a saída de `context` e transfira o checkpoint explicitamente. |

Falhas devem vir com revisão, OS, Node, comando e log sanitizado. Nunca anexe `.env`, credenciais, banco privado ou transcript completo em uma issue pública.

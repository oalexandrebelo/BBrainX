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
node bin/bbrainx.mjs init --project meu-app --root "/Users/seu-usuario/Projetos/meu-app"
node bin/bbrainx.mjs index --project meu-app
node bin/bbrainx.mjs search --project meu-app --query "authenticate session"
node bin/bbrainx.mjs context --project meu-app --query "authenticate session" --budget 4000
```

Registre uma raiz pequena e intencional, não o diretório home. O escopo padrão aceita até 20.000 arquivos textuais elegíveis, 256 KiB por arquivo e 256 MiB somados. Quem inicia o processo pode ajustar esses tetos por `BBRAINX_MAX_FILES`, `BBRAINX_MAX_BYTES` e `BBRAINX_MAX_FILE_BYTES`; argumento de ferramenta não os altera. Medido num Mac M5 Pro: 3.662 arquivos (28 MiB) indexam em cerca de 3 s e ocupam 61 MB no banco. Arquivos ignorados, muito grandes, binários e padrões de segredo aparecem no diagnóstico quando pertinentes. Esses limites são limites de segurança iniciais, **não metas de escalabilidade comprovadas**.

A snapshot é do conjunto textual indexado, não uma prova de revisão completa de binários, submódulos, banco de dados ou ambiente externo. A indexação usa o conteúdo da worktree, incluindo alterações não commitadas e arquivos não ignorados. Antes de servir um trecho selecionado, o serviço verifica seu hash atual. Se o arquivo mudou, foi apagado ou passou a conter um padrão de segredo, ele é relido (ou retirado do índice) antes de o pacote ser montado, e o pacote lista esses caminhos em `refreshedFiles`. Com `--strict`, o pacote é recusado com `STALE_INDEX`, como na 0.2. Arquivos novos e mudanças nas regras de ignore só entram com uma nova indexação.

## 4. Conectar harnesses

```sh
node bin/bbrainx.mjs config --project meu-app --client codex
node bin/bbrainx.mjs config --project meu-app --client claude
```

O primeiro gera um fragmento TOML; o segundo gera JSON `mcpServers`. Revise e mescle no local indicado pela versão do seu cliente. Para VS Code, Antigravity ou outro cliente, use os mesmos `command`, `args` e `env`, adaptando somente o schema oficial. O projeto não garante que todos os clientes usem a mesma chave raiz.

O transporte é stdio, e o comando aponta para o `node` instalado e o script com caminho absoluto. Logs ficam em stderr; stdout pertence ao protocolo. Cada processo recebe um único `--project`, que não pode ser ampliado por argumentos de ferramenta.

No agente:

> Consulte `session_get` para a tarefa atual. Atualize `context_index` quando a worktree mudar. Use `context_bootstrap` com objetivo e orçamento. Ao encerrar, grave `session_checkpoint` com versão esperada e pendências reais. Proponha memórias, mas não assuma aprovação.

Não é necessário alterar `ANTHROPIC_BASE_URL`, configuração OpenAI, OmniRoute, JEV-Gateway ou autenticação nativa.

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

## 8. Atualizar da 0.2 para a 0.3

Na primeira abertura, o serviço migra o banco sozinho, numa transação:

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

## 9. Solução de problemas

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

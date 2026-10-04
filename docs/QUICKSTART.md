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

Registre uma raiz pequena e intencional, não o diretório home. O escopo inicial aceita até 5.000 arquivos textuais elegíveis, 256 KiB por arquivo e 32 MiB somados. Arquivos ignorados, muito grandes, binários e padrões de segredo aparecem no diagnóstico quando pertinentes. Esses limites são limites de segurança iniciais, **não metas de escalabilidade comprovadas**.

A snapshot é do conjunto textual indexado, não uma prova de revisão completa de binários, submódulos, banco de dados ou ambiente externo. A indexação usa o conteúdo da worktree, incluindo alterações não commitadas e arquivos não ignorados. Antes de servir um trecho selecionado, o serviço verifica seu hash atual. Mudanças em arquivos não selecionados podem exigir uma nova indexação para alterar o conjunto de resultados.

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
  "nextAction": "Ler as fontes e executar os testes no harness",
  "snapshot": "SUBSTITUA_PELO_HASH_REAL_DE_64_CARACTERES",
  "status": "review_needed"
}
```

```sh
node bin/bbrainx.mjs checkpoint --project meu-app --task AUTH-1 --file checkpoint.json --version 0 --key auth-attempt-1
```

Para a próxima alteração, use a versão retornada. Não reutilize a mesma chave para conteúdo diferente. `VERSION_CONFLICT` significa reconciliar o checkpoint, não repetir cegamente. Os estados aceitos são `in_progress`, `paused`, `blocked`, `review_needed`.

## 6. Memória com revisão

```sh
node bin/bbrainx.mjs propose --project meu-app --statement "Preservar o contrato público de autenticação" --source "docs/adr/001-auth.md"
node bin/bbrainx.mjs memory --project meu-app
node bin/bbrainx.mjs approve --project meu-app --id ID_RETORNADO --version 1
node bin/bbrainx.mjs revoke --project meu-app --id ID_RETORNADO --version 2
```

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

## 8. Solução de problemas

| Código / sintoma | Ação |
|---|---|
| Node incompatível | Use Node 24 no terminal e no caminho absoluto do cliente. |
| Lockfile ausente | Atualize para uma revisão publicada após CI bem-sucedida; não use dependências flutuantes sem revisão. |
| `PROJECT_NOT_REGISTERED` | Registre o ID e raiz pelo CLI no mesmo `BBRAINX_HOME`. |
| `STALE_INDEX` | Reindexe; não aceite código antigo como atual. |
| `MANDATORY_CONTEXT_EXCEEDS_BUDGET` | Aumente o orçamento ou revise memórias; não corte restrições silenciosamente. |
| `MIGRATION_REQUIRED` | Preserve backup e leia a migração; não apague o banco para esconder o erro. |
| Painel vazio / assets 404 | Execute build e use o servidor local, não abra `index.html` por file://. |
| Porta em uso | Escolha `--port`; não mate processos desconhecidos. |
| Clientes sem MCP | Exporte a saída de `context` e transfira o checkpoint explicitamente. |

Falhas devem vir com revisão, OS, Node, comando e log sanitizado. Nunca anexe `.env`, credenciais, banco privado ou transcript completo em uma issue pública.

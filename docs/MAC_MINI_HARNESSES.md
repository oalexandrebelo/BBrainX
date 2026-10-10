# BBrainX no Mac mini: operação entre harnesses

Estado operacional atualizado em 08/10/2026: [integração por projeto e instalação atual](integrations/MAC_MINI.md). O runtime atual é `abbdd0d`. O procedimento preferido agora é `bbrainx integrate` com plano, aplicação e rollback. O cadastro **global** BBrainX no Antigravity descrito abaixo pertence à observação histórica de 07/10 e foi retirado para preservar isolamento entre projetos; não reaplicá-lo como substituto de configuração por workspace.

Guia reutilizável, com formatos consultados em 07/10/2026. Os caminhos abaixo são parâmetros, não o inventário de uma máquina. O relatório local da instalação deve registrar versões, revisão Git, arquivos efetivamente carregados e verificações realizadas. Este documento não certifica conexão em todos os clientes nem execução de tarefas com modelos.

A [evidência da instalação de 07/10](artifacts/mac-mini-harness-2026-10-07.json) identifica a revisão instalada e os níveis efetivamente observados. Codex CLI/backend VS Code descobriram seis ferramentas; as interfaces Codex, Claude, Kilo e Antigravity reconheceram o BBrainX. A configuração de inferência Kilo → OmniRoute aguarda Base URL e modelo/combo do operador. Nenhuma tarefa de teste com LLM foi executada.

Leia [AGENTS.md](../AGENTS.md), [modelo de segurança](SECURITY_MODEL.md) e [continuidade](engineering/CONTINUITY.md) antes de operar. Não altere credenciais, TLS, aprovações ou gateways para fazer uma conexão funcionar.

## Runtime e estado

Use uma cópia privada do runtime identificada por **commit Git completo**, separada do projeto indexado. Confira a revisão e o lockfile antes de instalar suas dependências com `npm ci`. Não use uma branch móvel como identidade de implantação; conservar a revisão anterior permite rollback. Uma distribuição de fonte deve ter manifesto e checksums verificados antes do uso.

Escolha um executável absoluto de Node LTS compatível: Node 24 recomendado, mínimo 22.20. Confirme com `--version`; o `node` encontrado pelo terminal pode diferir daquele disponível ao IDE. A seleção de versões LTS segue o [calendário oficial do Node](https://nodejs.org/en/about/previous-releases).

Substitua os valores, sem copiar literalmente os placeholders:

```sh
BBRAINX_NODE='/absolute/path/to/node-lts'
BBRAINX_RUNTIME='/absolute/private/path/to/runtime-at-commit'
BBRAINX_ENTRY="$BBRAINX_RUNTIME/bin/bbrainx.mjs"
BBRAINX_STATE='/absolute/private/path/to/shared-state'
BBRAINX_PROJECT_ROOT='/absolute/path/to/project'
BBRAINX_PROJECT_ID='project-id'
```

Mantenha runtime, estado e backups em diretórios privados do usuário, fora do Git e de pastas públicas/sincronizadas. O diretório de estado deve ter modo `0700`; arquivos SQLite, `0600`. Todos os harnesses que compartilham a memória deste usuário devem receber o **mesmo caminho absoluto `BBRAINX_HOME`**. Compartilhar estado não compartilha nem substitui credenciais dos provedores. Outro processo sob o mesmo usuário continua dentro da fronteira de confiança do sistema operacional.

O operador registra e indexa explicitamente a raiz autorizada:

```sh
BBRAINX_HOME="$BBRAINX_STATE" "$BBRAINX_NODE" "$BBRAINX_ENTRY" up \
  --root "$BBRAINX_PROJECT_ROOT" --project "$BBRAINX_PROJECT_ID"
```

Confira o `project` devolvido: uma raiz já registrada conserva seu ID. Use esse ID efetivo em todas as configurações. Iniciar `mcp --project ID` concede somente esse projeto ao processo. Argumentos de ferramentas e conteúdo recuperado não ampliam grants. A configuração do cliente define **onde as ferramentas aparecem**; o grant do servidor define **qual projeto elas podem acessar**. Uma entrada global pode aparecer em conversas de outros repositórios, embora o servidor continue limitado ao projeto concedido.

## Gerar e revisar configurações

O comando `config` imprime sugestões; ele não grava a configuração do harness nem demonstra conexão. Use o runtime escolhido para gerar cada fragmento:

```sh
BBRAINX_HOME="$BBRAINX_STATE" "$BBRAINX_NODE" "$BBRAINX_ENTRY" config \
  --project "$BBRAINX_PROJECT_ID" --client antigravity
BBRAINX_HOME="$BBRAINX_STATE" "$BBRAINX_NODE" "$BBRAINX_ENTRY" config \
  --project "$BBRAINX_PROJECT_ID" --client kilo
```

Também existem `--client codex` e `--client claude`. Integre apenas a entrada BBrainX ao arquivo existente, preservando outras entradas e configurações. Não substitua um arquivo inteiro pelo fragmento. Revise os caminhos e o ID antes de iniciar o servidor; não publique configurações que contenham segredos de outros servidores.

Se usar um symlink `current` para selecionar a release, confira os argumentos emitidos: `import.meta.url` resolve o caminho físico e o gerador pode fixar a release anterior. Configure explicitamente o entrypoint absoluto sob `current`, ou um launcher estável que o invoque. Depois de atualizar, encerre as sessões antigas e confirme a revisão do novo processo; um processo já iniciado conserva o código carregado.

### Codex CLI e extensão do VS Code

Compartilham `~/.codex/config.toml`; projetos confiáveis também carregam `<PROJECT_ROOT>/.codex/config.toml`. Prefira esse arquivo de projeto para limitar a descoberta. O comando `codex mcp add` impresso pelo gerador registra no escopo de usuário; não trate sua execução como configuração exclusiva do workspace.

```toml
[mcp_servers.bbrainx]
command = "<ABSOLUTE_NODE_LTS>"
args = ["<ABSOLUTE_RUNTIME>/bin/bbrainx.mjs", "mcp", "--project", "<PROJECT_ID>"]

[mcp_servers.bbrainx.env]
BBRAINX_HOME = "<ABSOLUTE_SHARED_STATE>"
```

`.vscode/mcp.json` pertence ao suporte MCP próprio do VS Code; não é o arquivo de configuração da extensão Codex. Após alterar a configuração, reinicie a sessão CLI; na extensão, use **Restart extension** no gerenciador MCP. `codex mcp list` verifica o registro, enquanto `/mcp` mostra os servidores ativos da sessão. Confira separadamente cada superfície. [MCP oficial](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [precedência e projetos confiáveis](https://learn.chatgpt.com/docs/config-file/config-basic).

### Claude Code CLI e extensão do VS Code

Compartilham a configuração MCP. Para configuração pessoal restrita ao projeto, execute o comando gerado na raiz pretendida com escopo `local`: a entrada fica em `~/.claude.json`, dentro de `projects["<ABSOLUTE_PROJECT_ROOT>"].mcpServers`. A alternativa compartilhável é `<PROJECT_ROOT>/.mcp.json`, com objeto `mcpServers`. O escopo `user` vale para todos os projetos e não é a escolha de isolamento por workspace.

O stdio usa `command` como string, `args` como array e `env.BBRAINX_HOME`; os argumentos são `bin/bbrainx.mjs`, `mcp`, `--project`, ID, com caminho absoluto para o entrypoint. Mudanças entram nas conversas iniciadas depois. `claude mcp get bbrainx` pode verificar a conexão sem solicitar inferência; na extensão, confira `/mcp` em nova conversa. Mantenha as decisões de confiança e aprovação existentes. [Escopos MCP](https://code.claude.com/docs/en/mcp#mcp-installation-scopes), [configuração compartilhada com VS Code](https://code.claude.com/docs/en/vs-code#connect-to-external-tools-with-mcp).

Se faltar a CLI independente, o instalador nativo oficial aceita uma versão exata. Instalar essa versão não fixa permanentemente as futuras atualizações. Registre `claude --version`; `claude doctor` oferece diagnóstico sem iniciar uma sessão de modelo. Não crie dependência permanente de um binário dentro da pasta versionada da extensão. [Instalação oficial](https://code.claude.com/docs/en/setup#install-a-specific-version).

### Antigravity IDE

A documentação atual prevê `<PROJECT_ROOT>/.agents/mcp_config.json`; o arquivo global é `~/.gemini/config/mcp_config.json`. O fragmento gerado por `--client antigravity` usa `mcpServers.bbrainx` com `command`, `args` e `env`.

Confirme que a versão instalada reconhece o arquivo de workspace. No painel do agente, abra **MCP Servers → Manage MCP Servers → View raw config** e confira o caminho efetivamente carregado. O schema local pode confirmar o formato sem demonstrar descoberta do arquivo. Versões com guia embutido anterior podem documentar apenas configuração global/plugins; não declare isolamento de workspace apenas porque o JSON é válido.

Após editar, use a atualização/reconexão disponível no gerenciador e confira o estado e a lista de ferramentas. Se a versão exigir reinício da janela, registre esse procedimento. Não há necessidade de enviar um prompt ao modelo para conferir a descoberta e conexão. [Documentação oficial do Antigravity](https://antigravity.google/docs/mcp?tab=ide).

**Compatibilidade observada:** no Antigravity IDE 2.5.5 para macOS, o arquivo de workspace não foi descoberto. Um plugin mínimo sob `.agents/plugins/`, inclusive com registro explícito em `.agents/plugins.json`, também não apareceu após recarga da janela e do servidor de linguagem. Esses caminhos não são certificados para essa instalação. O cadastro de usuário em `~/.gemini/config/mcp_config.json` aceita o mesmo objeto `mcpServers` emitido pelo gerador. Ao usar esse destino, a descoberta é global ao cliente e o grant continua limitado a `mcp --project ID`; não descreva isso como isolamento de visibilidade por workspace. Preserve todos os servidores existentes e confirme o resultado no gerenciador nativo. O guia embutido do IDE e a documentação web podem corresponder a capacidades diferentes.

Na instalação observada, **Customizations → Installed MCP Servers → Refresh** mostrou `bbrainx` com seis ferramentas habilitadas após esse cadastro de usuário. Os sete servidores anteriores foram preservados. Os arquivos locais de descoberta não utilizados foram retirados com backup para não criar registros duplicados em uma atualização futura.

### Kilo Code 7 no VS Code

Use o formato atual em `<PROJECT_ROOT>/.kilo/kilo.json` ou `.jsonc`; se o projeto já tiver `kilo.json`/`kilo.jsonc` na raiz, edite o arquivo reconhecido. A configuração global fica em `~/.config/kilo/`. Não reutilize automaticamente o formato legado `mcpServers` de extensões antigas.

O gerador `--client kilo` produz `mcp.bbrainx` com `type: "local"`, `command: [NODE, ENTRY, "mcp", "--project", ID]`, `environment: {"BBRAINX_HOME": STATE}`, `enabled: true` e `timeout: 60000`. O timeout é **60 segundos, em milissegundos**; não é um orçamento de inferência. Nenhuma permissão automática de ferramenta é adicionada.

No Kilo, confira **Settings → Agent Behaviour → MCP Servers** e o estado/ferramentas do servidor depois de recarregar a configuração. A conexão do processo local independe da escolha do provedor de modelo. [MCP atual](https://kilo.ai/docs/automate/mcp/using-in-kilo-code), [configurações do Kilo](https://kilo.ai/docs/getting-started/settings).

### Kilo com OmniRoute como provedor

BBrainX conecta diretamente ao Kilo como MCP stdio. OmniRoute, nesta combinação, é o provedor/gateway de inferência selecionado no Kilo; configurar um não configura o outro. Conserve URL, modelo, autenticação e política do provedor existentes. Quando faltar URL/modelo, registre a pendência e obtenha os valores do operador; não invente defaults nem copie credenciais para o JSON MCP.

Não suponha que o servidor MCP próprio do OmniRoute registre ou agregue qualquer servidor externo. A [solicitação de agregação upstream](https://github.com/diegosouzapw/OmniRoute/issues/6364) foi encerrada como não planejada; isso não equivale a um registro BBrainX suportado. Valide o fluxo BBrainX → Kilo separadamente do fluxo Kilo → OmniRoute → modelo. Não execute instaladores de provider nem reconfigure gateways como parte deste guia.

## Critérios de evidência

| Nível | Evidência necessária | Limite da conclusão |
| --- | --- | --- |
| Configuração | Parser válido, paths/ID corretos, entrada descoberta pelo cliente | Não demonstra handshake nem ferramentas disponíveis. |
| Processo/protocolo | Processo real, initialize e tools/list, chamada direta local e encerramento limpo | Não demonstra que cada IDE nativo carregou o servidor. |
| Conexão nativa | Estado conectado e ferramentas disponíveis no CLI/IDE escolhido, com versão registrada | Não demonstra que um modelo selecionou e utilizou a ferramenta. |
| Tarefa com LLM | Tarefa delimitada autorizada, chamada BBrainX observada e resultado conferido | Não certifica todas as tarefas, modelos, custos ou harnesses. |

Registre por cliente: revisão do runtime, Node, versão do cliente, escopo/arquivo, resultado, erro e próxima ação. Relate somente keys e a entrada BBrainX com valores sensíveis ocultos. Não imprima arquivos completos de configuração ou credenciais. Os testes do núcleo e um handshake independente são controles úteis; não substituem a conexão nativa. Uma tarefa com modelo deve ter objetivo e critério de aceite definidos, sem prometer economia de tokens ou preço.

## Atualização e rollback

Antes de trocar runtime/configuração, preserve a revisão anterior e um backup privado da configuração que será editada. Guarde apenas o necessário; o backup também pode conter segredos.

O backup do núcleo usa o mecanismo SQLite implementado pelo BBrainX:

```sh
BBRAINX_HOME="$BBRAINX_STATE" "$BBRAINX_NODE" "$BBRAINX_ENTRY" backup \
  --file '<ABSOLUTE_PRIVATE_BACKUP>/brain-before-update.sqlite'
```

Esse comando não é backup automático de todo o sistema: usage e lanes podem ter bancos separados. Faça inventário, use backups consistentes de cada banco e ensaie restauração em diretório isolado. `VACUUM INTO` gera uma cópia consistente do banco selecionado; copiar com `cp` um SQLite em uso não substitui esse mecanismo. [SQLite VACUUM INTO](https://www.sqlite.org/lang_vacuum.html#vacuuminto), [backup consistente](https://www.sqlite.org/backup.html).

Para rollback, encerre os processos BBrainX de todos os harnesses que usam o estado. Volte os entrypoints para o runtime anterior e restaure somente uma configuração revisada. Se houve mudança de schema/estado, use a restauração ensaiada do conjunto de bancos em outro diretório privado e confira compatibilidade antes de apontar `BBRAINX_HOME` para ele. Não sobreponha bancos ativos nem presuma que um runtime antigo abre um schema novo. Reinicie e repita descoberta/conexão; mantenha o estado anterior preservado até concluir a verificação.

## Próximo colaborador

Retome pela [continuidade](engineering/CONTINUITY.md), confirme revisão/CI e consulte o [roadmap](engineering/ROADMAP.md). As próximas frentes são **EV-05**, corpus fixado e tarefas aceitas; **EV-06**, limites para trabalho síncrono; e **EV-07**, restauração do conjunto de bancos. Delimite uma delas, preserve invariantes e deixe evidência reproduzível e próxima ação concreta. Configurar harnesses não conclui essas frentes nem estabelece evolução autônoma permanente.

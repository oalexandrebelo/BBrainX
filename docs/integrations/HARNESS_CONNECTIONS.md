# Claude e Codex juntos — conexões da 2.1

O BBrainX recruta agentes nas CLIs já instaladas e autenticadas nesta máquina. Um chat do Claude pode pedir um agente Codex; um chat do Codex pode pedir um agente Claude. O BBrainX não compartilha assinaturas entre provedores: cada CLI usa sua própria conta, modelos, políticas e limites. Não lê tokens, copia credenciais ou troca o login.

O chat principal chama `agents_recruit`, consulta `agents_status` até a conclusão e apresenta o resultado. Cada recruta recebe worktree, branch e lane próprias. O trabalho não é mesclado automaticamente. Para uma verificação sem edição, peça **modo revisão**; a execução ainda consome a cota da conta.

## 1. Conferir a máquina e registrar o projeto

Na instalação BBrainX, com Node e Git disponíveis:

```sh
node bin/bbrainx.mjs recruit doctor
node bin/bbrainx.mjs up --root /caminho/do/projeto --project meu-projeto
```

`recruit doctor` executa os comandos de versão e status das próprias CLIs. Para recrutar, o projeto precisa ser um repositório Git com um commit base. Se faltar login, conclua a autenticação pelo próprio Claude Code ou Codex; conectar BBrainX não cria uma conta.

A descoberta procura executáveis funcionais no PATH e nas instalações conhecidas dos apps/extensões. Um wrapper que falha em `--version` é pulado na descoberta automática. Versões de extensões são ordenadas numericamente, mas um CLI funcional do PATH continua tendo prioridade.

Para escolher uma instalação específica, defina caminhos absolutos antes de `recruit doctor`, `integrate` ou `config`:

```sh
export BBRAINX_CLAUDE=/caminho/absoluto/para/claude
export BBRAINX_CODEX=/caminho/absoluto/para/codex
```

Não copie esses exemplos literalmente: use os binários da sua máquina. Os overrides são validados; um caminho inválido falha sem trocar silenciosamente de CLI. Com recrutamento habilitado, o gerador grava somente os overrides explícitos no ambiente do servidor MCP. Isso ajuda apps gráficos que não herdam o PATH do terminal. Sem recrutamento, esses overrides não são incluídos.

## 2. Claude Code, Codex e VS Code por projeto

```sh
node bin/bbrainx.mjs integrate --root /caminho/do/projeto --project meu-projeto --clients codex,claude,vscode
node bin/bbrainx.mjs integrate --root /caminho/do/projeto --project meu-projeto --clients codex,claude,vscode --apply
```

O primeiro comando mostra o plano. O segundo grava as entradas do projeto com backup e inclui recrutamento por padrão; acrescente `--no-recruit` para expor somente contexto e memória. Os destinos são `.codex/config.toml`, `.mcp.json` e `.vscode/mcp.json`. O instalador preserva entradas alheias, logins, providers, trust e aprovações. Veja [INSTALLER.md](INSTALLER.md) para adoção de entradas antigas e rollback por recibo.

Depois de aplicar:

- **Claude Code, terminal ou extensão:** abra uma nova sessão na pasta do projeto, aprove o servidor BBrainX e confira `/mcp`.
- **Codex, app ou extensão:** abra o projeto confiável e uma nova sessão para carregar `.codex/config.toml`. A confiança é decisão do usuário no cliente.
- **VS Code MCP:** recarregue a janela e use *MCP: List Servers* para iniciar o servidor BBrainX.

Com recrutamento, o catálogo básico tem nove ferramentas: seis de contexto/memória e `agents_recruit`, `agents_status`, `agents_dismiss`. A presença do arquivo não prova que o cliente carregou o servidor: confirme conexão e execute uma busca real.

A configuração é por projeto. Abrir uma pasta qualquer não autoriza esse novo projeto nem troca o escopo da memória. Repita a integração para cada raiz que desejar conectar.

O servidor anuncia o ícone BBX atual nos metadados MCP; painel e extensão usam a mesma identidade. Cada cliente decide onde renderizá-lo, e terminais podem não mostrar PNG. Depois de uma atualização, recarregue o cliente ou abra uma nova sessão e conclua a aprovação inicial, quando solicitada. Ícone visível não prova ativação: confirme as ferramentas e uma chamada real.

## 3. Chat normal do Claude desktop

O gerador da 2.1 imprime JSON puro com uma entrada `mcpServers.bbrainx-meu-projeto` e identifica o cliente com `--harness claude-desktop`:

```sh
node bin/bbrainx.mjs config --client claude-desktop --project meu-projeto --recruit
```

O comando **só imprime**: não escreve a configuração global do app. No macOS, faça backup de `~/Library/Application Support/Claude/claude_desktop_config.json` e mescle a entrada gerada em `mcpServers`, preservando os outros servidores e campos. Proteja o backup como o arquivo original. Se a entrada já existir, compare-a antes de substituir. Não substitua o arquivo inteiro pela saída.

Encerre e reabra o Claude app, confira o servidor em **Configurações → Desenvolvedor** e habilite o conector no chat normal. Aprovações de ferramentas continuam no próprio Claude. O fluxo local usa stdio; o campo **URL do servidor MCP** em “Adicionar conector personalizado” serve para outra forma de conexão, um servidor remoto. Esta entrega não publica um endpoint HTTPS.

O nome inclui o projeto para permitir entradas distintas no arquivo de usuário. O servidor fica fixado ao ID registrado; não recebe `--workspace`, pois o cwd do app não representa a pasta do projeto. Estar visível em vários chats não lhe dá acesso automático aos projetos desses chats: escolha o conector correspondente.

## 4. Pedidos em linguagem natural

No Claude, com o BBrainX habilitado:

> Pelo BBrainX, recrute 1 Codex Luna 6 high, em modo revisão, para responder apenas OK. Aguarde terminar e traga a resposta aqui.

No Codex:

> Pelo BBrainX, recrute 1 Claude Haiku 5.5 low, em modo revisão, para responder apenas OK. Aguarde terminar e traga a resposta aqui.

Para trabalho conjunto:

> Pelo BBrainX, recrute 1 Codex Astra 6 high e 1 Claude Opus 5.5 xhigh, em modo revisão, para revisar esta mudança. Aguarde ambos e compare as conclusões.

O harness separa o pedido de modelos em `spec` e a tarefa em `task`. Use a versão do modelo, como `Luna 6`, ou o ID completo aceito pela sua CLI. O parser não é catálogo de disponibilidade: modelos, esforços e acesso podem variar por conta e versão do harness. Um modelo indisponível deve resultar em falha explícita da CLI, não em promessa de acesso.

A 2.1 conserva IDs como `claude-opus-5` sem acrescentar `-0`. Ao executar Claude, também passa `availableModels` limitado ao modelo solicitado apenas naquele processo. Na configuração validada, isso evita a promoção de Haiku para Sonnet em modo plan, mantendo a política de revisão. Settings combinados e políticas gerenciadas do harness continuam aplicáveis. Para conferir fidelidade, inspecione os metadados do modelo no resultado nativo, quando disponíveis.

## 5. Outra conta existente e OmniRoute opcional

O padrão é a autenticação já configurada na CLI selecionada. Para uma conta que já tenha sua própria pasta de configuração, use:

```sh
node bin/bbrainx.mjs recruit start --project meu-projeto --spec "1 codex luna 6 high" --task "Responda apenas OK" --mode review --account /pasta/absoluta/da/conta
```

Sem `--apply`, o comando mostra o plano. Acrescente `--apply` para executar. `--account` precisa apontar para uma pasta existente: ela será `CODEX_HOME` para Codex ou `CLAUDE_CONFIG_DIR` para Claude. Para pastas diferentes, faça chamadas separadas. BBrainX não copia sessões ou faz login nessa pasta.

**OmniRoute permanece uma opção externa.** Use o launcher ou perfil de gateway que você já tenha configurado, com URL, autenticação e modelo válidos nesse gateway. A 2.1 não adiciona um provider OmniRoute, não converte modelos do gateway em logins nativos e não muda o provider padrão do Claude/Codex. O catálogo e os custos desse caminho são os do gateway; seu acesso não é prova de disponibilidade na assinatura nativa.

## Evidência e limite da entrega

Os ensaios que motivaram a 2.1 foram feitos na 2.0 instalada com correções locais no MacBook, em 13/10/2026: SDK MCP → Codex Luna 6 high → `OK`; SDK MCP → Claude Haiku 5.5 low → `OK`, com Haiku confirmado em `modelUsage`. Uma tentativa anterior usou Sonnet apesar do pedido Haiku e foi mantida como diagnóstico. Catálogo de 7 IDs Codex e 12 Anthropic validado pelo parser, sem inferência de todos os modelos. Naquela instalação, 760 testes e build passaram.

Essa prova cobre recrutamento real via configurações MCP e contas nativas; não é prova de um pedido originado pelo modelo em todas as interfaces. Resultados automatizados da revisão 2.1 e CI precisam ser associados à ponta entregue: [notas de versão](../RELEASE_NOTES.md). Não há sincronização de contas, memória, checkpoints ou recrutas entre máquinas.

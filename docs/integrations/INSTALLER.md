# Integração conservadora de harnesses

O instalador descobre clientes sem executar seus binários, produz um plano público sem conteúdo de configurações e aplica somente a entrada MCP `bbrainx` no projeto autorizado pelo host. Não configura provedores, credenciais, confiança de workspace, aprovação automática ou gateways. O vínculo projeto/raiz/lane deve ser conferido no registro do host pelo chamador, antes do plano. Uma string recebida de ferramenta, texto recuperado ou pedido HTTP não concede essa autoridade.

## Comandos do host

```sh
node bin/bbrainx.mjs integrations
node bin/bbrainx.mjs integrate --root /raiz/do/projeto --clients codex,claude,vscode,kilo
node bin/bbrainx.mjs integrate --root /raiz/do/projeto --clients codex,claude,vscode,kilo --apply
node bin/bbrainx.mjs integrations rollback --id ID_DO_RECIBO
```

Sem `--apply`, não escreve configurações. `--apply` permite registrar a raiz no catálogo, aplica e indexa; `--project ID` seleciona ID, recusando vínculo incompatível ou sobreposição. `--lane ID` exige vínculo já existente da lane. `--adopt-existing` é opt-in para migração estritamente validada do gerador anterior. O plano não instala harnesses nem o launcher do plugin. Falha de indexação após aplicação retorna `indexError` e o recibo para recuperação. `discover --root /raiz/do/projeto` combina leases de pastas abertas, catálogo e discovery histórico limitado, sem substituir autorização do catálogo.

O launcher confiável do host pode definir `BBRAINX_NODE` com um caminho estável, por exemplo o alias `opt` de um gerenciador de versões. A CLI exige caminho absoluto existente que resolva por `realpath` para o mesmo executável de `process.execPath`, e conserva o alias no comando gerado. Outro binário, caminho relativo ou ausente é recusado antes de criar estado/configuração. Isso permite adotar o legado com o mesmo caminho estável sem aceitar executáveis arbitrários nem relaxar a comparação dos demais campos.

O [plugin próprio](../../extensions/vscode/README.md) é um VSIX local separado: `node scripts/package-extension.mjs` requer Python 3 apenas para empacotar. Detectar usa o plano; Conectar usa `integrate --apply`. Workspace API/heartbeats demonstram uma pasta aberta no host cooperante; não demonstram conexão MCP, não concedem projeto e não habilitam fallback global no Antigravity IDE.

## Interface do módulo

`src/integrations.mjs` exporta funções síncronas:

```js
discoverIntegrations({ userHome, platform, env })
planIntegrations({ root, project, lane, home, node, entry, clients, adoptExisting,
                   userHome, platform, env })
applyIntegrationPlan(plan)
rollbackIntegration({ home, id })
```

`userHome`, `platform` e `env` são opcionais e permitem descoberta reproduzível. `clients` aceita `codex`, `claude`, `vscode`, `kilo` e `antigravity`; sem essa opção, seleciona os clientes detectados. A seleção explícita permite preparar configuração para um cliente ainda não instalado e mantém `detected: false` no relatório. Não instala clientes.

`root` precisa ser absoluto, existir e já estar na forma canônica. `project` e `lane` precisam ser identificadores válidos; a correspondência com o registro é responsabilidade do host. `node`, `entry` e `home` são caminhos absolutos. Todos os servidores gerados recebem:

```text
ENTRY mcp --project PROJECT [--lane LANE] --workspace ROOT --harness CLIENT
```

O processo MCP deve conferir o vínculo de raiz/projeto/lane antes de disponibilizar ferramentas. A integração não presume que registrar uma entrada ou renomear um servidor autoriza outros projetos. A CLI e o painel chamam o mesmo módulo; aplicar exige uma ação explícita da pessoa no host. O MCP não expõe aplicação de configuração como ferramenta.

O plano inclui `schemaVersion`, `id`, `project`, `root`, `clients`, `files`, `ready` e `warnings`. Cada arquivo contém cliente, destino, escopo, nome do servidor, status e fingerprints SHA-256; erros são códigos estáveis. Os estados são `create`, `update`, `unchanged`, `blocked` e `manual-required`. `ready` indica a presença de uma operação suportada, não conexão ou aprovação de um harness. Um `blocked` impede toda aplicação daquele plano. Etapas `manual-required` não são escritas.

Aplicação aceita apenas o objeto original produzido no mesmo processo e recusa planos clonados, desserializados ou alterados. CLI pode gerar e aplicar em uma execução; painel deve manter o objeto autorizado no servidor e receber apenas um identificador ao aplicar. Se um arquivo mudou depois do plano, a aplicação recusa e exige um novo plano. Nunca deve interpretar um plano enviado pelo navegador como uma lista de paths autorizados.

## Discovery e destinos

A descoberta lê somente nomes e metadados de executáveis no PATH, pastas de extensões VS Code/Insiders e bundles conhecidos em `/Applications` ou `~/Applications` no macOS. Codex desktop reconhece `ChatGPT.app` e `Codex.app`, com origem do bundle no relatório e presença de caminhos fixos da CLI embutida, sem executar esses binários. Antigravity IDE reconhece `Antigravity IDE.app`; `Antigravity.app` é outro produto e não comprova a instalação do IDE. Não inicia clientes, consulta versões pela execução de comandos, lê settings de usuário, abre históricos ou busca contas/provedores. Caminho instalado é indício; não demonstra que uma extensão está habilitada, que o cliente carregou uma configuração ou que existe uma conexão nativa. Em Windows, usa PATHEXT; em Unix, exige executável no PATH. Não há busca recursiva no disco nem cobertura automática de todo perfil/custom installation.

| Cliente | Destino do projeto | Operação |
| --- | --- | --- |
| Codex desktop/CLI/extensão | `.codex/config.toml` | Valida TOML; acrescenta ou atualiza bloco próprio. |
| Claude Code CLI/extensão | `.mcp.json` | Mescla `mcpServers.bbrainx`; conserva decisões de confiança/aprovação. |
| MCP próprio do VS Code | `.vscode/mcp.json` | Mescla `servers.bbrainx`; é diferente da extensão Codex. |
| Kilo Code atual | `kilo.json`, `kilo.jsonc`, `.kilo/kilo.json` ou `.kilo/kilo.jsonc` | Usa único destino existente; sem arquivo, cria `.kilo/kilo.json`. Mais de um candidato exige resolução manual. |
| Antigravity IDE | Nenhum automático | `manual-required`; não há fallback global. |

Codex compartilha configuração entre clientes e só carrega a camada do projeto quando ele é confiável. O instalador não muda a confiança. [MCP oficial do Codex](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [configuração e confiança](https://learn.chatgpt.com/docs/config-file/config-basic).

Claude possui escopo pessoal local em `~/.claude.json` e escopo compartilhável em `.mcp.json`. O instalador escolhe o segundo para não precisar editar o arquivo pessoal. Essa entrada permanece sujeita às aprovações existentes, e o caminho absoluto do runtime/estado deve ser revisado antes de versionar o arquivo. CLI e extensão compartilham a configuração MCP. [Escopos oficiais](https://code.claude.com/docs/en/mcp#mcp-installation-scopes), [extensão VS Code](https://code.claude.com/docs/en/vs-code#connect-to-external-tools-with-mcp).

Kilo usa `mcp` e servidor local com array `command`, `environment`, `enabled: true` e `timeout: 60000` em milissegundos. O instalador conserva provider e regras de aprovação, incluindo OmniRoute quando já configurado. Não executa `omniroute setup-kilo`: esse fluxo pode alterar autenticação e settings do provedor. Base URL, modelo/combo e chave ausentes continuam pendências do operador; MCP pode conectar sem validar inferência. [MCP atual do Kilo](https://kilo.ai/docs/automate/mcp/using-in-kilo-code), [setup de clientes do OmniRoute](https://omniroute.hagicode.com/en-US/guides/remote-mode/).

## Antigravity IDE e múltiplos projetos

Consulta oficial em 08/10/2026: a seção que documenta `.agents/mcp_config.json` em workspace e `~/.gemini/config/mcp_config.json` global se refere explicitamente à **Antigravity CLI**. Para o IDE, a página orienta gerenciador/store e edição de raw config. Não extrapolar isso para descoberta automática de workspace no IDE. [Documentação MCP oficial](https://antigravity.google/docs/mcp?tab=ide).

Na evidência local anterior, Antigravity IDE 2.5.5 não descobriu o arquivo do workspace nem o plugin mínimo; reconheceu o cadastro global. Isso é uma observação daquela versão e instalação, não uma afirmação sobre todas as versões. O registro está em [MAC_MINI_HARNESSES.md](../MAC_MINI_HARNESSES.md).

Para múltiplos projetos, o instalador recusa a configuração automática do IDE. Não registra todos os projetos em um servidor global e não usa o campo `project` de uma chamada MCP para selecionar grants. Uma integração futura pode usar um launcher que derive a raiz de contexto confiável do host e a encontre em um mapa aprovado, concedendo exatamente um projeto; ausência de raiz demonstrável ou ambiguidade deve recusar inicialização. CWD e lista MCP de roots precisam de evidência de origem e testes nativos antes de servirem como autoridade. O módulo atual não implementa esse launcher nem declara isolamento de visibilidade no IDE.

## Preservação, backups e rollback

JSON/JSONC é validado por `jsonc-parser`, com recusa de chaves duplicadas; edições pontuais conservam os comentários e valores alheios. TOML é validado por `smol-toml`; só o bloco delimitado do BBrainX pode ser atualizado, e tabelas alheias conservam seus bytes. Uma entrada existente exatamente igual é idempotente. Uma entrada diferente não é substituída só por se chamar `bbrainx` ou carregar um comentário de propriedade: exige recibo aplicado que corresponda ao fingerprint atual do arquivo. Edições posteriores, inclusive fora da entrada, impedem essa atualização até revisão manual.

Recusa symlinks em destinos e descendentes da raiz canônica, diretórios onde se espera um arquivo, arquivos acima de 1 MiB, encoding inválido e formatos inválidos. Os anchors confiáveis são canonicalizados; isso acomoda os symlinks de sistema `/tmp` e `/var` no macOS. Não há defesa contra um processo adversarial sob o mesmo usuário substituindo diretórios entre chamadas de sistema; permanece a fronteira local do SO declarada no modelo de segurança.

Para migrar uma instalação feita pelo gerador anterior, o host pode optar explicitamente por `adoptExisting: true` (CLI `--adopt-existing`). A entrada antiga precisa coincidir estruturalmente com o gerador: mesmo Node, entrypoint, projeto, lane e `BBRAINX_HOME`; argumentos antigos sem seleção dinâmica, env sem outras chaves e nenhum campo desconhecido. O plano marca `adoption: "exact-legacy-generator"`, com hashes antes/depois. Nome `bbrainx` sozinho nunca comprova origem. Um runtime antigo com caminho diferente exige revisão manual, não adoção automática.

Em Codex, permite `enabled: true`, `required: false` e timeouts numéricos de 1 a 3600 segundos conhecidos; conserva esses campos durante a migração. Apenas as duas tabelas simples emitidas pelo gerador (`bbrainx` e `bbrainx.env`, uma atribuição por linha) podem ser adotadas; arrays multilinha, atribuições com comentários ou formas ambíguas são recusados. O parser confirma que a remoção dessas tabelas não muda valores alheios antes de construir o bloco novo. Env com credenciais, hooks, auto-approve, outro servidor, outro projeto, argumentos adicionais ou outro formato permanece bloqueado mesmo com opt-in. Backup, CAS e rollback são os mesmos da aplicação normal, incluindo restauração byte a byte da configuração antiga.

Antes de escrever, verifica todos os fingerprints. Backups exatos, com segredos alheios se existirem, ficam em `HOME/integrations/<receipt-id>/*.bak` com modo `0600`; diretórios e recibo usam `0700`/`0600` em Unix. Diretórios privados existentes com permissões abertas são recusados. Em Windows, modos POSIX não substituem ACLs do usuário. Os relatórios públicos não incluem bytes, argumentos privados de outros servidores ou valores de credenciais; exibem somente os destinos/fingerprints e status.

Gravação de cada configuração usa temporário no mesmo diretório, `fsync` do arquivo e rename; conserva modo anterior ou usa `0600` para novos arquivos. Um recibo `preparing` é salvo antes do primeiro rename e permite recuperação depois de interrupção. A operação não é uma transação atômica entre clientes: falha tenta rollback protegido e conserva o recibo se houver edição concorrente que impeça restauração.

`rollbackIntegration({home,id})` verifica todos os destinos e os hashes dos backups antes da primeira restauração. Recusa se houver conteúdo posterior diferente; não sobrescreve essa edição. Restaura arquivos existentes byte a byte e remove somente os arquivos criados naquela aplicação. As pastas vazias podem permanecer. Repetição de rollback concluído não faz novas alterações. Não restaura bancos SQLite nem reinicia clientes; sessões antigas precisam de recarga/reinício e verificação nativa separada.

## Nome, logo e prova de funcionamento

As configurações usam a chave compatível `bbrainx`. Não existe uma propriedade de logo universal nos formatos de configuração pesquisados; campos arbitrários não são acrescentados. MCP pode anunciar `serverInfo.title` e `icons` onde o protocolo/cliente suportar; renderização é opcional e exige prova nativa por superfície. O schema prevê title/ícones como metadata de apresentação, não grants. [MCP Implementation](https://modelcontextprotocol.io/specification/2025-11-25/schema#implementation).

Plano/aplicação validam configuração; não provam descoberta, handshake, conexão nativa ou uso com modelo. Registrar separadamente versão do cliente, arquivo realmente carregado, estado conectado e ferramentas, seguindo os níveis de [MAC_MINI_HARNESSES.md](../MAC_MINI_HARNESSES.md#critérios-de-evidência).

Validação reproduzível da fatia:

```sh
node --test test/integrations.test.mjs
```

As fixtures são temporárias e sintéticas: não dependem dos arquivos pessoais do operador. Cobrem leitura sem execução, preservação JSONC/TOML, escopo dos argumentos, idempotência, atualização por recibo, colisões, edição concorrente, symlinks, tamanho, duplicidade, backup inválido, permissões e rollback. Integração final também requer os gates `npm test`, `npm run build` e E2E quando o painel mudar.

# Manual integrador (`bbx ch`)

Uma página local confere toda a integração do BBrainX com os harnesses deste computador e resolve em um clique o que
o código consegue resolver. O que depende de você (aprovar, confiar, colar uma configuração) vira passo guiado, com o
comando pronto e o botão que abre o lugar certo.

## Como abrir

| Onde | Como |
|---|---|
| Terminal | `bbx ch`. Imprime o resumo e abre a página no navegador. `bbx ch --no-open` só imprime; `bbx ch --json` dá o relatório completo; `--project ID` limita a um projeto |
| Chat (Claude Code, Codex, VS Code) | Digite **bbx ch**. O modelo chama a ferramenta `bbx_check`, mostra o resumo e devolve o link da página |
| Sem atalho `bbx` | `bbrainx ch`. A própria página oferece criar o atalho |

A página só existe em `127.0.0.1`, numa porta livre. O link traz um token depois do `#`, que o navegador não envia em
pedido nem em Referer. Ela fecha sozinha depois de 30 minutos sem uso, pelo botão **Fechar** ou com Ctrl+C no terminal.

## O que cada clique faz

| Tipo | Comportamento |
|---|---|
| Só leitura | Roda no clique. Reindexar entra aqui, porque o índice é derivado |
| Grava (configs, atalho, pasta) | Primeiro mostra **exatamente o que muda** (diff linha a linha). Só executa no segundo clique. Se algo mudou entre ver e aplicar, recusa (`CHECK_PLAN_CHANGED`) e pede nova prévia |
| Desfazer | Toda gravação de configuração deixa um recibo. **Desfazer** restaura os arquivos como estavam, se ninguém os mudou depois |
| Abrir | Terminal com um comando fixo (login oficial, abrir a CLI no projeto) ou o arquivo no VS Code. A página nunca envia comando livre |
| Copiar | Copia um trecho pronto (configuração do Antigravity) para você colar |

**Senhas.** O manual nunca pede, vê ou guarda senha. Login de conta abre o fluxo oficial da CLI (`claude auth login`,
`codex login`) no Terminal, e o login acontece no navegador do serviço. Segredos do próprio sistema (o token desta
página) são gerados a cada abertura e ficam só na memória.

## Casos

### Este computador

| Caso | Confere | Resolve no clique | Seu passo, se o código não cobre |
|---|---|---|---|
| Node.js | Versão mínima, SQLite e FTS5 | — | Instalar o Node 24 (`brew install node@24`) e rodar o instalador do kit |
| Atalho `bbx` | Se `~/.local/bin/bbx` existe | Cria o atalho, igual ao `bbrainx` | Sem nenhum atalho: rodar o `INSTALAR.sh` do kit |
| Pasta de necessidades | Se `Downloads/Projetos` existe | Cria a pasta e a registra para busca (`projetos`) | No macOS, permitir acesso a Downloads quando o sistema pedir |
| Estado do BBrainX | Onde fica o banco | — | — |

### Harnesses

| Caso | Confere | Resolve no clique | Seu passo |
|---|---|---|---|
| Claude Code | Instalado, versão, logado | Abre o Terminal com `claude auth login` | Concluir o login no navegador |
| Codex | Instalado, versão, logado | Abre o Terminal com `codex login` | Concluir o login no navegador |
| VS Code | Comando `code` e extensão BBrainX | — | `Shell Command: Install 'code' command in PATH`; extensão pelo kit (`--vscode`) |

### Cada projeto registrado

| Caso | Confere | Resolve no clique | Seu passo |
|---|---|---|---|
| Configs (Claude Code, Codex, VS Code, Kilo) | Se cada arquivo é o que o BBrainX desta versão gravaria (caminho, `--recruit`, `--files`) | **Ver o que muda** → aplicar, com recibo e desfazer | — |
| Entrada alheia (`INTEGRATION_SERVER_COLLISION`) | O arquivo já tem um `bbrainx` que o BBrainX não gravou | **Abrir o arquivo** | Apagar ou renomear a entrada antiga. O BBrainX não sobrescreve trabalho alheio |
| Bloco gerenciado editado | Os marcadores BBRAINX contêm outro conteúdo | Abrir o arquivo | Mover o que for seu para fora dos marcadores |
| Antigravity | Não tem configuração por projeto verificável | **Copiar configuração** | Antigravity → Settings → MCP → Edit config, colar, salvar, reiniciar |
| Confiança no Codex | Se o projeto está como confiável em `~/.codex/config.toml` (só leitura) | **Abrir o Codex no projeto** | Responder que confia quando o Codex perguntar |
| Conexões | Última sessão de cada harness, pelo registro do próprio BBrainX. Uma sessão do Claude Code prova que você aprovou o servidor | **Abrir o Claude Code no projeto** | Aprovar os servidores do `.mcp.json` quando o Claude Code perguntar; conferir com `/mcp` |
| Sessões abertas | Servidores rodando com a configuração anterior (por exemplo, sem `--files`) | — | Claude Code: `/mcp` e reconectar `bbrainx`. Codex: reabrir a sessão. VS Code: `MCP: List Servers` → bbrainx → Restart |
| Pasta do projeto | Se a raiz ainda existe | — | Projeto movido: `bbrainx integrate --root <nova pasta> --project ID --apply` |

## O que o BBrainX nunca faz por você

- Aprovar servidores no Claude Code.
- Marcar projeto como confiável no Codex.
- Mudar trust, aprovações, provedores ou a configuração global de qualquer harness.
- Ler credenciais.
- Mexer em entrada de configuração que não foi gravada por ele.

O manual leva até o ponto exato e deixa a decisão com você.

## Ideias para próximas versões

| Ideia | Critério |
|---|---|
| Casos da web (ChatGPT/Claude via AB-S00S, túnel, conector) | Mesmo modelo: conferir, prévia, passo guiado com link direto para a tela de conectores |
| Contas e cotas (segunda conta, limites do Codex) | Só o que a CLI expõe; login sempre pelo fluxo oficial |
| Windows e Linux | Terminal e navegador já têm caminho próprio; falta homologar nas máquinas |

# Pasta de necessidades (Downloads/Projetos)

O que os modelos geram fica gravado direto no computador, numa pasta real, em vez de ficar só no chat ou em `/tmp`. Cada
necessidade ganha uma subpasta própria. Vale para os harnesses locais (Claude Code, Codex, VS Code, servidor iniciado com
`--files`) e para o ChatGPT web e o Claude web, pelo AB-S00S com o toggle **Arquivos**. O servidor MCP roda fora do
sandbox do Codex, então até um Codex em `workspace-write` grava por ele.

```
Downloads/Projetos/
  2026-10-16-proposta-cliente-x/
    proposta.md        ← files_write
    proposta-2.md      ← mesmo nome de novo: nunca sobrescreve
    custos.csv
    proposta.pdf       ← files_build, depois de aprovar a proposta
```

## Onde fica

| Sistema | Pasta base |
|---|---|
| macOS | `~/Downloads/Projetos` |
| Windows | Pasta Downloads real, lida do registro (`User Shell Folders`, `{374DE290-…}`), mesmo se movida para outro disco, mais `\Projetos`. Sem o valor, `%USERPROFILE%\Downloads\Projetos` |
| Linux | `XDG_DOWNLOAD_DIR` de `~/.config/user-dirs.dirs` (nome traduzido, como `~/Transferências`), mais `/Projetos`. Sem o arquivo, `~/Downloads/Projetos` |
| Qualquer um | `BBRAINX_FILES_ROOT=/caminho/absoluto` troca a pasta |

Um volume de rede é recusado (`FILES_ROOT_REMOTE`); uma pasta sincronizada é aceita. No macOS, Downloads é protegida pela
privacidade do sistema: na primeira gravação, o app que roda o BBrainX (Terminal, VS Code, Claude, Codex) pode pedir
acesso. A recusa vira `FILES_PERMISSION_DENIED`, com o caminho para liberar em Ajustes.

## Regras

- **Necessidade:** `AAAA-MM-DD-nome-curto`. O nome vem em minúsculas ASCII, por exemplo "Proposta Cliente X" vira
  `proposta-cliente-x`. Se o mesmo nome curto já existe com outra data, o trabalho continua na pasta mais recente.
- **Só texto:** `.md .txt .csv .tsv .json .html .xml .yaml .yml .toml .js .ts .py .sql .sh .css .svg .mmd`, em UTF-8, até
  1 MiB por arquivo, até 3 níveis de subpasta, sem nomes ocultos nem `..`.
- **Nunca sobrescreve:** a criação é exclusiva (`O_EXCL|O_NOFOLLOW` + `fsync`). Um nome tomado vira `nome-2`, `nome-3`…
  até `-99`. Um symlink na pasta nunca é seguido; o nome dele conta como tomado.
- **Partes:** a web manda no máximo 256 KiB por requisição, então arquivos maiores vão em partes de até 192 KiB. As
  partes ficam em `<estado>/files-v1/uploads`, nunca na pasta do usuário, e só a última publica o arquivo. Envios
  abandonados por mais de 24 h são apagados.
- **Nada é apagado, executado ou gravado fora da pasta base.** A pasta vem do host, nunca de argumento de ferramenta.

## Entregáveis: PDF, DOCX, XLSX

Uma vez por dia, o BBrainX agrupa as versões do mesmo arquivo (`proposta.md`, `proposta-2.md`…) e **propõe** gerar o
binário da versão mais recente:

| Fonte | Gera |
|---|---|
| `.md` | PDF e DOCX |
| `.txt` | PDF |
| `.csv` (`,` `;` ou tab; `1.234,56` com `;`) | XLSX, com o cabeçalho em negrito e números como números |

- **Aprovação:** só gera com `files_build`, depois de a pessoa aprovar na conversa ou no botão **Gerar** do AB-S00S.
- **Validade da fonte:** se a fonte mudou depois da proposta, a geração é recusada (`FILES_PROPOSAL_STALE`) e a
  próxima análise propõe de novo.
- **Mesma regra de nomes:** um `proposta.pdf` que já existe faz o novo sair como `proposta-2.pdf`.
- **Sem dependências:** os geradores usam só Node (`zlib` para o ZIP do OOXML, PDF 1.4 com fontes padrão).
- **Acentos no PDF:** a codificação WinAnsi cobre os acentos do português. Caracteres fora dela viram `?`, e a resposta
  informa quantos foram trocados.
- **Quando a análise roda:** quando a última tem mais de 24 h, em qualquer `files.*` ou na verificação horária do
  AB-S00S; também na hora, com `bbrainx files propose`. Não instala cron, launchd nem o Agendador de Tarefas.

## Uso

```sh
bbrainx files setup                        # cria a pasta e a registra como projeto de busca "projetos"
bbrainx files open --name "proposta cliente x"
echo "# Proposta" | bbrainx files write --need 2026-10-16-proposta-cliente-x --path proposta.md
bbrainx files list [--need …] | read --need … --path …
bbrainx files propose                      # analisa agora e lista as propostas
bbrainx files build --proposal ID [--formats pdf,docx]
bbrainx search --project projetos --query "…"   # busca em tudo o que foi gravado
```

**Servidor MCP:** `bbrainx mcp --project ID --files` (ou `BBRAINX_FILES=1`) expõe `files_open`, `files_write`,
`files_list`, `files_read`, `files_proposals`, `files_build` e `files_dismiss`, e acrescenta às instruções: gravar
entregáveis na pasta da necessidade, nunca em `/tmp`, e mostrar o conteúdo também na conversa. `--no-files` vence o
ambiente. `integrate --apply` grava `--files` nas configs quando a pasta base já existe (depois de `files setup`) ou
com `--files`.

**PDF, DOCX e XLSX também entram na busca** (2.4.0), de qualquer projeto. O texto é extraído na indexação: PDF pelo PDFKit do próprio macOS (fora dele, pelo extrator simples do BBrainX), DOCX e XLSX de dentro do próprio arquivo. Nada é gravado ao lado dos documentos. A verificação de frescor compara os bytes do arquivo, sem extrair. Documento sem texto (PDF escaneado), ilegível ou com credencial entra só com o hash, sem nenhum trecho, e aparece em `documentsWithoutText` com o motivo. `context_read` lê o texto extraído. Até 20 MiB por arquivo e 1 MiB de texto.

**Busca:** a pasta base é **um** projeto (`projetos`), porque o registro recusa projetos aninhados. Cada `files_write`
atualiza o índice desse projeto, então `context_search` com `project: "projetos"` encontra o arquivo logo depois de
gravado.

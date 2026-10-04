# Modelo de segurança — prévia 0.4

## Fronteira de confiança

BBrainX é uma aplicação local por usuário do sistema operacional. Não é um serviço multi-tenant, não contém login remoto, criptografia própria do banco ou política corporativa de identidade. Outro processo malicioso rodando com o mesmo usuário pode ler arquivos autorizados ao usuário. Esse risco não é resolvido por CSRF, MCP ou um prompt de segurança.

## Controles implementados

- Servidor HTTP preso em `127.0.0.1`, Host exato, validação de Origin/Sec-Fetch-Site, CSP e token CSRF para mutações. Nenhum CORS global permissivo.
- MCP stdio com projeto fixado no host. A entrada da ferramenta não altera a allowlist, não registra raízes e não aprova memórias.
- Nenhuma ferramenta de shell, browser, desktop, implantação ou execução de código externo.
- Indexação textual limitada; rejeição de traversal, symlinks e alguns padrões de segredo. Arquivos executáveis são lidos como texto, nunca executados.
- Fontes selecionadas verificadas por hash antes de compilar contexto. Trecho de arquivo alterado nunca é servido: o arquivo é relido e reindexado antes (ou, no modo estrito, o pacote é recusado). Arquivo que passou a casar com um padrão de segredo sai do índice.
- Tetos de indexação e política de arquivo alterado vêm de quem inicia o processo (variáveis de ambiente ou chamada local). Argumento de ferramenta não os muda.
- No checkpoint, o que o agente declara (feito, decisões, evidências) fica separado do que o host observa (snapshot do índice, commit e ramo do Git). O agente não consegue enviar os campos do host. O Git é consultado só com `rev-parse` e `ls-files`: `git status` e `git diff` executariam filtros `clean` configurados no próprio repositório.
- Checkpoints em transação com histórico, idempotência e outbox. Escrita antiga não é silenciosamente promovida.
- Memória candidata separada de aprovação humana. Estado aprovado/revogado versionado.
- SQLite em pasta privada e arquivo com modo 0600 em sistemas POSIX. O sistema operacional e a criptografia de disco, quando configurada, são responsáveis pela proteção física.

## Servidor MCP próprio (desde a 0.4)

- Só a superfície de ferramentas: sem recursos, prompts, amostragem ou execução. O processo atende um único projeto, fixado por quem o iniciou.
- Uma linha de entrada acima de 1 MiB encerra o servidor com erro; requisição cancelada não recebe mais nenhuma mensagem; chamada já cancelada não começa a executar.
- Mais de 300 chamadas de ferramenta por minuto são recusadas com `RATE_LIMITED`. É um freio contra um agente em laço, não um controle de acesso.
- Erro inesperado chega ao cliente como `EXECUTION_FAILED`, sem a mensagem interna. O rastro opcional (`BBRAINX_TRACE=1`) registra capacidade, duração e código; nunca argumentos nem resultados.
- O prazo de uma chamada não interrompe trabalho síncrono. Durante uma indexação longa o servidor não lê a entrada.

## Perfil Laya

- Nada é baixado sem o comando `laya install`. O pacote vem do PyPI com versões fixadas; os pesos, do Hugging Face numa revisão fixada, conferidos por SHA-256 antes de serem usados e de novo a cada carga dos dois arquivos grandes.
- O formato dos pesos é `safetensors` (sem execução de código na carga). O processo roda com a rede do Hugging Face desligada e não recebe caminho de arquivo nem acesso ao banco.
- O que o BBrainX envia ao modelo é texto do seu repositório. Ele fica na sua máquina, mas passa a existir na memória de um segundo processo.
- O resultado do modelo não altera o pacote de contexto nesta versão. Confiança do modelo não é autorização para nada.
- Instalar pacotes Python executa código de terceiros no seu usuário, dentro de um ambiente isolado. É uma decisão sua, e é por isso que o núcleo não depende dela.

## Limites importantes

**Segredos:** nomes e padrões não detectam todos os segredos. Revise as raízes e exclua fontes sensíveis antes de indexar. O conteúdo fica local, mas um harness pode enviá-lo ao provedor escolhido por você. A origem local do BBrainX não torna o restante do pipeline local.

**Prompt injection:** documentos e comentários são evidência não confiável. O pacote os identifica como dados. A proteção forte é não conceder ao serviço de memória operações privilegiadas. Uma delimitação textual sozinha não prova imunidade a injection no harness executor.

**TOCTOU:** a verificação de arquivos reduz erro de fonte obsoleta, mas não fornece uma snapshot atômica de todo o filesystem. Uma mudança concorrente após leitura pode exigir nova verificação antes de edição pelo agente. Não tratar o hash como lock de arquivos.

**Indexação:** sem daemon watcher. Uma pesquisa pode não refletir um novo arquivo até reindexar. A snapshot representa arquivos textuais elegíveis. Índices derivados não são a fonte exclusiva de verdade.

**Declaração não é prova:** `done` e `evidence` de um checkpoint registram o que o agente afirma. Nenhum teste é reexecutado pelo serviço. Por isso o estado final continua sendo `review_needed`, nunca concluído.

**Cópia da migração:** `brain.v1-backup.sqlite` contém tudo o que o banco continha, inclusive os trechos indexados. Fica na mesma pasta privada e deve ser apagada quando o retorno à 0.2 não for mais necessário.

**Retenção:** revogar memória remove sua elegibilidade em novas recuperações, não executa apagamento físico garantido de páginas SQLite, WAL, históricos, outputs já exportados ou backups. Eventos evitam armazenar corpos completos de prompts, mas contêm identificadores de projeto e tarefa. Proteja os backups.

**Concorrência:** SQLite atende processos no mesmo host, não múltiplos hosts escrevendo em arquivo compartilhado. O journal é durável; não existe promessa de publicação distribuída exactly-once.

**Dependências:** npm instala a árvore lockada sem lifecycle scripts. Isso reduz uma superfície, não prova que o código das dependências é seguro. A auditoria é um sinal datado, não certificação. Atualizações exigem novo teste.

**Mídia:** Remotion é opcional. Seu navegador headless não é montado como executor geral de agentes. Não aceitar composições arbitrárias do usuário por HTTP.

## Threat cases e regressões

| Caso | Controle/teste |
|---|---|
| Agente pede projeto não autorizado | Regra de acesso do motor + teste MCP com escopo diferente |
| DNS rebinding / site externo | Host literal, Origin, Fetch Metadata e CSRF |
| Caminho sai da raiz | `readSafe` valida caminho relativo e componentes |
| Symlink aponta para home | Recusa sem seguir o destino |
| Arquivo indexado mudou | Relido antes de servir; `STALE_INDEX` no modo estrito |
| Agente forja estado do Git ou campo extra no checkpoint | Campos do host são carimbados pelo serviço; campo desconhecido é recusado |
| Migração de schema corrompe estado | Cópia íntegra antes, troca numa transação, versão desconhecida é recusada |
| Duas gravações da mesma versão | CAS + transação SQLite |
| Retry repete efeito | Idempotency key e fingerprint |
| Agente transforma hipótese em política | Só proposta via MCP; aprovação CLI humana |
| Pacote excede orçamento | Erro para obrigatório, seleção para evidências opcionais |
| Pipeline afirma teste inexistente | Não existe status `done` verificado nesta versão |

## Reportar vulnerabilidade

Use GitHub Private Vulnerability Reporting quando habilitado no repositório. Caso não esteja habilitado, abra uma issue pedindo um canal privado **sem descrever a exploração nem incluir dados sensíveis**. O projeto não promete prazo de resposta de segurança antes de haver manutenção e triagem estabelecidas.

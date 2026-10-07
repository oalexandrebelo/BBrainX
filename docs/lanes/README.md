# BBrainX Lanes — features paralelas, memória comum

**Candidato de 7/10/2026.** Base: PR #10 em `9e8424cbc95e2d80cdab25c970bdd216aba3f720`. Esta extensão se apoia nas correções de integridade daquele PR. Não incorpora automaticamente Atlas (#6), MEDIUM/replay (#8), Observatory (#9) ou o laboratório WitnessCache. A main observada permanece `a9636e9`. A execução de CI do commit, não esta frase, determina a validação da versão.

## O problema resolvido

A raiz de código do projeto e seu índice não podem representar simultaneamente duas worktrees divergentes. Esta extensão introduz **lanes**: frentes de trabalho explicitamente vinculadas a worktrees Git diferentes do mesmo repositório. Cada lane tem seu índice, snapshot, checkpoints e idempotência em banco local separado. A memória aprovada continua em uma única autoridade do projeto.

Claude Code trabalha na lane `feature-a`; Codex trabalha na lane `feature-b`. Ambos consultam o mesmo `project_id`, mas não sobrescrevem o índice ou checkpoint da outra lane. O host escolhe a vinculação no startup; argumento de ferramenta não pode trocar de lane. No modo de conexão existente sem lane, o comportamento permanece o do projeto original.

**Não é sandbox do sistema operacional.** Worktrees compartilham o Git comum e processos sob o mesmo usuário podem acessar outros arquivos/portas. O MCP não intercepta o shell nativo do harness. Para código não confiável, use um runtime com limites e isolamento efetivos; os perfis de VM/OCI/Kubernetes são propostas documentadas, não instalados por este comando.

## Instalar o candidato sem substituir a pasta em uso

```sh
git fetch origin
git worktree add ../BBrainX-lanes origin/feat/parallel-workspace-lanes
cd ../BBrainX-lanes
npm ci --ignore-scripts
npm test
npm run build
```

Use o Node suportado pelo projeto. A primeira leitura local dos testes de domínio pode funcionar em outras versões, mas isso não redefine o requisito de distribuição. Não há nova dependência npm de produção ou peso de modelo nesta extensão.

## Preparar um projeto e duas features

Exemplo: `meu-app` é o checkout principal do seu produto, **não** o checkout do BBrainX. Escolha nomes novos para as branches e diretórios. Revise o estado do Git antes de criar worktrees. Os comandos são executados pelo host, não por uma ferramenta MCP exposta ao modelo.

```sh
# Executar na raiz de meu-app; as pastas resultantes são irmãs, não aninhadas.
git worktree add -b feat/bbrainx-a ../meu-app-feature-a HEAD
git worktree add -b feat/bbrainx-b ../meu-app-feature-b HEAD
```

No checkout do BBrainX candidato:

```sh
node bin/bbrainx.mjs up --project meu-app --root /caminho/absoluto/meu-app

node scripts/lanes.mjs register --project meu-app --lane feature-a \
  --workspace /caminho/absoluto/meu-app-feature-a

node scripts/lanes.mjs register --project meu-app --lane feature-b \
  --workspace /caminho/absoluto/meu-app-feature-b

node scripts/lanes.mjs list --project meu-app
```

Os três comandos devem usar o mesmo `BBRAINX_HOME`, em armazenamento local, nunca um banco WAL vivo sincronizado por iCloud/NFS. O registro exige a mesma identidade de diretório Git comum observada por `rev-parse`; um clone independente não é aceito automaticamente, mesmo que sua URL de origem coincida.

O padrão admite duas lanes ativas no registro. `register --capacity N` permite ao host escolher 1..16; esse limite de cadastro **não** impõe quota RSS/CPU, não é semáforo global de modelos e não impede vários processos conectados à mesma lane. A configuração MEDIUM do outro PR não passa a governar todo o runtime por causa deste limite.

## Conectar os harnesses

```sh
node scripts/lanes.mjs config --project meu-app --lane feature-a --client claude
node scripts/lanes.mjs config --project meu-app --lane feature-b --client codex
```

A saída é um relatório JSON com `destination`, `workspace` e `fragment`. **Mescle apenas o conteúdo de `fragment`** na configuração indicada dentro daquela worktree. Para Codex, o fragmento é texto TOML; não cole o wrapper JSON no arquivo TOML. Preserve entradas vizinhas, credenciais, trust e aprovação de ferramentas.

Abra Claude Code na worktree A e Codex na B. Recarregue as conexões e faça uma chamada real. Em ambos: indexar a própria lane, buscar um marcador exclusivo de seu código e recuperar/gravar um checkpoint com `expectedVersion`. Verifique que o `data.workspace.lane` e a raiz correspondem ao editor.

A extensão conserva as seis ferramentas existentes. `data.workspace` identifica o contexto host-owned nas respostas bem-sucedidas; o pacote textual também registra lane, epoch, raiz e revisão das memórias aprovadas, incluídos no orçamento. Não há ferramenta de shell, criação de worktrees ou aprovação de memória.

### Formatos emitidos — não certificações de clientes

| Target | Destino por workspace | Forma |
|---|---|---|
| `codex` | `.codex/config.toml` | `mcp_servers` TOML |
| `claude` | `.mcp.json` | `mcpServers` |
| `cursor` | `.cursor/mcp.json` | `mcpServers` |
| `vscode` | `.vscode/mcp.json` | `servers`, `type:stdio` |
| `gemini` | `.gemini/settings.json` | `mcpServers` |
| `antigravity-cli` | `.agents/mcp_config.json` | `mcpServers` |
| `opencode-v1` | `opencode.json` | `mcp.<nome>` |
| `opencode-v2` | `opencode.json` | `mcp.servers.<nome>` |
| `generic` | específico do cliente | `command/args/env` |

A diferença v1/v2 de OpenCode é intencional. Nove targets não são nove produtos homologados. O plugin Codex no VS Code tem configuração distinta do cliente MCP próprio do VS Code. O adapter Antigravity acima é do CLI documentado, não uma afirmação sobre todos os formatos do IDE/Web/Desktop.

O processo efetivo é:

```text
/abs/node /abs/BBrainX/scripts/lanes.mjs mcp --project meu-app --lane feature-a
BBRAINX_HOME=/abs/estado
```

Clientes que não podem iniciar stdio no host não ganham acesso remoto automaticamente. Use exportação explícita de contexto/checkpoint ou um adapter remoto futuro com autenticação. Não abra uma porta pública para o banco ou para um servidor stdio por meio de um túnel genérico.

## Memória comum e aprovação

Uma proposta originada na lane A é gravada na autoridade principal e continua `proposed`. Só entra nos pacotes de A e B depois da aprovação humana no CLI padrão do BBrainX, com o mesmo `BBRAINX_HOME`:

```sh
node bin/bbrainx.mjs memory --project meu-app
node bin/bbrainx.mjs approve --project meu-app --id ID --version 1
```

Revogar impede que uma operação nova inclua essa memória. Se ela mudar entre a captura e a publicação de um pacote, a operação falha com `SHARED_MEMORY_CHANGED`. Refaça a compilação com estado atual; não reutilize o texto recusado. Isso não recolhe pacotes já entregues.

Fato específico de uma feature pertence ao checkpoint dessa lane. Não aprove como política global algo que só é válido numa branch. A origem declarada é proveniência fornecida, não uma execução verificada de teste.

O checkpoint é identificado por `(project,lane,task)` no conjunto de bancos. A mesma chave de idempotência em A e B não gera conflito entre features. Dentro de uma lane, CAS e idempotência continuam obrigatórios. Para outra ferramenta retomar a mesma feature, conecte-a à **mesma lane**, de preferência após pausar o primeiro editor.

## Portas: servidor cooperativo que conserva seu socket

```sh
node examples/lane-web.mjs meu-app feature-a
node examples/lane-web.mjs meu-app feature-b
```

Execute em terminais diferentes no checkout BBrainX. Cada processo imprime uma URL real `http://127.0.0.1:<porta>`. `startLaneHttpServer` pede `port:0`; o sistema operacional escolhe e abre a porta **no servidor que a utilizará**. Não há sondagem de porta, fechamento e tentativa de reabertura sujeita a corrida.

O SDK é para integrar um servidor Node cooperativo. Não altera Vite, Next.js, Python ou processos iniciados à parte. Esses servidores precisam aceitar porta dinâmica em seu próprio contrato ou rodar em namespace/container/VM separado. Um env `PORT` ignorado pela aplicação não resolve colisões.

O encerramento fecha só o listener e os sockets mantidos por aquele objeto. Não executa `killall`, não mata por porta e não usa PID persistido como autoridade para sinalizar. O exemplo trata SIGINT/SIGTERM; os testes também exercitam desconexão IPC de filhos. O SDK não contém descendentes criados por handler arbitrário nem faz limpeza total de um shell.

## Encerrar uma frente

Primeiro pare seus serviços pelos handles de execução ou terminais que os iniciaram. Então:

```sh
node scripts/lanes.mjs close --project meu-app --lane feature-a
```

Isso revoga o registro; não apaga worktree, branch, arquivos, banco ou commits. Uma conexão MCP já aberta recusa novas chamadas. Serviços ainda observados impedem afirmar fechamento completo.

Se o processo morrer sem executar seu cleanup, seu registro pode permanecer `starting/listening`. Nesta primeira versão, não há coleta automática de processos órfãos nem comando que reaproveita o serviço por PID. O estado é conservador: `SERVICE_OUTCOME_UNKNOWN_OR_ACTIVE`. A reconciliação administrativa com prova de ownership é uma evolução pendente, não um pretexto para matar processos desconhecidos. Não edite o banco para mascarar um serviço cuja execução não foi investigada.

## Validação antes do lançamento

A CI deve executar `scripts/lanes-evidence.mjs`, os negativos em worktree isolada e a suíte geral. Os testes usam Git worktrees, SQLite, clientes MCP oficiais, processos e listeners reais, com conteúdo gerado de teste. Não iniciam Claude/Codex autenticados, Laya, containers ou Kubernetes.

Esta rodada não comprova 99% de acerto, economia financeira, ausência de toda race condition ou desempenho numa estação MEDIUM com IDEs/modelos concorrentes. Compare `validation.json`, logs, revisão e limites antes de promover uma alegação.

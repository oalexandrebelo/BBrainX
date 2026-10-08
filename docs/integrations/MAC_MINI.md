# Operação atual no Mac mini — 08/10/2026

Runtime instalado: `f48cdccea3bd856ea7364d06376c56da920c02ac`, Node 24.21.0.
Laya e SDD foram adicionados sem migrar os bancos dos projetos. A revisão anterior
`a21f42c` e a intermediária `971390a` permanecem disponíveis para rollback.
Esta revisão substitui a aplicação inicial descrita em `docs/MAC_MINI_HARNESSES.md`.
O estado existente foi preservado. Releases anteriores continuam disponíveis para rollback.
Evidência atual sanitizada: [laya-sdd-mac-mini-2026-10-08.json](laya-sdd-mac-mini-2026-10-08.json).
A [evidência de integração anterior](mac-mini-2026-10-08.json) identifica o runtime a21f42c.

O launcher `~/.local/bin/bbrainx` usa Node absoluto e exporta `BBRAINX_HOME`,
`BBRAINX_ENTRY` e `BBRAINX_NODE`. O estado fica em
`~/Library/Application Support/BBrainX/state`; a seleção de runtime é
`~/Library/Application Support/BBrainX/app/current`. Não substituir o Node global.

## Laya e SDD aplicados

A CLI instalada comprovou avaliação sem criar arquivo, criação de rascunho em
projeto temporário e repetição sem alteração dos bytes. Um cliente SDK MCP real
usou o entrypoint instalado com `--laya --sdd`: catálogo de oito ferramentas,
avaliação do BBrainX, recusa de outro projeto registrado antes de criar arquivo e
inferência Laya real no dispositivo MPS. Os sete controles passaram. O perfil
local usa Python 3.12.14 e Laya 0.3.26 com revisão de pesos fixada; não houve
fine-tuning nem chamada paga a provedor.

No navegador nativo, o painel instalado executou uma decisão Laya e avaliou o
SDD do BBrainX. A feature `docs:sdd-alignment` obteve 100/100 em cobertura
**documental**; `semanticQuality` continua `not_assessed`. Isso não dá nota de
qualidade ao produto inteiro nem atesta semântica, segurança ou testes aprovados.
Nenhum SDD dos outros três projetos foi criado ou alterado nesta implantação.

A validação local do código SDD passou 451 testes em cada Node (24.21 e 22.20),
build e 33 E2E. A [CI do código f48cdcc](https://github.com/oalexandrebelo/BBrainX/actions/runs/37740626008)
passou os nove jobs de validação. O commit posterior de continuidade altera
somente documentos; conferir a ponta da PR #17 para sua própria CI.

```sh
bbrainx sdd --project bbrainx --mode assess
bbrainx sdd --project ID
bbrainx serve --laya
```

O segundo comando cria `SDD.md` apenas quando a inspeção é completa e nenhum
artefato SDD reconhecido existe; o resultado é um rascunho para revisão.
O painel em execução foi iniciado com `serve --laya`. Para MCP, acrescente
`--sdd` e/ou `--laya` aos argumentos do servidor **já vinculado ao projeto**,
preservando `--project`, workspace/lane e home. O catálogo padrão continua com
seis ferramentas. A comprovação SDK não significa que todos os clientes nativos
reconectaram ou usaram essas capacidades por modelo. Não habilitar todos os
workers locais automaticamente: cada processo tem seu próprio modelo/cache.

Consulte os contratos [SDD](SDD.md) e [Laya](LAYA.md). Laya oferece decisão fechada
opt-in com abstenção e cache exato; o benchmark não justifica substituir o ranking
lexical do contexto, nem demonstrou superioridade sobre JEV. A operação offline
do worker não constitui sandbox de rede do sistema operacional.

## Evidência histórica de integração — runtime a21f42c

| Superfície | Resultado | Limite |
| --- | --- | --- |
| Codex CLI/app-server e backend VS Code | Configuração de projeto, seis ferramentas, título e ícone BBrainX, verificados no runtime a21f42c | Nenhuma thread ou inferência iniciada; runtimeStatus nulo |
| Claude e Kilo | Configuração por projeto e conexões reais no registro de atividade | Uso da ferramenta por modelo não foi exercitado |
| Extensão BBrainX 0.1.1 no VS Code | Ícone BX transparente próprio, barra de status, raiz detectada e comando de detecção observados | Configuração detectada não equivale a conexão MCP |
| Extensão BBrainX no Antigravity | VSIX instalado e recibo real de workspace emitido | Activity Bar não foi verificada separadamente |
| MCP Antigravity | Entrada global BBrainX retirada com backup; sete outros servidores preservados | Falta comprovar configuração e identidade da chamada por workspace |
| Kilo usando OmniRoute | Integração MCP BBrainX pronta | Falta Base URL e modelo/combo; credenciais e gateway preservados |

Quatro projetos registrados separadamente: `bbrainx`, `omniway-its`, `donefitt`,
`ab-gestor`. As três raízes externas foram identificadas por metadados locais e
pelas instruções dos próprios repositórios. Foram aplicados somente arquivos de
integração; nenhum código desses produtos foi editado ou comitado. Trust e
aprovação existentes foram preservados; só `release-audit` tinha confiança
explicitamente concedida nesta operação. As novas configurações continuam
sujeitas às decisões nativas de confiança/aprovação de cada cliente.

Os testes reais de isolamento fizeram quatro leituras no próprio projeto e doze
tentativas entre projetos, todas recusadas com `FORBIDDEN`. Dois clientes MCP
leram o mesmo checkpoint BBrainX; um processo iniciado no cwd errado foi recusado.
O runner instalado gravou uma execução com 14 testes aprovados, zero falhas e a
revisão `a21f42c`. O painel foi inspecionado com os quatro projetos disponíveis,
sem mistura de dados ao selecionar um deles. Custos sem recibos aparecem como
desconhecidos; orçamento é acompanhamento, sem controle sobre chamadas externas.

O upgrade de portabilidade encerrou os processos BBrainX anteriores, reiniciou o
painel e recarregou a janela `release-audit` no VS Code. Clientes nativos reconectam
pelas configurações existentes; uma configuração presente não prova atividade.
As provas de cinco controles MCP, dezesseis acessos próprios/cruzados e os dois
backends Codex foram repetidas no runtime a21f42c, sem chamadas de modelo.

O painel local está em `http://127.0.0.1:4317`, agora iniciado explicitamente com
`bbrainx serve --laya`. Não foi instalado daemon de inicialização. Se o processo encerrar,
execute novamente o comando ou **BBrainX: Iniciar painel local** no editor.

## Por que o MCP global Antigravity foi retirado

O cliente detectou e conectou seis ferramentas no workspace BBrainX, mas isso não
prova que uma instância global não será reutilizada por uma conversa de outro
projeto. A guarda de cwd só autentica o início do processo. Depois do registro de
quatro projetos, mantê-la global seria uma afirmação de isolamento sem evidência.
A configuração foi retirada e seu processo encerrado; o histórico da conexão
pode aparecer até expirar a janela de presença de 90 segundos. Não reintroduzir
uma lista global de todos os projetos para contornar esse limite.

Próxima etapa: comprovar na versão nativa um mecanismo de configuração por
workspace e identidade estável por conexão, incluindo teste negativo ao trocar
de projeto. A extensão pode continuar detectando pastas e abrindo o painel.

## Uso e continuidade

```sh
bbrainx discover
bbrainx integrate --root /raiz/exata --project id
bbrainx integrate --root /raiz/exata --project id --apply
bbrainx control --project id
```

`discover` distingue recibos recentes do editor, registros autorizados e sessões
históricas. Não registrar por semelhança de nome. Para colaboração no mesmo
projeto, os clientes usam `context_bootstrap` com a tarefa, salvam por
`session_checkpoint` e leem por `session_get`; worktrees/lane mantêm estado de
tarefa separado. [Importação histórica](CONTEXT_IMPORT.md) é explícita e não
aprova memória nem importa permissões, hooks ou credenciais.

Os recibos de aplicação, scripts operacionais, logs e backups privados ficam no
diretório local `BBrainX/harness-setup-2026-10-08/` e em
`~/Library/Application Support/BBrainX/setup-backups/`. Não publicar suas cópias
de configuração. Rollback de integração usa `bbrainx integrations rollback --id
RECIBO`, com verificação de alterações posteriores. A migração das antigas
entradas pessoais tem manifesto próprio e exige restauração somente da entrada
BBrainX; nunca sobrescrever o arquivo atual inteiro.

Antes de trocar `app/current`, encerrar os processos BBrainX afetados: processos
já abertos conservam o código carregado. O backup do núcleo SQLite não inclui
automaticamente usage, lanes, control, imports e recibos de instalação. Usar
mecanismos consistentes de backup e verificar a restauração; não copiar SQLite
aberto com `cp`.

Norte dos próximos commits: manter as provas de escopo, estabilizar a integração
nativa Antigravity, ampliar formatos históricos mediante fixtures oficiais,
fechar a cobertura observável de custos e só então retomar EV-05/06/07 sobre
corpora congelados. [OPTIMIZATION_NORTH.md](../engineering/OPTIMIZATION_NORTH.md)
é a regra de retomada, sem promessas de economia, desempenho de modelos ou
prontidão comercial derivadas apenas destes testes locais.

# Operação atual no Mac mini — 08/10/2026

Runtime instalado: `abbdd0d88fb5e53499c787b2f50f1cfb23648b40`, Node 24.21.0.
Esta revisão substitui a aplicação inicial descrita em `docs/MAC_MINI_HARNESSES.md`.
O estado existente foi preservado. Releases anteriores continuam disponíveis para rollback.
Evidência sanitizada: [mac-mini-2026-10-08.json](mac-mini-2026-10-08.json).

O launcher `~/.local/bin/bbrainx` usa Node absoluto e exporta `BBRAINX_HOME`,
`BBRAINX_ENTRY` e `BBRAINX_NODE`. O estado fica em
`~/Library/Application Support/BBrainX/state`; a seleção de runtime é
`~/Library/Application Support/BBrainX/app/current`. Não substituir o Node global.

## Resultado observado

| Superfície | Resultado | Limite |
| --- | --- | --- |
| Codex CLI/app-server e backend VS Code | Configuração de projeto, seis ferramentas, título e ícone BBrainX | Prova nativa anterior à correção somente visual; nenhuma thread ou inferência iniciada; runtimeStatus nulo |
| Claude e Kilo | Configuração por projeto e conexões reais no registro de atividade | Uso da ferramenta por modelo não foi exercitado |
| Extensão BBrainX no VS Code | Ícone próprio, barra de status, raiz detectada e comando de detecção observados | Configuração detectada não equivale a conexão MCP |
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
revisão `abbdd0d`. O painel foi inspecionado com os quatro projetos disponíveis,
sem mistura de dados ao selecionar um deles. Custos sem recibos aparecem como
desconhecidos; orçamento é acompanhamento, sem controle sobre chamadas externas.

O painel local está em `http://127.0.0.1:4317`, iniciado explicitamente com
`bbrainx serve`. Não foi instalado daemon de inicialização. Se o processo encerrar,
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

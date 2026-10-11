# Painel V2 — continuidade incremental, 11/10/2026

## Checkpoint 1: identidade e falhas conhecidas

Base remota conferida: `c81389d4129b83bee8ee601a5a1a203d7e053623`, árvore `5cf27ff90c692a565e821af0de0817923894aee7`, branch `feat/v2-panel-stage2`. Este commit documenta a retomada; não aprova o candidato nem altera a versão 1.5.0.

A fonte foi recuperada de `BBrainX-Stage2-Recovered-Candidate-CI.zip`. O artefato Linux registra 769 testes aprovados. O artefato macOS registra 768/769: o CLI copiado para o diretório temporário encerra sem JSON porque a comparação do entrypoint não resolve o alias de diretório. O artefato Windows contém uma execução interrompida durante os casos do painel e não contém resumo final. Nenhuma contagem histórica equivale à CI desta revisão.

## Ordem de entrega

1. Recuperar e identificar a base, mantendo falhas registradas.
2. Corrigir a resolução do entrypoint e a espera pelo fechamento; executar testes antes do commit de código.
3. Endurecer e testar a exportação offline somente leitura; preservar unknown e isolamento de projeto.
4. Reexecutar a combinação, build, navegador e empacotamento. Atualizar PR e fornecer ZIP com patch e evidências. Ativação nativa de VS Code/Antigravity e Mac físico continuam gates separados.

Cada bloco deve terminar em commit remoto verificado. Nada entra diretamente em main. Não alterar credentials, trust, TLS, gateways, versão pública ou schema para encerrar a rodada.

## Pesquisa separada do runtime

`ipenywis/laya-ultrafast` já existe; não será apresentado como criação inédita nossa. Seu README descreve um port do agente de navegador Jev, com decisões MLX locais e planejamento por modelo de texto. Decisão local não torna o planner remoto privado nem equivale a memória compartilhada entre harnesses. Fonte: https://github.com/ipenywis/laya-ultrafast (revisão anteriormente consultada `571431b7d142d54f49ad962d9d083d9b7bb20040`).

O código Fastlane proposto na tentativa anterior não gerou commit: a escrita foi bloqueada pela ferramenta. Essa pendência não será reenviada por outro caminho nesta retomada. Estudos de Jev, Laya e ECC permanecem separados do fechamento do painel. Não há novo modelo instalado, chamada paga ou economia de tokens medida aqui.

## Próxima ação concreta

Inspecionar `src/main-module.mjs`, `scripts/panel.mjs`, `src/panel/lifecycle.mjs`, testes de painel e CI. Corrigir apenas os defeitos reproduzidos. Guardar logs antes/depois; publicar código e novos testes no próximo checkpoint. Não marcar uma etapa aprovada por número de testes sem conferir a revisão executada.

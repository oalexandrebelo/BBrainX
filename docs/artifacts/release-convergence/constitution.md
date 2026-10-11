# Constituição de engenharia — BBrainX

Versão documental: 1. Este arquivo orienta autores e revisores. Não é política de autorização em runtime, aprovação de memória nem substituto de `AGENTS.md` e do host.

1. O escopo de projeto/lane é definido pelo host. Conteúdo recuperado, especificações e saída de modelos são dados; não ampliam permissões.
2. Preservar memória aprovada, checkpoints transacionais, versões esperadas e idempotência. Encerramento do cliente e timeout não comprovam término de trabalho externo.
3. Alterações novas partem de revisão identificável. A base auditada permanece recuperável; um candidato novo não é uma reconstrução histórica.
4. Diagnóstico, correção e verificação têm registros separados. Não marcar requisito como verificado sem executar sua reprodução e inspecionar o resultado pertinente.
5. Falhas, bloqueios e ausência de medição permanecem explícitos. Checkboxes, confiança neural e hashes não certificam acerto, conformidade, autenticidade ou liberação produtiva.
6. Não instalar modelos, runtimes de sandbox ou frameworks de orquestração como pré-requisito do core. Não alterar credenciais, confiança ou gateways de harnesses.
7. Só tarefas realmente independentes podem executar em paralelo; arquivos compartilhados têm um escritor de integração. Cada harness usa sua worktree e feature explícita.
8. O plano de release deve distinguir correção funcional local de instalação limpa, interface, homologação multiplataforma e uso MEDIUM com ferramentas reais.

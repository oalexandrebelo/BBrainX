# Plano e execução verificável

Este arquivo descreve o método. A aprovação depende dos logs e do relatório do commit na CI; não antecipar que todos os testes passaram. O alvo é concorrência de trabalho cooperativo, não um certificado de sandbox hostil.

## Suíte nova

`test/lanes-host.test.mjs` cria repositórios reais, commits e worktrees em diretórios temporários. Usa SQLite, filesystem, sockets e processos filhos reais. Verifica binding, raiz indevida, capacidade, idempotência, recusa de schema desconhecido, isolamento de índices/checkpoints, compartilhamento de propostas/aprovações e conflito de revisão.

`test/lanes-mcp.test.mjs` inicia dois clientes do SDK oficial e dois servidores reais de lane por stdio. Ambos ficam vivos simultaneamente, indexam textos divergentes no mesmo caminho relativo, usam o mesmo ID de projeto e preservam a mesma memória aprovada. Os checkpoints usam mesmo task ID e chave para comprovar que a lane faz parte do escopo persistente. Também cobre retomada em nova conexão, recusa de retarget por argumentos, lane fechada, limites obrigatórios e atualização de arquivo.

Um teste de port allocation precisa abrir simultaneamente os listeners. Não basta testar uma função que devolve inteiros diferentes. Os testes de serviço comprovam resposta de A e B, encerramento de A sem perda de B, rejeição de Host/Origin indevidos, encerramento de sockets próprios e proteção contra release de geração antiga. O teste multiprocesso encerra um filho por comando IPC e outro por desconexão; não afirma suportar todos os métodos de daemonização.

Não há mock de resposta de modelo. Os dados são corpus/valores de teste, explicitamente não métricas de usuário. Clientes oficiais MCP são implementações reais de protocolo, não versões autenticadas do produto Claude Code ou Codex. Se um campo não foi observado, o relatório continua sem alegação de certificado.

## Comandos

```sh
node --test --test-reporter=tap test/lanes-host.test.mjs test/lanes-mcp.test.mjs
node scripts/lanes-evidence.mjs
npm test
npm run build
```

Os testes gerais incluem as correções herdadas do PR #10. Não some testes repetidos entre jobs ou plataformas como se fossem novos casos distintos. Nenhum teste pulado, cancelado ou zero casos conta como aprovado no coletor dedicado.

Em worktree isolada e limpa:

```sh
node scripts/lanes-negative.mjs
```

Três falhas são injetadas em cópias do código e devem gerar assertions: ler memórias do banco da lane em vez da autoridade; ignorar a revisão de memória na publicação; permitir retarget do projeto por argumento. O script restaura o arquivo; nunca executar sobre alterações do usuário em andamento.

## Testes ainda necessários para aceitação pública

Duas sessões de harness reais com autenticação preservada e tarefas distintas; várias versões de Codex/Claude/Antigravity; runner nativo MEDIUM com IDEs/browsers abertos; estado térmico e suspensão do Mac; limites combinados de processos/modelos; serviços que tentam daemonizar; migrações de aplicação; rede isolada em VM/OCI; queda do host entre etapas do cleanup; recuperação administrativa de registros pendentes.

O SDK de serviço atual tem fronteira menor: listener HTTP cooperativo. Seu teste de encerramento não prova remoção de todo descendente ou contenção de malware. Teste de lock SQLite não prova isolamento entre usuários do SO. Git worktrees compartilham metadados comuns; uma feature maliciosa exige sandbox externo.

## Histórico e relatórios

O coletor escreve revisão, ambiente, lista de verificações e limitações em `artifacts/lanes/validation.json`. O pacote contém source ZIP, diff incremental contra o PR #10, documentos, logs e hashes. O relatório não inclui bancos privados, credenciais ou transcripts. O metadata de uma ferramenta não comprova tarefa aceita, consumo de API ou economia financeira.

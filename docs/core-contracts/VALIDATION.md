# Verificação da integridade de contratos

**A aprovação desta branch depende dos resultados do commit na CI.** Este arquivo descreve método e reprodução, não antecipa que a execução passou. Evidências antigas ou de outras branches não se somam automaticamente.

## Reproduzir

```sh
git fetch origin
git worktree add ../BBrainX-contracts origin/fix/core-contract-integrity
cd ../BBrainX-contracts
npm ci --ignore-scripts
npm test
npm run build
node scripts/contracts-evidence.mjs
```

Use Node suportado pelo projeto. A suíte específica usa Zod real, BrainStore/SQLite reais, filesystem temporário e operações assíncronas controladas. Não chama provedores nem carrega um modelo. Promessas bloqueadas são estímulos do protocolo para reproduzir falhas; não substituem um backend de produção e não são benchmark de inferência.

## Casos novos

Prazo durante autorização; prazo durante validação assíncrona; cancelamento durante acesso; cancelamento anterior; esgotamento síncrono antes de run; efeito síncrono que termina depois do prazo; validação de saída; rejeição tardia; mutação de principal durante await; mutação pelo access handler; mutação de árvore de schema; isolamento de descritores; metadados do observador; comportamento público/authenticated; decisões/blockers em compactação; recusa quando obrigatórios não cabem; ausência de checkpoint; aviso de snapshot obsoleto; cache de freshness não persistente; memória obrigatória.

Os testes não dependem de conseguir preemptar código síncrono. Eles exigem que a próxima etapa não comece depois de esgotar o prazo e deixam explícito que um efeito anterior pode existir mesmo com TIMEOUT.

## Contraprovas contra o código original

Somente em worktree isolada e limpa:

```sh
node scripts/contracts-negative.mjs
```

O script restaura temporariamente o arquivo original da base e executa o teste pertinente; requer uma falha de assertion, restaura o candidato e verifica a limpeza. Quatro controles: espera de autorização ilimitada, identidade alterada durante await, catálogo mutável e decisões/bloqueios omitidos. Não basta o subprocesso falhar por ausência de dependência ou erro de sintaxe.

## Medição de trabalho evitado

`contracts-evidence` cria um arquivo sintético de 600 linhas, indexa, exige mais de um chunk no conjunto candidato e instrumenta somente suas leituras reais. Compara o payload completo ao compilador original no cenário sem checkpoint afetado. Exige uma leitura do arquivo no candidato e uma por chunk na base.

Bytes lidos e chamadas são trabalho observado da implementação. Não são bytes físicos do SSD, pois o cache do SO pode atender as leituras. Não convertemos a redução em um multiplicador de velocidade ou economia de tokens. A remoção de retokenizações também preserva BPE exato, mas não é uma quantificação de energia da estação.

## Limites e integração

Sem teste de Laya, inferência, benchmark de tarefa aceita ou validação MEDIUM com carga concorrente do usuário. Nenhum teste garante ausência de todos os erros. Os testes de cliente MCP existentes continuam na suíte geral; não são homologação de toda versão de IDE.

Conflitos potenciais: PR #9 altera `src/context.mjs` para medição. Preserve seu cálculo opt-in ao aplicar estas mudanças de obrigatoriedade/freshness; execute ambos os conjuntos de testes. PR #8 modifica startup, perfis e helper de configuração. O Atlas #6 não promove sozinho a maturidade de mecanismos. Nada vai direto à main nesta rodada.

A nova recusa de checkpoints obrigatórios grandes é mudança contratual intencional. Aumentar orçamento ou revisar o checkpoint é uma decisão explícita; cortar a restrição para evitar um erro não é uma correção.

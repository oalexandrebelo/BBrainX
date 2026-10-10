## Problema e comportamento resultante

Descreva o gatilho, o que muda para o usuário e o item de `docs/engineering/ROADMAP.md` relacionado. Informe a revisão-base e a alternativa mais simples considerada.

## Evidência

Informe comandos, revisão testada, resultado e limitações. Para desempenho: corpus/configuração, baseline/candidato, amostras/variabilidade, paridade e tentativas descartadas. Para bug: reprodução anterior e regressão que detecta o defeito.

## Contratos e operação

Explique efeitos sobre escopo, idempotência, concorrência, budgets, formatos e dependências. Schema exige migração e rollback testados. Declare impacto em notices/licenças e o procedimento de retorno à versão anterior.

## Ponto de retomada

Registre decisão, trabalho restante e próxima ação concreta. Atualize o item da fila e o documento vigente quando seu contexto mudar. Evidência sintética não deve ser apresentada como economia de provedor ou tarefa aceita.

- [ ] `npm test` e `npm run build` executados; falhas e testes não executados explicitados.
- [ ] E2E para mudança de UI; revisão independente de invariantes e evidências.
- [ ] Sem segredos, estado privado ou material de terceiros sem direito de distribuição.
- [ ] CI corresponde à árvore entregue; contagens de subconjuntos/laboratórios não foram somadas como testes distintos.

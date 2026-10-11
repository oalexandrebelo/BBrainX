# Evidências do WitnessCache

`validation.json` conserva os valores da execução histórica de 07/10/2026, reformatados em JSON. O campo `githubPublished:false` descreve aquela entrega, não esta PR de consolidação. O arquivo do módulo foi publicado com um newline adicional; a lógica não foi alterada. Os hashes históricos não devem ser reapresentados como hashes dos bytes reformatados.

Logs detalhados e novos relatórios são gerados por `lab/verify.mjs`. A CI consolidada executa uma cópia temporária e guarda-os em `artifacts/consolidated/labs/witness-cache`, com `consolidation.json` indicando data, ambiente e hash realmente executados. Isso evita adulterar o relatório histórico para fazê-lo parecer uma execução atual.

Não há fatura, inferência, teste de tarefa real ou integração automática com o core nessa evidência.

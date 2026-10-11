# Laboratórios independentes preservados

Os estudos e códigos experimentais ficam em [artifacts/](artifacts/README.md), separados do runtime. A política já existente do indexador ignora o componente de caminho `artifacts`; assim um protótipo e seus casos de teste não concorrem com a implementação corrente ao orientar um agente no próprio BBrainX. Os arquivos continuam versionados, legíveis e testáveis explicitamente.

- [WitnessCache: MCP, Meta e reuso verificável](artifacts/witness-cache/README.md).
- [Protocolo X99: consistência e desempenho](artifacts/consistency-protocol/README.md).

Os resultados internos preservam a data e o escopo originais. A CI consolidada executa cópias temporárias e grava novos relatórios em `artifacts/consolidated`, sem editar evidências históricas ou habilitar os experimentos no core. Hipótese de validade de dependências não equivale a autenticação; modelo de protocolo não equivale a um sistema distribuído em produção.

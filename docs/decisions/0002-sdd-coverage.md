# ADR-0002 — Cobertura documental SDD por projeto

Status: aceita para a capacidade local de alinhamento SDD. Data: 08/10/2026.

## Contexto

O BBrainX já guarda decisões de engenharia e evidências versionadas, mas não detecta nem avalia de forma uniforme os artefatos SDD de cada projeto registrado. A solicitação é identificar estruturas existentes, apontar lacunas e oferecer uma base quando o projeto não possui SDD.

O Spec Kit atual documenta constituição por projeto, especificação/plano/tarefas por feature, análise de consistência e uma etapa de convergência entre artefatos e implementação. MetaGPT ilustra a divisão de responsabilidades e produtos de trabalho entre papéis. Nenhuma dessas referências transforma presença de documentos em qualidade semântica comprovada.

## Decisão

Adicionar uma inspeção local por projeto registrado com dois modos explícitos:

- `assess`: somente leitura;
- `ensure`: avalia e cria `SDD.md` como rascunho somente quando não existe artefato SDD reconhecível.

O comando `sdd --project ID` usa `ensure` por padrão; `--mode assess` evita escrita. A API HTTP `sdd.align` aceita o modo e o MCP opt-in `--sdd` registra a ferramenta `sdd_align`. O painel só escreve após uma ação explícita de alinhamento. Abrir, indexar ou descobrir um projeto não cria documentos.

A rubrica `sdd-document-coverage-v1` é versionada e a nota de 0–100 chama-se **cobertura documental**. O resultado declara `semanticQuality: "not_assessed"`; a nota não representa qualidade semântica. As dimensões por feature são `objective`, `requirements`, `architecture`, `acceptance`, `tasks` e `traceability`, cada qual com `covered`, `points` e `max`. Resultados são primeiro por feature; não combinar requisitos de especificações distintas. Mostrar lacunas, evidências, limites de inspeção e versão da rubrica junto à nota. Não usar a nota como indicador de código testado, resultado de teste, conformidade ou aprovação do projeto.

A criação é exclusiva, limitada à raiz canônica autorizada e idempotente. Preservar qualquer arquivo existente e não criar uma segunda estrutura quando houver SDD parcial ou Spec Kit. Se a descoberta estiver incompleta, reportar essa condição e não inferir ausência. Não consultar APIs de harness nem importar históricos de chat; não seguir symlinks nem executar comandos do projeto. A inspeção documental usa uma lista limitada de caminhos e filtros heurísticos para nomes e padrões comuns de credenciais, sem prometer que todo texto sensível será detectado.

## Alternativas consideradas

- Instalar ou chamar o CLI completo do Spec Kit: traz dependências e comportamento fora do escopo; a interoperabilidade necessária é reconhecer seus artefatos e conceitos.
- Incorporar MetaGPT como runtime/orquestrador: adiciona dependências, credenciais e capacidade de executar trabalho; os papéis servem somente como inspiração para separar entregáveis.
- Dar nota semântica automática: não há verdade de referência ou avaliação determinística para declarar qualidade do requisito; a saída seria enganosa.
- Criar sempre um novo `SDD.md`: duplicaria projetos que já têm uma especificação parcial ou seguem convenções conhecidas.
- Tratar apenas a existência do arquivo como cobertura: títulos vazios e templates sem conteúdo seriam contados como processo realizado.

## Consequências e verificação

O relatório precisa mostrar documentos com caminho relativo, SHA-256, tamanho, tipo e feature; `completeInspection`, limites atingidos e `revision.documentsSha256`; deve separar descoberta de aprovação e conservar versão da rubrica para interpretar notas históricas. A API usa `POST /api/invoke` com `action: "sdd.align"` e argumentos `project` e `mode: "assess" | "ensure"`, sob CSRF e grants do host existentes. A aplicação deve testar árvores temporárias reais: sem SDD, parcial, Spec Kit com múltiplas features, IDs sem correspondência, arquivos vazios/template, limites de inventário, symlinks, colisões concorrentes e repetição idempotente. Os testes devem provar preservação dos arquivos preexistentes e que `assess` não escreve.

A documentação de operação fica em [integração SDD](../integrations/SDD.md); a especificação e os critérios de aceite ficam em [sdd-alignment.md](../specs/sdd-alignment.md). Referências e histórico da consulta estão descritos na integração. Fontes externas são apenas guias de formato/processo, não código importado ou prova de adoção.

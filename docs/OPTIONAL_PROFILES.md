# Perfis opcionais: instalar só o que demonstra utilidade

## Perfil entregue: local-deterministic

Node, SQLite/FTS5, Invokta, MCP, React Flow e tokenizer do payload. Sem Python, GPU, Docker ou chamadas LLM. `npm run setup` não liga modelos ou gateways. Todas as seis capacidades usam o mesmo domínio local.

## Laya / Decision Broker — contrato candidato, não ativo

Use apenas decisões curtas com opções delimitadas. Primeiro aplique regras determinísticas. Estado truncado, tokenizer desconhecido, modelo indisponível, distribuição nova ou limiar não calibrado levam a abstenção. Confiança não é autorização. Um limiar JEV não deve ser transferido automaticamente para Laya.

Alternativas a avaliar: Laya Python/MPS em Apple Silicon, laya-ts/ONNX CPU e SemIf MLX. O doctor não prova qual é mais rápido. Compare qualidade, cobertura, latência p50/p95, memória, cold start e energia no mesmo conjunto de decisões. Não carregue todos os backends simultaneamente.

Conversão JEV deve preservar o contrato de ação, respostas estruturadas e metadados de truncamento. `jev-ultrafast` pode inspirar separação entre escolha de operação/alvo e geração de texto; nenhuma ação de navegador deve ser executada antes de validar o alvo atual. `fast-jev-compaction` inspira uma proposta de descarte seguida de uma política determinística de preservação. Jarvis/captura de desktop ficam fora do núcleo, com consentimento específico por aplicativo se forem implementados.

## LightRAG — candidato de recuperação documental

Preferir o caminho de retorno de dados (`query/data`/API equivalente na versão fixada), entregando referências ao agente final. Isso pode evitar uma síntese intermediária, mas não elimina custo de embeddings, palavras-chave ou reranking. Não interpretar relações inferidas em documentos como um call graph comprovado.

Antes de ativar: edição/versão exata, política de egress, fontes permitidas, autenticação, limites de ingestão, isolamento por projeto, timeout, healthcheck e corpus de avaliação. O mesmo ambiente não deve acumular Mem0, Graphiti e LightRAG como três autoridades concorrentes sobre a mesma decisão.

## ai-memory 2.0 / formato OKF

O artigo de Akita de 2 de setembro de 2026 descreve formato aberto, memória local e trabalho paralelo. É um candidato relevante de interoperabilidade. BBrainX não declara importação OKF compatível sem implementar e testar o schema específico. O primeiro intercâmbio é JSON/Markdown explícito com proveniência. Não reingerir uma exportação como se fosse uma nova fonte independente.

## Serena/LSP

Próxima melhoria útil para precisão de código: procurar definição/referências e validar tipos pelo language server. A versão atual usa busca lexical por conteúdo e caminho; não anuncia análise AST ou call graph que não implementa.

## OpenHands e sandbox

Só para execução delimitada. Worktree/container não isola banco, rede, portas ou volumes montados. Nunca montar home inteiro ou socket Docker por conveniência. O serviço de memória não ganha shell porque um executor foi instalado.

## Remotion

Dependências e lock próprios em `media/`. Composição de apresentação sem dados de projeto. Licença do Remotion separada da MIT do BBrainX. A geração de vídeo não é dependência do núcleo, nem recurso de renderização arbitrária exposto ao navegador.

## Fontes baixadas vs dependências executadas

`npm run sources -- --download` clona os upstreams para estudo e registra SHA/licença. Não inicializa submódulos, não baixa LFS, não instala seus ambientes e não executa seus scripts. Isso evita transformar uma lista de referências em uma cadeia de instalação não auditada. O catálogo de frameworks não representa compatibilidade automaticamente comprovada.

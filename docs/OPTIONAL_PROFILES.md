# Perfis opcionais: instalar só o que demonstra utilidade

> O veredito de cada projeto externo está em [STUDY_MAP.md](STUDY_MAP.md) (por extenso) e em [FEASIBILITY.md](FEASIBILITY.md) (o histórico da análise). Um perfil só entra por comando explícito seu.

## Perfil entregue: local-deterministic

Node, SQLite/FTS5, motor de capacidades e servidor MCP próprios, React Flow e tokenizador do pacote. Sem Python, GPU, Docker ou chamadas a LLM. `npm run setup` não liga modelos nem gateways. As seis capacidades usam o mesmo domínio local.

## Perfil Laya — instalável, medido, fora do pacote

`node bin/bbrainx.mjs laya install` cria um ambiente Python isolado na pasta de estado, instala `laya` 0.3.26 com as versões fixadas em `profiles/laya/requirements.txt` e baixa o checkpoint `multilingual` na revisão `1c5edc17…`, conferindo o SHA-256 de cada arquivo antes de dar o nome definitivo. Um arquivo adulterado depois é baixado de novo.

O modelo roda num processo filho (`profiles/laya/worker.py`) que fala JSON por linha: sem porta aberta, sem rede (`HF_HUB_OFFLINE=1`), sem caminho de arquivo, só texto. O lado Node (`LayaBroker`) nunca lança: prazo estourado, recusa e queda viram um motivo, e três falhas seguidas abrem um disjuntor por cinco minutos.

Medido num MacBook M5 Pro, 24 GB, pela GPU (MPS), em 4 de outubro de 2026: carga em 4 a 18 s, cerca de 8 ms por decisão curta, 720 ms para julgar 10 trechos longos, pico de 1,8 GB de RAM. **Sem ajuste fino ele acertou menos que o caminho determinístico** nas duas decisões testadas (números em [EVALUATION.md](EVALUATION.md)). Por isso o perfil serve a `laya ask` e à medição, e **não altera o pacote de contexto**. O `doctor` diz isso em vez de sugerir que o modelo ajuda.

O caminho para ele influir no pacote é um checkpoint ajustado com rótulos do próprio uso, medido no mesmo conjunto, com limiar de abstenção calibrado. Um limiar ajustado no JEV não se transfere. Em outras máquinas (Linux, Windows, Mac Intel) o instalador resolve as mesmas versões, mas nada foi medido ali.

As técnicas dos produtos construídos sobre o JEV foram estudadas e ficaram como técnica: de `fast-jev-compaction`, a política determinística do que nunca pode ser descartado; de `jev-ultrafast`, validar o alvo antes de agir e consumir cada decisão uma vez; de `SemIf-OpenJev`, dar erro em vez de truncar. O Jarvis (captura de tela e de conversa no celular) fica fora. O porquê de cada um está em [STUDY_MAP.md](STUDY_MAP.md).

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

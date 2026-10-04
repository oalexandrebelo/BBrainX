# Avaliação: um teste não é um benchmark de produto

## Níveis de evidência

1. Testes unitários/de domínio: invariantes, tipos de erro, escopo e transações.
2. Integração: clientes MCP independentes e processos reais, leitura depois de encerramento, HTTP real e navegador.
3. Reprodutibilidade: mesma árvore npm lockada; matriz macOS/Linux/Windows; revisão e ambiente registrados.
4. Benchmark sintético: indexação, seleção e contagem de payload em fixture pública gerada. Não envolve LLM.
5. Benchmark de tarefas reais: ainda a executar com harnesses autenticados, critérios de aceitação, custo completo e revisão humana.

Não somar testes antigos da semente com os desta implementação para anunciar um total inexistente. Consulte logs da execução e a revisão em `docs/validation/ci-report.json` quando publicado. Em CI, macOS é um runner nativo; não é o Mac particular do mantenedor.

## Hipóteses e experimentos

| Hipótese proposta | Baseline | Variação | Medida primária | Risco |
|---|---|---|---|---|
| Seleção lexical reduz input sem perder evidência necessária | Arquivos escolhidos manualmente | Pacote FTS5 + hash | Tarefa aceita e fontes corretas | Sinônimos ou relações ausentes |
| Checkpoint melhora troca de harness | Nova sessão sem checkpoint | Bootstrap da mesma tarefa | Tempo até primeira ação correta | Resumo desatualizado |
| Indexação incremental evita trabalho duplicado | Reindexação total | Reuso por hash | CPU/tempo por alteração | Invalidação incompleta |
| Laya compensa seu overhead | Regras/rotas explícitas | Classificador local calibrado | Custo/latência por decisão correta | Truncamento e overconfidence |
| LightRAG ajuda relações documentais | Busca lexical | Recuperação de dados, sem resposta intermediária | Recall de evidências + custo de ingestão | Grafo incorreto, custo oculto |
| Compactação ajuda sessões longas | Histórico original | Política de retenção com artefatos | Custo por tarefa aceita | Releituras e cache quebrado |

Use tarefas estratificadas: localização de símbolo, bug local, refatoração multiarquivo, revisão de segurança, decisão documental e handoff. Um lote exploratório de 30 tarefas ajuda depurar o desenho, mas não garante poder estatístico. Randomize ordem, mantenha snapshot e permissões, faça repetições e reporte resultados negativos.

Separe cold start, índice aquecido e cache do provedor. Uma comparação com contexto já resolvido não é um ganho causado pelo sistema. Registre versões do harness, modelo, endpoint, ferramenta, índice, prompt e critérios de aceitação.

## Recuperação com casos rotulados (desde a 0.3)

```sh
node scripts/make-definition-cases.mjs --project meu-app --out casos.json --sample 300
node scripts/eval-retrieval.mjs --project meu-app --cases casos.json
```

O primeiro comando gera casos sem julgamento humano: cada nome declarado em um único arquivo-fonte vira a consulta, e esse arquivo é a resposta esperada. O segundo informa MRR e acerto entre os 1, 3 e 10 primeiros, por fatia. Também aceita casos escritos à mão, como `test/fixtures/eval-self.cases`, que a suíte usa como portão de regressão sobre este repositório. Guarde arquivos de casos com uma extensão que não é indexada: um `.json` com as consultas escritas vira o primeiro resultado delas.

Limites: mede a posição do trecho esperado, não tarefa aceita. Os padrões que geram os casos são mais estreitos que os do indexador, mas da mesma família, então o conjunto favorece nomes que o indexador reconhece. Os números de 4 de outubro de 2026 e suas ressalvas estão em [FEASIBILITY.md](FEASIBILITY.md).

## Custos

```text
custo por tarefa aceita =
(entrada nova + leitura/escrita de cache + saída
 + embeddings + ingestão + reranking + execução
 + tentativas adicionais + revisão) / tarefas aceitas
```

Normalize os campos de cada API sem contar tokens cacheados duas vezes. Contagem `o200k_base` do payload não equivale à cobrança de Claude/Gemini. Assinaturas não devem ser convertidas artificialmente em dólares de API. Campos não observáveis permanecem `null`.

## Benchmark sintético incluído

```sh
node scripts/benchmark.mjs
```

Cria arquivos sintéticos num diretório temporário, mede primeira indexação, reuso, mudança isolada e pacotes para termos conhecidos. Verifica recuperação do marcador esperado. Remove o banco de teste ao terminar e grava somente agregados em `artifacts/benchmark.json`. Nenhum código privado, API key ou modelo é usado.

A redução de tokens calculada é entre **corpus da fixture e payload selecionado**. Não representa economia faturada, qualidade generalizável ou ranking contra ferramentas externas.

## Aceite macOS real do mantenedor

- Instalação em pasta com espaços; Node correto também no cliente GUI.
- Demonstração com `npm run setup`, sem sudo, API keys ou Docker.
- Registro de raiz explícita e exclusão de conteúdo sensível.
- Troca entre duas IDEs instaladas, não só clientes MCP de teste.
- Reinício e suspensão/retomada do Mac sem corrupção.
- Backup/restauração em diretório vazio com processos parados.
- Avaliação separada de Apple Silicon/Intel e consumo energético antes de sugerir backend de inferência.

Esses itens não passam a estar comprovados apenas porque a CI macOS passou.

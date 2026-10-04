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
| Laya compensa seu overhead | Regras/rotas explícitas | Classificador local calibrado | Custo/latência por decisão correta | Truncamento e overconfidence. **Medido na 0.4: não compensa sem ajuste fino** |
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

## Perguntas cegas em linguagem natural (0.4)

Quem ajusta um buscador olhando os próprios casos de teste engana a si mesmo. Por isso a medida principal da 0.4 usa perguntas **escritas por outro autor, que não viu o buscador nem o glossário**, sobre dois repositórios de terceiros: 40 sobre o mem0 e 39 sobre o plandex, 30 em português e 10 em inglês por repositório, cada uma apontando o arquivo que implementa o comportamento descrito. Os arquivos estão em `test/fixtures/blind-mem0.cases` e `test/fixtures/blind-plandex.cases`.

| Versão da busca | MRR | Em 1.º lugar | Entre os 3 | Entre os 10 | Fora dos 50 |
|---|---|---|---|---|---|
| 0.3 | 0,395 | 32,9 % (24–44) | 44,3 % | 54,4 % (43–65) | 25 |
| + sem palavras vazias | 0,398 | 32,9 % | 44,3 % | 58,2 % | 25 |
| + radicais | 0,520 | 41,8 % (32–53) | 58,2 % | 73,4 % (63–82) | 14 |
| + glossário pt → en (0.4) | **0,570** | **45,6 %** (35–57) | **62,0 %** | **83,5 %** (74–90) | 6 |

Entre parênteses, o intervalo de Wilson a 95 %. Comparando caso a caso a 0.3 com a 0.4: a posição do arquivo certo melhorou em 40 perguntas, piorou em 7 e ficou igual em 32 (teste do sinal bilateral, p ≈ 0,000001). Só o glossário, sobre os radicais: melhorou em 24, piorou em 8 (p ≈ 0,007).

O que isso diz e o que não diz:

- O ganho entre os 10 primeiros é sólido: os intervalos não se cruzam. O ganho em 1.º lugar é menor do que o medido nos casos deste repositório (lá, de 17 % para 42 %), como se espera de um conjunto que o autor do ajuste não viu.
- Tirar palavras vazias quase não muda nada nesses dois repositórios, que são só em inglês. O efeito aparece quando há documentação em português competindo com o código, como aqui.
- Mede a posição do arquivo, não tarefa concluída. São 79 casos de dois repositórios: outro repositório pode dar outro número.

Para repetir:

```sh
git clone https://github.com/plandex-ai/plandex && git -C plandex checkout e2d772072efadbe41d2946d97d79be55532dbab5
node bin/bbrainx.mjs up --root ./plandex --project plandex
node scripts/eval-retrieval.mjs --project plandex --cases test/fixtures/blind-plandex.cases
```

O mem0 foi medido num clone parcial (pastas `mem0`, `mem0-ts` e `openmemory`, commit `abb81c88e1f738a8117d8293530fbc31a5ef8fd9`); num clone completo há mais arquivos concorrendo e o número pode cair.

### O número depende do corpus

Os casos sobre **este** repositório (`eval-self.cases`, `eval-natural.cases`) são um portão de regressão, não um placar: cada documento novo muda o corpus e, com ele, a posição dos arquivos. O mesmo conjunto de 24 casos deu 79 %, 75 % e 71 % de acerto em 1.º lugar em três revisões seguidas, sem que a busca tivesse mudado. Por isso o relatório de `eval-retrieval.mjs` agora traz o `snapshot` do corpus medido e o intervalo de confiança, e a comparação entre versões é feita em corpus fixado por commit.

### O que foi testado e não entrou

- **Laya como reordenador e como filtro de memória** (`scripts/laya-bench.mjs`, M5 Pro, GPU por MPS). Reordenando os 10 primeiros trechos de 36 perguntas: acerto em 1.º de 42 % com a busca para 6 % com o modelo; fundindo as duas ordens, 28 %. 81 % dos trechos foram truncados na janela de 1.024 tokens. Relevância de memória em 64 pares: 56 % de acerto contra 73 % do critério lexical e 70 % de quem responde sempre «não». Custo: 720 ms por consulta e 8 ms por par. O próprio projeto do Laya diz que os checkpoints de base ficam perto do acaso sem ajuste fino.
- **Busca vetorial** com `multilingual-e5-small`, fundida por posição com a busca textual. Nas 79 perguntas cegas: em 1.º lugar, 45,6 % → 55,7 %; entre os 10, 83,5 % → 84,8 %; melhorou 26 casos e piorou 16 (p ≈ 0,16, pode ser acaso). Nas 36 perguntas sobre este repositório, piorou: 44 % → 42 % em 1.º e 94 % → 86 % entre os 10. Sozinho, o modelo ficou em 29 % e 22 % em 1.º. Resultado inconclusivo; é o primeiro candidato a perfil quando houver mais casos cegos.

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

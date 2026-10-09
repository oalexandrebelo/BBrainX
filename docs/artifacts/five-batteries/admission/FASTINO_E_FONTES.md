# Fastino: novas oportunidades sem misturar classificação, autoridade e custo

Consulta pública em 09/10/2026. Esta rodada não baixou pesos, treinou modelos ou reexecutou benchmarks Fastino. Os pontos abaixo separam informação da fonte, interpretação de integração e experimento proposto.

## S1 — GLiNER2.5-Decide

Fonte: https://huggingface.co/fastino/GLiNER2.5-Decide

O card apresenta classificação operacional com rótulos fornecidos por chamada, múltiplas decisões no mesmo forward e modos single/multi-label. O benchmark declarado é exact match em inglês e reporta 60,2% de média no conjunto indicado. Não são resultados de tarefas de programação do BBrainX. O texto diz 340M, enquanto a seção automática de Safetensors exibe aproximadamente 0,5B; esta revisão não reconciliou a diferença. Dimensionar residência por artefato e medição, não pelo nome comercial. O próprio card distingue o classificador de um modelo geral de raciocínio.

**Oportunidade proposta:** avaliar um único lote de decisões compatíveis (tipo de tarefa, necessidade de ampliação de contexto, categoria de pendência) em vez de três chamadas independentes. O lote continua subordinado à política; nenhum rótulo aprova alteração de memória ou publicação de código.

## S2 — GLiNER2.5-multi-Decide

Fonte: https://huggingface.co/fastino/GLiNER2.5-multi-Decide

O card identifica o candidato multilíngue com mDeBERTa-v3-base e arquitetura boundary. Isso justifica colocá-lo no ensaio em português, mas não prova a qualidade naquele domínio. A compatibilidade precisa respeitar schema e formato de saída próprios.

**Decisão de arquitetura proposta:** um adapter de classificador não pode preencher probabilidades/calibração ausentes para imitar um servidor Laya. Multi-label independente não é distribuição categórica normalizada. Escalas ordinais declaradas por rótulos também não devem ser renomeadas como expectativa ordinal de outro modelo sem avaliação de equivalência. O adapter publica desconhecido quando não dispõe de evidência.

## S3 — fast-decisions

Fonte: https://huggingface.co/datasets/fastino/fast-decisions

O card separa desenvolvimento (100 exemplos por domínio disponibilizados) e teste retido (300 por domínio). O exemplo passa `multi_label` ao avaliador. Portanto, acessar a parte pública não equivale a reproduzir o placar privado integral. São tarefas operacionais de classificação, não demonstração de síntese de patches corretos.

**Protocolo proposto:** congelar schema, checkpoint, tokenizer e ordem de rótulos; distinguir idiomas; não usar exemplos de desenvolvimento como holdout independente. No BBrainX, adicionar negações, critérios conflitantes, opção de abstenção, mudança de revisão e tarefas de duas lanes. Predições e decisões verificadas são tabelas diferentes. O verificador determinístico fica fora do poder do candidato.

## S4 — transações SQLite

Fonte: https://sqlite.org/lang_transaction.html

A documentação define `BEGIN IMMEDIATE`, a concorrência de leitura e a exclusividade do writer. A transferência realizada nesta entrega é a atomicidade local de reserva/contador/evento e transações sem espera externa. Não transplantamos esse mecanismo como consenso multi-host.

## S5 — WAL

Fonte: https://sqlite.org/wal.html

WAL requer participantes na mesma máquina e pode crescer sob leitores prolongados. Usamos armazenamento local e transações curtas; o ensaio MEDIUM ainda precisa caracterizar caudas e manutenção. Hash de conteúdo ou SQLite FULL não certifica controlador/disco contra toda falha elétrica.

## S6 — Dean e Barroso, The Tail at Scale

Fonte primária: https://research.google/pubs/the-tail-at-scale/

A implicação adotada é medir composição e caudas. Um índice parcial pode acelerar fortemente uma consulta construída sem acelerar a tarefa inteira na mesma proporção. A medição entregue mantém essa unidade de comparação.

## S7 — Guo et al., On Calibration of Modern Neural Networks

Fonte primária: https://arxiv.org/abs/1706.04599

Calibração exige confrontar confiança com resultados de um conjunto. A fórmula por pedido `abs(maxProb - 1/K)` do material recebido não efetua esse confronto. Esta entrega não adota temperatura universal, limiar OOD arbitrário ou garantia de calibração perfeita. Um resultado de classe/confiança continua consultivo.

## S8 — Node.js, SQLite API

Fonte: https://nodejs.org/api/sqlite.html

A página corrente é de uma versão mais nova que o Node executado nesta rodada. A implementação foi validada no Node 24.21.0 disponibilizado no toolchain do projeto; não supõe que todas as APIs da documentação corrente existam nessa versão.

## Relação com os materiais enviados

Os anexos fornecem hipóteses de pooling, máscaras, RLCD, GPU, SDD e roteamento. Não são automaticamente pesos, um artefato ONNX compatível ou prova de resultado. Há um exemplo de inferência que usa probabilidades aleatórias e outro cujo caminho ONNX contém `pass`; não foram incorporados como produção. A aplicação C++ mostra fila SPSC, que não se transforma em MPMC por haver vários harnesses. A melhoria escolhida atua na fronteira observável de recursos, sem depender dessas hipóteses neurais.

## Experimentos posteriores que esta entrega habilita

1. Comparar baseline determinístico, Laya e Fastino multilíngue em tarefas estreitas autorizadas, com mesmo corpus e custos completos.
2. Medir lote de schemas compatíveis contra chamadas separadas, incluindo padding, tokenização e latência de fila.
3. Introduzir residência compartilhada por daemon se o custo de recarregar/alternar perfis justificar a complexidade. O ledger atual fornece admissão, não esse daemon.
4. Medir risco seletivo e cobertura sob orçamento; acerto de classificação não substitui aceitação de tarefa.
5. Publicar cards pequenos e auditáveis para cada capacidade BBrainX: entrada, saída, versão, fronteira de confiança, hardware medido, falhas conhecidas e reproduções.

Esses cinco itens são propostas de próxima pesquisa, não integrações instaladas nesta revisão.

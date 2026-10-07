# Referências primárias

Consulta em 5 de outubro de 2026. URLs de branches e documentação podem mudar; referências com SHA são imutáveis. A consulta não equivale à execução de cada projeto.

## S01 — BBrainX — revisão auditada

https://github.com/oalexandrebelo/BBrainX/tree/a9636e9402e3fa673ae05b3489202da1048aef5e

Código do usuário; branch verificada pela conexão GitHub.

## S02 — BBrainX — broker Laya da base

https://github.com/oalexandrebelo/BBrainX/blob/a9636e9402e3fa673ae05b3489202da1048aef5e/src/laya.mjs

Leitura focal; não implica auditoria integral.

## S03 — SuperTokens — access-token blacklisting

https://supertokens.com/docs/post-authentication/session-management/advanced-workflows/access-token-blacklisting

Verificação local versus revogação autoritativa.

## S04 — SuperTokens — verificação de sessões

https://supertokens.com/docs/additional-verification/session-verification/protect-api-routes

Contrato de validação e SDK.

## S05 — SuperTokens — verificação em WebSockets

https://supertokens.com/docs/additional-verification/session-verification/with-websocket

Conexões longas e expiração; rota conferir na versão adotada.

## S06 — SuperTokens Core — Main.java

https://github.com/supertokens/supertokens-core/blob/master/src/main/java/io/supertokens/Main.java

Core Java; não evidência de sub-milissegundo.

## S07 — Infisical Agent

https://infisical.com/docs/integrations/platforms/infisical-agent

Cache, renovação, sinks, templates e escopo de cache persistente.

## S08 — Infisical Agent Vault — README

https://raw.githubusercontent.com/Infisical/agent-vault/main/README.md

Proxy de credenciais, MITM e exigência de isolamento; produto distinto.

## S09 — Infisical — arquitetura e segurança

https://infisical.com/docs/documentation/getting-started/concepts/internals

Página de arquitetura; não sustenta zero-knowledge genérico.

## S10 — Infisical — licença

https://raw.githubusercontent.com/Infisical/infisical/main/LICENSE

Exceções e escopo de arquivos devem acompanhar cada distribuição.

## S11 — Medusa — módulo de locking

https://docs.medusajs.com/resources/infrastructure-modules/locking

Providers, aquisição/liberação e prazo.

## S12 — Medusa — compensation function

https://docs.medusajs.com/learn/fundamentals/workflows/compensation-function

Workflow compensável, não rollback mágico de efeitos externos.

## S13 — Medusa — caching module

https://docs.medusajs.com/resources/infrastructure-modules/caching

Módulo 2.11+, feature flag e providers; não presumir defaults.

## S14 — Medusa — repositório

https://github.com/medusajs/medusa

Origem do ecossistema modular; não transplante de serviços.

## S15 — SigNoz — repositório

https://github.com/SigNoz/signoz

Observabilidade com OTel e ClickHouse.

## S16 — SigNoz — tail sampling

https://signoz.io/docs/traces-management/guides/tail-sampling/

Topologia e efeitos nas métricas derivadas de traces.

## S17 — OpenTelemetry — tail sampling processor

https://raw.githubusercontent.com/open-telemetry/opentelemetry-collector-contrib/main/processor/tailsamplingprocessor/README.md

Buffer, decisões, late spans e sharding; leitura crítica de inconsistência textual.

## S18 — SigNoz — licença

https://raw.githubusercontent.com/SigNoz/signoz/main/LICENSE

Apache-2.0 fora das exceções enterprise descritas.

## S19 — Unkey — rate limiter auditado

https://github.com/unkeyed/unkey/blob/f6180ba4e045839872d72d6765b74032f3601ee4/internal/services/ratelimit/ratelimit.go

Leitura das linhas 1–280: janela aproximada, CAS, origin e estado regional.

## S20 — Unkey — repositório

https://github.com/unkeyed/unkey

Estrutura atual Go e serviços; não assumir antiga topologia edge.

## S21 — Unkey — índice oficial de documentação

https://www.unkey.com/docs/llms.txt

API Management e Compute são produtos distintos.

## S22 — Unkey — licença

https://raw.githubusercontent.com/unkeyed/unkey/main/LICENSE

AGPL e exceções devem ser verificadas por componente.

## S23 — Laya TypeScript — exportação e runtime

https://raw.githubusercontent.com/NandhaKishorM/laya/main/laya-ts/README.md

Encoder/head, truncamento, opções colapsadas e provedores.

## S24 — receptron/laya — adapter

https://raw.githubusercontent.com/receptron/laya/main/src/laya.ts

Inputs input_ids/attention_mask/marker_pos/marker_mask/qtype e outputs específicos.

## S25 — ONNX Runtime — TensorRT Execution Provider

https://onnxruntime.ai/docs/execution-providers/TensorRT-ExecutionProvider.html

Provider NVIDIA; não backend macOS universal.

## S26 — ONNX Runtime — CoreML Execution Provider

https://onnxruntime.ai/docs/execution-providers/CoreML-ExecutionProvider.html

Alternativa Apple; compatibilidade/paridade continuam a testar.

## S27 — Linux — circular buffers

https://docs.kernel.org/core-api/circular-buffers.html

SPSC e ordenação; múltiplos produtores exigem serialização adicional.

## S28 — Crossbeam — epoch

https://docs.rs/crossbeam-epoch/latest/crossbeam_epoch/

Pin, guards e coleta; não transplante automático para IPC.

## S29 — memmap2 — MmapOptions

https://docs.rs/memmap2/latest/memmap2/struct.MmapOptions.html

Condições de segurança do mapeamento.

## S30 — RFC 1950 — Adler-32

https://www.rfc-editor.org/rfc/rfc1950

Checksum com acumuladores A e B; não autenticador criptográfico.

## S31 — Zanzibar — Pang e colaboradores, 2019

https://research.google/pubs/zanzibar-googles-consistent-global-authorization-system/

Consistência causal de ACL e conteúdo; trabalho original.

## S32 — Hazard pointers — Maged Michael, 2004

https://research.ibm.com/publications/hazard-pointers-safe-memory-reclamation-for-lock-free-objects

Reclamação segura; diferente de autorização e versionamento.

## S33 — Reclaiming Memory for Lock-Free Data Structures — Trevor Brown

https://arxiv.org/abs/1712.01044

Problemas de reclamation, falhas e escalabilidade.

## S34 — Are Your Epochs Too Epic? — Kim, Brown e Singh

https://arxiv.org/abs/2401.11347

Liberações em lotes e impacto de latência; não assumir reclamation grátis.

## S35 — The Tail at Scale — Dean e Barroso, 2013

https://research.google/pubs/the-tail-at-scale/

Latência de cauda e sistemas de larga escala.

## S36 — How Amazon Web Services Uses Formal Methods — Newcombe e colaboradores, 2015

https://www.amazon.science/publications/how-amazon-web-services-uses-formal-methods

Modelagem de protocolos e descoberta de erros antes da implantação.

## S37 — Bounded Counters — Balegas e colaboradores, 2015

https://arxiv.org/abs/1503.09052

Escrow e invariantes numéricas em bases eventualmente consistentes.

## S38 — TinyLFU — Einziger, Friedman e Manes

https://arxiv.org/abs/1512.00727

Admissão baseada em frequência; separada de validade.

## S39 — S3-FIFO — Yang e colaboradores, SOSP 2023

https://github.com/Thesys-lab/sosp23-s3fifo

Código e descrição do trabalho original; três filas.

## S40 — S3-FIFO — explicação do autor

https://blog.junchengyang.com/system/cache/2023/08/01/s3fifo

S/M/G, hits e metadados; resultados não são medição BBrainX.

## S41 — redis-cell — GCRA

https://github.com/brandur/redis-cell

Mecanismo sem drip job; referência algorítmica, não dependência mandatória.

## S42 — Timeouts, retries and backoff with jitter — AWS Builders Library

https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/

Amplificação de retries, idempotência e jitter.

## S43 — How to do distributed locking — Martin Kleppmann, 2016

https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html

Fencing no recurso protegido; lease não prova isolamento de escritores.

## S44 — On Calibration of Modern Neural Networks — Guo e colaboradores, 2017

https://arxiv.org/abs/1706.04599

Calibração pós-processamento; não certificado de segurança.

## S45 — libsodium — XChaCha20-Poly1305

https://libsodium.gitbook.io/doc/secret-key_cryptography/aead/chacha20-poly1305/xchacha20-poly1305_construction

AEAD mantida, nonces e dados adicionais; sem criptografia artesanal.

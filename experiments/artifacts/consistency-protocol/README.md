# BBrainX × Laya — laboratório e protocolo X99

A entrega contém uma auditoria do anexo “Einsteinian Engine”, um protocolo proposto para memória/consistência/admissão e verificações reproduzíveis. **Não é um patch instalado do BBrainX, não foi publicado no GitHub e não carrega modelo neural.**

## Ler

`PROTOCOLO_X99.md` contém o estudo técnico e as decisões. `REFERENCIAS.md` e `sources.json` identificam as fontes primárias. `evidence/attachment-audit.json` registra o hash da fonte do usuário e os trechos encontrados, sem incorporar o texto integral ao pacote.

As capacidades documentadas de SuperTokens, Infisical, Medusa, SigNoz e Unkey foram separadas das propostas do BBrainX. Não foram executadas as cinco aplicações. O código atual do usuário foi lido via GitHub na revisão `a9636e9402e3fa673ae05b3489202da1048aef5e`; nenhuma escrita remota foi feita nesta entrega.

## Executar

Requer Python 3.11+ e SQLite que ofereça WAL/RETURNING. Não requer Node, Rust, Docker, GPU, conta, modelo ou conexão de rede.

```sh
cd verification
python3 test_protocol.py
python3 protocol_checks.py
```

Os testes criam bancos temporários e encerram somente os subprocessos que eles próprios iniciam. O subprocesso usado nos testes de crash aguarda um ponto de controle; o controlador o mata antes ou depois de COMMIT. Há timeout de segurança caso o controlador falhe. Isso testa falha de processo, **não falha elétrica/controlador de disco**.

## Resultados desta execução

Foram executadas 35 verificações: 35 aprovadas, sem falhas/erros/skips. Ambiente observado: Linux x86_64, Python 3.13.5 e SQLite 3.46.1. O log integral está em `evidence/tests.log` e a saída estruturada em `evidence/verification.json`.

O teste de GCRA percorre 5.670 sequências de quatro decisões contra um token bucket racional independente. O modelo dos dois produtores possui 20 intercalações, com perda de estado em 18. Esse número não é taxa de erro no mundo real. O modelo de liberação versus revogação percorre quatro ordens: o modelo sem guarda falha em duas; o modelo com guarda atômica não falha naquele espaço finito.

O ledger SQLite de laboratório mantém reserva, saldo e outbox transacionais. Testa concorrência entre processos, replays idempotentes, conteúdo divergente com mesmo ID, resultado desconhecido, liquidação e fencing. **Não contém autenticação, tarifação de provedores, API de rede, sistema multiusuário ou integração com o produto.** Não colocar o ledger diretamente em produção.

## Limites e honestidade de escopo

Os enumeradores são modelos sequencialmente consistentes, não execução do Rust anexado. Encontrar uma contraprova refuta a propriedade modelada; não encontrar falha num modelo limitado não prova todas as implementações ou arquiteturas de CPU.

Não foi compilado Rust nem medido ONNX/TensorRT/MPS/CoreML. Não foram repetidos npm test/build/E2E do BBrainX. Não existem números novos de economia de tokens, faturamento, inferência ou latência de produto nesta entrega. Duração do unittest não deve ser usada como benchmark de agentes.

O manifesto SHA-256 permite verificar integridade interna do pacote; não constitui assinatura de release. A base do BBrainX e o patch X99 anterior permanecem independentes desta entrega.

## Código e atribuição

O código original do laboratório está sob MIT. Fontes externas, marcas e bibliotecas mantêm seus próprios termos. A entrega não implica endosso dos pesquisadores, empresas ou mantenedores citados. Não contém fontes tipográficas, chaves, pesos de modelos ou cópias dos repositórios estudados.

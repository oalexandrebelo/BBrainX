# Evidências do protocolo

A descrição dos resultados originais de 35 testes está preservada no README e no estudo. Para reexecutar, use `python3 verification/test_protocol.py`; o programa produz `verification.json` e sua saída textual. O timestamp de rodada no script é histórico.

A CI desta consolidação usa uma cópia temporária, não escreve sobre a pesquisa original e publica novos logs/ambiente em `artifacts/consolidated/labs/consistency-protocol`. Seu `consolidation.json` identifica o momento e o escopo da nova execução. `PROTOCOLO_X99-original.md` nesses artefatos é a concatenação das quatro partes, validada contra o SHA-256 original.

A fonte textual A01 não é redistribuída. `verification/verify_attachment.py` exige que o operador forneça esse anexo explicitamente; não é executado pela CI sobre arquivos pessoais.

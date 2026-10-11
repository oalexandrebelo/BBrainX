# Atlas X99 — arquitetura BBrainX × Laya

Versão do atlas: **1.0**. Data-base do estudo: **5 de outubro de 2026**. Código examinado: `a9636e9402e3fa673ae05b3489202da1048aef5e` (BBrainX 0.4.0). Este documento descreve a implementação da visualização e a situação dos componentes; não declara que todas as propostas foram instaladas.

## Abrir e reproduzir

Na branch que contém este atlas, com o runtime Node suportado pelo projeto:

```sh
npm ci --ignore-scripts
npm run build
npm start
```

Abra `http://127.0.0.1:4317/atlas.html`. A página principal do laboratório continua em `/`. Nenhum arquivo de `src/`, credencial, configuração de harness ou migração de banco é alterado por este trabalho. A visualização não chama a API do produto, não carrega Laya e não coleta telemetria.

Para uma publicação que contenha **somente** o atlas documental:

```sh
npx vite build --config vite.atlas.config.mjs
node scripts/atlas-publish.mjs
```

O diretório `dist-atlas` tem uma allowlist de arquivos. Não copia `public/`, banco de dados, documentos de projetos, o backend ou mapas de fonte. A configuração de visibilidade do repositório não é modificada. Links para arquivos privados continuam exigindo permissão no GitHub.

## Cinco percursos

| Percurso | Conteúdo | O que não significa |
|---|---|---|
| Arquitetura alvo | Combina a base com as evoluções propostas, mantendo a maturidade de cada nó visível. | Não é uma topologia de produção já instalada. |
| Runtime atual | Componentes presentes na base 0.4.0, incluindo o perfil Laya opt-in. | Não certifica toda versão de todo harness. |
| Laya + cache | Worker, modelo, cache exato, versões, snapshot e alternativa ONNX. | Não transporta KV entre modelos nem habilita o cache candidato. |
| Protocolo X99 | Autorização, admissão, reservas, leitura consistente, fencing, segredos e observabilidade. | Laboratório não equivale a integração no runtime. |
| Novas incorporações | SuperTokens, Infisical, Medusa, SigNoz e Unkey vinculados aos mecanismos que inspiram. | As cinco plataformas não são instaladas pelo BBrainX. |

Há **32 componentes** e **sete classes de maturidade**. Os filtros não mudam o estado do produto; apenas selecionam o conteúdo visível. Linhas tracejadas significam relação documental/proposta. O percurso manual é explicação, não animação de agentes em execução.

## Maturidade é parte do contrato

- **Na base 0.4:** código examinado no commit indicado.
- **Opt-in:** perfil existente, dependente de ativação explícita; Laya não reordena o contexto padrão.
- **Patch candidato:** alterações entregues na auditoria anterior, sem incorporação à base examinada.
- **Laboratório:** mecanismo verificado isoladamente, sem integração de produto.
- **Proposto:** arquitetura cuja implementação e homologação ainda são gates futuros.
- **Referência:** fonte técnica; não dependência de execução.
- **Não incorporar:** desenho recusado na forma analisada.

O termo "incorporação" neste atlas pode significar **incorporação ao desenho ou ao estudo**. Só a classe "Na base 0.4" afirma presença na base. Não renomear componentes de candidato/laboratório para implementado apenas porque receberam um nó.

## O que cada nova fonte acrescenta

**SuperTokens → autorização versionada:** separar validade criptográfica do token de permissão vigente; explicitar revisão e ponto de liberação. A documentação oficial distingue verificação stateless de verificação da sessão autoritativa.

**Infisical → segredos e egress:** referências opacas, rotação versionada e injeção restrita a destinos autorizados. Não introduzir proxy MITM ou ler credenciais nativas como efeito de abrir o atlas.

**Medusa → reservas e compensação:** reservar orçamento antes de executar, identificar cada operação e manter estado desconhecido até reconciliação. Compensação não desfaz universalmente efeitos externos.

**SigNoz/OTel → observabilidade limitada:** métricas e traces com população explícita, fila limitada e auditoria crítica separada. Um dashboard não é fonte autoritativa de sucesso.

**Unkey → admissão e contenção:** custos por operação, limites e hidratação do estado. Convergência entre réplicas não deve ser descrita como teto financeiro global linearizável.

As fontes estão ligadas nos nós e em `web/atlas/data.js`. Os sistemas completos não foram executados para produzir este atlas.

## Três populações de testes anteriores, não um total

| Evidência | Quantidade | Escopo |
|---|---:|---|
| CI da base | 96 por plataforma | Relatório do commit testado `912aa253`; não testes deste atlas. |
| Patch X99 anterior | 43 aprovados | 38 novos e cinco existentes; seis testes de integração do compilador não executados. Patch não incorporado. |
| Protocolo X99 | 35 verificações | Python, SQLite e processos em Linux; sem inferência e sem integração de runtime. |

O atlas possui testes próprios em `test/atlas.test.mjs` e `e2e/atlas.spec.mjs`. O resultado só deve ser informado a partir da execução correspondente, em **Verify Architecture Atlas**, não da existência desses arquivos.

## Interface e exportação

A interface usa `@xyflow/react` já presente no lockfile. Componentes personalizados e callbacks estáveis evitam reconstrução desnecessária. Não há autoloop animado nem polling. Busca remove acentos para a comparação; o texto exibido preserva grafia original. A lista acessível oferece seleção sem depender de atingir um nó pequeno no canvas.

URLs guardam `view`, `status`, `q` e `node`. Recarregar preserva o recorte e o inspetor quando o estado é válido. Entradas inválidas usam a visão padrão. Não há interpolação de HTML de busca.

SVG e JSON saem do mesmo dataset. SVG é um desenho vetorial do modelo, **não screenshot do canvas**; PNGs gerados pelo teste são capturas reais da aplicação. O JSON inclui revisão, classificação e status; não é um arquivo de configuração de runtime.

```sh
node --test test/atlas.test.mjs
npx playwright install chromium
npx playwright test e2e/atlas.spec.mjs
node scripts/atlas-export.mjs
```

O workflow exporta SVG/JSON, screenshots desktop/mobile, resultados de testes e o bundle estático. Não publica automaticamente esses artefatos sobre `main`.

## Evolução sem perder evidência

A fonte única é `web/atlas/data.js`. Uma promoção de maturidade exige referência ao commit de implementação, execução de teste pertinente e descrição do limite que permanece. Preservar `inspectedRevision`: uma nova auditoria deve gerar uma versão nova do atlas, não reescrever os resultados antigos como se todos fossem atuais.

Não usar o ranking de estrelas como teste de correção. O objetivo técnico de reputação é demonstrar que a troca de harness preserva objetivo, decisões, evidências, escopo e custo observado.

## Referências de interface e revisão

- React Flow: https://reactflow.dev/learn/customization/custom-nodes
- React Flow performance: https://reactflow.dev/learn/advanced-use/performance
- Base auditada: https://github.com/oalexandrebelo/BBrainX/tree/a9636e9402e3fa673ae05b3489202da1048aef5e
- CI da base: https://github.com/oalexandrebelo/BBrainX/actions/runs/37266010282
- Comparação técnica: [POSICIONAMENTO_X99.md](POSICIONAMENTO_X99.md)

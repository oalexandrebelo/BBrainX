# Laya: decisões locais inspecionáveis

Entrega de 08/10/2026, developer preview. O perfil deixa de ser apenas um experimento de CLI: `decision.evaluate` está disponível no painel HTTP, no comando `laya decide` e como ferramenta MCP `decision_evaluate`, sempre por ativação explícita do host. O caminho normal de contexto continua determinístico. O modelo não aprova memórias, não escolhe permissões, não lê arquivos do projeto e não executa a alternativa sugerida.

## O fluxo implementado

1. O host concede o projeto e habilita `--laya`. Instalar os pesos não habilita a ferramenta automaticamente.
2. O engine valida o schema e o grant. A raiz registrada é revalidada, inclusive em hits do cache.
3. O serviço procura uma resposta exata no cache privado daquele processo, projeto e raiz. Ordem das opções, texto, perguntas, revisão do modelo e configuração fazem parte da identidade.
4. No miss, o broker inicia o worker local sob demanda. Um tokenizer real verifica se a pergunta ou as opções perderiam conteúdo. A inferência usa os pesos verificados por SHA-256.
5. Se a pergunta/opções ou o estado forem truncados, o serviço responde `status: "abstained"`, sem respostas utilizáveis. Uma abstenção não entra no cache.
6. Na resposta utilizável, o painel mostra a alternativa, distribuição, identidade do modelo, dispositivo, cache e tempos. A saída é uma sugestão; os valores de confiança não são probabilidades de correção calibradas.

O estado fornecido é tratado como dado. Ele não amplia a autoridade nem vira instrução para executar código. Falhas de modelo são erros tipados; não são substituídas por uma escolha inventada. A captura automática de arquivos ou de todo o histórico de um harness não faz parte desta capacidade.

## Ativar em outra máquina

Execute a partir da raiz do clone Git, com Node 22.20 ou superior e dependências instaladas. Use Node 24 para reproduzir o ambiente desta entrega. Os comandos usam o `BBRAINX_HOME` selecionado pelo host; um launcher instalado pode definir um home diferente do padrão do clone. Confira `laya status` pelo mesmo entrypoint que iniciará o servidor.

```sh
git rev-parse --show-toplevel
npm ci --ignore-scripts
npm run build
node bin/bbrainx.mjs up --root /caminho/absoluto/do/projeto --project meu-projeto
node bin/bbrainx.mjs laya install
node bin/bbrainx.mjs laya status
node bin/bbrainx.mjs serve --laya
```

O instalador escolhe `uv` ou um Python 3.10–3.13 executável. Se sua máquina só expuser uma versão não suportada, escolha explicitamente uma instalação compatível:

```sh
BBRAINX_PYTHON=/caminho/absoluto/python3.12 node bin/bbrainx.mjs laya install
```

`BBRAINX_PYTHON` inválido produz `LAYA_PYTHON_INVALID`; não há troca silenciosa para outro interpretador. O comando não muda o Python do sistema. Instalação exige downloads das dependências/pesos quando não estiverem presentes. Execução usa pesos locais com os modos offline das bibliotecas. Isso não constitui sandbox de rede do sistema operacional.

Não transporte um virtualenv entre usuários ou máquinas: symlinks e launchers podem apontar para caminhos antigos. Recrie-o com Python compatível no destino. Reuse somente arquivos de pesos cuja revisão e hashes correspondam ao manifesto; dependências precisam corresponder ao SO, arquitetura e ABI do Python. Na recuperação deste Mac mini, a cópia antiga apontava para `/Users/alexandrebelo/...`, inexistente nesta máquina. O Python 3.12 e os pacotes locais compatíveis foram usados para reconstruir o ambiente; não houve novo download de modelo nem API paga.

## Harnesses e limites de ativação

No servidor MCP já autorizado para o projeto, acrescente `--laya` à lista de argumentos **preservando projeto, workspace, lane, executável e home existentes**. Exemplo de argumentos, sem credenciais:

```json
["/caminho/absoluto/BBrainX/bin/bbrainx.mjs", "mcp", "--project", "meu-projeto", "--workspace", "/caminho/absoluto/do/projeto", "--laya"]
```

Quando o command é o launcher `bbrainx`, a lista começa em `mcp`. Quando o command é Node, ela começa no caminho do script. Reinicie a conexão MCP e confira `tools/list`: seis ferramentas por padrão; sete quando habilitado. O nome adicional é `decision_evaluate`. Codex, Claude Code e Kilo usam seus próprios mecanismos de configuração MCP; o provedor OmniRoute do Kilo não precisa ser alterado. Antigravity continua sujeito à lacuna de escopo nativo documentada em [MAC_MINI.md](MAC_MINI.md); este perfil não justifica um grant global.

O gerador `integrate` permanece conservador e não ativa modelos em todos os clientes. Cada processo MCP ou servidor de painel habilitado pode manter seu próprio worker e memória do modelo. Não multiplique instâncias automaticamente num Mac de 16 GiB. O cache de decisões desta entrega não é compartilhado entre processos. A memória aprovada e os checkpoints do BBrainX mantêm seu contrato próprio de compartilhamento e isolamento.

## Contrato da decisão

Exemplo completo de `perguntas.json`:

```json
{
  "tipo": {
    "type": "choice",
    "instructions": "Classifique a solicitação.",
    "criteria": {
      "correcao": "corrigir um defeito de software",
      "funcionalidade": "adicionar uma funcionalidade",
      "documentacao": "escrever documentação"
    }
  },
  "urgente": {
    "type": "noul",
    "instructions": "O texto declara urgência explicitamente?",
    "criteria": {"false": "sem urgência explícita", "true": "urgência explícita"}
  }
}
```

```sh
node bin/bbrainx.mjs laya decide --project meu-projeto --state "O teste de login falha por timeout." --file perguntas.json
```

No MCP, passe `{project, state, questions}` para `decision_evaluate`. No HTTP, o transporte existente `/api/invoke` recebe `{action: "decision.evaluate", args: {project, state, questions}}`, com a proteção CSRF do painel. `choice` retorna um rótulo entre as opções, `score` um valor entre zero e o último índice dos critérios, e `noul` um valor entre zero e um. O painel desta entrega oferece o formulário `choice`; CLI/MCP aceitam os três tipos.

| Limite | Capacidade pública `decision.evaluate` |
| --- | --- |
| Estado | 1–4.000 unidades UTF-16 no validador JavaScript; caracteres não equivalem a tokens |
| Perguntas | 1–4; IDs ASCII de até 32 caracteres |
| Instruções | 1–400 unidades UTF-16 por pergunta |
| Alternativas | 2–6 em choice/score, descrição de 1–160 unidades UTF-16; noul exige false/true |
| Comprimento do modelo | `maxLen: 2048`, mais verificação independente da cabeça tokenizada |
| Prazo | 25 segundos incluindo carga, validação e inferência do broker; engine mantém seu limite externo |
| Concorrência | Uma operação ativa por broker; segunda operação sem hit recebe `LAYA_BUSY`, sem fila |
| Cache | LRU de até 64 respostas e 128 KiB de JSON serializado + chaves; não é um limite de RSS do processo |
| Inatividade | Após dois minutos, worker encerrado e cache eliminado |

O comando histórico `laya ask` e o benchmark expõem o protocolo experimental mais amplo, com limites próprios. Não são equivalentes ao serviço público protegido contra truncamento. O protocolo do broker limita frames de saída a 1 MiB, requisições a 4 MiB, até 64 estados e 16 perguntas. Aceita `maxLen` de 256 a 8192. O worker não herda chaves de provedores, `PYTHONPATH` nem `NODE_OPTIONS`; mantém somente o ambiente de runtime necessário e as flags offline.

Timeout ou cancelamento encerra aquela geração do worker; resposta tardia não pode completar uma operação seguinte. Três falhas consecutivas abrem o circuit breaker por cinco minutos. Cancelamentos e busy não contam como falha do modelo. Saída inválida, campos incompatíveis, cardinalidade divergente, probabilidades inválidas ou bytes UTF-8 inválidos produzem recusa. Os hashes do modelo são conferidos a cada carga; `laya status` informa presença/tamanho e não substitui essa verificação ou a prova de inferência.

## Verificar com o modelo real

```sh
node scripts/laya-smoke.mjs --project meu-projeto --out artifacts/laya/smoke.json
# No Mac com MPS, exija também --expected-device mps.
node scripts/laya-bench.mjs --project corpus-fixo --cases test/fixtures/eval-natural.cases --memory test/fixtures/eval-memory.cases --max-len 1024 --batch-size 4 --out artifacts/laya/bench-1024.json
node scripts/laya-bench.mjs --project corpus-fixo --cases test/fixtures/eval-natural.cases --memory test/fixtures/eval-memory.cases --max-len 2048 --batch-size 4 --out artifacts/laya/bench-2048.json
```

Crie o diretório de saída antes do benchmark. Registre e indexe `corpus-fixo` a partir do mesmo arquivo Git nos dois ensaios; não use uma árvore que muda durante a comparação. O relatório conserva hashes dos datasets, snapshot, revisão/configuração do modelo, respostas por caso, ranks, truncamento e tempos dos lotes. Tempo por candidato é amortizado pelo lote, não latência isolada por requisição. Os casos existentes são vistos; não constituem holdout nem prova de benefício em tarefas reais.

O smoke exige modelo real, verifica os dois transportes, abstenção, isolamento, cache e ausência de mutação em memória/checkpoint. Não testa acurácia geral. Recibos de conexão MCP podem ser atualizados. Os testes Node de falha usam subprocessos de protocolo identificados como fixtures; não são evidência de inferência. O teste Python opcional usa o tokenizer fixado quando `BBRAINX_LAYA_TEST_HOME` estiver definido. Evidência observada: [LAYA_2026-10-08.md](../engineering/LAYA_2026-10-08.md).

## O que deve superar uma alternativa hospedada

Laya e JEV/TypeSafe oferecem decisões tipadas; não há evidência desta rodada de que Laya tenha maior acurácia. A entrega concreta traz execução local, inspeção do resultado, abstenção por perda de entrada, cache exato isolado e uso no mesmo painel/MCP do projeto. Não houve chamada à API JEV, cálculo de economia financeira ou comparação de disponibilidade operacional.

Próximo experimento: dataset autorizado de triagem e roteamento para desenvolvimento, separado por repositório/tarefa em treino, calibração e teste; comparar regra determinística, Laya e API concorrente com os mesmos estados completos e rótulos reservados. Medir risco entre decisões aceitas, cobertura, ECE/Brier conforme tipo de saída, latência fria/quente, custo observado por tarefa aceita e abstenções. Fixar o orçamento e a revisão dos candidatos antes de treinar. Evitar aprender permissões ou aprovar memórias automaticamente. RL, fine-tuning e quantização exigem esse gate; não são consequência automática do novo botão.

Fontes primárias: [Laya v0.3.26](https://github.com/NandhaKishorM/laya/tree/v0.3.26), [API do agente](https://github.com/NandhaKishorM/laya/blob/v0.3.26/laya/agent.py), [construção da cabeça](https://github.com/NandhaKishorM/laya/blob/v0.3.26/laya/common.py), [JEV para agentes](https://docs.typesafe.ai/introduction/coding-agents) e [semântica de confiança do JEV](https://docs.typesafe.ai/confidence). A versão do perfil continua fixada em 0.3.26; novidades posteriores não foram incorporadas sem avaliação.

# Pesquisa aplicada: Action Engines, evolução de agentes e observabilidade

**Data:** 7 de outubro de 2026. Distinguimos: código lido, documentação upstream, trabalhos científicos, relato de fornecedor, hipóteses e implementação nesta branch. Não há certificação de segurança, acurácia de 99%, superioridade sobre concorrentes ou economia financeira medida em tarefas reais nesta pesquisa.

## 1. Correções ao manifesto

Invokta define contratos de capabilities, regras de acesso, validação, cancelamento, erros e adapters para múltiplos chamadores. “Stateless” qualifica seu transporte MCP HTTP, não proíbe persistência nas ações. Seus exemplos incluem dados e regras de domínio. Portanto, “Invokta só valida schema, atende um chamador e não pode ter memória” é comparação incorreta. [R11]

A tese defensável do BBrainX é especialização: continuidade e memória governada por projeto, evidências de código, orçamento contextual e observabilidade. A base tem um motor próprio inspirado no contrato de Action Engines; não deve readotar a dependência por erro de posicionamento. Não precisamos inferiorizar a referência para demonstrar o valor do produto.

A imagem recebida descreve adequadamente uma fronteira: capability definida uma vez, acessível por diferentes clientes. Um resultado validado pode significar apenas schema válido. Para afirmar sucesso de negócio, precisa haver regra, efeito confirmado e evidência pertinente. HTTP 200, JSON válido ou confiança alta de um modelo não são essas três propriedades.

“Cognitive & Action Protocol OS” pode ser linguagem de visão, mas não identifica um sistema operacional real, protocolo padronizado externo ou conjunto já concluído. A base não incorpora automaticamente grafo vetorial/bitemporal, daemon global de modelos, políticas remotas, logs imutáveis ou SDK Python porque eles aparecem num desenho. O catálogo de possibilidades precisa carregar maturidade e revisão como o Atlas anterior.

## 2. Soberania e exposição de dados

Manter a implementação de uma regra no backend evita expor seu código por padrão, mas a saída da ferramenta pode conter dados privados que o harness envia ao modelo remoto. “Nada sai da máquina” só é verdadeiro para os componentes realmente locais e suas rotas; não para toda uma sessão de IA sem observar o destino do harness.

MCP padroniza conexão e contratos de mensagem, não garante que todos os clientes entendam todos os transportes, recursos, auth, anexos e cancelamentos igualmente. A especificação consultada distingue stdio e Streamable HTTP, com regras de segurança por transporte. Um diagrama não comprova paridade de clientes. [R12]

Não introduzimos proxy universal, CA MITM, captura de credenciais ou reconfiguração de `ANTHROPIC_BASE_URL`. Cada exporter futuro deve declarar os metadados que coleta, destino, retenção e escopo. Bibliotecas SDK podem expor usage de chamadas que passam por elas; não observam tráfego arbitrário de outro processo sem integração adicional.

Logs SQLite versionados são auditáveis operacionalmente, mas administradores locais podem alterá-los. Para resistência à adulteração serão necessários ameaça explícita, assinatura/checkpoints externos, chave protegida, retenção e revisão separada. Nenhuma arquitetura de cache implica conformidade LGPD/GDPR/SOC2 automaticamente.

## 3. Monetização compatível com o objetivo local

Proposta, não oferta comercial existente: manter no núcleo aberto a memória por projeto, exportação, contratos, recuperação básica e controles necessários ao uso seguro local. Serviços gerenciados de equipe podem oferecer administração, operação, backup remoto, suporte e integrações corporativas. Não retirar a persistência local prometida para convertê-la artificialmente em dependência de nuvem.

Anti-lock-in é uma propriedade a testar: exportar estado, trocar cliente, recuperar referências, manter autorização e concluir tarefa. Contratos versionados, migrações, IDs estáveis, exportadores e testes de compatibilidade sustentam essa propriedade melhor que a palavra “agnóstico”. Não afirmar SDK TypeScript/Python publicado quando só existe uma implementação Node interna.

## 4. Pesquisa de evolução: o objeto modificado precisa estar explícito

| Fonte primária | Mecanismo útil | Limite e aplicação proposta |
|---|---|---|
| Dream-RSI, v2 consultada | Históricos de exploração e políticas avaliadas em mundos de replay | Melhorar política de busca, não transferir pesos. Histórico não fornece contrafactual confiável para ações inéditas. O replay do PR anterior é delimitado e não implementa o método completo. [R13] |
| DeepSeek-R1 | RL com recompensas e comparação relativa de grupos; R1 e R1-Zero têm receitas distintas | GRPO elimina critic separado em sua formulação, não a necessidade de recompensa, verificador ou dados de avaliação. Não é mecanismo de cache. [R14] |
| Absolute Zero | Proposição e resolução de tarefas com recompensas verificadas por execução | Interesse para geração de casos de teste em ambiente isolado. Não conceder ao proponente controle do verificador que o aprova. [R15] |
| STaR | Bootstrapping de justificativas acompanhado de ajuste do modelo | Envolve treinamento, não simples memória de conversa. Racionalização correta pela resposta final não garante todo passo correto. [R16] |
| Self-Rewarding LMs | Modelo gerador e juiz num ciclo de preferência | Estudar viés compartilhado e holdout externo. Não permitir autoaprovação de requisitos. [R17] |
| InstructGPT | Demonstrações, modelo de recompensa e otimização de política | Referência de treinamento e avaliação humana; não instalar PPO numa operação local de contexto. [R18] |
| DPO | Otimização de política diretamente por pares de preferência | Não é um classificador determinístico nem evita custo de treinamento e avaliação. [R19] |
| Constitutional AI | Princípios humanos, autocritica e feedback de IA | Os princípios e a governança não surgem sem escolha humana. Não torna guardrails probabilísticos uma autorização. [R20] |
| Let's Verify Step by Step | Supervisão de processo em problemas matemáticos | Resultado situado; não prova eliminação geral de alucinação. Para código, verificar etapas observáveis e efeitos. [R21] |
| Agent Lightning | Separação entre execução de agentes e infraestrutura de treinamento | Rastro versionado e atribuição de recompensa são úteis; nem toda API externa de modelo pode ser treinada pelo usuário. [R22] |
| Graph-Based Agentic AI with LangGraph | Guia/padrões de processos stateful e checkpoints | Não é demonstração de superioridade de performance do LangGraph. Usar somente se a complexidade de fluxo justificar a dependência. [R23] |
| Evaluation-Driven Development and Operations | Modelo de processo e arquitetura orientados por avaliação | O título da versão atual é diferente do fornecido; não demonstra automaticamente treinamento por RL via LangSmith. [R24] |

Manter separados pesos, política, memória, ferramenta e verificador. Cada experimento declara objeto alterado, baseline, versão, orçamento, holdout, critérios não negociáveis, execução, decisão e rollback. Uma tarefa resolvida no replay não é nova tarefa executada; ganho de throughput em kernel não é ganho de tarefa aceita.

O Observatory fornece parte do registro econômico, não um otimizador automático. Nenhuma tarifa, confiança ou economia autoriza promoção de código. Uma política que gasta menos mas quebra requisitos deve perder no critério de aceitação.

## 5. Postman: referência correta e escopo verificado

**arXiv:2502.14820 não é um relatório do Postman.** O registro corresponde a *eC-Tab2Text: Aspect-Based Text Generation from e-Commerce Product Tables*, apresentado na trilha de indústria NAACL 2025. Retirar essa atribuição errada antes de versionar uma bibliografia. [R25]

O material oficial do Postman existe em seu site/blog e aponta para o PDF fornecido. A obtenção direta desse PDF falhou nesta sessão; nenhuma tabela dele foi inspecionada ou reproduzida. A análise usa o artigo oficial acessível, não finge ter conferido o PDF. [R26]

A ideia aproveitável é confrontar o mapa estrutural e operacional com referências e avaliar perguntas sobre um ecossistema de APIs. Dados de runtime, contratos e repositórios têm datas e escopos diferentes; um grafo atualizado numa data não deve ser tratado como snapshot idêntico a um commit anterior.

Para o BBrainX, primeiro medir localização e continuidade em corpus congelado. Comparar toda a operação: consulta ao grafo, chamadas auxiliares, retries, prefill e resposta. Um grafo usado como instrumento de busca não substitui teste de contrato nem a verificação final no arquivo pertinente. A resposta de um juiz de IA também não deve ser rotulada como avaliação puramente determinística.

## 6. Laya, Ollaya e Jev

Não há uma licença técnica para somar todas as alegações de uma página de catálogo e chamar o conjunto de artigo científico. Os títulos “System One/RLCD”, “Nautilus Assay” e “Ollaya” recebidos apontam para a mesma homepage genérica; não os tratamos como três publicações revisadas por pares ou fontes verificadas dos coeficientes citados.

Ollaya é um projeto independente concreto para servir modelos de decisão. O README diferencia execução ONNX CPU/CUDA de GGUF via llama.cpp CPU/CUDA/Metal. Assim, “Ollaya suporta Mac” não prova que todo encoder Laya roda por Metal nesse runtime. Ele documenta manifests/pesos verificados e testes de paridade, mecanismos pertinentes ao futuro worker compartilhado. Não foi instalado. [R27]

Modelos e backends diferentes precisam de igualdade de tokenizer, packing do estado/pergunta, ordem de opções, truncamento, precisão, calibração e versão antes de comparar throughput. Confiança prevista não é decisão de permissão. Rótulos sintéticos não devem entrar na mesma memória que decisões aprovadas de usuário.

O estudo Strata está separado justamente porque trata de serving generativo MoE, enquanto Laya é a camada de decisão opcional. “Cache do agente” pode significar memória persistente, resultado exato, contexto do provider, snapshot de inferência ou pesos quentes: cada objeto exige chave e invalidadores diferentes.

## 7. Referências de observabilidade e estratégia de integração

Langfuse diferencia uso/custo ingerido de inferido e suporta preços por tipo e condição. O ensinamento prioritário é preservar proveniência, data e semântica do contador. Sua infraestrutura completa não é requisito para este painel. Adapters e definição de preços podem ser usados futuramente, respeitando licenças, modo de hospedagem e coleta de dados. [R28]

Helicone mostra agrupamento por propriedades e modelo de integração por proxy/SDK. Seu valor requer que a chamada realmente passe pelo caminho instrumentado; uma mudança de URL não deve ser imposta automaticamente a harnesses existentes. [R29]

LiteLLM oferece rastreamento de custo no proxy; budgets de produto devem ser diferenciados de limites estritos sob concorrência. Phoenix documenta contadores/custos de tracing, mas inferir o custo depende da instrumentação e dos dados disponíveis. Nenhum exporter conhece chamadas que nunca viu. [R30–R31]

Nossa primeira versão exige importação explícita porque o BBrainX atual não controla as chamadas dos clientes aos provedores. A evolução recomendada é exporter opt-in por harness/API que publique somente usage final e identidade não secreta. Não ler conversas em disco por conveniência. Cada retry é um recibo próprio; streaming parcial não vira evento final.

## 8. UI: leveza vem da carga evitada

Blueprint é toolkit de componentes React, não SDK backend de agentes. Pode ajudar quando uma interface densa exige tabelas e controles complexos, mas não há evidência de necessidade para quatro métricas, barras e dezenas de linhas. Não copiamos estilos proprietários do Foundry nem afirmamos que a biblioteca reproduz toda a interface de um produto comercial. [R32]

GPGPU e instancing resolvem classes de renderização com milhares de elementos; este painel não possui essa carga. Scroll artificial cria estado, custo e potenciais problemas de acessibilidade sem benefício demonstrado. FLIP e View Transitions também têm captura/layout inicial e limitações: não são garantias universais de zero reflow/flicker.

A versão entregue usa navegação nativa e troca explícita de dados, sem animação contínua. O modelo de renderização usa apenas estruturas já agregadas e limitadas no backend. Não escaneia SQLite a cada frame. O impacto deve ser medido em estação MEDIUM com IDE, navegador e trabalho real abertos, não apenas numa aba vazia.

## 9. CLI, SDK e MCP: princípios que valem adotar

oclif/Cobra são referências de parsing e organização quando a árvore de comandos justificar a dependência. Clack/Bubble Tea resolvem interação de terminal; não devem acoplar o núcleo à TUI. Octokit e openai-node ilustram clientes modulares e streaming, mas retry implícito exige atenção à idempotência e ao custo. OpenAPI TypeScript gera tipos, não valida a resposta em runtime. O SDK oficial MCP é uma referência de interoperabilidade, não um selo automático de segurança. [R12, R33–R36]

A rodada adiciona CLI pequeno para uso/importação e HTTP read-only; não reescreve o parser inteiro, não adiciona um novo shell ou instala geradores. Tipos de provider, schema de recibo e revisão de normalizador são contratos explícitos. Um formato novo exige fixture documental, testes adversariais, regressões e revisão das fórmulas.

## 10. Próxima rodada de maior retorno

1. Exporter de metadados finais de um cliente real autorizado; demonstrar cobertura sem ler prompts.
2. Dois runs aceitos pareados, mesma configuração controlada, relatórios e custos completos, incluindo chamadas de recuperação.
3. Materialização incremental ou índice de métricas para histórico multiprojeto, com migração/reversão e benchmark independente.
4. Concluir hardening anterior do worker e daemon compartilhado antes de ativar cache entre harnesses.
5. Rastrear uso de energia/pressão no grupo de processos, separado de cobrança de API.
6. Somente depois avaliar maior stack de observabilidade e backend generativo HIGH/PRO.

O sucesso de uma imagem, número alto de testes ou precisão numa fixture não demonstra excelência global. O lançamento deve permitir a outra pessoa reproduzir tarefa aceita, custo observado e interferência limitada na sua própria estação.

# BBrainX × Laya — protocolo X99 de consistência, admissão e desempenho

**Revisão:** 1.0 · **Data:** 5 de outubro de 2026.  
**Base GitHub observada:** `a9636e9402e3fa673ae05b3489202da1048aef5e`.  
**Natureza:** auditoria de protocolo, pesquisa primária, especificação proposta e laboratório verificável.  
**Destino:** macOS primeiro; contratos portáveis para Linux e Windows.  
**Não é:** um novo runtime implantado, benchmark de Laya, certificação de segurança, atualização aplicada ao GitHub ou promessa de ranking.

## 0. Base documental e grau de evidência

O anexo `Texto colado(20261005-124334).txt`, identificado aqui por **A01**, contém o documento “Einsteinian Engine”. Ele é a fonte das afirmações de invocação sub-3 ms, POSIX shared memory, EBR, encoder em O(1), cabeça de segurança calibrada e código Rust completo. O texto e o código foram confrontados entre si. As afirmações não demonstradas não foram promovidas a fatos.

A consulta GitHub confirmou a mesma base usada na auditoria anterior. A leitura focal do broker `src/laya.mjs` continua mostrando transporte por linhas, estado de processo compartilhado e timeout de espera. O patch X99 anterior não deve ser considerado incorporado somente porque existe nesta conversa. Esta entrega não modifica o repositório. [S01][S02]

As referências **S01–S45** apontam para código, documentação oficial ou trabalhos originais. Um README de branch é evidência do conteúdo consultado, não garantia de versão futura. A leitura de uma documentação não equivale à execução da aplicação. As propostas abaixo são decisões de projeto desta revisão, não configurações nativas reconhecidas pelos cinco produtos.

O laboratório desta entrega executou **35 testes**, sem falhas, usando Python 3.13.5, SQLite e processos independentes em Linux. Inclui enumeração de estados, transações reais, interrupção de processos antes/depois de COMMIT e contraprovas algébricas. Não executa o Rust inseguro; não substitui inferência por um modelo fictício; não faz chamadas a provedores. O relatório identifica seus limites. Os 43 testes da revisão anterior são outra evidência e não são somados a estes.

# 1. Parecer sobre o protocolo anexado

**Não incorporar o Rust de A01 ao caminho de produção.** A proposta mistura fila de eventos, memória canônica, cache de decisões, autorização, inferência e telemetria, atribuindo a primitivas locais garantias que elas não estabelecem.

Isso não elimina a direção de produto: uma autoridade compartilhada de contexto é pertinente. O que precisa ser substituído é o mecanismo que deveria torná-la correta. Reduzir cópias de bytes só tem valor depois de definir quais bytes são válidos, quem pode lê-los, a qual versão pertencem e qual efeito foi efetivamente confirmado.

## 1.1. Registro de falhas verificáveis em A01

| ID | Local no anexo | Problema | Consequência | Tratamento |
|---|---|---|---|---|
| A-01 | Manifesto | E=mc² é usado como equação de latência, sem unidades ou modelo experimental | Otimização não falsificável | Usar decomposição de custo, complexidade e carga |
| A-02 | Encoder O(1) | Uma passagem não é custo constante em tamanho do input | SLO inviável quando a sequência cresce | Modelar tokens, camadas, largura e atenção |
| A-03 | `create_or_attach` | Caminho `/dev/shm` via arquivo regular, não `shm_open` | Implementação Linux específica | Port do SO; IPC documentado por plataforma |
| A-04 | Inicialização | `create(true)` sem criação exclusiva/estado de prontidão | Dois criadores podem inicializar a mesma região | Um dono, geração, lock de criação e validação de ABI |
| A-05 | `set_len` | Redimensiona também no attach | Participante pode invalidar mapeamento de outro | Attach nunca altera tamanho; versões incompatíveis falham |
| A-06 | Cabeçalho | Magic é publicado antes do resto | Attach pode observar estado parcial | Publicação atômica de estado READY após inicialização |
| A-07 | Arquivo | Sem modo explícito, validação de dono e rejeição de links | Exposição dependente de umask e manipulação de caminho | Diretório privado, modo restrito, criação segura |
| A-08 | `write_state` | `load(tail)` seguido de `store(tail+1)` não reserva posição | Escritas perdidas entre produtores | Fila com algoritmo comprovado ou produtor serial |
| A-09 | `read_latest_state` | Head global destrutivo | Não é memória compartilhada nem broadcast | Estado canônico separado; cursor por assinante |
| A-10 | Máscara do leitor | Item não correspondente bloqueia o head | Starvation/head-of-line blocking | Filas por consumidor ou stream com offsets |
| A-11 | Payload | `payload_size` não é validado antes do slice | Leitura fora do slot sob corrupção | Limites antes de dereference, ABI validado |
| A-12 | Checksum | Soma modular simples, não Adler-32 completo | Colisões triviais por permutação | Checksum correto para corrupção; autenticador para adversário |
| A-13 | Prosa versus código | Leitor não valida checksum nem revalida epoch | Garantia anunciada não implementada | Contrato e teste precisam corresponder ao código |
| A-14 | EBR | Máscara e contador não são usados como pins/retire lists | Nenhuma prova de reclamation | Remover alegação; escolher SMR validado se necessário |
| A-15 | `unsafe impl Sync` | Compartilha operações não atômicas sem protocolo suficiente | Corridas de dados | Não expor API segura sobre invariantes não garantidas |
| A-16 | Cache vetorial | Match antecede checagens de segurança/escopo | Reutilização indevida de capacidade | Autorização independente antes e depois da seleção |
| A-17 | Alimentação do cache | `add_capability` não é chamado no runtime mostrado | Caminho rápido não é alcançado no fluxo fornecido | Mostrar ingestão, chave e invalidadores reais |
| A-18 | Quantização | Dimensão/tamanho/NaN não validados | Panic ou vetores silenciosamente inconsistentes | Verificação explícita e espaço vetorial versionado |
| A-19 | Similaridade | Sinal de cada coordenada tratado como equivalência | Falso match mesmo com Hamming zero | Candidato aproximado seguido de verificação; nunca autorização |
| A-20 | Nome TensorRT | Provider registrado é CUDA | Backend diferente do anunciado | Inspecionar providers efetivos e grafo delegado |
| A-21 | Exportação ONNX | Presume `safety_logit`, logits e inputs específicos | Contrato pode não existir no modelo | Validar nomes, shapes, dtypes, tokenizer e revisão |
| A-22 | Probabilidades | Sem validação de tamanho, finitude e cardinalidade | Panic ou decisão degenerada | Schema numérico e abstenção |
| A-23 | Platt | Constantes sem dataset, fitting ou holdout fornecido | Confiança não demonstrada | Calibração registrada por workload/checkpoint |
| A-24 | Zero-copy | `copy_nonoverlapping`, `to_vec`, ndarray, exps e JSON alocam/copiam | Design não é end-to-end zero-copy | Medir cada fronteira e reduzir somente cópias relevantes |
| A-25 | Afinidade | API Linux e fixação no core 0, retorno ignorado | Falha de portabilidade e possível contenção | Sem pinning padrão; perfil por hardware |
| A-26 | Resultado | SUCCESS significa escrita na fila, não execução confirmada | Falso estado de conclusão | Estados accepted/started/completed distintos |
| A-27 | System 2 | Fallback retorna uma string | Nenhum handoff efetivo demonstrado | Contrato de encaminhamento, não rótulo de execução |
| A-28 | Mascote | Latência padrão 1,2 ms sem conexão com dados | Número ilustrativo parece telemetria | Identificar demo; usar eventos reais quando existirem |

As falhas de reserva de slot sobrevivem mesmo sob consistência sequencial. Trocar todos os orderings por `SeqCst` não faz um par load/store virar uma reserva exclusiva. A documentação de circular buffers do kernel trata explicitamente a disciplina produtor/consumidor; múltiplos produtores precisam de sincronização adicional. [S27]

## 1.2. Contraprova de concorrência

O enumerador executável considera dois produtores com três passos ordenados: ler tail, escrever slot, publicar tail. Existem 20 intercalações possíveis. Em 18, a contagem final ou a preservação dos dois itens falha. Uma testemunha:

```text
P0 lê tail = 0
P0 escreve slot 0
P1 lê tail = 0
P0 publica tail = 1
P1 sobrescreve slot 0
P1 publica tail = 1
```

Dois escritores completaram, mas só um item permanece. **18/20 não é uma probabilidade operacional de falha**: interleavings não têm pesos iguais no scheduler real. É uma contraprova suficiente contra a afirmação de correção concorrente.

O modelo serializado alternativo tem uma transição atômica por enqueue e não perde itens nos dois ordenamentos possíveis. Isso especifica a propriedade desejada; não implementa por si só um algoritmo MPMC lock-free.

## 1.3. Contraprovas de checksum e similaridade

A soma do anexo produz 196 para `ab` e `ba`. Adler-32 verdadeiro produz 19.267.780 e 19.333.316, respectivamente, pois mantém dois acumuladores. Mesmo um Adler-32 correto detecta corrupção acidental; não fornece autenticidade contra um escritor malicioso. [S30]

Para 512 coordenadas, considere um vetor com 1000 na posição 0 e 1 nas demais; outro com 1000 na posição 1 e 1 nas demais. Seus sinais são idênticos: Hamming zero. O cosseno é aproximadamente **0,002508718**. Isso não prova que um embedding treinado específico falhará; prova que o filtro de sinais, sem hipóteses adicionais, não certifica equivalência.

# 2. Modelo de custo utilizável

Um encoder com k camadas, comprimento L e largura d não tem custo O(1) no input. Uma aproximação de computação densa é:

\[
C_{encoder}=\Theta\big(k(Ld^2+L^2d)\big)
\]

A implementação e o padrão de atenção podem alterar parcelas e constantes. Uma janela máxima fixa estabelece um limite operacional, mas não autoriza ignorar a variação até esse limite. Ler B bytes já exige trabalho proporcional a B. Quantização muda largura numérica, memória e kernels; não transforma automaticamente atenção quadrática em constante.

A latência relevante é:

\[
T_{e2e}=T_{admissao}+T_{auth}+T_{fila}+T_{parse}+T_{retrieval}
+T_{inferencia}+T_{validacao}+T_{commit}+T_{transporte}
\]

Uma operação pode não usar todas as parcelas. A instrumentação deve registrar as presentes, não subtrair fases para melhorar o número anunciado. Um microbenchmark de lookup em RAM não é benchmark de contexto recuperado de disco, autorização distribuída ou tarefa de programação aceita.

Shared memory pode reduzir cópias IPC entre processos cooperantes. Não muda o fato de que o harness/API precisa fornecer ao modelo os tokens utilizados. JSON-RPC via stdio e uma UI de navegador não passam a mapear uma região nativa só porque o servidor adotou `mmap`. A interoperabilidade exige adapters reais, não alteração invisível de todos os clientes.

Para um serviço com fração f acelerável em fator s, o limite de Amdahl é `1 / ((1-f)+f/s)`. Se IPC representa 4% e fica quatro vezes mais rápido, o ganho máximo total nesse modelo é cerca de 3,09%, antes de custos adicionados. Não é sensato assumir risco de corrupção de memória para um ganho não medido dessa ordem.

# 3. Topologia proposta: autoridade única, execução isolada, dados imutáveis

No perfil local, manter um coordenador por usuário com autoridade sobre projetos registrados. O domínio continua modular; os cinco produtos estudados não viram cinco serviços obrigatórios no notebook.

```text
Harness MCP/CLI/UI
   → limite de frame e autenticação local
   → admissão ponderada e autorização por projeto
   → catálogo/versões/memória/checkpoints no coordenador
   → recuperação de conteúdo imutável
   → decisão Laya opcional em worker residente
   → revalidação e publicação transacional
   → resposta com evidências e revisão
```

Separar três planos:

| Plano | Responsabilidade | Regra de falha |
|---|---|---|
| Controle | Identidade, autorização, políticas, reservas, revisões e publicação | Falhar fechado para autorização e escritas críticas |
| Dados | Blobs, índices, mapas de símbolos e resultados derivados | Reconstruir ou devolver indisponibilidade; nunca inventar evidência |
| Observabilidade | Métricas, traces e diagnóstico | Degradar sem bloquear o núcleo; auditoria crítica tem canal durável próprio |

O worker Laya não recebe credenciais de provedores, não aprova memória e não controla a ACL. O serviço de segredos injeta credenciais somente na fronteira explicitamente autorizada. Executores com shell são outra identidade/processo e continuam fora do papel de “memória”.

A primeira implantação mantém SQLite como autoridade local. Um serviço remoto multiusuário posterior pode usar outro store sob contrato equivalente. Não sincronizar o banco vivo por pasta compartilhada. A migração multi-host introduz autenticação, consenso de versões e reconciliação, não apenas um novo URL.

# 4. SuperTokens: separar validação criptográfica de autorização vigente

## 4.1. O que foi verificado

O Core consultado é Java. A documentação afirma que a verificação padrão de sessão é stateless: valida o token, sem consultar se a sessão continua no banco. Para revogação imediatamente observável, fornece verificação autoritativa por `checkDatabase`. Isso adiciona uma requisição ao Core, e a seleção das rotas deve considerar sensibilidade, inclusive leituras confidenciais. Não há base para a garantia genérica “cada chamada sub-milissegundo”. [S03][S04][S06]

## 4.2. Aplicação ao BBrainX

Criar dois contratos internos diferentes:

**AuthenticationResult:** principal, emissor, validade, credencial/algoritmo verificado e âmbito máximo. Pode reaproveitar material criptográfico público válido, como JWKS, respeitando seu contrato.

**AuthorizationResult:** ação permitida agora sobre projeto, workspace e recurso, vinculada à revisão da política e às condições pertinentes. Um token válido não implica que a autorização esteja atualizada.

A chave lógica de autorização não inclui o segredo bearer em claro. Inclui identidade autenticada, ação, recurso, revisão/época de autorização e condições relevantes. Um hash de credencial não a torna pública; também é dado sensível operacional.

## 4.3. Semântica rigorosa de revogação

Definir `R` como o commit autoritativo da revogação. Uma liberação de resultado cujo ponto de autorização lineariza depois de R deve falhar. Bytes emitidos antes de R não podem ser recolhidos. Um processo pode conhecer o token sem estar autorizado a novos acessos.

Cada resposta possui um ponto final de revalidação imediatamente antes de entrar na fronteira de liberação controlada. Itens em filas internas que ainda não cruzaram essa fronteira podem ser descartados. O contrato não promete que nenhuma leitura de rede acontecerá fisicamente depois de R: um pacote já emitido pode chegar mais tarde.

No perfil local, revisão e publicação são serializáveis pelo coordenador. No distribuído, uma garantia estrita exige consulta/lease com semântica de frescor definida. Uma réplica isolada não pode inventar que continua atual. Para ações sensíveis, indisponibilidade da autoridade resulta em recusa, não em stale-while-revalidate de permissão.

O trabalho Zanzibar é pertinente pela associação entre mudanças de ACL, conteúdo e ordem causal. Não copiamos sua escala nem prometemos seu SLO; aproveitamos o princípio de vincular a decisão à versão observada. [S31]

## 4.4. Reconexão, WebSocket e suspensão

Autenticar o handshake não autoriza indefinidamente cada mensagem posterior. Conexões longas precisam de expiração/revalidação e resposta à revogação; a documentação SuperTokens trata esse caso separadamente. [S05]

Ao retomar o Mac de suspensão, invalidar leases locais cuja validade não possa ser demonstrada, reconciliar revisões e não aceitar relógio de parede atrasado como extensão da sessão. Identificadores de processo devem ter geração/boot ID: reutilização de PID não significa identidade preservada.

# 5. Infisical: retirar segredos do contexto e tornar rotação um protocolo

## 5.1. Capacidades e limites documentados

Infisical Agent renova credenciais, escreve sinks/templates e mantém caches sob políticas próprias. O cache persistente documentado tem escopo Kubernetes; não equivale a um agente macOS pronto com as mesmas capacidades. Templates têm comportamento de atualização configurável, inclusive polling. Isso não confirma invalidação instantânea via WebSocket/gRPC nem uma propriedade geral zero-knowledge. [S07]

Agent Vault é uma descoberta relevante para agentes: usa proxy para substituir placeholders por credenciais na saída. O README explicita MITM, pass-through padrão para hosts não correspondidos e necessidade de isolar o processo que detém segredos. No perfil proposto, hosts não permitidos devem ser recusados explicitamente; preservar o default de passagem deixaria uma via de egress não governada. Ele não deve ser instalado alterando proxies e certificados dos harnesses sem decisão explícita. [S08]

## 5.2. Contrato de segredo proposto

O contexto contém somente um identificador opaco de integração autorizada, não o valor do segredo. A resolução acontece no egress broker, depois de validar principal, projeto, destino, operação e revisão do grant.

Uma entrada do broker precisa distinguir `secret_id`, `secret_version`, `key_id`, validade, escopo e política de uso. O cache de conteúdo ou Laya nunca inclui o plaintext. Um resultado de autorização também não pode carregar a credencial “por conveniência”.

No Mac local, Keychain ou mecanismo do sistema é a integração inicial a construir e validar. Infisical entra no perfil de equipe/infraestrutura, não como pré-requisito para indexar código sem rede.

## 5.3. Rotação sem avalanche

A rotação publica evento com identidade, versão e política, não chave bruta. Consumidores registram monotonicamente a última versão aceita e ignoram eventos atrasados. Uma lacuna na sequência dispara reconciliação. Eventos duplicados são idempotentes. Uma fila não pode acumular indefinidamente uma versão por rotação: coalescer para “reconciliar recurso X”, preservando revogações.

Evitar empurrar centenas de cópias de plaintext. Preferir invalidar referências e fazer leitura lazy autorizada, com single-flight para miss. Para destinos que realmente precisam receber o segredo, usar um worker específico com confirmação, retry limitado, versão esperada e canal autenticado.

A latência do evento é uma otimização. A correção não depende de todos os consumidores receberem o evento antes de uma nova chamada. O broker verifica a versão necessária na fronteira de uso.

## 5.4. Criptografia: otimizar a fronteira, não inventar a primitiva

Usar AEAD de biblioteca mantida. Dados adicionais autenticados devem vincular projeto, identificador, versão e finalidade do objeto. Nonces e limites do algoritmo pertencem ao contrato da chave. libsodium documenta XChaCha20-Poly1305 com nonce estendido e autenticação de dados adicionais; isso não justifica implementar um “AES vetorial próprio” nesta aplicação. [S45]

Envelope encryption separa DEK e KEK. Trocar a KEK pode permitir rewrap das DEKs sem recifrar cada payload; comprometimento de DEK requer tratamento diferente, incluindo recifragem do conteúdo afetado. Criptografia em repouso não elimina plaintext durante uso legítimo, nem torna revogáveis cópias já extraídas.

Não prometer zeroização garantida de strings JavaScript. O runtime, logs, buffers e bibliotecas podem manter cópias. Minimizar lifetime, impedir dumps no perfil apropriado, não usar variáveis de ambiente como armazenamento permanente e medir egress são controles concretos. “Zero-knowledge cache invalidation” não descreve esses mecanismos com rigor.


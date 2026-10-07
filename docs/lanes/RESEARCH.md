# Pesquisa aplicada: execução paralela, isolamento e runtimes

Consulta: 7 de outubro de 2026. O material enviado propõe seis projetos como solução para processos e portas concorrentes. Esta revisão distingue a proposta recebida, o que os projetos documentam e a aplicação sugerida para o BBrainX. Não instalamos esses runtimes nem reproduzimos seus benchmarks. Estrelas e nacionalidade não são critérios técnicos de isolamento.

## 1. Dify Sandbox — útil para código limitado, não estação inteira

O README atual exige Linux, libseccomp e dependências de compilação. No arquivo `internal/core/lib/python/add_seccomp.go` examinado, a sequência inclui chroot/chdir, `SetNoNewPrivs`, construção da allowlist de syscalls, seccomp, remoção de grupos suplementares e troca de GID/UID. Syscalls de rede entram quando `enable_network` está habilitado. [S01–S02]

Isso sustenta confinamento por syscalls e filesystem no caminho analisado; não demonstra namespace de rede individual para cada chamada nem suporte universal a servidores arbitrários Python/Node/Shell. Um container com vários trabalhos continua tendo recursos compartilhados conforme a configuração. Não transplantar “nenhuma porta ou zombie vaza” como garantia implícita.

**Técnica a aproveitar:** sequência fail-closed de preparação, allowlist mínima, recursos delimitados e recusa quando o isolamento solicitado não foi estabelecido. Em macOS, seccomp Linux pede uma VM/runtime Linux; não há syscall equivalente obtida pela mera compilação do programa Go.

**Aplicação proposta:** adapter de execução de snippets num perfil separado, com linguagem e versão fixadas, timeout, cota de saída, permissões de arquivo e egress declarados. Servidor persistente de desenvolvimento pertence a outro contrato de lifecycle. Instalar a sandbox não autoriza montar o home, o socket Docker ou as credenciais do host.

## 2. Sealos — Devbox e quotas, com restrição de licença relevante

Sealos documenta ambientes e serviços sobre Kubernetes. O isolamento deriva de namespaces, identidade, quotas, volumes, políticas e runtime configurados; não é consequência de nomear duas sessões como Devbox. Instalar um cluster e sua plataforma completa numa estação de 16 GiB introduz um orçamento operacional que precisa ser medido antes de recomendar. [S03]

O README consultado declara **Sealos Sustainable Use License**, não uma licença open source padrão. Ele permite usos descritos nos termos e restringe oferecer serviços de nuvem a terceiros. Portanto, não tratamos o código como componente MIT livre para embutir no futuro BBrainX Cloud. O enquadramento de um uso concreto exige revisão dos termos; não foi feita análise jurídica de distribuição. [S04]

**Técnica a aproveitar:** workspace declarativo com limites e identidade de recurso; provisionamento e remoção rastreáveis. **Perfil proposto:** clusters de equipe ou máquinas remotas aprovadas, não dependência padrão MEDIUM. Conteúdo enviado à devbox remota exige autorização de egress e seleção explícita, não “sincronizar tudo”.

## 3. Nocalhost — sincronização muda a noção de snapshot

O projeto documenta extensão de IDE, Kubernetes, DevSpaces e sincronização de arquivos sem rebuild completo. O guia demonstra um forward local `39080:9080` e informa que o processo principal deve ser iniciado para atender requisições. São responsabilidades separadas. [S05–S06]

Um pod isolado não cria automaticamente um namespace para a porta no desktop. Dois forwards que tentam o mesmo bind local ainda podem disputar o recurso. A solução precisa distinguir a porta interna remota e o endpoint local efetivamente aberto.

**Insight principal:** um arquivo salvo localmente e um arquivo sincronizado no container podem pertencer a gerações diferentes. O runner deve confirmar manifesto/snapshot remoto antes de executar o teste. Um resultado de teste do commit anterior não pode ser publicado como evidência da alteração que ainda estava em trânsito.

**Aplicação proposta:** adapter de workspace remoto com protocolo de sincronização, confirmação da versão e origem da evidência. Hoje o BBrainX lanes usa disco local; não afirma que o resultado de `index` representa o filesystem de um container ou de um editor com buffer não salvo.

## 4. frp — roteamento é uma camada posterior ao bind correto

frp é um proxy reverso, com autenticação, transportes e extensibilidade. Sua documentação de server plugins define callbacks para login, abertura/fechamento de proxy e conexões, permitindo rejeitar ou modificar operações. Há também aviso de que callbacks para grandes quantidades de proxies podem afetar disponibilidade. [S07–S08]

Isso é útil para um gateway que autoriza rotas por projeto e geração. Não transforma um processo que já tentou ocupar `localhost:3000` num processo isolado. A origem precisa existir num endpoint válido antes de ser roteada.

**Aplicação implementada nesta rodada:** o servidor Node mantém o socket escolhido por port 0 e registra seu endpoint. **Aplicação futura do frp:** publicar aquele endpoint somente após consentimento do host e política de exposição, nunca por metadado de ferramenta enviado pelo modelo. Fechamento remove a rota pela geração exata, sem derrubar a de outra feature.

TLS, autenticação do túnel e autorização da aplicação são controles diferentes. Uma rota com TLS pode expor um dashboard sem autenticação ao público. A nossa implementação não configura frpc/frps, não abre listener remoto e não troca o Host/Origin esperado para acomodar um proxy silenciosamente. Headers e origens do serviço precisam de um contrato separado antes de expô-lo.

## 5. werf — declaratividade e relatórios, não teardown atômico universal

`werf dismiss` apaga uma release Helm e opcionalmente seu namespace. A referência também oferece identificar o alvo a partir do deploy report, sem depender do diretório Git atual, e políticas de limpeza de caches por utilização e margem. [S09]

**Insight aproveitável:** persistir a identidade concreta dos recursos criados, em vez de reconstruir nomes a partir do cwd quando chega a hora de remover. Geração, namespace, IDs do runtime e manifestos tornam cleanup idempotente e verificável.

A afirmação recebida de limpeza atômica de todos os containers/processos/portas não é sustentada por essa referência. Deleção no Kubernetes, finalizers, volumes, porta encaminhada no cliente e processos locais não compartilham uma única transação. Uma interrupção requer reconciliação. Não anunciar `closed` apenas porque o comando de remoção foi enviado.

**Aplicação proposta:** `ExecutionManifest` versionado mais `CleanupReceipt` por recurso, com estados observado/removido/desconhecido. A lane atual registra serviços e gerações, mas não executa um reconciliador distribuído. Runtimes futuros não devem usar TTL como prova de morte de processo nem PID isolado como prova de ownership.

## 6. KubeSphere — isolamento explícito e dependente do CNI

KubeSphere oferece isolamento de rede por workspace/projeto e gerenciamento de políticas. A documentação também exige um plugin de rede capaz de aplicar NetworkPolicy. No Kubernetes, namespaces por si só não são uma firewall. As políticas de ingress/egress e sua implementação precisam ser verificadas no cluster. [S10–S12]

**Aplicação proposta:** `RuntimePort` de equipe com namespace por execução ou domínio de confiança, quotas, ServiceAccount mínima, egress controlado, sem hostNetwork/hostPath/socket do host por padrão. Testar DNS, API server, metadata de nuvem, rede local e portas de serviços antes de anunciar isolamento. Filtrar tráfego por IP/porta não oferece controle semântico de operações HTTP ou redaction de segredos.

Não definimos KubeSphere como execução leve local para todos. O benefício está na operação compartilhada onde o control plane já se justifica. O usuário MEDIUM não deve pagar por um microcluster para que dois clientes usem memória comum.

## 7. Alternativas e competidores de implementação

### Apple Container / Containerization

A Apple descreve uma VM Linux leve por container, usando Virtualization.framework e imagens OCI. O projeto `apple/container` consultado exige Apple Silicon e tem macOS 26 como ambiente suportado. Não suporta automaticamente todo Mac Intel ou uma versão anterior do sistema; instalar pode pedir autorização administrativa. [S13–S14]

Esse é um caminho promissor para `RuntimePort` no Mac compatível, com identidade de VM, limites e mounts explícitos. Mas duas VMs ainda consomem RAM e CPU junto das IDEs. A proposta é medir warm/cold start, I/O de dependências, rede e pressão total. Nenhuma VM foi iniciada nesta rodada.

### Docker/OCI

A documentação de publicação de portas distingue endereços específicos do host de exposição mais ampla. A versão/runtime e o modo de rede importam. Um Dockerfile não garante que a aplicação escute só em loopback; uma publicação sem endereço restrito pode ficar acessível fora da máquina. [S15]

O contrato de adapter deve incluir image digest, arquitetura, UID, capacidades, readonly root, volumes privados, limite de PIDs/memória/CPU e política de rede. Não montar o Docker socket no agente. Não fabricar uma lista de pacotes instalados para a aplicação sem validar seu build real. Não baixar imagens ou aceitar scripts de devcontainer só por ler o repositório.

### Coder envbuilder

O envbuilder constrói ambientes a partir de Dockerfile/devcontainer em Docker, Kubernetes e OpenShift. Seu cache de camadas pode reduzir reconstrução, mas executar um Dockerfile ou init script continua execução de código do projeto. [S16]

Oportunidade: ambiente declarado e chave de cache por dependências/arquitetura/imagem, não cópia de um diretório mutável `node_modules` entre lanes. Conservar armazenamento comum de artefatos imutáveis é distinto de dividir runtime mutável com vários escritores.

### Gestores de worktrees para agentes

`agenttools/worktree` integra worktrees, contexto de issues e Claude Code. Esses projetos já atendem ao ciclo de abrir uma frente de trabalho. Não alegamos invenção de executar agentes em worktrees. [S17]

O diferencial a medir no BBrainX é manter memória aprovada única, índice correto por workspace e checkpoints com CAS e proveniência, preservando a identidade de qualquer cliente suportado. O wrapper de sessão sozinho não fornece essa consistência e também não garante isolamento hostil.

### Comparação justa

Um provedor de sandbox com rede bloqueada oferece proteção diferente da lane cooperativa local. Um gestor de worktree oferece fluxo de Git diferente de um engine de memória. Comparar pelo rótulo genérico “multiagente” ocultaria as obrigações de cada camada. A avaliação deve separar bootstrap, recuperação, execução, persistência, rede, teardown e integração.

## 8. Novos conceitos propostos para a próxima rodada

**Interface-aware scheduling.** A compatibilidade de duas tarefas deve considerar contratos que modificam, não apenas caminhos de arquivo. Um grafo de dependências entre mudanças pode priorizar a integração e a bateria de testes necessária. Classificação por Laya pode sugerir relações; só evidências e revisão autorizam alterações de invariantes.

**Versioned service directory.** Não propagar portas como constantes em prompts. O cliente resolve um serviço por projeto/lane/generation e recebe um endpoint com evidência de bind. Mudança de serviço invalida a resolução. Saúde HTTP não prova identidade, e um PID não é token de controle.

**Sandbox-independent memory authority.** A sandbox só recebe uma interface com escopo; não um volume montado contendo todas as memórias e credenciais. O produto local atual opera sob confiança do usuário do SO; um adapter remoto/multiusuário precisa de autenticação própria antes de reaproveitar essa arquitetura.

**Artifact-first shared acceleration.** Compartilhar parses/embeddings/arquivos imutáveis por conteúdo pode poupar trabalho entre worktrees. Entretanto, acesso e validade continuam no contexto da lane; código igual não concede permissão global. Antes de implementar, medir duplicação real do índice versus custo de gestão de um CAS de artefatos.

**Graceful degradation, never permission degradation.** Se faltarem recursos, reduzir tarefas de fundo ou recusar uma nova frente. Não desativar verificador, isolamento ou aprovação para manter throughput. Se o runtime seguro solicitado está indisponível, não executar o mesmo código sem sandbox por fallback implícito.

## 9. O que não foi demonstrado

Não houve instalação Dify/Sealos/Nocalhost/frp/werf/KubeSphere, benchmark comparativo de runtimes, inferência Laya, nova homologação de versões de harness ou ganho de tarefa aceita. As técnicas e oportunidades acima são estudo de fontes primárias e propostas. A feature implementada e testada separadamente é a lane local cooperativa e o helper Node de portas possuídas.

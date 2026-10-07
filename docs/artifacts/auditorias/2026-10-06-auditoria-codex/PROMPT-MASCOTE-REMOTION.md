# Prompt de produção — mascote original BBrainX

Prompt autoral; o vídeo e a integração desktop não foram produzidos nesta auditoria. Referências/licenças e gates estão no dossiê e em sections/mascote-remotion.md.


Você é um designer de personagem e engenheiro de motion para o BBrainX. Crie um mascote ORIGINAL em React + SVG procedural no projeto Remotion existente, com poses legíveis, animações determinísticas e custo pequeno. Entregue o código/atlas revisável e os arquivos de vídeo/PNG especificados abaixo, executando a produção solicitada com as dependências já disponíveis. Não transforme a criação visual em instalação de desktop, alteração de hooks, configuração de harness, aprovação de memória ou publicação.

### Contexto do produto

BBrainX prepara contexto de repositório, checkpoints versionados e memórias propostas/aprovadas. O núcleo atual é local e determinístico, com seis ferramentas MCP. Não é gateway, executor de shell ou agente autônomo. Um checkpoint salvo não significa testes executados, entrega aprovada ou publicação. O personagem comunica estados observáveis e limites com honestidade.

Trabalhe no `media/` existente de `/Users/alexandrebelo/Projetos/BBrainX/repo`. Leia package.json, lockfile, entrypoint e `docs/BRAND.md` antes de escolher API. Preserve versões, filme e logo existentes. Não adicione dependência, pacote de partículas, fonte baixada, modelo, screenshot remoto, biblioteca de personagem ou serviço generativo. Se uma dependência necessária já instalada estiver ausente, declare o bloqueio concreto em vez de deixar npx instalar silenciosamente. Para implementação no repositório, siga seu fluxo Issue/branch/PR; não publique nem faça merge por conta própria.

### Direção artística original

O mascote é um pequeno cientista editorial e amistoso. A inspiração é apenas o arquétipo de curiosidade científica e cabelos brancos desalinhados associados a Einstein: não faça retrato, caricatura fiel, assinatura, citação ou identidade de pessoa real. Use cabeça oval assimétrica, nariz curto simples, óculos de duas lentes geométricas diferentes, ombros definidos e pequeno casaco grafite com gola verde suave. De seis a oito mechas brancas irregulares, de alturas e inclinações distintas, criam uma silhueta reconhecível em 32 px. O cabelo é o principal sinal de identidade; não depende de detalhes faciais minúsculos.

Nada de cérebro exposto, mascote genérico em forma de squircle, blob creme com olhos sobre esfera, olhos de coração/espiral, ingestão de arquivos, roulades, slap/dizzy, guarda-roupa ou coreografia de notch. Não utilize nomes, ícones, sons, paths, proporções, paleta do personagem, expressões ou animações reservadas do Coucou/Mochi. Não copie o código do desenho para depois só mudar cabelo/cor. Crie geometria, rig e timing novos desde a primeira linha. Se alguma técnica de código MIT for reutilizada, limite-a a mecanismo genérico, preserve atribuição/licença e não transporte arte ou coreografia.

Paleta autoral alinhada ao BBrainX existente: grafite `#0A141A`, cabelo `#F3F6F5`, sombra do cabelo `#CDD7D3`, verde suave `#B6EFB9`, aqua `#63D5B9`, cinza `#9BB2BC`. Para alertas use acento âmbar `#D7A65A` e contorno coral `#D8877E`, sempre com forma/ícone/rótulo além da cor. Essas cores de alerta são proposta visual, não mudança do design system do núcleo. Contorno grafite fino mantém cabelo branco visível sobre fundo claro. O casaco tem contraste suficiente sobre fundo escuro. Nada de glow, blur pesado, shader, 3D, WebGL, textura ou sombras grandes.

O monograma BX existente continua sendo a marca. O personagem não substitui icon.svg/wordmark.svg, não inventa logo definitivo e não usa logos de Claude, Codex, Antigravity ou outros fornecedores. Nome exibido apenas “BBrainX”; não batize uma nova marca/personagem sem decisão do founder.

### Rig e função pura

Separe desenho e relógio de render:

1. `MascotSvg({pose, size, idPrefix})`: componente React puro que desenha SVG, sem hook Remotion, timers, rede ou side effects.
2. `sampleMascotPose({frame, fps, state, seed, reducedMotion})`: função pura que retorna a pose completa de um frame. Use tipos explícitos e objetos pequenos; não crie framework de plugins.
3. Composição Remotion obtém `useCurrentFrame()`/`useVideoConfig()` e passa frame/fps à função pura. Um futuro frontend comum poderá fornecer seu próprio frame sem montar Remotion Player no desktop.

Use SVG viewBox 0 0 256 256; até 45 elementos, grupos semânticos de cabelo, cabeça, óculos/olhos, casaco, mãos e objeto de estado. Margem segura de 18 px incluindo mechas/gestos; pivôs de grupo explícitos. Desenhe com paths/ellipses/linhas novas. Nada de imagens externas, raster embutido, fontes dentro do mascote ou filtro SVG. Os rótulos da prancha podem usar fontes de sistema, sem distribuí-las.

Toda animação deriva do frame. Proibidos Date.now, performance.now, Math.random, setTimeout/setInterval, requestAnimationFrame, CSS animation/transition e SMIL dentro do rig/composições. Se precisar de variedade, use `random('bbrainx-mascot-v1-'+parte)` do Remotion ou constantes fixas; seed entra nos props e no manifesto. Nenhuma geração de ids aleatórios ou mutação compartilhada entre renders. Renderizar frame 37 isolado deve produzir a mesma pose que chegar a 37 após todos os frames anteriores, no mesmo ambiente.

Use transformação/opacity/interpolate/spring analíticos, com clamps. Para laços use fase periódica: frame/fps e duração fixa; posição e velocidade devem continuar no rollover. Para confirmação/alerta use movimento curto de entrada e hold; não reexecute ação semântica a cada loop. Reduced motion entrega pose estática legível com o mesmo rótulo, sem blink ou pulso. Não desenhe progresso numerado sem dado real.

### Oito estados obrigatórios

Implemente o union exato:

`idle | indexing | searching | context_ready | checkpoint_saved | review_needed | conflict | degraded`

Use estes desenhos originais e significados:

- **idle / Em repouso:** rosto neutro receptivo, braços repousados e cabelo estático. Na demonstração, apenas uma microinclinação suave opcional; em runtime idle, pose estática por padrão. Não sugira daemon watcher ativo.
- **indexing / Indexando fontes:** organiza duas pequenas fichas geométricas junto ao casaco; mãos alternam movimento curto lateral, sem arquivo sendo engolido. Fichas permanecem dentro da margem. Pode repetir movimento de trabalho; não há barra percentual inventada.
- **searching / Buscando contexto:** olha um pequeno cartão com lupa esquemática; lente percorre uma faixa curta do cartão. Olhos são simples, sem projeção esférica; não implica inferência por Laya.
- **context_ready / Contexto preparado:** apresenta três fichas numeradas por formas/pontos e abre uma mão em gesto de “aqui estão as fontes”. Entrada única e hold. Não use cadeado ou selo de verdade: hash não autentica conteúdo como instrução.
- **checkpoint_saved / Checkpoint salvo:** fecha um pequeno caderno e repousa a mão na capa; selo simples de duas linhas representando histórico, sem troféu/check de tarefa concluída. Entrada única e hold. A legenda deve dizer que é registro salvo, não aceite.
- **review_needed / Revisão necessária:** segura prancheta com linha tracejada e aponta discretamente para a área em aberto. Sobrancelha atenta; nenhuma cobrança, urgência falsa ou pressão emocional. Não há botão automático de aprovação.
- **conflict / Conflito de estado:** duas fichas divergem em posições laterais, ligadas por conector interrompido; personagem segura ambas e faz gesto calmo de pausa. Entrada breve e depois pose fixa. Nunca tenta unir fichas/celebrar sozinho, nunca auto-retry/overwrite. Rótulo/código visível fora do SVG na prancha.
- **degraded / Recurso indisponível:** um pequeno conector aberto no cartão, olhar neutro e mão indicando caminho alternativo. Pose estática após entrada; nada de desmaio, falha dramática ou flashing. A legenda identifica o recurso específico. Se só Laya falhou, não insinuar que busca lexical/store inteiro estão indisponíveis.

Estes são estados de apresentação, não novos enums persistidos. Documente um `state-map.md` com os gatilhos reais: início/fim de context.index/search, envelope ok de bootstrap, commit/checkpoint.created, status review_needed, propostas pendentes, envelopes VERSION_CONFLICT/SNAPSHOT_CONFLICT/IDEMPOTENCY_CONFLICT e erros TIMEOUT/EXECUTION_FAILED/recurso opcional. Um erro de domínio pode vir como ok:false num resultado cujo invocation.completed foi emitido; faça o mapeamento pelo outcome, não pelo nome de evento isolado. Não pinte “sucesso” antes de resultado confirmado.

No showcase, todas as entradas são fixtures públicas rotuladas “Demonstração visual”. Não leia banco real, roots cadastradas, prompts privados, telemetria ou credenciais para obter um estado de exemplo. Não exponha caminhos de home/usuário. Não inferir estado de frases do agente nem de sentimento do modelo.

### Composições e sequência

Crie oito composições de 256×256, fps 24, duração 96 frames (4 s), fundo alpha verdadeiro e sem áudio. Idle/indexing/searching podem ser laços visuais; os demais executam entrada em até 12 frames e seguram a pose restante. `loop` no manifesto deve refletir isso; nenhuma loop de confirmação será usada como se novos checkpoints estivessem sendo gravados.

Crie `BBrainXMascotAtlas`: prancha 1280×720 com oito estados, nomes técnicos pequenos, rótulos em pt-BR e indicadores formais; fundo grafite. Não pode haver checkbox de “tarefa concluída”. Crie também prancha de fundo claro para checar contraste.

Crie `BBrainXMascotShowcase`: 1280×720, fps 24, 528 frames (22 s). Intro 24 frames, oito estados de 60 frames cada, fechamento 24 frames. O personagem ocupa área proporcional, com legenda curta e evento sintético legível. Sem screenshots de outras aplicações, logos de terceiros, claims de custo/CPU/aceite/privacidade ou voz clonada. Fechamento: “Estados claros. Evidências preservadas.” e “Demonstração visual — integração desktop em etapa separada”. Sem sons de Coucou, música remota ou áudio automático.

Preserve o filme existente. Organize arquivos em `media/src/mascot/`, `media/props/mascot/` e saída autorizada em `media/out/mascot/`; conecte compositions de modo mínimo no entrypoint existente. Não refatore partes adjacentes.

### Artefatos de entrega e transparência

Entregue:

- Componentes TSX/JSX no estilo existente, função de pose e tipos/props documentados.
- Oito SVGs estáticos originais, um por estado, mais um SVG neutro pequeno para idle.
- Atlas PNG em fundo escuro/claro e oito PNGs RGBA transparentes de 256×256.
- Sequências PNG com alpha como master de cada estado, após renderização; manifesto JSON com compositionId, fps, frameCount, loop, seed, dimensions, arquivos e hashes calculados após produzir arquivos.
- WebM alpha VP9 como derivado pequeno; imagem PNG intermediária e pixel format yuva420p. Testar alpha sobre duas cores reais, não desenhar checkerboard no vídeo.
- Showcase MP4 H.264 **opaco**, com fundo grafite, para reprodução simples. Não descrever MP4 H.264 como transparente.
- ProRes 4444 alpha apenas se houver necessidade editorial explícita: MOV, pixel format yuva444p10le, intermediários PNG. É master maior, não asset de runtime desktop padrão.
- `README-mascot.md`, `state-map.md`, `asset-manifest.json` e `ORIGINALITY.md`, distinguindo desenho original, referências genéricas e mecanismos eventualmente atribuídos. Liste exatamente comandos executados, ambientes e verificações; campos não medidos ficam “não medido”.

Antes de executar qualquer comando, use os bins locais já existentes. Exemplos de receitas para composições registradas, a adaptar aos nomes/path reais, sem permitir instalação implícita:

```sh
npx --no-install remotion render src/index.jsx BBrainXMascotIdle out/mascot/idle.webm --codec=vp9 --pixel-format=yuva420p --image-format=png --concurrency=1 --overwrite=false
npx --no-install remotion render src/index.jsx BBrainXMascotIdle out/mascot/idle-frames --sequence --image-format=png --concurrency=1 --overwrite=false
npx --no-install remotion render src/index.jsx BBrainXMascotShowcase out/mascot/showcase.mp4 --codec=h264 --concurrency=1 --overwrite=false
```

Verifique as flags na versão instalada. Se output/entrypoint diferir, corrija o comando explicitamente; não execute estes exemplos às cegas. WebM alpha tem suporte variável de browser/WebView: forneça SVG/PNG fallback e reporte matriz **realmente testada**, sem certificação genérica de macOS/Windows/Safari. Codec disponível no render não prova suporte do consumidor.

### Orçamento de render e futuro runtime

Nesta criação, não há API/modelo por frame, downloader de assets, GPU necessária, serviço de cloud render ou geração de voz. Render inicial tem concurrency 1. Revise os stills antes de gerar sequências e showcase. Não renderize em 4K/60/120 fps nem gere dezenas de variantes não pedidas. Arquivos grandes só se justificam pelo master editorial.

O rig deve permitir runtime leve separado:

- Oculto/fora da viewport ou app inativo: nenhuma animação contínua, nenhum polling de cursor e nenhum timer cosmético; cancelar o scheduler. Eventos funcionais podem atualizar o estado sem desenhar frames invisíveis.
- Visível em idle: SVG estático cacheado. Acordar só por evento/entrada; não manter vídeo/player decodificando em loop.
- Visível e trabalhando: limitar animação a 24 fps, com tamanho lógico típico 64–120 px. Um único scheduler do host por tela, nunca um timer por mecha, olho ou mascote.
- Conflito/degraded/review: pose estática após entrada curta; estado claro sem piscar continuamente. Prioridade a conflito/degraded pertinentes à tarefa, sem esconder uma pendência por retorno de um idle cosmético.
- `prefers-reduced-motion`: nenhuma animação autônoma; ícone/rótulo permanece. Não roubar foco, emitir som ou exigir clicar no mascote para ler a pendência.

Como metas **a medir**, custo incremental do mascote oculto próximo ao baseline (sem wakeups cosméticos), idle visível ≤0,5% de um núcleo e RAM incremental ≤20 MiB sobre o host sem mascote. São limites de projeto, não resultados. Se não houver app funcional para medir, registre “runtime/CPU não medidos” e entregue apenas código/artefatos. Não compare CPU de vídeo offline com CPU de overlay vivo.

### Fronteira de integração funcional

Este trabalho não cria app NSPanel/Tauri/Electron, socket, pipe, autostart, permissão Accessibility, hook de Claude/Codex/Antigravity, API de aprovação ou watcher. Um render convincente não prova nenhum desses mecanismos. Entregue somente o contrato futuro do adaptador, separado dos assets:

```json
{
  "schemaVersion": 1,
  "project": "demo-publico",
  "task": "T-demo",
  "requestId": "req-demo-1",
  "sequence": 7,
  "state": "conflict",
  "reasonCode": "VERSION_CONFLICT",
  "source": "domain-outcome",
  "observedAt": "2026-10-06T00:00:00.000Z",
  "demo": true
}
```

Esse JSON é proposta, não endpoint existente. O adaptador real deve vir do host autorizado, limitar projeto, validar schema e ordem, deduplicar eventos, separar requests concorrentes e não aceitar texto recuperado como comando. Estados são projeções de fatos, nunca autorização. Os relógios reais do adaptador não entram na função pura de render; converta evento para props/frame antes de desenhar. Nenhum estado aprova memória, muda allowlist, escreve checkpoint ou executa shell. Uma ação futura “Abrir revisão” deve levar à superfície responsável; desenho de botão não implementa aprovação humana.

### Critério de pronto proporcional

Primeiro mostre atlas e estrutura de arquivos; prove que as oito composições existem e mapeiam os oito estados pedidos. Verifique mechas/mãos sem clipping, contraste em claro/escuro e legibilidade em 32/64/120 px. Verifique alpha por inspeção sobre fundo sólido claro e escuro; checkerboard deve ser apenas visualização, não pixels embutidos.

No mesmo ambiente, compare render isolado de frame 37 com o frame 37 da sequência e registre igualdade do PNG/hash; isso testa dependência de frame, não equivalência universal entre OS/fonts/Chromium. Para laços, compare pose amostrada em frame 0 e N e inspecione a passagem N−1→0; para entrada/hold confirme estabilidade final. Reduced motion deve permanecer estático. Não invente métricas se esses checks não forem executados.

Se houver render autorizado, confira duração/dimensões/fps/codecs e alpha reais nos arquivos, valide reprodução nos consumidores disponíveis e liste os não testados. Se houver só arte/código, declare a etapa render ainda pendente. Não execute suíte de produto, modelos ou testes de integração desktop para uma mudança visual reversível sem justificativa; use validação visual/render relevante e preserve os checks obrigatórios do repositório.

O resultado final deve distinguir: desenho/código criado; atlas/renders realmente produzidos; vídeo demonstrativo; runtime desktop não construído. Não diga “mascote integrado”, “CPU zero”, “compatível com todos os harnesses” ou “aprovações funcionando” apenas por ter um clipe.

### Se Remotion não estiver disponível e OpenMontage for escolhido explicitamente

Mantenha este mesmo brief de originalidade, rig procedural, oito estados e limites. Use render_runtime Remotion explicitamente, pois o pipeline character-animation pode escolher HyperFrames/GSAP. Não instale a stack completa, configure API keys ou habilite provedores cloud automaticamente. Registre a licença AGPLv3 do OpenMontage e a licença própria Remotion. Não misture código de orquestração AGPL ao núcleo BBrainX sem decisão apropriada. Arte original e outputs são artefatos separados; nenhuma escolha de engine implanta IPC desktop.

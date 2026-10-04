# Identidade provisória

A marca em uso desde 4 de outubro de 2026 é o **monograma BX**: o B em duas camadas, que lê como duas memórias empilhadas, ao lado do X de continuidade entre ferramentas. Sem cérebro literal, bolha de chat ou marcas de fornecedores. A escolha foi do dono do projeto e é provisória.

Assets originais: `public/brand/icon.svg` e `public/brand/wordmark.svg`. Construção geométrica, sem filtros, em uma cor. O SVG usa fontes do sistema; arquivos de fontes não são distribuídos. A marca final ainda requer revisão de lettering e validação apropriada.

A interface usa grafite, texto claro e verde suave. Estados possuem rótulos e padrões além da cor. Componentes opcionais têm conexões tracejadas. O percurso é explicativo, não uma falsa execução de agentes.

LOGO-DESIGN-SKILL orientou o processo de simplificação e legibilidade. Sua biblioteca de logos não foi copiada. O vídeo Remotion apresenta continuidade, arquitetura e contribuição sem alegar performance não medida.

A assinatura discreta por AB aponta para o site do criador. A direção visual não representa teste com usuários ou avaliação jurídica de marca.

## As três opções em estudo

<p align="center"><img src="../public/brand/options/opcoes.gif" width="480" alt="As três opções de marca alternando: A, duas camadas; B, facetada; C, monograma BX, em uso"/></p>

Três alternativas originais estão em `public/brand/options/`, cada uma um SVG de uma cor com menos de 300 bytes:

- `a-duas-camadas.svg`: o B formado por duas camadas arredondadas.
- `b-facetado.svg`: o mesmo B com cantos chanfrados, mais técnico.
- `c-monograma-bx.svg`: B e X lado a lado. **Em uso.**

`opcoes.gif` alterna as três e marca a que está em uso; `comparativo.png` mostra as três em fundo escuro e em uma cor. As outras duas continuam no repositório até a decisão final, que pede teste em 16 px e com usuários. Nenhuma é parecer de marca registrada.

## Para trocar a marca em uso

O desenho está copiado em quatro lugares, e os quatro mudam juntos:

1. `public/brand/icon.svg` (ícone da aba do painel).
2. `public/brand/wordmark.svg` (cabeçalho do README).
3. `Mark` em `web/main.jsx`, com o tamanho em `.brand svg` de `web/style.css`.
4. `Mark` em `media/src/index.jsx` (filme).

Depois, mude `IN_USE` em `scripts/brand-gif.mjs` e gere o GIF de novo com `node scripts/brand-gif.mjs`. O script usa o Chromium do Playwright e o `ffmpeg` do sistema; é manual, a CI não roda. As capturas de tela e o filme em `public/demo/` são refeitos pela CI a cada revisão em `main`.

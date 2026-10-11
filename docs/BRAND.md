# Identidade BBrainX

Desde 10 de outubro de 2026 a marca oficial é o **monograma BBX** com o wordmark "BBrain**X**", escolhida pelo dono do
projeto. Fontes originais (arquivo mestre do projeto, fora do repositório): `icon.svg` (64 px), `favicon.svg` (16 px) e `Wordmark-press.svg`.
São desenhos em curvas: nenhum arquivo de fonte é distribuído. Não é parecer de marca registrada.

Revisão de 2026-10-10, sem redesenhar contornos:

| Arquivo | Ajuste |
|---|---|
| `icon.svg` | quadro 0–64 dentro do canvas; glifo centrado (margens 7/4 → 5,5/5,5); 15 → 8 paths |
| `favicon.svg` (16 e 32 px) | quadro 0–16; glifo centrado; sem o espigão entre B e X; peso uniforme (traço 0,18); 15 → 7 paths |
| `wordmark.svg` | 20 → 12 paths, mesmo desenho |

## Paleta

| Uso | Cor |
|---|---|
| Fundo do ícone e do wordmark | `#0C171D` / `#0B151B` |
| Glifo BBX e o X do wordmark | `#B6EFB9` |
| Texto "BBrain" | `#E7EEEC` |
| "GODMODCODE" | `#9BB2BA` |
| Tagline | `#F1952A` |

## Onde a marca aparece

| Superfície | Arquivo | Formato |
|---|---|---|
| README (cabeçalho) | `public/brand/wordmark.svg` | wordmark oficial |
| Aba do navegador (Workbench, Observatory) | `public/brand/favicon.svg` + `icon-32.png` | SVG com PNG de reserva |
| Atlas (também no deploy estático sem `public/`) | `atlas.html` | PNG 32 px inline |
| Cabeçalho do painel (Workbench, Atlas, Observatory) | `web/brand-glyph.js`; inline no Observatory | glifo em `currentColor` |
| Handshake MCP (`serverInfo.icons`, título `BBrainX · <projeto>`) | `src/brand.mjs` lê `public/brand/icon-32.png` e `icon-128.png` | PNG em data URI, só em `initialize`/`server/discover` |
| Extensão VS Code: Activity Bar / lista de extensões | `extensions/vscode/media/icon.svg` / `icon.png` | máscara do glifo / PNG 128 px |

VS Code 1.141 e Antigravity 2.5.5 descartam ícone MCP em SVG; por isso o handshake usa PNG.

## Para mudar a marca

1. Substitua `public/brand/icon.svg`, `favicon.svg` e `wordmark.svg` pelos novos originais.
2. Rode `node scripts/brand-rasterize.mjs`: gera os PNGs, o ícone e a máscara da extensão, `web/brand-glyph.js`, o ícone
   inline do `atlas.html` e o glifo do cabeçalho do Observatory, com o Chromium fixado pelo Playwright do lockfile
   (saída idêntica byte a byte entre execuções).
3. `test/brand-icons.test.mjs` e `test/extension.test.mjs` reprovam se alguma superfície ficar diferente do ícone oficial.

## Oportunidades

- Favicon próprio para 16 px (só o X, ou "BX" na grade de pixels).
- Wordmark sem fundo, para fundo escuro e para fundo claro; versão compacta (glifo + "BBrainX") abaixo de 360 px.
- Um só tom de fundo (`#0C171D` e `#0B151B` hoje).
- VS Code: ícone por ferramenta MCP (`Tool.icons`) e ícone na barra de status.
- Filme Remotion (`media/src/index.jsx`) com a marca atual.

## Histórico

De 4 a 10 de outubro de 2026 a marca provisória foi o monograma "BX" (opção C). As três opções estudadas continuam em
`public/brand/options/` (`opcoes.gif`, `comparativo.png`) como registro. LOGO-DESIGN-SKILL orientou o processo de
simplificação e legibilidade; sua biblioteca não foi copiada. A assinatura discreta por AB aponta para o site do criador.

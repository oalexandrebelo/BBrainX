// Deriva os ícones de uso a partir dos SVGs oficiais, com o Chromium fixado pelo Playwright do lockfile.
// uso: node scripts/brand-rasterize.mjs  →  public/brand/icon-32.png e icon-128.png (painel e handshake MCP),
// extensions/vscode/media/icon.png (lista de extensões), extensions/vscode/media/icon.svg (máscara da Activity Bar)
// e web/brand-glyph.js (marca do cabeçalho do painel).
// IDEs derivadas do VS Code só aceitam ícone MCP e de extensão em raster; o SVG continua servindo o painel.
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const JOBS = [
  { svg: 'public/brand/favicon.svg', png: 'public/brand/icon-32.png', size: 32 },
  { svg: 'public/brand/icon.svg', png: 'public/brand/icon-128.png', size: 128 }
];
const GLYPH_FILL = '#B6EFB9';

// A Activity Bar pinta o ícone como máscara monocromática: só o glifo, sem o fundo, sem repetições.
const glyph = [...new Set([...fs.readFileSync('public/brand/icon.svg', 'utf8').matchAll(/<path\s+d="([^"]+)"\s+fill="([^"]+)"/g)]
  .filter(([, , fill]) => fill.toUpperCase() === GLYPH_FILL).map(([, d]) => d))];
if (glyph.length === 0) throw new Error('BRAND_GLYPH_NOT_FOUND');
let glyphBox;

const browser = await chromium.launch();
try {
  const measure = await browser.newPage();
  try {
    // O viewBox acompanha a caixa real do glifo, com 1 unidade de margem, para ocupar o quadro de 24 px da Activity Bar.
    glyphBox = await measure.evaluate(paths => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');document.body.append(svg);
      const boxes = paths.map(d => { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); svg.append(p); return p.getBBox(); });
      const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
      return { x, y, width: Math.max(...boxes.map(b => b.x + b.width)) - x, height: Math.max(...boxes.map(b => b.y + b.height)) - y };
    }, glyph);
  } finally { await measure.close(); }
  for (const { svg, png, size } of JOBS) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    try {
      const source = 'data:image/svg+xml;base64,' + fs.readFileSync(svg).toString('base64');
      await page.setContent('<style>html,body{margin:0;background:transparent}img{display:block}</style><img width="' + size + '" height="' + size + '" alt="">');
      await page.locator('img').evaluate((img, src) => new Promise((resolve, reject) => {
        img.onload = resolve; img.onerror = () => reject(new Error('SVG_DECODE_FAILED')); img.src = src;
      }), source);
      fs.writeFileSync(png, await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size }, omitBackground: true }));
      console.log(png, fs.statSync(png).size, 'bytes');
    } finally { await page.close(); }
  }
} finally { await browser.close(); }

// O ícone de extensão do VS Code precisa ser PNG de pelo menos 128 px.
fs.copyFileSync('public/brand/icon-128.png', 'extensions/vscode/media/icon.png');
const round = value => Math.round(value * 100) / 100;
const viewBox = [glyphBox.x - 1, glyphBox.y - 1, glyphBox.width + 2, glyphBox.height + 2].map(round).join(' ');
fs.writeFileSync('extensions/vscode/media/icon.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + viewBox + '" fill="currentColor">' +
  glyph.map(d => '<path d="' + d + '"/>').join('') + '</svg>\n');
console.log('extensions/vscode/media/icon.png and icon.svg (' + glyph.length + ' paths)');
// O painel (Workbench e Atlas) importa o mesmo glifo; o Observatory, HTML estático, o traz inline e o teste confere a igualdade.
fs.writeFileSync('web/brand-glyph.js', '// Gerado por scripts/brand-rasterize.mjs a partir de public/brand/icon.svg. Não edite à mão.\nexport const BRAND_GLYPH = Object.freeze({ viewBox: ' +
  JSON.stringify(viewBox) + ', paths: Object.freeze(' + JSON.stringify(glyph) + ') });\n');
// Superfícies sem build que carregam a marca inline: o Atlas (publicado sem public/) e o cabeçalho do Observatory.
const icon32 = 'data:image/png;base64,' + fs.readFileSync('public/brand/icon-32.png').toString('base64');
function inline(file, pattern, replacement) {
  const before = fs.readFileSync(file, 'utf8'), found = before.match(new RegExp(pattern.source, 'g')) || [];
  if (found.length !== 1) throw new Error('BRAND_INLINE_TARGET ' + file + ': ' + found.length);
  fs.writeFileSync(file, before.replace(pattern, replacement));
}
inline('atlas.html', /<link rel="icon" type="image\/png" sizes="32x32" href="data:image\/png;base64,[A-Za-z0-9+/=]+"/,
  () => '<link rel="icon" type="image/png" sizes="32x32" href="' + icon32 + '"');
inline('public/observatory/index.html', /(<a class="brand"[^>]*><svg viewBox=")[^"]*("[^>]*>)(?:<path d="[^"]*"\/>)+(<\/svg>)/,
  (match, open, attributes, close) => open + viewBox + attributes + glyph.map(d => '<path d="' + d + '"/>').join('') + close);
console.log('atlas.html and public/observatory/index.html (inline icon and header glyph)');

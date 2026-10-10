import fs from 'node:fs';

// Ícone do servidor MCP (spec 2025-11-25, Implementation.icons): os PNGs de public/brand, gerados por scripts/brand-rasterize.mjs.
// Só raster, porque IDEs derivadas do VS Code descartam SVG; em data: URI, porque servidor stdio não tem origem HTTP.
// Ficam fora do código-fonte para não poluir o índice lexical do próprio repositório.
const png = (file, sizes) => {
  try {
    const bytes = fs.readFileSync(new URL('../public/brand/' + file, import.meta.url));
    return Object.freeze({ src: 'data:image/png;base64,' + bytes.toString('base64'), mimeType: 'image/png', sizes: Object.freeze([sizes]) });
  } catch { return null; } // Apresentação é opcional: sem o arquivo, o servidor sobe sem ícone.
};
export const MCP_ICONS = Object.freeze([png('icon-32.png', '32x32'), png('icon-128.png', '128x128')].filter(Boolean));

/** Apresentação do servidor no handshake MCP: título por projeto e, quando disponível, o ícone raster. */
export function serverBrand(project) {
  return { title: 'BBrainX · ' + project, ...(MCP_ICONS.length ? { icons: MCP_ICONS } : {}) };
}

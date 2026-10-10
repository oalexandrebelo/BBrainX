import fs from 'node:fs';

// BBrainX's own mark, bundled locally. Clients may ignore optional MCP presentation fields.
const icon=fs.readFileSync(new URL('../public/brand/icon.svg',import.meta.url));
export function serverBrand(project){return {title:'BBrainX · '+project,icons:[{src:'data:image/svg+xml;base64,'+icon.toString('base64'),mimeType:'image/svg+xml',sizes:['any']}]};}

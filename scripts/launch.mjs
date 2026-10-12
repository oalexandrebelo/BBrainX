import { panelCommand } from './panel.mjs';
try { await panelCommand(['open',...process.argv.slice(2)]); }
catch { console.error('PANEL_START_FAILED: confira Node, dependências e build. Nenhuma instalação automática foi feita.');process.exitCode=1; }

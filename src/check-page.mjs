/** Página do manual integrador (bbx ch). Sem build e sem dependências; todo dado do servidor entra como texto, nunca como HTML. */
export const CHECK_PAGE = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Manual integrador BBrainX</title>
<style nonce="__NONCE__">
:root{--bg:#f6f7f9;--panel:#fff;--line:#dfe3ea;--ink:#0e1116;--soft:#5b6472;--brand:#065CFB;--ok:#1a7f4b;--warn:#a46a00;--bad:#c62828;--manual:#065CFB;--add:#e7f6ec;--del:#fdecec;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0e1116;--panel:#161b22;--line:#2a313c;--ink:#f2f4f7;--soft:#9aa4b2;--brand:#4d8dff;--ok:#4cc38a;--warn:#e3c35a;--bad:#ff8a80;--manual:#7aa7ff;--add:#12301f;--del:#3a1717;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
header{position:sticky;top:0;z-index:2;background:var(--panel);border-bottom:1px solid var(--line);padding:12px 16px}
.wrap{max-width:980px;margin:0 auto}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
h1{font-size:18px;margin:0 8px 0 0}h2{font-size:15px;margin:0}.muted{color:var(--soft)}.small{font-size:13px}
.chip{border:1px solid var(--line);border-radius:999px;padding:2px 10px;font-size:13px;white-space:nowrap}
button{font:inherit;min-height:36px;padding:6px 14px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--ink);cursor:pointer}
button.primary{background:var(--brand);border-color:var(--brand);color:#fff;font-weight:600}button:disabled{opacity:.5;cursor:default}
main{padding:16px}section.group{background:var(--panel);border:1px solid var(--line);border-radius:12px;margin:0 0 14px;overflow:hidden}
.group-head{padding:12px 16px;border-bottom:1px solid var(--line)}.group-head code{font-size:12px;overflow-wrap:anywhere}
.item{display:grid;grid-template-columns:22px 1fr;gap:4px 10px;padding:10px 16px;border-top:1px solid var(--line)}.item:first-of-type{border-top:0}
.mark{font-weight:700;text-align:center}.s-ok{color:var(--ok)}.s-warn{color:var(--warn)}.s-fail{color:var(--bad)}.s-manual{color:var(--manual)}
.item .actions{grid-column:2;display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}.item details{grid-column:2}
.item summary{cursor:pointer;color:var(--brand);font-size:13px}.guide{margin:6px 0 0;padding:8px 10px;border-left:3px solid var(--brand);background:var(--bg);border-radius:4px}
.empty{padding:10px 16px}dialog{max-width:min(900px,96vw);width:100%;border:1px solid var(--line);border-radius:12px;background:var(--panel);color:var(--ink);padding:0}
dialog::backdrop{background:#0008}.dialog-body{padding:16px;max-height:70vh;overflow:auto}.dialog-foot{padding:12px 16px;border-top:1px solid var(--line);display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
pre.diff{margin:6px 0 14px;padding:8px;border:1px solid var(--line);border-radius:8px;overflow:auto;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace}
.d-add{background:var(--add);display:block}.d-del{background:var(--del);display:block}.d-note{color:var(--soft);display:block;font-style:italic}.d-same{display:block}
#status{min-height:1.5em}footer{max-width:980px;margin:0 auto;padding:0 16px 32px}
@media (max-width:600px){header{padding:10px 12px}main{padding:12px}.item{padding:10px 12px}}
</style>
</head>
<body>
<header><div class="wrap">
  <div class="row"><h1>Manual integrador</h1><span id="version" class="muted small"></span></div>
  <div class="row" style="margin-top:6px">
    <span id="sum-ok" class="chip s-ok">… ok</span><span id="sum-warn" class="chip s-warn">… a atualizar</span>
    <span id="sum-fail" class="chip s-fail">… bloqueados</span><span id="sum-manual" class="chip s-manual">… passos seus</span>
    <label class="small"><input type="checkbox" id="only" checked> só o que precisa de atenção</label>
    <span style="flex:1"></span><button id="refresh">Conferir de novo</button><button id="close">Fechar</button>
  </div>
  <p id="status" class="small muted" role="status" aria-live="polite"></p>
</div></header>
<main><div class="wrap" id="groups"><p class="muted">Conferindo…</p></div></main>
<footer class="small muted">
  <p><strong>Como funciona.</strong> Ações que só leem rodam no clique. Ações que gravam mostram antes exatamente o que muda e só executam no segundo clique; se algo mudar entre ver e aplicar, a aplicação é recusada. Toda gravação de configuração deixa um recibo com <em>Desfazer</em>.</p>
  <p><strong>Senhas.</strong> Este manual nunca pede, vê ou guarda senha. Login de conta abre o fluxo oficial da própria CLI (Claude Code, Codex) no Terminal, no navegador do serviço.</p>
  <p><button id="unhide">Mostrar ocultos</button></p>
  <p><strong>O que só você decide.</strong> Aprovar os servidores do projeto no Claude Code, confiar no projeto no Codex, permitir acesso a Downloads no macOS e colar a configuração do Antigravity. O manual leva você até o lugar certo com o comando pronto.</p>
</footer>
<dialog id="preview" aria-labelledby="preview-title">
  <div class="dialog-body"><h2 id="preview-title">O que muda</h2><div id="preview-content"></div></div>
  <div class="dialog-foot"><button id="preview-cancel">Cancelar</button><button id="preview-apply" class="primary">Aplicar</button></div>
</dialog>
<script nonce="__NONCE__">
(() => {
  const key = 'bbx-ch-token';
  let token = location.hash.slice(1);
  try { if (token) { sessionStorage.setItem(key, token); history.replaceState(null, '', location.pathname); } else token = sessionStorage.getItem(key) || ''; } catch { /* sem armazenamento: o token fica só na memória */ }
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const status = text => { $('status').textContent = text || ''; };
  async function api(path, body) {
    const res = await fetch(path, { method: body ? 'POST' : 'GET', headers: { 'x-bbx-token': token, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || ('HTTP ' + res.status));
    return data;
  }
  const MARK = { ok: '✔', warn: '!', fail: '✖', manual: '→' };
  // Preferência só deste navegador (ex.: "não uso o Antigravity"); sem armazenamento, nada some.
  const hiddenTags = () => { try { return JSON.parse(localStorage.getItem('bbx-ch-hidden') || '[]'); } catch { return []; } };
  const hideTag = tag => { try { localStorage.setItem('bbx-ch-hidden', JSON.stringify([...new Set([...hiddenTags(), tag])])); } catch { /* sem armazenamento */ } };
  let report = null;
  function render() {
    if (!report) return;
    $('version').textContent = 'BBrainX ' + report.version + ' · conferido ' + new Date(report.generatedAt).toLocaleTimeString('pt-BR');
    const s = report.summary;
    $('sum-ok').textContent = s.ok + ' ok'; $('sum-warn').textContent = s.warn + ' a atualizar'; $('sum-fail').textContent = s.fail + ' bloqueado(s)'; $('sum-manual').textContent = s.manual + ' passo(s) seu(s)';
    const only = $('only').checked, out = [], hidden = hiddenTags();
    for (const group of report.groups) {
      const items = group.items.filter(i => (!only || i.status !== 'ok') && !(i.tag && hidden.includes(i.tag)));
      const section = el('section', 'group'), head = el('div', 'group-head');
      head.append(el('h2', null, group.title));
      if (group.subtitle) { const code = el('code', 'muted'); code.textContent = group.subtitle; head.append(code); }
      section.append(head);
      if (!items.length) section.append(el('p', 'empty s-ok', '✔ Tudo em dia.'));
      for (const item of items) section.append(renderItem(item));
      out.push(section);
    }
    $('groups').replaceChildren(...out);
  }
  function renderItem(item) {
    const row = el('div', 'item'), mark = el('span', 'mark s-' + item.status, MARK[item.status]);
    mark.setAttribute('aria-label', item.status);
    const text = el('div'); text.append(el('strong', null, item.title), document.createTextNode(' — ' + item.detail));
    row.append(mark, text);
    if (item.guide) { const d = el('details'), sum = el('summary', null, 'Como fazer'); d.append(sum, el('p', 'guide', item.guide)); if (item.status !== 'ok') d.open = item.status === 'manual' || item.status === 'fail'; row.append(d); }
    if (item.actions?.length) {
      const actions = el('div', 'actions');
      for (const action of item.actions) {
        const button = el('button', action.kind === 'write' ? 'primary' : null, action.label);
        button.addEventListener('click', () => act(action, button));
        actions.append(button);
      }
      row.append(actions);
    }
    return row;
  }
  async function act(action, button) {
    button.disabled = true;
    try {
      if (action.kind === 'copy') { await navigator.clipboard.writeText(action.text); status('Copiado para a área de transferência.'); }
      else if (action.kind === 'hide') { hideTag(action.tag); render(); status('Ocultado neste navegador. Para ver de novo: "mostrar ocultos" no rodapé.'); }
      else if (action.kind === 'write') await preview(action.id, action.params || {});
      else { const r = await api('/api/run', { action: action.id, params: action.params || {} });
        status(r.opened ? 'Abri ' + r.opened + (r.command ? ' com: ' + r.command : '') + '.' : r.command ? 'Não encontrei um terminal; rode: ' + r.command : 'Feito.'); }
    } catch (e) { status('Não deu: ' + e.message); }
    finally { button.disabled = false; }
  }
  let pending = null;
  async function preview(action, params) {
    status('Montando a prévia…');
    const p = await api('/api/preview', { action, params });
    pending = { action, params, planId: p.planId };
    const box = $('preview-content'); box.replaceChildren();
    if (p.blocked?.length) { box.append(el('p', 's-fail', 'Bloqueado: ' + p.blocked.map(b => b.client + ' (' + b.reason + ')').join(', ') + '. Resolva antes de aplicar.')); }
    if (!p.changes?.length) box.append(el('p', 'muted', 'Nada a mudar.'));
    for (const change of p.changes || []) {
      box.append(el('p', null, (change.client ? change.client + ': ' : '') + change.target + ' (' + change.status + ')'));
      const pre = el('pre', 'diff');
      for (const line of change.diff || []) pre.append(el('span', line.op === '+' ? 'd-add' : line.op === '-' ? 'd-del' : line.op === 'note' ? 'd-note' : 'd-same', (line.op === 'note' ? '… ' : line.op + ' ') + line.text));
      box.append(pre);
    }
    $('preview-apply').disabled = !!p.blocked?.length || !p.changes?.length;
    status(''); $('preview').showModal();
  }
  $('preview-cancel').addEventListener('click', () => { pending = null; $('preview').close(); });
  $('preview-apply').addEventListener('click', async () => {
    if (!pending) return; $('preview-apply').disabled = true;
    try {
      const r = await api('/api/run', { action: pending.action, params: pending.params, planId: pending.planId });
      $('preview').close();
      status(r.receipt ? 'Aplicado (' + (r.files || []).map(f => f.client + ' ' + f.status).join(', ') + '). Recarregue o MCP nas sessões abertas.' : r.created ? 'Criado: ' + r.created : 'Feito.');
      if (r.receipt) offerUndo(r.receipt);
      await load();
    } catch (e) { status('Não aplicado: ' + e.message); $('preview').close(); }
    finally { pending = null; $('preview-apply').disabled = false; }
  });
  function offerUndo(receipt) {
    const undo = el('button', null, 'Desfazer');
    undo.addEventListener('click', () => preview('rollback', { receipt }));
    $('status').append(document.createTextNode(' '), undo);
  }
  async function load() {
    status('Conferindo…');
    try { report = await api('/api/checks'); render(); status(''); }
    catch (e) { status('Não consegui conferir: ' + e.message); }
  }
  $('only').addEventListener('change', render);
  $('unhide').addEventListener('click', () => { try { localStorage.removeItem('bbx-ch-hidden'); } catch { /* sem armazenamento */ } render(); });
  $('refresh').addEventListener('click', load);
  $('close').addEventListener('click', async () => { try { await api('/api/close', { action: 'close' }); } catch { /* já fechado */ } status('Manual fechado. Rode bbx ch para abrir de novo.'); $('groups').replaceChildren(); });
  if (!token) status('Abra pelo link que o bbx ch imprimiu.'); else load();
})();
</script>
</body>
</html>`;

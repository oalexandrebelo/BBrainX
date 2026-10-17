import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { runChecks, previewAction, runAction } from './check.mjs';
import { CHECK_PAGE } from './check-page.mjs';

/**
 * Página do manual integrador: só em 127.0.0.1, porta livre. O token vai no fragmento do link (#…), que o navegador
 * não envia em pedido nem em Referer; a página o devolve no cabeçalho X-BBX-Token. POST só da própria origem.
 * As ações são as de check.mjs (lista fechada). Desliga sozinho depois de `idleMs` sem pedidos.
 */
const MAX_BODY = 16384;
const same = (a, b) => { const x = Buffer.from(String(a ?? '')), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const send = (res, status, value) => {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-length': Buffer.byteLength(body) });
  res.end(body);
};
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', chunk => { size += chunk.length; if (size > MAX_BODY) { reject(Object.assign(new Error('body'), { status: 413 })); req.destroy(); } else chunks.push(chunk); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(Object.assign(new Error('json'), { status: 400 })); } });
    req.on('error', reject);
  });
}
export async function startCheckServer(store, { port = 0, idleMs = 30 * 60000, token = randomBytes(24).toString('base64url'), onClose } = {}) {
  let timer;
  const server = http.createServer(async (req, res) => {
    clearTimeout(timer); timer = setTimeout(() => close(), idleMs); timer.unref?.();
    try {
      const address = server.address(), origin = 'http://127.0.0.1:' + address.port;
      // Host fixo: um site qualquer não alcança este servidor por DNS rebinding.
      if (req.headers.host !== '127.0.0.1:' + address.port) return send(res, 400, { error: 'HOST_NOT_ALLOWED' });
      const url = new URL(req.url, origin);
      if (req.method === 'GET' && url.pathname === '/') {
        const nonce = randomBytes(16).toString('base64');
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
          'content-security-policy': "default-src 'none'; script-src 'nonce-" + nonce + "'; style-src 'nonce-" + nonce + "'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" });
        return res.end(CHECK_PAGE.replaceAll('__NONCE__', nonce));
      }
      if (!url.pathname.startsWith('/api/')) return send(res, 404, { error: 'NOT_FOUND' });
      if (!same(req.headers['x-bbx-token'], token)) return send(res, 401, { error: 'UNAUTHENTICATED', message: 'Abra o link que o bbx ch imprimiu.' });
      if (req.method === 'GET' && url.pathname === '/api/checks') return send(res, 200, await runChecks(store));
      if (req.method !== 'POST') return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
      if (req.headers.origin !== origin) return send(res, 403, { error: 'FOREIGN_ORIGIN' });
      const body = await readJson(req);
      if (typeof body.action !== 'string' || (body.params !== undefined && (typeof body.params !== 'object' || Array.isArray(body.params)))) return send(res, 400, { error: 'INVALID_REQUEST' });
      if (url.pathname === '/api/preview') return send(res, 200, previewAction(store, body.action, body.params ?? {}));
      if (url.pathname === '/api/run') return send(res, 200, await runAction(store, body.action, body.params ?? {}, { planId: body.planId }));
      if (url.pathname === '/api/close') { send(res, 200, { closing: true }); setTimeout(() => close(), 50); return; }
      return send(res, 404, { error: 'NOT_FOUND' });
    } catch (e) {
      if (e.status) return send(res, e.status, { error: 'INVALID_REQUEST' });
      if (e.name === 'BrainError') return send(res, 409, { error: e.code, message: e.message === e.code ? null : e.message });
      return send(res, 500, { error: 'FAILED', message: 'Erro interno do manual integrador.' });
    }
  });
  server.headersTimeout = 10000; server.requestTimeout = 120000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
  let closed = false;
  const close = () => new Promise(resolve => { if (closed) return resolve(); closed = true; clearTimeout(timer); server.closeAllConnections?.(); server.close(() => { onClose?.(); resolve(); }); });
  timer = setTimeout(() => close(), idleMs); timer.unref?.();
  const actual = server.address().port;
  return { port: actual, token, url: 'http://127.0.0.1:' + actual + '/#' + token, close, closed: () => closed };
}
/** Abre o link no navegador padrão do sistema. */
export function openBrowser(url, { platform = process.platform } = {}) {
  const [cmd, args] = platform === 'darwin' ? ['/usr/bin/open', [url]] : platform === 'win32' ? ['cmd.exe', ['/c', 'start', '""', url.replace(/&/g, '^&')]] : ['xdg-open', [url]];
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' }); child.on('error', () => {}); child.unref();
}

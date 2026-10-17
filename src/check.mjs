import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { parse as parseToml } from 'smol-toml';
import { ensure, identifier } from './primitives.mjs';
import { doctor, stateHome } from './host.mjs';
import { VERSION } from './version.mjs';
import { harnessStatus, launchEnv } from './recruit.mjs';
import { filesRoot } from './files.mjs';
import { clientConfig } from './clients.mjs';
import { planDiff, rollbackIntegration, discoverIntegrations } from './integrations.mjs';
import { planProjectIntegration, applyProjectIntegration } from './control-cli.mjs';
import { controlOverview } from './control.mjs';

/**
 * Manual integrador (`bbx ch`). Cada caso confere uma coisa, diz em português o que falta e oferece ações FECHADAS:
 * leitura roda direto; gravação mostra o plano (diff) e só executa no segundo clique, com o mesmo plano conferido;
 * o que o código não cobre (aprovação no Claude Code, confiança no Codex, Antigravity) vira passo guiado com o comando
 * pronto. Login de conta abre o fluxo oficial da CLI no terminal: este código nunca vê, pede ou guarda senha.
 */
export const STATUSES = Object.freeze(['ok', 'warn', 'fail', 'manual']);
const item = (id, title, status, detail, actions = [], guide) => ({ id, title, status, detail, actions, ...(guide ? { guide } : {}) });
const short = (text, max = 300) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const which = (name, env = process.env) => {
  for (const dir of String(env.PATH || '').split(path.delimiter)) { if (!dir || !path.isAbsolute(dir)) continue; const candidate = path.join(dir, name + (process.platform === 'win32' ? '.cmd' : '')); try { if (fs.statSync(candidate).isFile()) return candidate; } catch { /* próximo */ } }
  return null;
};
const run = (command, args, { cwd, timeout = 15000 } = {}) => {
  const r = spawnSync(command, args, { cwd, encoding: 'utf8', timeout, maxBuffer: 4 * 1048576, windowsHide: true, shell: false, env: launchEnv(process.env), stdio: ['ignore', 'pipe', 'pipe'] });
  return { ok: !r.error && r.status === 0, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error?.code ?? null };
};
const launcherDir = () => path.join(os.homedir(), '.local', 'bin');

// ---------------------------------------------------------------------------------------------- máquina
function machine({ home }) {
  const items = [], report = doctor();
  items.push(item('machine.node', 'Node.js ' + process.versions.node, report.ready ? 'ok' : 'fail',
    report.ready ? 'Node com SQLite e FTS5; BBrainX ' + VERSION + '.' : 'Node abaixo do mínimo ou sem SQLite/FTS5.', [],
    report.ready ? undefined : 'Instale o Node 24 (macOS: brew install node@24; Windows/Linux: nodejs.org) e rode o instalador do BBrainX de novo.'));
  const bbrainx = path.join(launcherDir(), 'bbrainx'), bbx = path.join(launcherDir(), 'bbx');
  const hasLauncher = fs.existsSync(bbrainx);
  items.push(item('machine.bbx', 'Atalho bbx', fs.existsSync(bbx) ? 'ok' : hasLauncher ? 'warn' : 'manual',
    fs.existsSync(bbx) ? bbx + ' → mesmo BBrainX do atalho bbrainx.' : hasLauncher ? 'Falta o atalho curto: hoje só existe ' + bbrainx + '.' : 'Sem atalho do BBrainX em ' + launcherDir() + '.',
    hasLauncher && !fs.existsSync(bbx) ? [{ id: 'shortcut', label: 'Criar atalho bbx', kind: 'write' }] : [],
    hasLauncher ? undefined : 'Rode o INSTALAR.sh do kit (ele cria ~/.local/bin/bbrainx) e depois volte aqui para criar o bbx.'));
  let files; try { files = filesRoot(); } catch (e) { files = { error: e.code }; }
  const exists = files.root && fs.existsSync(files.root);
  items.push(item('machine.files', 'Pasta de necessidades', exists ? 'ok' : 'warn',
    exists ? files.root + ' (busca: projeto "projetos").' : 'Ainda não criada: ' + (files.root ?? files.error) + '. Os modelos gravam entregáveis ali com --files.',
    exists ? [] : [{ id: 'files-setup', label: 'Criar a pasta', kind: 'write' }],
    process.platform === 'darwin' ? 'Na primeira gravação o macOS pode pedir acesso a Downloads para o app que roda o harness (Terminal, VS Code). Recusou sem querer? Ajustes do Sistema → Privacidade e Segurança → Arquivos e Pastas.' : undefined));
  items.push(item('machine.state', 'Estado do BBrainX', 'ok', home));
  return items;
}

// ---------------------------------------------------------------------------------------------- CLIs dos harnesses
function harnesses() {
  const items = [];
  for (const harness of ['claude', 'codex']) {
    const name = harness === 'claude' ? 'Claude Code' : 'Codex';
    let status; try { status = harnessStatus(harness); } catch (e) { status = { installed: false, detail: e.code }; }
    if (!status.installed) { items.push(item('harness.' + harness, name, 'manual', 'CLI não encontrada.', [], harness === 'claude' ? 'Instale o Claude Code (claude.com/claude-code) e volte aqui.' : 'Instale o Codex CLI (npm i -g @openai/codex ou o app Codex) e volte aqui.')); continue; }
    const logged = status.loggedIn === true;
    items.push(item('harness.' + harness, name + ' ' + short(status.version, 60), logged ? 'ok' : 'warn',
      logged ? 'Logado' + (status.identity ? ' (' + short(status.identity, 80) + ')' : '') + '.' : 'Não logado' + (status.detail ? ': ' + short(status.detail, 120) : '') + '.',
      logged ? [] : [{ id: 'terminal', label: 'Entrar (abre o login oficial)', kind: 'open', params: { command: harness + '-login' } }],
      logged ? undefined : 'O login acontece na própria CLI, no navegador do serviço. O manual não vê nem guarda senha.'));
  }
  const code = which('code');
  if (!code) items.push(item('harness.vscode', 'VS Code', 'manual', 'Comando `code` não está no PATH.', [], 'No VS Code: Command Palette → "Shell Command: Install \'code\' command in PATH". Depois volte aqui.'));
  else {
    const list = run(code, ['--list-extensions'], { timeout: 20000 });
    const installed = list.ok && /^bbrainxlocal\.bbrainx-workspace$/m.test(list.stdout);
    items.push(item('harness.vscode', 'VS Code e extensão BBrainX', installed ? 'ok' : 'warn', installed ? 'Extensão bbrainx-workspace instalada.' : 'Extensão BBrainX não instalada (o MCP funciona sem ela; ela mostra as pastas abertas e o ícone).', [],
      installed ? undefined : 'Rode o INSTALAR.sh do kit com --vscode, ou: code --install-extension <kit>/bbrainx-workspace-0.1.3.vsix'));
  }
  return items;
}

// ---------------------------------------------------------------------------------------------- projetos
function runningServers() {
  if (process.platform === 'win32') return null;
  const r = run('/bin/ps', ['-axww', '-o', 'pid=,lstart=,command=']);
  if (!r.ok) return null;
  return r.stdout.split('\n').map(line => /^\s*(\d+)\s+(\w{3} \w{3}\s+\d+ [\d:]+ \d{4})\s+(.*bbrainx\.mjs mcp .*)$/.exec(line)).filter(Boolean)
    .map(([, pid, started, command]) => ({ pid: Number(pid), started: Number.isNaN(Date.parse(started)) ? started : new Date(Date.parse(started)).toLocaleString('pt-BR'), project: /--project (\S+)/.exec(command)?.[1] ?? null, files: /\s--files(\s|$)/.test(command), recruit: /\s--recruit(\s|$)/.test(command) }));
}
function configArgs(root) {
  try { const json = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8')); return json.mcpServers?.bbrainx?.args ?? null; } catch { return null; }
}
function codexTrusted(root) {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  // Só leitura do config.toml (nunca auth.json): o nível de confiança é decisão do usuário dentro do Codex.
  let text;
  try { text = fs.readFileSync(path.join(home, 'config.toml'), 'utf8'); } catch (e) { return e.code === 'ENOENT' ? false : null; } // sem config: nenhum projeto confiável ainda
  try { return parseToml(text).projects?.[root]?.trust_level === 'trusted'; } catch { return null; }
}
const CLIENT_NAMES = { claude: 'Claude Code (.mcp.json)', codex: 'Codex (.codex/config.toml)', vscode: 'VS Code (.vscode/mcp.json)', kilo: 'Kilo (.kilo/kilo.json)', antigravity: 'Antigravity' };
const BLOCK_GUIDE = {
  INTEGRATION_SERVER_COLLISION: 'O arquivo já tem uma entrada "bbrainx" que não foi gravada pelo BBrainX (alguém editou à mão ou outra ferramenta). Para não apagar trabalho alheio, o BBrainX não sobrescreve. Abra o arquivo, apague ou renomeie a entrada "bbrainx" antiga e clique em Conferir de novo.',
  INTEGRATION_MANAGED_BLOCK_INVALID: 'O bloco gerenciado pelo BBrainX foi editado à mão ou contém outro servidor. Abra o arquivo, mova o que for seu para fora dos marcadores BBRAINX e confira de novo.',
  INTEGRATION_CONFIG_INVALID: 'O arquivo de configuração não é JSON/TOML válido. Abra, corrija a sintaxe e confira de novo.'
};
const CONFIG_FILES = { claude: '.mcp.json', codex: path.join('.codex', 'config.toml'), vscode: path.join('.vscode', 'mcp.json'), kilo: path.join('.kilo', 'kilo.json') };
/** Harnesses a conferir: os detectados nesta máquina e também os que já têm config no projeto (CLI fora do PATH não some da checagem). */
function clientsFor(root, detected) {
  return [...new Set([...detected, ...Object.entries(CONFIG_FILES).filter(([, file]) => fs.existsSync(path.join(root, file))).map(([client]) => client)])];
}
function project({ id, root }, { servers, detected }) {
  const items = [];
  if (!fs.existsSync(root)) return [item('project.' + id + '.root', 'Pasta do projeto', 'warn', root + ' não existe mais.', [], 'Se o projeto mudou de lugar, rode `bbrainx integrate --root <novo caminho> --project ' + id + ' --apply` na nova pasta.')];
  let plan;
  const clients = clientsFor(root, detected);
  if (!clients.length) return [item('project.' + id + '.clients', 'Harnesses', 'manual', 'Nenhum harness detectado neste computador e nenhuma configuração no projeto.', [], 'Instale o Claude Code, o Codex ou o VS Code e confira de novo.')];
  try { plan = planProjectIntegration({ root, project: id, clients: clients.join(',') }).plan; }
  catch (e) { return [item('project.' + id + '.plan', 'Configurações', 'fail', 'Não foi possível planejar: ' + (e.code || e.message) + '.', [], e.code === 'PROJECT_ROOT_OVERLAP' ? 'Esta pasta está dentro de outro projeto registrado (ou o contém). Um projeto por pasta raiz.' : undefined)]; }
  const pending = plan.files.filter(f => f.status === 'update' || f.status === 'create');
  for (const file of plan.files) {
    const name = CLIENT_NAMES[file.client] ?? file.client, base = 'project.' + id + '.' + file.client;
    if (file.status === 'unchanged') items.push(item(base, name, 'ok', 'Em dia (BBrainX ' + VERSION + ', recrutamento' + (configArgs(root)?.includes('--files') ? ', arquivos' : '') + ').'));
    else if (file.status === 'manual-required') items.push({ ...item(base, name, 'manual', 'O Antigravity não permite configuração por projeto verificável: a entrada vai no ajuste de usuário dele.',
      [{ id: 'copy', label: 'Copiar configuração', kind: 'copy', text: antigravitySnippet(id, root) }, { id: 'hide', label: 'Não uso o Antigravity', kind: 'hide', tag: 'antigravity' }], 'No Antigravity: Settings → MCP → Edit config, cole o trecho copiado e salve. Depois reinicie o Antigravity.'), tag: 'antigravity' });
    else if (file.status === 'blocked') items.push(item(base, name, 'fail', 'Bloqueado: ' + file.reason + '.', file.target ? [{ id: 'open-file', label: 'Abrir o arquivo', kind: 'open', params: { project: id, client: file.client } }] : [], BLOCK_GUIDE[file.reason] ?? 'Abra o arquivo e confira o motivo ' + file.reason + '.'));
  }
  // Um item só para tudo que o BBrainX atualiza sozinho: uma prévia, um clique, um recibo.
  if (pending.length) {
    const created = pending.filter(f => f.status === 'create'), updated = pending.filter(f => f.status === 'update');
    items.push(item('project.' + id + '.integrate', created.length && !updated.length ? 'Configurar harnesses' : 'Configurações desatualizadas', 'warn',
      [updated.length ? 'Desatualizadas (versão, flags ou caminho): ' + updated.map(f => CLIENT_NAMES[f.client]).join(', ') + '.' : '', created.length ? 'Ainda sem configuração: ' + created.map(f => CLIENT_NAMES[f.client]).join(', ') + '.' : ''].filter(Boolean).join(' '),
      [{ id: 'integrate', label: 'Ver o que muda', kind: 'write', params: { project: id } }]));
  }
  // Sessões abertas com servidor antigo: só reconectar aplica a configuração nova.
  const args = configArgs(root), live = servers?.filter(s => s.project === id) ?? [];
  if (args && live.length) {
    const stale = live.filter(s => args.includes('--files') !== s.files || args.includes('--recruit') !== s.recruit);
    items.push(item('project.' + id + '.sessions', 'Sessões abertas', stale.length ? 'manual' : 'ok', stale.length ? stale.length + ' sessão(ões) rodando a configuração anterior (abertas em ' + stale.map(s => s.started).join(', ') + ').' : live.length + ' sessão(ões) com a configuração atual.', [],
      stale.length ? 'Em cada sessão aberta neste projeto: Claude Code → digite /mcp e reconecte "bbrainx"; Codex → feche e abra a sessão; VS Code → Command Palette → "MCP: List Servers" → bbrainx → Restart.' : undefined));
  }
  if (fs.existsSync(path.join(root, '.codex', 'config.toml'))) {
    const trusted = codexTrusted(root);
    if (trusted !== null) items.push(item('project.' + id + '.trust', 'Confiança no Codex', trusted ? 'ok' : 'manual', trusted ? 'Projeto marcado como confiável: o .codex/config.toml do projeto carrega.' : 'O Codex só lê o .codex/config.toml de projeto confiável.',
      trusted ? [] : [{ id: 'terminal', label: 'Abrir o Codex no projeto', kind: 'open', params: { command: 'codex-project', project: id } }],
      trusted ? undefined : 'Ao abrir o Codex na pasta, ele pergunta se confia no projeto; responda que sim. O BBrainX não muda essa escolha.'));
  }
  return items;
}
/**
 * Conexões reais: o BBrainX registra cada servidor MCP iniciado (projeto, harness, último sinal). Um servidor do Claude Code
 * só inicia depois de aprovado, então uma sessão registrada prova a aprovação; sem nenhuma, o passo é abrir e aprovar.
 */
function connectionsItem(store, id, root) {
  let activity = [];
  try { activity = controlOverview(store, id).activity ?? []; } catch { return null; }
  const last = harness => activity.find(x => x.harness === harness);
  const parts = [], missing = [];
  for (const [harness, name] of [['claude', 'Claude Code'], ['codex', 'Codex'], ['vscode', 'VS Code']]) {
    const seen = last(harness);
    if (seen) parts.push(name + ' ' + (seen.status === 'connected' ? 'conectado agora' : 'em ' + new Date(seen.lastSeen).toLocaleString('pt-BR')));
    else missing.push(name);
  }
  const claudeSeen = !!last('claude');
  return item('project.' + id + '.connections', 'Conexões', claudeSeen ? 'ok' : 'manual',
    (parts.length ? 'Última sessão: ' + parts.join('; ') + '.' : 'Nenhum harness conectou neste projeto ainda.') + (missing.length && parts.length ? ' Nunca conectou: ' + missing.join(', ') + '.' : ''),
    claudeSeen ? [] : [{ id: 'terminal', label: 'Abrir o Claude Code no projeto', kind: 'open', params: { command: 'claude-project', project: id } }],
    claudeSeen ? undefined : 'Ao abrir o Claude Code nesta pasta, ele pergunta se usa os servidores do .mcp.json do projeto: escolha usar. A aprovação é sua; o BBrainX não muda aprovações. Depois confira com /mcp.');
}
function antigravitySnippet(id, root) {
  try { return JSON.stringify(clientConfig('antigravity', { node: process.execPath, entry: path.resolve(new URL('../bin/bbrainx.mjs', import.meta.url).pathname), project: id, home: stateHome(), root }), null, 2); }
  catch { return 'bbrainx config --project ' + id + ' --client antigravity'; }
}

/** Todas as checagens; só leitura (nenhum servidor é iniciado para conferir). */
export async function runChecks(store, { projects } = {}) {
  const home = store.home, registered = store.projects().filter(p => p.id !== 'projetos' && p.id !== 'demo').filter(p => !projects || projects.includes(p.id));
  const servers = runningServers(), detected = discoverIntegrations().clients.filter(c => c.detected).map(c => c.id);
  const groups = [
    { id: 'machine', title: 'Este computador', items: machine({ home }) },
    { id: 'harnesses', title: 'Harnesses', items: harnesses() },
    ...registered.map(p => ({ id: 'project:' + p.id, title: p.id, subtitle: p.root, items: project(p, { servers, detected }) }))
  ];
  for (const p of registered) { const connections = fs.existsSync(p.root) ? connectionsItem(store, p.id, p.root) : null; if (connections) groups.find(g => g.id === 'project:' + p.id).items.push(connections); }
  const all = groups.flatMap(g => g.items), count = status => all.filter(i => i.status === status).length;
  return { schemaVersion: 1, version: VERSION, generatedAt: new Date().toISOString(), summary: { ok: count('ok'), warn: count('warn'), fail: count('fail'), manual: count('manual') }, groups };
}

// ---------------------------------------------------------------------------------------------- ações fechadas
const TERMINAL = { 'claude-login': () => ['claude', 'auth', 'login'], 'codex-login': () => ['codex', 'login'], 'claude-project': () => ['claude'], 'codex-project': () => ['codex'] };
const shellQuote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
/** Abre o terminal do sistema com um comando fixo (nunca texto vindo da página). Sem terminal conhecido: devolve o comando para copiar. */
export function openTerminal(command, cwd, { platform = process.platform, spawner = spawn } = {}) {
  const line = (cwd ? 'cd ' + shellQuote(cwd) + ' && ' : '') + command.map(shellQuote).join(' ');
  const detach = (cmd, args) => { const child = spawner(cmd, args, { detached: true, stdio: 'ignore', windowsHide: false }); child.on?.('error', () => {}); child.unref?.(); };
  if (platform === 'darwin') { detach('/usr/bin/osascript', ['-e', 'tell application "Terminal" to activate', '-e', 'tell application "Terminal" to do script ' + JSON.stringify(line)]); return { opened: 'Terminal', command: line }; }
  if (platform === 'win32') { detach('cmd.exe', ['/c', 'start', '""', 'cmd', '/k', (cwd ? 'cd /d "' + cwd + '" && ' : '') + command.join(' ')]); return { opened: 'cmd', command: line }; }
  for (const terminal of ['x-terminal-emulator', 'gnome-terminal', 'konsole']) if (which(terminal)) { detach(which(terminal), terminal === 'gnome-terminal' ? ['--', 'sh', '-c', line + '; exec sh'] : ['-e', 'sh', '-c', line + '; exec sh']); return { opened: terminal, command: line }; }
  return { opened: null, command: line };
}
function openPath(target, { platform = process.platform } = {}) {
  const code = which('code');
  const [cmd, args] = code ? [code, [target]] : platform === 'darwin' ? ['/usr/bin/open', ['-t', target]] : platform === 'win32' ? ['cmd.exe', ['/c', 'start', '""', target]] : ['xdg-open', [target]];
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore', env: launchEnv(process.env) }); child.on('error', () => {}); child.unref();
  return { opened: target };
}
const projectRoot = (store, id) => { identifier(id); const found = store.projects().find(p => p.id === id); ensure(found, 'PROJECT_NOT_FOUND'); return found.root; };
function launcherText() { const source = path.join(launcherDir(), 'bbrainx'); return fs.readFileSync(source, 'utf8'); }

/**
 * Prévia de uma ação que grava: o que muda e um `planId`. A execução refaz o plano e recusa se o id mudou
 * (alguém editou um arquivo entre a prévia e o clique): o que se executa é sempre o que foi mostrado.
 */
export function previewAction(store, action, params = {}) {
  if (action === 'integrate') {
    const root = projectRoot(store, params.project), clients = clientsFor(root, discoverIntegrations().clients.filter(c => c.detected).map(c => c.id)).join(',');
    const { plan } = planProjectIntegration({ root, project: params.project, clients });
    return { action, planId: plan.id, blocked: plan.files.filter(f => f.status === 'blocked').map(f => ({ client: f.client, reason: f.reason })), changes: planDiff(plan) };
  }
  if (action === 'files-setup') { const { root } = filesRoot(); return { action, planId: 'files:' + root, changes: [{ target: root, status: fs.existsSync(root) ? 'unchanged' : 'create', diff: [{ op: '+', text: 'pasta ' + root }, { op: '+', text: 'projeto de busca "projetos" registrado e indexado' }] }] }; }
  if (action === 'shortcut') { const target = path.join(launcherDir(), 'bbx'), text = launcherText(); return { action, planId: 'bbx:' + text.length, changes: [{ target, status: 'create', diff: text.trimEnd().split('\n').map(line => ({ op: '+', text: line })) }] }; }
  if (action === 'rollback') { ensure(typeof params.receipt === 'string' && /^[a-f0-9-]{36}$/.test(params.receipt), 'INVALID_INTEGRATION_RECEIPT'); return { action, planId: 'rollback:' + params.receipt, changes: [{ target: 'recibo ' + params.receipt, status: 'restore', diff: [{ op: 'note', text: 'Restaura os arquivos como estavam antes daquela aplicação, se ninguém os mudou depois.' }] }] }; }
  ensure(false, 'CHECK_ACTION_UNKNOWN', 'Ação sem prévia: ' + action);
}
const ACTIONS = new Set(['terminal', 'open-file', 'index', 'integrate', 'files-setup', 'shortcut', 'rollback']);
export async function runAction(store, action, params = {}, { planId } = {}) {
  ensure(ACTIONS.has(action), 'CHECK_ACTION_UNKNOWN', 'Ação desconhecida: ' + String(action).slice(0, 40));
  if (action === 'terminal') {
    const command = TERMINAL[params.command]; ensure(command, 'CHECK_ACTION_UNKNOWN', 'Comando de terminal não permitido.');
    return openTerminal(command(), params.project ? projectRoot(store, params.project) : undefined);
  }
  if (action === 'open-file') {
    const root = projectRoot(store, params.project), target = { claude: '.mcp.json', codex: '.codex/config.toml', vscode: '.vscode/mcp.json', kilo: '.kilo/kilo.json' }[params.client];
    ensure(target, 'CHECK_ACTION_UNKNOWN'); return openPath(path.join(root, target));
  }
  if (action === 'index') { const { indexProject } = await import('./retrieval.mjs'); const r = indexProject(store, params.project); return { project: params.project, files: r.files, changed: r.changed }; }
  // Gravações: só com o planId da prévia, e só se o plano refeito agora for o mesmo.
  ensure(typeof planId === 'string', 'CHECK_PREVIEW_REQUIRED', 'Veja o que muda antes de executar.');
  if (action === 'integrate') {
    const root = projectRoot(store, params.project), clients = clientsFor(root, discoverIntegrations().clients.filter(c => c.detected).map(c => c.id)).join(',');
    const prepared = planProjectIntegration({ root, project: params.project, clients });
    ensure(prepared.plan.id === planId, 'CHECK_PLAN_CHANGED', 'Algo mudou desde a prévia. Veja o que muda de novo.');
    const result = await applyProjectIntegration(prepared);
    return { project: params.project, receipt: result.receipt?.id ?? null, status: result.receipt?.status, files: result.plan.files.map(f => ({ client: f.client, status: f.status })), next: result.next };
  }
  ensure(previewAction(store, action, params).planId === planId, 'CHECK_PLAN_CHANGED', 'Algo mudou desde a prévia. Veja o que muda de novo.');
  if (action === 'files-setup') { const { filesCommand } = await import('./files-cli.mjs'); return filesCommand(store, 'setup', {}, async () => ''); }
  if (action === 'shortcut') { const target = path.join(launcherDir(), 'bbx'); fs.writeFileSync(target, launcherText(), { mode: 0o755, flag: 'wx' }); return { created: target }; }
  if (action === 'rollback') return rollbackIntegration({ home: store.home, id: params.receipt });
  ensure(false, 'CHECK_ACTION_UNKNOWN');
}

/** Resumo de terminal: uma linha por item que precisa de atenção, mais a contagem. */
export function formatSummary(report) {
  const mark = { ok: '✔', warn: '!', fail: '✖', manual: '→' }, lines = ['BBrainX ' + report.version + ' — manual integrador', ''];
  for (const group of report.groups) {
    const attention = group.items.filter(i => i.status !== 'ok');
    lines.push((attention.length ? '  ' : '✔ ') + group.title + (attention.length ? '' : ' (tudo em dia)'));
    for (const i of attention) lines.push('    ' + mark[i.status] + ' ' + i.title + ': ' + i.detail);
  }
  const s = report.summary; lines.push('', s.ok + ' ok · ' + s.warn + ' a atualizar · ' + s.fail + ' bloqueado(s) · ' + s.manual + ' passo(s) seu(s)');
  return lines.join('\n');
}

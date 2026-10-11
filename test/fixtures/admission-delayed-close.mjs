// Falha real: o pai termina, mas um filho de vida curta conserva stdout aberto.
// Nenhum modelo é executado. O filho termina sozinho; não há sinal por PID recuperado.
import { spawn } from 'node:child_process';
import readline from 'node:readline';
spawn(process.execPath, ['-e', 'setTimeout(() => {}, 1200)'], { stdio: ['ignore', process.stdout, 'ignore'] });
const send = m => process.stdout.write(JSON.stringify(m) + '\n');
send({ op: 'ready', ok: true, laya: 'transport-failure-only', torch: 'none', device: 'none', loadMs: 0 });
for await (const line of readline.createInterface({ input: process.stdin })) {
  const r = JSON.parse(line);
  send({ id: r.id, ok: true, ms: 0, results: r.states.map(() => ({ answers: { q: { noul: 0.5 } }, inputTokens: 1, truncated: false, stateTokensDropped: 0 })) });
  process.exit(0);
}

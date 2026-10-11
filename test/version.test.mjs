import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../src/version.mjs';
import { VERSION as ENGINE_VERSION } from '../src/engine.mjs';

const file = name => fileURLToPath(new URL('../' + name, import.meta.url));
const read = name => fs.readFileSync(file(name), 'utf8');

test('version: package, lockfile, MCP server, CLI, panel and Atlas announce the same version', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(JSON.parse(read('package.json')).version, VERSION);
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(lock.version, VERSION); assert.equal(lock.packages[''].version, VERSION);
  assert.equal(ENGINE_VERSION, VERSION, 'serverInfo.version comes from src/version.mjs');
  const help = execFileSync(process.execPath, [file('bin/bbrainx.mjs'), 'help'], { encoding: 'utf8' });
  assert.ok(help.startsWith('BBrainX — GODMODCODE ' + VERSION + '\n'), help.split('\n')[0]);
  for (const page of ['web/main.jsx', 'web/atlas/Atlas.jsx', 'web/atlas/data.js']) {
    const source = read(page);
    assert.match(source, /import \{ ?VERSION ?\} from '(\.\.\/)+src\/version\.mjs';/, page + ' imports the version');
    assert.doesNotMatch(source, /GODMODCODE ?\/? ?\d+\.\d+|Na base \d|base \d+\.\d+\.\d+/, page + ' has no hard-coded version');
  }
});

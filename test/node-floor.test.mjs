import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { doctor } from '../src/host.mjs';

const read = relative => fs.readFileSync(fileURLToPath(new URL('../' + relative, import.meta.url)), 'utf8');
const none = () => [];
const check = nodeVersion => doctor({ nodeVersion, env: { BBRAINX_HOME: '/tmp/bbrainx-floor' }, mounts: none });

test('o piso é Node 24: 22.x e 23.x não são suportados, 24.0.0 em diante é', () => {
  for (const version of ['22.20.0', '22.22.3', '23.11.0', '20.20.2']) {
    const report = check(version);
    assert.equal(report.supportedNode, false, version); assert.equal(report.ready, false, version); assert.equal(report.node, version);
  }
  for (const version of ['24.0.0', '24.21.0', '25.9.0', '100.0.0']) assert.equal(check(version).supportedNode, true, version);
  assert.equal(check('lixo').supportedNode, false, 'versão ilegível não é suportada');
});

test('doctor diz o que instalar quando o Node é antigo e some a mensagem quando está tudo certo', () => {
  const old = check('22.22.3');
  assert.equal(old.minimumNode, '24.0.0');
  const message = old.blockers.find(item => /Node/.test(item));
  assert.ok(message, JSON.stringify(old.blockers));
  for (const piece of [/22\.22\.3/, /Node 24/, /brew install node@24|nodejs\.org/]) assert.match(message, piece);
  assert.deepEqual(check('24.21.0').blockers, []);
  assert.equal(check('24.21.0').ready, true);
});

test('engines, lockfile, READMEs e CI declaram o mesmo piso, sem prometer Node 22', () => {
  const pkg = JSON.parse(read('package.json')), lock = JSON.parse(read('package-lock.json'));
  assert.equal(pkg.engines.node, '>=24.0.0');
  assert.equal(lock.packages[''].engines.node, pkg.engines.node, 'package-lock.json acompanha engines');
  for (const file of ['README.md', 'README.en.md']) {
    const text = read(file);
    assert.match(text, /Node 24/, file); assert.doesNotMatch(text, /22\.20/, file + ' não pode prometer o Node 22.20');
  }
  assert.doesNotMatch(read('.github/workflows/verify.yml'), /22\.20/, 'a CI não verifica mais um piso que o produto não suporta');
  assert.match(read('.github/workflows/verify.yml'), /node-version: '24\.0\.0'/, 'o job de piso roda no mínimo declarado');
});

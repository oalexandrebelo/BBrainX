import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { doctor, MINIMUM_NODE } from '../src/host.mjs';

const read = relative => fs.readFileSync(fileURLToPath(new URL('../' + relative, import.meta.url)), 'utf8');
const none = () => [];
const check = nodeVersion => doctor({ nodeVersion, env: { BBRAINX_HOME: '/tmp/bbrainx-floor' }, mounts: none });

test('o piso é Node 22.20.0, comparado por major.minor.patch', () => {
  assert.equal(MINIMUM_NODE, '22.20.0');
  for (const version of ['22.19.9', '22.2.0', '21.99.99', '20.20.2']) {
    const report = check(version);
    assert.equal(report.supportedNode, false, version); assert.equal(report.ready, false, version); assert.equal(report.node, version);
  }
  for (const version of ['22.20.0', '22.22.3', '23.11.0', '24.0.0', '24.21.0', '25.9.0', '100.0.0']) assert.equal(check(version).supportedNode, true, version);
  for (const version of ['lixo', '24', '24.1', '24.x.0', '']) assert.equal(check(version).supportedNode, false, 'versão ilegível não é suportada: ' + version);
});

test('doctor diz o que instalar quando o Node é antigo e some a mensagem quando está tudo certo', () => {
  const old = check('22.19.0');
  assert.equal(old.minimumNode, '22.20.0');
  const message = old.blockers.find(item => /Node/.test(item));
  assert.ok(message, JSON.stringify(old.blockers));
  for (const piece of [/22\.19\.0/, /Node 24/, /brew install node@24|nodejs\.org/, /22\.20\.0/]) assert.match(message, piece);
  for (const version of ['22.20.0', '24.21.0']) { assert.deepEqual(check(version).blockers, [], version); assert.equal(check(version).ready, true, version); }
});

test('engines, lockfile, READMEs e CI declaram o mesmo piso', () => {
  const pkg = JSON.parse(read('package.json')), lock = JSON.parse(read('package-lock.json'));
  assert.equal(pkg.engines.node, '>=' + MINIMUM_NODE);
  assert.equal(lock.packages[''].engines.node, pkg.engines.node, 'package-lock.json acompanha engines');
  for (const file of ['README.md', 'README.en.md']) {
    const text = read(file);
    assert.match(text, /Node 24/, file + ' recomenda o Node 24 LTS'); assert.match(text, /22\.20/, file + ' declara o piso');
  }
  assert.match(read('.github/workflows/verify.yml'), /node-version: '22\.20\.0'/, 'o job de piso roda no mínimo declarado');
});

"""Packaging checks are separate from the Node-only runtime suite; no third-party Python packages."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import tempfile
import unittest
import zipfile

SCRIPTS = Path(__file__).resolve().parent.parent / 'scripts'


class ArchiveTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='bb-archive-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.run_command('git', 'init')
        self.run_command('git', 'config', 'user.name', 'Fixture')
        self.run_command('git', 'config', 'user.email', 'fixture@example.invalid')
        (self.root / 'package.json').write_text('{"version":"0.4.0"}')
        (self.root / 'README.md').write_bytes(b'committed\r\nbytes\x00are preserved')
        self.run_command('git', 'add', '.')
        self.run_command('git', '-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'fixture')
        self.run_command('node', str(SCRIPTS / 'package.mjs'))

    def run_command(self, *args):
        return subprocess.check_output(args, cwd=self.root, stderr=subprocess.STDOUT)

    def build(self):
        import sys
        self.run_command(sys.executable, str(SCRIPTS / 'archive.py'))
        return (self.root / 'artifacts/BBrainX-v0.4.0-source.zip').read_bytes()

    def test_dirty_and_timestamps_do_not_change_archive(self):
        first = self.build()
        (self.root / 'README.md').write_text('dirty working tree')
        os.utime(self.root / 'README.md', (1, 1))
        self.run_command('node', str(SCRIPTS / 'package.mjs'))
        second = self.build()
        self.assertEqual(first, second)
        manifest = json.loads((self.root / 'artifacts/source-manifest.json').read_text())
        with zipfile.ZipFile(self.root / 'artifacts/BBrainX-v0.4.0-source.zip') as archive:
            self.assertEqual(set(archive.namelist()), {'BBrainX/' + name for name in manifest['files']})
            for name, digest in manifest['files'].items():
                self.assertEqual(hashlib.sha256(archive.read('BBrainX/' + name)).hexdigest(), digest)

    def test_tampered_manifest_does_not_replace_existing_archive(self):
        original = self.build()
        file = self.root / 'artifacts/source-manifest.json'
        manifest = json.loads(file.read_text())
        manifest['files']['README.md'] = '0' * 64
        file.write_text(json.dumps(manifest))
        with self.assertRaises(subprocess.CalledProcessError):
            self.build()
        self.assertEqual((self.root / 'artifacts/BBrainX-v0.4.0-source.zip').read_bytes(), original)

    def test_git_replace_does_not_change_archived_identity(self):
        original = self.build()
        oid = self.run_command('git', 'rev-parse', 'HEAD:README.md').decode().strip()
        replacement = subprocess.check_output(['git', 'hash-object', '-w', '--stdin'], cwd=self.root, input=b'replaced blob').decode().strip()
        self.run_command('git', 'replace', oid, replacement)
        self.run_command('node', str(SCRIPTS / 'package.mjs'))
        self.assertEqual(self.build(), original)


if __name__ == '__main__':
    unittest.main()

"""Archive exactly the committed blobs in source-manifest.json, with stable ZIP metadata."""
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
import hashlib
import json
import os
import subprocess
import zipfile


def archive(root=Path.cwd()):
    def git(*args):
        return subprocess.check_output(['git', '--no-replace-objects', '-C', str(root), *args])

    manifest = json.loads((root / 'artifacts/source-manifest.json').read_text())
    revision = git('rev-parse', 'HEAD').decode().strip()
    if manifest.get('schemaVersion') != 2 or manifest.get('commit') != revision:
        raise ValueError('Manifest must identify the current committed revision')
    if manifest.get('tree') != git('rev-parse', revision + '^{tree}').decode().strip():
        raise ValueError('Manifest tree mismatch')
    entries = {}
    for item in git('ls-tree', '-r', '-z', revision).split(b'\0'):
        if not item:
            continue
        metadata, name = item.split(b'\t', 1)
        mode, kind, oid = metadata.decode().split(' ')
        name = name.decode('utf-8')
        if kind != 'blob' or mode not in ('100644', '100755'):
            raise ValueError('Unsupported source entry: ' + name)
        if PurePosixPath(name).is_absolute() or '\\' in name or any(p in ('.', '..', '.git', 'node_modules', '.bbrainx', 'vendor') for p in name.split('/')):
            raise ValueError('Unsafe source path: ' + name)
        entries[name] = (mode, oid)
    if set(entries) != set(manifest['files']) or set(entries) != set(manifest['modes']):
        raise ValueError('Manifest file inventory mismatch')
    expected_locks = {name: manifest['files'][name] for name in ('package-lock.json', 'media/package-lock.json') if name in entries}
    if manifest.get('contentSource') != 'git-blobs' or manifest.get('dependencyLocks') != expected_locks:
        raise ValueError('Manifest source or dependency lock metadata mismatch')
    version = json.loads(git('show', revision + ':package.json'))['version']
    expected_name = 'BBrainX-v' + version + '-source.zip'
    if manifest.get('version') != version or manifest.get('archive') != expected_name or Path(expected_name).name != expected_name:
        raise ValueError('Manifest package version mismatch')
    epoch = int(git('show', '-s', '--format=%ct', revision))
    if manifest.get('sourceTimestamp') != epoch:
        raise ValueError('Manifest timestamp mismatch')
    # ZIP's DOS timestamp range is narrower than Git's; preserve the actual timestamp in the manifest.
    stamp = datetime.fromtimestamp(max(315532800, min(epoch, 4354819198)), timezone.utc).timetuple()[:6]
    output = root / 'artifacts' / expected_name
    temporary = output.with_name(output.name + '.' + str(os.getpid()) + '.tmp')
    try:
        with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED, compresslevel=7) as target:
            for name, (mode, oid) in sorted(entries.items()):
                data = git('cat-file', 'blob', oid)
                if hashlib.sha256(data).hexdigest() != manifest['files'][name] or mode != manifest['modes'][name]:
                    raise ValueError('Manifest content mismatch: ' + name)
                info = zipfile.ZipInfo('BBrainX/' + name, stamp)
                info.create_system = 3
                info.external_attr = int(mode, 8) << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                target.writestr(info, data, compresslevel=7)
        digest = hashlib.sha256(temporary.read_bytes()).hexdigest()
        temporary.replace(output)
        checksums = output.parent / 'SHA256SUMS.txt'
        checksums.write_text(f'{digest}  {output.name}\n', encoding='utf-8')
    finally:
        temporary.unlink(missing_ok=True)
    return {'archive': output.name, 'bytes': output.stat().st_size, 'sha256': digest, 'commit': revision}


if __name__ == '__main__':
    print(json.dumps(archive()))

"""Snapshot textual de duas referências fixadas; não importa nem executa código externo."""
from pathlib import Path, PurePosixPath
import io, json, hashlib, zipfile, urllib.request

PINS = {
    'invokta': ('vinilana/invokta', 'f1e2f04f98c967ab4bb73bd02c3fa581f04ce0e5'),
    'brainx': ('chaobrain/brainx', 'caac2e9d85025a15e55cb75bd99ee7306751945e'),
}
ALLOWED = {'.md', '.ts', '.mjs', '.js', '.json', '.py', '.toml', '.yaml', '.yml', '.txt', '.rst'}
out = Path('artifacts/four-rounds/references')
out.mkdir(parents=True, exist_ok=True)
report = []
for label, (repo, revision) in PINS.items():
    url = f'https://codeload.github.com/{repo}/zip/{revision}'
    with urllib.request.urlopen(url, timeout=60) as response:
        data = response.read(32*1024*1024+1)
    if len(data) > 32*1024*1024:
        raise ValueError('REFERENCE_ARCHIVE_LIMIT')
    files, total = [], 0
    with zipfile.ZipFile(io.BytesIO(data)) as archive, zipfile.ZipFile(out / (label+'.zip'), 'w', zipfile.ZIP_DEFLATED) as target:
        for item in archive.infolist():
            path = PurePosixPath(item.filename)
            if path.is_absolute() or '..' in path.parts or '\\' in item.filename:
                raise ValueError('REFERENCE_PATH_INVALID')
            if item.is_dir() or len(path.parts) < 2:
                continue
            relative = PurePosixPath(*path.parts[1:])
            if relative.suffix not in ALLOWED and relative.name not in {'LICENSE', 'NOTICE'}:
                continue
            if item.file_size > 1024*1024:
                continue
            body = archive.read(item)
            try:
                body.decode('utf-8')
            except UnicodeDecodeError:
                continue
            total += len(body)
            if total > 64*1024*1024:
                raise ValueError('REFERENCE_TEXT_LIMIT')
            target.writestr(str(relative), body)
            files.append({'path':str(relative), 'bytes':len(body), 'sha256':hashlib.sha256(body).hexdigest()})
    report.append({'repository':repo, 'revision':revision, 'archiveSha256':hashlib.sha256(data).hexdigest(),
                   'executed':False, 'files':files})
(out / 'manifest.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps([{'repository':x['repository'], 'revision':x['revision'], 'textFiles':len(x['files'])} for x in report]))

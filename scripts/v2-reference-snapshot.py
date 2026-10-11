"""Download bounded primary-source text at pinned revisions. Never execute upstream code."""
import concurrent.futures, hashlib, json, re, urllib.request
from pathlib import Path, PurePosixPath

ROOT = Path('artifacts/v2/references')
PINS = [('stablyai/orca','57452c681f27c03fd3c016a06da6315777db775a'),
        ('camtrik/agent-trail','6e53f21f292955974ac21a082edb4ac216e2ad92')]
KEY = re.compile(r'worktree|watcher|watch-service|usage|telemetry|transcript|security|architecture|performance|health|launch|lifecycle|incremental|ingest|parser|cost|session|retention|remote|headless|privacy|adapter|agent-registry|shutdown',re.I)

def get(url, maximum):
    request=urllib.request.Request(url,headers={'User-Agent':'BBrainX-read-only-research'})
    with urllib.request.urlopen(request,timeout=30) as response:
        body=response.read(maximum+1)
    if len(body)>maximum: raise ValueError('SOURCE_BYTE_LIMIT')
    body.decode('utf-8')
    return body

for repo,rev in PINS:
    tree=json.loads(get(f'https://api.github.com/repos/{repo}/git/trees/{rev}?recursive=1',8*1024*1024))
    if tree.get('truncated'): raise ValueError('TREE_TRUNCATED')
    paths=[]
    for item in tree['tree']:
        p=PurePosixPath(item['path'])
        if p.is_absolute() or '..' in p.parts: raise ValueError('UNSAFE_PATH')
        if item['type']!='blob' or item.get('size',0)>128*1024: continue
        if p.name in ['README.md','LICENSE','LICENSE.md','package.json'] and len(p.parts)==1:
            paths.append(item['path']); continue
        if p.parts[0] in ['docs','src','lib','ingest','bin','tests'] and p.suffix in ['.md','.ts','.tsx','.js','.mjs','.cjs'] and KEY.search(str(p)):
            paths.append(item['path'])
    # Overview and architectural material first; selected source files second.
    paths.sort(key=lambda p:(0 if '/' not in p else 1 if p.startswith('docs/') else 2,len(p),p))
    chosen=paths[:120]
    dest=ROOT/repo.replace('/','--');dest.mkdir(parents=True,exist_ok=True)
    def capture(p):
        url=f'https://raw.githubusercontent.com/{repo}/{rev}/{p}'
        try:
            b=get(url,128*1024); target=dest/p;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b)
            return {'path':p,'url':url,'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'status':'read-only'}
        except Exception as e:
            return {'path':p,'url':url,'status':'unavailable','error':type(e).__name__}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: items=list(pool.map(capture,chosen))
    (dest/'inventory.json').write_text(json.dumps({'repository':repo,'revision':rev,'allTreeEntries':len(tree['tree']),
      'eligibleTextPaths':len(paths),'selected':len(chosen),'upstreamExecuted':False,'entries':items,'tree':tree},indent=2)+'\n')
    print(repo,rev,'captured',sum(i['status']=='read-only' for i in items),'of',len(items))

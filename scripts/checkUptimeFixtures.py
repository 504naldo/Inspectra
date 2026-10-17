"""Execute the actual uptime workflow scripts with local command/API fixtures only."""
from pathlib import Path
import json
import os
import re
import subprocess
import tempfile

source = Path('.github/workflows/uptime.yml').read_text()

def block(after, key):
    section = source.split(after, 1)[1]
    lines = section.splitlines()
    start = next(i for i, line in enumerate(lines) if line.strip() == key + ': |')
    indent = len(lines[start]) - len(lines[start].lstrip()) + 2
    result = []
    for line in lines[start + 1:]:
        if line.strip() and len(line) - len(line.lstrip()) < indent:
            break
        result.append(line[indent:])
    return '\n'.join(result)

with tempfile.TemporaryDirectory(prefix='inspectra-monitor-') as tmp:
    root = Path(tmp)
    curl = root / 'curl'
    curl.write_text('''#!/usr/bin/env python3
import os, pathlib
pathlib.Path('/tmp/body.txt').write_text(os.environ['FIXTURE_BODY'])
print(os.environ['FIXTURE_CODE'], end='')
''')
    curl.chmod(0o755)
    sleep = root / 'sleep'
    sleep.write_text('#!/bin/sh\nexit 0\n')
    sleep.chmod(0o755)
    script = block('id: check', 'run')
    for code, body, expected in [('200', '{"status":"ok"}', 'up'), ('503', '{}', 'down'), ('200', '{"status":"bad"}', 'down'), ('000', '', 'down')]:
        output = root / 'output'
        output.write_text('')
        env = {'PATH': str(root) + ':' + os.defpath, 'HEALTHCHECK_URL': 'http://fixture.invalid/health', 'GITHUB_OUTPUT': str(output), 'FIXTURE_CODE': code, 'FIXTURE_BODY': body}
        subprocess.run(['bash', '-e', '-c', script], env=env, check=True, capture_output=True, text=True)
        assert output.read_text().strip() == 'status=' + expected
    for name, existing, expected in [('Open tracking issue on outage', [], ['create']), ('Open tracking issue on outage', [{'number': 42}], ['createComment']), ('Auto-close tracking issue on recovery', [], []), ('Auto-close tracking issue on recovery', [{'number': 42}], ['createComment', 'update'])]:
        js = block(name, 'script')
        harness = '''const calls=[];
const context={repo:{owner:'fixture',repo:'fixture'},serverUrl:'https://fixture.invalid',runId:1};
const github={rest:{issues:{
listForRepo:async()=>({data:EXISTING}),
create:async p=>calls.push('create'),
createComment:async p=>calls.push('createComment'),
update:async p=>{if(p.state!=='closed')throw Error('not closed');calls.push('update')}
}}};
(async()=>{ SCRIPT })().then(()=>{if(JSON.stringify(calls)!==JSON.stringify(EXPECTED))throw Error(JSON.stringify(calls));});
'''.replace('EXISTING', json.dumps(existing)).replace('EXPECTED', json.dumps(expected)).replace('SCRIPT', js)
        subprocess.run(['node', '-e', harness], check=True, env={'PATH': os.environ['PATH']})
print('PASS: 4 shell health scenarios and 4 issue/recovery fixture scenarios; no network or GitHub writes')

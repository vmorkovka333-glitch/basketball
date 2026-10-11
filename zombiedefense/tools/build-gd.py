#!/usr/bin/env python3
"""Builds the zip that GameDistribution takes as an upload: index.html at the root plus the scripts.

    python3 tools/build-gd.py --game-id <your GameDistribution Game ID>

Without --game-id the zip keeps the GD_GAME_ID already written in index.html.
Writes dist/zombie-squad-gamedistribution.zip and checks the build against the portal's rules.
"""
import argparse, os, re, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = ['index.html', 'three.min.js'] + sorted('js/' + f for f in os.listdir(os.path.join(ROOT, 'js')) if f.endswith('.js'))
ALLOWED_HOSTS = {'html5.api.gamedistribution.com'}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--game-id', help='the Game ID from developer.gamedistribution.com')
    ap.add_argument('--out', default=os.path.join(ROOT, 'dist', 'zombie-squad-gamedistribution.zip'))
    a = ap.parse_args()

    html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    if a.game_id:
        gid = a.game_id.strip()
        if not re.fullmatch(r'[0-9A-Za-z-]{8,64}', gid):
            sys.exit('That does not look like a GameDistribution Game ID: ' + gid)
        html, n = re.subn(r"window\.GD_GAME_ID = '[^']*';", "window.GD_GAME_ID = '%s';" % gid, html)
        if n != 1:
            sys.exit('Could not find the GD_GAME_ID line in index.html')
    gid = re.search(r"window\.GD_GAME_ID = '([^']*)';", html).group(1)

    # the portal's rules, checked where a script can check them
    problems = []
    for f in FILES:
        text = html if f == 'index.html' else open(os.path.join(ROOT, f), encoding='utf-8', errors='replace').read()
        if f == 'three.min.js':
            continue
        for host in set(re.findall(r'https?://([a-z0-9.-]+)', text)):
            if host not in ALLOWED_HOSTS and not host.endswith('w3.org'):
                problems.append('%s links to %s (no outside links or requests)' % (f, host))
        if re.search(r'\b(alert|confirm|prompt)\s*\(', text):
            problems.append('%s uses a browser dialog' % f)
        if re.search(r'window\.open\s*\(|location\.href\s*=', text):
            problems.append('%s opens or leaves the page' % f)
    if 'gdsdk.showAd' not in open(os.path.join(ROOT, 'js', 'portal.js'), encoding='utf-8').read():
        problems.append('portal.js does not call gdsdk.showAd')

    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with zipfile.ZipFile(a.out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in FILES:
            if f == 'index.html':
                z.writestr('index.html', html)
            else:
                z.write(os.path.join(ROOT, f), f)
    size = os.path.getsize(a.out)
    print('wrote %s (%.0f KB, %d files)' % (os.path.relpath(a.out, ROOT), size / 1024, len(FILES)))
    print('Game ID:', gid or '(empty: the SDK will not load and no ads will show)')
    for p in problems:
        print('PROBLEM:', p)
    if not gid:
        print('Add the ID before uploading:  python3 tools/build-gd.py --game-id <ID>')
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())

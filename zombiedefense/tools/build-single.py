#!/usr/bin/env python3
"""Packs the whole game into one self-contained HTML file: every script (Three.js included) is inlined,
the fonts are already embedded, so the file runs on its own, even opened straight from disk.

    python3 tools/build-single.py [--game-id <GameDistribution Game ID>] [--out dist/zombie-squad.html]
"""
import argparse, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def inline(path):
    src = open(os.path.join(ROOT, path), encoding='utf-8').read()
    # a literal "</script" inside the code would end the inline <script> element early
    return '<script>/* ' + path + ' */\n' + re.sub(r'</(script)', r'<\\/\1', src, flags=re.I) + '\n</script>'


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--game-id', help='the Game ID from developer.gamedistribution.com')
    ap.add_argument('--out', default=os.path.join(ROOT, 'dist', 'zombie-squad.html'))
    a = ap.parse_args()

    html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    if a.game_id:
        if not re.fullmatch(r'[0-9A-Za-z-]{8,64}', a.game_id.strip()):
            sys.exit('That does not look like a GameDistribution Game ID: ' + a.game_id)
        html, n = re.subn(r"window\.GD_GAME_ID = '[^']*';", "window.GD_GAME_ID = '%s';" % a.game_id.strip(), html)
        if n != 1:
            sys.exit('Could not find the GD_GAME_ID line in index.html')

    found = []
    def repl(m):
        found.append(m.group(1))
        return inline(m.group(1))
    # classic and deferred script tags; the deferred ones sit at the end of <body>, so inline order is the same
    html = re.sub(r'<script(?: defer)? src="([^"]+)"></script>', repl, html)
    missing = [f for f in found if not os.path.exists(os.path.join(ROOT, f))]
    if missing:
        sys.exit('missing scripts: ' + ', '.join(missing))
    if re.search(r'<script[^>]+src=', html) or re.search(r'<link[^>]+href=', html):
        sys.exit('an outside file is still referenced')

    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    open(a.out, 'w', encoding='utf-8').write(html)
    print('wrote %s (%.0f KB) with %d scripts inlined: %s' % (os.path.relpath(a.out, ROOT), os.path.getsize(a.out)/1024, len(found), ', '.join(found)))


if __name__ == '__main__':
    main()

"""SGF (main line) -> compact JSON for go.js, with checks printed.
usage: python -I sgf2json.py in.sgf out.json KEYMOVE 'note html for key move'"""
import re, sys, json
src, dst, key = sys.argv[1], sys.argv[2], int(sys.argv[3])
note = sys.argv[4] if len(sys.argv) > 4 else ''
s = open(src, encoding='utf-8', errors='replace').read()
# main line: take nodes up to the first variation close at depth 1
depth = 0; main = []; i = 0
while i < len(s):
    c = s[i]
    if c == '[':
        j = i + 1
        while j < len(s) and not (s[j] == ']' and s[j - 1] != '\\'): j += 1
        main.append(s[i:j + 1]); i = j + 1; continue
    if c == '(':
        depth += 1
        if depth > 1: break        # first variation: the main line ends here
    elif c == ')':
        depth -= 1
    main.append(c); i += 1
text = ''.join(main)
def prop(name):
    m = re.search(r'(?<![A-Z])' + name + r'\[([^\]]*)\]', text)
    return m.group(1) if m else ''
moves = []
for col, coord in re.findall(r';\s*(?:[A-Z]{1,2}\[[^\]]*\]\s*)*?([BW])\[([a-s]{0,2})\]', text):
    if coord in ('', 'tt'): moves.append([-1, -1, col])
    else: moves.append([ord(coord[0]) - 97, ord(coord[1]) - 97, col])
COLS = 'ABCDEFGHJKLMNOPQRST'
def name(m): return 'pass' if m[0] < 0 else f'{COLS[m[0]]}{19 - m[1]}'
print('players', prop('PB'), '(B) vs', prop('PW'), '(W)', 'date', prop('DT'), 'result', prop('RE'), 'komi', prop('KM'))
print('moves', len(moves))
for k in sorted({1, 2, key - 1, key, key + 1, len(moves)}):
    if 1 <= k <= len(moves): print(' move', k, moves[k - 1][2], name(moves[k - 1]))
alt = all(moves[i][2] != moves[i + 1][2] for i in range(len(moves) - 1))
print('alternating colours:', alt)
out = {'black': prop('PB'), 'white': prop('PW'), 'date': prop('DT'), 'result': prop('RE'), 'key': key,
       'moves': moves, 'notes': {str(key): note} if note else {}}
json.dump(out, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('wrote', dst)

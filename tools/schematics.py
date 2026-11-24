"""Research schematics.

Conventions, so the four read as one set:
  * One drawing scale. Every SVG's viewBox is the tight bounds of what is
    actually drawn (plus stroke), and the SVG is sized at 1 px per unit, so
    line weights match and the top-left of the ink is the top-left of the box:
    the page aligns the ink itself, not an invisible margin.
  * Molecules use RDKit 2D coordinates (tools/molecules.json, generated with
    RDKit's CoordGen depictor): 120° angles, one bond length, Kekulé rings with
    the second line of each double bond inside the ring, terminal C=O centred,
    heteroatom labels that interrupt their bonds, implicit H written on the
    open side of the atom.
  * Parts marked .s start displaced and settle (site.js); .late parts appear
    after. The co-folding figure is drawn and animated by site.js around the
    ligand placed here."""
import json, math, os, random

HERE = os.path.dirname(os.path.abspath(__file__))
MOL = json.load(open(os.path.join(HERE, 'molecules.json'), encoding='utf-8'))
SCALE = 1.36          # px per drawing unit, the same for every figure
SUB = str.maketrans('0123456789', '₀₁₂₃₄₅₆₇₈₉')

class Pic:
    def __init__(self):
        self.parts, self.pts = [], []
    def add(self, s, *pts):
        self.parts.append(s); self.pts.extend(pts)
    def line(self, a, b, cls='k s'):
        self.add(f'<line class="{cls}" x1="{a[0]:.2f}" y1="{a[1]:.2f}" x2="{b[0]:.2f}" y2="{b[1]:.2f}"/>', a, b)
    def circle(self, c, r, cls):
        self.add(f'<circle class="{cls}" cx="{c[0]:.2f}" cy="{c[1]:.2f}" r="{r}"/>', (c[0] - r, c[1] - r), (c[0] + r, c[1] + r))
    def text(self, x, y, t, cls, anchor='middle', size=10.5, rot=None):
        # bounds from Archivo's metrics: cap height ~0.72 em, average advance ~0.58 em
        w = size * 0.64 * len(t); x0 = x - w / 2 if anchor == 'middle' else (x - w if anchor == 'end' else x)
        if rot:   # rotated -90 about (x, y): an 'end'-anchored label runs down from y... upward reading
            self.add(f'<text class="{cls}" x="{x:.2f}" y="{y:.2f}" text-anchor="{anchor}" transform="rotate({rot} {x:.2f} {y:.2f})">{t}</text>',
                     (x - size * 0.74, y), (x + 0.5, y + w))
        else:
            self.add(f'<text class="{cls}" x="{x:.2f}" y="{y:.2f}" text-anchor="{anchor}">{t}</text>', (x0, y - size * 0.74), (x0 + w, y + 0.5))
    def path(self, d, pts, cls):
        self.add(f'<path class="{cls}" d="{d}"/>', *pts)
    def svg(self, label, amp=24, pad=1.5, extra=''):
        xs = [p[0] for p in self.pts]; ys = [p[1] for p in self.pts]
        x0, y0, x1, y1 = min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad
        w, h = x1 - x0, y1 - y0
        return (f'<svg class="schem" data-amp="{amp}" viewBox="{x0:.1f} {y0:.1f} {w:.1f} {h:.1f}" '
                f'style="width:{w * SCALE:.0f}px;aspect-ratio:{w:.1f}/{h:.1f}"{extra} role="img" aria-label="{label}">' + ''.join(self.parts) + '</svg>')

def unit(v):
    L = math.hypot(*v); return (v[0] / L, v[1] / L)

def molecule(pic, name, at, bond, rot=0.0, mirror=False, ink='k', label='atom', align=None, fs=11.5):
    """Draw RDKit coordinates scaled to `bond` and rotated by `rot` degrees,
    with the centroid (or atom `align`) at `at`. Returns atom positions."""
    m = MOL[name]; A = m['atoms']
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    P = []
    for a in A:
        x, y = a['x'] * (-1 if mirror else 1), a['y']
        P.append((x * c - y * s, x * s + y * c))
    ref = P[align] if align is not None else (sum(p[0] for p in P) / len(P), sum(p[1] for p in P) / len(P))
    P = [((x - ref[0]) * bond + at[0], (y - ref[1]) * bond + at[1]) for x, y in P]
    nbrs = {i: [] for i in range(len(A))}
    for b in m['bonds']: nbrs[b['a']].append(b['b']); nbrs[b['b']].append(b['a'])
    labelled = lambda i: A[i]['el'] != 'C'
    trim = max(bond * 0.3, fs * 0.62)
    ring_atoms = [i for i, a in enumerate(A) if a['ring']]
    rc = (sum(P[i][0] for i in ring_atoms) / len(ring_atoms), sum(P[i][1] for i in ring_atoms) / len(ring_atoms)) if ring_atoms else None
    for b in m['bonds']:
        i, j = b['a'], b['b']; p, q = P[i], P[j]
        u = unit((q[0] - p[0], q[1] - p[1]))
        p2 = (p[0] + u[0] * trim, p[1] + u[1] * trim) if labelled(i) else p
        q2 = (q[0] - u[0] * trim, q[1] - u[1] * trim) if labelled(j) else q
        cls = f'{ink} s'
        if b['o'] == 2 and b['ring']:            # second line inside the ring, shortened
            pic.line(p2, q2, cls)
            mx, my = (p[0] + q[0]) / 2, (p[1] + q[1]) / 2
            n = unit((rc[0] - mx, rc[1] - my)); off = bond * 0.18; t = 0.17
            pic.line((p[0] + (q[0] - p[0]) * t + n[0] * off, p[1] + (q[1] - p[1]) * t + n[1] * off),
                     (q[0] - (q[0] - p[0]) * t + n[0] * off, q[1] - (q[1] - p[1]) * t + n[1] * off), cls)
        elif b['o'] == 2:                        # terminal C=O: a centred pair
            n = (-u[1] * bond * 0.085, u[0] * bond * 0.085)
            pic.line((p2[0] + n[0], p2[1] + n[1]), (q2[0] + n[0], q2[1] + n[1]), cls)
            pic.line((p2[0] - n[0], p2[1] - n[1]), (q2[0] - n[0], q2[1] - n[1]), cls)
        else:
            pic.line(p2, q2, cls)
    size = fs
    for i, a in enumerate(A):
        if not labelled(i): continue
        x, y = P[i]; yb = y + size * 0.36       # baseline that puts the capital's centre on the atom
        sx = sum(unit((P[k][0] - x, P[k][1] - y))[0] for k in nbrs[i]); sy = sum(unit((P[k][0] - x, P[k][1] - y))[1] for k in nbrs[i])
        open_ = unit((-sx, -sy)) if abs(sx) + abs(sy) > 1e-6 else (0, -1)
        h = a['h']; hs = 'H' + (str(h).translate(SUB) if h > 1 else '')
        cl = f'{label} s'
        if not h:
            pic.text(x, yb, a['el'], cl, size=size)
        elif abs(open_[0]) >= 0.72:              # H beside the symbol, read as one label; the symbol stays on the atom
            if open_[0] > 0: pic.text(x - size * 0.33, yb, a['el'] + hs, cl, 'start', size)
            else:            pic.text(x + size * 0.33, yb, hs + a['el'], cl, 'end', size)
        else:                                    # H directly above or below
            pic.text(x, yb, a['el'], cl, size=size)
            pic.text(x, yb + (1 if open_[1] > 0 else -1) * size * 1.02, hs, cl, size=size)
    return P

# ---------------------------------------------------------------- figures
def parity():
    pic = Pic(); r = random.Random(7)
    pic.path('M0 0 V112 H196', [(0, 0), (196, 112)], 'k')
    pic.line((4, 108), (192, 6), 'f')
    for i in range(24):
        t = 0.06 + 0.88 * i / 23
        x = 4 + t * 186 + r.gauss(0, 5); y = 108 - t * 100 + r.gauss(0, 7)
        hit = i in (17, 21)
        pic.circle((x, y), 3.1 if hit else 2.3, 'a s' if hit else 'kf s')
    pic.text(196, 125, 'measured', 'lab', 'end', 10)
    pic.text(-6, 0, 'predicted', 'lab', 'end', 10, rot=-90)
    return pic.svg('A parity plot: predicted against measured affinity, close to the diagonal.', 30)

def paracetamol():
    pic = Pic()
    # RDKit's own orientation: the chain zigzags at ±30° through the ring; mirrored so HO leads
    molecule(pic, 'paracetamol', (0, 0), 31, rot=0, mirror=True)
    return pic.svg('Paracetamol (acetaminophen) as a skeletal formula, assembling bond by bond.', 34)

def pocket():
    pic = Pic()
    d1 = 'M14 10 C 34 10, 44 22, 50 42 S 70 96, 110 96 S 162 84, 168 48 S 186 10, 206 10'
    d2 = 'M14 24 C 28 24, 36 36, 40 56 S 62 112, 110 112 S 176 100, 182 62 S 194 24, 206 24'
    pic.path(d1, [(14, 10), (206, 96)], 'k')
    pic.path(d2, [(14, 24), (206, 112)], 'k depth')
    P = molecule(pic, 'aminophenol', (106, 56), 16, rot=0, ink='as', label='atom-a')
    N, O = P[0], P[7]
    ring = [P[i] for i in range(1, 7)]; rc = (sum(p[0] for p in ring) / 6, sum(p[1] for p in ring) / 6)
    hi, lo = (N, O) if N[1] < O[1] else (O, N)
    # hydrogen bonds reach across the surface to residues in the protein
    pic.line((hi[0] - 16, hi[1] - 1), (36, 34), 'f late'); pic.text(30, 36, 'Ser' if hi is O else 'Asp', 'lab late', 'end', 10)
    pic.line((lo[0] - 16, lo[1] + 1), (48, 76), 'f late'); pic.text(42, 80, 'Asp' if lo is N else 'Ser', 'lab late', 'end', 10)
    # and a phenylalanine ring stacks against the ligand's, edge of the pocket
    phe = (150, 52)
    for k in range(6):
        a_ = math.radians(30 + 60 * k); b_ = math.radians(90 + 60 * k)
        pic.line((phe[0] + 9 * math.cos(a_), phe[1] + 9 * math.sin(a_)), (phe[0] + 9 * math.cos(b_), phe[1] + 9 * math.sin(b_)), 'k late')
    pic.line((rc[0] + 15, rc[1]), (phe[0] - 11, phe[1]), 'f late')
    pic.text(190, 56, 'Phe', 'lab late', 'start', 10)
    pic.line((160, 53), (187, 53), 'f late')
    return pic.svg('A ligand in a protein pocket, held by two hydrogen bonds and a stacked phenylalanine ring.', 38)

def cofold():
    """The ligand in its bound pose; site.js draws the protein around it and
    animates the two folding together into one complex."""
    pic = Pic()
    pic.add('', (2, 14), (208, 118))         # the folded complex's extent (see site.js)
    pic.add('<g class="cf-chain"></g><g class="cf-lig">')
    molecule(pic, 'benzamide', (112, 62), 14, rot=0, ink='as', label='atom-a')
    pic.add('</g><g class="cf-contacts"></g>')
    return pic.svg('A protein and a ligand predicted together: the chain folds into strands and a helix around the ligand as it binds.', 0, pad=0, extra=' data-cofold')

def agents():
    """Agentic workflows, drawn as an execution trace in score form: one lane
    per kind of work, time to the right. A planning step forks into three
    agents that call tools in parallel; one branch fails and is dropped, two
    return to review, and the line chosen there runs on. site.js reveals it
    under a moving playhead, so the run is seen as it executes."""
    pic = Pic()
    lanes = ['plan', 'structure', 'affinity', 'simulate', 'review']
    Y = {n: 10 + 23 * i for i, n in enumerate(lanes)}
    x0, x1 = 50, 212
    for n in lanes:
        pic.text(0, Y[n] + 3.3, n, 'lab', 'start', 9.5)
        pic.line((x0 - 4, Y[n]), (x1, Y[n]), 'f lane')
    def bar(a, b, lane, off=0, cls='bar'):
        y = Y[lane] + off; pic.line((a, y), (b, y), cls); return (b, y)
    def step(p, q, cls='k step'):
        # an elbow: across, then down or up to the next lane
        pic.path(f'M{p[0]:.1f} {p[1]:.1f} H{q[0]:.1f} V{q[1]:.1f}' if p[1] != q[1] else f'M{p[0]:.1f} {p[1]:.1f} H{q[0]:.1f}', [p, q], cls)
    # plan
    e = bar(x0, 64, 'plan')
    # three agents, each a voice offset within its lanes
    # the plan forks: one spine, three agents leaving it
    pic.path(f'M{e[0]:.1f} {e[1]:.1f} H67 V{Y["simulate"] + 3:.1f}', [e, (67, Y['simulate'] + 3)], 'k step')
    for lane, off in (('structure', -3), ('affinity', 3), ('simulate', 3)):
        pic.line((67, Y[lane] + off), (70, Y[lane] + off), 'k step')
    a1 = bar(70, 94, 'structure', -3)
    a2 = bar(98, 116, 'affinity', -3); step((a1[0], a1[1]), (98, Y['affinity'] - 3))
    b1 = bar(70, 88, 'affinity', 3)
    b2 = bar(92, 106, 'simulate', -3); step((b1[0], b1[1]), (92, Y['simulate'] - 3))
    pic.line((109, Y['simulate'] - 6), (115, Y['simulate']), 'k fail'); pic.line((115, Y['simulate'] - 6), (109, Y['simulate']), 'k fail')
    c1 = bar(70, 110, 'simulate', 3)
    # review gathers what came back
    r = bar(124, 136, 'review')
    step((a2[0], a2[1]), (124, Y['review'])); step((c1[0], c1[1]), (124, Y['review']))
    # the chosen line runs on
    d1 = bar(142, 158, 'structure', 0, 'bar a'); step((r[0], r[1]), (142, Y['structure']), 'as step')
    d2 = bar(162, 192, 'simulate', 0, 'bar a'); step((d1[0], d1[1]), (162, Y['simulate']), 'as step')
    bar(198, 208, 'review', 0, 'bar a'); step((d2[0], d2[1]), (198, Y['review']), 'as step')
    pic.add(f'<line class="trace-head" x1="{x0}" y1="2" x2="{x0}" y2="{Y["review"] + 8}"/>')
    pic.parts.insert(0, f'<clipPath id="trace-clip"><rect class="trace-clip" x="-10" y="-10" width="0" height="140"/></clipPath>')
    # everything after the lane labels and guides is revealed by the playhead
    first = 2 * len(lanes) + 1
    pic.parts.insert(first, '<g class="trace-run" clip-path="url(#trace-clip)">')
    pic.parts.insert(len(pic.parts) - 1, '</g>')
    return pic.svg('An agentic workflow as an execution trace: a plan forks into three agents calling structure, affinity and simulation tools in parallel; one branch fails, two return to review, and the chosen line runs on.', 0, extra=' data-trace')

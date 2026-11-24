"""Build assets/data/world.json for the visitor footprint: a dot-matrix world
(land sampled on a regular grid in an equal-area-ish projection) and a
centroid for every country, keyed by ISO 3166-1 alpha-2 (the code Cloudflare
reports as request.cf.country).

Source: Natural Earth 1:110m countries, via the world-atlas package
(https://github.com/topojson/world-atlas), public domain.

  python tools/worldmap.py countries-110m.json assets/data/world.json
needs shapely and pycountry (development only; the site loads only the JSON)."""
import json, math, sys
from shapely.geometry import Polygon, MultiPolygon, Point
from shapely.ops import unary_union
from shapely.prepared import prep
import pycountry

topo = json.load(open(sys.argv[1], encoding='utf-8'))
sc, tr = topo['transform']['scale'], topo['transform']['translate']
arcs = []
for arc in topo['arcs']:
    x = y = 0; pts = []
    for dx, dy in arc:
        x += dx; y += dy; pts.append((x * sc[0] + tr[0], y * sc[1] + tr[1]))
    arcs.append(pts)
def ring(idx):
    pts = []
    for a in idx:
        seg = arcs[a] if a >= 0 else arcs[~a][::-1]
        pts.extend(seg if not pts else seg[1:])
    return pts
def shape(g):
    if g['type'] == 'Polygon':
        return Polygon(ring(g['arcs'][0]), [ring(h) for h in g['arcs'][1:]]).buffer(0)
    if g['type'] == 'MultiPolygon':
        return unary_union([Polygon(ring(p[0]), [ring(h) for h in p[1:]]).buffer(0) for p in g['arcs']])
    return None

geoms = topo['objects']['countries']['geometries']
shapes, cents = [], {}
for g in geoms:
    s = shape(g)
    if s is None or s.is_empty: continue
    shapes.append(s)
    c = None
    try: c = pycountry.countries.get(numeric=str(g.get('id', '')).zfill(3))
    except Exception: pass
    if not c: continue
    # the representative point of the largest part, so islands do not pull the dot to sea
    big = max(s.geoms, key=lambda p: p.area) if s.geom_type == 'MultiPolygon' else s
    p = big.representative_point() if not big.contains(big.centroid) else big.centroid
    cents[c.alpha_2] = [round(p.x, 1), round(p.y, 1), c.name if len(c.name) < 26 else getattr(c, 'common_name', c.name)]
# a few names read better short
for k, v in {'US': 'United States', 'GB': 'United Kingdom', 'KR': 'South Korea', 'RU': 'Russia', 'TW': 'Taiwan', 'IR': 'Iran', 'VN': 'Vietnam'}.items():
    if k in cents: cents[k][2] = v
land = prep(unary_union(shapes))
# dots on a grid in latitude-scaled steps (fewer dots toward the poles), Antarctica left out
STEP = 2.0
dots = []
lat = 82.0
while lat > -56:
    k = max(1, round(1 / max(0.25, math.cos(math.radians(lat)))))
    lon = -180 + STEP / 2
    row = []
    i = 0
    while lon < 180:
        if i % 1 == 0 and land.contains(Point(lon, lat)): row.append(round(lon, 1))
        lon += STEP; i += 1
    if row: dots.append([round(lat, 1), row])
    lat -= STEP
json.dump({'source': 'Natural Earth 1:110m via world-atlas, public domain', 'step': STEP, 'dots': dots, 'countries': cents},
          open(sys.argv[2], 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
print(len(dots), 'rows', sum(len(r[1]) for r in dots), 'dots', len(cents), 'countries')

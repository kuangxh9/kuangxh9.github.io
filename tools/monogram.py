"""The XK monogram: an X, and a K drawn as a stereocentre.

In a structure drawing a tetrahedral centre has two bonds in the plane of the
page, a solid wedge toward the reader and a hashed wedge away. Set the two
in-plane bonds end to end and they are the stem of a K; the wedge and the
hash, leaving from one point on the stem, are its arms.

Construction on a 32 × 24 field:
  * every stroke 2.5 units, cut flat at the cap line (4) and base line (20);
  * the X 11 wide, crossing at the optical centre;
  * the wedge and the hash share one envelope (5.2 wide at the cut) and one
    tip, on the stem's edge at mid-height: the stereocentre;
  * a sliver of paper is kept between the stem and the wedge, which is what
    keeps the K legible at 16 px;
  * four hash rungs, evenly spaced, the last inside the base line.

Writes assets/img/mark.svg, assets/img/favicon.svg, tools/mark-inline.txt
(the header version: currentColor, parts ordered and set up for the drawing
animation in site.css); raster() writes the .ico and touch icon from a 512 px render.
"""
import math, os, sys

VW, VH = 32, 24

def geometry(w=2.5, top=4.0, bot=20.0, x0=3.0, xw=11.0, st=18.9, aw=9.4, env=5.2, rungs=4, hw=1.45, t0=0.3, t1=0.9):
    m = (top + bot) / 2
    def ext(a, b, k=2.0):
        dx, dy = b[0] - a[0], b[1] - a[1]; n = math.hypot(dx, dy)
        return (a[0] - dx / n * k, a[1] - dy / n * k), (b[0] + dx / n * k, b[1] + dy / n * k)
    # strokes in writing order, each drawn from its first point: X falling, X rising (from top right), stem down
    strokes = [ext((x0, top), (x0 + xw, bot)), ext((x0 + xw, top), (x0, bot)), ((st, top - 2), (st, bot + 2))]
    tip = (st + w * 0.5, m)
    def env_pts(end):
        dx, dy = end[0] - tip[0], end[1] - tip[1]; n = math.hypot(dx, dy); nx, ny = -dy / n * env / 2, dx / n * env / 2
        return [tip, (end[0] + nx, end[1] + ny), (end[0] - nx, end[1] - ny)]
    wedge = env_pts((st + aw, top - 1.6))
    end = (st + aw, bot + 1.6); dx, dy = end[0] - tip[0], end[1] - tip[1]; n = math.hypot(dx, dy); px, py = -dy / n, dx / n
    rung = []
    for i in range(rungs):
        t = t0 + (t1 - t0) * i / (rungs - 1); cx, cy = tip[0] + dx * t, tip[1] + dy * t; h = env / 2 * t
        rung.append(((cx + px * h, cy + py * h), (cx - px * h, cy - py * h)))
    return dict(strokes=strokes, wedge=wedge, rungs=rung, tip=tip, w=w, hw=hw, top=top, bot=bot)

def poly(p): return 'M' + ' L'.join(f'{x:.2f} {y:.2f}' for x, y in p) + 'Z'
def line(a, b, w, extra=''):
    return f'<line{extra} x1="{a[0]:.2f}" y1="{a[1]:.2f}" x2="{b[0]:.2f}" y2="{b[1]:.2f}" stroke-width="{w}"/>'

def body(g, clip_id, animated=False):
    o = []
    for i, (a, b) in enumerate(g['strokes']):
        o.append(line(a, b, g['w'], f' class="mark-stroke" pathLength="1" style="--o:{i}"' if animated else ''))
    tx, ty = g['tip']
    o.append(f'<path{" class=\"mark-wedge\" style=\"--o:3;transform-origin:%.2fpx %.2fpx\"" % (tx, ty) if animated else ""} d="{poly(g["wedge"])}"/>')
    for i, (a, b) in enumerate(g['rungs']):
        o.append(line(a, b, g['hw'], f' class="mark-rung" style="--r:{i}"' if animated else ''))
    return (f'<clipPath id="{clip_id}"><rect x="0" y="{g["top"]}" width="{VW + 8}" height="{g["bot"] - g["top"]}"/></clipPath>'
            f'<g clip-path="url(#{clip_id})">' + ''.join(o) + '</g>')

def write(root):
    g = geometry()
    mark = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VW} {VH}"><g stroke="#15171b" fill="#15171b">{body(g, "xk")}</g></svg>'
    # favicon: optically simplified for 16-32 px: heavier strokes, wider envelope, three rungs
    f = geometry(w=3.1, top=8.5, bot=23.5, x0=3.4, xw=10.6, st=18.6, aw=8.8, env=6.4, rungs=3, hw=1.9, t0=0.36, t1=0.88)
    fav = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><style>.t{{fill:#15171b}}.m{{stroke:#f4f4f1;fill:#f4f4f1}}'
           f'@media (prefers-color-scheme:dark){{.t{{fill:#e7e7e2}}.m{{stroke:#101113;fill:#101113}}}}</style>'
           f'<rect class="t" width="32" height="32" rx="7"/><g class="m">{body(f, "c")}</g></svg>')
    inline = f'<svg class="mark" viewBox="0 0 {VW} {VH}" aria-hidden="true" focusable="false">{body(g, "xk-cut", animated=True)}</svg>'
    open(os.path.join(root, 'assets/img/mark.svg'), 'w', encoding='utf-8', newline='\n').write(mark + '\n')
    open(os.path.join(root, 'assets/img/favicon.svg'), 'w', encoding='utf-8', newline='\n').write(fav + '\n')
    open(os.path.join(root, 'tools', 'mark-inline.txt'), 'w', encoding='utf-8').write(inline)
    print('wrote mark.svg, favicon.svg, mark-inline.txt')

def raster(root, png512):
    from PIL import Image
    im = Image.open(png512).convert('RGBA')
    im.resize((180, 180), Image.LANCZOS).save(os.path.join(root, 'assets/img/apple-touch-icon.png'))
    for p in ('favicon.ico', 'assets/img/favicon.ico'):
        im.save(os.path.join(root, p), sizes=[(16, 16), (32, 32), (48, 48)])
    print('wrote favicon.ico, apple-touch-icon.png')

if __name__ == '__main__':
    write(sys.argv[1])
    if len(sys.argv) > 2: raster(sys.argv[1], sys.argv[2])

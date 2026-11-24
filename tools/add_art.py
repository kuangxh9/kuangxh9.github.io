"""Prepare the two handscroll reproductions for the site and rebuild the About page.

usage: python -I tools/add_art.py . LANTING_JPG FUCHUN_JPG
(either path may be '-' to skip). Originals: Wikimedia Commons,
  File:LantingXu.jpg                      (4513 × 1480, PD-Art)
  File:富春山居圖(無用師卷).jpg            (26134 × 900, PD-Art)"""
import sys, os, json, subprocess
from PIL import Image

root, lt, fc = sys.argv[1], sys.argv[2], sys.argv[3]
art = os.path.join(root, 'assets', 'art')
os.makedirs(art, exist_ok=True)
mp = os.path.join(art, 'meta.json')
meta = json.load(open(mp, encoding='utf-8')) if os.path.exists(mp) else {}

def prep(src, name, height, quality):
    im = Image.open(src).convert('RGB')
    w = round(im.width * height / im.height)
    im = im.resize((w, height), Image.LANCZOS)
    out = os.path.join(art, name)
    im.save(out, quality=quality, optimize=True, progressive=True)
    print(name, im.size, os.path.getsize(out) // 1024, 'KB')
    return w, height

if lt != '-':
    w, h = prep(lt, 'lanting.jpg', 1100, 84)
    meta['lanting'] = {'file': 'lanting.jpg', 'w': w, 'h': h,
        'note': 'Wang Xizhi’s own sheet is lost. This tracing, made at the Tang court, is the copy closest to his hand; it keeps even his corrections. Hover to look closely at the brushwork.',
        'credit': 'Feng Chengsu after Wang Xizhi. Public domain, via Wikimedia Commons'}
if fc != '-':
    w, h = prep(fc, 'fuchun.jpg', 640, 80)
    meta['fuchun'] = {'file': 'fuchun.jpg', 'w': w, 'h': h,
        'note': 'Huang Gongwang painted it over three or four years, into his eighties. In 1650 a dying collector had it thrown on the fire; his nephew pulled it out in two pieces. The longer one, shown here, is in Taipei; the shorter, Remaining Mountain, is in Hangzhou.',
        'credit': 'National Palace Museum, Taipei. Public domain, via Wikimedia Commons'}
json.dump(meta, open(mp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
here = os.path.dirname(os.path.abspath(__file__))
subprocess.run([sys.executable, '-I', os.path.join(here, 'build_pages.py'), root], check=True)

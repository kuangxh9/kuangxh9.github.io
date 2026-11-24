# Generates research/, cv/, about/ and 404.html.  usage: python -I tools/build_pages.py .
# Edit the content here (or in exhibit_html.py for the About exhibition), then re-run.
import math, random, sys, os, urllib.parse

ROOT = sys.argv[1]
CJK = '琴棋书画点横竖撇捺米字格飞白'

def head(title, desc, path, depth, extra=''):
    up = '../' * depth
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="https://kuangxh9.github.io/{path}">
<meta name="theme-color" content="#f4f4f1" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#101113" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="website">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="https://kuangxh9.github.io/{path}">
<meta property="og:image" content="https://kuangxh9.github.io/assets/img/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="{up}assets/img/favicon.svg" type="image/svg+xml">
<link rel="icon" href="{up}assets/img/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="{up}assets/img/apple-touch-icon.png">
<script>
  (function () {{
    var q = /[?&]theme=(light|dark)/.exec(location.search), t = q && q[1];
    try {{ t = t || localStorage.getItem('theme'); }} catch (e) {{}}
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) document.documentElement.classList.add('js-motion');
    setTimeout(function () {{ document.documentElement.classList.add('is-ready'); }}, 1200);
  }})();
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,100..900;1,62..125,100..900&display=swap">{extra}
<link rel="stylesheet" href="{up}assets/css/site.css">
</head>
'''

NAV = [('research/', 'Research'), ('cv/', 'CV'), ('about/', 'About')]
MARK = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mark-inline.txt'), encoding='utf-8').read()

def header(current, depth, absolute=False):
    up = '/' if absolute else '../' * depth
    links = []
    for href, label in NAV:
        cur = ' aria-current="page"' if label == current else ''
        mark = '<span class="nav-mark" aria-hidden="true"></span>' if label == current else ''
        links.append(f'    <a href="{up}{href}"{cur}>{label}{mark}</a>')
    home = '/' if absolute else (up or './')
    return f'''<a class="skip" href="#main">Skip to content</a>

<header class="site-header grid">
  <p class="site-name"><a class="brand" href="{home}">{MARK}<span>Xiaohan Kuang</span></a></p>
  <nav class="site-nav" aria-label="Primary">
{chr(10).join(links)}
  </nav>
  <div class="site-tools">
    <button class="theme-btn" type="button" data-theme-toggle aria-pressed="false">
      <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 1a7 7 0 0 1 0 14z" fill="currentColor"/></svg>
      <span data-theme-label>Dark</span>
    </button>
  </div>
</header>
'''

def footer(depth, extra_scripts=''):
    up = '../' * depth
    return f'''
<footer class="site-foot grid">
  <p class="c1">Xiaohan Kuang</p>
  <p class="c2">
    <a class="ln" href="mailto:xiaohan.kuang@outlook.com">xiaohan.kuang@outlook.com</a>
    <a class="ln" href="https://github.com/kuangxh9">GitHub</a>
    <a class="ln" href="https://www.linkedin.com/in/xiaohan-kuang-39a508216/">LinkedIn</a>
    <a class="ln" href="https://orcid.org/0009-0001-9781-1509">ORCID</a>
    <a class="ln" href="{up}assets/file/xiaohan_kuang_cv.pdf">CV (PDF)</a>
  </p>
  <details class="c3 colophon">
    <summary>Colophon</summary>
    <div class="colophon-body">
      <p>Set in Archivo, a grotesque with a variable width axis, on a twelve-column grid, with Noto Serif TC for Chinese. One accent, the blue of an electron-density map. The mark is an X beside a K drawn as a stereocentre: its stem is two bonds in the plane of the page, its arms a solid wedge and a hashed wedge; it is set out by <code>tools/monogram.py</code>. The landscape on the home page is invented; the sampler is ordinary annealed Langevin dynamics. Molecules are drawn from RDKit coordinates. Every animation shares one curve, a quick start and a long release. Press G to see the grid.</p>
      <p>Updated November 2026.</p>
    </div>
  </details>
</footer>

<script src="{up}assets/js/site.js" defer></script>{extra_scripts}
</body>
</html>
'''

def toc(items, foot=''):
    rows = ''.join(f'<li><a href="#{i}">{label}</a><span class="tnum">{n}</span></li>' for i, label, n in items)
    return f'''    <nav class="page-index" aria-label="On this page"><ol>{rows}</ol>{foot}</nav>'''

# ------------------------------------------------------------ schematics (current work)
def svg(body, amp=24):
    return f'<svg class="schem" data-amp="{amp}" viewBox="0 0 240 150" aria-hidden="true">{body}</svg>'

def schem_parity():
    r = random.Random(7)
    out = ['<path class="k" d="M30 12 V128 H226"/>', '<line class="f" x1="34" y1="124" x2="216" y2="18"/>',
           '<text class="lab" x="226" y="142" text-anchor="end">measured</text>',
           '<text class="lab" x="22" y="12" text-anchor="end" transform="rotate(-90 22 12)">predicted</text>']
    for i in range(24):
        t = 0.06 + 0.88 * i / 23
        x = 34 + t * 182 + r.gauss(0, 5)
        y = 124 - t * 106 + r.gauss(0, 7)
        cls = 'a s' if i in (17, 21) else 'kf s'
        out.append(f'<circle class="{cls}" cx="{x:.1f}" cy="{y:.1f}" r="{3.2 if cls[0]=="a" else 2.4}"/>')
    return svg(''.join(out), 30)

def schem_graph():
    cx, cy, R = 92, 76, 22
    ring = [(cx + R * math.cos(math.pi / 6 + k * math.pi / 3), cy + R * math.sin(math.pi / 6 + k * math.pi / 3)) for k in range(6)]
    chain = [ring[0], (ring[0][0] + 22, ring[0][1] - 12), (ring[0][0] + 44, ring[0][1]), (ring[0][0] + 66, ring[0][1] - 12)]
    branch = [(chain[2][0], chain[2][1] + 25)]
    sub = [ring[3], (ring[3][0] - 22, ring[3][1] - 12)]
    top = [ring[4], (ring[4][0], ring[4][1] - 25)]
    bonds = [(ring[k], ring[(k + 1) % 6]) for k in range(6)] + list(zip(chain, chain[1:])) + [(chain[2], branch[0]), (sub[0], sub[1]), (top[0], top[1])]
    out = []
    for a, b in bonds:
        out.append(f'<line class="k late" x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}"/>')
    # aromatic hint: an inner circle
    out.append(f'<circle class="k late" cx="{cx}" cy="{cy}" r="{R*0.55:.1f}" opacity=".6"/>')
    atoms = ring + chain[1:] + branch + sub[1:] + top[1:]
    for i, (x, y) in enumerate(atoms):
        cls = 'a s' if i == len(atoms) - 4 else 'kf s'
        out.append(f'<circle class="{cls}" cx="{x:.1f}" cy="{y:.1f}" r="{3.6 if cls[0]=="a" else 2.8}"/>')
    return svg(''.join(out), 34)

def schem_pocket():
    out = ['<path class="k" d="M6 40 C 40 36, 52 52, 62 76 S 84 128, 120 128 S 176 112, 184 76 S 206 38, 236 34"/>',
           '<path class="k" d="M6 58 C 34 56, 44 70, 50 92 S 80 146, 120 146 S 196 128, 200 92 S 214 56, 236 54" opacity=".3"/>']
    lig = [(102, 78), (120, 70), (138, 80), (138, 100), (120, 108), (102, 98), (156, 70), (86, 66)]
    contacts = [(lig[0], (64, 82)), (lig[4], (118, 126)), (lig[3], (176, 100)), (lig[6], (186, 66))]
    for a, b in contacts:
        out.append(f'<line class="f late" x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}"/>')
    for i in range(6):
        a, b = lig[i], lig[(i + 1) % 6]
        out.append(f'<line class="as s" x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}"/>')
    out.append(f'<line class="as s" x1="{lig[2][0]}" y1="{lig[2][1]}" x2="{lig[6][0]}" y2="{lig[6][1]}"/>')
    out.append(f'<line class="as s" x1="{lig[0][0]}" y1="{lig[0][1]}" x2="{lig[7][0]}" y2="{lig[7][1]}"/>')
    for x, y in lig:
        out.append(f'<circle class="a s" cx="{x}" cy="{y}" r="2.6"/>')
    return svg(''.join(out), 40)

def schem_ensemble():
    r = random.Random(3)
    out = []
    for k in range(8):
        pts = []
        for i in range(9):
            x = 14 + i * 26.5
            y = 75 + 34 * math.sin(i * 0.9 + 0.4) * (0.6 + 0.4 * math.cos(i * 0.5)) + r.gauss(0, 4 + i * 0.9)
            pts.append((x, y))
        d = 'M' + ' '.join(f'{x:.1f} {y:.1f}' if j == 0 else f'L{x:.1f} {y:.1f}' for j, (x, y) in enumerate(pts))
        cls = 'as s' if k == 3 else 'k s'
        op = '' if k == 3 else f' opacity="{0.25 + 0.07 * k:.2f}"'
        out.append(f'<path class="{cls}" d="{d}"{op}/>')
    return svg(''.join(out), 18)

# ------------------------------------------------------------ research
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import schematics as SC

def research():
    h = head('Research · Xiaohan Kuang',
             'Research by Xiaohan Kuang in computational chemistry and machine learning: binding affinity and activity prediction, generative design, binding sites, molecular co-folding and agentic workflows, and earlier work on water and metal sites.',
             'research/', 1)
    body = f'''<body class="page-research">
{header('Research', 1)}
<main id="main">
  <section class="page-head grid">
    <h1 class="page-title">Research</h1>
    <p class="page-intro">My field is computational chemistry and my method is machine learning. I build models that predict how molecules bind and how active they will be, generative models that design ligands, peptides and proteins, and agentic systems that put these models to work.</p>
{toc([('now', 'Directions', '5'), ('earlier', 'Earlier work', '4'), ('publications', 'Publications', '5'), ('talks', 'Talks and posters', '2'), ('software', 'Software', '3')])}
    <p class="intro-sub">At Takeda I build and benchmark these models, the GPU pipelines that run them and the harnesses through which AI agents use them, with computational chemists, structural biologists and data scientists. The work is confidential, so this page describes directions rather than results. Beneath it is a wider interest in AI for science: learned models, physical simulation and AI agents working together.</p>
  </section>

  <section class="section grid" id="now" data-reveal aria-labelledby="h-now">
    <h2 class="section-label" id="h-now">Directions<small>Takeda, since June 2025</small></h2>
    <div class="section-body">

      <article class="row thread rv" data-schem-host>
        <div class="schem-wrap">{SC.parity()}</div>
        <div class="row-main">
          <h3>Binding and activity</h3>
          <p>Predicting how tightly a ligand binds its target, the pose it binds in, and how far to trust that pose, so candidates can be ranked for hit triage and lead optimization before anything is synthesized.</p>
          <p class="row-meta">Affinity and pose prediction, pose-quality assessment, ensemble consensus</p>
        </div>
      </article>

      <article class="row thread rv" data-schem-host>
        <div class="schem-wrap">{SC.paracetamol()}</div>
        <div class="row-main">
          <h3>Generative design</h3>
          <p>Generative models that propose ligands for a given pocket, and peptides and proteins with designed sequences, including noncanonical amino acids, checked against physics-based simulation.</p>
          <p class="row-meta">Diffusion, transformer and other 3D generative models; pocket-conditioned generation</p>
        </div>
      </article>

      <article class="row thread rv" data-schem-host>
        <div class="schem-wrap">{SC.pocket()}</div>
        <div class="row-main">
          <h3>Binding sites</h3>
          <p>Where binding happens: pockets, including cryptic ones that open only in some conformations; ternary complexes for targeted protein degradation; and the contacts, waters and metal ions that hold a complex together.</p>
          <p class="row-meta">Pocket and cryptic pocket detection, ternary complex modeling</p>
        </div>
      </article>

      <article class="row thread rv" data-schem-host>
        <div class="schem-wrap">{SC.cofold()}</div>
        <div class="row-main">
          <h3>Molecular co-folding</h3>
          <p>Predicting a protein and its ligand together, as one complex, instead of docking a molecule into a fixed structure. I build pipelines around co-folding models, from sequence alignments to the complexes they produce, assess the poses, and adapt the models to drug-discovery targets.</p>
          <p class="row-meta">Co-folding and MSA-based structure prediction, fine-tuning, GPU pipelines</p>
        </div>
      </article>

      <article class="row thread rv" data-schem-host>
        <div class="schem-wrap">{SC.agents()}</div>
        <div class="row-main">
          <h3>Agentic workflows</h3>
          <p>AI agents that carry out computational work: planning a study, calling structure-prediction, affinity and simulation tools, checking what comes back, and passing results on. I build the execution harnesses and orchestration that let several agents work in parallel on scientific software, and keep their runs reliable and reproducible.</p>
          <p class="row-meta">Agent harnesses, multi-agent orchestration, tool integration, workflow automation</p>
        </div>
      </article>
    </div>
  </section>

  <section class="section grid" id="earlier" data-reveal aria-labelledby="h-earlier">
    <h2 class="section-label" id="h-earlier">Earlier work<small>Meiler Lab, Vanderbilt, 2023–2025</small></h2>
    <div class="section-body">
      <article class="row compact rv" id="superwater">
        <div class="row-date">2024–2025</div>
        <div class="row-main">
          <h3>SuperWater: where water sits</h3>
          <p>A score-based diffusion model on E(3)-equivariant networks that places water molecules on protein structures, with a confidence model that filters and clusters them. It began as DiffWater, which took first place at Vanderbilt’s Spring 2024 AI Showcase.</p>
          <p class="links-inline"><a class="ln" href="https://doi.org/10.1038/s42004-025-01789-4">Communications Chemistry</a><a class="ln" href="https://github.com/kuangxh9/SuperWater">Code</a><a class="ln" href="https://doi.org/10.5281/zenodo.17465949">Zenodo</a><a class="ln" href="https://www.vanderbilt.edu/valiant/2026/01/28/superwater-as-a-generative-ai-framework-to-predict-water-molecule-positions-on-protein-structures">Vanderbilt VALIANT</a></p>
        </div>
        <p class="row-side">First author</p>
      </article>
      <article class="row compact rv" id="supermetal">
        <div class="row-date">2024–2025</div>
        <div class="row-main">
          <h3>SuperMetal: where metal ions bind</h3>
          <p>A generative framework for locating metal ions in proteins; in the paper’s benchmarks it placed them more accurately than AlphaFold 3.</p>
          <p class="links-inline"><a class="ln" href="https://doi.org/10.1186/s13321-025-01038-9">Journal of Cheminformatics</a><a class="ln" href="https://neurips.cc/virtual/2024/102527">NeurIPS 2024 MLSB</a></p>
        </div>
        <p class="row-side">Co-author</p>
      </article>
      <article class="row compact rv" id="amyloid">
        <div class="row-date">2024–2025</div>
        <div class="row-main">
          <h3>Amyloid-like peptides</h3>
          <p>An active learning loop that couples all-atom molecular dynamics with machine learning to search sequence space for new amyloid-forming peptides.</p>
          <p class="links-inline"><a class="ln" href="https://doi.org/10.1101/2025.02.12.637911">bioRxiv</a></p>
        </div>
        <p class="row-side">First author</p>
      </article>
      <article class="row compact rv" id="antibody">
        <div class="row-date">2023–2025</div>
        <div class="row-main">
          <h3>Antibody binding sites and epitopes</h3>
          <p>Antigen surfaces flattened into images so that CNNs can predict antibody binding sites (AUC above 0.93), and a follow-up that predicts conformational B-cell epitopes with a protein language model.</p>
          <p class="links-inline"><a class="ln" href="https://doi.org/10.1016/j.biosystems.2024.105264">BioSystems</a><a class="ln" href="https://doi.org/10.1101/2025.10.29.685313">bioRxiv</a></p>
        </div>
        <p class="row-side">Co-author</p>
      </article>
    </div>
  </section>

  <section class="section grid" id="publications" data-reveal aria-labelledby="h-pubs">
    <h2 class="section-label" id="h-pubs">Publications</h2>
    <ol class="section-body pubs">
      <li class="row pub rv">
        <div class="row-date">2025</div>
        <div class="row-main--wide">
          <h3><a class="ln ln--quiet" href="https://doi.org/10.1038/s42004-025-01789-4">SuperWater as a generative AI framework to predict water molecule positions on protein structures</a></h3>
          <p class="au"><strong>Kuang, X.</strong>, Liu, Y. L., Lin, X., Spencer-Smith, J., Derr, T., Wu, Y., Bitter, H., Hu, Y., Meiler, J., Su, Z. <span class="ve"><i>Communications Chemistry</i> 8, 397</span></p>
        </div>
      </li>
      <li class="row pub rv">
        <div class="row-date">2025</div>
        <div class="row-main--wide">
          <h3><a class="ln ln--quiet" href="https://doi.org/10.1101/2025.10.29.685313">Structure-based predictions of conformational B cell epitopes by protein language model and deep learning</a></h3>
          <p class="au">Zhang, Y., Su, Z., Vilicich, F., <strong>Kuang, X.</strong>, Liu, Y., Zhang, G., Wu, Y. <span class="ve"><i>bioRxiv</i> preprint</span></p>
        </div>
      </li>
      <li class="row pub rv">
        <div class="row-date">2025</div>
        <div class="row-main--wide">
          <h3><a class="ln ln--quiet" href="https://doi.org/10.1186/s13321-025-01038-9">SuperMetal: a generative AI framework for rapid and precise metal ion location prediction in proteins</a></h3>
          <p class="au">Lin, X., Su, Z., Liu, Y. L., Liu, J., <strong>Kuang, X.</strong>, Cummings, P. T., Spencer-Smith, J., Meiler, J. <span class="ve"><i>Journal of Cheminformatics</i> 17, 107; earlier at the <a class="ln" href="https://neurips.cc/virtual/2024/102527">NeurIPS 2024 MLSB workshop</a></span></p>
        </div>
      </li>
      <li class="row pub rv">
        <div class="row-date">2025</div>
        <div class="row-main--wide">
          <h3><a class="ln ln--quiet" href="https://doi.org/10.1101/2025.02.12.637911">Discovering new amyloid-like peptides using all-atom simulations and artificial intelligence</a></h3>
          <p class="au"><strong>Kuang, X.</strong>, Jalali, S., Rahman, T., Michalowski, J., Sheng-Wong, C., Wong-Ekkabut, J., Su, Z., Dias, C. L. <span class="ve"><i>bioRxiv</i> preprint</span></p>
        </div>
      </li>
      <li class="row pub rv">
        <div class="row-date">2024</div>
        <div class="row-main--wide">
          <h3><a class="ln ln--quiet" href="https://doi.org/10.1016/j.biosystems.2024.105264">Machine-learning-based structural analysis of interactions between antibodies and antigens</a></h3>
          <p class="au">Zhang, G., <strong>Kuang, X.</strong>, Zhang, Y., Liu, Y., Su, Z., Zhang, T., Wu, Y. <span class="ve"><i>BioSystems</i> 243, 105264</span></p>
        </div>
      </li>
      <li class="row pub-note rv">
        <div class="row-main--wide"><a class="ln" href="https://orcid.org/0009-0001-9781-1509">ORCID 0009-0001-9781-1509</a><a class="ln" href="https://www.semanticscholar.org/author/2309579441">Semantic Scholar</a></div>
      </li>
    </ol>
  </section>

  <section class="section grid" id="talks" data-reveal aria-labelledby="h-talks">
    <h2 class="section-label" id="h-talks">Talks and posters</h2>
    <div class="section-body">
      <div class="row compact rv"><div class="row-date">Mar 2025</div><div class="row-main--wide"><h3>SuperWater: predicting water molecule positions on protein structures by generative AI</h3><p class="org">Poster P73524, NVIDIA GTC, San Jose, California</p></div></div>
      <div class="row compact rv"><div class="row-date">Mar 2024</div><div class="row-main--wide"><h3>Introduction to generative AI models: diffusion models and their application in protein structure prediction</h3><p class="org">Guest lecture, Vanderbilt University</p></div></div>
    </div>
  </section>

  <section class="section grid" id="software" data-reveal aria-labelledby="h-soft">
    <h2 class="section-label" id="h-soft">Software</h2>
    <div class="section-body">
      <div class="row compact rv"><div class="row-date">2025</div><div class="row-main--wide"><h3><a class="ln ln--quiet" href="https://github.com/kuangxh9/boltz_module">boltz_module</a></h3><p>A modular extension of Boltz-2 that runs confidence and affinity prediction on CIF inputs separately, without diffusion sampling.</p></div></div>
      <div class="row compact rv"><div class="row-date">2024</div><div class="row-main--wide"><h3><a class="ln ln--quiet" href="https://github.com/kuangxh9/SuperWater">SuperWater</a></h3><p>Reference implementation: diffusion with e3nn equivariant networks, ESM-2 embeddings, a confidence model and clustering. MIT licensed, archived on Zenodo.</p></div></div>
      <div class="row compact rv"><div class="row-date">2024</div><div class="row-main--wide"><h3><a class="ln ln--quiet" href="https://github.com/kuangxh9/Fibril_Prediction">Fibril_Prediction</a></h3><p>Notebooks that predict fibril-forming probability for peptide sequences with a small network on ESM-2 embeddings.</p></div></div>
    </div>
  </section>
</main>
{footer(1)}'''
    return h + body

# ------------------------------------------------------------ cv
def nice_date(d):
    # a range may break after its dash, never inside a date
    if '–' in d:
        a, b = d.split('–', 1)
        return f'<span class="nw">{a}–</span><wbr><span class="nw">{b}</span>'
    return f'<span class="nw">{d}</span>'

def cv_row(date, title, org, side, bullets=None):
    date = nice_date(date)
    bl = ''
    if bullets:
        bl = '\n          <ul class="bul">\n' + '\n'.join(f'            <li>{b}</li>' for b in bullets) + '\n          </ul>'
    org_html = f'<p class="org">{org}</p>' if org else ''
    side_html = f'<p class="row-side">{side}</p>' if side else ''
    return f'''      <div class="row rv">
        <div class="row-date">{date}</div>
        <div class="row-main"><h3>{title}</h3>{org_html}{bl}</div>
        {side_html}
      </div>'''

def cv():
    h = head('CV · Xiaohan Kuang',
             'Curriculum vitae of Xiaohan Kuang: computational chemistry at Takeda, earlier research at Vanderbilt University Medical Center, education, teaching, awards and skills.',
             'cv/', 1)
    exp = '\n'.join([
        cv_row('Jun 2025–now', 'Senior Research Associate', 'Takeda Pharmaceuticals', 'Cambridge, MA', [
            'Build end-to-end, GPU-accelerated pipelines for sequence preprocessing, MSA and co-folding structure prediction, training and reproducible evaluation, with experiment tracking.',
            'Fine-tune generative models for structure prediction, affinity prediction and pocket-guided ligand design; added pose-quality assessment and filtering to improve downstream success rates.',
            'Develop a peptide design workflow that combines physics-based simulation with AI models to introduce noncanonical amino acids.',
            'Scale ligand and residue-mutation screening: automated input preparation and quality checks, parallel high-throughput sampling, and prioritization by ensemble model consensus.',
            'Design and build agentic workflows: execution harnesses and orchestration through which AI agents run and coordinate computational-chemistry tools and pipelines.',
            'Work with computational chemists and structural biologists in Schrödinger Maestro and LiveDesign to review poses and track structure–property relationships across campaigns.']),
        cv_row('Oct 2023–Mar 2025', 'Research Assistant', 'Meiler Lab, Vanderbilt University Medical Center', 'Nashville, TN', [
            'Built SuperWater, a generative and geometric deep learning framework for predicting water positions on proteins; published in Communications Chemistry (2025).',
            'Co-developed SuperMetal, which placed metal ions more accurately than AlphaFold 3; NeurIPS 2024 MLSB workshop, then the Journal of Cheminformatics.',
            'Designed a method that turns antigen surfaces into 2D images for CNN-based binding site prediction; part of this work is published in BioSystems.',
            'Implemented an active learning framework combining molecular dynamics and machine learning to study peptide fibril formation.']),
        cv_row('Oct–Dec 2023', 'Research Assistant', 'Data Science Institute, Vanderbilt University', 'Nashville, TN', [
            'Built a Streamlit web platform that turns academic papers into plain-language summaries, with a Python backend, user accounts and customization.']),
    ])
    edu = '\n'.join([cv_row('2025', 'MS, Data Science', 'Vanderbilt University', 'Nashville, TN'),
                     cv_row('2022', 'BS, Computer Science, Mathematics and Data Science', 'University of Wisconsin–Madison', 'Madison, WI')])
    teach = '\n'.join([cv_row('2024–2025', 'Head Teaching Assistant, DS 3262 Applied Machine Learning', 'Vanderbilt University', ''),
                       cv_row('2024–2025', 'Teaching Assistant, DS 5640 Machine Learning; DS 5220 Principles of Programming and Simulation', 'Vanderbilt University', ''),
                       cv_row('Spring 2022', 'Course Assistant, Math 535 Mathematical Methods in Data Science', 'University of Wisconsin–Madison', '')])
    talks = '\n'.join([cv_row('Mar 2025', 'Poster P73524: SuperWater', 'NVIDIA GTC', 'San Jose, CA'),
                       cv_row('Mar 2024', 'Guest lecture: diffusion models and their application in protein structure prediction', 'Vanderbilt University', 'Nashville, TN')])
    awards = '\n'.join([cv_row('2025', 'Graduate School Travel Grant', '', ''),
                        cv_row('2024', 'First place, Spring 2024 AI Showcase, for DiffWater', 'With Yunchao Liu and Zhaoqian Su', ''),
                        cv_row('2024', 'Data Science for Social Good Research Scholarship', '', ''),
                        cv_row('2023', 'Data Science Institute Award', '', '')])
    body = f'''<body class="page-cv">
{header('CV', 1)}
<main id="main">
  <section class="page-head grid">
    <h1 class="page-title">CV</h1>
    <p class="page-intro">Machine learning for computational chemistry and drug discovery: binding and activity prediction, generative design, structure and co-folding, and agentic workflows. Trained in computer science, mathematics and data science.</p>
{toc([('experience', 'Experience', '3'), ('education', 'Education', '2'), ('teaching', 'Teaching', '3'), ('talks', 'Talks', '2'), ('awards', 'Awards', '4'), ('skills', 'Skills', '5')], '<p class="index-foot"><a class="ln" href="../assets/file/xiaohan_kuang_cv.pdf">Download PDF</a> or print this page</p>')}
  </section>

  <section class="section grid" id="experience" data-reveal aria-labelledby="h-exp">
    <h2 class="section-label" id="h-exp">Experience</h2>
    <div class="section-body">
{exp}
    </div>
  </section>
  <section class="section grid" id="education" data-reveal aria-labelledby="h-edu">
    <h2 class="section-label" id="h-edu">Education</h2>
    <div class="section-body">
{edu}
    </div>
  </section>
  <section class="section grid" id="teaching" data-reveal aria-labelledby="h-teach">
    <h2 class="section-label" id="h-teach">Teaching</h2>
    <div class="section-body">
{teach}
    </div>
  </section>
  <section class="section grid" id="talks" data-reveal aria-labelledby="h-talk">
    <h2 class="section-label" id="h-talk">Talks</h2>
    <div class="section-body">
{talks}
    </div>
  </section>
  <section class="section grid" id="awards" data-reveal aria-labelledby="h-aw">
    <h2 class="section-label" id="h-aw">Awards<small>Vanderbilt University</small></h2>
    <div class="section-body">
{awards}
    </div>
  </section>
  <section class="section grid" id="skills" data-reveal aria-labelledby="h-sk">
    <h2 class="section-label" id="h-sk">Skills</h2>
    <dl class="section-body skills">
      <div class="row rv"><dt class="row-date">Machine learning</dt><dd class="row-main--wide">PyTorch, TensorFlow; diffusion models, graph neural networks, CNNs, transformers, variational autoencoders</dd></div>
      <div class="row rv"><dt class="row-date">Agentic AI</dt><dd class="row-main--wide">Agent harnesses and execution infrastructure, multi-agent orchestration, tool integration, scientific workflow automation</dd></div>
      <div class="row rv"><dt class="row-date">Structure and chemistry</dt><dd class="row-main--wide">RDKit, Biopython, Gemmi, PyMOL, Schrödinger Maestro, LiveDesign, 3Dmol.js</dd></div>
      <div class="row rv"><dt class="row-date">Compute</dt><dd class="row-main--wide">Linux, CUDA and GPU computing, HPC and SLURM, Docker, AWS, Git</dd></div>
      <div class="row rv"><dt class="row-date">Languages and data</dt><dd class="row-main--wide">Python, R, MySQL, PostgreSQL, MongoDB</dd></div>
    </dl>
  </section>
</main>
{footer(1)}'''
    return h + body

# ------------------------------------------------------------ about
def art_tab(id, zh, en, sub):
    return f'''        <button type="button" class="art-tab" role="tab" id="tab-{id}" data-art="{id}" aria-controls="art-{id}" aria-selected="false" tabindex="-1">
          <span class="cjk" lang="zh-Hans">{zh}</span><span class="tl"><b>{en}</b><small>{sub}</small></span>
        </button>'''

def about():
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import exhibit_html, json as _json
    art = os.path.join(ROOT, 'assets', 'art')
    meta = {}
    mp = os.path.join(art, 'meta.json')
    if os.path.exists(mp): meta = _json.load(open(mp, encoding='utf-8'))
    have = {'lee': os.path.exists(os.path.join(art, 'go-lee-sedol-alphago-4.json')),
            'shusaku': os.path.exists(os.path.join(art, 'go-shusaku-gennan-1846.json')),
            'lanting': meta.get('lanting'), 'fuchun': meta.get('fuchun')}
    EXHIBIT = exhibit_html.exhibit(have)
    font = 'https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;600&display=swap&text={TC}'
    h = head('About · Xiaohan Kuang',
             'About Xiaohan Kuang: from computer science and mathematics to computational chemistry and AI for science, and the arts outside the lab.',
             'about/', 1, extra=f'\n<link rel="stylesheet" href="{font}">')
    body = f'''<body class="page-about">
{header('About', 1)}
<main id="main">
  <section class="page-head grid">
    <h1 class="page-title">About</h1>
    <div class="page-intro">
      <p>I trained in computer science, mathematics and data science, and found my problems in chemistry. The questions I work on are about molecular recognition: where a molecule binds, how tightly, and whether a model can learn to propose a better one. Increasingly I also build the agentic systems that carry such models through a whole scientific workflow.</p>
      <ol class="path">
        <li><span class="tnum">Until 2022</span><p>BS in computer science, mathematics and data science at the University of Wisconsin–Madison.</p></li>
        <li><span class="tnum">2023–2025</span><p>MS in data science at Vanderbilt, with research in the Meiler Lab on generative models for structural biology, from water and metal sites to antibody epitopes. The Data Science Institute <a class="ln" href="https://www.vanderbilt.edu/datascience/2024/10/03/vanderbilt-data-science-postdoctoral-fellows-push-the-boundaries-of-generative-ai-in-protein-science/">wrote about</a> the work.</p></li>
        <li><span class="tnum">2025–</span><p>Computational chemistry at Takeda in Cambridge: machine learning for binding, activity and design, co-folding pipelines, and agentic workflows, toward a broader practice of AI for science.</p></li>
      </ol>
    </div>
    <div class="page-aside">
      <picture>
        <source type="image/webp" srcset="../assets/img/portrait-480.webp 480w, ../assets/img/portrait-960.webp 960w" sizes="(max-width: 860px) 220px, 300px">
        <img class="portrait" src="../assets/img/portrait-480.jpg" srcset="../assets/img/portrait-480.jpg 480w, ../assets/img/portrait-960.jpg 960w" sizes="(max-width: 860px) 220px, 300px" width="480" height="600" alt="Xiaohan Kuang outdoors on a mountain ridge at sunset" decoding="async">
      </picture>
    </div>
  </section>

{EXHIBIT}

</main>
{footer(1, chr(10) + '<script src="../assets/js/exhibit.js" defer></script>' + chr(10) + '<script src="../assets/js/go.js" defer></script>')}'''
    if True:
        chars = ''.join(sorted({ch for ch in body if '\u3000' <= ch <= '\u9fff' or '\uf900' <= ch <= '\ufaff'}))
        h = h.replace('{TC}', urllib.parse.quote(chars))
    return h + body

def notfound():
    h = head('Not found · Xiaohan Kuang', 'Page not found.', '404.html', 0).replace('href="assets/', 'href="/assets/')
    body = f'''<body class="page-404">
{header('', 0, absolute=True)}
<main id="main" class="grid nf">
  <pre class="nf-pdb" data-type aria-label="This page is missing, like an unresolved residue in a crystal structure.">REMARK 465
REMARK 465 MISSING RESIDUES
REMARK 465 THE FOLLOWING RESIDUES WERE NOT LOCATED IN THE
REMARK 465 EXPERIMENT.
REMARK 465
REMARK 465   M RES C SSSEQI
REMARK 465     404 A    404</pre>
  <div class="nf-text">
    <h1 class="page-title">Not found</h1>
    <p class="page-intro">This page was not resolved in the structure. Try the <a class="ln" href="/">home page</a>, <a class="ln" href="/research/">research</a> or the <a class="ln" href="/cv/">CV</a>.</p>
  </div>
</main>
<script src="/assets/js/site.js" defer></script>
</body>
</html>
'''
    return h + body

for rel, fn in [('research/index.html', research), ('cv/index.html', cv), ('about/index.html', about), ('404.html', notfound)]:
    p = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(p) or '.', exist_ok=True)
    with open(p, 'w', encoding='utf-8', newline='\n') as f:
        f.write(fn())
    print('wrote', rel)

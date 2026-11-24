/* Site-wide behaviour: theme, load choreography, reveals, schematics, grid overlay. */
(function () {
  'use strict';
  var root = document.documentElement;
  var motion = root.classList.contains('js-motion');

  /* ---- Theme ---------------------------------------------------------- */
  var mqDark = matchMedia('(prefers-color-scheme: dark)');
  function isDark() {
    var t = root.dataset.theme;
    return t ? t === 'dark' : mqDark.matches;
  }
  function syncThemeUI() {
    var dark = isDark();
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(dark));
      var l = b.querySelector('[data-theme-label]');
      if (l) l.textContent = dark ? 'Light' : 'Dark';
      b.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    });
    var meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (meta) meta.content = dark ? '#101113' : '#f4f4f1';
  }
  function setTheme(next) {
    var apply = function () {
      root.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch (e) {}
      syncThemeUI();
      document.dispatchEvent(new CustomEvent('themechange'));
    };
    if (motion && document.startViewTransition) document.startViewTransition(apply);
    else apply();
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-theme-toggle]');
    if (b) setTheme(isDark() ? 'light' : 'dark');
  });
  mqDark.addEventListener('change', function () {
    syncThemeUI();
    document.dispatchEvent(new CustomEvent('themechange'));
  });
  syncThemeUI();

  /* ---- Start the choreography once type is in: no swap mid-motion ---- */
  function ready() { requestAnimationFrame(function () { root.classList.add('is-ready'); }); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(ready, ready);
  else ready();

  /* ---- Lede: split into words so each can come into focus ------------ */
  document.querySelectorAll('[data-words]').forEach(function (el) {
    var words = el.textContent.trim().split(/\s+/);
    el.setAttribute('aria-label', el.textContent.trim());
    el.textContent = '';
    words.forEach(function (w, i) {
      var s = document.createElement('span');
      s.className = 'w';
      s.setAttribute('aria-hidden', 'true');
      s.style.setProperty('--i', i);
      s.textContent = w;
      el.appendChild(s);
      if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
    });
  });

  /* ---- Reveals: each [data-reveal] group settles once ----------------- */
  var groups = document.querySelectorAll('[data-reveal]');
  groups.forEach(function (g) {
    g.querySelectorAll('.rv').forEach(function (el, i) { el.style.setProperty('--i', Math.min(i, 10)); });
  });
  if (motion && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.01 });
    groups.forEach(function (g) { io.observe(g); });
  } else {
    groups.forEach(function (g) { g.classList.add('is-in'); });
  }

  /* ---- Schematics: parts start displaced, settle into structure ------- */
  function gauss() {
    var u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function scatter(host) {
    host.querySelectorAll('.schem .s').forEach(function (el, i) {
      var amp = parseFloat(el.closest('.schem').dataset.amp || '22');
      el.style.setProperty('--dx', (gauss() * amp).toFixed(1) + 'px');
      el.style.setProperty('--dy', (gauss() * amp).toFixed(1) + 'px');
      el.style.setProperty('--i', i % 40);
    });
  }
  var hosts = document.querySelectorAll('[data-schem-host]');
  hosts.forEach(scatter);
  if (motion && 'IntersectionObserver' in window) {
    var so = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-settled');
        so.unobserve(en.target);
      });
    }, { threshold: 0.35 });
    hosts.forEach(function (h) {
      so.observe(h);
      // Hovering a thread re-samples its schematic: a new draw from noise.
      var last = 0;
      h.addEventListener('pointerenter', function (e) {
        if (e.pointerType !== 'mouse' || !h.classList.contains('is-settled')) return;
        var now = performance.now();
        if (now - last < 1600) return;
        last = now;
        h.classList.remove('is-settled');
        scatter(h);
        void h.offsetWidth;
        requestAnimationFrame(function () { h.classList.add('is-settled'); });
      });
    });
  } else {
    hosts.forEach(function (h) { h.classList.add('is-settled'); });
  }

  /* ---- Co-folding: the chain and the ligand form one complex together ---
     The protein is drawn as a cartoon: two antiparallel β-strands make the
     floor of the pocket, an α-helix its roof, loops its walls. It starts as
     a random coil with the ligand free; residues settle from the N-terminus
     on, secondary structure forms as each part arrives, the ligand is drawn
     in as the pocket closes, and the contacts appear last. */
  document.querySelectorAll('svg[data-cofold]').forEach(function (svg) {
    var NS = 'http://www.w3.org/2000/svg';
    var chainG = svg.querySelector('.cf-chain'), lig = svg.querySelector('.cf-lig'), contG = svg.querySelector('.cf-contacts');
    var SEGS = [
      ['loop', [[4, 117], [16, 113], [30, 110]]],
      ['strand', [[30, 110], [152, 110]]],
      ['loop', [[152, 110], [170, 108], [175, 101], [167, 95], [152, 95]]],
      ['strand', [[152, 95], [44, 95]]],
      ['loop', [[44, 95], [22, 88], [12, 64], [18, 38], [36, 23]]],
      ['helix', [[36, 22], [182, 22]]],
      ['loop', [[182, 22], [198, 30], [205, 50], [206, 74]]]
    ];
    function cr(p0, p1, p2, p3, t) {
      var t2 = t * t, t3 = t2 * t;
      return [0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
              0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)];
    }
    // the folded chain, sampled about every unit of length, each sample tagged with its structure
    var F = [];
    SEGS.forEach(function (sg) {
      var P = sg[1], out = [];
      if (sg[0] === 'loop') {
        for (var i = 0; i < P.length - 1; i++) {
          var p0 = P[Math.max(0, i - 1)], p3 = P[Math.min(P.length - 1, i + 2)];
          var n = Math.ceil(Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]));
          for (var k = 0; k < n; k++) out.push(cr(p0, P[i], P[i + 1], p3, k / n));
        }
      } else {
        var L = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]);
        for (var k2 = 0; k2 < L; k2++) out.push([P[0][0] + (P[1][0] - P[0][0]) * k2 / L, P[0][1] + (P[1][1] - P[0][1]) * k2 / L]);
      }
      var start = F.length;
      out.forEach(function (p, j) { F.push({ x: p[0], y: p[1], type: sg[0], u: j, len: out.length, seg: start }); });
    });
    F.push({ x: 206, y: 74, type: 'loop', u: 0, len: 1 });
    var N = F.length;
    // the unfolded chain: a loose random coil across the box
    var U = F.map(function (f, i) {
      var s = i / (N - 1);
      return [6 + 200 * s, 60 + 30 * Math.sin(6.283 * 2.2 * s + 0.7) * (0.65 + 0.35 * Math.sin(17 * s)) + 7 * Math.sin(6.283 * 8.5 * s)];
    });
    var ease = function (t) { return 1 - Math.pow(1 - t, 3); };
    var clampv = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
    var back = document.createElementNS(NS, 'path'); back.setAttribute('class', 'k cf-back'); chainG.appendChild(back);
    var ribbons = [document.createElementNS(NS, 'path'), document.createElementNS(NS, 'path')];
    ribbons.forEach(function (r) { r.setAttribute('class', 'k cf-ribbon'); chainG.appendChild(r); });
    // contacts: helix to the carbonyl oxygen, strand to the amide nitrogen
    var texts = Array.prototype.slice.call(lig.querySelectorAll('text'));
    var atomAt = function (t) { var e = texts.filter(function (x) { return x.textContent.indexOf(t) >= 0; })[0]; return e ? [parseFloat(e.getAttribute('x')), parseFloat(e.getAttribute('y'))] : null; };
    var O = atomAt('O'), Nn = atomAt('N');
    var contacts = [];
    if (O) contacts.push([[O[0], 30], [O[0], O[1] - 11]]);
    if (Nn) contacts.push([[Nn[0], 90], [Nn[0], Nn[1] + 5]]);
    contacts.forEach(function (c) {
      var l = document.createElementNS(NS, 'line'); l.setAttribute('class', 'f cf-hb');
      l.setAttribute('x1', c[0][0]); l.setAttribute('y1', c[0][1]); l.setAttribute('x2', c[1][0]); l.setAttribute('y2', c[1][1]);
      var d = document.createElementNS(NS, 'circle'); d.setAttribute('class', 'a cf-hb'); d.setAttribute('cx', c[0][0]); d.setAttribute('cy', c[0][1] + (c[0][1] < 60 ? -2 : 2)); d.setAttribute('r', 2.2);
      contG.appendChild(l); contG.appendChild(d);
    });

    function frame(t) {
      var pts = [], R = 6.5, pitch = 11;
      for (var i = 0; i < N; i++) {
        var f = F[i], s = i / (N - 1);
        var p = ease(clampv((t - 0.32 * s) / 0.62));                 // N-terminus first
        var a = ease(clampv((p - 0.55) / 0.45));                     // structure forms on arrival
        var x = U[i][0] + (f.x - U[i][0]) * p, y = U[i][1] + (f.y - U[i][1]) * p;
        if (f.type === 'helix' && a > 0) {
          var th = 6.283 * f.u / pitch, env = Math.min(1, f.u / 5, (f.len - f.u) / 5);
          x += 0.5 * R * Math.sin(th) * a * env; y += R * Math.cos(th) * a * env - R * a * env * 0.0;
        }
        pts.push([x, y, f, a]);
      }
      back.setAttribute('d', 'M' + pts.map(function (q) { return q[0].toFixed(2) + ' ' + q[1].toFixed(2); }).join(' L'));
      // β-strands: ribbons with an arrowhead pointing to the C-terminus
      var si = 0;
      for (var j = 0; j < N && si < 2; j++) {
        if (pts[j][2].type !== 'strand' || pts[j][2].u !== 0) continue;
        var len = pts[j][2].len, L1 = [], L2 = [];
        for (var u = 0; u < len; u++) {
          var q = pts[j + u], qn = pts[Math.min(j + u + 1, N - 1)], qp = pts[Math.max(j + u - 1, 0)];
          var tx = qn[0] - qp[0], ty = qn[1] - qp[1], tl = Math.hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl;
          var head = len - u < 16 ? (len - u) / 16 * 6.4 : 3.2;     // body half-width 3.2, head 6.4 tapering
          var w = head * q[3];
          L1.push([q[0] + nx * w, q[1] + ny * w]); L2.push([q[0] - nx * w, q[1] - ny * w]);
          if (len - u === 16) { L1.push([q[0] + nx * 6.4 * q[3], q[1] + ny * 6.4 * q[3]]); L2.push([q[0] - nx * 6.4 * q[3], q[1] - ny * 6.4 * q[3]]); }
        }
        var poly = L1.concat(L2.reverse());
        ribbons[si].setAttribute('d', 'M' + poly.map(function (q) { return q[0].toFixed(2) + ' ' + q[1].toFixed(2); }).join(' L') + 'Z');
        ribbons[si].style.opacity = pts[j][3] > 0.02 ? 1 : 0;
        si++;
      }
      // the ligand is drawn in as the pocket closes
      var l = ease(clampv((t - 0.18) / 0.72));
      lig.setAttribute('transform', 'translate(' + (64 * (1 - l)).toFixed(2) + ' ' + (-40 * (1 - l)).toFixed(2) + ') rotate(' + (50 * (1 - l)).toFixed(2) + ' 108 60)');
      lig.style.opacity = 0.25 + 0.75 * l;
      contG.style.opacity = clampv((t - 0.92) / 0.08);
    }
    var raf = 0;
    function run() {
      cancelAnimationFrame(raf);
      if (!motion) { frame(1); return; }
      var t0 = performance.now(), D = 2800;
      (function step(now) { var t = Math.min(1, (now - t0) / D); frame(t); if (t < 1) raf = requestAnimationFrame(step); })(t0);
    }
    frame(motion ? 0 : 1);
    var host = svg.closest('[data-schem-host]');
    if (host && motion) {
      new MutationObserver(function () { if (host.classList.contains('is-settled')) run(); else { cancelAnimationFrame(raf); frame(0); } })
        .observe(host, { attributes: true, attributeFilter: ['class'] });
      if (host.classList.contains('is-settled')) run();
    } else frame(1);
  });

  /* ---- Agentic workflows: the trace is revealed as it runs ------------- */
  document.querySelectorAll('svg[data-trace]').forEach(function (svg) {
    var clip = svg.querySelector('.trace-clip'), headL = svg.querySelector('.trace-head');
    var X0 = 50, X1 = 214, raf = 0;
    function at(t) {
      var x = X0 + (X1 - X0) * t;
      clip.setAttribute('width', (x + 10).toFixed(2));
      headL.setAttribute('x1', x.toFixed(2)); headL.setAttribute('x2', x.toFixed(2));
      headL.style.opacity = t > 0 && t < 1 ? 1 : 0;
    }
    function run() {
      cancelAnimationFrame(raf);
      if (!motion) { at(1); return; }
      var t0 = performance.now(), D = 3600;
      (function step(now) {
        var u = Math.min(1, (now - t0) / D);
        // steady, like a clock, with a short settle at the end
        at(u < 0.9 ? u / 0.9 * 0.96 : 0.96 + 0.04 * (1 - Math.pow(1 - (u - 0.9) / 0.1, 3)));
        if (u < 1) raf = requestAnimationFrame(step);
      })(t0);
    }
    var host = svg.closest('[data-schem-host]');
    if (host && motion) {
      at(0);
      new MutationObserver(function () { if (host.classList.contains('is-settled')) run(); else { cancelAnimationFrame(raf); at(0); } })
        .observe(host, { attributes: true, attributeFilter: ['class'] });
      if (host.classList.contains('is-settled')) run();
    } else at(1);
  });

  /* ---- The mark writes itself in stroke order on hover ---------------- */
  document.querySelectorAll('.brand').forEach(function (a) {
    if (!motion || !a.querySelector('.mark-stroke')) return;
    var last = 0;
    a.addEventListener('pointerenter', function () {
      var now = performance.now(); if (now - last < 1400) return; last = now;
      a.classList.remove('is-writing'); void a.offsetWidth; a.classList.add('is-writing');
    });
  });

  /* ---- Nav: a hairline that glides to whatever you point at ----------- */
  document.querySelectorAll('.site-nav').forEach(function (nav) {
    var bar = document.createElement('span');
    bar.className = 'nav-hover'; bar.setAttribute('aria-hidden', 'true');
    nav.appendChild(bar);
    function to(a) {
      var n = nav.getBoundingClientRect(), r = a.getBoundingClientRect();
      bar.style.width = r.width + 'px';
      bar.style.transform = 'translateX(' + (r.left - n.left) + 'px)';
      bar.classList.add('is-on');
    }
    nav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('pointerenter', function () { to(a); });
      a.addEventListener('focus', function () { to(a); });
      a.addEventListener('blur', function () { bar.classList.remove('is-on'); });
    });
    nav.addEventListener('pointerleave', function () { bar.classList.remove('is-on'); });
  });

  /* ---- A typewriter, used once: for things that are printed records --- */
  document.querySelectorAll('[data-type]').forEach(function (el) {
    var text = el.textContent;
    if (!motion) return;
    el.textContent = '';
    var out = document.createElement('span'); out.setAttribute('aria-hidden', 'true');
    var caret = document.createElement('span'); caret.className = 'caret'; caret.setAttribute('aria-hidden', 'true');
    el.appendChild(out); el.appendChild(caret);
    var i = 0;
    (function type() {
      if (i >= text.length) { caret.classList.add('is-idle'); return; }
      var ch = text[i++];
      out.textContent += ch;
      // a human rhythm: quick runs, a beat after words, longer at line ends
      var d = 14 + Math.random() * 26;
      if (ch === ' ') d += Math.random() < 0.15 ? 60 : 8;
      if (ch === '\n') d = 160 + Math.random() * 220;
      if (Math.random() < 0.012) d += 320;
      setTimeout(type, d);
    })();
  });

  /* ---- Press G: show the 12-column grid this site is set on ----------- */
  var overlay;
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'g' && e.key !== 'G') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    // not while typing, and not while playing: G is also a piano key
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|CANVAS)$/.test(t.tagName))) return;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'grid-overlay grid';
      overlay.setAttribute('aria-hidden', 'true');
      for (var i = 0; i < 12; i++) overlay.appendChild(document.createElement('i'));
      document.body.appendChild(overlay);
    }
    overlay.classList.toggle('is-on');
  });

  /* ---- A note for whoever opens the console ---------------------------- */
  try {
    console.log('%cXiaohan Kuang', 'font: 600 15px Archivo, sans-serif');
    console.log([
      'Set in Archivo on a 12-column grid, with Noto Serif TC for Chinese. No framework, no build step.', '',
      '· The mark: an X beside a K drawn as a stereocentre, its arms a solid wedge and a hashed wedge.',
      '· Press G on any page to see the grid.',
      '· The home page samples an invented affinity landscape with annealed Langevin dynamics.',
      '  Click it to release samplers; hover to read ΔG and the Kd it implies.',
      '· Research drawings are set from RDKit 2D coordinates; hover one to draw it again.',
      '· On the About page, four arts: Clair de lune falls onto a keyboard, Recuerdos on six strings,',
      '  two Go games replayed in ink, and two handscrolls to unroll.', '',
      'Source: https://github.com/kuangxh9/kuangxh9.github.io'].join('\n'));
  } catch (e) {}
})();

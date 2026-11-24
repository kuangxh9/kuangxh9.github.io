/* ==========================================================================
   Fig. 1 — An affinity landscape, sampled.

   A toy binding free-energy surface ΔG(z) over a two-dimensional latent
   space of molecules, drawn as a topographic map: contours every 0.5
   kcal/mol, ink pooling in the wells. Generative samplers search it with
   annealed Langevin dynamics,

       z ← z − η ∇ΔG(z) + √(2ηT) ξ,   T annealed toward 0,

   which is how guided generative models look for strong binders. The
   landscape is invented; the method is real.
   ========================================================================== */
(function () {
  'use strict';

  var fig = document.querySelector('[data-landscape]');
  if (!fig) return;
  var stage = fig.querySelector('[data-stage]');
  var canvas = stage.querySelector('canvas');
  var ctx = canvas.getContext('2d');
  var probe = fig.querySelector('[data-probe]');
  var outT = fig.querySelector('[data-out="T"]');
  var outN = fig.querySelector('[data-out="n"]');
  var outB = fig.querySelector('[data-out="best"]');
  var btnNew = fig.querySelector('[data-act="target"]');
  var btnMot = fig.querySelector('[data-act="motion"]');
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- constants ---------- */
  var K = 6;                 // wells
  var STEP = 0.5;            // kcal/mol between contours
  var ETA = 0.00042;         // Langevin step size
  var T0 = 2.2, TMIN = 0.025, TAU = 0.85;   // annealing schedule (s)
  var BOWL = 1.7;            // far from good chemotypes, binding is weak
  var TRAIL = 34;            // stored positions per sampler
  var MAXP = 150;
  var RT = 0.5925;           // kcal/mol at 298 K

  /* ---------- state ---------- */
  var W = 1, H = 1, DPR = 1;
  var PL = 44, PB = 30, PT = 10, PR = 16, px0 = 0, py0 = 0, pw = 1, ph = 1, vr = 0.6;
  var GX = 160, GY = 90, E = new Float32Array(1), Emin = 0, Emax = 0;
  var levels = [];                       // {v, path, f}
  var params = null, fromP = null, toP = null, morph = 1, morphT0 = 0;
  var seed = (Date.now() % 100000) | 0;
  var particles = [];
  var t0 = 0, gT = T0, annealT0 = 0;
  var dev = reduced ? 1 : 0, devT0 = 0;
  var hits = [], hitAlpha = 0, lastHitCheck = 0;
  var pointer = null, hoverE = null;
  var paused = false, visible = true, raf = 0, lastNow = 0, started = false;
  var idleTimer = 0, lastUser = 0;
  var colors = {}, inkRGB = [21, 23, 27], dark = false;
  var wash = document.createElement('canvas'), wctx = wash.getContext('2d'), wimg = null;
  var wash2 = document.createElement('canvas'), w2 = wash2.getContext('2d');
  var canFilter = 'filter' in w2;

  /* ---------- utils ---------- */
  function rng(s) {
    return function () {
      s |= 0; s = s + 0x6D2B79F5 | 0;
      var r = Math.imul(s ^ s >>> 15, 1 | s);
      r = r + Math.imul(r ^ r >>> 7, 61 | r) ^ r;
      return ((r ^ r >>> 14) >>> 0) / 4294967296;
    };
  }
  function gauss() { var u = 1 - Math.random(), v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185 * v); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(x) { return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function minus(s) { return String(s).replace('-', '−'); }
  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    ['ink', 'ink-2', 'ink-3', 'rule', 'accent', 'paper'].forEach(function (k) { colors[k] = cs.getPropertyValue('--' + k).trim(); });
    var h = colors.ink.replace('#', '');
    if (h.length === 6) inkRGB = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    dark = parseInt(colors.paper.replace('#', '').slice(0, 2), 16) < 90;
  }

  /* ---------- the landscape ---------- */
  function makeParams(s) {
    var r = rng(s), wells = [];
    for (var k = 0; k < K; k++) {
      var cx, cy, ok, tries = 0;
      do {
        cx = -0.82 + r() * 1.64; cy = -0.78 + r() * 1.56; ok = true;
        for (var j = 0; j < wells.length; j++) if (Math.hypot(cx - wells[j].cx, (cy - wells[j].cy) * 0.7) < 0.36) ok = false;
      } while (!ok && ++tries < 60);
      var sx = 0.075 + r() * 0.13;
      wells.push({
        cx: cx, cy: cy,                                   // cy is a fraction of the vertical half-range
        A: k === 0 ? 6.4 + r() * 1.6 : 2.0 + r() * 4.2,
        sx: sx, sy: sx * (0.5 + r() * 0.9), th: r() * Math.PI
      });
    }
    return { wells: wells, base: -3.3, a1: 0.45 + r() * 0.35, a2: 0.22 + r() * 0.2, p1: r() * 6.28, p2: r() * 6.28, p3: r() * 6.28 };
  }
  function lerpParams(a, b, m) {
    var o = { wells: [], base: a.base, a1: a.a1 + (b.a1 - a.a1) * m, a2: a.a2 + (b.a2 - a.a2) * m,
              p1: a.p1 + (b.p1 - a.p1) * m, p2: a.p2 + (b.p2 - a.p2) * m, p3: a.p3 + (b.p3 - a.p3) * m };
    for (var k = 0; k < K; k++) {
      var p = a.wells[k], q = b.wells[k], w = {};
      for (var key in p) w[key] = p[key] + (q[key] - p[key]) * m;
      o.wells.push(w);
    }
    return o;
  }
  // ΔG at latent point (u, v), kcal/mol
  function energy(u, v, P) {
    var vn = v / vr;
    var e = P.base + BOWL * (u * u * 0.8 + vn * vn) +
      P.a1 * Math.sin(2.1 * u + P.p1) * Math.cos(1.9 * vn + P.p2) + P.a2 * Math.sin(3.4 * u - 2.6 * vn + P.p3);
    for (var k = 0; k < K; k++) {
      var w = P.wells[k], du = u - w.cx, dv = v - w.cy * vr;
      var c = Math.cos(w.th), s = Math.sin(w.th);
      var x = c * du + s * dv, y = -s * du + c * dv;
      e -= w.A * Math.exp(-(x * x / (2 * w.sx * w.sx) + y * y / (2 * w.sy * w.sy)));
    }
    return e;
  }
  // analytic ∇ΔG: one pass, no finite differences
  function grad(u, v, P) {
    var vn = v / vr;
    var s1 = Math.sin(2.1 * u + P.p1), c1 = Math.cos(2.1 * u + P.p1), s2 = Math.sin(1.9 * vn + P.p2), c2 = Math.cos(1.9 * vn + P.p2);
    var c3 = Math.cos(3.4 * u - 2.6 * vn + P.p3);
    var gu = BOWL * 1.6 * u + P.a1 * 2.1 * c1 * c2 + P.a2 * 3.4 * c3;
    var gv = BOWL * 2 * vn / vr - P.a1 * s1 * s2 * 1.9 / vr - P.a2 * 2.6 / vr * c3;
    for (var k = 0; k < K; k++) {
      var w = P.wells[k], du = u - w.cx, dv = v - w.cy * vr;
      var c = Math.cos(w.th), s = Math.sin(w.th);
      var x = c * du + s * dv, y = -s * du + c * dv;
      var ix = 1 / (w.sx * w.sx), iy = 1 / (w.sy * w.sy);
      var g = w.A * Math.exp(-(x * x * ix + y * y * iy) / 2);
      gu += g * (x * ix * c - y * iy * s);
      gv += g * (x * ix * s + y * iy * c);
    }
    return [gu, gv];
  }

  function toX(u) { return px0 + (u + 1) / 2 * pw; }
  function toY(v) { return py0 + (1 - (v + vr) / (2 * vr)) * ph; }
  function toU(x) { return (x - px0) / pw * 2 - 1; }
  function toV(y) { return (1 - (y - py0) / ph) * 2 * vr - vr; }

  function computeField() {
    var n = (GX + 1) * (GY + 1);
    if (E.length !== n) E = new Float32Array(n);
    Emin = 1e9; Emax = -1e9;
    for (var j = 0; j <= GY; j++) {
      var v = vr - 2 * vr * j / GY;
      for (var i = 0; i <= GX; i++) {
        var e = energy(-1 + 2 * i / GX, v, params);
        E[j * (GX + 1) + i] = e;
        if (e < Emin) Emin = e; if (e > Emax) Emax = e;
      }
    }
    // contours: marching squares, then each level's segments are traced into
    // continuous polylines (crossings are keyed by the grid edge they lie on)
    // and smoothed with two rounds of Chaikin subdivision before drawing
    levels = [];
    var cw = pw / GX, chh = ph / GY, S = GX + 1;
    for (var L = Math.ceil(Emin / STEP) * STEP; L < Emax; L += STEP) {
      var pts = {}, adj = {};
      var link = function (k1, p1, k2, p2) {
        pts[k1] = p1; pts[k2] = p2;
        (adj[k1] = adj[k1] || []).push(k2); (adj[k2] = adj[k2] || []).push(k1);
      };
      for (j = 0; j < GY; j++) for (i = 0; i < GX; i++) {
        var a = E[j * S + i], b = E[j * S + i + 1], c = E[(j + 1) * S + i + 1], d = E[(j + 1) * S + i];
        var idx = (a < L ? 1 : 0) | (b < L ? 2 : 0) | (c < L ? 4 : 0) | (d < L ? 8 : 0);
        if (idx === 0 || idx === 15) continue;
        var x = px0 + i * cw, y = py0 + j * chh;
        var eT = (j * S + i) * 2, eB = ((j + 1) * S + i) * 2, eL = (j * S + i) * 2 + 1, eR = (j * S + i + 1) * 2 + 1;
        var top = [x + cw * (L - a) / (b - a), y], right = [x + cw, y + chh * (L - b) / (c - b)];
        var bot = [x + cw * (L - d) / (c - d), y + chh], left = [x, y + chh * (L - a) / (d - a)];
        switch (idx) {
          case 1: case 14: link(eL, left, eT, top); break;
          case 2: case 13: link(eT, top, eR, right); break;
          case 3: case 12: link(eL, left, eR, right); break;
          case 4: case 11: link(eR, right, eB, bot); break;
          case 6: case 9: link(eT, top, eB, bot); break;
          case 7: case 8: link(eL, left, eB, bot); break;
          case 5: link(eL, left, eT, top); link(eR, right, eB, bot); break;
          case 10: link(eT, top, eR, right); link(eB, bot, eL, left); break;
        }
      }
      var path = new Path2D(), seen = {};
      var trace = function (start) {
        var line = [pts[start]], prev = null, cur = start; seen[cur] = 1;
        while (true) {
          var nb = (adj[cur] || []).filter(function (k) { return k !== prev && !seen[k]; });
          if (!nb.length) {   // closed loop?
            if ((adj[cur] || []).indexOf(start) >= 0 && line.length > 2) line.closed = true;
            break;
          }
          prev = cur; cur = nb[0]; seen[cur] = 1; line.push(pts[cur]);
        }
        return line;
      };
      // open lines start at their ends; then whatever remains is closed loops
      var keys = Object.keys(adj);
      keys.forEach(function (k) { if (!seen[k] && adj[k].length === 1) addLine(path, trace(+k)); });
      keys.forEach(function (k) { if (!seen[k]) addLine(path, trace(+k)); });
      levels.push({ v: L, path: path, f: (Emax - L) / (Emax - Emin), index: Math.abs(L / 2 - Math.round(L / 2)) < 1e-6 });
    }
    // ink wash: depth pools in the wells
    if (!wimg || wimg.width !== S) { wash.width = S; wash.height = GY + 1; wimg = wctx.createImageData(S, GY + 1); wash2.width = S; wash2.height = GY + 1; }
    paintWash();
  }
  // Chaikin corner cutting: converges to a quadratic B-spline through the
  // traced crossings, so curves are smooth without moving off the level set
  function chaikin(line, rounds) {
    var p = line, closed = line.closed;
    for (var r = 0; r < rounds; r++) {
      var q = [], n = p.length;
      if (!closed) q.push(p[0]);
      for (var i = 0; i < (closed ? n : n - 1); i++) {
        var a = p[i], b = p[(i + 1) % n];
        q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      if (!closed) q.push(p[n - 1]);
      q.closed = closed; p = q;
    }
    return p;
  }
  function addLine(path, line) {
    if (line.length < 2) return;
    var s = chaikin(line, 2);
    path.moveTo(s[0][0], s[0][1]);
    for (var i = 1; i < s.length; i++) path.lineTo(s[i][0], s[i][1]);
    if (s.closed) path.closePath();
  }
  function paintWash() {
    var d8 = wimg.data, span = Emax - Emin || 1;
    for (var k = 0; k < E.length; k++) {
      var f = (Emax - E[k]) / span, o = k * 4;
      d8[o] = inkRGB[0]; d8[o + 1] = inkRGB[1]; d8[o + 2] = inkRGB[2];
      d8[o + 3] = Math.pow(f, 2.2) * (dark ? 70 : 92);
    }
    wctx.putImageData(wimg, 0, 0);
    w2.clearRect(0, 0, wash2.width, wash2.height);
    if (canFilter) w2.filter = 'blur(1.2px)';
    w2.drawImage(wash, 0, 0);
    if (canFilter) w2.filter = 'none';
  }

  /* ---------- samplers ---------- */
  function spawn(u, v, n, T, spread) {
    var now = performance.now();
    for (var i = 0; i < n; i++) {
      var p = { x: u, y: v, T: T, tr: new Float32Array(TRAIL * 2), head: 0, len: 0, born: now, k: 0, age: 0 };
      if (spread == null) { p.x = -1 + Math.random() * 2; p.y = (-1 + Math.random() * 2) * vr; }
      else { p.x = clamp(u + gauss() * spread, -0.99, 0.99); p.y = clamp(v + gauss() * spread, -vr * 0.99, vr * 0.99); }
      record(p);
      particles.push(p);
    }
    while (particles.length > MAXP) particles.shift();
  }
  function record(p) {
    p.tr[p.head * 2] = p.x; p.tr[p.head * 2 + 1] = p.y;
    p.head = (p.head + 1) % TRAIL; if (p.len < TRAIL) p.len++;
  }
  function stepAll(dtS) {
    var steps = Math.max(1, Math.round(dtS * 120));
    for (var s = 0; s < steps; s++) {
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        var T = Math.max(gT, p.T);
        var g = grad(p.x, p.y, params);
        var gx = clamp(g[0], -60, 60), gy = clamp(g[1], -60, 60);
        var nz = Math.sqrt(2 * ETA * T) * 0.52;
        p.x += -ETA * gx + nz * gauss();
        p.y += -ETA * gy + nz * gauss();
        if (p.x < -1) p.x = -2 - p.x; if (p.x > 1) p.x = 2 - p.x;
        if (p.y < -vr) p.y = -2 * vr - p.y; if (p.y > vr) p.y = 2 * vr - p.y;
        p.T = Math.max(TMIN, p.T * Math.pow(0.5, 1 / (120 * 1.1)));   // half-life 1.1 s for released samplers
        if (++p.k % 3 === 0) record(p);
      }
    }
  }

  function findHits() {
    // group settled samplers by the well they sit in; report the best basins
    var groups = {};
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (Math.max(gT, p.T) > 0.16) continue;
      var best = -1, bd = 1e9;
      for (var k = 0; k < K; k++) {
        var w = params.wells[k], d = Math.hypot(p.x - w.cx, p.y - w.cy * vr) / Math.max(w.sx, w.sy);
        if (d < bd) { bd = d; best = k; }
      }
      if (bd > 2.6) continue;
      (groups[best] = groups[best] || []).push(p);
    }
    var out = [];
    for (var key in groups) {
      var g = groups[key], mx = 0, my = 0;
      g.forEach(function (p) { mx += p.x; my += p.y; });
      mx /= g.length; my /= g.length;
      out.push({ x: mx, y: my, e: energy(mx, my, params), n: g.length });
    }
    out.sort(function (a, b) { return a.e - b.e; });
    return out.slice(0, 3);
  }

  function kd(e) {
    var M = Math.exp(e / RT);
    if (M < 1e-6) return (M * 1e9).toPrecision(2) + ' nM';
    if (M < 1e-3) return (M * 1e6).toPrecision(2) + ' µM';
    return (M * 1e3).toPrecision(2) + ' mM';
  }

  /* ---------- layout ---------- */
  function resize() {
    var r = stage.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    var small = W < 520;
    PL = small ? 34 : 44; PB = small ? 26 : 30;
    px0 = PL; py0 = PT; pw = W - PL - PR; ph = H - PT - PB;
    vr = ph / pw;                                     // isotropic latent units
    fig.style.setProperty('--axis-l', PL + 'px'); fig.style.setProperty('--axis-r', PR + 'px');
    GX = W > 900 ? 210 : W > 520 ? 150 : 104;
    GY = Math.max(24, Math.round(GX * ph / pw));
    if (params) computeField();
    kick();
  }

  /* ---------- draw ---------- */
  function draw(now) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var dv = ease(dev);

    // wash
    ctx.save();
    ctx.globalAlpha = dv;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canFilter ? wash2 : wash, px0, py0, pw, ph);
    ctx.restore();

    // contours: deepest first while developing
    var n = levels.length;
    var hoverLevel = hoverE != null ? Math.round(hoverE / STEP) * STEP : null;
    for (var i = 0; i < n; i++) {
      var L = levels[i];
      var appear = clamp((dev * 1.35 - (1 - L.f) * 0.9) / 0.35, 0, 1);
      if (appear <= 0) continue;
      ctx.strokeStyle = colors.ink; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      // never thinner than one device pixel: a sub-pixel stroke is anti-aliased
      // unevenly along its length and reads as broken. Lightness comes from opacity.
      ctx.lineWidth = L.index ? Math.max(1.05, 1.5 / DPR) : Math.max(0.62, 1 / DPR);
      ctx.globalAlpha = appear * (L.index ? 0.3 + 0.45 * Math.pow(L.f, 1.1) : (0.1 + 0.28 * Math.pow(L.f, 1.2)) * (dark ? 1.15 : 1));
      ctx.stroke(L.path);
    }
    if (hoverLevel != null) {
      for (i = 0; i < n; i++) if (Math.abs(levels[i].v - hoverLevel) < 1e-6) {
        ctx.globalAlpha = 0.85; ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.1;
        ctx.stroke(levels[i].path);
      }
    }
    ctx.globalAlpha = 1;

    drawRulers();

    // sampler trails: tapered, like a brush lifting off. Segments are
    // batched into six weights so the whole field is six strokes.
    ctx.lineCap = 'round';
    ctx.strokeStyle = colors.accent;
    var buckets = [new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    for (i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (p.len < 2 || now - p.born < 120) continue;
      var start = (p.head - p.len + TRAIL) % TRAIL;
      var x0 = toX(p.tr[start * 2]), y0 = toY(p.tr[start * 2 + 1]);
      for (var k = 1; k < p.len; k++) {
        var q = (start + k) % TRAIL, x1 = toX(p.tr[q * 2]), y1 = toY(p.tr[q * 2 + 1]);
        var bk = Math.min(5, ((k / p.len) * 6) | 0);
        buckets[bk].moveTo(x0, y0); buckets[bk].lineTo(x1, y1);
        x0 = x1; y0 = y1;
      }
    }
    for (var bi = 0; bi < 6; bi++) {
      var f = (bi + 0.5) / 6;
      ctx.globalAlpha = f * f * 0.6;
      ctx.lineWidth = 0.4 + 1.5 * f;
      ctx.stroke(buckets[bi]);
    }
    ctx.fillStyle = colors.accent;
    for (i = 0; i < particles.length; i++) {
      p = particles[i];
      ctx.globalAlpha = clamp((now - p.born) / 300, 0, 1);
      ctx.beginPath(); ctx.arc(toX(p.x), toY(p.y), 2.1, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // the best basins found
    if (hits.length && hitAlpha > 0) {
      ctx.font = '500 12px Archivo, system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      hits.forEach(function (h, j) {
        var x = toX(h.x), y = toY(h.y), a = hitAlpha * (j === 0 ? 1 : 0.75);
        ctx.globalAlpha = a;
        ctx.strokeStyle = colors.ink; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, 9 + (j === 0 ? 3 : 0), 0, 6.283); ctx.stroke();
        var txt = minus(h.e.toFixed(1)), tw = ctx.measureText(txt).width;
        var flip = x + 20 + tw > px0 + pw;                 // near the right edge, label to the left
        var lx = flip ? x - 16 - tw : x + 16, ly = y - 14;
        ctx.beginPath(); ctx.moveTo(x + (flip ? -7 : 7), y - 6); ctx.lineTo(flip ? lx + tw + 2 : lx - 2, ly + 2); ctx.stroke();
        ctx.fillStyle = colors.paper;
        ctx.globalAlpha = a * 0.85; ctx.fillRect(lx - 2, ly - 8, tw + 4, 16);
        ctx.globalAlpha = a; ctx.fillStyle = colors.ink; ctx.textAlign = 'left';
        ctx.fillText(txt, lx, ly);
      });
      ctx.globalAlpha = 1;
    }

    // pointer: the direction a sampler would go from here
    if (pointer && hoverE != null) {
      var u = toU(pointer.x), v = toV(pointer.y), g = grad(u, v, params);
      var gl = Math.hypot(g[0], g[1]);
      if (gl > 0.05) {
        var len = clamp(gl * 1.4, 10, 46);
        var ex = pointer.x - g[0] / gl * len, ey = pointer.y + g[1] / gl * len;
        ctx.strokeStyle = colors.accent; ctx.fillStyle = colors.accent; ctx.lineWidth = 1.25; ctx.globalAlpha = 0.95;
        ctx.beginPath(); ctx.moveTo(pointer.x, pointer.y); ctx.lineTo(ex, ey); ctx.stroke();
        var ang = Math.atan2(ey - pointer.y, ex - pointer.x);
        ctx.beginPath(); ctx.moveTo(ex, ey);
        ctx.lineTo(ex - 6 * Math.cos(ang - 0.45), ey - 6 * Math.sin(ang - 0.45));
        ctx.lineTo(ex - 6 * Math.cos(ang + 0.45), ey - 6 * Math.sin(ang + 0.45)); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(pointer.x, pointer.y, 2.4, 0, 6.283); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawRulers() {
    var ink3 = colors['ink-3'], x0 = px0, y0 = py0 + ph;
    ctx.font = '400 10.5px Archivo, system-ui, sans-serif';
    ctx.fillStyle = ink3;
    ctx.globalAlpha = Math.min(0.75, dev * 2.5);
    ctx.fillRect(x0, y0, pw, 1);
    ctx.fillRect(x0, py0, 1, ph);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (var t = -10; t <= 10; t++) {
      var u = t / 10, sx = Math.round(toX(u)) + 0.5, major = t % 5 === 0;
      ctx.fillRect(sx - 0.5, y0, 1, major ? 5 : 2.5);
      if (major && t < 10) ctx.fillText(minus(u === 0 ? '0' : u.toFixed(1)), sx, y0 + 10);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    var tv = Math.floor(vr * 10);
    for (t = -tv; t <= tv; t++) {
      var v = t / 10, sy = Math.round(toY(v)) + 0.5;
      major = t % 5 === 0;
      ctx.fillRect(x0 - (major ? 5 : 2.5), sy - 0.5, major ? 5 : 2.5, 1);
      if (major) ctx.fillText(minus(v === 0 ? '0' : v.toFixed(1)), x0 - 11, sy);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('z₁', px0 + pw - 12, y0 + 10);
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('z₂', x0 - 11, py0 - 1);
    if (pointer) {
      ctx.globalAlpha = 1; ctx.fillStyle = colors.accent;
      ctx.fillRect(Math.round(pointer.x), y0 - 5, 1, 12);
      ctx.fillRect(x0 - 6, Math.round(pointer.y), 12, 1);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- loop ---------- */
  function kick() { if (!raf && started) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    var dt = Math.min(0.05, lastNow ? (now - lastNow) / 1000 : 1 / 60);
    lastNow = now;
    if (dev < 1) dev = clamp((now - devT0) / 1700, 0, 1);
    if (morph < 1) {
      morph = clamp((now - morphT0) / 1500, 0, 1);
      params = lerpParams(fromP, toP, ease(morph));
      computeField();
    }
    if (!paused) {
      gT = TMIN + (T0 - TMIN) * Math.exp(-Math.max(0, now - annealT0) / 1000 / TAU);
      if (now > annealT0) stepAll(dt);
    }
    if (now - lastHitCheck > 400) {
      lastHitCheck = now;
      var h = findHits();
      if (h.length) hits = h;
      if (gT < 0.16 && hits.length) {
        outB.textContent = minus(hits[0].e.toFixed(1));
      }
    }
    hitAlpha = clamp(hitAlpha + (gT < 0.16 && hits.length ? dt * 1.6 : -dt * 4), 0, 1);
    outT.textContent = gT.toFixed(2);
    outN.textContent = particles.length;
    draw(now);
    if (visible && (!paused || dev < 1 || morph < 1)) raf = requestAnimationFrame(frame);
    else lastNow = 0;
  }

  /* ---------- the sequence ---------- */
  function anneal(fromT, delay) {
    var now = performance.now() + (delay || 0);
    // set the clock so the schedule starts at fromT
    annealT0 = now - Math.max(0, -Math.log((fromT - TMIN) / (T0 - TMIN))) * TAU * 1000;
    hits = []; hitAlpha = 0; outB.textContent = '–';
  }
  function newTarget() {
    seed = (seed * 9301 + 49297) % 233280;
    fromP = params; toP = makeParams(seed); morph = 0; morphT0 = performance.now();
    if (reduced) { morph = 1; params = toP; computeField(); }
    anneal(1.1);
    if (reduced) settleNow();
    lastUser = performance.now();
    kick();
  }
  function settleNow() {
    var save = annealT0;
    for (var s = 0; s < 900; s++) {
      gT = TMIN + (T0 - TMIN) * Math.exp(-s / 120 / TAU);
      stepAll(1 / 120);
    }
    gT = TMIN; annealT0 = save - 1e6;
    hits = findHits(); hitAlpha = 1;
    if (hits.length) outB.textContent = minus(hits[0].e.toFixed(1));
  }
  function idle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      if (visible && !paused && !reduced && performance.now() - lastUser > 6000) {
        spawn(-0.85 + Math.random() * 1.7, (-0.8 + Math.random() * 1.6) * vr, 7, 1.3, 0.03);
        kick();
      }
      idle();
    }, 7000 + Math.random() * 4000);
  }

  /* ---------- input ---------- */
  function local(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function inPlot(p) { return p.x >= px0 && p.x <= px0 + pw && p.y >= py0 && p.y <= py0 + ph; }
  function updateProbe() {
    if (!pointer || !inPlot(pointer) || !params) { pointer = pointer && inPlot(pointer) ? pointer : null; hoverE = null; probe.classList.remove('is-on'); return; }
    var u = toU(pointer.x), v = toV(pointer.y), e = energy(u, v, params);
    hoverE = e;
    probe.innerHTML = '<b>ΔG ' + minus(e.toFixed(1)) + ' kcal/mol</b><br>K<sub>d</sub> ≈ ' + kd(e) +
      '<br>z = (' + minus(u.toFixed(2)) + ', ' + minus(v.toFixed(2)) + ')';
    probe.classList.add('is-on');
  }
  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    pointer = local(e); updateProbe(); kick();
  });
  canvas.addEventListener('pointerleave', function () { pointer = null; hoverE = null; probe.classList.remove('is-on'); kick(); });
  canvas.addEventListener('click', function (e) {
    var p = local(e);
    if (!inPlot(p)) return;
    lastUser = performance.now();
    spawn(toU(p.x), toV(p.y), 14, 1.5, 0.018);
    if (reduced) settleNow();
    kick();
  });
  canvas.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); lastUser = performance.now();
      spawn(-0.7 + Math.random() * 1.4, (-0.7 + Math.random() * 1.4) * vr, 14, 1.5, 0.02);
      if (reduced) settleNow();
      kick();
    }
  });
  btnNew.addEventListener('click', newTarget);
  function syncMot() { btnMot.setAttribute('aria-pressed', String(paused)); btnMot.textContent = paused ? 'Resume' : 'Pause'; }
  btnMot.addEventListener('click', function () { paused = !paused; syncMot(); kick(); });

  document.addEventListener('themechange', function () { readColors(); if (params) paintWash(); kick(); });
  document.addEventListener('visibilitychange', function () { visible = !document.hidden; if (visible) kick(); });
  if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { visible = en[0].isIntersecting && !document.hidden; if (visible) kick(); }).observe(stage);
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage); else window.addEventListener('resize', resize);

  /* ---------- boot: after the page transition, so the contour field never competes with it ---------- */
  readColors();
  resize();
  (window.__revealed || Promise.resolve()).then(boot);
  function boot() {
  params = makeParams(seed);
  computeField();
  started = true;
  if (reduced) {
    paused = false;
    spawn(0, 0, 72, 0, null);
    settleNow();
    paused = true; syncMot();
    draw(performance.now());
  } else {
    syncMot();
    var go = function () {
      devT0 = performance.now();
      anneal(T0, 700);
      setTimeout(function () { spawn(0, 0, 72, 0, null); kick(); }, 600);
      idle();
      kick();
    };
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(go, go);
  }
  }
})();

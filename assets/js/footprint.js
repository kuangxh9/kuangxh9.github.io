/* Visitor footprint.

   1. Counting: one beacon per page view to the site's own counter (see
      analytics/worker.js), only on the live site, and never for visitors who
      ask not to be tracked (Do Not Track, Global Privacy Control), automated
      browsers, or anyone who has opened the site once with ?notrack=1.
      No cookies; the counter stores aggregates by day, page and country.
   2. Display, on the home page: a small dot-matrix world with a mark for each
      country, sized by its share of page views, and the totals beside it.
      Real numbers only: until the counter is configured and has data, the
      block stays hidden.
   The counter's address is the <meta name="xk-stats"> of each page; empty
   means off. */
(function () {
  'use strict';
  var meta = document.querySelector('meta[name="xk-stats"]');
  var base = meta ? meta.content.trim().replace(/\/$/, '') : '';
  var live = location.hostname === 'kuangxh9.github.io';
  var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

  (function count() {
    if (!base || !live) return;
    try {
      if (/[?&]notrack=1\b/.test(location.search)) localStorage.setItem('xk-notrack', '1');
      if (/[?&]notrack=0\b/.test(location.search)) localStorage.removeItem('xk-notrack');
      if (localStorage.getItem('xk-notrack') === '1') return;
    } catch (e) {}
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl || navigator.webdriver) return;
    var path = location.pathname.replace(/index\.html$/, '');
    try { navigator.sendBeacon(base + '/hit', new Blob([JSON.stringify({ p: path })], { type: 'text/plain' })); } catch (e) {}
  })();

  var el = document.querySelector('[data-footprint]');
  if (!el) return;
  // on a local preview a test can hand in data; the live site only ever shows the counter's own numbers
  var source = local && window.__xkStats ? Promise.resolve(window.__xkStats)
    : base ? fetch(base + '/stats', { credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : null; }) : Promise.resolve(null);
  Promise.all([source, fetch(el.dataset.world).then(function (r) { return r.json(); })]).then(function (v) {
    if (v[0] && v[0].views > 0) render(v[0], v[1]);
  }).catch(function () {});

  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  function month(d) { if (!d) return ''; var t = new Date(d + 'T00:00:00Z'); return t.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }); }

  function render(st, world) {
    var canvas = el.querySelector('canvas'), text = el.querySelector('.fp-text'), ctx = canvas.getContext('2d');
    var motion = document.documentElement.classList.contains('js-motion');
    var known = st.countries.filter(function (c) { return c.c !== 'XX'; });
    var nC = known.length;
    var rest = '<b>' + fmt(st.views) + '</b> page views from <b>' + nC + '</b> ' + (nC === 1 ? 'country' : 'countries') + (st.since ? ', since ' + month(st.since) : '');
    text.innerHTML = rest;
    el.hidden = false;
    // keep the home page to one screen: drop the map, then the whole block, if the column cannot hold them
    // the home page is one screen on desktop: the footprint never makes it scroll
    function fits() { return innerWidth <= 860 || document.documentElement.scrollHeight <= innerHeight + 1; }
    if (!fits()) el.classList.add('is-text');
    if (!fits()) { el.hidden = true; return; }

    var W = 0, H = 0, DPR = 1, cols = {}, marks = [], t0 = performance.now(), hover = null;
    var LAT0 = 82, LAT1 = -56;
    function readColors() { var cs = getComputedStyle(document.documentElement); ['ink', 'ink-3', 'accent', 'paper'].forEach(function (k) { cols[k] = cs.getPropertyValue('--' + k).trim(); }); }
    function P(lon, lat) { return [(lon + 180) / 360 * W, (LAT0 - lat) / (LAT0 - LAT1) * H]; }
    function size() {
      var b = canvas.getBoundingClientRect(); if (b.width < 20) return;
      W = b.width; H = b.height; DPR = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
      var max = known.length ? known[0].v : 1;
      marks = known.map(function (c, i) {
        var g = world.countries[c.c]; if (!g) return null;
        var p = P(g[0], g[1]);
        return { x: p[0], y: p[1], r: 1.4 + 3.6 * Math.sqrt(c.v / max), v: c.v, name: g[2], i: i };
      }).filter(Boolean);
      draw(performance.now());
    }
    function draw(now) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
      var dr = Math.max(0.45, W / 360 * 0.55);
      ctx.fillStyle = cols['ink-3']; ctx.globalAlpha = 0.42;
      world.dots.forEach(function (row) { row[1].forEach(function (lon) { var p = P(lon, row[0]); ctx.fillRect(p[0] - dr / 2, p[1] - dr / 2, dr, dr); }); });
      var busy = false;
      marks.forEach(function (m) {
        var e = motion ? Math.min(1, Math.max(0, (now - t0 - m.i * 40) / 700)) : 1; if (e < 1) busy = true;
        var k = 1 - Math.pow(1 - e, 3), on = hover === m;
        ctx.globalAlpha = (on ? 0.5 : 0.28) * k; ctx.fillStyle = cols.accent;
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r * k, 0, 6.283); ctx.fill();
        ctx.globalAlpha = (on ? 1 : 0.85) * k; ctx.beginPath(); ctx.arc(m.x, m.y, Math.min(1.3, m.r * k), 0, 6.283); ctx.fill();
      });
      ctx.globalAlpha = 1;
      if (busy) requestAnimationFrame(draw);
    }
    canvas.addEventListener('pointermove', function (e) {
      var b = canvas.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top, best = null, bd = 9;
      marks.forEach(function (m) { var d = Math.hypot(m.x - x, m.y - y) - m.r; if (d < bd) { bd = d; best = m; } });
      if (best === hover) return; hover = best;
      text.innerHTML = best ? best.name + ' <b>' + fmt(best.v) + '</b> ' + (best.v === 1 ? 'view' : 'views') : rest;
      draw(performance.now());
    });
    canvas.addEventListener('pointerleave', function () { hover = null; text.innerHTML = rest; draw(performance.now()); });
    document.addEventListener('themechange', function () { readColors(); draw(performance.now()); });
    readColors();
    if (!el.classList.contains('is-text')) {
      if ('ResizeObserver' in window) new ResizeObserver(size).observe(canvas); else size();
    }
  }
})();

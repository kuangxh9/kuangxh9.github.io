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
  var mock = local && window.__xkStats;               // a local test may hand in data; the live site never does
  if (!base && !mock) return;                         // no counter configured: nothing is shown

  // the block takes its final size at once (map drawn, two lines of text reserved),
  // so nothing moves when the numbers arrive
  var canvas = el.querySelector('canvas'), text = el.querySelector('.fp-text'), ctx = canvas.getContext('2d');
  var motion = document.documentElement.classList.contains('js-motion');
  // keep the home page to one screen: the map gives way to its line of text, and the
  // line to nothing, only when the column cannot hold them. Decided again once the
  // web font has loaded (fallback metrics are larger) and whenever the window changes.
  // on desktop the block sits in the column's bottom-left corner: it must clear the text above it
  var above = el.parentElement.querySelector('.background');
  function clear() { if (innerWidth <= 860 || !above) return true; return el.getBoundingClientRect().top >= above.getBoundingClientRect().bottom + 12; }
  function fits() { return clear() && (innerWidth <= 860 || document.documentElement.scrollHeight <= innerHeight + 1); }
  function fit() {
    el.hidden = false; el.classList.remove('is-text'); el.style.removeProperty('--fp-w'); el.style.removeProperty('--fp-h');
    // full size where there is room; otherwise smaller, in the same proportion; then text; then nothing
    for (var h = 104; h >= 64 && !fits(); h -= 8) { el.style.setProperty('--fp-h', h + 'px'); el.style.setProperty('--fp-w', Math.round(h * 2.9) + 'px'); }
    if (!fits()) el.classList.add('is-text');
    if (!fits()) el.hidden = true;
  }
  fit();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fit(); layout(); });
  var rt = 0; addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { fit(); layout(); }, 150); });

  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  function month(d) { if (!d) return ''; var t = new Date(d + 'T00:00:00Z'); return t.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }); }

  var world = null, st = null, W = 0, H = 0, DPR = 1, cols = {}, marks = [], t0 = 0, hover = null, rest = '';
  var LAT0 = 76, LAT1 = -48;                         // inhabited latitudes: the polar ice is left out
  function readColors() { var cs = getComputedStyle(document.documentElement); ['ink', 'ink-3', 'accent', 'paper'].forEach(function (k) { cols[k] = cs.getPropertyValue('--' + k).trim(); }); }
  function P(lon, lat) { return [(lon + 180) / 360 * W, (LAT0 - lat) / (LAT0 - LAT1) * H]; }
  function layout() {
    var b = canvas.getBoundingClientRect(); if (b.width < 20 || !world) return;
    W = b.width; H = b.height; DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    marks = [];
    if (st) {
      var known = st.countries.filter(function (c) { return c.c !== 'XX'; }), max = known.length ? known[0].v : 1;
      marks = known.map(function (c, i) {
        var g = world.countries[c.c]; if (!g) return null;
        var q = P(g[0], g[1]);
        return { x: q[0], y: q[1], r: 1.8 + 5.2 * Math.sqrt(c.v / max), v: c.v, name: g[2], i: i };
      }).filter(Boolean);
    }
    draw(performance.now());
  }
  function draw(now) {
    if (!W) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
    var dr = Math.max(0.9, W / 360 * 2 * 0.6);           // each dot about 60% of the 2° grid spacing
    var darkTheme = parseInt((cols.paper || '#ffffff').replace('#', '').slice(0, 2), 16) < 90;
    ctx.fillStyle = cols['ink-3']; ctx.globalAlpha = darkTheme ? 0.7 : 0.6;
    world.dots.forEach(function (row) { if (row[0] > LAT0 || row[0] < LAT1) return; row[1].forEach(function (lon) { var q = P(lon, row[0]); ctx.beginPath(); ctx.arc(q[0], q[1], dr / 2, 0, 6.283); ctx.fill(); }); });
    var busy = false;
    marks.forEach(function (m) {
      var e = motion ? Math.min(1, Math.max(0, (now - t0 - m.i * 40) / 700)) : 1; if (e < 1) busy = true;
      var k = 1 - Math.pow(1 - e, 3), on = hover === m;
      ctx.globalAlpha = (on ? 0.55 : 0.36) * k; ctx.fillStyle = cols.accent;
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r * k, 0, 6.283); ctx.fill();
      ctx.globalAlpha = k; ctx.beginPath(); ctx.arc(m.x, m.y, Math.min(1.6, m.r * k), 0, 6.283); ctx.fill();
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
  canvas.addEventListener('pointerleave', function () { if (!hover) return; hover = null; text.innerHTML = rest; draw(performance.now()); });
  document.addEventListener('themechange', function () { readColors(); draw(performance.now()); });
  readColors();
  if ('ResizeObserver' in window) new ResizeObserver(layout).observe(canvas);

  fetch(el.dataset.world).then(function (r) { return r.json(); }).then(function (w) { world = w; layout(); }).catch(function () {});
  var source = mock ? Promise.resolve(mock) : fetch(base + '/stats', { credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : null; });
  source.then(function (data) {
    if (!data) return;                                 // the counter could not be reached: the map stays, no numbers are invented
    st = data;
    var nC = st.countries.filter(function (c) { return c.c !== 'XX'; }).length;
    rest = st.views > 0
      ? '<b>' + fmt(st.views) + '</b> page ' + (st.views === 1 ? 'view' : 'views') + ' from <b>' + nC + '</b> ' + (nC === 1 ? 'country' : 'countries') + (st.since ? ', since ' + month(st.since) : '')
      : 'No page views counted yet.';
    text.innerHTML = rest; t0 = performance.now(); layout();
  }).catch(function () {});
})();

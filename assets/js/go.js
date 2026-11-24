/* ==========================================================================
   棋 — a recorded game, replayed in ink.

   Every position of the record is rebuilt with the rules (captures, ko), and
   each stone's influence, f(p) = Σ ±exp(−d²/2σ²), is painted as wash: darker
   where Black is stronger, paler where White is. Beside the board, the
   balance of influence over the whole game is drawn as one curve; it is also
   the timeline. The key move pauses the replay for a moment.
   ========================================================================== */
(function () {
  'use strict';

  document.querySelectorAll('[data-go]').forEach(function (fig) {
  var stage = fig.querySelector('.plate');
  var canvas = stage.querySelector('canvas');
  var ctx = canvas.getContext('2d');
  var note = fig.querySelector('[data-go-note]'), side = fig.querySelector('[data-go-side]');
  var outMove = fig.querySelector('[data-go-out="move"]');
  var btnPlay = fig.querySelector('[data-go-act="play"]');
  var btnPrev = fig.querySelector('[data-go-act="prev"]');
  var btnNext = fig.querySelector('[data-go-act="next"]');
  var btnKey = fig.querySelector('[data-go-act="key"]');
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var src = fig.dataset.src;

  var N = 19, NN = N * N, SIGMA = 1.9;
  var COLS = 'ABCDEFGHJKLMNOPQRST';
  var HOSHI = [3, 9, 15];

  /* ---------- the record, rebuilt ---------- */
  var rec = null, states = [], balance = [], key = 0;
  var m = 0, shownM = 0, playing = false, timer = 0, visible = true, raf = 0, current = !fig.closest('[data-exhibit]'), inView = true;
  var placedAt = 0, fading = [];
  var field = new Float32Array(NN), shown = new Float32Array(NN);

  function neighbours(p) {
    var x = p % N, y = (p / N) | 0, r = [];
    if (x > 0) r.push(p - 1); if (x < N - 1) r.push(p + 1);
    if (y > 0) r.push(p - N); if (y < N - 1) r.push(p + N);
    return r;
  }
  function libsOf(b, p) {
    var c = b[p], seen = {}, stack = [p], g = [], libs = 0, lseen = {};
    seen[p] = 1;
    while (stack.length) {
      var q = stack.pop(); g.push(q);
      neighbours(q).forEach(function (n) {
        if (b[n] === 0) { if (!lseen[n]) { lseen[n] = 1; libs++; } }
        else if (b[n] === c && !seen[n]) { seen[n] = 1; stack.push(n); }
      });
    }
    return { stones: g, libs: libs };
  }
  function play(b, p, c) {
    var nb = new Int8Array(b); nb[p] = c;
    var cap = [];
    neighbours(p).forEach(function (n) {
      if (nb[n] === -c) { var g = libsOf(nb, n); if (g.libs === 0) g.stones.forEach(function (q) { if (nb[q]) { nb[q] = 0; cap.push(q); } }); }
    });
    return { b: nb, cap: cap };
  }
  function influence(b, out) {
    var s2 = 2 * SIGMA * SIGMA, R = 6;
    out.fill(0);
    for (var p = 0; p < NN; p++) {
      var c = b[p]; if (!c) continue;
      var x0 = p % N, y0 = (p / N) | 0;
      for (var y = Math.max(0, y0 - R); y <= Math.min(N - 1, y0 + R); y++)
        for (var x = Math.max(0, x0 - R); x <= Math.min(N - 1, x0 + R); x++)
          out[y * N + x] += c * Math.exp(-((x - x0) * (x - x0) + (y - y0) * (y - y0)) / s2);
    }
    var bl = 0, wh = 0;
    for (p = 0; p < NN; p++) { if (out[p] > 0.2) bl++; else if (out[p] < -0.2) wh++; }
    return [bl, wh];
  }
  function build(d) {
    rec = d; key = d.key || 0;
    var b = new Int8Array(NN), tmp = new Float32Array(NN), capB = 0, capW = 0;
    states = [{ b: b, p: -1, c: 0, cap: [], capB: 0, capW: 0 }];
    balance = [0];
    d.moves.forEach(function (mv) {
      var c = mv[2] === 'B' ? 1 : -1;
      if (mv[0] < 0) { states.push({ b: b, p: -1, c: c, cap: [], capB: capB, capW: capW }); balance.push(balance[balance.length - 1]); return; }
      var p = mv[1] * N + mv[0], r = play(b, p, c);
      b = r.b;
      if (c === 1) capB += r.cap.length; else capW += r.cap.length;
      states.push({ b: b, p: p, c: c, cap: r.cap, capB: capB, capW: capW });
      var a = influence(b, tmp); balance.push((a[0] - a[1]) / NN);
    });
    // each move adds its own side's influence, so the raw series zigzags;
    // a centred average over six moves shows the flow of the game
    var raw = balance.slice(), K = 3;
    balance = raw.map(function (_, i) {
      var s = 0, n = 0;
      for (var j = Math.max(0, i - K); j <= Math.min(raw.length - 1, i + K); j++) { s += raw[j]; n++; }
      return s / n;
    });
  }
  function goTo(k, animate) {
    k = Math.max(0, Math.min(states.length - 1, k));
    if (animate && k === m + 1) {
      var s = states[k], now = performance.now();
      s.cap.forEach(function (q) { fading.push({ p: q, c: -s.c, t0: now }); });
      placedAt = now;
      click(s);
    } else placedAt = 0;
    m = k;
    influence(states[m].b, field);
    if (!animate) shown.set(field);
    if (outMove) outMove.textContent = m + ' of ' + (states.length - 1);
    showNote();
    kick();
  }
  function showNote() {
    if (!note || !rec) return;
    var txt = rec.notes && rec.notes[String(m)];
    if (txt) { note.innerHTML = txt; note.classList.add('is-on'); }
    else if (m < key || m > key + 12) note.classList.remove('is-on');
  }

  /* ---------- playback ---------- */
  function step() {
    clearTimeout(timer);
    if (!playing || !live()) return;
    if (m >= states.length - 1) { setPlaying(false); return; }
    goTo(m + 1, true);
    var wait = reduced ? 900 : 620 + Math.random() * 120;
    if (m === key) wait = 3600;                       // let the move be seen
    timer = setTimeout(step, wait);
  }
  function setPlaying(on) {
    playing = on;
    if (btnPlay) {
      var lab = btnPlay.querySelector('[data-play-label]');
      (lab || btnPlay).textContent = on ? 'Pause' : (m > 0 && m < states.length - 1 ? 'Resume' : 'Play');
      btnPlay.setAttribute('aria-pressed', String(on)); btnPlay.classList.toggle('is-playing', on);
    }
    clearTimeout(timer);
    if (on) { if (m >= states.length - 1) goTo(0); timer = setTimeout(step, 300); }
  }
  btnPlay && btnPlay.addEventListener('click', function () { setPlaying(!playing); });
  btnPrev && btnPrev.addEventListener('click', function () { setPlaying(false); goTo(m - 1); });
  btnNext && btnNext.addEventListener('click', function () { setPlaying(false); goTo(m + 1, true); });
  btnKey && btnKey.addEventListener('click', function () { setPlaying(false); goTo(key - 1); setTimeout(function () { goTo(key, true); }, 350); });

  /* ---------- sound: the click of a stone on wood (opt-in) ---------- */
  var actx = null, soundOn = false, out = null;
  document.addEventListener('artsound', function (e) { soundOn = e.detail.on; actx = e.detail.ctx; out = e.detail.out; });
  function click(s) {
    if (!soundOn || !actx) return;
    var A = actx, t = A.currentTime + 0.005, len = 0.09;
    var b = A.createBuffer(1, Math.round(A.sampleRate * len), A.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (A.sampleRate * 0.008));
    var src = A.createBufferSource(), bp = A.createBiquadFilter(), g = A.createGain(), pan = A.createStereoPanner ? A.createStereoPanner() : null;
    src.buffer = b; bp.type = 'bandpass'; bp.frequency.value = s.c === 1 ? 1900 : 2300; bp.Q.value = 3.5;
    g.gain.value = 0.9;
    src.connect(bp); bp.connect(g);
    if (pan && s.p >= 0) { pan.pan.value = ((s.p % N) / (N - 1)) * 1.2 - 0.6; g.connect(pan); pan.connect(out || A.destination); }
    else g.connect(out || A.destination);
    src.start(t);
  }

  /* ---------- layout ---------- */
  var W = 1, H = 1, DPR = 1, cell = 10, bx = 0, by = 0, bsize = 0, over = 12, panel = null, colors = {};
  var wash = document.createElement('canvas'); wash.width = wash.height = N;
  var wctx = wash.getContext('2d'), wimg = wctx.createImageData(N, N);
  var wash2 = document.createElement('canvas'); wash2.width = wash2.height = N * 4;
  var w2 = wash2.getContext('2d'), canFilter = 'filter' in w2;
  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    ['ink', 'ink-2', 'ink-3', 'rule', 'accent', 'paper'].forEach(function (k) { colors[k] = cs.getPropertyValue('--' + k).trim(); });
    colors.dark = parseInt(colors.paper.replace('#', '').slice(0, 2), 16) < 90;
  }
  function resize() {
    var r = canvas.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) return;
    W = r.width; H = r.height; DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    // outside the grid: half a cell for edge stones (and their outline), a gap, then the coordinates
    var lab = W > 420 ? 20 : 13, gapL = W > 420 ? 7 : 5;
    var avail = Math.min(H, W) - 2;
    bsize = (avail - 2 * (lab + gapL)) / (1 + 1 / (N - 1));
    if (bsize < 80) return;
    cell = bsize / (N - 1);
    over = cell * 0.5 + 1 + gapL;
    bx = lab + over; by = (H - bsize) / 2;
    var px = bx + bsize + Math.max(56, W * 0.05);
    panel = (W - px > 240) ? { x: px, y: by + 10, w: W - px, h: bsize - 10 } : null;
    // the commentary hangs under the balance chart, on the chart's left edge
    if (side) {
      if (panel) { side.style.left = panel.x + 'px'; side.style.width = Math.min(panel.w, 560) + 'px'; side.style.top = (panel.y + panel.h * 0.42 + 58) + 'px'; side.classList.remove('is-stacked'); }
      else { side.removeAttribute('style'); side.classList.add('is-stacked'); }
    }
    kick();
  }
  function pt(p) { return [bx + (p % N) * cell, by + ((p / N) | 0) * cell]; }

  /* ---------- draw ---------- */
  function ease(x) { return 1 - Math.pow(1 - x, 4); }
  function draw(now) {
    if (bsize <= 0) return false;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
    var busy = false;
    // the wash eases toward the new balance of influence
    var d8 = wimg.data, k = reduced ? 1 : 0.09;
    for (var p = 0; p < NN; p++) {
      var dv = field[p] - shown[p];
      if (Math.abs(dv) > 0.002) { shown[p] += dv * k; busy = true; } else shown[p] = field[p];
      var v = Math.tanh(shown[p] * 0.9), o = p * 4;
      if (v >= 0) { d8[o] = d8[o + 1] = d8[o + 2] = 0; d8[o + 3] = v * (colors.dark ? 150 : 95); }
      else { d8[o] = d8[o + 1] = d8[o + 2] = 255; d8[o + 3] = -v * (colors.dark ? 46 : 150); }
    }
    wctx.putImageData(wimg, 0, 0);
    w2.clearRect(0, 0, wash2.width, wash2.height);
    if (canFilter) w2.filter = 'blur(2px)';
    w2.drawImage(wash, 0, 0, wash2.width, wash2.height);
    if (canFilter) w2.filter = 'none';
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    // everything soft (the wash, the bloom of a new stone) stays on the board: the grid plus half a cell
    ctx.save(); ctx.beginPath(); ctx.rect(bx - cell / 2, by - cell / 2, bsize + cell, bsize + cell); ctx.clip();
    ctx.drawImage(wash2, bx - cell / 2, by - cell / 2, bsize + cell, bsize + cell);
    ctx.restore();

    // the board
    ctx.strokeStyle = colors['ink-3']; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
    ctx.beginPath();
    for (var i = 0; i < N; i++) {
      var a = Math.round(bx + i * cell) + 0.5, b2 = Math.round(by + i * cell) + 0.5;
      ctx.moveTo(a, Math.round(by) + 0.5); ctx.lineTo(a, Math.round(by + bsize) + 0.5);
      ctx.moveTo(Math.round(bx) + 0.5, b2); ctx.lineTo(Math.round(bx + bsize) + 0.5, b2);
    }
    ctx.stroke();
    // the outermost line is a little heavier, as on a real board
    ctx.globalAlpha = colors.dark ? 0.75 : 0.65; ctx.lineWidth = 1.5;
    ctx.strokeRect(Math.round(bx) + 0.5, Math.round(by) + 0.5, Math.round(bx + bsize) - Math.round(bx), Math.round(by + bsize) - Math.round(by));
    // and the board itself has an edge: a hairline half a cell outside the grid, where edge stones end
    ctx.globalAlpha = colors.dark ? 0.5 : 0.42; ctx.lineWidth = 1; ctx.strokeStyle = colors.ink;
    var e0x = Math.round(bx - cell / 2) + 0.5, e0y = Math.round(by - cell / 2) + 0.5, e1x = Math.round(bx + bsize + cell / 2) - 0.5, e1y = Math.round(by + bsize + cell / 2) - 0.5;
    ctx.strokeRect(e0x, e0y, e1x - e0x, e1y - e0y);
    ctx.lineWidth = 1; ctx.strokeStyle = colors['ink-3'];
    ctx.globalAlpha = 0.9; ctx.fillStyle = colors['ink-3'];
    HOSHI.forEach(function (hx) { HOSHI.forEach(function (hy) { ctx.beginPath(); ctx.arc(bx + hx * cell, by + hy * cell, Math.max(1.6, cell * 0.09), 0, 6.283); ctx.fill(); }); });
    ctx.font = '400 11px Archivo, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    var all = cell > 22;
    for (i = 0; i < N; i++) if (all || i % 3 === 0 || i === N - 1) ctx.fillText(COLS[i], bx + i * cell, by + bsize + over);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (i = 0; i < N; i++) if (all || i % 3 === 0 || i === N - 1) ctx.fillText(String(N - i), bx - over, by + i * cell);
    ctx.globalAlpha = 1;

    var R = cell * 0.47, st = states[m];
    // captured stones lift away
    fading = fading.filter(function (f) {
      var e = Math.min(1, (now - f.t0) / 650); if (e >= 1) return false; busy = true;
      var q = pt(f.p); ctx.globalAlpha = 1 - ease(e); stone(q[0], q[1], R * (1 - 0.2 * e), f.c); ctx.globalAlpha = 1; return true;
    });
    if (st) for (p = 0; p < NN; p++) {
      var c = st.b[p]; if (!c) continue;
      var q2 = pt(p), r2 = R;
      if (p === st.p && placedAt && !reduced) {
        var e2 = Math.min(1, (now - placedAt) / 520), bleed = Math.min(1, (now - placedAt) / 1400);
        if (bleed < 1) {
          ctx.save(); ctx.beginPath(); ctx.rect(bx - cell / 2, by - cell / 2, bsize + cell, bsize + cell); ctx.clip();
          busy = true;
          ctx.globalAlpha = 0.24 * (1 - bleed); ctx.strokeStyle = c === 1 ? '#15171b' : colors['ink-3']; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(q2[0], q2[1], R * (1 + ease(bleed) * 2.4), 0, 6.283); ctx.stroke();
          ctx.restore();
        }
        ctx.globalAlpha = ease(e2); r2 = R * (1.16 - 0.16 * ease(e2));
      }
      stone(q2[0], q2[1], r2, c); ctx.globalAlpha = 1;
    }
    if (st && st.p >= 0) {
      var lm = pt(st.p);
      ctx.fillStyle = colors.accent; ctx.beginPath(); ctx.arc(lm[0], lm[1], Math.max(2, R * 0.24), 0, 6.283); ctx.fill();
      if (m === key) { ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(lm[0], lm[1], R * 1.55, 0, 6.283); ctx.stroke(); }
    }
    if (panel) drawCurve();
    return busy;
  }
  function stone(x, y, r, c) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283);
    if (c === 1) { ctx.fillStyle = '#15171b'; ctx.fill(); if (colors.dark) { ctx.strokeStyle = 'rgba(231,231,226,.35)'; ctx.lineWidth = 1; ctx.stroke(); } }
    else { ctx.fillStyle = '#f7f7f4'; ctx.fill(); ctx.strokeStyle = colors.dark ? 'rgba(0,0,0,.4)' : 'rgba(21,23,27,.55)'; ctx.lineWidth = 1; ctx.stroke(); }
  }
  // the balance of influence, move by move; also the timeline
  function drawCurve() {
    var x0 = panel.x, w = panel.w, top = panel.y, h = panel.h * 0.42, mid = top + h / 2, n = balance.length - 1;
    var X = function (i) { return x0 + w * i / Math.max(1, n); }, Y = function (v) { return mid - v * h * 1.6; };
    ctx.font = '400 11px Archivo, system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = colors['ink-3'];
    ctx.fillText('Black stronger', x0, top - 4); ctx.fillText('White stronger', x0, top + h + 4);
    ctx.fillStyle = colors.rule; ctx.fillRect(x0, Math.round(mid), w, 1);
    // filled balance, ink above the line, paper below
    ctx.beginPath(); ctx.moveTo(X(0), mid);
    for (var i = 0; i <= n; i++) ctx.lineTo(X(i), Y(balance[i]));
    ctx.lineTo(X(n), mid); ctx.closePath();
    ctx.globalAlpha = 0.12; ctx.fillStyle = colors.ink; ctx.fill(); ctx.globalAlpha = 1;
    ctx.beginPath();
    for (i = 0; i <= n; i++) i ? ctx.lineTo(X(i), Y(balance[i])) : ctx.moveTo(X(i), Y(balance[i]));
    ctx.strokeStyle = colors['ink-2']; ctx.lineWidth = 1; ctx.stroke();
    // the key move
    if (key) {
      ctx.fillStyle = colors.accent; ctx.fillRect(Math.round(X(key)), top + 6, 1, h - 12);
      ctx.fillText(String(key), Math.round(X(key)) + 5, top + 12);
    }
    // where we are
    ctx.fillStyle = colors.ink; ctx.fillRect(Math.round(X(m)), top, 1, h);
    ctx.beginPath(); ctx.arc(X(m), Y(balance[m]), 3.2, 0, 6.283); ctx.fill();
    // move ticks
    ctx.fillStyle = colors['ink-3']; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (var t = 50; t < n; t += 50) { ctx.fillRect(Math.round(X(t)), top + h + 14, 1, 4); ctx.fillText(String(t), X(t), top + h + 20); }
  }

  /* ---------- loop + input ---------- */
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(now) { raf = 0; var busy = draw(now); if (busy && live()) raf = requestAnimationFrame(frame); }
  function live() { return visible && current; }
  function scrubAt(e) {
    if (!panel) return false;
    var r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (x < panel.x - 8 || y > panel.y + panel.h * 0.42 + 30) return false;
    setPlaying(false);
    goTo(Math.round(Math.max(0, Math.min(1, (x - panel.x) / panel.w)) * (states.length - 1)));
    return true;
  }
  var scrubbing = false;
  canvas.addEventListener('pointerdown', function (e) { if (scrubAt(e)) { scrubbing = true; canvas.setPointerCapture(e.pointerId); } });
  canvas.addEventListener('pointermove', function (e) { if (scrubbing) scrubAt(e); });
  canvas.addEventListener('pointerup', function () { scrubbing = false; });
  canvas.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { setPlaying(false); goTo(m + 1, true); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { setPlaying(false); goTo(m - 1); e.preventDefault(); }
    else if (e.key === ' ' || e.key === 'Enter') { setPlaying(!playing); e.preventDefault(); }
  });

  document.addEventListener('themechange', function () { readColors(); kick(); });
  function update() {
    var was = visible; visible = inView && !document.hidden;
    if (live()) { resize(); kick(); if (playing) { clearTimeout(timer); timer = setTimeout(step, 500); } }
    else clearTimeout(timer);
  }
  document.addEventListener('visibilitychange', update);
  // the exhibition tells each room when it is the one on view
  fig.addEventListener('roomshow', function (e) { current = e.detail; update(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) { inView = en[0].isIntersecting; update(); }, { threshold: 0.15 }).observe(stage);
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);

  readColors();
  (window.__revealed || Promise.resolve()).then(function () { return fetch(src); }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (d) {
    build(d);
    goTo(0);
    if (!reduced) setPlaying(true);
    if (!live()) clearTimeout(timer);
    resize();
  }).catch(function () { if (note) { note.textContent = 'The game record could not be loaded.'; note.classList.add('is-on'); } });
  });
})();

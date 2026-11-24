/* ==========================================================================
   琴棋書畫 — a small collection.

   琴  two pieces, each seen its own way: Clair de lune as notes falling onto a
       keyboard; Recuerdos as strings up close. The sound is sampled piano and
       nylon guitar, scheduled on the audio clock; the picture reads the same
       clock, corrected for output latency, so the two cannot drift.
   棋  see go.js
   書畫 handscrolls, viewed from the right, with a detail lens on the
       unaltered reproduction.

   Rooms are stacked in one place and cross-fade: changing room never
   re-lays out the page, and no room is torn down or rebuilt.
   Sound is opt-in: pressing Play in a music room, or the sound switch.
   ========================================================================== */
(function () {
  'use strict';
  var root = document.querySelector('[data-exhibit]');
  if (!root) return;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var motion = document.documentElement.classList.contains('js-motion');
  var base = root.dataset.base || '../assets/';

  var colors = {}, dark = false;
  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    ['ink', 'ink-2', 'ink-3', 'rule', 'rule-2', 'accent', 'paper', 'wash'].forEach(function (k) { colors[k] = cs.getPropertyValue('--' + k).trim(); });
    dark = parseInt(colors.paper.replace('#', '').slice(0, 2), 16) < 90;
  }
  readColors();
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function fmt(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }

  /* ======================================================================
     Audio: one context, a sampler per instrument, a quiet room.
     ====================================================================== */
  var A = { ctx: null, on: false, userOff: false, master: null, dry: null, wet: null, banks: {} };
  var NOTE = { C: 0, Cs: 1, D: 2, Ds: 3, E: 4, F: 5, Fs: 6, G: 7, Gs: 8, A: 9, As: 10, B: 11 };
  var SAMPLES = {
    piano: 'A1 C1 Ds1 Fs1 A2 C2 Ds2 Fs2 A3 C3 Ds3 Fs3 A4 C4 Ds4 Fs4 A5 C5 Ds5 Fs5 A6 C6 Ds6 Fs6 A7 C7 Ds7 Fs7 C8',
    guitar: 'A2 A3 A4 A5 As5 B1 B2 B3 B4 Cs3 Cs4 Cs5 D2 D3 D5 Ds4 E2 E3 E4 E5 Fs2 Fs3 Fs4 Fs5 G3 G5 Gs2 Gs4 Gs5'
  };
  function midiOf(name) { var m = /^([A-G]s?)(\d)$/.exec(name); return 12 * (+m[2] + 1) + NOTE[m[1]]; }
  function audioRunning() { return !!(A.ctx && A.ctx.state === 'running'); }
  function ensureContext() {
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    if (!A.ctx || A.ctx.state === 'closed') {
      var c = A.ctx = new AC({ latencyHint: 'playback' });
      A.master = c.createGain(); A.master.gain.value = 0;
      var comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 2.5; comp.attack.value = 0.01; comp.release.value = 0.25;
      A.dry = c.createGain(); A.wet = c.createGain(); A.wet.gain.value = 0.22;
      // a small room: decaying, slightly filtered noise as the impulse response
      var len = Math.round(c.sampleRate * 2.4), ir = c.createBuffer(2, len, c.sampleRate);
      for (var ch = 0; ch < 2; ch++) { var d = ir.getChannelData(ch), lp = 0; for (var i = 0; i < len; i++) { lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4; d[i] = lp * Math.pow(1 - i / len, 3.2); } }
      var verb = c.createConvolver(); verb.buffer = ir;
      A.dry.connect(A.master); A.wet.connect(verb); verb.connect(A.master);
      A.master.connect(comp); comp.connect(c.destination);
      A.banks = {};
      // the clock the transports follow changes when the context starts or stops running
      c.onstatechange = function () { clockChanged(); };
    }
    if (A.ctx.state === 'suspended') A.ctx.resume().then(clockChanged, function () {});
    return A.ctx;
  }
  function latency() { return audioRunning() ? (A.ctx.outputLatency || A.ctx.baseLatency || 0) : 0; }
  function loadBank(kind) {
    if (A.banks[kind]) return A.banks[kind].ready;
    var bank = A.banks[kind] = { list: [] };
    bank.ready = Promise.all(SAMPLES[kind].split(' ').map(function (n) {
      return fetch(base + 'audio/' + kind + '/' + n + '.mp3').then(function (r) { if (!r.ok) throw n; return r.arrayBuffer(); })
        .then(function (b) { return new Promise(function (res, rej) { A.ctx.decodeAudioData(b, res, rej); }); })
        .then(function (buf) { bank.list.push({ m: midiOf(n), buf: buf }); });
    })).then(function () { bank.list.sort(function (a, b) { return a.m - b.m; }); bank.loaded = true; });
    return bank.ready;
  }
  // one note; `into` seconds into its sounding (to rejoin a note already held). Returns a handle.
  function voice(kind, midi, vel, when, dur, pan, into) {
    var bank = A.banks[kind]; if (!bank || !bank.loaded) return null;
    var best = bank.list[0];
    for (var i = 1; i < bank.list.length; i++) if (Math.abs(bank.list[i].m - midi) < Math.abs(best.m - midi)) best = bank.list[i];
    var c = A.ctx, src = c.createBufferSource(), g = c.createGain(), p = c.createStereoPanner ? c.createStereoPanner() : null;
    var rate = Math.pow(2, (midi - best.m) / 12);
    src.buffer = best.buf; src.playbackRate.value = rate;
    var peak = kind === 'piano' ? 0.95 * Math.pow(0.25 + 0.75 * vel, 1.5) : 0.42 * Math.pow(0.3 + 0.7 * vel, 1.3);
    into = into || 0;
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(peak, when + (into ? 0.03 : 0.004));
    var rel = kind === 'piano' ? (midi < 48 ? 1.1 : 0.7) : 0.35;
    var off = when + Math.max(0.08, dur - into);
    g.gain.setTargetAtTime(0, off, rel / 3);
    src.connect(g);
    if (p) { p.pan.value = pan || 0; g.connect(p); p.connect(A.dry); p.connect(A.wet); } else { g.connect(A.dry); g.connect(A.wet); }
    // the sample's own decay carries on from where the note has got to
    src.start(when, Math.min(best.buf.duration - 0.05, into * rate)); src.stop(off + rel * 2.5);
    return { stop: function (t) { try { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, 0.03); src.stop(t + 0.2); } catch (e) {} } };
  }

  /* ---- the sound switch: one state, shown in every room's transport ---- */
  var soundBtns = Array.prototype.slice.call(root.querySelectorAll('[data-sound]'));
  function showSound() {
    soundBtns.forEach(function (b) {
      b.setAttribute('aria-pressed', String(A.on));
      b.classList.toggle('is-on', A.on);
      var l = b.querySelector('[data-sound-label]'); if (l) l.textContent = A.on ? 'Sound on' : 'Sound off';
    });
  }
  function setSound(on, byUser) {
    if (byUser) A.userOff = !on;
    A.on = on;
    if (on) ensureContext();
    if (A.ctx && A.master) { var t = A.ctx.currentTime; A.master.gain.cancelScheduledValues(t); A.master.gain.setTargetAtTime(on ? 0.9 : 0, t, 0.05); }
    showSound();
    document.dispatchEvent(new CustomEvent('artsound', { detail: { on: on, ctx: A.ctx, out: A.dry } }));
    rooms.forEach(function (r) {
      if (!r.transport) return;
      if (on) { if (r.transport.playing) prepare(r); }     // prepare rejoins the music once the instrument is ready
      else r.transport.silence();
    });
  }
  soundBtns.forEach(function (b) { b.addEventListener('click', function () { setSound(!A.on, true); }); });
  function clockChanged() { rooms.forEach(function (r) { r.transport && r.transport.reclock(); }); }

  /* ======================================================================
     Transport. The position follows the audio clock while the context runs,
     the wall clock otherwise; each rebase records which clock it was taken
     on, so switching clocks never makes the position jump. Notes are
     scheduled 0.35 s ahead on the audio clock only.
     ====================================================================== */
  function Transport(room) {
    var T = { pos: 0, playing: false, t0: 0, p0: 0, clk: 'wall', sched: 0, live: [], timer: 0 };
    function clockNow(k) { return k === 'audio' && A.ctx ? A.ctx.currentTime : performance.now() / 1000; }
    function rebase() { T.clk = audioRunning() ? 'audio' : 'wall'; T.t0 = clockNow(T.clk); T.p0 = T.pos; T.sched = T.indexAt(T.pos); }
    T.position = function () { return T.playing ? clamp(T.p0 + (clockNow(T.clk) - T.t0), 0, room.dur) : T.pos; };
    T.indexAt = function (p) { var n = room.notes, lo = 0, hi = n.length; while (lo < hi) { var mid = (lo + hi) >> 1; if (n[mid][0] < p - 1e-3) lo = mid + 1; else hi = mid; } return lo; };
    T.silence = function () { var t = A.ctx ? A.ctx.currentTime : 0; T.live.forEach(function (v) { v.stop(t); }); T.live = []; room.ringing = []; };
    T.play = function () {
      if (T.playing) return;
      if (T.pos >= room.dur - 0.05) T.pos = 0;
      T.playing = true; rebase();
      if (A.on) prepare(room);
      clearInterval(T.timer); T.timer = setInterval(T.pump, 40); T.pump();
      room.sync();
    };
    T.pause = function () {
      if (!T.playing) return;
      T.pos = T.position(); T.playing = false; clearInterval(T.timer); T.silence(); room.sync();
    };
    T.seek = function (p) {
      var was = T.playing; if (was) T.pause();
      T.pos = clamp(p, 0, room.dur); T.sched = T.indexAt(T.pos);
      if (was) T.play(); else room.sync();
    };
    // keep the position, change the clock, and rejoin whatever should be sounding now
    T.reclock = function () {
      if (!T.playing) return;
      T.pos = T.position(); T.silence(); rebase(); T.catchUp(); T.pump();
    };
    T.catchUp = function () {
      if (!(A.on && T.clk === 'audio' && T.playing)) return;
      var bank = A.banks[room.kind]; if (!bank || !bank.loaded) return;
      var p = T.position(), n = room.notes, when = A.ctx.currentTime + 0.02;
      for (var i = Math.max(0, T.indexAt(p - 8)); i < n.length && n[i][0] < p; i++) {
        var into = p - n[i][0];
        if (into < n[i][1] - 0.12) {
          var v = voice(room.kind, n[i][2], n[i][3], when, n[i][1], room.pan(n[i]), into);
          if (v) { T.live.push(v); if (room.kind === 'guitar') room.ringing[n[i][4]] = v; }
        }
      }
    };
    T.pump = function () {
      if (!T.playing) return;
      var p = T.position();
      if (p >= room.dur) { T.pause(); T.pos = room.dur; room.sync(); return; }
      var n = room.notes, ahead = p + 0.35, bank = A.banks[room.kind];
      var canSound = A.on && T.clk === 'audio' && bank && bank.loaded;
      while (T.sched < n.length && n[T.sched][0] < ahead) {
        var note = n[T.sched];
        if (canSound && note[0] >= p - 0.03) {
          var when = Math.max(A.ctx.currentTime, T.t0 + (note[0] - T.p0));
          if (room.kind === 'guitar') { var s = note[4]; if (room.ringing[s]) room.ringing[s].stop(when); }
          var v = voice(room.kind, note[2], note[3], when, note[1], room.pan(note));
          if (v) { T.live.push(v); if (T.live.length > 240) T.live.splice(0, 80); if (room.kind === 'guitar') room.ringing[note[4]] = v; }
        }
        T.sched++;
      }
    };
    return T;
  }
  function prepare(room) {
    var c = ensureContext(); if (!c) return Promise.resolve();
    var st = room.el.querySelector('[data-out="sound"]');
    var bank = A.banks[room.kind];
    if (!bank || !bank.loaded) st && (st.textContent = 'Tuning the ' + room.kind + '…');
    return loadBank(room.kind).then(function () {
      st && (st.textContent = '');
      room.transport.reclock();            // rejoin the notes that are already sounding
    }, function () { st && (st.textContent = 'The instrument could not be loaded.'); });
  }

  /* ======================================================================
     A music room: canvas, transport, controls.
     ====================================================================== */
  function MusicRoom(el, kind, draw, setup) {
    var plate = el.querySelector('.plate'), canvas = plate.querySelector('canvas');
    var r = { el: el, kind: kind, plate: plate, canvas: canvas, ctx: canvas.getContext('2d'), W: 1, H: 1, DPR: 1, shown: false, visible: true, raf: 0, notes: [], dur: 1, bars: [], ringing: [], ready: false, pausedAt: 0 };
    r.transport = Transport(r);
    var playBtn = el.querySelector('[data-act="play"]'), label = el.querySelector('[data-play-label]'), seek = el.querySelector('[data-act="seek"]');
    var outT = el.querySelector('[data-out="time"]'), outTot = el.querySelector('[data-out="total"]'), outBar = el.querySelector('[data-out="bar"]'), fill = el.querySelector('.scrub-fill');
    r.pan = function (n) { return kind === 'piano' ? clamp((n[2] - 64) / 40, -0.6, 0.6) : -0.25 + (n[4] || 0) * 0.1; };
    r.sync = function () {
      var on = r.transport.playing, pos = r.transport.pos;
      playBtn.setAttribute('aria-pressed', String(on));
      label.textContent = on ? 'Pause' : (pos > 0.05 && pos < r.dur - 0.05 ? 'Resume' : 'Play');
      playBtn.classList.toggle('is-playing', on);
      if (!on) r.pausedAt = performance.now();
      r.kick();
    };
    function toggle() {
      if (r.transport.playing) { r.transport.pause(); return; }
      if (!A.on && !A.userOff) setSound(true);       // Play is the visitor asking to hear it
      r.transport.play();
    }
    playBtn.addEventListener('click', toggle);
    function seekTo(e) { var b = seek.getBoundingClientRect(); r.transport.seek(clamp((e.clientX - b.left) / b.width, 0, 1) * r.dur); }
    var dragging = false;
    seek.addEventListener('pointerdown', function (e) { dragging = true; seek.setPointerCapture(e.pointerId); seekTo(e); });
    seek.addEventListener('pointermove', function (e) { if (dragging) seekTo(e); });
    seek.addEventListener('pointerup', function () { dragging = false; });
    seek.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { r.transport.seek(r.transport.position() + 5); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { r.transport.seek(r.transport.position() - 5); e.preventDefault(); }
    });
    canvas.addEventListener('click', toggle);
    canvas.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });

    r.kick = function () { if (!r.raf && r.shown && r.visible) r.raf = requestAnimationFrame(loop); };
    function loop(now) {
      r.raf = 0;
      var p = r.transport.position();
      if (outT) outT.textContent = fmt(p);
      if (fill) fill.style.transform = 'scaleX(' + (p / r.dur) + ')';
      if (seek) seek.setAttribute('aria-valuenow', Math.round(100 * p / r.dur));
      if (outBar && r.bars.length) { var b = 1; for (var i = 0; i < r.bars.length; i++) if (r.bars[i] <= p + 1e-3) b = i + 1; outBar.textContent = b; }
      var ctx = r.ctx; ctx.setTransform(r.DPR, 0, 0, r.DPR, 0, 0); ctx.clearRect(0, 0, r.W, r.H);
      // what is heard now: the audio clock, less the time sound takes to leave the speakers
      var heard = r.transport.playing ? Math.max(0, p - latency()) : p;
      var settle = r.transport.playing ? 0 : (now - r.pausedAt) / 1000;    // the picture comes to rest after a pause
      if (r.ready) draw(r, ctx, heard, settle, now);
      if ((r.transport.playing || settle < 3) && r.shown && r.visible) r.raf = requestAnimationFrame(loop);
    }
    r.resize = function () {
      var b = plate.getBoundingClientRect(); if (b.width < 40 || b.height < 40) return;
      r.W = b.width; r.H = b.height; r.DPR = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(r.W * r.DPR); canvas.height = Math.round(r.H * r.DPR);
      if (r.ready && setup) setup(r);
      r.kick();
    };
    if ('ResizeObserver' in window) new ResizeObserver(r.resize).observe(plate);
    r.show = function (on) { r.shown = on; if (on) { r.resize(); r.kick(); } else r.transport.pause(); };
    (window.__revealed || Promise.resolve()).then(function () { return fetch(base + 'art/' + el.dataset.src); }).then(function (x) { return x.json(); }).then(function (d) {
      r.notes = d.notes.sort(function (a, b) { return a[0] - b[0] || a[2] - b[2]; });
      r.dur = r.notes.reduce(function (m, n) { return Math.max(m, n[0] + n[1]); }, 0) + 1.5;
      r.bars = d.bars || []; r.range = d.range;
      if (kind === 'guitar') assignStrings(r.notes);
      if (outTot) outTot.textContent = fmt(r.dur);
      r.ready = true; if (setup) setup(r); r.pausedAt = performance.now() - 5000; r.kick();
    });
    return r;
  }

  /* ---------- 月光: light falling onto the keyboard ----------
     The notes come out of depth: the fall accelerates as a note nears its
     key, and the space converges toward the top, so the bars and the faint
     octave lines read as a stage receding into the dark rather than a grid.
     Notes are light, brightest at the leading edge; the melody glows, and
     where it lands, light pools on the key. */
  var BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];
  // black keys sit off-centre between their white neighbours, as on a real keyboard
  var BOFF = { 1: -0.12, 3: 0.12, 6: -0.14, 8: 0, 10: 0.14 };
  function rgba(hex, a) {
    var h = hex.replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&');
    return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
  }
  function setupKeys(r) {
    var n = r.notes;
    if (!r.melody) {
      // the melody: the highest voice sounding at each onset (a "skyline"), in the treble
      r.melody = new Uint8Array(n.length);
      var active = [];
      for (var i = 0; i < n.length; i++) {
        var t = n[i][0];
        active = active.filter(function (k) { return n[k][0] + n[k][1] > t + 0.02; });
        var top = true;
        for (var j = 0; j < active.length; j++) if (n[active[j]][2] > n[i][2] && n[active[j]][0] + n[active[j]][1] > t + 0.12) { top = false; break; }
        for (var k = i + 1; k < n.length && n[k][0] < t + 0.03; k++) if (n[k][2] > n[i][2]) { top = false; break; }
        r.melody[i] = top && n[i][2] >= 60 ? 1 : 0;
        active.push(i);
      }
      r.maxDur = n.reduce(function (m, x) { return Math.max(m, x[1]); }, 0);
      r.press = new Float32Array(128); r.light = new Float32Array(128); r.lastIdx = -1;
    }
    var lo = Math.floor((r.range[0] - 1) / 12) * 12, hi = Math.ceil((r.range[1] + 1) / 12) * 12;
    var whites = 0; for (var m = lo; m <= hi; m++) if (!BLACK[m % 12]) whites++;
    var ww = r.W / whites, keys = {}, x = 0;
    for (m = lo; m <= hi; m++) if (!BLACK[m % 12]) { keys[m] = { x: x, w: ww, black: false }; x += ww; }
    var bw = ww * 0.56;
    for (m = lo; m <= hi; m++) if (BLACK[m % 12] && keys[m - 1]) keys[m] = { x: keys[m - 1].x + ww - bw / 2 + BOFF[m % 12] * ww, w: bw, black: true };
    var kh = clamp(ww * 4.4, 74, r.H * 0.2);
    r.kb = { lo: lo, hi: hi, keys: keys, ww: ww, bw: bw, kh: kh, top: r.H - kh, look: 3.8, rail: 5 };
  }
  function drawKeys(r, ctx, p, settle, now) {
    var W = r.W, H = r.H, kb = r.kb; if (!kb) return;
    var playing = r.transport.playing, n = r.notes;
    var rail = kb.rail, hitY = Math.round(kb.top) - rail, F = hitY - 6, cx = W / 2;
    // time-to-arrival → height: faster near the keys; and a gentle convergence with distance
    var Y = function (dt) { return hitY - F * Math.pow(clamp(dt / kb.look, 0, 1.4), 0.78); };
    var S = function (dt) { return 1 - 0.14 * clamp(dt / kb.look, 0, 1.4); };
    var X = function (x, dt) { return cx + (x - cx) * S(dt); };
    var ink = colors.ink, acc = colors.accent;

    // the stage: night gathering toward the keyboard
    var bg = ctx.createLinearGradient(0, 0, 0, hitY);
    bg.addColorStop(0, rgba(colors.paper, 0)); bg.addColorStop(1, dark ? 'rgba(138,156,255,0.055)' : 'rgba(21,23,27,0.035)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, hitY);
    // octave lines receding like strings inside the instrument
    ctx.lineWidth = 1; ctx.strokeStyle = ink;
    for (var m = kb.lo; m <= kb.hi; m += 12) {
      var k0 = kb.keys[m]; if (!k0) continue;
      ctx.globalAlpha = dark ? 0.07 : 0.05;
      ctx.beginPath(); ctx.moveTo(X(k0.x, 0), hitY); ctx.lineTo(X(k0.x, kb.look * 1.4), Y(kb.look * 1.4)); ctx.stroke();
    }
    // bar lines arrive like the boards of a floor, closer together in the distance
    ctx.font = '400 10px Archivo, sans-serif'; ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
    for (var b = 0; b < r.bars.length; b++) {
      var dtb = r.bars[b] - p; if (dtb < 0) continue; if (dtb > kb.look * 1.3) break;
      var by = Math.round(Y(dtb)) + 0.5, fade = 1 - clamp(dtb / (kb.look * 1.3), 0, 1);
      ctx.globalAlpha = (dark ? 0.12 : 0.08) * fade; ctx.beginPath(); ctx.moveTo(X(0, dtb), by); ctx.lineTo(X(W, dtb), by); ctx.stroke();
      if (b % 4 === 0) { ctx.globalAlpha = 0.45 * fade; ctx.fillStyle = colors['ink-3']; ctx.fillText(String(b + 1), X(0, dtb) + 4, by - 3); }
    }

    // the notes: translucent capsules with a luminous edge and a bright leading head.
    // Width carries dynamics; long held notes are drawn open; the melody is blue.
    var press = r.press, light = r.light;
    if (!r.keyA) r.keyA = new Float32Array(128);
    for (var q = 0; q < 128; q++) press[q] = 0;
    ctx.globalAlpha = 1;                                        // the bar lines above leave it low
    var start = r.transport.indexAt(p - r.maxDur - 0.2);
    function capsule(xt, yt, wt, xb, yb, wb) {
      var rt = wt / 2, rb = wb / 2;
      ctx.beginPath();
      ctx.moveTo(xt - rt, yt + rt); ctx.arc(xt, yt + rt, rt, Math.PI, 0);
      ctx.lineTo(xb + rb, yb - rb); ctx.arc(xb, yb - rb, rb, 0, Math.PI);
      ctx.closePath();
    }
    for (var i = start; i < n.length; i++) {
      var nt = n[i], dt0 = nt[0] - p; if (dt0 > kb.look * 1.4) break;
      var k = kb.keys[nt[2]]; if (!k) continue;
      var dt1 = dt0 + nt[1]; if (dt1 < 0) continue;
      var mel = r.melody[i], v = nt[3], sounding = dt0 <= 0 && dt1 > 0;
      if (sounding) press[nt[2]] = Math.max(press[nt[2]], mel ? 2 : 1);
      var held = !mel && nt[1] > 1.6;
      var w0 = (k.black ? k.w * (0.6 + 0.16 * v) : k.w * (0.36 + 0.16 * v));
      // on arrival the head settles into the key: the capsule is cut at the rail
      var a0 = Math.max(0, dt0), yb = Math.min(hitY, Y(a0)), yt = Y(dt1); if (yb - yt < 2) continue;
      var xb = X(k.x + k.w / 2, a0), xt = X(k.x + k.w / 2, dt1), wb = w0 * S(a0), wt = w0 * S(dt1);
      var depth = clamp(a0 / kb.look, 0, 1), haze = 1 - 0.55 * depth;
      var col = mel ? acc : ink;
      ctx.save();
      if (dt0 < 0) { ctx.beginPath(); ctx.rect(0, 0, W, hitY); ctx.clip(); }
      capsule(xt, yt, wt, xb, sounding ? hitY + wb / 2 : yb, wb);
      if (held) {
        ctx.fillStyle = rgba(col, (sounding ? 0.07 : 0.03) * haze); ctx.fill();
        ctx.strokeStyle = rgba(col, (sounding ? 0.55 : 0.3) * haze); ctx.lineWidth = 1; ctx.stroke();
      } else {
        // a translucent body, brighter toward the leading head
        var body = ctx.createLinearGradient(0, yb, 0, yt), aB = mel ? (sounding ? 0.78 : 0.42 + 0.3 * v) : (sounding ? 0.42 : 0.17 + 0.22 * v) * (dark ? 1.25 : 1);
        body.addColorStop(0, rgba(col, aB * haze)); body.addColorStop(1, rgba(col, aB * haze * 0.35));
        ctx.fillStyle = body; ctx.fill();
        // and a fine luminous edge, crisp where it is near
        var edgeG = ctx.createLinearGradient(0, yb, 0, yt), aE = mel ? 1 : (dark ? 0.7 : 0.62);
        edgeG.addColorStop(0, rgba(col, aE * haze)); edgeG.addColorStop(1, rgba(col, aE * haze * 0.2));
        ctx.strokeStyle = edgeG; ctx.lineWidth = mel ? 1.1 : 0.9; ctx.stroke();
        // the head: a short bright cap at the leading edge
        if (!sounding) {
          ctx.beginPath(); ctx.arc(xb, yb - wb / 2, wb / 2 - 0.6, 0.15 * Math.PI, 0.85 * Math.PI);
          ctx.strokeStyle = rgba(mel ? acc : ink, (mel ? 0.9 : 0.55) * haze); ctx.lineWidth = 1.6; ctx.stroke();
        }
      }
      ctx.restore();
      if (dt0 <= 0 && dt0 > -0.05 && i > r.lastIdx) { r.lastIdx = i; light[nt[2]] = Math.max(light[nt[2]], 0.45 + 0.55 * v); }
    }
    if (!playing) r.lastIdx = r.transport.indexAt(p) - 1;
    // where notes come out of the dark
    var fadeH = Math.min(110, hitY * 0.24), fg = ctx.createLinearGradient(0, 0, 0, fadeH);
    fg.addColorStop(0, colors.paper); fg.addColorStop(1, rgba(colors.paper, 0));
    ctx.globalAlpha = 1; ctx.fillStyle = fg; ctx.fillRect(0, 0, W, fadeH);
    // light pooling on the rail where notes land, fading after release
    for (var m2 = kb.lo; m2 <= kb.hi; m2++) {
      var kk = kb.keys[m2]; if (!kk) continue;
      var e = Math.max(light[m2] * 0.85, press[m2] ? 0.3 : 0); light[m2] *= playing ? 0.93 : 0.88;
      if (e < 0.02) continue;
      var gx = kk.x + kk.w / 2, R = kb.ww * 1.9, rg = ctx.createRadialGradient(gx, hitY, 0, gx, hitY, R);
      rg.addColorStop(0, rgba(press[m2] === 2 ? acc : (light[m2] > 0.5 ? acc : ink), 0.26 * e)); rg.addColorStop(1, rgba(acc, 0));
      ctx.fillStyle = rg; ctx.fillRect(gx - R, hitY - R, R * 2, R);
    }

    // ---- the keyboard ----
    // each key's travel eases: quick on the way down, slower to rise
    var keyA = r.keyA;
    for (m2 = kb.lo; m2 <= kb.hi; m2++) { var tgt = press[m2] ? 1 : 0; keyA[m2] += (tgt - keyA[m2]) * (tgt > keyA[m2] ? 0.55 : 0.2); }
    var ky = Math.round(kb.top), kh = kb.kh;
    var WHITE_T = dark ? '#cfcfc9' : '#f6f6f2', WHITE_B = dark ? '#e0e0da' : '#fdfdfb', GAP = dark ? '#0a0b0c' : '#c9cac4';
    // the cheek: a felt strip, and the fallboard's shadow across the tops of the keys
    ctx.fillStyle = dark ? '#05060a' : '#1c1416'; ctx.fillRect(0, hitY, W, rail);
    ctx.fillStyle = GAP; ctx.fillRect(0, ky, W, kh);
    for (m2 = kb.lo; m2 <= kb.hi; m2++) {
      var key = kb.keys[m2]; if (!key || key.black) continue;
      var d = keyA[m2], pr = press[m2], x0 = Math.round(key.x) + 0.5, w = Math.round(key.x + key.w) - Math.round(key.x) - 1, lip = 5 - d * 2.2;
      // surface: polished, barely shaded, a touch darker as the key goes down
      var sg = ctx.createLinearGradient(0, ky, 0, ky + kh);
      sg.addColorStop(0, WHITE_T); sg.addColorStop(1, WHITE_B);
      ctx.fillStyle = sg; ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x0, ky, w, kh - 0.5, [0, 0, 2.5, 2.5]); else ctx.rect(x0, ky, w, kh);
      ctx.fill();
      if (d > 0.01) {
        var tint = ctx.createLinearGradient(0, ky, 0, ky + kh);
        var tc = pr === 2 || (light[m2] > 0.5) ? acc : (dark ? '#000000' : '#15171b');
        tint.addColorStop(0, rgba(tc, (pr === 2 ? 0.34 : 0.13) * d)); tint.addColorStop(1, rgba(tc, (pr === 2 ? 0.06 : 0.03) * d));
        ctx.fillStyle = tint; ctx.fill();
        // the pressed key sits lower than its neighbours: their edges cast a hairline of shade
        ctx.fillStyle = 'rgba(0,0,0,' + (0.12 * d) + ')'; ctx.fillRect(x0, ky, 1.5, kh - lip); ctx.fillRect(x0 + w - 1.5, ky, 1.5, kh - lip);
      }
      // the front lip: the key's rounded edge catching light
      var lg2 = ctx.createLinearGradient(0, ky + kh - lip - 1, 0, ky + kh);
      lg2.addColorStop(0, 'rgba(0,0,0,0)'); lg2.addColorStop(0.35, dark ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.07)'); lg2.addColorStop(1, dark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.13)');
      ctx.fillStyle = lg2; ctx.fillRect(x0, ky + kh - lip - 1, w, lip + 1);
    }
    // the fallboard's soft shadow across all the keys
    var shd = ctx.createLinearGradient(0, ky, 0, ky + 7);
    shd.addColorStop(0, dark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.16)'); shd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shd; ctx.fillRect(0, ky, W, 7);
    var bh = kh * 0.63;
    for (m2 = kb.lo; m2 <= kb.hi; m2++) {
      var bk = kb.keys[m2]; if (!bk || !bk.black) continue;
      var db = keyA[m2], on = press[m2], bx = Math.round(bk.x) + 0.5, bwid = Math.round(bk.w), bevel = Math.max(1.5, bwid * 0.12), front = 6 - db * 2.5;
      // body: the sides, darker
      ctx.fillStyle = on === 2 ? rgba(acc, 1) : (dark ? '#08090b' : '#111215');
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, ky - 0.5, bwid, bh, [0, 0, 2, 2]); else ctx.rect(bx, ky, bwid, bh); ctx.fill();
      // the top surface, inset by the bevel: satin, faintly lighter toward the player
      var tg = ctx.createLinearGradient(0, ky, 0, ky + bh - front);
      if (on === 2) { tg.addColorStop(0, rgba(acc, 0.85)); tg.addColorStop(1, rgba('#ffffff', 0.18)); }
      else { tg.addColorStop(0, dark ? '#16171b' : '#1b1d21'); tg.addColorStop(1, dark ? '#24262b' : '#2e3036'); }
      ctx.fillStyle = tg; ctx.fillRect(bx + bevel, ky, bwid - bevel * 2, bh - front - bevel * 0.6);
      if (on === 1) { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(bx + bevel, ky, bwid - bevel * 2, bh - front); }
      // the front face: a narrow band, lit from above
      ctx.fillStyle = on ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.1)'; ctx.fillRect(bx + bevel * 0.6, ky + bh - front, bwid - bevel * 1.2, front - 1.2);
      ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(bx + bevel, ky + bh - front, bwid - bevel * 2, 0.8);
    }
    if (kb.keys[60]) { ctx.fillStyle = dark ? 'rgba(0,0,0,0.35)' : 'rgba(21,23,27,0.3)'; ctx.font = '400 9px Archivo, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('C4', kb.keys[60].x + kb.ww / 2, ky + kh - 7); }
    ctx.globalAlpha = 1;
  }

  // guitar: a string and fret for every note, preferring low positions near the hand
  function assignStrings(notes) {
    var OPEN = [40, 45, 50, 55, 59, 64], hand = 2, until = [0, 0, 0, 0, 0, 0];
    notes.forEach(function (n) {
      var best = null, bc = 1e9;
      for (var s = 5; s >= 0; s--) {
        var f = n[2] - OPEN[s]; if (f < 0 || f > 12) continue;
        var cost = Math.abs(f - hand) * 1.2 + (f === 0 ? -0.5 : 0) + (until[s] > n[0] + 0.02 ? 8 : 0) + f * 0.15;
        if (cost < bc) { bc = cost; best = [s, f]; }
      }
      if (!best) best = [n[2] < 52 ? 0 : 5, clamp(n[2] - OPEN[n[2] < 52 ? 0 : 5], 0, 19)];
      n[4] = best[0]; n[5] = best[1]; until[best[0]] = n[0] + n[1];
      if (best[1] > 0) hand = hand * 0.6 + best[1] * 0.4;
    });
  }

  /* ---------- Recuerdos: a classical guitar, played ----------
     The instrument is modelled in centimetres to a classical guitar's
     proportions (650 mm scale, the body joining at the 12th fret, a slotted
     head, rosette, tie-block bridge) and drawn through a camera. Each note
     is placed on a string and fret by a simple model of the left hand (see
     assignStrings): this fingering is computed, not Tárrega's own.
     Fingertips press where notes are fretted; the sounding length of each
     string vibrates in its first modes; a pluck sends a pulse along the
     string from the right hand toward the fret, so the tremolo becomes a
     quick train of pulses on the treble strings; the soundhole answers. */
  var G = (function () {
    var nut = 17, scale = 65, join = nut + scale / 2;
    var fret = function (f) { return nut + scale * (1 - Math.pow(2, -f / 12)); };
    // The body, from a classical guitar plan in the Hauser / Torres tradition (mm along the
    // 485 mm body from the neck joint; half-widths in mm): upper bout 280 wide at 105, waist 235
    // at 215, lower bout 365 at 360. The bouts are superellipses (fuller than ellipses, as a
    // guitar's are): the upper from the joint to its widest point, the lower from its widest
    // point to the tail. Between them a monotone cubic through the measured widths, with zero
    // slope where it meets each bout, so the outline is smooth everywhere and cannot overshoot.
    var BL = 485, UX = 105, UW = 140, UE = 2.6, LX = 360, LW = 182.5, LE = 2.4;
    var BX = [105, 150, 190, 215, 240, 280, 320, 360], BW = [140, 133, 121, 117.5, 121, 145, 168, 182.5];
    var BM = (function () {
      var n = BX.length, d = [], m = [0];
      for (var i = 0; i < n - 1; i++) d.push((BW[i + 1] - BW[i]) / (BX[i + 1] - BX[i]));
      for (i = 1; i < n - 1; i++) {
        if (d[i - 1] * d[i] <= 0) { m[i] = 0; continue; }
        var w1 = 2 * (BX[i + 1] - BX[i]) + (BX[i] - BX[i - 1]), w2 = (BX[i + 1] - BX[i]) + 2 * (BX[i] - BX[i - 1]);
        m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
      }
      m[n - 1] = 0; return m;
    })();
    function halfMM(x) {
      if (x <= 0 || x >= BL) return 0;
      if (x <= UX) { var d = (UX - x) / UX; return UW * Math.pow(Math.max(0, 1 - Math.pow(d, UE)), 1 / UE); }
      if (x >= LX) { var e = (x - LX) / (BL - LX); return LW * Math.pow(Math.max(0, 1 - Math.pow(e, LE)), 1 / LE); }
      for (var i = 0; i < BX.length - 1; i++) if (x <= BX[i + 1]) {
        var h = BX[i + 1] - BX[i], t = (x - BX[i]) / h, t2 = t * t, t3 = t2 * t;
        return (2 * t3 - 3 * t2 + 1) * BW[i] + (t3 - 2 * t2 + t) * h * BM[i] + (-2 * t3 + 3 * t2) * BW[i + 1] + (t3 - t2) * h * BM[i + 1];
      }
      return 0;
    }
    function body(u) { return halfMM((u - join) * 10) / 10; }
    // the outline as a closed polygon (cm), densest at the ends where it turns fastest, and its inward offset
    function bodyOutline(inset) {
      var top = [], bot = [], N = 360;
      for (var i = 0; i <= N; i++) { var x = BL * (0.5 - 0.5 * Math.cos(Math.PI * i / N)), u = join + x / 10, w = halfMM(x) / 10; top.push([u, -w]); bot.unshift([u, w]); }
      var poly = top.concat(bot.slice(1, -1));
      if (!inset) return poly;
      return poly.map(function (p, i) {
        var a = poly[(i - 1 + poly.length) % poly.length], b = poly[(i + 1) % poly.length], tx = b[0] - a[0], ty = b[1] - a[1], L = Math.hypot(tx, ty) || 1;
        var nx = ty / L, ny = -tx / L;                          // inward for this winding
        return [p[0] + nx * inset, p[1] + ny * inset];
      });
    }
    var neckHalf = function (u) { return 2.6 + (u - nut) / (fret(19) - nut) * 0.75; };
    var stringV = function (s, u) {                             // string 0 = low E, at the top, as seen from the front
      var t = (u - nut) / scale, half = 2.05 + (2.85 - 2.05) * clamp(t, 0, 1);
      return -half + s * half * 2 / 5;
    };
    return { nut: nut, scale: scale, join: join, fret: fret, body: body, bodyOutline: bodyOutline, neckHalf: neckHalf, stringV: stringV,
             saddle: nut + scale, hole: { u: join + 15.0, r: 4.3 }, pluck: 76.5, end: join + BL / 10 };
  })();
  // the whole guitar, face on, as large as the plate allows
  function camera(r) {
    var W = r.W, H = r.H, k = Math.min(W * 0.94 / 98.5, H * 0.9 / 36.5), mid = (0.6 + 98) / 2;
    return { k: k, T: function (u, v) { return [W * 0.5 + (u - mid) * k, H * 0.5 + v * k]; }, s: function () { return 1; } };
  }
  function drawStrings(r, ctx, pos, settle, now) {
    var W = r.W, H = r.H, n = r.notes, ink = colors.ink, acc = colors.accent;
    var cam = camera(r), T = cam.T, k = cam.k;
    var M = dark ? {
      top0: '#1d1f22', top1: '#16171a', grain: 'rgba(231,231,226,0.035)', edge: 'rgba(231,231,226,0.42)', binding: 'rgba(231,231,226,0.16)',
      board0: '#26282d', board1: '#1c1d21', boardGrain: 'rgba(255,255,255,0.035)', head: '#1c1d21', slot: '#101113',
      fretHi: 'rgba(235,235,230,0.75)', fretLo: 'rgba(0,0,0,0.6)', bone: '#d8d4c8', bridge: '#2c2e33', tie: '#202125',
      nylon: 'rgba(226,222,212,0.92)', silver: 'rgba(205,207,212,0.95)', silverHi: 'rgba(255,255,255,0.55)', overTop: 'rgba(226,222,212,0.78)', hole: '#070809'
    } : {
      top0: '#f7f5ef', top1: '#ecebe5', grain: 'rgba(120,100,70,0.055)', edge: 'rgba(21,23,27,0.6)', binding: 'rgba(21,23,27,0.2)',
      board0: '#24262b', board1: '#15161a', boardGrain: 'rgba(255,255,255,0.04)', head: '#1a1b1f', slot: '#f4f4f1',
      fretHi: 'rgba(240,240,236,0.85)', fretLo: 'rgba(0,0,0,0.55)', bone: '#f1ede2', bridge: '#4a4c52', tie: '#35373c',
      nylon: 'rgba(238,234,224,0.95)', silver: 'rgba(225,227,231,0.98)', silverHi: 'rgba(255,255,255,0.7)', overTop: 'rgba(40,42,47,0.82)', hole: '#121316'
    };
    function path(c, pts) { c.beginPath(); pts.forEach(function (p, i) { var q = T(p[0], p[1]); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); }
    function circle(c, u, v, rr) { var q = T(u, v); c.beginPath(); c.arc(q[0], q[1], rr * k, 0, 6.283); }
    var fbPts = [[G.nut, -G.neckHalf(G.nut)], [G.fret(19), -G.neckHalf(G.fret(19))], [G.fret(19), G.neckHalf(G.fret(19))], [G.nut, G.neckHalf(G.nut)]];
    var headPts = (function () {
      var pts = [], i, t;
      // sides: from the nut, widening gently, the last centimetres curving out
      var side = function (sg) { var o = []; for (i = 0; i <= 20; i++) { t = i / 20; var u = G.nut - 0.6 - t * (G.nut - 2.6); o.push([u, sg * (2.75 + 0.9 * Math.pow(t, 1.6))]); } return o; };
      // the crest: a shallow convex arc between rounded corners, peaking at the centre
      var crest = []; for (i = 0; i <= 24; i++) { t = i / 24; var v = -3.65 + 7.3 * t; crest.push([2.6 - 0.55 * Math.sin(Math.PI * t) - 0.5 * Math.pow(Math.abs(2 * t - 1), 6), v]); }
      pts = side(-1).concat(crest, side(1).reverse());
      return pts;
    })();

    // ---- the instrument, drawn once per size and theme ----
    var key = [W, H, r.DPR, dark].join();
    if (r.gKey !== key) {
      r.gKey = key;
      var off = r.gLayer || (r.gLayer = document.createElement('canvas'));
      off.width = Math.round(W * r.DPR); off.height = Math.round(H * r.DPR);
      var c = off.getContext('2d'); c.setTransform(r.DPR, 0, 0, r.DPR, 0, 0); c.clearRect(0, 0, W, H);
      var u, outline = [];
      outline = G.bodyOutline(0);
      // the top: spruce, warm at the centre, grain running with the strings
      path(c, outline); c.closePath();
      var hc = T(G.hole.u + 8, 0), tg = c.createRadialGradient(hc[0], hc[1], 0, hc[0], hc[1], 26 * k);
      tg.addColorStop(0, M.top0); tg.addColorStop(1, M.top1); c.fillStyle = tg; c.fill();
      c.save(); path(c, outline); c.closePath(); c.clip();
      var rnd = 7; function rand() { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; }
      for (var gv = -18.6; gv < 18.6; gv += 0.16 + rand() * 0.34) {
        c.globalAlpha = 0.5 + rand() * 0.8; path(c, [[48, gv], [101, gv + (rand() - 0.5) * 0.25]]); c.strokeStyle = M.grain; c.lineWidth = 0.6 + rand() * 0.7; c.stroke();
      }
      c.globalAlpha = 1; c.restore();
      // binding: the edge, and a fine purfling line inside it
      path(c, outline); c.closePath(); c.strokeStyle = M.edge; c.lineWidth = 1.1; c.stroke();
      var inner = G.bodyOutline(0.5);                          // the binding: a constant inset along the outline's normal
      path(c, inner); c.closePath(); c.strokeStyle = M.binding; c.lineWidth = Math.max(1, 0.3 * k); c.stroke();
      // rosette: two fine rings each side of a mosaic band of small alternating tiles
      c.strokeStyle = M.edge;
      [5.0, 5.3, 6.75, 7.05].forEach(function (rr, j) { circle(c, G.hole.u, 0, rr); c.globalAlpha = j === 1 || j === 2 ? 0.6 : 0.32; c.lineWidth = 0.75; c.stroke(); });
      var hcc = T(G.hole.u, 0);
      for (var t = 0; t < 180; t++) {
        var a0 = t / 180 * 6.283, a1 = (t + 0.5) / 180 * 6.283, r0 = 5.55 * k, r1 = 6.5 * k;
        c.beginPath(); c.arc(hcc[0], hcc[1], r1, a0, a1); c.arc(hcc[0], hcc[1], r0, a1, a0, true); c.closePath();
        c.globalAlpha = t % 2 ? 0.16 : 0.3; c.fillStyle = dark ? '#e7e7e2' : '#15171b'; c.fill();
      }
      c.globalAlpha = 1;
      circle(c, G.hole.u, 0, G.hole.r); c.fillStyle = M.hole; c.fill();
      // bridge: rosewood, a tie block, a bone saddle
      path(c, [[G.saddle - 0.7, -8.8], [G.saddle + 2.4, -8.8], [G.saddle + 2.4, 8.8], [G.saddle - 0.7, 8.8]]); c.closePath();
      var bq0 = T(0, -8.8), bq1 = T(0, 8.8), bg2 = c.createLinearGradient(0, bq0[1], 0, bq1[1]);
      bg2.addColorStop(0, M.bridge); bg2.addColorStop(0.5, M.tie); bg2.addColorStop(1, M.bridge); c.fillStyle = bg2; c.fill();
      path(c, [[G.saddle + 1.15, -4.2], [G.saddle + 2.25, -4.2], [G.saddle + 2.25, 4.2], [G.saddle + 1.15, 4.2]]); c.closePath(); c.fillStyle = M.tie; c.fill();
      path(c, [[G.saddle, -3.5], [G.saddle, 3.5]]); c.strokeStyle = M.bone; c.lineWidth = Math.max(1.6, 0.24 * k); c.stroke();
      // head: slotted, six tuner buttons
      path(c, headPts); c.closePath(); c.fillStyle = M.head; c.fill();
      [-1, 1].forEach(function (sg) {
        path(c, [[3.4, sg * 0.75], [14.4, sg * 0.75], [14.4, sg * 1.95], [3.4, sg * 1.95]]); c.closePath(); c.fillStyle = M.slot; c.fill();
        [5.2, 8.8, 12.4].forEach(function (uu) {
          path(c, [[uu, sg * 4.1], [uu, sg * 3.5]]); c.strokeStyle = M.edge; c.lineWidth = Math.max(1, 0.22 * k); c.stroke();
          var q = T(uu, sg * 4.95); c.beginPath(); c.ellipse(q[0], q[1], 0.5 * k, 0.75 * k, 0, 0, 6.283); c.fillStyle = M.bone; c.fill(); c.strokeStyle = M.edge; c.lineWidth = 0.8; c.stroke();
        });
      });
      // fingerboard: dark, faintly rounded, a little grain
      path(c, fbPts); c.closePath();
      var fq0 = T(30, -3), fq1 = T(30, 3), fg2 = c.createLinearGradient(0, fq0[1], 0, fq1[1]);
      fg2.addColorStop(0, M.board1); fg2.addColorStop(0.5, M.board0); fg2.addColorStop(1, M.board1); c.fillStyle = fg2; c.fill();
      c.save(); path(c, fbPts); c.closePath(); c.clip();
      for (var gv2 = -3.4; gv2 < 3.4; gv2 += 0.12 + rand() * 0.22) { path(c, [[G.nut, gv2], [G.fret(19), gv2 + (rand() - 0.5) * 0.2]]); c.strokeStyle = M.boardGrain; c.lineWidth = 0.6; c.stroke(); }
      c.restore();
      // frets: nickel silver, a bright crown with a shadow beside it
      for (var f = 1; f <= 19; f++) {
        var uf = G.fret(f), hh = G.neckHalf(uf) - 0.05;
        path(c, [[uf + 0.07, -hh], [uf + 0.07, hh]]); c.strokeStyle = M.fretLo; c.lineWidth = Math.max(1, 0.1 * k); c.stroke();
        path(c, [[uf, -hh], [uf, hh]]); c.strokeStyle = M.fretHi; c.lineWidth = Math.max(0.9, 0.09 * k); c.stroke();
      }
      // the nut, bone
      path(c, [[G.nut, -2.75], [G.nut, 2.75]]); c.strokeStyle = M.bone; c.lineWidth = Math.max(2, 0.42 * k); c.stroke();
      // fret numbers beneath the neck
      c.font = '400 10px Archivo, sans-serif'; c.fillStyle = colors['ink-3']; c.textAlign = 'center'; c.textBaseline = 'top'; c.globalAlpha = 0.8;
      [3, 5, 7, 9, 12].forEach(function (f2) { var q = T((G.fret(f2) + G.fret(f2 - 1)) / 2, G.neckHalf(G.fret(f2)) + 0.85); c.fillText(String(f2), q[0], q[1]); });
      c.globalAlpha = 1;
    }
    ctx.drawImage(r.gLayer, 0, 0, W, H);

    // ---- what is sounding ----
    var energy = 0, ring = [null, null, null, null, null, null], start = Math.max(0, r.transport.indexAt(pos - 3) - 6), i;
    for (i = start; i < n.length; i++) {
      var nt = n[i]; if (nt[0] > pos) break;
      var age = pos + settle - nt[0]; if (age > 3) continue;
      if (!ring[nt[4]] || ring[nt[4]][0] < nt[0]) ring[nt[4]] = nt;            // string 0 = low E, at the top
      energy += nt[3] * Math.exp(-age * 1.6);
    }
    // the soundhole answers, quietly
    var hq = T(G.hole.u, 0), hr = G.hole.r * k, rg = ctx.createRadialGradient(hq[0], hq[1], 0, hq[0], hq[1], hr);
    rg.addColorStop(0, rgba(acc, Math.min(0.2, energy * 0.045))); rg.addColorStop(1, rgba(acc, 0));
    ctx.beginPath(); ctx.arc(hq[0], hq[1], hr, 0, 6.283); ctx.fillStyle = rg; ctx.fill();

    // ---- the strings ----
    var sAge = ring.map(function (x) { return x ? Math.max(0, pos + settle - x[0]) : 99; });
    function dark_regions(c) { path(c, fbPts); c.closePath(); var q = T(G.hole.u, 0); c.moveTo(q[0] + G.hole.r * k, q[1]); c.arc(q[0], q[1], G.hole.r * k, 0, 6.283); }
    for (var s = 0; s < 6; s++) {
      var nt2 = ring[s], a = sAge[s], wound = s < 3, fr = nt2 ? nt2[5] : 0, uS = fr ? G.fret(fr) : G.nut;
      var amp = nt2 ? (0.06 + 0.2 * nt2[3]) * Math.exp(-a * (wound ? 1.15 : 1.9)) : 0;
      var lw = Math.max(wound ? 1.1 : 0.85, (wound ? 0.1 - s * 0.01 : 0.075 - (s - 3) * 0.006) * k);
      var v0 = G.stringV(s, G.nut), vS = G.stringV(s, uS), vE = G.stringV(s, G.saddle);
      // the resting line, nut to saddle; light over dark wood, dark over the top
      for (var pass = 0; pass < 2; pass++) {
        ctx.save();
        if (pass === 1) { dark_regions(ctx); ctx.clip(); }
        path(ctx, [[G.nut, v0], [G.saddle, vE]]);
        ctx.strokeStyle = pass ? (wound ? M.silver : M.nylon) : M.overTop; ctx.lineWidth = lw; ctx.stroke();
        if (wound) { ctx.setLineDash([0.9, 1.3]); ctx.strokeStyle = pass ? 'rgba(0,0,0,0.35)' : (dark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.55)'); ctx.lineWidth = lw * 0.5; ctx.stroke(); ctx.setLineDash([]); }
        ctx.restore();
      }
      // a sounding string blurs into a spindle between the fret and the saddle, and narrows as it decays
      if (amp > 0.01) {
        var up = [], dn = [];
        for (var j = 0; j <= 48; j++) {
          var x = j / 48, uu = uS + (G.saddle - uS) * x, base = vS + (vE - vS) * x, env = Math.sin(Math.PI * x) * amp * (1 + 0.12 * Math.sin(now / 45 + s));
          up.push([uu, base - env]); dn.unshift([uu, base + env]);
        }
        var col = s > 2 ? acc : (dark ? '#e7e7e2' : '#15171b');
        path(ctx, up.concat(dn)); ctx.closePath(); ctx.fillStyle = rgba(col, s > 2 ? 0.13 : 0.11); ctx.fill();
        path(ctx, up); ctx.strokeStyle = rgba(col, s > 2 ? 0.38 : 0.32); ctx.lineWidth = 0.6; ctx.stroke();
        path(ctx, dn); ctx.stroke();
      }
    }
    // strings over the head, to their rollers
    ctx.strokeStyle = M.nylon; ctx.lineWidth = 0.9; ctx.globalAlpha = 0.75;
    for (s = 0; s < 6; s++) { var side = s < 3 ? -1 : 1, tu = [12.4, 8.8, 5.2][s < 3 ? s : 5 - s]; path(ctx, [[G.nut, G.stringV(s, G.nut)], [tu, side * 1.35]]); ctx.stroke(); }
    // the ties at the bridge
    ctx.globalAlpha = 1; ctx.fillStyle = M.bone;
    for (s = 0; s < 6; s++) { var tq = T(G.saddle + 1.7, G.stringV(s, G.saddle) * 1.06); ctx.beginPath(); ctx.ellipse(tq[0], tq[1], 0.32 * k, 0.16 * k, 0, 0, 6.283); ctx.fill(); }

    // ---- the hands ----
    for (s = 0; s < 6; s++) {
      var nt3 = ring[s], a3 = sAge[s]; if (!nt3 || a3 > 2.4) continue;
      var heldN = a3 < nt3[1] + 0.12, fade = heldN ? 1 : Math.exp(-(a3 - nt3[1] - 0.12) * 5);
      var fr3 = nt3[5], treble = s > 2;
      // the fingertip: a pad pressing just behind the fret, set down quickly, lifted softly
      if (fr3 > 0 && fade > 0.02) {
        var uF = G.fret(fr3) - (G.fret(fr3) - G.fret(fr3 - 1)) * 0.32, q = T(uF, G.stringV(s, uF)), land = Math.min(1, a3 / 0.06);
        ctx.globalAlpha = fade;
        ctx.beginPath(); ctx.ellipse(q[0], q[1], 0.62 * k * (1.15 - 0.15 * land), 0.42 * k * (1.15 - 0.15 * land), 0, 0, 6.283);
        ctx.fillStyle = rgba(acc, 0.9); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1; ctx.stroke();
      }
      // the right hand: where the finger leaves the string, a ring opens
      if (a3 < 0.5) { var pq = T(G.pluck, G.stringV(s, G.pluck)); ctx.globalAlpha = 0.7 * Math.exp(-a3 * 6); ctx.beginPath(); ctx.arc(pq[0], pq[1], (0.25 + a3 * 1.8) * k, 0, 6.283); ctx.strokeStyle = treble ? acc : M.edge; ctx.lineWidth = 1; ctx.stroke(); }
      // the wave runs from the pluck to the fret: a short bright segment, fading
      var prog = a3 / 0.5;
      if (prog < 1) {
        var uEnd = fr3 ? G.fret(fr3) : G.nut, uc = G.pluck + (uEnd - G.pluck) * (1 - Math.pow(1 - prog, 1.5)), len = 4.5;
        var p1 = T(uc + len, G.stringV(s, uc + len)), p0 = T(uc, G.stringV(s, uc)), lg = ctx.createLinearGradient(p1[0], p1[1], p0[0], p0[1]);
        lg.addColorStop(0, rgba(treble ? acc : ink, 0)); lg.addColorStop(1, rgba(treble ? acc : ink, (1 - prog) * (treble ? 0.9 : 0.5)));
        ctx.globalAlpha = 1; ctx.strokeStyle = lg; ctx.lineWidth = Math.max(1.8, 0.17 * k); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p0[0], p0[1]); ctx.stroke(); ctx.lineCap = 'butt';
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ======================================================================
     Handscroll viewer: right-to-left, with a detail lens, and for a long
     scroll a true-proportion miniature of the whole with a window on it.
     ====================================================================== */
  function Scroll(el) {
    var plate = el.querySelector('.plate'), strip = plate.querySelector('.scroll-strip'), img = strip.querySelector('img');
    var mini = el.querySelector('.minimap'), win = mini && mini.querySelector('.mini-window'), lens = plate.querySelector('.lens');
    var s = { el: el, shown: false, x: 0, vx: 0, auto: el.dataset.drift === 'true', dragging: false, raf: 0, revealed: false, d: { max: 0 } };
    function dims() {
      var ph = plate.clientHeight, pw = plate.clientWidth, ar = (img.naturalWidth / img.naturalHeight) || (img.width / img.height) || 3;
      var h = ph, w = h * ar; if (w < pw) { w = pw; h = w / ar; }
      return { pw: pw, ph: ph, w: w, h: h, max: Math.max(0, w - pw) };
    }
    function place() {
      if (mini) el.style.setProperty('--mini-h', mini.offsetHeight + 'px');
      var d = s.d = dims();
      img.style.width = d.w + 'px'; img.style.height = d.h + 'px';
      var cx = clamp(s.x, 0, d.max); if (cx !== s.x) s.vx = 0;    // at either end the scroll stops: no overrun, no drift
      s.x = cx;
      strip.style.transform = 'translate3d(' + (-(d.max - s.x)).toFixed(1) + 'px,0,0)';
      if (win) { var mw = mini.clientWidth; win.style.width = (d.pw / d.w * mw).toFixed(1) + 'px'; win.style.transform = 'translateX(' + ((d.max - s.x) / d.w * mw).toFixed(1) + 'px)'; }
    }
    function loop() {
      s.raf = 0; if (!s.shown) return;
      if (!s.dragging) { if (s.auto && !reduced) s.x += 0.55; s.x += s.vx; s.vx *= 0.92; if (Math.abs(s.vx) < 0.02) s.vx = 0; }
      place();
      if ((s.auto && s.x < s.d.max) || s.vx || s.dragging) s.raf = requestAnimationFrame(loop);
    }
    function kick() { if (!s.raf && s.shown) s.raf = requestAnimationFrame(loop); }
    s.kick = kick;
    // the browser must not select or drag the artwork itself: that is what made a ghost image
    // appear when a drag was continued past either end
    var noDrag = function (e) { e.preventDefault(); };
    plate.addEventListener('dragstart', noDrag); if (mini) mini.addEventListener('dragstart', noDrag);
    plate.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();                                     // no selection, no native drag; keyboard users reach the plate with Tab
      s.dragging = true; s.auto = false; s.lx = e.clientX; s.vx = 0; plate.setPointerCapture(e.pointerId); plate.classList.add('is-drag'); lens && lens.classList.remove('is-on'); kick();
    });
    plate.addEventListener('pointermove', function (e) {
      if (s.dragging) { var dx = e.clientX - s.lx; s.lx = e.clientX; s.x += dx; s.vx = dx; place(); }
      else if (lens && e.pointerType === 'mouse') moveLens(e);
    });
    var end = function () { s.dragging = false; plate.classList.remove('is-drag'); kick(); };
    plate.addEventListener('pointerup', end); plate.addEventListener('pointercancel', end); plate.addEventListener('lostpointercapture', end);
    plate.addEventListener('pointerleave', function () { lens && lens.classList.remove('is-on'); });
    plate.addEventListener('wheel', function (e) { if (Math.abs(e.deltaX) < Math.abs(e.deltaY) && !e.shiftKey) return; e.preventDefault(); s.auto = false; s.x -= (e.deltaX || e.deltaY); place(); }, { passive: false });
    plate.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { s.auto = false; s.x += 90; place(); e.preventDefault(); }
      if (e.key === 'ArrowRight') { s.auto = false; s.x -= 90; place(); e.preventDefault(); }
    });
    if (mini) {
      var mdrag = false;
      var toMini = function (e) { var b = mini.getBoundingClientRect(), f = (e.clientX - b.left) / b.width; s.auto = false; s.x = s.d.max - (f * s.d.w - s.d.pw / 2); place(); };
      var mend = function () { mdrag = false; mini.classList.remove('is-drag'); };
      mini.addEventListener('pointerdown', function (e) { if (e.button !== 0) return; e.preventDefault(); mdrag = true; mini.setPointerCapture(e.pointerId); mini.classList.add('is-drag'); toMini(e); });
      mini.addEventListener('pointermove', function (e) { if (mdrag) toMini(e); });
      mini.addEventListener('pointerup', mend); mini.addEventListener('pointercancel', mend); mini.addEventListener('lostpointercapture', mend);
    }
    function moveLens(e) {
      var b = plate.getBoundingClientRect(), px = e.clientX - b.left, py = e.clientY - b.top, d = s.d;
      var ix = (px + (d.max - s.x)) / d.w, iy = py / d.h, z = 2.4, L = lens.offsetWidth;
      lens.style.transform = 'translate3d(' + (px - L / 2) + 'px,' + (py - L / 2) + 'px,0)';
      lens.style.backgroundImage = 'url("' + img.currentSrc + '")';
      lens.style.backgroundSize = (d.w * z) + 'px ' + (d.h * z) + 'px';
      lens.style.backgroundPosition = (-(ix * d.w * z - L / 2)) + 'px ' + (-(iy * d.h * z - L / 2)) + 'px';
      lens.classList.add('is-on');
    }
    function reveal() {
      if (s.revealed) return; s.revealed = true;
      if (motion) { plate.classList.add('is-revealing'); setTimeout(function () { plate.classList.remove('is-revealing'); plate.classList.add('is-revealed'); }, 2600); }
      else plate.classList.add('is-revealed');
    }
    img.addEventListener('load', function () { place(); if (s.shown) reveal(); });
    if ('ResizeObserver' in window) new ResizeObserver(function () { place(); }).observe(plate);
    s.show = function (on) { s.shown = on; if (on) { if (img.complete && img.naturalWidth) { place(); reveal(); } kick(); } };
    place();
    return s;
  }

  /* ---------- rooms and chapters ---------- */
  var rooms = [], byId = {};
  root.querySelectorAll('[data-room]').forEach(function (el) {
    var kind = el.dataset.room, r;
    if (kind === 'piano') r = MusicRoom(el, 'piano', drawKeys, setupKeys);
    else if (kind === 'guitar') r = MusicRoom(el, 'guitar', drawStrings);
    else if (kind === 'scroll') r = Scroll(el);
    else r = { show: function (on) { el.dispatchEvent(new CustomEvent('roomshow', { detail: on })); }, kick: function () {} };
    rooms.push(r); byId[el.id] = r;
  });
  document.addEventListener('themechange', function () { readColors(); rooms.forEach(function (r) { r.gKey = null; r.kick && r.kick(); }); });

  // Every room stays in the page; only one is current. Changing room changes
  // two classes: the old work fades out as the new one fades in, in place.
  var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"][data-chapter]')), current = null, currentRoom = null;
  var panels = Array.prototype.slice.call(root.querySelectorAll('[data-chapter-panel]'));
  function setCurrent(el, on) {
    el.classList.toggle('is-current', on);
    if ('inert' in el) el.inert = !on; el.setAttribute('aria-hidden', String(!on));
  }
  function showRoom(id) {
    if (id === currentRoom) return;
    currentRoom = id;
    root.querySelectorAll('[data-room]').forEach(function (el) {
      var on = el.id === id;
      if (el.classList.contains('is-current') !== on || !el.dataset.init) { el.dataset.init = '1'; setCurrent(el, on); if (byId[el.id]) byId[el.id].show(on); }
    });
  }
  function select(chapter, focus, initial) {
    if (chapter === current) return;
    current = chapter;
    tabs.forEach(function (t) { var on = t.dataset.chapter === chapter; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
    panels.forEach(function (p) { setCurrent(p, p.dataset.chapterPanel === chapter); });
    var panel = root.querySelector('[data-chapter-panel="' + chapter + '"]');
    var pick = panel.querySelector('[data-instrument][aria-pressed="true"]');
    showRoom(pick ? pick.dataset.instrument : panel.querySelector('[data-room]').id);
    if (!initial) try { history.replaceState(null, '', '#' + chapter); } catch (e) {}
    if (focus) tabs.filter(function (t) { return t.dataset.chapter === chapter; })[0].focus();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { select(t.dataset.chapter); });
    t.addEventListener('keydown', function (e) {
      var j = null;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') j = (i + 1) % tabs.length;
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
      if (e.key === 'Home') j = 0; if (e.key === 'End') j = tabs.length - 1;
      if (j != null) { e.preventDefault(); select(tabs[j].dataset.chapter, true); }
    });
  });
  root.querySelectorAll('[data-instrument]').forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.dataset.instrument;
      b.closest('[data-chapter-panel]').querySelectorAll('[data-instrument]').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.instrument === id)); });
      showRoom(id);
      var nb = byId[id] && byId[id].el && byId[id].el.querySelector('[data-instrument="' + id + '"]'); if (nb) nb.focus();
    });
  });
  // the music stops when the section leaves view, the tab is hidden, or the page is left
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) {
      var v = en[0].isIntersecting && !document.hidden;
      rooms.forEach(function (r) { r.visible = v; if (v && r.kick) r.kick(); if (!v && r.transport) r.transport.pause(); });
    }, { threshold: 0.05 }).observe(root);
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) rooms.forEach(function (r) { r.transport && r.transport.pause(); }); });
  window.addEventListener('pagehide', function () { rooms.forEach(function (r) { r.transport && r.transport.pause(); }); if (A.ctx && A.ctx.state === 'running') A.ctx.suspend(); });

  // fetch the scroll images once the page is idle, so a room never opens blank
  var warm = function () { root.querySelectorAll('img[loading="lazy"]').forEach(function (im) { im.loading = 'eager'; }); };
  if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 2500 }); else setTimeout(warm, 1500);

  // exposed for automated checks only
  window.__exhibit = { audio: A, rooms: rooms, setSound: setSound };

  showSound();
  var start = (location.hash || '').replace('#', '');
  select(['qin', 'qi', 'shu', 'hua'].indexOf(start) >= 0 ? start : 'qin', false, true);
})();

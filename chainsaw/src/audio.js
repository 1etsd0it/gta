/* =============================================================================
 *  audio.js — весь звук синтезируется на Web Audio API, ни одного файла:
 *  луп бензопилы, выстрелы, крики, взрывы и synthwave-подложка с секвенсором.
 * ========================================================================== */
(function () {
  'use strict';
  const CR = window.CR, U = CR.Utils;

  const S = CR.Sound = {
    ctx: null,
    ready: false,
    muted: false,
    _noise: null,
    _saw: null,
    music: null
  };

  /* ------------------------------ инициализация ---------------------------- */
  S.init = function () {
    if (S.ctx) { if (S.ctx.state === 'suspended') S.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = S.ctx = new AC();

    S.master = ctx.createGain(); S.master.gain.value = S.muted ? 0 : 0.9;
    S.master.connect(ctx.destination);

    S.sfx = ctx.createGain(); S.sfx.gain.value = 0.85; S.sfx.connect(S.master);
    S.musicGain = ctx.createGain(); S.musicGain.gain.value = 0.34; S.musicGain.connect(S.master);

    /* общий буфер белого шума — основа для взрывов, выстрелов и барабанов */
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    S._noise = buf;

    buildChainsaw();
    S.ready = true;
  };

  S.resume = function () { if (S.ctx && S.ctx.state === 'suspended') S.ctx.resume(); };
  S.setMuted = function (m) {
    S.muted = m;
    if (S.master) S.master.gain.setTargetAtTime(m ? 0 : 0.9, S.ctx.currentTime, 0.02);
  };
  S.toggleMute = function () { S.setMuted(!S.muted); return S.muted; };

  function now() { return S.ctx.currentTime; }
  function noiseSrc() { const n = S.ctx.createBufferSource(); n.buffer = S._noise; n.loop = true; return n; }

  /* ------------------------------- бензопила -------------------------------- */
  function buildChainsaw() {
    const ctx = S.ctx;
    const g = ctx.createGain(); g.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 6;
    g.connect(lp); lp.connect(S.sfx);

    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 74;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 76.5;
    const og = ctx.createGain(); og.gain.value = 0.5;
    o1.connect(og); o2.connect(og); og.connect(g);

    /* «зубья»: шум через полосовой фильтр */
    const n = noiseSrc();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 1.2;
    const ng = ctx.createGain(); ng.gain.value = 0.25;
    n.connect(bp); bp.connect(ng); ng.connect(g);

    /* лёгкое дрожание оборотов */
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 11;
    const lfoG = ctx.createGain(); lfoG.gain.value = 7;
    lfo.connect(lfoG); lfoG.connect(o1.frequency); lfoG.connect(o2.frequency);

    o1.start(); o2.start(); n.start(); lfo.start();
    S._saw = { g, o1, o2, lp, idle: 0 };
  }

  /* уровень 0 — тишина, 0.3 — холостой ход, 1 — распил */
  S.sawLevel = function (level) {
    if (!S.ready) return;
    const s = S._saw, t = now();
    const gain = 0.02 + level * 0.16;
    s.g.gain.setTargetAtTime(level <= 0 ? 0 : gain, t, 0.05);
    const f = 66 + level * 62;
    s.o1.frequency.setTargetAtTime(f, t, 0.05);
    s.o2.frequency.setTargetAtTime(f * 1.03, t, 0.05);
    s.lp.frequency.setTargetAtTime(900 + level * 2600, t, 0.05);
  };

  /* -------------------------- одноразовые эффекты --------------------------- */
  function burst(opt) {
    if (!S.ready) return;
    const ctx = S.ctx, t = now();
    const n = ctx.createBufferSource(); n.buffer = S._noise;
    n.playbackRate.value = opt.rate || 1;
    const f = ctx.createBiquadFilter();
    f.type = opt.filter || 'lowpass';
    f.frequency.setValueAtTime(opt.f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, opt.f1), t + opt.dur);
    f.Q.value = opt.q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(opt.vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + opt.dur);
    n.connect(f); f.connect(g); g.connect(S.sfx);
    n.start(t); n.stop(t + opt.dur + 0.02);
  }

  function tone(opt) {
    if (!S.ready) return;
    const ctx = S.ctx, t = now() + (opt.delay || 0);
    const o = ctx.createOscillator(); o.type = opt.type || 'sine';
    o.frequency.setValueAtTime(opt.f0, t);
    if (opt.f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, opt.f1), t + opt.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opt.vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + opt.dur);
    o.connect(g); g.connect(opt.dest || S.sfx);
    o.start(t); o.stop(t + opt.dur + 0.02);
  }

  S.shot = function () {
    burst({ f0: 5200, f1: 220, dur: 0.16, vol: 0.5, q: 1.4 });
    tone({ type: 'square', f0: 180, f1: 50, dur: 0.12, vol: 0.28 });
  };
  S.shotgun = function () {
    burst({ f0: 3200, f1: 120, dur: 0.32, vol: 0.6, q: 1.1 });
    tone({ type: 'sawtooth', f0: 120, f1: 38, dur: 0.26, vol: 0.3 });
  };
  S.copShot = function () { burst({ f0: 4200, f1: 400, dur: 0.12, vol: 0.28, q: 1.2 }); };

  S.explode = function () {
    burst({ f0: 1800, f1: 60, dur: 1.1, vol: 0.85, q: 0.9 });
    burst({ f0: 400, f1: 40, dur: 1.6, vol: 0.5, rate: 0.4 });
    tone({ type: 'sine', f0: 110, f1: 26, dur: 1.2, vol: 0.5 });
    tone({ type: 'square', f0: 60, f1: 20, dur: 0.7, vol: 0.25, delay: 0.04 });
  };

  /* крик — «голосовой» формант с резким падением тона */
  S.scream = function (kind) {
    if (!S.ready) return;
    const ctx = S.ctx, t = now();
    const base = kind === 'low' ? U.rand(150, 190) : U.rand(320, 460);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * 1.25, t);
    o.frequency.exponentialRampToValueAtTime(base * 0.45, t + 0.45);
    const vib = ctx.createOscillator(); vib.type = 'sine'; vib.frequency.value = U.rand(14, 22);
    const vg = ctx.createGain(); vg.gain.value = base * 0.14;
    vib.connect(vg); vg.connect(o.frequency);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = U.rand(900, 1500); f.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(f); f.connect(g); g.connect(S.sfx);
    o.start(t); vib.start(t); o.stop(t + 0.55); vib.stop(t + 0.55);
  };

  S.gore = function () {
    burst({ f0: 900, f1: 120, dur: 0.22, vol: 0.45, filter: 'lowpass', q: 2 });
    tone({ type: 'triangle', f0: 320, f1: 70, dur: 0.14, vol: 0.16 });
  };
  S.bark = function () {
    tone({ type: 'sawtooth', f0: 420, f1: 160, dur: 0.12, vol: 0.22 });
    tone({ type: 'square', f0: 300, f1: 120, dur: 0.1, vol: 0.14, delay: 0.11 });
  };
  S.hurt = function () {
    burst({ f0: 1200, f1: 200, dur: 0.2, vol: 0.3 });
    tone({ type: 'triangle', f0: 220, f1: 90, dur: 0.22, vol: 0.22 });
  };
  S.jump = function () { tone({ type: 'square', f0: 260, f1: 520, dur: 0.09, vol: 0.1 }); };
  S.slide = function () { burst({ f0: 2600, f1: 700, dur: 0.3, vol: 0.18, filter: 'bandpass', q: 0.8 }); };
  S.pickup = function () {
    tone({ type: 'square', f0: 660, dur: 0.07, vol: 0.16 });
    tone({ type: 'square', f0: 990, dur: 0.1, vol: 0.16, delay: 0.07 });
  };
  S.plant = function () {
    tone({ type: 'square', f0: 520, dur: 0.06, vol: 0.14 });
    tone({ type: 'square', f0: 400, dur: 0.09, vol: 0.14, delay: 0.08 });
  };
  S.beep = function () { tone({ type: 'square', f0: 1200, dur: 0.05, vol: 0.12 }); };
  S.empty = function () { tone({ type: 'square', f0: 150, dur: 0.05, vol: 0.1 }); };
  S.combo = function (step) {
    const f = 440 * Math.pow(1.0595, Math.min(step, 14) * 2);
    tone({ type: 'square', f0: f, dur: 0.08, vol: 0.12 });
  };
  S.win = function () {
    [523, 659, 784, 1046].forEach((f, i) =>
      tone({ type: 'square', f0: f, dur: 0.3, vol: 0.16, delay: i * 0.13 }));
  };
  S.lose = function () {
    [392, 330, 262, 196].forEach((f, i) =>
      tone({ type: 'sawtooth', f0: f, f1: f * 0.85, dur: 0.45, vol: 0.18, delay: i * 0.18 }));
  };

  /* ------------------------ synthwave-секвенсор ---------------------------- */
  /* Лукахед-планировщик: раз в кадр докладывает ноты на 150 мс вперёд. */
  const SCALES = [
    { root: 55.00, prog: [0, 0, -2, 3], name: 'Am' },   // уровень 1
    { root: 58.27, prog: [0, 5, 3, -2], name: 'Bbm' },  // уровень 2
    { root: 51.91, prog: [0, -4, 2, 5], name: 'Abm' }   // уровень 3
  ];
  const ARP = [0, 7, 12, 7, 15, 12, 7, 3];

  const M = S.music = {
    on: false, step: 0, nextTime: 0, bpm: 128, scale: 0, intensity: 1
  };

  S.startMusic = function (levelIndex) {
    if (!S.ready) return;
    M.scale = (levelIndex || 0) % SCALES.length;
    M.bpm = 124 + (levelIndex || 0) * 6;
    M.step = 0;
    M.nextTime = now() + 0.06;
    M.on = true;
  };
  S.stopMusic = function () { M.on = false; };
  S.setIntensity = function (v) { M.intensity = U.clamp(v, 0, 1.6); };

  S.update = function () {
    if (!S.ready || !M.on) return;
    const spb = 60 / M.bpm / 4;                 // шестнадцатая
    const horizon = now() + 0.15;
    let guard = 0;
    while (M.nextTime < horizon && guard++ < 64) {
      scheduleStep(M.step, M.nextTime, spb);
      M.step++;
      M.nextTime += spb;
    }
  };

  function scheduleStep(step, t, spb) {
    const sc = SCALES[M.scale];
    const bar = Math.floor(step / 16) % sc.prog.length;
    const semi = sc.prog[bar];
    const root = sc.root * Math.pow(2, semi / 12);
    const s16 = step % 16;
    const dest = S.musicGain;
    const I = M.intensity;

    /* бас — восьмыми, характерный «пульс» */
    if (s16 % 2 === 0) {
      tone({ type: 'sawtooth', f0: root, f1: root * 0.99, dur: spb * 1.7, vol: 0.22, dest, delay: t - now() });
    }
    /* арпеджио-лид */
    if (I > 0.25 && s16 % 2 === 1) {
      const n = ARP[(step >> 1) % ARP.length];
      tone({ type: 'square', f0: root * 4 * Math.pow(2, n / 12), dur: spb * 1.4, vol: 0.07 * I, dest, delay: t - now() });
    }
    /* аккордовый пэд в начале такта */
    if (s16 === 0) {
      [0, 3, 7].forEach((n) =>
        tone({ type: 'triangle', f0: root * 2 * Math.pow(2, n / 12), dur: spb * 14, vol: 0.05, dest, delay: t - now() }));
    }
    /* драм-машина */
    if (s16 === 0 || s16 === 6 || s16 === 10) drum('kick', t, dest);
    if (s16 === 4 || s16 === 12) drum('snare', t, dest);
    if (I > 0.5 && s16 % 2 === 0) drum('hat', t, dest);
  }

  function drum(kind, t, dest) {
    const ctx = S.ctx, d = t - now();
    if (kind === 'kick') {
      tone({ type: 'sine', f0: 130, f1: 38, dur: 0.17, vol: 0.4, dest, delay: d });
      return;
    }
    const n = ctx.createBufferSource(); n.buffer = S._noise;
    n.playbackRate.value = kind === 'hat' ? 1.8 : 1;
    const f = ctx.createBiquadFilter();
    f.type = kind === 'hat' ? 'highpass' : 'bandpass';
    f.frequency.value = kind === 'hat' ? 7200 : 1700;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    const dur = kind === 'hat' ? 0.04 : 0.16;
    g.gain.setValueAtTime(kind === 'hat' ? 0.07 : 0.24, t);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    n.connect(f); f.connect(g); g.connect(dest);
    n.start(t); n.stop(t + dur + 0.02);
  }
})();

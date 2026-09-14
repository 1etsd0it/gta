/* ============================================================================
   audio.js — everything is synthesised with the Web Audio API: the chainsaw
   idle/rev loop, gunfire, impacts, screams, explosions, sirens, and a dark
   synthwave/industrial score with layers that respond to the action.
   The context is created on the first user gesture, per autoplay policy.
   ========================================================================== */
(function () {
  'use strict';
  const CR = window.CR, M = CR.M;

  CR.Audio = class Audio {
    constructor() {
      this.ready = false;
      this.master = null;
      this.volume = .8;
      this.musicVolume = .55;
      this.muted = false;
      this.music = { on: false, step: 0, next: 0, bpm: 104, intensity: .4, section: 'calm' };
    }

    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = this.ctx = new AC();

      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      /* a gentle limiter keeps explosions from clipping the mix */
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12; comp.knee.value = 20; comp.ratio.value = 8;
      comp.attack.value = .003; comp.release.value = .25;
      this.master.connect(comp); comp.connect(ctx.destination);

      this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 1; this.sfxBus.connect(this.master);
      this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.musicVolume; this.musicBus.connect(this.master);

      /* shared noise buffer */
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;

      /* a short convolution reverb gives the street some size */
      const rlen = ctx.sampleRate * 1.1;
      const imp = ctx.createBuffer(2, rlen, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = imp.getChannelData(ch);
        for (let i = 0; i < rlen; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / rlen, 2.6);
        }
      }
      this.verb = ctx.createConvolver();
      this.verb.buffer = imp;
      this.verbGain = ctx.createGain(); this.verbGain.gain.value = .22;
      this.verb.connect(this.verbGain); this.verbGain.connect(this.master);

      this.buildChainsaw();
      this.ready = true;
    }

    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
    now() { return this.ctx.currentTime; }

    setVolume(v) {
      this.volume = v;
      if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.now(), .02);
    }
    setMusicVolume(v) {
      this.musicVolume = v;
      if (this.musicBus) this.musicBus.gain.setTargetAtTime(v, this.now(), .05);
    }
    toggleMute() {
      this.muted = !this.muted;
      if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.now(), .02);
      return this.muted;
    }

    /* ---------------------------- primitives ---------------------------- */
    noiseBurst(o) {
      if (!this.ready) return;
      const ctx = this.ctx, t = this.now() + (o.delay || 0);
      const n = ctx.createBufferSource(); n.buffer = this.noise;
      n.playbackRate.value = o.rate || 1;
      const f = ctx.createBiquadFilter();
      f.type = o.filter || 'lowpass';
      f.frequency.setValueAtTime(o.f0, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(40, o.f1 || o.f0), t + o.dur);
      f.Q.value = o.q || 1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(o.vol, t);
      g.gain.exponentialRampToValueAtTime(.0008, t + o.dur);
      n.connect(f); f.connect(g); g.connect(o.dest || this.sfxBus);
      if (o.verb) g.connect(this.verb);
      n.start(t); n.stop(t + o.dur + .05);
    }

    tone(o) {
      if (!this.ready) return;
      const ctx = this.ctx, t = this.now() + (o.delay || 0);
      const osc = ctx.createOscillator();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.f0, t);
      if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(16, o.f1), t + o.dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(o.vol, t + (o.attack || .006));
      g.gain.exponentialRampToValueAtTime(.0008, t + o.dur);
      osc.connect(g); g.connect(o.dest || this.sfxBus);
      if (o.verb) g.connect(this.verb);
      osc.start(t); osc.stop(t + o.dur + .05);
    }

    /* ---------------------------- the chainsaw -------------------------- */
    buildChainsaw() {
      const ctx = this.ctx;
      const out = ctx.createGain(); out.gain.value = 0;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200; lp.Q.value = 7;
      out.connect(lp); lp.connect(this.sfxBus);
      lp.connect(this.verb);

      const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 62;
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 63.5;
      const o3 = ctx.createOscillator(); o3.type = 'sawtooth'; o3.frequency.value = 124;
      const og = ctx.createGain(); og.gain.value = .42;
      o1.connect(og); o2.connect(og); o3.connect(og); og.connect(out);

      /* chain rattle */
      const n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 1.1;
      const ng = ctx.createGain(); ng.gain.value = .3;
      n.connect(bp); bp.connect(ng); ng.connect(out);

      /* idle wobble */
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 9.5;
      const lg = ctx.createGain(); lg.gain.value = 6;
      lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);

      o1.start(); o2.start(); o3.start(); n.start(); lfo.start();
      this.saw = { out, o1, o2, o3, lp, bp, level: 0 };
    }

    /* level 0 = off, .3 = idle, 1 = cutting */
    sawLevel(level, hasFuel) {
      if (!this.ready) return;
      const s = this.saw, t = this.now();
      const lv = level * (hasFuel === false ? .55 : 1);
      s.out.gain.setTargetAtTime(lv <= 0 ? 0 : .035 + lv * .12, t, .06);
      const f = 54 + lv * 96;
      s.o1.frequency.setTargetAtTime(f, t, .05);
      s.o2.frequency.setTargetAtTime(f * 1.02, t, .05);
      s.o3.frequency.setTargetAtTime(f * 2.01, t, .05);
      s.lp.frequency.setTargetAtTime(700 + lv * 3400, t, .05);
      s.bp.frequency.setTargetAtTime(1800 + lv * 2600, t, .05);
    }

    sawRev() {
      if (!this.ready) return;
      const s = this.saw, t = this.now();
      s.o1.frequency.setValueAtTime(190, t);
      s.o1.frequency.exponentialRampToValueAtTime(150, t + .22);
      this.noiseBurst({ f0: 5200, f1: 1800, dur: .18, vol: .18, filter: 'bandpass', q: .9 });
    }

    /* ------------------------------ one-shots --------------------------- */
    play(name) {
      if (!this.ready) return;
      switch (name) {
        case 'pistol':
          this.noiseBurst({ f0: 7000, f1: 380, dur: .17, vol: .55, q: 1.4, verb: true });
          this.tone({ type: 'square', f0: 240, f1: 58, dur: .12, vol: .32 });
          break;
        case 'copShot':
          this.noiseBurst({ f0: 5200, f1: 500, dur: .13, vol: .3, q: 1.2, verb: true });
          break;
        case 'shotgun':
          this.noiseBurst({ f0: 4200, f1: 160, dur: .34, vol: .62, q: 1, verb: true });
          this.tone({ type: 'sawtooth', f0: 150, f1: 42, dur: .3, vol: .34 });
          break;
        case 'dryfire':
          this.noiseBurst({ f0: 2600, f1: 900, dur: .05, vol: .18, filter: 'bandpass' });
          break;
        case 'sawHit':
          this.noiseBurst({ f0: 2400, f1: 320, dur: .26, vol: .42, filter: 'bandpass', q: .8, verb: true });
          this.tone({ type: 'sawtooth', f0: 320, f1: 90, dur: .2, vol: .22 });
          break;
        case 'sawArmor':
          this.noiseBurst({ f0: 6400, f1: 2200, dur: .3, vol: .34, filter: 'bandpass', q: 1.6 });
          this.tone({ type: 'square', f0: 1400, f1: 700, dur: .12, vol: .1 });
          break;
        case 'hitFlesh':
          this.noiseBurst({ f0: 1100, f1: 220, dur: .16, vol: .3, q: 1.4 });
          break;
        case 'hitArmor':
          this.noiseBurst({ f0: 3800, f1: 1200, dur: .13, vol: .22, filter: 'bandpass', q: 2 });
          break;
        case 'gore':
          this.noiseBurst({ f0: 900, f1: 120, dur: .32, vol: .5, q: 2, verb: true });
          this.tone({ type: 'triangle', f0: 260, f1: 60, dur: .24, vol: .2 });
          break;
        case 'thud':
          this.tone({ type: 'sine', f0: 120, f1: 40, dur: .22, vol: .4 });
          this.noiseBurst({ f0: 900, f1: 200, dur: .16, vol: .22 });
          break;
        case 'jump':
          this.noiseBurst({ f0: 2400, f1: 800, dur: .11, vol: .12, filter: 'bandpass' });
          break;
        case 'land':
          this.tone({ type: 'sine', f0: 90, f1: 40, dur: .16, vol: .26 });
          this.noiseBurst({ f0: 1600, f1: 400, dur: .14, vol: .16 });
          break;
        case 'slide':
          this.noiseBurst({ f0: 3400, f1: 700, dur: .45, vol: .2, filter: 'bandpass', q: .7 });
          break;
        case 'pickup':
          this.tone({ type: 'square', f0: 740, dur: .07, vol: .14 });
          this.tone({ type: 'square', f0: 1180, dur: .11, vol: .13, delay: .06 });
          break;
        case 'plant':
          this.tone({ type: 'square', f0: 520, dur: .07, vol: .16 });
          this.tone({ type: 'square', f0: 380, dur: .1, vol: .14, delay: .08 });
          break;
        case 'beep':
          this.tone({ type: 'square', f0: 1500, dur: .05, vol: .16 });
          break;
        case 'dog':
          this.tone({ type: 'sawtooth', f0: 420, f1: 170, dur: .12, vol: .26, verb: true });
          this.tone({ type: 'square', f0: 300, f1: 130, dur: .1, vol: .16, delay: .12 });
          break;
        case 'dogBite':
          this.noiseBurst({ f0: 1800, f1: 300, dur: .14, vol: .34, q: 1.5 });
          this.tone({ type: 'sawtooth', f0: 300, f1: 120, dur: .16, vol: .2 });
          break;
        case 'playerHurt':
          this.noiseBurst({ f0: 1400, f1: 240, dur: .22, vol: .34 });
          this.tone({ type: 'triangle', f0: 190, f1: 74, dur: .3, vol: .24 });
          break;
        case 'death':
          this.tone({ type: 'sawtooth', f0: 220, f1: 40, dur: 1.4, vol: .3, verb: true });
          this.noiseBurst({ f0: 1400, f1: 90, dur: 1.2, vol: .3, verb: true });
          break;
        case 'carAlarm':
          for (let i = 0; i < 6; i++) {
            this.tone({ type: 'square', f0: i % 2 ? 880 : 1180, dur: .13, vol: .12, delay: i * .18 });
          }
          break;
        case 'bossGrunt':
          this.tone({ type: 'sawtooth', f0: 130, f1: 80, dur: .3, vol: .22, verb: true });
          break;
        case 'bossSwing':
          this.noiseBurst({ f0: 1800, f1: 400, dur: .28, vol: .3, filter: 'bandpass', q: .6 });
          break;
        case 'bossCharge':
          this.tone({ type: 'sawtooth', f0: 70, f1: 160, dur: .8, vol: .3, verb: true });
          break;
        case 'bossDeath':
          this.tone({ type: 'sawtooth', f0: 180, f1: 30, dur: 1.8, vol: .34, verb: true });
          this.noiseBurst({ f0: 2200, f1: 60, dur: 1.6, vol: .34, verb: true });
          break;
        case 'glass':
          this.noiseBurst({ f0: 9000, f1: 3000, dur: .5, vol: .26, filter: 'highpass', q: .8, verb: true });
          break;
        case 'uiMove':
          this.tone({ type: 'square', f0: 620, dur: .04, vol: .06 });
          break;
        case 'uiSelect':
          this.tone({ type: 'square', f0: 880, dur: .07, vol: .1 });
          this.tone({ type: 'square', f0: 1320, dur: .09, vol: .08, delay: .05 });
          break;
        case 'levelComplete':
          [262, 330, 392, 523, 659].forEach((f, i) =>
            this.tone({ type: 'triangle', f0: f, dur: .5, vol: .16, delay: i * .16, verb: true }));
          break;
      }
    }

    /* voices: filtered saw with a pitch fall — reads as a human yell */
    scream(voice, vol) {
      if (!this.ready) return;
      const ctx = this.ctx, t = this.now();
      const base = voice === 'female' ? M.rand(430, 560)
        : voice === 'old' ? M.rand(220, 300)
        : voice === 'dog' ? M.rand(300, 420)
        : voice === 'boss' ? M.rand(120, 165)
        : M.rand(240, 340);
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(base * 1.3, t);
      osc.frequency.exponentialRampToValueAtTime(base * .45, t + .5);
      const vib = ctx.createOscillator(); vib.type = 'sine'; vib.frequency.value = M.rand(12, 22);
      const vg = ctx.createGain(); vg.gain.value = base * .12;
      vib.connect(vg); vg.connect(osc.frequency);
      const form = ctx.createBiquadFilter();
      form.type = 'bandpass'; form.frequency.value = M.rand(800, 1500); form.Q.value = 3.5;
      const g = ctx.createGain();
      const peak = (vol || .28);
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + .04);
      g.gain.exponentialRampToValueAtTime(.001, t + .55);
      osc.connect(form); form.connect(g); g.connect(this.sfxBus); g.connect(this.verb);
      osc.start(t); vib.start(t); osc.stop(t + .6); vib.stop(t + .6);
    }

    explosion(power) {
      if (!this.ready) return;
      power = power || 1;
      this.noiseBurst({ f0: 2200, f1: 60, dur: 1.3 * power, vol: .8, q: .9, verb: true });
      this.noiseBurst({ f0: 500, f1: 40, dur: 2 * power, vol: .55, rate: .35, verb: true });
      this.tone({ type: 'sine', f0: 120 * power, f1: 24, dur: 1.4 * power, vol: .55 });
      this.tone({ type: 'square', f0: 70, f1: 20, dur: .8, vol: .26, delay: .03 });
      this.play('glass');
    }

    siren() {
      if (!this.ready) return;
      const ctx = this.ctx, t = this.now();
      for (let k = 0; k < 6; k++) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        const t0 = t + k * .62;
        osc.frequency.setValueAtTime(660, t0);
        osc.frequency.linearRampToValueAtTime(1080, t0 + .3);
        osc.frequency.linearRampToValueAtTime(660, t0 + .6);
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 2;
        const g = ctx.createGain();
        g.gain.setValueAtTime(.0001, t0);
        g.gain.exponentialRampToValueAtTime(.09, t0 + .06);
        g.gain.exponentialRampToValueAtTime(.0008, t0 + .6);
        osc.connect(f); f.connect(g); g.connect(this.sfxBus); g.connect(this.verb);
        osc.start(t0); osc.stop(t0 + .64);
      }
    }

    /* ------------------------------- music ------------------------------ */
    startMusic(section) {
      if (!this.ready) return;
      this.music.on = true;
      this.music.section = section || 'calm';
      this.music.step = 0;
      this.music.next = this.now() + .1;
    }
    stopMusic() { this.music.on = false; }
    setSection(section) { this.music.section = section; }
    setIntensity(v) { this.music.intensity = M.clamp(v, 0, 1); }
    duckMusic(to, time) {
      if (!this.ready) return;
      this.musicBus.gain.setTargetAtTime(this.musicVolume * to, this.now(), time || .4);
    }

    update() {
      if (!this.ready || !this.music.on) return;
      const m = this.music;
      const spb = 60 / m.bpm / 4;
      const horizon = this.now() + .18;
      let guard = 0;
      while (m.next < horizon && guard++ < 48) {
        this.step(m.step, m.next, spb);
        m.step++;
        m.next += spb;
      }
    }

    /* A minor industrial pattern: octave bass pulse, detuned pad, gated arp,
       kick/snare/hat. `section` swaps the harmony and how hard it pushes. */
    step(step, t, spb) {
      const m = this.music;
      const dest = this.musicBus;
      const delay = t - this.now();
      const s16 = step % 16;
      const bar = Math.floor(step / 16);
      const hot = m.section === 'combat' || m.section === 'boss';
      const roots = m.section === 'boss' ? [55.0, 51.9, 58.3, 49.0] : [55.0, 55.0, 61.7, 49.0];
      const root = roots[bar % roots.length];
      const I = m.intensity;

      if (s16 % 2 === 0) {
        this.tone({ type: 'sawtooth', f0: root, f1: root * .995, dur: spb * 1.8, vol: .22, dest, delay });
        if (hot) this.tone({ type: 'square', f0: root * 2, dur: spb * .8, vol: .06, dest, delay });
      }
      if (s16 === 0) {
        [0, 7, 12].forEach((n, i) =>
          this.tone({ type: 'triangle', f0: root * 2 * Math.pow(2, n / 12), dur: spb * 15, vol: .045, dest, delay: delay + i * .01 }));
      }
      if (I > .3 && s16 % 2 === 1) {
        const arp = [0, 7, 12, 15, 12, 7, 3, 10];
        const n = arp[(step >> 1) % arp.length];
        this.tone({ type: 'square', f0: root * 4 * Math.pow(2, n / 12), dur: spb * 1.2, vol: .035 * I, dest, delay });
      }
      /* drums */
      if (s16 === 0 || s16 === 6 || (hot && s16 === 10)) {
        this.tone({ type: 'sine', f0: 145, f1: 40, dur: .18, vol: .42, dest, delay });
      }
      if (s16 === 4 || s16 === 12) {
        this.noiseBurst({ f0: 2400, f1: 900, dur: .16, vol: .2 * (hot ? 1.3 : 1), filter: 'bandpass', q: .7, dest, delay });
      }
      if (I > .45 && s16 % 2 === 0) {
        this.noiseBurst({ f0: 9000, f1: 6000, dur: .04, vol: .05, filter: 'highpass', dest, delay });
      }
      /* industrial clank on the off-beat when things are hot */
      if (hot && s16 === 14) {
        this.noiseBurst({ f0: 3000, f1: 800, dur: .3, vol: .12, filter: 'bandpass', q: 3, dest, delay, verb: true });
      }
    }
  };
})();

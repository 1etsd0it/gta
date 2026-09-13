/* =============================================================================
 *  fx.js — частицы и комиксовые эффекты: мясные ошмётки, кровь, обломки,
 *  дым, ударные волны, кровавые лужи на асфальте и надписи «SPLAT!»/«BOOM!».
 *  Всё на пулах фиксированного размера — в игровом цикле ноль аллокаций.
 * ========================================================================== */
(function () {
  'use strict';
  const CR = window.CR, U = CR.Utils;

  const MAX_P = 600, MAX_POP = 28, MAX_DECAL = 140;

  const FX = CR.FX = {
    parts: [], pops: [], decals: [], decalHead: 0
  };

  for (let i = 0; i < MAX_P; i++) {
    FX.parts.push({ live: false, x: 0, y: 0, vx: 0, vy: 0, w: 0, h: 0, rot: 0, vr: 0, life: 0, max: 1, c: '#fff', kind: 'meat', g: 1, bleed: 0 });
  }
  for (let i = 0; i < MAX_POP; i++) {
    FX.pops.push({ live: false, x: 0, y: 0, vy: 0, text: '', life: 0, max: 1, c: '#fff', size: 30, rot: 0, kind: 'comic' });
  }

  FX.reset = function () {
    FX.parts.forEach((p) => { p.live = false; });
    FX.pops.forEach((p) => { p.live = false; });
    FX.decals.length = 0; FX.decalHead = 0;
  };

  function spawn() {
    for (let i = 0; i < MAX_P; i++) {
      const p = FX.parts[i];
      if (!p.live) return p;
    }
    return FX.parts[(Math.random() * MAX_P) | 0];   /* пул переполнен — вытесняем случайную */
  }

  const BLOOD = ['#c4232a', '#a01824', '#e03a3a', '#7d0f1c'];
  const MEAT = ['#d8434a', '#b02832', '#e86a72', '#f0919a'];

  /* ------------------------------- источники ------------------------------- */
  FX.blood = function (x, y, n, dirX, power) {
    power = power || 1;
    for (let i = 0; i < n; i++) {
      const p = spawn();
      p.live = true; p.kind = 'blood';
      p.x = x; p.y = y;
      const a = U.rand(-Math.PI, 0) + (dirX || 0) * 0.5;
      const sp = U.rand(60, 340) * power;
      p.vx = Math.cos(a) * sp + (dirX || 0) * 90;
      p.vy = Math.sin(a) * sp - 40;
      p.w = U.rand(2, 5); p.h = p.w;
      p.g = 1500; p.rot = 0; p.vr = 0;
      p.max = p.life = U.rand(0.45, 1.1);
      p.c = U.pick(BLOOD); p.bleed = 1;
    }
  };

  FX.gore = function (x, y, n, dirX) {
    for (let i = 0; i < n; i++) {
      const p = spawn();
      p.live = true; p.kind = 'meat';
      p.x = x + U.rand(-8, 8); p.y = y + U.rand(-16, 8);
      const a = U.rand(-2.6, -0.5);
      const sp = U.rand(140, 420);
      p.vx = Math.cos(a) * sp + (dirX || 0) * 140;
      p.vy = Math.sin(a) * sp;
      p.w = U.rand(6, 14); p.h = p.w * U.rand(0.6, 1.1);
      p.g = 1400; p.rot = U.rand(0, 6.3); p.vr = U.rand(-14, 14);
      p.max = p.life = U.rand(0.9, 1.7);
      p.c = U.pick(MEAT); p.bleed = 1;
    }
    FX.blood(x, y, Math.ceil(n * 1.3), dirX, 1.2);
  };

  FX.debris = function (x, y, n, colors, power) {
    power = power || 1;
    for (let i = 0; i < n; i++) {
      const p = spawn();
      p.live = true; p.kind = 'debris';
      p.x = x + U.rand(-30, 30); p.y = y + U.rand(-40, 10);
      const a = U.rand(-Math.PI * 0.95, -0.15);
      const sp = U.rand(150, 620) * power;
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      p.w = U.rand(5, 17); p.h = U.rand(5, 17);
      p.g = 1250; p.rot = U.rand(0, 6.3); p.vr = U.rand(-10, 10);
      p.max = p.life = U.rand(1.1, 2.2);
      p.c = U.pick(colors || ['#b5865a', '#8c6238', '#d9cbb2', '#6e747e']);
      p.bleed = 0;
    }
  };

  FX.smoke = function (x, y, n, scale, color) {
    for (let i = 0; i < n; i++) {
      const p = spawn();
      p.live = true; p.kind = 'smoke';
      p.x = x + U.rand(-24, 24) * (scale || 1);
      p.y = y + U.rand(-24, 14) * (scale || 1);
      p.vx = U.rand(-60, 60); p.vy = U.rand(-120, -30);
      p.w = p.h = U.rand(18, 44) * (scale || 1);
      p.g = -40; p.rot = U.rand(0, 6.3); p.vr = U.rand(-1.5, 1.5);
      p.max = p.life = U.rand(0.8, 1.8);
      p.c = color || (U.chance(0.5) ? '#4a4a52' : '#2f2f38');
      p.bleed = 0;
    }
  };

  FX.sparks = function (x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const p = spawn();
      p.live = true; p.kind = 'spark';
      p.x = x; p.y = y;
      const a = U.rand(0, 6.3), sp = U.rand(90, 420);
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      p.w = U.rand(2, 5); p.h = p.w;
      p.g = 700; p.rot = 0; p.vr = 0;
      p.max = p.life = U.rand(0.15, 0.45);
      p.c = color || U.pick(['#ffe9a0', '#ffb03a', '#fff6d0']);
      p.bleed = 0;
    }
  };

  FX.shock = function (x, y, r, color) {
    const p = spawn();
    p.live = true; p.kind = 'ring';
    p.x = x; p.y = y; p.vx = p.vy = 0; p.g = 0;
    p.w = p.h = r; p.max = p.life = 0.45;
    p.c = color || '#ffd166';
  };

  FX.fireball = function (x, y, scale) {
    scale = scale || 1;
    for (let i = 0; i < 16 * scale; i++) {
      const p = spawn();
      p.live = true; p.kind = 'fire';
      p.x = x + U.rand(-20, 20) * scale; p.y = y + U.rand(-20, 20) * scale;
      const a = U.rand(0, 6.3), sp = U.rand(40, 260) * scale;
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - 70;
      p.w = p.h = U.rand(24, 60) * scale;
      p.g = -120; p.rot = U.rand(0, 6.3); p.vr = U.rand(-3, 3);
      p.max = p.life = U.rand(0.3, 0.7);
      p.c = U.pick(['#ffd166', '#ff8a2b', '#ff4d1f', '#fff3b0']);
      p.bleed = 0;
    }
    FX.smoke(x, y, 10 * scale, scale);
    FX.shock(x, y, 40 * scale, '#ffd166');
  };

  /* --------------------------- комиксовые надписи --------------------------- */
  FX.pop = function (x, y, text, color, size, kind) {
    let slot = null;
    for (let i = 0; i < MAX_POP; i++) if (!FX.pops[i].live) { slot = FX.pops[i]; break; }
    if (!slot) slot = FX.pops[0];
    slot.live = true;
    slot.x = x; slot.y = y; slot.text = text;
    slot.c = color || '#ffe14c';
    slot.size = size || 30;
    slot.vy = kind === 'score' ? -64 : -38;
    slot.max = slot.life = kind === 'score' ? 0.85 : 1.0;
    slot.rot = kind === 'score' ? 0 : U.rand(-0.22, 0.22);
    slot.kind = kind || 'comic';
  };

  const KILL_WORDS = ['SPLAT!', 'SHRED!', 'SQUISH!', 'CHOP!', 'GRIND!', 'SLICE!', 'YUCK!'];
  const SHOT_WORDS = ['BANG!', 'POW!', 'BLAM!', 'ZAP!'];
  FX.killWord = function (x, y) { FX.pop(x, y, U.pick(KILL_WORDS), '#ff4d5e', 34); };
  FX.shotWord = function (x, y) { FX.pop(x, y, U.pick(SHOT_WORDS), '#ffd166', 28); };
  FX.boomWord = function (x, y) { FX.pop(x, y, 'BOOM!', '#ff8a2b', 58); };
  FX.score = function (x, y, amount, color) { FX.pop(x, y, '+' + amount, color || '#9dff6e', 22, 'score'); };

  /* -------------------------------- лужи ----------------------------------- */
  FX.decal = function (x, y, size, color) {
    const d = { x, y, w: size, h: size * U.rand(0.22, 0.34), c: color || U.pick(BLOOD), a: U.rand(0.55, 0.85) };
    if (FX.decals.length < MAX_DECAL) FX.decals.push(d);
    else { FX.decals[FX.decalHead] = d; FX.decalHead = (FX.decalHead + 1) % MAX_DECAL; }
  };

  /* ------------------------------- обновление ------------------------------- */
  FX.update = function (dt, groundY) {
    const parts = FX.parts;
    for (let i = 0; i < MAX_P; i++) {
      const p = parts[i];
      if (!p.live) continue;
      p.life -= dt;
      if (p.life <= 0) { p.live = false; continue; }
      if (p.kind === 'ring') continue;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.kind === 'smoke' || p.kind === 'fire') { p.vx *= 1 - 1.4 * dt; continue; }
      if (p.y >= groundY) {                       /* удар о землю */
        p.y = groundY;
        if (p.bleed) { FX.decal(p.x, groundY, p.w * U.rand(2.2, 4), p.c); p.bleed = 0; }
        p.vy *= -0.32; p.vx *= 0.6; p.vr *= 0.5;
        if (Math.abs(p.vy) < 40) { p.vy = 0; p.vx *= 0.8; p.life = Math.min(p.life, 0.4); }
      }
    }
    for (let i = 0; i < MAX_POP; i++) {
      const p = FX.pops[i];
      if (!p.live) continue;
      p.life -= dt;
      if (p.life <= 0) { p.live = false; continue; }
      p.y += p.vy * dt;
      p.vy *= 1 - 1.8 * dt;
    }
  };

  /* ------------------------------- отрисовка -------------------------------- */
  FX.drawDecals = function (g, camX) {
    for (let i = 0; i < FX.decals.length; i++) {
      const d = FX.decals[i];
      const sx = d.x - camX;
      if (sx < -80 || sx > CR.W + 80) continue;
      g.globalAlpha = d.a;
      g.fillStyle = d.c;
      g.beginPath();
      g.ellipse(sx, d.y, d.w / 2, d.h / 2, 0, 0, 6.3);
      g.fill();
    }
    g.globalAlpha = 1;
  };

  FX.draw = function (g, camX) {
    const parts = FX.parts;
    for (let i = 0; i < MAX_P; i++) {
      const p = parts[i];
      if (!p.live) continue;
      const sx = p.x - camX;
      if (sx < -120 || sx > CR.W + 120) continue;
      const k = p.life / p.max;

      if (p.kind === 'ring') {
        g.globalAlpha = k * 0.8;
        g.strokeStyle = p.c;
        g.lineWidth = 3 + 9 * k;
        g.beginPath();
        g.arc(sx, p.y, p.w * (1.6 - k * 1.2), 0, 6.3);
        g.stroke();
        continue;
      }
      if (p.kind === 'smoke') {
        g.globalAlpha = k * 0.5;
        g.fillStyle = p.c;
        const s = p.w * (1.9 - k);
        g.fillRect(sx - s / 2, p.y - s / 2, s, s);
        continue;
      }
      if (p.kind === 'fire') {
        g.globalAlpha = Math.min(1, k * 1.5);
        g.fillStyle = p.c;
        const s = p.w * (0.5 + k * 0.9);
        g.fillRect(sx - s / 2, p.y - s / 2, s, s);
        continue;
      }
      g.globalAlpha = p.kind === 'spark' ? Math.min(1, k * 2) : 1;
      g.save();
      g.translate(sx, p.y);
      if (p.rot) g.rotate(p.rot);
      g.fillStyle = p.c;
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      if (p.kind === 'meat') {                 /* блик — «мясистость» */
        g.fillStyle = 'rgba(255,255,255,.22)';
        g.fillRect(-p.w / 2, -p.h / 2, p.w * 0.45, p.h * 0.3);
      }
      g.restore();
    }
    g.globalAlpha = 1;
  };

  FX.drawPops = function (g, camX) {
    for (let i = 0; i < MAX_POP; i++) {
      const p = FX.pops[i];
      if (!p.live) continue;
      const sx = p.x - camX;
      if (sx < -160 || sx > CR.W + 160) continue;
      const k = p.life / p.max;
      const pop = k > 0.82 ? (1 - k) / 0.18 : 1;          /* «выпрыгивание» */
      const scale = (0.5 + pop * 0.5) * (p.kind === 'score' ? 1 : 1.05);
      g.save();
      g.globalAlpha = Math.min(1, k * 2.4);
      g.translate(sx, p.y);
      g.rotate(p.rot);
      g.scale(scale, scale);
      g.font = '900 ' + p.size + 'px Impact, "Arial Black", system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = p.size * 0.22;
      g.strokeStyle = '#160c12';
      g.strokeText(p.text, 0, 0);
      g.fillStyle = p.c;
      g.fillText(p.text, 0, 0);
      if (p.kind !== 'score') {
        g.fillStyle = 'rgba(255,255,255,.35)';
        g.fillText(p.text, -1.5, -2.5);
      }
      g.restore();
    }
    g.globalAlpha = 1;
  };
})();

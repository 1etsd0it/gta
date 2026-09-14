/* ============================================================================
   particles.js — pooled particle system + ground decals.
   Two render passes: regular (blood, debris, smoke) and additive (fire, sparks,
   flashes). Soft particles use pre-rendered radial sprites, so there are no
   gradient allocations inside the frame loop.
   ========================================================================== */
(function () {
  'use strict';
  const CR = window.CR, M = CR.M;

  /* ---------------------------- soft sprites ------------------------------ */
  function softSprite(size, stops) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach((s) => grd.addColorStop(s[0], s[1]));
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    return c;
  }

  const SPR = {};
  function buildSprites() {
    SPR.smoke = softSprite(128, [[0, 'rgba(150,150,155,.85)'], [.45, 'rgba(90,90,96,.42)'], [1, 'rgba(60,60,66,0)']]);
    SPR.dust = softSprite(128, [[0, 'rgba(214,203,184,.75)'], [.5, 'rgba(180,168,150,.3)'], [1, 'rgba(160,150,135,0)']]);
    SPR.fire = softSprite(128, [[0, 'rgba(255,247,214,1)'], [.25, 'rgba(255,183,74,.9)'], [.6, 'rgba(226,83,20,.45)'], [1, 'rgba(120,30,10,0)']]);
    SPR.flash = softSprite(256, [[0, 'rgba(255,255,242,1)'], [.22, 'rgba(255,206,130,.75)'], [.55, 'rgba(255,130,40,.25)'], [1, 'rgba(255,90,20,0)']]);
    SPR.mist = softSprite(128, [[0, 'rgba(168,22,26,.6)'], [.5, 'rgba(120,12,18,.3)'], [1, 'rgba(90,8,12,0)']]);
    SPR.glow = softSprite(128, [[0, 'rgba(255,255,255,.9)'], [.4, 'rgba(255,235,190,.4)'], [1, 'rgba(255,220,160,0)']]);
  }

  const BLOOD = ['#8e1218', '#a51c1c', '#6d0c12', '#c22a22'];
  const MEAT = ['#9c2a26', '#b8413a', '#7d1d1d', '#c25a4e'];

  const P = CR.Particles = {
    pool: [], max: 1400, decals: [], maxDecals: 90, decalHead: 0,
    quality: 'high', gore: true, count: 0,

    init(quality) {
      buildSprites();
      this.setQuality(quality || 'high');
      if (!this.pool.length) {
        for (let i = 0; i < this.max; i++) this.pool.push({ live: false });
      }
    },

    setQuality(q) {
      this.quality = q;
      this.density = q === 'high' ? 1 : (q === 'medium' ? 0.6 : 0.32);
      this.maxDecals = q === 'low' ? 30 : (q === 'medium' ? 60 : 90);
    },

    reset() {
      for (let i = 0; i < this.pool.length; i++) this.pool[i].live = false;
      this.decals.length = 0; this.decalHead = 0; this.count = 0;
    },

    _get() {
      const pool = this.pool;
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (!p.live) { p.live = true; this.count++; return p; }
      }
      return null;                                   /* pool full: drop it */
    },

    _n(n) { return Math.max(1, Math.round(n * this.density)); },

    /* ------------------------------ emitters ----------------------------- */
    spawn(cfg) {
      const p = this._get();
      if (!p) return null;
      p.kind = cfg.kind; p.x = cfg.x; p.y = cfg.y;
      p.vx = cfg.vx || 0; p.vy = cfg.vy || 0;
      p.g = cfg.g === undefined ? 2100 : cfg.g;
      p.drag = cfg.drag === undefined ? 0.2 : cfg.drag;
      p.size = cfg.size || 8; p.size2 = cfg.size2 === undefined ? p.size : cfg.size2;
      p.rot = cfg.rot || 0; p.spin = cfg.spin || 0;
      p.life = p.max = cfg.life || 1;
      p.color = cfg.color || '#fff';
      p.alpha = cfg.alpha === undefined ? 1 : cfg.alpha;
      p.add = !!cfg.add;
      p.bleed = !!cfg.bleed;
      p.floor = cfg.floor === undefined ? null : cfg.floor;
      p.bounce = cfg.bounce === undefined ? 0.3 : cfg.bounce;
      p.sprite = cfg.sprite || null;
      p.stretch = cfg.stretch || 0;
      return p;
    },

    blood(x, y, n, dirX, power, floor) {
      if (!this.gore) { this.dust(x, y, Math.ceil(n / 3), 0.5); return; }
      power = power || 1;
      n = this._n(n);
      for (let i = 0; i < n; i++) {
        const a = M.rand(-Math.PI, 0.25) + (dirX || 0) * 0.45;
        const sp = M.rand(120, 620) * power;
        this.spawn({
          kind: 'blood', x: x + M.rand(-6, 6), y: y + M.rand(-8, 8),
          vx: Math.cos(a) * sp + (dirX || 0) * 160, vy: Math.sin(a) * sp - 60,
          size: M.rand(3, 9), life: M.rand(.5, 1.3), color: M.pick(BLOOD),
          bleed: true, floor: floor, stretch: 1.6, drag: 0.1
        });
      }
      /* fine mist that hangs for a moment */
      for (let i = 0; i < this._n(n * 0.4); i++) {
        this.spawn({
          kind: 'soft', sprite: SPR.mist, x: x + M.rand(-20, 20), y: y + M.rand(-24, 14),
          vx: M.rand(-70, 70) + (dirX || 0) * 90, vy: M.rand(-90, 10), g: -30, drag: 1.6,
          size: M.rand(40, 90), size2: M.rand(90, 150), life: M.rand(.35, .7), alpha: .6
        });
      }
    },

    gorePop(x, y, n, dirX, floor) {
      if (!this.gore) { this.dust(x, y, 6, 0.8); return; }
      n = this._n(n);
      for (let i = 0; i < n; i++) {
        const a = M.rand(-2.5, -0.4);
        const sp = M.rand(180, 560);
        this.spawn({
          kind: 'chunk', x: x + M.rand(-14, 14), y: y + M.rand(-26, 14),
          vx: Math.cos(a) * sp + (dirX || 0) * 170, vy: Math.sin(a) * sp,
          size: M.rand(9, 22), life: M.rand(1.1, 2), color: M.pick(MEAT),
          rot: M.rand(0, 6.28), spin: M.rand(-16, 16), bleed: true, floor: floor
        });
      }
      this.blood(x, y, n * 1.2, dirX, 1.25, floor);
    },

    dust(x, y, n, scale, floor) {
      n = this._n(n); scale = scale || 1;
      for (let i = 0; i < n; i++) {
        this.spawn({
          kind: 'soft', sprite: SPR.dust, x: x + M.rand(-26, 26) * scale, y: y + M.rand(-14, 6),
          vx: M.rand(-90, 90) * scale, vy: M.rand(-120, -20) * scale,
          g: -20, drag: 1.3, size: M.rand(30, 70) * scale, size2: M.rand(90, 190) * scale,
          life: M.rand(.5, 1.4), alpha: .5
        });
      }
    },

    smoke(x, y, n, scale, opts) {
      n = this._n(n); scale = scale || 1; opts = opts || {};
      for (let i = 0; i < n; i++) {
        this.spawn({
          kind: 'soft', sprite: SPR.smoke, x: x + M.rand(-40, 40) * scale, y: y + M.rand(-40, 20) * scale,
          vx: M.rand(-60, 60) * scale + (opts.vx || 0), vy: (opts.vy || M.rand(-180, -60)) * scale,
          g: -40, drag: 0.7, size: M.rand(60, 130) * scale, size2: M.rand(220, 420) * scale,
          life: M.rand(1.4, 3.4) * (opts.lifeScale || 1), alpha: opts.alpha === undefined ? .5 : opts.alpha
        });
      }
    },

    fire(x, y, n, scale) {
      n = this._n(n); scale = scale || 1;
      for (let i = 0; i < n; i++) {
        this.spawn({
          kind: 'soft', sprite: SPR.fire, add: true,
          x: x + M.rand(-30, 30) * scale, y: y + M.rand(-30, 30) * scale,
          vx: M.rand(-140, 140) * scale, vy: M.rand(-260, -60) * scale,
          g: -180, drag: 1.1, size: M.rand(60, 150) * scale, size2: M.rand(20, 60) * scale,
          life: M.rand(.3, .8), alpha: 1
        });
      }
    },

    sparks(x, y, n, color, power) {
      n = this._n(n); power = power || 1;
      for (let i = 0; i < n; i++) {
        const a = M.rand(0, 6.283), sp = M.rand(160, 900) * power;
        this.spawn({
          kind: 'spark', add: true, x, y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
          g: 1500, drag: 0.6, size: M.rand(1.6, 3.6), life: M.rand(.16, .5),
          color: color || (M.chance(.5) ? '#ffd79a' : '#fff3d0'), stretch: 3.2, floor: null
        });
      }
    },

    embers(x, y, n) {
      n = this._n(n);
      for (let i = 0; i < n; i++) {
        this.spawn({
          kind: 'spark', add: true, x: x + M.rand(-60, 60), y: y + M.rand(-40, 40),
          vx: M.rand(-50, 50), vy: M.rand(-140, -40), g: -60, drag: 1.1,
          size: M.rand(1.5, 3.4), life: M.rand(.8, 2.2), color: M.pick(['#ff8a2a', '#ffbe5c', '#ff5a20']),
          stretch: 1
        });
      }
    },

    debris(x, y, n, colors, power, floor) {
      n = this._n(n); power = power || 1;
      for (let i = 0; i < n; i++) {
        const a = M.rand(-Math.PI * .95, -0.1), sp = M.rand(200, 900) * power;
        this.spawn({
          kind: 'chunk', x: x + M.rand(-60, 60), y: y + M.rand(-70, 20),
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          size: M.rand(8, 30) * power, life: M.rand(1.4, 3),
          color: M.pick(colors || ['#7a6a58', '#95826c', '#5d5348', '#b9a996']),
          rot: M.rand(0, 6.28), spin: M.rand(-12, 12), floor: floor, bounce: .32
        });
      }
    },

    glass(x, y, n, power, floor) {
      n = this._n(n);
      for (let i = 0; i < n; i++) {
        const a = M.rand(-Math.PI, 0), sp = M.rand(180, 700) * (power || 1);
        this.spawn({
          kind: 'glass', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          size: M.rand(4, 13), life: M.rand(.9, 1.8), rot: M.rand(0, 6.28), spin: M.rand(-14, 14),
          color: 'rgba(198,226,238,.85)', floor: floor, bounce: .25
        });
      }
    },

    shell(x, y, dir) {
      this.spawn({
        kind: 'shell', x, y, vx: -dir * M.rand(120, 260), vy: M.rand(-420, -260),
        size: M.rand(6, 9), life: 1.6, rot: M.rand(0, 6.28), spin: M.rand(-22, 22),
        color: '#d9a441', bounce: .4
      });
    },

    flash(x, y, size, life, color) {
      this.spawn({
        kind: 'soft', sprite: SPR.flash, add: true, x, y, g: 0, drag: 4,
        size: size, size2: size * 1.35, life: life || .12, alpha: 1, color: color
      });
    },

    ring(x, y, r, life, color, width) {
      this.spawn({
        kind: 'ring', add: true, x, y, g: 0, size: r * .2, size2: r,
        life: life || .45, color: color || 'rgba(255,214,160,.9)', alpha: 1, drag: 0,
        stretch: width || 10
      });
    },

    /* chainsaw arc / motion blur streak */
    streak(x, y, angle, len, life, color) {
      this.spawn({
        kind: 'streak', add: true, x, y, g: 0, drag: 0, rot: angle,
        size: len, life: life || .16, color: color || 'rgba(255,240,210,.5)', alpha: 1
      });
    },

    /* ------------------------------- decals ------------------------------ */
    decal(x, y, size, kind, color) {
      if (!this.gore && kind === 'blood') return;
      const d = {
        x, y, size, kind: kind || 'blood',
        color: color || M.pick(BLOOD),
        rot: M.rand(0, 6.28), squish: M.rand(.22, .38), alpha: M.rand(.5, .82),
        seed: (Math.random() * 1000) | 0
      };
      if (this.decals.length < this.maxDecals) this.decals.push(d);
      else { this.decals[this.decalHead] = d; this.decalHead = (this.decalHead + 1) % this.maxDecals; }
    },

    /* ------------------------------- update ------------------------------ */
    update(dt) {
      const pool = this.pool;
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (!p.live) continue;
        p.life -= dt;
        if (p.life <= 0) { p.live = false; this.count--; continue; }

        if (p.kind === 'ring' || p.kind === 'streak') continue;

        p.vy += p.g * dt;
        if (p.drag) { const k = Math.pow(0.0001, p.drag * dt); p.vx *= k; p.vy *= k; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.spin) p.rot += p.spin * dt;

        if (p.floor !== null && p.floor !== undefined && p.y >= p.floor) {
          p.y = p.floor;
          if (p.bleed) {
            this.decal(p.x, p.floor, p.size * M.rand(2.4, 4.4), 'blood', p.color);
            p.bleed = false;
          }
          p.vy *= -p.bounce;
          p.vx *= 0.55;
          p.spin *= 0.5;
          if (Math.abs(p.vy) < 60) { p.vy = 0; p.vx *= 0.7; p.life = Math.min(p.life, 0.45); }
        }
      }
    },

    /* ------------------------------- render ------------------------------ */
    drawDecals(ctx, view) {
      const list = this.decals;
      for (let i = 0; i < list.length; i++) {
        const d = list[i];
        if (d.x < view.left - 200 || d.x > view.right + 200) continue;
        ctx.save();
        ctx.globalAlpha = d.alpha;
        ctx.translate(d.x, d.y);
        ctx.scale(1, d.squish);
        if (d.kind === 'scorch') {
          const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, d.size);
          g2.addColorStop(0, 'rgba(10,8,8,.8)');
          g2.addColorStop(.6, 'rgba(24,18,16,.45)');
          g2.addColorStop(1, 'rgba(30,24,20,0)');
          ctx.fillStyle = g2;
          ctx.beginPath(); ctx.arc(0, 0, d.size, 0, 6.283); ctx.fill();
        } else {
          ctx.fillStyle = d.color;
          ctx.beginPath();
          /* irregular pool: a few overlapping blobs */
          ctx.arc(0, 0, d.size * .5, 0, 6.283);
          ctx.fill();
          for (let k = 0; k < 3; k++) {
            const a = M.hash(d.seed + k, 7) * 6.283, r = d.size * (.22 + M.hash(d.seed + k, 9) * .3);
            ctx.beginPath();
            ctx.arc(Math.cos(a) * d.size * .45, Math.sin(a) * d.size * .3, r, 0, 6.283);
            ctx.fill();
          }
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },

    draw(ctx, view, additive) {
      const pool = this.pool;
      ctx.save();
      ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (!p.live || !!p.add !== additive) continue;
        if (p.x < view.left - 300 || p.x > view.right + 300) continue;
        const k = p.life / p.max;

        switch (p.kind) {
          case 'soft': {
            const s = M.lerp(p.size2, p.size, k);
            ctx.globalAlpha = M.clamp(k * 1.6, 0, 1) * p.alpha;
            ctx.drawImage(p.sprite, p.x - s / 2, p.y - s / 2, s, s);
            break;
          }
          case 'spark': {
            ctx.globalAlpha = M.clamp(k * 2, 0, 1);
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.size;
            ctx.lineCap = 'round';
            const st = (p.stretch || 2) * 0.016;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * st, p.y - p.vy * st);
            ctx.stroke();
            break;
          }
          case 'blood': {
            ctx.globalAlpha = M.clamp(k * 1.8, 0, 1);
            ctx.fillStyle = p.color;
            const sp = Math.min(2.4, Math.hypot(p.vx, p.vy) / 420);
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(Math.atan2(p.vy, p.vx));
            ctx.beginPath();
            ctx.ellipse(0, 0, p.size * (1 + sp * p.stretch), p.size * (1 - sp * .22), 0, 0, 6.283);
            ctx.fill();
            ctx.restore();
            break;
          }
          case 'chunk': {
            ctx.globalAlpha = Math.min(1, k * 2.5);
            ctx.save();
            ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            const w = p.size, h = p.size * .72;
            ctx.beginPath();
            ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2, -h * .32);
            ctx.lineTo(w * .38, h / 2); ctx.lineTo(-w * .45, h * .3);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.16)';
            ctx.fillRect(-w / 2, -h / 2, w * .5, h * .28);
            ctx.restore();
            break;
          }
          case 'glass': {
            ctx.globalAlpha = Math.min(1, k * 2.2) * .9;
            ctx.save();
            ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.moveTo(0, -p.size / 2); ctx.lineTo(p.size * .3, p.size * .5);
            ctx.lineTo(-p.size * .28, p.size * .3); ctx.closePath(); ctx.fill();
            ctx.restore();
            break;
          }
          case 'shell': {
            ctx.globalAlpha = Math.min(1, k * 3);
            ctx.save();
            ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size * .22, p.size, p.size * .44);
            ctx.fillStyle = 'rgba(255,240,200,.7)';
            ctx.fillRect(-p.size / 2, -p.size * .22, p.size * .45, p.size * .2);
            ctx.restore();
            break;
          }
          case 'ring': {
            const t = 1 - k;
            ctx.globalAlpha = k * .85;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.stretch * k;
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, M.lerp(p.size, p.size2, M.easeOut(t)),
              M.lerp(p.size, p.size2, M.easeOut(t)) * .42, 0, 0, 6.283);
            ctx.stroke();
            break;
          }
          case 'streak': {
            ctx.globalAlpha = k * .8;
            ctx.save();
            ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            const grd = ctx.createLinearGradient(0, 0, p.size, 0);
            grd.addColorStop(0, 'rgba(255,255,255,0)');
            grd.addColorStop(.5, p.color);
            grd.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = grd;
            ctx.fillRect(0, -3.5, p.size, 7);
            ctx.restore();
            break;
          }
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  };
})();

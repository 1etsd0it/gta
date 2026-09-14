/* ============================================================================
   weapons.js — projectiles, muzzle flashes and the explosion routine shared by
   charges, cars and the final building collapse.
   ========================================================================== */
(function () {
  'use strict';
  const CR = window.CR, M = CR.M, P = CR.Particles;

  CR.Bullet = class Bullet {
    constructor(x, y, vx, vy, dmg, owner, opts) {
      opts = opts || {};
      this.x = x; this.y = y;
      this.px = x; this.py = y;
      this.vx = vx; this.vy = vy;
      this.dmg = dmg;
      this.owner = owner;                    /* 'player' | 'enemy' */
      this.life = opts.life || 1.4;
      this.dead = false;
      this.color = opts.color || (owner === 'player' ? '#ffe6b0' : '#9fd8ff');
      this.len = opts.len || 46;
      this.w = opts.w || 3.4;
    }
    box() { return { x: Math.min(this.x, this.px) - 6, y: this.y - 8, w: Math.abs(this.x - this.px) + 12, h: 16 }; }
    update(dt) {
      this.px = this.x; this.py = this.y;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.life -= dt;
      if (this.life <= 0) this.dead = true;
    }
    draw(ctx) {
      const a = Math.atan2(this.vy, this.vx);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(this.x, this.y);
      ctx.rotate(a);
      const g = ctx.createLinearGradient(-this.len, 0, this.len * .3, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(.7, this.color);
      g.addColorStop(1, '#ffffff');
      ctx.fillStyle = g;
      ctx.fillRect(-this.len, -this.w / 2, this.len * 1.3, this.w);
      ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.arc(0, 0, this.w * 1.5, 0, 6.283); ctx.fill();
      ctx.restore();
    }
  };

  CR.Weapons = {
    muzzle(game, x, y, dir, scale) {
      scale = scale || 1;
      P.flash(x + dir * 30 * scale, y, 190 * scale, .09);
      P.sparks(x + dir * 34 * scale, y, 7, '#ffe3ab', 1.1 * scale);
      for (let i = 0; i < 4; i++) {
        P.spawn({
          kind: 'spark', x: x + dir * 40 * scale, y: y,
          vx: dir * M.rand(300, 900) * scale, vy: M.rand(-140, 140),
          g: 0, drag: 2.4, size: 3.4, life: .09, color: '#fff3cf', add: true, stretch: 4
        });
      }
      P.smoke(x + dir * 50 * scale, y, 2, .35 * scale, { vy: -40, alpha: .2, lifeScale: .5 });
    },

    /* The one explosion routine: light, fire, smoke, debris, shock, damage. */
    explode(game, x, y, opts) {
      opts = opts || {};
      const power = opts.power || 1;
      const radius = opts.radius || 420 * power;
      const dmg = opts.damage === undefined ? 200 : opts.damage;

      P.flash(x, y, 900 * power, .3);
      P.fire(x, y, 26 * power, 1.5 * power);
      P.smoke(x, y - 40, 18 * power, 2.4 * power, { vy: -240, alpha: .55, lifeScale: 1.8 });
      P.debris(x, y, 26 * power, opts.debrisColors, 1.3 * power, CR.GROUND);
      P.glass(x, y - 60, 18 * power, 1.2, CR.GROUND);
      P.embers(x, y, 22 * power);
      P.ring(x, y, 520 * power, .5, 'rgba(255,210,150,.8)', 16);
      P.decal(x, CR.GROUND + 8, 260 * power, 'scorch');

      game.cam.shake(Math.min(1, .55 * power));
      game.fx.addFlash(.34 * power, [255, 206, 150]);
      game.fx.addAberration(.5 * power);
      game.audio.explosion(power);
      game.slowmo(.12, .35);

      /* damage everything in range, including the player */
      let killed = 0;
      for (const e of game.enemies) {
        if (e.dead || e.dying) continue;
        const d = M.dist(x, y, e.x, e.y - 90);
        if (d < radius) {
          const falloff = 1 - d / radius;
          e.launch((e.x - x) * .006 * power, -M.rand(400, 900) * falloff);
          if (e.hurt(dmg * falloff, 'explosion', game, x)) killed++;
        }
      }
      for (const c of game.cars) {
        if (c.dead) continue;
        if (M.dist(x, y, c.x, c.y - 60) < radius * .9) c.explode(game, .35);
      }
      const p = game.player;
      if (!p.dead && M.dist(x, y, p.x, p.y - 120) < radius * .62) {
        p.hurt(opts.playerDamage === undefined ? 26 : opts.playerDamage, game, x);
      }
      return killed;
    }
  };
})();

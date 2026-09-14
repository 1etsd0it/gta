/* ============================================================================
   camera.js — cinematic camera: smooth follow, look-ahead, trauma-based shake,
   zoom (boss framing, final explosion pull-back) and letterbox control.
   ========================================================================== */
(function () {
  'use strict';
  const CR = window.CR, M = CR.M;

  CR.Camera = class Camera {
    constructor(w, h) {
      this.W = w; this.H = h;
      this.cx = w / 2; this.cy = h / 2;   /* world point at screen centre */
      this.targetX = this.cx; this.targetY = this.cy;
      this.zoom = 1; this.targetZoom = 1;
      this.trauma = 0;                    /* 0..1, decays; shake = trauma^2   */
      this.shakeScale = 1;                /* user setting                     */
      this.shakeX = 0; this.shakeY = 0; this.roll = 0;
      this.t = 0;
      this.locked = false;                /* arena: camera stops following x  */
      this.lockX = 0;
      this.lookAhead = 190;
      this.breath = 0;                    /* subtle running bob               */
    }

    reset(x, y) {
      this.cx = this.targetX = x; this.cy = this.targetY = y;
      this.zoom = this.targetZoom = 1;
      this.trauma = 0; this.shakeX = this.shakeY = this.roll = 0;
      this.locked = false;
    }

    /* amount: 0.1 light tap ... 1.0 building collapse */
    shake(amount) { this.trauma = M.clamp(this.trauma + amount, 0, 1); }

    lockTo(x) { this.locked = true; this.lockX = x; }
    unlock() { this.locked = false; }

    follow(target, dt, opts) {
      opts = opts || {};
      const ahead = opts.lookAhead === undefined ? this.lookAhead : opts.lookAhead;
      if (!this.locked) this.targetX = target.x + ahead;
      else this.targetX = this.lockX;
      /* vertical follow is deliberately lazy so jumps don't yank the frame */
      this.targetY = M.lerp(this.cy, target.y - 210 - (target.airborne ? 40 : 0), 0.35);
    }

    update(dt, running) {
      this.t += dt;
      this.cx = M.damp(this.cx, this.targetX, 0.0016, dt);
      this.cy = M.damp(this.cy, this.targetY, 0.006, dt);
      this.zoom = M.damp(this.zoom, this.targetZoom, 0.004, dt);

      this.trauma = Math.max(0, this.trauma - dt * 1.15);
      const s = this.trauma * this.trauma * this.shakeScale;
      if (s > 0.0001) {
        const t = this.t * 46;
        this.shakeX = (Math.sin(t * 1.7) + Math.sin(t * 0.93 + 2.1)) * 26 * s;
        this.shakeY = (Math.cos(t * 1.3) + Math.sin(t * 2.11 + 1.3)) * 18 * s;
        this.roll = Math.sin(t * 0.8) * 0.012 * s;
      } else { this.shakeX = this.shakeY = this.roll = 0; }

      /* handheld breathing while the level is live */
      if (running) {
        this.breath += dt;
        this.shakeY += Math.sin(this.breath * 2.3) * 2.2;
        this.shakeX += Math.cos(this.breath * 1.7) * 1.6;
      }
    }

    /* world -> screen transform for the scene pass */
    apply(ctx) {
      ctx.translate(this.W / 2, this.H / 2);
      ctx.scale(this.zoom, this.zoom);
      if (this.roll) ctx.rotate(this.roll);
      ctx.translate(-(this.cx - this.shakeX), -(this.cy - this.shakeY));
    }

    toScreenX(wx) { return (wx - this.cx + this.shakeX) * this.zoom + this.W / 2; }
    toScreenY(wy) { return (wy - this.cy + this.shakeY) * this.zoom + this.H / 2; }

    /* visible world rectangle (a little padded) */
    view() {
      const hw = this.W / 2 / this.zoom, hh = this.H / 2 / this.zoom;
      return { left: this.cx - hw, right: this.cx + hw, top: this.cy - hh, bottom: this.cy + hh };
    }
    onScreen(x, pad) {
      const v = this.view();
      pad = pad || 240;
      return x > v.left - pad && x < v.right + pad;
    }
  };
})();

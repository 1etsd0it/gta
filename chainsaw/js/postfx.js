/* ============================================================================
   postfx.js — the scene is rendered into an offscreen buffer, then composited
   with bloom, film grain, vignette, chromatic aberration and light flashes.
   HUD is drawn afterwards straight onto the visible canvas so text stays crisp.
   ========================================================================== */
(function () {
  'use strict';
  const CR = window.CR, M = CR.M;

  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
    return { c, g: c.getContext('2d') };
  }

  CR.PostFX = class PostFX {
    constructor() {
      this.quality = 'high';
      this.w = 0; this.h = 0;
      this.flash = 0; this.flashColor = [255, 220, 170];
      this.aberration = 0;
      this.grainT = 0;
      this.grainTiles = [];
      this.vignette = null;
      this.buildGrain();
    }

    setQuality(q) { this.quality = q; }

    /* the visible canvas is the render target; only small helper buffers exist */
    attach(canvas, ctx) { this.out = canvas; this.outCtx = ctx; }

    resize(w, h) {
      if (this.w === w && this.h === h) return;
      this.w = w; this.h = h;
      const bw = Math.max(64, Math.round(w / 5)), bh = Math.max(36, Math.round(h / 5));
      this.bloom = mk(bw, bh);
      this.bloom2 = mk(bw, bh);
      this.tmp = null;                 /* allocated lazily, only for aberration */
      this.buildLook();
    }

    /* One cached "look" layer: colour grade plus vignette, so the frame needs
       a single extra pass instead of two blended ones. */
    buildLook() {
      const { c, g } = mk(this.w, this.h);
      const grade = g.createLinearGradient(this.w, 0, 0, this.h);
      grade.addColorStop(0, 'rgba(255,168,100,.13)');
      grade.addColorStop(.45, 'rgba(255,190,150,.02)');
      grade.addColorStop(1, 'rgba(48,84,150,.15)');
      g.fillStyle = grade;
      g.fillRect(0, 0, this.w, this.h);
      const grd = g.createRadialGradient(this.w / 2, this.h * .46, this.h * .48,
                                         this.w / 2, this.h * .5, this.h * 1.02);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(.62, 'rgba(0,0,0,.14)');
      grd.addColorStop(1, 'rgba(0,0,0,.56)');
      g.fillStyle = grd; g.fillRect(0, 0, this.w, this.h);
      this.look = c;
    }

    buildGrain() {
      for (let t = 0; t < 4; t++) {
        const size = 256;
        const { c, g } = mk(size, size);
        const img = g.createImageData(size, size);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const v = 118 + (Math.random() * 74 - 37);
          d[i] = d[i + 1] = d[i + 2] = v;
          d[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
        this.grainTiles.push(c);
      }
    }

    addFlash(amount, color) {
      this.flash = Math.min(1.1, this.flash + amount);
      if (color) this.flashColor = color;
    }
    addAberration(amount) { this.aberration = Math.min(1, this.aberration + amount); }

    update(dt) {
      this.flash = Math.max(0, this.flash - dt * 2.4);
      this.aberration = Math.max(0, this.aberration - dt * 1.6);
      this.grainT += dt;
    }

    /* clears the frame and returns the context the world is drawn into */
    begin() {
      const g = this.outCtx;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      /* no clear: the sky pass covers every pixel, so clearing is one wasted
         full-screen fill per frame. The menu fills the frame itself. */
      return g;
    }

    composite(out) {
      const w = this.w, h = this.h;
      const hi = this.quality === 'high', med = this.quality !== 'low';
      const src = this.out;

      out.setTransform(1, 0, 0, 1, 0, 0);
      out.globalCompositeOperation = 'source-over';
      out.globalAlpha = 1;

      /* ---- chromatic aberration (only while something is shaking it) ---- */
      if (hi && this.aberration > .02) {
        if (!this.tmp) this.tmp = mk(w, h);
        const k = this.aberration * 7;
        const t = this.tmp.g;
        t.setTransform(1, 0, 0, 1, 0, 0);
        t.globalCompositeOperation = 'source-over';
        t.clearRect(0, 0, w, h);
        t.drawImage(src, 0, 0);
        t.globalCompositeOperation = 'multiply';
        t.fillStyle = '#ff4040'; t.fillRect(0, 0, w, h);
        out.globalCompositeOperation = 'lighter';
        out.globalAlpha = .32;
        out.drawImage(this.tmp.c, -k, 0);
        t.globalCompositeOperation = 'source-over';
        t.clearRect(0, 0, w, h);
        t.drawImage(src, 0, 0);
        t.globalCompositeOperation = 'multiply';
        t.fillStyle = '#40ffff'; t.fillRect(0, 0, w, h);
        out.drawImage(this.tmp.c, k, 0);
        out.globalAlpha = 1;
        out.globalCompositeOperation = 'source-over';
      }

      /* ---- bloom: downsample, square the luminance, blur small, add ---- */
      if (med) {
        const b = this.bloom, bw = b.c.width, bh = b.c.height;
        b.g.setTransform(1, 0, 0, 1, 0, 0);
        b.g.globalCompositeOperation = 'source-over';
        b.g.globalAlpha = 1;
        b.g.clearRect(0, 0, bw, bh);
        b.g.drawImage(src, 0, 0, bw, bh);
        b.g.globalCompositeOperation = 'multiply';
        b.g.drawImage(b.c, 0, 0);
        b.g.drawImage(b.c, 0, 0);
        b.g.globalCompositeOperation = 'source-over';

        const b2 = this.bloom2;
        b2.g.setTransform(1, 0, 0, 1, 0, 0);
        b2.g.globalCompositeOperation = 'source-over';
        b2.g.clearRect(0, 0, bw, bh);
        b2.g.filter = hi ? 'blur(4px)' : 'blur(3px)';
        b2.g.drawImage(b.c, 0, 0);
        b2.g.filter = 'none';

        out.save();
        out.globalCompositeOperation = 'lighter';
        out.globalAlpha = hi ? .8 : .55;
        out.drawImage(b2.c, 0, 0, w, h);
        out.restore();
      }

      /* ---- explosion / muzzle light ---- */
      if (this.flash > .002) {
        const c = this.flashColor;
        out.save();
        out.globalCompositeOperation = 'lighter';
        out.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (this.flash * .5) + ')';
        out.fillRect(0, 0, w, h);
        out.restore();
      }

      /* ---- grade + vignette in one pass ---- */
      if (this.look) out.drawImage(this.look, 0, 0);

      /* ---- film grain ---- */
      if (hi) {
        const tile = this.grainTiles[(this.grainT * 24 | 0) % this.grainTiles.length];
        out.save();
        out.globalCompositeOperation = 'overlay';
        out.globalAlpha = .06;
        const ox = (Math.random() * 256) | 0, oy = (Math.random() * 256) | 0;
        out.translate(-ox, -oy);
        out.fillStyle = out.createPattern(tile, 'repeat');
        out.fillRect(0, 0, w + 256, h + 256);
        out.restore();
      }
    }
  };
})();

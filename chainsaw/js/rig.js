/* ============================================================================
   rig.js — the character system.

   Every human in the game (the protagonist, civilians, police, SWAT, the boss)
   shares one skeleton. Body parts are pre-rendered once into offscreen canvases
   at 2x supersampling, then composed each frame with transforms. Pre-rendering
   is what keeps a character visually identical across every animation state —
   the run cycle and the death animation are literally the same pixels, moved.

   The protagonist replaces the head with an orange industrial chainsaw and the
   forearms with saw bars; the chain teeth are drawn on top procedurally so they
   can spin.
   ========================================================================== */
(function () {
  'use strict';
  const CR = window.CR, M = CR.M;
  const SS = 2;                                   /* supersample factor */

  /* ------------------------------ colour utils ---------------------------- */
  function hex2rgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgb(r, g, b, a) {
    return 'rgba(' + Math.round(M.clamp(r, 0, 255)) + ',' + Math.round(M.clamp(g, 0, 255)) + ',' +
      Math.round(M.clamp(b, 0, 255)) + ',' + (a === undefined ? 1 : a) + ')';
  }
  function shade(h, k, a) {
    const c = hex2rgb(h);
    return rgb(c[0] * k, c[1] * k, c[2] * k, a);
  }
  function mix(h1, h2, t) {
    const a = hex2rgb(h1), b = hex2rgb(h2);
    return rgb(M.lerp(a[0], b[0], t), M.lerp(a[1], b[1], t), M.lerp(a[2], b[2], t));
  }
  CR.shade = shade; CR.mixColor = mix;

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * SS); c.height = Math.ceil(h * SS);
    const g = c.getContext('2d');
    g.scale(SS, SS);
    g.lineJoin = 'round'; g.lineCap = 'round';
    return { c, g, w, h };
  }

  /* A part = {canvas, w, h, px, py} where (px,py) is the pivot in part units. */
  function part(w, h, px, py, draw) {
    const cv = canvas(w, h);
    draw(cv.g, w, h);
    return { img: cv.c, w, h, px, py };
  }

  /* A darkened copy of a part: limbs on the far side of the body sit in
     shadow, which is what sells the depth of a side-on character. */
  function farVariant(p) {
    const c = document.createElement('canvas');
    c.width = p.img.width; c.height = p.img.height;
    const g = c.getContext('2d');
    g.drawImage(p.img, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(12,16,28,.46)';
    g.fillRect(0, 0, c.width, c.height);
    return { img: c, w: p.w, h: p.h, px: p.px, py: p.py };
  }

  /* --------------------- generic shaded limb/plate drawing ----------------- */
  /* A tapered capsule from (w/2, y0) down to (w/2, y1) — the limb axis is +y. */
  function limbShape(g, x, y0, y1, w0, w1, r0, r1) {
    g.beginPath();
    const a0 = Math.max(1, w0 / 2), a1 = Math.max(1, w1 / 2);
    g.moveTo(x - a0, y0 + (r0 || 0));
    g.quadraticCurveTo(x - a0, y0, x - a0 + (r0 || 0), y0);
    g.lineTo(x + a0 - (r0 || 0), y0);
    g.quadraticCurveTo(x + a0, y0, x + a0, y0 + (r0 || 0));
    g.lineTo(x + a1, y1 - (r1 || 0));
    g.quadraticCurveTo(x + a1, y1, x + a1 - (r1 || 0), y1);
    g.lineTo(x - a1 + (r1 || 0), y1);
    g.quadraticCurveTo(x - a1, y1, x - a1, y1 - (r1 || 0));
    g.closePath();
  }

  /* cross-limb shading: rim light on the left edge, core shadow on the right */
  function tubeFill(g, x, w, base, opts) {
    opts = opts || {};
    const grd = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    const lift = opts.lift === undefined ? 1.5 : opts.lift;
    grd.addColorStop(0, shade(base, lift * .78));
    grd.addColorStop(0.18, shade(base, lift));
    grd.addColorStop(0.48, base);
    grd.addColorStop(0.82, shade(base, .58));
    grd.addColorStop(1, shade(base, .38));
    return grd;
  }

  function fabricFolds(g, x, y0, y1, w, color, n, seed) {
    g.save();
    g.globalAlpha = .22;
    g.strokeStyle = color;
    g.lineWidth = 1.1;
    for (let i = 0; i < n; i++) {
      const t = (i + .6) / (n + .4);
      const y = M.lerp(y0, y1, t);
      const off = (M.hash(seed + i, 3) - .5) * w * .5;
      g.beginPath();
      g.moveTo(x - w * .42 + off, y);
      g.quadraticCurveTo(x + off, y + 3.5, x + w * .40 + off, y - 1.5);
      g.stroke();
    }
    g.restore();
  }

  /* ------------------------------- body parts ----------------------------- */
  function makeTorso(o) {
    const w = 88, h = 118;
    return part(w, h, w / 2, 6, (g) => {
      const cx = w / 2;
      const top = 6, bot = h - 6;
      const shoulderW = o.build === 'heavy' ? 78 : (o.build === 'slim' ? 58 : 66);
      const waistW = o.build === 'heavy' ? 66 : (o.build === 'slim' ? 46 : 54);

      /* shirt / jacket body */
      g.beginPath();
      g.moveTo(cx - shoulderW / 2, top + 8);
      g.quadraticCurveTo(cx - shoulderW / 2 - 3, top, cx - shoulderW / 2 + 9, top - 1);
      g.lineTo(cx + shoulderW / 2 - 9, top - 1);
      g.quadraticCurveTo(cx + shoulderW / 2 + 3, top, cx + shoulderW / 2, top + 8);
      g.quadraticCurveTo(cx + shoulderW / 2 + 1, top + 40, cx + waistW / 2, bot - 16);
      g.quadraticCurveTo(cx + waistW / 2 - 1, bot, cx + waistW / 2 - 8, bot);
      g.lineTo(cx - waistW / 2 + 8, bot);
      g.quadraticCurveTo(cx - waistW / 2 + 1, bot, cx - waistW / 2, bot - 16);
      g.quadraticCurveTo(cx - shoulderW / 2 - 1, top + 40, cx - shoulderW / 2, top + 8);
      g.closePath();
      g.fillStyle = tubeFill(g, cx, shoulderW, o.shirt, { lift: o.shirtLift || 1.35 });
      g.fill();

      /* chest/ab shading so the torso reads as a volume, not a slab */
      g.save(); g.clip();
      const vg = g.createLinearGradient(0, top, 0, bot);
      vg.addColorStop(0, 'rgba(255,255,255,.10)');
      vg.addColorStop(.34, 'rgba(255,255,255,0)');
      vg.addColorStop(1, 'rgba(0,0,0,.30)');
      g.fillStyle = vg; g.fillRect(0, 0, w, h);
      fabricFolds(g, cx, top + 34, bot - 6, waistW + 10, 'rgba(0,0,0,.55)', 5, 11);

      if (o.grime) {                                  /* sweat, dirt and old blood */
        for (let i = 0; i < 7; i++) {
          g.globalAlpha = .10 + M.hash(i, 61) * .17;
          g.fillStyle = M.hash(i, 67) > .45 ? '#6d1512' : '#40372c';
          g.save();
          g.translate(cx + (M.hash(i, 71) - .5) * waistW, top + 14 + M.hash(i, 73) * (bot - top - 20));
          g.rotate(M.hash(i, 79) * 3);
          g.beginPath();
          g.ellipse(0, 0, 4 + M.hash(i, 83) * 13, 2 + M.hash(i, 89) * 7, 0, 0, 6.283);
          g.fill();
          g.restore();
        }
        g.globalAlpha = 1;
      }
      if (o.open) {                                   /* open shirt placket */
        g.globalAlpha = .5; g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(cx + 3, top + 2); g.lineTo(cx + 1, bot); g.stroke();
        g.globalAlpha = 1;
      }
      if (o.collar !== false) {                        /* collar */
        g.fillStyle = shade(o.shirt, 1.18);
        g.beginPath();
        g.moveTo(cx - 13, top - 1); g.lineTo(cx - 2, top + 13); g.lineTo(cx - 15, top + 11);
        g.closePath(); g.fill();
        g.fillStyle = shade(o.shirt, .82);
        g.beginPath();
        g.moveTo(cx + 13, top - 1); g.lineTo(cx + 2, top + 13); g.lineTo(cx + 15, top + 11);
        g.closePath(); g.fill();
      }
      if (o.tie) {                                     /* loose black tie */
        g.fillStyle = o.tie;
        g.beginPath();
        g.moveTo(cx - 1, top + 8); g.lineTo(cx + 7, top + 12); g.lineTo(cx + 5, top + 20);
        g.lineTo(cx - 3, top + 17); g.closePath(); g.fill();
        g.beginPath();
        g.moveTo(cx - 2, top + 18); g.lineTo(cx + 6, top + 21);
        g.quadraticCurveTo(cx + 13, top + 52, cx + 6, bot - 18);
        g.lineTo(cx - 3, bot - 22);
        g.quadraticCurveTo(cx + 2, top + 50, cx - 2, top + 18);
        g.closePath();
        g.fillStyle = tubeFill(g, cx + 3, 16, o.tie, { lift: 2.2 });
        g.fill();
      }
      if (o.vest) {                                    /* tactical vest */
        g.fillStyle = tubeFill(g, cx, shoulderW - 4, o.vest, { lift: 1.3 });
        g.beginPath();
        g.moveTo(cx - shoulderW / 2 + 2, top + 12);
        g.lineTo(cx + shoulderW / 2 - 2, top + 12);
        g.lineTo(cx + waistW / 2 - 1, bot - 12);
        g.lineTo(cx - waistW / 2 + 1, bot - 12);
        g.closePath(); g.fill();
        g.fillStyle = 'rgba(0,0,0,.45)';
        g.fillRect(cx - 3, top + 12, 5, bot - top - 24);          /* centre seam */
        g.fillStyle = shade(o.vest, 1.5);
        g.fillRect(cx - shoulderW / 2 + 6, top + 20, 13, 9);      /* pouches */
        g.fillRect(cx + 6, top + 20, 13, 9);
        g.fillRect(cx - shoulderW / 2 + 6, top + 34, 13, 9);
        g.fillStyle = 'rgba(0,0,0,.5)';
        g.fillRect(cx - shoulderW / 2 + 6, top + 20, 13, 2);
        g.fillRect(cx + 6, top + 20, 13, 2);
        if (o.badge) {
          g.fillStyle = o.badge;
          g.fillRect(cx + 8, top + 36, 11, 7);
        }
      }
      if (o.belt) {
        g.fillStyle = o.belt;
        g.fillRect(cx - waistW / 2 - 1, bot - 12, waistW + 2, 9);
        g.fillStyle = 'rgba(255,255,255,.22)';
        g.fillRect(cx - waistW / 2 - 1, bot - 12, waistW + 2, 2);
        g.fillStyle = shade(o.belt, 2.4);
        g.fillRect(cx - 5, bot - 12, 10, 9);
      }
      g.restore();

      /* deltoid caps so the shoulders read as round, not as a slab */
      g.save();
      g.globalCompositeOperation = 'source-atop';
      [-1, 1].forEach((sgn) => {
        const sx = cx + sgn * (shoulderW / 2 - 8);
        const rg = g.createRadialGradient(sx - 4, top + 10, 1, sx, top + 14, 20);
        rg.addColorStop(0, 'rgba(255,255,255,.22)');
        rg.addColorStop(.55, 'rgba(255,255,255,.04)');
        rg.addColorStop(1, 'rgba(0,0,0,.28)');
        g.fillStyle = rg;
        g.beginPath(); g.arc(sx, top + 14, 20, 0, 6.283); g.fill();
      });
      g.restore();

      /* rim light along the back edge — the dawn sun sits behind the runner */
      g.save();
      g.globalCompositeOperation = 'source-atop';
      const rim = g.createLinearGradient(cx - shoulderW / 2, 0, cx - shoulderW / 2 + 12, 0);
      rim.addColorStop(0, 'rgba(255,190,130,.34)');
      rim.addColorStop(1, 'rgba(255,190,130,0)');
      g.fillStyle = rim; g.fillRect(0, 0, w, h);
      g.restore();
    });
  }

  function makeLimb(len, w0, w1, color, opts) {
    opts = opts || {};
    const w = Math.max(w0, w1) + 10, h = len + 10;
    return part(w, h, w / 2, 5, (g) => {
      const cx = w / 2, y0 = 5, y1 = 5 + len;
      limbShape(g, cx, y0, y1, w0, w1, w0 * .4, w1 * .45);
      g.fillStyle = tubeFill(g, cx, w0, color, { lift: opts.lift || 1.4 });
      g.fill();
      g.save(); g.clip();
      /* joint occlusion top and bottom */
      const oc = g.createLinearGradient(0, y0, 0, y0 + 14);
      oc.addColorStop(0, 'rgba(0,0,0,.35)'); oc.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = oc; g.fillRect(0, 0, w, h);
      if (opts.folds) fabricFolds(g, cx, y0 + len * .35, y1 - 4, w0, 'rgba(0,0,0,.6)', 3, opts.seed || 5);
      if (opts.cuff) {
        g.fillStyle = shade(color, .7);
        g.fillRect(cx - w1 / 2 - 2, y1 - opts.cuff, w1 + 4, opts.cuff);
      }
      if (opts.stripe) {
        g.fillStyle = opts.stripe;
        g.fillRect(cx - w0 / 2 + 1, y0, 3, len);
      }
      g.restore();
      /* back rim */
      g.save(); g.globalCompositeOperation = 'source-atop';
      const rim = g.createLinearGradient(cx - w0 / 2, 0, cx - w0 / 2 + 7, 0);
      rim.addColorStop(0, 'rgba(255,186,126,.3)'); rim.addColorStop(1, 'rgba(255,186,126,0)');
      g.fillStyle = rim; g.fillRect(0, 0, w, h);
      g.restore();
    });
  }

  function makeHand(color) {
    return part(18, 20, 9, 6, (g) => {
      g.fillStyle = tubeFill(g, 9, 11, color, { lift: 1.1 });
      g.beginPath(); g.ellipse(9, 10, 5.4, 7, .2, 0, 6.283); g.fill();
      g.fillStyle = 'rgba(0,0,0,.32)';
      g.beginPath(); g.ellipse(11, 13, 3.4, 4.4, 0, 0, 6.283); g.fill();
    });
  }

  /* shoe: sneaker for the protagonist, boots/heels for everyone else */
  function makeShoe(o, far) {
    const w = 48, h = 30;
    return part(w, h, 14, 4, (g) => {
      const base = o.shoe || '#20222a';
      const y = 6;
      g.beginPath();
      g.moveTo(6, y);
      g.lineTo(24, y);
      g.quadraticCurveTo(44, y + 6, 43, y + 15);
      g.quadraticCurveTo(42, y + 20, 30, y + 20);
      g.lineTo(8, y + 20);
      g.quadraticCurveTo(3, y + 18, 4, y + 9);
      g.closePath();
      g.fillStyle = tubeFill(g, 22, 26, base, { lift: 1.25 });
      g.fill();
      if (o.shoeStyle === 'sneaker') {
        /* white leather with a red swoosh and rubber sole */
        g.save(); g.clip();
        g.fillStyle = 'rgba(255,255,255,.5)';
        g.fillRect(4, y, 40, 7);
        g.fillStyle = o.shoeAccent || '#c0261f';
        g.beginPath();
        g.moveTo(12, y + 15); g.quadraticCurveTo(26, y + 5, 38, y + 9);
        g.lineTo(38, y + 13); g.quadraticCurveTo(26, y + 10, 14, y + 18);
        g.closePath(); g.fill();
        g.fillStyle = '#efece4';
        g.fillRect(3, y + 16, 41, 5);                  /* midsole */
        g.fillStyle = 'rgba(30,28,30,.75)';
        g.fillRect(3, y + 20, 41, 2.5);                /* outsole */
        g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          g.beginPath(); g.moveTo(10 + i * 5, y + 2); g.lineTo(14 + i * 5, y + 8); g.stroke();
        }
        g.restore();
      } else {
        g.save(); g.clip();
        g.fillStyle = 'rgba(0,0,0,.4)';
        g.fillRect(3, y + 16, 42, 6);
        g.fillStyle = 'rgba(255,255,255,.12)';
        g.fillRect(6, y, 32, 4);
        g.restore();
      }
      if (far) {
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = 'rgba(10,12,20,.34)';
        g.fillRect(0, 0, w, h);
      }
    });
  }

  /* realistic-ish head for the human cast */
  function makeHead(o) {
    const w = 64, h = 74;
    return part(w, h, w / 2, h - 8, (g) => {
      const cx = w / 2, cy = 30;
      const skin = o.skin || '#c98f6a';
      /* neck */
      g.fillStyle = shade(skin, .72);
      g.fillRect(cx - 8, cy + 16, 17, 19);
      /* skull + jaw */
      g.beginPath();
      g.moveTo(cx - 15, cy - 5);
      g.quadraticCurveTo(cx - 17, cy - 24, cx + 1, cy - 25);
      g.quadraticCurveTo(cx + 18, cy - 24, cx + 18, cy - 2);
      g.quadraticCurveTo(cx + 19, cy + 12, cx + 9, cy + 20);
      g.quadraticCurveTo(cx + 1, cy + 26, cx - 6, cy + 19);
      g.quadraticCurveTo(cx - 15, cy + 12, cx - 15, cy - 5);
      g.closePath();
      g.fillStyle = tubeFill(g, cx, 35, skin, { lift: 1.22 });
      g.fill();
      g.save(); g.clip();
      /* brow + cheek shadow, nose, mouth line, ear */
      g.fillStyle = 'rgba(60,30,20,.30)';
      g.fillRect(cx - 16, cy - 10, 35, 5);
      g.fillStyle = 'rgba(60,30,20,.22)';
      g.beginPath(); g.ellipse(cx + 11, cy + 7, 8, 11, 0, 0, 6.283); g.fill();
      g.fillStyle = 'rgba(30,14,10,.55)';
      g.fillRect(cx + 6, cy + 9, 9, 2);
      g.fillStyle = shade(skin, .86);
      g.beginPath(); g.ellipse(cx - 7, cy + 1, 5, 6.5, 0, 0, 6.283); g.fill();   /* ear */
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.fillRect(cx + 8, cy - 4, 4.5, 3.2);                                      /* eye */
      g.fillStyle = '#2b1d16';
      g.fillRect(cx + 10, cy - 4, 2.2, 3.2);
      g.restore();

      if (o.hair) {
        g.fillStyle = o.hair;
        g.beginPath();
        g.moveTo(cx - 16, cy - 4);
        g.quadraticCurveTo(cx - 18, cy - 29, cx + 2, cy - 28);
        g.quadraticCurveTo(cx + 19, cy - 27, cx + 19, cy - 7);
        g.quadraticCurveTo(cx + 12, cy - 16, cx - 2, cy - 15);
        g.quadraticCurveTo(cx - 13, cy - 13, cx - 16, cy - 4);
        g.closePath(); g.fill();
        if (o.hairLong) {
          g.beginPath();
          g.moveTo(cx - 15, cy - 9);
          g.quadraticCurveTo(cx - 23, cy + 10, cx - 16, cy + 24);
          g.lineTo(cx - 5, cy + 21);
          g.quadraticCurveTo(cx - 12, cy + 5, cx - 7, cy - 9);
          g.closePath(); g.fill();
        }
        g.fillStyle = 'rgba(255,255,255,.14)';
        g.fillRect(cx - 12, cy - 24, 19, 4);
      }
      if (o.cap) {
        g.fillStyle = tubeFill(g, cx, 38, o.cap, { lift: 1.35 });
        g.beginPath();
        g.moveTo(cx - 16, cy - 7);
        g.quadraticCurveTo(cx - 17, cy - 29, cx + 2, cy - 29);
        g.quadraticCurveTo(cx + 19, cy - 29, cx + 19, cy - 7);
        g.closePath(); g.fill();
        g.fillStyle = shade(o.cap, .72);
        g.beginPath();
        g.moveTo(cx + 9, cy - 10); g.quadraticCurveTo(cx + 35, cy - 11, cx + 33, cy - 5);
        g.quadraticCurveTo(cx + 24, cy - 4, cx + 9, cy - 5); g.closePath(); g.fill();
        if (o.capBadge) { g.fillStyle = o.capBadge; g.fillRect(cx + 4, cy - 23, 8, 6); }
      }
      if (o.helmet) {
        g.fillStyle = tubeFill(g, cx, 42, o.helmet, { lift: 1.4 });
        g.beginPath();
        g.moveTo(cx - 19, cy - 2);
        g.quadraticCurveTo(cx - 20, cy - 31, cx + 2, cy - 31);
        g.quadraticCurveTo(cx + 22, cy - 31, cx + 21, cy - 2);
        g.quadraticCurveTo(cx + 21, cy + 7, cx + 14, cy + 7);
        g.lineTo(cx - 12, cy + 7);
        g.quadraticCurveTo(cx - 19, cy + 7, cx - 19, cy - 2);
        g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,.16)';
        g.fillRect(cx - 14, cy - 29, 24, 5);
        /* visor */
        g.fillStyle = 'rgba(18,24,34,.92)';
        g.beginPath();
        g.moveTo(cx + 2, cy - 10); g.quadraticCurveTo(cx + 22, cy - 11, cx + 21, cy + 1);
        g.quadraticCurveTo(cx + 12, cy + 6, cx + 2, cy + 2); g.closePath(); g.fill();
        g.fillStyle = 'rgba(120,190,230,.28)';
        g.beginPath();
        g.moveTo(cx + 6, cy - 7); g.lineTo(cx + 18, cy - 8); g.lineTo(cx + 15, cy - 3); g.closePath(); g.fill();
      }
      if (o.mask) {                          /* SWAT balaclava */
        g.fillStyle = '#16181d';
        g.beginPath(); g.ellipse(cx, cy - 2, 18, 20, 0, 0, 6.283); g.fill();
        g.fillStyle = 'rgba(255,255,255,.06)';
        g.fillRect(cx - 14, cy - 19, 24, 4);
      }
    });
  }

  /* ======================================================================= */
  /*                      THE PROTAGONIST'S CHAINSAW PARTS                   */
  /* ======================================================================= */

  /* Motor housing that replaces the head. Pivot sits at the neck joint.
     Orange body, dark metal underside, vents, pull cord, toothy intake. */
  function makeSawHead() {
    const w = 124, h = 96;
    const px = 40, py = 62;        /* pivot sits INSIDE the housing, at the neck */
    return part(w, h, px, py, (g) => {
      const ox = 8, oy = 16;       /* housing box */
      const bw = 92, bh = 60;
      const bx = ox + bw, by = oy + bh;

      /* ---- rubber boot / neck collar so the motor sits on the shoulders ---- */
      g.fillStyle = '#191b1f';
      g.beginPath();
      g.moveTo(ox + 18, by - 6); g.lineTo(ox + 62, by - 6);
      g.lineTo(ox + 58, by + 22); g.lineTo(ox + 24, by + 22);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,.08)';
      g.fillRect(ox + 20, by + 2, 38, 3);
      g.fillRect(ox + 21, by + 10, 36, 3);

      /* ---- rear grip handle ---- */
      g.strokeStyle = '#15171b'; g.lineWidth = 9;
      g.beginPath();
      g.moveTo(ox + 14, oy + 20);
      g.quadraticCurveTo(ox - 6, oy + 34, ox + 6, oy + 52);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 2.6;
      g.beginPath();
      g.moveTo(ox + 13, oy + 19);
      g.quadraticCurveTo(ox - 8, oy + 33, ox + 4, oy + 51);
      g.stroke();

      /* ---- dark chassis / crankcase under the shell ---- */
      g.fillStyle = '#16181c';
      g.beginPath();
      g.moveTo(ox + 6, by - 16);
      g.lineTo(bx + 16, by - 26);
      g.quadraticCurveTo(bx + 24, by - 40, bx + 12, by - 48);
      g.lineTo(ox + 10, by - 40);
      g.closePath(); g.fill();

      /* ---- main orange shell: flat top deck, square back, sloped nose ---- */
      g.beginPath();
      g.moveTo(ox + 2, by - 12);                       /* bottom back */
      g.lineTo(ox - 1, oy + 22);                       /* back edge, near vertical */
      g.quadraticCurveTo(ox + 1, oy + 6, ox + 18, oy + 3);
      g.lineTo(ox + 58, oy);                           /* flat top deck */
      g.quadraticCurveTo(ox + 76, oy + 1, ox + 82, oy + 12);
      g.lineTo(bx + 8, oy + 26);                       /* slope to the nose */
      g.quadraticCurveTo(bx + 18, oy + 32, bx + 10, oy + 40);
      g.lineTo(ox + 70, by - 6);
      g.quadraticCurveTo(ox + 40, by + 2, ox + 2, by - 12);
      g.closePath();
      const shell = g.createLinearGradient(0, oy - 4, 0, by + 6);
      shell.addColorStop(0, '#ffa347');
      shell.addColorStop(.20, '#f5822a');
      shell.addColorStop(.56, '#d2551a');
      shell.addColorStop(.86, '#993a10');
      shell.addColorStop(1, '#6d2409');
      g.fillStyle = shell; g.fill();

      g.save(); g.clip();
      /* specular sweep across the shell */
      const spec = g.createLinearGradient(ox, oy, ox + bw * .8, by);
      spec.addColorStop(0, 'rgba(255,255,255,.38)');
      spec.addColorStop(.22, 'rgba(255,255,255,.08)');
      spec.addColorStop(.55, 'rgba(0,0,0,.12)');
      spec.addColorStop(1, 'rgba(0,0,0,.42)');
      g.fillStyle = spec; g.fillRect(ox - 12, oy - 12, bw + 48, bh + 30);
      /* top-deck highlight line */
      g.fillStyle = 'rgba(255,255,255,.28)';
      g.fillRect(ox + 16, oy + 3, 46, 2.5);

      /* cooling fins */
      g.fillStyle = 'rgba(22,14,10,.78)';
      for (let i = 0; i < 6; i++) {
        g.save(); g.translate(ox + 22 + i * 9, oy + 26); g.rotate(-.16);
        g.fillRect(0, 0, 4, 24); g.restore();
      }
      g.fillStyle = 'rgba(255,255,255,.16)';
      for (let i = 0; i < 6; i++) {
        g.save(); g.translate(ox + 21 + i * 9, oy + 26); g.rotate(-.16);
        g.fillRect(0, 0, 1.3, 24); g.restore();
      }

      /* recoil starter housing — reads as the "eye" of the head */
      const ex = ox + 24, ey = oy + 22;
      g.fillStyle = '#14161a';
      g.beginPath(); g.arc(ex, ey, 14, 0, 6.283); g.fill();
      const eye = g.createRadialGradient(ex - 4, ey - 5, 1, ex, ey, 13);
      eye.addColorStop(0, '#7b828d');
      eye.addColorStop(.45, '#31353c');
      eye.addColorStop(1, '#0e1013');
      g.fillStyle = eye;
      g.beginPath(); g.arc(ex, ey, 11.5, 0, 6.283); g.fill();
      g.strokeStyle = 'rgba(255,150,60,.8)'; g.lineWidth = 2.2;
      g.beginPath(); g.arc(ex, ey, 12.8, 0, 6.283); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.55)';
      g.beginPath(); g.arc(ex - 4, ey - 4, 2.8, 0, 6.283); g.fill();
      /* starter cord stub */
      g.strokeStyle = '#d9d2c4'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(ex - 12, ey + 4); g.lineTo(ex - 20, ey + 9); g.stroke();

      /* fuel cap, choke lever, bolts */
      g.fillStyle = '#23262c';
      g.beginPath(); g.arc(ox + 62, oy + 14, 6, 0, 6.283); g.fill();
      g.fillStyle = 'rgba(255,255,255,.24)';
      g.beginPath(); g.arc(ox + 60, oy + 12, 2.4, 0, 6.283); g.fill();
      g.fillStyle = '#1c1e23';
      g.fillRect(ox + 44, oy + 10, 12, 4);
      g.fillStyle = 'rgba(28,14,6,.55)';
      [[ox + 12, by - 20], [ox + 46, by - 12], [ox + 74, oy + 26]].forEach((b) => {
        g.beginPath(); g.arc(b[0], b[1], 2.4, 0, 6.283); g.fill();
      });

      /* grime and dried blood */
      g.globalAlpha = .26;
      g.fillStyle = '#4d1210';
      g.beginPath(); g.ellipse(ox + 56, by - 16, 18, 6, .16, 0, 6.283); g.fill();
      g.beginPath(); g.ellipse(ox + 80, oy + 30, 9, 4, -.3, 0, 6.283); g.fill();
      g.fillStyle = '#231a12';
      g.beginPath(); g.ellipse(ox + 30, by - 10, 16, 5, 0, 0, 6.283); g.fill();
      g.globalAlpha = 1;
      g.restore();

      /* ---- top handle bar ---- */
      g.strokeStyle = '#15171b'; g.lineWidth = 7.5;
      g.beginPath();
      g.moveTo(ox + 10, oy + 16);
      g.quadraticCurveTo(ox + 40, oy - 16, ox + 76, oy + 8);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.26)'; g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(ox + 9, oy + 14);
      g.quadraticCurveTo(ox + 40, oy - 18, ox + 75, oy + 6);
      g.stroke();

      /* ---- clutch cover where the bar mounts ---- */
      g.beginPath();
      g.moveTo(ox + 74, oy + 16);
      g.lineTo(bx + 14, oy + 28);
      g.quadraticCurveTo(bx + 20, oy + 40, bx + 8, oy + 44);
      g.lineTo(ox + 72, by - 4);
      g.closePath();
      const cc = g.createLinearGradient(ox + 70, oy + 16, bx + 14, by);
      cc.addColorStop(0, '#3a3f47');
      cc.addColorStop(.5, '#23262c');
      cc.addColorStop(1, '#14161a');
      g.fillStyle = cc; g.fill();
      g.fillStyle = 'rgba(255,255,255,.18)';
      g.fillRect(ox + 76, oy + 20, 22, 2.4);

      /* ---- the jaw: dark intake with steel teeth along the lower front ---- */
      g.fillStyle = '#0c0e11';
      g.beginPath();
      g.moveTo(ox + 44, by - 4);
      g.quadraticCurveTo(ox + 72, by - 2, bx + 8, oy + 44);
      g.lineTo(bx + 10, oy + 54);
      g.quadraticCurveTo(ox + 74, by + 10, ox + 46, by + 8);
      g.closePath(); g.fill();
      const teeth = 8;
      for (let i = 0; i < teeth; i++) {
        const t = i / (teeth - 1);
        const x = M.lerp(ox + 48, bx + 6, t);
        const y = M.lerp(by + 6, oy + 50, t);
        g.fillStyle = i % 2 ? '#cfd5dc' : '#9aa2ac';
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 7, y - 2);
        g.lineTo(x + 2.5, y + 9);
        g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,.4)';
        g.beginPath();
        g.moveTo(x, y); g.lineTo(x + 7, y - 2); g.lineTo(x + 5, y + 1);
        g.closePath(); g.fill();
      }
    });
  }

  /* The bar (blade). Pivot at the mount, extends along +x. Teeth drawn live. */
  function makeSawBar(len, thick) {
    const w = len + 18, h = thick + 22;
    const py = h / 2;
    return part(w, h, 8, py, (g) => {
      const y = py, x0 = 8, x1 = 8 + len, half = thick / 2;
      /* steel bar */
      g.beginPath();
      g.moveTo(x0, y - half);
      g.lineTo(x1 - half, y - half);
      g.quadraticCurveTo(x1 + half * .9, y - half, x1 + half * .9, y);
      g.quadraticCurveTo(x1 + half * .9, y + half, x1 - half, y + half);
      g.lineTo(x0, y + half);
      g.closePath();
      const steel = g.createLinearGradient(0, y - half, 0, y + half);
      steel.addColorStop(0, '#f4f8fc');
      steel.addColorStop(.16, '#b4bdc7');
      steel.addColorStop(.40, '#79828d');
      steel.addColorStop(.58, '#464d56');
      steel.addColorStop(.82, '#78818c');
      steel.addColorStop(1, '#24282e');
      g.fillStyle = steel; g.fill();
      g.strokeStyle = 'rgba(10,12,16,.85)'; g.lineWidth = 1.6; g.stroke();

      g.save(); g.clip();
      /* central groove and machining marks */
      g.fillStyle = 'rgba(14,17,22,.72)';
      g.fillRect(x0 + 6, y - half * .32, len - 16, half * .64);
      g.fillStyle = 'rgba(255,255,255,.42)';
      g.fillRect(x0 + 6, y - half * .32, len - 16, 1.4);
      g.fillStyle = 'rgba(0,0,0,.5)';
      g.fillRect(x0 + 6, y + half * .3, len - 16, 1.4);
      g.fillStyle = 'rgba(255,255,255,.22)';
      for (let i = 0; i < 8; i++) {
        const x = x0 + 12 + i * (len / 8);
        g.fillRect(x, y - half + 2, 2, half * 2 - 4);
      }
      /* oiler holes */
      g.fillStyle = 'rgba(10,12,16,.7)';
      g.beginPath(); g.arc(x0 + 16, y, 3.4, 0, 6.283); g.fill();
      /* blood staining, heavier near the tip */
      for (let i = 0; i < 14; i++) {
        const t = M.hash(i, 17);
        const x = M.lerp(x0 + 10, x1 + half, t * t);
        g.globalAlpha = .2 + M.hash(i, 31) * .4;
        g.fillStyle = M.hash(i, 37) > .5 ? '#5e0c0e' : '#8c1512';
        g.save();
        g.translate(x, y + (M.hash(i, 19) - .5) * thick * .9);
        g.rotate((M.hash(i, 41) - .5) * .5);
        g.beginPath();
        g.ellipse(0, 0, 5 + M.hash(i, 23) * 18, 1.4 + M.hash(i, 29) * 2.6, 0, 0, 6.283);
        g.fill();
        g.restore();
      }
      g.globalAlpha = 1;
      g.restore();

      /* mount plate */
      g.fillStyle = '#2a2e35';
      g.fillRect(x0 - 6, y - half - 3, 16, half * 2 + 6);
      g.fillStyle = 'rgba(255,255,255,.18)';
      g.fillRect(x0 - 6, y - half - 3, 16, 2);
    });
  }

  /* Forearm that ends in a saw bar (protagonist only). Pivot at the elbow. */
  function makeSawArm(o) {
    const armLen = 54, w = 36, h = armLen + 14;
    return part(w, h, w / 2, 6, (g) => {
      const cx = w / 2, y0 = 6, y1 = 6 + armLen;
      /* rolled-up sleeve */
      limbShape(g, cx, y0, y0 + 20, 21, 18, 8, 6);
      g.fillStyle = tubeFill(g, cx, 21, o.shirt, { lift: 1.35 });
      g.fill();
      /* forearm flesh */
      limbShape(g, cx, y0 + 16, y1, 18, 13, 6, 6);
      g.fillStyle = tubeFill(g, cx, 18, o.skin, { lift: 1.25 });
      g.fill();
      /* the bar erupts from the wrist: socket of torn metal/muscle */
      g.fillStyle = '#2a2e35';
      limbShape(g, cx, y1 - 8, y1 + 6, 15, 17, 4, 4);
      g.fill();
      g.fillStyle = 'rgba(120,18,18,.55)';
      g.beginPath(); g.ellipse(cx, y1 - 2, 8, 4, 0, 0, 6.283); g.fill();
      g.fillStyle = 'rgba(255,255,255,.2)';
      g.fillRect(cx - 7, y1 - 7, 14, 2);
    });
  }

  /* Weapons held by the human cast. Pivot at the grip, barrel along +x. */
  function makePistol() {
    return part(42, 30, 8, 15, (g) => {
      g.fillStyle = '#2b2f36';
      g.fillRect(6, 10, 26, 8);                      /* slide */
      g.fillStyle = '#3e444d';
      g.fillRect(6, 10, 26, 3);
      g.fillStyle = '#22262c';
      g.beginPath();
      g.moveTo(8, 17); g.lineTo(16, 17); g.lineTo(13, 29); g.lineTo(5, 29);
      g.closePath(); g.fill();                       /* grip */
      g.fillStyle = '#191c21';
      g.fillRect(30, 12, 6, 4);                      /* muzzle */
      g.fillStyle = 'rgba(255,255,255,.2)';
      g.fillRect(7, 11, 22, 1.4);
    });
  }
  function makeShotgun() {
    return part(96, 34, 14, 17, (g) => {
      g.fillStyle = '#2d3138';
      g.fillRect(14, 12, 74, 8);                     /* barrel */
      g.fillStyle = '#464c55';
      g.fillRect(14, 12, 74, 2.6);
      g.fillStyle = '#1d2026';
      g.fillRect(40, 20, 30, 6);                     /* pump */
      g.fillStyle = '#5a3f28';
      g.beginPath();
      g.moveTo(0, 10); g.lineTo(18, 12); g.lineTo(18, 22); g.lineTo(2, 24);
      g.closePath(); g.fill();                       /* stock */
      g.fillStyle = 'rgba(255,255,255,.14)';
      g.fillRect(2, 11, 14, 2);
      g.fillStyle = '#14171b';
      g.fillRect(86, 13, 8, 6);
    });
  }

  /* ------------------------------ outfits --------------------------------- */
  const OUTFITS = CR.Outfits = {
    /* ---- the protagonist: white shirt, black tie, black trousers,
            white/red sneakers, chainsaw head, chainsaw forearms ---- */
    player: {
      chainsaw: true, build: 'normal',
      shirt: '#ded9cd', skin: '#c68d68', pants: '#262932', shoe: '#f2efe8',
      shoeStyle: 'sneaker', shoeAccent: '#c0261f', tie: '#14151a',
      open: true, shirtLift: 1.2, belt: '#17181d', grime: true
    },
    businessman: { shirt: '#6f7683', skin: '#d3a17c', pants: '#2b2f3a', shoe: '#1a1a1f', hair: '#2a221c', tie: '#7a2028', belt: '#141418' },
    woman: { build: 'slim', shirt: '#b8687e', skin: '#e2b48c', pants: '#40465c', shoe: '#26242a', hair: '#3b2a20', hairLong: true },
    delivery: { shirt: '#3f6d4a', skin: '#a9754e', pants: '#3a3529', shoe: '#241f1a', cap: '#2d4a34', capBadge: '#d7c04a', belt: '#211d17' },
    jogger: { build: 'slim', shirt: '#b0473c', skin: '#e6bd97', pants: '#2b2f38', shoe: '#e8e4dc', shoeStyle: 'sneaker', shoeAccent: '#2b6ea8', hair: '#1f1a16' },
    elderly: { shirt: '#8a9b7d', skin: '#d9b494', pants: '#5a5343', shoe: '#2a2520', hair: '#c8c4bd' },
    police: {
      weapon: 'pistol',
      shirt: '#2b3a5c', skin: '#cf9970', pants: '#1e2436', shoe: '#141419',
      cap: '#151c2e', capBadge: '#d8c25a', vest: '#12182a', belt: '#0f1118', badge: '#d8c25a'
    },
    police2: {
      weapon: 'pistol',
      shirt: '#33405f', skin: '#a87550', pants: '#232a3d', shoe: '#141419',
      cap: '#151c2e', capBadge: '#d8c25a', vest: '#161d32', belt: '#0f1118'
    },
    swat: {
      weapon: 'shotgun',
      build: 'heavy', shirt: '#22262c', skin: '#b98a63', pants: '#1b1e23', shoe: '#101114',
      helmet: '#2b2f36', mask: true, vest: '#191d23', belt: '#0e1013', badge: '#7f868f'
    },
    boss: {
      weapon: 'shotgun', bigWeapon: true,
      build: 'heavy', shirt: '#2c2f35', skin: '#c08a5f', pants: '#232529', shoe: '#121316',
      helmet: '#3a3f47', vest: '#33383f', belt: '#111216', badge: '#c9a14a'
    }
  };

  /* ------------------------------ the kit --------------------------------- */
  const kits = {};
  CR.Rig = {
    OUTFITS,

    kit(name) {
      if (kits[name]) return kits[name];
      const o = OUTFITS[name] || OUTFITS.businessman;
      const heavy = o.build === 'heavy', slim = o.build === 'slim';
      const armW = heavy ? 26 : (slim ? 19 : 22);
      const legW = heavy ? 36 : (slim ? 27 : 31);

      const k = {
        outfit: o,
        torso: makeTorso(o),
        upper: makeLimb(58, armW, armW - 3, o.shirt, { folds: true, seed: 3, lift: 1.3 }),
        fore: o.chainsaw ? makeSawArm(o) : makeLimb(52, armW - 4, armW - 7, o.sleeve || o.shirt, { cuff: 4, seed: 7 }),
        hand: o.chainsaw ? null : makeHand(o.skin),
        thigh: makeLimb(74, legW, legW - 6, o.pants, { folds: true, seed: 11, lift: 1.25 }),
        shin: makeLimb(68, legW - 7, legW - 12, o.pants, { folds: true, seed: 13, lift: 1.2 }),
        shoe: makeShoe(o, false),
        head: o.chainsaw ? makeSawHead() : makeHead(o),
        weapon: o.weapon === 'pistol' ? makePistol() : (o.weapon === 'shotgun' ? makeShotgun() : null),
        bar: o.chainsaw ? makeSawBar(196, 21) : null,
        armBar: o.chainsaw ? makeSawBar(112, 14) : null
      };
      k.upperF = farVariant(k.upper);
      k.foreF = farVariant(k.fore);
      k.thighF = farVariant(k.thigh);
      k.shinF = farVariant(k.shin);
      k.shoeF = farVariant(k.shoe);
      if (k.hand) k.handF = farVariant(k.hand);
      if (k.armBar) k.armBarF = farVariant(k.armBar);
      kits[name] = k;
      return k;
    },

    /* skeleton dimensions in rig units (character height ≈ 300) */
    DIM: {
      hipH: 150,        /* pelvis height above ground */
      spine: 100,       /* pelvis -> shoulder line    */
      neck: 12,
      shoulderX: 15,
      hipX: 12,
      thigh: 74, shin: 68, foot: 18,
      upper: 58, fore: 52
    },

    /* a neutral pose object — every animation fills these in */
    pose() {
      return {
        hipX: 0, hipY: 0, lean: 0, chest: 0, headA: 0, bob: 0,
        armFar: [0, 0], armNear: [0, 0],
        legFar: [0, 0, 0], legNear: [0, 0, 0],
        sawSpin: 0, squash: 1
      };
    },

    blend(a, b, t) {
      const o = CR.Rig.pose();
      o.hipX = M.lerp(a.hipX, b.hipX, t);
      o.hipY = M.lerp(a.hipY, b.hipY, t);
      o.lean = M.lerp(a.lean, b.lean, t);
      o.chest = M.lerp(a.chest, b.chest, t);
      o.headA = M.lerp(a.headA, b.headA, t);
      o.squash = M.lerp(a.squash, b.squash, t);
      for (let i = 0; i < 2; i++) {
        o.armFar[i] = M.lerp(a.armFar[i], b.armFar[i], t);
        o.armNear[i] = M.lerp(a.armNear[i], b.armNear[i], t);
      }
      for (let i = 0; i < 3; i++) {
        o.legFar[i] = M.lerp(a.legFar[i], b.legFar[i], t);
        o.legNear[i] = M.lerp(a.legNear[i], b.legNear[i], t);
      }
      return o;
    },

    /* --------------------------- rendering ------------------------------- */
    /* Draws a character standing at (x, y) — y is the ground under the feet.
       opts: {scale, facing, pose, kit, chainPhase, flash, tint, alpha,
              bloodiness, far} */
    draw(ctx, x, y, opts) {
      const k = opts.kit, p = opts.pose, D = CR.Rig.DIM;
      const s = (opts.scale || 1);
      const face = opts.facing === undefined ? 1 : opts.facing;

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(face * s, s * (p.squash || 1));
      if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;

      /* pelvis */
      ctx.translate(p.hipX, -D.hipH + p.hipY);

      drawLeg(ctx, k, p.legFar, D, true);
      ctx.save();
      ctx.rotate(p.lean);
      ctx.translate(0, -D.spine);
      /* far arm behind the body */
      drawArm(ctx, k, p.armFar, D, true, opts);
      /* torso */
      blit(ctx, k.torso, 0, 0, 0, 1);
      /* head / chainsaw */
      ctx.save();
      ctx.translate(0, -D.neck);
      ctx.rotate(p.headA);
      if (k.outfit.chainsaw) drawSawHead(ctx, k, opts);
      else blit(ctx, k.head, 0, 0, 0, 1);
      ctx.restore();
      drawArm(ctx, k, p.armNear, D, false, opts);
      ctx.restore();
      drawLeg(ctx, k, p.legNear, D, false);

      ctx.restore();
    },

    /* contact shadow under a character */
    shadow(ctx, x, y, w, alpha) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, w);
      g.addColorStop(0, 'rgba(6,7,10,' + (0.62 * alpha) + ')');
      g.addColorStop(.55, 'rgba(6,7,10,' + (0.28 * alpha) + ')');
      g.addColorStop(1, 'rgba(6,7,10,0)');
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(x, y); ctx.scale(1, .26);
      ctx.beginPath(); ctx.arc(0, 0, w, 0, 6.283); ctx.fill();
      ctx.restore();
    }
  };

  function blit(ctx, part, x, y, rot, sc) {
    if (!part) return;
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    const s = sc || 1;
    ctx.drawImage(part.img, -part.px * s, -part.py * s, part.w * s, part.h * s);
    ctx.restore();
  }

  function darken(ctx, on) {
    /* far limbs sit in shadow: drawn then veiled */
    ctx.globalAlpha *= on ? 1 : 1;
  }

  function drawLeg(ctx, k, a, D, far) {
    ctx.save();
    ctx.translate(far ? -D.hipX : D.hipX, 0);
    ctx.rotate(-a[0]);
    blit(ctx, far ? k.thighF : k.thigh, 0, 0, 0, 1);
    ctx.translate(0, D.thigh);
    ctx.rotate(-a[1]);
    blit(ctx, far ? k.shinF : k.shin, 0, 0, 0, 1);
    ctx.translate(0, D.shin);
    ctx.rotate(-a[2]);
    blit(ctx, far ? k.shoeF : k.shoe, 0, 0, 0, 1);
    ctx.restore();
  }

  function drawArm(ctx, k, a, D, far, opts) {
    ctx.save();
    ctx.translate(far ? -D.shoulderX : D.shoulderX, 4);
    ctx.rotate(-a[0]);
    blit(ctx, far ? k.upperF : k.upper, 0, 0, 0, 1);
    ctx.translate(0, D.upper);
    ctx.rotate(-a[1]);
    blit(ctx, far ? k.foreF : k.fore, 0, 0, 0, 1);
    if (k.outfit.chainsaw && k.armBar) {
      /* the forearm bar continues straight out of the wrist */
      ctx.save();
      ctx.translate(0, D.fore + 2);
      ctx.rotate(1.5708);                     /* continue along the forearm axis */
      blit(ctx, far ? k.armBarF : k.armBar, 0, 0, 0, 1);
      if (!far) drawChain(ctx, k.armBar, 112, 14, opts.chainPhase || 0, opts.spinning);
      ctx.restore();
    } else if (k.hand) {
      blit(ctx, far ? k.handF : k.hand, 0, D.fore, 0, 1);
      /* the weapon rides in the near hand, pointing out of the fist */
      if (!far && k.weapon) {
        ctx.save();
        ctx.translate(0, D.fore + 4);
        ctx.rotate(-1.5708);
        const sc = k.outfit.bigWeapon ? 1.15 : 1;
        ctx.drawImage(k.weapon.img, -k.weapon.px * sc, -k.weapon.py * sc,
          k.weapon.w * sc, k.weapon.h * sc);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function drawSawHead(ctx, k, opts) {
    /* housing */
    blit(ctx, k.head, 0, 0, 0, 1);
    /* main bar mounted at the jaw, pointing forward and slightly down */
    ctx.save();
    ctx.translate(64, -8);
    ctx.rotate(0.03);
    blit(ctx, k.bar, 0, 0, 0, 1);
    drawChain(ctx, k.bar, 196, 21, opts.chainPhase || 0, opts.spinning);
    ctx.restore();
  }

  /* Live chain: teeth marching around the bar, blurred while spinning. */
  function drawChain(ctx, bar, len, thick, phase, spinning) {
    const half = thick / 2, x0 = 0, x1 = len;
    const spacing = 11;
    const off = (phase * spacing) % spacing;
    ctx.save();
    ctx.translate(0, 0);
    if (spinning) {
      ctx.globalAlpha = .85;
      /* motion blur streak along the bar */
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(.4, 'rgba(255,244,214,.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x0, -half - 3, len, 3);
      ctx.fillRect(x0, half, len, 3);
    }
    const n = Math.ceil(len / spacing);
    for (let i = 0; i < n; i++) {
      const x = x0 + 8 + i * spacing + off;
      if (x > x1 - 4) continue;
      /* top run moves forward, bottom run moves back */
      ctx.fillStyle = i % 2 ? '#c6ced7' : '#8e96a1';
      ctx.beginPath();
      ctx.moveTo(x, -half + 1);
      ctx.lineTo(x + 4.5, -half - 3.6);
      ctx.lineTo(x + 7, -half + 1);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fillRect(x + 1, -half - 1.4, 3.2, 1.1);
      const xb = x1 - 8 - i * spacing - off;
      if (xb < x0 + 4) continue;
      ctx.fillStyle = i % 2 ? '#9aa2ab' : '#6d747d';
      ctx.beginPath();
      ctx.moveTo(xb, half - 1);
      ctx.lineTo(xb - 4.5, half + 3.6);
      ctx.lineTo(xb - 7, half - 1);
      ctx.closePath(); ctx.fill();
    }
    /* nose sprocket */
    ctx.strokeStyle = 'rgba(220,228,236,.8)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(x1, 0, half + 2, -1.2, 1.2);
    ctx.stroke();
    ctx.restore();
  }

  CR.Rig.drawChain = drawChain;
})();

/* ============================================================================
   Pose library. Angles are radians; 0 = limb hanging straight down, positive
   swings forward (the direction the character faces). Every animation state in
   the game is one of these functions, blended by the actor that owns the rig.
   ========================================================================== */
(function () {
  'use strict';
  const CR = window.CR, M = CR.M;
  const TAU = Math.PI * 2;

  /* one leg of a run/walk cycle at phase p (0..1) */
  function legCycle(p, power) {
    const a = p * TAU;
    const s = Math.sin(a), c = Math.cos(a);
    const thigh = (0.82 * s + 0.06) * power;
    /* the knee folds hard during the forward recovery, lightly at push-off */
    const recover = Math.max(0, s);
    const push = Math.max(0, -s);
    const knee = -(0.18 + 1.55 * recover * (0.55 - 0.45 * c) + 0.55 * push * Math.max(0, c)) * power;
    const ankle = (0.30 * c - 0.12) * power;
    return [thigh, knee, ankle];
  }

  function armCycle(p, amp, bend) {
    const a = p * TAU;
    return [Math.sin(a) * amp, -bend - Math.max(0, Math.sin(a)) * 0.35];
  }

  const P = CR.Poses = {
    idle(t) {
      const o = CR.Rig.pose();
      const br = Math.sin(t * 1.9);
      o.hipY = br * 1.6;
      o.lean = 0.04 + br * 0.012;
      o.headA = -0.04 + br * 0.02;
      o.legNear = [0.10, -0.14, 0.04];
      o.legFar = [-0.12, -0.20, 0.06];
      o.armNear = [0.12 + br * 0.03, -0.34];
      o.armFar = [-0.10 - br * 0.03, -0.28];
      return o;
    },

    walk(t) {
      const o = CR.Rig.pose();
      const p = t % 1;
      o.legNear = legCycle(p, 0.62);
      o.legFar = legCycle((p + .5) % 1, 0.62);
      o.hipY = Math.abs(Math.cos(p * TAU)) * -3.4 + 2;
      o.lean = 0.07;
      o.armNear = armCycle((p + .5) % 1, 0.30, 0.28);
      o.armFar = armCycle(p, 0.30, 0.24);
      o.headA = -0.03;
      return o;
    },

    run(t, power) {
      power = power === undefined ? 1 : power;
      const o = CR.Rig.pose();
      const p = t % 1;
      o.legNear = legCycle(p, 1);
      o.legFar = legCycle((p + .5) % 1, 1);
      /* vertical bob: two bounces per stride, plus a slight forward pitch */
      o.hipY = -Math.abs(Math.sin(p * TAU)) * 7 + 3;
      o.hipX = Math.sin(p * TAU * 2) * 1.5;
      o.lean = 0.20 + power * 0.05;
      o.chest = Math.sin(p * TAU) * 0.05;
      o.headA = -0.10 + Math.sin(p * TAU * 2) * 0.03;
      o.armNear = armCycle((p + .5) % 1, 0.62 * power, 0.55);
      o.armFar = armCycle(p, 0.62 * power, 0.5);
      return o;
    },

    /* panicked civilian sprint — arms up, head back */
    panic(t) {
      const o = P.run(t, 0.9);
      o.armNear = [2.55 + Math.sin(t * TAU) * 0.22, -0.55];
      o.armFar = [2.45 - Math.sin(t * TAU) * 0.22, -0.6];
      o.lean = 0.16;
      o.headA = 0.12;
      return o;
    },

    jump(vy, t) {
      const o = CR.Rig.pose();
      const rising = vy < 0;
      const k = M.clamp(Math.abs(vy) / 900, 0, 1);
      if (rising) {
        o.legNear = [0.95, -1.5, 0.3];
        o.legFar = [0.15, -0.55, 0.1];
        o.armNear = [-0.85, -0.5];
        o.armFar = [0.95, -0.75];
        o.lean = 0.12; o.headA = -0.14;
      } else {
        o.legNear = [0.55, -0.45, 0.25];
        o.legFar = [-0.5, -0.95, 0.15];
        o.armNear = [1.15, -0.7];
        o.armFar = [-0.55, -0.45];
        o.lean = 0.10 + k * 0.1; o.headA = -0.05;
      }
      o.hipY = -2;
      return o;
    },

    land(k) {
      const o = CR.Rig.pose();
      const d = Math.sin(M.clamp(k, 0, 1) * Math.PI);
      o.hipY = 22 * d;
      o.legNear = [0.42 + .2 * d, -0.9 - .7 * d, 0.35];
      o.legFar = [-0.3, -0.75 - .7 * d, 0.2];
      o.armNear = [0.75, -0.9];
      o.armFar = [-0.6, -0.7];
      o.lean = 0.26 + 0.2 * d;
      return o;
    },

    slide(k) {
      const o = CR.Rig.pose();
      const enter = M.clamp(k * 4, 0, 1);
      o.hipY = 60 * enter;
      o.hipX = -14 * enter;
      o.lean = -0.62 * enter;                 /* body tips back into the slide */
      o.legNear = [1.45 * enter, -0.45, 0.25];
      o.legFar = [0.35 * enter, -1.5 * enter, 0.15];
      o.armNear = [-1.25 * enter, -0.35];     /* trailing blade drags behind   */
      o.armFar = [1.6 * enter, -0.45];
      o.headA = 0.30 * enter;
      return o;
    },

    /* chainsaw swing: wind-up (0-.3), strike (.3-.6), recover (.6-1) */
    attack(k) {
      const o = CR.Rig.pose();
      if (k < .3) {
        const t = k / .3;
        o.lean = M.lerp(0.18, -0.16, t);
        o.headA = M.lerp(-0.08, -0.44, t);
        o.armNear = [M.lerp(0.4, -1.25, t), -0.55];
        o.armFar = [M.lerp(-0.3, 0.5, t), -0.5];
        o.legNear = [0.30, -0.42, 0.1];
        o.legFar = [-0.34, -0.5, 0.1];
        o.hipX = -6 * t;
      } else if (k < .62) {
        const t = (k - .3) / .32;
        const e = M.easeOut(t);
        o.lean = M.lerp(-0.16, 0.46, e);
        o.headA = M.lerp(-0.44, 0.40, e);
        o.armNear = [M.lerp(-1.25, 1.55, e), -0.35];
        o.armFar = [M.lerp(0.5, -0.7, e), -0.55];
        o.legNear = [M.lerp(0.30, 0.72, e), -0.5, 0.14];
        o.legFar = [M.lerp(-0.34, -0.62, e), -0.62, 0.1];
        o.hipX = M.lerp(-6, 16, e);
      } else {
        const t = (k - .62) / .38;
        o.lean = M.lerp(0.46, 0.2, t);
        o.headA = M.lerp(0.40, -0.08, t);
        o.armNear = [M.lerp(1.55, 0.4, t), M.lerp(-0.35, -0.5, t)];
        o.armFar = [M.lerp(-0.7, -0.3, t), -0.5];
        o.legNear = [M.lerp(0.72, 0.3, t), -0.45, 0.1];
        o.legFar = [M.lerp(-0.62, -0.3, t), -0.5, 0.1];
        o.hipX = M.lerp(16, 0, t);
      }
      return o;
    },

    shoot(k, t) {
      const o = P.run(t, 0.85);
      const kick = Math.exp(-k * 9);
      o.armNear = [1.62 + kick * 0.28, -0.06 + kick * 0.1];
      o.armFar = [0.45, -0.7];
      o.lean = 0.14 - kick * 0.1;
      o.headA = -0.06;
      return o;
    },

    aim(k) {
      const o = CR.Rig.pose();
      const kick = Math.exp(-k * 10);
      o.armNear = [1.60 + kick * 0.3, -0.05 + kick * 0.12];
      o.armFar = [1.15, -0.5];
      o.lean = 0.04 - kick * 0.06;
      o.legNear = [0.22, -0.28, 0.08];
      o.legFar = [-0.34, -0.42, 0.1];
      o.headA = -0.02;
      return o;
    },

    melee(k) {
      const o = CR.Rig.pose();
      const e = k < .35 ? M.easeIn(k / .35) : 1 - M.easeOut((k - .35) / .65);
      o.armNear = [M.lerp(-0.8, 1.75, e), -0.25];
      o.armFar = [0.4, -0.55];
      o.lean = M.lerp(-0.1, 0.4, e);
      o.legNear = [0.5 * e, -0.5, 0.1];
      o.legFar = [-0.4, -0.55, 0.1];
      o.hipX = 14 * e;
      return o;
    },

    hit(k) {
      const o = CR.Rig.pose();
      const d = Math.sin(M.clamp(k, 0, 1) * Math.PI);
      o.lean = -0.32 * d;
      o.headA = 0.26 * d;
      o.hipX = -13 * d;
      o.armNear = [-0.9 * d, -0.6];
      o.armFar = [-1.2 * d, -0.5];
      o.legNear = [-0.3 * d, -0.4, 0.1];
      o.legFar = [0.4 * d, -0.5, 0.1];
      return o;
    },

    /* ragdoll-ish collapse: knees buckle, body folds forward, then face down */
    /* Collapse to prone: knees buckle, the body pitches forward and ends up
       flat on the pavement with the head clear of the torso. */
    death(k) {
      const o = CR.Rig.pose();
      const a = M.clamp(k, 0, 1);
      const fall = M.smoothstep(a);
      const late = M.smoothstep(M.clamp((a - .45) / .55, 0, 1));
      o.hipY = M.lerp(0, 132, fall);
      o.hipX = M.lerp(0, 30, fall);
      o.lean = M.lerp(0.12, 1.52, fall);         /* torso flat on the deck */
      /* arms and head are posed in chest space, which is already rotated flat
         by the lean — these values lay them along the pavement */
      o.headA = M.lerp(0, -0.88, late);
      o.legNear = [M.lerp(0.25, -1.50, fall), M.lerp(-0.35, -0.18, fall), 0.5];
      o.legFar = [M.lerp(-0.25, -1.38, fall), M.lerp(-0.45, -0.45, fall), 0.35];
      o.armNear = [M.lerp(0.3, 0.18, fall), M.lerp(-0.4, -0.30, fall)];
      o.armFar = [M.lerp(-0.3, -0.62, fall), M.lerp(-0.4, -0.85, fall)];
      o.squash = 1 - 0.04 * fall;
      return o;
    },

    /* civilians/police knocked apart by an explosion */
    flung(t) {
      const o = CR.Rig.pose();
      o.lean = 0.9; o.headA = 0.5;
      o.legNear = [1.4, -1.3, 0.2]; o.legFar = [-0.9, -1.6, 0.1];
      o.armNear = [2.2, -0.5]; o.armFar = [-1.9, -0.4];
      return o;
    }
  };
})();

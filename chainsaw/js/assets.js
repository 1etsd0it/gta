/* ============================================================================
   assets.js — every piece of scenery is generated into an offscreen canvas at
   load time: sky, skyline, tree line, houses, street props, vehicles, pickups
   and ground textures. Nothing is loaded from disk, and nothing heavier than a
   drawImage happens per frame.
   ========================================================================== */
(function () {
  'use strict';
  const CR = window.CR, M = CR.M;

  function cv(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    const g = c.getContext('2d');
    g.lineJoin = 'round'; g.lineCap = 'round';
    return { c, g };
  }
  function rgba(r, g2, b, a) { return 'rgba(' + r + ',' + g2 + ',' + b + ',' + a + ')'; }

  const A = CR.Assets = { ready: false, img: {}, houses: [], trees: [], cars: {} };

  /* ======================= dawn sky, sun and clouds ======================= */
  function buildSky(w, h) {
    const { c, g } = cv(w, h);
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0.00, '#070b18');
    sky.addColorStop(0.30, '#141c34');
    sky.addColorStop(0.55, '#2e2e4e');
    sky.addColorStop(0.72, '#5c3f५8'.replace('५', '5'));
    sky.addColorStop(0.85, '#9c5544');
    sky.addColorStop(0.94, '#cc7a46');
    sky.addColorStop(1.00, '#e8a463');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);

    /* stars still out in the upper band */
    for (let i = 0; i < 130; i++) {
      const x = M.hash(i, 1) * w, y = M.hash(i, 2) * h * 0.42;
      const a = (1 - y / (h * 0.42)) * 0.55 * M.hash(i, 3);
      g.fillStyle = rgba(255, 255, 255, a);
      const s = M.hash(i, 4) > .9 ? 2 : 1.2;
      g.fillRect(x, y, s, s);
    }
    /* the sun just breaking the horizon */
    const sx = w * 0.64, sy = h * 0.90;
    const glow = g.createRadialGradient(sx, sy, 0, sx, sy, h * 0.38);
    glow.addColorStop(0, 'rgba(255,206,142,.62)');
    glow.addColorStop(.22, 'rgba(255,158,88,.22)');
    glow.addColorStop(.6, 'rgba(210,102,64,.07)');
    glow.addColorStop(1, 'rgba(170,74,56,0)');
    g.fillStyle = glow; g.fillRect(0, 0, w, h);
    const disc = g.createRadialGradient(sx, sy, 0, sx, sy, 58);
    disc.addColorStop(0, 'rgba(255,247,225,1)');
    disc.addColorStop(.55, 'rgba(255,214,150,.9)');
    disc.addColorStop(1, 'rgba(255,180,110,0)');
    g.fillStyle = disc;
    g.beginPath(); g.arc(sx, sy, 58, 0, 6.283); g.fill();
    return c;
  }

  function buildClouds(w, h) {
    const { c, g } = cv(w, h);
    /* Soft stratus banks: stretched radial gradients, warm on the underside
       where the sun is coming up, cold and thin on top. */
    function bank(x, y, len, thick, warm, alpha) {
      const puffs = 10 + ((M.hash(x | 0, 5) * 8) | 0);
      for (let i = 0; i < puffs; i++) {
        const t = i / (puffs - 1);
        const px = x + (t - .5) * len + (M.hash(i + x, 6) - .5) * len * .12;
        const py = y + (M.hash(i + x, 7) - .5) * thick * .9;
        const rx = len * (.10 + M.hash(i + x, 8) * .13);
        const ry = thick * (.34 + M.hash(i + x, 9) * .5);
        const fade = Math.sin(t * Math.PI);
        const gr = g.createRadialGradient(px, py, 0, px, py, Math.max(rx, ry));
        const a = alpha * fade;
        gr.addColorStop(0, 'rgba(64,58,84,' + (a * .85) + ')');
        gr.addColorStop(.55, 'rgba(52,48,72,' + (a * .45) + ')');
        gr.addColorStop(1, 'rgba(40,38,60,0)');
        g.save();
        g.translate(px, py); g.scale(1, ry / Math.max(rx, ry));
        g.fillStyle = gr;
        g.beginPath(); g.arc(0, 0, Math.max(rx, ry), 0, 6.283); g.fill();
        g.restore();
        /* sunlit belly */
        const gr2 = g.createRadialGradient(px, py + ry * .5, 0, px, py + ry * .5, rx);
        gr2.addColorStop(0, 'rgba(255,178,118,' + (a * warm) + ')');
        gr2.addColorStop(1, 'rgba(255,150,100,0)');
        g.save();
        g.translate(px, py + ry * .5); g.scale(1, .34);
        g.fillStyle = gr2;
        g.beginPath(); g.arc(0, 0, rx, 0, 6.283); g.fill();
        g.restore();
      }
    }
    for (let i = 0; i < 8; i++) {
      bank(M.hash(i, 11) * w, h * (0.18 + M.hash(i, 12) * 0.62),
        420 + M.hash(i, 13) * 900, 40 + M.hash(i, 14) * 90,
        .35 + M.hash(i, 15) * .5, .5 + M.hash(i, 16) * .4);
    }
    return c;
  }

  /* ====================== distant skyline (parallax 2) ==================== */
  function buildSkyline(w, h) {
    const { c, g } = cv(w, h);
    /* two depth bands: the far one hazier */
    for (let band = 0; band < 2; band++) {
      const base = h - band * 26;
      const alpha = band === 0 ? .72 : .95;
      const col = band === 0 ? '#1b2440' : '#0d1424';
      let x = -40;
      let i = band * 100;
      while (x < w + 80) {
        const bw = 46 + M.hash(i, 21) * 92;
        const bh = 70 + M.hash(i, 22) * (band ? 210 : 150);
        g.fillStyle = col;
        g.globalAlpha = alpha;
        g.fillRect(x, base - bh, bw, bh);
        /* roof furniture */
        if (M.hash(i, 23) > .7) g.fillRect(x + bw * .3, base - bh - 16, 7, 16);
        if (M.hash(i, 24) > .85) {
          g.fillRect(x + bw * .5, base - bh - 44, 3, 44);
          g.fillStyle = 'rgba(255,70,60,.8)';
          g.fillRect(x + bw * .5 - 2, base - bh - 48, 7, 5);
        }
        /* lit windows */
        g.globalAlpha = alpha * .9;
        for (let wy = base - bh + 12; wy < base - 14; wy += 16) {
          for (let wx = x + 7; wx < x + bw - 9; wx += 13) {
            const r = M.hash((wx * 7 + wy * 13) | 0, 25);
            if (r > .74) {
              g.fillStyle = r > .93 ? 'rgba(255,214,150,.75)' : 'rgba(240,180,120,.45)';
              g.fillRect(wx, wy, 6, 8);
            }
          }
        }
        x += bw + 7 + M.hash(i, 26) * 26;
        i++;
      }
    }
    g.globalAlpha = 1;
    /* atmospheric haze washing out the base of the skyline */
    const haze = g.createLinearGradient(0, h - 240, 0, h);
    haze.addColorStop(0, 'rgba(226,140,96,0)');
    haze.addColorStop(.6, 'rgba(220,134,94,.16)');
    haze.addColorStop(1, 'rgba(236,164,116,.44)');
    g.fillStyle = haze; g.fillRect(0, h - 240, w, 240);
    return c;
  }

  /* ========================= tree line (parallax 3) ====================== */
  /* Irregular foliage mass: overlapping bezier clumps with per-clump tone,
     a dark core and sun-catching speckle on the upper-left. Circles read as
     cartoon; lobed clumps with holes read as a tree. */
  function foliage(g, x, y, r, opts) {
    opts = opts || {};
    const seed = opts.seed || 0;
    const dark = opts.dark || '#17231a';
    const mid = opts.mid || '#22331f';
    const light = opts.light || '#33482a';
    const sun = opts.sun || 'rgba(236,172,108,.22)';
    const n = opts.n || 26;

    function clump(cx, cy, rr, fill) {
      g.fillStyle = fill;
      g.beginPath();
      const lobes = 5 + ((M.hash(cx * 3 + cy, 301) * 4) | 0);
      for (let i = 0; i <= lobes; i++) {
        const a = (i / lobes) * 6.283;
        const rad = rr * (.52 + M.hash(seed + i + cx, 302) * .72);
        const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad * .62;
        const a2 = ((i + .5) / lobes) * 6.283;
        const rad2 = rr * (.8 + M.hash(seed + i + cy, 303) * .7);
        const qx = cx + Math.cos(a2) * rad2, qy = cy + Math.sin(a2) * rad2 * .62;
        if (i === 0) g.moveTo(px, py); else g.quadraticCurveTo(qx, qy, px, py);
      }
      g.closePath(); g.fill();
    }

    /* shadowed underside first, then mid tone, then lit crown */
    for (let i = 0; i < n; i++) {
      const a = M.hash(seed + i, 304) * 6.283;
      const d = Math.sqrt(M.hash(seed + i, 305)) * r * .78;
      const cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d * .72 + r * .12;
      clump(cx, cy, r * (.26 + M.hash(seed + i, 306) * .26), dark);
    }
    for (let i = 0; i < n * .8; i++) {
      const a = M.hash(seed + i, 307) * 6.283;
      const d = Math.sqrt(M.hash(seed + i, 308)) * r * .7;
      const cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d * .72 - r * .04;
      clump(cx, cy, r * (.20 + M.hash(seed + i, 309) * .22), mid);
    }
    for (let i = 0; i < n * .5; i++) {
      const a = -2.5 + M.hash(seed + i, 310) * 2.2;
      const d = r * (.25 + M.hash(seed + i, 311) * .62);
      const cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d * .8;
      clump(cx, cy, r * (.13 + M.hash(seed + i, 312) * .16), light);
    }
    /* sun speckle on the crown */
    g.save();
    for (let i = 0; i < n * .7; i++) {
      const a = -2.7 + M.hash(seed + i, 313) * 2.1;
      const d = r * (.3 + M.hash(seed + i, 314) * .65);
      const cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d * .8;
      g.fillStyle = sun;
      g.beginPath();
      g.ellipse(cx, cy, r * (.05 + M.hash(seed + i, 315) * .09), r * (.035 + M.hash(seed + i, 316) * .06),
        M.hash(seed + i, 317) * 3, 0, 6.283);
      g.fill();
    }
    g.restore();
  }

  /* a full tree: flared trunk, branches, canopy */
  function drawTree(g, x, groundY, h, seed, tone) {
    tone = tone || {};
    const trunkW = h * .052;
    g.save();
    /* trunk */
    const tg = g.createLinearGradient(x - trunkW, 0, x + trunkW, 0);
    tg.addColorStop(0, '#463527'); tg.addColorStop(.35, '#33261b');
    tg.addColorStop(.75, '#1e1611'); tg.addColorStop(1, '#120d0a');
    g.fillStyle = tg;
    g.beginPath();
    g.moveTo(x - trunkW * 1.9, groundY);
    g.quadraticCurveTo(x - trunkW * .9, groundY - h * .2, x - trunkW * .55, groundY - h * .52);
    g.lineTo(x + trunkW * .5, groundY - h * .54);
    g.quadraticCurveTo(x + trunkW * .95, groundY - h * .2, x + trunkW * 2, groundY);
    g.closePath(); g.fill();
    /* bark */
    g.strokeStyle = 'rgba(0,0,0,.30)'; g.lineWidth = 1.6;
    for (let i = 0; i < 7; i++) {
      const off = (M.hash(seed + i, 321) - .5) * trunkW * 2.4;
      g.beginPath();
      g.moveTo(x + off, groundY - 4);
      g.quadraticCurveTo(x + off * .6, groundY - h * .3, x + off * .4, groundY - h * .5);
      g.stroke();
    }
    /* branches */
    g.strokeStyle = '#2a2018'; g.lineCap = 'round';
    const nb = 3 + ((M.hash(seed, 322) * 3) | 0);
    for (let i = 0; i < nb; i++) {
      const t = i / nb;
      const y0 = groundY - h * (.42 + t * .2);
      const dir = i % 2 ? 1 : -1;
      g.lineWidth = h * .026 * (1 - t * .4);
      g.beginPath();
      g.moveTo(x, y0);
      g.quadraticCurveTo(x + dir * h * .12, y0 - h * .06, x + dir * h * (.16 + M.hash(seed + i, 323) * .12), y0 - h * .16);
      g.stroke();
    }
    g.restore();
    /* canopy */
    foliage(g, x, groundY - h * .70, h * .40, Object.assign({ seed: seed * 7, n: 30 }, tone));
    foliage(g, x - h * .22, groundY - h * .56, h * .21, Object.assign({ seed: seed * 11, n: 14 }, tone));
    foliage(g, x + h * .24, groundY - h * .58, h * .22, Object.assign({ seed: seed * 13, n: 15 }, tone));
  }
  A.drawTree = drawTree;

  function buildTreeLine(w, h) {
    const { c, g } = cv(w, h);
    let x = -30, i = 0;
    while (x < w + 60) {
      const th = 120 + M.hash(i, 41) * 130;
      const tw = 60 + M.hash(i, 42) * 70;
      /* conifer or deciduous */
      if (M.hash(i, 43) > .45) {
        /* conifer: stacked skirts rather than a flat triangle */
        const cx = x + tw / 2;
        g.fillStyle = '#16211c';
        for (let k = 0; k < 5; k++) {
          const t = k / 5;
          const yy = h - th * (1 - t) - 6;
          const ww = tw * (.22 + t * .52);
          g.beginPath();
          g.moveTo(cx, yy - th * .16);
          g.lineTo(cx + ww, yy + th * .04);
          g.lineTo(cx + ww * .4, yy + th * .02);
          g.lineTo(cx, yy + th * .10);
          g.lineTo(cx - ww * .4, yy + th * .02);
          g.lineTo(cx - ww, yy + th * .04);
          g.closePath(); g.fill();
        }
        g.fillStyle = 'rgba(226,166,112,.13)';
        g.beginPath();
        g.moveTo(cx, h - th); g.lineTo(cx + tw * .3, h - th * .55);
        g.lineTo(cx, h - th * .5); g.closePath(); g.fill();
      } else {
        drawTree(g, x + tw / 2, h, th * 1.15, i + 3, { dark: '#101a16', mid: '#16241a', light: '#1d3021', sun: 'rgba(226,150,96,.16)' });
      }
      x += tw * .62 + M.hash(i, 44) * 26;
      i++;
    }
    const haze = g.createLinearGradient(0, h - 200, 0, h);
    haze.addColorStop(0, 'rgba(206,126,92,0)');
    haze.addColorStop(1, 'rgba(212,140,102,.20)');
    g.fillStyle = haze; g.fillRect(0, h - 200, w, 200);
    return c;
  }

  /* ============================ suburban house ===========================
     A two-storey clapboard/brick house seen from the street: foundation,
     siding with shadow lines, trimmed windows with sills and shutters, porch
     with posts and a warm lamp, shingled gable roof, chimney, gutters.
     ===================================================================== */
  function buildHouse(seed, W, H) {
    const pad = 90;
    const { c, g } = cv(W + pad * 2, H + 60);
    const OX = pad;
    const r = (n) => M.hash(seed * 13 + n, 51);
    const brick = r(1) > .66;
    const roofH = Math.round(H * .30);
    const wallTop = roofH;
    const bodyH = H - wallTop;
    const wallCols = ['#a49a88', '#b3ab98', '#8d9a99', '#ab9c8e', '#97a096', '#c0b7a3'];
    const brickCols = ['#7b544a', '#8a5d51', '#6b4740'];
    const base = brick ? brickCols[(r(2) * 3) | 0] : wallCols[(r(2) * 6) | 0];
    const trim = '#e6e1d5';
    const roofCol = ['#33302f', '#403634', '#2c3236', '#3a3330'][(r(3) * 4) | 0];

    /* ------------------------------ walls ------------------------------ */
    const wallGrad = g.createLinearGradient(0, wallTop, 0, H);
    wallGrad.addColorStop(0, CR.shade(base, 1.10));
    wallGrad.addColorStop(.45, base);
    wallGrad.addColorStop(.85, CR.shade(base, .70));
    wallGrad.addColorStop(1, CR.shade(base, .52));
    g.fillStyle = wallGrad;
    g.fillRect(OX, wallTop, W, bodyH);

    g.save();
    g.beginPath(); g.rect(OX, wallTop, W, bodyH); g.clip();
    if (brick) {
      const bh = 13, bw = 34;
      for (let y = wallTop; y < H; y += bh) {
        const off = ((y / bh) | 0) % 2 ? bw / 2 : 0;
        for (let x = OX - bw; x < OX + W; x += bw) {
          g.fillStyle = 'rgba(255,255,255,' + (0.02 + M.hash(x + y, 55) * 0.06) + ')';
          g.fillRect(x + off + 1, y + 1, bw - 3, bh - 3);
        }
        g.fillStyle = 'rgba(0,0,0,.22)';
        g.fillRect(OX, y, W, 1.6);
      }
    } else {
      for (let y = wallTop + 4; y < H; y += 17) {
        g.fillStyle = 'rgba(0,0,0,.26)';
        g.fillRect(OX, y + 14, W, 2.6);
        g.fillStyle = 'rgba(255,255,255,.09)';
        g.fillRect(OX, y, W, 2);
      }
    }
    /* sun rake across the facade + dirt rising from the ground */
    const rake = g.createLinearGradient(OX, wallTop, OX + W * .8, H);
    rake.addColorStop(0, 'rgba(255,196,140,.20)');
    rake.addColorStop(.5, 'rgba(255,180,130,.04)');
    rake.addColorStop(1, 'rgba(20,24,40,.22)');
    g.fillStyle = rake; g.fillRect(OX, wallTop, W, bodyH);
    const dirt = g.createLinearGradient(0, H - 120, 0, H);
    dirt.addColorStop(0, 'rgba(26,22,16,0)');
    dirt.addColorStop(1, 'rgba(22,18,13,.55)');
    g.fillStyle = dirt; g.fillRect(OX, H - 120, W, 120);
    /* streaks under the windows */
    g.globalAlpha = .18;
    for (let i = 0; i < 10; i++) {
      g.fillStyle = '#2a241c';
      g.fillRect(OX + M.hash(i, 57) * W, wallTop + 60 + M.hash(i, 58) * 120, 3 + M.hash(i, 59) * 5, 90 + M.hash(i, 60) * 130);
    }
    g.globalAlpha = 1;
    g.restore();

    /* corner trim boards */
    g.fillStyle = trim;
    g.fillRect(OX - 6, wallTop, 14, bodyH);
    g.fillRect(OX + W - 8, wallTop, 14, bodyH);

    /* --------------------------- foundation ---------------------------- */
    g.fillStyle = '#5f5b55';
    g.fillRect(OX - 8, H - 34, W + 16, 34);
    g.fillStyle = 'rgba(255,255,255,.07)';
    g.fillRect(OX - 8, H - 34, W + 16, 4);
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.fillRect(OX - 8, H - 8, W + 16, 8);

    /* ------------------------------ roof ------------------------------- */
    const eaveY = wallTop + 6;
    g.beginPath();
    g.moveTo(OX - 46, eaveY);
    g.lineTo(OX + W / 2, 14);
    g.lineTo(OX + W + 46, eaveY);
    g.lineTo(OX + W + 46, eaveY + 26);
    g.lineTo(OX + W / 2, 40);
    g.lineTo(OX - 46, eaveY + 26);
    g.closePath();
    const rg = g.createLinearGradient(OX, 14, OX + W, eaveY + 26);
    rg.addColorStop(0, CR.shade(roofCol, 1.7));
    rg.addColorStop(.45, CR.shade(roofCol, 1.1));
    rg.addColorStop(1, CR.shade(roofCol, .7));
    g.fillStyle = rg; g.fill();
    /* shingle courses following the pitch */
    g.save(); g.clip();
    for (let i = 0; i < 26; i++) {
      const t = i / 26;
      g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = 2;
      g.beginPath();
      g.moveTo(OX - 46, eaveY - t * (eaveY - 14) * .1 + i * 6);
      g.lineTo(OX + W + 46, eaveY - t * (eaveY - 14) * .1 + i * 6);
      g.stroke();
    }
    /* gable face shading */
    const gsh = g.createLinearGradient(OX, 14, OX, eaveY);
    gsh.addColorStop(0, 'rgba(255,210,160,.22)');
    gsh.addColorStop(1, 'rgba(0,0,0,.25)');
    g.fillStyle = gsh; g.fillRect(OX - 46, 0, W + 92, eaveY + 30);
    g.restore();
    /* ridge cap, fascia and gutter */
    g.fillStyle = CR.shade(roofCol, 1.9);
    g.beginPath();
    g.moveTo(OX + W / 2 - 8, 14); g.lineTo(OX + W / 2 + 8, 14);
    g.lineTo(OX + W / 2 + 4, 26); g.lineTo(OX + W / 2 - 4, 26);
    g.closePath(); g.fill();
    g.fillStyle = trim;
    g.fillRect(OX - 48, eaveY + 24, W + 96, 10);
    g.fillStyle = '#9c968a';
    g.fillRect(OX - 48, eaveY + 34, W + 96, 7);
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.fillRect(OX - 48, eaveY + 41, W + 96, 9);       /* shadow under the eave */

    /* attic vent in the gable */
    g.fillStyle = '#2a2622';
    g.beginPath();
    g.moveTo(OX + W / 2, 34); g.lineTo(OX + W / 2 + 26, 58);
    g.lineTo(OX + W / 2 - 26, 58); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = 2;
    g.stroke();

    /* chimney */
    if (r(4) > .35) {
      const cx2 = OX + W * (.16 + r(5) * .14);
      g.fillStyle = brick ? '#6d4a41' : '#6b625a';
      g.fillRect(cx2, 10, 44, roofH + 30);
      g.fillStyle = 'rgba(0,0,0,.32)';
      g.fillRect(cx2 + 30, 10, 14, roofH + 30);
      g.fillStyle = 'rgba(255,255,255,.12)';
      g.fillRect(cx2, 10, 44, 4);
      g.fillStyle = '#4a443e';
      g.fillRect(cx2 - 6, 2, 56, 12);
    }

    /* ------------------------------ windows ---------------------------- */
    function win(x, y, w2, h2, lit, shutters) {
      /* reveal shadow */
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.fillRect(x - 5, y - 5, w2 + 10, h2 + 12);
      /* glass */
      const glass = g.createLinearGradient(x, y, x + w2 * .6, y + h2);
      if (lit) {
        glass.addColorStop(0, '#ffdca6'); glass.addColorStop(.45, '#f2b16a');
        glass.addColorStop(1, '#b9722f');
      } else {
        glass.addColorStop(0, '#46566a'); glass.addColorStop(.4, '#243044');
        glass.addColorStop(1, '#101823');
      }
      g.fillStyle = glass; g.fillRect(x, y, w2, h2);
      g.save();
      g.beginPath(); g.rect(x, y, w2, h2); g.clip();
      /* sky reflection */
      g.fillStyle = 'rgba(226,180,150,.22)';
      g.beginPath();
      g.moveTo(x - 14, y + h2); g.lineTo(x + w2 * .48, y - 8);
      g.lineTo(x + w2 * .78, y - 8); g.lineTo(x + w2 * .12, y + h2);
      g.closePath(); g.fill();
      if (lit) {
        g.fillStyle = 'rgba(70,34,20,.5)';
        g.fillRect(x, y, w2 * .26, h2);
        g.fillRect(x + w2 * .72, y, w2 * .28, h2);
        g.fillStyle = 'rgba(40,20,12,.45)';
        g.fillRect(x, y + h2 * .62, w2, h2 * .1);
      }
      g.restore();
      /* muntins + frame */
      g.fillStyle = trim;
      g.fillRect(x + w2 / 2 - 2.5, y, 5, h2);
      g.fillRect(x, y + h2 * .45, w2, 5);
      g.strokeStyle = trim; g.lineWidth = 7;
      g.strokeRect(x - 3.5, y - 3.5, w2 + 7, h2 + 7);
      /* sill */
      g.fillStyle = CR.shade('#cfc7b8', 1.05);
      g.fillRect(x - 12, y + h2 + 4, w2 + 24, 8);
      g.fillStyle = 'rgba(0,0,0,.4)';
      g.fillRect(x - 12, y + h2 + 12, w2 + 24, 5);
      if (shutters) {
        [x - 26, x + w2 + 6].forEach((sx) => {
          g.fillStyle = '#38464a';
          g.fillRect(sx, y - 2, 20, h2 + 4);
          g.fillStyle = 'rgba(0,0,0,.3)';
          for (let i = 0; i < 7; i++) g.fillRect(sx + 2, y + 4 + i * (h2 / 7), 16, 3);
          g.fillStyle = 'rgba(255,255,255,.12)';
          g.fillRect(sx, y - 2, 20, 3);
        });
      }
    }

    const shutters = r(8) > .5;
    const winW = Math.round(W * .13), winH = Math.round(bodyH * .30);
    const cols = 3;
    const gapX = (W - 120 - cols * winW) / (cols - 1);
    for (let i = 0; i < cols; i++) {
      win(OX + 60 + i * (winW + gapX), wallTop + bodyH * .12, winW, winH, r(10 + i) > .55, shutters);
    }

    /* ---------------------- ground floor + porch ----------------------- */
    const groundY = H - bodyH * .40;
    const hasGarage = r(7) > .55;
    if (hasGarage) {
      const gw = W * .40, gx = OX + W - gw - 40;
      g.fillStyle = '#8f8b83';
      g.fillRect(gx, groundY, gw, H - groundY - 34);
      const gp = g.createLinearGradient(gx, groundY, gx, H - 34);
      gp.addColorStop(0, 'rgba(255,255,255,.12)');
      gp.addColorStop(1, 'rgba(0,0,0,.35)');
      g.fillStyle = gp; g.fillRect(gx, groundY, gw, H - groundY - 34);
      g.fillStyle = 'rgba(0,0,0,.30)';
      for (let y = groundY + 10; y < H - 34; y += 22) g.fillRect(gx, y, gw, 3.5);
      g.fillStyle = trim;
      g.fillRect(gx - 8, groundY - 8, gw + 16, 10);
      win(OX + 60, groundY + 14, winW, winH * .8, r(15) > .5, shutters);
    } else {
      win(OX + 56, groundY + 14, winW, winH * .8, r(15) > .5, shutters);
      win(OX + W - 56 - winW, groundY + 14, winW, winH * .8, r(16) > .5, shutters);
    }

    const doorX = OX + (hasGarage ? W * .26 : W * .5);
    /* porch deck + roof */
    const porchTop = groundY - 26;
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.fillRect(doorX - 110, porchTop + 6, 220, H - porchTop - 40);
    g.fillStyle = '#403a34';
    g.fillRect(doorX - 120, porchTop - 14, 240, 18);
    g.fillStyle = CR.shade('#403a34', 1.5);
    g.fillRect(doorX - 120, porchTop - 14, 240, 5);
    g.fillStyle = trim;
    g.fillRect(doorX - 112, porchTop + 4, 14, H - porchTop - 38);
    g.fillRect(doorX + 98, porchTop + 4, 14, H - porchTop - 38);
    /* railing */
    g.fillStyle = 'rgba(230,225,213,.9)';
    g.fillRect(doorX + 40, H - 96, 58, 7);
    for (let i = 0; i < 4; i++) g.fillRect(doorX + 44 + i * 14, H - 96, 5, 58);

    /* door */
    g.fillStyle = '#1e1913';
    g.fillRect(doorX - 40, H - 152, 80, 118);
    const dg = g.createLinearGradient(doorX - 36, 0, doorX + 36, 0);
    dg.addColorStop(0, '#50392a'); dg.addColorStop(.45, '#6a4c33'); dg.addColorStop(1, '#33241a');
    g.fillStyle = dg;
    g.fillRect(doorX - 36, H - 148, 72, 114);
    g.fillStyle = 'rgba(0,0,0,.32)';
    g.fillRect(doorX - 24, H - 136, 48, 42);
    g.fillRect(doorX - 24, H - 86, 48, 40);
    g.fillStyle = 'rgba(255,255,255,.10)';
    g.fillRect(doorX - 24, H - 136, 48, 3);
    g.fillStyle = '#d8c98a';
    g.beginPath(); g.arc(doorX + 24, H - 90, 4.4, 0, 6.283); g.fill();

    /* porch lamp and its pool of light */
    const lx = doorX + 58, ly = H - 168;
    const lampGlow = g.createRadialGradient(lx, ly, 0, lx, ly, 150);
    lampGlow.addColorStop(0, 'rgba(255,196,120,.50)');
    lampGlow.addColorStop(.35, 'rgba(255,170,90,.18)');
    lampGlow.addColorStop(1, 'rgba(255,160,80,0)');
    g.fillStyle = lampGlow;
    g.beginPath(); g.arc(lx, ly, 150, 0, 6.283); g.fill();
    g.fillStyle = '#2a2823';
    g.fillRect(lx - 8, ly - 12, 16, 6);
    g.fillStyle = '#ffe2ac';
    g.beginPath();
    g.moveTo(lx - 7, ly - 6); g.lineTo(lx + 7, ly - 6);
    g.lineTo(lx + 5, ly + 10); g.lineTo(lx - 5, ly + 10);
    g.closePath(); g.fill();

    /* steps */
    for (let i = 0; i < 3; i++) {
      g.fillStyle = ['#8a8377', '#7c7568', '#6e685d'][i];
      g.fillRect(doorX - 62 - i * 10, H - 30 + i * 11, 124 + i * 20, 12);
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.fillRect(doorX - 62 - i * 10, H - 20 + i * 11, 124 + i * 20, 3);
    }

    /* drainpipe + meter */
    g.fillStyle = '#726c62';
    g.fillRect(OX + 10, eaveY + 40, 9, H - eaveY - 74);
    g.fillStyle = '#5d5850';
    g.fillRect(OX + 6, eaveY + 40, 17, 8);
    g.fillStyle = '#8b8579';
    g.fillRect(OX + W - 52, H - 132, 24, 30);
    g.fillStyle = 'rgba(255,255,255,.18)';
    g.fillRect(OX + W - 50, H - 130, 20, 10);

    /* satellite dish on some roofs */
    if (r(9) > .6) {
      const sx = OX + W * .78, sy = eaveY - 10;
      g.fillStyle = '#b9b4aa';
      g.save();
      g.translate(sx, sy); g.rotate(-.5); g.scale(1, .55);
      g.beginPath(); g.arc(0, 0, 22, 0, 6.283); g.fill();
      g.restore();
      g.strokeStyle = '#7d786e'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + 8, sy + 24); g.stroke();
    }

    return { img: c, w: W + pad * 2, h: H + 60, brick: brick, base: base, roof: roofCol, bodyW: W };
  }

  /* ============================== street props =========================== */
  function buildLamp() {
    const W = 150, H = 560;
    const { c, g } = cv(W, H);
    const x = 24;
    /* concrete base */
    g.fillStyle = '#3f3f44';
    g.fillRect(x - 12, H - 26, 34, 26);
    /* tapered pole */
    const pg = g.createLinearGradient(x - 7, 0, x + 9, 0);
    pg.addColorStop(0, '#6e737c'); pg.addColorStop(.35, '#4a4e56');
    pg.addColorStop(.75, '#2e3138'); pg.addColorStop(1, '#20232a');
    g.fillStyle = pg;
    g.beginPath();
    g.moveTo(x - 7, H - 20); g.lineTo(x - 5, 40); g.lineTo(x + 6, 40); g.lineTo(x + 9, H - 20);
    g.closePath(); g.fill();
    /* curved arm */
    g.strokeStyle = '#3a3e45'; g.lineWidth = 9;
    g.beginPath();
    g.moveTo(x + 1, 44);
    g.quadraticCurveTo(x + 10, 12, x + 74, 20);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x, 42); g.quadraticCurveTo(x + 9, 10, x + 72, 18);
    g.stroke();
    /* lamp housing */
    g.fillStyle = '#2b2f36';
    g.beginPath();
    g.moveTo(x + 60, 16); g.lineTo(x + 104, 18); g.lineTo(x + 98, 34); g.lineTo(x + 62, 32);
    g.closePath(); g.fill();
    /* hot sodium lamp */
    const lg = g.createRadialGradient(x + 82, 32, 0, x + 82, 32, 26);
    lg.addColorStop(0, 'rgba(255,236,190,1)');
    lg.addColorStop(.35, 'rgba(255,196,110,.8)');
    lg.addColorStop(1, 'rgba(255,170,80,0)');
    g.fillStyle = lg;
    g.beginPath(); g.arc(x + 82, 32, 26, 0, 6.283); g.fill();
    return { img: c, w: W, h: H };
  }

  function buildPole() {
    const W = 190, H = 700;
    const { c, g } = cv(W, H);
    const x = 30;
    const pg = g.createLinearGradient(x - 11, 0, x + 13, 0);
    pg.addColorStop(0, '#6b5b47'); pg.addColorStop(.4, '#4a3f31');
    pg.addColorStop(1, '#2b241c');
    g.fillStyle = pg;
    g.beginPath();
    g.moveTo(x - 11, H); g.lineTo(x - 8, 30); g.lineTo(x + 9, 30); g.lineTo(x + 13, H);
    g.closePath(); g.fill();
    /* wood grain */
    g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      g.beginPath(); g.moveTo(x - 6 + i * 3, 34); g.lineTo(x - 4 + i * 3, H); g.stroke();
    }
    /* crossarms */
    [46, 96].forEach((y, i) => {
      g.fillStyle = '#3c3226';
      g.fillRect(x - 58 - i * 6, y, 120 + i * 12, 9);
      g.fillStyle = 'rgba(255,255,255,.10)';
      g.fillRect(x - 58 - i * 6, y, 120 + i * 12, 2);
      for (let k = -2; k <= 2; k++) {
        g.fillStyle = '#6d7a80';
        g.fillRect(x + k * 26 - 3, y - 9, 7, 9);
      }
    });
    /* transformer can */
    g.fillStyle = '#4d5158';
    g.fillRect(x + 16, 150, 34, 46);
    g.fillStyle = 'rgba(255,255,255,.12)';
    g.fillRect(x + 16, 150, 34, 4);
    return { img: c, w: W, h: H };
  }

  function simpleProp(W, H, draw) {
    const { c, g } = cv(W, H);
    draw(g, W, H);
    return { img: c, w: W, h: H };
  }

  function buildProps() {
    const P = A.img;
    P.lamp = buildLamp();
    P.pole = buildPole();

    P.hydrant = simpleProp(54, 96, (g, w, h) => {
      const body = g.createLinearGradient(14, 0, 42, 0);
      body.addColorStop(0, '#e0574a'); body.addColorStop(.35, '#c02f24');
      body.addColorStop(1, '#6d150f');
      g.fillStyle = body;
      g.fillRect(16, 26, 24, h - 32);
      g.beginPath(); g.arc(28, 30, 13, Math.PI, 0); g.fill();
      g.fillStyle = '#8f2118';
      g.fillRect(8, 44, 40, 11);                 /* side caps */
      g.fillRect(20, 16, 17, 10);
      g.fillStyle = 'rgba(255,255,255,.25)';
      g.fillRect(18, 30, 5, h - 40);
      g.fillStyle = '#4a4a50';
      g.fillRect(10, h - 8, 36, 8);
    });

    P.bin = simpleProp(86, 108, (g, w, h) => {
      const body = g.createLinearGradient(10, 0, 76, 0);
      body.addColorStop(0, '#3e5b45'); body.addColorStop(.4, '#2c4433');
      body.addColorStop(1, '#152318');
      g.fillStyle = body;
      g.beginPath();
      g.moveTo(14, 24); g.lineTo(72, 24); g.lineTo(66, h); g.lineTo(20, h);
      g.closePath(); g.fill();
      g.fillStyle = '#3a5742';
      g.fillRect(8, 12, 70, 14);                 /* lid */
      g.fillStyle = 'rgba(255,255,255,.16)';
      g.fillRect(8, 12, 70, 3);
      g.fillStyle = 'rgba(0,0,0,.35)';
      for (let i = 0; i < 3; i++) g.fillRect(24 + i * 15, 30, 4, h - 34);
      g.fillStyle = '#23201c';
      g.beginPath(); g.ellipse(24, h - 2, 8, 4, 0, 0, 6.283); g.fill();
      g.beginPath(); g.ellipse(62, h - 2, 8, 4, 0, 0, 6.283); g.fill();
    });

    P.mailbox = simpleProp(56, 104, (g, w, h) => {
      g.fillStyle = '#5b4a36';
      g.fillRect(22, 36, 10, h - 36);
      const b = g.createLinearGradient(8, 0, 50, 0);
      b.addColorStop(0, '#98a3ad'); b.addColorStop(.4, '#6d7781'); b.addColorStop(1, '#3d444c');
      g.fillStyle = b;
      g.beginPath();
      g.moveTo(8, 40); g.lineTo(8, 22);
      g.quadraticCurveTo(28, 4, 48, 22); g.lineTo(48, 40);
      g.closePath(); g.fill();
      g.fillStyle = '#c23a2a';
      g.fillRect(44, 12, 4, 18);
    });

    P.bench = simpleProp(190, 92, (g, w, h) => {
      const wood = ['#6b4f33', '#7d5c3b', '#5c432b'];
      for (let i = 0; i < 3; i++) {
        g.fillStyle = wood[i % 3];
        g.fillRect(8, 30 + i * 11, w - 16, 9);
        g.fillStyle = 'rgba(255,255,255,.10)';
        g.fillRect(8, 30 + i * 11, w - 16, 2);
      }
      for (let i = 0; i < 2; i++) {
        g.fillStyle = wood[(i + 1) % 3];
        g.fillRect(8, 4 + i * 12, w - 16, 9);
      }
      g.fillStyle = '#2f3238';
      g.fillRect(16, 38, 9, h - 38);
      g.fillRect(w - 25, 38, 9, h - 38);
      g.fillRect(12, h - 8, 18, 8);
      g.fillRect(w - 30, h - 8, 18, 8);
    });

    P.cone = simpleProp(60, 78, (g, w, h) => {
      g.fillStyle = '#d8551f';
      g.beginPath();
      g.moveTo(30, 4); g.lineTo(48, h - 12); g.lineTo(12, h - 12); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.fillRect(18, h - 40, 24, 9);
      g.fillStyle = '#b03f14';
      g.fillRect(4, h - 12, 52, 12);
      g.fillStyle = 'rgba(255,255,255,.2)';
      g.beginPath(); g.moveTo(28, 6); g.lineTo(34, h - 14); g.lineTo(30, h - 14); g.closePath(); g.fill();
    });

    P.barrier = simpleProp(220, 110, (g, w, h) => {
      g.fillStyle = '#e8e2d6';
      g.fillRect(6, 20, w - 12, 30);
      for (let i = 0; i < 9; i++) {
        g.save();
        g.beginPath(); g.rect(6, 20, w - 12, 30); g.clip();
        g.fillStyle = i % 2 ? '#d8492c' : '#efe9dd';
        g.save(); g.translate(6 + i * 26, 20); g.rotate(.5);
        g.fillRect(0, -20, 16, 70); g.restore();
        g.restore();
      }
      g.strokeStyle = '#9a9488'; g.lineWidth = 3;
      g.strokeRect(6, 20, w - 12, 30);
      g.fillStyle = '#55595f';
      g.fillRect(26, 50, 9, h - 50);
      g.fillRect(w - 35, 50, 9, h - 50);
      g.fillRect(14, h - 9, 34, 9);
      g.fillRect(w - 48, h - 9, 34, 9);
    });

    P.sign = simpleProp(90, 240, (g, w, h) => {
      g.fillStyle = '#5a5f66';
      g.fillRect(40, 40, 8, h - 40);
      g.fillStyle = '#2f6b3c';
      g.fillRect(6, 44, 78, 26);
      g.fillStyle = 'rgba(255,255,255,.9)';
      g.font = 'bold 15px Arial';
      g.fillText('MAPLE ST', 12, 62);
      g.fillStyle = '#e8e4dc';
      g.fillRect(20, 6, 48, 34);
      g.fillStyle = '#1c1f24';
      g.font = 'bold 13px Arial';
      g.fillText('SPEED', 24, 20);
      g.fillText('25', 36, 34);
    });

    P.stop = simpleProp(80, 230, (g, w, h) => {
      g.fillStyle = '#5a5f66';
      g.fillRect(36, 60, 8, h - 60);
      g.save();
      g.translate(40, 40);
      g.fillStyle = '#b32418';
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = Math.PI / 8 + i * Math.PI / 4;
        const x = Math.cos(a) * 33, y = Math.sin(a) * 33;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2.5;
      g.stroke();
      g.fillStyle = '#fff'; g.font = 'bold 20px Arial'; g.textAlign = 'center';
      g.fillText('STOP', 0, 7);
      g.restore();
    });

    P.bush = simpleProp(260, 170, (g, w, h) => {
      foliage(g, w / 2, h - 58, 78, { seed: 3, n: 20, dark: '#121d15', mid: '#1b2a1a', light: '#2a3d22' });
      foliage(g, w * .28, h - 40, 46, { seed: 9, n: 12 });
      foliage(g, w * .74, h - 44, 50, { seed: 15, n: 12 });
      g.fillStyle = 'rgba(0,0,0,.4)';
      g.beginPath(); g.ellipse(w / 2, h - 8, 96, 14, 0, 0, 6.283); g.fill();
    });

    P.bushBlur = simpleProp(300, 200, (g, w, h) => {
      const src = P.bush;
      g.filter = 'blur(6px) brightness(.28)';
      g.drawImage(src.img, (w - src.w) / 2, h - src.h, src.w, src.h);
      g.filter = 'none';
    });
    P.tree = simpleProp(560, 760, (g, w, h) => { drawTree(g, w / 2, h - 4, h - 20, 5); });
    P.tree2 = simpleProp(520, 640, (g, w, h) => { drawTree(g, w / 2, h - 4, h - 20, 21); });

    P.fence = simpleProp(240, 130, (g, w, h) => {
      /* white picket, weathered */
      for (let i = 0; i < 9; i++) {
        const x = 6 + i * 26;
        const wob = M.hash(i, 91) * 3;
        g.fillStyle = '#cfc8b8';
        g.beginPath();
        g.moveTo(x, h); g.lineTo(x, 28 + wob); g.lineTo(x + 8, 18 + wob);
        g.lineTo(x + 16, 28 + wob); g.lineTo(x + 16, h); g.closePath(); g.fill();
        g.fillStyle = 'rgba(0,0,0,.22)';
        g.fillRect(x + 11, 28 + wob, 5, h - 28);
      }
      g.fillStyle = '#bdb6a6';
      g.fillRect(0, 48, w, 9);
      g.fillRect(0, 86, w, 9);
      g.fillStyle = 'rgba(0,0,0,.18)';
      g.fillRect(0, 55, w, 3);
      g.fillRect(0, 93, w, 3);
    });

    P.chainlink = simpleProp(240, 160, (g, w, h) => {
      g.strokeStyle = 'rgba(170,180,190,.55)'; g.lineWidth = 1.6;
      for (let x = -h; x < w; x += 14) {
        g.beginPath(); g.moveTo(x, h); g.lineTo(x + h, 12); g.stroke();
        g.beginPath(); g.moveTo(x, 12); g.lineTo(x + h, h); g.stroke();
      }
      g.strokeStyle = '#8d959d'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(0, 12); g.lineTo(w, 12); g.stroke();
      for (let i = 0; i <= 2; i++) {
        g.beginPath(); g.moveTo(6 + i * (w / 2 - 6), 8); g.lineTo(6 + i * (w / 2 - 6), h); g.stroke();
      }
    });

    P.busstop = simpleProp(340, 300, (g, w, h) => {
      g.fillStyle = 'rgba(20,26,34,.55)';
      g.fillRect(18, 30, w - 36, h - 40);
      g.fillStyle = 'rgba(140,180,210,.14)';
      g.fillRect(24, 36, w - 48, h - 54);
      g.fillStyle = '#2d3138';
      g.fillRect(10, 14, w - 20, 18);
      g.fillRect(14, 30, 10, h - 30);
      g.fillRect(w - 24, 30, 10, h - 30);
      g.fillStyle = '#6b4f33';
      g.fillRect(34, h - 74, w - 68, 12);
      /* ad panel with a warm backlight */
      g.fillStyle = 'rgba(255,196,120,.30)';
      g.fillRect(w - 92, 44, 66, 130);
      g.fillStyle = 'rgba(255,220,160,.5)';
      g.fillRect(w - 88, 48, 58, 122);
    });

    P.ac = simpleProp(90, 80, (g, w, h) => {
      g.fillStyle = '#8c9299';
      g.fillRect(4, 8, w - 8, h - 12);
      g.fillStyle = 'rgba(0,0,0,.35)';
      for (let i = 0; i < 7; i++) g.fillRect(10, 14 + i * 8, w - 20, 4);
      g.fillStyle = '#5d646b';
      g.fillRect(0, 0, w, 10);
    });

    P.garbage = simpleProp(200, 120, (g, w, h) => {
      for (let i = 0; i < 7; i++) {
        const x = 20 + M.hash(i, 101) * (w - 60), y = h - 20 - M.hash(i, 102) * 50;
        g.fillStyle = ['#1d1f22', '#26282c', '#15171a'][i % 3];
        g.beginPath(); g.ellipse(x, y, 26 + M.hash(i, 103) * 16, 20 + M.hash(i, 104) * 12, M.hash(i, 105), 0, 6.283);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,.07)';
        g.beginPath(); g.ellipse(x - 6, y - 8, 10, 6, 0, 0, 6.283); g.fill();
      }
      g.fillStyle = '#6b6152';
      g.fillRect(w - 70, h - 44, 46, 44);
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.fillRect(w - 70, h - 30, 46, 4);
    });
  }

  /* ============================== ground ================================= */
  function buildGround() {
    const P = A.img;
    /* asphalt: dark, grainy, with cracks */
    const asf = cv(512, 256);
    const ag = asf.g;
    ag.fillStyle = '#24262b'; ag.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 5200; i++) {
      const x = Math.random() * 512, y = Math.random() * 256;
      const v = Math.random();
      ag.fillStyle = v > .5 ? 'rgba(255,255,255,.045)' : 'rgba(0,0,0,.14)';
      ag.fillRect(x, y, 1 + Math.random() * 2.5, 1 + Math.random() * 2);
    }
    ag.strokeStyle = 'rgba(10,10,12,.5)'; ag.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ag.beginPath();
      let x = Math.random() * 512, y = Math.random() * 256;
      ag.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (Math.random() - .5) * 110; y += (Math.random() - .5) * 70; ag.lineTo(x, y); }
      ag.stroke();
    }
    P.asphalt = asf.c;

    /* sidewalk: concrete slabs */
    const sw = cv(256, 256);
    const sg = sw.g;
    sg.fillStyle = '#6d6c68'; sg.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3000; i++) {
      sg.fillStyle = Math.random() > .5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.07)';
      sg.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    sg.strokeStyle = 'rgba(30,30,32,.5)'; sg.lineWidth = 3;
    sg.beginPath(); sg.moveTo(128, 0); sg.lineTo(128, 256); sg.stroke();
    sg.beginPath(); sg.moveTo(0, 128); sg.lineTo(256, 128); sg.stroke();
    P.sidewalk = sw.c;

    /* grass verge */
    const gr = cv(256, 128);
    const gg = gr.g;
    gg.fillStyle = '#33402c'; gg.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 1800; i++) {
      const x = Math.random() * 256, y = Math.random() * 128;
      gg.strokeStyle = Math.random() > .5 ? 'rgba(120,150,90,.35)' : 'rgba(40,60,36,.6)';
      gg.lineWidth = 1;
      gg.beginPath(); gg.moveTo(x, y); gg.lineTo(x + (Math.random() - .5) * 4, y - 3 - Math.random() * 5); gg.stroke();
    }
    P.grass = gr.c;
  }

  /* ============================== pickups ================================ */
  function buildPickups() {
    const P = A.img;

    P.pu_ammo = simpleProp(76, 56, (g, w, h) => {
      const b = g.createLinearGradient(0, 10, 0, h);
      b.addColorStop(0, '#5e6b4a'); b.addColorStop(.5, '#44502f'); b.addColorStop(1, '#232b18');
      g.fillStyle = b;
      g.fillRect(6, 16, w - 12, h - 20);
      g.fillStyle = '#697744';
      g.fillRect(2, 8, w - 4, 12);
      g.fillStyle = 'rgba(255,255,255,.18)';
      g.fillRect(2, 8, w - 4, 3);
      g.fillStyle = '#2a2f1c';
      g.fillRect(w / 2 - 12, 2, 24, 8);
      g.fillStyle = '#d9c47a';
      g.font = 'bold 13px Arial'; g.textAlign = 'center';
      g.fillText('7.62', w / 2, h - 12);
      /* loose rounds on top */
      for (let i = 0; i < 3; i++) {
        g.fillStyle = '#d4a53f';
        g.fillRect(12 + i * 9, 2, 5, 9);
        g.fillStyle = '#f0d58a';
        g.fillRect(12 + i * 9, 0, 5, 3);
      }
    });

    P.pu_fuel = simpleProp(64, 80, (g, w, h) => {
      const b = g.createLinearGradient(6, 0, w - 6, 0);
      b.addColorStop(0, '#e04a35'); b.addColorStop(.35, '#b22a1c'); b.addColorStop(1, '#661209');
      g.fillStyle = b;
      g.fillRect(8, 18, w - 16, h - 22);
      g.fillStyle = '#8d1d12';
      g.fillRect(20, 8, 16, 12);                 /* cap */
      g.fillStyle = '#3a3f46';
      g.fillRect(w - 22, 22, 10, 26);            /* spout */
      g.strokeStyle = '#33383f'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(16, 20); g.quadraticCurveTo(28, 2, 40, 20); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.22)';
      g.fillRect(12, 22, 6, h - 30);
      g.fillStyle = '#f2d98a';
      g.font = 'bold 12px Arial'; g.textAlign = 'center';
      g.fillText('FUEL', w / 2 - 2, h - 20);
    });

    P.pu_med = simpleProp(76, 60, (g, w, h) => {
      const b = g.createLinearGradient(0, 8, 0, h);
      b.addColorStop(0, '#f4f2ec'); b.addColorStop(.5, '#dcd8ce'); b.addColorStop(1, '#a7a29a');
      g.fillStyle = b;
      g.fillRect(6, 12, w - 12, h - 16);
      g.fillStyle = '#c9c4ba';
      g.fillRect(2, 6, w - 4, 10);
      g.fillStyle = '#3b3f46';
      g.fillRect(w / 2 - 10, 0, 20, 7);
      g.fillStyle = '#c9291d';
      g.fillRect(w / 2 - 5, 22, 10, 26);
      g.fillRect(w / 2 - 16, 33, 32, 10);
      g.fillStyle = 'rgba(255,255,255,.3)';
      g.fillRect(6, 12, w - 12, 3);
    });

    P.pu_bomb = simpleProp(84, 62, (g, w, h) => {
      for (let i = 0; i < 4; i++) {
        const x = 8 + i * 17;
        const b = g.createLinearGradient(x, 0, x + 15, 0);
        b.addColorStop(0, '#b4432a'); b.addColorStop(.4, '#8d2c18'); b.addColorStop(1, '#4d1408');
        g.fillStyle = b;
        g.fillRect(x, 18, 15, h - 26);
        g.fillStyle = 'rgba(255,235,200,.85)';
        g.fillRect(x, 26, 15, 7);
      }
      g.fillStyle = '#2b2f36';
      g.fillRect(4, 34, w - 8, 8);               /* tape */
      g.strokeStyle = '#d8c04a'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(20, 18); g.quadraticCurveTo(40, 2, 64, 12); g.stroke();
      g.fillStyle = '#2f3340';
      g.fillRect(58, 8, 18, 14);                 /* detonator */
      g.fillStyle = '#ff4a3a';
      g.beginPath(); g.arc(67, 12, 3, 0, 6.283); g.fill();
    });
  }

  /* =============================== vehicles ============================== */
  /* Side-view car built from a body path + glass + wheels, with three damage
     states. Types differ in silhouette, palette and extras (lightbar, roof). */
  const CAR_TYPES = {
    sedan: { w: 360, h: 150, roof: [.28, .72], roofH: 52, colors: ['#5a6068', '#2f3f57', '#6d3a32', '#3d4a40', '#7a7d82'] },
    suv: { w: 390, h: 178, roof: [.22, .80], roofH: 70, colors: ['#3a3f45', '#22303f', '#4a3a30', '#58606a'] },
    police: { w: 370, h: 152, roof: [.28, .74], roofH: 54, colors: ['#1b2436'], police: true },
    van: { w: 420, h: 190, roof: [.16, .92], roofH: 86, colors: ['#d8d4cb', '#b9bcc0'], van: true },
    taxi: { w: 362, h: 152, roof: [.28, .72], roofH: 54, colors: ['#e0a91e'], taxi: true },
    pickup: { w: 400, h: 166, roof: [.24, .58], roofH: 58, colors: ['#3c4a3a', '#5b4736', '#42484f'], bed: true }
  };

  function drawCar(g, type, W, H, color, state) {
    const t = CAR_TYPES[type];
    const groundY = H - 6;
    const bodyTop = H - t.roofH - 74;
    const wheelR = type === 'suv' || type === 'pickup' ? 34 : 29;
    const wx1 = W * 0.22, wx2 = W * 0.79;

    /* ---------- body ---------- */
    g.beginPath();
    g.moveTo(8, groundY - 26);
    g.quadraticCurveTo(4, bodyTop + 30, 26, bodyTop + 22);
    if (t.van) {
      g.lineTo(30, bodyTop - t.roofH + 8);
      g.quadraticCurveTo(34, bodyTop - t.roofH - 4, 54, bodyTop - t.roofH - 4);
      g.lineTo(W - 30, bodyTop - t.roofH - 2);
      g.quadraticCurveTo(W - 8, bodyTop - t.roofH + 4, W - 6, bodyTop + 30);
    } else {
      g.lineTo(W * t.roof[0] - 6, bodyTop + 16);
      g.quadraticCurveTo(W * t.roof[0] + 14, bodyTop - t.roofH, W * (t.roof[0] + .12), bodyTop - t.roofH);
      g.lineTo(W * (t.roof[1] - .08), bodyTop - t.roofH - 2);
      g.quadraticCurveTo(W * t.roof[1] + 22, bodyTop - t.roofH + 4, W * t.roof[1] + 34, bodyTop + 16);
      if (t.bed) {
        g.lineTo(W * t.roof[1] + 36, bodyTop + 6);
        g.lineTo(W - 10, bodyTop + 6);
        g.lineTo(W - 6, bodyTop + 34);
      } else {
        g.quadraticCurveTo(W - 14, bodyTop + 22, W - 6, bodyTop + 34);
      }
    }
    g.quadraticCurveTo(W - 2, groundY - 34, W - 12, groundY - 22);
    g.lineTo(12, groundY - 22);
    g.closePath();

    const body = g.createLinearGradient(0, bodyTop - t.roofH, 0, groundY);
    body.addColorStop(0, CR.shade(color, 1.55));
    body.addColorStop(.26, CR.shade(color, 1.12));
    body.addColorStop(.52, color);
    body.addColorStop(.72, CR.shade(color, .62));
    body.addColorStop(1, CR.shade(color, .34));
    g.fillStyle = body;
    g.fill();
    g.save();
    g.clip();
    /* horizon reflection band — the single biggest "this is car paint" cue */
    const refl = g.createLinearGradient(0, bodyTop + 4, 0, bodyTop + 52);
    refl.addColorStop(0, 'rgba(255,214,170,.34)');
    refl.addColorStop(.35, 'rgba(255,170,120,.12)');
    refl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = refl; g.fillRect(0, bodyTop, W, 60);
    /* lower body shadow + road grime */
    const grime = g.createLinearGradient(0, groundY - 60, 0, groundY);
    grime.addColorStop(0, 'rgba(20,18,16,0)');
    grime.addColorStop(1, 'rgba(20,18,16,.55)');
    g.fillStyle = grime; g.fillRect(0, groundY - 60, W, 60);
    /* door seams */
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(W * .44, bodyTop + 4); g.lineTo(W * .44, groundY - 26); g.stroke();
    g.beginPath(); g.moveTo(W * .70, bodyTop + 4); g.lineTo(W * .70, groundY - 26); g.stroke();
    if (t.taxi) {
      g.fillStyle = '#1b1b1f';
      for (let i = 0; i < 5; i++) g.fillRect(W * .30 + i * 22, bodyTop + 44, 11, 11);
      g.fillStyle = '#f5f2e8';
      for (let i = 0; i < 5; i++) g.fillRect(W * .30 + i * 22 + 11, bodyTop + 44, 11, 11);
    }
    if (t.police) {
      g.fillStyle = '#e9e7e0';
      g.beginPath();
      g.moveTo(W * .26, bodyTop + 20); g.lineTo(W * .78, bodyTop + 16);
      g.lineTo(W * .78, groundY - 26); g.lineTo(W * .26, groundY - 26);
      g.closePath(); g.fill();
      g.fillStyle = '#1b2436';
      g.font = 'bold 34px Arial'; g.textAlign = 'center';
      g.fillText('POLICE', W * .52, groundY - 46);
      g.fillStyle = '#9aa4b4';
      g.beginPath(); g.arc(W * .32, groundY - 64, 17, 0, 6.283); g.fill();
    }
    g.restore();

    /* ---------- glass ---------- */
    function glass(x0, x1, top, bottom, lean) {
      g.beginPath();
      g.moveTo(x0 + lean, top);
      g.lineTo(x1 - lean * .6, top);
      g.lineTo(x1, bottom);
      g.lineTo(x0, bottom);
      g.closePath();
      const gg2 = g.createLinearGradient(x0, top, x1, bottom);
      gg2.addColorStop(0, 'rgba(120,150,180,.75)');
      gg2.addColorStop(.35, 'rgba(40,58,78,.92)');
      gg2.addColorStop(.75, 'rgba(18,26,38,.95)');
      gg2.addColorStop(1, 'rgba(60,80,104,.8)');
      g.fillStyle = gg2; g.fill();
      g.save(); g.clip();
      g.fillStyle = 'rgba(255,206,160,.30)';
      g.beginPath();
      g.moveTo(x0 - 20, bottom); g.lineTo(x0 + (x1 - x0) * .55, top - 10);
      g.lineTo(x0 + (x1 - x0) * .8, top - 10); g.lineTo(x0 + 10, bottom);
      g.closePath(); g.fill();
      g.restore();
      g.strokeStyle = 'rgba(10,12,16,.8)'; g.lineWidth = 3;
      g.stroke();
    }
    const gTop = bodyTop - t.roofH + (t.van ? 6 : 4);
    const gBot = bodyTop + 14;
    if (t.van) {
      glass(W * .10, W * .30, gTop + 6, gBot, 4);
      glass(W * .34, W * .60, gTop + 6, gBot, 2);
    } else {
      glass(W * (t.roof[0] + .02), W * .46, gTop, gBot, 12);
      glass(W * .49, W * (t.roof[1] - .02), gTop, gBot, 4);
    }

    /* ---------- lights, trim, plate ---------- */
    const hg = g.createRadialGradient(W - 16, bodyTop + 40, 2, W - 16, bodyTop + 40, 26);
    hg.addColorStop(0, 'rgba(255,246,214,.95)');
    hg.addColorStop(.4, 'rgba(255,226,160,.5)');
    hg.addColorStop(1, 'rgba(255,210,140,0)');
    g.fillStyle = hg;
    g.beginPath(); g.arc(W - 16, bodyTop + 40, 26, 0, 6.283); g.fill();
    g.fillStyle = '#c8342a';
    g.fillRect(8, bodyTop + 32, 14, 16);
    g.fillStyle = 'rgba(255,255,255,.2)';
    g.fillRect(8, bodyTop + 32, 14, 4);
    g.fillStyle = '#b9bec4';
    g.fillRect(W - 60, groundY - 34, 34, 14);
    g.fillStyle = '#2b2f36';
    g.fillRect(W - 57, groundY - 31, 28, 8);

    if (t.police) {
      /* roof lightbar */
      g.fillStyle = '#15181f';
      g.fillRect(W * .40, gTop - 16, 92, 12);
      const rb = g.createRadialGradient(W * .43, gTop - 12, 1, W * .43, gTop - 12, 30);
      rb.addColorStop(0, 'rgba(255,60,60,.95)'); rb.addColorStop(1, 'rgba(255,40,40,0)');
      g.fillStyle = rb;
      g.beginPath(); g.arc(W * .43, gTop - 12, 30, 0, 6.283); g.fill();
      const bb = g.createRadialGradient(W * .40 + 74, gTop - 12, 1, W * .40 + 74, gTop - 12, 30);
      bb.addColorStop(0, 'rgba(70,130,255,.95)'); bb.addColorStop(1, 'rgba(50,110,255,0)');
      g.fillStyle = bb;
      g.beginPath(); g.arc(W * .40 + 74, gTop - 12, 30, 0, 6.283); g.fill();
    }

    /* ---------- wheels ---------- */
    function wheel(x) {
      g.fillStyle = '#0f1114';
      g.beginPath(); g.arc(x, groundY - wheelR + 4, wheelR, 0, 6.283); g.fill();
      const rim = g.createRadialGradient(x - 6, groundY - wheelR - 2, 2, x, groundY - wheelR + 4, wheelR * .62);
      rim.addColorStop(0, '#b9bfc6'); rim.addColorStop(.6, '#767c85'); rim.addColorStop(1, '#3a3e45');
      g.fillStyle = rim;
      g.beginPath(); g.arc(x, groundY - wheelR + 4, wheelR * .62, 0, 6.283); g.fill();
      g.fillStyle = '#23262b';
      for (let i = 0; i < 5; i++) {
        g.save();
        g.translate(x, groundY - wheelR + 4);
        g.rotate(i * 1.2566);
        g.fillRect(-3, -wheelR * .5, 6, wheelR * .34);
        g.restore();
      }
      g.fillStyle = 'rgba(255,255,255,.25)';
      g.beginPath(); g.arc(x - wheelR * .2, groundY - wheelR - 4, wheelR * .16, 0, 6.283); g.fill();
    }
    /* wheel arch shadow */
    g.fillStyle = 'rgba(0,0,0,.55)';
    [wx1, wx2].forEach((x) => {
      g.beginPath(); g.arc(x, groundY - wheelR + 4, wheelR + 7, Math.PI, 0); g.fill();
    });
    wheel(wx1); wheel(wx2);

    /* ---------- damage states ---------- */
    if (state === 'damaged' || state === 'destroyed') {
      g.save();
      g.globalAlpha = .85;
      g.fillStyle = 'rgba(24,20,18,.75)';
      for (let i = 0; i < 14; i++) {
        const x = M.hash(i, 111) * W, y = bodyTop + M.hash(i, 112) * (groundY - bodyTop);
        g.beginPath();
        g.ellipse(x, y, 8 + M.hash(i, 113) * 26, 5 + M.hash(i, 114) * 14, M.hash(i, 115) * 3, 0, 6.283);
        g.fill();
      }
      /* broken glass */
      g.fillStyle = 'rgba(160,190,210,.35)';
      g.fillRect(W * .30, gTop + 4, W * .18, gBot - gTop - 6);
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1.4;
      for (let i = 0; i < 10; i++) {
        g.beginPath();
        g.moveTo(W * .33 + M.hash(i, 116) * 60, gTop + 6);
        g.lineTo(W * .30 + M.hash(i, 117) * 70, gBot - 4);
        g.stroke();
      }
      g.restore();
    }
    if (state === 'destroyed') {
      g.save();
      g.globalCompositeOperation = 'source-atop';
      const burn = g.createLinearGradient(0, bodyTop - t.roofH, 0, groundY);
      burn.addColorStop(0, 'rgba(16,14,14,.92)');
      burn.addColorStop(.6, 'rgba(26,20,18,.86)');
      burn.addColorStop(1, 'rgba(10,9,9,.95)');
      g.fillStyle = burn; g.fillRect(0, 0, W, H);
      g.restore();
      /* glowing embers inside the shell */
      g.fillStyle = 'rgba(255,120,40,.35)';
      for (let i = 0; i < 8; i++) {
        const x = 40 + M.hash(i, 121) * (W - 80), y = bodyTop + 20 + M.hash(i, 122) * 60;
        g.beginPath(); g.arc(x, y, 4 + M.hash(i, 123) * 9, 0, 6.283); g.fill();
      }
    }
  }

  function buildCars() {
    Object.keys(CAR_TYPES).forEach((type) => {
      const t = CAR_TYPES[type];
      A.cars[type] = t.colors.map((col) => {
        const variants = {};
        ['clean', 'damaged', 'destroyed'].forEach((state) => {
          const { c, g } = cv(t.w, t.h);
          drawCar(g, type, t.w, t.h, col, state);
          variants[state] = c;
        });
        variants.w = t.w; variants.h = t.h;
        return variants;
      });
    });
  }

  /* ============================== build all ============================== */
  A.build = function () {
    A.img.sky = buildSky(1920, 1080);
    A.img.clouds = buildClouds(2400, 520);
    A.img.skyline = buildSkyline(2400, 520);
    A.img.treeline = buildTreeLine(2200, 420);
    buildProps();
    buildGround();
    buildPickups();
    buildCars();
    for (let i = 0; i < 7; i++) {
      A.houses.push(buildHouse(i + 1, 660 + ((i % 3) * 90), 560 + ((i % 4) * 60)));
    }
    A.ready = true;
    return A;
  };
})();

/* =============================================================================
 *  art.js — весь пиксель-арт генерируется кодом в спрайт-листы при загрузке.
 *  Один «конструктор человечка» + палитры дают маньяка, прохожих, копов и босса.
 *  Единицы рисования — пиксели арта (1 юнит = 1 «жирный» пиксель, масштаб S).
 * ========================================================================== */
(function () {
  'use strict';
  const CR = window.CR, U = CR.Utils;
  const TAU = Math.PI * 2;

  const Art = CR.Art = {
    S: 3,                 // масштаб пикселя
    sheets: {},
    FW: 22, FH: 28        // размер кадра человечка в юнитах арта
  };

  /* ---------------------------- базовые примитивы ---------------------------- */
  function r(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }

  function shade(hex, k) {           // затемнение/осветление #rrggbb
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => U.clamp(Math.round(v * k), 0, 255);
    return 'rgb(' + f((n >> 16) & 255) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')';
  }

  /* Создаёт спрайт-лист: n кадров, каждый fw x fh юнитов арта. */
  Art.sheet = function (name, fw, fh, n, drawFrame) {
    const S = Art.S;
    const { canvas, g } = CR.makeCanvas(fw * S * n, fh * S);
    for (let i = 0; i < n; i++) {
      g.save();
      g.translate(i * fw * S, 0);
      g.scale(S, S);
      drawFrame(g, i);
      g.restore();
    }
    const sh = { canvas, fw: fw * S, fh: fh * S, n, name };
    Art.sheets[name] = sh;
    return sh;
  };

  /* Рисует кадр: (x, y) — точка «под ногами по центру». */
  Art.draw = function (g, sheet, frame, x, y, flip, scale, alpha) {
    if (!sheet) return;
    const f = ((frame | 0) % sheet.n + sheet.n) % sheet.n;
    const s = scale || 1, w = sheet.fw * s, h = sheet.fh * s;
    g.save();
    if (alpha !== undefined) g.globalAlpha = alpha;
    g.translate(Math.round(x), Math.round(y));
    if (flip) g.scale(-1, 1);
    g.drawImage(sheet.canvas, f * sheet.fw, 0, sheet.fw, sheet.fh,
      Math.round(-w / 2), Math.round(-h), w, h);
    g.restore();
  };

  /* Отрисовка «вспышки от попадания»: спрайт заливается цветом через
     отдельный буфер (source-atop), чтобы не плодить второй набор листов. */
  let scratch = null;
  Art.drawFlash = function (g, sheet, frame, x, y, flip, scale, color, amount) {
    if (!sheet) return;
    if (!scratch || scratch.canvas.width < sheet.fw || scratch.canvas.height < sheet.fh) {
      scratch = CR.makeCanvas(Math.max(sheet.fw, 128), Math.max(sheet.fh, 128));
    }
    const sg = scratch.g, sc = scratch.canvas;
    const f = ((frame | 0) % sheet.n + sheet.n) % sheet.n;
    sg.clearRect(0, 0, sc.width, sc.height);
    sg.drawImage(sheet.canvas, f * sheet.fw, 0, sheet.fw, sheet.fh, 0, 0, sheet.fw, sheet.fh);
    sg.globalCompositeOperation = 'source-atop';
    sg.globalAlpha = U.clamp(amount, 0, 1);
    sg.fillStyle = color || '#ffffff';
    sg.fillRect(0, 0, sheet.fw, sheet.fh);
    sg.globalAlpha = 1;
    sg.globalCompositeOperation = 'source-over';
    const s = scale || 1, w = sheet.fw * s, h = sheet.fh * s;
    g.save();
    g.translate(Math.round(x), Math.round(y));
    if (flip) g.scale(-1, 1);
    g.drawImage(sc, 0, 0, sheet.fw, sheet.fh, Math.round(-w / 2), Math.round(-h), w, h);
    g.restore();
  };

  /* ------------------------------- человечек ------------------------------- */
  /* p — палитра: {skin, top, low, boot, head, headColor, accent} */
  function limb(g, x, y, dx, len, w, c, cDark) {
    const half = len / 2;
    r(g, x + dx * 0.45 - w / 2, y, w, half + 0.5, c);
    r(g, x + dx - w / 2, y + half, w, half, cDark);
  }

  function head(g, p, cx, top) {
    const s = p.skin;
    if (p.head === 'mask') {
      /* хоккейная маска: белая пластина с красными потёками и дырками */
      r(g, cx - 4, top, 8, 7, '#efe7d8');
      r(g, cx - 4, top, 8, 1, '#cfc5b2');
      r(g, cx - 3, top + 2, 2, 2, '#221a1a');
      r(g, cx + 1, top + 2, 2, 2, '#221a1a');
      r(g, cx - 1, top + 5, 2, 1, '#221a1a');
      r(g, cx + 2, top + 1, 1, 4, '#c4232a');
      r(g, cx - 4, top + 6, 8, 1, '#b9182a');
      r(g, cx - 5, top + 1, 1, 5, p.accent);
      r(g, cx + 4, top + 1, 1, 5, p.accent);
    } else if (p.head === 'cap') {
      r(g, cx - 3, top + 1, 7, 6, s);
      r(g, cx - 4, top, 9, 2, p.headColor);
      r(g, cx - 5, top + 1, 3, 1, shade(p.headColor, 0.8));
      r(g, cx - 2, top + 3, 1, 1, '#2a1c18');
      r(g, cx + 1, top + 3, 1, 1, '#2a1c18');
    } else if (p.head === 'helmet') {
      r(g, cx - 3, top + 2, 7, 5, s);
      r(g, cx - 4, top, 9, 3, p.headColor);
      r(g, cx - 4, top + 3, 9, 1, shade(p.headColor, 1.25));
      r(g, cx - 3, top + 4, 6, 1, '#1b1410');
    } else { /* волосы */
      r(g, cx - 3, top + 1, 7, 6, s);
      r(g, cx - 4, top, 9, 2, p.headColor);
      r(g, cx - 4, top + 2, 1, 2, p.headColor);
      r(g, cx - 2, top + 3, 1, 1, '#2a1c18');
      r(g, cx + 1, top + 3, 1, 1, '#2a1c18');
    }
  }

  /* Базовое тело. pose: {legPhase, lean, crouch, armF, armB, mouth} */
  function body(g, p, pose) {
    const cx = 11;
    const crouch = pose.crouch || 0;
    const base = 28;
    const hip = 18 + crouch;
    const topY = 9 + crouch;
    const headY = 2 + crouch;
    const ph = pose.legPhase || 0;
    const sw = Math.sin(ph * TAU) * 3.2;
    const legLen = base - hip;

    const lowD = shade(p.low, 0.72), topD = shade(p.top, 0.74), skinD = shade(p.skin, 0.78);

    /* дальняя нога и рука */
    limb(g, cx - 1, hip, -sw, legLen, 3, lowD, shade(p.low, 0.6));
    r(g, cx - 1 - sw - 2, base - 1.5, 4, 1.5, shade(p.boot, 0.75));

    /* торс */
    r(g, cx - 4, topY, 9, hip - topY + 1, p.top);
    r(g, cx - 4, topY, 9, 1.5, shade(p.top, 1.2));
    r(g, cx - 4, hip - 1.5, 9, 1.5, topD);
    if (p.vest) {                     /* бронежилет */
      r(g, cx - 4.5, topY + 1.5, 10, 5.5, p.vest);
      r(g, cx - 4.5, topY + 1.5, 10, 1, shade(p.vest, 1.3));
      r(g, cx - 0.5, topY + 1.5, 1, 5.5, shade(p.vest, 0.7));
    }
    /* ближняя нога */
    limb(g, cx + 1, hip, sw, legLen, 3, p.low, lowD);
    r(g, cx + 1 + sw - 2, base - 1.5, 4, 1.5, p.boot);

    /* голова */
    head(g, p, cx, headY);
    r(g, cx - 2, topY - 1.5, 4, 1.5, skinD);   /* шея */

    return { cx, topY, hip, base };
  }

  function armBack(g, p, m, ang, len) {
    const sx = m.cx - 3.5, sy = m.topY + 1.5;
    g.save(); g.translate(sx, sy); g.rotate(ang);
    r(g, -1.5, 0, 3, len || 7, shade(p.top, 0.62));
    r(g, -1.5, (len || 7) - 2, 3, 2, shade(p.skin, 0.75));
    g.restore();
  }
  function armFront(g, p, m, ang, len, hand) {
    const sx = m.cx + 3, sy = m.topY + 1.5;
    g.save(); g.translate(sx, sy); g.rotate(ang);
    r(g, -1.5, 0, 3, len || 7, p.top);
    r(g, -1.5, (len || 7) - 2, 3, 2, p.skin);
    if (hand) { g.translate(0, len || 7); hand(g); }
    g.restore();
  }

  /* ------------------------------- бензопила ------------------------------- */
  function chainsaw(g, spin) {
    /* мотор */
    r(g, -3, -2, 6, 6, '#d8582a');
    r(g, -3, -2, 6, 1.5, '#f08040');
    r(g, -2, 4, 4, 1.5, '#3a3a44');
    r(g, 2.5, -1, 2, 3, '#2f2f38');
    /* шина */
    r(g, 3, -1.5, 12, 3.5, '#b9c0cc');
    r(g, 3, -1.5, 12, 1, '#e6ecf5');
    r(g, 14.5, -1.5, 1.5, 3.5, '#b9c0cc');
    /* зубья цепи — бегут при вращении */
    g.fillStyle = '#fde24f';
    for (let i = 0; i < 7; i++) {
      const x = 4 + ((i * 2 + (spin | 0) * 1) % 12);
      g.fillRect(x, -2.4, 1, 1);
      g.fillRect(x + 1, 2, 1, 1);
    }
    /* брызги крови на шине */
    r(g, 7, 0, 1, 1, '#c4232a');
    r(g, 11, 1, 1, 1, '#8f1520');
  }

  function pistol(g) {
    r(g, 0, -1, 6, 2.5, '#33363f');
    r(g, 5, -0.6, 2, 1.4, '#4a4e58');
    r(g, 0.5, 1.5, 2, 3, '#22252c');
  }
  function shotgun(g) {
    r(g, 0, -1, 11, 2.2, '#3a3038');
    r(g, 0, 1.2, 5, 2, '#6b4a2a');
    r(g, 10, -1.2, 1.5, 2.6, '#5a5560');
  }

  /* ------------------------------- палитры -------------------------------- */
  const PAL = Art.PAL = {
    player: { skin: '#e8b088', top: '#2f3550', low: '#22263a', boot: '#141726', head: 'mask', headColor: '#efe7d8', accent: '#c4232a' },
    civ: [
      { skin: '#f0c09a', top: '#39c0d8', low: '#3b4a8c', boot: '#2a2a33', head: 'hair', headColor: '#4a2f1c' },
      { skin: '#c98a5c', top: '#f2e14c', low: '#7a4bb5', boot: '#3a2a22', head: 'hair', headColor: '#1c1a18' },
      { skin: '#ffd3a8', top: '#ff7bb0', low: '#2f8f5b', boot: '#442a2a', head: 'hair', headColor: '#d9a02c' },
      { skin: '#d99a6c', top: '#f06a3a', low: '#324054', boot: '#22242c', head: 'cap', headColor: '#2e7fd8' }
    ],
    cop: { skin: '#e8b088', top: '#2a4a93', low: '#1f2e55', boot: '#14161f', head: 'cap', headColor: '#13234a', vest: '#101a33' },
    boss: { skin: '#c98a5c', top: '#3b3f46', low: '#2a2d33', boot: '#15171b', head: 'helmet', headColor: '#4d5560', vest: '#5c6270' }
  };

  /* --------------------------- сборка спрайт-листов -------------------------- */
  Art.build = function () {
    const P = PAL.player;

    /* бег: 8 кадров, пила слегка покачивается у пояса */
    Art.sheet('player_run', Art.FW, Art.FH, 8, (g, i) => {
      const ph = i / 8;
      const bob = Math.abs(Math.cos(ph * TAU)) * 1.1;
      g.save(); g.translate(0, -bob);
      const m = body(g, P, { legPhase: ph });
      armBack(g, P, m, -0.5 + Math.sin(ph * TAU) * 0.7);
      armFront(g, P, m, 1.15 + Math.sin(ph * TAU + 2) * 0.25, 6,
        (gg) => { gg.rotate(-1.0); chainsaw(gg, i); });
      g.restore();
    });

    /* прыжок: 2 кадра (взлёт / падение) */
    Art.sheet('player_jump', Art.FW, Art.FH, 2, (g, i) => {
      const m = body(g, P, { legPhase: i ? 0.1 : 0.62, crouch: i ? 0 : 1 });
      armBack(g, P, m, i ? 0.9 : -1.4);
      armFront(g, P, m, i ? 1.5 : 0.55, 6, (gg) => { gg.rotate(-0.8); chainsaw(gg, i * 2); });
    });

    /* подкат */
    Art.sheet('player_slide', Art.FW, Art.FH, 2, (g, i) => {
      g.save();
      g.translate(11, 28); g.rotate(-1.15); g.translate(-11, -28);
      g.translate(-3, 8);
      const m = body(g, P, { legPhase: 0.25, crouch: 1 });
      armBack(g, P, m, 1.9);
      armFront(g, P, m, 2.2, 6, (gg) => { gg.rotate(-0.4); chainsaw(gg, i * 3); });
      g.restore();
    });

    /* удар пилой: замах -> проводка -> возврат */
    const swing = [-0.9, 0.25, 1.15, 0.6];
    Art.sheet('player_saw', Art.FW, Art.FH, 4, (g, i) => {
      const m = body(g, P, { legPhase: 0.1 + i * 0.05, crouch: i === 2 ? 1 : 0 });
      armBack(g, P, m, -0.8 + i * 0.2);
      armFront(g, P, m, 1.3 + swing[i], 6, (gg) => { gg.rotate(-0.5); chainsaw(gg, i * 2); });
    });

    /* выстрел: рука с пистолетом вперёд */
    Art.sheet('player_shoot', Art.FW, Art.FH, 2, (g, i) => {
      const m = body(g, P, { legPhase: 0.05 });
      armBack(g, P, m, 1.3, 6, null);
      armFront(g, P, m, Math.PI / 2 + (i ? 0.12 : 0), 6, (gg) => { gg.rotate(-Math.PI / 2); pistol(gg); });
      if (i) { r(g, 21, 11, 1.5, 1.5, '#ffe9a0'); }
    });

    /* смерть — кувырок; крутится уже в коде отрисовки */
    Art.sheet('player_dead', Art.FW, Art.FH, 1, (g) => {
      const m = body(g, PAL.player, { legPhase: 0.25, crouch: 2 });
      armBack(g, P, m, -2.3);
      armFront(g, P, m, 2.6, 6, null);
      r(g, 6, 6, 10, 2, '#c4232a');
    });

    /* прохожие — 4 палитры, паническая пробежка с поднятыми руками */
    PAL.civ.forEach((pal, k) => {
      Art.sheet('civ' + k, Art.FW, Art.FH, 6, (g, i) => {
        const ph = i / 6;
        const bob = Math.abs(Math.cos(ph * TAU)) * 1.4;
        g.save(); g.translate(0, -bob);
        const m = body(g, pal, { legPhase: ph });
        armBack(g, pal, m, -2.6 + Math.sin(ph * TAU) * 0.35);
        armFront(g, pal, m, 2.6 - Math.sin(ph * TAU) * 0.35, 7, null);
        g.restore();
      });
    });

    /* полицейский: бег и стойка со стрельбой */
    Art.sheet('cop_run', Art.FW, Art.FH, 6, (g, i) => {
      const ph = i / 6;
      const m = body(g, PAL.cop, { legPhase: ph });
      armBack(g, PAL.cop, m, -0.6 + Math.sin(ph * TAU) * 0.8);
      armFront(g, PAL.cop, m, 0.9 + Math.sin(ph * TAU + 2) * 0.3, 7, (gg) => { gg.rotate(-0.9); pistol(gg); });
    });
    Art.sheet('cop_aim', Art.FW, Art.FH, 2, (g, i) => {
      const m = body(g, PAL.cop, { legPhase: 0 });
      armBack(g, PAL.cop, m, 1.2, 6, null);
      armFront(g, PAL.cop, m, -Math.PI / 2, 6, (gg) => { gg.rotate(Math.PI / 2); gg.scale(-1, 1); pistol(gg); });
      if (i) r(g, 0, 11, 2, 2, '#ffe9a0');
    });

    /* босс в броне: крупнее, с дробовиком */
    Art.sheet('boss_run', Art.FW, Art.FH, 6, (g, i) => {
      const ph = i / 6;
      const m = body(g, PAL.boss, { legPhase: ph });
      armBack(g, PAL.boss, m, -0.5 + Math.sin(ph * TAU) * 0.7);
      armFront(g, PAL.boss, m, 1.0 + Math.sin(ph * TAU + 2) * 0.25, 7, (gg) => { gg.rotate(-1.0); shotgun(gg); });
    });
    Art.sheet('boss_aim', Art.FW, Art.FH, 2, (g, i) => {
      const m = body(g, PAL.boss, { legPhase: 0 });
      armBack(g, PAL.boss, m, 1.3, 6, null);
      armFront(g, PAL.boss, m, -Math.PI / 2 - 0.15, 7, (gg) => { gg.rotate(Math.PI / 2); gg.scale(-1, 1); shotgun(gg); });
      if (i) { r(g, -2, 10, 4, 3, '#ffd166'); r(g, -4, 11, 2, 1, '#ff9d3a'); }
    });

    /* собака: 4 кадра галопа */
    Art.sheet('dog', 26, 16, 4, (g, i) => {
      const ph = i / 4, sw = Math.sin(ph * TAU) * 3;
      const body1 = '#4a3326', dark = '#38251b', light = '#63442f';
      const y = 4 + Math.abs(Math.cos(ph * TAU)) * 0.8;
      r(g, 5, y + 1, 13, 6, body1);            /* корпус */
      r(g, 5, y + 1, 13, 1.5, light);
      r(g, 16, y - 2, 7, 6, body1);            /* голова */
      r(g, 21, y + 1, 4, 3, dark);             /* морда */
      r(g, 22, y + 2, 3, 1.2, '#c4232a');      /* пасть */
      r(g, 18, y - 1, 1.5, 1.5, '#ffe14c');    /* глаз */
      r(g, 16, y - 4, 2, 3, dark);             /* ухо */
      r(g, 2, y, 4, 2, body1); r(g, 0, y - 2, 3, 3, body1);  /* хвост */
      /* лапы */
      r(g, 6 + sw, y + 6, 2.5, 6 - Math.abs(sw) * 0.3, dark);
      r(g, 14 - sw, y + 6, 2.5, 6 - Math.abs(sw) * 0.3, body1);
      r(g, 9 - sw, y + 6, 2.5, 6 - Math.abs(sw) * 0.3, dark);
      r(g, 17 + sw, y + 6, 2.5, 6 - Math.abs(sw) * 0.3, body1);
    });

    /* машины на дороге — 3 варианта кузова */
    const cars = [
      { b: '#e04a3c', t: '#ffd9d3' }, { b: '#3fa9e0', t: '#d9f0ff' }, { b: '#f2c33d', t: '#fff4cf' }
    ];
    cars.forEach((c, k) => {
      Art.sheet('car' + k, 46, 22, 1, (g) => {
        r(g, 1, 9, 44, 9, c.b);
        r(g, 1, 9, 44, 2, shade(c.b, 1.25));
        r(g, 1, 16, 44, 2, shade(c.b, 0.7));
        r(g, 10, 2, 24, 8, shade(c.b, 0.9));      /* кабина */
        r(g, 12, 3, 9, 5, c.t); r(g, 23, 3, 9, 5, c.t);
        r(g, 0, 11, 2, 4, '#ffe9a0');             /* фары */
        r(g, 44, 11, 2, 4, '#ff5a4a');
        r(g, 7, 17, 8, 5, '#1b1b22'); r(g, 31, 17, 8, 5, '#1b1b22');
        r(g, 9, 19, 4, 2, '#4a4a55'); r(g, 33, 19, 4, 2, '#4a4a55');
      });
    });

    /* подбираемые предметы: патроны, канистра, взрывчатка, аптечка */
    Art.sheet('pu_ammo', 16, 14, 1, (g) => {
      r(g, 1, 5, 14, 8, '#6b4a2a'); r(g, 1, 5, 14, 2, '#8a6238');
      for (let i = 0; i < 4; i++) { r(g, 2.5 + i * 3, 1, 2, 5, '#f2c33d'); r(g, 2.5 + i * 3, 1, 2, 1.5, '#fff0a8'); }
    });
    Art.sheet('pu_fuel', 14, 16, 1, (g) => {
      r(g, 1, 3, 12, 12, '#e04a3c'); r(g, 1, 3, 12, 2, '#ff7a63');
      r(g, 3, 0, 5, 3, '#9e2f26'); r(g, 10, 5, 3, 2, '#9e2f26');
      r(g, 4, 7, 6, 5, '#ffe9a0'); r(g, 5, 8, 4, 1, '#e04a3c');
    });
    Art.sheet('pu_bomb', 16, 16, 1, (g) => {
      r(g, 2, 5, 12, 9, '#c43a2a'); r(g, 2, 5, 12, 2, '#e8604a');
      r(g, 3, 8, 10, 3, '#f6e6c8'); r(g, 4, 9, 3, 1, '#c43a2a');
      r(g, 6, 2, 4, 3, '#3a3a44'); r(g, 7, 0, 2, 2, '#ffd166');
    });
    Art.sheet('pu_med', 16, 14, 1, (g) => {
      r(g, 1, 2, 14, 11, '#f4f6fb'); r(g, 1, 2, 14, 2, '#ffffff');
      r(g, 1, 11, 14, 2, '#c9d2e0');
      r(g, 6.5, 4, 3, 7, '#e0243a'); r(g, 4, 6.5, 8, 3, '#e0243a');
    });

    /* бомба, заложенная у дома */
    Art.sheet('bomb_set', 16, 14, 2, (g, i) => {
      r(g, 2, 5, 12, 8, i ? '#ff6a4a' : '#c43a2a');
      r(g, 3, 7, 10, 3, '#f6e6c8');
      r(g, 6, 2, 4, 3, '#3a3a44');
      r(g, 7, 0, 2, 2, i ? '#fff3b0' : '#ffd166');
    });
  };
})();

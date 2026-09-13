/* =============================================================================
 *  world.js — параллакс-фон и «география» улицы: небо, силуэт города,
 *  ряды домов, заборы, фонари, тротуар и дорога. Всё генерируется по индексу
 *  тайла (детерминированный хеш), поэтому фон бесконечен и не «прыгает».
 * ========================================================================== */
(function () {
  'use strict';
  const CR = window.CR, U = CR.Utils;
  const W = CR.W, H = CR.H, G = CR.GROUND;

  /* детерминированный «рандом» по индексу тайла */
  function rnd(i, salt) {
    let h = (i * 374761393 + (salt || 0) * 668265263) | 0;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  }

  /* ------------------------------- палитры --------------------------------- */
  const THEMES = CR.THEMES = [
    { /* 1. Пригород на рассвете */
      name: 'Пригород',
      sky: ['#2b1b4d', '#7b3b73', '#e8735f', '#ffb36b'],
      sun: '#ffd36b', sunY: 205,
      far: '#3b2a5e', mid: '#4c3470',
      houseWalls: ['#e8d7bc', '#d9b38c', '#cfe0e8', '#e6c2c2', '#cdd9b7'],
      roofs: ['#7a3b3b', '#4a4f6b', '#6b4a2f', '#3f6b5a'],
      grass: '#3f7a46', walk: '#b9b3a6', curb: '#8e8879', road: '#3a3a42',
      line: '#e8d55c', fence: '#d8cbb2', lamp: '#ffdf9a', haze: 'rgba(255,150,110,.20)'
    },
    { /* 2. Деловой центр на закате */
      name: 'Деловой центр',
      sky: ['#17123a', '#3c1f6b', '#a02f6e', '#ff7b4a'],
      sun: '#ff9d5c', sunY: 190,
      far: '#221a4a', mid: '#31235c',
      houseWalls: ['#5c6c9a', '#4f5f86', '#6b5f86', '#7a6b5c', '#566b6b'],
      roofs: ['#2f3550', '#3b2f50', '#503b2f', '#2f5046'],
      grass: '#3a5a52', walk: '#9aa0ad', curb: '#6e7482', road: '#2e3038',
      line: '#f2d84c', fence: '#8e96a8', lamp: '#9ae7ff', haze: 'rgba(120,40,120,.26)'
    },
    { /* 3. Промзона ночью */
      name: 'Промзона',
      sky: ['#06070f', '#101a33', '#1d2a4a', '#3a2f5c'],
      sun: '#cfd9ff', sunY: 140,
      far: '#0d1226', mid: '#151c36',
      houseWalls: ['#5a4f46', '#4a4f56', '#6b5a4a', '#3f4a52', '#5a5a46'],
      roofs: ['#2a2a30', '#33282a', '#22303a', '#2f2a22'],
      grass: '#2f4436', walk: '#6f7580', curb: '#4e535c', road: '#23252b',
      line: '#d8c84c', fence: '#6a7280', lamp: '#aef0ff', haze: 'rgba(30,50,110,.34)'
    }
  ];

  CR.World = class World {
    constructor(themeIndex) {
      this.T = THEMES[(themeIndex || 0) % THEMES.length];
      this.t = 0;
      this.skyCache = null;
      this.buildSky();
    }

    buildSky() {
      const T = this.T;
      const { canvas, g } = CR.makeCanvas(W, H);
      const grd = g.createLinearGradient(0, 0, 0, G);
      grd.addColorStop(0, T.sky[0]);
      grd.addColorStop(0.45, T.sky[1]);
      grd.addColorStop(0.78, T.sky[2]);
      grd.addColorStop(1, T.sky[3]);
      g.fillStyle = grd;
      g.fillRect(0, 0, W, G + 4);
      /* солнце-диск с «полосками» в духе synthwave */
      g.fillStyle = T.sun;
      g.beginPath(); g.arc(690, T.sunY, 104, 0, 6.3); g.fill();
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 8; i++) g.fillRect(560, T.sunY + 4 + i * 13, 270, 3 + i * 1.7);
      g.globalCompositeOperation = 'source-over';
      /* звёзды сверху */
      for (let i = 0; i < 70; i++) {
        const x = rnd(i, 3) * W, y = rnd(i, 4) * 210;
        g.fillStyle = 'rgba(255,255,255,' + (0.15 + rnd(i, 5) * 0.5) + ')';
        g.fillRect(x, y, 2, 2);
      }
      this.skyCache = canvas;
    }

    update(dt) { this.t += dt; }

    /* ------------------------------- небо -------------------------------- */
    drawSky(g, camX) {
      g.drawImage(this.skyCache, 0, 0);
      const T = this.T;
      /* облака — очень медленный параллакс */
      const px = camX * 0.04;
      g.globalAlpha = 0.5;
      for (let i = Math.floor(px / 420) - 1; i < Math.floor((px + W) / 420) + 2; i++) {
        const x = i * 420 + rnd(i, 11) * 180 - px;
        const y = 60 + rnd(i, 12) * 120;
        const s = 0.7 + rnd(i, 13) * 0.9;
        g.fillStyle = i % 2 ? 'rgba(255,214,180,.55)' : 'rgba(255,255,255,.35)';
        g.fillRect(x, y, 120 * s, 16 * s);
        g.fillRect(x + 24 * s, y - 12 * s, 70 * s, 14 * s);
      }
      g.globalAlpha = 1;

      /* дальний силуэт города */
      const fx = camX * 0.18;
      g.fillStyle = T.far;
      for (let i = Math.floor(fx / 90) - 1; i < Math.floor((fx + W) / 90) + 2; i++) {
        const x = i * 90 - fx;
        const h = 60 + rnd(i, 21) * 150;
        g.fillRect(x, G - 78 - h, 86, h + 80);
        g.fillStyle = 'rgba(255,220,150,.30)';
        for (let k = 0; k < 6; k++) {
          if (rnd(i * 7 + k, 22) > 0.55) g.fillRect(x + 10 + (k % 3) * 24, G - 70 - h + 14 + ((k / 3) | 0) * 26, 12, 14);
        }
        g.fillStyle = T.far;
      }

      /* средний слой — сплошной ряд крыш */
      const mx = camX * 0.36;
      g.fillStyle = T.mid;
      for (let i = Math.floor(mx / 150) - 1; i < Math.floor((mx + W) / 150) + 2; i++) {
        const x = i * 150 - mx;
        const h = 60 + rnd(i, 31) * 70;
        g.fillRect(x, G - 60 - h, 140, h + 62);
        g.beginPath();                       /* двускатная крыша */
        g.moveTo(x - 8, G - 60 - h);
        g.lineTo(x + 70, G - 60 - h - 40);
        g.lineTo(x + 148, G - 60 - h);
        g.closePath(); g.fill();
      }
    }

    /* --------------------- дома-декорации ближнего плана ------------------- */
    drawHouses(g, camX) {
      const T = this.T;
      const px = camX * 0.72;
      g.save();
      for (let i = Math.floor(px / 260) - 1; i < Math.floor((px + W) / 260) + 2; i++) {
        const x = Math.round(i * 260 - px);
        const wdt = 200 + Math.floor(rnd(i, 41) * 46);
        const hgt = 130 + Math.floor(rnd(i, 42) * 80);
        const y = G - 46 - hgt;
        const wall = T.houseWalls[Math.floor(rnd(i, 43) * T.houseWalls.length)];
        const roof = T.roofs[Math.floor(rnd(i, 44) * T.roofs.length)];
        /* корпус */
        g.fillStyle = wall; g.fillRect(x, y, wdt, hgt + 46);
        g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(x + wdt - 18, y, 18, hgt + 46);
        /* крыша */
        g.fillStyle = roof;
        g.beginPath();
        g.moveTo(x - 14, y); g.lineTo(x + wdt / 2, y - 52); g.lineTo(x + wdt + 14, y); g.closePath(); g.fill();
        g.fillRect(x - 14, y, wdt + 28, 8);
        /* окна */
        const cols = 3, rows = Math.max(1, Math.floor(hgt / 60));
        for (let c = 0; c < cols; c++) {
          for (let rw = 0; rw < rows; rw++) {
            const lit = rnd(i * 31 + c * 7 + rw, 45) > 0.62;
            g.fillStyle = lit ? '#ffdf9a' : '#3b4356';
            const wx = x + 22 + c * ((wdt - 60) / (cols - 1 || 1));
            const wy = y + 26 + rw * 56;
            g.fillRect(wx, wy, 34, 30);
            g.fillStyle = 'rgba(0,0,0,.35)';
            g.fillRect(wx + 15, wy, 3, 30); g.fillRect(wx, wy + 13, 34, 3);
          }
        }
        /* дверь и крыльцо */
        g.fillStyle = '#6b4a2a';
        g.fillRect(x + wdt / 2 - 16, G - 46 - 52, 32, 52);
        g.fillStyle = '#ffd166'; g.fillRect(x + wdt / 2 + 8, G - 46 - 28, 4, 4);
      }
      /* воздушная перспектива: ряд уходит в цвет неба */
      g.fillStyle = T.haze;
      g.fillRect(0, 0, W, G + 6);
      g.restore();
    }

    /* --------------------- земля, тротуар, дорога, заборы ------------------- */
    drawGround(g, camX) {
      const T = this.T;
      /* газон */
      g.fillStyle = T.grass; g.fillRect(0, G - 46, W, 26);
      g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(0, G - 46, W, 4);

      /* заборчик перед газоном */
      const fx = camX * 0.72;
      g.fillStyle = T.fence;
      for (let i = Math.floor(fx / 26) - 1; i < Math.floor((fx + W) / 26) + 2; i++) {
        const x = Math.round(i * 26 - fx);
        if (rnd(i, 51) > 0.12) {
          g.fillRect(x, G - 74, 7, 30);
          g.fillRect(x, G - 70, 26, 4);
          g.fillRect(x, G - 58, 26, 4);
        }
      }

      /* тротуар */
      g.fillStyle = T.walk; g.fillRect(0, G - 20, W, 20 + 26);
      g.fillStyle = 'rgba(0,0,0,.12)';
      for (let i = Math.floor(camX / 64) - 1; i < Math.floor((camX + W) / 64) + 2; i++) {
        g.fillRect(Math.round(i * 64 - camX), G - 20, 3, 46);
      }
      /* бордюр и дорога */
      g.fillStyle = T.curb; g.fillRect(0, G + 26, W, 10);
      g.fillStyle = T.road; g.fillRect(0, G + 36, W, H - G - 36);
      g.fillStyle = T.line;
      const step = 90;
      for (let i = Math.floor(camX / step) - 1; i < Math.floor((camX + W) / step) + 2; i++) {
        g.fillRect(Math.round(i * step - camX * 1.0), G + 66, 46, 6);
      }
    }

    /* ------------------------- фонари поверх сцены ------------------------- */
    drawLamps(g, camX, night) {
      const T = this.T;
      for (let i = Math.floor(camX / 340) - 1; i < Math.floor((camX + W) / 340) + 2; i++) {
        const x = Math.round(i * 340 - camX);
        g.fillStyle = '#2f3340';
        g.fillRect(x, G - 200, 8, 200);
        g.fillRect(x, G - 200, 40, 8);
        g.fillStyle = T.lamp;
        g.fillRect(x + 32, G - 198, 16, 10);
        if (night) {                              /* конус света */
          const grd = g.createLinearGradient(x + 40, G - 190, x + 40, G);
          grd.addColorStop(0, 'rgba(255,235,170,.22)');
          grd.addColorStop(1, 'rgba(255,235,170,0)');
          g.fillStyle = grd;
          g.beginPath();
          g.moveTo(x + 28, G - 188); g.lineTo(x + 52, G - 188);
          g.lineTo(x + 110, G + 6); g.lineTo(x - 30, G + 6);
          g.closePath(); g.fill();
        }
      }
    }

    /* --------------- кусты/гидранты переднего плана (быстрее камеры) -------- */
    drawFore(g, camX) {
      const px = camX * 1.22;
      for (let i = Math.floor(px / 520) - 1; i < Math.floor((px + W) / 520) + 2; i++) {
        const x = Math.round(i * 520 - px);
        const kind = Math.floor(rnd(i, 61) * 3);
        if (kind === 0) {
          g.fillStyle = '#2f5a38';
          g.fillRect(x, H - 74, 74, 40);
          g.fillStyle = '#3f7a46'; g.fillRect(x + 6, H - 84, 62, 30);
          g.fillStyle = '#58a05c'; g.fillRect(x + 14, H - 82, 24, 10);
        } else if (kind === 1) {
          g.fillStyle = '#d8342a'; g.fillRect(x, H - 66, 22, 40);
          g.fillStyle = '#f05a4a'; g.fillRect(x, H - 66, 22, 8);
          g.fillStyle = '#9e2018'; g.fillRect(x - 6, H - 56, 34, 8);
        }
      }
    }
  };
})();

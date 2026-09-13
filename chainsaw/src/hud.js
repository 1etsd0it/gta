/* =============================================================================
 *  hud.js — интерфейс поверх сцены: здоровье, бензин, патроны, взрывчатка,
 *  очки с комбо-множителем, полоса маршрута и комиксовые баннеры уровня.
 * ========================================================================== */
(function () {
  'use strict';
  const CR = window.CR, U = CR.Utils;
  const W = CR.W, H = CR.H;

  const HUD = CR.HUD = {};

  function panel(g, x, y, w, h, r) {
    g.fillStyle = 'rgba(10,8,16,.62)';
    g.strokeStyle = 'rgba(255,255,255,.16)';
    g.lineWidth = 2;
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, w, h, r || 8);
    else g.rect(x, y, w, h);
    g.fill(); g.stroke();
  }

  function bar(g, x, y, w, h, k, col, col2) {
    g.fillStyle = 'rgba(0,0,0,.55)';
    g.fillRect(x, y, w, h);
    const grd = g.createLinearGradient(x, y, x, y + h);
    grd.addColorStop(0, col2 || col);
    grd.addColorStop(1, col);
    g.fillStyle = grd;
    g.fillRect(x, y, Math.max(0, w * U.clamp(k, 0, 1)), h);
    g.fillStyle = 'rgba(255,255,255,.25)';
    g.fillRect(x, y, Math.max(0, w * U.clamp(k, 0, 1)), Math.max(1, h * 0.28));
    g.strokeStyle = 'rgba(255,255,255,.28)';
    g.lineWidth = 2;
    g.strokeRect(x, y, w, h);
  }

  function label(g, text, x, y, size, color, align) {
    g.font = '900 ' + size + 'px Impact, "Arial Black", system-ui, sans-serif';
    g.textAlign = align || 'left';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = Math.max(3, size * 0.24);
    g.strokeStyle = 'rgba(12,8,14,.9)';
    g.strokeText(text, x, y);
    g.fillStyle = color;
    g.fillText(text, x, y);
  }

  HUD.draw = function (g, L) {
    const p = L.player;

    /* ------------------------- здоровье и бензин ------------------------ */
    panel(g, 16, 14, 296, 74, 10);
    label(g, 'ЗДОРОВЬЕ', 28, 30, 14, '#ffd9d9');
    bar(g, 28, 38, 210, 14, p.hp / p.maxHp, '#c4232a', '#ff6a6a');
    label(g, Math.max(0, Math.round(p.hp)) + '%', 300, 45, 18, p.hp < 30 ? '#ff4d5e' : '#ffffff', 'right');

    label(g, 'БЕНЗИН', 28, 64, 12, '#ffd9a0');
    bar(g, 28, 70, 210, 9, p.fuel / p.maxFuel, '#d8582a', '#ffb03a');
    if (p.fuel <= 0) label(g, 'СУХО!', 300, 72, 14, '#ff9d3a', 'right');

    /* ------------------------ патроны и взрывчатка ---------------------- */
    panel(g, 16, 96, 190, 62, 10);
    CR.Art.draw(g, CR.Art.sheets.pu_ammo, 0, 44, 132, false, 0.8);
    label(g, String(p.ammo), 70, 118, 26, p.ammo ? '#ffd166' : '#8a8a96');
    CR.Art.draw(g, CR.Art.sheets.pu_bomb, 0, 136, 134, false, 0.8);
    label(g, String(p.bombs), 158, 118, 26, p.bombs ? '#ff6a4a' : '#8a8a96');

    /* ---------------------------- очки и комбо -------------------------- */
    label(g, U.fmt(L.score), W - 22, 38, 42, '#ffe14c', 'right');
    label(g, 'ОЧКИ', W - 22, 66, 14, '#ffffff', 'right');

    if (L.combo > 1) {
      const k = U.clamp(L.comboT / 2.6, 0, 1);
      const x = W - 120, y = 104;
      g.save();
      g.globalAlpha = 0.85;
      g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 8;
      g.beginPath(); g.arc(x + 96, y, 24, 0, 6.3); g.stroke();
      g.strokeStyle = '#ff4d5e'; g.lineWidth = 6;
      g.beginPath(); g.arc(x + 96, y, 24, -Math.PI / 2, -Math.PI / 2 + 6.283 * k); g.stroke();
      g.restore();
      label(g, 'x' + L.mult, x + 96, y + 1, 24, '#ffd166', 'center');
      label(g, L.combo + ' подряд', x + 60, y, 18, '#ffffff', 'right');
    }

    /* --------------------------- полоса маршрута ------------------------ */
    const bx = W / 2 - 190, by = 24, bw = 380;
    panel(g, bx - 10, by - 10, bw + 20, 26, 8);
    bar(g, bx, by - 4, bw, 12, L.progress(), '#2f8f5b', '#9dff6e');
    /* отметки домов */
    for (const h of L.houses) {
      if (h.hq) continue;
      const k = U.clamp(h.x / L.arenaX, 0, 1);
      g.fillStyle = h.state === 'destroyed' ? '#4a4a52' : '#ff8a2b';
      g.fillRect(bx + bw * k - 3, by - 8, 6, 20);
    }
    g.fillStyle = '#ffd166';
    g.fillRect(bx + bw - 3, by - 10, 6, 24);
    label(g, L.cfg.name.toUpperCase(), W / 2, by + 26, 14, '#ffffff', 'center');

    /* --------------------------- статус арены --------------------------- */
    if (L.phase === 'arena') {
      const total = L.cfg.waves.length;
      const txt = L.wave >= total
        ? (L.hqDown ? 'ШТАБ УНИЧТОЖЕН' : 'ВЗОРВИ ШТАБ — E')
        : 'ВОЛНА ' + Math.min(total, L.wave + 1) + '/' + total + '  ·  ВРАГОВ: ' + L.aliveHostiles();
      label(g, txt, W / 2, 96, 22, '#ff9d3a', 'center');
    }

    /* ------------------------ подсказка у дома -------------------------- */
    const near = L.houses.find((h) => h.inZone(p));
    if (near && !p.dead) {
      const t = p.bombs > 0 ? 'E — ЗАЛОЖИТЬ ВЗРЫВЧАТКУ' : 'НУЖНА ВЗРЫВЧАТКА';
      label(g, t, W / 2, H - 44, 24, p.bombs > 0 ? '#9dff6e' : '#ff6a4a', 'center');
    }

    /* ---------------------------- баннер уровня ------------------------- */
    if (L.bannerT > 0 && L.banner) {
      const a = U.clamp(L.bannerT, 0, 1) * U.clamp(L.bannerT * 0.8, 0, 1);
      g.save();
      g.globalAlpha = Math.min(1, a);
      g.fillStyle = 'rgba(10,6,14,.55)';
      g.fillRect(0, H / 2 - 74, W, 118);
      g.fillStyle = '#ff4d5e'; g.fillRect(0, H / 2 - 76, W, 4);
      g.fillStyle = '#ff4d5e'; g.fillRect(0, H / 2 + 44, W, 4);
      label(g, L.banner.title, W / 2, H / 2 - 34, 44, '#ffe14c', 'center');
      label(g, L.banner.sub, W / 2, H / 2 + 14, 22, '#ffffff', 'center');
      g.restore();
    }

    /* ---------------------- «красная» рамка при низком HP ---------------- */
    if (p.hp <= 35 && !p.dead) {
      const pulse = 0.18 + Math.sin(L.time * 7) * 0.1;
      const grd = g.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.78);
      grd.addColorStop(0, 'rgba(180,20,30,0)');
      grd.addColorStop(1, 'rgba(180,20,30,' + Math.max(0, pulse) + ')');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
    }
    if (CR.Sound.muted) label(g, 'ЗВУК ВЫКЛ (M)', W - 22, H - 22, 14, '#8a8a96', 'right');
  };
})();

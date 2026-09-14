/* ============================================================================
   ui.js — canvas HUD (health, fuel, ammo, explosives, score, combo, boss bar,
   wave counter, floating damage/score numbers, level intro titles) plus the
   DOM screens: menu, how-to-play, settings, pause, death and results.
   ========================================================================== */
(function () {
  'use strict';
  const CR = window.CR, M = CR.M;
  const TITLE = '900 %spx Haettenschweiler, "Arial Narrow Bold", Impact, sans-serif';
  const BODY = '%spx "Inter", "Segoe UI", Arial, sans-serif';

  const $ = (id) => document.getElementById(id);

  CR.UI = class UI {
    constructor(game) {
      this.game = game;
      this.floats = [];
      this.toastText = ''; this.toastT = 0;
      this.bannerText = ''; this.bannerT = 0; this.bannerMax = 1;
      this.comboPunch = 0;
      this.hurt = 0;
      this.introT = -1; this.introStage = 0;
      this.bindScreens();
    }

    /* ------------------------------ screens ----------------------------- */
    bindScreens() {
      const g = this.game;
      document.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
          g.audio.init(); g.audio.play('uiSelect');
          const a = btn.dataset.action;
          if (a === 'play') g.startLevel();
          else if (a === 'howto') this.show('howto');
          else if (a === 'settings') this.show('settings');
          else if (a === 'back') this.show('menu');
          else if (a === 'resume') g.setPaused(false);
          else if (a === 'restart') g.startLevel();
          else if (a === 'menu') g.toMenu();
          else if (a === 'next') g.nextLevel();
        });
        btn.addEventListener('mouseenter', () => { if (g.audio.ready) g.audio.play('uiMove'); });
      });

      const bind = (id, fn, label) => {
        const el = $(id);
        if (!el) return;
        const apply = () => { fn(el.value); if (label) $(label).textContent = el.value; };
        el.addEventListener('input', apply);
        el.addEventListener('change', apply);
        apply();
      };
      bind('setVolume', (v) => g.audio.setVolume(v / 100), 'volVal');
      bind('setMusic', (v) => g.audio.setMusicVolume(v / 100), 'musVal');
      bind('setShake', (v) => { g.cam.shakeScale = v / 100; }, 'shakeVal');
      bind('setQuality', (v) => g.setQuality(v));
      bind('setGore', (v) => { CR.Particles.gore = v === '1'; });
    }

    show(name) {
      ['menu', 'howto', 'settings', 'pause', 'gameover', 'results'].forEach((id) => {
        $(id).classList.toggle('hidden', id !== name);
      });
      this.current = name;
    }
    hideAll() { this.show(null); }

    bars(on) {
      this.barsOn = !!on;
      document.getElementById('bars').classList.toggle('on', !!on);
    }

    /* ---------------------------- transient bits ------------------------ */
    toast(text, time) {
      const el = $('toast');
      el.textContent = text;
      el.classList.remove('hidden');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => el.classList.add('hidden'), (time || 1.4) * 1000);
    }
    banner(text, time) {
      this.bannerText = text;
      this.bannerT = this.bannerMax = time || 2;
    }
    float(x, y, text, color, size) {
      this.floats.push({ x, y, text, color: color || '#fff', size: size || 30, life: 1, max: 1, vy: -70 });
      if (this.floats.length > 40) this.floats.shift();
    }

    startIntro() { this.introT = 0; this.introStage = 0; }

    update(dt) {
      this.bannerT = Math.max(0, this.bannerT - dt);
      this.comboPunch = Math.max(0, this.comboPunch - dt * 3);
      this.hurt = Math.max(0, this.hurt - dt * 1.8);
      for (let i = this.floats.length - 1; i >= 0; i--) {
        const f = this.floats[i];
        f.life -= dt * 1.1;
        f.y += f.vy * dt;
        f.vy *= 1 - dt * 2.2;
        if (f.life <= 0) this.floats.splice(i, 1);
      }
      if (this.introT >= 0) this.introT += dt;
    }

    /* =============================== HUD =============================== */
    draw(ctx, W, H) {
      const g = this.game, p = g.player;
      if (!p) return;
      ctx.save();
      ctx.textBaseline = 'middle';
      /* the letterbox bars overlay the canvas, so tuck the HUD inside them */
      const inset = this.barsOn ? H * .075 : 0;
      ctx.translate(0, inset);

      /* ---------- health (top-left) ---------- */
      const hx = 46, hy = 48;
      this.plate(ctx, hx - 12, hy - 14, 430, 78);
      ctx.font = TITLE.replace('%s', 15);
      ctx.fillStyle = 'rgba(232,228,220,.55)';
      ctx.textAlign = 'left';
      ctx.fillText('VITALS', hx, hy);

      const hpFrac = M.clamp(p.hp / p.maxHp, 0, 1);
      this.bar(ctx, hx, hy + 14, 300, 20, hpFrac, ['#8c1410', '#e0392a', '#ff6a4a'], p.hp < 30);
      ctx.font = TITLE.replace('%s', 30);
      ctx.fillStyle = p.hp < 30 ? '#ff5436' : '#efece4';
      ctx.textAlign = 'right';
      ctx.fillText(Math.ceil(p.hp), hx + 410, hy + 22);

      /* fuel just under health */
      ctx.font = TITLE.replace('%s', 13);
      ctx.fillStyle = 'rgba(232,228,220,.45)';
      ctx.textAlign = 'left';
      ctx.fillText('CHAINSAW FUEL', hx, hy + 44);
      this.bar(ctx, hx + 132, hy + 38, 168, 12, M.clamp(p.fuel / p.maxFuel, 0, 1),
        ['#7a3a10', '#e2691f', '#ffb03a'], p.fuel <= 0);

      /* ---------- score + combo (top-centre) ---------- */
      ctx.textAlign = 'center';
      ctx.font = TITLE.replace('%s', 54);
      ctx.fillStyle = '#efece4';
      ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 16;
      ctx.fillText(M.commas(g.score), W / 2, 56);
      ctx.shadowBlur = 0;
      ctx.font = BODY.replace('%s', 12);
      ctx.fillStyle = 'rgba(232,228,220,.45)';
      ctx.fillText('S C O R E', W / 2, 88);

      if (g.combo > 1) {
        const punch = 1 + this.comboPunch * .45;
        const frac = M.clamp(g.comboT / g.comboMax, 0, 1);
        ctx.save();
        ctx.translate(W / 2, 140);
        ctx.scale(punch, punch);
        ctx.font = TITLE.replace('%s', 46);
        const hot = g.combo >= 10;
        ctx.fillStyle = hot ? '#ff3b23' : '#ffb03a';
        ctx.shadowColor = hot ? 'rgba(255,60,35,.8)' : 'rgba(255,170,60,.6)';
        ctx.shadowBlur = 24;
        ctx.fillText('CHAIN x' + g.combo, 0, 0);
        ctx.shadowBlur = 0;
        ctx.restore();
        /* combo timer bar */
        ctx.fillStyle = 'rgba(255,255,255,.10)';
        ctx.fillRect(W / 2 - 120, 168, 240, 5);
        ctx.fillStyle = g.combo >= 10 ? '#ff3b23' : '#ffb03a';
        ctx.fillRect(W / 2 - 120, 168, 240 * frac, 5);
      }

      /* ---------- ammo / explosives (top-right) ---------- */
      const rx = W - 46;
      this.plate(ctx, rx - 300, 34, 312, 92);
      ctx.textAlign = 'right';
      ctx.font = TITLE.replace('%s', 44);
      ctx.fillStyle = p.ammo > 0 ? '#efece4' : '#7a2f22';
      ctx.fillText(p.ammo, rx - 100, 66);
      ctx.font = BODY.replace('%s', 12);
      ctx.fillStyle = 'rgba(232,228,220,.45)';
      ctx.fillText('AMMO', rx - 100, 96);

      ctx.font = TITLE.replace('%s', 44);
      ctx.fillStyle = p.explosives > 0 ? '#ff5436' : '#4a3029';
      ctx.fillText(p.explosives, rx - 12, 66);
      ctx.font = BODY.replace('%s', 12);
      ctx.fillStyle = 'rgba(232,228,220,.45)';
      ctx.fillText('CHARGES', rx - 12, 96);

      /* ---------- boss health ---------- */
      if (g.boss && !g.boss.dying) {
        const bw = 720, bx = W / 2 - bw / 2, by = H - 92 - inset * 2.2;
        ctx.textAlign = 'center';
        ctx.font = TITLE.replace('%s', 26);
        ctx.fillStyle = '#ff3b23';
        ctx.fillText(g.boss.name, W / 2, by - 18);
        ctx.fillStyle = 'rgba(6,6,10,.75)';
        ctx.fillRect(bx - 4, by - 4, bw + 8, 26);
        const f = M.clamp(g.boss.hp / g.boss.maxHp, 0, 1);
        const grd = ctx.createLinearGradient(bx, 0, bx + bw, 0);
        grd.addColorStop(0, '#7a1008'); grd.addColorStop(.5, '#d8291a'); grd.addColorStop(1, '#ff5a36');
        ctx.fillStyle = grd;
        ctx.fillRect(bx, by, bw * f, 18);
        ctx.fillStyle = 'rgba(255,255,255,.18)';
        ctx.fillRect(bx, by, bw * f, 5);
        ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, bw, 18);
      }

      /* ---------- wave counter ---------- */
      if (g.arena.active) {
        ctx.textAlign = 'center';
        ctx.font = TITLE.replace('%s', 30);
        ctx.fillStyle = '#e2691f';
        ctx.fillText('WAVE ' + g.arena.wave + ' / ' + g.arena.total, W / 2, H - 148 - inset);
        ctx.font = BODY.replace('%s', 13);
        ctx.fillStyle = 'rgba(232,228,220,.6)';
        ctx.fillText(g.arena.remaining > 0 ? g.arena.remaining + ' HOSTILES' : 'WAVE CLEARED', W / 2, H - 122 - inset);
      }

      /* ---------- floating numbers ---------- */
      for (const f of this.floats) {
        const sx = g.cam.toScreenX(f.x), sy = g.cam.toScreenY(f.y);
        ctx.save();
        ctx.globalAlpha = M.clamp(f.life * 1.6, 0, 1);
        ctx.font = TITLE.replace('%s', f.size);
        ctx.textAlign = 'center';
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(6,6,10,.85)';
        ctx.strokeText(f.text, sx, sy);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, sx, sy);
        ctx.restore();
      }

      /* ---------- banner ---------- */
      if (this.bannerT > 0) {
        const k = this.bannerT / this.bannerMax;
        const slide = M.easeOut(M.clamp((1 - k) * 6, 0, 1)) * 1 - M.easeIn(M.clamp((k - .15) * 2, 0, 1)) * 0;
        ctx.save();
        ctx.globalAlpha = M.clamp(k * 3, 0, 1);
        ctx.translate(W / 2, H * .3);
        ctx.fillStyle = 'rgba(8,8,12,.62)';
        ctx.fillRect(-W / 2, -44, W, 88);
        ctx.fillStyle = '#c0261f';
        ctx.fillRect(-W / 2, -46, W, 3);
        ctx.fillRect(-W / 2, 43, W, 3);
        ctx.textAlign = 'center';
        ctx.font = TITLE.replace('%s', 62);
        ctx.fillStyle = '#efece4';
        ctx.fillText(this.bannerText, 0, 2);
        ctx.restore();
      }

      /* ---------- damage vignette ---------- */
      if (p.hp < 40 || this.hurt > 0) {
        const a = Math.max(this.hurt * .5, (1 - p.hp / 40) * .28 * (0.7 + Math.sin(g.time * 5) * .3));
        const grd = ctx.createRadialGradient(W / 2, H / 2, H * .3, W / 2, H / 2, H * .8);
        grd.addColorStop(0, 'rgba(150,10,10,0)');
        grd.addColorStop(1, 'rgba(150,10,10,' + M.clamp(a, 0, .75) + ')');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, W, H);
      }

      ctx.restore();
    }

    /* level intro: black, timestamp, place, then RUN. */
    drawIntro(ctx, W, H) {
      const t = this.introT;
      if (t < 0) return false;
      ctx.save();
      const fade = t < 3.6 ? 1 : M.clamp(1 - (t - 3.6) / .7, 0, 1);
      ctx.fillStyle = 'rgba(3,3,5,' + fade + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.globalAlpha = fade;

      if (t > .35) {
        ctx.globalAlpha = fade * M.clamp((t - .35) * 2, 0, 1);
        ctx.font = TITLE.replace('%s', 46);
        ctx.fillStyle = 'rgba(232,228,220,.8)';
        ctx.fillText('06:47 AM', W / 2, H / 2 - 46);
      }
      if (t > 1.1) {
        ctx.globalAlpha = fade * M.clamp((t - 1.1) * 2, 0, 1);
        ctx.font = TITLE.replace('%s', 96);
        ctx.fillStyle = '#efece4';
        ctx.fillText('SUBURBS', W / 2, H / 2 + 40);
        ctx.fillStyle = '#c0261f';
        ctx.fillRect(W / 2 - 150, H / 2 + 70, 300, 3);
      }
      if (t > 2.6) {
        const k = M.clamp((t - 2.6) * 2.2, 0, 1);
        ctx.globalAlpha = fade * k;
        ctx.font = TITLE.replace('%s', 130 - 20 * M.easeOut(k));
        ctx.fillStyle = '#ff3b23';
        ctx.fillText('RUN.', W / 2, H / 2 + 210);
      }
      ctx.restore();
      return t < 4.3;
    }

    /* ---------------------------- primitives ---------------------------- */
    plate(ctx, x, y, w, h) {
      ctx.fillStyle = 'rgba(8,8,12,.42)';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(192,38,31,.9)';
      ctx.fillRect(x, y, 4, h);
    }

    bar(ctx, x, y, w, h, frac, colors, warn) {
      ctx.fillStyle = 'rgba(0,0,0,.62)';
      ctx.fillRect(x, y, w, h);
      const grd = ctx.createLinearGradient(x, y, x, y + h);
      grd.addColorStop(0, colors[2]); grd.addColorStop(.45, colors[1]); grd.addColorStop(1, colors[0]);
      ctx.fillStyle = grd;
      const fw = Math.max(0, w * frac);
      ctx.fillRect(x, y, fw, h);
      ctx.fillStyle = 'rgba(255,255,255,.22)';
      ctx.fillRect(x, y, fw, Math.max(1, h * .3));
      if (warn) {
        ctx.globalAlpha = .35 + Math.sin(this.game.time * 9) * .3;
        ctx.fillStyle = colors[2];
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = 'rgba(255,255,255,.16)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    }

    /* --------------------------- results screen ------------------------- */
    showResults(stats, score, rank) {
      const rows = [
        ['CIVILIANS DEFEATED', stats.civilians],
        ['POLICE DEFEATED', stats.police],
        ['DOGS DEFEATED', stats.dogs],
        ['ARMOURED UNITS', stats.swat],
        ['BUILDINGS DESTROYED', stats.buildings],
        ['VEHICLES DESTROYED', stats.cars],
        ['MAX COMBO', 'x' + stats.maxCombo],
        ['TIME', M.time(stats.time)],
        ['TOTAL SCORE', M.commas(score)]
      ];
      $('resultStats').innerHTML = rows.map((r, i) =>
        '<div class="line' + (i === rows.length - 1 ? ' total' : '') + '" style="animation-delay:' +
        (i * .07) + 's"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('');
      $('rankLetter').textContent = rank;
      $('rankScore').textContent = M.commas(score);
      this.show('results');
    }

    showDeath(stats, score) {
      const rows = [
        ['KILLS', stats.civilians + stats.police + stats.dogs + stats.swat],
        ['BUILDINGS DESTROYED', stats.buildings],
        ['MAX COMBO', 'x' + stats.maxCombo],
        ['SCORE', M.commas(score)]
      ];
      $('deathStats').innerHTML = rows.map((r, i) =>
        '<div class="line' + (i === rows.length - 1 ? ' total' : '') + '" style="animation-delay:' +
        (i * .07) + 's"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('');
      this.show('gameover');
    }
  };
})();

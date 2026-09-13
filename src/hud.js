/* =============================================================================
 *  hud.js — HTML-оверлей поверх canvas: здоровье, звёзды розыска, патроны,
 *  миникарта (2D canvas), GPS-стрелка, цели миссии, уведомления, экраны.
 * ========================================================================== */
(function () {
  'use strict';
  const GTA = window.GTA, U = GTA.Utils;

  const $ = (id) => document.getElementById(id);
  const STAR_SVG =
    '<svg class="star" viewBox="0 0 24 24"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" fill="#ffd23f" stroke="#000" stroke-width="1"/></svg>';

  class HUD {
    constructor() {
      this.el = {
        hud: $('hud'), health: $('healthFill'), armor: $('armorFill'), armorBar: $('armorBar'),
        wanted: $('wanted'), ammo: $('ammo'), reloading: $('reloading'),
        objTitle: $('objTitle'), objText: $('objText'), objDist: $('objDist'),
        gps: $('gpsArrow'), cross: $('cross'), toasts: $('toasts'),
        damage: $('damage'), hint: $('hint'), speedo: $('speedo'),
        speedVal: $('speedVal'), gearFill: $('gearFill'), weaponName: $('weaponName')
      };
      this.el.wanted.innerHTML = STAR_SVG.repeat(5);
      this.stars = Array.from(this.el.wanted.querySelectorAll('.star'));
      this.mapCanvas = $('minimap');
      this.mapCtx = this.mapCanvas.getContext('2d');
      this._toasts = [];
      this._hitT = 0;
      this._mapStatic = null;
      this._hintT = 0;
    }

    show(v) { this.el.hud.classList.toggle('hidden', !v); }

    toast(text, kind) {
      const d = document.createElement('div');
      d.className = 'toast' + (kind ? ' ' + kind : '');
      d.textContent = text;
      this.el.toasts.appendChild(d);
      this._toasts.push({ el: d, t: 4.2 });
      while (this._toasts.length > 4) {
        const old = this._toasts.shift();
        old.el.remove();
      }
    }

    hint(text) {
      if (!text) { this.el.hint.classList.add('hidden'); this._hintT = 0; return; }
      this.el.hint.innerHTML = text;
      this.el.hint.classList.remove('hidden');
      this._hintT = 0.25;
    }

    objective(title, text) {
      this.el.objTitle.textContent = title;
      this.el.objText.textContent = text;
    }

    hitMarker(head) {
      this._hitT = head ? 0.22 : 0.12;
      this.el.cross.classList.add('hit');
      GTA.Audio.ui(head ? 1180 : 900, 0.05);
    }

    damageFlash() {
      this.el.damage.style.opacity = '0.85';
      clearTimeout(this._dmgTimer);
      this._dmgTimer = setTimeout(() => { this.el.damage.style.opacity = '0'; }, 110);
    }

    /* ------------------------------ апдейт ------------------------------ */
    update(dt, game) {
      const p = game.player;
      this.el.health.style.width = U.clamp(p.health / p.maxHealth * 100, 0, 100) + '%';
      this.el.armorBar.style.display = p.armor > 0 ? 'block' : 'none';
      this.el.armor.style.width = U.clamp(p.armor, 0, 100) + '%';

      this.el.ammo.innerHTML = p.ammo + '<small>/' + p.reserve + '</small>';
      this.el.reloading.textContent = p.reloadT > 0 ? 'ПЕРЕЗАРЯДКА…' : '';
      this.el.weaponName.textContent = GTA.WEAPON.name;

      const w = game.mission.wanted;
      for (let i = 0; i < 5; i++) {
        this.stars[i].classList.toggle('on', i < w);
        this.stars[i].classList.toggle('blink', i === w - 1 && w > 0);
      }

      if (this._hitT > 0) {
        this._hitT -= dt;
        if (this._hitT <= 0) this.el.cross.classList.remove('hit');
      }
      this.el.cross.style.opacity = p.inVehicle ? 0 : (p.aiming ? 1 : 0.55);

      // спидометр
      if (p.inVehicle) {
        this.el.speedo.classList.remove('hidden');
        const kmh = Math.round(p.inVehicle.kmh);
        this.el.speedVal.innerHTML = kmh + '<small> КМ/Ч</small>';
        this.el.gearFill.style.width = U.clamp(kmh / 170 * 100, 0, 100) + '%';
      } else {
        this.el.speedo.classList.add('hidden');
      }

      // GPS-стрелка к текущей цели
      const tgt = game.mission.waypoint;
      if (tgt) {
        const dx = tgt.x - p.position.x, dz = tgt.z - p.position.z;
        const d = Math.hypot(dx, dz);
        const y = p.yaw;
        const a = dx * Math.cos(y) - dz * Math.sin(y);
        const b = dx * Math.sin(y) + dz * Math.cos(y);
        const ang = Math.atan2(a, b);
        const R = 132;
        this.el.gps.style.transform =
          'translate(' + (Math.sin(ang) * R) + 'px,' + (-Math.cos(ang) * R) + 'px) rotate(' + ang + 'rad)';
        this.el.gps.style.opacity = d > 6 ? 0.95 : 0;
        this.el.objDist.textContent = d > 1 ? Math.round(d) + ' м' : '';
      } else {
        this.el.gps.style.opacity = 0;
        this.el.objDist.textContent = '';
      }

      // уведомления
      for (let i = this._toasts.length - 1; i >= 0; i--) {
        const t = this._toasts[i];
        t.t -= dt;
        if (t.t <= 0) { t.el.remove(); this._toasts.splice(i, 1); }
        else if (t.t < 0.6) t.el.style.opacity = t.t / 0.6;
      }
      if (this._hintT > 0) { this._hintT -= dt; if (this._hintT <= 0) this.el.hint.classList.add('hidden'); }

      this.drawMinimap(game);
    }

    /* ----------------------------- миникарта ----------------------------- */
    drawMinimap(game) {
      const ctx = this.mapCtx, C = this.mapCanvas.width, half = C / 2;
      const p = game.player;
      const range = 175;                    // метров до края карты
      const s = half / range;
      const y = p.yaw;
      const cos = Math.cos(y), sin = Math.sin(y);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, C, C);
      ctx.fillStyle = '#191f28';
      ctx.fillRect(0, 0, C, C);

      const A = s * cos, B = -s * sin, Cc = -s * sin, D = -s * cos;
      const E = half - s * (cos * p.position.x - sin * p.position.z);
      const F = half + s * (sin * p.position.x + cos * p.position.z);
      ctx.setTransform(A, B, Cc, D, E, F);

      // кварталы
      const map = game.world.map;
      ctx.fillStyle = '#262d38';
      for (let i = 0; i < map.lots.length; i++) {
        const l = map.lots[i];
        if (Math.abs(l.x - p.position.x) > range + 60 || Math.abs(l.z - p.position.z) > range + 60) continue;
        ctx.fillStyle = l.industrial ? '#33302a' : '#262d38';
        ctx.fillRect(l.x - l.s / 2, l.z - l.s / 2, l.s, l.s);
      }
      // дороги
      ctx.strokeStyle = '#3c4654';
      for (let i = 0; i < map.roads.length; i++) {
        const r = map.roads[i];
        ctx.lineWidth = r.w;
        ctx.beginPath();
        if (r.h) { ctx.moveTo(-GTA.WORLD_HALF, r.c); ctx.lineTo(GTA.WORLD_HALF, r.c); }
        else { ctx.moveTo(r.c, -GTA.WORLD_HALF); ctx.lineTo(r.c, GTA.WORLD_HALF); }
        ctx.stroke();
      }

      const dot = (x, z, color, r) => {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const dx = x - p.position.x, dz = z - p.position.z;
        const a = dx * cos - dz * sin, b = dx * sin + dz * cos;
        let px = half + a * s, py = half - b * s;
        const dd = Math.hypot(px - half, py - half);
        const max = half - 10;
        let clamped = false;
        if (dd > max) { px = half + (px - half) / dd * max; py = half + (py - half) / dd * max; clamped = true; }
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.stroke();
        return clamped;
      };

      // враги / полиция / машины
      const npcs = game.npcs.list;
      for (let i = 0; i < npcs.length; i++) {
        const n = npcs[i];
        if (n.isDead) continue;
        if (U.dist2D(n.pos.x, n.pos.z, p.position.x, p.position.z) > range * 1.4) continue;
        dot(n.pos.x, n.pos.z, n.faction === 'cop' ? '#4c9dff' : '#ff4d3d', 7);
      }
      for (let i = 0; i < game.npcs.cars.length; i++) {
        const c = game.npcs.cars[i];
        dot(c.pos.x, c.pos.z, '#3a7bd5', 9);
      }
      if (game.car && !p.inVehicle) dot(game.car.pos.x, game.car.pos.z, '#7cff9b', 8);

      // цель миссии
      const tgt = game.mission.waypoint;
      if (tgt) dot(tgt.x, tgt.z, '#ffd23f', 10);

      // игрок
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.save();
      ctx.translate(half, half);
      ctx.beginPath();
      ctx.moveTo(0, -12); ctx.lineTo(9, 10); ctx.lineTo(0, 5); ctx.lineTo(-9, 10);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke();
      ctx.restore();
    }
  }

  GTA.HUD = HUD;
})();

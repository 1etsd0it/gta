/* =============================================================================
 *  level.js — генерация уровня, менеджер сущностей, столкновения, очки, комбо
 *  и финальная арена с волнами копов и штаб-квартирой.
 * ========================================================================== */
(function () {
  'use strict';
  const CR = window.CR, U = CR.Utils, FX = CR.FX, Snd = CR.Sound;
  const W = CR.W, G = CR.GROUND;

  /* ------------------------------ уровни ---------------------------------- */
  CR.LEVELS = [
    {
      name: 'Пригород', theme: 0, night: false,
      length: 8600, speed: [205, 330],
      density: 1.0, copRate: 0.22, dogRate: 0.16, carRate: 0.15,
      houses: 3, roadBoss: 1, waves: [4, 5, 6], waveBoss: [0, 0, 1],
      intro: 'Тихий спальный район. Рассвет. Пила заправлена.'
    },
    {
      name: 'Деловой центр', theme: 1, night: true,
      length: 9600, speed: [235, 375],
      density: 1.2, copRate: 0.34, dogRate: 0.14, carRate: 0.2,
      houses: 3, roadBoss: 2, waves: [5, 6, 7], waveBoss: [0, 1, 1],
      intro: 'Час пик на бульваре. Копов больше, улицы уже.'
    },
    {
      name: 'Промзона', theme: 2, night: true,
      length: 10600, speed: [265, 420],
      density: 1.35, copRate: 0.42, dogRate: 0.2, carRate: 0.24,
      houses: 4, roadBoss: 2, waves: [6, 7, 8], waveBoss: [1, 1, 2],
      intro: 'Ночь, склады и спецназ. Последний рывок.'
    }
  ];

  const COMBO_TIME = 2.6;

  CR.Level = class Level {
    constructor(index, game) {
      this.index = U.clamp(index, 0, CR.LEVELS.length - 1);
      this.cfg = CR.LEVELS[this.index];
      this.game = game;
      this.cam = new CR.Camera();
      this.world = new CR.World(this.cfg.theme);

      this.player = new CR.Player(260);
      this.enemies = [];
      this.bullets = [];
      this.pickups = [];
      this.cars = [];
      this.houses = [];
      this.events = [];

      this.scrollSpeed = this.cfg.speed[0];
      this.score = 0;
      this.combo = 0; this.comboT = 0; this.mult = 1;
      this.time = 0;
      this.locked = false;         /* блокировка управления (интро/финиш) */
      this.moveBoost = 0;          /* добавка к скорости шага (арена) */
      this.marginRight = 210;      /* насколько далеко игрок видит перед собой */
      this.minX = 0;

      this.phase = 'run';          /* run | arena | done | dead */
      this.arenaX = this.cfg.length;
      this.wave = 0; this.waveT = 2;
      this.waveActive = false;
      this.hqDown = false;
      this.bombDropT = 0;
      this.banner = null; this.bannerT = 0;

      this.stats = {
        kills: 0, civ: 0, cops: 0, dogs: 0, bosses: 0,
        houses: 0, cars: 0, pickups: 0, maxCombo: 0, sawKills: 0, gunKills: 0, boomKills: 0
      };

      this.generate();
      this.showBanner('УРОВЕНЬ ' + (this.index + 1) + ' · ' + this.cfg.name.toUpperCase(), this.cfg.intro, 3.2);
    }

    /* ---------------------------- генерация --------------------------- */
    generate() {
      const c = this.cfg;
      const ev = this.events;
      const startSafe = 820;
      const endRun = c.length - 900;

      /* дома со взрывной зоной — равномерно по трассе */
      const houseXs = [];
      for (let i = 0; i < c.houses; i++) {
        const t = (i + 1) / (c.houses + 1);
        houseXs.push(Math.round(startSafe + (endRun - startSafe) * t));
      }
      houseXs.forEach((hx) => {
        ev.push({ x: hx, type: 'house' });
        ev.push({ x: hx - 520, type: 'pickup', kind: 'bomb' });   /* динамит заранее */
      });

      /* поток врагов и препятствий */
      let x = startSafe;
      while (x < endRun) {
        x += U.rand(200, 420) / c.density;
        if (houseXs.some((hx) => Math.abs(hx - x) < 190)) continue;

        const roll = Math.random();
        if (roll < c.carRate) {
          ev.push({ x, type: 'car' });
          if (U.chance(0.45)) ev.push({ x: x + U.rand(120, 260), type: 'civ' });
        } else if (roll < c.carRate + c.copRate) {
          ev.push({ x, type: 'cop' });
          if (U.chance(0.35)) ev.push({ x: x + U.rand(90, 220), type: 'cop' });
        } else if (roll < c.carRate + c.copRate + c.dogRate) {
          ev.push({ x, type: 'dog' });
        } else {
          const n = U.randInt(1, 3);
          for (let i = 0; i < n; i++) ev.push({ x: x + i * U.rand(50, 120), type: 'civ' });
        }

        /* бонусы по маршруту */
        if (U.chance(0.2)) ev.push({ x: x + U.rand(60, 200), type: 'pickup', kind: 'ammo' });
        if (U.chance(0.12)) ev.push({ x: x + U.rand(60, 200), type: 'pickup', kind: 'fuel' });
        if (U.chance(0.1)) ev.push({ x: x + U.rand(60, 200), type: 'pickup', kind: 'med' });
      }

      /* дорожные мини-боссы ближе к концу */
      for (let i = 0; i < c.roadBoss; i++) {
        ev.push({ x: endRun - 300 - i * 900, type: 'boss' });
        ev.push({ x: endRun - 560 - i * 900, type: 'pickup', kind: 'ammo' });
      }

      /* финальная арена: баррикады, штаб и припасы */
      const A = this.arenaX;
      ev.push({ x: A + 700, type: 'hq' });
      ev.push({ x: A + 330, type: 'car' });
      ev.push({ x: A + 520, type: 'car' });
      ev.push({ x: A + 180, type: 'pickup', kind: 'med' });
      ev.push({ x: A + 240, type: 'pickup', kind: 'ammo' });
      ev.push({ x: A + 300, type: 'pickup', kind: 'bomb' });
      ev.push({ x: A + 420, type: 'pickup', kind: 'fuel' });

      ev.sort((a, b) => a.x - b.x);
      this.evIndex = 0;
    }

    spawnDue() {
      const limit = this.cam.x + W + 180;
      while (this.evIndex < this.events.length && this.events[this.evIndex].x <= limit) {
        const e = this.events[this.evIndex++];
        switch (e.type) {
          case 'civ': this.enemies.push(new CR.Civilian(e.x)); break;
          case 'cop': this.enemies.push(new CR.Cop(e.x)); break;
          case 'dog': this.enemies.push(new CR.Dog(e.x)); break;
          case 'boss': this.enemies.push(new CR.Boss(e.x)); break;
          case 'car': this.cars.push(new CR.Car(e.x)); break;
          case 'pickup': this.pickups.push(new CR.Pickup(e.x, e.kind)); break;
          case 'house': this.houses.push(new CR.House(e.x)); break;
          case 'hq': this.hq = new CR.House(e.x, { hq: true }); this.houses.push(this.hq); break;
        }
      }
    }

    /* ----------------------------- очки/комбо -------------------------- */
    addScore(n, x, y, color) {
      const total = Math.round(n * this.mult);
      this.score += total;
      if (x !== undefined) FX.score(x, y, total, color);
      return total;
    }

    bumpCombo() {
      this.combo++;
      this.comboT = COMBO_TIME;
      this.mult = U.clamp(1 + Math.floor(this.combo / 4), 1, 8);
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
      if (this.combo > 1) Snd.combo(this.combo);
      if (this.combo === 8 || this.combo === 16 || this.combo === 28) {
        FX.pop(this.player.x, this.player.y - 130, 'x' + this.mult + ' КОМБО!', '#ffd166', 30);
      }
    }
    breakCombo() { this.combo = 0; this.mult = 1; this.comboT = 0; }

    onKill(e, weapon) {
      this.stats.kills++;
      if (e.type === 'civ') this.stats.civ++;
      else if (e.type === 'cop') this.stats.cops++;
      else if (e.type === 'dog') this.stats.dogs++;
      else if (e.type === 'boss') { this.stats.bosses++; this.cam.kick(12, 0.3, '255,120,60'); }

      let base = 50;
      if (weapon === 'bullet') { base = 30; this.stats.gunKills++; }
      else if (weapon === 'saw') { base = 50; this.stats.sawKills++; }
      else if (weapon === 'blast') { base = 40; this.stats.boomKills++; }
      if (e.type === 'boss') base = 300;
      else if (e.type === 'cop') base += 10;

      this.bumpCombo();
      this.addScore(base, e.x, e.y - e.h - 10, weapon === 'saw' ? '#ff4d5e' : '#9dff6e');
      this.player.fuel = Math.min(this.player.maxFuel, this.player.fuel + (weapon === 'saw' ? 1.5 : 0));
    }

    /* ----------------------------- оружие ------------------------------ */
    spawnBullet(x, y, vx, vy, dmg, owner, color) {
      this.bullets.push(new CR.Bullet(x, y, vx, vy, dmg, owner, color));
    }

    /* поражение бензопилой: непрерывное окно урона за один замах */
    sawSweep(p) {
      const box = p.sawBox();
      const dmg = p.fuel > 0 ? 2 : 1;
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (e.dead || e.hitSwing === p.swingId) continue;
        if (U.aabb(box, e.box())) {
          e.hitSwing = p.swingId;
          e.hurt(dmg, 'saw', this, p.x);
          this.cam.kick(4);
          FX.blood(e.x - 10, e.y - e.h * 0.5, 5, 1, 0.7);
          Snd.sawLevel(1);
          p.sawNoise = Math.max(p.sawNoise, 0.25);
        }
      }
      for (let i = 0; i < this.cars.length; i++) {
        const c = this.cars[i];
        if (c.dead || c.hitSwing === p.swingId) continue;
        if (U.aabb(box, c.box())) {
          c.hitSwing = p.swingId;
          c.hurt(1, 'saw', this, p.x);
          FX.sparks(p.x + 40, p.y - 40, 6, '#ffd166');
        }
      }
    }

    /* взрыв: урон всем в радиусе; возвращает число убитых */
    blast(x, y, radius, dmg) {
      let killed = 0;
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (e.dead) continue;
        if (U.dist(x, y, e.x, e.y - e.h / 2) < radius) {
          if (e.hurt(dmg, 'blast', this, x)) killed++;
        }
      }
      for (let i = 0; i < this.cars.length; i++) {
        const c = this.cars[i];
        if (!c.dead && U.dist(x, y, c.x, c.y - 30) < radius * 0.8) c.explode(this);
      }
      const p = this.player;
      if (!p.dead && U.dist(x, y, p.x, p.y - 36) < radius * 0.55) {
        p.hurt(22, this, x);
        FX.pop(p.x, p.y - 120, 'СЛИШКОМ БЛИЗКО!', '#ff9d3a', 22, 'score');
      }
      return killed;
    }

    /* закладка взрывчатки */
    tryPlant(p) {
      const h = this.houses.find((hh) => hh.inZone(p));
      if (!h) {
        FX.pop(p.x, p.y - 110, 'НЕТ ЦЕЛИ', '#c9d2e0', 18, 'score');
        Snd.empty();
        return;
      }
      if (p.bombs <= 0) {
        FX.pop(p.x, p.y - 110, 'НЕТ ВЗРЫВЧАТКИ', '#ff9d3a', 18, 'score');
        Snd.empty();
        return;
      }
      p.bombs--;
      h.arm(this);
    }

    onHQDown() {
      this.hqDown = true;
      if (this.phase === 'arena' && !this.waveActive && this.wave >= this.cfg.waves.length) this.finish();
      else this.checkArenaDone();
    }

    /* ------------------------------ баннеры ---------------------------- */
    showBanner(title, sub, time) {
      this.banner = { title, sub };
      this.bannerT = time || 2.5;
    }

    /* ------------------------------ апдейт ----------------------------- */
    update(dt) {
      this.time += dt;
      this.world.update(dt);
      this.cam.update(dt);
      if (this.bannerT > 0) this.bannerT -= dt;

      const p = this.player;

      /* скорость автоскролла растёт по мере прохождения */
      if (this.phase === 'run') {
        const prog = U.clamp((this.cam.x) / this.cfg.length, 0, 1);
        const target = U.lerp(this.cfg.speed[0], this.cfg.speed[1], prog);
        this.scrollSpeed = U.approach(this.scrollSpeed, target, 30 * dt);
        this.cam.x += this.scrollSpeed * dt;
        if (this.cam.x >= this.arenaX) { this.cam.x = this.arenaX; this.enterArena(); }
      } else {
        this.scrollSpeed = U.approach(this.scrollSpeed, 0, 420 * dt);
        this.cam.x += this.scrollSpeed * dt;
        this.minX = this.cam.x + 40;
      }

      if (this.comboT > 0) {
        this.comboT -= dt;
        if (this.comboT <= 0) this.breakCombo();
      }

      this.spawnDue();

      /* --------------------------- сущности --------------------------- */
      p.update(dt, this);
      if (p.dead && this.phase !== 'dead' && p.deadT > 1.4) {
        this.phase = 'dead';
        this.game.onGameOver();
      }

      const arenaRight = this.cam.x + W - 60;
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        e.update(dt, this);
        if (this.phase !== 'run' && e.type !== 'civ' && e.x > arenaRight) e.x = arenaRight;
        if (e.dead || e.x < this.cam.x - 260 || e.x > this.cam.x + W + 1400) this.enemies.splice(i, 1);
      }
      for (let i = this.cars.length - 1; i >= 0; i--) {
        const c = this.cars[i];
        c.update(dt, this);
        if (c.dead || c.x < this.cam.x - 300) this.cars.splice(i, 1);
      }
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const pu = this.pickups[i];
        pu.update(dt, this);
        if (pu.dead || pu.x < this.cam.x - 200) this.pickups.splice(i, 1);
      }
      for (let i = this.houses.length - 1; i >= 0; i--) {
        const h = this.houses[i];
        h.update(dt, this);
        if (h.x < this.cam.x - 700) this.houses.splice(i, 1);
      }

      /* ----------------------------- пули ----------------------------- */
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        b.update(dt, this);
        if (b.x < this.cam.x - 120 || b.x > this.cam.x + W + 120 || b.y > G) b.dead = true;

        if (!b.dead && b.owner === 'player') {
          for (let k = 0; k < this.enemies.length; k++) {
            const e = this.enemies[k];
            if (e.dead) continue;
            if (U.aabb(b.box(), e.box())) {
              e.hurt(b.dmg, 'bullet', this, b.x);
              FX.sparks(b.x, b.y, 5, '#ffd166');
              b.dead = true;
              break;
            }
          }
          if (!b.dead) {
            for (let k = 0; k < this.cars.length; k++) {
              const c = this.cars[k];
              if (!c.dead && U.aabb(b.box(), c.box())) { c.hurt(b.dmg, 'bullet', this, b.x); b.dead = true; break; }
            }
          }
        } else if (!b.dead && !p.dead) {
          if (U.aabb(b.box(), p.box())) {
            p.hurt(b.dmg, this, b.x);
            FX.sparks(b.x, b.y, 6, '#ff6a4a');
            b.dead = true;
          }
        }
        if (b.dead) this.bullets.splice(i, 1);
      }

      FX.update(dt, G);

      /* --------------------------- арена ------------------------------ */
      if (this.phase === 'arena') this.updateArena(dt);

      /* музыка «дышит» вместе с боем */
      Snd.setIntensity(this.phase === 'arena' ? 1.5 : 0.6 + Math.min(0.8, this.combo * 0.08));
    }

    /* ------------------------- финальная арена ------------------------- */
    enterArena() {
      this.phase = 'arena';
      this.moveBoost = 105;
      this.marginRight = 120;      /* в бою даём достать до дальнего края двора */
      this.wave = 0;
      this.waveT = 1.6;
      this.waveActive = false;
      this.showBanner('ФИНАЛЬНАЯ АРЕНА', 'Зачисти двор и взорви штаб-квартиру (E)', 3);
      Snd.setIntensity(1.5);
    }

    spawnWave() {
      const c = this.cfg;
      const n = c.waves[this.wave] || 5;
      const bosses = c.waveBoss[this.wave] || 0;
      const right = this.cam.x + W + 60;
      for (let i = 0; i < n; i++) {
        const x = right + i * U.rand(60, 150);
        if (U.chance(0.25)) this.enemies.push(new CR.Dog(x));
        else this.enemies.push(new CR.Cop(x, { arena: true }));
      }
      for (let i = 0; i < bosses; i++) this.enemies.push(new CR.Boss(right + 260 + i * 220));
      /* немного припасов на волну */
      this.pickups.push(new CR.Pickup(this.cam.x + U.rand(120, 700), U.pick(['ammo', 'fuel', 'med'])));
      this.waveActive = true;
      this.showBanner('ВОЛНА ' + (this.wave + 1) + '/' + c.waves.length, 'Копы прут из-за баррикад', 2);
    }

    aliveHostiles() {
      return this.enemies.filter((e) => !e.dead && e.type !== 'civ').length;
    }

    updateArena(dt) {
      if (this.player.dead) return;

      if (!this.waveActive) {
        this.waveT -= dt;
        if (this.waveT <= 0 && this.wave < this.cfg.waves.length) this.spawnWave();
      } else if (this.aliveHostiles() === 0) {
        this.waveActive = false;
        this.wave++;
        this.waveT = 2.2;
        if (this.wave >= this.cfg.waves.length) {
          this.showBanner('ДВОР ЗАЧИЩЕН', 'Заложи взрывчатку у штаба — клавиша E', 3);
          this.checkArenaDone();
        }
      }

      /* если взрывчатки нет — подбрасываем, иначе уровень не закрыть */
      if (!this.hqDown && this.player.bombs <= 0 &&
          !this.pickups.some((pu) => pu.kind === 'bomb') &&
          !(this.hq && this.hq.state === 'armed')) {
        this.bombDropT -= dt;
        if (this.bombDropT <= 0) {
          this.bombDropT = 6;
          this.pickups.push(new CR.Pickup(this.cam.x + U.rand(150, 520), 'bomb'));
          FX.pop(this.cam.x + W / 2, 150, 'СБРОС ВЗРЫВЧАТКИ', '#ff5a4a', 22, 'score');
        }
      }
      this.checkArenaDone();
    }

    checkArenaDone() {
      if (this.phase !== 'arena') return;
      if (this.hqDown && this.wave >= this.cfg.waves.length && !this.waveActive && this.aliveHostiles() === 0) {
        this.finish();
      }
    }

    finish() {
      if (this.phase === 'done') return;
      this.phase = 'done';
      this.locked = true;
      Snd.sawLevel(0);
      Snd.win();
      /* бонус за выживание и за оставшееся здоровье */
      const bonus = Math.round(this.player.hp * 5);
      this.score += bonus;
      this.bonus = bonus;
      this.game.onLevelComplete();
    }

    /* ------------------------------ отрисовка --------------------------- */
    draw(g) {
      const cam = this.cam;
      const camX = cam.x - cam.ox;
      g.save();
      g.translate(0, cam.oy);

      this.world.drawSky(g, camX);
      this.world.drawHouses(g, camX);
      for (const h of this.houses) h.draw(g, camX);
      this.world.drawGround(g, camX);
      for (const h of this.houses) h.drawZone(g, camX);
      this.world.drawLamps(g, camX, this.cfg.night);

      FX.drawDecals(g, camX);
      for (const c of this.cars) c.draw(g, camX);
      for (const pu of this.pickups) pu.draw(g, camX);
      for (const e of this.enemies) if (e.type !== 'boss') e.draw(g, camX);
      for (const e of this.enemies) if (e.type === 'boss') e.draw(g, camX);
      this.player.draw(g, camX);
      for (const b of this.bullets) b.draw(g, camX);

      FX.draw(g, camX);
      this.world.drawFore(g, camX);
      FX.drawPops(g, camX);

      g.restore();

      /* вспышка взрыва на весь экран */
      if (cam.flash > 0) {
        g.fillStyle = 'rgba(' + cam.flashColor + ',' + (cam.flash * 0.55) + ')';
        g.fillRect(0, 0, W, CR.H);
      }
    }

    /* прогресс уровня 0..1 — для полоски маршрута в HUD */
    progress() {
      if (this.phase === 'done') return 1;
      return U.clamp(this.cam.x / this.arenaX, 0, 1);
    }
  };
})();

/* =============================================================================
 *  entities.js — игрок, враги, пули, бонусы, машины и взрывающиеся дома.
 *  Координаты сущностей: x — центр, y — «под ногами» (уровень земли).
 *  Столкновения — обычные AABB, боксы отдаёт метод box().
 * ========================================================================== */
(function () {
  'use strict';
  const CR = window.CR, U = CR.Utils, Art = CR.Art, FX = CR.FX, Snd = CR.Sound;
  const G = CR.GROUND;
  const GRAV = 2150;

  /* ================================ ИГРОК ================================= */
  CR.Player = class Player {
    constructor(x) {
      this.type = 'player';
      this.x = x; this.y = G;
      this.vy = 0; this.onGround = true;
      this.hp = 100; this.maxHp = 100;
      this.fuel = 100; this.maxFuel = 100;
      this.ammo = 8; this.maxAmmo = 30;
      this.bombs = 1;
      this.state = 'run';
      this.anim = 0;
      this.scale = 1.15;
      this.sawT = 0; this.sawCd = 0; this.swingId = 1;
      this.shootCd = 0; this.shootFlash = 0;
      this.slideT = 0;
      this.invuln = 0;
      this.coyote = 0; this.jumpBuf = 0;
      this.dead = false; this.deadT = 0; this.rot = 0;
      this.sawNoise = 0;
    }

    get sawing() { return this.sawT > 0; }
    get sliding() { return this.slideT > 0; }

    box() {
      const h = this.sliding ? 44 : 84;
      return { x: this.x - 19, y: this.y - h, w: 38, h };
    }
    /* зона поражения бензопилой */
    sawBox() {
      return this.sliding
        ? { x: this.x + 2, y: this.y - 46, w: 70, h: 46 }
        : { x: this.x + 4, y: this.y - 80, w: 74, h: 76 };
    }

    die(L) {
      if (this.dead) return;
      this.dead = true; this.hp = 0; this.deadT = 0;
      this.vy = -560;
      FX.gore(this.x, this.y - 40, 18, 0);
      FX.blood(this.x, this.y - 50, 26, 0, 1.4);
      /* надпись вешаем по центру кадра, а не над телом — тело улетает */
      FX.pop(L.cam.x + CR.W / 2, 210, 'GAME OVER', '#ff4d5e', 56);
      Snd.sawLevel(0); Snd.scream('low'); Snd.lose();
      L.cam.kick(20, 0.65, '180,20,30');
    }

    hurt(dmg, L, fromX) {
      if (this.dead || this.invuln > 0) return;
      this.hp -= dmg;
      this.invuln = 0.9;
      FX.blood(this.x, this.y - 44, 10, fromX > this.x ? -1 : 1, 0.9);
      Snd.hurt();
      L.cam.kick(7, 0.22, '200,30,40');
      L.breakCombo();
      if (this.hp <= 0) this.die(L);
    }

    heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }

    update(dt, L) {
      if (this.dead) {
        this.deadT += dt;
        this.vy += GRAV * dt;
        this.y += this.vy * dt;
        this.rot += dt * 7;
        this.x += 40 * dt;
        if (this.y > G) { this.y = G; this.vy *= -0.35; if (Math.abs(this.vy) < 60) this.vy = 0; }
        return;
      }

      this.invuln = Math.max(0, this.invuln - dt);
      this.sawCd = Math.max(0, this.sawCd - dt);
      this.shootCd = Math.max(0, this.shootCd - dt);
      this.shootFlash = Math.max(0, this.shootFlash - dt);

      const canAct = !L.locked;

      /* --------------------------- горизонталь --------------------------- */
      let dx = L.scrollSpeed;
      if (canAct) {
        const boost = L.moveBoost || 0;
        if (CR.held('RIGHT')) dx += 165 + boost;
        if (CR.held('LEFT')) dx -= 205 + boost;
      }
      if (this.sliding) dx += 90;
      this.x += dx * dt;
      this.x = U.clamp(this.x, L.cam.x + 40, L.cam.x + CR.W - (L.marginRight || 210));
      if (L.minX !== undefined) this.x = Math.max(this.x, L.minX);

      /* ----------------------------- прыжок ------------------------------ */
      if (this.onGround) this.coyote = 0.1; else this.coyote = Math.max(0, this.coyote - dt);
      if (canAct && CR.tapped('JUMP')) this.jumpBuf = 0.14;
      else this.jumpBuf = Math.max(0, this.jumpBuf - dt);

      if (this.jumpBuf > 0 && this.coyote > 0) {
        this.vy = -740; this.onGround = false; this.coyote = 0; this.jumpBuf = 0;
        this.slideT = 0;
        Snd.jump();
        FX.smoke(this.x, this.y - 4, 3, 0.35, '#c8c0b0');
      }
      /* короткий прыжок при отпускании */
      if (!CR.held('JUMP') && this.vy < -260) this.vy += 1500 * dt;

      this.vy += GRAV * dt;
      this.y += this.vy * dt;
      if (this.y >= G) {
        if (!this.onGround) FX.smoke(this.x, G - 2, 3, 0.3, '#c8c0b0');
        this.y = G; this.vy = 0; this.onGround = true;
      } else this.onGround = false;

      /* ----------------------------- подкат ------------------------------ */
      if (this.slideT > 0) {
        this.slideT -= dt;
        if (!this.onGround) this.slideT = 0;
        if (this.slideT <= 0.35 && U.chance(0.5)) FX.smoke(this.x - 20, G - 3, 1, 0.25, '#c8c0b0');
      } else if (canAct && this.onGround && CR.tapped('DUCK')) {
        this.slideT = 0.62; Snd.slide();
        FX.smoke(this.x - 10, G - 3, 4, 0.3, '#c8c0b0');
      }

      /* --------------------------- бензопила ----------------------------- */
      if (canAct && CR.held('SAW') && this.sawCd <= 0) {
        const dry = this.fuel <= 0;
        this.sawT = dry ? 0.42 : 0.26;
        this.sawCd = dry ? 0.52 : 0.3;
        this.swingId++;
        this.fuel = Math.max(0, this.fuel - 3.5);
        Snd.sawLevel(1);
        this.sawNoise = 0.35;
      }
      if (this.sawT > 0) {
        this.sawT -= dt;
        L.sawSweep(this);                        /* урон наносит уровень */
      }
      this.sawNoise = Math.max(0, this.sawNoise - dt);
      Snd.sawLevel(this.sawNoise > 0 ? 1 : 0.22);

      /* ---------------------------- пистолет ----------------------------- */
      if (canAct && CR.held('SHOOT') && this.shootCd <= 0) {
        if (this.ammo > 0) {
          this.ammo--;
          this.shootCd = 0.3;
          this.shootFlash = 0.09;
          const by = this.y - (this.sliding ? 26 : 46);
          L.spawnBullet(this.x + 26, by, 980, 0, 3, 'player');
          FX.sparks(this.x + 34, by, 5, '#ffe9a0');
          Snd.shot();
          L.cam.kick(2.5);
        } else {
          this.shootCd = 0.25;
          Snd.empty();
          FX.pop(this.x, this.y - 96, 'ПУСТО', '#ff9d3a', 20, 'score');
        }
      }

      /* ---------------------------- взрывчатка ---------------------------- */
      if (canAct && CR.tapped('BOMB')) L.tryPlant(this);

      /* восстановление бензина «на холостых» — чуть-чуть */
      this.fuel = Math.min(this.maxFuel, this.fuel + 1.1 * dt);

      /* анимация */
      this.anim += dt * (this.sliding ? 6 : 13);
      this.state = this.dead ? 'dead' : (this.sliding ? 'slide'
        : (!this.onGround ? 'jump' : (this.sawT > 0 ? 'saw'
          : (this.shootFlash > 0 ? 'shoot' : 'run'))));
    }

    draw(g, camX) {
      const sx = this.x - camX;
      if (this.invuln > 0 && Math.floor(this.invuln * 22) % 2 === 0 && !this.dead) return;
      const A = Art.sheets;
      if (this.dead) {
        g.save();
        g.translate(sx, this.y);
        g.rotate(this.rot);
        g.translate(-sx, -this.y);
        Art.draw(g, A.player_dead, 0, sx, this.y, false, this.scale);
        g.restore();
        return;
      }
      switch (this.state) {
        case 'slide': Art.draw(g, A.player_slide, (this.anim | 0) % 2, sx, this.y, false, this.scale); break;
        case 'jump': Art.draw(g, A.player_jump, this.vy < 0 ? 0 : 1, sx, this.y, false, this.scale); break;
        case 'saw': {
          const k = 1 - Math.max(0, this.sawT) / 0.3;
          Art.draw(g, A.player_saw, U.clamp(Math.floor(k * 4), 0, 3), sx, this.y, false, this.scale);
          /* размазанная дуга реза */
          g.save();
          g.globalAlpha = 0.35 * (1 - k);
          g.strokeStyle = '#fff3b0'; g.lineWidth = 5;
          g.beginPath();
          g.arc(sx + 14, this.y - 48, 58, -1.1 + k * 1.6, 0.5 + k * 1.6);
          g.stroke();
          g.restore();
          break;
        }
        case 'shoot': Art.draw(g, A.player_shoot, this.shootFlash > 0.04 ? 1 : 0, sx, this.y, false, this.scale); break;
        default: Art.draw(g, A.player_run, this.anim | 0, sx, this.y, false, this.scale);
      }
    }
  };

  /* =============================== ВРАГИ ================================== */
  class Enemy {
    constructor(x, cfg) {
      this.x = x; this.y = G;
      this.vx = 0; this.vy = 0;
      this.dead = false;
      this.flash = 0;
      this.anim = Math.random() * 6;
      this.hitSwing = 0;
      this.scale = 1;
      this.stagger = 0;
      Object.assign(this, cfg);
      this.maxHp = this.hp;
    }
    box() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }

    hurt(dmg, weapon, L, fromX) {
      if (this.dead) return false;
      this.hp -= dmg;
      this.flash = 0.16;
      const dir = fromX !== undefined && fromX > this.x ? -1 : 1;
      if (this.hp <= 0) { this.kill(weapon, L, dir); return true; }
      FX.blood(this.x, this.y - this.h * 0.6, 7, dir, 0.8);
      Snd.gore();
      this.stagger = 0.18;
      return false;
    }

    kill(weapon, L, dir) {
      this.dead = true;
      const cy = this.y - this.h * 0.55;
      FX.gore(this.x, cy, weapon === 'saw' ? 14 : 8, dir);
      if (weapon === 'saw') { FX.killWord(this.x, cy - 26); Snd.gore(); }
      else if (weapon === 'bullet') { FX.shotWord(this.x, cy - 26); }
      Snd.scream(this.type === 'dog' ? 'low' : (this.type === 'boss' ? 'low' : 'hi'));
      FX.decal(this.x, G, 60, '#a01824');
      L.onKill(this, weapon);
    }

    /* общий физический шаг: гравитация + сдвиг */
    step(dt) {
      this.x += this.vx * dt;
      if (this.vy || this.y < G) {
        this.vy += GRAV * dt;
        this.y += this.vy * dt;
        if (this.y > G) { this.y = G; this.vy = 0; }
      }
      this.flash = Math.max(0, this.flash - dt);
      if (this.stagger) this.stagger = Math.max(0, this.stagger - dt);
      this.anim += dt * this.animSpeed;
    }

    drawSheet(g, camX, sheet, frame, flip) {
      const sx = this.x - camX;
      if (this.flash > 0) Art.drawFlash(g, sheet, frame, sx, this.y, flip, this.scale, '#ffffff', this.flash * 5);
      else Art.draw(g, sheet, frame, sx, this.y, flip, this.scale);
    }
  }
  CR.Enemy = Enemy;

  /* ------------------------------ прохожий -------------------------------- */
  CR.Civilian = class Civilian extends Enemy {
    constructor(x) {
      super(x, {
        type: 'civ', hp: 1, w: 34, h: 80, animSpeed: 10, scale: 1.15,
        score: 50, pal: U.randInt(0, 3), panic: false, yell: 0
      });
      this.vx = U.rand(20, 55);
    }
    update(dt, L) {
      const p = L.player;
      const d = this.x - p.x;
      if (!this.panic && d < 330 && d > -60) {
        this.panic = true;
        this.vx = U.rand(165, 235);
        this.animSpeed = 16;
        if (U.chance(0.55)) Snd.scream('hi');
        FX.pop(this.x, this.y - 92, U.chance(0.5) ? 'А-А-А!' : 'ПОМОГИТЕ!', '#ffffff', 18, 'score');
      }
      if (this.panic && U.chance(dt * 0.8)) this.vx = U.rand(150, 245);
      this.step(dt);
    }
    draw(g, camX) {
      const sheet = Art.sheets['civ' + this.pal];
      this.drawSheet(g, camX, sheet, this.anim | 0, false);
    }
  };

  /* ----------------------------- полицейский ------------------------------ */
  CR.Cop = class Cop extends Enemy {
    constructor(x, opt) {
      super(x, {
        type: 'cop', hp: 3, w: 36, h: 82, animSpeed: 9, scale: 1.15,
        score: 50, fireCd: U.rand(0.7, 1.6), aim: 0, retreat: 0,
        standoff: 520                      /* дистанция, с которой удобно стрелять */
      });
      if (opt && opt.arena) { this.fireCd = U.rand(0.3, 1.2); this.standoff = U.rand(250, 400); }
    }
    update(dt, L) {
      const p = L.player;
      const d = this.x - p.x;
      this.vx = 0;
      if (d > this.standoff && !p.dead) this.vx = -120;   /* подходит на дистанцию огня */
      if (d > 120 && d < 640 && !p.dead) {
        /* целится и стреляет */
        this.fireCd -= dt;
        this.aim = Math.max(this.aim, 0.01);
        if (this.fireCd <= 0.45 && this.fireCd > 0) this.aim = 1;
        if (this.fireCd <= 0) {
          this.fireCd = U.rand(1.5, 2.4);
          this.aim = 0.35;
          L.spawnBullet(this.x - 24, this.y - 48, -560, 0, 10, 'enemy');
          FX.sparks(this.x - 30, this.y - 48, 4, '#ffe9a0');
          Snd.copShot();
        }
      } else if (d <= 120 && d > -40) {
        this.vx = 70;                      /* пятится от маньяка */
        this.aim = 0;
      } else if (d <= -40) {
        this.aim = 0;
        this.vx = 60;                      /* остался позади — догоняет */
      }
      if (this.stagger) this.vx = 90;
      this.step(dt);
    }
    draw(g, camX) {
      if (this.aim >= 1) this.drawSheet(g, camX, Art.sheets.cop_aim, this.fireCd < 0.5 ? 1 : 0, false);
      else if (this.aim > 0) this.drawSheet(g, camX, Art.sheets.cop_aim, 0, false);
      else this.drawSheet(g, camX, Art.sheets.cop_run, this.anim | 0, this.vx < 0);
    }
  };

  /* -------------------------------- собака -------------------------------- */
  CR.Dog = class Dog extends Enemy {
    constructor(x) {
      super(x, {
        type: 'dog', hp: 1, w: 64, h: 46, animSpeed: 17, scale: 1.2,
        score: 50, biteCd: 0, bark: U.rand(0.4, 1.6)
      });
    }
    update(dt, L) {
      const p = L.player;
      this.biteCd = Math.max(0, this.biteCd - dt);
      this.bark -= dt;
      if (this.bark <= 0) { this.bark = U.rand(1.4, 3); if (Math.abs(this.x - p.x) < 500) Snd.bark(); }
      this.vx = p.dead ? 60 : (this.x > p.x ? -180 : 260);
      if (this.stagger) this.vx = 150;
      this.step(dt);
      if (!p.dead && this.biteCd <= 0 && U.aabb(this.box(), p.box())) {
        this.biteCd = 0.85;
        p.hurt(9, L, this.x);
        FX.pop(this.x, this.y - 60, 'ГРЫЗЬ!', '#ff9d3a', 22);
        Snd.bark();
        this.vx = 260;
      }
    }
    draw(g, camX) {
      this.drawSheet(g, camX, Art.sheets.dog, this.anim | 0, this.vx > 0);
    }
  };

  /* -------------------------- мини-босс в бронике -------------------------- */
  CR.Boss = class Boss extends Enemy {
    constructor(x, hp) {
      super(x, {
        type: 'boss', hp: hp || 13, w: 52, h: 112, animSpeed: 7,
        score: 300, fireCd: 1.4, aim: 0, contactCd: 0
      });
      this.scale = 1.55;
    }
    update(dt, L) {
      const p = L.player;
      const d = this.x - p.x;
      this.contactCd = Math.max(0, this.contactCd - dt);
      this.vx = 0;
      if (!p.dead) {
        if (d > 300) this.vx = -95;
        else if (d < 150) this.vx = 90;
        this.fireCd -= dt;
        this.aim = this.fireCd < 0.55 ? 1 : 0;
        if (this.fireCd <= 0) {
          this.fireCd = U.rand(1.7, 2.4);
          Snd.shotgun();
          for (let i = -1; i <= 1; i++) {
            L.spawnBullet(this.x - 34, this.y - 76, -600, i * 110, 9, 'enemy', '#ffb03a');
          }
          FX.sparks(this.x - 40, this.y - 76, 10, '#ffd166');
          L.cam.kick(3);
        }
      }
      if (this.stagger) this.vx = 60;
      this.step(dt);
      if (!p.dead && this.contactCd <= 0 && U.aabb(this.box(), p.box())) {
        this.contactCd = 1.1;
        p.hurt(12, L, this.x);
      }
    }
    draw(g, camX) {
      if (this.aim) this.drawSheet(g, camX, Art.sheets.boss_aim, this.fireCd < 0.12 ? 1 : 0, false);
      else this.drawSheet(g, camX, Art.sheets.boss_run, this.anim | 0, this.vx > 0);
      /* полоска здоровья над головой */
      const sx = this.x - camX, top = this.y - this.h - 20;
      const w = 70;
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(sx - w / 2 - 2, top - 2, w + 4, 11);
      g.fillStyle = '#ff4d5e'; g.fillRect(sx - w / 2, top, w * Math.max(0, this.hp / this.maxHp), 7);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(sx - w / 2, top, w * Math.max(0, this.hp / this.maxHp), 2);
    }
  };

  /* ================================ ПУЛИ ================================== */
  CR.Bullet = class Bullet {
    constructor(x, y, vx, vy, dmg, owner, color) {
      this.x = x; this.y = y; this.vx = vx; this.vy = vy;
      this.dmg = dmg; this.owner = owner;
      this.color = color || (owner === 'player' ? '#fff3b0' : '#9ae7ff');
      this.life = 1.6; this.dead = false;
      this.trail = 0;
    }
    box() { return { x: this.x - 6, y: this.y - 3, w: 12, h: 6 }; }
    update(dt) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.life -= dt;
      if (this.life <= 0) this.dead = true;
    }
    draw(g, camX) {
      const sx = this.x - camX;
      g.fillStyle = this.color;
      g.fillRect(sx - 7, this.y - 2, 14, 4);
      g.globalAlpha = 0.4;
      g.fillRect(sx - 7 - Math.sign(this.vx) * 16, this.y - 1.5, 18, 3);
      g.globalAlpha = 1;
    }
  };

  /* ================================ БОНУСЫ ================================ */
  const PU = {
    ammo: { sheet: 'pu_ammo', label: '+ПАТРОНЫ', color: '#ffd166' },
    fuel: { sheet: 'pu_fuel', label: '+БЕНЗИН', color: '#ff8a2b' },
    bomb: { sheet: 'pu_bomb', label: '+ВЗРЫВЧАТКА', color: '#ff5a4a' },
    med: { sheet: 'pu_med', label: '+АПТЕЧКА', color: '#9dff6e' }
  };
  CR.Pickup = class Pickup {
    constructor(x, kind, y) {
      this.x = x; this.y = (y || G - 26); this.kind = kind;
      this.t = Math.random() * 6; this.dead = false;
    }
    box() { return { x: this.x - 22, y: this.y - 40, w: 44, h: 48 }; }
    update(dt, L) {
      this.t += dt;
      const p = L.player;
      if (p.dead) return;
      const d = U.dist(this.x, this.y, p.x, p.y - 36);
      if (d < 90) { this.x += (p.x - this.x) * 4 * dt; this.y += (p.y - 36 - this.y) * 4 * dt; }
      if (U.aabb(this.box(), p.box())) this.collect(L);
    }
    collect(L) {
      const p = L.player;
      this.dead = true;
      if (this.kind === 'ammo') p.ammo = Math.min(p.maxAmmo, p.ammo + 6);
      else if (this.kind === 'fuel') p.fuel = Math.min(p.maxFuel, p.fuel + 55);
      else if (this.kind === 'bomb') p.bombs++;
      else if (this.kind === 'med') p.heal(35);
      FX.pop(this.x, this.y - 40, PU[this.kind].label, PU[this.kind].color, 20, 'score');
      FX.sparks(this.x, this.y - 16, 8, PU[this.kind].color);
      Snd.pickup();
      L.stats.pickups++;
    }
    draw(g, camX) {
      const sx = this.x - camX;
      const bob = Math.sin(this.t * 3.4) * 5;
      g.save();
      g.globalAlpha = 0.25;
      g.fillStyle = PU[this.kind].color;
      g.beginPath(); g.ellipse(sx, G - 2, 22, 6, 0, 0, 6.3); g.fill();
      g.restore();
      Art.draw(g, Art.sheets[PU[this.kind].sheet], 0, sx, this.y + bob, false, 1);
    }
  };

  /* ============================== МАШИНЫ ================================== */
  CR.Car = class Car {
    constructor(x, variant) {
      this.x = x; this.y = G;
      this.variant = variant === undefined ? U.randInt(0, 2) : variant;
      this.hp = 8; this.dead = false; this.flash = 0;
      this.hitCd = 0; this.alarm = 0;
    }
    box() { return { x: this.x - 66, y: this.y - 62, w: 132, h: 62 }; }
    hurt(dmg, weapon, L, fromX) {
      this.hp -= dmg; this.flash = 0.12;
      FX.sparks(this.x + (fromX < this.x ? -60 : 60), this.y - 40, 6, '#ffd166');
      if (this.hp <= 0) { this.explode(L); return true; }
      return false;
    }
    explode(L) {
      if (this.dead) return;
      this.dead = true;
      FX.fireball(this.x, this.y - 34, 1.1);
      FX.debris(this.x, this.y - 30, 16, ['#b9c0cc', '#3a3a42', '#e04a3c', '#1b1b22'], 1.1);
      Snd.explode();
      L.cam.kick(16, 0.45, '255,180,90');
      L.blast(this.x, this.y - 30, 170, 120);
      L.stats.cars++;
    }
    update(dt, L) {
      this.flash = Math.max(0, this.flash - dt);
      this.hitCd = Math.max(0, this.hitCd - dt);
      const p = L.player;
      if (!p.dead && this.hitCd <= 0 && U.aabb(this.box(), p.box())) {
        this.hitCd = 1.2;
        p.hurt(13, L, this.x - 200);
        p.x -= 26;
        FX.sparks(p.x + 20, p.y - 40, 8, '#ffd166');
        FX.pop(this.x, this.y - 80, 'БАМ!', '#ffd166', 26);
      }
    }
    draw(g, camX) {
      const sheet = Art.sheets['car' + this.variant];
      const sx = this.x - camX;
      g.save(); g.globalAlpha = 0.3; g.fillStyle = '#000';
      g.beginPath(); g.ellipse(sx, G - 2, 68, 7, 0, 0, 6.3); g.fill(); g.restore();
      if (this.flash > 0) Art.drawFlash(g, sheet, 0, sx, this.y, false, 1, '#ffffff', this.flash * 6);
      else Art.draw(g, sheet, 0, sx, this.y, false, 1);
    }
  };

  /* ======================== ДОМА С ЗАКЛАДКОЙ ============================== */
  CR.House = class House {
    constructor(x, opt) {
      opt = opt || {};
      this.x = x;
      this.w = opt.w || 250;
      this.h = opt.h || 215;
      this.hq = !!opt.hq;                 /* штаб-квартира в финале */
      this.state = 'idle';                /* idle | armed | destroyed */
      this.fuse = 0; this.beep = 0;
      this.zoneX = x;                     /* точка закладки — по центру фасада */
      this.zoneW = 150;
      this.t = Math.random() * 6;
      this.wall = opt.wall || U.pick(['#e8d7bc', '#d9b38c', '#cfe0e8', '#e6c2c2']);
      this.roof = opt.roof || U.pick(['#7a3b3b', '#4a4f6b', '#6b4a2f', '#3f6b5a']);
      if (this.hq) { this.wall = '#8e97a8'; this.roof = '#2f3550'; this.w = 320; this.h = 260; }
      this.dead = false;                  /* дома не удаляются, пока видны */
    }
    inZone(p) { return Math.abs(p.x - this.zoneX) < this.zoneW / 2 && this.state === 'idle'; }

    arm(L) {
      this.state = 'armed';
      this.fuse = this.hq ? 2.6 : 1.9;
      this.beep = 0;
      Snd.plant();
      FX.pop(this.zoneX, G - 70, 'ЗАЛОЖЕНО!', '#ff5a4a', 24);
    }

    update(dt, L) {
      this.t += dt;
      if (this.state !== 'armed') return;
      this.fuse -= dt;
      this.beep -= dt;
      if (this.beep <= 0) { this.beep = Math.max(0.09, this.fuse * 0.25); Snd.beep(); }
      if (this.fuse <= 0) this.explode(L);
    }

    explode(L) {
      this.state = 'destroyed';
      const bx = this.x, by = G - 40;
      FX.fireball(bx, by - 60, this.hq ? 2.6 : 1.9);
      FX.fireball(bx - 70, by - 20, 1.2);
      FX.fireball(bx + 70, by - 30, 1.2);
      FX.debris(bx, by - 50, this.hq ? 46 : 32, [this.wall, this.roof, '#d9cbb2', '#6e747e', '#8c6238'], 1.5);
      FX.smoke(bx, by - 40, 18, 2.2);
      FX.boomWord(bx, G - 190);
      Snd.explode();
      L.cam.kick(this.hq ? 30 : 22, 0.75, '255,190,90');
      const killed = L.blast(bx, by - 40, this.hq ? 420 : 300, 200);
      L.stats.houses++;
      const bonus = killed * 25;
      L.addScore(200 + bonus, bx, G - 230, '#ff8a2b');
      if (bonus) FX.pop(bx, G - 270, 'ТОЛПА! +' + bonus, '#ffd166', 24, 'score');
      if (this.hq) L.onHQDown();
    }

    /* --------- отрисовка: корпус (за уровнем земли) и зона (поверх) -------- */
    draw(g, camX) {
      const sx = this.x - camX;
      if (sx < -this.w - 260 || sx > CR.W + this.w + 260) return;
      const base = G - 40;
      if (this.state === 'destroyed') { this.drawRubble(g, sx, base); return; }

      const x = sx - this.w / 2, y = base - this.h;
      /* тёмный контур отделяет цель от фонового ряда домов */
      g.fillStyle = 'rgba(18,12,24,.85)';
      g.fillRect(x - 5, y - 5, this.w + 10, this.h + 10);
      g.beginPath();
      g.moveTo(x - 27, y + 2); g.lineTo(sx, y - 69); g.lineTo(x + this.w + 27, y + 2);
      g.closePath(); g.fill();
      /* стены */
      g.fillStyle = this.wall; g.fillRect(x, y, this.w, this.h);
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x + this.w - 24, y, 24, this.h);
      g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(x, y, this.w, 6);
      /* крыша */
      g.fillStyle = this.roof;
      g.beginPath();
      g.moveTo(x - 20, y); g.lineTo(sx, y - 62); g.lineTo(x + this.w + 20, y); g.closePath(); g.fill();
      g.fillRect(x - 20, y, this.w + 40, 10);
      /* окна — у цели они заколочены досками */
      const cols = this.hq ? 4 : 3, rows = this.hq ? 3 : 2;
      for (let c = 0; c < cols; c++) {
        for (let r2 = 0; r2 < rows; r2++) {
          const wx = x + 26 + c * ((this.w - 74) / (cols - 1));
          const wy = y + 26 + r2 * 62;
          g.fillStyle = (c + r2) % 2 ? '#ffdf9a' : '#46506b';
          g.fillRect(wx, wy, 42, 38);
          g.fillStyle = 'rgba(0,0,0,.4)';
          g.fillRect(wx + 19, wy, 4, 38); g.fillRect(wx, wy + 17, 42, 4);
          if (!this.hq) {                       /* доски крест-накрест */
            g.fillStyle = '#8c6238';
            g.save(); g.translate(wx + 21, wy + 19); g.rotate(0.5);
            g.fillRect(-28, -5, 56, 9); g.rotate(-1.0); g.fillRect(-28, -5, 56, 9);
            g.restore();
          }
          g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2;
          g.strokeRect(wx - 1, wy - 1, 44, 40);
        }
      }
      /* дверь */
      g.fillStyle = '#6b4a2a'; g.fillRect(sx - 26, base - 74, 52, 74);
      g.fillStyle = '#ffd166'; g.fillRect(sx + 12, base - 42, 6, 6);

      /* вывеска: штаб полиции или «цель для подрыва» */
      const signW = this.hq ? 190 : 150;
      g.fillStyle = this.hq ? '#1b2a4a' : '#7d0f1c';
      g.fillRect(sx - signW / 2, y - 38, signW, 28);
      g.fillStyle = this.hq ? '#9ae7ff' : '#ffe14c';
      g.font = '900 18px Impact, "Arial Black", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(this.hq ? 'ПОЛИЦИЯ' : 'ПОД СНОС', sx, y - 23);

      /* пульсирующая стрелка над целью */
      const bob = Math.sin(this.t * 4) * 7;
      g.fillStyle = this.state === 'armed' ? '#ff5a4a' : '#ffd166';
      g.beginPath();
      g.moveTo(sx, y - 48 + bob);
      g.lineTo(sx - 18, y - 76 + bob);
      g.lineTo(sx + 18, y - 76 + bob);
      g.closePath(); g.fill();
    }

    /* зона закладки рисуется ПОСЛЕ земли, иначе её закрывает тротуар */
    drawZone(g, camX) {
      if (this.state === 'destroyed') return;
      const sx = this.x - camX;
      if (sx < -260 || sx > CR.W + 260) return;

      const pulse = 0.55 + Math.sin(this.t * 5) * 0.3;
      g.save();
      g.globalAlpha = this.state === 'armed' ? 0.3 : pulse * 0.75;
      g.strokeStyle = this.state === 'armed' ? '#ff5a4a' : '#ffd166';
      g.setLineDash([12, 9]); g.lineWidth = 4;
      g.strokeRect(sx - this.zoneW / 2, G - 84, this.zoneW, 82);
      g.setLineDash([]);
      g.restore();

      /* красный крест краской на асфальте */
      g.save();
      g.globalAlpha = 0.9;
      g.strokeStyle = '#d8342a'; g.lineWidth = 8;
      g.beginPath();
      g.moveTo(sx - 26, G - 22); g.lineTo(sx + 26, G - 2);
      g.moveTo(sx + 26, G - 22); g.lineTo(sx - 26, G - 2);
      g.stroke();
      g.restore();

      /* штабель канистр — намёк «сюда можно заложить» */
      const cans = [[-52, 0], [-34, 0], [-43, -16]];
      for (const [dx, dy] of cans) {
        g.fillStyle = '#c43a2a'; g.fillRect(sx + dx, G - 22 + dy, 16, 20);
        g.fillStyle = '#ff7a63'; g.fillRect(sx + dx, G - 22 + dy, 16, 4);
        g.fillStyle = '#ffe9a0'; g.fillRect(sx + dx + 5, G - 14 + dy, 6, 6);
      }

      if (this.state === 'armed') {
        Art.draw(g, Art.sheets.bomb_set, Math.floor(this.t * 12) % 2, sx + 40, G - 2, false, 1.2);
        g.font = '900 24px Impact, "Arial Black", sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 6; g.lineJoin = 'round'; g.strokeStyle = 'rgba(12,8,14,.9)';
        g.strokeText(this.fuse.toFixed(1), sx + 40, G - 54);
        g.fillStyle = '#ff5a4a';
        g.fillText(this.fuse.toFixed(1), sx + 40, G - 54);
      }
    }

    drawRubble(g, sx, base) {
      const seed = Math.abs(Math.floor(this.x));
      const hw = this.w / 2;
      /* обгоревшее пятно на земле */
      g.fillStyle = 'rgba(20,14,18,.45)';
      g.beginPath(); g.ellipse(sx, base + 4, hw * 1.05, 22, 0, 0, 6.3); g.fill();
      /* остатки стен — два зубчатых огрызка */
      g.fillStyle = this.wall;
      g.beginPath();
      g.moveTo(sx - hw, base);
      g.lineTo(sx - hw, base - 108);
      g.lineTo(sx - hw + 34, base - 92);
      g.lineTo(sx - hw + 44, base - 122);
      g.lineTo(sx - hw + 78, base - 64);
      g.lineTo(sx - hw + 96, base);
      g.closePath(); g.fill();
      g.beginPath();
      g.moveTo(sx + hw, base);
      g.lineTo(sx + hw, base - 84);
      g.lineTo(sx + hw - 40, base - 96);
      g.lineTo(sx + hw - 58, base - 52);
      g.lineTo(sx + hw - 84, base);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(20,12,10,.35)';
      g.fillRect(sx - hw, base - 52, 96, 52);
      g.fillRect(sx + hw - 84, base - 40, 84, 40);
      /* куча обломков посередине */
      g.fillStyle = '#6e6355';
      g.beginPath();
      g.moveTo(sx - hw + 60, base);
      g.lineTo(sx - 30, base - 66);
      g.lineTo(sx + 10, base - 38);
      g.lineTo(sx + 54, base - 76);
      g.lineTo(sx + hw - 60, base);
      g.closePath(); g.fill();
      g.fillStyle = this.wall;
      for (let i = 0; i < 16; i++) {
        const r1 = ((seed + i * 97) % 100) / 100, r2 = ((seed + i * 57) % 100) / 100;
        g.fillRect(sx - hw + r1 * this.w, base - 12 - r2 * 70, 16 + r2 * 16, 12 + r1 * 12);
      }
      g.fillStyle = this.roof;
      for (let i = 0; i < 8; i++) {
        const r1 = ((seed + i * 31) % 100) / 100, r2 = ((seed + i * 13) % 100) / 100;
        g.fillRect(sx - hw + r1 * this.w, base - 18 - r2 * 40, 24, 11);
      }
      /* торчащие балки */
      g.strokeStyle = '#4a3526'; g.lineWidth = 7;
      g.beginPath();
      g.moveTo(sx - 40, base); g.lineTo(sx + 6, base - 92);
      g.moveTo(sx + 36, base); g.lineTo(sx + 2, base - 74);
      g.stroke();
      /* тлеет */
      if (Math.random() < 0.09) CR.FX.smoke(this.x + U.rand(-70, 70), base - 60, 1, 1.1);
      if (Math.random() < 0.05) CR.FX.sparks(this.x + U.rand(-60, 60), base - 40, 1, '#ff8a2b');
    }
  };
})();

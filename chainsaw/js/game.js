/* ============================================================================
   game.js — the orchestrator: input, entity lists, the beat/wave sequences,
   scoring and combo, the render order, and the state machine that ties the
   menu, the level, death and the results screen together.
   ========================================================================== */
(function () {
  'use strict';
  const CR = window.CR, M = CR.M, P = CR.Particles, C = CR.Collide;

  const KEYMAP = {
    jump: ['Space', 'ArrowUp', 'KeyW'],
    slide: ['ArrowDown', 'KeyS'],
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    attack: ['KeyZ'],
    shoot: ['KeyX'],
    plant: ['KeyE']
  };

  class Input {
    constructor(canvas) {
      this.down = Object.create(null);
      this.edge = Object.create(null);
      this.mouse = [false, false, false];
      this.mouseEdge = [false, false, false];
      window.addEventListener('keydown', (e) => {
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) e.preventDefault();
        if (!e.repeat) this.edge[e.code] = true;
        this.down[e.code] = true;
      });
      window.addEventListener('keyup', (e) => { this.down[e.code] = false; });
      window.addEventListener('blur', () => { this.down = Object.create(null); this.mouse = [false, false, false]; });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      canvas.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const b = Math.min(e.button, 2);
        if (!this.mouse[b]) this.mouseEdge[b] = true;
        this.mouse[b] = true;
      });
      window.addEventListener('mouseup', (e) => { this.mouse[Math.min(e.button, 2)] = false; });
    }
    held(action) {
      const keys = KEYMAP[action];
      for (const k of keys) if (this.down[k]) return true;
      if (action === 'attack' && this.mouse[0]) return true;
      if (action === 'shoot' && this.mouse[2]) return true;
      return false;
    }
    pressed(action) {
      const keys = KEYMAP[action];
      for (const k of keys) if (this.edge[k]) return true;
      if (action === 'attack' && this.mouseEdge[0]) return true;
      if (action === 'shoot' && this.mouseEdge[2]) return true;
      return false;
    }
    key(code) { return !!this.edge[code]; }
    endFrame() {
      this.edge = Object.create(null);
      this.mouseEdge[0] = this.mouseEdge[1] = this.mouseEdge[2] = false;
    }
    clear() { this.down = Object.create(null); this.endFrame(); this.mouse = [false, false, false]; }
  }

  const SCORE = { civilian: 50, police: 100, dog: 75, swat: 150, boss: 500, car: 75, building: 200 };

  CR.Game = class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.W = 1920; this.H = 1080;
      this.input = new Input(canvas);
      this.cam = new CR.Camera(this.W, this.H);
      this.fx = new CR.PostFX();
      this.fx.attach(canvas, this.ctx);
      this.audio = new CR.Audio();
      this.ui = new CR.UI(this);
      this.state = 'menu';
      this.quality = 'high';
      this.time = 0;
      this.timeScale = 1;
      this.slowT = 0; this.slowTarget = 1;
      this.timers = [];
      this.paused = false;
      this.resize(window.innerWidth, window.innerHeight);
      this.ui.show('menu');
    }

    setQuality(q) {
      this.quality = q;
      this.fx.setQuality(q);
      P.setQuality(q);
      this.resize(window.innerWidth, window.innerHeight);
    }

    resize(winW, winH) {
      const aspect = 16 / 9;
      let w = winW, h = Math.round(w / aspect);
      if (h > winH) { h = winH; w = Math.round(h * aspect); }
      const dprCap = this.quality === 'high' ? 1 : (this.quality === 'medium' ? .82 : .66);
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * dprCap;
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.W = Math.round(Math.min(1920, w * dpr));
      this.H = Math.round(this.W / aspect);
      this.canvas.width = this.W;
      this.canvas.height = this.H;
      this.ctx.imageSmoothingEnabled = true;
      this.cam.W = this.W; this.cam.H = this.H;
      this.fx.resize(this.W, this.H);
    }

    /* ============================ lifecycle ============================= */
    /* A slow pan over the street sits behind the menu instead of black. */
    ensureMenuScene() {
      if (this.menuLevel) return;
      this.menuLevel = new CR.Level(this);
      this.menuCam = new CR.Camera(this.W, this.H);
      this.menuCam.reset(5200, CR.GROUND - 330);
      this.menuCam.targetZoom = 1.06;
      this.menuCam.zoom = 1.06;
    }

    toMenu() {
      this.state = 'menu';
      this.audio.stopMusic();
      this.audio.sawLevel(0);
      this.ui.bars(false);
      this.ui.show('menu');
    }

    startLevel() {
      this.audio.init(); this.audio.resume();
      P.reset();
      this.level = new CR.Level(this);
      this.player = new CR.Player(this, 400);
      this.enemies = [];
      this.bullets = [];
      this.pickups = [];
      this.cars = [];
      this.timers = [];
      this.score = 0;
      this.combo = 0; this.comboT = 0; this.comboMax = 3;
      this.time = 0;
      this.timeScale = 1; this.slowT = 0;
      this.combatLock = false;
      this.cinematic = null;
      this.levelBounds = null;
      this.boss = null;
      this.hurtFlash = 0;
      this.arena = { active: false, wave: 0, total: 4, remaining: 0, phase: 'idle', timer: 0, cleared: false };
      this.finalPhase = null;
      this.mercyUsed = false;
      this.stats = {
        civilians: 0, police: 0, dogs: 0, swat: 0, bosses: 0,
        buildings: 0, cars: 0, pickups: 0, maxCombo: 0, time: 0, shotsFired: 0
      };
      this.cam.reset(this.player.x + 320, CR.GROUND - 330);
      this.cam.shakeScale = (parseFloat(document.getElementById('setShake').value) || 100) / 100;
      this.ui.hideAll();
      this.ui.startIntro();
      this.state = 'intro';
      this.input.clear();
      this.audio.startMusic('calm');
      this.audio.setIntensity(.35);
      this.audio.duckMusic(1, .1);
    }

    nextLevel() {
      /* Level 02 is not built yet — the button restarts the slice with a
         harder ruleset so it stays functional rather than dead. */
      this.ui.toast('LEVEL 02 — DOWNTOWN: COMING SOON', 2.4);
      this.startLevel();
    }

    setPaused(v) {
      if (this.state !== 'play' && this.state !== 'pause') return;
      this.paused = v;
      this.state = v ? 'pause' : 'play';
      if (v) {
        this.audio.sawLevel(0);
        this.audio.duckMusic(.25, .1);
        this.ui.show('pause');
      } else {
        this.audio.duckMusic(1, .2);
        this.ui.hideAll();
        this.input.clear();
      }
    }

    slowmo(duration, scale) {
      this.slowT = Math.max(this.slowT, duration);
      this.slowTarget = Math.min(this.slowTarget, scale);
    }

    /* ============================== scoring ============================= */
    addScore(amount, x, y, color, label) {
      const mult = 1 + Math.min(this.combo, 20) * .1;
      const total = Math.round(amount * mult);
      this.score += total;
      if (x !== undefined) {
        this.ui.float(x, y, (label ? label + ' ' : '') + '+' + M.commas(total), color || '#ffd479',
          Math.min(52, 26 + this.combo * 1.4));
      }
      return total;
    }

    bumpCombo() {
      this.combo++;
      this.comboT = this.comboMax;
      this.ui.comboPunch = 1;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
      if (this.combo % 5 === 0) {
        this.audio.play('uiSelect');
        this.cam.shake(.12);
      }
      if (this.combo >= 10) {
        this.fx.addAberration(.25);
        this.audio.setIntensity(1);
      }
      if (this.combo === 10) this.ui.banner('CHAIN x10', 1.2);
      if (this.combo === 20) this.ui.banner('CHAIN x20  —  UNSTOPPABLE', 1.4);
    }
    breakCombo() { this.combo = 0; this.comboT = 0; }

    onKill(enemy, source) {
      const type = enemy.type;
      if (type === 'civilian') this.stats.civilians++;
      else if (type === 'police') this.stats.police++;
      else if (type === 'dog') this.stats.dogs++;
      else if (type === 'swat') this.stats.swat++;
      else if (type === 'boss') this.stats.bosses++;
      this.bumpCombo();
      const base = SCORE[type] || 50;
      this.addScore(base, enemy.x, enemy.centerY() - 40,
        source === 'chainsaw' ? '#ff5436' : (source === 'explosion' ? '#ffb03a' : '#ffd479'));
      if (source === 'chainsaw') this.slowmo(.06, .5);
      if (type === 'boss') this.onBossDown();
      if (this.arena.active) this.arena.remaining = this.countHostiles();
    }

    onBuildingDestroyed(b) {
      this.stats.buildings++;
      const killed = CR.Weapons.explode(this, b.x, CR.GROUND - 120, {
        power: b.hq ? 2.4 : 1.6,
        radius: b.hq ? 1100 : 720,
        damage: 400,
        playerDamage: b.hq ? 0 : 30,
        debrisColors: ['#7a6a58', '#95826c', '#5d5348', '#b9a996', '#2f2a24']
      });
      /* secondary blasts rolling through the structure */
      for (let i = 1; i <= (b.hq ? 5 : 3); i++) {
        this.timers.push({
          t: i * .22, fn: () => {
            P.fire(b.x + M.rand(-260, 260), CR.GROUND - M.rand(60, 300), 10, 1.4);
            P.smoke(b.x + M.rand(-260, 260), CR.GROUND - 200, 6, 2.4, { vy: -200, alpha: .5, lifeScale: 2 });
            this.cam.shake(.25);
            this.audio.explosion(.7);
          }
        });
      }
      const bonus = killed * 50;
      this.addScore(SCORE.building + bonus, b.x, CR.GROUND - 420, '#ffb03a',
        killed ? 'DEMOLITION +' + killed + ' CAUGHT' : 'DEMOLITION');
      this.ui.banner(b.hq ? 'PRECINCT LEVELLED' : 'BUILDING DOWN', 1.8);
      if (b.hq) this.onHQDown();
    }

    onChargePlanted(b) {
      if (b.hq) {
        this.cinematic = 'escape';
        this.combatLock = false;
        this.levelBounds = null;
        this.cam.unlock();
        this.cam.targetZoom = .70;
        this.cam.lookAhead = -540;      /* look back at what is about to go up */
        this.ui.bars(true);
        this.audio.duckMusic(.25, .8);
        this.ui.banner('GET CLEAR', 1.6);
      }
    }

    onHQDown() {
      this.finalPhase = 'done';
      this.audio.duckMusic(0, 1.5);
      this.timers.push({ t: 3.4, fn: () => this.completeLevel() });
    }

    onPlayerDead() {
      this.state = 'dying';
      this.audio.duckMusic(.2, .6);
      this.audio.setSection('calm');
      this.timers.push({
        t: 2.2, fn: () => {
          this.state = 'dead';
          this.stats.time = this.time;
          this.ui.showDeath(this.stats, this.score);
        }
      });
    }

    completeLevel() {
      if (this.state === 'complete') return;
      this.state = 'complete';
      this.stats.time = this.time;
      this.audio.stopMusic();
      this.audio.sawLevel(0);
      this.audio.play('levelComplete');
      this.ui.bars(false);
      this.ui.showResults(this.stats, this.score, this.rank());
    }

    rank() {
      const s = this.score;
      const st = this.stats;
      const kills = st.civilians + st.police + st.dogs + st.swat;
      let pts = 0;
      if (s >= 34000) pts += 3; else if (s >= 24000) pts += 2; else if (s >= 15000) pts += 1;
      if (st.maxCombo >= 25) pts += 2; else if (st.maxCombo >= 14) pts += 1;
      if (st.buildings >= 4) pts += 1;                 /* every house + the HQ */
      if (kills >= 110) pts += 2; else if (kills >= 75) pts += 1;
      if (this.player.hp > 55) pts += 1;
      return ['D', 'D', 'C', 'C', 'B', 'B', 'A', 'S', 'S', 'S+'][M.clamp(pts, 0, 9)];
    }

    countHostiles() {
      let n = 0;
      for (const e of this.enemies) if (!e.dead && !e.dying && e.type !== 'civilian') n++;
      return n;
    }

    /* ============================== spawning ============================ */
    spawnFromLevel(s) {
      const x = s.x;
      if (s.type === 'civilian') this.enemies.push(new CR.Civilian(this, x));
      else if (s.type === 'police') this.enemies.push(new CR.Police(this, x));
      else if (s.type === 'swat') this.enemies.push(new CR.Swat(this, x));
      else if (s.type === 'dog') this.enemies.push(new CR.Dog(this, x));
      else if (s.type === 'car') this.cars.push(new CR.Car(this, x));
      else if (s.type.indexOf('pickup:') === 0) {
        this.pickups.push(new CR.Pickup(this, x, s.type.split(':')[1]));
      }
    }

    /* ============================ boss sequence ========================= */
    startBoss() {
      if (this.boss) return;
      this.combatLock = true;
      this.cam.lockTo(this.player.x + 420);
      this.cam.targetZoom = .88;
      this.levelBounds = [this.player.x - 900, this.player.x + 1200];
      this.boss = new CR.Boss(this, this.player.x + 1050);
      this.enemies.push(this.boss);
      this.ui.banner('THE ENFORCER', 2.4);
      this.ui.bars(true);
      this.audio.setSection('boss');
      this.audio.setIntensity(1);
      this.cam.shake(.4);
      this.audio.play('bossGrunt');
    }

    onBossDown() {
      this.boss = null;
      this.ui.banner('TARGET DOWN', 1.8);
      this.ui.bars(false);
      this.cam.targetZoom = 1;
      this.timers.push({
        t: 2, fn: () => {
          if (this.state !== 'play') return;
          this.combatLock = false;
          this.levelBounds = null;
          this.cam.unlock();
          this.audio.setSection('combat');
        }
      });
    }

    /* =========================== arena sequence ======================== */
    startArena() {
      const a = this.arena;
      if (a.active) return;
      a.active = true; a.wave = 0; a.phase = 'between'; a.timer = 2.2;
      this.combatLock = true;
      this.cam.lockTo(this.level.arenaX + 340);
      this.levelBounds = [this.level.arenaX - 420, this.level.arenaX + 1180];
      this.ui.banner('PRECINCT YARD', 2.2);
      this.audio.setSection('combat');
      this.audio.setIntensity(1);
    }

    updateArena(dt) {
      const a = this.arena;
      if (!a.active || this.state !== 'play') return;
      a.remaining = this.countHostiles();

      if (a.phase === 'between') {
        a.timer -= dt;
        if (a.timer <= 0) {
          a.wave++;
          if (a.wave > a.total) { this.openFinalBuilding(); return; }
          this.spawnWave(a.wave);
          a.phase = 'fighting';
          this.ui.banner('WAVE ' + a.wave, 1.6);
        }
      } else if (a.phase === 'fighting' && a.remaining === 0) {
        a.phase = 'between';
        a.timer = 2.6;
        this.ui.banner(a.wave >= a.total ? 'YARD CLEARED' : 'WAVE CLEARED', 1.8);
        this.addScore(250 * a.wave, this.player.x, this.player.y - 340, '#7fe08a', 'WAVE BONUS');
        /* supply drop between waves */
        const drops = a.wave >= 3 ? ['med', 'ammo', 'fuel', 'bomb'] : ['ammo', 'med', 'fuel'];
        drops.forEach((k, i) => {
          this.pickups.push(new CR.Pickup(this, this.player.x + 180 + i * 160, k));
        });
      }
    }

    spawnWave(n) {
      const baseX = this.level.arenaX;
      const push = (cls, x, opts) => this.enemies.push(new cls(this, x, opts));
      const right = () => baseX + M.rand(950, 1250);
      const left = () => baseX - M.rand(320, 520);
      const near = { standoff: M.rand(260, 420) };
      if (n === 1) {
        for (let i = 0; i < 5; i++) push(CR.Police, right(), near);
      } else if (n === 2) {
        for (let i = 0; i < 5; i++) push(CR.Police, right(), near);
        for (let i = 0; i < 3; i++) push(CR.Dog, i % 2 ? left() : right());
      } else if (n === 3) {
        for (let i = 0; i < 4; i++) push(CR.Police, right(), near);
        for (let i = 0; i < 2; i++) push(CR.Swat, right());
        push(CR.Dog, left());
      } else {
        for (let i = 0; i < 6; i++) push(CR.Police, i % 2 ? right() : left(), near);
        for (let i = 0; i < 3; i++) push(CR.Swat, right());
        for (let i = 0; i < 3; i++) push(CR.Dog, i % 2 ? left() : right());
      }
      this.audio.siren();
      this.cam.shake(.2);
    }

    openFinalBuilding() {
      const a = this.arena;
      a.active = false;
      a.cleared = true;
      this.combatLock = false;
      this.levelBounds = [this.level.arenaX - 300, this.level.hq.x + 420];
      this.cam.unlock();
      this.ui.banner('BRING DOWN THE PRECINCT', 2.6);
      this.finalPhase = 'open';
      if (this.player.explosives <= 0) {
        this.pickups.push(new CR.Pickup(this, this.player.x + 220, 'bomb'));
      }
      this.pickups.push(new CR.Pickup(this, this.player.x + 420, 'med'));
    }

    /* ============================== update ============================== */
    update(dt) {
      this.audio.update();

      if (this.state === 'intro') {
        const running = this.ui.drawIntroActive = true;
        this.ui.update(dt);
        if (this.ui.introT > 4.3) {
          this.state = 'play';
          this.audio.setSection('calm');
          this.audio.setIntensity(.5);
        }
        /* the world ticks quietly under the intro so the first frame is alive */
        this.tickWorld(dt * .4);
        return;
      }
      if (this.state === 'menu') {
        this.ensureMenuScene();
        this.menuCam.W = this.W; this.menuCam.H = this.H;
        this.menuCam.cx += 26 * dt;               /* drift down the street */
        this.menuCam.update(dt, false);
        CR.Particles.update(dt);
        this.fx.update(dt);
        this.ui.update(dt);
        return;
      }
      if (this.state !== 'play' && this.state !== 'dying') { this.ui.update(dt); return; }

      /* slow motion */
      if (this.slowT > 0) {
        this.slowT -= dt;
        this.timeScale = M.damp(this.timeScale, this.slowTarget, .0001, dt);
      } else {
        this.slowTarget = 1;
        this.timeScale = M.damp(this.timeScale, 1, .0005, dt);
      }
      this.tickWorld(dt * this.timeScale);
    }

    tickWorld(dt) {
      this.time += dt;
      const p = this.player;

      /* deferred callbacks (bursts, staged explosions, sequence steps) */
      for (let i = this.timers.length - 1; i >= 0; i--) {
        const t = this.timers[i];
        t.t -= dt;
        if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
      }

      if (this.comboT > 0) {
        this.comboT -= dt;
        if (this.comboT <= 0) this.breakCombo();
      }

      p.update(dt, this);
      this.level.update(dt, this.cam);

      /* a single mercy drop when a locked fight is about to end the run */
      if (!this.mercyUsed && this.combatLock && p.hp < 34 && !p.dead) {
        this.mercyUsed = true;
        this.pickups.push(new CR.Pickup(this, p.x + (p.facing > 0 ? -220 : 220), 'med'));
        this.ui.toast('SUPPLY DROP', 1.2);
      }
      this.updateArena(dt);

      const lockView = (this.arena.active || this.combatLock) ? this.cam.view() : null;
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        e.update(dt, this);
        /* In a locked fight nobody is allowed to loiter off-screen, or the
           wave can never be cleared. */
        if (lockView && !e.dying && e.type !== 'civilian') {
          e.x = M.clamp(e.x, lockView.left + 140, lockView.right - 170);
        }
        if (e.dead || e.x < this.cam.view().left - 1400 || e.x > this.cam.view().right + 2600) {
          if (e === this.boss) this.boss = null;
          this.enemies.splice(i, 1);
        }
      }
      for (let i = this.cars.length - 1; i >= 0; i--) {
        const c = this.cars[i];
        c.update(dt, this);
        if ((c.dead && c.burning <= 0) || c.x < this.cam.view().left - 1200) this.cars.splice(i, 1);
      }
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const pu = this.pickups[i];
        pu.update(dt, this);
        if (pu.dead || pu.x < this.cam.view().left - 900) this.pickups.splice(i, 1);
      }

      /* bullets with swept collision so nothing tunnels at 3000 px/s */
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        b.update(dt);
        if (!b.dead) {
          if (b.owner === 'player') {
            for (const e of this.enemies) {
              if (e.dead || e.dying) continue;
              if (C.segmentBox(b.px, b.py, b.x, b.y, e.box())) {
                e.hurt(b.dmg, 'bullet', this, b.px);
                e.knock(Math.sign(b.vx) * 90, 0);
                P.blood(b.x, b.y, e.armored ? 3 : 9, Math.sign(b.vx), .9, CR.GROUND);
                if (e.armored) P.sparks(b.x, b.y, 9, '#ffd9a0');
                b.dead = true; break;
              }
            }
            if (!b.dead) {
              for (const c of this.cars) {
                if (c.dead) continue;
                if (C.segmentBox(b.px, b.py, b.x, b.y, c.box())) {
                  c.hurt(b.dmg, this, b.px);
                  P.sparks(b.x, b.y, 8, '#ffd9a0');
                  b.dead = true; break;
                }
              }
            }
          } else if (!p.dead) {
            if (C.segmentBox(b.px, b.py, b.x, b.y, p.box())) {
              p.hurt(b.dmg, this, b.px);
              b.dead = true;
            }
          }
        }
        if (b.dead || b.y > CR.GROUND + 40 || !this.cam.onScreen(b.x, 900)) this.bullets.splice(i, 1);
      }

      P.update(dt);
      this.fx.update(dt);
      this.ui.update(dt);

      /* camera */
      this.cam.follow(p, dt, { lookAhead: this.combatLock ? 0 : 260 });
      this.cam.update(dt, this.state === 'play');

      /* music intensity tracks how hot the street is */
      if (!this.arena.active && !this.boss) {
        const near = this.countHostiles();
        this.audio.setIntensity(M.clamp(.35 + near * .12 + this.combo * .04, .3, 1));
        if (near > 2 && this.audio.music.section === 'calm') this.audio.setSection('combat');
      }

      /* escape cinematic: wide, looking back over the shoulder */
      if (this.cinematic === 'escape') {
        this.cam.targetZoom = .70;
        this.cam.follow(p, dt, { lookAhead: -540 });
      }
    }

    /* ============================== render ============================= */
    render() {
      const ctx = this.fx.begin();
      const cam = this.cam;
      ctx.save();
      cam.apply(ctx);

      if (this.level) {
        const view = cam.view();
        this.level.drawSky(ctx, cam);
        this.level.drawBackground(ctx, cam);
        for (const b of this.level.buildings) b.draw(ctx, cam);
        this.level.drawGround(ctx, cam);
        for (const b of this.level.buildings) b.drawZone(ctx, cam, this.player);
        P.drawDecals(ctx, view);
        this.level.drawProps(ctx, cam, false);

        /* cull to the view: entities spawn up to 2600px ahead of the camera */
        const vl = view.left - 260, vr = view.right + 260;
        for (const pu of this.pickups) if (pu.x > vl && pu.x < vr) pu.draw(ctx);
        for (const c of this.cars) if (c.x > vl - 300 && c.x < vr + 300) c.draw(ctx);
        /* corpses first so living bodies read on top of them */
        for (const e of this.enemies) if (e.dying && e.x > vl && e.x < vr) e.draw(ctx);
        for (const e of this.enemies) if (!e.dying && e.x > vl && e.x < vr) e.draw(ctx);
        if (this.player) this.player.draw(ctx, this);
        for (const b of this.bullets) b.draw(ctx);

        P.draw(ctx, view, false);
        P.draw(ctx, view, true);
        this.level.drawProps(ctx, cam, true);
        this.level.drawLampLight(ctx, cam, this.quality);
        this.level.drawForeground(ctx, cam);
      } else if (this.menuLevel) {
        const mc = this.menuCam;
        ctx.restore();
        ctx.save();
        mc.apply(ctx);
        this.menuLevel.drawSky(ctx, mc);
        this.menuLevel.drawBackground(ctx, mc);
        for (const b of this.menuLevel.buildings) b.draw(ctx, mc);
        this.menuLevel.drawGround(ctx, mc);
        this.menuLevel.drawProps(ctx, mc, false);
        this.menuLevel.drawProps(ctx, mc, true);
        this.menuLevel.drawLampLight(ctx, mc, this.quality);
        this.menuLevel.drawForeground(ctx, mc);
      } else {
        const v = cam.view();
        ctx.fillStyle = '#07070a';
        ctx.fillRect(v.left, v.top, v.right - v.left, v.bottom - v.top);
      }
      ctx.restore();

      this.fx.composite(this.ctx);

      /* HUD and titles are composited after post so text stays sharp */
      const out = this.ctx;
      out.setTransform(1, 0, 0, 1, 0, 0);
      if (this.state === 'play' || this.state === 'dying' || this.state === 'pause') {
        this.ui.draw(out, this.W, this.H);
      }
      if (this.state === 'intro') this.ui.drawIntro(out, this.W, this.H);
    }
  };
})();

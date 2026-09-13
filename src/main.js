/* =============================================================================
 *  main.js — сборка игры, главный цикл, экраны (брифинг/пауза/итоги),
 *  взаимодействие с транспортом и рестарт миссии без перезагрузки страницы.
 * ========================================================================== */
(function () {
  'use strict';
  const GTA = window.GTA, U = GTA.Utils, In = GTA.Input, L = GTA.Locations;
  const S = GTA.MISSION_STATE;
  const $ = (id) => document.getElementById(id);

  class Game {
    constructor() {
      this.paused = false;
      this.running = false;
      this.acc = 0;
      this.fps = 60;
      this._fpsAcc = 0; this._fpsFrames = 0;
      this._last = 0;
    }

    /* ------------------------------- init ------------------------------- */
    init() {
      const gfx = GTA.Graphics.init($('game'));
      this.scene = gfx.scene;
      this.camera = gfx.camera;
      this.renderer = gfx.renderer;

      GTA.FX.init(this.scene);

      this.world = new GTA.World(this.scene);
      this.world.build();

      this.player = new GTA.Player(this.scene, this.world, this.camera);
      this.player.reset(L.playerStart);

      this.car = new GTA.Vehicle(this.scene, this.world, {
        color: 0x9c2f2f, x: L.carStart.x, z: L.carStart.z, yaw: L.carStartYaw
      });

      this.npcs = new GTA.NPCManager(this.scene, this.world);
      this.hud = new GTA.HUD();
      this.mission = new GTA.Mission(this);

      In.init(this.renderer.domElement);
      this._bindUI();

      GTA.game = this;
      this._exposeDebug();
      return this;
    }

    _bindUI() {
      $('startBtn').addEventListener('click', () => this.startMission());
      $('restartBtn').addEventListener('click', () => this.restart(true));
      $('menuBtn').addEventListener('click', () => { this.restart(false); this.showBriefing(); });
      $('resumeBtn').addEventListener('click', () => this.resume());
      $('abortBtn').addEventListener('click', () => { this.restart(true); });
      window.addEventListener('keydown', (e) => {
        if (e.code === 'Enter' && !$('briefing').classList.contains('hidden')) this.startMission();
        if (e.code === 'KeyP' && this.running) this.paused ? this.resume() : this.pause();
        if (e.code === 'KeyM') {
          const on = GTA.Audio.toggle();
          if (this.hud) this.hud.toast(on ? 'Звук включён' : 'Звук выключен');
        }
        if (e.code === 'KeyH' && this.running) {
          this.hud.hint('<b>WASD</b> — движение · <b>Shift</b> — бег/газ · <b>ЛКМ</b> — огонь · ' +
            '<b>ПКМ</b> — прицел · <b>E</b> — машина · <b>R</b> — перезарядка · <b>P</b> — пауза');
        }
      });
    }

    showBriefing() {
      $('briefing').classList.remove('hidden');
      $('endScreen').classList.add('hidden');
      $('pauseScreen').classList.add('hidden');
      this.hud.show(false);
      In.releaseLock();
    }

    startMission() {
      GTA.Audio.init();
      GTA.Audio.resume();
      $('briefing').classList.add('hidden');
      $('endScreen').classList.add('hidden');
      this.hud.show(true);
      this.running = true;
      this.paused = false;
      this.npcs.spawnGuards();
      this.mission.start();
      if (!this.engineSound) this.engineSound = GTA.Audio.createEngine();
      In.requestLock();
      this.hud.hint('<b>E</b> — сесть в машину · <b>H</b> — управление');
    }

    pause() {
      if (!this.running || this.paused) return;
      this.paused = true;
      $('pauseScreen').classList.remove('hidden');
      if (this.engineSound) this.engineSound.idleOff();
      In.releaseLock();
    }

    resume() {
      if (!this.running) return;
      this.paused = false;
      $('pauseScreen').classList.add('hidden');
      GTA.Audio.resume();
      In.requestLock();
    }

    onPointerLock(locked) {
      if (!locked && this.running && !this.paused &&
        $('endScreen').classList.contains('hidden')) this.pause();
    }

    /* ----------------------------- события ----------------------------- */
    onKill(npc) { this.mission.onKill(npc); }

    onPlayerDead() {
      this.hud.toast('Вы убиты', 'bad');
      setTimeout(() => this.mission.fail(), 1400);
    }

    onMissionEnd(success) {
      this.running = false;
      In.releaseLock();
      if (this.engineSound) this.engineSound.idleOff();
      if (this.npcs.siren) this.npcs.siren.set(0);
      const stats = this.mission.stats();
      $('endKicker').textContent = success ? 'Миссия 01 · Завершено' : 'Миссия 01 · Провал';
      $('endTitle').textContent = success ? 'МИССИЯ ПРОЙДЕНА' : 'МИССИЯ ПРОВАЛЕНА';
      $('endTitle').className = success ? 'win' : 'fail';
      $('endSub').textContent = success
        ? 'Груз доставлен в порт, машина ушла от погони. Заказчик доволен.'
        : 'Вы не справились. Заказчик найдёт другого исполнителя — попробуйте ещё раз.';
      const box = $('endStats');
      box.innerHTML = '';
      Object.keys(stats).forEach((k) => {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = '<span>' + k + '</span><span>' + stats[k] + '</span>';
        box.appendChild(row);
      });
      $('endScreen').classList.remove('hidden');
      this.hud.show(false);
      GTA.Audio.ui(success ? 880 : 180, 0.5);
    }

    /** Полный сброс мира к началу миссии (страница не перезагружается). */
    restart(autoStart) {
      this.npcs.reset();
      GTA.FX.reset();
      this.mission.reset();
      this.player.exitVehicle(true);
      this.player.reset(L.playerStart);
      this.car.repair();
      this.car.pos.set(L.carStart.x, 0, L.carStart.z);
      this.car.yaw = L.carStartYaw;
      this.car.vel.set(0, 0, 0);
      this.car.speed = 0;
      this.car.root.position.copy(this.car.pos);
      this.car.root.rotation.y = this.car.yaw;
      $('endScreen').classList.add('hidden');
      $('pauseScreen').classList.add('hidden');
      this.paused = false;
      if (autoStart) this.startMission();
    }

    /* ---------------------- транспорт: посадка/высадка ---------------------- */
    _vehicleInteraction() {
      const p = this.player;
      if (p.enterCooldown > 0) return;
      const cars = [this.car].concat(this.npcs.cars);
      let nearest = null, nd = 4.2;
      if (!p.inVehicle) {
        for (const c of cars) {
          const d = U.dist2D(c.pos.x, c.pos.z, p.position.x, p.position.z);
          if (d < nd) { nd = d; nearest = c; }
        }
        if (nearest && !p.isDead) {
          this.hud.hint('<b>E</b> — сесть в машину');
        }
      }
      if (!In.hit('KeyE')) return;
      if (p.inVehicle) p.exitVehicle();
      else if (nearest) p.enterVehicle(nearest);
    }

    /* ------------------------------- цикл ------------------------------- */
    start() {
      this._last = performance.now();
      const loop = (now) => {
        requestAnimationFrame(loop);
        let dt = (now - this._last) / 1000;
        this._last = now;
        if (dt > 0.1) dt = 0.1;           // защита от «прыжка» после вкладки в фоне
        this._fpsAcc += dt; this._fpsFrames++;
        if (this._fpsAcc > 0.5) {
          this.fps = this._fpsFrames / this._fpsAcc;
          this._fpsAcc = 0; this._fpsFrames = 0;
        }
        if (this.running && !this.paused) this.update(dt);
        GTA.Graphics.render();
        In.endFrame();
      };
      requestAnimationFrame(loop);
    }

    update(dt) {
      const p = this.player;

      this._vehicleInteraction();
      p.update(dt, { npcs: this.npcs, world: this.world });

      // машина игрока катится по инерции, когда в ней никого нет
      if (p.inVehicle !== this.car) {
        this.car.input.throttle = 0;
        this.car.input.brake = 0;
        this.car.input.steer = 0;
        this.car.input.handbrake = Math.abs(this.car.speed) < 0.4;
        this.car.update(dt, false);
      }

      this.npcs.update(dt, { player: p, onSpotted: (n) => this._onSpotted(n) });
      this.mission.update(dt);
      this.world.update(p.position);
      GTA.Graphics.setTimeOfDay(this.mission.time / 600);   // медленный закат
      GTA.FX.update(dt);
      GTA.Graphics.updateShadowFocus(p.position);

      // звук мотора
      if (this.engineSound) {
        if (p.inVehicle) {
          const v = p.inVehicle;
          const rpm = U.clamp(Math.abs(v.speed) / 46, 0, 1);
          this.engineSound.setState(rpm, v.input.throttle * 0.8 + 0.2);
        } else {
          this.engineSound.setState(0, 0);
          this.engineSound.idleOff();
        }
      }

      this.hud.update(dt, this);
    }

    /** Один заметивший охранник поднимает тревогу у соседей. */
    _onSpotted(npc) {
      this.hud.toast('Вас заметили!', 'bad');
      this.npcs.list.forEach((n) => {
        if (n === npc || n.isDead) return;
        if (U.dist2D(n.pos.x, n.pos.z, npc.pos.x, npc.pos.z) < 55) {
          n.alerted = true;
          n.hasLastSeen = true;
          n.lastSeen.copy(npc.lastSeen);
          if (n.state === 'patrol') n.state = 'suspect';
        }
      });
    }

    /* --------------------- отладочные хелперы (для QA) --------------------- */
    _exposeDebug() {
      const self = this;
      GTA.debug = {
        tp(x, z) {
          self.player.exitVehicle(true);
          self.player.position.set(x, self.world.groundHeight(x, z) + 0.1, z);
        },
        car(x, z) {
          self.car.pos.set(x, 0, z);
          self.car.vel.set(0, 0, 0);
          self.car.speed = 0;
        },
        killGuards() { self.npcs.list.forEach(n => { if (n.faction === 'guard') { n.health = 0; n.state = 'dead'; } }); },
        state() { return self.mission.state; },
        fps() { return Math.round(self.fps); },
        hurt(n) { self.player.takeDamage(n || 20); },
        god() { self.player.takeDamage = function () {}; }
      };
    }
  }

  /* ------------------------------- bootstrap ------------------------------- */
  function boot() {
    const game = new Game();
    const loadText = $('loadText'), loadFill = $('loadFill');
    const steps = [
      ['Инициализация рендерера…', 15],
      ['Строим город…', 55],
      ['Расставляем транспорт и охрану…', 85],
      ['Готово', 100]
    ];
    let i = 0;
    const tick = () => {
      loadText.textContent = steps[i][0];
      loadFill.style.width = steps[i][1] + '%';
      i++;
      if (i === 2) {
        // тяжёлая часть — после отрисовки экрана загрузки
        try {
          game.init();
        } catch (err) {
          loadText.textContent = 'Ошибка инициализации: ' + err.message;
          console.error(err);
          return;
        }
      }
      if (i < steps.length) {
        requestAnimationFrame(() => setTimeout(tick, 16));
      } else {
        $('loading').classList.add('hidden');
        game.showBriefing();
        game.start();
      }
    };
    requestAnimationFrame(() => setTimeout(tick, 16));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

/* =============================================================================
 *  mission.js — единственная сюжетная миссия «Ограбление склада».
 *  Конечный автомат: BRIEFING → DRIVE → COMBAT → GRAB → EXTRACT → SUCCESS/FAILED
 * ========================================================================== */
(function () {
  'use strict';
  const GTA = window.GTA, U = GTA.Utils, L = GTA.Locations;

  const STATE = {
    BRIEFING: 'briefing', DRIVE: 'drive', COMBAT: 'combat',
    GRAB: 'grab', EXTRACT: 'extract', SUCCESS: 'success', FAILED: 'failed'
  };

  class Mission {
    constructor(game) {
      this.game = game;
      this.state = STATE.BRIEFING;
      this.waypoint = null;
      this.wanted = 0;
      this.time = 0;
      this.copTimer = 0;
      this.cargoTaken = false;
      this._buildProps(game.scene);
    }

    /* -------------------- маркеры цели и кейс с грузом -------------------- */
    _buildProps(scene) {
      // столб света над целью
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(5.5, 5.5, 40, 24, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xffc23a, transparent: true, opacity: 0.17,
          side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
        })
      );
      beam.position.y = 20;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(4.6, 5.6, 32),
        new THREE.MeshBasicMaterial({
          color: 0xffd23f, transparent: true, opacity: 0.75,
          side: THREE.DoubleSide, depthWrite: false
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.35;
      this.marker = new THREE.Group();
      this.marker.add(beam); this.marker.add(ring);
      this.marker.visible = false;
      scene.add(this.marker);
      this.markerRing = ring;

      // кейс
      const g = new THREE.Group();
      const caseMat = new THREE.MeshStandardMaterial({ color: 0x2b3138, roughness: 0.5, metalness: 0.4 });
      const trim = new THREE.MeshStandardMaterial({
        color: 0xc9a227, roughness: 0.3, metalness: 0.9,
        emissive: 0x3a2a00, emissiveIntensity: 1
      });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.55, 0.24), caseMat);
      body.castShadow = true;
      g.add(body);
      const hand = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 12, Math.PI), trim);
      hand.position.y = 0.33; hand.rotation.z = Math.PI;
      g.add(hand);
      [-0.26, 0.26].forEach(x => {
        const lock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.26), trim);
        lock.position.set(x, -0.1, 0);
        g.add(lock);
      });
      const glow = new THREE.PointLight(0xffc23a, 1.4, 9, 2);
      glow.position.y = 0.4;
      g.add(glow);
      g.position.copy(L.cargo);
      g.position.y += 0.3;
      g.visible = false;
      scene.add(g);
      this.cargo = g;
    }

    /* ------------------------------ запуск ------------------------------ */
    start() {
      this.state = STATE.DRIVE;
      this.time = 0;
      this.wanted = 0;
      this.cargoTaken = false;
      this.cargo.visible = false;
      this.setWaypoint(L.warehouseGate);
      this.game.hud.objective('Цель 1 из 4', 'Доберитесь до склада в промзоне');
      this.game.hud.toast('Садитесь в машину — нажмите E рядом с ней', 'good');
    }

    setWaypoint(v) {
      if (!v) { this.waypoint = null; this.marker.visible = false; return; }
      this.waypoint = v.clone ? v.clone() : new THREE.Vector3(v.x, 0, v.z);
      this.marker.position.set(this.waypoint.x, 0, this.waypoint.z);
      this.marker.visible = true;
    }

    setState(s) {
      if (this.state === s) return;
      this.state = s;
      const hud = this.game.hud;
      switch (s) {
        case STATE.COMBAT:
          this.setWaypoint(L.warehouseCenter);
          hud.objective('Цель 2 из 4', 'Зачистите территорию склада');
          hud.toast('Охрана заметит вас — действуйте быстро', 'bad');
          break;
        case STATE.GRAB:
          this.setWaypoint(L.cargo);
          this.cargo.visible = true;
          hud.objective('Цель 3 из 4', 'Заберите груз в ангаре');
          hud.toast('Территория зачищена. Кейс внутри ангара', 'good');
          break;
        case STATE.EXTRACT:
          this.setWaypoint(L.extraction);
          hud.objective('Цель 4 из 4', 'Уходите к точке эвакуации в порту');
          hud.toast('Груз у вас! Полиция уже едет', 'bad');
          break;
        case STATE.SUCCESS:
          this.setWaypoint(null);
          this.game.onMissionEnd(true);
          break;
        case STATE.FAILED:
          this.setWaypoint(null);
          this.game.onMissionEnd(false);
          break;
      }
    }

    fail() { if (this.state !== STATE.FAILED && this.state !== STATE.SUCCESS) this.setState(STATE.FAILED); }

    /** Убийство полицейского поднимает уровень розыска. */
    onKill(npc) {
      if (npc.faction === 'cop' && this.wanted > 0 && this.wanted < 5) {
        this.wanted = Math.min(5, this.wanted + 1);
        this.game.hud.toast('Уровень розыска вырос', 'bad');
      }
    }

    /* ------------------------------ апдейт ------------------------------ */
    update(dt) {
      const g = this.game, p = g.player;
      if (this.state === STATE.SUCCESS || this.state === STATE.FAILED ||
        this.state === STATE.BRIEFING) return;

      this.time += dt;

      // анимация маркера
      if (this.marker.visible) {
        this.markerRing.rotation.z += dt * 0.8;
        const k = 1 + Math.sin(performance.now() * 0.003) * 0.06;
        this.markerRing.scale.setScalar(k);
      }
      if (this.cargo.visible && !this.cargoTaken) {
        this.cargo.rotation.y += dt * 1.1;
        this.cargo.position.y = L.cargo.y + 0.55 + Math.sin(performance.now() * 0.0022) * 0.1;
      }

      const dToGate = U.dist2D(p.position.x, p.position.z, L.warehouseGate.x, L.warehouseGate.z);

      switch (this.state) {
        case STATE.DRIVE:
          if (dToGate < 34) {
            this.setState(STATE.COMBAT);
            g.npcs.list.forEach(n => { if (n.faction === 'guard') n.alerted = false; });
          }
          break;

        case STATE.COMBAT: {
          const alive = g.npcs.aliveGuards();
          g.hud.objective('Цель 2 из 4', 'Уничтожьте охрану: ' +
            (g.npcs.totalGuards() - alive) + '/' + g.npcs.totalGuards());
          if (alive === 0) this.setState(STATE.GRAB);
          break;
        }

        case STATE.GRAB: {
          const d = p.inVehicle ? 999 :
            p.position.distanceTo(new THREE.Vector3(L.cargo.x, p.position.y, L.cargo.z));
          if (d < 2.6) {
            this.cargoTaken = true;
            this.cargo.visible = false;
            p.hasCargo = true;
            this.wanted = 2;
            GTA.Audio.ui(880, 0.25);
            g.hud.toast('ГРУЗ ЗАХВАЧЕН', 'good');
            this.setState(STATE.EXTRACT);
            this.copTimer = 2.5;
          }
          break;
        }

        case STATE.EXTRACT: {
          // подвозим полицию, пока розыск активен
          if (this.wanted > 0) {
            this.copTimer -= dt;
            const maxCars = Math.min(4, 1 + this.wanted);
            if (this.copTimer <= 0 && g.npcs.cars.length < maxCars) {
              const car = g.npcs.spawnPoliceCar(p.position, p.yaw);
              if (car) g.hud.toast('Патруль на хвосте', 'bad');
              this.copTimer = U.rand(7, 12);
            }
          }
          const d = U.dist2D(p.position.x, p.position.z, L.extraction.x, L.extraction.z);
          if (d < 11) {
            this.setState(STATE.SUCCESS);
          }
          break;
        }
      }
    }

    stats() {
      const p = this.game.player;
      const acc = p.shotsFired ? Math.round(p.shotsHit / p.shotsFired * 100) : 0;
      return {
        'Время прохождения': U.formatTime(this.time),
        'Устранено противников': p.kills,
        'Точность стрельбы': acc + '%',
        'Получено урона': Math.round(p.damageTaken),
        'Состояние машины': this.game.car ? Math.max(0, Math.round(100 - this.game.car.damage)) + '%' : '—',
        'Уровень розыска': this.wanted + '/5'
      };
    }

    reset() {
      this.state = STATE.BRIEFING;
      this.wanted = 0;
      this.time = 0;
      this.cargoTaken = false;
      this.cargo.visible = false;
      this.cargo.position.copy(L.cargo);
      this.cargo.position.y += 0.3;
      this.marker.visible = false;
      this.waypoint = null;
    }
  }

  GTA.Mission = Mission;
  GTA.MISSION_STATE = STATE;
})();

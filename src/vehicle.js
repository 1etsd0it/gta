/* =============================================================================
 *  vehicle.js — аркадная физика автомобиля (модель «велосипеда»),
 *  визуальные крены/клевки, деформация кузова от ударов, ИИ полицейских машин.
 *  Полноценный солвер твёрдых тел заменён специализированной моделью:
 *  для одной машины это точнее по ощущениям и дешевле по кадрам.
 * ========================================================================== */
(function () {
  'use strict';
  const GTA = window.GTA, U = GTA.Utils;

  const WHEEL_BASE = 2.7;
  const BODY_W = 2.0, BODY_L = 4.5;

  function mat(color, rough, metal) {
    return new THREE.MeshStandardMaterial({
      color, roughness: rough === undefined ? 0.42 : rough,
      metalness: metal === undefined ? 0.55 : metal
    });
  }

  /* ------------------------------------------------------------------------
   *  Сборка кузова. Машина «смотрит» в +Z (yaw = 0).
   * --------------------------------------------------------------------- */
  function buildBody(o) {
    o = o || {};
    const g = new THREE.Group();
    const paint = mat(o.color === undefined ? 0x8e2f2f : o.color, 0.35, 0.65);
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x1b2733, roughness: 0.08, metalness: 0.1,
      transmission: 0.35, transparent: true, opacity: 0.72, clearcoat: 1
    });
    const dark = mat(0x15171b, 0.8, 0.3);
    const chrome = mat(0xc9ccd2, 0.25, 0.95);

    // нижний кузов — сегментированный, чтобы можно было мять геометрию
    const chassisGeo = new THREE.BoxGeometry(BODY_W, 0.72, BODY_L, 4, 2, 8);
    const chassis = new THREE.Mesh(chassisGeo, paint);
    chassis.position.y = 0.62;
    chassis.castShadow = true; chassis.receiveShadow = true;
    g.add(chassis);

    // капот/багажник скосы
    const nose = new THREE.Mesh(new THREE.BoxGeometry(BODY_W - 0.12, 0.3, 1.25), paint);
    nose.position.set(0, 0.95, 1.5);
    nose.castShadow = true;
    g.add(nose);
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(BODY_W - 0.12, 0.3, 1.05), paint);
    trunk.position.set(0, 0.95, -1.6);
    trunk.castShadow = true;
    g.add(trunk);

    // кабина
    const cabinGeo = new THREE.BoxGeometry(BODY_W - 0.22, 0.62, 2.1, 3, 2, 4);
    const cabin = new THREE.Mesh(cabinGeo, paint);
    cabin.position.set(0, 1.28, -0.15);
    cabin.castShadow = true;
    g.add(cabin);
    const win = new THREE.Mesh(new THREE.BoxGeometry(BODY_W - 0.16, 0.42, 2.16), glass);
    win.position.set(0, 1.34, -0.15);
    g.add(win);

    // бамперы и решётка
    const bumpF = new THREE.Mesh(new THREE.BoxGeometry(BODY_W + 0.06, 0.3, 0.3), dark);
    bumpF.position.set(0, 0.5, BODY_L / 2 + 0.02);
    g.add(bumpF);
    const bumpR = bumpF.clone(); bumpR.position.z = -BODY_L / 2 - 0.02;
    g.add(bumpR);

    // фары / стопы
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xfff6df, emissive: 0xffe9bf, emissiveIntensity: 1.6, roughness: 0.2
    });
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0xff5252, emissive: 0xff2020, emissiveIntensity: 0.7, roughness: 0.3
    });
    const lights = { tail: [], head: [] };
    [-0.62, 0.62].forEach((x) => {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.1), headMat);
      h.position.set(x, 0.82, BODY_L / 2 + 0.03);
      g.add(h); lights.head.push(h);
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.1), tailMat.clone());
      t.position.set(x, 0.85, -BODY_L / 2 - 0.03);
      g.add(t); lights.tail.push(t);
    });
    // зеркала
    [-1, 1].forEach((s) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.12), dark);
      m.position.set(s * (BODY_W / 2 + 0.06), 1.28, 0.75);
      g.add(m);
    });

    // колёса
    const wheels = [];
    const tireGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14);
    const tireMat = mat(0x14161a, 0.95, 0.05);
    const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.32, 10);
    const positions = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
    positions.forEach((p) => {
      const w = new THREE.Group();
      w.position.set(p[0] * (BODY_W / 2 - 0.04), 0.42, p[1] * (WHEEL_BASE / 2));
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      const rim = new THREE.Mesh(rimGeo, chrome);
      rim.rotation.z = Math.PI / 2;
      const spin = new THREE.Group();
      spin.add(tire); spin.add(rim);
      w.add(spin);
      w.userData.spin = spin;
      w.userData.front = p[1] > 0;
      g.add(w);
      wheels.push(w);
    });

    // полицейская раскраска
    if (o.police) {
      const bar = new THREE.Group();
      const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.28), dark);
      bar.add(barBase);
      const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.26),
        new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0xff0000, emissiveIntensity: 2 }));
      red.position.x = -0.35; red.position.y = 0.1;
      const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.26),
        new THREE.MeshStandardMaterial({ color: 0x3050ff, emissive: 0x0040ff, emissiveIntensity: 2 }));
      blue.position.x = 0.35; blue.position.y = 0.1;
      bar.add(red); bar.add(blue);
      bar.position.set(0, 1.64, -0.15);
      g.add(bar);
      lights.bar = { red: red.material, blue: blue.material };
      // белые двери
      [-1, 1].forEach((s) => {
        const d = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 2.0), mat(0xf2f4f7, 0.4, 0.2));
        d.position.set(s * (BODY_W / 2 + 0.01), 0.72, -0.2);
        g.add(d);
      });
    }

    g.userData = { chassis, cabin, wheels, lights, paint };
    return g;
  }

  /* ========================================================================
   *  Автомобиль
   * ===================================================================== */
  class Vehicle {
    constructor(scene, world, opts) {
      opts = opts || {};
      this.scene = scene;
      this.world = world;
      this.isPolice = !!opts.police;
      this.root = buildBody(opts);
      scene.add(this.root);

      this.body = new THREE.Group();      // визуальный крен/клевок
      // переносим все меши в под-группу, чтобы крен не ломал физику
      const kids = this.root.children.slice();
      kids.forEach(k => this.body.add(k));
      this.root.add(this.body);

      this.chassis = this.root.userData.chassis;
      this.wheels = this.root.userData.wheels;
      this.lights = this.root.userData.lights;

      this.pos = new THREE.Vector3(opts.x || 0, 0, opts.z || 0);
      this.yaw = opts.yaw || 0;
      this.vel = new THREE.Vector3();
      this.vy = 0;
      this.speed = 0;          // продольная скорость, м/с
      this.steer = 0;
      this.yawRate = 0;
      this.damage = 0;
      this.health = 100;
      this.onGround = true;
      this.rollVis = 0; this.pitchVis = 0;
      this.wheelSpin = 0;
      this.driftK = 0;
      this.engineOn = true;
      this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false };
      this._fwd = new THREE.Vector3();
      this._right = new THREE.Vector3();
      this._basePos = this.chassis.geometry.attributes.position.array.slice();
      this._lastImpact = 0;
      this.dead = false;

      this.root.position.copy(this.pos);
      this.root.rotation.y = this.yaw;
    }

    forward(out) {
      return (out || this._fwd).set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    }
    right(out) {
      return (out || this._right).set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    }
    get kmh() { return Math.abs(this.speed) * 3.6; }

    /* ----------------------------- физика ----------------------------- */
    update(dt, active) {
      const inp = this.input;
      const fwd = this.forward(), right = this.right();

      if (!this.engineOn) { inp.throttle = 0; }

      // скорости в локальных осях
      let vLong = this.vel.x * fwd.x + this.vel.z * fwd.z;
      let vLat = this.vel.x * right.x + this.vel.z * right.z;

      const TOP = 46;                              // ~165 км/ч
      const powerCurve = 1 - U.clamp(Math.abs(vLong) / TOP, 0, 1) * 0.75;
      let accel = 0;
      if (inp.throttle > 0) accel += inp.throttle * 17 * powerCurve;
      if (inp.brake > 0) {
        if (vLong > 0.5) accel -= inp.brake * 26;               // тормоз
        else accel -= inp.brake * 9 * (1 - U.clamp(-vLong / 14, 0, 1)); // задний ход
      }
      // сопротивление
      accel -= Math.sign(vLong) * (0.35 + 0.012 * vLong * vLong);
      if (inp.handbrake) accel -= Math.sign(vLong) * Math.min(Math.abs(vLong) * 6, 16);
      if (!this.onGround) accel *= 0.15;
      vLong += accel * dt;
      if (Math.abs(vLong) < 0.05 && !inp.throttle) vLong = 0;

      // руление: чем быстрее — тем меньше угол
      const steerMax = U.lerp(0.58, 0.14, U.clamp(Math.abs(vLong) / 34, 0, 1));
      const steerSpeed = inp.handbrake ? 7 : 5;
      this.steer = U.damp(this.steer, inp.steer * steerMax, steerSpeed, dt);

      // поворот кузова
      const turn = (vLong / WHEEL_BASE) * Math.tan(this.steer);
      this.yawRate = U.damp(this.yawRate, turn, 12, dt);
      if (this.onGround) this.yaw += this.yawRate * dt;

      // сцепление: боковая скорость гасится, при ручнике — занос
      const grip = inp.handbrake ? 1.15 : (6.6 - U.clamp(Math.abs(vLong) / 18, 0, 1) * 2.2);
      const slipBefore = vLat;
      vLat *= Math.exp(-grip * dt);
      // центробежная сила
      vLat += -this.yawRate * vLong * dt * (inp.handbrake ? 0.85 : 0.45);
      this.driftK = U.damp(this.driftK, U.clamp(Math.abs(vLat) / 7, 0, 1), 8, dt);

      this.speed = vLong;
      this.vel.set(fwd.x * vLong + right.x * vLat, 0, fwd.z * vLong + right.z * vLat);

      // интеграция + земля
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      const groundY = this.world.groundHeight(this.pos.x, this.pos.z);
      this.vy -= 22 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= groundY) {
        if (!this.onGround && this.vy < -6) GTA.FX.shake(0.25);
        this.pos.y = groundY; this.vy = 0; this.onGround = true;
      } else {
        this.onGround = this.pos.y <= groundY + 0.02;
      }

      this._collide(dt);

      // визуал
      this.root.position.copy(this.pos);
      this.root.rotation.y = this.yaw;

      const latAcc = (vLat - slipBefore) / Math.max(dt, 0.001);
      this.rollVis = U.damp(this.rollVis, U.clamp(-this.yawRate * vLong * 0.012 + latAcc * 0.0025, -0.28, 0.28), 7, dt);
      this.pitchVis = U.damp(this.pitchVis, U.clamp(-accel * 0.006, -0.14, 0.14), 7, dt);
      this.body.rotation.z = this.rollVis;
      this.body.rotation.x = this.pitchVis;

      // колёса
      this.wheelSpin += (vLong / 0.42) * dt;
      for (let i = 0; i < this.wheels.length; i++) {
        const w = this.wheels[i];
        w.userData.spin.rotation.x = this.wheelSpin;
        if (w.userData.front) w.rotation.y = this.steer * 0.85;
      }

      // стоп-сигналы
      if (this.lights.tail) {
        const on = inp.brake > 0.1 || inp.handbrake;
        this.lights.tail.forEach(t => { t.material.emissiveIntensity = on ? 2.6 : 0.6; });
      }
      if (this.lights.bar) {
        const t = performance.now() * 0.006;
        this.lights.bar.red.emissiveIntensity = (Math.sin(t) > 0 ? 3.5 : 0.2);
        this.lights.bar.blue.emissiveIntensity = (Math.sin(t) > 0 ? 0.2 : 3.5);
      }

      // пыль/дым
      if (active) {
        if (this.driftK > 0.25 && Math.abs(vLong) > 4) {
          for (let i = 2; i < 4; i++) {
            const w = this.wheels[i];
            const wp = w.getWorldPosition(_v1);
            GTA.FX.wheelDust(wp.x, wp.z, this.driftK * 0.8);
          }
        }
        if (this.damage > 65) {
          if (Math.random() < 0.35) {
            GTA.FX.smokeColumn(this.pos.x + fwd.x * 2.2, this.pos.y + 1.0, this.pos.z + fwd.z * 2.2);
          }
        }
      }
      this._lastImpact = Math.max(0, this._lastImpact - dt);
    }

    /** Столкновения: четыре «колёсных» круга + нос. */
    _collide(dt) {
      const fwd = this.forward(), right = this.right();
      const pts = [
        [1.55, 0.72], [1.55, -0.72], [-1.6, 0.72], [-1.6, -0.72], [2.15, 0]
      ];
      let strongest = null, strongestDepth = 0;
      for (let i = 0; i < pts.length; i++) {
        _v1.set(
          this.pos.x + fwd.x * pts[i][0] + right.x * pts[i][1], this.pos.y,
          this.pos.z + fwd.z * pts[i][0] + right.z * pts[i][1]
        );
        const before = _v2.copy(_v1);
        const hit = this.world.collideCircle(_v1, 0.62, this.pos.y + 0.25, this.pos.y + 1.6);
        if (!hit) continue;
        const dx = _v1.x - before.x, dz = _v1.z - before.z;
        this.pos.x += dx; this.pos.z += dz;
        // момент от удара в угол — машину разворачивает
        const lever = pts[i][0];
        const torque = (hit.nx * right.x + hit.nz * right.z) * (lever > 0 ? 1 : -1);
        this.yaw += torque * hit.depth * 0.55;
        if (hit.depth > strongestDepth) { strongestDepth = hit.depth; strongest = hit; }
      }
      if (!strongest) return;

      const n = _v3.set(strongest.nx, 0, strongest.nz);
      const vn = this.vel.x * n.x + this.vel.z * n.z;
      if (vn < 0) {
        const impact = -vn;
        // отражение с сильным гашением
        this.vel.x -= n.x * vn * 1.35;
        this.vel.z -= n.z * vn * 1.35;
        this.vel.multiplyScalar(0.55);
        this.speed *= 0.45;
        if (impact > 3 && this._lastImpact <= 0) {
          this._lastImpact = 0.12;
          const dmg = U.clamp((impact - 3) * 2.4, 0, 45);
          this.damage = Math.min(100, this.damage + dmg);
          if (this.damage >= 100) this.engineOn = false;
          GTA.FX.shake(U.clamp(impact / 18, 0.08, 0.9));
          GTA.Audio.crash(U.clamp(impact / 16, 0.15, 1));
          const px = this.pos.x - n.x * 1.6, pz = this.pos.z - n.z * 1.6;
          const col = new THREE.Color(0xffd27f);
          for (let i = 0; i < 10; i++) {
            GTA.FX.spark(px, this.pos.y + 0.7, pz,
              n.x * U.rand(2, 8) + U.rand(-3, 3), U.rand(1, 6), n.z * U.rand(2, 8) + U.rand(-3, 3),
              col, U.rand(0.04, 0.1), U.rand(0.2, 0.5));
          }
          this._deform(px, this.pos.y + 0.7, pz, U.clamp(impact / 12, 0.1, 1));
          if (this.onDamage) this.onDamage(impact);
        }
      }
    }

    /** Визуальная деформация: смещаем вершины кузова около точки удара. */
    _deform(wx, wy, wz, force) {
      const geo = this.chassis.geometry;
      const arr = geo.attributes.position.array;
      const base = this._basePos;
      // точка удара в локальных координатах кузова
      _v1.set(wx, wy, wz);
      this.chassis.worldToLocal(_v1);
      const R = 1.6;
      for (let i = 0; i < arr.length; i += 3) {
        const dx = arr[i] - _v1.x, dy = arr[i + 1] - _v1.y, dz = arr[i + 2] - _v1.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > R) continue;
        const k = (1 - d / R) * force * 0.42;
        arr[i] -= dx / (d || 1) * k;
        arr[i + 1] -= dy / (d || 1) * k * 0.6;
        arr[i + 2] -= dz / (d || 1) * k;
        // не даём кузову «схлопнуться» — ограничиваем смещение
        const ox = arr[i] - base[i], oy = arr[i + 1] - base[i + 1], oz = arr[i + 2] - base[i + 2];
        const od = Math.hypot(ox, oy, oz);
        if (od > 0.42) {
          arr[i] = base[i] + ox / od * 0.42;
          arr[i + 1] = base[i + 1] + oy / od * 0.42;
          arr[i + 2] = base[i + 2] + oz / od * 0.42;
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
    }

    repair() {
      const geo = this.chassis.geometry;
      geo.attributes.position.array.set(this._basePos);
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
      this.damage = 0; this.engineOn = true;
    }

    /* ------------------------- ИИ полицейской ------------------------- */
    driveAI(dt, target, ramming) {
      const fwd = this.forward();
      const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      let desired = Math.atan2(dx, dz);

      // объезд препятствий: три пробных луча вперёд
      const probe = (angle) => {
        _v1.set(Math.sin(this.yaw + angle), 0, Math.cos(this.yaw + angle));
        _v2.set(this.pos.x, this.pos.y + 0.8, this.pos.z);
        const h = this.world.raycast(_v2, _v1, 16);
        return h ? h.t : 999;
      };
      const c = probe(0), l = probe(-0.5), r = probe(0.5);
      if (c < 14) {
        desired = this.yaw + (l > r ? -0.9 : 0.9);
      }
      let d = U.angleDelta(this.yaw, desired);
      this.input.steer = U.clamp(d * 1.6, -1, 1);

      const tooClose = dist < (ramming ? 4 : 12);
      this.input.throttle = tooClose ? 0 : U.clamp(0.55 + dist / 60, 0, 1);
      this.input.brake = (c < 7 && Math.abs(this.speed) > 6) ? 1 : (tooClose ? 0.6 : 0);
      this.input.handbrake = false;
      // не даём полиции бесконечно ускоряться
      if (this.speed > 34) this.input.throttle = 0;
      this.update(dt, false);
    }

    dispose() {
      this.scene.remove(this.root);
      this.root.traverse((c) => { if (c.isMesh) c.geometry.dispose(); });
    }
  }

  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

  GTA.Vehicle = Vehicle;
  GTA.Vehicle.buildBody = buildBody;
  GTA.Vehicle.BODY_L = BODY_L;
  GTA.Vehicle.BODY_W = BODY_W;
})();

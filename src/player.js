/* =============================================================================
 *  player.js — игрок: ходьба/бег, прыжок, стрельба, камера от третьего лица,
 *  посадка и высадка из транспорта, здоровье и регенерация.
 * ========================================================================== */
(function () {
  'use strict';
  const GTA = window.GTA, U = GTA.Utils, In = GTA.Input;

  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
  const _dir = new THREE.Vector3(), _cam = new THREE.Vector3();

  const WEAPON = {
    name: 'Карабин', mag: 30, reserve: 210, fireRate: 0.095,
    damage: 26, reloadTime: 1.85, range: 260,
    spreadHip: 0.022, spreadAim: 0.005, recoil: 0.016
  };

  class Player {
    constructor(scene, world, camera) {
      this.scene = scene;
      this.world = world;
      this.camera = camera;

      this.char = new GTA.Character({
        skin: 0xc59a6c, shirt: 0x33422f, pants: 0x22252b, hair: 0x2a211b, gunColor: 0x2a2e34
      });
      this.root = this.char.root;
      scene.add(this.root);

      this.position = new THREE.Vector3();
      this.velocity = new THREE.Vector3();
      this.vy = 0;
      this.yaw = 0;             // направление камеры (и стрельбы)
      this.pitch = -0.06;
      this.bodyYaw = 0;
      this.onGround = true;
      this.health = 100;
      this.maxHealth = 100;
      this.armor = 0;
      this.isDead = false;
      this.inVehicle = null;
      this.speedScalar = 0;
      this.isMoving = false;
      this.aiming = false;

      this.ammo = WEAPON.mag;
      this.reserve = WEAPON.reserve;
      this.fireT = 0;
      this.reloadT = 0;
      this.shotsFired = 0;
      this.shotsHit = 0;
      this.kills = 0;
      this.damageTaken = 0;
      this.lastDamageT = 99;
      this.recoilPitch = 0;
      this.recoilYaw = 0;

      this.camDist = 5.0;
      this.camYaw = 0;
      this.camPitch = -0.06;
      this.freeLookYaw = 0;
      this.enterCooldown = 0;
      this.hasCargo = false;

      this._camPos = new THREE.Vector3(0, 3, 8);
    }

    reset(pos) {
      this.position.copy(pos);
      this.velocity.set(0, 0, 0);
      this.vy = 0;
      this.health = this.maxHealth;
      this.armor = 0;
      this.isDead = false;
      this.inVehicle = null;
      this.ammo = WEAPON.mag;
      this.reserve = WEAPON.reserve;
      this.reloadT = 0; this.fireT = 0;
      this.shotsFired = this.shotsHit = this.kills = this.damageTaken = 0;
      this.hasCargo = false;
      this.yaw = 0; this.pitch = -0.06;
      this.camYaw = 0; this.camPitch = -0.06;
      this.root.visible = true;
      this.char.root.rotation.set(0, 0, 0);
      this.char.seatBlend = 0;
      this.char.aimBlend = 0;
    }

    get weapon() { return WEAPON; }

    /* ------------------------------ урон ------------------------------ */
    takeDamage(amount, fromPos) {
      if (this.isDead) return;
      let dmg = amount;
      if (this.armor > 0) {
        const absorbed = Math.min(this.armor, dmg * 0.6);
        this.armor -= absorbed;
        dmg -= absorbed;
      }
      this.health -= dmg;
      this.damageTaken += amount;
      this.lastDamageT = 0;
      GTA.FX.shake(U.clamp(amount / 30, 0.05, 0.5));
      if (GTA.game && GTA.game.hud) GTA.game.hud.damageFlash(fromPos);
      if (this.health <= 0) {
        this.health = 0;
        this.isDead = true;
        GTA.Audio.hurt();
        if (this.inVehicle) this.exitVehicle(true);
        if (GTA.game) GTA.game.onPlayerDead();
      }
    }

    heal(n) { this.health = Math.min(this.maxHealth, this.health + n); }

    /* --------------------------- транспорт --------------------------- */
    enterVehicle(v) {
      if (!v || this.inVehicle) return;
      this.inVehicle = v;
      this.root.visible = false;
      this.enterCooldown = 0.4;
      v.engineOn = v.damage < 100;
      GTA.Audio.ui(520, 0.1);
      if (GTA.game && GTA.game.hud) GTA.game.hud.toast('Вы сели за руль', 'good');
    }

    exitVehicle(silent) {
      const v = this.inVehicle;
      if (!v) return;
      const right = v.right(_v1);
      // ищем свободную сторону
      for (const side of [-1, 1]) {
        _v2.set(v.pos.x + right.x * side * 2.4, v.pos.y, v.pos.z + right.z * side * 2.4);
        const before = _v3.copy(_v2);
        this.world.collideCircle(_v2, 0.45, v.pos.y, v.pos.y + 1.8);
        if (_v2.distanceTo(before) < 0.35) break;
      }
      this.position.set(_v2.x, this.world.groundHeight(_v2.x, _v2.z), _v2.z);
      this.velocity.set(v.vel.x * 0.3, 0, v.vel.z * 0.3);
      this.inVehicle = null;
      this.root.visible = true;
      this.enterCooldown = 0.4;
      this.bodyYaw = v.yaw;
      if (!silent) GTA.Audio.ui(420, 0.1);
    }

    /* ---------------------------- стрельба ---------------------------- */
    tryShoot(ctx) {
      if (this.reloadT > 0 || this.fireT > 0 || this.isDead) return;
      if (this.ammo <= 0) { this.reload(); return; }
      this.ammo--;
      this.fireT = WEAPON.fireRate;
      this.shotsFired++;
      this.char.recoil();

      // луч идёт из камеры через центр экрана — так прицел не врёт
      this.camera.getWorldDirection(_dir);
      _cam.copy(this.camera.position);
      const spread = (this.aiming ? WEAPON.spreadAim : WEAPON.spreadHip) *
        (1 + this.speedScalar * 0.12);
      _dir.x += U.gauss(spread); _dir.y += U.gauss(spread); _dir.z += U.gauss(spread);
      _dir.normalize();

      const wall = this.world.raycast(_cam, _dir, WEAPON.range, 'fence');
      const npcHit = ctx.npcs.raycast(_cam, _dir, wall ? wall.t : WEAPON.range);

      const muzzle = this.char.muzzleWorld(_v1);
      let endPoint;
      if (npcHit) {
        endPoint = npcHit.point;
        this.shotsHit++;
        const killed = npcHit.npc.hit(WEAPON.damage, npcHit.point, npcHit.head, this.position);
        if (killed) {
          this.kills++;
          if (GTA.game) GTA.game.onKill(npcHit.npc);
        }
        if (GTA.game && GTA.game.hud) GTA.game.hud.hitMarker(npcHit.head);
      } else if (wall) {
        endPoint = wall.point;
        GTA.FX.bulletImpact(wall.point, wall.normal, 'wall');
      } else {
        endPoint = _v2.copy(_cam).addScaledVector(_dir, WEAPON.range);
      }
      GTA.FX.tracer(muzzle, endPoint, 0xffe08a);
      GTA.FX.muzzleFlash(muzzle, _dir.x, _dir.z);
      GTA.Audio.gunshot(0);

      // отдача
      this.recoilPitch += WEAPON.recoil * U.rand(0.8, 1.4);
      this.recoilYaw += U.rand(-1, 1) * WEAPON.recoil * 0.5;
      GTA.FX.shake(0.045);
    }

    reload() {
      if (this.reloadT > 0 || this.ammo === WEAPON.mag || this.reserve <= 0) return;
      this.reloadT = WEAPON.reloadTime;
      GTA.Audio.ui(300, 0.08);
    }

    /* ----------------------------- апдейт ----------------------------- */
    update(dt, ctx) {
      this.lastDamageT += dt;
      this.fireT = Math.max(0, this.fireT - dt);
      this.enterCooldown = Math.max(0, this.enterCooldown - dt);

      // мышь -> углы камеры
      const sens = 0.0022;
      this.yaw -= In.mouse.dx * sens;
      this.pitch -= In.mouse.dy * sens;
      this.pitch = U.clamp(this.pitch, -1.05, 0.95);

      // затухание отдачи
      this.pitch += this.recoilPitch * 0.6;
      this.yaw += this.recoilYaw * 0.6;
      this.recoilPitch = U.damp(this.recoilPitch, 0, 12, dt);
      this.recoilYaw = U.damp(this.recoilYaw, 0, 12, dt);

      if (this.reloadT > 0) {
        this.reloadT -= dt;
        if (this.reloadT <= 0) {
          const need = WEAPON.mag - this.ammo;
          const take = Math.min(need, this.reserve);
          this.ammo += take; this.reserve -= take;
          GTA.Audio.ui(660, 0.08);
        }
      }

      if (this.inVehicle) this._updateDriving(dt, ctx);
      else this._updateOnFoot(dt, ctx);

      // регенерация вне боя
      if (!this.isDead && this.lastDamageT > 8 && this.health < this.maxHealth) {
        this.heal(dt * 6);
      }
      this._updateCamera(dt, ctx);
    }

    _updateOnFoot(dt, ctx) {
      const move = In.moveAxis();
      this.aiming = In.mouse.right && !this.isDead;
      const sprint = In.down('ShiftLeft') || In.down('ShiftRight');
      const maxSpeed = this.isDead ? 0 : (this.aiming ? 2.0 : (sprint ? 6.4 : 3.1));

      // направление относительно камеры
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      const wx = move.x * cos - move.z * sin;
      const wz = -move.x * sin - move.z * cos;
      const wish = _v1.set(wx, 0, wz);
      if (wish.lengthSq() > 0.001) wish.normalize().multiplyScalar(maxSpeed);

      const accel = this.onGround ? 14 : 4;
      this.velocity.x = U.damp(this.velocity.x, wish.x, accel, dt);
      this.velocity.z = U.damp(this.velocity.z, wish.z, accel, dt);

      if (In.hit('Space') && this.onGround && !this.isDead) {
        this.vy = 6.3;
        this.onGround = false;
      }
      this.vy -= 21 * dt;

      this.position.x += this.velocity.x * dt;
      this.position.z += this.velocity.z * dt;
      this.position.y += this.vy * dt;

      // земля и стены
      const gy = this.world.groundHeight(this.position.x, this.position.z);
      if (this.position.y <= gy) { this.position.y = gy; this.vy = 0; this.onGround = true; }
      this.world.collideCircle(this.position, 0.45, this.position.y + 0.2, this.position.y + 1.75);
      this.position.x = U.clamp(this.position.x, -GTA.WORLD_HALF - 30, GTA.WORLD_HALF + 30);
      this.position.z = U.clamp(this.position.z, -GTA.WORLD_HALF - 30, GTA.WORLD_HALF + 30);

      this.speedScalar = Math.hypot(this.velocity.x, this.velocity.z);
      this.isMoving = this.speedScalar > 0.8;

      // поворот тела: при прицеливании — строго по камере
      let targetBody = this.bodyYaw;
      if (this.aiming) targetBody = this.yaw;
      else if (this.speedScalar > 0.4) targetBody = Math.atan2(this.velocity.x, this.velocity.z);
      this.bodyYaw += U.angleDelta(this.bodyYaw, targetBody) * Math.min(1, dt * (this.aiming ? 18 : 9));

      // стрельба и перезарядка
      if (!this.isDead) {
        if (In.mouse.left) this.tryShoot(ctx);
        if (In.hit('KeyR')) this.reload();
        if (this.ammo === 0 && this.reloadT <= 0) this.reload();
      }

      this.root.position.copy(this.position);
      this.root.rotation.y = this.bodyYaw;
      this.char.update(dt, {
        speed: this.speedScalar, maxSpeed: 6.4,
        aiming: this.aiming, pitch: this.pitch, dead: this.isDead,
        deadT: this.isDead ? (this._deadT = (this._deadT || 0) + dt) : 0
      });
    }

    _updateDriving(dt, ctx) {
      const v = this.inVehicle;
      const inp = v.input;
      inp.throttle = (In.down('KeyW') || In.down('ArrowUp')) ? 1 : 0;
      inp.brake = (In.down('KeyS') || In.down('ArrowDown')) ? 1 : 0;
      let st = 0;
      if (In.down('KeyA') || In.down('ArrowLeft')) st += 1;
      if (In.down('KeyD') || In.down('ArrowRight')) st -= 1;
      inp.steer = st;
      inp.handbrake = In.down('Space');
      if (In.down('ShiftLeft') || In.down('ShiftRight')) inp.throttle = Math.min(1, inp.throttle + 0.35);

      v.update(dt, true);

      this.position.copy(v.pos);
      this.speedScalar = Math.abs(v.speed);
      this.isMoving = this.speedScalar > 2;
      this.aiming = false;
      this.char.update(dt, { speed: 0, maxSpeed: 6.4, seated: true, pitch: 0 });
    }

    /** Камера от третьего лица с уклонением от стен. */
    _updateCamera(dt, ctx) {
      const cam = this.camera;
      const v = this.inVehicle;
      let targetYaw, focus = _v1, dist, height;

      if (v) {
        // за машиной, но мышь может «осмотреться»
        this.freeLookYaw = U.damp(this.freeLookYaw, 0, 1.6, dt);
        this.freeLookYaw += -In.mouse.dx * 0.0024;
        this.freeLookYaw = U.clamp(this.freeLookYaw, -1.5, 1.5);
        const speedK = U.clamp(Math.abs(v.speed) / 40, 0, 1);
        targetYaw = v.yaw + this.freeLookYaw;        // камера смотрит туда же, куда нос
        this.camYaw += U.angleDelta(this.camYaw, targetYaw) * Math.min(1, dt * (4 + speedK * 5));
        this.camPitch = U.damp(this.camPitch, -0.17 - this.pitch * 0.25, 6, dt);
        dist = 7.6 + speedK * 2.6;
        height = 2.9;
        focus.set(v.pos.x, v.pos.y + 1.2, v.pos.z);
        this.yaw = this.camYaw;                      // чтобы выход из машины был логичным
        GTA.Graphics.setSpeedBlur(U.clamp((Math.abs(v.speed) - 16) / 26, 0, 1) * 1.5);
      } else {
        this.camYaw = this.yaw;
        this.camPitch = this.pitch;
        dist = this.aiming ? 2.3 : 5.0;
        height = this.aiming ? 1.56 : 1.5;   // на уровне груди: горизонтальный выстрел бьёт в корпус
        focus.set(this.position.x, this.position.y + height, this.position.z);
        GTA.Graphics.setSpeedBlur(0);
      }

      // Направление взгляда строим из углов, а не через lookAt: центр экрана
      // (перекрестье) тогда всегда совпадает с лучом выстрела — даже если
      // камеру прижало к стене.
      const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
      const fx = Math.sin(this.camYaw) * cp, fy = sp, fz = Math.cos(this.camYaw) * cp;
      const side = v ? 0 : (this.aiming ? 0.72 : 0.5);
      const rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
      const lift = v ? 2.0 : 0;

      _v2.set(focus.x - fx * dist + rx * side,
        focus.y - fy * dist + lift,
        focus.z - fz * dist + rz * side);

      const clampToWalls = (target) => {
        _v3.copy(target).sub(focus);
        const len = _v3.length();
        if (len < 0.05) return;
        _v3.multiplyScalar(1 / len);
        const hit = this.world.raycast(focus, _v3, len + 0.5, 'fence');
        if (hit && hit.t < len + 0.5) {
          target.copy(focus).addScaledVector(_v3, Math.max(0.5, hit.t - 0.45));
        }
        if (target.y < 0.5) target.y = 0.5;
      };
      clampToWalls(_v2);

      const lambda = v ? 11 : 16;
      this._camPos.x = U.damp(this._camPos.x, _v2.x, lambda, dt);
      this._camPos.y = U.damp(this._camPos.y, _v2.y, lambda, dt);
      this._camPos.z = U.damp(this._camPos.z, _v2.z, lambda, dt);
      // сглаженная позиция тоже может «залезть» в стену — проверяем ещё раз
      clampToWalls(this._camPos);

      cam.position.copy(this._camPos);
      const sh = GTA.FX.shakeAmount;
      if (sh > 0.001) {
        cam.position.x += U.rand(-1, 1) * sh * 0.2;
        cam.position.y += U.rand(-1, 1) * sh * 0.2;
        cam.position.z += U.rand(-1, 1) * sh * 0.2;
      }
      // сведение: камера смещена вбок, поэтому её луч слегка доворачивается
      // к оси игрока — перекрестье и «куда смотрит герой» сходятся на ~22 м
      const converge = Math.atan2(side, 22);
      cam.rotation.set(this.camPitch, this.camYaw - converge + Math.PI, 0, 'YXZ');
      cam.fov = U.damp(cam.fov, this.aiming ? 46 : (v ? 62 + U.clamp(Math.abs(v.speed) / 6, 0, 12) : 62), 8, dt);
      cam.updateProjectionMatrix();
    }
  }

  GTA.Player = Player;
  GTA.WEAPON = WEAPON;
})();

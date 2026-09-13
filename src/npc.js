/* =============================================================================
 *  npc.js — ИИ противников: охрана склада и полиция.
 *  Конечный автомат: PATROL → SUSPECT → COMBAT → DEAD.
 *  Обнаружение по дистанции + углу обзора + прямой видимости (raycast по AABB).
 * ========================================================================== */
(function () {
  'use strict';
  const GTA = window.GTA, U = GTA.Utils;

  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
  const _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3(), _s3 = new THREE.Vector3(),
    _s4 = new THREE.Vector3(), _s5 = new THREE.Vector3(), _s6 = new THREE.Vector3();

  const PRESETS = {
    guard: {
      skin: 0xb98a60, shirt: 0x2b3138, pants: 0x1e2228, vest: 0x1b1f25,
      hair: 0x1d1a17, health: 100, viewDist: 48, fov: Math.PI * 0.62,
      fireRate: 0.16, burst: [3, 6], reload: 1.9, damage: 7, spread: 0.055, walk: 2.4, run: 5.2
    },
    cop: {
      skin: 0xc79a72, shirt: 0x1b3a63, pants: 0x16233a, vest: 0x101722, cap: 0x0f1a2c,
      hair: 0x2a2320, health: 110, viewDist: 65, fov: Math.PI * 0.8,
      fireRate: 0.22, burst: [2, 4], reload: 2.2, damage: 8, spread: 0.06, walk: 2.6, run: 5.6
    }
  };

  class NPC {
    constructor(scene, world, opts) {
      const preset = PRESETS[opts.faction || 'guard'];
      this.faction = opts.faction || 'guard';
      this.preset = preset;
      this.scene = scene;
      this.world = world;
      this.char = new GTA.Character({
        skin: preset.skin, shirt: preset.shirt, pants: preset.pants,
        vest: preset.vest, hair: preset.hair, cap: preset.cap, gunColor: 0x1c1f24
      });
      this.root = this.char.root;
      scene.add(this.root);

      this.pos = new THREE.Vector3().copy(opts.pos);
      this.yaw = opts.yaw || Math.random() * Math.PI * 2;
      this.health = preset.health;
      this.state = 'patrol';
      this.route = (opts.route || []).map(p => new THREE.Vector3(p[0], 0, p[1]));
      this.routeIdx = 0;
      this.waitT = 0;
      this.detectT = 0;
      this.lastSeen = new THREE.Vector3();
      this.hasLastSeen = false;
      this.fireT = 0;
      this.burstLeft = 0;
      this.reloadT = 0;
      this.strafeDir = Math.random() < 0.5 ? 1 : -1;
      this.strafeT = 0;
      this.deadT = 0;
      this.speed = 0;
      this.searchT = 0;
      this.alerted = !!opts.alerted;
      if (this.alerted) this.state = 'combat';
      this.pos.y = world.groundHeight(this.pos.x, this.pos.z);
      this.root.position.copy(this.pos);
    }

    get isDead() { return this.state === 'dead'; }

    /** Голова/тело для попаданий. */
    headPos(out) { return (out || _v).set(this.pos.x, this.pos.y + 1.62, this.pos.z); }
    chestPos(out) { return (out || _v).set(this.pos.x, this.pos.y + 1.15, this.pos.z); }

    hit(dmg, point, headshot, fromPos) {
      if (this.state === 'dead') return false;
      this.health -= headshot ? dmg * 3 : dmg;
      GTA.FX.bulletImpact(point, _v3.set(0, 1, 0), 'flesh');
      if (fromPos) {
        this.lastSeen.copy(fromPos);
        this.hasLastSeen = true;
        this.alerted = true;
        if (this.state === 'patrol') this.state = 'combat';
      }
      if (this.health <= 0) {
        this.state = 'dead';
        this.deadT = 0;
        GTA.Audio.hurt();
        return true;      // убит
      }
      return false;
    }

    /** Видит ли игрока прямо сейчас. */
    _canSee(target) {
      const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > this.preset.viewDist) return false;
      if (dist > 2) {
        const ang = Math.atan2(dx, dz);
        if (Math.abs(U.angleDelta(this.yaw, ang)) > this.preset.fov / 2 && !this.alerted) return false;
      }
      this.chestPos(_v2);
      _v3.set(target.x, target.y + 1.2, target.z);
      return this.world.lineOfSight(_v2, _v3);
    }

    /** Движение с обходом стен. */
    _moveTo(target, speed, dt) {
      const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.35) { this.speed = 0; return true; }
      let dirX = dx / d, dirZ = dz / d;

      // пробный луч: если впереди стена — скользим вдоль
      _v2.set(this.pos.x, this.pos.y + 0.9, this.pos.z);
      _v3.set(dirX, 0, dirZ);
      const h = this.world.raycast(_v2, _v3, 2.4);
      if (h) {
        const nx = h.normal.x, nz = h.normal.z;
        const tx = -nz, tz = nx;
        const s = (tx * dirX + tz * dirZ) >= 0 ? 1 : -1;
        dirX = tx * s; dirZ = tz * s;
      }

      const step = speed * dt;
      this.pos.x += dirX * step;
      this.pos.z += dirZ * step;
      this.speed = speed;
      const targetYaw = Math.atan2(dirX, dirZ);
      this.yaw += U.angleDelta(this.yaw, targetYaw) * Math.min(1, dt * 8);
      return false;
    }

    _shoot(ctx) {
      const player = ctx.player;
      const muzzle = this.char.muzzleWorld(_s1);
      const targetY = player.inVehicle ? 1.0 : 1.15;
      _s4.set(player.position.x, player.position.y + targetY, player.position.z);
      const dir = _s2.copy(_s4).sub(muzzle);
      const dist = dir.length();
      if (dist < 0.2) return;
      dir.normalize();
      const spread = this.preset.spread * (1 + dist / 80) * (player.isMoving ? 1.6 : 1);
      dir.x += U.gauss(spread); dir.y += U.gauss(spread * 0.6); dir.z += U.gauss(spread);
      dir.normalize();

      const range = dist + 6;
      const wallHit = this.world.raycast(muzzle, dir, range, 'fence');
      const end = _s3.copy(muzzle).addScaledVector(dir, wallHit ? wallHit.t : range);
      GTA.FX.tracer(muzzle, end, 0xff9d4a);
      GTA.FX.muzzleFlash(muzzle, dir.x, dir.z);
      this.char.recoil();
      GTA.Audio.enemyShot(dist);
      if (wallHit) GTA.FX.bulletImpact(wallHit.point, wallHit.normal, 'wall');

      // попадание: ближайшее сближение луча с точкой цели
      const t = U.clamp(_s6.copy(_s4).sub(muzzle).dot(dir), 0, wallHit ? wallHit.t : range);
      const closest = _s5.copy(muzzle).addScaledVector(dir, t);
      const miss = closest.distanceTo(_s4);
      const hitR = player.inVehicle ? 1.35 : 0.52;
      if (miss < hitR && (!wallHit || wallHit.t > dist - 0.5)) {
        player.takeDamage(this.preset.damage * (player.inVehicle ? 0.4 : 1), this.pos);
      }
    }

    update(dt, ctx) {
      const player = ctx.player;

      if (this.state === 'dead') {
        this.deadT += dt;
        this.char.update(dt, { dead: true, deadT: this.deadT });
        this.root.position.copy(this.pos);
        this.root.rotation.y = this.yaw;
        return;
      }

      const dist = U.dist2D(this.pos.x, this.pos.z, player.position.x, player.position.z);
      const canSee = !player.isDead && this._canSee(player.position);

      if (canSee) {
        this.detectT += dt;
        this.lastSeen.copy(player.position);
        this.hasLastSeen = true;
        if (this.state === 'patrol' && this.detectT > (this.alerted ? 0 : 0.35)) {
          this.state = 'combat';
          this.alerted = true;
          GTA.Audio.ui(420, 0.12);
          if (ctx.onSpotted) ctx.onSpotted(this);
        } else if (this.state === 'suspect') {
          this.state = 'combat';
        }
      } else {
        this.detectT = Math.max(0, this.detectT - dt * 0.5);
        if (this.state === 'combat') {
          this.searchT += dt;
          if (this.searchT > 9) { this.state = 'suspect'; this.searchT = 0; }
        }
      }

      switch (this.state) {
        case 'patrol': this._patrol(dt); break;
        case 'suspect': this._suspect(dt); break;
        case 'combat': this._combat(dt, ctx, dist, canSee); break;
      }

      // сначала встаём на пол, потом выталкиваемся из стен —
      // иначе бетонная площадка (тоже AABB) вытолкнет NPC наружу
      this.pos.y = this.world.groundHeight(this.pos.x, this.pos.z);
      this.world.collideCircle(this.pos, 0.42, this.pos.y + 0.25, this.pos.y + 1.7);
      this.pos.y = this.world.groundHeight(this.pos.x, this.pos.z);

      this.root.position.copy(this.pos);
      this.root.rotation.y = this.yaw;
      this.char.update(dt, {
        speed: this.speed, maxSpeed: this.preset.run,
        aiming: this.state === 'combat', pitch: 0
      });
    }

    _patrol(dt) {
      if (!this.route.length) { this.speed = 0; return; }
      if (this.waitT > 0) { this.waitT -= dt; this.speed = 0; return; }
      const t = this.route[this.routeIdx];
      if (this._moveTo(t, this.preset.walk, dt)) {
        this.routeIdx = (this.routeIdx + 1) % this.route.length;
        this.waitT = U.rand(0.6, 2.2);
      }
    }

    _suspect(dt) {
      if (this.hasLastSeen) {
        if (this._moveTo(this.lastSeen, this.preset.walk * 1.4, dt)) {
          this.hasLastSeen = false;
          this.waitT = 2;
        }
      } else {
        this.speed = 0;
        this.yaw += dt * 0.9;
        this.waitT -= dt;
        if (this.waitT <= 0) { this.state = 'patrol'; this.searchT = 0; }
      }
    }

    _combat(dt, ctx, dist, canSee) {
      const player = ctx.player;
      this.searchT = canSee ? 0 : this.searchT;

      if (canSee) {
        // держим дистанцию, постреливая
        const want = 13;
        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafeT = U.rand(0.8, 2.2); this.strafeDir *= -1; }
        if (dist > want + 5) {
          this._moveTo(player.position, this.preset.run, dt);
        } else if (dist < want - 5) {
          _v.set(this.pos.x * 2 - player.position.x, 0, this.pos.z * 2 - player.position.z);
          this._moveTo(_v, this.preset.walk, dt);
        } else {
          // стрейф вбок
          const ang = Math.atan2(player.position.x - this.pos.x, player.position.z - this.pos.z);
          _v.set(this.pos.x + Math.cos(ang) * this.strafeDir * 3, 0, this.pos.z - Math.sin(ang) * this.strafeDir * 3);
          this._moveTo(_v, this.preset.walk, dt);
          this.speed = this.preset.walk;
        }
        // всегда смотрим на игрока
        const ang = Math.atan2(player.position.x - this.pos.x, player.position.z - this.pos.z);
        this.yaw += U.angleDelta(this.yaw, ang) * Math.min(1, dt * 9);

        // огонь очередями
        this.reloadT -= dt;
        if (this.reloadT <= 0) {
          this.fireT -= dt;
          if (this.burstLeft <= 0 && this.fireT <= 0) {
            this.burstLeft = U.randInt(this.preset.burst[0], this.preset.burst[1]);
          }
          if (this.burstLeft > 0 && this.fireT <= 0 && dist < this.preset.viewDist) {
            this._shoot(ctx);
            this.burstLeft--;
            this.fireT = this.preset.fireRate;
            if (this.burstLeft <= 0) this.reloadT = U.rand(1.1, this.preset.reload);
          }
        }
      } else {
        this._suspectAdvance(dt);
      }
    }

    _suspectAdvance(dt) {
      if (this.hasLastSeen) {
        if (this._moveTo(this.lastSeen, this.preset.run * 0.8, dt)) this.hasLastSeen = false;
      } else {
        this.speed = 0;
        this.yaw += dt * 1.2;
      }
    }

    dispose() { this.char.dispose(); }
  }

  /* ========================================================================
   *  Менеджер: спавн, апдейт, попадания пуль, полиция
   * ===================================================================== */
  class NPCManager {
    constructor(scene, world) {
      this.scene = scene;
      this.world = world;
      this.list = [];
      this.cars = [];
      this.siren = null;
      this.sirenVol = 0;
    }

    spawn(opts) {
      const n = new NPC(this.scene, this.world, opts);
      this.list.push(n);
      return n;
    }

    spawnGuards() {
      GTA.Locations.guardPosts.forEach((p) => {
        this.spawn({ faction: 'guard', pos: p.pos, route: p.route });
      });
    }

    /** Полицейская машина с двумя копами, появляется вне поля зрения. */
    spawnPoliceCar(nearPos, playerYaw) {
      const roads = GTA.roadCoords;
      // ищем перекрёсток в 90–160 м от игрока
      let best = null, bestScore = 1e9;
      for (let i = 0; i < roads.length; i++) {
        for (let j = 0; j < roads.length; j++) {
          const d = U.dist2D(roads[i], roads[j], nearPos.x, nearPos.z);
          const score = Math.abs(d - 120) + Math.random() * 20;
          if (d > 80 && d < 190 && score < bestScore) {
            bestScore = score; best = { x: roads[i], z: roads[j] };
          }
        }
      }
      if (!best) return null;
      const yaw = Math.atan2(nearPos.x - best.x, nearPos.z - best.z);
      const car = new GTA.Vehicle(this.scene, this.world, {
        police: true, color: 0x1c2430, x: best.x, z: best.z, yaw
      });
      car.isPolice = true;
      car.copsInside = 2;
      this.cars.push(car);
      if (!this.siren && GTA.Audio.ctx) this.siren = GTA.Audio.createSiren();
      return car;
    }

    /** Высадка копов из машины. */
    deployCops(car) {
      if (!car.copsInside) return;
      const right = car.right(_v2);
      for (let i = 0; i < car.copsInside; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const p = new THREE.Vector3(
          car.pos.x + right.x * side * 2.2, car.pos.y, car.pos.z + right.z * side * 2.2);
        this.spawn({ faction: 'cop', pos: p, alerted: true, route: [] });
      }
      car.copsInside = 0;
    }

    aliveGuards() {
      let n = 0;
      for (const e of this.list) if (e.faction === 'guard' && !e.isDead) n++;
      return n;
    }
    totalGuards() {
      let n = 0;
      for (const e of this.list) if (e.faction === 'guard') n++;
      return n;
    }

    /**
     * Проверка луча против всех живых NPC.
     * @returns {null|{npc:NPC, t:number, point:THREE.Vector3, head:boolean}}
     */
    raycast(origin, dir, maxDist, skip) {
      let best = null;
      for (let i = 0; i < this.list.length; i++) {
        const n = this.list[i];
        if (n.isDead || n === skip) continue;
        // тело: вертикальный цилиндр, голова: сфера
        const hb = raySphere(origin, dir, n.headPos(_v), 0.2, maxDist);
        const bb = rayCylinder(origin, dir, n.pos, 0.45, 0.5, 1.58, maxDist);
        let t = null, head = false;
        if (hb !== null && (bb === null || hb < bb)) { t = hb; head = true; }
        else if (bb !== null) { t = bb; }
        if (t !== null && (!best || t < best.t)) {
          best = {
            npc: n, t, head,
            point: new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t)
          };
        }
      }
      return best;
    }

    update(dt, ctx) {
      for (let i = 0; i < this.list.length; i++) {
        const n = this.list[i];
        // дальние трупы не обновляем
        if (n.isDead && n.deadT > 3) continue;
        n.update(dt, ctx);
      }
      // полицейские машины
      const player = ctx.player;
      let nearest = 1e9;
      for (let i = this.cars.length - 1; i >= 0; i--) {
        const c = this.cars[i];
        const d = U.dist2D(c.pos.x, c.pos.z, player.position.x, player.position.z);
        nearest = Math.min(nearest, d);
        if (player.inVehicle === c) continue;      // этой машиной рулит игрок
        if (d > 320) { c.dispose(); this.cars.splice(i, 1); continue; }
        c.driveAI(dt, player.position, !player.inVehicle ? false : true);
        if (d < 26 && c.copsInside > 0 && Math.abs(c.speed) < 6) this.deployCops(c);
      }
      if (this.siren) {
        this.sirenVol = U.damp(this.sirenVol, this.cars.length ? U.clamp(1 - nearest / 140, 0, 1) : 0, 3, dt);
        this.siren.set(this.sirenVol);
      }
    }

    reset() {
      this.list.forEach(n => n.dispose());
      this.list.length = 0;
      this.cars.forEach(c => c.dispose());
      this.cars.length = 0;
      if (this.siren) this.siren.set(0);
      this.sirenVol = 0;
    }
  }

  /* ------------------------- геометрия попаданий ------------------------- */
  function raySphere(o, d, c, r, maxT) {
    const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
    const b = ox * d.x + oy * d.y + oz * d.z;
    const cc = ox * ox + oy * oy + oz * oz - r * r;
    const disc = b * b - cc;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    return (t > 0 && t < maxT) ? t : null;
  }
  /** Вертикальный цилиндр от y0 до y1 вокруг (base.x, base.z). */
  function rayCylinder(o, d, base, r, y0, y1, maxT) {
    const ox = o.x - base.x, oz = o.z - base.z;
    const a = d.x * d.x + d.z * d.z;
    if (a < 1e-9) return null;
    const b = 2 * (ox * d.x + oz * d.z);
    const c = ox * ox + oz * oz - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    let t = (-b - sq) / (2 * a);
    if (t < 0) t = (-b + sq) / (2 * a);
    if (t < 0 || t > maxT) return null;
    const y = o.y + d.y * t - base.y;
    if (y < y0 || y > y1) return null;
    return t;
  }

  GTA.NPC = NPC;
  GTA.NPCManager = NPCManager;
})();

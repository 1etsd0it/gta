/* =============================================================================
 *  world.js — процедурный город: кварталы, дороги, промзона, порт.
 *  Здесь же живёт физический мир: список AABB + broadphase-сетка,
 *  push-out для персонажей/машин и лучевые проверки для пуль и линии взгляда.
 * ========================================================================== */
(function () {
  'use strict';
  const GTA = window.GTA, U = GTA.Utils, T = GTA.Tex;

  /* ------------------------------- константы ------------------------------ */
  const HALF = 400;            // мир: -400..400 по обеим осям
  const STEP = 100;            // шаг дорожной сетки
  const ROAD_W = 20;           // ширина обычной дороги
  const AVENUE_W = 34;         // главная магистраль (z = 0)
  const LOT = 84;              // сторона квартала между дорогами
  const LOT_H = 0.18;          // высота тротуара

  const roadCoords = [];
  for (let c = -HALF; c <= HALF; c += STEP) roadCoords.push(c);
  const blockCoords = [];
  for (let c = -HALF + STEP / 2; c < HALF; c += STEP) blockCoords.push(c);

  /* Ключевые точки миссии — их читает mission.js */
  const L = GTA.Locations = {
    playerStart: new THREE.Vector3(-5, 0, -40),
    carStart: new THREE.Vector3(4.5, 0, -46),
    carStartYaw: 0,                                   // носом на +Z (к складу)
    warehouseGate: new THREE.Vector3(203, 0, 250),
    warehouseCenter: new THREE.Vector3(258, 0, 250),
    cargo: new THREE.Vector3(271, 0.2, 250),
    extraction: new THREE.Vector3(-350, 0, -350),
    guardPosts: [],
    copSpawns: []
  };

  /* ============================================================================
   *  Мир
   * ========================================================================= */
  class World {
    constructor(scene) {
      this.scene = scene;
      this.solids = [];            // {x0,z0,x1,z1,y0,y1,kind}
      this.grid = new Map();       // broadphase
      this.cellSize = 24;
      this.map = { roads: [], lots: [], marks: [] };  // данные для миникарты
      this.hangarRoof = null;
      this.props = [];             // динамические предметы (кейс и т.п.)
    }

    /* ------------------------- физика: регистрация ------------------------- */
    addSolid(x0, z0, x1, z1, y0, y1, kind) {
      const s = {
        x0: Math.min(x0, x1), x1: Math.max(x0, x1),
        z0: Math.min(z0, z1), z1: Math.max(z0, z1),
        y0: y0 || 0, y1: y1 === undefined ? 20 : y1,
        kind: kind || 'building'
      };
      const idx = this.solids.push(s) - 1;
      const cs = this.cellSize;
      const cx0 = Math.floor(s.x0 / cs), cx1 = Math.floor(s.x1 / cs);
      const cz0 = Math.floor(s.z0 / cs), cz1 = Math.floor(s.z1 / cs);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cz = cz0; cz <= cz1; cz++) {
          const key = cx + ',' + cz;
          let arr = this.grid.get(key);
          if (!arr) { arr = []; this.grid.set(key, arr); }
          arr.push(idx);
        }
      }
      return s;
    }

    _near(x, z, r, out) {
      out.length = 0;
      const cs = this.cellSize;
      const cx0 = Math.floor((x - r) / cs), cx1 = Math.floor((x + r) / cs);
      const cz0 = Math.floor((z - r) / cs), cz1 = Math.floor((z + r) / cs);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cz = cz0; cz <= cz1; cz++) {
          const arr = this.grid.get(cx + ',' + cz);
          if (!arr) continue;
          for (let i = 0; i < arr.length; i++) {
            const s = this.solids[arr[i]];
            if (out.indexOf(s) === -1) out.push(s);
          }
        }
      }
      return out;
    }

    /**
     * Выталкивание круга (персонаж/колёса машины) из стен.
     * @returns {null|{nx:number,nz:number,depth:number}} нормаль столкновения
     */
    collideCircle(pos, radius, feetY, headY) {
      const list = this._near(pos.x, pos.z, radius + 2, this._tmpList || (this._tmpList = []));
      let res = null, best = 0;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (headY < s.y0 || feetY > s.y1 - 0.05) continue;   // проходим сверху/снизу
        const cx = U.clamp(pos.x, s.x0, s.x1);
        const cz = U.clamp(pos.z, s.z0, s.z1);
        let dx = pos.x - cx, dz = pos.z - cz;
        let d = Math.hypot(dx, dz);
        if (d >= radius) continue;
        if (d < 0.0001) {
          // центр внутри бокса — выталкиваем по ближайшей грани
          const dl = pos.x - s.x0, dr = s.x1 - pos.x;
          const db = pos.z - s.z0, df = s.z1 - pos.z;
          const m = Math.min(dl, dr, db, df);
          dx = (m === dl) ? -1 : (m === dr ? 1 : 0);
          dz = (m === db) ? -1 : (m === df ? 1 : 0);
          d = 0.0001;
          pos.x += dx * (m + radius);
          pos.z += dz * (m + radius);
          res = { nx: dx, nz: dz, depth: m + radius };
          continue;
        }
        const push = radius - d;
        const nx = dx / d, nz = dz / d;
        pos.x += nx * push;
        pos.z += nz * push;
        if (push > best) { best = push; res = { nx, nz, depth: push }; }
      }
      return res;
    }

    /** Высота «пола» в точке (тротуар / бетонная площадка). */
    groundHeight(x, z) {
      const list = this._near(x, z, 0.1, this._tmpList2 || (this._tmpList2 = []));
      let h = 0;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (s.kind !== 'floor') continue;
        if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) h = Math.max(h, s.y1);
      }
      return h;
    }

    /**
     * Луч против всех AABB. Возвращает ближайшее попадание.
     * skipKind позволяет игнорировать тип препятствия (например 'fence' —
     * сквозь сетку-рабицу видно и стреляется, но пройти нельзя).
     * @returns {null|{t:number, point:THREE.Vector3, normal:THREE.Vector3}}
     */
    raycast(origin, dir, maxDist, skipKind) {
      let bestT = maxDist, hit = null, hitAxis = 0, hitSign = 0;
      const steps = Math.ceil(maxDist / this.cellSize) + 1;
      const cs = this.cellSize;
      const seen = this._raySeen || (this._raySeen = new Set());
      seen.clear();
      for (let i = 0; i <= steps; i++) {
        const t = Math.min(i * cs * 0.9, maxDist);
        const px = origin.x + dir.x * t, pz = origin.z + dir.z * t;
        const cx0 = Math.floor((px - cs) / cs), cx1 = Math.floor((px + cs) / cs);
        const cz0 = Math.floor((pz - cs) / cs), cz1 = Math.floor((pz + cs) / cs);
        for (let cx = cx0; cx <= cx1; cx++) {
          for (let cz = cz0; cz <= cz1; cz++) {
            const key = cx + ',' + cz;
            if (seen.has(key)) continue;
            seen.add(key);
            const arr = this.grid.get(key);
            if (!arr) continue;
            for (let k = 0; k < arr.length; k++) {
              const s = this.solids[arr[k]];
              if (skipKind && s.kind === skipKind) continue;   // сетка-рабица не держит пули
              const r = rayAABB(origin, dir, s, bestT);
              if (r && r.t < bestT) { bestT = r.t; hitAxis = r.axis; hitSign = r.sign; hit = s; }
            }
          }
        }
        if (hit && bestT < i * cs * 0.9) break;    // ближе уже не найти
      }
      if (!hit) return null;
      const n = new THREE.Vector3();
      if (hitAxis === 0) n.x = hitSign; else if (hitAxis === 1) n.y = hitSign; else n.z = hitSign;
      return {
        t: bestT,
        point: new THREE.Vector3(origin.x + dir.x * bestT, origin.y + dir.y * bestT, origin.z + dir.z * bestT),
        normal: n,
        kind: hit.kind,
        solid: hit
      };
    }

    /** Есть ли прямая видимость между двумя точками. */
    lineOfSight(a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const len = Math.hypot(dx, dy, dz);
      if (len < 0.01) return true;
      const dir = new THREE.Vector3(dx / len, dy / len, dz / len);
      const h = this.raycast(a, dir, len - 0.4, 'fence');
      return !h;
    }

    /* ============================ ПОСТРОЙКА ============================== */
    build() {
      this._buildGround();
      this._buildRoads();
      this._buildBlocks();
      this._buildStreetProps();
      this._buildWarehouse();
      this._buildDocks();
      this._buildParkedCars();
      return this;
    }

    _mat(color, rough, metal, map) {
      const m = new THREE.MeshStandardMaterial({
        color, roughness: rough === undefined ? 0.9 : rough,
        metalness: metal === undefined ? 0.05 : metal
      });
      if (map) m.map = map;
      return m;
    }

    _buildGround() {
      const tex = T.noise(256, 0.35);
      tex.repeat.set(140, 140);
      const g = new THREE.Mesh(
        new THREE.PlaneGeometry(1600, 1600),
        new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 1, metalness: 0, bumpMap: tex, bumpScale: 0.25 })
      );
      g.rotation.x = -Math.PI / 2;
      g.receiveShadow = true;
      this.scene.add(g);
    }

    _buildRoads() {
      const along = T.asphalt(true);
      const roadMat = new THREE.MeshStandardMaterial({
        map: along, roughness: 0.95, metalness: 0.02,
        bumpMap: T.noise(128, 0.5), bumpScale: 0.12
      });
      // общая текстура, но каждому мешу нужен свой repeat -> клонируем материал
      const mk = (w, d, x, z, rx) => {
        const m = roadMat.clone();
        m.map = along.clone();
        m.map.needsUpdate = true;
        m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping;
        m.map.repeat.set(Math.max(w, d) / 16, Math.min(w, d) / 16);
        m.map.rotation = rx ? Math.PI / 2 : 0;
        m.map.center.set(0.5, 0.5);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x, 0.02, z);
        mesh.receiveShadow = true;
        this.scene.add(mesh);
      };
      for (let i = 0; i < roadCoords.length; i++) {
        const c = roadCoords[i];
        const wz = (c === 0) ? AVENUE_W : ROAD_W;
        mk(HALF * 2 + 40, wz, 0, c, false);          // дороги вдоль X
        mk(ROAD_W, HALF * 2 + 40, c, 0, true);        // дороги вдоль Z
        this.map.roads.push({ h: true, c, w: wz });
        this.map.roads.push({ h: false, c, w: ROAD_W });
      }
    }

    /* ------ прототипы зданий: по одному InstancedMesh на прототип ------ */
    _buildingPrototypes() {
      const P = [
        { w: 18, d: 18, h: 34, cols: 5, rows: 9, base: 0x8d8579, lit: 0.16 },
        { w: 22, d: 22, h: 56, cols: 6, rows: 15, base: 0x6f7885, lit: 0.22 },
        { w: 26, d: 22, h: 23, cols: 7, rows: 6, base: 0xa1907e, lit: 0.12 },
        { w: 30, d: 26, h: 15, cols: 8, rows: 4, base: 0x9a8b78, lit: 0.1 },
        { w: 16, d: 20, h: 44, cols: 4, rows: 12, base: 0x74706b, lit: 0.2 },
        { w: 24, d: 24, h: 72, cols: 6, rows: 19, base: 0x5e6773, lit: 0.26 },
        { w: 32, d: 28, h: 12, cols: 9, rows: 3, base: 0xb0a08a, lit: 0.08 },
        { w: 20, d: 20, h: 27, cols: 5, rows: 7, base: 0x86745f, lit: 0.14 },
        { w: 28, d: 20, h: 19, cols: 7, rows: 5, base: 0x99937f, lit: 0.11 },
        { w: 14, d: 14, h: 48, cols: 4, rows: 13, base: 0x6a6f78, lit: 0.24 }
      ];
      return P.map((p) => {
        const tex = T.facade(p.cols, p.rows, p.base, p.lit);
        const t = tex.clone();
        t.needsUpdate = true;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(1, 1);
        const mat = new THREE.MeshStandardMaterial({
          map: t, color: 0xffffff, roughness: 0.82, metalness: 0.06,
          emissive: 0x2a1c08, emissiveIntensity: 0.25, emissiveMap: t
        });
        this.facadeMats = this.facadeMats || [];
        this.facadeMats.push(mat);
        return { p, mat, geo: new THREE.BoxGeometry(p.w, p.h, p.d), list: [] };
      });
    }

    _buildBlocks() {
      const protos = this._buildingPrototypes();
      const lotMat = this._mat(0x5f5d59, 1, 0);
      lotMat.bumpMap = T.noise(128, 0.4);
      lotMat.bumpMap.repeat.set(8, 8);
      lotMat.bumpScale = 0.12;
      const lotGeo = new THREE.BoxGeometry(LOT, LOT_H * 2, LOT);
      const lots = [];
      const parks = [];
      const trees = [];

      for (let bi = 0; bi < blockCoords.length; bi++) {
        for (let bj = 0; bj < blockCoords.length; bj++) {
          const bx = blockCoords[bi], bz = blockCoords[bj];
          // промзона и порт застраиваются отдельно
          if (bx > 190 && bz > 190) continue;
          if (bx < -300 && bz < -300) continue;

          lots.push({ x: bx, z: bz });
          this.addSolid(bx - LOT / 2, bz - LOT / 2, bx + LOT / 2, bz + LOT / 2, 0, LOT_H, 'floor');
          this.map.lots.push({ x: bx, z: bz, s: LOT });

          const distCenter = Math.hypot(bx, bz);
          const isPark = ((bi * 7 + bj * 13) % 17) === 3;
          if (isPark) {
            parks.push({ x: bx, z: bz });
            for (let k = 0; k < 14; k++) {
              trees.push({ x: bx + U.rand(-34, 34), z: bz + U.rand(-34, 34), s: U.rand(0.8, 1.35) });
            }
            continue;
          }

          // 4 участка в квартале
          const sub = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
          for (let s = 0; s < 4; s++) {
            if (Math.random() < 0.12) continue;    // пустырь / парковка
            const ox = bx + sub[s][0] * 20, oz = bz + sub[s][1] * 20;
            let idx;
            if (distCenter < 140) idx = U.pick([1, 5, 4, 9, 0]);          // даунтаун
            else if (distCenter < 260) idx = U.pick([0, 2, 7, 4, 8, 1]);  // средняя застройка
            else idx = U.pick([3, 6, 8, 2, 7]);                            // окраина
            const pr = protos[idx];
            const rot = Math.random() < 0.5 ? 0 : Math.PI / 2;
            const w = rot === 0 ? pr.p.w : pr.p.d;
            const d = rot === 0 ? pr.p.d : pr.p.w;
            pr.list.push({ x: ox, z: oz, rot });
            this.addSolid(ox - w / 2, oz - d / 2, ox + w / 2, oz + d / 2, 0, pr.p.h, 'building');
          }
        }
      }

      // тротуарные плиты кварталов
      const lotMesh = new THREE.InstancedMesh(lotGeo, lotMat, lots.length);
      const m4 = new THREE.Matrix4();

      // внутренняя площадка квартала (асфальт/парковка) — темнее тротуара
      const innerMat = this._mat(0x45484d, 1, 0);
      innerMat.bumpMap = T.noise(128, 0.5);
      innerMat.bumpScale = 0.12;
      const innerGeo = new THREE.BoxGeometry(LOT - 14, LOT_H * 2 + 0.04, LOT - 14);
      const innerMesh = new THREE.InstancedMesh(innerGeo, innerMat, lots.length);
      lots.forEach((l, i) => {
        m4.identity().setPosition(l.x, 0.02, l.z);
        innerMesh.setMatrixAt(i, m4);
      });
      innerMesh.instanceMatrix.needsUpdate = true;
      innerMesh.receiveShadow = true;
      this.scene.add(innerMesh);

      lots.forEach((l, i) => {
        m4.identity().setPosition(l.x, 0, l.z);
        lotMesh.setMatrixAt(i, m4);
      });
      lotMesh.instanceMatrix.needsUpdate = true;
      lotMesh.receiveShadow = true;
      lotMesh.castShadow = false;
      this.scene.add(lotMesh);

      // здания
      const q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
      protos.forEach((pr) => {
        if (!pr.list.length) return;
        const mesh = new THREE.InstancedMesh(pr.geo, pr.mat, pr.list.length);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        pr.list.forEach((b, i) => {
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.rot);
          pos.set(b.x, pr.p.h / 2 + LOT_H, b.z);
          m4.compose(pos, q, sc);
          mesh.setMatrixAt(i, m4);
        });
        mesh.instanceMatrix.needsUpdate = true;
        this.scene.add(mesh);

        // «шапка» крыши — тёмный парапет
        const capGeo = new THREE.BoxGeometry(pr.p.w + 0.8, 1.0, pr.p.d + 0.8);
        const capMesh = new THREE.InstancedMesh(capGeo, this._mat(0x3d4048, 0.95, 0.1), pr.list.length);
        capMesh.castShadow = true;
        pr.list.forEach((b, i) => {
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.rot);
          pos.set(b.x, pr.p.h + LOT_H, b.z);
          m4.compose(pos, q, sc);
          capMesh.setMatrixAt(i, m4);
        });
        capMesh.instanceMatrix.needsUpdate = true;
        this.scene.add(capMesh);
      });

      // парки: газон + деревья
      if (parks.length) {
        const grass = new THREE.InstancedMesh(
          new THREE.BoxGeometry(LOT - 6, 0.12, LOT - 6),
          this._mat(0x4e6b3a, 1, 0), parks.length);
        parks.forEach((p, i) => {
          m4.identity().setPosition(p.x, LOT_H + 0.06, p.z);
          grass.setMatrixAt(i, m4);
        });
        grass.instanceMatrix.needsUpdate = true;
        grass.receiveShadow = true;
        this.scene.add(grass);
      }
      this._buildTrees(trees);
    }

    _buildTrees(list) {
      if (!list.length) return;
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      const trunk = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.22, 0.34, 3.2, 6),
        this._mat(0x4a3626, 1, 0), list.length);
      const crown = new THREE.InstancedMesh(
        new THREE.IcosahedronGeometry(1.9, 0),
        this._mat(0x4f7a35, 0.95, 0), list.length);
      trunk.castShadow = crown.castShadow = true;
      crown.receiveShadow = true;
      list.forEach((t, i) => {
        q.identity();
        s.set(t.s, t.s, t.s);
        p.set(t.x, LOT_H + 1.6 * t.s, t.z);
        m4.compose(p, q, s); trunk.setMatrixAt(i, m4);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 3);
        p.set(t.x, LOT_H + (3.2 + 1.3) * t.s, t.z);
        s.set(t.s * U.rand(0.9, 1.2), t.s * U.rand(0.9, 1.3), t.s * U.rand(0.9, 1.2));
        m4.compose(p, q, s); crown.setMatrixAt(i, m4);
        this.addSolid(t.x - 0.4, t.z - 0.4, t.x + 0.4, t.z + 0.4, 0, 3, 'tree');
      });
      trunk.instanceMatrix.needsUpdate = crown.instanceMatrix.needsUpdate = true;
      this.scene.add(trunk); this.scene.add(crown);
    }

    /** Фонари, светофоры, урны вдоль дорог. */
    _buildStreetProps() {
      const lamps = [], lights = [], signals = [];
      for (let i = 0; i < roadCoords.length; i++) {
        const c = roadCoords[i];
        for (let p = -HALF + 30; p < HALF; p += 50) {
          const off = ROAD_W / 2 + 2.2;
          lamps.push({ x: p, z: c + off, rot: Math.PI });
          lamps.push({ x: c + off, z: p, rot: -Math.PI / 2 });
        }
      }
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(),
        sc = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);

      const pole = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.13, 0.17, 8, 6),
        this._mat(0x33383f, 0.7, 0.7), lamps.length);
      const arm = new THREE.InstancedMesh(
        new THREE.BoxGeometry(2.4, 0.18, 0.22),
        this._mat(0x33383f, 0.7, 0.7), lamps.length);
      this.lampMat = new THREE.MeshStandardMaterial({
        color: 0xfff0cc, emissive: 0xffcf8a, emissiveIntensity: 0.4, roughness: 0.4
      });
      const head = new THREE.InstancedMesh(new THREE.BoxGeometry(1.0, 0.22, 0.45), this.lampMat, lamps.length);
      pole.castShadow = arm.castShadow = true;
      lamps.forEach((l, i) => {
        q.setFromAxisAngle(up, l.rot);
        pos.set(l.x, 4 + LOT_H, l.z); m4.compose(pos, q, sc); pole.setMatrixAt(i, m4);
        const dx = Math.sin(l.rot + Math.PI / 2) * 1.2, dz = Math.cos(l.rot + Math.PI / 2) * 1.2;
        pos.set(l.x - dx, 7.9 + LOT_H, l.z - dz); m4.compose(pos, q, sc); arm.setMatrixAt(i, m4);
        pos.set(l.x - dx * 1.75, 7.75 + LOT_H, l.z - dz * 1.75); m4.compose(pos, q, sc); head.setMatrixAt(i, m4);
        this.addSolid(l.x - 0.25, l.z - 0.25, l.x + 0.25, l.z + 0.25, 0, 8, 'pole');
      });
      [pole, arm, head].forEach(m => { m.instanceMatrix.needsUpdate = true; this.scene.add(m); });

      // светофоры на перекрёстках
      for (let i = 1; i < roadCoords.length - 1; i += 2) {
        for (let j = 1; j < roadCoords.length - 1; j += 2) {
          signals.push({ x: roadCoords[i] + ROAD_W / 2 + 1.5, z: roadCoords[j] + ROAD_W / 2 + 1.5 });
        }
      }
      const sPole = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.12, 0.14, 5.4, 6), this._mat(0x2c3036, 0.6, 0.7), signals.length);
      const sBox = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.5, 1.35, 0.4),
        new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.6 }), signals.length);
      const sLamp = new THREE.InstancedMesh(
        new THREE.SphereGeometry(0.13, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x8fff8f, emissive: 0x25ff58, emissiveIntensity: 1.6 }), signals.length);
      signals.forEach((s, i) => {
        q.identity();
        pos.set(s.x, 2.7 + LOT_H, s.z); m4.compose(pos, q, sc); sPole.setMatrixAt(i, m4);
        pos.set(s.x, 5.4 + LOT_H, s.z); m4.compose(pos, q, sc); sBox.setMatrixAt(i, m4);
        pos.set(s.x, 5.0 + LOT_H, s.z + 0.24); m4.compose(pos, q, sc); sLamp.setMatrixAt(i, m4);
      });
      [sPole, sBox, sLamp].forEach(m => { m.instanceMatrix.needsUpdate = true; this.scene.add(m); });
    }

    /* ------------------------- промзона и склад ------------------------- */
    _buildWarehouse() {
      const cx = 250, cz = 250;             // центр промзоны
      const concrete = this._mat(0x6b6965, 0.95, 0.03);
      concrete.bumpMap = T.noise(128, 0.45);
      concrete.bumpScale = 0.2;

      // бетонная площадка
      const yard = new THREE.Mesh(new THREE.BoxGeometry(96, 0.3, 96), concrete);
      yard.position.set(cx, 0.15, cz);
      yard.receiveShadow = true;
      this.scene.add(yard);
      this.addSolid(cx - 48, cz - 48, cx + 48, cz + 48, 0, 0.3, 'floor');
      this.map.lots.push({ x: cx, z: cz, s: 96, industrial: true });

      // ---- забор (сетка-рабица) с воротами на западной стороне ----
      const fenceTex = (() => {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const g = c.getContext('2d');
        g.clearRect(0, 0, 64, 64);
        g.strokeStyle = 'rgba(190,196,205,0.85)'; g.lineWidth = 2;
        for (let i = -64; i < 64; i += 10) {
          g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke();
          g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke();
        }
        const t = new THREE.CanvasTexture(c);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        return t;
      })();
      const fenceMat = new THREE.MeshStandardMaterial({
        map: fenceTex, alphaMap: fenceTex, transparent: true, alphaTest: 0.35,
        side: THREE.DoubleSide, roughness: 0.7, metalness: 0.6, color: 0xd8dde5
      });
      const H = 3.4;
      const mkFence = (x0, z0, x1, z1) => {
        const len = Math.hypot(x1 - x0, z1 - z0);
        const m = fenceMat.clone();
        m.map = fenceTex.clone(); m.map.needsUpdate = true;
        m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping;
        m.map.repeat.set(len / 3, H / 3);
        m.alphaMap = m.map;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, H), m);
        mesh.position.set((x0 + x1) / 2, H / 2 + 0.3, (z0 + z1) / 2);
        mesh.rotation.y = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
        this.scene.add(mesh);
        const t = 0.35;
        this.addSolid(Math.min(x0, x1) - t, Math.min(z0, z1) - t,
          Math.max(x0, x1) + t, Math.max(z0, z1) + t, 0, H + 0.3, 'fence');
      };
      const F = 46;
      mkFence(cx - F, cz - F, cx + F, cz - F);
      mkFence(cx - F, cz + F, cx + F, cz + F);
      mkFence(cx + F, cz - F, cx + F, cz + F);
      mkFence(cx - F, cz - F, cx - F, cz - 6);      // ворота: проём z = -6..6
      mkFence(cx - F, cz + 6, cx - F, cz + F);

      // столбы ворот
      const gateMat = this._mat(0x6b6f76, 0.6, 0.8);
      [-6, 6].forEach((o) => {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 4.4, 8), gateMat);
        p.position.set(cx - F, 2.2, cz + o);
        p.castShadow = true;
        this.scene.add(p);
      });

      // ---- ангар ----
      const wx = cx + 8, wz = cz;                // центр ангара
      const WW = 42, WD = 30, WH = 11, TH = 0.8; // размеры и толщина стен
      const wallMat = this._mat(0x7e878f, 0.85, 0.15);
      wallMat.bumpMap = T.noise(128, 0.5).clone();
      wallMat.bumpMap.needsUpdate = true;
      wallMat.bumpMap.wrapS = wallMat.bumpMap.wrapT = THREE.RepeatWrapping;
      wallMat.bumpMap.repeat.set(10, 4);
      wallMat.bumpScale = 0.1;
      const trimMat = this._mat(0x2f3540, 0.8, 0.3);

      const addWall = (x, z, w, d, h, y) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
        m.position.set(x, (y || 0) + h / 2 + 0.3, z);
        m.castShadow = true; m.receiveShadow = true;
        this.scene.add(m);
        this.addSolid(x - w / 2, z - d / 2, x + w / 2, z + d / 2, (y || 0), (y || 0) + h + 0.3, 'building');
      };
      // задняя (восток) и боковые
      addWall(wx + WW / 2, wz, TH, WD, WH);
      addWall(wx, wz - WD / 2, WW, TH, WH);
      addWall(wx, wz + WD / 2, WW, TH, WH);
      // передняя (запад) с воротами 10 м
      const doorW = 10;
      const sideW = (WD - doorW) / 2;
      addWall(wx - WW / 2, wz - (doorW / 2 + sideW / 2), TH, sideW, WH);
      addWall(wx - WW / 2, wz + (doorW / 2 + sideW / 2), TH, sideW, WH);
      addWall(wx - WW / 2, wz, TH, doorW, WH - 6, 6);      // перемычка над воротами

      // пол ангара
      const floor = new THREE.Mesh(new THREE.BoxGeometry(WW, 0.25, WD), this._mat(0x52555a, 0.9, 0.05));
      floor.position.set(wx, 0.42, wz);
      floor.receiveShadow = true;
      this.scene.add(floor);
      this.addSolid(wx - WW / 2, wz - WD / 2, wx + WW / 2, wz + WD / 2, 0, 0.55, 'floor');

      // крыша (скрывается, когда игрок внутри)
      const roofMat = trimMat.clone();
      roofMat.transparent = true;
      roofMat.opacity = 1;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(WW + 1.4, 0.6, WD + 1.4), roofMat);
      roof.position.set(wx, WH + 0.6, wz);
      roof.castShadow = true;
      this.scene.add(roof);
      this.hangarRoof = roof;
      this.hangarBounds = { x0: wx - WW / 2, x1: wx + WW / 2, z0: wz - WD / 2, z1: wz + WD / 2 };

      // свет внутри
      for (let i = -1; i <= 1; i++) {
        const pl = new THREE.PointLight(0xffe4b5, 0.55, 30, 2);
        pl.position.set(wx + i * 13, WH - 2, wz);
        this.scene.add(pl);
        const panel = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 0.7),
          new THREE.MeshStandardMaterial({ color: 0xfff3d8, emissive: 0xffd9a0, emissiveIntensity: 2.2 }));
        panel.position.set(wx + i * 13, WH - 1.6, wz);
        this.scene.add(panel);
      }

      // ящики и стеллажи (укрытия)
      const crateMat = [
        this._mat(0x8a6a3f, 0.95, 0),
        this._mat(0x7d8a4a, 0.95, 0),
        this._mat(0x8a4a3f, 0.95, 0)
      ];
      const crates = [
        // двор
        [cx - 28, cz - 20, 3.4], [cx - 26, cz - 16, 2.6], [cx - 30, cz + 14, 3.0],
        [cx - 14, cz + 26, 3.4], [cx + 6, cz - 34, 3.2], [cx + 24, cz + 33, 3.6],
        [cx - 34, cz + 32, 2.8], [cx + 30, cz - 30, 3.0],
        // ангар
        [wx - 12, wz - 9, 2.6], [wx - 12, wz + 9, 2.6], [wx + 2, wz - 11, 3.0],
        [wx + 6, wz + 10, 2.4], [wx + 14, wz - 6, 2.8], [wx + 12, wz + 7, 2.2]
      ];
      crates.forEach((c, i) => {
        const s = c[2];
        const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat[i % 3]);
        const isIn = c[0] > this.hangarBounds.x0 && c[0] < this.hangarBounds.x1 &&
          c[1] > this.hangarBounds.z0 && c[1] < this.hangarBounds.z1;
        const base = isIn ? 0.55 : 0.3;
        m.position.set(c[0], base + s / 2, c[1]);
        m.rotation.y = U.rand(-0.3, 0.3);
        m.castShadow = m.receiveShadow = true;
        this.scene.add(m);
        this.addSolid(c[0] - s / 2, c[1] - s / 2, c[0] + s / 2, c[1] + s / 2, 0, base + s, 'crate');
      });

      // морские контейнеры во дворе
      const contColors = [0xb5482f, 0x2f6eb5, 0x2f8f5a, 0xb59a2f];
      const conts = [[cx - 20, cz - 36, 0], [cx - 20, cz - 30, 0], [cx + 34, cz + 10, Math.PI / 2],
      [cx + 34, cz + 18, Math.PI / 2], [cx - 38, cz - 2, Math.PI / 2]];
      conts.forEach((c, i) => {
        const g = new THREE.BoxGeometry(12, 2.9, 2.9);
        const m = new THREE.Mesh(g, this._mat(contColors[i % 4], 0.8, 0.35));
        m.position.set(c[0], 0.3 + 1.45, c[1]);
        m.rotation.y = c[2];
        m.castShadow = m.receiveShadow = true;
        this.scene.add(m);
        const w = c[2] === 0 ? 12 : 2.9, d = c[2] === 0 ? 2.9 : 12;
        this.addSolid(c[0] - w / 2, c[1] - d / 2, c[0] + w / 2, c[1] + d / 2, 0, 3.2, 'crate');
      });

      // точки патрулирования охраны
      L.guardPosts = [
        { pos: new THREE.Vector3(cx - 30, 0, cz - 10), route: [[cx - 30, cz - 10], [cx - 30, cz + 20], [cx - 10, cz + 24], [cx - 12, cz - 14]] },
        { pos: new THREE.Vector3(cx + 20, 0, cz - 34), route: [[cx + 20, cz - 34], [cx + 34, cz - 20], [cx + 30, cz + 6], [cx + 10, cz - 30]] },
        { pos: new THREE.Vector3(cx - 6, 0, cz + 34), route: [[cx - 6, cz + 34], [cx + 26, cz + 34], [cx + 30, cz + 20], [cx - 20, cz + 30]] },
        { pos: new THREE.Vector3(wx - 8, 0.55, wz - 6), route: [[wx - 8, wz - 6], [wx + 12, wz - 8], [wx + 12, wz + 8], [wx - 8, wz + 8]], inside: true },
        { pos: new THREE.Vector3(wx + 14, 0.55, wz + 4), route: [[wx + 14, wz + 4], [wx + 4, wz + 10], [wx - 6, wz + 2], [wx + 10, wz - 10]], inside: true }
      ];
      L.cargo.set(wx + 17, 0.55, wz);
      L.warehouseCenter.set(wx, 0, wz);
      L.warehouseGate.set(cx - F - 6, 0, cz);
      this.map.marks.push({ x: cx, z: cz, kind: 'target' });
    }

    /* ------------------------------- порт ------------------------------- */
    _buildDocks() {
      const px = -350, pz = -350;
      const pad = new THREE.Mesh(new THREE.BoxGeometry(96, 0.3, 96), this._mat(0x63656a, 0.95, 0.05));
      pad.position.set(px, 0.15, pz);
      pad.receiveShadow = true;
      this.scene.add(pad);
      this.addSolid(px - 48, pz - 48, px + 48, pz + 48, 0, 0.3, 'floor');
      this.map.lots.push({ x: px, z: pz, s: 96, industrial: true });

      // вода за портом
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(600, 600),
        new THREE.MeshStandardMaterial({ color: 0x2b4a63, roughness: 0.18, metalness: 0.65 })
      );
      water.rotation.x = -Math.PI / 2;
      water.position.set(px - 260, -0.35, pz - 260);
      this.scene.add(water);

      // контейнеры и кран
      const cols = [0x9c3b2b, 0x2b5c9c, 0x2b8f5f, 0xb99a2b];
      for (let i = 0; i < 10; i++) {
        const x = px + U.rand(-40, 40), z = pz + U.rand(-40, 40);
        const rot = Math.random() < 0.5 ? 0 : Math.PI / 2;
        const stack = U.randInt(1, 2);
        for (let s = 0; s < stack; s++) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(12, 2.9, 2.9), this._mat(U.pick(cols), 0.8, 0.35));
          m.position.set(x, 0.3 + 1.45 + s * 3, z);
          m.rotation.y = rot;
          m.castShadow = m.receiveShadow = true;
          this.scene.add(m);
        }
        const w = rot === 0 ? 12 : 2.9, d = rot === 0 ? 2.9 : 12;
        this.addSolid(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 0, 0.3 + stack * 3, 'crate');
      }
      const craneMat = this._mat(0xc9a227, 0.7, 0.5);
      [[px - 30, pz - 34], [px + 18, pz - 34]].forEach((c) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 22, 1.2), craneMat);
        leg.position.set(c[0], 11, c[1]); leg.castShadow = true;
        this.scene.add(leg);
        this.addSolid(c[0] - 0.7, c[1] - 0.7, c[0] + 0.7, c[1] + 0.7, 0, 22, 'pole');
      });
      const beam = new THREE.Mesh(new THREE.BoxGeometry(58, 1.4, 1.6), craneMat);
      beam.position.set(px - 6, 22, pz - 34);
      beam.castShadow = true;
      this.scene.add(beam);

      this.map.marks.push({ x: px, z: pz, kind: 'extract' });
    }

    /* --------------------- припаркованный транспорт --------------------- */
    /**
     * Припаркованные машины рисуются инстансингом: четыре InstancedMesh
     * (кузов, кабина, стёкла, колёса) на весь город вместо ~20 мешей на машину.
     * Цвет кузова задаётся per-instance через setColorAt.
     */
    _buildParkedCars() {
      const colors = [0x8e2f2f, 0x2f4f8e, 0x2f8e63, 0xb8b8be, 0x2a2d33, 0xc8a02a, 0x6b3f8e];
      const spots = [];
      let guard = 0;
      while (spots.length < 30 && guard++ < 400) {
        const c = U.pick(roadCoords);
        const along = U.rand(-HALF + 40, HALF - 40);
        const horiz = Math.random() < 0.5;
        const side = Math.random() < 0.5 ? -1 : 1;
        const x = horiz ? along : c + side * 6.6;
        const z = horiz ? c + side * 6.6 : along;
        if (Math.abs(x - L.carStart.x) < 22 && Math.abs(z - L.carStart.z) < 22) continue;
        if (x > 195 && z > 195) continue;                 // промзона
        if (x < -300 && z < -300) continue;               // порт
        // машина смотрит вдоль дороги (yaw = 0 → нос в +Z)
        const yaw = horiz ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI);
        spots.push({ x, z, yaw, color: U.pick(colors) });
        const w = horiz ? 4.8 : 2.4, d = horiz ? 2.4 : 4.8;
        this.addSolid(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 0, 1.6, 'car');
      }
      this.parked = spots;

      const n = spots.length;
      const paintMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.6 });
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x1b2733, roughness: 0.1, metalness: 0.3 });
      const tireMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.95, metalness: 0.05 });

      const chassis = new THREE.InstancedMesh(new THREE.BoxGeometry(2.0, 0.8, 4.5), paintMat, n);
      const cabin = new THREE.InstancedMesh(new THREE.BoxGeometry(1.78, 0.6, 2.1), paintMat.clone(), n);
      const glass = new THREE.InstancedMesh(new THREE.BoxGeometry(1.84, 0.42, 2.16), glassMat, n);
      const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12);
      wheelGeo.rotateZ(Math.PI / 2);
      const wheels = new THREE.InstancedMesh(wheelGeo, tireMat, n * 4);
      [chassis, cabin, glass, wheels].forEach(m => { m.castShadow = true; m.receiveShadow = true; });

      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(),
        sc = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
      const wheelOff = [[-0.98, 1.35], [0.98, 1.35], [-0.98, -1.35], [0.98, -1.35]];

      spots.forEach((s, i) => {
        q.setFromAxisAngle(up, s.yaw);
        const sinY = Math.sin(s.yaw), cosY = Math.cos(s.yaw);
        pos.set(s.x, 0.66, s.z); m4.compose(pos, q, sc); chassis.setMatrixAt(i, m4);
        pos.set(s.x - sinY * 0.2, 1.32, s.z - cosY * 0.2); m4.compose(pos, q, sc); cabin.setMatrixAt(i, m4);
        m4.compose(pos, q, sc); glass.setMatrixAt(i, m4);
        col.setHex(s.color);
        chassis.setColorAt(i, col);
        cabin.setColorAt(i, col.multiplyScalar(0.85));
        for (let w = 0; w < 4; w++) {
          const ox = wheelOff[w][0], oz = wheelOff[w][1];
          pos.set(s.x + ox * cosY + oz * sinY, 0.42, s.z - ox * sinY + oz * cosY);
          m4.compose(pos, q, sc);
          wheels.setMatrixAt(i * 4 + w, m4);
        }
      });
      [chassis, cabin, glass, wheels].forEach(m => {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
        this.scene.add(m);
      });
    }

    /** Вечером зажигаются фонари и окна; крыша ангара «стеклянеет» внутри. */
    update(playerPos) {
      const k = GTA.Graphics._tod || 0;
      if (this.lampMat) this.lampMat.emissiveIntensity = 0.4 + k * 2.6;
      if (this.facadeMats) {
        const e = 0.25 + k * 0.75;
        for (let i = 0; i < this.facadeMats.length; i++) this.facadeMats[i].emissiveIntensity = e;
      }
      if (!this.hangarRoof) return;
      const b = this.hangarBounds;
      const inside = playerPos.x > b.x0 - 2 && playerPos.x < b.x1 + 2 &&
        playerPos.z > b.z0 - 2 && playerPos.z < b.z1 + 2;
      // крыша не исчезает, а становится «стеклянной»: внутри по-прежнему тень
      const want = inside ? 0.13 : 1;
      const m = this.hangarRoof.material;
      m.opacity += (want - m.opacity) * 0.18;
      m.depthWrite = m.opacity > 0.9;
    }
  }

  /** Пересечение луча и AABB (метод слэбов). */
  function rayAABB(o, d, s, maxT) {
    let tmin = 0, tmax = maxT, axis = 0, sign = 0;
    const lo = [s.x0, s.y0, s.z0], hi = [s.x1, s.y1, s.z1];
    const od = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(dd[i]) < 1e-8) {
        if (od[i] < lo[i] || od[i] > hi[i]) return null;
        continue;
      }
      const inv = 1 / dd[i];
      let t1 = (lo[i] - od[i]) * inv, t2 = (hi[i] - od[i]) * inv, sg = -1;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; sg = 1; }
      if (t1 > tmin) { tmin = t1; axis = i; sign = sg; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
    if (tmin <= 0) return null;
    return { t: tmin, axis, sign };
  }

  GTA.World = World;
  GTA.WORLD_HALF = HALF;
  GTA.ROAD_STEP = STEP;
  GTA.roadCoords = roadCoords;
})();

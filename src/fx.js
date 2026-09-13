/* =============================================================================
 *  fx.js — частицы и визуальные эффекты (искры, дым, пыль, трассеры, вспышки).
 *  Всё на пулах фиксированного размера: ноль аллокаций в игровом цикле.
 * ========================================================================== */
(function () {
  'use strict';
  const GTA = window.GTA, U = GTA.Utils;

  const MAX_SPARKS = 900;
  const MAX_PUFFS = 90;
  const MAX_TRACERS = 48;

  function puffTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    return t;
  }

  const FX = GTA.FX = {
    shakeAmount: 0,

    init(scene) {
      this.scene = scene;

      /* ---- искры / кровь / щепки: один Points с пер-частичным цветом ---- */
      const sg = new THREE.BufferGeometry();
      const pos = new Float32Array(MAX_SPARKS * 3);
      const col = new Float32Array(MAX_SPARKS * 3);
      const sz = new Float32Array(MAX_SPARKS);
      for (let i = 0; i < MAX_SPARKS; i++) pos[i * 3 + 1] = -9999;
      sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      sg.setAttribute('psize', new THREE.BufferAttribute(sz, 1));
      const sm = new THREE.ShaderMaterial({
        uniforms: { scale: { value: window.innerHeight * 0.5 } },
        vertexShader: `
          attribute float psize; varying vec3 vCol; uniform float scale;
          void main(){
            vCol = color;
            vec4 mv = modelViewMatrix * vec4(position,1.0);
            gl_PointSize = max(1.0, psize * scale / max(-mv.z, 0.001));
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          varying vec3 vCol;
          void main(){
            vec2 d = gl_PointCoord - 0.5;
            float a = smoothstep(0.5, 0.06, length(d));
            if (a < 0.02) discard;
            gl_FragColor = vec4(vCol, a);
          }`,
        vertexColors: true, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      this.sparks = new THREE.Points(sg, sm);
      this.sparks.frustumCulled = false;
      scene.add(this.sparks);
      this._sparkData = [];
      for (let i = 0; i < MAX_SPARKS; i++) {
        this._sparkData.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, grav: -22, drag: 2.4 });
      }
      this._sparkCursor = 0;

      /* ---- дым/пыль: спрайты ---- */
      this._puffTex = puffTexture();
      this.puffs = [];
      for (let i = 0; i < MAX_PUFFS; i++) {
        const m = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this._puffTex, transparent: true, depthWrite: false,
          opacity: 0, color: 0xffffff, fog: true
        }));
        m.visible = false;
        m.userData = { life: 0, max: 1, vx: 0, vy: 0, vz: 0, grow: 1, fade: 1 };
        scene.add(m);
        this.puffs.push(m);
      }
      this._puffCursor = 0;

      /* ---- трассеры: единый LineSegments ---- */
      const tg = new THREE.BufferGeometry();
      const tpos = new Float32Array(MAX_TRACERS * 6);
      const tcol = new Float32Array(MAX_TRACERS * 6);
      tg.setAttribute('position', new THREE.BufferAttribute(tpos, 3));
      tg.setAttribute('color', new THREE.BufferAttribute(tcol, 3));
      this.tracers = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      this.tracers.frustumCulled = false;
      scene.add(this.tracers);
      this._tracerData = [];
      for (let i = 0; i < MAX_TRACERS; i++) this._tracerData.push({ life: 0 });
      this._tracerCursor = 0;

      /* ---- вспышка выстрела: одна точка света на всех ---- */
      this.muzzleLight = new THREE.PointLight(0xffc46a, 0, 18, 2);
      scene.add(this.muzzleLight);
      this._muzzleLife = 0;

      return this;
    },

    /* ------------------------------ искры ------------------------------ */
    spark(x, y, z, vx, vy, vz, color, size, life, grav) {
      const i = this._sparkCursor = (this._sparkCursor + 1) % MAX_SPARKS;
      const p = this.sparks.geometry.attributes.position.array;
      const c = this.sparks.geometry.attributes.color.array;
      const s = this.sparks.geometry.attributes.psize.array;
      p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
      c[i * 3] = color.r; c[i * 3 + 1] = color.g; c[i * 3 + 2] = color.b;
      s[i] = size;
      const d = this._sparkData[i];
      d.vx = vx; d.vy = vy; d.vz = vz;
      d.life = d.max = life;
      d.grav = grav === undefined ? -22 : grav;
      this._dirtySparks = true;
    },

    _tmpCol: new THREE.Color(),
    /** Попадание пули в твёрдую поверхность: искры + пыль. */
    bulletImpact(point, normal, kind) {
      const col = this._tmpCol;
      if (kind === 'flesh') col.setHex(0xff3b30); else col.setHex(0xffcf70);
      for (let i = 0; i < (kind === 'flesh' ? 9 : 12); i++) {
        const sp = kind === 'flesh' ? 3 : 8;
        this.spark(point.x, point.y, point.z,
          normal.x * U.rand(1, sp) + U.rand(-sp, sp) * 0.5,
          normal.y * U.rand(1, sp) + U.rand(1, sp),
          normal.z * U.rand(1, sp) + U.rand(-sp, sp) * 0.5,
          col, U.rand(0.03, 0.09), U.rand(0.18, 0.5));
      }
      if (kind !== 'flesh') this.puff(point.x, point.y, point.z, 0.5, 0.45, 0xb8b0a4, 0.5);
    },

    /* --------------------------- дым и пыль --------------------------- */
    puff(x, y, z, scale, opacity, color, life, vy) {
      const i = this._puffCursor = (this._puffCursor + 1) % MAX_PUFFS;
      const s = this.puffs[i];
      s.position.set(x, y, z);
      s.scale.setScalar(scale);
      s.material.opacity = opacity;
      s.material.color.setHex(color === undefined ? 0xcccccc : color);
      s.visible = true;
      const d = s.userData;
      d.life = d.max = life || 0.9;
      d.vx = U.rand(-0.4, 0.4); d.vz = U.rand(-0.4, 0.4);
      d.vy = vy === undefined ? U.rand(0.4, 1.1) : vy;
      d.grow = scale * 2.4;
      d.base = scale;
      d.op = opacity;
    },
    wheelDust(x, z, amount) {
      if (Math.random() > amount) return;
      this.puff(x + U.rand(-0.4, 0.4), 0.12, z + U.rand(-0.4, 0.4),
        U.rand(0.5, 1.1), 0.32, 0xc6b79c, U.rand(0.5, 1.0), 0.5);
    },
    smokeColumn(x, y, z) {
      this.puff(x + U.rand(-0.5, 0.5), y, z + U.rand(-0.5, 0.5),
        U.rand(0.8, 1.6), 0.5, 0x3a3a3a, U.rand(1.2, 2.2), U.rand(1.2, 2.4));
    },
    explosion(x, y, z) {
      const hot = new THREE.Color(0xffa23a);
      for (let i = 0; i < 60; i++) {
        this.spark(x, y, z, U.rand(-14, 14), U.rand(2, 16), U.rand(-14, 14),
          hot, U.rand(0.05, 0.18), U.rand(0.4, 1.1));
      }
      for (let i = 0; i < 8; i++) this.smokeColumn(x, y + i * 0.3, z);
      this.shake(1.0);
    },

    /* ---------------------------- трассеры ---------------------------- */
    tracer(from, to, color) {
      const i = this._tracerCursor = (this._tracerCursor + 1) % MAX_TRACERS;
      const p = this.tracers.geometry.attributes.position.array;
      const c = this.tracers.geometry.attributes.color.array;
      p[i * 6] = from.x; p[i * 6 + 1] = from.y; p[i * 6 + 2] = from.z;
      p[i * 6 + 3] = to.x; p[i * 6 + 4] = to.y; p[i * 6 + 5] = to.z;
      const col = color || 0xffd27f;
      const cc = this._tmpCol.setHex(col);
      for (let k = 0; k < 2; k++) {
        c[i * 6 + k * 3] = cc.r; c[i * 6 + k * 3 + 1] = cc.g; c[i * 6 + k * 3 + 2] = cc.b;
      }
      this._tracerData[i].life = 0.06;
      this.tracers.geometry.attributes.position.needsUpdate = true;
      this.tracers.geometry.attributes.color.needsUpdate = true;
    },

    muzzleFlash(pos, dirX, dirZ) {
      this.muzzleLight.position.copy(pos);
      this.muzzleLight.intensity = 9;
      this._muzzleLife = 0.05;
      const col = this._tmpCol.setHex(0xffe0a0);
      for (let i = 0; i < 5; i++) {
        this.spark(pos.x, pos.y, pos.z,
          dirX * U.rand(4, 11) + U.rand(-2, 2), U.rand(-1, 2),
          dirZ * U.rand(4, 11) + U.rand(-2, 2),
          col, U.rand(0.05, 0.12), U.rand(0.04, 0.1), -4);
      }
    },

    shake(v) { this.shakeAmount = Math.min(1.6, this.shakeAmount + v); },

    /* ----------------------------- update ----------------------------- */
    update(dt) {
      // искры
      const p = this.sparks.geometry.attributes.position.array;
      const s = this.sparks.geometry.attributes.psize.array;
      let live = false;
      for (let i = 0; i < MAX_SPARKS; i++) {
        const d = this._sparkData[i];
        if (d.life <= 0) continue;
        d.life -= dt;
        live = true;
        if (d.life <= 0) { p[i * 3 + 1] = -9999; s[i] = 0; continue; }
        const k = Math.exp(-d.drag * dt);
        d.vx *= k; d.vz *= k;
        d.vy = d.vy * k + d.grav * dt;
        p[i * 3] += d.vx * dt;
        p[i * 3 + 1] += d.vy * dt;
        p[i * 3 + 2] += d.vz * dt;
        if (p[i * 3 + 1] < 0.03) { p[i * 3 + 1] = 0.03; d.vy = Math.abs(d.vy) * 0.3; d.vx *= 0.6; d.vz *= 0.6; }
      }
      if (live || this._dirtySparks) {
        this.sparks.geometry.attributes.position.needsUpdate = true;
        this.sparks.geometry.attributes.color.needsUpdate = true;
        this.sparks.geometry.attributes.psize.needsUpdate = true;
        this._dirtySparks = false;
      }

      // дым
      for (let i = 0; i < MAX_PUFFS; i++) {
        const sp = this.puffs[i];
        if (!sp.visible) continue;
        const d = sp.userData;
        d.life -= dt;
        if (d.life <= 0) { sp.visible = false; continue; }
        const t = 1 - d.life / d.max;
        sp.position.x += d.vx * dt;
        sp.position.y += d.vy * dt;
        sp.position.z += d.vz * dt;
        sp.scale.setScalar(d.base + (d.grow - d.base) * t);
        sp.material.opacity = d.op * (1 - t);
      }

      // трассеры
      let tDirty = false;
      const tp = this.tracers.geometry.attributes.position.array;
      for (let i = 0; i < MAX_TRACERS; i++) {
        const d = this._tracerData[i];
        if (d.life <= 0) continue;
        d.life -= dt;
        if (d.life <= 0) {
          for (let k = 0; k < 6; k++) tp[i * 6 + k] = 0;
          tDirty = true;
        }
      }
      if (tDirty) this.tracers.geometry.attributes.position.needsUpdate = true;

      // вспышка
      if (this._muzzleLife > 0) {
        this._muzzleLife -= dt;
        this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 180);
        if (this._muzzleLife <= 0) this.muzzleLight.intensity = 0;
      }

      // тряска камеры затухает
      this.shakeAmount = Math.max(0, this.shakeAmount - dt * 2.2);
    },

    reset() {
      for (let i = 0; i < MAX_SPARKS; i++) {
        this._sparkData[i].life = 0;
        this.sparks.geometry.attributes.position.array[i * 3 + 1] = -9999;
      }
      this.sparks.geometry.attributes.position.needsUpdate = true;
      for (let i = 0; i < MAX_PUFFS; i++) this.puffs[i].visible = false;
      for (let i = 0; i < MAX_TRACERS; i++) {
        this._tracerData[i].life = 0;
        for (let k = 0; k < 6; k++) this.tracers.geometry.attributes.position.array[i * 6 + k] = 0;
      }
      this.tracers.geometry.attributes.position.needsUpdate = true;
      this.shakeAmount = 0;
      this.muzzleLight.intensity = 0;
    }
  };
})();

/* =============================================================================
 *  LOS SANTOS HEIST — core.js
 *  Общий неймспейс, математика, ввод, звук, графический стек (рендер + пост).
 * ========================================================================== */
(function () {
  'use strict';
  const GTA = window.GTA || (window.GTA = {});

  /* -------------------------------------------------------------------------
   *  1. Утилиты
   * ---------------------------------------------------------------------- */
  const U = GTA.Utils = {
    clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
    lerp(a, b, t) { return a + (b - a) * t; },
    /** Кадронезависимое сглаживание (замена lerp по dt). */
    damp(a, b, lambda, dt) { return U.lerp(a, b, 1 - Math.exp(-lambda * dt)); },
    rand(a, b) { return a + Math.random() * (b - a); },
    randInt(a, b) { return Math.floor(U.rand(a, b + 1)); },
    pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    /** Кратчайшая разница углов в диапазоне [-PI, PI]. */
    angleDelta(a, b) {
      let d = (b - a) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      return d;
    },
    dist2D(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); },
    /** Гауссово распределение — для разброса пуль. */
    gauss(sigma) {
      let u = 0, v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sigma;
    },
    formatTime(sec) {
      const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
      return m + ':' + String(s).padStart(2, '0');
    }
  };

  /* -------------------------------------------------------------------------
   *  2. Ввод (клавиатура + мышь + pointer lock)
   * ---------------------------------------------------------------------- */
  const Input = GTA.Input = {
    keys: Object.create(null),
    pressed: Object.create(null),   // «нажато в этом кадре»
    mouse: { dx: 0, dy: 0, left: false, right: false, leftEdge: false },
    locked: false,
    enabled: true,
    _dom: null,

    init(dom) {
      this._dom = dom;
      window.addEventListener('keydown', (e) => {
        const c = e.code;
        if (!this.keys[c]) this.pressed[c] = true;
        this.keys[c] = true;
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(c)) e.preventDefault();
      });
      window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
      window.addEventListener('blur', () => { this.keys = Object.create(null); this.mouse.left = this.mouse.right = false; });

      dom.addEventListener('mousedown', (e) => {
        if (!this.locked) return;
        if (e.button === 0) { this.mouse.left = true; this.mouse.leftEdge = true; }
        if (e.button === 2) this.mouse.right = true;
      });
      window.addEventListener('mouseup', (e) => {
        if (e.button === 0) this.mouse.left = false;
        if (e.button === 2) this.mouse.right = false;
      });
      window.addEventListener('contextmenu', (e) => e.preventDefault());
      document.addEventListener('mousemove', (e) => {
        if (!this.locked) return;
        this.mouse.dx += e.movementX || 0;
        this.mouse.dy += e.movementY || 0;
      });
      document.addEventListener('pointerlockchange', () => {
        this.locked = document.pointerLockElement === dom;
        if (GTA.game) GTA.game.onPointerLock(this.locked);
      });
      dom.addEventListener('click', () => { if (this.enabled) this.requestLock(); });
    },

    requestLock() {
      if (this._dom && !this.locked && this._dom.requestPointerLock) this._dom.requestPointerLock();
    },
    releaseLock() {
      if (document.exitPointerLock && this.locked) document.exitPointerLock();
    },
    /** Один раз за кадр: сбрасывает «edge»-состояния. */
    endFrame() {
      this.pressed = Object.create(null);
      this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.leftEdge = false;
    },
    down(code) { return !!this.keys[code]; },
    hit(code) { return !!this.pressed[code]; },
    /** Ось движения в локальных координатах камеры. */
    moveAxis() {
      let x = 0, z = 0;
      if (this.down('KeyW') || this.down('ArrowUp')) z -= 1;
      if (this.down('KeyS') || this.down('ArrowDown')) z += 1;
      if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
      if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
      const l = Math.hypot(x, z);
      return l > 1 ? { x: x / l, z: z / l } : { x, z };
    }
  };

  /* -------------------------------------------------------------------------
   *  3. Звук — всё синтезируется в Web Audio, никаких внешних файлов
   * ---------------------------------------------------------------------- */
  const Snd = GTA.Audio = {
    ctx: null, master: null, enabled: true, _noiseBuf: null,

    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // буфер белого шума для выстрелов/взрывов
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._noiseBuf = buf;
    },
    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
    toggle() {
      this.enabled = !this.enabled;
      if (this.master) this.master.gain.value = this.enabled ? 0.5 : 0;
      return this.enabled;
    },
    _noise(dur, gain, filterFreq, q) {
      if (!this.ctx || !this.enabled) return null;
      const src = this.ctx.createBufferSource();
      src.buffer = this._noiseBuf;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = filterFreq; f.Q.value = q || 1;
      const g = this.ctx.createGain();
      const t = this.ctx.currentTime;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + dur + 0.02);
      return { src, g, f };
    },
    /** Расстояние → громкость (примитивная «3D»-панорама по громкости). */
    _atten(dist) { return U.clamp(1 - dist / 90, 0, 1); },

    gunshot(dist) {
      const a = this._atten(dist || 0); if (a <= 0.01) return;
      this._noise(0.16, 0.5 * a, 2600, 1.2);
      if (!this.ctx || !this.enabled) return;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.ctx.currentTime;
      o.type = 'square'; o.frequency.setValueAtTime(180, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
      g.gain.setValueAtTime(0.22 * a, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.16);
    },
    enemyShot(dist) {
      const a = this._atten(dist || 0); if (a <= 0.01) return;
      this._noise(0.13, 0.32 * a, 1700, 1);
    },
    impact(dist) { this._noise(0.07, 0.22 * this._atten(dist || 0), 5200, 0.7); },
    hurt() {
      if (!this.ctx || !this.enabled) return;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.ctx.currentTime;
      o.type = 'sine'; o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(90, t + 0.25);
      g.gain.setValueAtTime(0.26, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.32);
    },
    crash(force) {
      const a = U.clamp(force, 0.1, 1);
      this._noise(0.4, 0.5 * a, 900, 0.6);
    },
    ui(freq, dur) {
      if (!this.ctx || !this.enabled) return;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.ctx.currentTime;
      o.type = 'triangle'; o.frequency.value = freq || 660;
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + (dur || 0.18));
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + (dur || 0.18) + 0.02);
    },

    /** Мотор: две пилы + шум, частота ведётся от оборотов. */
    createEngine() {
      if (!this.ctx) return { setState() {}, stop() {} };
      const ctx = this.ctx;
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
      const filt = ctx.createBiquadFilter(), g = ctx.createGain();
      o1.type = 'sawtooth'; o2.type = 'square';
      o1.frequency.value = 60; o2.frequency.value = 30;
      filt.type = 'lowpass'; filt.frequency.value = 700; filt.Q.value = 3;
      g.gain.value = 0;
      o1.connect(filt); o2.connect(filt); filt.connect(g); g.connect(this.master);
      o1.start(); o2.start();
      return {
        setState(rpm01, load) {
          const f = 45 + rpm01 * 210;
          const t = ctx.currentTime;
          o1.frequency.setTargetAtTime(f, t, 0.05);
          o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
          filt.frequency.setTargetAtTime(380 + rpm01 * 1700, t, 0.08);
          g.gain.setTargetAtTime(0.05 + load * 0.09, t, 0.1);
        },
        idleOff() { g.gain.setTargetAtTime(0, ctx.currentTime, 0.15); },
        stop() { try { o1.stop(); o2.stop(); } catch (e) {} }
      };
    },
    /** Сирена полиции — две чередующиеся ноты. */
    createSiren() {
      if (!this.ctx) return { set() {}, stop() {} };
      const ctx = this.ctx;
      const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 640;
      lfo.type = 'square'; lfo.frequency.value = 1.6; lg.gain.value = 190;
      lfo.connect(lg); lg.connect(o.frequency);
      g.gain.value = 0;
      o.connect(g); g.connect(this.master);
      o.start(); lfo.start();
      return {
        set(vol) { g.gain.setTargetAtTime(vol * 0.07, ctx.currentTime, 0.2); },
        stop() { try { o.stop(); lfo.stop(); } catch (e) {} }
      };
    }
  };

  /* -------------------------------------------------------------------------
   *  4. Графика: сцена, камера, рендерер, тени, небо, постобработка
   * ---------------------------------------------------------------------- */
  GTA.Graphics = {
    renderer: null, scene: null, camera: null, composer: null,
    sun: null, bloom: null, blurPass: null, fxaa: null, sky: null,

    init(container) {
      const renderer = this.renderer = new THREE.WebGLRenderer({
        antialias: true, powerPreference: 'high-performance', stencil: false
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);

      const scene = this.scene = new THREE.Scene();
      const FOG = new THREE.Color(0x9fb4cc);
      scene.fog = new THREE.Fog(FOG, 120, 560);
      scene.background = FOG;

      const camera = this.camera = new THREE.PerspectiveCamera(
        62, window.innerWidth / window.innerHeight, 0.15, 1400);
      camera.position.set(0, 6, 14);

      /* --- Освещение: тёплое предзакатное солнце + холодное небо --- */
      const hemi = new THREE.HemisphereLight(0xbcd6ff, 0x5a4e40, 0.6);
      scene.add(hemi);

      const sun = this.sun = new THREE.DirectionalLight(0xffd9a8, 1.2);
      sun.position.set(90, 140, 60);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const S = 120;
      sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
      sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
      sun.shadow.camera.near = 1; sun.shadow.camera.far = 420;
      sun.shadow.bias = -0.0009;
      sun.shadow.normalBias = 0.035;
      scene.add(sun);
      scene.add(sun.target);

      // мягкая заполняющая с противоположной стороны (фейковый bounce light)
      const fill = new THREE.DirectionalLight(0x88a9ff, 0.32);
      fill.position.set(-70, 40, -50);
      scene.add(fill);

      this.sky = this._makeSky();
      scene.add(this.sky);

      this._initComposer();
      this.setTimeOfDay(0);
      window.addEventListener('resize', () => this.resize());
      return this;
    },

    /** Градиентный купол неба с солнечным диском и лёгкой дымкой. */
    _makeSky() {
      const geo = new THREE.SphereGeometry(900, 32, 20);
      const mat = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: {
          topColor: { value: new THREE.Color(0x2a5fa8) },
          midColor: { value: new THREE.Color(0x9fc0e0) },
          botColor: { value: new THREE.Color(0xe8cba0) },
          sunDir: { value: new THREE.Vector3(0.5, 0.62, 0.33).normalize() }
        },
        vertexShader: `
          varying vec3 vDir;
          void main(){
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
          }`,
        fragmentShader: `
          uniform vec3 topColor, midColor, botColor, sunDir;
          varying vec3 vDir;
          void main(){
            float h = clamp(vDir.y*0.5+0.5, 0.0, 1.0);
            vec3 col = mix(botColor, midColor, smoothstep(0.42, 0.56, h));
            col = mix(col, topColor, smoothstep(0.55, 0.95, h));
            float d = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
            col += vec3(1.0,0.82,0.55) * pow(d, 220.0) * 6.0;      // диск
            col += vec3(1.0,0.72,0.42) * pow(d, 7.0) * 0.35;       // ореол
            gl_FragColor = vec4(col, 1.0);
          }`
      });
      const m = new THREE.Mesh(geo, mat);
      m.frustumCulled = false;
      m.renderOrder = -1;
      return m;
    },

    _initComposer() {
      const size = new THREE.Vector2(window.innerWidth, window.innerHeight);
      const composer = this.composer = new THREE.EffectComposer(this.renderer);
      composer.addPass(new THREE.RenderPass(this.scene, this.camera));

      const bloom = this.bloom = new THREE.UnrealBloomPass(size, 0.42, 0.75, 0.86);
      composer.addPass(bloom);

      // Радиальный «скоростной» блюр — включается на высокой скорости в машине
      const SpeedBlurShader = {
        uniforms: {
          tDiffuse: { value: null },
          amount: { value: 0.0 },
          vignette: { value: 0.55 }
        },
        vertexShader: `varying vec2 vUv;
          void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          uniform sampler2D tDiffuse; uniform float amount; uniform float vignette;
          varying vec2 vUv;
          void main(){
            vec2 c = vUv - 0.5;
            vec4 col = texture2D(tDiffuse, vUv);
            if (amount > 0.001){
              float w = 1.0;
              for (int i = 1; i <= 6; i++){
                float s = 1.0 - float(i) * 0.0075 * amount;
                col += texture2D(tDiffuse, c * s + 0.5);
                w += 1.0;
              }
              col /= w;
            }
            float v = smoothstep(0.95, 0.28, length(c));
            col.rgb *= mix(1.0, v, vignette);
            gl_FragColor = col;
          }`
      };
      this.blurPass = new THREE.ShaderPass(SpeedBlurShader);
      composer.addPass(this.blurPass);

      const fxaa = this.fxaa = new THREE.ShaderPass(THREE.FXAAShader);
      const pr = this.renderer.getPixelRatio();
      fxaa.material.uniforms.resolution.value.set(1 / (size.x * pr), 1 / (size.y * pr));
      fxaa.renderToScreen = true;
      composer.addPass(fxaa);
    },

    setSpeedBlur(v) { if (this.blurPass) this.blurPass.uniforms.amount.value = v; },

    /**
     * Простая «система дня»: за время миссии солнце медленно опускается,
     * свет и небо теплеют. k = 0 — полдень-вечер, k = 1 — глубокий закат.
     */
    setTimeOfDay(k) {
      k = Math.max(0, Math.min(1, k));
      if (this._tod !== undefined && Math.abs(this._tod - k) < 0.002) return;
      this._tod = k;
      const elev = U.lerp(0.72, 0.26, k);          // высота солнца
      const azim = U.lerp(0.62, 1.15, k);          // и его азимут
      const r = 170;
      this._sunDir = this._sunDir || new THREE.Vector3();
      this._sunDir.set(Math.sin(azim) * r, elev * r, Math.cos(azim) * r);
      this.sun.color.setHex(0xffd9a8).lerp(new THREE.Color(0xff9a4f), k);
      this.sun.intensity = U.lerp(1.2, 0.85, k);
      const sky = this.sky.material.uniforms;
      sky.sunDir.value.copy(this._sunDir).normalize();
      sky.topColor.value.setHex(0x2a5fa8).lerp(new THREE.Color(0x1d2f61), k);
      sky.midColor.value.setHex(0x9fc0e0).lerp(new THREE.Color(0xb08ea6), k);
      sky.botColor.value.setHex(0xe8cba0).lerp(new THREE.Color(0xff9d5c), k);
      const fog = new THREE.Color(0x9fb4cc).lerp(new THREE.Color(0xc09a86), k);
      this.scene.fog.color.copy(fog);
      this.scene.background = fog;
      this.bloom.strength = U.lerp(0.42, 0.6, k);
    },

    /** Тень «ездит» за игроком — держим карту теней плотной. */
    updateShadowFocus(target) {
      const s = this.sun;
      const d = this._sunDir || (this._sunDir = new THREE.Vector3(90, 150, 60));
      s.position.set(target.x + d.x, d.y, target.z + d.z);
      s.target.position.set(target.x, 0, target.z);
      s.target.updateMatrixWorld();
    },

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.composer.setSize(w, h);
      const pr = this.renderer.getPixelRatio();
      if (this.fxaa) this.fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
    },

    render() { this.composer.render(); }
  };

  /* -------------------------------------------------------------------------
   *  5. Процедурные текстуры (окна, асфальт, бетон) — чтобы не тянуть ассеты
   * ---------------------------------------------------------------------- */
  GTA.Tex = {
    _cache: {},
    /** Фасад с окнами: часть окон «горит». */
    facade(cols, rows, base, lit) {
      const key = 'f' + cols + '_' + rows + '_' + base + '_' + lit;
      if (this._cache[key]) return this._cache[key];
      const px = 16, c = document.createElement('canvas');
      c.width = cols * px; c.height = rows * px;
      const g = c.getContext('2d');
      g.fillStyle = '#' + base.toString(16).padStart(6, '0');
      g.fillRect(0, 0, c.width, c.height);
      // лёгкий бетонный шум
      for (let i = 0; i < cols * rows * 6; i++) {
        g.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.07) + ')';
        g.fillRect(Math.random() * c.width, Math.random() * c.height, 3, 3);
      }
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const on = Math.random() < lit;
          const w = px * 0.62, h = px * 0.5;
          const ox = x * px + (px - w) / 2, oy = y * px + (px - h) / 2;
          g.fillStyle = on ? 'rgba(255,214,150,0.92)' : 'rgba(26,34,46,0.9)';
          g.fillRect(ox, oy, w, h);
          g.fillStyle = 'rgba(255,255,255,0.10)';
          g.fillRect(ox, oy, w, 2);
        }
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.encoding = THREE.sRGBEncoding;
      t.anisotropy = 4;
      this._cache[key] = t;
      return t;
    },
    /** Шумовая карта — используется как roughness/bump для дорог и земли. */
    noise(size, contrast) {
      const key = 'n' + size + '_' + contrast;
      if (this._cache[key]) return this._cache[key];
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      const img = g.createImageData(size, size);
      for (let i = 0; i < size * size; i++) {
        const v = 128 + (Math.random() - 0.5) * 255 * contrast;
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      this._cache[key] = t;
      return t;
    },
    /** Асфальт с разметкой полос. */
    asphalt(withStripes) {
      const key = 'a' + (withStripes ? 1 : 0);
      if (this._cache[key]) return this._cache[key];
      const c = document.createElement('canvas');
      c.width = 128; c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = '#2a2d33'; g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.05) + ')';
        g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
      }
      if (withStripes) {
        g.fillStyle = 'rgba(226,214,170,0.85)';
        g.fillRect(62, 10, 4, 44);
        g.fillRect(62, 74, 4, 44);
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.encoding = THREE.sRGBEncoding;
      t.anisotropy = 8;
      this._cache[key] = t;
      return t;
    }
  };
})();

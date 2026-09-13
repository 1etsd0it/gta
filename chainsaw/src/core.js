/* =============================================================================
 *  core.js — каркас игры: утилиты, ввод с клавиатуры/мыши, камера с тряской.
 *  Логическое разрешение фиксировано (960x540), канвас растягивается по окну.
 * ========================================================================== */
(function () {
  'use strict';
  const CR = window.CR = window.CR || {};

  CR.W = 960;            // логическая ширина кадра
  CR.H = 540;            // логическая высота кадра
  CR.GROUND = 452;       // уровень земли (низ ног персонажей)

  /* ------------------------------- утилиты ------------------------------- */
  const U = CR.Utils = {
    clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
    lerp(a, b, t) { return a + (b - a) * t; },
    rand(a, b) { return a + Math.random() * (b - a); },
    randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
    chance(p) { return Math.random() < p; },
    pick(arr) { return arr[(Math.random() * arr.length) | 0]; },
    aabb(a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x &&
             a.y < b.y + b.h && a.y + a.h > b.y;
    },
    dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); },
    approach(v, target, step) {
      return v < target ? Math.min(v + step, target) : Math.max(v - step, target);
    },
    /* 12345 -> "12 345" */
    fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  };

  /* --------------------------------- ввод --------------------------------- */
  const In = CR.Input = {
    _down: Object.create(null),
    _edge: Object.create(null),
    mouse: [false, false, false],
    _mouseEdge: [false, false, false],
    pointer: { x: CR.W / 2, y: CR.H / 2 },

    init(canvas) {
      window.addEventListener('keydown', (e) => {
        if (In.BLOCK[e.code]) e.preventDefault();
        if (!e.repeat) In._edge[e.code] = true;
        In._down[e.code] = true;
      });
      window.addEventListener('keyup', (e) => { In._down[e.code] = false; });
      window.addEventListener('blur', () => {
        In._down = Object.create(null);
        In.mouse = [false, false, false];
      });
      if (canvas) {
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        canvas.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const b = Math.min(e.button, 2);
          if (!In.mouse[b]) In._mouseEdge[b] = true;
          In.mouse[b] = true;
        });
        window.addEventListener('mouseup', (e) => { In.mouse[Math.min(e.button, 2)] = false; });
        canvas.addEventListener('mousemove', (e) => {
          const r = canvas.getBoundingClientRect();
          if (!r.width || !r.height) return;
          In.pointer.x = (e.clientX - r.left) / r.width * CR.W;
          In.pointer.y = (e.clientY - r.top) / r.height * CR.H;
        });
      }
    },

    /* клавиши, которые не должны скроллить страницу */
    BLOCK: {
      Space: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1,
      KeyZ: 1, KeyX: 1, KeyE: 1, KeyP: 1, KeyM: 1
    },

    down(code) { return !!this._down[code]; },
    pressed(code) { return !!this._edge[code]; },
    anyDown(codes) { for (const c of codes) if (this._down[c]) return true; return false; },
    anyPressed(codes) { for (const c of codes) if (this._edge[c]) return true; return false; },
    mousePressed(b) { return !!this._mouseEdge[b]; },
    mouseHeld(b) { return !!this.mouse[b]; },

    /* вызывать в конце каждого кадра — гасит «нажатия этого кадра» */
    endFrame() {
      this._edge = Object.create(null);
      this._mouseEdge[0] = this._mouseEdge[1] = this._mouseEdge[2] = false;
    },

    clear() {
      this._down = Object.create(null);
      this.endFrame();
      this.mouse = [false, false, false];
    }
  };

  /* именованные действия — чтобы не размазывать коды клавиш по коду игры */
  const A = CR.Act = {
    JUMP: ['Space', 'ArrowUp', 'KeyW'],
    DUCK: ['ArrowDown', 'KeyS'],
    LEFT: ['ArrowLeft', 'KeyA'],
    RIGHT: ['ArrowRight', 'KeyD'],
    SAW: ['KeyZ'],
    SHOOT: ['KeyX'],
    BOMB: ['KeyE']
  };

  CR.held = (act) => In.anyDown(A[act]) ||
    (act === 'SAW' && In.mouseHeld(0)) || (act === 'SHOOT' && In.mouseHeld(2));
  CR.tapped = (act) => In.anyPressed(A[act]) ||
    (act === 'SAW' && In.mousePressed(0)) || (act === 'SHOOT' && In.mousePressed(2));

  /* -------------------------------- камера -------------------------------- */
  CR.Camera = class Camera {
    constructor() {
      this.x = 0;          // мировая координата левого края экрана
      this.shake = 0;      // текущая амплитуда тряски
      this.ox = 0;         // смещение отрисовки
      this.oy = 0;
      this.flash = 0;      // белая/оранжевая вспышка на весь экран
      this.flashColor = '255,220,120';
      this.t = 0;
    }
    kick(amount, flash, color) {
      this.shake = Math.min(34, this.shake + amount);
      if (flash) { this.flash = Math.max(this.flash, flash); this.flashColor = color || this.flashColor; }
    }
    update(dt) {
      this.t += dt;
      this.shake = Math.max(0, this.shake - this.shake * 6 * dt - 8 * dt);
      this.flash = Math.max(0, this.flash - dt * 2.6);
      if (this.shake > 0.05) {
        this.ox = Math.sin(this.t * 71) * this.shake + U.rand(-1, 1) * this.shake * 0.5;
        this.oy = Math.cos(this.t * 63) * this.shake * 0.7 + U.rand(-1, 1) * this.shake * 0.4;
      } else { this.ox = this.oy = 0; }
    }
    reset() { this.x = 0; this.shake = this.flash = this.ox = this.oy = 0; }
  };

  /* ------------------------- вспомогательные канвасы ---------------------- */
  CR.makeCanvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    return { canvas: c, g };
  };
})();

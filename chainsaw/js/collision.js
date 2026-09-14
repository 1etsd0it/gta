/* ============================================================================
   collision.js — shared math and all hit-testing used by the game.
   Boxes are {x, y, w, h} in world space with y growing downward.
   ========================================================================== */
(function () {
  'use strict';
  const CR = window.CR = window.CR || {};

  const M = CR.M = {
    TAU: Math.PI * 2,
    clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
    lerp(a, b, t) { return a + (b - a) * t; },
    /* frame-rate independent smoothing: k is "fraction remaining per second" */
    damp(a, b, k, dt) { return b + (a - b) * Math.pow(k, dt); },
    rand(a, b) { return a + Math.random() * (b - a); },
    randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
    chance(p) { return Math.random() < p; },
    pick(arr) { return arr[(Math.random() * arr.length) | 0]; },
    sign(v) { return v < 0 ? -1 : 1; },
    smoothstep(t) { t = M.clamp(t, 0, 1); return t * t * (3 - 2 * t); },
    easeOut(t) { return 1 - Math.pow(1 - M.clamp(t, 0, 1), 3); },
    easeIn(t) { t = M.clamp(t, 0, 1); return t * t * t; },
    approach(v, target, step) { return v < target ? Math.min(v + step, target) : Math.max(v - step, target); },
    dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); },
    dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; },
    /* deterministic pseudo-random from an integer — keeps scenery stable */
    hash(i, salt) {
      let h = (i * 374761393 + (salt || 0) * 668265263) | 0;
      h = (h ^ (h >> 13)) * 1274126177;
      return ((h ^ (h >> 16)) >>> 0) / 4294967296;
    },
    /* 1234567 -> "1,234,567" */
    commas(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); },
    time(sec) {
      const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
      return m + ':' + (s < 10 ? '0' : '') + s;
    }
  };

  /* ------------------------------- boxes ---------------------------------- */
  const C = CR.Collide = {
    box(x, y, w, h) { return { x, y, w, h }; },

    overlap(a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x &&
             a.y < b.y + b.h && a.y + a.h > b.y;
    },

    contains(b, x, y) {
      return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    },

    /* overlap area — used to pick the "most hit" target of a swing */
    overlapArea(a, b) {
      const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      return (w > 0 && h > 0) ? w * h : 0;
    },

    center(b) { return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; },

    /* circle vs box — explosions, pickups, aggro radii */
    circleBox(cx, cy, r, b) {
      const nx = M.clamp(cx, b.x, b.x + b.w);
      const ny = M.clamp(cy, b.y, b.y + b.h);
      return M.dist2(cx, cy, nx, ny) <= r * r;
    },

    /* swept segment vs box, for fast bullets that could tunnel in one step */
    segmentBox(x0, y0, x1, y1, b) {
      if (C.contains(b, x0, y0) || C.contains(b, x1, y1)) return true;
      let t0 = 0, t1 = 1;
      const dx = x1 - x0, dy = y1 - y0;
      const p = [-dx, dx, -dy, dy];
      const q = [x0 - b.x, b.x + b.w - x0, y0 - b.y, b.y + b.h - y0];
      for (let i = 0; i < 4; i++) {
        if (p[i] === 0) { if (q[i] < 0) return false; continue; }
        const r = q[i] / p[i];
        if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
        else { if (r < t0) return false; if (r < t1) t1 = r; }
      }
      return true;
    },

    /* every live entity whose box overlaps `box` */
    hits(box, list, filter) {
      const out = [];
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead || (filter && !filter(e))) continue;
        if (C.overlap(box, e.box())) out.push(e);
      }
      return out;
    },

    /* nearest live entity to a point, optionally within range */
    nearest(x, y, list, range, filter) {
      let best = null, bestD = range === undefined ? Infinity : range * range;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead || (filter && !filter(e))) continue;
        const d = M.dist2(x, y, e.x, e.y - (e.h || 0) * 0.5);
        if (d < bestD) { bestD = d; best = e; }
      }
      return best;
    }
  };
})();

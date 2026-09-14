/* ============================================================================
   level.js — LEVEL 01: SUBURBS.

   Owns the world: parallax layers, street dressing, the destructible houses,
   parked cars, and the beat script that drives the level from the quiet dawn
   street through the police response, the chase, the mini-boss and the final
   arena. Enemy spawning is declared here and executed by game.js.
   ========================================================================== */
(function () {
  'use strict';
  const CR = window.CR, M = CR.M, A = CR.Assets;

  const GROUND = 0;                 /* world y of the pavement the player runs on */
  CR.GROUND = GROUND;

  /* ======================= destructible building ========================= */
  class Building {
    constructor(x, opts) {
      opts = opts || {};
      this.x = x;
      this.hq = !!opts.hq;
      this.w = this.hq ? 760 : 560;
      this.h = this.hq ? 520 : 450;
      this.sprite = opts.sprite || 0;
      this.state = 'intact';        /* intact | armed | destroyed */
      this.fuse = 0;
      this.beepAt = 0;
      this.t = M.rand(0, 6);
      this.zoneW = 240;
      this.zoneX = x;
      this.rubble = null;
      this.smokeT = 0;
      this.label = opts.label || (this.hq ? 'POLICE HQ' : 'CONDEMNED');
    }

    get baseY() { return GROUND - 6; }

    inZone(px) {
      return this.state === 'intact' && Math.abs(px - this.zoneX) < this.zoneW / 2;
    }

    arm(game) {
      this.state = 'armed';
      this.fuse = this.hq ? 3.2 : 2.4;
      this.beepAt = 0;
      game.audio.play('plant');
      game.ui.toast(this.hq ? 'CHARGE SET — GET CLEAR' : 'CHARGE SET', 1.6);
    }

    update(dt, game) {
      this.t += dt;
      if (this.state === 'armed') {
        this.fuse -= dt;
        this.beepAt -= dt;
        if (this.beepAt <= 0) {
          this.beepAt = M.clamp(this.fuse * 0.28, 0.08, 0.6);
          game.audio.play('beep');
        }
        if (this.fuse <= 0) this.explode(game);
      } else if (this.state === 'destroyed') {
        this.smokeT -= dt;
        if (this.smokeT <= 0) {
          this.smokeT = 0.18;
          CR.Particles.smoke(this.x + M.rand(-140, 140), this.baseY - M.rand(60, 200), 1, 2.2,
            { vy: -90, alpha: .34, lifeScale: 1.6 });
          if (M.chance(.4)) CR.Particles.embers(this.x + M.rand(-160, 160), this.baseY - 90, 2);
        }
      }
    }

    explode(game) {
      this.state = 'destroyed';
      this.rubble = buildRubble(this);
      game.onBuildingDestroyed(this);
    }

    /* ---------------------------- rendering ---------------------------- */
    draw(ctx, cam) {
      const sprite = A.houses[this.sprite % A.houses.length];
      const x = this.x - this.w / 2;
      const y = this.baseY - this.h;

      if (this.state === 'destroyed') {
        ctx.drawImage(this.rubble.img, x - 40, this.baseY - this.rubble.h, this.rubble.w, this.rubble.h);
        return;
      }

      ctx.save();
      ctx.drawImage(sprite.img, x, y, this.w, this.h + 40);

      /* condemned dressing: boarded windows, spray tag, notice */
      ctx.globalAlpha = .95;
      ctx.fillStyle = '#7a5a33';
      for (let i = 0; i < 3; i++) {
        const bx = x + 60 + i * (this.w - 170) / 2, by = y + 130;
        ctx.save();
        ctx.translate(bx + 34, by + 34);
        ctx.rotate(.12 + i * .05);
        ctx.fillRect(-46, -9, 92, 18);
        ctx.rotate(-.5);
        ctx.fillRect(-46, -9, 92, 18);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    /* the plant zone is drawn after the ground so the paint sits on concrete */
    drawZone(ctx, cam, player) {
      if (this.state === 'destroyed') return;
      const near = player && this.inZone(player.x);
      const pulse = .55 + Math.sin(this.t * 4) * .25;

      /* spray-painted target on the pavement */
      ctx.save();
      ctx.translate(this.zoneX, GROUND + 14);
      ctx.scale(1, .32);
      ctx.globalAlpha = this.state === 'armed' ? .35 : (near ? .95 : .6);
      ctx.strokeStyle = this.state === 'armed' ? '#ff4a2a' : '#e2691f';
      ctx.lineWidth = 7;
      ctx.setLineDash([26, 20]);
      ctx.beginPath(); ctx.arc(0, 0, 150, 0, 6.283); ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(-70, -70); ctx.lineTo(70, 70);
      ctx.moveTo(70, -70); ctx.lineTo(-70, 70);
      ctx.stroke();
      ctx.restore();

      /* stacked gas cans as a diegetic hint */
      ctx.save();
      ctx.translate(this.zoneX - 150, GROUND);
      for (let i = 0; i < 3; i++) {
        const img = A.img.pu_fuel;
        ctx.drawImage(img.img, -i * 6 + (i === 2 ? 20 : 0), -46 - (i === 2 ? 40 : 0), 44, 52);
      }
      ctx.restore();

      if (this.state === 'armed') {
        /* the charge itself, blinking */
        const blink = Math.sin(this.t * 26) > 0;
        ctx.save();
        ctx.translate(this.zoneX + 70, GROUND - 26);
        ctx.drawImage(A.img.pu_bomb.img, -40, -20, 84, 62);
        if (blink) {
          const g2 = ctx.createRadialGradient(18, 0, 0, 18, 0, 60);
          g2.addColorStop(0, 'rgba(255,60,40,.75)');
          g2.addColorStop(1, 'rgba(255,60,40,0)');
          ctx.fillStyle = g2;
          ctx.beginPath(); ctx.arc(18, 0, 60, 0, 6.283); ctx.fill();
        }
        ctx.fillStyle = blink ? '#ff5436' : '#ffb03a';
        ctx.font = '900 40px Haettenschweiler, Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.fuse.toFixed(1), 10, -50);
        ctx.restore();
      } else if (near) {
        ctx.save();
        ctx.translate(this.zoneX, GROUND - 430);
        ctx.globalAlpha = .55 + pulse * .45;
        ctx.fillStyle = 'rgba(10,8,12,.72)';
        ctx.fillRect(-210, -34, 420, 54);
        ctx.fillStyle = '#e2691f';
        ctx.fillRect(-210, -34, 6, 54);
        ctx.fillStyle = '#ffd9a8';
        ctx.font = '900 36px Haettenschweiler, Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('[ E ]   PLANT EXPLOSIVE', 6, -6);
        ctx.restore();
      }
    }
  }
  CR.Building = Building;

  /* Collapsed house, rendered once into a canvas when the charge goes off. */
  function buildRubble(b) {
    const w = b.w + 80, h = b.h * .62;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const sprite = A.houses[b.sprite % A.houses.length];
    const wall = sprite.base, roof = sprite.roof;

    /* surviving wall stumps, jagged */
    g.fillStyle = wall;
    g.beginPath();
    g.moveTo(40, h);
    g.lineTo(44, h * .18);
    g.lineTo(110, h * .34);
    g.lineTo(150, h * .10);
    g.lineTo(196, h * .52);
    g.lineTo(250, h);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(w - 40, h);
    g.lineTo(w - 46, h * .30);
    g.lineTo(w - 120, h * .46);
    g.lineTo(w - 190, h * .22);
    g.lineTo(w - 230, h);
    g.closePath(); g.fill();

    /* scorch + interior darkness */
    g.save();
    g.globalCompositeOperation = 'source-atop';
    const burn = g.createLinearGradient(0, 0, 0, h);
    burn.addColorStop(0, 'rgba(22,18,16,.75)');
    burn.addColorStop(.5, 'rgba(40,32,26,.45)');
    burn.addColorStop(1, 'rgba(14,12,10,.8)');
    g.fillStyle = burn; g.fillRect(0, 0, w, h);
    g.restore();

    /* exposed floor joists */
    g.strokeStyle = '#3a2c20'; g.lineWidth = 9;
    for (let i = 0; i < 6; i++) {
      const x = 150 + i * ((w - 320) / 5);
      g.beginPath();
      g.moveTo(x, h * .55);
      g.lineTo(x + M.rand(-30, 30), h * .18 + M.rand(-20, 40));
      g.stroke();
    }
    /* debris mound */
    g.fillStyle = '#4a443b';
    g.beginPath();
    g.moveTo(20, h);
    g.quadraticCurveTo(w * .25, h * .42, w * .5, h * .58);
    g.quadraticCurveTo(w * .75, h * .40, w - 20, h);
    g.closePath(); g.fill();
    for (let i = 0; i < 90; i++) {
      const x = 30 + M.hash(i, 131) * (w - 60);
      const yy = h - M.hash(i, 132) * h * .52;
      const s = 8 + M.hash(i, 133) * 26;
      g.fillStyle = [wall, roof, '#5b544a', '#2f2a24', '#7a7266'][(M.hash(i, 134) * 5) | 0];
      g.save();
      g.translate(x, yy); g.rotate(M.hash(i, 135) * 3);
      g.fillRect(-s / 2, -s / 3, s, s * .66);
      g.restore();
    }
    /* twisted rebar */
    g.strokeStyle = '#6b6259'; g.lineWidth = 3;
    for (let i = 0; i < 10; i++) {
      const x = 60 + M.hash(i, 136) * (w - 120);
      g.beginPath();
      g.moveTo(x, h * .9);
      g.quadraticCurveTo(x + M.rand(-40, 40), h * .55, x + M.rand(-60, 60), h * .38);
      g.stroke();
    }
    /* embers glowing in the pile */
    for (let i = 0; i < 16; i++) {
      const x = 60 + M.hash(i, 137) * (w - 120), yy = h - 20 - M.hash(i, 138) * h * .35;
      const rg = g.createRadialGradient(x, yy, 0, x, yy, 26);
      rg.addColorStop(0, 'rgba(255,140,50,.5)');
      rg.addColorStop(1, 'rgba(255,100,30,0)');
      g.fillStyle = rg;
      g.beginPath(); g.arc(x, yy, 26, 0, 6.283); g.fill();
    }
    return { img: c, w, h };
  }

  /* ============================== the level ============================== */
  CR.Level = class Level {
    constructor(game) {
      this.game = game;
      this.name = 'SUBURBS';
      this.scenery = [];      /* parallax dressing */
      this.props = [];        /* play-plane dressing */
      this.buildings = [];
      this.spawns = [];       /* [{x, type, opts, done}] */
      this.beats = [];        /* [{x, fn, done}]         */
      this.parked = [];
      this.spawnIndex = 0;
      this.beatIndex = 0;
      this.length = 17600;
      this.arenaX = 14100;
      this.bossX = 12100;
      this.build();
    }

    /* ------------------------- world generation ------------------------- */
    build() {
      const S = this.scenery, P = this.props;

      /* --- background house row + trees (parallax 0.62 / 0.86) --- */
      for (let x = -600, i = 0; x < this.length + 2600; i++) {
        const kind = M.hash(i, 201);
        if (kind > .34) {
          S.push({ layer: .62, kind: 'house', x: x, v: i % A.houses.length, scale: .92 + M.hash(i, 202) * .2 });
          x += 620 + M.hash(i, 203) * 180;
        } else {
          S.push({ layer: .62, kind: 'tree', x: x + 120, scale: .7 + M.hash(i, 204) * .35 });
          x += 420 + M.hash(i, 205) * 160;
        }
        if (M.hash(i, 206) > .72) S.push({ layer: .86, kind: 'tree', x: x - 260, scale: .9 + M.hash(i, 207) * .5 });
      }

      /* --- play-plane street furniture --- */
      for (let x = -400, i = 0; x < this.length + 1800; i++) {
        const r = M.hash(i, 211);
        const step = 300 + M.hash(i, 212) * 420;
        if (r < .17) P.push({ kind: 'lamp', x, z: 1 });
        else if (r < .24) S.push({ layer: .86, kind: 'pole', x: x });
        else if (r < .40) P.push({ kind: 'bin', x, z: 1 });
        else if (r < .47) P.push({ kind: 'hydrant', x, z: 1 });
        else if (r < .54) P.push({ kind: 'mailbox', x, z: 1 });
        else if (r < .60) P.push({ kind: 'bench', x, z: 1 });
        else if (r < .66) P.push({ kind: 'garbage', x, z: 1 });
        else if (r < .72) P.push({ kind: 'bush', x, z: 1 });
        else if (r < .76) P.push({ kind: 'busstop', x, z: 1 });
        else if (r < .80) P.push({ kind: 'sign', x, z: 1 });
        else if (r < .84) P.push({ kind: 'stop', x, z: 1 });
        else if (r < .90) P.push({ kind: 'cone', x, z: 1 });
        /* fences run along the front gardens behind the walk */
        if (M.hash(i, 213) > .35) {
          const fx = x - 120;
          for (let k = 0; k < 4; k++) {
            S.push({ layer: .78, kind: M.hash(i + k, 214) > .8 ? 'chainlink' : 'fence', x: fx + k * 236 });
          }
        }
        x += step;
      }

      /* --- parked cars along the kerb (decor, behind the action) --- */
      const types = ['sedan', 'suv', 'van', 'taxi', 'pickup'];
      for (let x = 300, i = 0; x < this.length + 1200; i++) {
        if (M.hash(i, 221) > .42) {
          const t = types[(M.hash(i, 222) * types.length) | 0];
          this.parked.push({ x, type: t, variant: (M.hash(i, 223) * 4) | 0, flip: M.hash(i, 224) > .5 });
        }
        x += 520 + M.hash(i, 225) * 520;
      }

      /* --- foreground: low hedges only, so nothing blocks the action --- */
      for (let x = 0, i = 0; x < this.length + 1200; i++) {
        S.push({ layer: 1.3, kind: 'bush', x, scale: .9 + M.hash(i, 232) * .5 });
        x += 2200 + M.hash(i, 233) * 2600;
      }

      /* ------------------------ destructible houses ---------------------- */
      [5000, 7900, 10400].forEach((x, i) => {
        this.buildings.push(new Building(x, { sprite: i + 2 }));
      });
      this.hq = new Building(this.arenaX + 980, { hq: true, sprite: 6, label: 'POLICE HQ' });
      this.buildings.push(this.hq);

      /* cache pole positions so the wires can be strung between them */
      this.poleXs = this.scenery.filter((o) => o.kind === 'pole').map((o) => o.x).sort((a, b) => a - b);

      this.buildScript();
    }

    /* --------------------------- level script --------------------------- */
    buildScript() {
      const sp = (x, type, opts) => this.spawns.push({ x, type, opts: opts || {}, done: false });
      const beat = (x, fn) => this.beats.push({ x, fn, done: false });

      /* ---- act 1: the quiet street ---- */
      for (let x = 900; x < 3100; x += M.rand(240, 430)) {
        sp(x, 'civilian');
        if (M.chance(.4)) sp(x + M.rand(60, 200), 'civilian');
      }
      sp(1500, 'car'); sp(2450, 'car');
      sp(1750, 'pickup:ammo');
      sp(2700, 'pickup:fuel');

      /* ---- act 2: police response ---- */
      beat(3100, (g) => {
        g.ui.banner('POLICE RESPONDING', 2.2);
        g.audio.siren();
        g.cam.shake(.25);
      });
      for (let x = 3200; x < 5000; x += M.rand(300, 480)) {
        sp(x, M.chance(.55) ? 'police' : 'civilian');
        if (M.chance(.35)) sp(x + M.rand(120, 260), 'dog');
        if (M.chance(.3)) sp(x + M.rand(80, 220), 'civilian');
      }
      sp(3600, 'car'); sp(4300, 'car');
      sp(4100, 'pickup:med');
      sp(4600, 'pickup:bomb');
      sp(4750, 'pickup:ammo');

      /* ---- act 3: the chase ---- */
      beat(5250, (g) => { g.ui.banner('THEY CALLED IT IN', 1.8); g.level.chase = true; });
      for (let x = 5300; x < 7800; x += M.rand(320, 460)) {
        sp(x, M.chance(.6) ? 'police' : (M.chance(.5) ? 'dog' : 'civilian'));
        if (M.chance(.4)) sp(x + M.rand(100, 240), 'civilian');
      }
      sp(5800, 'car'); sp(6400, 'car'); sp(7100, 'car');
      sp(6100, 'pickup:ammo'); sp(6700, 'pickup:fuel'); sp(7300, 'pickup:bomb');
      sp(6900, 'pickup:med');

      /* ---- act 4: armour shows up ---- */
      beat(8200, (g) => { g.ui.banner('TACTICAL UNITS DEPLOYED', 2.2); });
      for (let x = 8300; x < 11800; x += M.rand(360, 540)) {
        const r = Math.random();
        sp(x, r < .45 ? 'police' : (r < .62 ? 'swat' : (r < .82 ? 'dog' : 'civilian')));
        if (M.chance(.22)) sp(x + M.rand(160, 340), 'police');
      }
      sp(8800, 'car'); sp(9500, 'car'); sp(10900, 'car'); sp(11500, 'car');
      sp(9200, 'pickup:ammo'); sp(9900, 'pickup:bomb'); sp(10100, 'pickup:med');
      sp(10800, 'pickup:fuel'); sp(11400, 'pickup:ammo'); sp(11600, 'pickup:med');
      sp(11750, 'pickup:med'); sp(11850, 'pickup:fuel'); sp(11900, 'pickup:ammo');

      /* ---- act 5: the mini-boss ---- */
      beat(this.bossX, (g) => g.startBoss());

      /* ---- act 6: final arena ---- */
      beat(this.arenaX - 700, (g) => g.ui.banner('PRECINCT AHEAD', 2));
      beat(this.arenaX, (g) => g.startArena());
    }

    /* ------------------------------ update ------------------------------ */
    update(dt, cam) {
      const g = this.game;
      const front = cam.view().right + 420;

      while (this.spawnIndex < this.spawns.length && this.spawns[this.spawnIndex].x < front) {
        const s = this.spawns[this.spawnIndex++];
        g.spawnFromLevel(s);
      }
      const px = g.player.x;
      while (this.beatIndex < this.beats.length && this.beats[this.beatIndex].x < px) {
        const b = this.beats[this.beatIndex++];
        b.fn(g);
      }
      for (const b of this.buildings) b.update(dt, g);
    }

    buildingInZone(px) {
      for (const b of this.buildings) if (b.inZone(px)) return b;
      return null;
    }

    /* ============================ rendering ============================= */
    drawSky(ctx, cam) {
      const v = cam.view();
      const vw = v.right - v.left;
      /* The sky bitmap carries the sun at 90% of its height, so anchor that
         line to the world horizon: the dawn glow then sits on the rooftops. */
      const skyH = Math.max(1180, (v.bottom - v.top) * 1.1);
      const horizon = GROUND - 330;
      ctx.drawImage(A.img.sky, v.left - 20, horizon - skyH * 0.9, vw + 40, skyH);
      layer(ctx, cam, A.img.clouds, .05, -760, 420, 2400);
      layer(ctx, cam, A.img.skyline, .17, -700, 520, 2400);
      layer(ctx, cam, A.img.treeline, .34, -430, 430, 2200);
    }

    drawBackground(ctx, cam) {
      const v = cam.view();
      /* houses and back trees */
      for (const s of this.scenery) {
        if (s.layer >= 1) continue;
        const x = s.x * s.layer + cam.cx * (1 - s.layer);
        if (x < v.left - 900 || x > v.right + 900) continue;
        if (s.kind === 'house') {
          const hs = A.houses[s.v];
          const w = hs.w * s.scale, h = hs.h * s.scale;
          ctx.drawImage(hs.img, x - w / 2, GROUND - h + 54, w, h);
        } else if (s.kind === 'tree') {
          const t = A.img.tree, sc = s.scale * (s.layer < .8 ? .8 : 1);
          ctx.drawImage(t.img, x - t.w * sc / 2, GROUND - t.h * sc + 40, t.w * sc, t.h * sc);
        } else if (s.kind === 'pole') {
          const pl = A.img.pole;
          ctx.drawImage(pl.img, x - pl.w / 2, GROUND + 16 - pl.h, pl.w, pl.h);
        } else if (s.kind === 'fence' || s.kind === 'chainlink') {
          const f = A.img[s.kind];
          ctx.drawImage(f.img, x, GROUND - f.h * .78, f.w, f.h * .78);
        }
      }
      /* power lines sagging between the poles */
      const poles = this.poleXs;
      ctx.save();
      ctx.strokeStyle = 'rgba(12,14,20,.75)';
      ctx.lineWidth = 2.6;
      for (let i = 0; i + 1 < poles.length; i++) {
        const a = poles[i] * .86 + cam.cx * .14, b = poles[i + 1] * .86 + cam.cx * .14;
        if (b < v.left - 400 || a > v.right + 400) continue;
        const topY = GROUND + 16 - A.img.pole.h;
        for (let k = 0; k < 3; k++) {
          const y0 = topY + 46 + k * 50;
          ctx.beginPath();
          ctx.moveTo(a + 6, y0);
          ctx.quadraticCurveTo((a + b) / 2, y0 + 58 + k * 8, b + 6, y0);
          ctx.stroke();
        }
      }
      ctx.restore();

      /* distance haze over everything behind the play plane */
      const haze = ctx.createLinearGradient(0, GROUND - 620, 0, GROUND + 40);
      haze.addColorStop(0, 'rgba(214,146,104,.10)');
      haze.addColorStop(.62, 'rgba(222,152,110,.07)');
      haze.addColorStop(1, 'rgba(236,176,132,.17)');
      ctx.fillStyle = haze;
      ctx.fillRect(v.left - 40, GROUND - 660, (v.right - v.left) + 80, 720);

      /* parked cars at the kerb, slightly smaller and hazed back */
      for (const p of this.parked) {
        if (p.x < v.left - 700 || p.x > v.right + 700) continue;
        const set = A.cars[p.type][p.variant % A.cars[p.type].length];
        const sc = .78;
        ctx.save();
        ctx.globalAlpha = .95;
        ctx.translate(p.x, GROUND - 26);
        if (p.flip) ctx.scale(-1, 1);
        ctx.drawImage(set.clean, -set.w * sc / 2, -set.h * sc, set.w * sc, set.h * sc);
        ctx.restore();
      }
    }

    /* road, kerb, pavement — the plane everything stands on */
    drawGround(ctx, cam) {
      const v = cam.view();
      const left = v.left - 60, width = (v.right - v.left) + 120;

      /* grass verge behind the walk */
      ctx.save();
      const grassPat = ctx.createPattern(A.img.grass, 'repeat');
      ctx.fillStyle = grassPat;
      ctx.fillRect(left, GROUND - 34, width, 40);
      ctx.fillStyle = 'rgba(10,14,10,.45)';
      ctx.fillRect(left, GROUND - 34, width, 40);
      ctx.restore();

      /* pavement */
      ctx.save();
      const pat = ctx.createPattern(A.img.sidewalk, 'repeat');
      ctx.fillStyle = pat;
      ctx.fillRect(left, GROUND, width, 74);
      const walkShade = ctx.createLinearGradient(0, GROUND, 0, GROUND + 74);
      walkShade.addColorStop(0, 'rgba(255,190,140,.16)');
      walkShade.addColorStop(.4, 'rgba(30,30,40,.25)');
      walkShade.addColorStop(1, 'rgba(10,12,18,.5)');
      ctx.fillStyle = walkShade;
      ctx.fillRect(left, GROUND, width, 74);
      ctx.restore();

      /* kerb */
      ctx.fillStyle = '#7d7a72';
      ctx.fillRect(left, GROUND + 74, width, 16);
      ctx.fillStyle = 'rgba(255,200,150,.22)';
      ctx.fillRect(left, GROUND + 74, width, 4);
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(left, GROUND + 88, width, 8);

      /* road */
      ctx.save();
      const road = ctx.createPattern(A.img.asphalt, 'repeat');
      ctx.fillStyle = road;
      ctx.fillRect(left, GROUND + 90, width, 460);
      const roadShade = ctx.createLinearGradient(0, GROUND + 90, 0, GROUND + 520);
      roadShade.addColorStop(0, 'rgba(8,10,16,.42)');
      roadShade.addColorStop(.35, 'rgba(30,32,42,.08)');
      roadShade.addColorStop(1, 'rgba(6,8,14,.45)');
      ctx.fillStyle = roadShade;
      ctx.fillRect(left, GROUND + 90, width, 460);
      /* wet sheen reflecting the dawn */
      const sheen = ctx.createLinearGradient(0, GROUND + 110, 0, GROUND + 300);
      sheen.addColorStop(0, 'rgba(255,170,110,.12)');
      sheen.addColorStop(1, 'rgba(120,90,140,0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(left, GROUND + 110, width, 200);
      ctx.restore();

      /* lane markings */
      ctx.fillStyle = 'rgba(226,206,130,.5)';
      const step = 260;
      for (let i = Math.floor(left / step); i < (left + width) / step + 1; i++) {
        ctx.fillRect(i * step, GROUND + 250, 120, 11);
      }

      /* road furniture: manholes, puddles catching the sky, tyre streaks */
      const first = Math.floor(left / 520), last = Math.ceil((left + width) / 520);
      for (let i = first; i <= last; i++) {
        const r = M.hash(i, 241);
        const x = i * 520 + r * 300;
        if (r > .62) {
          ctx.save();
          ctx.translate(x, GROUND + 190);
          ctx.scale(1, .3);
          ctx.fillStyle = '#3a3c42';
          ctx.beginPath(); ctx.arc(0, 0, 54, 0, 6.283); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.arc(0, 0, 54, 0, 6.283); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,.07)';
          ctx.beginPath(); ctx.arc(-8, -10, 44, 0, 6.283); ctx.fill();
          ctx.restore();
        }
        if (M.hash(i, 242) > .5) {
          const px = i * 520 + M.hash(i, 243) * 400;
          const py = GROUND + 120 + M.hash(i, 244) * 190;
          const rw = 90 + M.hash(i, 245) * 190;
          ctx.save();
          ctx.translate(px, py); ctx.scale(1, .22);
          const pud = ctx.createRadialGradient(0, 0, 0, 0, 0, rw);
          pud.addColorStop(0, 'rgba(226,158,112,.30)');
          pud.addColorStop(.55, 'rgba(120,110,150,.18)');
          pud.addColorStop(1, 'rgba(60,70,110,0)');
          ctx.fillStyle = pud;
          ctx.beginPath(); ctx.arc(0, 0, rw, 0, 6.283); ctx.fill();
          ctx.restore();
        }
        if (M.hash(i, 246) > .74) {
          ctx.save();
          ctx.globalAlpha = .22;
          ctx.strokeStyle = '#0d0e12'; ctx.lineWidth = 13;
          ctx.beginPath();
          ctx.moveTo(i * 520, GROUND + 150 + M.hash(i, 247) * 120);
          ctx.quadraticCurveTo(i * 520 + 200, GROUND + 190, i * 520 + 420, GROUND + 130 + M.hash(i, 248) * 130);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    /* props that stand on the play plane, drawn behind the characters */
    drawProps(ctx, cam, near) {
      const v = cam.view();
      for (const p of this.props) {
        if (p.x < v.left - 500 || p.x > v.right + 500) continue;
        const img = A.img[p.kind];
        if (!img) continue;
        const isNear = p.kind === 'bush' || p.kind === 'cone' || p.kind === 'garbage';
        if (!!near !== isNear) continue;
        let y = GROUND + (p.kind === 'busstop' ? 6 : 10);
        ctx.drawImage(img.img, p.x - img.w / 2, y - img.h, img.w, img.h);
      }
    }

    /* The warm pool under each street lamp. The whole cone + pool is baked
       into one sprite at build time; per frame it is a single drawImage. */
    lampSprite() {
      if (this._lamp) return this._lamp;
      const W2 = 440, H2 = 620;
      const c = document.createElement('canvas');
      c.width = W2; c.height = H2;
      const g = c.getContext('2d');
      const lx = W2 / 2;
      const cone = g.createLinearGradient(lx, 0, lx, H2);
      cone.addColorStop(0, 'rgba(255,196,120,.22)');
      cone.addColorStop(.55, 'rgba(255,176,96,.09)');
      cone.addColorStop(1, 'rgba(255,150,70,0)');
      g.fillStyle = cone;
      g.beginPath();
      g.moveTo(lx - 34, 0); g.lineTo(lx + 34, 0);
      g.lineTo(lx + 176, H2 - 30); g.lineTo(lx - 176, H2 - 30);
      g.closePath(); g.fill();
      const pool = g.createRadialGradient(lx, H2 - 26, 0, lx, H2 - 26, 200);
      pool.addColorStop(0, 'rgba(255,186,110,.20)');
      pool.addColorStop(.5, 'rgba(255,170,90,.07)');
      pool.addColorStop(1, 'rgba(255,160,80,0)');
      g.save();
      g.translate(lx, H2 - 26); g.scale(1, .28);
      g.fillStyle = pool;
      g.beginPath(); g.arc(0, 0, 200, 0, 6.283); g.fill();
      g.restore();
      g.filter = 'blur(6px)';
      g.drawImage(c, 0, 0);
      g.filter = 'none';
      this._lamp = c;
      return c;
    }

    drawLampLight(ctx, cam, quality) {
      if (quality === 'low') return;
      const v = cam.view();
      const spr = this.lampSprite();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of this.props) {
        if (p.kind !== 'lamp') continue;
        if (p.x < v.left - 120 || p.x > v.right + 120) continue;
        ctx.drawImage(spr, p.x + 58 - spr.width / 2, GROUND - 540, spr.width, spr.height);
      }
      ctx.restore();
    }

    drawForeground(ctx, cam) {
      const v = cam.view();
      for (const s of this.scenery) {
        if (s.layer < 1) continue;
        const x = s.x * s.layer + cam.cx * (1 - s.layer);
        if (x < v.left - 900 || x > v.right + 900) continue;
        const img = A.img.bushBlur;           /* pre-blurred at build time */
        const sc = s.scale * 1.5;
        ctx.save();
        ctx.globalAlpha = .92;
        /* anchored to the bottom of the frame: depth without hiding the action */
        ctx.drawImage(img.img, x - img.w * sc / 2, v.bottom - img.h * sc * .62, img.w * sc, img.h * sc);
        ctx.restore();
      }
    }
  };

  /* Tiles a strip horizontally at a parallax depth. An object that "lives" at
     world x appears at x*f + camX*(1-f), so a whole tiled layer just shifts by
     camX*(1-f). f = 1 is the play plane, f = 0 is pinned to the camera. */
  function layer(ctx, cam, img, f, yOff, h, tileW) {
    const v = cam.view();
    const shift = cam.cx * (1 - f);
    const first = Math.floor((v.left - shift) / tileW) - 1;
    const last = Math.ceil((v.right - shift) / tileW) + 1;
    const y = GROUND + yOff;
    for (let i = first; i <= last; i++) {
      ctx.drawImage(img, i * tileW + shift, y, tileW, h);
    }
  }
})();

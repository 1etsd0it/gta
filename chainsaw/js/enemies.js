/* ============================================================================
   enemies.js — civilians, police, attack dogs, armoured units and the mini
   boss, plus the two world objects that share their lifecycle: parked cars
   (obstacles) and pickups.

   Every humanoid uses the same rig as the player with a different outfit, so
   the whole cast is lit and shaded consistently.
   ========================================================================== */
(function () {
  'use strict';
  const CR = window.CR, M = CR.M, P = CR.Particles, C = CR.Collide;
  const GRAVITY = 3000;

  /* ============================== base actor ============================= */
  class Actor {
    constructor(game, x, kitName, cfg) {
      this.game = game;
      this.kit = CR.Rig.kit(kitName);
      this.x = x; this.y = CR.GROUND;
      this.vx = 0; this.vy = 0;
      this.facing = -1;
      this.scale = 1;
      this.w = 90; this.h = 250;
      this.hp = 10; this.maxHp = 10;
      this.dead = false; this.dying = false;
      this.deadT = 0;
      this.anim = M.rand(0, 1);
      this.stateT = 0;
      this.hitFlash = 0;
      this.stagger = 0;
      this.lastSwing = -1;
      this.armored = false;
      this.score = 50;
      this.pose = CR.Poses.idle(0);
      this.onGround = true;
      this.launched = false;
      Object.assign(this, cfg || {});
      this.maxHp = this.hp;
    }

    box() {
      const h = this.h * this.scale;
      return { x: this.x - this.w * this.scale / 2, y: this.y - h, w: this.w * this.scale, h: h };
    }
    centerY() { return this.y - this.h * this.scale * .5; }

    knock(vx, vy) {
      this.vx += vx; if (vy) { this.vy += vy; this.onGround = false; }
      this.stagger = .22;
    }
    launch(vx, vy) {
      this.vx += vx * 120; this.vy = vy; this.onGround = false; this.launched = true;
    }

    hurt(amount, source, game, fromX) {
      if (this.dead || this.dying) return false;
      if (this.armored && source === 'bullet') amount *= .45;
      this.hp -= amount;
      this.hitFlash = .14;
      this.stagger = .2;
      if (fromX !== undefined) this.facing = fromX > this.x ? 1 : -1;
      if (this.hp <= 0) { this.die(source, game, fromX); return true; }
      P.blood(this.x, this.centerY(), this.armored ? 3 : 8, fromX > this.x ? -1 : 1, .8, CR.GROUND);
      game.audio.play(this.armored ? 'hitArmor' : 'hitFlesh');
      if (this.onHurt) this.onHurt(source, game);
      return false;
    }

    die(source, game, fromX) {
      this.dying = true;
      this.deadT = 0;
      this.deathSource = source;
      const dir = fromX !== undefined && fromX > this.x ? -1 : 1;
      if (source === 'chainsaw') {
        /* the chainsaw does not do tidy deaths */
        P.gorePop(this.x, this.centerY(), 14, dir, CR.GROUND);
        P.blood(this.x, this.centerY(), 26, dir, 1.7, CR.GROUND);
        game.audio.play('gore');
      } else if (source === 'explosion') {
        P.gorePop(this.x, this.centerY(), 10, dir, CR.GROUND);
      } else {
        P.blood(this.x, this.centerY(), 14, dir, 1.2, CR.GROUND);
      }
      P.decal(this.x, CR.GROUND + 6, 150, 'blood');
      game.audio.scream(this.voice || 'male');
      game.onKill(this, source);
    }

    physics(dt) {
      this.x += this.vx * dt;
      if (!this.onGround || this.vy !== 0) {
        this.vy += GRAVITY * dt;
        this.y += this.vy * dt;
        if (this.y >= CR.GROUND) {
          if (this.launched && Math.abs(this.vy) > 500) {
            P.blood(this.x, CR.GROUND - 10, 6, 0, .6, CR.GROUND);
          }
          this.y = CR.GROUND; this.vy = 0; this.onGround = true; this.launched = false;
        } else this.onGround = false;
      }
      this.vx = M.damp(this.vx, 0, .0009, dt);
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      this.stagger = Math.max(0, this.stagger - dt);
      this.stateT += dt;
    }

    updateDying(dt, game) {
      this.deadT += dt;
      this.physics(dt);
      this.pose = CR.Poses.death(M.clamp(this.deadT / .8, 0, 1));
      if (this.deadT > 12) this.dead = true;
      if (this.deathSource === 'chainsaw' && this.deadT < .5 && M.chance(dt * 14)) {
        P.blood(this.x + M.rand(-30, 30), this.y - 40, 2, 0, .5, CR.GROUND);
      }
    }

    draw(ctx) {
      const dying = this.dying;
      CR.Rig.shadow(ctx, this.x, CR.GROUND + 8, 80 * this.scale, dying ? .5 : (this.onGround ? .95 : .5));
      CR.Rig.draw(ctx, this.x, this.y, {
        kit: this.kit, pose: this.pose, scale: this.scale, facing: this.facing
      });
      if (this.hitFlash > 0) {
        ctx.save();
        ctx.globalAlpha = this.hitFlash * 4;
        ctx.globalCompositeOperation = 'lighter';
        CR.Rig.draw(ctx, this.x, this.y, {
          kit: this.kit, pose: this.pose, scale: this.scale, facing: this.facing, alpha: .5
        });
        ctx.restore();
      }
    }
  }
  CR.Actor = Actor;

  /* ============================== civilians ============================== */
  const CIV_KITS = ['businessman', 'woman', 'delivery', 'jogger', 'elderly'];
  CR.Civilian = class Civilian extends Actor {
    constructor(game, x, kind) {
      const kit = kind || M.pick(CIV_KITS);
      super(game, x, kit, {
        hp: 12, w: 80, h: 250, score: 50, type: 'civilian',
        voice: kit === 'woman' ? 'female' : (kit === 'elderly' ? 'old' : 'male')
      });
      this.scale = kit === 'woman' ? .94 : (kit === 'elderly' ? .92 : 1);
      this.panic = false;
      this.walkDir = M.chance(.5) ? -1 : 1;
      this.facing = this.walkDir;
      this.speed = M.rand(90, 130);
      this.yellT = M.rand(.2, 1.4);
    }

    update(dt, game) {
      if (this.dying) { this.updateDying(dt, game); return; }
      const p = game.player;
      const d = this.x - p.x;

      if (!this.panic && Math.abs(d) < 620) {
        this.panic = true;
        this.speed = M.rand(300, 390);
        this.walkDir = d >= 0 ? 1 : -1;
        game.audio.scream(this.voice, .5);
      }
      this.facing = this.walkDir;
      this.vx = this.walkDir * this.speed * (this.stagger > 0 ? .2 : 1);
      this.anim += dt * (this.panic ? 2.0 : 1.05);
      this.physics(dt);

      if (this.panic) {
        this.pose = CR.Poses.panic(this.anim);
        this.yellT -= dt;
        if (this.yellT <= 0) { this.yellT = M.rand(1.6, 3.4); if (M.chance(.5)) game.audio.scream(this.voice, .35); }
      } else {
        this.pose = CR.Poses.walk(this.anim);
      }
    }
  };

  /* =============================== police =============================== */
  CR.Police = class Police extends Actor {
    constructor(game, x, opts) {
      opts = opts || {};
      super(game, x, M.chance(.5) ? 'police' : 'police2', {
        hp: 58, w: 92, h: 255, score: 100, type: 'police', voice: 'male'
      });
      this.standoff = opts.standoff || M.rand(430, 660);
      this.fireCd = M.rand(.5, 1.6);
      this.aimT = 0;
      this.state = 'advance';
    }

    update(dt, game) {
      if (this.dying) { this.updateDying(dt, game); return; }
      const p = game.player;
      const d = this.x - p.x;
      const dist = Math.abs(d);
      this.facing = d > 0 ? -1 : 1;

      if (this.stagger > 0) {
        this.vx = M.damp(this.vx, 0, .002, dt);
        this.pose = CR.Poses.hit(.5);
        this.physics(dt);
        return;
      }

      if (p.dead) {
        this.vx = 0;
        this.pose = CR.Poses.idle(this.stateT);
        this.physics(dt);
        return;
      }

      if (dist > this.standoff) {
        /* close the gap */
        this.vx = -Math.sign(d) * 250;
        this.anim += dt * 1.6;
        this.pose = CR.Poses.run(this.anim, .8);
        this.state = 'advance';
      } else if (dist < 200) {
        /* too close — back off, still firing */
        this.vx = Math.sign(d) * 210;
        this.anim += dt * 1.2;
        this.pose = CR.Poses.run(this.anim, .6);
      } else {
        this.vx = M.damp(this.vx, 0, .0005, dt);
        this.fireCd -= dt;
        this.aimT += dt;
        if (this.fireCd <= .5) {
          this.pose = CR.Poses.aim(Math.max(0, .5 - this.fireCd));
        } else {
          this.pose = CR.Poses.aim(1);
        }
        if (this.fireCd <= 0) {
          this.fireCd = M.rand(1.5, 2.4);
          this.fire(game, p);
        }
      }
      this.physics(dt);
    }

    fire(game, p) {
      const y = this.y - 168 * this.scale;
      const x = this.x + this.facing * 54;
      const aim = Math.atan2((p.y - 150) - y, p.x - x);
      game.bullets.push(new CR.Bullet(x, y, Math.cos(aim) * 1900, Math.sin(aim) * 1900, 8, 'enemy'));
      CR.Weapons.muzzle(game, x, y, this.facing, .8);
      P.shell(x - this.facing * 12, y - 4, this.facing);
      game.audio.play('copShot');
    }
  };

  /* ============================ armoured unit =========================== */
  CR.Swat = class Swat extends Actor {
    constructor(game, x) {
      super(game, x, 'swat', {
        hp: 155, w: 100, h: 262, score: 150, type: 'swat', voice: 'male', armored: true
      });
      this.scale = 1.06;
      this.fireCd = M.rand(1, 2);
      this.standoff = M.rand(380, 560);
    }

    update(dt, game) {
      if (this.dying) { this.updateDying(dt, game); return; }
      const p = game.player;
      const d = this.x - p.x, dist = Math.abs(d);
      this.facing = d > 0 ? -1 : 1;

      if (p.dead) { this.vx = 0; this.pose = CR.Poses.idle(this.stateT); this.physics(dt); return; }

      if (dist > this.standoff) {
        this.vx = -Math.sign(d) * 190;
        this.anim += dt * 1.25;
        this.pose = CR.Poses.run(this.anim, .7);
      } else {
        this.vx = M.damp(this.vx, 0, .0006, dt);
        this.fireCd -= dt;
        this.pose = CR.Poses.aim(M.clamp(1 - this.fireCd, 0, 1));
        if (this.fireCd <= 0) {
          this.fireCd = M.rand(2.0, 3.0);
          this.burst(game, p);
        }
      }
      this.physics(dt);
    }

    burst(game, p) {
      const y = this.y - 172 * this.scale;
      const x = this.x + this.facing * 58;
      for (let i = 0; i < 3; i++) {
        const aim = Math.atan2((p.y - 150) - y, p.x - x) + M.rand(-.05, .05);
        setTimeoutSafe(game, i * .09, () => {
          game.bullets.push(new CR.Bullet(x, y, Math.cos(aim) * 2000, Math.sin(aim) * 2000, 7, 'enemy'));
          CR.Weapons.muzzle(game, x, y, this.facing, .9);
          game.audio.play('copShot');
        });
      }
    }
  };

  /* small deferred-call helper so bursts don't need their own timers */
  function setTimeoutSafe(game, delay, fn) { game.timers.push({ t: delay, fn: fn }); }

  /* =============================== the dog ============================== */
  /* Quadruped: drawn directly rather than through the humanoid rig. */
  CR.Dog = class Dog extends Actor {
    constructor(game, x) {
      super(game, x, 'businessman', {
        hp: 22, w: 160, h: 120, score: 75, type: 'dog', voice: 'dog'
      });
      this.biteCd = 0;
      this.barkT = M.rand(.3, 1.6);
      this.gait = M.rand(0, 6.28);
    }

    update(dt, game) {
      if (this.dying) { this.updateDying(dt, game); return; }
      const p = game.player;
      const d = this.x - p.x;
      this.facing = d > 0 ? -1 : 1;
      this.biteCd = Math.max(0, this.biteCd - dt);
      this.barkT -= dt;
      if (this.barkT <= 0) {
        this.barkT = M.rand(1.4, 3);
        if (Math.abs(d) < 900) game.audio.play('dog');
      }
      const speed = p.dead ? 120 : 470;
      this.vx = (p.dead ? 1 : -Math.sign(d)) * speed * (this.stagger > 0 ? .3 : 1);
      this.gait += dt * 15;
      this.physics(dt);

      if (!p.dead && this.biteCd <= 0 && C.overlap(this.box(), p.box())) {
        this.biteCd = .9;
        p.hurt(9, game, this.x);
        game.audio.play('dogBite');
        this.vx = Math.sign(d) * 380;
      }
    }

    updateDying(dt, game) {
      this.deadT += dt;
      this.physics(dt);
      if (this.deadT > 12) this.dead = true;
    }

    draw(ctx) {
      const s = 1, f = this.facing;
      const dying = this.dying;
      CR.Rig.shadow(ctx, this.x, CR.GROUND + 6, 78, dying ? .5 : .9);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(f, 1);
      if (dying) {
        const k = M.clamp(this.deadT / .6, 0, 1);
        ctx.translate(0, 34 * k);
        ctx.rotate(-1.35 * k);
      }
      const g = ctx;
      const bodyY = -80 + (dying ? 0 : Math.abs(Math.sin(this.gait)) * 5);
      /* shepherd colouring: tan flanks, black saddle — reads at a glance */
      const fur = g.createLinearGradient(0, bodyY - 46, 0, bodyY + 36);
      fur.addColorStop(0, '#b08653');
      fur.addColorStop(.30, '#8a6239');
      fur.addColorStop(.64, '#4e3620');
      fur.addColorStop(1, '#241812');

      /* far legs */
      leg(g, -46, bodyY + 20, this.gait + 1.2, '#3b2a19', dying);
      leg(g, 44, bodyY + 18, this.gait + 3.4, '#3b2a19', dying);
      /* tail */
      g.strokeStyle = '#2e2115'; g.lineWidth = 13; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-64, bodyY - 4);
      g.quadraticCurveTo(-104, bodyY - 24 + Math.sin(this.gait * .5) * 10, -118, bodyY - 46);
      g.stroke();
      /* body */
      g.fillStyle = fur;
      g.beginPath();
      g.moveTo(-66, bodyY - 4);
      g.quadraticCurveTo(-58, bodyY - 42, -6, bodyY - 44);
      g.quadraticCurveTo(52, bodyY - 46, 70, bodyY - 30);
      g.quadraticCurveTo(86, bodyY - 6, 62, bodyY + 22);
      g.quadraticCurveTo(10, bodyY + 34, -40, bodyY + 26);
      g.quadraticCurveTo(-66, bodyY + 20, -66, bodyY - 4);
      g.closePath(); g.fill();
      /* black saddle marking */
      /* black saddle across the back */
      g.fillStyle = 'rgba(12,9,8,.82)';
      g.beginPath();
      g.moveTo(-58, bodyY - 12);
      g.quadraticCurveTo(-30, bodyY - 46, 16, bodyY - 44);
      g.quadraticCurveTo(56, bodyY - 42, 66, bodyY - 24);
      g.quadraticCurveTo(30, bodyY - 20, -10, bodyY - 8);
      g.closePath(); g.fill();
      /* neck + head */
      g.fillStyle = fur;
      g.beginPath();
      g.moveTo(54, bodyY - 30);
      g.quadraticCurveTo(84, bodyY - 52, 96, bodyY - 60);
      g.lineTo(124, bodyY - 44);
      g.quadraticCurveTo(132, bodyY - 26, 112, bodyY - 18);
      g.quadraticCurveTo(80, bodyY - 8, 58, bodyY - 8);
      g.closePath(); g.fill();
      /* snout, open and snarling */
      g.fillStyle = '#241a12';
      g.beginPath();
      g.moveTo(116, bodyY - 44);
      g.lineTo(158, bodyY - 40);
      g.lineTo(156, bodyY - 28);
      g.lineTo(114, bodyY - 26);
      g.closePath(); g.fill();
      g.fillStyle = '#120c08';
      g.beginPath(); g.arc(157, bodyY - 40, 5, 0, 6.283); g.fill();
      if (!dying) {
        g.fillStyle = '#e9e2d2';
        for (let i = 0; i < 4; i++) {
          g.beginPath();
          g.moveTo(126 + i * 8, bodyY - 28);
          g.lineTo(130 + i * 8, bodyY - 18);
          g.lineTo(134 + i * 8, bodyY - 28);
          g.closePath(); g.fill();
        }
        g.fillStyle = '#7d2b26';
        g.fillRect(122, bodyY - 27, 32, 4);
      }
      /* ear + eye */
      g.fillStyle = '#2b1f14';
      g.beginPath();
      g.moveTo(96, bodyY - 58); g.lineTo(103, bodyY - 96); g.lineTo(120, bodyY - 58);
      g.closePath(); g.fill();
      g.fillStyle = '#7a5634';
      g.beginPath();
      g.moveTo(101, bodyY - 62); g.lineTo(104, bodyY - 88); g.lineTo(113, bodyY - 62);
      g.closePath(); g.fill();
      g.fillStyle = dying ? '#3a2a1a' : '#ffd36a';
      g.beginPath(); g.ellipse(124, bodyY - 50, 5, 4, 0, 0, 6.283); g.fill();
      /* near legs */
      leg(g, -36, bodyY + 22, this.gait, '#8a6239', dying);
      leg(g, 54, bodyY + 20, this.gait + 2.2, '#8a6239', dying);
      ctx.restore();

      if (this.hitFlash > 0) {
        ctx.save();
        ctx.globalAlpha = this.hitFlash * 3;
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,180,150,.5)';
        const b = this.box();
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.restore();
      }
    }
  };

  function leg(g, x, y, phase, color, still) {
    const sw = still ? 0 : Math.sin(phase);
    const kn = still ? -.9 : -.5 - Math.max(0, sw) * .7;
    g.save();
    g.translate(x, y);
    g.rotate(still ? 1.2 : sw * .85);
    g.strokeStyle = color; g.lineWidth = 17; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 36); g.stroke();
    g.translate(0, 36); g.rotate(kn);
    g.lineWidth = 12;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 36); g.stroke();
    g.fillStyle = '#1b1410';
    g.beginPath(); g.ellipse(5, 38, 13, 7, 0, 0, 6.283); g.fill();
    g.restore();
  }

  /* ============================ THE ENFORCER ============================ */
  CR.Boss = class Boss extends Actor {
    constructor(game, x) {
      super(game, x, 'boss', {
        hp: 1150, w: 130, h: 290, score: 500, type: 'boss', voice: 'boss', armored: true
      });
      this.scale = 1.58;
      this.state = 'approach';
      this.stateTimer = 1;
      this.fireCd = 1.6;
      this.chargeCd = 5;
      this.meleeCd = 0;
      this.contactCd = 0;
      this.name = 'THE ENFORCER';
    }

    onHurt(source, game) {
      if (M.chance(.15)) game.audio.play('bossGrunt');
    }

    hurt(amount, source, game, fromX) {
      if (this.state === 'recover') amount *= 1.6;   /* punish window */
      return CR.Actor.prototype.hurt.call(this, amount, source, game, fromX);
    }

    update(dt, game) {
      if (this.dying) { this.updateDying(dt, game); return; }
      const p = game.player;
      const d = this.x - p.x, dist = Math.abs(d);
      this.facing = d > 0 ? -1 : 1;
      this.contactCd = Math.max(0, this.contactCd - dt);
      this.stateTimer -= dt;
      this.fireCd -= dt;
      this.chargeCd -= dt;
      this.meleeCd = Math.max(0, this.meleeCd - dt);

      if (p.dead) {
        this.vx = 0; this.pose = CR.Poses.idle(this.stateT); this.physics(dt); return;
      }

      switch (this.state) {
        case 'approach': {
          const want = 430;
          this.vx = dist > want ? -Math.sign(d) * 260 : Math.sign(d) * 120;
          this.anim += dt * 1.15;
          this.pose = CR.Poses.run(this.anim, .75);
          if (dist < 220 && this.meleeCd <= 0) { this.setState('melee', .55); }
          else if (this.fireCd <= 0 && dist < 900) this.setState('aim', .7);
          else if (this.chargeCd <= 0 && dist > 300) this.setState('windup', .7);
          break;
        }
        case 'aim': {
          this.vx = M.damp(this.vx, 0, .0004, dt);
          this.pose = CR.Poses.aim(M.clamp(1 - this.stateTimer, 0, 1));
          if (this.stateTimer <= 0) {
            this.shotgun(game, p);
            this.fireCd = M.rand(2.6, 3.8);
            this.setState('approach', .4);
          }
          break;
        }
        case 'windup': {
          this.vx = M.damp(this.vx, Math.sign(d) * 90, .001, dt);
          this.pose = CR.Poses.melee(M.clamp(1 - this.stateTimer / .7, 0, 1) * .34);
          if (this.stateTimer <= 0) {
            this.chargeDir = d || 1;              /* commit to a direction */
            this.setState('charge', 1.1);
            game.audio.play('bossCharge');
            game.ui.toast('THE ENFORCER CHARGES', 1.1);
          }
          break;
        }
        case 'charge': {
          this.vx = -Math.sign(this.chargeDir || 1) * 640;
          this.anim += dt * 2.4;
          this.pose = CR.Poses.run(this.anim, 1.2);
          if (M.chance(dt * 30)) P.dust(this.x, CR.GROUND, 2, 1.1);
          if (this.stateTimer <= 0) {
            this.chargeCd = M.rand(6, 9);
            this.setState('recover', 1.1);      /* the punish window */
            game.audio.play('bossGrunt');
            P.dust(this.x, CR.GROUND, 10, 1.3);
          }
          break;
        }
        case 'recover': {
          /* winded after the charge: wide open, the player's cue to close in */
          this.vx = M.damp(this.vx, 0, .0006, dt);
          this.pose = CR.Poses.hit(.45 + Math.sin(this.stateT * 6) * .12);
          if (this.stateTimer <= 0) this.setState('approach', .5);
          break;
        }
        case 'melee': {
          this.vx = M.damp(this.vx, 0, .0008, dt);
          const k = 1 - this.stateTimer / .55;
          this.pose = CR.Poses.melee(k);
          if (k > .35 && k < .6 && this.meleeCd <= 0) {
            this.meleeCd = 2.2;
            const box = { x: this.x + (this.facing > 0 ? 0 : -260), y: this.y - 260, w: 260, h: 240 };
            if (C.overlap(box, p.box())) {
              p.hurt(18, game, this.x);
              p.vx = this.facing * 700;
              game.cam.shake(.45);
            }
            P.dust(this.x + this.facing * 160, CR.GROUND, 8, 1.2);
            game.audio.play('bossSwing');
          }
          if (this.stateTimer <= 0) this.setState('approach', .4);
          break;
        }
      }

      this.physics(dt);

      /* body-checking the player hurts */
      if (this.contactCd <= 0 && C.overlap(this.box(), p.box())) {
        this.contactCd = 1.1;
        const charging = this.state === 'charge';
        p.hurt(charging ? 14 : 8, game, this.x);
        p.vx = Math.sign(p.x - this.x || 1) * (charging ? 900 : 420);
        game.cam.shake(charging ? .45 : .25);
        if (charging) this.setState('recover', 1.1);
      }
    }

    draw(ctx) {
      /* hazard glow under the boss: he is lit differently from the street */
      const gl = ctx.createRadialGradient(this.x, this.y - 120, 0, this.x, this.y - 120, 260);
      gl.addColorStop(0, 'rgba(226,105,31,.16)');
      gl.addColorStop(1, 'rgba(226,105,31,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(this.x, this.y - 120, 260, 0, 6.283); ctx.fill();
      ctx.restore();
      CR.Actor.prototype.draw.call(this, ctx);
    }

    setState(s, t) { this.state = s; this.stateTimer = t; this.stateT = 0; }

    shotgun(game, p) {
      const y = this.y - 200 * this.scale * .75;
      const x = this.x + this.facing * 76;
      const base = Math.atan2((p.y - 150) - y, p.x - x);
      for (let i = -2; i <= 2; i++) {
        const a = base + i * .085;
        game.bullets.push(new CR.Bullet(x, y, Math.cos(a) * 1750, Math.sin(a) * 1750, 12, 'enemy',
          { color: '#ffc27a', len: 34 }));
      }
      CR.Weapons.muzzle(game, x, y, this.facing, 1.6);
      game.cam.shake(.22);
      game.audio.play('shotgun');
    }

    die(source, game, fromX) {
      super.die(source, game, fromX);
      game.cam.shake(.8);
      game.fx.addFlash(.3, [255, 190, 120]);
      game.slowmo(.9, .25);
      game.audio.play('bossDeath');
      P.gorePop(this.x, this.centerY(), 22, 1, CR.GROUND);
    }
  };

  /* ============================== the cars ============================== */
  CR.Car = class Car {
    constructor(game, x, type) {
      this.game = game;
      this.type = type || M.pick(['sedan', 'suv', 'van', 'taxi', 'pickup']);
      this.set = CR.Assets.cars[this.type][(Math.random() * CR.Assets.cars[this.type].length) | 0];
      this.x = x; this.y = CR.GROUND;
      this.scale = .94;
      this.hp = 60;
      this.state = 'clean';
      this.dead = false;
      this.lastSwing = -1;
      this.hitCd = 0;
      this.burning = 0;
      this.flash = 0;
      this.alarm = 0;
      this.tilt = 0;
    }
    box() {
      const w = this.set.w * this.scale, h = this.set.h * this.scale;
      return { x: this.x - w / 2, y: this.y - h + 10, w: w, h: h - 10 };
    }

    hurt(dmg, game, fromX) {
      if (this.dead) return;
      this.hp -= dmg;
      this.flash = .12;
      if (this.hp < 32 && this.state === 'clean') {
        this.state = 'damaged';
        this.alarm = 4;
        game.audio.play('carAlarm');
        P.glass(this.x, this.y - 120, 10, 1, CR.GROUND);
      }
      if (this.hp <= 0) this.explode(game);
    }

    explode(game, delay) {
      if (this.dead) return;
      this.dead = true;
      this.state = 'destroyed';
      this.burning = 1;
      CR.Weapons.explode(game, this.x, this.y - 80, {
        power: .8, radius: 330, damage: 120, playerDamage: 20,
        debrisColors: ['#2b2f36', '#6d7681', '#b9bec4', '#1a1d22']
      });
      game.stats.cars++;
    }

    update(dt, game) {
      this.flash = Math.max(0, this.flash - dt);
      this.hitCd = Math.max(0, this.hitCd - dt);
      if (this.alarm > 0) this.alarm -= dt;
      if (this.burning > 0) {
        this.burning -= dt * .06;
        if (M.chance(dt * 22)) P.fire(this.x + M.rand(-70, 70), this.y - 120, 1, .7);
        if (M.chance(dt * 10)) P.smoke(this.x + M.rand(-60, 60), this.y - 150, 1, 1.5, { vy: -160, alpha: .4 });
      }
      /* running into a car hurts and stops you dead */
      const p = game.player;
      if (!this.dead && this.hitCd <= 0 && !p.dead && CR.Collide.overlap(this.box(), p.box())) {
        this.hitCd = 1.1;
        p.hurt(14, game, this.x - 300);
        p.vx = -420;
        p.x -= 30;
        this.flash = .15;
        P.sparks(p.x + 60, p.y - 140, 10, '#ffd9a0');
        game.audio.play('thud');
      }
    }

    draw(ctx) {
      const w = this.set.w * this.scale, h = this.set.h * this.scale;
      const img = this.set[this.state];
      CR.Rig.shadow(ctx, this.x, CR.GROUND + 10, w * .5, .9);
      ctx.save();
      ctx.translate(this.x, this.y + 6);
      ctx.drawImage(img, -w / 2, -h, w, h);
      if (this.flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = this.flash * 3;
        ctx.drawImage(img, -w / 2, -h, w, h);
      }
      ctx.restore();
      /* hazard flashers while the alarm is going */
      if (this.alarm > 0 && Math.sin(this.alarm * 18) > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g2 = ctx.createRadialGradient(this.x + w * .42, this.y - h * .52, 0, this.x + w * .42, this.y - h * .52, 90);
        g2.addColorStop(0, 'rgba(255,170,60,.6)');
        g2.addColorStop(1, 'rgba(255,150,40,0)');
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.arc(this.x + w * .42, this.y - h * .52, 90, 0, 6.283); ctx.fill();
        ctx.restore();
      }
    }
  };

  /* ============================== pickups =============================== */
  const PICKUP_DEF = {
    ammo: { img: 'pu_ammo', label: '+ AMMO', color: '#ffd479', apply: (p) => { p.ammo = Math.min(p.maxAmmo, p.ammo + 12); } },
    fuel: { img: 'pu_fuel', label: '+ FUEL', color: '#ff7a4a', apply: (p) => { p.fuel = Math.min(p.maxFuel, p.fuel + 60); } },
    med: { img: 'pu_med', label: '+ HEALTH', color: '#7fe08a', apply: (p) => { p.heal(45); } },
    bomb: { img: 'pu_bomb', label: '+ EXPLOSIVE', color: '#ff5436', apply: (p) => { p.explosives++; } }
  };

  CR.Pickup = class Pickup {
    constructor(game, x, kind) {
      this.x = x; this.y = CR.GROUND - 40;
      this.kind = kind;
      this.def = PICKUP_DEF[kind];
      this.t = M.rand(0, 6.283);
      this.dead = false;
    }
    box() { return { x: this.x - 60, y: this.y - 80, w: 120, h: 120 }; }
    update(dt, game) {
      this.t += dt;
      const p = game.player;
      if (p.dead) return;
      const d = M.dist(this.x, this.y, p.x, p.y - 120);
      if (d < 220) {                       /* magnet */
        this.x = M.damp(this.x, p.x, .002, dt);
        this.y = M.damp(this.y, p.y - 120, .002, dt);
      }
      if (CR.Collide.overlap(this.box(), p.box())) this.collect(game);
    }
    collect(game) {
      this.dead = true;
      this.def.apply(game.player);
      game.ui.float(this.x, this.y - 60, this.def.label, this.def.color);
      game.audio.play('pickup');
      P.sparks(this.x, this.y, 12, this.def.color, .7);
      P.flash(this.x, this.y, 220, .18);
      game.stats.pickups++;
    }
    draw(ctx) {
      const img = CR.Assets.img[this.def.img];
      const bob = Math.sin(this.t * 2.6) * 9;
      const s = 1.5;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(this.x, this.y + bob, 0, this.x, this.y + bob, 130);
      glow.addColorStop(0, 'rgba(255,214,160,.26)');
      glow.addColorStop(.45, 'rgba(255,178,110,.10)');
      glow.addColorStop(1, 'rgba(255,170,100,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(this.x, this.y + bob, 130, 0, 6.283); ctx.fill();
      ctx.restore();
      CR.Rig.shadow(ctx, this.x, CR.GROUND + 6, 46, .8);
      ctx.drawImage(img.img, this.x - img.w * s / 2, this.y + bob - img.h * s / 2, img.w * s, img.h * s);
    }
  };
})();

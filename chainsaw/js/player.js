/* ============================================================================
   player.js — the chainsaw man himself: movement, state machine, the two
   weapons, explosives, damage and death.

   The character is an auto-runner: he runs right on his own except where the
   level locks the camera (boss, arena), and left/right then becomes free
   movement. Every state maps to a pose from CR.Poses, blended by the rig.
   ========================================================================== */
(function () {
  'use strict';
  const CR = window.CR, M = CR.M, P = CR.Particles, G = 0;

  const GRAVITY = 3200;
  const JUMP_V = 1400;

  CR.Player = class Player {
    constructor(game, x) {
      this.game = game;
      this.kit = CR.Rig.kit('player');
      this.x = x; this.y = CR.GROUND;
      this.vx = 0; this.vy = 0;
      this.facing = 1;
      this.onGround = true;

      this.maxHp = 100; this.hp = 100;
      this.maxFuel = 100; this.fuel = 100;
      this.maxAmmo = 60; this.ammo = 14;
      this.explosives = 1;

      this.state = 'run';
      this.anim = 0;                 /* run-cycle phase          */
      this.stateT = 0;
      this.chainPhase = 0;           /* chain teeth animation    */
      this.sawSpin = 0;              /* 0..1 how hard it's revving */

      this.attackT = 0; this.attackCd = 0; this.swingId = 0;
      this.shootCd = 0; this.shootFlash = 0;
      this.slideT = 0;
      this.hitT = 0; this.invuln = 0;
      this.deadT = 0; this.dead = false;
      this.coyote = 0; this.jumpBuf = 0;
      this.landT = 0;
      this.bloodiness = 0;           /* shirt gets worse as the level goes on */
      this.pose = CR.Poses.idle(0);
      this.runSpeed = 430;
    }

    get airborne() { return !this.onGround; }
    get sliding() { return this.slideT > 0; }

    box() {
      const h = this.sliding ? 120 : 250;
      return { x: this.x - 46, y: this.y - h, w: 92, h: h };
    }
    /* the arc the chainsaw sweeps through — generous, it should feel strong */
    attackBox() {
      return this.sliding
        ? { x: this.x + (this.facing > 0 ? 10 : -230), y: this.y - 130, w: 220, h: 130 }
        : { x: this.x + (this.facing > 0 ? 20 : -290), y: this.y - 250, w: 270, h: 230 };
    }
    centerY() { return this.y - 150; }

    /* ------------------------------- input ------------------------------ */
    update(dt, game) {
      const inp = game.input;
      if (this.dead) { this.updateDead(dt, game); return; }

      this.stateT += dt;
      this.invuln = Math.max(0, this.invuln - dt);
      this.attackCd = Math.max(0, this.attackCd - dt);
      this.shootCd = Math.max(0, this.shootCd - dt);
      this.shootFlash = Math.max(0, this.shootFlash - dt);
      this.hitT = Math.max(0, this.hitT - dt);
      this.landT = Math.max(0, this.landT - dt);

      const locked = game.combatLock;
      const control = !game.cinematic;

      /* ---- horizontal ---- */
      let target = 0;
      if (locked) {
        if (control && inp.held('right')) target += 520;
        if (control && inp.held('left')) target -= 480;
        if (target !== 0) this.facing = target > 0 ? 1 : -1;
      } else {
        target = this.runSpeed;
        if (control && inp.held('right')) target += 170;
        if (control && inp.held('left')) target -= 300;
        this.facing = 1;
      }
      if (this.sliding) target *= 1.25;
      this.vx = M.damp(this.vx, target, 0.0005, dt);
      this.x += this.vx * dt;

      if (game.cinematic === 'escape') this.x += 150 * dt;

      /* keep the runner inside the camera's comfort zone */
      const v = game.cam.view();
      this.x = M.clamp(this.x, v.left + 150, v.right - 220);
      if (game.levelBounds) this.x = M.clamp(this.x, game.levelBounds[0], game.levelBounds[1]);

      /* ---- jump ---- */
      if (this.onGround) this.coyote = 0.1; else this.coyote = Math.max(0, this.coyote - dt);
      if (control && inp.pressed('jump')) this.jumpBuf = 0.14;
      else this.jumpBuf = Math.max(0, this.jumpBuf - dt);

      if (this.jumpBuf > 0 && this.coyote > 0 && !this.sliding) {
        this.vy = -JUMP_V;
        this.onGround = false;
        this.coyote = 0; this.jumpBuf = 0;
        game.audio.play('jump');
        P.dust(this.x, CR.GROUND, 7, .8);
      }
      if (!inp.held('jump') && this.vy < -420) this.vy += 2600 * dt;   /* variable height */

      this.vy += GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y >= CR.GROUND) {
        if (!this.onGround) {
          const impact = M.clamp(this.vy / 1500, 0, 1.4);
          P.dust(this.x, CR.GROUND, 4 + impact * 8, .7 + impact * .5);
          if (impact > .5) { game.cam.shake(.07 * impact); game.audio.play('land'); }
          this.landT = .18;
        }
        this.y = CR.GROUND; this.vy = 0; this.onGround = true;
      } else this.onGround = false;

      /* ---- slide ---- */
      if (this.slideT > 0) {
        this.slideT -= dt;
        if (!this.onGround) this.slideT = 0;
        if (M.chance(dt * 26)) P.dust(this.x - 40 * this.facing, CR.GROUND, 1, .5);
      } else if (control && this.onGround && inp.pressed('slide')) {
        this.slideT = .62;
        game.audio.play('slide');
        P.dust(this.x, CR.GROUND, 8, .9);
      }

      /* ---- chainsaw ---- */
      if (control && inp.held('attack') && this.attackCd <= 0) this.startAttack(game);
      if (this.attackT > 0) {
        this.attackT -= dt;
        const k = 1 - this.attackT / this.attackDur;
        if (k > .28 && k < .66) this.sweep(game);
        this.sawSpin = 1;
      } else {
        this.sawSpin = M.damp(this.sawSpin, 0.22, 0.002, dt);
      }
      this.chainPhase += dt * (14 + this.sawSpin * 60);
      game.audio.sawLevel(this.dead ? 0 : (this.attackT > 0 ? 1 : .3), this.fuel > 0);

      /* ---- pistol ---- */
      if (control && inp.held('shoot') && this.shootCd <= 0) this.shoot(game);

      /* ---- explosives ---- */
      if (control && inp.pressed('plant')) this.tryPlant(game);

      /* fuel slowly trickles back so the player is never fully toothless */
      this.fuel = Math.min(this.maxFuel, this.fuel + 1.6 * dt);

      this.updateState(dt);
    }

    /* ---------------------------- state/anim ---------------------------- */
    updateState(dt) {
      const speed = Math.abs(this.vx);
      this.anim += dt * M.clamp(speed / 330, .3, 2.1) * 1.55;

      let st;
      if (this.hitT > 0) st = 'hit';
      else if (this.sliding) st = 'slide';
      else if (!this.onGround) st = this.vy < 0 ? 'jump' : 'fall';
      else if (this.landT > 0) st = 'land';
      else if (this.attackT > 0) st = 'attack';
      else if (this.shootFlash > 0) st = 'shoot';
      else if (speed > 60) st = 'run';
      else st = 'idle';
      this.state = st;

      let target;
      switch (st) {
        case 'hit': target = CR.Poses.hit(1 - this.hitT / .32); break;
        case 'slide': target = CR.Poses.slide(1 - this.slideT / .62); break;
        case 'jump': case 'fall': target = CR.Poses.jump(this.vy, this.stateT); break;
        case 'land': target = CR.Poses.land(1 - this.landT / .18); break;
        case 'attack': target = CR.Poses.attack(1 - this.attackT / this.attackDur); break;
        case 'shoot': target = CR.Poses.shoot(.12 - this.shootFlash, this.anim); break;
        case 'run': target = CR.Poses.run(this.anim, M.clamp(speed / 430, .6, 1.2)); break;
        default: target = CR.Poses.idle(this.stateT);
      }
      /* fast states snap, locomotion blends */
      const blend = (st === 'attack' || st === 'hit' || st === 'slide') ? 1 : M.clamp(dt * 22, 0, 1);
      this.pose = blend >= 1 ? target : CR.Rig.blend(this.pose, target, blend);
    }

    /* ------------------------------ attacks ----------------------------- */
    startAttack(game) {
      /* In a locked fight, swinging with no direction held should not whiff at
         thin air: turn toward whatever is closest and in range. */
      if (game.combatLock && !game.input.held('left') && !game.input.held('right')) {
        let best = null, bestD = 620;
        for (const e of game.enemies) {
          if (e.dead || e.dying) continue;
          const d = Math.abs(e.x - this.x);
          if (d < bestD) { bestD = d; best = e; }
        }
        if (best) this.facing = best.x >= this.x ? 1 : -1;
      }
      const dry = this.fuel <= 0;
      this.attackDur = dry ? .46 : .30;
      this.attackT = this.attackDur;
      this.attackCd = dry ? .58 : .34;
      this.swingId++;
      this.fuel = Math.max(0, this.fuel - 4.5);
      game.audio.sawRev();
      game.cam.shake(.05);
      /* the arc the bar carves through the air */
      P.streak(this.x + this.facing * 60, this.y - 170, this.facing > 0 ? -.5 : Math.PI + .5,
        260, .18, 'rgba(255,246,214,.5)');
    }

    sweep(game) {
      const box = this.attackBox();
      const dry = this.fuel <= 0;
      const dmg = dry ? 14 : 34;
      for (const e of game.enemies) {
        if (e.dead || e.dying || e.lastSwing === this.swingId) continue;
        if (!CR.Collide.overlap(box, e.box())) continue;
        e.lastSwing = this.swingId;
        const hy = M.clamp(this.y - 150, e.y - e.h, e.y - 40);
        e.hurt(dmg, 'chainsaw', game, this.x);
        e.knock(this.facing * (dry ? 160 : 420), -180);
        /* meat contact: blood spray toward the camera, sparks off armour */
        P.blood(e.x - this.facing * 20, hy, e.armored ? 4 : 16, this.facing, 1.3, CR.GROUND);
        if (e.armored) P.sparks(e.x - this.facing * 20, hy, 14, '#ffd9a0', 1.4);
        game.cam.shake(.16);
        game.fx.addAberration(.12);
        game.audio.play(e.armored ? 'sawArmor' : 'sawHit');
        game.slowmo(.05, .45);
        this.bloodiness = Math.min(1, this.bloodiness + .05);
      }
      for (const c of game.cars) {
        if (c.dead || c.lastSwing === this.swingId) continue;
        if (!CR.Collide.overlap(box, c.box())) continue;
        c.lastSwing = this.swingId;
        c.hurt(18, game, this.x);
        P.sparks(this.x + this.facing * 110, this.y - 120, 16, '#ffd9a0', 1.6);
        game.cam.shake(.1);
        game.audio.play('sawArmor');
      }
    }

    shoot(game) {
      if (this.ammo <= 0) {
        this.shootCd = .3;
        game.audio.play('dryfire');
        game.ui.toast('OUT OF AMMO', .8);
        return;
      }
      this.ammo--;
      this.shootCd = .21;
      this.shootFlash = .1;
      const y = this.y - (this.sliding ? 96 : 168);
      const x = this.x + this.facing * 60;
      game.bullets.push(new CR.Bullet(x, y, this.facing * 3100, M.rand(-24, 24), 42, 'player'));
      CR.Weapons.muzzle(game, x, y, this.facing);
      P.shell(x - this.facing * 14, y - 6, this.facing);
      game.cam.shake(.07);
      game.fx.addFlash(.10, [255, 214, 150]);
      game.audio.play('pistol');
    }

    tryPlant(game) {
      const b = game.level.buildingInZone(this.x);
      if (!b) { game.ui.toast('NO PLACEMENT POINT', .9); game.audio.play('dryfire'); return; }
      if (this.explosives <= 0) { game.ui.toast('NO EXPLOSIVES', 1); game.audio.play('dryfire'); return; }
      this.explosives--;
      b.arm(game);
      game.onChargePlanted(b);
    }

    /* ------------------------------ damage ------------------------------ */
    hurt(amount, game, fromX) {
      if (this.dead || this.invuln > 0) return false;
      this.hp -= amount;
      this.invuln = .85;
      this.hitT = .32;
      this.bloodiness = Math.min(1, this.bloodiness + .08);
      P.blood(this.x, this.y - 160, 12, fromX > this.x ? -1 : 1, 1, CR.GROUND);
      game.cam.shake(.3);
      game.fx.addFlash(.22, [200, 40, 30]);
      game.fx.addAberration(.35);
      game.audio.play('playerHurt');
      game.breakCombo();
      game.hurtFlash = 1;
      if (this.hp <= 0) { this.hp = 0; this.die(game); }
      return true;
    }

    heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }

    die(game) {
      this.dead = true;
      this.deadT = 0;
      this.vy = -700;
      this.vx = -120;
      P.blood(this.x, this.y - 170, 30, -1, 1.6, CR.GROUND);
      game.audio.sawLevel(0);
      game.audio.play('death');
      game.cam.shake(.7);
      game.fx.addFlash(.4, [180, 20, 20]);
      game.onPlayerDead();
    }

    updateDead(dt, game) {
      this.deadT += dt;
      this.vy += GRAVITY * dt;
      this.y = Math.min(CR.GROUND, this.y + this.vy * dt);
      if (this.y >= CR.GROUND) { this.y = CR.GROUND; this.vy = 0; }
      this.x += this.vx * dt;
      this.vx = M.damp(this.vx, 0, .0002, dt);
      this.pose = CR.Poses.death(M.clamp(this.deadT / .9, 0, 1));
      this.sawSpin = Math.max(0, this.sawSpin - dt);
      this.chainPhase += dt * 10 * this.sawSpin;
      if (M.chance(dt * 6)) P.blood(this.x + M.rand(-40, 40), CR.GROUND - 20, 3, 0, .5, CR.GROUND);
    }

    /* ------------------------------ render ------------------------------ */
    draw(ctx, game) {
      const alpha = this.invuln > 0 && !this.dead
        ? (Math.floor(this.invuln * 24) % 2 ? .35 : 1) : 1;

      CR.Rig.shadow(ctx, this.x, CR.GROUND + 8,
        92 * (this.onGround ? 1 : M.clamp(1 - (CR.GROUND - this.y) / 700, .35, 1)),
        this.onGround ? 1 : .55);

      CR.Rig.draw(ctx, this.x, this.y, {
        kit: this.kit, pose: this.pose, scale: 1, facing: this.facing,
        chainPhase: this.chainPhase, spinning: this.sawSpin > .5, alpha: alpha
      });

      /* blood soaking into the shirt as the rampage goes on */
      if (this.bloodiness > .05 && !this.dead) {
        ctx.save();
        ctx.globalAlpha = Math.min(.5, this.bloodiness * .5) * alpha;
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = '#8e1a16';
        ctx.beginPath();
        ctx.ellipse(this.x + this.facing * 6, this.y - 210, 34, 44, 0, 0, 6.283);
        ctx.fill();
        ctx.restore();
      }

      /* exhaust smoke + heat shimmer from the motor while revving */
      if (this.sawSpin > .8 && M.chance(.3)) {
        P.smoke(this.x + this.facing * 26, this.y - 268, 1, .30, { vy: -70, alpha: .2, lifeScale: .5 });
      }
    }
  };
})();

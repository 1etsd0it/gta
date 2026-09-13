/* =============================================================================
 *  character.js — низкополигональный «риг» персонажа из примитивов
 *  и процедурная анимация (покой, ходьба, бег, стрельба, посадка в авто, смерть).
 *  Готовых риггованных моделей нет, поэтому скелет собран из боксов,
 *  а все позы считаются кодом — это даёт плавные переходы без ассетов.
 * ========================================================================== */
(function () {
  'use strict';
  const GTA = window.GTA, U = GTA.Utils;

  function mat(color, rough, metal) {
    return new THREE.MeshStandardMaterial({
      color, roughness: rough === undefined ? 0.75 : rough,
      metalness: metal === undefined ? 0.08 : metal
    });
  }
  function box(w, h, d, m, x, y, z) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    g.position.set(x || 0, y || 0, z || 0);
    g.castShadow = true;
    return g;
  }

  /** Винтовка из боксов — общая для игрока и NPC. */
  function buildRifle(color) {
    const g = new THREE.Group();
    const body = mat(color || 0x23262b, 0.55, 0.55);
    const wood = mat(0x4a3a2b, 0.8, 0.05);
    g.add(box(0.09, 0.1, 0.72, body, 0, 0, -0.12));
    g.add(box(0.07, 0.07, 0.34, body, 0, 0.02, -0.55));   // ствол
    g.add(box(0.1, 0.2, 0.16, wood, 0, -0.12, 0.06));      // рукоять
    g.add(box(0.1, 0.13, 0.26, wood, 0, -0.01, 0.3));      // приклад
    g.add(box(0.07, 0.22, 0.09, body, 0, -0.14, -0.14));   // магазин
    const sight = box(0.04, 0.06, 0.05, body, 0, 0.09, -0.3);
    g.add(sight);
    return g;
  }

  class Character {
    /**
     * @param {object} o  {skin, shirt, pants, vest, hair, armed}
     */
    constructor(o) {
      o = o || {};
      const skinM = mat(o.skin || 0xc99e72, 0.85, 0);
      const shirtM = mat(o.shirt || 0x2f3f2a, 0.85, 0.02);
      const pantsM = mat(o.pants || 0x25292e, 0.9, 0.02);
      const shoeM = mat(0x15171a, 0.8, 0.05);
      const vestM = o.vest ? mat(o.vest, 0.7, 0.15) : null;

      const root = this.root = new THREE.Group();

      const hips = this.hips = new THREE.Group();
      hips.position.y = 0.92;
      root.add(hips);

      const torso = this.torso = new THREE.Group();
      hips.add(torso);
      const chest = box(0.5, 0.62, 0.28, shirtM, 0, 0.31, 0);
      torso.add(chest);
      if (vestM) {
        const v = box(0.55, 0.44, 0.34, vestM, 0, 0.34, 0);
        torso.add(v);
      }

      const neck = box(0.14, 0.1, 0.14, skinM, 0, 0.66, 0);
      torso.add(neck);
      const head = this.head = new THREE.Group();
      head.position.y = 0.78;
      torso.add(head);
      head.add(box(0.26, 0.3, 0.25, skinM, 0, 0, 0));
      const hairM = mat(o.hair || 0x24201d, 0.95, 0);
      head.add(box(0.28, 0.1, 0.27, hairM, 0, 0.13, -0.005));
      if (o.cap) head.add(box(0.3, 0.07, 0.32, mat(o.cap, 0.8, 0.05), 0, 0.17, -0.04));

      // руки: плечо -> предплечье
      const mkArm = (side) => {
        const shoulder = new THREE.Group();
        shoulder.position.set(side * 0.32, 0.56, 0);
        torso.add(shoulder);
        const upper = box(0.15, 0.32, 0.16, shirtM, 0, -0.16, 0);
        shoulder.add(upper);
        const elbow = new THREE.Group();
        elbow.position.y = -0.32;
        shoulder.add(elbow);
        const fore = box(0.13, 0.32, 0.14, skinM, 0, -0.16, 0);
        elbow.add(fore);
        const hand = new THREE.Group();
        hand.position.y = -0.33;
        elbow.add(hand);
        return { shoulder, elbow, hand };
      };
      this.armR = mkArm(1);
      this.armL = mkArm(-1);

      const mkLeg = (side) => {
        const hip = new THREE.Group();
        hip.position.set(side * 0.14, 0, 0);
        hips.add(hip);
        hip.add(box(0.19, 0.46, 0.19, pantsM, 0, -0.23, 0));
        const knee = new THREE.Group();
        knee.position.y = -0.46;
        hip.add(knee);
        knee.add(box(0.17, 0.42, 0.17, pantsM, 0, -0.21, 0));
        const foot = box(0.18, 0.11, 0.3, shoeM, 0, -0.46, 0.05);
        knee.add(foot);
        return { hip, knee, foot };
      };
      this.legR = mkLeg(1);
      this.legL = mkLeg(-1);

      if (o.armed !== false) {
        this.rifle = buildRifle(o.gunColor);
        this.armR.hand.add(this.rifle);
        this.rifle.position.set(0, -0.06, -0.08);
        this.rifle.rotation.set(Math.PI / 2, 0, 0);
      }

      root.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = false; } });

      this.phase = 0;
      this.aimBlend = 0;
      this.seatBlend = 0;
      this.muzzleOffset = new THREE.Vector3();
      this.kick = 0;
    }

    /** Мировая позиция дульного среза — оттуда летит трассер. */
    muzzleWorld(out) {
      if (this.rifle) {
        this.rifle.updateWorldMatrix(true, false);
        out.set(0, 0, -0.62).applyMatrix4(this.rifle.matrixWorld);
      } else {
        this.root.getWorldPosition(out);
        out.y += 1.4;
      }
      return out;
    }

    /**
     * @param {number} dt
     * @param {object} s  {speed, maxSpeed, aiming, pitch, seated, dead, deadT, hurt}
     */
    update(dt, s) {
      const speed01 = U.clamp((s.speed || 0) / (s.maxSpeed || 6.5), 0, 1.4);
      const seated = s.seated ? 1 : 0;
      const aiming = (s.aiming && !s.seated) ? 1 : 0;
      this.seatBlend = U.damp(this.seatBlend, seated, 9, dt);
      this.aimBlend = U.damp(this.aimBlend, aiming, 14, dt);
      this.kick = Math.max(0, this.kick - dt * 7);

      if (s.dead) { this._poseDead(s.deadT || 0, dt); return; }

      const a = this.aimBlend, st = this.seatBlend, walk = (1 - st);
      // фаза шага зависит от скорости
      this.phase += dt * (2.2 + speed01 * 7.5) * (speed01 > 0.02 ? 1 : 0.35);
      const p = this.phase;
      const amp = U.lerp(0.06, 0.75, U.clamp(speed01, 0, 1)) * walk;
      const swing = Math.sin(p) * amp;
      const swing2 = Math.sin(p + Math.PI) * amp;
      const bob = Math.abs(Math.sin(p)) * 0.05 * speed01 * walk;

      // ноги
      this.legR.hip.rotation.x = U.lerp(swing, -1.45, st);
      this.legL.hip.rotation.x = U.lerp(swing2, -1.45, st);
      this.legR.knee.rotation.x = U.lerp(Math.max(0, -swing) * 1.1 + 0.05, 1.5, st);
      this.legL.knee.rotation.x = U.lerp(Math.max(0, -swing2) * 1.1 + 0.05, 1.5, st);
      this.legR.hip.rotation.z = U.lerp(0, -0.12, st);
      this.legL.hip.rotation.z = U.lerp(0, 0.12, st);

      // корпус
      this.hips.position.y = 0.92 + bob - st * 0.16;
      this.torso.rotation.x = U.lerp(speed01 * 0.18, 0.12, st) * (1 - a * 0.5);
      this.torso.rotation.z = Math.sin(p) * 0.03 * walk;
      this.torso.rotation.y = U.lerp(0, -0.18, a);

      const pitch = U.clamp(s.pitch || 0, -0.9, 0.9);

      // руки: бег / прицел / руль
      const runR = -swing2 * 0.9 - 0.1, runL = -swing * 0.9 - 0.1;
      const aimShoulderX = -1.35 + pitch * 0.8;
      const wheelX = -1.15;

      const rx = U.lerp(U.lerp(runR, aimShoulderX, a), wheelX, st);
      const lx = U.lerp(U.lerp(runL, aimShoulderX + 0.05, a), wheelX, st);

      this.armR.shoulder.rotation.x = rx + this.kick * 0.45;
      this.armL.shoulder.rotation.x = lx;
      this.armR.shoulder.rotation.z = U.lerp(U.lerp(-0.12, -0.16, a), -0.34, st);
      this.armL.shoulder.rotation.z = U.lerp(U.lerp(0.12, 0.62, a), 0.34, st);
      this.armR.shoulder.rotation.y = U.lerp(0, 0.18, a);
      this.armL.shoulder.rotation.y = U.lerp(0, -0.55, a);
      this.armR.elbow.rotation.x = U.lerp(U.lerp(-0.5 - Math.abs(swing) * 0.5, -0.45, a), -1.1, st);
      this.armL.elbow.rotation.x = U.lerp(U.lerp(-0.5 - Math.abs(swing2) * 0.5, -0.9, a), -1.1, st);

      // голова следит за прицелом
      this.head.rotation.x = U.lerp(-speed01 * 0.05, pitch * 0.55, a);
      this.root.rotation.z = 0;
      this.root.rotation.x = 0;
    }

    _poseDead(t, dt) {
      const k = U.clamp(t / 0.65, 0, 1);
      this.root.rotation.x = -k * Math.PI / 2 * 0.92;
      this.hips.position.y = 0.92 - k * 0.45;
      this.armR.shoulder.rotation.x = U.damp(this.armR.shoulder.rotation.x, 0.7, 6, dt);
      this.armL.shoulder.rotation.x = U.damp(this.armL.shoulder.rotation.x, 0.7, 6, dt);
      this.armR.shoulder.rotation.z = U.damp(this.armR.shoulder.rotation.z, -1.1, 6, dt);
      this.armL.shoulder.rotation.z = U.damp(this.armL.shoulder.rotation.z, 1.1, 6, dt);
      this.legR.hip.rotation.x = U.damp(this.legR.hip.rotation.x, 0.25, 6, dt);
      this.legL.hip.rotation.x = U.damp(this.legL.hip.rotation.x, -0.15, 6, dt);
      this.legR.knee.rotation.x = U.damp(this.legR.knee.rotation.x, 0.3, 6, dt);
      this.legL.knee.rotation.x = U.damp(this.legL.knee.rotation.x, 0.5, 6, dt);
      this.torso.rotation.x = U.damp(this.torso.rotation.x, 0.1, 6, dt);
    }

    recoil() { this.kick = 1; }

    dispose() {
      this.root.traverse((c) => {
        if (c.isMesh) { c.geometry.dispose(); }
      });
      if (this.root.parent) this.root.parent.remove(this.root);
    }
  }

  GTA.Character = Character;
  GTA.buildRifle = buildRifle;
})();

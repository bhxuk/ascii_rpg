import * as THREE from 'three';
import { SET, tagMaterial } from '../ascii/glyphs.js';
import { buildKnight, buildSkeleton, animateRig } from './models.js';
import { env, insidePond, WORLD_RADIUS } from '../world/env.js';

const ATTACK_TIME = 0.55;

/** Push a circle out of every obstacle, the pond and the world edge. */
export function resolveCollisions(pos, radius) {
  for (const o of env.obstacles) {
    const dx = pos.x - o.x;
    const dz = pos.z - o.z;
    const min = o.r + radius;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x = o.x + (dx / d) * min;
      pos.z = o.z + (dz / d) * min;
    }
  }
  if (insidePond(pos.x, pos.z, radius)) {
    const p = env.pond;
    const a = Math.atan2((pos.z - p.z) / p.rz, (pos.x - p.x) / p.rx);
    pos.x = p.x + Math.cos(a) * (p.rx + radius + 0.01);
    pos.z = p.z + Math.sin(a) * (p.rz + radius + 0.01);
  }
  const r = Math.hypot(pos.x, pos.z);
  const lim = WORLD_RADIUS - 2;
  if (r > lim) { pos.x *= lim / r; pos.z *= lim / r; }
}

/** Glowing arc left behind by a sword swing. */
function createSlash(full = false) {
  const geo = full
    ? new THREE.RingGeometry(1.2, 2.9, 40)
    : new THREE.RingGeometry(1.0, 1.9, 24, 1, -Math.PI * 0.45, Math.PI * 0.9);
  const mat = tagMaterial(new THREE.MeshBasicMaterial({ color: 0xcfe4ff, side: THREE.DoubleSide }), SET.GLOW);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 1.0;
  mesh.visible = false;
  return mesh;
}

export class Player {
  constructor(scene, spawn, name = 'Sir Aldric') {
    this.name = name;
    this.rig = buildKnight();
    this.object = this.rig.root;
    this.object.position.copy(spawn);
    scene.add(this.object);

    this.level = 1;
    this.maxHp = 200; this.hp = 200;
    this.maxMp = 80; this.mp = 80;
    this.xp = 0; this.xpNext = 300;
    this.gold = 0;
    this.potions = 3;
    this.power = 1; // damage multiplier, grows with level

    this.facing = 0;
    this.velocity = new THREE.Vector3();
    this.walk = 0;
    this.phase = 0;
    this.attackT = -1;
    this.hitDone = false;
    this.spinT = -1;
    this.hurtFlash = 0;
    this.radius = 0.4;

    this.slash = createSlash();
    this.object.add(this.slash);
    this.spinRing = createSlash(true);
    this.object.add(this.spinRing);

    // A warm lantern glow around the knight so the meadow lights up as you walk.
    this.light = new THREE.PointLight(0xffb070, 14, 13, 1.7);
    this.light.position.set(0.6, 2.4, 0.4);
    this.object.add(this.light);
    this.lightRef = { position: new THREE.Vector3(), color: new THREE.Color(0xffb070), intensity: 0.55, range: 9 };
    env.lights.unshift(this.lightRef);
    this.shadow = { x: 0, z: 0, r: 0.75, strength: 0.6 };
    env.shadows.unshift(this.shadow);
  }

  get position() { return this.object.position; }
  get alive() { return this.hp > 0; }
  get busy() { return this.attackT >= 0 || this.spinT >= 0; }

  attack() {
    if (this.busy) return false;
    this.attackT = 0;
    this.hitDone = false;
    return true;
  }

  spin() {
    if (this.busy) return false;
    this.spinT = 0;
    this.hitDone = false;
    return true;
  }

  update(dt, input, cameraYaw) {
    // Movement relative to the camera's facing.
    const ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const iz = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const run = input.run ? 1.75 : 1;
    const speed = 4.2 * run * (this.attackT >= 0 ? 0.35 : 1);
    const move = new THREE.Vector3(ix, 0, iz);
    if (move.lengthSq() > 0) {
      move.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraYaw);
      const target = Math.atan2(move.x, move.z);
      let diff = target - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.facing += diff * Math.min(1, dt * 12);
    }
    this.velocity.lerp(move.multiplyScalar(speed), Math.min(1, dt * 10));
    this.position.addScaledVector(this.velocity, dt);
    resolveCollisions(this.position, this.radius);

    const sp = this.velocity.length();
    this.walk = THREE.MathUtils.lerp(this.walk, Math.min(1, sp / 4.2), Math.min(1, dt * 8));
    this.phase += dt * (5 + sp * 1.3);

    let attack = -1;
    let spinAngle = 0;
    if (this.attackT >= 0) {
      this.attackT += dt / ATTACK_TIME;
      attack = this.attackT;
      const slashVisible = attack > 0.38 && attack < 0.7;
      this.slash.visible = slashVisible;
      if (slashVisible) {
        const k = (attack - 0.38) / 0.32;
        this.slash.scale.setScalar(0.8 + k * 0.35);
        this.slash.rotation.z = Math.PI / 2 - 1.2 + k * 1.6;
      }
      if (this.attackT >= 1) { this.attackT = -1; this.slash.visible = false; }
    }
    if (this.spinT >= 0) {
      this.spinT += dt / 0.65;
      spinAngle = this.spinT * Math.PI * 4;
      attack = 0.5; // sword held out level
      this.spinRing.visible = this.spinT > 0.1 && this.spinT < 0.9;
      this.spinRing.scale.setScalar(0.7 + this.spinT * 0.5);
      if (this.spinT >= 1) { this.spinT = -1; this.spinRing.visible = false; }
    }
    this.object.rotation.y = this.facing + spinAngle;
    animateRig(this.rig, { walk: this.walk, phase: this.phase, attack, idle: env.time });

    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3);
    if (this.alive) {
      this.hp = Math.min(this.maxHp, this.hp + dt * 2);
      this.mp = Math.min(this.maxMp, this.mp + dt * 4);
    }

    this.object.getWorldPosition(this.lightRef.position);
    this.lightRef.position.y += 2.4;
    this.shadow.x = this.position.x - 0.35;
    this.shadow.z = this.position.z + 0.45;
    env.player.copy(this.position);
  }

  /** True once per swing, at the moment the blade connects. */
  strikeWindow() {
    if (this.attackT > 0.42 && !this.hitDone) { this.hitDone = true; return 'slash'; }
    if (this.spinT > 0.35 && !this.hitDone) { this.hitDone = true; return 'spin'; }
    return null;
  }

  /** Plain data for saving progress. */
  serialize() {
    const { level, xp, xpNext, maxHp, maxMp, gold, potions, power } = this;
    return { level, xp, xpNext, maxHp, maxMp, gold, potions, power };
  }

  restore(data) {
    Object.assign(this, data);
    this.hp = this.maxHp;
    this.mp = this.maxMp;
  }
}

let enemyIds = 0;

export class Skeleton {
  constructor(scene, home, level = 4, opts = {}) {
    this.id = ++enemyIds;
    this.scene = scene;
    this.name = opts.name || 'Skeleton Warrior';
    this.level = level;
    this.rig = opts.rig || buildSkeleton();
    this.object = this.rig.root;
    this.home = home.clone();
    this.object.position.copy(home);
    scene.add(this.object);

    this.scale = opts.scale || 1;
    this.object.scale.setScalar(this.scale);
    this.maxHp = opts.hp || 60 + level * 10;
    this.hp = this.maxHp;
    this.reach = 1.9 * this.scale;
    this.hitRange = 2.2 * this.scale;
    this.dmg = opts.dmg || [6 + level, 12 + level * 1.5];
    this.speed = opts.speed || 2.9;
    this.aggroRange = opts.aggroRange || 9;
    this.leash = opts.leash || 16;
    this.respawns = opts.respawns !== false;
    this.xpValue = opts.xp || 35 + level * 12;

    this.facing = Math.random() * Math.PI * 2;
    this.walk = 0;
    this.phase = Math.random() * 10;
    this.attackT = -1;
    this.hitDone = false;
    this.cooldown = 0;
    this.radius = 0.35 * this.scale;
    this.wanderTarget = home.clone();
    this.wanderTimer = 0;
    this.deadT = -1;
    this.flash = 0;
    this.shadow = { x: 0, z: 0, r: 0.6 * this.scale, strength: 0.5 };
    env.shadows.unshift(this.shadow);
  }

  get position() { return this.object.position; }
  get alive() { return this.hp > 0; }

  takeHit(dmg) {
    if (!this.alive) return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.flash = 1;
    if (!this.alive) { this.deadT = 0; return true; }
    return false;
  }

  reset() {
    this.hp = this.maxHp;
    this.deadT = -1;
    this.object.rotation.x = 0;
    this.object.position.copy(this.home);
    this.object.visible = true;
    this.shadow.strength = 0.5;
  }

  updateDead(dt) {
    // Collapse into a heap, wait, then reassemble at home.
    this.deadT += dt;
    const k = Math.min(1, this.deadT / 0.6);
    this.object.rotation.x = -k * 1.35;
    this.object.position.y = -k * 0.25 * this.scale;
    this.shadow.strength = 0.5 * (1 - k);
    if (this.respawns && this.deadT > 12) this.reset();
  }

  update(dt, player, events) {
    if (!this.alive) { this.updateDead(dt); return; }

    const toPlayer = new THREE.Vector3().subVectors(player.position, this.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    const aggro = player.alive && dist < this.aggroRange && this.position.distanceTo(this.home) < this.leash;
    this.aggro = aggro;

    const move = new THREE.Vector3();
    if (aggro) {
      if (dist > this.reach * 0.8) move.copy(toPlayer).normalize();
      this.faceTowards(Math.atan2(toPlayer.x, toPlayer.z), dt);
      this.cooldown -= dt;
      this.special?.(dt, player, dist, events);
      if (dist < this.reach && this.cooldown <= 0 && this.attackT < 0) {
        this.attackT = 0; this.hitDone = false; this.cooldown = 1.6 + Math.random() * 0.6;
      }
    } else {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        const a = Math.random() * Math.PI * 2;
        this.wanderTarget.set(this.home.x + Math.cos(a) * 4, 0, this.home.z + Math.sin(a) * 4);
        this.wanderTimer = 3 + Math.random() * 4;
      }
      const w = new THREE.Vector3().subVectors(this.wanderTarget, this.position);
      w.y = 0;
      if (w.length() > 0.4) {
        move.copy(w).normalize().multiplyScalar(0.45);
        this.faceTowards(Math.atan2(w.x, w.z), dt);
      }
      // Drift back to full health when left alone.
      this.hp = Math.min(this.maxHp, this.hp + dt * this.maxHp * 0.05);
    }

    const speed = (aggro ? this.speed : 1.6) * (this.attackT >= 0 || this.busy ? 0.15 : 1);
    this.position.addScaledVector(move, speed * dt);
    resolveCollisions(this.position, this.radius);

    let attack = -1;
    if (this.attackT >= 0) {
      this.attackT += dt / 0.8;
      attack = this.attackT;
      if (attack > 0.45 && !this.hitDone) {
        this.hitDone = true;
        if (player.alive && this.position.distanceTo(player.position) < this.hitRange) {
          const dmg = Math.round(this.dmg[0] + Math.random() * (this.dmg[1] - this.dmg[0]));
          events.playerHit(dmg, this);
        }
      }
      if (this.attackT >= 1) this.attackT = -1;
    }

    const moving = move.length() * speed;
    this.walk = THREE.MathUtils.lerp(this.walk, Math.min(1, moving / (2.5 * this.scale)), Math.min(1, dt * 8));
    this.phase += dt * (4 + moving * 1.5 / this.scale);
    this.object.rotation.y = this.facing;
    animateRig(this.rig, { walk: this.walk, phase: this.phase, attack, idle: env.time + this.id });

    // Recoil when struck.
    this.flash = Math.max(0, this.flash - dt * 4);
    this.rig.torso.rotation.x = -this.flash * 0.5;

    this.shadow.x = this.position.x - 0.3 * this.scale;
    this.shadow.z = this.position.z + 0.4 * this.scale;
  }

  faceTowards(target, dt) {
    let diff = target - this.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.facing += diff * Math.min(1, dt * 7);
  }
}

/**
 * The Hollow King: a giant crowned skeleton that guards the ruins. Besides
 * heavy sword blows it raises its blade and slams the ground, telegraphed
 * by a red ring of glyphs. Step out of the ring before it lands.
 */
export class HollowKing extends Skeleton {
  constructor(scene, home) {
    const rig = buildSkeleton();
    const gold = tagMaterial(new THREE.MeshStandardMaterial({ color: 0xd9b04a, metalness: 0.9, roughness: 0.3 }), SET.METAL);
    const crown = new THREE.Group();
    crown.add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.06, 10, 1, true), gold));
    for (let i = 0; i < 6; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), gold);
      const a = (i / 6) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 0.14, 0.08, Math.sin(a) * 0.14);
      crown.add(spike);
    }
    crown.position.y = 0.26;
    rig.neck.add(crown);
    const cloak = tagMaterial(new THREE.MeshStandardMaterial({ color: 0x2a1238, roughness: 0.9, side: THREE.DoubleSide }), SET.DEFAULT);
    const mantle = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.9, 2, 3), cloak);
    mantle.position.set(0, 0.3, -0.12);
    rig.torso.add(mantle);

    super(scene, home, 12, {
      rig, name: 'The Hollow King', scale: 2.5, hp: 1800, dmg: [26, 40], speed: 2.2,
      aggroRange: 16, leash: 26, respawns: false, xp: 1200,
    });
    this.slamCooldown = 5;
    this.slamT = -1;
    this.isBoss = true;

    const ringMat = tagMaterial(new THREE.MeshBasicMaterial({ color: 0xff3a22, side: THREE.DoubleSide }), SET.GLOW);
    this.slamRing = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48), ringMat);
    this.slamRing.rotation.x = -Math.PI / 2;
    this.slamRing.visible = false;
    scene.add(this.slamRing);
    this.slamRadius = 5;

    // Eerie violet glow so the king stands out in the dark ruins.
    this.glow = new THREE.PointLight(0x9a5cff, 40, 16, 1.5);
    this.glow.position.set(0, 1.6, 0.5);
    this.object.add(this.glow);
    this.glowRef = { position: new THREE.Vector3(), color: new THREE.Color(0x9a5cff), intensity: 1.1, range: 9 };
    env.lights.push(this.glowRef);
  }

  get busy() { return this.slamT >= 0; }

  special(dt, player, dist, events) {
    this.slamCooldown -= dt;
    if (this.slamT < 0 && this.slamCooldown <= 0 && dist < 9) {
      this.slamT = 0;
      this.slamAt = this.position.clone();
      this.slamRing.position.set(this.slamAt.x, 0.08, this.slamAt.z);
      events.message?.('The Hollow King raises his blade...');
    }
  }

  update(dt, player, events) {
    super.update(dt, player, events);
    if (this.slamT >= 0) {
      this.slamT += dt;
      const k = Math.min(1, this.slamT / 1.2);
      this.slamRing.visible = this.alive;
      this.slamRing.scale.setScalar(this.slamRadius * k);
      // Arm raised overhead while charging.
      this.rig.arms[1].shoulder.rotation.x = -2.8 + (this.slamT > 1.2 ? 2.5 : 0);
      if (this.slamT >= 1.2 && !this.slamDone) {
        this.slamDone = true;
        events.shake?.(0.5);
        if (player.alive && player.position.distanceTo(this.slamAt) < this.slamRadius) {
          events.playerHit(Math.round(55 + Math.random() * 20), this);
        }
      }
      if (this.slamT > 1.6) {
        this.slamT = -1;
        this.slamDone = false;
        this.slamRing.visible = false;
        this.slamCooldown = 6 + Math.random() * 3;
      }
    }
    if (!this.alive) this.slamRing.visible = false;
    const on = this.alive ? 1 : 0;
    this.glow.intensity = 40 * on;
    this.glowRef.intensity = 1.1 * on;
    this.glow.getWorldPosition(this.glowRef.position);
  }
}

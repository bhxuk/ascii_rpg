import * as THREE from 'three';
import { SET, tagMaterial } from '../ascii/glyphs.js';
import { buildKnight, buildSkeleton, animateRig } from './models.js';
import { env, insidePond, WORLD_RADIUS } from '../world/env.js';

const ATTACK_TIME = 0.55;

/** Push a circle out of every obstacle, the pond and the world edge. */
function resolveCollisions(pos, radius) {
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
function createSlash() {
  const geo = new THREE.RingGeometry(1.0, 1.9, 24, 1, -Math.PI * 0.45, Math.PI * 0.9);
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

    this.level = 7;
    this.maxHp = 240; this.hp = 240;
    this.maxMp = 90; this.mp = 90;
    this.xp = 1180; this.xpNext = 2000;
    this.gold = 312;

    this.facing = 0;
    this.velocity = new THREE.Vector3();
    this.walk = 0;
    this.phase = 0;
    this.attackT = -1;
    this.hitDone = false;
    this.hurtFlash = 0;
    this.radius = 0.4;

    this.slash = createSlash();
    this.object.add(this.slash);

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

  attack() {
    if (this.attackT >= 0) return false;
    this.attackT = 0;
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
    this.object.rotation.y = this.facing;

    let attack = -1;
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
    animateRig(this.rig, { walk: this.walk, phase: this.phase, attack, idle: env.time });

    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3);
    this.hp = Math.min(this.maxHp, this.hp + dt * 3);
    this.mp = Math.min(this.maxMp, this.mp + dt * 2);

    this.object.getWorldPosition(this.lightRef.position);
    this.lightRef.position.y += 2.4;
    this.shadow.x = this.position.x - 0.35;
    this.shadow.z = this.position.z + 0.45;
    env.player.copy(this.position);
  }

  /** True once per swing, at the moment the blade connects. */
  strikeWindow() {
    if (this.attackT > 0.42 && !this.hitDone) { this.hitDone = true; return true; }
    return false;
  }
}

let enemyIds = 0;

export class Skeleton {
  constructor(scene, home, level = 4) {
    this.id = ++enemyIds;
    this.name = 'Skeleton Warrior';
    this.level = level;
    this.rig = buildSkeleton();
    this.object = this.rig.root;
    this.home = home.clone();
    this.object.position.copy(home);
    scene.add(this.object);

    this.maxHp = 60 + level * 8;
    this.hp = this.maxHp;
    this.facing = Math.random() * Math.PI * 2;
    this.walk = 0;
    this.phase = Math.random() * 10;
    this.attackT = -1;
    this.hitDone = false;
    this.cooldown = 0;
    this.radius = 0.35;
    this.wanderTarget = home.clone();
    this.wanderTimer = 0;
    this.deadT = -1;
    this.flash = 0;
    this.shadow = { x: 0, z: 0, r: 0.6, strength: 0.5 };
    env.shadows.unshift(this.shadow);
  }

  get position() { return this.object.position; }
  get alive() { return this.hp > 0; }

  takeHit(dmg) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.flash = 1;
    if (!this.alive) this.deadT = 0;
  }

  update(dt, player, events) {
    if (!this.alive) {
      // Collapse into a heap, wait, then reassemble at home.
      this.deadT += dt;
      const k = Math.min(1, this.deadT / 0.6);
      this.object.rotation.x = -k * 1.35;
      this.object.position.y = -k * 0.25;
      this.shadow.strength = 0.5 * (1 - k);
      if (this.deadT > 9) {
        this.hp = this.maxHp;
        this.deadT = -1;
        this.object.rotation.x = 0;
        this.object.position.copy(this.home);
        this.shadow.strength = 0.5;
      }
      return;
    }

    const toPlayer = new THREE.Vector3().subVectors(player.position, this.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    const aggro = player.alive && dist < 9 && this.position.distanceTo(this.home) < 16;

    let move = new THREE.Vector3();
    if (aggro) {
      if (dist > 1.5) move.copy(toPlayer).normalize();
      this.faceTowards(Math.atan2(toPlayer.x, toPlayer.z), dt);
      this.cooldown -= dt;
      if (dist < 1.9 && this.cooldown <= 0 && this.attackT < 0) {
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
    }

    const speed = (aggro ? 2.9 : 1.6) * (this.attackT >= 0 ? 0.2 : 1);
    this.position.addScaledVector(move, speed * dt);
    resolveCollisions(this.position, this.radius);

    let attack = -1;
    if (this.attackT >= 0) {
      this.attackT += dt / 0.8;
      attack = this.attackT;
      if (attack > 0.45 && !this.hitDone) {
        this.hitDone = true;
        if (player.alive && this.position.distanceTo(player.position) < 2.2) {
          const dmg = 8 + Math.floor(Math.random() * 9) + this.level;
          events.playerHit(dmg, this);
        }
      }
      if (this.attackT >= 1) this.attackT = -1;
    }

    const moving = move.length() * speed;
    this.walk = THREE.MathUtils.lerp(this.walk, Math.min(1, moving / 2.5), Math.min(1, dt * 8));
    this.phase += dt * (4 + moving * 1.5);
    this.object.rotation.y = this.facing;
    animateRig(this.rig, { walk: this.walk, phase: this.phase, attack, idle: env.time + this.id });

    // Recoil when struck.
    this.flash = Math.max(0, this.flash - dt * 4);
    this.rig.torso.rotation.x = -this.flash * 0.5;

    this.shadow.x = this.position.x - 0.3;
    this.shadow.z = this.position.z + 0.4;
  }

  faceTowards(target, dt) {
    let diff = target - this.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.facing += diff * Math.min(1, dt * 7);
  }
}

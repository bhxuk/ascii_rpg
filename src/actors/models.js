import * as THREE from 'three';
import { SET, tagMaterial } from '../ascii/glyphs.js';

const tag = tagMaterial;

/** Pivot helper: a group placed at a joint, so rotating it swings the limb. */
function joint(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/**
 * A plate-armoured knight with a red plume, cape, longsword and kite shield.
 * Built from primitives so it reads cleanly once turned into characters.
 * Faces +Z.
 */
export function buildKnight({ plume = 0xb3221c, cape = 0x6e1420, trim = 0xc9a33c, emblem = 0x8a1a1a } = {}) {
  const steel = tag(new THREE.MeshStandardMaterial({ color: 0xb9c1cc, metalness: 0.75, roughness: 0.32 }), SET.METAL);
  const darkSteel = tag(new THREE.MeshStandardMaterial({ color: 0x4b525c, metalness: 0.7, roughness: 0.45 }), SET.METAL);
  const gold = tag(new THREE.MeshStandardMaterial({ color: trim, metalness: 0.9, roughness: 0.3 }), SET.METAL);
  const cloth = tag(new THREE.MeshStandardMaterial({ color: cape, roughness: 0.9, side: THREE.DoubleSide }), SET.DEFAULT);
  const red = tag(new THREE.MeshStandardMaterial({ color: plume, roughness: 0.8 }), SET.DEFAULT);
  const leather = tag(new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.9 }), SET.DEFAULT);
  const blade = tag(new THREE.MeshStandardMaterial({ color: 0xe8eef6, metalness: 0.9, roughness: 0.15, emissive: 0x1a2230 }), SET.METAL);
  const shieldFace = tag(new THREE.MeshStandardMaterial({ color: emblem, roughness: 0.7 }), SET.DEFAULT);

  const root = new THREE.Group();
  const body = joint(root, 0, 0, 0); // bobs while walking

  // Legs
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = joint(body, side * 0.15, 0.92, 0);
    hip.add(box(0.2, 0.46, 0.24, steel, 0, -0.23, 0)); // thigh
    const knee = joint(hip, 0, -0.46, 0);
    knee.add(box(0.18, 0.44, 0.22, steel, 0, -0.22, 0)); // greave
    knee.add(box(0.21, 0.1, 0.32, darkSteel, 0, -0.42, 0.05)); // sabaton
    knee.add(box(0.12, 0.12, 0.08, gold, 0, -0.02, 0.12)); // knee cop
    legs.push({ hip, knee });
  }

  // Torso
  const torso = joint(body, 0, 0.92, 0);
  torso.add(box(0.44, 0.22, 0.28, darkSteel, 0, 0.1, 0)); // faulds
  torso.add(box(0.46, 0.06, 0.3, leather, 0, 0.22, 0)); // belt
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.23, 0.48, 8), steel);
  chest.position.set(0, 0.5, 0);
  chest.scale.z = 0.72;
  torso.add(chest);
  torso.add(box(0.06, 0.4, 0.05, gold, 0, 0.5, 0.2)); // centre ridge

  // Head
  const neck = joint(torso, 0, 0.78, 0);
  const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.3, 10), steel);
  helm.position.y = 0.16;
  neck.add(helm);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), steel);
  dome.position.y = 0.31;
  neck.add(dome);
  neck.add(box(0.24, 0.035, 0.05, new THREE.MeshBasicMaterial({ color: 0x000000 }), 0, 0.2, 0.14)); // visor slit
  neck.add(box(0.03, 0.18, 0.04, gold, 0, 0.12, 0.155)); // nasal
  const plumeMesh = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 6), red);
  plumeMesh.position.set(0, 0.5, -0.12);
  plumeMesh.rotation.x = -0.9;
  neck.add(plumeMesh);

  // Arms
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = joint(torso, side * 0.35, 0.68, 0);
    const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), steel);
    pauldron.scale.set(1.15, 0.8, 1.1);
    shoulder.add(pauldron);
    shoulder.add(box(0.14, 0.32, 0.15, steel, 0, -0.2, 0));
    const elbow = joint(shoulder, 0, -0.36, 0);
    elbow.add(box(0.13, 0.3, 0.14, steel, 0, -0.15, 0));
    elbow.add(box(0.15, 0.1, 0.16, darkSteel, 0, -0.32, 0)); // gauntlet
    const hand = joint(elbow, 0, -0.34, 0);
    arms.push({ shoulder, elbow, hand });
  }

  // Sword in the right hand (pointing forward/up from the fist).
  const sword = new THREE.Group();
  sword.add(box(0.05, 0.22, 0.05, leather, 0, 0, 0)); // grip
  sword.add(box(0.3, 0.05, 0.07, gold, 0, 0.12, 0)); // crossguard
  sword.add(box(0.07, 1.0, 0.025, blade, 0, 0.64, 0)); // blade
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 4), blade);
  tip.position.y = 1.2;
  sword.add(tip);
  sword.rotation.x = Math.PI / 2;
  arms[1].hand.add(sword);

  // Kite shield on the left forearm.
  const shield = new THREE.Group();
  const kite = new THREE.Shape();
  kite.moveTo(0, 0.36);
  kite.quadraticCurveTo(0.3, 0.34, 0.27, 0.05);
  kite.quadraticCurveTo(0.2, -0.3, 0, -0.5);
  kite.quadraticCurveTo(-0.2, -0.3, -0.27, 0.05);
  kite.quadraticCurveTo(-0.3, 0.34, 0, 0.36);
  const face = new THREE.Mesh(new THREE.ExtrudeGeometry(kite, { depth: 0.05, bevelEnabled: false }), shieldFace);
  shield.add(face);
  shield.add(box(0.05, 0.7, 0.03, gold, 0, -0.05, 0.055));
  shield.add(box(0.4, 0.05, 0.03, gold, 0, 0.12, 0.055));
  shield.position.set(-0.1, -0.15, 0.12);
  shield.rotation.y = -Math.PI / 2 + 0.25;
  arms[0].elbow.add(shield);

  // Cape hanging from the shoulders.
  const capeGeo = new THREE.PlaneGeometry(0.62, 1.15, 4, 6);
  capeGeo.translate(0, -0.575, 0);
  const capeMesh = new THREE.Mesh(capeGeo, cloth);
  const capePivot = joint(torso, 0, 0.72, -0.2);
  capePivot.add(capeMesh);

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  return { root, body, torso, neck, legs, arms, sword, capePivot, capeMesh };
}

/** A skeleton warrior: bone-white, rusted blade, glowing eye sockets. Faces +Z. */
export function buildSkeleton() {
  const bone = tag(new THREE.MeshStandardMaterial({ color: 0xd8d2bf, roughness: 0.8 }), SET.STONE);
  const rust = tag(new THREE.MeshStandardMaterial({ color: 0x7a5a3a, metalness: 0.5, roughness: 0.7 }), SET.METAL);
  const eye = tag(new THREE.MeshBasicMaterial({ color: 0xff5530 }), SET.GLOW);

  const root = new THREE.Group();
  const body = joint(root, 0, 0, 0);

  const legs = [];
  for (const side of [-1, 1]) {
    const hip = joint(body, side * 0.12, 0.9, 0);
    hip.add(box(0.07, 0.45, 0.07, bone, 0, -0.22, 0));
    const knee = joint(hip, 0, -0.45, 0);
    knee.add(box(0.06, 0.42, 0.06, bone, 0, -0.21, 0));
    knee.add(box(0.1, 0.05, 0.2, bone, 0, -0.43, 0.05));
    legs.push({ hip, knee });
  }

  const torso = joint(body, 0, 0.9, 0);
  torso.add(box(0.3, 0.1, 0.16, bone, 0, 0.05, 0)); // pelvis
  torso.add(box(0.05, 0.5, 0.05, bone, 0, 0.35, -0.05)); // spine
  for (let i = 0; i < 4; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.14 - i * 0.012, 0.018, 4, 10, Math.PI * 1.6), bone);
    rib.rotation.x = Math.PI / 2;
    rib.rotation.z = Math.PI * 0.7;
    rib.position.set(0, 0.42 + i * 0.075, 0);
    torso.add(rib);
  }

  const neck = joint(torso, 0, 0.72, 0);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), bone);
  skull.position.y = 0.13;
  skull.scale.set(0.95, 1, 1.05);
  neck.add(skull);
  neck.add(box(0.16, 0.08, 0.14, bone, 0, 0.0, 0.02)); // jaw
  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 4), eye);
    e.position.set(side * 0.05, 0.15, 0.115);
    neck.add(e);
  }

  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = joint(torso, side * 0.22, 0.65, 0);
    shoulder.add(box(0.06, 0.34, 0.06, bone, 0, -0.17, 0));
    const elbow = joint(shoulder, 0, -0.34, 0);
    elbow.add(box(0.05, 0.3, 0.05, bone, 0, -0.15, 0));
    const hand = joint(elbow, 0, -0.32, 0);
    arms.push({ shoulder, elbow, hand });
  }

  const sword = new THREE.Group();
  sword.add(box(0.04, 0.16, 0.04, rust, 0, 0, 0));
  sword.add(box(0.2, 0.04, 0.05, rust, 0, 0.09, 0));
  sword.add(box(0.07, 0.8, 0.02, rust, 0, 0.5, 0));
  sword.rotation.x = Math.PI / 2;
  arms[1].hand.add(sword);

  return { root, body, torso, neck, legs, arms, sword };
}

/** Swing animation shared by both rigs: walk cycle + optional strike. */
export function animateRig(rig, { walk = 0, phase = 0, attack = -1, idle = 0 }) {
  const s = Math.sin(phase);
  const c = Math.cos(phase);

  rig.legs[0].hip.rotation.x = s * 0.7 * walk;
  rig.legs[1].hip.rotation.x = -s * 0.7 * walk;
  rig.legs[0].knee.rotation.x = Math.max(0, -c) * 0.9 * walk;
  rig.legs[1].knee.rotation.x = Math.max(0, c) * 0.9 * walk;
  rig.body.position.y = Math.abs(s) * 0.06 * walk + Math.sin(idle * 1.8) * 0.01;
  rig.torso.rotation.x = 0.08 * walk;

  // Left (shield) arm swings with the walk, held a little forward.
  rig.arms[0].shoulder.rotation.x = -0.35 - s * 0.35 * walk;
  rig.arms[0].elbow.rotation.x = -0.9;

  if (attack >= 0) {
    // 0 -> 0.35 wind up, 0.35 -> 0.6 slash, 0.6 -> 1 recover
    let a, twist;
    if (attack < 0.35) {
      const k = attack / 0.35;
      a = THREE.MathUtils.lerp(-0.6, -2.7, k);
      twist = THREE.MathUtils.lerp(0, 0.6, k);
    } else if (attack < 0.6) {
      const k = (attack - 0.35) / 0.25;
      a = THREE.MathUtils.lerp(-2.7, -0.3, k * k);
      twist = THREE.MathUtils.lerp(0.6, -0.5, k);
    } else {
      const k = (attack - 0.6) / 0.4;
      a = THREE.MathUtils.lerp(-0.3, -0.25, k);
      twist = THREE.MathUtils.lerp(-0.5, 0, k);
    }
    rig.arms[1].shoulder.rotation.x = a;
    rig.arms[1].shoulder.rotation.z = -0.2;
    rig.arms[1].elbow.rotation.x = -0.2;
    rig.torso.rotation.y = twist;
  } else {
    rig.arms[1].shoulder.rotation.x = -0.25 + s * 0.35 * walk;
    rig.arms[1].shoulder.rotation.z = 0;
    rig.arms[1].elbow.rotation.x = -0.6;
    rig.torso.rotation.y = 0;
  }

  if (rig.capePivot) {
    rig.capePivot.rotation.x = 0.12 + walk * 0.35 + Math.sin(idle * 2.3) * 0.04;
  }
}

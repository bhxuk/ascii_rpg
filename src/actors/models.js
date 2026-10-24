import * as THREE from 'three';
import { SET, tagMaterial } from '../ascii/glyphs.js';

const tag = tagMaterial;
const V2 = THREE.Vector2;

/*
 * Character models, built from smooth primitives (lathe-turned plates,
 * capsules, bevelled extrusions) so silhouettes stay round once the scene is
 * turned into characters. All rigs face +Z.
 */

// ------------------------------------------------------------------ helpers

/** Pivot: a group placed at a joint, so rotating it swings the limb. */
function joint(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

/** Turned profile: pts = [[radius, y], ...] from bottom to top. */
function lathe(pts, segments = 24) {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new V2(r, y)), segments);
}

/** Smooth catmull-rom profile resampled so lathe surfaces have no hard rings. */
function smoothLathe(pts, segments = 24, samples = 18) {
  const curve = new THREE.SplineCurve(pts.map(([r, y]) => new V2(r, y)));
  return new THREE.LatheGeometry(curve.getPoints(samples), segments);
}

function capsule(r, len, radial = 14) {
  return new THREE.CapsuleGeometry(r, len, 6, radial);
}

function metal(color, rough = 0.3, metalness = 0.85, extra = {}) {
  return tag(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness, ...extra }), SET.METAL);
}
function cloth(color, extra = {}) {
  return tag(new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra }), SET.DEFAULT);
}

/** A thin bevelled blade, flat in XY and pointing up +Y, base at y=0. */
function bladeGeometry(length, width, thickness = 0.012) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  s.lineTo(-width / 2 * 0.92, length * 0.78);
  s.quadraticCurveTo(-width * 0.3, length * 0.93, 0, length);
  s.quadraticCurveTo(width * 0.3, length * 0.93, width / 2 * 0.92, length * 0.78);
  s.lineTo(width / 2, 0);
  s.lineTo(-width / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: thickness, bevelEnabled: true, bevelThickness: thickness,
    bevelSize: width * 0.22, bevelSegments: 2, curveSegments: 10,
  });
  g.translate(0, 0, -thickness / 2);
  return g;
}

/** Shield silhouette (heater shape), centred near the origin. */
function heaterShape(w, h) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, h * 0.42);
  s.quadraticCurveTo(0, h * 0.5, w / 2, h * 0.42);
  s.lineTo(w / 2, h * 0.05);
  s.quadraticCurveTo(w * 0.46, -h * 0.3, 0, -h * 0.5);
  s.quadraticCurveTo(-w * 0.46, -h * 0.3, -w / 2, h * 0.05);
  s.lineTo(-w / 2, h * 0.42);
  return s;
}

// --------------------------------------------------------------------- cape

/**
 * A cloth cape hanging from the shoulders. It is a grid of vertices that is
 * re-shaped every frame: it trails back as the wearer moves, ripples in the
 * wind and flares out during attacks. Outer face, lining and a trim colour
 * along the hem and edges.
 */
export function buildCape({
  width = 0.6, hemWidth = 1.0, length = 1.2, cols = 14, rows = 18,
  outer = 0x2d55c4, trim = 0xd8a63c, lining = 0x6a1222,
} = {}) {
  // Columns/rows are packed tightly at the edges so the trim reads as a thin band.
  const us = [0, 0.035];
  for (let i = 1; i < cols - 1; i++) us.push(0.035 + (0.93 * i) / (cols - 1));
  us.push(0.965, 1);
  const vs = [];
  for (let i = 0; i < rows; i++) vs.push((0.955 * i) / (rows - 1));
  vs.push(1);

  const nu = us.length;
  const nv = vs.length;
  const pos = new Float32Array(nu * nv * 3);
  const col = new Float32Array(nu * nv * 3);
  const cOuter = new THREE.Color(outer);
  const cTrim = new THREE.Color(trim);
  const tmp = new THREE.Color();
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const k = j * nu + i;
      const edge = vs[j] > 0.95 || us[i] < 0.03 || us[i] > 0.97;
      tmp.copy(edge ? cTrim : cOuter);
      if (!edge) tmp.multiplyScalar(1 - vs[j] * 0.25); // folds darken toward the hem
      col.set([tmp.r, tmp.g, tmp.b], k * 3);
    }
  }
  const idx = [];
  for (let j = 0; j < nv - 1; j++) {
    for (let i = 0; i < nu - 1; i++) {
      const a = j * nu + i, b = a + 1, c = a + nu, d = c + 1;
      idx.push(a, b, c, b, d, c); // outer face points away from the back
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);

  const front = new THREE.Mesh(geo, cloth(0xffffff, { vertexColors: true, side: THREE.FrontSide }));
  const back = new THREE.Mesh(geo, cloth(lining, { side: THREE.BackSide }));
  front.frustumCulled = back.frustumCulled = false;
  const group = new THREE.Group();
  group.add(front, back);

  function update(walk, time, lift = 0) {
    for (let i = 0; i < nu; i++) {
      const u = us[i];
      const across = u * 2 - 1; // -1 .. 1
      const curve = 1 - across * across;
      let y = 0;
      let z = -0.2 - 0.07 * curve; // top edge wraps around the back of the neck
      for (let j = 0; j < nv; j++) {
        const v = vs[j];
        if (j > 0) {
          const seg = (v - vs[j - 1]) * length;
          const flutter =
            Math.sin(time * 5.5 + v * 6 + u * 4) * 0.05 * v * (0.35 + walk * 1.5) +
            Math.sin(time * 1.6 + u * 2.3) * 0.025 * v;
          const a = 0.07 + lift * 0.9 * v + walk * (0.6 * v + 0.12) + flutter;
          y -= seg * Math.cos(a);
          z -= seg * Math.sin(a);
        }
        const w = width + (hemWidth - width) * Math.pow(v, 0.8);
        const fold = Math.sin(u * Math.PI * 4 + time * 1.2 * walk) * 0.025 * v; // soft vertical folds
        const k = (j * nu + i) * 3;
        pos[k] = across * w * 0.5;
        pos[k + 1] = y;
        pos[k + 2] = z - 0.05 * curve * (1 - v * 0.4) + fold;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }
  update(0, 0, 0);
  return { group, update };
}

/** A short cloth panel (tabard front) hanging from the belt. */
function buildPanel(w, h, color, trim) {
  const geo = new THREE.PlaneGeometry(w, h, 6, 8);
  geo.translate(0, -h / 2, 0);
  const p = geo.attributes.position;
  const cols = new Float32Array(p.count * 3);
  const c1 = new THREE.Color(color), c2 = new THREE.Color(trim), t = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, -0.04 * Math.pow(Math.abs(x) / (w / 2), 2)); // gently curved across the hips
    const edge = Math.abs(x) > w * 0.4 || y < -h * 0.9;
    t.copy(edge ? c2 : c1);
    cols.set([t.r, t.g, t.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, cloth(0xffffff, { vertexColors: true, side: THREE.DoubleSide }));
}

// ------------------------------------------------------------------- knight

/**
 * A knight in polished plate: great helm with a gold crest and white plume,
 * royal blue cape and tabard trimmed in gold, longsword in the right hand and
 * a heater shield on the left arm.
 */
export function buildKnight({
  capeColor = 0x2d55c4, trimColor = 0xd8a63c, liningColor = 0x6a1222, plumeColor = 0xeef1f7,
} = {}) {
  const steel = metal(0xdfe5ee, 0.3, 0.55);
  const shade = metal(0x7d8796, 0.4, 0.55);
  const gold = metal(trimColor, 0.25, 0.95);
  const leather = cloth(0x4a2e1c);
  const blade = metal(0xf1f5fb, 0.12, 0.95, { emissive: 0x1c2638 });
  const dark = tag(new THREE.MeshBasicMaterial({ color: 0x020305 }), SET.DEFAULT);
  const plume = cloth(plumeColor, { emissive: 0x1a1c22 });
  const shieldFace = cloth(capeColor, { roughness: 0.6 });

  const root = new THREE.Group();
  const body = joint(root, 0, 0, 0);

  // ---- legs
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = joint(body, side * 0.12, 0.92, 0);
    hip.add(mesh(capsule(0.095, 0.26), steel, 0, -0.22, 0)); // cuisse
    hip.add(mesh(new THREE.SphereGeometry(0.085, 16, 12), gold, 0, -0.45, 0.06)); // poleyn
    const knee = joint(hip, 0, -0.46, 0);
    const greave = smoothLathe([[0.062, -0.4], [0.075, -0.3], [0.093, -0.14], [0.085, -0.03], [0.07, 0.02]], 20);
    knee.add(mesh(greave, steel));
    const boot = mesh(new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), shade, 0, -0.44, 0.04);
    boot.scale.set(0.085, 0.07, 0.15);
    knee.add(boot);
    legs.push({ hip, knee });
  }

  // ---- torso
  const torso = joint(body, 0, 0.92, 0);
  const faulds = smoothLathe([[0.255, -0.06], [0.24, 0.04], [0.215, 0.14], [0.205, 0.19]], 28, 10);
  const fauldsMesh = mesh(faulds, steel);
  fauldsMesh.scale.z = 0.8;
  torso.add(fauldsMesh);
  const belt = mesh(new THREE.TorusGeometry(0.212, 0.026, 8, 32), leather, 0, 0.2, 0);
  belt.rotation.x = Math.PI / 2;
  belt.scale.y = 0.8;
  torso.add(belt);
  const buckle = mesh(new THREE.SphereGeometry(0.035, 12, 8), gold, 0, 0.2, 0.175);
  buckle.scale.set(1.2, 1, 0.5);
  torso.add(buckle);

  const chest = smoothLathe([[0.2, 0.2], [0.24, 0.34], [0.272, 0.5], [0.265, 0.62], [0.215, 0.72], [0.12, 0.79]], 32, 22);
  const chestMesh = mesh(chest, steel);
  chestMesh.scale.z = 0.74;
  torso.add(chestMesh);
  const trimRing = mesh(new THREE.TorusGeometry(0.205, 0.014, 6, 32), gold, 0, 0.215, 0);
  trimRing.rotation.x = Math.PI / 2;
  trimRing.scale.y = 0.75;
  torso.add(trimRing);
  const gorget = mesh(smoothLathe([[0.14, 0.76], [0.125, 0.82], [0.105, 0.87]], 24, 6), shade);
  torso.add(gorget);

  const tabard = buildPanel(0.27, 0.46, capeColor, trimColor);
  tabard.position.set(0, 0.19, 0.2);
  torso.add(tabard);

  // ---- head: great helm with eye slit, gold crest and plume
  const neck = joint(torso, 0, 0.82, 0);
  const helm = mesh(smoothLathe([[0.118, 0], [0.138, 0.06], [0.147, 0.16], [0.145, 0.26], [0.128, 0.34], [0.088, 0.395], [0.035, 0.42], [0.001, 0.424]], 28, 22), steel);
  helm.scale.z = 1.06;
  neck.add(helm);
  const slit = mesh(new THREE.TorusGeometry(0.149, 0.013, 6, 24, Math.PI * 0.62), dark, 0, 0.22, 0);
  slit.rotation.x = Math.PI / 2;
  slit.rotation.z = Math.PI * 0.19;
  slit.scale.y = 1.06;
  neck.add(slit);
  const crest = mesh(new THREE.TorusGeometry(0.15, 0.014, 8, 28, Math.PI), gold, 0, 0.255, 0);
  crest.rotation.y = Math.PI / 2;
  crest.scale.x = 1.06;
  neck.add(crest);
  const plumeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.4, 0.02), new THREE.Vector3(0, 0.52, -0.08),
    new THREE.Vector3(0, 0.5, -0.24), new THREE.Vector3(0, 0.36, -0.36), new THREE.Vector3(0, 0.2, -0.4),
  ]);
  for (const [dx, r] of [[0, 0.04], [-0.025, 0.028], [0.025, 0.028]]) {
    const tube = mesh(new THREE.TubeGeometry(plumeCurve, 20, r, 8), plume, dx, 0, 0);
    neck.add(tube);
  }

  // ---- arms (right arm holds the sword, left carries the shield)
  const arm = (side) => {
    const shoulder = joint(torso, side * 0.33, 0.69, 0);
    shoulder.rotation.order = 'YXZ';
    const pauldron = mesh(new THREE.SphereGeometry(0.165, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.58), steel, side * 0.02, 0.0, 0);
    pauldron.scale.set(1.08, 0.82, 1.02);
    shoulder.add(pauldron);
    const lame = mesh(new THREE.TorusGeometry(0.135, 0.022, 8, 24), gold, side * 0.02, -0.085, 0);
    lame.rotation.x = Math.PI / 2;
    shoulder.add(lame);
    shoulder.add(mesh(capsule(0.07, 0.2), steel, 0, -0.2, 0));
    const elbow = joint(shoulder, 0, -0.36, 0);
    elbow.add(mesh(new THREE.SphereGeometry(0.074, 14, 10), shade));
    elbow.add(mesh(smoothLathe([[0.058, -0.28], [0.072, -0.16], [0.07, -0.04]], 18, 8), steel));
    const glove = mesh(new THREE.SphereGeometry(1, 14, 10), shade, 0, -0.33, 0.01);
    glove.scale.set(0.068, 0.075, 0.08);
    elbow.add(glove);
    const hand = joint(elbow, 0, -0.34, 0);
    return { shoulder, elbow, hand, side };
  };
  const swordArm = arm(-1);
  const shieldArm = arm(1);

  // Longsword: leather grip, gold guard and pommel, bevelled blade.
  const sword = new THREE.Group();
  sword.add(mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.22, 12), leather));
  sword.add(mesh(new THREE.SphereGeometry(0.04, 14, 10), gold, 0, -0.13, 0));
  const guard = mesh(capsule(0.022, 0.28, 10), gold, 0, 0.12, 0);
  guard.rotation.z = Math.PI / 2;
  sword.add(guard);
  sword.add(mesh(bladeGeometry(1.08, 0.075), blade, 0, 0.13, 0));
  sword.rotation.x = Math.PI / 2;
  swordArm.hand.add(sword);

  // Heater shield: gold rim behind a blue face with a gold cross.
  const shield = new THREE.Group();
  const extrude = (shape, depth, bevel) => new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 16,
  });
  shield.add(mesh(extrude(heaterShape(0.6, 0.8), 0.02, 0.02), gold, 0, 0, -0.012));
  shield.add(mesh(extrude(heaterShape(0.52, 0.71), 0.02, 0.012), shieldFace, 0, 0, 0.01));
  const bar = (w, h, x, y) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, h / 2); s.lineTo(-w / 2, h / 2);
    return mesh(extrude(s, 0.01, 0.008), gold, x, y, 0.035);
  };
  shield.add(bar(0.06, 0.6, 0, -0.02), bar(0.4, 0.06, 0, 0.12));
  shield.position.set(0.12, -0.16, 0.08);
  shield.rotation.y = Math.PI / 2 - 0.3;
  shieldArm.elbow.add(shield);

  // Cape hanging from the shoulders.
  const cape = buildCape({ outer: capeColor, trim: trimColor, lining: liningColor });
  const capePivot = joint(torso, 0, 0.75, 0);
  capePivot.add(cape.group);

  return {
    root, body, torso, neck, legs, swordArm, shieldArm,
    arms: [swordArm, shieldArm], sword, cape, capePivot, tabard,
  };
}

// ----------------------------------------------------------------- skeleton

/** A skeleton warrior: smooth bones, a notched rusty blade and ember eyes. */
export function buildSkeleton({ boneColor = 0xe0d9c4, eyeColor = 0xff5530, cape = null } = {}) {
  const bone = tag(new THREE.MeshStandardMaterial({ color: boneColor, roughness: 0.7 }), SET.STONE);
  const rust = metal(0x8a6040, 0.6, 0.6);
  const eye = tag(new THREE.MeshBasicMaterial({ color: eyeColor }), SET.GLOW);
  const socket = tag(new THREE.MeshBasicMaterial({ color: 0x050403 }), SET.DEFAULT);

  const root = new THREE.Group();
  const body = joint(root, 0, 0, 0);

  const legs = [];
  for (const side of [-1, 1]) {
    const hip = joint(body, side * 0.11, 0.9, 0);
    hip.add(mesh(capsule(0.035, 0.38, 10), bone, 0, -0.22, 0));
    hip.add(mesh(new THREE.SphereGeometry(0.045, 12, 8), bone, 0, -0.45, 0.01));
    const knee = joint(hip, 0, -0.45, 0);
    knee.add(mesh(capsule(0.03, 0.36, 10), bone, 0, -0.21, 0));
    const foot = mesh(capsule(0.03, 0.12, 8), bone, 0, -0.43, 0.06);
    foot.rotation.x = Math.PI / 2;
    knee.add(foot);
    legs.push({ hip, knee });
  }

  const torso = joint(body, 0, 0.9, 0);
  const pelvis = mesh(smoothLathe([[0.07, -0.02], [0.15, 0.04], [0.13, 0.1]], 18, 6), bone, 0, 0, 0);
  pelvis.scale.z = 0.7;
  torso.add(pelvis);
  for (let i = 0; i < 9; i++) {
    torso.add(mesh(new THREE.SphereGeometry(0.03, 10, 8), bone, 0, 0.12 + i * 0.07, -0.06));
  }
  for (let i = 0; i < 5; i++) {
    const r = 0.15 - Math.abs(i - 1.5) * 0.012;
    const rib = mesh(new THREE.TorusGeometry(r, 0.016, 8, 24, Math.PI * 1.55), bone, 0, 0.36 + i * 0.065, -0.02);
    rib.rotation.x = Math.PI / 2;
    rib.rotation.z = -Math.PI * 0.27 + Math.PI / 2;
    rib.scale.y = 0.8;
    torso.add(rib);
  }
  const collar = mesh(capsule(0.025, 0.36, 8), bone, 0, 0.68, 0);
  collar.rotation.z = Math.PI / 2;
  torso.add(collar);

  const neck = joint(torso, 0, 0.72, 0);
  const skull = mesh(new THREE.SphereGeometry(0.13, 22, 16), bone, 0, 0.15, -0.01);
  skull.scale.set(0.92, 1, 1.08);
  neck.add(skull);
  const jaw = mesh(new THREE.SphereGeometry(0.085, 16, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), bone, 0, 0.08, 0.035);
  jaw.scale.set(1, 0.9, 1.1);
  neck.add(jaw);
  for (const side of [-1, 1]) {
    neck.add(mesh(new THREE.SphereGeometry(0.036, 12, 8), socket, side * 0.048, 0.155, 0.098));
    neck.add(mesh(new THREE.SphereGeometry(0.019, 10, 8), eye, side * 0.048, 0.155, 0.122));
  }

  const arm = (side) => {
    const shoulder = joint(torso, side * 0.21, 0.66, 0);
    shoulder.rotation.order = 'YXZ';
    shoulder.add(mesh(new THREE.SphereGeometry(0.042, 12, 8), bone));
    shoulder.add(mesh(capsule(0.03, 0.28, 10), bone, 0, -0.17, 0));
    const elbow = joint(shoulder, 0, -0.34, 0);
    elbow.add(mesh(capsule(0.026, 0.26, 10), bone, 0, -0.15, 0));
    const hand = joint(elbow, 0, -0.32, 0);
    hand.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), bone));
    return { shoulder, elbow, hand, side };
  };
  const swordArm = arm(-1);
  const shieldArm = arm(1);

  const sword = new THREE.Group();
  sword.add(mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.16, 10), rust));
  const guard = mesh(capsule(0.018, 0.18, 8), rust, 0, 0.09, 0);
  guard.rotation.z = Math.PI / 2;
  sword.add(guard);
  sword.add(mesh(bladeGeometry(0.78, 0.07, 0.01), rust, 0, 0.1, 0));
  sword.rotation.x = Math.PI / 2;
  swordArm.hand.add(sword);

  let capeRig = null;
  let capePivot = null;
  if (cape) {
    capeRig = buildCape(cape);
    capePivot = joint(torso, 0, 0.68, 0.06);
    capePivot.add(capeRig.group);
  }

  return {
    root, body, torso, neck, legs, swordArm, shieldArm,
    arms: [swordArm, shieldArm], sword, cape: capeRig, capePivot,
  };
}

// ---------------------------------------------------------------- animation

/**
 * Sword swing, shared by the animation and the slash trail so the trail
 * always follows the blade. t runs 0..1:
 *   0.00 - 0.30  wind up: blade drawn back over the right shoulder
 *   0.30 - 0.55  slash: a fast horizontal sweep across the front, right to left
 *   0.55 - 1.00  recover to guard
 * yaw > 0 points the arm to the knight's left, yaw < 0 to his right.
 */
export const SWING = { windUp: 0.3, slashEnd: 0.55, armLength: 0.7, bladeReach: 1.35 };

const REST = { yaw: -0.25, pitch: -0.35, hand: 0, elbow: -0.6, twist: 0 };
const WOUND = { yaw: -1.7, pitch: -1.3, hand: Math.PI / 2, elbow: 0, twist: -0.5 };
const FOLLOW = { yaw: 1.25, pitch: -1.42, hand: Math.PI / 2, elbow: 0, twist: 0.5 };

const ease = (k) => k * k * (3 - 2 * k);
const easeOut = (k) => 1 - (1 - k) * (1 - k) * (1 - k);
function mixPose(a, b, k) {
  const o = {};
  for (const key in a) o[key] = a[key] + (b[key] - a[key]) * k;
  return o;
}

export function swingPose(t) {
  if (t < SWING.windUp) return mixPose(REST, WOUND, ease(t / SWING.windUp));
  if (t < SWING.slashEnd) return mixPose(WOUND, FOLLOW, easeOut((t - SWING.windUp) / (SWING.slashEnd - SWING.windUp)));
  return mixPose(FOLLOW, REST, ease((t - SWING.slashEnd) / (1 - SWING.slashEnd)));
}

/** Pose that holds the blade straight out to the right, used while spinning. */
const SPIN_POSE = { yaw: -1.57, pitch: -1.45, hand: Math.PI / 2, elbow: 0, twist: 0 };

/** Walk cycle plus optional strike (attack 0..1) or spin. */
export function animateRig(rig, { walk = 0, phase = 0, attack = -1, spin = false, idle = 0 }) {
  const s = Math.sin(phase);
  const c = Math.cos(phase);

  rig.legs[0].hip.rotation.x = s * 0.7 * walk;
  rig.legs[1].hip.rotation.x = -s * 0.7 * walk;
  rig.legs[0].knee.rotation.x = Math.max(0, -c) * 0.9 * walk;
  rig.legs[1].knee.rotation.x = Math.max(0, c) * 0.9 * walk;
  rig.body.position.y = Math.abs(s) * 0.05 * walk + Math.sin(idle * 1.8) * 0.008;
  rig.torso.rotation.x = 0.08 * walk;

  // Shield arm swings with the walk, held across the body.
  const sh = rig.shieldArm;
  sh.shoulder.rotation.x = -0.4 + s * 0.3 * walk;
  sh.shoulder.rotation.y = 0;
  sh.elbow.rotation.x = -1.0;

  const arm = rig.swordArm;
  let pose;
  if (spin) pose = SPIN_POSE;
  else if (attack >= 0) pose = swingPose(Math.min(attack, 1));
  else pose = { ...REST, pitch: REST.pitch - s * 0.3 * walk };
  arm.shoulder.rotation.y = pose.yaw;
  arm.shoulder.rotation.x = pose.pitch;
  arm.elbow.rotation.x = pose.elbow;
  arm.hand.rotation.x = pose.hand;
  rig.torso.rotation.y = pose.twist;

  if (rig.tabard) {
    // Keep the tabard clear of the leading thigh.
    const lead = Math.max(rig.legs[0].hip.rotation.x, rig.legs[1].hip.rotation.x, 0);
    rig.tabard.rotation.x = -lead * 0.85;
  }
  if (rig.cape) {
    const lift = spin ? 0.9 : attack >= 0 ? Math.sin(Math.min(attack, 1) * Math.PI) * 0.35 : 0;
    rig.cape.update(walk, idle, lift);
  }
}

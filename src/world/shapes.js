import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from './env.js';

/*
 * Smooth, organic geometry for the world. Everything here is built with
 * enough segments and shared (welded) vertices that it shades smoothly, so
 * the ASCII pass sees soft gradients instead of flat facets.
 */

const V2 = THREE.Vector2;

/** Smooth noise made of a few randomly oriented sine waves. */
function makeNoise(seed, octaves = 4, base = 1.4) {
  const r = rng(seed);
  const waves = [];
  for (let i = 0; i < octaves; i++) {
    const dir = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
    waves.push({ dir, freq: base * Math.pow(1.9, i), amp: Math.pow(0.55, i), phase: r() * 10 });
  }
  const total = waves.reduce((s, w) => s + w.amp, 0);
  return (p) => {
    let v = 0;
    for (const w of waves) v += Math.sin(p.dot(w.dir) * w.freq + w.phase) * w.amp;
    return v / total; // roughly -1..1
  };
}

/** Displace a unit sphere outward by fn(p) and weld it for smooth normals. */
function sculptSphere(detail, fn) {
  let geo = new THREE.IcosahedronGeometry(1, detail);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const pos = geo.attributes.position;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).normalize();
    p.multiplyScalar(fn(p.clone()));
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** A weathered boulder: rounded, lumpy, flattened where it sits. */
export function rockGeometry(seed) {
  const n = makeNoise(seed, 4, 1.6);
  const geo = sculptSphere(3, (p) => {
    let r = 1 + n(p) * 0.22;
    if (p.y < -0.2) r *= 1 - (-0.2 - p.y) * 0.5; // flatter underside
    return r;
  });
  geo.scale(1, 0.62, 1);
  return geo;
}

/**
 * A soft, billowing tree canopy: a few big lobes, leaf-clump bumps on the
 * surface, and per-vertex colour variation (sunlit clumps vs. deep shade).
 */
export function canopyGeometry(seed) {
  const r = rng(seed);
  const lobes = [];
  for (let i = 0; i < 6; i++) {
    lobes.push(new THREE.Vector3(r() - 0.5, (r() - 0.3) * 0.8, r() - 0.5).normalize());
  }
  const big = makeNoise(seed + 7, 3, 2.2);
  const clumps = makeNoise(seed + 13, 3, 7.5);
  const geo = sculptSphere(4, (p) => {
    let bulge = 0;
    for (const l of lobes) bulge += Math.pow(Math.max(0, p.dot(l)), 3) * 0.28;
    let rad = 0.82 + bulge + big(p) * 0.07 + clumps(p) * 0.06;
    if (p.y < -0.3) rad *= 1 - (-0.3 - p.y) * 0.35; // flatter underside
    return rad;
  });
  geo.scale(1, 0.82, 1);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const tone = makeNoise(seed + 21, 3, 5);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).normalize();
    const k = 0.78 + tone(p) * 0.22 + Math.max(0, p.y) * 0.12;
    colors.set([k, k * (0.96 + tone(p.clone().multiplyScalar(1.7)) * 0.08), k], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** Turned profile from [radius, y] points, smoothed with a spline. */
export function turned(pts, segments = 32, samples = 40) {
  const curve = new THREE.SplineCurve(pts.map(([r, y]) => new V2(r, y)));
  return new THREE.LatheGeometry(curve.getPoints(samples), segments);
}

/** Straight-segment lathe, for crisp mouldings. */
export function lathe(pts, segments = 32) {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new V2(r, y)), segments);
}

/** Tapered trunk with a flared root and a slight lean. */
export function trunkGeometry(height, seed) {
  const r = rng(seed);
  const geo = turned([
    [0.62, 0], [0.42, 0.18], [0.31, 0.6], [0.27, height * 0.5], [0.21, height * 0.85], [0.16, height],
  ], 18, 24);
  const pos = geo.attributes.position;
  const lean = new THREE.Vector2(r() - 0.5, r() - 0.5).multiplyScalar(0.5);
  const n = makeNoise(seed, 3, 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const k = p.y / height;
    const bark = 1 + n(p) * 0.08; // knotted, uneven bark
    pos.setXYZ(i, p.x * bark + lean.x * k * k, p.y, p.z * bark + lean.y * k * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/** A branch: a tapered limb from the origin out along +Y. */
export function branchGeometry(length) {
  return turned([[0.13, 0], [0.1, length * 0.5], [0.05, length]], 10, 10);
}

/** One drooping tier of a pine. */
export function pineTier(radius, height) {
  return turned([
    [0.001, height], [radius * 0.25, height * 0.82], [radius * 0.7, height * 0.35],
    [radius, height * 0.06], [radius * 0.9, 0], [0.2, height * 0.12],
  ], 20, 30);
}

/**
 * A classical column: plinth, torus base, fluted shaft with a gentle swell,
 * and a capital. If broken, the shaft ends in a jagged break.
 */
export function columnGeometry(height, broken, seed) {
  const shaftTop = broken ? height : height - 0.55;
  const pts = [
    [0.86, 0], [0.86, 0.22], [0.78, 0.26], [0.74, 0.34], [0.78, 0.42], [0.66, 0.5], [0.6, 0.56],
    [0.6, 0.6], [0.585, shaftTop * 0.4], [0.54, shaftTop],
  ];
  if (!broken) {
    pts.push([0.62, shaftTop + 0.1], [0.74, shaftTop + 0.28], [0.86, shaftTop + 0.32], [0.86, height], [0.001, height]);
  } else {
    pts.push([0.001, shaftTop]);
  }
  const geo = lathe(pts, 48);
  const pos = geo.attributes.position;
  const n = makeNoise(seed, 3, 4);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const onShaft = p.y > 0.6 && p.y < shaftTop - 0.02;
    if (onShaft) {
      const a = Math.atan2(p.z, p.x);
      const flute = 1 - 0.035 * Math.pow(Math.max(0, Math.cos(a * 16)), 2); // 16 flutes
      p.x *= flute;
      p.z *= flute;
    }
    if (broken && p.y > shaftTop - 0.6) {
      // Shattered top: push the rim and cap up and down irregularly.
      const k = (p.y - (shaftTop - 0.6)) / 0.6;
      p.y += n(p) * 0.35 * k;
    }
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** A fallen column drum lying on its side. */
export function drumGeometry(length) {
  const geo = lathe([[0.001, 0], [0.5, 0], [0.55, 0.06], [0.56, length * 0.5], [0.55, length - 0.06], [0.5, length], [0.001, length]], 40);
  geo.translate(0, -length / 2, 0);
  return geo;
}

/** A box with rounded edges. */
export function roundedBox(w, h, d, radius = 0.08) {
  const s = new THREE.Shape();
  const x = -w / 2 + radius, y = -h / 2 + radius, ww = w - radius * 2, hh = h - radius * 2;
  s.moveTo(x, y - radius);
  s.lineTo(x + ww, y - radius);
  s.quadraticCurveTo(x + ww + radius, y - radius, x + ww + radius, y);
  s.lineTo(x + ww + radius, y + hh);
  s.quadraticCurveTo(x + ww + radius, y + hh + radius, x + ww, y + hh + radius);
  s.lineTo(x, y + hh + radius);
  s.quadraticCurveTo(x - radius, y + hh + radius, x - radius, y + hh);
  s.lineTo(x - radius, y);
  s.quadraticCurveTo(x - radius, y - radius, x, y - radius);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: d - radius * 2, bevelEnabled: true, bevelThickness: radius, bevelSize: radius * 0.9,
    bevelSegments: 4, curveSegments: 8,
  });
  geo.translate(0, 0, -(d - radius * 2) / 2);
  return geo;
}

/** A teardrop flame. */
export function flameGeometry(radius, height) {
  return turned([[0.001, 0], [radius * 0.8, height * 0.12], [radius, height * 0.3], [radius * 0.55, height * 0.65], [0.001, height]], 18, 20);
}

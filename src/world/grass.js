import * as THREE from 'three';
import { SET, setAlpha } from '../ascii/glyphs.js';
import {
  env, rng, WORLD_RADIUS, insidePond, FOG_COLOR, FOG_DENSITY,
  MOON_COLOR, MAX_LIGHTS, MAX_SHADOWS,
} from './env.js';

/**
 * Thousands of instanced grass blades. Each blade sways in the wind, bends
 * away from the player, darkens under fake shadows and picks up warm light
 * from torches and braziers. Written as a custom shader so it stays cheap.
 */
export function createGrass(count, isBlocked) {
  const blade = new THREE.PlaneGeometry(0.09, 1, 1, 4);
  blade.translate(0, 0.5, 0);
  const pos = blade.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) * (1 - y * 0.92)); // taper to a point
    pos.setZ(i, y * y * 0.12); // slight natural curl
  }

  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uPlayer: { value: new THREE.Vector3() },
      uLightPos: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3(0, -999, 0)) },
      uLightCol: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3()) },
      uLightRange: { value: new Array(MAX_LIGHTS).fill(1) },
      uShadow: { value: Array.from({ length: MAX_SHADOWS }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uMoon: { value: new THREE.Vector3(MOON_COLOR.r, MOON_COLOR.g, MOON_COLOR.b) },
      uFogColor: { value: FOG_COLOR },
      uFogDensity: { value: FOG_DENSITY },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uPlayer;
      varying vec3 vColor;
      varying float vT;
      varying vec3 vWorld;
      varying float vFogDepth;
      void main() {
        float t = uv.y;
        vec3 root = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);

        float gust = sin(uTime * 0.35 + root.x * 0.04) * 0.5 + 0.5;
        float wave = sin(uTime * 1.7 + root.x * 0.33 + root.z * 0.21) * 0.6
                   + sin(uTime * 2.9 + root.z * 0.8) * 0.25;
        vec2 wind = normalize(vec2(1.0, 0.35));
        wp.xz += wind * (wave * 0.18 + gust * 0.22) * t * t;

        vec2 d = root.xz - uPlayer.xz;
        float dist = length(d);
        float push = smoothstep(1.7, 0.15, dist);
        wp.xz += (d / max(dist, 1e-3)) * push * 0.55 * t;
        wp.y -= push * 0.4 * t;

        vColor = instanceColor;
        vT = t;
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uLightPos[${MAX_LIGHTS}];
      uniform vec3 uLightCol[${MAX_LIGHTS}];
      uniform float uLightRange[${MAX_LIGHTS}];
      uniform vec4 uShadow[${MAX_SHADOWS}];
      uniform vec3 uMoon;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying vec3 vColor;
      varying float vT;
      varying vec3 vWorld;
      varying float vFogDepth;
      void main() {
        vec3 base = vColor * mix(0.18, 1.0, vT);

        float shade = 1.0;
        for (int i = 0; i < ${MAX_SHADOWS}; i++) {
          vec4 s = uShadow[i];
          if (s.z <= 0.0) continue;
          float d = length(vWorld.xz - s.xy) / s.z;
          shade *= 1.0 - s.w * smoothstep(1.0, 0.45, d);
        }

        vec3 light = uMoon * 0.95 * shade + vec3(0.03, 0.04, 0.06);
        for (int i = 0; i < ${MAX_LIGHTS}; i++) {
          vec3 L = uLightPos[i] - vWorld;
          float d = length(L);
          float fall = clamp(1.0 - d / uLightRange[i], 0.0, 1.0);
          light += uLightCol[i] * fall * fall * (0.6 + 0.4 * vT);
        }

        vec3 col = base * light;
        float fog = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
        col = mix(col, uFogColor, fog);
        gl_FragColor = vec4(col, ${setAlpha(SET.GRASS)});
      }
    `,
  });

  const mesh = new THREE.InstancedMesh(blade, material, count);
  mesh.frustumCulled = false;

  const r = rng(42);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  let placed = 0;
  let guard = 0;

  while (placed < count && guard++ < count * 4) {
    const a = r() * Math.PI * 2;
    const rad = Math.sqrt(r()) * WORLD_RADIUS;
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    if (insidePond(x, z, 0.4) || isBlocked(x, z)) continue;

    // Patchy meadow: taller clumps where a cheap noise is high.
    const n = Math.sin(x * 0.21) * Math.cos(z * 0.17) + Math.sin(x * 0.07 + z * 0.11);
    const tall = 0.45 + Math.max(0, n) * 0.45 + r() * 0.35;

    p.set(x, 0, z);
    q.setFromAxisAngle(up, r() * Math.PI * 2);
    s.set(0.7 + r() * 0.8, tall, 1);
    m.compose(p, q, s);
    mesh.setMatrixAt(placed, m);

    const roll = r();
    if (roll < 0.06) c.setHSL(0.13 + r() * 0.04, 0.45, 0.42); // dry straw
    else if (roll < 0.09) c.setHSL(0.07, 0.6, 0.38); // fallen-leaf rust
    else c.setHSL(0.3 + r() * 0.06, 0.42 + r() * 0.2, 0.26 + r() * 0.16);
    mesh.setColorAt(placed, c);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;

  mesh.userData.update = () => {
    const u = material.uniforms;
    u.uTime.value = env.time;
    u.uPlayer.value.copy(env.player);
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = env.lights[i];
      if (l) {
        u.uLightPos.value[i].copy(l.position);
        u.uLightCol.value[i].set(l.color.r, l.color.g, l.color.b).multiplyScalar(l.intensity);
        u.uLightRange.value[i] = l.range;
      } else {
        u.uLightPos.value[i].set(0, -999, 0);
        u.uLightCol.value[i].set(0, 0, 0);
      }
    }
    // Only shadows near the player matter on screen; keep the shader loop short.
    const near = env.shadows.filter(
      (sh) => sh.strength > 0 && Math.abs(sh.x - env.player.x) < 42 && Math.abs(sh.z - env.player.z) < 36
    );
    for (let i = 0; i < MAX_SHADOWS; i++) {
      const sh = near[i];
      if (sh) u.uShadow.value[i].set(sh.x, sh.z, sh.r, sh.strength);
      else u.uShadow.value[i].set(0, 0, 0, 0);
    }
  };
  return mesh;
}

/** Small white and amber flowers scattered through the meadow. */
export function createFlowers(count, isBlocked, tag) {
  const geo = new THREE.IcosahedronGeometry(0.06, 1);
  const mat = tag(new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x222222 }));
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const r = rng(7);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  let n = 0;
  for (let i = 0; i < count * 3 && n < count; i++) {
    const a = r() * Math.PI * 2;
    const rad = Math.sqrt(r()) * (WORLD_RADIUS - 4);
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    if (insidePond(x, z, 0.6) || isBlocked(x, z)) continue;
    m.makeTranslation(x, 0.35 + r() * 0.35, z);
    mesh.setMatrixAt(n, m);
    c.set(r() < 0.78 ? 0xe8ecf2 : r() < 0.5 ? 0xf0a040 : 0xd8584a);
    mesh.setColorAt(n, c);
    n++;
  }
  mesh.count = n;
  return mesh;
}

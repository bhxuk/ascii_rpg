import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { SET, tagMaterial, setAlpha } from '../ascii/glyphs.js';
import { env, rng, WORLD_RADIUS, insidePond, FOG_COLOR, MOON_DIR, MOON_COLOR } from './env.js';
import { createGrass, createFlowers } from './grass.js';

const tag = (mat, set) => tagMaterial(mat, set);

/**
 * Ashenmere Glade: a moonlit meadow ringed by autumn trees, a still pond that
 * mirrors the moon, and the ruins of an old shrine lit by braziers.
 */
export function createWorld(scene, renderer, { grassCount = 70000 } = {}) {
  const updaters = [];
  const RUINS = new THREE.Vector3(-15, 0, -9);

  // ---------------------------------------------------------------- lighting
  scene.fog = new THREE.FogExp2(FOG_COLOR, 0.016);
  scene.add(new THREE.HemisphereLight(0x50608a, 0x0d1208, 0.55));
  const moonLight = new THREE.DirectionalLight(MOON_COLOR, 1.1);
  moonLight.position.copy(MOON_DIR).multiplyScalar(50);
  scene.add(moonLight);

  // ------------------------------------------------------------------ ground
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(WORLD_RADIUS + 40, 64),
    tag(new THREE.MeshLambertMaterial({ color: 0x1c2a16 }), SET.GRASS)
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // ------------------------------------------------------------------ layout
  const blockers = []; // circles where grass should not grow
  const isBlocked = (x, z) => blockers.some((b) => (x - b.x) ** 2 + (z - b.z) ** 2 < b.r * b.r);
  blockers.push({ x: RUINS.x, z: RUINS.z, r: 3.2 }); // altar floor

  // --------------------------------------------------------------------- pond
  const p = env.pond;
  const shore = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    tag(new THREE.MeshLambertMaterial({ color: 0x1b1712 }), SET.STONE)
  );
  shore.rotation.x = -Math.PI / 2;
  shore.scale.set(p.rx + 0.9, p.rz + 0.9, 1);
  shore.position.set(p.x, 0.015, p.z);
  scene.add(shore);

  const pondGeo = new THREE.CircleGeometry(1, 64);
  const pond = new Reflector(pondGeo, {
    textureWidth: Math.floor(window.innerWidth * 0.6),
    textureHeight: Math.floor(window.innerHeight * 0.6),
    clipBias: 0.003,
    color: 0x8899aa,
    shader: waterShader(),
  });
  pond.rotation.x = -Math.PI / 2;
  pond.scale.set(p.rx, p.rz, 1);
  pond.position.set(p.x, 0.04, p.z);
  scene.add(pond);
  updaters.push(() => { pond.material.uniforms.uTime.value = env.time; });

  // Moss-dark stones around the bank.
  const stoneMat = tag(new THREE.MeshStandardMaterial({ color: 0x6d7073, roughness: 0.95, flatShading: true }), SET.STONE);
  const r = rng(99);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + r() * 0.2;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 + r() * 0.35, 0), stoneMat);
    rock.position.set(p.x + Math.cos(a) * (p.rx + 0.5), 0.05, p.z + Math.sin(a) * (p.rz + 0.5));
    rock.scale.y = 0.55;
    rock.rotation.set(r() * 3, r() * 3, r() * 3);
    scene.add(rock);
  }

  // ------------------------------------------------------------------- ruins
  const pillarMat = tag(new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.9, flatShading: true }), SET.STONE);
  const pillarCount = 8;
  for (let i = 0; i < pillarCount; i++) {
    const a = (i / pillarCount) * Math.PI * 2 + 0.3;
    const x = RUINS.x + Math.cos(a) * 6.2;
    const z = RUINS.z + Math.sin(a) * 6.2;
    const broken = i % 3 === 1;
    const h = broken ? 1.2 + r() * 1.4 : 4.2 + r() * 1.2;
    const pillar = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, h, 8), pillarMat);
    shaft.position.y = h / 2;
    pillar.add(shaft);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 1.6), pillarMat);
    base.position.y = 0.2;
    pillar.add(base);
    if (!broken) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 1.5), pillarMat);
      cap.position.y = h + 0.17;
      pillar.add(cap);
    }
    pillar.position.set(x, 0, z);
    pillar.rotation.y = r() * Math.PI;
    scene.add(pillar);
    env.obstacles.push({ x, z, r: 0.85 });
    blockers.push({ x, z, r: 0.9 });
    env.shadows.push({ x: x - MOON_DIR.x * h * 0.5, z: z - MOON_DIR.z * h * 0.5, r: 1.2, strength: 0.45 });
    if (broken) {
      // Fallen drum segment lying beside a broken pillar.
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.3, 8), pillarMat);
      drum.rotation.z = Math.PI / 2;
      drum.rotation.y = r() * Math.PI;
      const ox = x + Math.cos(a) * 1.8;
      const oz = z + Math.sin(a) * 1.8;
      drum.position.set(ox, 0.5, oz);
      scene.add(drum);
      env.obstacles.push({ x: ox, z: oz, r: 0.75 });
      blockers.push({ x: ox, z: oz, r: 0.8 });
    }
  }

  // Altar floor and slab.
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.8, 0.18, 10), pillarMat);
  floor.position.set(RUINS.x, 0.09, RUINS.z);
  scene.add(floor);
  const altar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.1), pillarMat);
  altar.position.set(RUINS.x, 0.6, RUINS.z);
  scene.add(altar);
  env.obstacles.push({ x: RUINS.x, z: RUINS.z, r: 1.2 });

  // Braziers either side of the altar.
  const fireMat = tag(new THREE.MeshBasicMaterial({ color: 0xffa040 }), SET.GLOW);
  const fireCore = tag(new THREE.MeshBasicMaterial({ color: 0xfff0b0 }), SET.GLOW);
  const ironMat = tag(new THREE.MeshStandardMaterial({ color: 0x2a2624, metalness: 0.6, roughness: 0.5 }), SET.METAL);
  [-1, 1].forEach((side, i) => {
    const bx = RUINS.x + side * 2.4;
    const bz = RUINS.z + 1.6;
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 1.1, 6), ironMat);
    stand.position.set(bx, 0.55, bz);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.22, 0.3, 8), ironMat);
    bowl.position.set(bx, 1.2, bz);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 7), fireMat);
    flame.position.set(bx, 1.7, bz);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.45, 6), fireCore);
    core.position.set(bx, 1.55, bz);
    scene.add(stand, bowl, flame, core);
    env.obstacles.push({ x: bx, z: bz, r: 0.45 });

    const light = new THREE.PointLight(0xff8a3a, 30, 16, 1.6);
    light.position.set(bx, 2.0, bz);
    scene.add(light);
    const shared = { position: light.position, color: new THREE.Color(0xff8a3a), intensity: 1.1, range: 11 };
    env.lights.push(shared);

    updaters.push(() => {
      const t = env.time * 9 + i * 5;
      const f = 0.85 + Math.sin(t) * 0.08 + Math.sin(t * 2.3) * 0.06 + Math.sin(t * 5.1) * 0.04;
      flame.scale.set(1, f * 1.1, 1);
      flame.rotation.y = env.time * 2;
      core.scale.set(1, f, 1);
      light.intensity = 30 * f;
      shared.intensity = 1.1 * f;
    });
  });

  // ------------------------------------------------------------------- trees
  const barkMat = tag(new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 1, flatShading: true }), SET.BARK);
  const leafMats = [0x8c2614, 0xa8381a, 0x6f1c10, 0xb85420, 0x9a2e18].map((c) =>
    tag(new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }), SET.FOLIAGE)
  );
  const pineMat = tag(new THREE.MeshStandardMaterial({ color: 0x1e3a26, roughness: 0.9, flatShading: true }), SET.FOLIAGE);
  const leafGeo = new THREE.IcosahedronGeometry(1, 1);
  {
    const lp = leafGeo.attributes.position;
    const jr = rng(5);
    for (let i = 0; i < lp.count; i++) {
      lp.setXYZ(i, lp.getX(i) * (0.85 + jr() * 0.3), lp.getY(i) * (0.8 + jr() * 0.3), lp.getZ(i) * (0.85 + jr() * 0.3));
    }
    leafGeo.computeVertexNormals();
  }

  const tr = rng(2024);
  const trees = [];
  const tryTree = (x, z) => {
    if (insidePond(x, z, 2.5)) return false;
    if (Math.hypot(x - RUINS.x, z - RUINS.z) < 9) return false;
    if (Math.hypot(x, z) < 9) return false; // keep the spawn clearing open
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 4.2)) return false;
    trees.push({ x, z });
    return true;
  };
  for (let i = 0; i < 900 && trees.length < 95; i++) {
    const a = tr() * Math.PI * 2;
    // Bias towards the rim so the glade feels enclosed.
    const rad = 10 + Math.pow(tr(), 0.55) * (WORLD_RADIUS + 6);
    tryTree(Math.cos(a) * rad, Math.sin(a) * rad);
  }

  for (const t of trees) {
    const g = new THREE.Group();
    const pine = tr() < 0.22;
    const h = 3.5 + tr() * 3;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.42, h, 6), barkMat);
    trunk.position.y = h / 2;
    g.add(trunk);
    let canopyR;
    if (pine) {
      canopyR = 2;
      for (let k = 0; k < 3; k++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(2.2 - k * 0.55, 2.6, 7), pineMat);
        cone.position.y = h * 0.55 + k * 1.4;
        g.add(cone);
      }
    } else {
      canopyR = 2.6 + tr() * 1.2;
      const mat = leafMats[Math.floor(tr() * leafMats.length)];
      const blobs = 4 + Math.floor(tr() * 3);
      for (let k = 0; k < blobs; k++) {
        const blob = new THREE.Mesh(leafGeo, mat);
        const a = tr() * Math.PI * 2;
        const d = k === 0 ? 0 : canopyR * 0.55;
        const s = canopyR * (k === 0 ? 0.85 : 0.5 + tr() * 0.25);
        blob.position.set(Math.cos(a) * d, h + tr() * 1.2 - 0.3, Math.sin(a) * d);
        blob.scale.setScalar(s);
        blob.rotation.set(tr() * 3, tr() * 3, tr() * 3);
        g.add(blob);
      }
    }
    g.position.set(t.x, 0, t.z);
    g.rotation.y = tr() * Math.PI * 2;
    g.scale.setScalar(0.85 + tr() * 0.35);
    scene.add(g);
    env.obstacles.push({ x: t.x, z: t.z, r: 0.55 });
    blockers.push({ x: t.x, z: t.z, r: 0.5 });
    env.shadows.push({
      x: t.x - MOON_DIR.x * 2.2, z: t.z - MOON_DIR.z * 2.2,
      r: canopyR * 1.15, strength: 0.5,
    });
  }

  // Scattered boulders.
  for (let i = 0; i < 30; i++) {
    const a = r() * Math.PI * 2;
    const rad = 8 + r() * (WORLD_RADIUS - 10);
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    if (insidePond(x, z, 1.5) || isBlocked(x, z)) continue;
    const size = 0.4 + r() * 0.9;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), stoneMat);
    rock.position.set(x, size * 0.3, z);
    rock.scale.y = 0.6;
    rock.rotation.set(r() * 3, r() * 3, r() * 3);
    scene.add(rock);
    if (size > 0.7) env.obstacles.push({ x, z, r: size * 0.9 });
    blockers.push({ x, z, r: size * 0.8 });
  }

  // ------------------------------------------------------------- grass etc.
  const grass = createGrass(grassCount, isBlocked);
  scene.add(grass);
  updaters.push(grass.userData.update);
  scene.add(createFlowers(1400, isBlocked, (m) => tag(m, SET.DEFAULT)));

  const fireflies = createFireflies(260);
  scene.add(fireflies);
  updaters.push(() => { fireflies.material.uniforms.uTime.value = env.time; });

  const embers = createEmbers(RUINS);
  scene.add(embers);
  updaters.push(() => { embers.material.uniforms.uTime.value = env.time; });

  // --------------------------------------------------------------- moon/sky
  const sky = createSky();
  scene.add(sky.group);

  return {
    update(camera) {
      for (const u of updaters) u();
      sky.place(camera);
    },
    spawnPoint: new THREE.Vector3(0, 0, 2),
    ruins: RUINS,
  };
}

/** Water: the reflected scene with ripples, tinted deep blue, darker at the edges. */
function waterShader() {
  return {
    name: 'GlyphWater',
    uniforms: {
      color: { value: null },
      tDiffuse: { value: null },
      textureMatrix: { value: null },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform mat4 textureMatrix;
      varying vec4 vUv;
      varying vec2 vLocal;
      void main() {
        vUv = textureMatrix * vec4(position, 1.0);
        vLocal = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform sampler2D tDiffuse;
      uniform float uTime;
      varying vec4 vUv;
      varying vec2 vLocal;
      void main() {
        vec2 rip = vec2(
          sin(vLocal.y * 22.0 + uTime * 1.3) + sin(vLocal.x * 13.0 - uTime * 0.9),
          cos(vLocal.x * 19.0 + uTime * 1.1)
        ) * 0.0035;
        vec4 uv = vUv;
        uv.xy += rip * uv.w;
        vec3 refl = texture2DProj(tDiffuse, uv).rgb;
        float edge = smoothstep(1.0, 0.7, length(vLocal));
        vec3 deep = vec3(0.01, 0.018, 0.03);
        vec3 col = mix(deep, refl * 0.7 + deep, edge);
        gl_FragColor = vec4(col, ${setAlpha(SET.WATER)});
      }
    `,
  };
}

/** Drifting fireflies across the meadow. */
function createFireflies(count) {
  const r = rng(77);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2;
    const rad = Math.sqrt(r()) * (WORLD_RADIUS - 6);
    pos[i * 3] = Math.cos(a) * rad;
    pos[i * 3 + 1] = 0.6 + r() * 2.4;
    pos[i * 3 + 2] = Math.sin(a) * rad;
    seed[i] = r() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute float seed;
      varying float vGlow;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.4 + seed) * 1.6;
        p.z += cos(uTime * 0.33 + seed * 1.7) * 1.6;
        p.y += sin(uTime * 0.9 + seed * 3.1) * 0.4;
        vGlow = 0.5 + 0.5 * sin(uTime * 2.2 + seed * 5.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(90.0 / -mv.z, 2.0, 7.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vGlow;
      void main() {
        if (length(gl_PointCoord - 0.5) > 0.5 || vGlow < 0.25) discard;
        gl_FragColor = vec4(vec3(1.6, 1.1, 0.35) * vGlow, ${setAlpha(SET.GLOW)});
      }
    `,
  });
  return new THREE.Points(geo, mat);
}

/** Sparks rising from the braziers. */
function createEmbers(center) {
  const count = 90;
  const r = rng(31);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const side = i % 2 ? 1 : -1;
    pos[i * 3] = center.x + side * 2.4;
    pos[i * 3 + 1] = 1.6;
    pos[i * 3 + 2] = center.z + 1.6;
    seed[i] = r() * 10;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute float seed;
      varying float vLife;
      void main() {
        float life = fract(uTime * 0.35 + seed);
        vec3 p = position;
        p.y += life * 4.5;
        p.x += sin(seed * 12.0 + uTime * 2.0) * life * 0.9;
        p.z += cos(seed * 7.0 + uTime * 1.5) * life * 0.9;
        vLife = life;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(70.0 / -mv.z, 2.0, 6.0) * (1.0 - life);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vLife;
      void main() {
        if (length(gl_PointCoord - 0.5) > 0.5) discard;
        gl_FragColor = vec4(vec3(2.0, 0.8, 0.2) * (1.0 - vLife), ${setAlpha(SET.GLOW)});
      }
    `,
  });
  return new THREE.Points(geo, mat);
}

/**
 * The moon and a few clouds. They are only ever seen in the pond, so each
 * frame they are placed along the mirror ray from the camera through the
 * pond centre, which keeps the moon sitting in the water.
 */
function createSky() {
  const group = new THREE.Group();

  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d9dde3';
  ctx.fillRect(0, 0, 256, 256);
  const r = rng(11);
  for (let i = 0; i < 70; i++) {
    const x = r() * 256, y = r() * 256, rad = 4 + r() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const shade = 140 + Math.floor(r() * 60);
    g.addColorStop(0, `rgba(${shade},${shade + 4},${shade + 10},0.75)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(26, 32, 16),
    tag(new THREE.MeshBasicMaterial({ map: tex, fog: false, color: 0xc8ccd4 }), SET.METAL)
  );
  group.add(moon);

  const cloudMat = tag(new THREE.MeshBasicMaterial({ color: 0x12161e, fog: false }), SET.DEFAULT);
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const cl = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), cloudMat);
    cl.scale.set(30 + r() * 30, 6 + r() * 6, 14 + r() * 12);
    cl.userData.offset = new THREE.Vector3((r() - 0.5) * 220, (r() - 0.5) * 40 - 20, (r() - 0.5) * 120);
    group.add(cl);
    clouds.push(cl);
  }

  const pondCenter = new THREE.Vector3(env.pond.x, 0, env.pond.z);
  const dir = new THREE.Vector3();
  const right = new THREE.Vector3();
  const upv = new THREE.Vector3(0, 1, 0);

  return {
    group,
    place(camera) {
      dir.subVectors(pondCenter, camera.position).normalize();
      dir.y = -dir.y; // mirror off the water plane
      const far = 420;
      moon.position.copy(pondCenter).addScaledVector(dir, far);
      right.crossVectors(dir, upv).normalize();
      for (const cl of clouds) {
        const o = cl.userData.offset;
        cl.position.copy(pondCenter).addScaledVector(dir, far + 40 + o.z)
          .addScaledVector(right, o.x + Math.sin(env.time * 0.02 + o.x) * 8)
          .add(new THREE.Vector3(0, o.y, 0));
      }
    },
  };
}

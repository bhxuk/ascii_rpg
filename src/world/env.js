import * as THREE from 'three';

/** Seeded RNG so the world layout is the same every load. */
export function rng(seed = 1337) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const WORLD_RADIUS = 58;

export const FOG_COLOR = new THREE.Color(0x0a0f17);
export const FOG_DENSITY = 0.016;

export const MOON_DIR = new THREE.Vector3(-0.35, 1, -0.55).normalize();
export const MOON_COLOR = new THREE.Color(0x8fa6d8);

/**
 * Shared state that custom shaders (grass) read every frame so they match the
 * built-in lit materials: warm point lights and fake circular shadows.
 */
export const env = {
  time: 0,
  player: new THREE.Vector3(),
  lights: [], // { position: Vector3, color: Color, intensity: number, range: number }
  shadows: [], // { x, z, r, strength }
  obstacles: [], // { x, z, r }  for collision
  pond: { x: 9, z: 9, rx: 7.5, rz: 5.2 },
};

export const MAX_LIGHTS = 6;
export const MAX_SHADOWS = 64;

export function insidePond(x, z, pad = 0) {
  const p = env.pond;
  const dx = (x - p.x) / (p.rx + pad);
  const dz = (z - p.z) / (p.rz + pad);
  return dx * dx + dz * dz < 1;
}

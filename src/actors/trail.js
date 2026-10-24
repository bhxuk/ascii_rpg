import * as THREE from 'three';
import { SET, setAlpha } from '../ascii/glyphs.js';
import { SWING, swingPose } from './models.js';

const SAMPLES = 28;
const SPAN = 0.22; // how much swing time the trail covers

// Rig measurements (see buildKnight): torso height, shoulder offset.
const TORSO_Y = 0.92;
const SHOULDER = new THREE.Vector3(-0.33, 0.69, 0);

const _s = new THREE.Vector3();
const _d = new THREE.Vector3();

/**
 * Where the sword is at swing time t, in the knight's local space.
 * Mirrors the joint chain: torso twist -> shoulder (yaw, pitch) -> straight
 * arm -> blade in line with the arm. Returns the inner and outer edge of the
 * band the blade sweeps through.
 */
function bladeAt(t, inner, outer) {
  const p = swingPose(t);
  // Shoulder position after the torso twist.
  const ct = Math.cos(p.twist), st = Math.sin(p.twist);
  _s.set(SHOULDER.x * ct + SHOULDER.z * st, TORSO_Y + SHOULDER.y, -SHOULDER.x * st + SHOULDER.z * ct);
  // Arm direction: pitch about X, then yaw (torso twist + shoulder yaw) about Y.
  const y = -Math.cos(p.pitch);
  const z = -Math.sin(p.pitch);
  const yaw = p.twist + p.yaw;
  _d.set(z * Math.sin(yaw), y, z * Math.cos(yaw));
  inner.copy(_s).addScaledVector(_d, SWING.armLength + 0.5);
  outer.copy(_s).addScaledVector(_d, SWING.armLength + SWING.bladeReach);
}

/**
 * A glowing ribbon that follows the sword tip through a slash. It is built
 * from the same swing curve that drives the arm, sampled finely, so it sits
 * exactly where the blade went (in front of the knight) even at low frame
 * rates. The ribbon tapers and dims as it ages.
 */
export class SwordTrail {
  constructor(parent) {
    const verts = SAMPLES * 2;
    this.positions = new Float32Array(verts * 3);
    this.age = new Float32Array(verts);
    const side = new Float32Array(verts);
    const index = [];
    for (let i = 0; i < SAMPLES; i++) {
      side[i * 2] = 0;
      side[i * 2 + 1] = 1;
      if (i < SAMPLES - 1) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        index.push(a, b, c, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('aAge', new THREE.BufferAttribute(this.age, 1));
    geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    geo.setIndex(index);
    this.geo = geo;

    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute float aAge;
        attribute float aSide;
        varying float vAge;
        varying float vSide;
        void main() {
          vAge = aAge;
          vSide = aSide;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAge;
        varying float vSide;
        void main() {
          if (vAge >= 1.0 || vSide < vAge * 0.9) discard;
          vec3 hot = vec3(2.4, 2.6, 3.0);
          vec3 cool = vec3(0.35, 0.75, 1.9);
          vec3 col = mix(hot, cool, smoothstep(0.0, 0.7, vAge)) * (1.0 - vAge * 0.55);
          col *= mix(0.6, 1.0, vSide); // brightest along the tip's path
          gl_FragColor = vec4(col, ${setAlpha(SET.GLOW)});
        }
      `,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    parent.add(this.mesh);

    this.inner = new THREE.Vector3();
    this.outer = new THREE.Vector3();
  }

  /** t: current swing time (0..1), or < 0 when not swinging. */
  update(t) {
    const start = SWING.windUp;
    const head = Math.min(t, SWING.slashEnd);
    const tail = Math.max(start, t - SPAN);
    if (t < 0 || t < start || tail >= head) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    for (let i = 0; i < SAMPLES; i++) {
      const ts = head - ((head - tail) * i) / (SAMPLES - 1);
      bladeAt(ts, this.inner, this.outer);
      this.positions.set([this.inner.x, this.inner.y, this.inner.z], i * 6);
      this.positions.set([this.outer.x, this.outer.y, this.outer.z], i * 6 + 3);
      const age = Math.min(1, Math.max(0, (t - ts) / SPAN));
      this.age[i * 2] = age;
      this.age[i * 2 + 1] = age;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAge.needsUpdate = true;
  }
}

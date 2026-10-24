import * as THREE from 'three';
import { SET, tagMaterial } from '../ascii/glyphs.js';
import { env } from '../world/env.js';

/** Short-lived visual effects. Each one updates itself and reports when done. */
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.boltMat = tagMaterial(new THREE.MeshBasicMaterial({ color: 0xbfe0ff }), SET.GLOW);
    this.healMat = tagMaterial(new THREE.MeshBasicMaterial({ color: 0x6dff8a, side: THREE.DoubleSide }), SET.GLOW);
    this.goldMat = tagMaterial(new THREE.MeshBasicMaterial({ color: 0xffd060 }), SET.GLOW);
  }

  add(fx) { this.list.push(fx); }

  update(dt) {
    this.list = this.list.filter((fx) => {
      const alive = fx.update(dt);
      if (!alive) fx.dispose();
      return alive;
    });
  }

  /** A jagged bolt of lightning from the sky onto a point, with a flash of light. */
  lightning(target) {
    const group = new THREE.Group();
    const top = target.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 16, (Math.random() - 0.5) * 3));
    const pts = [top];
    const segs = 9;
    for (let i = 1; i < segs; i++) {
      const p = new THREE.Vector3().lerpVectors(top, target, i / segs);
      p.x += (Math.random() - 0.5) * 1.4;
      p.z += (Math.random() - 0.5) * 1.4;
      pts.push(p);
    }
    pts.push(target.clone());
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = a.distanceTo(b);
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.16, len, 0.16), this.boltMat);
      seg.position.lerpVectors(a, b, 0.5);
      seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      group.add(seg);
    }
    const burst = new THREE.Mesh(new THREE.RingGeometry(0.2, 1.6, 24), this.boltMat);
    burst.rotation.x = -Math.PI / 2;
    burst.position.copy(target).setY(0.1);
    group.add(burst);
    this.scene.add(group);

    const light = new THREE.PointLight(0x9fc8ff, 120, 20, 1.5);
    light.position.copy(target).setY(3);
    this.scene.add(light);
    const shared = { position: light.position, color: new THREE.Color(0x9fc8ff), intensity: 2.5, range: 14 };
    env.lights.push(shared);

    let t = 0;
    this.add({
      update: (dt) => {
        t += dt;
        const k = 1 - t / 0.35;
        group.visible = Math.sin(t * 90) > -0.4;
        light.intensity = 120 * Math.max(0, k);
        shared.intensity = 2.5 * Math.max(0, k);
        burst.scale.setScalar(1 + t * 4);
        return t < 0.35;
      },
      dispose: () => {
        this.scene.remove(group, light);
        group.traverse((o) => o.geometry?.dispose());
        env.lights.splice(env.lights.indexOf(shared), 1);
      },
    });
  }

  /** Rising green rings around a character. */
  heal(object) {
    const rings = [];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 32), this.healMat);
      ring.rotation.x = -Math.PI / 2;
      object.add(ring);
      rings.push(ring);
    }
    let t = 0;
    this.add({
      update: (dt) => {
        t += dt;
        rings.forEach((r, i) => {
          const k = (t * 1.2 + i * 0.33) % 1;
          r.position.y = k * 2.4;
          r.scale.setScalar(1.1 - k * 0.5);
        });
        return t < 1.2;
      },
      dispose: () => rings.forEach((r) => { object.remove(r); r.geometry.dispose(); }),
    });
  }

  /** A little burst of gold sparks where loot dropped. */
  sparkle(position) {
    const bits = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), this.goldMat);
      m.position.copy(position).setY(1);
      m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 3, 3 + Math.random() * 2, (Math.random() - 0.5) * 3);
      this.scene.add(m);
      bits.push(m);
    }
    let t = 0;
    this.add({
      update: (dt) => {
        t += dt;
        for (const b of bits) {
          b.userData.v.y -= 9 * dt;
          b.position.addScaledVector(b.userData.v, dt);
          if (b.position.y < 0.1) { b.position.y = 0.1; b.userData.v.set(0, 0, 0); }
        }
        return t < 1.2;
      },
      dispose: () => bits.forEach((b) => { this.scene.remove(b); b.geometry.dispose(); }),
    });
  }
}

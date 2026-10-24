import * as THREE from 'three';
import { AsciiPass } from '../ascii/AsciiPass.js';
import { createWorld } from '../world/world.js';
import { env } from '../world/env.js';
import { Player, Skeleton } from '../actors/actors.js';
import { Effects } from '../game/effects.js';
import { LOGO } from '../ui/logo.js';

document.getElementById('hero-logo').textContent = LOGO;

/**
 * Hero background: the real game engine running in "attract mode". The
 * camera slowly circles Sir Aldric by the pond while skeletons wander, he
 * swings his sword now and then and lightning cracks down in the distance.
 */
function startHero() {
  const host = document.getElementById('hero-bg');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  } catch {
    return; // no WebGL: the page still works, just without the live background
  }
  const pr = Math.min(window.devicePixelRatio, 1.5);
  renderer.setPixelRatio(pr);
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 1200);
  const ascii = new AsciiPass(renderer);
  ascii.setCellHeight(6);

  const world = createWorld(scene, renderer, { grassCount: 32000 });
  const effects = new Effects(scene);
  const knight = new Player(scene, new THREE.Vector3(2.5, 0, 2.5));
  knight.facing = 0.8;

  const skeletons = [
    new Skeleton(scene, new THREE.Vector3(-6, 0, -3), 2),
    new Skeleton(scene, new THREE.Vector3(-4, 0, -6), 2),
    new Skeleton(scene, new THREE.Vector3(12, 0, -4), 2),
  ];
  // Skeletons chase whatever is in range; give them a decoy far away so they just wander.
  const decoy = { position: new THREE.Vector3(999, 0, 999), alive: false };
  const noEvents = { playerHit() {} };

  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    ascii.setSize(w, h, pr);
  };
  resize();
  window.addEventListener('resize', resize);

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(host);

  const timer = new THREE.Timer();
  timer.connect(document);
  let nextSwing = 2;
  let nextBolt = 5;

  function frame(now) {
    requestAnimationFrame(frame);
    timer.update(now);
    if (!visible) return;
    const dt = Math.min(timer.getDelta(), 0.05);
    env.time += dt;

    knight.update(dt, {}, 0);
    for (const s of skeletons) s.update(dt, decoy, noEvents);
    effects.update(dt);

    nextSwing -= dt;
    if (nextSwing <= 0) {
      if (Math.random() < 0.35) knight.spin(); else knight.attack();
      knight.strikeWindow();
      nextSwing = 3 + Math.random() * 3;
    }
    nextBolt -= dt;
    if (nextBolt <= 0) {
      const a = Math.random() * Math.PI * 2;
      effects.lightning(new THREE.Vector3(Math.cos(a) * 14, 0, Math.sin(a) * 14 - 4));
      nextBolt = 7 + Math.random() * 5;
    }

    // Slow orbit around the knight.
    // Look past the knight so he sits in the lower third, below the logo.
    const t = env.time * 0.05;
    const target = knight.position;
    const ox = Math.sin(t), oz = Math.cos(t);
    camera.position.set(target.x + ox * 7.5, 8.5, target.z + oz * 7.5);
    camera.lookAt(target.x - ox * 4.2, 0.6, target.z - oz * 4.2);

    world.update(camera, 1.2);
    ascii.render(scene, camera, env.time);
  }
  requestAnimationFrame(frame);
}

// Let the page paint first, then spin up the 3D world behind the hero.
requestAnimationFrame(() => setTimeout(startHero, 50));

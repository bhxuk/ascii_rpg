import * as THREE from 'three';
import { AsciiPass } from './ascii/AsciiPass.js';
import { createWorld } from './world/world.js';
import { env } from './world/env.js';
import { Player, Skeleton } from './actors/actors.js';
import { Hud } from './ui/hud.js';

const params = new URLSearchParams(location.search);

// ------------------------------------------------------------------ renderer
const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
const pixelRatio = Math.min(window.devicePixelRatio, 2);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.autoClear = true;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.5, 1200);

const ascii = new AsciiPass(renderer);
ascii.setSize(window.innerWidth, window.innerHeight, pixelRatio);
if (params.has('cell')) ascii.setCellHeight(Number(params.get('cell')));
if (params.has('debug3d')) ascii.enabled = false; // developer-only: view the scene before ASCII conversion

// --------------------------------------------------------------------- world
const world = createWorld(scene, renderer, {
  grassCount: params.has('grass') ? Number(params.get('grass')) : 70000,
});

const hud = new Hud();
const player = new Player(scene, world.spawnPoint);
if (params.has('x')) player.position.set(Number(params.get('x')), 0, Number(params.get('z') || 0));

const enemies = [];
const camps = [
  { x: world.ruins.x + 1, z: world.ruins.z + 8, n: 3, lv: 5 },
  { x: 22, z: -6, n: 2, lv: 4 },
  { x: -4, z: 22, n: 2, lv: 3 },
  { x: 6, z: -24, n: 2, lv: 6 },
];
for (const c of camps) {
  for (let i = 0; i < c.n; i++) {
    const a = (i / c.n) * Math.PI * 2;
    enemies.push(new Skeleton(scene, new THREE.Vector3(c.x + Math.cos(a) * 2.5, 0, c.z + Math.sin(a) * 2.5), c.lv));
  }
}

// --------------------------------------------------------------------- input
const input = { up: false, down: false, left: false, right: false, run: false };
const keyMap = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
};
let started = params.has('shot');
if (started) hud.dismissTitle();

let camYaw = 0;
let camYawTarget = 0;
let zoom = 1;

window.addEventListener('keydown', (e) => {
  if (!started) { started = true; hud.dismissTitle(); return; }
  if (keyMap[e.code]) input[keyMap[e.code]] = true;
  switch (e.code) {
    case 'Space': tryAttack(); e.preventDefault(); break;
    case 'BracketLeft': ascii.setCellHeight(ascii.cellHeight - 1); break;
    case 'BracketRight': ascii.setCellHeight(ascii.cellHeight + 1); break;
    case 'KeyQ': camYawTarget += Math.PI / 4; break;
    case 'KeyE': camYawTarget -= Math.PI / 4; break;
    case 'KeyH': hud.toggleHints(); break;
  }
});
window.addEventListener('keyup', (e) => { if (keyMap[e.code]) input[keyMap[e.code]] = false; });
window.addEventListener('blur', () => { for (const k in input) input[k] = false; });
window.addEventListener('mousedown', (e) => {
  if (!started) { started = true; hud.dismissTitle(); return; }
  if (e.button === 0) tryAttack();
});
window.addEventListener('wheel', (e) => {
  zoom = THREE.MathUtils.clamp(zoom * (e.deltaY > 0 ? 1.1 : 0.9), 0.45, 1.8);
}, { passive: true });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  ascii.setSize(window.innerWidth, window.innerHeight, pixelRatio);
});

// -------------------------------------------------------------------- combat
let target = null;

function tryAttack() {
  if (!player.alive) return;
  player.attack();
}

function resolvePlayerStrike() {
  const fwd = new THREE.Vector3(Math.sin(player.facing), 0, Math.cos(player.facing));
  for (const e of enemies) {
    if (!e.alive) continue;
    const to = new THREE.Vector3().subVectors(e.position, player.position);
    to.y = 0;
    const d = to.length();
    if (d > 2.4) continue;
    if (d > 0.6 && fwd.dot(to.normalize()) < 0.25) continue;
    const crit = Math.random() < 0.15;
    const dmg = Math.round((14 + Math.random() * 11) * (crit ? 2 : 1));
    e.takeHit(dmg);
    target = e;
    hud.floatText(e.position.clone().add(new THREE.Vector3(0, 2.1, 0)), crit ? `${dmg}!` : `${dmg}`, crit ? 'crit' : '');
    if (!e.alive) {
      const xp = 40 + e.level * 12;
      const gold = 3 + Math.floor(Math.random() * 6) + e.level;
      player.xp += xp;
      player.gold += gold;
      hud.message(`The ${e.name} crumbles. +${xp} xp, +${gold} gold`);
      if (player.xp >= player.xpNext) {
        player.xp -= player.xpNext;
        player.level++;
        player.xpNext = Math.round(player.xpNext * 1.35);
        player.maxHp += 22; player.hp = player.maxHp;
        player.maxMp += 8; player.mp = player.maxMp;
        hud.message(`** You reached level ${player.level} **`);
        hud.floatText(player.position.clone().add(new THREE.Vector3(0, 2.6, 0)), 'LEVEL UP', 'crit');
      }
    }
  }
}

const events = {
  playerHit(dmg, enemy) {
    if (!player.alive) return;
    player.hp -= dmg;
    player.hurtFlash = 1;
    target = target && target.alive ? target : enemy;
    hud.floatText(player.position.clone().add(new THREE.Vector3(0, 2.2, 0)), `-${dmg}`, 'hurt');
    if (player.hp <= 0) {
      player.hp = 0;
      hud.message('You have fallen. The glade grows quiet...');
      setTimeout(() => {
        player.hp = player.maxHp;
        player.position.copy(world.spawnPoint);
        hud.message('You rise again at the edge of the glade.');
      }, 3500);
    }
  },
};

hud.message('You awaken in Ashenmere Glade. The dead do not rest here.');

// ---------------------------------------------------------------------- loop
const timer = new THREE.Timer();
timer.connect(document);
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
camTarget.copy(player.position);

function frame(now) {
  timer.update(now);
  const dt = Math.min(timer.getDelta(), 0.05);
  const cpuStart = performance.now();
  env.time += dt;

  camYaw += (camYawTarget - camYaw) * Math.min(1, dt * 6);

  if (player.alive) player.update(dt, started ? input : {}, camYaw);
  else player.update(dt, {}, camYaw);
  if (player.strikeWindow()) resolvePlayerStrike();
  for (const e of enemies) e.update(dt, player, events);

  // Third-person camera from high above, like a classic top-down RPG.
  camTarget.lerp(player.position, Math.min(1, dt * 5));
  const dist = 14 * zoom;
  const pitch = 1.02;
  camPos.set(
    camTarget.x + Math.sin(camYaw) * Math.cos(pitch) * dist,
    camTarget.y + Math.sin(pitch) * dist,
    camTarget.z + Math.cos(camYaw) * Math.cos(pitch) * dist
  );
  camera.position.copy(camPos);
  camera.lookAt(camTarget.x, camTarget.y + 0.8, camTarget.z);

  world.update(camera);

  // HUD
  if (!target || !target.alive || target.position.distanceTo(player.position) > 14) {
    target = enemies
      .filter((e) => e.alive && e.position.distanceTo(player.position) < 8)
      .sort((a, b) => a.position.distanceTo(player.position) - b.position.distanceTo(player.position))[0] || null;
  }
  hud.updatePlayer(player);
  hud.updateTarget(target);
  const head = new THREE.Vector3();
  hud.nameplate('player', head.copy(player.position).setY(2.55), camera, player.name);
  for (const e of enemies) {
    if (e.alive) hud.nameplate(`e${e.id}`, head.copy(e.position).setY(2.15), camera, e.name, 'enemy', e.hp, e.maxHp);
    else hud.hideNameplate(`e${e.id}`);
  }
  hud.updateFloaters(dt, camera);

  ascii.render(scene, camera, env.time);
  hud.tickPerf(dt, performance.now() - cpuStart);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Small hook for automated screenshots and debugging.
window.__game = { player, enemies, ascii, env, input, setYaw: (y) => { camYaw = camYawTarget = y; } };

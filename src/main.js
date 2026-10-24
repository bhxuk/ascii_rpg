import * as THREE from 'three';
import { AsciiPass } from './ascii/AsciiPass.js';
import { createWorld } from './world/world.js';
import { env } from './world/env.js';
import { Player, Skeleton, HollowKing } from './actors/actors.js';
import { Hud } from './ui/hud.js';
import { Effects } from './game/effects.js';
import {
  loadSettings, saveSettings, loadGame, saveGame, clearGame, GRASS_COUNTS, DETAIL_CELL,
} from './game/storage.js';

const params = new URLSearchParams(location.search);
const settings = loadSettings();
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ renderer
const container = $('game');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
const pixelRatio = Math.min(window.devicePixelRatio, 2);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.5, 1200);

const ascii = new AsciiPass(renderer);
ascii.setSize(window.innerWidth, window.innerHeight, pixelRatio);
if (params.has('debug3d')) ascii.enabled = false; // developer-only: the scene before ASCII conversion

let baseCell = params.has('cell') ? Number(params.get('cell')) : DETAIL_CELL[settings.detail] || 9;

// --------------------------------------------------------------------- world
const world = createWorld(scene, renderer, {
  grassCount: params.has('grass') ? Number(params.get('grass')) : GRASS_COUNTS[settings.grass] || 60000,
});

const hud = new Hud();
hud.setFpsVisible(settings.showFps);
const effects = new Effects(scene);
const player = new Player(scene, world.spawnPoint);

const save = params.has('fresh') ? null : loadGame();
const quest = { kills: 0, goal: 12, bossSpawned: false, bossDefeated: false, totalKills: 0, deaths: 0 };
if (save) {
  player.restore(save.player);
  Object.assign(quest, save.quest || {});
}
if (params.has('x')) player.position.set(Number(params.get('x')), 0, Number(params.get('z') || 0));

const enemies = [];
const camps = [
  { x: world.ruins.x + 1, z: world.ruins.z + 9, n: 3, lv: 4 },
  { x: 22, z: -6, n: 3, lv: 2 },
  { x: -4, z: 22, n: 2, lv: 1 },
  { x: 6, z: -24, n: 3, lv: 3 },
  { x: 30, z: 20, n: 2, lv: 2 },
];
for (const c of camps) {
  for (let i = 0; i < c.n; i++) {
    const a = (i / c.n) * Math.PI * 2;
    enemies.push(new Skeleton(scene, new THREE.Vector3(c.x + Math.cos(a) * 2.5, 0, c.z + Math.sin(a) * 2.5), c.lv));
  }
}

let boss = null;
function spawnBoss(announce = true) {
  if (!boss) {
    boss = new HollowKing(scene, new THREE.Vector3(world.ruins.x, 0, world.ruins.z + 4.5));
    enemies.push(boss);
  } else {
    boss.reset();
  }
  quest.bossSpawned = true;
  if (announce) {
    hud.message('The ground shudders. The Hollow King rises in the western ruins!');
    shake(0.6);
  }
}

// ------------------------------------------------------------------- skills
const skills = {
  whirl: { key: '1', name: 'Whirlwind', cost: 20, cooldown: 5, cd: 0 },
  bolt: { key: '2', name: 'Lightning', cost: 30, cooldown: 7, cd: 0 },
  mend: { key: '3', name: 'Mend', cost: 35, cooldown: 14, cd: 0 },
  potion: { key: 'F', name: 'Potion', cost: 0, cooldown: 1.5, cd: 0 },
};

function canCast(s) { return player.alive && s.cd <= 0 && player.mp >= s.cost; }

function castWhirl() {
  const s = skills.whirl;
  if (!canCast(s) || player.busy) return;
  player.mp -= s.cost;
  s.cd = s.cooldown;
  player.spin();
}

function castBolt() {
  const s = skills.bolt;
  if (!canCast(s)) return;
  const candidates = enemies
    .filter((e) => e.alive && e.position.distanceTo(player.position) < 16)
    .sort((a, b) => a.position.distanceTo(player.position) - b.position.distanceTo(player.position));
  const victim = target && target.alive && target.position.distanceTo(player.position) < 16 ? target : candidates[0];
  if (!victim) { hud.message('No enemy in range for Lightning.'); return; }
  player.mp -= s.cost;
  s.cd = s.cooldown;
  effects.lightning(victim.position.clone());
  shake(0.15);
  damageEnemy(victim, Math.round((55 + Math.random() * 25) * player.power), Math.random() < 0.2);
}

function castMend() {
  const s = skills.mend;
  if (!canCast(s)) return;
  if (player.hp >= player.maxHp) { hud.message('You are already at full health.'); return; }
  player.mp -= s.cost;
  s.cd = s.cooldown;
  const heal = Math.round(player.maxHp * 0.4);
  player.hp = Math.min(player.maxHp, player.hp + heal);
  effects.heal(player.object);
  hud.floatText(player.position.clone().setY(2.4), `+${heal}`, 'heal');
}

function drinkPotion() {
  const s = skills.potion;
  if (!player.alive || s.cd > 0) return;
  if (player.potions <= 0) { hud.message('You have no potions left.'); return; }
  if (player.hp >= player.maxHp) { hud.message('You are already at full health.'); return; }
  player.potions--;
  s.cd = s.cooldown;
  const heal = Math.round(player.maxHp * 0.5);
  player.hp = Math.min(player.maxHp, player.hp + heal);
  effects.heal(player.object);
  hud.floatText(player.position.clone().setY(2.4), `+${heal}`, 'heal');
}

// -------------------------------------------------------------------- combat
let target = null;
let shakeAmount = 0;
function shake(a) { shakeAmount = Math.max(shakeAmount, a); }

function damageEnemy(e, dmg, crit) {
  const died = e.takeHit(dmg);
  target = e;
  hud.floatText(e.position.clone().setY(2.1 * e.scale), crit ? `${dmg}!` : `${dmg}`, crit ? 'crit' : '');
  if (died) onEnemyKilled(e);
}

function onEnemyKilled(e) {
  const gold = e.isBoss ? 250 : 3 + Math.floor(Math.random() * 6) + e.level * 2;
  player.gold += gold;
  gainXp(e.xpValue);
  effects.sparkle(e.position);
  quest.totalKills++;
  let loot = '';
  const potionDrop = e.isBoss ? 3 : Math.random() < 0.22 ? 1 : 0;
  if (potionDrop) { player.potions += potionDrop; loot = `, ${potionDrop} potion${potionDrop > 1 ? 's' : ''}`; }
  hud.message(`${e.isBoss ? 'The Hollow King falls' : `The ${e.name} crumbles`}. +${e.xpValue} xp, +${gold} gold${loot}`);

  if (e.isBoss) {
    quest.bossDefeated = true;
    persist();
    setTimeout(showVictory, 1600);
  } else if (!quest.bossSpawned) {
    quest.kills++;
    if (quest.kills >= quest.goal) spawnBoss();
  }
}

function gainXp(xp) {
  player.xp += xp;
  while (player.xp >= player.xpNext) {
    player.xp -= player.xpNext;
    player.level++;
    player.xpNext = Math.round(player.xpNext * 1.4);
    player.maxHp += 24; player.hp = player.maxHp;
    player.maxMp += 10; player.mp = player.maxMp;
    player.power *= 1.1;
    hud.message(`** You reached level ${player.level}! Health, mana and strength increased. **`);
    hud.floatText(player.position.clone().setY(2.8), 'LEVEL UP', 'crit');
    effects.heal(player.object);
    persist();
  }
}

function resolvePlayerStrike(kind) {
  const fwd = new THREE.Vector3(Math.sin(player.facing), 0, Math.cos(player.facing));
  for (const e of enemies) {
    if (!e.alive) continue;
    const to = new THREE.Vector3().subVectors(e.position, player.position);
    to.y = 0;
    const d = to.length() - e.radius;
    if (kind === 'spin') {
      if (d > 3.4) continue;
    } else {
      if (d > 2.4) continue;
      if (d > 0.6 && fwd.dot(to.normalize()) < 0.25) continue;
    }
    const crit = Math.random() < 0.15;
    const base = kind === 'spin' ? 18 + Math.random() * 10 : 14 + Math.random() * 11;
    damageEnemy(e, Math.round(base * player.power * (crit ? 2 : 1)), crit);
  }
}

const events = {
  message: (m) => hud.message(m),
  shake,
  playerHit(dmg) {
    if (!player.alive) return;
    player.hp -= dmg;
    flashDamage();
    hud.floatText(player.position.clone().setY(2.2), `-${dmg}`, 'hurt');
    if (player.hp <= 0) die();
  },
};

function flashDamage() {
  const f = $('flash');
  f.style.boxShadow = 'inset 0 0 160px rgba(220, 30, 20, 0.55)';
  setTimeout(() => { f.style.boxShadow = 'inset 0 0 160px rgba(220, 30, 20, 0)'; }, 120);
}

function die() {
  player.hp = 0;
  quest.deaths++;
  const lost = Math.floor(player.gold * 0.1);
  player.gold -= lost;
  $('death-sub').textContent = lost > 0
    ? `you dropped ${lost} gold... rising again at the edge of the glade`
    : 'rising again at the edge of the glade...';
  $('death').classList.remove('hidden');
  player.object.rotation.x = -1.3;
  setTimeout(() => {
    $('death').classList.add('hidden');
    player.object.rotation.x = 0;
    player.hp = player.maxHp;
    player.mp = player.maxMp;
    player.position.copy(world.spawnPoint);
    camTarget.copy(player.position);
    target = null;
    hud.message('You rise again. The dead remember you.');
    persist();
  }, 4000);
}

function showVictory() {
  paused = true;
  $('victory-stats').textContent =
    `  Level reached ....... ${player.level}\n` +
    `  Skeletons destroyed . ${quest.totalKills}\n` +
    `  Gold carried ........ ${player.gold}\n` +
    `  Times fallen ........ ${quest.deaths}`;
  $('victory').classList.remove('hidden');
}

// ---------------------------------------------------------------- save/load
let started = params.has('shot');
let paused = false;
let menuOpen = false;

function persist() {
  saveGame({ player: player.serialize(), quest: { ...quest } });
}
setInterval(() => { if (started) persist(); }, 10000);
window.addEventListener('beforeunload', () => { if (started) persist(); });

if (quest.bossSpawned && !quest.bossDefeated) spawnBoss(false);

// --------------------------------------------------------------------- input
const input = { up: false, down: false, left: false, right: false, run: false };
const keyMap = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
};
if (started) hud.dismissTitle();
if (save) {
  $('continue-note').textContent = `continuing: ${player.name}, level ${player.level}, ${player.gold} gold`;
}

let camYaw = 0;
let camYawTarget = 0;
let zoom = params.has('zoom') ? Number(params.get('zoom')) : 1;
const ZOOM_MIN = 0.55;
const ZOOM_MAX = 3.2;

function start() {
  started = true;
  hud.dismissTitle();
  hud.message(save
    ? 'You return to Ashenmere Glade.'
    : 'You awaken in Ashenmere Glade. The dead do not rest here.');
}

function setMenu(open) {
  menuOpen = open;
  paused = open;
  $('menu').classList.toggle('hidden', !open);
  for (const k in input) input[k] = false;
  if (open) refreshMenu();
}

window.addEventListener('keydown', (e) => {
  if (!started) { start(); return; }
  if (!$('victory').classList.contains('hidden')) return;
  if (e.code === 'Escape') { setMenu(!menuOpen); return; }
  if (menuOpen) return;
  if (keyMap[e.code]) input[keyMap[e.code]] = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  switch (e.code) {
    case 'Space': if (player.alive) player.attack(); break;
    case 'Digit1': castWhirl(); break;
    case 'Digit2': castBolt(); break;
    case 'Digit3': castMend(); break;
    case 'KeyF': drinkPotion(); break;
    case 'BracketLeft': baseCell = Math.max(5, baseCell - 1); break;
    case 'BracketRight': baseCell = Math.min(16, baseCell + 1); break;
    case 'Equal': case 'NumpadAdd': zoom = Math.max(ZOOM_MIN, zoom * 0.85); break;
    case 'Minus': case 'NumpadSubtract': zoom = Math.min(ZOOM_MAX, zoom * 1.15); break;
    case 'KeyQ': camYawTarget += Math.PI / 4; break;
    case 'KeyE': camYawTarget -= Math.PI / 4; break;
    case 'KeyH': hud.toggleHints(); break;
  }
});
window.addEventListener('keyup', (e) => { if (keyMap[e.code]) input[keyMap[e.code]] = false; });
window.addEventListener('blur', () => { for (const k in input) input[k] = false; });
renderer.domElement.addEventListener('mousedown', (e) => {
  if (!started) { start(); return; }
  if (e.button === 0 && !paused && player.alive) player.attack();
});
$('title').addEventListener('mousedown', () => { if (!started) start(); });
window.addEventListener('wheel', (e) => {
  if (paused) return;
  zoom = THREE.MathUtils.clamp(zoom * (e.deltaY > 0 ? 1.1 : 0.9), ZOOM_MIN, ZOOM_MAX);
}, { passive: true });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  ascii.setSize(window.innerWidth, window.innerHeight, pixelRatio);
});

// ---------------------------------------------------------------------- menu
function refreshMenu() {
  document.querySelectorAll('#menu .opts').forEach((group) => {
    const key = group.dataset.setting;
    group.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('on', String(settings[key]) === b.dataset.value);
    });
  });
}

$('menu').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'resume') { setMenu(false); return; }
  if (action === 'newgame') {
    if (confirm('Erase your progress and start a new game?')) {
      started = false; // stop autosave writing the old character back
      clearGame();
      location.reload();
    }
    return;
  }
  const group = btn.closest('.opts');
  if (!group) return;
  const key = group.dataset.setting;
  const raw = btn.dataset.value;
  const value = raw === 'true' ? true : raw === 'false' ? false : raw;
  if (settings[key] === value) return;
  settings[key] = value;
  saveSettings(settings);
  if (key === 'detail') baseCell = DETAIL_CELL[value];
  if (key === 'showFps') hud.setFpsVisible(value);
  if (key === 'grass') {
    persist();
    $('menu-note').textContent = 'Reloading to apply grass density...';
    setTimeout(() => location.reload(), 500);
  }
  refreshMenu();
});

$('victory').addEventListener('click', (e) => {
  if (!e.target.closest('[data-action="victory-continue"]')) return;
  $('victory').classList.add('hidden');
  paused = false;
  hud.message('The Hollow King will return when the moon is high. (about 3 minutes)');
  setTimeout(() => {
    quest.bossDefeated = false;
    spawnBoss();
  }, 180000);
});

// ---------------------------------------------------------------------- quest
function questText() {
  if (!quest.bossSpawned) {
    return `<span class="qt">Quest: Cleanse the Glade</span>\nDestroy skeleton warriors  ${Math.min(quest.kills, quest.goal)}/${quest.goal}`;
  }
  if (!quest.bossDefeated) {
    const d = boss ? Math.round(boss.position.distanceTo(player.position)) : 0;
    return `<span class="qt">Quest: The Hollow King</span>\nSlay the king in the western ruins\n<span class="lbl">${d}m away - beware his ground slam</span>`;
  }
  return `<span class="qt">Ashenmere Glade</span>\n<span class="done">The Hollow King is defeated.</span>\nSkeletons destroyed: ${quest.totalKills}`;
}

// ---------------------------------------------------------------------- loop
const timer = new THREE.Timer();
timer.connect(document);
const camTarget = new THREE.Vector3().copy(player.position);
const head = new THREE.Vector3();

function frame(now) {
  timer.update(now);
  const dt = Math.min(timer.getDelta(), 0.05);
  const cpuStart = performance.now();

  if (!paused) {
    env.time += dt;
    for (const s of Object.values(skills)) s.cd = Math.max(0, s.cd - dt);
    camYaw += (camYawTarget - camYaw) * Math.min(1, dt * 6);

    player.update(dt, started && player.alive ? input : {}, camYaw);
    const strike = player.strikeWindow();
    if (strike) resolvePlayerStrike(strike);
    for (const e of enemies) e.update(dt, player, events);
    effects.update(dt);
  }

  // Camera: high third-person view. Zooming out also shrinks the glyphs,
  // so the wide view reads as a finer, higher-resolution picture.
  camTarget.lerp(player.position, Math.min(1, dt * 5));
  const dist = 14 * zoom;
  const pitch = 1.02 + (zoom - 1) * 0.06;
  shakeAmount = Math.max(0, shakeAmount - dt * 1.5);
  const sx = (Math.random() - 0.5) * shakeAmount;
  const sz = (Math.random() - 0.5) * shakeAmount;
  camera.position.set(
    camTarget.x + Math.sin(camYaw) * Math.cos(pitch) * dist + sx,
    camTarget.y + Math.sin(pitch) * dist,
    camTarget.z + Math.cos(camYaw) * Math.cos(pitch) * dist + sz
  );
  camera.lookAt(camTarget.x + sx, camTarget.y + 0.8, camTarget.z + sz);
  ascii.setCellHeight(baseCell * Math.pow(zoom, -0.55));

  world.update(camera, zoom);

  // HUD
  if (!target || !target.alive || target.position.distanceTo(player.position) > 16) {
    target = enemies
      .filter((e) => e.alive && (e.aggro || e.position.distanceTo(player.position) < 8))
      .sort((a, b) => a.position.distanceTo(player.position) - b.position.distanceTo(player.position))[0] || null;
  }
  hud.updatePlayer(player);
  hud.updateTarget(target);
  hud.updateQuest(questText());
  hud.updateHotbar([
    { ...skills.whirl, usable: player.mp >= skills.whirl.cost },
    { ...skills.bolt, usable: player.mp >= skills.bolt.cost },
    { ...skills.mend, usable: player.mp >= skills.mend.cost },
    { ...skills.potion, usable: player.potions > 0, count: player.potions },
  ]);
  hud.nameplate('player', head.copy(player.position).setY(2.55), camera, player.name);
  for (const e of enemies) {
    if (e.alive) {
      hud.nameplate(`e${e.id}`, head.copy(e.position).setY(2.15 * e.scale + (e.isBoss ? 0.4 : 0)), camera,
        e.name, e.isBoss ? 'enemy boss' : 'enemy', e.hp, e.maxHp);
    } else hud.hideNameplate(`e${e.id}`);
  }
  hud.updateFloaters(dt, camera);

  ascii.render(scene, camera, env.time);
  hud.tickPerf(dt, performance.now() - cpuStart);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Small hook for automated screenshots and debugging.
window.__game = {
  player, enemies, ascii, env, input, quest, skills, spawnBoss,
  castBolt, castWhirl, setYaw: (y) => { camYaw = camYawTarget = y; },
  setZoom: (z) => { zoom = z; },
};

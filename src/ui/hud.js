import * as THREE from 'three';
import { LOGO } from './logo.js';

const $ = (id) => document.getElementById(id);

/** Plain ASCII bar like  [#######-----]  */
export function bar(value, max, width = 14) {
  const filled = Math.round((Math.max(0, value) / max) * width);
  return '[' + '#'.repeat(filled) + '-'.repeat(width - filled) + ']';
}

export class Hud {
  constructor() {
    this.party = $('party');
    this.target = $('target');
    this.perf = $('perf');
    this.log = $('log');
    this.labels = $('labels');
    this.hints = $('hints');
    this.zone = $('zone');
    $('logo').textContent = LOGO;
    this.nameplates = new Map();
    this.floaters = [];
    this.frames = 0;
    this.fpsTime = 0;
    this.fps = 0;
    this.frameMs = 0;
    this.tmp = new THREE.Vector3();
    setTimeout(() => { this.zone.style.opacity = '0.35'; }, 6000);
  }

  dismissTitle() {
    const t = $('title');
    if (!t.classList.contains('gone')) {
      t.classList.add('gone');
      setTimeout(() => t.remove(), 1400);
      return true;
    }
    return false;
  }

  toggleHints() { this.hints.classList.toggle('hidden'); }

  message(text) {
    const div = document.createElement('div');
    div.textContent = text;
    this.log.appendChild(div);
    while (this.log.children.length > 6) this.log.firstChild.remove();
    setTimeout(() => { div.style.opacity = '0'; }, 7000);
    setTimeout(() => div.remove(), 8200);
  }

  updatePlayer(p) {
    this.party.innerHTML = `
<div class="panel member"><span class="who">${p.name}</span>  <span class="lv">LV ${p.level}  ${Math.floor(p.gold)}g</span>
<span class="lbl">HP</span> <span class="hpbar">${bar(p.hp, p.maxHp)}</span> ${Math.ceil(p.hp)}/${p.maxHp}
<span class="lbl">MP</span> <span class="mpbar">${bar(p.mp, p.maxMp)}</span> ${Math.floor(p.mp)}/${p.maxMp}
<span class="lbl">XP</span> <span class="xpbar">${bar(p.xp, p.xpNext)}</span> ${p.xp}/${p.xpNext}</div>
<div class="panel member"><span class="lbl">party</span></div>`.trim();
  }

  updateTarget(enemy) {
    if (!enemy || !enemy.alive) { this.target.classList.add('hidden'); return; }
    this.target.classList.remove('hidden');
    this.target.className = 'panel';
    this.target.innerHTML =
      `<span class="who">${enemy.name}</span> <span class="lbl">- lv ${enemy.level}</span>\n` +
      `<span class="hpbar">${bar(enemy.hp, enemy.maxHp, 30)}</span> ${Math.ceil(enemy.hp)}/${enemy.maxHp}`;
  }

  tickPerf(dt, cpuMs) {
    this.frames++;
    this.fpsTime += dt;
    this.frameMs = this.frameMs * 0.9 + cpuMs * 0.1;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.frames / this.fpsTime);
      this.frames = 0;
      this.fpsTime = 0;
      this.perf.textContent = `FPS ${this.fps} | frame ${this.frameMs.toFixed(1)} ms`;
    }
  }

  /** Name tags floating above characters. */
  nameplate(key, worldPos, camera, text, cls = '', hp = null, maxHp = null) {
    let el = this.nameplates.get(key);
    if (!el) {
      el = document.createElement('div');
      el.className = `label ${cls}`;
      this.labels.appendChild(el);
      this.nameplates.set(key, el);
    }
    const v = this.tmp.copy(worldPos).project(camera);
    if (v.z > 1 || v.x < -1.2 || v.x > 1.2 || v.y < -1.2 || v.y > 1.2) {
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    el.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
    el.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
    const html = `<span class="name">${text}</span>` +
      (hp !== null && hp < maxHp ? `\n<span class="bar">${bar(hp, maxHp, 10)}</span>` : '');
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
  }

  hideNameplate(key) {
    const el = this.nameplates.get(key);
    if (el) el.style.display = 'none';
  }

  /** Floating damage numbers that drift upwards and fade. */
  floatText(worldPos, text, cls = '') {
    const el = document.createElement('div');
    el.className = `dmg ${cls}`;
    el.textContent = text;
    this.labels.appendChild(el);
    this.floaters.push({ el, pos: worldPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, 0)), t: 0 });
  }

  updateFloaters(dt, camera) {
    for (const f of this.floaters) {
      f.t += dt;
      f.pos.y += dt * 1.4;
      const v = this.tmp.copy(f.pos).project(camera);
      f.el.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
      f.el.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
      f.el.style.opacity = String(Math.max(0, 1 - f.t / 1.1));
    }
    this.floaters = this.floaters.filter((f) => {
      if (f.t > 1.1) { f.el.remove(); return false; }
      return true;
    });
  }
}

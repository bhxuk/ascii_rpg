// Progress and settings live in the browser's localStorage. Every access is
// wrapped so private windows or blocked storage never break the game.

const SAVE_KEY = 'glyphborne.save.v1';
const SETTINGS_KEY = 'glyphborne.settings.v1';

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export const DEFAULT_SETTINGS = {
  grass: 'medium', // low | medium | high
  detail: 'normal', // fine | normal | chunky  (base glyph size)
  showFps: true,
};

export const GRASS_COUNTS = { low: 25000, medium: 60000, high: 110000 };
export const DETAIL_CELL = { fine: 7, normal: 9, chunky: 12 };

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...(read(SETTINGS_KEY) || {}) };
}
export function saveSettings(s) { write(SETTINGS_KEY, s); }

export function loadGame() { return read(SAVE_KEY); }
export function saveGame(data) { write(SAVE_KEY, { ...data, savedAt: Date.now() }); }
export function clearGame() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

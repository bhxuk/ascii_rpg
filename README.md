# Glyphborne

*A knight's tale, written in characters.*

Glyphborne is a browser RPG where every pixel on screen is an ASCII character. Knights, skeletons, grass, trees, water and firelight are all drawn as a dense grid of coloured glyphs.

**Play it: https://bhxuk.github.io/ascii_rpg/**

## Play it locally

```bash
npm install
npm run dev
```

Then open the address Vite prints (usually http://localhost:5173).

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | Move |
| Shift | Run |
| Space / left click | Sword strike |
| 1 | Whirlwind: spin attack hitting everything around you (20 MP) |
| 2 | Lightning: strike your target from the sky (30 MP) |
| 3 | Mend: heal 40% of your health (35 MP) |
| F | Drink a potion (heals 50%) |
| Q / E | Turn the camera |
| Mouse wheel or + / - | Zoom. Glyphs get finer as you zoom out |
| [ / ] | Glyph size |
| Esc | Pause menu and settings |
| H | Hide the controls bar |

## The game

1. **Cleanse the Glade:** destroy 12 skeleton warriors. They gather in camps around Ashenmere Glade, hunt you on sight and reassemble after a while.
2. **The Hollow King:** clearing the glade wakes a giant crowned skeleton in the western ruins. When he raises his blade, a red ring marks his ground slam. Step out of it.
3. Level up for more health, mana and strength. Skeletons sometimes drop potions. Progress saves automatically in your browser.

The pause menu has glyph detail (fine / normal / chunky), grass density and an FPS toggle.

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`, which builds the site with Vite and publishes `dist/` to the `gh-pages` branch, served by GitHub Pages. The landing page is `/` and the game is `/play/`.

## How the ASCII look works

The world is a real low-poly 3D scene (Three.js), but it is never shown directly. Each frame it renders off-screen, then a shader (`src/ascii/AsciiPass.js`) replaces it with characters:

1. The screen is divided into character cells (about 6 x 9 px).
2. Each material writes a **glyph set** id into its alpha channel (`src/ascii/glyphs.js`): grass, foliage, bark, water, metal, stone, glow or default. That's why grass is drawn with `| / \ ,` strokes, trees with letters, ruins with `0 O #`, and the knight with a fine metal ramp.
3. Per cell the shader measures brightness and the brightness gradient, picks a character by brightness, by stroke direction (grass), or an edge character on silhouettes, and tints it with the cell's colour.

## Project layout

```
index.html       landing page (live ASCII hero)
play/index.html  the game
src/
  ascii/    glyph sets, atlas, and the ASCII render pass
  world/    the glade: grass, trees, pond, ruins, sky, shared lighting state
  actors/   knight, skeleton and Hollow King models and behaviour
  game/     spell effects, saves and settings
  ui/       HUD, hotbar, nameplates, damage numbers, logo
  landing/  landing page script and styles
  main.js   game loop, input, camera, combat, quest
```

## Roadmap

- [ ] Online multiplayer: Node + WebSocket server (authoritative), see other knights in the glade
- [x] Skills, potions, levelling and saves
- [x] The Hollow King boss in the ruins
- [ ] Inventory, weapon materials and runes
- [ ] Weather (rain, fog banks), day/night cycle
- [ ] More zones, NPCs, quests
- [ ] Windows .exe build (Electron/Tauri wrapper)

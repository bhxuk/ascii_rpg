# Glyphborne

*A knight's tale, written in characters.*

Glyphborne is an online RPG where every pixel on screen is an ASCII character. Knights, skeletons, grass, trees, water and firelight are all drawn as a dense grid of coloured glyphs.

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
| Q / E | Turn the camera |
| Mouse wheel | Zoom |
| [ / ] | Smaller / larger glyphs |
| H | Hide the controls bar |

## What's in this first prototype

- **Ashenmere Glade**: a moonlit meadow with ~70k swaying grass blades that part around you, autumn trees, a pond reflecting the moon, fireflies, and a ruined shrine lit by braziers.
- **Sir Aldric**, a plate-armoured knight with plume, cape, longsword and kite shield, carrying a lantern glow.
- **Skeleton Warriors** in camps around the glade that wander, aggro, attack, crumble and reassemble.
- Combat with crits, floating damage numbers, XP, gold and levelling.
- An ASCII HUD: party frame, target frame, combat log, FPS counter.

## How the ASCII look works

The world is a real low-poly 3D scene (Three.js), but it is never shown directly. Each frame it renders off-screen, then a shader (`src/ascii/AsciiPass.js`) replaces it with characters:

1. The screen is divided into character cells (about 6 x 9 px).
2. Each material writes a **glyph set** id into its alpha channel (`src/ascii/glyphs.js`): grass, foliage, bark, water, metal, stone, glow or default. That's why grass is drawn with `| / \ ,` strokes, trees with letters, ruins with `0 O #`, and the knight with a fine metal ramp.
3. Per cell the shader measures brightness and the brightness gradient, picks a character by brightness, by stroke direction (grass), or an edge character on silhouettes, and tints it with the cell's colour.

## Project layout

```
src/
  ascii/   glyph sets, atlas, and the ASCII render pass
  world/   the glade: grass, trees, pond, ruins, sky, shared lighting state
  actors/  knight and skeleton models, player and enemy behaviour
  ui/      HUD, nameplates, damage numbers, logo
  main.js  game loop, input, camera, combat
```

## Roadmap

- [ ] Multiplayer: Node + WebSocket server (authoritative), see other knights in the glade
- [ ] Skills and spells (chain lightning, shield bash), mana costs
- [ ] Inventory, loot drops, weapon materials and runes
- [ ] A boss in the ruins
- [ ] Weather (rain, fog banks), day/night cycle
- [ ] More zones, NPCs, quests
- [ ] Windows .exe build (Electron/Tauri wrapper)

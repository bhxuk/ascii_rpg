import * as THREE from 'three';

/**
 * Glyph sets. Every material in the scene is tagged with one of these ids,
 * which it writes into the alpha channel of the scene render. The ASCII pass
 * reads that id back and picks characters from the matching row of the atlas.
 *
 * Ids 0..7 can be written by materials. Row 8 holds edge glyphs used by the
 * pass itself for outlines.
 *
 * Within each row, characters are ordered dark -> bright (except GRASS, which
 * the shader indexes by stroke direction).
 */
export const SET = {
  DEFAULT: 0,
  GRASS: 1,
  FOLIAGE: 2,
  BARK: 3,
  WATER: 4,
  METAL: 5,
  STONE: 6,
  GLOW: 7,
};

export const ROWS = [
  /* 0 DEFAULT */ ' .,:;-=+*oO#%@',
  /* 1 GRASS   */ ' .,\'`"|/\\-;il!',
  /* 2 FOLIAGE */ ' .,:ceosaxzwmnhkdbqpWMB&%#@',
  /* 3 BARK    */ ' .:|!lIi][}{H#',
  /* 4 WATER   */ ' .-~=~+*oO@',
  /* 5 METAL   */ ' .\'`^":;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$',
  /* 6 STONE   */ ' .,:;oO0Q8#@',
  /* 7 GLOW    */ " .'`^*+x%#@",
  /* 8 EDGES   */ '|/-\\',
];

export const ATLAS_COLS = Math.max(...ROWS.map((r) => [...r].length));
export const ATLAS_ROWS = ROWS.length;
export const GLYPH_W = 32;
export const GLYPH_H = 48;

/** Build a canvas texture holding every glyph row. */
export function buildGlyphAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * GLYPH_W;
  canvas.height = ATLAS_ROWS * GLYPH_H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(GLYPH_H * 0.82)}px "DejaVu Sans Mono", Consolas, "Cascadia Mono", "Courier New", monospace`;

  ROWS.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      ctx.fillText(ch, c * GLYPH_W + GLYPH_W / 2, r * GLYPH_H + GLYPH_H * 0.54);
    });
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export const ROW_LENGTHS = ROWS.map((r) => [...r].length);

/**
 * Tag a built-in Three.js material so it writes its glyph-set id into alpha.
 * Works for MeshStandard / Lambert / Basic / Phong materials.
 */
export function tagMaterial(material, setId) {
  const encoded = ((setId + 0.5) / 8).toFixed(5);
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      /}\s*$/,
      `  gl_FragColor.a = ${encoded};\n}`
    );
  };
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (prevKey ? prevKey() : '') + `|set${setId}`;
  material.needsUpdate = true;
  return material;
}

/** GLSL snippet: alpha value for a set id, for custom ShaderMaterials. */
export const setAlpha = (setId) => ((setId + 0.5) / 8).toFixed(5);

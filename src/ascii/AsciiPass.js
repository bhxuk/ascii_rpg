import * as THREE from 'three';
import { buildGlyphAtlas, ATLAS_COLS, ATLAS_ROWS, ROW_LENGTHS } from './glyphs.js';

/**
 * Renders the 3D scene into an off-screen HDR target, then draws it to the
 * screen as a grid of coloured characters.
 *
 * Per cell the pass:
 *  1. samples the scene at five points (centre + four quadrants),
 *  2. reads the glyph-set id the material wrote into alpha,
 *  3. measures brightness and the luminance gradient across the cell,
 *  4. picks a character: by brightness for most sets, by stroke direction for
 *     grass, and an edge character ( | / - \ ) on strong silhouettes,
 *  5. tints the character with the cell's colour on a near-black background.
 */
export class AsciiPass {
  constructor(renderer) {
    this.renderer = renderer;
    this.enabled = true;
    this.cellHeight = 9;

    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });

    this.atlas = buildGlyphAtlas();

    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tScene: { value: this.target.texture },
        tAtlas: { value: this.atlas },
        uRes: { value: new THREE.Vector2(1, 1) },
        uCell: { value: new THREE.Vector2(7, 11) },
        uMode: { value: 1 },
        uExposure: { value: 1.35 },
        uTime: { value: 0 },
        uRowLen: { value: ROW_LENGTHS.map((n) => n) },
      },
      vertexShader: /* glsl */ `
        void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tScene;
        uniform sampler2D tAtlas;
        uniform vec2 uRes;
        uniform vec2 uCell;
        uniform float uMode;
        uniform float uExposure;
        uniform float uTime;
        uniform float uRowLen[${ATLAS_ROWS}];
        out vec4 outColor;

        const float COLS = ${ATLAS_COLS}.0;
        const float ROWS = ${ATLAS_ROWS}.0;

        vec3 aces(vec3 x) {
          const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
          return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
        }
        vec3 toDisplay(vec3 c) { return pow(aces(c * uExposure), vec3(1.0 / 2.2)); }
        vec4 fetchPx(vec2 p) {
          ivec2 ip = ivec2(clamp(p, vec2(0.0), uRes - 1.0));
          return texelFetch(tScene, ip, 0);
        }
        float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

        // Map a gradient direction to an edge glyph index: 0 vertical, 1 rising, 2 flat, 3 falling
        float strokeFor(float gx, float gy) {
          float phi = atan(gy, gx) + 1.5707963; // line runs perpendicular to gradient
          phi = mod(phi, 3.14159265);
          float s = floor(phi / 0.78539816 + 0.5); // 0..4 in 45 degree steps
          if (s > 3.5) s = 0.0;
          // s: 0 = horizontal, 1 = rising, 2 = vertical, 3 = falling
          if (s < 0.5) return 2.0;
          if (s < 1.5) return 1.0;
          if (s < 2.5) return 0.0;
          return 3.0;
        }

        void main() {
          vec2 px = gl_FragCoord.xy;

          if (uMode < 0.5) {
            outColor = vec4(toDisplay(fetchPx(px).rgb), 1.0);
            return;
          }

          vec2 cell = floor(px / uCell);
          vec2 local = fract(px / uCell);
          vec2 o = cell * uCell;

          vec4 cs = fetchPx(o + uCell * 0.5);
          vec3 m  = toDisplay(cs.rgb);
          vec3 qa = toDisplay(fetchPx(o + uCell * vec2(0.25, 0.25)).rgb);
          vec3 qb = toDisplay(fetchPx(o + uCell * vec2(0.75, 0.25)).rgb);
          vec3 qc = toDisplay(fetchPx(o + uCell * vec2(0.25, 0.75)).rgb);
          vec3 qd = toDisplay(fetchPx(o + uCell * vec2(0.75, 0.75)).rgb);

          vec3 col = (qa + qb + qc + qd + m * 2.0) / 6.0;
          float lum = luma(col);
          float la = luma(qa), lb = luma(qb), lc = luma(qc), ld = luma(qd);
          float gx = (lb + ld) - (la + lc);
          float gy = (lc + ld) - (la + lb);
          float gmag = length(vec2(gx, gy));

          int set = clamp(int(floor(cs.a * 8.0)), 0, 7);
          float row = float(set);
          float len = uRowLen[set];
          float h = hash(cell);
          float idx = 0.0;

          if (set == 1) {
            // GRASS row: see ROWS[1] in glyphs.js
            if (lum < 0.03) idx = 0.0;
            else if (lum < 0.075) idx = h < 0.5 ? 1.0 : 2.0;
            else if (gmag > 0.05) {
              float s = strokeFor(gx, gy);
              idx = s < 0.5 ? 6.0 : (s < 1.5 ? 7.0 : (s < 2.5 ? 3.0 : 8.0));
            } else {
              idx = h < 0.5 ? 6.0 : h < 0.62 ? 3.0 : h < 0.72 ? 5.0 : h < 0.8 ? 7.0
                  : h < 0.88 ? 8.0 : h < 0.94 ? 11.0 : 12.0;
            }
          } else {
            float t = clamp(pow(lum, 0.8) * 1.1, 0.0, 1.0);
            idx = floor(t * (len - 1.0) + 0.5);
            if (set == 2 || set == 6) {
              // Foliage and stone: jitter within the brightness band so it reads as texture.
              idx = clamp(idx + floor((h - 0.5) * 5.0), 1.0, len - 1.0);
            }
            if (lum < 0.028) idx = 0.0;

            // Silhouette outlines for solid objects.
            bool outlined = set == 0 || set == 3 || set == 5 || set == 6;
            if (outlined && gmag > 0.42 && lum > 0.05) {
              row = ROWS - 1.0;
              idx = strokeFor(gx, gy);
            }
          }

          // Explicit gradients keep mip selection stable across cell borders.
          vec2 auv = vec2((idx + local.x) / COLS, (row + 1.0 - local.y) / ROWS);
          vec2 dUdx = vec2(1.0 / (uCell.x * COLS), 0.0);
          vec2 dVdy = vec2(0.0, 1.0 / (uCell.y * ROWS));
          float mask = textureGrad(tAtlas, auv, dUdx, dVdy).r;

          float v = max(max(col.r, col.g), col.b);
          vec3 glyph = col / max(v, 1e-3) * clamp(pow(v, 0.55) * 1.3, 0.0, 1.0);
          vec3 outc = mix(col * 0.09, glyph, mask);

          vec2 uv = px / uRes;
          float vig = smoothstep(1.25, 0.3, length((uv - 0.5) * vec2(1.25, 1.0)) * 1.45);
          outColor = vec4(outc * mix(0.55, 1.0, vig), 1.0);
        }
      `,
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCamera = new THREE.Camera();
  }

  setSize(width, height, pixelRatio) {
    const w = Math.floor(width * pixelRatio);
    const h = Math.floor(height * pixelRatio);
    this.target.setSize(w, h);
    this.material.uniforms.uRes.value.set(w, h);
    this.pixelRatio = pixelRatio;
    this.updateCell();
  }

  setCellHeight(px) {
    this.cellHeight = THREE.MathUtils.clamp(px, 6, 24);
    this.updateCell();
  }

  updateCell() {
    const pr = this.pixelRatio || 1;
    const h = Math.round(this.cellHeight * pr);
    const w = Math.max(3, Math.round(h * 0.62));
    this.material.uniforms.uCell.value.set(w, h);
  }

  render(scene, camera, time) {
    const r = this.renderer;
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uMode.value = this.enabled ? 1 : 0;
    r.setRenderTarget(this.target);
    r.setClearColor(0x04060a, 0);
    r.clear();
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCamera);
  }
}

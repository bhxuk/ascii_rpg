import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Relative base so the build works at any path, including
// https://<user>.github.io/ascii_rpg/ on GitHub Pages.
export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        play: resolve(import.meta.dirname, 'play/index.html'),
      },
    },
  },
});

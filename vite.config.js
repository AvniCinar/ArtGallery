import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works on GitHub Pages subpaths and any static host.
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
  },
});

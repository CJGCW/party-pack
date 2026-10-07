import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, 'client');

export default defineConfig({
  root,
  appType: 'mpa',
  build: {
    target: 'es2022',
    // Phaser alone is ~1.5 MB; that's fine when served over the LAN.
    chunkSizeWarningLimit: 2000,
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        play: resolve(root, 'index.html'),
        host: resolve(root, 'host.html'),
      },
    },
  },
});

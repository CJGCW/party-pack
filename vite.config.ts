import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, 'client');

export default defineConfig(({ mode }) => ({
  root,
  appType: 'mpa',
  build: {
    target: 'es2022',
    // Phaser alone is ~1.5 MB; that's fine when served over the LAN.
    chunkSizeWarningLimit: 2000,
    // `--mode app` builds just the phone screens, for the Android app to carry inside it (see android/).
    outDir: resolve(import.meta.dirname, mode === 'app' ? 'dist-app' : 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        play: resolve(root, 'index.html'),
        ...(mode === 'app' ? {} : { host: resolve(root, 'host.html') }),
      },
    },
  },
}));

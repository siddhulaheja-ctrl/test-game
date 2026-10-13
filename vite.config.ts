import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const root = resolve(__dirname, 'src/renderer');

export default defineConfig({
  root,
  base: './',
  publicDir: false,
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    target: 'chrome120',
    rollupOptions: {
      input: {
        overlay: resolve(root, 'overlay/index.html'),
        lab: resolve(root, 'lab/index.html'),
      },
    },
  },
});

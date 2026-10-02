import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url));
const zoria = here('./bot/node_modules/@zoria');

export default defineConfig({
  root: 'src/arena',
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@zoria/engine', replacement: zoria + '/engine/dist/engine.mjs' },
      { find: '@zoria/sdk', replacement: zoria + '/sdk/dist/index.js' },
      { find: '@zoria/protocol', replacement: zoria + '/protocol/dist/index.js' },
    ],
  },
  worker: { format: 'es' },
  server: { port: 5174, fs: { allow: [here('./src/arena'), here('./bot/src'), here('./bot/arena'), here('./bot/node_modules/@zoria'), here('./node_modules')] } },
  build: { outDir: '../../dist/arena', emptyOutDir: true },
});

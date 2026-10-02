import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const zoria = fileURLToPath(new URL('./bot/node_modules/@zoria', import.meta.url));

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
  server: { port: 5174, fs: { allow: ['src/arena', 'bot/src', 'bot/arena', 'bot/node_modules/@zoria', 'node_modules'] } },
  build: { outDir: '../../dist/arena', emptyOutDir: true },
});

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { saveRecord } from './bot/arena/save.ts';

const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url));
const zoria = here('./bot/node_modules/@zoria');
const logs = here('./bot/league/arena');

const arenaLog: Plugin = {
  name: 'arena-log',
  configureServer(server) {
    server.middlewares.use('/arena-log', (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end();
        return;
      }
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk: string) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          const name = saveRecord(logs, body);
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ name }));
        } catch (err) {
          res.statusCode = 400;
          res.end(err instanceof Error ? err.message : String(err));
        }
      });
    });
  },
};

export default defineConfig({
  root: 'src/arena',
  plugins: [react(), arenaLog],
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

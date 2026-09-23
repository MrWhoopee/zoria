import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const agent = 'http://127.0.0.1:4711';

export default defineConfig({
  root: 'src/client',
  plugins: [react()],
  build: { outDir: '../../dist/client', emptyOutDir: true },
  server: {
    proxy: {
      '/state': agent,
      '/events': agent,
      '/application': agent,
      '/invitation': agent,
    },
  },
});

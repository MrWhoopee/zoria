import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const agent = `http://127.0.0.1:${process.env.ZORIA_LOCAL_PORT ?? 4711}`;

export default defineConfig({
  root: 'src/client',
  plugins: [react()],
  build: { outDir: '../../dist/client', emptyOutDir: true },
  server: {
    fs: { allow: ['src/client', 'node_modules'], deny: ['.zoria-agent/**', '.env', '.env.*', '**/.git/**'] },
    proxy: {
      '/state': agent,
      '/events': agent,
      '/application': agent,
      '/invitation': agent,
      '/account': agent,
    },
  },
});

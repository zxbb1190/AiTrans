import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  root: path.resolve(__dirname, 'renderer', 'panel-src'),
  base: './',
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    hmr: {
      host: '127.0.0.1',
      port: 5174,
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'renderer', 'panel-dist'),
    emptyOutDir: true,
  },
});

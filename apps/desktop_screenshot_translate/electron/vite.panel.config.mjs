import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  root: path.resolve(__dirname, 'renderer', 'panel-src'),
  plugins: [vue()],
  build: {
    outDir: path.resolve(__dirname, 'renderer', 'panel-dist'),
    emptyOutDir: true,
  },
});

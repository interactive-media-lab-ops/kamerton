import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

const root = path.dirname(fileURLToPath(import.meta.url));
// Дизайн-система лежить поруч і підключається як локальне джерело.
// Її код не копіюється в app і не переписується.
const DS = path.resolve(root, '../astrolabe-ds');

/**
 * Vite віддає збірку як dist/index.html. Продукт має називатись kamerton.html,
 * тому перейменовуємо готовий html-асет уже після інлайну всього всередину.
 */
function renameHtml(to) {
  return {
    name: 'kamerton-html-name',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const entry = bundle['index.html'];
      if (!entry) return;
      delete bundle['index.html'];
      entry.fileName = to;
      bundle[to] = entry;
    },
  };
}

export default defineConfig({
  root,
  base: './',
  plugins: [react(), viteSingleFile(), renameHtml('kamerton.html')],
  resolve: {
    alias: { 'astrolabe-ds': path.join(DS, 'src/index.js') },
  },
  server: {
    fs: { allow: [root, DS] },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4096,
    reportCompressedSize: false,
  },
});

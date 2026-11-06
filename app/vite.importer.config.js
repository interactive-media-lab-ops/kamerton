import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Збірка ІМПОРТЕРА, окрема від продукту.
 *
 * Чому окремий конфіг, а не ще один вхід у тому самому:
 *   1. Ліміт 700 КБ стосується продукту. Імпортеру можна важити скільки треба.
 *   2. Імпортер не має жодного шансу опинитись у kamerton.html: у продуктового
 *      конфігу інший root і він про цю теку не знає. Це гарантія побудовою,
 *      а не домовленістю.
 *
 * Спільне з продуктом лише те, що і має бути спільним: схема, реєстри і пороги
 * імпортуються з ../src/data. Других копій правил не існує (H1).
 */
const root = path.dirname(fileURLToPath(import.meta.url));
const DS = path.resolve(root, '../astrolabe-ds');

function renameHtml(to) {
  return {
    name: 'importer-html-name',
    enforce: 'post',
    generateBundle(_o, bundle) {
      const entry = bundle['index.html'];
      if (!entry) return;
      delete bundle['index.html'];
      entry.fileName = to;
      bundle[to] = entry;
    },
  };
}

export default defineConfig({
  root: path.join(root, 'importer'),
  base: './',
  plugins: [react(), viteSingleFile(), renameHtml('import.html')],
  resolve: {
    alias: { 'astrolabe-ds': path.join(DS, 'src/index.js') },
  },
  build: {
    // Власна тека: у dist/ лежить тільки продукт, і переплутати неможливо.
    outDir: path.join(root, 'dist-import'),
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 8192,
    reportCompressedSize: false,
  },
});

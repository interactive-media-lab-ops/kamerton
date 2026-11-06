// КАМЕРТОН · знімки для візуального QA.
//
// Панель браузера в середовищі виконавця не завжди відображається, а без неї
// скріншот не знімається взагалі: сторінка не компонує кадри. Тому знімки
// робить headless Chromium сам, прямо з `file://`, тобто рівно так, як продукт
// відкриває керівництво.
//
// Три шари × дві ширини × звичайний і .projector. Знімки лягають у
// SPEC_NOTES/shots/ і йдуть у SPEC_NOTES як докази «до/після».
//
// Запуск: npm run qa:shots
// Один шар:  npm run qa:shots -- temy
//
// Перед першим запуском може знадобитись: npx playwright install chromium

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = process.cwd();
const DIST = path.join(root, 'dist', 'kamerton.html');
const OUT = path.join(root, '..', 'SPEC_NOTES', 'shots');

const LAYERS = ['temy', 'aktory', 'kompas'];
const WIDTHS = [1280, 1100];
const WEEK = process.env.QA_WEEK || 'w32';

const only = process.argv[2];
const layers = only ? LAYERS.filter((l) => l === only) : LAYERS;
if (!layers.length) {
  console.error(`невідомий шар «${only}». Доступні: ${LAYERS.join(', ')}`);
  process.exit(1);
}

if (!fs.existsSync(DIST)) {
  console.error('немає dist/kamerton.html: спершу npm run build');
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const shots = [];
const consoleErrors = [];

for (const width of WIDTHS) {
  for (const projector of [false, true]) {
    // storageState тут не використовуємо: у file:// origin дорівнює "null",
    // і Chromium відмовляється на нього навігувати. Сховище ставимо вже на
    // сторінці, а потім перезавантажуємо, щоб стан підхопився при монтуванні.
    const ctx = await browser.newContext({
      viewport: { width, height: 860 },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(`${width}px ${projector ? 'projector' : 'normal'}: ${m.text()}`);
    });
    page.on('pageerror', (e) => consoleErrors.push(`${width}px: ${e.message}`));

    for (const layer of layers) {
      const url = `${pathToFileURL(DIST).href}#${WEEK}/${layer}`;
      await page.goto(url, { waitUntil: 'load' });
      // Сесійні прапорці ставимо вже на сторінці: file:// має origin "null",
      // і storageState для нього ненадійний у різних збірках Chromium.
      await page.evaluate((pr) => {
        sessionStorage.setItem('kamerton.intro', '1');
        sessionStorage.setItem('kamerton.onboarded', '1');
        localStorage.setItem('kamerton.projector', pr ? '1' : '0');
      }, projector);
      await page.reload({ waitUntil: 'load' });
      // Даємо полотну домалювати: карта твінить появу шару.
      await page.waitForTimeout(1600);

      const name = `${WEEK}_${layer}_${width}${projector ? '_projector' : ''}.png`;
      const file = path.join(OUT, name);
      await page.screenshot({ path: file, fullPage: false });
      shots.push(name);
      process.stdout.write(`  ${name}\n`);
    }
    await ctx.close();
  }
}

await browser.close();

console.log(`\nзнімків: ${shots.length} у SPEC_NOTES/shots/`);
if (consoleErrors.length) {
  console.error(`\nПОМИЛКИ КОНСОЛІ: ${consoleErrors.length}`);
  [...new Set(consoleErrors)].forEach((e) => console.error('  ' + e));
  process.exit(1);
}
console.log('консоль чиста на всіх кадрах');

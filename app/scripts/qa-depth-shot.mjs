// КАМЕРТОН · знімки блоку Глибинного шару в досьє теми.
//
// Панель браузера в середовищі виконавця не відображається, тому знімок робить
// headless Chromium сам з `file://`, як і qa:shots. Знімається саме досьє, а не
// вся сцена: блок живе всередині панелі і на загальному кадрі нечитабельний.
//
// Запуск: npm run qa:depth
// Одна тема: npm run qa:depth -- t_gratitude

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = process.cwd();
const DIST = path.join(root, 'dist', 'kamerton.html');
const OUT = path.join(root, '..', 'SPEC_NOTES', 'shots');
const WEEK = process.env.QA_WEEK || 'w32';

// Три показові стани: повний блок, два блоки по кейсах на одній темі і
// повністю зрізані лінзи. Разом вони показують усе, що блок уміє.
const TOPICS = process.argv[2]
  ? [process.argv[2]]
  : ['t_gov_trust', 't_anticorr', 't_appointment', 't_tck', 't_rift', 't_airdefence',
    't_memory', 't_volunteer', 't_gratitude', 't_case_225'];

if (!fs.existsSync(DIST)) {
  console.error('немає dist/kamerton.html: спершу npm run build');
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const shots = [];
for (const topic of TOPICS) {
  await page.goto(`${pathToFileURL(DIST).href}#${WEEK}/temy/${topic}`, { waitUntil: 'load' });
  // Заставка тримає екран 4.1 с і накриває все: перші кадри цього скрипта були
  // саме нею, а не порожнім блоком. Прапорці ставимо на сторінці, як у qa:shots:
  // у file:// origin дорівнює "null", і storageState для нього ненадійний.
  await page.evaluate(() => {
    sessionStorage.setItem('kamerton.intro', '1');
    sessionStorage.setItem('kamerton.onboarded', '1');
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1200);

  if (!(await page.locator('.k-depth').count())) {
    console.error(`  ${topic}: блоку Глибинного шару немає на екрані`);
    continue;
  }
  // Вікно навмисно високе (1600): досьє прокручується власним контейнером, і
  // при 900 секція лежала на y=1510, тобто за кадром, а playwright прокручує
  // сторінку, а не внутрішній контейнер. Висока сторінка знімає проблему без
  // жодного втручання в саму верстку.
  const section = page.locator('.k-depth').first()
    .locator('xpath=ancestor::div[contains(@class,\"k-divider\")][1]');
  await section.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  const file = `depth_${WEEK}_${topic}.png`;
  await section.screenshot({ path: path.join(OUT, file) });
  shots.push(file);

  // Окремий кадр на звʼязку: провідник між Глибинним шаром і мовою наслідків
  // існує саме як перехід, і на кадрі однієї секції його не видно.
  const clip = await page.evaluate(() => {
    const sec = document.querySelector('.k-depth-section');
    const next = sec.nextElementSibling;
    if (!next) return null;
    const a = sec.getBoundingClientRect();
    const b = next.getBoundingClientRect();
    return { x: a.x - 8, y: a.y - 8, width: a.width + 16, height: (b.bottom - a.y) + 16 };
  });
  if (clip && clip.y >= 0 && clip.height > 0) {
    const link = `depth_${WEEK}_${topic}_link.png`;
    await page.screenshot({ path: path.join(OUT, link), clip });
    shots.push(link);
  }
}

/* --- motion-контракт розділу 17 ---
   Перевіряється не «чи гарно», а два правила, зламавши які секція почне
   ворушитись без змісту: анімації входу мусять ЗАКІНЧУВАТИСЬ, а нескінченна
   в секції дозволена рівно одна (пульс конкуренції сюжетів). */
const motion = [];
const depthAnims = () => page.evaluate(() => document.getAnimations()
  .filter((a) => a.playState === 'running' && (a.animationName || '').indexOf('k-depth') === 0)
  .map((a) => a.animationName));

await page.goto(`${pathToFileURL(DIST).href}#${WEEK}/temy/t_anticorr`, { waitUntil: 'load' });
await page.evaluate(() => {
  sessionStorage.setItem('kamerton.intro', '1');
  sessionStorage.setItem('kamerton.onboarded', '1');
});
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(400);
const early = await depthAnims();
await page.waitForTimeout(2600);
const late = await depthAnims();

motion.push(['вхід секції відіграє і закінчується', early.length > late.length]);
motion.push(['у спокої лишається тільки пульс конкуренції',
  late.every((n) => n === 'k-depth-pulse')]);
motion.push(['пульс це дві точки в протифазі', late.length === 2]);

const reduced = await browser.newPage({ viewport: { width: 1280, height: 1200 }, reducedMotion: 'reduce' });
await reduced.goto(`${pathToFileURL(DIST).href}#${WEEK}/temy/t_anticorr`, { waitUntil: 'load' });
await reduced.evaluate(() => {
  sessionStorage.setItem('kamerton.intro', '1');
  sessionStorage.setItem('kamerton.onboarded', '1');
});
await reduced.reload({ waitUntil: 'load' });
await reduced.waitForTimeout(1500);
const rm = await reduced.evaluate(() => ({
  anim: document.getAnimations()
    .filter((a) => a.playState === 'running' && (a.animationName || '').indexOf('k-depth') === 0).length,
  shown: Boolean(document.querySelector('.k-depth__plot-primary')),
}));
motion.push(['prefers-reduced-motion гасить рух', rm.anim === 0]);
// Вимкнений рух не сміє забрати зміст: секція лишається читабельною.
motion.push(['без руху секція лишається видимою', rm.shown]);
await reduced.close();

await browser.close();

motion.forEach(([name, okFlag]) => {
  console.log(`${okFlag ? 'ok  ' : 'ПРОВАЛ'} ${name}`);
  if (!okFlag) errors.push(`motion: ${name}`);
});

console.log(`знімків: ${shots.length} у SPEC_NOTES/shots/`);
shots.forEach((s) => console.log(`  ${s}`));
console.log(errors.length ? `помилок у консолі: ${errors.length}` : 'консоль чиста на всіх кадрах');
if (errors.length) process.exit(1);

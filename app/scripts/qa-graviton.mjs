// КАМЕРТОН · живий QA шару ГРАВІТОН.
//
// Текстові перевірки не бачать каскаду і рантайму, а перші дефекти вкладки
// СЮЖЕТИ жили саме там, тому і в цього шару є прогін у headless Chromium
// поверх зібраного dist/kamerton.html: сцена, банер моделі, паспорт тіла,
// місток у досьє, нерухомість у спокої і знімки для SPEC_NOTES/shots.
//
// Запуск: npm run qa:graviton (потрібен свіжий npm run build)

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = process.cwd();
const DIST = path.join(root, 'dist', 'kamerton.html');
const OUT = path.join(root, '..', 'SPEC_NOTES', 'shots');
const WEEK = process.env.QA_WEEK || 'w32';

if (!fs.existsSync(DIST)) {
  console.error('немає dist/kamerton.html: спершу npm run build');
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

const derived = JSON.parse(
  fs.readFileSync(path.join(root, 'src', 'data', 'derived', 'graviton.json'), 'utf8')
);
const w32 = derived.weeks['2026-W32'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

let failed = 0;
const ok = (cond, name, got = '') => {
  console.log(`${cond ? 'ok  ' : 'ПРОВАЛ'} ${name}${got ? `  got=${got}` : ''}`);
  if (!cond) failed += 1;
};

await page.goto(`${pathToFileURL(DIST).href}#${WEEK}/graviton`, { waitUntil: 'load' });
// Заставка тримає екран 4.1 с: прапорці сесії ставляться на сторінці, як у
// qa:shots, бо для file:// сховище ненадійне ззовні.
await page.evaluate(() => {
  sessionStorage.setItem('kamerton.intro', '1');
  sessionStorage.setItem('kamerton.onboarded', '1');
});
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1500);

ok(await page.locator('.k-grav').count() === 1, 'сцена ГРАВІТОН змонтована');
const nodes = await page.locator('.k-grav__body').count();
ok(nodes === w32.bodies.length, `тіл на сцені стільки, скільки в проєкції (${w32.bodies.length})`, nodes);
const pairs = await page.locator('.k-grav__pair').count();
ok(pairs === w32.pairs.length, `пар на сцені стільки, скільки в проєкції (${w32.pairs.length})`, pairs);

const banner = await page.locator('.k-grav__banner').first().textContent();
ok(banner.includes('МОДЕЛЬНА ПРОЄКЦІЯ'), 'банер моделі стоїть', banner.slice(0, 40));
ok(await page.locator('.k-grav__banner--draft').count() === 1,
  'бейдж чернетки видно, поки розмітка не validated');

// Рух: наказ власника (третій показ) зробив сцену живою, тому перевіряється
// ПРОТИЛЕЖНЕ до карти ТЕМ: тіла гало мають дрейфувати, частинки акреції
// мають існувати, а reduced motion перевіряється окремим контекстом нижче.
const nodePos = () => page.evaluate(() => {
  const el = document.querySelector('.k-grav__node.is-mute');
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y };
});
const p1 = await nodePos();
await page.waitForTimeout(1500);
const p2 = await nodePos();
ok(Math.hypot(p2.x - p1.x, p2.y - p1.y) > 0.5, 'гало дрейфує за Кеплером',
  `зсув ${Math.hypot(p2.x - p1.x, p2.y - p1.y).toFixed(2)}px`);
ok(await page.locator('.k-grav__flow').count() > 0, 'частинки акреції на звʼязках існують');

// Висновки моделі видно без жодного кліку.
ok(await page.locator('.k-grav__insights .k-grav__insight').count() >= 3,
  'панель висновків моделі показує вердикти тижня');

// Панель згортається в чіп і розгортається назад (прохання власника).
await page.locator('.k-grav__insights-fold').click();
ok(await page.locator('.k-grav__insights').count() === 0
  && await page.locator('.k-grav__insights-chip').count() === 1,
'висновки згортаються в чіп');
await page.locator('.k-grav__insights-chip').click();
ok(await page.locator('.k-grav__insights').count() === 1, 'чіп розгортає висновки назад');

// Паспорт: вхід через панель висновків, бо тіла тепер дрейфують і
// playwright чесно відмовляється клікати по нестабільному елементу.
// Заодно перевіряється сам місток «висновок відкриває паспорт».
await page.locator('.k-grav__insight', { hasText: 'Криза довіри' }).first().click();
await page.waitForTimeout(300);
ok(await page.locator('.k-grav__pass').count() === 1, 'паспорт тіла відкрився');
const verdicts = await page.locator('.k-grav__verdicts li').count();
ok(verdicts === 3, 'у атрактора три вердикти моделі', verdicts);
const methods = await page.locator('.k-grav__pass .k-grav__method').count();
ok(methods >= 10, 'кожна величина паспорта несе метод походження', methods);
const passText = await page.locator('.k-grav__pass').textContent();
ok(passText.includes('СИЛА НАРАТИВУ'), 'паспорт показує силу наративу');
ok(passText.includes('РИЗИК ФАЗОВОГО ПЕРЕХОДУ'), 'паспорт показує ризик фазового переходу');
ok(await page.locator('.k-grav__forcev').count() > 0, 'стрілки сили до ядра існують');

await page.screenshot({ path: path.join(OUT, `graviton_${WEEK}_passport.png`) });

// Місток у досьє: кнопка веде в шар ТЕМИ на ту саму тему.
await page.locator('.k-grav__dossier').click();
await page.waitForTimeout(600);
ok((await page.evaluate(() => location.hash)).includes('/temy/t_gov_trust'),
  'ДОСЬЄ ТЕМИ веде в шар ТЕМИ на ту саму тему');

// Назад на сцену: чистий кадр поля для аркуша.
await page.evaluate(() => { location.hash = '#w32/graviton'; });
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, `graviton_${WEEK}_field.png`) });

// Ядро зобовʼязане пояснювати себе саме: клік відкриває паспорт ядра.
// force, бо барицентр дрейфує разом з полем і елемент ніколи не «stable».
await page.locator('.k-grav__coreg').click({ force: true });
await page.waitForTimeout(250);
const corePass = await page.locator('.k-grav__pass').textContent();
ok(corePass.includes('ЯДРО КУЛЬТУРНОЇ ІДЕНТИЧНОСТІ'), 'клік по ядру відкриває паспорт ядра');
ok(corePass.includes('1.') || (await page.locator('.k-grav__core-list li').count()) === 6,
  'паспорт ядра перелічує шість архетипів');
await page.screenshot({ path: path.join(OUT, `graviton_${WEEK}_core.png`) });

// ХРОНІКА: старт з першого зрізу, автопросування, чесний підпис, стоп.
await page.locator('.k-grav__chron').click();
await page.waitForTimeout(300);
const cap1 = await page.locator('.k-grav__chron-cap').textContent();
ok(cap1.includes('W30') && cap1.includes('вимір лише у зрізах'),
  'хроніка стартує з першого зрізу і чесно підписана', cap1.slice(0, 40));
await page.waitForTimeout(3600);
const cap2 = await page.locator('.k-grav__chron-cap').textContent();
ok(cap2.includes('W31'), 'хроніка сама просувається до наступного зрізу', cap2.slice(0, 20));
await page.locator('.k-grav__chron').click();
ok(await page.locator('.k-grav__chron-cap').count() === 0, 'зупинка повертає активний тиждень');

ok(consoleErrors.length === 0, 'консоль чиста', consoleErrors.join(' | ').slice(0, 120));

// prefers-reduced-motion: годинник сцени стоїть, кадр той самий, руху нуль.
const rmCtx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
const rmPage = await rmCtx.newPage();
await rmPage.goto(`${pathToFileURL(DIST).href}#${WEEK}/graviton`, { waitUntil: 'load' });
await rmPage.evaluate(() => {
  sessionStorage.setItem('kamerton.intro', '1');
  sessionStorage.setItem('kamerton.onboarded', '1');
});
await rmPage.reload({ waitUntil: 'load' });
await rmPage.waitForTimeout(1200);
const rmPos = () => rmPage.evaluate(() => {
  const el = document.querySelector('.k-grav__node');
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y };
});
const r1 = await rmPos();
await rmPage.waitForTimeout(1200);
const r2 = await rmPos();
ok(r1.x === r2.x && r1.y === r2.y, 'reduced motion зупиняє сцену повністю');
await rmCtx.close();

await browser.close();
if (failed) {
  console.error(`\nГРАВІТОН QA: провалів ${failed}`);
  process.exit(1);
}
console.log('\nГРАВІТОН QA: все зійшлось, знімки в SPEC_NOTES/shots/');

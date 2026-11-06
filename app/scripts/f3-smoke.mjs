// КАМЕРТОН · F3 · перевірка режиму ПРЕЦЕДЕНТИ на зібраному file://
//
// Навіщо окремо від golden-скриптів: усе, що ця перевірка ловить, у вузлі не
// видно взагалі. Пріоритетний ланцюжок Escape, реальний рух на екрані і те, чи
// не з'їхала кнопка на другий рядок, існують тільки в живому браузері.
//
// Саме тут знайдено дефект E3: перше натискання Escape мовчки пропадало, бо
// слухач ланцюжка перереєстровувався під час розсилки тієї самої події.
//
// Запуск: npm run qa:f3 (після npm run build)

import { chromium } from 'playwright';
import path from 'node:path';
import url from 'node:url';

const APP = path.resolve('dist/kamerton.html');
const SHOTS = path.resolve('..', 'SPEC_NOTES', 'shots');
const CASE = 'case_225_425';

let bad = 0;
const say = (k, v) => {
  const ok = v === true || typeof v === 'number';
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'ПРОВАЛ'} ${k}`, v === true ? '' : JSON.stringify(v));
};

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));

/* --- вхід просто з адреси: кадр порівняння мусить пересилатись --- */
await p.goto(url.pathToFileURL(APP).href + `#w32/case/${CASE}/precedents`);
await p.waitForTimeout(1200);

say('режим відкривається з адреси', (await p.locator('.k-prec').count()) === 1);

const banner = (await p.locator('.k-prec__banner').textContent().catch(() => '')) || '';
say('банер підпису показано', banner.includes('підпис: очікує'));

// Порядок екрана після приймання: спочатку історія, стадії згорнуті.
const stories = await p.locator('.k-prec__story').count();
say('історій на екрані', stories);
say('розбір згорнутий за замовчуванням', (await p.locator('.k-prec__analysis').count()) === 0);

const heads = await p.locator('.k-prec__headline').allInnerTexts();
say('кожна історія має заголовок', heads.length === stories && heads.every((h) => h.trim().length > 8));
// Формула вимагає рік і країну в заголовку: підпис без прив'язки це етикетка.
say('у заголовку є рік', heads.every((h) => /\b(1[6-9]|20)\d{2}\b/.test(h)), heads.join(' | '));

const body = await p.locator('.k-prec__panel').innerText();
say('нема відсотка схожості', !/схожість\s*\d+\s*%|similarity/i.test(body));
// .k-label малює написи капслоком, тому порівняння без урахування регістру.
say('є блок «сталося ось що»', /сталося ось що/i.test(body));
say('є блок «призвело до»', /призвело до/i.test(body));

// Стадії нікуди не поділись, вони під розкриттям.
await p.locator('.k-prec__toggle').click();
await p.waitForTimeout(300);
const deep = await p.locator('.k-prec__panel').innerText();
say('у розборі є «де аналогія ламається»', deep.includes('ДЕ АНАЛОГІЯ ЛАМАЄТЬСЯ'));
say('у розборі є «що спостерігаємо»', deep.includes('ЩО СПОСТЕРІГАЄМО'));
say('у розборі є застереження про prior',
  deep.includes('історичний prior') || deep.includes('одного кейса'));
say('нема латинських кодів рівня', !/\b(high|med|low)\b/.test(deep));
say('яскравих треків не більше двох',
  (await p.locator('.k-prec__track--now, .k-prec__track--selected').count()) <= 2 || 'більше двох');
await p.locator('.k-prec__toggle').click();
await p.waitForTimeout(300);

/* --- рух: після входу повний спокій ---
   Розмір PNG усієї сторінки для цього не годиться: напівпрозора завіса над
   полотном дає розбіжність у байтах без жодного руху. Тому дві незалежні
   перевірки: жодної живої анімації і побайтова рівність самих елементів. */
await p.waitForTimeout(5200); // заставка 4.1 с: міряємо спокій після неї, а не крізь неї
const live = await p.evaluate(() => document.getAnimations()
  .filter((a) => a.playState === 'running')
  .map((a) => (a.effect?.target?.className || '?') + ':' + (a.animationName || 'anim')));
say('жодної живої анімації', live.length === 0 ? true : live);

const el = async (sel) => (await p.locator(sel).screenshot()).length;
const pan1 = await el('.k-prec__panel');
const can1 = await el('.k-map__canvas');
await p.waitForTimeout(1200);
say('панель режиму нерухома', pan1 === (await el('.k-prec__panel')) ? true : 'рухається');
say('карта під режимом нерухома', can1 === (await el('.k-map__canvas')) ? true : 'рухається');

await p.screenshot({ path: path.join(SHOTS, 'f3_precedents.png') });

/* --- вибір іншої історії не додає третього яскравого треку --- */
const other = p.locator('.k-prec__story:not(.is-sel)').first();
if (await other.count()) {
  await other.click();
  await p.waitForTimeout(300);
  say('вибрана рівно одна історія', (await p.locator('.k-prec__story.is-sel').count()) === 1);
}

/* --- Escape. Регресія на дефект E3: перше натискання не має пропадати --- */
await p.keyboard.press('Escape');
await p.waitForTimeout(500);
say('ПЕРШИЙ Escape закриває режим', (await p.locator('.k-prec').count()) === 0);
say('адреса повернулась до карти', !p.url().includes('/precedents'));

/* --- вхід з вікна КЕЙСИ --- */
await p.goto(url.pathToFileURL(APP).href + '#w32');
await p.waitForTimeout(1600);
// коуч-мітки першого візиту накривають карту: закриваємо їх так само, як читач
if (await p.locator('.k-coach').count()) {
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
}
say('коуч-мітки закриваються Escape', (await p.locator('.k-coach').count()) === 0);

const casesBtn = p.locator('.k-bluf__cell, .k-bluf__slim').filter({ hasText: /КЕЙС/i }).first();
if (await casesBtn.count()) {
  await casesBtn.click();
  await p.waitForTimeout(700);
}
const entries = await p.locator('.k-casetabs__go').allInnerTexts();
say('входи ІСТОРИЧНІ ПРЕЦЕДЕНТИ у вікні кейсів', entries.length);
say('кожен вхід названий', entries.every((t) => t.includes('ІСТОРИЧНІ ПРЕЦЕДЕНТИ')), entries.join(' | '));
// Кейс без картки не мовчить і не веде в чужий список: він каже, що аналогів немає.
say('кейс без аналогів каже про це прямо',
  entries.every((t) => /· \d+$/.test(t.trim()) || t.includes('не знайдені')), entries.join(' | '));

await p.locator('.k-casetabs__go').first().click();
await p.waitForTimeout(900);
say('вхід з кейса відкриває режим', (await p.locator('.k-prec').count()) === 1);
say('адреса стала адресою режиму', p.url().includes('/precedents'));

/* --- головне з приймання: РІЗНІ кейси дають РІЗНІ прецеденти --- */
await p.keyboard.press('Escape');
await p.waitForTimeout(400);
const seen = new Map();
for (const id of ['case_svr_appointment', 'case_225_425', 'case_szch_order', 'case_lviv_tck']) {
  await p.goto(url.pathToFileURL(APP).href + `#w32/case/${id}/precedents`);
  await p.waitForTimeout(900);
  const hs = await p.locator('.k-prec__headline').allInnerTexts();
  const empty = (await p.locator('.k-prec__empty').count()) === 1;
  seen.set(id, empty ? 'ПОРОЖНЬО' : hs.join(' ~ '));
  say(`кейс ${id}: свій вміст`, empty || hs.length > 0 ? true : 'ні картки, ні порожнього стану');
}
const values = [...seen.values()].filter((v) => v !== 'ПОРОЖНЬО');
say('прецеденти різних кейсів не збігаються',
  new Set(values).size === values.length, [...seen].map(([k, v]) => `${k}: ${v.slice(0, 40)}`).join(' | '));

/* --- клік по САМИХ супутниках на карті, а не тільки за адресою ---
   Саме на це вказало приймання: клік по будь-якому супутнику відкривав один і
   той самий список. Перевірка за адресою цього не довела б, бо обходить і
   хіт-тест, і прив'язку. Координати віддає рушій під прапорцем ?qa=1: супутники
   живуть на канві, у DOM їх немає. */
await p.goto(url.pathToFileURL(APP).href + '?qa=1#w32');
await p.waitForTimeout(6500);
for (let i = 0; i < 3 && (await p.locator('.k-coach').count()); i += 1) {
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
}

const canvasBox = await p.locator('.k-map__canvas').boundingBox();
const moons = await p.evaluate(() => (window.__kamertonMap?.getMoonAnchors?.() || []));
say('супутників на карті', moons.length);

const opened = new Map();
for (const m0 of moons) {
  // Позиції беремо заново перед КОЖНИМ кліком: супутники обертаються навколо
  // своєї зорі, і координата, зняята хвилину тому, вказує вже в порожнє місце.
  const live = await p.evaluate(() => (window.__kamertonMap?.getMoonAnchors?.() || []));
  const m = live.find((x) => x.id === m0.id) || m0;
  await p.mouse.click(canvasBox.x + m.x, canvasBox.y + m.y);
  await p.waitForTimeout(800);
  const id = (p.url().match(/case\/([^/]+)\/precedents/) || [])[1] || null;
  const head = (await p.locator('.k-prec__headline').allInnerTexts()).join(' ~ ')
    || (await p.locator('.k-prec__empty').count() ? 'ПОРОЖНЬО' : 'НЕ ВІДКРИЛОСЬ');
  opened.set(m0.id, { id, head });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
}
say('кожен супутник відкрив СВІЙ кейс',
  [...opened].every(([moonId, r]) => r.id === moonId)
    ? true
    : [...opened].map(([k, r]) => `${k} -> ${r.id}`).join(' | '));
const contents = [...opened.values()].map((r) => r.head).filter((h) => h !== 'ПОРОЖНЬО');
say('вміст у різних супутників різний',
  new Set(contents).size === contents.length ? true : contents.join(' | ').slice(0, 200));

say('консоль чиста', errs.length === 0 ? true : errs.slice(0, 5));

console.log(bad ? `\nПРОВАЛІВ: ${bad}` : '\nF3 СМОУК ЗІЙШОВСЯ');
await b.close();
process.exit(bad ? 1 : 0);

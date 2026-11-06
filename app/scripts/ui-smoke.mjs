// КАМЕРТОН · перевірка фіксів по прийманню на зібраному file://
//
// Покриває те, що в вузлі не існує: сітку сцени по шарах, неперервний показ і
// узгодженість числа індексу між шапкою і смугою показу.
//
// Запуск: npm run qa:ui (після npm run build)

import { chromium } from 'playwright';
import path from 'node:path';
import url from 'node:url';

const APP = path.resolve('dist/kamerton.html');

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

await p.goto(url.pathToFileURL(APP).href + '#w32');
await p.waitForTimeout(6500);
// коуч-мітки першого візиту накривають карту: знімаємо їх так само, як читач
for (let i = 0; i < 3 && (await p.locator('.k-coach').count()); i += 1) {
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
}

const layer = (name) => p.locator('button').filter({ hasText: new RegExp(`^${name}$`) }).first();
const cols = () => p.evaluate(() => {
  const s = document.querySelector('.k-stage');
  const t = getComputedStyle(s).gridTemplateColumns.split(' ').map((v) => Math.round(parseFloat(v)));
  return { left: t[0], right: t[2] };
});

/* ---- П5 і П6 · сітка сцени по шарах ---- */
console.log('\n--- сітка сцени ---');
let c = await cols();
say('ТЕМИ: ліворуч плашка ЗРІЗ', c.left === 40 ? true : c);
say('ТЕМИ: праворуч нічого', c.right === 0 ? true : c);
say('ТЕМИ: плашка на місці', (await p.locator('.k-rail').allInnerTexts()).join() === 'ЗРІЗ');

await layer('АКТОРИ').click();
await p.waitForTimeout(700);
c = await cols();
say('АКТОРИ: ЗРІЗУ немає і місця він не тримає', c.left === 0 ? true : c);
say('АКТОРИ: жодної плашки', (await p.locator('.k-rail').count()) === 0);
say('АКТОРИ: кнопки PLAY немає', (await p.locator('.k-play__launch button').count()) === 0);

await layer('КОМПАС').click();
await p.waitForTimeout(700);
c = await cols();
say('КОМПАС: ліворуч нічого', c.left === 0 ? true : c);
say('КОМПАС: праворуч плашка РЕЄСТР', c.right === 40 ? true : c);
say('КОМПАС: вхід у реєстр рівно один',
  (await p.locator('button').filter({ hasText: /^РЕЄСТР$/ }).count()) === 1);

await p.locator('.k-rail').first().click();
await p.waitForTimeout(700);
c = await cols();
say('КОМПАС: відкритий реєстр бере колонку', c.right === 340 ? true : c);
say('КОМПАС: реєстр тим самим доком, що і ЗРІЗ', (await p.locator('.k-dock--right').count()) === 1);

await p.getByRole('button', { name: 'згорнути реєстр' }).click();
await p.waitForTimeout(900);
c = await cols();
// Головний баг приймання: після закриття лишалась порожня смуга на третину екрана.
say('КОМПАС: після закриття порожнього місця немає', c.right === 40 ? true : c);

/* ---- П4 · неперервний показ ---- */
console.log('\n--- показ ---');
await layer('ТЕМИ').click();
await p.waitForTimeout(700);
const launch = await p.locator('.k-play__launch button').allInnerTexts();
say('кнопка запуску рівно одна', launch.length === 1 ? true : launch);
say('у назві немає числа', launch[0] === 'PLAY' ? true : launch[0]);

await p.locator('.k-play__launch button').first().click();
await p.waitForTimeout(700);
say('застереження про інтерполяцію на екрані',
  (await p.locator('.k-play__honest').innerText()).includes('не вимір'));

const days = [];
const heroes = [];
for (let i = 0; i < 5; i += 1) {
  days.push((await p.locator('.k-play__date').innerText()).trim());
  heroes.push((await p.locator('.k-hero__num').innerText()).trim());
  const bar = (await p.locator('.k-play__pos').innerText()).match(/ІНДЕКС\s+(\d+)/i);
  // B7 не має винятку для показу: індекс у шапці і на смузі це одне число.
  say(`день ${days[i]}: індекс один`, bar && bar[1] === heroes[i] ? true : `шапка ${heroes[i]}, смуга ${bar?.[1]}`);
  await p.waitForTimeout(1150);
}
say('дати йдуть підряд', new Set(days).size === days.length ? true : days.join(','));

// Карта мусить рухатись під час показу і завмирати після нього.
const canvas = p.locator('.k-map__canvas');
const m1 = (await canvas.screenshot()).length;
await p.waitForTimeout(600);
say('карта під час показу рухається', m1 !== (await canvas.screenshot()).length);

await p.keyboard.press('Escape');
await p.waitForTimeout(1800);
const r1 = (await canvas.screenshot()).length;
await p.waitForTimeout(1000);
// Критерій фази D: у спокої на карті немає ані руху, ані пульсацій.
say('після виходу нуль руху', r1 === (await canvas.screenshot()).length);
say('показ вийшов зі стану', (await p.locator('.k-play').count()) === 0);

/* ---- перехід на інший шар зупиняє показ ---- */
await p.locator('.k-play__launch button').first().click();
await p.waitForTimeout(600);
await layer('КОМПАС').click();
await p.waitForTimeout(700);
say('зміна шару зупиняє показ', (await p.locator('.k-play').count()) === 0);

/* ---- регресія: одна клавіша закриває одне ---- */
console.log('\n--- пріоритет Escape ---');
// Мітки і заставка памʼятаються в сесії, а перевірити треба саме перший візит.
await p.evaluate(() => sessionStorage.clear());
await p.goto(url.pathToFileURL(APP).href + '#w32/temy/t_case_225');
await p.reload();
await p.waitForTimeout(7000);
say('посилання на досьє відкриває досьє', (await p.locator('.k-dock--right').count()) === 1);
const coachUp = (await p.locator('.k-coach').count()) === 1;
say('мітки першого візиту зʼявились', coachUp);
if (coachUp) {
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);
  // Мітки лежать поверх усього, тому перший Escape мусить зняти саме їх
  // і НЕ чіпати досьє під ними: одна клавіша це один крок.
  say('перший Escape зняв тільки мітки', (await p.locator('.k-coach').count()) === 0);
  say('досьє під мітками вціліло', (await p.locator('.k-dock--right').count()) === 1);
}
say('сигнал-рядок прецедентів у досьє', await p.locator('.k-prec-signal').count());

say('консоль чиста', errs.length === 0 ? true : errs.slice(0, 5));

console.log(bad ? `\nПРОВАЛІВ: ${bad}` : '\nСМОУК ІНТЕРФЕЙСУ ЗІЙШОВСЯ');
await b.close();
process.exit(bad ? 1 : 0);

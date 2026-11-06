// КАМЕРТОН · заборони вкладки СЮЖЕТИ.
//
// Вкладка СЮЖЕТИ побудована на кількох відмовах, і саме відмови ламаються
// найтихіше: ніхто не «зламає» форму зорі випадково, а от повернути колір як
// категорію, сховати бейдж чернетки або протягнути неузгоджену розмітку на
// екран можна однією правкою і не помітити цього на скріншоті.
//
// Тому тут перевіряються не фічі, а межі:
//   1. червоного і зеленого на вкладці немає ніде і ні в якій ролі;
//   2. кольорова палітра сюжетів мертва, а не закоментована про запас;
//   3. бейдж чернетки не можна сховати прапорцем показу;
//   4. розмітка глибини існує тільки для тижня, на якому її узгоджували;
//   5. у бандл не потрапила розмітка зі статусом draft;
//   6. prefers-reduced-motion реально вимикає рух, а не згадується;
//   7. морфологій рівно шість і кожна має власний рецепт.
//
// Запуск: node scripts/check-plots.mjs

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

// Скрипт мають запускати з app/, як решту родини check-*. Але падати через
// робочий каталог безглуздо, тому за відсутності теки вкладки поруч корінь
// береться від самого файла.
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = fs.existsSync(path.join(process.cwd(), 'src', 'plots'))
  ? process.cwd()
  : path.join(HERE, '..');

const PLOTS = path.join(ROOT, 'src', 'plots');
// Стилів вкладки три: морфології, сцена поля і зум-сцена. Перевірка читає всі
// три як один текст, бо заборони на кольори і на рух стосуються вкладки цілком,
// а не окремого файла.
const CSS_FILES = fs.existsSync(PLOTS)
  ? fs.readdirSync(PLOTS).filter((f) => f.endsWith('.css')).map((f) => path.join(PLOTS, f))
  : [];
const SRC = path.join(ROOT, 'src');
const DEPTH = path.join(ROOT, 'src', 'data', 'derived', 'depth.json');
const LENSES = path.join(ROOT, 'src', 'data', 'registry', 'lenses.json');
const DIST = path.join(ROOT, 'dist', 'kamerton.html');

const BADGE = 'чернетка до узгодження';
const MARKUP_WEEK = '2026-W32';
const PLOT_IDS = [
  'loss_unpaid_debt',
  'betrayal_by_own',
  'sacrifice',
  'fight_the_monster',
  'return_that_fails',
  'voice_from_below',
];

let bad = 0;
const say = (k, ok, note = '') => {
  if (!ok) bad += 1;
  console.log(`${ok ? 'ok  ' : 'ПРОВАЛ'} ${k}${note ? '  ' + note : ''}`);
};
const read = (p) => fs.readFileSync(p, 'utf8');

/* ------------------------------------------------------------------ */
/* Інструмент: чи належить колір червоно-зеленій групі                  */
/* ------------------------------------------------------------------ */

/* Заборонено не «слово red у коді», а сигнал тону. Тому колір розбирається
   на тон (hue) і насиченість (chroma), а не звіряється зі списком:
     червоний  hue 335..25 при chroma від 0.12
     зелений   hue 70..165 при chroma від 0.25
   Пороги підібрані так, щоб проходили саме ті кольори, які на вкладці
   законні: бурштин фокуса #E8A03C (hue 35, це вже не червоний), бірюза
   туманності #1E6E63 (hue 172, це вже не зелений) і бліді зеленуваті тінти
   зорі і пилу, у яких chroma настільки мала, що вони читаються як біле.
   Нижній поріг для червоного суворіший, ніж для зеленого: приглушена цегла
   в темряві все одно прочитається як тривога, а бліда мʼята - ні.
   Що класифікатор не сліпий, доводить самоперевірка нижче: він мусить
   упізнати самі токени тону, #DB5B3C і #8FE39A. */
function hueChroma([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: (h + 360) % 360, c: d / 255 };
}

function tonal(rgb) {
  const { h, c } = hueChroma(rgb);
  if ((h >= 335 || h <= 25) && c >= 0.12) return 'червоний';
  if (h >= 70 && h < 165 && c >= 0.25) return 'зелений';
  return null;
}

function hexRgb(hex) {
  let s = hex.replace('#', '');
  if (s.length === 3 || s.length === 4) s = s.slice(0, 3).split('').map((ch) => ch + ch).join('');
  s = s.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}

/** Усі кольори файла: hex і rgb()/rgba(), бо заборона не про синтаксис. */
function colorsOf(text) {
  const out = [];
  for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) out.push({ lit: m[0], rgb: hexRgb(m[0]) });
  for (const m of text.matchAll(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/g)) {
    out.push({ lit: m[0] + ')', rgb: [+m[1], +m[2], +m[3]] });
  }
  return out;
}

/** Прибрати коментарі: заборона стосується коду, а не розмови про нього. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:/])\/\/[^\n]*/g, '$1');
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 1. Червоного і зеленого немає ніде                                   */
/* ------------------------------------------------------------------ */

/* Червоний і зелений це мова тональності в ТЕМАХ (деструктив/конструктив).
   На СЮЖЕТАХ сюжет несе форма і рух, а колір не кодує нічого. Одна тонова
   пляма тут ламає читання всього продукту: читач вирішить, що бачить оцінку.
   Тому перевіряються обидва шляхи, якими тон може зайти: успадкований токен
   і власний колір у файлі. */

console.log('--- заборона червоного і зеленого ---');

// Успадковувати з Астролябії можна тільки те, що не несе тону. Список
// закритий: нове імʼя треба вписати руками і тим самим визнати рішення.
const OK_TOKEN = [
  /^--a-warn$/,          // бурштин: фокус і чернетка, тону не кодує
  /^--a-mono$/,          // шрифт
  /^--a-track$/,         // трекінг
  /^--a-t-state$/,       // тривалість переходу
  /^--a-neb-1$/,         // бірюза туманності
  /^--a-fs-[a-z0-9]+$/,  // кеглі
  /^--a-s[0-9]+$/,       // відступи
  /^--a-text(-[a-z]+)?$/, // нейтральні тексти
];

const tabFiles = [...CSS_FILES, ...(fs.existsSync(PLOTS)
  ? fs.readdirSync(PLOTS).filter((f) => f.endsWith('.jsx')).map((f) => path.join(PLOTS, f))
  : [])];

say('файли вкладки на місці', CSS_FILES.length >= 3 && tabFiles.length > 3,
  tabFiles.map((f) => path.basename(f)).join(', '));

say('класифікатор упізнає самі токени тону',
  tonal(hexRgb('#DB5B3C')) === 'червоний' && tonal(hexRgb('#8FE39A')) === 'зелений',
  '#DB5B3C · #8FE39A');

tabFiles.filter((f) => fs.existsSync(f)).forEach((file) => {
  const name = path.basename(file);
  const text = read(file);

  const tone = [...new Set([...text.matchAll(/--a-(destr|constr)\b/g)].map((m) => m[0]))];
  say(`${name}: токенів тону немає`, tone.length === 0, tone.join(', '));

  const alien = [...new Set([...text.matchAll(/--a-[a-z0-9-]+/g)].map((m) => m[0]))]
    .filter((t) => !OK_TOKEN.some((re) => re.test(t)));
  say(`${name}: успадковані токени тільки нейтральні`, alien.length === 0, alien.join(', '));

  const cols = colorsOf(text);
  const hot = cols.filter((c) => tonal(c.rgb));
  say(`${name}: власних кольорів червоно-зеленої групи немає`, hot.length === 0,
    hot.map((c) => `${c.lit} ${tonal(c.rgb)}`).join(', '));
  const seen = [...new Set(cols.map((c) => c.lit))];
  if (seen.length) {
    console.log(`     кольори ${name}: ${seen.map((lit) => {
      const { h, c } = hueChroma(colorsOf(lit)[0].rgb);
      return `${lit} h${Math.round(h)} c${c.toFixed(2)}`;
    }).join(' · ')}`);
  }
});

/* ------------------------------------------------------------------ */
/* 2. Палітра сюжетів мертва                                            */
/* ------------------------------------------------------------------ */

/* Змінні --a-plot-1..6 були кольоровим кодуванням сюжетів у першій редакції
   шару. Поки вони живі бодай як «не використовуються, хай лежать», повернути
   колір як категорію можна одним рядком. Тому перевіряється весь src, а не
   тільки вкладка. Згадка в коментарі порушенням не рахується: пояснення, чому
   палітру видалено, це і є захист від її повернення. */

console.log('\n--- мертва палітра сюжетів ---');

const srcFiles = walk(SRC).filter((f) => /\.(css|jsx?|mjs|json)$/.test(f));
const live = [];
const mentions = [];
srcFiles.forEach((f) => {
  const text = read(f);
  if (!text.includes('--a-plot-')) return;
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  const line = text.slice(0, text.indexOf('--a-plot-')).split('\n').length;
  (stripComments(text).includes('--a-plot-') ? live : mentions).push(`${rel}:${line}`);
});
say('токенів --a-plot- у коді немає', live.length === 0, live.join(', '));
if (mentions.length) console.log(`     згадки в коментарях (пояснення видалення): ${mentions.join(', ')}`);

/* ------------------------------------------------------------------ */
/* 3. Бейдж чернетки не ховається                                       */
/* ------------------------------------------------------------------ */

/* Показ неузгодженої розмітки це свідомий виняток, і бейдж це його ціна.
   Небезпека не в тому, що бейдж зникне, а в тому, що його приберуть «на
   демо» прапорцем показу і забудуть повернути. Тому умова біля бейджа має
   бути рівно одна і рівно статусна: scene.draft / node.draft. Жодного
   showDraft, hideDraft чи props.demo поруч бути не може. */

console.log('\n--- бейдж чернетки ---');

['PlotZoom.jsx', 'PlotsScene.jsx'].forEach((name) => {
  const file = path.join(PLOTS, name);
  if (!fs.existsSync(file)) { say(`${name}: файл на місці`, false); return; }
  const text = read(file);

  const spots = [...text.matchAll(new RegExp(BADGE, 'g'))].map((m) => m.index);
  say(`${name}: бейдж на місці`, spots.length > 0, `входжень ${spots.length}`);

  spots.forEach((i) => {
    const tag = text.lastIndexOf('<', i);
    const open = text.lastIndexOf('{', tag);
    const guard = text.slice(open + 1, tag).trim();
    const line = text.slice(0, i).split('\n').length;
    // Дозволено рівно один доступ до .draft і нічого більше.
    const onlyStatus = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.draft\s*&&$/.test(guard);
    say(`${name}:${line} бейдж під статусом розмітки`, onlyStatus, guard);
  });

  const flag = [...new Set([...text.matchAll(/\b\w*(?:show|hide|toggle|demo)\w*[Dd]raft\w*\b|\bdraft(?:Visible|Hidden|Shown|Off)\b/gi)]
    .map((m) => m[0]))];
  say(`${name}: прапорця показу чернетки немає`, flag.length === 0, flag.join(', '));
});

/* ------------------------------------------------------------------ */
/* 4. Розмітка тільки на своєму тижні                                   */
/* ------------------------------------------------------------------ */

/* Розмітка глибини робилась і узгоджувалась на W32. Якщо вона раптом
   зʼявиться на іншому тижні, це означає не «шар виріс», а що чиясь рука
   розкопіювала сюжети на дані, яких ніхто не читав. Мовчання шару на інших
   тижнях чесніше за підставлений сюжет. */

console.log('\n--- розмітка глибини ---');

if (!fs.existsSync(DEPTH)) {
  say('depth.json на місці', false);
} else {
  const depth = JSON.parse(read(DEPTH));
  const markups = depth.markups || [];
  const weeks = [...new Set(markups.map((m) => m.week))];
  say(`розмітка тільки ${MARKUP_WEEK}`,
    markups.length > 0 && weeks.length === 1 && weeks[0] === MARKUP_WEEK,
    `розміток ${markups.length}, тижні: ${weeks.join(', ') || 'немає'}`);
  const statuses = [...new Set(markups.map((m) => m.status))];
  console.log(`     статуси розміток: ${statuses.join(', ') || 'немає'}`);
}

/* ------------------------------------------------------------------ */
/* 5. Сира чернетка не доїжджає на екран                                */
/* ------------------------------------------------------------------ */

/* Правило продукту: в UI тільки validated. Виняток один і названий:
   draft_for_alignment, розмітка, яку показують саме заради узгодження, і
   завжди з бейджем. Статус draft виключення не має: це чернетка, якої ще
   ніхто не читав очима. */

console.log('\n--- бандл ---');

if (!fs.existsSync(DIST)) {
  console.log('     бандла немає, перевірку пропущено (npm run build)');
} else {
  const html = read(DIST);
  // Шукається саме поле статусу зі значенням draft. Голий рядок "draft"
  // шукати не можна: у бандлі законно живе фільтр status!=="draft", який
  // чернетки якраз відрізає, і поле triggers_status у довіднику лінз.
  const raw = [...html.matchAll(/(^|[^A-Za-z0-9_])"?status"?\s*:\s*"draft"/g)];
  say('розмітки зі статусом draft у бандлі немає', raw.length === 0, `входжень ${raw.length}`);
  const aligned = (html.match(/status"?\s*:\s*"draft_for_alignment"/g) || []).length;
  console.log(`     draft_for_alignment у бандлі: ${aligned} (свідомий виняток)`);
  say('виняток доїхав разом з бейджем', aligned === 0 || html.includes(BADGE));
}

/* ------------------------------------------------------------------ */
/* 6. Дисципліна руху                                                   */
/* ------------------------------------------------------------------ */

/* Уся вкладка тримається на русі, і саме тому вона зобовʼязана вміти стояти.
   Заявити prefers-reduced-motion мало: блок мусить реально гасити анімації
   вкладки, інакше читач із вимкненим рухом отримає її найгіршу версію. */

console.log('\n--- дисципліна руху ---');

if (CSS_FILES.length) {
  const css = CSS_FILES.map((f) => read(f)).join('\n');
  const at = css.indexOf('@media (prefers-reduced-motion: reduce)');
  say('блок prefers-reduced-motion є', at >= 0);
  if (at >= 0) {
    let depth = 0;
    let end = at;
    for (let i = css.indexOf('{', at); i < css.length; i += 1) {
      if (css[i] === '{') depth += 1;
      if (css[i] === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
    }
    const block = css.slice(at, end + 1);
    say('у блоці вимкнено анімації', /animation:\s*none/.test(block));
    say('вимкнення накрило сцену і легенду',
      block.includes('.k-syuzh') && block.includes('.k-syuzh-leg'));
  }
}

/* ------------------------------------------------------------------ */
/* 7. Шість морфологій, шість рецептів                                  */
/* ------------------------------------------------------------------ */

/* Кожен сюжет довідника мусить мати власну морфологію: у момент, коли дві
   позиції почнуть малюватись однією формою, вкладка втратить єдину мову, яку
   має, бо кольору для розрізнення тут немає. */

console.log('\n--- морфології ---');

const starFile = path.join(PLOTS, 'PlotStar.jsx');
if (!fs.existsSync(starFile)) {
  say('PlotStar.jsx на місці', false);
} else {
  const star = read(starFile);
  const map = star.match(/const SHAPES\s*=\s*\{([\s\S]*?)\n\};/);
  say('мапа SHAPES знайдена', Boolean(map));
  if (map) {
    const pairs = [...map[1].matchAll(/([a-z_]+)\s*:\s*([A-Za-z0-9_]+)/g)]
      .map((m) => [m[1], m[2]]);
    say('морфологій рівно шість', pairs.length === 6, `${pairs.length}`);
    const ids = pairs.map((p) => p[0]);
    const missing = PLOT_IDS.filter((id) => !ids.includes(id));
    say('усі шість id довідника на місці', missing.length === 0, missing.join(', '));
    const comps = pairs.map((p) => p[1]);
    say('кожен сюжет має власний рецепт', new Set(comps).size === comps.length, comps.join(', '));
  }
  PLOT_IDS.forEach((id) => say(`${id}: id є у файлі`, star.includes(id)));

  if (fs.existsSync(LENSES)) {
    const reg = JSON.parse(read(LENSES)).plots || [];
    const regIds = reg.map((p) => p.id);
    say('довідник лінз тримає ті самі шість сюжетів',
      regIds.length === PLOT_IDS.length && PLOT_IDS.every((id) => regIds.includes(id)),
      regIds.join(', '));
  }
}

console.log(bad ? `\nЗАБОРОНИ ПОРУШЕНО: ${bad}` : '\nЗАБОРОНИ ВКЛАДКИ ТРИМАЮТЬСЯ');
process.exit(bad ? 1 : 0);

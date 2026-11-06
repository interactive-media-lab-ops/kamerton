// КАМЕРТОН · самоперевірка інваріантів на зібраному продукті.
//
// Це не тест логіки (для неї є golden-скрипти), а звірка того, що продукт як
// артефакт лишається тим, чим має бути: одним офлайновим файлом без мережі, без
// інструментів редактора всередині, без вигаданих текстів і без сирих даних,
// зіпсованих збіркою.
//
// Запуск: node scripts/check-invariants.mjs

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist', 'kamerton.html');
const RAW = path.join(ROOT, 'src', 'data', 'raw', 'weeks.json');
const CORPUS_DIR = path.join(ROOT, 'src', 'data', 'corpus', 'precedents');

let bad = 0;
const say = (k, ok, note = '') => {
  if (!ok) bad += 1;
  console.log(`${ok ? 'ok  ' : 'ПРОВАЛ'} ${k}${note ? '  ' + note : ''}`);
};

if (!fs.existsSync(DIST)) {
  console.error('спершу npm run build');
  process.exit(1);
}
const html = fs.readFileSync(DIST, 'utf8');
const kb = Math.round(fs.statSync(DIST).size / 1024);

// Ліміт піднято з 700 до 750 КБ рішенням власника від 18.08.2026, після того
// як бандл упритул став на 700 і візуальні правки вкладки СЮЖЕТИ в нього вже
// не влазили. Ліміт це не забобон: продукт це один офлайн-файл, який пересилають
// поштою, і його вага має лишатись рішенням, а не наслідком.
//
// Що вже зроблено, перш ніж просити більше місця: корпус прецедентів перестав
// їхати в бандл цілком і йде проєкцією (scripts/build-precedents.mjs), це дало
// 23 КБ. Наступний хід тієї ж природи, якщо запас знову скінчиться: у
// raw/weeks.json картки прецедентів займають 48 КБ, ансамбль 16 КБ, і обоє йдуть
// у продукт без проєкції.
const LIMIT_KB = 750;

console.log('--- продукт як артефакт ---');
say(`бандл ${kb} КБ у межах ${LIMIT_KB}`, kb <= LIMIT_KB);
say('офлайн: жодного зовнішнього посилання', !/(src|href)="(https?:|\/\/)/.test(html));
say('схема валідації не потрапила в продукт', !/ZodObject|zodError/i.test(html));
say('SheetJS не потрапив у продукт', !/SheetJS|XLSX\.utils/i.test(html));
say('довгих тире в бандлі немає', !html.includes('—'));

console.log('\n--- сирі дані ---');
let head = null;
try {
  head = execSync('git show HEAD:app/src/data/raw/weeks.json', {
    cwd: path.join(ROOT, '..'), maxBuffer: 1e8,
  });
} catch { /* перший коміт або відсутній git */ }
const now = fs.readFileSync(RAW);
if (head) {
  const strip = (buf) => {
    const d = JSON.parse(buf.toString());
    // Прецеденти це єдине, що дозволено дописувати в тиждень поза імпортером.
    d.weeks.forEach((w) => { delete w.precedents; });
    return JSON.stringify(d);
  };
  const same = strip(head) === strip(now);
  say('збірка не змінила контракт (крім прецедентів)', same);
  const h = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 12);
  console.log(`     sha256 HEAD ${h(head)} · робоче ${h(now)}`);
}

console.log('\n--- корпус прецедентів ---');
const corpus = fs.existsSync(CORPUS_DIR)
  ? fs.readdirSync(CORPUS_DIR).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(CORPUS_DIR, f), 'utf8')))
  : [];
say(`кейсів у корпусі: ${corpus.length}`, corpus.length > 0);
corpus.forEach((c) => {
  // Подача: без року і країни кейс на екрані не читається.
  say(`${c.id}: заголовок з роком`, /\b(1[6-9]|20)\d{2}\b/.test(c.headline || ''), c.headline);
  say(`${c.id}: сказано, що сталося`, (c.what_happened || '').length > 80);
  say(`${c.id}: сказано, чим закінчилось`, (c.led_to || '').length > 40);
  say(`${c.id}: два і більше джерел`, (c.sources || []).length >= 2, `${(c.sources || []).length}`);
  say(`${c.id}: не тільки слабкі джерела`, (c.sources || []).some((s) => s.quality < 3));
  // Правило 11: непідписаний кейс мусить сам про це заявляти.
  if (c.signature === 'pending') {
    say(`${c.id}: не вдає підписаний`, /очікує/.test(c.verified_by || ''));
  }
  say(`${c.id}: без довгих тире`, !JSON.stringify(c).includes('—'));
});

console.log('\n--- картки в тижні ---');
const data = JSON.parse(now.toString());
const week = data.weeks[data.weeks.length - 1];
const cards = week.precedents || [];
const ids = new Set(corpus.map((c) => c.id));
console.log(`     тиждень ${week.id}: кейсів ${(week.cases || []).length}, карток ${cards.length}`);
cards.forEach((card) => {
  say(`${card.id}: прив'язана до кейса тижня`,
    (week.cases || []).some((c) => c.id === card.case_id), card.case_id);
  say(`${card.id}: аналогів не більше трьох`, (card.analogs || []).length <= 3);
  say(`${card.id}: усі аналоги є в корпусі`,
    (card.analogs || []).every((a) => ids.has(a.historical_case_id)));
  // Правило 5: жодного зведеного відсотка схожості.
  say(`${card.id}: без відсотка схожості`, card.similarity_pct === undefined);
  say(`${card.id}: сказано, де аналогія ламається`, (card.break_conditions || []).length > 0);
  say(`${card.id}: названо, що спостерігаємо`, (card.watch_signals || []).length > 0);
});

// Головне з приймання: різні кейси не можуть ділити один набір аналогів.
const sets = cards.map((c) => (c.analogs || []).map((a) => a.historical_case_id).sort().join(','));
say('кейси не ділять один набір аналогів', new Set(sets).size === sets.length, sets.join(' | '));

const withCard = new Set(cards.map((c) => c.case_id));
const without = (week.cases || []).filter((c) => !withCard.has(c.id)).map((c) => c.id);
console.log(`     кейси з чесним порожнім станом: ${without.join(', ') || 'немає'}`);

console.log(bad ? `\nІНВАРІАНТИ НЕ ЗІЙШЛИСЬ: ${bad}` : '\nІНВАРІАНТИ ТРИМАЮТЬСЯ');
process.exit(bad ? 1 : 0);

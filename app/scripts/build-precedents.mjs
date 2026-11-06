// КАМЕРТОН · похідна проєкція корпусу прецедентів для екрана.
//
// Навіщо: корпус ішов у бандл ЦІЛКОМ, глобом з App.jsx, разом з полями, які на
// екран не виходять жодного разу. Це коштувало 47.7 КБ мінімізовано при ліміті
// бандла 700 КБ, і після вкладки СЮЖЕТИ запасу не лишилось узагалі. Хід той
// самий, що і в Глибинного шару (scripts/build-depth.mjs): corpus/ це джерело,
// derived/ це породжуване, у продукт іде спроєктоване.
//
// Що лишається за бортом: примітки аналітика (notes), воєнний контекст, тригер,
// реакція системи, актори, інформаційне середовище, полиця, класи, seeded, а
// також уся службова колонка розмітника (added_by, verified_by, added_date,
// signature). Це матеріал для розбору і для валідатора, а не для показу: жоден
// з них не читається в src/panels/PrecedentsMode.jsx.
//
// Що лишається живим і чому:
//   headline/what_happened/led_to  подача, заради якої панель перебирали;
//   timeline                       треки фаз, вирівнювання за механізмом;
//   outcome.code                   слово результату в згорнутому заголовку;
//   sources                        доказовість режиму. Ріжеться до ref: тултіп
//                                  показує саме посилання, а type і quality
//                                  читає тільки валідатор, який працює по
//                                  корпусу, а не по бандлу;
//
// Чого немає навіть із читаних полів: title. У JSX він стоїть запасним
// заголовком на випадок порожнього headline, але порожній headline не існує:
// його вимагає валідатор корпусу, і нижче стоять ще одні ворота саме на це.
// Возити 1.3 КБ запасних назв в офлайн-файл заради випадку, який заблокований
// двома перевірками, це платити за страх, а не за надійність.
//
// Скрипт нічого не пише в corpus/ і не чіпає raw/.
//
// Запуск: npm run build:precedents (входить у prebuild)

import fs from 'node:fs';
import path from 'node:path';
import { validateCorpus, formatIssues } from '../src/data/schema.js';

const root = process.cwd();
const DATA = path.join(root, 'src', 'data');
const DIR = path.join(DATA, 'corpus', 'precedents');
const OUT = path.join(DATA, 'derived', 'precedents.json');

const dict = JSON.parse(fs.readFileSync(path.join(DATA, 'registry', 'class_tags.json'), 'utf8'));

const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith('.json')) : [];
const cases = [];
const readErrors = [];

files.forEach((f) => {
  try {
    cases.push(JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
  } catch (e) {
    readErrors.push({ level: 'error', where: f, message: `не JSON: ${e.message}` });
  }
});

// Ворота: побитим корпусом продукт не годують. Правила ті самі, що і в
// check:corpus, другої копії їх не існує. Звірка імені файлу з id лишається
// тільки там: вона про те, щоб кейс можна було знайти руками в теці, а не про
// те, що піде на екран.
const issues = [...readErrors, ...validateCorpus(cases, dict)];
const errors = issues.filter((i) => i.level === 'error');
if (errors.length) {
  console.error(`корпус прецедентів не проходить валідацію, помилок: ${errors.length}\n`);
  console.error(formatIssues(errors));
  process.exit(1);
}

const noHeadline = cases.filter((c) => !String(c.headline || '').trim());
if (noHeadline.length) {
  console.error('кейс без headline на екрані лишиться безіменним: ' +
    noHeadline.map((c) => c.id).join(', '));
  process.exit(1);
}

const projected = cases.map((c) => ({
  id: c.id,
  headline: c.headline,
  period: c.period,
  ...(c.geo ? { geo: c.geo } : {}),
  what_happened: c.what_happened,
  led_to: c.led_to,
  // З наслідку на екран іде код: підпис до нього живе в панелі, а description
  // це текст для розбору, і читача він ніде не зустрічає.
  outcome: { code: c.outcome.code },
  timeline: (c.timeline || []).map((t) => ({
    offset_weeks: t.offset_weeks,
    phase: t.phase,
    event: t.event,
  })),
  // Прапорець кладеться тільки коли він true: панель питає його на істинність.
  ...(c.adaptation ? { adaptation: true } : {}),
  sources: (c.sources || []).map((s) => ({ ref: s.ref })),
}));

const out = {
  _note: 'Породжується scripts/build-precedents.mjs з corpus/precedents. Руками не редагується: правки вносяться в корпус.',
  cases: projected,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`, 'utf8');

// Обидва числа рахуються по мінімізованому JSON, бо в бандл іде саме він:
// відступи вихідного файлу до продукту не доїжджають.
const source = cases.reduce((a, c) => a + Buffer.byteLength(JSON.stringify(c), 'utf8'), 0);
const kept = Buffer.byteLength(JSON.stringify(projected), 'utf8');
console.log(`derived/precedents.json: кейсів ${projected.length}, ` +
  `${(kept / 1024).toFixed(1)} КБ проти ${(source / 1024).toFixed(1)} КБ корпусу ` +
  `(звільнено ${((source - kept) / 1024).toFixed(1)} КБ, корпус у бандл більше не йде)`);

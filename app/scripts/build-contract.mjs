// КАМЕРТОН · похідна проєкція контракту тижня для екрана.
//
// Навіщо: raw/weeks.json їхав у бандл ЦІЛКОМ, усі 424 КБ, разом із полями, які
// продукт не читає жодного разу, і з картками прецедентів, які імпортер клонує
// з тижня в тиждень без змін. Бандл через це виріс до 889 КБ при ліміті 750.
// Хід той самий, що і в Глибинного шару (build-depth.mjs) та корпусу
// прецедентів (build-precedents.mjs): raw/ це джерело, derived/ це породжуване,
// у продукт іде спроєктоване. Сирці лишаються недоторканими, їх і далі
// стереже check:raw-immutable.
//
// Що лишається за бортом і чому. Кожен рядок нижче звірений grep-ом по
// src/panels, src/plots, src/map, src/play, src/graviton, selectors.js,
// ensemble.js: жодне з цих полів там не читається.
//
//   week.domains                         не читається ніде;
//   precedents[].analogs[].differences   панель показує likenesses, а різниці
//                                        живуть у «де аналогія ламається»
//                                        (break_conditions) і в матриці;
//   precedents[].status_history          службова колонка розмітника;
//   precedents[].verified_date           те саме;
//   ensemble.markets[].bets[].ts         час ставки пише лише App.jsx для
//                                        нових ставок у сесії, ніхто не читає;
//   ensemble.markets[].aggregate         замінюється похідним ensemble.json у
//   ensemble.markets[].history           withDerived(); сирий дубль вирізається
//                                        лише там, де похідне існує.
//
// Що НЕ переписується: жодного тексту, числа, статусу. Проєкція тільки
// прибирає і дедуплікує, вона не може зробити дані «зручнішими».
//
// Дедуплікація карток прецедентів. Імпортер переносить картки в наступний
// тиждень як є, і W33 ніс повну копію карток W32 (33 КБ). Однакові картки
// лягають у таблицю precedent_cards один раз, а тиждень посилається на них
// ключем. Назад у масиви їх збирає hydrateContract() у selectors.js: для решти
// коду тиждень виглядає так само, як у сирцях.
//
// Запуск: npm run build:contract (входить у prebuild)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const DATA = path.join(root, 'src', 'data');
const RAW = path.join(DATA, 'raw', 'weeks.json');
const DERIVED_ENSEMBLE = path.join(DATA, 'derived', 'ensemble.json');
const OUT = path.join(DATA, 'derived', 'contract.json');

const raw = JSON.parse(fs.readFileSync(RAW, 'utf8'));
const derived = fs.existsSync(DERIVED_ENSEMBLE)
  ? JSON.parse(fs.readFileSync(DERIVED_ENSEMBLE, 'utf8'))
  : { weeks: {} };

const bytes = (o) => Buffer.byteLength(JSON.stringify(o));
const before = bytes(raw);

const cards = {};
const cardKey = (card) => {
  const h = crypto.createHash('sha1').update(JSON.stringify(card)).digest('hex').slice(0, 8);
  return `${card.id}@${h}`;
};

const dropped = {};
const drop = (obj, key, why) => {
  if (obj && Object.prototype.hasOwnProperty.call(obj, key)) {
    dropped[why] = (dropped[why] || 0) + bytes(obj[key]);
    delete obj[key];
  }
};

const weeks = raw.weeks.map((src) => {
  const w = structuredClone(src);
  drop(w, 'domains', 'week.domains');

  (w.precedents || []).forEach((card) => {
    (card.analogs || []).forEach((a) => drop(a, 'differences', 'analogs.differences'));
    drop(card, 'status_history', 'card.status_history');
    drop(card, 'verified_date', 'card.verified_date');
  });

  const dw = derived.weeks?.[w.id];
  (w.ensemble?.markets || []).forEach((m) => {
    (m.bets || []).forEach((b) => drop(b, 'ts', 'bets.ts'));
    if (dw?.markets?.[m.id]) {
      drop(m, 'aggregate', 'markets.aggregate (є в derived)');
      drop(m, 'history', 'markets.history (є в derived)');
    }
  });

  if (Array.isArray(w.precedents)) {
    w.precedents = w.precedents.map((card) => {
      const key = cardKey(card);
      if (!cards[key]) cards[key] = card;
      return key;
    });
  }
  return w;
});

const out = {
  ...raw,
  weeks,
  precedent_cards: cards,
  projection: {
    source: 'raw/weeks.json',
    // Відбиток сирців: check:contract звіряє його і не дасть зібрати продукт
    // зі старої проєкції після правки weeks.json.
    source_sha256: crypto.createHash('sha256').update(fs.readFileSync(RAW)).digest('hex'),
    builder: 'scripts/build-contract.mjs',
    note: 'проєкція для екрана: поля лише вирізані й дедупліковані, жодне не переписане',
  },
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 0) + '\n');

const after = bytes(out);
const totalCards = raw.weeks.reduce((n, w) => n + (w.precedents || []).length, 0);
console.log(`derived/contract.json: ${(after / 1024).toFixed(1)} КБ (сирці ${(before / 1024).toFixed(1)} КБ, мінус ${((before - after) / 1024).toFixed(1)} КБ)`);
console.log(`  картки прецедентів: ${totalCards} у тижнях, ${Object.keys(cards).length} унікальних`);
Object.entries(dropped).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
  console.log(`  вирізано ${k}: ${(v / 1024).toFixed(1)} КБ`);
});

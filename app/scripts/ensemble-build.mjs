// КАМЕРТОН · перерахунок агрегатів шару КОМПАС перед збіркою випуску.
//
// Поле aggregate у контракті НІКОЛИ не редагується руками: воно повністю
// похідне від bets і san_estimate. Скрипт перечитує контракт і рахує все заново.
//
// Раніше він писав результат НАЗАД у src/data/weeks.json. Це порушувало головне
// правило корпусу: сирі дані тижня недоторканні. Гірше, знімок історії брав дату
// «сьогодні», тому кожен календарний день, коли хтось збирав проєкт, спарклайни
// КОМПАСа отримували зайву точку з тими самими числами. Перевірено: один білд
// дописував 5 фальшивих точок. Ще й запис ішов ДО валідаційного гейта, тому
// збірка, що впала, все одно лишала сирці зміненими.
//
// Тепер потік односторонній: raw/weeks.json читається, derived/ensemble.json
// пишеться. Накопичена історія живе в derived, а не в сирцях.
//
// Запускається перед build (npm run build) і окремо через npm run build:derive.

import fs from 'node:fs';
import path from 'node:path';
import { aggregate, registryScore, validateDraft } from '../src/data/ensemble.js';

// Шлях від робочої теки, а не від import.meta.url: скрипт їде через esbuild
// у node_modules/.cache, і там відносний шлях вказував би не туди.
const RAW = path.join(process.cwd(), 'src', 'data', 'raw', 'weeks.json');
const DERIVED_DIR = path.join(process.cwd(), 'src', 'data', 'derived');
const DERIVED = path.join(DERIVED_DIR, 'ensemble.json');

const raw = fs.readFileSync(RAW, 'utf8');
const data = JSON.parse(raw);

// Дата знімка береться з аргументу, якщо він є: так демо-історію можна
// відтворити детерміновано, а не залежати від дня запуску збірки.
const STAMP = process.argv[2] || new Date().toISOString().slice(0, 10);

// Попередній похідний файл це єдине місце, де живе накопичена історія.
let prev = { weeks: {} };
if (fs.existsSync(DERIVED)) {
  try {
    prev = JSON.parse(fs.readFileSync(DERIVED, 'utf8'));
  } catch {
    // зіпсований похідний файл не має валити збірку: він повністю відтворюваний
    prev = { weeks: {} };
  }
}

const out = { schema_version: data.meta?.version ?? null, stamp: STAMP, weeks: {} };

let markets = 0;
let snapshots = 0;
let flagged = 0;
const problems = [];
const warnings = [];

data.weeks.forEach((week) => {
  const ens = week.ensemble;
  if (!ens) return;
  const cfg = ens.config || {};
  // Конфіг теж перевіряється: екстремізація нижче одиниці не «поправка на
  // консервативність», а стискання консенсусу до половини. При d = 0 всі оцінки
  // стають 50%, промахи зникають з рахунку, і Brier ансамблю штучно виграє.
  // Це рівно той шлях, яким рахунок можна сховати конфігом, тому він закритий.
  const d = Number(cfg.extremization_d);
  if (Number.isFinite(d) && d < 1) {
    problems.push(`${week.id}: extremization_d = ${d}. Нижче одиниці поправка стискає` +
      ' консенсус до половини і ховає промахи з реєстру. Допустимі значення від 1.0 до 2.0.');
  }
  const participants = ens.participants || [];
  const prevWeek = prev.weeks?.[week.id] || {};
  const bucket = { markets: {} };

  (ens.markets || []).forEach((m) => {
    markets += 1;
    const agg = aggregate(m, participants, cfg);
    if (agg.divergence_flag) flagged += 1;

    // Історія консенсусу: знімок на кожну збірку. Саме вона живить спарклайн
    // і фон-криву в приладі. Сид береться з сирців один раз, далі історія
    // накопичується тільки тут. Один знімок на день: повторна збірка того
    // самого дня переписує останній, а не плодить точки.
    const seeded = Array.isArray(m.history) ? m.history : [];
    const carried = prevWeek.markets?.[m.id]?.history;
    const history = Array.isArray(carried) && carried.length ? carried.slice() : seeded.slice();

    if (agg.p_ensemble != null) {
      const shot = {
        date: STAMP,
        p_ensemble: agg.p_ensemble,
        p_san: m.san_estimate?.p ?? null,
        p_humans_median: agg.p_humans_median,
      };
      // Порівнюємо ЧИСЛА, а не лише дату. Порівняння за датою прибрало
      // дублікати в межах одного дня, але кожен новий календарний день усе
      // одно дописував точку з тими самими значеннями: фальшиві точки просто
      // переїхали з сирців у derived. Спарклайн має показувати зміни, а не
      // календар збірок.
      const last = history[history.length - 1];
      const same = last
        && last.p_ensemble === shot.p_ensemble
        && last.p_san === shot.p_san
        && last.p_humans_median === shot.p_humans_median;
      if (last && last.date === STAMP) history[history.length - 1] = shot;
      else if (!same) { history.push(shot); snapshots += 1; }
    }

    bucket.markets[m.id] = { aggregate: agg, history };

    // Валідація йде по КОЖНОМУ ринку, а не лише по чернетках. Заборонений ринок,
    // заведений одразу як open, інакше не перевірявся б ніде: чернеток у контракті
    // може не бути взагалі, а інтерфейсу реєстратора в цьому випуску немає.
    const v = validateDraft(m, { activeCampaignTopics: ens.active_campaign_topics || [] });
    if (!v.ok) {
      problems.push(`${week.id} ${m.id} [${m.status}]: ${v.errors.map((e) => e.message).join(' ')}`);
    }
    v.warnings.forEach((wn) => warnings.push(`${week.id} ${m.id}: ${wn.message}`));

    // Розвʼязаний ринок з нечітким результатом мовчки випадав би з реєстру:
    // scoreMarket повертає null, ринок зникає і з рахунку, і зі списку промахів.
    // Тиха втрата промаху це рівно те, чого реєстр не має допускати.
    if ((m.status === 'resolved' || m.status === 'scored') &&
        m.resolution?.outcome !== true && m.resolution?.outcome !== false) {
      problems.push(
        `${week.id} ${m.id}: статус «${m.status}», але resolution.outcome не true і не false. ` +
        'Такий ринок випав би з реєстру беззвучно.'
      );
    }
  });

  const score = registryScore(ens.markets || [], participants, cfg);
  // rows потрібні інтерфейсу, але це похідне від ринків: лишаємо тільки підсумок.
  const { rows, ...summary } = score;
  bucket.quarter_score = summary;
  out.weeks[week.id] = bucket;
});

// Валідація ПЕРЕД записом: збірка, що не пройшла гейт, не лишає по собі нічого.
if (problems.length) {
  console.error('збірка зупинена, ринки не проходять валідацію:');
  problems.forEach((p) => console.error('  ' + p));
  process.exit(1);
}

fs.mkdirSync(DERIVED_DIR, { recursive: true });
const next = JSON.stringify(out, null, 2) + '\n';
const changed = !fs.existsSync(DERIVED) || next !== fs.readFileSync(DERIVED, 'utf8');
if (changed) fs.writeFileSync(DERIVED, next);

// Сирці мусять лишитись байт у байт такими, якими прийшли.
if (fs.readFileSync(RAW, 'utf8') !== raw) {
  console.error('сирі дані змінились під час перерахунку: це заборонено');
  process.exit(1);
}

console.log(
  `КОМПАС: ринків ${markets}, з розходженням ${flagged}, знімків історії ${snapshots} ` +
  `на ${STAMP}, похідні ${changed ? 'оновлено' : 'без змін'}, сирці недоторкані`
);
warnings.forEach((w) => console.warn('  попередження: ' + w));

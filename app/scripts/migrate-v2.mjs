// КАМЕРТОН · одноразова міграція контракту до v2.
//
// Це ЄДИНИЙ скрипт, якому дозволено писати в сирі дані, і він запускається
// руками, а не збіркою. Правило 1 («жоден скрипт не пише у вхідні JSON») стосується
// збірки: саме там мовчазний запис псував корпус. Спека v2 (B3) навпаки прямо
// вимагає одноразову міграцію, тому вона винесена окремо і лишає по собі звіт.
//
// Робить дві речі в сирцях, обидві мінімальні і адитивні:
//   1. додає schema_version (B2: поле обовʼязкове, без нього імпортер не знає правил);
//   2. зводить method_notes до однієї форми {text,type}. У W30 це були обʼєкти,
//      у W32 голі рядки, і читачі малювали три порожні рядки на дефолтному тижні.
//
// І одну поза сирцями:
//   3. розводить змішані сутності у derived/entities.json (B3): Claim, Forecast,
//      Market, Scenario. Сирці при цьому не переписуються під нову структуру:
//      проєкція похідна і відтворювана, тому її можна перебудувати будь-коли.
//
// Запуск: npm run migrate:v2

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const RAW = path.join(root, 'src', 'data', 'raw', 'weeks.json');
const DERIVED_DIR = path.join(root, 'src', 'data', 'derived');
const DOCS = path.join(root, '..', 'docs');

const before = fs.readFileSync(RAW, 'utf8');
const data = JSON.parse(before);
const log = [];

/* ---------- 1. schema_version ---------- */
if (!data.schema_version) {
  // Версія схеми збігається з версією контракту: інакше на екрані і в даних
  // жили б два різні числа, а їх у репозиторії вже і так чотири.
  data.schema_version = String(data.meta?.version ?? '1.4');
  log.push(`- Додано \`schema_version: "${data.schema_version}"\` на верхній рівень (значення взято з \`meta.version\`).`);
}

/* ---------- 2. method_notes до однієї форми ---------- */
let fixedNotes = 0;
data.weeks.forEach((w) => {
  if (!Array.isArray(w.method_notes)) return;
  w.method_notes = w.method_notes.map((n) => {
    if (typeof n === 'string') {
      fixedNotes += 1;
      return { text: n, type: 'method' };
    }
    return n;
  });
});
if (fixedNotes) {
  log.push(`- Зведено ${fixedNotes} методологічних правил з голого рядка до \`{text,type}\` (усі у W32).` +
    ' До цього `ObjectCard` малював їх як порожні рядки у ФАКТАХ, а `RegistryWindow` як порожні ПРАВИЛА,' +
    ' хоча лічильник фактів у шапці їх рахував.');
}

/* ---------- запис сирців ---------- */
const after = JSON.stringify(data, null, 2) + '\n';
const rawChanged = after !== before;
if (rawChanged) fs.writeFileSync(RAW, after);

/* ---------- 3. розведення сутностей ---------- */
const entities = { schema_version: data.schema_version, weeks: {} };
const stats = { claims: 0, forecasts: 0, markets: 0, scenarios: 0 };
const unlinked = [];

data.weeks.forEach((w) => {
  const claims = [];
  const forecasts = [];
  const markets = [];
  const scenarios = [];

  // Claim: усе, що є твердженням без дедлайну. Епістемічний статус обовʼязковий.
  (w.quotes || []).forEach((q, i) => {
    claims.push({
      id: `${w.id}_q${i}`,
      text: q.text,
      status: q.status === 'fact' ? 'fact' : 'assessment',
      sources: q.attribution_domain ? [q.attribution_domain] : [],
    });
  });
  (w.method_notes || []).forEach((n, i) => {
    claims.push({ id: `${w.id}_m${i}`, text: n.text, status: 'fact', sources: ['методологія'] });
  });
  if (w.verdict?.threat) {
    claims.push({ id: `${w.id}_v_threat`, text: w.verdict.threat, status: 'assessment', sources: ['вердикт тижня'] });
  }
  if (w.verdict?.opportunity) {
    claims.push({ id: `${w.id}_v_opp`, text: w.verdict.opportunity, status: 'assessment', sources: ['вердикт тижня'] });
  }

  // Forecast редакційний: має дедлайн і критерій, але НЕ має ймовірності,
  // тому в рахунок входить лише статусом.
  (w.forecasts || []).forEach((f) => {
    forecasts.push({
      id: f.id,
      question: f.text,
      deadline: f.deadline,
      criterion: f.criterion,
      probability: null,
      status: f.status === 'partial_hit' ? 'hit' : f.status,
      origin: 'editorial',
      note: f.resolution_note || null,
    });
  });

  // Ринок і його прогноз. Саме тут живе число: ринок більше не тримає власну
  // ймовірність, він посилається на прогноз. Один прогноз = одне число (B7).
  (w.ensemble?.markets || []).forEach((m) => {
    const fid = `f_of_${m.id}`;
    const consensus = m.aggregate?.p_ensemble ?? null;
    forecasts.push({
      id: fid,
      question: m.question,
      deadline: m.resolve_by || null,
      criterion: m.resolution_criterion || null,
      probability: consensus,
      status: m.status === 'scored' || m.status === 'resolved'
        ? (m.resolution?.outcome === true ? 'hit' : m.resolution?.outcome === false ? 'miss' : 'void')
        : 'open',
      origin: 'market',
      epistemic_status: m.epistemic_status || null,
    });
    const estimates = [];
    if (m.san_estimate?.p != null) estimates.push({ by: 'san', p: m.san_estimate.p });
    (m.bets || []).forEach((b) => estimates.push({ by: b.by ?? b.participant ?? 'panel', p: b.p }));
    markets.push({
      id: m.id,
      forecast_id: fid,
      estimates,
      consensus,
      brier: m.aggregate?.brier_ensemble ?? null,
    });
    // source_forecast це походження («san» / «field» / «redteam»), а не id:
    // звʼязати ринок з редакційним прогнозом автоматично не можна.
    if (m.source_forecast && !(w.forecasts || []).some((f) => f.id === m.source_forecast)) {
      unlinked.push(`${w.id} · ${m.id}: source_forecast = «${m.source_forecast}» це походження, а не id прогнозу`);
    }
  });

  // Scenario: модельний наслідок важеля. Не прогноз і не факт.
  (w.levers || []).forEach((l) => {
    scenarios.push({
      id: `sc_${l.id}`,
      lever_id: l.id,
      effects: Object.entries(l.effect || {}).map(([target, delta]) => ({ target, delta })),
      model_version: data.schema_version,
      expected: l.expected || null,
    });
  });

  stats.claims += claims.length;
  stats.forecasts += forecasts.length;
  stats.markets += markets.length;
  stats.scenarios += scenarios.length;
  entities.weeks[w.id] = { claims, forecasts, markets, scenarios };
});

fs.mkdirSync(DERIVED_DIR, { recursive: true });
fs.writeFileSync(path.join(DERIVED_DIR, 'entities.json'), JSON.stringify(entities, null, 2) + '\n');

/* ---------- звіт ---------- */
const md = [
  '',
  '---',
  '',
  '# Міграція v2: розведення сутностей',
  '',
  'Згенеровано `app/scripts/migrate-v2.mjs`.',
  '',
  '## Зміни у сирих даних',
  '',
  ...(log.length ? log : ['- сирці вже відповідали v2, змін не потрібно']),
  '',
  'Це єдиний скрипт, якому дозволено писати в `raw/`, і він запускається руками.',
  'Збірка сирців не торкається: це стереже `npm run check:raw-immutable`.',
  '',
  '## Що куди пішло',
  '',
  `Проєкція лежить у \`app/src/data/derived/entities.json\` і повністю відтворювана.`,
  '',
  '| сутність | скільки | звідки |',
  '|---|---|---|',
  `| Claim | ${stats.claims} | цитати тижня, методологічні правила, вердикт |`,
  `| Forecast | ${stats.forecasts} | редакційні прогнози тижня + по одному на кожен ринок |`,
  `| Market | ${stats.markets} | ринки КОМПАСа, тепер посилаються на прогноз через \`forecast_id\` |`,
  `| Scenario | ${stats.scenarios} | важелі та їхні модельні наслідки |`,
  '',
  '## Головне рішення міграції',
  '',
  'У контракті v1.4 паралельно існували дві системи, що описували ті самі події:',
  'редакційні `week.forecasts` (є дедлайн і критерій, немає ймовірності) і ринки',
  '`ensemble.markets` (є ймовірність, критерій і дата розвʼязки). Ринок при цьому',
  'дублював поля прогнозу, тобто одне питання могло розʼїхатись на два різні числа.',
  '',
  'Після міграції ринок не тримає власної ймовірності: він посилається на прогноз',
  'через `forecast_id`, і число живе в одному місці (B7). Привид на карті, діамант',
  'у Компасі і рядок у Зрізі читають той самий запис.',
  '',
  '## Що НЕ звʼязалось автоматично',
  '',
  ...(unlinked.length
    ? [
      'Поле `source_forecast` у ринках це походження оцінки («san», «field», «redteam»),',
      'а не ідентифікатор прогнозу. Звʼязати ринок із редакційним прогнозом машинно',
      'неможливо, це редакційне рішення:',
      '',
      ...unlinked.map((u) => `- ${u}`),
      '',
      '> Потрібне рішення замовника: які саме редакційні прогнози відповідають яким ринкам.',
    ]
    : ['- усе звʼязалось']),
  '',
].join('\n');

fs.mkdirSync(DOCS, { recursive: true });
const reportPath = path.join(DOCS, 'migration_v2.md');
fs.appendFileSync(reportPath, md);

console.log(`сирці: ${rawChanged ? 'оновлено (одноразова міграція)' : 'без змін'}`);
log.forEach((l) => console.log('  ' + l.replace(/[`*]/g, '')));
console.log(`сутності: claims ${stats.claims}, forecasts ${stats.forecasts}, markets ${stats.markets}, scenarios ${stats.scenarios}`);
console.log(`не звʼязано автоматично: ${unlinked.length}`);
console.log('звіт дописано в docs/migration_v2.md');

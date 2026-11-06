// КАМЕРТОН · G0 · звʼязати ринки з прогнозами.
//
// Проблема, яку це закриває. У контракті паралельно жили дві системи, що
// описували ті самі події: редакційні week.forecasts (є дедлайн і критерій,
// немає ймовірності) і ensemble.markets (є ймовірність, критерій і дата
// розвʼязки). Звʼязку між ними не було жодної: поле source_forecast це
// походження оцінки («san», «field», «redteam»), а не ідентифікатор.
// Наслідок було видно на екрані: блок «Наступні 14 днів» показував «без числа».
//
// Рішення. Ринок уже містить усе, з чого складається прогноз, тому Forecast
// генерується з полів самого ринку, а ринок отримує forecast_id. Число при
// цьому НЕ копіюється: ймовірність лишається похідною від оцінок і живе в
// одному місці (правило B7). Прогноз тримає питання, дедлайн, критерій і статус.
//
// Кожен згенерований запис позначається needs_review: формулювання критерію
// писалось як критерій РИНКУ, і замовник має його підтвердити перш ніж воно
// піде в рахунок як формулювання ПРОГНОЗУ.
//
// Це одноразова міграція. Запуск: npm run migrate:g0

import fs from 'node:fs';
import path from 'node:path';

const RAW = path.join(process.cwd(), 'src', 'data', 'raw', 'weeks.json');
const before = fs.readFileSync(RAW, 'utf8');
const data = JSON.parse(before);

/** Статус ринку в статус прогнозу. Нерозвʼязаний ринок це відкритий прогноз. */
function statusOf(m) {
  const settled = m.status === 'resolved' || m.status === 'scored';
  if (!settled) return 'open';
  if (m.resolution?.outcome === true) return 'hit';
  if (m.resolution?.outcome === false) return 'miss';
  return 'open';
}

let created = 0;
let linked = 0;
const rows = [];

data.weeks.forEach((week) => {
  const markets = week.ensemble?.markets || [];
  if (!markets.length) return;
  week.forecasts = Array.isArray(week.forecasts) ? week.forecasts : [];

  markets.forEach((m) => {
    // id стабільний і виводиться з id ринку: повторний запуск нічого не дублює
    const fid = `f_mk_${m.id}`;

    if (!m.forecast_id) {
      m.forecast_id = fid;
      linked += 1;
    }

    if (week.forecasts.some((f) => f.id === fid)) return;

    week.forecasts.push({
      id: fid,
      opened: week.id,
      text: m.question,
      criterion: m.resolution_criterion || '',
      deadline: m.resolve_by || '',
      status: statusOf(m),
      // Формулювання прийшло з ринку і чекає на підтвердження замовником.
      // Поки прапорець стоїть, запис робочий, але не остаточний.
      needs_review: true,
      from_market: m.id,
      ...(m.resolution?.note ? { resolution_note: m.resolution.note } : {}),
    });
    created += 1;
    rows.push(`| \`${fid}\` | ${m.id} | ${statusOf(m)} | ${m.resolve_by || 'нема'} | ${(m.resolution_criterion || '').slice(0, 60)} |`);
  });
});

const after = JSON.stringify(data, null, 2) + '\n';
const changed = after !== before;
if (changed) fs.writeFileSync(RAW, after);

const md = [
  '',
  '---',
  '',
  '# G0 · ринки звʼязані з прогнозами',
  '',
  'Згенеровано `app/scripts/migrate-g0.mjs`.',
  '',
  `Створено Forecast-записів: **${created}**, проставлено \`forecast_id\`: **${linked}**.`,
  '',
  'Число не копіювалось: ймовірність лишається похідною від оцінок ринку і живе',
  'в одному місці. Прогноз тримає питання, дедлайн, критерій і статус.',
  '',
  '## Записи, що чекають на підтвердження',
  '',
  'Усі позначені `needs_review: true`. Формулювання писались як критерій РИНКУ;',
  'замовник має підтвердити, що вони коректні як формулювання ПРОГНОЗУ, після чого',
  'прапорець знімається.',
  '',
  '| id прогнозу | ринок | статус | дедлайн | критерій (з ринку) |',
  '|---|---|---|---|---|',
  ...rows,
  '',
].join('\n');

fs.appendFileSync(path.join(process.cwd(), '..', 'docs', 'migration_v2.md'), md);

console.log(`G0: створено ${created} прогнозів, звʼязано ${linked} ринків`);
console.log(`сирці ${changed ? 'оновлено' : 'без змін'}, усі записи з needs_review`);

// КАМЕРТОН · одноразова генерація реєстрів стабільних ID.
//
// Проблема, яку це закриває: теми, кейси і важелі оголошувались наново в кожному
// тижні, тому назва могла дрейфувати під стабільним id (t_gov_trust, t_hc_change,
// t_tck і t_cardboard міняли назву між тижнями), а один сюжет розʼїхався на два
// id (t_tech -> t_tech_update), через що topicTrack назавжди втратив його історію.
// Єдиним реєстром був actors_registry.
//
// Після цього скрипта реєстр стає джерелом правди для назв, а тижні лише
// посилаються на id. Валідатор далі не пускає невідомий id у тиждень.
//
// Скрипт НЕ пише в сирі дані. Він читає raw/ і створює registry/.
// Запускається руками один раз: npm run build:registry.
// Далі реєстр редагується людиною, а не машиною: нова сутність = явний запис.

import fs from 'node:fs';
import path from 'node:path';

const RAW = path.join(process.cwd(), 'src', 'data', 'raw', 'weeks.json');
const REG_DIR = path.join(process.cwd(), 'src', 'data', 'registry');
const DOCS = path.join(process.cwd(), '..', 'docs');

const rawText = fs.readFileSync(RAW, 'utf8');
const data = JSON.parse(rawText);

const SHORT_MAX = 24;

/**
 * Механічне коротке імʼя з перших слів. Ріжемо по межі слова і обриваємо на
 * розділовому знаку: назви тем побудовані як «Суть: уточнення», і саме перша
 * частина до двокрапки майже завжди і є коротким іменем.
 * Усі згенеровані імена позначаються short_name_todo: фінальні формулювання
 * дає замовник, машина лише прибирає порожнє поле.
 */
// Службові слова, на яких коротке імʼя обриватись не має: «Криза легітимності і»
// читається як недописане речення, а не як скорочення.
const TAIL_STOP = new Set([
  'і', 'й', 'та', 'а', 'але', 'як', 'в', 'у', 'з', 'із', 'зі', 'до', 'на',
  'про', 'для', 'під', 'над', 'за', 'від', 'по', 'при', 'без', 'що', 'це',
]);

function mechanicalShort(full) {
  const head = String(full).split(/[:(]/)[0].trim();
  let out = head;
  if (out.length > SHORT_MAX) {
    const cut = out.slice(0, SHORT_MAX);
    const at = cut.lastIndexOf(' ');
    out = at > 0 ? cut.slice(0, at) : cut;
  }
  out = out.replace(/[\s,;:.-]+$/, '');
  // Обриваємо хвостові службові слова, поки вони там є.
  let parts = out.split(' ');
  while (parts.length > 1 && TAIL_STOP.has(parts[parts.length - 1].toLowerCase())) {
    parts.pop();
  }
  return parts.join(' ').replace(/[\s,;:.-]+$/, '');
}

const report = [];

/* ---------- теми ---------- */
const topics = new Map();
data.weeks.forEach((w) => {
  (w.topics || []).forEach((t) => {
    if (!topics.has(t.id)) {
      topics.set(t.id, { id: t.id, full_name: t.name, names: [], first_seen: w.id });
    }
    const rec = topics.get(t.id);
    rec.full_name = t.name; // остання назва вважається чинною
    if (!rec.names.includes(t.name)) rec.names.push(t.name);
  });
});

// Реєстр після першої генерації редагується людиною: там зʼявляються alias-и
// злиття і затверджені замовником короткі імена. Тому генератор МЕРЖИТЬ, а не
// перезаписує: інакше кожен його запуск мовчки відкочував би ручні рішення.
const prevTopics = new Map();
const prevPath = path.join(REG_DIR, 'topics.json');
if (fs.existsSync(prevPath)) {
  try {
    JSON.parse(fs.readFileSync(prevPath, 'utf8')).forEach((t) => prevTopics.set(t.id, t));
  } catch { /* зіпсований реєстр не має валити генерацію: він відтворюється */ }
}

const topicsOut = [...topics.values()].map((r) => {
  const prev = prevTopics.get(r.id);
  // Затверджене коротке імʼя переживає регенерацію; механічне переобчислюється.
  const short = prev && prev.short_name_todo === false
    ? prev.short_name
    : mechanicalShort(r.full_name);
  if (r.names.length > 1) {
    report.push(`- \`${r.id}\`: назва дрейфувала ${r.names.length} рази. Чинна: «${r.full_name}». Було: ${r.names.slice(0, -1).map((n) => `«${n}»`).join(', ')}`);
  }
  return {
    id: r.id,
    short_name: short,
    short_name_todo: prev ? prev.short_name_todo !== false : true,
    full_name: r.full_name,
    first_seen: r.first_seen,
    // Ручні рішення реєстру переносяться як є.
    ...(prev?.aliases ? { aliases: prev.aliases } : {}),
    ...(prev?.merged_into ? { merged_into: prev.merged_into } : {}),
    ...(prev?.merge_note ? { merge_note: prev.merge_note } : {}),
  };
});

/* ---------- актори ---------- */
const actorFirst = new Map();
data.weeks.forEach((w) => {
  (w.actors || []).forEach((a) => {
    if (!actorFirst.has(a.id)) actorFirst.set(a.id, w.id);
  });
});
const actorsOut = (data.actors_registry || []).map((a) => ({
  id: a.id,
  name: a.name,
  type: a.type,
  first_seen: actorFirst.get(a.id) || null,
}));

/* ---------- кейси ---------- */
const cases = new Map();
data.weeks.forEach((w) => {
  (w.cases || []).forEach((c) => {
    if (!cases.has(c.id)) {
      cases.set(c.id, { id: c.id, title: c.title, opened: c.opened || null, first_seen: w.id, host_topic: c.host_topic || null });
    }
  });
});
const casesOut = [...cases.values()];

/* ---------- запис ---------- */
fs.mkdirSync(REG_DIR, { recursive: true });
const write = (name, payload) => {
  const file = path.join(REG_DIR, name);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
  return file;
};

write('topics.json', topicsOut);
write('actors.json', actorsOut);
write('cases.json', casesOut);

// Сирці мусять лишитись байт у байт такими, якими прийшли.
if (fs.readFileSync(RAW, 'utf8') !== rawText) {
  console.error('сирі дані змінились під час генерації реєстру: це заборонено');
  process.exit(1);
}

/* ---------- звіт ---------- */
const tooLong = topicsOut.filter((t) => t.short_name.length > SHORT_MAX);
const md = [
  '# Міграція v2: реєстри стабільних ID',
  '',
  'Згенеровано скриптом `app/scripts/build-registry.mjs` з `app/src/data/raw/weeks.json`.',
  'Сирі дані не змінювались.',
  '',
  '## Що куди пішло',
  '',
  `- **Теми** -> \`app/src/data/registry/topics.json\`: ${topicsOut.length} записів.`,
  `  Кожен має \`short_name\` (<= ${SHORT_MAX} символів, згенеровано механічно з перших слів)`,
  '  і `full_name`. Усі позначені `short_name_todo: true`: фінальні формулювання за замовником.',
  `- **Актори** -> \`app/src/data/registry/actors.json\`: ${actorsOut.length} записів,`,
  '  перенесено з `actors_registry` у сирцях плюс тиждень першої появи.',
  `- **Кейси** -> \`app/src/data/registry/cases.json\`: ${casesOut.length} записів.`,
  '',
  '## Дрейф назв, знайдений при міграції',
  '',
  ...(report.length ? report : ['- дрейфу не знайдено']),
  '',
  '## Відомий розрив історії',
  '',
  '- `t_tech` і `t_tech_update` це один сюжет під двома id. `topicTrack` зшиває теми',
  '  лише за однаковим id, тому історія теми обірвана. Склеювання це рішення замовника,',
  '  а не міграції: автоматично зшивати різні id небезпечно.',
  '',
  '## Що далі',
  '',
  '- Валідатор (`npm run check:contract`) не пускає у тиждень id, якого немає в реєстрі.',
  '- Нова сутність заводиться явним записом у реєстрі, а не появою в тижні.',
  ...(tooLong.length ? ['', `> УВАГА: ${tooLong.length} коротких імен вийшли довшими за ліміт і потребують ручної правки.`] : []),
  '',
].join('\n');

fs.mkdirSync(DOCS, { recursive: true });
fs.writeFileSync(path.join(DOCS, 'migration_v2.md'), md);

console.log(`реєстри: теми ${topicsOut.length}, актори ${actorsOut.length}, кейси ${casesOut.length}`);
console.log(`дрейф назв: ${report.length}`);
console.log(`найдовше коротке імʼя: ${Math.max(...topicsOut.map((t) => t.short_name.length))} символів (ліміт ${SHORT_MAX})`);
console.log('звіт: docs/migration_v2.md, сирці недоторкані');

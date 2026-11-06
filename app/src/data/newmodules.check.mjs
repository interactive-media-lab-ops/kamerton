// КАМЕРТОН · перевірка модулів, доданих у фазах A-H.
//
// Продукт не має тест-раннера, і це свідоме рішення проєкту: перевірки живуть
// golden-скриптами, які читають справжні дані і падають на справжніх регресіях.
// Новий код фаз A-H такої мережі не мав узагалі, тому вона тут.
//
// Перевіряються саме ті властивості, зламавши які, продукт почне тихо брехати:
// одне число в трьох місцях, ворота, що пропускають, журнал, що забуває, і
// розкладка підписів, що знову дозволяє налізання.

import { placeLabels } from '../util/labels.js';
import { parseHash, buildHash, weekFromSlug, weekSlug } from '../util/hash.js';
import { snapshotName } from '../util/snapshot.js';
import {
  forecastGhosts, upcomingForecasts, collectForecasts, leverModel,
  canonicalTopicId, topicIdFamily, topicTrack, getActiveWeek, WEEKS,
  precedentFor, precedentsOf, precedentSignal,
} from './selectors.js';
import { buildPlay } from '../play/scenarios.js';
import { buildActorfield, layoutActorfield } from '../map/actorfield.js';
import {
  PrecedentCard, outcomeDistribution, EditorialForecast,
  validateDepthMarkups, validateLensDictionary, depthBlock, depthAllLensesCut, depthGoesToReport,
  DEPTH_BLOCK_MAX_LINES, DEPTH_LINE_MAX_CHARS,
} from './schema.js';
import lenses from './registry/lenses.json';
import {
  cloneWeek, nextWeekId, gateStatus, dueForecasts, appendJournal, parseMetricsCsv, validateDraft,
  applyVerdicts,
} from '../../importer/lib.js';

let failed = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) { console.log(`ok   ${name}`); return; }
  failed += 1;
  console.log(`FAIL ${name}\n     got  ${a}\n     want ${b}`);
};
const ok = (name, cond, note = '') => eq(name + (note ? ` (${note})` : ''), Boolean(cond), true);

const W = WEEKS[WEEKS.length - 1].id;

console.log('\n--- A3 · розведення підписів ---');
// Останній за пріоритетом (rank 0) завжди лишається у верхньому ряду.
eq('однакові позиції розводяться по рядах',
  placeLabels([{ x: 100, rank: 1 }, { x: 100, rank: 0 }], { minGap: 20, rows: 2 }),
  [1, 0]);
eq('що не влізло, іде в tooltip',
  placeLabels([{ x: 10, rank: 2 }, { x: 10, rank: 1 }, { x: 10, rank: 0 }], { minGap: 20, rows: 2 }),
  [null, 1, 0]);
eq('далекі підписи лишаються в одному ряду',
  placeLabels([{ x: 0, rank: 0 }, { x: 500, rank: 1 }], { minGap: 20, rows: 2 }),
  [0, 0]);

console.log('\n--- E1 · адреса ---');
eq('збірка адреси', buildHash({ weekId: '2026-W32', layer: 'topics', nodeId: 't_tck' }), '#w32/temy/t_tck');
eq('розбір адреси', parseHash('#w32/temy/t_tck'), { weekSlug: 'w32', layer: 'topics', nodeId: 't_tck' });
eq('невідомий тиждень не вигадується', weekFromSlug('w99', WEEKS), null);
eq('вузол без шару в адресу не пишеться',
  buildHash({ weekId: '2026-W32', nodeId: 't_tck' }), '#w32');
eq('E2 імʼя знімка', snapshotName('2026-W32', 'topics'), 'kamerton_W32_temy.png');

console.log('\n--- G7 · злиття id ---');
eq('псевдонім веде на канонічний', canonicalTopicId('t_tech_update'), 't_tech');
eq('канонічний лишається собою', canonicalTopicId('t_tech'), 't_tech');
eq('родина id', [...topicIdFamily('t_tech_update')].sort(), ['t_tech', 't_tech_update']);
// Головне, заради чого робилось злиття: обидва id дають ОДНУ серію.
eq('серія однакова з будь-якого id',
  topicTrack('t_tech', W).map((p) => p.week),
  topicTrack('t_tech_update', W).map((p) => p.week));
ok('тиждень не дає двох точок в одну серію',
  new Set(topicTrack('t_tech', W).map((p) => p.week)).size === topicTrack('t_tech', W).length);

console.log('\n--- B7 · одне число у трьох місцях ---');
const ghosts = forecastGhosts(W);
const fmap = new Map(collectForecasts(W).map((f) => [f.id, f]));
const markets = getActiveWeek(W).ensemble?.markets || [];
ok('привиди є', ghosts.length > 0, `${ghosts.length}`);
let oneNumber = true;
ghosts.forEach((g) => {
  const f = fmap.get(g.forecastId);
  const m = markets.find((x) => x.forecast_id === g.forecastId);
  if (g.p !== f?.probability || g.p !== (m?.aggregate?.p_ensemble ?? null)) oneNumber = false;
});
ok('привид, прогноз і ринок дають одне число', oneNumber);
const zriz = upcomingForecasts(W);
ok('Зріз не суперечить прогнозу',
  zriz.every((z) => z.probability === fmap.get(z.id)?.probability));
ok('усі ринки звʼязані з прогнозами', markets.length > 0 && markets.every((m) => m.forecast_id));

console.log('\n--- D1 · показ ---');
// Фікстури переписані, бо змінилась сама механіка, а не її налаштування.
// Наказ власника: показ більше не стрибає по тижнях. Кроків немає, є вісь днів,
// і перевіряти тепер треба неперервність, а не порядок кадрів.
const show = buildPlay();
ok('показ покриває весь корпус днями', show.days >= 21, `${show.days} днів`);
ok('темп рівний і заданий один раз', show.dayMs > 0, `${show.dayMs} мс на добу`);
ok('назва без числа: корпус росте, а ролік ні', show.label === 'PLAY');

const frames = Array.from({ length: show.days }, (_, i) => show.frameAt(i));
ok('кожен день має дату', frames.every((f) => /^\d{2}\.\d{2}\.\d{4}$/.test(f.dateLabel)));
ok('дати йдуть вперед і без пропусків',
  frames.every((f, i) => i === 0 || Date.parse(f.date) - Date.parse(frames[i - 1].date) === 86400000));
// Тижні під панелями теж мусять іти вперед: показ це рух поля в часі.
const seenWeeks = [...new Set(frames.map((f) => f.weekId))];
eq('тижні йдуть хронологічно', seenWeeks, [...seenWeeks].sort());
ok('жоден кадр не без підпису', frames.every((f) => f.caption && f.caption.length > 3));
ok('жоден підпис не містить сирого id', !frames.some((f) => /\b[a-z]+_[a-z0-9_]+\b/.test(f.caption)));
ok('довгих тире в підписах немає', !frames.some((f) => /[—–]/.test(f.caption)));

// Головне, заради чого все переписано: поле мусить РУХАТИСЬ між кадрами, а не
// стояти три тижні і смикнутись двічі. Беремо тему, яка є в усіх зрізах.
const common = frames[0].field.stars
  .map((s) => s.id)
  .filter((id) => frames.every((f) => f.field.stars.some((s) => s.id === id)));
ok('є тема, наскрізна для всього корпусу', common.length > 0, common.join(','));

// Рахуємо рух ПОЛЯ, а не однієї теми: конкретна тема цілком може простояти
// тиждень на місці, якщо в сусідніх зрізах у неї той самий тон. Полем це не є,
// і саме тому перша редакція цієї перевірки падала на живих даних.
const snap = (f) => f.field.stars
  .map((s) => `${s.id}:${(s.toneScore ?? 0).toFixed(4)}:${(s.salience ?? 0).toFixed(4)}`)
  .sort()
  .join('|');
const movingDays = frames.filter((f, i) => i > 0 && snap(f) !== snap(frames[i - 1])).length;
ok('поле рухається більшість днів, а не двічі за корпус',
  movingDays >= show.days / 2, `${movingDays} рухомих днів з ${show.days}`);

if (common.length) {
  const path = frames.map((f) => f.field.stars.find((s) => s.id === common[0]).toneScore);
  const jumps = path.filter((v, i) => i > 0 && Math.abs(v - path[i - 1]) > 0.25).length;
  ok('без стрибків: жоден крок не більший за чверть шкали', jumps === 0, `${jumps} стрибків`);
}
// Індекс поля теж іде плавно: він частина стану, а не підпис збоку.
//
// Поріг рахується з самих даних, а не стоїть числом. Перша редакція вимагала
// «не більше одиниці за добу» і трималась на корпусі з трьох тижнів, де індекс
// за тиждень мінявся на 2..5. У W34 -> W35 він пішов з 26 на 49: це вимір, а
// не дефект, і рівний хід по 3..4 на добу це саме лінійна інтерполяція між
// двома зрізами. Перевіряється отже те, що й обіцяє PLAY: крок за добу не
// більший за тижневу дельту, розкладену по днях (плюс одиниця на округлення).
const idx = frames.map((f) => f.index.value);
// Опора тижня це кадр, де суміш нульова: середина періоду, значення самого зрізу.
const anchors = seenWeeks.map((id) => frames.find((f) => f.fromWeek === id && f.toWeek === id));
ok('кожен тиждень має опорний кадр на осі показу', anchors.every(Boolean));
let maxDailyStep = 1;
anchors.forEach((a, i) => {
  if (i === 0 || !a || !anchors[i - 1]) return;
  const span = Math.max(1, a.dayIndex - anchors[i - 1].dayIndex);
  const delta = Math.abs(a.index.value - anchors[i - 1].index.value);
  maxDailyStep = Math.max(maxDailyStep, Math.ceil(delta / span) + 1);
});
ok('індекс іде рівно: крок за добу не більший за тижневу дельту, розкладену по днях',
  idx.every((v, i) => i === 0 || Math.abs(v - idx[i - 1]) <= maxDailyStep),
  `ліміт ${maxDailyStep}/добу; ${idx.join(',')}`);
ok('індекс не стоїть увесь показ на місці', new Set(idx).size > 1);

console.log('\n--- D4 · каскад ---');
const lever = (getActiveWeek(W).levers || []).find((l) => (l.cascade || []).length);
if (lever) {
  const m = leverModel(lever.id, W);
  ok('каскад це послідовність', m.waves.length >= 2, `${m.waves.length} хвиль`);
  eq('ланки пронумеровані по порядку', m.waves.map((w) => w.step), m.waves.map((_, i) => i));
  ok('амплітуда спадає',
    Math.abs(m.waves[0].items[0].value) >= Math.abs(m.waves[1].items[0].value));
  ok('підсумок не порожній', m.topShifts.length > 0);
} else {
  console.log('ok   каскад: важеля з cascade у цьому тижні немає, перевірку пропущено');
}

console.log('\n--- підписи акторів не налазять ---');
const LINE_H = 13;
const PAD = 9;
let overlaps = 0;
WEEKS.filter((w) => !w.hidden).forEach((wk) => {
  [1120, 940].forEach((width) => {
    const f = buildActorfield(wk.id);
    f.nodes.forEach((n) => {
      n.lines = [n.name];
      n.boxW = Math.max(n.radius * 2, n.name.length * 6.2);
      n.boxH = n.radius * 2 + 23;
    });
    layoutActorfield(f, { x: 0, y: 0, w: width, h: 560 }, { axisH: 34 });
    const half = (n) => (n.boxW ?? n.radius * 2) / 2 + PAD;
    const box = (n) => {
      const top = n.labelAbove ? n.ty - n.radius - 12 - LINE_H / 2 : n.ty + n.radius + 12 - LINE_H / 2;
      return { x: n.tx + n.labelDX, half: half(n), top, bottom: top + LINE_H };
    };
    const vis = f.nodes.filter((n) => !n.labelHidden);
    for (let i = 0; i < vis.length; i++) {
      for (let j = i + 1; j < vis.length; j++) {
        const a = box(vis[i]);
        const b = box(vis[j]);
        if (a.bottom <= b.top || b.bottom <= a.top) continue;
        if (Math.abs(b.x - a.x) >= a.half + b.half) continue;
        overlaps += 1;
      }
    }
  });
});
eq('нуль перекриттів підписів на всіх тижнях і ширинах', overlaps, 0);

console.log('\n--- H · імпортер ---');
const prev = WEEKS[WEEKS.length - 1];
eq('наступний тиждень', nextWeekId('2026-W32'), '2026-W33');
eq('перехід через рік', nextWeekId('2026-W52'), '2027-W1');
const draft = cloneWeek(prev);
ok('вердикт не переноситься', !draft.verdict.threat && !draft.verdict.opportunity);
ok('цитати не переносяться', (draft.quotes || []).length === 0);
ok('відкриті прогнози переносяться', (draft.forecasts || []).length > 0);
ok('оцінки ринків не переносяться',
  (draft.ensemble?.markets || []).every((m) => (m.bets || []).length === 0));

const contract = { schema_version: '1.4', meta: {}, weeks: WEEKS };
const due = dueForecasts(contract, draft);
ok('ворота бачать прострочені прогнози', due.length > 0, `${due.length}`);
ok('без відповідей ворота закриті', gateStatus(contract, draft, {}).open === false);
const allHit = Object.fromEntries(due.map((f) => [f.id, { verdict: 'hit' }]));
ok('з усіма відповідями ворота відкриті', gateStatus(contract, draft, allHit).open === true);
if (due.length) {
  const voidNoReason = { ...allHit, [due[0].id]: { verdict: 'void' } };
  ok('скасування без причини не відкриває ворота',
    gateStatus(contract, draft, voidNoReason).open === false);
  const voidReason = { ...allHit, [due[0].id]: { verdict: 'void', reason: 'питання втратило сенс' } };
  ok('скасування з причиною відкриває', gateStatus(contract, draft, voidReason).open === true);
}
if (due.length > 1) {
  const partial = { [due[0].id]: { verdict: 'hit' } };
  ok('часткові відповіді не відкривають', gateStatus(contract, draft, partial).open === false);
}

let j = null;
for (let i = 0; i < 3; i++) j = appendJournal(j, { week: draft.id, operator: 'тест' });
eq('журнал тільки дописується', j.entries.map((e) => e.seq), [1, 2, 3]);
ok('перший запис уцілів', j.entries[0].seq === 1);
eq('CSV: битий рядок відхиляється',
  parseMetricsCsv('metric,value\na,1\nb,абв\n').errors.length, 1);
eq('CSV: правильні значення прийнято',
  parseMetricsCsv('metric,value\na,1\nb,абв\n').values, { a: 1 });

console.log('\n--- F1 · правила Спеки F у типі ---');
const card = {
  id: 'pc_t', case_id: 'c_t', class_summary: 'тест',
  analogs: [{ historical_case_id: 'h1', likenesses: ['а'], differences: ['б'], transferability: 'med' }],
  outcome_distribution: { n: 2, buckets: [{ outcome_code: 'faded', k: 2 }] },
  break_conditions: ['якщо відповідь буде швидкою'],
  scores: { structural_similarity: 'high', transferability: 'med', base_quality: 'low', n: 2 },
  status: 'active', verified_by: 'тест', verified_date: '2026-08-16',
};
ok('коректна картка проходить', PrecedentCard.safeParse(card).success);
ok('зведений % схожості заблоковано',
  !PrecedentCard.safeParse({ ...card, similarity_pct: 87 }).success);
ok('картка без «де ламається» заблокована',
  !PrecedentCard.safeParse({ ...card, break_conditions: [] }).success);
ok('картка без підпису заблокована',
  !PrecedentCard.safeParse({ ...card, verified_by: undefined }).success);
ok('четвертий аналог заблоковано',
  !PrecedentCard.safeParse({ ...card, analogs: Array(4).fill(card.analogs[0]) }).success);
eq('seeded не входить у розподіл',
  outcomeDistribution([
    { id: 'a', class_tags: ['x'], seeded: false, outcome: { code: 'faded' } },
    { id: 'b', class_tags: ['x'], seeded: true, outcome: { code: 'faded' } },
  ], 'x').n, 1);

console.log('\n--- дефекти ревʼю: щоб не повернулись ---');

// №3 · помилки СХЕМИ мусять доходити до оператора. Раніше фільтр по draft.id
// викидав їх усі, бо шлях Zod має вигляд «тижні -> [3] -> ...» без id тижня,
// і структурно зламана чернетка проходила валідацію як чиста.
const broken = cloneWeek(prev);
broken.period.from = 'зовсім не дата';
ok('валідація ловить помилку схеми чернетки',
  validateDraft(contract, broken).some((i) => i.level === 'error'));

// №5 · void це реальний стан: ворота дозволяють скасувати прогноз з причиною,
// тому схема мусить його приймати, інакше затверджений тиждень не валідний.
ok('статус void проходить схему',
  EditorialForecast.safeParse({
    id: 'f_x', text: 'т', criterion: 'к', deadline: '2026-08-01', status: 'void',
  }).success);

// №6 · bluf_* перебивають verdict у вʼювері, тому клон, що їх переносив,
// показував торішній висновок навіть після того, як оператор написав новий.
ok('клон не переносить bluf_threat', !draft.bluf_threat);
ok('клон не переносить bluf_opportunity', !draft.bluf_opportunity);

// №4 · вердикт по прогнозу з ПОПЕРЕДНЬОГО тижня не має зникати: область
// запису мусить збігатись з областю воріт.
const older = due.find((f) => !(draft.forecasts || []).some((x) => x.id === f.id));
if (older) {
  const applied = applyVerdicts(draft, { [older.id]: { verdict: 'miss' } }, due);
  ok('вердикт по прогнозу з минулого тижня зберігається',
    (applied.forecasts || []).some((f) => f.id === older.id && f.status === 'miss'));
} else {
  console.log('ok   усі прострочені прогнози вже в чернетці, перевірку пропущено');
}

console.log('\n--- F3 · прецеденти в продукті ---');

// Адреса режиму це стан: кадр порівняння мусить пересилатись так само, як і
// будь-який інший, і при цьому не втрачати тиждень.
const ph = parseHash('#w32/case/case_225_425/precedents');
ok('адреса режиму розбирається', ph.precedents === 'case_225_425');
ok('тиждень з адреси режиму не губиться', ph.weekSlug === 'w32');
ok('адреса режиму збирається назад',
  buildHash({ weekId: '2026-W32', precedents: 'case_225_425' })
    === '#w32/case/case_225_425/precedents');

const lastWeek = WEEKS[WEEKS.length - 1].id;
const cards = precedentsOf(lastWeek);
ok('картки тижня читаються селектором', Array.isArray(cards));

for (const c of cards) {
  // Правило 3 Спеки F: жодного відсотка схожості. Судження словами, не числом,
  // бо число тут створює точність, якої в порівнянні епох не існує.
  ok(`картка ${c.id} без відсотка схожості`, c.similarity_pct === undefined);
  ok(`картка ${c.id} називає, де аналогія ламається`, (c.break_conditions || []).length > 0);
  ok(`картка ${c.id} називає маркери спостереження`, (c.watch_signals || []).length > 0);
  // Правило 4: не більше трьох аналогів. Четвертий уже не порівняння, а список.
  ok(`картка ${c.id} має не більше трьох аналогів`, (c.analogs || []).length <= 3);
  ok(`картка ${c.id} проходить схему`,
    PrecedentCard.safeParse({ ...c, verified_date: c.verified_date || '2026-01-01' }).success);
  // Правило 11: непідписана картка мусить сама про це заявляти. Мовчазна
  // непідписана картка це і є видача чернетки за перевірене.
  if (c.signature === 'pending') {
    ok(`картка ${c.id} не вдає підписану`, /очікує/.test(c.verified_by || ''));
  }
  // Картка без кейса це картка нізвідки: вхід у режим був би недосяжним.
  ok(`картка ${c.id} прив'язана до кейса тижня`,
    (getActiveWeek(lastWeek).cases || []).some((x) => x.id === c.case_id));
  ok(`картка ${c.id} знаходиться за кейсом`, precedentFor(c.case_id, lastWeek)?.id === c.id);
}

// Сигнал-рядок показується темі, на якій висить кейс з карткою, і мовчить там,
// де карток немає: «прецеденти: 0» на кожній темі було б шумом.
if (cards.length) {
  const host = (getActiveWeek(lastWeek).cases || []).find((x) => x.id === cards[0].case_id);
  const sig = precedentSignal(host.host_topic, lastWeek);
  ok('сигнал-рядок знаходить картку теми', sig?.caseId === cards[0].case_id);
  ok('сигнал-рядок називає число аналогів', sig.n === (cards[0].analogs || []).length);
  ok('сигнал-рядок не ховає очікування підпису', sig.pending === (cards[0].signature === 'pending'));
}
ok('тема без кейса з карткою сигналу не показує',
  precedentSignal('t_nema_takoyi_temy', lastWeek) === null);

console.log('\n--- Глибинний шар · три лінзи (спека 0.3) ---');

// Правила спеки перевіряються НЕГАТИВНО: правило, яке нікому не заважає,
// порушать при першій зручній нагоді. Кожен випадок нижче це розділ спеки,
// який мусить впасти сам, без домовленості з розмітником.
const baseMarkup = {
  id: 'dl_probe', case_id: 'case_lviv_tck', week: '2026-W32',
  plot: { primary: { id: 'betrayal_by_own' } },
  roles: { items: [{ role_id: 'victim', who: 'родина загиблого' }] },
  psychotypes: { items: [{ id: 'aggressive_protest' }, { id: 'rational_sceptic' }] },
  how_to_speak: [{ text: 'визнати біль і назвати канал дії' }],
  what_to_avoid: ['менторство'],
  status: 'draft', marked_by: 'проба', marked_date: '2026-08-17',
};
const depthIssues = (patch) => validateDepthMarkups(
  [{ ...baseMarkup, ...patch }], lenses,
  { cases: [{ id: 'case_lviv_tck' }], actors: [] },
);
const depthErrors = (patch) => depthIssues(patch).filter((i) => i.level === 'error');
const CUT = { cut: true, reason: 'реакції поля немає' };

ok('коректна розмітка проходить', depthErrors({}).length === 0);
ok('сюжет поза довідником не проходить',
  depthErrors({ plot: { primary: { id: 'nemaye' } } }).length > 0);
ok('роль поза довідником не проходить',
  depthErrors({ roles: { items: [{ role_id: 'nemaye', who: 'хтось' }] } }).length > 0);
ok('кейс поза реєстром не проходить', depthErrors({ case_id: 'case_nemaye' }).length > 0);

// Розділ 3 і не-ціль 5: лінзи читаються з поля, тому кожна може бути зрізана,
// але тільки явно і з причиною. Пілот W32 показав, що обовʼязковий сюжет
// змушує прочитати його з тексту документа, коли поле мовчить.
ok('порожня лінза без зрізання не проходить', depthErrors({ roles: { items: [] } }).length > 0);
ok('зрізання без причини не проходить', depthErrors({ roles: { cut: true } }).length > 0);
ok('зрізана і заповнена одночасно не проходить',
  depthErrors({ roles: { cut: true, reason: 'бо', items: [{ role_id: 'victim', who: 'хтось' }] } }).length > 0);
ok('зрізана лінза з причиною проходить', depthErrors({ roles: CUT }).length === 0);
ok('сюжет теж можна зрізати',
  depthErrors({ plot: CUT, how_to_speak: [], what_to_avoid: [] }).length === 0);

// Розділ 4: конкуренція сюжетів це діагностичний сигнал, а не помилка розмітки.
ok('пара primary + secondary проходить',
  depthErrors({ plot: { primary: { id: 'sacrifice' }, secondary: { id: 'betrayal_by_own' } } }).length === 0);
ok('secondary без primary не проходить',
  depthErrors({ plot: { secondary: { id: 'betrayal_by_own' } } }).length > 0);
ok('secondary дублює primary і не проходить',
  depthErrors({ plot: { primary: { id: 'sacrifice' }, secondary: { id: 'sacrifice' } } }).length > 0);

// Не-ціль 2: психотип це кластер реакції, тому прикріпити його до особи нікуди.
ok('не-ціль 2 · особа в психотипі заблокована схемою',
  depthErrors({ psychotypes: { items: [{ id: 'aggressive_protest', person: 'Іваненко' },
    { id: 'rational_sceptic' }] } }).length > 0);
// Розділ 4: 2-3 кластери. Один це та сама плоска тональність.
ok('один психотип не проходить',
  depthErrors({ psychotypes: { items: [{ id: 'aggressive_protest' }] } }).length > 0);
ok('четвертий психотип не проходить',
  depthErrors({ psychotypes: { items: [{ id: 'aggressive_protest' }, { id: 'rational_sceptic' },
    { id: 'loyal_trusting' }, { id: 'exhausted_apathetic' }] } }).length > 0);
ok('частка без позначки методу не проходить',
  depthErrors({ psychotypes: { items: [{ id: 'aggressive_protest', share: 0.6 },
    { id: 'rational_sceptic', share: 0.4, method: 'expert' }] } }).length > 0);
ok('частки з методом проходять',
  depthErrors({ psychotypes: { items: [{ id: 'aggressive_protest', share: 0.6, method: 'expert' },
    { id: 'rational_sceptic', share: 0.4, method: 'expert' }] } }).length === 0);
ok('частки понад 100% не проходять',
  depthErrors({ psychotypes: { items: [{ id: 'aggressive_protest', share: 0.7, method: 'expert' },
    { id: 'rational_sceptic', share: 0.5, method: 'expert' }] } }).length > 0);

// P0: рекомендація потрібна там, де сюжет не зрізаний. Де поле промовчало,
// рекомендувати нема до чого.
ok('незрізаний сюжет без рекомендації не проходить', depthErrors({ how_to_speak: [] }).length > 0);
ok('зрізаний сюжет без рекомендації проходить',
  depthErrors({ plot: CUT, how_to_speak: [], what_to_avoid: [] }).length === 0);
ok('третя рекомендація не проходить',
  depthErrors({ how_to_speak: [{ text: 'а' }, { text: 'б' }, { text: 'в' }] }).length > 0);

// Розділ 9: статус це і є призначення розмітки, одним полем.
ok('валідована розмітка без імені не проходить',
  depthErrors({ status: 'validated' }).length > 0);
ok('валідована розмітка з іменем і датою проходить',
  depthErrors({ status: 'validated', validated_by: 'Рома', validated_date: '2026-08-18' }).length === 0);
ok('ілюстрація без питання до зустрічі не проходить',
  depthErrors({ status: 'draft_for_alignment' }).length > 0);
ok('ілюстрація з питанням проходить',
  depthErrors({ status: 'draft_for_alignment', alignment_note: 'чи так зчитана роль?' }).length === 0);

// Розділ 8: ліміти міряються на СПРАВЖНЬОМУ рендері звіту, а не логічно.
const full = {
  ...baseMarkup,
  roles: { items: [{ role_id: 'victim', who: 'родина загиблого' }, { role_id: 'system', who: 'ТЦК' }] },
  psychotypes: { items: [{ id: 'aggressive_protest', share: 0.4, method: 'expert' },
    { id: 'rational_sceptic', share: 0.3, method: 'expert' },
    { id: 'exhausted_apathetic', share: 0.3, method: 'expert' }] },
  how_to_speak: [{ psychotype_id: 'aggressive_protest', text: 'визнати біль' }, { text: 'дати крок' }],
  what_to_avoid: ['менторство', 'заперечення'],
};
const fullLines = depthBlock(full, lenses, 'Інцидент з ТЦК');
eq('блок повної розмітки це рівно 8 рядків', fullLines.length, DEPTH_BLOCK_MAX_LINES);
ok('усі три лінзи стоять у блоці',
  fullLines[1].startsWith('СЮЖЕТ:') && fullLines[2].startsWith('РОЛІ:') && fullLines[3].startsWith('ПСИХОТИПИ:'));
ok('жоден рядок повного блоку не перевищує ліміт',
  fullLines.every((l) => l.length <= DEPTH_LINE_MAX_CHARS));
ok('довгий рядок не проходить валідацію',
  depthErrors({ what_to_avoid: ['я'.repeat(DEPTH_LINE_MAX_CHARS + 1)] }).length > 0);
ok('третя роль у рядку не проходить',
  depthErrors({ roles: { items: [{ role_id: 'victim', who: 'а' }, { role_id: 'shadow', who: 'б' },
    { role_id: 'system', who: 'в' }] } }).length > 0);
// Розділ 8: зрізана лінза виводиться ОДНИМ рядком, а не зникає і не займає два.
const cutLines = depthBlock({ ...full, roles: CUT }, lenses, 'К');
eq('зрізана лінза це один рядок', cutLines.length, fullLines.length);
ok('зрізана лінза називає причину', cutLines[2].includes('зрізана') && cutLines[2].includes('реакції поля немає'));
// Примітка це робочий коментар: у звіті вона роздувала рядок до трьох екранних.
ok('примітка не потрапляє в блок звіту',
  !depthBlock({ ...full, plot: { primary: { id: 'betrayal_by_own', note: 'робочий коментар' } } }, lenses, 'К')[1]
    .includes('робочий коментар'));
ok('примітка видима, коли її просять явно',
  depthBlock({ ...full, plot: { primary: { id: 'betrayal_by_own', note: 'робочий коментар' } } }, lenses, 'К', { notes: true })[1]
    .includes('робочий коментар'));

// Розділ 5: кейс із трьома зрізаними лінзами у звіт не йде, але лишається в
// реєстрі. Мовчання поля це теж результат вимірювання.
const silent = { ...baseMarkup, plot: CUT, roles: CUT, psychotypes: CUT, how_to_speak: [], what_to_avoid: [] };
ok('три зрізані лінзи це стан «у звіт не йде»', depthAllLensesCut(silent));
ok('кейс із трьома зрізаними лінзами у звіт не йде', !depthGoesToReport({ ...silent, status: 'validated' }));
ok('валідована розмітка з лінзами у звіт іде',
  depthGoesToReport({ ...full, status: 'validated', validated_by: 'Рома', validated_date: '2026-08-18' }));
ok('чернетка у звіт не йде', !depthGoesToReport(full));
ok('кейс із трьома зрізаними лінзами проходить валідацію з попередженням',
  depthErrors(silent).length === 0 && depthIssues(silent).some((i) => /усі три лінзи зрізані/.test(i.message)));

// Розділ 10 і P0: по три тригери на позицію довідника.
ok('чинний довідник має по три тригери', validateLensDictionary(lenses).length === 0);
ok('позиція з двома тригерами не проходить',
  validateLensDictionary({ plots: [{ id: 'x', triggers: ['а', 'б'] }], roles: [] }).length > 0);

// Критерій приймання 5. Перевірка навмисно попереджувальна, а не блокуюча:
// стоп-лист імен неповний за побудовою, і обіцяти тут гарантію було б брехнею.
ok('міфічне імʼя в блоці дає попередження',
  depthIssues({ plot: { primary: { id: 'sacrifice', note: 'сучасний Прометей' } } })
    .some((i) => i.level === 'warning' && /міфічн/.test(i.message)));

console.log(failed ? `\nНЕ ЗІЙШЛОСЬ: ${failed}` : '\nВСЕ ЗІЙШЛОСЬ');
if (failed) process.exit(1);

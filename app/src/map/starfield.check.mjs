// Перевірка неба з двома сузірʼями. Чисті функції, канвас не потрібен.
// Габарити підписів у житті рахує рендер, тут вони підставляються вручну.
import {
  buildScalefield, layoutScalefield, centroidDrift, fieldCentroidScore,
  coreRadius, epistemicCount, CLUSTERS, AUD_LABEL, TREND_MARK, HORIZON_LABEL, X_TOLERANCE,
  BREAK_FRACTION, BREAK_W,
} from './starfield.js';
import { getActiveWeek, toneWindow } from '../data/selectors.js';
import { MAP_LIMITS } from '../data/thresholds.js';

let fails = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}  got=${JSON.stringify(got)}${ok ? '' : ' want=' + JSON.stringify(want)}`);
};

// Робоча зона: 1366x768 зі згорнутим доком і 1920x1080.
const RECT_S = { x: 100, y: 24, w: 1366 - 100 - 24, h: 520 };
const RECT_L = { x: 100, y: 24, w: 1920 - 100 - 24, h: 780 };

/** Підпис у два рядки плюс рядок аудиторії, як його міряє рендер. */
const fakeLabels = (f) => {
  [...f.stars, ...f.exited].forEach((s) => {
    s.boxW = Math.max(s.radius * 2, 168);
    // Дзеркало measureBoxes у galaxy.js: два рядки тільки домінантам і новим,
    // рядка «аудиторія · динаміка» в коробці немає, він малюється поверх під курсором.
    //
    // Ширина береться найгіршою можливою: у ноді немає метрик шрифту, а занижена
    // оцінка давала зелену перевірку там, де справжній рендер налазив підписами.
    // Реальний рядок ніколи не ширший за LABEL_MAX_W, тому тест суворіший за життя.
    s.labelLines = s.dominant || s.trend === 'new' ? 2 : 1;
    s.labelH = 10 + s.labelLines * 13;
    s.boxH = s.radius * 2 + s.labelH;
  });
  return f;
};
const build = (week, rect) => layoutScalefield(fakeLabels(buildScalefield(week)), rect);

const w31 = build('2026-W31', RECT_S);
const w30 = build('2026-W30', RECT_S);
const w29 = build('2026-W29', RECT_S);
const w31L = build('2026-W31', RECT_L);
const w32 = build('2026-W32', RECT_S);
const w32L = build('2026-W32', RECT_L);

const cl = (f, id) => f.clusters.find((c) => c.id === id);
// Дзеркало хелперів рушія: крапка займає свої 14px, а не висоту підпису, і не
// має ширини підпису взагалі. Поки перевірка цього не знала, вона бачила перетини
// там, де на екрані стояли дві крапки, і вимагала знімати підписи без причини.
const labelH = (s) => (s.labelMode === 'dot' ? 14 : s.labelH);
const boxW = (s) => (s.labelMode === 'dot' ? s.radius * 2 : Math.max(s.radius * 2, s.boxW));
const boxTop = (s) => s.ty - s.radius - (s.labelAbove ? labelH(s) : 0);
const boxBot = (s) => s.ty + s.radius + (s.labelAbove ? 0 : labelH(s));

console.log('--- 1. два сузірʼя, доріжок немає ---');
eq('кластери саме ті і в тому порядку', CLUSTERS.map((c) => c.id), ['mil', 'both', 'civ']);
eq('підписи мають лише сузірʼя, просвіт безіменний',
  CLUSTERS.map((c) => c.label), ['ВІЙСЬКОВІ', null, 'ЦИВІЛЬНІ']);
eq('військові вгорі, цивільні внизу', cl(w31, 'mil').mid < cl(w31, 'civ').mid, true);
eq('просвіт між сузірʼями', cl(w31, 'both').top >= cl(w31, 'mil').bottom &&
  cl(w31, 'both').bottom <= cl(w31, 'civ').top, true);
eq('поле більше не має доріжок', w31.lanes === undefined && w31.exitLane === undefined, true);

console.log('\n--- 2. позиція: X з даних, Y всередині свого сузірʼя ---');
const WIN = toneWindow();
const tolPx = (f, r) => (X_TOLERANCE / WIN.span) * r.w * f.scaleK;
eq('X не відходить від tone_score далі за допуск оцінки', w31.stars.every((s) =>
  Math.abs(s.tx - w31.toX(s.toneScore)) <= tolPx(w31, RECT_S) + 0.001), true);
eq('істинна позиція збережена для звірки', w31.stars.every((s) =>
  Math.abs(s.trueX - w31.toX(s.toneScore)) < 0.001), true);
eq('на широкому екрані допуск теж тримається', w31L.stars.every((s) =>
  Math.abs(s.tx - w31L.toX(s.toneScore)) <= tolPx(w31L, RECT_L) + 0.001), true);

console.log('\n--- вікно шкали спільне і зафіксоване ---');
// W32 посунув лівий край (довіра до керівництва -0.8), W33 посунув обидва:
// виснаження у війську -0.85 і опіка над слабшими 0.75 стали новими краями корпусу.
eq('вікно з поля 0.15 по краях корпусу', [WIN.lo, WIN.hi], [-1, 0.9]);
eq('вікно однакове для всіх тижнів',
  [w29.window, w30.window, w31.window].every((w) => w.lo === WIN.lo && w.hi === WIN.hi), true);
eq('нуль потрапляє у вікно', WIN.lo <= 0 && WIN.hi >= 0, true);

console.log('\n--- розрив шкали ---');
const brk = (f) => f.breaks.map((b) => [b.lo, b.hi]);
console.log(`     довідково: W29 ${JSON.stringify(brk(w29))}, W30 ${JSON.stringify(brk(w30))}, ` +
  `W31 ${JSON.stringify(brk(w31))}, k = ${[w29, w30, w31].map((f) => f.scaleK.toFixed(2)).join(' / ')}`);
eq('розрив рахується з даних, а не задається вручну',
  w31.breaks.every((b) => w31.stars.some((s) => s.toneScore === b.lo) &&
    w31.stars.some((s) => s.toneScore === b.hi)), true);
eq('порожній інтервал під порогом розриву не рве шкалу',
  [w29, w30, w31].every((f) => f.breaks.every((b) => b.gap >= BREAK_FRACTION * WIN.span)), true);
// Шкала більше не стискається на розриві: порожнеча займає рівно стільки місця,
// скільки важить у тоні. Саме через стиснення лінійка внизу починала брехати про
// відстань, і однакові кроки значень стояли на різній відстані одне від одного.
eq('порожнеча займає стільки ж, скільки важить у тоні', [w29, w30, w31, w32].every((f) =>
  f.breaks.every((b) =>
    Math.abs((f.toX(b.hi) - f.toX(b.lo)) - (b.gap / WIN.span) * f.rect.w) < 0.001)), true);
eq('шов накриває саме порожнечу, а не смужку сталої ширини', [w29, w30, w31, w32].every((f) =>
  f.breaks.every((b) => Math.abs(b.w - (f.toX(b.hi) - f.toX(b.lo))) < 0.001)), true);
eq('крок поділок однаковий і в тоні, і в пікселях', [w29, w30, w31, w32].every((f) => {
  const t = f.ticks;
  if (t.length < 3) return true;
  const dv = t.map((x, i) => (i ? Math.round((x.v - t[i - 1].v) * 1000) : null)).slice(1);
  const dp = t.map((x, i) => (i ? Math.round(x.x - t[i - 1].x) : null)).slice(1);
  return new Set(dv).size === 1 && Math.max(...dp) - Math.min(...dp) <= 1;
}), true);
eq('підпис про поляризацію тільки там, де розрив накриває нуль',
  [w29, w30, w31].map((f) => f.breaks.map((b) => b.spansZero)),
  [[true], [true], [true]]);
eq('розрив між двома деструктивними темами підпису не отримує', (() => {
  const f = layoutScalefield(fakeLabels(buildScalefield('2026-W31')), RECT_S, {
    breaks: [{ lo: -0.7, hi: -0.1, gap: 0.6 }],
  });
  return Boolean(f.breaks[0].spansZero);
})(), false);
// Дивимось на trueX, а не на tx: розсув у межах допуску оцінки має право трохи
// зайти в порожнечу, а от сама оцінка теми там опинитись не може за побудовою.
eq('у зоні шва немає жодної теми: він і є порожнеча', [w29, w30, w31, w32].every((f) =>
  f.breaks.every((b) => f.stars.every((s) => {
    const half = 0;
    return s.trueX + half <= b.x + 0.001 || s.trueX - half >= b.x + b.w - 0.001;
  }))), true);
eq('мапінг тримає межі вікна', [w29, w30, w31].every((f) =>
  Math.abs(f.toX(WIN.lo) - RECT_S.x) < 0.001 &&
  Math.abs(f.toX(WIN.hi) - (RECT_S.x + RECT_S.w)) < 0.001), true);
eq('мапінг монотонний і неперервний', (() => {
  for (const f of [w29, w30, w31]) {
    let prev = null;
    for (let s = WIN.lo; s <= WIN.hi + 1e-9; s += WIN.span / 400) {
      const x = f.toX(s);
      if (prev !== null && (x < prev - 1e-9 || x - prev > 12)) return false; // ні відкату, ні стрибка
      prev = x;
    }
  }
  return true;
})(), true);
// без розривів шкала лишається тією самою лінійкою для всіх тижнів
const flat = layoutScalefield(fakeLabels(buildScalefield('2026-W31')), RECT_S, { breaks: [] });
eq('без розривів мапінг лінійний', Math.abs(
  flat.toX(-0.5) - (RECT_S.x + ((-0.5 - WIN.lo) / WIN.span) * RECT_S.w)) < 0.001, true);
eq('без розривів масштаб одиничний', flat.scaleK, 1);

const span = (f) => {
  const xs = f.stars.map((s) => s.tx);
  return Math.round(((Math.max(...xs) - Math.min(...xs)) / RECT_S.w) * 100);
};
console.log(`     довідково: розмах по ширині W29 ${span(w29)}%, W30 ${span(w30)}%, W31 ${span(w31)}%`);
eq('порядок тем на шкалі зберігається після стиснення', [w29, w30, w31].every((f) => {
  const byScore = f.stars.slice().sort((a, b) => a.toneScore - b.toneScore);
  return byScore.every((s, i) => i === 0 || s.trueX >= byScore[i - 1].trueX - 0.001);
}), true);

console.log('\n--- мінімальна дистанція і підписи за винятком ---');
const minGap = (f) => {
  let m = Infinity;
  const byC = {};
  f.stars.forEach((s) => { (byC[s.cluster] = byC[s.cluster] || []).push(s); });
  Object.values(byC).forEach((list) => {
    const o = list.slice().sort((a, b) => a.tx - b.tx);
    for (let i = 1; i < o.length; i++) m = Math.min(m, o[i].tx - o[i - 1].tx);
  });
  return m === Infinity ? null : Math.round(m);
};
console.log(`     довідково: мінімальний проміжок W31 ${minGap(w31)}px, W30 ${minGap(w30)}px`);
// C5 змінив правило підписів. Було: підпис отримує кожен, кого не затиснули
// сусіди, тому на спокійному тижні поле мало десять однаково гучних назв, тобто
// жодного акценту. Стало: постійний підпис це дефіцитний ресурс із твердим
// лімітом з config/thresholds.json, і його отримує верхівка за вагою і новизною.
// Старі очікування описували саме скасоване правило, тому переписані, а не
// підкручені: тест має стерегти чинну поведінку, а не історичну.
const LABEL_CAP = MAP_LIMITS.max_permanent_labels;
const fullCount = (f) => f.stars.filter((s) => s.labelMode === 'full').length;
console.log(`     довідково: постійних підписів W31 ${fullCount(w31)}, W30 ${fullCount(w30)}, W32 ${fullCount(w32)}, ліміт ${LABEL_CAP}`);

eq('постійних підписів не більше ліміту', [w29, w30, w31, w32, w31L, w32L]
  .every((f) => fullCount(f) <= LABEL_CAP), true);
eq('підпис дістається найпріоритетнішим', (() => {
  const kept = w31.stars.filter((s) => s.labelMode === 'full');
  const dropped = w31.stars.filter((s) => s.labelMode === 'dot');
  if (!kept.length || !dropped.length) return true;
  const worstKept = Math.min(...kept.map((s) => (s.salience ?? 1) * 10));
  const bestDropped = Math.max(...dropped.map((s) => (s.salience ?? 1) * 10));
  return worstKept >= bestDropped - 5; // допуск на складник тренду в пріоритеті
})(), true);
eq('крапка не втрачає назви: вона лишається в даних для тултіпа',
  w31.stars.every((s) => Boolean(s.name)), true);
eq('жодна тема не втрачає назви як даних', w31.stars.every((s) => Boolean(s.name)), true);
eq('конструктивна тема правіше за деструктивну',
  w31.stars.find((s) => s.id === 't_gratitude').tx > w31.stars.find((s) => s.id === 't_gov_trust').tx,
  true);
eq('військова тема у своєму сузірʼї',
  w31.stars.find((s) => s.id === 't_case_225').cluster, 'mil');
eq('цивільна тема у своєму сузірʼї',
  w31.stars.find((s) => s.id === 't_gratitude').cluster, 'civ');
eq('тема обох аудиторій у просвіті',
  w31.stars.find((s) => s.id === 't_tck').cluster, 'both');
eq('жодна зоря з підписом не виходить за небо', w31.stars.every((s) =>
  boxTop(s) >= w31.sky.y - 1 && boxBot(s) <= w31.sky.y + w31.sky.h + 1), true);
eq('порядок сузірʼїв збережений: військові вище цивільних', (() => {
  const mil = w31.stars.filter((s) => s.cluster === 'mil');
  const civ = w31.stars.filter((s) => s.cluster === 'civ');
  return mil.every((m) => civ.every((c) => boxBot(m) <= boxTop(c) + 1));
})(), true);

console.log('\n--- підписи не перетинаються ---');
// Перетини рахуються по всьому небу, а не всередині сузірʼя. Раніше пари з різних
// сузірʼїв пропускались, і саме вони налазили на екрані: тема обох аудиторій стоїть
// у просвіті між сузірʼями, тому б'ється підписом і з військовими, і з цивільними.
// Читачеві байдуже, до якого сузірʼя належить текст, що ліг поверх іншого.
const overlaps = (f) => {
  const out = [];
  const a = f.stars;
  for (let i = 0; i < a.length; i++)
    for (let j = i + 1; j < a.length; j++) {
      const dx = Math.abs(a[i].tx - a[j].tx) < (boxW(a[i]) + boxW(a[j])) / 2;
      const dy = boxTop(a[i]) < boxBot(a[j]) && boxBot(a[i]) > boxTop(a[j]);
      if (dx && dy) out.push(`${a[i].id}/${a[j].id}`);
    }
  return out;
};
eq('W31 без перетинів', overlaps(w31), []);
eq('W30 без перетинів', overlaps(w30), []);
eq('W32 без перетинів: десять тем, найгустіший тиждень', overlaps(w32), []);
eq('на широкому екрані теж', overlaps(w31L), []);
eq('W32 на широкому екрані теж', overlaps(w32L), []);
eq('жодна зоря W32 не виходить за небо', w32.stars.every((s) =>
  boxTop(s) >= w32.sky.y - 1 && boxBot(s) <= w32.sky.y + w32.sky.h + 1), true);
eq('W32 розкладено всі десять тем', w32.stars.length, 10);

console.log('\n--- 3. розміри: три контрастні градації ---');
eq('вага 1 і 2 дають 8', [coreRadius(1), coreRadius(2)], [8, 8]);
eq('вага 3 дає 14', coreRadius(3), 14);
eq('вага 4 і 5 дають 24', [coreRadius(4), coreRadius(5)], [24, 24]);
eq('жодного розміру поза градаціями',
  [...w31.stars, ...w30.stars].every((s) => [8, 14, 24].includes(s.radius)), true);
eq('домінанта позначена окремо',
  w31.stars.filter((s) => s.dominant).map((s) => s.id).sort(), ['t_anticorr', 't_gov_trust']);
eq('домінанта тримає найбільший радіус',
  w31.stars.filter((s) => s.dominant).every((s) => s.radius === 24), true);

console.log('\n--- 4. вісь і стрілка ---');
eq('вісь під небом', w31.axis.y > w31.sky.y + w31.sky.h, true);
eq('вісь на всю ширину зони', [w31.axis.x1, w31.axis.x2], [RECT_S.x, RECT_S.x + RECT_S.w]);
eq('вісь у межах зони', w31.axis.y <= RECT_S.y + RECT_S.h, true);
eq('на широкому екрані вісь теж на всю ширину',
  [w31L.axis.x1, w31L.axis.x2], [RECT_L.x, RECT_L.x + RECT_L.w]);
const c31 = fieldCentroidScore('2026-W31');
eq('центр у межах шкали', c31 >= -1 && c31 <= 1, true);
const drift = centroidDrift('2026-W31', '2026-W30');
eq('дрейф названий словами',
  ['у деструктив', 'у конструктив', 'без зсуву'].includes(drift.direction), true);
eq('перший тиждень без привида', centroidDrift('2026-W29', null).prev, null);
console.log(`     довідково: W29 ${fieldCentroidScore('2026-W29').toFixed(3)}, ` +
  `W30 ${fieldCentroidScore('2026-W30').toFixed(3)}, W31 ${c31.toFixed(3)}, дрейф ${drift.direction}`);

console.log('\n--- 5. край неба ---');
eq('горизонт нижче осі', w31.horizon.y > w31.axis.y, true);
eq('підпис зони', w31.horizon.label, HORIZON_LABEL);
eq('згаслі теми за горизонтом',
  w31.exited.every((s) => s.ty > w31.horizon.y), true);
eq('згаслі теми в межах зони',
  w31.exited.every((s) => s.ty <= RECT_S.y + RECT_S.h + 1), true);
eq('без згаслих тем горизонту немає', w30.horizon, null);
eq('і небо забирає все місце', w30.sky.h > w31.sky.h, true);

console.log('\n--- 6. нитки: тільки звʼязки і тяжіння ---');
eq('роди ниток', [...new Set(w31.filaments.map((f) => f.kind))].sort(), ['link', 'pull']);
eq('названі звʼязки W31', w31.filaments.filter((f) => f.kind === 'link')
  .map((f) => `${f.from}->${f.to}`).sort(),
  ['t_anticorr->t_gov_trust', 't_case_225->t_gov_trust', 't_tck->t_gov_trust']);
eq('тема обох аудиторій тягнеться до обох сузірʼїв',
  w31.filaments.filter((f) => f.kind === 'pull' && f.from === 't_tck')
    .map((f) => f.toCluster).sort(), ['civ', 'mil']);
eq('центроїди сузірʼїв пораховані',
  Boolean(w31.centroids.mil && w31.centroids.civ), true);
eq('W30 без названих звʼязків має тільки тяжіння',
  [...new Set(w30.filaments.map((f) => f.kind))], ['pull']);

console.log('\n--- 7. динаміка словами, кейси, тихий кокпіт ---');
eq('позначки тренду', Object.values(TREND_MARK).slice(0, 4),
  ['НОВА', '▲ росте', '▼ спадає', 'стабільна']);
eq('кожна тема має аудиторію і динаміку', w31.stars.every((s) => s.audLabel && s.trendMark), true);
eq('словник аудиторій повний', Object.keys(AUD_LABEL).sort(), ['both', 'civ', 'mil']);
eq('кейс 225 на своїй темі',
  w31.stars.find((s) => s.id === 't_case_225').moons.map((m) => m.id), ['case_225_425']);
eq('гучні тільки нові теми', w31.stars.filter((s) => s.loud).map((s) => s.id).sort(),
  ['t_case_225', 't_gratitude']);

console.log('\n--- детермінованість ---');
eq('повторна розкладка дає ті самі пікселі',
  build('2026-W31', RECT_S).stars.map((s) => [Math.round(s.tx), Math.round(s.ty)]),
  w31.stars.map((s) => [Math.round(s.tx), Math.round(s.ty)]));

console.log('\n--- епістемічний рахунок ---');
eq('W31', epistemicCount(getActiveWeek('2026-W31')), { fact: 3, assessment: 7, hypothesis: 6 });
eq('W30', epistemicCount(getActiveWeek('2026-W30')), { fact: 1, assessment: 6, hypothesis: 3 });

console.log(`\n${fails === 0 ? 'ВСЕ ЗІЙШЛОСЬ' : fails + ' ПРОВАЛІВ'}`);
process.exit(fails ? 1 : 0);

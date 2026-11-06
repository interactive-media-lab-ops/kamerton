// КАМЕРТОН · шар даних.
// Єдине місце, де з контракту тижня добуваються числа, дельти, серії, кейси і прогнози.
// Правило: дельти рахуються з масиву weeks (порівняння з попереднім тижнем).
// Поле delta з контракту використовується тільки як fallback, коли попереднє значення null.
// Екрани не лізуть у сирий JSON: вони працюють тільки через ці функції.

// Контракт приходить у продукт СПРОЄКТОВАНИМ (scripts/build-contract.mjs):
// без полів, яких екран не читає, і з дедуплікованими картками прецедентів.
// Сирці живуть у raw/weeks.json і в бандл не їдуть.
import contractProjection from './derived/contract.json';
import derivedEnsemble from './derived/ensemble.json';
import { plural } from '../util/plural.js';
import { FIELD } from './thresholds.js';
import topicRegistry from './registry/topics.json';
import actorRegistry from './registry/actors.json';
import caseRegistry from './registry/cases.json';
// Глибинний шар приходить у продукт СПРОЕКТОВАНИМ (scripts/build-depth.mjs):
// примітки аналітика і питання до зустрічі лишаються в корпусі, бо у звіт вони
// не йдуть, а бандл уже на межі 700 КБ.
import depthProjection from './derived/depth.json';
import { depthAllLensesCut } from './depth-block.js';
// Шар ГРАВІТОН теж приходить спроектованим (scripts/build-graviton.mjs):
// у проєкції лише розраховані величини з методом походження, а tone/trend/aud
// зшиваються тут з контракту, бо одне число має одне джерело.
import gravitonProjection from './derived/graviton.json';

// Реєстри стабільних id. Тижні лише посилаються на id, назви живуть тут:
// раніше тема оголошувалась наново в кожному тижні, і назва тихо дрейфувала
// під тим самим id, а один сюжет узагалі розʼїхався на два id.
export const TOPIC_REG = new Map(topicRegistry.map((t) => [t.id, t]));

/**
 * G7: мапа злиттів. Той самий сюжет вівся під двома id (t_tech у W30,
 * t_tech_update у W32), а topicTrack зшиває серії лише за однаковим id, тому
 * історія теми обривалась посеред корпусу. Alias у реєстрі повертає її цілою.
 *
 * Канонічний id один, псевдоніми ведуть на нього. Сирі дані тижнів при цьому
 * не переписуються: злиття живе в реєстрі і застосовується на читанні.
 */
const TOPIC_ALIAS = new Map();
topicRegistry.forEach((t) => {
  (t.aliases || []).forEach((a) => TOPIC_ALIAS.set(a, t.id));
  if (t.merged_into) TOPIC_ALIAS.set(t.id, t.merged_into);
});

/** Псевдонім теми в канонічний id. Невідомий id повертається без змін. */
export function canonicalTopicId(id) {
  return TOPIC_ALIAS.get(id) || id;
}

/** Усі id, під якими сюжет зустрічається в корпусі, включно з канонічним. */
export function topicIdFamily(id) {
  const canon = canonicalTopicId(id);
  const fam = new Set([canon]);
  (TOPIC_REG.get(canon)?.aliases || []).forEach((a) => fam.add(a));
  return fam;
}

/** Примітка про злиття для досьє. null, якщо тема не зливалась. */
export function topicMergeNote(id) {
  return TOPIC_REG.get(canonicalTopicId(id))?.merge_note || null;
}
export const ACTOR_REG = new Map(actorRegistry.map((a) => [a.id, a]));
export const CASE_REG = new Map(caseRegistry.map((c) => [c.id, c]));

/**
 * Сирий контракт недоторканий: агрегати КОМПАСа і накопичена історія
 * консенсусу приходять окремим похідним файлом і зшиваються тут, у памʼяті.
 * Раніше збірка писала їх назад у weeks.json, і сирці тихо пухли фальшивими
 * точками історії на кожен календарний день збірки.
 */
function withDerived(base, derived) {
  const weeks = derived?.weeks || {};
  if (!Object.keys(weeks).length) return base;
  return {
    ...base,
    weeks: base.weeks.map((w) => {
      const d = weeks[w.id];
      if (!d || !w.ensemble) return w;
      return {
        ...w,
        ensemble: {
          ...w.ensemble,
          markets: (w.ensemble.markets || []).map((m) => {
            const dm = d.markets?.[m.id];
            return dm ? { ...m, aggregate: dm.aggregate, history: dm.history } : m;
          }),
          registry: { ...(w.ensemble.registry || {}), quarter_score: d.quarter_score },
        },
      };
    }),
  };
}

/**
 * Зворотний хід проєкції: картки прецедентів у тижні лежать ключами в таблицю
 * precedent_cards, бо імпортер клонує їх з тижня в тиждень без змін. Тут вони
 * збираються назад у масиви, і для решти коду тиждень виглядає як у сирцях.
 * Невідомий ключ це дефект збірки, а не привід мовчки показати порожнє.
 */
function hydrateContract(proj) {
  const table = proj.precedent_cards || {};
  const { precedent_cards, projection, ...base } = proj;
  return {
    ...base,
    weeks: (base.weeks || []).map((w) => {
      if (!Array.isArray(w.precedents)) return w;
      return {
        ...w,
        precedents: w.precedents.map((ref) => {
          if (typeof ref !== 'string') return ref;
          const card = table[ref];
          if (!card) throw new Error(`контракт: картка прецедента ${ref} відсутня в проєкції (${w.id})`);
          return card;
        }),
      };
    }),
  };
}

const rawContract = hydrateContract(contractProjection);
const contract = withDerived(rawContract, derivedEnsemble);

export const META = contract.meta;
/** Версія схеми контракту. Верхній рівень, з відкотом на meta для старих зрізів. */
export const SCHEMA_VERSION = contract.schema_version ?? contract.meta?.version ?? '';
export const ACTORS = contract.actors_registry;
export const WEEKS = contract.weeks;

/** Критична межа індексу міцності з доктрини контракту. */
export const STRENGTH_THRESHOLD = META?.doctrine?.critical_strength_threshold ?? 0.35;

/* ------------------------------------------------------------------ */
/* Дрібні утиліти                                                      */
/* ------------------------------------------------------------------ */

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Округлення до знаків після коми без плаваючого сміття: round(3.7000000000000028, 1) === 3.7 */
export function round(value, digits = 1) {
  if (value === null || value === undefined) return null;
  const k = 10 ** digits;
  return Math.round(value * k) / k;
}

/** "2026-W31" -> {year: 2026, week: 31}. Порядковий номер для арифметики віку кейсів. */
export function parseWeekId(id) {
  const m = /^(\d{4})-W(\d{1,2})$/.exec(String(id || ''));
  if (!m) return null;
  return { year: Number(m[1]), week: Number(m[2]) };
}

/** Абсолютний номер тижня для віднімання: ordinal("2026-W31") - ordinal("2026-W28") === 3 */
export function weekOrdinal(id) {
  const p = parseWeekId(id);
  return p ? p.year * 53 + p.week : null;
}

/** "2026-W31" -> "W31" для компактної шапки. */
export function shortWeek(id) {
  const p = parseWeekId(id);
  return p ? `W${p.week}` : String(id || '');
}

/** {from:"2026-07-25", to:"2026-07-31"} -> "25.07 - 31.07" */
export function formatPeriod(period) {
  if (!period) return '';
  const d = (iso) => {
    const parts = String(iso).split('-');
    return parts.length === 3 ? `${parts[2]}.${parts[1]}` : iso;
  };
  return `${d(period.from)} - ${d(period.to)}`;
}

/** "2026-08-06" -> "06.08.2026" */
export function formatDate(iso) {
  const p = String(iso || '').split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(iso || '');
}

/* ------------------------------------------------------------------ */
/* Тижні                                                               */
/* ------------------------------------------------------------------ */

/**
 * Активний тиждень: за замовчуванням останній у масиві.
 * getActiveWeek() -> тиждень 2026-W31
 * getActiveWeek('2026-W30') -> тиждень 2026-W30
 */
export function getActiveWeek(weekId) {
  if (!WEEKS.length) return null;
  if (!weekId) return WEEKS[WEEKS.length - 1];
  return WEEKS.find((w) => w.id === weekId) || WEEKS[WEEKS.length - 1];
}

export function weekIndex(weekId) {
  const i = WEEKS.findIndex((w) => w.id === weekId);
  return i === -1 ? WEEKS.length - 1 : i;
}

/** Усі тижні до активного включно. Хроніка не показує майбутнє. */
export function weeksUpTo(weekId) {
  return WEEKS.slice(0, weekIndex(weekId) + 1);
}

/**
 * Вікно шкали тону: спільне для всього корпусу і зафіксоване.
 *
 * Береться найменший і найбільший tone_score по ВСІХ тижнях разом, плюс поле 0.15
 * з кожного боку. Вікно спільне саме тому, що інакше перемикання тижня міняло б
 * масштаб, і дрейф центру читався б як рух там, де змінилась лише лінійка.
 *
 * toneWindow() -> {lo: -0.95, hi: 0.8, span: 1.75}
 */
export function toneWindow() {
  const scores = [];
  WEEKS.forEach((w) =>
    (w.topics || []).forEach((t) => {
      if (typeof t.tone_score === 'number') scores.push(t.tone_score);
    })
  );
  if (!scores.length) return { lo: -1, hi: 1, span: 2 };
  const lo = round(Math.min(...scores) - 0.15, 3);
  const hi = round(Math.max(...scores) + 0.15, 3);
  return { lo, hi, span: hi - lo };
}

/* ------------------------------------------------------------------ */
/* Камертон-індекс                                                     */
/* ------------------------------------------------------------------ */

/** Вище цього зваженого відхилення поле називається поляризованим. Поріг у config/thresholds.json. */
export const POLARIZED_SIGMA = FIELD.polarized_sigma;

/**
 * Позиція теми на шкалі 0..100: 0 це повний деструктив, 100 повний конструктив,
 * 50 нейтраль.
 *
 * Шкала тут теоретична (-1..+1), а не вікно корпусу, яким намальована вісь на
 * карті. Це навмисно: вікно рухається щоразу, коли в корпус додається тиждень
 * з новим краєм тону, і минулі індекси мовчки переїжджали б разом з ним.
 * Індекс має порівнюватись з собою тиждень до тижня, тому його нуль і сотня
 * прибиті до абсолютних полюсів, а не до країв наявних даних.
 */
export const tonePosition = (score) => ((num(score) ?? 0) + 1) * 50;

/**
 * kamertonIndex: індекс тону поля, 0..100.
 *
 * Зважене середнє позицій активних тем. Вага це salience, тобто та сама величина,
 * що задає розмір вузла на карті: те, що більше на екрані, більше важить і в числі.
 * Теми, що вийшли з поля, не рахуються: індекс міряє тиждень, а не памʼять про нього.
 *
 * kamertonIndex('2026-W32') -> {value: 33, delta: -4, sigma: 27.9, polarized: true, rows: [...]}
 */
export function kamertonIndex(weekId) {
  const w = getActiveWeek(weekId);
  const rows = (w?.topics || [])
    .filter((t) => num(t.tone_score) !== null)
    .map((t) => ({
      id: t.id,
      name: t.name,
      aud: t.aud,
      tone: num(t.tone_score),
      p: round(tonePosition(t.tone_score), 1),
      w: num(t.salience) ?? 1,
    }));

  const sum = rows.reduce((a, r) => a + r.w, 0);
  if (!rows.length || sum <= 0) {
    return { value: null, delta: null, sigma: null, polarized: false, rows, weightSum: 0 };
  }

  const mean = rows.reduce((a, r) => a + r.w * r.p, 0) / sum;
  const variance = rows.reduce((a, r) => a + r.w * (r.p - mean) ** 2, 0) / sum;
  const sigma = Math.sqrt(variance);

  const i = weekIndex(w.id);
  const prev = i > 0 ? WEEKS[i - 1] : null;
  const prevValue = prev ? kamertonIndexValue(prev) : null;
  const value = Math.round(mean);

  return {
    value,
    delta: prevValue === null ? null : value - prevValue,
    sigma: round(sigma, 1),
    polarized: sigma > POLARIZED_SIGMA,
    rows: rows.sort((a, b) => b.w - a.w || a.p - b.p),
    weightSum: sum,
    mean: round(mean, 2),
  };
}

/** Значення індексу без дельти: щоб не рахувати попередній тиждень рекурсивно. */
function kamertonIndexValue(week) {
  const rows = (week?.topics || []).filter((t) => num(t.tone_score) !== null);
  const sum = rows.reduce((a, t) => a + (num(t.salience) ?? 1), 0);
  if (!rows.length || sum <= 0) return null;
  return Math.round(
    rows.reduce((a, t) => a + (num(t.salience) ?? 1) * tonePosition(t.tone_score), 0) / sum
  );
}

/** Ряд індексу по всіх тижнях, де його можна порахувати. Для спарклайна. */
export function kamertonIndexSeries(weekId) {
  return weeksUpTo(weekId || getActiveWeek().id)
    .map((w) => ({ id: w.id, value: kamertonIndexValue(w) }))
    .filter((x) => x.value !== null);
}

/** Попередній тиждень у масиві, або null для першого. */
export function prevWeekId(weekId) {
  const i = weekIndex(weekId || getActiveWeek().id);
  return i > 0 ? WEEKS[i - 1].id : null;
}

/**
 * Список тижнів для перемикача.
 *
 * Прапорець hidden віддається, а не застосовується: ховає тиждень інтерфейс, а не
 * шар даних. Схований тиждень лишається в WEEKS і далі служить базою для дельт,
 * серій і спільного вікна тону, а ?week=<id> його відкриває.
 */
export function listWeeks() {
  return WEEKS.map((w) => ({
    id: w.id,
    short: shortWeek(w.id),
    period: formatPeriod(w.period),
    quality: w.data_quality || 'full',
    hidden: Boolean(w.hidden),
  }));
}

/* ------------------------------------------------------------------ */
/* Реєстр метрик                                                       */
/* ------------------------------------------------------------------ */
// Кожна метрика знає: як себе прочитати з тижня, як назватись, з якою точністю
// рахувати дельту, у який бік зростання читається як погіршення, де її межа.
// mode: 'diff' - дельта як різниця значень, 'pct' - дельта як зміна у відсотках
// (обсяг дискурсу в контракті теж дано як delta_pct, тож fallback збігається за одиницею).

export const METRICS = {
  'strength.mil': {
    label: 'МІЦНІСТЬ · ВІЙСЬКОВІ',
    read: (w) => num(w?.indices?.strength?.mil?.value),
    fallback: (w) => num(w?.indices?.strength?.mil?.delta),
    note: (w) => w?.indices?.strength?.mil?.note || null,
    digits: 2,
    mode: 'diff',
    polarity: 'up-good',
    threshold: STRENGTH_THRESHOLD,
  },
  'strength.civ': {
    label: 'МІЦНІСТЬ · ЦИВІЛЬНІ',
    read: (w) => num(w?.indices?.strength?.civ?.value),
    fallback: (w) => num(w?.indices?.strength?.civ?.delta),
    note: (w) => w?.indices?.strength?.civ?.note || null,
    digits: 2,
    mode: 'diff',
    polarity: 'up-good',
    threshold: STRENGTH_THRESHOLD,
  },
  'connectedness.mil': {
    label: 'ПОВʼЯЗАНІСТЬ · ВІЙСЬКОВІ',
    read: (w) => num(w?.indices?.connectedness?.mil?.value),
    fallback: (w) => num(w?.indices?.connectedness?.mil?.delta),
    digits: 2,
    mode: 'diff',
    polarity: 'up-good',
  },
  'connectedness.civ': {
    label: 'ПОВʼЯЗАНІСТЬ · ЦИВІЛЬНІ',
    read: (w) => num(w?.indices?.connectedness?.civ?.value),
    fallback: (w) => num(w?.indices?.connectedness?.civ?.delta),
    digits: 2,
    mode: 'diff',
    polarity: 'up-good',
  },
  'volume.mil': {
    label: 'ОБСЯГ · ВІЙСЬКОВІ',
    read: (w) => num(w?.indices?.volume?.mil?.weight),
    fallback: (w) => num(w?.indices?.volume?.mil?.delta_pct),
    digits: 1,
    mode: 'pct',
    unit: '%',
    polarity: 'up-bad',
  },
  'volume.civ': {
    label: 'ОБСЯГ · ЦИВІЛЬНІ',
    read: (w) => num(w?.indices?.volume?.civ?.weight),
    fallback: (w) => num(w?.indices?.volume?.civ?.delta_pct),
    digits: 1,
    mode: 'pct',
    unit: '%',
    polarity: 'up-bad',
  },
  'proactivity.civ': {
    label: 'ПРОАКТИВНІСТЬ · ЦИВІЛЬНІ',
    read: (w) => num(w?.indices?.proactivity?.civ?.value),
    fallback: (w) => num(w?.indices?.proactivity?.civ?.delta),
    digits: 1,
    mode: 'diff',
    unit: '',
    polarity: 'up-good',
  },
  'balance.mil.constructive': {
    label: 'КОНСТРУКТИВ · ВІЙСЬКОВІ',
    read: (w) => num(w?.balance?.mil?.constructive),
    fallback: (w) => num(w?.balance?.mil?.delta_constructive),
    digits: 1,
    mode: 'diff',
    polarity: 'up-good',
  },
  'balance.mil.destructive': {
    label: 'ДЕСТРУКТИВ · ВІЙСЬКОВІ',
    read: (w) => num(w?.balance?.mil?.destructive),
    fallback: (w) => num(w?.balance?.mil?.delta_destructive),
    digits: 1,
    mode: 'diff',
    polarity: 'up-bad',
  },
  'balance.civ.constructive': {
    label: 'КОНСТРУКТИВ · ЦИВІЛЬНІ',
    read: (w) => num(w?.balance?.civ?.constructive),
    fallback: (w) => num(w?.balance?.civ?.delta_constructive),
    digits: 1,
    mode: 'diff',
    polarity: 'up-good',
  },
  'balance.civ.destructive': {
    label: 'ДЕСТРУКТИВ · ЦИВІЛЬНІ',
    read: (w) => num(w?.balance?.civ?.destructive),
    fallback: (w) => num(w?.balance?.civ?.delta_destructive),
    digits: 1,
    mode: 'diff',
    polarity: 'up-bad',
  },
  'state.mil.dominant': {
    label: 'ДОМІНУЮЧИЙ СТАН · ВІЙСЬКОВІ',
    read: (w) => num(w?.states?.dominant?.mil?.share),
    fallback: (w) => num(w?.states?.dominant?.mil?.delta),
    digits: 1,
    mode: 'diff',
    polarity: 'up-bad',
  },
  'state.civ.dominant': {
    label: 'ДОМІНУЮЧИЙ СТАН · ЦИВІЛЬНІ',
    read: (w) => num(w?.states?.dominant?.civ?.share),
    fallback: (w) => num(w?.states?.dominant?.civ?.delta),
    digits: 1,
    mode: 'diff',
    polarity: 'up-bad',
  },
};

/**
 * getMetric: значення метрики в конкретному тижні.
 * getMetric('strength.mil', '2026-W31') -> 0.42
 * getMetric('strength.civ', '2026-W29') -> null (даних немає)
 */
export function getMetric(metricKey, weekId) {
  const m = METRICS[metricKey];
  if (!m) return null;
  const w = getActiveWeek(weekId);
  return m.read(w);
}

/**
 * getSeries: траєкторія метрики по всіх наявних тижнях до активного включно.
 * Порожні тижні пропускаються, спарклайн малює тільки те, що виміряно.
 * getSeries('connectedness.mil') -> [2.96, 2.96, 2.54]
 * getSeries('strength.mil') -> [0.43, 0.42]   (W29 без даних)
 * getSeries('strength.civ', '2026-W30') -> [] (нема жодного виміру)
 */
export function getSeries(metricKey, weekId) {
  const m = METRICS[metricKey];
  if (!m) return [];
  return weeksUpTo(weekId || getActiveWeek().id)
    .map((w) => m.read(w))
    .filter((v) => v !== null);
}

/** Скільки тижнів у серії лишились без виміру. Потрібне для чесної позначки неповних даних. */
export function getSeriesGaps(metricKey, weekId) {
  const m = METRICS[metricKey];
  if (!m) return 0;
  return weeksUpTo(weekId || getActiveWeek().id).filter((w) => m.read(w) === null).length;
}

/**
 * getDelta: зміна проти попереднього тижня.
 * Спершу рахуємо самі, і тільки якщо попереднього виміру немає, беремо delta з контракту.
 *
 * getDelta('strength.mil', '2026-W31')
 *   -> {value: -0.01, source: 'computed'}      0.42 - 0.43, збігається з контрактом
 * getDelta('balance.civ.constructive', '2026-W31')
 *   -> {value: 10.3, source: 'computed'}       40.1 - 29.8
 * getDelta('volume.mil', '2026-W31')
 *   -> {value: -58.8, source: 'computed'}      (813 - 1972) / 1972, збігається з delta_pct
 * getDelta('strength.mil', '2026-W30')
 *   -> {value: null, source: null}             попереднього виміру немає, у контракті delta теж null
 * getDelta('state.mil.dominant', '2026-W29')
 *   -> {value: null, source: null}             перший тиждень масиву, порівнювати нема з чим
 */
export function getDelta(metricKey, weekId) {
  const m = METRICS[metricKey];
  if (!m) return { value: null, source: null };

  const i = weekIndex(weekId || getActiveWeek().id);
  const cur = m.read(WEEKS[i]);
  const prev = i > 0 ? m.read(WEEKS[i - 1]) : null;

  if (cur !== null && prev !== null) {
    if (m.mode === 'pct') {
      if (prev === 0) return { value: null, source: null };
      return { value: round(((cur - prev) / prev) * 100, m.digits), source: 'computed' };
    }
    return { value: round(cur - prev, m.digits), source: 'computed' };
  }

  const fb = m.fallback ? m.fallback(WEEKS[i]) : null;
  if (fb !== null && fb !== undefined) return { value: fb, source: 'contract' };

  return { value: null, source: null };
}

/**
 * getStat: усе, що потрібно StatCard, одним викликом.
 * getStat('strength.mil', '2026-W31')
 *   -> {label, value: 0.42, delta: -0.01, deltaSource: 'computed', series: [0.43, 0.42],
 *       threshold: 0.35, polarity: 'up-good', note: 'плато після стрибка...', gaps: 1}
 */
export function getStat(metricKey, weekId) {
  const m = METRICS[metricKey];
  if (!m) return null;
  const w = getActiveWeek(weekId);
  const d = getDelta(metricKey, w.id);
  return {
    key: metricKey,
    label: m.label,
    value: m.read(w),
    unit: m.unit || '',
    delta: d.value,
    deltaSource: d.source,
    polarity: m.polarity,
    threshold: m.threshold,
    series: getSeries(metricKey, w.id),
    gaps: getSeriesGaps(metricKey, w.id),
    note: m.note ? m.note(w) : null,
  };
}

/* ------------------------------------------------------------------ */
/* Баланс аудиторій                                                    */
/* ------------------------------------------------------------------ */

/**
 * getBalance: конструктив і деструктив аудиторії плюс нормалізована позиція каната.
 * Сума конструктиву і деструктиву менша за 100 (решта нейтральне), тому для каната
 * рахуємо співвідношення саме двох полюсів, а не частку від цілого.
 *
 * getBalance('mil', '2026-W31')
 *   -> {constructive: 32.5, destructive: 57.6, rope: 36.1, ...}   32.5 / (32.5 + 57.6)
 */
export function getBalance(aud, weekId) {
  const w = getActiveWeek(weekId);
  const b = w?.balance?.[aud];
  if (!b) return null;
  const c = num(b.constructive);
  const d = num(b.destructive);
  const sum = c !== null && d !== null ? c + d : null;
  return {
    aud,
    constructive: c,
    destructive: d,
    rope: sum ? round((c / sum) * 100, 1) : null,
    deltaConstructive: getDelta(`balance.${aud}.constructive`, w.id),
    deltaDestructive: getDelta(`balance.${aud}.destructive`, w.id),
  };
}

/**
 * getWatchStates: тривожні стани тижня з дельтою.
 * Дельта рахується по парі (аудиторія + назва стану) проти минулого тижня,
 * бо у watch стани приходять і зникають.
 *
 * getWatchStates('2026-W31')
 *   -> [{aud:'civ', name:'Знищення', share:10.2, delta:{value:5.5, source:'computed'}, flag:'radicalization'},
 *       {aud:'mil', name:'Баланс',   share:9.8,  delta:{value:4.9, source:'contract'}, flag:'neutral_growth'}]
 */
export function getWatchStates(weekId) {
  const i = weekIndex(weekId || getActiveWeek().id);
  const cur = WEEKS[i];
  const prev = i > 0 ? WEEKS[i - 1] : null;
  const list = cur?.states?.watch || [];

  return list.map((s) => {
    const before = prev?.states?.watch?.find((p) => p.aud === s.aud && p.name === s.name);
    const a = num(s.share);
    const b = before ? num(before.share) : null;
    let delta = { value: null, source: null };
    if (a !== null && b !== null) delta = { value: round(a - b, 1), source: 'computed' };
    else if (num(s.delta) !== null) delta = { value: num(s.delta), source: 'contract' };
    return { ...s, share: a, delta, headline: watchHeadline(s, a, delta.value) };
  });
}

const AUD_GENITIVE = { mil: 'військових', civ: 'цивільних' };

/**
 * Тривожний стан людською мовою.
 *
 * Верхній рівень зрізу читає керівництво, а не аналітик: «Знищення 10.2% +5.5»
 * там не працює. Фраза будується з тих самих чисел, тому нічого не додає від
 * себе: змінилось у стільки то разів або на стільки то пунктів.
 */
export function watchHeadline(s, share, delta) {
  const who = AUD_GENITIVE[s.aud] || '';
  const subject =
    s.flag === 'radicalization'
      ? `Радикалізація ядра ${who}`
      : s.flag === 'neutral_growth'
      ? `Зростання нейтральних ${who}`
      : `${s.name} у ${who}`;

  // підмет фрази буває однини і множини, тому дієслово узгоджуємо, а не ліпимо
  const many = s.flag === 'radicalization';
  const what =
    s.flag === 'radicalization' ? 'агресивні настрої'
    : s.flag === 'neutral_growth' ? 'частка тих, хто не пристав на жоден бік'
    : 'частка';

  const verb = (grew) =>
    grew ? (many ? 'зросли' : 'зросла') : many ? 'скоротились' : 'скоротилась';

  if (delta === null || delta === undefined || share === null) {
    return `${subject}: ${what} без виміру зміни за тиждень`;
  }
  const before = round(share - delta, 1);
  const times = before > 0 ? share / before : null;
  const move =
    Math.abs(delta) < 0.5 ? (many ? 'майже не змінились за тиждень' : 'майже не змінилась за тиждень')
    : times && times >= 1.8 ? `${verb(true)} вдвічі за тиждень`
    : times && times >= 1.4 ? `${verb(true)} в півтора раза за тиждень`
    : times && times > 0 && times <= 0.55 ? `${verb(false)} удвічі за тиждень`
    : `${verb(delta > 0)} на ${Math.abs(delta)} п.п. за тиждень`;

  return `${subject}: ${what} ${move}`;
}

/** Домінуючий стан аудиторії з дельтою частки. */
export function getDominantState(aud, weekId) {
  const w = getActiveWeek(weekId);
  const s = w?.states?.dominant?.[aud];
  if (!s) return null;
  return { name: s.name, share: num(s.share), delta: getDelta(`state.${aud}.dominant`, w.id) };
}

/* ------------------------------------------------------------------ */
/* Теми                                                                */
/* ------------------------------------------------------------------ */

/** Звірка джерел з контракту -> вигляд, який розуміє SourceTag Астролябії. */
export function verificationToTag(verification) {
  if (!verification) return { kind: 'single' };
  const sources = verification.sources || [];
  const status = String(verification.status || '');
  if (status === 'збіг') return { kind: 'match', count: sources.length || undefined };
  if (status === 'розбіжність') return { kind: 'conflict' };
  return { kind: 'single' };
}

/** Порядок трендів для ранжування: те, що набирає увагу, стоїть вище. */
const TREND_RANK = { new: 0, up: 1, flat: 2, down: 3, out: 4 };

/**
 * getTopics: теми активного тижня, ранжовані.
 * Є вага, ранжуємо по вазі. Ваги немає, ранжуємо за трендом: нові й ті, що ростуть, вище.
 * Порядок усередині однакового тренду лишається як у контракті, тому ранжування стабільне.
 *
 * getTopics('2026-W30').map(t => t.weight_pct) -> [19, 14.3, 11.9, 8.7, 7.3]
 * getTopics('2026-W31').map(t => t.trend)      -> ['new', 'new', 'up', 'up', 'flat']
 */
export function getTopics(weekId) {
  const w = getActiveWeek(weekId);
  const list = (w?.topics || []).slice();
  const weighted = list.every((t) => num(t.weight_pct) !== null);
  if (weighted) {
    list.sort((a, b) => b.weight_pct - a.weight_pct);
  } else {
    list
      .map((t, i) => ({ t, i }))
      .sort(
        (a, b) =>
          (TREND_RANK[a.t.trend] ?? 2) - (TREND_RANK[b.t.trend] ?? 2) || a.i - b.i
      )
      .forEach((o, idx) => {
        list[idx] = o.t;
      });
  }
  return list.map((t, idx) => ({
    ...t,
    rank: idx + 1,
    verificationTag: verificationToTag(t.verification),
    verificationStatus: t.verification?.status || null,
    sources: t.verification?.sources || [],
  }));
}

/** Теми, що випали з поля. Цвинтар тем це теж памʼять. */
export function getExitedTopics(weekId) {
  const w = getActiveWeek(weekId);
  return (w?.topics_exited || []).slice();
}

/* ------------------------------------------------------------------ */
/* Соц-якорі                                                           */
/* ------------------------------------------------------------------ */

export const ANCHORS = contract.anchors || [];

/** Після скількох тижнів від поля якір перестає бути звіркою. Поріг у config/thresholds.json. */
export const ANCHOR_STALE_WEEKS = FIELD.anchor_stale_weeks;

const DAY = 86400000;
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

/**
 * Тиждень, на який приземляється якір: останній, що вже закритий на момент
 * публікації. Каденс опитування свій, тому якір не належить тижню за датою
 * поля: він стає відомим тоді, коли його опублікували, і з того тижня живе
 * як довідка, поки не прийде наступна хвиля.
 */
function anchorWeekIndex(anchor) {
  let idx = 0;
  WEEKS.forEach((w, i) => {
    if (Date.parse(w.period?.to) <= Date.parse(anchor.published)) idx = i;
  });
  return idx;
}

/**
 * getAnchors: якорі, відомі станом на тиждень, з порахованою давністю.
 * Давність міряється від кінця польового періоду, а не від публікації:
 * застаріває вимір, не пресреліз.
 *
 * getAnchors('2026-W31').length -> 1
 * getAnchors('2026-W30').length -> 0
 */
export function getAnchors(weekId) {
  const w = getActiveWeek(weekId);
  const wi = weekIndex(w.id);
  return ANCHORS.filter((a) => anchorWeekIndex(a) <= wi).map((a) => {
    const ageWeeks = Math.max(0, Math.floor(days(a.field_dates?.to, w.period?.to) / 7));
    return {
      ...a,
      delta: num(a.value) !== null && num(a.prev_value) !== null ? round(a.value - a.prev_value, 1) : null,
      ageWeeks,
      ageLabel: ageWeeks === 0 ? 'цього тижня' : `${ageWeeks} ${plural(ageWeeks, ['тиждень', 'тижні', 'тижнів'])} тому`,
      stale: ageWeeks > ANCHOR_STALE_WEEKS,
      fieldLabel: formatPeriod(a.field_dates),
      publishedLabel: formatDate(a.published),
    };
  });
}

/** Історія якоря тими самими кроками, що й історія прогнозу. */
export function anchorHistory(a) {
  return [
    { label: 'поле опитування', value: a.fieldLabel },
    { label: 'опубліковано', value: a.publishedLabel },
    {
      label: 'попередня хвиля',
      value: `${a.prev_value > 0 ? '+' : ''}${a.prev_value}${a.prev_note ? ` · ${a.prev_note}` : ''}`,
    },
    { label: 'давність', value: a.stale ? `${a.ageLabel} · застарів` : a.ageLabel },
    { label: 'джерело', value: a.citation },
  ];
}

/**
 * anchorsForTopic: якорі, що накривають тему, зі звіркою напрямів.
 *
 * Порівнюємо не direction з trend напряму, а expects_trend з trend: метрика
 * і тема міряють різне. Падіння балансу довіри підтверджує зростання теми про
 * кризу довіри, хоча слова протилежні. Якір без expects_trend читається
 * буквально. Застарілий якір у звірці не бере участі взагалі.
 */
export function anchorsForTopic(topicId, weekId) {
  const topic = (getActiveWeek(weekId)?.topics || []).find((t) => t.id === topicId);
  return getAnchors(weekId)
    .filter((a) => (a.covers || []).includes(topicId))
    .map((a) => {
      const expects = a.expects_trend || a.direction;
      const trend = topic?.trend || null;
      const comparable = !a.stale && trend && trend !== 'new';
      return {
        ...a,
        agreement: !comparable ? 'none' : trend === expects ? 'match' : 'conflict',
        topicTrend: trend,
      };
    });
}

/**
 * Звірка теми з урахуванням соц-якоря.
 * САН лишається окремим джерелом: числа не усереднюються, підсумок тільки
 * про напрям. Розбіжність показуємо як розбіжність, а не ховаємо.
 */
export function topicVerification(topic, weekId) {
  const base = topic?.verificationTag || verificationToTag(topic?.verification);
  const anchors = topic?.id ? anchorsForTopic(topic.id, weekId) : [];
  const match = anchors.find((a) => a.agreement === 'match');
  const conflict = anchors.find((a) => a.agreement === 'conflict');
  if (conflict) return { kind: 'conflict', label: 'розбіжність: САН і СОЦ', anchors };
  if (match) return { kind: 'match', count: 2, label: 'збіг 2 джерела: САН + СОЦ', anchors };
  return { ...base, anchors };
}

/* ------------------------------------------------------------------ */
/* Кейси                                                               */
/* ------------------------------------------------------------------ */

/** Скільки тижнів відкритого кейса вважаємо нормою, після якої він загноївся. Поріг у config/thresholds.json. */
export const STALE_WEEKS = FIELD.stale_weeks;

/**
 * collectCases: наскрізні кейси. Один кейс за id, навіть якщо він є у кількох тижнях.
 * Вік рахується від тижня відкриття до активного тижня, у тижнях.
 * Кейс вважається застарілим, коли відкритий три тижні і довше без зміни статусу.
 *
 * collectCases('2026-W31') -> три кейси; case_lviv_tck один раз,
 *   age = 3 (W28 -> W31), history = [{week:'2026-W30',...}, {week:'2026-W31',...}]
 * collectCases('2026-W29') -> [] (у тижні кейсів немає)
 */
export function collectCases(weekId) {
  const active = getActiveWeek(weekId);
  const scope = weeksUpTo(active.id);

  const history = new Map();
  scope.forEach((w) => {
    (w.cases || []).forEach((c) => {
      if (!history.has(c.id)) history.set(c.id, []);
      history.get(c.id).push({ week: w.id, ...c });
    });
  });

  const activeIds = new Set((active.cases || []).map((c) => c.id));

  return (active.cases || []).map((c) => {
    const hist = history.get(c.id) || [];
    const first = hist[0] || c;
    const openedWeek = c.opened || first.opened || first.week;
    const a = weekOrdinal(active.id);
    const o = weekOrdinal(openedWeek);
    const age = a !== null && o !== null ? Math.max(0, a - o) : null;
    const isOpen = c.status === 'open' || c.status === 'festering';
    // Кейс, що висить відкритим три тижні й довше без публічної відповіді,
    // показується як festering. Це похідний стан рендера, у контракті він лишається open:
    // ми не переписуємо дані, а називаємо те, що з них випливає.
    const overdue = Boolean(isOpen && age !== null && age >= STALE_WEEKS);
    const renderStatus = overdue && c.status === 'open' ? 'festering' : c.status;
    return {
      ...c,
      openedWeek,
      age,
      history: hist,
      seenWeeks: hist.length,
      isOpen,
      isStale: overdue,
      renderStatus,
      overdueNote: overdue ? 'без відповіді довше за норму' : null,
    };
  }).filter((c) => activeIds.has(c.id));
}

/**
 * casesSummary: рядок-підсумок над списком кейсів.
 * casesSummary('2026-W31') -> {total: 3, open: 3, festering: 1, nextCheck: '2026-W32'}
 */
export function casesSummary(weekId) {
  const list = collectCases(weekId);
  const checks = list
    .map((c) => c.next_check)
    .filter(Boolean)
    .sort((a, b) => (weekOrdinal(a) ?? 0) - (weekOrdinal(b) ?? 0));
  return {
    total: list.length,
    open: list.filter((c) => c.isOpen).length,
    festering: list.filter((c) => c.renderStatus === 'festering').length,
    nextCheck: checks[0] || null,
  };
}

/**
 * Місток від теми до кейса на контролі.
 *
 * Правило: спільний розпізнавальний маркер у назві теми і в назві кейса.
 * Маркерами вважаємо числа від двох цифр (номери підрозділів) і абревіатури
 * великими літерами, бо саме вони називають конкретний випадок, а не загальну тему.
 * Зв'язок береться з тексту контракту, окремого поля для нього заводити не треба.
 *
 * linkedCase('t_case_225', '2026-W31') -> кейс case_225_425 (спільний маркер 225)
 * linkedCase('t_tck', '2026-W31')      -> кейс case_lviv_tck (спільний маркер ТЦК)
 * linkedCase('t_gratitude', '2026-W31')-> null (маркерів немає)
 */
export function linkedCase(topicId, weekId) {
  const w = getActiveWeek(weekId);
  const topic =
    (w?.topics || []).find((t) => t.id === topicId) ||
    (w?.topics_exited || []).find((t) => t.id === topicId);
  if (!topic) return null;

  const markers = String(topic.name)
    .split(/[^0-9A-Za-zА-Яа-яЇїІіЄєҐґ']+/)
    .filter((tok) => /^\d{2,}$/.test(tok) || /^[А-ЯЇІЄҐA-Z]{3,}$/.test(tok));
  if (!markers.length) return null;

  return (
    collectCases(w.id).find((c) =>
      markers.some((m) => new RegExp(`(^|[^0-9A-Za-zА-Яа-яЇїІіЄєҐґ])${m}([^0-9A-Za-zА-Яа-яЇїІіЄєҐґ]|$)`).test(c.title))
    ) || null
  );
}

/* ------------------------------------------------------------------ */
/* Прогнози                                                            */
/* ------------------------------------------------------------------ */

export const FORECAST_LABEL = {
  hit: 'ВЛУЧАННЯ',
  miss: 'ПРОМАХ',
  partial_hit: 'ЧАСТКОВЕ',
  open: 'ВІДКРИТИЙ',
};

/**
 * Статус прогнозу людською мовою.
 * Реєстр читає керівництво, а не аналітик: «ВЛУЧАННЯ» це технічна мітка,
 * і вона лишається дрібно збоку, а рядок каже те саме звичайними словами.
 */
export function forecastHuman(f) {
  if (!f) return '';
  if (f.status === 'hit') return 'справдилось';
  if (f.status === 'miss') return 'не справдилось';
  if (f.status === 'partial_hit') return 'частково справдилось';
  return f.deadline ? `очікуємо до ${formatDate(f.deadline)}` : 'очікуємо';
}

/**
 * Історія прогнозу як послідовність кроків: коли зроблено, за яким критерієм,
 * до якої дати і чим закінчилось. Порожнє поле не вигадуємо.
 */
export function forecastHistory(f) {
  const week = WEEKS.find((w) => w.id === f.opened);
  const made = week
    ? `${shortWeek(f.opened)}, ${formatPeriod(week.period)}`
    : shortWeek(f.opened);
  return [
    { label: 'прогноз зроблено', value: made },
    { label: 'критерій', value: f.criterion || 'критерій не записаний' },
    { label: 'дедлайн', value: formatDate(f.deadline) },
    {
      label: 'результат',
      // у промаху висновок стоїть окремим рядком під історією, тому тут його
      // не повторюємо: те саме речення двічі читається як помилка верстки
      value:
        f.status === 'open' ? 'очікуємо'
        : f.status === 'miss' ? forecastHuman(f)
        : [forecastHuman(f), f.resolution_note].filter(Boolean).join(' · '),
    },
  ];
}

/**
 * collectForecasts: єдиний реєстр прогнозів з усіх тижнів до активного включно.
 * Прогноз з одним id може зустрічатись у кількох тижнях: виграє найсвіжіший запис,
 * тому f_2907_stab з W29 (open) показується як partial_hit зі станом з W31.
 * Сортування: спершу відкриті за дедлайном, потім закриті, найсвіжіші зверху.
 *
 * collectForecasts('2026-W31') -> 5 записів, з них 2 відкриті
 * collectForecasts('2026-W29') -> 1 запис, f_2907_stab у статусі open
 */
export function collectForecasts(weekId) {
  const active = getActiveWeek(weekId);
  const byId = new Map();

  // G0: ймовірність приходить з повʼязаного ринку, а не з копії в прогнозі.
  // Саме тому число не може розсинхронізуватись: у прогнозі його просто немає,
  // воно рахується з оцінок в одному місці (правило B7).
  const pByForecast = new Map();
  weeksUpTo(active.id).forEach((w) => {
    (w.ensemble?.markets || []).forEach((m) => {
      if (!m.forecast_id) return;
      const p = m.aggregate?.p_ensemble;
      if (typeof p === 'number') pByForecast.set(m.forecast_id, p);
    });
  });

  weeksUpTo(active.id).forEach((w) => {
    (w.forecasts || []).forEach((f) => {
      const prev = byId.get(f.id);
      byId.set(f.id, { ...(prev || {}), ...f, lastSeen: w.id, opened: f.opened || prev?.opened });
    });
  });

  byId.forEach((f, id) => {
    if (pByForecast.has(id)) byId.set(id, { ...f, probability: pByForecast.get(id) });
  });

  const list = [...byId.values()];
  const rank = (f) => (f.status === 'open' ? 0 : 1);
  return list.sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    const da = String(a.deadline || '');
    const db = String(b.deadline || '');
    return rank(a) === 0 ? da.localeCompare(db) : db.localeCompare(da);
  });
}

/**
 * forecastScore: чесний рахунок. Часткове влучання це окремий статус, не половина влучання.
 * forecastScore('2026-W31') -> {hits: 1, misses: 1, open: 2, partial: 1, total: 5}
 */
export function forecastScore(weekId) {
  const list = collectForecasts(weekId);
  return {
    hits: list.filter((f) => f.status === 'hit').length,
    misses: list.filter((f) => f.status === 'miss').length,
    open: list.filter((f) => f.status === 'open').length,
    partial: list.filter((f) => f.status === 'partial_hit').length,
    total: list.length,
  };
}

/**
 * D7: найближчі перевірки. Прогнози з відкритим статусом і дедлайном у вікні
 * попереду, від найближчого. Зріз працює як перша сторінка доповіді, і питання
 * «що ми перевіряємо далі» має стояти саме там, а не лише в реєстрі.
 *
 * Читаємо ОДИН запис прогнозу (B7): ймовірність, дедлайн і критерій беруться
 * звідси ж, тому привид на карті, діамант у Компасі і цей рядок не можуть
 * показати різні числа.
 */
export function upcomingForecasts(weekId, { days = 14, limit = 3 } = {}) {
  const week = getActiveWeek(weekId);
  // Відлік від кінця тижня зрізу, а не від «сьогодні»: інакше той самий зріз,
  // відкритий через місяць, показував би порожній список і виглядав зламаним.
  const from = Date.parse(week?.period?.to);
  if (!Number.isFinite(from)) return [];
  const until = from + days * DAY;
  const inWindow = collectForecasts(weekId)
    .filter((f) => f.status === 'open')
    .map((f) => ({ ...f, at: Date.parse(f.deadline) }))
    .filter((f) => Number.isFinite(f.at) && f.at <= until)
    .sort((a, b) => a.at - b.at);

  // Спершу ті, що мають число, тобто мають ринок і реально відстежуються.
  // Блок відповідає на питання «що ми перевіряємо», а перевіряти без числа і
  // без ринку нема чим: такий прогноз лишається в реєстрі, але сюди потрапляє
  // тільки якщо вимірюваних не вистачило на всі місця.
  const measured = inWindow.filter((f) => typeof f.probability === 'number');
  const rest = inWindow.filter((f) => typeof f.probability !== 'number');
  return [...measured, ...rest].slice(0, limit);
}

/**
 * D5 · привиди шару ПРОГНОЗ.
 *
 * Тема отримує привида, якщо на неї посилається ринок (`topic_refs`), а ринок
 * звʼязаний з прогнозом (`forecast_id`, це зробив G0). Число береться з того
 * самого запису Forecast, що живить Зріз і діамант Компаса: правило B7 працює
 * саме тому, що тут немає власного обчислення, лише читання.
 *
 * Прогнозної ПОЗИЦІЇ на шкалі тону в контракті немає: прогноз каже про подію,
 * а не про майбутній тон теми. Тому привид стоїть на позиції самої теми і несе
 * ймовірність, дату перевірки і коридор невизначеності. Вигадувати координату
 * означало б намалювати число, якого ніхто не рахував.
 */
export function forecastGhosts(weekId) {
  const week = getActiveWeek(weekId);
  const byId = new Map(collectForecasts(weekId).map((f) => [f.id, f]));
  const out = new Map();

  (week.ensemble?.markets || []).forEach((m) => {
    const f = m.forecast_id ? byId.get(m.forecast_id) : null;
    if (!f || f.status !== 'open') return;
    const p = typeof f.probability === 'number' ? f.probability : null;
    (m.topic_refs || []).forEach((raw) => {
      const id = canonicalTopicId(raw);
      // Тема може мати кілька прогнозів: показуємо найближчий за дедлайном,
      // бо саме він перевіряється першим.
      const prev = out.get(id);
      if (prev && String(prev.deadline) <= String(f.deadline)) return;
      out.set(id, {
        topicId: id,
        forecastId: f.id,
        marketId: m.id,
        p,
        // Невизначеність максимальна біля 50%: саме там прогноз нічого не каже.
        uncertainty: p == null ? 1 : 1 - Math.abs(p - 0.5) * 2,
        deadline: f.deadline,
        question: f.text || f.question || '',
      });
    });
  });

  return [...out.values()];
}

/**
 * Методологічне правило приходить у двох формах: у W30 це обʼєкт {text,type},
 * у W32 голий рядок. Читачі брали n.text і діставали undefined, а розсипання
 * рядка через {...n} давало числові ключі, тому на дефолтному тижні і досьє, і
 * реєстр малювали порожні рядки. Нормалізуємо на вході: сирі дані тижня
 * лишаються недоторканими, а новий тиждень у будь-якій формі не ламає екран.
 */
function methodNote(n) {
  if (typeof n === 'string') return { text: n };
  return n && typeof n === 'object' ? n : { text: '' };
}

/** Методологічні правила з усіх тижнів до активного. Правило зафіксоване один раз працює далі. */
export function collectMethodNotes(weekId) {
  const out = [];
  weeksUpTo(getActiveWeek(weekId).id).forEach((w) => {
    (w.method_notes || []).forEach((n) => out.push({ ...methodNote(n), week: w.id }));
  });
  return out.reverse();
}

/* ------------------------------------------------------------------ */
/* Досьє теми: трек, дельти, звʼязки, важелі                           */
/* ------------------------------------------------------------------ */

/**
 * topicTrack: позиція теми на шкалі тону по всіх тижнях, де вона існує.
 * Теми зшиваються лише за однаковим id. Якщо сюжет колись жив під іншим id,
 * ми його не приклеюємо: краще чесно почати з першої появи, ніж вигадати історію.
 *
 * topicTrack('t_tck') -> [{week:'2026-W29', tone:-0.55, salience:3, ...}, ...] три точки
 * topicTrack('t_gratitude') -> одна точка, тема зʼявилась у W31
 */
export function topicTrack(topicId, weekId) {
  const out = [];
  // G7: серія зшивається по всій родині id, а не по одному. Інакше сюжет, який
  // колись перейменували разом з id, показував би обрізану історію і виглядав
  // молодшим, ніж він є.
  const family = topicIdFamily(topicId);
  weeksUpTo(getActiveWeek(weekId).id).forEach((w) => {
    const t = (w.topics || []).find((x) => family.has(x.id));
    if (!t) return;
    out.push({
      week: w.id,
      short: shortWeek(w.id),
      tone: typeof t.tone_score === 'number' ? t.tone_score : null,
      salience: typeof t.salience === 'number' ? t.salience : null,
      verification: t.verification?.status || null,
      trend: t.trend,
    });
  });
  return out;
}

const TONE_WORD = {
  up: 'дрейф у конструктив',
  down: 'дрейф у деструктив',
  flat: 'без зміни',
};

/**
 * topicDeltas: як тема змінилась проти минулого тижня, словами.
 * topicDeltas('t_tck', '2026-W31')
 *   -> {tone: 'дрейф у конструктив', salience: 'без зміни', verification: 'без зміни', isNew: false}
 * topicDeltas('t_gratitude', '2026-W31') -> {isNew: true}
 */
export function topicDeltas(topicId, weekId) {
  const track = topicTrack(topicId, weekId);
  if (track.length < 2) return { isNew: true };
  const cur = track[track.length - 1];
  const prev = track[track.length - 2];

  const dTone =
    cur.tone === null || prev.tone === null
      ? null
      : Math.abs(cur.tone - prev.tone) < 0.005
      ? 'flat'
      : cur.tone > prev.tone
      ? 'up'
      : 'down';

  const dSal =
    cur.salience === null || prev.salience === null
      ? null
      : cur.salience > prev.salience
      ? 'зросла'
      : cur.salience < prev.salience
      ? 'впала'
      : 'без зміни';

  return {
    isNew: false,
    from: prev,
    to: cur,
    tone: dTone ? TONE_WORD[dTone] : 'даних немає',
    toneDelta: dTone === null ? null : round(cur.tone - prev.tone, 2),
    salience: dSal || 'даних немає',
    verification:
      cur.verification === prev.verification
        ? 'без зміни'
        : `змінилась: ${prev.verification || 'без звірки'} на ${cur.verification || 'без звірки'}`,
  };
}

/** Назва теми з контракту за її id. */
export function topicName(topicId, weekId) {
  const w = getActiveWeek(weekId);
  return (
    (w.topics || []).find((t) => t.id === topicId)?.name ||
    (w.topics_exited || []).find((t) => t.id === topicId)?.name ||
    TOPIC_REG.get(topicId)?.full_name ||
    topicId
  );
}

/**
 * Коротке імʼя теми для карти. Повне імʼя тем сягає 68 символів, тому на
 * полотні воно існувало лише в обрізаному вигляді. Тепер карта малює тільки
 * short_name з реєстру, а повне живе в тултіпі, у списку тем і в досьє.
 *
 * short_name_todo означає, що імʼя згенероване механічно і чекає на формулювання
 * замовника: воно робоче, але не остаточне.
 */
export function topicShortName(topicId, weekId) {
  return TOPIC_REG.get(topicId)?.short_name || topicName(topicId, weekId);
}

/** Чи чекає коротке імʼя теми на ручне формулювання. */
export function topicShortNameTodo(topicId) {
  return TOPIC_REG.get(topicId)?.short_name_todo === true;
}

/**
 * Звʼязки теми з причинами словами. Порожній масив, якщо у звіті їх не названо.
 *
 * Віддаються обидва напрямки. Тема, на яку показують інші, раніше показувала
 * порожньо: у кризи довіри пʼять вхідних звʼязків, а картка казала, що названих
 * звʼязків немає. Причина належить парі тем, а не тій, з якої її записали.
 *
 * topicLinks('t_gov_trust', '2026-W32')
 *   -> [{to:'t_anticorr', dir:'in', reason:'антикорупційний скепсис живить...'}, ...]
 */
export function topicLinks(topicId, weekId) {
  const w = getActiveWeek(weekId);
  const topics = w.topics || [];
  const names = new Map(topics.map((x) => [x.id, x.name]));
  const out = [];

  const self = topics.find((x) => x.id === topicId);
  (self?.links || []).forEach((l) => {
    out.push({ to: l.to, name: names.get(l.to) || l.to, reason: l.reason || null, dir: 'out' });
  });

  topics.forEach((other) => {
    if (other.id === topicId) return;
    (other.links || []).forEach((l) => {
      if (l.to !== topicId) return;
      out.push({
        to: other.id,
        name: names.get(other.id) || other.id,
        reason: l.reason || null,
        dir: 'in',
      });
    });
  });

  return out;
}

/**
 * leversForTopic: важелі, що стосуються саме цієї теми.
 * Береться і пряма прив'язка linked_topic, і непряма через кейс, який
 * обертається навколо теми.
 *
 * leversForTopic('t_case_225', '2026-W31').map(l => l.id)
 *   -> ['l_225_response', 'l_tech_units']
 * leversForTopic('t_anticorr', '2026-W31') -> []
 */
export function leversForTopic(topicId, weekId) {
  const w = getActiveWeek(weekId);
  const hostCases = new Set(
    (w.cases || []).filter((c) => c.host_topic === topicId).map((c) => c.id)
  );
  // linked_topic це або одна тема, або список: важіль може тягнути кілька
  const linked = (l) => (Array.isArray(l.linked_topic) ? l.linked_topic : [l.linked_topic]);
  return (w.levers || []).filter(
    (l) =>
      linked(l).includes(topicId) ||
      (l.linked_case && hostCases.has(l.linked_case)) ||
      (l.shifts || []).some((s) => s.topic === topicId)
  );
}

/**
 * leverModel: що станеться з темами, якщо потягнути важіль.
 * Прямі зсуви беруться з даних, а далі поширюються тільки по названих звʼязках
 * із загасанням 0.4 і рівно на один крок. Тема без звʼязку не рухається.
 *
 * leverModel('l_225_response', '2026-W31')
 *   -> {direct: [{topic:'t_case_225', value:0.25}],
 *       spread: [{topic:'t_gov_trust', value:0.1, from:'t_case_225'}]}
 */
export const SPREAD_DAMPING = 0.4;

export function leverModel(leverId, weekId) {
  const w = getActiveWeek(weekId);
  const lever = (w.levers || []).find((l) => l.id === leverId);
  if (!lever) return null;

  const direct = (lever.shifts || []).map((s) => ({ topic: s.topic, value: s.value }));
  const byTopic = new Map(direct.map((d) => [d.topic, d.value]));
  const spread = [];

  direct.forEach((d) => {
    const src = (w.topics || []).find((t) => t.id === d.topic);
    (src?.links || []).forEach((l) => {
      const value = round(d.value * SPREAD_DAMPING, 3);
      if (byTopic.has(l.to)) return; // прямий зсув сильніший, другого кола не додаємо
      spread.push({ topic: l.to, value, from: d.topic, reason: l.reason || null });
    });
  });

  const total = {};
  [...direct, ...spread].forEach((s) => {
    total[s.topic] = round((total[s.topic] || 0) + s.value, 3);
  });

  // D4: каскад як ПОСЛІДОВНІСТЬ, а не як одна сумована мапа.
  //
  // Дані про хвилю в контракті були завжди (`lever.cascade` у 8 з 11 важелів),
  // але сплющувались в один підсумок і програвались одним твіном. Через це
  // причинність зникала: читач бачив, що поле смикнулось, і не бачив, ЩО за
  // чим потягнуло. Ланки нумеруються, амплітуда спадає з кожним колом.
  const waves = [];
  if (direct.length) {
    waves.push({
      step: 0,
      kind: 'topics',
      items: direct.map((d) => ({ id: d.topic, value: d.value })),
    });
  }
  if (spread.length) {
    waves.push({
      step: 1,
      kind: 'topics',
      items: spread.map((s) => ({ id: s.topic, value: s.value, from: s.from, reason: s.reason })),
    });
  }
  if ((lever.cascade || []).length) {
    waves.push({
      step: waves.length,
      kind: 'actors',
      items: lever.cascade.map((c) => ({ id: c.actor, value: c.stance, note: c.note })),
    });
  }

  // Блок ДО / ПІСЛЯ: три найбільші зміщення, щоб підсумок читався без таблиці.
  const topShifts = Object.entries(total)
    .map(([topic, value]) => ({ topic, value }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 3);

  const before = kamertonIndex(weekId);
  return { lever, direct, spread, total, waves, topShifts, before };
}

/* ------------------------------------------------------------------ */
/* Актори                                                              */
/* ------------------------------------------------------------------ */

export const ACTOR_TYPE_LABEL = {
  institution: 'інституція',
  group: 'група',
  audience: 'аудиторія',
  amplifier: 'підсилювач',
};

/**
 * getActors: актори тижня, склеєні з реєстром (звідти назва і тип).
 * Позначка changed показує, кого варто підсвітити: новий актор або різкий зсув позиції.
 *
 * getActors('2026-W31').find(a => a.id === 'cmd_local')
 *   -> {name: 'Командири на місцях', stance: -0.7, activity: 4, changed: true, ...}
 */
export function getActors(weekId) {
  const i = weekIndex(weekId || getActiveWeek().id);
  const cur = WEEKS[i];
  const prev = i > 0 ? WEEKS[i - 1] : null;
  const reg = new Map(ACTORS.map((a) => [a.id, a]));

  return (cur?.actors || []).map((a) => {
    const before = prev?.actors?.find((p) => p.id === a.id) || null;
    const dStance = before ? round(a.stance - before.stance, 2) : null;
    const dActivity = before ? a.activity - before.activity : null;
    const isNew = !before;
    // різким вважаємо зсув позиції від 0.2 або зміну активності на два кроки
    const sharp =
      (dStance !== null && Math.abs(dStance) >= 0.2) ||
      (dActivity !== null && Math.abs(dActivity) >= 2);
    return {
      ...a,
      name: reg.get(a.id)?.name || a.id,
      type: reg.get(a.id)?.type || null,
      typeLabel: ACTOR_TYPE_LABEL[reg.get(a.id)?.type] || '',
      deltaStance: dStance,
      deltaActivity: dActivity,
      isNew,
      changed: isNew || sharp,
    };
  });
}

/** Назва актора з реєстру. */
export function actorName(id) {
  return ACTORS.find((a) => a.id === id)?.name || id;
}

/* ------------------------------------------------------------------ */
/* Глосарій обʼєктів                                                   */
/* ------------------------------------------------------------------ */

export const GLOSSARY = contract.glossary || { metrics: {}, states: {} };

/** Пояснення метрики: 'strength.mil' -> запис про індекс міцності. */
export function metricGlossary(metricKey) {
  const base = String(metricKey).split('.')[0];
  return GLOSSARY.metrics?.[base] || null;
}

/** Пояснення стану за його назвою у контракті. */
export function stateGlossary(name) {
  return GLOSSARY.states?.[name] || null;
}

/**
 * Пояснення епістемічного тега за його видом.
 * Ключі ті самі, що й класи тегів у Астролябії: fact, assessment, hypothesis,
 * match, conflict, single. Тег, який не вміє пояснити себе, клікати нема сенсу.
 */
export function tagGlossary(kind) {
  return GLOSSARY.tags?.[kind] || null;
}

/* ------------------------------------------------------------------ */
/* BLUF: що сталось і де потрібне рішення                              */
/* ------------------------------------------------------------------ */

/** Перше речення тексту. Крапка всередині числа або скорочення не рахується. */
export function firstSentence(text) {
  if (!text) return '';
  const m = String(text).match(/^.*?[.!?](?=\s+[А-ЯЇІЄҐA-Z]|\s*$)/);
  return (m ? m[0] : String(text)).trim();
}

/**
 * bluf: три клітинки верхньої смуги.
 * Рішення рахується з кейсів, а не пишеться руками: скільки чекає відповіді
 * і коли найближча перевірка.
 *
 * bluf('2026-W31').decision -> {count: 3, nextCheck: '2026-W32'}
 */
export function bluf(weekId) {
  const w = getActiveWeek(weekId);
  const sum = casesSummary(w.id);
  return {
    // короткі формулювання з контракту, а не обрізане перше речення вердикту:
    // смуга має читатись за секунди, повні тексти лишаються в доку ЗРІЗ
    threat: w.bluf_threat || firstSentence(w.verdict?.threat),
    opportunity: w.bluf_opportunity || firstSentence(w.verdict?.opportunity),
    status: w.verdict?.editor_status || 'assessment',
    decision: { count: sum.open, nextCheck: sum.nextCheck, festering: sum.festering },
  };
}

/* ------------------------------------------------------------------ */
/* Твердження тижня за епістемічним статусом                           */
/* ------------------------------------------------------------------ */

/**
 * getStatements: розкриття лічильників шапки.
 * Той самий поділ, що рахує epistemicCount, тільки з текстами.
 *
 * getStatements('2026-W31', 'fact').length      -> 3
 * getStatements('2026-W31', 'assessment').length -> 6
 */
export function getStatements(weekId, kind) {
  const w = getActiveWeek(weekId);
  if (kind === 'fact') {
    return [
      ...(w.quotes || [])
        .filter((q) => q.status === 'fact')
        .map((q) => ({ text: q.text, source: q.attribution_domain })),
      ...(w.method_notes || []).map((n) => ({ text: methodNote(n).text, source: 'методологія' })),
    ];
  }
  if (kind === 'assessment') {
    return [
      { text: w.verdict?.threat, source: 'вердикт тижня' },
      ...(w.topics || []).map((t) => ({
        text: t.name,
        source: `тема, звірка: ${t.verification?.status || 'без звірки'}`,
      })),
    ].filter((s) => s.text);
  }
  return [
    ...(w.forecasts || [])
      .filter((f) => f.opened === w.id)
      .map((f) => ({
        text: f.text,
        source: `прогноз, дедлайн ${formatDate(f.deadline)}`,
        criterion: f.criterion,
        deadline: formatDate(f.deadline),
      })),
    ...(w.levers || []).map((l) => ({
      text: l.text,
      source: `важіль: ${l.expected}`,
      criterion: l.expected,
    })),
  ];
}

/** Довідка про першоджерело корпусу. Одна на весь застосунок. */
export const SAN_INFO = {
  term: 'САН',
  definition:
    'Система аналізу наративів. Парсинг ~2000 акаунтів, панелі військових і цивільних, ' +
    'польовий контур. Виробляє тижневі зведення, з яких зібрано цей корпус.',
};

/**
 * Поіменний розклад звірки: хто з джерел що саме бачить.
 * Без розкладу «розбіжність» лишається ярликом, а керівництву треба знати,
 * між ким саме розбіжність і в чому.
 */
export function verificationBreakdown(topic) {
  const b = topic?.verification?.breakdown;
  if (Array.isArray(b) && b.length) return b;
  const sources = topic?.verification?.sources || [];
  if (sources.length <= 1) {
    return [
      { source: sources[0] || 'САН', read: 'єдине джерело теми' },
      { source: 'інші джерела', read: 'тему не покривають' },
    ];
  }
  return sources.map((s) => ({ source: s, read: 'позиція у звіті не розписана' }));
}

/* ------------------------------------------------------------------ */
/* Важелі і невизначеності                                             */
/* ------------------------------------------------------------------ */

export function getLevers(weekId) {
  return getActiveWeek(weekId)?.levers || [];
}

export function getUncertainties(weekId) {
  return getActiveWeek(weekId)?.uncertainties || [];
}

export function getQuotes(weekId) {
  return getActiveWeek(weekId)?.quotes || [];
}

/* ------------------------------------------------------------------ */
/* Фаза F3 · прецеденти в продукті                                      */
/* ------------------------------------------------------------------ */

/**
 * Картка прецеденту для кейса. Порожньо це нормальний стан: до наповнення
 * корпусу людьми карток немає, і тоді таб у кейсі неактивний, а сигнал-рядок
 * у темі не показується взагалі.
 */
export function precedentFor(caseId, weekId) {
  const w = getActiveWeek(weekId);
  return (w.precedents || []).find((p) => p.case_id === caseId) || null;
}

/** Усі картки тижня. Потрібне сигнал-рядку в досьє теми. */
export function precedentsOf(weekId) {
  return getActiveWeek(weekId).precedents || [];
}

/**
 * Сигнал-рядок для досьє теми: «прецеденти: n · клас: назва · статус: статус».
 * Тема бачить картку, якщо картка стосується кейса, що висить на цій темі.
 */
export function precedentSignal(topicId, weekId) {
  const list = precedentSignals(topicId, weekId);
  return list.length ? list[0] : null;
}

/**
 * Усі сигнал-рядки теми, по одному на кейс з карткою.
 *
 * Тема цілком може тримати кілька кейсів (у W32 на «Мобілізації і ТЦК» їх два),
 * і в кожного свої історичні аналоги. Один рядок на тему показував би прецеденти
 * першого кейса як прецеденти теми, тобто рівно ту підміну, через яку клік по
 * будь-якому супутнику вів в один і той самий список.
 */
/* ------------------------------------------------------------------ */
/* Глибинний шар · блок у досьє теми                                    */
/* ------------------------------------------------------------------ */

/**
 * Блоки Глибинного шару для досьє теми.
 *
 * Тема бачить свою власну розмітку І розмітку кожного кейса, що на ній висить:
 * предметів у модуля два, а досьє одне. У W32 на «Мобілізації і ТЦК» саме так
 * і виходить два блоки, бо на темі два кейси.
 *
 * Дані беруться з derived/depth.json, а не з корпусу: у корпусі лежать примітки
 * аналітика і питання до зустрічі, яким в офлайн-файлі керівництва не місце, та
 * й бандл їх не витримав би.
 */
export function depthBlocks(topicId, weekId) {
  const w = getActiveWeek(weekId);
  if (!w || !topicId) return [];
  const family = topicIdFamily(topicId);
  const caseIds = new Set((w.cases || []).filter((c) => family.has(c.host_topic)).map((c) => c.id));
  const caseTitle = new Map((w.cases || []).map((c) => [c.id, c.title]));
  // Коротке імʼя, як на карті (B4): повні назви тем сягають 68 знаків, а блок
  // живе під лімітом 120 на рядок.
  const subjectName = (id) => TOPIC_REG.get(canonicalTopicId(id))?.short_name || topicName(id, weekId);

  return (depthProjection.markups || [])
    .filter((m) => m.week === w.id)
    .filter((m) => (m.topic_id ? family.has(m.topic_id) : caseIds.has(m.case_id)))
    .map((m) => {
      const label = (kind, id) => (depthProjection.lenses?.[kind] || [])
        .find((x) => x.id === id)?.label || id;
      const lens = (l, fill) => (l?.cut ? { cut: true, reason: l.reason } : fill(l));
      return {
        id: m.id,
        subject: m.topic_id ? 'topic' : 'case',
        title: m.topic_id ? subjectName(m.topic_id) : (caseTitle.get(m.case_id) || m.case_id),
        allCut: depthAllLensesCut(m),
        // Ціна показу неузгодженої розмітки: бейдж чернетки на КОЖНОМУ екрані,
        // де вона видима, а не лише на вкладці СЮЖЕТИ. Знімається сам статусом.
        draft: m.status !== 'validated',
        plot: lens(m.plot, (p) => ({
          primary: label('plots', p.primary.id),
          secondary: p.secondary ? label('plots', p.secondary.id) : null,
        })),
        roles: lens(m.roles, (r) => ({
          items: (r.items || []).map((x) => ({ role: label('roles', x.role_id), who: x.who })),
        })),
        psychotypes: lens(m.psychotypes, (p) => ({
          items: (p.items || []).map((x) => ({
            cluster: label('psychotypes', x.id),
            share: typeof x.share === 'number' ? x.share : null,
            method: x.method || null,
          })),
        })),
        // Рекомендації живуть у «мові наслідків», а не тут: глибинний шар
        // пояснює ЧОМУ, мова наслідків каже ЩО РОБИТИ (розділ 16).
        howToSpeak: (m.how_to_speak || []).map((h) => ({
          cluster: h.psychotype_id ? label('psychotypes', h.psychotype_id) : null,
          text: h.text,
        })),
        whatToAvoid: m.what_to_avoid || [],
      };
    });
}

/* ------------------------------------------------------------------ */
/* Шар СЮЖЕТИ                                                           */
/* ------------------------------------------------------------------ */

/**
 * Поле шару СЮЖЕТИ: по вузлу на розмітку, а не на тему.
 *
 * Чому не на тему. Розмітка описує або кейс, або тему (розділ 4 спеки шару), і
 * на одній темі цілком живуть дві розмітки: у W32 «Мобілізація і ТЦК» тримає
 * інцидент у Львові і розпорядження про розшук СЗЧ. Історії в них різні, і
 * зводити їх в одну зорю означало б показати одну замість двох. Тема, у якої
 * розмітки немає взагалі, дає рівно один вузол: порожнє кільце.
 *
 * Кольору тут немає і не повертається. Сюжет кодується формою і рухом зорі
 * (розділ 0 візуальної спеки), тому назовні йде id сюжету, а морфологію по
 * ньому будує сцена.
 */
export function plotField(weekId) {
  const w = getActiveWeek(weekId);
  if (!w) return [];
  const hostOf = new Map((w.cases || []).map((c) => [c.id, c.host_topic]));
  const caseTitle = new Map((w.cases || []).map((c) => [c.id, c.title]));
  const marks = (depthProjection.markups || []).filter((m) => m.week === w.id);
  const byTopic = new Map();
  marks.forEach((m) => {
    const topicId = canonicalTopicId(m.topic_id || hostOf.get(m.case_id) || '');
    if (!topicId) return;
    if (!byTopic.has(topicId)) byTopic.set(topicId, []);
    byTopic.get(topicId).push(m);
  });

  const nodes = [];
  getTopics(weekId).forEach((t) => {
    const own = byTopic.get(canonicalTopicId(t.id)) || [];
    const size = typeof t.salience === 'number' ? t.salience : 3;
    const base = {
      topicId: t.id,
      // Вага уваги задає радіус ядра. Діапазон 6-16 px з розділу 3 візуальної
      // спеки, шкала salience 1-5 та сама, що і на карті ТЕМИ.
      r: 6 + ((Math.max(1, Math.min(5, size)) - 1) / 4) * 10,
      aud: t.aud || 'both',
    };
    if (!own.length) {
      nodes.push({
        ...base,
        id: t.id,
        name: topicShortName(t.id, weekId),
        plot: null,
        secondary: null,
        // Розмітки немає взагалі: поле не мовчало, його ще не слухали в цій
        // лінзі. Причина в тултіпі має відрізняти одне від одного.
        cut: 'розмітки немає',
        draft: false,
      });
      return;
    }
    own.forEach((m) => {
      nodes.push({
        ...base,
        id: m.id,
        name: m.case_id
          ? (caseTitle.get(m.case_id) || m.case_id)
          : topicShortName(m.topic_id, weekId),
        plot: m.plot?.cut ? null : (m.plot?.primary?.id || null),
        secondary: m.plot?.cut ? null : (m.plot?.secondary?.id || null),
        cut: m.plot?.cut ? (m.plot.reason || 'сюжет зрізано') : null,
        draft: m.status !== 'validated',
      });
    });
  });
  return nodes;
}

/**
 * Сцена одного сюжету: те, що показує зум після кліку по зорі.
 *
 * Свідомо НЕ віддає нічого з досьє ТЕМ: ні ваги, ні тону, ні цитат, ні метрик
 * (заборона 3 візуальної спеки). Сцена розповідає історію, дані лишаються в
 * досьє, і посилання між ними одне: topicId.
 */
export function plotScene(nodeId, weekId) {
  const w = getActiveWeek(weekId);
  if (!w || !nodeId) return null;
  const m = (depthProjection.markups || []).find((x) => x.id === nodeId && x.week === w.id);
  if (!m) {
    // Вузол без розмітки. Сцени в нього немає, і вигадувати її нема з чого, але
    // мовчати теж не можна: тиша поля це результат вимірювання, а не порожній
    // екран. Тому сцена отримує рівно те, що показує тултіп на полі.
    const t = getTopics(weekId).find((x) => x.id === nodeId);
    return t ? {
      id: t.id,
      topicId: t.id,
      subject: topicShortName(t.id, weekId),
      empty: true,
      reason: 'розмітки немає',
      draft: false,
    } : null;
  }
  const hostOf = new Map((w.cases || []).map((c) => [c.id, c.host_topic]));
  const caseTitle = new Map((w.cases || []).map((c) => [c.id, c.title]));
  const label = (kind, id) => (depthProjection.lenses?.[kind] || [])
    .find((x) => x.id === id)?.label || id;

  return {
    id: m.id,
    topicId: m.topic_id || hostOf.get(m.case_id) || null,
    subject: m.case_id
      ? (caseTitle.get(m.case_id) || m.case_id)
      : topicShortName(m.topic_id, weekId),
    draft: m.status !== 'validated',
    plot: m.plot?.cut
      ? { cut: m.plot.reason || 'сюжет зрізано' }
      : {
        id: m.plot.primary.id,
        title: label('plots', m.plot.primary.id),
        secondaryId: m.plot.secondary?.id || null,
        secondary: m.plot.secondary ? label('plots', m.plot.secondary.id) : null,
      },
    roles: m.roles?.cut
      ? { cut: m.roles.reason || 'ролі зрізано' }
      // Ліміт двох ролей з розділу 8 тримається тут, а не в сцені: сцена має
      // рівно дві орбіти, і третя роль не мала б куди сісти.
      : { items: (m.roles.items || []).slice(0, 2).map((x) => ({ role: label('roles', x.role_id), who: x.who })) },
    psychotypes: m.psychotypes?.cut
      ? { cut: m.psychotypes.reason || 'психотипи зрізано' }
      : {
        items: (m.psychotypes.items || []).map((x) => ({
          cluster: label('psychotypes', x.id),
          share: typeof x.share === 'number' ? x.share : null,
          method: x.method || null,
        })),
      },
    howToSpeak: (m.how_to_speak || []).map((h) => ({
      cluster: h.psychotype_id ? label('psychotypes', h.psychotype_id) : null,
      text: h.text,
    })),
    whatToAvoid: m.what_to_avoid || [],
  };
}

/** Довідник сюжетів для легенди шару. Тільки id і підпис, без тригерів. */
export function plotLegend() {
  return (depthProjection.lenses?.plots || []).map((p, i) => ({ ...p, index: i + 1 }));
}

/* ------------------------------------------------------------------ */
/* Шар ГРАВІТОН                                                         */
/* ------------------------------------------------------------------ */

/**
 * Поле шару ГРАВІТОН: тіла з розрахованими величинами, зшиті з контрактом.
 *
 * Проєкція тримає тільки розраховане (масу, резонанс, дистанцію, ентропію,
 * напіврозпад, тяжіння, залишок руху і вердикти), а назва, тон, тренд і
 * аудиторія приходять з контракту тижня тут: одне число, одне джерело.
 *
 * anyDraft означає, що хоч один резонанс спирається на розмітку-чернетку до
 * узгодження: сцена зобовʼязана нести бейдж, як і всі екрани глибинного шару.
 */
export function gravitonField(weekId) {
  const w = getActiveWeek(weekId);
  const week = gravitonProjection.weeks?.[w?.id];
  if (!w || !week) return { bodies: [], pairs: [], methods: gravitonProjection.methods || {}, anyDraft: false };
  const topics = new Map((w.topics || []).map((t) => [t.id, t]));
  const bodies = week.bodies.map((b) => {
    const t = topics.get(b.id) || {};
    return {
      ...b,
      name: topicShortName(b.id, w.id),
      fullName: t.name || b.id,
      tone: typeof t.tone_score === 'number' ? t.tone_score : null,
      trend: t.trend || null,
      aud: t.aud || 'both',
      salience: typeof t.salience === 'number' ? t.salience : null,
    };
  });
  return {
    bodies,
    pairs: week.pairs,
    methods: gravitonProjection.methods || {},
    anyDraft: bodies.some((b) => b.resonance?.draft),
  };
}

/** Паспорт одного тіла для панелі: те саме тіло плюс словник методів. */
export function gravitonBody(topicId, weekId) {
  const field = gravitonField(weekId);
  const body = field.bodies.find((b) => canonicalTopicId(b.id) === canonicalTopicId(topicId));
  if (!body) return null;
  const links = field.pairs
    .filter((p) => p.from === body.id || p.to === body.id)
    .map((p) => ({
      ...p,
      otherId: p.from === body.id ? p.to : p.from,
      otherName: topicShortName(p.from === body.id ? p.to : p.from, weekId),
      dir: p.from === body.id ? 'out' : 'in',
    }))
    .sort((a, b) => b.force - a.force);
  return { ...body, links, methods: field.methods };
}

/**
 * Розліт поля: як змінилась сигма індексу проти минулого тижня. Сигма вже
 * рахується в kamertonIndex, тут тільки дельта: поле розлітається чи
 * стискається як ціле.
 */
export function gravitonExpansion(weekId) {
  const cur = kamertonIndex(weekId);
  const prevId = prevWeekId(weekId);
  const prev = prevId ? kamertonIndex(prevId) : null;
  if (cur.sigma === null) return null;
  return {
    sigma: cur.sigma,
    delta: prev && prev.sigma !== null ? round(cur.sigma - prev.sigma, 1) : null,
    polarized: cur.polarized,
  };
}

export function precedentSignals(topicId, weekId) {
  const w = getActiveWeek(weekId);
  const cases = (w.cases || []).filter((c) => c.host_topic === topicId);
  return cases
    .map((c) => {
      const card = (w.precedents || []).find((p) => p.case_id === c.id);
      if (!card) return null;
      return {
        caseId: c.id,
        caseTitle: c.title,
        n: card.analogs?.length || 0,
        className: card.class_summary?.split(' -> ')[0] || 'клас не названо',
        status: card.status,
        pending: card.signature === 'pending',
      };
    })
    .filter(Boolean);
}

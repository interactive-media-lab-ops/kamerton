// КАМЕРТОН · шар ГРАВІТОН · формули фізико-натхненої моделі.
//
// Це МОДЕЛЬ, а не вимір: формули беруть структуру з фізики (гравітація,
// розпад, фазовий перехід), а величини з контракту тижня. Кожна функція
// повертає разом зі значенням і метод походження, бо продукт зобовʼязаний
// відрізняти виміряне від розміченого і від модельного на кожному екрані.
//
// Файл без залежностей навмисно, за зразком depth-block.js: ті самі формули
// потрібні білдеру (node), перевірці і продукту, а двох копій правил бути
// не може. Константи моделі живуть у config/thresholds.json (розділ graviton),
// сюди вони приходять аргументом.

export const METHOD = {
  measured: 'виміряно',
  marked: 'розмічено',
  model: 'модель',
};

/**
 * Метод походження кожної величини. Одне джерело для білдера (пише в
 * derived/graviton.json) і для екрана (читає звідти ж): рядок не живе в
 * кожному записі, бо він однаковий для всіх записів однієї величини.
 */
export const QUANTITY_METHOD = {
  mass: 'виміряно: вага уваги тижня',
  resonance: 'розмічено: глибинний шар',
  distance: 'модель: проксі v1 з виміряних компонент',
  entropy: 'виміряно: волатильність тону по треку',
  halfLife: 'модель: експонента по треку спаду',
  inertia: 'виміряно: тижні присутності',
  gravity: 'звʼязки виміряно, сила модельна',
  pairs: 'модель з виміряних компонент',
  residual: 'модель: факт мінус прогноз звʼязків',
  motion: 'виміряно: дельта до минулого тижня',
  force: 'модель: маса × резонанс / дистанція²',
  phaseRisk: 'модель: резонанс + дистанція + ріст ваги',
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Маса тіла: нормована вага уваги 0..1.
 * Це те саме salience 1..5, що задає розмір зорі на карті ТЕМ, і жодного
 * власного числа тут не заводиться: одна вага, одне джерело.
 */
export function bodyMass(salience) {
  if (typeof salience !== 'number') return null;
  return { value: round3(clamp(salience, 1, 5) / 5) };
}

/**
 * Резонанс: влучання теми в архетипний сюжет. Це СТАН з розмітки, а не число:
 * вигаданого відсотка «сили резонансу» в даних немає і не буде.
 *   none      розмітки немає (тему ще не слухали в цій лінзі)
 *   cut       сюжет зрізано: поле промовчало
 *   single    один сюжет
 *   contested два сюжети конкурують
 */
export function bodyResonance(markups) {
  const list = markups || [];
  if (!list.length) return { state: 'none', plot: null, draft: false };
  const withPlot = list.filter((m) => m.plot && !m.plot.cut && m.plot.primary);
  const draft = list.some((m) => m.status !== 'validated');
  if (!withPlot.length) return { state: 'cut', plot: null, draft };
  const top = withPlot.find((m) => m.topic_id) || withPlot[0];
  return {
    state: top.plot.secondary ? 'contested' : 'single',
    plot: top.plot.primary.id,
    // Другий сюжет конкуренції йде в проєкцію: «сюжети конкурують» без
    // відповіді «з ким» це половина розмітки.
    ...(top.plot.secondary ? { secondary: top.plot.secondary.id } : {}),
    draft,
  };
}

/** Числовий множник резонансу для формул сили. Модельне відображення стану. */
export function resonanceFactor(state) {
  return state === 'contested' ? 1 : state === 'single' ? 1 : state === 'cut' ? 0.25 : 0;
}

/**
 * Культурна дистанція до ядра, проксі v1 (рішення власника 18.08.2026:
 * обчислюваний проксі до появи ручної лінзи). 0 це ядро, 1 це периферія.
 * Компоненти виміряні або розмічені, ЗВАЖУВАННЯ модельне, тому метод «модель».
 */
export function bodyDistance({ resonanceState, aud, weeksPresent, weeksTotal }, cfg) {
  const res = resonanceState === 'single' || resonanceState === 'contested' ? 1
    : resonanceState === 'cut' ? 0.5 : 0;
  const audK = aud === 'both' ? 1 : 0;
  const dur = weeksTotal > 0 ? clamp(weeksPresent / weeksTotal, 0, 1) : 0;
  const closeness = cfg.distance_w_resonance * res
    + cfg.distance_w_aud * audK
    + cfg.distance_w_duration * dur;
  return {
    value: round3(clamp(1 - closeness, cfg.distance_floor, 1)),
    components: { resonance: res, aud: audK, duration: round3(dur) },
  };
}

/**
 * Ентропія: волатильність тону теми по її ж треку. Це вимір з історії, а не
 * оцінка: стандартне відхилення tone_score по тижнях присутності.
 * Менше двох точок чесно дає null: «не виміряно».
 */
export function bodyEntropy(toneTrack) {
  const xs = (toneTrack || []).filter((v) => typeof v === 'number');
  if (xs.length < 2) return null;
  const mean = xs.reduce((a, v) => a + v, 0) / xs.length;
  const varr = xs.reduce((a, v) => a + (v - mean) ** 2, 0) / xs.length;
  return { volatility: round3(Math.sqrt(varr)), points: xs.length };
}

/**
 * Період напіврозпаду: за скільки тижнів вага теми впала б удвічі, якби спад
 * тривав поточним темпом. Рахується ТІЛЬКИ на реальному спаді: беремо
 * найдовший хвіст треку ваги без зростань, вимагаємо мінімум точок і хоч один
 * справжній спад. Експонента по краях хвоста: lambda = ln(s0/s1)/(n-1).
 */
export function bodyHalfLife(salienceTrack, cfg) {
  const xs = (salienceTrack || []).filter((v) => typeof v === 'number');
  if (xs.length < cfg.min_halflife_points) return null;
  let start = xs.length - 1;
  while (start > 0 && xs[start - 1] >= xs[start]) start -= 1;
  const tail = xs.slice(start);
  if (tail.length < cfg.min_halflife_points) return null;
  const s0 = tail[0];
  const s1 = tail[tail.length - 1];
  if (!(s0 > s1) || s1 <= 0) return null;
  const lambda = Math.log(s0 / s1) / (tail.length - 1);
  return { weeks: round3(Math.LN2 / lambda), points: tail.length };
}

/**
 * Сила наративу: центральна формула шару, F = маса × резонанс / дистанція².
 * Структура закону тяжіння, величини з контракту і розмітки. Абсолют сенсу
 * не має, тому назовні йде значення, нормоване по тижню (робить білдер).
 * Тіло без резонансу дає нуль чесно: без зчеплення з архетипом ядро його
 * не тягне, хоч би яким великим воно було.
 */
export function narrativeForce(mass, resonanceState, distance) {
  if (mass === null || typeof distance !== 'number' || distance <= 0) return null;
  return (mass * resonanceFactor(resonanceState)) / (distance * distance);
}

/**
 * Ризик фазового переходу: коли кількість може стрибнути в якість і тема
 * стане метанаративом. Правило детерміноване і збігається з вердиктом
 * кандидата на верхньому щаблі:
 *   high     резонанс + дистанція нижче горизонту + вага росте
 *   moderate резонанс і одна з двох умов
 *   low      резонанс без обох умов
 *   none     резонансу немає: без зчеплення з архетипом переходу не буває
 */
export function phaseRisk({ resonanceState, distance, growing }, cfg) {
  const resonant = resonanceState === 'single' || resonanceState === 'contested';
  if (!resonant) return 'none';
  const near = distance <= cfg.candidate_max_distance;
  if (near && growing) return 'high';
  if (near || growing) return 'moderate';
  return 'low';
}

/**
 * Попарна дистанція для сили тяжіння: відстань у тоні плюс модельна база,
 * щоб сила лишалась скінченною при збігу тону.
 */
export function pairDistance(toneA, toneB, cfg) {
  const dt = typeof toneA === 'number' && typeof toneB === 'number'
    ? Math.abs(toneA - toneB) : 1;
  return cfg.pair_base_distance + dt;
}

/**
 * Сила тяжіння звʼязку: F = m1 * m2 * (1 + резонанс) / d².
 * Структура закону всесвітнього тяжіння, величини з контракту. Абсолютне
 * число сенсу не має, тому назовні йде тільки нормоване по тижню значення.
 */
export function pairForce(massA, massB, resFactorMax, dist) {
  if (massA === null || massB === null) return null;
  return (massA * massB * (1 + resFactorMax)) / (dist * dist);
}

/**
 * Модельний рух тону: куди тема мала б зсунутись за тиждень під видимими
 * звʼязками. Кожен звʼязок тягне до тону сусіда пропорційно своїй частці
 * сили, pull_k задає крок моделі за тиждень.
 */
export function predictedToneDelta(tone, pulls, cfg) {
  if (typeof tone !== 'number' || !pulls.length) return 0;
  const total = pulls.reduce((a, p) => a + p.force, 0);
  if (total <= 0) return 0;
  const drift = pulls.reduce((a, p) => a + (p.force / total) * (p.tone - tone), 0);
  return round3(cfg.pull_k * drift);
}

/**
 * Залишок «темної матерії»: фактичний рух мінус модельний. Великий залишок
 * означає або прихований драйвер у полі, або дірку в моделі, і продукт
 * показує його саме як питання, а не як факт.
 */
export function darkResidual(actualDelta, predictedDelta) {
  if (typeof actualDelta !== 'number') return null;
  return round3(actualDelta - predictedDelta);
}

// КАМЕРТОН · два сузірʼя над однією шкалою тону.
//
// Небо ділиться не лініями, а тяжінням: угорі сузірʼя ВІЙСЬКОВІ, внизу ЦИВІЛЬНІ,
// між ними просвіт для тем, що належать обом аудиторіям.
// Спільна для всіх горизонталь це тон: ліворуч деструктив, праворуч конструктив.
//
// Позиція теми задана даними:
//   X = tone_score з контракту
//   Y = вільна всередині свого сузірʼя, розсув тільки по вертикалі
// Жодних доріжок, рамок і ліній між кластерами.

import {
  getTopics, getExitedTopics, collectCases, toneWindow, topicShortName,
} from '../data/selectors.js';
import { MAP_LIMITS } from '../data/thresholds.js';

const MAX_PERMANENT_LABELS = MAP_LIMITS.max_permanent_labels;
const MAX_BRIGHT_NODES = MAP_LIMITS.max_bright_nodes;

function hash01(str, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export const AUD_LABEL = { mil: 'військові', civ: 'цивільні', both: 'обидві аудиторії' };

/** Два сузірʼя і просвіт між ними, у частках висоти неба. */
export const CLUSTERS = [
  { id: 'mil', label: 'ВІЙСЬКОВІ', from: 0, to: 0.44 },
  { id: 'both', label: null, from: 0.45, to: 0.55 },
  { id: 'civ', label: 'ЦИВІЛЬНІ', from: 0.56, to: 1 },
];

export const HORIZON_LABEL = 'ВИЙШЛИ З ПОЛЯ';

/** Мінімальний просвіт між сусідніми підписами смуги «вийшли з поля». */
const BAND_GAP = 12;

/** Три градації ядра. Домінанта тижня має бути безсумнівною здалеку. */
export function coreRadius(salience) {
  const s = typeof salience === 'number' ? salience : 3;
  if (s <= 2) return 8;
  if (s === 3) return 14;
  return 24;
}

export const TREND_MARK = {
  new: 'НОВА',
  up: '▲ росте',
  down: '▼ спадає',
  flat: 'стабільна',
  out: 'вийшла з поля',
};

function rimOf(kind) {
  if (kind === 'match') return 'solid';
  if (kind === 'conflict') return 'conflict';
  return 'single';
}

/**
 * Епістемічний статус теми для контуру вузла (C11).
 *
 * Це ДРУГИЙ вимір, не той самий, що кільце звірки джерел. Кільце каже, чи
 * сходяться джерела; контур каже, чим є саме твердження: фактом, оцінкою
 * чи гіпотезою. Плутати їх не можна, тому вони й малюються на різних радіусах.
 *
 * У контракті v1.4 поля epistemic_status у теми ще немає, і продукт де-факто
 * трактує всі теми як оцінку (див. epistemicCount нижче). Тому механізм читає
 * поле, якщо воно зʼявиться, а без нього чесно повертає 'assessment' замість
 * того, щоб вигадувати статус із трендів.
 */
export function epistemicOf(topic) {
  const s = topic?.epistemic_status;
  return s === 'fact' || s === 'hypothesis' ? s : 'assessment';
}

/**
 * buildScalefield: опис тем тижня без прив'язки до розміру екрана.
 * buildScalefield('2026-W31').stars.length -> 5
 */
export function buildScalefield(weekId) {
  const topics = getTopics(weekId);
  const cases = collectCases(weekId);

  const stars = topics.map((t) => {
    const moons = cases
      .filter((c) => c.host_topic === t.id)
      .map((c) => ({
        id: c.id,
        title: c.title,
        status: c.renderStatus,
        phase: hash01(c.id, 9) * Math.PI * 2,
        speed: 0.6 + hash01(c.id, 10) * 0.5,
      }));
    const cluster = CLUSTERS.some((c) => c.id === t.aud) ? t.aud : 'both';

    return {
      id: t.id,
      // Полотно малює тільки коротке імʼя з реєстру (B4): повні назви сягають
      // 68 символів і на карті існували лише як обрубок. Повне лишається у
      // fullName для тултіпа, списку тем і досьє.
      name: topicShortName(t.id, weekId),
      fullName: t.name,
      cluster,
      tone: t.tone,
      trend: t.trend,
      trendMark: TREND_MARK[t.trend] || '',
      aud: t.aud,
      audLabel: AUD_LABEL[t.aud] || '',
      note: t.note || null,
      rank: t.rank,
      sources: t.sources,
      verificationStatus: t.verificationStatus,
      salience: typeof t.salience === 'number' ? t.salience : null,
      toneScore: typeof t.tone_score === 'number' ? t.tone_score : 0,
      links: t.links || [],
      rim: rimOf(t.verificationTag.kind),
      epistemic: epistemicOf(t),
      // D3: скільки джерел покриває тему. Кільце малює саме стільки дуг.
      sourceCount: (t.verification?.sources || []).length || 1,
      radius: coreRadius(t.salience),
      dominant: (t.salience || 0) >= 4,
      moons,
      loud: t.trend === 'new',
      phase: hash01(t.id, 3) * Math.PI * 2,
      exited: false,
    };
  });

  const exitedTopics = getExitedTopics(weekId);
  const exited = exitedTopics.map((t, i) => ({
    id: t.id,
    name: topicShortName(t.id, weekId),
    fullName: t.name,
    cluster: 'out',
    tone: 'mixed',
    trend: 'out',
    trendMark: TREND_MARK.out,
    aud: null,
    audLabel: '',
    note: t.reason || null,
    salience: 1,
    toneScore: null,
    spread: exitedTopics.length === 1 ? 0.5 : i / (exitedTopics.length - 1),
    links: [],
    rim: 'single',
    radius: 6,
    dominant: false,
    moons: [],
    loud: false,
    phase: hash01(t.id, 5) * Math.PI * 2,
    exited: true,
  }));

  return { weekId, stars, exited, filaments: buildFilaments(stars) };
}

/**
 * layoutScalefield: перевід у пікселі.
 * rect = {x, y, w, h} робоча зона карти вже з відступами від країв.
 *
 * Знизу вгору: зона за горизонтом, лінія горизонту, вісь тону, небо з сузірʼями.
 * Вісь завжди має власне місце, тому підписи полюсів ніколи не обрізаються.
 */
export function layoutScalefield(field, rect, opts = {}) {
  const axisH = opts.axisH ?? 44;
  const horizonH = field.exited.length ? (opts.horizonH ?? 72) : 0;
  const skyH = Math.max(120, rect.h - axisH - horizonH);

  const sky = { x: rect.x, y: rect.y, w: rect.w, h: skyH };
  field.sky = sky;
  field.axis = { y: rect.y + skyH + axisH / 2, x1: rect.x, x2: rect.x + rect.w };
  field.horizon = horizonH
    ? { y: rect.y + skyH + axisH, height: horizonH, label: HORIZON_LABEL }
    : null;
  field.rect = rect;

  // Мапінг у спільне вікно корпусу, а не в теоретичні -1..+1:
  // так тижні лягають на одну лінійку і скупчення розправляється на всю ширину.
  const win = opts.window || toneWindow();
  field.window = win;

  // Порожній інтервал посеред поля це факт, і він лишається названим. Але шкала
  // через нього більше не рветься: стиснутий шов робив однакові кроки тону
  // різними за пікселями, і лінійка внизу починала брехати про відстань.
  // Тепер шкала рівна від краю до краю, а порожнеча просто видно як порожнечу
  // і підписана швом на своєму справжньому місці.
  field.breaks = opts.breaks || findBreaks(field.stars, win);
  field.breaks.forEach((b) => {
    b.padLo = 0;
    b.padHi = 0;
  });
  const map = makeToX(win, rect, []);
  field.toX = map.toX;
  field.scaleK = map.k;
  field.breaks.forEach((b) => {
    b.x = map.toX(b.lo);
    b.w = map.toX(b.hi) - b.x;
    b.mid = b.x + b.w / 2;
  });
  // Згин шкали. Коли панель забрала частину ширини, поле НЕ зменшується: зорі,
  // підписи і крок шкали лишаються тих самих пікселів, а нестача ширини
  // вибирається з порожнечі посеред поля. Ліва половина картини при цьому
  // не рухається взагалі, права підʼїжджає рівно на стільки, скільки забрала
  // панель. Повна шкала повертається, щойно панель закрили.
  const squeeze = Math.max(0, opts.squeeze || 0);
  field.fold = null;
  if (squeeze > 0 && field.breaks.length) {
    const widest = field.breaks.reduce((m, x) => (x.gap > m.gap ? x : m));
    const b = pickFold(widest.lo, widest.hi, squeeze, map.toX);
    const x0 = map.toX(b.lo);
    const x1 = map.toX(b.hi);
    const nat = x1 - x0;
    const amount = Math.min(squeeze, Math.max(0, nat - FOLD_MIN));
    if (amount > 1) {
      const base = map.toX;
      field.toX = (v) => {
        const x = base(v);
        if (x <= x0) return x;
        if (x >= x1) return x - amount;
        return x0 + ((x - x0) / nat) * (nat - amount);
      };
      field.fold = { lo: b.lo, hi: b.hi, x: x0, w: nat - amount, amount };
    }
  }
  field.usedW = rect.w - (field.fold?.amount || 0);
  field.axis.x2 = rect.x + field.usedW;

  const toX = field.toX;
  // Поділки рахуються з того самого мапінгу, що й зорі, тому лінійка і поле
  // не можуть розійтись: посунеться шкала, посунуться і числа під нею.
  // Розриви більше не виймають значень зі шкали: вона рівна, тому підписані
  // всі кроки підряд, і відстань між числами читається як відстань у тоні.
  field.ticks = toneTicks(win, field.fold ? [field.fold] : [], toX);

  field.clusters = CLUSTERS.map((c) => ({
    ...c,
    top: sky.y + c.from * sky.h,
    bottom: sky.y + c.to * sky.h,
    mid: sky.y + ((c.from + c.to) / 2) * sky.h,
  }));

  const byCluster = {};
  field.stars.forEach((s) => {
    s.tx = toX(s.toneScore);
    s.trueX = s.tx;
    (byCluster[s.cluster] = byCluster[s.cluster] || []).push(s);
  });

  // Мінімальна горизонтальна дистанція між центрами в одному сузірʼї.
  // Рухати X можна лише в межах допуску оцінки: далі шкала почне брехати,
  // тому решту розводить вертикаль. Допуск рахується в тому ж вікні, що й позиції.
  // допуск міряється в тому масштабі, в якому реально стоїть шкала:
  // після стиснення розривів піксель коштує більше тону, ніж до нього
  const maxNudge = (X_TOLERANCE / win.span) * rect.w * field.scaleK;
  Object.values(byCluster).forEach((list) => spreadX(list, maxNudge));

  // Стартова висота всередині сузірʼя: детермінована, але не в один рядок.
  Object.entries(byCluster).forEach(([id, list]) => {
    const c = field.clusters.find((x) => x.id === id);
    if (!c) return;
    const span = c.bottom - c.top;
    list.forEach((s) => {
      const k = list.length === 1 ? 0.5 : 0.2 + hash01(s.id, 21) * 0.6;
      s.ty = c.top + k * span;
    });
  });

  // Спершу вирішуємо, кому належить постійний підпис: від цього залежить,
  // скільки місця блок займає по вертикалі.
  markLabelModes(field.stars);

  // Розсув іде по всьому небу разом, а не окремо в кожному сузірʼї. Тема обох
  // аудиторій стоїть у просвіті між сузірʼями і б'ється підписом з обома сусідами;
  // поки кожне сузірʼя розводили окремо, ці пари ніхто не бачив, і саме вони
  // налазили на екрані. Смуга кластера лишається стартовою висотою, тримає небо.
  const bounds = { top: sky.y, bottom: sky.y + sky.h };
  separateY(field.stars, bounds);

  // Крапка це останній засіб, а не перший. Спершу пробуємо розвести всіх з
  // підписами; якщо небо скінчилось і пара все одно налазить, знімаємо підпис у
  // менш важливої з двох і розводимо ще раз. Так поле віддає рівно стільки
  // тексту, скільки вміщає, а не ховає теми наперед за грубим правилом.
  for (let pass = 0; pass < field.stars.length; pass++) {
    const clash = overlapToFix(field.stars);
    if (!clash) break;
    const [a, b] = clash;
    // Порядок жертв: спершу незахищені, і аж якщо неба не вистачило навіть на
    // домінанти, знімаємо підпис і в них. Накладені один на одного тексти гірші
    // за крапку: крапка лишає тему на карті з назвою в тултіпі, а каша не лишає
    // читабельним ні один підпис, ні другий.
    const rank = (s) => (s.labelMode === 'dot' ? 1e6 : 0) +
      (labelProtected(s) ? 1000 : 0) + labelPriority(s);
    const victim = rank(a) <= rank(b) ? a : b;
    victim.labelMode = 'dot';
    separateY(field.stars, bounds);
  }

  // Смуга «вийшли з поля» роздає слоти рівно по ширині, тому щойно тем стає
  // більше, ніж влазить підписів, тексти лягають один на одного. Правило тут те
  // саме, що й у полі: накладені підписи гірші за крапку, бо крапка лишає тему
  // на карті з назвою в тултіпі, а каша не лишає читабельним жодного підпису.
  // Смуга переходить у крапки цілком, а не наполовину: напівпідписана смуга
  // читається як збій рендера, а не як рішення.
  const bandSpan = rect.w * 0.68;
  const bandSlot = field.exited.length > 1
    ? bandSpan / (field.exited.length - 1)
    : bandSpan;
  const bandFits = field.exited.every((s) => (s.boxW ?? 0) + BAND_GAP <= bandSlot);
  field.exited.forEach((s) => {
    // згаслі теми не мають оцінки тону цього тижня, тому лягають рівно по смузі
    s.tx = rect.x + (0.16 + s.spread * 0.68) * rect.w;
    s.ty = field.horizon ? field.horizon.y + field.horizon.height * 0.55 : rect.y + rect.h;
    s.labelMode = bandFits ? 'full' : 'dot';
  });

  // центроїди сузірʼїв: до них тягнуться теми обох аудиторій
  const centro = (id) => {
    const list = byCluster[id] || [];
    if (!list.length) return null;
    return {
      x: list.reduce((a, s) => a + s.tx, 0) / list.length,
      y: list.reduce((a, s) => a + s.ty, 0) / list.length,
    };
  };
  field.centroids = { mil: centro('mil'), civ: centro('civ') };

  // Скупченість перераховуємо за кінцевими позиціями, але рішення про підпис
  // уже ухвалене вище і переглядати його не можна: другий виклик markLabelModes
  // повертав би підписи тим, у кого їх щойно зняли через брак місця.
  markCrowding(field.stars);

  return field;
}

/**
 * Підпис за винятком.
 *
 * У скупченні постійний підпис лишається тільки там, де він справді потрібен:
 * у домінант тижня і в нових тем. Решта стає крапкою-міткою, а назва живе
 * у тултіпі й у списку всіх тем у доку. Так скупчення читається як скупчення,
 * а не як стіна тексту, і жодна тема при цьому не зникає з екрана.
 */
function markCrowding(stars) {
  stars.forEach((s) => {
    const near = stars.filter(
      (o) => Math.hypot(o.tx - s.tx, o.ty - s.ty) <= CROWD_RADIUS
    ).length;
    // Поріг рахує саму зорю, тому near > 3 це «троє чужих поруч». Він піднятий
    // з двох після того, як підпис схуд до одного рядка без рядка аудиторії:
    // на старих габаритах троє сусідів справді робили стіну тексту, на нових ні.
    s.crowded = near > 3;
  });
}

function markLabelModes(stars) {
  markCrowding(stars);
  stars.forEach((s) => {
    s.labelMode = s.dominant || s.trend === 'new' || !s.crowded ? 'full' : 'dot';
  });

  // C3: дисципліна світіння. Досі світилось усе і завжди, тому «яскраве» не
  // означало нічого: коли світяться десять зір, жодна з них не нова і не важлива.
  // Тепер рівнів чотири, і верхній це дефіцит: bright дістається лише верхівці
  // за новизною і вагою, у межах ліміту з config/thresholds.json.
  const byGlow = stars
    .slice()
    .sort((a, b) => (b.trend === 'new' ? 1e3 : 0) + labelPriority(b)
      - ((a.trend === 'new' ? 1e3 : 0) + labelPriority(a)));
  byGlow.forEach((s, i) => {
    s.glow = i < MAX_BRIGHT_NODES ? (s.trend === 'new' || s.dominant ? 1 : 2) : 3;
  });

  // C5: постійних підписів на полотні не більше ліміту з config/thresholds.json.
  // Досі повний підпис отримувала кожна незатиснена тема, і на спокійному тижні
  // це давало десять однаково гучних назв, тобто жодного акценту. Тепер підписи
  // це дефіцитний ресурс: їх отримують найважчі і нові теми, решта живе крапкою,
  // а назва дістається наведенням і списком тем.
  const full = stars.filter((s) => s.labelMode === 'full');
  if (full.length > MAX_PERMANENT_LABELS) {
    full
      .slice()
      .sort((a, b) => labelPriority(b) - labelPriority(a))
      .slice(MAX_PERMANENT_LABELS)
      .forEach((s) => { s.labelMode = 'dot'; });
  }
}

/**
 * Домінанти тижня і нові теми підпис не втрачають ніколи: заради них це поле
 * й малюється. Якщо налазять саме вони, розводити доводиться геометрією.
 */
const labelProtected = (s) => Boolean(s.dominant) || s.trend === 'new';

/** Кого знімати першим серед незахищених. Більше число означає «тримати довше». */
function labelPriority(s) {
  return (s.salience ?? 1) * 10 + (s.trend === 'up' ? 5 : s.trend === 'down' ? 0 : 2);
}

/**
 * Перша пара, що налазить одна на одну і в якій ще є що зняти.
 *
 * Дивимось на всі зорі, включно з тими, що вже стали крапками: крапка теж займає
 * місце і теж може лягти на чужий підпис. Але пару з двох крапок пропускаємо,
 * бо знімати там більше нічого, і цикл на ній зациклився б.
 */
function overlapToFix(stars) {
  const vis = stars.filter((s) => !s.exited);
  for (let i = 0; i < vis.length; i++) {
    for (let j = i + 1; j < vis.length; j++) {
      const a = vis[i];
      const b = vis[j];
      if (a.labelMode === 'dot' && b.labelMode === 'dot') continue;
      if (Math.abs(a.tx - b.tx) >= (boxW(a) + boxW(b)) / 2) continue;
      if (boxTop(a) < boxBot(b) && boxBot(a) > boxTop(b)) return [a, b];
    }
  }
  return null;
}

const PAD_X = 18;
const PAD_Y = 10;

/** Мінімальна відстань між центрами зір одного сузірʼя по горизонталі. */
export const MIN_X_GAP = 60;
/** Наскільки дозволено посунути тему по шкалі, в одиницях tone_score. */
export const X_TOLERANCE = 0.06;
/** Радіус, у якому рахуємо скупченість для рішення про підпис. */
export const CROWD_RADIUS = 140;

/** Порожній інтервал, з якого шкала рветься, у частках ширини вікна. */
export const BREAK_FRACTION = 0.30;
/** Ширина смужки розриву в пікселях. */
export const BREAK_W = 48;
/** Скільки пікселів лишається у згині: менше і шов перестає читатись як шов. */
export const FOLD_MIN = 56;

/**
 * Вибір ділянки під згин.
 *
 * Нуль це орієнтир, по якому читається бік шкали, тому спершу пробуємо скласти
 * тільки ту половину порожнечі, що не накриває нуль. Якщо цієї половини не
 * вистачає на всю нестачу ширини, складаємо порожнечу цілком: краще втратити
 * підпис нуля, ніж випхати частину поля за край екрана.
 */
export function pickFold(lo, hi, squeeze, toPx, minPx = FOLD_MIN) {
  const room = (a, b) => Math.max(0, toPx(b) - toPx(a) - minPx);
  const spansZero = lo < 0 && hi > 0;
  if (spansZero) {
    const side = room(0, hi) >= room(lo, 0) ? [0, hi] : [lo, 0];
    if (room(side[0], side[1]) >= squeeze) return { lo: side[0], hi: side[1] };
  }
  return { lo, hi };
}
export const BREAK_LABEL = 'нейтральної середини немає · поле поляризоване';

/**
 * Розриви шкали, в одиницях тону.
 *
 * Порожнє місце між сусідніми темами це факт про поле, а не брак даних. Але
 * тримати під цей факт третину екрана марно: краще стиснути інтервал у шов
 * і назвати його. Рахуємо по оцінках, а не по пікселях: розрив не має
 * з'являтись від косметичного розведення міток.
 */
function findBreaks(stars, win) {
  const scores = stars
    .filter((s) => typeof s.toneScore === 'number')
    .map((s) => s.toneScore)
    .sort((a, b) => a - b);
  const min = BREAK_FRACTION * win.span;
  const out = [];
  for (let i = 0; i < scores.length - 1; i++) {
    const gap = scores[i + 1] - scores[i];
    // Підпис про поляризацію має право стояти тільки там, де порожнеча
    // накриває саму нейтраль. Розрив між двома деструктивними темами це
    // теж розрив, але казати про відсутню середину там було б неправдою.
    if (gap >= min) {
      out.push({ lo: scores[i], hi: scores[i + 1], gap, spansZero: scores[i] < 0 && scores[i + 1] > 0 });
    }
  }
  return out;
}

/** Кроки поділок, від дрібного до грубого. Беремо перший, що влазить. */
const TICK_STEPS = [0.1, 0.2, 0.25, 0.5];
/** Мінімальна відстань між підписаними поділками, щоб числа не злипались. */
export const TICK_MIN_PX = 54;

/**
 * toneTicks: поділки осі тону.
 *
 * Крок обирається під ширину: на вузькому екрані лінійка грубішає, а не
 * заростає числами. Поділка всередині розриву не ставиться взагалі: там шкали
 * фізично немає, і число в шві казало б, що вона є. Фільтр іде по ЗНАЧЕННЯХ,
 * а не по пікселях, бо шов розтягнутий і по пікселях межа розриву не вгадується.
 *
 * Краї вікна (-0.95, 0.8) не підписуються: це межі корпусу плюс поле, а не
 * межі шкали, і читались би як «максимальний деструктив».
 */
export function toneTicks(win, breaks, toX, minPx = TICK_MIN_PX) {
  const inBreak = (v) => (breaks || []).some((b) => v > b.lo && v < b.hi);
  for (const step of TICK_STEPS) {
    const out = [];
    const first = Math.ceil(win.lo / step) * step;
    for (let v = first; v <= win.hi + 1e-9; v += step) {
      const value = Math.round(v * 1000) / 1000;
      if (value <= win.lo || value >= win.hi) continue;
      if (inBreak(value)) continue;
      out.push({ v: value, x: toX(value), major: Math.abs(value) < 1e-9 });
    }
    const tight = out.some((t, i) => i > 0 && t.x - out[i - 1].x < minPx);
    if (!tight || step === TICK_STEPS[TICK_STEPS.length - 1]) return out;
  }
  return [];
}

/**
 * Кусково-лінійний мапінг тону в пікселі.
 *
 * До розриву, смужка, після розриву. Функція неперервна і монотонна, тому
 * через неї можна проганяти геть усе: зорі, підписи, стрілку камертона,
 * привида і гіпотезні зсуви. Без розривів це та сама лінійна шкала.
 */
function makeToX(win, rect, breaks) {
  const px = (d) => (d / win.span) * rect.w;
  // ширина розриву на екрані: сама смужка плюс місце під підписи сусідів
  const width = (b) => BREAK_W + (b.padLo || 0) + (b.padHi || 0);
  const eaten = breaks.reduce((a, b) => a + px(b.gap), 0);
  const kept = breaks.reduce((a, b) => a + width(b), 0);
  const k = breaks.length ? (rect.w - kept) / (rect.w - eaten) : 1;

  const toX = (score) => {
    let x = rect.x;
    let cur = win.lo;
    for (let i = 0; i < breaks.length; i++) {
      const b = breaks[i];
      if (score <= b.lo) break;
      x += px(b.lo - cur) * k;
      cur = b.lo;
      if (score <= b.hi) return x + ((score - b.lo) / b.gap) * width(b);
      x += width(b);
      cur = b.hi;
    }
    return x + px(score - cur) * k;
  };

  return { toX, k };
}

/**
 * Розсув по горизонталі в межах допуску оцінки.
 * Ітеративно розводить пари, ближчі за MIN_X_GAP, і не дає жодній темі
 * від'їхати від своєї істинної позиції далі, ніж на maxNudge.
 */
function spreadX(list, maxNudge) {
  if (list.length < 2 || maxNudge <= 0) return;
  for (let it = 0; it < 60; it++) {
    let moved = false;
    const order = list.slice().sort((a, b) => a.tx - b.tx || a.id.localeCompare(b.id));
    for (let i = 0; i < order.length - 1; i++) {
      const a = order[i];
      const b = order[i + 1];
      const gap = b.tx - a.tx;
      if (gap >= MIN_X_GAP) continue;
      const push = (MIN_X_GAP - gap) / 2;
      a.tx -= push;
      b.tx += push;
      moved = true;
    }
    list.forEach((s) => {
      s.tx = Math.min(s.trueX + maxNudge, Math.max(s.trueX - maxNudge, s.tx));
    });
    if (!moved) break;
  }
}

/** Крапка-мітка займає лише свою висоту, не висоту підпису. */
const labelH = (s) => (s.labelMode === 'dot' ? 14 : s.labelH ?? 49);
/** Крапка не має ширини підпису: вона займає рівно себе. */
const boxW = (s) => (s.labelMode === 'dot' ? s.radius * 2 : Math.max(s.radius * 2, s.boxW ?? 168));
/** Верх і низ блока зорі з урахуванням того, з якого боку висить підпис. */
const boxTop = (s) => s.ty - s.radius - (s.labelAbove ? labelH(s) : 0);
const boxBot = (s) => s.ty + s.radius + (s.labelAbove ? 0 : labelH(s));

/**
 * Розсув тільки по вертикалі всередині сузірʼя.
 *
 * Дві теми заважають одна одній, лише коли перетинаються по горизонталі.
 * Коли пара стоїть майже на одному X, двом блокам з підписами часто не вистачає
 * висоти сузірʼя. Тоді підпис однієї з них переїжджає над зорею: вертикальна
 * потреба падає майже вдвічі, а X лишається рівно там, куди його поклали дані.
 */
function separateY(list, cluster) {
  const overX = (a, b) => Math.abs(a.tx - b.tx) < (boxW(a) + boxW(b)) / 2 + PAD_X;

  // ланцюжки тем, що перетинаються по горизонталі: у ланцюжку підписи чергуються
  const order = list.slice().sort((a, b) => a.tx - b.tx || a.id.localeCompare(b.id));
  let chain = 0;
  order.forEach((s, i) => {
    const prev = order[i - 1];
    if (prev && overX(prev, s)) chain += 1;
    else chain = 0;
    s.labelAbove = chain % 2 === 1;
  });

  for (let it = 0; it < 140; it++) {
    let moved = false;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (!overX(a, b)) continue;
        const ca = (boxTop(a) + boxBot(a)) / 2;
        const cb = (boxTop(b) + boxBot(b)) / 2;
        const need = (boxBot(a) - boxTop(a) + boxBot(b) - boxTop(b)) / 2 + PAD_Y;
        const dy = cb - ca;
        const gap = need - Math.abs(dy);
        if (gap <= 0) continue;
        const push = (gap / 2) * Math.sign(dy || 1);
        a.ty -= push;
        b.ty += push;
        moved = true;
      }
    }
    list.forEach((s) => {
      const top = cluster.top + (s.ty - boxTop(s));
      const bottom = cluster.bottom - (boxBot(s) - s.ty);
      s.ty = bottom > top ? Math.min(bottom, Math.max(top, s.ty)) : (top + bottom) / 2;
    });
    if (!moved) break;
  }
}

/** Зважений за salience центр тону: те, що показує стрілка камертона. */
export function fieldCentroidScore(weekId) {
  const { stars } = buildScalefield(weekId);
  if (!stars.length) return null;
  let sw = 0;
  let sx = 0;
  stars.forEach((s) => {
    const w = s.salience || 1;
    sw += w;
    sx += s.toneScore * w;
  });
  return sw ? sx / sw : null;
}

export function centroidDrift(weekId, prevWeekId) {
  const score = fieldCentroidScore(weekId);
  if (score === null) return null;
  const prev = prevWeekId ? fieldCentroidScore(prevWeekId) : null;
  if (prev === null) return { score, prev: null, delta: null, direction: null };
  const delta = score - prev;
  return {
    score,
    prev,
    delta,
    direction:
      Math.abs(delta) < 0.01 ? 'без зсуву' : delta > 0 ? 'у конструктив' : 'у деструктив',
  };
}

/**
 * Філаменти: тільки названі у звітах звʼязки плюс тяжіння тем обох аудиторій
 * до обох сузірʼїв. Інших ліній на небі немає.
 */
function buildFilaments(stars) {
  const ids = new Set(stars.map((s) => s.id));
  const out = [];
  stars.forEach((s) => {
    // звʼязок у контракті це обʼєкт із причиною словами, не просто id
    (s.links || []).forEach((l) => {
      const to = typeof l === 'string' ? l : l.to;
      if (ids.has(to)) out.push({ kind: 'link', from: s.id, to, reason: l.reason || null });
    });
    if (s.cluster === 'both') {
      out.push({ kind: 'pull', from: s.id, toCluster: 'mil' });
      out.push({ kind: 'pull', from: s.id, toCluster: 'civ' });
    }
  });
  return out;
}

/**
 * Епістемічний рахунок тижня для верхньої смуги.
 *  ФАКТИ    цитати зі статусом fact і зафіксовані методологічні правила
 *  ОЦІНКИ   вердикт тижня і кожна тема
 *  ГІПОТЕЗИ прогнози, відкриті цього тижня, і важелі
 */
export function epistemicCount(week) {
  if (!week) return { fact: 0, assessment: 0, hypothesis: 0 };
  const quotes = (week.quotes || []).filter((q) => q.status === 'fact').length;
  const rules = (week.method_notes || []).length;
  const topics = (week.topics || []).length;
  const verdict = week.verdict?.editor_status === 'assessment' ? 1 : 0;
  const opened = (week.forecasts || []).filter((f) => f.opened === week.id).length;
  const levers = (week.levers || []).length;
  return {
    fact: quotes + rules,
    assessment: topics + verdict,
    hypothesis: opened + levers,
  };
}

/* ------------------------------------------------------------------ */
/* Плавний хід між тижневими зрізами (PLAY)                            */
/* ------------------------------------------------------------------ */

/**
 * Неперервний радіус ядра.
 *
 * `coreRadius` навмисно ступінчастий: три градації читаються здалеку і на них
 * стоять зафіксовані очікування розкладки. Але для плавного ходу ступінька
 * означала б стрибок, тому тут та сама шкала, проведена без розривів через ті
 * самі три опорні точки. Продуктова розкладка нею НЕ користується.
 */
export function coreRadiusSmooth(salience) {
  const s = typeof salience === 'number' ? salience : 3;
  if (s <= 2) return 8;
  if (s >= 4) return 24;
  if (s <= 3) return 8 + (s - 2) * 6;   // 2..3  ->  8..14
  return 14 + (s - 3) * 10;             // 3..4  -> 14..24
}

const lerp = (a, b, f) => a + (b - a) * f;

/**
 * Змішує два тижневі зрізи в проміжний стан.
 *
 * Навіщо: стрибок по тижнях це те саме, що клацнути W30, W31, W32 руками, і
 * сенсу в такому показі рівно стільки ж. Рух має бути один рівний, день за днем.
 *
 * Що інтерполюється: тільки числа, які й означають рух поля, тобто позиція теми
 * на шкалі тону і її вага. Усе інше (назви, статуси, тренди, примітки, супутники)
 * береться з ближчого зрізу цілим шматком. Причина проста: текст і статус не
 * мають проміжного стану, і «наполовину гіпотеза» це не оцінка, а брехня.
 *
 * Тема, якої в одному зі зрізів немає, не зʼявляється і не зникає стрибком: її
 * вага росте від нуля або спадає до нуля, тобто вона проступає і згасає.
 */
export function blendScalefields(a, b, f) {
  if (!a) return b;
  if (!b) return a;
  const t = Math.max(0, Math.min(1, f));
  const near = t < 0.5 ? a : b;

  const byId = (list) => new Map(list.map((s) => [s.id, s]));
  const aStars = byId(a.stars);
  const bStars = byId(b.stars);
  const ids = [...new Set([...a.stars.map((s) => s.id), ...b.stars.map((s) => s.id)])];

  const stars = ids.map((id) => {
    const sa = aStars.get(id);
    const sb = bStars.get(id);
    const base = { ...(t < 0.5 ? sa || sb : sb || sa) };

    // Тема тільки в одному зрізі: вага веде її від нуля або до нуля.
    // Радіус множиться на ту саму частку, інакше найменша градація ядра тримала
    // б вісім пікселів навіть у теми, якої в цьому кадрі вже фактично немає.
    if (!sa || !sb) {
      const grow = sb ? t : 1 - t;
      const sal = (base.salience ?? 3) * grow;
      return {
        ...base,
        salience: sal,
        radius: coreRadiusSmooth(sal) * grow,
        blendFade: grow,
      };
    }

    const sal = lerp(sa.salience ?? 3, sb.salience ?? 3, t);
    return {
      ...base,
      toneScore: lerp(sa.toneScore ?? 0, sb.toneScore ?? 0, t),
      salience: sal,
      radius: coreRadiusSmooth(sal),
      blendFade: 1,
    };
  });

  // Звʼязки перераховуються по змішаному полю, а не беруться з одного зрізу:
  // інакше нитка тягнулась би до теми, якої в цьому кадрі вже майже немає.
  return {
    weekId: near.weekId,
    stars,
    exited: near.exited,
    filaments: buildFilaments(stars),
  };
}

/**
 * Календарна вісь корпусу в днях, з опорою на середину кожного тижня.
 *
 * Тижневий зріз це підсумок семи днів, а не знімок понеділка, тому його чесне
 * місце на осі це середина періоду. Між серединами йде інтерполяція, а до
 * першої і після останньої стан тримається рівним: екстраполяція тут означала б
 * домалювати дані, яких немає.
 */
export function playTimeline(weeks) {
  const days = (iso) => {
    const ms = Date.parse(String(iso) + 'T00:00:00Z');
    // Мовчазний NaN тут дав би «Invalid time value» аж у підписі кадру, за три
    // шари від причини. Період тижня це сирі дати, а не рядок для перемикача.
    if (!Number.isFinite(ms)) throw new Error(`період тижня не є датою: ${iso}`);
    return Math.round(ms / 86400000);
  };
  const marks = weeks.map((w) => ({
    weekId: w.id,
    from: days(w.period.from),
    to: days(w.period.to),
    mid: (days(w.period.from) + days(w.period.to)) / 2,
  }));
  const first = marks[0];
  const last = marks[marks.length - 1];
  const total = last.to - first.from + 1;

  return {
    total,
    /** День за порядковим номером: який тиждень показувати панелям і яка суміш на карті. */
    at(i) {
      const d = first.from + Math.max(0, Math.min(total - 1, i));
      const host = marks.find((m) => d >= m.from && d <= m.to) || last;
      let lo = marks[0];
      for (const m of marks) if (m.mid <= d) lo = m;
      // Після середини останнього тижня наступної опори немає, і брати першу
      // означало б поїхати назад у часі: далі стан просто тримається рівним.
      const hi = marks.find((m) => m.mid >= d) || lo;
      const span = hi.mid - lo.mid;
      const f = span > 0 ? (d - lo.mid) / span : 0;
      return {
        dayIndex: i,
        date: new Date(d * 86400000).toISOString().slice(0, 10),
        weekId: host.weekId,
        fromWeek: lo.weekId,
        toWeek: hi.weekId,
        f,
      };
    },
  };
}

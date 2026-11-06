// КАМЕРТОН · рендер карти на canvas. Без залежностей, без React.
//
// Шар ТЕМИ це шкала тону: одна горизонтальна вісь від деструктиву до конструктиву,
// три доріжки аудиторій над нею і вузька смуга тем, що вийшли з поля.
// Ніякого вільного 2D-розкиду, оболонки поля, квадрантів і силових симуляцій.
//
// Шар АКТОРИ лишається двовимірним: там осі означають інше (позиція і активність).
//
// Мова карти не бойова: ні хрестів, ні променів, ні концентричних кілець.
// Кольори не зашиті: беруться з токенів Астролябії через getComputedStyle.

import { layoutScalefield, BREAK_LABEL } from './starfield.js';
import { layoutActorfield } from './actorfield.js';
import { MOTION } from '../data/thresholds.js';

/** '2026-W31' -> 'W31'. Мітка переходу читається людиною, тому коротка. */
const shortWeekId = (id) => 'W' + String(id).split('-W')[1];
/**
 * Актори без облич.
 *
 * Раніше тут був спрайт-аркуш згенерованих портретів (110 КБ на диску, ~148 КБ
 * у base64, тобто понад чверть усього бандла). Портрети порушували правило
 * «інституції і аудиторії не зображаються як реальні люди»: «Цивільна влада» і
 * «Військові (аудиторія)» це не людина, і обличчя приписувало їм індивідуальність,
 * якої в даних немає.
 *
 * Замість облич чотири геометрії за типом сутності. Гліф малюється штрихом у
 * кольорі тону, тими самими шестикутниками і без жодного зовнішнього ресурсу.
 */
const ACTOR_GLYPH = {
  // Інституція: будівля. Фронтон над трьома колонами з основою, замкнений контур.
  // Попередній портик без фронтону і без основи читався як драбина.
  institution(ctx, px, py, r) {
    const w = r * 0.66;
    const top = py - r * 0.46;
    const eave = py - r * 0.16;
    const bot = py + r * 0.42;
    ctx.beginPath();
    ctx.moveTo(px - w, eave);
    ctx.lineTo(px, top);
    ctx.lineTo(px + w, eave);
    ctx.closePath();
    ctx.moveTo(px - w * 1.12, bot);
    ctx.lineTo(px + w * 1.12, bot);
    for (const k of [-1, 0, 1]) {
      ctx.moveTo(px + k * w * 0.62, eave);
      ctx.lineTo(px + k * w * 0.62, bot);
    }
    ctx.stroke();
  },
  // Організована група: ланка. Три вузли, зʼєднані лініями. Вузли більші і
  // лінії товщі, ніж у першій версії: інакше читалось як абстрактний трикутник.
  group(ctx, px, py, r) {
    const d = r * 0.44;
    const pts = [[0, -d], [-d * 0.94, d * 0.6], [d * 0.94, d * 0.6]];
    ctx.beginPath();
    pts.forEach(([dx, dy], i) => (i ? ctx.lineTo(px + dx, py + dy) : ctx.moveTo(px + dx, py + dy)));
    ctx.closePath();
    ctx.stroke();
    pts.forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(px + dx, py + dy, r * 0.15, 0, Math.PI * 2);
      ctx.fill();
    });
  },
  // Аудиторія: три силуети людей у ряд. Тільки контур голови і плечей, БЕЗ рис
  // обличчя: правило 5 корпусу забороняє зображати аудиторії як реальних людей,
  // а wifi-дуги попередньої версії читались як «інтернет», а не як «люди».
  audience(ctx, px, py, r) {
    const step = r * 0.52;
    const head = r * 0.15;
    const y = py - r * 0.06;
    for (const k of [-1, 0, 1]) {
      const cx = px + k * step;
      ctx.beginPath();
      ctx.arc(cx, y, head, 0, Math.PI * 2);
      ctx.stroke();
      const sw = r * 0.26;
      ctx.beginPath();
      ctx.arc(cx, y + r * 0.44, sw, Math.PI, 0);
      ctx.stroke();
    }
  },
  // Підсилювач: рупор із двома дугами випромінювання. Впізнаваний мегафон,
  // а не абстрактна воронка: він множить чужий сигнал, а не породжує свій.
  amplifier(ctx, px, py, r) {
    const x0 = px - r * 0.58;
    const x1 = px - r * 0.05;
    const h = r * 0.42;
    ctx.beginPath();
    ctx.moveTo(x0, py - h * 0.42);
    ctx.lineTo(x1, py - h);
    ctx.lineTo(x1, py + h);
    ctx.lineTo(x0, py + h * 0.42);
    ctx.closePath();
    ctx.moveTo(x0, py - h * 0.42);
    ctx.lineTo(x0 - r * 0.16, py - h * 0.42);
    ctx.lineTo(x0 - r * 0.16, py + h * 0.42);
    ctx.lineTo(x0, py + h * 0.42);
    ctx.stroke();
    for (let i = 1; i <= 2; i++) {
      const rr = r * (0.24 + i * 0.2);
      ctx.beginPath();
      ctx.arc(x1, py, rr, -Math.PI * 0.36, Math.PI * 0.36);
      ctx.stroke();
    }
  },
};

const DPR_CAP = 2;
/** Місце внизу шару акторів під лінійку ставлення з числами. */
const ACTOR_AXIS_H = 34;

const TWEEN_MS = 800;
/** Переїзд поля на нову ширину, коли панель забрала місце: коротший за зміну тижня. */
const SLIDE_MS = 420;
const LAYER_MS = 280;       // шар, що приходить, виринає з глибини
const LAYER_OUT_MS = 240;   // шар, що йде, наближається і розчиняється
const LAYER_ZOOM_FROM = 0.94;
const LAYER_ZOOM_TO = 1.06;
const LAYER_STAGGER = 30;   // хвиля появи зір
const CINEMA_STAGGER = 60;  // хвиля появи підписів після заставки
const SHIFT_MS = 700;
const PULSE_MS = 950;
const EDGE = 24; // відступ від країв зони, щоб вісь і підписи не обрізались
const LABEL_MAX_W = 168;
const LINE_H = 13;
// Один гліф замість трьох крапок: вужчий на канві і не плутається з тире.
const ELLIPSIS = '…';

/**
 * C11 · граматика контуру вузла: суцільний факт, пунктирна оцінка, крапкова гіпотеза.
 * Єдина мова всієї лінійки, тому патерни живуть одним словником, а не літералами
 * у трьох місцях рендера.
 */
const EPISTEMIC_DASH = {
  fact: [],
  assessment: [5, 4],
  hypothesis: [1.5, 3.5],
};

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

function hexToRgb(hex) {
  const h = String(hex).trim().replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function readPalette(el) {
  const cs = getComputedStyle(el);
  const get = (n, f) => hexToRgb(cs.getPropertyValue(n).trim() || f);
  const raw = (n, f) => cs.getPropertyValue(n).trim() || f;
  return {
    bg: get('--a-bg', '#04100D'),
    dust: get('--a-dust', '#BFEFE0'),
    cyan: get('--a-cyan', '#63E6C8'),
    text: get('--a-text', '#D6EFE3'),
    mut: get('--a-text-mut', '#8FB4A6'),
    dim: get('--a-text-dim', '#557A6E'),
    line: get('--a-line', '#2C5A4F'),
    destructive: get('--a-destr', '#DB5B3C'),
    constructive: get('--a-constr', '#8FE39A'),
    mixed: get('--a-warn', '#E8A03C'),
    warn: get('--a-warn', '#E8A03C'),
    neb: [
      { c: get('--a-neb-1', '#1E6E63'), k: 1 },
      { c: get('--a-neb-4', '#0E3A31'), k: 1 },
      { c: get('--a-neb-1', '#1E6E63'), k: 0.8 },
      { c: get('--a-neb-3', '#6E4A1E'), k: 0.55 },
      { c: get('--a-neb-4', '#0E3A31'), k: 0.9 },
    ],
    mono: raw('--a-mono', 'monospace'),
    fsMap: parseInt(raw('--a-fs-map', '11px'), 10),
    fsMapSub: parseInt(raw('--a-fs-map-sub', '10px'), 10),
  };
}

export function createGalaxy(canvas, opts = {}) {
  const {
    onHover = () => {},
    onSelect = () => {},
    onSelectMoon = () => {},
    getInsets = () => ({ left: EDGE, right: EDGE, top: EDGE, bottom: EDGE }),
    // Скільки пікселів ширини карти зараз забрали відкриті панелі. Поле
    // розкладається так, ніби їх немає, і масштабується під те, що лишилось.
    getHiddenWidth = () => 0,
  } = opts;

  const ctx = canvas.getContext('2d', { alpha: false });
  const palette = readPalette(document.documentElement);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FONT = (px, w = '400') => `${w} ${px}px ${palette.mono}`;

  let W = 0;
  let H = 0;
  let dpr = 1;
  let raf = 0;
  let destroyed = false;

  const nebulaCanvas = document.createElement('canvas');
  const farCanvas = document.createElement('canvas');
  const MARGIN = 64;
  let midDust = [];
  let nearDust = [];

  let field = null;
  let stars = [];
  let filaments = [];
  let rect = { x: 0, y: 0, w: 0, h: 0 };
  let squeeze = 0;

  let actorField = null;
  let actors = [];
  let ties = [];

  let layer = 'topics';
  let layerFrom = 0;

  // стрілка камертона: тримаємо власний твін, щоб вона їхала по осі
  let needle = null; // {score, prev, direction}
  let needleFrom = 0;
  let needleCur = null;
  let needleTarget = null;
  // Піксельна точка старту стрілки: розрив шкали робить мапінг тижня власним,
  // тому той самий бал з минулого тижня стоїть на іншому місці. Твін ведемо
  // від того пікселя, де стрілка реально стояла, інакше вона стрибне.
  let needleXFrom = null;

  // Режим кіно: під час заставки поле показують голим, без підписів і осі,
  // а далі шар за шаром повертають. Стани: bare, labels, axis, null (звичайно).
  let cinema = null;
  let cinemaFrom = 0;

  let hovered = null;
  let hoveredMoon = null;
  // звʼязок під курсором і геометрія намальованих ліній для влучання
  let hoveredLink = null;
  let linkHits = [];
  let selected = null;
  let highlighted = null;

  // Два незалежні твіни, а не один спільний. Зорі й актори приходять двома
  // окремими викликами підряд (setScalefield, потім setActorfield), і поки прапорець
  // був спільним, перший виклик встигав перерахувати curX акторів по ще не
  // оновленому полю. Актор стартував з чужої точки, і рух читався як ривок.
  // D2: стан шлейфу часу. Живе поза кадром, бо шлейф належить ПЕРЕХОДУ між
  // тижнями, а не окремому вузлу.
  // Чи потребує кадр наступного: виставляється в render, читається в frame.
  // D5: привиди прогнозів. Порожня мапа означає режим ХРОНІКА.
  let ghosts = new Map();

  let renderBusy = false;

  /* ============ ДВА ГОДИННИКИ ПОЛЯ ============
     Супутники мусять обертатися навколо своїх зір і в спокої — це єдиний рух,
     який тут дозволений постійно, бо він показує, що в темі є живі кейси.
     Решта амбієнту (повзання туманності, мерехтіння пилу, дихання ореолів)
     у спокої стоїть: рух на цій карті означає рух ДАНИХ, і постійне ворушіння
     знецінює єдиний сигнал, який тут є (критерій фази D).

     Тому годинників два:
       · `now` — справжній час, по ньому живуть супутники;
       · `ambientT` — час амбієнту, він НАКОПИЧУЄТЬСЯ лише в кадрах, де на полі
         справді щось відбувається (твін, пульс, шлейф, зміна шару, заставка).
     У спокої ambientT стоїть, і туманність з пилом застигають на місці, хоч
     цикл кадрів і працює далі. Перша спроба просто не зупиняла цикл — і разом
     із супутниками поверталось усе, що фаза D свідомо прибрала. */
  let ambientT = 0;
  let ambientPrev = 0;
  let ambientLive = true;   // чи був рух у ПОПЕРЕДНЬОМУ кадрі

  let trailFrom = 0;
  let trailLabel = '';
  let trailLeadId = null;
  let trailWeek = null;

  let starTweenFrom = 0;
  let starTweenMs = TWEEN_MS;
  let starTweening = false;
  let actorTweenFrom = 0;
  let actorTweenMs = TWEEN_MS;
  let actorTweening = false;
  let pulseId = null;
  let pulseFrom = 0;
  let shiftFrom = 0;

  // модельні зсуви тем: {topicId: величина у одиницях тону}
  let topicShifts = {};
  let topicShiftFrom = 0;

  /* ---------- фон ---------- */

  function buildNebulae() {
    const c = nebulaCanvas;
    c.width = Math.max(1, Math.round((W + MARGIN * 2) * dpr));
    c.height = Math.max(1, Math.round((H + MARGIN * 2) * dpr));
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W + MARGIN * 2, H + MARGIN * 2);
    const rnd = mulberry32(20260731);
    const CW = W + MARGIN * 2;
    const CH = H + MARGIN * 2;

    // Туманності лягають по зміщеній сітці, а не куди впаде випадок:
    // порожнеча між сузірʼями має бути космосом, а не дірою в рендері.
    // Осередків рівно стільки, щоб плями перекривались і жодна клітинка
    // не лишилась чорною; зсув у межах клітинки прибирає відчуття сітки.
    const cols = Math.max(3, Math.round((CW / CH) * 2));
    const rows = 2;
    const cellW = CW / cols;
    const cellH = CH / rows;
    const r0 = Math.max(cellW, cellH) * 0.95;

    for (let ry = 0; ry < rows; ry++) {
      for (let rx = 0; rx < cols; rx++) {
        const { c: color, k } = palette.neb[(ry * cols + rx) % palette.neb.length];
        const cx = (rx + 0.5 + (rnd() - 0.5) * 0.5) * cellW;
        const cy = (ry + 0.5 + (rnd() - 0.5) * 0.5) * cellH;
        const r = r0 * (0.8 + rnd() * 0.45);
        const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, rgba(color, 0.15 * k));
        grad.addColorStop(0.24, rgba(color, 0.08 * k));
        grad.addColorStop(0.55, rgba(color, 0.03 * k));
        grad.addColorStop(1, rgba(color, 0));
        g.fillStyle = grad;
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  function buildFarDust() {
    const c = farCanvas;
    c.width = Math.max(1, Math.round((W + MARGIN * 2) * dpr));
    c.height = Math.max(1, Math.round((H + MARGIN * 2) * dpr));
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W + MARGIN * 2, H + MARGIN * 2);
    const rnd = mulberry32(880041);
    const n = Math.round(((W * H) / 9000) * 2.4);
    for (let i = 0; i < n; i++) {
      g.fillStyle = rgba(palette.dust, 0.09 + rnd() * 0.2);
      g.beginPath();
      g.arc(rnd() * (W + MARGIN * 2), rnd() * (H + MARGIN * 2), 0.3 + rnd() * 0.7, 0, Math.PI * 2);
      g.fill();
    }
  }

  function buildLiveDust() {
    const mk = (seed, n, rMin, rMax, aMin, aMax) => {
      const rnd = mulberry32(seed);
      return Array.from({ length: n }, () => ({
        x: rnd(), y: rnd(),
        r: rMin + rnd() * (rMax - rMin),
        a: aMin + rnd() * (aMax - aMin),
        ph: rnd() * Math.PI * 2,
        sp: 0.4 + rnd() * 1.3,
      }));
    };
    const area = (W * H) / 9000;
    midDust = mk(5150, Math.round(area * 0.9), 0.5, 1.1, 0.16, 0.38);
    nearDust = mk(9902, Math.round(area * 0.36), 0.8, 1.7, 0.24, 0.58);
  }

  /* ---------- підписи ---------- */

  function wrapText(text, maxW) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    words.forEach((w) => {
      const probe = line ? line + ' ' + w : w;
      if (ctx.measureText(probe).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = probe;
    });
    if (line) lines.push(line);
    return lines;
  }

  /**
   * Назва до двох рядків, далі еліпсис. Повна назва живе в досьє.
   *
   * Ріжемо по межі слова: обрубок посеред слова читається як помилка даних,
   * а не як скорочення. Посимвольний трим лишається запасним шляхом на випадок,
   * коли перше слово саме ширше за дозволену ширину.
   */
  function clampLines(text, maxW, maxLines = 2) {
    const lines = wrapText(text, maxW);
    if (lines.length <= maxLines) return lines;
    const kept = lines.slice(0, maxLines);
    const whole = kept[maxLines - 1];
    let last = whole;
    while (last.length > 1 && ctx.measureText(last + ELLIPSIS).width > maxW) {
      last = last.slice(0, -1);
    }
    // Відкочуємось до межі слова тільки якщо трим справді щось відрізав:
    // рядок, який і так вліз разом з еліпсисом, не має втрачати ціле слово.
    if (last !== whole) {
      const cut = last.lastIndexOf(' ');
      if (cut > 0) last = last.slice(0, cut);
    }
    kept[maxLines - 1] = last.replace(/[\s,;:]+$/, '') + ELLIPSIS;
    return kept;
  }

  function measureBoxes(list) {
    ctx.font = FONT(palette.fsMap, '700');
    list.forEach((s) => {
      // Два рядки назви коштують місця, тому їх отримують тільки ті, кого читають
      // першими: домінанти тижня і нові теми. Решті лишається один рядок, а повна
      // назва живе в тултіпі, у списку тем і в досьє.
      const roomy = s.dominant || s.trend === 'new';
      s.lines = clampLines(s.name, LABEL_MAX_W, roomy ? 2 : 1);
      const textW = Math.max(...s.lines.map((l) => ctx.measureText(l).width), 0);
      s.boxW = Math.max(s.radius * 2, textW);
      // Рядок «аудиторія · динаміка» більше не стоїть під кожною зорею: аудиторію
      // каже сузірʼя, динаміку каже ЗРІЗ, а під курсором рядок повертається.
      // Місця під нього в коробці не резервуємо, інакше поле лишиться таким же тісним.
      s.labelH = 10 + s.lines.length * LINE_H;
      s.boxH = s.radius * 2 + s.labelH;
    });
  }

  /* ---------- зона і розкладка ---------- */

  /**
   * Логічна рама поля і масштаб, яким вона лягає на канвас.
   *
   * Поле завжди розкладається в раму тієї ширини, яку карта має з закритими
   * панелями. Коли панель відкривається, канвас вужчає, і та сама, вже готова
   * картина просто масштабується, а не перебудовується. Це принципово: інакше
   * від самого лише відкриття досьє зорі міняли сусідів, підписи то зникали, то
   * поверталися, і читач бачив рух там, де в даних нічого не сталось.
   */
  function computeRect() {
    const ins = getInsets() || {};
    const l = Math.max(EDGE, ins.left ?? EDGE);
    const r = Math.max(EDGE, ins.right ?? EDGE);
    const t = Math.max(EDGE, ins.top ?? EDGE);
    const b = Math.max(EDGE, ins.bottom ?? EDGE);
    // Масштаб завжди один: зоря, підпис і крок шкали мають читатись однаково
    // незалежно від того, скільки панелей відкрито. Нестача ширини вибирається
    // не зменшенням картини, а згином шкали в порожньому місці поля.
    squeeze = Math.max(0, getHiddenWidth() || 0);
    rect = {
      x: l,
      y: t,
      w: Math.max(120, W + squeeze - l - r),
      h: Math.max(120, H - t - b),
    };
  }

  function applyLayout() {
    computeRect();
    if (field) {
      measureBoxes([...field.stars, ...field.exited]);
      layoutScalefield(field, rect, { squeeze });
    }
    if (actorField) {
      measureBoxes(actorField.nodes);
      layoutActorfield(actorField, rect, { axisH: ACTOR_AXIS_H, squeeze });
    }
  }

  /* ---------- дані ---------- */

  function setGhosts(list) {
    ghosts = new Map((list || []).map((g) => [g.topicId, g]));
    render(performance.now());
    kick();
  }

  // opts.tweenMs: плавний хід PLAY подає новий стан щодня, і твін мусить
  // закінчуватись рівно тоді, коли приходить наступний день. Інакше зірка
  // доїжджає і завмирає, а рух читається як тремтіння, а не як хід.
  function setScalefield(next, drift, opts) {
    needleXFrom = field?.needleX ?? null;
    field = next;
    needle = drift || null;
    needleTarget = drift ? drift.score : null;
    if (needleCur === null) needleCur = needleTarget;
    needleFrom = performance.now();
    applyLayout();

    const incoming = [...field.stars, ...field.exited];
    const out = [];
    incoming.forEach((s) => {
      const prev = stars.find((p) => p.id === s.id && !p.dying);
      out.push({
        ...s,
        fromX: prev ? prev.curX ?? s.tx : s.tx,
        fromY: prev ? prev.curY ?? s.ty : s.ty,
        fromR: prev ? prev.curR ?? s.radius : s.radius * 0.4,
        fromA: prev ? prev.curA ?? 1 : 0,
        // blendFade ставить плавний хід PLAY: тема, якої в сусідньому зрізі
        // немає, проступає і згасає, а не вимикається кадром.
        toA: s.exited ? 0.45 : (typeof s.blendFade === 'number' ? s.blendFade : 1),
        dying: false,
      });
    });
    stars.forEach((p) => {
      if (p.dying || incoming.find((s) => s.id === p.id)) return;
      out.push({ ...p, fromX: p.curX ?? p.tx, fromY: p.curY ?? p.ty, fromR: p.curR ?? p.radius, fromA: p.curA ?? 1, toA: 0, dying: true });
    });

    stars = out;
    filaments = field.filaments || [];
    starTweenFrom = performance.now();
    starTweenMs = opts?.tweenMs > 0 ? opts.tweenMs : TWEEN_MS;
    starTweening = true;

    // D2: шлейф вмикається тільки коли справді змінився тиждень, і тільки якщо
    // попередній відомий. Перше завантаження слідів не лишає: нема від чого.
    const prevWeek = trailWeek;
    trailWeek = field.weekId || null;
    if (prevWeek && trailWeek && prevWeek !== trailWeek && !reduced) {
      trailFrom = performance.now();
      trailLabel = `${shortWeekId(prevWeek)} -> ${shortWeekId(trailWeek)}`;
      // Мітку несе вузол з найбільшим зсувом: один підпис на перехід.
      let lead = null;
      let best = 0;
      out.forEach((s) => {
        if (s.dying || !Number.isFinite(s.fromX)) return;
        const d = Math.hypot(s.tx - s.fromX, s.ty - s.fromY);
        if (d > best) { best = d; lead = s.id; }
      });
      trailLeadId = best > 6 ? lead : null;
    } else {
      trailFrom = 0;
      trailLabel = '';
      trailLeadId = null;
    }

    if (reduced) settleTween();
    render(performance.now());
    kick();
  }

  function setActorfield(next) {
    actorField = next;
    applyLayout();
    const out = [];
    actorField.nodes.forEach((n) => {
      const prev = actors.find((p) => p.id === n.id && !p.dying);
      out.push({
        ...n,
        shift: prev ? prev.shift || 0 : 0,
        shiftFromVal: prev ? prev.shift || 0 : 0,
        shiftTarget: 0,
        fromX: prev ? prev.curX ?? n.tx : n.tx,
        fromY: prev ? prev.curY ?? n.ty : n.ty,
        // радіус росте й спадає разом з активністю, тому теж їде, а не клацає
        fromR: prev ? prev.curR ?? n.radius : n.radius * 0.4,
        fromA: prev ? prev.curA ?? 1 : 0,
        toA: 1,
        dying: false,
      });
    });
    actors.forEach((p) => {
      if (p.dying || actorField.nodes.find((n) => n.id === p.id)) return;
      out.push({
        ...p,
        fromX: p.curX ?? p.tx, fromY: p.curY ?? p.ty, fromR: p.curR ?? p.radius,
        fromA: p.curA ?? 1, toA: 0, dying: true,
      });
    });
    // Звʼязки на час переїзду тримаємо старі й нові разом: інакше лінія зникає
    // в кадрі нуль, а вузли ще їдуть, і видно рух без причини.
    const keep = new Set(actors.map((a) => a.id));
    const nextTies = actorField.ties || [];
    ties = [
      ...nextTies,
      ...ties.filter(
        (t) => keep.has(t.from) && keep.has(t.to) &&
          !nextTies.some((n) => n.from === t.from && n.to === t.to)
      ),
    ];
    actors = out;
    actorTweenFrom = performance.now();
    actorTweenMs = TWEEN_MS;
    actorTweening = true;
    if (reduced) settleTween();
    render(performance.now());
    kick();
  }

  /**
   * setTopicShifts: модельний зсув тем по шкалі тону.
   * Реальна позиція лишається привидом, зсув малюється пунктиром.
   * Порожня мапа скидає моделювання.
   */
  function setTopicShifts(map) {
    stars.forEach((s) => {
      s.shiftFromVal = s.shiftCur || 0;
      s.shiftTarget = (map && map[s.id]) || 0;
    });
    topicShifts = map || {};
    topicShiftFrom = performance.now();
    render(performance.now());
    kick();
  }

  function setActorShifts(map) {
    actors.forEach((a) => {
      a.shiftFromVal = a.shift || 0;
      a.shiftTarget = (map && map[a.id]) || 0;
    });
    shiftFrom = performance.now();
    render(performance.now());
    kick();
  }

  function settleTween() {
    stars.forEach((s) => { s.curX = s.tx; s.curY = s.ty; s.curR = s.radius; s.curA = s.toA ?? 1; });
    stars = stars.filter((s) => !s.dying);
    actors.forEach((a) => {
      a.curX = a.tx; a.curY = a.ty; a.curR = a.radius; a.curA = a.toA ?? 1;
      a.shift = a.shiftTarget || 0;
    });
    actors = actors.filter((a) => !a.dying);
    ties = actorField?.ties || ties;
    needleCur = needleTarget;
    starTweening = false;
    actorTweening = false;
  }

  function setLayer(next) {
    if (next === layer) return;
    layer = next;
    layerFrom = performance.now();
    hovered = null;
    hoveredMoon = null;
    render(performance.now());
    kick();
  }

  /**
   * Режим кіно.
   *  bare    тільки зорі: ні підписів, ні осі, ні шва, ні ниток
   *  labels  підписи проступають хвилею по 60ms на зорю
   *  axis    плюс вісь, шов, опори, сузірʼя і стрілка
   *  null    звичайна карта
   */
  function setCinema(mode) {
    if (cinema === mode) return;
    cinema = mode;
    cinemaFrom = performance.now();
    stars.forEach((s, i) => { s._ci = i; });
    render(performance.now());
    kick();
  }

  /** Непрозорість підпису зорі в режимі кіно, з хвилею появи. */
  function cinemaLabel(s) {
    if (!cinema) return 1;
    if (cinema === 'bare') return 0;
    const p = (performance.now() - cinemaFrom - (s._ci || 0) * CINEMA_STAGGER) / 300;
    return clamp01(p);
  }

  const setSelected = (id) => { selected = id; kick(); if (reduced) render(performance.now()); };
  const setHighlight = (id) => { highlighted = id; kick(); if (reduced) render(performance.now()); };
  const pulse = (id) => { pulseId = id; pulseFrom = performance.now(); render(performance.now()); kick(); };

  /* ---------- шар ТЕМИ ---------- */

  /**
   * Сузірʼя: власна ледь помітна туманність навколо своїх зір і розріджена назва,
   * як на зоряних мапах. Жодних рамок і ліній між кластерами.
   */
  /**
   * Вертикаль шару тем: аудиторія, а не величина.
   *
   * У акторів вертикаль це шкала активності з поділками, тому на карті тем
   * бракувало відповіді, по чому там йде висота. Відповідь така: ні по чому
   * вимірюваному. Висота тут ділить поле на три смуги за адресою теми, і
   * підписати її треба саме так, а не поділками, яких у неї немає.
   */
  function drawAudienceAxis(la) {
    if (!field?.clusters || !field.sky) return;
    const x = rect.x + 10;
    ctx.save();
    ctx.globalAlpha = la;

    field.clusters.forEach((c, i) => {
      if (i > 0) {
        ctx.strokeStyle = rgba(palette.line, 0.1);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(rect.x, c.top);
        ctx.lineTo(rect.x + field.usedW, c.top);
        ctx.stroke();
      }
    });

    ctx.save();
    ctx.translate(x - 8, field.sky.y + field.sky.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = FONT(palette.fsMapSub, '400');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgba(palette.dim, 0.45);
    ctx.fillText('А У Д И Т О Р І Я   ·   н е   в е л и ч и н а', 0, 0);
    ctx.restore();
    ctx.restore();
  }

  function drawConstellations(la) {
    if (!field?.clusters) return;
    ctx.save();
    ctx.globalAlpha = la;

    field.clusters.forEach((c) => {
      if (!c.label) return;
      const own = stars.filter((s) => s.cluster === c.id && (s.curA ?? 0) > 0.05);
      if (!own.length) return;

      const xs = own.map((s) => s.curX);
      const ys = own.map((s) => s.curY);
      const cx = xs.reduce((a, v) => a + v, 0) / xs.length;
      const cy = ys.reduce((a, v) => a + v, 0) / ys.length;
      const spanX = Math.max(...xs) - Math.min(...xs);
      const spanY = Math.max(...ys) - Math.min(...ys);
      const rx = Math.max(200, spanX / 2 + 190);
      const ry = Math.max(90, spanY / 2 + 120);

      // туманність-ореол сузірʼя
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, rgba(palette.neb[0].c, 0.16));
      g.addColorStop(0.5, rgba(palette.neb[0].c, 0.06));
      g.addColorStop(1, rgba(palette.neb[0].c, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Назва сузірʼя стоїть над центром ваги власних зір, а не десь у порожнечі:
      // так вона називає саме це скупчення. Перекриття з підписом теми
      // розводиться тільки вертикально, щоб назва не з'їжджала від своїх зір.
      ctx.font = FONT(Math.round(palette.fsMap * 2.4), '700');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const text = c.label.split('').join('  ');
      const halfW = ctx.measureText(text).width / 2;
      const y = freeLabelY(cx, cy - 60, halfW, palette.fsMap * 1.6);
      // На межі видимості назва не працює навіть боковим зором. 0.06 від
      // кольору тексту дає близько 5% світлості над фоном: літери читаються,
      // але не сперечаються з назвами тем.
      ctx.fillStyle = rgba(palette.text, 0.06);
      ctx.fillText(text, cx, y);
    });

    ctx.restore();
  }

  /**
   * Висота для назви сузірʼя: рухаємось тільки по вертикалі, поки текст
   * не перестане накривати підписи тем. Спершу вгору, потім, якщо вгорі
   * місця немає, вниз.
   */
  function freeLabelY(cx, wantY, halfW, halfH) {
    const hits = (y) =>
      stars.some((s) => {
        if ((s.curA ?? 0) < 0.05) return false;
        const sw = (s.labelMode === 'dot' ? s.radius * 2 : s.boxW || s.radius * 2) / 2;
        const top = s.curY - s.radius - (s.labelAbove ? s.labelH || 49 : 0);
        const bot = s.curY + s.radius + (s.labelAbove ? 0 : s.labelH || 49);
        return (
          Math.abs(s.curX - cx) < sw + halfW &&
          y + halfH > top &&
          y - halfH < bot
        );
      });

    if (!hits(wantY)) return wantY;
    for (let k = 1; k <= 8; k++) {
      const up = wantY - k * 16;
      if (up - halfH > rect.y && !hits(up)) return up;
    }
    for (let k = 1; k <= 8; k++) {
      const down = wantY + k * 16;
      if (down + halfH < rect.y + rect.h && !hits(down)) return down;
    }
    return wantY;
  }

  /** Край неба: за горизонтом лежать теми, що згасли. */
  function drawHorizon(la) {
    const h = field?.horizon;
    if (!h) return;
    ctx.save();
    ctx.globalAlpha = la;

    const grad = ctx.createLinearGradient(0, h.y, 0, h.y + h.height);
    grad.addColorStop(0, rgba(palette.line, 0.12));
    grad.addColorStop(1, rgba(palette.line, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(rect.x, h.y, rect.w, h.height);

    ctx.strokeStyle = rgba(palette.line, 0.45);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rect.x, h.y);
    ctx.lineTo(rect.x + rect.w, h.y);
    ctx.stroke();

    ctx.font = FONT(palette.fsMapSub, '700');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = rgba(palette.dim, 0.55);
    ctx.fillText(h.label.split('').join(' '), rect.x, h.y + 7);
    ctx.restore();
  }

  /** Головна вісь тону: градієнтна лінія з підписами полюсів. */
  function drawAxis(la) {
    if (!field?.axis) return;
    const a = field.axis;
    ctx.save();
    ctx.globalAlpha = la;

    // Градієнт мапиться на вікно, а не на теоретичні -1..+1: нейтраль стоїть
    // там, де вона справді опиняється при цьому масштабі.
    // Позиція нуля береться з того самого мапінгу, що й зорі: після стиснення
    // розриву лінійна частка збрехала б.
    const zeroT = (field.toX(0) - a.x1) / (a.x2 - a.x1);
    const grad = ctx.createLinearGradient(a.x1, 0, a.x2, 0);
    grad.addColorStop(0, rgba(palette.destructive, 0.9));
    if (zeroT > 0.02 && zeroT < 0.98) grad.addColorStop(zeroT, rgba(palette.dim, 0.4));
    grad.addColorStop(1, rgba(palette.constructive, 0.9));
    ctx.fillStyle = grad;
    ctx.fillRect(a.x1, a.y - 1.5, a.x2 - a.x1, 3);

    // Поділки: лінійка під смугою, щоб було видно не тільки бік, а й наскільки.
    // Числа читаються як тон теми: -0.5 це половина шляху до чистого деструктиву.
    // Шкала рівна, тому крок між числами скрізь однаковий і в тоні, і в пікселях.
    ctx.font = FONT(palette.fsMapSub, '400');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    (field.ticks || []).forEach((t) => {
      const strong = t.major;
      ctx.strokeStyle = rgba(palette.dim, strong ? 0.75 : 0.32);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(t.x, a.y - (strong ? 9 : 4));
      ctx.lineTo(t.x, a.y + (strong ? 7 : 5));
      ctx.stroke();
      ctx.fillStyle = rgba(palette.dim, strong ? 0.8 : 0.5);
      ctx.fillText(t.major ? '0' : String(t.v), t.x, a.y + 9);
    });

    // Полюси перемістились над лінію: під нею тепер живуть числа, і два рівні
    // підписів в одному рядку читались би як один.
    ctx.font = FONT(palette.fsMapSub, '700');
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillStyle = rgba(palette.destructive, 0.85);
    ctx.fillText('Д Е С Т Р У К Т И В', a.x1, a.y - 8);
    ctx.textAlign = 'right';
    ctx.fillStyle = rgba(palette.constructive, 0.85);
    ctx.fillText('К О Н С Т Р У К Т И В', a.x2, a.y - 8);

    // Знак згину: шкала рівна, поки поле ціле, і складається рівно там, де
    // порожньо, коли панель забрала ширину. Читач бачить, що шматок шкали
    // складено, а не що поле змінилось.
    if (field.fold) drawFoldMark(a.y, field.fold);
    ctx.restore();
  }

  /**
   * Знак згину шкали: дві косі риски там, де шматок осі складено.
   *
   * Малюється тільки коли панель забрала ширину. Це чесна ознака: шкала тут
   * перервана, тому відстань через цей шов не читається як відстань у тоні.
   * Закрив панель, згин зник, лінійка знову рівна від краю до краю.
   */
  function drawFoldMark(y, fold) {
    const mid = fold.x + fold.w / 2;
    ctx.fillStyle = rgba(palette.bg, 1);
    ctx.fillRect(mid - 11, y - 6, 22, 12);
    ctx.strokeStyle = rgba(palette.dim, 0.9);
    ctx.lineWidth = 1.5;
    [-4, 4].forEach((off) => {
      ctx.beginPath();
      ctx.moveTo(mid + off - 4, y + 7);
      ctx.lineTo(mid + off + 4, y - 7);
      ctx.stroke();
    });
  }

  /** Класичний знак розриву осі: лінія переривається, дві косі риски навскіс. */
  function drawAxisBreaks(a) {
    (field?.breaks || []).forEach((b) => {
      ctx.fillStyle = rgba(palette.bg, 1);
      ctx.fillRect(b.mid - 10, a.y - 5, 20, 10);
      ctx.strokeStyle = rgba(palette.dim, 0.9);
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      [-4, 2].forEach((off) => {
        ctx.beginPath();
        ctx.moveTo(b.mid + off - 3, a.y + 7);
        ctx.lineTo(b.mid + off + 3, a.y - 7);
        ctx.stroke();
      });
    });
  }

  /**
   * Осі шару АКТОРИ: горизонталь це ставлення, вертикаль це активність.
   *
   * До цього шар не мав жодної осі, і положення фігури нічого не означало для
   * читача, хоч і означало для даних. Лінійка тут та сама, що в тем за виглядом,
   * але шкала інша й чесно інша: у акторів рівні -1..+1 без розривів, бо їх
   * розставляє не корпус, а оцінка аналітика.
   */
  function drawActorAxis(la) {
    const f = actorField;
    if (!f?.axis || !f.lanes) return;
    const a = f.axis;
    ctx.save();
    ctx.globalAlpha = la;

    // Смуги активності: ледь помітні лінії-орієнтири, щоб було по чому читати
    // вертикаль. Вони мають бути слабші за найтьмянішу зорю, інакше сітка
    // почне сперечатися з даними.
    ctx.strokeStyle = rgba(palette.line, 0.13);
    ctx.lineWidth = 1;
    ctx.font = FONT(palette.fsMapSub, '400');
    ctx.textBaseline = 'middle';
    f.lanes.forEach((lane, i) => {
      if (i > 0) {
        ctx.beginPath();
        ctx.moveTo(a.x, lane.top);
        ctx.lineTo(a.x + a.w, lane.top);
        ctx.stroke();
      }
      ctx.textAlign = 'right';
      ctx.fillStyle = rgba(palette.dim, 0.42);
      ctx.fillText(String(lane.activity), a.x - 10, lane.mid);
    });

    ctx.save();
    ctx.translate(a.x - 34, (f.lanes[0].mid + f.lanes[f.lanes.length - 1].mid) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgba(palette.dim, 0.5);
    ctx.fillText('А К Т И В Н І С Т Ь', 0, 0);
    ctx.restore();

    // Горизонталь: та сама градієнтна смуга, що й у тем, але без розривів.
    const zx = f.toX(0);
    const grad = ctx.createLinearGradient(a.x, 0, a.x + a.w, 0);
    grad.addColorStop(0, rgba(palette.destructive, 0.9));
    grad.addColorStop(0.5, rgba(palette.dim, 0.4));
    grad.addColorStop(1, rgba(palette.constructive, 0.9));
    ctx.fillStyle = grad;
    ctx.fillRect(a.x, a.y - 1.5, a.w, 3);

    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    const fold = f.fold;
    for (let v = -1; v <= 1.0001; v += 0.25) {
      const value = Math.round(v * 100) / 100;
      const x = f.toX(value);
      const major = Math.abs(value) < 1e-9;
      if (Math.abs(value) === 1) continue;
      // поділка всередині згину не ставиться: там шкали фізично немає
      if (fold && value > fold.lo + 1e-9 && value < fold.hi - 1e-9) continue;
      ctx.strokeStyle = rgba(palette.dim, major ? 0.75 : 0.3);
      ctx.beginPath();
      ctx.moveTo(x, a.y - (major ? 9 : 4));
      ctx.lineTo(x, a.y + (major ? 7 : 5));
      ctx.stroke();
      ctx.fillStyle = rgba(palette.dim, major ? 0.8 : 0.48);
      ctx.fillText(major ? '0' : String(value), x, a.y + 9);
    }

    if (f.fold) drawFoldMark(a.y, f.fold);

    // Вертикаль нуля через усе поле: без неї не видно, хто по який бік стоїть.
    ctx.strokeStyle = rgba(palette.dim, 0.16);
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(zx, f.inner.y);
    ctx.lineTo(zx, a.y - 4);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = FONT(palette.fsMapSub, '700');
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillStyle = rgba(palette.destructive, 0.85);
    ctx.fillText('Д Е С Т Р У К Т И В Н А', a.x, a.y - 8);
    ctx.textAlign = 'right';
    ctx.fillStyle = rgba(palette.constructive, 0.85);
    ctx.fillText('К О Н С Т Р У К Т И В Н А', a.x + a.w, a.y - 8);

    // C6: порожня конструктивна зона це діагноз поля, а не недороблений макет.
    // Мовчазна порожнеча читається як «дані не довантажились», тому вона
    // проговорюється словами рівно там, де мали б стояти актори.
    const anyConstructive = (actors || []).some((n) => (n.stance + (n.shift || 0)) > 0.05);
    if (!anyConstructive && actors && actors.length) {
      const midY = (f.lanes[0].mid + f.lanes[f.lanes.length - 1].mid) / 2;
      ctx.font = FONT(palette.fsMap, '400');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = rgba(palette.dim, 0.6);
      ctx.fillText('Акторів із конструктивною позицією цього тижня немає.',
        (zx + a.x + a.w) / 2, midY);
    }
    ctx.restore();
  }

  /**
   * Шов розриву: вертикальна смуга на всю висоту неба з підписом уздовж неї.
   * Порожнеча стиснута, але не замовчана: шов видно боковим зором, а прочитати
   * його можна тільки навмисне.
   */
  function drawSeams(la, t) {
    const list = field?.breaks || [];
    if (!list.length || !field.sky) return;
    const sky = field.sky;
    ctx.save();
    ctx.globalAlpha = la;

    list.forEach((b) => {
      // легке переливання: шов дихає, а не миготить
      const puls = reduced ? 1 : 0.78 + Math.sin(t * 0.0007 + b.lo * 3) * 0.22;
      const g = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
      g.addColorStop(0, rgba(palette.line, 0));
      g.addColorStop(0.5, rgba(palette.line, 0.15 * puls));
      g.addColorStop(1, rgba(palette.line, 0));
      ctx.fillStyle = g;
      ctx.fillRect(b.x, sky.y, b.w, sky.h);

      ctx.strokeStyle = rgba(palette.line, 0.16 * puls);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 7]);
      [b.x + 0.5, b.x + b.w - 0.5].forEach((x) => {
        ctx.beginPath();
        ctx.moveTo(x, sky.y);
        ctx.lineTo(x, sky.y + sky.h);
        ctx.stroke();
      });
      ctx.setLineDash([]);

      ctx.font = FONT(palette.fsMapSub, '400');
      if (b.spansZero && ctx.measureText(BREAK_LABEL).width < sky.h - 24) {
        ctx.save();
        ctx.translate(b.mid, sky.y + sky.h / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = rgba(palette.dim, 0.8);
        ctx.fillText(BREAK_LABEL, 0, 0);
        ctx.restore();
      }
    });

    ctx.restore();
  }

  /** Стрілка камертона: світний вертикальний маркер на осі. */
  function drawNeedle(la, now) {
    if (!field?.axis || needleCur === null || needleCur === undefined) return;
    const a = field.axis;
    const p = clamp01((now - needleFrom) / TWEEN_MS);
    const x = needleXFrom !== null && p < 1
      ? lerp(needleXFrom, field.toX(needleCur), easeInOut(p))
      : field.toX(needleCur);
    const top = a.y - 26;
    const bottom = a.y + 5;

    ctx.save();
    ctx.globalAlpha = la;

    if (needle?.prev !== null && needle?.prev !== undefined) {
      const px = field.toX(needle.prev);
      ctx.strokeStyle = rgba(palette.cyan, 0.3);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(px, a.y - 12);
      ctx.lineTo(px, a.y + 3);
      ctx.stroke();

      if (Math.abs(px - x) > 3) {
        ctx.strokeStyle = rgba(palette.cyan, 0.5);
        ctx.beginPath();
        ctx.moveTo(px, a.y - 7);
        ctx.lineTo(x, a.y - 7);
        ctx.stroke();
        const dir = Math.sign(x - px);
        ctx.beginPath();
        ctx.moveTo(x, a.y - 7);
        ctx.lineTo(x - dir * 6, a.y - 11);
        ctx.moveTo(x, a.y - 7);
        ctx.lineTo(x - dir * 6, a.y - 3);
        ctx.stroke();
      }
    }

    const glow = ctx.createRadialGradient(x, a.y, 0, x, a.y, 26);
    glow.addColorStop(0, rgba(palette.cyan, 0.4));
    glow.addColorStop(1, rgba(palette.cyan, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, a.y, 26, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = rgba(palette.cyan, 0.95);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();

    ctx.fillStyle = rgba(palette.text, 0.95);
    ctx.beginPath();
    ctx.arc(x, a.y, 3, 0, Math.PI * 2);
    ctx.fill();

    // Підпис називає стрілку числом, а не словом «центр». Слово читалось як нуль
    // шкали і не пояснювало, чому воно рухається: це не нуль, а центр ваги, і він
    // рухається щоразу, коли міняються теми або їхня вага. Число тут те саме, що
    // герой-цифра в шапці, тому звʼязок видно без пояснень.
    ctx.font = FONT(palette.fsMapSub, '700');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = rgba(palette.cyan, 0.9);
    ctx.fillText(`центр ваги · ${Math.round((needleCur + 1) * 50)}`, x, top - 3);

    // Модельний центр поруч із реальним, пунктиром. Підпис моделі йде під вісь,
    // а не над нею: два підписи на одній висоті зливались у кашу, щойно модель
    // ставала близько до факту.
    const modelScore = modelCentroid();
    if (modelScore !== null && Math.abs(modelScore - needleCur) > 0.004) {
      const mx = field.toX(modelScore);
      ctx.strokeStyle = rgba(palette.warn, 0.9);
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mx, a.y - 16);
      ctx.lineTo(mx, a.y + 16);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = FONT(palette.fsMapSub, '700');
      ctx.textBaseline = 'top';
      ctx.fillStyle = rgba(palette.warn, 0.95);
      // підкладка під підпис: він падає на градієнт осі
      const w = ctx.measureText('модель').width;
      ctx.fillStyle = rgba(palette.bg, 0.75);
      ctx.fillRect(mx - w / 2 - 4, a.y + 18, w + 8, 14);
      ctx.fillStyle = rgba(palette.warn, 0.95);
      ctx.fillText('модель', mx, a.y + 20);
    }

    field.needleX = x;
    ctx.restore();
  }

  /**
   * Зона активної пунктирної стрілки зсуву.
   * Поки гіпотеза жива, сусідні постійні підписи в цій смузі ховаються,
   * щоб стрілку не доводилось вичитувати крізь текст.
   */
  /**
   * Гіпотезний зсув у пікселях. Рахується тим самим кусково-лінійним мапінгом,
   * що й позиції: інакше стрілка перетинала б розрив по лінійці, якої вже немає.
   */
  function shiftPxOf(s) {
    const d = s.shiftCur || 0;
    if (!d || !field?.toX || typeof s.toneScore !== 'number') return 0;
    return field.toX(s.toneScore + d) - field.toX(s.toneScore);
  }

  function inArrowZone(s) {
    return stars.some((o) => {
      if (o.id === s.id) return false;
      const shiftPx = shiftPxOf(o);
      if (Math.abs(shiftPx) < 6) return false;
      const x1 = Math.min(o.curX, o.curX + shiftPx) - 20;
      const x2 = Math.max(o.curX, o.curX + shiftPx) + 20;
      const halfW = (s.boxW || 60) / 2;
      return s.curX + halfW > x1 && s.curX - halfW < x2 && Math.abs(s.curY - o.curY) < 58;
    });
  }

  /** Зважений центр тону з урахуванням модельних зсувів, або null без моделювання. */
  function modelCentroid() {
    const live = stars.filter((s) => !s.exited && (s.curA ?? 0) > 0.2);
    if (!live.length || !live.some((s) => Math.abs(s.shiftCur || 0) > 0.001)) return null;
    let sw = 0;
    let sx = 0;
    live.forEach((s) => {
      const w = s.salience || 1;
      sw += w;
      sx += (s.toneScore + (s.shiftCur || 0)) * w;
    });
    return sw ? sx / sw : null;
  }

  function drawMoons(s, now, alpha) {
    if (!s.moons?.length) return;
    s.moons.forEach((m, i) => {
      const orbit = s.curR * 2.1 + i * 9;
      const ang = m.phase + (reduced ? 0 : now * 0.00016 * m.speed);
      const mx = s.curX + Math.cos(ang) * orbit;
      const my = s.curY + Math.sin(ang) * orbit * 0.62;
      const color =
        m.status === 'festering' ? palette.destructive
        : m.status === 'closed' ? palette.constructive
        : palette.warn;
      const hot = m.status === 'festering' || hoveredMoon === m.id;
      const rad = hoveredMoon === m.id ? 6 : 4.5;
      if (hot) {
        const g = ctx.createRadialGradient(mx, my, 0, mx, my, rad * 3.4);
        g.addColorStop(0, rgba(color, 0.4 * alpha));
        g.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(mx, my, rad * 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = rgba(color, 0.95 * alpha);
      ctx.beginPath();
      ctx.arc(mx, my, rad, 0, Math.PI * 2);
      ctx.fill();
      m._sx = mx;
      m._sy = my;
    });
  }

  /** Зоря: ядро, помірний ореол, кільце статусу. Нічого більше. */
  /**
   * D2 · шлейф часу.
   *
   * При зміні тижня вузол лишає напівпрозору попередню позицію, тонку
   * траєкторію між нею і собою, і мітку виду «W31 -> W32». Без шлейфу зміна
   * тижня читається як інша картинка, а не як РУХ того самого поля: око бачить
   * новий кадр і не бачить, звідки він узявся.
   *
   * Живе рівно стільки, скільки задано в config/thresholds.json, і згасає до
   * нуля. Після згасання на карті нема ані руху, ані сліду: спокій це вимога.
   */
  function drawTrail(s, now, la, tone) {
    if (!trailFrom || !trailLabel) return;
    const life = MOTION.trail_ms;
    if (!life) return;
    const age = now - trailFrom;
    if (age < 0 || age > life) return;
    if (!Number.isFinite(s.fromX) || !Number.isFinite(s.fromY)) return;

    const dx = s.curX - s.fromX;
    const dy = s.curY - s.fromY;
    // Вузол, що не зрушив, шлейфу не має: інакше поле вкривається слідами там,
    // де нічого не сталось, і рух перестає щось означати.
    if (Math.hypot(dx, dy) < 6) return;

    const k = (1 - age / life) * la;
    const a = MOTION.trail_opacity * k;
    if (a <= 0.01) return;

    ctx.save();
    // Попередня позиція: та сама зоря, тільки згасла.
    ctx.globalAlpha = 1;
    ctx.fillStyle = rgba(tone, a * 0.5);
    ctx.beginPath();
    ctx.arc(s.fromX, s.fromY, Math.max(2, (s.fromR ?? s.curR) * 0.5), 0, Math.PI * 2);
    ctx.fill();

    // Траєкторія: тонка, згасає до поточної позиції, щоб напрям читався.
    const g = ctx.createLinearGradient(s.fromX, s.fromY, s.curX, s.curY);
    g.addColorStop(0, rgba(tone, 0));
    g.addColorStop(1, rgba(tone, a));
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(s.fromX, s.fromY);
    ctx.lineTo(s.curX, s.curY);
    ctx.stroke();

    // Мітка переходу стоїть один раз, біля найбільшого зсуву тижня: підписати
    // кожен шлейф означало б повернути на карту той самий текстовий шум.
    if (s.id === trailLeadId) {
      ctx.font = FONT(palette.fsMapSub, '700');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = rgba(palette.dim, a * 2.2);
      ctx.fillText(trailLabel, (s.fromX + s.curX) / 2, Math.min(s.fromY, s.curY) - 8);
    }
    ctx.restore();
  }

  /**
   * D5 · привид прогнозу.
   *
   * Малюється тільки в режимі ПРОГНОЗ і тільки для тем, у яких є звʼязаний
   * прогноз. Показує ймовірність, дату перевірки і коридор невизначеності:
   * що ближче число до 50%, то ширший коридор, бо саме там прогноз найменше
   * каже. Число читається з Forecast, тому воно те саме, що в Зрізі і Компасі.
   *
   * Майбутнє малюється тільки пунктиром: суцільна лінія в цьому продукті
   * означає факт.
   */
  function drawGhost(s, la) {
    const g = ghosts.get(s.id);
    if (!g || !Number.isFinite(s.curX)) return;
    const px = s.curX;
    const py = s.curY;
    const r = s.curR;
    const alpha = (s.curA ?? 1) * la;
    if (alpha <= 0.02) return;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Коридор невизначеності: горизонтальна смуга, бо вісь тут це тон.
    const half = Math.max(10, g.uncertainty * (field?.axis ? rect.w * 0.06 : 40));
    ctx.strokeStyle = rgba(palette.dim, 0.5);
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px - half, py);
    ctx.lineTo(px + half, py);
    ctx.stroke();
    [-half, half].forEach((dx) => {
      ctx.beginPath();
      ctx.moveTo(px + dx, py - 5);
      ctx.lineTo(px + dx, py + 5);
      ctx.stroke();
    });

    // Сам привид: пунктирне коло на позиції теми.
    ctx.strokeStyle = rgba(palette.warn, 0.85);
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(px, py, r * 1.25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = FONT(palette.fsMap, '700');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = rgba(palette.warn, 0.95);
    ctx.fillText(g.p == null ? 'без числа' : `${Math.round(g.p * 100)}%`, px, py - r * 1.35);

    ctx.font = FONT(palette.fsMapSub, '400');
    ctx.textBaseline = 'top';
    ctx.fillStyle = rgba(palette.dim, 0.9);
    ctx.fillText(`перевірка ${g.deadline}`, px, py + r * 1.35);
    ctx.restore();
  }

  function drawStar(s, t, now, la) {
    const py = s.curY;
    if (!Number.isFinite(s.curX)) return;
    // модельний зсув рахується в одиницях тону, тому переводимо його в пікселі шкали
    const shiftPx = shiftPxOf(s);
    const px = s.curX + shiftPx;
    const alpha = s.curA * la;
    if (alpha <= 0.02) return;

    const r = s.curR;
    const tone = palette[s.tone] || palette.mixed;
    const isActive = s.id === selected || s.id === hovered || s.id === highlighted;
    const gain = (s.loud ? 1 : 0.62) * (isActive ? 1.4 : 1);

    drawTrail(s, now, la, tone);
    drawGhost(s, la);

    s._sx = px;
    s._sy = py;
    s._sr = Math.max(14, r);

    // Привид на реальній позиції плюс пунктирна стрілка до модельної:
    // зсув має бути неможливо сплутати з фактом.
    if (Math.abs(shiftPx) > 1.5) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = rgba(tone, 0.22);
      ctx.beginPath();
      ctx.arc(s.curX, py, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(palette.dim, 0.6);
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(s.curX, py, r * 0.7, 0, Math.PI * 2);
      ctx.stroke();

      const dir = Math.sign(shiftPx);
      const from = s.curX + dir * (r * 0.7 + 4);
      const to = px - dir * (r + 6);
      if ((to - from) * dir > 4) {
        ctx.strokeStyle = rgba(palette.warn, 0.85);
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(from, py);
        ctx.lineTo(to, py);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(to, py);
        ctx.lineTo(to - dir * 6, py - 4);
        ctx.moveTo(to, py);
        ctx.lineTo(to - dir * 6, py + 4);
        ctx.stroke();

        ctx.font = FONT(palette.fsMapSub, '700');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = rgba(palette.warn, 0.95);
        ctx.fillText('ГІПОТЕЗА', (from + to) / 2, py - 7);
      }
      ctx.restore();
    }

    let pulseK = 0;
    if (s.id === pulseId) {
      const p = (now - pulseFrom) / PULSE_MS;
      if (p >= 0 && p < 1) pulseK = reduced ? 1 : Math.sin(p * Math.PI);
      else if (p >= 1) pulseId = null;
    }
    if (pulseK > 0) {
      const pr = r * (2.6 + pulseK * 3);
      const wave = ctx.createRadialGradient(px, py, r, px, py, pr);
      wave.addColorStop(0, rgba(palette.cyan, 0.22 * pulseK * alpha));
      wave.addColorStop(1, rgba(palette.cyan, 0));
      ctx.fillStyle = wave;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Світло навколо зорі. Спад розписаний багатьма зупинками і закінчується
    // строго нулем: одна-дві зупинки давали видиме кільце там, де градієнт
    // обривався, і зоря читалась як кружечок з обведенням, а не як світло.
    const breath = reduced ? 1 : 0.92 + Math.sin(t * 0.0011 + s.phase) * 0.08;
    // C3: чотири рівні світіння. Вибраний або наведений вузол завжди піднімається
    // до верхнього рівня, бо це відповідь на дію читача, а не властивість даних.
    const tier = isActive ? 1 : (s.glow || 2);
    const GLOW_K = { 1: 1, 2: 0.55, 3: 0.22 }[tier] ?? 0.55;
    const haloR = r * (s.dominant ? 5 : 3.8) * breath * (0.6 + 0.4 * GLOW_K);
    const haloA = (s.dominant ? 0.3 : 0.22) * alpha * gain * GLOW_K;
    const halo = ctx.createRadialGradient(px, py, r * 0.15, px, py, haloR);
    halo.addColorStop(0, rgba(tone, haloA));
    halo.addColorStop(0.16, rgba(tone, haloA * 0.62));
    halo.addColorStop(0.32, rgba(tone, haloA * 0.34));
    halo.addColorStop(0.52, rgba(tone, haloA * 0.15));
    halo.addColorStop(0.74, rgba(tone, haloA * 0.05));
    halo.addColorStop(1, rgba(tone, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(px, py, haloR, 0, Math.PI * 2);
    ctx.fill();

    // Ядро: гаряче біле осердя переходить у колір тону і згасає в нуль трохи
    // за геометричним радіусом, тому в зорі немає різкої межі кольору.
    const coreR = r * 1.45;
    const hot = s.loud || s.dominant ? 1 : 0.92;
    const core = ctx.createRadialGradient(px, py, 0, px, py, coreR);
    core.addColorStop(0, rgba(palette.text, hot * alpha));
    core.addColorStop(0.2, rgba(palette.text, 0.95 * alpha));
    core.addColorStop(0.4, rgba(palette.text, 0.6 * alpha));
    core.addColorStop(0.55, rgba(tone, 0.9 * alpha));
    core.addColorStop(0.72, rgba(tone, 0.5 * alpha));
    core.addColorStop(0.86, rgba(tone, 0.2 * alpha));
    core.addColorStop(1, rgba(tone, 0));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(px, py, coreR, 0, Math.PI * 2);
    ctx.fill();

    // G2: статус вбудований в обводку САМОГО ядра, а не оперізує його орбітою.
    //
    // Було: статус і звірка джерел малювались двома окремими кільцями поверх
    // сяйва. Більшість тверджень це «оцінка», тому поле вкривалось однаковими
    // пунктирними орбітами і читалось як приціли, а не як дані. Приціли
    // заборонені правилом 4, і на вигляд це було саме воно.
    //
    // Стало: рівно один stroke по краю ядра. Кодування те саме (суцільний факт,
    // штрих оцінка, крапки гіпотеза), але воно більше нічого не оперізує.
    // Радіус саме r, а не coreR: на coreR обводка потрапляє в зону, де ядро вже
    // згасло, і читається як окрема орбіта поверх сяйва, тобто рівно те, що G2
    // прийшов прибрати. На r вона лягає на щільне тіло вузла і стає його краєм.
    ctx.save();
    ctx.globalAlpha = alpha * (isActive ? 1 : 0.4);
    ctx.lineWidth = isActive ? 1.5 : 1;
    ctx.strokeStyle = rgba(palette.bg, isActive ? 0.9 : 0.75);
    ctx.setLineDash(EPISTEMIC_DASH[s.epistemic] || EPISTEMIC_DASH.assessment);
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // D3 · кільце джерел. Тільки у фокусі теми (узгоджено з G2): у спокої карта
    // чиста, жодного розімкнутого кола поверх сяйва.
    //
    // Граматика кільця це ПОКРИТТЯ джерелами, а не статус твердження. Статус
    // живе на обводці ядра вище. Два різні виміри, тому й різні радіуси:
    // сплутати їх було б найгіршим, що тут можна зробити.
    //
    //   повний збіг    -> суцільне замкнене кільце
    //   розбіжність    -> дуги з видимим розривом рівно там, де згоди немає
    //   одне джерело   -> одна пунктирна дуга, а не коло
    if (isActive) {
      const n = Math.max(1, s.sourceCount || 1);
      const R = r * 2.05;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1.5;

      if (s.rim === 'solid') {
        ctx.strokeStyle = rgba(palette.constructive, 0.72);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(px, py, R, 0, Math.PI * 2);
        ctx.stroke();
      } else if (s.rim === 'conflict') {
        // Розрив між дугами і є незгодою: він мусить лишатись видимим.
        ctx.strokeStyle = rgba(palette.destructive, 0.95);
        ctx.setLineDash([]);
        const gap = 0.34;
        const seg = (Math.PI * 2) / n;
        for (let i = 0; i < n; i++) {
          const a0 = -Math.PI / 2 + i * seg + gap / 2;
          ctx.beginPath();
          ctx.arc(px, py, R, a0, a0 + seg - gap);
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = rgba(palette.dim, 0.85);
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        ctx.arc(px, py, R, -Math.PI * 0.75, -Math.PI * 0.05);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawMoons(s, now, alpha);

    if (!s.lines || cinemaLabel(s) <= 0.01) return;

    // Крапка-мітка замість підпису: тема лишається на карті, назва живе
    // в тултіпі і в списку всіх тем у доку.
    const hiddenByArrow = !isActive && inArrowZone(s);
    if (s.labelMode === 'dot' || hiddenByArrow) {
      // Крапка-мітка носить те саме кільце звірки, що й велика зоря:
      // без нього вона читається як артефакт рендера, а не як прихована тема.
      const my = py + r + 11;
      ctx.fillStyle = rgba(palette.mut, (isActive ? 0.95 : 0.6) * alpha);
      ctx.beginPath();
      ctx.arc(px, my, 2, 0, Math.PI * 2);
      ctx.fill();

      // G2: крапка-мітка теж більше не носить орбіту звірки у спокої. Її кільце
      // було найгустішим джерелом «прицілів»: саме прихованих тем на полі
      // найбільше. Статус лишається на самій крапці штрихом, звірка приходить
      // у фокусі разом з рештою.
      if (isActive) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 1;
        if (s.rim === 'solid') { ctx.strokeStyle = rgba(palette.constructive, 0.72); ctx.setLineDash([]); }
        else if (s.rim === 'conflict') { ctx.strokeStyle = rgba(palette.destructive, 0.95); ctx.setLineDash([2, 2]); }
        else { ctx.strokeStyle = rgba(palette.dim, 0.85); ctx.setLineDash([1.5, 3]); }
        ctx.beginPath();
        ctx.arc(px, my, 5.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      return;
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const nameColor = isActive || s.loud ? palette.text : palette.mut;
    // підпис зазвичай під зорею, але в тісному сузірʼї частина тем несе його зверху
    let y = s.labelAbove
      ? py - r - (s.labelH ?? 49) + 14
      : py + r + 14;

    ctx.font = FONT(palette.fsMap, '700');
    s.lines.forEach((line) => {
      ctx.fillStyle = rgba(nameColor, (isActive ? 0.98 : s.loud ? 0.92 : 0.72) * alpha);
      ctx.fillText(line, px, y);
      y += LINE_H;
    });

    // Аудиторія і динаміка проступають під курсором і у вибраної зорі. Рядок
    // малюється поверх поля, а не в зарезервованому місці: він зʼявляється рівно
    // тоді, коли читач уже дивиться саме сюди, і нікому не заважає решту часу.
    const sub = [s.audLabel, s.trendMark].filter(Boolean).join(' · ');
    if (sub && isActive) {
      ctx.font = FONT(palette.fsMapSub, '400');
      const w = ctx.measureText(sub).width;
      ctx.fillStyle = rgba(palette.bg, 0.7 * alpha);
      ctx.fillRect(px - w / 2 - 5, y - 7, w + 10, 14);
      ctx.fillStyle = rgba(palette.dim, 0.95 * alpha);
      ctx.fillText(sub, px, y);
    }
  }

  /**
   * Нитки на небі бувають рівно двох родів:
   *  link  названий у звіті звʼязок між темами
   *  pull  тяжіння теми обох аудиторій до кожного сузірʼя
   * Інших ліній немає.
   */
  /**
   * Крива звʼязку від краю зорі А до краю зорі Б.
   *
   * Лінія ніколи не починається і не закінчується в порожнечі: обидва кінці
   * підрізані по радіусу своєї зорі й позначені крапкою-терміналом. Обірваний
   * хвіст читався б як звʼязок із чимось, чого на екрані немає.
   */
  function filamentPath(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const ra = (a.r || 0) + 4;
    const rb = (b.r || 0) + 4;
    if (len <= ra + rb + 6) return null; // зорі надто близько: лінії немає
    const p0 = { x: a.x + ux * ra, y: a.y + uy * ra };
    const p1 = { x: b.x - ux * rb, y: b.y - uy * rb };
    const c = {
      x: (p0.x + p1.x) / 2,
      y: (p0.y + p1.y) / 2 - Math.abs(p1.x - p0.x) * 0.08,
    };
    // середина квадратичної кривої: сюди лягає підпис причини
    const mid = { x: (p0.x + 2 * c.x + p1.x) / 4, y: (p0.y + 2 * c.y + p1.y) / 4 };
    return { p0, p1, c, mid };
  }

  function strokeFilament(path, alpha, lit) {
    ctx.strokeStyle = rgba(palette.cyan, alpha);
    ctx.lineWidth = lit ? 1.3 : 0.9;
    ctx.beginPath();
    ctx.moveTo(path.p0.x, path.p0.y);
    ctx.quadraticCurveTo(path.c.x, path.c.y, path.p1.x, path.p1.y);
    ctx.stroke();
    // термінали: лінія має два видимі кінці, а не розчиняється
    ctx.fillStyle = rgba(palette.cyan, Math.min(1, alpha * 2.2));
    [path.p0, path.p1].forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, lit ? 2.4 : 1.8, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawFilaments(t, la) {
    linkHits = [];

    filaments.forEach((f) => {
      const a = stars.find((s) => s.id === f.from);
      if (!a || !Number.isFinite(a.curX)) return;
      const lit = a.id === selected || a.id === hovered;

      if (f.kind === 'pull') {
        const c = field?.centroids?.[f.toCluster];
        if (!c) return;
        const alpha = (a.curA ?? 0) * la * (lit ? 0.24 : 0.08);
        if (alpha <= 0.02) return;
        const path = filamentPath(
          { x: a.curX, y: a.curY, r: a.curR },
          { x: c.x, y: c.y, r: 0 }
        );
        if (!path) return;
        ctx.save();
        ctx.setLineDash([3, 5]);
        strokeFilament(path, alpha, lit);
        ctx.restore();
        return;
      }

      const b = stars.find((s) => s.id === f.to);
      if (!b || !Number.isFinite(b.curX)) return;
      const litPair = lit || b.id === selected || b.id === hovered || hoveredLink === f;
      const alpha = Math.min(a.curA ?? 0, b.curA ?? 0) * la * (litPair ? 0.42 : 0.1);
      if (alpha <= 0.02) return;
      const path = filamentPath(
        { x: a.curX, y: a.curY, r: a.curR },
        { x: b.curX, y: b.curY, r: b.curR }
      );
      if (!path) return;
      strokeFilament(path, alpha, litPair);
      linkHits.push({ f, path });

      // Причина словами зʼявляється тільки під самим звʼязком, а не в усіх
      // звʼязках наведеної теми. Наведення на зорю з пʼятьма звʼязками виводило
      // пʼять абзаців одночасно, і вони лягали один на одного і на підписи тем.
      // Лінії при цьому світяться всі: видно, скільки звʼязків, а читається один.
      if (hoveredLink === f && f.reason) {
        ctx.save();
        ctx.font = FONT(palette.fsMapSub, '400');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const lines = clampLines(f.reason, 210, 2);
        const w = Math.max(...lines.map((l) => ctx.measureText(l).width));
        const h = lines.length * 12 + 6;
        ctx.fillStyle = rgba(palette.bg, 0.72 * la);
        ctx.fillRect(path.mid.x - w / 2 - 5, path.mid.y - h / 2, w + 10, h);
        ctx.fillStyle = rgba(palette.mut, 0.95 * la);
        lines.forEach((l, i) => {
          ctx.fillText(l, path.mid.x, path.mid.y - h / 2 + 9 + i * 12);
        });
        ctx.restore();
      }
    });
  }

  /* ---------- шар АКТОРИ ---------- */

  function drawTies(la) {
    ties.forEach((tie) => {
      const a = actors.find((n) => n.id === tie.from);
      const b = actors.find((n) => n.id === tie.to);
      if (!a || !b || !Number.isFinite(a.curX) || !Number.isFinite(b.curX)) return;
      const alpha = Math.min(a.curA ?? 0, b.curA ?? 0) * la;
      if (alpha <= 0.02) return;
      const color = tie.tone === 'g' ? palette.constructive : palette.destructive;
      const dx = b.curX - a.curX;
      const dy = b.curY - a.curY;
      const len = Math.hypot(dx, dy) || 1;
      const cx = (a.curX + b.curX) / 2 + (-dy / len) * len * 0.14;
      const cy = (a.curY + b.curY) / 2 + (dx / len) * len * 0.14;
      const lit = [a.id, b.id].some((id) => id === selected || id === hovered);
      ctx.strokeStyle = rgba(color, (lit ? 0.55 : 0.28) * alpha);
      ctx.lineWidth = lit ? 1.4 : 1;
      ctx.beginPath();
      ctx.moveTo(a.curX, a.curY);
      ctx.quadraticCurveTo(cx, cy, b.curX, b.curY);
      ctx.stroke();
    });
  }

  function drawActor(n, now, la) {
    if (!Number.isFinite(n.curX)) return;
    const alpha = (n.curA ?? 1) * la;
    if (alpha <= 0.02) return;
    const r = n.curR ?? n.radius;
    const px = n.curX;
    const py = n.curY;
    const isActive = n.id === selected || n.id === hovered || n.id === highlighted;
    const gain = (n.loud ? 1 : 0.6) * (isActive ? 1.4 : 1);
    const pos = n.stance + (n.shift || 0);
    const tone = pos > 0.05 ? palette.constructive : pos < -0.05 ? palette.destructive : palette.mixed;

    n._sx = px;
    n._sy = py;
    n._sr = r;

    if (Math.abs(n.shift || 0) > 0.001) {
      const tail = (n.shift || 0) * (actorField?.unitX ?? rect.w * 0.44);
      const g = ctx.createLinearGradient(px - tail, py, px, py);
      g.addColorStop(0, rgba(palette.cyan, 0));
      g.addColorStop(1, rgba(palette.cyan, 0.45 * alpha));
      ctx.strokeStyle = g;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px - tail, py);
      ctx.lineTo(px, py);
      ctx.stroke();
    }

    const hex = () => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const x = px + Math.cos(a) * r;
        const y = py + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };

    hex();
    ctx.fillStyle = rgba(palette.bg, 0.55 * alpha);
    ctx.fill();

    // Гліф типу сутності замість обличчя. Тип приходить з реєстру акторів;
    // невідомий тип падає на «групу» як найнейтральнішу форму.
    const glyph = ACTOR_GLYPH[n.type] || ACTOR_GLYPH.group;
    ctx.save();
    hex();
    ctx.clip();
    ctx.strokeStyle = rgba(tone, (isActive ? 0.95 : 0.72) * alpha * gain);
    ctx.fillStyle = rgba(tone, (isActive ? 0.9 : 0.66) * alpha * gain);
    ctx.lineWidth = Math.max(1.1, r * 0.075);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    glyph(ctx, px, py, r);
    ctx.restore();

    // рамка кольору тону впливу поверх портрета
    hex();
    ctx.strokeStyle = rgba(tone, (n.loud ? 0.95 : 0.6) * alpha);
    ctx.lineWidth = isActive || n.loud ? 2 : 1.2;
    ctx.stroke();

    // Підпис міг не влізти в ряд: тоді його немає, а імʼя лишається в тултіпі.
    if (!n.lines || n.labelHidden) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = FONT(palette.fsMap, '700');
    // Підпис іде під фігурою, а в тісному ряду через один зверху: горизонталь
    // тут закріплена за ставленням, тому розсунути сусідів убік уже не можна,
    // і єдине вільне місце це другий поверх підписів.
    const lines = n.lines.length;
    const lx = px + (n.labelDX || 0);
    let y = n.labelAbove ? py - r - 12 - (lines - 1) * LINE_H : py + r + 12;
    // Коли підпис зʼїхав убік, від фігури до нього йде коротка волосина: інакше
    // не видно, чий це текст.
    if (Math.abs(n.labelDX || 0) > 6) {
      ctx.strokeStyle = rgba(palette.dim, 0.28 * alpha);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, n.labelAbove ? py - r - 3 : py + r + 3);
      ctx.lineTo(lx, n.labelAbove ? py - r - 8 : py + r + 8);
      ctx.stroke();
    }
    n.lines.forEach((line) => {
      ctx.fillStyle = rgba(isActive || n.loud ? palette.text : palette.mut, 0.9 * alpha);
      ctx.fillText(line, lx, y);
      y += LINE_H;
    });
  }

  /* ---------- кадр ---------- */

  function render(now) {
    if (destroyed) return;
    // t — годинник АМБІЄНТУ (стоїть у спокої). Супутникам передається `now`.
    const t = reduced ? 0 : ambientT;
    // Заставка ще проявляється: кадр мусить попросити наступний.
    let cinemaBusy = false;

    if (starTweening) {
      const p = Math.min(1, (now - starTweenFrom) / starTweenMs);
      const e = easeInOut(p);
      stars.forEach((s) => {
        s.curX = lerp(s.fromX, s.tx, e);
        s.curY = lerp(s.fromY, s.ty, e);
        s.curR = lerp(s.fromR, s.radius, e);
        s.curA = lerp(s.fromA, s.toA, e);
      });
      if (p >= 1) {
        stars = stars.filter((s) => !s.dying);
        starTweening = false;
      }
    }

    if (actorTweening) {
      const p = Math.min(1, (now - actorTweenFrom) / actorTweenMs);
      const e = easeInOut(p);
      actors.forEach((a) => {
        a.curX = lerp(a.fromX, a.tx, e);
        a.curY = lerp(a.fromY, a.ty, e);
        a.curR = lerp(a.fromR ?? a.radius, a.radius, e);
        a.curA = lerp(a.fromA, a.toA, e);
      });
      if (p >= 1) {
        actors = actors.filter((a) => !a.dying);
        ties = actorField?.ties || ties;
        actorTweening = false;
      }
    }

    // стрілка їде по осі власним твіном
    if (needleTarget !== null && needleTarget !== undefined) {
      const p = clamp01((now - needleFrom) / TWEEN_MS);
      const from = needleCur === null ? needleTarget : needleCur;
      needleCur = lerp(from, needleTarget, easeInOut(p));
      if (p >= 1) needleCur = needleTarget;
    }

    let shifting = false;
    // модельні зсуви тем: окремий твін, реальна позиція лишається як привид
    stars.forEach((s) => {
      const p = clamp01((now - topicShiftFrom) / SHIFT_MS);
      s.shiftCur = lerp(s.shiftFromVal || 0, s.shiftTarget || 0, easeInOut(p));
      if (p < 1) shifting = true;
    });
    actors.forEach((a) => {
      const p = clamp01((now - shiftFrom) / SHIFT_MS);
      a.shift = lerp(a.shiftFromVal || 0, a.shiftTarget || 0, easeInOut(p));
      if (p < 1) shifting = true;
      if (!actorTweening) {
        a.curX = a.tx + (a.shift || 0) * (actorField?.unitX ?? rect.w * 0.44);
        a.curY = a.ty;
      }
    });

    // Перехід шарів це не кросфейд, а зміна глибини: той, що йде, трохи
    // наближається і розчиняється, той, що приходить, виринає здалеку.
    const since = now - layerFrom;
    const pIn = clamp01(since / LAYER_MS);
    const pOut = clamp01(since / LAYER_OUT_MS);
    const lp = Math.min(pIn, pOut);
    const laTopics = layer === 'topics' ? pIn : 1 - pOut;
    const laActors = layer === 'actors' ? pIn : 1 - pOut;
    const zoomOf = (mine) =>
      mine
        ? lerp(LAYER_ZOOM_FROM, 1, easeInOut(pIn))
        : lerp(1, LAYER_ZOOM_TO, easeInOut(pOut));
    const zTopics = zoomOf(layer === 'topics');
    const zActors = zoomOf(layer === 'actors');
    /** Стагер появи: зорі виринають не разом, а хвилею. */
    const stagger = (i, mine) =>
      mine && pIn < 1 ? clamp01((since - i * LAYER_STAGGER) / LAYER_MS) : 1;

    /**
     * Масштабуємо тільки вміст поля. Вісь, шов і панелі стоять на місці:
     * рухається рівень, на який пірнає читач, а не лінійка, якою він міряє.
     */
    const withDepth = (k, fn) => {
      if (Math.abs(k - 1) < 0.0005) return fn();
      const cx = rect.x + rect.w / 2;
      const cy = field?.sky ? field.sky.y + field.sky.h / 2 : rect.y + rect.h / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(k, k);
      ctx.translate(-cx, -cy);
      fn();
      ctx.restore();
    };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = rgba(palette.bg, 1);
    ctx.fillRect(0, 0, W, H);

    const nbx = reduced ? 0 : Math.sin(t * 0.000045) * 18;
    const nby = reduced ? 0 : Math.cos(t * 0.000032) * 14;
    ctx.drawImage(nebulaCanvas, -MARGIN + nbx, -MARGIN + nby, W + MARGIN * 2, H + MARGIN * 2);
    ctx.drawImage(farCanvas, -MARGIN, -MARGIN, W + MARGIN * 2, H + MARGIN * 2);


    const drawDust = (list, driftX, amp) => {
      list.forEach((d) => {
        const x = (d.x * W + (reduced ? 0 : Math.sin(t * 0.00003) * driftX) + W) % W;
        const tw = reduced ? 1 : 0.65 + Math.sin(t * 0.001 * d.sp + d.ph) * 0.35;
        ctx.fillStyle = rgba(palette.dust, d.a * tw * amp);
        ctx.beginPath();
        ctx.arc(x, d.y * H, d.r, 0, Math.PI * 2);
        ctx.fill();
      });
    };
    drawDust(midDust, 10, 0.9);
    drawDust(nearDust, 26, 1);

    if (laTopics > 0.01) {
      // під час заставки поле голе: спершу тільки зорі, потім підписи,
      // і аж на кроці axis повертаються вісь, шов і решта розмітки
      // Під час заставки поле голе: спершу тільки зорі, потім підписи, і аж
      // на кроці axis повертається розмітка. Повертається проявленням, а не
      // одним кадром, інакше на виході із заставки блимає.
      const scaffoldA =
        !cinema ? 1
        : cinema === 'axis' ? clamp01((now - cinemaFrom) / 500)
        : 0;
      const la2 = laTopics * scaffoldA;
      if (scaffoldA > 0.01) {
        drawSeams(la2, t);
        drawConstellations(la2);
        drawAudienceAxis(la2);
        drawHorizon(la2);
        drawAxis(la2);
      }
      withDepth(zTopics, () => {
        if (scaffoldA > 0.01) drawFilaments(t, la2);
        const mine = layer === 'topics';
        if (scaffoldA > 0.01) stars.filter((s) => s.exited).forEach((s) => drawStar(s, t, now, la2));
        stars
          .filter((s) => !s.exited)
          .forEach((s, i) => drawStar(s, t, now, laTopics * stagger(i, mine)));
      });
      if (scaffoldA > 0.01) drawNeedle(la2, now);
      // kick() зсередини render це no-op: raf ще тримає id поточного колбека,
    // тому guard  не спрацьовує. Заставка через це завмирала на
    // першому ж кадрі, і підписи зʼявлялись стрибком замість появи.
    if (cinema && scaffoldA < 1) cinemaBusy = true;
    }

    if (laActors > 0.01) {
      // Вісь малюється поза withDepth: розмітка не має наближатись і віддалятись
      // разом з вузлами, інакше лінійка їздила б по своїх же поділках.
      drawActorAxis(laActors);
      withDepth(zActors, () => {
        drawTies(laActors);
        const mine = layer === 'actors';
        actors.forEach((n, i) => drawActor(n, now, laActors * stagger(i, mine)));
      });
    }

    renderBusy = lp < 1 || shifting || cinemaBusy;
    if (renderBusy) kick();
  }

  /** Чи ще живий шлейф переходу між тижнями (D2). */
  const trailLive = (now) => Boolean(trailFrom) && (now - trailFrom) <= MOTION.trail_ms;

  /** Чи є на полі супутники, які мусять обертатися просто зараз. */
  function moonsLive() {
    if (reduced) return false;
    if (layer !== 'topics') return false;   // супутники живуть лише в шарі ТЕМИ
    return stars.some((s) => !s.exited && s.moons?.length && (s.curA ?? 0) > 0.05);
  }

  function frame(now) {
    if (destroyed) return;
    const want = Math.min(DPR_CAP, window.devicePixelRatio || 1);
    if (want !== dpr) resize(false);

    // Годинник амбієнту тікає лише тоді, коли на полі справді був рух — див.
    // «ДВА ГОДИННИКИ ПОЛЯ» вище. Прапорець узятий із ПОПЕРЕДНЬОГО кадру: сам
    // критерій руху рахується після render(), а t потрібен уже в ньому. Затримка
    // на один кадр непомітна, а альтернатива — рахувати busy двічі.
    if (ambientPrev && ambientLive) ambientT += now - ambientPrev;
    ambientPrev = now;

    render(now);

    // Критерій фази D: у спокої на карті нема ані руху, ані кілець. Раніше цикл
    // зупинявся тільки за prefers-reduced-motion, тому в усіх інших ореоли
    // дихали, зорі мерехтіли і туманність повзла вічно. Рух на цій карті означає
    // рух ДАНИХ, тому постійне ворушіння знецінює єдиний сигнал, який тут є.
    //
    // ВИНЯТОК — СУПУТНИКИ. Разом із амбієнтом зупинка циклу забрала й обертання
    // супутників навколо зір, а це не декорація: воно показує, що в темі є живі
    // кейси. Тому цикл далі крутиться, поки супутники в кадрі, але амбієнт при
    // цьому стоїть — ambientLive його не пускає.
    //
    // Пульс гасне за часом, а не за фактом малювання. Раніше pulseId скидався
    // ТІЛЬКИ всередині drawStar, тому пульс, застигнутий перемиканням шару,
    // назавжди тримав цикл кадрів увімкненим: карта «у спокої» продовжувала
    // повзти туманністю і мерехтіти пилом, тобто рівно те, що заборонено.
    const pulseLive = pulseId !== null && (now - pulseFrom) < PULSE_MS;
    if (pulseId !== null && !pulseLive) pulseId = null;

    const motion = renderBusy || starTweening || actorTweening
      || pulseLive || trailLive(now);
    ambientLive = motion;

    if (!motion && !moonsLive()) { raf = 0; ambientPrev = 0; return; }
    raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (destroyed) return;
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function resize(paint = true) {
    const box = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(box.width));
    const h = Math.max(1, Math.round(box.height));
    const nextDpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
    // Перерозкладати поле має сенс тільки тоді, коли справді змінився розмір.
    // Зміна щільності пікселів перемальовує те саме поле різкіше, але не рухає
    // зорі; а зайвий виклик applyLayout на тих самих W і H це холостий стрибок.
    const resized = w !== W || h !== H;
    W = w;
    H = h;
    dpr = nextDpr;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (resized) {
      buildNebulae();
      buildFarDust();
      buildLiveDust();
      applyLayout();
    }

    // Панель, що відкрилась, звужує карту, і поле мусить переїхати на нову ширину.
    // Переїзд робиться тим самим твіном, що й зміна тижня: телепорт читався б як
    // рух даних, а плавний переїзд видно тим, чим він є, рухом рами.
    const slide = resized && !cinema;

    const sync = (live, src, midTween, onSlide) => {
      const map = new Map(src.map((s) => [s.id, s]));
      live.forEach((s) => {
        const t = map.get(s.id);
        if (!t) return;
        s.tx = t.tx; s.ty = t.ty; s.radius = t.radius;
        s.lines = t.lines; s.boxW = t.boxW; s.boxH = t.boxH; s.boxOffY = t.boxOffY;
        // Рішення про підпис ухвалює розкладка, і воно залежить від розміру вікна:
        // на вищому небі підпис вміщається там, де на низькому довелось ставити
        // крапку. Без цих трьох полів вікно росло, а підписи лишались знятими.
        s.labelMode = t.labelMode; s.labelAbove = t.labelAbove; s.labelH = t.labelH;
        s.crowded = t.crowded; s.lane = t.lane;
        // Без цих двох підпис, прихований розкладкою, лишався прихованим навіть
        // коли після зміни ширини місце для нього зʼявилось.
        s.labelHidden = t.labelHidden; s.labelDX = t.labelDX;
        if (midTween) return;
        if (onSlide) {
          s.fromX = s.curX ?? t.tx;
          s.fromY = s.curY ?? t.ty;
          s.fromR = s.curR ?? t.radius;
          s.fromA = s.curA ?? 1;
          s.toA = s.toA ?? 1;
          return;
        }
        s.curX = t.tx; s.curY = t.ty; s.curR = t.radius;
      });
    };
    if (field) sync(stars, [...field.stars, ...field.exited], starTweening, slide);
    if (actorField) sync(actors, actorField.nodes, actorTweening, slide);
    if (slide) {
      if (!starTweening) { starTweenFrom = performance.now(); starTweenMs = SLIDE_MS; starTweening = true; }
      if (!actorTweening) { actorTweenFrom = performance.now(); actorTweenMs = SLIDE_MS; actorTweening = true; }
      if (reduced) settleTween();
    }

    if (paint) render(performance.now());
    kick();
  }

  /* ---------- взаємодія ---------- */

  function hitTopics(mx, my) {
    let moon = null;
    let bestM = Infinity;
    stars.forEach((s) => {
      // Супутник належить зорі: якщо зоря згасла або згасає, її супутники теж
      // не ловляться. Раніше перевірку мала тільки сама зоря, і по невидимому
      // супутнику можна було клацнути. Ціна промаху була нульова, поки він вів
      // у спільний список кейсів; тепер він веде у прецеденти КОНКРЕТНОГО
      // кейса, і промах відкриває чужу справу.
      if (s._sx === undefined || (s.curA ?? 0) < 0.15) return;
      (s.moons || []).forEach((m) => {
        if (m._sx === undefined) return;
        const d = Math.hypot(mx - m._sx, my - m._sy);
        if (d < 11 && d < bestM) { moon = m; bestM = d; }
      });
    });
    if (moon) return { kind: 'moon', moon };

    let star = null;
    let best = Infinity;
    stars.forEach((s) => {
      if (s._sx === undefined || (s.curA ?? 0) < 0.15) return;
      const d = Math.hypot(mx - s._sx, my - s._sy);
      if (d < s._sr + 8 && d < best) { star = s; best = d; }
    });
    if (star) return { kind: 'star', star };

    if (field?.needleX !== undefined && field?.axis &&
        Math.abs(mx - field.needleX) < 14 && Math.abs(my - field.axis.y) < 26) {
      return { kind: 'needle' };
    }

    // лінія звʼязку: шукаємо по вибірці точок самої кривої, а не по прямій
    let link = null;
    let bestL = 9;
    linkHits.forEach(({ f, path }) => {
      if (!f.reason) return;
      for (let i = 0; i <= 12; i++) {
        const u = i / 12;
        const inv = 1 - u;
        const x = inv * inv * path.p0.x + 2 * inv * u * path.c.x + u * u * path.p1.x;
        const y = inv * inv * path.p0.y + 2 * inv * u * path.c.y + u * u * path.p1.y;
        const d = Math.hypot(mx - x, my - y);
        if (d < bestL) { bestL = d; link = { f, x, y }; }
      }
    });
    if (link) return { kind: 'link', link };

    return null;
  }

  function hitActors(mx, my) {
    let node = null;
    let best = Infinity;
    actors.forEach((n) => {
      if (n._sx === undefined || (n.curA ?? 0) < 0.15) return;
      const d = Math.hypot(mx - n._sx, my - n._sy);
      if (d < n._sr + 6 && d < best) { node = n; best = d; }
    });
    return node ? { kind: 'actor', actor: node } : null;
  }

  const pick = (mx, my) => (layer === 'topics' ? hitTopics(mx, my) : hitActors(mx, my));

  function onMove(e) {
    const box = canvas.getBoundingClientRect();
    const mx = e.clientX - box.left;
    const my = e.clientY - box.top;
    const hit = pick(mx, my);

    const newHovered = hit?.kind === 'star' ? hit.star.id : hit?.kind === 'actor' ? hit.actor.id : null;
    const newMoon = hit?.kind === 'moon' ? hit.moon.id : null;
    const newLink = hit?.kind === 'link' ? hit.link.f : null;
    if (newHovered !== hovered || newMoon !== hoveredMoon || newLink !== hoveredLink) {
      hovered = newHovered;
      hoveredMoon = newMoon;
      hoveredLink = newLink;
      canvas.style.cursor = hit && hit.kind !== 'needle' ? 'pointer' : 'default';
      kick();
    }

    const tip = (o) => onHover(o);
    if (hit?.kind === 'moon') {
      tip({ kind: 'moon', id: hit.moon.id, name: hit.moon.title, x: hit.moon._sx, y: hit.moon._sy });
    } else if (hit?.kind === 'star') {
      tip({ kind: 'star', id: hit.star.id, name: hit.star.name, x: hit.star._sx, y: hit.star._sy, exited: hit.star.exited });
    } else if (hit?.kind === 'actor') {
      tip({ kind: 'actor', id: hit.actor.id, name: hit.actor.name, x: hit.actor._sx, y: hit.actor._sy });
    } else if (hit?.kind === 'link') {
      tip({ kind: 'link', name: hit.link.f.reason, x: hit.link.x, y: hit.link.y });
    } else if (hit?.kind === 'needle') {
      tip({
        kind: 'needle',
        name: needle?.direction
          ? `Центр ваги поля, не нуль шкали: зважене середнє тем за їхньою вагою. Це та сама цифра, що в шапці. Дрейф проти минулого тижня: ${needle.direction} · ОЦІНКА`
          : 'Центр ваги поля, не нуль шкали: зважене середнє тем за їхньою вагою. Це та сама цифра, що в шапці. Перший тиждень у наборі · ОЦІНКА',
        x: field.needleX,
        y: field.axis.y,
      });
    } else {
      onHover(null);
    }
  }

  function onLeave() {
    if (hovered !== null || hoveredMoon !== null || hoveredLink !== null) {
      hovered = null;
      hoveredMoon = null;
      hoveredLink = null;
      canvas.style.cursor = 'default';
      kick();
    }
    onHover(null);
  }

  function onClick(e) {
    const box = canvas.getBoundingClientRect();
    const hit = pick(e.clientX - box.left, e.clientY - box.top);
    if (hit?.kind === 'moon') onSelectMoon(hit.moon.id);
    else if (hit?.kind === 'star') onSelect(hit.star.id);
    else if (hit?.kind === 'actor') onSelect(hit.actor.id);
    else if (hit?.kind !== 'needle' && hit?.kind !== 'link') onSelect(null);
  }

  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseleave', onLeave);
  canvas.addEventListener('click', onClick);

  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);
  const onWindowResize = () => resize();
  window.addEventListener('resize', onWindowResize);

  let dprMedia = null;
  function onDprChange() { resize(); watchDpr(); }
  function watchDpr() {
    if (dprMedia) dprMedia.removeEventListener('change', onDprChange);
    dprMedia = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    dprMedia.addEventListener('change', onDprChange);
  }
  watchDpr();
  resize();

  function destroy() {
    destroyed = true;
    if (raf) cancelAnimationFrame(raf);
    ro.disconnect();
    window.removeEventListener('resize', onWindowResize);
    if (dprMedia) dprMedia.removeEventListener('change', onDprChange);
    canvas.removeEventListener('mousemove', onMove);
    canvas.removeEventListener('mouseleave', onLeave);
    canvas.removeEventListener('click', onClick);
  }

  return {
    setScalefield, setActorfield, setActorShifts, setTopicShifts, setLayer, setGhosts,
    setSelected, setHighlight, pulse, setCinema, relayout: applyLayout, resize, destroy,
    getRect: () => rect,

    /**
     * G1: якорі для коуч-міток. Мітка мусить вказувати на РЕАЛЬНИЙ елемент,
     * інакше це знову абстрактне пояснення, яке спека і прийшла прибрати.
     * Два з чотирьох анкорів живуть на полотні, тому позиції віддає рушій:
     * зовні їх нізвідки взяти, канва це один елемент.
     *
     * Координати в CSS-пікселях відносно канви, як і решта геометрії рендера.
     * Якщо вузла потрібного виду цього тижня немає, повертається null: краще
     * не показати мітку, ніж показати її на чомусь іншому.
     */
    /**
     * Екранні позиції супутників-кейсів.
     *
     * Потрібне тільки перевірці: супутники живуть на канві, у DOM їх немає, і
     * без цього неможливо ПЕРЕВІРИТИ КЛІКОМ те, на що вказало приймання, тобто
     * що кожен супутник відкриває свій кейс, а не спільний список. Перевірка за
     * адресою цього не доводить: вона обходить і хіт-тест, і прив'язку.
     */
    getMoonAnchors: () => {
      if (layer !== 'topics') return [];
      const out = [];
      stars.forEach((s) => {
        if (!Number.isFinite(s._sx) || (s.curA ?? 0) < 0.15) return;
        (s.moons || []).forEach((m) => {
          if (!Number.isFinite(m._sx)) return;
          out.push({ id: m.id, x: Math.round(m._sx), y: Math.round(m._sy) });
        });
      });
      return out;
    },

    getCoachAnchors: () => {
      if (layer !== 'topics') return {};
      const live = stars.filter((s) => Number.isFinite(s._sx) && (s.curA ?? 1) > 0.2);
      const at = (s) => (s ? { x: s._sx, y: s._sy, r: s._sr } : null);

      // Найяскравіший: верхній рівень світіння, серед них найважчий.
      const bright = live
        .filter((s) => (s.glow || 2) === 1)
        .sort((a, b) => (b.salience ?? 0) - (a.salience ?? 0))[0]
        || live.sort((a, b) => (b.salience ?? 0) - (a.salience ?? 0))[0];

      // Вузол-гіпотеза: саме крапковий контур, а не будь-який пунктир.
      const hypo = live.find((s) => s.epistemic === 'hypothesis');

      return {
        brightest: at(bright),
        hypothesis: at(hypo),
        scale: field?.axis
          ? { x: (field.axis.x1 + field.axis.x2) / 2, y: field.axis.y, r: 0 }
          : null,
      };
    },
    // Три вікна для перевірки твінів у ноді (galaxy.tween.check.mjs). Рендер сюди
    // не заглядає, тому на поведінку карти вони не впливають.
    debugStars: () => stars,
    debugActors: () => actors,
    frameAt: (ms) => render((starTweenFrom || actorTweenFrom || 0) + ms),
    settle: () => { settleTween(); render(performance.now()); },
  };
}

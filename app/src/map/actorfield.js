// КАМЕРТОН · розкладка шару АКТОРИ.
// Той самий простір, що й у тем, але інші осі:
//   Горизонталь: ставлення від деструктиву (-1) до конструктиву (+1)
//   Вертикаль:   активність, пʼять смуг, активніші вище
//
// Вузол актора навмисно не схожий на зорю-тему: шестикутний контур з ядром,
// без ореолу і без променів. Читач має бачити, що це інша сутність, а не інша тема.
//
// Обидві координати тепер підписані осями, тому розкладка мусить їх не псувати:
// по вертикалі вузол не залишає смугу своєї активності, по горизонталі відходить
// від власного stance не далі за X_NUDGE. Інакше поділки на осі казали б неправду.

import { getActors } from '../data/selectors.js';
import { pickFold } from './starfield.js';

export const A_MIN = 22;
export const A_MAX = 40;

/** Скільки градацій активності показує вертикаль. Стільки ж смуг у полі. */
export const LANES = 5;

/** Наскільки пікселів розштовхування має право посунути вузол з його ставлення. */
export const X_NUDGE = 16;

/** Наскільки підпис має право відʼїхати від своєї фігури вбік. */
export const LABEL_DX_MAX = 64;

/** Скільки пікселів лишається у згині шкали. */
export const FOLD_MIN = 56;

/** Висота рядка підпису. Дзеркало LINE_H рендера: коробки мусять збігатись. */
const LABEL_LINE_H = 13;

/** Проміжки між сусідами при розштовхуванні. */
const GAP_X = 22;
const GAP_Y = 10;

/**
 * Радіус вузла від активності: три градації, а не плавна шкала.
 * Портрет має читатись, тому ширина шестикутника 44 / 60 / 80 пікселів.
 */
function radiusOf(activity) {
  const a = clampActivity(activity);
  if (a <= 2) return 22;
  if (a <= 3) return 30;
  return 40;
}

const clampActivity = (a) => Math.min(LANES, Math.max(1, a || 1));
const clampStance = (s) => Math.min(1, Math.max(-1, typeof s === 'number' ? s : 0));

/** Смуга активності: 5 угорі, 1 внизу. Нумерація зверху вниз, як рядки. */
export const laneOf = (activity) => LANES - clampActivity(activity);

/**
 * buildActorfield: актори тижня з їхніми осьовими координатами.
 * buildActorfield('2026-W31').nodes.length -> 10
 */
export function buildActorfield(weekId) {
  const actors = getActors(weekId);

  const nodes = actors.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    typeLabel: a.typeLabel,
    note: a.note,
    stance: a.stance,
    activity: a.activity,
    deltaStance: a.deltaStance,
    deltaActivity: a.deltaActivity,
    isNew: a.isNew,
    // тихий кокпіт: підсвічуємо тільки нових і тих, хто різко змінився
    loud: a.changed,
    links: a.links || [],
    radius: radiusOf(a.activity),
    lane: laneOf(a.activity),
    phase: 0,
  }));

  const ids = new Set(nodes.map((n) => n.id));
  const ties = [];
  nodes.forEach((n) => {
    n.links.forEach((l) => {
      if (ids.has(l.to)) ties.push({ from: n.id, to: l.to, tone: l.tone });
    });
  });

  return { weekId, nodes, ties };
}

/**
 * layoutActorfield: осьові координати в пікселі плюс обмежене розштовхування.
 * Габарити підпису рахує рендер, тут вони лише читаються.
 *
 * opts.axisH: скільки місця внизу відрізати під вісь.
 * Поля field.axis, field.lanes, field.toX і field.unitX читає рендер, коли малює вісь:
 * лінійка і вузли беруться з одного джерела, тому розійтись не можуть.
 */
export function layoutActorfield(field, rect, opts = {}) {
  const axisH = opts.axisH ?? 34;
  const gutter = opts.gutter ?? 56;

  const inner = {
    x: rect.x + gutter,
    y: rect.y + 8,
    w: Math.max(120, rect.w - gutter * 2),
    h: Math.max(120, rect.h - axisH - 8),
  };

  // Ставлення лінійне: -1 до лівого краю внутрішньої зони, +1 до правого.
  const linear = (stance) => inner.x + ((clampStance(stance) + 1) / 2) * inner.w;

  // Згин шкали, як у темах: коли панель забрала ширину, поле не зменшується,
  // а найбільша порожня ділянка шкали складається. Крок шкали і розмір фігур
  // лишаються ті самі, тому вузли читаються однаково при будь-яких панелях.
  const squeeze = Math.max(0, opts.squeeze || 0);
  field.fold = null;
  let toX = linear;
  if (squeeze > 0 && field.nodes.length) {
    const pts = [-1, ...field.nodes.map((n) => clampStance(n.stance)).sort((a, b) => a - b), 1];
    let best = null;
    for (let i = 1; i < pts.length; i++) {
      const gap = pts[i] - pts[i - 1];
      if (!best || gap > best.gap) best = { lo: pts[i - 1], hi: pts[i], gap };
    }
    const zone = pickFold(best.lo, best.hi, squeeze, linear, FOLD_MIN);
    const x0 = linear(zone.lo);
    const x1 = linear(zone.hi);
    const nat = x1 - x0;
    const amount = Math.min(squeeze, Math.max(0, nat - FOLD_MIN));
    if (amount > 1) {
      toX = (v) => {
        const x = linear(v);
        if (x <= x0) return x;
        if (x >= x1) return x - amount;
        return x0 + ((x - x0) / nat) * (nat - amount);
      };
      field.fold = { lo: zone.lo, hi: zone.hi, x: x0, w: nat - amount, amount };
    }
  }
  const laneH = inner.h / LANES;
  const laneMid = (lane) => inner.y + laneH * (lane + 0.5);

  const usedW = inner.w - (field.fold?.amount || 0);
  field.usedW = usedW;
  field.axis = { x: inner.x, y: inner.y + inner.h, w: usedW, h: axisH };
  field.lanes = Array.from({ length: LANES }, (_, lane) => ({
    lane,
    activity: LANES - lane,
    top: inner.y + laneH * lane,
    mid: laneMid(lane),
    bottom: inner.y + laneH * (lane + 1),
  }));
  field.inner = inner;
  field.toX = toX;
  // Скільки пікселів коштує одна одиниця ставлення. Модельний зсув малює хвіст
  // саме цією мірою, тому хвіст завжди збігається з віссю.
  field.unitX = inner.w / 2;
  field.linearToX = linear;

  field.nodes.forEach((n) => {
    n.lane = laneOf(n.activity);
    n.trueX = toX(n.stance);
    n.tx = n.trueX;
    n.ty = laneMid(n.lane);
  });

  const box = (n) => ({
    w: n.boxW ?? n.radius * 2,
    h: n.boxH ?? n.radius * 2,
    cy: n.ty + (n.boxOffY ?? 0),
  });

  // Обхід у сталому порядку: інакше та сама вхідна розкладка дає різні пікселі,
  // і рух вузла між тижнями не можна відрізнити від дрижання алгоритму.
  const order = field.nodes.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (let it = 0; it < 90; it++) {
    let moved = false;
    for (let i = 0; i < order.length; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const a = order[i];
        const b = order[j];
        const ba = box(a);
        const bb = box(b);
        const dx = b.tx - a.tx;
        const dy = bb.cy - ba.cy;
        const needX = ba.w / 2 + bb.w / 2 + GAP_X;
        const needY = ba.h / 2 + bb.h / 2 + GAP_Y;
        const ox = needX - Math.abs(dx);
        const oy = needY - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        // Вузли з різних смуг по вертикалі вже розведені: чіпаємо тільки горизонталь.
        const sameLane = a.lane === b.lane;
        if (!sameLane || ox / needX < oy / needY) {
          const push = (ox / 2) * Math.sign(dx || 1);
          a.tx -= push;
          b.tx += push;
        } else {
          const push = (oy / 2) * Math.sign(dy || 1);
          a.ty -= push;
          b.ty += push;
        }
        moved = true;
      }
    }

    field.nodes.forEach((n) => {
      const lane = field.lanes[n.lane];
      // Горизонталь: не далі за оголошений допуск від власного ставлення і не за край.
      // Край міряється радіусом вузла, а не шириною підпису: підпис на вузькому
      // екрані має право звисати, а ось вузол зрушити з його ставлення не має.
      const mx = n.radius + 4;
      n.tx = Math.min(n.trueX + X_NUDGE, Math.max(n.trueX - X_NUDGE, n.tx));
      n.tx = Math.min(rect.x + rect.w - mx, Math.max(rect.x + mx, n.tx));
      // Вертикаль: вузол лишається у своїй смузі активності, інакше поділки брешуть.
      const bn = box(n);
      const room = Math.max(0, laneH / 2 - Math.max(n.radius, bn.h / 2 - (bn.cy - n.ty)) - 2);
      n.ty = Math.min(lane.mid + room, Math.max(lane.mid - room, n.ty));
    });

    if (!moved) break;
  }

  // Другий поверх підписів. Ставлення тримає вузол на своєму X, тому сусідів у
  // ряду не розсунути; замість цього кожен другий у ланцюжку, що перекривається
  // по горизонталі, несе підпис над фігурою, а не під нею.
  // Чергувати через одного мало: три широкі підписи поспіль дають перший і третій
  // на одному поверсі, і вони знову зустрічаються. Тому кожен вузол сідає на той
  // поверх, де для нього справді є місце, а не на той, що випав за лічильником.
  // Зазор між сусідніми підписами. Було 4, тобто 8 пікселів між текстами: на
  // кеглі карти два підписи з таким проміжком читаються як один суцільний рядок
  // («Блогери і медіа Цивільні (аудиторія)»). Розводимо на видиму відстань.
  const LABEL_PAD = 9;
  const halfW = (n) => ((n.boxW ?? n.radius * 2) / 2 + LABEL_PAD);
  field.lanes.forEach((lane) => {
    const row = field.nodes
      .filter((n) => n.lane === lane.lane)
      .sort((a, b) => a.tx - b.tx || (a.id < b.id ? -1 : 1));
    const levels = [[], []]; // 0 = під фігурою, 1 = над нею
    row.forEach((n) => {
      n.labelDX = 0;
      n.labelHidden = false;
      const free = (lv) => levels[lv].every((o) => Math.abs(n.tx - o.tx) >= halfW(n) + halfW(o));
      const lv = free(0) ? 0 : free(1) ? 1 : levels[0].length <= levels[1].length ? 0 : 1;
      levels[lv].push(n);
      n.labelAbove = lv === 1;
    });

    // Якщо на поверсі все одно тісно, підпис зʼїжджає вбік. Рухається саме текст,
    // а не вузол: фігура лишається точно на своєму ставленні, бо її читає вісь.
    levels.forEach((level) => {
      const line = level.slice().sort((a, b) => a.tx - b.tx);
      for (let it = 0; it < 40; it++) {
        let moved = false;
        for (let i = 1; i < line.length; i++) {
          const a = line[i - 1];
          const b = line[i];
          const need = halfW(a) + halfW(b);
          const gap = need - ((b.tx + b.labelDX) - (a.tx + a.labelDX));
          if (gap <= 0) continue;
          a.labelDX -= gap / 2;
          b.labelDX += gap / 2;
          moved = true;
        }
        line.forEach((n) => {
          n.labelDX = Math.min(LABEL_DX_MAX, Math.max(-LABEL_DX_MAX, n.labelDX));
        });
        if (!moved) break;
      }

    });
  });

  // Останній прохід, уже глобальний і по реальних коробках підписів.
  //
  // Розведення вище працює всередині рівня «смуга + верх/низ», і цього мало:
  // підпис НАД вузлом нижньої смуги і підпис ПІД вузлом верхньої зустрічаються
  // у проміжку між смугами, тобто в групах, які між собою ніколи не звірялись.
  // Саме так «Вулиця і протест» налазила на «Блогери і медіа».
  //
  // Зсув обмежений LABEL_DX_MAX, тому після клампу пара все одно може лишитись
  // накладеною. Якщо місця справді немає, знімаємо підпис у менш важливого
  // вузла: це та сама дисципліна, що на темах, а імʼя лишається в тултіпі.
  const labelBox = (n) => {
    const lines = Math.max(1, n.lines?.length || 1);
    const h = lines * LABEL_LINE_H;
    const top = n.labelAbove
      ? n.ty - n.radius - 12 - (lines - 1) * LABEL_LINE_H - LABEL_LINE_H / 2
      : n.ty + n.radius + 12 - LABEL_LINE_H / 2;
    return { x: n.tx + n.labelDX, half: halfW(n), top, bottom: top + h };
  };

  const all = field.nodes
    .filter((n) => !n.labelHidden)
    .sort((a, b) => a.tx - b.tx);

  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      if (a.labelHidden || b.labelHidden) continue;
      const ba = labelBox(a);
      const bb = labelBox(b);
      // Рядки, що не перетинаються по вертикалі, одне одному не заважають.
      if (ba.bottom <= bb.top || bb.bottom <= ba.top) continue;
      if (Math.abs(bb.x - ba.x) >= ba.half + bb.half) continue;
      const keepA = (a.loud ? 1 : 0) - (b.loud ? 1 : 0)
        || (a.activity ?? 0) - (b.activity ?? 0);
      (keepA >= 0 ? b : a).labelHidden = true;
    }
  }

  return field;
}

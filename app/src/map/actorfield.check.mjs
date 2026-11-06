// КАМЕРТОН · перевірка розкладки шару АКТОРИ.
//
// Головне, що тут стережеться: вісь не має брехати. Якщо вузол виїхав зі смуги
// своєї активності або відійшов від власного ставлення далі за оголошений допуск,
// то підписані поділки перетворюють невиразну розкладку на явну неправду.

import {
  buildActorfield, layoutActorfield, laneOf, LANES, X_NUDGE, LABEL_DX_MAX,
} from './actorfield.js';

const RECT_S = { x: 24, y: 24, w: 1180, h: 560 };
const RECT_L = { x: 24, y: 24, w: 1680, h: 720 };
const RECT_XS = { x: 12, y: 12, w: 420, h: 520 };

let fails = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}  got=${JSON.stringify(got)}${ok ? '' : ' want=' + JSON.stringify(want)}`);
};

/** Підпис міряє рендер; тут підставляємо правдоподібні габарити, як у карті. */
const fake = (f) => {
  f.nodes.forEach((n) => {
    n.boxW = Math.min(200, 8 * String(n.name || n.id).length + 24);
    n.boxH = n.radius * 2 + 26;
    n.boxOffY = 0;
  });
  return f;
};
const build = (week, rect) => layoutActorfield(fake(buildActorfield(week)), rect, { axisH: 34 });

const w31 = build('2026-W31', RECT_S);
const w32 = build('2026-W32', RECT_S);
const w32L = build('2026-W32', RECT_L);
const w32XS = build('2026-W32', RECT_XS);

console.log('--- смуги активності ---');
eq('смуг рівно пʼять', w31.lanes.length, LANES);
eq('зверху найактивніші', w31.lanes.map((l) => l.activity), [5, 4, 3, 2, 1]);
eq('смуги йдуть підряд без щілин', w31.lanes.every((l, i) =>
  i === 0 || Math.abs(l.top - w31.lanes[i - 1].bottom) < 0.001), true);
eq('смуга вузла це його активність', w31.nodes.every((n) => n.lane === laneOf(n.activity)), true);

console.log('\n--- вузол не залишає своєї смуги ---');
const outOfLane = (f) => f.nodes.filter((n) => {
  const lane = f.lanes[n.lane];
  return n.ty < lane.top - 0.5 || n.ty > lane.bottom + 0.5;
}).map((n) => n.id);
eq('W31 усі в своїх смугах', outOfLane(w31), []);
eq('W32 усі в своїх смугах', outOfLane(w32), []);
eq('на вузькому екрані теж', outOfLane(w32XS), []);

console.log('\n--- горизонталь не бреше про ставлення ---');
const offAxis = (f) => f.nodes
  .filter((n) => Math.abs(n.tx - f.toX(n.stance)) > X_NUDGE + 0.5)
  .map((n) => [n.id, Math.round(n.tx - f.toX(n.stance))]);
eq('W31 у межах допуску', offAxis(w31), []);
eq('W32 у межах допуску', offAxis(w32), []);
eq('на широкому екрані теж', offAxis(w32L), []);
eq('на вузькому екрані теж', offAxis(w32XS), []);
eq('допуск оголошений і малий проти кроку шкали',
  X_NUDGE < w32.unitX * 0.25, true);

console.log('\n--- шкала і лінійка з одного джерела ---');
eq('нуль посередині внутрішньої зони',
  Math.round(w32.toX(0) - (w32.inner.x + w32.inner.w / 2)), 0);
eq('краї шкали це краї внутрішньої зони',
  [Math.round(w32.toX(-1) - w32.inner.x), Math.round(w32.toX(1) - (w32.inner.x + w32.inner.w))],
  [0, 0]);
eq('одиниця ставлення це половина внутрішньої ширини',
  Math.round(w32.unitX * 2 - w32.inner.w), 0);
eq('вісь лежить під полем', w32.axis.y >= w32.inner.y + w32.inner.h - 0.001, true);
eq('вісь на всю ширину внутрішньої зони',
  [w32.axis.x, Math.round(w32.axis.w)], [w32.inner.x, Math.round(w32.inner.w)]);

console.log('\n--- вузли не вилазять за поле ---');
const outside = (f, rect) => f.nodes.filter((n) =>
  n.tx - n.radius < rect.x - 1 || n.tx + n.radius > rect.x + rect.w + 1 ||
  n.ty - n.radius < rect.y - 1 || n.ty + n.radius > f.axis.y + 1).map((n) => n.id);
eq('W32 у межах прямокутника', outside(w32, RECT_S), []);
eq('на вузькому екрані теж', outside(w32XS, RECT_XS), []);

console.log('\n--- підписи не налазять один на одного ---');
const labelBox = (n) => {
  const w = n.boxW ?? n.radius * 2;
  const h = 13; // один рядок підпису
  const x = n.tx + (n.labelDX || 0);
  const y = n.labelAbove ? n.ty - n.radius - 12 - h : n.ty + n.radius + 12;
  return { l: x - w / 2, r: x + w / 2, t: y, b: y + h };
};
const labelHits = (f) => {
  const out = [];
  for (let i = 0; i < f.nodes.length; i++)
    for (let j = i + 1; j < f.nodes.length; j++) {
      const a = labelBox(f.nodes[i]);
      const b = labelBox(f.nodes[j]);
      if (a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t) out.push(`${f.nodes[i].id}/${f.nodes[j].id}`);
    }
  return out;
};
eq('W31 підписи розведені', labelHits(w31), []);
eq('W32 підписи розведені', labelHits(w32), []);
eq('на широкому екрані теж', labelHits(w32L), []);
// Зсув підпису не має права ставати зсувом вузла: вісь читає фігуру.
eq('підпис не відʼїжджає далі за оголошену межу',
  [w31, w32, w32L, w32XS].flatMap(f => f.nodes.filter(n => Math.abs(n.labelDX || 0) > LABEL_DX_MAX + 0.01).map(n => n.id)),
  []);

console.log('\n--- детермінованість ---');
const again = build('2026-W32', RECT_S);
eq('повторна розкладка дає ті самі пікселі',
  again.nodes.map((n) => [Math.round(n.tx), Math.round(n.ty)]),
  w32.nodes.map((n) => [Math.round(n.tx), Math.round(n.ty)]));

console.log('\n--- рух між тижнями означає рух даних ---');
const byId = (f) => Object.fromEntries(f.nodes.map((n) => [n.id, n]));
const a31 = byId(w31);
const a32 = byId(build('2026-W32', RECT_S));
const shared = Object.keys(a32).filter((id) => a31[id]);
eq('актори тягнуться з тижня в тиждень', shared.length, 10);

// Однакова активність означає ту саму смугу, хоч би хто зʼявився поруч.
const sameActivity = shared.filter((id) => a31[id].activity === a32[id].activity);
eq('є актори зі сталою активністю', sameActivity.length > 0, true);
eq('стала активність тримає смугу',
  sameActivity.filter((id) => a31[id].lane !== a32[id].lane), []);

// Головне: якщо актор поїхав горизонтально, то поїхало його ставлення, а не сусіди.
// Допуск подвоєний, бо розштовхування має право посунути обидва кінці.
const wrongWay = shared.filter((id) => {
  const ds = a32[id].stance - a31[id].stance;
  const dx = a32[id].tx - a31[id].tx;
  if (Math.abs(dx) < X_NUDGE * 2) return false;
  return Math.sign(dx) !== Math.sign(ds);
});
eq('помітний зсув по горизонталі завжди в бік зміни ставлення', wrongWay, []);

console.log(`\n${fails === 0 ? 'ВСЕ ЗІЙШЛОСЬ' : fails + ' ПРОВАЛІВ'}`);
process.exit(fails ? 1 : 0);

// КАМЕРТОН · перевірка шару ГРАВІТОН.
//
// Стереже рівно ті межі, які легко зламати мовчки при наступній правці:
//  - проєкція узгоджена з сирцями (тіло на кожну тему, пари на живі тіла);
//  - величини в дозволених діапазонах, без NaN і без вигаданих чисел;
//  - вердикти тільки з дозволеного словника, і їхні умови справді виконуються
//    на даних (вердикт без підстави це і є «домальована» аналітика);
//  - залишок руху сходиться арифметично: факт мінус прогноз;
//  - у текстах немає довгого тире (правило UI всього продукту);
//  - ваги проксі дистанції складаються в одиницю: інакше дистанція тихо
//    втратила б калібрування нуля і одиниці.
//
// Запуск: npm run check:graviton (входить у npm run check)

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const DATA = path.join(root, 'src', 'data');
const read = (...p) => JSON.parse(fs.readFileSync(path.join(DATA, ...p), 'utf8'));

const raw = read('raw', 'weeks.json');
const g = read('derived', 'graviton.json');
const cfg = read('config', 'thresholds.json').graviton;

const errors = [];
const warn = [];
const ok = (cond, msg) => { if (!cond) errors.push(msg); };

const VERDICTS = new Set(['attractor', 'metanarrative_candidate', 'high_entropy', 'unexplained_motion']);
const RES_STATES = new Set(['none', 'cut', 'single', 'contested']);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Ваги дистанції: сума рівно 1, інакше шкала 0..1 бреше.
const wSum = cfg.distance_w_resonance + cfg.distance_w_aud + cfg.distance_w_duration;
ok(Math.abs(wSum - 1) < 1e-9, `ваги дистанції мають складатись в 1, зараз ${wSum}`);

// Мапа методів: кожна величина, що зустрічається в тілах, має пояснене походження.
['mass', 'resonance', 'distance', 'entropy', 'halfLife', 'inertia', 'gravity', 'pairs',
  'residual', 'motion', 'force', 'phaseRisk']
  .forEach((k) => ok(typeof g.methods?.[k] === 'string' && g.methods[k].length > 0,
    `methods.${k}: походження величини не підписане`));

(raw.weeks || []).forEach((week) => {
  const w = g.weeks?.[week.id];
  ok(Boolean(w), `${week.id}: тижня немає в проєкції`);
  if (!w) return;

  const topicIds = new Set((week.topics || []).map((t) => t.id));
  ok(w.bodies.length === topicIds.size,
    `${week.id}: тіл ${w.bodies.length}, а тем у контракті ${topicIds.size}`);
  const seen = new Set();
  w.bodies.forEach((b) => {
    ok(topicIds.has(b.id), `${week.id}/${b.id}: тіло без теми в контракті`);
    ok(!seen.has(b.id), `${week.id}/${b.id}: тіло задвоєне`);
    seen.add(b.id);

    ok(b.mass === null || (isNum(b.mass.value) && b.mass.value >= 0.2 && b.mass.value <= 1),
      `${week.id}/${b.id}: маса поза шкалою`);
    ok(RES_STATES.has(b.resonance?.state), `${week.id}/${b.id}: невідомий стан резонансу`);
    ok(typeof b.resonance?.draft === 'boolean', `${week.id}/${b.id}: резонанс без прапорця чернетки`);
    ok(isNum(b.distance?.value) && b.distance.value >= cfg.distance_floor && b.distance.value <= 1,
      `${week.id}/${b.id}: дистанція поза шкалою`);
    if (b.entropy) {
      ok(isNum(b.entropy.volatility) && b.entropy.volatility >= 0 && b.entropy.points >= 2,
        `${week.id}/${b.id}: ентропія без виміру`);
    }
    if (b.halfLife) {
      ok(isNum(b.halfLife.weeks) && b.halfLife.weeks > 0
        && b.halfLife.points >= cfg.min_halflife_points,
      `${week.id}/${b.id}: напіврозпад без достатнього треку`);
    }
    if (b.residual) {
      ok(Math.abs(b.residual.actual - b.residual.predicted - b.residual.value) < 0.0015,
        `${week.id}/${b.id}: залишок не сходиться арифметично`);
    }
    ok(b.force === null || (isNum(b.force.value) && b.force.value >= 0 && b.force.value <= 1),
      `${week.id}/${b.id}: сила наративу поза 0..1`);
    ok(['none', 'low', 'moderate', 'high'].includes(b.phaseRisk),
      `${week.id}/${b.id}: невідомий ризик фазового переходу ${b.phaseRisk}`);
    // Верхній щабель ризику і вердикт кандидата це ОДНЕ правило: якщо вони
    // розійшлися, у моделі зʼявилось друге джерело тієї самої істини.
    const isCandidate = (b.verdicts || []).some((v) => v.id === 'metanarrative_candidate');
    ok((b.phaseRisk === 'high') === isCandidate,
      `${week.id}/${b.id}: ризик high і вердикт кандидата розійшлися`);
    // Без резонансу сила нуль: ядро не тягне те, що з ним не зчеплене.
    if (b.resonance.state === 'none' && b.force !== null) {
      ok(b.force.value === 0, `${week.id}/${b.id}: сила без резонансу має бути нулем`);
    }

    (b.verdicts || []).forEach((v) => {
      ok(VERDICTS.has(v.id), `${week.id}/${b.id}: невідомий вердикт ${v.id}`);
      ok(!String(v.text).includes('—'), `${week.id}/${b.id}: довге тире у вердикті`);
      // Вердикт без підстави в даних це домальована аналітика.
      if (v.id === 'attractor') {
        ok(b.gravity.inDegree >= cfg.attractor_min_in,
          `${week.id}/${b.id}: атрактор при ${b.gravity.inDegree} вхідних`);
      }
      if (v.id === 'metanarrative_candidate') {
        ok(b.distance.value <= cfg.candidate_max_distance,
          `${week.id}/${b.id}: кандидат при дистанції ${b.distance.value}`);
        ok(b.resonance.state === 'single' || b.resonance.state === 'contested',
          `${week.id}/${b.id}: кандидат без резонансу`);
      }
      if (v.id === 'high_entropy') {
        ok(b.entropy && b.entropy.volatility >= cfg.entropy_volatile,
          `${week.id}/${b.id}: висока ентропія без виміру`);
      }
      if (v.id === 'unexplained_motion') {
        ok(b.residual && Math.abs(b.residual.value) >= cfg.residual_unexplained,
          `${week.id}/${b.id}: залишок нижче порога`);
      }
    });
  });

  w.pairs.forEach((p) => {
    ok(seen.has(p.from) && seen.has(p.to), `${week.id}: пара ${p.from}->${p.to} на мертве тіло`);
    ok(isNum(p.force) && p.force >= 0 && p.force <= 1, `${week.id}: сила пари поза 0..1`);
    ok(isNum(p.distance) && p.distance >= cfg.pair_base_distance,
      `${week.id}: попарна дистанція менша за базу`);
  });

  // Ступені звʼязків у тілах мають збігатися з парами: це та сама величина.
  w.bodies.forEach((b) => {
    const inD = w.pairs.filter((p) => p.to === b.id).length;
    const outD = w.pairs.filter((p) => p.from === b.id).length;
    ok(b.gravity.inDegree === inD && b.gravity.outDegree === outD,
      `${week.id}/${b.id}: ступені звʼязків розійшлися з парами`);
  });
});

// Жива перевірка на відомому факті корпусу: у W32 криза довіри стягує пʼять
// вхідних звʼязків, і модель зобовʼязана бачити її атрактором. Якщо цей рядок
// упав, зламано не дані, а розрахунок.
const w32 = g.weeks?.['2026-W32'];
if (w32) {
  const trust = w32.bodies.find((b) => b.id === 't_gov_trust');
  ok(Boolean(trust?.verdicts?.some((v) => v.id === 'attractor')),
    'W32: t_gov_trust не розпізнаний атрактором (5 вхідних звʼязків у контракті)');
}

const weeksN = Object.keys(g.weeks || {}).length;
const bodiesN = Object.values(g.weeks || {}).reduce((a, w) => a + w.bodies.length, 0);
const verdictsN = Object.values(g.weeks || {})
  .reduce((a, w) => a + w.bodies.reduce((x, b) => x + (b.verdicts?.length || 0), 0), 0);

if (errors.length) {
  console.error(`ГРАВІТОН: ПРОВАЛ, помилок ${errors.length}`);
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
console.log(`ГРАВІТОН: ок · тижнів ${weeksN}, тіл ${bodiesN}, вердиктів ${verdictsN}`);
warn.forEach((m) => console.log(`  увага: ${m}`));

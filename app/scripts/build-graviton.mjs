// КАМЕРТОН · шар ГРАВІТОН · похідна проєкція derived/graviton.json.
//
// Рахує фізико-натхнені величини поля з того, що ВЖЕ виміряно контрактом і
// розмічено глибинним шаром: масу (нормована вага уваги), резонанс (стан
// розмітки сюжету), дистанцію до ядра (модельний проксі v1), ентропію
// (волатильність тону по треку), період напіврозпаду (тільки на реальному
// спаді), сили тяжіння по названих звʼязках і залишок «темної матерії»
// (фактичний рух мінус модельний).
//
// Правила чесності ті самі, що всюди в продукті:
//  - жодне число не вигадується: кожна величина несе метод походження
//    (виміряно / розмічено / модель), а відсутній вимір дає null, не нуль;
//  - формули живуть у src/data/graviton-physics.js, другої копії немає;
//  - константи моделі в config/thresholds.json (розділ graviton);
//  - скрипт читає raw/ і derived/depth.json, пише ТІЛЬКИ derived/graviton.json.
//
// Запуск: npm run build:graviton (входить у prebuild)

import fs from 'node:fs';
import path from 'node:path';
import {
  bodyMass, bodyResonance, bodyDistance, bodyEntropy, bodyHalfLife,
  pairDistance, pairForce, resonanceFactor, predictedToneDelta, darkResidual,
  narrativeForce, phaseRisk, QUANTITY_METHOD,
} from '../src/data/graviton-physics.js';

const root = process.cwd();
const DATA = path.join(root, 'src', 'data');
const OUT = path.join(DATA, 'derived', 'graviton.json');
const read = (...p) => JSON.parse(fs.readFileSync(path.join(DATA, ...p), 'utf8'));

const raw = read('raw', 'weeks.json');
const depth = read('derived', 'depth.json');
const topicReg = read('registry', 'topics.json');
const cfg = read('config', 'thresholds.json').graviton;

if (!cfg) {
  console.error('config/thresholds.json не має розділу graviton');
  process.exit(1);
}

// Канонізація id тем: та сама мапа злиттів, що і в selectors (merged_into у
// реєстрі). Без неї трек перейменованої теми виглядав би обрізаним і тема
// здавалася б молодшою, ніж вона є.
const mergedInto = new Map(
  (Array.isArray(topicReg) ? topicReg : topicReg.topics || [])
    .filter((t) => t.merged_into)
    .map((t) => [t.id, t.merged_into])
);
const canon = (id) => {
  let cur = id;
  const seen = new Set();
  while (mergedInto.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    cur = mergedInto.get(cur);
  }
  return cur;
};

const weeks = raw.weeks || [];
const round3 = (v) => Math.round(v * 1000) / 1000;

/** Трек величини по родині id до тижня включно. */
function track(topicId, uptoIndex, pick) {
  const want = canon(topicId);
  const out = [];
  for (let i = 0; i <= uptoIndex; i += 1) {
    const t = (weeks[i].topics || []).find((x) => canon(x.id) === want);
    if (t) out.push(pick(t));
  }
  return out;
}

const projected = {};
// Модельний прогноз руху, зроблений на тижні w, перевіряється на тижні w+1:
// сили діють у переході, тому залишок тижня рахується проти прогнозу з
// ПОПЕРЕДНЬОГО зрізу, а не проти сил, яких на момент руху ще не було видно.
let predictionsFromPrev = new Map();

weeks.forEach((week, wi) => {
  const topics = week.topics || [];
  const hostOf = new Map((week.cases || []).map((c) => [c.id, canon(c.host_topic)]));
  const markupsByTopic = new Map();
  (depth.markups || [])
    .filter((m) => m.week === week.id)
    .forEach((m) => {
      const tid = canon(m.topic_id || hostOf.get(m.case_id) || '');
      if (!tid) return;
      if (!markupsByTopic.has(tid)) markupsByTopic.set(tid, []);
      markupsByTopic.get(tid).push(m);
    });

  const prevWeek = wi > 0 ? weeks[wi - 1] : null;
  const prevTopic = (id) => prevWeek
    ? (prevWeek.topics || []).find((x) => canon(x.id) === canon(id)) || null
    : null;

  // Перший прохід: тіла з власними величинами.
  const bodies = topics.map((t) => {
    const toneTrack = track(t.id, wi, (x) => x.tone_score);
    const salTrack = track(t.id, wi, (x) => x.salience);
    const resonance = bodyResonance(markupsByTopic.get(canon(t.id)));
    const mass = bodyMass(t.salience);
    const distance = bodyDistance({
      resonanceState: resonance.state,
      aud: t.aud,
      weeksPresent: salTrack.length,
      weeksTotal: wi + 1,
    }, cfg);
    const entropy = bodyEntropy(toneTrack);
    const halfLife = bodyHalfLife(salTrack, cfg);
    const prev = prevTopic(t.id);
    const dTone = prev && typeof prev.tone_score === 'number' && typeof t.tone_score === 'number'
      ? round3(t.tone_score - prev.tone_score) : null;
    const dSalience = prev && typeof prev.salience === 'number' && typeof t.salience === 'number'
      ? t.salience - prev.salience : null;
    return {
      id: t.id,
      // Службові поля для розрахунку пар і вердиктів: у файл НЕ пишуться, бо
      // tone/aud/trend вже живуть у контракті тижня, а одне число має одне
      // джерело. Екран зшиває їх селектором, як робить withDerived.
      _tone: typeof t.tone_score === 'number' ? t.tone_score : null,
      _trend: t.trend || null,
      mass,
      resonance,
      distance,
      ...(entropy ? { entropy } : {}),
      ...(halfLife ? { halfLife } : {}),
      motion: { dTone, dSalience, isNew: !prev },
      inertia: { weeksPresent: salTrack.length, weeksTotal: wi + 1 },
    };
  });
  const byId = new Map(bodies.map((b) => [canon(b.id), b]));

  // Другий прохід: сили тяжіння по названих звʼязках тижня. Сила мутуальна,
  // напрямок звʼязку лишається в парі як напрямок причини, а не сили.
  const rawPairs = [];
  topics.forEach((t) => {
    (t.links || []).forEach((l) => {
      const from = byId.get(canon(t.id));
      const to = byId.get(canon(l.to));
      if (!from || !to || from === to) return;
      const d = pairDistance(from._tone, to._tone, cfg);
      const resMax = Math.max(
        resonanceFactor(from.resonance.state),
        resonanceFactor(to.resonance.state)
      );
      const f = pairForce(from.mass?.value ?? null, to.mass?.value ?? null, resMax, d);
      if (f === null) return;
      rawPairs.push({ from: from.id, to: to.id, f, d: round3(d) });
    });
  });
  const fMax = rawPairs.reduce((a, p) => Math.max(a, p.f), 0);
  const pairs = rawPairs.map((p) => ({
    from: p.from,
    to: p.to,
    // Абсолютне число сили фізичного сенсу не має, тому назовні йде тільки
    // нормоване по тижню: 1 це найсильніший звʼязок цього зрізу.
    force: fMax > 0 ? round3(p.f / fMax) : 0,
    distance: p.d,
  }));

  // Третій прохід: агрегати тяжіння, модельний рух і залишок.
  const predictionsForNext = new Map();
  bodies.forEach((b) => {
    const inbound = pairs.filter((p) => canon(p.to) === canon(b.id));
    const outbound = pairs.filter((p) => canon(p.from) === canon(b.id));
    b.gravity = {
      inDegree: inbound.length,
      outDegree: outbound.length,
      inForce: round3(inbound.reduce((a, p) => a + p.force, 0)),
      outForce: round3(outbound.reduce((a, p) => a + p.force, 0)),
    };
    const pulls = [...inbound, ...outbound].map((p) => {
      const otherId = canon(p.from) === canon(b.id) ? p.to : p.from;
      const other = byId.get(canon(otherId));
      return other && typeof other._tone === 'number'
        ? { force: p.force, tone: other._tone } : null;
    }).filter(Boolean);
    predictionsForNext.set(canon(b.id), predictedToneDelta(b._tone, pulls, cfg));

    const predicted = predictionsFromPrev.has(canon(b.id))
      ? predictionsFromPrev.get(canon(b.id)) : null;
    if (predicted !== null && b.motion.dTone !== null) {
      b.residual = {
        actual: b.motion.dTone,
        predicted,
        value: darkResidual(b.motion.dTone, predicted),
      };
    }
  });

  // Сила наративу F = M × R / D², нормована по тижню, і ризик фазового
  // переходу. Це центральна формула шару: не «тема велика», а «ядро тягне
  // тему з такою силою, і ось ризик, що вона стрибне в метанаратив».
  const forceRaw = new Map(bodies.map((b) => [
    b.id,
    narrativeForce(b.mass?.value ?? null, b.resonance.state, b.distance.value),
  ]));
  const forceMax = [...forceRaw.values()].reduce((a, v) => Math.max(a, v || 0), 0);
  bodies.forEach((b) => {
    const raw = forceRaw.get(b.id);
    b.force = raw === null ? null : { value: forceMax > 0 ? round3(raw / forceMax) : 0 };
    b.phaseRisk = phaseRisk({
      resonanceState: b.resonance.state,
      distance: b.distance.value,
      growing: b._trend === 'up' || (b.motion.dSalience !== null && b.motion.dSalience > 0),
    }, cfg);
  });

  // Вердикти: інтерпретації моделі. Кожен несе підставу з виміряного і
  // позначку методу, бо це рівно той рядок, який читач побачить на екрані.
  bodies.forEach((b) => {
    const v = [];
    if (b.gravity.inDegree >= cfg.attractor_min_in) {
      v.push({
        id: 'attractor',
        text: `атрактор: стягує звʼязки поля (${b.gravity.inDegree} вхідних)`,
        method: 'модель',
      });
    }
    const resonant = b.resonance.state === 'single' || b.resonance.state === 'contested';
    const growing = b._trend === 'up' || (b.motion.dSalience !== null && b.motion.dSalience > 0);
    if (resonant && growing && b.distance.value <= cfg.candidate_max_distance) {
      v.push({
        id: 'metanarrative_candidate',
        text: 'кандидат у метанаратив: резонанс з архетипом, мала дистанція, вага росте',
        method: 'модель',
      });
    }
    if (b.entropy && b.entropy.points >= cfg.min_entropy_points
      && b.entropy.volatility >= cfg.entropy_volatile) {
      v.push({
        id: 'high_entropy',
        text: `висока ентропія: тон нестабільний по ${b.entropy.points} тижнях`,
        method: 'виміряно',
      });
    }
    if (b.residual
      && Math.abs(b.residual.value) >= cfg.residual_unexplained
      && Math.abs(b.residual.actual) >= cfg.residual_unexplained) {
      v.push({
        id: 'unexplained_motion',
        text: 'рух не пояснено видимими звʼязками: можливий прихований драйвер',
        method: 'модель',
      });
    }
    if (v.length) b.verdicts = v;
  });

  predictionsFromPrev = predictionsForNext;
  // Службові поля розрахунку в файл не йдуть: tone і trend вже є в контракті.
  projected[week.id] = {
    bodies: bodies.map(({ _tone, _trend, ...b }) => b),
    pairs,
  };
});

const out = {
  _note: 'Породжується scripts/build-graviton.mjs з raw/weeks.json і derived/depth.json. Руками не редагується.',
  _method_note: 'Метод походження величини один на величину, а не на запис: мапа methods нижче. Відсутній вимір це відсутнє поле, а не нуль.',
  methods: QUANTITY_METHOD,
  weeks: projected,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`, 'utf8');

const bytes = fs.statSync(OUT).size;
const stats = Object.entries(projected).map(([id, w]) => {
  const verdicts = w.bodies.reduce((a, b) => a + (b.verdicts?.length || 0), 0);
  return `${id}: тіл ${w.bodies.length}, пар ${w.pairs.length}, вердиктів ${verdicts}`;
});
console.log(`derived/graviton.json: ${(bytes / 1024).toFixed(1)} КБ`);
stats.forEach((s) => console.log(`  ${s}`));

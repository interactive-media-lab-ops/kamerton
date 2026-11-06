// КАМЕРТОН · внесення історичних прецедентів у корпус і в тиждень.
//
// Вхід: JSON зі структурою { perCase: [...], narratives: [...] }, зібраний
// ресерчем за правилами Спеки F. Вихід: файли корпусу і масив week.precedents.
//
// Що робить цей сценарій і чого НЕ робить.
//
// Робить механіку: розкладає кейси по файлах, рахує розподіл наслідків у класі,
// збирає картку з полів корпусу, проставляє статус підпису.
//
// НЕ пише за людину два блоки, які вирішують чесність картки. «Чому релевантний»
// береться з likenesses, які дослідник вивів з джерел. «Де аналогія ламається»
// збирається з differences, і кожна з них мусить мати наслідок для застосовності,
// інакше кейс не проходить. Вигадати їх тут неможливо і не можна: механічний
// текст на місці судження це рівно та підміна, проти якої написана вся Спека F.
//
// Підпис завжди виходить у стані «очікує». Це не заглушка, а чесний робочий
// стан: джерела зібрані, людина ще не звіряла.
//
// Запуск: node scripts/ingest-precedents.mjs <файл.json>

import fs from 'node:fs';
import path from 'node:path';

const IN = process.argv[2];
if (!IN) {
  console.error('вкажіть файл з результатом ресерчу');
  process.exit(1);
}

const RAW = path.join(process.cwd(), 'src', 'data', 'raw', 'weeks.json');
const CORPUS_DIR = path.join(process.cwd(), 'src', 'data', 'corpus', 'precedents');
const TODAY = '2026-08-16';

const payload = JSON.parse(fs.readFileSync(IN, 'utf8'));

/** Тип джерела за видавцем: первинне, академічне, журналістське. */
function sourceType(org = '') {
  const s = org.toLowerCase();
  if (/архів|archive|gov|уряд|парламент|суд|commission|комісі/.test(s)) return 'primary';
  if (/university|універси|journal|press|encyclop|британік|britannica|history/.test(s)) return 'academic';
  return 'journalistic';
}

/**
 * Клас кейса береться з реєстру і від МЕХАНІЗМУ нашого кейса, до якого він
 * підібраний, а не з власної мітки дослідника.
 *
 * Причина не в акуратності. Дослідник дає кожній події влучну, але унікальну
 * назву («другий розбір виправдав усіх», «зовнішня слідча комісія»), і при
 * такій розкладці в кожному класі виявляється рівно один кейс. Розподіл
 * наслідків у класі тоді не існує ніколи, а саме він відповідає на питання
 * «чим такі історії закінчувались». Власна назва дослідника лишається другим
 * тегом: вона точна і її шкода втрачати.
 */
const CLASS_OF_CASE = {
  case_225_425: 'command_responsibility',
  case_lviv_tck: 'mobilisation_pressure',
  case_szch_order: 'desertion_crackdown',
  case_svr_appointment: 'cadre_decision',
};

/** Історичний кейс у формі контракту. */
function toCorpusCase(h, ourCaseId) {
  return {
    id: h.id,
    title: h.title,
    headline: h.headline,
    what_happened: h.whatHappened,
    led_to: h.ledTo,
    // У class_tags іде ТІЛЬКИ клас зі словника: він керований і по ньому
    // рахується розподіл наслідків. Влучна назва дослідника точна, але
    // одноразова, і в словнику з семи унікальних значень не було б жодної
    // групи. Тому вона лишається приміткою.
    class_tags: [CLASS_OF_CASE[ourCaseId] || h.classTag],
    notes: h.classTagLabel ? `характеристика механізму: ${h.classTagLabel}` : undefined,
    shelf: 'external',
    period: h.period,
    geo: h.geo,
    war_context: h.warContext || 'не воєнний контекст',
    trigger: h.trigger,
    actors: [],
    system_response: { what: h.systemResponse, speed_hours: null },
    info_environment: h.infoEnvironment || 'mixed',
    timeline: (h.timeline || []).map((t) => ({
      offset_weeks: t.offsetWeeks,
      phase: t.phase,
      event: t.event,
    })),
    outcome: { code: h.outcome.code, description: h.outcome.text },
    // Дослідник подекуди вписує дату звернення прямо у назву видавця. Дублювати
    // її другий раз означало б зробити посилання нечитабельним, тому знімаємо.
    sources: (h.sources || []).map((s) => {
      const org = String(s.organisation || '').replace(/,?\s*звернення\s+[\d.]+\s*$/i, '').trim();
      return {
        type: sourceType(org),
        ref: `${s.url} · ${org} (звернення ${TODAY})`,
        quality: s.quality || 2,
      };
    }),
    seeded: false,
    adaptation: true,
    signature: 'pending',
    verified_by: 'підпис: очікує',
    added_by: 'ресерч за Спекою F, адаптація з відкритих джерел',
    added_date: TODAY,
  };
}

/** Розподіл наслідків усередині класу. Рахується по всьому корпусу, не по картці. */
function distribution(all, classTag) {
  const inClass = all.filter((c) => (c.class_tags || []).includes(classTag));
  const buckets = new Map();
  inClass.forEach((c) => {
    const k = c.outcome.code;
    buckets.set(k, (buckets.get(k) || 0) + 1);
  });
  return {
    n: inClass.length,
    buckets: [...buckets].map(([outcome_code, k]) => ({ outcome_code, k })),
  };
}

/* ---------- 1. корпус ---------- */

const existing = fs.readdirSync(CORPUS_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(CORPUS_DIR, f), 'utf8')));

// Наративи для кейсів, які вже лежали в корпусі без людської подачі.
let patched = 0;
(payload.narratives || []).forEach((n) => {
  const c = existing.find((x) => x.id === n.id);
  if (!c) return;
  c.headline = n.headline;
  c.what_happened = n.whatHappened;
  c.led_to = n.ledTo;
  fs.writeFileSync(path.join(CORPUS_DIR, `${c.id}.json`), JSON.stringify(c, null, 2) + '\n');
  patched += 1;
});

const added = [];
(payload.perCase || []).forEach((lane) => {
  (lane.cases || []).forEach((h) => {
    // Вердикт адверсарної перевірки має право викинути кейс.
    const v = (lane.verdicts || []).find((x) => x.historicalId === h.id);
    if (v && v.keep === false) {
      console.log(`  відкинуто ${h.id}: ${v.whyDrop}`);
      return;
    }
    if (existing.some((x) => x.id === h.id) || added.some((x) => x.id === h.id)) return;
    const c = toCorpusCase(h, lane.caseId);
    fs.writeFileSync(path.join(CORPUS_DIR, `${c.id}.json`), JSON.stringify(c, null, 2) + '\n');
    added.push(c);
  });
});

const corpus = [...existing, ...added];
console.log(`корпус: ${corpus.length} кейсів (дописано наративів ${patched}, додано ${added.length})`);

/* ---------- 2. картки в тижні ---------- */

const before = fs.readFileSync(RAW, 'utf8');
const data = JSON.parse(before);
const week = data.weeks[data.weeks.length - 1];

const cards = [];
(payload.perCase || []).forEach((lane) => {
  const ourCase = (week.cases || []).find((c) => c.id === lane.caseId);
  if (!ourCase) {
    console.log(`  кейса ${lane.caseId} у тижні немає, картку не роблю`);
    return;
  }
  const keep = (lane.cases || []).filter((h) => {
    const v = (lane.verdicts || []).find((x) => x.historicalId === h.id);
    return !v || v.keep !== false;
  });
  if (!keep.length) {
    console.log(`  ${lane.caseId}: гідних прецедентів немає, картка не створюється`);
    return;
  }

  const analogs = keep.slice(0, 3).map((h) => ({
    historical_case_id: h.id,
    likenesses: h.likenesses,
    differences: h.differences,
    transferability: h.transferability,
  }));

  const tag = CLASS_OF_CASE[lane.caseId] || keep[0].classTag;
  const dist = distribution(corpus, tag);

  cards.push({
    id: `pc_${lane.caseId}`,
    case_id: lane.caseId,
    class_summary: lane.classSummary || keep[0].classTagLabel || tag,
    analogs,
    comparison_matrix: lane.comparisonMatrix || [],
    outcome_distribution: dist,
    // Обидва людські блоки приходять з ресерчу, де вони прив'язані до фактів
    // кейсів, а не виводяться механічно тут.
    break_conditions: lane.breakConditions || [],
    watch_signals: lane.watchSignals || [],
    scores: {
      structural_similarity: lane.similarity || 'med',
      transferability: analogs[0].transferability,
      base_quality: dist.n >= 3 ? 'med' : 'low',
      n: dist.n,
    },
    current_phase_index: lane.currentPhaseIndex ?? 1,
    status: 'active',
    status_history: [
      { at: TODAY, status: 'active', note: 'зібрано з адаптованих історичних кейсів, підпис очікує' },
    ],
    verified_by: 'підпис: очікує',
    verified_date: '',
    adaptation: true,
    signature: 'pending',
  });
});

week.precedents = cards;

const after = JSON.stringify(data, null, 2) + '\n';
if (after !== before) fs.writeFileSync(RAW, after);

console.log(`\nкарток у тижні ${week.id}: ${cards.length}`);
cards.forEach((c) => {
  console.log(`  ${c.case_id}: аналогів ${c.analogs.length}, база ${c.outcome_distribution.n}, `
    + `де ламається ${c.break_conditions.length}, маркерів ${c.watch_signals.length}`);
});
const noCard = (week.cases || []).filter((c) => !cards.some((x) => x.case_id === c.id));
if (noCard.length) {
  console.log(`  без карток (чесний порожній стан): ${noCard.map((c) => c.id).join(', ')}`);
}
console.log(`сирці ${after !== before ? 'оновлено' : 'без змін'}`);

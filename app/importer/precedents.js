// КАМЕРТОН · F2 · механіка інструменту збірки карток прецедентів.
//
// Ключове обмеження, задане правилом 2 Спеки F: чернетка картки складається
// ВИКЛЮЧНО з полів відібраних кейсів корпусу. Жоден рядок тут не вигадує факт;
// усе, що потрапляє в текст, має походження в конкретному полі конкретного
// кейса. Тому генератор не «пише», а перекладає структуру в речення.

import { outcomeDistribution } from '../src/data/schema.js';
import classTags from '../src/data/registry/class_tags.json';
import phasesDict from '../src/data/registry/phases.json';

export const CLASS_TAGS = classTags.class_tags;
export const OUTCOME_CODES = classTags.outcome_codes;
export const SHELVES = classTags.shelves;
export const PHASES = phasesDict.phases;

const label = (list, id) => list.find((x) => x.id === id)?.label || id;
export const outcomeLabel = (id) => label(OUTCOME_CODES, id);
export const classLabel = (id) => label(CLASS_TAGS, id);
export const shelfLabel = (id) => label(SHELVES, id);
export const phaseLabel = (id) => label(PHASES, id);

/* ------------------------------------------------------------------ */
/* Пошук і ранжування (розділ 4 Спеки F)                               */
/* ------------------------------------------------------------------ */

/**
 * Ранжування чотирма РОЗДІЛЬНИМИ осями. Жодного зведення в один бал: правило 5
 * забороняє зведений відсоток, а зведений «скор» це те саме число під іншою
 * назвою. Кожна вісь показується окремо, і людина зважує їх сама.
 */
export function rankCandidates(cases, passport) {
  const wantClasses = new Set(passport.class_tags || []);
  const wantPhases = new Set((passport.phase_map || []).map((p) => p.phase));

  return (cases || []).map((c) => {
    const classes = (c.class_tags || []).filter((t) => wantClasses.has(t));
    const phases = new Set((c.timeline || []).map((t) => t.phase));
    const phaseCover = [...wantPhases].filter((p) => phases.has(p));

    // Причини потрапляння у shortlist. Без них вибір неможливо перевірити,
    // а саме перевірюваність відбору закриває ризик «зручного аналога».
    const reasons = [];
    if (classes.length) reasons.push(`клас збігається: ${classes.map(classLabel).join(', ')}`);
    if (phaseCover.length >= 3) reasons.push(`траєкторія покриває ${phaseCover.length} фази з чотирьох`);
    if (c.war_context && passport.war_context && c.war_context !== passport.war_context) {
      reasons.push('воєнний контекст інший: перевірити переносимість');
    }
    if (c.seeded) reasons.push('seeded: у розподіли не входить');

    const quality = sourceQuality(c);
    return {
      case: c,
      axes: {
        similarity: classes.length ? (phaseCover.length >= 3 ? 'high' : 'med') : 'low',
        base_quality: quality,
        transferability: transferability(c, passport),
        critical_differences: (c.notes || '').includes('Не переноситься') ? 'named' : 'not named',
      },
      reasons,
    };
  }).sort((a, b) => rankScore(b) - rankScore(a));
}

// Порядок показу, а не оцінка кейса: він ніде не показується і ні в що не входить.
const LEVEL = { high: 2, med: 1, low: 0 };
const rankScore = (r) => LEVEL[r.axes.similarity] * 2 + LEVEL[r.axes.base_quality];

function sourceQuality(c) {
  const s = c.sources || [];
  if (s.length < 2) return 'low';
  const best = Math.min(...s.map((x) => x.quality));
  if (best === 1) return 'high';
  return s.every((x) => x.quality === 3) ? 'low' : 'med';
}

/**
 * Переносимість падає там, де відрізняється воєнний контекст або інформаційне
 * середовище: саме ці дві осі найчастіше ламають аналогію непомітно.
 */
function transferability(c, passport) {
  let hits = 0;
  if (passport.war_context && c.war_context === passport.war_context) hits += 1;
  if (passport.info_environment && c.info_environment === passport.info_environment) hits += 1;
  return hits === 2 ? 'high' : hits === 1 ? 'med' : 'low';
}

/* ------------------------------------------------------------------ */
/* Чернетка картки: тільки з полів корпусу                             */
/* ------------------------------------------------------------------ */

/**
 * Складає PrecedentCard з відібраних кейсів.
 *
 * Кожне поле виводиться з конкретного поля кейса. Там, де людина мусить
 * написати сама (чому релевантний, де ламається), лишається порожньо: це
 * навмисно, бо саме ці два блоки не можна вивести механічно, і саме вони
 * вирішують, чи картка чесна.
 */
export function draftCard({ passport, picked, allCases }) {
  const analogs = picked.slice(0, 3).map((c) => ({
    historical_case_id: c.id,
    // Схожості виводяться зі збігу класів і фаз: це факт структури, не оцінка.
    likenesses: [
      ...(c.class_tags || [])
        .filter((t) => (passport.class_tags || []).includes(t))
        .map((t) => `той самий клас: ${classLabel(t)}`),
      ...(c.timeline || [])
        .filter((t) => t.phase === 'turn')
        .map((t) => `перелом того ж роду: ${t.event}`),
    ],
    // Відмінності беруться з полів, які РІЗНЯТЬСЯ. Порожній список тут
    // означає, що людина ще не написала своє, і картка не публікується.
    differences: [
      ...(c.war_context && c.war_context !== passport.war_context
        ? [`воєнний контекст: у кейсі «${c.war_context}», у нас «${passport.war_context}»`] : []),
      ...(c.info_environment && c.info_environment !== passport.info_environment
        ? [`інформаційне середовище: у кейсі «${c.info_environment}», у нас «${passport.info_environment}»`] : []),
      ...(c.notes && c.notes.includes('Не переноситься')
        ? [c.notes.slice(c.notes.indexOf('Не переноситься'))] : []),
    ],
    transferability: transferability(c, passport),
  }));

  // Розподіл рахується по ВСЬОМУ класу, а не по трьох відібраних: інакше це
  // був би розподіл нашого вибору, а не поля. Seeded виключається (правило 8).
  const primaryClass = (passport.class_tags || [])[0];
  const dist = primaryClass
    ? outcomeDistribution(allCases, primaryClass)
    : { n: 0, buckets: [], excluded_seeded: 0 };

  return {
    id: `pc_${passport.case_id}`,
    case_id: passport.case_id,
    class_summary: (passport.mechanism_chain || []).join(' -> '),
    analogs,
    comparison_matrix: buildMatrix(passport, picked),
    outcome_distribution: { n: dist.n, buckets: dist.buckets },
    // Ці два блоки навмисно порожні: їх пише людина.
    break_conditions: [],
    watch_signals: [],
    scores: {
      structural_similarity: analogs.length ? 'med' : 'low',
      transferability: analogs[0]?.transferability || 'low',
      base_quality: picked.length ? sourceQuality(picked[0]) : 'low',
      n: dist.n,
    },
    status: 'active',
    status_history: [],
    verified_by: 'підпис: очікує',
    verified_date: '',
  };
}

function buildMatrix(passport, picked) {
  const first = picked[0];
  if (!first) return [];
  const rows = [
    ['воєнний контекст', passport.war_context, first.war_context],
    ['інформаційне середовище', passport.info_environment, first.info_environment],
    ['швидкість відповіді системи', passport.response_speed, first.system_response?.what],
  ];
  return rows
    .filter(([, a, b]) => a || b)
    .map(([factor, today, analog]) => ({
      factor,
      today: String(today ?? 'не задано'),
      analog: String(analog ?? 'не задано'),
      transferability: today && analog && today === analog ? 'high' : 'low',
    }));
}

/**
 * Готовність картки до публікації. Повертає перелік того, чого бракує, а не
 * булеве «ні»: людина має бачити, що саме дописати.
 */
export function cardBlockers(card) {
  const out = [];
  if (!card.analogs?.length) out.push('жодного аналога не відібрано');
  card.analogs?.forEach((a) => {
    if (!a.differences?.length) {
      out.push(`аналог ${a.historical_case_id}: не названо жодної відмінності`);
    }
  });
  if (!card.break_conditions?.length) {
    out.push('блок «де аналогія ламається» порожній: без нього картка не публікується');
  }
  if (!card.watch_signals?.length) out.push('не названо, що спостерігаємо');
  if (!card.outcome_distribution?.n) out.push('розподіл наслідків порожній');
  return out;
}

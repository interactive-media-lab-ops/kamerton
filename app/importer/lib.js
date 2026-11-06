// КАМЕРТОН · механіка імпортера тижня.
//
// Тут немає жодного власного правила валідації: схема, реєстри і пороги
// приходять з ../src/data, тобто з того самого місця, що і у вʼювера. Друга
// копія правил розійшлась би з першою мовчки, і саме так у корпус колись
// потрапила третя форма method_notes.

import { validateContract, formatIssues } from '../src/data/schema.js';
import topicRegistry from '../src/data/registry/topics.json';
import actorRegistry from '../src/data/registry/actors.json';
import caseRegistry from '../src/data/registry/cases.json';
import thresholds from '../src/data/config/thresholds.json';

export const REGISTRIES = {
  topics: topicRegistry,
  actors: actorRegistry,
  cases: caseRegistry,
};

export const THRESHOLDS = thresholds;

/** Мапа злиттів з реєстру: псевдонім -> канонічний id (G7). */
export const ALIAS = (() => {
  const m = new Map();
  topicRegistry.forEach((t) => {
    (t.aliases || []).forEach((a) => m.set(a, t.id));
    if (t.merged_into) m.set(t.id, t.merged_into);
  });
  return m;
})();

export const canonical = (id) => ALIAS.get(id) || id;

/* ------------------------------------------------------------------ */
/* H2 · клон попереднього тижня                                        */
/* ------------------------------------------------------------------ */

/** Наступний ідентифікатор тижня: 2026-W32 -> 2026-W33, з переходом через рік. */
export function nextWeekId(id) {
  const m = String(id).match(/^(\d{4})-W(\d{1,2})$/);
  if (!m) return '';
  const year = Number(m[1]);
  const week = Number(m[2]);
  return week >= 52 ? `${year + 1}-W1` : `${year}-W${week + 1}`;
}

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Клон попереднього тижня як стартова точка.
 *
 * Що НЕ переноситься і чому: розвʼязки прогнозів (їх дає редактор цього тижня),
 * оцінки ринків і накопичена історія (вони похідні), і вердикт тижня, бо
 * скопійований вердикт це найшвидший спосіб видати минулий тиждень за новий.
 */
export function cloneWeek(prev) {
  const id = nextWeekId(prev.id);
  const from = addDays(prev.period.to, 1);
  return {
    ...structuredClone(prev),
    id,
    period: { from, to: addDays(from, 6) },
    data_quality: 'draft',
    verdict: { threat: '', opportunity: '' },
    // Ці два поля перебивають verdict у вʼювері, тому клон, що їх переносив,
    // показував торішній висновок навіть після того, як оператор написав новий.
    bluf_threat: '',
    bluf_opportunity: '',
    quotes: [],
    method_notes: [],
    // Прогнози переносяться, бо їх треба розвʼязати саме цього тижня (ворота H5).
    forecasts: (prev.forecasts || []).filter((f) => f.status === 'open'),
    ensemble: prev.ensemble
      ? { ...structuredClone(prev.ensemble), markets: (prev.ensemble.markets || []).map((m) => ({
        ...m, bets: [], aggregate: undefined, history: undefined,
      })) }
      : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* H3 · валідація                                                      */
/* ------------------------------------------------------------------ */

/**
 * Повна перевірка чернетки: схема і посилальна цілісність зі спільного
 * валідатора, плюс правила, які має право знати тільки імпортер.
 */
export function validateDraft(contract, draft) {
  const others = contract.weeks.filter((w) => w.id !== draft.id);
  const probe = { ...contract, weeks: [...others, draft] };

  // Помилки схеми приходять зі шляхом виду «тижні -> [3] -> теми -> [0] -> id»,
  // тобто БЕЗ ідентифікатора тижня. Фільтр по draft.id викидав їх усі, і
  // структурно зламана чернетка проходила валідацію як чиста: перевірялись
  // лише мої власні правила реєстру, що вживають id у тексті.
  // Чернетка додається останньою, тому її індекс відомий і стабільний.
  const at = `тижні -> [${probe.weeks.length - 1}]`;
  const issues = validateContract(probe, REGISTRIES).filter(
    (i) => i.where?.startsWith(at) || i.where?.includes(draft.id) || i.where === 'версія схеми'
  );

  const known = new Set(topicRegistry.map((t) => t.id));
  (draft.topics || []).forEach((t) => {
    const canon = canonical(t.id);
    if (canon !== t.id) {
      issues.push({
        level: 'warning',
        where: `${draft.id} -> теми -> ${t.id}`,
        message: `«${t.id}» злитий у «${canon}». Використайте канонічний id, інакше історія теми обірветься.`,
      });
    }
    if (!known.has(canon)) return; // помилку вже дав спільний валідатор
    const reg = topicRegistry.find((r) => r.id === canon);
    if (reg && !reg.short_name) {
      issues.push({
        level: 'error',
        where: `реєстр тем -> ${canon}`,
        message: 'у теми немає короткого імені: карта не має що намалювати.',
      });
    }
    if (typeof t.tone_score === 'number' && (t.tone_score < -1 || t.tone_score > 1)) {
      issues.push({
        level: 'error',
        where: `${draft.id} -> теми -> ${t.id} -> tone_score`,
        message: `позиція на шкалі тону це число від -1 до 1, а тут ${t.tone_score}.`,
      });
    }
  });

  return issues;
}

export { formatIssues };

/* ------------------------------------------------------------------ */
/* H4 · діф із попереднім тижнем                                       */
/* ------------------------------------------------------------------ */

const SHIFT_TONE = 0.15;
const SHIFT_SALIENCE = 1;

/**
 * Що нове, що зникло, що зсунулось понад поріг. Редактор бачить наслідки
 * ДО затвердження, а не після того, як тиждень уже поїхав керівництву.
 */
export function diffWeeks(prev, next) {
  const byId = (list) => new Map((list || []).map((t) => [canonical(t.id), t]));
  const a = byId(prev?.topics);
  const b = byId(next?.topics);

  const added = [...b.keys()].filter((id) => !a.has(id));
  const gone = [...a.keys()].filter((id) => !b.has(id));
  const moved = [];

  b.forEach((t, id) => {
    const was = a.get(id);
    if (!was) return;
    const dTone = (t.tone_score ?? 0) - (was.tone_score ?? 0);
    const dSal = (t.salience ?? 0) - (was.salience ?? 0);
    if (Math.abs(dTone) >= SHIFT_TONE || Math.abs(dSal) >= SHIFT_SALIENCE) {
      moved.push({ id, dTone: +dTone.toFixed(2), dSalience: dSal });
    }
  });

  return {
    added,
    gone,
    moved: moved.sort((x, y) => Math.abs(y.dTone) - Math.abs(x.dTone)),
    counts: {
      topics: (next?.topics || []).length,
      actors: (next?.actors || []).length,
      cases: (next?.cases || []).length,
      forecasts: (next?.forecasts || []).length,
    },
  };
}

/* ------------------------------------------------------------------ */
/* H5 · ворота чесності                                                */
/* ------------------------------------------------------------------ */

export const VERDICTS = [
  { id: 'hit', label: 'влучив' },
  { id: 'miss', label: 'промах' },
  { id: 'void', label: 'скасовано' },
];

/**
 * Прогнози, чий дедлайн настав або минув у тижні, що імпортується.
 * Кожен вимагає вердикту: реєстр фізично не може забути прогноз, бо без
 * відповіді по всіх воротах затвердження недоступне.
 */
export function dueForecasts(contract, draft) {
  const end = Date.parse(draft?.period?.to);
  if (!Number.isFinite(end)) return [];
  const seen = new Map();
  contract.weeks.forEach((w) => {
    (w.forecasts || []).forEach((f) => seen.set(f.id, f));
  });
  (draft.forecasts || []).forEach((f) => seen.set(f.id, f));
  return [...seen.values()].filter((f) => {
    if (f.status !== 'open') return false;
    const d = Date.parse(f.deadline);
    return Number.isFinite(d) && d <= end;
  });
}

/** Ворота відкриті лише коли на кожен прострочений прогноз є вердикт. */
export function gateStatus(contract, draft, answers) {
  const due = dueForecasts(contract, draft);
  const missing = due.filter((f) => {
    const a = answers[f.id];
    if (!a || !a.verdict) return true;
    // Скасування без причини це спосіб тихо прибрати незручний промах.
    if (a.verdict === 'void' && !String(a.reason || '').trim()) return true;
    return false;
  });
  return { due, missing, open: missing.length === 0 };
}

/**
 * Вердикти воріт лягають у самі прогнози: реєстр веде тільки імпортер.
 *
 * Живе тут, а не в компоненті, бо це чиста логіка реєстру, і саме її треба
 * вміти перевірити без React.
 *
 * Область запису мусить збігатись з областю воріт. Раніше писалось лише по
 * прогнозах, наявних у чернетці, а ворота питали і про ті, що живуть у
 * попередніх тижнях. Відповідь по такому прогнозу мовчки зникала: оператор
 * бачив, що відповів, а в реєстрі прогноз лишався відкритим назавжди.
 *
 * Прогноз, розвʼязаний цього тижня, дописується в тиждень, який його розвʼязав.
 * Саме так корпус це вже і робить: W32 несе f_2907_stab зі статусом miss, хоча
 * відкритий він був у W29.
 */
export function applyVerdicts(draft, answers, due) {
  const out = structuredClone(draft);
  const list = Array.isArray(out.forecasts) ? out.forecasts : [];
  const byId = new Map(list.map((f) => [f.id, f]));

  (due || []).forEach((f) => {
    const a = answers[f.id];
    if (!a?.verdict) return;
    const patch = {
      status: a.verdict,
      ...(a.reason ? { resolution_note: a.reason } : {}),
    };
    const existing = byId.get(f.id);
    if (existing) Object.assign(existing, patch);
    else list.push({ ...f, ...patch });
  });

  out.forecasts = list;
  return out;
}

/* ------------------------------------------------------------------ */
/* H6 · журнал імпорту, append-only                                    */
/* ------------------------------------------------------------------ */

/**
 * Новий запис журналу. Журнал ТІЛЬКИ дописується: повторний імпорт того самого
 * тижня додає ще один запис, а не переписує попередній. Історія того, хто і що
 * затвердив, не має права зникати, як і реєстр прогнозів.
 */
export function appendJournal(prevJournal, entry) {
  const list = Array.isArray(prevJournal?.entries) ? prevJournal.entries : [];
  return {
    format: 'kamerton.import-log',
    entries: [...list, { ...entry, seq: list.length + 1 }],
  };
}

export function journalEntry({ weekId, operator, sourceName, schemaVersion, diff, gates, stamp }) {
  return {
    week: weekId,
    operator,
    at: stamp,
    source: sourceName || 'клон попереднього тижня',
    schema_version: schemaVersion,
    diff: {
      added: diff.added,
      gone: diff.gone,
      moved: diff.moved.map((m) => m.id),
      counts: diff.counts,
    },
    gates: gates.due.map((f) => ({
      forecast: f.id,
      verdict: gates.answers?.[f.id]?.verdict ?? null,
      reason: gates.answers?.[f.id]?.reason || undefined,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* H7 · метрики з CSV                                                  */
/* ------------------------------------------------------------------ */

/**
 * CSV із saved query BigQuery. Руками числа не переносяться: це головне
 * джерело тихих помилок, які потім неможливо знайти.
 *
 * Формат навмисно найпростіший: перший рядок заголовки, далі рядки
 * `metric,value`. Розбір без залежностей, бо кома в числах тут не буває.
 */
export function parseMetricsCsv(text) {
  const rows = String(text).split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  if (!rows.length) return { values: {}, errors: ['файл порожній'] };
  const head = rows[0].toLowerCase();
  const start = /metric|метрика/.test(head) ? 1 : 0;
  const values = {};
  const errors = [];
  for (let i = start; i < rows.length; i++) {
    const cells = rows[i].split(/[,;]/).map((c) => c.trim());
    if (cells.length < 2) { errors.push(`рядок ${i + 1}: очікується «метрика,значення»`); continue; }
    const key = cells[0];
    const num = Number(cells[1].replace(',', '.'));
    if (!Number.isFinite(num)) { errors.push(`рядок ${i + 1}: «${cells[1]}» не число`); continue; }
    values[key] = num;
  }
  return { values, errors };
}

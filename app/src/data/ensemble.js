// КАМЕРТОН · шар КОМПАС: математика внутрішнього ринку прогнозів.
//
// Модуль чистий: жодного DOM, жодного стану, жодних звернень до контракту.
// Все, що він робить, це рахує з переданих чисел. Тому його можна ганяти
// тестами і повторювати розрахунок руками на папері.
//
// Головна теза шару: КОМПАС не пророкує. Він звіряє незалежні оцінки і
// показує, де вони сходяться, а де розходяться. Вихід завжди має статус
// оцінки агрегату панелі, ніколи не факту.

/** Межі, у які зводиться будь-яка оцінка: нуль і одиниця ламають логіт. */
export const P_MIN = 0.02;
export const P_MAX = 0.98;

/** Скільки розвʼязаних ринків потрібно, щоб калібрування почало діяти. */
export const COLD_START_RESOLVED = 3;

/** Менше трьох оцінок це ще не панель: консенсус позначається як попередній. */
export const MIN_ESTIMATES = 3;

export const DEFAULT_CONFIG = {
  san_base_weight: 0.30,
  extremization_d: 1.3,
  weekly_budget: 100,
  divergence_threshold: 0.20,
  calibration_window: 12,
};

export const clipP = (p) => Math.min(P_MAX, Math.max(P_MIN, Number(p)));
export const logit = (p) => Math.log(clipP(p) / (1 - clipP(p)));
export const sigmoid = (l) => 1 / (1 + Math.exp(-l));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * Калібрувальний множник учасника.
 *
 * Чим менший ковзний Brier, тим точніші попередні прогнози і тим більше важить
 * голос. Холодний старт навмисно нейтральний: поки людина не розвʼязала трьох
 * ринків, її не можна ні підсилювати, ні притискати, бо міряти нема на чому.
 *
 * calibrationFactor({brier_rolling: 0.18, resolved_count: 7}) -> 2.7778
 */
export function calibrationFactor(participant) {
  const resolved = Number(participant?.resolved_count) || 0;
  const brier = Number(participant?.brier_rolling);
  if (resolved < COLD_START_RESOLVED || !Number.isFinite(brier)) return 1.0;
  return clamp(0.5 / Math.max(brier, 0.05), 0.5, 3.0);
}

/**
 * Персентиль з лінійною інтерполяцією між сусідніми значеннями.
 * Метод названий явно, бо на малих вибірках різні методи дають різні числа.
 */
export function percentile(values, q) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  if (v.length === 1) return v[0];
  const idx = q * (v.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return round(v[lo], 6);
  return round(v[lo] + (idx - lo) * (v[hi] - v[lo]), 6);
}

export function median(values) {
  return percentile(values, 0.5);
}

/**
 * aggregate: консенсус ринку з оцінок людей і моделі.
 *
 * Порядок рівно такий, як у постановці: кліпінг, ваги з калібрування, пулінг
 * у лог-шансах, частка САН, екстремізація, назад у ймовірність.
 *
 * Пулінг саме в лог-шансах, а не в самих ймовірностях: середнє арифметичне
 * ймовірностей тягне консенсус до половини і гасить упевнені оцінки.
 *
 * aggregate(market, participants, config)
 *   -> {p_ensemble, p_humans_median, spread_p10_p90, divergence_flag, n_bets, preliminary}
 */
export function aggregate(market, participants = [], config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const byId = new Map(participants.map((p) => [p.id, p]));

  const bets = (market?.bets || []).filter(
    (b) => Number.isFinite(Number(b.p)) && Number(b.stake) > 0
  );

  const humanPs = bets.map((b) => clipP(b.p));
  const san = market?.san_estimate && Number.isFinite(Number(market.san_estimate.p))
    ? clipP(market.san_estimate.p)
    : null;

  const empty = {
    p_ensemble: null,
    p_humans_median: null,
    spread_p10_p90: null,
    divergence_flag: false,
    n_bets: bets.length,
    preliminary: true,
    san_weight: 0,
  };
  if (!bets.length && san === null) return empty;

  // Людський пул: сума логітів, зважена ставкою і калібруванням.
  let lHumans = null;
  let weightSum = 0;
  if (bets.length) {
    let acc = 0;
    bets.forEach((b) => {
      const w = Number(b.stake) * calibrationFactor(byId.get(b.participant));
      weightSum += w;
      acc += w * logit(b.p);
    });
    lHumans = weightSum > 0 ? acc / weightSum : null;
  }

  // Частка САН фіксована конфігом. Якщо модель по темі мовчить, ваги в неї
  // нуль і пул це чистий голос панелі. Якщо мовчить панель, лишається модель,
  // але результат чесно позначений попереднім.
  let lPool;
  let sanWeight = 0;
  if (san !== null && lHumans !== null) {
    sanWeight = cfg.san_base_weight;
    lPool = sanWeight * logit(san) + (1 - sanWeight) * lHumans;
  } else if (san !== null) {
    sanWeight = 1;
    lPool = logit(san);
  } else {
    lPool = lHumans;
  }

  // Екстремізація: агрегати систематично консервативніші за учасників,
  // бо усереднення стягує до середини. Поправка повертає впевненість.
  //
  // Увага для реєстратора: за постановкою поправка застосовується завжди, у тому
  // числі коли джерело одне. Тоді усереднення не було, і поправка просто робить
  // самотню оцінку впевненішою, ніж її заявив автор (0.62 моделі стає 0.65).
  // Лишено як у документі; якщо це не задум, вимикається однією умовою.
  const lFinal = cfg.extremization_d * lPool;
  const pEnsemble = sigmoid(lFinal);

  const all = san === null ? humanPs : [...humanPs, san];
  const humansMedian = humanPs.length ? median(humanPs) : null;
  const enough = all.length >= MIN_ESTIMATES;

  const divergence =
    san !== null && humansMedian !== null &&
    Math.abs(san - humansMedian) > cfg.divergence_threshold;

  return {
    p_ensemble: Math.round(pEnsemble * 100) / 100,
    // Округлене число йде на екран, сире в скоринг: Brier від округленого це
    // помилка у третьому знаку, яка накопичується по всьому реєстру.
    p_ensemble_raw: round(pEnsemble, 6),
    p_ensemble_pct: Math.round(pEnsemble * 100),
    p_humans_median: humansMedian === null ? null : round(humansMedian, 4),
    spread_p10_p90: enough
      ? [round(percentile(all, 0.1), 4), round(percentile(all, 0.9), 4)]
      : null,
    divergence_flag: divergence,
    divergence_pp: divergence ? Math.round(Math.abs(san - humansMedian) * 100) : 0,
    n_bets: bets.length,
    n_estimates: all.length,
    preliminary: !enough,
    san_weight: sanWeight,
    l_humans: lHumans === null ? null : round(lHumans, 6),
    l_pool: round(lPool, 6),
  };
}

/* ------------------------------------------------------------------ */
/* Скоринг                                                             */
/* ------------------------------------------------------------------ */

/** Brier однієї оцінки: квадрат відхилення від того, що сталось. */
export const brier = (p, outcome) => (clipP(p) - (outcome ? 1 : 0)) ** 2;

/**
 * Репутаційний результат ставки.
 *
 * Δ = ставка * (0.25 - Brier) * 4. Ідеальний прогноз повертає рівно ставку,
 * впевнений промах коштує втричі більше за неї. Асиметрія навмисна: впевнено
 * помилятись має бути дорожче, ніж обережно вгадувати.
 */
export const betDelta = (stake, p, outcome) =>
  round(Number(stake) * (0.25 - brier(p, outcome)) * 4, 4);

/**
 * scoreMarket: підсумок розвʼязаного ринку по кожному учаснику плюс по агрегату.
 * Нерозвʼязаний ринок повертає null: рахувати нема чого.
 */
export function scoreMarket(market, participants = [], config = {}) {
  const outcome = market?.resolution?.outcome;
  if (outcome !== true && outcome !== false) return null;

  const agg = market.aggregate?.p_ensemble != null
    ? market.aggregate
    : aggregate(market, participants, config);

  const rows = (market.bets || []).map((b) => ({
    participant: b.participant,
    p: clipP(b.p),
    stake: Number(b.stake),
    brier: round(brier(b.p, outcome), 4),
    delta: betDelta(b.stake, b.p, outcome),
  }));

  const san = market.san_estimate?.p;
  return {
    id: market.id,
    outcome,
    // Сама оцінка, а не тільки її Brier: бік влучання читається з неї прямо.
    p_ensemble: agg.p_ensemble_raw ?? agg.p_ensemble ?? null,
    rows,
    brier_ensemble: agg.p_ensemble == null
      ? null
      : round(brier(agg.p_ensemble_raw ?? agg.p_ensemble, outcome), 4),
    brier_san: san == null ? null : round(brier(san, outcome), 4),
    brier_humans:
      agg.p_humans_median == null ? null : round(brier(agg.p_humans_median, outcome), 4),
  };
}

/**
 * registryScore: квартальний рахунок.
 *
 * Промахи рахуються нарівні з влучаннями і сховати їх нема як: функція бере
 * усі розвʼязані ринки, які їй дали, і не має жодного прапорця фільтрації.
 * Трійка Brier поруч це прямий тест доктрини: чи додає компас точності
 * проти моделі окремо і проти панелі окремо.
 */
export function registryScore(markets = [], participants = [], config = {}) {
  const scored = markets.map((m) => scoreMarket(m, participants, config)).filter(Boolean);
  const mean = (xs) => {
    const v = xs.filter((x) => Number.isFinite(x));
    return v.length ? round(v.reduce((a, b) => a + b, 0) / v.length, 4) : null;
  };
  // Влучання це той бік, у який показував консенсус: понад 50% і подія сталась,
  // або менше 50% і не сталась. Рівно 50% це не влучання і не промах.
  const hits = scored.filter(
    (s) => s.brier_ensemble !== null && brierSide(s) === 'hit'
  ).length;
  const misses = scored.filter(
    (s) => s.brier_ensemble !== null && brierSide(s) === 'miss'
  ).length;

  return {
    resolved_total: scored.length,
    hits,
    misses,
    brier_ensemble: mean(scored.map((s) => s.brier_ensemble)),
    brier_san_solo: mean(scored.map((s) => s.brier_san)),
    brier_humans_solo: mean(scored.map((s) => s.brier_humans)),
    rows: scored,
  };
}

/**
 * Влучання це той бік, у який показував консенсус.
 *
 * Оцінка береться прямо з підсумку, а не відновлюється з Brier через корінь:
 * корінь втрачає знак, і бік доводилось вгадувати назад по факту. Рівно 0.5 це
 * ні влучання, ні промах: консенсус у такому разі не сказав нічого.
 */
function brierSide(s) {
  const est = s.p_ensemble;
  if (est == null) return 'none';
  if (Math.abs(est - 0.5) < 1e-9) return 'tie';
  return (est > 0.5) === Boolean(s.outcome) ? 'hit' : 'miss';
}

/* ------------------------------------------------------------------ */
/* Бюджет і допуск до ставки                                           */
/* ------------------------------------------------------------------ */

/** Скільки балів учасник уже поставив цього тижня і скільки лишилось. */
export function budgetOf(participantId, markets = [], config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const spent = markets.reduce(
    (a, m) =>
      a + (m.bets || [])
        .filter((b) => b.participant === participantId)
        .reduce((x, b) => x + (Number(b.stake) || 0), 0),
    0
  );
  return { total: cfg.weekly_budget, spent, left: Math.max(0, cfg.weekly_budget - spent) };
}

/**
 * canBet: чи має право цей учасник ставити на цей ринок.
 *
 * Конфлікт інтересів блокується кодом, а не домовленістю: учасник з активною
 * роллю в посіві наративів по темі не ставить на ринки з цією темою. Причина
 * повертається словами, щоб інтерфейс міг її показати, а не просто згасити кнопку.
 */
export function canBet(participant, market, markets = [], config = {}) {
  if (!participant) return { ok: false, reason: 'учасника не знайдено' };
  if (participant.role !== 'bettor' && participant.role !== 'analyst') {
    return { ok: false, reason: 'ця роль оцінок не робить' };
  }
  if (market.status !== 'open') {
    return {
      ok: false,
      reason: `ринок у стані «${STATUS_UA[market.status] || market.status}», оцінки не приймаються`,
    };
  }
  const clash = (participant.conflicts || []).filter((c) =>
    (market.topic_refs || []).includes(c)
  );
  if (clash.length) {
    return {
      ok: false,
      reason: `конфлікт інтересів: участь у роботі по темі «${clash.join(', ')}»`,
      conflicts: clash,
    };
  }
  const budget = budgetOf(participant.id, markets, config);
  if (budget.left <= 0) return { ok: false, reason: 'тижневий бюджет вичерпано' };
  return { ok: true, budget };
}

/* ------------------------------------------------------------------ */
/* Червоні лінії: валідація чернетки ринку                             */
/* ------------------------------------------------------------------ */

/**
 * Нормалізація тексту перед перевіркою.
 *
 * Без неї правила ловлять тільки ту форму слова, яку встиг уявити автор правил.
 * Апострофи в українському тексті приходять щонайменше трьома символами, регістр
 * довільний, а між словами буває що завгодно. Тому спершу зводимо все до одного
 * вигляду і аж тоді шукаємо корені.
 */
const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[’ʼ‘`']/g, "'")
    .replace(/\s+/g, ' ');

/** Корінь на межі слова: у JS \b рахує тільки латиницю і на кирилиці мовчить. */
const root = (r) => new RegExp(`(^|[^\\p{L}])${r}`, 'iu');

/**
 * Правило червоної лінії.
 *
 * any  спрацьовує від будь-якого кореня зі списку.
 * all  вимагає, щоб у тексті були слова з КОЖНОЇ групи, у будь-якому порядку.
 *      Саме порядок слів був головною дірою: «розкриття особи респондента» і
 *      «встановлено особу респондента» це та сама заборона різними реченнями.
 */
const hits = (text, rule) => {
  if (rule.any) return rule.any.some((r) => root(r).test(text));
  return rule.all.every((group) => group.some((r) => root(r).test(text)));
};

const RED_LINES = [
  {
    code: 'harm',
    rules: [
      {
        any: [
          'смерт', 'загин', 'загибел', 'помре', 'помер', 'вбив', 'убив', 'вбит', 'убит',
          'ліквід', 'поранен', 'травм', 'госпіталіз', 'похорон', 'похован', 'каліцтв',
          'замах', 'страт', 'розстріл', 'переживе', 'виживе',
        ],
      },
      { all: [['фізичн'], ['усунен', 'вплив', 'шкод']] },
    ],
    message:
      'Ринок про смерть, поранення або фізичну шкоду конкретній особі заборонений. ' +
      'Правило спрацьовує з запасом: якщо це хибне спрацювання, переформулюйте питання ' +
      'так, щоб предметом була дія інституції, а не доля людини.',
  },
  {
    code: 'targeting',
    rules: [
      {
        any: [
          'компромат', 'викрит', 'дискредитац', 'підозр', 'обвинувач', 'звинувач',
          'арешт', 'затрима', 'посадят', 'ув\'язн', 'люстрац', 'відстав',
        ],
      },
      { all: [['злив', 'зіллют', 'оприлюдн'], ['листуван', 'запис', 'декларац', 'досьє']] },
      { all: [['кримінальн'], ['справ', 'провадж']] },
      { any: ['під суд'] },
    ],
    message:
      'Питання сформульоване як персональний таргетинг або компромат. ' +
      'Ринок має міряти рішення і події, а не долю конкретної людини.',
  },
  {
    code: 'deanon',
    rules: [
      { any: ['деанон'] },
      {
        all: [
          ['респондент', 'опитан', 'учасник опитуван', 'панелі'],
          ['розкри', 'встановлен', 'ім\'я', 'імен', 'особ', 'списк', 'дан', 'хто саме'],
        ],
      },
      { all: [['персональн', 'особов'], ['дан']] },
      { all: [['справжн'], ['ім\'я', 'імен', 'особ']] },
    ],
    message:
      'Деанонімізація респондентів панелей заборонена в будь-якій формі, ' +
      'включно з непрямою: списки, ідентифікатори, звірка з іменами.',
  },
];

/** «не ... не» у питанні: розвʼязку такого формулювання не прочитати однозначно. */
const DOUBLE_NEGATIVE = new RegExp(
  `(^|[^\\p{L}])не([^\\p{L}][^.]{0,40})?[^\\p{L}]не([^\\p{L}]|$)`, 'iu'
);

const HOURS_72 = 72 * 3600 * 1000;

/**
 * validateDraft: чернетка проходить або не проходить, з причиною людською мовою.
 *
 * Текстові правила це евристика, і вона навмисно спрацьовує з запасом: краще
 * зайвий раз спитати автора, ніж пропустити заборонений ринок. Остаточне
 * рішення лишається за реєстратором, але мовчки таке не проходить.
 */
export function validateDraft(market, opts = {}) {
  const errors = [];
  const warnings = [];
  const text = normalize(`${market?.question || ''} ${market?.resolution_criterion || ''}`);

  if (!market?.question || market.question.trim().length < 12) {
    errors.push({ code: 'question', message: 'Питання порожнє або надто коротке.' });
  }
  // Подвійне заперечення робить розвʼязку неоднозначною: «не буде не підписано».
  if (DOUBLE_NEGATIVE.test(normalize(market?.question))) {
    errors.push({
      code: 'double_negative',
      message: 'У питанні подвійне заперечення, розвʼязку не можна прочитати однозначно.',
    });
  }
  if (!market?.resolution_criterion || market.resolution_criterion.trim().length < 20) {
    errors.push({
      code: 'criterion',
      message: 'Немає критерію розвʼязки: що саме і за яким джерелом вважається підтвердженням.',
    });
  }
  if (!market?.resolve_by) {
    errors.push({ code: 'resolve_by', message: 'Не вказано дедлайн розвʼязки.' });
  }
  if (!market?.lock_at) {
    errors.push({ code: 'lock_at', message: 'Не вказано час заморозки оцінок.' });
  }
  if (market?.lock_at && market?.resolve_by) {
    const lock = Date.parse(market.lock_at);
    const res = Date.parse(market.resolve_by);
    if (Number.isFinite(lock) && Number.isFinite(res) && res - lock < HOURS_72) {
      errors.push({
        code: 'lock_window',
        message: 'Заморозка має бути щонайменше за 72 години до дедлайну, інакше можливі оцінки по факту.',
      });
    }
  }

  RED_LINES.forEach((line) => {
    if (line.rules.some((r) => hits(text, r))) {
      errors.push({ code: line.code, message: line.message });
    }
  });

  // Самозабруднення: якщо розвʼязку ринку команда здатна спричинити власною
  // кампанією, система міряє свій же вихід. Такий ринок або відхиляється,
  // або йде з видимою плашкою, але мовчки не існує.
  const campaigns = opts.activeCampaignTopics || [];
  const overlap = (market?.topic_refs || []).filter((t) => campaigns.includes(t));
  if (overlap.length) {
    if (market?.self_contamination_risk) {
      warnings.push({
        code: 'self_contamination',
        message: `Тема перетинається з активною кампанією (${overlap.join(', ')}): ринок міряє власний вихід.`,
      });
    } else {
      errors.push({
        code: 'self_contamination',
        message: `Тема перетинається з активною кампанією (${overlap.join(', ')}). Або відхилити ринок, або позначити self_contamination_risk.`,
      });
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Порядок карток: спершу те, що ще можна змінити.
 *
 * Розходження вгорі, далі відкриті за близькістю дедлайну, потім заморожені,
 * і аж наприкінці розвʼязані. Сортувати все підряд за дедлайном не можна:
 * у розвʼязаного ринку дедлайн найдавніший, і він спливав би нагору, хоча
 * зробити з ним уже нічого не можна.
 */
const STAGE = { open: 0, locked: 1, resolved: 2, scored: 3 };

export function sortMarkets(markets = []) {
  return markets.slice().sort((a, b) => {
    const da = a.aggregate?.divergence_flag && a.status === 'open' ? 0 : 1;
    const db = b.aggregate?.divergence_flag && b.status === 'open' ? 0 : 1;
    if (da !== db) return da - db;
    const sa = STAGE[a.status] ?? 9;
    const sb = STAGE[b.status] ?? 9;
    if (sa !== sb) return sa - sb;
    return String(a.resolve_by || '').localeCompare(String(b.resolve_by || ''));
  });
}

export const LIFECYCLE = ['draft', 'open', 'locked', 'resolved', 'scored'];

/** Стан ринку людською мовою: службові рядки в інтерфейс не потрапляють. */
export const STATUS_UA = {
  draft: 'чернетка',
  open: 'приймає оцінки',
  locked: 'заморожено',
  resolved: 'розвʼязано',
  scored: 'зараховано',
};

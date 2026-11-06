// КАМЕРТОН · схема контракту як єдине джерело правди.
//
// Правило: правила валідації існують в одному екземплярі. Дві копії розходяться
// мовчки, і саме так у корпус потрапила третя форма method_notes (обʼєкти в W30,
// порожньо в W31, голі рядки в W32), яку жоден читач не чекав.
//
// Цей файл використовує в'ювер (через похідні перевірки) і майбутній імпортер
// тижня. zod стоїть у devDependencies: схема потрібна на збірці і в інструменті
// редактора, а не в офлайн-бандлі керівництва, тому застосунок її не імпортує.
//
// Повідомлення українською і зі шляхом до поля: помилку контракту читає редактор
// тижня, а не лише розробник.

import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Примітиви                                                           */
/* ------------------------------------------------------------------ */

const WeekId = z.string().regex(/^\d{4}-W\d{1,2}$/, 'ідентифікатор тижня має вигляд 2026-W32');
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'дата має вигляд 2026-08-07');
const Slug = z.string().regex(/^[a-z][a-z0-9_]*$/, 'id це слаг з малих латинських літер, цифр і підкреслень');

/** Епістемічний статус. Обовʼязковий скрізь, де є твердження. */
export const EpistemicStatus = z.enum(['fact', 'assessment', 'hypothesis']);

/* ------------------------------------------------------------------ */
/* Сутності                                                            */
/* ------------------------------------------------------------------ */

/**
 * Claim: твердження. Не має дедлайну і не потрапляє в рахунок.
 * Гіпотеза це Claim зі статусом hypothesis, а не недороблений Forecast.
 */
export const Claim = z.object({
  id: Slug,
  text: z.string().min(1, 'твердження не може бути порожнім'),
  status: EpistemicStatus,
  sources: z.array(z.string()).default([]),
  date: IsoDate.optional(),
});

/**
 * Forecast: твердження з дедлайном і критерієм розвʼязки.
 * Потрапляє в рахунок незалежно від результату. Ймовірність живе ТУТ і більше
 * ніде: привид на карті, діамант у Компасі і рядок у Зрізі читають цей запис.
 */
export const Forecast = z.object({
  id: Slug,
  question: z.string().min(1, 'прогноз без питання не перевіряється'),
  deadline: IsoDate,
  criterion: z.string().min(1, 'без критерію розвʼязки прогноз не можна ні влучити, ні промахнути'),
  probability: z.number().min(0).max(1),
  status: z.enum(['open', 'hit', 'miss', 'void']),
  resolved_by: z.string().optional(),
});

/**
 * Market: спосіб оцінити прогноз. Посилається на Forecast і НЕ дублює його полів:
 * продубльоване число рано чи пізно розсинхронізується, і на екран потраплять
 * два різні відсотки для одного питання.
 */
export const Market = z.object({
  id: Slug,
  forecast_id: Slug,
  estimates: z.array(z.object({
    by: z.string(),
    p: z.number().min(0).max(1),
    at: IsoDate.optional(),
  })).default([]),
  consensus: z.number().min(0).max(1).nullable().optional(),
  brier: z.number().min(0).max(1).nullable().optional(),
}).strict().refine((m) => !('probability' in m), {
  message: 'ринок не тримає власну ймовірність: вона живе у звʼязаному прогнозі',
});

/**
 * Scenario: модельний наслідок важеля. Не прогноз і не факт.
 * Показує напрям, а не обіцянку, тому в рахунок не входить ніколи.
 */
export const Scenario = z.object({
  id: Slug,
  lever_id: Slug,
  effects: z.array(z.object({
    target: z.string(),
    delta: z.number(),
  })).default([]),
  model_version: z.string(),
});

export const Topic = z.object({
  id: Slug,
  name: z.string().min(1),
  aud: z.string().optional(),
  trend: z.enum(['new', 'up', 'flat', 'down', 'out']).optional(),
  tone: z.string().optional(),
  tone_score: z.number().min(-1).max(1).optional(),
  salience: z.number().optional(),
  verification: z.object({ status: z.string() }).passthrough().optional(),
  links: z.array(z.any()).optional(),
}).passthrough();

/** Запис реєстру акторів: тут живе назва і тип. */
export const Actor = z.object({
  id: z.string(),
  name: z.string().min(1),
  type: z.enum(['institution', 'group', 'audience', 'amplifier']).optional(),
}).passthrough();

/**
 * Актор усередині тижня це ПОСИЛАННЯ на реєстр плюс позиція цього тижня.
 * Назву і тип він не повторює: продубльована назва дрейфує, як уже сталося з темами.
 */
export const WeekActorRef = z.object({
  id: z.string(),
  stance: z.number().min(-1).max(1).optional(),
  activity: z.number().min(1).max(5).optional(),
  note: z.string().optional(),
  links: z.array(z.any()).optional(),
}).passthrough();

/**
 * Редакційний прогноз у чинному контракті v1.4.
 * Це НЕ цільова сутність Forecast зі спеки v2: у нього немає probability,
 * тому в рахунок він входить лише статусом. Міграція зводить його і ринок
 * до одного запису з одним числом (B7).
 */
export const EditorialForecast = z.object({
  id: Slug,
  text: z.string().min(1),
  criterion: z.string().min(1, 'без критерію розвʼязки прогноз не можна ні влучити, ні промахнути'),
  deadline: z.string(),
  // void це реальний стан: прогноз скасовано з причиною через ворота імпорту.
  status: z.enum(['open', 'hit', 'miss', 'partial_hit', 'void']),
  opened: z.string().optional(),
  resolution_note: z.string().optional(),
}).passthrough();

export const Case = z.object({
  id: Slug,
  title: z.string().min(1),
  // Кейс живе тижнями, а не днями: opened і next_check це ідентифікатори тижнів.
  opened: WeekId.optional(),
  next_check: z.union([WeekId, z.literal('')]).optional(),
  status: z.string().optional(),
  host_topic: Slug.optional(),
}).passthrough();

/** Методологічне правило. Рівно одна форма: обʼєкт. Голий рядок більше не проходить. */
export const MethodNote = z.object({
  text: z.string().min(1, 'правило без тексту малює порожній рядок на екрані'),
  type: z.string().optional(),
});

export const Week = z.object({
  id: WeekId,
  period: z.object({ from: IsoDate, to: IsoDate }),
  hidden: z.boolean().optional(),
  topics: z.array(Topic).optional(),
  actors: z.array(WeekActorRef).optional(),
  cases: z.array(Case).optional(),
  method_notes: z.array(MethodNote).optional(),
  claims: z.array(Claim).optional(),
  forecasts: z.array(EditorialForecast).optional(),
  scenarios: z.array(Scenario).optional(),
}).passthrough();

export const Contract = z.object({
  schema_version: z.string({ message: 'schema_version обовʼязкове: без нього імпортер не знає, за якими правилами читати тиждень' }),
  meta: z.object({}).passthrough(),
  weeks: z.array(Week).min(1, 'контракт без жодного тижня нічого не описує'),
}).passthrough();

/* ------------------------------------------------------------------ */
/* Фаза F · прецеденти (каркас F1)                                      */
/* ------------------------------------------------------------------ */

/** Фаза траєкторії (Δ1). Словник у registry/phases.json. */
export const Phase = z.enum(['trigger', 'response', 'turn', 'outcome']);

export const Shelf = z.enum(['internal', 'external']);
export const Level = z.enum(['high', 'med', 'low']);
export const CardStatus = z.enum(['active', 'weakened', 'broken', 'confirmed']);

/**
 * Джерело кейса. quality 1 найкраще, 3 найслабше.
 * Правило корпусу: картка не може стояти лише на джерелах якості 3.
 */
export const CaseSource = z.object({
  type: z.enum(['primary', 'academic', 'journalistic', 'internal_archive']),
  ref: z.string().min(1, 'посилання на джерело не може бути порожнім'),
  quality: z.number().int().min(1).max(3),
});

/**
 * HistoricalCase: одиниця корпусу.
 *
 * Мінімум два джерела і `verified_by` це не побажання, а умова публікації
 * (правила 2 і 6 Спеки F): факт без джерела і без підпису не існує.
 */
export const HistoricalCase = z.object({
  id: Slug,
  title: z.string().min(1),

  /**
   * Подача. Три поля, які читаються ПЕРШИМИ, до будь-яких фаз і матриць.
   *
   * Причина жорсткої вимоги: на прийманні виявилось, що панель нечитабельна.
   * Було видно стадії і осі, але не було видно самої події, і читач не розумів,
   * З ЧИМ порівнюють. Абстрактний підпис на кшталт «комісія визнає провину
   * військового рівня» без року, країни і назви це не кейс, а етикетка.
   *
   * headline: «[Рік], [країна]: [назва події, комісії або справи]»
   * what_happened: два-три речення з конкретикою.
   * led_to: чим закінчилось І ЧЕРЕЗ СКІЛЬКИ ЧАСУ. Строк обовʼязковий: без нього
   * прецедент не відповідає на головне питання читача про власний кейс.
   */
  headline: z.string().min(1, 'кейс без заголовка з роком і країною не читається'),
  what_happened: z.string().min(1, 'кейс мусить розповісти, що саме сталося'),
  led_to: z.string().min(1, 'кейс мусить сказати, чим закінчилось і через скільки часу'),

  class_tags: z.array(z.string()).min(1, 'кейс без класу не публікується: порівнювати буде ні з чим'),
  shelf: Shelf,
  period: z.string().min(1),
  geo: z.string().optional(),
  war_context: z.string().min(1, 'воєнний контекст обовʼязковий: без нього переносимість не оцінити'),
  trigger: z.string().min(1),
  actors: z.array(z.string()).default([]),
  system_response: z.object({
    what: z.string(),
    speed_hours: z.number().nonnegative().nullable().optional(),
  }).optional(),
  info_environment: z.enum(['centralised', 'fragmented', 'mixed']).optional(),
  // Δ1: фаза обовʼязкова, бо саме за нею вирівнюються треки в режимі F3.
  timeline: z.array(z.object({
    offset_weeks: z.number(),
    phase: Phase,
    event: z.string().min(1),
  })).default([]),
  outcome: z.object({
    code: z.enum(['faded', 'systemic_distrust', 'cadre_conflict', 'escalated', 'other']),
    description: z.string().optional(),
  }),
  sources: z.array(CaseSource).min(2, 'кейс мусить мати щонайменше два джерела'),
  seeded: z.boolean().default(false),
  added_by: z.string().min(1),
  added_date: IsoDate,

  /**
   * Адаптація історичного кейса з відкритих джерел, а не внутрішньо
   * верифікований документ. Прапорець обовʼязковий саме тому, що різниця між
   * цими двома речами і є межею між роботою з фактажем і вигадкою.
   */
  adaptation: z.boolean().default(false),

  /**
   * Стан підпису. `pending` це чесний робочий стан: кейс зібраний, джерела є,
   * але людина його ще не звірила. Він НЕ дозволяє показувати кейс як
   * верифікований, і саме це стереже валідатор.
   */
  signature: z.enum(['pending', 'signed']).default('pending'),
  verified_by: z.string().min(1, 'поле підпису не може бути порожнім: або імʼя, або «підпис: очікує»'),
  verified_date: IsoDate.optional(),
  notes: z.string().optional(),
}).passthrough().refine(
  (c) => c.signature !== 'signed' || (c.verified_date && !/очікує/i.test(c.verified_by)),
  { message: 'підписаний кейс мусить мати імʼя верифікатора і дату підпису' }
);

/** CasePassport: структурна формула поточного кейса (3.2 + Δ2). */
export const CasePassport = z.object({
  case_id: Slug,
  mechanism_chain: z.array(z.string()).min(2, 'ланцюжок механізму це щонайменше дві ланки'),
  factors: z.record(z.string(), z.any()).default({}),
  current_phase: Phase,
  phase_map: z.array(z.object({ phase: Phase, event: z.string() })).default([]),
  confirmed_by: z.string().min(1),
}).passthrough();

/**
 * PrecedentCard: те, що бачить керівник.
 *
 * Схема навмисно НЕ має поля зведеної подібності у відсотках: правило 5
 * забороняє його в будь-якому вигляді, і заборона мусить жити в типі, а не
 * в домовленості, інакше воно зʼявиться при першій же зручній нагоді.
 */
export const PrecedentCard = z.object({
  id: Slug,
  case_id: Slug,
  class_summary: z.string().min(1),
  analogs: z.array(z.object({
    historical_case_id: Slug,
    likenesses: z.array(z.string()).default([]),
    differences: z.array(z.string()).min(1, 'аналог без відмінностей це не аналог, а обіцянка'),
    transferability: Level,
  })).max(3, 'на екрані не більше трьох аналогів'),
  comparison_matrix: z.array(z.object({
    factor: z.string(),
    today: z.string(),
    analog: z.string(),
    transferability: Level,
  })).default([]),
  outcome_distribution: z.object({
    n: z.number().int().nonnegative(),
    buckets: z.array(z.object({ outcome_code: z.string(), k: z.number().int().nonnegative() })),
  }),
  break_conditions: z.array(z.string()).min(1, 'картка без блоку «де аналогія ламається» не публікується'),
  watch_signals: z.array(z.string()).default([]),
  scores: z.object({
    structural_similarity: Level,
    transferability: Level,
    base_quality: Level,
    n: z.number().int().nonnegative(),
  }),
  prior_for_market: z.object({
    forecast_id: Slug,
    base_rate: z.number().min(0).max(1),
  }).optional(),
  /**
   * У якій фазі механізму НАШ кейс зараз: 0 тригер, 1 реакція, 2 перелом,
   * 3 результат. Саме до цієї позначки трек «ЗАРАЗ» малюється суцільним, а далі
   * пунктиром. Без поля довелось би або зашити фазу в код, або малювати
   * майбутнє так само, як минуле, а це порушує правило про пунктир.
   */
  current_phase_index: z.number().int().min(0).max(3).optional(),
  status: CardStatus,
  status_history: z.array(z.object({
    at: IsoDate, status: CardStatus, note: z.string().optional(),
  })).default([]),
  verified_by: z.string().min(1, 'без підпису верифікатора картка не публікується'),
  verified_date: IsoDate,
  // Картка, зібрана з адаптованих історичних кейсів, мусить це заявляти, і
  // мусить окремо тримати стан підпису. Чекання підпису це робочий стан, а не
  // помилка: заборонено видавати чернетку за перевірене, а не мати чернетку.
  adaptation: z.boolean().optional(),
  signature: z.enum(['pending', 'signed']).optional(),
}).strict().refine((c) => !('similarity_pct' in c), {
  message: 'зведений відсоток схожості заборонений у будь-якому вигляді (правило 5)',
}).refine((c) => !(c.signature === 'signed' && /очікує/.test(c.verified_by || '')), {
  message: 'картка не може бути підписаною і водночас чекати на підпис',
});

/**
 * Перевірка корпусу прецедентів. Порожній корпус це валідний стан: до
 * проходження воріт F0 у ньому нічого й не має бути.
 */
export function validateCorpus(cases, dictionaries) {
  const issues = [];
  const push = (level, where, message) => issues.push({ level, where, message });
  const classes = new Set((dictionaries?.class_tags || []).map((c) => c.id));
  const outcomes = new Set((dictionaries?.outcome_codes || []).map((c) => c.id));

  (cases || []).forEach((c) => {
    const parsed = HistoricalCase.safeParse(c);
    if (!parsed.success) {
      parsed.error.issues.forEach((e) => {
        push('error', `${c?.id || 'кейс без id'} -> ${humanPath(e.path)}`, e.message);
      });
      return;
    }
    // Джерела лише третьої якості не тримають кейс: це переказ переказу.
    if (c.sources.every((s) => s.quality === 3)) {
      push('error', `${c.id} -> джерела`,
        'усі джерела якості 3: кейс не може стояти тільки на них.');
    }
    c.class_tags.forEach((t) => {
      if (!classes.has(t)) {
        push('error', `${c.id} -> class_tags -> ${t}`,
          `класу «${t}» немає у словнику. Новий клас заводиться явним записом у registry/class_tags.json.`);
      }
    });
    if (!outcomes.has(c.outcome?.code)) {
      push('error', `${c.id} -> outcome`,
        `коду наслідку «${c.outcome?.code}» немає у словнику.`);
    }
  });

  return issues;
}

/**
 * Розподіл наслідків по класу. Seeded-кейси виключаються (правило 8): там, де
 * КС активно працювали з наративом, результат вимірює нашу ж роботу, а не поле.
 */
export function outcomeDistribution(cases, classTag) {
  const pool = (cases || []).filter((c) => !c.seeded && (c.class_tags || []).includes(classTag));
  const buckets = new Map();
  pool.forEach((c) => {
    const code = c.outcome?.code || 'other';
    buckets.set(code, (buckets.get(code) || 0) + 1);
  });
  return {
    n: pool.length,
    excluded_seeded: (cases || []).filter((c) => c.seeded && (c.class_tags || []).includes(classTag)).length,
    buckets: [...buckets.entries()].map(([outcome_code, k]) => ({ outcome_code, k })),
  };
}

/* ------------------------------------------------------------------ */
/* Глибинний шар · три лінзи на кейс (спека 0.3)                        */
/* ------------------------------------------------------------------ */

/**
 * Розмітка кейса по трьох лінзах: сюжет, ролі, психотипи.
 * Словники живуть у registry/lenses.json, а не тут: додати сюжет має бути
 * видно в дифі реєстру, а не сховано в коді валідатора.
 *
 * Головне рішення 0.3 (розділ 3 і не-ціль 5): лінзи читаються ВИКЛЮЧНО з
 * реакції поля, а не з тексту події. Тому зрізуваною стала кожна лінза, і
 * сюжет теж: пілот W32 показав, що обовʼязковий сюжет змушує прочитати його з
 * документа, коли поле мовчить, тобто змушує порушити принцип модуля.
 *
 * Не-цілі зашиті в тип, бо не-ціль, яка живе в домовленості, порушується при
 * першій зручній нагоді:
 *
 * * не-ціль 2 (не психодіагностика осіб): психотип не має поля особи взагалі.
 *   Обʼєкт `.strict()`, тому `person` чи `diagnosis` у ньому не пройдуть.
 * * не-ціль 4 (немає розмітки без ревʼю): `validated` вимагає імені й дати.
 * * не-ціль 5 (не читати лінзи з тексту події): забезпечується правом зрізання
 *   плюс вимогою причини на кожне зрізання.
 * * розділ 8 (ліміти): міряються на СПРАВЖНЬОМУ рендері блоку, а не логічно.
 */

/**
 * Зрізана лінза. Причина обовʼязкова: зрізання без причини це забудькуватість.
 *
 * `reason` це РЯДОК ЗВІТУ (розділ 8: зрізана лінза виводиться одним рядком), і
 * він рахується в ліміт 120 знаків. Довге міркування живе в `note`, яка у звіт
 * не потрапляє: перший же прогін дав причину на 285 знаків, тобто зрізана лінза
 * зайняла втричі більше місця, ніж заповнена.
 */
const CUT_FIELDS = {
  cut: z.literal(true).optional(),
  reason: z.string().min(1, 'зрізана лінза мусить мати причину').optional(),
  note: z.string().optional(),
};

/**
 * Спільне правило для всіх трьох лінз: або зрізана з причиною і порожня, або
 * заповнена і без причини. Третього стану («зрізана, але щось лежить») не існує.
 */
function lensRefine(schema, isFilled, what) {
  return schema
    .refine((l) => !l.cut || Boolean(l.reason), {
      message: `лінза «${what}» зрізана без причини`,
    })
    .refine((l) => !l.cut || !isFilled(l), {
      message: `лінза «${what}» одночасно зрізана і заповнена`,
    })
    .refine((l) => Boolean(l.cut) || isFilled(l), {
      message: `лінза «${what}» порожня і не зрізана: порожнеча мусить бути рішенням, а не пропуском`,
    });
}

const PlotRef = z.object({ id: Slug, note: z.string().optional() }).strict();

/**
 * Лінза 1. Конкуренція сюжетів це діагностичний сигнал, а не проблема розмітки:
 * наратив ще не закристалізувався, і саме тут комунікація має найбільшу вагу.
 * Тому два сюжети фіксуються обидва, але рекомендації пишуться від primary.
 * Трьох немає навіть як поля: за розділом 4 три і більше означає, що поле шумить,
 * і лінза зрізається з причиною «наратив не сформований».
 */
export const PlotLens = lensRefine(
  z.object({
    ...CUT_FIELDS,
    primary: PlotRef.optional(),
    secondary: PlotRef.optional(),
  }).strict(),
  (l) => Boolean(l.primary),
  'сюжет',
).refine((l) => !l.secondary || l.primary, {
  message: 'конкурентний сюжет без домінантного: secondary існує тільки в парі',
}).refine((l) => !l.secondary || l.secondary.id !== l.primary?.id, {
  message: 'primary і secondary це один і той самий сюжет',
});

export const RoleAssignment = z.object({
  role_id: Slug,
  /** Кому аудиторія призначила роль. Текст, бо роль дістається і не-актору. */
  who: z.string().min(1, 'роль без адресата нічого не каже: аудиторія призначає її комусь'),
  /** Якщо адресат є в реєстрі акторів, посилання обовʼязкове: інакше назва дрейфує. */
  actor_id: z.string().optional(),
  note: z.string().optional(),
}).strict();

/**
 * Лінза 2. Максимум дві ролі в рядку (розділ 8): три ролі пілота W32 дали
 * рядок на 213 знаків, тобто три екранні замість одного. Решта розподілу і
 * конфлікти ролей живуть у примітках, які у звіт не йдуть.
 */
export const RolesLens = lensRefine(
  z.object({
    ...CUT_FIELDS,
    items: z.array(RoleAssignment).max(2, 'у рядку РОЛІ максимум дві ролі: решта розподілу в примітки').default([]),
  }).strict(),
  (l) => (l.items || []).length > 0,
  'ролі',
);

export const PsychotypeShare = z.object({
  id: Slug,
  /**
   * Частка реакції, 0..1. Необовʼязкова: розділ 4 прямо каже, що домінантні
   * кластери без чисел цінніші за вигадані відсотки.
   */
  share: z.number().min(0).max(1).optional(),
  /** Метод отримання частки. У v1 це expert; семпл коментарів це P1. */
  method: z.enum(['expert', 'sample']).optional(),
  note: z.string().optional(),
}).strict().refine((p) => typeof p.share !== 'number' || Boolean(p.method), {
  message: 'частка без позначки методу: експертна оцінка і семпл це різна вага одного відсотка',
});

/**
 * Лінза 3. Один кластер не фіксується (розділ 4): одна суцільна реакція це та
 * сама плоска тональність, проти якої написаний модуль. Або 2-3, або зрізання.
 */
export const PsychotypesLens = lensRefine(
  z.object({
    ...CUT_FIELDS,
    items: z.array(PsychotypeShare)
      .max(3, 'у блок ідуть 2-3 домінантні кластери, не більше')
      .default([]),
  }).strict(),
  (l) => (l.items || []).length > 0,
  'психотипи',
).refine((l) => Boolean(l.cut) || (l.items || []).length >= 2, {
  message: 'один кластер це не розшарування реакції: або 2-3 кластери, або лінза зрізана з причиною',
});

export const CaseDepthMarkup = z.object({
  id: Slug,
  /**
   * Предмет розмітки: або кейс, або тема, рівно одне з двох.
   *
   * Спека знає тільки кейс («кожен ключовий кейс отримує розмітку»), і поки
   * блок жив у терміналі, цього вистачало. На екрані вистачити не могло: кейсів
   * у тижні чотири, а тем десять, тобто шість досьє з десяти лишились би
   * порожніми назавжди. Наказ власника «роби для всіх тем» вимагає другого
   * предмета, а не другого модуля: правила, ліміти й лінзи ті самі.
   */
  case_id: Slug.optional(),
  topic_id: Slug.optional(),
  week: WeekId,

  plot: PlotLens,
  roles: RolesLens,
  psychotypes: PsychotypesLens,

  /**
   * Ціль 2. Обовʼязкова лише там, де сюжет не зрізаний (P0): кейс, у якому поле
   * промовчало, не має до чого рекомендувати.
   */
  how_to_speak: z.array(z.object({
    psychotype_id: Slug.optional(),
    text: z.string().min(1),
  }).strict()).max(2, 'у блоці 1-2 рекомендації').default([]),
  what_to_avoid: z.array(z.string().min(1)).max(2, 'у блоці 1-2 антипатерни').default([]),

  /**
   * Статус це і є призначення розмітки (розділ 9), одним полем, а не парою
   * «стан + приписка»: приписка в коментарі зникає при першому копіюванні.
   */
  status: z.enum(['draft_for_alignment', 'draft', 'validated']).default('draft'),
  /** Питання, заради якого існує ілюстрація. Порожнє питання = порожній приклад. */
  alignment_note: z.string().optional(),

  marked_by: z.string().min(1, 'розмітка без автора не перевіряється'),
  marked_date: IsoDate,
  validated_by: z.string().optional(),
  validated_date: IsoDate.optional(),
}).strict().refine(
  (m) => m.status !== 'validated' || (m.validated_by && m.validated_date && !/очікує/i.test(m.validated_by)),
  { message: 'валідована розмітка мусить мати імʼя валідатора і дату (не-ціль 4)' },
).refine(
  (m) => m.status !== 'draft_for_alignment' || Boolean(m.alignment_note),
  { message: 'ілюстрація без питання до зустрічі це просто нерозмічений кейс: alignment_note обовʼязкове' },
).refine(
  (m) => Boolean(m.plot.cut) || m.how_to_speak.length >= 1,
  { message: 'кейс із незрізаним сюжетом мусить мати комунікаційну рекомендацію (P0)' },
).refine(
  (m) => Boolean(m.case_id) !== Boolean(m.topic_id),
  { message: 'розмітка описує або кейс, або тему, рівно одне з двох: два предмети означали б два різні висновки під одним id' },
);

// Формат блоку живе в depth-block.js без залежностей: його читає і продукт.
export { depthBlock, depthAllLensesCut, depthGoesToReport, DEPTH_BLOCK_MAX_LINES, DEPTH_LINE_MAX_CHARS } from './depth-block.js';
import { depthBlock, depthAllLensesCut, DEPTH_BLOCK_MAX_LINES, DEPTH_LINE_MAX_CHARS } from './depth-block.js';

/**
 * Перевірка розмітки Глибинного шару. Порожня тека це валідний стан.
 * `registries` дає посилальну цілісність: невідомий кейс, актор чи значення
 * словника це помилка, як і в решті контракту (B5).
 */
export function validateDepthMarkups(markups, dictionaries, registries) {
  const issues = [];
  const push = (level, where, message) => issues.push({ level, where, message });
  const ids = (list) => new Set((list || []).map((x) => x.id));
  const plots = ids(dictionaries?.plots);
  const roles = ids(dictionaries?.roles);
  const types = ids(dictionaries?.psychotypes);
  const knownCases = ids(registries?.cases);
  const knownActors = ids(registries?.actors);
  const knownTopics = ids(registries?.topics);
  const stop = dictionaries?._myth_names_stoplist || [];

  (markups || []).forEach((rawMarkup) => {
    const parsed = CaseDepthMarkup.safeParse(rawMarkup);
    if (!parsed.success) {
      parsed.error.issues.forEach((e) => {
        push('error', `${rawMarkup?.id || 'розмітка без id'} -> ${humanPath(e.path)}`, e.message);
      });
      return;
    }
    // Далі читається розібране значення, а не сире: перевірки спираються на
    // проставлені схемою типові значення, а не на те, що редактор дописав руками.
    const m = parsed.data;
    const at = (suffix) => `${m.id} -> ${suffix}`;

    if (m.case_id && knownCases.size && !knownCases.has(m.case_id)) {
      push('error', at('кейс'),
        `кейса «${m.case_id}» немає в реєстрі. Розмітка без кейса нікуди не прикріплюється.`);
    }
    if (m.topic_id && knownTopics.size && !knownTopics.has(m.topic_id)) {
      push('error', at('тема'),
        `теми «${m.topic_id}» немає в реєстрі. Розмітка без теми нікуди не прикріплюється.`);
    }
    [m.plot.primary, m.plot.secondary].filter(Boolean).forEach((p) => {
      if (!plots.has(p.id)) {
        push('error', at(`сюжет ${p.id}`),
          `сюжету «${p.id}» немає в довіднику. Новий сюжет заводиться записом у registry/lenses.json.`);
      }
    });
    (m.roles.items || []).forEach((r) => {
      if (!roles.has(r.role_id)) {
        push('error', at(`роль ${r.role_id}`), `ролі «${r.role_id}» немає в довіднику.`);
      }
      if (r.actor_id && knownActors.size && !knownActors.has(r.actor_id)) {
        push('error', at(`роль ${r.role_id}`), `актора «${r.actor_id}» немає в реєстрі.`);
      }
    });
    (m.psychotypes.items || []).forEach((p) => {
      if (!types.has(p.id)) {
        push('error', at(`психотип ${p.id}`), `психотипу «${p.id}» немає в довіднику.`);
      }
    });
    m.how_to_speak.forEach((h) => {
      if (h.psychotype_id && !types.has(h.psychotype_id)) {
        push('error', at('як говорити'), `психотипу «${h.psychotype_id}» немає в довіднику.`);
      }
    });

    const withShare = (m.psychotypes.items || []).filter((p) => typeof p.share === 'number');
    const sum = withShare.reduce((a, p) => a + p.share, 0);
    if (sum > 1.0001) {
      push('error', at('частки психотипів'),
        `сума часток ${Math.round(sum * 100)}% більша за 100%.`);
    }
    if (withShare.length && withShare.length !== (m.psychotypes.items || []).length) {
      push('warning', at('частки психотипів'),
        'частка стоїть не в усіх кластерів: на екрані це читається як «в решти нуль».');
    }

    // Розділ 8. Ліміти міряються на справжньому рендері звіту, без приміток.
    const lines = depthBlock(m, dictionaries, m.case_id || m.topic_id);
    if (lines.length > DEPTH_BLOCK_MAX_LINES) {
      push('error', at('розмір блоку'),
        `${lines.length} рядків при ліміті ${DEPTH_BLOCK_MAX_LINES} (розділ 8).`);
    }
    lines.forEach((l) => {
      if (l.length > DEPTH_LINE_MAX_CHARS) {
        push('error', at('довжина рядка'),
          `${l.length} знаків при ліміті ${DEPTH_LINE_MAX_CHARS}: «${l.slice(0, 40)}…». ` +
          'У звіті це більше за один екранний рядок.');
      }
    });

    // Критерій приймання 5 і не-ціль 1. Це попередження, а не помилка, і
    // навмисно: стоп-лист імен не може бути повним, тому обіцяти тут гарантію
    // означало б збрехати про силу перевірки. Останнє слово за валідатором.
    // Сканується блок РАЗОМ з примітками: міфічне імʼя в робочому коментарі не
    // лишається в коментарі, воно приходить на зустріч і звідти в текст.
    const text = depthBlock(m, dictionaries, m.case_id || m.topic_id, { notes: true }).join('\n');
    stop.forEach((name) => {
      if (new RegExp(name, 'i').test(text)) {
        push('warning', at('імена'),
          `у блоці трапилось «${name}»: не-ціль 1 забороняє називати реальних людей іменами міфічних героїв.`);
      }
    });

    if (depthAllLensesCut(m)) {
      push('warning', at('усі лінзи зрізані'),
        'усі три лінзи зрізані: у звіт не йде, але лишається в реєстрі як зафіксоване спостереження (розділ 5). Причини зрізань дивіться в самих лінзах.');
    }
    if (m.status === 'draft_for_alignment') {
      push('warning', at('статус'),
        'ілюстрація для узгодження довідника, не матеріал звіту.');
    } else if (m.status === 'draft') {
      push('warning', at('статус'),
        'розмітка не пройшла людську валідацію (не-ціль 4): у звіт іде тільки validated.');
    }
  });

  return issues;
}

/**
 * Перевірка самого довідника (розділ 10 і P0): по три тригери на позицію.
 * Тригер це мітигація ризику 4, тому його відсутність видно окремо від розмітки.
 */
export function validateLensDictionary(dictionaries) {
  const issues = [];
  const need = 3;
  [['plots', 'сюжет'], ['roles', 'роль']].forEach(([key, what]) => {
    (dictionaries?.[key] || []).forEach((x) => {
      const n = (x.triggers || []).length;
      if (n < need) {
        issues.push({
          level: 'error',
          where: `довідник -> ${what} ${x.id}`,
          message: `тригерів ${n} при потрібних ${need} (P0). Тригер це мітигація ризику 4, без нього позиція не працює.`,
        });
      }
    });
  });
  return issues;
}

/* ------------------------------------------------------------------ */
/* Валідація з посилальною цілісністю                                  */
/* ------------------------------------------------------------------ */

const FIELD_UA = {
  schema_version: 'версія схеми',
  weeks: 'тижні',
  topics: 'теми',
  actors: 'актори',
  cases: 'кейси',
  method_notes: 'методологічні правила',
  period: 'період',
  tone_score: 'позиція на шкалі тону',
  probability: 'ймовірність',
  deadline: 'дедлайн',
  criterion: 'критерій розвʼязки',
};

function humanPath(pathArr) {
  return pathArr
    .map((p) => (typeof p === 'number' ? `[${p}]` : (FIELD_UA[p] || p)))
    .join(' -> ');
}

/**
 * Повна перевірка контракту: схема + посилальна цілісність до реєстрів.
 * Повертає плаский список проблем; рівень error валить збірку, warning ні.
 */
export function validateContract(raw, registries) {
  const issues = [];
  const push = (level, where, message) => issues.push({ level, where, message });

  const parsed = Contract.safeParse(raw);
  if (!parsed.success) {
    for (const e of parsed.error.issues) {
      push('error', humanPath(e.path) || 'корінь контракту', e.message);
    }
  }

  // Посилальна цілісність: невідомий id у тижні це помилка (B5).
  const known = {
    topics: new Set((registries?.topics || []).map((t) => t.id)),
    actors: new Set((registries?.actors || []).map((a) => a.id)),
    cases: new Set((registries?.cases || []).map((c) => c.id)),
  };

  (raw.weeks || []).forEach((w) => {
    const at = (kind, id) => `${w.id} -> ${FIELD_UA[kind] || kind} -> ${id}`;

    (w.topics || []).forEach((t) => {
      if (t.id && !known.topics.has(t.id)) {
        push('error', at('topics', t.id),
          `теми «${t.id}» немає в реєстрі. Нова сутність заводиться явним записом у registry/topics.json, а не появою в тижні.`);
      }
    });
    (w.topics_exited || []).forEach((t) => {
      if (t.id && !known.topics.has(t.id)) {
        push('error', at('topics', t.id), `теми «${t.id}» немає в реєстрі.`);
      }
    });
    (w.actors || []).forEach((a) => {
      if (a.id && !known.actors.has(a.id)) {
        push('error', at('actors', a.id), `актора «${a.id}» немає в реєстрі.`);
      }
    });
    (w.cases || []).forEach((c) => {
      if (c.id && !known.cases.has(c.id)) {
        push('error', at('cases', c.id), `кейса «${c.id}» немає в реєстрі.`);
      }
      if (c.host_topic && !known.topics.has(c.host_topic)) {
        push('error', at('cases', c.id),
          `кейс посилається на тему «${c.host_topic}», якої немає в реєстрі.`);
      }
    });

    // Один прогноз = одне число (B7): ринок не має дублювати ймовірність.
    const forecastIds = new Set((w.forecasts || []).map((f) => f.id));
    (w.ensemble?.markets || []).forEach((m) => {
      if (m.forecast_id && !forecastIds.has(m.forecast_id)) {
        push('warning', `${w.id} -> ринок ${m.id}`,
          `ринок посилається на прогноз «${m.forecast_id}», якого немає у тижні.`);
      }
      if (!m.forecast_id) {
        push('warning', `${w.id} -> ринок ${m.id}`,
          'ринок не звʼязаний із прогнозом: привид на карті і діамант у Компасі не зможуть показати одне число.');
      }
    });
  });

  return issues;
}

export function formatIssues(issues) {
  return issues
    .map((i) => `  [${i.level === 'error' ? 'помилка' : 'увага'}] ${i.where}\n      ${i.message}`)
    .join('\n');
}

/** Експорт у JSON Schema для зовнішніх інструментів і майбутнього імпортера. */
export function toJsonSchema() {
  return z.toJSONSchema(Contract, { io: 'input', unrepresentable: 'any' });
}

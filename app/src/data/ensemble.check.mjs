// КАМЕРТОН · перевірка математики шару КОМПАС.
//
// Контрольні числа для трьох сценаріїв пораховані руками на папері і вписані
// сюди як очікувані. Якщо код розійдеться з ними, винен код або папір, і
// розбиратись треба до того, як число потрапить на екран керівництву.

import {
  aggregate, calibrationFactor, percentile, median, logit, sigmoid, clipP,
  brier, betDelta, scoreMarket, registryScore, budgetOf, canBet, validateDraft,
  sortMarkets, DEFAULT_CONFIG,
} from './ensemble.js';

let fails = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}  got=${JSON.stringify(got)}${ok ? '' : ' want=' + JSON.stringify(want)}`);
};
const near = (name, got, want, tol = 0.0005) => {
  const ok = Number.isFinite(got) && Math.abs(got - want) <= tol;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}  got=${got} want=${want}±${tol}`);
};

const CFG = DEFAULT_CONFIG;

// Панель: три оцінювачі з різною історією точності плюс новачок.
const PANEL = [
  { id: 'rt_01', callsign: 'Сокіл', role: 'bettor', brier_rolling: 0.18, resolved_count: 7, conflicts: ['t_tck'] },
  { id: 'rt_02', callsign: 'Кремінь', role: 'bettor', brier_rolling: 0.25, resolved_count: 5, conflicts: [] },
  { id: 'rt_03', callsign: 'Явір', role: 'bettor', brier_rolling: 0.40, resolved_count: 4, conflicts: [] },
  { id: 'rt_04', callsign: 'Пструг', role: 'bettor', brier_rolling: 0.10, resolved_count: 1, conflicts: [] },
  { id: 'san_engine', callsign: 'САН', role: 'SAN', brier_rolling: 0.22, resolved_count: 9, conflicts: [] },
];

console.log('--- основи ---');
eq('кліпінг не пускає нуль і одиницю', [clipP(0), clipP(1)], [0.02, 0.98]);
near('логіт і сигмоїда обертають одне одного', sigmoid(logit(0.62)), 0.62, 1e-9);
eq('калібрування: Brier 0.18 при семи розвʼязаних',
  Math.round(calibrationFactor(PANEL[0]) * 10000) / 10000, 2.7778);
eq('калібрування впирається у стелю 3.0',
  calibrationFactor({ brier_rolling: 0.01, resolved_count: 9 }), 3.0);
eq('холодний старт нейтральний, хоч би який був Brier',
  calibrationFactor(PANEL[3]), 1.0);
eq('персентиль з лінійною інтерполяцією',
  [percentile([0.4, 0.55, 0.7], 0.1), percentile([0.4, 0.55, 0.7], 0.9)], [0.43, 0.67]);
eq('медіана трьох', median([0.55, 0.4, 0.7]), 0.55);

/* ------------------------------------------------------------------ */
console.log('\n--- сценарій А: тільки люди, моделі по темі немає ---');
// Ваги: 25*2.7778=69.444, 20*2.0=40, 15*1.25=18.75, сума 128.194
// Σ w*logit = 69.444*0.200671 + 40*(-0.405465) + 18.75*0.847298 = 13.6037
// L_humans = 0.106118; САН мовчить, тому L_pool той самий
// L_final = 1.3 * 0.106118 = 0.137955; sigmoid = 0.5344 -> 53%
const A = {
  id: 'A', status: 'open', san_estimate: null,
  bets: [
    { participant: 'rt_01', p: 0.55, stake: 25 },
    { participant: 'rt_02', p: 0.40, stake: 20 },
    { participant: 'rt_03', p: 0.70, stake: 15 },
  ],
};
const a = aggregate(A, PANEL, CFG);
near('людський пул у лог-шансах', a.l_humans, 0.106118, 0.0005);
near('пул без моделі дорівнює людському', a.l_pool, 0.106118, 0.0005);
eq('консенсус у відсотках', a.p_ensemble_pct, 53);
eq('вага моделі нульова', a.san_weight, 0);
eq('медіана людей', a.p_humans_median, 0.55);
eq('розкид p10-p90', a.spread_p10_p90, [0.43, 0.67]);
eq('розходження без моделі не буває', a.divergence_flag, false);
eq('трьох оцінок досить, консенсус не попередній', a.preliminary, false);

/* ------------------------------------------------------------------ */
console.log('\n--- сценарій Б: люди плюс модель ---');
// logit(0.62) = 0.489548
// L_pool = 0.3*0.489548 + 0.7*0.106118 = 0.221148
// L_final = 1.3*0.221148 = 0.287492; sigmoid = 0.5714 -> 57%
const B = { ...A, id: 'B', san_estimate: { p: 0.62, basis: 'сценарна модель', as_of: '2026-08-10' } };
const b = aggregate(B, PANEL, CFG);
near('пул з часткою моделі 0.30', b.l_pool, 0.221148, 0.0005);
eq('консенсус у відсотках', b.p_ensemble_pct, 57);
eq('вага моделі це частка з конфігу', b.san_weight, 0.3);
eq('модель входить у розкид', b.spread_p10_p90, [0.445, 0.676]);
eq('розбіжність 7 пунктів це ще не розходження', b.divergence_flag, false);
eq('оцінок чотири', b.n_estimates, 4);

/* ------------------------------------------------------------------ */
console.log('\n--- сценарій В: розходження моделі і панелі ---');
// Ваги: 30*2.7778=83.333, 20*2=40, 10*1.25=12.5, сума 135.833
// Σ w*logit = 83.333*0.619039 + 40*0.405465 + 12.5*0.847298 = 78.3964
// L_humans = 0.577152; logit(0.2) = -1.386294
// L_pool = 0.3*(-1.386294) + 0.7*0.577152 = -0.011882
// L_final = -0.015449; sigmoid = 0.4961 -> 50%
const C = {
  id: 'C', status: 'open',
  san_estimate: { p: 0.20, basis: 'сценарна модель', as_of: '2026-08-10' },
  bets: [
    { participant: 'rt_01', p: 0.65, stake: 30 },
    { participant: 'rt_02', p: 0.60, stake: 20 },
    { participant: 'rt_03', p: 0.70, stake: 10 },
  ],
};
const c = aggregate(C, PANEL, CFG);
near('людський пул', c.l_humans, 0.577152, 0.0005);
near('пул майже занулився: модель тягне в інший бік', c.l_pool, -0.011882, 0.0005);
eq('консенсус у відсотках', c.p_ensemble_pct, 50);
eq('прапорець розходження піднято', c.divergence_flag, true);
eq('розходження у пунктах', c.divergence_pp, 45);
eq('розкид ширший за сценарій Б', c.spread_p10_p90, [0.32, 0.685]);

/* ------------------------------------------------------------------ */
console.log('\n--- мало оцінок і порожні ринки ---');
const one = aggregate({ id: 'D', status: 'open', bets: [{ participant: 'rt_01', p: 0.8, stake: 10 }] }, PANEL, CFG);
eq('одна оцінка: консенсус є, але позначений попереднім', [one.p_ensemble_pct != null, one.preliminary], [true, true]);
eq('розкид на одній оцінці не показується', one.spread_p10_p90, null);
const solo = aggregate({ id: 'E', status: 'open', bets: [], san_estimate: { p: 0.62 } }, PANEL, CFG);
// 65, а не 62: екстремізація за постановкою застосовується і до самотньої оцінки.
eq('панель мовчить: лишається модель, вага одиниця', [solo.p_ensemble_pct, solo.san_weight], [65, 1]);
eq('панель мовчить: медіани людей немає', solo.p_humans_median, null);
const none = aggregate({ id: 'F', status: 'open', bets: [] }, PANEL, CFG);
eq('порожній ринок не вигадує числа', [none.p_ensemble, none.n_bets], [null, 0]);
eq('ставка без балів у розрахунок не йде',
  aggregate({ id: 'G', status: 'open', bets: [{ participant: 'rt_01', p: 0.9, stake: 0 }] }, PANEL, CFG).n_bets, 0);

/* ------------------------------------------------------------------ */
console.log('\n--- скоринг ---');
// Стеля трохи нижча за ставку, бо оцінка кліпиться до 0.98: абсолютної
// впевненості система не приймає навіть від того, хто її заявив.
eq('майже ідеальний прогноз повертає майже всю ставку', betDelta(25, 1, true), 24.96);
eq('половина навмання нічого не дає і не забирає', betDelta(20, 0.5, true), 0);
eq('впевнений промах коштує майже втричі дорожче за ставку',
  Math.round(betDelta(10, 0.02, true)), -28);
near('Brier рахується від кліпнутої оцінки', brier(1, false), 0.9604, 1e-9);

const resolved = {
  ...C, id: 'C', status: 'resolved',
  resolution: { outcome: true, resolved_at: '2026-08-30', evidence: 'офіційне підтвердження' },
  aggregate: aggregate(C, PANEL, CFG),
};
const sc = scoreMarket(resolved, PANEL, CFG);
eq('розвʼязаний ринок дає рядок на кожну ставку', sc.rows.length, 3);
near('Brier ансамблю рахується від сирого консенсусу, не від округленого',
  sc.brier_ensemble, (1 - 0.496138) ** 2, 0.0002);
near('Brier моделі окремо', sc.brier_san, (0.2 - 1) ** 2, 1e-9);
near('Brier медіани людей окремо', sc.brier_humans, (0.65 - 1) ** 2, 1e-9);
eq('нерозвʼязаний ринок не скориться', scoreMarket(C, PANEL, CFG), null);

const reg = registryScore([resolved], PANEL, CFG);
eq('реєстр рахує розвʼязані', reg.resolved_total, 1);
// Сирий консенсус 49.6% хилився в «ні», а сталось «так»: це промах, і реєстр
// зобовʼязаний його показати. На округленому до 50% промах виглядав би нічиєю.
eq('консенсус, що хилився не в той бік, це промах', [reg.hits, reg.misses], [0, 1]);
eq('трійка Brier поруч і жодного прапорця сховати промахи',
  Object.keys(reg).filter((k) => k.startsWith('brier_')).sort(),
  ['brier_ensemble', 'brier_humans_solo', 'brier_san_solo']);

/* ------------------------------------------------------------------ */
console.log('\n--- бюджет і допуск ---');
const MARKETS = [
  { id: 'm1', status: 'open', topic_refs: ['t_gov_trust'], bets: [{ participant: 'rt_01', p: 0.5, stake: 60 }] },
  { id: 'm2', status: 'open', topic_refs: ['t_tck'], bets: [{ participant: 'rt_01', p: 0.4, stake: 30 }] },
];
eq('витрачено і лишилось', budgetOf('rt_01', MARKETS, CFG), { total: 100, spent: 90, left: 10 });
eq('конфлікт інтересів блокує ставку словами',
  canBet(PANEL[0], MARKETS[1], MARKETS, CFG),
  { ok: false, reason: 'конфлікт інтересів: участь у роботі по темі «t_tck»', conflicts: ['t_tck'] });
eq('без конфлікту ставити можна', canBet(PANEL[1], MARKETS[1], MARKETS, CFG).ok, true);
eq('глядач оцінок не робить',
  canBet({ id: 'v1', role: 'viewer' }, MARKETS[0], MARKETS, CFG).ok, false);
eq('на заморожений ринок не ставлять',
  canBet(PANEL[1], { ...MARKETS[0], status: 'locked' }, MARKETS, CFG).reason,
  'ринок у стані «заморожено», оцінки не приймаються');
eq('вичерпаний бюджет блокує',
  canBet(PANEL[0], { ...MARKETS[0], topic_refs: [] },
    [{ ...MARKETS[0], bets: [{ participant: 'rt_01', p: 0.5, stake: 100 }] }], CFG).reason,
  'тижневий бюджет вичерпано');

/* ------------------------------------------------------------------ */
console.log('\n--- червоні лінії чернетки ---');
const good = {
  question: 'Уряд оприлюднить план зимового опалення до 30 вересня 2026',
  resolution_criterion: 'Офіційна публікація на урядовому порталі або постанова КМУ з планом.',
  lock_at: '2026-09-20T00:00:00+03:00',
  resolve_by: '2026-09-30',
  topic_refs: ['t_energy'],
};
eq('коректна чернетка проходить', validateDraft(good).ok, true);
const codes = (m, o) => validateDraft(m, o).errors.map((e) => e.code).sort();
eq('питання про фізичну шкоду не проходить',
  codes({ ...good, question: 'Керівника відомства буде поранено до кінця вересня 2026' }), ['harm']);
eq('компромат не проходить',
  codes({ ...good, question: 'На посадовця зʼявиться компромат до кінця вересня 2026' }), ['targeting']);
eq('деанонімізація не проходить',
  codes({ ...good, resolution_criterion: 'Підтвердженням є розкриття особи респондента панелі та звірка списків.' }),
  ['deanon']);
eq('подвійне заперечення не проходить',
  codes({ ...good, question: 'Уряд не відмовиться не публікувати план до 30 вересня 2026' }),
  ['double_negative']);
eq('вікно заморозки менше 72 годин не проходить',
  codes({ ...good, lock_at: '2026-09-29T00:00:00+03:00' }), ['lock_window']);
eq('без критерію розвʼязки не проходить',
  codes({ ...good, resolution_criterion: 'бо так' }), ['criterion']);
eq('перетин з активною кампанією без позначки не проходить',
  codes(good, { activeCampaignTopics: ['t_energy'] }), ['self_contamination']);

// Ці пʼятнадцять формулювань зовнішня звірка прогнала через фільтр і всі
// пʼятнадцять пройшли повз нього. Правила переписані на корені з нормалізацією
// тексту саме через цей провал, тому кожне з них лишається тут назавжди:
// фільтр, який ловить лише те, що встиг уявити його автор, це не фільтр.
const FORBIDDEN = [
  ['Чи буде ліквідовано керівника відомства до кінця 2026 року', 'harm'],
  ['Чи станеться вбивство очільника структури до кінця вересня', 'harm'],
  ['Чи відбудеться фізичне усунення командувача напрямку', 'harm'],
  ['Чи буде посадовця госпіталізовано з тяжкими травмами', 'harm'],
  ['Чи відбудеться похорон керівника відомства до кінця року', 'harm'],
  ['Чи переживе очільник структури наступний квартал', 'harm'],
  ['Чи буде оголошено підозру заступнику міністра до листопада', 'targeting'],
  ['Чи станеться злив листування радника до кінця серпня', 'targeting'],
  ['Чи буде відкрито кримінальне провадження проти посадовця', 'targeting'],
  ['Чи піде посадовець під суд до кінця року', 'targeting'],
  ['Чи стане відомим справжнє імʼя респондента R-04', 'deanon'],
  ['Чи будуть оприлюднені списки респондентів панелі', 'deanon'],
  ['Чи потраплять персональні дані учасників опитування в мережу', 'deanon'],
  ['Чи буде встановлено особу респондента до кінця місяця', 'deanon'],
  ['Чи розкриють імена опитаних у польовій формі', 'deanon'],
];
FORBIDDEN.forEach(([q, code]) => {
  const got = codes({ ...good, question: q });
  eq(`заборонено: ${q.slice(0, 46)}`, got.includes(code), true);
});

// Дзеркало: звичайні робочі формулювання мають проходити, інакше фільтр
// перетворюється на заборону працювати.
const ALLOWED = [
  'Уряд оприлюднить план зимового опалення до 30 вересня 2026',
  'Частка домену «Цивільна влада» перевищить 30% на зведенні 14 серпня 2026',
  'Кабмін ухвалить постанову про бронювання до кінця вересня 2026',
  'Обсяг цивільного дискурсу зросте проти попереднього тижня',
];
ALLOWED.forEach((q) => {
  eq(`дозволено: ${q.slice(0, 46)}`, validateDraft({ ...good, question: q }).ok, true);
});
eq('з позначкою проходить, але з видимим попередженням',
  (r => [r.ok, r.warnings.map((w) => w.code)])(
    validateDraft({ ...good, self_contamination_risk: true }, { activeCampaignTopics: ['t_energy'] })),
  [true, ['self_contamination']]);

/* ------------------------------------------------------------------ */
console.log('\n--- порядок карток ---');
eq('спершу розходження, далі відкриті за дедлайном',
  sortMarkets([
    { id: 'x', status: 'open', resolve_by: '2026-08-20', aggregate: { divergence_flag: false } },
    { id: 'y', status: 'open', resolve_by: '2026-09-30', aggregate: { divergence_flag: true } },
    { id: 'z', status: 'open', resolve_by: '2026-08-15', aggregate: { divergence_flag: false } },
  ]).map((m) => m.id), ['y', 'z', 'x']);
// Свіжість бʼє давність: розвʼязаний з найдавнішим дедлайном іде вниз, а не вгору.
eq('розвʼязані і заморожені осідають під відкритими',
  sortMarkets([
    { id: 'done', status: 'resolved', resolve_by: '2026-08-01', aggregate: {} },
    { id: 'lock', status: 'locked', resolve_by: '2026-08-05', aggregate: {} },
    { id: 'live', status: 'open', resolve_by: '2026-09-30', aggregate: {} },
  ]).map((m) => m.id), ['live', 'lock', 'done']);

console.log(`\n${fails === 0 ? 'ВСЕ ЗІЙШЛОСЬ' : fails + ' ПРОВАЛІВ'}`);
process.exit(fails ? 1 : 0);

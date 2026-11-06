import {
  getActiveWeek, getStat, getDelta, getSeries, getBalance, getWatchStates,
  collectCases, casesSummary, collectForecasts, forecastScore, getTopics, linkedCase,
  topicTrack, topicDeltas, topicLinks, leversForTopic, leverModel,
  getAnchors, anchorsForTopic, topicVerification, ANCHOR_STALE_WEEKS, ANCHORS, WEEKS,
  listWeeks, toneWindow, kamertonIndex, kamertonIndexSeries, tonePosition, POLARIZED_SIGMA,
} from './selectors.js';

let fails = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}  got=${JSON.stringify(got)}${ok ? '' : ' want=' + JSON.stringify(want)}`);
};

console.log('--- активний тиждень ---');
eq('за замовчуванням останній', getActiveWeek().id, '2026-W35');
eq('явний вибір', getActiveWeek('2026-W30').id, '2026-W30');

console.log('\n--- дельти рахуються, не беруться з полів delta ---');
eq('strength.mil W31', getDelta('strength.mil', '2026-W31'), { value: -0.01, source: 'computed' });
eq('strength.mil W30 (prev null -> fallback)', getDelta('strength.mil', '2026-W30'), { value: null, source: null });
eq('connectedness.mil W30 (плато)', getDelta('connectedness.mil', '2026-W30'), { value: 0, source: 'computed' });
eq('connectedness.civ W31', getDelta('connectedness.civ', '2026-W31'), { value: -0.46, source: 'computed' });
eq('volume.mil W31 у відсотках', getDelta('volume.mil', '2026-W31'), { value: -58.8, source: 'computed' });
eq('volume.civ W31 у відсотках', getDelta('volume.civ', '2026-W31'), { value: -34.5, source: 'computed' });
eq('balance.civ.constructive W31', getDelta('balance.civ.constructive', '2026-W31'), { value: 10.3, source: 'computed' });
eq('balance.mil.constructive W31', getDelta('balance.mil.constructive', '2026-W31'), { value: -3.7, source: 'computed' });
eq('state.civ.dominant W31', getDelta('state.civ.dominant', '2026-W31'), { value: -10.5, source: 'computed' });
eq('proactivity.civ W31', getDelta('proactivity.civ', '2026-W31'), { value: -10.3, source: 'computed' });
eq('перший тиждень масиву без бази', getDelta('connectedness.mil', '2026-W29'), { value: null, source: null });

console.log('\n--- серії для спарклайнів ---');
eq('connectedness.mil', getSeries('connectedness.mil'), [2.96, 2.96, 2.54, 2.85, 2.8, 2.89, 2.81]);
eq('strength.mil (W29 без виміру)', getSeries('strength.mil'), [0.43, 0.42, 0.28, 0.35, 0.35, 0.42]);
eq('strength.civ (W29 і W30 без виміру)', getSeries('strength.civ'), [0.47, 0.39, 0.56, 0.48, 0.63]);
eq('серія обрізана активним тижнем', getSeries('connectedness.mil', '2026-W30'), [2.96, 2.96]);

console.log('\n--- null через partial-стан, нічого не вигадано ---');
eq('strength.mil W29 value', getStat('strength.mil', '2026-W29').value, null);
eq('strength.civ W31 delta', getStat('strength.civ', '2026-W31').delta, null);
eq('W29 позначений як неповний', getActiveWeek('2026-W29').data_quality, 'partial');

console.log('\n--- баланс і канат ---');
eq('mil W31 канат нормалізований', getBalance('mil', '2026-W31').rope, 36.1);
eq('civ W31 канат', getBalance('civ', '2026-W31').rope, 42.5); // 40.1 / (40.1 + 54.3)

console.log('\n--- тривожні стани ---');
const watch = getWatchStates('2026-W31');
eq('Знищення civ дельта порахована', watch.find(s => s.name === 'Знищення').delta, { value: 5.5, source: 'computed' });
eq('Баланс mil дельта з контракту (нового стану не було)', watch.find(s => s.name === 'Баланс').delta, { value: 4.9, source: 'contract' });

console.log('\n--- кейси наскрізні ---');
const cases = collectCases('2026-W31');
eq('кількість активних кейсів', cases.length, 3);
const lviv = cases.find(c => c.id === 'case_lviv_tck');
eq('Львів показаний один раз', cases.filter(c => c.id === 'case_lviv_tck').length, 1);
eq('вік кейса Львів у тижнях (W28 -> W31)', lviv.age, 3);
eq('історія Львова по тижнях', lviv.history.map(h => h.week), ['2026-W30', '2026-W31']);
eq('Львів застарілий', lviv.isStale, true);
eq('новий кейс 225 вік 0', cases.find(c => c.id === 'case_225_425').age, 0);
eq('підсумок кейсів', casesSummary('2026-W31'), { total: 3, open: 3, festering: 1, nextCheck: '2026-W32' });
eq('W29 без кейсів', collectCases('2026-W29').length, 0);

console.log('\n--- кейс, що загноївся (похідний стан рендера) ---');
const lviv31 = collectCases('2026-W31').find(c => c.id === 'case_lviv_tck');
eq('у контракті статус лишається open', lviv31.status, 'open');
eq('у рендері показується як festering', lviv31.renderStatus, 'festering');
eq('підпис пояснює чому', lviv31.overdueNote, 'без відповіді довше за норму');
eq('свіжі кейси не чіпає', collectCases('2026-W31').find(c => c.id === 'case_225_425').renderStatus, 'open');
eq('у W30 той самий кейс ще в нормі',
  collectCases('2026-W30').find(c => c.id === 'case_lviv_tck').renderStatus, 'open');
eq('підсумок рахує загноєні', casesSummary('2026-W31').festering, 1);

console.log('\n--- ранжування тем без ваги ---');
eq('W31 без weight_pct: нові й ті, що ростуть, вище',
  getTopics('2026-W31').map(t => t.trend), ['new', 'new', 'up', 'up', 'up', 'flat']);
eq('W30 з вагами: ранжування за вагою',
  getTopics('2026-W30').map(t => t.weight_pct), [19, 14.3, 11.9, 8.7, 7.3]);
eq('ранги проставлені підряд', getTopics('2026-W31').map(t => t.rank), [1, 2, 3, 4, 5, 6]);

console.log('\n--- прогнози ---');
const f = collectForecasts('2026-W31');
eq('реєстр зібраний з усіх тижнів', f.length, 5);
eq('f_2907_stab узятий у найсвіжішому статусі', f.find(x => x.id === 'f_2907_stab').status, 'partial_hit');
eq('відкриті першими', f.slice(0, 2).every(x => x.status === 'open'), true);
eq('відкриті за дедлайном', f.slice(0, 2).map(x => x.deadline), ['2026-08-07', '2026-08-14']);
eq('рахунок', forecastScore('2026-W31'), { hits: 1, misses: 1, open: 2, partial: 1, total: 5 });
eq('на W29 реєстр знає лише один прогноз', forecastScore('2026-W29'), { hits: 0, misses: 0, open: 1, partial: 0, total: 1 });

console.log('\n--- місток тема -> кейс ---');
eq('номер підрозділу веде до свого кейса',
  linkedCase('t_case_225', '2026-W31')?.id, 'case_225_425');
eq('абревіатура ТЦК веде до львівського кейса',
  linkedCase('t_tck', '2026-W31')?.id, 'case_lviv_tck');
eq('тема без розпізнавального маркера кейса не має',
  linkedCase('t_gratitude', '2026-W31'), null);
eq('загальна тема довіри кейса не має',
  linkedCase('t_gov_trust', '2026-W31'), null);
eq('у тижні без кейсів містків немає',
  linkedCase('t_tck', '2026-W29'), null);

console.log('\n--- досьє: трек, дельти, звʼязки, важелі ---');
eq('трек ТЦК по всьому корпусу',
  topicTrack('t_tck').map(x => `${x.short}:${x.tone}`),
  ['W29:-0.55', 'W30:-0.5', 'W31:-0.5', 'W32:-0.6', 'W33:-0.75', 'W34:-0.75', 'W35:-0.75']);
/* Проба взята з НАЙСВІЖІШОЇ теми: щойно тема тримається другий тиждень, один
   запис у треку більше не описує «нову тему», і пробу треба переставити на тему
   останнього тижня. Правило перевірки те саме, змінюється лише проба.
   Історія проб: t_memory, далі t_burnout (зайшла на W33 і лишилась на W34),
   далі t_identity (уперше на W35). */
eq('нова тема має один запис', topicTrack('t_identity').length, 1);
eq('нова тема позначена як нова', topicDeltas('t_gratitude', '2026-W31').isNew, true);
eq('дельта тону словами', topicDeltas('t_tck', '2026-W31').tone, 'без зміни');
eq('дельта тону W30 проти W29', topicDeltas('t_tck', '2026-W30').tone, 'дрейф у конструктив');
eq('дельта ваги словами', topicDeltas('t_tck', '2026-W31').salience, 'без зміни');
eq('звʼязок має причину словами і напрямок',
  (l => [l.dir, l.reason])(topicLinks('t_case_225', '2026-W31').find(x => x.to === 't_gov_trust')),
  ['out', 'іменований кейс живить загальну недовіру']);
eq('тема без звʼязків дає порожньо', topicLinks('t_gratitude', '2026-W31'), []);
// Тема, на яку показують інші, більше не показує порожньо: причина належить парі.
eq('вхідні звʼязки видно з іншого кінця',
  topicLinks('t_gov_trust', '2026-W32').map(l => `${l.dir}:${l.to}`),
  ['in:t_anticorr', 'in:t_appointment', 'in:t_tck', 'in:t_airdefence', 'in:t_case_225']);
eq('та сама причина читається з обох кінців',
  topicLinks('t_gov_trust', '2026-W32').find(l => l.to === 't_case_225').reason,
  topicLinks('t_case_225', '2026-W32').find(l => l.to === 't_gov_trust').reason);
eq('важелі теми через кейс і пряму привʼязку',
  leversForTopic('t_case_225', '2026-W31').map(l => l.id), ['l_225_response', 'l_tech_units']);
eq('тема без важелів', leversForTopic('t_anticorr', '2026-W31'), []);
eq('прямий зсув береться з даних',
  leverModel('l_225_response', '2026-W31').direct, [{ topic: 't_case_225', value: 0.25 }]);
eq('поширення тільки по звʼязках із загасанням 0.4',
  leverModel('l_225_response', '2026-W31').spread.map(s => [s.topic, s.value]), [['t_gov_trust', 0.1]]);
eq('поширення не йде далі другого кола',
  leverModel('l_225_response', '2026-W31').spread.every(s => s.from === 't_case_225'), true);
eq('прямий зсув перекриває поширення',
  leverModel('l_tech_units', '2026-W31').total, { t_case_225: 0.15, t_gov_trust: 0.1 });
eq('тема без звʼязків нікуди не поширює',
  leverModel('l_gratitude_window', '2026-W31').spread, []);

console.log('\n--- теми ---');
const t30 = getTopics('2026-W30');
eq('W30 ранжовано по вазі', t30.map(x => x.weight_pct), [19.0, 14.3, 11.9, 8.7, 7.3]);
eq('розбіжність -> conflict', t30.find(x => x.id === 't_tck').verificationTag, { kind: 'conflict' });
eq('збіг трьох джерел -> match 3', t30.find(x => x.id === 't_hc_change').verificationTag, { kind: 'match', count: 3 });

console.log('\n--- соц-якорі ---');
const anch = getAnchors('2026-W31');
eq('якір відомий у своєму тижні', anch.map(a => a.id), ['a_kiis_trust_0826']);
eq('до публікації якоря в тижні немає', [getAnchors('2026-W30').length, getAnchors('2026-W29').length], [0, 0]);
eq('дельта проти минулої хвилі рахується, а не береться з тексту', anch[0].delta, -12);
eq('давність від кінця поля, не від пресрелізу', [anch[0].ageWeeks, anch[0].stale], [0, false]);
eq('поле показане датами', anch[0].fieldLabel, '20.07 - 03.08');
eq('якір це факт', anch[0].status, 'fact');
const cover = anchorsForTopic('t_gov_trust', '2026-W31');
eq('якір накриває свою тему', cover.map(a => a.agreement), ['match']);
eq('тема поза covers якоря не бачить', anchorsForTopic('t_tck', '2026-W31'), []);
eq('SourceTag апгрейдиться до двох джерел',
  (({ kind, count, label }) => ({ kind, count, label }))(topicVerification(
    getTopics('2026-W31').find(t => t.id === 't_gov_trust'), '2026-W31')),
  { kind: 'match', count: 2, label: 'збіг 2 джерела: САН + СОЦ' });
// Розбіжність і застарілість у корпусі поки нема на чому показати, тому
// ганяємо ті самі функції на тимчасово підміненому якорі і повертаємо як було.
const withAnchor = (patch, fn) => {
  const saved = { ...ANCHORS[0] };
  Object.assign(ANCHORS[0], patch);
  try { return fn(); } finally {
    Object.keys(ANCHORS[0]).forEach((k) => { if (!(k in saved)) delete ANCHORS[0][k]; });
    Object.assign(ANCHORS[0], saved);
  }
};
eq('протилежний напрям дає розбіжність',
  withAnchor({ expects_trend: 'down' }, () => anchorsForTopic('t_gov_trust', '2026-W31')[0].agreement),
  'conflict');
eq('розбіжність доходить до SourceTag',
  withAnchor({ expects_trend: 'down' }, () => topicVerification(
    getTopics('2026-W31').find(t => t.id === 't_gov_trust'), '2026-W31').label),
  'розбіжність: САН і СОЦ');
eq('старший за поріг якір тьмяніє і вибуває зі звірки',
  withAnchor({ field_dates: { from: '2026-03-01', to: '2026-03-15' } }, () => {
    const a = anchorsForTopic('t_gov_trust', '2026-W31')[0];
    return [a.ageWeeks > ANCHOR_STALE_WEEKS, a.stale, a.agreement];
  }), [true, true, 'none']);
eq('застарілий якір не апгрейдить звірку',
  withAnchor({ field_dates: { from: '2026-03-01', to: '2026-03-15' } }, () => topicVerification(
    getTopics('2026-W31').find(t => t.id === 't_gov_trust'), '2026-W31').kind), 'single');
eq('поріг застарілості заявлений', ANCHOR_STALE_WEEKS, 8);
eq('якір повернувся у вихідний стан', anchorsForTopic('t_gov_trust', '2026-W31')[0].agreement, 'match');
eq('якорі живуть у корені контракту, а не в тижнях',
  WEEKS.every(w => w.anchors === undefined) && Array.isArray(ANCHORS), true);
eq('якір не стає темою і не потрапляє на карту',
  getTopics('2026-W31').every(t => !String(t.id).startsWith('a_')), true);
eq('числа САН і якоря не змішуються: у теми свій tone_score, у якоря свій value',
  typeof getTopics('2026-W31').find(t => t.id === 't_gov_trust').tone_score === 'number' &&
  anch[0].value === 15 && anch[0].tone_score === undefined, true);

console.log('\n--- камертон-індекс ---');
eq('шкала прибита до абсолютних полюсів, а не до вікна корпусу',
  [tonePosition(-1), tonePosition(0), tonePosition(1)], [0, 50, 100]);
eq('індекс тижня і дельта до попереднього',
  (k => [k.value, k.delta])(kamertonIndex('2026-W32')), [33, -4]);
eq('ряд по всіх тижнях', kamertonIndexSeries('2026-W32').map(x => x.value), [45, 43, 37, 33]);
eq('перший тиждень корпусу без дельти', kamertonIndex('2026-W29').delta, null);
eq('ряд обрізаний активним тижнем',
  kamertonIndexSeries('2026-W30').map(x => x.id), ['2026-W29', '2026-W30']);
// Зважене середнє: перевіряємо руками на тижні, де тем мало.
eq('зважене середнє порахованe правильно', (() => {
  const k = kamertonIndex('2026-W31');
  const manual = k.rows.reduce((a, r) => a + r.w * r.p, 0) / k.weightSum;
  return [Math.round(manual), k.value];
})(), [37, 37]);
eq('вага теми це salience, тобто розмір вузла на карті',
  kamertonIndex('2026-W32').rows.find(r => r.id === 't_gov_trust').w, 5);
eq('теми поза полем в індекс не входять',
  kamertonIndex('2026-W32').rows.some(r => r.id === 't_tech_update'), false);
eq('поляризованість це поріг по зваженому відхиленню',
  (k => [k.sigma > POLARIZED_SIGMA, k.polarized])(kamertonIndex('2026-W32')), [true, true]);
eq('спокійніший тиждень поляризованим не називається',
  kamertonIndex('2026-W30').polarized, false);
eq('індекс падає четвертий тиждень поспіль',
  kamertonIndexSeries('2026-W32').every((x, i, a) => i === 0 || x.value < a[i - 1].value), true);

console.log('\n--- схований тиждень ---');
eq('W29 схований з перемикача', listWeeks().filter(w => !w.hidden).map(w => w.id),
  ['2026-W30', '2026-W31', '2026-W32', '2026-W33', '2026-W34', '2026-W35']);
eq('але лишається в корпусі', WEEKS.length, 7);
eq('і відкривається прямим запитом', getActiveWeek('2026-W29').id, '2026-W29');
eq('дельта W30 і далі рахується від нього',
  getDelta('connectedness.mil', '2026-W30'), { value: 0, source: 'computed' });
/* Вікно тону РОЗШИРИЛОСЬ на W33, і це свідомо, а не випадково: тиждень приніс
   два нові краї шкали — виснаження у війську (-0.85, найважчий стан методики) і
   опіку над слабшими (0.75). Перевірка лишається на місці саме як сторож: якщо
   вікно поїде без нового краю в контракті, вона впаде, і всі зорі корпусу
   перерахуються по інших координатах непомітно. */
eq('вікно тону не поїхало', [toneWindow().lo, toneWindow().hi], [-1, 0.9]);

console.log('\n--- тиждень W32 ---');
eq('індекс міцності військових упав нижче критичної межі',
  [getStat('strength.mil', '2026-W32').value, getDelta('strength.mil', '2026-W32')],
  [0.28, { value: -0.14, source: 'computed' }]);
eq('обсяги розійшлися в різні боки',
  [getDelta('volume.mil', '2026-W32').value, getDelta('volume.civ', '2026-W32').value],
  [19.8, -18.2]);
eq('дієвмісність цивільних зросла', getDelta('proactivity.civ', '2026-W32'),
  { value: 14.4, source: 'computed' });
eq('канат військових', getBalance('mil', '2026-W32').rope, 25.9);
eq('Знищення у цивільних скоротилось',
  getWatchStates('2026-W32').find(s => s.aud === 'civ' && s.name === 'Знищення').delta,
  { value: -2.5, source: 'computed' });
// Львів закритий у W32 без відповіді: питання не розвʼязали, але його перестали ставити.
// Закритий кейс перестає бути відкритим, а отже і загноєним, хоча вік лишається чесним.
eq('Львів закритий на четвертому тижні',
  (c => [c.age, c.status, c.renderStatus, c.isOpen])(
    collectCases('2026-W32').find(x => x.id === 'case_lviv_tck')),
  [4, 'closed', 'closed', false]);
eq('загноєних не лишилось', casesSummary('2026-W32'),
  { total: 4, open: 3, festering: 0, nextCheck: '2026-W33' });
// G0 змінив склад реєстру, і очікування оновлені під нього, а не підкручені.
// Було: ринки КОМПАСа і редакційні прогнози це дві паралельні системи, що
// описували ті самі події, але не знали одна про одну, тому ринок у рахунок не
// входив. Стало: кожен ринок має свій Forecast (forecast_id), тому розвʼязаний
// ринок додає промах, а відкриті додають очікування. Саме цього G0 і домагався:
// реєстр не може забути перевірку тільки тому, що вона заведена як ринок.
eq('прогнози з дедлайном 07.08 закриті мимо',
  collectForecasts('2026-W32').filter(x => x.deadline === '2026-08-07').map(x => x.status),
  ['miss', 'miss', 'miss']);
eq('рахунок прогнозів після звʼязки з ринками', forecastScore('2026-W32'),
  { hits: 1, misses: 4, open: 8, partial: 0, total: 13 });
// Кожен ринок мусить мати свій прогноз: інакше «Наступні 14 днів» знову покаже
// «без числа», а привид на карті і діамант Компаса розійдуться.
eq('усі ринки звʼязані з прогнозами', (() => {
  const wk = WEEKS.find(w => w.id === '2026-W32');
  const mk = wk.ensemble?.markets || [];
  return mk.length > 0 && mk.every(m => Boolean(m.forecast_id));
})(), true);
eq('нові теми попереду', getTopics('2026-W32').map(t => t.trend),
  ['new', 'new', 'new', 'up', 'up', 'flat', 'flat', 'flat', 'flat', 'down']);
eq('технологічне оновлення вибуло з поля',
  getActiveWeek('2026-W32').topics_exited.map(t => t.id), ['t_tech_update']);
eq('тема призначення без маркера містка не має',
  linkedCase('t_appointment', '2026-W32'), null);
eq('але кейс призначення обертається навколо своєї теми',
  collectCases('2026-W32').find(c => c.id === 'case_svr_appointment').host_topic, 't_appointment');

console.log(`\n${fails === 0 ? 'ВСЕ ЗІЙШЛОСЬ' : fails + ' ПРОВАЛІВ'}`);
process.exit(fails ? 1 : 0);

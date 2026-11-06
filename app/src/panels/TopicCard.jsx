import React from 'react';
import { Panel, HudButton, StatusTag, SourceTag, DeltaBadge, LeverButton } from 'astrolabe-ds';
import {
  shortWeek, linkedCase, topicTrack, topicDeltas, topicLinks,
  leversForTopic, leverModel, topicName, topicVerification, ANCHOR_STALE_WEEKS,
  verificationBreakdown, topicMergeNote, actorName, precedentSignals, depthBlocks,
} from '../data/selectors.js';
import { AUD_LABEL } from '../map/starfield.js';
import { placeLabels } from '../util/labels.js';
import { buildHash } from '../util/hash.js';
import { plural } from '../util/plural.js';

const TREND_LABEL = {
  new: 'нова тема',
  up: 'набирає увагу',
  flat: 'тримається',
  down: 'втрачає увагу',
  out: 'вийшла з поля',
};

/**
 * Трек теми: та сама шкала тону, що внизу карти, у мініатюрі.
 * Маркери позицій по тижнях зʼєднані тонкою лінією, останній яскравий.
 */
function ToneTrack({ track }) {
  const W = 300;
  // Висота виросла з 54 рівно на один ряд підписів: вісь кодує тон, а не час,
  // тому два тижні з близьким тоном сідають на один x і накладаються.
  const H = 64;
  const PAD = 10;
  // «W30» на fontSize 10 моноширинним це приблизно 20 одиниць viewBox.
  const LABEL_W = 20;
  const ROW_H = 10;
  const x = (tone) => PAD + ((tone + 1) / 2) * (W - PAD * 2);
  const y = H - 36;

  // Пріоритет останньому тижню: він розкладається перший і завжди лишається
  // на верхньому ряду. Старіші тижні відступають рядом нижче, а якщо не
  // влазять і туди, ховаються у tooltip.
  const rows = placeLabels(
    track.map((p, i) => ({ x: x(p.tone), rank: track.length - 1 - i })),
    { minGap: LABEL_W, rows: 2 }
  );

  return (
    <svg className="k-track" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="трек теми на шкалі тону">
      <defs>
        <linearGradient id="k-track-grad" x1="0" x2="1">
          <stop offset="0" stopColor="var(--a-destr)" stopOpacity="0.85" />
          <stop offset="0.5" stopColor="var(--a-text-dim)" stopOpacity="0.4" />
          <stop offset="1" stopColor="var(--a-constr)" stopOpacity="0.85" />
        </linearGradient>
      </defs>

      <rect x={PAD} y={y - 1} width={W - PAD * 2} height="2" fill="url(#k-track-grad)" />

      {track.length > 1 && (
        <polyline
          points={track.map((p) => `${x(p.tone)},${y - 12}`).join(' ')}
          fill="none"
          stroke="var(--a-cyan)"
          strokeOpacity="0.45"
          strokeWidth="1"
        />
      )}

      {track.map((p, i) => {
        const last = i === track.length - 1;
        const cx = x(p.tone);
        const row = rows[i];
        // На краях підпис не зсуваємо, а притискаємо якорем: зсув по x означав
        // би інший тон, а вилізти за viewBox він однаково не має права.
        const nearLeft = cx < PAD + LABEL_W / 2;
        const nearRight = cx > W - PAD - LABEL_W / 2;
        return (
          <g key={p.week}>
            {/* Підпис міг не влізти, тому назва тижня доступна і наведенням */}
            <title>{p.short}</title>
            <circle
              cx={cx}
              cy={y - 12}
              r={last ? 4.5 : 3}
              fill={last ? 'var(--a-cyan)' : 'var(--a-text-dim)'}
              fillOpacity={last ? 1 : 0.7}
            />
            {row !== null && (
              <text
                x={nearLeft ? PAD : nearRight ? W - PAD : cx}
                y={y + 14 + row * ROW_H}
                textAnchor={nearLeft ? 'start' : nearRight ? 'end' : 'middle'}
                fontSize="10"
                fill={last ? 'var(--a-cyan)' : 'var(--a-text-dim)'}
              >
                {p.short}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

const AGREEMENT_NOTE = {
  match: 'напрям соціології збігається з напрямом теми у звіті САН',
  conflict: 'соціологія і звіт САН показують різні напрями: конфлікт не згладжуємо',
  none: 'у звірці не бере участі',
};

/**
 * Соц-якір у досьє.
 *
 * Числа САН і соціології стоять поруч, але ніколи не в одній шкалі і ніколи
 * не в середньому: це різні виміри, звіряти можна тільки напрям. Тому тут
 * метрика зі своєю дельтою, свої дати поля і своя давність.
 */
function Rows({ children }) {
  return <dl className="k-rows">{children}</dl>;
}

/** Один рядок таблиці досьє. Порожнє значення рядок не малює. */
function Row({ label, children }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function AnchorBlock({ anchor }) {
  const sign = (v) => (v > 0 ? `+${v}` : String(v));
  return (
    <div className="k-stack k-stack--tight">
      <div className="k-row k-row--split">
        <span className="k-sub">
          <span className="k-label">{anchor.org}</span> {anchor.metric}
        </span>
        <StatusTag status={anchor.status || 'fact'} />
      </div>
      <Rows>
        <Row label="значення">
          <b>{sign(anchor.value)}</b>{' '}
          <DeltaBadge value={anchor.delta} polarity="up-good" unit=" п.п." hasValue={anchor.value !== null && anchor.value !== undefined} />
        </Row>
        <Row label="попередня хвиля">
          {sign(anchor.prev_value)}
          {anchor.prev_note ? ` · ${anchor.prev_note}` : ''}
        </Row>
        <Row label="поле">{anchor.fieldLabel}</Row>
        <Row label="опубліковано">{anchor.publishedLabel}</Row>
        <Row label="давність">{anchor.ageLabel}</Row>
        <Row label="звірка">
          {anchor.stale
            ? `застарів, не використовується у звірці: понад ${ANCHOR_STALE_WEEKS} тижнів від поля`
            : AGREEMENT_NOTE[anchor.agreement] || ''}
        </Row>
        <Row label="джерело">{anchor.citation}</Row>
      </Rows>
    </div>
  );
}

/**
 * Перехід між кейсами для Глибинного шару.
 *
 * Стара секція не перетікає в нову підміною тексту: спершу коротке розчинення
 * (150 мс), потім пауза-провал (100 мс), і лише тоді занурення нової. Пауза
 * тут несуча, а не косметична: без неї мозок читає зміну як оновлення тих
 * самих даних, а не як «інший кейс, інша історія».
 *
 * Рух живе в CSS, тут тільки стан: JS-таймер вирішує ЩО показувати, а не як.
 */
function useDepthSwap(blocks) {
  const key = blocks.map((b) => b.id).join('|');
  const [shown, setShown] = React.useState(blocks);
  const [leaving, setLeaving] = React.useState(false);
  const shownKey = shown.map((b) => b.id).join('|');

  React.useEffect(() => {
    if (key === shownKey) return undefined;
    // Порожній попередній стан розчиняти нічого: перший показ це просто вхід.
    if (!shownKey) { setShown(blocks); return undefined; }
    setLeaving(true);
    const t = setTimeout(() => { setShown(blocks); setLeaving(false); }, 250);
    return () => clearTimeout(t);
  }, [key, shownKey, blocks]);

  return { shown, leaving };
}

/**
 * Один рядок Глибинного шару. Зрізана лінза виводиться тим самим рядком з
 * причиною (розділ 16), а не зникає: відсутність лінзи це рішення розмітника,
 * і читач має його бачити, інакше блок виглядає недоробленим.
 */
function DepthLine({ label, lens, children, step }) {
  // Каскад лінз це ієрархія читання, а не декор: спершу історія, потім ролі,
  // потім аудиторії. Крок затримки живе в CSS-змінній, щоб тайминги системи
  // не розповзлись по компонентах.
  return (
    <p className="k-depth__line k-depth__reveal" style={{ '--step': step }}>
      <span className="k-depth__key">{label}</span>
      <span className="k-depth__val">
        {lens.cut ? <span className="k-depth__cut">зрізано · {lens.reason}</span> : children}
      </span>
    </p>
  );
}

/**
 * Мітка звірки словами, для згорнутого рядка шапки.
 *
 * Плашка SourceTag у цей рядок не ставиться навмисно: рамка тягне увагу на
 * себе, а клік по тегу перехоплює поповер довідки, і рядок перестав би
 * розгортатись. Обʼєкт звірки тут той самий, що йде в SourceTag розгорнутого
 * блоку, тому цифра одна на двох і розійтись їм ніяк.
 */
function sourceWord(tag, label) {
  if (!tag) return '';
  if (label) return label;
  if (tag.kind === 'conflict') return 'розбіжність';
  if (tag.kind !== 'match') return '1 джерело';
  return tag.count
    ? `збіг ${tag.count} ${plural(tag.count, ['джерело', 'джерела', 'джерел'])}`
    : 'збіг';
}

/**
 * Досьє метанаративу.
 * Чотири секції відповідають на чотири питання: що це, як змінилась,
 * з ким повʼязана, що з нею можна зробити.
 */
export default function TopicCard({
  topic, weekId, activeLever, onClose, onPulse, onOpenCases, onPickLever, onResetModel,
  onPrecedents,
}) {
  const bridge = topic && !topic.exited ? linkedCase(topic.id, weekId) : null;
  const track = topic && !topic.exited ? topicTrack(topic.id, weekId).filter((p) => p.tone !== null) : [];
  const deltas = topic && !topic.exited ? topicDeltas(topic.id, weekId) : null;
  const links = topic && !topic.exited ? topicLinks(topic.id, weekId) : [];
  const levers = topic && !topic.exited ? leversForTopic(topic.id, weekId) : [];
  const model = activeLever ? leverModel(activeLever, weekId) : null;
  const verif = topic && !topic.exited ? topicVerification(topic, weekId) : null;
  // Одне джерело звірки на два місця: згорнутий рядок і плашку під ним.
  const vtag = topic ? verif || topic.verificationTag : null;
  const anchors = verif?.anchors || [];
  const mergeNote = topic ? topicMergeNote(topic.id) : null;
  const precSignals = topic && !topic.exited ? precedentSignals(topic.id, weekId) : [];
  const depthList = topic && !topic.exited ? depthBlocks(topic.id, weekId) : [];
  const depthSwap = useDepthSwap(depthList);
  // Рекомендації з усіх блоків теми зливаються в один перелік: у «мові
  // наслідків» вони стоять поруч з важелями, і ділити їх ще й по кейсах
  // означало б розсипати відповідь на питання «що робити» на три списки.
  const depthSpeech = depthList.flatMap((b) => b.howToSpeak);
  const depthAvoid = depthList.flatMap((b) => b.whatToAvoid);

  // Паспорт даних за замовчуванням згорнутий: висновок має стояти на другому
  // екрані читання, а не після чотирьох рядків походження. Стан навмисно не
  // скидається при зміні теми: керівник, який один раз розгорнув паспорт,
  // читає його і в наступних темах, і згортання за нього було б сваволею.
  const [metaOpen, setMetaOpen] = React.useState(false);

  // Підтвердження копіювання живе дві секунди: без нього незрозуміло, чи
  // натиснулось, а постійна зміна напису робила б кнопку неоднозначною.
  const [copied, setCopied] = React.useState(false);
  const copyNodeLink = (id) => {
    if (!id) return;
    const url = window.location.origin + window.location.pathname +
      buildHash({ weekId, layer: 'topics', nodeId: id });
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(() => {});
    } else {
      // file:// без дозволу на буфер: показуємо адресу, щоб її можна було взяти руками
      window.prompt('Посилання на вузол:', url);
    }
  };

  return (
    <Panel glass>
      <div className="k-dock__head">
        <span className="a-tab">ДОСЬЄ</span>
        <span className="k-row">
          {/* E1: посилання саме на цей вузол. Керівник пересилає кадр, а не
              інструкцію «відкрий і потикай». */}
          <HudButton
            variant="ghost"
            aria-label="скопіювати посилання на вузол"
            onClick={() => copyNodeLink(topic?.id)}
          >
            {copied ? 'СКОПІЙОВАНО' : 'ПОСИЛАННЯ'}
          </HudButton>
          <HudButton variant="ghost" aria-label="закрити досьє" onClick={onClose}>
            ✕
          </HudButton>
        </span>
      </div>

      <div className="k-dock__body k-stack k-stack--tight k-dense">
        {!topic && <div className="a-empty">тема не знайдена в цьому тижні</div>}

        {topic && (
          <>
            {/* ---- 1. ЩО ЦЕ ----
                Порядок читання: заголовок -> висновок -> паспорт даних.
                Метаблок нікуди не подівся, він згорнувся: походження і звірка
                потрібні тоді, коли висновок уже прочитаний, а до того вони
                тільки відсувають сенс на екран нижче. */}
            <div className="k-lead">{topic.name}</div>
            <div className="k-row">
              {topic.aud && <span className="k-label">{AUD_LABEL[topic.aud]}</span>}
              {topic.trend && (
                <span className="k-note">{TREND_LABEL[topic.trend] || topic.trend}</span>
              )}
            </div>

            {/* Твердження стоїть без підпису і без плашки поруч: у досьє
                читають сам висновок, а слово «Твердження» над ним було ще
                одним службовим рядком між заголовком і сенсом. Підпис зі
                статусом лишився в розгорнутому паспорті. */}
            {topic.note && !topic.exited && <p className="k-sub">{topic.note}</p>}

            <button
              type="button"
              className="k-meta__head"
              aria-expanded={metaOpen}
              onClick={() => setMetaOpen((v) => !v)}
            >
              <span className="k-meta__caret" aria-hidden="true">{metaOpen ? '▾' : '▸'}</span>
              {/* Джерело в рядку коротке: повне «тижневик САН» з довідкою
                  чекає в розгорнутому блоці. */}
              САН · {shortWeek(weekId)} · оцінка{vtag ? ` · ${sourceWord(vtag, verif?.label)}` : ''}
            </button>

            {metaOpen && (
              <div className="k-meta__body k-stack k-stack--tight">
                <div className="k-note">
                  джерело: <span data-info="san">тижневик САН</span>, {shortWeek(weekId)}
                </div>
                <div className="k-row" data-breakdown={JSON.stringify(verificationBreakdown(topic))}>
                  <StatusTag status="assessment" />
                  {vtag && (
                    <SourceTag kind={vtag.kind} count={vtag.count} label={verif?.label} />
                  )}
                </div>
                {topic.sources?.length > 0 && (
                  <div className="k-note">джерела: {topic.sources.join(', ')}</div>
                )}
                {/* Сам текст твердження лишається нагорі, тут тільки службовий
                    підпис зі статусом: те саме речення двічі на екрані
                    читається як помилка верстки. */}
                {topic.note && !topic.exited && (
                  <div className="k-row">
                    <span className="k-label">Твердження</span>
                    <StatusTag status="assessment" />
                  </div>
                )}
              </div>
            )}

            {/* ---- ЯКІР ---- */}
            {anchors.length > 0 && (
              <div className="k-divider k-stack k-stack--tight">
                <div className="k-row k-row--split">
                  <span className="k-label">Якір</span>
                  <span className="k-note">соціологія, окремий вимір</span>
                </div>
                {anchors.map((a) => (
                  <AnchorBlock key={a.id} anchor={a} />
                ))}
              </div>
            )}

            {topic.exited && (
              <div className="k-stack k-stack--tight">
                <div className="k-row">
                  <span className="k-label">Чому вийшла з поля</span>
                  <StatusTag status="fact" />
                </div>
                <p className="k-sub">{topic.reason || topic.note || 'причина не вказана'}</p>
              </div>
            )}

            {/* ---- 2. ЯК ЗМІНИЛАСЬ ---- */}
            {!topic.exited && (
              <div className="k-divider k-stack k-stack--tight">
                <span className="k-label">Як змінилась</span>
                {/* G7: якщо серія зшита з кількох id, читач має про це знати:
                    інакше довший трек виглядає як помилка, а не як склеєна історія. */}
                {mergeNote && <div className="k-note">{mergeNote}</div>}

                {deltas?.isNew ? (
                  <div className="k-sub">зʼявилась цього тижня</div>
                ) : (
                  <>
                    <ToneTrack track={track} />
                    <Rows>
                      <Row label="тон">{deltas.tone}</Row>
                      <Row label="вага">{deltas.salience}</Row>
                      <Row label="звірка">{deltas.verification}</Row>
                    </Rows>
                  </>
                )}
              </div>
            )}

            {/* ---- 3. ЗВʼЯЗКИ ---- */}
            {!topic.exited && (
              <div className="k-divider k-stack k-stack--tight">
                <span className="k-label">Звʼязки</span>
                {links.length === 0 && (
                  <div className="k-note">названих звʼязків у звіті немає</div>
                )}
                {links.length > 0 && (
                  <Rows>
                    {/* Напрямок названий словами: «живить» це не те саме, що «живиться». */}
                    {links.map((l) => (
                      <Row key={`${l.dir}:${l.to}`} label={l.dir === 'in' ? 'живиться від' : 'живить'}>
                        <b>{l.name}</b>
                        {l.reason ? <div className="k-note">{l.reason}</div> : null}
                      </Row>
                    ))}
                  </Rows>
                )}
              </div>
            )}

            {bridge && (
              <div className="k-divider k-stack k-stack--tight">
                <span className="k-label">кейс на контролі</span>
                <p className="k-sub">{bridge.title}</p>
                <HudButton variant="ghost" onClick={() => onOpenCases && onOpenCases(bridge.id)}>
                  ВІДКРИТИ КЕЙСИ
                </HudButton>

                {/* F3: сигнал-рядок, ПО ОДНОМУ НА КЕЙС. Тема цілком може тримати
                    два кейси, і в кожного свої аналоги; один рядок на тему видавав
                    би прецеденти першого кейса за прецеденти теми. Без цифри
                    схожості: скільки аналогів, якого класу, в якому статусі. Якщо
                    карток немає, рядків теж немає: «прецеденти: 0» на кожній темі
                    було б шумом. */}
                {precSignals.map((sig) => (
                  <div key={sig.caseId} className="k-note k-prec-signal">
                    історичні прецеденти: {sig.n} · клас: {sig.className} ·{' '}
                    статус: {sig.pending ? 'підпис очікує' : sig.status}
                    {' '}
                    <button
                      type="button"
                      className="k-prec-signal__go"
                      title={sig.caseTitle}
                      onClick={() => onPrecedents && onPrecedents(sig.caseId)}
                    >
                      ПОРІВНЯТИ
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* ---- 3.5 ГЛИБИННИЙ ШАР ----
                Блок за розділом 8 спеки deep_layer: до 8 рядків, до 120 знаків.
                Рядки прийшли готовими з того самого рендера, який міряє валідатор,
                тому екран не може розійтися з перевіркою.

                Блок стоїть ПІСЛЯ кейса і ПЕРЕД важелями свідомо: спершу що
                відбувається, потім яку історію в цьому проживають, і лише тоді
                що з цим робити. Теми без розмітки нічого не показують: рядок
                «розмітки немає» на кожній темі був би тією самою мертвою
                плашкою, яку прибирав A6. */}
            {depthSwap.shown.length > 0 && (
              <div
                key={depthSwap.shown.map((b) => b.id).join('|')}
                className={`k-divider k-stack k-stack--tight k-depth-section${depthSwap.leaving ? ' is-leaving' : ''}`}
              >
                <span className="k-row k-row--split">
                  <span className="k-label k-depth__head">Глибинний шар</span>
                  {/* Розмітка W32 стоїть на неузгодженому довіднику. Показ такої
                      розмітки це свідомий виняток з правила «в UI тільки
                      validated», і бейдж це його ціна: він видимий на КОЖНОМУ
                      екрані з розміткою і зникає сам, коли статус зміниться. */}
                  {depthSwap.shown.some((x) => x.draft) && (
                    <span className="k-depth__draft">чернетка до узгодження</span>
                  )}
                </span>

                {depthSwap.shown.map((b) => (
                  <div key={b.id} className="k-depth">
                    {/* Тема тримає кілька кейсів, і в кожного свій сюжет.
                        Без підпису другий блок читався б як продовження першого. */}
                    {b.subject === 'case' && (
                      <span className="k-depth__subject">по кейсу · {b.title}</span>
                    )}

                    {/* Розділ 16: три зрізані лінзи це ОДИН рядок, а не три
                        порожні. Зафіксоване спостереження, не порожнеча. */}
                    {b.allCut ? (
                      /* Порожнеча тут це контент, а не збій завантаження: рядок
                         по центру, розріджений трекінг, повітря навколо. */
                      <p className="k-depth__silent">поле промовчало</p>
                    ) : (
                      <>
                        {/* Сюжет це головний елемент секції, тому він не рядок
                            таблиці, а міні-заголовок: решта лінз службова. */}
                        <div className="k-depth__plot k-depth__reveal" style={{ '--step': 0 }}>
                          {b.plot.cut ? (
                            <p className="k-depth__plot-cut">сюжет зрізано · {b.plot.reason}</p>
                          ) : (
                            <>
                              <p className="k-depth__plot-primary">{b.plot.primary}</p>
                              {b.plot.secondary && (
                                <p className="k-depth__plot-second">
                                  {/* Дві точки в протифазі: два сюжети перетягують
                                      кейс. Єдина анімація секції, і вона означає
                                      «тут ще можна вплинути», а не декор. */}
                                  <span className="k-depth__pulse" aria-hidden="true">
                                    <i /><i />
                                  </span>
                                  ризик-сценарій: {b.plot.secondary}
                                  <span className="k-depth__mark">наратив не закристалізувався</span>
                                </p>
                              )}
                            </>
                          )}
                        </div>

                        <DepthLine label="ролі" lens={b.roles} step={1}>
                          {b.roles.items?.map((r, i) => (
                            <span key={r.role + r.who}>
                              {i > 0 && '; '}
                              {r.role} → {r.who}
                            </span>
                          ))}
                        </DepthLine>

                        <DepthLine label="психотипи" lens={b.psychotypes} step={2}>
                          {b.psychotypes.items?.map((p, i) => (
                            <span key={p.cluster}>
                              {i > 0 && ', '}
                              {p.cluster}
                              {/* Частка без методу не показується ніколи:
                                  експертна оцінка і семпл це різна вага числа. */}
                              {p.share !== null && p.method && (
                                <span className="k-depth__share">
                                  {' '}{Math.round(p.share * 100)}% ({p.method === 'expert' ? 'оцінка' : 'семпл'})
                                </span>
                              )}
                            </span>
                          ))}
                        </DepthLine>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ---- 4. ВАЖЕЛІ ---- */}
            {!topic.exited && (
              <div className={`k-divider k-stack k-stack--tight${depthList.length ? ' k-divider--linked' : ''}`}>
                <span className="k-label">Що з цим можна зробити · мова наслідків</span>

                {/* Розділ 16: рекомендації Глибинного шару рендеряться САМЕ тут,
                    а не другою секцією поруч. Глибинний шар пояснює «чому»,
                    мова наслідків каже «що робити»: це дві частини одного
                    висновку, і рознесені по різних блоках вони читались би як
                    дві різні поради. */}
                {depthSpeech.length > 0 && (
                  <div className="k-depth__speech">
                    {depthSpeech.map((h, i) => (
                      <p className="k-depth__line" key={`say-${i}`}>
                        <span className="k-depth__key">як говорити</span>
                        <span className="k-depth__val">
                          {h.cluster && <span className="k-depth__cluster">{h.cluster}: </span>}
                          {h.text}
                        </span>
                      </p>
                    ))}
                    {depthAvoid.map((a, i) => (
                      <p className="k-depth__line" key={`avoid-${i}`}>
                        <span className="k-depth__key k-depth__key--warn">чого уникати</span>
                        <span className="k-depth__val">{a}</span>
                      </p>
                    ))}
                  </div>
                )}

                {levers.length === 0 && (
                  <div className="k-note">важелі для цієї теми у звіті не сформульовані</div>
                )}

                {levers.map((l) => (
                  <LeverButton
                    key={l.id}
                    keyLabel={l.key || '·'}
                    title={l.text}
                    expected={l.expected}
                    confidence={l.confidence}
                    selected={activeLever === l.id}
                    onSelect={() => onPickLever && onPickLever(l.id)}
                  />
                ))}

                {model && (
                  <div className="k-stack k-stack--tight">
                    <div className="k-row">
                      <span className="a-tag a-tag--hypothesis">ГІПОТЕЗА</span>
                      <span className="k-note">модельний зсув, у дані не потрапляє</span>
                    </div>
                    {model.spread.length > 0 ? (
                      <div className="k-note">
                        вплив на повʼязані теми:{' '}
                        {model.spread
                          .map((s) => `${shortName(s.topic, weekId)} ${fmt(s.value)}`)
                          .join(', ')}
                      </div>
                    ) : (
                      <div className="k-note">
                        вплив на інші теми не змодельовано: звʼязків у даних немає
                      </div>
                    )}
                    {/* D4: підсумок каскаду. Хвиля показує ЯК воно пішло по
                        звʼязках, а цей блок показує, ДО ЧОГО прийшло. Без нього
                        читач бачить рух і не бачить результату. */}
                    {model.waves?.length > 0 && (
                      <div className="k-cascade">
                        <div className="k-label">До і після</div>
                        <div className="k-cascade__row">
                          <span className="k-note">індекс</span>
                          <b>{model.before.value}</b>
                          <span className="k-note">хвиль у каскаді</span>
                          <b>{model.waves.length}</b>
                        </div>
                        <ol className="k-cascade__steps">
                          {model.waves.map((w) => (
                            <li key={w.step}>
                              <span className="k-note">
                                {w.kind === 'actors' ? 'актори' : 'теми'}
                              </span>{' '}
                              {w.items.map((i) => (
                                w.kind === 'actors' ? actorName(i.id) : shortName(i.id, weekId)
                              )).join(', ')}
                            </li>
                          ))}
                        </ol>
                        {model.topShifts.length > 0 && (
                          <div className="k-note">
                            найбільші зміщення:{' '}
                            {model.topShifts
                              .map((s) => `${shortName(s.topic, weekId)} ${fmt(s.value)}`)
                              .join(' · ')}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="k-note">
                      сила впливів: оцінка моделі, калібрується реєстром прогнозів
                    </div>
                    <HudButton variant="ghost" onClick={onResetModel}>
                      СКИНУТИ МОДЕЛЮВАННЯ
                    </HudButton>
                  </div>
                )}
              </div>
            )}

            {!topic.exited && (
              <div className="k-divider">
                <HudButton variant="primary" onClick={() => onPulse && onPulse(topic.id)}>
                  ПОКАЗАТИ НА КАРТІ
                </HudButton>
              </div>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}

const fmt = (v) => (v > 0 ? `+${v}` : String(v));

/**
 * Назва теми для переліку впливів, скорочена до першої змістовної частини.
 * Ріжемо по межі слова: обрубок посеред слова читається як зіпсовані дані.
 * Якщо перше слово саме довше за ліміт, лишається жорсткий зріз.
 */
function shortName(topicId, weekId) {
  const full = topicName(topicId, weekId);
  if (full.length <= 34) return full;
  const head = full.slice(0, 32);
  const cut = head.lastIndexOf(' ');
  const kept = cut > 0 ? head.slice(0, cut) : head;
  return `${kept.replace(/[\s,;:]+$/, '')}…`;
}

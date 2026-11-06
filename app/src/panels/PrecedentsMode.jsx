import React, { useEffect, useMemo, useState } from 'react';
import { HudButton } from 'astrolabe-ds';
import { PRECEDENTS, prefersReducedMotion } from '../data/thresholds.js';
import { plural } from '../util/plural.js';

/**
 * F3 · режим ІСТОРИЧНІ ПРЕЦЕДЕНТИ.
 *
 * Порядок екрана переставлений після приймання, і це головне рішення цієї
 * панелі. Було: фази, треки, матриці, розподіли. Читач бачив осі і стадії, але
 * не бачив САМОЇ ПОДІЇ і не розумів, з чим порівнюють. Абстрактний підпис на
 * кшталт «комісія визнає провину військового рівня» без року, країни і назви це
 * не кейс, а етикетка.
 *
 * Стало: спочатку історія людською мовою, потім аналітика. Кожен прецедент
 * подається трьома реченнями: що це за подія, що сталося, чим закінчилось і
 * через скільки часу. Уся попередня механіка збережена повністю, але лежить
 * нижче і згорнута: хто прийшов по стадії, той їх розгорне.
 *
 * ДРУГЕ ПРИЙМАННЯ. Історія першою це виявилось правильно, але недостатньо:
 * розкритими були ОБИДВА аналоги одразу, тобто клік по кейсу відкривав дві
 * повні статті, по двісті слів кожна, а те, за чим читач прийшов — чим це
 * закінчувалось і за чим тепер слідкувати — лежало нижче і ще й згорнуте.
 * Найкоротша й найцінніша частина була схована, найдовша показана першою.
 *
 * Тому порядок тепер такий:
 *   1. ВІДПОВІДЬ одним рядком: скільки аналогів, чим вони закінчились, на якій
 *      стадії ми зараз. Плюс маркери спостереження. Нуль кліків.
 *   2. ЗАСТЕРЕЖЕННЯ: де аналогія ламається. Винесене з-під тумблера навмисно —
 *      це не деталь розбору, це умова, за якої все вище не діє.
 *   3. ІСТОРІЇ акордеоном: згорнуті до заголовка й результату, повний текст
 *      лише у того, кого розгорнули.
 *   4. РОЗБІР під тумблером: стадії, збіги, порівняння факторів.
 *
 * Вирівнювання за ФАЗАМИ, а не за календарем, лишається: кризи біжать з різною
 * швидкістю, тому порівнюється місце в механізмі, а не кількість тижнів.
 * Одночасно яскравих треків рівно два: поточний і один вибраний.
 */

const PHASES = [
  { id: 'trigger', label: 'ТРИГЕР' },
  { id: 'response', label: 'РЕАКЦІЯ' },
  { id: 'turn', label: 'ПЕРЕЛОМ' },
  { id: 'outcome', label: 'РЕЗУЛЬТАТ' },
];

// Рівні в даних кодами, на екрані словами. Інтерфейс українською (правило 9),
// а «high» у рядку поруч з українським текстом читається як недороблений екран.
const LEVEL = { high: 'висока', med: 'середня', low: 'низька' };
const levelWord = (v) => LEVEL[v] || v || 'не названо';

const OUTCOME_LABEL = {
  faded: 'згасла',
  systemic_distrust: 'недовіра стала системною',
  cadre_conflict: 'кадровий конфлікт',
  escalated: 'ескалація',
  other: 'інше',
};

export default function PrecedentsMode({ card, corpus, caseTitle, onClose }) {
  const analogs = (card?.analogs || []).slice(0, PRECEDENTS.max_analogs);
  // Два стани, а не один, і це навмисно. `selected` живить матрицю стадій і
  // ніколи не буває порожнім: трек без вибраного аналога втратив би сенс.
  // `expanded` живить акордеон і порожнім бути МОЖЕ — згорнути все й лишитись
  // з самою відповіддю це нормальний стан екрана.
  const [selected, setSelected] = useState(analogs[0]?.historical_case_id || null);
  // Стартуємо ЗГОРНУТИМИ всі. Один розкритий за замовчуванням це знову перше
  // враження «стіна тексту» — рівно та скарга, через яку панель і перебирали:
  // 1465px прокрутки замість 686 видимих на тому ж кейсі.
  const [expanded, setExpanded] = useState(null);
  const [openBreak, setOpenBreak] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  // Аналітика згорнута за замовчуванням: наказ власника після приймання.
  // Спочатку історія, потім стадії.
  const [openAnalysis, setOpenAnalysis] = useState(false);
  const [entered, setEntered] = useState(prefersReducedMotion());

  // Вхідна анімація одна і коротка, далі повний спокій: правило 6 режиму.
  useEffect(() => {
    if (prefersReducedMotion()) { setEntered(true); return undefined; }
    const t = setTimeout(() => setEntered(true), PRECEDENTS.enter_ms);
    return () => clearTimeout(t);
  }, []);

  // Escape тут НЕ слухається навмисно: пріоритетний ланцюжок Esc живе в App
  // (E3), і другий слухач закривав би заразом і режим, і вікно під ним.

  const byId = useMemo(() => new Map((corpus || []).map((c) => [c.id, c])), [corpus]);
  const sel = analogs.find((a) => a.historical_case_id === selected) || analogs[0] || null;
  const selCase = sel ? byId.get(sel.historical_case_id) : null;

  const dist = card?.outcome_distribution || { n: 0, buckets: [] };
  const smallN = dist.n < PRECEDENTS.min_class_size_for_fan;

  /* Відповідь одним реченням. Складається з трьох чисел, які й так є в картці:
     скільки аналогів, як розподілились їхні наслідки, де ми в механізмі.
     Раніше всі три лежали в різних місцях і два з них під тумблером. */
  const phaseIdx = Math.max(0, Math.min(PHASES.length - 1, card?.current_phase_index ?? 1));
  const outcomePhrase = (() => {
    if (smallN || !dist.buckets?.length) return 'база поки замала, щоб рахувати розподіл наслідків';
    const top = [...dist.buckets].sort((a, b) => b.k - a.k)[0];
    const label = OUTCOME_LABEL[top.outcome_code] || top.outcome_code;
    return top.k === dist.n
      ? `і всі закінчились однаково: ${label}`
      : `найчастіший результат: ${label} (${top.k} з ${dist.n})`;
  })();

  const shell = (children) => (
    <div className={`k-prec${entered ? ' is-settled' : ''}`} role="dialog" aria-label="історичні прецеденти">
      <div className="k-prec__veil" onClick={onClose} />
      <div className="k-prec__panel">
        <header className="k-prec__head">
          <span className="a-tab">ІСТОРИЧНІ ПРЕЦЕДЕНТИ</span>
          <span className="k-prec__case">{caseTitle}</span>
        </header>
        <button type="button" className="k-prec__close" aria-label="вийти з режиму" onClick={onClose}>
          ✕
        </button>
        {children}
      </div>
    </div>
  );

  // Кейс без картки. Це чесна відповідь, а не порожній екран і не чужий список:
  // раніше клік по будь-якому супутнику вів в один і той самий перелік кейсів,
  // і читач не міг зрозуміти, чиї це прецеденти.
  if (!card) {
    return shell(
      <div className="k-prec__empty">
        <p className="k-lead">Прецеденти не знайдені.</p>
        <p className="k-sub">
          Для цього кейса історичних аналогів у корпусі поки немає. Натягнути
          сюди чужий кейс було б гірше, ніж не показати жодного: порівняння з
          неспорідненим механізмом дає впевненість, якої немає підстав мати.
        </p>
        <p className="k-note">
          Кейс шукається за структурою механізму, а не за схожістю сюжету, і
          кожен потребує щонайменше двох незалежних джерел.
        </p>
      </div>
    );
  }

  return shell(
    <>
      {/* Статус картки не ховається ніколи: правило 11 Спеки F. */}
      {card.signature === 'pending' && (
        <div className="k-prec__banner">
          АДАПТАЦІЯ ІСТОРИЧНИХ КЕЙСІВ · джерела додано · підпис: очікує
        </div>
      )}

      {/* ---- 1. ВІДПОВІДЬ. Нуль кліків: те, за чим сюди прийшли. ---- */}
      <div className="k-prec__verdict">
        <p className="k-prec__lede">
          <b>{analogs.length}</b>{' '}
          {plural(analogs.length, ['схожий випадок', 'схожі випадки', 'схожих випадків'])} в історії,{' '}
          {outcomePhrase}. Зараз ми на стадії <b>{PHASES[phaseIdx].label}</b>
          {' '}— {phaseIdx + 1} з {PHASES.length}.
        </p>

        {(card.watch_signals || []).length > 0 && (
          <>
            <div className="k-label">ЗА ЧИМ СЛІДКУВАТИ</div>
            <ul className="k-prec__list">
              {card.watch_signals.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </>
        )}
      </div>

      {/* ---- 2. ЗАСТЕРЕЖЕННЯ. Умова, за якої все вище не діє, тому стоїть
              одразу під відповіддю і НЕ під тумблером розбору.
              Але й не розгорнуте: чотири довгі пункти тут це знову стіна тексту,
              з якої починається екран. Компроміс — власний розкривач із числом:
              читач бачить, що застереження існують і скільки їх, і читає їх
              тоді, коли відповідь уже в голові. ---- */}
      {(card.break_conditions || []).length > 0 && (
        <div className={`k-prec__break${openBreak ? ' is-open' : ''}`}>
          <button
            type="button"
            className="k-prec__breakhead"
            aria-expanded={openBreak}
            onClick={() => setOpenBreak((v) => !v)}
          >
            <span className="k-prec__caret" aria-hidden="true">{openBreak ? '▾' : '▸'}</span>
            <span className="k-label">ДЕ АНАЛОГІЯ ЛАМАЄТЬСЯ</span>
            <span className="k-prec__gist">
              {card.break_conditions.length}{' '}
              {plural(card.break_conditions.length, ['умова', 'умови', 'умов'])}
            </span>
          </button>
          {openBreak && (
            <ul className="k-prec__list">
              {card.break_conditions.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* ---- 3. ІСТОРІЇ. Згорнуті до заголовка й результату. ---- */}
      <div className="k-label k-prec__storieshead">САМІ ВИПАДКИ</div>
      <div className="k-prec__stories">
        {analogs.map((a) => {
          const c = byId.get(a.historical_case_id);
          if (!c) return null;
          const id = a.historical_case_id;
          const isSel = id === (sel?.historical_case_id || null);
          const isOpen = id === expanded;
          const out = (c.timeline || []).find((t) => t.phase === 'outcome');
          const outWord = OUTCOME_LABEL[c.outcome?.code] || c.outcome?.code || 'результат не названий';
          const pick = () => {
            setSelected(id);                       // матриця завжди має вибраний трек
            setExpanded((v) => (v === id ? null : id));
          };
          return (
            <article key={id} className={`k-prec__story${isSel ? ' is-sel' : ''}${isOpen ? ' is-open' : ''}`}>
              {/* Заголовок це кнопка, а не картка з role=button: клавіатура і
                  скрінрідер отримують справжній розкривач зі станом. */}
              <button type="button" className="k-prec__storyhead" aria-expanded={isOpen} onClick={pick}>
                <span className="k-prec__caret" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                {/* Схема вимагає подачі, тому порожніх полів тут бути не має. Але
                    екран не місце для наслідків недовалідованих даних: якщо подача
                    все ж відсутня, показуємо опис механізму і кажемо про це прямо. */}
                <span className="k-prec__headline">{c.headline || c.title}</span>
                <span className="k-prec__gist">
                  {outWord}{out ? ` · через ${out.offset_weeks} тиж` : ''}
                </span>
              </button>

              {isOpen && (
                <div className="k-prec__storybody">
                  <p className="k-prec__what">
                    <span className="k-label">Сталося ось що</span>
                    {c.what_happened || 'опис події не заповнений'}
                  </p>

                  <p className="k-prec__led">
                    <span className="k-label">Призвело до</span>
                    {c.led_to || 'результат не заповнений'}
                  </p>

                  <div className="k-note k-prec__origin" title={(c.sources || []).map((s) => s.ref).join('\n')}>
                    {c.geo ? `${c.geo} · ` : ''}{c.period} · джерел: {(c.sources || []).length}
                    {c.adaptation ? ' · адаптація' : ''}
                    {' · переносимість '}{levelWord(a.transferability)}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* ---- 4. РОЗБІР. Стадії і збіги, згорнуті. ---- */}
      <button
        type="button"
        className="k-prec__toggle"
        aria-expanded={openAnalysis}
        onClick={() => setOpenAnalysis((v) => !v)}
      >
        {openAnalysis ? '▾' : '▸'} РОЗБІР: СТАДІЇ І ЗБІГИ
      </button>

      {openAnalysis && (
        <div className="k-prec__analysis">
          <div className="k-note k-prec__scores">
            подібність {levelWord(card.scores?.structural_similarity)} ·
            {' '}переносимість {levelWord(card.scores?.transferability)} ·
            {' '}база {dist.n} {plural(dist.n, ['кейс', 'кейси', 'кейсів'])}
          </div>

          {/* Ланцюжок механізму: відповідь на «що саме порівнюємо». */}
          <div className="k-prec__chain">
            {(card.class_summary || '').split(' -> ').map((cap, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="k-prec__arrow">→</span>}
                <span className="k-prec__cap">{cap}</span>
              </React.Fragment>
            ))}
          </div>

          <div className="k-prec__body">
            <div className="k-prec__field">
              {/* ЛЕГЕНДА. Без неї це була сира структура даних на екрані: чотири
                  колонки, крапки залиті й порожні, підписи «+23 тиж» — і ніде не
                  сказано, що вони означають. Читач мусив здогадатись сам, і на
                  плейтесті не здогадався. */}
              <p className="k-note k-prec__legend">
                Рядок <b>ЗАРАЗ</b> це наш випадок, нижче історичні. Залита крапка
                означає, що стадія вже настала, порожня — що ще ні.
                «+N тиж» це скільки тижнів від тригера пройшло до цієї стадії в
                тому випадку: кризи біжать з різною швидкістю, тому порівнюємо
                місце в механізмі, а не дати.
              </p>

              <div className="k-prec__cols">
                <span className="k-prec__track-label" />
                {PHASES.map((p) => <span key={p.id} className="k-prec__col">{p.label}</span>)}
              </div>

              {/* Трек ЗАРАЗ: суцільний до лінії NOW, далі пунктир. Майбутнє
                  малюється тільки пунктиром, правило 7. */}
              <Track
                label="ЗАРАЗ"
                kind="now"
                hereIndex={phaseIdx}
                events={PHASES.map((p, i) => ({ phase: p.id, filled: i <= phaseIdx }))}
              />

              {analogs.map((a) => {
                const c = byId.get(a.historical_case_id);
                if (!c) return null;
                return (
                  <Track
                    key={a.historical_case_id}
                    label={c.headline}
                    kind={a.historical_case_id === selected ? 'selected' : 'dim'}
                    events={PHASES.map((p) => {
                      const ev = (c.timeline || []).find((t) => t.phase === p.id);
                      return {
                        phase: p.id,
                        filled: Boolean(ev),
                        title: ev ? `${ev.event} · +${ev.offset_weeks} тиж` : '',
                        offset: ev ? `+${ev.offset_weeks} тиж` : '',
                      };
                    })}
                    onPick={() => setSelected(a.historical_case_id)}
                  />
                );
              })}

              {/* Віяло наслідків: продовження осі часу вправо з РЕЗУЛЬТАТУ. */}
              <div className="k-prec__fan">
                {smallN ? (
                  <div className="k-note">клас поки з одного кейса: розподіл недоступний</div>
                ) : (
                  <>
                    {dist.buckets.map((b) => (
                      <div key={b.outcome_code} className="k-prec__branch">
                        <i style={{ height: `${Math.max(2, (b.k / Math.max(1, dist.n)) * 10)}px` }} />
                        <span>{OUTCOME_LABEL[b.outcome_code] || b.outcome_code} · {b.k}</span>
                      </div>
                    ))}
                    <div className="k-note">
                      Вибірка: {dist.n} {plural(dist.n, ['кейс', 'кейси', 'кейсів'])}.
                      {' '}Це історичний prior, не прогноз поточної ситуації.
                    </div>
                  </>
                )}
              </div>

              {/* Маркери спостереження переїхали ВГОРУ, у відповідь: це не
                  деталь розбору, а те, що читач забирає з екрана. Тут лишилось
                  порівняння факторів — воно справді про розбір. */}
              <div className="k-prec__watch">
                <HudButton variant="ghost" onClick={() => setShowDiff((v) => !v)}>
                  ПОРІВНЯТИ ФАКТОРИ
                </HudButton>

                {showDiff && <Diff rows={card.comparison_matrix || []} />}
              </div>
            </div>

            <aside className="k-prec__side">
              <div className="k-label">ЧОМУ РЕЛЕВАНТНИЙ</div>
              <ul className="k-prec__list">
                {(sel?.likenesses || []).map((x, i) => <li key={i}>{x}</li>)}
                {!sel?.likenesses?.length && <li className="k-note">не названо</li>}
              </ul>

              {selCase && (
                <div className="k-note">
                  за кейсом: {selCase.headline}
                </div>
              )}
            </aside>
          </div>
        </div>
      )}
    </>
  );
}

function Track({ label, kind, events, onPick, hereIndex }) {
  return (
    <div
      className={`k-prec__track k-prec__track--${kind}`}
      onClick={onPick}
      role={onPick ? 'button' : undefined}
      tabIndex={onPick ? 0 : undefined}
    >
      <span className="k-prec__track-label">{label}</span>
      {events.map((e, i) => (
        <span
          key={i}
          className={`k-prec__cell${i === hereIndex ? ' is-here' : ''}`}
          title={e.title || ''}
        >
          <i className={e.filled ? 'is-on' : undefined} />
          {/* «ми тут» стоїть у тій самій позиції, що й «+N тиж» в історичних
              треках: колонка читається як одна шкала, а не як два різні рядки. */}
          {i === hereIndex ? <em className="k-prec__here">ми тут</em> : e.offset ? <em>{e.offset}</em> : null}
        </span>
      ))}
    </div>
  );
}

/** Однакові рядки згортаються: виділяються лише відмінності. */
function Diff({ rows }) {
  const same = rows.filter((r) => r.today === r.analog);
  const diff = rows.filter((r) => r.today !== r.analog);
  const [openSame, setOpenSame] = useState(false);
  return (
    <div className="k-prec__diff">
      {diff.map((r, i) => (
        <div key={i} className="k-prec__diffrow">
          <span className="k-label">{r.factor}</span>
          <span className="k-sub">{r.today}</span>
          <span className="k-note">проти</span>
          <span className="k-sub">{r.analog}</span>
        </div>
      ))}
      {same.length > 0 && (
        <button type="button" className="k-prec__same" onClick={() => setOpenSame((v) => !v)}>
          збігається: {same.length} {plural(same.length, ['фактор', 'фактори', 'факторів'])}
        </button>
      )}
      {openSame && same.map((r, i) => (
        <div key={i} className="k-note">{r.factor}: {r.today}</div>
      ))}
    </div>
  );
}

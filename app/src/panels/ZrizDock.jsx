import React from 'react';
import {
  SectionHeader,
  DoctrineFooter,
  StatusTag,
  DeltaBadge,
  StatCard,
  Sparkline,
} from 'astrolabe-ds';
import {
  getActiveWeek,
  getStat,
  getBalance,
  getDominantState,
  getWatchStates,
  formatPeriod,
  getAnchors,
  anchorHistory,
  upcomingForecasts,
  formatDate,
} from '../data/selectors.js';
import TopicsList from './TopicsList.jsx';
import { FIELD } from '../data/thresholds.js';
import Reveal from './Reveal.jsx';
import { Timeline } from './RegistryWindow.jsx';

const AUD = { mil: 'ВІЙСЬКОВІ', civ: 'ЦИВІЛЬНІ' };

/** Число під показ: індекси з двома знаками, ваги цілими. */
function show(value, digits) {
  if (value === null || value === undefined) return null;
  return digits ? value.toFixed(digits) : String(value);
}

/**
 * Метрика картки. Службовий підпис чесно каже, звідки дельта і скільки тижнів
 * лишились без виміру, щоб порожнє місце не читалось як нуль.
 */
/** Обгортка, що робить будь-який блок клікабельним обʼєктом із поясненням. */
function Openable({ object, onOpenObject, children }) {
  if (!onOpenObject) return children;
  return (
    <div
      className="k-pick"
      role="button"
      tabIndex={0}
      onClick={() => onOpenObject(object)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenObject(object);
        }
      }}
    >
      {children}
    </div>
  );
}

function Metric({ metric, weekId, digits, suffix, unitNote, onOpenObject }) {
  const s = getStat(metric, weekId);
  if (!s) return null;

  const marks = [];
  if (unitNote && s.delta !== null) marks.push(unitNote);
  if (s.deltaSource === 'contract') marks.push('дельта з контракту');
  if (s.gaps > 0) marks.push(`без виміру тижнів: ${s.gaps}`);
  const note = [s.note, marks.join(', ')].filter(Boolean).join(' · ');

  return (
    <Openable object={{ kind: 'metric', key: metric }} onOpenObject={onOpenObject}>
      <StatCard
        label={s.label}
        value={show(s.value, digits)}
        suffix={suffix}
        delta={s.delta}
        polarity={s.polarity}
        series={s.series}
        threshold={s.threshold}
        note={note || undefined}
      />
    </Openable>
  );
}

/** Пара аудиторій одним рядком: спільна метрика, дві цифри, дві дельти. */
function PairRow({ label, milKey, civKey, weekId, digits, suffix, note, unit, onOpenObject }) {
  const mil = getStat(milKey, weekId);
  const civ = getStat(civKey, weekId);
  if (!mil || !civ) return null;

  const one = (s) => (
    <Openable object={{ kind: 'metric', key: s.key }} onOpenObject={onOpenObject}>
      <div className="k-pair__cell">
        <span className="k-note">{s.key.endsWith('.mil') ? 'військові' : 'цивільні'}</span>
        <span className="k-pair__num">
          {s.value === null ? <span className="a-partial">н/д</span> : show(s.value, digits)}
          {suffix && <small className="k-note"> {suffix}</small>}
        </span>
        <DeltaBadge value={s.delta} polarity={s.polarity} unit={unit || ''} hasValue={s.value !== null} />
        {s.series.length > 1 && <Sparkline series={s.series} />}
      </div>
    </Openable>
  );

  return (
    <div className="k-stack k-stack--tight">
      <div className="k-label">{label}</div>
      <div className="k-pair">
        {one(mil)}
        {one(civ)}
      </div>
      {note && <div className="k-note">{note}</div>}
    </div>
  );
}

/** Полюси однієї аудиторії: кожна цифра зі своєю дельтою і своєю полярністю. */
/**
 * G5 · дельта з розведеними напрямком і валентністю.
 *
 * Було: чотири однакові червоні стрілки поспіль. Усі рухи тижня погані, тому
 * блок читався як суцільна стіна тривоги без жодної ієрархії, і найгірше
 * погіршення не відрізнялось від найдрібнішого.
 *
 * Стало: напрямок числа це нейтральний dim-символ, колір лишається тільки на
 * значенні і тільки коли зміна перевищила поріг. Яскравим має право бути рівно
 * один рядок на блок, і це вирішує викликач через prop `loud`.
 */
function BalanceDelta({ value, badIsUp, hasValue, loud }) {
  if (!hasValue || value === null || value === undefined) {
    return <span className="k-note">н/д</span>;
  }
  // Нуль це «·», а не тире: довгих тире в інтерфейсі немає за правилом 8.
  const dir = value > 0 ? '▲' : value < 0 ? '▼' : '·';
  const worse = badIsUp ? value > 0 : value < 0;
  const better = badIsUp ? value < 0 : value > 0;
  const notable = Math.abs(value) >= FIELD.balance_notable_pp;
  const tone = !notable ? '' : worse ? ' is-worse' : better ? ' is-better' : '';
  return (
    <span className="k-bal__delta">
      <span className="k-bal__dir">{dir}</span>
      <span className={`k-bal__num${tone}${loud && worse && notable ? ' is-loud' : ''}`}>
        {Math.abs(value)} п.п.
      </span>
    </span>
  );
}

/** Біполярний мінібар: конструктив ліворуч, деструктив праворуч, ghost минулого тижня. */
function BalanceBar({ constructive, destructive, prevConstructive }) {
  if (constructive === null || destructive === null) return null;
  const total = Math.max(1, constructive + destructive);
  const cPct = (constructive / total) * 100;
  const ghost = prevConstructive === null || prevConstructive === undefined
    ? null
    : (prevConstructive / Math.max(1, prevConstructive + (100 - prevConstructive))) * 100;
  return (
    <div className="k-bal__bar" aria-hidden="true">
      <span className="k-bal__pos" style={{ width: `${cPct}%` }} />
      <span className="k-bal__neg" style={{ width: `${100 - cPct}%` }} />
      {ghost !== null && <span className="k-bal__ghost" style={{ left: `${ghost}%` }} />}
    </div>
  );
}

function BalanceRow({ aud, weekId, loudKey }) {
  const b = getBalance(aud, weekId);
  if (!b) return <div className="a-empty">баланс {AUD[aud]}: даних за період немає</div>;

  const prevC = b.constructive === null || b.deltaConstructive.value === null
    ? null
    : b.constructive - b.deltaConstructive.value;

  return (
    <div className="k-stack k-stack--tight">
      <div className="k-label">{AUD[aud]}</div>
      <BalanceBar
        constructive={b.constructive}
        destructive={b.destructive}
        prevConstructive={prevC}
      />
      <div className="k-row k-row--split">
        <span className="k-sub">
          конструктив <span className="k-bal__val">{b.constructive === null ? 'н/д' : `${b.constructive}%`}</span>
        </span>
        <BalanceDelta
          value={b.deltaConstructive.value}
          badIsUp={false}
          hasValue={b.constructive !== null}
          loud={loudKey === `${aud}:c`}
        />
      </div>
      <div className="k-row k-row--split">
        <span className="k-sub">
          деструктив <span className="k-bal__val">{b.destructive === null ? 'н/д' : `${b.destructive}%`}</span>
        </span>
        <BalanceDelta
          value={b.deltaDestructive.value}
          badIsUp
          hasValue={b.destructive !== null}
          loud={loudKey === `${aud}:d`}
        />
      </div>
    </div>
  );
}

/**
 * Яскравий акцент дістається рівно одному рядку: найбільшому погіршенню тижня.
 * Правило блоку з G5, тому воно рахується тут, над обома аудиторіями, а не
 * всередині рядка, який про сусіда нічого не знає.
 */
function loudestWorsening(weekId) {
  let best = null;
  ['mil', 'civ'].forEach((aud) => {
    const b = getBalance(aud, weekId);
    if (!b) return;
    const cand = [
      { key: `${aud}:c`, v: b.deltaConstructive.value, bad: (x) => x < 0 },
      { key: `${aud}:d`, v: b.deltaDestructive.value, bad: (x) => x > 0 },
    ];
    cand.forEach((c) => {
      if (c.v === null || c.v === undefined || !c.bad(c.v)) return;
      const mag = Math.abs(c.v);
      if (mag < FIELD.balance_notable_pp) return;
      if (!best || mag > best.mag) best = { key: c.key, mag };
    });
  });
  return best?.key || null;
}

function DominantRow({ aud, weekId, onOpenObject }) {
  const d = getDominantState(aud, weekId);
  if (!d) return null;
  return (
    <Openable object={{ kind: 'state', name: d.name }} onOpenObject={onOpenObject}>
      <div className="k-row k-row--split">
        <span className="k-sub">
          <span className="k-label">{AUD[aud]}</span> {d.name}{' '}
          {d.share === null ? 'н/д' : `${d.share}%`}
        </span>
        <DeltaBadge value={d.delta.value} polarity="up-bad" unit=" п.п." hasValue={d.share !== null} />
      </div>
    </Openable>
  );
}

/**
 * Рядок вердикту: коротке формулювання завжди, повний текст за стрілкою.
 *
 * Зверху дока має стояти висновок, а не абзац. Повний текст нікуди не дівається,
 * але за замовчуванням не з'їдає екран, який потрібен темам і цифрам.
 */
function VerdictRow({ label, short, full, status }) {
  const [open, setOpen] = React.useState(false);
  const hasFull = Boolean(full) && full !== short;

  return (
    <div className="k-stack k-stack--tight">
      <div className="k-row k-row--split">
        <span className="k-label">{label}</span>
        <StatusTag status={status} />
      </div>
      <p className="k-lead">{short || full || 'формулювання за період відсутнє'}</p>
      {hasFull && (
        <button
          type="button"
          className="k-more"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={`k-more__arrow${open ? ' k-more__arrow--up' : ''}`} aria-hidden="true">
            ▾
          </span>
          {open ? 'згорнути' : 'повний текст'}
        </button>
      )}
      {open && hasFull && <p className="k-sub">{full}</p>}
    </div>
  );
}

/** Лівий док: зріз активного тижня. Усе рахується з контракту, нічого не зашито. */
export default function ZrizDock({ weekId, onOpenObject, selectedId, onPickTopic }) {
  const week = getActiveWeek(weekId);
  const watch = getWatchStates(weekId);
  const anchors = getAnchors(weekId);
  const upcoming = upcomingForecasts(weekId);
  // Один яскравий червоний на весь блок балансу (правило G5).
  const loudKey = loudestWorsening(weekId);
  const isPartial = week.data_quality === 'partial';

  return (
    <div className="k-stack">
      <div className="k-label">
        {week.id}, {formatPeriod(week.period)}
      </div>

      {isPartial && (
        <div className="k-stack k-stack--tight">
          <span className="a-partial">дані тижня часткові</span>
          <span className="k-note">
            {week.data_quality_note || 'частина числових полів відсутня у першоджерелі'}
          </span>
        </div>
      )}

      {/* ---- 01 ВЕРДИКТ ---- */}
      <SectionHeader index="01" title="Вердикт" note="коротко, повний текст за стрілкою" />
      <div className="k-stack k-stack--tight">
        <VerdictRow
          label="Загроза"
          short={week.bluf_threat}
          full={week.verdict?.threat}
          status={week.verdict?.editor_status || 'assessment'}
        />
        <div className="k-divider">
          <VerdictRow
            label="Можливість"
            short={week.bluf_opportunity}
            full={week.verdict?.opportunity}
            status={week.verdict?.editor_status || 'assessment'}
          />
        </div>
      </div>

      {/* ---- 02 ТОП ТЕМ ТИЖНЯ ---- */}
      <SectionHeader index="02" title="Топ тем тижня" note="клік веде на зорю" />
      <TopicsList weekId={weekId} selectedId={selectedId} onPick={onPickTopic} />

      {/* ---- 03 ПАРАМЕТРИ ---- */}
      <SectionHeader index="03" title="Параметри" note="кожна цифра з дельтою" />
      <div className="k-stack">
        <Metric metric="strength.mil" weekId={weekId} digits={2} onOpenObject={onOpenObject} />
        <Metric metric="strength.civ" weekId={weekId} digits={2} onOpenObject={onOpenObject} />
        <PairRow
          label="Повʼязаність"
          milKey="connectedness.mil"
          civKey="connectedness.civ"
          weekId={weekId}
          digits={2}
          note={week.indices?.connectedness?.note}
          onOpenObject={onOpenObject}
        />
        <PairRow
          label="Обсяг дискурсу"
          milKey="volume.mil"
          civKey="volume.civ"
          weekId={weekId}
          suffix="ваги"
          unit="%"
          note="дельта у відсотках до минулого тижня, напрям зміни лишається відкритим питанням"
          onOpenObject={onOpenObject}
        />
        {week.indices?.proactivity?.civ && (
          <Metric
            metric="proactivity.civ"
            weekId={weekId}
            digits={1}
            suffix="%"
            onOpenObject={onOpenObject}
          />
        )}

        {/* баланс полюсів це теж параметр тижня, тому живе в тій самій секції */}
        <div className="k-divider k-stack k-stack--tight">
          <div className="k-label">Баланс аудиторій</div>
          <BalanceRow aud="mil" weekId={weekId} loudKey={loudKey} />
          <BalanceRow aud="civ" weekId={weekId} loudKey={loudKey} />
        </div>
      </div>

      {/* ---- 04 СТАНИ ---- */}
      <SectionHeader index="04" title="Стани на контролі" note="домінуючі і тривожні" />
      <div className="k-stack k-stack--tight">
        <DominantRow aud="mil" weekId={weekId} onOpenObject={onOpenObject} />
        <DominantRow aud="civ" weekId={weekId} onOpenObject={onOpenObject} />
      </div>

      <div className="k-divider k-stack k-stack--tight">
        <div className="k-label">Тривожні стани</div>
        {watch.length === 0 && (
          <div className="a-empty">тривожних станів за період не зафіксовано</div>
        )}
        {watch.map((s) => (
          <Openable
            key={`${s.aud}-${s.name}`}
            object={{ kind: 'state', name: s.name }}
            onOpenObject={onOpenObject}
          >
            <div className="k-stack k-stack--tight">
              {/* людською мовою зверху, клініка дрібно під нею */}
              <div className="k-row k-row--split">
                <span className="k-sub">{s.headline}</span>
                <StatusTag status="assessment" />
              </div>
              <div className="k-row k-row--split">
                <span className="k-note">
                  {AUD[s.aud]} · {s.name} · {s.share === null ? 'н/д' : `${s.share}%`}
                </span>
                <DeltaBadge value={s.delta.value} polarity="up-bad" unit=" п.п." hasValue={s.share !== null} />
              </div>
              {s.note && <div className="k-note">{s.note}</div>}
              {s.flag === 'baseline' && !s.note && (
                <div className="k-note">рівень фону, зміни поза похибкою немає</div>
              )}
            </div>
          </Openable>
        ))}
      </div>

      {/* ---- 05 СОЦ-ЯКОРІ ---- */}
      <SectionHeader index="05" title="Соц-якорі" note="інший каденс, окрема шкала" />
      <div className="k-stack k-stack--tight">
        {anchors.length === 0 && <div className="a-empty">якорів за період немає</div>}
        {/* історія хвилі розкривається так само, як історія прогнозу в реєстрі */}
        {anchors.map((a) => (
          <div key={a.id} className={a.stale ? 'k-faded' : undefined}>
            <Reveal label={`історія якоря: ${a.metric}`} summary={
              <div className="k-stack k-stack--tight">
                <div className="k-sub">
                  <span className="k-label">{a.org}</span> {a.metric}
                </div>
                <div className="k-row k-row--split">
                  <span className="k-row">
                    <span className="k-pair__num">{a.value > 0 ? `+${a.value}` : a.value}</span>
                    <DeltaBadge
                      value={a.delta}
                      polarity="up-good"
                      unit=" п.п."
                      hasValue={a.value !== null && a.value !== undefined}
                    />
                  </span>
                  <span className="k-note">{a.ageLabel}</span>
                </div>
                {a.stale && <div className="k-note">застарів, не використовується у звірці</div>}
              </div>
            }>
              <Timeline steps={anchorHistory(a)} />
            </Reveal>
          </div>
        ))}
      </div>

      {/* D7: Зріз працює як перша сторінка доповіді, тому останнім у ньому стоїть
          не підпис, а питання «що ми перевіряємо далі». Прогноз читається одним
          записом: ймовірність, дедлайн і критерій звідти ж, звідки їх бере карта
          і Компас, тому три місця не можуть показати три різні числа. */}
      {upcoming.length > 0 && (
        <div className="k-divider k-stack k-stack--tight">
          <div className="k-label">Наступні 14 днів</div>
          {upcoming.map((f) => (
            <div key={f.id} className="k-next">
              <div className="k-row k-row--split">
                <span className="k-next__p">
                  {f.probability == null ? 'без числа' : `${Math.round(f.probability * 100)}%`}
                </span>
                <span className="k-note">до {formatDate(f.deadline)}</span>
              </div>
              <div className="k-sub">{f.text || f.question}</div>
              {f.criterion && (
                <div className="k-note">критерій: {f.criterion}</div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="k-divider">
        <DoctrineFooter author="Роман Савицький" />
      </div>
    </div>
  );
}

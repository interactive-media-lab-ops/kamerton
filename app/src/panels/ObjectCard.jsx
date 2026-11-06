import React from 'react';
import { Panel, HudButton, StatusTag, Sparkline, DeltaBadge } from 'astrolabe-ds';
import {
  getStat, metricGlossary, stateGlossary, getStatements,
  listWeeks, shortWeek, getActiveWeek,
} from '../data/selectors.js';

/**
 * Міні-картка обʼєкта: будь-яка цифра на екрані вміє пояснити себе.
 * Три різновиди в одному місці, бо вони відрізняються тільки джерелом даних:
 *  metric   індекс з глосарієм, серією по тижнях і дельтою
 *  state    стан аудиторії з глосарієм
 *  counter  лічильник шапки з переліком самих тверджень
 */
export default function ObjectCard({ object, closing, weekId, onClose }) {
  if (!object) return null;

  return (
    <div className={`k-objcard${closing ? ' k-objcard--out' : ''}`}>
      <Panel glass brackets>
        <div className="k-dock__head">
          <span className="a-tab">ОБʼЄКТ</span>
          <HudButton variant="ghost" aria-label="закрити картку" onClick={onClose}>
            ✕
          </HudButton>
        </div>
        <div className="k-objcard__body k-stack k-stack--tight">
          {object.kind === 'metric' && <MetricBody metricKey={object.key} weekId={weekId} />}
          {object.kind === 'state' && <StateBody name={object.name} note={object.note} />}
          {object.kind === 'counter' && <CounterBody kind={object.counter} weekId={weekId} />}
        </div>
      </Panel>
    </div>
  );
}

function MetricBody({ metricKey, weekId }) {
  const s = getStat(metricKey, weekId);
  const g = metricGlossary(metricKey);
  const weeks = listWeeks();
  if (!s) return <div className="a-empty">метрика не знайдена</div>;

  return (
    <>
      <div className="k-lead">{s.label}</div>
      {g && <p className="k-sub">{g.definition}</p>}

      <div className="k-row k-row--split">
        <span className="k-pair__num">
          {s.value === null ? <span className="a-partial">н/д</span> : s.value}
        </span>
        <DeltaBadge value={s.delta} polarity={s.polarity} hasValue={s.value !== null} />
      </div>

      {s.series.length > 1 && (
        <div className="k-row">
          <Sparkline series={s.series} threshold={s.threshold} w={140} h={34} />
          <span className="k-note">
            серія: {s.series.join(' · ')}
            {s.threshold !== undefined ? ` · межа ${s.threshold}` : ''}
          </span>
        </div>
      )}

      {s.gaps > 0 && (
        <div className="k-note">тижнів без виміру: {s.gaps}</div>
      )}

      <div className="k-divider k-row">
        <StatusTag status="fact" />
        <span className="k-note">
          джерело: тижневик САН, {weeks.map((w) => w.short).join(', ')}
        </span>
      </div>
      {s.deltaSource === 'contract' && (
        <div className="k-note">дельта взята з контракту: попереднього виміру немає</div>
      )}
    </>
  );
}

function StateBody({ name, note }) {
  const g = stateGlossary(name);
  return (
    <>
      <div className="k-lead">{name}</div>
      {g ? <p className="k-sub">{g.definition}</p> : <div className="a-empty">пояснення для стану ще не заведене</div>}
      {note && <p className="k-note">{note}</p>}
      <div className="k-divider k-row">
        <StatusTag status="fact" />
        <span className="k-note">джерело: глосарій обʼєктів контракту</span>
      </div>
    </>
  );
}

const COUNTER_TITLE = { fact: 'Факти', assessment: 'Оцінки', hypothesis: 'Гіпотези' };

function CounterBody({ kind, weekId }) {
  const list = getStatements(weekId, kind);
  const week = getActiveWeek(weekId);
  return (
    <>
      <div className="k-row">
        <span className="k-lead">{COUNTER_TITLE[kind]}</span>
        <StatusTag status={kind} />
      </div>
      <div className="k-note">тиждень {shortWeek(week.id)}, тверджень: {list.length}</div>
      {list.length === 0 && <div className="a-empty">тверджень цього статусу за період немає</div>}
      {list.map((s, i) => (
        <div
          key={i}
          className="k-divider k-stack k-stack--tight"
          data-criterion={s.criterion || undefined}
          data-deadline={s.deadline || undefined}
        >
          <p className="k-sub">{s.text}</p>
          {/* тег стоїть на самому твердженні: тоді поповер знає його критерій */}
          <div className="k-row k-row--split">
            <span className="k-note">{s.source}</span>
            <StatusTag status={kind} />
          </div>
        </div>
      ))}
    </>
  );
}

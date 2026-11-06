import React, { useMemo } from 'react';
import { Panel } from 'astrolabe-ds';
import { registryScore, calibrationFactor, DEFAULT_CONFIG } from '../data/ensemble.js';
import { COMPASS } from '../data/thresholds.js';
import Instrument from './Instrument.jsx';

/**
 * Реєстр шару КОМПАС: квартальний рахунок, розвʼязані ринки, лідерборд.
 *
 * Реєстр ведеться повністю. Промахи стоять поруч з влучаннями, і сховати їх
 * конфігом нема як: рахунок рахується з тих самих ринків, що показані нижче,
 * а прапорця фільтрації в коді не існує.
 *
 * Три Brier поруч це не прикраса, а прямий тест доктрини: чи справді звірка
 * незалежних джерел точніша за кожне джерело окремо. Найкращий підсвічений,
 * і якщо найкращим виявиться не компас, це теж буде видно.
 */

const num = (v) => (v == null ? 'нема' : v.toFixed(3));

/** Brier живе в 0..1, але вище 0.5 це вже гірше за монетку: шкалу ріжемо там. */
const BRIER_MAX = 0.6;

function BrierBars({ score }) {
  const rows = [
    ['brier_ensemble', 'компас'],
    ['brier_san_solo', 'модель окремо'],
    ['brier_humans_solo', 'панель окремо'],
  ];
  const best = rows
    .filter(([k]) => score[k] != null)
    .sort((a, b) => score[a[0]] - score[b[0]])[0]?.[0];

  return (
    <div className="k-reg__bars">
      {rows.map(([key, label]) => (
        <div key={key} className={`k-reg__bar ${best === key ? 'is-best' : ''}`}>
          <span>{label}</span>
          <span className="k-reg__track">
            <i
              className="k-reg__fill"
              style={{ width: `${Math.min(100, ((score[key] ?? 0) / BRIER_MAX) * 100)}%` }}
            />
          </span>
          <b>{num(score[key])}</b>
        </div>
      ))}
    </div>
  );
}

export default function EnsembleRegistry({ ensemble }) {
  const cfg = { ...DEFAULT_CONFIG, ...(ensemble?.config || {}) };
  const participants = ensemble?.participants || [];
  const score = useMemo(
    () => registryScore(ensemble?.markets || [], participants, cfg),
    [ensemble]
  );

  if (!ensemble) return <div className="a-empty">компас цього тижня не збирався</div>;

  const byId = new Map((ensemble.markets || []).map((m) => [m.id, m]));
  const board = participants
    .filter((p) => p.role === 'bettor' || p.role === 'analyst' || p.role === 'SAN')
    .slice()
    .sort((a, b) => (a.brier_rolling ?? 9) - (b.brier_rolling ?? 9));

  return (
    <div className="k-stack">
      <span className="a-tab">РЕЄСТР КОМПАСА</span>

      <Panel className="k-reg__score">
        <div className="k-row k-row--split">
          <span className="k-label">квартальний рахунок</span>
          <span className="k-note">розвʼязано {score.resolved_total}</span>
        </div>
        <div className="k-reg__hits">
          <span className="k-reg__hit">влучань {score.hits}</span>
          <span className="k-reg__miss">промахів {score.misses}</span>
        </div>
        <div className="k-note">точність прогнозів, коротший бар кращий</div>
        {/* C10: чесність малих N. Brier на одній-двох розвʼязках це не точність,
            а випадковість, і бейдж мусить стояти впритул до чисел, а не в примітці
            десь нижче: інакше графік читається як усталений результат. */}
        {score.resolved_total <= COMPASS.small_sample_max && (
          <div className="k-pilot">
            ПІЛОТ · n={score.resolved_total} · замало для висновків
          </div>
        )}
        <BrierBars score={score} />
      </Panel>

      <div className="k-divider k-stack k-stack--tight">
        <span className="k-label">розвʼязані ринки</span>
        {score.rows.length === 0 && <div className="a-empty">поки жодного</div>}
        {score.rows.map((r) => {
          const m = byId.get(r.id);
          const agg = m?.aggregate || {};
          return (
            <div key={r.id} className="k-reg__row">
              <div className="k-reg__q">{m?.question || r.id}</div>
              {/* Міні-шкала той самий прилад: консенсус проти факту одним поглядом. */}
              <Instrument
                variant="mini"
                agg={agg}
                san={m?.san_estimate?.p ?? null}
                ghost={r.outcome ? 0.98 : 0.02}
              />
              <div className="k-note">
                консенсус {agg.p_ensemble == null ? 'нема' : `${Math.round(agg.p_ensemble * 100)}%`},
                факт: <b>{r.outcome ? 'сталось' : 'не сталось'}</b>
              </div>
            </div>
          );
        })}
      </div>

      {/* C10: рейтинг учасників ховається, доки розвʼязок менше порогу.
          Таблиця лідерів на трьох розвʼязках ранжує шум і при цьому виглядає
          як заслужений результат, тому її просто немає, поки бази бракує. */}
      {score.resolved_total < COMPASS.registry_min_resolved ? (
        <div className="k-divider k-stack k-stack--tight">
          <span className="k-label">точність учасників</span>
          <div className="k-note">
            рейтинг зʼявиться від {COMPASS.registry_min_resolved} розвʼязок ·
            зараз {score.resolved_total}
          </div>
        </div>
      ) : (
      <div className="k-divider k-stack k-stack--tight">
        <span className="k-label">точність учасників</span>
        <div className="k-note">за ковзним Brier, коротший бар кращий</div>
        {board.map((p) => (
          <div key={p.id} className="k-reg__lb">
            <span>{p.callsign}</span>
            <span className="k-reg__track">
              <i
                className="k-reg__fill"
                style={{ width: `${Math.min(100, ((p.brier_rolling ?? 0) / BRIER_MAX) * 100)}%` }}
              />
            </span>
            <span className="k-note">
              {p.resolved_count < 3 ? 'нема бази' : `×${calibrationFactor(p).toFixed(2)}`}
            </span>
          </div>
        ))}
      </div>
      )}

      <div className="k-note k-reg__foot">
        Реєстр ведеться повністю, включно з промахами.
      </div>
    </div>
  );
}

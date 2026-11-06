import React from 'react';
import { COMPASS } from '../data/thresholds.js';

/**
 * D6 · подання розходження в картці ринку.
 *
 * Це ВИГЛЯД картки, а не окремий режим і не нова панель. Коли модель і панель
 * розходяться на поріг і більше, звичайний прилад показує одну стрілку консенсусу
 * і мовчить про те, що під нею дві несумісні думки. Тут вони рознесені по кінцях
 * шкали, а зона розриву заштрихована: розходження стає предметом розмови, а не
 * приміткою.
 *
 * Модель ліворуч, панель праворуч, консенсус третім маркером. Після розвʼязки
 * поверх лягає маркер факту, тому видно не лише хто був ближче, а й наскільки.
 */
export default function DivergenceScale({ san, humans, consensus, outcome }) {
  if (san == null || humans == null) return null;

  const gapPp = Math.round(Math.abs(san - humans) * 100);
  if (gapPp < COMPASS.divergence_pp) return null;

  const pct = (p) => `${Math.round(p * 100)}%`;
  const x = (p) => `${Math.min(100, Math.max(0, p * 100))}%`;
  const lo = Math.min(san, humans);
  const hi = Math.max(san, humans);

  return (
    <div className="k-div" role="group" aria-label={`розходження моделі і панелі, ${gapPp} пунктів відсотка`}>
      <div className="k-div__head">
        <span className="k-label">розходження {gapPp} п.п.</span>
        <span className="k-note">модель і панель дивляться в різні боки</span>
      </div>

      <div className="k-div__track">
        {/* зона розриву: рівно те місце, де згоди немає */}
        <span
          className="k-div__gap"
          style={{ left: x(lo), width: `${(hi - lo) * 100}%` }}
        />

        <span className="k-div__mark k-div__mark--san" style={{ left: x(san) }} />
        <span className="k-div__mark k-div__mark--hum" style={{ left: x(humans) }} />
        {consensus != null && (
          <span className="k-div__mark k-div__mark--ens" style={{ left: x(consensus) }} />
        )}
        {outcome !== undefined && outcome !== null && (
          <span
            className="k-div__mark k-div__mark--fact"
            style={{ left: x(outcome ? 0.98 : 0.02) }}
          />
        )}
      </div>

      <div className="k-div__legend">
        <span className="k-div__key k-div__key--san">модель {pct(san)}</span>
        {consensus != null && (
          <span className="k-div__key k-div__key--ens">консенсус {pct(consensus)}</span>
        )}
        <span className="k-div__key k-div__key--hum">панель {pct(humans)}</span>
      </div>

      {outcome !== undefined && outcome !== null && (
        <div className="k-note">
          факт: {outcome ? 'відбулось' : 'не відбулось'}
        </div>
      )}
    </div>
  );
}

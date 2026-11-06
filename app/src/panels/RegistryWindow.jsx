import React from 'react';
import { ScoreBoard, SectionHeader } from 'astrolabe-ds';
import {
  collectForecasts,
  forecastScore,
  collectMethodNotes,
  forecastHuman,
  forecastHistory,
  FORECAST_LABEL,
  shortWeek,
} from '../data/selectors.js';
import Reveal from './Reveal.jsx';

/**
 * Вертикальний мінітаймлайн однієї історії: крок, значення, крок.
 * Вертикаль, а не рядок, бо кроки читаються згори вниз як послідовність.
 */
export function Timeline({ steps }) {
  return (
    <ol className="k-timeline">
      {steps.map((s) => (
        <li key={s.label} className="k-timeline__step">
          <span className="k-timeline__label">{s.label}</span>
          <span className="k-timeline__value">{s.value}</span>
        </li>
      ))}
    </ol>
  );
}

/** Клас статусу бере колір з тих самих токенів, що й ScoreBoard. */
const STATUS_CLASS = {
  hit: 'k-verdict k-verdict--hit',
  miss: 'k-verdict k-verdict--miss',
  partial_hit: 'k-verdict k-verdict--partial',
  open: 'k-verdict k-verdict--open',
};

/**
 * Вікно РЕЄСТР: усі прогнози з усіх тижнів в одному місці.
 * Промах показується так само помітно, як влучання: це фішка системи, не сором.
 */
export default function RegistryWindow({ weekId }) {
  const list = collectForecasts(weekId);
  const score = forecastScore(weekId);
  const rules = collectMethodNotes(weekId);

  return (
    <div className="k-stack">
      <ScoreBoard hits={score.hits} misses={score.misses} open={score.open} />
      <div className="k-note">
        система публічно рахує свої влучання і промахи: це і є підстава їй довіряти
      </div>
      {score.partial > 0 && (
        <div className="k-note">частково справдилось: {score.partial}</div>
      )}

      {list.length === 0 && <div className="a-empty">прогнозів у реєстрі немає</div>}

      {/* Згорнутий запис це один рядок: формулювання і чим закінчилось.
          Історія розкривається на наведення або клік, щоб список лишався списком. */}
      {list.map((f) => (
        <Reveal
          key={f.id}
          label={`історія прогнозу: ${f.text}`}
          summary={
            <div className="k-reveal__row">
              <span className="k-reveal__text">{f.text}</span>
              <span className="k-reveal__side">
                <span className={STATUS_CLASS[f.status] || 'k-verdict'}>
                  {forecastHuman(f)}
                </span>
                <span className="k-note k-reveal__tech">
                  {FORECAST_LABEL[f.status] || f.status}
                </span>
              </span>
            </div>
          }
        >
          <Timeline steps={forecastHistory(f)} />
          {f.status === 'miss' && f.resolution_note && (
            <div className="k-note">висновок: {f.resolution_note}</div>
          )}
        </Reveal>
      ))}

      {rules.length > 0 && (
        <>
          <SectionHeader title="Методологія" note="правила, зафіксовані по ходу" />
          {rules.map((r, i) => (
            <div key={i} className="k-stack k-stack--tight">
              <div className="k-row">
                {/* власний епістемічний ярлик продукту в оформленні тегів системи */}
                <span className="a-tag a-tag--fact">ПРАВИЛО</span>
                <span className="k-note">{shortWeek(r.week)}</span>
              </div>
              <p className="k-sub">{r.text}</p>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

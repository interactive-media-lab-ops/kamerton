import React from 'react';

/**
 * Sparkline: міні-траєкторія метрики за останні тижні. SVG, без залежностей.
 * @param {number[]} series - 2-8 значень, старіші зліва
 * @param {number} [threshold] - критична межа, малюється пунктиром
 * @param {number} [w] @param {number} [h]
 */
export function Sparkline({ series = [], threshold, w = 64, h = 20 }) {
  if (!series || series.length < 2) return null;
  const min = Math.min(...series, threshold ?? Infinity);
  const max = Math.max(...series, threshold ?? -Infinity);
  const span = max - min || 1;
  const x = (i) => 2 + (i * (w - 4)) / (series.length - 1);
  const y = (v) => h - 2 - ((v - min) * (h - 4)) / span;
  const pts = series.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return (
    <svg width={w} height={h} aria-hidden="true" style={{ display: 'block' }}>
      {threshold !== undefined && (
        <line x1="0" y1={y(threshold)} x2={w} y2={y(threshold)}
          stroke="var(--a-destr)" strokeWidth="1" strokeDasharray="2 3" opacity=".7" />
      )}
      <polyline points={pts} fill="none" stroke="var(--a-cyan)" strokeWidth="1.4" />
      <circle cx={x(series.length - 1)} cy={y(series[series.length - 1])} r="2.2" fill="var(--a-text)" />
    </svg>
  );
}

/**
 * RopeGauge: канат деструктив-конструктив по темі.
 * @param {number} value - 0..100, частка конструктивного краю
 * @param {string} [label] - назва теми і горизонт
 */
export function RopeGauge({ value = 50, label }) {
  const v = Math.max(4, Math.min(96, value));
  return (
    <div>
      {label && (
        <div className="a-stat__foot" style={{ justifyContent: 'space-between', marginBottom: 'var(--a-s1)' }}>
          <span>{label}</span>
          <span>позиція: {100 - v} / {v}</span>
        </div>
      )}
      <div className="a-rope" role="img" aria-label={`канат: деструктив ${100 - v}, конструктив ${v}`}>
        <div className="a-rope__mid" />
        <div className="a-rope__mk" style={{ left: v + '%' }} />
      </div>
    </div>
  );
}

/**
 * ScoreBoard: чесний рахунок реєстру прогнозів.
 * Промахи показуються так само помітно, як влучання. Це фішка системи.
 * @param {number} hits @param {number} misses @param {number} open
 */
export function ScoreBoard({ hits = 0, misses = 0, open = 0 }) {
  return (
    <div className="a-score" role="group" aria-label="рахунок реєстру прогнозів">
      <div className="a-score__cell">
        <span className="a-score__num a-score__num--hit">{hits}</span>влучань
      </div>
      <div className="a-score__cell">
        <span className="a-score__num a-score__num--miss">{misses}</span>промахів
      </div>
      <div className="a-score__cell">
        <span className="a-score__num a-score__num--open">{open}</span>відкриті
      </div>
    </div>
  );
}

import React from 'react';
import { DeltaBadge, SourceTag } from './Tags.jsx';
import { Sparkline } from './Gauges.jsx';

/**
 * StatCard: метрика тижня. Велика цифра + дельта + траєкторія + критичний поріг.
 * @param {string} label - назва метрики
 * @param {number|string|null} value - значення (null = partial data)
 * @param {string} [suffix] - одиниця біля цифри
 * @param {number} [delta] - зміна проти минулого тижня
 * @param {'up-good'|'up-bad'} [polarity]
 * @param {number[]} [series] - значення за останні тижні для спарклайна
 * @param {number} [threshold] - критична межа (напр. 0.35 для індексу міцності)
 * @param {string} [note] - короткий підпис-інтерпретація
 */
export function StatCard({ label, value, suffix, delta, polarity, series, threshold, note }) {
  return (
    <div className="a-stat">
      <div className="a-stat__label">{label}</div>
      <div className="a-stat__num">
        {value === null || value === undefined ? <span className="a-partial">н/д</span> : value}
        {suffix && <small> {suffix}</small>}
      </div>
      <div className="a-stat__foot">
        <DeltaBadge
          value={delta}
          polarity={polarity}
          hasValue={value !== null && value !== undefined}
        />
        {series && series.length > 1 && <Sparkline series={series} threshold={threshold} />}
        {threshold !== undefined && (
          <span className="a-stat__threshold">межа {threshold}</span>
        )}
      </div>
      {note && <div className="a-stat__foot">{note}</div>}
    </div>
  );
}

/**
 * TopicRow: рядок теми у топ-5. Ранг, тренд, тон, звірка джерел.
 * @param {number} rank
 * @param {string} name
 * @param {'mil'|'civ'|'both'} aud
 * @param {'up'|'down'|'new'|'flat'|'out'} trend
 * @param {'destructive'|'constructive'|'mixed'} tone
 * @param {{kind:'match'|'conflict'|'single', count?:number}} verification
 * @param {string} [note]
 * @param {boolean} [exited] - тема випала з поля (цвинтар тем)
 */
export function TopicRow({ rank, name, aud, trend, tone, verification, note, exited }) {
  const audLabel = { mil: 'військові', civ: 'цивільні', both: 'обидві аудиторії' }[aud];
  const trendLabel = { up: 'росте', down: 'спадає', new: 'НОВА', flat: 'стабільна', out: 'випала' }[trend];
  return (
    <div className={`a-topic a-topic--${tone} ${exited ? 'a-topic--exited' : ''}`}>
      <div className="a-topic__rank" aria-hidden="true">{rank}</div>
      <div className="a-topic__body">
        <div className="a-topic__name">{name}</div>
        <div className="a-topic__meta">
          <span>{audLabel}</span>
          <span className={`a-trend a-trend--${trend} ${tone === 'constructive' ? 'is-constr' : ''}`}>
            {trendLabel}
          </span>
          {verification && <SourceTag kind={verification.kind} count={verification.count} />}
          {note && <span>{note}</span>}
        </div>
      </div>
    </div>
  );
}

/**
 * CaseCard: кейс на контролі з життєвим циклом.
 * Життєвий цикл: open -> answered -> closed, або open -> festering (загноївся).
 * @param {string} title
 * @param {'open'|'answered'|'closed'|'festering'} status
 * @param {string} [stake] - чому цей кейс важливий
 * @param {string} [indicator] - за чим стежимо
 * @param {string} [nextCheck] - коли наступна перевірка
 * @param {string} [openedLabel] - напр. "відкритий 3 тижні"
 */
export function CaseCard({ title, status, stake, indicator, nextCheck, openedLabel }) {
  const steps = [
    ['open', 'ВІДКРИТИЙ'],
    ['answered', 'ВІДПОВІДЬ'],
    ['closed', 'ЗАКРИТИЙ'],
    ['festering', 'ЗАГНОЇВСЯ'],
  ];
  return (
    <div>
      <div className="a-topic__name">{title}</div>
      {stake && <div className="a-case__stake">{stake}</div>}
      <div className="a-life" role="list" aria-label="життєвий цикл кейса">
        {steps.map(([key, label]) => (
          <span
            key={key}
            role="listitem"
            className={`a-life__step ${status === key ? `a-life__step--current-${key}` : ''}`}
          >
            {label}
          </span>
        ))}
      </div>
      <div className="a-case__meta">
        {openedLabel && <span>{openedLabel} · </span>}
        {indicator && <span>індикатор: {indicator} · </span>}
        {nextCheck && <span>перевірка: {nextCheck}</span>}
      </div>
    </div>
  );
}

import React from 'react';

/** Українська множина. Система самодостатня, тому форма рахується тут же. */
function plural(n, [one, few, many]) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/**
 * StatusTag: епістемічний статус твердження. Першокласний примітив системи.
 * @param {'fact'|'assessment'|'hypothesis'} status
 */
export function StatusTag({ status = 'assessment' }) {
  const label = { fact: 'ФАКТ', assessment: 'ОЦІНКА', hypothesis: 'ГІПОТЕЗА' }[status];
  return <span className={`a-tag a-tag--${status}`}>{label}</span>;
}

/**
 * SourceTag: результат звірки незалежних джерел.
 * @param {'match'|'conflict'|'single'} kind
 * @param {number} [count] - кількість джерел при збігу
 */
export function SourceTag({ kind = 'single', count, label }) {
  // Готовий підпис приходить згори, коли джерела треба назвати поіменно
  // (звірка САН із соц-якорем). Без нього рахуємо кількість.
  const text =
    label ||
    (kind === 'match'
      ? `збіг${count ? ' ' + count + ' ' + plural(count, ['джерело', 'джерела', 'джерел']) : ''}`
      : kind === 'conflict'
      ? 'розбіжність'
      : '1 джерело');
  return <span className={`a-tag a-tag--${kind}`}>{text}</span>;
}

/**
 * DeltaBadge: зміна проти минулого періоду. Цифра ніколи не ходить без дельти.
 * @param {number} value - значення дельти (може бути відʼємним)
 * @param {'up-good'|'up-bad'} polarity - чи є зростання добрим для цієї метрики
 * @param {string} [unit] - одиниця, напр. "п.п." або "%"
 */
export function DeltaBadge({ value, polarity = 'up-good', unit = '', hasValue }) {
  // Порожня дельта має дві різні причини, і плутати їх не можна: або немає
  // з чим порівнювати, або немає самого виміру. Читач має бачити, яка саме.
  if (value === null || value === undefined) {
    return (
      <span className="a-partial">
        {hasValue === false ? 'виміру немає' : 'порівняння немає: минулий тиждень без виміру'}
      </span>
    );
  }
  const up = value > 0;
  const flat = value === 0;
  const good = flat ? null : polarity === 'up-good' ? up : !up;
  const cls = flat ? 'a-delta--flat' : good ? 'a-delta--good' : 'a-delta--bad';
  const arrow = flat ? '·' : up ? '\u25B2' : '\u25BC';
  return (
    <span className={`a-delta ${cls}`}>
      {arrow} {up ? '+' : ''}
      {value}
      {unit}
    </span>
  );
}

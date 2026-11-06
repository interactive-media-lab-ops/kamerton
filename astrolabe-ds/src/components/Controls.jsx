import React from 'react';

/**
 * HudButton: базова кнопка. Мінімальна тач-ціль 44px гарантована стилями.
 * @param {'primary'|'ghost'} variant
 */
export function HudButton({ variant = 'ghost', children, ...rest }) {
  return (
    <button type="button" className={`a-btn a-btn--${variant}`} {...rest}>
      {children}
    </button>
  );
}

/**
 * LeverButton: важіль рішення. Показує очікуваний наслідок і впевненість,
 * розкривається при виборі. Мова наслідків, не рекомендацій.
 * @param {string} keyLabel - літера важеля, напр. "А"
 * @param {string} title - назва дії
 * @param {string} expected - "рішення X матиме наслідок Y"
 * @param {string} confidence - рівень впевненості, напр. "середня"
 * @param {boolean} selected
 * @param {function} onSelect
 */
export function LeverButton({ keyLabel, title, expected, confidence, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`a-lever ${selected ? 'is-on' : ''}`}
      aria-pressed={!!selected}
      onClick={onSelect}
    >
      <span className="a-lever__key">{keyLabel}</span> · {title}
      <span className="a-lever__eff">
        Наслідок: {expected}. Впевненість: <span className="a-lever__conf">{confidence}</span>.
      </span>
    </button>
  );
}

/**
 * HudNav: нижня навігація між зрізами продукту.
 * @param {{id:string,label:string}[]} items
 * @param {string} current
 * @param {function} onChange
 */
export function HudNav({ items = [], current, onChange }) {
  return (
    <nav className="a-nav" aria-label="розділи">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={`a-nav__item ${current === it.id ? 'is-on' : ''}`}
          aria-current={current === it.id ? 'page' : undefined}
          onClick={() => onChange && onChange(it.id)}
        >
          {it.label}
        </button>
      ))}
    </nav>
  );
}

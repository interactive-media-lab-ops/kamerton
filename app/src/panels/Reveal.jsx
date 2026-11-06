import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Рядок, що показує історію на затримку наведення або на клік.
 *
 * Наведення без затримки перетворило б перегляд списку на мигання, тому
 * порожня пауза 400ms: історія розкривається тільки там, де читач справді
 * спинився. Клік прикріплює розгорнутий стан, щоб історію можна було читати
 * не тримаючи мишу.
 */
export default function Reveal({ summary, children, delay = 400, label }) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const timer = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  const enter = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHover(true), delay);
  }, [delay]);

  const leave = useCallback(() => {
    clearTimeout(timer.current);
    setHover(false);
  }, []);

  const open = hover || pinned;

  return (
    <div
      className={`k-reveal${open ? ' k-reveal--open' : ''}`}
      onMouseEnter={enter}
      onMouseLeave={leave}
    >
      <div
        className="k-reveal__head"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={label}
        onClick={() => setPinned((v) => !v)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setPinned((v) => !v);
          }
        }}
      >
        {summary}
      </div>
      {open && <div className="k-reveal__body">{children}</div>}
    </div>
  );
}

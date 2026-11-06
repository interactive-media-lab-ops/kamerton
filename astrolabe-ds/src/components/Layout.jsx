import React from 'react';

/**
 * Panel: базова панель зі зрізаними кутами.
 * @param {boolean} sunken - заглиблений фон (колодязь даних)
 * @param {boolean} active - активний стан (циановий бордер)
 * @param {boolean} brackets - латунні кутові кронштейни (для головних панелей)
 * @param {boolean} glass - v2.1: скло поверх живої карти (blur + saturate фону)
 */
export function Panel({ sunken, active, brackets, glass, children, className = '', ...rest }) {
  return (
    <div
      className={`a-panel ${sunken ? 'a-panel--sunken' : ''} ${active ? 'a-panel--active' : ''} ${
        glass ? 'a-panel--glass' : ''
      } ${className}`}
      {...rest}
    >
      {brackets && <span className="a-bracket a-bracket--tl" aria-hidden="true" />}
      {children}
      {brackets && <span className="a-bracket a-bracket--br" aria-hidden="true" />}
    </div>
  );
}

/**
 * SectionHeader: заголовок секції з індексом і латунною лінією.
 * @param {string} index - порядковий номер, напр. "01"
 * @param {string} title - назва секції
 * @param {string} note - короткий підпис-пояснення
 */
export function SectionHeader({ index, title, note }) {
  return (
    <div className="a-sechead">
      {index && <span className="a-sechead__idx">{index}</span>}
      <span>{title}</span>
      {note && <span className="a-sechead__note">{note}</span>}
    </div>
  );
}

/**
 * ModeBanner: плашка режиму. Жорстка стіна між фактами і моделюванням.
 * @param {'chronicle'|'sandbox'} mode
 */
export function ModeBanner({ mode = 'chronicle' }) {
  const isSandbox = mode === 'sandbox';
  // У шапці стоїть одне слово, повне формулювання живе в тултіпі: банер
  // називає режим, а не пояснює його щосекунди.
  const full = isSandbox
    ? 'МОДЕЛЮВАННЯ · гіпотези моделі, не прогноз'
    : 'ХРОНІКА · факти і дельти реальних тижнів';
  return (
    <div
      className={`a-mode ${isSandbox ? 'a-mode--sandbox' : 'a-mode--chronicle'}`}
      role="status"
      title={full}
    >
      {isSandbox ? 'МОДЕЛЮВАННЯ' : 'ХРОНІКА'}
    </div>
  );
}

/**
 * DoctrineFooter: незмінний рядок доктрини внизу кожного екрана.
 */
export function DoctrineFooter({ author = 'Роман Савицький' }) {
  return (
    <footer className="a-doctrine">
      факт / оцінка / гіпотеза на кожному твердженні · збіг джерел підвищує впевненість · мова
      наслідків, не рекомендацій · рахунок включно з промахами · рішення за керівництвом
      <br />
      КАМЕРТОН · {author}
    </footer>
  );
}

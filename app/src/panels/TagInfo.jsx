import React, { useEffect, useState } from 'react';
import { tagGlossary, shortWeek, SAN_INFO } from '../data/selectors.js';

/**
 * Поповер статусу: спершу контекст, потім визначення.
 *
 * Тег сам по собі каже тільки рід твердження. Читачеві треба інше: що саме
 * тут зафіксовано і між ким розбіжність. Тому верхній поверх поповера
 * контекстний і збирається з місця, де тег стоїть, а словникове визначення
 * лишається внизу дрібним, як довідка.
 *
 * Контекст приходить із DOM (data-criterion, data-deadline, data-breakdown),
 * бо теги стоять і в застосунку, і всередині дизайн-системи, а слухач один.
 */
export default function TagInfo({ weekId }) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    const kindOf = (el) =>
      [...el.classList]
        .map((c) => /^a-tag--(.+)$/.exec(c))
        .filter(Boolean)
        .map((m) => m[1])[0] || null;

    const onCapture = (e) => {
      if (e.target.closest?.('.k-tagpop')) return;

      const src = e.target.closest?.('[data-info="san"]');
      if (src) {
        e.preventDefault();
        e.stopPropagation();
        const r = src.getBoundingClientRect();
        setInfo({ kind: 'san', x: r.left, y: r.bottom + 6 });
        return;
      }

      const el = e.target.closest?.('.a-tag');
      const kind = el && kindOf(el);
      if (!kind || !tagGlossary(kind)) return;
      e.preventDefault();
      e.stopPropagation();
      const r = el.getBoundingClientRect();
      const host = el.closest('[data-breakdown], [data-criterion]');
      let breakdown = null;
      try {
        breakdown = host?.dataset.breakdown ? JSON.parse(host.dataset.breakdown) : null;
      } catch (err) {
        breakdown = null;
      }
      setInfo({
        kind,
        x: r.left,
        y: r.bottom + 6,
        criterion: host?.dataset.criterion || null,
        deadline: host?.dataset.deadline || null,
        breakdown,
      });
    };

    const onOutside = (e) => {
      if (e.target.closest?.('.k-tagpop')) return;
      setInfo(null);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setInfo(null);
    };

    document.addEventListener('click', onCapture, true);
    document.addEventListener('click', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onCapture, true);
      document.removeEventListener('click', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  if (!info) return null;

  const week = shortWeek(weekId);
  const g = info.kind === 'san' ? SAN_INFO : tagGlossary(info.kind);
  if (!g) return null;

  const W = 300;
  const left = Math.min(info.x, window.innerWidth - W - 12);
  const top = Math.min(info.y, window.innerHeight - 200);

  return (
    <div className="k-tagpop" style={{ left, top, width: W }} role="dialog">
      <div className="k-tagpop__term">
        {info.kind === 'san' ? (
          <span className="k-label">САН</span>
        ) : (
          <span className={`a-tag a-tag--${info.kind}`}>{g.term}</span>
        )}
      </div>

      {info.kind !== 'san' && (
        <div className="k-tagpop__ctx">{context(info, week)}</div>
      )}

      <p className="k-tagpop__def">{g.definition}</p>
    </div>
  );
}

/** Верхній поверх: що саме стоїть за цим тегом тут і зараз. */
function context(info, week) {
  if (info.kind === 'fact') {
    return <span>зафіксовано: тижневик САН, {week}, з датою</span>;
  }
  if (info.kind === 'assessment') {
    return <span>інтерпретація аналітика САН на основі корпусу {week}</span>;
  }
  if (info.kind === 'hypothesis') {
    return (
      <span>
        припущення
        {info.criterion ? `; критерій: ${info.criterion}` : '; критерій задається при відкритті'}
        {info.deadline ? `; дедлайн: ${info.deadline}` : ''}
      </span>
    );
  }
  // звірка: поіменний розклад, рядок на джерело
  const rows = info.breakdown || [];
  if (!rows.length) return <span>розклад джерел для цього місця не заведений</span>;
  return (
    <ul className="k-tagpop__rows">
      {rows.map((r) => (
        <li key={r.source}>
          <b>{r.source}:</b> {r.read}
        </li>
      ))}
    </ul>
  );
}

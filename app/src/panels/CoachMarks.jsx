import React, { useEffect, useLayoutEffect, useState } from 'react';
import { HudButton } from 'astrolabe-ds';

/**
 * G1 · коуч-мітки замість модалки.
 *
 * Модалка «ЯК ЧИТАТИ ЕКРАН» пояснювала екран, не показуючи на нього: читач
 * дочитував чотири абстрактні рядки, закривав вікно і опинявся перед тим самим
 * незрозумілим полем. Тепер кожна мітка прив'язана лінією-вказівником до
 * реального елемента, який вона пояснює.
 *
 * Правило: жодних пояснень без прив'язки. Якщо анкора цього тижня на екрані
 * немає (наприклад, жодної теми зі статусом гіпотези), мітка не показується
 * взагалі. Показати її «десь поруч» означало б вказати на не те.
 */

const MARKS = [
  {
    id: 'bluf',
    anchor: { kind: 'dom', selector: '.k-bluf' },
    text: 'Висновок тижня. Один рядок: що сталось.',
    side: 'below',
  },
  {
    id: 'scale',
    anchor: { kind: 'canvas', key: 'scale' },
    text: 'Шкала поля. Центр ваги і дрейф: куди хилиться.',
    side: 'above',
  },
  {
    id: 'bright',
    anchor: { kind: 'canvas', key: 'brightest' },
    text: 'Яскраве: нове або критичне цього тижня.',
    side: 'right',
  },
  {
    id: 'hypothesis',
    anchor: { kind: 'canvas', key: 'hypothesis' },
    text: 'Пунктирний контур: гіпотеза, не факт. Обережно.',
    side: 'right',
  },
];

/** Точка анкора в координатах вікна. null, якщо елемента зараз немає. */
function resolveAnchor(anchor, canvasAnchors) {
  if (anchor.kind === 'dom') {
    const el = document.querySelector(anchor.selector);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) return null;
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height };
  }
  const a = canvasAnchors?.[anchor.key];
  const canvas = document.querySelector('.k-map__canvas');
  if (!a || !canvas) return null;
  const b = canvas.getBoundingClientRect();
  return { x: b.left + a.x, y: b.top + a.y, w: (a.r || 0) * 2, h: (a.r || 0) * 2 };
}

export default function CoachMarks({ getCanvasAnchors, onClose }) {
  const [points, setPoints] = useState([]);

  // Позиції рахуються після верстки і перераховуються на resize: мітка, що
  // з'їхала з елемента, гірша за відсутню.
  useLayoutEffect(() => {
    let raf = 0;
    const measure = () => {
      const canvasAnchors = getCanvasAnchors ? getCanvasAnchors() : {};
      setPoints(
        MARKS.map((m) => ({ ...m, at: resolveAnchor(m.anchor, canvasAnchors) }))
          .filter((m) => m.at)
      );
    };
    // Карта домальовує шар твіном, тому міряємо не в першому кадрі.
    const t = setTimeout(measure, 700);
    const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [getCanvasAnchors]);

  // Escape закриває мітки тільки тоді, коли вони справді на екрані. Без цієї
  // умови компонент, який нічого не показує (жодного анкора цього тижня), все
  // одно зʼїдав перше натискання: він оновлював стан App, App перерендерювався,
  // і його власний слухач знімався прямо під час розсилки цієї ж події.
  //
  // Коли мітки видимі, подія далі не йде: вони лежать поверх усього, тому
  // закривати заразом і те, що під ними, означало б два кроки на одну клавішу.
  //
  // Слухач стоїть на ФАЗІ ЗАХОПЛЕННЯ, і це не деталь. Мітки зʼявляються не
  // одразу, а коли порахуються анкори, тому їхній слухач реєструється ПІЗНІШЕ
  // за пріоритетний ланцюжок App. На фазі спливання це означало б, що ланцюжок
  // спрацював перший і встиг закрити те, що лежить під мітками: посилання на
  // досьє відкривалось, а перший же Escape гасив і мітки, і саме досьє.
  // Захоплення йде згори вниз, тому мітки бачать клавішу першими завжди.
  const visible = points.length > 0;
  useEffect(() => {
    if (!visible) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, visible]);

  if (!points.length) return null;

  return (
    <div className="k-coach" role="dialog" aria-label="як читати екран">
      {/* Завіса тільки приглушує, але не ховає інтерфейс: мітки пояснюють те,
          що під ними, тому воно мусить лишатись видимим. */}
      <div className="k-coach__veil" onClick={onClose} />

      <svg className="k-coach__lines" aria-hidden="true">
        {points.map((m) => {
          const label = labelBox(m);
          return (
            <line
              key={m.id}
              x1={label.lx}
              y1={label.ly}
              x2={m.at.x}
              y2={m.at.y}
              stroke="var(--a-cyan)"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.8"
            />
          );
        })}
      </svg>

      {points.map((m) => {
        const label = labelBox(m);
        return (
          <div
            key={m.id}
            className="k-coach__mark"
            style={{ left: label.left, top: label.top }}
          >
            {m.text}
          </div>
        );
      })}

      <div className="k-coach__done">
        <HudButton variant="primary" onClick={onClose}>ЗРОЗУМІЛО</HudButton>
      </div>
    </div>
  );
}

/**
 * Куди покласти саму мітку відносно анкора. Тримаємо її в межах вікна: мітка,
 * що вилізла за край, не пояснює нічого.
 */
function labelBox(m) {
  const W = 260;
  const GAP = 26;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left;
  let top;
  if (m.side === 'below') {
    left = m.at.x - W / 2;
    top = m.at.y + m.at.h / 2 + GAP;
  } else if (m.side === 'above') {
    left = m.at.x - W / 2;
    top = m.at.y - m.at.h / 2 - GAP - 44;
  } else {
    left = m.at.x + m.at.w / 2 + GAP;
    top = m.at.y - 22;
  }
  left = Math.max(12, Math.min(left, vw - W - 12));
  top = Math.max(12, Math.min(top, vh - 80));
  return { left, top, lx: left + W / 2, ly: top + 22 };
}

import React, { useEffect, useRef } from 'react';
import { layoutScalefield, coreRadius, CLUSTERS } from '../src/map/starfield.js';

/**
 * H4 · прев'ю карти ТЕМ, read-only.
 *
 * Розкладку рахує ТОЙ САМИЙ `layoutScalefield`, що й продукт: якщо тут тема
 * стоїть ліворуч, у випуску вона стоятиме там само. Власного макета тут немає
 * навмисно, бо прев'ю, яке рахує позиції по-своєму, гірше за відсутнє: воно
 * обіцяє те, чого не буде.
 *
 * Рушій `galaxy.js` не використовується: він читає тиждень із контракту через
 * селектори, а тут тиждень ще чернетка і в контракті його немає. Тому поле
 * збирається з чернетки руками, а малюється спрощено: прев'ю відповідає на
 * питання «де стануть теми», а не «як це виглядатиме на показі».
 */
export default function MapPreview({ draft }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !draft) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = 260;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const topics = (draft.topics || []).filter((t) => typeof t.tone_score === 'number');
    const stars = topics.map((t) => ({
      id: t.id,
      name: t.name || t.id,
      cluster: CLUSTERS.some((c) => c.id === t.aud) ? t.aud : 'both',
      tone: t.tone || 'mixed',
      trend: t.trend || 'flat',
      salience: typeof t.salience === 'number' ? t.salience : 1,
      toneScore: t.tone_score,
      links: [],
      rim: 'single',
      radius: coreRadius(t.salience),
      dominant: (t.salience || 0) >= 4,
      moons: [],
      loud: t.trend === 'new',
      phase: 0,
      exited: false,
      // Габарити підпису рендер рахує сам; тут даємо оцінку, щоб розкладка
      // мала з чим працювати.
      boxW: Math.max(coreRadius(t.salience) * 2, String(t.name || t.id).length * 6.2),
      labelH: 23,
      boxH: coreRadius(t.salience) * 2 + 23,
    }));

    const field = { weekId: draft.id, stars, exited: [], filaments: [] };
    layoutScalefield(field, { x: 10, y: 8, w: w - 20, h: h - 16 });

    // Вісь тону: та сама орієнтація, що в продукті.
    const ax = field.axis;
    ctx.strokeStyle = '#C9D3CF';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ax.x1, ax.y);
    ctx.lineTo(ax.x2, ax.y);
    ctx.stroke();
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = '#5A6A64';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText('ДЕСТРУКТИВ', ax.x1, ax.y + 6);
    ctx.textAlign = 'right';
    ctx.fillText('КОНСТРУКТИВ', ax.x2, ax.y + 6);

    field.stars.forEach((s) => {
      const neg = s.toneScore < 0;
      ctx.fillStyle = neg ? 'rgba(163,43,18,.75)' : 'rgba(30,107,51,.75)';
      ctx.beginPath();
      ctx.arc(s.tx, s.ty, Math.max(4, s.radius * 0.5), 0, Math.PI * 2);
      ctx.fill();

      if (s.labelMode !== 'dot') {
        ctx.fillStyle = '#16211D';
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(s.lines ? s.lines[0] : s.name, s.tx, s.ty + s.radius * 0.5 + 4);
      }
    });
  }, [draft]);

  if (!draft) return null;
  return (
    <div>
      <canvas ref={ref} className="i-prev" />
      <p className="i-note">
        Позиції рахує той самий модуль розкладки, що і випуск. Кольори і світіння
        тут спрощені: прев'ю відповідає на питання, де стануть теми.
      </p>
    </div>
  );
}

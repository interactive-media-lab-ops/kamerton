import React, { useCallback, useRef } from 'react';
import { Panel, HudButton } from 'astrolabe-ds';

/**
 * FloatingWindow: скляне вікно розділу поверх карти.
 * Тягнеться за заголовок, закривається хрестиком, при дотику виходить наперед.
 * Позицію тримає App, бо вікон кілька і порядок накладання спільний.
 */
export default function FloatingWindow({
  id,
  title,
  x,
  y,
  z,
  width = 420,
  out,
  head,
  onFocus,
  onClose,
  onMove,
  children,
}) {
  const dragRef = useRef(null);

  const onPointerDown = useCallback(
    (e) => {
      // тягнемо тільки за саму смугу заголовка, не за кнопку закриття
      if (e.target.closest('.a-btn')) return;
      onFocus && onFocus(id);
      dragRef.current = { dx: e.clientX - x, dy: e.clientY - y };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [id, x, y, onFocus]
  );

  const onPointerMove = useCallback(
    (e) => {
      const d = dragRef.current;
      if (!d) return;
      // не даємо витягнути вікно за межі екрана так, щоб заголовок став недосяжним
      const nx = Math.min(window.innerWidth - 120, Math.max(-width + 120, e.clientX - d.dx));
      const ny = Math.min(window.innerHeight - 60, Math.max(0, e.clientY - d.dy));
      onMove && onMove(id, nx, ny);
    },
    [id, width, onMove]
  );

  const endDrag = useCallback((e) => {
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  return (
    <section
      className={`k-win${out ? ' k-win--out' : ''}`}
      style={{ left: x, top: y, zIndex: z, width }}
      onPointerDown={() => onFocus && onFocus(id)}
      aria-label={title}
    >
      <Panel glass brackets>
        <div
          className="k-win__head"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span className="a-tab">{title}</span>
          {head}
          <div className="k-top__spacer" />
          <HudButton variant="ghost" aria-label={`закрити ${title}`} onClick={() => onClose(id)}>
            ✕
          </HudButton>
        </div>
        <div className="k-win__body">{children}</div>
      </Panel>
    </section>
  );
}

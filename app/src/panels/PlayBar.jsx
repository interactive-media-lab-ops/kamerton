import React, { useEffect, useRef } from 'react';
import { HudButton } from 'astrolabe-ds';
import { prefersReducedMotion } from '../data/thresholds.js';

/**
 * D1 · програвач.
 *
 * Смуга внизу екрана: поточний день, підпис тижня і контроли. Сам програвач
 * нічого не малює на карті, він рухає ту саму вісь часу, по якій читач ходить
 * руками, тому показ і жива робота це один екран.
 *
 * Головне на смузі це ДАТА. Вона і є доказ, що йде день за днем, а не стрибок
 * по тижнях: число змінюється рівно, поле рухається разом з ним.
 *
 * Клавіші: пробіл пауза, стрілки день назад і вперед, Esc вихід. На доповіді
 * руки зайняті вказівкою, і тягтись мишею до кнопки означає збити темп.
 */
export default function PlayBar({ frame, days, playing, onToggle, onStep, onExit }) {
  const stepRef = useRef(onStep);
  stepRef.current = onStep;

  useEffect(() => {
    const onKey = (e) => {
      // Пробіл на кнопці це її натискання, а не пауза показу. Раніше смуга
      // ковтала його глобально: кнопки переставали відповідати на Space, а
      // role="button" спрацьовував двічі.
      const t = e.target;
      if (t?.closest?.('button, [role="button"], input, select, textarea, [contenteditable]')) return;
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); onToggle(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); stepRef.current(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); stepRef.current(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onToggle]);

  if (!frame) return null;
  const last = frame.dayIndex >= days - 1;

  return (
    <div className="k-play" role="region" aria-label="показ корпусу">
      <div className="k-play__bar">
        <span className="k-play__pos">
          <b className="k-play__date">{frame.dateLabel}</b>
          <span className="k-note"> {frame.weekLabel} · індекс {frame.index.value}</span>
        </span>

        <span className="k-play__caption">{frame.caption}</span>

        <span className="k-row">
          <HudButton variant="ghost" aria-label="день назад" onClick={() => onStep(-1)}>◀</HudButton>
          <HudButton
            variant={playing ? 'ghost' : 'primary'}
            aria-label={playing ? 'пауза' : 'продовжити'}
            onClick={onToggle}
          >
            {playing ? 'ПАУЗА' : 'ПУСК'}
          </HudButton>
          <HudButton variant="ghost" aria-label="день вперед" onClick={() => onStep(1)}>▶</HudButton>
          {last && (
            <HudButton variant="ghost" aria-label="спочатку" onClick={() => onStep('restart')}>
              ПОВТОРИТИ
            </HudButton>
          )}
          <HudButton variant="ghost" aria-label="вийти з показу" onClick={onExit}>✕</HudButton>
        </span>
      </div>

      {/* Смужка часу днями, а не кроками: показ тепер неперервний, і поділка
          на ній це доба, а не екран. */}
      <div className="k-play__ticks" aria-hidden="true">
        <i className="k-play__fill" style={{ width: `${((frame.dayIndex + 1) / days) * 100}%` }} />
      </div>

      {/* Найважливіший рядок на цій смузі, і він не ховається ніколи.
          Вимірюються тижні, а не дні. Проміжні дні це інтерполяція між двома
          зрізами, тобто відповідь на питання «як поле рухалось», а не «що було
          у вівторок». Показувати плавний хід і мовчати про це означало б видати
          домальоване за виміряне, а весь продукт побудований проти саме цього. */}
      <div className="k-note k-play__honest">
        проміжні дні це інтерполяція між тижневими зрізами, не вимір
        {prefersReducedMotion() ? ' · спокійний режим: переходи миттєві' : ''}
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Інтро як у фільмі.
 *
 * Кадр нуль це голе небо тижня під розфокусом: зорі є, назв немає, осі немає,
 * панелей немає. Далі камера вʼїжджає крізь назву, і рівно в момент прольоту
 * поле стає різким. Інтерфейс повертається шарами вже після цього: спершу
 * підписи зір, потім розмітка, потім панелі.
 *
 * Порядок і таймінги живуть тут одним списком, тому їх видно з першого погляду
 * і неможливо випадково показати щось раніше за чергу.
 */
const STEPS = [
  { at: 0, phase: 'bare' },      // голе розфокусоване небо, назва проступає
  { at: 1100, phase: 'fly' },    // 600 поява + 500 пауза, далі проліт 1400
  { at: 2500, phase: 'labels' }, // фокус зійшовся, підписи зір хвилею
  { at: 3100, phase: 'axis' },   // вісь, шов, опори
  { at: 3300, phase: 'ui' },     // панелі стагером по 140
  { at: 4100, phase: 'done' },   // туторіал дозволений через 400 після останньої
];

export default function Intro({ onPhase, onDone }) {
  const [phase, setPhase] = useState('bare');
  const timers = useRef([]);
  const reduced = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  useEffect(() => {
    if (reduced) {
      // статика: ні розфокусу, ні польоту, тільки коротка пауза на назві
      onPhase('bare');
      timers.current.push(setTimeout(finish, 700));
      return () => timers.current.forEach(clearTimeout);
    }
    STEPS.forEach((s) => {
      timers.current.push(
        setTimeout(() => {
          if (s.phase === 'done') return finish();
          setPhase(s.phase);
          onPhase(s.phase);
        }, s.at)
      );
    });
    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finish() {
    timers.current.forEach(clearTimeout);
    setPhase('gone');
    onPhase('done');
    onDone();
  }

  if (phase === 'gone' || phase === 'ui') return null;

  // Назва живе рівно до кінця прольоту. Далі її не можна лишати в розмітці:
  // на зміні фази клас k-intro--fly знімається разом із анімацією, і тайтл
  // повернувся б у вихідний стан, тобто зʼявився б удруге.
  const titleVisible = phase === 'bare' || phase === 'fly';

  return (
    <div
      className={`k-intro k-intro--${phase}${reduced ? ' k-intro--calm' : ''}`}
      onClick={finish}
      role="button"
      tabIndex={0}
      aria-label="пропустити заставку"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') finish();
      }}
    >
      {titleVisible && (
        <div className="k-intro__center">
          <div className="k-intro__word">КАМЕРТОН</div>
          <div className="k-intro__sub">середовище звірки джерел</div>
        </div>
      )}
      <div className="k-intro__skip k-note">клік = пропустити</div>
    </div>
  );
}

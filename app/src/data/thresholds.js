// Єдиний вхід до порогів і таймінгів продукту.
//
// Раніше ці числа жили в трьох несумісних місцях: іменованими константами в
// selectors.js і ensemble.js, продубльованим DEFAULT_CONFIG (однакові значення
// в коді і в даних ховали правило старшинства) і магічними літералами прямо в
// компонентах. Тепер UI бере їх звідси, і поріг можна змінити, не чіпаючи код.
//
// Що сюди НЕ переїжджає: методологія розрахунків (індекс, сигма, ваги ансамблю,
// калібрування Brier). Її зміна поза скоупом спеки v2, тому математика лишається
// в ensemble.js. Тут тільки пороги показу і тайминги руху.

import cfg from './config/thresholds.json';

export const THRESHOLDS = cfg;

export const FIELD = cfg.field;
export const COMPASS = cfg.compass;
export const MAP_LIMITS = cfg.map;
export const MOTION = cfg.motion;
export const PRECEDENTS = cfg.precedents;
export const GRAVITON = cfg.graviton;

/**
 * Тривалість анімації з урахуванням системного налаштування.
 * prefers-reduced-motion дає нуль: кінцевий стан ідентичний, шлях до нього миттєвий.
 */
export function motionMs(key) {
  const base = cfg.motion[key];
  if (typeof base !== 'number') return 0;
  return prefersReducedMotion() ? 0 : base;
}

export function prefersReducedMotion() {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { kamertonIndex, kamertonIndexSeries, shortWeek } from '../data/selectors.js';

/**
 * Камертон-індекс: єдина герой-цифра застосунку.
 *
 * Число це зважене середнє позицій тем на шкалі деструктив-конструктив, 0..100.
 * Воно квантифікує те, що вже показане на осі карти позначкою «центр поля»:
 * той самий факт, але числом, яке можна порівняти з минулим тижнем.
 *
 * Це міра корпусу висловлювань, а не настрою людей, тому підпис каже саме
 * «тон поля»: ми міряємо те, що сказано, а не тих, хто говорить.
 */

const DESTR = [219, 91, 60];   // --a-destr
const CONSTR = [143, 227, 154]; // --a-constr
const MUT = [143, 180, 166];    // --a-text-mut

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

/**
 * Колір числа береться з тієї самої шкали, що фарбує вісь: ліворуч теплий
 * деструктив, праворуч холодний конструктив, посередині нейтральний.
 * Читач бачить колір раніше, ніж встигає прочитати цифру.
 */
function toneColor(value) {
  const t = Math.min(1, Math.max(0, (value ?? 50) / 100));
  // Крива, а не пряма: на лінійному змішуванні 33 виходило майже нейтральним,
  // хоч це виразно деструктивна половина шкали. Полюси тримають колір довше,
  // нейтральним лишається тільки те, що справді біля пʼятдесяти.
  const ease = (x) => Math.pow(Math.min(1, Math.max(0, x)), 1.7);
  return t < 0.5 ? mix(DESTR, MUT, ease(t * 2)) : mix(MUT, CONSTR, ease((t - 0.5) * 2));
}

/** Лічильник від нуля до значення. Поважає prefers-reduced-motion. */
function useCountUp(target, ms = 800) {
  const [shown, setShown] = useState(target ?? 0);
  const fromRef = useRef(target ?? 0);
  useEffect(() => {
    if (target === null || target === undefined) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // ms === 0 це показ: там число і так змінюється щодня, а лічильник поверх
    // денного ходу давав розбіжність з тим самим числом на смузі показу.
    if (reduced || ms <= 0) { setShown(target); fromRef.current = target; return undefined; }
    const from = fromRef.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(lerp(from, target, e)));
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(step);
    // Страховка на випадок, коли кадри не йдуть узагалі: у фоновій вкладці
    // requestAnimationFrame заморожений, і без цього таймера число застрягло б
    // на минулому тижні, поки читач не поверне вкладку. Анімація це прикраса,
    // а правильне значення це зміст, і воно не має від неї залежати.
    const guard = setTimeout(() => { setShown(target); fromRef.current = target; }, ms + 120);
    return () => { cancelAnimationFrame(raf); clearTimeout(guard); };
  }, [target, ms]);
  return shown;
}

function Sparkline({ series, activeId }) {
  if (series.length < 2) return null;
  const W = 72;
  const H = 20;
  const vals = series.map((s) => s.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const pts = series.map((s, i) => [
    (i / (series.length - 1)) * W,
    H - ((s.value - lo) / span) * (H - 4) - 2,
  ]);
  const last = pts[pts.length - 1];
  return (
    <svg className="k-hero__spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" strokeWidth="1" />
      <circle cx={last[0]} cy={last[1]} r="2.2" />
    </svg>
  );
}

export default function HeroIndex({ weekId, liveValue }) {
  const [open, setOpen] = useState(false);
  const week = useMemo(() => kamertonIndex(weekId), [weekId]);
  const series = useMemo(() => kamertonIndexSeries(weekId), [weekId]);

  // Під час показу число бере значення поточного ДНЯ, а не тижня. Інакше на
  // одному екрані стояли б два різні індекси: тижневий у шапці і денний на
  // смузі. Правило B7 про одне число не має винятку для показу.
  const k = liveValue == null ? week : { ...week, value: liveValue };
  const shown = useCountUp(k.value, liveValue == null ? 800 : 0);

  if (k.value === null) return null;

  const color = rgb(toneColor(k.value));
  const prev = k.delta === null ? null : k.value - k.delta;
  const up = (k.delta ?? 0) > 0;
  const flat = (k.delta ?? 0) === 0;

  return (
    <div className="k-hero">
      <button
        type="button"
        className="k-hero__main"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="як рахується індекс"
      >
        <span className="k-hero__label">ІНДЕКС ТОНУ ПОЛЯ</span>

        <span
          className="k-hero__num"
          style={{ color, '--k-hero-glow': color }}
        >
          {shown}
        </span>

        {/* Мікрошкала: та сама градієнтна лінійка, що під картою. Суцільний тік
            це цей тиждень, напівпрозорий привид це минулий. */}
        <span className="k-hero__scale" aria-hidden="true">
          {prev !== null && (
            <i className="k-hero__ghost" style={{ left: `${prev}%` }} />
          )}
          <i className="k-hero__tick" style={{ left: `${k.value}%`, background: color }} />
        </span>
      </button>

      <div className="k-hero__side">
        {k.delta !== null && (
          <span className={`k-hero__delta ${up ? 'is-up' : flat ? 'is-flat' : 'is-down'}`}>
            {/* Нуль позначається крапкою, а не тире: довгих тире в інтерфейсі
                немає за правилом 8, і це було останнє в збірці. */}
            {flat ? '·' : up ? '▲' : '▼'} {flat ? '0' : Math.abs(k.delta)}
          </span>
        )}
        <span className="k-hero__sigma" title={`зважене відхилення позицій тем: ${k.sigma}`}>
          σ {k.sigma}
          {k.polarized && <b> · поляризоване</b>}
        </span>
        <Sparkline series={series} activeId={weekId} />
      </div>

      {open && (
        <div className="k-hero__method">
          <div className="k-hero__formula">
            індекс = Σ(вага · позиція) / Σвага
          </div>
          <p className="k-note">
            Позиція теми на шкалі 0..100, де 0 це повний деструктив, 50 нейтраль,
            100 повний конструктив. Вага це та сама величина, що задає розмір
            вузла на карті. Теми, що вийшли з поля, не рахуються. Шкала
            абсолютна, а не по краях наявних даних, щоб тижні можна було
            порівнювати між собою.
          </p>
          <table className="k-hero__table">
            <thead>
              <tr><th>тема</th><th>вага</th><th>позиція</th></tr>
            </thead>
            <tbody>
              {k.rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.w}</td>
                  <td style={{ color: rgb(toneColor(r.p)) }}>{r.p}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>{shortWeek(weekId)} · зважене середнє</td>
                <td>{k.weightSum}</td>
                <td>{k.mean}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

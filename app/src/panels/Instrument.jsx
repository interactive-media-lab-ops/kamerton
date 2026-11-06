import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * КОМПАС · прилад-шкала.
 *
 * Один компонент на всі інстанси: повний прилад у картці, компактний у
 * розвʼязаному ринку, міні-шкала в реєстрі і спарклайн історії в геро-зоні.
 * Різниця тільки в розмірах і в тому, які шари вмикаються.
 *
 * Все малюється в реальних пікселях: ширина міряється ResizeObserver, а не
 * розтягується через preserveAspectRatio. Розтягнутий viewBox сплющив би
 * ромб і голку, а тут це носії змісту, а не декор.
 *
 * Рухаються тільки transform і opacity: позиції маркерів переїжджають
 * трансформом, тому переїзд не викликає перерахунку розкладки.
 */

const V = {
  full: { h: 64, band: 34, tick: 9, needle: 3, san: 13, dot: 6, ticks: [0, 25, 50, 75, 100] },
  compact: { h: 40, band: 20, tick: 6, needle: 2.5, san: 10, dot: 5, ticks: [0, 50, 100] },
  mini: { h: 22, band: 12, tick: 0, needle: 2, san: 7, dot: 4, ticks: [] },
  spark: { h: 36, band: 0, tick: 0, needle: 0, san: 0, dot: 0, ticks: [] },
};

/** Ширина в пікселях, без якої не намалювати нерозтягнутий SVG. */
function useWidth(ref, fallback = 320) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => {
      const next = Math.round(e.contentRect.width);
      if (next > 0) setW(next);
    });
    ro.observe(el);
    setW(Math.round(el.getBoundingClientRect().width) || fallback);
    return () => ro.disconnect();
  }, [ref, fallback]);
  return w;
}

/** Крива історії як замкнена область під лінією. */
function historyPath(history, w, h, pad = 0) {
  const pts = (history || []).filter((s) => Number.isFinite(s.p_ensemble));
  if (pts.length < 2) return null;
  const x = (i) => (i / (pts.length - 1)) * w;
  const y = (p) => pad + (1 - p) * (h - pad * 2);
  const line = pts.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.p_ensemble).toFixed(1)}`).join('');
  return { line, area: `${line}L${w},${h}L0,${h}Z` };
}

export default function Instrument({
  variant = 'full',
  agg,
  san,
  history,
  ghost = null,        // привид: консенсус на момент заморозки або прев'ю ставки
  ghostLabel = null,
  mine = null,         // власна голка оцінювача: {p, callsign}
  interactive = false,
  onPick = null,
  className = '',
}) {
  const box = useRef(null);
  const w = useWidth(box);
  const cfg = V[variant] || V.full;
  const h = cfg.h;
  const uid = useRef(`ins${Math.random().toString(36).slice(2, 8)}`).current;

  const toX = (p) => (p == null ? null : p * w);
  const mid = h / 2;
  const bandTop = mid - cfg.band / 2;

  const ens = agg?.p_ensemble ?? null;
  const med = agg?.p_humans_median ?? null;
  const spread = agg?.spread_p10_p90 || null;
  const hist = historyPath(history, w, variant === 'spark' ? h : cfg.band, 3);

  const pick = useCallback(
    (e) => {
      if (!interactive || !onPick) return;
      const r = box.current.getBoundingClientRect();
      const p = Math.min(0.98, Math.max(0.02, (e.clientX - r.left) / r.width));
      onPick(Math.round(p * 100) / 100);
    },
    [interactive, onPick]
  );

  const drag = useCallback(
    (e) => {
      if (!interactive) return;
      pick(e);
      const move = (ev) => pick(ev);
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [interactive, pick]
  );

  return (
    <div
      ref={box}
      className={`k-ins k-ins--${variant} ${interactive ? 'is-live' : ''} ${className}`}
      onPointerDown={drag}
    >
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-hidden="true">
        <defs>
          {/* Штрихування зони розходження: той самий сканлайн, що і в тлі рами. */}
          <pattern id={`${uid}h`} width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--a-brass)" strokeWidth="2" opacity="0.55" />
          </pattern>
          <linearGradient id={`${uid}g`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--a-cyan)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--a-cyan)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* 1. фон-історія: де ми і як сюди прийшли */}
        {hist && (
          <g transform={`translate(0, ${variant === 'spark' ? 0 : bandTop})`}>
            <path d={hist.area} fill={`url(#${uid}g)`} />
            <path
              d={hist.line}
              fill="none"
              stroke={variant === 'spark' ? 'var(--a-brass)' : 'var(--a-cyan)'}
              strokeWidth="1"
              opacity={variant === 'spark' ? 0.9 : 0.35}
            />
          </g>
        )}

        {variant !== 'spark' && (
          <>
            {/* 2. тіки: 50 помітніший за решту */}
            {cfg.ticks.map((t) => (
              <g key={t}>
                <line
                  x1={toX(t / 100)} x2={toX(t / 100)}
                  y1={bandTop - cfg.tick} y2={bandTop + cfg.band + cfg.tick}
                  stroke="var(--a-line)" strokeWidth={t === 50 ? 1 : 0.6}
                  opacity={t === 50 ? 0.7 : 0.35}
                />
                {variant === 'full' && (
                  <text
                    x={toX(t / 100)} y={h - 1}
                    textAnchor={t === 0 ? 'start' : t === 100 ? 'end' : 'middle'}
                    className="k-ins__tick"
                  >
                    {t}
                  </text>
                )}
              </g>
            ))}

            {/* сама смуга приладу */}
            <rect
              x="0" y={bandTop} width={w} height={cfg.band}
              fill="rgba(20,48,42,0.35)" stroke="var(--a-line-dim)" strokeWidth="1"
            />

            {/* 3. розкид p10..p90 */}
            {spread && (
              <rect
                x={toX(spread[0])} y={bandTop}
                width={Math.max(1, toX(spread[1]) - toX(spread[0]))} height={cfg.band}
                fill="rgba(99,230,200,0.14)" stroke="rgba(99,230,200,0.4)" strokeWidth="1"
              />
            )}

            {/* 7. зона розходження: між моделлю і панеллю */}
            {agg?.divergence_flag && san != null && med != null && (
              <rect
                className="k-ins__diverge"
                x={Math.min(toX(san), toX(med))} y={bandTop}
                width={Math.abs(toX(san) - toX(med))} height={cfg.band}
                fill={`url(#${uid}h)`}
              />
            )}

            {/* привид: консенсус на момент заморозки або прев'ю нової ставки */}
            {ghost != null && (
              <g className="k-ins__ghost" style={{ transform: `translateX(${toX(ghost)}px)` }}>
                <line x1="0" x2="0" y1={bandTop} y2={bandTop + cfg.band}
                  stroke="var(--a-text-mut)" strokeWidth={cfg.needle} strokeDasharray="3 3" opacity="0.75" />
              </g>
            )}

            {/* 6. медіана панелі */}
            {med != null && (
              <g className="k-ins__mark" style={{ transform: `translateX(${toX(med)}px)` }}>
                <circle cx="0" cy={mid} r={cfg.dot / 2} fill="var(--a-text-dim)" stroke="var(--a-bg)" strokeWidth="1" />
              </g>
            )}

            {/* 5. модель: ромб посаджений на смугу, не в повітрі */}
            {san != null && (
              <g className="k-ins__mark" style={{ transform: `translateX(${toX(san)}px)` }}>
                <rect
                  x={-cfg.san / 2} y={mid - cfg.san / 2} width={cfg.san} height={cfg.san}
                  transform={`rotate(45 0 ${mid})`}
                  fill="var(--a-bg-raised)" stroke="var(--a-text-mut)" strokeWidth="1.2"
                />
                {variant === 'full' && (
                  <text x="0" y={bandTop + cfg.band + 10} textAnchor="middle" className="k-ins__san-lb">САН</text>
                )}
              </g>
            )}

            {/* власна голка оцінювача */}
            {mine?.p != null && (
              <g className="k-ins__mark" style={{ transform: `translateX(${toX(mine.p)}px)` }}>
                <line x1="0" x2="0" y1={bandTop - 2} y2={bandTop + cfg.band + 2}
                  stroke="var(--a-cyan)" strokeWidth={cfg.needle} />
                {variant === 'full' && mine.callsign && (
                  <text x="4" y={bandTop - 4} className="k-ins__mine-lb">{mine.callsign}</text>
                )}
              </g>
            )}

            {/* 4. консенсус: найважчий елемент шкали */}
            {ens != null && (
              <g className="k-ins__mark k-ins__needle" style={{ transform: `translateX(${toX(ens)}px)` }}>
                <line x1="0" x2="0" y1={bandTop - cfg.tick} y2={bandTop + cfg.band + cfg.tick}
                  stroke="var(--a-brass)" strokeWidth={cfg.needle} />
                <polygon
                  points={`0,${bandTop - cfg.tick} -5,${bandTop - cfg.tick - 7} 5,${bandTop - cfg.tick - 7}`}
                  fill="var(--a-brass)"
                />
              </g>
            )}
          </>
        )}
      </svg>

      {ghostLabel && <span className="k-ins__ghost-lb" style={{ left: `${(ghost || 0) * 100}%` }}>{ghostLabel}</span>}
      {agg?.divergence_flag && variant === 'full' && san != null && med != null && (
        <span
          className="k-ins__diverge-lb"
          style={{ left: `${((Math.min(san, med) + Math.max(san, med)) / 2) * 100}%` }}
        >
          розходження {agg.divergence_pp} п.п.
        </span>
      )}
    </div>
  );
}

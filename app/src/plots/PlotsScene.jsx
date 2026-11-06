import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import PlotStar from './PlotStar.jsx';
import PlotZoom from './PlotZoom.jsx';
import { DUST, DUST_TILE, NOISE } from './dust.js';
import { plotField, plotScene } from '../data/selectors.js';
import { prefersReducedMotion } from '../data/thresholds.js';

/**
 * Сцена шару СЮЖЕТИ.
 *
 * Це НЕ перефарбована карта ТЕМ, як було в першій редакції шару, і це рішення
 * замовника, а не смак виконавця: СЮЖЕТИ це інший режим сприйняття. ТЕМИ дають
 * дані, досьє і тональність; СЮЖЕТИ дають історію і сцену. Тому в них своя
 * атмосфера, своє поле і зум-сцена замість панелі досьє.
 *
 * Практичний наслідок: тонової осі, шкали поля, ниток і тональних кольорів тут
 * немає. Червоний і зелений заборонені на вкладці повністю, а вони і є мова
 * карти ТЕМ, тож спільне полотно означало б порушення заборони в перший же
 * кадр.
 *
 * Розкладка поля детермінована: клітинки сортуються за відстанню від центра,
 * вузли за вагою уваги, тому найважчі зорі сідають ближче до середини, а сама
 * розкладка не стрибає між рендерами і однакова на всіх машинах.
 */

/** Стабільний дріб з рядка: джиттер клітинки має бути той самий щоразу. */
function hash01(str, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * Розкладка поля.
 *
 * Рахується від РЕАЛЬНОГО розміру сцени, а не від кореня з кількості вузлів.
 * Перша редакція брала cols = sqrt(n * 1.7) і на сцені 1240x355 давала три
 * ряди по 118 px при висоті вузла 168 px: підписи лягали на чужі кільця за
 * побудовою, і жодне зменшення джиттера цього не рятувало.
 *
 * Тепер спершу рахується, скільки рядів фізично влазить, і тільки потім
 * скільки колонок під них треба. Джиттер живе рівно у вільному місці клітинки,
 * тому наїзд неможливий, поки вузли взагалі влазять; коли не влазять (широкий
 * тиждень на вузькому екрані), джиттер сам стає нулем.
 *
 * Порядок детермінований: важчі зорі сідають ближче до центра, дріб з хешу id
 * той самий на всіх машинах і між рендерами.
 */
function layout(nodes, size) {
  const n = nodes.length;
  if (!n) return [];
  const W = Math.max(320, size.w || 1240);
  const H = Math.max(220, size.h || 360);
  // Габарит вузла: поле зору морфології плюс два рядки підпису.
  const boxW = (node) => Math.max(8.4 * node.r, 148);
  const boxH = (node) => 8.4 * node.r + 34;
  const maxW = Math.max(...nodes.map(boxW));
  const maxH = Math.max(...nodes.map(boxH));

  const rows = Math.max(1, Math.min(n, Math.floor(H / maxH)));
  const cols = Math.ceil(n / rows);
  const cellW = W / cols;
  const cellH = H / rows;
  // Вільне місце клітинки і є вся амплітуда джиттера. Нуль вільного місця це
  // чесна сітка без розкиду, а не наїзд.
  const freeX = Math.max(0, (cellW - maxW) / 2) * 0.8;
  const freeY = Math.max(0, (cellH - maxH) / 2) * 0.8;

  const cells = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = (c + 0.5) / cols;
      const y = (r + 0.5) / rows;
      cells.push({ x, y, d: (x - 0.5) ** 2 + ((y - 0.5) * 1.25) ** 2 });
    }
  }
  cells.sort((a, b) => a.d - b.d || a.x - b.x);
  const order = [...nodes].sort((a, b) => b.r - a.r || a.id.localeCompare(b.id));
  return order.map((node, i) => {
    const cell = cells[i];
    return {
      ...node,
      x: cell.x + ((hash01(node.id, 1) - 0.5) * 2 * freeX) / W,
      y: cell.y + ((hash01(node.id, 7) - 0.5) * 2 * freeY) / H,
    };
  });
}

export default function PlotsScene({ weekId, zoomId, onZoom, onOpenDossier }) {
  const hostRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const parallax = useRef({ tx: 0, ty: 0, x: 0, y: 0, raf: 0 });
  const [tip, setTip] = useState(null);
  const tipRef = useRef(null);
  // Зоря, з якої щойно вийшли: тримає бурштинову обвідку 2 с після повернення.
  const [back, setBack] = useState(null);

  // Сцена, що зараз малюється, живе окремо від пропа: вихід має програти свої
  // 450 мс і тоді зникнути. Esc приходить з App і теж має право на цей вихід,
  // інакше клавіатурний користувач отримував би стрибок замість відʼїзду камери.
  const [live, setLive] = useState(zoomId || null);
  const [leaving, setLeaving] = useState(false);

  const nodes = useMemo(() => layout(plotField(weekId), size), [weekId, size.w, size.h]);
  const scene = useMemo(() => (live ? plotScene(live, weekId) : null), [live, weekId]);
  const zoomNode = live ? nodes.find((x) => x.id === live) : null;

  useEffect(() => {
    if (zoomId) { setLive(zoomId); setLeaving(false); return undefined; }
    if (!live) return undefined;
    setLeaving(true);
    // Обвідка «звідси ти вийшов» рахує свої дві секунди від моменту, коли
    // камера вже вдома, а не від початку відʼїзду: інакше третину часу вона
    // світила б під завісою, і читач її просто не побачив би.
    const t = setTimeout(() => { setLive(null); setLeaving(false); setBack(live); }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomId]);

  // Сцена ділить місце з панелями і HUD, тому її розмір змінюється не тільки
  // від вікна. ResizeObserver дешевший і чесніший за слухача resize: він ловить
  // і згортання панелі, і зміну щільності.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => {
      const b = e.contentRect;
      setSize((s) => (Math.abs(s.w - b.width) > 4 || Math.abs(s.h - b.height) > 4
        ? { w: b.width, h: b.height } : s));
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  /* Паралакс ближнього шару: lerp з коефіцієнтом 0.05 на кадр, ніяких ривків.
     Пишемо дві змінні на корені сцени, решту множників розводить CSS: глибина
     передається різницею амплітуд, а не окремими слухачами на кожен шар. */
  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const host = hostRef.current;
    if (!host) return undefined;
    const p = parallax.current;
    const onMove = (e) => {
      const b = host.getBoundingClientRect();
      p.tx = ((e.clientX - b.left) / b.width - 0.5) * 12;
      p.ty = ((e.clientY - b.top) / b.height - 0.5) * 12;
    };
    const tick = () => {
      p.x += (p.tx - p.x) * 0.05;
      p.y += (p.ty - p.y) * 0.05;
      host.style.setProperty('--par-x', `${p.x.toFixed(2)}px`);
      host.style.setProperty('--par-y', `${p.y.toFixed(2)}px`);
      p.raf = requestAnimationFrame(tick);
    };
    host.addEventListener('pointermove', onMove);
    p.raf = requestAnimationFrame(tick);
    return () => {
      host.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(p.raf);
    };
  }, []);

  useEffect(() => {
    if (!back) return undefined;
    const t = setTimeout(() => setBack(null), 2000);
    return () => clearTimeout(t);
  }, [back]);

  /**
   * Куди стати тултіпу. Бажана позиція це центр зорі; притискання до кадру
   * рахується вже ПІСЛЯ рендера, у tipClamp, бо до нього невідома справжня
   * ширина: тултіп порожнього кільця з причиною зрізання удвічі ширший за
   * звичайний, і будь-яка напівширина «на око» або пускала широкий за край,
   * або зсувала вузький там, де він і так вміщався.
   */
  const tipAt = (el, node, box) => {
    const top = el.offsetTop - box / 2 - 8;
    return {
      node,
      x: el.offsetLeft,
      // Зверху не влазить: перевертаємо під зорю замість того, щоб зрізати.
      below: top < 96,
      y: top < 96 ? el.offsetTop + box / 2 + 8 : top,
    };
  };

  // Притискання до кадру по справжній ширині, до першого кадру на екрані.
  useLayoutEffect(() => {
    const el = tipRef.current;
    const host = hostRef.current;
    if (!el || !host || !tip) return;
    const W = host.clientWidth;
    const half = el.offsetWidth / 2 + 8;
    el.style.left = `${Math.round(Math.max(half, Math.min(tip.x, W - half)))}px`;
  }, [tip]);

  const closeZoom = () => onZoom(null);

  return (
    <div className="k-syuzh" ref={hostRef} style={{ '--syuzh-noise': NOISE }}>
      {/* Шар 1: зоряний пил. Одна плитка, два проходи, безшовний цикл. */}
      <div className="k-syuzh__dust" style={{ backgroundImage: DUST, backgroundSize: DUST_TILE }} />

      {/* Шар 2: туманності. Ходять у протилежний бік до пилу і дихають. */}
      <div className="k-syuzh__grain" aria-hidden="true" />

      <div className="k-syuzh__nebs" aria-hidden="true">
        <div className="k-syuzh__neb k-syuzh__neb--1" />
        <div className="k-syuzh__neb k-syuzh__neb--2" />
        <div className="k-syuzh__neb k-syuzh__neb--3" />
      </div>

      {/* Шар 3: контент, найменша амплітуда паралаксу. Він же камера: під час
          входу в сцену все поле зумиться з центром у вибраній зорі, тому зоря
          не «телепортується», а виростає в сцену. */}
      <div
        className={`k-syuzh__parallax${live && !leaving ? ' is-zooming' : ''}${leaving ? ' is-back-out' : ''}`}
        style={zoomNode ? { '--zx': `${(zoomNode.x * 100).toFixed(2)}%`, '--zy': `${(zoomNode.y * 100).toFixed(2)}%` } : undefined}
      >
        {nodes.map((node) => {
          const box = 4.2 * node.r * 2;
          return (
            <button
              key={node.id}
              type="button"
              className={`k-syuzh__node${back === node.id && !live ? ' is-back' : ''}${live === node.id ? ' is-hero' : ''}`}
              style={{ left: `${(node.x * 100).toFixed(2)}%`, top: `${(node.y * 100).toFixed(2)}%` }}
              onMouseEnter={(e) => setTip(tipAt(e.currentTarget, node, box))}
              onMouseLeave={() => setTip(null)}
              onFocus={(e) => setTip(tipAt(e.currentTarget, node, box))}
              onBlur={() => setTip(null)}
              onClick={() => { setTip(null); onZoom(node.id); }}
              aria-label={`${node.name}${node.plot ? '' : ` · ${node.cut}`}`}
            >
              <span
                className="k-syuzh__halo"
                style={{ '--halo-d': `${(node.r * 2.9).toFixed(0)}px`, '--halo-top': `${(box / 2 - node.r * 1.45).toFixed(0)}px` }}
              />
              <PlotStar plot={node.plot} secondary={node.secondary} r={node.r} />
              <span className="k-syuzh__name">{node.name}</span>
            </button>
          );
        })}

        {tip && (
          /* Тултіп притиснутий до кадру і перевертається під зорю, коли зверху
             місця немає. Без цього широкий тултіп порожнього кільця з причиною
             зрізання виїжджав за лівий край, і читач бачив обрізані рядки саме
             там, де вкладка пояснює свою тишу. */
          <div
            className={`k-syuzh__tip${tip.below ? ' k-syuzh__tip--below' : ''}`}
            ref={tipRef}
            style={{ left: tip.x, top: tip.y }}
            role="tooltip"
          >
            {tip.node.name}
            {/* Порожнє кільце пояснює себе саме: причина зрізання або чесне
                «розмітки немає». Без цього рядка воно читалось би як баг. */}
            {!tip.node.plot && <span className="k-syuzh__tip-why">{tip.node.cut}</span>}
            {tip.node.draft && <span className="k-syuzh__draft">чернетка до узгодження</span>}
          </div>
        )}
      </div>

      {scene && (
        <PlotZoom
          scene={scene}
          node={zoomNode}
          leaving={leaving}
          onClose={closeZoom}
          onOpenDossier={onOpenDossier}
        />
      )}
    </div>
  );
}

/* Зоряний пил переїхав у ./dust.js: та сама плитка потрібна і зум-сцені, а дві
   копії того самого data-URI розійшлися б на першій же правці щільності. */

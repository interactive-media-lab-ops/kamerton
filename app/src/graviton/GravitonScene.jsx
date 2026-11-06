import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  gravitonField, gravitonBody, gravitonExpansion, plotLegend, listWeeks,
} from '../data/selectors.js';
import { GRAVITON, prefersReducedMotion } from '../data/thresholds.js';
// Небо спільне з вкладкою СЮЖЕТИ навмисно: плитка пилу живе одним модулем,
// щоб сцени продукту не розійшлися різними небесами.
import { DUST, DUST_TILE, NOISE } from '../plots/dust.js';

/**
 * Сцена шару ГРАВІТОН (назва власника, 18.08.2026), редакція 3.
 *
 * Геометрія і є модель: центр це ядро культурної ідентичності, радіус це
 * культурна дистанція (проксі v1), сектори це шість архетипних сюжетів для
 * РОЗМІЧЕНИХ тіл, гало по всьому колу це тіла без сюжету. Сцена несе
 * постійний банер «модельна проєкція».
 *
 * Рух (наказ власника, третій показ: «рух, анімація, фон, паралакси»):
 *  - орбітальний дрейф гало за третім законом Кеплера: T пропорційний
 *    D^1.5, тобто ближче до ядра швидше. Час тут модельна декорація, і
 *    легенда каже це прямо;
 *  - розмічені тіла НЕ покидають свій сектор: вони лібрують усередині нього
 *    з кеплерівським періодом, бо кут для них це семантика;
 *  - частинки акреції течуть уздовж звʼязку в напрямку живлення (у контракті
 *    звʼязок так і записаний: «X живить Y»), темп від сили;
 *  - тремтіння тіла це ВИМІРЯНА ентропія: амплітуда від волатильності тону;
 *  - хвіст за тілом показує швидкість дрейфу.
 *
 * prefers-reduced-motion зупиняє годинник сцени повністю: кадр той самий,
 * рух нульовий, жодних втрат змісту.
 */

/** Стабільний дріб з рядка: той самий на всіх машинах і між рендерами. */
function hash01(str, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * Далекий шар яскравіших зір. Окрема плитка, а не густіший пил: глибина
 * читається тоді, коли шари відрізняються і розміром зерна, і темпом
 * паралакса. Детерміновано, як плитка пилу в plots/dust.js.
 */
const FAR_STARS = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="540">${
    Array.from({ length: 13 }, (_, i) => {
      const x = (hash01(`g${i}`, 5) * 820).toFixed(1);
      const y = (hash01(`g${i}`, 13) * 540).toFixed(1);
      const r = (0.7 + hash01(`g${i}`, 19) * 1.4).toFixed(2);
      const o = (0.2 + hash01(`g${i}`, 31) * 0.4).toFixed(3);
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="#DFF7EE" opacity="${o}"/>`;
    }).join('')
  }</svg>`
)}")`;

const RES_WORD = {
  none: 'розмітки немає',
  cut: 'сюжет зрізано: поле промовчало',
  single: 'один сюжет',
  contested: 'сюжети конкурують',
};

const RISK_WORD = {
  high: 'високий: резонанс, мала дистанція, вага росте',
  moderate: 'помірний: частина умов переходу вже є',
  low: 'низький: резонанс є, умов переходу немає',
  none: 'немає: тема не зчеплена з ядром',
};

const DEG = Math.PI / 180;

/**
 * Третій закон Кеплера, натхнення без буквальності: кутова швидкість
 * пропорційна r^-1.5. Калібровано так, щоб тіло на радіусі 300px робило
 * оберт приблизно за чотири хвилини: рух видно, але він не смикає око.
 */
const KEPLER_K = 7800;
const angularSpeed = (r) => KEPLER_K / Math.max(80, r) ** 1.5;

/** Статична розкладка: базові кути, радіуси і межі секторів. */
function layout(bodies, legend, size) {
  const w = Math.max(480, size.w || 1240);
  const h = Math.max(360, size.h || 520);
  const cx = w / 2;
  const cy = h / 2 + 8;
  const R0 = 76;
  const Rmax = Math.min(w, h) / 2 - 44;
  // Еліптична розгортка: поле розтягується на ширину екрана, як диск
  // галактики, побачений під кутом. Вертикаль лишається чесним радіусом.
  const kx = Math.max(1, Math.min(2.05, (w / 2 - 80) / Rmax));
  const sectorIndex = new Map(legend.map((p, i) => [p.id, i]));
  const wedge = 360 / Math.max(1, legend.length);
  const sectorStart = (i) => -90 + i * wedge;

  // Коренева радіальна шкала: дистанції тижня туляться до ядра (0.1..0.5),
  // і лінійна шкала лишала зовнішні дві третини поля порожніми. Корінь
  // розтягує внутрішню зону і стискає порожню периферію. Шкала оголошена
  // в легенді: це та сама чесність, що й логарифмічна вісь на графіку.
  const radial = (D) => {
    const nd = Math.max(0, Math.min(1, (D - 0.1) / 0.9));
    return R0 + Math.sqrt(nd) * (Rmax - R0);
  };

  const placed = [];
  const groups = new Map();
  const halo = [];
  bodies.forEach((b) => {
    if (b.resonance?.plot && sectorIndex.has(b.resonance.plot)) {
      const key = sectorIndex.get(b.resonance.plot);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(b);
    } else halo.push(b);
  });

  groups.forEach((list, key) => {
    const start = sectorStart(key);
    const sorted = [...list].sort(
      (a, b) => a.distance.value - b.distance.value || a.id.localeCompare(b.id)
    );
    sorted.forEach((b, i) => {
      placed.push({
        ...b,
        base: start + (wedge * (i + 1)) / (sorted.length + 1),
        libration: Math.max(3, wedge / 2 - 10),
        free: false,
        r: radial(b.distance.value) + (hash01(b.id, 3) - 0.5) * 10,
        px: 7 + (b.mass?.value ?? 0.4) * 13,
        phase: hash01(b.id, 29) * 360,
      });
    });
  });

  // Гало: золотий кут дає рівний розподіл, напрямок обертання спільний,
  // бо поле це один потік, а не броунівська каша.
  [...halo].sort((a, b) => a.id.localeCompare(b.id)).forEach((b, i) => {
    placed.push({
      ...b,
      base: (hash01(b.id, 17) * 360 + i * 137.508) % 360,
      libration: 0,
      free: true,
      r: radial(b.distance.value) + (hash01(b.id, 3) - 0.5) * 10,
      px: 7 + (b.mass?.value ?? 0.4) * 13,
      phase: hash01(b.id, 29) * 360,
    });
  });

  // Течія поля: дрібні частинки, що повільно обертаються за Кеплером по
  // всій сцені. Не дані, а середовище: показують, що поле це потік, і
  // заповнюють простір між тілами. Детерміновано, як увесь шар.
  const ambient = Array.from({ length: 46 }, (_, i) => ({
    rr: R0 * 0.7 + hash01(`amb${i}`, 7) ** 0.75 * (Rmax * 1.06 - R0 * 0.7),
    base: hash01(`amb${i}`, 11) * 360,
    size: 0.7 + hash01(`amb${i}`, 23) * 1.2,
    op: 0.1 + hash01(`amb${i}`, 41) * 0.3,
  }));

  return {
    nodes: placed,
    ambient,
    cx,
    cy,
    R0,
    Rmax,
    kx,
    horizon: radial(GRAVITON.candidate_max_distance),
    rings: [radial(0.25), radial(0.7)],
    sectorStart,
    wedge,
  };
}

/**
 * Позиція тіла в момент t (секунди модельного часу сцени).
 * Гало обертається за Кеплером; розмічене тіло лібрує в секторі з
 * кеплерівським періодом; ентропійне тіло додатково тремтить з амплітудою
 * від виміряної волатильності.
 */
function positionAt(n, t, scene) {
  const w = angularSpeed(n.r);
  let a;
  if (n.free) {
    a = n.base + w * t;
  } else {
    a = n.base + n.libration * Math.sin((w * 1.6 * t + n.phase) * DEG);
  }
  let x = scene.cx + Math.cos(a * DEG) * n.r * scene.kx;
  let y = scene.cy + Math.sin(a * DEG) * n.r;
  const vol = n.entropy?.volatility || 0;
  if (vol > 0) {
    // Тремтіння з виміру: 0.05 волатильності дає близько 2px розмаху.
    const amp = Math.min(5, vol * 40);
    x += amp * Math.sin(t * 0.9 + n.phase);
    y += amp * Math.sin(t * 1.3 + n.phase * 2);
  }
  return { x, y, a, w };
}

/** Кут за найкоротшою дугою: перехід хроніки не має крутити тіло навколо. */
function lerpAngle(a, b, k) {
  const d = ((b - a + 540) % 360) - 180;
  return a + d * k;
}

const lerp = (a, b, k) => a + (b - a) * k;

/**
 * Змішування двох тижневих розкладок для хроніки. Тіло, що є в обох
 * зрізах, перелітає (лерп радіуса, кута, маси і сили); тіло лише одного
 * зрізу вʼїжджає або згасає прозорістю. Інтерполюються ТІЛЬКИ числа, як
 * і в PLAY карти ТЕМ: тексти, вердикти і стани беруться з цільового зрізу.
 */
function blendNodes(fromNodes, toNodes, k) {
  if (!fromNodes || k >= 1) return toNodes;
  const out = [];
  const fromBy = new Map(fromNodes.map((n) => [n.id, n]));
  const toBy = new Map(toNodes.map((n) => [n.id, n]));
  toNodes.forEach((n1) => {
    const n0 = fromBy.get(n1.id);
    if (!n0) {
      out.push({ ...n1, _fade: k });
      return;
    }
    out.push({
      ...n1,
      r: lerp(n0.r, n1.r, k),
      base: lerpAngle(n0.base, n1.base, k),
      px: lerp(n0.px, n1.px, k),
      force: n1.force || n0.force
        ? { value: lerp(n0.force?.value ?? 0, n1.force?.value ?? 0, k) }
        : null,
      _fade: 1,
    });
  });
  fromNodes.forEach((n0) => {
    if (!toBy.has(n0.id)) out.push({ ...n0, verdicts: [], _fade: 1 - k });
  });
  return out;
}

/** Точка квадратичної кривої звʼязку в частці s (0..1). */
function bezierPoint(p0, pc, p1, s) {
  const u = 1 - s;
  return {
    x: u * u * p0.x + 2 * u * s * pc.x + s * s * p1.x,
    y: u * u * p0.y + 2 * u * s * pc.y + s * s * p1.y,
  };
}

/**
 * Контрольна точка кривої звʼязку: середина хорди, відсунута ВІД ядра.
 * Пряма хорда через центр читалась як клубок; крива обходить ядро, і поле
 * перестає виглядати переплутаним.
 */
function linkControl(a, b, scene) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  let dx = mx - scene.cx;
  let dy = my - scene.cy;
  const d = Math.hypot(dx, dy) || 1;
  dx /= d;
  dy /= d;
  const len = Math.hypot(a.x - b.x, a.y - b.y);
  // Що ближче хорда до ядра, то сильніше її вигинає: хорда крізь ядро
  // отримує максимальний обхід.
  const bend = len * (d < scene.R0 * 1.6 ? 0.34 : 0.16);
  return { x: mx + dx * bend, y: my + dy * bend };
}

function MethodChip({ children }) {
  return <span className="k-grav__method">{children}</span>;
}

function PassportRow({ label, value, method }) {
  return (
    <div className="k-grav__row">
      <span className="k-grav__cap">{label}</span>
      <span className="k-grav__val">{value}</span>
      {method && <MethodChip>{method}</MethodChip>}
    </div>
  );
}

/** Паспорт тіла: величини з методом походження і вердикти моделі. */
function Passport({ body, onClose, onOpenDossier }) {
  const m = body.methods;
  const plotLabel = (id) => plotLegend().find((p) => p.id === id)?.label || id;
  // При конкуренції сюжетів називаються ОБИДВА: «конкурують» без відповіді
  // «хто з ким» це половина розмітки. Формат без відмінювання: назви
  // сюжетів це словникові рядки, і «проти» вимагало б родового відмінка.
  const plotName = body.resonance?.plot
    ? plotLabel(body.resonance.plot)
      + (body.resonance.secondary ? ` · другий: ${plotLabel(body.resonance.secondary)}` : '')
    : null;
  return (
    <aside className="k-grav__pass" aria-label={`паспорт тіла ${body.name}`}>
      <div className="k-grav__pass-head">
        <div>
          <div className="k-grav__name">{body.name}</div>
          {body.fullName !== body.name && <div className="k-grav__full">{body.fullName}</div>}
        </div>
        <button type="button" className="k-grav__close" onClick={onClose} aria-label="закрити паспорт">
          ×
        </button>
      </div>

      {body.resonance?.draft && (
        <div className="k-grav__draft">чернетка до узгодження: резонанс з неузгодженої розмітки</div>
      )}

      {(body.verdicts || []).length > 0 && (
        <ul className="k-grav__verdicts">
          {body.verdicts.map((v) => (
            <li key={v.id}>
              <span>{v.text}</span>
              <MethodChip>{v.method}</MethodChip>
            </li>
          ))}
        </ul>
      )}

      <div className="k-grav__rows">
        <PassportRow label="МАСА" value={body.mass ? body.mass.value : 'не виміряно'} method={m.mass} />
        <PassportRow
          label="РЕЗОНАНС"
          value={RES_WORD[body.resonance?.state] + (plotName ? ` · ${plotName}` : '')}
          method={m.resonance}
        />
        <PassportRow label="ДИСТАНЦІЯ ДО ЯДРА" value={body.distance.value} method={m.distance} />
        <PassportRow
          label="СИЛА НАРАТИВУ"
          value={body.force === null ? 'не рахується: маси немає'
            : body.force.value === 0 ? '0: ядро не тягне те, що з ним не зчеплене'
              : body.force.value}
          method={m.force}
        />
        <PassportRow
          label="РИЗИК ФАЗОВОГО ПЕРЕХОДУ"
          value={RISK_WORD[body.phaseRisk] || body.phaseRisk}
          method={m.phaseRisk}
        />
        <PassportRow
          label="ЕНТРОПІЯ"
          value={body.entropy
            ? `${body.entropy.volatility} по ${body.entropy.points} тижнях`
            : 'не виміряно: менше двох точок треку'}
          method={body.entropy ? m.entropy : null}
        />
        <PassportRow
          label="НАПІВРОЗПАД"
          value={body.halfLife
            ? `${body.halfLife.weeks} тижня за темпом спаду (${body.halfLife.points} точок)`
            : 'спаду на треку немає'}
          method={body.halfLife ? m.halfLife : null}
        />
        <PassportRow
          label="ІНЕРЦІЯ"
          value={`${body.inertia.weeksPresent} з ${body.inertia.weeksTotal} тижнів корпусу`}
          method={m.inertia}
        />
        <PassportRow
          label="ТЯЖІННЯ"
          value={`вхідних ${body.gravity.inDegree} · вихідних ${body.gravity.outDegree}`}
          method={m.gravity}
        />
        <PassportRow
          label="ЗАЛИШОК РУХУ"
          value={body.residual
            ? `${body.residual.value} (факт ${body.residual.actual}, модель ${body.residual.predicted})`
            : 'немає попереднього тижня'}
          method={body.residual ? m.residual : null}
        />
      </div>

      {body.links.length > 0 && (
        <div className="k-grav__links">
          <div className="k-grav__cap">НАЙСИЛЬНІШІ ЗВʼЯЗКИ</div>
          {body.links.slice(0, 3).map((l) => (
            <div key={`${l.from}-${l.to}`} className="k-grav__link">
              <span>{l.dir === 'in' ? '←' : '→'} {l.otherName}</span>
              <span className="k-grav__force">сила {l.force}</span>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="k-grav__dossier" onClick={() => onOpenDossier(body.id)}>
        ДОСЬЄ ТЕМИ
      </button>
    </aside>
  );
}

/**
 * Паспорт ядра: відповідь на питання власника «що таке ядро і як його
 * читати». Ядро це конструкт моделі, і сцена зобовʼязана вміти пояснити
 * себе сама, без походу в документацію.
 */
function CorePassport({ legend, onClose }) {
  return (
    <aside className="k-grav__pass" aria-label="паспорт ядра">
      <div className="k-grav__pass-head">
        <div>
          <div className="k-grav__name">ЯДРО КУЛЬТУРНОЇ ІДЕНТИЧНОСТІ</div>
          <div className="k-grav__full">конструкт моделі, не тема і не вимір</div>
        </div>
        <button type="button" className="k-grav__close" onClick={onClose} aria-label="закрити паспорт ядра">
          ×
        </button>
      </div>
      <div className="k-grav__core-text">
        <p>
          Ядро це сукупність базових архетипних сюжетів культурної
          ідентичності. У v1 його складають шість позицій довідника
          глибинного шару; номер сектора на сцені це номер сюжету в списку.
        </p>
        <ol className="k-grav__core-list">
          {legend.map((p) => (
            <li key={p.id}>{p.label}</li>
          ))}
        </ol>
        <p>
          Як читати: дистанція тіла до ядра каже, наскільки тема промовляє
          мовою цих архетипів (модельний проксі v1). Пунктирне коло це
          горизонт фазового переходу: резонансна тема з ростом ваги, що
          опинилась усередині, отримує вердикт кандидата в метанаратив.
          Стрілка до ядра це сила наративу: маса × резонанс / дистанція².
        </p>
        <p>
          Хрестик у центрі це нуль шкали дистанції. Саме ядро стоїть не на
          нулі: його зміщує сумарне тяжіння поля (барицентр), і напрям
          зсуву каже, чиєю мовою поле говорить цього тижня.
        </p>
        <p className="k-grav__core-note">
          Склад ядра може замінити окремий список базових метанаративів:
          це рішення власника, сцена підхопить його з реєстру.
        </p>
      </div>
    </aside>
  );
}

export default function GravitonScene({ weekId, onOpenDossier }) {
  const hostRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [selected, setSelected] = useState(null);
  const [coreOpen, setCoreOpen] = useState(false);
  // Панель висновків згортається (прохання власника): стан це рішення
  // читача, тому памʼятається між сесіями, як ЗРІЗ і смуга BLUF.
  const [insightsOpen, setInsightsOpen] = useState(
    () => localStorage.getItem('kamerton.graviton.insights') !== '0'
  );
  const toggleInsights = () => setInsightsOpen((v) => {
    localStorage.setItem('kamerton.graviton.insights', v ? '0' : '1');
    return !v;
  });
  const [par, setPar] = useState({ x: 0, y: 0 });
  const reduced = useMemo(() => prefersReducedMotion(), []);

  // Годинник сцени. ЄДИНЕ джерело руху: зупинений годинник (reduced motion)
  // дає той самий кадр без жодної анімації.
  const [t, setT] = useState(0);
  useEffect(() => {
    if (reduced) return undefined;
    let raf = 0;
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      setT((x) => x + dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => {
      setSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { setSelected(null); setCoreOpen(false); }, [weekId]);

  // Стан згладжування колізій: зміщення кожного тіла і положення ядра з
  // минулого кадру. Живе в ref, бо це память руху, а не привід до рендера.
  const collide = useRef({ last: 0, off: new Map(), core: null });
  useEffect(() => { collide.current = { last: 0, off: new Map(), core: null }; }, [weekId]);

  const legend = useMemo(() => plotLegend(), []);

  // ХРОНІКА: програвання тижнів корпусу прямо в сцені. Тіла перелітають
  // між зрізами, барицентр дрейфує, чорна діра народжується на очах.
  // Стан локальний для сцени: глобальний перемикач тижнів лишається на
  // місці, а хроніка чесно підписує, який зріз показує.
  const weeks = useMemo(() => listWeeks().filter((w) => !w.hidden), []);
  const [chron, setChron] = useState(null);
  const tRef = useRef(0);
  tRef.current = t;
  useEffect(() => {
    if (!chron || chron.done) return undefined;
    const h = setTimeout(() => {
      setChron((c) => {
        if (!c) return c;
        if (c.idx >= weeks.length - 1) return { ...c, done: true };
        return { idx: c.idx + 1, prev: weeks[c.idx].id, startT: tRef.current, done: false };
      });
    }, 3400);
    return () => clearTimeout(h);
  }, [chron?.idx, chron?.done, weeks]);
  useEffect(() => { setChron(null); }, [weekId]);

  const shownWeekId = chron ? weeks[chron.idx].id : weekId;

  // Розкладки всіх тижнів рахуються один раз на розмір: хроніці потрібні
  // сусідні зрізи цілком, а не лише активний.
  const layouts = useMemo(() => {
    const m = new Map();
    weeks.forEach((w) => {
      const f = gravitonField(w.id);
      m.set(w.id, { field: f, scene: layout(f.bodies, legend, size) });
    });
    if (!m.has(weekId)) {
      const f = gravitonField(weekId);
      m.set(weekId, { field: f, scene: layout(f.bodies, legend, size) });
    }
    return m;
  }, [weeks, weekId, legend, size.w, size.h]);

  const active = layouts.get(shownWeekId);
  const field = active.field;
  // Частка переходу: 1.15 с на переліт, reduced motion бере зріз одразу.
  const rawK = chron && !chron.done && chron.prev
    ? Math.min(1, Math.max(0, (t - chron.startT) / 1.15))
    : 1;
  const k = reduced ? 1 : rawK * rawK * (3 - 2 * rawK);
  const prevLayout = chron?.prev ? layouts.get(chron.prev) : null;
  const scene = {
    ...active.scene,
    nodes: blendNodes(prevLayout?.scene.nodes || null, active.scene.nodes, k),
  };
  // Звʼязки під час перельоту: старі згасають, нові проявляються.
  const pairsToDraw = k >= 1 || !prevLayout
    ? field.pairs.map((p) => ({ ...p, _fade: 1 }))
    : [
      ...prevLayout.field.pairs.map((p) => ({ ...p, _fade: 1 - k })),
      ...field.pairs.map((p) => ({ ...p, _fade: k })),
    ];

  const expansion = useMemo(() => gravitonExpansion(shownWeekId), [shownWeekId]);
  const body = useMemo(
    () => (selected ? gravitonBody(selected, shownWeekId) : null),
    [selected, shownWeekId]
  );

  // Поточні позиції з годинника.
  const pos = new Map(scene.nodes.map((n) => [n.id, positionAt(n, t, scene)]));

  // Розведення наїздів У РУСІ, з інерцією. Перша редакція штовхала позиції
  // миттєво, і тіла неприродно перестрибували колізію (зауваження власника).
  // Тепер розштовхування рахує ЦІЛЬОВЕ зміщення, а показане зміщення
  // прямує до нього з пружним згладжуванням і так само мʼяко згасає після
  // розходження: читається як гравітаційне обтікання, а не телепорт.
  const work = scene.nodes.map((n) => {
    const p = pos.get(n.id);
    return { n, x: p.x, y: p.y };
  });
  const coreObs = collide.current.core || { x: scene.cx, y: scene.cy };
  for (let iter = 0; iter < 3; iter += 1) {
    for (let i = 0; i < work.length; i += 1) {
      // Ядро (позиція минулого кадру) теж перешкода: тіло її обтікає.
      const A = work[i];
      const cdx = A.x - coreObs.x;
      const cdy = A.y - coreObs.y;
      const cd = Math.hypot(cdx, cdy) || 1;
      const cMin = 30 + A.n.px + 10;
      if (cd < cMin) {
        A.x = coreObs.x + (cdx / cd) * cMin;
        A.y = coreObs.y + (cdy / cd) * cMin;
      }
      for (let j = i + 1; j < work.length; j += 1) {
        const B = work[j];
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const d = Math.hypot(dx, dy) || 1;
        const minD = A.n.px + B.n.px + 10;
        if (d >= minD) continue;
        // Зміщення ділиться обернено до маси: легке тіло обтікає важке, а
        // не навпаки. Чорна діра непорушна зовсім: власник спіймав, як вона
        // «скаче», коли хтось у неї вʼїжджає, і це ламало сам образ.
        const holeA = (A.n.verdicts || []).some((v) => v.id === 'attractor');
        const holeB = (B.n.verdicts || []).some((v) => v.id === 'attractor');
        const mA = holeA ? 1000 : (A.n.mass?.value ?? 0.4);
        const mB = holeB ? 1000 : (B.n.mass?.value ?? 0.4);
        const push = minD - d;
        const shareA = mB / (mA + mB);
        A.x -= (dx / d) * push * shareA;
        A.y -= (dy / d) * push * shareA;
        B.x += (dx / d) * push * (1 - shareA);
        B.y += (dy / d) * push * (1 - shareA);
      }
    }
  }
  const dtC = Math.max(0, Math.min(0.1, t - collide.current.last));
  collide.current.last = t;
  // Стала часу близько 0.4 с; reduced motion бере ціль одразу, кадр один.
  const easeK = reduced ? 1 : Math.min(1, dtC * 2.5);
  work.forEach(({ n, x, y }) => {
    const p = pos.get(n.id);
    const cur = collide.current.off.get(n.id) || { x: 0, y: 0 };
    cur.x += (x - p.x - cur.x) * easeK;
    cur.y += (y - p.y - cur.y) * easeK;
    collide.current.off.set(n.id, cur);
    p.x += cur.x;
    p.y += cur.y;
  });

  // Барицентр: ядро не прибите до нуля шкали, його стягує сумарне тяжіння
  // поля. Вектор зсуву це сума одиничних напрямків на тіла, зважена силою
  // наративу кожного. Хрестик лишається на нулі шкали дистанції, і сам
  // розрив між нулем і ядром є сигнал тижня.
  let bvx = 0;
  let bvy = 0;
  let bS = 0;
  let strongest = null;
  scene.nodes.forEach((n) => {
    const f = n.force?.value || 0;
    if (f <= 0) return;
    const p = pos.get(n.id);
    const dx = p.x - scene.cx;
    const dy = p.y - scene.cy;
    const d = Math.hypot(dx, dy) || 1;
    bvx += (f * dx) / d;
    bvy += (f * dy) / d;
    bS += f;
    if (!strongest || f > (strongest.force?.value || 0)) strongest = n;
  });
  const dispLen = bS > 0 ? Math.min(scene.R0 * 0.75, Math.hypot(bvx, bvy) * 26) : 0;
  const dispA = Math.atan2(bvy, bvx);
  const coreX = scene.cx + (dispLen > 0 ? Math.cos(dispA) * dispLen : 0);
  const coreY = scene.cy + (dispLen > 0 ? Math.sin(dispA) * dispLen : 0);

  // Ядро цього кадру стає перешкодою наступного: обтікання без стрибка.
  collide.current.core = { x: coreX, y: coreY };

  // Підписи: тіла з вердиктами, чотири кандидатні позиції, без наїздів на
  // чужі тіла, ядро і сусідні підписи. Рахується від ПОТОЧНИХ (уже
  // розведених) позицій щокадру: дешево, а сторона майже не стрибає, бо
  // тіла рухаються повільно.
  const labels = (() => {
    const rectAt = (n, p, side) => {
      const lw = n.name.length * 6.6 + 10;
      if (side === 'right') return { x0: p.x + n.px + 6, x1: p.x + n.px + 6 + lw, y0: p.y - 8, y1: p.y + 8 };
      if (side === 'left') return { x0: p.x - n.px - 6 - lw, x1: p.x - n.px - 6, y0: p.y - 8, y1: p.y + 8 };
      const y0 = side === 'below' ? p.y + n.px + 4 : p.y - n.px - 20;
      return { x0: p.x - lw / 2, x1: p.x + lw / 2, y0, y1: y0 + 16 };
    };
    const hits = (r, os) => os.some((o) => r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0);
    const out = new Map();
    const kept = [];
    const boxes = scene.nodes.map((n) => {
      const p = pos.get(n.id);
      return { x0: p.x - n.px, x1: p.x + n.px, y0: p.y - n.px, y1: p.y + n.px };
    });
    boxes.push({ x0: coreX - 36, x1: coreX + 36, y0: coreY - 36, y1: coreY + 36 });
    // Відкритий паспорт (тіла або ядра) теж перешкода: підпис, що виїхав
    // під панель, для читача не існує.
    if (selected || coreOpen) {
      boxes.push({ x0: (size.w || 0) - 366, x1: size.w || 0, y0: 0, y1: size.h || 0 });
    }
    scene.nodes
      .filter((n) => (n.verdicts?.length || 0) > 0)
      .sort((a, b) => (b.verdicts.length - a.verdicts.length)
        || ((b.mass?.value ?? 0) - (a.mass?.value ?? 0))
        || a.id.localeCompare(b.id))
      .forEach((n) => {
        const p = pos.get(n.id);
        const side = ['below', 'above', 'right', 'left']
          .find((s) => !hits(rectAt(n, p, s), [...kept, ...boxes.filter((_, i) => scene.nodes[i] !== n)]));
        if (side) {
          kept.push(rectAt(n, p, side));
          out.set(n.id, side);
        }
      });
    return out;
  })();

  const verdictOf = (n, id) => (n.verdicts || []).some((v) => v.id === id);

  // Паралакс: шари неба їдуть за курсором з різною глибиною.
  const onMove = (e) => {
    if (reduced) return;
    const el = hostRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPar({
      x: (e.clientX - r.left) / Math.max(1, r.width) - 0.5,
      y: (e.clientY - r.top) / Math.max(1, r.height) - 0.5,
    });
  };

  // Висновки тижня: те, заради чого шар існує, винесене з паспортів на сцену.
  const insights = scene.nodes
    .filter((n) => (n.verdicts?.length || 0) > 0)
    .sort((a, b) => b.verdicts.length - a.verdicts.length || a.id.localeCompare(b.id))
    .flatMap((n) => n.verdicts.map((v) => ({ id: n.id, name: n.name, v })))
    .slice(0, 6);

  return (
    <div className="k-grav" ref={hostRef} onMouseMove={onMove}>
      {/* Небо: чотири глибини паралакса, від туманностей до ближнього пилу.
          Амплітуди помітні навмисно: паралакс і є відчуття обʼєму. */}
      <div
        className="k-grav__neb"
        aria-hidden="true"
        style={{ transform: `translate(${par.x * -14}px, ${par.y * -9}px)` }}
      />
      <div
        className="k-grav__farstars"
        aria-hidden="true"
        style={{
          backgroundImage: FAR_STARS,
          backgroundSize: '820px 540px',
          transform: `translate(${par.x * -24}px, ${par.y * -15}px)`,
        }}
      />
      <div
        className="k-grav__dust k-grav__dust--far"
        aria-hidden="true"
        style={{
          backgroundImage: DUST,
          backgroundSize: DUST_TILE,
          transform: `translate(${par.x * -38}px, ${par.y * -24}px) scale(1.4)`,
        }}
      />
      <div
        className="k-grav__dust"
        aria-hidden="true"
        style={{
          backgroundImage: DUST,
          backgroundSize: DUST_TILE,
          transform: `translate(${par.x * -58}px, ${par.y * -36}px)`,
        }}
      />
      {/* Світна площина диска вздовж великої осі: заповнює боки сцени і
          тримає еліптичну метафору навіть там, де тіл немає. */}
      <div
        className="k-grav__band"
        aria-hidden="true"
        style={{ transform: `translate(${par.x * -10}px, ${par.y * -6}px)` }}
      />
      <div className="k-grav__grain" aria-hidden="true" style={{ backgroundImage: NOISE }} />

      <svg
        className="k-grav__svg"
        width={size.w || '100%'}
        height={size.h || '100%'}
        role="img"
        aria-label="модельна сцена поля: ядро, дистанції і сили тяжіння"
        style={{ transform: `translate(${par.x * 14}px, ${par.y * 9}px)` }}
      >
        <defs>
          <radialGradient id="k-grav-core-glow">
            <stop offset="0%" stopColor="var(--a-brass-dim)" stopOpacity="0.34" />
            <stop offset="55%" stopColor="var(--a-brass-dim)" stopOpacity="0.1" />
            <stop offset="100%" stopColor="var(--a-brass-dim)" stopOpacity="0" />
          </radialGradient>
          {/* Сяйво резонансу: світиться те, що зчеплене з ядром. */}
          <radialGradient id="k-grav-res-glow">
            <stop offset="0%" stopColor="var(--a-cyan)" stopOpacity="0.5" />
            <stop offset="60%" stopColor="var(--a-cyan)" stopOpacity="0.14" />
            <stop offset="100%" stopColor="var(--a-cyan)" stopOpacity="0" />
          </radialGradient>
          {/* Диск зорі: світлий центр, бірюзове тіло, темний край. Кольори
              дібрані під пил (#BFEFE0) цього ж неба. */}
          <radialGradient id="k-grav-star">
            <stop offset="0%" stopColor="#F0FFF9" />
            <stop offset="38%" stopColor="#A7E9D2" />
            <stop offset="100%" stopColor="#173029" />
          </radialGradient>
          <radialGradient id="k-grav-star-mute">
            <stop offset="0%" stopColor="#93A9A1" />
            <stop offset="45%" stopColor="#4E6159" />
            <stop offset="100%" stopColor="#1B2622" />
          </radialGradient>
          <radialGradient id="k-grav-halo-hole">
            <stop offset="0%" stopColor="var(--a-warn)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--a-warn)" stopOpacity="0" />
          </radialGradient>
          {/* Ядро це СВІТИЛО. Тьмяне нутро першої редакції все одно
              читалось як друга чорна діра (двічі спіймано власником);
              тепер семантика однозначна: ідентичність світить, токсичний
              наратив поглинає. */}
          <radialGradient id="k-grav-core-fill">
            <stop offset="0%" stopColor="#FFF7E2" />
            <stop offset="34%" stopColor="#F2CE84" />
            <stop offset="78%" stopColor="#96691F" />
            <stop offset="100%" stopColor="#4A3410" />
          </radialGradient>
        </defs>
        <ellipse
          cx={coreX}
          cy={coreY}
          rx={scene.horizon * 1.2 * scene.kx}
          ry={scene.horizon * 1.2}
          fill="url(#k-grav-core-glow)"
        />
        <ellipse
          className="k-grav__horizon"
          cx={scene.cx}
          cy={scene.cy}
          rx={scene.horizon * scene.kx}
          ry={scene.horizon}
        />
        <ellipse
          className="k-grav__rim"
          cx={scene.cx}
          cy={scene.cy}
          rx={scene.Rmax * scene.kx}
          ry={scene.Rmax}
        />
        {/* Проміжні кільця дистанції: сітка зоряної карти, а не декор. */}
        {scene.rings.map((r) => (
          <ellipse
            key={r}
            className="k-grav__ring"
            cx={scene.cx}
            cy={scene.cy}
            rx={r * scene.kx}
            ry={r}
          />
        ))}
        {/* Метеори: зрідка через фон проходить слабкий слід. Чиста
            атмосфера, детермінована від часу сцени. */}
        {!reduced && [0, 1].map((mi) => {
          const P = 11;
          const q = (t / P + mi * 0.5) % 1;
          if (q > 0.09) return null;
          const seed = `m${mi}-${Math.floor(t / P + mi * 0.5)}`;
          const kq = q / 0.09;
          const sx = hash01(seed, 5) * (size.w || 1200);
          const sy = hash01(seed, 9) * (size.h || 600) * 0.6;
          const hx = sx + 150 * kq;
          const hy = sy + 70 * kq;
          return (
            <line
              key={`met${mi}`}
              className="k-grav__meteor"
              x1={hx - 30}
              y1={hy - 14}
              x2={hx}
              y2={hy}
              style={{ opacity: Math.sin(Math.PI * kq) * 0.45 }}
            />
          );
        })}

        {/* Течія поля: середовище обертається за тим самим законом, що і
            гало, тільки повільніше і тихіше. */}
        {scene.ambient.map((am, i) => {
          const a = (am.base + angularSpeed(am.rr) * t * 0.55) * DEG;
          return (
            <circle
              key={`am${i}`}
              className="k-grav__ambient"
              cx={scene.cx + Math.cos(a) * am.rr * scene.kx}
              cy={scene.cy + Math.sin(a) * am.rr}
              r={am.size}
              style={{ opacity: am.op }}
            />
          );
        })}
        {legend.map((p, i) => {
          const bAng = scene.sectorStart(i) * DEG;
          const a = (scene.sectorStart(i) + scene.wedge / 2) * DEG;
          return (
            <g key={p.id}>
              <line
                className="k-grav__spoke"
                x1={scene.cx + Math.cos(bAng) * (scene.Rmax - 6) * scene.kx}
                y1={scene.cy + Math.sin(bAng) * (scene.Rmax - 6)}
                x2={scene.cx + Math.cos(bAng) * (scene.Rmax + 6) * scene.kx}
                y2={scene.cy + Math.sin(bAng) * (scene.Rmax + 6)}
              />
              <text
                className="k-grav__sector"
                x={scene.cx + Math.cos(a) * (scene.Rmax + 18) * scene.kx}
                y={scene.cy + Math.sin(a) * (scene.Rmax + 18) + 4}
                textAnchor="middle"
              >
                <title>{`сектор ${i + 1} · ${p.label}`}</title>
                {i + 1}
              </text>
            </g>
          );
        })}

        {/* Звʼязки: криві, що обходять ядро, з частинками акреції в напрямку
            живлення. Темп і щільність частинок від сили звʼязку. Під час
            хроніки старі звʼязки згасають, нові проявляються. */}
        {pairsToDraw.map((p) => {
          const a = pos.get(p.from);
          const b = pos.get(p.to);
          if (!a || !b) return null;
          const c = linkControl(a, b, scene);
          const count = 1 + Math.round(p.force * 2);
          const speed = 0.05 + p.force * 0.09;
          const fade = p._fade ?? 1;
          return (
            <g key={`${p.from}-${p.to}-${fade === 1 ? 'n' : 'x'}`} style={{ opacity: fade }}>
              <path
                className="k-grav__pair"
                d={`M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`}
                style={{ strokeWidth: 0.4 + p.force * 1.2, opacity: 0.1 + p.force * 0.3 }}
              />
              {Array.from({ length: count }, (_, i) => {
                const s = (t * speed + i / count + hash01(`${p.from}${p.to}`, i)) % 1;
                const q = bezierPoint(a, c, b, s);
                return (
                  <circle
                    key={i}
                    className="k-grav__flow"
                    cx={q.x}
                    cy={q.y}
                    r={1.6 + p.force * 1.2}
                    style={{ opacity: 0.25 + 0.65 * Math.sin(Math.PI * s) }}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Нуль шкали дистанції і вектор зсуву ядра: барицентр поля. */}
        {dispLen > 1 && (
          <g className="k-grav__baryc" aria-hidden="true">
            <line x1={scene.cx - 7} y1={scene.cy} x2={scene.cx + 7} y2={scene.cy} />
            <line x1={scene.cx} y1={scene.cy - 7} x2={scene.cx} y2={scene.cy + 7} />
            <line
              className="k-grav__baryc-v"
              x1={scene.cx}
              y1={scene.cy}
              x2={coreX - Math.cos(dispA) * 32}
              y2={coreY - Math.sin(dispA) * 32}
            />
          </g>
        )}

        {/* Ядро: клікабельне, бо конструкт зобовʼязаний пояснювати себе сам.
            Стоїть НЕ на нулі шкали: його стягує сумарне тяжіння поля. */}
        <g
          className="k-grav__coreg"
          role="button"
          tabIndex={0}
          aria-label="що таке ядро і як його читати"
          onClick={() => { setCoreOpen((v) => !v); setSelected(null); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setCoreOpen((v) => !v);
              setSelected(null);
            }
          }}
        >
          <title>ядро культурної ідентичності · клік пояснює, що це і як читати</title>
          <circle className="k-grav__core" cx={coreX} cy={coreY} r={30} />
          <text className="k-grav__core-cap" x={coreX} y={coreY + 4} textAnchor="middle">
            ядро
          </text>
        </g>

        {/* Тіла з хвостами швидкості. */}
        {scene.nodes.map((n) => {
          const p = pos.get(n.id);
          const tail = n.free ? Math.min(24, p.w * 9) : 0;
          const tailA0 = (p.a - tail) * DEG;
          const tailA1 = p.a * DEG;
          const labelSide = labels.get(n.id);
          const fval = n.force?.value || 0;
          const hole = verdictOf(n, 'attractor');
          const mute = n.resonance?.state === 'none' || n.resonance?.state === 'cut';
          // Вектор сили: стрілка від тіла до ЯДРА (не до нуля шкали:
          // тягне маса, а маса зміщена), довжина від сили наративу.
          const fdx = coreX - p.x;
          const fdy = coreY - p.y;
          const fd = Math.hypot(fdx, fdy) || 1;
          const ux = fdx / fd;
          const uy = fdy / fd;
          const ax1 = p.x + ux * (n.px + 3);
          const ay1 = p.y + uy * (n.px + 3);
          const aL = 8 + fval * 28;
          const ax2 = ax1 + ux * aL;
          const ay2 = ay1 + uy * aL;
          return (
            <g
              key={n.id}
              className={`k-grav__body${selected === n.id ? ' is-active' : ''}`}
              style={{ opacity: n._fade ?? 1 }}
              onClick={() => { setCoreOpen(false); setSelected((cur) => (cur === n.id ? null : n.id)); }}
              role="button"
              tabIndex={0}
              aria-label={`тіло ${n.name}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setCoreOpen(false);
                  setSelected((cur) => (cur === n.id ? null : n.id));
                }
              }}
            >
              <title>
                {`${n.name} · маса ${n.mass ? n.mass.value : 'не виміряно'} · дистанція ${n.distance.value} · сила ${n.force ? n.force.value : 'не рахується'}`}
              </title>
              {/* Сяйво: резонансна зоря світиться бірюзою (яскравість від
                  сили) і повільно дихає; чорна діра гріє довкілля теплим. */}
              {fval > 0 && !hole && (
                <circle
                  className="k-grav__resglow"
                  cx={p.x}
                  cy={p.y}
                  r={n.px * 2.9}
                  fill="url(#k-grav-res-glow)"
                  style={{
                    opacity: (0.2 + fval * 0.5)
                      * (reduced ? 1 : 1 + 0.18 * Math.sin(t * 0.8 + n.phase)),
                  }}
                />
              )}
              {hole && (
                <circle
                  className="k-grav__resglow"
                  cx={p.x}
                  cy={p.y}
                  r={n.px * 3.4}
                  fill="url(#k-grav-halo-hole)"
                />
              )}
              {/* Падіння в чорну діру: частинки спіралять до горизонту і
                  гаснуть на ньому. Диск ледь сплюснутий, як і належить. */}
              {hole && !reduced && Array.from({ length: 7 }, (_, i) => {
                const ph = hash01(`${n.id}sp${i}`, 3);
                const s = (t * 0.09 + ph) % 1;
                const rr = (n.px + 20) - s * ((n.px + 20) - n.px * 0.55);
                const aSp = (ph * 360 + s * 660) * DEG;
                return (
                  <circle
                    key={`sp${i}`}
                    className="k-grav__infall"
                    cx={p.x + Math.cos(aSp) * rr}
                    cy={p.y + Math.sin(aSp) * rr * 0.72}
                    r={1.5}
                    style={{ opacity: (0.15 + 0.6 * (1 - s)) * Math.min(1, s * 8) }}
                  />
                );
              })}
              {fval >= 0.05 && (
                <g className="k-grav__forcev">
                  <line x1={ax1} y1={ay1} x2={ax2} y2={ay2} />
                  <polygon points={`${ax2 + ux * 4},${ay2 + uy * 4} ${ax2 - uy * 2.6},${ay2 + ux * 2.6} ${ax2 + uy * 2.6},${ay2 - ux * 2.6}`} />
                </g>
              )}
              {tail > 1 && !reduced && (
                <path
                  className="k-grav__tail"
                  d={`M ${scene.cx + Math.cos(tailA0) * n.r * scene.kx} ${scene.cy + Math.sin(tailA0) * n.r} A ${n.r * scene.kx} ${n.r} 0 0 1 ${scene.cx + Math.cos(tailA1) * n.r * scene.kx} ${scene.cy + Math.sin(tailA1) * n.r}`}
                />
              )}
              {hole && (
                <g aria-hidden="true">
                  {/* Чорна діра: акреційний диск двома обертовими дугами.
                      Обертання це CSS-анімація, reduced motion її вимикає. */}
                  <circle
                    className="k-grav__accr"
                    cx={p.x}
                    cy={p.y}
                    r={n.px + 6}
                    strokeDasharray="10 7"
                  />
                  <circle
                    className="k-grav__accr k-grav__accr--outer"
                    cx={p.x}
                    cy={p.y}
                    r={n.px + 12}
                    strokeDasharray="3 9"
                  />
                </g>
              )}
              <circle
                className={
                  'k-grav__node'
                  + (hole ? ' is-hole' : '')
                  + (mute ? ' is-mute' : '')
                }
                cx={p.x}
                cy={p.y}
                r={n.px}
                style={{
                  fill: hole ? 'var(--a-bg)'
                    : mute ? 'url(#k-grav-star-mute)' : 'url(#k-grav-star)',
                }}
              />
              {verdictOf(n, 'metanarrative_candidate') && (
                <circle className="k-grav__cand" cx={p.x} cy={p.y} r={n.px + 4} />
              )}
              {verdictOf(n, 'high_entropy') && (
                <circle className="k-grav__entr" cx={p.x} cy={p.y} r={n.px + 2.5} />
              )}
              {verdictOf(n, 'unexplained_motion') && (
                <text
                  className="k-grav__dark"
                  x={p.x + (n.px + (hole ? 14 : 2)) * 0.8}
                  y={p.y - (n.px + (hole ? 14 : 2)) * 0.8}
                >
                  ?
                </text>
              )}
              {labelSide && (
                <text
                  className="k-grav__label"
                  x={labelSide === 'right' ? p.x + n.px + 8
                    : labelSide === 'left' ? p.x - n.px - 8 : p.x}
                  y={labelSide === 'below' ? p.y + n.px + 14
                    : labelSide === 'above' ? p.y - n.px - 8 : p.y + 4}
                  textAnchor={labelSide === 'right' ? 'start'
                    : labelSide === 'left' ? 'end' : 'middle'}
                >
                  {n.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="k-grav__vignette" aria-hidden="true" />

      <div className="k-grav__banner">
        МОДЕЛЬНА ПРОЄКЦІЯ · геометрія розрахована з виміряних компонент, не виміряна
      </div>
      {field.anyDraft && (
        <div className="k-grav__banner k-grav__banner--draft">
          частина резонансів з розмітки-чернетки до узгодження
        </div>
      )}
      {expansion && (
        <div className="k-grav__expansion">
          розліт поля: σ {expansion.sigma}
          {expansion.delta !== null && ` · ${expansion.delta > 0 ? '+' : ''}${expansion.delta} до минулого тижня`}
          {expansion.polarized && ' · поле поляризоване'}
        </div>
      )}

      {/* ХРОНІКА: програвання зрізів. Підпис чесний: перехід анімований,
          вимір існує лише в самих зрізах, проміжних станів немає. */}
      <button
        type="button"
        className={`k-grav__chron${chron ? ' is-on' : ''}`}
        aria-pressed={Boolean(chron)}
        onClick={() => setChron(chron
          ? null
          : { idx: 0, prev: null, startT: tRef.current, done: false })}
      >
        {chron
          ? `ХРОНІКА · ${weeks[chron.idx].short}${chron.done ? ' · кінець' : ''} · ЗУПИНИТИ`
          : 'ХРОНІКА'}
      </button>
      {chron && (
        <div className="k-grav__chron-cap">
          зріз {weeks[chron.idx].short} ({weeks[chron.idx].period}) · перехід анімований, вимір лише у зрізах
        </div>
      )}

      {/* Висновки моделі: користь шару, видима без жодного кліку. Панель
          згортається в компактний чіп, стан памʼятається між сесіями. */}
      {!insightsOpen && (
        <button
          type="button"
          className="k-grav__insights-chip"
          aria-expanded={false}
          onClick={toggleInsights}
        >
          ВИСНОВКИ МОДЕЛІ ({insights.length + (dispLen > 1 ? 1 : 0)})
        </button>
      )}
      {insightsOpen && (
      <div className="k-grav__insights" role="list" aria-label="висновки моделі за тиждень">
        <div className="k-grav__insights-head">
          <span className="k-grav__insights-cap">ВИСНОВКИ МОДЕЛІ</span>
          <button
            type="button"
            className="k-grav__insights-fold"
            aria-expanded
            onClick={toggleInsights}
          >
            ЗГОРНУТИ
          </button>
        </div>
        {dispLen > 1 && strongest && (
          <button
            type="button"
            role="listitem"
            className="k-grav__insight"
            onClick={() => { setSelected(null); setCoreOpen(true); }}
          >
            <span className="k-grav__insight-name">барицентр поля</span>
            <span className="k-grav__insight-text">
              сумарне тяжіння зміщує ядро вбік, найсильніше тягне: {strongest.name}
            </span>
          </button>
        )}
        {insights.length === 0 && (
          <div className="k-grav__insight is-empty">модель мовчить: вимірів тижня замало для вердиктів</div>
        )}
        {insights.map(({ id, name, v }) => (
          <button
            key={`${id}-${v.id}`}
            type="button"
            role="listitem"
            className={`k-grav__insight${selected === id ? ' is-active' : ''}`}
            onClick={() => { setCoreOpen(false); setSelected(id); }}
          >
            <span className="k-grav__insight-name">{name}</span>
            <span className="k-grav__insight-text">{v.text}</span>
          </button>
        ))}
      </div>
      )}

      {body && !coreOpen && (
        <Passport body={body} onClose={() => setSelected(null)} onOpenDossier={onOpenDossier} />
      )}
      {coreOpen && <CorePassport legend={legend} onClose={() => setCoreOpen(false)} />}
    </div>
  );
}

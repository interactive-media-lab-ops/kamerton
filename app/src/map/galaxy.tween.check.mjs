// КАМЕРТОН · перевірка твінів карти без браузера.
//
// Канвас тут підставний: жоден піксель не малюється, перевіряється тільки арифметика
// переїзду. Це те місце, де жив ривок акторів при зміні тижня, і зловити його можна
// лише так: у справжній панелі rAF заморожений, а на око «ривок» і «швидкий переїзд»
// не розрізнити.

const raf = { queue: [], id: 0 };
const noop = () => {};

/** Контекст-заглушка: будь-який метод це пусто, крім тих, що мусять щось повернути. */
function stubCtx() {
  const gradient = { addColorStop: noop };
  const real = {
    measureText: (s) => ({ width: String(s).length * 6 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    setTransform: noop,
  };
  return new Proxy(real, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      return noop;
    },
    set() { return true; },
  });
}

function stubCanvas(w = 1200, h = 620) {
  return {
    width: w, height: h,
    style: {},
    getContext: () => stubCtx(),
    getBoundingClientRect: () => ({ width: w, height: h, left: 0, top: 0, right: w, bottom: h }),
    addEventListener: noop,
    removeEventListener: noop,
  };
}

globalThis.window = {
  devicePixelRatio: 1,
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }),
  addEventListener: noop,
  removeEventListener: noop,
  innerWidth: 1440,
  innerHeight: 900,
};
globalThis.document = {
  createElement: () => stubCanvas(),
  documentElement: { style: { getPropertyValue: () => '' } },
};
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
globalThis.Image = class { set src(_v) { /* спрайт акторів ніколи не завантажиться, і добре */ } };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame = (fn) => { raf.queue.push(fn); return ++raf.id; };
globalThis.cancelAnimationFrame = noop;

const { createGalaxy } = await import('./galaxy.js');
const { buildScalefield } = await import('./starfield.js');
const { buildActorfield } = await import('./actorfield.js');

let fails = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}  got=${JSON.stringify(got)}${ok ? '' : ' want=' + JSON.stringify(want)}`);
};
const near = (name, got, want, tol) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}  got=${round(got)} want=${round(want)}±${tol}`);
};
const round = (v) => Math.round(v * 100) / 100;

const api = createGalaxy(stubCanvas(), {
  getInsets: () => ({ left: 24, right: 24, top: 24, bottom: 24 }),
  onHover: noop, onSelect: noop, onSelectMoon: noop,
});

/** Знімок позицій акторів так, як їх бачить рендер прямо зараз. */
const snap = () => Object.fromEntries(api.debugActors().map((a) => [a.id, round(a.curX)]));

const loadWeek = (id) => {
  api.setScalefield(buildScalefield(id), { direction: 'none' });
  api.setActorfield(buildActorfield(id));
};

console.log('--- переїзд акторів між тижнями ---');
api.setLayer('actors');
// Спершу W30, і аж тоді W31: після холодного завантаження fromX випадково дорівнює
// tx, і перетирання curX стає непомітним. Ривок видно лише тоді, коли в акторів
// уже є попередній переїзд за плечима, тобто fromX вказує на позаминулий тиждень.
loadWeek('2026-W30');
api.settle();
loadWeek('2026-W31');
api.settle();
const at31 = snap();
eq('W31 розклався', Object.keys(at31).length, 10);

// Ось той самий порядок викликів, що й у GalaxyMap: спершу теми, потім актори.
// Поки прапорець твіну був спільним, перший виклик перетирав curX акторів
// позиціями попереднього кадру, і актор стартував не звідти, де стояв.
api.setScalefield(buildScalefield('2026-W32'), { direction: 'none' });
const afterStars = snap();
eq('теми не чіпають позицій акторів', afterStars, at31);

api.setActorfield(buildActorfield('2026-W32'));
const atStart = snap();
eq('переїзд починається рівно з попередніх позицій', atStart, at31);

api.frameAt(200);
const mid = snap();
const moved = Object.keys(at31).filter((id) => mid[id] !== undefined && Math.abs(mid[id] - at31[id]) > 0.5);
eq('у середині переїзду актори вже не там, де були', moved.length > 0, true);

api.settle();
const at32 = snap();
const target = Object.fromEntries(api.debugActors().map((a) => [a.id, round(a.tx)]));
eq('у кінці переїзду актори стоять точно на своїх місцях', at32, target);

const between = Object.keys(mid).filter((id) => {
  const a = at31[id], b = at32[id];
  if (a === undefined || b === undefined || Math.abs(a - b) < 1) return false;
  return mid[id] > Math.min(a, b) - 0.5 && mid[id] < Math.max(a, b) + 0.5;
});
eq('проміжний кадр лежить між початком і кінцем, а не поза ними',
  between.length, Object.keys(mid).filter((id) => {
    const a = at31[id], b = at32[id];
    return a !== undefined && b !== undefined && Math.abs(a - b) >= 1;
  }).length);

console.log('\n--- радіус їде разом з активністю ---');
loadWeek('2026-W31');
api.settle();
const r31 = Object.fromEntries(api.debugActors().map((a) => [a.id, a.curR]));
api.setScalefield(buildScalefield('2026-W32'), { direction: 'none' });
api.setActorfield(buildActorfield('2026-W32'));
api.frameAt(200);
const rMid = Object.fromEntries(api.debugActors().map((a) => [a.id, a.curR]));
api.settle();
const r32 = Object.fromEntries(api.debugActors().map((a) => [a.id, a.curR]));
const grew = Object.keys(r31).find((id) => r32[id] !== undefined && r31[id] !== r32[id]);
eq('є актор, у якого радіус змінився', Boolean(grew), true);
if (grew) {
  near(`радіус ${grew} у середині переїзду між старим і новим`,
    rMid[grew], (r31[grew] + r32[grew]) / 2, Math.abs(r32[grew] - r31[grew]) / 2 + 0.01);
}

console.log('\n--- зміна щільності пікселів не рухає поле ---');
loadWeek('2026-W32');
api.settle();
const before = snap();
api.resize();
eq('повторний resize без зміни розміру лишає все на місці', snap(), before);

api.destroy();
console.log(`\n${fails === 0 ? 'ВСЕ ЗІЙШЛОСЬ' : fails + ' ПРОВАЛІВ'}`);
process.exit(fails ? 1 : 0);

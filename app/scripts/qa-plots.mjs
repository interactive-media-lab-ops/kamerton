// КАМЕРТОН · браузерне приймання вкладки СЮЖЕТИ.
//
// check-plots.mjs читає вихідники і ловить зламані межі в тексті. Цей скрипт
// робить друге: відкриває справжню вкладку в headless Chromium і міряє те, що
// в тексті не видно взагалі. Чи не наїхали зорі одна на одну після розкладки,
// чи домалювалась дуга психотипів, чи не вилетіли ролі за екран, чи не
// сипляться попередження React і NaN в атрибутах SVG.
//
// Скрипт нічого не виправляє: він тільки міряє і друкує. Кадри лягають у
// SPEC_NOTES/shots/ поруч зі знімками Глибинного шару.
//
// Запуск: node scripts/qa-plots.mjs

import fs from 'node:fs';
import path from 'node:path';
import url, { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = fs.existsSync(path.join(process.cwd(), 'dist', 'kamerton.html'))
  ? process.cwd()
  : path.join(HERE, '..');

const DIST = path.join(ROOT, 'dist', 'kamerton.html');
const OUT = path.join(ROOT, '..', 'SPEC_NOTES', 'shots');
const WEEK = process.env.QA_WEEK || 'w32';
const HASH = `#${WEEK}/siuzhety`;
const VIEW = { width: 1280, height: 800 };
const TARGET = 'Антикорупційний скепсис';

if (!fs.existsSync(DIST)) {
  console.error('немає dist/kamerton.html: спершу npm run build');
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

/* ------------------------------------------------------------------ */
/* Журнал                                                              */
/* ------------------------------------------------------------------ */

const checks = [];
const defects = [];
const shots = [];
let stage = 'старт';

const say = (name, ok, note = '') => {
  checks.push({ name, ok, note });
  console.log(`${ok ? 'ok    ' : 'ДЕФЕКТ'} ${name}${note ? '  ' + note : ''}`);
};
const defect = (where, what) => {
  defects.push({ where, what });
  console.log(`  ! ${where}: ${what}`);
};

/* ------------------------------------------------------------------ */
/* Сторінка                                                            */
/* ------------------------------------------------------------------ */

const browser = await chromium.launch();
const noise = [];

/** Заставка тримає екран 4.1 с і накриває все, тому прапорці і перезавантаження. */
async function openTab(page) {
  await page.goto(`${pathToFileURL(DIST).href}${HASH}`, { waitUntil: 'load' });
  await page.evaluate(() => {
    sessionStorage.setItem('kamerton.intro', '1');
    sessionStorage.setItem('kamerton.onboarded', '1');
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1400);
}

function listen(page, tag) {
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      noise.push({ tag, stage, kind: m.type(), text: m.text() });
    }
  });
  page.on('pageerror', (e) => noise.push({ tag, stage, kind: 'pageerror', text: String(e) }));
}

const page = await browser.newPage({ viewport: VIEW });
listen(page, 'main');

stage = '1 поле';
await openTab(page);

/* ------------------------------------------------------------------ */
/* 1. Поле вкладки                                                     */
/* ------------------------------------------------------------------ */

/* Геометрію рахуємо в сторінці: тут доступні і прямокутники, і композитна
   прозорість, а обидві потрібні разом. Зоря це не svg-бокс (він 8.4r і на
   третину порожній), а кільце 1.6r, тому наїзд міряється саме по ньому. */
const field = await page.evaluate(() => {
  const eff = (el) => {
    let o = 1;
    let n = el;
    while (n && n.nodeType === 1) {
      const v = parseFloat(getComputedStyle(n).opacity);
      if (!Number.isNaN(v)) o *= v;
      if (n.classList && n.classList.contains('k-syuzh')) break;
      n = n.parentElement;
    }
    return o;
  };
  const lum = ([r, g, b]) => {
    const f = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const rgbOf = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(s || '');
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return p.length >= 3 ? { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 } : null;
  };

  const host = document.querySelector('.k-syuzh');
  const voidRgb = rgbOf(getComputedStyle(host).backgroundColor)?.rgb || [3, 13, 11];

  const nodes = [...document.querySelectorAll('.k-syuzh__node')].map((n, i) => {
    const svg = n.querySelector('svg.k-syu');
    const name = n.querySelector('.k-syuzh__name');
    const sb = svg.getBoundingClientRect();
    const nb = name ? name.getBoundingClientRect() : null;
    const r = sb.width / 2 / 4.2; // поле зору морфології рівно 4.2r
    const core = n.querySelector('.k-syu__core') || n.querySelector('circle');
    const cs = core ? getComputedStyle(core) : null;
    const paint = cs ? rgbOf(cs.fill) || rgbOf(cs.stroke) : null;
    const alpha = core
      ? eff(core) * (paint?.a ?? 1)
        * parseFloat(cs.fillOpacity === '' ? 1 : cs.fillOpacity || 1)
      : 0;
    const cx = sb.x + sb.width / 2;
    const cy = sb.y + sb.height / 2;
    const top = document.elementFromPoint(Math.round(cx), Math.round(cy));
    // Композит фарби зорі на порожнечі при її реальній прозорості: саме це
    // око і бачить, тому контраст рахуємо від композита, а не від токена.
    const mix = paint ? paint.rgb.map((c, k) => c * alpha + voidRgb[k] * (1 - alpha)) : voidRgb;
    const L1 = lum(mix);
    const L2 = lum(voidRgb);
    return {
      i,
      label: n.getAttribute('aria-label'),
      text: name ? name.textContent : '',
      cx,
      cy,
      r,
      body: r * 1.6,
      rect: { x: sb.x, y: sb.y, w: sb.width, h: sb.height },
      name: nb ? { x: nb.x, y: nb.y, w: nb.width, h: nb.height } : null,
      alpha: Number(alpha.toFixed(3)),
      contrast: Number(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)).toFixed(2)),
      covered: !(top && (top === n || n.contains(top))),
      hasPlot: !/ · /.test(n.getAttribute('aria-label') || ''),
    };
  });

  const inter = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const starHits = [];
  const nameHits = [];
  const nameOnStar = [];
  for (let a = 0; a < nodes.length; a += 1) {
    for (let b = a + 1; b < nodes.length; b += 1) {
      const A = nodes[a];
      const B = nodes[b];
      const d = Math.hypot(A.cx - B.cx, A.cy - B.cy);
      if (d < A.body + B.body) {
        starHits.push({ a: A.text, b: B.text, dist: Math.round(d), need: Math.round(A.body + B.body) });
      }
      if (A.name && B.name && inter(A.name, B.name)) nameHits.push({ a: A.text, b: B.text });
    }
  }
  // Підпис міряється проти НАМАЛЬОВАНОГО тіла сусідки, тобто проти кільця
  // 1.6r, а не проти ядра: кільце це така сама фарба, і текст поверх нього
  // так само нечитабельний.
  nodes.forEach((A) => {
    nodes.forEach((B) => {
      if (A === B || !A.name) return;
      const px = Math.max(A.name.x, Math.min(B.cx, A.name.x + A.name.w));
      const py = Math.max(A.name.y, Math.min(B.cy, A.name.y + A.name.h));
      const d = Math.hypot(px - B.cx, py - B.cy);
      if (d < B.body) {
        nameOnStar.push({
          label: A.text,
          star: B.text,
          dist: Math.round(d),
          ring: Math.round(B.body),
          core: d < B.r,
        });
      }
    });
  });

  const off = nodes.filter((n) => n.rect.x < 0 || n.rect.y < 0
    || n.rect.x + n.rect.w > innerWidth || n.rect.y + n.rect.h > innerHeight);

  const hb = host.getBoundingClientRect();
  return {
    count: nodes.length,
    // Межі самої сцени: тултіпи притискаються до них, а не до країв вікна.
    rect: { x: hb.x, y: hb.y, w: hb.width, h: hb.height },
    nodes,
    starHits,
    nameHits,
    nameOnStar,
    off: off.map((n) => ({ text: n.text, rect: n.rect })),
    dust: (() => {
      const d = document.querySelector('.k-syuzh__dust');
      if (!d) return null;
      const s = getComputedStyle(d);
      return { opacity: s.opacity, hasImage: s.backgroundImage !== 'none' };
    })(),
    voidRgb,
  };
});

say('вузлів на полі 11', field.count === 11, `фактично ${field.count}`);
if (field.count !== 11) defect('.k-syuzh__node', `очікувалось 11, знайдено ${field.count}`);

say('зорі не наїжджають одна на одну', field.starHits.length === 0,
  field.starHits.length ? `${field.starHits.length} пар` : '');
field.starHits.forEach((h) => defect('.k-syuzh__node',
  `кільця перетинаються: "${h.a}" і "${h.b}", центри за ${h.dist}px при потрібних ${h.need}px`));

say('підписи не перекриваються', field.nameHits.length === 0,
  field.nameHits.length ? `${field.nameHits.length} пар` : '');
field.nameHits.forEach((h) => defect('.k-syuzh__name', `підписи налазять: "${h.a}" і "${h.b}"`));

say('підпис не лягає на чужу зорю', field.nameOnStar.length === 0);
field.nameOnStar.forEach((h) => defect('.k-syuzh__name',
  `підпис "${h.label}" заходить на ${h.core ? 'ядро' : 'кільце'} зорі "${h.star}": від краю підпису до центра ${h.dist}px при радіусі тіла ${h.ring}px`));

const gaps = [];
for (let a = 0; a < field.nodes.length; a += 1) {
  for (let b = a + 1; b < field.nodes.length; b += 1) {
    const A = field.nodes[a];
    const B = field.nodes[b];
    gaps.push(Math.hypot(A.cx - B.cx, A.cy - B.cy) - A.body - B.body);
  }
}
console.log(`  найменший просвіт між кільцями: ${Math.min(...gaps).toFixed(0)}px`);

say('вузли в межах екрана', field.off.length === 0);
field.off.forEach((n) => defect('.k-syuzh__node',
  `за кадром: "${n.text}" x=${n.rect.x.toFixed(0)} y=${n.rect.y.toFixed(0)} w=${n.rect.w.toFixed(0)} h=${n.rect.h.toFixed(0)}`));

/* Зорі з розміткою і порожні кільця міряються окремо: у кільця прозорість
   0.20 стоїть у самій морфології 3.8 як зміст («поле промовчало»), і рівняти
   його на ядро означало б назвати дефектом задум. */
const lit = field.nodes.filter((n) => n.hasPlot);
const dark = field.nodes.filter((n) => !n.hasPlot);
const minLit = Math.min(...lit.map((n) => n.contrast));
const minDark = dark.length ? Math.min(...dark.map((n) => n.contrast)) : null;
const covered = field.nodes.filter((n) => n.covered);
say('зорі з сюжетом видно на фоні', minLit >= 3 && covered.length === 0,
  `мін. контраст ядра до фону ${minLit}:1`);
covered.forEach((n) => defect('.k-syuzh__node', `центр зорі "${n.text}" накритий іншим шаром`));
if (minLit < 3) defect('.k-syu__core', `контраст ядра до фону ${minLit}:1`);
say('порожні кільця не гаснуть до невидимості', minDark === null || minDark >= 1.5,
  minDark === null ? 'порожніх кілець немає' : `контраст кільця до фону ${minDark}:1 при opacity 0.20 з морфології 3.8`);

console.log('  назви вузлів:');
field.nodes.forEach((n) => console.log(`    r=${n.r.toFixed(1)} a=${n.alpha} | ${n.label}`));

await page.screenshot({ path: path.join(OUT, 'plots_field.png') });
shots.push('plots_field.png');

// Якщо підпис таки заліз на сусідку, окремий кадр показує це впритул: на
// повному полі 1280x800 таке зіткнення губиться між іншими зорями.
if (field.nameOnStar.length) {
  const hit = field.nameOnStar[0];
  const A = field.nodes.find((n) => n.text === hit.label);
  const B = field.nodes.find((n) => n.text === hit.star);
  const x1 = Math.max(0, Math.min(A.name.x, B.cx - B.body) - 40);
  const y1 = Math.max(0, Math.min(A.name.y, B.cy - B.body) - 40);
  const x2 = Math.min(VIEW.width, Math.max(A.name.x + A.name.w, B.cx + B.body) + 40);
  const y2 = Math.min(VIEW.height, Math.max(A.name.y + A.name.h, B.cy + B.body) + 40);
  await page.screenshot({
    path: path.join(OUT, 'plots_field_crowd.png'),
    clip: { x: x1, y: y1, width: x2 - x1, height: y2 - y1 },
  });
  shots.push('plots_field_crowd.png');
}

/* ------------------------------------------------------------------ */
/* 10a. Бюджет частинок на карті                                       */
/* ------------------------------------------------------------------ */

const mapParticles = await page.evaluate(() => ({
  drip: document.querySelectorAll('.k-syuzh .k-syu__drip').length,
  ray: document.querySelectorAll('.k-syuzh .k-syu__ray').length,
  swarm: document.querySelectorAll('.k-syuzh .k-syu__swarm').length,
  running: document.getAnimations().filter((a) => a.playState === 'running').length,
}));
const mapTotal = mapParticles.drip + mapParticles.ray + mapParticles.swarm;
say('частинок на карті не більше 120', mapTotal <= 120,
  `${mapTotal} (drip ${mapParticles.drip}, ray ${mapParticles.ray}, swarm ${mapParticles.swarm})`);
if (mapTotal > 120) defect('.k-syu__drip/.k-syu__ray/.k-syu__swarm', `${mapTotal} частинок при бюджеті 120`);

/* ------------------------------------------------------------------ */
/* 7. Заборона кольору                                                 */
/* ------------------------------------------------------------------ */

/* Класифікатор той самий, що в check-plots.mjs: заборонено не слово, а сигнал
   тону. Бурштин фокуса #E8A03C має hue 35 і в червоний діапазон не входить. */
async function colorAudit(scope) {
  return page.evaluate((sel) => {
    const parse = (s) => {
      const m = /rgba?\(([^)]+)\)/.exec(s || '');
      if (!m) return null;
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      if (p.length < 3 || p.slice(0, 3).some(Number.isNaN)) return null;
      return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
    };
    const hueChroma = ([r, g, b]) => {
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min;
      let h = 0;
      if (d !== 0) {
        if (max === r) h = 60 * (((g - b) / d) % 6);
        else if (max === g) h = 60 * ((b - r) / d + 2);
        else h = 60 * ((r - g) / d + 4);
      }
      return { h: (h + 360) % 360, c: d / 255 };
    };
    const tonal = (rgb) => {
      const { h, c } = hueChroma(rgb);
      if ((h >= 335 || h <= 25) && c >= 0.12) return 'червоний';
      if (h >= 70 && h < 165 && c >= 0.25) return 'зелений';
      return null;
    };
    const pathOf = (el) => {
      const bits = [];
      let n = el;
      for (let i = 0; n && n.nodeType === 1 && i < 4; i += 1) {
        const cls = (n.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).join('.');
        bits.unshift(n.tagName.toLowerCase() + (cls ? `.${cls}` : ''));
        n = n.parentElement;
      }
      return bits.join(' > ');
    };

    const host = document.querySelector(sel);
    if (!host) return { total: 0, bad: [], palette: [] };
    const all = [host, ...host.querySelectorAll('*')];
    const bad = [];
    const palette = new Map();
    all.forEach((el) => {
      const cs = getComputedStyle(el);
      ['color', 'fill', 'stroke', 'background-color', 'border-top-color', 'box-shadow'].forEach((prop) => {
        const raw = cs.getPropertyValue(prop);
        if (!raw || raw === 'none') return;
        // У box-shadow кольорів може бути кілька, тому розбираємо всі входження.
        const hits = raw.match(/rgba?\([^)]+\)/g) || [];
        hits.forEach((lit) => {
          const p = parse(lit);
          if (!p || p.a < 0.06) return;
          const key = `${p.rgb.join(',')}`;
          palette.set(key, (palette.get(key) || 0) + 1);
          const kind = tonal(p.rgb);
          if (kind) {
            const { h, c } = hueChroma(p.rgb);
            bad.push({
              sel: pathOf(el),
              prop,
              value: lit,
              kind,
              hue: Number(h.toFixed(1)),
              chroma: Number(c.toFixed(3)),
              visible: el.getBoundingClientRect().width > 0,
            });
          }
        });
      });
    });
    return {
      total: all.length,
      bad,
      palette: [...palette.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 14)
        .map(([k, v]) => `rgb(${k}) x${v}`),
    };
  }, scope);
}

const colorsField = await colorAudit('.k-syuzh');
say('на полі немає червоного і зеленого', colorsField.bad.length === 0,
  `перевірено ${colorsField.total} елементів`);
colorsField.bad.forEach((b) => defect(b.sel,
  `${b.kind}: ${b.prop}=${b.value} (hue ${b.hue}, chroma ${b.chroma})`));
console.log(`  палітра поля: ${colorsField.palette.join(' | ')}`);

/* ------------------------------------------------------------------ */
/* 2. Легенда                                                          */
/* ------------------------------------------------------------------ */

stage = '2 легенда';
await page.locator('.k-leg__btn').click();
await page.waitForTimeout(500);

const legend = await page.evaluate(() => {
  const parse = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(s || '');
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return p.length >= 3 ? { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 } : null;
  };
  const chroma = ([r, g, b]) => (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  const items = [...document.querySelectorAll('.k-syuzh-leg__item')];
  const dots = [];
  items.forEach((it) => {
    [...it.querySelectorAll('*')].forEach((el) => {
      const cs = getComputedStyle(el);
      ['fill', 'background-color', 'stroke', 'color'].forEach((p) => {
        const c = parse(cs.getPropertyValue(p));
        // Кольорова крапка це насичена фарба; бурштин фокуса сюди не потрапляє,
        // бо в спокої легенда його не вживає, а перевірка все одно його назве.
        if (c && c.a >= 0.15 && chroma(c.rgb) >= 0.12) {
          dots.push({ tag: el.tagName.toLowerCase(), cls: el.getAttribute('class') || '', prop: p, value: cs.getPropertyValue(p) });
        }
      });
    });
  });
  return {
    box: Boolean(document.querySelector('.k-syuzh-leg')),
    items: items.length,
    withSvg: items.filter((i) => i.querySelector('svg.k-syu')).length,
    labels: items.map((i) => (i.querySelector('.k-syuzh-leg__name') || {}).textContent || ''),
    dots,
  };
});

say('легенда відкрилась', legend.box);
say('мініатюр у легенді 7', legend.items === 7, `фактично ${legend.items}`);
if (legend.items !== 7) defect('.k-syuzh-leg__item', `очікувалось 7, знайдено ${legend.items}`);
say('у кожній мініатюрі є svg.k-syu', legend.withSvg === legend.items,
  `${legend.withSvg} з ${legend.items}`);
if (legend.withSvg !== legend.items) defect('.k-syuzh-leg__item svg.k-syu', `svg лише в ${legend.withSvg} з ${legend.items}`);
say('кольорових крапок у легенді немає', legend.dots.length === 0);
legend.dots.forEach((d) => defect(`${d.tag}.${d.cls}`, `насичена фарба ${d.prop}=${d.value}`));
console.log(`  підписи легенди: ${legend.labels.join(' | ')}`);

await page.screenshot({ path: path.join(OUT, 'plots_legend.png') });
shots.push('plots_legend.png');

// Мініатюра легенди це 44px, і на кадрі всього екрана шість морфологій
// зливаються в шість білих крапок. Окремий кадр самої панелі показує, чи
// справді там форма, чи все ж таки крапка.
await page.locator('.k-syuzh-leg').screenshot({ path: path.join(OUT, 'plots_legend_zoom.png') });
shots.push('plots_legend_zoom.png');

await page.locator('.k-leg__btn').click();
await page.waitForTimeout(300);

/* ------------------------------------------------------------------ */
/* 3-4. Зум-сцена і ролі на орбіті                                     */
/* ------------------------------------------------------------------ */

stage = '3 зум';
const targetIdx = field.nodes.findIndex((n) => (n.label || '').includes(TARGET));
if (targetIdx < 0) {
  say(`вузол «${TARGET}» знайдено`, false);
  defect('.k-syuzh__node', `немає вузла з aria-label, що містить «${TARGET}»`);
} else {
  say(`вузол «${TARGET}» знайдено`, true, `індекс ${targetIdx}`);
  await page.locator('.k-syuzh__node').nth(targetIdx).click();
  await page.waitForTimeout(2200);

  const zoom = await page.evaluate(() => {
    const z = document.querySelector('.k-syuzh__zoom');
    if (!z) return { exists: false };
    const txt = z.textContent || '';
    const segs = [...z.querySelectorAll('.k-syuzh__seg')].map((s) => {
      const cs = getComputedStyle(s);
      const b = s.getBoundingClientRect();
      return {
        dashoffset: cs.strokeDashoffset,
        dasharray: cs.strokeDasharray,
        opacity: cs.strokeOpacity,
        w: Number(b.width.toFixed(1)),
        h: Number(b.height.toFixed(1)),
        d: s.getAttribute('d'),
      };
    });
    const hero = z.querySelector('.k-syuzh__hero');
    const hb = hero ? hero.getBoundingClientRect() : null;
    const heroR = hb ? hb.width / 2 / 4.2 : 0;
    const heroC = hb ? { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 } : null;
    const roles = [...z.querySelectorAll('.k-syuzh__role')].map((el) => {
      const b = el.getBoundingClientRect();
      return {
        text: (el.textContent || '').trim(),
        x: Number(b.x.toFixed(1)),
        y: Number(b.y.toFixed(1)),
        w: Number(b.width.toFixed(1)),
        h: Number(b.height.toFixed(1)),
      };
    });
    const h3 = [...z.querySelectorAll('h3')].map((x) => x.textContent.trim());
    const link = [...z.querySelectorAll('button')].find((b) => /дані кейсу/.test(b.textContent || ''));
    return {
      exists: true,
      title: (z.querySelector('.k-syuzh__title') || {}).textContent || null,
      draft: (z.querySelector('.k-syuzh__draft') || {}).textContent || null,
      subject: (z.querySelector('.k-syuzh__subject') || {}).textContent || null,
      segs,
      psyLabels: [...z.querySelectorAll('.k-syuzh__psy-label')].map((x) => x.textContent.trim()),
      roles,
      heroR: Number(heroR.toFixed(1)),
      heroC,
      h3,
      speech: Boolean(z.querySelector('.k-syuzh__speech')),
      link: link ? link.textContent.trim() : null,
      cutText: [...z.querySelectorAll('.k-syuzh__cut')].map((x) => x.textContent.trim()),
      hasNaN: txt.includes('NaN'),
      view: { w: innerWidth, h: innerHeight },
      particles: {
        drip: z.querySelectorAll('.k-syu__drip').length,
        ray: z.querySelectorAll('.k-syu__ray').length,
        swarm: z.querySelectorAll('.k-syu__swarm').length,
      },
    };
  });

  say('.k-syuzh__zoom існує', zoom.exists);
  if (zoom.exists) {
    say('.k-syuzh__title є', Boolean(zoom.title), zoom.title ? `«${zoom.title}»` : '');
    if (!zoom.title) defect('.k-syuzh__title', `заголовка сцени немає; зрізи: ${zoom.cutText.join(' / ') || 'немає'}`);

    say('бейдж «чернетка до узгодження»', zoom.draft === 'чернетка до узгодження',
      zoom.draft ? `«${zoom.draft}»` : 'відсутній');
    if (zoom.draft !== 'чернетка до узгодження') defect('.k-syuzh__draft', `бейджа немає (значення ${JSON.stringify(zoom.draft)})`);

    const segOk = zoom.segs.length >= 2 && zoom.segs.length <= 3;
    say('сегментів дуги психотипів 2-3', segOk, `фактично ${zoom.segs.length}`);
    if (!segOk) defect('.k-syuzh__seg', `сегментів ${zoom.segs.length}, очікувалось 2-3`);

    const drawn = zoom.segs.filter((s) => Math.abs(parseFloat(s.dashoffset) || 0) < 1);
    say('кожен сегмент домальовано (dashoffset ~ 0)', drawn.length === zoom.segs.length,
      zoom.segs.map((s) => s.dashoffset).join(', '));
    zoom.segs.forEach((s, i) => {
      if (Math.abs(parseFloat(s.dashoffset) || 0) >= 1) {
        defect(`.k-syuzh__seg[${i}]`, `stroke-dashoffset=${s.dashoffset} при dasharray=${s.dasharray}`);
      }
      if (/NaN/.test(s.d || '')) defect(`.k-syuzh__seg[${i}]`, `NaN у d="${s.d}"`);
      if (s.w < 1 && s.h < 1) defect(`.k-syuzh__seg[${i}]`, `сегмент нульового розміру ${s.w}x${s.h}`);
    });

    const speak = zoom.h3.includes('ЯК ГОВОРИТИ');
    const avoid = zoom.h3.includes('ЧОГО УНИКАТИ');
    say('блок ЯК ГОВОРИТИ', speak);
    say('блок ЧОГО УНИКАТИ', avoid);
    if (!speak) defect('.k-syuzh__speech h3', 'заголовка ЯК ГОВОРИТИ немає');
    if (!avoid) defect('.k-syuzh__speech h3', 'заголовка ЧОГО УНИКАТИ немає');

    say('кнопка «дані кейсу»', Boolean(zoom.link), zoom.link || 'відсутня');
    if (!zoom.link) defect('.k-syuzh__link', 'переходу в досьє немає');

    say('у сцені немає тексту NaN', !zoom.hasNaN);
    if (zoom.hasNaN) defect('.k-syuzh__zoom', 'у тексті сцени трапляється NaN');

    /* 4. Ролі на орбіті. */
    say('.k-syuzh__role не більше двох', zoom.roles.length <= 2, `фактично ${zoom.roles.length}`);
    if (zoom.roles.length > 2) defect('.k-syuzh__role', `ролей ${zoom.roles.length}, ліміт 2`);

    const outRoles = zoom.roles.filter((r) => r.x < 0 || r.y < 0
      || r.x + r.w > zoom.view.w || r.y + r.h > zoom.view.h);
    say('ролі в межах екрана', outRoles.length === 0);
    outRoles.forEach((r) => defect('.k-syuzh__role',
      `за межами екрана: x=${r.x} y=${r.y} w=${r.w} h=${r.h} при вікні ${zoom.view.w}x${zoom.view.h} · «${r.text}»`));

    const onStar = zoom.heroC ? zoom.roles.filter((r) => {
      const px = Math.max(r.x, Math.min(zoom.heroC.x, r.x + r.w));
      const py = Math.max(r.y, Math.min(zoom.heroC.y, r.y + r.h));
      return Math.hypot(px - zoom.heroC.x, py - zoom.heroC.y) < zoom.heroR * 1.6;
    }) : [];
    say('ролі не налазять на зорю', onStar.length === 0,
      `радіус тіла зорі ${(zoom.heroR * 1.6).toFixed(0)}px`);
    onStar.forEach((r) => defect('.k-syuzh__role', `перекриває кільце зорі: «${r.text}» x=${r.x} y=${r.y}`));

    const zoomTotal = zoom.particles.drip + zoom.particles.ray + zoom.particles.swarm;
    say('частинок у зум-сцені не більше 40', zoomTotal <= 40,
      `${zoomTotal} (drip ${zoom.particles.drip}, ray ${zoom.particles.ray}, swarm ${zoom.particles.swarm})`);
    if (zoomTotal > 40) defect('.k-syuzh__zoom .k-syu__*', `${zoomTotal} частинок при бюджеті 40`);

    console.log(`  психотипи: ${zoom.psyLabels.join(' | ')}`);
    console.log(`  ролі: ${zoom.roles.map((r) => r.text).join(' | ') || 'немає'}`);
  }

  const colorsZoom = await colorAudit('.k-syuzh__zoom');
  say('у зум-сцені немає червоного і зеленого', colorsZoom.bad.length === 0,
    `перевірено ${colorsZoom.total} елементів`);
  colorsZoom.bad.forEach((b) => defect(b.sel,
    `${b.kind}: ${b.prop}=${b.value} (hue ${b.hue}, chroma ${b.chroma})`));

  await page.screenshot({ path: path.join(OUT, 'plots_zoom.png') });
  shots.push('plots_zoom.png');

  /* ---------------------------------------------------------------- */
  /* 5. Вихід по Escape                                                */
  /* ---------------------------------------------------------------- */

  stage = '5 вихід';
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  const back = await page.evaluate(() => ({
    zoom: document.querySelectorAll('.k-syuzh__zoom').length,
    nodes: document.querySelectorAll('.k-syuzh__node').length,
    visible: [...document.querySelectorAll('.k-syuzh__node')]
      .filter((n) => n.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(n).opacity) > 0.05).length,
    hash: location.hash,
  }));
  say('Escape закрив зум-сцену', back.zoom === 0, `.k-syuzh__zoom x${back.zoom}, hash ${back.hash}`);
  if (back.zoom !== 0) defect('.k-syuzh__zoom', `після Escape сцена лишилась (hash ${back.hash})`);
  say('вузли знову видимі', back.visible === 11, `${back.visible} з ${back.nodes}`);
  if (back.visible !== 11) defect('.k-syuzh__node', `видимих вузлів ${back.visible} з ${back.nodes}`);

  await page.screenshot({ path: path.join(OUT, 'plots_back.png') });
  shots.push('plots_back.png');
}

/* ------------------------------------------------------------------ */
/* 6. Порожнє кільце і його причина                                    */
/* ------------------------------------------------------------------ */

stage = '6 порожнє кільце';
const emptyIdx = field.nodes.findIndex((n) => / · /.test(n.label || ''));
if (emptyIdx < 0) {
  say('вузол без розмітки знайдено', false);
  defect('.k-syuzh__node', 'жоден aria-label не містить причини зрізання');
} else {
  say('вузол без розмітки знайдено', true, `«${field.nodes[emptyIdx].label}»`);
  await page.locator('.k-syuzh__node').nth(emptyIdx).hover();
  await page.waitForTimeout(400);
  const tip = await page.evaluate(() => {
    const t = document.querySelector('.k-syuzh__tip');
    if (!t) return { exists: false };
    const b = t.getBoundingClientRect();
    return {
      exists: true,
      text: (t.textContent || '').trim(),
      why: (t.querySelector('.k-syuzh__tip-why') || {}).textContent || null,
      draft: (t.querySelector('.k-syuzh__draft') || {}).textContent || null,
      inView: b.x >= 0 && b.y >= 0 && b.x + b.width <= innerWidth && b.y + b.height <= innerHeight,
      rect: { x: Number(b.x.toFixed(0)), y: Number(b.y.toFixed(0)), w: Number(b.width.toFixed(0)), h: Number(b.height.toFixed(0)) },
    };
  });
  say('.k-syuzh__tip зʼявився', tip.exists);
  if (!tip.exists) defect('.k-syuzh__tip', 'наведення на порожнє кільце не дало тултіпа');
  else {
    say('тултіп називає причину', Boolean(tip.why), tip.why ? `«${tip.why}»` : 'причини немає');
    if (!tip.why) defect('.k-syuzh__tip-why', `причини в тултіпі немає, текст: «${tip.text}»`);
    // Межі кадру перевіряються нижче обходом усіх вузлів, тут тільки замір.
    console.log(`  рамка тултіпа: ${JSON.stringify(tip.rect)}, у кадрі: ${tip.inView}`);
  }
  await page.screenshot({ path: path.join(OUT, 'plots_empty.png') });
  shots.push('plots_empty.png');
}

/* Тултіп ставиться від центра вузла з transform: translate(-50%, -100%), тож
   у крайніх зір він виїжджає за кадр. Обходимо всі вузли і рахуємо, скільки
   саме: одна зоря це випадковість, кілька це правило розкладки. */
const tips = [];
for (let i = 0; i < field.count; i += 1) {
  await page.locator('.k-syuzh__node').nth(i).hover();
  // Чекаємо не час, а СВІЙ тултіп. Час тут не працює: у циклі по одинадцяти
  // вузлах фіксована пауза раз у раз ловила кадр, де стиль уже новий, а рамка
  // ще стара, і перевірка тричі поспіль звинувачувала тултіп у виїзді за край,
  // якого в усталеному стані немає (переміряно поштучно: усі одинадцять стоять
  // там, де мають). Чекати на власний текст надійніше за будь-яку паузу.
  await page.waitForFunction((name) => {
    const el = document.querySelector('.k-syuzh__tip');
    return el && el.textContent.startsWith(name.slice(0, 12));
  }, (field.nodes[i].label || '').split(' · ')[0], { timeout: 4000 }).catch(() => {});
  // Тултіп їде разом з паралаксом, тому міряти його одразу після наведення
  // означає ловити півдороги: чекаємо, поки шар доповзе. 400 мс не вистачало і
  // давало неспокійні заміри (рамка від попереднього наведення при вже новому
  // left), через що перевірка тричі поспіль обвинувачувала тултіп у виїзді за
  // край, якого в усталеному стані немає. Перевірено прямим замiром: на 600 мс
  // усі одинадцять тултіпів стоять там, де мають.
  await page.waitForTimeout(700);
  // eslint-disable-next-line no-await-in-loop
  const t = await page.evaluate((idx) => {
    const el = document.querySelector('.k-syuzh__tip');
    if (!el) return null;
    const b = el.getBoundingClientRect();
    // Тултіп мав би стояти над своєю зорею. Різниця центрів показує, чи він
    // просто не вміщається біля краю, чи взагалі зʼїхав від свого вузла.
    const host = document.querySelectorAll('.k-syuzh__node')[idx];
    const hb = host.querySelector('svg.k-syu').getBoundingClientRect();
    return {
      name: (el.childNodes[0] || {}).textContent || '',
      drift: Math.round((b.x + b.width / 2) - (hb.x + hb.width / 2)),
      starX: Math.round(hb.x + hb.width / 2),
      x: Math.round(b.x),
      y: Math.round(b.y),
      w: Math.round(b.width),
      h: Math.round(b.height),
      out: [
        b.x < 0 ? `лівий край на ${Math.round(b.x)}` : null,
        b.y < 0 ? `верхній край на ${Math.round(b.y)}` : null,
        b.x + b.width > innerWidth ? `правий край на ${Math.round(b.x + b.width - innerWidth)}px за екраном` : null,
        b.y + b.height > innerHeight ? `нижній край на ${Math.round(b.y + b.height - innerHeight)}px за екраном` : null,
      ].filter(Boolean),
    };
  }, i);
  if (t) tips.push({ ...t, node: (field.nodes[i].label || '').split(' · ')[0] });
}
const tipsOut = tips.filter((t) => t.out.length);
say('жоден тултіп не виїжджає за екран', tipsOut.length === 0,
  `${tipsOut.length} з ${tips.length}`);
tipsOut.forEach((t) => defect('.k-syuzh__tip',
  `вузол «${t.node}»: ${t.out.join('; ')} (рамка x=${t.x} y=${t.y} ${t.w}x${t.h}, зоря на x=${t.starX})`));

// Зсув від центра зорі сам по собі не дефект: тултіп притискається до кадру,
// і біля країв екрана він ЗОБОВʼЯЗАНИЙ зсунутись, інакше половина причини
// зрізання лишиться за бортом. Дефект це зсув там, де притискання не потрібне,
// тобто коли тултіп і без нього повністю влазив у кадр.
const drift = tips.filter((t) => {
  if (Math.abs(t.drift) <= 8) return false;
  // Межа тут це СЦЕНА, а не вікно: тултіп живе всередині поля вкладки і
  // притискається до його країв, тому зоря біля краю сцени законно тягне
  // тултіп до себе, навіть якщо у вікні місце ще формально є.
  const halfW = t.w / 2;
  return t.starX - halfW >= field.rect.x && t.starX + halfW <= field.rect.x + field.rect.w;
});
say('тултіп стоїть над своєю зорею або притиснутий до кадру', drift.length === 0,
  `безпідставний зсув у ${drift.length} з ${tips.length}`);
drift.forEach((t) => defect('.k-syuzh__tip',
  `зсунутий на ${t.drift}px від центра зорі «${t.node}» (зоря x=${t.starX}, тултіп x=${t.x} w=${t.w})`));

console.log('  рамки тултіпів:');
tips.forEach((t) => console.log(`    зоря x=${t.starX} · тултіп x=${t.x} w=${t.w} зсув ${t.drift} | ${t.node}`));
await page.mouse.move(640, 60);
await page.waitForTimeout(200);

/* ------------------------------------------------------------------ */
/* 9b. NaN в атрибутах SVG                                             */
/* ------------------------------------------------------------------ */

stage = '9 NaN';
const nan = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('.k-syuzh *, .k-syuzh-leg *').forEach((el) => {
    [...el.attributes].forEach((a) => {
      if (/NaN|undefined|Infinity/.test(a.value)) {
        out.push({ tag: el.tagName.toLowerCase(), cls: el.getAttribute('class') || '', attr: a.name, value: a.value.slice(0, 120) });
      }
    });
  });
  return out;
});
say('в атрибутах немає NaN/undefined', nan.length === 0);
nan.forEach((n) => defect(`${n.tag}.${n.cls}`, `${n.attr}="${n.value}"`));

/* ------------------------------------------------------------------ */
/* 8. prefers-reduced-motion                                           */
/* ------------------------------------------------------------------ */

stage = '8 reduced-motion';
const rm = await browser.newPage({ viewport: VIEW, reducedMotion: 'reduce' });
listen(rm, 'reduced');
await rm.goto(`${pathToFileURL(DIST).href}${HASH}`, { waitUntil: 'load' });
await rm.evaluate(() => {
  sessionStorage.setItem('kamerton.intro', '1');
  sessionStorage.setItem('kamerton.onboarded', '1');
});
await rm.reload({ waitUntil: 'load' });
await rm.waitForTimeout(1400);

const rmField = await rm.evaluate(() => {
  const nodes = [...document.querySelectorAll('.k-syuzh__node')];
  return {
    count: nodes.length,
    opaque: nodes.filter((n) => parseFloat(getComputedStyle(n).opacity) > 0).length,
    names: nodes.filter((n) => {
      const s = n.querySelector('.k-syuzh__name');
      if (!s) return false;
      const b = s.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && parseFloat(getComputedStyle(s).opacity) > 0;
    }).length,
    running: document.getAnimations().filter((a) => a.playState === 'running').length,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
});
say('reduced: медіа-запит справді ввімкнено', rmField.reduced);
say('reduced: усі вузли з opacity > 0', rmField.opaque === rmField.count,
  `${rmField.opaque} з ${rmField.count}`);
if (rmField.opaque !== rmField.count) defect('.k-syuzh__node', `без руху прозорими лишились ${rmField.count - rmField.opaque} вузлів`);
say('reduced: підписи на місці', rmField.names === rmField.count, `${rmField.names} з ${rmField.count}`);
if (rmField.names !== rmField.count) defect('.k-syuzh__name', `видимих підписів ${rmField.names} з ${rmField.count}`);
say('reduced: рух зупинено', rmField.running === 0, `запущених анімацій ${rmField.running}`);
if (rmField.running > 0) {
  const names = await rm.evaluate(() => [...new Set(document.getAnimations()
    .filter((a) => a.playState === 'running')
    .map((a) => a.animationName || a.constructor.name))]);
  defect('document.getAnimations()', `при reduced-motion крутиться ${rmField.running}: ${names.join(', ')}`);
}

await rm.screenshot({ path: path.join(OUT, 'plots_reduced.png') });
shots.push('plots_reduced.png');

if (targetIdx >= 0) {
  await rm.locator('.k-syuzh__node').nth(targetIdx).click();
  await rm.waitForTimeout(1200);
  const rmZoom = await rm.evaluate(() => {
    const z = document.querySelector('.k-syuzh__zoom');
    if (!z) return { exists: false };
    const cs = getComputedStyle(z);
    const segs = [...z.querySelectorAll('.k-syuzh__seg')].map((s) => getComputedStyle(s).strokeDashoffset);
    const steps = [...z.querySelectorAll('.k-syuzh__step')]
      .map((s) => parseFloat(getComputedStyle(s).opacity));
    return {
      exists: true,
      opacity: cs.opacity,
      title: (z.querySelector('.k-syuzh__title') || {}).textContent || null,
      segs,
      minStep: steps.length ? Math.min(...steps) : 1,
      roles: z.querySelectorAll('.k-syuzh__role').length,
      running: document.getAnimations().filter((a) => a.playState === 'running').length,
    };
  });
  say('reduced: зум-сцена відкривається', rmZoom.exists);
  if (!rmZoom.exists) defect('.k-syuzh__zoom', 'при reduced-motion сцена не відкрилась');
  else {
    say('reduced: сцена читається', Number(rmZoom.opacity) > 0.9 && rmZoom.minStep > 0.9 && Boolean(rmZoom.title),
      `opacity ${rmZoom.opacity}, мін. крок ${rmZoom.minStep}, заголовок «${rmZoom.title}»`);
    if (!(Number(rmZoom.opacity) > 0.9)) defect('.k-syuzh__zoom', `opacity ${rmZoom.opacity} при reduced-motion`);
    if (!(rmZoom.minStep > 0.9)) defect('.k-syuzh__step', `найпрозоріший крок сцени ${rmZoom.minStep} при reduced-motion`);
    const undrawn = rmZoom.segs.filter((s) => Math.abs(parseFloat(s) || 0) >= 1);
    say('reduced: дуга психотипів домальована', undrawn.length === 0, rmZoom.segs.join(', '));
    if (undrawn.length) defect('.k-syuzh__seg', `при reduced-motion лишились недомальовані: ${undrawn.join(', ')}`);
  }
  await rm.screenshot({ path: path.join(OUT, 'plots_reduced_zoom.png') });
  shots.push('plots_reduced_zoom.png');
}

await rm.close();
await browser.close();

/* ------------------------------------------------------------------ */
/* Підсумок                                                            */
/* ------------------------------------------------------------------ */

console.log('\n--- консоль ---');
if (!noise.length) console.log('чисто: ні error, ні warning, ні pageerror');
noise.forEach((n) => console.log(`  [${n.tag}/${n.stage}] ${n.kind}: ${n.text.slice(0, 400)}`));
noise.forEach((n) => defect(`консоль (${n.stage})`, `${n.kind}: ${n.text.slice(0, 240)}`));

console.log('\n--- знімки ---');
shots.forEach((s) => console.log(`  SPEC_NOTES/shots/${s}`));

const failed = checks.filter((c) => !c.ok);
console.log(`\nперевірок ${checks.length}, провалено ${failed.length}, дефектів ${defects.length}`);

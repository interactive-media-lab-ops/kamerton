// КАМЕРТОН · стан у адресі (E1).
//
// Формат: #w32/temy/tck  тобто тиждень / шар / вузол.
// Вузол необовʼязковий, шар необовʼязковий: #w32 теж валідний.
//
// Навіщо: досі стан жив тільки в памʼяті вкладки. Керівник не міг переслати
// «подивись оцю тему», а показ не можна було відкрити з потрібного кадру.
// Тепер адреса це і є стан.
//
// Ідентифікатори шарів у адресі українські, бо адресу читає людина, а не машина:
// #w32/temy/tck зрозуміле з першого погляду, #w32/topics/tck ні.

const LAYER_TO_SLUG = { topics: 'temy', actors: 'aktory', ensemble: 'kompas', plots: 'siuzhety', graviton: 'graviton' };
const SLUG_TO_LAYER = { temy: 'topics', aktory: 'actors', kompas: 'ensemble', siuzhety: 'plots', graviton: 'graviton' };

/** '2026-W32' -> 'w32' */
export function weekSlug(weekId) {
  const m = String(weekId || '').match(/W(\d{1,2})$/);
  return m ? `w${m[1]}` : '';
}

/** 'w32' -> '2026-W32', але тільки якщо такий тиждень справді є у списку. */
export function weekFromSlug(slug, weeks) {
  const m = String(slug || '').match(/^w(\d{1,2})$/i);
  if (!m) return null;
  const want = Number(m[1]);
  const hit = (weeks || []).find((w) => {
    const p = String(w.id ?? w).match(/W(\d{1,2})$/);
    return p && Number(p[1]) === want;
  });
  return hit ? (hit.id ?? hit) : null;
}

/**
 * Розбір адреси. Нічого не валідує проти даних, крім формату: перевірку
 * «чи існує такий тиждень» робить викликач, бо тільки він знає список.
 */
export function parseHash(hash = window.location.hash) {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw) return {};
  const parts = raw.split('/');
  const [weekPart, layerPart, nodePart] = parts;
  const out = {};
  if (weekPart) out.weekSlug = weekPart;
  // F3: #w32/case/{id}/precedents. Режим це стан, тому він теж в адресі:
  // кадр порівняння має пересилатись так само, як і будь-який інший.
  // Тиждень лишається розібраним: режим не скидає його на дефолтний.
  if (layerPart === 'case' && parts[3] === 'precedents') {
    out.precedents = decodeURIComponent(nodePart || '');
    return out;
  }
  if (layerPart && SLUG_TO_LAYER[layerPart]) out.layer = SLUG_TO_LAYER[layerPart];
  if (nodePart) out.nodeId = decodeURIComponent(nodePart);
  return out;
}

/** Збирає адресу зі стану. Порожні хвости не пишемо: #w32 замість #w32//. */
export function buildHash({ weekId, layer, nodeId, precedents }) {
  if (precedents) {
    return `#${weekSlug(weekId)}/case/${encodeURIComponent(precedents)}/precedents`;
  }
  const parts = [weekSlug(weekId)];
  if (layer && LAYER_TO_SLUG[layer]) parts.push(LAYER_TO_SLUG[layer]);
  if (nodeId && layer) parts.push(encodeURIComponent(nodeId));
  return '#' + parts.filter(Boolean).join('/');
}

/**
 * Записує стан в адресу без нового запису в історії.
 * replaceState, а не pushState: кожен клік по вузлу окремим кроком історії
 * перетворив би кнопку «назад» на розкадровку, а не на навігацію.
 */
export function writeHash(state) {
  const next = buildHash(state);
  if (next === window.location.hash) return;
  window.history.replaceState(null, '', next);
}

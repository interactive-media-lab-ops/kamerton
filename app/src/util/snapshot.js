// КАМЕРТОН · знімок кадру карти в PNG (E2).
//
// Це міст до паперового контуру: кадр вставляють у docx-звіт, а не пересилають
// посилання. Тому імʼя файлу мусить самоописуватись у теці серед сотні інших:
// kamerton_W32_temy.png, а не screenshot(3).png.
//
// Полотно нічим зовнішнім не забруднене (портрети прибрані в C8, малюємо тільки
// векторно), тому toBlob працює і на file:// без tainted-canvas.

const LAYER_SLUG = { topics: 'temy', actors: 'aktory', ensemble: 'kompas' };

/** '2026-W32' -> 'W32' */
function weekTag(weekId) {
  const m = String(weekId || '').match(/W(\d{1,2})$/);
  return m ? `W${m[1]}` : 'week';
}

export function snapshotName(weekId, layer) {
  return `kamerton_${weekTag(weekId)}_${LAYER_SLUG[layer] || layer || 'map'}.png`;
}

/**
 * Знімає полотно карти у PNG і віддає користувачу.
 *
 * Тло домальовується окремо: полотно прозоре там, де фон малює CSS, і без
 * підкладки знімок відкривався б чорним по прозорому, тобто в редакторі звіту
 * ставав би нечитабельним.
 */
export async function saveMapPng(canvas, { weekId, layer, background } = {}) {
  if (!canvas) return false;

  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d');
  if (!ctx) return false;

  ctx.fillStyle = background || '#0A1713';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);

  const blob = await new Promise((res) => out.toBlob(res, 'image/png'));
  if (!blob) return false;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = snapshotName(weekId, layer);
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Відкликаємо не одразу: Safari встигає загубити завантаження, якщо URL
  // помирає в тому ж такті, що й клік.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

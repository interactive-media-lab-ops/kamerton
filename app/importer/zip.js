// Мінімальний писар ZIP, метод STORE (без стиснення).
//
// Навіщо свій, а не бібліотека: архів пакує два-три текстові файли на кілька
// сотень кілобайт. Тягнути заради цього залежність, яку доведеться оновлювати
// і перевіряти, дорожче за шістдесят рядків, що роблять рівно одну річ.
//
// STORE замість DEFLATE свідомо: різниця в розмірі для JSON помітна, але архів
// тут не для економії місця, а для того, щоб вхід тижня лежав одним файлом
// поруч із випуском. Простий формат означає, що його відкриє будь-що.

/** CRC32, таблиця рахується один раз на завантаження. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** Дата у форматі MS-DOS, як того вимагає специфікація ZIP. */
function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

/**
 * @param {Array<{name: string, text: string}>} files
 * @param {Date} at час, зафіксований у записах архіву
 * @returns {Blob}
 */
export function makeZip(files, at = new Date()) {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(at);
  const chunks = [];
  const central = [];
  let offset = 0;

  files.forEach((f) => {
    const name = enc.encode(f.name);
    const data = enc.encode(f.text);
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); // сигнатура локального заголовка
    local.setUint16(4, 20, true);         // версія, потрібна для розпакування
    local.setUint16(6, 0x0800, true);     // прапорець: імена в UTF-8
    local.setUint16(8, 0, true);          // метод: 0 = STORE
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);

    chunks.push(new Uint8Array(local.buffer), name, data);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true);
    cen.setUint16(12, time, true);
    cen.setUint16(14, date, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, data.length, true);
    cen.setUint32(24, data.length, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);

    offset += 30 + name.length + data.length;
  });

  const centralSize = central.reduce((a, c) => a + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], {
    type: 'application/zip',
  });
}

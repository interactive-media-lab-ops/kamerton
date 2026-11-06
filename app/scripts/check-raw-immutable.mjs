// КАМЕРТОН · сторож сирих даних.
//
// Правило 1 корпусу: сирі дані тижнів недоторканні, жоден скрипт у них не пише.
// Це правило вже було порушене одного разу мовчки (prebuild дописував знімки
// історії з датою «сьогодні»), і помітили це лише через порівняння хешів.
// Тому перевірка автоматична: рахуємо хеш кожного файлу в data/raw до повного
// перерахунку похідних і після нього. Розбіжність валить збірку.
//
// Запуск: npm run check:raw-immutable

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const RAW_DIR = path.join(root, 'src', 'data', 'raw');

function hashDir(dir) {
  if (!fs.existsSync(dir)) {
    console.error(`теки сирих даних немає: ${dir}`);
    process.exit(1);
  }
  const out = {};
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (!fs.statSync(full).isFile()) continue;
    out[name] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
  }
  return out;
}

const before = hashDir(RAW_DIR);
const names = Object.keys(before);
if (!names.length) {
  console.error('у data/raw немає жодного файлу: перевіряти нічого');
  process.exit(1);
}

// Проганяємо саме той шлях, який колись і псував сирці.
try {
  // Викликаємо скрипт перерахунку напряму тим самим node, а не через npm.
  // Node 24 на Windows відмовляється запускати npm.cmd без shell (EINVAL),
  // а shell:true склеює аргументи рядком і дає попередження безпеки.
  // Прямий виклик обходить обидві пастки і не залежить від PATH.
  execFileSync(process.execPath, [path.join(root, 'scripts', 'ensemble-build.mjs')], {
    stdio: 'pipe',
    cwd: root,
  });
} catch (e) {
  console.error('перерахунок похідних впав, перевірку незмінності не завершено:');
  console.error(String(e.stdout || '') + String(e.stderr || ''));
  process.exit(1);
}

const after = hashDir(RAW_DIR);
const changed = names.filter((n) => before[n] !== after[n]);
const vanished = names.filter((n) => !(n in after));

if (changed.length || vanished.length) {
  console.error('СИРІ ДАНІ ЗМІНИЛИСЬ ПІД ЧАС ЗБІРКИ. Це заборонено правилом 1.');
  changed.forEach((n) => console.error(`  змінено: ${n}\n    до:    ${before[n]}\n    після: ${after[n]}`));
  vanished.forEach((n) => console.error(`  зникло: ${n}`));
  process.exit(1);
}

console.log(`сирці недоторкані: ${names.length} файл(ів), хеші збігаються`);
names.forEach((n) => console.log(`  ${n}  ${before[n].slice(0, 16)}…`));

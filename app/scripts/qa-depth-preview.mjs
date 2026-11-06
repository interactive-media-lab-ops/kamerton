// КАМЕРТОН · тимчасовий QA-стан Глибинного шару для приймання інтерфейсу.
//
// Розділ 16 спеки пускає на екран тільки `validated`, і фільтр стоїть на
// завантаженні. Це правильно для продукту і незручно рівно один раз: коли
// замовник приймає САМ інтерфейс, а розмітка ще чекає на узгодження довідника.
//
// Скрипт піднімає статус тимчасово і повертає його назад. Підпис при цьому
// НЕ ставиться: у `validated_by` стоїть явна позначка, що це стан приймання,
// а не людське ревʼю змісту.
//
//   npm run qa:preview        підняти
//   npm run qa:preview -- off повернути
//
// Після кожного виклику треба перезібрати: npm run build

import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join(process.cwd(), 'src', 'data', 'corpus', 'depth');
const MARK = 'QA · приймання інтерфейсу, не підпис';
const off = process.argv[2] === 'off';

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'));
let touched = 0;

files.forEach((f) => {
  const p = path.join(DIR, f);
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (off) {
    // Повертаємо тільки те, що підняв цей скрипт: справжній підпис не чіпаємо.
    if (m.validated_by !== MARK) return;
    m.status = 'draft_for_alignment';
    delete m.validated_by;
    delete m.validated_date;
  } else {
    if (m.status === 'validated') return;
    m.status = 'validated';
    m.validated_by = MARK;
    m.validated_date = '2026-08-18';
  }
  fs.writeFileSync(p, `${JSON.stringify(m, null, 2)}\n`, 'utf8');
  touched += 1;
});

console.log(off
  ? `повернуто в draft_for_alignment: ${touched}`
  : `піднято в тимчасовий QA-статус: ${touched}`);
console.log('далі: npm run build:depth && npm run build');

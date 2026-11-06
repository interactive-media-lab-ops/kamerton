// КАМЕРТОН · валідатор корпусу прецедентів (каркас F1).
//
// Порожній корпус це ВАЛІДНИЙ стан: ворота F0 не пройдені, і до їх проходження
// в корпусі нічого й не має бути. Скрипт існує вже зараз, щоб перший доданий
// людиною кейс одразу зустрів правила, а не збирався «як вийде».
//
// Запуск: npm run check:corpus

import fs from 'node:fs';
import path from 'node:path';
import { validateCorpus, formatIssues, outcomeDistribution } from '../src/data/schema.js';

const root = process.cwd();
const DIR = path.join(root, 'src', 'data', 'corpus', 'precedents');
const dict = JSON.parse(
  fs.readFileSync(path.join(root, 'src', 'data', 'registry', 'class_tags.json'), 'utf8')
);
const phases = JSON.parse(
  fs.readFileSync(path.join(root, 'src', 'data', 'registry', 'phases.json'), 'utf8')
);

if (!fs.existsSync(DIR)) {
  console.error(`теки корпусу немає: ${DIR}`);
  process.exit(1);
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'));
const cases = [];
const readErrors = [];

files.forEach((f) => {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    // Імʼя файлу мусить збігатися з id: інакше кейс неможливо знайти руками.
    if (c.id && `${c.id}.json` !== f) {
      readErrors.push({ level: 'error', where: f, message: `імʼя файлу не збігається з id «${c.id}».` });
    }
    cases.push(c);
  } catch (e) {
    readErrors.push({ level: 'error', where: f, message: `не JSON: ${e.message}` });
  }
});

const issues = [...readErrors, ...validateCorpus(cases, dict)];
const errors = issues.filter((i) => i.level === 'error');

if (errors.length) {
  console.error(`корпус не проходить валідацію, помилок: ${errors.length}\n`);
  console.error(formatIssues(errors));
  process.exit(1);
}

if (!cases.length) {
  console.log('корпус порожній: ворота F0 не пройдені, це очікуваний стан');
  console.log(`  словники: класів ${dict.class_tags.length}, наслідків ${dict.outcome_codes.length}, фаз ${phases.phases.length}`);
  process.exit(0);
}

// Розподіли рахуються без seeded-кейсів (правило 8) і це видно у звіті.
console.log(`корпус валідний: кейсів ${cases.length}`);
dict.class_tags.forEach((t) => {
  const d = outcomeDistribution(cases, t.id);
  if (!d.n && !d.excluded_seeded) return;
  const parts = d.buckets.map((b) => `${b.outcome_code} ${b.k}`).join(', ');
  console.log(`  ${t.label}: n=${d.n}${d.excluded_seeded ? ` (seeded виключено: ${d.excluded_seeded})` : ''}` +
    (parts ? ` · ${parts}` : ''));
});

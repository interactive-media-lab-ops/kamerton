// КАМЕРТОН · валідатор контракту.
//
// Один валідатор на в'ювер і на майбутній імпортер: дві копії правил розходяться
// мовчки, і саме так у корпус потрапила третя форма method_notes.
//
// Перевіряє:
//   1. обовʼязкові поля тижня і схему кожної сутності (Zod-подібні правила з schema.js);
//   2. посилальну цілісність: жоден id у тижні не має бути невідомим реєстру (B5);
//   3. однорідність форм там, де корпус уже розʼїхався (method_notes).
//
// Повідомлення українською, з шляхом до поля: помилка контракту має читатись
// редактором тижня, а не лише розробником.
//
// Запуск: npm run check:contract

import fs from 'node:fs';
import path from 'node:path';
import { validateContract, formatIssues, toJsonSchema } from '../src/data/schema.js';

const root = process.cwd();
const raw = JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'raw', 'weeks.json'), 'utf8'));
const reg = {
  topics: JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'registry', 'topics.json'), 'utf8')),
  actors: JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'registry', 'actors.json'), 'utf8')),
  cases: JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'registry', 'cases.json'), 'utf8')),
};

const issues = validateContract(raw, reg);
const errors = issues.filter((i) => i.level === 'error');
const warnings = issues.filter((i) => i.level === 'warning');

if (warnings.length) {
  console.warn(`попереджень: ${warnings.length}`);
  console.warn(formatIssues(warnings));
}

if (errors.length) {
  console.error(`\nконтракт не проходить валідацію, помилок: ${errors.length}\n`);
  console.error(formatIssues(errors));
  process.exit(1);
}

// Експорт у JSON Schema для зовнішніх інструментів і майбутнього імпортера:
// правила лишаються в одному екземплярі, назовні їде згенерована копія.
const docsDir = path.join(root, '..', 'docs');
fs.mkdirSync(docsDir, { recursive: true });
fs.writeFileSync(
  path.join(docsDir, 'kamerton.schema.json'),
  JSON.stringify(toJsonSchema(), null, 2) + '\n'
);

const weeks = raw.weeks.length;
console.log(`контракт валідний: тижнів ${weeks}, тем у реєстрі ${reg.topics.length}, ` +
  `акторів ${reg.actors.length}, кейсів ${reg.cases.length}` +
  (warnings.length ? `, попереджень ${warnings.length}` : ''));

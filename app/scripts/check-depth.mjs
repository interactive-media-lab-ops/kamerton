// КАМЕРТОН · валідатор розмітки Глибинного шару (спека 0.3).
//
// Порожня тека це ВАЛІДНИЙ стан. Скрипт існує для того, щоб кожна розмітка
// одразу зустрічала правила розділів 4, 5, 8 і 9, а не збиралась «як вийде».
//
// Запуск: npm run check:depth

import fs from 'node:fs';
import path from 'node:path';
import {
  validateDepthMarkups, validateLensDictionary, formatIssues, depthBlock,
  depthAllLensesCut, depthGoesToReport, DEPTH_BLOCK_MAX_LINES, DEPTH_LINE_MAX_CHARS,
} from '../src/data/schema.js';

const root = process.cwd();
const DIR = path.join(root, 'src', 'data', 'corpus', 'depth');
const read = (...p) => JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', ...p), 'utf8'));

const lenses = read('registry', 'lenses.json');
const registries = {
  cases: read('registry', 'cases.json'),
  actors: read('registry', 'actors.json'),
  topics: read('registry', 'topics.json'),
};

if (!fs.existsSync(DIR)) {
  console.error(`теки розмітки немає: ${DIR}`);
  process.exit(1);
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'));
const markups = [];
const readErrors = [];

files.forEach((f) => {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    // Імʼя файлу мусить збігатися з id: інакше розмітку не знайти руками.
    if (m.id && `${m.id}.json` !== f) {
      readErrors.push({ level: 'error', where: f, message: `імʼя файлу не збігається з id «${m.id}».` });
    }
    markups.push(m);
  } catch (e) {
    readErrors.push({ level: 'error', where: f, message: `не JSON: ${e.message}` });
  }
});

const issues = [
  ...readErrors,
  ...validateLensDictionary(lenses),
  ...validateDepthMarkups(markups, lenses, registries),
];
const errors = issues.filter((i) => i.level === 'error');
const warnings = issues.filter((i) => i.level === 'warning');

if (errors.length) {
  console.error(`розмітка не проходить валідацію, помилок: ${errors.length}\n`);
  console.error(formatIssues(errors));
  process.exit(1);
}

// Стан тригерів видно при кожному запуску: це мітигація ризику 4, і чернеткове
// формулювання має іншу вагу в суперечці розмітників, ніж затверджене.
const positions = [...lenses.plots, ...lenses.roles];
const draftTriggers = positions.filter((x) => x.triggers_status === 'draft').length;
const dictLine = `  довідник v1: сюжетів ${lenses.plots.length}, ролей ${lenses.roles.length}, ` +
  `психотипів ${lenses.psychotypes.length}; тригери по 3 на позицію` +
  (draftTriggers ? `, статус чернетки: ${draftTriggers} з ${positions.length}` : '');

if (!markups.length) {
  console.log('розмітки немає: пілот Глибинного шару не проходив, це очікуваний стан');
  console.log(dictLine);
  process.exit(0);
}

// Заголовок блоку це назва предмета: кейса або теми. Коротка назва теми
// (B4) тут доречніша за повну: блок і так живе під лімітом 120 знаків.
const titles = new Map([
  ...registries.cases.map((c) => [c.id, c.title]),
  ...registries.topics.map((t) => [t.id, t.short_name || t.full_name || t.name]),
]);
const STATUS_MARK = {
  draft_for_alignment: 'ІЛЮСТРАЦІЯ ДЛЯ УЗГОДЖЕННЯ · не для звіту',
  draft: 'ЧЕРНЕТКА · до ревʼю',
  validated: 'валідовано',
};

console.log(`розмітка валідна: кейсів ${markups.length}, ліміти ${DEPTH_BLOCK_MAX_LINES} рядків / ${DEPTH_LINE_MAX_CHARS} знаків`);
console.log(dictLine);
console.log(`  у звіт іде: ${markups.filter(depthGoesToReport).length}` +
  `, усі лінзи зрізані: ${markups.filter(depthAllLensesCut).length}`);

markups.forEach((m) => {
  // Ілюстрація друкується з примітками: на зустрічі обговорюється міркування,
  // а не тільки підсумковий рядок. У звіт іде та сама функція без приміток.
  const forMeeting = m.status === 'draft_for_alignment';
  const lines = depthBlock(m, lenses, titles.get(m.case_id || m.topic_id), { notes: forMeeting });
  const width = Math.max(...lines.map((l) => l.length));
  console.log(`\n  [${STATUS_MARK[m.status] || m.status}] ${m.week} · ` +
    `${lines.length}/${DEPTH_BLOCK_MAX_LINES} рядків` +
    (forMeeting ? '' : ` · найдовший рядок ${width}/${DEPTH_LINE_MAX_CHARS}`));
  lines.forEach((l) => console.log(`    ${l}`));
  if (depthAllLensesCut(m)) console.log('    (усі три лінзи зрізані: у звіт не йде, лишається в реєстрі)');
  if (m.alignment_note) console.log(`    ПИТАННЯ НА ЗУСТРІЧ: ${m.alignment_note}`);
});

if (warnings.length) {
  console.log(`\nпопереджень: ${warnings.length}`);
  console.log(formatIssues(warnings));
}

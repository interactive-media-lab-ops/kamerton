// КАМЕРТОН · похідна проєкція Глибинного шару для екрана.
//
// Навіщо окремий файл, а не імпорт корпусу глобом, як у прецедентів:
// бандл уже 675 КБ при ліміті 700. Корпус прецедентів запікається цілком і
// зʼїв майже весь запас, тому розмітка йде в продукт СПРОЕКТОВАНОЮ — тільки
// те, що справді малюється на екрані.
//
// Що лишається за бортом: примітки аналітика (розділ 8 прямо каже, що у звіт
// вони не йдуть), питання до зустрічі, автор і дата розмітки. Це записи, а не
// показ, і в офлайн-файлі керівництва їм нічого робити.
//
// Архітектурно це той самий поділ, що і B1: corpus/ це джерело, derived/ це
// породжуване. Скрипт нічого не пише в corpus/ і не чіпає raw/.
//
// Запуск: npm run build:depth (входить у prebuild)

import fs from 'node:fs';
import path from 'node:path';
import { validateDepthMarkups, validateLensDictionary, formatIssues } from '../src/data/schema.js';

const root = process.cwd();
const DATA = path.join(root, 'src', 'data');
const DIR = path.join(DATA, 'corpus', 'depth');
const OUT = path.join(DATA, 'derived', 'depth.json');
const read = (...p) => JSON.parse(fs.readFileSync(path.join(DATA, ...p), 'utf8'));

const lenses = read('registry', 'lenses.json');
const registries = {
  cases: read('registry', 'cases.json'),
  actors: read('registry', 'actors.json'),
  topics: read('registry', 'topics.json'),
};

const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith('.json')) : [];
const markups = files.map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));

// Ворота: побитою розміткою продукт не годують. Валідатор той самий, що і в
// check:depth, другої копії правил не існує.
const issues = [
  ...validateLensDictionary(lenses),
  ...validateDepthMarkups(markups, lenses, registries),
];
const errors = issues.filter((i) => i.level === 'error');
if (errors.length) {
  console.error(`Глибинний шар не проходить валідацію, помилок: ${errors.length}\n`);
  console.error(formatIssues(errors));
  process.exit(1);
}

/** Лінза на екрані: або зрізана з причиною, або заповнена. Примітки зрізаються. */
const lensOut = (lens, items) => (lens?.cut
  ? { cut: true, reason: lens.reason }
  : { items });

// Розділ 16 ставив фільтр на завантаженні, а не на відображенні, і це
// правило лишається: прапорець показу можна забути або обійти режимом
// розробника, а те, чого немає в бандлі, показати неможливо в принципі.
//
// Змінився СПИСОК статусів, які проходять фільтр. Спека вкладки СЮЖЕТИ
// (розділ 6) свідомо відкриває ворота для draft_for_alignment і називає ціну:
// постійно видимий бейдж «чернетка до узгодження» на кожному екрані з
// розміткою. Це рішення власника, а не послаблення правила:
//
//   validated           показ без бейджа;
//   draft_for_alignment показ з бейджем, бо ілюстрація для узгодження
//                       довідника і існує рівно заради того, щоб її побачили;
//   draft               НЕ показується ніколи: робоча розмітка до ревʼю це не
//                       матеріал для очей, і жодного бейджа, який зробив би її
//                       чесною, не існує.
//
// Після справжньої валідації статус міняється в корпусі, бейдж зникає сам:
// ручних правок в інтерфейсі для цього не потрібно.
const ON_SCREEN = new Set(['validated', 'draft_for_alignment']);
const forScreen = markups.filter((m) => ON_SCREEN.has(m.status));

const projected = forScreen.map((m) => ({
  id: m.id,
  ...(m.case_id ? { case_id: m.case_id } : {}),
  ...(m.topic_id ? { topic_id: m.topic_id } : {}),
  week: m.week,
  status: m.status,
  plot: m.plot?.cut
    ? { cut: true, reason: m.plot.reason }
    : {
      primary: { id: m.plot.primary.id },
      ...(m.plot.secondary ? { secondary: { id: m.plot.secondary.id } } : {}),
    },
  roles: lensOut(m.roles, (m.roles.items || []).map((r) => ({ role_id: r.role_id, who: r.who }))),
  psychotypes: lensOut(m.psychotypes, (m.psychotypes.items || []).map((p) => ({
    id: p.id,
    ...(typeof p.share === 'number' ? { share: p.share, method: p.method } : {}),
  }))),
  how_to_speak: m.how_to_speak || [],
  what_to_avoid: m.what_to_avoid || [],
}));

// Словник теж проєктується: на екран іде підпис позиції, а не тригери. Тригери
// це інструмент розмітника, і в офлайн-файлі керівництва вони мертвий вантаж.
const label = (x) => ({ id: x.id, label: x.label });
const dict = {
  plots: lenses.plots.map(label),
  roles: lenses.roles.map(label),
  psychotypes: lenses.psychotypes.map(label),
};

const out = {
  _note: 'Породжується scripts/build-depth.mjs з corpus/depth. Руками не редагується: правки вносяться в корпус.',
  lenses: dict,
  markups: projected,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`, 'utf8');

const bytes = fs.statSync(OUT).size;
const source = files.reduce((a, f) => a + fs.statSync(path.join(DIR, f)).size, 0);
const held = markups.length - forScreen.length;
console.log(`derived/depth.json: на екран ${projected.length} з ${markups.length}, ` +
  `${(bytes / 1024).toFixed(1)} КБ (корпус ${(source / 1024).toFixed(1)} КБ, у бандл не йде)`);
if (held) {
  const byStatus = {};
  markups.forEach((m) => { if (!ON_SCREEN.has(m.status)) byStatus[m.status] = (byStatus[m.status] || 0) + 1; });
  console.log(`  не пройшли фільтр статусу (розділ 16): ${held} · ` +
    Object.entries(byStatus).map(([s, n]) => `${s} ${n}`).join(', '));
}

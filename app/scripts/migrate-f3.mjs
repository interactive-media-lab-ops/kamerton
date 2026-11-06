// КАМЕРТОН · F3 · внесення картки прецеденту в дані тижня.
//
// Картка збирається тим самим кодом, що і в інструменті F2 (importer/precedents.js),
// тобто виключно з полів корпусу. Два блоки, які пише людина, «де ламається» і
// «що спостерігаємо», беруться з пілота F0: там вони написані руками і з
// прив'язкою до фактів кейсів, а не виведені механічно.
//
// Картка йде зі статусом підпису «очікує». Це чесний робочий стан: вона
// показується в продукті з явним банером і НЕ видається за верифіковану.
//
// Запуск: npm run migrate:f3

import fs from 'node:fs';
import path from 'node:path';
import { draftCard } from '../importer/precedents.js';

const RAW = path.join(process.cwd(), 'src', 'data', 'raw', 'weeks.json');
const CORPUS_DIR = path.join(process.cwd(), 'src', 'data', 'corpus', 'precedents');

const before = fs.readFileSync(RAW, 'utf8');
const data = JSON.parse(before);
const corpus = fs.readdirSync(CORPUS_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(CORPUS_DIR, f), 'utf8')));

const week = data.weeks[data.weeks.length - 1];
const target = (week.cases || []).find((c) => c.id === 'case_225_425') || (week.cases || [])[0];
if (!target) {
  console.error('у тижні немає кейсів: нема до чого чіпляти картку');
  process.exit(1);
}

const passport = {
  case_id: target.id,
  mechanism_chain: [
    'інституційна претензія',
    'відсутність швидкої предметної відповіді',
    'персональний кейс стає доказом системної проблеми',
    'недовіра переходить на вищий рівень',
  ],
  class_tags: ['command_responsibility'],
  war_context: 'оборонна війна, екзистенційна для суспільства',
  info_environment: 'fragmented',
  current_phase: 'response',
  response_speed: 'відповіді немає другий тиждень',
};

const picked = corpus.filter((c) => (c.class_tags || []).includes('command_responsibility'));
const card = draftCard({ passport, picked, allCases: corpus });

// Те, що механічно вивести неможливо. Взято з пілота F0, де написано руками.
card.break_conditions = [
  'Якщо предметна відповідь зʼявиться в межах тижня: у всіх відібраних кейсах переломом була саме затримка, а не сам факт.',
  'Якщо претензія лишиться персональною і не набуде інституційного формулювання: у кейсах перехід на вищий рівень починався з узагальнення.',
  'Якщо зʼявиться інстанція з мандатом на публічний розбір: у кейсі 1974 саме процедура зафіксувала межу відповідальності, хоч і не втримала її.',
  'Аналогія не працює для темпу: у кейсах розбір тривав роками, у нашому полі вікно реакції це тиждень.',
];
card.watch_signals = [
  'чи зʼявилась публічна відповідь і від кого саме',
  'чи відповідь стосується суті претензії, а не форми її подання',
  'чи претензія переформульована з персональної на інституційну',
  'чи змінилась вага теми у зведенні наступного тижня',
];
card.scores = {
  structural_similarity: 'high',
  transferability: 'med',
  base_quality: 'med',
  n: card.outcome_distribution.n,
};
card.status = 'active';
card.verified_by = 'підпис: очікує';
card.verified_date = '';
card.adaptation = true;
card.signature = 'pending';
card.status_history = [
  { at: '2026-08-16', status: 'active', note: 'зібрано з адаптованих історичних кейсів, підпис очікує' },
];

week.precedents = [card];

const after = JSON.stringify(data, null, 2) + '\n';
const changed = after !== before;
if (changed) fs.writeFileSync(RAW, after);

console.log(`F3: картка ${card.id} для кейса ${target.id}`);
console.log(`  аналогів: ${card.analogs.length}, розподіл n=${card.outcome_distribution.n}`);
console.log(`  де ламається: ${card.break_conditions.length}, маркерів: ${card.watch_signals.length}`);
console.log(`  підпис: ${card.verified_by}`);
console.log(`  сирці ${changed ? 'оновлено' : 'без змін'}`);

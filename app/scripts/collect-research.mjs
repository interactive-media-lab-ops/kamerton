// КАМЕРТОН · збір результатів ресерчу з журналів робочих потоків у один файл.
//
// Потоки пишуть журнал по агенту, а внесення в корпус чекає один обʼєкт
// { perCase, narratives }. Цей сценарій їх зшиває і РІЗАЄ по вердиктах: кейс,
// який адверсарна перевірка позначила keep=false, далі не йде взагалі.
//
// Запуск: node scripts/collect-research.mjs <тека-журналів> <вихід.json>

import fs from 'node:fs';
import path from 'node:path';

const [DIR, OUT] = process.argv.slice(2);
if (!DIR || !OUT) {
  console.error('вкажіть теку журналів і файл виходу');
  process.exit(1);
}

function readJournal(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((x) => x && x.type === 'result' && x.result)
    .map((x) => x.result);
}

const results = fs.readdirSync(DIR)
  .filter((d) => d.startsWith('wf_'))
  .flatMap((d) => readJournal(path.join(DIR, d, 'journal.jsonl')));

// Вердикти з усіх потоків в одну мапу: кейс міг перевірятись у другому заході.
const verdicts = new Map();
results.filter((r) => r.historicalId).forEach((v) => verdicts.set(v.historicalId, v));

const byCase = new Map();
results.filter((r) => r.caseId && Array.isArray(r.cases)).forEach((lane) => {
  const cur = byCase.get(lane.caseId) || { caseId: lane.caseId, cases: [], verdicts: [] };
  lane.cases.forEach((h) => {
    if (cur.cases.some((x) => x.id === h.id)) return;
    cur.cases.push(h);
  });
  byCase.set(lane.caseId, cur);
});

// Другий заход віддає { caseId, lanes: [{ cases, verdicts }] }.
results.filter((r) => r.caseId && Array.isArray(r.lanes)).forEach((round) => {
  const cur = byCase.get(round.caseId) || { caseId: round.caseId, cases: [], verdicts: [] };
  round.lanes.forEach((lane) => {
    (lane.cases || []).forEach((h) => {
      if (cur.cases.some((x) => x.id === h.id)) return;
      cur.cases.push(h);
    });
    (lane.verdicts || []).forEach((v) => verdicts.set(v.historicalId, v));
  });
  byCase.set(round.caseId, cur);
});

const perCase = [...byCase.values()].map((lane) => {
  const kept = lane.cases.filter((h) => {
    const v = verdicts.get(h.id);
    // Кейс без вердикту не проходить: неперевірене не публікується.
    return v && v.keep === true;
  });
  const dropped = lane.cases.filter((h) => !kept.includes(h)).map((h) => ({
    id: h.id,
    why: verdicts.get(h.id)?.whyDrop || 'вердикт відсутній: неперевірений кейс не публікується',
  }));
  return { caseId: lane.caseId, cases: kept, dropped, verdicts: kept.map((h) => verdicts.get(h.id)) };
});

const narratives = results.filter((r) => r.headline && r.id && r.whatHappened && !r.classTag);

// Людські блоки карток приходять окремим потоком і чіпляються до свого кейса.
//
// Журнал містить і чернетку, і звірену версію, а розрізнити їх за формою
// неможливо. Тому пріоритет має підсумковий результат потоку (третій аргумент):
// у ньому лежить рівно те, що вийшло з останньої стадії конвеєра.
const blocks = new Map();
results.filter((r) => r.caseId && r.breakConditions).forEach((b) => blocks.set(b.caseId, b));

const FINAL = process.argv[4];
if (FINAL && fs.existsSync(FINAL)) {
  const fin = JSON.parse(fs.readFileSync(FINAL, 'utf8'));
  (fin.cards || []).forEach((b) => blocks.set(b.caseId, b));
  console.log(`підсумок потоку: блоків ${(fin.cards || []).length}`);

  // Другий заход по окремому кейсу віддає лінії пошуку без імені кейса
  // всередині: воно стоїть один раз зовні. У журналі цього звʼязку немає
  // взагалі, тому лінії добираються саме звідси.
  if (fin.svr?.caseId) {
    const lane = perCase.find((l) => l.caseId === fin.svr.caseId)
      || { caseId: fin.svr.caseId, cases: [], dropped: [] };
    if (!perCase.includes(lane)) perCase.push(lane);
    (fin.svr.lanes || []).forEach((ln) => {
      (ln.verdicts || []).forEach((v) => verdicts.set(v.historicalId, v));
      (ln.cases || []).forEach((h) => {
        const v = verdicts.get(h.id);
        if (!v || v.keep !== true) {
          lane.dropped.push({ id: h.id, why: v?.whyDrop || 'вердикт відсутній' });
          return;
        }
        if (!lane.cases.some((x) => x.id === h.id)) lane.cases.push(h);
      });
    });
    lane.verdicts = lane.cases.map((h) => verdicts.get(h.id));
    console.log(`другий заход ${fin.svr.caseId}: пройшли ${lane.cases.length}`);
  }
}
perCase.forEach((l) => {
  const b = blocks.get(l.caseId);
  if (!b) return;
  l.classSummary = b.classSummary;
  l.breakConditions = b.breakConditions;
  l.watchSignals = b.watchSignals;
  l.comparisonMatrix = b.comparisonMatrix || [];
  l.similarity = b.similarity;
  l.currentPhaseIndex = b.currentPhaseIndex;
});

fs.writeFileSync(OUT, JSON.stringify({ perCase, narratives }, null, 2) + '\n');

console.log(`журналів прочитано: ${fs.readdirSync(DIR).filter((d) => d.startsWith('wf_')).length}`);
perCase.forEach((l) => {
  console.log(`${l.caseId}: пройшли ${l.cases.length} (${l.cases.map((c) => c.id).join(', ') || 'жоден'}), відсіяно ${l.dropped.length}`);
});
console.log(`наративів для наявного корпусу: ${narratives.length}`);
perCase.filter((l) => l.breakConditions).forEach((l) => {
  console.log(`  блоки ${l.caseId}: умов ${l.breakConditions.length}, маркерів ${l.watchSignals.length}`);
});

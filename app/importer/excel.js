// H2 · Excel-шаблон як альтернативний вхід.
//
// Критичний шлях це клон попереднього тижня: він швидший і не дає розсипати
// структуру. Excel потрібен там, де тиждень уже зібрано в таблиці чужими
// руками, і переносити його в форму по клітинці означало б робити роботу двічі.
//
// SheetJS живе тільки тут: імпортер не має ліміту ваги, а в продукт ця тека
// не потрапляє за побудовою (окремий конфіг, окремий root).

import * as XLSX from 'xlsx';

/** Назви вкладок і те, у яке поле тижня вони лягають. */
export const SHEETS = [
  { name: 'тиждень', key: 'week' },
  { name: 'метрики', key: 'metrics' },
  { name: 'теми', key: 'topics' },
  { name: 'кейси', key: 'cases' },
  { name: 'актори', key: 'actors' },
  { name: 'прогнози', key: 'forecasts' },
  { name: 'ринки', key: 'markets' },
];

const num = (v) => {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Читає книгу і повертає чернетку тижня плюс перелік проблем.
 *
 * Розбір навмисно поблажливий до зайвого і суворий до потрібного: невідома
 * вкладка це попередження, а тема без id це помилка. Валідацію по суті робить
 * той самий Zod-валідатор, що і для решти входів: дві копії правил не існують.
 */
export function parseWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'array' });
  const issues = [];
  const rows = (name) => {
    const sh = wb.Sheets[name];
    if (!sh) return null;
    return XLSX.utils.sheet_to_json(sh, { defval: '' });
  };

  const known = new Set(SHEETS.map((s) => s.name));
  wb.SheetNames.forEach((n) => {
    if (!known.has(n)) {
      issues.push({ level: 'warning', where: `вкладка «${n}»`, message: 'не з шаблону, пропущено.' });
    }
  });

  const head = rows('тиждень');
  if (!head || !head.length) {
    issues.push({ level: 'error', where: 'вкладка «тиждень»', message: 'відсутня або порожня: без неї немає ідентифікатора і періоду.' });
    return { draft: null, issues };
  }

  const h = head[0];
  const draft = {
    id: String(h.id || h.week || '').trim(),
    period: { from: String(h.from || h['період з'] || '').trim(), to: String(h.to || h['період по'] || '').trim() },
    verdict: {
      threat: String(h.threat || h.загроза || '').trim(),
      opportunity: String(h.opportunity || h.можливість || '').trim(),
    },
    data_quality: String(h.data_quality || 'draft').trim(),
    topics: [],
    actors: [],
    cases: [],
    forecasts: [],
  };

  (rows('теми') || []).forEach((r, i) => {
    const id = String(r.id || '').trim();
    if (!id) {
      issues.push({ level: 'error', where: `теми, рядок ${i + 2}`, message: 'порожній id: тему нема на що посилатись.' });
      return;
    }
    draft.topics.push({
      id,
      name: String(r.name || r.назва || '').trim(),
      tone_score: num(r.tone_score ?? r.тон),
      salience: num(r.salience ?? r.вага),
      aud: String(r.aud || r.аудиторія || '').trim() || undefined,
      trend: String(r.trend || r.тренд || '').trim() || undefined,
    });
  });

  (rows('актори') || []).forEach((r, i) => {
    const id = String(r.id || '').trim();
    if (!id) {
      issues.push({ level: 'error', where: `актори, рядок ${i + 2}`, message: 'порожній id.' });
      return;
    }
    draft.actors.push({
      id,
      stance: num(r.stance ?? r.ставлення),
      activity: num(r.activity ?? r.активність),
      note: String(r.note || r.примітка || '').trim() || undefined,
    });
  });

  (rows('прогнози') || []).forEach((r, i) => {
    const id = String(r.id || '').trim();
    if (!id) {
      issues.push({ level: 'error', where: `прогнози, рядок ${i + 2}`, message: 'порожній id.' });
      return;
    }
    draft.forecasts.push({
      id,
      text: String(r.text || r.текст || '').trim(),
      criterion: String(r.criterion || r.критерій || '').trim(),
      deadline: String(r.deadline || r.дедлайн || '').trim(),
      status: String(r.status || r.статус || 'open').trim(),
    });
  });

  (rows('кейси') || []).forEach((r, i) => {
    const id = String(r.id || '').trim();
    if (!id) {
      issues.push({ level: 'error', where: `кейси, рядок ${i + 2}`, message: 'порожній id.' });
      return;
    }
    draft.cases.push({
      id,
      title: String(r.title || r.назва || '').trim(),
      status: String(r.status || r.статус || '').trim() || undefined,
      host_topic: String(r.host_topic || r.тема || '').trim() || undefined,
    });
  });

  const metrics = {};
  (rows('метрики') || []).forEach((r) => {
    const k = String(r.metric || r.метрика || '').trim();
    const v = num(r.value ?? r.значення);
    if (k && v !== undefined) metrics[k] = v;
  });
  if (Object.keys(metrics).length) draft.metrics_import = metrics;

  return { draft, issues };
}

/** Порожній шаблон для оператора: ті самі вкладки, ті самі заголовки. */
export function templateWorkbook() {
  const wb = XLSX.utils.book_new();
  const add = (name, header) => {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header]), name);
  };
  add('тиждень', ['id', 'from', 'to', 'threat', 'opportunity', 'data_quality']);
  add('метрики', ['metric', 'value']);
  add('теми', ['id', 'name', 'tone_score', 'salience', 'aud', 'trend']);
  add('кейси', ['id', 'title', 'status', 'host_topic']);
  add('актори', ['id', 'stance', 'activity', 'note']);
  add('прогнози', ['id', 'text', 'criterion', 'deadline', 'status']);
  add('ринки', ['id', 'question', 'forecast_id', 'resolve_by', 'resolution_criterion']);
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

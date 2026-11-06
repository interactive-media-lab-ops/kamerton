import React, { useMemo, useState } from 'react';
import contract from '../src/data/raw/weeks.json';
import {
  cloneWeek, nextWeekId, validateDraft, diffWeeks, dueForecasts, gateStatus,
  appendJournal, journalEntry, parseMetricsCsv, VERDICTS, canonical, REGISTRIES, applyVerdicts,
} from './lib.js';
import MapPreview from './MapPreview.jsx';
import { makeZip } from './zip.js';
import { parseWorkbook, templateWorkbook } from './excel.js';

/**
 * КАМЕРТОН · імпортер тижня.
 *
 * Мета: тиждень збирає людина, яка не є ані замовником, ані AI-асистентом, за 60-90
 * хвилин. Тому тут немає жодного поля, яке можна заповнити «як завжди»: старт
 * це клон минулого тижня, а далі редагується тільки дельта.
 *
 * Головне в цьому інструменті не форма, а ворота: затвердити тиждень, не
 * відповівши по кожному простроченому прогнозу, фізично неможливо.
 */

const download = (name, text) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};

function Section({ n, title, note, children }) {
  return (
    <section className="i-sec">
      <h2><span className="i-sec__n">{n}</span> {title}</h2>
      {note && <p className="i-note">{note}</p>}
      {children}
    </section>
  );
}

export default function Importer() {
  const weeks = contract.weeks;
  const prev = weeks[weeks.length - 1];

  const [draft, setDraft] = useState(null);
  const [operator, setOperator] = useState('');
  const [answers, setAnswers] = useState({});
  const [sourceName, setSourceName] = useState('');
  const [metricsNote, setMetricsNote] = useState('');
  const [journal, setJournal] = useState(null);
  const [excelIssues, setExcelIssues] = useState([]);

  const issues = useMemo(() => (draft ? validateDraft(contract, draft) : []), [draft]);
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  const diff = useMemo(() => (draft ? diffWeeks(prev, draft) : null), [draft, prev]);
  const gates = useMemo(
    () => (draft ? gateStatus(contract, draft, answers) : { due: [], missing: [], open: false }),
    [draft, answers]
  );

  const canApprove = Boolean(draft) && errors.length === 0 && gates.open && operator.trim().length > 1;

  const patch = (fn) => setDraft((d) => { const c = structuredClone(d); fn(c); return c; });

  function loadJson(file, onOk) {
    const r = new FileReader();
    r.onload = () => {
      try { onOk(JSON.parse(String(r.result))); } catch (e) { alert(`не JSON: ${e.message}`); }
    };
    r.readAsText(file);
  }

  function approve() {
    const stamp = new Date().toISOString();
    const nextContract = {
      ...contract,
      weeks: [...contract.weeks.filter((w) => w.id !== draft.id), applyVerdicts(draft, answers, gates.due)],
    };
    const entry = journalEntry({
      weekId: draft.id,
      operator: operator.trim(),
      sourceName,
      schemaVersion: contract.schema_version,
      diff,
      gates: { ...gates, answers },
      stamp,
    });
    const nextJournal = appendJournal(journal, entry);
    download('weeks.json', JSON.stringify(nextContract, null, 2) + '\n');
    download('import-log.json', JSON.stringify(nextJournal, null, 2) + '\n');

    // H6 · архів входу. Оператор кладе один файл поруч із випуском, і через
    // місяць видно, з чого саме зібрано тиждень: чернетка, лог валідації і
    // вердикти воріт. Без архіву це знання живе тільки в памʼяті людини.
    const log = [
      `тиждень: ${draft.id}`,
      `оператор: ${operator.trim()}`,
      `час: ${stamp}`,
      `джерело: ${sourceName || 'клон попереднього тижня'}`,
      `схема: v${contract.schema_version}`,
      '',
      `помилок валідації: ${errors.length}`,
      `попереджень: ${warnings.length}`,
      ...warnings.map((w) => `  [увага] ${w.where}: ${w.message}`),
      '',
      `ворота: ${gates.due.length} прогнозів до розвʼязки`,
      ...gates.due.map((f) => {
        const a = answers[f.id];
        return `  ${f.id}: ${a?.verdict || 'без відповіді'}${a?.reason ? ` (${a.reason})` : ''}`;
      }),
      '',
      `діф: нових ${diff.added.length}, зникло ${diff.gone.length}, зсув ${diff.moved.length}`,
    ].join('\n');

    const zip = makeZip([
      { name: `${draft.id}/weeks.json`, text: JSON.stringify(nextContract, null, 2) + '\n' },
      { name: `${draft.id}/draft.json`, text: JSON.stringify(draft, null, 2) + '\n' },
      { name: `${draft.id}/validation.log.txt`, text: log + '\n' },
      { name: `${draft.id}/import-log.json`, text: JSON.stringify(nextJournal, null, 2) + '\n' },
    ]);
    const zurl = URL.createObjectURL(zip);
    const za = document.createElement('a');
    za.href = zurl;
    za.download = `kamerton_${draft.id}_vhid.zip`;
    document.body.appendChild(za);
    za.click();
    za.remove();
    setTimeout(() => URL.revokeObjectURL(zurl), 10000);

    setJournal(nextJournal);
  }

  return (
    <div className="i-root">
      <header className="i-top">
        <h1>КАМЕРТОН · імпорт тижня</h1>
        <span className="i-note">
          контракт v{contract.schema_version} · останній тиждень {prev.id} ·
          тем у реєстрі {REGISTRIES.topics.length}
        </span>
      </header>

      <Section n="01" title="Стартова точка"
        note="Тиждень не пишеться з нуля: беремо минулий і правимо дельту. Вердикт, цитати і методологічні правила не переносяться навмисно, бо скопійований вердикт це найшвидший спосіб видати минулий тиждень за новий.">
        {!draft ? (
          <div className="i-row">
            <button className="i-btn i-btn--primary" onClick={() => setDraft(cloneWeek(prev))}>
              ПОЧАТИ З {prev.id.replace(/^\d{4}-/, '')}
            </button>
            <label className="i-btn">
              ЗАВАНТАЖИТИ EXCEL
              <input type="file" accept=".xlsx,.xls" hidden onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = () => {
                  const { draft: d, issues: iss } = parseWorkbook(new Uint8Array(r.result));
                  setExcelIssues(iss);
                  if (d) { setDraft(d); setSourceName(f.name); }
                };
                r.readAsArrayBuffer(f);
              }} />
            </label>
            <button className="i-btn" onClick={() => {
              const buf = templateWorkbook();
              const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
              const a = document.createElement('a'); a.href = url; a.download = 'kamerton_tyzhden_shablon.xlsx';
              document.body.appendChild(a); a.click(); a.remove();
              setTimeout(() => URL.revokeObjectURL(url), 10000);
            }}>ПОРОЖНІЙ ШАБЛОН</button>
            <label className="i-btn">
              ЗАВАНТАЖИТИ ЧЕРНЕТКУ JSON
              <input type="file" accept="application/json" hidden onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) { setSourceName(f.name); loadJson(f, setDraft); }
              }} />
            </label>
          </div>
        ) : (
          <div className="i-row">
            <b className="i-week">{draft.id}</b>
            <span className="i-note">{draft.period.from} .. {draft.period.to}</span>
            <button className="i-btn" onClick={() => { setDraft(null); setAnswers({}); }}>
              ПОЧАТИ ЗАНОВО
            </button>
          </div>
        )}
        {excelIssues.length > 0 && (
          <ul className={excelIssues.some((i) => i.level === 'error') ? 'i-err' : 'i-warn'}>
            {excelIssues.map((i, k) => <li key={k}><b>{i.where}</b><br />{i.message}</li>)}
          </ul>
        )}
      </Section>

      {draft && (
        <>
          <Section n="02" title="Шапка і висновок">
            <label className="i-f">
              <span>ідентифікатор тижня</span>
              <input value={draft.id} onChange={(e) => patch((d) => { d.id = e.target.value; })} />
            </label>
            <div className="i-row">
              <label className="i-f">
                <span>період з</span>
                <input value={draft.period.from}
                  onChange={(e) => patch((d) => { d.period.from = e.target.value; })} />
              </label>
              <label className="i-f">
                <span>по</span>
                <input value={draft.period.to}
                  onChange={(e) => patch((d) => { d.period.to = e.target.value; })} />
              </label>
            </div>
            <label className="i-f">
              <span>загроза тижня</span>
              <textarea rows={2} value={draft.verdict?.threat || ''}
                onChange={(e) => patch((d) => { d.verdict = { ...d.verdict, threat: e.target.value }; })} />
            </label>
            <label className="i-f">
              <span>можливість тижня</span>
              <textarea rows={2} value={draft.verdict?.opportunity || ''}
                onChange={(e) => patch((d) => { d.verdict = { ...d.verdict, opportunity: e.target.value }; })} />
            </label>
          </Section>

          <Section n="03" title="Метрики"
            note="Числа не переносяться руками: це головне джерело тихих помилок. CSV із saved query, перший стовпчик метрика, другий значення.">
            <label className="i-btn">
              ІМПОРТ МЕТРИК З CSV
              <input type="file" accept=".csv,text/csv" hidden onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = () => {
                  const { values, errors: errs } = parseMetricsCsv(String(r.result));
                  const keys = Object.keys(values);
                  // Пишемо у той самий блок, який читає вʼювер. metrics_import
                  // не читав ніхто: числа приймались і зникали.
                  patch((d) => {
                    d.indices = { ...(d.indices || {}) };
                    Object.entries(values).forEach(([k, v]) => { d.indices[k] = v; });
                  });
                  setMetricsNote(
                    `${f.name}: прийнято ${keys.length} значень` +
                    (errs.length ? `, відхилено ${errs.length}: ${errs[0]}` : '')
                  );
                };
                r.readAsText(f);
              }} />
            </label>
            {metricsNote && <p className="i-note">{metricsNote}</p>}
          </Section>

          <Section n="04" title="Теми"
            note="Позиція теми це число від -1 до 1. Невідомий реєстру id далі воріт не пройде.">
            <table className="i-tbl">
              <thead><tr><th>id</th><th>назва</th><th>тон</th><th>вага</th><th /></tr></thead>
              <tbody>
                {(draft.topics || []).map((t, i) => (
                  <tr key={i} className={canonical(t.id) !== t.id ? 'is-alias' : undefined}>
                    <td><input value={t.id} onChange={(e) => patch((d) => { d.topics[i].id = e.target.value; })} /></td>
                    <td><input value={t.name} onChange={(e) => patch((d) => { d.topics[i].name = e.target.value; })} /></td>
                    <td><input type="number" step="0.05" value={t.tone_score ?? ''}
                      onChange={(e) => patch((d) => { d.topics[i].tone_score = Number(e.target.value); })} /></td>
                    <td><input type="number" step="1" value={t.salience ?? ''}
                      onChange={(e) => patch((d) => { d.topics[i].salience = Number(e.target.value); })} /></td>
                    <td><button className="i-x" onClick={() => patch((d) => { d.topics.splice(i, 1); })}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="i-btn" onClick={() => patch((d) => {
              d.topics = [...(d.topics || []), { id: '', name: '', tone_score: 0, salience: 1 }];
            })}>ДОДАТИ ТЕМУ</button>
          </Section>

          <Section n="05" title="Діф із попереднім тижнем"
            note="Що нове, що зникло, що зсунулось понад поріг. Видно ДО затвердження.">
            {diff && (
              <div className="i-diff">
                <div><b>{diff.counts.topics}</b> тем · <b>{diff.counts.actors}</b> акторів ·
                  {' '}<b>{diff.counts.cases}</b> кейсів · <b>{diff.counts.forecasts}</b> прогнозів</div>
                <div className="i-diff__row"><span className="i-tag i-tag--add">нові</span>
                  {diff.added.length ? diff.added.join(', ') : 'немає'}</div>
                <div className="i-diff__row"><span className="i-tag i-tag--gone">зникли</span>
                  {diff.gone.length ? diff.gone.join(', ') : 'немає'}</div>
                <div className="i-diff__row"><span className="i-tag">зсув</span>
                  {diff.moved.length
                    ? diff.moved.map((m) => `${m.id} (тон ${m.dTone > 0 ? '+' : ''}${m.dTone})`).join(', ')
                    : 'немає'}</div>
              </div>
            )}
            <MapPreview draft={draft} />
          </Section>

          <Section n="06" title="Ворота чесності"
            note="Кожен прогноз, чий дедлайн настав, вимагає вердикту. Скасування без причини не приймається: це спосіб тихо прибрати незручний промах.">
            {gates.due.length === 0 && <p className="i-ok">прогнозів до розвʼязки цього тижня немає</p>}
            {gates.due.map((f) => (
              <div key={f.id} className="i-gate">
                <div className="i-gate__q">{f.text || f.question}</div>
                <div className="i-note">дедлайн {f.deadline} · критерій: {f.criterion}</div>
                <div className="i-row">
                  {VERDICTS.map((v) => (
                    <label key={v.id} className="i-radio">
                      <input
                        type="radio"
                        name={f.id}
                        checked={answers[f.id]?.verdict === v.id}
                        onChange={() => setAnswers((a) => ({ ...a, [f.id]: { ...a[f.id], verdict: v.id } }))}
                      />
                      {v.label}
                    </label>
                  ))}
                  {answers[f.id]?.verdict === 'void' && (
                    <input
                      className="i-reason"
                      placeholder="причина скасування, обовʼязково"
                      value={answers[f.id]?.reason || ''}
                      onChange={(e) => setAnswers((a) => ({ ...a, [f.id]: { ...a[f.id], reason: e.target.value } }))}
                    />
                  )}
                </div>
              </div>
            ))}
            {gates.missing.length > 0 && (
              <p className="i-err">без відповіді: {gates.missing.length} з {gates.due.length}</p>
            )}
          </Section>

          <Section n="07" title="Валідація">
            {errors.length === 0
              ? <p className="i-ok">схема і реєстри: помилок немає</p>
              : (
                <ul className="i-err">
                  {errors.map((e, i) => <li key={i}><b>{e.where}</b><br />{e.message}</li>)}
                </ul>
              )}
            {warnings.length > 0 && (
              <ul className="i-warn">
                {warnings.map((w, i) => <li key={i}><b>{w.where}</b><br />{w.message}</li>)}
              </ul>
            )}
          </Section>

          <Section n="08" title="Затвердження"
            note="Журнал тільки дописується: повторний імпорт додає ще один запис, а не переписує попередній.">
            <div className="i-row">
              <label className="i-f">
                <span>хто затверджує</span>
                <input value={operator} placeholder="прізвище оператора"
                  onChange={(e) => setOperator(e.target.value)} />
              </label>
              <label className="i-btn">
                ПІДВАНТАЖИТИ ЖУРНАЛ
                <input type="file" accept="application/json" hidden onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) loadJson(f, setJournal);
                }} />
              </label>
              <span className="i-note">
                {journal ? `у журналі записів: ${journal.entries?.length ?? 0}` : 'журнал не підвантажено: буде створено новий'}
              </span>
            </div>

            <button className="i-btn i-btn--primary" disabled={!canApprove} onClick={approve}>
              ЗАТВЕРДИТИ І ВИВАНТАЖИТИ
            </button>
            {!canApprove && (
              <p className="i-note">
                {errors.length ? 'є помилки валідації. ' : ''}
                {!gates.open ? 'не всі ворота пройдені. ' : ''}
                {operator.trim().length < 2 ? 'не вказано, хто затверджує.' : ''}
              </p>
            )}
          </Section>
        </>
      )}
    </div>
  );
}


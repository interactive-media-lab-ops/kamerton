import React, { useMemo, useState } from 'react';
import contract from '../src/data/raw/weeks.json';
import { PrecedentCard } from '../src/data/schema.js';
import {
  rankCandidates, draftCard, cardBlockers, CLASS_TAGS, PHASES,
  classLabel, outcomeLabel, shelfLabel,
} from './precedents.js';

// Корпус збирається на етапі збірки: Vite вміє забрати теку цілком, і це
// єдиний спосіб мати офлайн-сторінку без сервера.
const CORPUS = Object.values(
  import.meta.glob('../src/data/corpus/precedents/*.json', { eager: true, import: 'default' })
);

/**
 * КАМЕРТОН · F2 · інструмент збірки картки прецеденту.
 *
 * Порядок жорсткий і повторює розділ 2 Спеки F: паспорт кейса -> фільтри ->
 * shortlist з причинами -> чернетка з корпусних полів -> дописування людиною ->
 * підпис -> експорт.
 *
 * Найважливіше тут те, чого інструмент НЕ робить: він не пише за людину два
 * блоки, які вирішують чесність картки, «чому релевантний» і «де ламається».
 * Механічно вивести їх неможливо, а видати механічний текст за судження це
 * рівно та підміна, проти якої написана вся Спека F.
 */
export default function Precedents() {
  const cases = useMemo(() => {
    const w = contract.weeks[contract.weeks.length - 1];
    return w.cases || [];
  }, []);

  const [caseId, setCaseId] = useState(cases[0]?.id || '');
  const [chain, setChain] = useState([
    'інституційна претензія',
    'відсутність швидкої предметної відповіді',
    'персональний кейс стає доказом системної проблеми',
    'недовіра переходить на вищий рівень',
  ]);
  const [tags, setTags] = useState(['command_responsibility']);
  const [warContext, setWarContext] = useState('оборонна війна, екзистенційна для суспільства');
  const [infoEnv, setInfoEnv] = useState('fragmented');
  const [phase, setPhase] = useState('response');
  const [picked, setPicked] = useState([]);
  const [card, setCard] = useState(null);
  const [signer, setSigner] = useState('');

  const passport = {
    case_id: caseId,
    mechanism_chain: chain.filter(Boolean),
    class_tags: tags,
    war_context: warContext,
    info_environment: infoEnv,
    current_phase: phase,
    phase_map: PHASES.map((p) => ({ phase: p.id, event: '' })),
    confirmed_by: signer || 'не підтверджено',
  };

  const ranked = useMemo(() => rankCandidates(CORPUS, passport), [tags, warContext, infoEnv]);
  const shortlist = ranked.slice(0, 8);

  const toggle = (id) => setPicked((p) => (
    p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? p : [...p, id]
  ));

  const blockers = card ? cardBlockers(card) : [];
  const schemaOk = card
    ? PrecedentCard.safeParse({ ...card, verified_date: card.verified_date || '2026-01-01' }).success
    : false;
  const canSign = card && blockers.length === 0 && signer.trim().length > 1;

  function makeDraft() {
    const chosen = CORPUS.filter((c) => picked.includes(c.id));
    setCard(draftCard({ passport, picked: chosen, allCases: CORPUS }));
  }

  function exportCard() {
    const out = {
      ...card,
      verified_by: signer.trim(),
      verified_date: new Date().toISOString().slice(0, 10),
      status_history: [{ at: new Date().toISOString().slice(0, 10), status: 'active', note: 'створено' }],
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2) + '\n'], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${out.id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  const edit = (fn) => setCard((c) => { const n = structuredClone(c); fn(n); return n; });

  return (
    <div className="i-root">
      <header className="i-top">
        <h1>КАМЕРТОН · збірка картки прецеденту</h1>
        <span className="i-note">
          корпус: {CORPUS.length} кейсів ·
          {' '}{CORPUS.filter((c) => c.signature === 'pending').length} без підпису ·
          {' '}{CORPUS.filter((c) => c.adaptation).length} адаптацій
        </span>
      </header>

      <section className="i-sec">
        <h2><span className="i-sec__n">01</span> Паспорт кейса</h2>
        <p className="i-note">
          Це вхід пошуку. Порівнюється механізм, а не сюжет, тому ланцюжок важливіший
          за назву кейса.
        </p>
        <label className="i-f">
          <span>кейс</span>
          <select value={caseId} onChange={(e) => setCaseId(e.target.value)}>
            {cases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </label>
        <label className="i-f">
          <span>ланцюжок механізму, по ланці на рядок</span>
          <textarea rows={4} value={chain.join('\n')} onChange={(e) => setChain(e.target.value.split('\n'))} />
        </label>
        <div className="i-row">
          <label className="i-f">
            <span>клас</span>
            <select value={tags[0]} onChange={(e) => setTags([e.target.value])}>
              {CLASS_TAGS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          <label className="i-f">
            <span>воєнний контекст</span>
            <input value={warContext} onChange={(e) => setWarContext(e.target.value)} />
          </label>
          <label className="i-f">
            <span>інфосередовище</span>
            <select value={infoEnv} onChange={(e) => setInfoEnv(e.target.value)}>
              <option value="centralised">централізоване</option>
              <option value="fragmented">фрагментоване</option>
              <option value="mixed">змішане</option>
            </select>
          </label>
          <label className="i-f">
            <span>поточна фаза</span>
            <select value={phase} onChange={(e) => setPhase(e.target.value)}>
              {PHASES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="i-sec">
        <h2><span className="i-sec__n">02</span> Shortlist з причинами</h2>
        <p className="i-note">
          Чотири роздільні осі, без зведеного балу: зведений скор це той самий
          заборонений відсоток схожості під іншою назвою. Обрати можна не більше трьох.
        </p>
        <table className="i-tbl">
          <thead>
            <tr>
              <th /><th>кейс</th><th>подібність</th><th>переносимість</th>
              <th>база</th><th>відмінності</th><th>чому в списку</th>
            </tr>
          </thead>
          <tbody>
            {shortlist.map((r) => (
              <tr key={r.case.id} className={picked.includes(r.case.id) ? 'is-alias' : undefined}>
                <td>
                  <input
                    type="checkbox"
                    checked={picked.includes(r.case.id)}
                    onChange={() => toggle(r.case.id)}
                  />
                </td>
                <td>
                  {r.case.title}
                  <div className="i-note">
                    {shelfLabel(r.case.shelf)} · {r.case.period}
                    {r.case.signature === 'pending' && ' · підпис очікує'}
                  </div>
                </td>
                <td>{r.axes.similarity}</td>
                <td>{r.axes.transferability}</td>
                <td>{r.axes.base_quality}</td>
                <td>{r.axes.critical_differences}</td>
                <td className="i-note">{r.reasons.join('; ') || 'нема причин: не брати'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="i-btn i-btn--primary" disabled={!picked.length} onClick={makeDraft}>
          ЗІБРАТИ ЧЕРНЕТКУ ({picked.length})
        </button>
      </section>

      {card && (
        <>
          <section className="i-sec">
            <h2><span className="i-sec__n">03</span> Чернетка з корпусних полів</h2>
            <p className="i-note">
              Усе нижче виведено з полів відібраних кейсів. Жодного факту поза корпусом
              тут немає і бути не може.
            </p>
            <div className="i-diff">
              <div><b>клас:</b> {card.class_summary}</div>
              <div><b>розподіл наслідків:</b> n={card.outcome_distribution.n} ·{' '}
                {card.outcome_distribution.buckets.map((b) => `${outcomeLabel(b.outcome_code)}: ${b.k}`).join(' · ')}
              </div>
              <div className="i-note">
                Вибірка: {card.outcome_distribution.n} кейсів. Це історичний prior, не прогноз поточної ситуації.
              </div>
            </div>
            {card.analogs.map((a, i) => (
              <div key={a.historical_case_id} className="i-gate">
                <div className="i-gate__q">
                  {CORPUS.find((c) => c.id === a.historical_case_id)?.title}
                </div>
                <div className="i-note">схожості: {a.likenesses.join('; ') || 'не виведено'}</div>
                <div className="i-note">відмінності: {a.differences.join('; ') || 'НЕ НАЗВАНО'}</div>
                <label className="i-f">
                  <span>дописати відмінності, по одній на рядок</span>
                  <textarea
                    rows={3}
                    value={a.differences.join('\n')}
                    onChange={(e) => edit((c) => { c.analogs[i].differences = e.target.value.split('\n').filter(Boolean); })}
                  />
                </label>
              </div>
            ))}
          </section>

          <section className="i-sec">
            <h2><span className="i-sec__n">04</span> Те, що пише людина</h2>
            <p className="i-note">
              Ці два блоки інструмент не заповнює навмисно: механічно вивести їх
              неможливо, а видати механічний текст за судження означало б підмінити
              саме те, заради чого існує вся ця робота.
            </p>
            <label className="i-f">
              <span>ДЕ АНАЛОГІЯ ЛАМАЄТЬСЯ, по умові на рядок</span>
              <textarea
                rows={4}
                value={card.break_conditions.join('\n')}
                onChange={(e) => edit((c) => { c.break_conditions = e.target.value.split('\n').filter(Boolean); })}
              />
            </label>
            <label className="i-f">
              <span>ЩО СПОСТЕРІГАЄМО, по маркеру на рядок</span>
              <textarea
                rows={3}
                value={card.watch_signals.join('\n')}
                onChange={(e) => edit((c) => { c.watch_signals = e.target.value.split('\n').filter(Boolean); })}
              />
            </label>
          </section>

          <section className="i-sec">
            <h2><span className="i-sec__n">05</span> Підпис і експорт</h2>
            {blockers.length > 0 ? (
              <ul className="i-err">{blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>
            ) : (
              <p className="i-ok">картка повна; схема: {schemaOk ? 'проходить' : 'НЕ проходить'}</p>
            )}
            <div className="i-row">
              <label className="i-f">
                <span>хто верифікував</span>
                <input value={signer} placeholder="прізвище" onChange={(e) => setSigner(e.target.value)} />
              </label>
              <button className="i-btn i-btn--primary" disabled={!canSign || !schemaOk} onClick={exportCard}>
                ПІДПИСАТИ І ЕКСПОРТУВАТИ
              </button>
            </div>
            <p className="i-note">
              Файл кладеться в <code>app/src/data/corpus/precedents/</code> і перевіряється
              командою <code>npm run check:corpus</code>.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

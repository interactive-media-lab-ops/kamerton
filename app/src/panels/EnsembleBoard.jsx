import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Panel, HudButton, StatusTag } from 'astrolabe-ds';
import {
  aggregate, sortMarkets, canBet, budgetOf, DEFAULT_CONFIG, STATUS_UA,
} from '../data/ensemble.js';
import Instrument from './Instrument.jsx';
import { COMPASS } from '../data/thresholds.js';
import DivergenceScale from './DivergenceScale.jsx';

/**
 * Шар КОМПАС: приладова дошка, не список тікетів.
 *
 * Кожен ринок це окремий прилад. Ієрархію задає стан і свіжість: спірні і
 * гарячі беруть повний розмір і повну насиченість, заморожені й розвʼязані
 * стискаються і глушаться. Читач має розрізнити стан за пів секунди, ще до
 * того, як почне читати текст.
 *
 * Уся сміливість вкладена в один елемент, прилад-шкалу. Решта картки тримається
 * тихо і дисципліновано: інакше два акценти в одному місці зʼїдають один одного.
 */

const pctText = (p) => (p == null ? 'нема' : `${Math.round(p * 100)}%`);

function daysLeft(dateStr, now) {
  const d = Date.parse(dateStr);
  if (!Number.isFinite(d)) return null;
  return Math.ceil((d - now) / 86400000);
}

function deadlineLabel(days) {
  if (days === null) return 'дедлайн не вказано';
  if (days < 0) return `дедлайн минув ${-days} дн. тому`;
  if (days === 0) return 'дедлайн сьогодні';
  return `${days} дн.`;
}


/** Число, що доїжджає до значення, а не клацає в нього. */
function useCountUp(target, ms = 600) {
  const [shown, setShown] = useState(target ?? 0);
  const from = useRef(target ?? 0);
  useEffect(() => {
    if (target == null) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setShown(target); from.current = target; return undefined; }
    const a = from.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(2, -10 * t); // easeOutExpo
      setShown(Math.round(a + (target - a) * e));
      if (t < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    // Кадри можуть не йти взагалі (фонова вкладка), тому значення страхується
    // таймером: анімація це прикраса, правильне число це зміст.
    const guard = setTimeout(() => { setShown(target); from.current = target; }, ms + 120);
    return () => { cancelAnimationFrame(raf); clearTimeout(guard); };
  }, [target, ms]);
  return shown;
}

/**
 * Консенсус на момент заморозки: останній знімок історії до lock_at.
 *
 * Саме він чесно порівнюється з фактом. Поточний агрегат розвʼязаного ринку
 * ставити привидом безглуздо: він збігається з голкою і нічого не додає.
 */
function lockedConsensus(market) {
  const lock = String(market?.lock_at || '').slice(0, 10);
  const h = (market?.history || []).filter((s) => Number.isFinite(s.p_ensemble));
  if (!h.length || !lock) return null;
  const before = h.filter((s) => s.date <= lock);
  const pick = before.length ? before[before.length - 1] : h[0];
  return pick.p_ensemble;
}

/** Дельта консенсусу за тиждень: динаміка, а не оцінка добре чи погано. */
function deltaOf(history) {
  const h = (history || []).filter((s) => Number.isFinite(s.p_ensemble));
  if (h.length < 2) return null;
  const last = h[h.length - 1].p_ensemble;
  const prev = h[0].p_ensemble;
  return Math.round((last - prev) * 100);
}

function Chip({ kind = '', children, onClick, title }) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag className={`k-chip ${kind}`} onClick={onClick} title={title} type={onClick ? 'button' : undefined}>
      {children}
    </Tag>
  );
}

function BetControls({ market, me, markets, config, draft, setDraft, onPlace, flash }) {
  const existing = (market.bets || []).find((b) => b.participant === me.id);
  const budget = budgetOf(me.id, markets, config);
  const free = budget.left + (existing ? existing.stake : 0);
  const stake = Math.min(draft.stake, free);
  const step = (d) => setDraft((s) => ({ ...s, stake: Math.min(free, Math.max(1, s.stake + d)) }));

  return (
    <div className="k-mk__bet">
      <div className="k-mk__fuel" title={`вільно ${free} з ${budget.total} балів`}>
        <span className="k-note">бали</span>
        <button type="button" className="k-step" onClick={() => step(-5)} aria-label="менше">−</button>
        <b>{stake}</b>
        <button type="button" className="k-step" onClick={() => step(5)} aria-label="більше">+</button>
        <span className="k-fuel">
          <i style={{ width: `${budget.total ? (stake / budget.total) * 100 : 0}%` }} />
        </span>
        <span className="k-note">вільно {free}</span>
      </div>
      <HudButton
        variant="primary"
        onClick={() => onPlace({ market: market.id, p: draft.p, stake })}
      >
        {existing ? 'ОНОВИТИ ОЦІНКУ' : 'ЗАФІКСУВАТИ ОЦІНКУ'}
      </HudButton>
      {flash && <span className="k-note">оцінку зараховано в пул</span>}
    </div>
  );
}

function MarketCard({ market, participants, config, me, markets, onPlace, now, index }) {
  const [openInfo, setOpenInfo] = useState(false);
  const [flash, setFlash] = useState(false);
  const byId = useMemo(() => new Map(participants.map((x) => [x.id, x])), [participants]);
  const existing = me ? (market.bets || []).find((b) => b.participant === me.id) : null;
  const [draft, setDraft] = useState({ p: existing?.p ?? 0.5, stake: existing?.stake ?? 10 });

  const agg = market.aggregate?.p_ensemble !== undefined
    ? market.aggregate
    : aggregate(market, participants, config);
  const san = market.san_estimate?.p ?? null;
  const days = daysLeft(market.resolve_by, now);
  const delta = deltaOf(market.history);
  const resolved = market.resolution?.outcome === true || market.resolution?.outcome === false;
  const locked = market.status === 'locked';
  const hot = agg.divergence_flag || (days !== null && days <= 3 && !resolved && !locked);

  // Допуск питається в математики, а не вгадується за рядком ролі: так причина
  // відмови приходить словами і однаково працює для всіх ролей.
  const allowed = me
    ? canBet(me, market, markets, config)
    : { ok: false, reason: 'позивний не вказаний: додайте ?as=<ваш id> до посилання' };
  const canShowBet = Boolean(me) && !resolved;

  // Прев'ю «що якщо»: консенсус з урахуванням ще не зафіксованої оцінки.
  const preview = useMemo(() => {
    if (!allowed.ok || !me) return null;
    const rest = (market.bets || []).filter((b) => b.participant !== me.id);
    const what = aggregate(
      { ...market, bets: [...rest, { participant: me.id, p: draft.p, stake: draft.stake }] },
      participants, config
    );
    if (what.p_ensemble == null || what.p_ensemble === agg.p_ensemble) return null;
    return what.p_ensemble;
  }, [allowed.ok, me, market, draft, participants, config, agg.p_ensemble]);

  const shownPct = useCountUp(agg.p_ensemble == null ? null : Math.round(agg.p_ensemble * 100));
  // Оцінки панелі плюс оцінка моделі: саме стільки незалежних голосів стоїть
  // за консенсусом, і саме це число вирішує, чи є що показувати (C10).
  const estimateCount = (market.bets || []).length + (market.san_estimate?.p != null ? 1 : 0);

  const place = (payload) => {
    onPlace(payload);
    setFlash(true);
    setTimeout(() => setFlash(false), 900);
  };

  return (
    <Panel
      glass
      brackets
      className={[
        'k-mk',
        hot ? 'k-mk--hot' : '',
        locked ? 'k-mk--locked' : '',
        resolved ? 'k-mk--resolved' : '',
        agg.divergence_flag ? 'k-mk--diverge' : '',
        flash ? 'k-mk--flash' : '',
      ].filter(Boolean).join(' ')}
      style={{ '--k-mk-i': index }}
    >
      {/* A. заголовна зона */}
      <h3 className="k-mk__q">{market.question}</h3>
      <div className="k-mk__chips">
        <Chip kind={days !== null && days <= 3 && !resolved ? 'is-soon' : ''}>
          {deadlineLabel(days)}
        </Chip>
        <Chip kind={locked ? 'is-locked' : resolved ? 'is-done' : 'is-live'}>
          {!locked && !resolved && <i className="k-chip__pulse" />}
          {locked && <span aria-hidden="true">⌧ </span>}
          {STATUS_UA[market.status] || market.status}
        </Chip>
        <StatusTag kind="assessment">ОЦІНКА</StatusTag>
        <Chip>{agg.n_bets} оцінок</Chip>
        <Chip onClick={() => setOpenInfo((v) => !v)} title="критерій розвʼязки і оцінки панелі">
          критерій
        </Chip>
        {market.self_contamination_risk && <Chip kind="is-warn">ризик самозабруднення</Chip>}
      </div>

      {/* B. геро-зона */}
      <div className="k-mk__hero">
        {/* C10: консенсус не показується, доки оцінок менше порогу. Число з двох
            оцінок виглядає так само вагомо, як число з десяти, тому замість нього
            стоїть чесний лічильник збору. */}
        <div className="k-mk__value">
          <span className="k-note">консенсус</span>
          {estimateCount < COMPASS.consensus_min_estimates ? (
            <span className="k-mk__collect">
              збір оцінок: {estimateCount} з {COMPASS.consensus_min_estimates}
            </span>
          ) : (
            <>
              <b className="k-mk__big">{agg.p_ensemble == null ? 'нема' : `${shownPct}%`}</b>
              {agg.preliminary && <span className="k-note">попередній: оцінок менше трьох</span>}
            </>
          )}
        </div>
        {delta !== null && delta !== 0 && (
          <span className={`k-mk__delta ${delta > 0 ? 'is-up' : 'is-down'}`}>
            {delta > 0 ? '▲' : '▼'} {Math.abs(delta)} п.п.
            <span className="k-note"> за час життя ринку</span>
          </span>
        )}
        {market.history?.length > 1 && (
          <div className="k-mk__spark">
            <Instrument variant="spark" history={market.history} />
          </div>
        )}
        {resolved && (
          <div className={`k-mk__stamp ${market.resolution.outcome ? 'is-yes' : 'is-no'}`}>
            {market.resolution.outcome ? 'ВІДБУЛОСЬ' : 'НЕ ВІДБУЛОСЬ'}
          </div>
        )}
      </div>

      {/* D6: при розходженні від порогу картка за замовчуванням показує шкалу,
          а не одну стрілку консенсусу. Це вигляд картки, не окремий режим. */}
      <DivergenceScale
        san={san}
        humans={agg.p_humans_median}
        consensus={agg.p_ensemble}
        outcome={resolved ? market.resolution?.outcome : null}
      />

      {/* C. інструментальна зона */}
      <Instrument
        variant={resolved || locked ? 'compact' : 'full'}
        agg={agg}
        san={san}
        history={market.history}
        ghost={resolved ? lockedConsensus(market) : preview}
        ghostLabel={
          preview != null ? `${Math.round(preview * 100)}%`
          : resolved && lockedConsensus(market) != null
            ? `на заморозці ${Math.round(lockedConsensus(market) * 100)}%`
            : null
        }
        mine={allowed.ok ? { p: draft.p, callsign: me?.callsign } : null}
        interactive={canShowBet && allowed.ok}
        onPick={(p) => setDraft((s) => ({ ...s, p }))}
      />

      {san == null && <div className="k-note k-mk__nosan">САН: без сигналу, вага моделі 0</div>}

      {/* D. підвал */}
      {resolved && (
        <div className="k-mk__verdict">
          консенсус {pctText(agg.p_ensemble)} проти факту:{' '}
          <b>{market.resolution.outcome ? 'сталось' : 'не сталось'}</b>
          {market.resolution.evidence && <div className="k-note">{market.resolution.evidence}</div>}
        </div>
      )}

      {canShowBet && allowed.ok && (
        <BetControls
          market={market} me={me} markets={markets} config={config}
          draft={draft} setDraft={setDraft} onPlace={place} flash={flash}
        />
      )}
      {canShowBet && !allowed.ok && allowed.reason && (
        <div className="k-mk__blocked">Ставку заблоковано: {allowed.reason}</div>
      )}

      {openInfo && (
        <div className="k-mk__info">
          <div className="k-divider">
            <span className="k-label">критерій розвʼязки</span>
            <div className="k-note">{market.resolution_criterion}</div>
          </div>
          {market.san_estimate && (
            <div className="k-divider">
              <span className="k-label">оцінка моделі</span>
              <div className="k-note">
                {Math.round(market.san_estimate.p * 100)}% · {market.san_estimate.basis} · станом на {market.san_estimate.as_of}
              </div>
            </div>
          )}
          <div className="k-divider">
            <span className="k-label">що каже панель</span>
            {(market.bets || []).map((b) => (
              <div key={b.participant} className="k-mk__note">
                <b>{byId.get(b.participant)?.callsign || b.participant}</b>
                <span className="k-note"> {Math.round(b.p * 100)}%</span>
                {b.note && <div className="k-note">{b.note}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

/** Легенда маркерів живе один раз під стеком, а не в кожній картці. */
function Legend() {
  return (
    <div className="k-ens__legend k-note">
      <span><i className="k-lg k-lg--ens" />консенсус</span>
      <span><i className="k-lg k-lg--san" />модель САН</span>
      <span><i className="k-lg k-lg--med" />медіана панелі</span>
      <span><i className="k-lg k-lg--spr" />розкид оцінок</span>
      <span><i className="k-lg k-lg--div" />зона розходження</span>
      <span><i className="k-lg k-lg--gh" />привид: консенсус на момент заморозки</span>
    </div>
  );
}

/**
 * Що реєстратор може і чого не може в цьому випуску.
 *
 * Постановка дає реєстратору затвердження ринків, фіксацію розвʼязки і ведення
 * реєстру. У випуску без бекенда нічого з цього в інтерфейсі немає: він працює
 * з контрактом руками. Мовчазна тотожність з режимом глядача читалась би як
 * помилка або як забута роль, тому межа сказана вголос, а не залишена на здогад.
 */
function RegistrarNote() {
  return (
    <div className="k-mk__blocked">
      Режим реєстратора: у цьому випуску затвердження ринків, фіксація розвʼязки
      і мерж патчів ставок робляться в контракті тижня, а не тут. Інтерфейс
      показує рівно те саме, що бачить керівництво.
    </div>
  );
}

export default function EnsembleBoard({ ensemble, meId, role, onPlace, now }) {
  const cfg = { ...DEFAULT_CONFIG, ...(ensemble?.config || {}) };
  const participants = ensemble?.participants || [];
  const me = participants.find((p) => p.id === meId) || null;
  const markets = useMemo(
    () => sortMarkets((ensemble?.markets || []).filter((m) => m.status !== 'draft')),
    [ensemble]
  );

  if (!ensemble) return <div className="a-empty">цього тижня компас не збирався</div>;

  const budget = me ? budgetOf(me.id, ensemble.markets || [], cfg) : null;

  return (
    <div className="k-ens">
      <div className="k-ens__head">
        <div>
          <span className="a-tab">КОМПАС</span>
          <div className="k-note">Компас прогнозів: панель експертів + модель</div>
        </div>
        {role === 'registrar' && <RegistrarNote />}
        {budget && (
          <div className="k-note k-ens__budget">
            бюджет тижня: {budget.left} з {budget.total} балів вільні
          </div>
        )}
      </div>

      <div className="k-ens__stack">
        {markets.map((m, i) => (
          <MarketCard
            key={m.id}
            index={i}
            market={m}
            participants={participants}
            config={cfg}
            me={me}
            markets={ensemble.markets || []}
            onPlace={onPlace}
            now={now}
          />
        ))}
      </div>

      <Legend />
    </div>
  );
}

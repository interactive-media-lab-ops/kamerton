import React from 'react';
import { CaseCard } from 'astrolabe-ds';
import { collectCases, casesSummary, shortWeek, precedentFor } from '../data/selectors.js';
import { plural } from '../util/plural.js';

/** Вік кейса словами. Нуль тижнів це не «0 тижнів», а «цього тижня». */
function openedLabel(age) {
  if (age === null || age === undefined) return undefined;
  if (age === 0) return 'відкритий цього тижня';
  return `відкритий ${age} ${plural(age, ['тиждень', 'тижні', 'тижнів'])}`;
}

/**
 * Вікно КЕЙСИ: наскрізні кейси на контролі.
 * Кейс, що є в кількох тижнях, показується один раз, з віком від тижня відкриття.
 */
export default function CasesWindow({ weekId, focusId, onPrecedents }) {
  const cases = collectCases(weekId);
  const sum = casesSummary(weekId);

  return (
    <div className="k-stack">
      <div className="k-row k-row--split">
        <span className="k-sub">
          відкрито {sum.open}, загноїлось {sum.festering}
        </span>
        <span className="k-note">
          найближча перевірка: {sum.nextCheck ? shortWeek(sum.nextCheck) : 'не призначена'}
        </span>
      </div>

      {cases.length === 0 && <div className="a-empty">кейсів на контролі за період немає</div>}

      {cases.map((c) => (
        <div
          key={c.id}
          className={`k-divider ${focusId === c.id ? 'k-focus' : ''}`}
        >
          <CaseCard
            title={c.title}
            status={c.renderStatus}
            stake={c.stake}
            indicator={c.indicator}
            nextCheck={c.next_check ? shortWeek(c.next_check) : undefined}
            openedLabel={openedLabel(c.age)}
          />
          {c.overdueNote && <div className="k-flag">{c.overdueNote}</div>}
          {c.note && <div className="k-note">{c.note}</div>}
          {c.seenWeeks > 1 && (
            <div className="k-note">
              у зведеннях: {c.history.map((h) => shortWeek(h.week)).join(', ')}
            </div>
          )}
          <CaseTabs
            caseId={c.id}
            hasCard={Boolean(precedentFor(c.id, weekId))}
            count={(precedentFor(c.id, weekId)?.analogs || []).length}
            onPrecedents={onPrecedents}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * F3 · вхід у режим ПРЕЦЕДЕНТИ з кейса.
 *
 * Відхилення від Спеки F3-UI, свідоме: спека просить таби ПОТОЧНИЙ СТАН ·
 * ІСТОРІЯ · ПРЕЦЕДЕНТИ, але вікно кейсів у цій збірці це список, а не картка
 * одного кейса. Стан і історія показані одночасно в тому самому рядку, тому
 * таби нічого б не перемикали, а лише сховали б половину видимого. Лишається
 * рівно те, що спека додає нового: третій вхід.
 *
 * Кнопка жива навіть без картки, і це змінено після приймання. Мертва кнопка
 * не відповідала на питання «а що там», а клік по супутнику на карті вів у
 * спільний список кейсів, тобто в чужі прецеденти. Тепер кожен вхід веде рівно
 * до свого кейса, і кейс без аналогів чесно каже, що їх немає.
 */
function CaseTabs({ caseId, hasCard, count, onPrecedents }) {
  if (!onPrecedents) return null;
  return (
    <div className="k-row k-casetabs">
      <span className="k-note">ПОТОЧНИЙ СТАН · ІСТОРІЯ</span>
      <button
        type="button"
        className="k-casetabs__go"
        title={hasCard ? undefined : 'історичних аналогів у корпусі поки немає'}
        onClick={() => onPrecedents(caseId)}
      >
        ІСТОРИЧНІ ПРЕЦЕДЕНТИ{hasCard ? ` · ${count}` : ': не знайдені'}
      </button>
    </div>
  );
}

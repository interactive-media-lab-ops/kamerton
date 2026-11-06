import React from 'react';
import { Panel, HudButton, StatusTag } from 'astrolabe-ds';
import { bluf, shortWeek, getActiveWeek } from '../data/selectors.js';
import { plural } from '../util/plural.js';

/**
 * BLUF-смуга: що сталось і де потрібне рішення, одним поглядом.
 * Третя клітинка не написана руками, а порахована з кейсів на контролі.
 */
export default function BlufStrip({ weekId, sandbox, open, onToggle, onOpenCases, onOpenEnsemble }) {
  const b = bluf(weekId);
  // Розходження моделі і панелі це подія рівня BLUF: керівництву треба знати,
  // що джерела не збіглись, ще до того, як воно відкриє шар.
  const diverged = (getActiveWeek(weekId).ensemble?.markets || []).filter(
    (m) => m.aggregate?.divergence_flag
  );

  // Згорнутий стан це не маленька панель, а один тонкий рядок: смуга має
  // або нести три клітинки, або не займати місця взагалі.
  if (!open) {
    return (
      <div className={`k-bluf k-bluf--slim ${sandbox ? 'k-bluf--sandbox' : ''}`}>
        <div className="k-bluf__slim">
          <span className="k-bluf__slim-mark" aria-hidden="true" />
          <span className="k-bluf__slim-text">
            {sandbox ? 'МОДЕЛЮВАННЯ · гіпотези моделі, не прогноз' : b.threat}
          </span>
          <button
            type="button"
            className="k-bluf__slim-btn"
            onClick={onToggle}
            aria-expanded={false}
          >
            РОЗГОРНУТИ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`k-bluf ${sandbox ? 'k-bluf--sandbox' : ''}`}>
      <Panel glass className="k-bluf__panel">
        <div className="k-bluf__grid">
          <div className="k-bluf__cell k-bluf__cell--threat">
            <div className="k-row">
              <span className="k-bluf__head">Загроза</span>
              <StatusTag status={b.status} />
            </div>
            <p className="k-bluf__text">{b.threat}</p>
          </div>

          <div className="k-bluf__cell k-bluf__cell--opp">
            <div className="k-row">
              <span className="k-bluf__head">Можливість</span>
              <StatusTag status={b.status} />
            </div>
            <p className="k-bluf__text">{b.opportunity}</p>
          </div>

          <div className="k-bluf__cell k-bluf__cell--decision">
            <div className="k-bluf__head">Рішення потрібне</div>
            <div
              className="k-pick"
              role="button"
              tabIndex={0}
              onClick={onOpenCases}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenCases();
                }
              }}
            >
              <p className="k-bluf__decision">
                <span className="k-bluf__count">{b.decision.count}</span>
                <span className="k-note">
                  {plural(b.decision.count, ['кейс чекає', 'кейси чекають', 'кейсів чекають'])}{' '}
                  відповіді
                  {b.decision.nextCheck
                    ? ` · найближча перевірка ${shortWeek(b.decision.nextCheck)}`
                    : ''}
                </span>
              </p>
              {b.decision.festering > 0 && (
                <span className="k-flag">
                  {b.decision.festering}{' '}
                  {plural(b.decision.festering, ['загноївся', 'загноїлись', 'загноїлось'])}
                </span>
              )}
            </div>
          </div>

          <HudButton variant="ghost" onClick={onToggle} aria-expanded>
            ЗГОРНУТИ
          </HudButton>
        </div>

        {diverged.length > 0 && (
          <button type="button" className="k-bluf__ens" onClick={onOpenEnsemble}>
            Компас: розходження моделі і панелі · {diverged.length} з {(getActiveWeek(weekId).ensemble?.markets || []).length} ринків, деталі в шарі КОМПАС
          </button>
        )}
      </Panel>
    </div>
  );
}

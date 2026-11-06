import React from 'react';
import { Panel, HudButton, StatusTag, DeltaBadge } from 'astrolabe-ds';
import { actorName, shortWeek } from '../data/selectors.js';

const TONE_LABEL = { r: 'напруга', g: 'підтримка' };

/**
 * Права картка актора.
 * Позиція і активність це модель, а не вимір, і картка каже це прямо.
 */
export default function ActorCard({ actor, weekId, onClose }) {
  return (
    <Panel glass>
      <div className="k-dock__head">
        <span className="a-tab">АКТОР</span>
        <HudButton variant="ghost" aria-label="закрити панель актора" onClick={onClose}>
          ✕
        </HudButton>
      </div>

      <div className="k-dock__body k-stack k-stack--tight">
        <div className="k-note">джерело: тижневик САН, {shortWeek(weekId)}</div>

        {!actor && <div className="a-empty">актор не знайдений у цьому тижні</div>}

        {actor && (
          <>
            <div className="k-lead">{actor.name}</div>
            <div className="k-row">
              <span className="k-label">{actor.typeLabel}</span>
              {actor.isNew && <span className="k-flag">новий у полі</span>}
            </div>

            <div className="k-row k-row--split">
              <span className="k-sub">позиція {actor.stance}</span>
              <DeltaBadge value={actor.deltaStance} polarity="up-good" hasValue={actor.stance !== null && actor.stance !== undefined} />
            </div>
            <div className="k-row k-row--split">
              <span className="k-sub">активність {actor.activity}</span>
              <DeltaBadge value={actor.deltaActivity} polarity="up-bad" hasValue={actor.activity !== null && actor.activity !== undefined} />
            </div>

            <div className="k-divider k-stack k-stack--tight">
              <div className="k-row">
                <span className="k-label">Що робить цього тижня</span>
                <StatusTag status="assessment" />
              </div>
              <p className="k-sub">{actor.note}</p>
            </div>

            <div className="k-divider k-stack k-stack--tight">
              <div className="k-label">Звʼязки</div>
              {(!actor.links || actor.links.length === 0) && (
                <div className="k-note">названих звʼязків цього тижня немає</div>
              )}
              {(actor.links || []).map((l, i) => (
                <div key={i} className="k-row k-row--split">
                  <span className="k-sub">{actorName(l.to)}</span>
                  <span className={l.tone === 'g' ? 'k-verdict--hit' : 'k-verdict--miss'}>
                    {TONE_LABEL[l.tone] || l.tone}
                  </span>
                </div>
              ))}
            </div>

            <div className="k-divider k-note">
              позиція і активність: оцінка моделі, калібрування щотижня
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

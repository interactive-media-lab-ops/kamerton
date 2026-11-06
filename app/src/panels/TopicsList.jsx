import React from 'react';
import { TopicRow, SectionHeader } from 'astrolabe-ds';
import { getTopics, getExitedTopics, verificationBreakdown } from '../data/selectors.js';

/**
 * Список тем тижня плюс цвинтар тем. Живе внизу лівого дока ЗРІЗ.
 * Клік по рядку підсвічує зорю на карті і відкриває картку теми праворуч,
 * тому список лишається під рукою для наступного кроку.
 */
export default function TopicsList({ weekId, selectedId, onPick }) {
  const topics = getTopics(weekId);
  const exited = getExitedTopics(weekId);

  return (
    <div className="k-stack k-stack--tight">
      {topics.length === 0 && <div className="a-empty">тем за період немає</div>}

      {topics.map((t) => (
        <div
          key={t.id}
          className={`k-pick ${selectedId === t.id ? 'is-on' : ''}`}
          role="button"
          tabIndex={0}
          data-breakdown={JSON.stringify(verificationBreakdown(t))}
          onClick={() => onPick(t.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onPick(t.id);
            }
          }}
        >
          <TopicRow
            rank={t.rank}
            name={t.name}
            aud={t.aud}
            trend={t.trend}
            tone={t.tone}
            verification={t.verificationTag}
            note={t.weight_pct ? `вага ${t.weight_pct}%` : undefined}
          />
        </div>
      ))}

      {exited.length > 0 && (
        <>
          <SectionHeader title="Вийшли з поля" note="теми, що згасли" />
          {exited.map((t, i) => (
            <div
              key={t.id}
              className={`k-pick ${selectedId === t.id ? 'is-on' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => onPick(t.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onPick(t.id);
                }
              }}
            >
              <TopicRow
                rank={i + 1}
                name={t.name}
                aud="both"
                trend="out"
                tone="mixed"
                note={t.reason}
                exited
              />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

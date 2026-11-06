import React from 'react';
import { Panel, HudButton, DoctrineFooter } from 'astrolabe-ds';
import { WEEKS, META, shortWeek, formatPeriod } from '../data/selectors.js';

// Корпус описує себе сам. Діапазон тижнів і версія контракту читаються з даних,
// інакше рядок старіє на кожному новому тижні: саме так тут і сталося, підпис
// застряг на W29-W31 і на версії v1, коли в контракті вже був W32 і v1.4.
// Показуємо видимі тижні, тобто рівно ті, що доступні в перемикачі шапки.
const visibleWeeks = WEEKS.filter((w) => !w.hidden);
const firstWeek = visibleWeeks[0];
const lastWeek = visibleWeeks[visibleWeeks.length - 1];
const CORPUS_NOTE =
  firstWeek && lastWeek
    ? `Корпус: тижні ${shortWeek(firstWeek.id)}-${shortWeek(lastWeek.id)}, ` +
      `${formatPeriod({ from: firstWeek.period.from, to: lastWeek.period.to })} ` +
      `${String(lastWeek.period.to).slice(0, 4)}. Контракт v${META.version}.`
    : '';

/**
 * ABOUT: що це за система і чия вона.
 *
 * Єдине місце в продукті, де звучать прізвища: авторство і памʼять це не дані
 * поля, а підпис під роботою. Скрізь інде правило «без прізвищ» лишається.
 */
export default function AboutWindow({ onClose, onReplayIntro }) {
  return (
    <div className="k-about" role="dialog" aria-modal="true" aria-label="про систему КАМЕРТОН">
      <div className="k-about__veil" onClick={onClose} />
      <Panel glass brackets className="k-about__box">
        <div className="k-stack k-stack--tight">
          <div className="k-about__title">КАМЕРТОН</div>

          <p className="k-lead">
            Середовище звірки джерел для підтримки рішень.
          </p>
          <p className="k-sub">
            Збирає сигнали незалежних джерел про інформаційне поле, звіряє їх і показує,
            де вони сходяться, а де розходяться. Система не претендує на істину: вона дає
            точку звірки. Рішення ухвалює керівництво.
          </p>

          <div className="k-divider k-stack k-stack--tight">
            <p className="k-sub">
              Розроблено лабораторією інтерактивних медіа Культурних Сил.
              Архітектура і розробка: Роман Савицький.
              На основі даних Системи аналізу наративів (САН).
            </p>
            <p className="k-sub">
              Наукову базу системи започаткував Сергій Панцир; завершення його роботи:
              спільний проект команди в його памʼять.
            </p>
            <div className="k-note">{CORPUS_NOTE}</div>
          </div>

          <div className="k-divider k-row k-row--split">
            <DoctrineFooter author="Роман Савицький" />
            <span className="k-row">
              {/* заставка грає раз за сесію, але на показі її треба вміти повторити */}
              {onReplayIntro && (
                <HudButton variant="ghost" onClick={onReplayIntro}>ЗАСТАВКА</HudButton>
              )}
              <HudButton variant="primary" onClick={onClose}>ЗАКРИТИ</HudButton>
            </span>
          </div>
        </div>
      </Panel>
    </div>
  );
}

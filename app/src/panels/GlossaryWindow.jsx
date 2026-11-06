import React from 'react';
import { Panel, HudButton } from 'astrolabe-ds';
import { FIELD, COMPASS } from '../data/thresholds.js';

/**
 * Глосарій за кнопкою «?».
 *
 * Чотири визначення, які тримають усю епістемічну дисципліну продукту:
 * гіпотеза, прогноз, ринок, сценарій. Плюс пояснення трьох чисел, які керівник
 * бачить у шапці і в картках.
 *
 * Пороги не зашиті: вони приходять з config/thresholds.json, тому глосарій не
 * може розійтися з поведінкою інтерфейсу. Там, де історії для чесного порогу
 * ще замало, стоїть позначка «калібрується», а не вигадане число.
 */

const TERMS = [
  {
    term: 'гіпотеза',
    text: 'Припущення без дедлайну і критерію. Ще не операціоналізоване, в рахунок не входить.',
  },
  {
    term: 'прогноз',
    text: 'Твердження з дедлайном і критерієм розвʼязки. Потрапляє в рахунок незалежно від результату.',
  },
  {
    term: 'ринок',
    text: 'Спосіб оцінити прогноз: незалежні оцінки панелі і моделі, консенсус, калібрування за Brier.',
  },
  {
    term: 'сценарій',
    text: 'Модельний наслідок дії важеля. Не прогноз і не факт: показує напрям, а не обіцянку.',
  },
];

export default function GlossaryWindow({ onClose }) {
  return (
    <div className="k-about" role="dialog" aria-modal="true" aria-label="глосарій">
      <div className="k-about__veil" onClick={onClose} />
      <Panel glass brackets className="k-about__box">
        <div className="k-stack k-stack--tight">
          <div className="k-about__title">ГЛОСАРІЙ</div>

          {TERMS.map((t) => (
            <div key={t.term} className="k-stack k-stack--tight">
              <div className="k-label">{t.term}</div>
              <p className="k-sub">{t.text}</p>
            </div>
          ))}

          <div className="k-divider k-stack k-stack--tight">
            <div className="k-label">числа на екрані</div>
            <p className="k-sub">
              σ показує розкид тону в полі. Поріг тегу &laquo;поляризоване&raquo; калібрується:
              історії поки замало.
            </p>
            <p className="k-sub">
              Індекс тону поля це зважена позиція всіх тем на шкалі від деструктиву
              до конструктиву. Дельта поруч це зміна проти попереднього тижня.
            </p>
            <p className="k-sub">
              Активність актора це шкала від 1 до 5: скільки місця він займав у полі
              цього тижня, а не наскільки він важливий.
            </p>
          </div>

          <div className="k-divider k-stack k-stack--tight">
            <div className="k-label">пороги</div>
            <div className="k-note">
              поляризоване поле: σ вище {FIELD.polarized_sigma}
              {FIELD.polarized_calibrating ? ' · калібрується' : ''}
            </div>
            <div className="k-note">
              консенсус ринку показується від {COMPASS.consensus_min_estimates} оцінок
            </div>
            <div className="k-note">
              рейтинг учасників показується від {COMPASS.registry_min_resolved} розвʼязок
            </div>
            <div className="k-note">
              розходження моделі і панелі позначається від {COMPASS.divergence_pp} п.п.
            </div>
          </div>

          <div className="k-divider k-row k-row--split">
            <span />
            <HudButton variant="primary" onClick={onClose}>ЗАКРИТИ</HudButton>
          </div>
        </div>
      </Panel>
    </div>
  );
}

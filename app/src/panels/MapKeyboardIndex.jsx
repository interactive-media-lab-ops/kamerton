import React from 'react';
import { getTopics, getActors, topicShortName, topicName } from '../data/selectors.js';

/**
 * Клавіатурний і скрінрідерний доступ до карти (E3).
 *
 * Полотно це один елемент: у нього не можна протабати, і скрінрідер бачить у
 * ньому порожнечу. Тому поруч живе паралельний список вузлів тижня. Він не
 * дублює логіку і не є другим джерелом правди: це той самий набір даних, який
 * малює карта, поданий у вигляді, який розуміє клавіатура.
 *
 * Список offscreen, а не display:none: прихований через display вузол недоступний
 * ні фокусу, ні скрінрідеру, тобто саме те, чого ми уникаємо.
 *
 * Фокус на елементі підсвічує вузол на полотні кутовими скобами (rule 4 забороняє
 * приціли), Enter відкриває досьє.
 */
export default function MapKeyboardIndex({ weekId, layer, onFocusNode, onSelect }) {
  const items = React.useMemo(() => {
    if (layer === 'actors') {
      return getActors(weekId).map((a) => ({
        id: a.id,
        label: a.name,
        hint: `активність ${a.activity ?? '?'} з 5`,
      }));
    }
    if (layer === 'topics') {
      return getTopics(weekId).map((t) => ({
        id: t.id,
        label: topicShortName(t.id, weekId),
        hint: topicName(t.id, weekId),
      }));
    }
    return [];
  }, [weekId, layer]);

  if (!items.length) return null;

  return (
    <div className="k-a11y">
      <h2>Вузли карти, тиждень {weekId}</h2>
      <ul role="list">
        {items.map((it) => (
          <li key={it.id}>
            <button
              type="button"
              onFocus={() => onFocusNode && onFocusNode(it.id)}
              onBlur={() => onFocusNode && onFocusNode(null)}
              onClick={() => onSelect && onSelect(it.id)}
            >
              {it.label}
              {it.hint && it.hint !== it.label ? ` · ${it.hint}` : ''}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

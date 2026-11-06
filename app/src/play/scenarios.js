// КАМЕРТОН · PLAY.
//
// Один рівний хід від першого дня корпусу до останнього, день за днем.
//
// Чому так, а не кроками по тижнях. Стрибок W30 -> W31 -> W32 це рівно те саме,
// що клацнути три кнопки тижнів руками: три статичні кадри, між якими нічого не
// відбувається. Рух поля саме в переході, а не в кадрах, тому показ мусить його
// показувати, а не приховувати за монтажною склейкою.
//
// Що інтерполюється і що ні. Інтерполюються числа: позиція теми на шкалі тону,
// вага теми, індекс поля, центр ваги. Не інтерполюється жоден текст, статус чи
// вердикт: у них немає проміжного стану, і «наполовину гіпотеза» це не оцінка.
// Тому панелі під картою перемикаються на межі тижня цілим шматком, а карта в
// цей час іде безперервно.
//
// Тижневий зріз це підсумок семи днів, а не знімок понеділка, тому на осі часу
// він стоїть серединою свого періоду. До першої середини і після останньої стан
// тримається рівним: екстраполяція означала б домалювати дані, яких немає.

import {
  listWeeks, getActiveWeek, kamertonIndex, bluf, shortWeek, formatDate,
} from '../data/selectors.js';
import { buildScalefield, blendScalefields, playTimeline, centroidDrift } from '../map/starfield.js';
import { MOTION } from '../data/thresholds.js';

const lerp = (a, b, f) => (a == null || b == null ? (a ?? b) : a + (b - a) * f);

/**
 * Показ корпусу. Повертає не масив кроків, а функцію дня: кроків тут немає,
 * є неперервна вісь, з якої знімається кадр.
 */
export function buildPlay() {
  // listWeeks віддає період уже відформатованим рядком для перемикача, а осі
  // часу потрібні сирі дати, тому періоди беруться з самого тижня.
  const weeks = listWeeks()
    .filter((w) => !w.hidden)
    .map((w) => ({ id: w.id, period: getActiveWeek(w.id).period }));
  const line = playTimeline(weeks);
  const dayMs = MOTION.play_day_ms;

  // Зрізи будуються один раз на весь показ: перебудовувати поле щодня означало б
  // класти на кожен кадр роботу, якої в кадрі немає.
  const fields = new Map(weeks.map((w) => [w.id, buildScalefield(w.id)]));
  const drifts = new Map(weeks.map((w, i) => [
    w.id,
    centroidDrift(w.id, i > 0 ? weeks[i - 1].id : null),
  ]));
  const idx = new Map(weeks.map((w) => [w.id, kamertonIndex(w.id)]));

  function frameAt(i) {
    const t = line.at(i);
    const a = fields.get(t.fromWeek);
    const b = fields.get(t.toWeek);
    const ia = idx.get(t.fromWeek);
    const ib = idx.get(t.toWeek);
    const da = drifts.get(t.fromWeek);
    const db = drifts.get(t.toWeek);

    const b0 = bluf(t.weekId);
    return {
      ...t,
      dateLabel: formatDate(t.date),
      weekLabel: shortWeek(t.weekId),
      field: blendScalefields(a, b, t.f),
      drift: da && db ? { ...db, score: lerp(da.score, db.score, t.f) } : db || da,
      index: {
        value: Math.round(lerp(ia?.value, ib?.value, t.f)),
        sigma: Number(lerp(ia?.sigma, ib?.sigma, t.f)).toFixed(1),
      },
      // Текст тижня, а не дня: він змінюється на межі тижня і не інтерполюється.
      caption: b0?.threat || `${shortWeek(t.weekId)}: зріз тижня`,
      tweenMs: dayMs,
    };
  }

  return { id: 'play', label: 'PLAY', days: line.total, dayMs, frameAt };
}

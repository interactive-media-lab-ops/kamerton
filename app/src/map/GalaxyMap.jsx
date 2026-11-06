import React, { useEffect, useRef, useState } from 'react';
import { createGalaxy } from './galaxy.js';
import { buildScalefield, centroidDrift } from './starfield.js';
import { buildActorfield } from './actorfield.js';
import { prevWeekId , forecastGhosts } from '../data/selectors.js';

/**
 * Робоча зона неба: рівний технічний відступ від країв власної колонки.
 *
 * Міряти панелі більше не треба: у рамі кожна панель має власну колонку сітки,
 * а HUD власний рядок, тому над картою нічого не висить. Механізм «карта
 * посувається під панелі» разом із measureInsets видалений як зайвий.
 */
const EDGE = 24;

/**
 * Скільки ширини карти зараз забрали відкриті панелі.
 *
 * Ширини живуть у змінних сцени, тому читаються звідти, а не дублюються числами:
 * поміняється CSS, поміняється і рама поля.
 *
 * Рахуємо не за назвами модифікаторів, а за самими змінними колонок: базовий
 * стан більше не «смужка зліва завжди», бо в шарах без ЗРІЗУ лівої колонки
 * немає взагалі. Перелік класів тут довелось би тримати синхронним з App, і
 * саме така синхронність уже розійшлась одного разу.
 */
function hiddenWidth() {
  const stage = document.querySelector('.k-stage');
  if (!stage) return 0;
  const cs = getComputedStyle(stage);
  const px = (name) => parseFloat(cs.getPropertyValue(name)) || 0;
  const gap = px('--a-s2');
  const rail = px('--k-rail-w');
  const left = px('--k-left-col');
  const right = px('--k-right-col');
  let hidden = 0;
  // Ховається тільки те, що ширше за смужку: смужка це частина рами поля.
  if (left > rail) hidden += left - rail;
  if (right > rail) hidden += right - rail + gap;
  return hidden;
}

export default function GalaxyMap({
  weekId,
  layer,
  cinema,
  selectedId,
  highlightId,
  layoutKey,
  pulseRequest,
  actorShifts,
  topicShifts,
  onSelect,
  onSelectMoon,
  onApiReady,
  forecastMode,
  playFrame,
}) {
  const canvasRef = useRef(null);
  const apiRef = useRef(null);
  const [tip, setTip] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const api = createGalaxy(canvas, {
      getInsets: () => ({ left: EDGE, right: EDGE, top: EDGE, bottom: EDGE }),
      getHiddenWidth: hiddenWidth,
      onHover: setTip,
      onSelect: (id) => onSelect && onSelect(id),
      onSelectMoon: (id) => onSelectMoon && onSelectMoon(id),
    });
    apiRef.current = api;
    // G1: коуч-міткам потрібні позиції вузлів, а канва це один елемент:
    // зовні їх нізвідки взяти, тому рушій віддає їх нагору.
    if (onApiReady) onApiReady(api);
    return () => api.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // D5: привиди прогнозів вмикаються тумблером і читають Forecast-записи.
  useEffect(() => {
    apiRef.current?.setGhosts(forecastMode ? forecastGhosts(weekId) : []);
  }, [forecastMode, weekId]);

  // дані тижня: теми з центром ваги і актори
  //
  // PLAY подає сюди готовий проміжний зріз через playFrame. Поки він є, тижневий
  // зріз не ставиться: інакше два джерела правди боролися б за одне полотно, і
  // плавний хід збивався б стрибком на кожній зміні тижня.
  useEffect(() => {
    if (playFrame) return;
    apiRef.current?.setScalefield(
      buildScalefield(weekId),
      centroidDrift(weekId, prevWeekId(weekId))
    );
    apiRef.current?.setActorfield(buildActorfield(weekId));
  }, [weekId, Boolean(playFrame)]);

  // Плавний хід: один кадр на день, твін рівно на довжину дня.
  useEffect(() => {
    if (!playFrame) return;
    apiRef.current?.setScalefield(playFrame.field, playFrame.drift, { tweenMs: playFrame.tweenMs });
  }, [playFrame]);

  useEffect(() => {
    apiRef.current?.setLayer(layer === 'actors' || layer === 'forecast' ? 'actors' : 'topics');
  }, [layer, weekId]);

  // режим заставки: карта показує рівно стільки шарів, скільки просить сценарій
  useEffect(() => {
    apiRef.current?.setCinema(cinema || null);
  }, [cinema]);

  useEffect(() => {
    apiRef.current?.relayout();
    apiRef.current?.resize();
  }, [layoutKey]);

  useEffect(() => {
    apiRef.current?.setSelected(selectedId || null);
  }, [selectedId]);

  useEffect(() => {
    apiRef.current?.setHighlight(highlightId || null);
  }, [highlightId]);

  useEffect(() => {
    apiRef.current?.setActorShifts(actorShifts || {});
  }, [actorShifts]);

  useEffect(() => {
    apiRef.current?.setTopicShifts(topicShifts || {});
  }, [topicShifts]);

  useEffect(() => {
    if (pulseRequest?.id) apiRef.current?.pulse(pulseRequest.id);
  }, [pulseRequest?.seq, pulseRequest?.id]);

  return (
    <div className="k-map">
      <canvas ref={canvasRef} className="k-map__canvas" />
      {tip && (
        // Підказка тримається в межах карти: у зорі скраю вона інакше виїжджає
        // за край і половину назви не прочитати. Половина максимальної ширини
        // тултіпа це 180px, звідси і поля.
        <div
          className="k-tip"
          style={{
            left: Math.max(184, Math.min(tip.x, (canvasRef.current?.clientWidth || 0) - 184)),
            top: tip.y,
          }}
          role="tooltip"
        >
          {tip.name}
          {tip.exited && <span className="k-tip__out"> вийшла з поля</span>}
        </div>
      )}
    </div>
  );
}

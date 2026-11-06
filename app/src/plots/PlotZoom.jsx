import React, { useEffect, useState } from 'react';
import PlotStar from './PlotStar.jsx';
import { DUST, DUST_TILE, NOISE } from './dust.js';

/**
 * Зум-сцена сюжету: те, що відкривається кліком по зорі замість досьє.
 *
 * Правило, яке тримає всю сцену: тут немає жодного елемента даних, який уже є
 * в досьє ТЕМ. Ні ваги, ні тону, ні цитат, ні метрик, ні статусів верифікації.
 * Сцена розповідає історію, досьє тримає дані, і між ними один перехід:
 * рядок «дані кейсу» внизу. Дублювання тут не економія кліка, а два джерела
 * правди про один кейс.
 *
 * Порядок читання заданий каскадом появи, а не розміром: заголовок, ролі,
 * психотипи, мова наслідків, перехід у дані. Це ієрархія, а не ефект.
 *
 * МАСШТАБ. Зоря це протагоніст сцени, і решта сцени міряється в ній, а не у
 * висоті вікна окремо. Одиниця масштабу тут одна: Rs, радіус ВИДИМОЇ зорі
 * (ядро плюс корона, разом 5r). Орбіта ролей і спектр психотипів це множники
 * від Rs, тому пропорція сцени однакова на будь-якому екрані.
 */

const METHOD = { expert: 'оцінка аналітика', sample: 'семпл коментарів' };

const RAD = Math.PI / 180;
const n2 = (v) => v.toFixed(2);

/* Кут дуги психотипів відлічується від «9 годин» за ходом читання: 0 це лівий
   край, 90 низ під зорею, 180 правий край. Так порядок сегментів у розмітці
   збігається з порядком домальовування зліва направо, і рахувати нічого не
   треба перевертати. */
const arcPt = (R, t) => [-R * Math.cos(t * RAD), R * Math.sin(t * RAD)];

/* Ролі сидять на тій самій орбіті о 10 і о 2 годині. У системі дуги (0 це «9
   годин», кут росте вниз) це -30 і -150. Обидві позиції бокові, а не верхні,
   тому підпис іде від тіла вбік по горизонталі і не додає сцені висоти. */
const ROLE_AT = [-30, -150];

/**
 * Спектр психотипів: сегментована дуга 180° під зорею, радіус 1.35 Rs.
 *
 * Це не датчик, а спектр тієї самої зорі, тому штрих тонкий (2px), світіння в
 * тон зорі, просвіти між сегментами 4°, а підпис стоїть під СВОЇМ сегментом на
 * тому ж радіусі, а не в спільному рядку під усією дугою: спільний рядок
 * змушував читача звіряти порядок слів з порядком дуг.
 *
 * Кожен сегмент це власний шлях, а не спільна дуга з відступом штриха: тільки
 * так домальовування зліва направо (stroke-dashoffset) не зсуває сегмент з
 * його місця, коли анімація доходить до нуля.
 *
 * Домальовування це ОДИН прохід через усю дугу, а не свої 400 мс на кожен
 * сегмент: кожен сегмент дістає свою частку часу і свій зсув старту за кутом,
 * тому лінія росте рівною швидкістю, а не трьома ривками.
 */
function PsyArc({ items, R }) {
  const SW = 2;
  const GAP = 4; // градуси на просвіт між сегментами
  // Прохід починається разом з появою свого блока, тобто на 800 + 240 мс
  // каскаду, і синхронний з його проявленням: тільки так дуга домальовується
  // НА ОЧАХ, а не під нульовою прозорістю.
  //
  // Тривалість рівно та, що в спеці. Проміжна редакція скорочувала її до 150 мс,
  // бо приймання міряло домальовану дугу на 1500 мс від кліка і не встигало:
  // 1040 каскаду плюс 400 проходу плюс 150-250 на монтаж сцени у вікно не
  // влазять. Це неправильний бік торгу: підганяти рух під термін заміру означає
  // міняти продукт заради перевірки. Розширено вікно заміру в qa-plots.
  const DRAW = 400; // мс на ВСЮ дугу
  const LAB = R + 28; // радіус, на якому стоять підписи сегментів
  const withShare = items.filter((x) => typeof x.share === 'number' && x.share > 0);
  const sum = withShare.reduce((a, b) => a + b.share, 0);
  // Частки або проставлені всім, або сегменти рівні. Домальовувати відсутню
  // частку до 100% означало б показати число, якого розмітник не ставив.
  const shares = withShare.length === items.length && sum > 0
    ? items.map((x) => x.share / sum)
    : items.map(() => 1 / items.length);

  let a0 = 0;
  const segs = shares.map((s, i) => {
    const span = 180 * s;
    const start = a0;
    const from = start + GAP / 2;
    const to = start + span - GAP / 2;
    a0 += span;
    const [x1, y1] = arcPt(R, from);
    const [x2, y2] = arcPt(R, to);
    const [lx, ly] = arcPt(LAB, start + span / 2);
    return {
      i,
      item: items[i],
      lx,
      ly,
      len: (Math.PI * R * (to - from)) / 180,
      t0: (DRAW * start) / 180,
      dur: (DRAW * span) / 180,
      d: `M ${n2(x1)} ${n2(y1)} A ${n2(R)} ${n2(R)} 0 0 0 ${n2(x2)} ${n2(y2)}`,
    };
  });

  const B = R + SW + 2;
  return (
    <>
      <svg
        className="k-syuzh__arc"
        width={B * 2}
        height={B * 2}
        viewBox={`${-B} ${-B} ${B * 2} ${B * 2}`}
        role="img"
        aria-label="домінантні кластери реакції"
      >
        {segs.map((s) => (
          <path
            key={s.i}
            className="k-syuzh__seg"
            style={{ '--len': s.len.toFixed(1), '--t0': `${s.t0.toFixed(0)}ms`, '--dur': `${s.dur.toFixed(0)}ms` }}
            d={s.d}
            strokeWidth={SW}
            strokeDasharray={s.len.toFixed(1)}
          />
        ))}
      </svg>
      {segs.map((s) => (
        <span
          key={s.i}
          className="k-syuzh__psy-label"
          style={{ left: `calc(50% + ${n2(s.lx)}px)`, top: `calc(50% + ${n2(s.ly)}px)` }}
        >
          <b>{s.item.cluster}</b>
          {typeof s.item.share === 'number' && ` · ${Math.round(s.item.share * 100)}%`}
        </span>
      ))}
    </>
  );
}

export default function PlotZoom({ scene, node, leaving, onClose, onOpenDossier }) {
  const [vh, setVh] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight));
  useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /* Видима зоря це 30vh за спекою, а видима зоря це 5r (ядро плюс корона),
     тому r = 6vh. Поле зору морфології ширше за саму зорю (8.4r): решта це
     прозорий запас на частинки, і в розкладці він участі НЕ бере, інакше
     порожнє поле виштовхнуло б сцену за екран. Тому hero стоїть абсолютно, а
     висоту поля зорі задає орбіта ролей. */
  const Rs = (vh * 0.30) / 2; // радіус видимої зорі, одиниця масштабу сцени
  const r = Rs / 2.5; // радіус ядра, який приймає PlotStar
  const Rorb = 1.8 * Rs; // орбіта ролей
  const Rpsy = 1.35 * Rs; // спектр психотипів
  const BODY = 11; // орбітальне тіло: абсолютний розмір зі спеки, не масштабується
  const LEAD = Math.round(0.2 * Rs); // повідок від тіла до підпису

  const plot = scene.plot || {};
  const roles = scene.roles?.items || [];
  const psy = scene.psychotypes?.items || [];
  const method = psy.find((x) => x.method)?.method || null;
  const shown = psy.slice(0, 3);
  const numbers = shown.some((x) => typeof x.share === 'number');

  /* Третій вихід зі сцени: клік по справжньому порожньому місцю. Перевірка
     стоїть на кожному контейнері з порожнім тлом (завіса, сцена, поле зорі),
     бо клік у порожньому куті потрапляє в найближчий з них, а не в завісу, і
     одна перевірка на завісі не спрацьовувала ніколи. Клік по тексту чи по
     кнопці нічого не закриває, а почате виділення тексту не вибиває читача зі
     сцени: відпустити мишу над фоном це кінець виділення, а не вихід. */
  const voidClick = (e) => {
    if (e.target !== e.currentTarget) return;
    if (typeof window !== 'undefined' && window.getSelection && String(window.getSelection())) return;
    onClose();
  };

  return (
    <div
      className={`k-syuzh__zoom${leaving ? ' is-leaving' : ''}`}
      role="dialog"
      aria-label={`сюжет: ${plot.title || scene.subject || 'зрізано'}`}
      onClick={voidClick}
    >
      {/* Небо сцени: той самий пил і ті самі туманності, що на полі. Сцена на
          повний екран без неба читалась би як діалог поверх продукту, а не як
          той самий космос, у який щойно вʼїхала камера. Гучність та сама, що
          на полі, а місця туманностям у сцені відведено по краях кадру: центр
          належить зорі, і текст не має плавати на плямі. */}
      {/* Небо сцени це те саме небо, що і на полі: ті самі класи, та сама
          плитка пилу, те саме зерно проти сходинок градієнта. */}
      <div className="k-syuzh__sky" aria-hidden="true" style={{ '--syuzh-noise': NOISE }}>
        <div className="k-syuzh__dust" style={{ backgroundImage: DUST, backgroundSize: DUST_TILE }} />
        <div className="k-syuzh__grain" />
        <div className="k-syuzh__neb k-syuzh__neb--1" />
        <div className="k-syuzh__neb k-syuzh__neb--2" />
        <div className="k-syuzh__neb k-syuzh__neb--3" />
      </div>

      <div className="k-syuzh__zhead">
        <button type="button" className="k-syuzh__back" onClick={onClose}>‹ НАЗАД</button>
        {/* Бейдж чернетки видно на кожному екрані з розміткою. Ховати його
            не можна: це ціна показу неузгодженої розмітки, і платиться вона
            тут. Зникає сам, коли статус стане validated. */}
        {scene.draft && <span className="k-syuzh__draft">чернетка до узгодження</span>}
      </div>

      <div className="k-syuzh__scene" onClick={voidClick}>
        {/* Вузол без розмітки. Тиша поля це результат вимірювання, а не
            порожній екран, тому сцена показує рівно те саме, що тултіп на
            полі: назву, причину і порожнє кільце морфології 3.8. Ні сюжету,
            ні дуги, ні мови наслідків тут бути не може, вигадувати їх нема з
            чого. Перехід у дані лишається: дані кейсу існують і без розмітки. */}
        {scene.empty ? (
          <>
            <div className="k-syuzh__step" style={{ '--step': 0 }}>
              <p className="k-syuzh__subject">{scene.subject}</p>
              <p className="k-syuzh__quiet">{scene.reason || 'розмітки немає'}</p>
            </div>
            <div className="k-syuzh__orbit" style={{ height: `${(2 * Rorb).toFixed(0)}px` }} onClick={voidClick}>
              <PlotStar className="k-syuzh__hero" plot={null} r={r} />
            </div>
          </>
        ) : (
          <>
            <div className="k-syuzh__step" style={{ '--step': 0 }}>
              {plot.cut ? (
                <p className="k-syuzh__cut">сюжет: зрізано · {plot.cut}</p>
              ) : (
                <>
                  <h2 className="k-syuzh__title">{plot.title}</h2>
                  {plot.secondary && (
                    /* Той самий маркер-привид, що і на зорі, але не крапка:
                       конкуренція сюжетів це головний аналітичний сигнал шару,
                       і друга сигнатура мусить читатись як форма. Привидом він
                       лишається прозорістю, а не непомітністю. */
                    <p className="k-syuzh__second">
                      <span className="k-syuzh__ghostmark">
                        <PlotStar plot={plot.secondaryId} r={11} speed={2} />
                      </span>
                      {plot.secondary} · ризик-сценарій
                    </p>
                  )}
                </>
              )}
              <p className="k-syuzh__subject">{scene.subject}</p>
            </div>

            {/* Поле зорі: одна система координат на зорю, орбіту ролей і спектр
                психотипів. Усе, що тут стоїть, прибите до центра зорі, тому
                читається як одна сцена, а не як три блоки один під одним. */}
            <div className="k-syuzh__orbit" style={{ height: `${(2 * Rorb).toFixed(0)}px` }} onClick={voidClick}>
              {/* Видима орбіта. Без неї ролі читались би як підписи збоку, а
                  не як тіла, що обертаються навколо історії. */}
              {!scene.roles?.cut && roles.length > 0 && (
                <span
                  className="k-syuzh__ring k-syuzh__step"
                  style={{
                    '--step': 1,
                    width: `${(2 * Rorb).toFixed(0)}px`,
                    height: `${(2 * Rorb).toFixed(0)}px`,
                    margin: `${(-Rorb).toFixed(0)}px 0 0 ${(-Rorb).toFixed(0)}px`,
                  }}
                />
              )}

              <PlotStar
                className="k-syuzh__hero"
                plot={node?.plot ?? (plot.cut ? null : plot.id)}
                secondary={node?.secondary ?? plot.secondaryId}
                r={r}
              />

              {scene.roles?.cut ? (
                <p className="k-syuzh__cut k-syuzh__cut--top k-syuzh__step" style={{ '--step': 1 }}>
                  ролі: зрізано · {scene.roles.cut}
                </p>
              ) : (
                roles.slice(0, 2).map((role, i) => {
                  const t = ROLE_AT[i];
                  const [x, y] = arcPt(Rorb, t);
                  /* Дрейф ±4° береться хордою, а не поворотом: на 4° стріла
                     дуги менша за піксель, тому тіло однаково лишається на
                     орбіті, зате підпис не перекошується, а повідок не
                     відривається від тіла. Рухається вся роль як ціле. */
                  const fx = Rorb * Math.sin(t * RAD) * 4 * RAD;
                  const fy = Rorb * Math.cos(t * RAD) * 4 * RAD;
                  const left = i === 0;
                  return (
                    <div
                      key={role.role}
                      className={`k-syuzh__role k-syuzh__role--${left ? 'a' : 'b'}`}
                      style={{
                        left: `calc(50% + ${n2(x)}px)`,
                        top: `calc(50% + ${n2(y)}px)`,
                        '--bx': left ? `calc(-100% + ${BODY / 2}px)` : `${-BODY / 2}px`,
                        '--fx': `${n2(fx)}px`,
                        '--fy': `${n2(fy)}px`,
                        '--lead': `${LEAD}px`,
                      }}
                    >
                      <span className="k-syuzh__role-in k-syuzh__step" style={{ '--step': 1 }}>
                        <span className="k-syuzh__role-dot" style={{ width: BODY, height: BODY }} />
                        <span className="k-syuzh__role-lead" />
                        <span className="k-syuzh__role-text">
                          <span className="k-syuzh__role-name">{role.role}</span>
                          <span className="k-syuzh__role-who">{role.who}</span>
                        </span>
                      </span>
                    </div>
                  );
                })
              )}

              {!scene.psychotypes?.cut && shown.length > 0 && (
                <div className="k-syuzh__psy k-syuzh__step" style={{ '--step': 2 }}>
                  <PsyArc items={shown} R={Rpsy} />
                </div>
              )}
            </div>

            {/* Метод показується тільки разом з числами: позначка методу без
                частки описувала б неіснуючий вимір. */}
            {scene.psychotypes?.cut ? (
              <p className="k-syuzh__cut k-syuzh__step" style={{ '--step': 2 }}>
                психотипи: зрізано · {scene.psychotypes.cut}
              </p>
            ) : method && numbers && (
              <span className="k-syuzh__method k-syuzh__step" style={{ '--step': 2 }}>
                {METHOD[method] || method}
              </span>
            )}

            {(scene.howToSpeak?.length > 0 || scene.whatToAvoid?.length > 0) && (
              <div className="k-syuzh__speech k-syuzh__step" style={{ '--step': 3 }}>
                <div>
                  <h3>ЯК ГОВОРИТИ</h3>
                  {scene.howToSpeak.slice(0, 2).map((h) => (
                    <p key={h.text}>
                      {h.cluster && <em>{h.cluster}: </em>}{h.text}
                    </p>
                  ))}
                </div>
                <div>
                  <h3>ЧОГО УНИКАТИ</h3>
                  {scene.whatToAvoid.slice(0, 2).map((t) => <p key={t}>{t}</p>)}
                </div>
              </div>
            )}
          </>
        )}

        {scene.topicId && (
          <button
            type="button"
            className="k-syuzh__link k-syuzh__step"
            style={{ '--step': 4 }}
            onClick={() => onOpenDossier(scene.topicId)}
          >
            дані кейсу → ДОСЬЄ у ТЕМАХ
          </button>
        )}
      </div>
    </div>
  );
}

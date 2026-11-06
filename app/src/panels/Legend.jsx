import React, { useState } from 'react';
import { plotLegend } from '../data/selectors.js';
import PlotStar, { hasMorphology } from '../plots/PlotStar.jsx';
import { Panel } from 'astrolabe-ds';

/**
 * Легенда зі зразками.
 *
 * Текстова простиня під картою пояснювала гліфи словами, і читач мусив
 * перекладати «пунктирне кільце» у те, що бачить. Тепер кожен рядок несе
 * сам гліф у тому ж вигляді, що й на карті, а панель згорнута, поки не
 * потрібна: карті не треба конкурувати з інструкцією до себе.
 */
const S = 34; // ширина клітинки зразка

function Sample({ children, w = S }) {
  return (
    <svg className="k-leg__glyph" width={w} height="16" viewBox={`0 0 ${w} 16`} aria-hidden="true">
      {children}
    </svg>
  );
}

function Row({ sample, text }) {
  return (
    <li className="k-leg__row">
      {sample}
      <span className="k-note">{text}</span>
    </li>
  );
}

const TOPIC_ROWS = [
  {
    text: 'вага теми: мала / середня / домінанта (оцінка аналітика)',
    sample: (
      <Sample w={46}>
        <circle cx="6" cy="8" r="2.5" fill="var(--a-text-mut)" />
        <circle cx="20" cy="8" r="4.5" fill="var(--a-text-mut)" />
        <circle cx="36" cy="8" r="7" fill="var(--a-text-mut)" />
      </Sample>
    ),
  },
  {
    text: 'тон: деструктив / конструктив',
    sample: (
      <Sample>
        <circle cx="10" cy="8" r="5" fill="var(--a-destr)" />
        <circle cx="26" cy="8" r="5" fill="var(--a-constr)" />
      </Sample>
    ),
  },
  {
    text: 'зовнішнє кільце: джерела розходяться',
    sample: (
      <Sample>
        <circle cx="17" cy="8" r="4" fill="var(--a-warn)" />
        <circle
          cx="17" cy="8" r="7"
          fill="none" stroke="var(--a-warn)" strokeWidth="1" strokeDasharray="2 3"
        />
      </Sample>
    ),
  },
  // C11: контур самого вузла це другий вимір, не той самий, що кільце джерел.
  // Кільце каже, чи сходяться джерела. Контур каже, чим є твердження.
  // У легенді вони стоять поруч саме тому, що їх найлегше сплутати.
  {
    text: 'контур вузла: факт',
    sample: (
      <Sample>
        <circle cx="17" cy="8" r="5.5" fill="none" stroke="var(--a-text)" strokeWidth="1.2" />
      </Sample>
    ),
  },
  {
    text: 'контур вузла: оцінка',
    sample: (
      <Sample>
        <circle
          cx="17" cy="8" r="5.5"
          fill="none" stroke="var(--a-text)" strokeWidth="1.2" strokeDasharray="5 4"
        />
      </Sample>
    ),
  },
  {
    text: 'контур вузла: гіпотеза',
    sample: (
      <Sample>
        <circle
          cx="17" cy="8" r="5.5"
          fill="none" stroke="var(--a-text)" strokeWidth="1.2" strokeDasharray="1.5 3.5"
        />
      </Sample>
    ),
  },
  {
    text: 'вийшла з поля',
    sample: (
      <Sample>
        <circle cx="17" cy="8" r="3.5" fill="var(--a-text-dim)" opacity="0.45" />
      </Sample>
    ),
  },
  {
    text: 'центр ваги поля, не нуль шкали (оцінка)',
    sample: (
      <Sample>
        <path d="M17 2 L22 8 L17 14 L12 8 Z" fill="var(--a-cyan)" />
      </Sample>
    ),
  },
  {
    text: 'порожній інтервал шкали стиснуто',
    sample: (
      <Sample>
        <line x1="4" y1="8" x2="12" y2="8" stroke="var(--a-line)" strokeWidth="1.5" />
        <line x1="15" y1="13" x2="19" y2="3" stroke="var(--a-text-dim)" strokeWidth="1.5" />
        <line x1="19" y1="13" x2="23" y2="3" stroke="var(--a-text-dim)" strokeWidth="1.5" />
        <line x1="26" y1="8" x2="34" y2="8" stroke="var(--a-line)" strokeWidth="1.5" />
      </Sample>
    ),
  },
];

const ACTOR_ROWS = [
  {
    text: 'розмір вузла: активність актора',
    sample: (
      <Sample>
        <circle cx="10" cy="8" r="3" fill="var(--a-text-mut)" />
        <circle cx="26" cy="8" r="6" fill="var(--a-text-mut)" />
      </Sample>
    ),
  },
  {
    text: 'позиція: ліворуч деструктив, праворуч конструктив (оцінка моделі)',
    sample: (
      <Sample>
        <line x1="4" y1="8" x2="30" y2="8" stroke="var(--a-line)" strokeWidth="1.5" />
        <circle cx="9" cy="8" r="3" fill="var(--a-destr)" />
        <circle cx="27" cy="8" r="3" fill="var(--a-constr)" />
      </Sample>
    ),
  },
  {
    text: 'лінія: червона напруга, зелена підтримка',
    sample: (
      <Sample>
        <line x1="4" y1="5" x2="30" y2="5" stroke="var(--a-destr)" strokeWidth="1.5" />
        <line x1="4" y1="12" x2="30" y2="12" stroke="var(--a-constr)" strokeWidth="1.5" />
      </Sample>
    ),
  },
];

/**
 * Легенда шару СЮЖЕТИ: ряд живих мініатюр, а не кольорові крапки.
 *
 * Крапки тут неможливі за побудовою: на цій вкладці колір нічого не кодує,
 * сюжет несе форма і рух. Тому в легенді стоїть справжній рендер тієї самої
 * морфології, тільки менший і вдвічі повільніший; наведення розганяє його до
 * повної швидкості. Ряд будується з довідника, тому доданий сюжет підхопиться
 * сам, як тільки зʼявиться його морфологія.
 */
function PlotsLegend() {
  // Швидкість мініатюри задається пропсом, а не CSS-правилом на hover, і це
  // вимушено: PlotStar пише --syu-speed інлайном, тому таблиця стилів його не
  // перебиває в принципі. Правило «:hover { --syu-speed: 1 }» виглядало живим,
  // а мініатюра лишалась удвічі повільною назавжди.
  const [hot, setHot] = useState(null);
  const item = (key, plot, label) => (
    <div
      key={key}
      className="k-syuzh-leg__item"
      onMouseEnter={() => setHot(key)}
      onMouseLeave={() => setHot((v) => (v === key ? null : v))}
    >
      <span className="k-syuzh-leg__shape">
        <PlotStar plot={plot} r={10} speed={hot === key ? 1 : 2} />
      </span>
      <span className={`k-syuzh-leg__name${hot === key ? ' is-hot' : ''}`}>{label}</span>
    </div>
  );

  return (
    <div className="k-syuzh-leg">
      <div className="k-syuzh-leg__row">
        {plotLegend().filter((p) => hasMorphology(p.id)).map((p) => item(p.id, p.id, p.label))}
        {item('none', null, 'поле промовчало / зрізано')}
      </div>
      <div className="k-syuzh-leg__note">
        напівпрозоре накладення другої сигнатури: два сюжети конкурують
      </div>
    </div>
  );
}

/**
 * Легенда шару ГРАВІТОН. Сектори підписані номерами на сцені, тому легенда
 * зобовʼязана розгорнути номери в назви сюжетів з довідника: номер без
 * розшифровки це шифр, а не дефіцит.
 */
const GRAVITON_ROWS = [
  {
    text: 'розмір тіла = маса (вага уваги, виміряно)',
    sample: (
      <Sample w={46}>
        <circle cx="8" cy="8" r="3" fill="none" stroke="var(--a-text-dim)" strokeWidth="1.1" />
        <circle cx="30" cy="8" r="7" fill="none" stroke="var(--a-text-dim)" strokeWidth="1.1" />
      </Sample>
    ),
  },
  {
    text: 'відстань від ядра = культурна дистанція (модель, проксі v1; шкала коренева, як у зоряних карт)',
    sample: (
      <Sample>
        <circle cx="8" cy="8" r="3" fill="var(--a-text-mut)" />
        <line x1="14" y1="8" x2="30" y2="8" stroke="var(--a-line-bright)" strokeWidth="1" strokeDasharray="2 3" />
      </Sample>
    ),
  },
  {
    text: 'лінія між тілами = сила тяжіння звʼязку',
    sample: (
      <Sample>
        <line x1="4" y1="8" x2="30" y2="8" stroke="var(--a-line-bright)" strokeWidth="2" />
      </Sample>
    ),
  },
  {
    text: 'пунктирне коло навколо ядра = горизонт фазового переходу (модель)',
    sample: (
      <Sample>
        <circle cx="17" cy="8" r="6.5" fill="none" stroke="var(--a-brass-dim)" strokeWidth="0.8" strokeDasharray="2 4" />
      </Sample>
    ),
  },
  {
    text: 'темне тіло з диском = чорна діра (атрактор): стягує звʼязки і вагу поля',
    sample: (
      <Sample>
        <circle cx="17" cy="8" r="4" fill="var(--a-bg)" stroke="var(--a-warn)" strokeWidth="1.1" />
        <circle cx="17" cy="8" r="7" fill="none" stroke="var(--a-warn)" strokeWidth="1" strokeDasharray="4 3" />
      </Sample>
    ),
  },
  {
    text: 'хрестик = нуль шкали; ядро зміщене від нього барицентром поля',
    sample: (
      <Sample>
        <line x1="7" y1="8" x2="13" y2="8" stroke="var(--a-text-mut)" strokeWidth="1" />
        <line x1="10" y1="5" x2="10" y2="11" stroke="var(--a-text-mut)" strokeWidth="1" />
        <line x1="13" y1="8" x2="22" y2="8" stroke="var(--a-brass-dim)" strokeWidth="1" strokeDasharray="2 2" />
        <circle cx="27" cy="8" r="4" fill="var(--a-bg-sunken)" stroke="var(--a-brass-dim)" strokeWidth="1" />
      </Sample>
    ),
  },
  {
    text: 'латунний контур = кандидат у метанаратив (модель)',
    sample: (
      <Sample>
        <circle cx="17" cy="8" r="5.5" fill="none" stroke="var(--a-brass)" strokeWidth="1.6" />
      </Sample>
    ),
  },
  {
    text: 'пунктирний контур = висока ентропія: тон нестабільний',
    sample: (
      <Sample>
        <circle cx="17" cy="8" r="5.5" fill="none" stroke="var(--a-text-dim)" strokeWidth="1.2" strokeDasharray="3 3" />
      </Sample>
    ),
  },
  {
    text: 'приглушене тіло = сюжет зрізано або розмітки немає; сектори його не стосуються',
    sample: (
      <Sample>
        <circle cx="17" cy="8" r="5.5" fill="var(--a-text-mut)" opacity="0.55" />
      </Sample>
    ),
  },
  {
    text: 'знак питання = рух не пояснено видимими звʼязками',
    sample: (
      <Sample>
        <text x="14" y="12" fontSize="11" fill="var(--a-warn)">?</text>
      </Sample>
    ),
  },
  {
    text: 'стрілка до ядра = сила наративу: маса × резонанс / дистанція² (модель)',
    sample: (
      <Sample>
        <circle cx="8" cy="8" r="4" fill="none" stroke="var(--a-text-dim)" strokeWidth="1.1" />
        <line x1="13" y1="8" x2="26" y2="8" stroke="var(--a-brass-dim)" strokeWidth="1" />
        <path d="M 30 8 L 25 5.5 L 25 10.5 Z" fill="var(--a-brass-dim)" />
      </Sample>
    ),
  },
  {
    text: 'сяйво тіла = зчеплення з ядром: світиться те, що резонує',
    sample: (
      <Sample>
        <circle cx="17" cy="8" r="7" fill="var(--a-cyan)" opacity="0.18" />
        <circle cx="17" cy="8" r="4" fill="none" stroke="var(--a-text-dim)" strokeWidth="1.1" />
      </Sample>
    ),
  },
  {
    text: 'частинки вздовж звʼязку = напрям живлення, темп від сили',
    sample: (
      <Sample>
        <path d="M 4 12 Q 17 4 30 12" fill="none" stroke="var(--a-line-bright)" strokeWidth="0.8" />
        <circle cx="12" cy="8.6" r="1.8" fill="var(--a-cyan)" />
        <circle cx="22" cy="8.6" r="1.8" fill="var(--a-cyan)" opacity="0.6" />
      </Sample>
    ),
  },
  {
    text: 'оберт і хвіст = закон Кеплера від дистанції; час сцени модельний, не з даних',
    sample: (
      <Sample>
        <path d="M 6 12 A 12 12 0 0 1 20 5" fill="none" stroke="var(--a-line-bright)" strokeWidth="1" opacity="0.5" />
        <circle cx="20" cy="5" r="3" fill="none" stroke="var(--a-text-dim)" strokeWidth="1.1" />
      </Sample>
    ),
  },
  {
    text: 'тремтіння тіла = виміряна ентропія (волатильність тону)',
    sample: (
      <Sample>
        <circle cx="15" cy="8" r="4" fill="none" stroke="var(--a-text-dim)" strokeWidth="1" strokeDasharray="3 3" />
        <circle cx="20" cy="10" r="1" fill="var(--a-text-mut)" />
        <circle cx="11" cy="5" r="1" fill="var(--a-text-mut)" />
      </Sample>
    ),
  },
];

function GravitonLegend() {
  return (
    <ul className="k-leg__list">
      {GRAVITON_ROWS.map((r) => (
        <Row key={r.text} sample={r.sample} text={r.text} />
      ))}
      <li className="k-leg__row k-leg__row--hint">
        <span className="k-note">
          сектори за архетипними сюжетами: {plotLegend().map((p) => `${p.index} ${p.label}`).join(' · ')}
        </span>
      </li>
      <li className="k-leg__row k-leg__row--hint">
        <span className="k-note">
          геометрія сцени модельна: банер зверху каже це прямо, паспорт тіла показує метод кожної величини
        </span>
      </li>
    </ul>
  );
}

export default function Legend({ layer }) {
  const [open, setOpen] = useState(false);
  const isPlots = layer === 'plots';
  const isGraviton = layer === 'graviton';
  const rows = layer === 'topics' ? TOPIC_ROWS : ACTOR_ROWS;

  return (
    <aside className="k-legend" aria-label="легенда карти">
      {open && (
        <Panel glass className="k-leg__box">
          {isPlots ? (
            <PlotsLegend />
          ) : isGraviton ? (
            <GravitonLegend />
          ) : (
            <ul className="k-leg__list">
              {rows.map((r) => (
                <Row key={r.text} sample={r.sample} text={r.text} />
              ))}
              <li className="k-leg__row k-leg__row--hint">
                <span className="k-note">
                  клік по зорі = тема · по супутнику = кейс · по чіпу рахунку = реєстр
                </span>
              </li>
            </ul>
          )}
        </Panel>
      )}
      <button
        type="button"
        className="k-leg__btn"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`k-more__arrow${open ? '' : ' k-more__arrow--up'}`} aria-hidden="true">
          ▾
        </span>
        ЛЕГЕНДА
      </button>
    </aside>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Panel, ModeBanner, HudButton } from 'astrolabe-ds';
import {
  getActiveWeek, listWeeks, getTopics, getExitedTopics, getActors, forecastScore,
  leverModel, META, SCHEMA_VERSION, formatDate, precedentFor,
} from './data/selectors.js';
import { epistemicCount } from './map/starfield.js';
import GalaxyMap from './map/GalaxyMap.jsx';
import ZrizDock from './panels/ZrizDock.jsx';
import TopicCard from './panels/TopicCard.jsx';
import ActorCard from './panels/ActorCard.jsx';
import ObjectCard from './panels/ObjectCard.jsx';
import BlufStrip from './panels/BlufStrip.jsx';
import Legend from './panels/Legend.jsx';
import FloatingWindow from './panels/FloatingWindow.jsx';
import TagInfo from './panels/TagInfo.jsx';
import AboutWindow from './panels/AboutWindow.jsx';
import GlossaryWindow from './panels/GlossaryWindow.jsx';
import CoachMarks from './panels/CoachMarks.jsx';
import PlayBar from './panels/PlayBar.jsx';
import PrecedentsMode from './panels/PrecedentsMode.jsx';
import PlotsScene from './plots/PlotsScene.jsx';
import GravitonScene from './graviton/GravitonScene.jsx';
import { buildPlay } from './play/scenarios.js';
import Intro from './panels/Intro.jsx';
import CasesWindow from './panels/CasesWindow.jsx';
import RegistryWindow from './panels/RegistryWindow.jsx';
import HeroIndex from './panels/HeroIndex.jsx';
import EnsembleBoard from './panels/EnsembleBoard.jsx';
import EnsembleRegistry from './panels/EnsembleRegistry.jsx';
import { plural } from './util/plural.js';
import { parseHash, weekFromSlug, writeHash, buildHash } from './util/hash.js';
import { saveMapPng } from './util/snapshot.js';
import MapKeyboardIndex from './panels/MapKeyboardIndex.jsx';

// Корпус прецедентів запікається в бандл: режим показує назви і траєкторії
// аналогів, а мережі в продукті немає. Порожній корпус дає порожній масив і
// порожній стан, тобто відсутність корпусу нічого не ламає.
//
// Іде СПРОЄКТОВАНИЙ корпус (derived/precedents.json), а не глоб самих файлів:
// у джерелі живуть примітки розбору, службова колонка розмітника і поля, які
// на екран не виходять жодного разу. Вони коштували 13 КБ бандла при ліміті,
// від якого не лишалось запасу. Проєкцію робить scripts/build-precedents.mjs
// тими самими ворітьми валідації, що і check:corpus.
import precedentsCorpus from './data/derived/precedents.json';

const CORPUS = precedentsCorpus.cases;

// Шар forecast прибраний з перемикача на прохання Роми. Це псевдонім шару акторів
// плюс режим пісочниці, окремої графіки в нього немає, тому знімається одним рядком.
// Код моделювання лишається живим: вхід у нього тепер тільки через важіль у досьє теми.
// Повернути шар = розкоментувати рядок, решта коду вже вміє з ним працювати.
const LAYERS = [
  { id: 'topics', label: 'ТЕМИ' },
  { id: 'actors', label: 'АКТОРИ' },
  // { id: 'forecast', label: 'ПРОГНОЗ' },
  { id: 'ensemble', label: 'КОМПАС' },
  // P2 розділу 16 плюс власна візуальна спека 1.0. Це НЕ перефарбоване поле
  // тем, а окрема сцена: сюжет кодується формою і рухом зорі, а клік відкриває
  // історію, а не досьє. Тижні без розмітки чесно стоять порожніми кільцями.
  { id: 'plots', label: 'СЮЖЕТИ' },
  // ГРАВІТОН (назва власника, 18.08.2026): фізико-натхнена модель поля.
  // Окрема сцена, бо тут геометрія і є модель: радіус це дистанція до ядра,
  // а не виміряний тон. Сцена несе постійний банер «модельна проєкція».
  { id: 'graviton', label: 'ГРАВІТОН' },
];

// Роль і позивний беруться з адреси: ?role=bettor&as=rt_01. Бекенда авторизації
// в випуску немає і не буде, тому це свідомо простий механізм для збірок під роль.
// Глядач за замовчуванням: керівництво відкриває посилання і бачить тільки читання.
const ROLES = ['viewer', 'bettor', 'analyst', 'registrar'];
function readProfile() {
  const q = new URLSearchParams(window.location.search);
  const role = ROLES.includes(q.get('role')) ? q.get('role') : 'viewer';
  return { role, meId: q.get('as') || null };
}

const ONBOARD_KEY = 'kamerton.onboarded';
const BLUF_KEY = 'kamerton.bluf';
const INTRO_KEY = 'kamerton.intro';
// Режим проектора памʼятається між сесіями: зал не міняється між показами,
// і вмикати його щоразу заново означало б робити це при глядачах.
const PROJECTOR_KEY = 'kamerton.projector';
// Стан шухляди реєстру: рішення читача, а не режим застосунку, тому між сесіями.
const REGISTRY_KEY = 'kamerton.registry';

// Заставка грає раз за сесію. ?intro=1 форсує показ: на демонстрації її треба
// вміти запустити з адреси, не чекаючи нової вкладки і не чистячи сховище.
function introForced() {
  return new URLSearchParams(window.location.search).get('intro') === '1';
}
function introSeen() {
  return !introForced() && sessionStorage.getItem(INTRO_KEY) === '1';
}

// Два вікна на весь застосунок. Кожне має рівно один вхід:
// КЕЙСИ з клітинки BLUF або з супутника на карті, РЕЄСТР з чіпа рахунку.
// Ландшафтний формат: список читається рядками, а не колонкою в шпальту.
// На вузьких екранах вікно вужче, щоб не впиратись у краї зони карти.
const WINDOW_W = () => (window.innerWidth <= 1366 ? 640 : 720);
const WINDOW_H = () => Math.round(window.innerHeight * 0.62);
/** Кожне наступне вікно зсувається каскадом, щоб не ховалось під попереднім. */
const WINDOW_CASCADE = 24;

/**
 * Вікно народжується по центру зони карти, а не в довільній точці екрана:
 * воно стосується того, на що читач зараз дивиться.
 */
function spawnAt(id, index) {
  const size = { width: WINDOW_W(), height: WINDOW_H() };
  const slot = document.querySelector('.k-map-slot');
  const stage = document.querySelector('.k-stage');
  if (!slot || !stage) return { x: 80, y: 80, width: size.width };
  // координати вікна відлічуються від сцени, бо вона його позиційний предок
  const box = slot.getBoundingClientRect();
  const base = stage.getBoundingClientRect();
  const step = index * WINDOW_CASCADE;
  return {
    x: Math.round(box.left - base.left + (box.width - size.width) / 2) + step,
    y: Math.round(Math.max(0, box.top - base.top + (box.height - size.height) / 2)) + step,
    width: size.width,
  };
}
const WINDOW_TITLE = {
  keysy: 'КЕЙСИ · що на контролі і чи є відповідь',
  reyestr: 'РЕЄСТР · що система прогнозувала і що справдилось',
};

const EPI_FORMS = {
  fact: ['факт', 'факти', 'фактів'],
  assessment: ['оцінка', 'оцінки', 'оцінок'],
  hypothesis: ['гіпотеза', 'гіпотези', 'гіпотез'],
};

/**
 * Тримає елемент у розмітці ще трохи після закриття, щоб він встиг згорнутись.
 * Без цього React знімає панель одним кадром, і згортання нема чому грати.
 */
function useExit(open, ms = 280) {
  const [live, setLive] = useState(open);
  useEffect(() => {
    if (open) {
      setLive(true);
      return undefined;
    }
    const t = setTimeout(() => setLive(false), ms);
    return () => clearTimeout(t);
  }, [open, ms]);
  return { live, closing: live && !open };
}

function SmallScreenGate({ weekId, layer }) {
  return (
    <div className="k-gate">
      <Panel brackets className="k-gate__box">
        <div className="k-stack k-stack--tight">
          <span className="a-tab">КАМЕРТОН</span>
          <p className="k-lead">Версія для великих екранів.</p>
          <p className="k-sub">
            Карта і плаваючі панелі розраховані на ширину від 1100px. Мобільна модель
            буде окремою роботою, зараз вона не зроблена і показувати замість неї
            стиснуту десктопну сітку означало б видати незробране за зроблене.
          </p>
          {/* E5: заглушка лишається чесною, але не порожньою. Кадр тижня можна
              забрати з собою навіть звідси: десктопне дерево змонтоване під
              display:none, тому полотно існує і його є що знімати. */}
          <HudButton
            variant="primary"
            aria-label="завантажити PNG тижня"
            onClick={() => saveMapPng(document.querySelector('.k-map__canvas'), {
              weekId, layer,
              background: getComputedStyle(document.documentElement)
                .getPropertyValue('--a-bg').trim() || '#0A1713',
            })}
          >
            ЗАВАНТАЖИТИ PNG ТИЖНЯ
          </HudButton>
        </div>
      </Panel>
    </div>
  );
}

export default function App() {
  // Схований тиждень зникає з перемикача, але лишається в даних: дельти W30
  // і далі рахуються від нього, а ?week=2026-W29 його відкриває.
  const weeks = useMemo(() => listWeeks().filter((w) => !w.hidden), []);
  // E1: стан приходить з адреси, якщо вона його несе. Пріоритет саме такий:
  // хеш описує конкретний кадр і його щойно переслали, ?week= це старий вхід,
  // який лишається робочим, бо на нього вже є посилання.
  const [weekId, setWeekId] = useState(() => {
    const fromHash = weekFromSlug(parseHash().weekSlug, listWeeks());
    if (fromHash) return fromHash;
    const asked = new URLSearchParams(window.location.search).get('week');
    return getActiveWeek(asked || undefined).id;
  });
  const [layer, setLayer] = useState(() => parseHash().layer || 'topics');
  const [profile] = useState(readProfile);
  // Ставки, зроблені в цій збірці, живуть локально і не міняють контракт.
  // Реєстратор мержить їх у контракт з експортованого патча.
  const [localBets, setLocalBets] = useState([]);
  const [selectedId, setSelectedId] = useState(() => parseHash().nodeId || null);
  const [objectCard, setObjectCard] = useState(null);
  // ліва панель за замовчуванням згорнута: карта має дихати
  const [leftOpen, setLeftOpen] = useState(false);
  const [activeLever, setActiveLever] = useState(null);
  // стан смуги памʼятається між сесіями: це рішення читача, а не режим застосунку
  const [blufOpen, setBlufOpen] = useState(
    () => localStorage.getItem(BLUF_KEY) !== '0'
  );
  const [pulseRequest, setPulseRequest] = useState(null);
  const [windows, setWindows] = useState([]);
  const [caseFocus, setCaseFocus] = useState(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  // Обидва стани читають сховище ліниво і кожен сам: спільна змінна в тілі
  // рендера колись уже перетворилась на ДЕБАГ-константу і замкнула заставку
  // на «грати завжди».
  const [introDone, setIntroDone] = useState(introSeen);
  // Фаза заставки керує і сценою, і тим, скільки шарів малює карта.
  // bare і fly це голе розфокусоване небо, labels і axis це повернення
  // розмітки, ui це поява панелей.
  const [introPhase, setIntroPhase] = useState(() => (introSeen() ? 'done' : 'bare'));
  const cinema =
    introPhase === 'bare' || introPhase === 'fly' ? 'bare'
    : introPhase === 'labels' ? 'labels'
    : introPhase === 'axis' ? 'axis'
    : null;
  // вʼїзд панелей живе рівно одну секунду після заставки
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    if (!introDone) return undefined;
    setEntering(true);
    const t = setTimeout(() => setEntering(false), 1200);
    return () => clearTimeout(t);
  }, [introDone]);
  const [onboarded, setOnboarded] = useState(
    () => sessionStorage.getItem(ONBOARD_KEY) === '1'
  );
  const [projector, setProjector] = useState(
    () => localStorage.getItem(PROJECTOR_KEY) === '1'
  );

  // F3: відкритий кейс у режимі ПРЕЦЕДЕНТИ. Вхід тільки з кейса або з теми.
  // Оголошено до ефектів, які його читають: інакше зона тимчасової мертвоти.
  const [precCase, setPrecCase] = useState(() => parseHash().precedents || null);

  // Вкладка СЮЖЕТИ: відкрита зум-сцена. Це не досьє і не вибраний вузол, тому
  // і стан окремий: у СЮЖЕТАХ клік по зорі відкриває історію, а не панель.
  const [plotZoom, setPlotZoom] = useState(
    () => (parseHash().layer === 'plots' ? parseHash().nodeId || null : null)
  );

  // E1: адреса тримається за станом. replaceState, а не pushState, тому «назад»
  // лишається навігацією, а не покадровим перемотуванням кліків по вузлах.
  useEffect(() => {
    writeHash(precCase
      ? { weekId, precedents: precCase }
      : { weekId, layer, nodeId: layer === 'plots' ? plotZoom : selectedId });
  }, [weekId, layer, selectedId, precCase, plotZoom]);

  // E3: Esc закриває те, що зараз відкрите, у порядку від наймоднішого до
  // найглибшого. Без цього клавіатурний користувач, відкривши досьє, лишався
  // в ньому замкненим: миші в нього немає, а хрестик він не бачить.
  //
  // Сам ланцюжок зібраний нижче, після оголошення всього, що він читає. Тут
  // тільки ref: слухач ставиться рівно один раз і бере стан з нього.
  //
  // Чому не просто ефект без масиву залежностей, як було: такий ефект знімав і
  // ставив слухача наново на КОЖНОМУ рендері, а зняти слухач під час розсилки
  // тієї самої події означає її не отримати. Досить було, щоб інший компонент
  // теж реагував на Escape і оновив стан, і ланцюжок мовчки пропускав перше
  // натискання. Саме це і ловилось: перший Escape зʼїдали підказки маршруту.
  const escChain = useRef(() => {});
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      escChain.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Зовнішня зміна адреси (кнопка «назад», вставлене посилання у тій самій вкладці)
  // має повертати стан, а не лишати екран розсинхронізованим з рядком адреси.
  useEffect(() => {
    const onHash = () => {
      const h = parseHash();
      const w = weekFromSlug(h.weekSlug, listWeeks());
      if (w) setWeekId(w);
      if (h.layer) setLayer(h.layer);
      setSelectedId(h.nodeId || null);
      setPrecCase(h.precedents || null);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  // Вузол під клавіатурним фокусом. Окремо від selectedId: фокус це «дивлюсь на
  // нього», вибір це «відкрив досьє», і на карті вони показуються по-різному.
  const [kbFocus, setKbFocus] = useState(null);
  const galaxyApi = useRef(null);
  // D1: програвач. Сценарій будується з даних у момент запуску, тому доповідь
  // завжди про поточний корпус, а не про той, що був на момент написання коду.
  const [play, setPlay] = useState(null);
  // D5: режим показу того самого шару ТЕМИ, а не четвертий шар у навігації.
  // ТУМБЛЕР ПРИБРАНО з HUD (рішення Роми): карта завжди показує хроніку.
  // Стан і вся проводка до GalaxyMap лишились цілі — привиди прогнозу вміють
  // малюватись і ввімкнуться тим самим прапорцем, коли для них знайдеться
  // місце в інтерфейсі. Викидати механіку заради знятої кнопки не треба.
  const [forecastMode] = useState(false);

  // Кадр показу: суміш двох тижневих зрізів на поточний день.
  const playFrame = useMemo(
    () => (play ? play.model.frameAt(play.day) : null),
    [play?.model, play?.day]
  );

  // Хід часу. Один рівний темп, доба за такт. Тиждень для панелей береться з
  // кадру: текст не інтерполюється, тому підписи перемикаються на межі тижня
  // цілим шматком, поки карта під ними йде безперервно.
  useEffect(() => {
    if (!play || !playFrame) return undefined;
    if (weekId !== playFrame.weekId) setWeekId(playFrame.weekId);
    if (!play.playing) return undefined;
    const t = setTimeout(() => {
      setPlay((p) => {
        if (!p) return p;
        const next = p.day + 1;
        // Кінець корпусу не викидає читача: показ зупиняється на останньому дні.
        return next >= p.model.days ? { ...p, playing: false } : { ...p, day: next };
      });
    }, play.model.dayMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play?.day, play?.playing, play?.model, playFrame?.weekId]);

  // Показ живе тільки в шарі ТЕМИ: рух поля це рух тем. Перехід на інший шар
  // під час показу зупиняє його, інакше смуга внизу керувала б тим, чого на
  // екрані вже немає.
  useEffect(() => {
    if (play && layer !== 'topics') setPlay(null);
  }, [layer, play]);
  const [registryOpen, setRegistryOpen] = useState(
    () => localStorage.getItem(REGISTRY_KEY) === '1'
  );
  // Стан шухляди памʼятається, тому КОЖЕН шлях закриття мусить писати у сховище:
  // Esc, хрестик і клік по завісі. Інакше закрита шухляда поверталась би на
  // наступному завантаженні, бо про закриття знав лише React.
  const toggleRegistry = (next) => {
    localStorage.setItem(REGISTRY_KEY, next ? '1' : '0');
    setRegistryOpen(next);
  };

  const week = getActiveWeek(weekId);
  const epi = epistemicCount(week);
  const score = forecastScore(weekId);

  // Модель з досьє: зсуви тем і режим пісочниці. Скидається сама при закритті
  // досьє, зміні тижня або шару, тому модельне ніколи не переживає контекст.
  const model = useMemo(
    () => (activeLever ? leverModel(activeLever, weekId) : null),
    [activeLever, weekId]
  );
  // мапу зсувів тримаємо стабільною: новий обʼєкт щорендеру перезапускав би твін
  const topicShifts = useMemo(() => model?.total || {}, [model]);

  // Той самий важіль рухає і акторів: каскад з контракту грає на шарі АКТОРИ.
  // Окремого дока з важелями більше немає, важелі живуть тільки в досьє.
  const actorShifts = useMemo(() => {
    const acc = {};
    (model?.lever?.cascade || []).forEach((s) => {
      acc[s.actor] = (acc[s.actor] || 0) + s.stance;
    });
    return acc;
  }, [model]);
  const modelling = Boolean(model);
  const sandbox = layer === 'forecast' || modelling;
  const isActorLayer = layer === 'actors' || layer === 'forecast';
  const isEnsemble = layer === 'ensemble';
  const isTopics = layer === 'topics';
  const isPlots = layer === 'plots';
  const isGraviton = layer === 'graviton';

  // Контракт лишається джерелом правди, локальні ставки накладаються поверх
  // тільки для показу: так оцінювач бачить свій вплив ще до мержу реєстратором.
  const ensemble = useMemo(() => {
    const base = getActiveWeek(weekId).ensemble;
    if (!base) return null;
    if (!localBets.length) return base;
    return {
      ...base,
      markets: base.markets.map((m) => {
        const mine = localBets.filter((b) => b.market === m.id);
        if (!mine.length) return m;
        const rest = (m.bets || []).filter((b) => !mine.some((x) => x.participant === b.participant));
        return { ...m, bets: [...rest, ...mine.map(({ market, ...b }) => b)] };
      }),
    };
  }, [weekId, localBets]);

  const placeBet = ({ market, p, stake }) => {
    if (!profile.meId) return;
    setLocalBets((cur) => [
      ...cur.filter((b) => !(b.market === market && b.participant === profile.meId)),
      { market, participant: profile.meId, p, stake, ts: new Date().toISOString() },
    ]);
  };

  // Експорт патча: файл ставок тижня, який реєстратор мержить у контракт.
  // Жодних мережевих запитів, тільки завантаження файлу з самої сторінки.
  const exportBets = () => {
    const patch = { week: weekId, participant: profile.meId, bets: localBets };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(patch, null, 2)], { type: 'application/json' })
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `kamerton-bets-${weekId}-${profile.meId || 'anon'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openWindow = (id) =>
    setWindows((ws) => {
      const was = ws.find((w) => w.id === id);
      return [...ws.filter((w) => w.id !== id), was || { id, ...spawnAt(id, ws.length) }];
    });
  const closeWindow = (id) => {
    setWindows((ws) => ws.map((w) => (w.id === id ? { ...w, out: true } : w)));
    setTimeout(() => setWindows((ws) => ws.filter((w) => w.id !== id)), 220);
  };
  const focusWindow = (id) =>
    setWindows((ws) => {
      const w = ws.find((x) => x.id === id);
      if (!w || ws[ws.length - 1].id === id) return ws;
      return [...ws.filter((x) => x.id !== id), w];
    });
  const moveWindow = (id, x, y) =>
    setWindows((ws) => ws.map((w) => (w.id === id ? { ...w, x, y } : w)));

  // Панелі згортаються так само, як розгортались: колонка сітки їде плавно,
  // а сама панель лишається в розмітці на час анімації виходу.
  // ЗРІЗ живе тільки в ТЕМАХ, тому і колонка під нього береться тільки там:
  // інакше в АКТОРАХ лишалась би порожня ліва смуга від згорнутої плашки.
  const showZriz = leftOpen && isTopics;
  const leftExit = useExit(showZriz);
  const rightExit = useExit(Boolean(selectedId));
  // Реєстр з'являється тим самим рухом, що і ЗРІЗ, тільки з правого боку.
  const regExit = useExit(isEnsemble && registryOpen);
  const cardExit = useExit(Boolean(objectCard));
  // під час згортання показуємо останній непорожній вміст, інакше панель
  // спорожніла б за кадр до того, як поїхала
  const lastObject = useRef(null);
  if (objectCard) lastObject.current = objectCard;
  const lastTopic = useRef(null);
  const lastActor = useRef(null);

  // У рамі зріз і досьє мають власні колонки і не конкурують за місце,
  // тому правила «одна бокова панель за раз» більше немає: обидві живуть разом.
  const openDossier = (id) => {
    setSelectedId(id);
    if (!id) resetModel();
  };

  const openZriz = () => setLeftOpen(true);

  const pickTopic = (id) => {
    openDossier(id);
    setPulseRequest((p) => ({ id, seq: (p?.seq || 0) + 1 }));
  };

  const openCase = (caseId) => {
    setCaseFocus(caseId);
    openWindow('keysy');
  };

  const resetModel = () => setActiveLever(null);

  const changeLayer = (next) => {
    setLayer(next);
    setSelectedId(null);
    setPlotZoom(null);
    resetModel();
  };

  // Перехід зі сцени сюжету в дані кейса: єдиний місток між вкладками.
  // Сцена розповідає історію і навмисно не тримає жодного числа з досьє, тому
  // «дані кейсу» це не посилання поруч, а вихід у інший режим читання.
  const openDossierFromPlot = (topicId) => {
    setPlotZoom(null);
    setLayer('topics');
    setSelectedId(topicId);
    setPulseRequest((p) => ({ id: topicId, seq: (p?.seq || 0) + 1 }));
  };

  const changeWeek = (id) => {
    setWeekId(id);
    resetModel();
  };

  const closeDossier = () => {
    setSelectedId(null);
    resetModel();
  };

  // E3 · сам ланцюжок. Перезаписується щорендера, слухач лишається тим самим.
  // Порядок від наймоднішого до найглибшого: спершу те, що лежить зверху.
  escChain.current = () => {
    // ПРЕЦЕДЕНТИ перекривають увесь екран, тому виходять першими: під ними
    // нічого не видно, і закривати спершу досьє означало б клацати наосліп.
    if (precCase) return setPrecCase(null);
    if (glossaryOpen) return setGlossaryOpen(false);
    if (aboutOpen) return setAboutOpen(false);
    if (objectCard) return setObjectCard(null);
    // Зум-сцена перекриває карту, тому виходить раніше за все, що під нею.
    if (plotZoom) return setPlotZoom(null);
    if (selectedId) return closeDossier();
    if (registryOpen) return toggleRegistry(false);
    if (dataOpen) return setDataOpen(false);
    // PLAY виходить останнім: спершу закривається те, що відкрито поверх нього.
    if (play) return setPlay(null);
    return undefined;
  };

  const selectedTopic = useMemo(() => {
    if (!selectedId || isActorLayer) return null;
    const live = getTopics(weekId).find((t) => t.id === selectedId);
    if (live) return live;
    const gone = getExitedTopics(weekId).find((t) => t.id === selectedId);
    return gone ? { ...gone, exited: true } : null;
  }, [selectedId, weekId, isActorLayer]);

  const selectedActor = useMemo(() => {
    if (!selectedId || !isActorLayer) return null;
    return getActors(weekId).find((a) => a.id === selectedId) || null;
  }, [selectedId, weekId, isActorLayer]);

  // останній непорожній вміст досьє живе рівно стільки, скільки триває згортання
  if (selectedTopic) lastTopic.current = selectedTopic;
  if (selectedActor) lastActor.current = selectedActor;

  const closeOnboarding = () => {
    sessionStorage.setItem(ONBOARD_KEY, '1');
    setOnboarded(true);
  };

  return (
    <div
      className={
        'a-root k-app' +
        // режим проектора живе на корені, бо міняє токени кеглю для всього дерева
        (projector ? ' projector' : '') +
        // розфокус тримається до прольоту, панелі не існують до кроку ui
        (introPhase === 'bare' || introPhase === 'fly' || introPhase === 'labels' ||
          introPhase === 'axis' ? ' k-app--cin' : '') +
        (introPhase === 'fly' || introPhase === 'labels' || introPhase === 'axis'
          ? ' k-app--cin-sharp' : '') +
        (introPhase === 'ui' || (introDone && entering) ? ' k-app--ui' : '') +
        // F3: режим вимагає повного спокою після входу. Дихання логотипа це
        // єдиний живий елемент на статичному екрані, і крізь завісу воно видно.
        (precCase ? ' k-app--still' : '') +
        // Смуга показу стоїть на дні екрана і закривала б нижню навігацію на
        // останні тридцять пікселів. Поки показ іде, вона займає СВОЄ місце.
        (play ? ' k-app--play' : '')
      }
    >
      <SmallScreenGate weekId={weekId} layer={layer} />

      {!introDone && (
        <Intro
          onPhase={setIntroPhase}
          onDone={() => {
            sessionStorage.setItem(INTRO_KEY, '1');
            setIntroDone(true);
          }}
        />
      )}

      <div className="k-desk">
        <header className="k-top">
          <button
            type="button"
            className="k-logo k-logo--btn"
            onClick={() => setAboutOpen(true)}
            aria-label="про систему"
          >
            КАМЕРТОН
          </button>

          <HeroIndex weekId={weekId} liveValue={playFrame?.index.value ?? null} />

          <div className="k-weeks" role="group" aria-label="перемикач тижнів">
            {weeks.map((w) => (
              <HudButton
                key={w.id}
                variant={w.id === weekId ? 'primary' : 'ghost'}
                aria-pressed={w.id === weekId}
                onClick={() => changeWeek(w.id)}
              >
                <span>{w.short}</span>
                <span className="k-note">{w.period}</span>
              </HudButton>
            ))}
          </div>

          {/* G4: чотири зони шапки. РАХУНОК живе в Компасі, тут лишились
              назва з індексом, тижні, PLAY і ДАНІ. */}
          {/* Одна кнопка і без числа в назві: показ це не ролик фіксованої
              довжини, а прохід по корпусу, і корпус росте щотижня. Кнопка живе
              тільки в шарі ТЕМИ, бо рух поля це рух тем. */}
          <div className="k-play__launch">
            {layer === 'topics' && (
              <HudButton
                variant={play ? 'primary' : 'ghost'}
                aria-label="показ корпусу день за днем"
                onClick={() => setPlay(play ? null : { model: buildPlay(), day: 0, playing: true })}
              >
                PLAY
              </HudButton>
            )}
          </div>

          <div className="k-top__spacer" />

          {/* C1: у шапці лишаються тільки чотири зони. Все, що не потрібне для
              першого висновку за 30 секунд, живе у блоці ДАНІ і зʼявляється
              по кліку: лічильники тверджень, режим, глосарій, проектор. */}
          <HudButton
            variant={dataOpen ? 'primary' : 'ghost'}
            aria-expanded={dataOpen}
            aria-label="дані тижня і налаштування показу"
            onClick={() => setDataOpen((v) => !v)}
          >
            ДАНІ
          </HudButton>
        </header>

        {dataOpen && (
          <div className="k-data" role="region" aria-label="дані тижня і налаштування показу">
            <Panel glass className="k-epi">
              <div className="k-chip2">
                <span className="k-chip2__cap">ТВЕРДЖЕННЯ ТИЖНЯ</span>
                <span className="k-chip2__val">
                  {['fact', 'assessment', 'hypothesis'].map((kind, i) => (
                    <React.Fragment key={kind}>
                      {i > 0 && <span className="k-chip__dot">·</span>}
                      <span
                        className="k-pick"
                        role="button"
                        tabIndex={0}
                        onClick={() => setObjectCard({ kind: 'counter', counter: kind })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setObjectCard({ kind: 'counter', counter: kind });
                          }
                        }}
                      >
                        <span className="k-epi__num">{epi[kind]}</span>{' '}
                        {plural(epi[kind], EPI_FORMS[kind])}
                      </span>
                    </React.Fragment>
                  ))}
                </span>
              </div>
            </Panel>

            <div className="k-mode">
              <ModeBanner mode={sandbox ? 'sandbox' : 'chronicle'} />
            </div>

            <HudButton
              variant="ghost"
              aria-label="глосарій"
              onClick={() => setGlossaryOpen(true)}
            >
              ?
            </HudButton>

            <HudButton
              variant={projector ? 'primary' : 'ghost'}
              aria-pressed={projector}
              aria-label="режим проектора"
              onClick={() => setProjector((v) => {
                localStorage.setItem(PROJECTOR_KEY, v ? '0' : '1');
                return !v;
              })}
            >
              ПРОЕКТОР
            </HudButton>

            <HudButton
              variant="ghost"
              aria-label="показати маршрут читання"
              onClick={() => setOnboarded(false)}
            >
              МАРШРУТ ЧИТАННЯ
            </HudButton>

            {/* E2: кадр у PNG для вставки в паперовий звіт. */}
            <HudButton
              variant="ghost"
              aria-label="зберегти кадр карти у PNG"
              onClick={() => saveMapPng(document.querySelector('.k-map__canvas'), {
                weekId,
                layer,
                background: getComputedStyle(document.documentElement)
                  .getPropertyValue('--a-bg').trim() || '#0A1713',
              })}
            >
              PNG
            </HudButton>
          </div>
        )}

        <BlufStrip
          onOpenEnsemble={() => changeLayer('ensemble')}
          weekId={weekId}
          sandbox={sandbox}
          open={blufOpen}
          onToggle={() =>
            setBlufOpen((v) => {
              localStorage.setItem(BLUF_KEY, v ? '0' : '1');
              return !v;
            })
          }
          onOpenCases={() => openWindow('keysy')}
        />

        {/* Кожен бік сцени відповідає сам за себе: плашка, панель або нічого.
            Права колонка бере ширину рівно тоді, коли їй є що показати. Раніше
            в шарі КОМПАС вона стояла розкритою завжди, і після закриття реєстру
            лишалась порожня смуга на третину екрана. */}
        <div
          className={
            'k-stage' +
            (isTopics ? (showZriz ? ' k-stage--left' : ' k-stage--lrail') : '') +
            (selectedId || (isEnsemble && registryOpen)
              ? ' k-stage--right'
              : isEnsemble ? ' k-stage--rrail' : '')
          }
        >
        {/* ЗРІЗ це підсумок тижня по ТЕМАХ, тому в інших шарах його немає:
            в АКТОРАХ і КОМПАСІ він відповідав на питання, якого там не ставлять,
            і забирав колонку під чужий вміст. */}
        <aside className={`k-col k-col--left${isTopics ? '' : ' k-col--gone'}`}>
          {/* згорнутий ЗРІЗ це вузька вертикальна плашка на всю колонку */}
          {isTopics && !leftOpen && !leftExit.live && (
            <button
              type="button"
              className="k-rail"
              aria-expanded={false}
              aria-label="розгорнути зріз тижня"
              onClick={openZriz}
            >
              ЗРІЗ
            </button>
          )}

          {isTopics && leftExit.live && (
            <div className={`k-dock k-dock--left${leftExit.closing ? ' k-dock--out' : ''}`}>
              <Panel glass brackets>
                <div className="k-dock__head">
                  <span className="a-tab">ЗРІЗ</span>
                  <HudButton
                    variant="ghost"
                    aria-expanded
                    onClick={() => setLeftOpen(false)}
                  >
                    ЗГОРНУТИ
                  </HudButton>
                </div>
                <div className="k-dock__body">
                  <ZrizDock
                    weekId={weekId}
                    onOpenObject={setObjectCard}
                    selectedId={selectedId}
                    onPickTopic={pickTopic}
                  />
                </div>
              </Panel>
            </div>
          )}
        </aside>

        <main className="k-col k-col--map">
          <div className="k-map-slot">
            {isEnsemble ? (
              <div className="k-ens-slot">
                {/* G4: РАХУНОК живе тут, а не в шапці. Він стосується Компаса,
                    і в шапці був четвертою річчю, яка сперечалась за увагу з
                    індексом. G3: реєстр звідси ж відкривається шухлядою, тому
                    центральна зона ринків отримує повну ширину. */}
                <div className="k-ens__bar">
                  <span className="k-ens__score">
                    <span className="k-label">РАХУНОК</span>
                    <span className="k-verdict--hit">
                      {score.hits} {plural(score.hits, ['влучання', 'влучання', 'влучань'])}
                    </span>
                    <span className="k-chip__dot">·</span>
                    <span className="k-verdict--miss">
                      {score.misses} {plural(score.misses, ['промах', 'промахи', 'промахів'])}
                    </span>
                    <span className="k-chip__dot">·</span>
                    <span className="k-verdict--open">
                      {score.open} {plural(score.open, ['очікує', 'очікують', 'очікують'])}
                    </span>
                  </span>
                  {/* Кнопки РЕЄСТР тут більше немає: після приведення реєстру
                      до паттерна ЗРІЗУ вхід у нього один, і це плашка праворуч.
                      Два входи в одну панель на одному екрані читаються як два
                      різні місця, а не як одне зручніше. */}
                </div>
                <EnsembleBoard
                  ensemble={ensemble}
                  meId={profile.role === 'bettor' || profile.role === 'analyst' ? profile.meId : null}
                  role={profile.role}
                  onPlace={placeBet}
                  now={Date.parse(getActiveWeek(weekId).period.to) || Date.now()}
                />
                {localBets.length > 0 && (
                  <div className="k-ens__export">
                    <HudButton onClick={exportBets}>
                      ВИВАНТАЖИТИ ПАТЧ СТАВОК ({localBets.length})
                    </HudButton>
                    <span className="k-note">файл передається реєстратору, мережа не задіяна</span>
                  </div>
                )}
              </div>
            ) : isPlots ? (
              <PlotsScene
                weekId={weekId}
                zoomId={plotZoom}
                onZoom={setPlotZoom}
                onOpenDossier={openDossierFromPlot}
              />
            ) : isGraviton ? (
              <GravitonScene
                weekId={weekId}
                onOpenDossier={openDossierFromPlot}
              />
            ) : (
            <GalaxyMap
              weekId={weekId}
              layer={layer}
              cinema={cinema}
              selectedId={selectedId}
              layoutKey={`${showZriz}|${Boolean(selectedId)}|${isEnsemble && registryOpen}|${blufOpen}|${sandbox}|${layer}`}
              pulseRequest={pulseRequest}
              actorShifts={actorShifts}
              topicShifts={topicShifts}
              onSelect={openDossier}
              onSelectMoon={setPrecCase}
              highlightId={kbFocus}
              onApiReady={(api) => {
                galaxyApi.current = api;
                // Гачок для перевірки кліком, увімкнений тільки прапорцем ?qa=1.
                // Супутники живуть на канві, і без нього неможливо довести, що
                // кожен відкриває свій кейс, а не спільний список.
                if (new URLSearchParams(window.location.search).get('qa') === '1') {
                  window.__kamertonMap = api;
                }
              }}
              forecastMode={forecastMode}
              playFrame={playFrame}
            />
            )}
            {/* E3: паралельний список вузлів для клавіатури і скрінрідерів.
                Полотно це один елемент, у нього не протабати. */}
            <MapKeyboardIndex
              weekId={weekId}
              layer={layer}
              onFocusNode={setKbFocus}
              onSelect={openDossier}
            />
          </div>

          {/* HUD має власний рядок сітки, тому теж нічого не накриває */}
          {/* Ліве добро зібране в один осередок сітки НАВМИСНО. Доти HUD був
              плоским флексом, а перемикач шарів центрувався `margin-inline:auto`
              — тобто по СЕРЕДИНІ ЗАЛИШКУ після легенди й тумблера, а не по
              середині карти. Через це «ШАР КАРТИ» стояв правіше центру, і зсув
              ще й гуляв: тумблер живе лише в шарі ТЕМИ, і на інших шарах група
              перестрибувала. Сітка 1fr / auto / 1fr тримає середній осередок на
              справжньому центрі незалежно від того, що ліворуч. */}
          <div className="k-hud">
            <div className="k-hud__left">
              <Legend layer={layer} />
            </div>

            <nav className="k-layers k-hud__mid" aria-label="шар карти">
              <div className="k-layers__row">
                {LAYERS.map((l) => (
                  <HudButton
                    key={l.id}
                    variant={layer === l.id ? 'primary' : 'ghost'}
                    aria-pressed={layer === l.id}
                    onClick={() => changeLayer(l.id)}
                  >
                    {l.label}
                  </HudButton>
                ))}
              </div>
              <div className="k-note k-layers__cap">шар карти</div>
            </nav>

          </div>
        </main>

        <aside className="k-col k-col--right">
          {/* G3: реєстр більше не займає праву колонку постійно. Він
              розгортається шухлядою поверх на вимогу, стан памʼятається. */}
          {/* Згорнутий РЕЄСТР це та сама вузька вертикальна плашка, що і ЗРІЗ,
              тільки з правого боку. Раніше він відкривався шухлядою з завісою,
              тобто окремим паттерном на весь застосунок заради одного шару. */}
          {isEnsemble && !registryOpen && !regExit.live && (
            <button
              type="button"
              className="k-rail"
              aria-expanded={false}
              aria-label="розгорнути реєстр прогнозів"
              onClick={() => toggleRegistry(true)}
            >
              РЕЄСТР
            </button>
          )}

          {regExit.live && (
            <div className={`k-dock k-dock--right${regExit.closing ? ' k-dock--out' : ''}`}>
              <Panel glass brackets>
                <div className="k-dock__head">
                  <span className="a-tab">РЕЄСТР</span>
                  <HudButton
                    variant="ghost"
                    aria-expanded
                    aria-label="згорнути реєстр"
                    onClick={() => toggleRegistry(false)}
                  >
                    ЗГОРНУТИ
                  </HudButton>
                </div>
                <div className="k-dock__body">
                  <EnsembleRegistry ensemble={ensemble} />
                </div>
              </Panel>
            </div>
          )}

          {!isEnsemble && rightExit.live && !isActorLayer && (
            <div className={`k-dock k-dock--right${rightExit.closing ? ' k-dock--out' : ''}`}>
              <TopicCard
                topic={selectedTopic || lastTopic.current}
                weekId={weekId}
                onClose={closeDossier}
                onPulse={(id) => setPulseRequest((p) => ({ id, seq: (p?.seq || 0) + 1 }))}
                onOpenCases={openCase}
                activeLever={activeLever}
                onPickLever={(id) => setActiveLever((cur) => (cur === id ? null : id))}
                onResetModel={resetModel}
                onPrecedents={setPrecCase}
              />
            </div>
          )}

          {!isEnsemble && rightExit.live && isActorLayer && (
            <div className={`k-dock k-dock--right${rightExit.closing ? ' k-dock--out' : ''}`}>
              <ActorCard
                actor={selectedActor || lastActor.current}
                weekId={weekId}
                onClose={() => setSelectedId(null)}
              />
            </div>
          )}
        </aside>

        {windows.map((w, i) => (
          <FloatingWindow
            key={w.id}
            id={w.id}
            title={WINDOW_TITLE[w.id]}
            x={w.x}
            y={w.y}
            z={30 + i}
            width={w.width}
            out={w.out}
            onFocus={focusWindow}
            onClose={closeWindow}
            onMove={moveWindow}
          >
            {w.id === 'keysy' && (
              <CasesWindow weekId={weekId} focusId={caseFocus} onPrecedents={setPrecCase} />
            )}
            {w.id === 'reyestr' && <RegistryWindow weekId={weekId} />}
          </FloatingWindow>
        ))}

        {cardExit.live && (
          <ObjectCard
            object={objectCard || lastObject.current}
            closing={cardExit.closing}
            weekId={weekId}
            onClose={() => setObjectCard(null)}
          />
        )}
        </div>

        {precCase && (
          <PrecedentsMode
            card={precedentFor(precCase, weekId)}
            corpus={CORPUS}
            weekId={weekId}
            caseTitle={(getActiveWeek(weekId).cases || []).find((c) => c.id === precCase)?.title || precCase}
            onClose={() => setPrecCase(null)}
          />
        )}

        {play && (
          <PlayBar
            frame={playFrame}
            days={play.model.days}
            playing={play.playing}
            onToggle={() => setPlay((p) => ({ ...p, playing: !p.playing }))}
            onStep={(d) => setPlay((p) => {
              if (!p) return p;
              if (d === 'restart') return { ...p, day: 0, playing: true };
              const i = Math.min(p.model.days - 1, Math.max(0, p.day + d));
              // Ручний крок зупиняє хід: читач узяв керування на себе.
              return { ...p, day: i, playing: false };
            })}
            onExit={() => setPlay(null)}
          />
        )}

        {/* E4: підпис зрізу. Дата і версія контракту тільки з даних, тому футер
            не може розійтися з тим, що показано вище. */}
        <footer className="k-foot k-note">
          зріз даних: {formatDate(META.updated)} · контракт v{SCHEMA_VERSION}
        </footer>

        {/* Туторіал тільки після того, як уся поява завершилась: інакше він
            накривав би заставку, і перший кадр читався б як помилка. */}
        {/* G1: коуч-мітки поверх живого інтерфейсу, а не модалка поверх нього.
            Показ раз за сесію тією самою механікою, що заставка (A2). */}
        {/* Під режимом ПРЕЦЕДЕНТИ міток немає: вони вказують лініями на карту,
            а карта в цей момент накрита. Вказівник у нікуди гірший за жоден. */}
        {!onboarded && introDone && !entering && !precCase && layer === 'topics' && (
          <CoachMarks getCanvasAnchors={() => galaxyApi.current?.getCoachAnchors?.() || {}} onClose={closeOnboarding} />
        )}
        {aboutOpen && (
          <AboutWindow
            onClose={() => setAboutOpen(false)}
            onReplayIntro={() => {
              sessionStorage.removeItem(INTRO_KEY);
              setAboutOpen(false);
              setIntroPhase('bare');
              setIntroDone(false);
            }}
          />
        )}
        {glossaryOpen && <GlossaryWindow onClose={() => setGlossaryOpen(false)} />}
        <TagInfo weekId={weekId} />
      </div>
    </div>
  );
}

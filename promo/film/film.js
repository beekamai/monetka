/*
 * Промо-ролик Монетки: одна сцена 1920×1080, всё состояние — чистая функция времени frame(t).
 * Телефон собран из классов приложения (src/styles.css); монетка-палец ставится по живым якорям интерфейса.
 */
import gsap from 'gsap';
import cues from '../cues.json';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '../../src/styles.css';
import './film.css';

const W = 1920, H = 1080, FPS = cues.fps, DUR = cues.duration;
const ease = (n) => gsap.parseEase(n);
const eo = ease('expo.out'), e3 = ease('power3.inOut'), e2 = ease('power2.inOut'), ein = ease('power3.in'), bo = ease('back.out(1.8)'), po = ease('power3.out');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const span = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, p) => a + (b - a) * p;
const bump = (t, at, len = 0.22) => (t >= at && t <= at + len ? Math.sin((Math.PI * (t - at)) / len) : 0);
const rub = (n) => `${Math.round(n).toLocaleString('ru-RU').replace(/\s/g, ' ')} ₽`;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sceneOf = (id) => cues.scenes.find((s) => s.id === id);

/* ---------- Разметка ---------- */
const TAB_ICONS = ['M4 13h4v7H4zM10 8h4v12h-4zM16 4h4v16h-4z', 'M4 6h16M4 12h16M4 18h10', 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z', 'M5 12h.01M12 12h.01M19 12h.01'];
const TAB_NAMES = ['Обзор', 'Операции', 'План', 'Ещё'];
const row = (color, cat, desc, amt, cls = '') =>
  `<div class="rowwrap ${cls}"><button class="tx"><i class="dot" style="background:${color}"></i><span class="tx-main"><span class="tx-cat">${cat}</span><span class="tx-desc">${desc}</span></span><span class="tx-amt ${amt.startsWith('+') ? 'pos' : 'neg'}">${amt}</span></button></div>`;

function screenHTML() {
  return `
  <div class="dev-top"><i>‹</i><span>Октябрь 2026</span><i>›</i></div>
  <div class="dev-pages">
    <div class="dev-page" data-p="overview"><div class="scroll">
      <section class="card hero"><div class="hero-lbl">Остаток на конец периода</div><span class="hero-val bal">140&nbsp;968&nbsp;₽</span>
        <div class="hero-row"><span class="muted">Начальная 120&nbsp;159&nbsp;₽</span><span class="chip pos">+20&nbsp;809&nbsp;₽ · +17%</span></div></section>
      <section class="grid2"><div class="card stat"><div class="stat-lbl">Доходы</div><span class="stat-val pos">55&nbsp;921&nbsp;₽</span><div class="stat-sub">&nbsp;</div></div>
        <div class="card stat"><div class="stat-lbl">Расходы</div><span class="stat-val neg expv">23&nbsp;097&nbsp;₽</span><div class="stat-sub">план 27&nbsp;500&nbsp;₽</div></div></section>
      <section class="card rec"><h2>Последние операции</h2>
        ${row('#5B8DEF', 'Питание', 'Продукты', '−1&nbsp;250&nbsp;₽', 'imp imp0')}
        ${row('#F2994A', 'Подарки', 'Цветы', '−900&nbsp;₽', 'imp imp1')}
        ${row('#2D9CDB', 'Личные расходы', 'Такси', '−420&nbsp;₽', 'imp imp2')}
        ${row('#F2994A', 'Подарки', 'Подарок', '−4&nbsp;479&nbsp;₽')}
        ${row('#5B8DEF', 'Питание', 'Продукты', '−2&nbsp;088&nbsp;₽')}
        ${row('#9B51E0', 'Общественный транспорт', 'Проезд', '−132&nbsp;₽', 'cut5')}
      </section>
    </div></div>
    <div class="dev-page" data-p="ops"><div class="scroll">
      <div class="seg" style="--n:3;--i:0"><span class="seg-pill"></span><button class="on">Все</button><button>Расходы</button><button>Доходы</button></div>
      <div class="search-wrap"><div class="search" style="color:var(--muted)">Поиск по описанию или категории</div></div>
      <section class="card day d1"><div class="day-head"><span>Пт, 23 октября</span><span class="neg dtotal">−4&nbsp;479&nbsp;₽</span></div>
        ${row('#5B8DEF', 'Питание', 'Продукты', '−470&nbsp;₽', 'newrow')}
        ${row('#F2994A', 'Подарки', 'Подарок', '−4&nbsp;479&nbsp;₽')}
      </section>
      <section class="card day"><div class="day-head"><span>Чт, 22 октября</span><span class="neg">−3&nbsp;331&nbsp;₽</span></div>
        ${row('#5B8DEF', 'Питание', 'Продукты', '−2&nbsp;088&nbsp;₽')}${row('#9B51E0', 'Общественный транспорт', 'Проезд', '−132&nbsp;₽')}${row('#2D9CDB', 'Личные расходы', 'Мелочи', '−1&nbsp;111&nbsp;₽')}
      </section>
      <section class="card day"><div class="day-head"><span>Вт, 20 октября</span><span class="pos d3total">+21&nbsp;113&nbsp;₽</span></div>
        ${row('#27AE60', 'Зарплата', 'Аванс', '+23&nbsp;185&nbsp;₽')}${row('#5B8DEF', 'Питание', 'Кафе', '−2&nbsp;072&nbsp;₽', 'delrow')}
      </section>
    </div></div>
    <div class="dev-page" data-p="plan"><div class="scroll">
      <div class="seg" style="--n:2;--i:0"><span class="seg-pill"></span><button class="on">Расходы</button><button>Доходы</button></div>
      <section class="card totals"><div><span class="stat-lbl">План</span><b>27&nbsp;500&nbsp;₽</b></div><div><span class="stat-lbl">Факт</span><b>23&nbsp;097&nbsp;₽</b></div><div><span class="stat-lbl">Разница</span><b class="pos">+4&nbsp;403&nbsp;₽</b></div></section>
      <section class="card plancard">
        ${[['#5B8DEF', 'Питание', '17&nbsp;626&nbsp;₽', '22000', '+4&nbsp;374&nbsp;₽'], ['#9B51E0', 'Общественный транспорт', '992&nbsp;₽', '2500', '+1&nbsp;508&nbsp;₽'], ['#F2994A', 'Подарки', '4&nbsp;479&nbsp;₽', '3000', '−1&nbsp;479&nbsp;₽']]
          .map(([c, n, f, p, d], i) => `<div class="plan-row pr${i}"><div class="plan-top"><span class="plan-name"><i class="dot" style="background:${c}"></i>${n}</span><span class="pdiff ${i === 2 ? 'neg' : 'pos'}">${d}</span></div>
            <div class="progress"><div class="fill f${i}" style="width:0%"></div></div><div class="plan-bottom"><span>${f}</span><span class="plan-input">план <input value="${p}" readonly> ₽</span></div>
            </div>`).join('')}
      </section>
    </div></div>
  </div>
  <nav class="tabs" style="--i:1"><span class="tab-pill"></span>${TAB_NAMES.map((n, i) => `<button class="tab${i === 1 ? ' on' : ''}"><svg class="ti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${TAB_ICONS[i]}"/></svg>${n}</button>`).join('')}</nav>
  <div class="selbar"><span class="selbar-count">1</span><button class="selbar-btn">Все</button><button class="selbar-btn">Перенести</button><button class="selbar-btn danger delbtn">Удалить</button></div>
  <div class="toast"><span>Удалено операций: 1</span><button class="toast-undo undobtn">Отменить</button></div>
  <div class="dev-dim"></div>
  <div class="dev-sheet">
    <div class="grab"></div>
    <div class="sheet-head"><h3>Новая операция</h3><span class="icon-btn" style="display:grid;place-items:center">✕</span></div>
    <div class="seg" style="--n:2;--i:0"><span class="seg-pill"></span><button class="on">Расход</button><button>Доход</button></div>
    <div class="amount-field"><span class="amt" style="font-size:40px;font-weight:700;color:var(--text)">0</span><span>₽</span></div>
    <div class="calc" style="opacity:0;font-size:24px;color:var(--text)">= 470&nbsp;₽</div>
    <div class="chips"><span class="chipsel on" style="border-color:#5B8DEF;background:#5B8DEF22"><i class="dot" style="background:#5B8DEF"></i>Питание</span>
      <span class="chipsel"><i class="dot" style="background:#F2994A"></i>Подарки</span><span class="chipsel"><i class="dot" style="background:#56CCF2"></i>Дом</span></div>
    <div class="sheet-actions"><button class="btn primary savebtn">Сохранить</button></div>
  </div>`;
}

const stage = $('#stage');
stage.innerHTML = `
  <div class="bg"><i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b4"></i><i class="veil"></i></div>
  <div id="cam">
    <div class="layer" id="L-trend">
      <div class="big-card trend"><h3>Динамика за полгода</h3><svg width="898" height="430" viewBox="0 0 898 430"></svg>
        <div class="legend2"><span><i style="background:#45C982"></i>доходы</span><span><i style="background:rgba(243,244,250,.28)"></i>расходы</span><span><i style="background:#8FA8FF;height:6px"></i>остаток</span></div></div>
      <div class="cap verdict" style="left:1220px;top:260px"><span class="line"><span class="verdict-num" style="font-size:260px">0%</span></span></div>
      <div class="cap sub" style="left:1230px;top:560px;font-size:72px"><span class="line"><span>дохода остаётся</span></span><span class="line"><span>в среднем</span></span></div>
      <div style="position:absolute;left:1232px;top:770px"><span class="example" style="font-size:40px">пример на демо-данных</span></div>
    </div>
    <div class="layer" id="L-privacy">
      <div class="cap" style="left:120px;top:200px;font-size:240px"><span class="line"><span>Данные</span></span></div>
      <div class="cap sub" style="left:158px;top:500px;font-size:104px;color:#F3F4FA"><span class="line"><span>только на</span></span><span class="line"><span>телефоне</span></span></div>
      ${['без аккаунтов', 'без облака', 'без рекламы'].map((b, i) => `<div class="badge pb${i}" style="left:1170px;top:${240 + i * 200}px;font-size:60px"><span class="ok"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>${b}</div>`).join('')}
    </div>
    <div class="layer" id="L-import">
      <div class="big-card sheetgrid"><div class="head">Месячный бюджет · Транзакции</div>
        <div class="row h"><span>Дата</span><span>Сумма</span><span>Описание</span><span>Категория</span></div>
        <div class="row sr0"><span>23.10</span><span>1&nbsp;250&nbsp;₽</span><span>Продукты</span><span>Питание</span></div>
        <div class="row sr1"><span>23.10</span><span>900&nbsp;₽</span><span>Цветы</span><span>Подарки</span></div>
        <div class="row sr2"><span>23.10</span><span>420&nbsp;₽</span><span>Такси</span><span>Личные расходы</span></div>
      </div>
      ${[0, 1, 2].map((i) => `<div class="fly fl${i}"><i class="dot" style="background:${['#5B8DEF', '#F2994A', '#2D9CDB'][i]}"></i><span>${['Питание', 'Подарки', 'Личные расходы'][i]}</span><b>${['−1&nbsp;250&nbsp;₽', '−900&nbsp;₽', '−420&nbsp;₽'][i]}</b></div>`).join('')}
    </div>
    <div class="device" id="dev">
      <div class="dev-screen s-a" data-theme="dark" data-style="glass">${screenHTML()}</div>
      <div class="dev-wave w-b"><div class="dev-screen s-b" data-theme="light" data-style="glass">${screenHTML()}</div></div>
      <div class="dev-wave w-c"><div class="dev-screen s-c" data-theme="light" data-style="minimal">${screenHTML()}</div></div>
    </div>
    <div class="layer" id="L-caps">
      <div class="plate c-entry" style="left:110px;top:600px"><div class="cap" style="font-size:84px"><span class="line"><span>Сумма считается</span></span><span class="line"><span>прямо в поле</span></span></div></div>
      <div class="plate c-save" style="left:100px;top:380px"><div class="cap" style="font-size:72px"><span class="line"><span>Категория</span></span><span class="line"><span>подставится сама</span></span></div></div>
      <div class="cap c-plan" style="left:120px;top:250px;font-size:190px"><span class="line"><span>План</span></span><span class="line"><span>и факт</span></span></div>
      <div class="cap sub c-plan2" style="left:126px;top:690px;font-size:48px"><span class="line"><span>свайп — соседняя вкладка</span></span></div>
      <div class="cap c-undo" style="left:120px;top:330px;font-size:128px"><span class="line"><span>Ошибся —</span></span><span class="line"><span>отмени</span></span></div>
      <div class="cap c-theme" style="left:120px;top:300px;font-size:96px"><span class="line"><span>Стекло</span></span><span class="line"><span>или минимализм</span></span></div>
      <div class="cap sub c-theme2" style="left:126px;top:600px;font-size:64px"><span class="line"><span>светлая и тёмная тема</span></span></div>
      <div class="cap c-import" style="left:120px;top:56px;font-size:80px"><span class="line"><span>Переезд из</span></span><span class="line"><span>Google Таблиц</span></span></div>
      <div class="cap sub c-import2" style="left:124px;top:850px;font-size:52px"><span class="line"><span>скачай .xlsx и выбери файл</span></span></div>
      <div class="demo-note">демо-данные</div>
    </div>
    <div class="layer" id="L-end">
      <div class="endicon" style="left:830px;top:140px;width:260px;height:260px;background:linear-gradient(160deg,#5E8BFF,#3D63E6)">
        <svg width="190" height="190" viewBox="18 18 72 72"><path fill="#fff" d="M36,64h8v10h-8z M50,52h8v22h-8z M64,40h8v34h-8z"/><path fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="M34,46 L48,36 L58,42 L74,30"/></svg></div>
      <div class="cap e-name" style="left:0;right:0;top:440px;text-align:center;font-size:200px"><span class="line"><span>Монетка</span></span></div>
      <div class="cap sub e-tag" style="left:0;right:0;top:690px;text-align:center;font-size:72px;color:#F3F4FA"><span class="line"><span>Личный бюджет без облака и рекламы</span></span></div>
      <div class="cap sub e-play" style="left:0;right:0;top:830px;text-align:center;font-size:52px"><span class="line"><span>Android · открытый исходный код</span></span></div>
    </div>
    <div id="coin"><i class="ring"></i><i class="rip"></i><div class="c"><span class="g">₽</span></div></div>
  </div>`;

/* Карта линзы, как в приложении */
const lensMap = (dir) => {
  const [hi, mid, lo] = dir === 'h' ? ['#f00', '#800000', '#000'] : ['#0f0', '#008000', '#000'];
  const xy = dir === 'h' ? "x2='1' y2='0'" : "x2='0' y2='1'";
  return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' preserveAspectRatio='none'><defs><linearGradient id='g' ${xy}><stop offset='0' stop-color='${hi}'/><stop offset='.2' stop-color='${mid}'/><stop offset='.8' stop-color='${mid}'/><stop offset='1' stop-color='${lo}'/></linearGradient></defs><rect width='100' height='100' fill='url(#g)'/></svg>`);
};
$('#lens-h').setAttribute('href', lensMap('h'));
$('#lens-v').setAttribute('href', lensMap('v'));

const cam = $('#cam'), dev = $('#dev'), coin = $('#coin');
const screens = $$('.dev-screen');
const each = (sel, fn) => screens.forEach((s) => $$(sel, s).forEach(fn));

/* ---------- Динамика за полгода: SVG ---------- */
const TREND = [[30, 22, 28], [33, 24, 31], [31, 20, 38], [35, 25, 44], [32, 23, 50], [34, 21, 57]];
/** Доля дохода, которая не ушла на траты, — считается из тех же столбцов, что на экране */
const KEEP = Math.round((1 - TREND.reduce((a, r) => a + r[1], 0) / TREND.reduce((a, r) => a + r[0], 0)) * 100);
const MONTHS = ['Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт'];
const trendSvg = $('#L-trend svg');
const TW = 898, TH = 360, slot = TW / 6;
const lineY = (v) => 20 + (TH - 20) * (1 - (v - 20) / 45);
trendSvg.innerHTML = TREND.map(([inc, out], i) => {
  const cx = (i + 0.5) * slot, hi = (inc / 40) * (TH - 30), ex = (out / 40) * (TH - 30);
  return `<rect class="tb tbi${i}" x="${cx - 40}" y="${TH - hi}" width="34" height="${hi}" rx="8" fill="#45C982"/>
    <rect class="tb tbo${i}" x="${cx + 6}" y="${TH - ex}" width="34" height="${ex}" rx="8" fill="rgba(243,244,250,.28)"/>
    <text x="${cx}" y="${TH + 52}" text-anchor="middle" font-family="Inter" font-weight="600" font-size="30" fill="${i === 5 ? '#8FA8FF' : '#9AA0B4'}">${MONTHS[i]}</text>`;
}).join('') + `<path class="tline" fill="none" stroke="#8FA8FF" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" d="${TREND.map(([, , e], i) => `${i ? 'L' : 'M'}${(i + 0.5) * slot},${lineY(e)}`).join(' ')}"/>`
  + TREND.map(([, , e], i) => `<circle class="tdot td${i}" cx="${(i + 0.5) * slot}" cy="${lineY(e)}" r="11" fill="#0B0C1A" stroke="#8FA8FF" stroke-width="6"/>`).join('');
const trendPts = TREND.map(([, , e], i) => [56 + (i + 0.5) * slot, 120 + lineY(e)]);

/* ---------- Геометрия: css-координаты внутри телефона ---------- */
const devScreen = screens[0];
function cssRect(el) {
  const d = devScreen.getBoundingClientRect(), r = el.getBoundingClientRect(), k = d.width / 412;
  return { x: (r.left - d.left) / k, y: (r.top - d.top) / k, w: r.width / k, h: r.height / k };
}
const ROW_H = 61;
/** Наезд камеры идёт от левой трети кадра: подписи слева не уезжают за поле 96 px */
const CAM_OX = 640;
let pose = { x: 0, y: 0, s: 1 };
let camT = { s: 1, x: 0, y: 0 };
/** css-точка телефона → координаты сцены (до камеры) */
const world = (cx, cy) => ({ x: pose.x + cx * pose.s, y: pose.y + cy * pose.s });
/** Прямоугольник элемента сцены → координаты сцены (обратно преобразованию камеры) */
function worldRect(el) {
  const r = el.getBoundingClientRect();
  const inv = (sx, sy) => ({ x: (sx - CAM_OX - camT.x) / camT.s + CAM_OX, y: (sy - 540 - camT.y) / camT.s + 540 });
  const a = inv(r.left, r.top), b = inv(r.right, r.bottom);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
}

/* ---------- Позы телефона ---------- */
/** Поза, при которой css-точка (cx, cy) телефона стоит в точке сцены (sx, sy) при масштабе s */
const aim = (cx, cy, sx, sy, s) => ({ x: sx - cx * s, y: sy - cy * s, s });
let P = {};
function measurePoses() {
  setState(0.01);
  const amt = cssRect($('.s-a .amount-field'));
  const save = cssRect($('.s-a .savebtn'));
  const d1 = cssRect($('.s-a .d1'));
  const plan = cssRect($('.s-a .plancard'));
  const calc = cssRect($('.s-a .calc'));
  P = {
    entry: aim(amt.x + amt.w / 2, amt.y + amt.h / 2, 1060, 470, 5.0),
    // Наезд на результат: «= 470 ₽» становится крупнее выражения
    calc: aim(calc.x + calc.w / 2, calc.y + calc.h / 2 - 14, 1000, 560, 7.4),
    toast: aim(206, 770, 1250, 640, 3.1),
    save: aim(save.x + save.w / 2, save.y + save.h / 2, 1290, 850, 2.4),
    list: aim(206, d1.y + 110, 1350, 470, 2.4),
    plan: aim(206, plan.y + plan.h / 2 - 20, 1350, 560, 2.4),
    gone: null,
    undo: aim(206, 605, 1350, 540, 2.4),
    theme: aim(206, 470, 1400, 560, 1.95),
    import: aim(206, 360, 1420, 600, 1.95),
  };
  P.gone = { ...P.plan, y: P.plan.y - 2700 };
  P.undoIn = { ...P.undo, y: P.undo.y + 2600 };
  P.importOut = { ...P.import, y: P.import.y + 2400 };
}
const mixPose = (a, b, p) => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), s: lerp(a.s, b.s, p) });
function poseAt(t) {
  if (t < 2.25) return P.entry;
  if (t < 2.45) return mixPose(P.entry, P.calc, eo(span(t, 2.25, 2.45)));
  if (t < 2.62) return P.calc;
  if (t < 2.95) return mixPose(P.calc, P.save, e3(span(t, 2.62, 2.95)));
  if (t < 3.8) return P.save;
  if (t < 4.3) return mixPose(P.save, P.list, e3(span(t, 3.8, 4.3)));
  if (t < 5.6) return P.list;
  if (t < 6.2) return mixPose(P.list, P.plan, e3(span(t, 5.6, 6.2)));
  if (t < 8.45) return P.plan;
  if (t < 8.68) return mixPose(P.plan, P.gone, ein(span(t, 8.45, 8.68)));
  if (t < 14.28) return P.gone;
  if (t < 14.68) return mixPose(P.undoIn, P.undo, eo(span(t, 14.28, 14.68)));
  if (t < 15.72) return P.undo;
  if (t < 15.95) return mixPose(P.undo, P.toast, e3(span(t, 15.72, 15.95)));
  if (t < 16.75) return P.toast;
  if (t < 17.0) return mixPose(P.toast, P.undo, e3(span(t, 16.75, 17.0)));
  if (t < 17.5) return P.undo;
  if (t < 17.95) return mixPose(P.undo, P.theme, e3(span(t, 17.5, 17.95)));
  if (t < 20.45) return P.theme;
  if (t < 20.85) return mixPose(P.theme, P.import, e3(span(t, 20.45, 20.85)));
  if (t < 22.95) return P.import;
  return mixPose(P.import, P.importOut, ein(span(t, 22.95, 23.25)));
}

/* ---------- Состояние интерфейса телефона ---------- */
function typedAt(t) {
  let s = '0';
  for (const k of cues.typing) if (t >= k.t) s = k.text;
  return s;
}
function setH(el, h) { el.style.height = `${h}px`; el.style.opacity = String(clamp(h / ROW_H)); }

function setState(t) {
  // Вкладка: Операции → План (длинный свайп 5.6–6.1) → Операции (после приватности) → Обзор (17.5–17.9)
  let page = 1;
  if (t >= 5.6 && t < 8.75) page = 1 + e2(span(t, 5.6, 6.1));
  // Свайп назад к «Обзору» — до отъезда камеры, а не одновременно с ним
  if (t >= 17.0) page = 1 - e2(span(t, 17.05, 17.4));
  each('.dev-pages', (el) => { el.style.transform = `translateX(${-page * 412}px)`; });
  each('.tabs', (el) => { el.style.setProperty('--i', String(page)); });
  each('.tab', (el) => el.classList.toggle('on', $$('.tab', el.parentElement).indexOf(el) === Math.round(page)));
  // Прокрутка «Операций» к строкам в сцене отмены
  const opsScroll = 0;
  each('[data-p="ops"] .scroll', (el) => { el.style.transform = `translateY(${opsScroll}px)`; });
  each('[data-p="overview"] .scroll', (el) => { el.style.transform = `translateY(${t >= 20.4 ? -150 : 0}px)`; });

  // Шторка: открыта до 3.8, затем уезжает
  const down = po(span(t, 3.8, 4.15));
  each('.dev-sheet', (el) => { el.style.transform = `translateY(${down * 110}%)`; el.style.visibility = down >= 1 ? 'hidden' : ''; });
  each('.dev-dim', (el) => { el.style.opacity = String(1 - down); el.style.visibility = down >= 1 ? 'hidden' : ''; });
  each('.amt', (el) => { el.textContent = typedAt(t); });
  const calc = bo(span(t, 2.25, 2.55));
  each('.calc', (el) => { el.style.opacity = String(clamp(calc * 1.4)); el.style.transform = `translateY(${(1 - calc) * 8}px) scale(${0.85 + 0.15 * calc})`; });
  const saved = t >= 3.0;
  each('.savebtn', (el) => {
    el.textContent = saved ? '✓ Сохранено' : 'Сохранить';
    el.style.background = saved ? 'var(--pos)' : '';
    el.style.transform = `scale(${1 - 0.06 * bump(t, 2.96, 0.16) + 0.04 * bump(t, 3.0, 0.3)})`;
  });

  // Новая строка в «Операциях» и итог дня
  each('.newrow', (el) => setH(el, ROW_H * bo(span(t, 4.25, 4.6))));
  each('.dtotal', (el) => { el.innerHTML = t >= 4.3 ? '−4&nbsp;949&nbsp;₽' : '−4&nbsp;479&nbsp;₽'; });
  each('.d3total', (el) => { el.innerHTML = t >= 15.6 && t < 16.62 ? '+23&nbsp;185&nbsp;₽' : '+21&nbsp;113&nbsp;₽'; });

  // Отмена: выбор 15.0, удаление 15.5, тост 15.8, возврат 16.6
  const pressed = t >= 15.0 && t < 15.5;
  each('.delrow .tx', (el) => {
    el.classList.toggle('sel', pressed || (t >= 16.7 && t < 17.1));
    const dot = el.firstElementChild;
    dot.className = pressed ? 'check on' : 'dot';
    if (!pressed) dot.style.background = '#5B8DEF'; else dot.style.background = '';
  });
  const gone = e2(span(t, 15.5, 15.68)), back = bo(span(t, 16.58, 16.9));
  each('.delrow', (el) => setH(el, t < 16.58 ? ROW_H * (1 - gone) : ROW_H * back));
  const sel = eo(span(t, 15.0, 15.3)) * (1 - ein(span(t, 15.5, 15.65)));
  each('.selbar', (el) => { el.style.opacity = String(sel); el.style.transform = `translateX(-50%) translateY(${(1 - sel) * 30}px)`; el.style.visibility = sel > 0 ? '' : 'hidden'; });
  const toast = bo(span(t, 15.8, 16.1)) * (1 - ein(span(t, 16.65, 16.85)));
  each('.toast', (el) => { el.style.opacity = String(clamp(toast)); el.style.transform = `translate(-50%, ${(1 - toast) * 24}px) scale(${0.94 + 0.06 * toast})`; el.style.visibility = toast > 0.01 ? '' : 'hidden'; });

  // План: полосы 6.5 / 7.0 / 7.5, перерасход 8.0
  const ratios = [0.8, 0.4, 1];
  for (let i = 0; i < 3; i++) {
    const f = eo(span(t, 6.2 + i * 0.5, 6.9 + i * 0.5));
    each(`.f${i}`, (el) => { el.style.width = `${f * ratios[i] * 100}%`; el.classList.toggle('over', i === 2 && t >= 7.98); });
  }
  // Импорт: строки раскрываются в списке, когда долетают; в списке не больше пяти, расходы растут на сумму строки
  const IMP = [21.35, 21.75, 22.15];
  IMP.forEach((at, i) => each(`.imp${i}`, (el) => setH(el, ROW_H * bo(span(t, at - 0.05, at + 0.3)))));
  each('.cut5', (el) => setH(el, ROW_H * (1 - bo(span(t, IMP[2] - 0.05, IMP[2] + 0.3)))));
  const spent = 23097 + [1250, 900, 420].reduce((s, a, i) => s + (t >= IMP[i] ? a : 0), 0);
  each('.expv', (el) => { el.innerHTML = rub(spent).replace(/ /g, '&nbsp;'); });
}

/* ---------- Волна стекла от точки касания ---------- */
function setWaves(t) {
  const r1 = eo(span(t, 18.0, 18.75)) * 1100, r2 = eo(span(t, 19.2, 19.95)) * 1100;
  const tap1 = { x: 300, y: 150 }, tap2 = { x: 110, y: 250 };
  $('.w-b').style.clipPath = `circle(${r1}px at ${tap1.x}px ${tap1.y}px)`;
  $('.w-c').style.clipPath = `circle(${r2}px at ${tap2.x}px ${tap2.y}px)`;
}

/* ---------- Монетка ---------- */
const anchors = {
  amtEnd: () => { const r = cssRect($('.s-a .amt')); return world(r.x + r.w + 46, r.y + r.h * 0.55); },
  save: () => { const r = cssRect($('.s-a .savebtn')); return world(r.x + r.w * 0.66, r.y + r.h / 2); },
  newCat: () => { const r = cssRect($('.s-a .newrow .tx-cat')); return world(r.x + 96, r.y + r.h / 2); },
  swipeA: () => world(372, cssRect($('.s-a .d1')).y + 60),
  swipeB: () => world(60, cssRect($('.s-a .d1')).y + 60),
  overTag: () => { const r = cssRect($('.s-a .f2')); return world(r.x + r.w - 6, r.y + r.h / 2); },
  // После касания палец отходит, чтобы результат касания читался
  saveAside: () => { const r = cssRect($('.s-a .savebtn')); return world(r.x + r.w + 30, r.y - 24); },
  overAside: () => { const r = cssRect($('.s-a .f2')); return world(r.x + r.w + 30, r.y + 46); },
  delAside: () => { const r = cssRect($('.s-a .delbtn')); return world(r.x + r.w + 34, r.y - 30); },
  planRest: () => { const r = cssRect($('.s-a .plancard')); return world(r.x + r.w + 26, r.y + 150); },
  delRow: () => { const r = cssRect($('.s-a .delrow .tx-cat')); return world(r.x + 40, r.y + r.h / 2 + 6); },
  delBtn: () => { const r = cssRect($('.s-a .delbtn')); return world(r.x + r.w / 2, r.y + r.h / 2); },
  undoBtn: () => { const r = cssRect($('.s-a .undobtn')); return world(r.x + r.w / 2, r.y + r.h / 2); },
  themeA: () => world(380, 560), themeB: () => world(40, 560), aside: () => world(428, 520),
  tap1: () => world(300, 150), tap2: () => world(110, 250),
  badge: (i) => () => { const r = worldRect($(`.pb${i} .ok`)); return { x: r.cx, y: r.cy }; },
  trendPt: (i) => () => { const c = worldRect($('#L-trend .trend')); return { x: c.x + trendPts[i][0], y: c.y + trendPts[i][1] }; },
  verdict: () => { const r = worldRect($('.verdict')); return { x: r.x + r.w + 40, y: r.y + r.h * 0.7 }; },
  sheetRow: () => { const r = worldRect($('.sr0')); return { x: r.x + 60, y: r.cy }; },
  center: () => ({ x: 960, y: 540 }),
  endIcon: () => ({ x: 960, y: 270 }),
};
// [время, якорь, размер, ease]; между ключами — переход с этим ease, монетка следует за движущимися якорями
const C = (t, a, s = 64, e = e3) => ({ t, a, s, e });
const COIN = [
  // Кадр 1: монетка висит справа над суммой, не на интерфейсе; замах вверх и падение на первую цифру
  C(0, () => ({ x: anchors.amtEnd().x + 210, y: anchors.amtEnd().y - 120 }), 150), C(0.16, () => ({ x: anchors.amtEnd().x + 210, y: anchors.amtEnd().y - 150 }), 150, ease('power2.out')),
  C(0.5, anchors.amtEnd, 84, ein), C(2.3, anchors.amtEnd, 84, (p) => p),
  C(2.95, anchors.save, 84), C(3.04, anchors.save, 84, (p) => p), C(3.25, anchors.saveAside, 84, ease('power2.out')), C(3.75, anchors.saveAside, 84, (p) => p),
  C(4.35, anchors.newCat, 84), C(5.35, anchors.newCat, 84, (p) => p), C(5.6, anchors.swipeA, 84), C(6.1, anchors.swipeB, 84, e2),
  C(6.6, anchors.planRest, 84), C(7.6, anchors.planRest, 84, (p) => p), C(7.97, anchors.overTag, 84),
  C(8.03, anchors.overTag, 84, (p) => p), C(8.22, anchors.overAside, 84, ease('power2.out')), C(8.4, anchors.overAside, 84, (p) => p), C(8.85, anchors.center, 84, ease('power3.out')),
  C(9.35, anchors.badge(0), 84), C(9.75, anchors.badge(0), 84, (p) => p), C(9.97, anchors.badge(1), 84), C(10.25, anchors.badge(1), 84, (p) => p),
  C(10.47, anchors.badge(2), 84), C(11.0, anchors.badge(2), 84, (p) => p),
  C(12.35, anchors.trendPt(0), 64),
  ...[1, 2, 3, 4, 5].map((i) => C(12.4 + i * 0.16, anchors.trendPt(i), 64, (p) => p)),
  C(14.2, anchors.trendPt(5), 64, (p) => p),
  C(14.7, anchors.delRow, 84), C(15.05, anchors.delRow, 84, (p) => p), C(15.45, anchors.delBtn, 84),
  C(15.53, anchors.delBtn, 84, (p) => p), C(15.7, anchors.delAside, 84, ease('power2.out')), C(15.9, anchors.delAside, 84, (p) => p), C(16.55, anchors.undoBtn, 84), C(16.62, anchors.undoBtn, 84, (p) => p),
  // Отпускает «Отменить», чтобы слово читалось, и длинным свайпом возвращается на «Обзор»
  C(16.95, anchors.themeB, 84), C(17.4, anchors.themeA, 84, e2), C(17.97, anchors.tap1, 84),
  C(18.05, anchors.tap1, 84, (p) => p), C(18.45, anchors.aside, 84), C(19.12, anchors.tap2, 84),
  C(19.25, anchors.tap2, 84, (p) => p), C(19.7, anchors.aside, 84), C(20.4, anchors.aside, 84, (p) => p),
  C(20.85, anchors.sheetRow, 84), C(20.9, anchors.sheetRow, 84, (p) => p),
  C(21.35, () => { const r = worldRect($('.fl0')); return { x: r.x + 34, y: r.cy }; }, 84, (p) => p),
  C(22.9, () => { const r = worldRect($('.s-c .imp0 .tx-cat')); return { x: r.x + r.w + 60, y: r.cy }; }, 84),
  C(23.45, anchors.endIcon, 260, ease('power3.out')),
];
const TAPS = [0.5, ...cues.typing.slice(1).map((k) => k.t), 3.0, 8.0, 9.5, 10.0, 10.5, 15.5, 16.6, 18.0, 19.2];
const SQUASH = [0.5];

function coinAt(t) {
  let i = COIN.findIndex((k) => k.t > t);
  if (i === -1) i = COIN.length;
  const a = COIN[Math.max(0, i - 1)], b = COIN[Math.min(COIN.length - 1, i)];
  const pa = a.a(), pb = b.a();
  const p = a === b ? 1 : b.e(span(t, a.t, b.t));
  return { x: lerp(pa.x, pb.x, p), y: lerp(pa.y, pb.y, p), s: lerp(a.s, b.s, p) };
}

function setCoin(t) {
  const c = coinAt(t);
  const tap = TAPS.reduce((m, at) => Math.max(m, bump(t, at - 0.04, 0.2)), 0);
  const sq = SQUASH.reduce((m, at) => Math.max(m, bump(t, at - 0.02, 0.24)), 0);
  const morph = span(t, 23.42, 23.52);
  const vis = t < 23.52 ? 1 : 0;
  const el = $('.c', coin);
  const s = c.s * (1 - 0.14 * tap);
  el.style.width = el.style.height = `${s}px`;
  el.style.transform = `translate(${c.x - s / 2}px, ${c.y - s / 2 + 6 * tap}px) scale(${1 + 0.3 * sq}, ${1 - 0.3 * sq})`;
  el.style.borderRadius = `${lerp(50, 26, morph)}%`;
  el.style.opacity = String(vis);
  $('.g', el).style.fontSize = `${s * 0.5}px`;
  $('.g', el).style.opacity = String(1 - morph);
  // Волна касания
  const rp = TAPS.reduce((m, at) => (t >= at && t < at + 0.45 ? (t - at) / 0.45 : m), -1);
  const rip = $('.rip', coin);
  rip.style.opacity = rp < 0 ? '0' : String(0.7 * (1 - rp));
  const rs = c.s * (1 + rp * 1.6);
  rip.style.width = rip.style.height = `${rs}px`;
  rip.style.transform = `translate(${c.x - rs / 2}px, ${c.y - rs / 2}px)`;
  // Кольцо удержания (зажатие строки 14.6–15.0)
  const hold = span(t, 14.62, 15.0), ring = $('.ring', coin);
  const ringOn = t >= 14.62 && t < 15.12;
  ring.style.opacity = ringOn ? '1' : '0';
  const rr = c.s + 34;
  ring.style.width = ring.style.height = `${rr}px`;
  ring.style.transform = `translate(${c.x - rr / 2}px, ${c.y - rr / 2}px)`;
  ring.style.background = `conic-gradient(#8FA8FF ${hold * 360}deg, rgba(143,168,255,.18) 0)`;
  ring.style.mask = ring.style.webkitMask = `radial-gradient(circle, transparent ${rr / 2 - 7}px, #000 ${rr / 2 - 6}px)`;
}

/* ---------- Слои и подписи ---------- */
/** Строка подписи: въезжает маской снизу, уходит маской вверх */
function lineIn(el, t, tin, tout, stagger = 0.08) {
  $$('.line > span', el).forEach((s, i) => {
    const a = eo(span(t, tin + i * stagger, tin + i * stagger + 0.6));
    const b = ein(span(t, tout + i * 0.04, tout + i * 0.04 + 0.22));
    s.style.transform = `translateY(${(1 - a) * 110 - b * 110}%)`;
  });
  el.style.visibility = t >= tin - 0.05 && t <= tout + 0.4 ? '' : 'hidden';
}
function plate(el, t, tin, tout) {
  const a = eo(span(t, tin, tin + 0.5)), b = ein(span(t, tout, tout + 0.2));
  el.style.opacity = String(clamp(a * 1.5) * (1 - b));
  el.style.transform = `translateY(${(1 - a) * 24 - b * 20}px)`;
  el.style.visibility = t >= tin - 0.05 && t <= tout + 0.25 ? '' : 'hidden';
  lineIn($('.cap', el), t, tin + 0.05, tout);
}
function show(el, on) { el.style.visibility = on ? '' : 'hidden'; }

function setLayers(t) {
  plate($('.c-entry'), t, -1, 2.02);
  plate($('.c-save'), t, 3.05, 5.4);
  lineIn($('.c-plan'), t, 5.85, 8.2);
  lineIn($('.c-plan2'), t, 6.0, 8.2);
  lineIn($('.c-undo'), t, 14.45, 17.3);
  lineIn($('.c-theme'), t, 17.75, 20.1, 0.45);
  lineIn($('.c-theme2'), t, 18.25, 20.1);
  lineIn($('.c-import'), t, 20.6, 22.65);
  lineIn($('.c-import2'), t, 20.9, 22.65);

  // Приватность
  const priv = $('#L-privacy');
  show(priv, t >= 8.45 && t < 11.3);
  lineIn($('.cap', priv), t, 8.55, 10.95);
  lineIn($('.cap.sub', priv), t, 8.75, 10.95);
  [9.5, 10.0, 10.5].forEach((at, i) => {
    const b = $(`.pb${i}`), a = bo(span(t, at - 0.17, at + 0.2)), out = ein(span(t, 10.95 + i * 0.04, 11.15 + i * 0.04));
    b.style.opacity = String(clamp(a * 1.6) * (1 - out));
    b.style.transform = `translateX(${(1 - a) * 80}px) scale(${(0.86 + 0.14 * a) * (1 - out * 0.9)})`;
  });

  // Динамика
  const tr = $('#L-trend');
  show(tr, t >= 10.95 && t < 14.75);
  const card = $('.trend', tr);
  const cin = eo(span(t, 11.0, 11.5)), cout = ein(span(t, 14.15, 14.38));
  card.style.transform = `translateY(${(1 - cin) * 160 + cout * 140}px) scale(${0.94 + 0.06 * cin})`;
  card.style.opacity = String(clamp(cin * 1.5) * (1 - cout));
  TREND.forEach((_, i) => {
    const g = bo(span(t, 11.3 + i * 0.07, 11.85 + i * 0.07));
    $$(`.tbi${i}, .tbo${i}`, tr).forEach((r) => { r.style.transformBox = 'fill-box'; r.style.transformOrigin = '50% 100%'; r.style.transform = `scaleY(${g})`; });
    $(`.td${i}`, tr).style.opacity = t >= 12.4 + i * 0.16 ? '1' : '0';
  });
  $('.tline', tr).style.strokeDashoffset = String(1 - clamp(span(t, 12.4, 12.4 + 5 * 0.16) * 1.0));
  lineIn($('.verdict', tr), t, 13.2, 14.1);
  const num = Math.round(KEEP * po(span(t, 13.2, 13.6)));
  $('.verdict-num', tr).textContent = `${num}%`;
  lineIn($('.cap.sub', tr), t, 13.3, 14.1);
  const ex = eo(span(t, 13.3, 13.6)) * (1 - ein(span(t, 14.05, 14.2)));
  $('.example', tr).style.opacity = String(ex);

  // Импорт
  const im = $('#L-import');
  show(im, t >= 20.45 && t < 23.22);
  const grid = $('.sheetgrid', im);
  const gin = eo(span(t, 20.45, 20.95)), gout = ein(span(t, 22.95, 23.2));
  grid.style.transform = `translateX(${(1 - gin) * -260 - gout * 1200}px)`;
  grid.style.opacity = String(clamp(gin * 1.5));
  [0, 1, 2].forEach((i) => {
    const t0 = 20.9 + i * 0.4, t1 = t0 + 0.45;
    const fl = $(`.fl${i}`, im), src = $(`.sr${i}`, im);
    const p = e3(span(t, t0, t1));
    const sr = worldRect(src);
    const dst = $(`.s-c .imp${i}`);
    const dr = worldRect(dst.parentElement.querySelector('h2'));
    const target = { x: dr.x, y: dr.y + dr.h + 10 + i * 0 };
    const x = lerp(sr.x + 10, target.x, p), y = lerp(sr.y + 6, target.y, p) - Math.sin(Math.PI * p) * 140;
    const w = lerp(sr.w - 20, 412 * pose.s - 32 * pose.s, p);
    fl.style.width = `${w}px`;
    fl.style.height = `${lerp(sr.h - 12, ROW_H * pose.s, p)}px`;
    fl.style.transform = `translate(${x}px, ${y}px)`;
    fl.style.fontSize = `${lerp(30, 15 * pose.s, p)}px`;
    fl.style.opacity = t < t0 || t > t1 + 0.02 ? '0' : '1';
    src.style.opacity = t >= t0 ? '0.25' : '1';
  });

  // Финал
  const end = $('#L-end');
  show(end, t >= 23.4);
  const icon = $('.endicon', end), ia = bo(span(t, 23.5, 23.95));
  icon.style.opacity = t >= 23.52 ? '1' : '0';
  const note = $('.demo-note');
  note.style.opacity = String(((t >= 2.4 && t < 8.45) || (t >= 11.2 && t < 22.95)) ? 1 : 0);
  icon.style.transform = `scale(${0.92 + 0.08 * ia})`;
  lineIn($('.e-name', end), t, 23.6, 99);
  lineIn($('.e-tag', end), t, 24.0, 99);
  lineIn($('.e-play', end), t, 24.4, 99);

  // Телефон виден, пока он в кадре
  show(dev, !(t >= 8.72 && t < 14.27) && t < 23.3);
  setWaves(t);
}

/* ---------- Камера ---------- */
const HITS = cues.events.filter((e) => ['thud', 'final', 'chime'].includes(e.sfx)).map((e) => e.t);
function setCamera(t) {
  const sc = cues.scenes.find((s) => t >= s.t0 && t < s.t1) ?? cues.scenes[cues.scenes.length - 1];
  const idx = cues.scenes.indexOf(sc);
  const p = span(t, sc.t0, sc.t1);
  const push = 1 + (sc.id === 'end' ? 0.1 : 0.06) * p;
  const dir = idx % 2 ? 1 : -1;
  const punch = HITS.reduce((m, at) => Math.max(m, bump(t, at, 0.3) * 0.028), 0);
  camT = { s: push + punch, x: sc.id === 'end' ? 0 : 30 * p, y: sc.id === 'end' ? -14 * p : -8 * p };
  cam.style.transform = `translate(${camT.x}px, ${camT.y}px) scale(${camT.s})`;
  // Фон дышит и чуть светлеет на стекле
  const bloom = eo(span(t, 18.0, 18.8)) * (1 - span(t, 22.9, 23.3));
  $('.bg').style.transform = `translate(${-20 * (t / DUR)}px, ${10 * Math.sin(t * 0.35)}px)`;
  $('.bg .veil').style.opacity = String(1 - 0.35 * bloom);
}

/* ---------- Кадр ---------- */
function frame(t) {
  t = clamp(t, 0, DUR - 1 / FPS);
  setState(t);
  setCamera(t);
  pose = poseAt(t);
  dev.style.transform = `translate(${pose.x}px, ${pose.y}px) scale(${pose.s})`;
  setLayers(t);
  setCoin(t);
}

/** Скорость движения в кадре, px за кадр: по ней рендерер решает, сколько подкадров смешать в motion blur */
const MOVERS = ['.trend', '.sheetgrid', '.fl0', '.fl1', '.fl2', '.pb0', '.pb1', '.pb2', '.endicon'];
function probe(t) {
  frame(t);
  const c = coinAt(clamp(t, 0, DUR));
  const m = MOVERS.map((s) => { const el = $(s); return el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden' ? worldRect(el) : null; });
  return { pose: { ...pose }, c, m, cam: { ...camT } };
}
function speed(t, lo = t - 0.5 / FPS, hi = t + 0.5 / FPS) {
  const a = probe(lo), b = probe(hi);
  let v = Math.max(Math.abs(a.pose.x - b.pose.x), Math.abs(a.pose.y - b.pose.y), Math.abs(a.pose.s - b.pose.s) * 2600, Math.hypot(a.c.x - b.c.x, a.c.y - b.c.y), Math.abs(a.c.s - b.c.s));
  a.m.forEach((r, i) => { const q = b.m[i]; if (r && q) v = Math.max(v, Math.hypot(r.cx - q.cx, r.cy - q.cy), Math.abs(r.w - q.w)); });
  frame(t);
  return v;
}

await document.fonts.ready;
$$('.rowwrap').forEach((r) => { r.style.overflow = 'hidden'; });
measurePoses();
frame(0);
window.__seek = frame;
window.__speed = speed;
// Скачки состояния, через которые не проходит затвор: склейки, нажатия клавиш, смена итогов, прилёт строк импорта
const STEPS = [...cues.scenes.slice(1).map((s) => s.t0), ...cues.typing.map((k) => k.t), 4.3, 15.6, 16.62, 21.35, 21.75, 22.15];
window.__meta = { fps: FPS, duration: DUR, cuts: STEPS.sort((a, b) => a - b) };
window.__ready = true;

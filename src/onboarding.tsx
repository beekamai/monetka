/*
 * Знакомство при первом запуске: шесть экранов, сквозь которые проходит одна монетка-носитель.
 * Всё движение — чистая функция времени (state = f(t)) от одних часов: без цепочек таймеров, петли детерминированы.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ThemeStyle } from './model.ts';
import { haptic, reducedMotion, useBack, useSwipe } from './ui.tsx';
import './onboarding.css';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const eio = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const eout = (p: number) => 1 - Math.pow(1 - p, 3);
/** Пружина с перелётом: 0 → 1 с затухающим колебанием */
const spring = (p: number) => (p >= 1 ? 1 : 1 - Math.exp(-6.5 * p) * Math.cos(8.5 * p));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
/** Короткий импульс 0 → 1 → 0 после момента касания */
const bump = (t: number, at: number, len = 0.26) => (t >= at && t <= at + len ? Math.sin((Math.PI * (t - at)) / len) : 0);

/** Монетка: x — % ширины сцены, y — px, s — диаметр, sq — сплющивание (0 — круглая), tap — сила касания */
interface Coin { x: number; y: number; s: number; sq: number; tap: number; glyph: number }
type Way = [t: number, x: number, y: number, s: number];

function along(ways: Way[], t: number): [number, number, number] {
  if (t <= ways[0][0]) return [ways[0][1], ways[0][2], ways[0][3]];
  for (let i = 1; i < ways.length; i++) {
    const [t1, x1, y1, s1] = ways[i];
    if (t <= t1) {
      const [t0, x0, y0, s0] = ways[i - 1];
      const p = eio(span(t, t0, t1));
      return [lerp(x0, x1, p), lerp(y0, y1, p), lerp(s0, s1, p)];
    }
  }
  const l = ways[ways.length - 1];
  return [l[1], l[2], l[3]];
}

const FINGER = 30;
const LOOPS = [0, 6.6, 6.2, 7.4, 6.6, 0];
/** Кадр, который показывается при «Убрать анимацию»: самое информативное состояние петли */
const STILL = [3, 4.2, 3, 4.7, 3.4, 3];

function coinAt(step: number, t: number): Coin {
  switch (step) {
    case 0: {
      // Падает сверху, сплющивается о «пол» и встаёт; дальше дышит
      const fall = span(t, 0, 0.55);
      const y = t < 0.55 ? lerp(-90, 150, fall * fall) : 150 - 34 * Math.sin(Math.PI * span(t, 0.55, 0.95)) * (1 - span(t, 0.55, 0.95) * 0.4);
      const sq = bump(t, 0.5, 0.22) * 0.22 + bump(t, 0.93, 0.18) * 0.08;
      return { x: 50, y: t > 1.2 ? 150 + Math.sin((t - 1.2) * 1.6) * 5 : y, s: 128, sq, tap: 0, glyph: 1 };
    }
    case 1: {
      const [x, y, s] = along([[0, 74, 66, FINGER], [2.3, 74, 66, FINGER], [2.75, 24, 150, FINGER], [3.15, 24, 150, FINGER], [3.55, 50, 222, FINGER], [5.4, 50, 222, FINGER], [6.2, 74, 66, FINGER]], t);
      const taps = [0.45, 0.7, 0.95, 1.2, 1.45, 1.7, 1.95, 2.8, 3.6].reduce((a, at) => Math.max(a, bump(t, at)), 0);
      return { x, y, s, sq: 0, tap: taps, glyph: 0 };
    }
    case 2: {
      // Бегунок первой полосы, затем прыжок по дуге к перерасходу
      const f0 = fill(t, 0) * 0.8;
      const head = 8 + f0 * 84;
      if (t < 2.5) return { x: head, y: 92, s: 22, sq: 0, tap: 0, glyph: 0 };
      const p = eio(span(t, 2.5, 3.1));
      const y = lerp(92, 272, p) - Math.sin(Math.PI * p) * 70;
      const land = bump(t, 3.05, 0.25);
      return { x: lerp(head, 92, p), y, s: 22, sq: land * 0.3, tap: land, glyph: 0 };
    }
    case 3: {
      const [x, y, s] = along([[0, 64, 170, FINGER], [0.4, 64, 170, FINGER], [1.2, 40, 170, FINGER], [1.6, 74, 170, FINGER], [2.1, 74, 170, FINGER], [3.2, 26, 170, FINGER],
        [3.7, 50, 165, FINGER], [5.6, 50, 165, FINGER], [6.6, 64, 170, FINGER]], t);
      const hold = span(t, 3.9, 4.6);
      return { x, y, s: s * (1 - 0.12 * hold * (t < 4.7 ? 1 : 0)), sq: 0, tap: bump(t, 4.62, 0.3), glyph: 0 };
    }
    case 4: {
      const p = eio(span(t, 0.6, 1.3));
      const [x0, y0] = [20, 92];
      const [x1, y1] = [72, 92];
      if (t < 2.4) return { x: lerp(x0, x1, p), y: lerp(y0, y1, p) - Math.sin(Math.PI * p) * 46, s: 18, sq: 0, tap: bump(t, 1.28, 0.25), glyph: 0 };
      const q = eio(span(t, 2.4, 3.0));
      return { x: lerp(x1, 50, q), y: lerp(y1, 226, q) - Math.sin(Math.PI * q) * 30, s: lerp(18, 44, q), sq: bump(t, 2.98, 0.22) * 0.25, tap: 0, glyph: q };
    }
    default:
      return { x: 50, y: 70, s: 96, sq: 0, tap: 0, glyph: 1 };
  }
}

/** Заполнение полос плана: доля от цели строки */
function fill(t: number, row: number) {
  return eout(span(t, 0.35 + row * 0.38, 1.75 + row * 0.38));
}

const PAGES = [
  { title: 'Монетка', body: 'Личный бюджет, который остаётся у тебя. Без аккаунтов, облака и рекламы — всё хранится только на этом телефоне.' },
  { title: 'Трата — за пару секунд', body: 'Считай прямо в поле: 350+120. Категория подставится сама, а недавние описания — одним тапом.' },
  { title: 'План и факт', body: 'Задай план на месяц — сразу видно, где перерасход. Копилка считается отложенными деньгами, а не тратой.' },
  { title: 'Жесты', body: 'Короткий свайп листает раздел, длинный — вкладку. Зажми операцию, чтобы выбрать несколько.' },
  { title: 'Переезд и копии', body: 'Импорт из Google Таблиц «Месячный бюджет» без дублей. Резервная копия — одной кнопкой в «Ещё».' },
  { title: 'Выбери вид', body: 'Минимализм или стекло, светлая или тёмная тема. Поменять можно когда угодно в «Ещё».' },
] as const;

const TYPED = ['', '3', '35', '350', '350+', '350+1', '350+12', '350+120'];

/** freeze — остановить часы на кадре (step, t): для проверки и съёмки ролика в демо-режиме */
export function Onboarding({ style, onStyle, onDone, freeze }: {
  style: ThemeStyle; onStyle: (s: ThemeStyle) => void; onDone: () => void; freeze?: { step: number; t: number };
}) {
  const [step, setStep] = useState(freeze?.step ?? 0);
  const [now, setNow] = useState(freeze?.t ?? 0);
  const change = useRef({ at: 0, from: coinAt(freeze?.step ?? 0, 0) });
  const still = reducedMotion();

  useEffect(() => {
    if (still || freeze) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (n: number) => { setNow((n - t0) / 1000); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const local = now - change.current.at;
  const lt = still ? STILL[step] : LOOPS[step] ? local % LOOPS[step] : local;
  const go = (next: number) => {
    if (next < 0 || next >= PAGES.length || next === step) return false;
    change.current = { at: now, from: coin };
    haptic();
    setStep(next);
    return true;
  };
  useBack(() => { if (!go(step - 1)) onDone(); });
  const swipe = useSwipe((d) => go(step + d));

  // Перелёт монетки между экранами: из последней точки прошлого экрана в траекторию нового
  const target = coinAt(step, lt);
  const hand = still || freeze || (step === 0 && change.current.at === 0) ? 1 : spring(span(local, 0, 0.7));
  const f = change.current.from;
  const coin: Coin = hand >= 1 ? target : {
    x: lerp(f.x, target.x, hand), y: lerp(f.y, target.y, hand), s: lerp(f.s, target.s, clamp01(hand)),
    sq: target.sq, tap: target.tap, glyph: lerp(f.glyph, target.glyph, clamp01(hand)),
  };
  // Петля гаснет в конце и проявляется в начале, чтобы перезапуск не дёргался
  const L = LOOPS[step];
  const fadeLoop = !L || still ? 1 : Math.min(span(lt, 0, 0.35), 1 - span(lt, L - 0.45, L - 0.05));
  const last = step === PAGES.length - 1;

  return (
    <div class="ob" role="dialog" aria-modal="true" aria-label="Знакомство с приложением" {...swipe}>
      <button class="ob-skip" onClick={onDone}>Пропустить</button>
      <div class="ob-stage" aria-hidden="true">
        <div class="ob-demo" style={{ opacity: fadeLoop }}>
          {step === 0 && <Hero t={lt} />}
          {step === 1 && <Entry t={lt} />}
          {step === 2 && <PlanDemo t={lt} />}
          {step === 3 && <Gestures t={lt} />}
          {step === 4 && <Move t={lt} />}
        </div>
        <CoinView c={coin} fade={step === 5 || step === 0 ? 1 : fadeLoop} />
      </div>
      <div class="ob-text" key={step}>
        <h2 class="ob-title">{PAGES[step].title.split(' ').map((w, i) => <><span style={{ animationDelay: `${i * 70}ms` }}>{w}</span>{' '}</>)}</h2>
        <p class="ob-body">{PAGES[step].body}</p>
        {last && (
          <div class="style-pick ob-styles">
            {([['minimal', 'Минимализм'], ['glass', 'Стекло']] as const).map(([k, l]) => (
              <button class={style === k ? 'style-opt on' : 'style-opt'} aria-pressed={style === k} onClick={() => { haptic(); onStyle(k); }}>
                <span class={`style-prev ${k}`} aria-hidden="true"><i /><i /><i /></span>{l}
              </button>
            ))}
          </div>
        )}
      </div>
      <div class="ob-foot">
        <div class="ob-dots" role="tablist" aria-label="Шаги">
          {PAGES.map((p, i) => <button role="tab" aria-selected={i === step} aria-label={p.title} class={i === step ? 'on' : ''} onClick={() => go(i)} />)}
        </div>
        <button class="btn primary ob-next" onClick={() => (last ? onDone() : go(step + 1))}>{last ? 'Начать' : 'Дальше'}</button>
      </div>
    </div>
  );
}

function CoinView({ c, fade }: { c: Coin; fade: number }) {
  const sx = 1 + c.sq * 0.6, sy = 1 - c.sq;
  return (
    <div class="ob-coin-wrap" style={{ left: `${c.x}%`, top: `${c.y}px`, opacity: fade }}>
      {c.tap > 0 && <i class="ob-ripple" style={{ width: `${c.s}px`, height: `${c.s}px`, transform: `translate(-50%,-50%) scale(${1 + c.tap * 1.4})`, opacity: 0.55 * (1 - c.tap * 0.6) }} />}
      <div class="ob-coin" style={{ width: `${c.s}px`, height: `${c.s}px`, transform: `translate(-50%,-50%) scale(${sx * (1 - c.tap * 0.12)}, ${sy * (1 - c.tap * 0.12)})` }}>
        <span style={{ fontSize: `${c.s * 0.5}px`, opacity: c.glyph }}>₽</span>
      </div>
    </div>
  );
}

function Hero({ t }: { t: number }) {
  return (
    <div class="ob-hero">
      {['без аккаунтов', 'без облака', 'без рекламы'].map((l, i) => {
        const p = spring(span(t, 1.0 + i * 0.18, 1.7 + i * 0.18));
        return <span class="ob-badge" style={{ transform: `translateY(${(1 - p) * 16}px) scale(${0.8 + 0.2 * p})`, opacity: clamp01(p * 1.4) }}><b>✓</b>{l}</span>;
      })}
    </div>
  );
}

function Entry({ t }: { t: number }) {
  // Каждый символ появляется в момент касания пальца-монетки: 0.45, 0.7, … (шаг 0.25 с)
  const typed = TYPED[t < 0.45 ? 0 : Math.min(TYPED.length - 1, 1 + Math.floor((t - 0.45) / 0.25))];
  const calc = span(t, 2.15, 2.45);
  const chip = t >= 2.85;
  const saved = span(t, 3.6, 3.85);
  const row = spring(span(t, 3.9, 4.6));
  return (
    <div class="ob-entry">
      <div class="ob-amount">{typed || '0'}<i class={t > 0.3 && t < 2.2 ? 'ob-caret on' : 'ob-caret'} /> <small>₽</small></div>
      <div class="ob-calc" style={{ opacity: calc, transform: `translateY(${(1 - calc) * 6}px)` }}>= 470 ₽</div>
      <div class="ob-chips">
        {['Питание', 'Транспорт', 'Кафе'].map((c, i) => (
          <span class={chip && i === 0 ? 'chipsel on' : 'chipsel'} style={chip && i === 0 ? { borderColor: '#5B8DEF', background: '#5B8DEF22' } : undefined}>
            <i class="dot" style={{ background: ['#5B8DEF', '#9B51E0', '#F2994A'][i] }} />{c}
          </span>
        ))}
      </div>
      <div class="ob-save" style={{ background: saved > 0 ? 'var(--pos)' : 'var(--accent)', width: `${lerp(60, 44, saved)}%` }}>
        {saved > 0.5 ? '✓ Сохранено' : 'Сохранить'}
      </div>
      <div class="ob-row" style={{ opacity: clamp01(row), transform: `translateY(${(1 - row) * 18}px)` }}>
        <i class="dot" style={{ background: '#5B8DEF' }} /><span>Питание</span><b class="neg">−470 ₽</b>
      </div>
    </div>
  );
}

const PLAN_ROWS = [
  { name: 'Питание', plan: 22000, fact: 17600, ratio: 0.8 },
  { name: 'Транспорт', plan: 2500, fact: 1000, ratio: 0.4 },
  { name: 'Подарки', plan: 3000, fact: 4480, ratio: 1 },
];

function PlanDemo({ t }: { t: number }) {
  return (
    <div class="ob-plan">
      {PLAN_ROWS.map((r, i) => {
        const f = fill(t, i);
        const over = i === 2 && f > 0.98;
        const shown = Math.round((r.fact * f) / 10) * 10;
        return (
          <div class="ob-plan-row">
            <div class="ob-plan-top"><span>{r.name}</span><span class={over ? 'neg' : 'muted'}>{shown.toLocaleString('ru-RU')} / {r.plan.toLocaleString('ru-RU')} ₽</span></div>
            <div class="progress"><div class={over ? 'fill over' : 'fill'} style={{ width: `${f * r.ratio * 100}%`, animation: 'none', transition: 'none' }} /></div>
            {i === 2 && <span class="ob-over" style={{ opacity: span(t, 3.05, 3.3), transform: `scale(${0.8 + 0.2 * spring(span(t, 3.05, 3.6))})` }}>перерасход</span>}
          </div>
        );
      })}
    </div>
  );
}

function Gestures({ t }: { t: number }) {
  const segOn = eio(span(t, 0.95, 1.25));
  const tabP = eio(span(t, 2.75, 3.15));
  const press = span(t, 3.9, 4.6);
  const picked = t >= 4.6 && t < 6.6;
  const label = t < 1.9 ? 'Короткий свайп — раздел' : t < 3.6 ? 'Длинный свайп — вкладка' : 'Зажатие — выбор';
  return (
    <div class="ob-gest">
      <span class="ob-gest-label" key={label}>{label}</span>
      <div class="ob-phone">
        <div class="seg small ob-seg" style={{ '--n': 2, '--i': segOn }}><span class="seg-pill" /><button class={segOn < 0.5 ? 'on' : ''}>Траты</button><button class={segOn >= 0.5 ? 'on' : ''}>Доходы</button></div>
        <div class="ob-screen" style={{ transform: `translateX(${-tabP * 8}%)`, opacity: 1 - Math.sin(Math.PI * tabP) * 0.5 }}>
          {[0, 1, 2].map((i) => (
            <div class={picked && i === 1 ? 'ob-line sel' : 'ob-line'}>
              <i class={i === 1 && (picked || press > 0) ? 'check on' : 'dot'} style={i === 1 && press > 0 && !picked ? { background: `conic-gradient(var(--accent) ${press * 360}deg, transparent 0)` } : { background: ['#5B8DEF', '#27AE60', '#F2994A'][i] }} />
              <span /><b />
            </div>
          ))}
        </div>
        <div class="ob-tabs" style={{ '--i': tabP }}><span class="ob-tab-pill" />{[0, 1, 2, 3].map(() => <i />)}</div>
      </div>
    </div>
  );
}

function Move({ t }: { t: number }) {
  const file = spring(span(t, 3.0, 3.7));
  return (
    <div class="ob-move">
      <div class="ob-sheet">
        <div class="ob-sheet-head">Месячный бюджет</div>
        {[0, 1, 2].map((i) => <div class="ob-sheet-row" style={{ opacity: 1 - eio(span(t, 0.6 + i * 0.4, 1.0 + i * 0.4)) * 0.7 }}><i /><i /><i /></div>)}
      </div>
      <div class="ob-arrow">→</div>
      <div class="ob-list">
        {[0, 1, 2].map((i) => {
          const p = spring(span(t, 1.0 + i * 0.4, 1.6 + i * 0.4));
          return <div class="ob-list-row" style={{ opacity: clamp01(p), transform: `translateX(${(1 - p) * -24}px)` }}><i class="dot" style={{ background: ['#5B8DEF', '#F2994A', '#27AE60'][i] }} /><span /><b /></div>;
        })}
      </div>
      <div class="ob-file" style={{ opacity: clamp01(file), transform: `translate(-50%, ${(1 - file) * 12}px)` }}>
        <span>monetka-backup.json</span><b class="pos">✓</b>
      </div>
    </div>
  );
}

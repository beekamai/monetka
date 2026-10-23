/*
 * Знакомство при первом запуске: семь экранов (язык и валюта + шесть), сквозь которые проходит одна монетка-носитель.
 * Всё движение — чистая функция времени (state = f(t)) от одних часов: без цепочек таймеров, петли детерминированы.
 * Нумерация шагов (и ?obstep= в демо): 0 язык и валюта, 1 обещание, 2 ввод, 3 план, 4 жесты, 5 переезд, 6 вид.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ThemeStyle } from './model.ts';
import { CURRENCIES, LANGS, currencySign, dict, money, num } from './i18n.ts';
import type { Currency, Lang } from './i18n.ts';
import { Seg, haptic, reducedMotion, useBack, useSwipe } from './ui.tsx';
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
const LOOPS = [0, 0, 6.6, 6.2, 7.4, 6.6, 0];
/** Кадр, который показывается при «Убрать анимацию»: самое информативное состояние петли */
const STILL = [3, 3, 4.2, 3, 4.7, 3.4, 3];

function coinAt(step: number, t: number): Coin {
  switch (step) {
    case 0: {
      // Падает сверху, сплющивается о «пол» и встаёт; дальше дышит
      const fall = span(t, 0, 0.55);
      const y = t < 0.55 ? lerp(-90, 100, fall * fall) : 100 - 26 * Math.sin(Math.PI * span(t, 0.55, 0.95)) * (1 - span(t, 0.55, 0.95) * 0.4);
      const sq = bump(t, 0.5, 0.22) * 0.22 + bump(t, 0.93, 0.18) * 0.08;
      return { x: 50, y: t > 1.2 ? 100 + Math.sin((t - 1.2) * 1.6) * 4 : y, s: 96, sq, tap: 0, glyph: 1 };
    }
    case 1:
      return { x: 50, y: 150 + Math.sin(t * 1.6) * 5, s: 128, sq: 0, tap: 0, glyph: 1 };
    case 2: {
      const [x, y, s] = along([[0, 74, 66, FINGER], [2.3, 74, 66, FINGER], [2.75, 24, 150, FINGER], [3.15, 24, 150, FINGER], [3.55, 50, 222, FINGER], [5.4, 50, 222, FINGER], [6.2, 74, 66, FINGER]], t);
      const taps = [0.45, 0.7, 0.95, 1.2, 1.45, 1.7, 1.95, 2.8, 3.6].reduce((a, at) => Math.max(a, bump(t, at)), 0);
      return { x, y, s, sq: 0, tap: taps, glyph: 0 };
    }
    case 3: {
      // Бегунок первой полосы, затем прыжок по дуге к перерасходу
      const f0 = fill(t, 0) * 0.8;
      const head = 8 + f0 * 84;
      if (t < 2.5) return { x: head, y: 92, s: 22, sq: 0, tap: 0, glyph: 0 };
      const p = eio(span(t, 2.5, 3.1));
      const y = lerp(92, 272, p) - Math.sin(Math.PI * p) * 70;
      const land = bump(t, 3.05, 0.25);
      return { x: lerp(head, 92, p), y, s: 22, sq: land * 0.3, tap: land, glyph: 0 };
    }
    case 4: {
      const [x, y, s] = along([[0, 64, 170, FINGER], [0.4, 64, 170, FINGER], [1.2, 40, 170, FINGER], [1.6, 74, 170, FINGER], [2.1, 74, 170, FINGER], [3.2, 26, 170, FINGER],
        [3.7, 50, 165, FINGER], [5.6, 50, 165, FINGER], [6.6, 64, 170, FINGER]], t);
      const hold = span(t, 3.9, 4.6);
      return { x, y, s: s * (1 - 0.12 * hold * (t < 4.7 ? 1 : 0)), sq: 0, tap: bump(t, 4.62, 0.3), glyph: 0 };
    }
    case 5: {
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

const PAGE_COUNT = 7;
const pageKeys = ['locale', 'hero', 'entry', 'plan', 'gest', 'move', 'look'] as const;

const tr = dict({
  ru: {
    locale: 'Язык и валюта', localeBody: 'Это можно поменять позже в «Ещё».', langLabel: 'Язык', curLabel: 'Валюта',
    hero: 'Монетка', heroBody: 'Личный бюджет, который остаётся у тебя. Без аккаунтов, облака и рекламы — всё хранится только на этом телефоне.',
    entry: 'Трата — за пару секунд', entryBody: 'Считай прямо в поле: 350+120. Категория подставится сама, а недавние описания — одним тапом.',
    plan: 'План и факт', planBody: 'Задай план на месяц — сразу видно, где перерасход. Копилка считается отложенными деньгами, а не тратой.',
    gest: 'Жесты', gestBody: 'Короткий свайп листает раздел, длинный — вкладку. Зажми операцию, чтобы выбрать несколько.',
    move: 'Переезд и копии', moveBody: 'Импорт из Google Таблиц «Месячный бюджет» без дублей. Резервная копия — одной кнопкой в «Ещё».',
    look: 'Выбери вид', lookBody: 'Минимализм или стекло, светлая или тёмная тема. Поменять можно когда угодно в «Ещё».',
    aria: 'Знакомство с приложением', skip: 'Пропустить', steps: 'Шаги', next: 'Дальше', start: 'Начать',
    minimal: 'Минимализм', glass: 'Стекло',
    noAccounts: 'без аккаунтов', noCloud: 'без облака', noAds: 'без рекламы',
    food: 'Питание', transport: 'Транспорт', cafe: 'Кафе', gifts: 'Подарки', saveBtn: 'Сохранить', saved: '✓ Сохранено', over: 'перерасход',
    swipeShort: 'Короткий свайп — раздел', swipeLong: 'Длинный свайп — вкладка', hold: 'Зажатие — выбор',
    expenses: 'Траты', incomes: 'Доходы', sheet: 'Месячный бюджет',
  },
  uk: {
    locale: 'Мова і валюта', localeBody: 'Це можна змінити пізніше в розділі «Ще».', langLabel: 'Мова', curLabel: 'Валюта',
    hero: 'Монетка', heroBody: 'Особистий бюджет, який залишається в тебе. Без акаунтів, хмари та реклами — усе зберігається лише на цьому телефоні.',
    entry: 'Витрата — за пару секунд', entryBody: 'Рахуй прямо в полі: 350+120. Категорія підставиться сама, а нещодавні описи — одним дотиком.',
    plan: 'План і факт', planBody: 'Задай план на місяць — одразу видно, де перевитрата. Скарбничка — це відкладені гроші, а не витрата.',
    gest: 'Жести', gestBody: 'Короткий свайп гортає розділ, довгий — вкладку. Утримуй операцію, щоб вибрати кілька.',
    move: 'Переїзд і копії', moveBody: 'Імпорт із російськомовного шаблону Google Таблиць «Месячный бюджет» без дублів. Резервна копія — однією кнопкою в «Ще».',
    look: 'Обери вигляд', lookBody: 'Мінімалізм або скло, світла чи темна тема. Змінити можна будь-коли в «Ще».',
    aria: 'Знайомство із застосунком', skip: 'Пропустити', steps: 'Кроки', next: 'Далі', start: 'Почати',
    minimal: 'Мінімалізм', glass: 'Скло',
    noAccounts: 'без акаунтів', noCloud: 'без хмари', noAds: 'без реклами',
    food: 'Харчування', transport: 'Транспорт', cafe: 'Кафе', gifts: 'Подарунки', saveBtn: 'Зберегти', saved: '✓ Збережено', over: 'перевитрата',
    swipeShort: 'Короткий свайп — розділ', swipeLong: 'Довгий свайп — вкладка', hold: 'Утримання — вибір',
    expenses: 'Витрати', incomes: 'Доходи', sheet: 'Місячний бюджет',
  },
  en: {
    locale: 'Language and currency', localeBody: 'You can change this later in “More”.', langLabel: 'Language', curLabel: 'Currency',
    hero: 'Monetka', heroBody: 'A personal budget that stays yours. No accounts, no cloud, no ads — everything is stored only on this phone.',
    entry: 'Log a purchase in seconds', entryBody: 'Do the math right in the field: 350+120. The category fills in by itself, and recent notes are one tap away.',
    plan: 'Plan vs. actual', planBody: 'Set a monthly plan and see right away where you overspent. Savings count as money set aside, not spending.',
    gest: 'Gestures', gestBody: 'A short swipe switches sections, a long one switches tabs. Press and hold a transaction to select several.',
    move: 'Moving and backups', moveBody: 'Import from the Russian-language Google Sheets template “Месячный бюджет” without duplicates. A backup is one button away in “More”.',
    look: 'Pick a look', lookBody: 'Minimal or glass, light or dark theme. You can change it any time in “More”.',
    aria: 'App introduction', skip: 'Skip', steps: 'Steps', next: 'Next', start: 'Get started',
    minimal: 'Minimal', glass: 'Glass',
    noAccounts: 'no accounts', noCloud: 'no cloud', noAds: 'no ads',
    food: 'Food', transport: 'Transport', cafe: 'Cafe', gifts: 'Gifts', saveBtn: 'Save', saved: '✓ Saved', over: 'over budget',
    swipeShort: 'Short swipe — section', swipeLong: 'Long swipe — tab', hold: 'Press and hold — select',
    expenses: 'Spending', incomes: 'Income', sheet: 'Monthly budget',
  },
});

const TYPED = ['', '3', '35', '350', '350+', '350+1', '350+12', '350+120'];

/** freeze — остановить часы на кадре (step, t): для проверки и съёмки ролика в демо-режиме */
export function Onboarding({ style, onStyle, onDone, freeze, lang, currency, onLocale }: {
  style: ThemeStyle; onStyle: (s: ThemeStyle) => void; onDone: () => void; freeze?: { step: number; t: number };
  lang: Lang; currency: Currency; onLocale: (l: Lang, c: Currency) => void;
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
    if (next < 0 || next >= PAGE_COUNT || next === step) return false;
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
  const last = step === PAGE_COUNT - 1;
  const key = pageKeys[step];

  return (
    <div class="ob" role="dialog" aria-modal="true" aria-label={tr('aria')} {...swipe}>
      <button class="ob-skip" onClick={onDone}>{tr('skip')}</button>
      <div class={step === 0 ? 'ob-stage compact' : 'ob-stage'} aria-hidden="true">
        <div class="ob-demo" style={{ opacity: fadeLoop }}>
          {step === 1 && <Hero t={lt} />}
          {step === 2 && <Entry t={lt} />}
          {step === 3 && <PlanDemo t={lt} />}
          {step === 4 && <Gestures t={lt} />}
          {step === 5 && <Move t={lt} />}
        </div>
        <CoinView sign={currencySign(currency)} c={coin} fade={step === 6 || step <= 1 ? 1 : fadeLoop} />
      </div>
      <div class="ob-text" key={step}>
        <h2 class="ob-title">{tr(key).split(' ').map((w, i) => <><span style={{ animationDelay: `${i * 70}ms` }}>{w}</span>{' '}</>)}</h2>
        {step === 0 ? (
          <div class="ob-picks">
            <div class="ob-pick"><span class="ob-pick-lbl">{tr('langLabel')}</span><Seg value={lang} options={LANGS} onChange={(l) => onLocale(l, currency)} /></div>
            <div class="ob-pick"><span class="ob-pick-lbl">{tr('curLabel')}</span>
              <Seg value={currency} options={CURRENCIES.map((c) => [c, `${currencySign(c)} ${c}`] as const)} onChange={(c) => onLocale(lang, c)} />
            </div>
            <p class="ob-body ob-hint">{tr('localeBody')}</p>
          </div>
        ) : <p class="ob-body">{tr(`${key}Body` as 'heroBody')}</p>}
        {last && (
          <div class="style-pick ob-styles">
            {([['minimal', tr('minimal')], ['glass', tr('glass')]] as const).map(([k, l]) => (
              <button class={style === k ? 'style-opt on' : 'style-opt'} aria-pressed={style === k} onClick={() => { haptic(); onStyle(k); }}>
                <span class={`style-prev ${k}`} aria-hidden="true"><i /><i /><i /></span>{l}
              </button>
            ))}
          </div>
        )}
      </div>
      <div class="ob-foot">
        <div class="ob-dots" role="tablist" aria-label={tr('steps')}>
          {pageKeys.map((k, i) => <button role="tab" aria-selected={i === step} aria-label={tr(k)} class={i === step ? 'on' : ''} onClick={() => go(i)} />)}
        </div>
        <button class="btn primary ob-next" onClick={() => (last ? onDone() : go(step + 1))}>{last ? tr('start') : tr('next')}</button>
      </div>
    </div>
  );
}

function CoinView({ c, fade, sign }: { c: Coin; fade: number; sign: string }) {
  const sx = 1 + c.sq * 0.6, sy = 1 - c.sq;
  return (
    <div class="ob-coin-wrap" style={{ left: `${c.x}%`, top: `${c.y}px`, opacity: fade }}>
      {c.tap > 0 && <i class="ob-ripple" style={{ width: `${c.s}px`, height: `${c.s}px`, transform: `translate(-50%,-50%) scale(${1 + c.tap * 1.4})`, opacity: 0.55 * (1 - c.tap * 0.6) }} />}
      <div class="ob-coin" style={{ width: `${c.s}px`, height: `${c.s}px`, transform: `translate(-50%,-50%) scale(${sx * (1 - c.tap * 0.12)}, ${sy * (1 - c.tap * 0.12)})` }}>
        <span style={{ fontSize: `${c.s * 0.5}px`, opacity: c.glyph }}>{sign}</span>
      </div>
    </div>
  );
}

function Hero({ t }: { t: number }) {
  return (
    <div class="ob-hero">
      {[tr('noAccounts'), tr('noCloud'), tr('noAds')].map((l, i) => {
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
      <div class="ob-amount">{typed || '0'}<i class={t > 0.3 && t < 2.2 ? 'ob-caret on' : 'ob-caret'} /> <small>{currencySign()}</small></div>
      <div class="ob-calc" style={{ opacity: calc, transform: `translateY(${(1 - calc) * 6}px)` }}>{`= ${money(470)}`}</div>
      <div class="ob-chips">
        {[tr('food'), tr('transport'), tr('cafe')].map((c, i) => (
          <span class={chip && i === 0 ? 'chipsel on' : 'chipsel'} style={chip && i === 0 ? { borderColor: '#5B8DEF', background: '#5B8DEF22' } : undefined}>
            <i class="dot" style={{ background: ['#5B8DEF', '#9B51E0', '#F2994A'][i] }} />{c}
          </span>
        ))}
      </div>
      <div class="ob-save" style={{ background: saved > 0 ? 'var(--pos)' : 'var(--accent)', width: `${lerp(60, 44, saved)}%` }}>
        {saved > 0.5 ? tr('saved') : tr('saveBtn')}
      </div>
      <div class="ob-row" style={{ opacity: clamp01(row), transform: `translateY(${(1 - row) * 18}px)` }}>
        <i class="dot" style={{ background: '#5B8DEF' }} /><span>{tr('food')}</span><b class="neg">{money(-470)}</b>
      </div>
    </div>
  );
}

const PLAN_ROWS = [
  { name: 'food', plan: 22000, fact: 17600, ratio: 0.8 },
  { name: 'transport', plan: 2500, fact: 1000, ratio: 0.4 },
  { name: 'gifts', plan: 3000, fact: 4480, ratio: 1 },
] as const;

function PlanDemo({ t }: { t: number }) {
  return (
    <div class="ob-plan">
      {PLAN_ROWS.map((r, i) => {
        const f = fill(t, i);
        const over = i === 2 && f > 0.98;
        const shown = Math.round((r.fact * f) / 10) * 10;
        return (
          <div class="ob-plan-row">
            <div class="ob-plan-top"><span>{tr(r.name)}</span><span class={over ? 'neg' : 'muted'}>{num(shown)} / {money(r.plan)}</span></div>
            <div class="progress"><div class={over ? 'fill over' : 'fill'} style={{ width: `${f * r.ratio * 100}%`, animation: 'none', transition: 'none' }} /></div>
            {i === 2 && <span class="ob-over" style={{ opacity: span(t, 3.05, 3.3), transform: `scale(${0.8 + 0.2 * spring(span(t, 3.05, 3.6))})` }}>{tr('over')}</span>}
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
  const label = t < 1.9 ? tr('swipeShort') : t < 3.6 ? tr('swipeLong') : tr('hold');
  return (
    <div class="ob-gest">
      <span class="ob-gest-label" key={label}>{label}</span>
      <div class="ob-phone">
        <div class="seg small ob-seg" style={{ '--n': 2, '--i': segOn }}><span class="seg-pill" /><button class={segOn < 0.5 ? 'on' : ''}>{tr('expenses')}</button><button class={segOn >= 0.5 ? 'on' : ''}>{tr('incomes')}</button></div>
        <div class="ob-screen" style={{ transform: `translateX(${-tabP * 8}%)`, opacity: 1 - Math.sin(Math.PI * tabP) * 0.5 }}>
          {[0, 1, 2].map((i) => (
            <div class={picked && i === 1 ? 'ob-line sel' : 'ob-line'}>
              <i class={i === 1 && (picked || press > 0) ? 'selmark on' : 'dot'} style={i === 1 && press > 0 && !picked ? { background: `conic-gradient(var(--accent) ${press * 360}deg, transparent 0)` } : { background: ['#5B8DEF', '#27AE60', '#F2994A'][i] }} />
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
        <div class="ob-sheet-head">{tr('sheet')}</div>
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

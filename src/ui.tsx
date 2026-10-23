/* Общие UI-примитивы: жесты, кнопка «назад», сегменты, шторки, анимированные суммы, тактильный отклик */
import type { ComponentChildren } from 'preact';
import { render } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { dict, money } from './i18n.ts';

const t = dict({
  ru: { plus: 'Плюс', minus: 'Минус', close: 'Закрыть' },
  uk: { plus: 'Плюс', minus: 'Мінус', close: 'Закрити' },
  en: { plus: 'Plus', minus: 'Minus', close: 'Close' },
});

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function haptic(strong = false) {
  if (!Capacitor.isNativePlatform()) return;
  Haptics.impact({ style: strong ? ImpactStyle.Medium : ImpactStyle.Light }).catch(() => undefined);
}

/* Стек обработчиков «назад»: верхний — самая свежая открытая шторка */
const backStack: (() => void)[] = [];

export function useBack(handler: () => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const h = () => ref.current();
    backStack.push(h);
    return () => { const i = backStack.lastIndexOf(h); if (i >= 0) backStack.splice(i, 1); };
  }, []);
}

/** true — «назад» поглощён открытой шторкой */
export function popBack(): boolean {
  const h = backStack[backStack.length - 1];
  if (!h) return false;
  h();
  return true;
}

const EDGE = 24;

/** Граница длинного свайпа: длиннее — между вкладками, короче — внутри раздела */
export const longSwipe = () => Math.max(140, innerWidth * 0.38);

type Handled = TouchEvent & { swipeHandled?: boolean };

/**
 * Горизонтальный свайп пальцем. dir = 1 — листаем вперёд (палец влево).
 * Не срабатывает в полях ввода и у самого края экрана, где живёт системный жест «назад».
 * short — зона раздела (переключатель, карточка): ловит только короткие свайпы, длинные уходят вкладкам.
 * Без short — вкладки: длинный свайп всегда, короткий — только если касание началось вне зон разделов.
 * Одно касание обрабатывает одна зона: самая глубокая, которая его взяла.
 */
export function useSwipe(onSwipe: (dir: 1 | -1) => boolean | void, opts: { short?: boolean; onDrag?: (dx: number | null) => void } = {}) {
  const st = useRef<{ x: number; y: number; t: number; lock: 'h' | 'v' | null; inShort: boolean } | null>(null);
  const end = (e: Handled | null, x: number | null) => {
    const s = st.current;
    st.current = null;
    if (!s || s.lock !== 'h') return;
    opts.onDrag?.(null);
    if (x == null || !e || e.swipeHandled) return;
    const dx = x - s.x, a = Math.abs(dx), v = a / Math.max(1, Date.now() - s.t);
    const long = a >= longSwipe(), short = !long && (a > 36 || (a > 24 && v > 0.45));
    const take = opts.short ? short : long || (short && !s.inShort);
    if (take && onSwipe(dx < 0 ? 1 : -1) !== false) e.swipeHandled = true;
  };
  return {
    'data-swipe-short': opts.short ? '' : undefined,
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0];
      const el = e.target as Element | null;
      if (e.touches.length > 1 || el?.closest('input, textarea, select, [data-noswipe]') ||
        t.clientX < EDGE || t.clientX > innerWidth - EDGE) {
        if (st.current?.lock === 'h') opts.onDrag?.(null);
        st.current = null;
        return;
      }
      st.current = { x: t.clientX, y: t.clientY, t: Date.now(), lock: null, inShort: !!el?.closest('[data-swipe-short]') };
    },
    onTouchMove: (e: TouchEvent) => {
      const s = st.current;
      if (!s) return;
      const t = e.touches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
      if (!s.lock) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        s.lock = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'h' : 'v';
      }
      if (s.lock !== 'h' || !opts.onDrag) return;
      // Внутри раздела вкладка начинает тянуться, только когда свайп перерос короткий
      const lead = s.inShort ? Math.max(0, Math.abs(dx) - longSwipe() * 0.6) * Math.sign(dx) : dx;
      opts.onDrag(lead);
    },
    onTouchEnd: (e: TouchEvent) => end(e as Handled, e.changedTouches[0]?.clientX ?? null),
    onTouchCancel: () => end(null, null),
  };
}

/** Область раздела: короткий свайп по ней листает соседний раздел */
export function SwipeArea({ onSwipe, class: cls, children }: { onSwipe: (dir: 1 | -1) => boolean | void; class?: string; children: ComponentChildren }) {
  const swipe = useSwipe(onSwipe, { short: true });
  return <div class={cls ? `swipe-area ${cls}` : 'swipe-area'} {...swipe}>{children}</div>;
}

/** Кнопки «+» и «−» для полей с выражениями: на цифровой клавиатуре Android знака плюс нет.
 *  preventDefault на mousedown оставляет фокус в поле — клавиатура не закрывается. */
export function CalcKeys({ input, minus = true }: { input: { current: HTMLInputElement | null }; minus?: boolean }) {
  const put = (op: string) => {
    const el = input.current;
    if (!el) return;
    const a = el.selectionStart ?? el.value.length, b = el.selectionEnd ?? a;
    el.focus();
    el.setSelectionRange(a, b);
    // insertText — настоящий ввод: без него браузер не пришлёт change на blur, и правка плана не сохранится
    if (!document.execCommand('insertText', false, op)) {
      el.value = el.value.slice(0, a) + op + el.value.slice(b);
      el.setSelectionRange(a + 1, a + 1);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    haptic();
  };
  return (
    <span class="calc-keys" data-noswipe>
      {(minus ? ['+', '−'] : ['+']).map((op) => (
        <button type="button" aria-label={op === '+' ? t('plus') : t('minus')} onMouseDown={(e) => e.preventDefault()} onClick={() => put(op)}>{op}</button>
      ))}
    </span>
  );
}

/** Соседний пункт списка вариантов по направлению свайпа; false — край, листать некуда */
export function stepOption<T extends string>(options: readonly (readonly [T, string])[], value: T, dir: 1 | -1, set: (v: T) => void): boolean {
  const n = options[options.findIndex(([k]) => k === value) + dir];
  if (!n) return false;
  haptic();
  set(n[0]);
  return true;
}

export function Seg<T extends string>({ value, options, onChange, small }: {
  value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; small?: boolean;
}) {
  const i = Math.max(0, options.findIndex(([k]) => k === value));
  const pick = (k: T) => { if (k !== value) { haptic(); onChange(k); } };
  const swipe = useSwipe((dir) => stepOption(options, value, dir, onChange), { short: true });
  return (
    <div class={small ? 'seg small' : 'seg'} role="tablist" style={{ '--n': options.length, '--i': i }} {...swipe}>
      <span class="seg-pill" aria-hidden="true" />
      {options.map(([k, l]) => (
        <button role="tab" aria-selected={k === value} class={k === value ? 'on' : ''} onClick={() => pick(k)}>{l}</button>
      ))}
    </div>
  );
}

/** Шторка снизу: закрывается крестиком, тапом мимо, «назад», Esc и свайпом вниз за шапку */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  const [closing, setClosing] = useState(false);
  const [dy, setDy] = useState(0);
  const drag = useRef<number | null>(null);
  const close = () => {
    if (closing || reducedMotion()) return onClose();
    setClosing(true);
    setTimeout(onClose, 180);
  };
  useBack(close);
  const head = {
    onTouchStart: (e: TouchEvent) => { drag.current = e.touches[0].clientY; },
    onTouchMove: (e: TouchEvent) => { if (drag.current != null) setDy(Math.max(0, e.touches[0].clientY - drag.current)); },
    onTouchEnd: () => { drag.current = null; if (dy > 90) close(); else setDy(0); },
    onTouchCancel: () => { drag.current = null; setDy(0); },
  };
  return (
    <Portal>
    <div class={closing ? 'overlay closing' : 'overlay'} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div class={closing ? 'sheet closing' : 'sheet'} role="dialog" aria-modal="true" aria-label={title}
        style={dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined}>
        <div class="sheet-drag" {...head}>
          <div class="grab" />
          <div class="sheet-head"><h3>{title}</h3><button class="icon-btn" aria-label={t('close')} onClick={close}>✕</button></div>
        </div>
        {children}
      </div>
    </div>
    </Portal>
  );
}

/**
 * Рендер в отдельный узел body: transform у анимируемого предка иначе привязал бы position: fixed к нему.
 * Свой, а не createPortal из preact/compat: compat глобально превращает onChange полей в onInput.
 */
export function Portal({ children }: { children: ComponentChildren }) {
  const host = useMemo(() => document.createElement('div'), []);
  useLayoutEffect(() => {
    document.body.appendChild(host);
    return () => { render(null, host); host.remove(); };
  }, []);
  useLayoutEffect(() => { render(<>{children}</>, host); });
  return null;
}

const lensMap = (dir: 'h' | 'v') => {
  const [hi, mid, lo] = dir === 'h' ? ['#f00', '#800000', '#000'] : ['#0f0', '#008000', '#000'];
  const xy = dir === 'h' ? "x2='1' y2='0'" : "x2='0' y2='1'";
  return 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' preserveAspectRatio='none'><defs><linearGradient id='g' ${xy}>` +
    `<stop offset='0' stop-color='${hi}'/><stop offset='.2' stop-color='${mid}'/><stop offset='.8' stop-color='${mid}'/><stop offset='1' stop-color='${lo}'/>` +
    `</linearGradient></defs><rect width='100' height='100' fill='url(#g)'/></svg>`);
};

/**
 * Фильтр «жидкого стекла» для backdrop-filter: url(#lens). Карта смещения нейтральна (0.5) в середине и растёт
 * к краям, поэтому фон под краем пилюли преломляется как в линзе. Красный канал — сдвиг по X, зелёный — по Y.
 */
export function GlassDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <filter id="lens" x="0" y="0" width="1" height="1" primitiveUnits="objectBoundingBox" color-interpolation-filters="sRGB">
        <feImage href={lensMap('h')} x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="h" />
        <feImage href={lensMap('v')} x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="v" />
        <feComposite in="h" in2="v" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="map" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale="0.08" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}

/** Сумма, которая докручивается до нового значения */
export function Money({ value, class: cls }: { value: number; class?: string }) {
  const [shown, setShown] = useState(value);
  const cur = useRef(value);
  useEffect(() => {
    const a = cur.current, b = value;
    if (a === b || reducedMotion()) { cur.current = b; setShown(b); return; }
    const t0 = performance.now(), dur = 520;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur), k = 1 - Math.pow(1 - p, 3);
      cur.current = a + (b - a) * k;
      // Если итог целый, промежуточные кадры тоже целые: иначе на полсекунды мигают копейки
      setShown(p < 1 && Number.isInteger(b) ? Math.round(cur.current) : cur.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span class={cls}>{money(shown)}</span>;
}

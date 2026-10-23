/* Общие UI-примитивы: жесты, кнопка «назад», сегменты, шторки, анимированные суммы, тактильный отклик */
import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { rub } from './model.ts';

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

/**
 * Горизонтальный свайп пальцем. dir = 1 — листаем вперёд (палец влево).
 * Не срабатывает в полях ввода и у самого края экрана, где живёт системный жест «назад».
 * stop — не отдавать касание родителю (вложенный свайп: сегмент внутри листаемой вкладки).
 */
export function useSwipe(onSwipe: (dir: 1 | -1) => void, onDrag?: (dx: number | null) => void, stop = false) {
  const st = useRef<{ x: number; y: number; t: number; lock: 'h' | 'v' | null } | null>(null);
  const end = (x: number | null) => {
    const s = st.current;
    st.current = null;
    if (!s || s.lock !== 'h') return;
    onDrag?.(null);
    if (x == null) return;
    const dx = x - s.x, v = Math.abs(dx) / Math.max(1, Date.now() - s.t);
    if (Math.abs(dx) > 70 || (Math.abs(dx) > 30 && v > 0.45)) onSwipe(dx < 0 ? 1 : -1);
  };
  return {
    onTouchStart: (e: TouchEvent) => {
      if (stop) e.stopPropagation();
      const t = e.touches[0];
      const el = e.target as Element | null;
      if (e.touches.length > 1 || el?.closest('input, textarea, select, [data-noswipe]') ||
        t.clientX < EDGE || t.clientX > innerWidth - EDGE) {
        if (st.current?.lock === 'h') onDrag?.(null);
        st.current = null;
        return;
      }
      st.current = { x: t.clientX, y: t.clientY, t: Date.now(), lock: null };
    },
    onTouchMove: (e: TouchEvent) => {
      const s = st.current;
      if (!s) return;
      const t = e.touches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
      if (!s.lock) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        s.lock = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'h' : 'v';
      }
      if (s.lock === 'h') onDrag?.(dx);
    },
    onTouchEnd: (e: TouchEvent) => end(e.changedTouches[0]?.clientX ?? null),
    onTouchCancel: () => end(null),
  };
}

export function Seg<T extends string>({ value, options, onChange, small }: {
  value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; small?: boolean;
}) {
  const i = Math.max(0, options.findIndex(([k]) => k === value));
  const pick = (k: T) => { if (k !== value) { haptic(); onChange(k); } };
  const swipe = useSwipe((dir) => { const n = options[i + dir]; if (n) pick(n[0]); }, undefined, true);
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
  // Портал в body: transform у анимируемого предка иначе привязал бы position: fixed к нему, а не к экрану
  return createPortal(
    <div class={closing ? 'overlay closing' : 'overlay'} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div class={closing ? 'sheet closing' : 'sheet'} role="dialog" aria-modal="true" aria-label={title}
        style={dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined}>
        <div class="sheet-drag" {...head}>
          <div class="grab" />
          <div class="sheet-head"><h3>{title}</h3><button class="icon-btn" aria-label="Закрыть" onClick={close}>✕</button></div>
        </div>
        {children}
      </div>
    </div>,
    document.body,
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
      setShown(cur.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span class={cls}>{rub(shown)}</span>;
}

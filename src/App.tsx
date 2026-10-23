import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { Category, Kind, State, ThemeMode, ThemeStyle, Tx } from './model.ts';
import { PALETTE, monthKey, monthTitle, normalizeReport, parseExpr, parseSigned, rub, shiftDay, shiftMonth, signedRub, todayISO, uid } from './model.ts';
import type { CatRow } from './calc.ts';
import { monthTrend, planFor, summarize } from './calc.ts';
import {
  beforeRestore, createSaver, dropBeforeRestore, dropBroken, exportBroken, hasBroken, load, pickFile, saveBeforeRestore, saveFile,
} from './storage.ts';
import { exportMonth, importWorkbook } from './xlsxio.ts';
import { Onboarding } from './onboarding.tsx';
import { DayBars, Donut, Progress, TrendChart } from './charts.tsx';
import { CalcKeys, GlassDefs, Money, Portal, Seg, Sheet, SwipeArea, haptic, popBack, reducedMotion, stepOption, useBack, useSwipe } from './ui.tsx';

type Tab = 'overview' | 'ops' | 'plan' | 'more';
const TABS: readonly Tab[] = ['overview', 'ops', 'plan', 'more'];

/** undo — состояние до действия, after — сразу после: отмена разрешена, только пока база не менялась */
interface Toast { id: number; text: string; undo?: State; after?: State }
type Update = (fn: (d: State) => void, undoText?: string) => void;
type Replace = (next: State, undoText?: string) => void;
type Notify = (text: string) => void;

export function App() {
  const [s, setS] = useState<State | null>(null);
  const sRef = useRef<State | null>(null);
  const [month, setMonth] = useState(monthKey(todayISO()));
  const [tab, setTab] = useState<Tab>('overview');
  const [dir, setDir] = useState<1 | -1>(1);
  const [monthDir, setMonthDir] = useState<1 | -1 | 0>(0);
  /** Переход из напоминания: «Ещё» прокручивает к резервной копии и подсвечивает кнопку */
  const spotBackup = useRef(false);
  const [editing, setEditing] = useState<Tx | 'new-expense' | 'new-income' | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [notice, setNotice] = useState<string>();
  const persist = useRef(true);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const mainRef = useRef<HTMLElement>(null);

  const notify: Notify = (text) => setToast({ id: Date.now(), text });
  const saver = useRef<ReturnType<typeof createSaver> | null>(null);
  const flush = () => {
    if (sRef.current && persist.current) saver.current?.save(sRef.current);
    return saver.current?.flush();
  };

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const demo = !Capacitor.isNativePlatform() && q.has('demo');
    const boot = demo
      ? import('./demo.ts').then(({ demoState }) => {
        const st = demoState();
        if (q.get('style') === 'glass') st.style = 'glass';
        if (q.get('theme') === 'dark' || q.get('theme') === 'light') st.theme = q.get('theme') as ThemeMode;
        const t = q.get('tab') as Tab | null;
        if (t && TABS.includes(t)) setTab(t);
        if (q.has('onboarding')) st.onboarded = false;
        return { state: st, seq: 0, persist: false, notice: undefined };
      })
      : load();
    boot.then((r) => {
      persist.current = r.persist;
      saver.current = createSaver(r.seq, () => notify('Не удалось сохранить данные. Проверь свободное место на телефоне.'));
      sRef.current = r.state;
      setS(r.state);
      setNotice(r.notice);
    });
  }, []);
  useEffect(() => { if (s && persist.current) saver.current?.save(s); }, [s]);
  useEffect(() => {
    const onHide = () => { void flush(); };
    const onVis = () => { if (document.visibilityState === 'hidden') onHide(); };
    document.addEventListener('visibilitychange', onVis);
    addEventListener('pagehide', onHide);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') popBack(); };
    addEventListener('keydown', onKey);
    const subs = Capacitor.isNativePlatform() ? [
      CapApp.addListener('pause', onHide),
      CapApp.addListener('backButton', () => {
        if (popBack()) return;
        if (tabRef.current !== 'overview') goTab('overview');
        else void Promise.resolve(flush()).finally(() => CapApp.exitApp());
      }),
    ] : [];
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      removeEventListener('pagehide', onHide);
      removeEventListener('keydown', onKey);
      subs.forEach((p) => p.then((h) => h.remove()));
    };
  }, []);

  const mode = s?.theme, style = s?.style;
  useEffect(() => {
    if (!mode) return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = mode === 'dark' || (mode === 'auto' && mq.matches);
      const root = document.documentElement;
      root.dataset.theme = dark ? 'dark' : 'light';
      root.dataset.style = style ?? 'minimal';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim());
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [mode, style]);
  useEffect(() => {
    if (style !== 'glass') return;
    const root = document.documentElement;
    let idle = 0;
    const onScroll = () => {
      if (!idle) root.dataset.scrolling = '';
      clearTimeout(idle);
      idle = window.setTimeout(() => { idle = 0; delete root.dataset.scrolling; }, 180);
    };
    addEventListener('scroll', onScroll, { passive: true });
    return () => { removeEventListener('scroll', onScroll); clearTimeout(idle); delete root.dataset.scrolling; };
  }, [style]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 5000 : 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const m = useMemo(() => (s ? summarize(s, month) : null), [s, month]);

  const goTab = (t: Tab) => {
    const cur = TABS.indexOf(tabRef.current), next = TABS.indexOf(t);
    if (cur === next) return;
    setDir(next > cur ? 1 : -1);
    setTab(t);
    haptic();
    scrollTo({ top: 0 });
  };
  const goMonth = (delta: number) => {
    setMonthDir(delta > 0 ? 1 : delta < 0 ? -1 : 0);
    setMonth((k) => (delta === 0 ? monthKey(todayISO()) : shiftMonth(k, delta)));
    haptic();
  };
  const dragContent = (dx: number | null) => {
    const el = mainRef.current;
    if (!el) return;
    if (dx == null) { el.style.transition = ''; el.style.transform = ''; return; }
    const i = TABS.indexOf(tabRef.current);
    const edge = (dx > 0 && i === 0) || (dx < 0 && i === TABS.length - 1);
    el.style.transition = 'none';
    el.style.transform = `translateX(${dx * (edge ? 0.12 : 0.35)}px)`;
  };
  const swipeTabs = useSwipe((d) => { const t = TABS[TABS.indexOf(tabRef.current) + d]; if (!t) return false; goTab(t); }, { onDrag: dragContent });
  const swipeMonth = useSwipe((d) => { goMonth(d); });

  if (!s || !m) return <div class="splash" />;

  const replace: Replace = (next, undoText) => {
    const prev = sRef.current!;
    sRef.current = next;
    setS(next);
    if (undoText) setToast({ id: Date.now(), text: undoText, undo: prev, after: next });
    else setToast((t) => (t?.undo ? null : t));
  };
  const update: Update = (fn, undoText) => {
    const d = structuredClone(sRef.current!);
    fn(d);
    replace(d, undoText);
  };
  const undo = () => {
    if (!toast?.undo) return;
    if (sRef.current !== toast.after) { setToast({ id: Date.now(), text: 'Уже были другие изменения — отменить нельзя' }); return; }
    sRef.current = toast.undo;
    setS(toast.undo);
    setToast({ id: Date.now(), text: 'Отменено' });
    haptic();
  };

  const isCurrent = month === monthKey(todayISO());
  const dq = Capacitor.isNativePlatform() ? null : new URLSearchParams(location.search);
  const obFreeze = dq?.has('demo') && dq.has('obstep') ? { step: Number(dq.get('obstep')), t: Number(dq.get('obt') ?? 3) } : undefined;

  return (
    <div class="app">
      {s.style === 'glass' && <GlassDefs />}
      <header class="top" {...swipeMonth}>
        <button class="icon-btn" aria-label="Предыдущий месяц" onClick={() => goMonth(-1)}>‹</button>
        <button class="month" aria-label={isCurrent ? monthTitle(month) : `${monthTitle(month)}, вернуться к текущему`} onClick={() => goMonth(0)}>
          <span key={month} class={monthDir > 0 ? 'm-in next' : monthDir < 0 ? 'm-in prev' : 'm-in'}>{monthTitle(month)}</span>
          {!isCurrent && <i class="today-dot" aria-hidden="true" />}
        </button>
        <button class="icon-btn" aria-label="Следующий месяц" onClick={() => goMonth(1)}>›</button>
      </header>

      <main ref={mainRef} class="content-wrap" {...swipeTabs}>
        <div key={tab} class={dir > 0 ? 'content enter-next' : 'content enter-prev'}>
          {notice && (
            <section class="card notice">
              <span>{notice}</span>
              <button class="link" onClick={() => setNotice(undefined)}>Понятно</button>
            </section>
          )}
          {tab === 'overview' && <Overview s={s} m={m} month={month} onEdit={setEditing}
            onBackup={() => { spotBackup.current = true; goTab('more'); }}
            onSnooze={() => { update((d) => { d.backupSnooze = shiftDay(todayISO(), 14); }); notify('Напомню через две недели'); }} />}
          {tab === 'ops' && <Ops s={s} m={m} onEdit={setEditing} update={update} />}
          {tab === 'plan' && <Plan s={s} m={m} month={month} update={update} notify={notify} />}
          {tab === 'more' && <More s={s} m={m} month={month} readOnly={!persist.current} current={() => sRef.current!} update={update} replace={replace} notify={notify}
            takeSpot={() => { const v = spotBackup.current; spotBackup.current = false; return v; }} />}
        </div>
      </main>

      {(tab === 'overview' || tab === 'ops') && (
        <div class="fabs">
          <button class="fab income" onClick={() => { haptic(); setEditing('new-income'); }}>+ Доход</button>
          <button class="fab expense" onClick={() => { haptic(); setEditing('new-expense'); }}>+ Расход</button>
        </div>
      )}

      <nav class="tabs" style={{ '--i': TABS.indexOf(tab) }}>
        <span class="tab-pill" aria-hidden="true" />
        {([['overview', 'Обзор', 'M4 13h4v7H4zM10 8h4v12h-4zM16 4h4v16h-4z'], ['ops', 'Операции', 'M4 6h16M4 12h16M4 18h10'], ['plan', 'План', 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z'], ['more', 'Ещё', 'M5 12h.01M12 12h.01M19 12h.01']] as const).map(([k, l, d]) => (
          <button class={tab === k ? 'tab on' : 'tab'} aria-current={tab === k ? 'page' : undefined} onClick={() => goTab(k)}>
            <svg class="ti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d={d} /></svg>{l}</button>
        ))}
      </nav>

      {editing && (
        <TxSheet s={s} month={month} value={editing} onClose={() => setEditing(null)}
          onSave={(tx, mode) => {
            update((d) => { const i = d.txs.findIndex((t) => t.id === tx.id); if (i >= 0) d.txs[i] = tx; else d.txs.push(tx); },
              mode === 'repeat' ? 'Повторено сегодня' : undefined);
            setEditing(null);
            haptic(true);
            const k = monthKey(tx.date);
            if (k !== month) {
              setMonthDir(k > month ? 1 : -1);
              setMonth(k);
              if (mode !== 'repeat') notify(`Сохранено в ${monthTitle(k).toLowerCase()}`);
            } else if (mode === 'edit') notify('Сохранено');
          }}
          onDelete={(id) => {
            update((d) => { d.txs = d.txs.filter((t) => t.id !== id); }, 'Операция удалена');
            setEditing(null);
          }} />
      )}
      {!s.onboarded && (
        <Onboarding style={s.style ?? 'minimal'} onStyle={(k) => update((d) => { d.style = k; })} freeze={obFreeze}
          onDone={() => { haptic(true); update((d) => { d.onboarded = true; }); }} />
      )}
      {toast && (
        <div class="toast" key={toast.id} role="status">
          <span>{toast.text}</span>
          {toast.undo && <button class="toast-undo" onClick={undo}>Отменить</button>}
        </div>
      )}
    </div>
  );
}

type M = ReturnType<typeof summarize>;

const DAY_KINDS = [['expense', 'Траты'], ['income', 'Доходы']] as const;
const OPS_FILTERS = [['all', 'Все'], ['expense', 'Расходы'], ['income', 'Доходы']] as const;
const PLAN_KINDS = [['expense', 'Расходы'], ['income', 'Доходы']] as const;

function Overview({ s, m, month, onEdit, onBackup, onSnooze }: {
  s: State; m: M; month: string; onEdit: (t: Tx) => void; onBackup: () => void; onSnooze: () => void;
}) {
  const [dayKind, setDayKind] = useState<Kind>('expense');
  const daySwipe = useSwipe((d) => stepOption(DAY_KINDS, dayKind, d, setDayKind), { short: true });
  const trend = useMemo(() => monthTrend(s, month, 6), [s, month]);
  const slices = m.expenseRows.filter((r) => r.fact > 0 && !r.cat.savings).sort((a, b) => b.fact - a.fact)
    .map((r) => ({ label: r.cat.name, value: r.fact, color: r.cat.color }));
  const today = monthKey(todayISO()) === month ? new Date().getDate() : undefined;
  const pct = m.deltaPct == null ? '' : `${m.deltaPct >= 0 ? '+' : '−'}${Math.abs(Math.round(m.deltaPct * 100)).toLocaleString('ru-RU')}%`;
  const overPlan = m.spentPlan > 0 && m.spent > m.spentPlan;
  const dayTotal = dayKind === 'income' ? m.income : m.spent;
  const tIncome = trend.reduce((a, p) => a + p.income, 0);
  const tSpent = trend.reduce((a, p) => a + p.spent, 0);
  const active = trend.filter((p) => p.income || p.spent || p.saved).length;
  const keepRate = tIncome > 0 ? Math.round(((tIncome - tSpent) / tIncome) * 100) : null;

  return (
    <>
      {needsBackup(s) && (
        <section class="card notice soft">
          <button class="notice-close" aria-label="Напомнить через две недели" onClick={onSnooze}>×</button>
          <span>{s.lastBackup ? `Последней резервной копии больше месяца (${fmtDate(s.lastBackup)}).` : 'Резервной копии ещё нет.'} Данные хранятся только на этом телефоне.</span>
          <button class="link" onClick={onBackup}>Сделать копию →</button>
        </section>
      )}
      <section class="card hero">
        <div class="hero-lbl">Остаток на конец периода</div>
        <Money class="hero-val" value={m.end} />
        <div class="hero-row">
          <span class="muted">Начальная {rub(m.start)}{m.startIsAuto && m.start !== 0 ? ' · из прошлого месяца' : ''}</span>
          <span class={m.delta >= 0 ? 'chip pos' : 'chip neg'}>{signedRub(m.delta)}{pct && ` · ${pct}`}</span>
        </div>
      </section>

      <section class="grid2">
        <Stat label="Доходы" value={m.income} sub={m.incomePlan ? `план ${rub(m.incomePlan)}` : m.tips ? `чаевые ${rub(m.tips)}` : ''} tone="pos" />
        <Stat label="Расходы" value={m.spent} tone="neg"
          sub={m.spentPlan ? `${overPlan ? 'перерасход · ' : ''}план ${rub(m.spentPlan)}` : 'без копилки'} />
        <Stat label="Отложено" value={m.saved} sub={`в общем ${rub(m.stash)}`} />
        <Stat label="Всего списано" value={m.expenseTotal} sub="с копилкой" />
      </section>

      <section class="card">
        <h2>Куда ушли деньги</h2>
        {slices.length === 0 ? <Empty text="Трат в этом месяце пока нет" /> : (
          <div class="donut-wrap">
            <Donut slices={slices} total={m.spent} caption="потрачено" />
            <ul class="legend">
              {slices.slice(0, 7).map((x) => (
                <li><i style={{ background: x.color }} /><span>{x.label}</span><b>{Math.round((x.value / m.spent) * 100)}%</b></li>
              ))}
              {slices.length > 7 && <li class="muted">ещё {slices.length - 7}</li>}
            </ul>
          </div>
        )}
      </section>

      <section class="card" {...daySwipe}>
        <div class="card-head">
          <h2>По дням</h2>
          <Seg small value={dayKind} onChange={setDayKind} options={DAY_KINDS} />
        </div>
        {dayTotal === 0 ? <Empty text={dayKind === 'income' ? 'Доходов в этом месяце пока нет' : 'Здесь появится график трат'} /> : (
          <>
            <div key={dayKind} class={dayKind === 'income' ? 'swap next' : 'swap prev'}><DayBars data={m.byDay} today={today} kind={dayKind} /></div>
            <p class="hint">Яркий столбец — самый {dayKind === 'income' ? 'доходный' : 'затратный'} день. Копилка в траты не входит.</p>
          </>
        )}
      </section>

      <section class="card">
        <h2>Динамика за полгода</h2>
        {active < 2 ? <Empty text="График появится, когда наберётся хотя бы два месяца операций" /> : (
          <>
            <TrendChart points={trend} current={month} />
            <div class="trend-legend">
              <span><i style={{ background: 'var(--pos)' }} />доходы</span>
              <span><i style={{ background: 'var(--bar)' }} />расходы</span>
              <span><i class="line" />остаток</span>
            </div>
            {keepRate != null && (
              <p class={keepRate >= 0 ? 'verdict pos' : 'verdict neg'}>
                {keepRate >= 0 ? `Сохраняешь ${keepRate}% дохода` : `Тратишь на ${-keepRate}% больше дохода`}
              </p>
            )}
            <p class="hint">За шесть месяцев: доля дохода, которая не ушла на траты. Копилка считается сохранённой.</p>
          </>
        )}
      </section>

      <section class="card">
        <h2>Последние операции</h2>
        {m.txs.length === 0 ? <Empty text="Добавь первую операцию кнопкой внизу" /> :
          m.txs.slice(0, 5).map((t, i) => <TxRow s={s} t={t} i={i} onClick={() => onEdit(t)} />)}
      </section>
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: 'pos' | 'neg' }) {
  return (
    <div class="card stat">
      <div class="stat-lbl">{label}</div>
      <Money class={`stat-val ${tone ?? ''}`} value={value} />
      {sub && <div class="stat-sub">{sub}</div>}
    </div>
  );
}

const Empty = ({ text }: { text: string }) => <div class="empty">{text}</div>;

const fmtDate = (d: string) => new Date(d + 'T00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

/** Облачной копии Android нет — без ручной копии потеря телефона означает потерю базы */
function needsBackup(s: State): boolean {
  if (s.txs.length < 20) return false;
  // Дата дальше двух недель — след ушедших вперёд часов: такую отсрочку не учитываем
  const today = todayISO();
  if (s.backupSnooze && today < s.backupSnooze && s.backupSnooze <= shiftDay(today, 14)) return false;
  if (!s.lastBackup) return true;
  return (Date.now() - new Date(s.lastBackup + 'T00:00').getTime()) / 86400000 > 30;
}

const LONG_PRESS = 450;

function TxRow({ s, t, i = 0, onClick, onLongPress, selected }: {
  s: State; t: Tx; i?: number; onClick?: () => void; onLongPress?: () => void; selected?: boolean;
}) {
  const cat = s.categories.find((c) => c.id === t.categoryId);
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number; fired: boolean } | null>(null);
  const cancel = () => { if (press.current) clearTimeout(press.current.timer); };
  const long = onLongPress && {
    onTouchStart: (e: TouchEvent) => {
      const p = e.touches[0];
      const st = { x: p.clientX, y: p.clientY, fired: false, timer: setTimeout(() => { st.fired = true; haptic(true); onLongPress(); }, LONG_PRESS) };
      press.current = st;
    },
    onTouchMove: (e: TouchEvent) => {
      const p = e.touches[0], st = press.current;
      if (st && Math.hypot(p.clientX - st.x, p.clientY - st.y) > 10) cancel();
    },
    onTouchEnd: cancel,
    onTouchCancel: cancel,
    onContextMenu: (e: Event) => { e.preventDefault(); if (!press.current?.fired) onLongPress(); },
  };
  const click = () => {
    // Палец, удержанный для выбора, отпускается кликом — его не считать вторым нажатием
    if (press.current?.fired) { press.current = null; return; }
    onClick?.();
  };
  return (
    <button class={selected ? 'tx sel' : 'tx'} style={{ '--i': Math.min(i, 12) }} onClick={click} disabled={!onClick}
      aria-pressed={selected === undefined ? undefined : selected} {...long}>
      {selected === undefined
        ? <i class="dot" style={{ background: cat?.color ?? 'var(--muted)' }} />
        : <i class={selected ? 'selmark on' : 'selmark'} aria-hidden="true" />}
      <span class="tx-main">
        <span class="tx-cat">{cat?.name ?? 'Без категории'}</span>
        {t.desc && <span class="tx-desc">{t.desc}</span>}
      </span>
      <span class={t.kind === 'income' ? 'tx-amt pos' : 'tx-amt neg'}>{t.kind === 'income' ? '+' : '−'}{rub(t.amount)}</span>
    </button>
  );
}

function Ops({ s, m, onEdit, update }: { s: State; m: M; onEdit: (t: Tx) => void; update: Update }) {
  const [filter, setFilter] = useState<'all' | Kind>('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState(false);
  const selecting = sel.size > 0;
  useEffect(() => {
    document.body.classList.toggle('selecting', selecting);
    return () => document.body.classList.remove('selecting');
  }, [selecting]);
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const add = (id: string) => setSel((p) => (p.has(id) ? p : new Set(p).add(id)));
  const picked = s.txs.filter((t) => sel.has(t.id));
  const kinds = new Set(picked.map((t) => t.kind));
  const moveKind = kinds.size === 1 ? [...kinds][0] : null;
  const removeSel = () => {
    const n = sel.size;
    update((d) => { d.txs = d.txs.filter((t) => !sel.has(t.id)); }, `Удалено операций: ${n}`);
    setSel(new Set());
  };
  const moveSel = (catId: string) => {
    const n = sel.size;
    update((d) => { for (const t of d.txs) if (sel.has(t.id)) t.categoryId = catId; }, `Перенесено операций: ${n}`);
    setMoving(false);
    setSel(new Set());
  };
  const needle = q.trim().toLowerCase();
  const list = m.txs.filter((t) => (filter === 'all' || t.kind === filter) &&
    (!needle || t.desc.toLowerCase().includes(needle) ||
      (s.categories.find((c) => c.id === t.categoryId)?.name.toLowerCase().includes(needle) ?? false)));
  const groups = new Map<string, Tx[]>();
  for (const t of list) groups.set(t.date, [...(groups.get(t.date) ?? []), t]);
  const fmt = (d: string) => new Date(d + 'T00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' });
  const total = list.reduce((a, t) => a + (t.kind === 'income' ? t.amount : -t.amount), 0);
  let n = 0;

  return (
    <SwipeArea onSwipe={(d) => stepOption(OPS_FILTERS, filter, d, setFilter)}>
      <Seg value={filter} onChange={setFilter} options={OPS_FILTERS} />
      <div class="search-wrap">
        <input class="search" type="search" placeholder="Поиск по описанию или категории" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        {q && <button class="search-clear" aria-label="Очистить поиск" onClick={() => setQ('')}>✕</button>}
      </div>
      {needle && list.length > 0 && <p class="hint">Найдено {list.length}, итого {signedRub(total)}</p>}
      {list.length === 0 && <Empty text={needle ? 'Ничего не нашлось' : 'Операций нет'} />}
      {[...groups].map(([date, txs]) => {
        const dayTotal = txs.reduce((a, t) => a + (t.kind === 'income' ? t.amount : -t.amount), 0);
        return (
          <section class="card day">
            <div class="day-head"><span>{fmt(date)}</span><span class={dayTotal >= 0 ? 'pos' : 'neg'}>{signedRub(dayTotal)}</span></div>
            {txs.map((t) => (
              <TxRow s={s} t={t} i={n++} selected={selecting ? sel.has(t.id) : undefined}
                onClick={() => (selecting ? toggle(t.id) : onEdit(t))} onLongPress={() => add(t.id)} />
            ))}
          </section>
        );
      })}
      {!selecting && list.length > 1 && <p class="hint center">Зажми операцию, чтобы выбрать несколько</p>}
      {selecting && (
        <SelectBack onBack={() => setSel(new Set())} />
      )}
      {selecting && (
        <Portal>
          <div class="selbar" role="toolbar" aria-label="Выбранные операции">
            <button class="icon-btn" aria-label="Снять выбор" onClick={() => setSel(new Set())}>✕</button>
            <span class="selbar-count">{sel.size}</span>
            <button class="selbar-btn" onClick={() => setSel(new Set(list.map((t) => t.id)))}>Все</button>
            <button class="selbar-btn" disabled={!moveKind} onClick={() => setMoving(true)}>Перенести</button>
            <button class="selbar-btn danger" onClick={removeSel}>Удалить</button>
            {!moveKind && <span class="selbar-hint">Перенести можно только расходы или только доходы</span>}
          </div>
        </Portal>
      )}
      {moving && moveKind && (
        <Sheet title={`Перенести ${sel.size} в категорию`} onClose={() => setMoving(false)}>
          <div class="chips" data-noswipe>
            {s.categories.filter((c) => c.kind === moveKind).map((c) => (
              <button class="chipsel" onClick={() => moveSel(c.id)}><i class="dot" style={{ background: c.color }} />{c.name}</button>
            ))}
          </div>
        </Sheet>
      )}
    </SwipeArea>
  );
}

/** Пока выбраны операции, «назад» снимает выбор, а не уходит со вкладки */
function SelectBack({ onBack }: { onBack: () => void }) {
  useBack(onBack);
  return null;
}

function Plan({ s, m, month, update, notify }: { s: State; m: M; month: string; update: Update; notify: Notify }) {
  const [kind, setKind] = useState<Kind>('expense');
  const [focus, setFocus] = useState<string | null>(null);
  const focusRef = useRef<HTMLInputElement | null>(null);
  const all = kind === 'expense' ? m.expenseRows : m.incomeRows;
  // Копилка — перевод, а не трата: в итоги расходов не входит, перевыполнение её плана — плюс
  const rows = all.filter((r) => !r.cat.savings);
  const jars = all.filter((r) => r.cat.savings);
  const plan = rows.reduce((a, r) => a + r.plan, 0);
  const fact = rows.reduce((a, r) => a + r.fact, 0);
  const diff = kind === 'expense' ? plan - fact : fact - plan;
  // Порядок фиксируется при входе в раздел: иначе строка уезжает из-под пальца, пока правишь соседние планы
  const order = useMemo(() => [...all].sort((a, b) => (b.fact + b.plan) - (a.fact + a.plan)).map((r) => r.cat.id), [kind, month]);
  const rank = (id: string) => { const i = order.indexOf(id); return i < 0 ? order.length : i; };
  const byRank = (a: CatRow, b: CatRow) => rank(a.cat.id) - rank(b.cat.id);

  const setPlan = (cat: Category, el: HTMLInputElement, current: number) => {
    const raw = el.value.trim();
    const v = raw === '' ? 0 : parseSigned(raw);
    if (v == null || v < 0) { el.value = current ? String(current) : ''; notify('Не похоже на сумму'); return; }
    el.value = v ? String(v) : '';
    if (v === current) return;
    update((d) => { const mm = (d.months[month] ??= {}); (mm.plans ??= {})[cat.id] = v; });
  };

  const planRow = (r: CatRow, jar: boolean) => {
    const d = jar ? r.fact - r.plan : r.diff;
    const tone = d > 0 ? 'pos' : d < 0 && kind === 'expense' && !jar ? 'neg' : 'muted';
    const note = d === 0 ? '—' : jar && d < 0 ? `ещё ${rub(-d)}` : signedRub(d);
    return (
      <div class="plan-row" key={r.cat.id}>
        <div class="plan-top">
          <span class="plan-name"><i class="dot" style={{ background: r.cat.color }} />{r.cat.name}</span>
          <span class={tone}>{note}</span>
        </div>
        <Progress value={r.fact} max={r.plan} over={!jar && kind === 'expense' && r.fact > r.plan} goal={jar} />
        <div class="plan-bottom">
          <span>{rub(r.fact)}</span>
          <label class="plan-input">
            {/* Кнопки слева от поля: появляясь, они не сдвигают поле из-под пальца */}
            {focus === r.cat.id && <CalcKeys input={focusRef} />}
            {jar ? 'цель' : 'план'}
            <input key={`${month}:${r.plan}`} inputMode="decimal" enterKeyHint="done" defaultValue={r.plan ? String(r.plan) : ''} placeholder="0"
              onFocus={(e) => { focusRef.current = e.currentTarget; setFocus(r.cat.id); }}
              onBlur={() => setFocus(null)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              onChange={(e) => setPlan(r.cat, e.currentTarget, r.plan)} />
            ₽
          </label>
        </div>
      </div>
    );
  };

  return (
    <SwipeArea onSwipe={(d) => stepOption(PLAN_KINDS, kind, d, setKind)}>
      <Seg value={kind} onChange={setKind} options={PLAN_KINDS} />
      <section class="card totals">
        <div><span class="stat-lbl">План</span><Money value={plan} /></div>
        <div><span class="stat-lbl">Факт</span><Money value={fact} /></div>
        <div><span class="stat-lbl">Разница</span><b class={diff >= 0 ? 'pos' : 'neg'}>{signedRub(diff)}</b></div>
      </section>
      <p class="hint">Нажми на сумму плана, чтобы изменить её только на {monthTitle(month).toLowerCase()}. Можно считать прямо в поле: 3000+1500.</p>
      <section class="card">
        {[...rows].sort(byRank).map((r) => planRow(r, false))}
      </section>
      {jars.length > 0 && (
        <section class="card">
          <h2>Копилка</h2>
          <p class="hint">Не трата: деньги остаются твоими, просто отложены. План — сколько отложить за месяц, больше — только лучше.</p>
          {[...jars].sort(byRank).map((r) => planRow(r, true))}
        </section>
      )}
      {s.months[month]?.plans && (
        <button class="link" onClick={() => update((d) => { if (d.months[month]) delete d.months[month].plans; }, 'Планы месяца сброшены')}>
          Сбросить планы месяца к значениям по умолчанию
        </button>
      )}
    </SwipeArea>
  );
}

function More({ s, m, month, readOnly, current, update, replace, notify, takeSpot }: {
  s: State; m: M; month: string; readOnly: boolean; current: () => State; update: Update; replace: Replace; notify: Notify; takeSpot: () => boolean;
}) {
  const backupRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!takeSpot()) return;
    // Ждём конца анимации входа вкладки, иначе прокрутка считает позицию по сдвинутой карточке
    const go = setTimeout(() => {
      backupRef.current?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
      backupRef.current?.classList.add('spot');
    }, 320);
    const off = setTimeout(() => backupRef.current?.classList.remove('spot'), 2900);
    return () => { clearTimeout(go); clearTimeout(off); };
  }, []);
  const [editCat, setEditCat] = useState<Category | 'new-expense' | 'new-income' | null>(null);
  const explicitStart = s.months[month]?.start;
  const [startRaw, setStartRaw] = useState(explicitStart?.toString() ?? '');
  const startRef = useRef<HTMLInputElement>(null);
  const [broken, setBroken] = useState(false);
  const [exported, setExported] = useState(false);
  const [restorable, setRestorable] = useState(false);
  useEffect(() => setStartRaw(explicitStart?.toString() ?? ''), [month, explicitStart]);
  useEffect(() => {
    hasBroken().then(setBroken);
    beforeRestore().then((b) => setRestorable(!!b));
  }, []);

  const commitStart = (raw: string) => {
    const v = raw.trim() === '' ? null : parseSigned(raw);
    if (raw.trim() !== '' && v == null) { setStartRaw(explicitStart?.toString() ?? ''); notify('Не похоже на сумму'); return; }
    if (v != null) setStartRaw(String(v));
    if (v === (explicitStart ?? null)) return;
    update((d) => { const mm = (d.months[month] ??= {}); if (v == null) delete mm.start; else mm.start = v; });
  };
  const doImport = async () => {
    const f = await pickFile('.xlsx,.xls,.ods,.csv');
    if (!f) return;
    try {
      const r = importWorkbook(new Uint8Array(await f.arrayBuffer()), current());
      if (!r.added && !r.newCategories.length) { notify(r.skipped ? `Всё уже импортировано (${r.skipped})` : 'В файле не нашлось операций'); return; }
      replace(r.state, `Импорт: +${r.added} операций${r.skipped ? `, ${r.skipped} уже были` : ''}${r.newCategories.length ? `, новых категорий ${r.newCategories.length}` : ''}`);
    } catch { notify('Не удалось прочитать файл'); }
  };
  const doExport = async () => {
    try { await saveFile(`Монетка ${monthTitle(month)}.xlsx`, exportMonth(s, month), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); }
    catch { notify('Экспорт не удался'); }
  };
  const doBackup = async () => {
    try {
      if (await saveFile(`monetka-backup-${todayISO()}.json`, JSON.stringify(current()), 'application/json')) {
        update((d) => { d.lastBackup = todayISO(); });
      }
    } catch { notify('Не удалось сохранить копию'); }
  };
  const doRestore = async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    let rep: ReturnType<typeof normalizeReport> = null;
    try { rep = normalizeReport(JSON.parse(await f.text())); } catch { /* не JSON — ниже тот же ответ */ }
    if (!rep) { notify('Это не файл резервной копии Монетки'); return; }
    const now = current();
    const skipped = rep.dropped ? `\n${rep.dropped} повреждённых записей в копии будут пропущены.` : '';
    if (!confirm(`Заменить данные копией?\nСейчас: ${now.txs.length} операций. В копии: ${rep.state.txs.length}.${skipped}`)) return;
    try { await saveBeforeRestore(now); setRestorable(true); }
    catch { if (!confirm('Не удалось сохранить текущие данные на случай отката. Всё равно восстановить?')) return; }
    replace(rep.state, 'Данные восстановлены из копии');
  };
  const undoRestore = async () => {
    const b = await beforeRestore();
    if (!b) { setRestorable(false); notify('Сохранённых данных нет'); return; }
    if (!confirm(`Вернуть данные, которые были до последнего восстановления?\nСейчас: ${current().txs.length} операций. Было: ${b.state.txs.length}.`)) return;
    replace(b.state, 'Возвращены данные до восстановления');
    await dropBeforeRestore(b.name);
    setRestorable(!!(await beforeRestore()));
  };
  const doBroken = async () => {
    try { if (await exportBroken()) setExported(true); }
    catch { notify('Не удалось сохранить файл'); }
  };
  const forgetBroken = async () => {
    if (!confirm('Удалить сохранённые повреждённые данные из приложения? Это необратимо.')) return;
    await dropBroken();
    setBroken(false);
  };

  return (
    <>
      <section class="card">
        <h2>Начальная сумма — {monthTitle(month)}</h2>
        <div class="row-input">
          <input ref={startRef} inputMode="decimal" enterKeyHint="done" placeholder={`${Math.round(m.start)} (авто)`} value={startRaw}
            onInput={(e) => setStartRaw(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            onChange={(e) => commitStart(e.currentTarget.value)} />
          <span>₽</span>
          <CalcKeys input={startRef} />
        </div>
        <p class="hint">Пусто — подставится остаток прошлого месяца. Минус тоже можно, если месяц начался с долга.</p>
      </section>

      <section class="card">
        <h2>Оформление</h2>
        <div class="style-pick">
          {([['minimal', 'Минимализм'], ['glass', 'Стекло']] as const).map(([k, l]) => (
            <button class={(s.style ?? 'minimal') === k ? 'style-opt on' : 'style-opt'} aria-pressed={(s.style ?? 'minimal') === k}
              onClick={() => { haptic(); update((d) => { d.style = k as ThemeStyle; }); }}>
              <span class={`style-prev ${k}`} aria-hidden="true"><i /><i /><i /></span>{l}
            </button>
          ))}
        </div>
        <Seg value={s.theme} onChange={(k) => update((d) => { d.theme = k as ThemeMode; })}
          options={[['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']]} />
      </section>

      <section class="card">
        <h2>Категории</h2>
        {(['expense', 'income'] as const).map((k) => (
          <div class="cat-group">
            <div class="cat-head"><span class="stat-lbl">{k === 'expense' ? 'Расходы' : 'Доходы'}</span>
              <button class="link" onClick={() => setEditCat(k === 'expense' ? 'new-expense' : 'new-income')}>+ Добавить</button></div>
            {s.categories.filter((c) => c.kind === k).map((c) => (
              <button class="cat" onClick={() => setEditCat(c)}>
                <i class="dot" style={{ background: c.color }} /><span>{c.name}</span>
                {c.savings && <em class="tag">копилка</em>}{c.tips && <em class="tag">чаевые</em>}
                <span class="muted">{c.plan ? rub(c.plan) : ''}</span>
              </button>
            ))}
          </div>
        ))}
      </section>

      <section class="card actions">
        <h2>Данные</h2>
        <button class="btn" onClick={doExport}>Экспорт месяца в Excel</button>
        {!readOnly && <button class="btn" onClick={doImport}>Импорт из таблицы (.xlsx)</button>}
        <button ref={backupRef} class="btn ghost" onClick={doBackup}>Резервная копия</button>
        {!readOnly && <button class="btn ghost" onClick={doRestore}>Восстановить из копии</button>}
        {!readOnly && restorable && <button class="btn ghost" onClick={undoRestore}>Вернуть данные до восстановления</button>}
        {broken && <button class="btn danger" onClick={doBroken}>Выгрузить повреждённые данные</button>}
        {!readOnly && broken && exported && <button class="link" onClick={forgetBroken}>Удалить повреждённые данные из приложения</button>}
        {readOnly && <p class="hint neg">Хранилище сейчас только для чтения: импорт и восстановление выключены, чтобы ничего не затереть.</p>}
        {s.lastBackup && <p class="hint">Последняя резервная копия: {fmtDate(s.lastBackup)}.</p>}
        <p class="hint">Импорт понимает шаблон Google Таблиц «Месячный бюджет»: листы «Сводка» и «Транзакции». Повторный импорт не дублирует операции.</p>
        <p class="hint">Данные хранятся только на этом телефоне. Делай резервную копию перед сменой телефона или переустановкой.</p>
      </section>

      <section class="card gestures">
        <h2>Жесты</h2>
        <p class="hint">Длинный свайп по экрану — соседняя вкладка, короткий — соседний раздел. По шапке с месяцем — соседний месяц, тап по месяцу — текущий. Зажми операцию, чтобы выбрать несколько. Шторку можно смахнуть вниз.</p>
        <button class="link" onClick={() => update((d) => { d.onboarded = false; })}>Показать знакомство</button>
      </section>

      {editCat && (
        <CatSheet s={s} month={month} value={editCat} onClose={() => setEditCat(null)}
          onSave={(c) => { update((d) => { const i = d.categories.findIndex((x) => x.id === c.id); if (i >= 0) d.categories[i] = c; else d.categories.push(c); }); setEditCat(null); haptic(true); }}
          onDelete={(id, moveTo) => {
            update((d) => {
              d.categories = d.categories.filter((c) => c.id !== id);
              d.txs = moveTo ? d.txs.map((t) => (t.categoryId === id ? { ...t, categoryId: moveTo } : t)) : d.txs.filter((t) => t.categoryId !== id);
              for (const mm of Object.values(d.months)) if (mm.plans) delete mm.plans[id];
            }, 'Категория удалена');
            setEditCat(null);
          }} />
      )}
    </>
  );
}

/** Последняя по дате операция этого типа — её категория предлагается по умолчанию */
function lastCategory(s: State, kind: Kind): string {
  let best: Tx | undefined;
  for (const t of s.txs) if (t.kind === kind && (!best || t.date >= best.date)) best = t;
  return best?.categoryId ?? '';
}

/** Высота поля по содержимому: field-sizing есть не во всех WebView, поэтому подгоняем вручную */
function grow(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + 2}px`;
}

function TxSheet({ s, month, value, onClose, onSave, onDelete }: {
  s: State; month: string; value: Tx | 'new-expense' | 'new-income';
  onClose: () => void; onSave: (t: Tx, mode: 'new' | 'edit' | 'repeat') => void; onDelete: (id: string) => void;
}) {
  const isNew = typeof value === 'string';
  const defDate = monthKey(todayISO()) === month ? todayISO() : `${month}-01`;
  const [kind, setKind] = useState<Kind>(isNew ? (value === 'new-income' ? 'income' : 'expense') : value.kind);
  const [amount, setAmount] = useState(isNew ? '' : String(value.amount));
  const amountRef = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState(isNew ? defDate : value.date);
  const [desc, setDesc] = useState(isNew ? '' : value.desc);
  const cats = s.categories.filter((c) => c.kind === kind);
  const [catId, setCatId] = useState(isNew ? '' : value.categoryId);
  const validCat = cats.some((c) => c.id === catId) ? catId : (isNew ? cats.find((c) => c.id === lastCategory(s, kind))?.id ?? '' : '');
  const amt = parseExpr(amount);
  const isExpr = /\d\s*[+\-−–]\s*\d/.test(amount);
  const ok = amt != null && !!validCat && /^\d{4}-\d{2}-\d{2}$/.test(date);

  const recent = useMemo(() => {
    const seen = new Map<string, number>();
    for (const t of [...s.txs].sort((a, b) => (a.date < b.date ? 1 : -1))) {
      if (t.categoryId !== validCat || !t.desc || seen.has(t.desc)) continue;
      seen.set(t.desc, t.amount);
      if (seen.size >= 5) break;
    }
    return [...seen];
  }, [s.txs, validCat]);

  const submit = () => {
    if (!ok) return;
    onSave({ id: isNew ? uid() : value.id, kind, amount: amt!, date, desc: desc.trim(), categoryId: validCat }, isNew ? 'new' : 'edit');
  };

  return (
    <Sheet title={isNew ? 'Новая операция' : 'Операция'} onClose={onClose}>
      <Seg value={kind} onChange={setKind} options={[['expense', 'Расход'], ['income', 'Доход']]} />
      <div class="amount-field">
        <input ref={amountRef} autoFocus={isNew} inputMode="decimal" enterKeyHint="done" placeholder="0" value={amount} aria-label="Сумма"
          onInput={(e) => setAmount(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        <span>₽</span>
        <CalcKeys input={amountRef} />
      </div>
      {isExpr && <div class={amt != null ? 'calc' : 'calc bad'}>{amt != null ? `= ${rub(amt)}` : 'не получается посчитать'}</div>}
      <div class="chips" data-noswipe>
        {cats.map((c) => (
          <button class={validCat === c.id ? 'chipsel on' : 'chipsel'} style={validCat === c.id ? { borderColor: c.color, background: c.color + '22' } : {}}
            onClick={() => { haptic(); setCatId(c.id); }}><i class="dot" style={{ background: c.color }} />{c.name}</button>
        ))}
      </div>
      {recent.length > 0 && (
        <div class="recent">
          {recent.map(([d, a]) => (
            <button class="recent-chip" onClick={() => { setDesc(d); if (!amount) setAmount(String(a)); }}>{d}</button>
          ))}
        </div>
      )}
      <label class="field"><span>Описание</span>
        <textarea rows={1} placeholder="Например: продукты, такси" value={desc} maxLength={1000}
          onInput={(e) => { setDesc(e.currentTarget.value); grow(e.currentTarget); }} ref={(el) => { if (el) grow(el); }} /></label>
      <label class="field"><span>Дата</span>
        <input type="date" value={date} onInput={(e) => setDate(e.currentTarget.value)} /></label>
      {!isNew && (
        <button class="link" disabled={!ok}
          onClick={() => onSave({ id: uid(), kind, amount: amt!, date: todayISO(), desc: desc.trim(), categoryId: validCat }, 'repeat')}>
          Повторить сегодня{amt != null && amt !== value.amount ? ` (${rub(amt)}, исходная не изменится)` : ''}
        </button>
      )}
      <div class="sheet-actions">
        {!isNew && <button class="btn danger" onClick={() => onDelete(value.id)}>Удалить</button>}
        <button class="btn primary" disabled={!ok} onClick={submit}>Сохранить</button>
      </div>
    </Sheet>
  );
}

function CatSheet({ s, month, value, onClose, onSave, onDelete }: {
  s: State; month: string; value: Category | 'new-expense' | 'new-income';
  onClose: () => void; onSave: (c: Category) => void; onDelete: (id: string, moveTo: string | null) => void;
}) {
  const isNew = typeof value === 'string';
  const base: Category = isNew
    ? { id: uid(), name: '', kind: value === 'new-income' ? 'income' : 'expense', plan: 0, color: PALETTE[s.categories.length % PALETTE.length] }
    : value;
  const [c, setC] = useState<Category>(base);
  const [planRaw, setPlanRaw] = useState(base.plan ? String(base.plan) : '');
  const used = !isNew && s.txs.filter((t) => t.categoryId === base.id).length;
  const others = s.categories.filter((x) => x.kind === c.kind && x.id !== c.id);
  const [moveTo, setMoveTo] = useState(others[0]?.id ?? '');
  const monthPlan = !isNew ? planFor(s, month, base) : 0;
  const name = c.name.trim();
  const dup = others.some((o) => o.name.trim().toLowerCase() === name.toLowerCase());
  const plan = planRaw.trim() === '' ? 0 : parseExpr(planRaw);
  const ok = !!name && !dup && plan != null;

  return (
    <Sheet title={isNew ? 'Новая категория' : 'Категория'} onClose={onClose}>
      <label class="field"><span>Название</span>
        <input value={c.name} maxLength={40} onInput={(e) => setC({ ...c, name: e.currentTarget.value })} placeholder="Например: Техника" /></label>
      {dup && <p class="hint neg">Такая категория уже есть</p>}
      <label class="field"><span>План по умолчанию на месяц, ₽</span>
        <input inputMode="decimal" value={planRaw} placeholder="0" onInput={(e) => setPlanRaw(e.currentTarget.value)} /></label>
      {plan == null && <p class="hint neg">Не похоже на сумму</p>}
      {!isNew && monthPlan !== base.plan && <p class="hint">В этом месяце задан свой план: {rub(monthPlan)}.</p>}
      <div class="swatches" data-noswipe>
        {PALETTE.map((p) => <button class={c.color === p ? 'sw on' : 'sw'} style={{ background: p }} aria-label={`Цвет ${p}`} aria-pressed={c.color === p} onClick={() => setC({ ...c, color: p })} />)}
      </div>
      {c.kind === 'expense' && (
        <label class="check"><input type="checkbox" checked={!!c.savings} onChange={(e) => setC({ ...c, savings: e.currentTarget.checked })} />
          <span>Копилка<small>Деньги откладываются, а не тратятся: в расходы не входят, план — цель накоплений</small></span></label>
      )}
      {c.kind === 'income' && (
        <label class="check"><input type="checkbox" checked={!!c.tips} onChange={(e) => setC({ ...c, tips: e.currentTarget.checked })} />
          <span>Чаевые<small>Входят в доходы и отдельно копятся в «Отложено» вместе с копилкой</small></span></label>
      )}
      {!isNew && used ? (
        <div class="move">
          <span class="hint">В категории {used} операций. При удалении перенести их в:</span>
          <select value={moveTo} onChange={(e) => setMoveTo(e.currentTarget.value)}>
            {others.map((o) => <option value={o.id}>{o.name}</option>)}
          </select>
        </div>
      ) : null}
      <div class="sheet-actions">
        {!isNew && <button class="btn danger" disabled={!!used && !moveTo}
          onClick={() => { if (confirm(`Удалить категорию «${base.name}»?`)) onDelete(base.id, used ? moveTo : null); }}>Удалить</button>}
        <button class="btn primary" disabled={!ok}
          onClick={() => onSave({ ...c, name, plan: plan ?? 0 })}>Сохранить</button>
      </div>
    </Sheet>
  );
}

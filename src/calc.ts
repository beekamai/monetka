import type { Category, Kind, State, Tx } from './model.ts';
import { monthKey, shiftMonth } from './model.ts';

export interface CatRow {
  cat: Category;
  plan: number;
  fact: number;
  /** Для расходов: план − факт (минус = перерасход). Для доходов: факт − план. */
  diff: number;
}

export interface MonthSummary {
  key: string;
  start: number;
  startIsAuto: boolean;
  income: number;
  incomePlan: number;
  incomeNoTips: number;
  tips: number;
  /** Все расходы, включая копилку (как «Итого — фактические» в таблице) */
  expenseTotal: number;
  expensePlanTotal: number;
  /** Расходы без копилки (как «Фактические» в таблице) */
  spent: number;
  spentPlan: number;
  saved: number;
  /** Отложено + чаевые («В общем») */
  stash: number;
  end: number;
  /** Насколько изменились общие сбережения за месяц */
  delta: number;
  /** delta / |start|, null если начальная сумма 0 */
  deltaPct: number | null;
  expenseRows: CatRow[];
  incomeRows: CatRow[];
  byDay: { day: number; expense: number; income: number }[];
  txs: Tx[];
}

export const planFor = (s: State, key: string, cat: Category) =>
  s.months[key]?.plans?.[cat.id] ?? cat.plan;

export function txsOfMonth(s: State, key: string): Tx[] {
  return s.txs.filter((t) => monthKey(t.date) === key);
}

/** Самый ранний месяц, в котором есть данные */
function firstMonth(s: State): string | null {
  let min: string | null = null;
  for (const t of s.txs) { const k = monthKey(t.date); if (!min || k < min) min = k; }
  for (const k of Object.keys(s.months)) if (!min || k < min) min = k;
  return min;
}

/** Начальная сумма месяца: явная или остаток прошлого месяца (цепочка) */
export function startOf(s: State, key: string): { value: number; auto: boolean } {
  const explicit = s.months[key]?.start;
  if (explicit !== undefined) return { value: explicit, auto: false };
  const first = firstMonth(s);
  if (!first || key <= first) return { value: 0, auto: true };
  // Идём вперёд от первого месяца, без рекурсии
  let k = first;
  let bal = s.months[k]?.start ?? 0;
  while (k < key) {
    bal += flow(s, k);
    k = shiftMonth(k, 1);
    const ex = s.months[k]?.start;
    if (ex !== undefined && k < key) bal = ex;
  }
  return { value: bal, auto: true };
}

function flow(s: State, key: string): number {
  let v = 0;
  for (const t of s.txs) if (monthKey(t.date) === key) v += t.kind === 'income' ? t.amount : -t.amount;
  return v;
}

export function summarize(s: State, key: string): MonthSummary {
  const txs = txsOfMonth(s, key).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const st = startOf(s, key);
  const factBy = new Map<string, number>();
  for (const t of txs) factBy.set(t.categoryId, (factBy.get(t.categoryId) ?? 0) + t.amount);

  const rows = (kind: Kind): CatRow[] =>
    s.categories.filter((c) => c.kind === kind).map((cat) => {
      const plan = planFor(s, key, cat);
      const fact = factBy.get(cat.id) ?? 0;
      return { cat, plan, fact, diff: kind === 'expense' ? plan - fact : fact - plan };
    });

  const expenseRows = rows('expense');
  const incomeRows = rows('income');
  const sum = (a: CatRow[], f: (r: CatRow) => number) => a.reduce((x, r) => x + f(r), 0);

  const income = sum(incomeRows, (r) => r.fact);
  const tips = sum(incomeRows.filter((r) => r.cat.tips), (r) => r.fact);
  const expenseTotal = sum(expenseRows, (r) => r.fact);
  const saved = sum(expenseRows.filter((r) => r.cat.savings), (r) => r.fact);
  const expensePlanTotal = sum(expenseRows, (r) => r.plan);
  const spentPlan = sum(expenseRows.filter((r) => !r.cat.savings), (r) => r.plan);
  const end = st.value + income - expenseTotal;
  const delta = end - st.value;

  const [y, m] = key.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const byDay = Array.from({ length: days }, (_, i) => ({ day: i + 1, expense: 0, income: 0 }));
  for (const t of txs) {
    const d = Number(t.date.slice(8, 10));
    if (d >= 1 && d <= days) {
      const cat = s.categories.find((c) => c.id === t.categoryId);
      if (t.kind === 'income') byDay[d - 1].income += t.amount;
      else if (!cat?.savings) byDay[d - 1].expense += t.amount;
    }
  }

  return {
    key, start: st.value, startIsAuto: st.auto,
    income, incomePlan: sum(incomeRows, (r) => r.plan), incomeNoTips: income - tips, tips,
    expenseTotal, expensePlanTotal, spent: expenseTotal - saved, spentPlan, saved,
    stash: saved + tips, end, delta,
    deltaPct: st.value !== 0 ? delta / Math.abs(st.value) : null,
    expenseRows, incomeRows, byDay, txs,
  };
}

export interface TrendPoint { key: string; income: number; spent: number; saved: number; end: number }

/** Последние n месяцев до key включительно: один проход по операциям, цепочка остатков как в startOf */
export function monthTrend(s: State, key: string, n: number): TrendPoint[] {
  const keys = Array.from({ length: n }, (_, i) => shiftMonth(key, i - n + 1));
  const savingsIds = new Set(s.categories.filter((c) => c.savings).map((c) => c.id));
  const agg = new Map(keys.map((k) => [k, { income: 0, spent: 0, saved: 0 }]));
  for (const t of s.txs) {
    const a = agg.get(monthKey(t.date));
    if (!a) continue;
    if (t.kind === 'income') a.income += t.amount;
    else if (savingsIds.has(t.categoryId)) a.saved += t.amount;
    else a.spent += t.amount;
  }
  let start = startOf(s, keys[0]).value;
  return keys.map((k) => {
    const a = agg.get(k)!;
    const ex = s.months[k]?.start;
    if (ex !== undefined) start = ex;
    const end = start + a.income - a.spent - a.saved;
    start = end;
    return { key: k, ...a, end };
  });
}

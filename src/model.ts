export type Kind = 'expense' | 'income';

export interface Category {
  id: string;
  name: string;
  kind: Kind;
  /** План по умолчанию на месяц */
  plan: number;
  /** Расход-копилка: деньги отложены, а не потрачены */
  savings?: boolean;
  /** Доход-чаевые (учитывается отдельно, как в таблице) */
  tips?: boolean;
  color: string;
}

export interface Tx {
  id: string;
  kind: Kind;
  /** YYYY-MM-DD */
  date: string;
  amount: number;
  desc: string;
  categoryId: string;
}

export interface MonthMeta {
  /** Начальная сумма; если не задана — берётся остаток прошлого месяца */
  start?: number;
  /** План на этот месяц по категории (перекрывает план по умолчанию) */
  plans?: Record<string, number>;
}

export type ThemeMode = 'auto' | 'light' | 'dark';
export type ThemeStyle = 'minimal' | 'glass';

export interface State {
  version: 1;
  categories: Category[];
  txs: Tx[];
  months: Record<string, MonthMeta>;
  theme: ThemeMode;
  style?: ThemeStyle;
  /** YYYY-MM-DD последней резервной копии — для напоминания */
  lastBackup?: string;
}

export const PALETTE = [
  '#5B8DEF', '#F2994A', '#27AE60', '#EB5757', '#9B51E0', '#2D9CDB',
  '#F2C94C', '#6FCF97', '#BB6BD9', '#56CCF2', '#E07A5F', '#81B29A',
  '#F28482', '#84A59D', '#A3A3FF', '#C9ADA7', '#8D99AE', '#E9C46A',
];

let counter = 0;
export const uid = () => Date.now().toString(36) + (counter++).toString(36) + Math.random().toString(36).slice(2, 6);

const c = (name: string, kind: Kind, plan: number, i: number, extra: Partial<Category> = {}): Category => ({
  id: uid(), name, kind, plan, color: PALETTE[i % PALETTE.length], ...extra,
});

export function defaultCategories(): Category[] {
  const exp: [string, number, Partial<Category>?][] = [
    ['Питание', 0], ['Подарки', 0], ['Здоровье/медицина', 0], ['Дом', 0],
    ['Общественный транспорт', 0], ['Личные расходы', 0], ['Домашние животные', 0],
    ['Коммунальные услуги', 0], ['Путешествия', 0], ['Задолженности', 0],
    ['В копилку', 0, { savings: true }], ['На банковскую карту', 0], ['Личный транспорт', 0],
    ['Одежда', 0], ['Подписки', 0], ['Техника', 0],
  ];
  const inc: [string, number, Partial<Category>?][] = [
    ['Сбережения', 0], ['Зарплата', 0], ['Премия', 0], ['Процентный доход', 0],
    ['Чаевые', 0, { tips: true }], ['Стипендия', 0], ['Возвращение задолженностей', 0],
  ];
  return [
    ...exp.map(([n, p, e], i) => c(n, 'expense', p, i, e)),
    ...inc.map(([n, p, e], i) => c(n, 'income', p, i + 3, e)),
  ];
}

export function emptyState(): State {
  return { version: 1, categories: defaultCategories(), txs: [], months: {}, theme: 'auto', style: 'minimal' };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Календарная дата YYYY-MM-DD, которая реально существует (не 2026-02-30 и не 2026-13-45) */
export function validDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return y >= 1900 && y <= 2200 && dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/**
 * Дата из сохранённых данных. Версия 1.0 пропускала при импорте «30.02», «31.04» — такие дни прижимаются
 * к концу месяца: операция остаётся в своём месяце и в остатках, а не пропадает.
 */
function storedDate(s: unknown): string | null {
  if (validDate(s)) return s;
  const m = typeof s === 'string' ? /^(\d{4})-(0[1-9]|1[0-2])-(29|30|31)$/.exec(s) : null;
  if (!m) return null;
  const last = new Date(Number(m[1]), Number(m[2]), 0).getDate();
  return `${m[1]}-${m[2]}-${String(last).padStart(2, '0')}`;
}

/** null — данные не похожи на базу Монетки */
export function normalizeState(raw: unknown): State | null {
  return normalizeReport(raw)?.state ?? null;
}

/**
 * Проверяет и чинит состояние из хранилища или файла копии.
 * Битые записи отбрасываются поштучно, чтобы одна испорченная операция не стоила всей базы; dropped — сколько.
 */
export function normalizeReport(raw: unknown): { state: State; dropped: number } | null {
  if (!isObj(raw) || raw.version !== 1 || !Array.isArray(raw.txs) || !Array.isArray(raw.categories)) return null;
  let dropped = 0;
  const categories: Category[] = [];
  for (const c of raw.categories) {
    if (!isObj(c) || typeof c.id !== 'string' || typeof c.name !== 'string' ||
      (c.kind !== 'expense' && c.kind !== 'income') || categories.some((x) => x.id === c.id)) { dropped++; continue; }
    categories.push({
      id: c.id, name: c.name, kind: c.kind,
      plan: finite(c.plan) && c.plan >= 0 ? c.plan : 0,
      color: typeof c.color === 'string' && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : PALETTE[categories.length % PALETTE.length],
      ...(c.savings === true && c.kind === 'expense' ? { savings: true } : {}),
      ...(c.tips === true && c.kind === 'income' ? { tips: true } : {}),
    });
  }
  const txs: Tx[] = [];
  const ids = new Set<string>();
  for (const t of raw.txs) {
    const date = isObj(t) ? storedDate(t.date) : null;
    if (!isObj(t) || typeof t.id !== 'string' || ids.has(t.id) || (t.kind !== 'expense' && t.kind !== 'income') ||
      !date || !finite(t.amount) || t.amount <= 0) { dropped++; continue; }
    ids.add(t.id);
    txs.push({ id: t.id, kind: t.kind, date, amount: t.amount,
      desc: typeof t.desc === 'string' ? t.desc : '', categoryId: typeof t.categoryId === 'string' ? t.categoryId : '' });
  }
  if (!categories.length) categories.push(...defaultCategories());
  // Операции без существующей категории иначе выпали бы из итогов месяца, но остались бы в остатке
  for (const t of txs) {
    const cat = categories.find((c) => c.id === t.categoryId);
    if (cat && cat.kind === t.kind) continue;
    const name = t.kind === 'expense' ? 'Прочее' : 'Прочие доходы';
    let other = categories.find((c) => c.kind === t.kind && c.name === name);
    if (!other) {
      other = { id: uid(), name, kind: t.kind, plan: 0, color: PALETTE[categories.length % PALETTE.length] };
      categories.push(other);
    }
    t.categoryId = other.id;
  }
  const months: Record<string, MonthMeta> = {};
  if (isObj(raw.months)) {
    for (const [k, v] of Object.entries(raw.months)) {
      if (!MONTH_RE.test(k) || !isObj(v)) continue;
      const meta: MonthMeta = {};
      if (finite(v.start)) meta.start = v.start;
      if (isObj(v.plans)) {
        const plans = Object.fromEntries(Object.entries(v.plans).filter(([, p]) => finite(p) && p >= 0)) as Record<string, number>;
        if (Object.keys(plans).length) meta.plans = plans;
      }
      months[k] = meta;
    }
  }
  const state: State = {
    version: 1,
    categories, txs, months,
    theme: raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : 'auto',
    style: raw.style === 'glass' ? 'glass' : 'minimal',
  };
  if (validDate(raw.lastBackup)) state.lastBackup = raw.lastBackup;
  return { state, dropped };
}

const MAX_AMOUNT = 1e12;

/** Число со знаком из поля ввода: «−1 200,50», «3000+1500», «0». null — не выражение из чисел, + и −. */
export function parseSigned(raw: string): number | null {
  const s = raw.replace(/[\s ₽]/g, '').replace(/[−–]/g, '-').replace(/,/g, '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([+-](\d+\.?\d*|\.\d+))*$/.test(s)) return null;
  const v = Math.round(s.match(/[+-]?[^+-]+/g)!.reduce((a, p) => a + Number(p), 0) * 100) / 100;
  return Math.abs(v) < MAX_AMOUNT ? v + 0 : null;
}

/** Сумма операции: как parseSigned, но только больше нуля */
export function parseExpr(raw: string): number | null {
  const v = parseSigned(raw);
  return v != null && v > 0 ? v : null;
}

export const monthKey = (date: string) => date.slice(0, 7);

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const monthTitle = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

export const rub = (n: number) =>
  `${Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ')} ₽`;

export const signedRub = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + rub(Math.abs(n));

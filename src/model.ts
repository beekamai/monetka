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

export interface State {
  version: 1;
  categories: Category[];
  txs: Tx[];
  months: Record<string, MonthMeta>;
  theme: 'auto' | 'light' | 'dark';
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
  return { version: 1, categories: defaultCategories(), txs: [], months: {}, theme: 'auto' };
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

import * as XLSX from 'xlsx';
import type { Category, Kind, State, Tx } from './model.ts';
import { PALETTE, monthKey, monthTitle, otherName, uid, validDate } from './model.ts';
import { summarize } from './calc.ts';
import { dict } from './i18n.ts';

/* Локализованы только подписи, которых импорт не читает; листы, заголовки и «Итого» остаются русскими — экспорт должен импортироваться обратно */
const t = dict({
  ru: { summaryTitle: 'Сводка — {month}', endBal: 'Остаток на конец периода', savingsDelta: 'Изменение сбережений',
    saved: 'Отложено (копилка)', tips: 'Чаевые', stash: 'В общем' },
  uk: { summaryTitle: 'Зведення — {month}', endBal: 'Залишок на кінець періоду', savingsDelta: 'Зміна заощаджень',
    saved: 'Відкладено (скарбничка)', tips: 'Чайові', stash: 'Загалом' },
  en: { summaryTitle: 'Summary — {month}', endBal: 'Balance at end of period', savingsDelta: 'Change in savings',
    saved: 'Set aside (savings)', tips: 'Tips', stash: 'Total' },
});

type Cell = string | number | boolean | Date | null | undefined;

const norm = (v: Cell) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export function parseAmount(v: Cell): number | null {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (v == null) return null;
  const s = String(v).replace(/[\s ₽]|руб\.?/gi, '').replace(/[−–]/g, '-');
  if (!s) return null;
  // «1.234,56» или «1234.56» или «1 234»
  const cleaned = s.includes(',') && s.includes('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(',', '.');
  const n = Number(cleaned.replace(/[^\d.-]/g, ''));
  return isFinite(n) && cleaned.match(/\d/) ? n : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function parseDate(v: Cell): string | null {
  const d = dateOf(v);
  return validDate(d) ? d : null;
}

function dateOf(v: Cell): string | null {
  if (v instanceof Date && !isNaN(+v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  }
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // формат Google: месяц/день/год
  if (m) return `${m[3]}-${pad(+m[1])}-${pad(+m[2])}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

export interface ImportResult {
  state: State;
  added: number;
  skipped: number;
  newCategories: string[];
  months: string[];
}

function rowsOf(ws: XLSX.WorkSheet): Cell[][] {
  return XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
}

export function importWorkbook(data: ArrayBuffer | Uint8Array, prev: State): ImportResult {
  const wb = XLSX.read(data, { type: 'array', cellDates: false });
  const state: State = structuredClone(prev);
  const newCategories: string[] = [];

  const findCat = (name: string, kind: Kind): Category => {
    const n = norm(name) || norm(otherName(kind));
    let cat = state.categories.find((c) => c.kind === kind && norm(c.name) === n);
    if (!cat) {
      const label = name.trim() || otherName(kind);
      cat = { id: uid(), name: label, kind, plan: 0, color: PALETTE[state.categories.length % PALETTE.length] };
      state.categories.push(cat);
      newCategories.push(label);
    }
    return cat;
  };

  // --- Транзакции ---
  const txName = wb.SheetNames.find((n) => norm(n).includes('транзакц')) ?? wb.SheetNames[1] ?? wb.SheetNames[0];
  const rows = rowsOf(wb.Sheets[txName]);
  const headerIdx = rows.findIndex((r) => r.filter((c) => norm(c) === 'дата').length >= 1 && r.some((c) => norm(c) === 'сумма'));
  let added = 0, skipped = 0;
  const months = new Map<string, number>();

  if (headerIdx >= 0) {
    const header = rows[headerIdx];
    const dateCols = header.map((c, i) => (norm(c) === 'дата' ? i : -1)).filter((i) => i >= 0);
    // Над заголовком подписи блоков «Расходы» / «Доходы»
    const above = rows[headerIdx - 1] ?? [];
    const blocks = dateCols.map((col, bi) => {
      let kind: Kind = bi === 0 ? 'expense' : 'income';
      for (let i = col; i >= 0 && i >= col - 1; i--) {
        const t = norm(above[i]);
        if (t.startsWith('доход')) kind = 'income';
        if (t.startsWith('расход')) kind = 'expense';
      }
      return { col, kind };
    });
    const exists = new Set(state.txs.map((t) => `${t.kind}|${t.date}|${t.amount}|${norm(t.desc)}`));

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      for (const b of blocks) {
        const date = parseDate(row[b.col]);
        const amount = parseAmount(row[b.col + 1]);
        if (!date || amount == null || amount === 0) continue;
        const desc = String(row[b.col + 2] ?? '').trim().replace(/^-\s*/, '');
        const cat = findCat(String(row[b.col + 3] ?? ''), b.kind);
        const key = `${b.kind}|${date}|${Math.abs(amount)}|${norm(desc)}`;
        if (exists.has(key)) { skipped++; continue; }
        exists.add(key);
        const tx: Tx = { id: uid(), kind: b.kind, date, amount: Math.abs(amount), desc, categoryId: cat.id };
        state.txs.push(tx);
        months.set(monthKey(date), (months.get(monthKey(date)) ?? 0) + 1);
        added++;
      }
    }
  }

  // Основной месяц файла — где больше всего операций
  const mainMonth = [...months.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  // --- Сводка: начальная сумма и планы ---
  const sumName = wb.SheetNames.find((n) => norm(n).includes('сводк'));
  if (sumName && mainMonth) {
    const srows = rowsOf(wb.Sheets[sumName]);
    const meta = (state.months[mainMonth] ??= {});
    for (const row of srows) {
      const i = row.findIndex((c) => norm(c).startsWith('начальная сумма'));
      if (i >= 0) {
        const v = row.slice(i + 1).map(parseAmount).find((x) => x != null);
        if (v != null) { meta.start = v; break; }
      }
    }
    // Блок «Итого» с колонками «Предполагаемые» — дальше построчно категории
    const hdr = srows.findIndex((r) => r.filter((c) => norm(c) === 'предполагаемые').length >= 2 && r.some((c) => norm(c) === 'разница'));
    if (hdr >= 0) {
      const h = srows[hdr];
      const planCols = h.map((c, i) => (norm(c) === 'предполагаемые' ? i : -1)).filter((i) => i >= 0);
      const nameCols = planCols.map((pc) => {
        for (let i = pc - 1; i >= 0; i--) {
          const below = srows[hdr + 1]?.[i];
          if (norm(below) === 'итого') return i;
        }
        return pc - 2;
      });
      meta.plans ??= {};
      planCols.forEach((pc, bi) => {
        const kind: Kind = bi === 0 ? 'expense' : 'income';
        for (let r = hdr + 2; r < srows.length; r++) {
          const name = String(srows[r][nameCols[bi]] ?? '').trim();
          if (!name || norm(name) === 'итого') continue;
          if (norm(name).startsWith('регулировка')) continue;
          const plan = parseAmount(srows[r][pc]);
          if (plan == null) continue;
          const cat = findCat(name, kind);
          meta.plans![cat.id] = plan;
        }
      });
    }
  }

  return { state, added, skipped, newCategories, months: [...months.keys()].sort() };
}

export function exportMonth(s: State, key: string): Uint8Array {
  const m = summarize(s, key);
  const catName = (id: string) => s.categories.find((c) => c.id === id)?.name ?? '';
  const ruDate = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

  const summary: Cell[][] = [
    [t('summaryTitle', { month: monthTitle(key) })],
    [],
    ['Начальная сумма', m.start],
    [t('endBal'), m.end],
    [t('savingsDelta'), m.delta, m.deltaPct == null ? '' : `${(m.deltaPct * 100).toFixed(0)}%`],
    [t('saved'), m.saved],
    [t('tips'), m.tips],
    [t('stash'), m.stash],
    [],
    ['Расходы', 'Предполагаемые', 'Фактические', 'Разница', '', 'Доходы', 'Предполагаемые', 'Фактические', 'Разница'],
    ['Итого', m.expensePlanTotal, m.expenseTotal, m.expensePlanTotal - m.expenseTotal, '', 'Итого', m.incomePlan, m.income, m.income - m.incomePlan],
  ];
  const n = Math.max(m.expenseRows.length, m.incomeRows.length);
  for (let i = 0; i < n; i++) {
    const e = m.expenseRows[i], inc = m.incomeRows[i];
    summary.push([
      e?.cat.name ?? '', e?.plan ?? '', e?.fact ?? '', e ? e.diff : '', '',
      inc?.cat.name ?? '', inc?.plan ?? '', inc?.fact ?? '', inc ? inc.diff : '',
    ]);
  }

  const exp = m.txs.filter((t) => t.kind === 'expense').sort((a, b) => a.date.localeCompare(b.date));
  const inc = m.txs.filter((t) => t.kind === 'income').sort((a, b) => a.date.localeCompare(b.date));
  const trans: Cell[][] = [
    ['Расходы', '', '', '', '', 'Доходы'],
    ['Дата', 'Сумма', 'Описание', 'Категория', '', 'Дата', 'Сумма', 'Описание', 'Категория'],
  ];
  for (let i = 0; i < Math.max(exp.length, inc.length); i++) {
    const a = exp[i], b = inc[i];
    trans.push([
      a ? ruDate(a.date) : '', a?.amount ?? '', a?.desc ?? '', a ? catName(a.categoryId) : '', '',
      b ? ruDate(b.date) : '', b?.amount ?? '', b?.desc ?? '', b ? catName(b.categoryId) : '',
    ]);
  }

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(summary);
  ws1['!cols'] = [{ wch: 26 }, { wch: 15 }, { wch: 13 }, { wch: 12 }, { wch: 3 }, { wch: 26 }, { wch: 15 }, { wch: 13 }, { wch: 12 }];
  const ws2 = XLSX.utils.aoa_to_sheet(trans);
  ws2['!cols'] = [{ wch: 11 }, { wch: 11 }, { wch: 50 }, { wch: 22 }, { wch: 3 }, { wch: 11 }, { wch: 11 }, { wch: 30 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Сводка');
  XLSX.utils.book_append_sheet(wb, ws2, 'Транзакции');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

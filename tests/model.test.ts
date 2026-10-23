// Проверка: битые данные не роняют приложение и не теряют уцелевшие записи; ввод сумм; динамика по месяцам
import assert from 'node:assert/strict';
import { emptyState, normalizeState, parseExpr, parseSigned, shiftDay, uid, validDate } from '../src/model.ts';
import { monthTrend, summarize } from '../src/calc.ts';
import { pickSlot, serialize } from '../src/persist.ts';
import { parseDate } from '../src/xlsxio.ts';
import type { State } from '../src/model.ts';

// --- normalizeState: не база Монетки ---
for (const bad of [null, 42, 'x', [], {}, { version: 2, txs: [], categories: [] }, { version: 1, txs: {}, categories: [] }, { version: 1, txs: [] }]) {
  assert.equal(normalizeState(bad), null, JSON.stringify(bad));
}

// --- Испорченные записи отбрасываются поштучно, остальное сохраняется ---
const base = emptyState();
const food = base.categories.find((c) => c.name === 'Питание')!;
const salary = base.categories.find((c) => c.name === 'Зарплата')!;
const dirty = {
  ...base,
  theme: 'neon',
  style: 'glass',
  categories: [...base.categories, { id: food.id, name: 'дубль', kind: 'expense' }, { id: 'x', name: 5 }, { id: 'y', name: 'Без типа', kind: 'other' }],
  txs: [
    { id: 'a', kind: 'expense', date: '2026-10-01', amount: 100, desc: 'ok', categoryId: food.id },
    { id: 'a', kind: 'expense', date: '2026-10-01', amount: 999, desc: 'дубль id', categoryId: food.id },
    { id: 'b', kind: 'expense', date: '01.10.2026', amount: 50, categoryId: food.id },
    { id: 'c', kind: 'expense', date: '2026-10-02', amount: NaN, categoryId: food.id },
    { id: 'd', kind: 'expense', date: '2026-10-02', amount: -5, categoryId: food.id },
    { id: 'e', kind: 'income', date: '2026-10-03', amount: 1000, desc: 7, categoryId: salary.id },
    { id: 'f', kind: 'expense', date: '2026-10-04', amount: 30, desc: 'сирота', categoryId: 'deleted' },
    { id: 'g', kind: 'income', date: '2026-10-05', amount: 20, desc: 'не тот тип', categoryId: food.id },
    'мусор',
  ],
  months: { '2026-10': { start: 500, plans: { [food.id]: 300, bad: -1, worse: 'x' } }, 'не месяц': { start: 1 }, '2026-11': { start: 'x' } },
};
const n = normalizeState(dirty)!;
assert.ok(n);
assert.equal(n.theme, 'auto');
assert.equal(n.style, 'glass');
assert.deepEqual(n.txs.map((t) => t.id), ['a', 'e', 'f', 'g']);
assert.equal(n.txs[0].amount, 100);
assert.equal(n.txs.find((t) => t.id === 'e')!.desc, '');
assert.equal(n.categories.filter((c) => c.id === food.id).length, 1);
assert.ok(!n.categories.some((c) => c.id === 'x' || c.id === 'y'));
// Сироты и операции с категорией чужого типа попадают в «Прочее», а не выпадают из итогов
const other = n.categories.find((c) => c.name === 'Прочее' && c.kind === 'expense')!;
const otherInc = n.categories.find((c) => c.name === 'Прочие доходы' && c.kind === 'income')!;
assert.equal(n.txs.find((t) => t.id === 'f')!.categoryId, other.id);
assert.equal(n.txs.find((t) => t.id === 'g')!.categoryId, otherInc.id);
assert.deepEqual(n.months['2026-10'], { start: 500, plans: { [food.id]: 300 } });
assert.equal(n.months['не месяц'], undefined);
assert.deepEqual(n.months['2026-11'], {});
const sm = summarize(n, '2026-10');
assert.equal(sm.expenseTotal, 130);
assert.equal(sm.income, 1020);
assert.equal(sm.end, 500 + 1020 - 130);

// Пустой список категорий не оставляет приложение без категорий
assert.ok(normalizeState({ version: 1, txs: [], categories: [] })!.categories.length > 10);
// Уже чистое состояние проходит без изменений
assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(base))), base);

// --- parseExpr ---
assert.equal(parseExpr('1 200,50'), 1200.5);
assert.equal(parseExpr('350+120−40'), 430);
assert.equal(parseExpr('0.1+0.2'), 0.3);
assert.equal(parseExpr('1200 ₽'), 1200);
for (const bad of ['', 'abc', '0', '-5', '10-20', '1e5', '5++', '1.2.3', '2*3', '9999999999999']) {
  assert.equal(parseExpr(bad), null, bad);
}

// --- Рост в процентах при отрицательной начальной сумме ---
const debt: State = { ...emptyState(), months: { '2026-10': { start: -1000 } } };
const catOf = (st: State, name: string) => st.categories.find((c) => c.name === name)!.id;
debt.txs.push({ id: uid(), kind: 'income', date: '2026-10-10', amount: 1000, desc: '', categoryId: catOf(debt, 'Зарплата') });
const dm = summarize(debt, '2026-10');
assert.equal(dm.end, 0);
assert.ok(dm.deltaPct! > 0, 'долг уменьшился — рост положительный');

// --- monthTrend совпадает с помесячными итогами ---
const t: State = emptyState();
const jar = t.categories.find((c) => c.savings)!;
t.months['2026-08'] = { start: 1000 };
t.txs.push(
  { id: uid(), kind: 'income', date: '2026-08-05', amount: 5000, desc: '', categoryId: catOf(t, 'Зарплата') },
  { id: uid(), kind: 'expense', date: '2026-08-06', amount: 1200, desc: '', categoryId: catOf(t, 'Питание') },
  { id: uid(), kind: 'expense', date: '2026-09-02', amount: 700, desc: '', categoryId: jar.id },
  { id: uid(), kind: 'income', date: '2026-10-01', amount: 3000, desc: '', categoryId: catOf(t, 'Зарплата') },
);
t.months['2026-10'] = { start: 10000 };
const tr = monthTrend(t, '2026-10', 4);
assert.deepEqual(tr.map((p) => p.key), ['2026-07', '2026-08', '2026-09', '2026-10']);
for (const p of tr) assert.equal(p.end, summarize(t, p.key).end, p.key);
assert.equal(tr[2].saved, 700);
assert.equal(tr[3].end, 13000);

// --- Даты: только существующие ---
for (const ok of ['2026-02-28', '2028-02-29', '2026-12-31']) assert.ok(validDate(ok), ok);
for (const bad of ['2026-13-45', '2026-02-30', '2027-02-29', '2026-00-10', '202-01-05', '2026-1-5', 20261010, null]) assert.ok(!validDate(bad), String(bad));
assert.equal(parseDate('45.13.2026'), null);
assert.equal(parseDate('31.04.2026'), null);
assert.equal(normalizeState({ ...emptyState(), txs: [{ id: 'z', kind: 'expense', date: '2026-13-45', amount: 5, categoryId: '' }] })!.txs.length, 0);
// Версия 1.0 пропускала «30.02» и «31.04»: такие операции прижимаются к концу месяца, а не теряются
const clamp = normalizeState({ ...emptyState(), txs: [
  { id: 'f', kind: 'expense', date: '2026-02-30', amount: 5, categoryId: '' },
  { id: 'g', kind: 'expense', date: '2026-04-31', amount: 5, categoryId: '' },
  { id: 'h', kind: 'expense', date: '2026-04-32', amount: 5, categoryId: '' },
] })!;
assert.deepEqual(clamp.txs.map((t) => t.date), ['2026-02-28', '2026-04-30']);

// --- parseSigned: начальная сумма и планы (ноль и минус допустимы) ---
assert.equal(parseSigned('3000+1500'), 4500);
assert.equal(parseSigned('−1 000'), -1000);
assert.equal(parseSigned('0'), 0);
assert.equal(Object.is(parseSigned('-0'), -0), false);
for (const bad of ['12abc', '1e5', '1.000.5', '', '+']) assert.equal(parseSigned(bad), null, bad);
assert.equal(parseExpr('0'), null);

// --- Слоты A/B: обрыв записи в одном слоте не теряет базу ---
const st1 = emptyState();
st1.txs.push({ id: 't1', kind: 'expense', date: '2026-10-01', amount: 10, desc: '', categoryId: catOf(st1, 'Питание') });
const st2: State = { ...st1, txs: [...st1.txs, { id: 't2', kind: 'expense', date: '2026-10-02', amount: 20, desc: '', categoryId: catOf(st1, 'Питание') }] };
const a = serialize(7, st1), b = serialize(8, st2);
let p = pickSlot([a, b]);
assert.equal(p.seq, 8); assert.equal(p.state!.txs.length, 2); assert.deepEqual(p.damaged, []);
p = pickSlot([a, b.slice(0, b.length / 2)]);
assert.equal(p.seq, 7, 'оборванная запись — остаётся предыдущая версия');
assert.equal(p.state!.txs.length, 1);
assert.equal(p.damaged.length, 1, 'оборванный текст сохраняется для выгрузки');
p = pickSlot([null, null]);
assert.equal(p.state, null); assert.equal(p.damaged.length, 0);
p = pickSlot(['мусор', null]);
assert.equal(p.state, null); assert.equal(p.damaged.length, 1);
// Частично испорченная база загружается, а исходник уходит в damaged
const partly = JSON.stringify({ seq: 3, state: { ...st2, txs: [...st2.txs, { id: 'bad', amount: 'x' }] } });
p = pickSlot([partly, null]);
assert.equal(p.state!.txs.length, 2); assert.equal(p.dropped, 1); assert.deepEqual(p.damaged, [partly]);
// Переезд с версии 1.0: голое состояние, обёрнутое загрузчиком
p = pickSlot([`{"seq":2,"state":${JSON.stringify(st2)}}`, `{"seq":1,"state":${JSON.stringify(st1)}}`]);
assert.equal(p.state!.txs.length, 2);

// --- Откладывание напоминания о копии: дата переживает перезапуск, мусор отбрасывается ---
assert.equal(shiftDay('2026-10-23', 14), '2026-11-06');
assert.equal(shiftDay('2026-12-25', 14), '2027-01-08', 'через год');
assert.equal(shiftDay('2028-02-20', 14), '2028-03-05', 'високосный февраль');
assert.equal(normalizeState({ ...emptyState(), backupSnooze: '2026-11-06' })!.backupSnooze, '2026-11-06');
assert.equal(normalizeState({ ...emptyState(), backupSnooze: '2026-02-31' })!.backupSnooze, undefined);
assert.equal(normalizeState({ ...emptyState(), backupSnooze: 5 })!.backupSnooze, undefined);

console.log('OK: модель, нормализация и динамика');

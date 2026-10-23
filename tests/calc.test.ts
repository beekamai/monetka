// Проверка: импорт файла в формате шаблона «Месячный бюджет» и совпадение итогов с таблицей (данные выдуманы)
import * as XLSX from 'xlsx';
import assert from 'node:assert/strict';
import { emptyState } from '../src/model.ts';
import { summarize } from '../src/calc.ts';
import { importWorkbook, exportMonth, parseDate, parseAmount } from '../src/xlsxio.ts';

const exp: [string, string, string, string][] = [
  ['02.10.2026', '3000.00 ₽', 'в копилку', 'В копилку'],
  ['03.10.2026', '1200.00 ₽', 'Дал в долг другу', 'Задолженности'],
  ['05.10.2026', '2350.00 ₽', 'Продукты', 'Питание'],
  ['06.10.2026', '400.00 ₽', '- Такси', 'Личные расходы'],
  ['08.10.2026', '950.00 ₽', 'Интернет и связь', 'Коммунальные услуги'],
  ['10.10.2026', '5400.00 ₽', 'Кроссовки', 'Одежда'],
  ['12.10.2026', '1780.00 ₽', 'Продукты', 'Питание'],
  ['12.10.2026', '349.00 ₽', 'Музыкальный сервис', 'Подписки'],
  ['15.10.2026', '500.00 ₽', 'в копилку', 'В копилку'],
  ['18.10.2026', '90.00 ₽', 'Проезд', 'Общественный транспорт'],
  ['20.10.2026', '2600.00 ₽', 'Кафе', 'Питание'],
  ['22.10.2026', '12990.00 ₽', 'Наушники', 'Техника'],
  ['25.10.2026', '1500.00 ₽', 'Подарок на день рождения', 'Подарки'],
];
const inc: [string, number, string, string][] = [
  ['10/1/2026', 60000, 'Зарплата', 'Зарплата'],
  ['10/11/2026', 4000, '', 'Премия'],
  ['10/15/2026', 1250, 'Чаевые за неделю', 'Чаевые'],
  ['10/25/2026', 60000, 'Зарплата', 'Зарплата'],
];

// Лист «Транзакции» в раскладке шаблона: блоки с колонки B и G
const tx: (string | number)[][] = [
  ['Транзакции'], ['', 'Расходы', '', '', '', '', 'Доходы'],
  ['', 'Дата', 'Сумма', 'Описание', 'Категория', '', 'Дата', 'Сумма', 'Описание', 'Категория'],
];
for (let i = 0; i < exp.length; i++) {
  const e = exp[i], n = inc[i];
  tx.push(['', ...e, '', ...(n ?? ['', '', '', ''])]);
}
// Лист «Сводка» с начальной суммой и блоком планов
const sv: (string | number)[][] = [
  ['Сводка'], [], ['', 'Месячный бюджет', '', '', '', '', '', '', 'Начальная сумма: ', '', '', '15000 ₽'], [],
  ['', 'Расходы', '', '', '', '', '', 'Доходы'],
  ['', '', '', 'Предполагаемые', 'Фактические', 'Разница', '', '', '', 'Предполагаемые', 'Фактические', 'Разница'],
  ['', 'Итого', '', '18500 ₽', '33109 ₽', '', '', 'Итого', '', '0 ₽', '125250 ₽', ''],
  [],
  ['', 'Питание', '', '8000 ₽', '', '', '', 'Зарплата', '', '0 ₽'],
  ['', 'Общественный транспорт', '', '1000 ₽'],
  ['', 'Личные расходы', '', '3000 ₽'],
  ['', 'Коммунальные услуги', '', '2500 ₽'],
  ['', 'В копилку', '', '3000 ₽'],
  ['', 'Подписки', '', '1000 ₽'],
];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sv), 'Сводка');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tx), 'Транзакции');
const buf = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));

const r = importWorkbook(buf, emptyState());
assert.equal(r.added, 17);
assert.deepEqual(r.months, ['2026-10']);
assert.deepEqual(r.newCategories, []);
const m = summarize(r.state, '2026-10');
assert.equal(m.start, 15000);
assert.equal(m.income, 125250);
assert.equal(m.tips, 1250);
assert.equal(m.expenseTotal, 33109);
assert.equal(m.saved, 3500);
assert.equal(m.stash, 4750);
assert.equal(m.spent, 29609);
assert.equal(m.end, 107141);
assert.equal(m.delta, 92141);
assert.equal(Math.round(m.deltaPct! * 100), 614);
assert.ok(m.txs.some((t) => t.desc === 'Такси'));
const plan = (name: string) => m.expenseRows.find((x) => x.cat.name === name)!.plan;
assert.equal(plan('Питание'), 8000);
assert.equal(plan('Подписки'), 1000);
assert.equal(m.expensePlanTotal, 18500);

// Повторный импорт не дублирует
const r2 = importWorkbook(buf, r.state);
assert.equal(r2.added, 0);
assert.equal(r2.skipped, 17);

// Следующий месяц стартует с остатка
const nov = summarize(r.state, '2026-11');
assert.equal(nov.start, 107141);
assert.equal(nov.startIsAuto, true);

// Экспорт → импорт в пустое состояние даёт те же итоги
const back = importWorkbook(exportMonth(r.state, '2026-10'), emptyState());
const m2 = summarize(back.state, '2026-10');
assert.equal(m2.expenseTotal, 33109);
assert.equal(m2.income, 125250);
assert.equal(m2.start, 15000);

assert.equal(parseDate('10/21/2026'), '2026-10-21');
assert.equal(parseDate('02.10.2026'), '2026-10-02');
assert.equal(parseAmount('1 234,50 ₽'), 1234.5);
assert.equal(parseAmount(''), null);

console.log('OK: все проверки пройдены');

if (process.env.DUMP_STATE) {
  const fs = await import('node:fs');
  fs.writeFileSync(process.env.DUMP_STATE, JSON.stringify(r.state));
}

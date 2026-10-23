/* Демо-данные для браузера (?demo): полгода правдоподобных операций для скриншотов и проверки графиков. Ничего не сохраняет. */
import type { State, Tx } from './model.ts';
import { emptyState, monthKey, shiftMonth, todayISO, uid } from './model.ts';

export function demoState(): State {
  const s = emptyState();
  const cat = (name: string) => s.categories.find((c) => c.name === name)!.id;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const txs: Tx[] = [];
  const add = (kind: Tx['kind'], date: string, amount: number, desc: string, c: string) =>
    txs.push({ id: uid(), kind, date, amount: Math.round(amount), desc, categoryId: cat(c) });
  const now = monthKey(todayISO());
  const today = Number(todayISO().slice(8, 10));
  for (let back = 5; back >= 0; back--) {
    const k = shiftMonth(now, -back);
    const last = back === 0 ? today : 28;
    const d = (n: number) => `${k}-${String(Math.min(n, last)).padStart(2, '0')}`;
    add('income', d(5), 31000 + rnd() * 4000, 'Зарплата', 'Зарплата');
    if (back !== 0 || today >= 20) add('income', d(20), 22000 + rnd() * 3000, 'Аванс', 'Зарплата');
    if (rnd() > 0.5) add('income', d(14), 3000 + rnd() * 5000, 'Подработка', 'Премия');
    add('expense', d(2), 5000, 'В копилку', 'В копилку');
    add('expense', d(3), 4200, 'Интернет и свет', 'Коммунальные услуги');
    add('expense', d(6), 799, 'Музыка и кино', 'Подписки');
    for (let day = 1; day <= last; day += 2 + Math.floor(rnd() * 3)) {
      add('expense', d(day), 600 + rnd() * 2400, rnd() > 0.5 ? 'Продукты' : 'Кафе', 'Питание');
      if (rnd() > 0.6) add('expense', d(day), 60 + rnd() * 300, 'Проезд', 'Общественный транспорт');
      if (rnd() > 0.82) add('expense', d(day), 900 + rnd() * 4000, 'Мелочи', 'Личные расходы');
    }
    if (rnd() > 0.55) add('expense', d(17), 3500 + rnd() * 9000, 'Одежда', 'Одежда');
    if (rnd() > 0.7) add('expense', d(23), 2500 + rnd() * 3000, 'Подарок', 'Подарки');
  }
  s.txs = txs;
  s.lastBackup = todayISO();
  s.onboarded = true;
  s.months[shiftMonth(now, -5)] = { start: 25000 };
  for (const c of s.categories) {
    if (c.name === 'Питание') c.plan = 22000;
    if (c.name === 'Общественный транспорт') c.plan = 2500;
    if (c.name === 'Подписки') c.plan = 1000;
    if (c.name === 'В копилку') c.plan = 5000;
  }
  return s;
}

// Проверка хранилища на сбоях: переезд с 1.0, упавшая запись, нечитаемый слот, оборванная запись — данные не теряются
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import type { State } from '../src/model.ts';

const files = new Map<string, string>();
const prefs = new Map<string, string>();
let failWrite = (_p: string) => false;
let failRead = (_p: string) => false;
let writes = 0;

mock.module('@capacitor/core', { namedExports: { Capacitor: { isNativePlatform: () => false } } });
mock.module('@capacitor/preferences', { namedExports: { Preferences: { get: async ({ key }: { key: string }) => ({ value: prefs.get(key) ?? null }) } } });
mock.module('@capacitor/filesystem', {
  namedExports: {
    Directory: { Data: 'DATA', Cache: 'CACHE' },
    Encoding: { UTF8: 'utf8' },
    Filesystem: {
      readFile: async ({ path }: { path: string }) => {
        if (failRead(path)) throw new Error('EIO: i/o error');
        if (!files.has(path)) throw new Error('File does not exist.');
        return { data: files.get(path)! };
      },
      writeFile: async ({ path, data }: { path: string; data: string }) => {
        writes++;
        if (failWrite(path)) { files.set(path, ''); throw new Error('ENOSPC: no space left on device'); }
        files.set(path, data);
        return { uri: path };
      },
      readdir: async ({ path }: { path: string }) => ({
        files: [...files.keys()].filter((k) => k.startsWith(path + '/')).map((k) => ({ name: k.slice(path.length + 1) })),
      }),
      deleteFile: async ({ path }: { path: string }) => { files.delete(path); },
    },
  },
});

const { load, createSaver } = await import('../src/storage.ts');
const { emptyState, uid } = await import('../src/model.ts');

const reset = () => { files.clear(); prefs.clear(); failWrite = () => false; failRead = () => false; writes = 0; };
const withTx = (s: State, amount: number): State => {
  const cat = s.categories.find((c) => c.kind === 'expense')!.id;
  return { ...s, txs: [...s.txs, { id: uid(), kind: 'expense', date: '2026-10-01', amount, desc: '', categoryId: cat }] };
};
const noop = () => undefined;

// 0. Признак первого запуска: только когда сохранённой базы нет совсем — от него зависит, останется ли база 1.x на ru/RUB
reset();
assert.equal((await load()).fresh, true, 'пустое хранилище — первый запуск');
files.set('monetka/state-a.json', JSON.stringify({ seq: 1, state: emptyState() }));
assert.ok(!(await load()).fresh, 'сохранённая база, даже пустая, — не первый запуск');
reset();
prefs.set('budget-state-v1', JSON.stringify(emptyState()));
assert.ok(!(await load()).fresh, 'база 1.0 в Preferences — не первый запуск');
reset();
files.set('monetka/state-a.json', '{"seq":1,"state":{обрыв');
const dmg = await load();
assert.ok(!dmg.fresh, 'повреждённая база — не первый запуск');
assert.equal(typeof dmg.notice, 'function', 'текст уведомления собирается при показе, на языке базы');

// 1. Переезд с версии 1.0: данные из Preferences подхватываются
reset();
const legacy = withTx(emptyState(), 300);
prefs.set('budget-state-v1', JSON.stringify(legacy));
let r = await load();
assert.equal(r.persist, true);
assert.equal(r.state.txs.length, 1);

// 2. Первая запись после переезда упала (нет места) и оставила пустой слот — данные 1.0 не потеряны
let errors = 0;
failWrite = () => true;
let saver = createSaver(r.seq, () => errors++);
saver.save(r.state);
await saver.flush();
assert.equal(errors, 1, 'ошибка записи доходит до интерфейса');
failWrite = () => false;
r = await load();
assert.equal(r.state.txs.length, 1, 'пустой слот от упавшей записи не прячет данные 1.0');

// 3. Обычная работа: правки пишутся по очереди в два слота, после перезапуска — последняя версия
reset();
r = await load();
assert.equal(r.state.txs.length, 0);
saver = createSaver(r.seq, noop);
let s = withTx(r.state, 100);
saver.save(s); await saver.flush();
s = withTx(s, 200);
saver.save(s); await saver.flush();
r = await load();
assert.equal(r.state.txs.length, 2);

// 4. Оборванная запись портит только один слот: загружается предыдущая версия, оборванный текст отложен
const newest = r.seq % 2 === 0 ? 'monetka/state-a.json' : 'monetka/state-b.json';
files.set(newest, files.get(newest)!.slice(0, 40));
r = await load();
assert.equal(r.persist, true);
assert.equal(r.state.txs.length, 1, 'предыдущая версия из второго слота');
assert.ok([...files.keys()].some((k) => k.includes('broken-')), 'оборванный текст сохранён для выгрузки');

// 5. Нечитаемый слот (ошибка диска) не скрывает второй, но запись выключается, чтобы ничего не затереть
reset();
r = await load();
saver = createSaver(r.seq, noop);
s = withTx(r.state, 50);
saver.save(s); await saver.flush();
s = withTx(s, 60);
saver.save(s); await saver.flush();
const older = (await load()).seq % 2 === 0 ? 'monetka/state-b.json' : 'monetka/state-a.json';
failRead = (p) => p !== older && p.includes('state-');
r = await load();
assert.equal(r.persist, false);
assert.equal(r.state.txs.length, 1, 'читаемый слот всё равно показан');
assert.ok(r.notice);

// 6. Повреждённую базу не удалось отложить (нет места) — запись выключена, исходник не затирается
reset();
files.set('monetka/state-a.json', '{"seq":1,"state":{обрыв');
failWrite = (p) => p.includes('broken-');
r = await load();
assert.equal(r.persist, false);
assert.equal(files.get('monetka/state-a.json'), '{"seq":1,"state":{обрыв');

// 7. Тот же объект повторно не пишется: двойной flush при сворачивании — одна запись
reset();
r = await load();
saver = createSaver(r.seq, noop);
s = withTx(r.state, 10);
writes = 0;
saver.save(s); await saver.flush();
saver.save(s); await saver.flush();
await saver.flush();
assert.equal(writes, 1);

console.log('OK: хранилище переживает сбои');

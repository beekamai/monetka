/*
 * Хранение базы: два файла-слота в приватной папке приложения, запись по очереди с растущим seq.
 * Обрыв записи портит только один слот — второй хранит предыдущую версию. Filesystem, а не Preferences:
 * на Android Preferences пишет через apply() и молча теряет ошибки записи (например, нет места).
 */
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import type { State } from './model.ts';
import { emptyState, normalizeReport } from './model.ts';
import { pickSlot, serialize } from './persist.ts';
import { dict } from './i18n.ts';

const t = dict({
  ru: {
    readOnly: 'Не удалось прочитать или подстраховать базу — изменения сейчас не сохраняются, чтобы ничего не затереть. Освободи место на телефоне и перезапусти приложение.',
    damaged: 'База была повреждена и не читается. Исходные данные сохранены: «Ещё → Данные → Выгрузить повреждённые данные».',
    dropped: 'Пропущено повреждённых записей: {n}, остальное на месте. Исходник сохранён: «Ещё → Данные → Выгрузить повреждённые данные».',
    shareTitle: 'Сохранить или отправить',
  },
  uk: {
    readOnly: 'Не вдалося прочитати або підстрахувати базу — зміни зараз не зберігаються, щоб нічого не перезаписати. Звільни місце на телефоні й перезапусти застосунок.',
    damaged: 'База була пошкоджена й не читається. Вихідні дані збережено: «Ще → Дані → Вивантажити пошкоджені дані».',
    dropped: 'Пропущено пошкоджених записів: {n}, решта на місці. Вихідні дані збережено: «Ще → Дані → Вивантажити пошкоджені дані».',
    shareTitle: 'Зберегти або надіслати',
  },
  en: {
    readOnly: "Couldn't read or back up the database, so changes aren't being saved right now to avoid overwriting anything. Free up some space on your phone and restart the app.",
    damaged: 'The database was damaged and cannot be read. The original data is kept: "More → Data → Export damaged data".',
    dropped: 'Skipped damaged records: {n}, everything else is intact. The original is kept: "More → Data → Export damaged data".',
    shareTitle: 'Save or share',
  },
});

const DIR = 'monetka';
const SLOTS = [`${DIR}/state-a.json`, `${DIR}/state-b.json`];
const BEFORE_RESTORE = 'before-restore-';
/** Ключи версии 1.0, где база жила в Preferences: читаются один раз для переезда */
const LEGACY = ['budget-state-v1', 'budget-state-v1-lastgood'];
const fs = { directory: Directory.Data, encoding: Encoding.UTF8 } as const;

export interface Loaded {
  state: State;
  seq: number;
  /** Текст собирается при показе: язык базы становится известен только после загрузки */
  notice?: () => string;
  /** false — хранилище не читается, и запись поверх могла бы уничтожить данные */
  persist: boolean;
  /** true — сохранённой базы нет совсем: первый запуск */
  fresh?: boolean;
}

const missing = (e: unknown) => /not exist|does not exist|no such|not found|ENOENT/i.test(String((e as Error)?.message ?? e));

/** null — файла нет; бросает, если файл есть, но не читается */
async function read(path: string): Promise<string | null> {
  try {
    return (await Filesystem.readFile({ path, ...fs })).data as string;
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

async function write(path: string, data: string) {
  await Filesystem.writeFile({ path, data, recursive: true, ...fs });
}

/** true — все тексты легли в broken-файлы; false — хотя бы один не записан, и затирать исходник нельзя */
async function keepBroken(raws: string[]): Promise<boolean> {
  let ok = true;
  for (const raw of raws) {
    await write(`${DIR}/broken-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`, raw).catch(() => { ok = false; });
  }
  return ok;
}

export async function load(): Promise<Loaded> {
  const settled = await Promise.allSettled(SLOTS.map(read));
  const unreadable = settled.some((r) => r.status === 'rejected');
  let p = pickSlot(settled.map((r) => (r.status === 'fulfilled' ? r.value : null)));
  // Данные версии 1.0 — пока нет ни одного читаемого слота (а не «нет файлов»: пустой слот от упавшей записи не должен их прятать)
  if (!p.state && !unreadable) {
    let old: (string | null)[];
    try {
      old = await Promise.all(LEGACY.map(async (key) => (await Preferences.get({ key })).value));
    } catch {
      return { state: emptyState(), seq: 0, persist: false, notice: () => t('readOnly') };
    }
    if (old.some((r) => r != null)) {
      // Старый формат — голое состояние без seq: заворачиваем, основной ключ приоритетнее снимка
      const wrapped = old.map((r, i) => (r == null ? null : `{"seq":${LEGACY.length - i},"state":${r}}`));
      const lp = pickSlot(wrapped);
      lp.damaged = [...p.damaged, ...lp.damaged.map((r) => r.replace(/^\{"seq":\d+,"state":/, '').slice(0, -1))];
      p = lp;
    }
  }
  const kept = p.damaged.length ? await keepBroken(p.damaged) : true;
  const persist = !unreadable && kept;
  if (!p.state) {
    if (!p.damaged.length && persist) return { state: emptyState(), seq: 0, persist, fresh: true };
    return {
      state: emptyState(), seq: p.seq, persist,
      notice: persist ? () => t('damaged') : () => t('readOnly'),
    };
  }
  let notice: (() => string) | undefined;
  const dropped = p.dropped;
  if (!persist) notice = () => t('readOnly');
  else if (dropped) notice = () => t('dropped', { n: dropped });
  return { state: p.state, seq: p.seq, persist, notice };
}

/** Отложенная запись: частые правки склеиваются, при сворачивании пишется сразу. Ошибка записи — onError. */
export function createSaver(startSeq: number, onError: () => void) {
  let seq = startSeq;
  let pending: State | null = null;
  /** Последний поставленный в очередь объект: тот же объект повторно не пишется (двойной flush при сворачивании) */
  let queued: State | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let chain = Promise.resolve();
  let failed = false;

  const flush = () => {
    clearTimeout(timer);
    chain = chain.then(async () => {
      if (!pending) return;
      const s = pending;
      pending = null;
      const next = seq + 1;
      try {
        await write(SLOTS[next % 2], serialize(next, s));
        seq = next;
        failed = false;
      } catch {
        pending ??= s;
        if (!failed) onError();
        failed = true;
      }
    });
    return chain;
  };

  return {
    save(s: State) {
      if (s === queued) return;
      queued = s;
      pending = s;
      clearTimeout(timer);
      timer = setTimeout(flush, 300);
    },
    flush,
  };
}

async function listFiles(prefix: string): Promise<string[]> {
  try {
    const { files } = await Filesystem.readdir({ path: DIR, directory: Directory.Data });
    return files.map((f) => f.name).filter((n) => n.startsWith(prefix)).sort();
  } catch { return []; }
}

const KEEP_SNAPSHOTS = 5;

/** Текущая база перед восстановлением из копии. Снимки не перезаписывают друг друга: хранятся последние пять. */
export async function saveBeforeRestore(s: State) {
  await write(`${DIR}/${BEFORE_RESTORE}${String(Date.now()).padStart(15, '0')}.json`, JSON.stringify(s));
  const all = await listFiles(BEFORE_RESTORE);
  for (const n of all.slice(0, -KEEP_SNAPSHOTS)) await Filesystem.deleteFile({ path: `${DIR}/${n}`, directory: Directory.Data }).catch(() => undefined);
}

/** Самый свежий снимок перед восстановлением */
export async function beforeRestore(): Promise<{ name: string; state: State } | null> {
  const name = (await listFiles(BEFORE_RESTORE)).at(-1);
  if (!name) return null;
  try {
    const state = normalizeReport(JSON.parse((await read(`${DIR}/${name}`)) ?? 'null'))?.state;
    return state ? { name, state } : null;
  } catch { return null; }
}

export async function dropBeforeRestore(name: string) {
  await Filesystem.deleteFile({ path: `${DIR}/${name}`, directory: Directory.Data }).catch(() => undefined);
}

const brokenFiles = () => listFiles('broken-');

export async function hasBroken() {
  return (await brokenFiles()).length > 0;
}

/** Все сохранённые повреждённые записи одним файлом; true — пользователь его действительно сохранил/отправил. Бросает, если файл не прочитался. */
export async function exportBroken(): Promise<boolean> {
  const names = await brokenFiles();
  const parts = await Promise.all(names.map((n) => read(`${DIR}/${n}`)));
  const body = names.map((n, i) => `===== ${n}\n${parts[i] ?? ''}`).join('\n\n');
  return saveFile(`monetka-damaged.txt`, body, 'text/plain');
}

export async function dropBroken() {
  for (const n of await brokenFiles()) await Filesystem.deleteFile({ path: `${DIR}/${n}`, directory: Directory.Data }).catch(() => undefined);
}

/** Сохранить файл: на Android — в кэш и «Поделиться», в браузере — скачать. false — пользователь отменил. */
export async function saveFile(name: string, data: Uint8Array | string, mime: string): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const { Share } = await import('@capacitor/share');
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const res = await Filesystem.writeFile({ path: name, data: toBase64(bytes), directory: Directory.Cache });
    try {
      await Share.share({ title: name, url: res.uri, dialogTitle: t('shareTitle') });
      return true;
    } catch (e) {
      if (/cancel/i.test(String((e as Error)?.message ?? e))) return false;
      throw e;
    }
  }
  const blob = new Blob([data as BlobPart], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return true;
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Выбор файла через системный диалог (работает и в WebView Android) */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

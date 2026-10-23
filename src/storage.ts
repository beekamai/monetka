import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import type { State } from './model.ts';
import { emptyState } from './model.ts';

const KEY = 'budget-state-v1';

export async function load(): Promise<State> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    if (value) {
      const s = JSON.parse(value) as State;
      if (s && s.version === 1 && Array.isArray(s.categories)) return s;
    }
  } catch { /* повреждённые данные — начинаем с чистого листа */ }
  return emptyState();
}

let timer: ReturnType<typeof setTimeout> | undefined;
export function save(s: State) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    Preferences.set({ key: KEY, value: JSON.stringify(s) }).catch(() => {});
  }, 150);
}

/** Сохранить файл: на Android — в кэш и открыть «Поделиться», в браузере — скачать */
export async function saveFile(name: string, data: Uint8Array | string, mime: string) {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const base64 = typeof data === 'string' ? btoa(unescape(encodeURIComponent(data))) : toBase64(data);
    const res = await Filesystem.writeFile({ path: name, data: base64, directory: Directory.Cache });
    await Share.share({ title: name, url: res.uri, dialogTitle: 'Сохранить или отправить' });
    return;
  }
  const blob = new Blob([data as BlobPart], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
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
    input.click();
  });
}

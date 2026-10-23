/* Чистая логика хранения: выбор рабочего слота A/B и разбор старой записи. Без Capacitor — покрыта тестами. */
import type { State } from './model.ts';
import { normalizeReport } from './model.ts';

/** Содержимое файла слота */
export interface Slot { seq: number; state: unknown }

export interface Picked {
  state: State | null;
  /** Номер записи выбранного слота; следующая запись получит seq + 1 */
  seq: number;
  /** Сырые тексты, которые не удалось прочитать целиком: их нужно сохранить, а не потерять */
  damaged: string[];
  /** Сколько записей отброшено нормализацией в выбранном слоте */
  dropped: number;
}

export const serialize = (seq: number, state: State) => JSON.stringify({ seq, state } satisfies Slot);

/**
 * Из содержимого слотов (null — файла нет) берёт самую свежую читаемую базу.
 * Слот, испорченный обрывом записи, не мешает: остаётся предыдущая версия во втором.
 */
export function pickSlot(raws: (string | null)[]): Picked {
  let best: { seq: number; state: State; dropped: number; raw: string } | null = null;
  const damaged: string[] = [];
  for (const raw of raws) {
    if (raw == null) continue;
    let slot: Slot | null = null;
    try { slot = JSON.parse(raw) as Slot; } catch { /* обрыв записи — ниже в damaged */ }
    const rep = slot && typeof slot.seq === 'number' && Number.isFinite(slot.seq) ? normalizeReport(slot.state) : null;
    if (!slot || !rep) { damaged.push(raw); continue; }
    if (!best || slot.seq > best.seq) best = { seq: slot.seq, state: rep.state, dropped: rep.dropped, raw };
  }
  if (best && best.dropped > 0) damaged.push(best.raw);
  return { state: best?.state ?? null, seq: best?.seq ?? 0, damaged, dropped: best?.dropped ?? 0 };
}

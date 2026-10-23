/*
 * Дорожка эффектов из библиотечных сэмплов (Mixkit, assets-ext/ — не в git): раскладка по событиям cues.json.
 * Клики/звоны выравниваются атакой на момент события, переходы — пиком громкости. → out/sfx-<вариант>.wav
 * bun run audio/samples.ts [A|B|C|all]
 */
import cues from '../cues.json';

const SR = 48000;
const N = Math.ceil((cues.duration + 1.6) * SR);
const DIR = `${import.meta.dir}/../assets-ext/mixkit`;

type Role = { id: string; db: number; align: 'onset' | 'peak'; max: number; rate?: number };
type Variant = Record<string, Role | null>;

/* Уровни — пиковые, дБFS до общего микса; шумовые синтетические эффекты не используются вовсе */
const VARIANTS: Record<string, Variant> = {
  // Итоговый: только переходы из библиотеки, остальное — синтез из score.ts
  S: {
    // −11, не −14: на 11.45 / 14.45 / 20.45 переход вступает вместе с бочкой и тонул на 9–11 дБ
    whoosh: { id: '1489', db: -11, align: 'peak', max: 0.9 },
    swish: { id: '3005', db: -16, align: 'onset', max: 0.2 },
  },
  A: { // мягкий: воздух и стеклянные тоны
    whoosh: { id: '1489', db: -14, align: 'peak', max: 0.9 },
    swish: { id: '3005', db: -16, align: 'onset', max: 0.2 },
    tick: { id: '2568', db: -20, align: 'onset', max: 0.15 },
    click: { id: '1109', db: -13, align: 'onset', max: 0.35 },
    pop: { id: '2358', db: -12, align: 'onset', max: 0.45 },
    chime: { id: '2867', db: -11, align: 'onset', max: 1.2 },
    thud: { id: '2358', db: -11, align: 'onset', max: 0.45, rate: 0.75 },
    shimmer: { id: '2350', db: -16, align: 'onset', max: 1.4 },
    riser: null,
    final: { id: '1107', db: -9, align: 'onset', max: 1.7 },
  },
  B: { // яркий: быстрые переходы, звонкое подтверждение
    whoosh: { id: '1490', db: -14, align: 'peak', max: 0.8 },
    swish: { id: '3005', db: -15, align: 'onset', max: 0.2 },
    tick: { id: '2573', db: -21, align: 'onset', max: 0.12 },
    click: { id: '2568', db: -12, align: 'onset', max: 0.2 },
    pop: { id: '2358', db: -11, align: 'onset', max: 0.45 },
    chime: { id: '951', db: -12, align: 'onset', max: 1.4 },
    thud: { id: '2358', db: -10, align: 'onset', max: 0.45, rate: 0.7 },
    shimmer: { id: '2350', db: -15, align: 'onset', max: 1.4 },
    riser: null,
    final: { id: '937', db: -10, align: 'onset', max: 2.6 },
  },
  C: { // минимализм: почти без переходов, только касания и подтверждения
    whoosh: { id: '3005', db: -17, align: 'onset', max: 0.2 },
    swish: null,
    tick: { id: '1109', db: -24, align: 'onset', max: 0.12 },
    click: { id: '1109', db: -14, align: 'onset', max: 0.35 },
    pop: { id: '2358', db: -14, align: 'onset', max: 0.45 },
    chime: { id: '2867', db: -12, align: 'onset', max: 1.2 },
    thud: { id: '2358', db: -13, align: 'onset', max: 0.45, rate: 0.75 },
    shimmer: null,
    riser: null,
    final: { id: '1107', db: -9, align: 'onset', max: 1.7 },
  },
};

const cache = new Map<string, Float32Array[]>();
function decode(id: string, rate = 1): Float32Array[] {
  const key = `${id}@${rate}`;
  if (cache.has(key)) return cache.get(key)!;
  // Смена высоты (rate) — пересэмплированием: ниже и длиннее, как пластинка на меньшей скорости
  const af = rate === 1 ? [] : ['-af', `asetrate=${Math.round(SR * rate)},aresample=${SR}`];
  const r = Bun.spawnSync(['ffmpeg', '-v', 'error', '-i', `${DIR}/${id}.mp3`, ...af, '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-']);
  if (r.exitCode !== 0) throw new Error(`ffmpeg ${id}: ${r.stderr.toString()}`);
  const all = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength / 4);
  const L = new Float32Array(all.length / 2), R = new Float32Array(all.length / 2);
  for (let i = 0; i < L.length; i++) { L[i] = all[i * 2]; R[i] = all[i * 2 + 1]; }
  cache.set(key, [L, R]);
  return [L, R];
}

/** Атака: первый сэмпл громче 10% пика. Пик: максимум огибающей (окно 10 мс). */
function anchor([L, R]: Float32Array[], mode: 'onset' | 'peak', max: number): number {
  let peak = 0;
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  if (mode === 'onset') {
    for (let i = 0; i < L.length; i++) if (Math.abs(L[i]) > peak * 0.1 || Math.abs(R[i]) > peak * 0.1) return i;
    return 0;
  }
  const win = 480, lim = Math.min(L.length, Math.round(max * SR));
  let best = 0, bi = 0;
  for (let i = 0; i + win < lim; i += 48) {
    let e = 0;
    for (let k = i; k < i + win; k++) e += L[k] * L[k] + R[k] * R[k];
    if (e > best) { best = e; bi = i + win / 2; }
  }
  return bi;
}

function build(name: string, v: Variant) {
  const out = [new Float32Array(N), new Float32Array(N)];
  for (const e of cues.events) {
    const role = v[e.sfx];
    if (!role) continue;
    const s = decode(role.id, role.rate ?? 1);
    const a = anchor(s, role.align, role.max);
    const len = Math.min(s[0].length, Math.round(role.max * SR));
    let peak = 1e-9;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(s[0][i]), Math.abs(s[1][i]));
    const g = Math.pow(10, role.db / 20) / peak;
    const fade = Math.round(0.06 * SR);
    const start = Math.round(e.t * SR) - a;
    for (let i = 0; i < len; i++) {
      const j = start + i;
      if (j < 0 || j >= N) continue;
      const f = i > len - fade ? (len - i) / fade : 1;
      out[0][j] += s[0][i] * g * f;
      out[1][j] += s[1][i] * g * f;
    }
  }
  const data = new Int16Array(N * 2);
  for (let i = 0; i < N; i++) {
    data[i * 2] = Math.round(Math.max(-1, Math.min(1, out[0][i])) * 32767);
    data[i * 2 + 1] = Math.round(Math.max(-1, Math.min(1, out[1][i])) * 32767);
  }
  const head = new DataView(new ArrayBuffer(44));
  const w = (o: number, s: string) => [...s].forEach((c, k) => head.setUint8(o + k, c.charCodeAt(0)));
  w(0, 'RIFF'); head.setUint32(4, 36 + data.byteLength, true); w(8, 'WAVE'); w(12, 'fmt ');
  head.setUint32(16, 16, true); head.setUint16(20, 1, true); head.setUint16(22, 2, true); head.setUint32(24, SR, true);
  head.setUint32(28, SR * 4, true); head.setUint16(32, 4, true); head.setUint16(34, 16, true); w(36, 'data'); head.setUint32(40, data.byteLength, true);
  return Bun.write(`${import.meta.dir}/../out/sfx-${name}.wav`, new Blob([head.buffer, data.buffer]));
}

const want = (process.argv[2] ?? 'all').toUpperCase();
for (const [name, v] of Object.entries(VARIANTS)) if (want === 'ALL' || want === name) await build(name, v);
console.log('готово:', want === 'ALL' ? Object.keys(VARIANTS).join(', ') : want);

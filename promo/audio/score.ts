/*
 * Партитура и эффекты ролика: детерминированный синтез (без сэмплов и случайности без сида) → music.wav, sfx.wav, timing.json.
 * Сетка 120 BPM, такт 2 с; события эффектов — из ../cues.json, то же, что двигает картинку.
 * bun run audio/score.ts
 */
import cues from '../cues.json';

const SR = 48000;
const LEN = cues.duration + 1.6;
const N = Math.ceil(LEN * SR);
const BEAT = 60 / cues.bpm, BAR = BEAT * 4;
const TAU = Math.PI * 2;

let seed = 1234567;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
const noise = new Float32Array(N + SR);
for (let i = 0; i < noise.length; i++) noise[i] = rnd();

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

type St = { L: Float32Array; R: Float32Array };
const stereo = (): St => ({ L: new Float32Array(N), R: new Float32Array(N) });
const music = stereo(), sfx = stereo(), verbSend = stereo();
const add = (b: St, i: number, l: number, r = l) => { if (i >= 0 && i < N) { b.L[i] += l; b.R[i] += r; } };

/* ---------- Форма ---------- */
const DROP = cues.drop;
const [BD0, BD1] = cues.breakdown;
const FINAL = cues.events.find((e) => e.sfx === 'final')!.t;
const drumsOn = (t: number) => t >= DROP - 0.01 && !(t >= BD0 && t < BD1) && t < FINAL - 0.5;
const shimmerOn = (t: number) => t >= 17.5 && t < 20.5;

/* Аккорды по тактам: Fmaj7 · Am7 · Dm7 · B♭maj7 */
const CHORDS = [[53, 57, 60, 64], [57, 60, 64, 67], [50, 53, 57, 60], [46, 50, 53, 57]];
const BASS = [41, 45, 38, 46];
const chordAt = (t: number) => CHORDS[Math.floor(t / BAR) % 4];
const bassAt = (t: number) => BASS[Math.floor(t / BAR) % 4];

/* Огибающая качания от бочки (sidechain в самом синтезе) */
const kickTimes: number[] = [];
for (let t = 0; t < FINAL - 0.4; t += BEAT) if (drumsOn(t)) kickTimes.push(t);
const pump = (t: number) => {
  let d = 99;
  for (const k of kickTimes) if (k <= t && t - k < d) d = t - k;
  return d > 0.4 ? 1 : 0.45 + 0.55 * clamp(d / 0.32);
};

/* ---------- Пэд: три расстроенные пилы на ноту, мягкий фильтр ---------- */
{
  let lpL = 0, lpR = 0;
  const ph = new Float64Array(4 * 3 * 2);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    if (t > FINAL + 2.4) break;
    const notes = t >= FINAL - 0.02 ? [41, 53, 57, 60, 64, 67] : chordAt(t);
    const env = clamp(t / 0.5) * (t >= FINAL ? Math.exp(-(t - FINAL) / 1.4) : 1) * (t >= FINAL - 0.5 && t < FINAL ? 0.55 : 1);
    let l = 0, r = 0;
    notes.slice(0, 4).forEach((m, n) => {
      for (let v = 0; v < 3; v++) {
        const det = (v - 1) * 0.0045;
        const f = midi(m) * (1 + det);
        const k = (n * 3 + v) * 2;
        ph[k] = (ph[k] + f / SR) % 1; ph[k + 1] = (ph[k + 1] + (f * 1.002) / SR) % 1;
        l += ph[k] * 2 - 1; r += ph[k + 1] * 2 - 1;
      }
    });
    // фильтр открывается к дропу и в брейкдауне прикрывается
    const open = t < DROP ? 0.03 + 0.05 * (t / DROP) : t >= BD0 && t < BD1 ? 0.05 : 0.09;
    lpL += open * (l - lpL); lpR += open * (r - lpR);
    const g = 0.022 * env * (t >= DROP ? pump(t) : 1);
    add(music, i, lpL * g, lpR * g);
    add(verbSend, i, lpL * g * 0.6, lpR * g * 0.6);
  }
}

/* ---------- Бас: слабые доли, синус + немного пилы ---------- */
for (let s = 0; s < FINAL; s += BEAT / 2) {
  const t0 = s + BEAT / 2 * 0; // восьмые
  if (!drumsOn(t0) || Math.round(t0 / (BEAT / 2)) % 2 === 0) continue; // только «и»
  const f = midi(bassAt(t0) - 12 + 12);
  const dur = 0.22;
  let p = 0;
  for (let k = 0; k < dur * SR; k++) {
    const t = k / SR, i = Math.round(t0 * SR) + k;
    p += f / SR;
    const env = Math.min(1, t / 0.005) * Math.exp(-t / 0.12);
    const v = (Math.sin(TAU * p) * 0.8 + ((p % 1) * 2 - 1) * 0.12) * env * 0.16;
    add(music, i, v);
  }
}
/* Саб в брейкдауне — держит низ без ударных */
for (let i = Math.round(BD0 * SR); i < Math.round(BD1 * SR); i++) {
  const t = i / SR;
  const f = midi(bassAt(t) - 12);
  const env = clamp((t - BD0) / 0.4) * clamp((BD1 - t) / 0.2);
  add(music, i, Math.sin(TAU * f * t) * 0.07 * env);
}

/* ---------- Ударные ---------- */
function kick(t0: number, gain = 1) {
  let p = 0;
  for (let k = 0; k < 0.36 * SR; k++) {
    const t = k / SR, i = Math.round(t0 * SR) + k;
    const f = 48 + 110 * Math.exp(-t / 0.035);
    p += f / SR;
    const v = Math.sin(TAU * p) * Math.exp(-t / 0.16) * 0.55 * gain + noise[k] * Math.exp(-t / 0.004) * 0.08 * gain;
    add(music, i, v);
  }
}
function clap(t0: number) {
  let bp1 = 0, bp2 = 0;
  for (let k = 0; k < 0.25 * SR; k++) {
    const t = k / SR, i = Math.round(t0 * SR) + k;
    const n = noise[(k * 7 + 991) % noise.length];
    bp1 += 0.35 * (n - bp1); bp2 += 0.35 * (bp1 - bp2);
    const hp = bp1 - bp2;
    const env = (t < 0.03 ? (Math.floor(t / 0.01) % 2 ? 0.6 : 1) : 1) * Math.exp(-t / 0.07);
    add(music, i, hp * env * 0.32, hp * env * 0.28);
    add(verbSend, i, hp * env * 0.08);
  }
}
function hat(t0: number, open = false) {
  let prev = 0;
  const len = open ? 0.22 : 0.05;
  for (let k = 0; k < len * SR; k++) {
    const t = k / SR, i = Math.round(t0 * SR) + k;
    const n = noise[(k * 13 + 5000) % noise.length];
    const hp = n - prev; prev = n;
    const env = Math.exp(-t / (open ? 0.08 : 0.015));
    add(music, i, hp * env * 0.07, hp * env * 0.085);
  }
}
for (let s = 0; s < FINAL; s += BEAT / 2) {
  if (!drumsOn(s)) continue;
  const step = Math.round(s / (BEAT / 2));
  if (step % 2 === 0) kick(s);
  if (step % 4 === 2) clap(s);
  hat(s + BEAT / 4 * 0, step % 2 === 1);
}

/* ---------- Арпеджио: шестнадцатые, пинг-понг ---------- */
{
  const sixteenth = BEAT / 4;
  for (let s = DROP; s < FINAL - 0.5; s += sixteenth) {
    const bd = s >= BD0 && s < BD1;
    const step = Math.round(s / sixteenth);
    if (!bd && step % 2 === 1 && s < 5.5) continue; // первая сцена — реже, чтобы тики клавиш читались
    const ch = chordAt(s);
    const m = ch[[0, 2, 1, 3, 2, 1, 3, 2][step % 8]] + 12;
    const f = midi(m), dur = 0.18, gain = bd ? 0.05 : 0.038;
    for (let k = 0; k < dur * SR; k++) {
      const t = k / SR, i = Math.round(s * SR) + k;
      const v = (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * f * 2 * t)) * Math.exp(-t / 0.07) * gain * Math.min(1, t / 0.002);
      const pan = step % 2 ? 0.7 : 1.3;
      add(music, i, v * (2 - pan), v * pan);
      add(verbSend, i, v * 0.5);
      // эхо через восьмую в противоположный канал
      const j = i + Math.round(BEAT / 2 * SR);
      add(music, j, v * 0.35 * pan, v * 0.35 * (2 - pan));
    }
  }
}

/* ---------- Мерцание в сцене тем ---------- */
for (let s = 17.5; s < 20.5; s += BEAT / 4) {
  if (!shimmerOn(s)) continue;
  const m = chordAt(s)[Math.round(s * 8) % 4] + 24;
  const f = midi(m);
  for (let k = 0; k < 0.4 * SR; k++) {
    const t = k / SR, i = Math.round(s * SR) + k;
    const v = Math.sin(TAU * f * t) * Math.exp(-t / 0.12) * 0.018;
    add(music, i, v * 0.8, v * 1.2);
    add(verbSend, i, v * 1.2);
  }
}

/* ---------- Подъём к дропу и к возврату бита ---------- */
function riser(t0: number, t1: number, gain: number) {
  let lp = 0;
  for (let i = Math.round(t0 * SR); i < Math.round(t1 * SR); i++) {
    const p = (i / SR - t0) / (t1 - t0);
    lp += (0.02 + 0.4 * p * p) * (noise[i] - lp);
    add(music, i, lp * p * p * gain, lp * p * p * gain * 0.9);
  }
}
riser(0, DROP, 0.5);
riser(BD1 - 0.9, BD1, 0.45);

/* ---------- Финальный удар ---------- */
kick(FINAL, 1.3);
for (let k = 0; k < 2.4 * SR; k++) {
  const t = k / SR, i = Math.round(FINAL * SR) + k;
  const v = Math.sin(TAU * 41.2 * t) * Math.exp(-t / 0.9) * 0.18;
  add(music, i, v);
}

/* ---------- Ревербератор Шрёдера на посыле ---------- */
{
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => ({ d: Math.round(d * SR / 44100), buf: new Float32Array(Math.round(d * SR / 44100)), i: 0, fb: 0.8 }));
  const aps = [225, 556, 441].map((d) => ({ d: Math.round(d * SR / 44100), buf: new Float32Array(Math.round(d * SR / 44100)), i: 0 }));
  for (let i = 0; i < N; i++) {
    for (const ch of ['L', 'R'] as const) {
      const x = verbSend[ch][i];
      let y = 0;
      combs.forEach((c, n) => { if ((n % 2 === 0) === (ch === 'L')) { const o = c.buf[c.i]; c.buf[c.i] = x + o * c.fb; c.i = (c.i + 1) % c.d; y += o; } });
      for (const a of aps) { const o = a.buf[a.i]; const v = -y + o; a.buf[a.i] = y + o * 0.5; a.i = (a.i + 1) % a.d; y = v; }
      music[ch][i] += y * 0.12;
    }
  }
}

/* ---------- Эффекты по событиям ---------- */
function tone(t0: number, f0: number, f1: number, dur: number, gain: number, decay: number, pan = 1) {
  let p = 0;
  for (let k = 0; k < dur * SR; k++) {
    const t = k / SR, i = Math.round(t0 * SR) + k;
    const f = f0 * Math.pow(f1 / f0, t / dur);
    p += f / SR;
    const v = Math.sin(TAU * p) * Math.exp(-t / decay) * Math.min(1, t / 0.0015) * gain;
    add(sfx, i, v * (2 - pan), v * pan);
  }
}
function noiseSweep(tc: number, len: number, f0: number, f1: number, gain: number) {
  // пик громкости приходится на tc — момент смены сцены
  let a = 0, b = 0;
  const t0 = tc - len * 0.7;
  for (let k = 0; k < len * SR; k++) {
    const t = k / SR, i = Math.round(t0 * SR) + k, p = t / len;
    const fc = f0 * Math.pow(f1 / f0, p);
    const g = clamp((TAU * fc) / SR, 0.001, 0.99);
    const n = noise[(i * 3 + 777) % noise.length];
    a += g * (n - a); b += g * (a - b);
    const env = Math.sin(Math.PI * clamp(p)) ** 2;
    add(sfx, i, (a - b) * env * gain * (1 - 0.3 * p), (a - b) * env * gain * (0.7 + 0.3 * p));
  }
}
/** Переходы (whoosh, swish) — библиотечные сэмплы из audio/samples.ts: синтезированный шум звучал «песком» */
const SFX: Record<string, (t: number) => void> = {
  tick: (t) => { tone(t, 2600, 2400, 0.03, 0.22, 0.008); noiseSweep(t + 0.004, 0.012, 6000, 7000, 0.4); },
  click: (t) => { tone(t, 1500, 1100, 0.05, 0.3, 0.014); noiseSweep(t + 0.005, 0.02, 3000, 3500, 0.5); },
  pop: (t) => tone(t, 420, 980, 0.09, 0.32, 0.04),
  chime: (t) => { [1318.5, 1975.5, 2637].forEach((f, n) => tone(t + n * 0.012, f, f, 1.1, 0.13 / (n + 1), 0.35)); },
  thud: (t) => { tone(t, 120, 48, 0.3, 0.37, 0.11); noiseSweep(t + 0.01, 0.04, 400, 300, 0.4); },
  whoosh: () => undefined,
  swish: () => undefined,
  shimmer: (t) => { [2093, 2637, 3136, 4186].forEach((f, n) => tone(t + n * 0.045, f, f, 0.7, 0.06, 0.22, n % 2 ? 1.3 : 0.7)); },
  riser: (t) => { for (let k = 0; k < 6; k++) tone(t + k * 0.16, 880 * Math.pow(2, k / 6), 880 * Math.pow(2, k / 6), 0.25, 0.09, 0.08, k % 2 ? 1.25 : 0.75); noiseSweep(t + 0.75, 0.8, 2000, 9000, 0.35); },
  final: (t) => { [523.25, 659.25, 783.99, 1046.5].forEach((f, n) => tone(t + n * 0.02, f, f, 2.4, 0.11, 0.9, n % 2 ? 1.2 : 0.8)); tone(t, 90, 40, 0.6, 0.37, 0.25); },
};
for (const e of cues.events) SFX[e.sfx](e.t);

/* ---------- Запись ---------- */
function wav(b: St, path: string) {
  const len = N, data = new Int16Array(len * 2);
  for (let i = 0; i < len; i++) {
    data[i * 2] = Math.round(Math.tanh(b.L[i]) * 32000);
    data[i * 2 + 1] = Math.round(Math.tanh(b.R[i]) * 32000);
  }
  const head = new DataView(new ArrayBuffer(44));
  const w = (o: number, s: string) => [...s].forEach((c, k) => head.setUint8(o + k, c.charCodeAt(0)));
  w(0, 'RIFF'); head.setUint32(4, 36 + data.byteLength, true); w(8, 'WAVE'); w(12, 'fmt ');
  head.setUint32(16, 16, true); head.setUint16(20, 1, true); head.setUint16(22, 2, true); head.setUint32(24, SR, true);
  head.setUint32(28, SR * 4, true); head.setUint16(32, 4, true); head.setUint16(34, 16, true); w(36, 'data'); head.setUint32(40, data.byteLength, true);
  return Bun.write(path, new Blob([head.buffer, data.buffer]));
}

/* ---------- Проверка сетки: где реально атакует бочка ---------- */
/** Онсеты в НЧ-полосе: огибающая (атака 1 мс) выросла в 4 раза против себя же 30 мс назад */
function detectKicks(): number[] {
  const found: number[] = [];
  const env = new Float32Array(N);
  let lp = 0, e = 0;
  for (let i = 0; i < N; i++) {
    lp += 0.012 * (music.L[i] - lp);
    const a = Math.abs(lp);
    e = a > e ? e + 0.05 * (a - e) : e * 0.9995;
    env[i] = e;
  }
  const lag = Math.round(0.03 * SR);
  for (let i = lag; i < N; i++) {
    if (env[i] > 0.02 && env[i] > 4 * env[i - lag] + 0.004) {
      const t = i / SR;
      if (!found.length || t - found[found.length - 1] > 0.2) found.push(t);
    }
  }
  return found;
}

await Promise.all([wav(music, `${import.meta.dir}/../out/music.wav`), wav(sfx, `${import.meta.dir}/../out/sfx.wav`)]);
const detected = detectKicks();
// Для каждой авторской бочки — ближайшая найденная атака в окне ±60 мс; остальные пики — бас на слабых долях
const matched = kickTimes.map((k) => Math.min(...detected.map((d) => Math.abs(d - k)))).filter((d) => d <= 0.06);
const devs = matched.length ? matched : [0];
const median = [...devs].sort((a, b) => a - b)[Math.floor(devs.length / 2)];
const timing = {
  fps: cues.fps, bpm: cues.bpm, duration: cues.duration, drop: DROP, breakdown: cues.breakdown,
  beats: Array.from({ length: Math.floor(cues.duration / BEAT) + 1 }, (_, k) => +(k * BEAT).toFixed(3)),
  kicks: kickTimes.map((t) => +t.toFixed(3)),
  beat_detection: { detected_peaks: detected.length, authored_kicks: kickTimes.length, kicks_found: matched.length, median_deviation_ms: +(median * 1000).toFixed(1), max_deviation_ms: +(Math.max(...devs) * 1000).toFixed(1), note: 'Сетка авторская (синтез) и есть истина; детекция — онсеты НЧ-полосы (огибающая ×4 против самой себя 30 мс назад), пары в окне ±60 мс' },
  events: cues.events.map((e) => ({ ...e, frame: Math.round(e.t * cues.fps) })),
};
await Bun.write(`${import.meta.dir}/../timing.json`, JSON.stringify(timing, null, 2));
console.log('music.wav, sfx.wav, timing.json готовы;', JSON.stringify(timing.beat_detection));

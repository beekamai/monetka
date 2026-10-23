/*
 * Сведение и сборка: эффекты над музыкой, музыка приседает −6 дБ под каждым ударом,
 * двухпроходная нормализация до ~−14 LUFS / ≤ −1 dBTP, затем видео + звук в mp4 и дорожка «только музыка».
 * node mix.mjs [--frames out/frames] [--out out/monetka-promo.mp4]
 */
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const FRAMES = path.resolve(ROOT, arg('frames', 'out/frames'));
const OUT = path.resolve(ROOT, arg('out', 'out/monetka-promo.mp4'));
const DUR = 26;
/** stderr ffmpeg целиком: туда он печатает замеры громкости, даже при успешном выходе */
const ffErr = (args) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-y', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(r.stderr.slice(-2000));
  return r.stderr;
};
const run = (args) => { const r = execFileSync('ffmpeg', ['-hide_banner', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] }); return r; };

// sfx-final.wav = синтез score.ts + библиотечные переходы samples.ts (вариант S); без него — только синтез
const music = path.join(ROOT, 'out/music.wav');
const sfx = path.resolve(ROOT, arg('sfx', 'out/sfx-final.wav'));
const premix = path.join(ROOT, 'out/premix.wav');
const graph =
  '[1:a]volume=6dB,asplit=2[fx][key];' +
  '[0:a][key]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=180:makeup=1:knee=4[duck];' +
  `[duck][fx]amix=inputs=2:normalize=0,atrim=0:${DUR},afade=t=out:st=${DUR - 1.6}:d=1.6[mix]`;
run(['-i', music, '-i', sfx, '-filter_complex', graph, '-map', '[mix]', '-ar', '48000', premix]);

// Проход 1: замер
// Цель ниже −14: цепочка volume + limiter после loudnorm добавляет ~0.6 LU (замер 23.10: −13.3 → −12.7)
const LN = 'I=-14.6:TP=-2.0:LRA=11';
const probe = ffErr(['-i', premix, '-af', `loudnorm=${LN}:print_format=json`, '-f', 'null', '-']);
const m = JSON.parse(probe.slice(probe.lastIndexOf('{'), probe.lastIndexOf('}') + 1));
const pass2 = `loudnorm=${LN}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,volume=0.9dB,alimiter=limit=0.82:level=false:attack=1:release=50`;
const master = path.join(ROOT, 'out/master.wav');
run(['-i', premix, '-af', pass2, '-ar', '48000', master]);
const musicOnly = path.join(ROOT, 'out/monetka-promo-music.wav');
run(['-i', music, '-af', `atrim=0:${DUR},afade=t=out:st=${DUR - 1.6}:d=1.6,loudnorm=${LN}`, '-ar', '48000', musicOnly]);

// Видео + звук
run(['-framerate', '60', '-i', path.join(FRAMES, 'f_%05d.png'), '-i', master, '-map', '0:v', '-map', '1:a',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', '60', '-movflags', '+faststart',
  '-c:a', 'aac', '-b:a', '256k', '-t', String(DUR), OUT]);

// Проверка громкости после AAC
const check = ffErr(['-i', OUT, '-map', '0:a', '-af', 'ebur128=peak=true', '-f', 'null', '-']);
const I = /I:\s+(-?[\d.]+) LUFS/.exec(check.slice(check.lastIndexOf('Summary')))?.[1];
const TP = /Peak:\s+(-?[\d.]+) dBFS/.exec(check.slice(check.lastIndexOf('True peak')))?.[1];
console.log(JSON.stringify({ out: OUT, integrated_lufs: Number(I), true_peak_dbtp: Number(TP), pass1: { I: m.input_i, TP: m.input_tp } }));

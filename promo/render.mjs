/*
 * Покадровый рендер ролика: Vite отдаёт сцену, headless Edge (puppeteer-core) перематывает frame(t) и снимает кадр.
 * Motion blur — адаптивный: 1 / 24 / 64 подкадра на 180° затворе, среднее в линейном свете.
 * node render.mjs [--from 0] [--to 26] [--workers 4] [--blur] [--out out/frames]
 */
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const flag = (k) => process.argv.includes(`--${k}`);
const FROM = Number(arg('from', 0)), TO = Number(arg('to', 26)), WORKERS = Number(arg('workers', 4)), BLUR = flag('blur');
const OUT = path.resolve(ROOT, arg('out', 'out/frames'));
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const W = 1920, H = 1080, FPS = 60;

const toLin = new Float32Array(256).map((_, i) => Math.pow(i / 255, 2.2));

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const server = await createServer({
    root: path.join(ROOT, 'film'), logLevel: 'error', configFile: false,
    server: { host: '127.0.0.1', port: 5181, strictPort: true, fs: { allow: [path.resolve(ROOT, '..')] } },
  });
  await server.listen();
  // Свой браузер на воркер: в headless рисуется только активная вкладка, несколько страниц в одном браузере зависают на скриншоте
  const launch = (w) => puppeteer.launch({
    executablePath: EDGE, headless: true, protocolTimeout: 180000,
    args: ['--hide-scrollbars', '--force-color-profile=srgb', '--no-first-run', `--user-data-dir=${path.join(ROOT, 'out', `edge-profile-${w}`)}`],
  });
  const first = Math.round(FROM * FPS), last = Math.round(TO * FPS) - 1;
  const total = last - first + 1, chunk = Math.ceil(total / WORKERS);
  const t0 = Date.now();
  let done = 0, subTotal = 0;
  const stats = { 1: 0, 24: 0, 64: 0 };
  // Перемотка + два кадра отрисовки: скриншот не должен поймать состояние до применения стилей
  const seekPainted = (page, x) => page.evaluate((v) => new Promise((ok) => { window.__seek(v); requestAnimationFrame(() => requestAnimationFrame(ok)); }), x);

  await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
    const a = first + w * chunk, b = Math.min(last, a + chunk - 1);
    if (a > b) return;
    const browser = await launch(w);
    const page = (await browser.pages())[0] ?? await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.error(`[w${w}] pageerror`, e.message));
    await page.goto('http://127.0.0.1:5181/index.html', { waitUntil: 'networkidle0' });
    await page.waitForFunction('window.__ready === true', { timeout: 60000 });
    // Прогрев: детерминизм не должен зависеть от того, с какого кадра стартовал воркер
    await page.evaluate(() => { for (let t = 0; t < window.__meta.duration; t += 0.1) window.__seek(t); });
    const cuts = await page.evaluate(() => window.__meta.cuts);
    for (let f = a; f <= b; f++) {
      const t = f / FPS;
      // Затвор не переходит склейку: на ней камера прыгает, и смешение двух сторон даёт двойную экспозицию
      let lo = t - 0.25 / FPS, hi = t + 0.25 / FPS;
      for (const c of cuts) {
        if (c > lo && c <= t) lo = c;
        else if (c > t && c < hi) hi = c - 1e-4;
      }
      let n = 1;
      if (BLUR) {
        // Скорость — px за кадр на отрезке в один кадр, не пересекающем склейку
        const [pl, ph] = lo > t - 0.25 / FPS ? [lo, lo + 1 / FPS] : hi < t + 0.25 / FPS ? [hi - 1 / FPS, hi] : [t - 0.5 / FPS, t + 0.5 / FPS];
        const v = await page.evaluate(([x, l, h]) => window.__speed(x, l, h), [t, pl, ph]);
        // Шаг между подкадрами ≤ 3 px: иначе на резком тексте видна лесенка копий вместо смаза
        n = v < 6 ? 1 : Math.min(240, Math.max(24, Math.ceil(v / 3)));
      }
      const bucket = n === 1 ? 1 : n <= 24 ? 24 : 64;
      stats[bucket]++;
      subTotal += n;
      const file = path.join(OUT, `f_${String(f).padStart(5, '0')}.png`);
      if (n === 1) {
        await seekPainted(page, t);
        const png = await page.screenshot({ type: 'png', optimizeForSpeed: true });
        await fs.writeFile(file, png);
      } else {
        const acc = new Float32Array(W * H * 3);
        for (let k = 0; k < n; k++) {
          const ts = lo + ((k + 0.5) / n) * (hi - lo);
          await seekPainted(page, ts);
          const png = await page.screenshot({ type: 'png', optimizeForSpeed: true });
          const { data } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
          for (let i = 0; i < acc.length; i++) acc[i] += toLin[data[i]];
        }
        const outBuf = Buffer.alloc(W * H * 3);
        for (let i = 0; i < acc.length; i++) outBuf[i] = Math.round(Math.pow(acc[i] / n, 1 / 2.2) * 255);
        await sharp(outBuf, { raw: { width: W, height: H, channels: 3 } }).png({ compressionLevel: 2 }).toFile(file);
      }
      done++;
      if (done % 30 === 0) {
        const el = (Date.now() - t0) / 1000;
        console.log(`${done}/${total} кадров · ${el.toFixed(0)} с · подкадров ${subTotal} · ~${((el / done) * (total - done)).toFixed(0)} с осталось`);
      }
    }
    await browser.close();
  }));

  await server.close();
  console.log(`готово: ${total} кадров за ${((Date.now() - t0) / 1000).toFixed(0)} с; блюр-распределение`, stats);
}

main().catch((e) => { console.error(e); process.exit(1); });

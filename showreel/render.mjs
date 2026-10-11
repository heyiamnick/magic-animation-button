// Render driver for reel.html (Playwright + Chromium).
//   node render.mjs stills <outDir> <t1> <t2> ...   one PNG per time (no motion blur unless BLUR=1)
//   node render.mjs beats  <outDir> [offset]        one PNG per beat at beat + offset (default 0.25 s)
//   node render.mjs audio  <out.wav>                soundtrack via OfflineAudioContext
//   node render.mjs frames <outDir> [workers]       60 fps x 3 subframes (180 PNGs per second)
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const REEL = 'file://' + path.join(here, 'reel.html');
const FPS = 60, SUB = 3, DUR = 15, SHUTTER = 1 / 360;

async function openPage(browser, debug = false) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('pageerror:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(REEL);
  const info = await page.evaluate(() => window.READY);
  if (debug) await page.evaluate(() => { window.DEBUG = true; });
  return { page, info };
}
async function shoot(page, t, file, blur) {
  const n = await page.evaluate(([t, b]) => window.seek(t, b), [t, blur]);
  await page.screenshot({ path: file, type: 'png', clip: { x: 0, y: 0, width: 1920, height: 1080 } });
  return n;
}

const [mode, out, ...rest] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--disable-gpu', '--force-color-profile=srgb'] });
try {
  if (mode === 'stills' || mode === 'beats') {
    fs.mkdirSync(out, { recursive: true });
    const { page, info } = await openPage(browser, process.env.DEBUG === '1');
    console.log('ready', JSON.stringify(info));
    const times = mode === 'beats'
      ? Array.from({ length: 30 }, (_, b) => +(b * 0.5 + (rest[0] !== undefined ? +rest[0] : 0.25)).toFixed(4))
      : rest.map(Number);
    for (const t of times) {
      const f = path.join(out, `t${t.toFixed(4).padStart(8, '0')}.png`);
      const n = await shoot(page, t, f, process.env.BLUR === '1');
      console.log(f, 'samples', n);
    }
  } else if (mode === 'audio') {
    const { page } = await openPage(browser);
    const r = await page.evaluate(() => window.renderAudio());
    fs.writeFileSync(out, Buffer.from(r.wav, 'base64'));
    console.log('audio', out, 'peak', r.peak.toFixed(3), 'gain', r.gain.toFixed(3), 'latency ms', r.latencyMs.toFixed(2));
  } else if (mode === 'frames') {
    fs.mkdirSync(out, { recursive: true });
    const workers = +(rest[0] || 4);
    const total = FPS * DUR * SUB;
    const jobs = [];
    for (let i = 0; i < total; i++) {
      const f = Math.floor(i / SUB), s = i % SUB;
      // subframes centred on the frame time; each covers one SHUTTER slice -> contiguous 180 deg shutter
      jobs.push({ i, t: f / FPS + (s - (SUB - 1) / 2) * SHUTTER });
    }
    const todo = jobs.filter(j => !fs.existsSync(path.join(out, `${String(j.i).padStart(5, '0')}.png`)));
    let next = 0, done = 0, samples = 0;
    const t0 = Date.now();
    await Promise.all(Array.from({ length: workers }, async () => {
      const { page } = await openPage(browser);
      while (next < todo.length) {
        const j = todo[next++];
        const n = await shoot(page, j.t, path.join(out, `${String(j.i).padStart(5, '0')}.png`), true);
        samples += n;
        if (++done % 90 === 0) {
          const el = (Date.now() - t0) / 1000;
          console.log(`${done}/${todo.length}  ${el.toFixed(0)}s  eta ${(el / done * (todo.length - done)).toFixed(0)}s  avg samples ${(samples / done).toFixed(2)}`);
        }
      }
    }));
    console.log('frames done', done, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  } else {
    console.error('unknown mode'); process.exitCode = 1;
  }
} finally {
  await browser.close();
}

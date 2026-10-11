// ISOLINE render tool (Playwright + FFmpeg)
//   node tools/render.mjs stills  --times 0,0.5,1 [--w 960 --h 540] --out dir
//   node tools/render.mjs preview --w 960 --h 540 --fps 30 [--from 0 --to 15] --out file.mp4 [--audio soundtrack.wav]
//   node tools/render.mjs audio   --out soundtrack.wav
//   node tools/render.mjs final   --workers 3 --out final.mp4 --audio soundtrack.wav
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, createWriteStream, existsSync, rmSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(3).reduce((acc, a, i, arr) => { if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return acc; }, []));
const cmd = process.argv[2];
const FPS = 60, DUR = 15;

async function openPage(w, h) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync'] });
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto('file://' + join(ROOT, 'index.html') + `?w=${w}&h=${h}`);
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 180000 });
  const err = await page.evaluate(() => window.__error);
  if (err) throw new Error(err);
  return { browser, page };
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(rgb, w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
// motion-blur subframes: centred tent filter over ~0.67 of the frame interval
const SUB_OFF = [-1 / 3 / FPS, 0, 1 / 3 / FPS], SUB_W = [0.25, 0.5, 0.25];

async function grab(page, t, sub) {
  const b64 = await page.evaluate(([t, o, w]) => window.captureFrame(t, o, w), [t, sub ? SUB_OFF : [0], sub ? SUB_W : [1]]);
  return Buffer.from(b64, 'base64');
}

if (cmd === 'stills') {
  const w = +(args.w || 960), h = +(args.h || 540), out = resolve(args.out || 'stills');
  mkdirSync(out, { recursive: true });
  const times = String(args.times).split(',').map(Number);
  const { browser, page } = await openPage(w, h);
  for (const t of times) {
    const t0 = Date.now();
    const rgb = await grab(page, t, !!args.blur);
    writeFileSync(join(out, `t${t.toFixed(3).padStart(6, '0')}.png`), png(rgb, w, h));
    process.stdout.write(`t=${t.toFixed(3)} ${Date.now() - t0}ms\n`);
  }
  await browser.close();
} else if (cmd === 'preview') {
  const w = +(args.w || 640), h = +(args.h || 360), fps = +(args.fps || 30), out = resolve(args.out || 'preview.mp4');
  const from = +(args.from || 0), to = +(args.to || DUR);
  const { browser, page } = await openPage(w, h);
  const ff = ['-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${h}`, '-r', String(fps), '-i', '-'];
  if (args.audio) ff.push('-ss', String(from), '-t', String(to - from), '-i', resolve(args.audio), '-c:a', 'aac', '-b:a', '192k');
  ff.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', '-shortest', out);
  const p = spawn('ffmpeg', ff, { stdio: ['pipe', 'ignore', 'inherit'] });
  const n = Math.round((to - from) * fps);
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const rgb = await grab(page, from + i / fps, !!args.blur);
    if (!p.stdin.write(rgb)) await new Promise((r) => p.stdin.once('drain', r));
    if (i % 30 === 0) process.stdout.write(`frame ${i}/${n} ${((Date.now() - t0) / (i + 1)).toFixed(0)}ms/f\n`);
  }
  p.stdin.end(); await new Promise((r) => p.on('close', r));
  await browser.close();
} else if (cmd === 'audio') {
  const out = resolve(args.out || 'soundtrack.wav');
  const { browser, page } = await openPage(320, 180);
  const b64 = await page.evaluate(() => window.renderSoundtrack());
  writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log('wrote', out);
  await browser.close();
} else if (cmd === 'chunk') {
  // worker: render frames [a, b) at full res with subframes into a raw RGB file
  const a = +args.a, b = +args.b, w = +(args.w || 1920), h = +(args.h || 1080), out = resolve(args.out);
  const { browser, page } = await openPage(w, h);
  const fd = createWriteStream(out);
  const t0 = Date.now();
  for (let f = a; f < b; f++) {
    const rgb = await grab(page, f / FPS, true);
    if (!fd.write(rgb)) await new Promise((r) => fd.once('drain', r));
    if ((f - a) % 20 === 0) process.stdout.write(`[${a}-${b}] frame ${f} ${((Date.now() - t0) / (f - a + 1)).toFixed(0)}ms/f\n`);
  }
  await new Promise((r) => fd.end(r));
  await browser.close();
} else if (cmd === 'final') {
  const workers = +(args.workers || 3), w = 1920, h = 1080, frames = FPS * DUR;
  const tmp = resolve(args.tmp || join(ROOT, 'build/chunks')); mkdirSync(tmp, { recursive: true });
  // --splits a,b,c : explicit chunk boundaries (balance cheap 2D frames against expensive 3D frames)
  const cuts = args.splits ? [0, ...String(args.splits).split(',').map(Number), frames] : Array.from({ length: workers + 1 }, (_, k) => Math.min(frames, k * Math.ceil(frames / workers)));
  const nChunks = cuts.length - 1, jobs = [];
  for (let k = 0; k < nChunks; k++) {
    const a = cuts[k], b = cuts[k + 1], f = join(tmp, `chunk${k}.rgb`);
    if (existsSync(f) && statSync(f).size === (b - a) * w * h * 3 && !args.force) { console.log('reuse', f); jobs.push(Promise.resolve()); continue; }
    jobs.push(new Promise((res, rej) => { const p = spawn(process.execPath, [fileURLToPath(import.meta.url), 'chunk', '--a', a, '--b', b, '--out', f], { stdio: 'inherit' }); p.on('close', (c) => (c === 0 ? res() : rej(new Error('worker ' + k + ' failed')))); }));
  }
  await Promise.all(jobs);
  const out = resolve(args.out || join(ROOT, 'final.mp4'));
  const ff = ['-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${h}`, '-r', String(FPS), '-i', '-'];
  if (args.audio) ff.push('-i', resolve(args.audio), '-c:a', 'aac', '-b:a', '320k', '-ar', '48000');
  ff.push('-c:v', 'libx264', '-preset', 'slow', '-crf', String(args.crf || 17), '-tune', 'animation', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '5.1',
    '-x264-params', 'keyint=60:min-keyint=60', '-movflags', '+faststart', '-frames:v', String(frames), '-t', String(DUR), out);
  const p = spawn('ffmpeg', ff, { stdio: ['pipe', 'ignore', 'inherit'] });
  for (let k = 0; k < nChunks; k++) {
    const f = join(tmp, `chunk${k}.rgb`), fd = openSync(f, 'r'), size = statSync(f).size, bs = w * h * 3;
    const buf = Buffer.alloc(bs);
    for (let off = 0; off < size; off += bs) { readSync(fd, buf, 0, bs, off); if (!p.stdin.write(Buffer.from(buf))) await new Promise((r) => p.stdin.once('drain', r)); }
    closeSync(fd);
  }
  p.stdin.end(); await new Promise((r) => p.on('close', r));
  console.log('wrote', out);
} else {
  console.log('unknown command'); process.exit(1);
}

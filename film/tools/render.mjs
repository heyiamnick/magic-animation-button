// ISOLINE render tool (Playwright + FFmpeg)
//   node tools/render.mjs stills  --times 0,0.5,1 [--w 960 --h 540] --out dir
//   node tools/render.mjs preview --w 960 --h 540 --fps 30 [--from 0 --to 75] --out file.mp4 [--audio soundtrack.wav]
//   node tools/render.mjs audio   --out soundtrack.wav   [--verify: render 3 cycles, report the seam]
//   node tools/render.mjs final   --splits 900,1800,... --parallel 4 --out final.mp4 --audio soundtrack.wav [--target-mb 95 | --crf 17]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, statSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(3).reduce((acc, a, i, arr) => { if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return acc; }, []));
const cmd = process.argv[2];
const FPS = 60, DUR = 75;

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
  if (args.verify) {   // three cycles: is the 3rd a sample-exact repeat of the 2nd across the seam?
    console.log(await page.evaluate(() => window.renderSoundtrack({ verify: true })));
  } else {
    const b64 = await page.evaluate(() => window.renderSoundtrack());
    writeFileSync(out, Buffer.from(b64, 'base64'));
    console.log('wrote', out);
  }
  await browser.close();
} else if (cmd === 'chunk') {
  // worker: render frames [a, b) at full res with subframes, encoded losslessly (FFV1) as it goes
  const a = +args.a, b = +args.b, w = +(args.w || 1920), h = +(args.h || 1080), out = resolve(args.out);
  const { browser, page } = await openPage(w, h);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${h}`, '-r', String(FPS), '-i', '-',
    '-c:v', 'ffv1', '-level', '3', '-g', '1', '-slices', '4', '-threads', '2', out + '.part.mkv'], { stdio: ['pipe', 'ignore', 'inherit'] });
  const t0 = Date.now();
  for (let f = a; f < b; f++) {
    const rgb = await grab(page, f / FPS, true);
    if (!ff.stdin.write(rgb)) await new Promise((r) => ff.stdin.once('drain', r));
    if ((f - a) % 20 === 0) process.stdout.write(`[${a}-${b}] frame ${f} ${((Date.now() - t0) / (f - a + 1)).toFixed(0)}ms/f\n`);
  }
  ff.stdin.end();
  const code = await new Promise((r) => ff.on('close', r));
  await browser.close();
  if (code !== 0) throw new Error('ffmpeg failed for chunk ' + out);
  renameSync(out + '.part.mkv', out);
  writeFileSync(out + '.done', JSON.stringify({ a, b, w, h, fps: FPS }));
} else if (cmd === 'final') {
  // --workers N | --splits a,b,c   chunk boundaries (balance cheap 2D frames against expensive 3D frames)
  // --audio soundtrack.wav  --out final.mp4
  // --target-mb M : two-pass encode sized to M megabytes (10^6 bytes) incl. audio; otherwise CRF (--crf, default 17)
  const workers = +(args.workers || 3), w = 1920, h = 1080, frames = +(args.frames || FPS * DUR), dur = frames / FPS;
  const tmp = resolve(args.tmp || join(ROOT, 'build/chunks')); mkdirSync(tmp, { recursive: true });
  const cuts = args.splits ? [0, ...String(args.splits).split(',').map(Number), frames] : Array.from({ length: workers + 1 }, (_, k) => Math.min(frames, k * Math.ceil(frames / workers)));
  const nChunks = cuts.length - 1, queue = [], files = [];
  for (let k = 0; k < nChunks; k++) {
    const a = cuts[k], b = cuts[k + 1], f = join(tmp, `chunk_${a}_${b}.mkv`); files.push(f);
    if (existsSync(f + '.done') && !args.force) console.log('reuse', f); else queue.push({ a, b, f });
  }
  const runChunk = ({ a, b, f }) => new Promise((res, rej) => {
    const p = spawn(process.execPath, [fileURLToPath(import.meta.url), 'chunk', '--a', a, '--b', b, '--out', f], { stdio: 'inherit' });
    p.on('close', (c) => (c === 0 ? res() : rej(new Error(`worker ${a}-${b} failed`))));
  });
  // worker pool: at most --parallel chunks render at once, longest-first order is up to the caller's splits
  const limit = Math.max(1, +(args.parallel || workers));
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => { while (queue.length) await runChunk(queue.shift()); }));
  const list = join(tmp, 'list.txt');
  writeFileSync(list, files.map((f) => `file '${f}'`).join('\n') + '\n');
  const out = resolve(args.out || join(ROOT, 'final.mp4'));
  // Matroska stores ms timestamps (16/17 ms at 60 fps): retime by frame index (settb/setpts below) so no frame is dropped or doubled
  const vin = ['-f', 'concat', '-safe', '0', '-i', list];
  const ain = args.audio ? ['-i', resolve(args.audio)] : [];
  const vopts = ['-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.2',
    '-g', '30', '-keyint_min', '30', '-bf', '2', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-vf', `settb=1/${FPS},setpts=N,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p`, '-r', String(FPS), '-frames:v', String(frames)];
  const aopts = args.audio ? ['-map', '0:v:0', '-map', '1:a:0', '-c:a', 'aac', '-b:a', '384k', '-ar', '48000', '-ac', '2'] : [];
  const run = (argv) => new Promise((res, rej) => { const p = spawn('ffmpeg', argv, { stdio: ['ignore', 'ignore', 'inherit'] }); p.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))); });
  if (args['target-mb']) {
    const totalBits = +args['target-mb'] * 1e6 * 8 * 0.985;            // 1.5% container headroom
    const vk = Math.floor((totalBits / dur - (args.audio ? 384e3 : 0)) / 1000);
    const passlog = join(tmp, 'x264pass');
    console.log(`two-pass target ${args['target-mb']} MB -> video ${vk} kb/s`);
    // no VBV cap: the 256-line moire gratings need several times the average rate for a second or two, and the flat
    // 3D sections need far less. qcomp 0.8 lets the two-pass move bits from the simple scenes into the complex ones.
    const rc = ['-b:v', vk + 'k', '-x264-params', `qcomp=${args.qcomp || 0.8}`];
    await run(['-y', '-loglevel', 'error', ...vin, ...vopts, ...rc, '-pass', '1', '-passlogfile', passlog, '-an', '-f', 'null', '/dev/null']);
    await run(['-y', '-loglevel', 'error', ...vin, ...ain, ...vopts, ...rc, '-pass', '2', '-passlogfile', passlog, ...aopts, '-movflags', '+faststart', '-t', String(dur), out]);
  } else {
    await run(['-y', '-loglevel', 'error', ...vin, ...ain, ...vopts, '-crf', String(args.crf || 17), ...aopts, '-movflags', '+faststart', '-t', String(dur), out]);
  }
  console.log('wrote', out, (statSync(out).size / 1e6).toFixed(1), 'MB');
} else {
  console.log('unknown command'); process.exit(1);
}

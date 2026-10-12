// Render frames in headless Chromium.
//   node tools/render.mjs --from 0 --to 300 [--step 1] [--w 1920 --h 1080] --out out/frames [--jpg] [--force]
// Frames already on disk are skipped, so a crashed run can simply be re-run.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const from = Number(args.from ?? 0), to = Number(args.to ?? 1), step = Number(args.step ?? 1);
const W = Number(args.w ?? 1920), H = Number(args.h ?? 1080);
const outDir = path.resolve(args.out ?? 'out/frames');
const ext = args.jpg ? 'jpg' : 'png';
const list = args.frames ? String(args.frames).split(',').map(Number) : null;
fs.mkdirSync(outDir, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.jpg': 'image/jpeg',
  '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = path.normalize(path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--disable-gpu-driver-bug-workarounds', '--force-color-profile=srgb', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/web/index.html?w=${W}&h=${H}`);
const info = await page.evaluate(() => window.__ready);
console.log('ready', info);

const frames = list ?? Array.from({ length: Math.ceil((to - from) / step) }, (_, i) => from + i * step);
const t0 = Date.now();
let done = 0;
for (const n of frames) {
  const file = path.join(outDir, `f${String(n).padStart(5, '0')}.${ext}`);
  if (!args.force && fs.existsSync(file)) continue;
  await page.evaluate((k) => window.renderFrame(k), n);
  const buf = await page.screenshot({ type: ext === 'jpg' ? 'jpeg' : 'png', quality: ext === 'jpg' ? 92 : undefined, clip: { x: 0, y: 0, width: W, height: H } });
  fs.writeFileSync(file + '.tmp', buf);
  fs.renameSync(file + '.tmp', file);
  done++;
  if (done % 25 === 0) console.log(`frame ${n} (${done}/${frames.length}) ${((Date.now() - t0) / done / 1000).toFixed(2)}s/frame`);
}
console.log(`rendered ${done} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await browser.close();
server.close();

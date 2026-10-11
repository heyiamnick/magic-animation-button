// Inline all sources into one self-contained film/index.html
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const parts = ['engine.js', 'fields.js', 'render.js', 'text.js', 'solids.js', 'scene_core.js', 'scene_terrain.js', 'scene_system.js', 'audio.js', 'main.js'];
const fonts = readFileSync(join(root, 'build/fonts.js'), 'utf8');
let js = '';
for (const p of parts) {
  try { js += `\n/* ---- ${p} ---- */\n` + readFileSync(join(root, 'src', p), 'utf8'); }
  catch (e) { if (p !== 'audio.js') throw e; }
}
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ISOLINE — Thread → Signal → Terrain → System → Network</title>
<style>html,body{margin:0;height:100%;background:#0A0A0B;overflow:hidden}canvas{display:block;position:absolute;left:0;top:0}</style>
</head>
<body>
<canvas id="film"></canvas>
<script>
${fonts}</script>
<script>
${js}
</script>
</body>
</html>
`;
writeFileSync(join(root, 'index.html'), html);
console.log('index.html', (html.length / 1024).toFixed(1), 'KB');

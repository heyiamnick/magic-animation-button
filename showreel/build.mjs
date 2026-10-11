// Inline the Geist font into the reel so the deliverable is one self-contained HTML file.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, 'src/reel.html'), 'utf8');
const font = fs.readFileSync(path.join(here, 'src/Geist-latin.woff2')).toString('base64');
const out = src.replace('__GEIST_WOFF2__', `data:font/woff2;base64,${font}`);
fs.writeFileSync(path.join(here, 'reel.html'), out);
console.log(`reel.html written (${(out.length / 1024).toFixed(0)} KB)`);

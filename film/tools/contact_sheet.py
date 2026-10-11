#!/usr/bin/env python3
"""Tile rendered stills into a labelled contact sheet.
usage: contact_sheet.py OUT.png COLS IMG1.png [IMG2.png ...]   (labels derived from t###.### filenames)"""
import sys, re, os
from PIL import Image, ImageDraw, ImageFont

out, cols, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
ims = [Image.open(f).convert('RGB') for f in files]
w, h = ims[0].size
pad, lab = 10, 30
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * (w + pad) + pad, rows * (h + lab + pad) + pad), (24, 24, 26))
try:
    font = ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-SemiBold.otf', 17)
except Exception:
    font = ImageFont.load_default()
d = ImageDraw.Draw(sheet)
for k, (im, f) in enumerate(zip(ims, files)):
    r, c = divmod(k, cols)
    x, y = pad + c * (w + pad), pad + r * (h + lab + pad)
    sheet.paste(im, (x, y + lab))
    m = re.search(r't(\d+\.\d+)', os.path.basename(f))
    t = float(m.group(1)) if m else 0.0
    beat = t * 2
    bar = int(beat // 4) + 1
    label = f't = {t:06.3f}s   beat {beat:4.1f}   bar {bar if bar <= 7 else "7½"}'
    d.text((x + 2, y + 6), label, fill=(235, 232, 225), font=font)
sheet.save(out)
print(out, sheet.size)

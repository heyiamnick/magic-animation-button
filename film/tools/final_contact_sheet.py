#!/usr/bin/env python3
"""Contact sheet from the finished film: every beat (30) + key half-beat transitions, labelled.
usage: final_contact_sheet.py final.mp4 contact-sheet.png"""
import sys, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont

video, out = sys.argv[1], sys.argv[2]
FPS, TW, TH = 60, 480, 270
beats = [b * 0.5 for b in range(30)]
halves = [0.25, 1.25, 2.75, 3.25, 4.75, 6.25, 8.75, 9.25, 12.25, 13.75, 14.25, 14.75]
SECTION = ['THREAD', 'THREAD', 'SIGNAL', 'SIGNAL', 'TERRAIN', 'TERRAIN', 'TERRAIN', 'TERRAIN', 'SYSTEM', 'SYSTEM', 'SYSTEM', 'SYSTEM', 'CLIMAX', 'CLIMAX', 'IDENTITY']
times = sorted(set(beats + halves))
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', video, '-vf', f'scale={TW}:{TH}:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout
F = np.frombuffer(raw, np.uint8).reshape(-1, TH, TW, 3)
cols = 6
rows = (len(times) + cols - 1) // cols
pad, lab, head = 12, 26, 70
W = cols * (TW + pad) + pad
H = head + rows * (TH + lab + pad) + pad
sheet = Image.new('RGB', (W, H), (10, 10, 11))
d = ImageDraw.Draw(sheet)
bold = ImageFont.truetype('/usr/share/fonts/opentype/inter/InterDisplay-Black.otf', 30)
small = ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-SemiBold.otf', 14)
d.text((pad, 18), 'ISOLINE', font=bold, fill=(241, 238, 230))
d.text((pad + 150, 30), 'CONTACT SHEET  ·  FRAMES FROM FINAL.MP4  ·  EVERY BEAT (120 BPM) + KEY HALF-BEAT TRANSITIONS', font=small, fill=(255, 74, 28))
for k, t in enumerate(times):
    i = min(len(F) - 1, int(round(t * FPS)))
    r, c = divmod(k, cols)
    x, y = pad + c * (TW + pad), head + r * (TH + lab + pad)
    sheet.paste(Image.fromarray(F[i]), (x, y + lab))
    beat = t * 2
    is_beat = abs(beat - round(beat)) < 1e-6
    bar = int(beat // 4) + 1
    tag = f'BEAT {int(beat) + 1:02d}' if is_beat else f'BEAT {beat + 1:04.1f}'
    label = f'{t:06.3f}s   {tag}   BAR {bar if bar <= 7 else "7½"}   {SECTION[min(14, int(t))]}'
    d.text((x, y + 5), label, font=small, fill=(241, 238, 230) if is_beat else (255, 74, 28))
sheet.save(out)
print('wrote', out, sheet.size, len(times), 'frames')

#!/usr/bin/env python3
"""Contact sheet from the finished film: every bar downbeat (2 s) + the key in-between moments, labelled.
usage: final_contact_sheet.py final.mp4 contact-sheet.png"""
import sys, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont

video, out = sys.argv[1], sys.argv[2]
FPS, TW, TH = 60, 400, 225
MOVES = [(0, 'I · THREAD → SIGNAL'), (16, 'II · TERRAIN'), (32, 'III · SYSTEM'), (48, 'IV · NETWORK'), (62, 'V · MONUMENT + IDENTITY')]
downbeats = [b * 2.0 for b in range(38)]                                  # 0 .. 74
keys = [10.5, 12.5, 21.0, 27.0, 35.5, 38.6, 45.3, 52.6, 55.4, 59.6, 62.5, 74.85]
times = sorted(set(downbeats + keys))
frames = [min(int(round(t * FPS)), 75 * FPS - 1) for t in times]
sel = '+'.join(f'eq(n\\,{i})' for i in frames)
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', video, '-vf', f"select='{sel}',scale={TW}:{TH}:flags=area", '-vsync', '0', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                     capture_output=True, check=True).stdout
F = np.frombuffer(raw, np.uint8).reshape(-1, TH, TW, 3)
assert len(F) == len(times), (len(F), len(times))
cols = 8
rows = (len(times) + cols - 1) // cols
pad, lab, head = 10, 24, 70
W = cols * (TW + pad) + pad
H = head + rows * (TH + lab + pad) + pad
sheet = Image.new('RGB', (W, H), (10, 10, 11))
d = ImageDraw.Draw(sheet)
bold = ImageFont.truetype('/usr/share/fonts/opentype/inter/InterDisplay-Black.otf', 30)
small = ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-SemiBold.otf', 13)
d.text((pad, 18), 'ISOLINE', font=bold, fill=(241, 238, 230))
d.text((pad + 150, 30), 'CONTACT SHEET  ·  75 S  ·  FRAMES FROM FINAL.MP4  ·  EVERY BAR DOWNBEAT (WHITE) + KEY MOMENTS (ORANGE)', font=small, fill=(255, 74, 28))
for k, (t, img) in enumerate(zip(times, F)):
    r, c = divmod(k, cols)
    x, y = pad + c * (TW + pad), head + r * (TH + lab + pad)
    sheet.paste(Image.fromarray(img), (x, y + lab))
    is_bar = t in downbeats
    mv = [m for (t0, m) in MOVES if t >= t0][-1]
    label = f'{t:06.3f}s  BAR {int(t // 2) + 1:02d}  {mv.split(" · ")[0]}'
    d.text((x, y + 5), label, font=small, fill=(241, 238, 230) if is_bar else (255, 74, 28))
sheet.save(out)
print('wrote', out, sheet.size, len(times), 'frames')

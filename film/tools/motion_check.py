#!/usr/bin/env python3
"""Motion review helpers.
  motion_check.py diff VIDEO            -> per-frame mean abs difference, flags spikes (possible pops)
  motion_check.py strip VIDEO OUT.png T0 N [STEP]  -> filmstrip of N consecutive frames starting at time T0
  motion_check.py seam VIDEO            -> difference between last frame and first frame vs typical step"""
import sys, subprocess
import numpy as np

def frames(video, w=240, h=135):
    out = subprocess.run(['ffmpeg', '-v', 'error', '-i', video, '-vf', f'scale={w}:{h}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(out, np.uint8).reshape(-1, h, w, 3).astype(np.float32)

def fps_of(video):
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', video], capture_output=True, text=True).stdout.strip()
    a, b = r.split('/'); return float(a) / float(b)

cmd, video = sys.argv[1], sys.argv[2]
fps = fps_of(video)
if cmd == 'diff':
    F = frames(video)
    d = np.abs(np.diff(F, axis=0)).mean(axis=(1, 2, 3))
    med = np.median(d)
    print(f'{len(F)} frames @ {fps:.0f} fps, median step {med:.2f}')
    # a pop = a step much larger than its neighbours
    for i in range(1, len(d) - 1):
        loc = np.median(d[max(0, i - 6):i + 7])
        if d[i] > 3.0 * max(loc, 1.0) and d[i] > 6:
            print(f'  spike at frame {i}->{i + 1} (t={(i + 1) / fps:.3f}s): step {d[i]:.1f}, local median {loc:.1f}')
    seam = np.abs(F[0] - F[-1]).mean()
    print(f'loop seam step (last->first) {seam:.2f}; neighbours: first {d[0]:.2f}, last {d[-1]:.2f}')
    # coarse activity timeline (per beat)
    per_beat = [d[int(b * fps / 2):int((b + 1) * fps / 2)].mean() for b in range(30)]
    print('activity per beat:', ' '.join(f'{v:.0f}' for v in per_beat))
elif cmd == 'strip':
    out, t0, n = sys.argv[3], float(sys.argv[4]), int(sys.argv[5])
    step = int(sys.argv[6]) if len(sys.argv) > 6 else 1
    F = frames(video, 384, 216)
    i0 = int(round(t0 * fps))
    from PIL import Image, ImageDraw
    cols = min(n, 6); rows = (n + cols - 1) // cols
    sheet = Image.new('RGB', (cols * 388 + 4, rows * 236 + 4), (24, 24, 26))
    dr = ImageDraw.Draw(sheet)
    for k in range(n):
        i = (i0 + k * step) % len(F)
        im = Image.fromarray(F[i].astype(np.uint8))
        x, y = 4 + (k % cols) * 388, 4 + (k // cols) * 236
        sheet.paste(im, (x, y + 18))
        dr.text((x + 2, y + 2), f'f{i}  t={i / fps:.3f}', fill=(230, 230, 230))
    sheet.save(out); print('wrote', out)

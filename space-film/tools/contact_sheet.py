"""Contact sheet: one frame every N seconds, labelled with time and frame.

Usage: python3 -I tools/contact_sheet.py <frames dir> <out.jpg> [every_seconds=2] [cols=6]
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

FPS = 30
frames_dir, out = Path(sys.argv[1]), Path(sys.argv[2])
every = float(sys.argv[3]) if len(sys.argv) > 3 else 2.0
cols = int(sys.argv[4]) if len(sys.argv) > 4 else 6

files = {int(p.stem[1:]): p for p in frames_dir.iterdir() if p.suffix in (".jpg", ".png") and p.stem.startswith("f")}
last = max(files)
picks = [n for n in range(0, last + 1, int(round(every * FPS))) if n in files]
if picks[-1] != last:
    picks.append(last)

tw, th = 400, 225
rows = (len(picks) + cols - 1) // cols
sheet = Image.new("RGB", (cols * tw, rows * (th + 18)), (24, 24, 24))
draw = ImageDraw.Draw(sheet)
for i, n in enumerate(picks):
    im = Image.open(files[n]).convert("RGB").resize((tw, th), Image.LANCZOS)
    x, y = (i % cols) * tw, (i // cols) * (th + 18)
    sheet.paste(im, (x, y + 18))
    draw.text((x + 4, y + 3), f"{n / FPS:5.1f}s  f{n}", fill=(255, 220, 90))
out.parent.mkdir(parents=True, exist_ok=True)
sheet.save(out, quality=90)
print(out, len(picks), "frames")

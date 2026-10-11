#!/usr/bin/env python3
"""Objective checks for the soundtrack: levels, clipping, beat alignment, loop seam, spectrogram.
usage: analyze_audio.py soundtrack.wav [out.png]"""
import sys, wave
import numpy as np

path = sys.argv[1]
with wave.open(path, 'rb') as w:
    sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
    x = np.frombuffer(w.readframes(n), dtype=np.int16).reshape(-1, ch).astype(np.float64) / 32768.0
mono = x.mean(axis=1)
print(f'rate {sr} Hz, channels {ch}, samples {n}, duration {n / sr:.6f} s')
peak = np.abs(x).max()
print(f'peak {20 * np.log10(peak):.2f} dBFS, clipped samples: {(np.abs(x) >= 32767 / 32768).sum()}')
rms = np.sqrt((x ** 2).mean())
print(f'overall RMS {20 * np.log10(rms):.2f} dBFS')
spb = sr // 2  # samples per beat at 120 BPM
for bar in range(8):
    a, b = bar * 4 * spb, min(n, (bar + 1) * 4 * spb)
    seg = x[a:b]
    print(f'  bar {bar + 1 if bar < 7 else "7.5"}: RMS {20 * np.log10(np.sqrt((seg ** 2).mean()) + 1e-12):6.2f} dBFS  peak {20 * np.log10(np.abs(seg).max() + 1e-12):6.2f}')
# onset strength: energy of the 2 ms after each beat vs. the 2 ms before -> kick transients sit on the grid
env = np.convolve(mono ** 2, np.ones(96) / 96, mode='same')
ratios = []
for k in range(30):
    i = k * spb
    pre = env[max(0, i - 480):max(1, i - 48)].mean() + 1e-12
    post = env[i + 48:i + 960].max()
    ratios.append(post / pre)
print('beat onset energy ratio (post/pre) min %.1f median %.1f' % (min(ratios), np.median(ratios)))
# where is the strongest low-frequency transient within +-20 ms of each beat?
lo = np.convolve(mono, np.ones(48) / 48, mode='same')  # crude lowpass
offs = []
for k in range(30):
    i = k * spb
    win = np.abs(lo[max(0, i - 960):i + 960])
    j = int(np.argmax(np.diff(np.convolve(win, np.ones(24) / 24, mode='same'))))
    offs.append((j - min(i, 960)) / sr * 1000)
print('kick attack offset from grid (ms): mean %.2f, max |off| %.2f' % (np.mean(offs), np.max(np.abs(offs))))
# loop seam: the step across the wrap vs. typical neighbouring-sample steps
d_wrap = np.abs(x[0] - x[-1]).max()
d_typ = np.percentile(np.abs(np.diff(x, axis=0)).max(axis=1), 99.9)
print(f'loop seam step {d_wrap:.5f}  (99.9th pct of in-file sample steps {d_typ:.5f})')
if len(sys.argv) > 2:
    from PIL import Image, ImageDraw
    nfft, hop = 2048, 256
    win = np.hanning(nfft)
    frames = 1 + (n - nfft) // hop
    S = np.stack([np.abs(np.fft.rfft(mono[i * hop:i * hop + nfft] * win)) for i in range(frames)], axis=1)
    S = 20 * np.log10(S + 1e-9)
    # log-frequency rows 30 Hz .. 16 kHz
    freqs = np.fft.rfftfreq(nfft, 1 / sr)
    rows = 300
    fq = np.geomspace(30, 16000, rows)
    idx = np.clip(np.searchsorted(freqs, fq), 0, len(freqs) - 1)
    img = S[idx][::-1]
    img = np.clip((img - (img.max() - 80)) / 80, 0, 1)
    im = Image.fromarray((img * 255).astype(np.uint8)).resize((1500, rows))
    rgb = Image.merge('RGB', (im, im, im))
    d = ImageDraw.Draw(rgb)
    for k in range(31):
        xx = int(k * 0.5 / (n / sr) * 1500)
        d.line([(xx, 0), (xx, 6 if k % 4 else 14)], fill=(255, 74, 28))
    wave_img = Image.new('RGB', (1500, 120), (10, 10, 11))
    dw = ImageDraw.Draw(wave_img)
    step = n // 1500
    for c in range(1500):
        seg = mono[c * step:(c + 1) * step]
        dw.line([(c, 60 - seg.max() * 58), (c, 60 - seg.min() * 58)], fill=(241, 238, 230))
    out = Image.new('RGB', (1500, rows + 120))
    out.paste(rgb, (0, 0)); out.paste(wave_img, (0, rows))
    out.save(sys.argv[2])
    print('wrote', sys.argv[2])

# ISOLINE — Thread → Signal → Terrain → System

A 15-second, 1920×1080, 60 fps procedural motion-design film with an original soundtrack. Everything is generated from code: one HTML file renders every frame from absolute time, and the same file synthesizes the music.

| File | What it is |
|---|---|
| `final.mp4` | The finished film. H.264 High, 1920×1080, 60 fps, 900 frames, 15.000 s, AAC 48 kHz stereo. |
| `soundtrack.wav` | The original soundtrack. 48 kHz, stereo, 16-bit PCM, 15.000 s. It loops seamlessly. |
| `index.html` | The self-contained film (WebGL2), with fonts, shaders and synth inlined. Open it and click to play with sound. |
| `storyboard.md` | The concept, visual direction, the 30-beat storyboard and the transformation continuity map. |
| `contact-sheet.png` | Frames from the final film on every beat, plus the key half-beat transitions. |
| `src/` | Readable sources that `tools/build.mjs` inlines into `index.html`. |
| `tools/` | The render pipeline and QC tools (Playwright, FFmpeg, Python). |

## How it works

- **Deterministic time.** `window.seek(t)` renders the frame at absolute time `t`. It keeps no state between calls and uses no timers or CSS animation. All randomness is seeded. Static geometry, such as the terrace mesh, is cached; the cache is a pure function of its inputs.
- **One field, many forms.** Lines are level sets of scalar fields, drawn analytically with derivative-based anti-aliasing:
  - The thread is a single level set.
  - The weave is two families of level sets.
  - The interference is the beat between those families.
  - The word is a phase shift applied to one of them.
  - The contours appear because the gratings are stretched until `F = v/λ + k·h` becomes `k·h`.
- **Terraces.** The 3D landscape is an isoband mesh built from the same field. Every vertex carries its field value, so the terrace contour lines are the same level sets the 2D shader draws, and the 2D→3D hand-off matches to the pixel.
- **Motion blur.** Each output frame averages 3 renders at −⅓, 0 and +⅓ of the frame interval, weighted ¼, ½, ¼ (a centred tent filter). Subframes that fall before 0 or after 15 wrap around, so the blur stays correct across the loop point.
- **Loop.** The final half-bar ends in the opening's own state functions (`u = t − 15`), and the camera is a periodic spline. The soundtrack renders two identical cycles and keeps the second. Rendering a third cycle confirms the seam is sample-exact.

## Reproduce

Requirements: Node 22 with Playwright (Chromium; SwiftShader WebGL2 works), FFmpeg, and Python 3 with numpy and Pillow.

```bash
cd film
node tools/build.mjs                                   # inline src/ into index.html
node tools/render.mjs audio  --out soundtrack.wav       # OfflineAudioContext -> WAV
node tools/render.mjs final  --workers 3 --audio soundtrack.wav --out final.mp4
python3 tools/analyze_audio.py soundtrack.wav           # levels, clipping, beat alignment, seam
node tools/render.mjs preview --w 480 --h 270 --fps 60 --out preview.mp4
python3 tools/motion_check.py diff preview.mp4          # frame-to-frame continuity and loop seam
```

Fonts are Inter (SIL Open Font License), subset and inlined. To rebuild `build/fonts.js`, run `python3 tools/subset_fonts.py`; it needs fontTools and the Inter OTFs.

# ISOLINE — Thread → Signal → Terrain → System → Network

A 75-second, 1920×1080, 60 fps procedural motion-design film with an original 120 BPM soundtrack. Everything is generated from code: one HTML file renders every frame from absolute time, and the same file synthesizes the music. The 15-second original is kept in [`v1-15s/`](v1-15s/).

| File | What it is |
|---|---|
| `final.mp4` | **The film, ready to download and upload.** H.264 High, 1920×1080, 60 fps, 4500 frames, 75.000 s, BT.709, AAC-LC 48 kHz stereo 384 kb/s, fast start. Size: under 100 MiB (the render of this 75 s cut is being committed separately). |
| `soundtrack.wav` | The original soundtrack. 48 kHz, stereo, 16-bit PCM, 75.000 s. It loops seamlessly. |
| `index.html` | The self-contained film (WebGL2 + Web Audio), with fonts, shaders and synth inlined. Open it and click to play with sound. |
| `storyboard.md` | The concept, visual direction, the 37½-bar storyboard (5 movements) and the continuity map. |
| `contact-sheet.png` | Frames from the final film on every bar downbeat, plus the key moments in between. |
| `src/` | Readable sources that `tools/build.mjs` inlines into `index.html`. |
| `tools/` | The render pipeline and QC tools (Playwright, FFmpeg, Python). |

## Download it, then post it anywhere

`final.mp4` is a normal file in this repository, so you can download it directly:

1. On GitHub, open `film/final.mp4` (on the branch it lives on).
2. Click the **Download raw file** button (the down-arrow icon at the top right of the file view). If GitHub says the file is too big to display, click **View raw**; that downloads it.

The file is encoded to the upload recommendations of the big platforms, so you can upload it as is:

| Where | How | Fits? |
|---|---|---|
| **YouTube** | Upload `final.mp4`. | Matches YouTube's recommended upload settings for 1080p60: MP4, H.264 High, progressive, 4:2:0, fast start, AAC-LC 48 kHz stereo at 384 kb/s. |
| **X (Twitter)** | Attach it to a post. | 75 s and under 100 MB are under X's limits for standard accounts (2 min 20 s, 512 MB). |
| **Google Drive / Dropbox / iCloud** | Upload the file. | Any size works; Drive previews 1080p video. |
| **Instagram / LinkedIn / others** | Upload `final.mp4`. | Standard H.264/AAC MP4; each platform re-encodes on upload. |

**Why the file is in the repo and not somewhere else:** GitHub rejects any single file over 100 MiB in a normal push, and warns above 50 MiB. `final.mp4` is encoded with two-pass H.264 to land under 100 MiB, so it can live in the repository and be downloaded directly with no extra setup. Larger files would need Git LFS (up to 2 GB per file on GitHub Free, 10 GiB of LFS storage and bandwidth per month) or a GitHub Release asset (each file under 2 GiB).

## How it works

- **Deterministic time.** `window.seek(t)` renders the frame at absolute time `t`. It keeps no state between calls and uses no timers or CSS animation. All randomness is seeded. Static geometry, such as the terrace meshes and glyph solids, is cached; each cache is a pure function of its inputs.
- **One field, many forms.** Lines are level sets of scalar fields, drawn analytically with derivative-based anti-aliasing:
  - The thread is a single level set; the weave is two families of level sets; the interference is the beat between them.
  - The word SIGNAL is a phase shift applied to one family, and then the phase becomes height: the letters rise into relief.
  - The contours appear because the gratings are stretched until `F = v/λ + k·h` becomes `k·h`.
- **Terraces and landforms.** The 3D landscape is an isoband mesh built from the same field, so its contour lines are the same level sets the 2D shader draws. The tectonic shift interpolates between two landforms and rebuilds the mesh every frame. Whenever the map is flat next to a terrace-rendered shot, it is printed by the terrace mesh itself, so the renderer hand-offs (20 s, 31 s, 62 s, 70.25 s) match to a fraction of a pixel.
- **The 3D interface.** The editorial sheet is built from physical slabs with thickness, sculpted walls (paper lit from the west, cobalt in shadow) and soft drop shadows on the paper ground.
  - The numerals and the section letter are **extruded solids**, made as isobands of each glyph's own distance field. They sit on drum odometers that rise out of the column.
  - Projection lines become 3D wires between the layers, and the section silhouette extrudes into a fin. The chart hinges up into a standing section panel.
- **The network.** The map block splits 1→32 by binary subdivision (the same operation that multiplied the thread). The tiles spread into streets and rise as towers whose height is each tile's mean elevation. Each top still shows its own piece of the contour map. Orange branches route from the main thread to every tower and carry data pulses. A street-level camera flies down the avenue that opened under the thread.
- **Motion blur.** Each output frame averages 3 renders at −⅓, 0 and +⅓ of the frame interval, weighted ¼, ½, ¼ (a centred tent filter). Subframes outside 0–75 s wrap around, so the blur stays correct across the loop point.
- **Loop.** The final half-bar ends in the opening's own state functions (`u = t − 75`), and the camera is one periodic spline that orbits −360° per cycle, so it never unwinds.
- **Soundtrack.** Web Audio synthesis in an `OfflineAudioContext`: kick, clap, hats, bass, sub, plucks, stabs, pads, pings, risers. Notes are created just in time at deterministic `suspend()` points, so the graph stays small and the 75 s score renders in under a minute. The kept cycle is preceded by the previous cycle's last bars, so every tail crossing 75.000 s wraps into the start. Rendering three cycles confirms the seam is sample-exact (max difference ≈ 1e−7).

## Reproduce

Requirements: Node 22 with Playwright (Chromium; SwiftShader WebGL2 works), FFmpeg, and Python 3 with numpy and Pillow.

```bash
cd film
node tools/build.mjs                                     # inline src/ into index.html
node tools/render.mjs audio --out soundtrack.wav          # OfflineAudioContext -> WAV
node tools/render.mjs audio --verify                      # 3 cycles: seam must be sample-exact
python3 tools/analyze_audio.py soundtrack.wav             # levels per bar, clipping, seam
node tools/render.mjs final --splits 300,600,900,1200,1500,1800,2100,2400,2700,3000,3300,3600,3900,4200 \
     --parallel 4 --audio soundtrack.wav --target-mb 97 --out final.mp4
python3 tools/verify_final.py final.mp4 soundtrack.wav 75 100
python3 tools/final_contact_sheet.py final.mp4 contact-sheet.png
```

`final` renders lossless FFV1 chunks (resumable: finished chunks are reused), then encodes. With `--target-mb` it runs a two-pass encode sized to that many megabytes; without it, it uses `--crf` (default 17). For a quick look, use `node tools/render.mjs preview --w 480 --h 270 --fps 30 --out preview.mp4`, then `python3 tools/motion_check.py diff preview.mp4` to flag frame-to-frame pops.

Fonts are Inter (SIL Open Font License), subset and inlined. To rebuild `build/fonts.js`, run `python3 tools/subset_fonts.py`; it needs fontTools and the Inter OTFs.

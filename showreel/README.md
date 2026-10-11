# HOLLOW LIGHT — 15 s motion showreel

**Concept:** Leonardo da Vinci's 1509 hollow icosahedron is inked as an archival sketch, rebuilt as a wireframe from its own golden rectangles, and lit as a scanline hologram whose lines become the end title.

- `out/hollow-light-showreel.mp4` is the final piece: 1920×1080, 60 fps, H.264 + AAC, 15.000 s. It loops seamlessly because the last frame flows into the first.
- `reel.html` is the piece itself. It is one self-contained file with Geist inlined, and `window.seek(t)` paints any moment as a pure function of time.
- `out/soundtrack.wav` is the score, synthesized with the Web Audio API (`OfflineAudioContext`) inside the same file.

## System
| | |
|---|---|
| Typeface | Geist, variable 100–900 (weight itself is animated) |
| Palette | Sepia `#6B4426` · Vermilion `#E8441E` · Cyan `#4FF0E1`, plus Black `#0B0B0C` and Paper-white `#F2EDE3` |
| Camera | Forward only. Every bar line is an exponential push-in through a detail of the previous shot, and the camera creeps forward between pushes. No cuts, pans or shake. |
| Motion | Damped springs (ζ ≈ 0.82–0.86, about 1 % overshoot, never bouncy) and exponential easing, all written as functions of time. |
| Blur | Speed-driven. Each subframe averages 1–28 renders across its shutter slice, with sample count set by measured on-screen speed, and ffmpeg `tmix` blends 3 subframes per frame. The total shutter is 180°. |

## Storyboard (120 BPM, 0.5 s per beat)
| Bar | Beats | Technique | What happens |
|---|---|---|---|
| 1 | 1–4 | Hook | The title's square period opens into paper. A vermilion compass and construction lines are drawn, the skeletal icosahedron is inked and hatched, and the hand-drawn solid turns in 3D. |
| 2 | 5–8 | Kinetic type | The caption word INK fills the frame. INK becomes LINE and then LIGHT as letters slide through masks, weight runs 500→820→140→900, and colour wipes from sepia to vermilion to black. LIGHT scatters around its I. |
| 3 | 9–12 | Shape morph | The I stem becomes a circle (r), a triangle (60°), a pentagon (108°) and then a golden rectangle (1 : 1.618). The ink floods the page, leaving the rectangle as a paper-white line. |
| 4 | 13–16 | 2D → 3D | The rectangle tips into perspective, two more golden rectangles swing out perpendicular to it, and 30 edges fire between the 12 corners to form an icosahedron. |
| 5 | 17–20 | Data / UI | VERTICES 12, EDGES 30 and FACES 20 count up, then fly into Euler's formula: 12 − 30 + 20 = 2. |
| 6 | 21–24 | Light | The equation collapses into a scan line that splits and sweeps the wireframe into a scanline hologram. Projector rings unfold, a quarter-turn whip raises the line density, and an orbit ring carries the data. |
| 7 | 25–28 | Strongest moment | The hologram shatters into 20 scanline triangles and the camera rushes into the shell. The hologram's own scanlines condense into **SHOWREEL** and fuse into solid letters. |
| ½ | 29–30 | End title | "MOTION DESIGN — 2026" types in, the period lands, and the camera starts the push that becomes frame 0. |

Kinetic type, shape morph, 2D→3D, data/UI and the end title each get exactly four beats.

**Sound:** a kick on every beat, offbeat bass in a Dm–B♭–F–C progression, a hit on every scene change (biggest at bar 7), a riser with an accelerating snare roll into bar 7, and per-scene foley (pen scratches, type ticks, morph whooshes, rectangle clacks, data blips). The score is played twice inside the render and the second pass is kept, so reverb and compressor tails loop seamlessly. The compressor's measured 6.1 ms look-ahead is compensated, and every kick onset sits within 0.1 ms of the grid.

## Facts on screen
Pacioli's *Divina proportione* was printed in Venice in 1509 with polyhedra drawn by Leonardo, who drew skeletal versions of the solids. The book notes that golden rectangles can be inscribed in an icosahedron. The 12 vertices are (±φ, ±1, 0) and their cyclic permutations, and V − E + F = 12 − 30 + 20 = 2.

## Render it yourself
```bash
node build.mjs                                  # inline Geist -> reel.html
node render.mjs beats  /tmp/beats 0.25          # one review frame per beat
node render.mjs audio  /tmp/audio.wav           # soundtrack -> WAV
node render.mjs frames /tmp/sub 4               # 900 frames x 3 subframes (Playwright, 4 pages)
./encode.sh /tmp/sub /tmp/audio.wav out/hollow-light-showreel.mp4
```
To change the end title, edit `TITLE` / `SUBTITLE` at the top of `src/reel.html`.

Geist is © The Geist Project Authors and used under the SIL Open Font License 1.1 (`src/Geist-OFL.txt`).

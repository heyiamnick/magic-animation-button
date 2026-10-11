# ISOLINE — Thread → Signal → Terrain → System

15.000 s · 1920×1080 · 60 fps · 120 BPM · 4/4 · 30 beats (7 bars + ½ bar) · seamless loop

This document describes the film as rendered. Every timing below is taken from `src/scene.js` and `src/audio.js`.

---

## A. Concept declaration

**Every image in this film is an isoline — a line of equal value. Change the field beneath one orange thread and it becomes weave, signal, terrain and system, then pulls itself taut again.**

The thread never leaves the screen. It splits into the weave. It is the one line that stays still when the interference stretches away. It becomes section line A–A′ cutting the terrain, then the chart line of the interface. It threads through the letters of the title, and it is the line the title collapses back into.

## B. Visual direction

| | |
|---|---|
| **Typeface** | Inter, one family only. *Inter Display Black* for SIGNAL, ISOLINE, the elevation numerals and the section letter. *Inter SemiBold* in tracked caps (0.14–0.16 em) for captions and cartographic labels. Kerning comes from the font, measured at load time. |
| **Palette** | Ink `#0A0A0B` · Paper `#F1EEE6` · Signal Orange `#FF4A1C` (the thread and everything that names it: the profile, the section letter, the index data points) · Cobalt `#2B36FF` (shadowed terrace walls and the measurement probe). Two expressive colours plus black and white. |
| **Spatial language** | Architectural drawing. Everything sits on one ground plane, and the camera moves between **plan** (straight down) and **oblique/section**. 2D scenes are plan views of the plane; 3D scenes are the same plane with height. The interface is literally a drafting sheet: the map is a black block on paper. |
| **Motion vocabulary** | Binary subdivision on 16ths. Ratchet rotation (the angle halves each 16th). Phase shift. Exponential stretch (λ→∞). Extrusion cascade. Hinge folds. Critically damped springs for anything that docks. Exponential snaps for impacts. Odometer rolls for numbers. No elastic overshoot, no shake, no unmotivated rotation. |
| **Light** | One key light from the west. Lit walls are paper; walls facing away fall to cobalt. Caps carry a hypsometric tint from ink at the bottom to paper at the top. |

## C. Beat-by-beat storyboard (as rendered)

`A` = orange line family (the thread) · `B` = white line family (hidden under A at t=0) · `h` = terrain field · `u` = world units (frame height in plan = 2 u)

### Bar 1 — THE IMPOSSIBLE THREAD (0:00–0:02)

| Beat | Time | Geometry | Camera | Music | Composition / type |
|---|---|---|---|---|---|
| 1 | 0.000 | The thread, slack in the last 0.3 s of the loop, snaps taut. Two Gaussian whip pulses race outward from the centre at 4.4 u/s. Each carries a lateral kink and a 3D lift; the crest briefly hides the thread behind it. | Low, close and wide (pitch 11°, yaw −78°, 44° fov), looking down the thread. Near end ≈30 px wide, far end a hairline. | Kick, plus a D5 pluck with a +7-semitone snap. Bass pulse starts. | A single orange diagonal bursting from the corner. `01  THREAD` caption top-left. |
| 2 | 0.500 | Binary subdivision on each 16th: 1→2→4→8→16 filaments. The band widens 0.42→1.1 u, and stroke width falls as 3.8·2^(−0.32m) px. A sheet wave ripples the plane on the kick. | Rising and opening out (pitch 17°, yaw −69°). | Kick and clap. The arpeggio rate doubles on every 16th (1, 2, 4, 8 notes). | Filaments fan through perspective. |
| 3 | 1.000 | Scissor: the white copy B swings 0→90° out from under A (exponential out, 0.42 s). An over/under weave front sweeps the bisector in 6 steps. Gaps cut the under-thread. | Climbing (pitch 35°, yaw −49°). | Kick. A white-thread pluck a fifth above, bending −5 semitones. | A woven lattice in perspective. |
| 4 | 1.500 | Second subdivision round: 16→32→64→128→256 lines per family. The band widens to 4 u, so the lattice reaches edge to edge. | Arrives in plan (90°) at 2.000, decelerating to rest. | Clap, then a 32nd hat roll. | A dense orange × white weave. |

### Bar 2 — CONTROLLED CHAOS (0:02–0:04)

| Beat | Time | Geometry | Camera | Music | Composition / type |
|---|---|---|---|---|---|
| 5 | 2.000 | Ratchet: B's angle halves on every 16th (90→45→22.5→…). Moiré fringes appear and swing, much faster than the lines themselves. The weave gaps close. | Plan, slow push (4.5% over two bars). | Kick. Interference pad: three detuned saw pairs whose beat frequency halves on every 16th (8→4→2→1 Hz…), so the moiré is audible. | Interference across the full frame. |
| 6 | 2.500 | **SIGNAL** is wiped in from top to bottom in 0.12 s. Inside the letterforms the white lines shift half a period and thicken to ~45% duty. | Plan | Snare and a Dm9 stab. | SIGNAL at 2.86 u (≈80% of frame width), built from the grating's own lines. |
| 7 | 3.000 | Stretch ×2.45 (exponential in). At 3.250 the comb split begins: alternate strips shear ±0.42 u. | Plan | Kick, stab bending down 2 semitones. Four 64th stab stutters on the split. | The word overruns the frame, then shears apart. |
| 8 | 3.500 | Reconstruct: the strips spring back and the stretch releases. From 3.72 the letter field blurs while its phase grows to 3 lines, so moiré fringes wrap around the letter shapes. | Plan | Snare, stab re-hit with a long reverb. | The word re-forms, then melts into fringes. |

### Bar 3 — CHAOS FINDS STRUCTURE (0:04–0:06)

| Beat | Time | Geometry | Camera | Music | Composition / type |
|---|---|---|---|---|---|
| 9 | 4.000 | The letter phase morphs into the terrain phase `30·h`; the fringes become topographic. The orange grating stretches (S = e^(9.5·x^1.6)), and every orange line flies away except one: the thread. | Plan, slow push. | Kick. Bass to B♭, and a Bbmaj7 16th arpeggio enters with its filter opening. | `03  TERRAIN`. |
| 10 | 4.500 | The white grating stretches too (`F = v/λ + k·h`, λ→∞). Straight lines bend around bumps and break at saddles. | Plan | Snare | Lines bend into curves. |
| 11 | 5.000 | Topology closes: every white line is an exact level set of h. The contours then stream outward downhill by 10 levels, decelerating to rest at 6.000. | Plan, push continues. | Kick | A flowing topographic map, cut by one orange line (section A–A′). |
| 12 | 5.500 | A sweep runs left to right. Behind it, index contours (every 5th) thicken to 2.3 px and the thread settles on top of the weave. | Plan, coming to rest. | Snare, riser into the drop. | Cartographic hierarchy. |

### Bar 4 — DIMENSIONAL BREAKTHROUGH (0:06–0:08)

| Beat | Time | Geometry | Camera | Music | Composition / type |
|---|---|---|---|---|---|
| 13 | 6.000 | Hand-off to an isoband mesh of the same field, matched to the pixel. Every band lifts to its level in a 13 ms-per-level cascade and every contour becomes a wall. The black map is revealed as a block on a paper sheet. | Plan → oblique (pitch 52°, yaw −26°). | Kick, **sub drop** G1, crash, wide Gm9 pad. | A stepped landscape rising. |
| 14 | 6.500 | The height curve sharpens (exponent 1→1.32). Hypsometric tint on the caps; walls lit paper, shadows cobalt; strata hatching on the walls. | Dive to pitch 24°, yaw −64°. | Snare. Half-time bass, arpeggio on the off-16ths. | Occlusion and depth. |
| 15 | 7.000 | The thread drapes over the terraces as a stepped orange staircase across the massif. A bass hit pulses the heights by 5%. | Low pass along the thread (pitch 17°, yaw −86°). | Kick | The thread reads as a road through the landscape. |
| 16 | 7.500 | Overlapping hatched walls produce moiré. | Turning to look east along the thread. | Snare, riser. | |

### Bar 5 — TERRAIN BECOMES INTERFACE (0:08–0:10)

| Beat | Time | Geometry | Camera | Music | Composition / type |
|---|---|---|---|---|---|
| 17 | 8.000 | The terraces collapse from high to low. The draped thread **stays standing** as a ghost profile while the ground drops away beneath it, revealing the flat section line. | **Macro → micro** crane-up into a high plan view: the landscape becomes one module of an editorial sheet. | Kick, mechanical 16th bass on F, 16th ticks. | |
| 18 | 8.500 | The ghost profile hinges 90° flat (8.42–8.78), then slides south into the chart area (8.72–9.12). Its heights convert from terrain scale to chart scale. | Settles in plan at 9.000. | Snare | The ridge becomes the chart line. |
| 19 | 9.000 | Projection lines drop from every point where the thread crosses a contour, in eight groups on 32nds, two-tone (paper over the black map, ink over paper). They land as data points on their level's gridline; index levels are marked orange. The gridlines (= the 30 contour levels) draw in with metre labels. The right column builds: ELEVATION odometer and section letter. | Plan | Kick, eight rising ticks (one per group). Hook: F5–A5–C6. | `04  SYSTEM`. |
| 20 | 9.500 | The profile straightens from steps to data-point segments. The black section silhouette (the block's cut face) sweeps in. The cobalt probe starts racing the thread between coastline crossings. Hypsometric bars grow out of the gridlines. | Plan | Snare, hook repeats an octave up. | The complete sheet. |

### Bar 6 — THE LIVING SYSTEM (0:10–0:12)

| Beat | Time | Geometry | Camera | Music | Composition / type |
|---|---|---|---|---|---|
| 21 | 10.000 | The section line jumps north on a spring. Crossings, data points, profile and silhouette are recomputed live from `h`. The section letter rolls A→B. | Plan, imperceptible drift. | Kick, A7sus4 stab, bass on A, filter rising. | |
| 22 | 10.500 | Vertical exaggeration: the map compresses 17% toward its corner and the chart, gridlines and bars reflow to fill the room. | | Snare | Panels reorganise. |
| 23 | 11.000 | The section jumps south; the letter rolls B→C; the numerals transform. | | Kick, A7 stab, riser begins. | |
| 24 | 11.500 | Scan: the section line steps across the map on 16ths (D, E, F, G) and the profile flickers through every section. At 12.0 it settles on the centre line. | Inhales: a slight lift and drift just before the drop. | 16th snare roll into a 32nd roll. | Maximum tension. |

### Bar 7 — THE IMPOSSIBLE CLIMAX (0:12–0:14)

| Beat | Time | Geometry | Camera | Music | Composition / type |
|---|---|---|---|---|---|
| 25 | 12.000 | The chart and the right column **hinge up** into standing walls (exponential out, 0.42 s); projection lines become strings from the thread to the wall. The map's field morphs from terrain to the ISOLINE letter field (out-cubic, 0.8 s), and its terraces erupt at 0.07 u per level. | Plunge from the high plan to a low oblique (dist 5.9 → 2.55, pitch 90° → 29°). | **Kick, crash, Dm stab with octaves, D1 sub.** | A monumental stepped mass rising off the sheet. |
| 26 | 12.500 | The letter plateaus slam up a further 0.17 u. Hatched cobalt-and-paper walls overlap. | Gliding along the word. | Snare, stab, distorted bass. | Monument in frame. |
| 27 | 13.000 | The morph is complete: every contour ring is an offset of the letterforms. The thread runs through the letters, visible only in the gaps. | Orbit to the other side (yaw +24°). | Kick, stab | ISOLINE readable in steep perspective. |
| 28 | 13.500 | Heights compress to zero as the camera aligns (13.42–14.0). | Rises to plan, framing the map exactly. | Snare, stab | |

### Final half bar — IDENTITY + LOOP (0:14–0:15)

| Beat | Time | Geometry | Camera | Music | Composition / type |
|---|---|---|---|---|---|
| 29 | 14.000 | **ISOLINE** locks in plan: paper-white letter plateaus inside 11 contour rings, threaded on the orange line. Rings ripple on two 16ths. Hand-off at 14.25 to the 2D field renderer, matched to the pixel. | Plan, still. | Kick, Bbmaj9♯11 chord, B♭ sub. | The title. |
| 30 | 14.500 | The rings contract into the letters. The letters open into 16 white stripes and smear horizontally into full-width lines. Reverse binary merges on 32nds (14.75, 14.8125, 14.875, 14.9375): 16→8→4→2→1, with stroke weight rising back to the thread's. The last white line slides under the orange one. | Plan → the opening's low, close view down the thread. | Kick, clap, reverse swell, four 32nd chord stutters. | At 15.000 the frame is the frame at 0.000. |

## D. Transformation continuity map

| Hand-off | What carries the geometry across |
|---|---|
| **Thread → Weave** | The weave is the thread. Family B sits exactly under family A at t=0, so one visible line is two. Subdivision splits every existing line into two, and the scissor rotation separates the families. No line is ever added. |
| **Weave → Interference** | The same two families with the same 256 lines each. Only the crossing angle changes, halving per 16th; the moiré is the visible beat between them. |
| **Interference → Word** | The word is a phase shift and a duty-cycle change applied to B's existing lines. It is built from the field, never laid over it. |
| **Word → Topography** | The letter phase field blurs into bumps and is interpolated into the terrain field. Moiré between parallel gratings shows level sets of the phase difference, so the fringes already are contours. Stretching both gratings (λ→∞) turns B's lines into those exact contours. The one orange line that stays put is the original thread. |
| **Topography → Landscape** | The isoband mesh is built from the same field, and each vertex carries its field value. The terrace contour lines are therefore the same analytic level sets the 2D shader draws, and plan view at 6.000 matches to the pixel. Extrusion lifts each band to its level. |
| **Landscape → Interface** | The terraces drop away from under the draped thread, which keeps its shape. That ridge profile folds flat and slides into the chart. Projection lines from thread × contour crossings confirm every data point. The chart gridlines are the contour levels, and they continue into the hypsometric bars (area per level). |
| **Interface → Climax** | The panels hinge up into walls around the map, which is the glass box of an orthographic drawing closing. The map's field interpolates from terrain to the letter field and extrudes again, 2.5× taller. |
| **Climax → Title** | Seen from straight above, the letter field's top band is the wordmark and its walls are the rings around it. At 14.25 the plan view hands back to the 2D renderer, matched to the pixel. |
| **Title → Thread → Loop** | The letter plateaus open into the 16 lines they were made from. The lines smear, then merge by reverse binary subdivision into one line under the thread. From 14.75 the final motion is evaluated by the opening's own functions (`u = t − 15`), and the camera is one periodic spline, so 15.000 and 0.000 are the same frame. The soundtrack is a second rendered cycle; a third confirms its seam is sample-exact. |

## E. Soundtrack

Original, synthesized in `OfflineAudioContext` at 48 kHz stereo, 120 BPM, D minor.

**Harmony per bar:** Dm9 · Dm9 · B♭maj7 · Gm9 · Fmaj9 · A7sus4→A7 · Dm · B♭maj9♯11 (½ bar).

**Kick on all 30 beats.** It is a pitch-swept sine plus a click, and the section downbeats (0, 6, 12, 14 s) hit harder. Claps fall on beats 2 and 4. Hats run 16ths, with open hats on the off-8ths from bar 3. The distorted three-oscillator bass sits on the off-16ths and is side-chained to the kick. Each section maps a motif to its image:

- Thread: the pluck snaps on the downbeat and its note rate doubles on every 16th.
- Interference: the detune halves with the moiré angle.
- Contours: an arpeggio with its filter opening.
- Breakthrough: a sub drop.
- Interface: mechanical ticks, one per projection-line group.
- Climax: stabs, distorted bass and a crash.
- Identity: the chord, a reverse swell and 32nd stutters that mirror the merges.

**Levels:** peak −1.00 dBFS (normalised), no clipped samples, overall RMS ≈ −11.5 dBFS. Bar 7 is the loudest bar.

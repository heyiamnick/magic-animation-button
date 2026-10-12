# The next 30 years in space — one take

An 84-second, 1920×1080, 30 fps film made in code. It is one continuous camera
flight with no cuts: it starts close over the night side of Earth in 2026 and
ends among the mirrors round Mars in 2056. Every frame is computed in three.js
from its frame number alone and rendered in headless Chromium.

**These are guesses, not forecasts.** The years and the things built by them
are one plausible picture drawn from today's plans and studies (sources
below), not predictions. Nothing on screen claims otherwise.

## The five stops

| # | Year | Body | Line on screen | What you see | Why it is a fair guess |
|---|------|------|----------------|--------------|------------------------|
| – | 2026 | Earth | earth at night | City lights of Europe and North Africa from close over the night side (the opening, not a stop) | — |
| 1 | 2030 | Earth | 40,000 satellites in low earth orbit | ~40,000 points on shells at real inclinations; dark in Earth's shadow, lit in sunlight; ~13,000 already up in 2026, the rest appear as the year counts | ~10,900 Starlink up as of Aug 2026; Amazon Leo (3,236), Guowang (~13,000), Qianfan (~14,000) filings; SpaceX filed for up to 1 million (Jan 2026) |
| 2 | 2036 | Moon | a base at the moon's south pole | A cluster of small lights, landing-pad rings and lit roads on the rim of Shackleton crater, on the day–night line | NASA Moon Base plan (Mar 2026) aiming at a US base by 2036; China's research station by 2035; Artemis IV landing targeted for 2028 |
| 3 | 2043 | Moon | a railway around the moon | A thin band of 1,440 segments round the equator, built outwards from a spur from the base, with six bright trains running on it | DARPA LunA-10 lunar railway study (Northrop Grumman, 2024) |
| 4 | 2050 | Mars | the first city on mars | A lit street grid, towns, roads and a spaceport in Arcadia Planitia on the night side | SpaceX's stated aim of starting a Mars city within 5–7 years and Mars as a 20+ year effort (Feb 2026) |
| 5 | 2056 | Mars | mirrors warming mars | 6,000 small flat mirrors on six tilted circular orbits, turned to throw sunlight on the city; they glint, and go dark in Mars's shadow | Kite et al. 2025 (Nature Astronomy) roadmap with orbiting solar sails as mirrors; Salazar & Winter 2019 on reflector orbits round Mars |

Each stop is further from Earth than the one before or bigger than it. Each
holds for 6–8 s with its line fully visible for at least 5.6 s. The year counts
up while the camera travels and lands on each stop's year as the camera arrives.

## Map files (all public domain, downloaded into `maps/src/`)

| File | What | Source | Licence |
|------|------|--------|---------|
| `world.topo.bathy.200404.3x21600x10800.jpg` | Earth by day: Blue Marble Next Generation with topography and bathymetry, April 2004, 21600×10800 | NASA Earth Observatory — [page](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry), [file](https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/april/world.topo.bathy.200404.3x21600x10800.jpg) | NASA media, not subject to copyright in the US ([NASA guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)) |
| `BlackMarble_2016_3km.jpg` | Earth at night: Black Marble 2016 colour map, 13500×6750 | NASA Earth Observatory, Suomi NPP VIIRS — [page](https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/), [file](https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg) | NASA media, as above |
| `lroc_color_16bit_srgb_8k.tif` | Moon colour (2025 version), 8192×4096, from the LRO camera's WAC mosaic | NASA Scientific Visualization Studio, CGI Moon Kit — [page](https://svs.gsfc.nasa.gov/4720), [file](https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_16bit_srgb_8k.tif) | NASA media, as above; credit NASA's Scientific Visualization Studio |
| `ldem_16_uint.tif` | Moon elevation, 5760×2880, from LRO's laser altimeter (LOLA) | NASA SVS CGI Moon Kit — [file](https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16_uint.tif) | NASA media, as above |
| `Mars_Viking_ClrMosaic_global_925m.tif` | Mars: Viking global colour mosaic, 925 m/px, 23059×11530 | USGS Astrogeology — [page](https://astrogeology.usgs.gov/search/map/mars_viking_global_color_mosaic_925m), [file](https://planetarymaps.usgs.gov/mosaic/Mars_Viking_ClrMosaic_global_925m.tif) | Public domain (USGS page: access constraints "public domain", use constraints "None") |

NASA's media guidelines say NASA content, "such as texture maps and polygon
data in any format – generally are not subject to copyright in the United
States". The originals are ~1.1 GB and are not committed; `tools/fetch_sources.sh`
downloads them again and checks their SHA-256. `tools/prep_maps.py` only
resamples them into `web/tex/` (8K for Earth, 4K for Moon and Mars) and
computes a normal map from the Moon's elevation data. Nothing is painted, and
no image or video model is used anywhere.

## Music

Edvard Grieg, *Peer Gynt* Suite No. 1, Op. 46 — I. "Morning Mood". Recording by
Musopen (Kickstarter recordings, 2012), released under the **Public Domain
Mark 1.0**: Internet Archive item
[musopen-lossless-dvd](https://archive.org/details/musopen-lossless-dvd)
(lossless ALAC). The composition is public domain too (Grieg died in 1907).
Musopen asks, as a courtesy, to be credited. The film uses the first 84 s of
the track from its start, unedited: its sunrise climax arrives just as the
camera leaves the Moon for Mars. It is faded in (0.5 s) and out (4 s) and
brought to −14 LUFS integrated with true peak ≤ −1 dBTP (`tools/audio.sh`).

Note: the original brief said not to pick music. You later asked me to pick
public-domain music myself, so I did.

## Other software and fonts

three.js 0.186.1 (MIT), playwright-core 1.56.1 (Apache-2.0) driving the
preinstalled Chromium 141, ffmpeg 6.1. Typeface: Alegreya Sans and Alegreya
Sans SC (true small capitals) by Huerta Tipográfica, SIL Open Font License 1.1,
via @fontsource.

## Not to scale

Sizes and distances are **not** to scale. They were chosen so each body fills
about a third of the frame height at its stop, and so on the long legs the body
behind shrinks to a dot and the one ahead grows from a dot.

- Unit = Earth's radius. Moon and Mars radii keep their true ratios to Earth
  (0.273, 0.532).
- The Moon is ~220 Earth radii from Earth (really ~60). Mars is ~2,500 Earth
  radii from the Moon (really ~8,500 at the closest, over 60,000 at the farthest).
- The Sun is a light infinitely far away in one fixed direction.
- Satellite altitudes are drawn 1.6× higher than real so the shells read. The
  geostationary ring is at its true radius.
- The lunar base and the Mars city are drawn about 10× larger than a real
  first base or city would be, so their lights read at this distance.
- The mirrors are drawn about 15–30 km across so they show as squares. Real
  proposals range from small sails to mirrors hundreds of km wide.
- The Moon's relief in its normal map is exaggerated 4×.
- Time is compressed: Earth, Mars and the orbits turn far faster than real so
  there is motion in a few seconds.

## How it works

- `web/film/config.js`: timing, stops, lines and seed.
- `web/film/path.js`: the one camera path. It is a centripetal Catmull–Rom
  curve through key points: a slow arc round each body while holding, and a
  straight pull-back, a bend and a straight approach on each long leg. The
  curve is re-measured in "perceived distance" (distance moved divided by the
  distance to the nearest body), so zooms from a third of the frame to a dot
  run at an even pace. Speed is constant and slow at stops and swells
  smoothly between them, with continuous acceleration. On long legs the
  camera keeps the body behind in frame while it shrinks, then turns at an
  even rate to the one ahead while both are dots. Orientation is averaged over
  a short Gaussian window in time to remove any remaining corners.
- `web/film/scene.js`: Earth (day map, city lights on the dark side only,
  thin blue atmosphere rim), the Moon (Lommel–Seeliger shading plus
  LOLA-derived relief), Mars, and a 9,000-star field from a fixed seed. Stars
  are drawn as tiny streaks over half a frame (a 180° shutter) so turns do not
  strobe. Far bodies get a small dot so they never vanish.
- `web/film/built.js`: what people built. Everything is made of many small
  parts, and each part has a build year at which it appears.
- Every value comes from the frame number and fixed seeds. There are no
  timers and no unseeded random numbers, so any frame renders on its own and
  always comes out the same.

Check the path numerically (turn rate, body sizes, frame edges, year ticks):
`node tools/check_path.mjs out`. The fastest turn is 11°/s and the turn rate
never changes by more than 0.06°/frame². At every stop the body is 29–33% of
the frame height and inside the frame. The only frames where a body touches
the frame edge are the opening close-up of Earth (0–7 s), which is meant to be
close. The camera never comes nearer than 2 radii to any body.

Determinism was checked: the same frames rendered in two separate browser
runs are byte-identical, and a frame rendered alone is byte-identical to the
same frame rendered in sequence.

## Render

```sh
npm ci                       # three, playwright-core, fonts (no browser download)
tools/fetch_sources.sh       # source maps + music (1.1 GB), checksummed
python3 tools/prep_maps.py . # -> web/tex
tools/final.sh               # 1080p frames in 10 s pieces -> joined -> final.mp4
```

Drafts: `node tools/render.mjs --from 0 --to 2520 --w 640 --h 360 --jpg --out out/draft`
and `python3 tools/contact_sheet.py out/draft review/contact_sheet.jpg 2`.
`review/` holds the 640×360 draft with music, the contact sheet (one frame every
2 s) and one full-size still for the opening and each stop.

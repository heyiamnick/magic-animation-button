"""Turn the downloaded NASA / USGS source maps (maps/src) into the textures the
scene loads (web/tex). Only resampling, bit-depth conversion and, for the Moon,
a normal map computed from the LOLA elevation map. No painting.

Usage: python3 -I tools/prep_maps.py <space-film dir>
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None  # the source maps are large but known files

root = Path(sys.argv[1]).resolve()
src = root / "maps" / "src"
out = root / "web" / "tex"
out.mkdir(parents=True, exist_ok=True)


def resize_save(name, dst, size, quality=92):
    im = Image.open(src / name)
    if im.mode != "RGB":
        im = im.convert("RGB")
    im = im.resize(size, Image.LANCZOS)
    im.save(out / dst, quality=quality, optimize=True, progressive=False)
    print(dst, im.size)


# Earth: Blue Marble NG (April 2004, topography + bathymetry) and Black Marble 2016.
resize_save("world.topo.bathy.200404.3x21600x10800.jpg", "earth_day_8k.jpg", (8192, 4096))
resize_save("BlackMarble_2016_3km.jpg", "earth_night_8k.jpg", (8192, 4096))

# Moon: CGI Moon Kit 2025 colour map (16-bit sRGB TIFF -> 8-bit).
moon = Image.open(src / "lroc_color_16bit_srgb_8k.tif")
arr = np.asarray(moon)
if arr.dtype != np.uint8:
    arr = (arr.astype(np.float32) / 257.0).round().clip(0, 255).astype(np.uint8)
Image.fromarray(arr, "RGB").resize((4096, 2048), Image.LANCZOS).save(
    out / "moon_color_4k.jpg", quality=92, optimize=True)
print("moon_color_4k.jpg")

# Moon normal map from LOLA elevation (uint16, half-metres, 16 px/deg).
dem = np.asarray(Image.open(src / "ldem_16_uint.tif")).astype(np.float64) * 0.5  # metres
h, w = dem.shape
R = 1737400.0
exaggeration = 4.0  # relief is shallow at film scale; say so in the notes
lat = (90.0 - (np.arange(h) + 0.5) * 180.0 / h)[:, None]
dlam = np.deg2rad(360.0 / w)
dphi = np.deg2rad(180.0 / h)
coslat = np.maximum(np.cos(np.deg2rad(lat)), 0.02)
dh_east = (np.roll(dem, -1, axis=1) - np.roll(dem, 1, axis=1)) / (2 * R * coslat * dlam)
north = np.vstack([dem[:1], dem[:-1]])   # row above = further north
south = np.vstack([dem[1:], dem[-1:]])
dh_north = (north - south) / (2 * R * dphi)
nx = -dh_east * exaggeration
ny = -dh_north * exaggeration
nz = np.ones_like(nx)
norm = np.sqrt(nx * nx + ny * ny + nz * nz)
rgb = np.stack([nx / norm, ny / norm, nz / norm], axis=-1) * 0.5 + 0.5
img = Image.fromarray((rgb * 255).round().clip(0, 255).astype(np.uint8), "RGB")
img.resize((2048, 1024), Image.LANCZOS).save(out / "moon_normal_2k.png", optimize=True)
print("moon_normal_2k.png")

# Mars: USGS Viking colour mosaic, 925 m/px, simple cylindrical, centred on 0 deg.
resize_save("Mars_Viking_ClrMosaic_global_925m.tif", "mars_color_4k.jpg", (4096, 2048))

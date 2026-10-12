#!/usr/bin/env bash
# Download the public-domain source maps and the music into the project and
# check them against the checksums of the files the film was made from.
# The originals are ~1.1 GB, so they are not committed; this brings them back.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p maps/src music

fetch() { # dir url sha256 [name]
  local dir=$1 url=$2 sum=$3 name=${4:-$(basename "$url")}
  if [ ! -f "$dir/$name" ]; then
    curl -sSL --retry 4 --retry-delay 2 -o "$dir/$name.part" "$url"
    mv "$dir/$name.part" "$dir/$name"
  fi
  echo "$sum  $dir/$name" | sha256sum -c -
}

# Earth by day: NASA Blue Marble Next Generation, topography + bathymetry, April 2004
fetch maps/src https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/april/world.topo.bathy.200404.3x21600x10800.jpg \
  7d3a8c58de56782a68156c67dd171074e210a7feec9283987622e569fa338f6a
# Earth at night: NASA Black Marble 2016 colour map, 3 km
fetch maps/src https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg \
  230aac448ae68c358be433dd518888cccb3a85ccf66f7b44326441c324ad6725
# Moon colour: NASA SVS CGI Moon Kit (2025 colour map, LRO LROC WAC), 8k 16-bit TIFF
fetch maps/src https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_16bit_srgb_8k.tif \
  db7808e878b6a55eb409bb231eab8deb477f84b5c9d7396d76ff73e5d54992d9
# Moon elevation: NASA SVS CGI Moon Kit (LRO LOLA), 16 px/deg, uint16 half-metres
fetch maps/src https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16_uint.tif \
  45a2b32d56e81ed30db07fead8abc842b249b6511219d9ca2c53f81bc2dc5d62
# Mars: USGS Astrogeology, Mars Viking Global Color Mosaic 925 m
fetch maps/src https://planetarymaps.usgs.gov/mosaic/Mars_Viking_ClrMosaic_global_925m.tif \
  5b3c6bea36cec0ec65b9ce5927db6b1c555c5fae60a227c774f9fcaecdf5bb33
# Music: Grieg, Peer Gynt Suite No. 1, I. Morning Mood. Musopen recording (2012),
# Public Domain Mark 1.0, from the Internet Archive item "musopen-lossless-dvd".
fetch music "https://archive.org/download/musopen-lossless-dvd/Musopen-Lossless-DVD.zip/Musopen%20DVD%20%28lossless%29%2FGrieg%20-%20Peer%20Gynt%2FPeer%20Gynt%20Suite%20No.%201%2C%20Op.%2046%20-%20I.%20Morning.m4a" \
  096b610264cb1aabcee30e7f00c1b4025df714f005010d8360c74f9753e28555 grieg_morning_musopen_lossless.m4a

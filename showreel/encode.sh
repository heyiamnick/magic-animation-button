#!/usr/bin/env bash
# Blend 3 subframes per frame (tmix) for motion blur, convert to BT.709 4:2:0, mux the soundtrack.
#   ./encode.sh <subframe dir> <audio.wav> <out.mp4>
set -euo pipefail
SUB="$1"; WAV="$2"; OUT="$3"
ffmpeg -y -v warning -stats \
  -framerate 180 -i "$SUB/%05d.png" -i "$WAV" \
  -filter_complex "[0:v]tmix=frames=3:weights='1 1 1',select='eq(mod(n\,3)\,2)',setpts=N/(60*TB),scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p[v]" \
  -map "[v]" -map 1:a \
  -r 60 -c:v libx264 -preset slow -crf 14 -tune animation -profile:v high -g 120 \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -c:a aac -b:a 320k -ar 48000 \
  -movflags +faststart -shortest "$OUT"

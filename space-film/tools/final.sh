#!/usr/bin/env bash
# Final render: 1080p frames in headless Chromium in pieces of 300 frames
# (10 s), each piece encoded as soon as it is done, so a crash loses at most
# one piece. Then the pieces are joined with ffmpeg (no re-encode) and the
# music bed is laid under them.
set -euo pipefail
cd "$(dirname "$0")/.."
FPS=30; FRAMES=2520; PIECE=300
mkdir -p out/frames out/pieces
for ((start = 0; start < FRAMES; start += PIECE)); do
  end=$((start + PIECE < FRAMES ? start + PIECE : FRAMES))
  piece=$(printf 'out/pieces/piece_%04d.mp4' "$start")
  if [ -f "$piece" ]; then echo "have $piece"; continue; fi
  node tools/render.mjs --from "$start" --to "$end" --w 1920 --h 1080 --out out/frames
  ffmpeg -hide_banner -loglevel error -y -framerate $FPS -start_number "$start" -i out/frames/f%05d.png \
    -frames:v $((end - start)) -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p \
    -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
    -x264-params keyint=$PIECE:min-keyint=$PIECE "$piece.tmp.mp4"
  mv "$piece.tmp.mp4" "$piece"
  echo "encoded $piece"
done
ls out/pieces/piece_*.mp4 | sed "s#^out/pieces/#file '#; s#\$#'#" > out/pieces/list.txt
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i out/pieces/list.txt -c copy out/video_only.mp4
tools/audio.sh music/grieg_morning_musopen_lossless.m4a out/music_bed.wav $((FRAMES / FPS))
ffmpeg -hide_banner -loglevel error -y -i out/video_only.mp4 -i out/music_bed.wav -map 0:v -map 1:a \
  -c:v copy -c:a aac -b:a 256k -ar 48000 -shortest -movflags +faststart final.mp4
ffprobe -hide_banner -v error -show_entries format=duration:stream=codec_name,width,height,r_frame_rate,nb_frames -of compact final.mp4
ffmpeg -hide_banner -nostats -i final.mp4 -map 0:a -af ebur128=peak=true -f null - 2>&1 | grep -A8 Summary | grep -E "I:|Peak:"

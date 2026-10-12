#!/usr/bin/env bash
# Music bed for the film: the first DURATION seconds of the track, faded in and
# out, brought to -14 LUFS integrated with true peaks at or below -1 dBTP.
# A plain gain plus a gentle 4x-oversampled peak limiter is used instead of
# loudnorm's dynamic mode, which would flatten the orchestra's dynamics.
#   tools/audio.sh <in> <out.wav> [duration=84]
set -euo pipefail
IN=$1; OUT=$2; DUR=${3:-84}
FADE_OUT=4
chain() { # gain_db
  echo "afade=t=in:st=0:d=0.5,afade=t=out:st=$(echo "$DUR - $FADE_OUT" | bc):d=$FADE_OUT,volume=${1}dB,aresample=192000,alimiter=limit=0.84:attack=4:release=120:level=false,aresample=48000"
}
measure() { # gain_db -> "I TP"
  ffmpeg -hide_banner -nostats -i "$IN" -map 0:a -t "$DUR" -af "$(chain "$1"),ebur128=peak=true" -f null - 2>&1 |
    awk '/Integrated loudness:/{f=1} f&&/I:/{i=$2} /True peak:/{g=1} g&&/Peak:/{p=$2} END{print i, p}'
}
gain=0
for pass in 1 2 3 4; do
  read -r I TP < <(measure "$gain")
  echo "pass $pass: gain ${gain} dB -> ${I} LUFS, true peak ${TP} dBTP"
  delta=$(echo "-14 - ($I)" | bc -l)
  if (( $(echo "${delta#-} < 0.1" | bc -l) )); then break; fi
  gain=$(echo "$gain + $delta" | bc -l | xargs printf '%.2f')
done
ffmpeg -hide_banner -loglevel error -y -i "$IN" -map 0:a -t "$DUR" -af "$(chain "$gain")" -ar 48000 -c:a pcm_s24le "$OUT"
read -r I TP < <(ffmpeg -hide_banner -nostats -i "$OUT" -af ebur128=peak=true -f null - 2>&1 |
  awk '/Integrated loudness:/{f=1} f&&/I:/{i=$2} /True peak:/{g=1} g&&/Peak:/{p=$2} END{print i, p}')
echo "wrote $OUT: ${I} LUFS integrated, true peak ${TP} dBTP"

#!/usr/bin/env bash
# Test clip for the video scene: 20 s, 1280x720 (so the morph target has to be scaled to the 1920x1080 stage),
# a cream intro/outro with a fake logo square at x=560 y=280 w=160 h=160 (video pixels),
# coloured chapters in between, a running timestamp, and a quiet sine tone (to hear fades).
# Chapters: 0 Intro, 2 Red, 6 Green, 10 Blue, 14 Purple, 17 Outro (logo again until 20 s).
# Usage: tools/make-test-video.sh out.mp4 [poster.jpg]
set -euo pipefail
OUT=${1:-demo.mp4}
POSTER=${2:-}
FONT=$(fc-match -f '%{file}' 'DejaVu Sans Mono:bold' 2>/dev/null || true)
[ -f "$FONT" ] || FONT=$(fc-list : file | head -1 | cut -d: -f1)
VF="drawbox=x=0:y=0:w=iw:h=ih:color=0xC0392B:t=fill:enable='between(t,2,6)',\
drawbox=x=0:y=0:w=iw:h=ih:color=0x27AE60:t=fill:enable='between(t,6,10)',\
drawbox=x=0:y=0:w=iw:h=ih:color=0x2E6FD8:t=fill:enable='between(t,10,14)',\
drawbox=x=0:y=0:w=iw:h=ih:color=0x8E44AD:t=fill:enable='between(t,14,17)',\
drawbox=x=560:y=280:w=160:h=160:color=0xE0703A:t=fill:enable='lt(t,2)+gte(t,17)',\
drawbox=x=600:y=320:w=80:h=80:color=0xFFFFFF:t=fill:enable='lt(t,2)+gte(t,17)',\
drawtext=fontfile=$FONT:text='%{pts\:hms}':x=(w-tw)/2:y=h-120:fontsize=48:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=12,\
drawtext=fontfile=$FONT:text='frame %{n}':x=40:y=40:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=8"
ffmpeg -y -hide_banner -loglevel error \
  -f lavfi -i "color=c=0xEDE6D8:s=1280x720:r=30:d=20" \
  -f lavfi -i "sine=frequency=440:sample_rate=44100:duration=20" \
  -vf "$VF" -af "volume=0.15" -c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 28 \
  -c:a aac -b:a 64k -movflags +faststart "$OUT"
if [ -n "$POSTER" ]; then
  # poster = a frame from the middle of the video (shown in export, in the fallback card and before load)
  ffmpeg -y -hide_banner -loglevel error -ss 7 -i "$OUT" -frames:v 1 -vf scale=960:-2 -q:v 5 "$POSTER"
fi
echo "wrote $OUT ${POSTER:+and $POSTER}"

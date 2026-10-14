#!/bin/bash
# fix091.sh IN OUT SCALE  -- repair the smear under the page stack of frame-091.
# Coordinates are in 1920x1080 source pixels; SCALE maps them to the tier.
set -e
IN="$1"; OUT="$2"; K="$3"
r(){ python3 -c "print(round($1*$K))"; }
SX=$(r 1828); SW=$(r 58); SY=$(r 1016); SH=$(r 29)       # page stack: row 1016 stretched to the paper foot (1045)
GX=$(r 1750); GW=$(r 68); GY=$(r 1043); GH=$(( $(r 1080) - $(r 1043) ))   # ground source, left of the stack
DX=$(r 1818)                                             # ground destination
magick "$IN" \
  \( +clone -crop ${SW}x2+${SX}+${SY} +repage -resize ${SW}x${SH}\! \) -geometry +${SX}+${SY} -composite \
  \( +clone -crop ${GW}x${GH}+${GX}+${GY} +repage \) -geometry +${DX}+${GY} -composite \
  -region $(r 20)x$(r 44)+$(r 1808)+$(r 1038) -blur 0x$(python3 -c "print(1.4*$K)") \
  -region $(r 16)x$(r 44)+$(r 1878)+$(r 1038) -blur 0x$(python3 -c "print(1.4*$K)") \
  +region -quality 90 "$OUT"

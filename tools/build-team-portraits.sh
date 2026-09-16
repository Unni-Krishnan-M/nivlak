#!/usr/bin/env bash
set -euo pipefail

# The four portraits on chapter 06, printed in the book's ink.
#
# SOURCES ARE NOT IN THE REPOSITORY, like every other plate script's: the
# photographs are expected at the repo root under the names below. The output
# is what ships, under apps/web/public/team/.
#
# WHAT HAPPENS TO EACH
#
#   1. KEY.   The studio white is floodfilled from the four corners of the FULL
#             frame and turned into a mask. From the full frame and not the
#             crop: a head-and-shoulders crop puts the suit in its bottom
#             corners, and a floodfill from there keys the jacket. The shirts
#             are white too and survive because the jacket encloses them.
#   2. CROP.  Head and shoulders at 4:5, each box chosen so the four heads are
#             one size and sit at the same height -- the crown about 6% down.
#             The sources are four different framings (a 4:3 half-length, a
#             square, two 2:3s), so a single gravity crop would print four
#             different-sized faces in a row a reader compares.
#   3. GROUND. The keyed area becomes a flat grey that the ramp below maps to
#             a navy a shade above the page's -- a plate, not a hole and not a
#             white card. A white card is what these would be untouched, and a
#             white slab on navy stock is what this book has refused every
#             time it was offered.
#   4. PENCIL. A light colour-dodge line layer multiplied over the tone, the
#             same line build-pencil-plates.sh draws, so the portraits are of a
#             piece with 02-04's plates. Light (LINE_FLOOR 55): a face drawn as
#             hard as a desk is a caricature.
#   5. INK.   The same three-stop ramp as the plates, in the page's own hue.
#
# The crops are in SOURCE pixels, WxH+X+Y.

command -v magick >/dev/null || { echo "needs ImageMagick (magick)"; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/apps/web/public/team"
mkdir -p "$OUT"

# slug | source | crop
PORTRAITS=(
  "laxman|Laxman.jpeg|800x1000+335+0"
  "unni-krishnan-m|Unni Krishnan M.png|933x1166+174+60"
  "ashok|Ashok.jpeg|667x833+217+90"
  "gokul|Gokul.jpeg|848x1060+141+36"
)

SIZE=360x450      # ~2.5x the ~150px the portraits print at
FUZZ=7%
GROUND=34%        # grey that the ramp maps to a navy just above the page
BLUR=1.2
LINE_FLOOR=55
INK='#16283f'
MID='#34557f'
PAPER='#b4cbe6'
QUALITY=86

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

magick xc:"$INK" xc:"$MID" xc:"$PAPER" +append -filter Cubic -resize 256x1! "$WORK/ramp.png"

for entry in "${PORTRAITS[@]}"; do
  IFS='|' read -r slug src crop <<<"$entry"
  path="$ROOT/$src"
  [ -f "$path" ] || { echo "missing $src at the repo root" >&2; exit 1; }
  read -r w h < <(magick identify -format '%w %h\n' "$path")
  mx=$((w - 1)); my=$((h - 1))

  # 1. key, on the full frame
  magick "$path" -alpha set -fuzz "$FUZZ" -fill none \
    -draw "color 0,0 floodfill" -draw "color $mx,0 floodfill" \
    -draw "color 0,$my floodfill" -draw "color $mx,$my floodfill" \
    -alpha extract -blur 0x1.2 "$WORK/key.png"

  # 2 + 3. crop both, lay the subject over the ground, resize
  magick "$path" -crop "$crop" +repage -colorspace gray -auto-level "$WORK/g.png"
  magick "$WORK/key.png" -crop "$crop" +repage "$WORK/k.png"
  magick "$WORK/g.png" \( +clone -fill "gray($GROUND)" -colorize 100 \) +swap \
    "$WORK/k.png" -compose over -composite -resize "$SIZE" "$WORK/t.png"

  # 4 + 5. pencil line, then the ramp
  magick "$WORK/t.png" \
    \( +clone \( +clone -negate -blur "0x$BLUR" \) -compose colordodge -composite \
       -evaluate pow 1.8 +level "${LINE_FLOOR}%,100%" \) \
    -compose multiply -composite -unsharp 0x0.6+0.8+0.02 \
    "$WORK/ramp.png" -clut -strip -quality "$QUALITY" "$OUT/$slug.webp"

  printf '  %-18s %-22s %s -> %s\n' "$slug" "$src" "$crop" \
    "$(magick identify -format '%wx%h' "$OUT/$slug.webp")"
done

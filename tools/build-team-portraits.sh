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
#             corners, and a floodfill from there keys the jacket.
#
#             THE JACKET DOES NOT ENCLOSE THE SHIRT, which this header used
#             to claim. Where the collar meets the neck there is a seam a
#             few pixels wide of near-white running from the shirt out to the
#             studio white, and the fill walks through it. Laxman's whole
#             shirt front either side of the tie (28,667 source px) and
#             Gokul's (35,927) were keyed to the ground: the shirt printed as
#             background navy with a pale outline, the tie floating on it.
#             Ashok lost a 668px sliver of collar the same way. FUZZ is not
#             the lever: Laxman holds at 6% and goes at 7, and Gokul already
#             leaks at 4%, where the hair edges start to fringe.
#
#             So the key is GUARDED: open the keyed area by a disc of
#             KEY_BRIDGE px (which cuts any passage narrower than twice that),
#             keep only what is still reachable from the corners, grow it back
#             by the same disc, and any region the fill reached ONLY through
#             such a passage is handed back to the subject -- if it is at
#             least KEY_MIN_AREA px. The area floor is what keeps the guard
#             off everything else: opening also shaves 1-50px specks off the
#             hair and shoulder outlines, which are real background. With it,
#             Unni's key is unchanged to the pixel and Ashok's differs by
#             exactly his collar sliver.
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
KEY_BRIDGE=5      # px; seams under 10px wide stop the fill (see 1. KEY)
KEY_MIN_AREA=500  # px; the leaks are 668-35,927, the shaved specks 1-50
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

  # 1. key, on the full frame (subject white, keyed area black)
  corners=(-draw "color 0,0 floodfill" -draw "color $mx,0 floodfill"
           -draw "color 0,$my floodfill" -draw "color $mx,$my floodfill")
  magick "$path" -alpha set -fuzz "$FUZZ" -fill none "${corners[@]}" \
    -alpha extract "$WORK/raw.png"

  #    guard: what the corners still reach once every narrow seam is cut
  #    (#808080 marks it -- gray(50%) is 127.5 and never matches the 128 the
  #    fill writes; -alpha off because -draw quietly adds a channel)
  magick "$WORK/raw.png" -negate "$WORK/bg.png"
  magick "$WORK/bg.png" -morphology Open "Disk:$KEY_BRIDGE" \
    -fill '#808080' "${corners[@]}" -alpha off \
    -fill black -opaque white -fill white -opaque '#808080' \
    -morphology Dilate "Disk:$KEY_BRIDGE" \
    \( "$WORK/bg.png" \) -compose darken -composite -alpha off "$WORK/reach.png"

  #    what the fill took beyond that, less the specks, goes back to the subject
  magick "$WORK/bg.png" "$WORK/reach.png" -compose difference -composite \
    -alpha off -define connected-components:area-threshold="$KEY_MIN_AREA" \
    -define connected-components:mean-color=true -connected-components 8 \
    "$WORK/leak.png"
  magick "$WORK/raw.png" "$WORK/leak.png" -compose lighten -composite \
    -alpha off -blur 0x1.2 "$WORK/key.png"

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

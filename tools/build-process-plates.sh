#!/usr/bin/env bash
# Turn the six process renders into the photographic plates of chapter 03,
# "From Vision to Reality".
#
# Like the book footage and the service renders, the sources are NOT in the
# repo -- they are expected at the repo root as DISCOVER.png, STRATEGIZE.png,
# DESIGN.png, ENGINEER.png, LAUNCH.png, EVOLVE.png. The OUTPUT is committed, so
# a clone builds without them.
#
#
# WHY THESE NEED WORK, AND WHY IT IS NOT THE WORK build-service-plates.sh DOES
#
# The 02 renders arrive as artwork on a painted checkerboard and have to be cut
# OUT of their ground. These arrive as finished photographs -- a desk, a
# notebook, a drafting table, a monitor -- with no ground to remove. Nothing
# here is keyed. What is wrong with them is TONE, and it is wrong in two ways
# at once.
#
#
# WRONG THE FIRST WAY: THREE OF THEM ARE DARKER THAN THE PAPER
#
# The page is a photograph of navy stock. Measured off frame-091:
#
#   $ magick frames/v5/hd/frame-091.webp -format "%[pixel:p{1200,400}]" info:
#   srgb(32,55,84)              # the lit recto      -> luma 0.205
#   srgb(19,44,72)              # the shaded verso   -> luma 0.160
#
# Against that, the medians of the six sources:
#
#   DISCOVER     0.399      STRATEGIZE   0.597      DESIGN     0.598
#   ENGINEER     0.073      LAUNCH       0.047      EVOLVE     0.066
#
# The bottom row is three to four times DARKER than the paper it would be
# printed on. That is the exact failure CLAUDE.md records from the first run of
# build-service-plates.sh: a plate darker than its page does not read as a
# picture, it reads as a hole punched in the paper. A plate is lifted TO the
# paper, never darkened toward it.
#
#
# WRONG THE SECOND WAY: THEY ARE NOT ONE SERIES
#
# The same numbers say it. Three are daylight photographs of paper; three are
# night photographs of screens. 0.047 to 0.598 is a spread of nearly 13x, and
# six plates that far apart do not read as a chapter -- they read as two sets
# of stock photographs that happened to land in the same book.
#
#
# WHY +level-colors, AND NOT A GAMMA LIFT ALONE
#
# A gamma big enough to carry LAUNCH's median from 0.047 up past the paper is
# about 2.5, which flattens the night out of a night photograph and pulls the
# sensor noise up with it.
#
# +level-colors does the whole job in one pass instead. It remaps input black
# to SHADOW and input white to HIGHLIGHT, so the entire tonal range is
# compressed into the band between them -- which means the darkest pixel of the
# darkest plate is SHADOW by construction, whatever the source looked like.
# Setting SHADOW just above the paper is therefore not a correction applied to
# three of the six; it is a floor that all six share, and it is the same
# operation that gives them a common ink.
#
#   SHADOW    #233c58   luma 0.235   <- the recto paper is 0.205
#   HIGHLIGHT #dfe9f8   luma 0.895   <- the silver of the lit page edge
#
# It is applied to the COLOUR image rather than to a grey separation, which is
# the difference between a duotone and a split tone: each channel is remapped
# on its own, so hue relationships survive the compression. LAUNCH's green
# "SUCCESS" ticks are still green afterwards and the desk lamp is still warm --
# both pulled onto the book's navy/silver axis, neither erased. A grey
# separation would have thrown away the one piece of information the deployment
# plate is actually carrying.
#
#
# WHY A PER-IMAGE GAMMA AS WELL, AND WHY IT DOES NOT EQUALISE THEM
#
# The floor fixes "darker than the paper" but not "not one series": run alone
# it leaves post-tone medians from 0.25 to 0.62, because compression is linear
# and preserves the ratio it was given.
#
# The gammas below close that gap PART of the way and deliberately stop there.
# Equalising the medians outright wants gamma 0.49 on STRATEGIZE, which turns a
# sunlit drafting table into an overcast one, and gamma 2.5 on LAUNCH, which is
# the flattening this file just rejected. Day and night are what these six
# photographs are ABOUT -- paper by daylight becoming screens at night is the
# arc of the chapter. So the target is a band, not a value:
#
#                     source     gamma    post-tone median
#   DISCOVER          0.399       1.00        0.494
#   STRATEGIZE        0.597       0.74        0.585
#   DESIGN            0.598       0.74        0.586
#   ENGINEER          0.073       1.45        0.271
#   LAUNCH            0.047       1.55        0.251
#   EVOLVE            0.066       1.50        0.272
#
# 13x apart becomes 2.3x apart, and every one of them clears the paper's 0.205.
#
#
# WHY SATURATION 62 AND SIGMOIDAL 5
#
# 62 because the sources are strongly amber and strongly green respectively,
# and at 100 the split tone fights them: the lamp goes orange against a navy
# page and the plate stops looking printed. Judged on the composite over a crop
# of the real recto, not on the file:
#
#    100   lamp reads orange, deployment ticks read as UI chrome
#     62   both read as ink of the page, still distinguishable   <- this
#     30   the ticks stop being green and the plate loses its subject
#
# The sigmoidal is what the compression costs. Squeezing 0..1 into 0.235..0.895
# takes the snap out of every plate; a 5-point S-curve about the midpoint puts
# it back without moving either end, so the floor the whole file exists for is
# untouched.
#
#
# WHY 1240px WIDE
#
# The plate is set to the full measure of its page. On a 2560-wide viewport the
# recto's text column measures about 620 CSS px, so 1240 is 2x there and more
# than 2x on anything narrower. Larger buys nothing a reader can see and every
# one of these is a full-frame photograph rather than a cut-out, so there is no
# transparency to preserve and webp q82 is the whole of the compression story.
#
# NOT idempotent in the useful sense: it reads the repo-root sources every time
# and overwrites the six outputs, so re-running after a source is replaced is
# the intended way to update one. It never reads its own output.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/apps/web/public/process"

# The two ends of the book's ink. See the header for what sets them.
SHADOW='#233c58'
HIGHLIGHT='#dfe9f8'
SATURATION=62
SIGMOIDAL=5
WIDTH=1240
QUALITY=82

# source:slug:gamma -- the gammas are measured, see the table in the header.
PLATES=(
  "DISCOVER:discover:1.00"
  "STRATEGIZE:strategize:0.74"
  "DESIGN:design:0.74"
  "ENGINEER:engineer:1.45"
  "LAUNCH:launch:1.55"
  "EVOLVE:evolve:1.50"
)

command -v magick >/dev/null || { echo "ImageMagick 7 (magick) is required" >&2; exit 1; }

mkdir -p "$OUT"

missing=0
for spec in "${PLATES[@]}"; do
  src="$ROOT/${spec%%:*}.png"
  [ -f "$src" ] || { echo "missing source: $src" >&2; missing=1; }
done
[ "$missing" -eq 0 ] || { echo "put the six renders at the repo root and re-run" >&2; exit 1; }

# The paper this is all measured against, so the audit below is against the
# real page rather than against a remembered number.
paper=$(magick "$ROOT/apps/web/public/frames/v5/hd/frame-091.webp" \
  -crop 1x1+1200+400 +repage -colorspace Gray -format "%[fx:mean]" info:)

printf '%-12s %6s  %8s  %8s  %s\n' SOURCE GAMMA MEDIAN MEAN FILE
for spec in "${PLATES[@]}"; do
  IFS=: read -r name slug gamma <<<"$spec"
  src="$ROOT/$name.png"
  dst="$OUT/$slug.webp"

  magick "$src" \
    -resize "${WIDTH}x>" \
    -gamma "$gamma" \
    -modulate "100,$SATURATION,100" \
    +level-colors "$SHADOW","$HIGHLIGHT" \
    -sigmoidal-contrast "$SIGMOIDAL,50%" \
    -strip -quality "$QUALITY" \
    "$dst"

  read -r median mean w h < <(magick "$dst" -colorspace Gray \
    -format "%[fx:median] %[fx:mean] %w %h\n" info:)
  printf '%-12s %6s  %8.3f  %8.3f  %s (%sx%s, %s)\n' \
    "$name" "$gamma" "$median" "$mean" "$slug.webp" "$w" "$h" \
    "$(du -h "$dst" | cut -f1)"

  # The one thing this script must never ship. A plate whose median has landed
  # below the paper is a hole in the page, and the fix is its gamma, not a
  # tweak to SHADOW -- moving the floor moves all six.
  awk -v m="$median" -v p="$paper" 'BEGIN { if (m <= p) exit 1 }' || {
    echo "  ^ FAILS: median $median is at or below the paper ($paper)" >&2
    exit 1
  }
done

echo
echo "paper (frame-091 recto, grey) = $paper -- every plate above prints lighter than that."
echo "Proof one against a crop of the real spread before trusting the numbers:"
echo "  magick apps/web/public/frames/v5/hd/frame-091.webp -crop 700x700+1050+200 +repage paper.png"

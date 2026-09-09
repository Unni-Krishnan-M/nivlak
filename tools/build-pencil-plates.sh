#!/usr/bin/env bash
set -euo pipefail

# Redraw every photographic plate in the book as a pencil sketch.
#
# WHY THIS IS A POST-PASS AND NOT A FLAG ON THE OTHER FOUR SCRIPTS
#
# build-service-plates.sh, build-process-plates.sh and build-work-plates.sh all
# read sources that are NOT in this repository -- renders and photographs kept
# at the repo root, and in the work plates' case a set of marketing
# compositions that are cropped and redacted on the way through. None of them
# can be re-run here. So this reads the plates that SHIPPED, out of
# apps/web/public, and rewrites them in place.
#
# Two consequences follow and both matter.
#
# It is NOT IDEMPOTENT. Sketching a sketch gives a drawing of a drawing: the
# second pass finds edges in the first pass's lines and doubles every stroke.
# Run `git checkout apps/web/public/{services,process,work}` before running it
# again. stamp-book-logo.py carries the same warning for the same reason.
#
# And the REDACTIONS SURVIVE, which is the half worth checking rather than
# assuming. 04's plates carry blurred boxes over invented client names and
# revenue -- see build-work-plates.sh's header for the rule. Those boxes are
# already baked into the file this reads, and a blurred region has no edges in
# it, so the dodge below renders it as flat white and the negate turns it flat
# dark. A sketch cannot recover what a blur destroyed. Proof by looking is
# still cheaper than trusting that sentence: check work/mobile-application.webp
# at 100% after a run.
#
# WHY THE LINES ARE LIGHT AND THE GROUND IS DARK
#
# A pencil sketch is graphite on white paper, and white paper is exactly what
# this book cannot have. The page is a photograph of navy stock at about
# rgb(20,41,68); a plate lighter than its surround is a hole punched in the
# page, which is the failure build-service-plates.sh first shipped and this
# file's siblings all guard against. So the sketch is struck: the drawing is
# made on white, then negated, so the ground goes dark and the strokes come up
# silver.
#
# That is also what the book already does with the two things in it that are
# genuinely drawings. 01's flow chart and 07's telegraphy patent are painted
# through a luminance mask in #dce7f7 -- light line art on the navy. These
# plates now match them, which is the point: the chapter illustrations and the
# engraved figures stop being two different kinds of picture.
#
# THE TONE IS build-process-plates.sh's, EXACTLY
#
# Same SHADOW and HIGHLIGHT, because two sets of plates in one book toned by
# different arithmetic read as two books -- the argument build-work-plates.sh
# makes at length about copying 03's numbers rather than inventing its own.
# +level-colors maps input black to SHADOW and input white to HIGHLIGHT, so the
# darkest pixel a plate can contain is SHADOW by construction:
#
#   SHADOW    #233c58   luma 0.235   <- the recto paper is 0.205
#   HIGHLIGHT #dfe9f8   luma 0.895
#
# The plate ground therefore sits 0.03 above the paper. That is deliberate and
# it is what makes these read as drawings ON the page rather than as pictures
# in a frame: the rectangle all but disappears and the strokes float.
#
# WHY THE BLUR SCALES WITH WIDTH
#
# The dodge sketch's line weight is set by the blur radius, in PIXELS. The
# service plates are 900px wide and the process and work plates 1240, so one
# fixed radius draws the services a third heavier than everything else -- two
# line weights in one book, which is the same mistake as two tones. RADIUS_DIV
# makes the radius a constant FRACTION of the width instead.
#
# WHAT IS NOT CONVERTED, AND WHY EACH IS DELIBERATE
#
#   plates/plate-telegraphy.webp   already line art -- an 1876 patent drawing.
#                                  Sketching a drawing finds edges in its own
#                                  strokes and doubles them.
#   perspectives/column.webp       a luminance MASK, not a picture: <StruckPlate>
#                                  reads its brightness to decide where to paint.
#                                  Running it through this would not restyle the
#                                  artwork, it would corrupt the mask.
#   logo.webp, logo-mark.webp      a brand mark is not a sketch of a brand mark.
#   frames/                        the book itself. The pages ARE frame-091 --
#                                  every sheet's paper is a crop of it -- so
#                                  sketching the frames restyles the paper the
#                                  type is set on. It also needs a NEW frame set
#                                  directory, because frames are served
#                                  immutable for a year. Out of scope here on
#                                  purpose; see CLAUDE.md.

command -v magick >/dev/null || { echo "needs ImageMagick (magick)"; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUB="$ROOT/apps/web/public"

SHADOW='#233c58'
HIGHLIGHT='#dfe9f8'
# Sketch shape, and both numbers are about staying a LINE DRAWING rather than
# a smoky one. RADIUS_DIV is width/blur, so 1030 puts the radius at 1.2px on a
# 1240px plate. The first run used 250 -- a 5px radius -- and the result was a
# wash: the dodge spreads every edge over the blur radius, so a wide radius
# draws haze around objects instead of a line along them. At 1.2 the strokes
# are one to two pixels and the notebook rules, the wireframe boxes and the
# dashboard's hairlines all survive as lines.
#
# POW deepens the strokes and darkens the ground between them. It has to come
# DOWN with the radius: at 2.0 against a 1.2px radius the fine work goes black
# and only the heavy outlines are left.
RADIUS_DIV=1030
POW=1.3
QUALITY=82

# The paper these have to stay above, sampled off the real page rather than
# remembered -- the same pixel of the same frame build-process-plates.sh reads,
# so the two scripts' audits are comparable numbers and not two conventions.
PAPER=$(magick "$PUB/frames/v5/hd/frame-091.webp" \
  -crop 1x1+1200+400 +repage -colorspace Gray -format "%[fx:mean]" info:)
echo "paper luma $PAPER"

converted=0
for dir in services process work; do
  for src in "$PUB/$dir"/*.webp; do
    [ -e "$src" ] || continue
    width=$(magick identify -format '%w' "$src")
    # Floor at 0.6: below that the blur stops separating from the source and
    # the dodge returns flat white. It is not reached at any width we ship --
    # the narrowest plate is 900px, which asks for 0.87.
    blur=$(awk -v w="$width" -v d="$RADIUS_DIV" 'BEGIN{ r = w/d; printf "%.2f", (r < 0.6 ? 0.6 : r) }')
    tmp="$(mktemp -u).webp"

    # 02's five plates are KEYED -- build-service-plates.sh floodfills their
    # backgrounds to transparent so the render sits on the page rather than in
    # a box. Sketching them naively flattens that key: the first run of this
    # script turned five srgba files into srgb and their medians went from a
    # quarter to 0.86, five white slabs pasted on the navy. So the key is
    # lifted off, the drawing is made on the colour channels alone, and the key
    # is put back.
    keyed=$(magick identify -format '%[channels]' "$src" | grep -c 'a' || true)

    if [ "$keyed" != "0" ]; then
      magick "$src" \
        \( +clone -alpha extract +write mpr:key +delete \) \
        -alpha off \
        -colorspace gray -auto-level \
        \( +clone -negate -blur "0x$blur" \) -compose colordodge -composite \
        -evaluate pow "$POW" -negate \
        +level-colors "$SHADOW","$HIGHLIGHT" \
        mpr:key -alpha off -compose copy_opacity -composite \
        -strip -quality "$QUALITY" "$tmp"
    else
      magick "$src" \
        -colorspace gray -auto-level \
        \( +clone -negate -blur "0x$blur" \) -compose colordodge -composite \
        -evaluate pow "$POW" -negate \
        +level-colors "$SHADOW","$HIGHLIGHT" \
        -strip -quality "$QUALITY" "$tmp"
    fi

    # An opaque plate must come out opaque. Adding an alpha channel to the ten
    # that never had one costs bytes for nothing, and hides a keying mistake.
    after=$(magick identify -format '%[channels]' "$tmp" | grep -c 'a' || true)
    if [ "$keyed" != "$after" ]; then
      echo "REFUSING $dir/$(basename "$src"): alpha changed ($keyed -> $after)" >&2
      rm -f "$tmp"; exit 1
    fi

    # The one thing this script must never ship: a plate that reads as a hole
    # punched in the page. The test is the MEDIAN and not the minimum, which is
    # the distinction that matters for a drawing -- a sketch is supposed to
    # contain strokes darker than the paper, and does; what it may not be is
    # darker than the paper OVERALL. build-process-plates.sh tests the same
    # statistic against the same pixel.
    # Measured on the SUBJECT, not the file. -trim crops to the keyed render's
    # own bounding box, so a plate that is nine tenths transparent is judged on
    # the tenth that prints. On the ten full-bleed plates there is no uniform
    # border to trim and this is a no-op.
    read -r median mean < <(magick "$tmp" -background none -alpha set \
      -trim +repage -alpha off -colorspace Gray \
      -format "%[fx:median] %[fx:mean]\n" info:)
    awk -v m="$median" -v p="$PAPER" 'BEGIN { if (m <= p) exit 1 }' || {
      echo "REFUSING $dir/$(basename "$src"): median $median is at or below the paper ($PAPER)" >&2
      rm -f "$tmp"
      exit 1
    }

    mv "$tmp" "$src"
    printf '  %-30s %5spx  blur %-5s median %-8s mean %s\n' \
      "$dir/$(basename "$src")" "$width" "$blur" "$median" "$mean"
    converted=$((converted + 1))
  done
done

echo "drew $converted plates"

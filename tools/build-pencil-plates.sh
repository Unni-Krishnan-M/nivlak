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
# GRAPHITE ON PAPER, AND THE STRUCK VERSION THAT CAME FIRST
#
# This shipped once as a STRUCK drawing: made on white, negated, so the ground
# went dark and the strokes came up silver. The argument was that 01's flow
# chart and 07's telegraphy patent are painted through luminance masks in
# #dce7f7, and that matching them would stop the chapter illustrations and the
# engraved figures being two different kinds of picture.
#
# It was unreadable. The ground landed at luma 0.235 against a page of 0.204,
# so there was no visible plate at all -- 0.03 of separation is nothing -- and
# what sat on it was one-pixel silver strokes. 03's six print at 132px. The
# drawings were there and you had to hunt for them, which is not a plate.
#
# So it is a pencil sketch the ordinary way round: a light panel with the
# book's own navy drawn on it. INK is a shade off the page, so a stroke reads
# as the paper showing through rather than as a black line, and PAPER is
# deliberately short of white -- a plate at 0.83 is a lit slab stuck on the
# page, the sticker failure recorded against 07's action panel.
#
#   INK    #22384f   luma 0.21   <- the page itself is 0.204
#   PAPER  #aec1d6   luma 0.72   <- the old photographs ran 0.29-0.55
#
# THE ONE RULE THAT ACTUALLY BINDS
#
# A plate may not be DARKER than the paper -- that is the hole-in-the-page
# failure build-service-plates.sh shipped once and every script here guards
# against. A LIGHT plate was never the problem; the photographs these replace
# were light. So the audit below still tests the median against the page, and a
# graphite drawing clears it by a mile where the struck one cleared it by 0.03.
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

INK='#22384f'
PAPER='#aec1d6'
# Sketch shape, and both numbers are about staying a LINE DRAWING rather than
# a smoky one. RADIUS_DIV is width/blur, so 1030 puts the radius at 1.2px on a
# 1240px plate. The first run used 250 -- a 5px radius -- and the result was a
# wash: the dodge spreads every edge over the blur radius, so a wide radius
# draws haze around objects instead of a line along them. At 1.2 the strokes
# are one to two pixels and the notebook rules, the wireframe boxes and the
# dashboard's hairlines all survive as lines.
#
# POW deepens the strokes against the paper between them. At 1.3 they came out
# mid-grey and the plates read as faint; 1.8 carries them most of the way to
# INK. Past about 2.4 the photographs' own grain comes up as speckle with
# them.
#
# DILATE is the other half, and it is thickness rather than brightness: a 1.2px
# radius draws a one-pixel line, which at the 132px these print at in 03 is
# most of a stroke lost to resampling. Disk:1 grows every stroke by a pixel.
#
# The thickening operator is ERODE and not Dilate, and that follows from which
# way up the drawing is. Erode grows the DARK region; the strokes are dark now,
# so Erode is what fattens them. The struck version wanted Dilate for the same
# reason inverted, and swapping the two without swapping the operator eats the
# drawing instead of thickening it. One pixel at both widths rather than a
# fraction of each, because morphology takes whole-pixel kernels and 900
# against 1240 does not separate enough to matter.
RADIUS_DIV=1030
POW=1.8
DILATE=1
QUALITY=82

# The paper these have to stay above, sampled off the real page rather than
# remembered -- the same pixel of the same frame build-process-plates.sh reads,
# so the two scripts' audits are comparable numbers and not two conventions.
PAGE_LUMA=$(magick "$PUB/frames/v5/hd/frame-091.webp" \
  -crop 1x1+1200+400 +repage -colorspace Gray -format "%[fx:mean]" info:)
echo "page luma $PAGE_LUMA"

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
        -evaluate pow "$POW" \
        -morphology Erode "Disk:$DILATE" \
        +level-colors "$INK","$PAPER" \
        mpr:key -alpha off -compose copy_opacity -composite \
        -strip -quality "$QUALITY" "$tmp"
    else
      magick "$src" \
        -colorspace gray -auto-level \
        \( +clone -negate -blur "0x$blur" \) -compose colordodge -composite \
        -evaluate pow "$POW" \
        -morphology Erode "Disk:$DILATE" \
        +level-colors "$INK","$PAPER" \
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
    awk -v m="$median" -v p="$PAGE_LUMA" 'BEGIN { if (m <= p) exit 1 }' || {
      echo "REFUSING $dir/$(basename "$src"): median $median is at or below the page ($PAGE_LUMA)" >&2
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

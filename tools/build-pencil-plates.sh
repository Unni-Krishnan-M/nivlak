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
# TONE AND LINE, AND THE THREE PURE-OUTLINE VERSIONS THAT WERE NOT LEGIBLE
#
# A pencil sketch has SHADING in it, not just outline, and that turned out to
# be the whole problem. Three settings of a pure edge drawing were tried and
# none of them read at the size these actually print:
#
#   struck, ground 0.235   no visible panel at all against a 0.204 page
#   struck, ground 0.37    a panel, but line-only on a cluttered subject
#   graphite on 0.72 paper legible, and a pale slab stuck on navy stock
#
# The second is the interesting failure. Brightening the strokes to 0.96 and
# thickening them by a pixel did make each LINE clearer and the plate no
# clearer, because these sources are photographs of cluttered desks and
# screens: every crumb of texture becomes a stroke, and a drawing of clutter at
# 132px is clutter. 03's six print at 132px.
#
# So the tone comes back and carries the forms, and the line sits on top of it:
#
#   -kuwahara      edge-preserving smoothing FIRST, so texture stops becoming
#                  line while real edges survive it.
#   -compose screen the dodge sketch is screened back over that tone rather
#                  than replacing it. The notebook reads as a light mass
#                  against a dark desk -- which is what makes it legible small
#                  -- and the strokes draw its edges.
#   -posterize     tried and rejected: flattening the tone to 4-5 levels blows
#                  the light masses to slabs and loses the detail the screen
#                  had just bought.
#
#   GROUND #2c4a68  luma 0.33   <- the page itself is 0.204
#   HIGH   #c8d8ea  luma 0.80   <- the book's silver INK is 0.895
#
# HIGH stays UNDER the type. It was 0.96 for one revision, which made the
# plates brighter than the headline beside them; a plate that outshouts its own
# chapter heading competes with the page instead of illustrating it.
#
# THE ONE RULE THAT ACTUALLY BINDS
#
# A plate may not be DARKER than the page -- the hole-in-the-page failure
# build-service-plates.sh shipped once and every script here guards against.
# The audit below tests the median against a live sample of the page.
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

GROUND='#2c4a68'
HIGH='#c8d8ea'
# Edge-preserving smoothing radius, applied BEFORE anything else.
SMOOTH=4
# Sketch shape, and both numbers are about staying a LINE DRAWING rather than
# a smoky one. RADIUS_DIV is width/blur, so 1030 puts the radius at 1.2px on a
# 1240px plate. The first run used 250 -- a 5px radius -- and the result was a
# wash: the dodge spreads every edge over the blur radius, so a wide radius
# draws haze around objects instead of a line along them. At 1.2 the strokes
# are one to two pixels and the notebook rules, the wireframe boxes and the
# dashboard's hairlines all survive as lines.
#
# POW deepens the strokes before the negate, where the drawing is still dark
# on white, so raising it carries each stroke further toward STROKE once the
# image is inverted. At 1.3 they came out mid-grey; 1.8 takes them most of the
# way. Past about 2.4 the photographs' own grain comes up as speckle too.
#
# DILATE is the other half, and it is thickness rather than brightness: a 1.2px
# radius draws a one-pixel line, which at the 132px these print at in 03 is
# most of a stroke lost to resampling. Disk:1 grows every stroke by a pixel.
#
# The thickening operator follows which way up the drawing is, and it has been
# both. Dilate grows the BRIGHT region; struck, the strokes are bright, so
# Dilate is what fattens them. The graphite version wanted Erode for the same
# reason inverted. Turn the drawing over without turning the operator over and
# it eats the drawing instead of thickening it. One pixel at both widths rather
# than a fraction of each, because morphology takes whole-pixel kernels and 900
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
        -colorspace gray -auto-level -kuwahara "$SMOOTH" \
        \( +clone \
           \( +clone -negate -blur "0x$blur" \) -compose colordodge -composite \
           -evaluate pow "$POW" -negate -morphology Dilate "Disk:$DILATE" \) \
        -compose screen -composite \
        -sigmoidal-contrast 3,50% \
        +level-colors "$GROUND","$HIGH" \
        mpr:key -alpha off -compose copy_opacity -composite \
        -strip -quality "$QUALITY" "$tmp"
    else
      magick "$src" \
        -colorspace gray -auto-level -kuwahara "$SMOOTH" \
        \( +clone \
           \( +clone -negate -blur "0x$blur" \) -compose colordodge -composite \
           -evaluate pow "$POW" -negate -morphology Dilate "Disk:$DILATE" \) \
        -compose screen -composite \
        -sigmoidal-contrast 3,50% \
        +level-colors "$GROUND","$HIGH" \
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

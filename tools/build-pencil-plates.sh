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
#   -compose screen the dodge sketch is screened back OVER the tone rather than
#                  replacing it. The notebook reads as a light mass against a
#                  dark desk -- which is what makes it legible small -- and the
#                  strokes draw its edges.
#   -unsharp       and then it is SHARPENED, because the thing that kept being
#                  wrong was softness.
#
# NOTHING IS SMOOTHED, and that is the correction. -kuwahara 4 shipped here for
# one revision to stop texture becoming line, and it worked and it was the
# blur: kuwahara is a painterly filter, it smears flat regions into each other,
# and the plates came out looking like out-of-focus photographs. Two other
# routes to the same end were tried and are worse:
#
#   -level 0%,45%  crushing weak edges to white to leave only strong ones. It
#                  leaves almost nothing -- the plate goes nearly blank.
#   -posterize     flat tonal bands. It DITHERS at every boundary, so a clean
#                  graphic idea comes out speckled with dots.
#
# Detail that cannot survive the downscale is better lost to the resize than
# smeared before it.
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
# ONE LINE WEIGHT
#
# The dodge sketch's line weight is set by the blur radius, in PIXELS, so it is
# only one weight on screen if every plate is drawn at the same multiple of its
# displayed size. That used to be done with RADIUS_DIV, a blur that scaled with
# the file's width; it is now done by resizing each family first -- see TARGET
# below -- and using one fixed BLUR.
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
# Sharpening, applied after the line is screened over the tone. There is no
# smoothing step at all any more -- see the header.
SHARPEN='0x0.8+1.4+0.02'
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
# DRAWN AT THE SIZE IT IS SHOWN, and that is what finally took the blur out.
#
# Four revisions tuned the sketch itself -- radius, power, dilate, a smoothing
# pass, a sharpening pass -- and every one of them was drawing a 1-2px line on
# a 1240px file that the browser then shows at 122px. Measured in the page:
#
#   plate         shown at 1440   file   downscale   shown at 443   downscale
#   process (03)       122px      1240     10.2x          70px         17.7x
#   services (02)      236px       900      3.8x         105px          8.6x
#   work (04)          431px      1240      2.9x         327px          3.8x
#
# A one-pixel pencil line averaged over a 10x10 block is a tenth of a pixel of
# faint grey. That is the blur, and no amount of sharpening at 1240 survives
# it, because the sharpening is averaged away by exactly the same resize. So
# each family is RESIZED FIRST to about two and a half times its displayed
# width -- enough for a 2x screen -- and the drawing is made at that size,
# where a stroke is a stroke the display will actually keep.
#
# Proved by rendering the same plate both ways and scaling each to 122px and
# 70px with point filtering: sketched-then-resized is smudge, resized-then-
# sketched draws the magnifier ring, the notebook edges and the pen as lines.
#
# Every family ends up at roughly the same multiple of its display size, so one
# fixed BLUR is one line weight on screen -- which is what RADIUS_DIV, the
# width fraction this replaced, was trying to be and could not while the
# sources were three different sizes shown at three different sizes.
TARGET_process=320
TARGET_services=620
TARGET_work=1000
BLUR=1.1
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
    target_var="TARGET_$dir"
    target="${!target_var}"
    blur="$BLUR"
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
      # The key comes off BEFORE the resize. Resizing an srgba image zeroes the
      # colour under every transparent pixel, and -auto-level then spends the
      # whole range on that black: the five plates came out as flat silver
      # silhouettes with a colour std of 0.004 and no drawing in them.
      magick "$src" \
        \( +clone -alpha extract -resize "${target}x" +write mpr:key +delete \) \
        -alpha off -resize "${target}x" \
        -colorspace gray -auto-level \
        \( +clone \
           \( +clone -negate -blur "0x$blur" \) -compose colordodge -composite \
           -evaluate pow "$POW" -negate -morphology Dilate "Disk:$DILATE" \) \
        -compose screen -composite \
        -unsharp "$SHARPEN" \
        -sigmoidal-contrast 3,50% \
        +level-colors "$GROUND","$HIGH" \
        mpr:key -alpha off -compose copy_opacity -composite \
        -strip -quality "$QUALITY" "$tmp"
    else
      # Light-mode interfaces are turned over before they are drawn. Their
      # source median is 0.80 and 0.85 (saas, web) where every other opaque
      # source is under 0.59, and the screen blend then saturates the whole
      # plate toward HIGH: 04's web plate printed as a pale slab with its lines
      # lost in it, median 0.79. Negated it reads as the same interface in dark
      # mode -- median 0.36, lines clear. Photographs are never turned over,
      # which is why the bar is 0.7 and not 0.5: a negative photo is a film
      # negative, not a drawing.
      invert=$(magick "$src" -colorspace gray -auto-level \
        -format '%[fx:median > 0.7 ? 1 : 0]' info:)
      neg=(); [ "$invert" = "1" ] && neg=(-negate)
      magick "$src" -resize "${target}x" \
        -colorspace gray "${neg[@]}" -auto-level \
        \( +clone \
           \( +clone -negate -blur "0x$blur" \) -compose colordodge -composite \
           -evaluate pow "$POW" -negate -morphology Dilate "Disk:$DILATE" \) \
        -compose screen -composite \
        -unsharp "$SHARPEN" \
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
    read -r median mean std < <(magick "$tmp" -background none -alpha set \
      -trim +repage -alpha off -colorspace Gray \
      -format "%[fx:median] %[fx:mean] %[fx:standard_deviation]\n" info:)
    # A plate with no drawing in it -- the flat-silhouette failure above --
    # passes the median test, so it gets its own.
    awk -v s="$std" 'BEGIN { if (s < 0.05) exit 1 }' || {
      echo "REFUSING $dir/$(basename "$src"): std $std, nothing is drawn" >&2
      rm -f "$tmp"
      exit 1
    }
    awk -v m="$median" -v p="$PAGE_LUMA" 'BEGIN { if (m <= p) exit 1 }' || {
      echo "REFUSING $dir/$(basename "$src"): median $median is at or below the page ($PAGE_LUMA)" >&2
      rm -f "$tmp"
      exit 1
    }

    mv "$tmp" "$src"
    printf '  %-40s %5s -> %-5s blur %-4s median %-8s mean %s\n' \
      "$dir/$(basename "$src")" "$width" "$target" "$blur" "$median" "$mean"
    converted=$((converted + 1))
  done
done

echo "drew $converted plates"

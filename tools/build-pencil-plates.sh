#!/usr/bin/env bash
set -euo pipefail

# Draw pencil lines over every photographic plate in the book.
#
# WHY THIS IS A POST-PASS AND NOT A FLAG ON THE OTHER THREE SCRIPTS
#
# build-service-plates.sh, build-process-plates.sh and build-work-plates.sh all
# read sources that are NOT in this repository, so none of them can be re-run
# here. This reads the plates that SHIPPED, out of apps/web/public, and
# rewrites them in place.
#
# It is NOT IDEMPOTENT. Inking an inked plate finds edges in the first pass's
# own lines and doubles every stroke. Restore the toned plates first:
#
#   git checkout 445aec1 -- apps/web/public/services apps/web/public/process \
#     apps/web/public/work
#
# 445aec1 is the last commit before any pencil pass, and it is the INPUT this
# script is written against -- not HEAD, which is this script's own output.
#
# The REDACTIONS SURVIVE: 04's blurred boxes over invented client names are
# baked into those files, a blurred region has no edges, and a line drawing
# cannot recover what a blur destroyed. Look at work/*.webp at 100% after a run.
#
# THE PLATE KEEPS ITS OWN TONE; THE PENCIL IS DRAWN ON TOP
#
# Seven revisions REBUILT each plate out of a sketch -- a dodge drawing,
# screened over a grey tone, recoloured between a GROUND and a HIGH -- and every
# one of them was rejected as blurred, washed out or not visible. The failure
# was the rebuild itself: it threw away the toning the three build scripts had
# measured against the navy page (colour, contrast, the per-image gammas) and
# replaced it with two hand-picked greys. The pictures stopped reading as the
# book's pictures and started reading as embossed grey slabs.
#
# So the toned plate is kept exactly, and the pencil is a MULTIPLY layer over
# it: the dodge sketch is dark line on white, white multiplies to nothing, and
# only the strokes print -- as graphite drawn over the print, following every
# edge. The picture underneath is the one the book was designed with.
#
#   INK 35   the darkest a stroke may go, as a floor on the line layer
#            (+level INK%,100%). 55 reads as a faint trace at 122px; 0 is a
#            black outline that turns 03's desks into woodcuts. 35 is a
#            visible pencil line that still lets the tone through it.
#
# What went, and why none of it is needed now: GROUND/HIGH (the plate keeps its
# own colours), -sigmoidal-contrast (it keeps its own contrast), Dilate (a dark
# 1px line over a mid-tone reads; a bright one on a bright tone did not), the
# light-mode inversion (the web and SaaS plates are no longer screened toward
# white, so there is nothing to rescue). `git log` has all of it.
#
# DRAWN AT THE SIZE IT IS SHOWN
#
# The line is drawn AFTER the resize, and that is what took the blur out.
# Measured in the page:
#
#   plate         shown at 1440   file   downscale   shown at 443   downscale
#   process (03)       122px      1240     10.2x          70px         17.7x
#   services (02)      236px       900      3.8x         105px          8.6x
#   work (04)          431px      1240      2.9x         327px          3.8x
#
# A one-pixel line averaged over a 10x10 block is a tenth of a pixel of grey.
# Each family is resized first to about 2.5x its displayed width -- enough for
# a 2x screen -- so one fixed BLUR is one line weight on screen everywhere.
#
# THE KEY COMES OFF BEFORE THE RESIZE
#
# 02's five are keyed srgba. Resizing an srgba image zeroes the colour under
# every transparent pixel, so the key is lifted off first, colour and key are
# resized separately, and the key goes back on at the end. The script refuses
# any plate whose channel count changed.
#
# WHAT IS NOT CONVERTED, AND WHY
#
#   plates/plate-telegraphy.webp   already line art -- an 1876 patent drawing.
#   perspectives/column.webp       a luminance MASK, not a picture; inking it
#                                  corrupts the mask.
#   logo.webp, logo-mark.webp      a brand mark is not a sketch of a brand mark.
#   frames/                        the book itself; see CLAUDE.md.

command -v magick >/dev/null || { echo "needs ImageMagick (magick)"; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUB="$ROOT/apps/web/public"

TARGET_process=320
TARGET_services=620
TARGET_work=1000
# Dodge radius. Wider draws haze around an edge instead of a line along it.
BLUR=1.1
# Deepens the strokes of the dodge drawing before the floor is applied.
POW=1.8
INK=35
# Light: the plates are already toned, this only restores the edge the resize
# softened. Heavier values ring around the dark lines.
SHARPEN='0x0.6+0.8+0.02'
QUALITY=86

# The pencil layer, as ImageMagick arguments: from the colour image on the
# stack, a dark-line-on-white drawing, floored at INK.
PENCIL=(
  \( +clone -colorspace gray
     \( +clone -negate -blur "0x$BLUR" \) -compose colordodge -composite
     -evaluate pow "$POW" +level "${INK}%,100%" \)
  -compose multiply -composite
  -unsharp "$SHARPEN"
)

# The paper these have to stay above, sampled off the real page -- the same
# pixel of the same frame build-process-plates.sh reads.
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
    tmp="$(mktemp -u).webp"

    keyed=$(magick identify -format '%[channels]' "$src" | grep -c 'a' || true)

    if [ "$keyed" != "0" ]; then
      magick "$src" \
        \( +clone -alpha extract -resize "${target}x" +write mpr:key +delete \) \
        -alpha off -resize "${target}x" \
        "${PENCIL[@]}" \
        mpr:key -alpha off -compose copy_opacity -composite \
        -strip -quality "$QUALITY" "$tmp"
    else
      magick "$src" -resize "${target}x" \
        "${PENCIL[@]}" \
        -strip -quality "$QUALITY" "$tmp"
    fi

    after=$(magick identify -format '%[channels]' "$tmp" | grep -c 'a' || true)
    if [ "$keyed" != "$after" ]; then
      echo "REFUSING $dir/$(basename "$src"): alpha changed ($keyed -> $after)" >&2
      rm -f "$tmp"; exit 1
    fi

    # Multiply only darkens, so this is the audit that can actually fail now:
    # a plate inked down to the page's own value reads as a hole in it.
    # Measured on the SUBJECT -- -trim crops a keyed render to its own box.
    read -r median std < <(magick "$tmp" -background none -alpha set \
      -trim +repage -alpha off -colorspace Gray \
      -format "%[fx:median] %[fx:standard_deviation]\n" info:)
    awk -v m="$median" -v p="$PAGE_LUMA" 'BEGIN { if (m <= p) exit 1 }' || {
      echo "REFUSING $dir/$(basename "$src"): median $median is at or below the page ($PAGE_LUMA)" >&2
      rm -f "$tmp"; exit 1
    }
    awk -v s="$std" 'BEGIN { if (s < 0.05) exit 1 }' || {
      echo "REFUSING $dir/$(basename "$src"): std $std, nothing is drawn" >&2
      rm -f "$tmp"; exit 1
    }

    mv "$tmp" "$src"
    printf '  %-46s %5s -> %-5s median %-8s std %s\n' \
      "$dir/$(basename "$src")" "$width" "$target" "$median" "$std"
    converted=$((converted + 1))
  done
done

echo "inked $converted plates"

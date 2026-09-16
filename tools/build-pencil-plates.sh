#!/usr/bin/env bash
set -euo pipefail

# Redraw every photographic plate in the book as a graphite pencil drawing.
#
# WHY THIS IS A POST-PASS AND NOT A FLAG ON THE OTHER THREE SCRIPTS
#
# build-service-plates.sh, build-process-plates.sh and build-work-plates.sh all
# read sources that are NOT in this repository, so none of them can be re-run
# here. This reads the plates that SHIPPED, out of apps/web/public, and
# rewrites them in place.
#
# It is NOT IDEMPOTENT. Drawing a drawing finds edges in the first pass's own
# strokes and doubles them. Restore the toned plates first:
#
#   git checkout 445aec1 -- apps/web/public/services apps/web/public/process \
#     apps/web/public/work
#
# 445aec1 is the last commit before any pencil pass, and it is the INPUT this
# script is written against -- not HEAD, which is this script's own output.
#
# The REDACTIONS SURVIVE: 04's blurred boxes over invented client names are
# baked into those files, a blurred region has no edges, and a drawing cannot
# recover what a blur destroyed. Look at work/*.webp at 100% after a run.
#
# WHAT A PENCIL DRAWING IS MADE OF, AND WHICH PART EACH REVISION MISSED
#
# Three things, multiplied together on white and then printed in the book's
# ink:
#
#   LINE     a colour-dodge sketch -- the photograph's edges as graphite
#            strokes. POW deepens them, LINE_FLOOR stops them going solid.
#   HATCH    diagonal strokes, laid only where the photograph is dark. Noise
#            motion-blurred along 135deg, screened with the photo's own luma so
#            the lights stay clean paper. This is what makes it read as DRAWN:
#            a shaded photograph with outlines is still a photograph.
#   SHADE    the photograph's luma lifted by SHADE_LIFT, so the forms keep
#            their weight -- a notebook is a light mass on a dark desk.
#
# The revisions before this each had one or two of those. Line alone (three
# versions) was unreadable at 122px: a drawing of clutter is clutter. Line
# screened over a recoloured tone read as embossed grey slabs. Line multiplied
# over the untouched photo kept the old look and read as a photo with
# outlines, which is what prompted "do it according to the pencil theme".
#
# PRINTED IN THE BOOK'S INK, NOT ON WHITE PAPER
#
#   INK #16283f -> MID #34557f -> PAPER #b4cbe6, all in the page's hue
#
# Two grey-blue two-stop maps came first (#0f1c30/#aabdd2, then
# #1a2d47/#c3d1e0). The first printed every dark plate dim; the second read
# as real pencil on a separate grey sheet, and was asked to follow the
# BACKGROUND colour instead. A three-stop ramp keeps the mids navy -- a
# two-stop map from navy to near-white turns every mid-tone grey.
#
# A white-paper version was built and rejected earlier ("don't make background
# white") -- a pale slab stuck on navy stock. This paper is the blue-grey the
# old toned plates already sat at, so the plates stay in the book's palette.
# The drawing is -auto-levelled first so a dark source (03's night desks) uses
# the whole range instead of printing as a flat navy rectangle; that was the
# difference between a legible ENGINEER plate and a hatched grey one.
#
# DRAWN AT THE SIZE IT IS SHOWN
#
# Measured in the page:
#
#   plate         shown at 1440   file   downscale   shown at 443   downscale
#   process (03)       122px      1240     10.2x          70px         17.7x
#   services (02)      236px       900      3.8x         105px          8.6x
#   work (04)          431px      1240      2.9x         327px          3.8x
#
# A one-pixel stroke averaged over a 10x10 block is grey haze -- that was the
# blur, through four revisions of tuning the sketch itself. Each family is
# resized first to about 2.5x its displayed width, so one BLUR and one hatch
# length are one stroke weight on screen everywhere.
#
# THE KEY COMES OFF BEFORE THE RESIZE
#
# 02's five are keyed srgba. Resizing an srgba image zeroes the colour under
# every transparent pixel -- the five once came out as flat silver silhouettes
# -- so colour and key are resized separately and the key goes back on at the
# end. The script refuses any plate whose channel count changed.
#
# WHAT IS NOT CONVERTED, AND WHY
#
#   plates/plate-telegraphy.webp   already line art -- an 1876 patent drawing.
#   perspectives/column.webp       a luminance MASK, not a picture.
#   logo.webp, logo-mark.webp      a brand mark is not a sketch of a brand mark.
#   frames/                        the book itself; see CLAUDE.md.

command -v magick >/dev/null || { echo "needs ImageMagick (magick)"; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUB="$ROOT/apps/web/public"

TARGET_process=320
TARGET_services=620
TARGET_work=1000

BLUR=1.1          # dodge radius; wider draws haze beside an edge
POW=2.2           # stroke depth
LINE_FLOOR=10     # % -- the darkest a line may go before the ink mapping
HATCH_LEN=7       # motion-blur length of one hatch stroke, in pixels
HATCH_GATE=20     # % -- luma above which no hatching is laid
HATCH_FLOOR=45    # % -- the darkest a hatch stroke may go
SHADE_LIFT=25     # % -- how much of the photograph's own shading survives
# Three stops in the PAGE'S OWN HUE (frame-091 samples at #1f3452, hue 215,
# sat 0.45): a shade under the page, a mid navy, a light blue of the same
# family. The grey-white paper this replaced read as a pencil on a separate
# sheet; these read as a drawing on the book's page.
INK='#16283f'
MID='#34557f'
PAPER='#b4cbe6'
# Local contrast before drawing. 02's renders and 03's night desks are mostly
# dark; a global -auto-level leaves their detail in the bottom fifth and the
# hatching then buries it. CLAHE lifts each region on its own.
CLAHE='12x12%+128+2.5'
SHARPEN='0x0.6+0.8+0.02'
QUALITY=86

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# draw IN OUT -- IN is an opaque colour image already at its target size.
draw() {
  local in=$1 out=$2 w h
  read -r w h < <(magick identify -format '%w %h\n' "$in")
  magick "$in" -colorspace gray -clahe "$CLAHE" -auto-level "$WORK/L.png"
  magick "$WORK/L.png" \
    \( +clone -negate -blur "0x$BLUR" \) -compose colordodge -composite \
    -evaluate pow "$POW" +level "${LINE_FLOOR}%,100%" "$WORK/line.png"
  # A fixed seed, so a rebuild is byte-comparable with the last one.
  magick -seed 7 -size "${w}x${h}" xc:gray +noise Random -colorspace gray \
    -motion-blur "0x${HATCH_LEN}+135" -auto-level -sigmoidal-contrast 6,50% \
    \( "$WORK/L.png" +level "${HATCH_GATE}%,100%" -evaluate pow 0.6 \) \
    -compose screen -composite +level "${HATCH_FLOOR}%,100%" "$WORK/hatch.png"
  magick "$WORK/line.png" "$WORK/hatch.png" -compose multiply -composite \
    \( "$WORK/L.png" +level "${SHADE_LIFT}%,100%" \) -compose multiply -composite \
    -unsharp "$SHARPEN" -auto-level -evaluate pow 1.15 \
    \( xc:"$INK" xc:"$MID" xc:"$PAPER" +append -filter Cubic -resize 256x1! \) \
    -clut "$out"
}

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
    tmp="$WORK/out.webp"

    keyed=$(magick identify -format '%[channels]' "$src" | grep -c 'a' || true)

    magick "$src" -alpha off -resize "${target}x" "$WORK/colour.png"
    draw "$WORK/colour.png" "$WORK/drawn.png"
    if [ "$keyed" != "0" ]; then
      magick "$src" -alpha extract -resize "${target}x" "$WORK/key.png"
      magick "$WORK/drawn.png" "$WORK/key.png" -alpha off \
        -compose copy_opacity -composite -strip -quality "$QUALITY" "$tmp"
    else
      magick "$WORK/drawn.png" -strip -quality "$QUALITY" "$tmp"
    fi

    after=$(magick identify -format '%[channels]' "$tmp" | grep -c 'a' || true)
    if [ "$keyed" != "$after" ]; then
      echo "REFUSING $dir/$(basename "$src"): alpha changed ($keyed -> $after)" >&2
      exit 1
    fi

    # INK is darker than the page, so a plate that is mostly ink reads as a
    # hole in it. Measured on the SUBJECT -- -trim crops a keyed render to its
    # own box. And a std floor, because a blank plate passes the median test.
    read -r median std < <(magick "$tmp" -background none -alpha set \
      -trim +repage -alpha off -colorspace Gray \
      -format "%[fx:median] %[fx:standard_deviation]\n" info:)
    awk -v m="$median" -v p="$PAGE_LUMA" 'BEGIN { if (m <= p) exit 1 }' || {
      echo "REFUSING $dir/$(basename "$src"): median $median is at or below the page ($PAGE_LUMA)" >&2
      exit 1
    }
    awk -v s="$std" 'BEGIN { if (s < 0.05) exit 1 }' || {
      echo "REFUSING $dir/$(basename "$src"): std $std, nothing is drawn" >&2
      exit 1
    }

    cp "$tmp" "$src"
    printf '  %-46s %5s -> %-5s median %-8s std %s\n' \
      "$dir/$(basename "$src")" "$width" "$target" "$median" "$std"
    converted=$((converted + 1))
  done
done

echo "drew $converted plates"

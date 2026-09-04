#!/usr/bin/env bash
# Turn the four interface mockups into the register's plates on chapter 04.
#
# Sources are NOT in the repo -- they are expected at the repo root as
# WEB_APPLICATION.png, AI_PLATFORM.png, "SaaS Product.png" (the name really
# does have a space and no underscore; the brief called it SAAS_PRODUCT.png and
# no such file was delivered) and MOBILE_APPLICATION.png. The OUTPUT is
# committed, so a clone builds without them.
#
#
# WHY THESE ARE CROPPED, AND IT IS NOT FRAMING
#
# The four arrive as marketing compositions rather than as screenshots. Around
# the interface each one carries some of: a Nivlak wordmark, a paragraph of
# body copy ("A complete SaaS platform engineered for scale, performance and
# growth"), a feature bullet list, and -- on WEB_APPLICATION -- a set of design
# annotations printed into the pixels: COMPOSITION 16:9, UI PREVIEW DASHBOARD,
# FOCAL POINT, FRAME 1680PX, GRID SYSTEM.
#
# All of that has to go, for three separate reasons. The copy duplicates what
# the page already says in type, and says it worse because it is baked into an
# image at 150px. The annotations are a designer's working marks and printing
# them is the site showing its own scaffolding. And the four frames are not the
# same frame -- one light with spec marks, three dark with a logo and bullets --
# so as delivered they are not a series, and the register needs them to be one.
#
# Cropping to the interface fixes all three at once and needs no retouching.
#
#
# WHY THE DATA IS BLURRED, WHICH IS THE PART THAT MATTERS
#
# These mockups are populated with invented business results. Legible in the
# sources at full size:
#
#   SaaS Product      Total Revenue 12,45,000 · MRR 8,76,000 · churn 1.92%, and
#                     a transactions table naming Acme Corporation, Vertex
#                     Industries, Bright Future Pvt. Ltd. and Studio Moksha
#                     against amounts paid
#   WEB_APPLICATION   Invoices Paid 8,75,000, and a project table with the same
#                     four names against percentage progress
#   MOBILE            revenue 12,45,000, "New Customer -- Acme Corporation"
#   AI_PLATFORM       24,980 requests, 96.7% success, 0.21% error
#
# Chapter 04 is a register, and the whole argument for that setting is that a
# reader can tell which work exists and which is a study -- see the note above
# it in book-pages.content.ts. Four of its five entries are labelled CONCEPT.
# A picture of a named client paying an invoice, printed beside an entry that
# says CONCEPT, does not read as a contradiction; the picture wins and the
# label becomes decoration. That is precisely the quiet lie the register was
# built to make impossible, arriving through the one door the setting left open.
#
# So the regions carrying names and figures are blurred to illegibility BEFORE
# the downscale, and the plate keeps only the shape of the interface -- which
# is all a 150px plate beside a ledger was ever going to show.
#
# WHAT IS BLURRED AND WHAT IS NOT, WHICH IS ONE RULE
#
#   Blur anything that names a PARTY or states MONEY.
#   Keep counts, hours, percentages and unlabelled charts.
#
# Those are the two things that make a picture read as delivered client work: a
# company that could be phoned, and an amount that could have been paid.
# "Acme Corporation" against 12,45,000 is a claim about a client. "128 tasks
# completed, up 24% from last week" is a screenshot of sample data, and no
# reader takes it for Nivlak's results -- the same reader is looking at a line
# that says NIVLAK LAB, CONCEPT. Redacting that too ends with a plate that is a
# grey smear, which fails the only reason these are photographs.
#
# Money hides in axis labels. Both revenue charts label theirs in lakhs and
# both needed a box of their own -- the last two in each list below.
#
# WHY THE DOWNSCALE IS NO LONGER THE BACKSTOP
#
# It was, at 560px: a source glyph 10px tall came out under 3.4px, which is not
# small type but no type, and the boxes only had to make the intent reviewable.
# 04 is a full-measure stage now and the file is 1200px against crops of
# 1100-1434, so the resize is about 1:1 and destroys nothing. The blur is the
# whole redaction, which is why the radius went 8 -> 12 and why every box below
# has to be proved by looking at the OUTPUT at 100%, not by reading this list.
#
#
# WHY THE INK BAND IS NARROWER THAN 03'S, WHICH IS THE WHOLE TONE STORY
#
# Measured on the crops, not the full frames:
#
#   WEB_APPLICATION   median 0.976     a light-mode interface
#   SAAS_PRODUCT      median 0.864     light content, dark chrome
#   AI_PLATFORM       median 0.116     a dark-mode interface
#   MOBILE            median 0.084     a dark-mode interface
#
# Against paper at 0.205 that is a hole of light and a hole of dark in the same
# chapter, and nothing about it is meaningful: 03's plates run 13x apart too,
# but there the spread IS the content -- paper by daylight becoming screens at
# night is the arc of that chapter. Here it is only that one mockup was drawn
# in light mode and three in dark.
#
# WHY NOT GAMMA, WHICH IS WHAT 03 USES
#
# Because it cannot do this. Solving for the gamma that lands each median on a
# common target gives 0.03 for WEB and 2.96 for MOBILE -- values that do not
# adjust an image, they obliterate it. Gamma closes a gap between exposures of
# the same kind of thing; this is a gap between two colour schemes.
#
# The band does it instead. +level-colors compresses every input into the range
# between SHADOW and HIGHLIGHT, so how far apart two plates END is the input gap
# times the band's width -- narrow the band and the gap narrows with it, whatever
# the sources looked like:
#
#   band 0.235..0.895 (03's)   plates land 0.29..0.93, 3.2x apart
#   band 0.300..0.620 (this)   plates land 0.38..0.61, 1.6x apart   <- this
#
# A narrow band is also low contrast, and that is the second reason to want it
# here rather than a cost of getting it. 03's plates are full-page photographs
# and carry their pages; these are 150px specimens set beside a ledger, and a
# specimen that competes with the type it annotates is the wrong size of loud.
# The sigmoidal puts the local snap back without moving either end.
#
# The gammas are what is left: a nudge in each direction, closing the last of
# the gap without touching a colour scheme.
#
#
# WHY 1200x675
#
# The plate used to set at ~30% of a ledger's column -- 140px at 1440 -- and
# 560 was 2x that with headroom. It is the whole measure of a recto now: ~460px
# at 1440x900, ~610 on a wide desktop, so 1200 is 2x the larger of those and
# lands exactly on a 2x display. Beyond that it is only a better copy of data
# this file exists to destroy.
#
# 675 is not a rounding. The page reserves a strict 16:9 box and the image is
# object-fit: cover, so a file that is not 16:9 is silently cropped by the
# browser -- and what it crops is an edge of an interface. The four crops below
# are 16:9 to within 0.13%, so the resize is forced exact (`!`) and the last
# fraction of a pixel is taken by the resampler rather than by the layout.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/apps/web/public/work"

# The two ends of the book's ink. The same navy and the same silver
# build-process-plates.sh works between, but a much narrower reach of it -- see
# the header for why a small specimen wants a short band.
SHADOW='#28405f'
HIGHLIGHT='#bccfe8'
SATURATION=58
SIGMOIDAL=5
WIDTH=1200
QUALITY=80
# Enough to take 10px type to a smear at source scale -- sigma 8 spreads a
# glyph over ~24px -- and no more than that. The downscale is what makes the
# redaction true; this pass only has to survive being looked at in the file, so
# a heavier radius buys nothing and reads as a censor's smudge at 560px.
BLUR='0x12'

command -v magick >/dev/null || { echo "ImageMagick 7 (magick) is required" >&2; exit 1; }
mkdir -p "$OUT"

# name|source|slug|range|crop|blur boxes (space separated, WxH+X+Y in SOURCE px)
#
# `range` is the per-image `+level lo%,hi%` that runs BEFORE the shared band --
# see WHY NOT GAMMA above for why it is an endpoint knob and not a midtone one.
#
# Crops are the interface panel of each composition, measured off the source at
# 1100px wide and scaled by 1.52. Every one is 16:9 to within a pixel, so the
# page's reserved box never has to letterbox or crop again.
#
# The blur boxes are in the SAME frame -- full source pixels, not offsets into
# the crop. They are applied before the crop, so a box measured relative to the
# cropped window lands somewhere else entirely: the first run of this file did
# exactly that, and the proof came back with every client name still legible
# and a smear over the revenue chart instead. Measure against the source.
PLATES=(
"WEB_APPLICATION|WEB_APPLICATION.png|web-application|0%,50%|1160x652+255+122|889x140+479+666 219x88+1167+304"
"AI_PLATFORM|AI_PLATFORM.png|ai-platform|40%,100%|1434x807+119+84|1216x144+312+692"
"SAAS_PRODUCT|SaaS Product.png|saas-product|0%,56%|1099x619+280+38|651x82+456+146 247x161+863+283 651x167+456+464 380x197+1216+441 380x83+1216+122 58x140+462+292"
"MOBILE_APPLICATION|MOBILE_APPLICATION.png|mobile-application|42%,100%|1337x752+274+105|282x495+380+255 300x92+749+372 265x75+1152+272 265x200+1152+525 44x140+1148+338"
)

missing=0
for spec in "${PLATES[@]}"; do
  IFS='|' read -r _ src _ _ _ _ <<<"$spec"
  [ -f "$ROOT/$src" ] || { echo "missing source: $ROOT/$src" >&2; missing=1; }
done
[ "$missing" -eq 0 ] || { echo "put the four mockups at the repo root and re-run" >&2; exit 1; }

paper=$(magick "$ROOT/apps/web/public/frames/v5/hd/frame-091.webp" \
  -crop 1x1+1200+400 +repage -colorspace Gray -format "%[fx:mean]" info:)

printf '%-20s %10s  %8s  %8s  %s\n' SOURCE RANGE MEDIAN MEAN FILE
for spec in "${PLATES[@]}"; do
  IFS='|' read -r name src slug range crop boxes <<<"$spec"
  dst="$OUT/$slug.webp"

  # Crop first, so the blur boxes are measured in the same frame the header
  # quotes -- the SOURCE, not some intermediate. -page +X+Y places each blurred
  # patch back where it came from.
  args=()
  for box in $boxes; do
    args+=( \( -clone 0 -crop "$box" +repage -blur "$BLUR" -repage "+${box#*+}" \) )
  done

  magick "$ROOT/$src" \
    "${args[@]}" -flatten \
    -crop "$crop" +repage \
    -resize "${WIDTH}x$((WIDTH * 9 / 16))!" \
    +level "$range" \
    -modulate "100,$SATURATION,100" \
    +level-colors "$SHADOW","$HIGHLIGHT" \
    -sigmoidal-contrast "$SIGMOIDAL,50%" \
    -strip -quality "$QUALITY" \
    "$dst"

  read -r median mean w h < <(magick "$dst" -colorspace Gray \
    -format "%[fx:median] %[fx:mean] %w %h\n" info:)
  printf '%-20s %10s  %8.3f  %8.3f  %s (%sx%s, %s)\n' \
    "$name" "$range" "$median" "$mean" "$slug.webp" "$w" "$h" \
    "$(du -h "$dst" | cut -f1)"

  # The one thing this script must never ship, same as the 03 plates: a plate
  # below the paper is a hole in the page. Fix that image's `range`, never
  # the SHADOW -- moving the floor moves all four.
  awk -v m="$median" -v p="$paper" 'BEGIN { if (m <= p) exit 1 }' || {
    echo "  ^ FAILS: median $median is at or below the paper ($paper)" >&2
    exit 1
  }
done

echo
echo "paper (frame-091 recto, grey) = $paper -- every plate above prints lighter."
echo "Proof the crops and the blur before trusting the numbers:"
echo "  magick apps/web/public/work/saas-product.webp -resize 400% /tmp/proof.png"

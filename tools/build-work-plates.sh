#!/usr/bin/env bash
# Turn the four interface mockups into the plates on chapter 04's project stage.
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
# Every entry on chapter 04 is labelled CONCEPT, and the whole argument for
# the stage is that a reader can tell a study from a build -- see the note
# above the chapter in book-pages.content.ts. A picture of a named client
# paying an invoice, printed beside an entry that says CONCEPT, does not read
# as a contradiction; the picture wins and the label becomes decoration.
#
# WHAT IS BLURRED AND WHAT IS NOT, WHICH IS ONE RULE
#
#   Blur where a THIRD PARTY IS NAMED. Money goes only when it is attached
#   to one. Everything the app shows about itself stays.
#
# The thing that makes a picture read as delivered client work is a company
# that could be phoned against an amount that could have been paid. Both
# halves are needed. "Acme Corporation -- Nivlak Pro -- Rs 78,000 -- Paid" is
# a claim about a client. A KPI card reading "Total Revenue Rs 12,45,000"
# inside a dashboard mockup is the demo app's sample data, the same kind of
# thing as "128 tasks completed, up 24% from last week", and no reader takes
# either for Nivlak's books -- the same reader is looking at a line that says
# NIVLAK LAB, CONCEPT.
#
# The rule used to be the disjunction -- names OR money -- and MOBILE is what
# proved that too broad. Seven boxes covered both revenue cards, the axis
# labels, the sales chart and the Top Products table, and once the tone came
# up to 03's contrast (below) the result read as a censored phone rather than
# as software: a third of the picture was smear, and a plate you cannot read
# fails the only reason these are photographs and not emblems. Six of those
# seven boxes were over the app talking about itself. What is left is 96x28
# over the only proper noun on the plate that is not Nivlak's: the second
# line of one activity row, where "New Customer" is followed by "Acme
# Corporation". The row's own label and its timestamp stay legible, because
# a customer arriving is a thing an app does and only the customer's NAME is
# a claim about the world.
#
# Two things that look like they need a box and do not. "Top Products: Nivlak
# Pro / Analytics / Automate / Connect" names Nivlak's OWN products, not a
# customer, and the figures beside them are the mockup's, not a claim of
# sales. And revenue axis labels in lakhs are money with nobody attached, so
# they go the same way -- they only ever needed boxes under the old rule.
#
# WHY THE DOWNSCALE IS NO LONGER THE BACKSTOP
#
# It was, at 560px: a source glyph 10px tall came out under 3.4px, which is
# not small type but no type, and the boxes only had to make the intent
# reviewable. 04 is a full-measure stage now and the file is 1240px against
# crops of 828-1337, so the resize is about 1:1 and destroys nothing. The blur
# is the whole redaction, which is why the radius went 8 -> 12 and why every
# box below has to be proved by looking at the OUTPUT at 100%, not by reading
# this list.
#
# WEB and SAAS still carry a box each on money with no party attached -- WEB's
# "Invoices Paid" card (219x88+1167+304) and SAAS's KPI strip, Top Products
# and axis labels. The refined rule above no longer requires them. They are
# small and they are not costing either plate the way MOBILE's seven cost it,
# so they stay until somebody decides otherwise; the two client TABLES on
# those plates are a different matter and never come off.
#
#
# THE TONE IS 03'S, EXACTLY, AND THAT IS THE POINT
#
# SHADOW, HIGHLIGHT, SATURATION, SIGMOIDAL and WIDTH below are copied from
# build-process-plates.sh. Both chapters now print full-measure photographs on
# navy paper, and two sets of plates in one book that were toned by different
# arithmetic read as two books. This file used to run a much narrower band --
# 04's plates were 150px specimens beside a ledger then, and a specimen that
# competes with the type it annotates is the wrong kind of loud. That argument
# retired with the ledger.
#
# WHY -level AND NOT GAMMA, AND NOT +level EITHER
#
# Measured on the crops:
#
#   WEB_APPLICATION   median 0.989     a light-mode interface
#   SAAS_PRODUCT      median 0.878     light content, dark chrome
#   AI_PLATFORM       median 0.116     a dark-mode interface
#   MOBILE            median 0.084     a dark-mode interface
#
# GAMMA cannot touch these. It moves midtones, and a light-mode UI is clipped
# white while a dark one is clipped black -- there are no midtones to move.
# Solving for the gamma that lands each median on a common target gives 0.03
# for WEB and 2.96 for MOBILE, values that do not adjust an image, they
# obliterate it.
#
# +level lo,hi -- COMPRESSING each input into a narrower output range -- does
# land the medians together, and that is what this file did for one revision.
# It is wrong, and the number that says so is the standard deviation:
#
#                    +level (compress)      -level (expand)
#   AI_PLATFORM      median 0.48 std 0.05   median 0.50 std 0.13
#   MOBILE           median 0.47 std 0.07   median 0.45 std 0.20
#
# Against 03's plates at std 0.12-0.22, a std of 0.05 is not a photograph, it
# is a wash. Compression is the wrong direction: these sources have all their
# information inside a NARROW band already, and squeezing that band flattens
# what little separation the picture had.
#
# -level lo,hi EXPANDS instead -- it stretches the range where each source's
# information actually lives out to full, and then the shared +level-colors
# band puts that back inside the book's ink. Contrast first, placement second.
# For the dark interfaces lo is near 0 and hi is around 0.2-0.26, which is
# where their pixels are. For the light ones hi runs ABOVE 100% (180%, 165%),
# which is the same operator saying "map 1.8 to white", and is how a white
# dashboard is brought down to the page without being flattened onto it.
#
# WHY EVERY CROP KEEPS ITS DARK SIDEBAR
#
# It is the only dark thing in a light-mode screenshot, and it is carrying the
# contrast. A crop of WEB past its sidebar measured std 0.050; the same crop
# with the sidebar in measures 0.152. Cropping into the sidebar and leaving a
# sliver is worse than either -- truncated nav labels down the edge read as a
# mis-crop rather than as an interface.
#
# WHY 1240x697
#
# 1240 and the 16:9 box are 03's too. The plate is the whole measure of a
# recto: ~460px at 1440x900, ~610 on a wide desktop, so 1240 lands exactly on
# a 2x display. Two of the crops are narrower than that and are upscaled by
# 10-15%, which is a little soft at 1:1 and invisible at the size it prints.
#
# 697 is not a rounding. The page reserves a strict 16:9 box and the image is
# object-fit: cover, so a file that is not 16:9 is silently cropped by the
# browser -- and what it crops is an edge of an interface. The crops below are
# 16:9 to within 0.1%, so the resize is forced exact (`!`) and the last
# fraction of a pixel is taken by the resampler rather than by the layout.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/apps/web/public/work"

# The two ends of the book's ink -- the same navy and the same silver
# build-process-plates.sh works between, and the same reach of it. See THE
# TONE IS 03'S above for why these are copied rather than tuned.
SHADOW='#233c58'
HIGHLIGHT='#dfe9f8'
SATURATION=62
SIGMOIDAL=5
WIDTH=1240
QUALITY=82
# Sigma 12 spreads a 10px source glyph over ~36px, and the resize is about
# 1:1, so this pass IS the redaction -- there is no downscale behind it to
# finish the job (see WHY THE DOWNSCALE IS NO LONGER THE BACKSTOP). Proved at
# 180% zoom on the output, not on the intermediate.
BLUR='0x12'

command -v magick >/dev/null || { echo "ImageMagick 7 (magick) is required" >&2; exit 1; }
mkdir -p "$OUT"

# name|source|slug|level|crop|blur boxes (space separated, WxH+X+Y in SOURCE px)
#
# `level` is the per-image `-level lo%,hi%` that runs BEFORE the shared band --
# see WHY -level AND NOT GAMMA above.
#
# Crops are the interface panel of each composition, measured off the source at
# half scale (836px wide, so displayed x2 = source), and every one is 16:9 to
# within 0.1% so the page's reserved box never has to crop again.
#
# THE BOTTOM EDGE OF EVERY CROP IS LOAD-BEARING. Immediately below three of
# them, still inside the source, sit a table of named clients against progress
# and dates (WEB: Vertex Industries, Bright Future Pvt. Ltd., Studio Moksha)
# and a paid invoice (SAAS: Studio Moksha, Nivlak Connect, Rs 15,000, Paid).
# They do not ship because the crop ends above them, not because anything
# blurs them. Extending a crop downward for a better composition puts them
# back. Check what is under an edge before you move it.
#
# The TOP edge is a separate job: all three desktop crops start below the
# browser chrome -- the traffic lights, the URL bar, the app title bar. 03's
# plates are photographs of screens in a room and carry no chrome at all, and
# a window frame is the one thing in these pictures that says "export from a
# mockup tool" rather than "software".
#
# MOBILE's crop is the one that had to be SOLVED rather than chosen, and the
# arithmetic is worth keeping because the same trap is in the other three.
# Measured by max-projection, its three phones occupy x 348-1444, y 68-866 --
# 1097 wide by 799 tall. The left-hand copy block ends at x=263, so the crop
# cannot start further left than ~275, which caps the width at ~1240 and
# therefore the 16:9 height at ~697. That is 100px SHORTER than the phones.
# So a crop of this composition cannot both exclude the copy and contain the
# phones: something bleeds, and the only question is whether it looks decided.
#
# The first crop (1337x752+274+105) answered that badly in both axes: 74px of
# margin on the left against 166 on the right, so the group sat visibly left
# of centre with a hole beside it, and a top edge 37px BELOW the middle
# phone's, so that phone was clipped by a hair at both ends -- the amount that
# reads as a mistake rather than as a frame.
#
# 1237x696+278+100 is even margins (70px each side of the group) with the
# bleed pushed entirely to the BOTTOM: all three status bars are intact, the
# outer two keep their whole nav bar and lose only the bezel below it, and the
# middle phone -- nearer the camera, and taller in frame for that reason --
# runs off the bottom edge. Shifting down to save its nav bar cuts the outer
# two's status bars; shifting up to clear it cuts their nav bars in half. This
# is the window between those.
#
# The blur boxes are in the SAME frame -- full source pixels, not offsets into
# the crop. They are applied before the crop, so a box measured relative to the
# cropped window lands somewhere else entirely: the first run of this file did
# exactly that, and the proof came back with every client name still legible
# and a smear over the revenue chart instead. Measure against the source.
PLATES=(
"WEB_APPLICATION|WEB_APPLICATION.png|web-application|25%,180%|1120x630+262+176|889x140+479+666 219x88+1167+304"
"AI_PLATFORM|AI_PLATFORM.png|ai-platform|2%,26%|976x549+314+144|"
"SAAS_PRODUCT|SaaS Product.png|saas-product|22%,165%|828x466+286+84|651x82+456+146 247x161+863+283 651x167+456+464 58x140+462+292"
"MOBILE_APPLICATION|MOBILE_APPLICATION.png|mobile-application|2%,20%|1237x696+278+100|96x28+422+720"
)

missing=0
for spec in "${PLATES[@]}"; do
  IFS='|' read -r _ src _ _ _ _ <<<"$spec"
  [ -f "$ROOT/$src" ] || { echo "missing source: $ROOT/$src" >&2; missing=1; }
done
[ "$missing" -eq 0 ] || { echo "put the four mockups at the repo root and re-run" >&2; exit 1; }

paper=$(magick "$ROOT/apps/web/public/frames/v5/hd/frame-091.webp" \
  -crop 1x1+1200+400 +repage -colorspace Gray -format "%[fx:mean]" info:)

printf '%-20s %10s  %8s  %8s  %s\n' SOURCE LEVEL MEDIAN STDDEV FILE
for spec in "${PLATES[@]}"; do
  IFS='|' read -r name src slug level crop boxes <<<"$spec"
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
    -level "$level" \
    -modulate "100,$SATURATION,100" \
    +level-colors "$SHADOW","$HIGHLIGHT" \
    -sigmoidal-contrast "$SIGMOIDAL,50%" \
    -strip -quality "$QUALITY" \
    "$dst"

  read -r median stddev w h < <(magick "$dst" -colorspace Gray \
    -format "%[fx:median] %[fx:standard_deviation] %w %h\n" info:)
  printf '%-20s %10s  %8.3f  %8.3f  %s (%sx%s, %s)\n' \
    "$name" "$level" "$median" "$stddev" "$slug.webp" "$w" "$h" \
    "$(du -h "$dst" | cut -f1)"

  # The one thing this script must never ship, same as the 03 plates: a plate
  # below the paper is a hole in the page. Fix that image's `level`, never
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

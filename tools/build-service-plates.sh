#!/usr/bin/env bash
# Turn the five service renders into page plates for spread 02, "What We Build".
#
# WHY THE SOURCES NEED WORK AT ALL
#
# The renders arrive looking like cut-outs and are not. Every one is a fully
# opaque 1536x1024 PNG whose "transparency" is a PAINTED checkerboard -- two
# near-white tones, #F5F5F5 and #F1F1F1, in 32px squares:
#
#   $ magick "AI Automation Solutions.png" -alpha extract \
#       -format "min=%[fx:minima]" info:
#   min=1                              <- opaque everywhere
#
# The book's pages are dark navy (#030914, GENERATED_LETTERBOX). Dropping these
# in as they came would put five light-grey checkered rectangles on the page,
# which is the one thing the rest of this book never does -- see the plate
# pipeline in fetch-plates.sh, which exists for exactly this reason.
#
# WHY FLOOD-FILL AND NOT A LUMINANCE KEY
#
# fetch-plates.sh keys its engravings by negating the scan and using it as its
# own alpha: dark line on pale paper, so brightness IS the mask. That is the
# wrong tool here and it fails visibly. These renders are dark artwork on a
# pale ground, so the same trick inverts correctly at the edges but eats the
# light parts INSIDE the artwork -- the white invoice in AI Automation, the
# white business card and the white "A" logo swatch in Branding all go
# transparent, and the plate arrives with holes in it.
#
# A corner flood-fill has no such problem. It removes only what is CONNECTED to
# the border, so an enclosed white card is untouched by construction, whatever
# its brightness. The four corners are seeded rather than one because the
# artwork of several renders touches an edge and splits the ground in two.
#
# WHY FUZZ 12%
#
# The checkerboard is two tones, so the tolerance has to span both, and the
# neon glow fades into the ground rather than stopping at it -- too tight a
# tolerance leaves that fade behind as a pale halo once the plate is composited
# onto navy. Judged on the composite, not on the cut-out:
#
#    6%   ground gone, visible pale fringe around the glow of every panel
#   12%   fringe gone, glow intact                                <- this
#   18%   fringe gone, outer glow measurably clipped back
#
# WHY SOME PLATES CARRY EXTRA SEEDS
#
# A flood-fill reaches only what is connected to the border, which is the whole
# point of using one -- and also its one failure. Where the artwork closes a
# ring around a piece of ground, that pocket survives, and on navy it is a pale
# slab. Mobile Application Development has two, both under the centre phone
# where its glow meets the row of stage cards below it:
#
#   $ magick ... -connected-components 8      # opaque AND still checker-toned
#   2453: 188x74+748+847   area 7121
#   2386: 161x73+583+837   area 5138
#
# SEEDS below are a point inside each, so they are worth exactly what the
# corner seeds are worth and no more.
#
# WHY THIS IS NOT DONE BY COLOUR INSTEAD
#
# Keying every near-white pixel would find those pockets without coordinates,
# and would also destroy artwork. The same scan finds two more blobs that must
# be KEPT -- the invoice in AI Automation (157x292+62+310) and the white logo
# swatch in Branding (118x107+824+268). They are not separable by tone: the
# invoice paper runs to 253 and the checker sits at 241-246, so any tolerance
# wide enough to catch the ground punches a hole in the document. Connectivity
# is the only thing that tells them apart, so connectivity is what is used.
#
# The audit at the end prints what is left. It cannot decide for you -- the
# four blobs above are all it will ever find in these five files, two to keep
# and two now seeded away -- but a re-render that strands a NEW pocket shows up
# there as a fifth, instead of shipping as a pale slab nobody looked for.
#
# WHY THE PLATES ARE TONED DOWN
#
# Keyed but untouched, these renders are still lit like screens in a dark room
# -- saturated neon with a bloom around every panel -- and the book's pages are
# matte navy with silver type on them. Dropped in raw the plate is the
# brightest thing on the spread by a wide margin, and the eye goes to it
# instead of to the heading, which is backwards for a catalogue where the
# picture supports the entry rather than being it.
#
# So they are printed rather than displayed: saturation pulled back, and the
# plate's BLACK POINT lifted to the colour of the paper. The lift is the part
# that matters and the part that took two goes to get right.
#
# WHAT THE PAPER ACTUALLY IS -- and how the first attempt got it wrong
#
# The first version darkened instead of lifting (colorize 22%, -6x-8) and was
# judged against a swatch of GENERATED_LETTERBOX, #030914. That is the colour
# of the letterbox around the book, not of the book. Sampled off a screenshot
# of the real spread, the photographed page is far lighter:
#
#   paper, blank lower verso     rgb( 18, 41, 68)
#   paper, blank lower recto     rgb( 23, 40, 67)
#   paper, higher up the page    rgb( 31, 51, 76)
#   body text ink                rgb( 48, 65, 88)
#   plate interior, as toned     rgb( 11, 20, 34)   <- DARKER than the paper
#
# So the plates came out darker than the page they sat on and read as holes
# punched in it. A picture printed on paper is never darker than the paper.
#
# Hence +level-colors: map the plate's black to #16304f -- a shade off the
# paper's own colour -- and leave its white alone. The dark UI panels come up
# to sit level with the page and the neon stays as the highlight, which is what
# ink on this stock would do. Judged composited over a CROP OF THE REAL PAGE,
# not over a flat swatch:
#
#   sat 58 / black -> #16304f          sits on the paper, UI still reads  <- this
#   sat 64 / black -> #1a3654 / -6     washed out; loses the screens
#   sat 70 / black -> #12294a / -4     more colour than the spread wants
#
# -channel RGB is not optional. +level-colors defaults to every channel, ALPHA
# INCLUDED, so without it the transparent surround is lifted along with the
# artwork and the plate arrives as a visible semi-opaque rectangle -- which is
# exactly the pasted-on box this whole pipeline exists to avoid.
#
# This is baked into the file rather than done with a CSS filter on the page.
# Two reasons: a filter is a grouping property, and the pages carry the 3D
# transforms the sheets turn on -- see the note in CLAUDE.md about opacity,
# overflow and filter forcing transform-style: flat -- and the sheets would
# have to pay for it on every scrubbed frame.
#
# WHY 900px WIDE
#
# The widest these are ever drawn is the image column of a page, ~34% of a
# half-spread; on a 2560px viewport that is about 430 CSS px, so 900 covers it
# at 2x. Bigger is waste on a page that already streams a 91-frame canvas.
#
# THE SOURCES ARE NOT IN THE REPO
#
# The five renders live at the repo root and are gitignored the way
# nivlak-book-opening.mp4 is: 8.4MB of PNG to regenerate 300KB of webp is not
# worth versioning, and the webps ARE committed, so a clone builds and deploys
# without them. This script is for when a render changes.
#
# Re-running is safe. Running it against its own OUTPUT is not -- the keying
# and the tone are both one-way -- so leave the sources where they are and let
# it overwrite public/services/ rather than feeding those files back in.

set -euo pipefail

cd "$(dirname "$0")/.."

SRC_DIR="."
OUT_DIR="apps/web/public/services"

# The ground is two near-white tones plus the glow fading into them; see above.
FUZZ=12
WIDTH=900
# The print treatment. See "WHY THE PLATES ARE TONED DOWN" above.
SATURATION=58
# The plate's new black: a shade off the photographed paper, so the darkest
# parts of the artwork sit level with the page instead of below it.
PAPER_BLACK="#16304f"
# The proof sheet's ground. Measured off the real spread, NOT
# GENERATED_LETTERBOX -- proofing against #030914 is what hid the last round's
# over-darkening, because everything looks light on near-black.
PAGE_BG="#142944"

# source file (as delivered) -> plate name (as the page asks for it)
PLATES=(
  "Web Application Development_1.png|web-application-development"
  "SaaS Product Development.png|saas-product-development"
  "AI Automation Solutions.png|ai-automation-solutions"
  "Mobile Application Development.png|mobile-application-development"
  "Branding & Digital Marketing.png|branding-digital-marketing"
)

# Extra flood-fill seeds, by plate name: ground the corners cannot reach.
# One point inside each stranded pocket, at source resolution. See above.
seeds_for() {
  case "$1" in
  mobile-application-development) echo "847,875 663,863" ;;
  *) echo "" ;;
  esac
}

command -v magick >/dev/null || {
  echo "need ImageMagick 7 (magick)" >&2
  exit 1
}

mkdir -p "$OUT_DIR"

for entry in "${PLATES[@]}"; do
  src="$SRC_DIR/${entry%%|*}"
  name="${entry##*|}"
  out="$OUT_DIR/$name.webp"

  [ -f "$src" ] || {
    echo "missing source: $src" >&2
    exit 1
  }

  # Guard the assumption the whole script rests on. If a future render arrives
  # with real transparency the flood-fill is a no-op and the failure is silent
  # -- a plate that looks right in the file and wrong on the page.
  opaque=$(magick "$src" -alpha extract -format "%[fx:minima==1]" info:)
  [ "$opaque" = "1" ] || echo "note: $name already carries alpha; keying anyway" >&2

  w=$(magick "$src" -format "%w" info:)
  h=$(magick "$src" -format "%h" info:)

  # The four corners, plus any pocket this plate closes off. Built as an array
  # so the seeds stay one -draw each, the same as the corners.
  fills=(
    -draw "alpha 0,0 floodfill"
    -draw "alpha $((w - 1)),0 floodfill"
    -draw "alpha 0,$((h - 1)) floodfill"
    -draw "alpha $((w - 1)),$((h - 1)) floodfill"
  )
  for seed in $(seeds_for "$name"); do
    fills+=(-draw "alpha ${seed} floodfill")
  done

  # Keyed but not yet toned. The audit below has to run against THIS, not
  # against the finished plate: the wash moves every near-white pixel off
  # #F3F3F3, so auditing the toned file finds nothing and reports success
  # whatever is actually left in it.
  keyed="${TMPDIR:-/tmp}/service-plate-keyed-$name.png"
  magick "$src" \
    -alpha set \
    -fuzz "${FUZZ}%" -fill none \
    "${fills[@]}" \
    -trim +repage \
    -resize "${WIDTH}x>" \
    "$keyed"

  # Audit: opaque pixels still the colour of the ground. Anything listed is
  # either white ARTWORK to keep or a pocket to add to SEEDS -- connectivity is
  # what tells them apart, so read the proof sheet before deciding. Blobs under
  # ~400px are edge pixels of the key itself and are not worth reporting.
  left=$(
    magick "$keyed" \
      \( +clone -alpha extract -threshold 50% \) \
      \( -clone 0 -alpha off -fuzz 3% -fill white -opaque "#F3F3F3" \
        -fill black +opaque white \) \
      -delete 0 -compose multiply -composite \
      -define connected-components:verbose=true \
      -define connected-components:area-threshold=400 \
      -connected-components 8 null: 2>/dev/null |
      awk 'NR > 1 && $5 ~ /^srgb\((99|100|255)/ { print "      " $2 "  area " $4 }'
  )

  magick "$keyed" \
    -modulate 100,"$SATURATION",100 \
    -channel RGB +level-colors "$PAPER_BLACK",white +channel \
    -define webp:alpha-quality=100 \
    -quality 86 \
    "$out"
  rm -f "$keyed"

  echo "$(magick "$out" -format '%wx%h' info:)  $(du -h "$out" | cut -f1)	$out"
  [ -n "$left" ] && {
    echo "    near-white regions left in $name (artwork, or a pocket to seed):"
    echo "$left"
  }
done

# A proof sheet, so the keying is judged on navy where it will live rather than
# on a white file browser where every fringe is invisible. Not shipped.
proof="${TMPDIR:-/tmp}/service-plates-on-page.png"
magick montage "$OUT_DIR"/*.webp \
  -background "$PAGE_BG" -tile 2x -geometry 640x+12+12 \
  "$proof"
echo "proof: $proof"

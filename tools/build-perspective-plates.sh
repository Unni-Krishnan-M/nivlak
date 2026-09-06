#!/usr/bin/env bash
# Cut the supplied Perspectives artwork into the seven plates of chapter 05.
#
# The source, PERSPECTIVES_VISUAL.png, is NOT in the repo -- it sits at the
# repo root like the other supplied artwork. 1672x941, an abstract editorial
# collage: interface panels, a radial dial, a wireframe cube, a world map over
# a bar chart, plots, dot grids and the rules connecting them.
#
# WHY THIS IS A MASK AND NOT A TONED PHOTOGRAPH
#
# build-process-plates.sh and build-work-plates.sh both exist to solve one
# problem: a rectangular photograph has a GROUND, and a ground that is darker
# than the page reads as a hole punched in it while one that is lighter reads
# as a label stuck on it. Both scripts spend their length compressing a source
# into the band between the book's navy and its silver, and build-process
# fails the build outright if a plate lands at or below the paper.
#
# None of that applies here, because this source is line work on a flat pale
# ground -- the same shape of thing as the engravings in fetch-plates.sh. So it
# is keyed the way those are: negate the luminance and ship the negative as a
# plain greyscale mask. The page paints the silver and uses this as a CSS mask,
# so what lands on the paper is the ARTWORK and the page's own photograph shows
# through everywhere else. There is no ground to tone, and no ground to get
# wrong.
#
# It is also why these files are greyscale with no alpha channel. The colour is
# one flat value and the only real information is the line work, so an alpha
# channel would be three redundant channels of overhead -- fetch-plates.sh's
# note on the compass rose has the byte counts.
#
# WHY THE INK IS CAPPED AT 50%, WHICH THE ENGRAVINGS ARE NOT
#
# This artwork is not only line work. Three of its panels are SOLID dark -- the
# interface at top left, the world map at centre right, the small plot at top
# right -- and a solid dark area negates to solid white, which is full opacity.
# Struck at full strength those three print as near-white blocks and become the
# brightest thing in the entire monograph, brighter than any headline on any
# page. Proofed against the real paper (#142944) in silver (#dce7f7):
#
#   x0.75   the three panels are white blocks; the page has holes in it
#   x0.62   better, still the lightest thing on the spread
#   x0.50   the panels read as tinted plates and the line work still carries
#
# A tonal operator cannot separate the two, because a hairline and a filled
# panel are the same black in the source. Capping the whole mask is therefore
# the right instrument and not a compromise: an engraving prints its lines and
# its solids in ONE ink, which is exactly what this does.
#
# WHY SIX CROPS AND NOT ONE PICTURE SIX TIMES
#
# The recto is a window and the six perspectives are what it shows. One image
# behind all six would make the window decoration -- the picture that does not
# change while everything around it does is the one the eye stops believing.
# Each crop is chosen for its subject: the dial for AI, the interface for
# technology, the wireframe for engineering, the measured grids for design, the
# map and its chart for business, the growth curve for the future. They are
# ASSOCIATIVE and not documentary, which abstract artwork is allowed to be --
# unlike 04's plates, which are pictures of software and are believed as
# evidence the moment they are seen.
#
# All six are cut 16:9 so the window is one box at every setting and nothing
# below it moves on a click.
#
# Three of them were re-cut after proofing the composite, which is the only way
# to judge one of these. The number that settles it is INK COVERAGE -- the mean
# of the mask, which is the fraction of the tile the silver actually reaches.
# The whole artwork measures 15.7%, because most of it is ground:
#
#   ai 44.7   engineering 29.5   design 29.8   technology 28.9
#   business 26.4   future 23.1   column 13.6
#
# Anything at or below the whole-image figure is a tile of empty page with a
# detail in the corner. DESIGN first overlapped TECHNOLOGY by half its width --
# two tiles of the same interface panel -- and moving it up onto the ruled
# frame and the dot grids both separated them and raised it from 22.5. FUTURE
# was the sparse one at 13.5 and now takes the growth curve, the texture square
# and the list panel together. BUSINESS is the calmest of the six and stays
# that way deliberately: its subject is the world-map panel, which is the
# largest SOLID in the artwork, so the tile is mostly one struck plate with the
# globe beside it. That reads as composition rather than as emptiness, which a
# corner detail on bare ground does not.
set -euo pipefail

SRC="${1:-PERSPECTIVES_VISUAL.png}"
OUT="apps/web/public/perspectives"

[ -f "$SRC" ] || { echo "missing source: $SRC (expected at the repo root)" >&2; exit 1; }
mkdir -p "$OUT"

# The house recipe from fetch-plates.sh -- flatten onto white FIRST (negating a
# transparent ground gives a blank plate), then negate and set the black and
# white points -- with the cap argued for above.
key() {
  magick "$SRC" -crop "$1" +repage \
    -background white -alpha remove -alpha off \
    -colorspace gray -negate -level 4%,60% -evaluate multiply 0.50 \
    -resize "$2" -define webp:lossless=false -quality 78 "$OUT/$3.webp"
  printf '    %-14s %-18s -> %s (%s bytes)\n' "$3" "$1" "$OUT/$3.webp" \
    "$(stat -c%s "$OUT/$3.webp")"
}

# name|crop in SOURCE pixels|output width
#
# Every crop is 640x360 so the six arrive at one ratio. 900px out: the window
# is ~430px on a 1440 recto and ~620px in the reduced-motion column, so this is
# about 1.5x the largest place any of them is printed.
# RETIRED, and deliberately not built any more.
#
#   ai           640x360+585+266    the radial dial
#   technology   640x360+265+145    the interface panel and its network
#   engineering  640x360+880+178    the isometric wireframe
#   design       640x360+380+120    the ruled frame and dot grids
#   business     640x360+900+400    the world-map plate and the globe
#   future       640x360+300+430    the growth curve on its grid
#
# Six 16:9 crops, one per perspective, shown one at a time in a window on the
# recto. The window is gone -- the chapter prints all six domains at once and
# spends its recto on the argument for them instead -- and six pictures on one
# spread would be six things competing with that argument. They are listed
# rather than deleted because the crops were measured against ink coverage and
# proofed on the real paper, which is work nobody should repeat: restoring one
# is a `key` line.

# The verso's column. Tall rather than wide because it stands beside the index
# in the outer margin of the left-hand page, which is the one part of that page
# with height to spare and no width at all.
#
# It was cut from the node network at the far left for one revision, which is
# the sparsest part of the drawing -- 13.6% ink against the whole image's 15.7
# -- and struck at 70% in a page-width of 150px it read as a smudge rather than
# as artwork. This band through the middle measures 24.0%: the interface panel,
# the dial and the plotted grid, which is enough line work to survive being
# printed narrow.
echo "  column (vertical, for the verso)"
key 420x760+450+120  520x  column

echo "  done -- $(ls "$OUT" | wc -l) files"

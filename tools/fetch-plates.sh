#!/usr/bin/env bash
# Fetch the public-domain engravings the book prints as plates, and turn them
# into silver line art on transparency.
#
# WHY THE PROCESSING IS WHAT IT IS
#
# An engraving is dark hatching on pale paper. The book's pages are dark navy.
# Printing the scan as-is would put a white rectangle on the page, so instead
# the image is NEGATED -- which makes the line work the bright part and the
# paper the dark part -- and that negative is used as its own alpha channel.
# The lines survive at full opacity, the paper drops to nothing, and what is
# left reads as engraved into the page rather than pasted onto it.
#
# WHY NOT EVERY OLD PICTURE WORKS
#
# The trick needs LINE, not tone. A painting or an illuminated manuscript has
# ink everywhere, so negating it yields a solid slab and the page gets a grey
# rectangle. That failure is measurable before you look: the mean brightness of
# the source is how much of the sheet is bare paper.
#
#   1748 Bowen compass rose (engraving)   0.800   works
#   1852 Vuillemin chart    (engraving)   0.823   works
#   "Studying astronomy"    (painting)    0.526   solid slab
#   "Invention of compass"  (painting)    0.242   solid slab
#
# PAPER_MIN below is the line that separates them. Anything under it is a
# picture of ink, not a picture of lines, and is rejected rather than shipped.
#
# WHY PATENT DRAWINGS
#
# The first pass used 18th-century engravings -- a compass rose, a
# cosmographical chart. They processed beautifully and were the wrong pictures:
# a 1748 mariner's compass on a page about shipping software is costume.
#
# Patent drawings solve both halves at once. They are line art on white, which
# is what this pipeline needs; they are public domain; and they are ABOUT THE
# DOMAIN -- Baudot's 1888 code table is the ancestor of every character
# encoding since, Bell's telegraphy sheet is what "connect" meant first, and a
# fractal antenna is how a signal gets out of a device now. They also already
# carry figure numbers and a sheet header, which is the same convention the
# pages set their own figures in.
#
# PROVENANCE
#
# All files are Wikimedia Commons, tagged Public domain, verified through the
# API's extmetadata LicenseShortName at fetch time, and credited on the page
# they print on.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/apps/web/public/plates"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

PAPER_MIN=0.68
UA='nivlak-site/1.0 (build script; contact nivlak.work@gmail.com)'

plate() { # name url
  local name="$1" url="$2"
  echo "==> $name"
  curl -sL -A "$UA" -o "$TMP/$name.src" "$url"

  local paper
  paper=$(magick "$TMP/$name.src" -colorspace gray -format '%[fx:mean]' info:)
  # awk, not bc: bc is not installed here and its absence made the guard pass
  # silently, which is precisely the failure this check exists to prevent.
  if awk -v p="$paper" -v m="$PAPER_MIN" 'BEGIN{exit !(p<m)}'; then
    echo "    REJECTED: paper brightness $paper < $PAPER_MIN -- tonal, not line art"
    return 1
  fi
  echo "    paper brightness $paper -- line art, keeping"

  # What ships is the NEGATIVE as a plain greyscale image, not an RGBA cut-out.
  # The page paints the colour and uses this as a CSS mask, because the colour
  # is one flat value and the only real information in the file is the line
  # work -- so an alpha channel is three redundant channels of overhead. On the
  # compass rose that is 236KB as RGBA against 84KB as a mask, for the same
  # picture.
  # -alpha remove FIRST, onto white. Some of these are GrayscaleAlpha with a
  # transparent ground rather than a white one, and negating transparency gives
  # you a blank plate -- which is exactly what the fractal antenna did until
  # this line existed.
  magick "$TMP/$name.src" -background white -alpha remove -alpha off \
    -colorspace gray -negate -level 3%,68% \
    -resize 620x620\> -define webp:lossless=false -quality 70 "$OUT/$name.webp"
  echo "    -> public/plates/$name.webp  ($(stat -c%s "$OUT/$name.webp") bytes)"
}

# 1888, J. M. E. Baudot -- printing telegraph code table, US 388,244.
plate plate-code \
  'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Baudot_Code_-_from_1888_patent.png/1280px-Baudot_Code_-_from_1888_patent.png'

# 2002, Vicsek fractal antenna, US 6,452,553 B1.
plate plate-antenna \
  'https://upload.wikimedia.org/wikipedia/commons/4/4e/6452553_Vicsek_Fractal_Antenna.png'

# 1876, A. G. Bell -- telegraphy, US 174,465.
plate plate-telegraphy \
  'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/Patent_Drawing_of_Telegraphy_by_Alexander_Graham_Bell_-_NARA_-_6120306_%28page_1%29.jpg/1280px-Patent_Drawing_of_Telegraphy_by_Alexander_Graham_Bell_-_NARA_-_6120306_%28page_1%29.jpg'

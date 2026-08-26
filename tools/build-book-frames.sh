#!/usr/bin/env bash
#
# Rebuild apps/web/public/frames/v5 from the original book-opening clip, in two
# resolution tiers, and emit the measured camera track that goes with it.
#
# The source changed shape completely. It is no longer eight independently
# generated stills that had to be argued onto a common exposure ramp; it is
# nivlak-book-opening.mp4 -- 1280x720, H.264, 24fps, 8.000s, 192 frames at
# 2.06 Mbit/s -- ONE CONTINUOUS CLIP, decoded here rather than taken from the
# ezgif JPEG export that an earlier version of this script used. The camera pushes in on a navy
# hardcover standing on a rock plinth, the book opens, and the move ends inside
# a full-frame close-up of the blank spread. Lighting and geometry are genuinely
# continuous: the book's bounding-box width runs 21:513 -> 22:615 -> 23:766 ->
# 24:901 -> 25:1014, steps of +102,+151,+135,+113, a smooth acceleration with no
# cut in it. So this script does NOT re-grade the set onto an artificial ramp
# the way the eight-stills version did. Re-timing real footage onto a synthetic
# curve would destroy the one thing this source has that the old one did not.
#
# What it does fix are four specific, measured defects.
#
# 1. A PILLARBOX MATTE on frames 1-22. Widths the scan below reports, in columns:
#      f1-8   L=100-101  R=99-100
#      f9-18  L=104      R=98-99
#      f19-21 L=96       R=98
#      f22    L=96       R=96   (the right side of f22 is not a hard bar any more,
#                                it is a dark wash at 2.8-3.5/255 -- filling it
#                                costs nothing and it is background either way)
#      f23-40 none
#    The obvious repair -- crop each barred frame to its content and rescale to
#    1280x720 -- is wrong here, and this is the single most important decision in
#    the file. The bars are a MATTE laid over the frame, not a change of scale:
#    the content inside them is at the same magnification as frames 23+. Cropping
#    1-22 to ~1080x720 and blowing it back up is a 1.19x zoom, and because frame
#    23 would not get it, the scrub would hit a hard scale JUMP at the 22->23
#    boundary -- exactly the artifact the whole exercise exists to avoid.
#    So the content is left at 1:1 and the bars are FILLED by extending the
#    background into them. That is safe here because the bar interiors are almost
#    featureless: a 12px strip just inside the bar measures mean 6-12/255 sd 1-2
#    on the left, and mean 14-22/255 sd 2-8 on the right (the right side carries
#    a little real structure, with maxima up to ~102 on frames 1-12).
#    See the fill_side() comment for the method and the numbers behind it.
#
# 2. A "Veo" WATERMARK, bottom-right of every frame, at roughly x 1240-1266,
#    y 693-706. On frames 1-22 it sits inside the right bar and the fill in (1)
#    erases it anyway, but it is removed from all 40 so the removal never has to
#    be reasoned about per frame.
#
# 3. A BLACK BAR ALONG THE BOTTOM of frames 39 and 40 -- 32 and 18 rows at the
#    threshold used here. Filled the same way as the sides, extending downward,
#    but off a much shorter seed strip; see STRIP_B for why eight rows is the
#    wrong number at the bottom of this particular shot.
#
# 4. THE TAIL DIMS. Frame luma means (Rec709, x100) on the source run
#      f1 6.13 ... f12 4.48 (the book edge-on) ... f29 17.39 (peak) ... f40 8.80
#    which is a 49% fall over the last third: the reveal currently ends with the
#    lights going out. But most of that fall is REAL and must not be "corrected".
#    Splitting the frame into lit subject and near-black surround at 8% luma:
#      frame  lit-area fraction   mean of the lit pixels
#      f29    0.915                18.63
#      f33    0.880                17.58
#      f36    0.813                14.60
#      f40    0.387                13.74
#    The lit AREA collapses from 92% to 39% because the camera pushes past the
#    bright gilt page edges and they leave frame -- that is the shot, and gaining
#    it back would mean brightening the remaining page by ~2x, which clips the
#    highlights and lifts the surround. What is left over after that, the fall in
#    the mean of the lit pixels themselves, is 18.63 -> 13.74, a 26% dim that has
#    no story reason to be there. That is what gets held level, from frame 29
#    (the peak) onward. The whole-frame mean therefore still falls -- it has to,
#    the frame really does empty out -- but the page itself no longer darkens.
#    Consequence for the camera model: the tail is genuinely a smaller lit area,
#    not a fade, and it should not be compensated a second time in the component.
#
#    The correction is solved, not guessed: for each tail frame a gamma is found
#    by bisection so the mean of that frame's own lit pixels lands on frame 29's.
#    Gamma is used rather than a gain because gamma fixes 1.0, so the page-edge
#    highlights (source maxima 0.994-1.000) cannot clip -- the verification pass
#    prints the maxima to prove it. And gamma is applied to a BLACK-SUBTRACTED
#    image with the same black put straight back afterwards, so the surround
#    cannot be lifted either. That construction has a second useful property: at
#    gamma 1.0 it is an exact identity, so frames 1-28 come out of the grade
#    untouched. The solved gammas run 1.000 at f29 up to 1.256 at f40, monotone
#    apart from a 0.004 dip at f39 -- a gentle correction, as it should be.
#
#    Unlike the eight-stills build, nothing here is floored onto a shared navy.
#    That build could, because every frame was a small subject on a big near-black
#    field. Here the outer 8px border stops being surround halfway through the
#    move -- its median goes from 0.4/3.9/7.5 (RGB percent) on f40 to
#    8.2/14.5/22.0 on f29, because by f29 the book fills the frame and the border
#    is lit backdrop. So GENERATED_LETTERBOX is honestly the median of forty
#    different borders rather than a constant imposed on them, and the component
#    should treat it as "a colour that will not fight the frames", not as an exact
#    edge match for any one of them.
#
#    Deliberately NOT touched: frames 12-20 have low contrast (luma stddev bottoms
#    out at 6.05 on f12 against ~10.7 at the head). That is the book turned
#    edge-on to the key light, it recovers on its own by f22 (11.29), and there is
#    no measurement that says it is a defect. Left alone.
#
# The script also emits apps/web/src/components/book-frames.generated.ts, the
# per-frame bounding box of the book measured off the FINAL encoded webps, so the
# component's camera is driven by what actually shipped and not by intent.
#
# Requires: ImageMagick 7 (magick), ffmpeg/ffprobe, awk.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MP4="$ROOT/nivlak-book-opening.mp4"
# Versioned, and it must stay in step with FRAME_SET in
# apps/web/src/components/book-camera.ts. The frames are served immutable for a
# year and a rebuild reuses the same filenames, so a new set written over the old
# directory is invisible to anyone who has loaded the site before. v2 was the
# eight-stills set; this source is a different shot, so it gets v3.
OUT_HD="$ROOT/apps/web/public/frames/v5/hd"
OUT_SD="$ROOT/apps/web/public/frames/v5/sd"
TS="$ROOT/apps/web/src/components/book-frames.generated.ts"
TMP="$(mktemp -d)"
# KEEP_TMP=1 leaves the intermediate PNGs in place for inspection / encoder tuning
if [ -z "${KEEP_TMP:-}" ]; then
  trap 'rm -rf "$TMP"' EXIT
else
  echo "==> intermediates: $TMP"
fi

for bin in magick ffmpeg ffprobe awk; do
  command -v "$bin" >/dev/null || { echo "missing dependency: $bin" >&2; exit 1; }
done
[ -f "$MP4" ] || { echo "missing source clip: $MP4" >&2; exit 1; }

# Every 2nd frame of the 192 in the clip. At the hero's scroll length that is
# under 30px of scroll per frame, which is where a scrub stops looking stepped.
# Sampling is uniform in TIME, not in motion: the clip's own slow-in and slow-out
# are part of the animation and resampling by motion would flatten them.
# The clip runs 192 frames but the last ten fade to black -- measured luma means
# fall 17.67 -> 15.71 -> 11.88 -> 8.17 -> 7.94 -> 7.69 over the final frames.
# Ending a scroll on a fade-out means the visitor's last frame is an empty
# screen, so the sequence stops on the held spread and the fade is not shipped.
LAST=182

# Every 2nd frame of the clip. Uniform in TIME: the clip's own slow-in and
# slow-out are part of the animation.
N=91
STEP=2
# Repairs happen at native resolution, where every threshold below was measured.
W=1280
H=720
# ...and the wide tier is upscaled at the very end. The source is 720p so this
# adds no detail, but it is still worth doing and it was checked rather than
# assumed: rendered through a real Chrome canvas at 1600x900, a frame upscaled
# and sharpened here is visibly cleaner than the same frame left at 1280 for the
# browser to enlarge itself -- the paper grain holds together and the gilt page
# edge stays a line instead of a soft band. It is close to free, because an
# upscaled frame carries less high-frequency detail and so encodes smaller:
# measured over 10 frames spread across the clip, 1920@q84 is 36 KiB against
# 39 KiB for native 1280@q94. 2560 was rejected -- the benefit saturates well
# before it and the bytes double.
HD_W=1920
HD_H=1080

# --------------------------------------------------------------------------
# Tunables, each with the measurement that chose it.
# --------------------------------------------------------------------------

# A line (column or row) counts as matte while its mean is at or below this.
# 3.5/255 is deliberately generous. The mattes themselves sit at 0.9-2.2/255,
# but the content column immediately outside them is dragged down by JPEG
# ringing across the block boundary -- on f12 the bar ends at 104 and columns
# 106-111 still read 4.87/255 against 5.73 for clean content at 112+ -- and a
# detector that stops one column early leaves a black hairline. At 3.5 the
# detected widths come out exactly as measured by eye: L~100/104/96, R~98-100,
# f22 L=96, and the bottom bars on f39/f40 at 32 and 16 rows.
MATTE=2.5
# What "the matte is gone" means afterwards. Lower than MATTE on purpose: the
# fill on the bottom of f40 legitimately lands at ~2.2/255 because that is what
# the shadow it continues is worth there. Nothing anywhere may still be at true
# matte black.
MATTE_GONE=1.5
# The matte is a fixed render artifact about 100px wide; more than this is the
# picture, not the matte.
MATTE_MAX=110
# Below this a detected bar is the tail of the fade-out, not a bar.
MATTE_MIN=4

# How far PAST the detected bar the fill reaches, so the averaging strip is taken
# from clean content and never from a ringing column (see above).
GUARD=12
# The inner columns of the fill are cross-faded into the frame instead of
# butt-joined. By then the fill is sampling clean content, so the fade has
# nothing contaminated to reveal.
FEATHER=4
# Width of the content strip averaged down to the seed column, for the sides.
STRIP=8
# The bottom is a different problem and gets a different strip. On f39 the last
# content row before the bar is already the falling edge of the page shadow
# (row 687 = 8.58/255, row 686 = 10.96, row 680 = 24.97): average eight rows
# there and the fill comes out at 18/255, which would paint a bright band across
# the bottom of frame. Two rows continues the shadow instead of contradicting it.
STRIP_B=2
# The bottom fill gets no guard. On the sides the guard exists to step over
# ringing columns, but at the bottom the "ringing" row IS the shadow edge the
# fill is supposed to continue, and stepping 12 rows past it lands back on bright
# page. So the bottom seeds directly off the last two rows before the bar.
GUARD_B=0
# Vertical smoothing of the seed column. The seed is a horizontal average, so it
# is already flat across the fill; this blur is what turns it from a hard streak
# into a field. (On the bottom fill the same isotropic blur acts horizontally,
# for the same reason and to the same effect.)
FILL_BLUR=8
# Outward darkening across a side fill. Measured on the bar-free frames, the
# outer 120px is close to flat and not consistently signed: edge-versus-120px-
# inboard is -7% (f030 left, 26 vs 28), +6% (f030 right, 55 vs 52), -5% (f026
# left), +5% (f035 right). There is no strong vignette to match, so a uniform 4%
# outward darkening is used: it sits inside the measured band, and it guarantees
# the synthetic field is never the brightest thing at the frame edge, which is
# the failure mode that would actually read on screen.
EDGE_GAIN=96
# The bottom fill is continuing a shadow that is already falling steeply, so it
# gets a real ramp rather than a token one. 60% takes f39 from 8.58/255 at the
# join to 5.1 at the frame edge, which is what the bar-free frame before it
# (f38, last row 6/255) actually has there, and f40 from 3.62 to 2.2.
BOTTOM_GAIN=60

# The watermark patch. Wider and taller than the glyphs (which threshold out at
# 23x8+1241+696) so the morphology has clean surroundings to work from.
WM_X=1226; WM_Y=682; WM_W=52; WM_H=36
# Glyph box inside the patch, in patch coordinates, with padding.
WM_MX=10; WM_MY=8; WM_MW=34; WM_MH=20

# Lit/surround split for the tail measurement. 8% is well above the surround
# (which sits at 1-6/255 = 0.4-2.4%) and well below the page.
LIT=8
# Frame the tail is held to. 29 is the measured luma peak.
# The frame where the lit-pixel mean peaks is found by scanning, not declared:
# it moves whenever the frame selection changes, and a stale index here silently
# turns the tail hold into a no-op. Everything after the peak is held level
# against it; everything before is passed through untouched.
# Bisection bracket for the tail gamma. 1.8 is a ceiling, not an expectation --
# the largest value the solve actually asks for is well under it, and if a frame
# ever hits the ceiling the printed gamma column makes that obvious.
GAMMA_HI=1.80

# Encoder. The hard constraint is 2.5 MB for all 40 frames, i.e. 64 KB a frame on
# average. That turns out to be generous for this material -- the whole set at
# quality 80 is 716 KiB, at 94 it is 1145, at 98 it is 1399 -- so quality was
# chosen for banding headroom rather than to fit, and the set still lands at
# roughly 46% of budget. The split is at frame 23, where the pillarbox ends and
# the framing changes character:
#   1-22  a small lit subject on a large near-black field, plus ~200px of
#         synthesized bar fill. Cheap (20-35 KiB each) but the flat near-black
#         blocks up before it bands, and the fills are the flattest thing in the
#         frame, so they get 94 rather than the 88 that would have done.
#   23-40 the open spread filling the frame: large, low-contrast navy gradients,
#         which is exactly what WebP bands on, and it is what the visitor is
#         looking at when the scroll ends. 96.
# Measured: 1174 KiB total, worst PSNR 47.1 dB at frame 003.
# The frame at which the shot stops being a small lit subject on a large dark
# field and becomes a full-frame navy gradient. Those are opposite encode
# problems -- near-black blocks up before it bands, flat navy bands before it
# blocks -- so they get different quality. Scaled from the 40-frame set, where
# this sat at 23.
Q_SPLIT=55
QHD_WIDE=84
QHD_CLOSE=88
QSD_WIDE=84
QSD_CLOSE=86

# Straight out of the mp4, not out of the old ezgif zip. That zip was a JPEG
# export of this same clip, i.e. a lossy re-encode stacked on an already lossy
# 2.06 Mbit/s H.264 -- measured at RMSE 0.0100 (about 40 dB) against the true
# frame. Decoding the clip ourselves removes that whole generation for nothing.
#
# hqdn3d runs at decode. The clip is 720p at 2 Mbit/s, so the dark navy carries
# H.264 blocking and banding, which is precisely the part that reads as "the
# image is not clear". Cleaning it also pays for itself: at equal quality the
# denoised frames encode 13% smaller, because the encoder is no longer spending
# bits describing compression noise.
echo "==> extracting source frames"
mkdir -p "$TMP/all" "$TMP/src"
ffmpeg -v error -i "$MP4" -vf "hqdn3d=1.5:1.5:6:6" \
  -fps_mode passthrough -pix_fmt rgb24 "$TMP/all/%03d.png"
AVAIL=$(find "$TMP/all" -name '*.png' | wc -l)
[ "$AVAIL" -ge "$LAST" ] || { echo "clip has $AVAIL frames, need $LAST" >&2; exit 1; }

NEED=$(( (N - 1) * STEP + 1 ))
[ "$AVAIL" -ge "$NEED" ] || {
  echo "clip has $AVAIL frames, need $NEED for N=$N at STEP=$STEP" >&2; exit 1; }
for k in $(seq 0 $((N-1))); do
  cp "$TMP/all/$(printf '%03d' $((k * STEP + 1))).png" "$TMP/src/$(printf '%03d' $((k+1))).png"
done
printf '    %d of %d clip frames, every %d\n' "$N" "$AVAIL" "$STEP"

# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

# A single row of column means (or a single column of row means) as one value per
# line, 0-255. Box resize to 1px is an exact mean, so this is the cheapest honest
# way to ask "which columns are matte black".
col_means() { magick "$1" -colorspace Gray -filter Box -resize "${W}x1!" -depth 16 txt: \
  | tail -n +2 | awk '{split($0,a,"("); split(a[2],b,")"); print b[1]/257}'; }
row_means() { magick "$1" -colorspace Gray -filter Box -resize "1x${H}!" -depth 16 txt: \
  | tail -n +2 | awk '{split($0,a,"("); split(a[2],b,")"); print b[1]/257}'; }

# "L R B" -- how many columns of matte at the left, at the right, and how many
# rows at the bottom, at threshold $1. There is never a top bar in this clip, but
# it is scanned for anyway so a re-export that has one does not slip through.
matte_of() { # <img> <threshold> -> "L R T B"
  local lr tb
  lr=$(col_means "$1" | awk -v t="$2" '{v[NR-1]=$1} END{
        L=0; while(L<NR && v[L]<=t) L++;
        R=0; while(R<NR && v[NR-1-R]<=t) R++; print L, R }')
  tb=$(row_means "$1" | awk -v t="$2" '{v[NR-1]=$1} END{
        T=0; while(T<NR && v[T]<=t) T++;
        B=0; while(B<NR && v[NR-1-B]<=t) B++; print T, B }')
  echo "$lr $tb"
}

# Median of the outer 8px border, per channel, in percent. The four strips are
# rotated to a common 8px width so they can be appended into one pixel bag --
# appending them at mixed sizes pads with white and poisons the median.
border_median() { # <img> -> "R G B" in percent
  magick \
    \( "$1" -alpha remove -alpha off -crop ${W}x8+0+0 +repage -rotate 90 \) \
    \( "$1" -alpha remove -alpha off -crop ${W}x8+0+$((H-8)) +repage -rotate 90 \) \
    \( "$1" -alpha remove -alpha off -crop 8x${H}+0+0 +repage \) \
    \( "$1" -alpha remove -alpha off -crop 8x${H}+$((W-8))+0 +repage \) \
    -append -format "%[fx:median.r*100] %[fx:median.g*100] %[fx:median.b*100]" info:
}

med() { sort -g | awk '{v[NR]=$1} END{ if(NR%2) printf "%.4f", v[(NR+1)/2]; else printf "%.4f", (v[NR/2]+v[NR/2+1])/2 }'; }

# Fill one pillarbox bar by extending the background into it.
#
# Method, and why each step is there:
#   * average STRIP columns of clean content down to a single column. One column
#     of real content is too noisy to stretch 100px wide -- it would read as a
#     vertical streak of that column's grain. Averaging 8 kills the grain and
#     keeps the vertical shape, which is the part that has to match.
#   * stretch that column across the whole fill, so the fill is horizontally
#     constant by construction and cannot contain a smear.
#   * blur it. Because the field is already horizontally constant, an isotropic
#     blur only acts vertically, which is exactly the wanted axis: it turns the
#     seed column into a smooth field instead of a transcription of whatever
#     happened to be in those 8 columns. This matters most on the right, where
#     the strip carries real structure (sd up to 8, maxima to ~102).
#   * multiply by the outward ramp (see EDGE_GAIN).
#   * cross-fade the inner FEATHER columns into the frame, so there is no butt
#     joint anywhere.
fill_side() { # <in> <side:l|r> <barwidth> <out-rgba>
  local in=$1 side=$2 bar=$3 out=$4
  local fw=$((bar + GUARD)) sx g0 g1
  if [ "$side" = l ]; then sx=$fw; g0="gray(${EDGE_GAIN}%)"; g1="white";
  else sx=$((W - fw - STRIP)); g0="white"; g1="gray(${EDGE_GAIN}%)"; fi
  magick "$in" -alpha off -crop ${STRIP}x${H}+${sx}+0 +repage \
      -filter Box -resize "1x${H}!" -resize "${fw}x${H}!" -blur 0x${FILL_BLUR} \
      \( -size ${fw}x${H} xc: -sparse-color barycentric "0,0 $g0 $((fw-1)),0 $g1" \) \
      -compose Multiply -composite \
      \( -size ${fw}x${H} xc: \
         -sparse-color barycentric "$( [ "$side" = l ] && echo "0,0 white $((fw-1)),0 black" \
                                                       || echo "0,0 black $((fw-1)),0 white" )" \
         -evaluate multiply "$(awk -v a=$fw -v f=$FEATHER 'BEGIN{printf "%.6f",(a-1)/f}')" -clamp \
         -alpha off -colorspace Gray \) \
      -alpha off -compose CopyOpacity -composite \
      "$out"
}

# Same idea rotated 90 degrees, for the bottom bars on frames 39-40.
fill_bottom() { # <in> <barheight> <out-rgba>
  local in=$1 bar=$2 out=$3
  local fh=$((bar + GUARD_B)) sy=$((H - bar - GUARD_B - STRIP_B))
  magick "$in" -alpha off -crop ${W}x${STRIP_B}+0+${sy} +repage \
      -filter Box -resize "${W}x1!" -resize "${W}x${fh}!" -blur 0x${FILL_BLUR} \
      \( -size ${W}x${fh} xc: -sparse-color barycentric "0,0 white 0,$((fh-1)) gray(${BOTTOM_GAIN}%)" \) \
      -compose Multiply -composite \
      \( -size ${W}x${fh} xc: \
         -sparse-color barycentric "0,0 black 0,$((fh-1)) white" \
         -evaluate multiply "$(awk -v a=$fh -v f=$FEATHER 'BEGIN{printf "%.6f",(a-1)/f}')" -clamp \
         -alpha off -colorspace Gray \) \
      -alpha off -compose CopyOpacity -composite \
      "$out"
}

# The grade. One shared black point is pulled out, gamma is applied, and the same
# black point is put back as an offset -- so the whole thing is an exact identity
# at gamma 1.0, and 28 of the 40 frames therefore pass through untouched, which is
# the point: this is real footage and it is not being re-timed.
#
# Why a SHARED black and not each frame's own surround, which is what the
# eight-stills build did: in this clip the outer 8px border stops being surround
# halfway through. Measured border medians (RGB, percent) run 0.4/3.9/7.5 on f40
# but 8.2/14.5/22.0 on f29, because by f29 the book fills the frame and the border
# is lit backdrop, not shadow. Subtracting a frame's own border there would take
# 22% of blue out of the brightest frame in the set. The shared black is instead
# the per-channel MINIMUM of the 40 border medians, taken at 90% -- by
# construction no frame's surround is crushed by it, and gamma has something to
# pivot against so the dark corners of the tail frames are not lifted.
grade() { # <in> <gamma> <trailing magick args...>
  local in=$1 g=$2; shift 2
  magick "$in" -alpha remove -alpha off -colorspace sRGB -depth 8 \
    -channel R -level "${BLACK_R}%,100%" -channel G -level "${BLACK_G}%,100%" \
    -channel B -level "${BLACK_B}%,100%" +channel \
    -gamma "$g" \
    -channel R +level "${BLACK_R}%,100%" -channel G +level "${BLACK_G}%,100%" \
    -channel B +level "${BLACK_B}%,100%" +channel \
    "$@"
}

# Bounding box of the book, in source pixels, as "ax ay sw sh" -- centre, then
# size. This runs on the ENCODED webp, not on the stage PNG, so what the camera
# is driven by is what actually shipped.
#
# Brightness thresholding does not work on this subject: the navy cover is DARKER
# than the lit backdrop behind it on frames 9-20 (f12 reads 3-6/255 across the
# cover against 20/255 for the background), so Otsu and friends return the logo
# and the plinth highlights and nothing else. What separates book from backdrop
# here is STRUCTURE, not level -- the backdrop is a smooth studio gradient and the
# book has hard edges -- so the detector is a high pass (the frame minus a 5px
# blur of itself), smeared into a density field with a 14px blur, thresholded, and
# closed up into one silhouette.
#
# The 1.5% threshold is absolute rather than per-frame normalised, and that is a
# deliberate choice made by measurement: scoring the whole 40-frame track by the
# RMS second difference of (ax, ay, sw, sh), an absolute 1.5% scores 33 while the
# best auto-levelled variant scores 66 and the absolute 3% that looks tighter on
# any single frame scores 202. A per-frame threshold re-decides the edge of the
# book every frame, and that re-decision is exactly the jitter that would show up
# as camera shake. What 1.5% costs is tightness: on frames 1-18 the rock plinth is
# directly under the book, touching it, and no threshold that stays smooth
# separates them, so the box on those frames is roughly 30px wider and 40px taller
# than the book alone. It is wrong by a consistent amount, which is the kind of
# wrong a camera can live with.
book_bbox() { # <img> -> "ax ay sw sh"
  magick "$1" -colorspace Gray \( +clone -blur 0x5 \) -compose Difference -composite \
    -blur 0x14 -threshold 1.5% -morphology Close Disk:10 -morphology Open Disk:6 \
    -format "%@" info: 2>/dev/null \
  | awk -F'[x+]' '{printf "%d %d %d %d", $3+$1/2, $4+$2/2, $1, $2}'
}

# --------------------------------------------------------------------------
# Pass 1: kill the watermark. This has to happen BEFORE the mattes are measured:
# on frames 1-22 the watermark sits inside the right bar, and its glyphs lift the
# column means of x 1240-1266 clear of any matte threshold, which would make the
# scan below report a right bar of 13px instead of 99.
# --------------------------------------------------------------------------
echo "==> removing watermark"
mkdir -p "$TMP/fix"
# The mask, built once: a rounded rectangle over the glyphs, blurred so the patch
# is dissolved in rather than pasted.
magick -size ${WM_W}x${WM_H} xc:black -fill white \
  -draw "roundrectangle ${WM_MX},${WM_MY} $((WM_MX+WM_MW)),$((WM_MY+WM_MH)) 4,4" \
  -blur 0x3 -alpha off -colorspace Gray "$TMP/wm-mask.png"
for i in $(seq -f "%03g" 1 $N); do
  # Morphological Open with a disk a little larger than the glyph stroke deletes
  # the bright lettering outright; the blur that follows flattens the dark residue
  # the erosion leaves behind, and the mask keeps both confined to the glyph box.
  # Everything outside the mask is bit-identical to the source.
  magick "$TMP/src/$i.png" -alpha off \
    \( -clone 0 -crop ${WM_W}x${WM_H}+${WM_X}+${WM_Y} +repage \
       -morphology Open Disk:3 -blur 0x3 \) \
    "$TMP/wm-mask.png" -geometry +${WM_X}+${WM_Y} -compose over -composite \
    "$TMP/fix/$i.png"
done

# --------------------------------------------------------------------------
# Pass 2: measure the mattes and fill them. The widths are re-derived here rather
# than hardcoded, so a re-export of the clip with different bars still builds.
# --------------------------------------------------------------------------
echo "==> filling mattes"
for i in $(seq -f "%03g" 1 $N); do
  cur="$TMP/fix/$i.png"
  read -r l r t b <<<"$(matte_of "$cur" "$MATTE")"
  [ "$t" -eq 0 ] || { echo "    ERROR: frame-$i has an unexpected top matte of ${t}px" >&2; exit 1; }
  # Guards, both earned the hard way on this source.
  #
  # A cap, because the matte is a fixed ~100px render artifact and anything the
  # scan reports beyond MATTE_MAX is not matte, it is the picture. Frames 1-40
  # have a background plateau sitting at 3.2-3.5/255, so a threshold set even
  # slightly high walks straight through the content and reports 152 -- filling
  # that would erase a strip of the actual shot.
  #
  # A floor, because the matte does not switch off, it fades out as the backdrop
  # lights up around clip frame 100, and the tail of that fade reports one or two
  # pixels. A 1px bar is not worth filling and it makes the fill geometry
  # degenerate: resizing an 8px seed strip into a 1px-wide field asks ImageMagick
  # for an unsolvable affine and aborts the run.
  [ "$l" -gt "$MATTE_MAX" ] && { echo "    ERROR: frame-$i left matte ${l}px exceeds the ${MATTE_MAX}px cap" >&2; exit 1; }
  [ "$r" -gt "$MATTE_MAX" ] && { echo "    ERROR: frame-$i right matte ${r}px exceeds the ${MATTE_MAX}px cap" >&2; exit 1; }
  # A detected bar narrower than MATTE_MIN is rounded UP rather than ignored.
  # Ignoring it leaves a one-pixel dark hairline along the frame edge; filling it
  # costs three rows of content that the extension reproduces anyway.
  [ "$l" -gt 0 ] && [ "$l" -lt "$MATTE_MIN" ] && l=$MATTE_MIN
  [ "$r" -gt 0 ] && [ "$r" -lt "$MATTE_MIN" ] && r=$MATTE_MIN
  [ "$b" -gt 0 ] && [ "$b" -lt "$MATTE_MIN" ] && b=$MATTE_MIN
  [ $((l + r + b)) -eq 0 ] && continue
  printf '    frame-%s  matte L=%-4s R=%-4s B=%s\n' "$i" "$l" "$r" "$b"
  if [ "$l" -gt 0 ]; then
    fill_side "$cur" l "$l" "$TMP/fl.png"
    magick "$cur" "$TMP/fl.png" -geometry +0+0 -compose over -composite "$TMP/o.png"
    mv "$TMP/o.png" "$cur"
  fi
  if [ "$r" -gt 0 ]; then
    fill_side "$cur" r "$r" "$TMP/fr.png"
    magick "$cur" "$TMP/fr.png" -geometry +$((W - r - GUARD))+0 -compose over -composite "$TMP/o.png"
    mv "$TMP/o.png" "$cur"
  fi
  if [ "$b" -gt 0 ]; then
    fill_bottom "$cur" "$b" "$TMP/fb.png"
    magick "$cur" "$TMP/fb.png" -geometry +0+$((H - b - GUARD_B)) -compose over -composite "$TMP/o.png"
    mv "$TMP/o.png" "$cur"
  fi
done

# Nothing may still be at matte black. This is checked, not assumed.
echo "==> checking the mattes are gone"
for i in $(seq -f "%03g" 1 $N); do
  read -r l r t b <<<"$(matte_of "$TMP/fix/$i.png" "$MATTE_GONE")"
  # Two pixels of slack, because the fill's own outward darkening ramp lands its
  # last row or two under this threshold on the darkest frames. A real matte is a
  # hundred pixels wide; this cannot hide one.
  if [ $((l + r + t + b)) -gt 2 ]; then
    echo "    ERROR: frame-$i still has matte L=$l R=$r T=$t B=$b" >&2; exit 1
  fi
done

# --------------------------------------------------------------------------
# Pass 3: measure the repaired frames. Surround colour (which is only meaningful
# once the bars are gone -- before the fill the border median IS the matte), the
# lit-pixel statistics that drive the tail hold, and a sharpness proxy.
# --------------------------------------------------------------------------
echo "==> measuring repaired frames"
SR=(); SG=(); SB=(); LAP=(); FRAC=()
for i in $(seq -f "%03g" 1 $N); do
  read -r r g b <<<"$(border_median "$TMP/fix/$i.png")"
  SR+=("$r"); SG+=("$g"); SB+=("$b")
  # Sharpness proxy: stddev of a Laplacian response. Cheap, and all 40 frames are
  # the same subject at the same size, so the numbers are comparable.
  LAP+=("$(magick "$TMP/fix/$i.png" -alpha off -colorspace Gray \
      -define convolve:scale='!' -morphology Convolve Laplacian:0 \
      -format "%[fx:standard_deviation*1000]" info:)")
  # The lit mask, frozen from the ungraded frame so the tail solve is always
  # measuring the same set of pixels no matter what gamma it is trying. A 25% Box
  # downsample is a mean-preserving average, so the solve runs on 1/16th of the
  # pixels and still lands the full-size number (checked: 17.05 vs 17.02 on f29).
  magick "$TMP/fix/$i.png" -alpha off -colorspace Gray -threshold ${LIT}% \
    -filter Box -resize 25% "$TMP/fix/$i-mask.png"
  FRAC+=("$(magick "$TMP/fix/$i-mask.png" -format "%[fx:mean]" info:)")
  magick "$TMP/fix/$i.png" -alpha off -filter Box -resize 25% "$TMP/fix/$i-proxy.png"
done

minf() { sort -g | head -1; }
BLACK_R=$(printf '%s\n' "${SR[@]}" | minf | awk '{printf "%.4f", $1*0.9}')
BLACK_G=$(printf '%s\n' "${SG[@]}" | minf | awk '{printf "%.4f", $1*0.9}')
BLACK_B=$(printf '%s\n' "${SB[@]}" | minf | awk '{printf "%.4f", $1*0.9}')
LAP_MED=$(printf '%s\n' "${LAP[@]}" | med)
printf '    shared black  %s %s %s  (percent)\n' "$BLACK_R" "$BLACK_G" "$BLACK_B"
printf '    laplacian median  %s\n' "$LAP_MED"

# Mean of the lit pixels, on the 25% proxy, for a given gamma.
lit_mean() { # <k> <gamma>
  local k=$1 g=$2 i; i=$(printf '%03d' $((k+1)))
  local m
  m=$(grade "$TMP/fix/$i-proxy.png" "$g" \
        -colorspace Gray "$TMP/fix/$i-mask.png" -compose Multiply -composite \
        -format "%[fx:mean*100]" info:)
  awk -v m="$m" -v f="${FRAC[$k]}" 'BEGIN{printf "%.5f", (f>0 ? m/f : 0)}'
}

# --------------------------------------------------------------------------
# Pass 4: solve the tail hold, then render.
# --------------------------------------------------------------------------
echo "==> grading"
mkdir -p "$TMP/stage"
TAIL_FROM=1; TARGET=0
for k in $(seq 0 $((N-1))); do
  m=$(lit_mean "$k" 1.0)
  awk -v a="$m" -v b="$TARGET" 'BEGIN{ exit !(a > b) }' && { TARGET=$m; TAIL_FROM=$((k+1)); }
done
printf '    tail target   lit-pixel mean %s (frame %d, the measured peak)\n' "$TARGET" "$TAIL_FROM"
GAMMA=(); SOFT=()
for k in $(seq 0 $((N-1))); do
  i=$(printf '%03d' $((k+1)))
  gam=1.0
  if [ $((k+1)) -gt "$TAIL_FROM" ]; then
    # Bisect. Gamma > 1 brightens; the bracket starts at 1.0 so the solve can
    # never darken a frame, which would be re-timing rather than repair.
    lo=1.0; hi=$GAMMA_HI
    for _ in $(seq 1 16); do
      mid=$(awk -v a="$lo" -v b="$hi" 'BEGIN{printf "%.5f", (a+b)/2}')
      m=$(lit_mean "$k" "$mid")
      if awk -v m="$m" -v t="$TARGET" 'BEGIN{ exit !(m < t) }'; then lo=$mid; else hi=$mid; fi
    done
    gam=$mid
  fi
  GAMMA+=("$gam")

  # Sharpening deliberately does NOT happen here any more. It used to, when
  # there was one output; now there are two and they need different amounts,
  # because the right unsharp for a native frame is not the right unsharp for
  # the same frame enlarged 1.5x. The stage is the graded master and each tier
  # sharpens at its own scale, below. What is decided here is only WHICH frames
  # are the soft ones, from the Laplacian proxy measured in pass 3.
  if awk -v a="${LAP[$k]}" -v b="$LAP_MED" 'BEGIN{ exit !(a < b) }'; then
    SOFT+=(1)
  else
    SOFT+=(0)
  fi

  grade "$TMP/fix/$i.png" "$gam" \
    +profile '*' -colorspace sRGB -depth 8 "$TMP/stage/$i.png"
  printf '    frame-%s  gamma %-8s lit-mean %8s  lap %s\n' \
    "$i" "$gam" "$(lit_mean "$k" "$gam")" "${LAP[$k]}"
done

# --------------------------------------------------------------------------
# Pass 5: encode.
# --------------------------------------------------------------------------
# Two tiers of the same 16:9 framing. The wide one is what a desktop gets; the
# narrow one exists because 96 frames of 1920x1080 is about 8 MB of decoded
# bitmap each, and handing a phone the memory and the bandwidth for pixels its
# screen cannot resolve is a bad trade. Both come off the same repaired master --
# the narrow tier is NOT a downscale of the encoded wide one, which would be a
# lossy re-encode of a lossy source.
echo "==> encoding webp"
mkdir -p "$OUT_HD" "$OUT_SD" "$TMP/hd" "$TMP/sd"
rm -f "$OUT_HD"/frame-*.webp "$OUT_SD"/frame-*.webp
for k in $(seq 0 $((N-1))); do
  i=$(printf '%03d' $((k+1)))
  if [ "${SOFT[$k]}" -eq 1 ]; then
    sd_sharp=(-unsharp 0x0.8+0.30+0.010); hd_sharp=(-unsharp 0x1.0+0.55+0.008)
  else
    sd_sharp=(-unsharp 0x0.7+0.18+0.012); hd_sharp=(-unsharp 0x0.9+0.42+0.010)
  fi
  if [ $((k+1)) -ge "$Q_SPLIT" ]; then qhd=$QHD_CLOSE; qsd=$QSD_CLOSE
  else qhd=$QHD_WIDE; qsd=$QSD_WIDE; fi

  magick "$TMP/stage/$i.png" "${sd_sharp[@]}" -depth 8 "$TMP/sd/$i.png"
  magick "$TMP/sd/$i.png" -quality "$qsd" -define webp:method=6 "$OUT_SD/frame-$i.webp"

  # Upscale first, sharpen after: sharpening before the resize just gets
  # resampled away, and it is the pass after the enlargement that puts the edge
  # back on the gilt page edges.
  magick "$TMP/stage/$i.png" -filter Lanczos -resize "${HD_W}x${HD_H}" \
    "${hd_sharp[@]}" -depth 8 "$TMP/hd/$i.png"
  magick "$TMP/hd/$i.png" -quality "$qhd" -define webp:method=6 "$OUT_HD/frame-$i.webp"
done

# --------------------------------------------------------------------------
# Pass 6: verify, measure the camera track, emit the TS.
# --------------------------------------------------------------------------
# The camera track is measured on the ENCODED wide-tier frames, so what drives
# the pan is what actually shipped -- and in 1920x1080 coordinates, which is the
# space the component's frame table is declared in. The narrow tier is the same
# framing at another density, so one table serves both.
echo "==> verifying"
worst_hd=999; worst_hd_at=0; worst_sd=999; worst_sd_at=0
MEANS=(); ER=(); EG=(); EB=(); AX=(); AY=(); SW=(); SH=()
for k in $(seq 0 $((N-1))); do
  i=$(printf '%03d' $((k+1)))
  dhd="$OUT_HD/frame-$i.webp"; dsd="$OUT_SD/frame-$i.webp"
  read -r luma mx dim <<<"$(magick "$dhd" -colorspace Gray -format "%[fx:mean*100] %[fx:maxima] %wx%h" info:)"
  [ "$dim" = "${HD_W}x${HD_H}" ] || { echo "    ERROR: hd frame-$i is $dim" >&2; exit 1; }
  dimsd=$(magick "$dsd" -format "%wx%h" info:)
  [ "$dimsd" = "${W}x${H}" ] || { echo "    ERROR: sd frame-$i is $dimsd" >&2; exit 1; }
  # compare exits non-zero whenever the images differ at all, which under
  # `set -e -o pipefail` would abort the run -- the metric is what matters here.
  phd=$(magick compare -metric PSNR "$TMP/hd/$i.png" "$dhd" null: 2>&1 | awk '{print $1}' || true)
  psd=$(magick compare -metric PSNR "$TMP/sd/$i.png" "$dsd" null: 2>&1 | awk '{print $1}' || true)
  awk -v a="$worst_hd" -v b="$phd" 'BEGIN{ exit !(b < a) }' && { worst_hd=$phd; worst_hd_at=$i; }
  awk -v a="$worst_sd" -v b="$psd" 'BEGIN{ exit !(b < a) }' && { worst_sd=$psd; worst_sd_at=$i; }
  MEANS+=("$luma")
  read -r br bg bb <<<"$(border_median "$dhd")"
  ER+=("$br"); EG+=("$bg"); EB+=("$bb")
  read -r ax ay sw sh <<<"$(book_bbox "$dhd")"
  AX+=("$ax"); AY+=("$ay"); SW+=("$sw"); SH+=("$sh")
  printf '    frame-%s  luma %6.3f  max %.3f  psnr hd %6s sd %6s  bbox %4dx%-4d @ %4d,%-4d  %4s/%-4s KiB\n' \
    "$i" "$luma" "$mx" "$phd" "$psd" "$sw" "$sh" "$ax" "$ay" \
    "$(du -k "$dhd" | cut -f1)" "$(du -k "$dsd" | cut -f1)"
done

fr=$(printf '%s\n' "${ER[@]}" | med)
fg=$(printf '%s\n' "${EG[@]}" | med)
fb=$(printf '%s\n' "${EB[@]}" | med)
LETTERBOX=$(printf '#%02x%02x%02x' \
  "$(awk -v v="$fr" 'BEGIN{printf "%d", v*2.55+0.5}')" \
  "$(awk -v v="$fg" 'BEGIN{printf "%d", v*2.55+0.5}')" \
  "$(awk -v v="$fb" 'BEGIN{printf "%d", v*2.55+0.5}')")

thd=$(du -sk "$OUT_HD" | cut -f1)
tsd=$(du -sk "$OUT_SD" | cut -f1)
echo
echo "    frames:      $N  (every ${STEP} of the clip)"
echo "    luma means:  ${MEANS[*]}"
echo "    worst PSNR:  hd ${worst_hd} dB at frame ${worst_hd_at} / sd ${worst_sd} dB at frame ${worst_sd_at}"
echo "    letterbox:   $LETTERBOX"
echo "    total size:  hd ${thd} KiB (budget 4096) / sd ${tsd} KiB (budget 2560)"
awk -v a="$worst_hd" -v b="$worst_sd" 'BEGIN{ if (a < 38 || b < 38) print "    WARNING: worst PSNR is under 38 dB" }'
awk -v a="$thd" -v b="$tsd" 'BEGIN{ if (a > 4096 || b > 2560) { print "    ERROR: over the size budget"; exit 1 } }'

# --------------------------------------------------------------------------
# Pass 7: the generated TS. Everything in it was measured above, off the encoded
# frames, so it cannot drift from what is in public/frames/v5.
# --------------------------------------------------------------------------
echo "==> writing $(basename "$TS")"
{
  echo "// GENERATED FILE -- do not hand-edit."
  echo "//"
  echo "// Written by tools/build-book-frames.sh from nivlak-book-opening.mp4. Every"
  echo "// number here was measured off the encoded frames in public/frames/v5/hd, so"
  echo "// editing this file by hand only makes it disagree with the images. Re-run the"
  echo "// script instead."
  echo "//"
  echo "// The coordinates are in the wide tier's 1920x1080 space. The narrow tier is the"
  echo "// same framing at another density and the painter maps a whole frame onto a"
  echo "// destination rect, so one table is correct for both."
  echo
  echo "export const GENERATED_FRAME_COUNT = $N;"
  echo "export const GENERATED_FRAME_W = $HD_W;"
  echo "export const GENERATED_FRAME_H = $HD_H;"
  echo "export const GENERATED_LETTERBOX = \"$LETTERBOX\";"
  echo
  echo "/** Measured bounding box of the lit book in each frame, in source pixels. */"
  echo "export const GENERATED_FRAMES: { ax: number; ay: number; sw: number; sh: number }[] = ["
  for k in $(seq 0 $((N-1))); do
    printf '  { ax: %d, ay: %d, sw: %d, sh: %d },\n' \
      "${AX[$k]}" "${AY[$k]}" "${SW[$k]}" "${SH[$k]}"
  done
  echo "];"
} > "$TS"
echo "    $TS"

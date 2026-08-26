#!/usr/bin/env python3
"""Put the real Nivlak logo on the book cover, in place, in the shipped frames.

The book-opening clip that build-book-frames.sh decodes was generated with an
APPROXIMATION of the logo printed on the cover: an N of the right weight with a
circuit-tree in the counter, but not our tree -- the branches wander, the nodes
are the wrong size, and it is not the mark in logo.jpeg. This script replaces
that painted-on mark, frame by frame, with the real one.

It runs on the ENCODED webps in public/frames/v5, not on the mp4, because the
mp4 is not in the repo. That means one extra lossy generation on the frames it
touches; measured PSNR against its own render is ~50 dB, well clear of the 38 dB
floor build-book-frames.sh holds itself to, and the re-encode comes out slightly
SMALLER than the original frame because the cover it paints is smoother than the
one it painted over. Re-running the script is safe but not idempotent-free: each
run re-encodes, so restore from git before a second run.

    git checkout apps/web/public/frames/v5 && tools/stamp-book-logo.py

Needs numpy and opencv (pip install numpy opencv-python-headless) and ImageMagick
for the encode, so that the webp settings are literally the ones in
build-book-frames.sh rather than a second opinion about them.

HOW THE MARK IS FOUND

Two trackers, because one does not cover the whole shot.

  Frames 1-30, mask fit. The mark is the brightest thing on the cover and it is
  one connected blob, so an Otsu threshold inside a window carried from the
  previous frame isolates it. The real logo's silhouette is then fitted onto
  that blob with ECC (affine). This is the accurate tracker -- it re-anchors on
  the mark itself every frame, so it cannot drift -- and it holds a correlation
  of 0.92-0.95 for as long as the cover faces the camera.

  Frames 31-36, plane tracking. Past frame 30 the cover has turned far enough
  that the mark is a narrow sliver, the silhouette fit falls to 0.72 and starts
  returning a mark WIDER than the one in the picture. So the fit is dropped and
  the cover is tracked instead: a homography measured between consecutive frames
  over the cover patch -- which still has the mark and the NIVLAK wordmark in it
  to lock onto -- and chained onto the last good fit. That scores 0.95-0.997.
  It stops when it drops below TRACK_OK, which is frame 37 for the wide tier and
  36 for the narrow one; by then the cover is edge-on and the mark is a dozen
  dark pixels, so the last frame or two keep the original and no one can tell.

Jitter was measured, not assumed: over frames 1-30 the stamped mark's centroid
has an RMS second difference of 1.18px against the original mark's 1.20px, and
less area jitter. The stamp is exactly as steady as the footage it sits in.

HOW THE MARK IS PAINTED

The old mark is not painted over, it is removed. Its silhouette plus the new
one, dilated, is cut out of the frame and refilled by a push-pull pyramid over
the surrounding cover -- which is a smooth navy gradient, so the fill is
invisible. cv2.inpaint was tried first and is wrong here: Telea pulls from the
dark contour the printed mark sits in and leaves an N-shaped bruise on the
cover, which then shows as a halo around the new logo.

Brightness is not a constant. The cover goes from 254 to 53 over the shot as it
turns out of the key light, so the decal is scaled per frame, per channel, by
the ratio between the frame's own mark core and the logo's -- which picks up the
grade's blue cast for free.
"""

import os
import subprocess
import sys

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGO = os.path.join(ROOT, "logo.jpeg")
TIERS = {
    "hd": os.path.join(ROOT, "apps/web/public/frames/v5/hd"),
    "sd": os.path.join(ROOT, "apps/web/public/frames/v5/sd"),
}

# Correlation floors. ECC_OK is where the silhouette fit stops being trusted and
# the plane tracker takes over; TRACK_OK is where the plane tracker stops being
# trusted and the run ends. Both are set from the measured runs -- the good
# frames sit at 0.92+/0.95+ and the bad ones fall off a cliff to 0.72/0.40, so
# there is a wide gap to put a threshold in.
ECC_OK = 0.88
TRACK_OK = 0.93
LAST_FRAME = 40  # never past here; the cover is shut and gone by ~37

# From build-book-frames.sh. Every frame this script touches is before Q_SPLIT,
# so the wide-shot quality is the only one that applies -- but the split is kept
# here so the two files cannot silently disagree.
Q_SPLIT = 55
QHD_WIDE, QHD_CLOSE = 84, 88
QSD_WIDE, QSD_CLOSE = 84, 86


def build_decal():
    """The logo, cut out of its photographic background as RGB + alpha.

    logo.jpeg is a lit metal badge on a black textured card, so Otsu separates
    badge from card cleanly. The alpha is the OUTER contour, filled: the dark
    circuit grooves inside the N are part of the artwork, and taking them as
    holes would show cover through them.
    """
    logo = cv2.imread(LOGO).astype(np.float32)
    gray = cv2.cvtColor(logo.astype(np.uint8), cv2.COLOR_BGR2GRAY)
    _, m = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    m = cv2.morphologyEx((m > 0).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    i = max(range(1, n), key=lambda k: st[k, 4])
    cnts, _ = cv2.findContours((lab == i).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    alpha = np.zeros(gray.shape, np.uint8)
    cv2.drawContours(alpha, cnts, -1, 1, -1)
    x, y, w, h = cv2.boundingRect(alpha)
    return logo[y:y + h, x:x + w], alpha[y:y + h, x:x + w].astype(np.float32)


def largest_bright(gray, win, minarea):
    """The mark: the biggest bright blob inside the search window, or None."""
    x0, y0, x1, y1 = win
    sub = gray[y0:y1, x0:x1]
    if sub.size == 0:
        return None
    _, m = cv2.threshold(sub, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    m = cv2.morphologyEx((m > 0).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    if n < 2:
        return None
    i = max(range(1, n), key=lambda k: st[k, 4])
    if st[i, 4] < minarea:
        return None
    full = np.zeros(gray.shape, np.uint8)
    full[y0:y1, x0:x1] = (lab == i).astype(np.uint8)
    return full


def pushpull(img, known, levels=7):
    """Smoothly extend the known pixels over the unknown ones.

    Weighted pyramid down, then back up filling each level from the one above
    wherever the weight is thin. On a subject like this cover -- a slow navy
    gradient with fine leather grain -- it reads as untouched cover.
    """
    f = [img * known[..., None]]
    w = [known.astype(np.float32)]
    for _ in range(levels):
        f.append(cv2.pyrDown(f[-1]))
        w.append(cv2.pyrDown(w[-1]))
    up = None
    for i in range(len(f) - 1, -1, -1):
        wi = w[i][..., None]
        cur = np.where(wi > 1e-4, f[i] / np.maximum(wi, 1e-4), 0)
        if up is not None:
            up = cv2.resize(up, (cur.shape[1], cur.shape[0]), interpolation=cv2.INTER_LINEAR)
            a = np.clip(wi * 4, 0, 1)
            cur = cur * a + up * (1 - a)
        up = cur
    return up


def composite(img, gray, decal_a, decal_rgb, warp, mark, scale):
    """Erase the old mark and lay the real one down in its place."""
    h, w = img.shape[:2]
    wa = cv2.warpPerspective(decal_a, warp, (w, h), flags=cv2.INTER_LINEAR)
    wrgb = cv2.warpPerspective(decal_rgb, warp, (w, h), flags=cv2.INTER_LINEAR)

    ink = mark > 0
    p80 = np.percentile(gray[ink], 80)
    frame_core = img[ink & (gray >= p80)].mean(0)
    dg = cv2.cvtColor(decal_rgb.astype(np.uint8), cv2.COLOR_BGR2GRAY)
    dm = decal_a > 0.9
    decal_core = decal_rgb[dm & (dg >= np.percentile(dg[dm], 80))].mean(0)
    wrgb = np.clip(wrgb * (frame_core / np.maximum(decal_core, 1)), 0, 255)

    cut = (ink | (wa > 0.02)).astype(np.uint8)
    k = max(3, int(round(25 * scale)) | 1)
    cut = cv2.dilate(cut, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    # The wordmark under the logo and the gilt page edge are bright too, and
    # feeding either into the fill would smear a pale bloom across the cover --
    # so the fill is allowed to read only from pixels that are actually cover.
    known = ((cut == 0) & (gray < p80 * 0.55)).astype(np.float32)
    base = np.where(cut[..., None] > 0, pushpull(img, known), img)
    a = wa[..., None]
    return np.clip(base * (1 - a) + wrgb * a, 0, 255).astype(np.uint8), frame_core


def stamp(tier, out_dir):
    decal_rgb_full, decal_a_full = build_decal()
    os.makedirs(out_dir, exist_ok=True)
    src = TIERS[tier]
    decal_a = decal_rgb = None
    prev_box = prev_warp = prev_mark = prev_gray = None
    mode = "mask"
    crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 500, 1e-7)

    for n in range(1, LAST_FRAME + 1):
        path = os.path.join(src, "frame-%03d.webp" % n)
        if not os.path.exists(path):
            return n - 1
        img = cv2.imread(path).astype(np.float32)
        fh, fw = img.shape[:2]
        scale = fw / 1920.0
        gray = cv2.cvtColor(img.astype(np.uint8), cv2.COLOR_BGR2GRAY)
        blur = 6 * scale + 1
        note = ""

        if mode == "mask":
            if prev_box is None:
                win, minarea = (0, 0, fw, fh), int(5000 * scale * scale)
            else:
                x, y, w, h = prev_box
                pad = int(0.20 * max(w, h)) + int(20 * scale)
                win = (max(0, x - pad), max(0, y - pad), min(fw, x + w + pad), min(fh, y + h + pad))
                minarea = int(0.20 * w * h)
            mark = largest_bright(gray, win, minarea)
            cc, A = -1.0, None
            if mark is not None:
                box = cv2.boundingRect(mark)
                x, y, w, h = box
                if decal_a is None:
                    # The decal is rasterised once, at the first frame's size,
                    # and every later frame is a warp of THAT -- so the mark is
                    # resampled from the logo once rather than 36 times.
                    decal_a = cv2.resize(decal_a_full, (w, h), interpolation=cv2.INTER_AREA)
                    decal_rgb = cv2.resize(decal_rgb_full, (w, h), interpolation=cv2.INTER_AREA)
                    guess = np.array([[1, 0, x], [0, 1, y]], np.float32)
                else:
                    # Carry the previous frame's shear and rotation, snap the
                    # position and scale to this frame's box. Re-deriving the
                    # whole warp from the box alone loses the shear and ECC then
                    # has to find it again from an upright start, which is where
                    # it used to fall into a local minimum on the turned frames.
                    px, py, pw, ph = prev_box
                    D = np.array([[w / pw, 0, x - px * w / pw], [0, h / ph, y - py * h / ph], [0, 0, 1]])
                    guess = (D @ prev_warp)[:2].astype(np.float32)
                try:
                    cc, A = cv2.findTransformECC(
                        cv2.GaussianBlur(decal_a, (0, 0), blur),
                        cv2.GaussianBlur(mark.astype(np.float32), (0, 0), blur),
                        guess, cv2.MOTION_AFFINE, crit, None, 5)
                except cv2.error:
                    cc = -1.0
            if cc >= ECC_OK:
                warp = np.vstack([A, [0, 0, 1]]).astype(np.float64)
                note = "mask fit %.4f" % cc
                prev_box = box
            else:
                mode = "track"
                print("    frame-%03d  silhouette fit down to %.3f -- tracking the cover instead"
                      % (n, cc))

        if mode == "track":
            corners = np.float32([[[0, 0]], [[decal_a.shape[1], 0]],
                                  [[decal_a.shape[1], decal_a.shape[0]]], [[0, decal_a.shape[0]]]])
            pts = cv2.perspectiveTransform(corners, prev_warp)
            x0, x1 = int(pts[:, 0, 0].min()), int(pts[:, 0, 0].max())
            y0, y1 = int(pts[:, 0, 1].min()), int(pts[:, 0, 1].max())
            mw, mh = int(0.55 * (x1 - x0)) + 10, int(0.45 * (y1 - y0)) + 10
            x0, x1 = max(0, x0 - mw), min(fw, x1 + mw)
            y0, y1 = max(0, y0 - mh), min(fh, y1 + mh)
            tmpl = cv2.GaussianBlur(prev_gray[y0:y1, x0:x1].astype(np.float32) / 255.0, (0, 0), 1.5 * scale + 1)
            cur = cv2.GaussianBlur(gray.astype(np.float32) / 255.0, (0, 0), 1.5 * scale + 1)
            offset = np.array([[1, 0, x0], [0, 1, y0], [0, 0, 1]], np.float32)
            try:
                cc2, moved = cv2.findTransformECC(tmpl, cur, offset.copy(), cv2.MOTION_HOMOGRAPHY, crit, None, 5)
            except cv2.error:
                print("    frame-%03d  cover no longer trackable -- stopping" % n)
                return n - 1
            if cc2 < TRACK_OK:
                print("    frame-%03d  cover track down to %.3f -- stopping" % (n, cc2))
                return n - 1
            rel = moved @ np.linalg.inv(offset.astype(np.float64))
            warp = rel @ prev_warp
            mark = cv2.warpPerspective(prev_mark, rel, (fw, fh), flags=cv2.INTER_NEAREST)
            note = "cover track %.4f" % cc2
            if mark.sum() < 50:
                print("    frame-%03d  mark has gone -- stopping" % n)
                return n - 1

        out, core = composite(img, gray, decal_a, decal_rgb, warp, mark, scale)
        cv2.imwrite(os.path.join(out_dir, "frame-%03d.png" % n), out)
        print("    frame-%03d  %-18s cover ink %s" % (n, note, np.round(core).astype(int)))
        prev_warp, prev_mark, prev_gray = warp, mark, gray
    return LAST_FRAME


def encode(tier, out_dir, last):
    """Back to webp at build-book-frames.sh's own settings."""
    wide, close = (QHD_WIDE, QHD_CLOSE) if tier == "hd" else (QSD_WIDE, QSD_CLOSE)
    for n in range(1, last + 1):
        q = close if n >= Q_SPLIT else wide
        png = os.path.join(out_dir, "frame-%03d.png" % n)
        webp = os.path.join(TIERS[tier], "frame-%03d.webp" % n)
        subprocess.run(["magick", png, "-quality", str(q), "-define", "webp:method=6", webp], check=True)


def main():
    if not os.path.exists(LOGO):
        sys.exit("logo.jpeg is not at the repo root")
    tmp = os.path.join(os.environ.get("TMPDIR", "/tmp"), "nivlak-stamp")
    for tier in ("hd", "sd"):
        print("==> %s" % tier)
        out_dir = os.path.join(tmp, tier)
        last = stamp(tier, out_dir)
        if last < 1:
            sys.exit("%s: the mark was never found" % tier)
        print("==> %s: encoding frames 1-%d" % (tier, last))
        encode(tier, out_dir, last)
        total = sum(os.path.getsize(os.path.join(TIERS[tier], f))
                    for f in os.listdir(TIERS[tier]) if f.endswith(".webp")) // 1024
        budget = 4096 if tier == "hd" else 2560
        print("    %s total %d KiB (budget %d)" % (tier, total, budget))
        if total > budget:
            sys.exit("%s is over the size budget" % tier)


if __name__ == "__main__":
    main()

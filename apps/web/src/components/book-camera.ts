// Camera model for the scroll-scrubbed book reveal.
//
// This is pure arithmetic on purpose: <BookScrollReveal> paints what it returns,
// and tools/qa-book-camera.mjs renders the same plan offscreen at a range of
// viewports so the sequence can be measured -- frame-to-frame difference,
// letterbox, cropping -- instead of only eyeballed in a browser.
//
// The source is ninety-one frames of ONE CONTINUOUS CLIP: a single camera move
// of the book opening, shot under one light, cut straight out of the original
// mp4 by tools/build-book-frames.sh.
// That is worth stating plainly because the previous source was not, and this
// file used to be full of machinery that only made sense for the old one. Eight
// separate stills with three different cameras between them needed per-gap
// dissolve lengths, a punch through each transition, and a dip in the light to
// cover the two places the camera cut. Run any of that over real footage and it
// pulses -- you would be dimming the lights in the middle of a continuous move.
// All of it is gone. What is left is what a frame sequence actually needs:
//
//   1. a linear cross-fade between adjacent frames, which at under thirty pixels
//      of scroll per frame reads as motion blur rather than as a dissolve,
//      because the two frames really are a twelfth of a second apart;
//   2. a fit that fills a wide viewport exactly and only backs off on a narrow
//      one, where a 16:9 frame cannot fill a phone without slicing the book;
//   3. a pan that follows the book, which does nothing at all on a desktop --
//      there is no slack to pan into -- and on a phone keeps the book centred
//      in the band as it moves across the frame.
//
// The clip supplies its own push-in, so there is no synthetic one here.

import {
  GENERATED_FRAME_COUNT,
  GENERATED_FRAME_H,
  GENERATED_FRAME_W,
  GENERATED_FRAMES,
  GENERATED_LETTERBOX,
} from "@/components/book-frames.generated";

export const FRAME_COUNT = GENERATED_FRAME_COUNT;
export const FRAME_W = GENERATED_FRAME_W;
export const FRAME_H = GENERATED_FRAME_H;

// Measured per frame by the build script: the centre and size of the book's
// bounding box, in source pixels. Generated rather than hand-tuned because
// there are forty of them and they have to move as smoothly as the footage --
// a bbox measured by eye would put a jitter in the pan that is not in the clip.
export const FRAMES = GENERATED_FRAMES;

// Bump this whenever the frames are rebuilt, and move the output directory with
// it. The frames are served immutable for a year (see next.config.ts) and a
// rebuilt set reuses the same filenames, so without a new directory every
// visitor who has been here before keeps the *old* book until 2027. The version
// is part of the URL rather than a query string because the cache in front of
// this is not guaranteed to key on one.
export const FRAME_SET = "v5";

// Two resolution tiers of the same 16:9 framing. Ninety-six frames of 1920x1080
// is around eight megabytes of decoded bitmap each: a desktop browser can hold
// that and discard under pressure, but handing it to a phone costs both the
// bandwidth and the memory for pixels the screen cannot show. The tier is picked
// once, from the viewport, before anything is fetched.
//
// Both tiers share one FRAMES table, in 1920x1080 coordinates. That is not an
// oversight -- the painter maps a whole frame onto a destination rect, so the
// only thing the anchors have to agree with is the aspect ratio, and the tiers
// are the same shot at two densities.
export type Tier = "hd" | "sd";

// Below this many CSS pixels of viewport width, sd. A phone in landscape is the
// case this is really drawing a line around: wide enough to want detail, small
// enough that the big set is a bad trade.
const HD_MIN_WIDTH = 900;

export const pickTier = (viewportWidth: number): Tier =>
  viewportWidth >= HD_MIN_WIDTH ? "hd" : "sd";

export const FRAME_SRC = (index: number, tier: Tier) =>
  `/frames/${FRAME_SET}/${tier}/frame-${String(index).padStart(3, "0")}.webp`;

// The frames' own edge colour, so the bars a narrow viewport leaves read as part
// of the picture rather than as a black surround.
export const LETTERBOX = GENERATED_LETTERBOX;

// How much of the frame has to stay on screen once cropping is free, as a
// fraction of the source. Cropping becomes free late in the clip and not
// before, and the reason is the content rather than the geometry: at the start
// the subject is a tall closed book that has to be shown whole, and at the end
// it is a blank spread running past all four edges, where the outer third is
// bare paper and nobody can tell it is missing. Geometry alone cannot separate
// those two -- both "fill the frame" -- so the credit is a function of the
// playhead, which is legitimate here precisely because this is one known clip
// and not a general-purpose sequence.
// Measured, not guessed: with the credit arriving late the worst case was a
// phone showing 62% of its height as bar, around frames 25-30 where the book
// has already opened wide but the credit had not yet let go of its full width.
// Full credit by the time the spread is flat kills that case.
const CROP_FROM = 0.45;
const CROP_TO = 0.68;
const MIN_SHOW_W = 0.3;
const MIN_SHOW_H = 0.45;

// Slack left around the must-show box, so the book is never flush against the
// viewport edge.
export const SHOW_MARGIN = 1.04;

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/** Scroll progress 0..1 -> fractional frame index 0..FRAME_COUNT-1. */
export const playheadFor = (u: number) => clamp01(u) * (FRAME_COUNT - 1);

export type Layer = {
  index: number;
  alpha: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

// ONE PAGE, NOT THE SPINE -- the portrait framing.
//
// A phone shows one page per sheet once the book is open (see MOBILE_PAGES in
// book-pages.content.ts), and `layoutSheets` maps the photograph's RIGHT page
// onto that sheet. The reveal, though, framed the whole book: at 393x851 the
// canvas ends showing source x 712..1211, which is the GUTTER band -- the
// spine down the middle of the screen with half a page either side of it. So
// the book opened at the centre and then cut to a single page the moment the
// sheets came on, which is the seam this framing closes.
//
// The target is exactly what the sheet does: the right page, centred, at
// whatever scale covers the screen. Both are computed from the same three
// measured columns below, so the last frame of the reveal and the first page
// of the book are the same picture.
// The three columns, measured off frame-091 in the 1920x1080 source space: the
// darkest column across the middle of the spread is the gutter, and the paper
// runs from just inside the left edge to just inside the right one, full bleed
// top to bottom. They are up here rather than beside spreadAt() because BOTH
// framings are built on them, and two copies of a measurement is how the
// reveal and the sheets drift apart.
const GUTTER_X = 975;
const PAPER_LEFT_X = 20;
const PAPER_RIGHT_X = 1902;

const PAGE_CX_SRC = (GUTTER_X + PAPER_RIGHT_X) / 2;
const PAGE_W_SRC = PAPER_RIGHT_X - GUTTER_X;

// When the push into one page happens, as a fraction of the playhead.
//
// Not from the start: the opening of the clip is a closed book standing on a
// plinth, and there is no "one page" of it to frame -- the cover is one object
// and cropping to half of it reads as a mis-framed photograph. 0.45 is where
// the covers come apart, so the pan begins on a book that is visibly opening
// and lands on the page exactly at the end, which is the frame the sheets are
// sized to.
//
// 0.55 was built and compared frame by frame at 393x851. It is the more timid
// of the two: the spine is still on screen two thirds of the way through the
// reveal, so the whole move has to happen in the last few frames and reads as
// a slide at the end rather than as the camera choosing a page.
const PAGE_FROM = 0.45;
const PAGE_TO = 1;

export type Plan = {
  playhead: number;
  base: number;
  mix: number;
  dip: number;
  layers: Layer[];
};

/**
 * What to paint at scroll progress `u` on a `width` x `height` canvas.
 * `ceiling` is the highest frame index that has decoded; the playhead is held
 * behind it so the reveal can start scrubbing before the whole set has landed.
 */
export function planAt(
  u: number,
  width: number,
  height: number,
  ceiling = FRAME_COUNT - 1,
  /**
   * Frame the RIGHT PAGE rather than the whole book, for the viewports that
   * print one page per sheet. Off by default, and `spreadAt` below leaves it
   * off deliberately: `isFullBleed` asks spreadAt whether a phone has room for
   * half a spread, so a spreadAt that had already moved to the phone framing
   * would answer its own question and flip the layout back.
   */
  onePage = false,
): Plan {
  const playhead = Math.min(playheadFor(u), Math.max(ceiling, 0));
  const base = Math.max(0, Math.min(Math.floor(playhead), FRAME_COUNT - 2));
  // Linear, and linear on purpose. An eased blend would settle on each frame
  // and then hurry to the next, which is a rhythm the footage does not have.
  const mix = clamp01(playhead - base);

  const a = FRAMES[base];
  const b = FRAMES[base + 1];

  // One camera for both layers, so a cross-fade never scales one against the
  // other. Only the placement is per-layer, and that is the point: each frame
  // is positioned by where its own book is, so the blend stays registered while
  // the book moves.
  const credit = smoothstep(
    (playhead / (FRAME_COUNT - 1) - CROP_FROM) / (CROP_TO - CROP_FROM),
  );
  const showW =
    lerp(lerp(a.sw, b.sw, mix), FRAME_W * MIN_SHOW_W, credit) * SHOW_MARGIN;
  const showH =
    lerp(lerp(a.sh, b.sh, mix), FRAME_H * MIN_SHOW_H, credit) * SHOW_MARGIN;

  // Fill the viewport, unless filling it would crop into the must-show box --
  // then back off and let the edge-coloured bars take the difference. On any
  // 16:9-ish desktop the source aspect matches and this is always exactly
  // cover, so the footage is shown 1:1 with no crop decision at all.
  const cover = Math.max(width / FRAME_W, height / FRAME_H);
  const held = Math.min(cover, width / showW, height / showH);

  // ...and by the end of the clip, fill it unconditionally.
  //
  // `credit` above already says cropping is free once the spread is flat, and
  // it is spent on shrinking the must-show box. That is not enough on a narrow
  // viewport, where the box still binds: on a 390x844 phone cover wants 0.781
  // and width/showW caps it at 0.651, so the frame is drawn 1250x703 and the
  // pages section shows ~55px of bare letterbox above and below the page. The
  // page looked framed rather than full screen, which is the opposite of what
  // the fallback is for.
  //
  // So the same credit also releases the constraint itself. At the end the
  // scale IS cover on every aspect ratio, which is the honest reading of "the
  // outer third is bare paper and nobody can tell it is missing" -- if the crop
  // is free then the bars have nothing to buy. Desktop is untouched: at
  // 1440x900 the constraint never bound, held already equals cover, and the
  // lerp is between a number and itself.
  // ...but NEVER taller than the window, and that clamp is the whole of the
  // different-aspect story.
  //
  // `cover` fills the viewport by taking the larger of the two ratios, so on
  // anything WIDER than the footage's 16:9 it is the width that drives and the
  // frame overflows vertically. The paper is full bleed top to bottom in this
  // clip, and <BookSheets> sizes every sheet to the paper, so a vertical
  // overflow is not bare margin coming off -- it is the page itself, with the
  // type on it, hanging past the window. Measured before this clamp:
  //
  //   2560x1080  aspect 2.37   sheet 1236x1440  172px off the top, 188 the foot
  //   1600x740   aspect 2.16   sheet  773x900    75                 85
  //    844x390   aspect 2.16   sheet  407x475    40                 45
  //
  // 844x390 is the one that has been paid for three times over in
  // `book-sheets.tsx` -- 04's colophon changes page there, 05's index rows
  // tighten, 03's activity run goes -- and all three were working around this.
  //
  // Clamping to height/FRAME_H costs side bars on those aspects, in the
  // letterbox colour the section is already painted, which is the correct
  // trade: a book standing whole between two dark margins is what a wide
  // window should show, not a book with its head and feet cut off.
  //
  // Nothing at or below 16:9 moves, and that matters because the note above
  // about phones is still live. Where the viewport is TALLER than the footage
  // -- every portrait phone, and every 16:10 laptop -- `cover` is already the
  // height ratio, so `Math.min` returns it unchanged and this line is a no-op.
  // Verified: 1440x900, 1920x1080, 1366x768 and 390x844 all clip 0 before and
  // after.
  const fitted = Math.min(cover, height / FRAME_H);
  const spreadScale = lerp(held, fitted, credit);

  // The push into the right-hand page. On a portrait phone the scale is the
  // same number either way -- the page is taller than the screen is wide, so
  // the height drives both -- and all of this is horizontal. It is written as
  // a scale anyway because that is what makes it AGREE with the sheet on any
  // portrait window rather than only on the ones measured.
  const pageOpen = onePage
    ? smoothstep(
        (playhead / (FRAME_COUNT - 1) - PAGE_FROM) / (PAGE_TO - PAGE_FROM),
      )
    : 0;
  const scale = lerp(
    spreadScale,
    Math.max(width / PAGE_W_SRC, height / FRAME_H),
    pageOpen,
  );

  const drawWidth = FRAME_W * scale;
  const drawHeight = FRAME_H * scale;

  // Put the book in the middle of the viewport, then clamp: to the image edge
  // where the image overflows, so no bare ground is ever exposed, and to the
  // viewport where it does not, so the frame stays inside its bars. On a
  // desktop the first clamp binds immediately and the pan does nothing, which
  // is correct -- the clip already framed itself.
  const place = (anchor: number, extent: number, drawn: number) => {
    const raw = extent / 2 - anchor * scale;
    const lo = Math.min(0, extent - drawn);
    const hi = Math.max(0, extent - drawn);
    return Math.min(hi, Math.max(lo, raw));
  };

  const layer = (index: number, alpha: number): Layer => {
    const frame = FRAMES[index];
    // Where the camera looks. Straight at the book normally; on the way to the
    // right-hand page when the sheets are going to be single pages.
    //
    // Two steps rather than one, and the middle one is what keeps it attached
    // to the footage: `follow` is the centre of the right half of THIS frame's
    // measured book, so while the covers are still swinging the pan tracks the
    // real page rather than sliding toward a coordinate taken off the last
    // frame. It only becomes that coordinate at the very end, where 1431
    // (tracked) and 1438 (printed) are 5px apart on screen -- small, and the
    // 5px is exactly the seam this is here to remove.
    const follow = frame.ax + frame.sw / 4;
    const anchor = lerp(
      frame.ax,
      lerp(follow, PAGE_CX_SRC, pageOpen),
      pageOpen,
    );
    return {
      index,
      alpha,
      x: place(anchor, width, drawWidth),
      y: place(frame.ay, height, drawHeight),
      width: drawWidth,
      height: drawHeight,
    };
  };

  const layers = [layer(base, 1)];
  // 0.02 rather than 0: the last couple of per cent of the fade changes no
  // pixel a viewer can see, and the second layer is half the cost of the draw.
  if (mix > 0.02 && base + 1 <= ceiling) layers.push(layer(base + 1, mix));

  // Kept in the shape so the painter and the QA harness do not have to branch;
  // there are no camera cuts in this source, so nothing ever dips.
  return { playhead, base, mix, dip: 0, layers };
}

// ---------------------------------------------------------------------------
// Where the open spread lands, for anything that has to sit ON the book rather
// than be painted into it.
//
// <BookPages> stacks six turnable sheets over the final frame, and they only
// read as pages of *this* book if their spine sits exactly on the gutter in the
// footage and their edges on the paper's edges. So the geometry comes from the
// same camera the painter uses, not from a guess in CSS.
//
// The three measured columns it reads are defined above planAt.

export type Rect = { x: number; y: number; width: number; height: number };

/**
 * The two halves of the open spread, in CSS pixels on a `width` x `height`
 * canvas, as the reveal leaves them at u = 1.
 */
export function spreadAt(width: number, height: number): {
  left: Rect;
  right: Rect;
} {
  const plan = planAt(1, width, height);
  // The last layer is the final frame; at u = 1 the blend has fully arrived
  // there, and its placement is the one the eye is left looking at.
  const frame = plan.layers[plan.layers.length - 1];
  const sx = frame.width / FRAME_W;
  const sy = frame.height / FRAME_H;
  const at = (source: number) => frame.x + source * sx;

  return {
    left: {
      x: at(PAPER_LEFT_X),
      y: frame.y,
      width: (GUTTER_X - PAPER_LEFT_X) * sx,
      height: FRAME_H * sy,
    },
    right: {
      x: at(GUTTER_X),
      y: frame.y,
      width: (PAPER_RIGHT_X - GUTTER_X) * sx,
      height: FRAME_H * sy,
    },
  };
}

/** Where the whole final frame is drawn, for pinning an <img> of it in place. */
export function finalFrameRect(width: number, height: number): Rect {
  const plan = planAt(1, width, height);
  const frame = plan.layers[plan.layers.length - 1];
  return { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
}

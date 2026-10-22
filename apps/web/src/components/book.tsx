"use client";

import { installPageTurnSound } from "@/components/page-turn-sound";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { SplitText } from "gsap/SplitText";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  FRAME_COUNT,
  FRAME_SRC,
  FRAME_W,
  LETTERBOX,
  pickTier,
  planAt,
  playheadFor,
} from "@/components/book-camera";
import { BookIndex, BookNav, BookRunningHead } from "@/components/book-nav";
import {
  BOOK_PAGES,
  BOOK_SPREADS,
  CHAPTER_OF_MOBILE_PAGE,
  FIRST_MOBILE_PAGE_OF_CHAPTER,
  CHAPTER_OF_SPREAD,
  FIRST_SPREAD_OF_CHAPTER,
  roman,
} from "@/components/book-pages.content";
import {
  BookPageColumn,
  BookSheets,
  MOBILE_TURNS,
  TURNS,
  isFullBleed,
  layoutSheets,
  paintSheets,
  releaseBookImages,
} from "@/components/book-sheets";

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin, SplitText, useGSAP);
// A phone's address bar showing and hiding is a height-only resize, and a
// ScrollTrigger refresh on it re-measures the pin mid-scroll -- the page jumps
// every time the reader changes direction. This is GSAP's default on touch
// devices; it is set here so nothing depends on that default holding.
ScrollTrigger.config({ ignoreMobileResize: true });

// The whole landing page: a book that opens, then turns six pages.
//
// ONE section, ONE pin, ONE timeline, and that is the point of this file. It
// used to be two pinned sections -- a reveal and a pages section -- and they
// could not be joined without a seam. Two stacked full-height pins mean the
// first has to travel its own height before the second reaches the top of the
// window, so for a full viewport of scroll you saw the finished book slide up
// while an identical copy of it slid in underneath, split by a hard horizontal
// line. Pulling the second section up to close the gap only moved the problem:
// it then crept over the first while the book was still opening.
//
// There is no handover here to get wrong. The canvas draws the opening, the
// sheets turn over the frame it lands on, and both are children of the same
// pinned element driven by the same playhead.
//
// The frames are built by tools/build-book-frames.sh and the camera that moves
// over them lives in book-camera.ts -- read that first, it is where the reveal
// is actually designed. book-sheets.tsx owns the sheets' markup and geometry.

// The two numbers worth turning: how much wheel one timeline unit costs, and
// how many units the book takes to open. Everything else is expressed in units,
// so adding a page lengthens the scroll by exactly one page's worth and the
// cadence of the rest never changes -- which is the whole reason the page count
// is read off BOOK_PAGES rather than written down twice.
//
// The opening has come down twice. 800% gave each of the 91 frames about 78px
// of scroll and took roughly six trackpad flicks; 400% halved that to three;
// 250% is about two. At 250% on a 900px viewport the move is 2250px and a frame
// gets ~25px, still inside the range where the cross-fade between adjacent
// frames reads as motion blur rather than as a dissolve -- see the note at the
// top of book-camera.ts, which puts that threshold at thirty pixels. Much below
// this and the individual frames start to show.
const VH_PER_UNIT = 67;
const OPEN_VH = 250;

// The scrub's catch-up, in seconds. Short enough to stay attached to the
// wheel, long enough that a wheel notch becomes a glide.
const SCRUB = 1.0;

// Timeline units for the page phase. One unit is a turn; the gap after it is
// the rest of the bar, because without it the pages run into each other and
// there is never a moment where a page is simply open and readable.
const TURN = 1;
const GAP = 0.2;
const LEAD_IN = 0.4;
const TRAIL = 0.5;
// Both are now functions of the SHEET COUNT, because portrait prints one page
// per sheet and has about twice as many of them -- see MOBILE_PAGES. The
// cadence per turn is unchanged, so the phone's book is longer to scroll in
// exactly the way a book with more pages is.
const pagesUnits = (turns: number) =>
  LEAD_IN + (turns - 1) * (TURN + GAP) + TURN + TRAIL;

const OPEN = OPEN_VH / VH_PER_UNIT;
// One page per sheet scrolls HALF as far per unit (asked: "not so much
// scrolling on mobile"). A phone has ~twice the sheets, and at the desktop
// cadence the book was ~14 screens of thumb; it is ~7 now. The timeline is
// unchanged -- only how much scroll a unit costs -- so the turn, the gaps and
// the reveal keep their proportions, and the drag-to-turn reads its page
// distance off the trigger at drag time, so it follows on its own.
//
// Then back UP to 0.75 (asked: "in the mobile view the scroll speed is high,
// slow it"): at 0.5 a turn cost ~210px of thumb at 393x851, which a single
// flick overshoots by two pages. 0.75 is ~11 screens for the book.
const PHONE_SCROLL = 0.75;
// And the spread scrolls 30% LESS (asked: "on the laptop it is more
// scrolling"): 8.8 viewports at 1440x900 became ~6.5. A frame of the opening
// gets ~17px of wheel instead of ~25 -- more frames per pixel, so the clip
// plays smoother under a flick, not less.
const DESKTOP_SCROLL = 0.7;
// In percent of the viewport: the pin's `end`, and on a touch screen the
// height of the spacer the sticky book scrolls over (see `box` in <Book>).
const scrollPercent = (turns: number, single = false) =>
  Math.round((OPEN_VH + pagesUnits(turns) * VH_PER_UNIT) * (single ? PHONE_SCROLL : DESKTOP_SCROLL));
const scrollLength = (turns: number, single = false) =>
  `+=${scrollPercent(turns, single)}%`;

// Frames requested per batch after the first. Ninety-one at once is ninety-one
// parallel requests fighting the document for the connection on a cold load; in
// order and in batches, the playhead's decoded ceiling walks forward steadily
// instead of every frame arriving at the end.
const BATCH = 8;

// THE SMEAR ON THE RIGHT OF THE COVER IS IN THE FRAMES, and this shades it off.
//
// The clip arrived with a pillarbox matte on its first half, and
// build-book-frames.sh fills the bars by stretching the last real column of
// each row across them (its item 1). Across a featureless backdrop that is
// invisible; where the rock plinth runs into the bar it prints as a band of
// horizontal streaks, and the cover is exactly such a frame. Measured on the
// shipped hd set as the mean horizontal gradient per column -- zero means
// every row is one flat colour, i.e. a stretched fill:
//
//   frames 1-49    right fill 159-191 source px of 1920, gradient 0.0
//   frames 50-91   7-127px, and only on flat page areas: real content
//
// At 1440x900 that is x=1305..1440 of the first screen, the "blurred" corner
// next to the ribbon -- the ribbon's own note had taken 1305 for the end of
// the plinth. It cannot be cropped away without moving the camera, and the
// frames cannot be rebuilt without the source clip, which is not in the repo.
// So the painter lays the letterbox colour over the band as a fall-off: the
// shot is low-key and lit from the left, so rock going to shadow at the edge
// of the frame reads as the lighting rather than as a mask. Solid over the last
// 10% (the 8.3% fill plus its blurred seam), 85% at 11.5%, clear at 23%. Frame indices
// here are 0-based, so MATTE_LAST 48 is frame-049.
const MATTE_LAST = 48;
const MATTE_SHADE_FROM = 0.77;
// Gradient stops, as fractions of the band from MATTE_SHADE_FROM to the edge.
const MATTE_SHADE_KNEE = (0.885 - MATTE_SHADE_FROM) / (1 - MATTE_SHADE_FROM);
const MATTE_SHADE_SOLID = (0.9 - MATTE_SHADE_FROM) / (1 - MATTE_SHADE_FROM);

export function Book() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const kickerRef = useRef<HTMLDivElement>(null);
  // The scroll cue, which sits at the foot of the SCREEN and so cannot live
  // inside the hero block (see where it is rendered). It fades in the same
  // tween as `kickerRef`, as a second target, not in a second tween.
  const cueRef = useRef<HTMLDivElement>(null);
  // The cover's moving category band. Its own ref because it is laid against
  // the SCREEN's foot, outside the hero column; faded by the same tween.
  const bandRef = useRef<HTMLDivElement>(null);

  // The page-turn sound: unlocked by the first click, tap or key (a browser
  // rule), played on each `book:turn` from syncNav.
  useEffect(() => installPageTurnSound(), []);

  // THE COVER'S ENTRANCE, run ONCE by GSAP and not by CSS keyframes.
  //
  // It was `animate-hero-rise` on each line and `animate-ribbon-drop` on the
  // ribbon. ScrollTrigger's refresh takes the pinned section out of its
  // spacer and puts it back -- measured on load at ~520ms and ~690ms -- and
  // re-inserting an element RESTARTS its CSS animations, so the lines rose,
  // snapped back to invisible and rose again: the "blinks three times on
  // refresh". A tween is not restarted by a DOM move. Until it runs the lines
  // are `motion-safe:opacity-0` in the markup, so the server HTML does not
  // flash them first; under reduced motion they are simply there.
  //
  // ...and it TAKES OVER from a CSS fallback rather than starting the rise
  // itself. On a slow phone the script lands seconds after first paint (~9s on
  // the live site at Slow 4G), so index.css runs the same rise from 1.4s and
  // the cover is there without it. Here each line continues from wherever that
  // has got to -- its live opacity, read before the animation is removed --
  // so a fast load still rises from nothing and a slow one never re-hides a
  // cover the reader is already looking at. A LAYOUT effect, declared above
  // useGSAP, so it runs before the pin re-inserts the section: with the CSS
  // animation still on, that re-insert would restart it and blink the cover.
  useLayoutEffect(() => {
    const lines = [...document.querySelectorAll<HTMLElement>("[data-rise]")];
    const ribbon = document.querySelector<HTMLElement>("[data-ribbon-drop]");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const from = lines.map((el) => Number(getComputedStyle(el).opacity) || 0);
    // Where the ribbon is, as a percentage of its height. It is hidden by the
    // `translate` PROPERTY (Tailwind v4), which the fallback animates too, so
    // that is the value to read; GSAP folds it into its own transform below.
    const ribbonFrom = (() => {
      if (!ribbon) return -105;
      const y = getComputedStyle(ribbon).translate.trim().split(/\s+/)[1] ?? "0";
      if (y.endsWith("%")) return Number.parseFloat(y);
      const h = ribbon.offsetHeight || 1;
      return (Number.parseFloat(y) / h) * 100 || 0;
    })();
    for (const el of lines) el.style.animation = "none";
    if (ribbon) ribbon.style.animation = "none";
    const fresh = from.every((o) => o < 0.01);
    const rise = gsap.fromTo(
      lines,
      { opacity: (i: number) => from[i] ?? 0, y: (i: number) => 14 * (1 - (from[i] ?? 0)) },
      {
        opacity: 1,
        y: 0,
        duration: (i: number) => 0.9 * Math.max(0.25, 1 - (from[i] ?? 0)),
        ease: "power3.out",
        stagger: fresh ? 0.09 : 0,
        delay: fresh ? 0.05 : 0,
      },
    );
    const drop = ribbon
      ? gsap.fromTo(
          ribbon,
          // `y` is zeroed as well as yPercent: GSAP reads the markup's
          // starting `-translate-y-[105%]` into its own `y` (as -187px at
          // 1440x900) and a tween of yPercent alone left it there -- the
          // ribbon finished its drop still hidden above the head bar.
          { yPercent: ribbonFrom, y: 0 },
          {
            yPercent: 0,
            y: 0,
            duration: ribbonFrom < -100 ? 1.1 : 0.6,
            ease: "back.out(1.3)",
            delay: ribbonFrom < -100 && fresh ? 0.35 : 0,
          },
        )
      : null;
    return () => {
      rise.kill();
      drop?.kill();
    };
  }, []);

  const imagesRef = useRef<(HTMLImageElement | null)[]>([]);
  const redrawRef = useRef<() => void>(() => {});

  // Resolved once, on the first client render, and then never revisited. A
  // visitor who resizes a desktop window down to phone width has already paid
  // for the frames they have; swapping the whole set out mid-scroll would cost
  // another few megabytes to make the picture worse.
  const tierRef = useRef<ReturnType<typeof pickTier> | null>(null);
  //
  // Asked of the screen's LONGER side, not of its current width. The tier is a
  // property of the device, since it is kept across a rotation, and on width
  // alone the same device got a different set depending on how it was held
  // when the page loaded: an iPad Air is hd at 1180x820 and was sd at
  // 820x1180 -- where its canvas is 1640px of backing store and the cover's
  // frame is drawn ~1700 device px wide from a 1280px file, a 1.36x upscale
  // that read as a soft book. A phone stays sd either way (393x851 -> 851),
  // and a large phone that reaches 900 on its long side was already hd when
  // opened in landscape.
  if (tierRef.current === null && typeof window !== "undefined") {
    tierRef.current = pickTier(Math.max(window.innerWidth, window.innerHeight));
  }

  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // The ribbon hangs FROM the head rule, so its top is the rule's measured
  // offset and not a formula. The rule sits under a row whose height is the
  // logo's clamp, the type's line box and the portrait root size together,
  // plus two vh terms; the old `calc(3.4vh + 1.9rem)` guessed at that sum and
  // missed by -10px at 1920x1080 and +7 at 820x1180 -- above the rule on a
  // desktop, a visible gap below it on a tablet. Both elements are positioned
  // in the section, so the bar's offsetTop and the cue's top share an origin. A ResizeObserver on the bar catches every input at once -- a vh
  // change (a phone's address bar), the portrait root size, a late font.
  useEffect(() => {
    const cue = cueRef.current;
    const nav = cue?.parentElement?.querySelector<HTMLElement>("[data-book-nav]");
    const rule = nav?.querySelector<HTMLElement>("[data-head-rule]");
    if (!cue || !nav || !rule) return;
    // The rule's offset inside the bar comes from the two rects, because
    // offsetTop rounds to whole pixels and the rule sits on fractional ones
    // (67.48 at 1440x900): rounded, the ribbon's top showed 0.8px above it.
    // A difference of two rects is still blind to a translate on the bar.
    // Half a pixel further down, so the sway's rotation (corners rise ~0.4px)
    // stays under the rule's 1px line rather than peeking over it.
    const place = () => {
      const inBar =
        rule.getBoundingClientRect().top - nav.getBoundingClientRect().top;
      cue.style.setProperty("--head-rule-y", `${nav.offsetTop + inBar + 0.5}px`);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(nav, { box: "border-box" });
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, []);

  // ONE PAGE PER SHEET, on the viewports where a sheet is the whole screen.
  //
  // Asked geometrically and not with a media query, because layoutSheets asks
  // the same question the same way -- isFullBleed() is shared. A breakpoint
  // would disagree with it at some aspect ratio and the timeline would then be
  // driving sheets that are not in the DOM.
  //
  // It is state rather than a measurement inside the GSAP block because the
  // SHEETS THEMSELVES differ: React has to render the other list first, and
  // the hook's `dependencies` then rebuild the timeline over it.
  const [single, setSingle] = useState(false);
  // The ROOT FONT SIZE for a one-page (portrait) book, in px, or null for a
  // spread. It SCALES with the screen from the one the phone pages were
  // measured on -- 19px at 393x851 -- by the smaller of the width and height
  // ratios, so type grows only as far as BOTH dimensions have room for it and
  // every page keeps the proportions that were proved to fit.
  //
  // It was a switch (19px from 760px of height, 16 below), which gave every
  // portrait TABLET the phone's type: measured, a 14.4px paragraph and a
  // 28.5px headline on a 768, 820, 834 and 1024px-wide page alike, where
  // that same paragraph reads at 14.4 on a 393px phone. Now:
  //
  //   393x851  19     768x1024 22.9    820x1180 26.3
  //   360x740  16.5   834x1194 26.7    1024x1366 28 (cap)
  //
  // The floor is the old 16 -- 360x640 cut 03's third stage off at 18 -- and
  // the cap keeps a 12.9" tablet from setting a phone layout at poster size.
  // The root size itself is now CSS (apps/web/src/index.css), so it is in
  // effect from the FIRST paint -- see the note there. This effect only
  // decides `single`, one page per sheet or spreads.
  useEffect(() => {
    // Re-decided on a WIDTH change only (a rotation, a resized desktop
    // window), never on a height-only resize. On a phone the address bar
    // hides as you scroll down and comes back as you scroll up, which fires
    // `resize` with a height ~56px different -- enough to cross the 760
    // threshold. Measured in the emulator at 393x800 -> 744: the root font
    // flipped 19px <-> 16px and the document changed 11536 <-> 10728px, so
    // the same scroll position landed on a different point in the book and
    // every page jumped each time the scroll direction changed. The height
    // taken is whatever the page loaded (or rotated) with, bar and all.
    //
    // A small height change at the same width is the bar; anything larger is
    // a real resize and is taken. Not "width changes only": a rotation can
    // report the new width one event before the new height (the emulator
    // gave 393x393 then 393x851), and a width-only rule threw away the second
    // event and left a portrait phone laid out as a spread. 180 clears a
    // collapsing toolbar (~56px, ~120 with a bottom bar) and no rotation.
    let lastWidth = -1;
    let lastHeight = -1;
    const sync = () => {
      const { innerWidth: w, innerHeight: h } = window;
      if (w === lastWidth && Math.abs(h - lastHeight) < 180) return;
      lastWidth = w;
      lastHeight = h;
      const full = isFullBleed(w, h);
      return setSingle(full);
    };
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  // PHONE TYPE IS BIGGER, and the root font size is the one lever that does
  // it. Every size in the book is a `clamp(rem, vw, rem)`; on a phone the vw
  // term is below the floor, so the REM minimum is the only number that
  // renders -- which is why this file's standing note says the minimums are
  // what a phone gets and must not be raised. That note was written when a
  // phone carried a whole chapter on one sheet. It carries HALF of one now
  // (MOBILE_PAGES), so the room exists, and the root size lifts every floor
  // at once without touching a single clamp.
  //
  // 19px, and the pages are what stop it there. Measured at 393x851, page by
  // page, as the clearance between the last line of the body and the top of
  // the drop folio:
  //
  //   page                 16px*   18px   19px   20px
  //   02, entries I-II       ~100      9     -7    -26   <- the binding one
  //   02, entries III-V      ~100      9      4     -1
  //   03 verso, 3 stages     ~200    114     43    -73
  //   every other page        big   132+    81+    57+
  //
  // (* before the phone bump.) So two pages in the book decide it, and at 19
  // they clear -- with the portrait drop halved, which is the 15px that took
  // 02 from -7 to +8. See PAGE_SINKAGE in book-sheets.tsx.
  //
  // The rest of the book had room to spare and the reason is worth keeping:
  // every phone page at 18px carried a VOID of 130 to 530px in the middle of
  // it while its type sat at 8 to 11px. A page can be starved and half empty
  // at the same time, and this one was; the fix was never more pages.
  //
  // ScrollTrigger has to be told: the pin's spacing is measured from a layout
  // that just changed.

  const load = useCallback((index: number) => {
    return new Promise<HTMLImageElement | null>((resolve) => {
      const img = new window.Image();
      img.src = FRAME_SRC(index, tierRef.current ?? "sd");
      const done = async () => {
        if (img.naturalWidth === 0) return resolve(null);
        // Decode up front: a first-time decode inside a scroll-driven draw is
        // exactly where scrub jank comes from.
        try {
          await img.decode?.();
        } catch {
          /* decode is best-effort */
        }
        resolve(img);
      };
      img.onload = done;
      img.onerror = () => resolve(null);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const first = await load(1);
      if (cancelled) return;
      imagesRef.current[0] = first;
      redrawRef.current();

      // THE LAST FRAME SECOND, out of order. It is not only the end of the
      // film: it is the PAPER -- every sheet's face is frame-091 by CSS
      // (`--page-image`). Loaded last, a phone on mobile data that scrolled
      // straight in reached the pages before it had landed, and the type
      // came up over a still-closed book with no paper under it ("pages
      // mismatch / not loading correctly"). Fetched here, the CSS background
      // is a cache hit and draw() can show it the moment the book is open
      // (see `ceiling` there), whatever the middle of the film is doing.
      const last = await load(FRAME_COUNT);
      if (cancelled) return;
      imagesRef.current[FRAME_COUNT - 1] = last;
      redrawRef.current();

      // Then the rest COARSE TO FINE: every 8th frame, then every 4th, every
      // 2nd, then the remainder, in batches. In order, a phone on mobile data
      // that scrolled in before the set had landed found the book frozen shut
      // -- measured on a Pixel 5 at Slow 4G, three swipes 3s into a cold load
      // left it in the film with 2 of 91 frames, and the canvas never draws
      // past the first gap. A dozen frames cover the whole opening in about a
      // second; the book opens under the finger from then on, in steps at
      // first, and smooths as the gaps fill (draw() holds the camera to the
      // frame it actually has, so picture and move always agree).
      for (const stride of [8, 4, 2, 1]) {
        const todo: number[] = [];
        for (let i = 2; i < FRAME_COUNT; i++) {
          if ((i - 1) % stride === 0 && imagesRef.current[i - 1] === undefined) todo.push(i);
        }
        for (let k = 0; k < todo.length; k += BATCH) {
          const batch = todo
            .slice(k, k + BATCH)
            .map((i) => load(i).then((img) => ({ i, img })));
          const settled = await Promise.all(batch);
          if (cancelled) return;
          for (const { i, img } of settled) imagesRef.current[i - 1] = img;
          redrawRef.current();
        }
      }
      // The film is in: the book's own pictures may load now. Before this
      // they would have taken the frames' bandwidth (see BookImg).
      releaseBookImages();
    })();

    return () => {
      cancelled = true;
    };
  }, [load]);

  useGSAP(
    (_context, contextSafe) => {
      // Deliberately not gated on the first frame having loaded: the pin
      // spacer has to exist before the visitor scrolls, and draw() copes with
      // an empty cache by painting the letterbox colour and returning.
      // How many sheets this mode has, and which list the navigation reads.
      // Everything below counts in SHEETS; only these three lines know that a
      // sheet is a spread on a desktop and a single page on a phone.
      const turns = single ? MOBILE_TURNS : TURNS;
      const chapterOfSheet = single ? CHAPTER_OF_MOBILE_PAGE : CHAPTER_OF_SPREAD;
      const firstSheetOfChapter = single
        ? FIRST_MOBILE_PAGE_OF_CHAPTER
        : FIRST_SPREAD_OF_CHAPTER;

      const section = sectionRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d", { alpha: false });
      if (!section || !canvas || !ctx) return;

      // WHAT SCROLLS. On a touch screen it is the wrapper box and not the
      // document, so the browser's address bar stays put -- see the note on
      // [data-scroller] in index.css, whose media query this asks verbatim so
      // the CSS and the scroll code can never disagree. Everything below reads
      // and writes the scroll through these three, never through `window`.
      const box =
        scrollerRef.current && window.matchMedia("(pointer: coarse)").matches
          ? scrollerRef.current
          : null;
      const scroller: HTMLElement | Window = box ?? window;
      const scrollY = () => (box ? box.scrollTop : window.scrollY);
      const scrollToY = (top: number) =>
        box ? (box.scrollTop = top) : window.scrollTo({ top, behavior: "auto" });

      // Nearest frame at or before `index` that has decoded. Frames arrive
      // coarse to fine and a request can fail, so a gap degrades to the frame
      // before it rather than to a blank.
      const frameAt = (index: number) => {
        for (let i = Math.min(index, FRAME_COUNT - 1); i >= 0; i--) {
          const img = imagesRef.current[i];
          if (img) return img;
        }
        return null;
      };

      const scroll = { u: 0 };

      const draw = () => {
        const rect = canvas.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        if (!width || !height) return;

        // Never allocate more device pixels than the source can actually fill.
        // This used to carry a 1.25 fudge factor, which was quietly the most
        // expensive line in the component: on a 1600px retina canvas it asked
        // for a 2400px backing store from a 1920px source, so every frame was
        // upscaled -- paying twice the fill rate to invent detail that is not
        // there. Measured, two layers into a 2400x1136 backing cost 19.5ms
        // against 8.8ms at 1600x757, and the whole draw has 16.7ms to fit in.
        const dpr = Math.min(window.devicePixelRatio || 1, 2, FRAME_W / width);
        const pixelWidth = Math.round(width * dpr);
        const pixelHeight = Math.round(height * dpr);
        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
          canvas.width = pixelWidth;
          canvas.height = pixelHeight;
        }
        ctx.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
        // "high" is a multi-pass downsample and only earns its cost when the
        // source is reduced a long way -- on a phone, where a 1280 frame lands
        // in an 800px canvas. At or near 1:1, where the cap above now keeps
        // every desktop, it is indistinguishable from bilinear and costs ~3ms.
        ctx.imageSmoothingQuality = pixelWidth < FRAME_W * 0.8 ? "high" : "low";

        // `isFullBleed` and not the `single` state: this painter runs on every
        // frame from inside a ticker whose closure is not rebuilt when the
        // state changes, so the state would be stale for a whole rotation --
        // and the question is geometric anyway, which is why that function is
        // shared with layoutSheets in the first place.
        // Hold the camera to the frame that is actually THERE. Where the
        // playhead and the frame after it have both landed, nothing is held
        // and the two cross-fade as before; across a gap the playhead is
        // clamped to the nearest frame behind it, so the move and the picture
        // stay one frame of the film instead of the camera running ahead of a
        // photograph it does not have. At the end that is frame 91, fetched
        // second, so an open book shows its paper while the middle loads.
        const ceiling = (() => {
          const base = Math.min(Math.floor(playheadFor(scroll.u)), FRAME_COUNT - 1);
          const next = Math.min(base + 1, FRAME_COUNT - 1);
          if (imagesRef.current[base] && imagesRef.current[next]) return FRAME_COUNT - 1;
          let i = base;
          while (i > 0 && !imagesRef.current[i]) i--;
          return i;
        })();
        const plan = planAt(
          scroll.u,
          width,
          height,
          ceiling,
          isFullBleed(width, height),
        );

        // Paint the ground only where the frame will not. An opaque context that
        // is never filled reads as black rather than as the section colour, so
        // this cannot just be dropped -- but on any wide viewport the frame
        // covers the canvas edge to edge, and a full-canvas fill underneath an
        // opaque image that is about to overwrite every pixel of it is a whole
        // wasted pass over the backing store.
        const base = plan.layers[0];
        const covered =
          base &&
          base.x <= 0 &&
          base.y <= 0 &&
          base.x + base.width >= width &&
          base.y + base.height >= height;
        if (!covered) {
          ctx.fillStyle = LETTERBOX;
          ctx.fillRect(0, 0, width, height);
        }

        // THE BARS ARE THE SCENE, NOT BLACK. Wherever the frame stops short
        // of the window -- every viewport wider than 16:9 once the reveal is
        // clamped to the window height (see `fitted` in planAt), the book's
        // whole flanks on a 2560x1080 -- the window used to be flat
        // LETTERBOX, and asked for: "the background is black, I want the
        // correct background". It is now the frame's own surroundings carried
        // out to the edge: the frame painted into a ~96px canvas, once
        // covering the window and once at its true place, blurred there and
        // stretched back up. A 96px canvas upscaled IS the blur, so this
        // costs two tiny draws a frame and never a full-size filter. The book
        // stays whole -- only what was black changes.
        // SIDE bars only. On a phone the frame always spans the width and the
        // gap is above or below the book while the camera lowers it from the
        // cover's lift; filled with the blurred scene, that read as a soft
        // light smudge across the top of the screen (seen on a Pixel 5).
        // There the letterbox colour is cleaner, as it always was.
        const sideBars =
          !!base && (base.x > 0.5 || base.x + base.width < width - 0.5);
        const ambient = sideBars ? paintAmbient(plan.layers, width, height) : null;
        if (ambient) ctx.drawImage(ambient.fill, 0, 0, width, height);

        for (const layer of plan.layers) {
          const img = frameAt(layer.index);
          if (!img) continue;
          ctx.globalAlpha = layer.alpha;
          ctx.drawImage(img, layer.x, layer.y, layer.width, layer.height);
          if (canvas.dataset.ready !== "true") canvas.dataset.ready = "true";
          // Same alpha as the frame it belongs to, so the 49 -> 50 cross-fade
          // takes the shade out with the matte instead of popping it.
          if (layer.index <= MATTE_LAST) shadeMatte(ctx, layer);
        }
        ctx.globalAlpha = 1;
        // Then the same picture again, feathered INTO the frame's edge, so
        // the sharp frame dissolves into its own continuation instead of
        // ending on a line.
        if (ambient) ctx.drawImage(ambient.seam, 0, 0, width, height);
      };

      // The matte's shade over the right of the early frames, for any rect
      // the frame is drawn at -- the window, or the ambient's tiny canvas.
      const shadeMatte = (
        target: CanvasRenderingContext2D,
        r: { x: number; y: number; width: number; height: number },
      ) => {
        const x0 = r.x + r.width * MATTE_SHADE_FROM;
        const x1 = r.x + r.width;
        const shade = target.createLinearGradient(x0, 0, x1, 0);
        shade.addColorStop(0, `${LETTERBOX}00`);
        shade.addColorStop(MATTE_SHADE_KNEE, `${LETTERBOX}d9`);
        shade.addColorStop(MATTE_SHADE_SOLID, LETTERBOX);
        shade.addColorStop(1, LETTERBOX);
        target.fillStyle = shade;
        target.fillRect(x0, r.y, x1 - x0, r.height);
      };

      const AMBIENT_W = 96;
      const ambientFill = document.createElement("canvas");
      const ambientSeam = document.createElement("canvas");
      const fillCtx = ambientFill.getContext("2d");
      const seamCtx = ambientSeam.getContext("2d");
      const paintAmbient = (
        layers: ReturnType<typeof planAt>["layers"],
        width: number,
        height: number,
      ) => {
        if (!fillCtx || !seamCtx) return null;
        const w = AMBIENT_W;
        const h = Math.max(8, Math.round((AMBIENT_W * height) / width));
        for (const c of [ambientFill, ambientSeam]) {
          if (c.width !== w || c.height !== h) {
            c.width = w;
            c.height = h;
          }
        }
        const k = w / width;
        fillCtx.globalCompositeOperation = "source-over";
        fillCtx.filter = "none";
        fillCtx.fillStyle = LETTERBOX;
        fillCtx.fillRect(0, 0, w, h);
        fillCtx.imageSmoothingQuality = "high";
        let frame: { x: number; y: number; width: number; height: number } | null =
          null;
        for (const layer of layers) {
          const img = frameAt(layer.index);
          if (!img) continue;
          // Cover the tiny canvas, anchored on the frame's own centre so the
          // flanks continue the side of the picture they sit beside.
          const scale = Math.max(w / (layer.width * k), h / (layer.height * k));
          const cw = layer.width * k * scale;
          const ch = layer.height * k * scale;
          const cx = (layer.x + layer.width / 2) * k - cw / 2;
          const cy = (layer.y + layer.height / 2) * k - ch / 2;
          const cover = { x: cx, y: cy, width: cw, height: ch };
          const real = {
            x: layer.x * k,
            y: layer.y * k,
            width: layer.width * k,
            height: layer.height * k,
          };
          fillCtx.globalAlpha = layer.alpha;
          fillCtx.drawImage(img, cover.x, cover.y, cover.width, cover.height);
          if (layer.index <= MATTE_LAST) shadeMatte(fillCtx, cover);
          fillCtx.drawImage(img, real.x, real.y, real.width, real.height);
          if (layer.index <= MATTE_LAST) shadeMatte(fillCtx, real);
          frame = real;
        }
        fillCtx.globalAlpha = 1;
        if (!frame) return null;
        // Blur on 96px is nearly free; where `filter` is unsupported the
        // upscale alone still softens it.
        const blur = Math.max(1.5, w / 40);
        seamCtx.globalCompositeOperation = "source-over";
        seamCtx.filter = `blur(${blur}px)`;
        seamCtx.clearRect(0, 0, w, h);
        seamCtx.drawImage(ambientFill, 0, 0);
        seamCtx.filter = "none";
        // Dim it a little toward the window's edges: a surround, not a
        // second subject. Painted before the seam is cut, so both carry it.
        const vignette = seamCtx.createLinearGradient(0, 0, w, 0);
        vignette.addColorStop(0, `${LETTERBOX}8c`);
        vignette.addColorStop(0.3, `${LETTERBOX}1a`);
        vignette.addColorStop(0.7, `${LETTERBOX}1a`);
        vignette.addColorStop(1, `${LETTERBOX}8c`);
        seamCtx.fillStyle = vignette;
        seamCtx.fillRect(0, 0, w, h);
        fillCtx.clearRect(0, 0, w, h);
        fillCtx.drawImage(ambientSeam, 0, 0);
        // The seam layer: the same picture with the frame's interior cut out
        // on a soft edge about two tiny pixels wide -- ~50px of feather on a
        // 2560 window -- so it lies over the frame's border only.
        // Only an edge that ENDS INSIDE the window is feathered: where the
        // frame runs to (or past) the window's edge -- top and foot on every
        // wide screen -- the cut is carried off the canvas, or the real
        // frame's top 50px would be blurred for no seam at all.
        const band = 2;
        const left = frame.x > 0.5 ? frame.x + band : -w;
        const top = frame.y > 0.5 ? frame.y + band : -h;
        const right =
          frame.x + frame.width < w - 0.5 ? frame.x + frame.width - band : w * 2;
        const bottom =
          frame.y + frame.height < h - 0.5 ? frame.y + frame.height - band : h * 2;
        seamCtx.globalCompositeOperation = "destination-out";
        seamCtx.filter = `blur(${band / 2}px)`;
        seamCtx.fillStyle = "#000";
        seamCtx.fillRect(left, top, right - left, bottom - top);
        seamCtx.filter = "none";
        seamCtx.globalCompositeOperation = "source-over";
        return { fill: ambientFill, seam: ambientSeam };
      };

      const relayout = () => {
        draw();
        layoutSheets(section, tierRef.current);
      };

      redrawRef.current = draw;
      relayout();

      // Redraw on ScrollTrigger's refresh, not on raw resize: while pinned,
      // GSAP writes explicit pixel dimensions onto the section, so a resize
      // handler reads the stale pinned size and the fresh one only lands on
      // the next refresh.
      let disposed = false;
      let rafId = 0;
      const onRefresh = () => relayout();
      ScrollTrigger.addEventListener("refresh", onRefresh);
      const observer = new ResizeObserver(() => {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          if (!disposed) relayout();
        });
      });
      observer.observe(section);
      if (document.fonts?.ready) {
        document.fonts.ready.then(() => {
          // A stray global refresh landing inside the next mount's setup is
          // worse than a missed one.
          if (!disposed) ScrollTrigger.refresh();
        });
      }

      const teardown = () => {
        disposed = true;
        cancelAnimationFrame(rafId);
        ScrollTrigger.removeEventListener("refresh", onRefresh);
        observer.disconnect();
        redrawRef.current = () => {};
      };

      // The running head. Its buttons carry an index and nothing else; what
      // that index means in scroll terms is worked out here, differently for
      // each branch, because with the pin there is no element to scroll to --
      // a section is a time on the playhead.
      const navItems = [
        ...section.querySelectorAll<HTMLElement>("[data-nav-item]"),
        // The reduced-motion column is rendered OUTSIDE this section and has
        // to be: pin:true reparents the section into a spacer, so anything
        // React places beside it has to be a sibling of the wrapper instead.
        // Its contents list and its call to action carry nav items too, and
        // querying the section alone left every one of them inert for the
        // readers who only ever see that column.
        ...document.querySelectorAll<HTMLElement>(
          "[data-book-column] [data-nav-item]",
        ),
      ];
      const headNav = section.querySelector<HTMLElement>("[data-book-nav]");
      const runningHead =
        section.querySelector<HTMLElement>("[data-running-head]");
      const thumbIndex = section.querySelector<HTMLElement>("[data-book-index]");
      let goTo = (_index: number, _last?: boolean) => {};
      // Every nav item carries a CHAPTER, which is what the running head and
      // the thumb index deal in. There was a second currency until 03 stopped
      // paginating: its process index carried a SPREAD, because its six
      // entries were six PAGES of one chapter and a chapter number sent all
      // six to the half-title the reader was already looking at. 03 is one
      // spread now and prints all six stages on it, so there is nothing left
      // to address and nothing to bind -- `data-spread`, `data-approach` and
      // the seek that served them are all gone, and a nav item is one thing.
      const onNavClick = (event: Event) => {
        const el = (event.currentTarget ?? event.target) as HTMLElement;
        // `data-page="last"` asks for the chapter's LAST sheet rather than
        // where it opens: the cover's "Begin a project" goes straight to 07's
        // recto (Email us / Call us), which on a phone is the second of that
        // chapter's two pages.
        goTo(Number(el.dataset.index), el.dataset.page === "last");
      };
      for (const el of navItems) el.addEventListener("click", onNavClick);
      const dropNav = () => {
        for (const el of navItems) el.removeEventListener("click", onNavClick);
      };

      // --- the windows: 04's project stage and 05's volvelle ----------------
      //
      // Two chapters have a fixed window and an index that changes what is in
      // it. 04 shows one 16:9 plate of four; 05 shows one of six opinions. The
      // mechanism is identical and the settings are not, which is exactly the
      // case for one binder called twice rather than two handlers.
      //
      // It was called three times for one revision: 03 was a window too. It is
      // a printed spread again -- all six stages set, nothing behind a click --
      // so it binds nothing. Two chapters are also the most this mechanism
      // should carry: three consecutive windows stopped reading as three
      // chapters, which is the note CLAUDE.md keeps about it.
      //
      // Queried from the DOCUMENT rather than from the section, and for a
      // reason that is not the reduced-motion column's: the two halves of a
      // spread are DIFFERENT SHEETS -- a verso is the back of the sheet before
      // it -- so an index and the panels it drives are in sibling subtrees with
      // nothing above them to hold state. There is also more than one copy of
      // each: <FacingCopy> and <PageBody> both render for the portrait
      // fallback, and again in the column. Setting them all keeps every copy in
      // step, which is simpler than deciding which is live.
      const windowTeardowns: (() => void)[] = [];
      const bindWindow = (group: string) => {
        const buttons = [
          ...document.querySelectorAll<HTMLElement>(`[data-${group}]`),
        ];
        if (!buttons.length) return;
        // Everything the index drives. A panel is the copy; a plate is the
        // picture, which 04 has and 05 does not, and they live in separate
        // grids so the image can be a fixed 16:9 box while the letterpress
        // under it is sized by its longest member.
        const driven = [
          ...document.querySelectorAll<HTMLElement>(`[data-${group}-panel]`),
          ...document.querySelectorAll<HTMLElement>(`[data-${group}-plate]`),
        ];
        const key = `${group}Panel`;
        const plateKey = `${group}Plate`;
        const count = new Set(buttons.map((el) => el.dataset[group])).size;

        // The phone carousel's tracks. `--slide` moves them by whole plates;
        // a spread has no track transform and ignores it.
        const tracks = [
          ...document.querySelectorAll<HTMLElement>(`[data-${group}-track]`),
        ];
        let current = 0;
        const show = (index: number) => {
          // Hover fires on every entry into a row; the server render already
          // marks entry 0 current, so the same index is always a no-op.
          if (index === current) return;
          current = index;
          for (const track of tracks) {
            track.style.setProperty("--slide", String(index));
          }
          for (const el of buttons) {
            const on = Number(el.dataset[group]) === index;
            el.dataset.current = String(on);
            // aria-current, not aria-selected: these are not tabs owning a
            // panel they can point at. An id would have to be unique and the
            // markup exists three times over.
            if (on) el.setAttribute("aria-current", "true");
            else el.removeAttribute("aria-current");
          }
          for (const el of driven) {
            const at = el.dataset[key] ?? el.dataset[plateKey];
            const on = Number(at) === index;
            el.dataset.current = String(on);
            // Copy leaves the accessibility tree when it is not showing, so a
            // screen reader is not read four projects where the page shows
            // one. The plates are not touched: their alt text is already
            // reachable only through the panel that is current, and an
            // aria-hidden <img> that is about to fade in reads as a flicker to
            // some AT.
            if (el.dataset[key] === undefined) continue;
            if (on) el.removeAttribute("aria-hidden");
            else el.setAttribute("aria-hidden", "true");
          }
        };

        const onClick = (event: Event) => {
          const el = (event.currentTarget ?? event.target) as HTMLElement;
          show(Number(el.dataset[group]));
        };
        // Arrow keys move between entries and carry focus with them, which is
        // what a reader who is not using a mouse expects of a list that changes
        // something. Home and End go to the ends.
        const onKey = (event: Event) => {
          const k = (event as KeyboardEvent).key;
          const el = (event.currentTarget ?? event.target) as HTMLElement;
          const at = Number(el.dataset[group]);
          let next = at;
          if (k === "ArrowRight" || k === "ArrowDown") next = at + 1;
          else if (k === "ArrowLeft" || k === "ArrowUp") next = at - 1;
          else if (k === "Home") next = 0;
          else if (k === "End") next = count - 1;
          else return;
          event.preventDefault();
          next = (next + count) % count;
          show(next);
          // Focus the same index on whichever COPY of the index this key
          // came from, so focus does not jump to another one.
          //
          // Scoped to the enclosing <nav> and NOT to a landmark name. It was
          // the name for as long as every copy of an index shared one -- the
          // verso, the portrait duplicate and the reduced-motion column are
          // all "Projects" -- and 04's head index broke that: it is a fourth
          // copy driving the same four plates under its own name, "Project
          // index", because two landmarks announced identically while going to
          // the same place by different routes is the thing that name exists
          // to prevent. Keyed on the name, an arrow press inside the head
          // index matched nothing, fell back to the document, and moved focus
          // to the verso list a page away. Every copy is a <nav>; none of them
          // nests inside another.
          const scope = el.closest("nav") ?? document;
          scope.querySelector<HTMLElement>(`[data-${group}="${next}"]`)?.focus();
        };

        // HOVER: a mouse moved over an entry shows it, so sweeping down the
        // index previews all four studies without a click. Mouse only --
        // on touch a pointerenter arrives with the tap and the click already
        // does the job, and a pen hovering is not a reader choosing.
        const onEnter = (event: Event) => {
          if ((event as PointerEvent).pointerType !== "mouse") return;
          const el = (event.currentTarget ?? event.target) as HTMLElement;
          show(Number(el.dataset[group]));
        };

        // DRAG: across the plate, one study per STEP pixels, as many steps as
        // the drag is long -- so a single sweep walks through all four and
        // back. Dragging LEFT moves forward, the way a swipe turns a page.
        // Pointer capture keeps the drag alive when the cursor leaves the
        // plate; the stage's `touch-action: pan-y` keeps vertical movement
        // for the book's scroll.
        const STEP = 48;
        const stages = [
          ...document.querySelectorAll<HTMLElement>(`[data-${group}-stage]`),
        ];
        // CAROUSEL (one page per sheet, `data-carousel`): the track follows
        // the finger and, on release, goes to the next or previous project
        // past 20% of the plate's width or springs back under it. The ends
        // resist (a third of the movement) instead of wrapping, so a reader
        // can feel there is nothing further. A spread keeps the stepping
        // drag below, where the plates crossfade in place.
        let drag: {
          id: number;
          x: number;
          x0: number;
          carousel: boolean;
          width: number;
        } | null = null;
        const setDrag = (px: number) => {
          for (const track of tracks) {
            track.style.setProperty("--drag", `${px}px`);
          }
        };
        const onDown = (event: Event) => {
          const e = event as PointerEvent;
          if (e.pointerType === "mouse" && e.button !== 0) return;
          // A press on a CONTROL inside the plate is not a drag. 04's live
          // plate carries a browser bar (desktop / phone, reload, open), and
          // capturing the pointer here retargeted its pointerup to the stage,
          // so those buttons never received their click -- the phone toggle
          // "did not work" under a real mouse.
          if ((e.target as Element | null)?.closest("button, a, input, iframe")) {
            return;
          }
          const stage = e.currentTarget as HTMLElement;
          drag = {
            id: e.pointerId,
            x: e.clientX,
            x0: e.clientX,
            carousel: stage.dataset.carousel === "true",
            width: stage.getBoundingClientRect().width || 1,
          };
          // Capture keeps the drag alive once the cursor leaves the plate.
          // Guarded: it throws when the pointer is no longer active, which a
          // synthetic event and some browsers both manage, and a drag that
          // only works inside the box is better than a handler that dies.
          try {
            stage.setPointerCapture(e.pointerId);
          } catch {}
          stage.dataset.dragging = "true";
        };
        const onMove = (event: Event) => {
          const e = event as PointerEvent;
          if (!drag || e.pointerId !== drag.id) return;
          if (drag.carousel) {
            let dx = e.clientX - drag.x0;
            if ((current === 0 && dx > 0) || (current === count - 1 && dx < 0)) {
              dx /= 3;
            }
            setDrag(dx);
            return;
          }
          const dx = e.clientX - drag.x;
          if (Math.abs(dx) < STEP) return;
          const steps = Math.trunc(dx / STEP);
          show((((current - steps) % count) + count) % count);
          drag.x += steps * STEP;
        };
        const onUp = (event: Event) => {
          const e = event as PointerEvent;
          if (!drag || e.pointerId !== drag.id) return;
          const stage = e.currentTarget as HTMLElement;
          try {
            if (stage.hasPointerCapture(e.pointerId)) {
              stage.releasePointerCapture(e.pointerId);
            }
          } catch {}
          stage.dataset.dragging = "false";
          if (drag.carousel) {
            const dx = e.clientX - drag.x0;
            const threshold = drag.width * 0.2;
            if (dx < -threshold && current < count - 1) show(current + 1);
            else if (dx > threshold && current > 0) show(current - 1);
            setDrag(0);
          }
          drag = null;
        };

        for (const el of buttons) {
          el.addEventListener("click", onClick);
          el.addEventListener("keydown", onKey);
          el.addEventListener("pointerenter", onEnter);
        }
        for (const stage of stages) {
          stage.addEventListener("pointerdown", onDown);
          stage.addEventListener("pointermove", onMove);
          stage.addEventListener("pointerup", onUp);
          stage.addEventListener("pointercancel", onUp);
        }

        windowTeardowns.push(() => {
          for (const el of buttons) {
            el.removeEventListener("click", onClick);
            el.removeEventListener("keydown", onKey);
            el.removeEventListener("pointerenter", onEnter);
          }
          for (const stage of stages) {
            stage.removeEventListener("pointerdown", onDown);
            stage.removeEventListener("pointermove", onMove);
            stage.removeEventListener("pointerup", onUp);
            stage.removeEventListener("pointercancel", onUp);
          }
        });
      };
      // ONE window left in the book. 04's project stage is the only chapter
      // that still shows one of several things in a fixed frame.
      //
      // It has been three calls and two. 03 was a window until its six stages
      // were printed on one spread, and 05 until the same argument was made
      // about its six perspectives: a reader should not have to operate a page
      // before it will tell them anything. The factory stays because 04 is
      // genuinely the case for it -- four full-measure photographs of software
      // cannot be printed four-up at a size where they can be read.
      bindWindow("project");
      const dropWindows = () => {
        for (const drop of windowTeardowns) drop();
        windowTeardowns.length = 0;
      };

      if (reduced) {
        // Park the book open and let <BookPageColumn> below carry the copy.
        scroll.u = 1;
        draw();
        gsap.set([kickerRef.current, cueRef.current, bandRef.current], { autoAlpha: 1, y: 0 });
        // Reduced motion has no spread and no fore-edge -- it is an ordinary
        // scrolling column -- so the head bar stays and the thumb index, which
        // only makes sense on an open book, is not shown at all.
        // A plain column shows every picture at once.
        releaseBookImages();
        gsap.set(thumbIndex, { autoAlpha: 0 });
        // No timeline to seek, and no business animating a scroll for someone
        // who asked for less motion: jump.
        goTo = (index) => {
          const target =
            index < 0
              ? null
              : document.getElementById(`section-${BOOK_PAGES[index]?.number}`);
          if (target) target.scrollIntoView();
          else scrollToY(0);
        };
        return () => {
          dropNav();
          dropWindows();
          teardown();
        };
      }

      const sheets = [
        ...section.querySelectorAll<HTMLElement>("[data-sheet]"),
      ];
      // The opening spread's left-hand page. It is not a sheet -- it never
      // turns; sheet 0's back simply covers it -- but it has to be hidden and
      // revealed on the same beat as the sheets, so it rides along with them.
      const facing = section.querySelector<HTMLElement>("[data-left-page]");
      const curtain = facing ? [...sheets, facing] : sheets;
      const paint = () =>
        paintSheets(sheets, (sheet) =>
          Number(gsap.getProperty(sheet, "rotationY")),
        );

      let gestureFrom: number | null = null;
      // `?nosnap` turns the snap off, for QA only: with it on, every stop the
      // screenshot harness makes is pulled to a page at rest, so a fault that
      // lives MID-TURN can never be photographed (`scroll-shots --no-snap`).
      const noSnap = new URLSearchParams(window.location.search).has("nosnap");
      // True while the book is being MOVED for the reader -- a sideways drag
      // under the finger, or a seek landing after a tap or a swipe. The snap
      // stands aside meanwhile: both settling the same scroll at once is what
      // left a sideways swipe on a real Pixel 5 doing nothing, two pages, or
      // stopping between pages (1468) across eight tries.
      let seeking = false;
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: scrollLength(turns, single),
          // Shorter in portrait: the catch-up that reads as weight under a
          // wheel reads as lag under a finger, and a dragged page that
          // arrives a second late is not the page you are dragging. Not as
          // short as 0.3, which was tried: a thumb swipe's momentum crosses
          // a whole turn in ~130ms, and at 0.3 the leaf followed it -- a
          // recorded Pixel 5 turn was four frames, which reads as a cut.
          scrub: single ? 0.7 : SCRUB,
          // In the touch box the book is held by CSS `position: sticky` (see
          // index.css) over a spacer of exactly this trigger's length, and
          // NOT pinned. Both of GSAP's pins were wrong there, and measured on
          // a real Pixel 5: `pinType: "fixed"` makes the section a fixed
          // element, and Chrome hands a touch on a fixed element to the
          // DOCUMENT -- which cannot scroll -- so the box never moved (y=0
          // after five swipes) and the address bar still slid; a transform
          // pin repositions the section on the main thread a frame behind
          // the compositor's scroll and shakes. Sticky is in flow, so a touch
          // scrolls the box, and the compositor holds it still.
          ...(box
            ? { scroller: box, pin: false }
            : { pin: true, anticipatePin: 1 }),
          // A PAGE COMES TO REST OPEN, never half turned -- and it rests on
          // the page the reader was HEADING FOR. Stop mid-turn and the scroll
          // settles on the next page in the direction of the last scroll,
          // the way a paged scroll view on iOS commits to a swipe.
          //
          // Directional, not nearest. Nearest was the first version, and on a
          // real phone it made going BACK impossible: a page costs ~513px of
          // scroll at 393x851 and a relaxed thumb swipe moves 200-300, so
          // every swipe back stopped short of halfway and was pulled straight
          // back to the page it started on (two swipes back on a Pixel 5 left
          // the scroll at y=1664 both times). Only a movement under STAY --
          // 6% of a page, a jitter rather than a decision -- falls back.
          //
          // The opening is never snapped: it is a film the reader scrubs, and
          // it is how the cover is reached again -- the first version pulled
          // the last 30% of it forward onto page 1, so a reader scrolling back
          // could not get past it to the cover. `inertia` is off: the
          // browser's own momentum has played out by the time this runs, and
          // ScrollTrigger's projection on top of it read a scrollbar drag or
          // a keyboard jump as a huge flick. Snapping waits for the pointer
          // to lift, so it never fights the drag-to-turn below.
          snap: {
            snapTo: (progress: number, self?: ScrollTrigger) => {
              const total = tl.duration();
              const time = progress * total;
              if (seeking || noSnap || time < OPEN) return progress;
              const rests: number[] = [];
              for (let i = 0; i <= turns; i++) rests.push(timeOf(i));
              let near = rests[0] ?? time;
              for (const rest of rests) {
                if (Math.abs(rest - time) < Math.abs(near - time)) near = rest;
              }
              const PAGE = TURN + GAP;
              const STAY = PAGE * 0.06;
              if (Math.abs(near - time) <= STAY) return near / total;
              // ONE SWIPE IS ONE PAGE, counted from where the swipe STARTED.
              // Counted from where it stopped, a thumb swipe that ran a
              // little long was "heading for" the page after the one it
              // reached: a Pixel 5 swipe out of the film's last frames went
              // 1219 -> 1896 and skipped 01's first page, the chapter's
              // headline, entirely. Only a real fling -- over 1.5 pages of
              // travel -- is taken at its word and settles past.
              // Clamped to the pages: at the end the scroll runs on into the
              // trail, and a swipe back counted from there found the LAST page
              // one page back -- the page already on screen -- so the leaf
              // lifted and fell back where it was.
              const first = rests[0] ?? time;
              const last = rests[rests.length - 1] ?? time;
              const from = Math.min(Math.max(gestureFrom ?? time, first), last);
              const forward = (self?.direction ?? 1) > 0;
              if (forward) {
                if (time - from <= PAGE * 1.5) {
                  const next = rests.find((rest) => rest > from + STAY);
                  if (next !== undefined && next <= time + PAGE) return next / total;
                }
                const next = rests.find((rest) => rest > time);
                // Past the last page is the trail: nothing to settle on.
                return next === undefined ? progress : next / total;
              }
              if (from - time <= PAGE * 1.5) {
                let back: number | undefined;
                for (const rest of rests) if (rest < from - STAY) back = rest;
                if (back !== undefined && back >= time - PAGE) return back / total;
              }
              let prev: number | undefined;
              for (const rest of rests) if (rest < time) prev = rest;
              // Back from page 1 into the lead-in: free, toward the film.
              return prev === undefined ? progress : prev / total;
            },
            inertia: false,
            duration: { min: 0.3, max: 0.7 },
            delay: 0.12,
            ease: "power3.out",
          },
        },
      });

      // The one moment the whole timeline hangs off: the book is open and the
      // pages take over. Named rather than repeated as a number, so moving it
      // means changing OPEN and nothing else.
      tl.addLabel("pages", OPEN);

      // --- the book opens -------------------------------------------------
      //
      // fromTo, not to: the reduced-motion branch parks the scroll at the end,
      // and this callback re-runs when the query flips -- a relative tween
      // would then be a no-op.
      //
      // onUpdate lives on this tween rather than on the timeline so the canvas
      // is only repainted while the opening is actually moving. On the
      // timeline it would redraw 91 frames' worth of compositing under every
      // page turn, for a picture that cannot change.
      //
      // THE COVER'S SOUNDS hang off the same update, so they follow the FILM
      // and not the wheel: the close is a thump, and it has to land on the
      // frame where the covers meet, not up to a scrub's catch-up before it
      // (the page turn reads the scroll instead -- see onScrollSound -- because
      // a rustle that starts early reads as the paper lifting; a thud that
      // arrives early reads as a mistake). Read off the frames themselves:
      // frame-038 is the last with the covers together and frame-039 the
      // first with a gap at the foot, so the book opens as the playhead
      // passes index 38 and shuts as it falls back to 37. The one-frame band
      // between is hysteresis: a scroll resting on the hinge cannot drum
      // open-close-open. The first update only records which side it is on,
      // so a reload restored mid-book does not announce a cover.
      const COVER_PARTS = 38 / (FRAME_COUNT - 1);
      const COVER_SHUT = 37 / (FRAME_COUNT - 1);
      let coverOpen: boolean | null = null;
      const syncCover = () => {
        if (coverOpen === null) coverOpen = scroll.u >= COVER_PARTS;
        else if (!coverOpen && scroll.u >= COVER_PARTS) {
          coverOpen = true;
          window.dispatchEvent(new CustomEvent("book:open"));
        } else if (coverOpen && scroll.u <= COVER_SHUT) {
          coverOpen = false;
          window.dispatchEvent(new CustomEvent("book:close"));
        }
      };
      tl.fromTo(
        scroll,
        { u: 0 },
        {
          u: 1,
          duration: OPEN,
          onUpdate: () => {
            draw();
            syncCover();
            // A reader opening the book will reach the pages before a slow
            // connection has finished the film: start the pictures now.
            if (scroll.u > 0.12) releaseBookImages();
          },
        },
        0,
      );

      // Wordmark is visible on load; fade it out before the book visibly
      // starts opening so the reveal gets a clean, text-free stage.
      if (kickerRef.current) {
        tl.to(
          [kickerRef.current, cueRef.current, bandRef.current].filter(Boolean),
          { autoAlpha: 0, y: -16, duration: 0.1 * OPEN },
          0.05 * OPEN,
        );
      }

      // --- the pages turn --------------------------------------------------
      //
      // The sheets are hidden until the book has finished opening, or their
      // opaque frame-091 paper would cover the opening book. They are switched
      // on with a set rather than faded: the paper is the same photograph the
      // canvas is showing by then, at the same rect, so there is nothing to
      // dissolve -- and an opacity between 0 and 1 is a grouping value that
      // forces transform-style:flat, which would drop the sheets out of the 3D
      // context at exactly the wrong moment.
      gsap.set(curtain, { autoAlpha: 0 });
      tl.set(curtain, { autoAlpha: 1 }, "pages");
      paint();

      // Only the ink arrives. The first page's type fades up over the paper
      // that was already there, on a face that its own overflow clip has
      // already flattened, so opacity costs nothing in 3D terms here.
      //
      // Left page first, then the right: the order this array is built in is
      // the order the stagger below plays, so it has to be reading order.
      const ink = [
        ...(facing?.querySelectorAll<HTMLElement>("[data-ink]") ?? []),
        ...(sheets[0]?.querySelectorAll<HTMLElement>("[data-ink]") ?? []),
      ];
      if (ink.length) {
        tl.fromTo(
          ink,
          { autoAlpha: 0 },
          {
            autoAlpha: 1,
            // Split the lead-in between how long one block takes and how far
            // apart the blocks are, so the whole spread still finishes landing
            // exactly on LEAD_IN however many blocks the opener happens to
            // have. A stagger rather than one fade because the spread then
            // arrives the way a reader takes it in -- title, then the line
            // under it, then the paragraph -- instead of all at once.
            duration: LEAD_IN * 0.55,
            stagger: (LEAD_IN * 0.45) / Math.max(1, ink.length - 1),
          },
          "pages",
        );
      }

      // One staggered tween, not five hand-positioned ones. Same animation on
      // every sheet at a fixed offset is exactly what stagger is for, and it
      // collapses five tweens and five onUpdate callbacks into one of each --
      // the callback can then paint the whole stack in a single pass instead
      // of each sheet racing to set its own z-index.
      //
      // Linear, and linear for a reason that only shows up under a scrub: an
      // eased turn spends most of its angle in the middle of the tween, so the
      // part of the flip worth looking at goes past in a couple of hundred
      // pixels of scroll and the rest is a page lying still. Linear spreads the
      // rotation evenly over the wheel, and the scrub's own catch-up supplies
      // the weight the ease was there for.
      tl.to(
        sheets.slice(0, turns),
        {
          rotationY: -180,
          duration: TURN,
          stagger: TURN + GAP,
          onUpdate: paint,
        },
        `pages+=${LEAD_IN}`,
      );

      // THE TEXT SETTLES AS ITS PAGE IS UNCOVERED -- tied to the turn, never
      // to a clock. Asked for ("smooth animations for the text"), and built
      // so it cannot be the old blink: that was a TIMED fade fired at
      // mid-turn on a page already lying face up and fully printed, so its
      // type vanished and came back. This one starts the instant the turn
      // starts, while the incoming page is still wholly under the sheet, and
      // is SCRUBBED with it -- each block rises 16px into place and comes up
      // from nothing as the leaf lifts off it, reversing exactly when the
      // reader scrolls back. At rest it is simply printed. Opacity is on the
      // INK inside a face, never on a sheet (that flattens the 3D); only the
      // outermost [data-ink] of each face, so nested blocks do not fade twice;
      // and it ends at 97% of the turn, inside the timeline it already had.
      // ...and every HEADING on that page rises word by word from behind its
      // own baseline (GSAP SplitText, asked for: "the GSAP animation for the
      // text, smooth"). Words in a clip box each, not lines: words reflow when
      // the window changes, where split lines would stay broken at the old
      // width. Each clip box is padded below by 0.18em and pulled back by the
      // same, so descenders in a tightly-leaded display headline are not
      // cropped. SplitText instances made here are reverted with the useGSAP
      // context, so a rotate or a reduced-motion switch restores the text.
      const riseWords = (heads: HTMLElement[], at: number, span: number) => {
        const words: HTMLElement[] = [];
        for (const head of heads) {
          const split = SplitText.create(head, { type: "words", mask: "words" });
          for (const m of split.masks as HTMLElement[]) {
            m.style.paddingBottom = "0.18em";
            m.style.marginBottom = "-0.18em";
          }
          words.push(...(split.words as HTMLElement[]));
        }
        if (!words.length) return;
        tl.fromTo(
          words,
          { yPercent: 110 },
          {
            yPercent: 0,
            ease: "power3.out",
            duration: span * 0.7,
            stagger: (span * 0.3) / Math.max(1, words.length - 1),
          },
          at,
        );
      };
      const headingsOf = (face: Element | null | undefined) =>
        face ? [...face.querySelectorAll<HTMLElement>("h2, h3")] : [];

      // The opening spread: its left page and the first sheet's front.
      riseWords(
        [
          ...headingsOf(facing),
          ...headingsOf(sheets[0]?.querySelector("[data-face='front']")),
        ],
        OPEN,
        LEAD_IN,
      );

      // NOT on the turns. Each page's ink used to fade and its headings rise
      // as the leaf lifted off it, and on a Pixel 5 that was the "blinking"
      // reported twice: a rotating sheet shows the page under it from the
      // first degrees of the turn, so the incoming page sat there blank and
      // then filled in, and scrolling BACK emptied a page that was still in
      // full view ("Let's talk about your project" lost its words before the
      // leaf had covered a tenth of it). Paper is printed before it is
      // turned to; the turn is the entrance.

      // Hold on the last page before the pin releases, so it is readable
      // rather than a thing you scroll past.
      tl.to({}, { duration: TRAIL });

      // --- the head bar hands over to the fore-edge -------------------------
      //
      // The bar is right for a closed book and wrong for an open one: its rule
      // spans the window and cuts across the gutter. So it leaves just before
      // the spread arrives and the thumb index takes over, which is a device
      // that lives in the outer margin and never crosses the gutter at all.
      // Both are on the timeline rather than on a scroll listener so scrubbing
      // backwards puts the bar back.
      gsap.set(thumbIndex, { autoAlpha: 0 });
      if (headNav) {
        tl.to(
          headNav,
          { autoAlpha: 0, duration: LEAD_IN * 0.7 },
          `pages-=${LEAD_IN * 0.7}`,
        );
      }
      if (thumbIndex) {
        tl.fromTo(
          thumbIndex,
          { autoAlpha: 0 },
          { autoAlpha: 1, duration: LEAD_IN * 0.8 },
          "pages",
        );
      }

      // --- the running head ------------------------------------------------
      //
      // Where each page sits on the playhead. Page 0 is face up once its ink
      // has landed; page k once sheet k-1 has finished turning, plus half a
      // gap so it is settled rather than only just arrived.
      const timeOf = (index: number) =>
        index <= 0
          ? OPEN + LEAD_IN
          : OPEN + LEAD_IN + (index - 1) * (TURN + GAP) + TURN + GAP * 0.5;

      // contextSafe because this runs from a click long after useGSAP has
      // finished: without it the tween is created outside the context and
      // never gets reverted.
      // The nav's buttons carry a CHAPTER index -- one tab per chapter, however
      // many spreads it runs to -- and the timeline is measured in spreads, so
      // this is where the two meet: a click on a tab goes to where its chapter
      // OPENS.
      // `fromGesture`: the scroll is ALREADY moving under a finger, so the
      // landing starts at speed and only decelerates (power3.out). An inOut
      // ease there starts from rest -- the page visibly stalls the instant
      // the finger lifts and then sets off again, the seam between drag and
      // animation that makes a gesture feel scripted. A tap on a tab starts
      // from rest, so it keeps the symmetric ease, and the duration follows
      // the distance so a chapter next door is not as slow as one across
      // the book.
      const seekSpread = (index: number, fromGesture = false) => {
        const trigger = tl.scrollTrigger;
        if (!trigger) return;
        const y =
          index < 0
            ? 0
            : trigger.start +
              (timeOf(index) / tl.duration()) * (trigger.end - trigger.start);
        const distance = Math.abs(y - scrollY()) / (window.innerHeight || 1);
        seeking = true;
        const settle = () => {
          seeking = false;
        };
        gsap.to(scroller, {
          // autoKill so a flick of the wheel takes the scroll back off the
          // tween rather than fighting it.
          scrollTo: { y, autoKill: true },
          duration: fromGesture
            ? 0.55
            : Math.min(1.4, 0.7 + distance * 0.12),
          ease: fromGesture ? "power3.out" : "power3.inOut",
          overwrite: true,
          onComplete: settle,
          onInterrupt: settle,
        });
      };
      // The page at rest nearest timeline time `t`; -1 on the cover side of
      // the first page.
      const restIndexAt = (t: number) => {
        if (t < OPEN) return -1;
        let best = 0;
        for (let i = 1; i <= turns; i++) {
          if (Math.abs(timeOf(i) - t) < Math.abs(timeOf(best) - t)) best = i;
        }
        return best;
      };
      // A PROJECT TAPPED ON 04'S FIRST PAGE TURNS TO IT, on a phone. The
      // index there changes the plate on the NEXT page, which one page per
      // sheet puts out of sight: on a Pixel 5 a tap on "AI Platform" lit its
      // row and left the reader on the same page with nothing visibly
      // changed -- read as a dead control. On a spread both pages are on
      // screen, so this is phone-only. The carousel's own dots are project
      // buttons too and are on the plate's page already, so they are left out.
      if (single) {
        const onProjectTap = (event: MouseEvent) => {
          const target = event.target as HTMLElement | null;
          const button = target?.closest?.("[data-project]");
          if (!button || button.closest("[data-carousel], [data-project-stage]")) return;
          const sheet = button.closest<HTMLElement>("[data-sheet]");
          const k = sheet ? sheets.indexOf(sheet) : -1;
          if (k >= 0 && k + 1 <= turns) seekSpread(k + 1);
        };
        section.addEventListener("click", onProjectTap);
        windowTeardowns.push(() => section.removeEventListener("click", onProjectTap));
      }
      const lastSheetOf = (chapter: number) =>
        chapterOfSheet.lastIndexOf(chapter);
      const seek = (chapter: number, last = false) =>
        seekSpread(
          chapter < 0
            ? -1
            : last
              ? Math.max(0, lastSheetOf(chapter))
              : (firstSheetOfChapter[chapter] ?? 0),
        );
      // contextSafe is optional in the hook's types, so fall back to the bare
      // function rather than asserting it is there.
      goTo = contextSafe ? contextSafe(seek) : seek;

      // DRAG THE PAGE UNDER THE FINGER, in portrait only.
      //
      // The book is scrubbed by vertical scroll, which is right for a page
      // being read on a desktop and is not how anyone turns a page on a
      // phone. Play Books recomputes its curl from the touch point for as
      // long as the finger is down (US9911221B2), so the page is never doing
      // anything the hand is not; a flick that fires a fixed animation on
      // release is a different feel entirely, and it is what this replaced.
      //
      // The drag does not animate anything itself. It SCROLLS: one page of
      // turn is a known distance on the playhead, so a finger that has
      // travelled 80% of the screen has travelled one page, and the timeline
      // the scroll already drives does the rest. That is why the turn under a
      // finger and the turn under a wheel are the same turn -- there is only
      // one of them.
      //
      // On release it lands: nearest page if the drag did not get past a
      // quarter of the screen, next page if it did.
      if (single) {
        // Bound to the SECTION and not to the stage. The stage is the sheets
        // and nothing else, and the thumb index is pinned over the fore-edge
        // OUTSIDE it: a drag that starts in the right eighth of a phone --
        // which is where a right thumb naturally lands -- began on the index
        // and never reached a listener. Measured with a real touch drag at
        // 393x851: `elementFromPoint(334, 468)` is the index's `<ul>`.
        const stageEl = section;
        const trigger = tl.scrollTrigger;
        if (stageEl && trigger) {
          // How much scroll one turn costs, in pixels -- asked at the START
          // OF EACH DRAG and never cached. ScrollTrigger has not measured
          // itself when this block runs, so `trigger.end` is undefined here
          // and the cached version was NaN: the first drag scrolled the page
          // to 0 and landed a chapter backwards.
          const pageScroll = () =>
            ((TURN + GAP) / tl.duration()) * (trigger.end - trigger.start);
          // A drag of this fraction of the screen is a whole page.
          const REACH = 0.8;
          // Past this fraction, releasing completes the turn.
          const COMMIT = 0.25;
          let drag: {
            id: number;
            x: number;
            y: number;
            from: number;
            px: number;
            // The page the finger went down on. The landing counts from THIS,
            // never from the face-up page syncNav reports: that follows the
            // timeline, which trails the scroll by the scrub, so a drag past
            // mid-turn had already counted the next page and landed TWO on.
            page: number;
            // Decided once, after 10px, and then kept: a vertical swipe that
            // began with a sideways wobble used to set the scroll while the
            // browser was scrolling it natively.
            axis: "x" | "y" | null;
            onIndex: boolean;
            // Release velocity, px/ms, smoothed over the last few moves --
            // a single last event is too noisy to judge a flick by.
            lastX: number;
            lastT: number;
            vx: number;
          } | null = null;
          // One click, captured before the tab's own handler, within the
          // moment a drag that began on a tab ends.
          const swallowClick = () => {
            const eat = (event: Event) => {
              event.preventDefault();
              event.stopPropagation();
            };
            window.addEventListener("click", eat, { capture: true, once: true });
            window.setTimeout(
              () => window.removeEventListener("click", eat, { capture: true }),
              600,
            );
          };
          const onDown = (event: PointerEvent) => {
            if (event.pointerType === "mouse" && event.button !== 0) return;
            // The controls keep their own gestures: a tab is a tap, and 04's
            // plate has a drag of its own that changes the study.
            const target = event.target as HTMLElement | null;
            // EXCEPT the thumb index, whose tabs are taps only. It sits on the
            // fore-edge, which is exactly where a thumb starts a swipe to the
            // next page: on a Pixel 5 a left swipe from x=327 began on a tab
            // and turned nothing. A drag from there turns the page and eats
            // the click it would otherwise end in (see `swallowClick`).
            const onIndex = !!target?.closest?.("[data-book-index]");
            if (
              !onIndex &&
              target?.closest?.("[data-nav-item],[data-project-stage],a,button")
            ) {
              return;
            }
            const st = tl.scrollTrigger;
            drag = {
              id: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              from: scrollY(),
              px: pageScroll(),
              page: st ? restIndexAt(st.progress * tl.duration()) : -1,
              axis: null,
              onIndex,
              lastX: event.clientX,
              lastT: event.timeStamp,
              vx: 0,
            };
          };
          const onMove = (event: PointerEvent) => {
            if (!drag || event.pointerId !== drag.id) return;
            const dx = event.clientX - drag.x;
            const dy = event.clientY - drag.y;
            const dt = event.timeStamp - drag.lastT;
            if (dt > 0) {
              drag.vx = drag.vx * 0.4 + ((event.clientX - drag.lastX) / dt) * 0.6;
              drag.lastX = event.clientX;
              drag.lastT = event.timeStamp;
            }
            if (drag.axis === null) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
              // A mostly-vertical drag is a scroll, and the stage's
              // `touch-action: pan-y` has already given it to the browser.
              drag.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
              if (drag.axis === "y") {
                drag = null;
                return;
              }
              seeking = true;
              if (drag.onIndex) swallowClick();
            }
            const width = window.innerWidth || 1;
            // Left is forward, the way a swipe turns a page.
            const top = Math.max(0, drag.from - (dx / (width * REACH)) * drag.px);
            if (Number.isFinite(top)) scrollToY(top);
          };
          const onUp = (event: PointerEvent) => {
            if (!drag || event.pointerId !== drag.id) return;
            const dx = event.clientX - drag.x;
            const dy = event.clientY - drag.y;
            const width = window.innerWidth || 1;
            const vx = drag.vx;
            const { axis, page } = drag;
            drag = null;
            if (axis !== "x") return;
            const moved = Math.abs(dx) / width;
            // A FLICK turns the page however short it was. Distance alone
            // made a quick 15% swipe -- the commonest way a thumb turns a
            // page -- spring back. Velocity decides when there is any
            // (0.35px/ms is a deliberate flick, not a jittery release), and
            // its SIGN decides the direction, so a drag that changed its
            // mind at the end goes where the finger was last heading.
            const flick = Math.abs(vx) > 0.35;
            const forward = flick ? vx < 0 : dx < 0;
            const next =
              flick || moved >= COMMIT ? page + (forward ? 1 : -1) : page;
            // Back off the cover side has nowhere to go but the cover.
            seekSpread(Math.min(Math.max(next, -1), turns), true);
          };
          stageEl.style.touchAction = "pan-y";
          const stageInner =
            section.querySelector<HTMLElement>("[data-stage]");
          if (stageInner) stageInner.style.touchAction = "pan-y";
          stageEl.addEventListener("pointerdown", onDown);
          stageEl.addEventListener("pointermove", onMove);
          stageEl.addEventListener("pointerup", onUp);
          stageEl.addEventListener("pointercancel", onUp);
          windowTeardowns.push(() => {
            stageEl.removeEventListener("pointerdown", onDown);
            stageEl.removeEventListener("pointermove", onMove);
            stageEl.removeEventListener("pointerup", onUp);
            stageEl.removeEventListener("pointercancel", onUp);
          });
        }
      }

      // Which page is face up. This runs on every scrubbed frame, so it only
      // writes to the DOM when the answer actually changes.
      let lastCurrent = Number.NaN;
      let lastRest = "";
      const syncNav = () => {
        const t = tl.time();
        let current = t >= OPEN + LEAD_IN * 0.5 ? 0 : -1;
        for (let i = 0; i < turns; i++) {
          const midTurn = OPEN + LEAD_IN + i * (TURN + GAP) + TURN * 0.5;
          if (t >= midTurn) current = i + 1;
        }
        // NO INK FADE ON A TURNED PAGE -- it was the phone's "blink". For a
        // few revisions the face that came up faded its type in from 0, so a
        // turn did not land as a cut. But `current` flips at MID-TURN, and by
        // then the incoming page has been lying face up under the turning
        // sheet, fully printed, for half the turn: measured at 393x851, its
        // ink sat at 1, dropped to 0 the frame the turn passed halfway, and
        // took ~350ms to come back -- on every page, and again each time a
        // scroll hovered around the midpoint. The turn IS the page arriving.

        // AT REST OR MOVING, announced on each change: `book:rest` (detail:
        // the chapter lying open, -1 on the cover) once no turn and no film is
        // under way, `book:turning` the moment one starts. 04's live site is
        // what listens -- it loads only at rest on its chapter and leaves on
        // rest anywhere else, because a website loading inside a turn was the
        // stutter in the turns into and out of 04.
        let moving = t > 0.001 && t < OPEN + LEAD_IN;
        for (let i = 0; i < turns && !moving; i++) {
          const start = OPEN + LEAD_IN + i * (TURN + GAP);
          if (t > start && t < start + TURN) moving = true;
        }
        const restKey = moving ? "moving" : `rest:${current}`;
        if (restKey !== lastRest) {
          lastRest = restKey;
          window.dispatchEvent(
            moving
              ? new CustomEvent("book:turning")
              : new CustomEvent("book:rest", {
                  detail: current < 0 ? -1 : (chapterOfSheet[current] ?? -1),
                }),
          );
        }
        if (current === lastCurrent) return;
        lastCurrent = current;
        // Report the chapter, not the spread. A chapter running to two spreads
        // keeps ONE tab lit across both, instead of the index going dark on the
        // continuation because no tab has that spread's number.
        const chapter = current < 0 ? -1 : (chapterOfSheet[current] ?? -1);
        // Announced for anything that follows which chapter is face up (it
        // flips at MID-TURN; for "the book is lying open here" listen to
        // `book:rest` above). An event rather than a prop because the sheets
        // are rendered once and this runs outside React.
        window.dispatchEvent(new CustomEvent("book:chapter", { detail: chapter }));
        for (const el of navItems) {
          const index = Number(el.dataset.index);
          if (index >= 0) el.dataset.current = String(index === chapter);
        }
        // The running head, below `lg` only -- see <BookRunningHead>. Written
        // here and not from a scroll listener because this is the one place
        // that already knows which chapter is face up, and it is guarded by
        // the `current === lastCurrent` return above, so a callback that fires
        // on every scrubbed frame touches the DOM about seven times a pass.
        if (runningHead) {
          const page = chapter >= 0 ? BOOK_PAGES[chapter] : undefined;
          runningHead.textContent = page
            ? `${roman(page.number)} \u2014 ${page.title.toUpperCase()}`
            : "";
          runningHead.style.opacity = page ? "1" : "0";
        }
      };
      tl.eventCallback("onUpdate", syncNav);

      // THE PAGE-TURN SOUND fires the moment a turn BEGINS, read off the
      // SCROLL position (the trigger's progress) rather than the timeline.
      // The timeline trails the wheel by the scrub's catch-up -- up to a
      // second -- and syncNav's page only flips at mid-turn, so a sound hung
      // off either landed well after the page had started to move. A turn in
      // either direction counts; opening the book onto its first page and
      // closing it onto the cover do not.
      let lastStarted = Number.NaN;
      // Where the current scroll GESTURE began, in timeline time, for the
      // snap above. Taken from the INPUT, not from gaps in the scroll: during
      // the film the main thread is busy painting frames, scroll events on a
      // phone arrived more than 160ms apart, and a gap-based start was reset
      // mid-swipe to the swipe's own end (logged: from 4.472 = time 4.472).
      // A finger going down starts a gesture, its momentum after lifting
      // belongs to it; a wheel's first notch after a pause starts one; and
      // only scrolling with neither (the scrollbar, the keyboard) falls back
      // on a pause in the scroll itself.
      const here = () => {
        const st = tl.scrollTrigger;
        return st ? st.progress * tl.duration() : null;
      };
      let touching = false;
      let touchEndedAt = -Infinity;
      let lastWheelAt = -Infinity;
      let lastScrollAt = -Infinity;
      const onTouchStart = () => {
        touching = true;
        gestureFrom = here();
      };
      const onTouchEnd = () => {
        touching = false;
        touchEndedAt = performance.now();
      };
      const onWheel = () => {
        const now = performance.now();
        if (now - lastWheelAt > 250) gestureFrom = here();
        lastWheelAt = now;
      };
      const onScrollGesture = () => {
        const now = performance.now();
        const fromInput =
          touching || now - touchEndedAt < 1500 || now - lastWheelAt < 1500;
        if (!fromInput && now - lastScrollAt > 250) gestureFrom = here();
        lastScrollAt = now;
      };
      const gestureEvents: [string, EventListener][] = [
        ["touchstart", onTouchStart],
        ["touchend", onTouchEnd],
        ["touchcancel", onTouchEnd],
        ["wheel", onWheel],
        ["scroll", onScrollGesture],
      ];
      for (const [type, fn] of gestureEvents) {
        scroller.addEventListener(type, fn, { passive: true });
      }
      windowTeardowns.push(() => {
        for (const [type, fn] of gestureEvents) scroller.removeEventListener(type, fn);
      });
      const onScrollSound = () => {
        const st = tl.scrollTrigger;
        if (!st) return;
        const target = st.progress * tl.duration();
        let started = 0;
        for (let i = 0; i < turns; i++) {
          const begins = OPEN + LEAD_IN + i * (TURN + GAP) + TURN * 0.04;
          if (target >= begins) started = i + 1;
        }
        if (!Number.isNaN(lastStarted) && started !== lastStarted) {
          window.dispatchEvent(new CustomEvent("book:turn"));
        }
        lastStarted = started;
      };
      scroller.addEventListener("scroll", onScrollSound, { passive: true });
      windowTeardowns.push(() =>
        scroller.removeEventListener("scroll", onScrollSound),
      );
      syncNav();

      return () => {
        dropNav();
        dropWindows();
        teardown();
      };
    },
    {
      dependencies: [reduced, single],
      scope: sectionRef,
      // Without this, useGSAP runs the cleanup above on a dependency change
      // but does NOT revert the context -- so the old timeline's pinned
      // ScrollTrigger keeps its pin spacing and the inline styles written by
      // gsap.set stay on the DOM. Reverting is also what kills a pinned
      // trigger properly; doing it by hand with kill(true) covers the spacing
      // but never the styles.
      revertOnUpdate: true,
    },
  );

  return (
    <div ref={scrollerRef} data-scroller>
      {/* This wrapper exists for ScrollTrigger, and removing it breaks the
          page at runtime. (On a touch screen it is also the box the book
          scrolls in -- `data-scroller`, see index.css.) pin:true does not style the section in place -- it
          builds a div.pin-spacer, inserts it where the section was, and moves
          the section inside it (ScrollTrigger.js: `pin.parentNode.insertBefore
          (spacer, pin); spacer.appendChild(pin)`). React is not told, so it
          goes on believing the section is still a direct child of the body
          container, and the next time it places or removes a sibling there it
          calls insertBefore against a node that has been reparented and throws
          "NotFoundError: The node before which the new node is to be inserted
          is not a child of this node".
          With this div in the way, the thing React holds a reference to is the
          div -- which GSAP never touches -- and the spacer is built inside it
          instead. */}
      <section
        ref={sectionRef}
        className="relative h-svh w-full overflow-hidden [--page-vw:min(1vw,1.4vh)] [--pu:min(1vw,1.6cqh)]"
        /* --pu is THE PAGE UNIT every size on a page is set in: 1vw where the
           window is 16:10 or narrower, and 1.6% of the PAGE's own height
           (cqh -- every face is a size container) where it is wider. Sizes
           used to be plain vw while the page is sized by the window's
           HEIGHT, so on a wide, short browser window -- a 1920x1080 laptop
           at 125% is ~1536x730 once the browser's own bars are gone -- the
           page shrank and the type did not: 01's figure ran into its
           footnote, 04's colophon into its facts, 07's timeline off the
           foot. 1.6 is 1440x900's aspect, where the book was set, so
           there the unit is exactly 1vw; phones and portrait tablets are
           always the 1vw side, and unchanged.

           --page-vw is 1vw on tall windows and follows the HEIGHT on anything
           wider than 1.4:1. 03 and 05 fill their pages to the pixel and size
           their type with it: in plain vw, 03's last stage ran 100px off the
           recto at 1440x900 and 1280x800, and off the foot at 1280x720 and
           1366x768 too. Measured with it, the last line clears the folio by
           8-19px from 1024x768 to 1920x1080.

           Colour comes from the frames themselves rather than a matching
           literal, so a rebuilt set cannot leave the section a different colour
           to the canvas sitting on it. */
        style={{ backgroundColor: LETTERBOX }}
      >
        <canvas
          ref={canvasRef}
          // Fades up ONCE, when its first frame is drawn (draw() sets
          // data-ready). It used to go from the letterbox colour to the full
          // photograph in one frame ~0.9-1.1s after load, the last of the
          // three "blinks" a refresh showed. The section behind it is the
          // same letterbox colour, so hidden it is invisible, not a hole.
          className="absolute inset-0 h-full w-full opacity-0 transition-opacity duration-700 ease-out data-[ready=true]:opacity-100 motion-reduce:transition-none"
          role="img"
          aria-label="A navy book embossed with the Nivlak logo opening on a slate plinth until its spread fills the frame"
        />

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent via-45% to-black/35" />

        {/* THE HERO, in the mockup's own words (front.jpeg).
            The book stands in the right half of the frame with the whole left
            side empty, so on landscape the copy goes in that gap rather than
            across the cover. A portrait viewport letterboxes the frame into a
            band, so there the copy sits under the band instead -- left-aligned
            either way, which is how the mockup sets it.

            Everything lives inside ONE block because <Book> fades exactly one
            element out before the reveal starts (`kickerRef`); a second would
            need a second ref and a second tween kept in step with it. The
            wrapper is `pointer-events-none` and the two buttons switch it back
            on, so the cover's copy never eats a click meant for the page and
            the buttons stop taking them the moment GSAP hides the block.  */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-center px-[7vw] text-left portrait:justify-stretch portrait:pt-[9vh] portrait:pb-[calc(10vh+2.6rem)] portrait:[@media(max-height:700px)]:pb-[calc(8vh+2.5rem)] landscape:ps-[7vw] landscape:pe-[4vw]">
          <div
            ref={kickerRef}
            // The hero sits DIRECTLY on the photograph in portrait, with no
            // scrim under it. There was one -- a gradient from the foot to
            // 74% -- and it was on screen for the whole reveal, so the book
            // opened behind a curtain: measured on a Pixel 5, the first three
            // frames of the opening were half black. Legibility is paid for
            // by the type itself now (the shadow below), which costs the
            // photograph nothing.
            style={{ textShadow: "0 1px 18px rgba(3,9,18,0.85), 0 1px 3px rgba(3,9,18,0.9)" }}
            // In rem and not ch: `ch` resolves against THIS element's font
            // size (the base 16px), not the headline's, so 54ch was 432px and
            // broke "of What We Build." across three lines at 1440. 41rem is
            // 656px, which clears the book -- the photograph's spine starts
            // around x=700 there -- and holds the headline on two.
            // PORTRAIT SETS THE COVER AS A POSTER, and the split is the whole
            // idea: the title goes ABOVE the book and the way in goes BELOW
            // it, both centred on the book's own axis, so the photograph sits
            // inside the words rather than beside them. The copy left in a
            // block with the picture somewhere else is what this replaced --
            // two objects on one screen, which is what it looked like.
            //
            // Measured at 393x851, where the book's box runs y=238..613: the
            // title lands 166 and the way in starts 675, so each band clears
            // the picture by about 60px and nothing is printed on it.
            //
            // It is still ONE element -- `kickerRef` -- because <Book> fades
            // exactly one thing out before the reveal. The two groups inside
            // it are what `justify-between` pushes apart; in landscape they
            // are simply two divs in the same left-aligned column, which is
            // the setting the mockup has.
            className="max-w-[min(92vw,41rem)] portrait:flex portrait:h-full portrait:max-w-none portrait:flex-col portrait:items-center portrait:justify-between portrait:text-center"
          >
            <div className="portrait:w-full">
              {/* The eyebrow: the company's name and nothing else. It was led
                  in by a short hairline and followed by "· Software studio";
                  both were removed on request. Flush left it starts on the
                  same edge as the headline under it; in portrait it is
                  centred over the title like everything else there. */}
              <p data-rise className="text-[clamp(0.55rem,0.78vw,0.72rem)] tracking-[0.42em] text-slate-300/85 uppercase motion-safe:opacity-0">
                Nivlak Technologies
              </p>
            {/* THE COVER IS LEADED, asked for as "line spacing in all". Every
                gap in the column went up by about half -- headline 2.2 -> 3.6vh,
                tagline 2.4 -> 4vh, buttons 3.4 -> 5vh, services 3 -> 4.6vh --
                and the headline's own leading 1.02 -> 1.12, which is what took
                the italic line's ascenders off the first line's descenders. The
                column is centred, so it grows both ways: at 1280x720, the
                shortest landscape checked, it runs y=178..540 and still clears
                the book. Portrait takes a smaller share (the two groups are
                pushed apart by the book, not by these margins). */}
            {/* Two lines, and the second one is the mockup's blue. The break is
                hard rather than left to the measure: "THE STORY / OF WHAT WE
                BUILD." is the line it is written on, and a reflow that puts
                "OF" on the first line loses the sentence. */}
            {/* A size down in portrait, and it is the plate above that pays
                for it: the title block has the screen BELOW the photograph and
                nothing more, measured at 365px at 393x851, where the block ran
                414 at the landscape sizes. The alternative was cropping the
                plate, which is the one thing the first screen is for. */}
            <h1 data-rise className="mt-[3.6vh] font-[family-name:var(--font-display)] text-[clamp(2.1rem,5.2vw,4.6rem)] leading-[1.12] font-light text-white portrait:mt-[2.4vh] portrait:text-[clamp(1.7rem,8vw,2.4rem)] motion-safe:opacity-0">
              The Story
              {/* The blue line, in the display ITALIC so the two lines read as
                  a title and its turn rather than one sentence in two colours.

                  `textShadow: none` is a fix, not taste. The block's shadow is
                  inherited, and on text whose colour is transparent (the
                  gradient is a background clipped to the glyphs) Chrome paints
                  the shadow OVER that background -- the blue came out a murky
                  slate grey. The depth goes back as a `drop-shadow` filter,
                  which is drawn behind the painted glyphs. A filter is safe
                  here: this is the cover, not a sheet. */}
              <span
                className="block bg-gradient-to-r from-[#9dc0ee] via-[#bcd4f2] to-[#e6eefa] bg-clip-text pe-[0.08em] text-transparent italic [filter:drop-shadow(0_2px_14px_rgba(3,9,18,0.7))]"
                style={{ textShadow: "none" }}
              >
                of What We Build.
              </span>
            </h1>
            </div>

            {/* ...and everything a reader can ACT on goes under the book. */}
            <div className="portrait:w-full">
            <p data-rise className="mt-[4vh] leading-[1.7] text-[clamp(0.78rem,1.15vw,1.05rem)] tracking-[0.12em] text-slate-300/85 portrait:mt-[1.6vh] motion-safe:opacity-0">
              Technology built around your business.
            </p>

            {/* The two ways in, and both are the BOOK's own navigation --
                `data-nav-item` with a chapter index, wired by the same handler
                the head bar and the thumb index use. A third kind of link that
                merely looks like them would drift out of step the first time
                the seek changes. */}
            {/* ONE ROW in portrait, and the tracking is what buys it. Two
                stacked buttons cost 42px of a title block that has the screen
                under the plate and nothing else; at 0.2em and 0.8rem of
                padding the pair measures 322px of the 338 available at
                393x851 and 273 of 275 at 320x568, which is the narrowest
                phone this book is checked at. `flex-wrap` is still the
                backstop under that. */}
            {/* THE HERO'S OWN BUTTONS, and deliberately not the book's.
                Everywhere inside the book an action is a hairline box in
                tracked caps, because it is printed on a page. The cover is not
                a page -- it is the one screen that has to be SELLING -- so it
                sets its actions the way the site's front door should: a solid
                primary and a glass secondary, both pills.

                - The primary is the book's paper colour (#dce7f7) with navy
                  type, the brightest object on the screen after the embossed
                  logo. A sheen crosses it on hover, and the arrow sits in its
                  own disc and moves.
                - The secondary is frosted glass over the photograph, so it
                  reads as an option rather than as a second primary.
                - `[text-shadow:none]` on both: the block's shadow is for type
                  on a photograph, and on the primary it put a dark smear under
                  navy letters on a light fill.
                - The focus ring is drawn outside the pill, in the headline's
                  blue, because both fills are close to what surrounds them.

                Under 340px wide (a folding phone's 280px cover screen) the type
                drops to 0.44rem and 0.1em: wrapped to two rows there, the
                taller group pushed the tagline up onto the book.

                ONE ROW in portrait, and that constraint is unchanged: at
                0.5rem, 0.18em of tracking and 0.8rem of side padding the pair
                fits the 338px a 393px phone has, and `flex-wrap` is the
                backstop for narrower ones. */}
            <div data-rise className="mt-[5vh] flex flex-wrap items-center gap-[clamp(0.6rem,1.1vw,1rem)] portrait:mt-[3.2vh] portrait:justify-center portrait:gap-[0.5rem] motion-safe:opacity-0">
              <button
                type="button"
                data-nav-item
                data-index={BOOK_PAGES.length - 1}
                data-page="last"
                className="group pointer-events-auto inline-flex cursor-pointer items-center gap-[0.8em] rounded-full border border-white/25 bg-white/[0.06] px-[clamp(1.1rem,1.9vw,1.6rem)] py-[clamp(0.7rem,1.45vh,1rem)] text-[clamp(0.55rem,0.78vw,0.72rem)] tracking-[0.26em] text-white uppercase backdrop-blur-md outline-none transition-[background-color,border-color] duration-300 [text-shadow:none] hover:border-white/55 hover:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-[#9dc0ee] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050b14] portrait:px-[0.8rem] portrait:py-[0.7rem] portrait:text-[0.5rem] portrait:tracking-[0.18em] [@media(max-width:340px)]:text-[0.44rem] [@media(max-width:340px)]:tracking-[0.1em] motion-reduce:transition-none"
              >
                Begin a project
                <span
                  aria-hidden
                  className="text-[#9dc0ee] transition-transform duration-300 group-hover:translate-x-[0.25em] motion-reduce:transition-none"
                >
                  &rarr;
                </span>
              </button>
              <button
                type="button"
                data-nav-item
                data-index="0"
                className="group relative pointer-events-auto inline-flex cursor-pointer items-center gap-[0.9em] overflow-hidden rounded-full bg-[#dce7f7] py-[clamp(0.35rem,0.8vh,0.55rem)] ps-[clamp(1.1rem,1.9vw,1.6rem)] pe-[clamp(0.35rem,0.5vw,0.5rem)] text-[clamp(0.55rem,0.78vw,0.72rem)] font-medium tracking-[0.26em] text-[#0b1a2e] uppercase shadow-[0_12px_40px_-14px_rgba(157,192,238,0.75)] outline-none transition-[background-color,box-shadow,transform] duration-300 [text-shadow:none] hover:-translate-y-px hover:bg-white hover:shadow-[0_16px_50px_-12px_rgba(157,192,238,0.95)] focus-visible:ring-2 focus-visible:ring-[#9dc0ee] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050b14] active:translate-y-0 portrait:py-[0.51rem] portrait:ps-[0.8rem] portrait:pe-[0.3rem] portrait:text-[0.5rem] portrait:tracking-[0.18em] [@media(max-width:340px)]:text-[0.44rem] [@media(max-width:340px)]:tracking-[0.1em] motion-reduce:transition-none"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-0 transition-[left,opacity] duration-700 ease-out group-hover:left-[120%] group-hover:opacity-100 motion-reduce:hidden"
                />
                <span className="relative">Open the book</span>
                <span
                  aria-hidden
                  className="relative grid size-[2.7em] place-items-center rounded-full bg-[#0b1a2e] text-[#dce7f7] transition-transform duration-300 group-hover:translate-x-[0.2em] motion-reduce:transition-none portrait:size-[2.4em]"
                >
                  {/* Drawn, not typed: at this size the font's arrow was a
                      4px dash lost in the disc. */}
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-[48%]"
                  >
                    <path d="M3 8h10M9 4l4 4-4 4" />
                  </svg>
                </span>
              </button>
            </div>


            </div>
          </div>
        </div>

        {/* THE CATEGORY BAND: 02's five categories as a slow ticker along the
            cover's foot, full width, asked for as a "moving nav bar" at the
            edge of the hero between the copy and the book. It replaced a
            static row under the buttons that was landscape-only; the band
            shows on phones too, because it sits in the foot padding the title
            block already leaves (portrait pb 11vh).

            - Each copy is the five words six times over (~4500px), so it is
              wider than a 3440px ultrawide window and the band never runs
              dry. The track holds two copies and moves by half (`marquee`),
              so the loop has no seam. The second copy is aria-hidden: a screen
              reader hears the five once, as a list.
            - Edges fade out through a mask rather than stopping at the window,
              so words arrive rather than pop.
            - Lifted off the screen's edge (6vh, 20-64px) and ruled top and
              bottom, asked for "slightly up, not fully at the bottom", then
              "up more".
            - Pauses under the pointer, so it can be read; still under reduced
              motion, where it is centred and shows one copy.
            - Outside `kickerRef` (placed against the screen, like the ribbon)
              and faded by the same tween before the book opens. */}
        <div
          ref={bandRef}
          data-hero-band
          className="group/band pointer-events-auto absolute inset-x-0 bottom-[clamp(20px,6vh,64px)] z-[2] border-y border-white/10 bg-[linear-gradient(to_top,rgba(5,11,20,0.78),rgba(5,11,20,0.25))] py-[clamp(0.55rem,1.3vh,0.9rem)] [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)] [text-shadow:none]"
        >
          <div className="flex w-max motion-safe:animate-marquee motion-safe:group-hover/band:[animation-play-state:paused] motion-reduce:mx-auto">
            {[0, 1].map((copy) => (
              <ul
                key={copy}
                aria-hidden={copy === 1 || undefined}
                aria-label={copy === 0 ? "What we build" : undefined}
                className={`flex shrink-0 items-center text-[clamp(0.55rem,0.78vw,0.72rem)] tracking-[0.34em] text-slate-300/85 uppercase ${copy === 1 ? "motion-reduce:hidden" : ""}`}
              >
                {Array.from({ length: 6 }, () => [
                  "Web",
                  "Mobile",
                  "SaaS",
                  "AI automation",
                  "Branding",
                ])
                  .flat()
                  .map((label, k) => (
                  <li
                    key={`${label}-${k}`}
                    aria-hidden={k >= 5 || undefined}
                    className={`flex items-center ${k >= 5 ? "motion-reduce:hidden" : ""}`}
                  >
                    <span className="px-[1.6em]">{label}</span>
                    {/* A short DASH between words (asked for "-", after a
                        diamond and then a tiny ribbon were both turned down):
                        a hairline, the same rule the book uses everywhere. */}
                    <span aria-hidden className="h-px w-[1.1em] bg-[#9dc0ee]/60" />
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>

        {/* THE SCROLL CUE IS A BOOKMARK RIBBON, hanging from under the head
            bar the way a ribbon hangs out of the head of a book, with SCROLL
            TO BEGIN printed down its length. It replaced a small open-book
            glyph at the foot of the screen, and before that a hairline and
            tracked caps in the hero's column.

            WHERE: the margin right of the photographed book, not over the
            headline. Above the title it needs ~190px between the head rule
            and the eyebrow, and a 16:9 laptop has 170-190 there; beside the
            book the margin is empty at every size -- at 1440x900 the plinth has
            shaded out by x=1305 (MATTE_LAST) and the ribbon starts at 1354. In portrait it is
            the right margin beside the title, clear of the book's top corner.

            HOW IT MOVES: it drops out from under the header on load
            (`ribbon-drop`, clipped by the box so it appears from behind the
            rule rather than sliding in over it) and then swings from its top
            (`ribbon-sway`). Two animations, two boxes, because both animate
            `transform`. Neither is on `cueRef`: a CSS animation with fill
            `both` keeps overriding inline styles, so on the ref it would pin
            the transform and opacity GSAP's fade writes.

            It is OUTSIDE `kickerRef` because it is placed against the screen,
            and GSAP's transform on that block would make it the containing
            block for anything absolute inside. One tween fades both refs.
            `top` IS the head rule's measured offset (`--head-rule-y`, set by
            the effect near the top of <Book>), so the ribbon's first pixel
            row is the rule's and the bar, drawn later at z-[100], lays the
            rule over it: tucked under, not stuck on. The fallback is the same
            sum in CSS for the frame before the effect runs. Shown at every
            height: the old cue hid below 620px because it sat on the buttons,
            and carrying that rule over hid the ribbon on ordinary laptops,
            whose browser chrome leaves a 1366x768 screen a window under 620.
            aria-hidden: it describes a gesture, and a screen reader has the
            page's headings. */}
        <div
          ref={cueRef}
          data-scroll-cue
          aria-hidden
          className="pointer-events-none absolute top-[var(--head-rule-y,calc(5.1vh+clamp(17px,1.5vw,22px)))] right-[6vw] overflow-hidden px-[10px] pb-[10px] portrait:right-[5vw]"
        >
          <div data-ribbon-drop className="motion-safe:-translate-y-[105%]">
            <div className="origin-top [filter:drop-shadow(0_6px_8px_rgba(3,9,18,0.65))] motion-safe:animate-ribbon-sway motion-safe:[animation-delay:1.45s]">
              <div
                // Satin: darker at both edges, a highlight just off centre.
                // The swallowtail is the clip-path; the stitching is the
                // dashed inner border. The shadow is a filter on the wrapper
                // below, because a box-shadow would be cut by the clip-path.
                className="relative flex w-[clamp(26px,2.1vw,34px)] flex-col items-center gap-[0.9em] bg-[linear-gradient(90deg,#6f93c4_0%,#b9cfee_30%,#e6eefa_48%,#c4d6f0_62%,#7fa3d4_100%)] pt-[1.6em] pb-[2.1em] text-[clamp(0.5rem,0.62vw,0.6rem)] text-[#0b1a2e] [clip-path:polygon(0_0,100%_0,100%_100%,50%_calc(100%-11px),0_100%)] portrait:w-[24px] portrait:text-[0.42rem]"
              >
                <span className="pointer-events-none absolute inset-y-0 inset-x-[3px] border-x border-dashed border-[#0b1a2e]/20" />
                <span className="relative font-medium tracking-[0.34em] uppercase [writing-mode:vertical-rl]">
                  Scroll to begin
                </span>
                <svg
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="relative size-[1.3em]"
                >
                  <path d="M6 2v8M2.5 6.5 6 10l3.5-3.5" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {reduced ? null : <BookSheets single={single} />}

        {/* TURN THE PHONE UPRIGHT. A touch phone held sideways (under 500px
            of height) gets a spread whose pages are ~410x390: measured at
            844x390, 14 of the 18 page faces overflowed their own page or
            their folio -- 01's verso by 162px past the foot, 03's by 96. The
            type there is already at its floor, so nothing can be made to
            fit; the upright phone layout passes every page at 360-412px
            wide. `hover: none` keeps it off a short desktop window, which can
            still be resized rather than rotated. Fixed and above everything,
            so it covers the book rather than laying out beside it. */}
        <div
          role="note"
          className="fixed inset-0 z-[300] hidden flex-col items-center justify-center gap-4 bg-[#050b14] px-8 text-center [@media(orientation:landscape)_and_(max-height:500px)_and_(hover:none)]:flex"
        >
          <svg
            viewBox="0 0 48 48"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-12 text-[#dce7f7]/80"
          >
            <rect x="15" y="6" width="18" height="32" rx="3" />
            <path d="M22 33h4" />
            <path d="M6 30a18 18 0 0 0 10 12" />
            <path d="M12 42l4 0 0-4" />
          </svg>
          <p className="font-[family-name:var(--font-display)] text-xl text-white">
            Turn your phone upright to read the book.
          </p>
          <p className="text-[0.7rem] tracking-[0.3em] text-slate-300/80 uppercase">
            Nivlak Technologies
          </p>
        </div>

        <BookNav />
        <BookRunningHead />
        <BookIndex />
      </section>

      {/* Appended after the section rather than swapped into it, so React only
          ever adds a child at the end of this wrapper -- an append needs no
          reference node, which is the one DOM operation that cannot trip over
          a reparented pin. */}
      {/* The scroll the sticky book rides over on a touch screen; display:
          none everywhere else (index.css), where the pin makes its own. */}
      {reduced ? null : (
        <div
          data-scroll-spacer
          aria-hidden
          style={{ height: `${scrollPercent(single ? MOBILE_TURNS : TURNS, single)}svh` }}
        />
      )}
      {reduced ? <BookPageColumn /> : null}
    </div>
  );
}

"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  FRAME_COUNT,
  FRAME_SRC,
  FRAME_W,
  LETTERBOX,
  pickTier,
  planAt,
} from "@/components/book-camera";
import { BookIndex, BookNav, BookRunningHead } from "@/components/book-nav";
import {
  BOOK_PAGES,
  BOOK_SPREADS,
  CHAPTER_OF_MOBILE_PAGE,
  FIRST_MOBILE_PAGE_OF_CHAPTER,
  CHAPTER_OF_SPREAD,
  FIRST_SPREAD_OF_CHAPTER,
} from "@/components/book-pages.content";
import {
  BookPageColumn,
  BookSheets,
  MOBILE_TURNS,
  TURNS,
  isFullBleed,
  layoutSheets,
  paintSheets,
} from "@/components/book-sheets";

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin, useGSAP);

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
const scrollLength = (turns: number) =>
  `+=${Math.round(OPEN_VH + pagesUnits(turns) * VH_PER_UNIT)}%`;

// Frames requested per batch after the first. Ninety-one at once is ninety-one
// parallel requests fighting the document for the connection on a cold load; in
// order and in batches, the playhead's decoded ceiling walks forward steadily
// instead of every frame arriving at the end.
const BATCH = 8;

export function Book() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const kickerRef = useRef<HTMLDivElement>(null);

  const imagesRef = useRef<(HTMLImageElement | null)[]>([]);
  // Highest frame index that is decoded and safe to draw. The playhead is
  // clamped to it, so the reveal can start scrubbing off the first frame
  // instead of holding an empty canvas until the whole set has arrived.
  const loadedToRef = useRef(0);
  const redrawRef = useRef<() => void>(() => {});

  // Resolved once, on the first client render, and then never revisited. A
  // visitor who resizes a desktop window down to phone width has already paid
  // for the frames they have; swapping the whole set out mid-scroll would cost
  // another few megabytes to make the picture worse.
  const tierRef = useRef<ReturnType<typeof pickTier> | null>(null);
  if (tierRef.current === null && typeof window !== "undefined") {
    tierRef.current = pickTier(window.innerWidth);
  }

  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
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
  // Whether a phone page has the HEIGHT to carry the larger type. 03 is the
  // page that decides it: its phone page prints a chapter head and three
  // stages, which fit at 393x851 and do not at 360x640 -- measured, the third
  // stage was cut off and the drop folio printed over stage 02's outcome. 760
  // is between the two, so a tall phone reads larger and a short one is
  // exactly what it was.
  const [bigType, setBigType] = useState(false);
  useEffect(() => {
    const sync = () => {
      const full = isFullBleed(window.innerWidth, window.innerHeight);
      setBigType(full && window.innerHeight >= 760);
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
  useEffect(() => {
    const root = document.documentElement;
    root.style.fontSize = bigType ? "19px" : "";
    ScrollTrigger.refresh();
    return () => {
      root.style.fontSize = "";
    };
  }, [bigType]);

  // Highest contiguous index present in imagesRef. Derived, never reset: the
  // ref survives a remount (and StrictMode's double invoke), so resetting would
  // regress the canvas to frame 1 with everything already cached.
  const settleCeiling = useCallback(() => {
    let to = 0;
    while (to + 1 < FRAME_COUNT && imagesRef.current[to + 1] !== undefined) {
      to += 1;
    }
    loadedToRef.current = to;
  }, []);

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
      settleCeiling();
      redrawRef.current();

      // Then the rest, in order and in batches, so the ceiling only ever moves
      // forward and the reveal can be scrubbed before the whole set has landed.
      for (let start = 2; start <= FRAME_COUNT; start += BATCH) {
        const batch = [];
        for (let i = start; i < start + BATCH && i <= FRAME_COUNT; i++) {
          batch.push(load(i).then((img) => ({ i, img })));
        }
        const settled = await Promise.all(batch);
        if (cancelled) return;
        for (const { i, img } of settled) imagesRef.current[i - 1] = img;
        settleCeiling();
        redrawRef.current();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [load, settleCeiling]);

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

      // Nearest frame at or before `index` that actually decoded, so a single
      // failed request degrades to a held frame instead of a blank one.
      const frameAt = (index: number) => {
        for (let i = Math.min(index, loadedToRef.current); i >= 0; i--) {
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
        const plan = planAt(
          scroll.u,
          width,
          height,
          loadedToRef.current,
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

        for (const layer of plan.layers) {
          const img = frameAt(layer.index);
          if (!img) continue;
          ctx.globalAlpha = layer.alpha;
          ctx.drawImage(img, layer.x, layer.y, layer.width, layer.height);
        }
        ctx.globalAlpha = 1;
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
      let goTo = (_index: number) => {};
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
        goTo(Number(el.dataset.index));
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

        let current = 0;
        const show = (index: number) => {
          // Hover fires on every entry into a row; the server render already
          // marks entry 0 current, so the same index is always a no-op.
          if (index === current) return;
          current = index;
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
        let drag: { id: number; x: number } | null = null;
        const onDown = (event: Event) => {
          const e = event as PointerEvent;
          if (e.pointerType === "mouse" && e.button !== 0) return;
          const stage = e.currentTarget as HTMLElement;
          drag = { id: e.pointerId, x: e.clientX };
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
        gsap.set(kickerRef.current, { autoAlpha: 1, y: 0 });
        // Reduced motion has no spread and no fore-edge -- it is an ordinary
        // scrolling column -- so the head bar stays and the thumb index, which
        // only makes sense on an open book, is not shown at all.
        gsap.set(thumbIndex, { autoAlpha: 0 });
        // No timeline to seek, and no business animating a scroll for someone
        // who asked for less motion: jump.
        goTo = (index) => {
          const target =
            index < 0
              ? null
              : document.getElementById(`section-${BOOK_PAGES[index]?.number}`);
          if (target) target.scrollIntoView();
          else window.scrollTo(0, 0);
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

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: scrollLength(turns),
          // Shorter in portrait: the catch-up that reads as weight under a
          // wheel reads as lag under a finger, and a dragged page that
          // arrives a second late is not the page you are dragging.
          scrub: single ? 0.3 : SCRUB,
          pin: true,
          anticipatePin: 1,
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
      tl.fromTo(
        scroll,
        { u: 0 },
        { u: 1, duration: OPEN, onUpdate: draw },
        0,
      );

      // Wordmark is visible on load; fade it out before the book visibly
      // starts opening so the reveal gets a clean, text-free stage.
      if (kickerRef.current) {
        tl.to(
          kickerRef.current,
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
      const seekSpread = (index: number) => {
        const trigger = tl.scrollTrigger;
        if (!trigger) return;
        const y =
          index < 0
            ? 0
            : trigger.start +
              (timeOf(index) / tl.duration()) * (trigger.end - trigger.start);
        gsap.to(window, {
          // autoKill so a flick of the wheel takes the scroll back off the
          // tween rather than fighting it.
          scrollTo: { y, autoKill: true },
          duration: 0.9,
          ease: "power2.inOut",
          overwrite: true,
        });
      };
      const seek = (chapter: number) =>
        seekSpread(chapter < 0 ? -1 : (firstSheetOfChapter[chapter] ?? 0));
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
          } | null = null;
          const onDown = (event: PointerEvent) => {
            if (event.pointerType === "mouse" && event.button !== 0) return;
            // The controls keep their own gestures: a tab is a tap, and 04's
            // plate has a drag of its own that changes the study.
            const target = event.target as HTMLElement | null;
            if (
              target?.closest?.(
                "[data-nav-item],[data-book-index],[data-project-stage],a,button",
              )
            ) {
              return;
            }
            drag = {
              id: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              from: window.scrollY,
              px: pageScroll(),
            };
          };
          const onMove = (event: PointerEvent) => {
            if (!drag || event.pointerId !== drag.id) return;
            const dx = event.clientX - drag.x;
            const dy = event.clientY - drag.y;
            // A mostly-vertical drag is a scroll, and the stage's
            // `touch-action: pan-y` has already given it to the browser.
            if (Math.abs(dy) > Math.abs(dx)) return;
            const width = window.innerWidth || 1;
            // Left is forward, the way a swipe turns a page.
            const top = Math.max(0, drag.from - (dx / (width * REACH)) * drag.px);
            if (Number.isFinite(top)) window.scrollTo({ top, behavior: "auto" });
          };
          const onUp = (event: PointerEvent) => {
            if (!drag || event.pointerId !== drag.id) return;
            const dx = event.clientX - drag.x;
            const dy = event.clientY - drag.y;
            const width = window.innerWidth || 1;
            drag = null;
            if (Math.abs(dy) > Math.abs(dx)) return;
            const moved = Math.abs(dx) / width;
            if (moved < 0.02) return;
            const next =
              moved >= COMMIT
                ? currentSheet + (dx < 0 ? 1 : -1)
                : currentSheet;
            seekSpread(Math.min(Math.max(next, 0), turns));
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
      let currentSheet = 0;
      // The ink fade for the page that has just come up, in portrait; a scrub
      // can start a second one before the first has finished, and `overwrite`
      // only covers the same targets, so the page being left behind is
      // completed by hand rather than left printed at half opacity.
      let inkTween: gsap.core.Tween | null = null;
      const syncNav = () => {
        const t = tl.time();
        let current = t >= OPEN + LEAD_IN * 0.5 ? 0 : -1;
        for (let i = 0; i < turns; i++) {
          const midTurn = OPEN + LEAD_IN + i * (TURN + GAP) + TURN * 0.5;
          if (t >= midTurn) current = i + 1;
        }
        // What a drag turns from. Kept even when the chapter has not
        // changed, because two pages of one chapter are two sheets.
        const arrived = current !== currentSheet;
        currentSheet = Math.max(0, current);

        // THE INK ARRIVES WITH THE PAGE, in portrait only.
        //
        // A turned page used to land with its type already printed, which on
        // a phone -- where the page IS the screen -- reads as a cut rather
        // than as a page arriving. So the face that just came up fades its
        // own ink in and lifts it a few pixels, one block after another.
        //
        // On the INK and never on the sheet: opacity on a sheet is a grouping
        // value and would flatten its 3D mid-turn (see the note in
        // book-sheets.tsx). Skipped under reduced motion, and skipped on a
        // spread, where both pages are already on screen and a fade would be
        // a second animation over a turn that is doing the work.
        if (single && arrived && !reduced && currentSheet >= 0) {
          const face = sheets[currentSheet]?.querySelector<HTMLElement>(
            "[data-face='front']",
          );
          const ink = face?.querySelectorAll<HTMLElement>("[data-ink]");
          if (ink?.length) {
            inkTween?.progress(1).kill();
            inkTween = gsap.fromTo(
              ink,
              { autoAlpha: 0, y: 10 },
              {
                autoAlpha: 1,
                y: 0,
                duration: 0.4,
                ease: "power2.out",
                stagger: 0.04,
                overwrite: true,
              },
            );
          }
        }
        if (current === lastCurrent) return;
        lastCurrent = current;
        // Report the chapter, not the spread. A chapter running to two spreads
        // keeps ONE tab lit across both, instead of the index going dark on the
        // continuation because no tab has that spread's number.
        const chapter = current < 0 ? -1 : (chapterOfSheet[current] ?? -1);
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
            ? `${page.number} \u2014 ${page.title.toUpperCase()}`
            : "";
          runningHead.style.opacity = page ? "1" : "0";
        }
      };
      tl.eventCallback("onUpdate", syncNav);
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
    <div>
      {/* This wrapper exists for ScrollTrigger, and removing it breaks the
          page at runtime. pin:true does not style the section in place -- it
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
        className="relative h-svh w-full overflow-hidden"
        /* Colour comes from the frames themselves rather than a matching
           literal, so a rebuilt set cannot leave the section a different colour
           to the canvas sitting on it. */
        style={{ backgroundColor: LETTERBOX }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
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
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-center px-[7vw] text-left portrait:justify-stretch portrait:pt-[9vh] portrait:pb-[4vh] landscape:ps-[7vw] landscape:pe-[4vw]">
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
              <p className="text-[clamp(0.55rem,0.78vw,0.72rem)] tracking-[0.42em] text-slate-300/85 uppercase">
                Nivlak Technologies
              </p>
            {/* Two lines, and the second one is the mockup's blue. The break is
                hard rather than left to the measure: "THE STORY / OF WHAT WE
                BUILD." is the line it is written on, and a reflow that puts
                "OF" on the first line loses the sentence. */}
            {/* A size down in portrait, and it is the plate above that pays
                for it: the title block has the screen BELOW the photograph and
                nothing more, measured at 365px at 393x851, where the block ran
                414 at the landscape sizes. The alternative was cropping the
                plate, which is the one thing the first screen is for. */}
            <h1 className="mt-[2.2vh] font-[family-name:var(--font-display)] text-[clamp(2.1rem,5.2vw,4.6rem)] leading-[1.02] font-light text-white portrait:mt-[1.4vh] portrait:text-[clamp(1.7rem,8vw,2.4rem)]">
              The Story
              <span className="block bg-gradient-to-r from-[#9dc0ee] via-[#bcd4f2] to-[#dce7f7] bg-clip-text text-transparent">
                of What We Build.
              </span>
            </h1>
            </div>

            {/* ...and everything a reader can ACT on goes under the book. */}
            <div className="portrait:w-full">
            <p className="mt-[2.4vh] text-[clamp(0.78rem,1.15vw,1.05rem)] tracking-[0.12em] text-slate-300/85 portrait:mt-[1.6vh]">
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
            <div className="mt-[3.4vh] flex flex-wrap items-center gap-[clamp(0.6rem,1.1vw,1rem)] portrait:mt-[2.2vh] portrait:justify-center portrait:gap-[0.5rem]">
              <button
                type="button"
                data-nav-item
                data-index="0"
                className="group pointer-events-auto inline-flex cursor-pointer items-center gap-[0.9em] border border-white/35 px-[clamp(1rem,1.9vw,1.7rem)] py-[clamp(0.6rem,1.3vh,0.95rem)] text-[clamp(0.55rem,0.78vw,0.72rem)] tracking-[0.3em] portrait:px-[0.7rem] portrait:py-[0.55rem] portrait:text-[0.5rem] portrait:tracking-[0.18em] text-white uppercase transition-colors duration-300 outline-none hover:border-white hover:bg-white/10 focus-visible:border-white focus-visible:bg-white/10 motion-reduce:transition-none"
              >
                Open the book
                <span
                  aria-hidden
                  className="transition-transform duration-300 group-hover:translate-x-[0.25em] motion-reduce:transition-none"
                >
                  &rarr;
                </span>
              </button>
              <button
                type="button"
                data-nav-item
                data-index={BOOK_PAGES.length - 1}
                className="group pointer-events-auto inline-flex cursor-pointer items-center gap-[0.9em] border border-white/20 px-[clamp(1rem,1.9vw,1.7rem)] py-[clamp(0.6rem,1.3vh,0.95rem)] text-[clamp(0.55rem,0.78vw,0.72rem)] tracking-[0.3em] portrait:px-[0.7rem] portrait:py-[0.55rem] portrait:text-[0.5rem] portrait:tracking-[0.18em] text-slate-200 uppercase transition-colors duration-300 outline-none hover:border-white/60 hover:text-white focus-visible:border-white/60 focus-visible:text-white motion-reduce:transition-none"
              >
                Begin a project
                <span
                  aria-hidden
                  className="transition-transform duration-300 group-hover:translate-x-[0.25em] motion-reduce:transition-none"
                >
                  &rarr;
                </span>
              </button>
            </div>

            {/* The cue. This page is 8.8 viewports of scroll behind a closed
                book, and a visitor who does not scroll sees a photograph and
                leaves. The rule above it is the mockup's. Hidden where the
                viewport is too short for it to sit clear of the buttons. */}
            <div className="mt-[5vh] flex flex-col gap-[1.2vh] portrait:mt-[2.6vh] portrait:items-center [@media(max-height:620px)]:hidden">
              {/* The rule is 5vh of the height the title block has not got in
                  portrait; the words alone still say scroll. */}
              <span
                aria-hidden
                className="block h-[5vh] w-px bg-white/25 portrait:hidden"
              />
              <span className="flex items-center gap-[0.8em] text-[clamp(0.5rem,0.7vw,0.62rem)] tracking-[0.34em] text-slate-300/75 uppercase">
                Scroll to begin
                <span aria-hidden className="text-[0.9rem] leading-none">
                  &darr;
                </span>
              </span>
            </div>
            </div>
          </div>
        </div>

        {reduced ? null : <BookSheets single={single} />}

        <BookNav />
        <BookRunningHead />
        <BookIndex />
      </section>

      {/* Appended after the section rather than swapped into it, so React only
          ever adds a child at the end of this wrapper -- an append needs no
          reference node, which is the one DOM operation that cannot trip over
          a reparented pin. */}
      {reduced ? <BookPageColumn /> : null}
    </div>
  );
}

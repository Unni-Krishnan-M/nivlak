"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
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
import {
  BookPageColumn,
  BookSheets,
  TURNS,
  layoutSheets,
  paintSheets,
} from "@/components/book-sheets";

gsap.registerPlugin(ScrollTrigger, useGSAP);

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
const PAGES_UNITS = LEAD_IN + (TURNS - 1) * (TURN + GAP) + TURN + TRAIL;

const OPEN = OPEN_VH / VH_PER_UNIT;
const SCROLL_LENGTH = `+=${Math.round(OPEN_VH + PAGES_UNITS * VH_PER_UNIT)}%`;

// Frames requested per batch after the first. Ninety-one at once is ninety-one
// parallel requests fighting the document for the connection on a cold load; in
// order and in batches, the playhead's decoded ceiling walks forward steadily
// instead of every frame arriving at the end.
const BATCH = 8;

export function Book() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const kickerRef = useRef<HTMLParagraphElement>(null);

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
    () => {
      // Deliberately not gated on the first frame having loaded: the pin
      // spacer has to exist before the visitor scrolls, and draw() copes with
      // an empty cache by painting the letterbox colour and returning.
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

        const plan = planAt(scroll.u, width, height, loadedToRef.current);

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

      if (reduced) {
        // Park the book open and let <BookPageColumn> below carry the copy.
        scroll.u = 1;
        draw();
        gsap.set(kickerRef.current, { autoAlpha: 1, y: 0 });
        return teardown;
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
          end: SCROLL_LENGTH,
          scrub: SCRUB,
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
        sheets.slice(0, TURNS),
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

      return teardown;
    },
    {
      dependencies: [reduced],
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

        {/* The book stands in the right half of the frame with the whole left
            side empty, so on landscape the copy goes in that gap rather than
            across the cover. A portrait viewport letterboxes the 3:2 frame into
            a band, so there the copy sits under the band instead. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-center px-6 portrait:items-center portrait:justify-end portrait:pb-[16vh] portrait:text-center landscape:items-start landscape:ps-[7vw] landscape:text-left">
          <p
            ref={kickerRef}
            className="mb-3 -me-[0.3em] text-xs tracking-[0.3em] text-slate-300/80 uppercase"
          >
            Nivlak Technologies
          </p>
        </div>

        {reduced ? null : <BookSheets />}
      </section>

      {/* Appended after the section rather than swapped into it, so React only
          ever adds a child at the end of this wrapper -- an append needs no
          reference node, which is the one DOM operation that cannot trip over
          a reparented pin. */}
      {reduced ? <BookPageColumn /> : null}
    </div>
  );
}

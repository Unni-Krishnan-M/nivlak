"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useCallback, useEffect, useRef } from "react";

import {
  FRAME_COUNT,
  FRAME_SRC,
  FRAME_W,
  LETTERBOX,
  pickTier,
  planAt,
} from "@/components/book-camera";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// The frames are built by tools/build-book-frames.sh and the camera that moves
// over them lives in book-camera.ts -- read that first, it is where the reveal
// is actually designed. This component only owns the canvas, the frame cache
// and the ScrollTrigger.

// How much scroll the reveal is stretched over, as a multiple of viewport
// height, and how much catch-up the scrub has.
//
// 380% was too quick, and that was measured rather than guessed: on a 900px
// viewport it is 2877px of scroll for the whole eight-second move, which a
// trackpad crosses in one or two flicks. At 800% each of the 91 frames gets
// about 78px of scroll, so the book opens at a deliberate pace instead of
// snapping through.
//
// The scrub goes back up with it. Over the short length a long catch-up made the
// book feel detached from the wheel; over this distance the lag is what turns a
// wheel notch into a glide.
const SCROLL_LENGTH = "+=800%";
const SCRUB = 1.0;

// Frames requested per batch after the first. Ninety-one at once is ninety-one
// parallel requests fighting the document for the connection on a cold load; in
// order and in batches, the playhead's decoded ceiling walks forward steadily
// instead of every frame arriving at the end.
const BATCH = 8;

export function BookScrollReveal() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const kickerRef = useRef<HTMLParagraphElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const taglineRef = useRef<HTMLParagraphElement>(null);
  const scrollCueRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef<HTMLDivElement>(null);

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
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d", { alpha: false });
      if (!canvas || !ctx) return;

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

      redrawRef.current = draw;
      draw();

      // The canvas has to be redrawn on ScrollTrigger's refresh, not on raw
      // resize: while pinned, GSAP writes explicit pixel dimensions onto the
      // section, so a resize handler reads the stale pinned size and the fresh
      // one only lands on the next refresh.
      let disposed = false;
      let rafId = 0;
      const onRefresh = () => draw();
      ScrollTrigger.addEventListener("refresh", onRefresh);
      const observer = new ResizeObserver(() => {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          if (!disposed) draw();
        });
      });
      observer.observe(canvas);
      if (document.fonts?.ready) {
        document.fonts.ready.then(() => {
          // A stray global refresh landing inside the next mount's setup is
          // worse than a missed one.
          if (!disposed) ScrollTrigger.refresh();
        });
      }

      const mm = gsap.matchMedia();

      mm.add(
        {
          reduced: "(prefers-reduced-motion: reduce)",
          full: "(prefers-reduced-motion: no-preference)",
        },
        (context) => {
          const { reduced } = context.conditions as { reduced: boolean };

          if (reduced) {
            scroll.u = 1;
            draw();
            gsap.set(
              [
                kickerRef.current,
                headlineRef.current,
                taglineRef.current,
              ].filter(Boolean),
              { autoAlpha: 1, y: 0 },
            );
            gsap.set(scrollCueRef.current, { autoAlpha: 0 });
            // The closing line is a bookend to the headline, and with no scroll
            // to separate them it would just be the headline printed twice.
            gsap.set(closingRef.current, { autoAlpha: 0 });
            return;
          }

          const tl = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: {
              trigger: sectionRef.current,
              start: "top top",
              end: SCROLL_LENGTH,
              scrub: SCRUB,
              pin: true,
              anticipatePin: 1,
            },
            onUpdate: draw,
          });

          // fromTo, not to: the reduced-motion branch parks the scroll at the
          // end, and gsap.matchMedia re-runs this callback when the query flips
          // -- a relative tween would then be a no-op.
          tl.fromTo(scroll, { u: 0 }, { u: 1, duration: 1 }, 0);

          // Title is visible on load; fade it out before the book visibly
          // starts opening so the reveal gets a clean, text-free stage.
          if (kickerRef.current && headlineRef.current) {
            tl.to(
              [kickerRef.current, headlineRef.current],
              { autoAlpha: 0, y: -16, duration: 0.1 },
              0.05,
            );
          }

          if (taglineRef.current) {
            tl.fromTo(
              taglineRef.current,
              { autoAlpha: 0, y: 16 },
              { autoAlpha: 1, y: 0, duration: 0.08 },
              0.18,
            ).to(
              taglineRef.current,
              { autoAlpha: 0, y: -16, duration: 0.08 },
              0.34,
            );
          }

          if (scrollCueRef.current) {
            tl.to(scrollCueRef.current, { autoAlpha: 0, duration: 0.05 }, 0.02);
          }

          // The last third of the scroll is two frames of the same flat navy
          // spread: the push-in keeps it moving, but nothing in the picture is
          // happening. So the spread is treated as what it is -- a blank page
          // -- and the line the reveal opened on is set down on it.
          if (closingRef.current) {
            tl.fromTo(
              closingRef.current,
              { autoAlpha: 0, y: 28 },
              { autoAlpha: 1, y: 0, duration: 0.16 },
              0.72,
            );
          }

          return () => {
            tl.scrollTrigger?.kill();
            tl.kill();
          };
        },
      );

      return () => {
        disposed = true;
        cancelAnimationFrame(rafId);
        ScrollTrigger.removeEventListener("refresh", onRefresh);
        observer.disconnect();
        redrawRef.current = () => {};
        mm.revert();
      };
    },
    { dependencies: [], scope: sectionRef },
  );

  return (
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
          across the cover. A portrait viewport letterboxes the 3:2 frame into a
          band, so there the copy sits under the band instead. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-center px-6 portrait:items-center portrait:justify-end portrait:pb-[16vh] portrait:text-center landscape:items-start landscape:ps-[7vw] landscape:text-left">
        <p
          ref={kickerRef}
          className="mb-3 -me-[0.3em] text-xs tracking-[0.3em] text-slate-300/80 uppercase"
        >
          Nivlak Technologies
        </p>
        <h1
          ref={headlineRef}
          className="text-3xl font-semibold text-white sm:text-5xl portrait:max-w-2xl landscape:max-w-[40vw]"
        >
          Every page, engineered.
        </h1>
        <p
          ref={taglineRef}
          className="invisible mt-4 text-sm text-slate-300/80 sm:text-base portrait:max-w-md landscape:max-w-[34vw]"
        >
          Scroll to open the story.
        </p>
      </div>

      <div
        ref={closingRef}
        className="pointer-events-none invisible absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
      >
        <p className="mb-4 -me-[0.3em] text-[10px] tracking-[0.4em] text-slate-300/60 uppercase">
          Nivlak Technologies
        </p>
        <p className="max-w-xl text-2xl font-semibold text-white/90 sm:text-4xl">
          Every page, engineered.
        </p>
      </div>

      <div
        ref={scrollCueRef}
        className="pointer-events-none absolute inset-x-0 bottom-8 flex flex-col items-center gap-2 text-slate-300/70 portrait:mx-auto portrait:w-fit landscape:items-start landscape:ps-[7vw]"
      >
        <span className="-me-[0.25em] text-[10px] tracking-[0.25em] uppercase">
          Scroll
        </span>
        <span className="h-8 w-px animate-pulse bg-slate-300/50" />
      </div>
    </section>
  );
}

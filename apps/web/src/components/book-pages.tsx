"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  FRAME_COUNT,
  FRAME_SRC,
  LETTERBOX,
  finalFrameRect,
  pickTier,
  spreadAt,
} from "@/components/book-camera";
import { BOOK_PAGES } from "@/components/book-pages.content";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// The six content pages, turned like pages of the book the reveal just opened.
//
// This picks up exactly where <BookScrollReveal> puts the camera down: the same
// final frame, in the same place on screen, held still while sheets turn over
// it. That continuity is the whole trick, so the geometry is not CSS guesswork
// -- spreadAt() in book-camera.ts runs the same camera the canvas painter runs
// and reports where the gutter and the paper edges actually landed, and the
// sheets are positioned onto that. Resize the window and both agree, because
// both asked the same function.
//
// Six pages means five turns: page one is already face up.

// Roughly three quarters of a viewport of scroll per page, which matches the
// cadence the reveal was retuned to. The timeline's own duration is what sets
// the ratios; this only sets how much wheel the whole run costs.
const SCROLL_LENGTH = "+=450%";
const SCRUB = 1.0;

// Timeline units. The turn is a beat and the pause after it is the rest of the
// bar -- without the gap the pages run into each other and there is never a
// moment where a page is simply open and readable.
const TURN = 1;
const GAP = 0.2;
const LEAD_IN = 0.4;
const TRAIL = 0.5;

export function BookPages() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sheetRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Resolved after mount so the server and the first client render agree; the
  // reveal above has already fetched this exact file, so it is a cache hit.
  const [tier, setTier] = useState<ReturnType<typeof pickTier> | null>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setTier(pickTier(window.innerWidth));
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // Put the frame and the sheets where the camera says the book is. Called on
  // ScrollTrigger's refresh rather than on raw resize, for the same reason the
  // reveal's canvas is: while pinned, GSAP writes explicit pixel dimensions
  // onto the section, so a resize handler reads the stale pinned size.
  const layout = useCallback(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage) return;

    const { width, height } = section.getBoundingClientRect();
    if (!width || !height) return;

    const frame = finalFrameRect(width, height);
    if (frameRef.current) {
      Object.assign(frameRef.current.style, {
        left: `${frame.x}px`,
        top: `${frame.y}px`,
        width: `${frame.width}px`,
        height: `${frame.height}px`,
      });
    }

    const { right } = spreadAt(width, height);

    // How much of the book's right-hand page is actually on screen. On any
    // landscape viewport the answer is "most of it" and the sheet can sit
    // exactly on the paper. A portrait phone is the case that breaks: the
    // camera crops a 16:9 frame to a tall band, so the spine ends up two
    // thirds of the way across and there are 186 readable pixels left of a
    // 604px page. Type does not fit in that, and shrinking it to fit is worse
    // than not registering with the photo.
    //
    // So below half a viewport of visible page, the sheet stops pretending to
    // be the right half of a spread and becomes the whole screen, hinged at
    // the left edge. The book is still behind it and the turn is the same
    // gesture -- it just reads as a page filling the phone rather than as one
    // half of a spread you can only see a sliver of.
    // Note the comparison is against the page's own width, not the viewport's:
    // the right page is about half the screen by definition, so measuring it
    // against the viewport made every desktop "not enough room" and threw the
    // whole layout to full bleed.
    const visible = width - right.x;
    const fullBleed = visible < right.width * 0.6 || visible < 320;
    const sheetRect = fullBleed
      ? { x: 0, y: 0, width, height }
      : { ...right, width: Math.min(right.width, visible) };

    // Look at the book from the spine, not from the middle of the window: a
    // perspective origin off to the side skews the turning page into a wedge.
    stage.style.perspectiveOrigin = `${sheetRect.x}px ${sheetRect.y + sheetRect.height / 2}px`;

    for (const sheet of sheetRefs.current) {
      if (!sheet) continue;
      Object.assign(sheet.style, {
        left: `${sheetRect.x}px`,
        top: `${sheetRect.y}px`,
        width: `${sheetRect.width}px`,
        height: `${sheetRect.height}px`,
      });
    }
  }, []);

  useGSAP(
    () => {
      const sheets = sheetRefs.current.filter(
        (el): el is HTMLDivElement => el !== null,
      );
      if (sheets.length === 0) return;

      layout();

      let disposed = false;
      let rafId = 0;
      const onRefresh = () => layout();
      ScrollTrigger.addEventListener("refresh", onRefresh);
      const observer = new ResizeObserver(() => {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          if (!disposed) layout();
        });
      });
      observer.observe(sectionRef.current as HTMLDivElement);

      // Everything that has to be derived from the sheets' angles, done once
      // per frame for the whole stack rather than per turning sheet.
      //
      // Stacking, in two bands that never meet: face-up sheets are on the
      // right and the earliest is on top; turned sheets are on the left and
      // the latest is on top, the way a read pile actually accumulates. The
      // sheet mid-turn spans both halves, so it goes above everything.
      //
      // Shading is a sine of the angle rather than a tween of its own -- a
      // page is darkest side-on and clean when flat, and that is one line of
      // arithmetic against a second set of tweens to keep in step.
      const paint = () => {
        sheets.forEach((sheet, index) => {
          const angle = Number(gsap.getProperty(sheet, "rotationY"));
          const turning = angle < -0.5 && angle > -179.5;
          sheet.style.zIndex = String(
            turning ? 90 : angle <= -90 ? 50 + index : 40 - index,
          );
          const lift = Math.abs(Math.sin((angle * Math.PI) / 180));
          for (const shade of sheet.querySelectorAll<HTMLElement>(
            "[data-shade]",
          )) {
            shade.style.opacity = String(lift * 0.55);
          }
        });
      };

      paint();

      if (reduced) {
        // No 3D, no pin: the pages are laid out as a column below (see the
        // render), and there is nothing to drive.
        return () => {
          disposed = true;
          cancelAnimationFrame(rafId);
          ScrollTrigger.removeEventListener("refresh", onRefresh);
          observer.disconnect();
        };
      }

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: SCROLL_LENGTH,
          scrub: SCRUB,
          pin: true,
          anticipatePin: 1,
          // No refreshPriority here on purpose. ScrollTrigger's refresh
          // comparator sorts on `-1e6 * refreshPriority + _sortY`, and _sortY is
          // the trigger's position on the page -- so page order is already the
          // default and these two refresh in the right order for free. Setting
          // it also inverts easily: HIGHER priority refreshes first, so the
          // intuitive "first section gets 0, second gets 1" refreshes the second
          // section's pin before the one its start is measured against, and the
          // reveal loses most of its scroll length.
        },
      });

      // The join with the reveal. The reveal hands over on the photographed
      // spread and the first sheet is lying on its right-hand page, so without
      // this the pin boundary is a cut: the page under your eye swaps for a
      // drawn one between two frames. Fading the whole sheet up over the lead-
      // in makes it a dissolve from the photographed page to the printed one,
      // which is not a thing books do but is invisible, which is the point.
      //
      // Every sheet starts hidden, not just the first: a half-transparent
      // sheet one shows sheet two's heading straight through it, so the
      // dissolve was reading as two titles printed on top of each other. The
      // rest are switched on the instant the fade is done, underneath a sheet
      // that is opaque again by then.
      gsap.set(sheets, { autoAlpha: 0 });
      tl.to(sheets[0], { autoAlpha: 1, duration: LEAD_IN, ease: "none" }, 0);
      if (sheets.length > 1) tl.set(sheets.slice(1), { autoAlpha: 1 }, LEAD_IN);

      // One staggered tween, not five hand-positioned ones. Same animation on
      // every sheet at a fixed offset is exactly what stagger is for, and it
      // collapses five tweens and five onUpdate callbacks into one of each --
      // the callback can then paint the whole stack in a single pass instead
      // of each sheet racing to set its own z-index.
      //
      // The last sheet is not in the set: with six pages there are five turns,
      // because page one is already face up.
      tl.to(
        sheets.slice(0, -1),
        {
          rotationY: -180,
          duration: TURN,
          stagger: TURN + GAP,
          // Linear, and linear for a reason that only shows up under a
          // scrub: an eased turn spends most of its angle in the middle of
          // the tween, so the part of the flip worth looking at goes past
          // in a couple of hundred pixels of scroll and the rest is a page
          // lying still. Linear spreads the rotation evenly over the wheel,
          // and the scrub's own catch-up supplies the weight the ease was
          // there for.
          ease: "none",
          onUpdate: paint,
        },
        LEAD_IN,
      );

      // Hold on the last page before the pin releases, so it is readable
      // rather than a thing you scroll past.
      tl.to({}, { duration: TRAIL });

      // The timeline, its ScrollTrigger and the gsap.set above are all inside
      // the hook's context, so revertOnUpdate below tears them down. Only the
      // things GSAP does not own are cleaned up by hand.
      return () => {
        disposed = true;
        cancelAnimationFrame(rafId);
        ScrollTrigger.removeEventListener("refresh", onRefresh);
        observer.disconnect();
      };
    },
    {
      dependencies: [reduced],
      scope: sectionRef,
      // Without this, useGSAP runs the cleanup above on a dependency change
      // but does NOT revert the context -- so the old timeline's pinned
      // ScrollTrigger kept its pin spacing (450% of padding stacking up on
      // each re-run) and the `autoAlpha: 0` written onto every sheet stayed
      // on the DOM, leaving the new timeline animating invisible pages.
      // Reverting is what kills a pinned trigger properly; doing it by hand
      // with kill(true) covered the spacing but never the inline styles.
      revertOnUpdate: true,
    },
  );

  // The tier resolves one tick after mount, which is when the <img> first
  // exists. Position it then -- deliberately not by adding `tier` to the
  // dependencies above, because that would tear down and rebuild the pinned
  // timeline for what is a one-line style write.
  useEffect(() => {
    if (tier) layout();
  }, [tier, layout]);

  if (reduced) {
    return (
      <section
        className="w-full"
        style={{ backgroundColor: LETTERBOX }}
        aria-label="Nivlak sections"
      >
        {BOOK_PAGES.map((page) => (
          <article
            key={page.number}
            className="mx-auto max-w-2xl px-6 py-24 text-slate-200"
          >
            <PageBody page={page} />
          </article>
        ))}
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      className="relative h-svh w-full overflow-hidden"
      style={{ backgroundColor: LETTERBOX }}
    >
      {tier ? (
        <img
          ref={frameRef}
          src={FRAME_SRC(FRAME_COUNT, tier)}
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none absolute max-w-none select-none"
        />
      ) : null}

      <div
        ref={stageRef}
        className="absolute inset-0"
        style={{ perspective: "2200px" }}
      >
        {BOOK_PAGES.map((page, index) => (
          <div
            key={page.number}
            ref={(el) => {
              sheetRefs.current[index] = el;
            }}
            className="absolute origin-left [transform-style:preserve-3d] [will-change:transform]"
          >
            {/* Front: the page you are reading. */}
            <div className="absolute inset-0 overflow-hidden [backface-visibility:hidden]">
              <PageFace>
                <PageBody page={page} />
              </PageFace>
            </div>

            {/* Back: what lands on the left half once this sheet has turned.
                Blank on purpose -- the eye follows the new right-hand page,
                and a second column of type there would compete with it. */}
            <div
              className="absolute inset-0 overflow-hidden [backface-visibility:hidden]"
              style={{ transform: "rotateY(180deg)" }}
            >
              <PageFace mirrored>
                <PageFoot page={page} />
              </PageFace>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// The paper. Colours are sampled from the spread in frame-091 rather than
// picked, so a sheet lying flat on the book is the same navy as the page under
// it and the turn is the only thing that gives it away.
//
// The lighting matters as much as the colour. A flat rectangle of the right hue
// still reads as a div: once two sheets had turned, the left half of the screen
// was one dead panel and the photograph might as well not have been there. So
// each face carries what the camera actually put on that paper -- the shadow
// curving into the gutter, a lit edge on the outside, and a vignette top and
// bottom.
function PageFace({
  mirrored = false,
  children,
}: {
  mirrored?: boolean;
  children?: React.ReactNode;
}) {
  const outer = mirrored ? "left" : "right";
  const gutter = mirrored ? "right" : "left";

  return (
    <div
      className="relative h-full w-full"
      style={{
        background: mirrored
          ? "linear-gradient(270deg, #10233c 0%, #172d4a 20%, #1d3352 62%, #22395a 100%)"
          : "linear-gradient(90deg, #10233c 0%, #1b3251 20%, #21365a 62%, #263d60 100%)",
      }}
    >
      {/* Vignette: the clip is lit from above and the paper falls off top and
          bottom. Without this the sheet is brighter at its corners than the
          page it is lying on. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0) 22%, rgba(0,0,0,0) 72%, rgba(0,0,0,0.4))",
        }}
      />

      {children}

      {/* Paper curving into the spine. */}
      <div
        className="pointer-events-none absolute inset-y-0 w-[9%]"
        style={{
          [gutter]: 0,
          background: `linear-gradient(${mirrored ? 270 : 90}deg, rgba(0,0,0,0.45), rgba(0,0,0,0))`,
        }}
      />
      {/* The lit outside edge, which is the brightest thing in the frame. */}
      <div
        className="pointer-events-none absolute inset-y-0 w-[2px]"
        style={{ [outer]: 0, background: "rgba(197,214,238,0.35)" }}
      />

      {/* Driven from the turn tween: a sheet edge-on catches no light. */}
      <div
        data-shade
        className="pointer-events-none absolute inset-0 bg-black opacity-0"
      />
    </div>
  );
}

// What is printed on the back of a sheet, and so on the left-hand page once it
// has turned. A running foot and nothing else: a second column of type there
// would compete with the page the reader has just arrived at, but a blank half
// of the screen reads as a mistake.
function PageFoot({ page }: { page: (typeof BOOK_PAGES)[number] }) {
  return (
    <div className="absolute inset-x-0 bottom-[8%] flex justify-start ps-[12%]">
      <p className="text-[clamp(0.55rem,0.8vw,0.7rem)] tracking-[0.35em] text-slate-400/45 tabular-nums">
        {page.number} &mdash; {page.title.toUpperCase()}
      </p>
    </div>
  );
}

function PageBody({ page }: { page: (typeof BOOK_PAGES)[number] }) {
  return (
    <div className="flex h-full w-full flex-col justify-center px-[10%] py-[8%] text-slate-200">
      <p className="mb-3 text-[clamp(0.6rem,0.9vw,0.75rem)] tracking-[0.35em] text-slate-400/80 tabular-nums">
        {page.number} &mdash; {page.title.toUpperCase()}
      </p>
      <h2 className="mb-[0.4em] text-[clamp(1.6rem,3.4vw,3.25rem)] leading-[1.05] font-light text-white">
        {page.title}
      </h2>
      <p className="max-w-[34ch] text-[clamp(0.8rem,1.15vw,1.05rem)] leading-relaxed text-slate-300/90">
        {page.body}
      </p>
      {page.points ? (
        <ul className="mt-[1.2em] space-y-[0.5em] text-[clamp(0.7rem,1vw,0.9rem)] text-slate-400">
          {page.points.map((point) => (
            <li key={point} className="border-t border-white/10 pt-[0.5em]">
              {point}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

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
  // Same value as `tier`, mirrored into a ref because layout() is captured by
  // the ResizeObserver and the refresh listener at setup time. If layout()
  // closed over the state it would keep reading `null` on every later resize
  // and blank the pages' background image.
  const tierRef = useRef<ReturnType<typeof pickTier> | null>(null);

  useEffect(() => {
    const resolved = pickTier(window.innerWidth);
    tierRef.current = resolved;
    setTier(resolved);
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
    // The paper is the paper: the sheet keeps the page's true width even where
    // that runs off the right of the window. It used to be clamped to the
    // visible part, which was fine while the sheets were flat CSS but is wrong
    // now that they carry the photograph -- a clamped sheet sweeps a narrower
    // arc than the page underneath it, and its back lands short of covering
    // the left page. What actually needed clamping was the type, and that is
    // what --page-text-inset-end below does.
    const sheetRect = fullBleed ? { x: 0, y: 0, width, height } : right;

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

    // The pages ARE the photograph. Each face shows the region of frame-091
    // that lies underneath it, so a sheet resting flat on the book is pixel
    // for pixel the page it is resting on -- the gutter shadow, the lit outer
    // edge and the fall-off top and bottom are the ones the camera recorded,
    // not a gradient guessing at them. Turning a sheet then perspective-
    // projects real paper instead of a drawn rectangle.
    //
    // Every sheet shares one rect, so these live on the stage and the twelve
    // faces inherit them; that is one style write per refresh rather than
    // twenty-four.
    //
    // background-position is the image's top-left relative to the face's own
    // box. The front face sits at sheetRect, so the frame's corner is at
    // (frame - sheetRect). The back face is the same box reflected through the
    // spine -- it comes to rest spanning [spine - w, spine] -- so its origin
    // is one sheet-width further left.
    const spine = sheetRect.x;
    stage.style.setProperty(
      "--page-image",
      tierRef.current ? `url("${FRAME_SRC(FRAME_COUNT, tierRef.current)}")` : "none",
    );
    stage.style.setProperty(
      "--page-image-size",
      `${frame.width}px ${frame.height}px`,
    );
    stage.style.setProperty(
      "--page-front-pos",
      `${frame.x - sheetRect.x}px ${frame.y - sheetRect.y}px`,
    );
    stage.style.setProperty(
      "--page-back-pos",
      `${frame.x - (spine - sheetRect.width)}px ${frame.y - sheetRect.y}px`,
    );
    // How far the page runs past the right of the window, so the type can be
    // pulled back inside it without moving the paper.
    stage.style.setProperty(
      "--page-text-inset-end",
      `${Math.max(0, sheetRect.x + sheetRect.width - width)}px`,
    );
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

      // The join with the reveal, and it is now only the type that moves.
      //
      // The reveal hands over on the photographed spread with the first sheet
      // already lying on its right-hand page -- and because that sheet carries
      // the same photograph, the paper half of the handover is already
      // seamless. All that is left to bring in is the ink.
      //
      // This used to fade the whole sheet with autoAlpha, which worked but was
      // quietly fighting the 3D: per CSS Transforms 2, opacity below 1 is a
      // grouping value and forces `transform-style: flat` on the element it is
      // applied to, so a mid-fade sheet drops out of the 3D context and its
      // faces stop being separate planes. Harmless here only because the fade
      // finishes before the first turn. Fading the ink instead keeps opacity
      // on a face that is already flattened by its own overflow clip, and the
      // sheet's preserve-3d is never disturbed.
      const ink = sheets[0].querySelectorAll<HTMLElement>("[data-ink]");
      tl.fromTo(
        ink,
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: LEAD_IN, ease: "none" },
        0,
      );

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
      <div>
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
      </div>
    );
  }

  return (
    <div>
      {/* Wrapper for ScrollTrigger's pin -- see the note in
          <BookScrollReveal>. pin:true moves this section inside a
          div.pin-spacer it builds, which invalidates React's idea of where the
          section lives; the div keeps React holding a reference GSAP never
          reparents. Both branches of this component return a <div> root for
          the same reason: React then reconciles inside one stable element
          instead of swapping the node the container points at. */}
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
                <PageFace side="front">
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
                <PageFace side="back">
                  <PageFoot page={page} />
                </PageFace>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// The paper: a window onto frame-091, positioned so the face shows exactly the
// part of the spread it is covering.
//
// There used to be four hand-built layers here -- a navy gradient sampled off
// the frame, a vignette, a gutter shadow and a lit outer edge -- every one of
// them a guess at something the photograph already contains, and every one of
// them a thing that could drift out of agreement with it. They are all gone.
// The only overlay left is the one the picture genuinely cannot supply: a
// sheet standing up out of the page catches less light, and no still frame
// knows that a page is being lifted.
function PageFace({
  side,
  children,
}: {
  side: "front" | "back";
  children?: React.ReactNode;
}) {
  return (
    <div
      className="relative h-full w-full bg-no-repeat"
      style={{
        // Under the image, not instead of it: the book's own edge colour shows
        // wherever a face reaches past the frame, so the seam reads as part of
        // the picture rather than as a hole.
        backgroundColor: LETTERBOX,
        backgroundImage: "var(--page-image, none)",
        backgroundSize: "var(--page-image-size, cover)",
        backgroundPosition:
          side === "front"
            ? "var(--page-front-pos, center)"
            : "var(--page-back-pos, center)",
      }}
    >
      {children}
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
    <div
      data-ink
      className="absolute inset-x-0 bottom-[8%] flex justify-start ps-[12%]"
    >
      <p className="text-[clamp(0.55rem,0.8vw,0.7rem)] tracking-[0.35em] text-slate-400/45 tabular-nums">
        {page.number} &mdash; {page.title.toUpperCase()}
      </p>
    </div>
  );
}

function PageBody({ page }: { page: (typeof BOOK_PAGES)[number] }) {
  return (
    <div
      data-ink
      className="flex h-full w-full flex-col justify-center py-[8%] ps-[10%] pe-[calc(10%+var(--page-text-inset-end,0px))] text-slate-200"
    >
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

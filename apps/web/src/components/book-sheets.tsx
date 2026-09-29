"use client";

import {
  FRAME_COUNT,
  FRAME_SRC,
  LETTERBOX,
  type Tier,
  finalFrameRect,
  spreadAt,
} from "@/components/book-camera";
import { Emblem } from "@/components/book-emblems";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  BOOK_PAGES,
  BOOK_SPREADS,
  MOBILE_PAGES,
  type BookPage,
  type BookSpread,
  type PageFigure,
  type PageMask,
  type PageMember,
  type PagePlate,
  type PageService,
  type PageStep,
  roman,
} from "@/components/book-pages.content";

// The sheets that turn over the open book, and the arithmetic that puts them
// on it. No animation and no ScrollTrigger live here -- <Book> owns the single
// pinned timeline that drives both the opening and these turns, because
// splitting them across two pinned sections is what used to put a seam and a
// duplicate book in the handover between them.
//
// The parent finds these elements by data attribute inside its own GSAP scope
// rather than by ref, so nothing has to be plumbed back up.
//
// HOW A SPREAD IS MADE OF SHEETS
//
// The sheets sit on the book's RIGHT-hand page and hinge at the spine, which
// is what a page actually is. So the spread you are looking at is never one
// element:
//
//     spread 0:  [ the book's own left page ] | [ sheet 0 front ]
//     spread k:  [ sheet k-1 BACK           ] | [ sheet k front ]
//
// That is why only the opening spread can carry copy on both halves without an
// extra turn to get there: every later left-hand page is the back of a sheet
// the reader has already turned past. <FacingPage> is that opening left page --
// a layer under the whole stack, which sheet 0's back covers the moment it
// turns, exactly as paper would.

/**
 * How many turns the pages need. The first page is already face up.
 *
 * Counted off the SPREADS, not the chapters: an illustrated chapter can run to
 * more than one spread, and every spread is a sheet that has to turn.
 */
export const TURNS = BOOK_SPREADS.length - 1;

/** The same count for portrait, where every page is its own sheet. */
export const MOBILE_TURNS = MOBILE_PAGES.length - 1;

/**
 * Put the sheets on the book, and point each face at the part of the
 * photograph it is covering.
 *
 * Called on ScrollTrigger's refresh rather than on raw resize: while pinned,
 * GSAP writes explicit pixel dimensions onto the section, so a resize handler
 * reads the stale pinned size and the fresh one only lands on the next refresh.
 */
/**
 * Is the sheet the whole screen rather than the book's right-hand page?
 *
 * Exported because <Book> has to ask the same question React-side: in this
 * mode the book prints ONE page per sheet (see MOBILE_PAGES), which is a
 * different list of sheets and a different scroll length, not a stylesheet
 * difference. Both callers must agree or the timeline would drive sheets that
 * are not there.
 *
 * The comparison is against the PAGE's own width, not the viewport's: the
 * right page is about half the screen by definition, so measuring it against
 * the viewport made every desktop "not enough room" and threw the whole
 * layout to full bleed.
 */
/**
 * The recto's own fore-edge margin, as a fraction of the page.
 *
 * It is here because `--page-index-inset` is the DIFFERENCE between where the
 * type already lands and where the thumb index starts, so the reservation has
 * to know the margin the page is actually set with. It was written as a bare
 * 0.1 while `<PageBody>` used `pe-[10%]`; the day that padding moved to 7% for
 * a wider left margin, the two disagreed and the recto under-reserved the
 * index by 3% of the page -- about 22px at 1440x900, straight under the tabs.
 * Change one and change the other.
 */
const RECTO_END_MARGIN = 0.09;

export function isFullBleed(width: number, height: number) {
  const { right } = spreadAt(width, height);
  const visible = width - right.x;
  return visible < right.width * 0.6 || visible < 320;
}

export function layoutSheets(section: HTMLElement, tier: Tier | null) {
  const stage = section.querySelector<HTMLElement>("[data-stage]");
  if (!stage) return;

  const { width, height } = section.getBoundingClientRect();
  if (!width || !height) return;

  const frame = finalFrameRect(width, height);
  const { left, right } = spreadAt(width, height);

  // How much of the book's right-hand page is actually on screen. On any
  // landscape viewport the answer is "most of it" and the sheet can sit
  // exactly on the paper. A portrait phone is the case that breaks: the camera
  // crops a 16:9 frame to a tall band, so the spine ends up two thirds of the
  // way across and there are 186 readable pixels left of a 604px page. Type
  // does not fit in that, and shrinking it to fit is worse than not
  // registering with the photo.
  //
  // So below half a page of visible width, the sheet stops pretending to be
  // the right half of a spread and becomes the whole screen, hinged at the
  // left edge. The book is still behind it and the turn is the same gesture --
  // it just reads as a page filling the phone rather than as one half of a
  // spread you can only see a sliver of.
  //
  // Note the comparison is against the page's own width, not the viewport's:
  // the right page is about half the screen by definition, so measuring it
  // against the viewport made every desktop "not enough room" and threw the
  // whole layout to full bleed.
  const fullBleed = isFullBleed(width, height);

  // The paper is the paper: the sheet keeps the page's true width even where
  // that runs off the right of the window. Clamping it to the visible part was
  // fine while the sheets were flat CSS and is wrong now that they carry the
  // photograph -- a clamped sheet sweeps a narrower arc than the page
  // underneath it, and its back lands short of covering the left page. What
  // actually needed clamping was the type; --page-text-inset-end does that.
  const sheetRect = fullBleed ? { x: 0, y: 0, width, height } : right;

  // Look at the book from the spine, not from the middle of the window: a
  // perspective origin off to the side skews the turning page into a wedge.
  stage.style.perspectiveOrigin = `${sheetRect.x}px ${
    sheetRect.y + sheetRect.height / 2
  }px`;

  for (const sheet of stage.querySelectorAll<HTMLElement>("[data-sheet]")) {
    Object.assign(sheet.style, {
      left: `${sheetRect.x}px`,
      top: `${sheetRect.y}px`,
      width: `${sheetRect.width}px`,
      height: `${sheetRect.height}px`,
    });
  }

  // The opening spread's left-hand page. It has no sheet of its own -- it is
  // the book's own left page with type over it -- so it is laid onto the left
  // rect from the same camera and left there. A full-bleed sheet covers the
  // whole window, so on a portrait phone there is no left page to print on;
  // there the verso is a sheet of its own (SinglePageSheets).
  const facingPage = stage.querySelector<HTMLElement>("[data-left-page]");
  if (facingPage) {
    facingPage.style.display = fullBleed ? "none" : "";
    if (!fullBleed) {
      Object.assign(facingPage.style, {
        left: `${left.x}px`,
        top: `${left.y}px`,
        width: `${left.width}px`,
        height: `${left.height}px`,
      });
    }
  }

  // The pages ARE the photograph. Each face shows the region of frame-091 that
  // lies underneath it, so a sheet resting flat on the book is pixel for pixel
  // the page it is resting on -- the gutter shadow, the lit outer edge and the
  // fall-off top and bottom are the ones the camera recorded, not a gradient
  // guessing at them. Turning a sheet then perspective-projects real paper
  // instead of a drawn rectangle.
  //
  // Every sheet shares one rect, so these live on the stage and the faces
  // inherit them; that is one style write per refresh rather than one per face.
  //
  // background-position is the image's top-left relative to the face's own
  // box. The front face sits at sheetRect, so the frame's corner is at
  // (frame - sheetRect). The back face is the same box reflected through the
  // spine -- it comes to rest spanning [spine - w, spine] -- so its origin is
  // one sheet-width further left.
  const spine = sheetRect.x;
  stage.style.setProperty(
    "--page-image",
    tier ? `url("${FRAME_SRC(FRAME_COUNT, tier)}")` : "none",
  );
  if (fullBleed) {
    // ONE PAGE OF PAPER, NOT A CROP OF THE SPREAD.
    //
    // A full-bleed sheet is the whole screen, and the frame region under it
    // was whatever the window happened to cover -- which is the middle of the
    // photograph, so the book's GUTTER printed as a dark band about 60% across
    // every page and the type crossed it. Measured on a Pixel 5 (393x851) it
    // is unmistakable, and it is the one thing that stops a phone page reading
    // as a single leaf.
    //
    // So the RIGHT-HAND PAGE of the photograph is scaled to cover the sheet
    // and centred on it: the sheet shows paper from inside one page, with no
    // gutter, no spine and no second page's edge in it. `cover` rather than
    // `contain` because a letterboxed photograph would put the plinth on the
    // screen; the crop loses the page's own edges, which is right -- the sheet
    // IS the page now, so its edges are the screen's.
    const scale = Math.max(width / right.width, height / right.height);
    const dx = (width - right.width * scale) / 2;
    const dy = (height - right.height * scale) / 2;
    const pos = `${(frame.x - right.x) * scale + dx}px ${
      (frame.y - right.y) * scale + dy
    }px`;
    stage.style.setProperty(
      "--page-image-size",
      `${frame.width * scale}px ${frame.height * scale}px`,
    );
    stage.style.setProperty("--page-front-pos", pos);
    // The back is the same leaf seen from behind: the same crop, and the face
    // is already mirrored by its own rotateY(180deg).
    stage.style.setProperty("--page-back-pos", pos);
  } else {
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
  }
  // How far each page runs past its side of the window, so the type can be
  // pulled back inside without moving the paper. The right page overhangs to
  // the right; the left page starts off the left edge.
  stage.style.setProperty(
    "--page-text-inset-end",
    `${Math.max(0, sheetRect.x + sheetRect.width - width)}px`,
  );
  stage.style.setProperty("--facing-inset-start", `${Math.max(0, -left.x)}px`);

  // How far the thumb index intrudes on the recto's type.
  //
  // <BookIndex> is pinned to the WINDOW's right edge, not to the measured edge
  // of the paper -- deliberately, because on a wide viewport the right-hand
  // page bleeds off screen and the window edge IS the fore-edge. Nothing
  // reserved space for it, so every spread cleared it by luck: whatever
  // happened to sit at the index's height was short enough. The illustrated
  // catalogue has no such luck. Its entries alternate, so a plate lands on the
  // outer edge every other row, and its rows are even, so one of them is always
  // at the index's height. Unreserved, entry IV's copy ran to x=1390 at
  // 1440x900 and printed through the "SOLUTIONS 02" tab, 129px of overlap.
  //
  // Measured off the widest tab rather than the current one: a tab shows its
  // title when it is current OR hovered, so PERSPECTIVES is the constraint even
  // on the spread whose own tab reads SOLUTIONS.
  //
  // The arithmetic, in window coordinates. The type's right edge already lands
  // at (pageRight - margin), where pageRight is the paper's right edge clamped
  // to the window -- that clamp is what --page-text-inset-end does. It has to
  // land at or left of (width - indexWidth - INDEX_GUTTER), so the extra inset
  // is the difference, floored at zero: a page whose own margin already clears
  // the index asks for nothing.
  const indexEl = section.querySelector<HTMLElement>("[data-book-index]");
  const indexWidth = indexEl ? width - indexEl.getBoundingClientRect().left : 0;
  // Air between the last character and the notch. At 0 they touch and the type
  // reads as running into the tabs even though it no longer overlaps them.
  const INDEX_GUTTER = 18;
  const pageRight = Math.min(width, sheetRect.x + sheetRect.width);
  stage.style.setProperty(
    "--page-index-inset",
    `${Math.max(0, pageRight - sheetRect.width * RECTO_END_MARGIN - (width - indexWidth - INDEX_GUTTER))}px`,
  );
  // The same clamp for a verso printed on a sheet's back. That page is the
  // sheet's own box reflected through the spine, so it begins at
  // (spine - width) rather than at the photographed paper's left edge, and it
  // needs its own number.
  stage.style.setProperty(
    "--verso-inset-start",
    `${Math.max(0, sheetRect.width - spine)}px`,
  );
}

/**
 * Everything derived from the sheets' angles, done once per frame for the whole
 * stack rather than per turning sheet.
 *
 * Stacking is two bands that never meet: face-up sheets are on the right and
 * the earliest is on top; turned sheets are on the left and the latest is on
 * top, the way a read pile actually accumulates. The sheet mid-turn spans both
 * halves, so it goes above everything. All of these sit above the facing page,
 * which is why turning sheet 0 buries the opening left-hand page.
 *
 * Shading is a sine of the angle rather than a tween of its own -- a page is
 * darkest side-on and clean when flat, and that is one line of arithmetic
 * against a second set of tweens to keep in step.
 */
export function paintSheets(
  sheets: HTMLElement[],
  angleOf: (sheet: HTMLElement) => number,
) {
  sheets.forEach((sheet, index) => {
    const angle = angleOf(sheet);
    const turning = angle < -0.5 && angle > -179.5;
    sheet.style.zIndex = String(
      turning ? 90 : angle <= -90 ? 50 + index : 40 - index,
    );
    const lift = Math.abs(Math.sin((angle * Math.PI) / 180));
    for (const shade of sheet.querySelectorAll<HTMLElement>("[data-shade]")) {
      shade.style.opacity = String(lift * 0.55);
    }
  });
}

/**
 * The turnable sheets, stacked on the book's right-hand page.
 *
 * `single` is portrait's one-page-per-sheet mode -- see MOBILE_PAGES. It is
 * passed rather than measured here because <Book> has to know it too: the
 * timeline's length is the number of sheets, so the two must agree.
 */
/**
 * Whether the pages are printed one to a sheet (portrait) or as spreads.
 *
 * <Book> decides it once with isFullBleed() and renders SinglePageSheets or
 * SpreadSheets accordingly, so anything below that needs to lay out
 * differently per mode reads it here instead of guessing from a breakpoint.
 * A breakpoint is a proxy that disagrees with the real mode on a portrait
 * tablet: 1024x1366 is `lg` wide and prints one page per sheet.
 */
const SingleSheetContext = createContext(false);

export function BookSheets({ single = false }: { single?: boolean }) {
  if (single) return <SinglePageSheets />;
  return <SpreadSheets />;
}

/**
 * PORTRAIT: one page to a sheet, and the turn reveals the next page.
 *
 * A full-bleed sheet is the whole screen, so the back of a turned sheet is
 * never at rest on the screen -- it swings off to the left. That is why the
 * spread's verso used to be printed INLINE above the recto on the same sheet:
 * two pages of copy on one page of paper, which is what every `lg:`-scoped
 * cut in this file was paying for. Here the verso is simply its own sheet,
 * and a chapter that is a spread is two turns.
 *
 * The back face carries the running foot and nothing else. It is on screen
 * for the length of one turn and a reader never stops on it.
 */
function SinglePageSheets() {
  return (
    <SingleSheetContext.Provider value={true}>
    <div
      data-stage
      // pointer-events-none on the STAGE and -auto on what it holds. The stage
      // is a full-screen layer painted over the cover, and while the book is
      // closed every sheet in it is visibility:hidden -- so it was an empty
      // box catching every click on the hero: "Open the book" and "Begin a
      // project" were under it (elementsFromPoint put [data-stage] first) and
      // did nothing. Hidden sheets take no events, so the cover gets its
      // clicks back; visible ones opt in and every control on a page works.
      className="pointer-events-none absolute inset-0"
      style={{ perspective: "2200px" }}
    >
      {MOBILE_PAGES.map((page, index) => {
        const spread = BOOK_SPREADS[page.spread];
        if (!spread) return null;
        return (
          <div
            key={`${spread.number}-${page.kind}-${index}`}
            data-sheet
            className="pointer-events-auto absolute origin-left [transform-style:preserve-3d] [will-change:transform]"
          >
            <div className="absolute inset-0 overflow-hidden [backface-visibility:hidden]">
              <PageFace side="front">
                {page.kind === "facing" ? (
                  <VersoPage page={spread} flush />
                ) : (
                  <PageBody page={spread} />
                )}
              </PageFace>
            </div>
            {/* The back of the turning page. Play Books prints the page's own
                content there, reversed and see-through -- "inversely textured
                on the outside of the virtual cylinder ... with page content
                displayed in reverse" (US9911221B2) -- which is what makes it
                read as paper rather than as a blank card flipping over. So it
                is the same page mirrored and held to 14%: legible as shapes,
                unreadable as words, which is exactly what the back of a
                printed leaf looks like. aria-hidden, and never at rest: this
                face is on screen for the length of one turn. */}
            <div
              className="absolute inset-0 overflow-hidden [backface-visibility:hidden]"
              style={{ transform: "rotateY(180deg)" }}
            >
              <PageFace side="back">
                <div
                  aria-hidden
                  inert
                  className="pointer-events-none absolute inset-0 opacity-[0.14] [transform:scaleX(-1)]"
                >
                  {page.kind === "facing" ? (
                    <VersoPage page={spread} flush />
                  ) : (
                    <PageBody page={spread} />
                  )}
                </div>
                <PageFoot page={spread} />
              </PageFace>
            </div>
          </div>
        );
      })}
    </div>
    </SingleSheetContext.Provider>
  );
}

/** The spread: a sheet is a recto and the back of it is the next verso. */
function SpreadSheets() {
  // Index 0 by definition: only the first page can have a facing page, because
  // every later left-hand page is the back of an already-turned sheet.
  const opening = BOOK_SPREADS[0];

  return (
    <div
      data-stage
      // See SinglePageSheets: the stage passes clicks through, its pages opt in.
      className="pointer-events-none absolute inset-0"
      style={{ perspective: "2200px" }}
    >
      {opening?.facing ? (
        <div
          data-left-page
          className="pointer-events-auto absolute z-[5] overflow-hidden [container-type:size]"
          style={{ display: "none" }}
        >
          {/* overflow-hidden is safe HERE and nowhere else in this file: this
              page never turns and carries no 3D transform, so clipping it does
              not flatten anything. The sheets must never have it -- see the
              note in CLAUDE.md about grouping properties.

              It is also load-bearing rather than tidy. This page is laid on
              the measured left rect, so anything set taller than that rect
              prints on the bare ground UNDER the book rather than being cut
              off at the page edge -- which is what 01's footnote did the one
              time the page came out shorter than the copy on it. */}
          <div
            // PAGE_SINKAGE, and it has to be said again here rather than
            // read: this page is not a VersoPage. It is the layer under the
            // stack that sheet 0 buries when it turns, so it carries its own
            // padding. Give it a different drop and chapter 01 opens at a
            // different height from the six that follow it.
            // The OPENING spread's left page keeps 13% where every turned
            // page came back to 11%: asked for less margin "except the first
            // section", and this layer is what that section's left page is --
            // it is the only page in the book that is not a sheet's back, so
            // the exception is structural rather than a chapter number. The BLOCK moves; its measure does not -- the two
            // numbers move by the same 3% and 1%, so no line in the book
            // rewraps. Narrowing the measure instead was the alternative and
            // it is not available: 03 fills its page to the last pixel by
            // construction and 05 has 9px under its last row, so three
            // percent off either measure wraps an outcome or a summary onto a
            // line neither page has.
            className={`flex h-full w-full flex-col justify-start pe-[9%] ps-[calc(13%+var(--facing-inset-start,0px))] text-slate-200 ${PAGE_SINKAGE} ${PAGE_FOOT}`}
          >
            <FacingCopy page={opening} />

            {/* Footnote. Behind a short rule at the foot of the page, which is
                where a book puts an aside it does not want interrupting the
                paragraph. mt-auto drops it there however long the text above
                turns out to be. */}
            {opening.facing?.note ? (
              <div data-ink className="mt-auto max-w-[42ch] lg:max-w-none">
                <span
                  aria-hidden
                  className="mb-[0.9em] block h-px w-[26%] bg-white/15"
                />
                <p className="text-[clamp(0.62rem,0.966vw,0.866rem)] leading-relaxed text-slate-200/90">
                  <sup className="me-[0.4em] align-super text-[0.7em] tabular-nums">
                    1
                  </sup>
                  {opening.facing.note}
                </p>
              </div>
            ) : null}
          </div>
          {/* On a chapter opener the folio drops to the foot, flush with the
              OUTSIDE margin -- which on a left-hand page is the left. The verso
              carries the book's name and the recto the number, so the two
              corners of the spread say different things instead of printing
              the same value twice. */}
          <p
            data-ink
            className="absolute bottom-[7%] portrait:bottom-[3.5%] start-[calc(13%+var(--facing-inset-start,0px))] text-[clamp(0.55rem,0.92vw,0.798rem)] tracking-[0.35em] text-slate-300/80"
          >
            NIVLAK
          </p>
          <FootMark end="9%" />
        </div>
      ) : null}

      {BOOK_SPREADS.map((page, index) => (
        <div
          key={`${page.number}-${index}`}
          data-sheet
          className="pointer-events-auto absolute origin-left [transform-style:preserve-3d] [will-change:transform]"
        >
          {/* Front: the page you are reading. */}
          <div className="absolute inset-0 overflow-hidden [backface-visibility:hidden]">
            <PageFace side="front">
              <PageBody page={page} />
            </PageFace>
          </div>

          {/* Back: the left half of the spread this sheet turns you into. */}
          <div
            className="absolute inset-0 overflow-hidden [backface-visibility:hidden]"
            style={{ transform: "rotateY(180deg)" }}
          >
            <PageFace side="back">
              {/* This face IS the left-hand page of the next spread, so it
                  carries that page's verso if it has one. Where it does not,
                  it stays what it was: a running foot on bare paper. */}
              {BOOK_SPREADS[index + 1]?.facing ? (
                <VersoPage page={BOOK_SPREADS[index + 1]} />
              ) : (
                <PageFoot page={page} />
              )}
            </PageFace>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * What reduced motion gets instead: the same pages as a plain column under the
 * open book. No pin, no 3D, no scrubbing -- and no spread either, so the
 * facing copy is simply set above the page it faces.
 */
export function BookPageColumn() {
  return (
    <section
      data-book-column
      className="w-full"
      style={{ backgroundColor: LETTERBOX }}
      aria-label="Nivlak sections"
    >
      {/* CHAPTERS here, not spreads. Reduced motion is a plain column with no
          pages to turn, so the reason a chapter is cut across spreads -- how
          much fits on a sheet -- does not apply: 02 sets as one section with
          its whole run under it, and the anchors stay one per chapter, which
          is what the nav scrolls to. */}
      {BOOK_PAGES.map((page) => (
        <article
          key={page.number}
          id={`section-${page.number}`}
          className="mx-auto max-w-2xl scroll-mt-16 px-6 py-24 text-slate-200"
        >
          {page.facing ? (
            <div className="mb-10">
              <FacingCopy page={page} />
            </div>
          ) : null}
          <PageBody page={page} />
        </article>
      ))}
    </section>
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
      // Named so <Book> can find the face that just came up and fade its ink
      // in. A sheet carries two of these and the back one is the front page
      // mirrored, so the front has to be addressable on its own or the tween
      // would also target a copy of every element inside an aria-hidden
      // subtree -- and setting visibility on those fights the 14% wash.
      data-face={side}
      className="relative h-full w-full bg-no-repeat [container-type:size]"
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
      {/* The turn's shading, and it is ONE gradient doing two jobs -- the
          shadow in the crease and the fall-off across the lifted page. That is
          how Google's own page-turn describes it (US9911221B2: "a
          semi-transparent gradient textured from the page on the bottom of the
          cylinder outward"), and it is what a flat black wash was missing: a
          page that darkens evenly reads as a dimmer, not as paper lifting off
          a book. Anchored at the CREASE, which is the hinge on the front and
          the far edge on the back, because the back is the same sheet seen
          from behind. paintSheets sets the opacity from the angle. */}
      <div
        data-shade
        className="pointer-events-none absolute inset-0 opacity-0"
        style={{
          backgroundImage: `linear-gradient(${
            side === "front" ? "90deg" : "270deg"
          }, rgba(3,9,18,0.85) 0%, rgba(3,9,18,0.38) 38%, rgba(3,9,18,0.06) 72%, rgba(3,9,18,0) 100%)`,
        }}
      />
    </div>
  );
}

/**
 * A printer's ornament, drawn from the company's own mark.
 *
 * Books break their text with these rather than with more text: a headpiece in
 * the blank space at the start of a chapter, a tailpiece at the end of one.
 * The classic form is a floral fleuron, which would be a lie on a technology
 * studio's page -- so this is the circuit motif out of the N, reduced to a
 * rule that breaks for three nodes. Same idea, same job, our alphabet.
 */
/**
 * The small Nivlak mark printed in the outer bottom corner of every page --
 * bottom-left on a left page, bottom-right on a right one, beside the folio,
 * which is where a book prints its running foot. Clicking it goes back to the
 * cover. It is the book's own navigation: `data-nav-item` with index -1,
 * which <Book>'s seek maps to scroll position 0, so there is no second
 * scroll mechanism to keep in step.
 */
/**
 * A LEFT page's home mark: at the RIGHT END of its folio line, its right edge
 * flush with the text column's end. Asked for on every page ("the Nivlak logo
 * under all sections should be on the right, on both pages"); a right page
 * carries it just after its folio instead (see PageBody).
 *
 * The box carries the folio's `bottom`, type size and line box (an invisible
 * zero-width glyph), so the mark is centred on the line the folio sits on;
 * `end` is the column's end inset, passed in because it differs per page.
 */
function FootMark({ end }: { end: string }) {
  return (
    <span
      className="absolute bottom-[7%] text-[clamp(0.55rem,0.8vw,0.7rem)] tracking-[0.3em] portrait:bottom-[3.5%]"
      style={{ insetInlineEnd: end }}
    >
      <span aria-hidden className="invisible">
        &#8203;
      </span>
      <span className="absolute end-0 top-1/2 size-[clamp(18px,1.5vw,24px)] -translate-y-1/2">
        <HomeMark side="corner" />
      </span>
    </span>
  );
}

function HomeMark({ side }: { side: "left" | "right" | "corner" }) {
  return (
    // ON THE PAGE, BESIDE ITS FOLIO: left of it on a left page, right of it
    // on a right page -- asked for as "the book corner, not the web corner".
    // It was in the page's outer margin for one revision, and on a spread
    // wider than the window (1440x900 and up) that margin is off the paper's
    // edge or at the window's edge beside the thumb index, so it read as a
    // screen control rather than as something printed on the page.
    //
    // It is positioned against the FOLIO (which is `absolute`), outside it:
    // the folio starts or ends exactly on the text column's edge, so the mark
    // falls in the margin just past the column, where no copy ever runs. Set
    // inline with the folio instead, its box reached 19-22px up into the last
    // line of 03's and 05's versos and 04's recto.
    <button
      type="button"
      data-nav-item
      data-index={-1}
      aria-label="Back to the cover"
      title="Back to the cover"
      className={`pointer-events-auto absolute grid size-[clamp(18px,1.5vw,24px)] cursor-pointer place-items-center rounded-full opacity-60 outline-none transition-opacity duration-300 hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-[#dce7f7] motion-reduce:transition-none ${
        side === "left"
          ? "end-full top-1/2 me-[0.8em] -translate-y-1/2"
          : side === "right"
            ? "start-full top-1/2 ms-[0.8em] -translate-y-1/2"
            : "inset-0"
      }`}
    >
      <img
        src="/logo-mark.webp"
        alt=""
        aria-hidden
        draggable={false}
        className="h-auto w-[78%] select-none"
      />
    </button>
  );
}

function Ornament({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 10"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="none"
    >
      <path
        d="M0 5h50M110 5h50"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.3"
      />
      <path
        d="M64 5h6M90 5h6"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.45"
      />
      <circle cx="58" cy="5" r="1.9" fill="currentColor" opacity="0.5" />
      <circle cx="80" cy="5" r="3.1" fill="currentColor" opacity="0.75" />
      <circle cx="102" cy="5" r="1.9" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

/**
 * A figure: one trace, four nodes, a label under each.
 *
 * Drawn rather than written because a page of nothing but paragraphs is what
 * this spread kept turning back into. The nodes sit at the centres of four
 * equal columns and the labels below use the same four-column grid, so the
 * drawing and the type line up at any width without a magic number.
 */
function Figure({
  figure,
}: {
  figure: NonNullable<NonNullable<BookPage["facing"]>["figure"]>;
}) {
  const columns = figure.steps.length;
  const span = 320 / columns;
  return (
    // `lg:mt-auto` SPLITS the page's slack instead of collecting it in one
    // place. 01's footnote is hung off the foot with its own `mt-auto`, so
    // with only one auto margin every spare pixel piled up between this
    // figure and that footnote: 110px at 1440x900 and 220 at 1920x1080, a
    // hole in the middle of the page. Two auto margins divide it, which puts
    // half above the figure and half above the footnote -- air where a page
    // has air, rather than a gap where a page has a gap.
    // `portrait:mt-auto` for the same reason as `lg:mt-auto`: with the
    // footnote alone hung off the foot, every spare pixel on the phone page
    // collected in ONE gap above it -- 154px at 393x851. Two auto margins
    // divide it, which is air rather than a hole.
    <figure data-ink className="mt-[2.2em] max-w-[42ch] portrait:mt-auto lg:mt-auto lg:max-w-none">
      <svg
        viewBox="0 0 320 30"
        aria-hidden="true"
        focusable="false"
        className="w-full text-slate-300"
        fill="none"
      >
        <path
          d="M8 11h304"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.26"
        />
        {figure.steps.map((step, i) => {
          const x = span * (i + 0.5);
          return (
            <g key={step.label}>
              <path
                d={`M${x} 11v13`}
                stroke="currentColor"
                strokeWidth="1"
                opacity="0.26"
              />
              <circle
                cx={x}
                cy="11"
                r="3.3"
                fill="currentColor"
                opacity="0.75"
              />
            </g>
          );
        })}
      </svg>
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {figure.steps.map((step) => (
          <div key={step.label} className="text-center">
            <p className="text-[clamp(0.66rem,1.035vw,0.935rem)] leading-none text-slate-200">
              {step.label}
            </p>
            {/* On a phone each column is ~62px and the tracked notes ran into
                each other ("free call clear price every week..."): they wrap
                inside their own column there, with less tracking. */}
            <p className="mt-[0.45em] text-[clamp(0.52rem,0.828vw,0.73rem)] leading-snug tracking-[0.16em] text-balance text-slate-300/80 portrait:px-[0.2em] portrait:tracking-[0.06em]">
              {step.note}
            </p>
          </div>
        ))}
      </div>
      <figcaption className="mt-[1.3em] text-[clamp(0.52rem,0.851vw,0.73rem)] tracking-[0.26em] text-slate-300/80">
        {figure.caption.toUpperCase()}
      </figcaption>
    </figure>
  );
}

/**
 * A chapter head, set the way a book sets one.
 *
 * The chapter's NUMBER is the largest thing on the page and hangs in the
 * margin, so a reader thumbing past sees where they are before reading a word;
 * the section name sits beside it in spaced capitals, the title under both, and
 * a rule closes the head. What this replaced -- "02 — SOLUTIONS" in small caps
 * stacked over the headline -- said the same thing twice at two sizes, which is
 * a web page's idea of a heading rather than a book's.
 *
 * It is sized to fit ONE slot of the catalogue grid (~208px at 1440x900). That
 * is the constraint behind the type sizes here: the head has to occupy exactly
 * the height of an entry, or the verso's entries stop lining up with the
 * recto's and the grid has bought nothing.
 */
function ChapterHead({
  page,
  headline,
  epigraph,
}: {
  page: BookPage | BookSpread;
  headline: string;
  /** Optional: the process spread has no room for one. See <StageRun>. */
  epigraph?: string;
}) {
  return (
    // NOT min-h-0. A flex item with its automatic minimum removed can be
    // shrunk below its own content, and a verso whose copy outruns the page is
    // exactly when that happens: the head collapses and its epigraph prints on
    // top of the subtitle beneath it. `shrink-0` keeps the head at its content
    // height and lets the page overflow instead, which the face clips. Type
    // over type is the worse failure by far.
    //
    // `w-full` is what makes the head the same OBJECT on all seven chapters,
    // and without it `self-start` quietly made it seven different ones. In a
    // flex column `align-self` is the CROSS axis, so `self-start` shrink-wraps
    // the head to its widest child -- which is the headline -- and the rule
    // under it, being `w-full` of that, came out the length of whatever the
    // chapter happened to be called: 306px on 06, 400 on 07, 419 on 01, 562 on
    // 02. (02 and 05 were the two that looked right, and only because their
    // head is a GRID item, where `self-start` is the block axis and the
    // inline axis stretches by default.) With `w-full` every head takes the
    // page's own 562px measure, so the rule is one length and the headpiece
    // above it -- 38% of the head -- is one width. Nothing gets taller: a
    // shrink-wrapped headline is by definition one line, and giving it more
    // room leaves it one line.
    <div data-ink className="w-full shrink-0 self-start">
      {/* Headpiece: the ornament that fills the blank at a chapter's head. */}
      <Ornament className="mb-[0.9em] w-[38%] text-slate-300" />
      <div className="flex items-baseline gap-[0.7em]">
        <span
          aria-hidden
          className="font-[family-name:var(--font-display)] text-[clamp(2.2rem,4.4vw,4.4rem)] leading-[0.8] font-light text-[#dce7f7]/85 tabular-nums"
        >
          {roman(page.number)}
        </span>
        {/* The chapter's name beside its numeral. Set brighter and heavier than
            the rest of the book's tracked labels -- asked for directly: at
            slate-400/80 and regular weight it read as a caption, and it is the
            one word that says which chapter this is. */}
        <span className="text-[clamp(0.6rem,0.9vw,0.76rem)] leading-none font-semibold tracking-[0.4em] text-[#c9d9ef]">
          {page.title.toUpperCase()}
        </span>
      </div>
      {/* More air between "01 COMPANY" and the headline on the chapter that
          opens the book (the one with an intro), asked for there. Not every
          chapter: 03 and 05 fill their spreads to the pixel. */}
      <h2 className={`${page.facing && "intro" in page.facing && page.facing.intro ? "mt-[0.6em]" : "mt-[0.3em]"} font-[family-name:var(--font-display)] text-[clamp(1.5rem,3vw,3rem)] leading-[1.03] font-light text-balance text-white`}>
        {headline}
      </h2>
      {/* The rule that closes a chapter head. */}
      <span aria-hidden className="mt-[0.45em] block h-px w-full bg-white/18" />
      {epigraph ? (
        <p className="mt-[0.7em] font-[family-name:var(--font-display)] text-[clamp(0.8rem,1.1vw,1.05rem)] leading-snug text-slate-300/75 italic">
          {epigraph}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The opening left-hand page.
 *
 * Laid out as a book chapter opener, which is a specific thing and not just a
 * big heading: sinkage (the text starts low, not centred), a drop cap on the
 * first paragraph, and the first sentence in small capitals to carry the eye
 * from that oversized initial back down to body size. Those conventions belong
 * to openers only, which is exactly why they appear on this page and on no
 * other -- consistency here means NOT repeating them.
 */
function FacingCopy({ page }: { page: BookPage | BookSpread }) {
  const single = useContext(SingleSheetContext);
  if (!page.facing) return null;
  const { headline, subtitle, intro, epigraph, note, figure } = page.facing;
  const spread = page as Partial<BookSpread>;
  const from = spread.servicesFrom ?? 0;
  // Which chapter this half-title opens, if it is a plate section's. `chapter`
  // is on a spread and not on a BookPage, so the reduced-motion column -- which
  // sets uncut chapters -- has to find its own index.
  const plateChapter = !spreadIsPlates(page)
    ? -1
    : (spread.chapter ?? BOOK_PAGES.indexOf(page as BookPage));

  // A continuation spread's verso is more of the catalogue, not the start of
  // anything, so it takes NONE of the opener devices -- no headpiece, no
  // chapter title, no epigraph. Printing a chapter title again on the second
  // spread of the same chapter is the thing a book never does.
  if (spread.continued) {
    // Only the catalogue is cut across spreads now, so a continuation verso is
    // always more of its entries. The plate section had two more cases here
    // when it paginated -- one stage, or the first half of a tailpiece that
    // had opened its own spread -- and both went with the pagination.
    return <ServiceEntries services={page.facing.services ?? []} from={from} />;
  }

  // A chapter opening that is also a catalogue page. The head and the entries
  // share ONE grid so the head occupies slot 1 and the entries fall into the
  // slots below it -- which is what puts entry II opposite entry V across the
  // gutter. Rendering the head above a separate grid cannot do that: the grid
  // would then divide whatever height was left over, and "whatever was left
  // over" is a different number on each page.
  if (isIllustrated(page.facing.services)) {
    return (
      <ServiceEntries
        services={page.facing.services ?? []}
        from={from}
        head={
          <ChapterHead page={page} headline={headline} epigraph={epigraph} />
        }
      />
    );
  }

  // THE TEAM SPREAD's verso: the chapter opening in the head slot, then the
  // first half of the members, one to a row -- on the same kind of shared grid
  // as the process spread, and for the same reason. Two portraits a page apart
  // that do not sit on one line read as a layout that slipped.
  if ((page as BookPage).team) {
    const { verso, rows } = teamHalves((page as BookPage).team!.members);
    return (
      <TeamRun
        members={verso}
        from={0}
        rows={rows}
        head={
          <div className="flex min-h-0 flex-col">
            <ChapterHead page={page} headline={headline} />
            {subtitle ? (
              <p
                data-ink
                className="mt-[0.9em] max-w-[42ch] text-[clamp(0.68rem,1.058vw,0.969rem)] leading-relaxed text-balance text-slate-300/80 [@media(max-height:480px)]:hidden"
              >
                {subtitle}
              </p>
            ) : null}
          </div>
        }
      />
    );
  }

  // The PROCESS SPREAD's verso: the chapter opening in the head slot, then the
  // first half of the six stages, one to a row.
  //
  // It shares ONE grid with the head for the reason the catalogue above does.
  // The head cannot sit in a box above the rows: the grid would then divide
  // whatever height was left over, "whatever was left over" is a different
  // number on this page and on the one facing it, and the six rules would run
  // across the gutter at six different heights.
  //
  // The run is read off the CHAPTER (BOOK_PAGES) and not off `facing.services`,
  // the way the indices of 04 and 05 are, because both halves of this spread
  // need all six of it -- the verso to print the first three, the recto to
  // print the rest and to know how many rows to leave room for.
  if (plateChapter >= 0) {
    const { verso, versoRows } = stageHalves(
      BOOK_PAGES[plateChapter]?.services,
      single,
    );
    return (
      <StageRun
        slots={verso}
        rows={versoRows}
        roomy
        head={
          <div className="flex min-h-0 flex-col">
            {/* No epigraph on this chapter, and it is the last ornament the
                head could spare. The description below says what the epigraph
                said -- "six stages, in the order they actually happen" against
                "a structured approach that turns ideas into products" -- and
                only one of the two is the brief's, so the quoted line is the
                one that goes. It is 27px, which is the difference between a
                stage row that fits and one that prints through its own
                deliverable. */}
            <ChapterHead page={page} headline={headline} />
            {/* The chapter's description, and NOT the drop-cap opening this
                page carried for as long as it was a half-title. That is a
                measurement, not a preference.

                The head shares a grid with three stage rows. At 1440x900 the
                four slots have 699px between them; a row will not set below
                ~157 of those with its plate, its activities, its deliverable
                and its outcome all printed; so the opening has ~220px and the
                chapter head alone is 189. A drop cap is 3.4em tall by
                definition, so the shortest paragraph that can carry one is
                three lines -- the version measured here ran to 339px in a
                187px slot and printed straight through stage 01.

                02 has no intro either, for the same reason: a verso carrying
                the chapter's entries has no room for an opening paragraph as
                well. The drop cap is an opener device that needs
                `facing.intro`, and this chapter no longer has one. */}
            {subtitle ? (
              <p
                data-ink
                // Gone below 480px of viewport HEIGHT. At 844x390 the head
                // cell has 104px and needs 138 with this line in, and it is
                // the head that overflows first because a chapter opening
                // cannot be made shorter -- the numeral, the title and the
                // rule are what say which chapter this is.
                className="mt-[0.9em] max-w-[42ch] text-[clamp(0.68rem,1.185vw,1.085rem)] leading-relaxed text-balance text-slate-300/80 [@media(max-height:480px)]:hidden"
              >
                {subtitle}
              </p>
            ) : null}
          </div>
        }
      />
    );
  }

  return (
    <>
      <ChapterHead page={page} headline={headline} epigraph={epigraph} />

      {/* Guarded: an opener set with an epigraph and no subtitle -- which is
          what a chapter title page is -- otherwise printed an empty paragraph
          and its margin, dropping everything below it by a line for nothing. */}
      {/* Not on the perspectives verso, which sets its own -- see below. The
          house subtitle is 30ch of 1.05rem, which is right on a page whose job
          is to introduce one thing and wrong on a page that also has to carry
          six rows: measured at 1440x900 it ran to five lines and pushed
          perspective 06 down through the drop folio. */}
      {subtitle && !isPerspective(page.services) ? (
        <p
          data-ink
          className="mt-[1em] max-w-[30ch] text-[clamp(0.82rem,1.357vw,1.197rem)] leading-relaxed text-balance text-slate-300/85"
        >
          {subtitle}
        </p>
      ) : null}

      {intro ? (
        // THE DROP CAP spans exactly two lines: its top on the top of the
        // small-caps lead-in ("IVLAK"), its foot on the second line's
        // baseline. Asked for in those words.
        //
        // On a spread it is a FLOAT sized and dropped by two variables,
        // --dc-size and --dc-drop, measured rather than derived: at 1440x900
        // N runs 279..321 against IVLAK's top at 280 and the baseline at 321.
        // `initial-letter` was tried first and Chrome does not honour its
        // sink at this 1.95 leading -- the N floated a line high with its
        // foot mid-way down line 2 -- so it is kept only below `lg`, where
        // the leading is normal. The wide-short spread (1366x768 etc.) sets
        // the paragraph at 1.625 and takes its own pair of values.
        //
        // `font-variant-caps: normal` is load-bearing: the letter sits inside
        // the all-small-caps lead-in span and inherited it, so a 61px N
        // printed as a 25px small capital.
        <p
          data-ink
          className="mt-[1.6em] max-w-[44ch] text-[clamp(0.76rem,1.173vw,1.072rem)] leading-relaxed text-pretty lg:max-w-none lg:leading-[1.95] [@media(min-aspect-ratio:17/10)_and_(max-height:880px)]:leading-relaxed text-slate-300/75 first-letter:float-left first-letter:me-[0.08em] first-letter:mt-[0.04em] first-letter:text-[3.4em] first-letter:leading-[0.82] first-letter:font-light first-letter:text-[#dce7f7] max-lg:supports-[initial-letter:2]:first-letter:float-none max-lg:supports-[initial-letter:2]:first-letter:m-0 max-lg:supports-[initial-letter:2]:first-letter:me-[0.14em] max-lg:supports-[initial-letter:2]:first-letter:text-[1em] max-lg:supports-[initial-letter:2]:first-letter:leading-none max-lg:supports-[initial-letter:2]:first-letter:[initial-letter:2] max-lg:supports-[initial-letter:2]:first-letter:[-webkit-initial-letter:2] lg:first-letter:me-[0.12em] lg:first-letter:text-[length:var(--dc-size)] lg:first-letter:leading-[0.72] lg:first-letter:mt-[var(--dc-drop)] lg:first-letter:[font-variant-caps:normal] lg:first-letter:tracking-normal lg:[--dc-size:3.7em] lg:[--dc-drop:0.17em] [@media(min-aspect-ratio:17/10)_and_(max-height:880px)]:[--dc-size:3.2em] [@media(min-aspect-ratio:17/10)_and_(max-height:880px)]:[--dc-drop:0.2em]"
        >
          <span className="[font-variant-caps:all-small-caps] tracking-[0.08em] text-slate-200">
            {intro.lead}
          </span>
          {note ? (
            <sup className="ms-[0.15em] text-[0.62em] align-super text-slate-200/90 tabular-nums">
              1
            </sup>
          ) : null}{" "}
          {intro.body}
        </p>
      ) : null}
      {/* The second paragraph -- what working with us looks like -- and the
          signature under it, set the way a foreword is signed off: the
          display italic, ranged to the paragraph's own measure.

          The 44ch cap is lifted from `lg` on both paragraphs, the signature,
          01's figure and its footnote. The headline and its rule run the
          page's full 556px at 1440, and with the copy held at ~430 there was
          a 130px empty strip down the right of the page under a head that
          spans it. Full measure is ~70 characters, inside a readable line,
          and it makes the page SHORTER rather than fuller. A phone column is
          narrower than the cap, so nothing changes there. */}
      {intro?.more ? (
        <p
          data-ink
          className="mt-[0.8em] max-w-[44ch] text-[clamp(0.76rem,1.173vw,1.072rem)] leading-relaxed text-pretty text-slate-300/75 lg:mt-[1.2em] lg:max-w-none lg:leading-[1.95] [@media(min-aspect-ratio:17/10)_and_(max-height:880px)]:mt-[0.8em] [@media(min-aspect-ratio:17/10)_and_(max-height:880px)]:leading-relaxed"
        >
          {intro.more}
        </p>
      ) : null}
      {intro?.signature ? (
        <p
          data-ink
          className="mt-[0.6em] max-w-[44ch] text-end font-[family-name:var(--font-display)] lg:max-w-none text-[clamp(0.85rem,1.3vw,1.2rem)] text-slate-200/85 italic"
        >
          &mdash; {intro.signature}
        </p>
      ) : null}

      {figure ? <Figure figure={figure} /> : null}

      {/* The index of perspectives. It reads page.services rather than
          facing.services because the run belongs to the CHAPTER and both
          halves of this spread need all six of it -- the verso to list them,
          the recto to hold a window on each. */}
      {isPerspective(page.services) ? (
        // The index and the chapter's column artwork, side by side. The
        // artwork is in the OUTER MARGIN because that is the only part of this
        // verso with room: its height is spoken for by the head and six rows,
        // and its outer column has nothing in it at all.
        // The gap above the index closes on a landscape phone. The sheet
        // there measures 475px in a 390px window -- it is sized to the
        // photographed page, which at that aspect is taller than the screen --
        // so its bottom 45px are off-screen before anything is printed. Six
        // two-line rows, a chapter head and this margin came to 410px of a
        // page that shows 365 of them, and perspective 06's thesis was cut in
        // half by the foot of the window.
        <>
        {/* The chapter's opening sentence, at the page's FULL measure and
            above the row rather than inside the index. Inside, it was squeezed
            to the index's 395px and ran four lines; across the page it is
            three, and those 27px are what the rows below are now leaded with.
            Dropped below `lg` -- see the note in <PerspectiveIndex>'s history:
            at 390x844 the whole spread is on one sheet and this is 90px of it,
            and the headline above says it in six words. */}
        {subtitle ? (
          <p className="mt-[1em] hidden max-w-[52ch] text-[length:clamp(0.7rem,calc(1.14*var(--page-vw)),1.04rem)] leading-[1.75] text-slate-300/80 portrait:block lg:block [@media(min-aspect-ratio:17/10)_and_(max-height:880px)]:leading-normal">
            {subtitle}
          </p>
        ) : null}
        <div className="mt-[1em] flex min-h-0 items-start gap-[clamp(0.7em,calc(1.6*var(--page-vw)),1.5em)] portrait:flex-1 portrait:items-stretch [@media(max-height:480px)]:mt-[0.5em]">
          <PerspectiveIndex services={page.services ?? []} />
          {(page as BookPage).columnPlate ? (
            <PerspectiveColumn plate={(page as BookPage).columnPlate!} />
          ) : null}
        </div>
        </>
      ) : null}

      {/* The index of projects, on the half-title facing the stage. Same reason
          the perspectives' index reads page.services and not facing.services:
          the run belongs to the CHAPTER, and both halves of the spread need all
          four of it -- the verso to name them, the recto to hold the window. */}
      {isProjects(page.services) ? (
        <ProjectIndex services={page.services ?? []} />
      ) : null}

      {/* An illustrated catalogue sets its entries full measure and starts
          them straight under the subtitle; an engraved one hangs its lead
          plate off the foot of the page. Both are catalogues, but only the
          second has a blank lower half to hang anything in. */}
      {isIllustrated(page.facing.services) ? null : page.facing
          .services?.[0] ? (
        <div className="mt-[1.4em] lg:mt-auto">
          <LeadService service={page.facing.services[0]} />
          {page.facing.services.length > 1 ? (
            <SecondaryServices
              services={page.facing.services.slice(1)}
              from={1}
            />
          ) : null}
        </div>
      ) : null}

      {page.facing.steps?.length ? (
        <div className="mt-[1.4em]">
          <StepList steps={page.facing.steps} from={0} />
        </div>
      ) : null}

      {page.facing.plate ? <EngravedPlate plate={page.facing.plate} /> : null}
      {page.contact ? <ContactVerso contact={page.contact} /> : null}
    </>
  );
}

// Plates are numbered in roman, the way a book numbers its illustrations --
// which also keeps them from being confused with the 01-07 of the sections.
//
// Computed rather than tabulated. The table this replaced ran to VIII, which
// was one more than anything needed at the time and would have started
// printing `undefined` the first time a chapter grew past it -- the exact
// change this file is now built to make easy.

/**
 * The lead entry: one plate set large enough to be the thing you see first.
 *
 * Editorial layout gets its hierarchy from scale and dominance -- one
 * dominant image with the supporting ones smaller. The previous version of
 * this spread gave all five entries the same plate, the same type size and
 * the same rule, which is a list with pictures however the pictures are
 * arranged. This one is roughly twice the size of a grid cell.
 */
function LeadService({ service }: { service: PageService }) {
  return (
    // mt-auto: the heading holds the top of the page and the lead plate holds
    // the foot, with the air between them doing the work. Stacked together
    // under the heading they left a third of the page trailing off.
    <div data-ink className="border-t border-white/12 pt-[1.5em]">
      <div className="flex items-start gap-[1.3em]">
        {service.emblem ? (
          <Emblem
            name={service.emblem}
            className="w-[clamp(70px,8.8vw,126px)] shrink-0 text-slate-200"
          />
        ) : null}
        <div className="pt-[0.2em]">
          <p className="mb-[0.55em] text-[clamp(0.5rem,0.805vw,0.707rem)] tracking-[0.34em] text-slate-300/80">
            PLATE {roman(1)}
          </p>
          <p className="font-[family-name:var(--font-display)] text-[clamp(1.1rem,2.012vw,1.824rem)] leading-tight font-light text-white">
            {service.title}
          </p>
          <p className="mt-[0.5em] max-w-[30ch] text-[clamp(0.7rem,1.104vw,1.003rem)] leading-relaxed text-slate-300/75">
            {service.body}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Is this run of entries illustrated with photographs rather than line cuts?
 *
 * Asked of the whole run, not of each entry, because the answer decides the
 * SETTING: photographs get a full-measure row each, engravings get the two-up
 * modular grid. Mixing the two down one page would be two catalogues stacked.
 */
function isIllustrated(services: PageService[] | undefined) {
  return Boolean(services?.some((service) => service.image));
}

/**
 * Does this run set as a PROCESS SPREAD -- six ruled rows, three to a page,
 * every one of them printed -- rather than as a catalogue?
 *
 * Asked of the run and not of each entry, like the other three and for the
 * same reason: the answer is the setting for the whole chapter.
 *
 * It has to be asked FIRST, because a stage carries `image` as well and
 * isIllustrated would claim it. That is not an ordering accident to be tidied
 * away later -- the two questions are genuinely both true of the data, and the
 * one that wins decides the layout. The catalogue would cut six stages three
 * to a page as 42% thumbnails beside sentences, alternating sides; the process
 * spread sets them as six rows on ONE set of lines across the gutter, which is
 * what a reader compares in and what an alternating catalogue is not.
 */
function isPlateSection(services: PageService[] | undefined) {
  return Boolean(services?.some((service) => service.stage));
}

/** Is any half of this spread set as a plate section? */
function spreadIsPlates(page: BookPage | BookSpread) {
  return isPlateSection(page.facing?.services) || isPlateSection(page.services);
}

/**
 * THE PROCESS SPREAD: six stages, all six printed, three to a page.
 *
 * WHY THIS IS NOT A WINDOW, WHICH IS WHAT IT WAS
 *
 * 03 spent one revision as an index on the verso driving a single plate on the
 * recto -- 04's and 05's construction -- and the argument for it was that six
 * stages a page apart are six page turns to compare two of them. That is true
 * and it was the wrong fix, because it bought comparison by hiding five of the
 * six: a reader who never clicked learned that the studio has a process and
 * nothing whatever about it. A procedure is the one chapter in this book that
 * a client reads to find out what they are BUYING, and it cannot be behind a
 * gesture.
 *
 * The spread is what solves both at once. Six rows across two facing pages are
 * comparable at a glance -- which is the whole reason a book has spreads and a
 * scrolling page does not -- and nothing is hidden. It costs the plate its
 * size, and that cost is real: see the note on the plate below.
 *
 * WHY THE TWO PAGES SHARE ONE GRID TEMPLATE
 *
 * Both halves are `minmax(0,1.2fr)` for a head and then one equal row per
 * stage, so stage 01 sits on exactly the line stage 04 does and the six rules
 * run straight across the gutter. That is <ServiceEntries>'s device and it is
 * here for the same reason: rules that nearly line up read as a mistake, and
 * the reader is being invited to compare rows, which they can only do if the
 * rows are on lines.
 *
 * It is what decides where the arc goes. The verso spends its head slot on the
 * chapter opening; the recto has to spend a slot of the same height on
 * something or its three rows ride up and nothing aligns. So the arc -- the
 * brief's IDEAS -> STRATEGY -> PRODUCT -> GROWTH -- is set THERE, hung off the
 * bottom of the slot where it reads as a running head over the second half,
 * rather than at the foot of the page where the brief put it. Moving it down
 * costs the alignment of all six rows; it is one `justify-end` away if that
 * trade is ever judged the wrong way round.
 *
 * The row count is derived from the run, not written: seven stages set as four
 * and three, and both grids take four rows so the recto's last slot is simply
 * blank -- which is what a book does rather than respacing one page against
 * the other.
 */
/** One stage and its number in the run. */
type StageSlot = {
  service: PageService;
  index: number;
};

/**
 * The run split across the gutter, and split DIFFERENTLY on a spread.
 *
 * Below `lg` it is halves -- three and three -- because a phone prints each
 * page on its own sheet and the two pages carry equal loads.
 *
 * On a spread the verso keeps ONE FEWER, so six set as two and four. The
 * verso's first slot is the chapter opening, which is about a stage row tall;
 * the recto's is only the arc. Three and three put head + 3 rows against
 * arc + 3 rows, which is why the recto carried a note for several revisions:
 * something had to fill a 201px slot the recto did not need. Taking the note
 * off and moving stage 03 (Design) across is the same total ink on two pages
 * that now each fill themselves, and the verso's two rows get the air the
 * chapter head used to squeeze out of three.
 *
 * The split follows the SHEET MODE (SingleSheetContext), not a breakpoint.
 * The crossing stage used to be printed on both pages with each copy hidden
 * at the other side of `lg`, which kept a duplicate of it in the DOM and was
 * wrong on a portrait tablet: 1024x1366 is `lg` wide and prints one page per
 * sheet, so it got the spread's 2/4 on single pages.
 *
 * Derived, so a seventh stage rebalances: four and three one to a sheet,
 * three and four on a spread.
 */
function stageHalves(services: PageService[] | undefined, single: boolean) {
  const entries = services?.filter((service) => service.stage) ?? [];
  const half = Math.ceil(entries.length / 2);
  const cut = single ? half : Math.max(1, half - 1);
  const slot = (service: PageService, index: number): StageSlot => ({
    service,
    index,
  });
  const verso = entries.slice(0, cut).map((service, k) => slot(service, k));
  const recto = entries.slice(cut).map((service, k) => slot(service, cut + k));
  return {
    verso,
    recto,
    versoRows: verso.length,
    rectoRows: recto.length,
  };
}

/**
 * One stage, set as an editorial ROW and deliberately not as a card.
 *
 * A card is a bounded object with its own background and its own border, and
 * six of them are six things on a page. A row is the page's own measure with a
 * rule over it -- the way a book sets a numbered entry -- and six of those are
 * one list. That distinction is the whole of what keeps this spread from
 * reading as a grid of tiles, and it is why nothing here has a background, a
 * radius or a shadow: the rule and the alignment do all the separating.
 *
 * THE ORDER OF THE PARTS
 *
 * A client reads a stage asking three questions in a fixed sequence -- what is
 * this, what happens in it, what do I end up with -- so the row answers them in
 * that order and stops. The numeral and the name say where in the six you are;
 * the plate and the headline say what the stage is; the run of phrases is the
 * work; and the two ruled rows at the foot are the two halves of the answer to
 * the third, which is the one that decides whether a stage was worth paying
 * for. It is the order the window this replaced used, kept, because the
 * questions did not change when the setting did -- and it is 04's order too,
 * which is deliberate: a reader crossing from one chapter to the other should
 * not have to learn a second way of reading an entry.
 *
 * WHAT THE PLATE COSTS HERE, AND IT IS NOT NOTHING
 *
 * These six photographs are MADE of small type -- a notebook of interview
 * notes, a strategy blueprint, a wireframe sheet, an architecture diagram, a
 * deployment pipeline, an analytics dashboard -- and the reason to print them
 * rather than an emblem is that a client can look at one and see the actual
 * artefact. At the full measure of a recto that works. At 34% of a half-page
 * column, which is 186px at 1440, it does not: the type inside is texture.
 *
 * That is the price of printing all six, and it is the right price to pay,
 * because a picture a reader cannot decode is worth less than a stage a reader
 * never opens. It is written down rather than hidden so that nobody
 * rediscovers it as a bug. 34% and not less: below about 30% the plate stops
 * reading as a photograph at all and starts reading as an icon, which would
 * put an engraving's job on a picture that is not one.
 */
function StageRow({ service, index }: StageSlot) {
  const stage = service.stage!;
  const number = roman(index + 1);
  return (
    // A GRID of three rows, and the PLATE SPANS THE LOWER TWO -- at every
    // size, which is the whole of what stops this spread reading as congested.
    //
    // It did not, for one revision. The plate sat beside the headline with the
    // deliverable rules running the full measure UNDER both, which is how
    // every other ruled entry in this book is set. On a page carrying one or
    // two entries that is right. On a page carrying three it is not, because
    // the plate's height then ADDS to the row instead of sharing it: at
    // 1440x900 the row had 181px and needed 180 of them, so there was no space
    // anywhere -- rules sat directly on type, and six rows of that read as a
    // table rather than as a chapter.
    //
    // Spanning, the plate is beside the whole entry and the tallest thing in
    // the row is the copy, not the picture. The same row now needs 166 of its
    // 181 and the 15 left over fall between one stage's outcome and the next
    // stage's rule, which is where a book puts them.
    //
    // Line numbers rather than named areas: `grid-template-areas` through an
    // arbitrary variant is one string that has to be got right twice, and
    // row-start/row-span are utilities that certainly generate.
    <article
      data-ink
      className={`grid grid-cols-[auto_minmax(0,1fr)] content-start gap-x-[clamp(0.6em,calc(1.3*var(--page-vw)),1em)] gap-y-[0.3em] border-t border-white/12 pt-[0.55em] lg:gap-y-[var(--stage-gap,0.6em)] lg:pt-[var(--stage-pt,1em)]`}
    >
      {/* The stage's own line: numeral and name at the leading edge, the plate
          number opposite. The plate number is set right because it belongs to
          the PICTURE and not to the stage -- the numeral has already numbered
          the stage, and printing IV beside 04 is one fact at two sizes. */}
      <div className="col-span-2 row-start-1 flex items-baseline justify-between gap-[0.8em] lg:col-span-1 lg:col-start-2">
        <h3 className="flex min-w-0 items-baseline gap-[0.6em]">
          <span
            aria-hidden
            className="shrink-0 font-[family-name:var(--font-display)] text-[length:clamp(0.72rem,calc(1.254*var(--page-vw)),1.176rem)] leading-none font-light text-[#dce7f7]/80 tabular-nums"
          >
            {number}
          </span>
          <span className="truncate text-[length:clamp(0.52rem,calc(0.885*var(--page-vw)),0.784rem)] tracking-[0.28em] text-white uppercase">
            {service.title}
          </span>
        </h3>
        <p className="shrink-0 text-[length:clamp(0.44rem,calc(0.717*var(--page-vw)),0.638rem)] tracking-[0.26em] text-slate-300/80">
          PLATE {stage.figure}
        </p>
      </div>

      <img
        src={service.image!.src}
        alt={service.image!.alt}
        // The first two are on screen the moment the spread lands; the rest
        // are a scroll away and can wait.
        loading={index < 2 ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        // A FIXED width, where every other plate in this book is a percentage
        // of its column, and a height taken from the ROW rather than from the
        // file's ratio.
        //
        // Fixed width, because the recto is 434px wide against the verso's 562
        // -- the thumb index is reserved out of the right-hand page and nothing
        // out of the left -- so a percentage printed stage 01 half as large
        // again as stage 04 across the gutter from it. Six plates a reader is
        // invited to compare have to be one size.
        //
        // The FILE's own 16:9 on a spread, and the row's height below `lg`.
        //
        // 16:9 and not the 4:3 this printed for one revision. The squarer box
        // was 31% more picture for the same width, and it cost 25px of every
        // row -- which is 25px the page did not have to give. Cropping the
        // page's air away to enlarge a plate that is a texture at either size
        // is the wrong way round, and 16:9 is also the ratio the six were cut
        // to, so nothing is thrown away.
        //
        // Below `lg` it spans the deliverable rows and takes its height from
        // them (`h-full`), where it costs the row nothing: 52px of picture
        // against 53px of copy. Spanning does not work on a spread -- it puts
        // the deliverable table in the narrow column, the outcome wraps to a
        // third and fourth line, and the six plates come out four different
        // heights, which is the one thing they may not be.
        style={{ aspectRatio: service.image!.ratio }}
        className="col-start-1 row-span-2 row-start-2 h-full w-[70px] self-stretch object-cover object-center opacity-90 transition-opacity duration-300 ease-out select-none hover:opacity-100 lg:row-span-2 lg:row-start-1 lg:h-auto lg:w-[clamp(80px,calc(7*var(--page-vw)),108px)] lg:self-start motion-reduce:transition-none"
      />

      <div className="col-start-2 row-start-2 flex min-w-0 flex-col lg:contents">
        <h4 className="shrink-0 font-[family-name:var(--font-display)] text-[length:clamp(0.8rem,calc(1.434*var(--page-vw)),1.299rem)] leading-tight font-light lg:col-start-2 lg:row-start-2 lg:leading-snug text-balance text-[#dce7f7]">
          {stage.headline}
        </h4>
        {/* What happens here -- the brief's KEY ACTIVITIES. A `ul` because it
            is a list and a screen reader should say so, set as one wrapped run
            rather than as bullets: five items down a column is five rules and
            120px of a page that also has to carry two more stages. The
            separators are drawn, not typed, so nothing announces "middle dot"
            four times.

            mt-auto so the run sits on the foot of its column and the six land
            on one line down the spread.

            Dropped below `lg`, and it is the last thing that goes: what a
            stage PRODUCES survives it, because the deliverable and the outcome
            are the two lines a client is deciding on. */}
        <ul className="mt-auto hidden shrink-0 flex-wrap items-baseline gap-x-[0.6em] gap-y-[0.15em] pt-[0.5em] lg:col-span-2 lg:col-start-1 lg:row-start-3 lg:mt-0 lg:pt-[0.1em] text-[length:clamp(0.53rem,calc(0.885*var(--page-vw)),0.818rem)] leading-relaxed text-slate-300/60 lg:flex">
          {stage.work.map((item, k) => (
            <li key={item} className="flex items-baseline gap-[0.55em]">
              {k > 0 ? (
                <span aria-hidden className="text-slate-400/30">
                  &middot;
                </span>
              ) : null}
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* What the client is handed, and what is true afterwards. ONE rule over
          the pair, where there were two -- a rule under the deliverable as
          well made three rules in every row and eighteen down the spread,
          which is most of what made it read as a grid. The two lines still sit
          on the same baselines from stage to stage, because the grid puts them
          there and not the ruling. */}
      <dl className="col-start-2 row-start-3 grid grid-cols-[auto_1fr] gap-x-[1em] gap-y-[0.15em] border-t border-white/18 pt-[0.4em] lg:col-span-2 lg:col-start-1 lg:row-start-4 lg:gap-y-[var(--stage-dl-gap,0.5em)] lg:pt-[var(--stage-dl-pt,0.75em)]">
        <dt className="text-[length:clamp(0.44rem,calc(0.717*var(--page-vw)),0.638rem)] tracking-[0.24em] text-slate-200/90">
          DELIVERABLE
        </dt>
        <dd className="text-[length:clamp(0.62rem,calc(1.064*var(--page-vw)),0.986rem)] leading-tight text-white lg:leading-snug">
          {stage.deliverable}
        </dd>
        <dt className="text-[length:clamp(0.44rem,calc(0.717*var(--page-vw)),0.638rem)] tracking-[0.24em] text-slate-200/90">
          OUTCOME
        </dt>
        <dd className="text-[length:clamp(0.58rem,calc(0.963*var(--page-vw)),0.885rem)] leading-snug text-slate-300/75 lg:leading-normal">
          {stage.outcome}
        </dd>
      </dl>
    </article>
  );
}

/**
 * The book's one chevron, drawn at the weight of a rule rather than of type.
 * 05's idea flow and 07's timeline use it. It was drawn for 03's arc, which
 * was removed; a book that invents a second arrowhead stops reading as one book.
 */
function ArcArrow() {
  return (
    <svg
      viewBox="0 0 12 8"
      aria-hidden
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="square"
      className="h-[0.6em] w-[0.75em] shrink-0 text-slate-300/80"
    >
      <path d="M7.5 1.2 10.6 4 7.5 6.8" />
    </svg>
  );
}

/**
 * The space between the lines of a stage, as ONE unit scaled by the viewport's
 * HEIGHT, from which each gap is a fixed fraction.
 *
 * Height and not em alone, because the two sides of a stage do not scale
 * together: the type is sized in vw and the slot it sits in is a share of the
 * page, which is sized in vh. So a laptop that is wider for its height -- 16:9
 * against 1440x900's 16:10 -- carries the same type in a shorter slot. Four
 * stages on the recto, measured: at 1440x900 a slot is 178px and a stage
 * needs 100 before its spacing; at 1366x768 and 1024x768 the slot is 150 and
 * the stage still needs 99-107 (a narrower recto wraps its activity run). At
 * a fixed 1em every recto row overflowed at 768 tall by 14-21px, printing
 * each outcome into the next stage's plate.
 *
 * `min(7vh - 47px, 2.4vw - 18.6px)`: 16px at 1440x900, 13.5 at 1536x864,
 * 9 at 1280x800, ~6 at 768 tall and at 1024 wide, and at most 1.15em. The
 * width term is for 1024x768, whose recto is 232px wide and wraps three of
 * four outcomes. Measured min air between recto rows with the arc gone:
 * 1440x900 22, 1536x864 16, 1280x800 20, 1024x768 18. A steeper
 * `14.4vh - 116px` was needed while the arc took ~35px of the recto; without
 * it that curve bottomed out at 1280x800 with 5.6px inside each stage and
 * 36px between them, which is the congestion in the wrong place.
 *
 * The verso's unit is larger for the reason given on `roomy`: 30px at 900
 * and 22 at 768. It falls more gently than the recto's because the verso has
 * slack at every size -- two stages to the recto's four -- and what it does
 * not spend inside a row lands as a gap between rows: 96px at 1024x768 on a
 * steeper curve, which read as the page running out again.
 */
function stageSpacing(roomy: boolean) {
  const u = roomy
    ? "clamp(1.2em, 6vh - 24px, 1.9em)"
    : "clamp(0.35em, min(7vh - 47px, 2.4vw - 18.6px), 1.15em)";
  const [gap, dlPt, dlGap] = roomy ? [0.68, 0.58, 0.42] : [0.6, 0.75, 0.5];
  return {
    "--stage-pt": u,
    "--stage-gap": `calc(${u} * ${gap})`,
    "--stage-dl-pt": `calc(${u} * ${dlPt})`,
    "--stage-dl-gap": `calc(${u} * ${dlGap})`,
  };
}

/**
 * One page of the process spread: a head slot, then one stage per row.
 *
 * Both halves render through here and differ only in what they hand to `head`
 * and which slice of the run they print, which is what guarantees the two
 * grids agree. `rows` is passed in rather than taken from `services.length`
 * for exactly that reason: an odd run gives the recto one row fewer, and a
 * recto that sized itself to its own count would put its rows on different
 * lines from the verso's.
 */
function StageRun({
  slots,
  rows,
  head,
  roomy = false,
}: {
  slots: StageSlot[];
  rows: number;
  head?: React.ReactNode;
  /**
   * The verso, which since stage 03 moved across prints two stages in the
   * height the recto gives four. Set to the recto's spacing, each of its rows
   * held ~105px of blank under its outcome at 1440x900: the content sat at the
   * top of a slot twice its size and read as the page running out.
   *
   * So the verso's rows open up INSIDE -- about 45px more between the lines of
   * a stage at 1440x900 -- and the rows STACK from the head down
   * (`content-start`), with what is left at the foot. It was shared out
   * between the rows like the recto's for one revision, which put Strategize
   * hard against the drop folio with ~100px over it, and was asked to come
   * back up under Discover. The gap between the rows opens to ~29px at 900
   * tall instead, because stacked at the recto's 4px gap Discover's outcome
   * sat 14px over Strategize's rule. lg-only, like the template.
   */
  roomy?: boolean;
}) {
  if (!slots.length) return null;
  return (
    <div
      // A hook for tools/scroll-shots.mjs. Every fit on this spread is a
      // measurement -- the slots overflow silently, since minmax(0,1fr) lets
      // them -- and a probe that has to guess which div is the grid measures
      // the wrong thing. Named `process-run`, not `stage-run`: layoutSheets
      // owns [data-stage] and near-misses on that selector have cost a day.
      data-process-run
      // Reserving the drop folio, which on this spread BOTH pages have to.
      //
      // VersoPage and PageBody print it absolutely at 7% of the page HEIGHT
      // while their own bottom padding is a percentage of its WIDTH -- 8% of
      // ~725 is 58px against a folio whose top edge is 73px up. Every page
      // that stops short of its own padding never sees the 15px they overlap
      // by; this one fills its page to the last pixel by construction, and
      // stage 03's outcome printed straight through "03 - APPROACH".
      //
      // In vh because the folio is placed in vh: a percentage here would
      // resolve against the width and miss it. lg-only, because below lg the
      // spread has collapsed onto one sheet with no drop folio on it.
      // The equal-slot template is lg-ONLY, and that is a correctness fix
      // rather than a refinement. Below lg the spread collapses onto one
      // full-bleed sheet and BOTH grids render into the same column -- the
      // facing copy above, this page's own below. With `h-full flex-1` on
      // each, the first one took the entire column and the second was handed
      // zero height: stages 04, 05 and 06 were in the DOM at 0px. Auto rows
      // down there, so the two grids stack at their content height.
      className={`grid gap-y-[clamp(0.25em,0.5vh,1em)] [grid-template-rows:none] lg:h-full lg:min-h-0 lg:flex-1 ${roomy ? "lg:content-start lg:gap-y-[clamp(0.9em,3.2vh,2em)]" : "lg:content-between"} lg:[grid-template-rows:var(--stage-rows)]`}
      style={
        {
          ...stageSpacing(roomy),
          // Every track is `auto` and `content-between` shares out what is
          // left, so the spare falls BETWEEN rows, equally, instead of under
          // each one. It was a shared 1.11fr head and equal 1fr rows while
          // both pages carried three and their rules had to line up; at two
          // against four they cannot. Equal slots also wasted the recto: at
          // 1280x800 Engineer wraps its activity run and Design its outcome,
          // and an equal slot printed Engineer 18px into Launch while the
          // shorter rows beside it had room to spare. Sized to content, the
          // four fit with the spare shared out.
          //
          // `auto` rows end flush with the run, where a 1fr slot left a few px
          // under its outcome, so the run's bottom padding is the larger one:
          // it is what keeps the last line off the drop folio.
          //
          // `rows` is the number of stages this page prints, which
          // stageHalves() decides per sheet mode.
          "--stage-rows": `${head ? "auto " : ""}repeat(${rows}, auto)`,
        } as React.CSSProperties
      }
    >
      {head}
      {slots.map((slot) => (
        <StageRow key={slot.service.title} {...slot} />
      ))}
    </div>
  );
}

/**
 * Is this run a set of PERSPECTIVES -- opinions the reader picks between --
 * rather than a catalogue, a register or a plate section?
 *
 * Asked of the run like the other three, and asked before the engraved
 * fallback, which is where a chapter with no photographs and no ledgers would
 * otherwise land. 05 is still that chapter; what changed is that its entries
 * now hold a view, and a view wants a window rather than a grid cell.
 */
function isPerspective(services: PageService[] | undefined) {
  return Boolean(services?.some((service) => service.perspective));
}

/**
 * A STRUCK plate: the chapter's artwork, painted in the page's own silver.
 *
 * The file is a greyscale NEGATIVE, not a picture -- see
 * tools/build-perspective-plates.sh. The element carries the ink as its
 * background and the file as a CSS mask, so what lands on the paper is the
 * drawing and the photograph of the page shows through everywhere else. That
 * is the same mechanism <EngravedPlate> uses for the two antique figures, and
 * it is why this chapter needed no toning script: there is no ground to sit
 * wrongly against the paper, because there is no ground.
 *
 * `role="img"` with a name, because a masked div is a picture to look at and
 * nothing in the DOM says so. It is inside the panel it belongs to, so the
 * five that are not showing leave the accessibility tree with their panel.
 */
function StruckPlate({
  plate,
  className = "",
  fill = false,
}: {
  plate: PageMask;
  className?: string;
  // Take the box's height from the layout instead of from the plate's ratio,
  // and cover it -- the artwork is cropped at the sides rather than
  // letterboxed inside a box taller than it is.
  fill?: boolean;
}) {
  const size = fill ? "cover" : "contain";
  return (
    <div
      role="img"
      aria-label={plate.alt}
      className={className}
      style={{
        aspectRatio: fill ? undefined : plate.ratio,
        backgroundColor: "#dce7f7",
        maskImage: `url("${plate.src}")`,
        WebkitMaskImage: `url("${plate.src}")`,
        // LUMINANCE, and this is the whole ball game. The mask files are
        // greyscale negatives with NO alpha channel, so under the default
        // `match-source` the browser reads their alpha -- which is opaque
        // everywhere -- and every plate paints as a solid silver rectangle.
        // Six of those on one spread is what the first render of this chapter
        // actually produced.
        maskMode: "luminance",
        maskSize: size,
        WebkitMaskSize: size,
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}

/**
 * The index of perspectives, printed on the verso.
 *
 * Six rows: a numeral, the domain, and one line saying what that domain is
 * for. **Nothing here is a control.** They were buttons driving a window on
 * the recto for two revisions; the window is gone and so are they, because a
 * row that changes something somewhere else is a row a reader has to operate
 * before the page will tell them anything. Everything this chapter has to say
 * is now printed on the spread at once.
 *
 * That also settles the 04/05 collapse this file has warned about through
 * three revisions. They are no longer the same kind of object: 04 is an index
 * driving a window, and this is a list.
 */
function PerspectiveIndex({ services }: { services: PageService[] }) {
  return (
    // The column is PORTRAIT-only: it is here so the six rows below can take
    // the page's height on a phone page, and a flex context on every viewport
    // is a change to the spread that nothing asked for.
    <div data-ink className="min-w-0 flex-1 portrait:flex portrait:flex-col">
      {/* The chapter's opening sentence used to be printed here, squeezed to
          the index's width; it is above the row now, at the page's measure.
          See the verso. */}
      <p className="text-[length:clamp(0.44rem,calc(0.66*var(--page-vw)),0.6rem)] tracking-[0.3em] text-slate-300/80 uppercase">
        What we think about
      </p>
      {/* Equal rows on a phone page, where this run IS the page: six domains
          at their content height left 179px of it blank at the foot. */}
      <ol className="mt-[0.7em] border-t border-white/18 portrait:grid portrait:min-h-0 portrait:flex-1 portrait:[grid-template-rows:repeat(var(--domain-rows),minmax(0,1fr))]"
        style={{ "--domain-rows": services.length } as React.CSSProperties}
      >
        {services.map((service, i) => {
          const number = roman(i + 1);
          return (
            <li
              key={service.title}
              className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-[clamp(0.6em,calc(1.1*var(--page-vw)),0.95em)] border-b border-white/10 py-[0.34em] portrait:min-h-0 portrait:content-center lg:py-[0.55em] [@media(min-aspect-ratio:17/10)_and_(max-height:880px)]:py-[0.4em] [@media(max-height:480px)]:py-[0.18em]"
            >
              <span
                aria-hidden
                className="font-[family-name:var(--font-display)] text-[length:clamp(0.8rem,calc(1.36*var(--page-vw)),1.3rem)] leading-none font-light text-slate-300/80 tabular-nums"
              >
                {number}
              </span>
              <span className="min-w-0">
                <span className="block text-[length:clamp(0.48rem,calc(0.74*var(--page-vw)),0.66rem)] tracking-[0.26em] text-white uppercase">
                  {service.title}
                </span>
                {service.perspective ? (
                  <span className="mt-[0.3em] block text-[length:clamp(0.6rem,calc(0.98*var(--page-vw)),0.88rem)] leading-snug text-slate-300/65 lg:leading-[1.9] [@media(min-aspect-ratio:17/10)_and_(max-height:880px)]:leading-snug">
                    {service.perspective.summary}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * The chapter's artwork, struck down the outer margin of the verso.
 *
 * The last of seven crops still printed. The other six were one per
 * perspective, shown one at a time in a window; with the window gone, six
 * pictures on one spread would be six things competing with the argument
 * opposite, which is the one thing this chapter is now for. This one stays
 * because every other chapter carries a picture and a chapter with none would
 * be the only one -- and because at 166px in a margin it is a mark, not an
 * illustration. tools/build-perspective-plates.sh has the six in a retired
 * block if they are ever wanted back.
 *
 * Hidden below `lg`, where the spread collapses onto one sheet and a
 * decorative column would be the third thing competing for a width that has
 * none.
 */
function PerspectiveColumn({ plate }: { plate: PageMask }) {
  return (
    <StruckPlate
      plate={plate}
      // FULL HEIGHT of the index beside it -- the intro through perspective 06
      // -- where at its own 520:941 ratio it was 250px tall and stopped level
      // with row 01, leaving 300px of empty margin beside rows 02-06. The row
      // stretches it (`self-stretch`) and the mask covers the box, so the
      // artwork is cropped at the sides; the dial and the plotted grid are its
      // middle and survive the crop.
      fill
      // Narrower than it was, and the width came off the PLATE rather than off
      // the type. At 166px the index had 374px of measure and two of the six
      // summaries wrapped to a second line at the larger sizes -- 38px of a
      // page that has none. At 138 the widest of them sets on one line.
      // Widened by growing OUTWARD, into the verso's gutter-side margin, and
      // then pushed further out still: the negative right margin (48px at
      // 1440) is larger than the width it added (32px), which hands the index
      // 16px. It needed them. "Future insights" is 367px set solid and its
      // column was 360 in a browser with a scrollbar, so it wrapped and its
      // rule printed through the drop folio at 820. It sets on one line now
      // at 1280 and up; below that two rows wrap, as they always did, and the
      // page has 36px to spare there.
      className="hidden w-[clamp(88px,11.7vw,170px)] shrink-0 self-stretch lg:block lg:-mr-[clamp(0px,3.3vw,48px)]"
    />
  );
}

/**
 * IDEA -> INSIGHT -> DECISION -> PRODUCT, drawn as a drafting diagram.
 *
 * One continuous rule with a tick dropped at each stage, which is how a
 * measured drawing marks a station -- not four boxes joined by arrows, which
 * is how a slide does it. The chevron at the end is the only thing saying
 * which way it is read, and it is the same one 03's arc uses, because a book
 * that invents a second arrowhead has stopped being one book.
 *
 * The QUESTION under each label is doing the work. Four nouns in a row is
 * decoration; the same four with the question each one answers is the whole
 * argument of the chapter in a single line, which is what the brief means by
 * this being a primary element rather than an ornament.
 */
function IdeaFlow({
  title,
  flow,
}: {
  title: string;
  flow: { label: string; note: string }[];
}) {
  return (
    <section data-ink className="shrink-0">
      <h4 className="text-[length:clamp(0.44rem,calc(0.66*var(--page-vw)),0.6rem)] tracking-[0.3em] text-slate-300/80 uppercase">
        {title}
      </h4>
      <div aria-hidden className="mt-[1.1em] flex items-center gap-[0.35em] lg:mt-[1.3em]">
        <span className="h-px flex-1 bg-white/22" />
        <ArcArrow />
      </div>
      <ol className="grid grid-cols-4 gap-x-[clamp(0.35em,calc(0.8*var(--page-vw)),0.7em)]">
        {flow.map((node) => (
          <li key={node.label} className="relative pt-[0.85em]">
            {/* The station mark, hanging up into the rule above. */}
            <span
              aria-hidden
              className="absolute top-[-1px] left-0 block h-[9px] w-px bg-white/45"
            />
            <p className="text-[length:clamp(0.5rem,calc(0.78*var(--page-vw)),0.7rem)] tracking-[0.22em] text-white uppercase">
              {node.label}
            </p>
            <p className="mt-[0.4em] text-[length:clamp(0.56rem,calc(0.9*var(--page-vw)),0.8rem)] leading-snug text-slate-300/65 lg:leading-[2.7] [@media(min-aspect-ratio:17/10)_and_(max-height:880px)]:leading-[1.7]">
              {node.note}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * What a client gets out of the thinking, as three ruled rows.
 *
 * Rows and not cards, for the reason every other list in this book is rows:
 * a card is a bounded object with its own ground, and three of them are three
 * things on a page. The rule and the alignment do all the separating, which is
 * also what keeps three benefits from outweighing the diagram above them.
 */
function Benefits({
  title,
  items,
}: {
  title: string;
  items: { number: string; title: string; body: string }[];
}) {
  return (
    <section data-ink className="shrink-0 portrait:flex portrait:min-h-0 portrait:shrink portrait:flex-1 portrait:flex-col">
      <h4 className="text-[length:clamp(0.44rem,calc(0.66*var(--page-vw)),0.6rem)] tracking-[0.3em] text-slate-300/80 uppercase">
        {title}
      </h4>
      {/* Equal rows in portrait: the call to action under this is hung off the
          foot, so anything this run does not use collects as one hole above
          it -- 208px at 393x851. */}
      <ul className="mt-[0.7em] border-t border-white/18 portrait:grid portrait:min-h-0 portrait:flex-1 portrait:[grid-template-rows:repeat(var(--benefit-rows),minmax(0,1fr))] lg:mt-[0.45em]"
        style={{ "--benefit-rows": items.length } as React.CSSProperties}
      >
        {items.map((item) => (
          <li
            key={item.number}
            className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-[clamp(0.6em,calc(1.1*var(--page-vw)),0.9em)] border-b border-white/10 py-[0.55em] portrait:min-h-0 portrait:content-center lg:py-[0.35em] [@media(max-height:480px)]:py-[0.25em]"
          >
            <span
              aria-hidden
              className="text-[length:clamp(0.42rem,calc(0.62*var(--page-vw)),0.56rem)] tracking-[0.24em] text-slate-300/80 tabular-nums"
            >
              {roman(item.number)}
            </span>
            <span className="min-w-0">
              <span className="block text-[length:clamp(0.56rem,calc(0.86*var(--page-vw)),0.78rem)] tracking-[0.2em] text-white uppercase">
                {item.title}
              </span>
              {/* Dropped below `lg`, on both phone orientations. The TITLES
                  stay at every size: three of them are still the answer to
                  "what do I get", where the sentence under each elaborates a
                  heading that is already printed. */}
              <span className="mt-[0.25em] hidden text-[length:clamp(0.54rem,calc(0.86*var(--page-vw)),0.78rem)] leading-snug text-slate-300/60 portrait:block lg:block lg:leading-[2.6] [@media(min-aspect-ratio:17/10)_and_(max-height:880px)]:leading-[1.6]">
                {item.body}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The way out, at the foot of the recto.
 *
 * This chapter had no call to action for three revisions, and the note said
 * why: a chapter that is a WINDOW has no closing page, and an ornament with a
 * way out under a page that is about to change is signing off something that
 * has not finished. Nothing on this spread changes any more, so the argument
 * has expired -- the page finishes where the reader finishes reading it, and
 * that is exactly where an action belongs.
 *
 * Both actions turn to a chapter that exists. That is not a detail: it is the
 * same rule that took "VIEW PROJECT" off 04 and "READ PERSPECTIVE" off this
 * chapter one revision ago. `data-nav-item` and `data-index` are what <Book>
 * binds, so these are the book's own navigation rather than a second kind of
 * link that happens to look like it.
 */
function PerspectiveCta({
  cta,
}: {
  cta: {
    headline: string;
    body: string;
    actions: { label: string; chapter: number }[];
  };
}) {
  return (
    <section
      data-ink
      className="mt-auto shrink-0 border-t border-white/18 pt-[0.9em] lg:pt-[0.6em]"
    >
      <h3 className="font-[family-name:var(--font-display)] text-[length:clamp(0.92rem,calc(1.55*var(--page-vw)),1.45rem)] leading-tight font-light text-balance text-white">
        {cta.headline}
      </h3>
      <div className="mt-[0.8em] flex flex-wrap items-center gap-x-[1.6em] gap-y-[0.5em]">
        {cta.actions.map((action, i) => (
          <button
            key={action.label}
            type="button"
            data-nav-item
            data-index={action.chapter}
            className={`group flex w-fit cursor-pointer items-center gap-[0.6em] border-b pb-[0.28em] text-[length:clamp(0.48rem,calc(0.76*var(--page-vw)),0.68rem)] tracking-[0.26em] uppercase transition-colors duration-200 outline-none focus-visible:border-white focus-visible:text-white motion-reduce:transition-none ${
              // The first action is the one the chapter is asking for, so it
              // is the one set in the page's ink. The second is a way to keep
              // reading rather than a second request, and is ruled quieter.
              i === 0
                ? "border-white/45 text-white hover:border-white hover:text-white"
                : "border-white/20 text-slate-300/75 hover:border-white/50 hover:text-slate-100"
            }`}
          >
            {action.label}
            <span
              aria-hidden
              className="transition-transform duration-200 group-hover:translate-x-[0.25em] motion-reduce:transition-none"
            >
              &rarr;
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * The recto of the perspectives spread: why the thinking matters.
 *
 * Read top to bottom in a fixed order, and the order is the client's own
 * questions in the sequence they ask them -- what is this, why does it matter,
 * what shape does it take, what do I get, how do I start. The diagram sits in
 * the middle because it is the answer to the third and the setup for the
 * fourth; the call to action is hung off the foot with `mt-auto` so it lands
 * where the reader stops rather than wherever the copy above happens to end.
 */
function RationalePage({
  rationale,
}: {
  rationale: NonNullable<BookPage["rationale"]>;
}) {
  return (
    <div // The call to action hangs off the foot with mt-auto; PAGE_FOOT is what
      // keeps it off the drop folio.
      className="flex min-h-0 flex-col gap-[0.75em] portrait:flex-1 lg:flex-1 lg:gap-[clamp(0.8em,2.9vh,2.3em)] [@media(min-aspect-ratio:17/10)_and_(max-height:880px)]:gap-[0.9em] [@media(max-height:480px)]:pt-[6%]">
      <div data-ink className="shrink-0">
        {/* On a spread, "WHY IT MATTERS" sits on the verso's "05 PERSPECTIVES"
            line, asked for directly: the same device as 07's GET IN TOUCH --
            an invisible copy of <ChapterHead>'s headpiece, sized from the
            VERSO's measure, and a zero-width numeral lending the row its
            baseline. Set in the chapter label's own style so the two read as
            a pair across the gutter. Below `lg` a phone page stands alone and
            the old small label stays. */}
        <Ornament className="invisible mb-[0.9em] hidden w-[calc((100%+var(--page-text-inset-end,0px)+var(--page-index-inset,0px))*0.38)] lg:block" />
        <div className="flex items-baseline">
          <span
            aria-hidden
            className="invisible hidden w-0 font-[family-name:var(--font-display)] text-[length:clamp(2.2rem,calc(4.4*var(--page-vw)),4.4rem)] leading-[0.8] font-light lg:inline"
          >
            0
          </span>
          <p className="text-[length:clamp(0.44rem,calc(0.66*var(--page-vw)),0.6rem)] tracking-[0.34em] text-slate-300/80 uppercase lg:text-[length:clamp(0.6rem,calc(0.9*var(--page-vw)),0.76rem)] lg:leading-none lg:font-semibold lg:tracking-[0.4em] lg:text-[#c9d9ef]">
            {rationale.label}
          </p>
        </div>
        <h3 className="mt-[0.6em] font-[family-name:var(--font-display)] text-[length:clamp(1.05rem,calc(1.98*var(--page-vw)),1.85rem)] leading-[1.1] font-light text-balance text-white">
          {rationale.headline}
        </h3>
      </div>

      <IdeaFlow title={rationale.flowTitle} flow={rationale.flow} />
      <Benefits title={rationale.benefitsTitle} items={rationale.benefits} />
      <PerspectiveCta cta={rationale.cta} />
    </div>
  );
}

/**
 * Does this run set as the PROJECT STAGE -- one 16:9 plate that changes --
 * rather than as a catalogue of things offered?
 *
 * Asked of the run and not of each entry, like the other three and for the
 * same reason: the answer is the setting for the whole chapter.
 *
 * It has to be asked BEFORE isIllustrated, which is now the third setting to
 * need that. A project carries `image`, so the catalogue would claim it and
 * print four photographs at 42% of a text column, three to a page, down two
 * spreads -- which is precisely the layout this setting exists to replace. The
 * ordering is not tidiness deferred; both questions are genuinely true of the
 * data and the one asked first decides the page.
 */
function isProjects(services: PageService[] | undefined) {
  return Boolean(services?.some((service) => service.project));
}

/**
 * The index of projects, printed on the VERSO where the engraving used to be.
 *
 * WHY IT MOVED OFF THE RECTO
 *
 * It was a running head above the plate -- four tracked words, WEB AI SAAS
 * MOBILE -- and that is a tab strip's worth of information. A reader deciding
 * which of four studies to look at wants to know what each one IS, and the
 * only place those words existed was on the plate they had to choose first.
 * The verso was carrying an 1888 code table instead: a good engraving with
 * nothing to say about the four pictures opposite it.
 *
 * So the index takes the page, and it takes the room to name things: the
 * category as a label and the project's own title under it. That is a contents
 * list for the plates, which is what a half-title facing a stage should hold.
 *
 * WHY IT IS NOT 05'S INDEX, WHICH ALSO SITS ON A VERSO
 *
 * Because 05's rows are ONE line of tracked capitals -- a category and nothing
 * else -- and these are two, with a display line under each label. One is a
 * list of subjects; this is a table of contents with titles in it. The two
 * chapters are a spread apart and share a mechanism, and the whole reason to
 * spend the second line here is that a shared mechanism reads as a repeated
 * page unless the settings differ. The second line goes below 480px of
 * viewport height, where the page cannot afford it and the labels alone still
 * navigate.
 */
function ProjectIndex({ services }: { services: PageService[] }) {
  const entries = services.filter((service) => service.project);
  if (!entries.length) return null;
  return (
    <nav
      // Its own name. <BookIndex>, 03's contents list and 05's index are all
      // landmarks too, and four landmarks announced the same way go to four
      // different places.
      aria-label="Projects"
      data-ink
      // IT FILLS THE PAGE IN PORTRAIT, and that is the book's own device: a
      // run set as equal rows rather than a column with a gap, which is what
      // <ServiceEntries> says in its note -- "the gap version packed the
      // entries against the top and left a third of every page blank at the
      // foot". That is exactly what this page was: measured at 393x851 its
      // ink stopped at y=536 and 315px of it, 37%, was blank.
      className="mt-[1.6em] border-b border-white/12 portrait:flex portrait:min-h-0 portrait:flex-1 portrait:flex-col portrait:border-t portrait:border-b-0 lg:border-t lg:border-b-0"
    >
      {/* Two shapes, and the breakpoint is not decoration.
          At `lg` this is the verso of a spread with a page to itself: four
          ruled rows, each naming a category and setting the project's own
          title under it -- a contents list for the four plates opposite.
          Below `lg` the spread has collapsed onto ONE sheet and this list is
          sharing 844px with a 16:9 plate and its whole letterpress. Measured
          at 390x844: four two-line rows are 143px, and keeping them printed
          the metadata, the action and the colophon through each other at the
          foot. One row of short labels is 30px and navigates just as well --
          it is also exactly what the brief draws for mobile. */}
      {/* SAY THAT IT IS AN INDEX. Asked for: a reader moving the mouse down
          these four rows did not know the plate opposite was changing under
          it. The hint names the gesture for the input the reader has --
          pointing on a mouse, tapping on touch -- and every row lights with
          an accent bar under the pointer, the current one keeping it. */}
      <p className="mb-[0.8em] flex items-center gap-[0.6em] text-[clamp(0.46rem,0.7vw,0.62rem)] tracking-[0.26em] text-[#9dc0ee]/90 uppercase">
        <span aria-hidden className="h-px w-[1.6em] bg-[#9dc0ee]/60" />
        <span className="[@media(hover:none)]:hidden">
          Point at a project — the plate on the right changes
        </span>
        <span className="hidden [@media(hover:none)]:inline">
          Tap a project, then swipe through them on the next page
        </span>
      </p>
      {/* The rows' padding follows the viewport HEIGHT (capped at the old
          1.05em from ~1000px tall): the hint above cost the page ~25px, and
          at 1280x720, 1366x768 and 1440x768 the last row then ran 9-19px into
          the folio. */}
      <ul className="m-0 flex list-none flex-wrap items-baseline gap-x-[clamp(0.7em,3.2vw,1.4em)] gap-y-[0.5em] p-0 pb-[0.7em] portrait:grid portrait:min-h-0 portrait:flex-1 portrait:gap-0 portrait:pb-0 portrait:[grid-template-rows:repeat(var(--project-rows),minmax(0,1fr))] lg:block lg:gap-0 lg:pb-0"
        style={
          { "--project-rows": entries.length } as React.CSSProperties
        }
      >
        {entries.map((service, i) => (
          <li
            key={service.title}
            className="portrait:flex portrait:min-h-0 portrait:items-center portrait:border-b portrait:border-white/12 lg:border-b lg:border-white/12"
          >
            <button
              type="button"
              data-project={i}
              data-current={i === 0 ? "true" : "false"}
              aria-current={i === 0 ? "true" : undefined}
              // Below `lg` the current mark is an UNDERLINE on the button, not
              // the inline rule the spread uses, because the inline rule costs
              // width and there is none: measured at 390x844 the four items
              // needed 335px of a 284px column and MOBILE ran 51px past the
              // page. A border costs nothing and says the same thing. flex-wrap
              // on the list is the backstop for a narrower phone still.
              className="group relative flex cursor-pointer items-baseline gap-[0.5em] border-b-2 border-transparent pb-[0.3em] text-start text-slate-200/90 transition-colors duration-200 outline-none hover:text-white focus-visible:text-white lg:hover:bg-white/[0.04] lg:data-[current=true]:bg-white/[0.06] data-[current=true]:border-current data-[current=true]:text-slate-100 portrait:w-full portrait:gap-[0.9em] portrait:border-b-0 portrait:pb-0 lg:w-full lg:gap-[0.9em] lg:border-b-0 lg:py-[clamp(0.55em,calc(2.6vh-8px),1.05em)] motion-reduce:transition-none"
            >
              {/* The accent bar: in the margin just before the row, so the
                  row's text does not move when it lights. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-[22%] -start-[0.7em] hidden w-[2px] origin-center scale-y-0 bg-[#9dc0ee] transition-transform duration-200 group-hover:scale-y-100 group-data-[current=true]:scale-y-100 portrait:block lg:block motion-reduce:transition-none"
              />
              <span className="shrink-0 text-[clamp(0.44rem,0.69vw,0.627rem)] tracking-[0.24em] tabular-nums opacity-70">
                {roman(service.project!.number)}
              </span>

              {/* The short label, below `lg` only. WEB / AI / SAAS / MOBILE --
                  four words that fit one line at 390px. */}
              <span className="text-[clamp(0.52rem,2.76vw,0.752rem)] tracking-[0.22em] uppercase portrait:hidden lg:hidden">
                {service.project!.label}
              </span>

              {/* The named row, on the full spread only. */}
              <span className="hidden min-w-0 flex-1 portrait:block lg:block">
                <span className="block text-[clamp(0.54rem,0.86vw,0.75rem)] tracking-[0.26em] uppercase">
                  {service.project!.category}
                </span>
                <span className="mt-[0.4em] block font-[family-name:var(--font-display)] text-[clamp(0.92rem,1.45vw,1.34rem)] leading-[1.2] font-light text-balance text-slate-200/90 group-data-[current=true]:text-white">
                  {service.title}
                </span>
              </span>

              {/* The active mark: a rule that grows against the fore-edge.
                  <BookIndex>'s own device and 05's, so the book answers "which
                  one is this" the same way at every level. Focus is the same
                  rule at half length, so a keyboard reader sees where they are
                  before they commit. */}
              <span
                aria-hidden
                className="hidden h-px w-[0.6em] shrink-0 self-center bg-current opacity-40 transition-all duration-200 group-focus-visible:w-[1.4em] group-focus-visible:opacity-100 group-data-[current=true]:w-[2.2em] group-data-[current=true]:opacity-100 lg:block motion-reduce:transition-none"
              />
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * A compact index in the head of the stage, mirroring 03's <StageIndex>.
 *
 * WHY 04 HAS ONE WHEN ITS ARGUMENT FOR IT IS WEAKER THAN 03'S
 *
 * 03 needs its stage index because a spread carries TWO stages and nothing
 * else on either page says which of the two you asked for. 04's window shows
 * one project at a time, so there is no such ambiguity to resolve. What this
 * one does instead is give the head the same shape 03's has -- a name on the
 * left, a row of numbered notches on the right -- and a second place to change
 * the plate for a reader whose eye is already on the recto rather than back
 * across the gutter.
 *
 * ONE INSTANCE, NOT ONE PER PROJECT. The heads above are stacked four deep in
 * a single grid cell and three of them are transparent; an index inside each
 * would be sixteen buttons for four destinations, twelve of them in an
 * aria-hidden subtree. It sits outside the stack and <Book> keeps its mark in
 * step with everything else the index drives.
 *
 * Its landmark name is "Project index" and not "Projects", which is the verso
 * list's: two landmarks with one accessible name are announced identically
 * while going to the same four places by different routes, and the arrow-key
 * scoping in bindWindow keys off exactly that name to decide which copy of the
 * index focus should stay inside.
 *
 * Hidden below `lg`. There the spread has collapsed onto one sheet and the
 * verso's own index -- already compacted to a single row of short labels for
 * that viewport -- is a few inches up the same page. Two selectors for four
 * things on one phone screen is the repetition the verso index was rewritten
 * to remove.
 */
function ProjectHeadIndex({ entries }: { entries: PageService[] }) {
  return (
    <nav
      aria-label="Project index"
      className="hidden shrink-0 items-baseline gap-[clamp(0.5rem,1vw,0.9rem)] lg:flex"
    >
      {entries.map((service, i) => (
        <button
          key={service.title}
          type="button"
          data-project={i}
          data-current={i === 0 ? "true" : "false"}
          aria-current={i === 0 ? "true" : undefined}
          // The visible text is a numeral; the name is the numeral and the
          // category, so a screen reader is not offered "01 02 03 04".
          aria-label={`${service.project!.number} ${service.project!.category}`}
          className="group flex cursor-pointer flex-col items-center gap-[0.45em] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
        >
          <span className="text-[clamp(0.46rem,0.69vw,0.627rem)] tracking-[0.2em] text-slate-300/80 tabular-nums transition-colors duration-300 group-hover:text-slate-200 group-data-[current=true]:text-white motion-reduce:transition-none">
            {roman(service.project!.number)}
          </span>
          {/* The notch, cut deeper where you are. Driven by data-current
              rather than by a render-time flag, because the current project
              changes without React: <Book> sets the attribute. */}
          <span
            aria-hidden
            className="block h-px w-[10px] bg-white/20 transition-all duration-300 group-hover:w-[14px] group-hover:bg-white/45 group-data-[current=true]:w-[18px] group-data-[current=true]:bg-white/75 motion-reduce:transition-none"
          />
        </button>
      ))}
    </nav>
  );
}

/** The chapter whose entries are projects, i.e. 04 -- where the live plate is. */
const WORK_CHAPTER = BOOK_PAGES.findIndex((page) =>
  page.services?.some((service) => service.project),
);

/**
 * A LIVE SITE IN THE PLATE'S PLACE: calioon.com, running, inside the same
 * 16:9 window the other three studies print their plates in.
 *
 * - A browser bar: a pulsing LIVE badge, the address, a DESKTOP / PHONE
 *   toggle, reload, and "open in a new tab".
 * - The site is rendered at a real width and SCALED into the window --
 *   1280px for desktop, 390px for phone. Unscaled, a ~420px frame would only
 *   ever show the site's own mobile layout.
 * - No plate image (asked for: only the live site). Loading is a shimmer on
 *   the window's navy; if the frame has not loaded after 12s a link out is
 *   shown. `onError` never fires for a frame, so a timeout is the only signal.
 * - It loads when chapter 04 is OPEN (<Book> announces `book:chapter`), not
 *   on the cover: the sheets are all in the DOM from the first paint, so a
 *   plain `loading="lazy"` would still fetch it behind the hero.
 * - On touch screens it sits behind "Tap to use the live site" until tapped,
 *   because a live frame swallows every touch -- the phone carousel could
 *   not be swiped across it, nor the book scrolled.
 * - Sandboxed: scripts, forms and popups, but it cannot navigate this page.
 */
function LivePlate({
  live,
  image,
  index,
  className,
}: {
  live: NonNullable<PageService["project"]>["live"] & object;
  image: PageFigure;
  index: number;
  className: string;
}) {
  const [active, setActive] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [phone, setPhone] = useState(false);
  const [reload, setReload] = useState(0);
  const [coarse, setCoarse] = useState(false);
  const [armed, setArmed] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const viewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reduced motion reads the book as a plain column with no chapter events.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setActive(true);
    }
    setCoarse(window.matchMedia("(pointer: coarse)").matches);
    const onChapter = (event: Event) => {
      if ((event as CustomEvent<number>).detail === WORK_CHAPTER) setActive(true);
    };
    window.addEventListener("book:chapter", onChapter);
    return () => window.removeEventListener("book:chapter", onChapter);
  }, []);

  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      setBox({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!active || loaded) return;
    setFailed(false);
    const t = window.setTimeout(() => setFailed(true), 12000);
    return () => window.clearTimeout(t);
  }, [active, loaded, reload]);

  // The frame's own size and the scale that fits it into the window.
  const DESK_W = 1280;
  const PHONE_W = 390;
  const PHONE_H = 780;
  const scale = phone
    ? box.h > 0 ? box.h / PHONE_H : 1
    : box.w > 0 ? box.w / DESK_W : 1;
  const frameW = phone ? PHONE_W : DESK_W;
  const frameH = phone ? PHONE_H : box.h > 0 ? box.h / scale : 720;
  const left = phone ? Math.max(0, (box.w - PHONE_W * scale) / 2) : 0;

  const barButton =
    "grid size-[1.9em] place-items-center rounded-full text-slate-300/85 transition-colors duration-200 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-1 focus-visible:ring-[#9dc0ee] aria-pressed:bg-white/12 aria-pressed:text-white motion-reduce:transition-none";

  return (
    <div
      data-project-plate={index}
      data-current={index === 0 ? "true" : "false"}
      data-live-plate
      className={`flex flex-col bg-[#0b1728] ${className}`}
    >
      {/* The browser bar. */}
      <div className="flex h-[clamp(24px,2.3vw,32px)] shrink-0 items-center gap-[0.5em] border-b border-white/10 bg-[#0e1c31] px-[0.7em] text-[clamp(0.44rem,0.66vw,0.6rem)]">
        <span aria-hidden className="flex gap-[0.35em] max-sm:hidden">
          <span className="size-[0.55em] rounded-full bg-white/20" />
          <span className="size-[0.55em] rounded-full bg-white/20" />
          <span className="size-[0.55em] rounded-full bg-white/20" />
        </span>
        <span className="flex shrink-0 items-center gap-[0.45em] rounded-full bg-[#9dc0ee]/12 px-[0.65em] py-[0.2em] font-medium tracking-[0.22em] text-[#cfe0f7] uppercase">
          <span aria-hidden className="relative flex size-[0.6em]">
            <span className="absolute inset-0 rounded-full bg-[#6ee7a8] opacity-70 motion-safe:animate-ping" />
            <span className="relative size-full rounded-full bg-[#6ee7a8]" />
          </span>
          Live
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-[0.4em] truncate rounded-full bg-white/[0.06] px-[0.8em] py-[0.25em] tracking-[0.06em] text-slate-200/90">
          <svg aria-hidden viewBox="0 0 12 12" className="size-[0.9em] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.2">
            <rect x="2.5" y="5.5" width="7" height="5" rx="1" />
            <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" />
          </svg>
          {live.host}
        </span>
        <span role="group" aria-label="Preview width" className="flex shrink-0 items-center">
          <button type="button" aria-pressed={!phone} aria-label="Desktop view" onClick={() => setPhone(false)} className={barButton}>
            <svg aria-hidden viewBox="0 0 16 16" className="size-[1.1em]" fill="none" stroke="currentColor" strokeWidth="1.3">
              <rect x="1.5" y="2.5" width="13" height="8.5" rx="1" />
              <path d="M5.5 14h5M8 11v3" />
            </svg>
          </button>
          <button type="button" aria-pressed={phone} aria-label="Phone view" onClick={() => setPhone(true)} className={barButton}>
            <svg aria-hidden viewBox="0 0 16 16" className="size-[1.1em]" fill="none" stroke="currentColor" strokeWidth="1.3">
              <rect x="4.5" y="1.5" width="7" height="13" rx="1.4" />
              <path d="M7.2 12.3h1.6" />
            </svg>
          </button>
        </span>
        <button
          type="button"
          aria-label="Reload the live site"
          onClick={() => {
            setLoaded(false);
            setActive(true);
            setReload((n) => n + 1);
          }}
          className={barButton}
        >
          <svg aria-hidden viewBox="0 0 16 16" className="size-[1.05em]" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3" />
          </svg>
        </button>
        <a
          href={live.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${live.host} in a new tab`}
          className={barButton}
        >
          <svg aria-hidden viewBox="0 0 16 16" className="size-[1.05em]" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <path d="M9 2.5h4.5V7M13.5 2.5 7 9M11.5 9.5v4h-9v-9h4" />
          </svg>
        </a>
      </div>

      {/* The viewport. */}
      <div ref={viewRef} className="relative min-h-0 flex-1 overflow-hidden">
        {/* No picture behind it: asked for "only the live web, not the
            image". While it loads the window is the plate's own navy with a
            shimmer across it; if it never loads, a link out takes its place. */}
        {!loaded && !failed ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,transparent_30%,rgba(220,231,247,0.14)_50%,transparent_70%)] bg-[length:250%_100%] motion-safe:animate-[live-shimmer_1.6s_linear_infinite]"
          />
        ) : null}
        {active ? (
          <iframe
            key={`${reload}-${phone ? "p" : "d"}`}
            src={live.url}
            title={`${live.host} — the live site`}
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => {
              setLoaded(true);
              setFailed(false);
            }}
            className={`absolute top-0 origin-top-left border-0 bg-white transition-opacity duration-500 motion-reduce:transition-none ${loaded ? "opacity-100" : "opacity-0"} ${phone ? "rounded-[18px] ring-1 ring-white/25" : ""} ${coarse && !armed ? "pointer-events-none" : ""}`}
            style={{
              left,
              width: frameW,
              height: frameH,
              transform: `scale(${scale})`,
            }}
          />
        ) : null}
        {failed && !loaded ? (
          <a
            href={live.url}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute inset-0 m-auto h-fit w-fit rounded-full border border-white/20 bg-[#0b1728]/85 px-[0.9em] py-[0.4em] text-[clamp(0.44rem,0.62vw,0.56rem)] tracking-[0.22em] text-slate-100 uppercase"
          >
            Live preview unavailable · Open {live.host} ↗
          </a>
        ) : null}
        {coarse && !armed && loaded ? (
          <button
            type="button"
            onClick={() => setArmed(true)}
            className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-[0.5em] bg-gradient-to-t from-[#0b1728]/90 to-transparent pt-[2.5em] pb-[0.8em] text-[0.55rem] tracking-[0.24em] text-slate-100 uppercase"
          >
            Tap to use the live site
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The WORK stage: one 16:9 window, and the letterpress of whichever of the
 * four projects the index has chosen.
 *
 * WHY ONE WINDOW AND NOT FOUR ENTRIES
 *
 * Because the plate is the entry. These four are pictures of software -- a
 * dashboard, a workflow graph, an analytics screen, three phone screens -- and
 * everything that makes them worth printing is small: panel structure, table
 * rows, the direction a graph is read in. At the ~150px the register gave them
 * an interface is a texture. At the full measure of a recto it is an interface.
 *
 * Four of those down a page is also four times the height for one idea, which
 * is the thing the brief asked to avoid and the reason this chapter went from
 * two spreads to one.
 *
 * WHY THE PAGE IS SHAPED LIKE 03'S AND NOT LIKE A CARD
 *
 * Head, rule, label and plate number, plate, headline, sentence, the run of
 * work, and two ruled rows hung off the foot: that is 03's order,
 * part for part, and it is here because a reader arriving on either page is
 * asking the same three questions in the same sequence -- what is this, what
 * does it look like, and what would it involve.
 *
 * It also fills a page that was a third empty. With the plate at the very top
 * and nothing above it, the letterpress ran out around two thirds down and the
 * colophon sat alone at the foot with a hole between them. 03 does not have
 * that hole because its foot rows are hung there deliberately, and 04 now
 * hangs PLATFORM and the enquiry the same way.
 *
 * The risk this runs is the one CLAUDE.md names about 02 and 04: two chapters
 * a spread apart, set the same way, stop reading as two chapters. What keeps
 * them apart here is that 03 prints SIX stages at a glance and this prints ONE
 * project at a time -- six small ruled rows against a single 16:9 window; its
 * plate, its head, its label and its whole letterpress change under a click,
 * and 03's never do -- and that 03 spends four spreads on six stages where
 * this spends one on four studies.
 *
 * WHY EVERYTHING IS STACKED IN GRID CELLS AND ONLY ONE COPY IS OPAQUE
 *
 * The same reason the volvelle on 05 keeps all six panels: each stack shares
 * one grid cell, so every box is sized once from the first paint by its
 * tallest member and NOTHING below it moves when the plate changes. Rendering
 * only the current one would mean a decode on every click -- a blank frame in
 * the window, which is the one thing a window must never do -- and a head that
 * re-measured itself would shift the plate under the pointer.
 *
 * There are three stacks, not one: the head, the label row, and the
 * letterpress. They are separate because the WINDOW sits between them and has
 * to be a fixed 16:9 box of its own while the copy under it is sized by its
 * longest member.
 *
 * `opacity` is safe here and is not on a sheet: these are inside a face, which
 * its own clip has already flattened. See the note in CLAUDE.md.
 */
function ProjectStage({
  services,
  colophon,
}: {
  services: PageService[];
  colophon?: string;
}) {
  // One page per sheet: the plates become a SWIPE CAROUSEL (a track that
  // follows the finger, springs to the next or back, dots under it). On a
  // spread they stay stacked and crossfade under the index's hover.
  const single = useContext(SingleSheetContext);
  const entries = services.filter((service) => service.project);
  if (!entries.length) return null;
  // Every stacked copy carries this. data-project-panel is what <Book> drives:
  // it toggles data-current and takes the three that are not showing out of the
  // accessibility tree, so a screen reader is not read four projects on a page
  // that shows one.
  const stacked =
    "[grid-area:1/1] transition-opacity duration-300 ease-out data-[current=false]:pointer-events-none data-[current=false]:opacity-0 motion-reduce:transition-none";
  return (
    // flex-1 so the foot rows and the colophon have a page to drop to -- EXCEPT
    // below 480px of viewport height, where the foot of the page is not on
    // screen. At 844x390 the sheet measures 475px in a 390px window (it is
    // sized to the photographed page, which at that aspect is taller than the
    // screen) and hangs 45px off the bottom. Filling the page there would push
    // the line saying these are studies into the part nobody can see.
    <div className="flex min-h-0 flex-col lg:flex-1 [@media(max-height:480px)]:flex-none [@media(max-height:480px)]:pt-[4%]">
      {/* The head: the project's numeral, large, and its category beside it.
          Same construction as 03's rows use, one size down from the chapter
          opening, because this is a page inside a chapter. */}
      <div className="flex shrink-0 items-baseline justify-between gap-[0.9em]">
        <div className="grid min-w-0">
          {entries.map((service, i) => (
            <div
              key={service.title}
              data-project-panel={i}
              data-current={i === 0 ? "true" : "false"}
              aria-hidden={i === 0 ? undefined : "true"}
              className={`flex items-baseline gap-[0.6em] ${stacked}`}
            >
              <span
                aria-hidden
                className="font-[family-name:var(--font-display)] text-[clamp(1.7rem,3.91vw,3.648rem)] leading-[0.8] font-light text-[#dce7f7]/85 tabular-nums"
              >
                {roman(service.project!.number)}
              </span>
              <h3 className="font-[family-name:var(--font-display)] text-[clamp(1rem,1.955vw,1.767rem)] leading-none font-light text-white">
                {service.project!.category}
              </h3>
            </div>
          ))}
        </div>
        <ProjectHeadIndex entries={entries} />
      </div>

      {/* The status and the plate number, on one line against the rule that
          closes the head -- 03's label line, carrying the one thing this
          chapter cannot afford to set quietly. The status is on the LEFT,
          where 03 sets the stage's subject, because on this page it is the
          subject: what these four are is the first fact about them. The plate
          number is set right because it belongs to the picture below rather
          than to the project. */}
      <div className="mt-[0.5em] grid shrink-0 border-t border-white/18 pt-[0.55em]">
        {entries.map((service, i) => (
          <div
            key={service.title}
            data-project-panel={i}
            data-current={i === 0 ? "true" : "false"}
            aria-hidden={i === 0 ? undefined : "true"}
            className={`flex items-baseline justify-between gap-[1em] ${stacked}`}
          >
            <p className="text-[clamp(0.54rem,0.84vw,0.74rem)] tracking-[0.34em] text-slate-300/80 uppercase">
              {service.project!.status}
            </p>
            {/* Roman, like every other illustration in this book, and
                restarting at I for this chapter: 03's six are its own series.
                Arabic here would read as a pointer to a chapter number. */}
            <p className="shrink-0 text-[clamp(0.5rem,0.759vw,0.661rem)] tracking-[0.3em] text-slate-300/80">
              PLATE {roman(i + 1)}
            </p>
          </div>
        ))}
      </div>

      {/* The window. aspect-ratio reserves the box before a byte of image has
          landed, so nothing below it moves on load or on a swap. */}
      {/* Also a DRAG SURFACE: `data-project-stage` is what <Book>'s window
          binds a pointer drag to, so a mouse dragged across the plate walks
          through all four studies. `touch-action: pan-y` hands vertical
          movement back to the browser -- the book is scrubbed by vertical
          scroll and must keep scrolling from here -- while a sideways swipe
          reaches the handler. */}
      <div
        data-project-stage
        data-carousel={single ? "true" : "false"}
        className="group/stage relative mt-[0.75em] w-full shrink-0 cursor-grab touch-pan-y overflow-hidden border border-white/12 select-none data-[dragging=true]:cursor-grabbing lg:mt-[0.9em]"
        style={{ aspectRatio: "16 / 9" }}
      >
        {/* The track. On a spread every plate shares one grid cell and the
            current one is opaque; one page to a sheet, they sit side by side
            and the track moves by whole plates (`--slide`, set by <Book>),
            following the finger while it is down (`--drag`). */}
        <div
          data-project-track
          className={
            single
              ? "flex h-full w-full transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-data-[dragging=true]/stage:transition-none motion-reduce:transition-none"
              : "grid h-full w-full"
          }
          style={
            single
              ? {
                  transform:
                    "translateX(calc(var(--slide, 0) * -100% + var(--drag, 0px)))",
                }
              : undefined
          }
        >
          {entries.map((service, i) => {
            const plateClass = single
              ? "h-full w-full shrink-0"
              : "[grid-area:1/1] h-full w-full transition-opacity duration-300 ease-out data-[current=false]:pointer-events-none data-[current=false]:opacity-0 motion-reduce:transition-none";
            return service.project!.live ? (
              <LivePlate
                key={service.title}
                live={service.project!.live}
                image={service.image!}
                index={i}
                className={plateClass}
              />
            ) : (
              <img
                key={service.title}
                data-project-plate={i}
                data-current={i === 0 ? "true" : "false"}
                src={service.image!.src}
                alt={service.image!.alt}
                // The first plate is the one on screen when the spread arrives,
                // so it is the only one worth fetching eagerly.
                loading={i === 0 ? "eager" : "lazy"}
                decoding="async"
                draggable={false}
                className={`object-cover object-center select-none ${plateClass}`}
              />
            );
          })}
        </div>
        {/* The affordance. A drag nobody knows about is not a feature. It
            sits in the plate's own corner, fades while a drag is under way,
            and is decoration to a screen reader, which has the index.
            Not below `sm`: at 390 the plate is 300px and the chip was a third
            of its width, over a picture whose whole argument is that it is
            printed at full measure. Not under reduced motion either, where
            the column is a plain list and nothing drags. */}
        <span
          aria-hidden
          className="pointer-events-none absolute right-[0.9em] bottom-[0.9em] hidden items-center gap-[0.5em] bg-[#0b1728]/75 px-[0.7em] py-[0.35em] motion-reduce:hidden sm:flex text-[clamp(0.44rem,0.62vw,0.56rem)] tracking-[0.24em] text-slate-200 uppercase transition-opacity duration-300 group-data-[dragging=true]/stage:opacity-0 group-has-[[data-live-plate][data-current=true]]/stage:hidden motion-reduce:transition-none"
        >
          <span>&larr;</span>
          Drag to browse
          <span>&rarr;</span>
        </span>
      </div>

      {/* Where you are in the carousel, and a way to jump: one page per sheet
          only. They are the index's own buttons (data-project), so <Book>
          keeps them in step with everything else it drives. */}
      {single ? (
        <nav
          aria-label="Project slides"
          className="mt-[0.7em] flex shrink-0 items-center justify-center gap-[0.55em]"
        >
          {entries.map((service, i) => (
            <button
              key={service.title}
              type="button"
              data-project={i}
              data-current={i === 0 ? "true" : "false"}
              aria-current={i === 0 ? "true" : undefined}
              aria-label={`${service.project!.number} ${service.project!.category}`}
              className="group grid h-[1.6rem] min-w-[1.6rem] cursor-pointer place-items-center outline-none"
            >
              <span className="block h-[6px] w-[6px] rounded-full bg-white/30 transition-all duration-300 group-focus-visible:ring-1 group-focus-visible:ring-white group-data-[current=true]:w-[22px] group-data-[current=true]:bg-[#dce7f7] motion-reduce:transition-none" />
            </button>
          ))}
        </nav>
      ) : null}

      {/* The letterpress. grid-rows-1 makes the single row fill the flexed
          container rather than sit at its content height, which is what gives
          the foot rows below something to hang from. */}
      <div className="mt-[0.85em] grid min-h-0 lg:flex-1 lg:grid-rows-1">
        {entries.map((service, i) => {
          const project = service.project!;
          return (
            <div
              key={service.title}
              data-project-panel={i}
              data-current={i === 0 ? "true" : "false"}
              aria-hidden={i === 0 ? undefined : "true"}
              className={`flex flex-col ${stacked}`}
            >
              <h4 className="shrink-0 font-[family-name:var(--font-display)] text-[clamp(1.05rem,1.863vw,1.71rem)] leading-tight font-light text-balance text-[#dce7f7]">
                {service.title}
              </h4>
              {/* The description goes below 480px of viewport HEIGHT and
                  nowhere else -- unlike 03's rows, whose body also goes
                  below `lg`. A stage has to share a portrait sheet with the
                  stage facing it; a project does not, because only one of the
                  four is showing. Measured at 390x844 the whole recto ends
                  ~100px short of the sheet with this paragraph in.
                  Everything that is a FACT -- status, the work, the platform
                  -- stays at every size. */}
              <p className="mt-[0.55em] max-w-[46ch] shrink-0 text-[clamp(0.74rem,1.196vw,1.083rem)] leading-relaxed text-slate-300/80 [@media(max-height:480px)]:hidden">
                {service.body}
              </p>
              {/* What the work is. A `ul` because it is a list and a screen
                  reader should say so; the separators are decorative and are
                  drawn rather than typed into the copy, so nothing announces
                  "middle dot" three times. Set as one wrapped run and not as
                  bullets, for 03's reason: four bullets down a
                  column would be the most prominent thing on a page whose
                  picture is the point. */}
              <ul className="mt-[0.95em] flex shrink-0 flex-wrap items-baseline gap-x-[0.75em] gap-y-[0.25em] text-[clamp(0.64rem,1.012vw,0.912rem)] leading-relaxed text-slate-300/65">
                {/* The dot TRAILS its word rather than leading the next: at
                    1024 the run wrapped as "Strategy · UX/UI · Engineering"
                    then "· Deployment", starting a line with a separator. */}
                {project.services.map((item, k) => (
                  <li key={item} className="flex items-baseline gap-[0.7em]">
                    {item}
                    {k < project.services.length - 1 ? (
                      <span aria-hidden className="text-slate-400/35">
                        &middot;
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {/* The two ruled rows, hung off the foot the way 03 hangs
                  DELIVERABLE and OUTCOME, so they sit on the same line from
                  project to project and can be read across the four. mt-auto
                  only at lg: on the stacked portrait sheet there is no page
                  foot to drop to, only the next block. */}
              <dl className="mt-[1em] grid shrink-0 grid-cols-[auto_1fr] items-baseline gap-x-[1.2em] pt-[0.6em] lg:mt-auto lg:pt-[1.2em]">
                <dt className="border-t border-white/18 pt-[0.6em] text-[clamp(0.5rem,0.759vw,0.661rem)] tracking-[0.3em] text-slate-200/90">
                  PLATFORM
                </dt>
                <dd className="border-t border-white/18 pt-[0.6em] text-[clamp(0.78rem,1.242vw,1.14rem)] leading-tight text-white">
                  {project.platform}
                </dd>
                <dt className="border-t border-white/10 pt-[0.6em] text-[clamp(0.5rem,0.759vw,0.661rem)] tracking-[0.3em] text-slate-200/90">
                  ACTION
                </dt>
                <dd className="border-t border-white/10 pt-[0.6em]">
                  {/* Tracked capitals over a rule with an arrow, which is what
                      this book has instead of a button. It is an enquiry and
                      not "VIEW PROJECT ->" because there is nothing to view --
                      see the note on PageProject.cta. */}
                  <button
                    type="button"
                    data-nav-item
                    data-index={project.cta.chapter}
                    className="group flex w-fit items-center gap-[0.7em] border-b border-white/25 pb-[0.3em] text-[clamp(0.52rem,0.828vw,0.73rem)] tracking-[0.28em] text-slate-200 uppercase transition-colors duration-200 outline-none hover:border-white/60 hover:text-white focus-visible:border-white focus-visible:text-white motion-reduce:transition-none"
                  >
                    {project.cta.label}
                    <span
                      aria-hidden
                      className="transition-transform duration-200 group-hover:translate-x-[0.25em] motion-reduce:transition-none"
                    >
                      →
                    </span>
                  </button>
                </dd>
              </dl>
            </div>
          );
        })}
      </div>

      {/* The chapter's qualification, at the foot of the page the four plates
          are on. It rode under the ornament at the end of the register, which
          is where a colophon goes -- but the stage has no end page, and the
          half-title opposite is already carrying the index of the four.

          Under the plates is the better place regardless: this is a note about
          what the pictures are, and a large photograph of an interface is
          believed the moment it is seen. */}
      {/* Printed ONCE. It had a twin on the half-title, shown only below
          480px of viewport height for the landscape phone; that phone now gets
          the rotate notice (<Book>), so the twin guarded nothing. */}
      {colophon ? (
        <div data-ink className="pt-[1.6em]">
          <span
            aria-hidden
            className="mb-[0.9em] block h-px w-[26%] bg-white/15"
          />
          {/* The measure stops short of the drop folio. This note runs the
              full width of the page and its last line is set at the foot,
              which is exactly where the folio is: at 1280x800 the closing
              "says so." ended level with "04" and the two read as one string,
              "says so.04". It clears by 55px at 1440 and 460 at 1920 -- 1280
              is simply the width where the wrap lands there -- so the fix is
              a reserved column rather than a number tuned for one viewport. */}
          <p className="pe-[3.2em] text-[clamp(0.55rem,0.862vw,0.775rem)] leading-relaxed text-slate-300/80">
            {colophon}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * One catalogue entry: a plate and its copy, side by side.
 *
 * WHICH SIDE THE PLATE IS ON
 *
 * It alternates -- entry I has it left, II right, III left -- and the count
 * that decides is the entry's position in the CHAPTER, not on the page. So the
 * alternation carries over the gutter and over the break into a second spread,
 * which is the only way it stays a rhythm rather than resetting to left every
 * time a page happens to begin. That is why every one of these takes `index`
 * rather than working it out from its position in the array it was mapped from.
 *
 * WHY THE ROWS HAVE NO RULES BETWEEN THEM
 *
 * They used to. A rule per entry made the run read as a table of contents --
 * and a spread already carrying five photographs does not need ruling as well;
 * the pictures are the strongest thing on the page and the lines were competing
 * with them for the same job. The entries are separated by space instead, which
 * is how a book separates things it does not want you to read as a list.
 *
 * WHY THE ROW HEIGHTS ARE NOT EQUALISED
 *
 * The plates were trimmed to their own artwork, so their ratios differ (1.80
 * for Web down to 1.43 for Mobile). Forcing a common box would either letterbox
 * the wide ones or crop the tall one, and neither is worth an alignment nobody
 * can see once the rules are gone.
 */
function ServiceEntry({
  service,
  index,
}: {
  service: PageService;
  index: number;
}) {
  const plateOnTheRight = index % 2 === 1;
  return (
    <div
      data-ink
      className={`flex min-h-0 items-center gap-[clamp(1em,2.4vw,2.4em)] ${
        plateOnTheRight ? "flex-row-reverse" : ""
      }`}
    >
      {service.image ? <ServicePlate image={service.image} /> : null}
      <div className="min-w-0 flex-1">
        <p className="mb-[0.5em] text-[clamp(0.54rem,0.86vw,0.76rem)] tracking-[0.34em] text-slate-300/75">
          {roman(index + 1)}
        </p>
        <p className="font-[family-name:var(--font-display)] text-[clamp(1.05rem,1.85vw,1.72rem)] leading-tight font-normal text-balance text-white">
          {service.title}
        </p>
        {service.body ? (
          <p className="mt-[0.55em] text-[clamp(0.72rem,1.14vw,1.04rem)] leading-relaxed text-slate-300/85">
            {service.body}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The plate itself. No keyline and no caption, unlike EngravedPlate.
 *
 * It needs neither: tools/build-service-plates.sh keys the render off its
 * ground and tones it into the page's own navy, so it is already a cut-out
 * printed in the book's ink rather than a screenshot pasted on -- and the
 * entry's title is directly beside it doing the work a caption would do
 * underneath. A box around a cut-out only draws the box.
 *
 * `aspectRatio` comes from the content rather than from the file so the row
 * reserves its height before the image decodes. The sheets are laid out by
 * measurement, and a plate that resizes after paint drags the copy with it.
 */
function ServicePlate({ image }: { image: PageFigure }) {
  return (
    <img
      src={image.src}
      alt={image.alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      // Narrower below lg, and the point is the copy rather than the plate:
      // on a portrait phone the whole spread collapses to one full-bleed page,
      // so entries that share a 700px half on desktop share a 390px page here.
      // At 42% the text column falls to ~180px and every body wraps to four
      // lines; at 32% it gets ~215px and most wrap to three.
      //
      // `wide` is the one exception, and it is the entry's own: see PageFigure.
      // The extra width comes out of that entry's copy, so it stays inside the
      // same row and no other plate in the run moves -- and it only applies
      // from `xl`. At 1024 the recto is ~240px after the thumb index's inset,
      // where 52% left the AI entry's body on seven lines of about four words;
      // there the plate keeps the run's own 42%.
      className={`shrink-0 select-none ${
        image.wide ? "w-[32%] lg:w-[42%] xl:w-[52%]" : "w-[32%] lg:w-[42%]"
      }`}
      style={{ aspectRatio: image.ratio, objectFit: "contain" }}
    />
  );
}

/**
 * An illustrated run of entries, continuing the numbering across the gutter.
 */
function ServiceEntries({
  services,
  from,
  head,
}: {
  services: PageService[];
  from: number;
  /** The chapter head, when this page opens a chapter. It takes slot 1. */
  head?: React.ReactNode;
}) {
  // The head takes the height it needs and the entries SHARE THE REST with
  // `space-around`: half a gap above the first, a full gap between them.
  //
  // It was a grid of PAGE_SLOTS equal rows, head included, with each entry
  // centred in its row. The head needs ~130px of a ~245px slot and entry I
  // then floated mid-way down the next, so the chapter opened on ~130px of
  // nothing under its epigraph -- on a laptop and on a phone alike (asked:
  // "decrease the space after 'Five ways in'"). What the equal rows bought
  // was entry II on the same line as entry V across the gutter, which two
  // entries of different lengths never visibly delivered.
  //
  // Still a column that FILLS the page, not a gap-packed list: the older
  // version packed entries at the top and left a third of the page blank.
  const entries = (
    <div className="flex min-h-0 flex-1 flex-col justify-around">
      {services.map((service, i) => (
        <ServiceEntry key={service.title} service={service} index={from + i} />
      ))}
    </div>
  );
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {head}
      {entries}
    </div>
  );
}

/**
 * The supporting entries, as a modular grid -- the grid a catalogue uses, as
 * against the single manuscript column the prose pages are set in. The cell
 * rules are the grid made visible, which is what stops four equal things
 * reading as an unordered heap.
 */
function ServiceGrid({
  services,
  from,
}: {
  services: PageService[];
  from: number;
}) {
  return (
    <div className="grid grid-cols-2">
      {services.map((service, i) => (
        <div
          key={service.title}
          data-ink
          className={`flex flex-col border-t border-white/12 py-[1.15em] lg:py-[2.3em] ${
            i % 2 === 0 ? "pe-[1.4em]" : "border-s ps-[1.4em]"
          }`}
        >
          {service.emblem ? (
            <Emblem
              name={service.emblem}
              className="mb-[1.1em] w-[clamp(38px,4.9vw,68px)] text-slate-300"
            />
          ) : null}
          <p className="mb-[0.55em] text-[clamp(0.52rem,0.805vw,0.707rem)] tracking-[0.34em] text-slate-200/90">
            {roman(from + i + 1)}
          </p>
          <p className="text-[clamp(0.72rem,1.173vw,1.049rem)] leading-tight text-white">
            {service.title}
          </p>
          <p className="mt-[0.45em] text-[clamp(0.62rem,0.989vw,0.889rem)] leading-relaxed text-slate-300/70">
            {service.body}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * The right-hand page of a catalogue spread. It carries no title of its own --
 * the verso facing it has already said what this is -- so it is simply the run
 * of entries continuing, picking the alternation up from however many sat on
 * the left-hand page.
 */
function ServicesPage({ page }: { page: BookPage | BookSpread }) {
  const single = useContext(SingleSheetContext);
  if (!page.services?.length) return null;
  // Where this page's entries sit in the CHAPTER's run: what the spread starts
  // at, plus whatever its own verso already used. On an engraved chapter there
  // is no offset to carry and servicesFrom is 0, so this is the count it always
  // was.
  const spread = page as Partial<BookSpread>;
  const from =
    (spread.servicesFrom ?? 0) + (page.facing?.services?.length ?? 0);
  const illustrated = isIllustrated(page.services);
  const plates = isPlateSection(page.services);
  const projects = isProjects(page.services);
  const perspective = isPerspective(page.services);
  // Both halves of the process spread are cut here, off the CHAPTER's run, so
  // that the recto knows how many rows the verso reserved. `rows` is the
  // larger of the two counts and is what keeps the two grids on one set of
  // lines when the run is odd.
  const halves = plates ? stageHalves(page.services, single) : null;
  return (
    <>
      {/* The picture-bearing settings are asked FIRST and isIllustrated LAST.
          It answers true for the plate section and the project stage as well,
          and would print their plates as thumbnails beside sentences. */}
      {plates && halves ? (
        // The recto of the process spread: the last four stages and nothing
        // else. It had the arc IDEAS -> STRATEGY -> PRODUCT -> GROWTH in a
        // head slot; that was removed on request for the stages' spacing.
        <StageRun
          slots={halves.recto}
          rows={halves.rectoRows}
        />
      ) : projects ? (
        <ProjectStage
          services={page.services}
          colophon={(page as BookPage).colophon}
        />
      ) : illustrated ? (
        <ServiceEntries services={page.services} from={from} />
      ) : perspective ? (
        // The recto of 05 is not its entries at all -- it is the ARGUMENT for
        // them, which lives on the page rather than in the run. The six
        // domains are printed opposite; this side says what thinking about
        // them is for and what a reader gets out of it.
        (page as BookPage).rationale ? (
          <RationalePage rationale={(page as BookPage).rationale!} />
        ) : null
      ) : (
        <ServiceGrid services={page.services} from={from} />
      )}
      {/* Tailpiece, closing the catalogue the way 01 closes its text -- but
          only where the catalogue actually ends. On the first of two spreads
          the run carries on over the page, and an ornament there would sign
          off a chapter that has not finished.

          Not on the CATALOGUE's pages: its entries fill a grid that is the
          whole height of the page, so there is no foot left to put an ornament
          in. The register's pages are the opposite -- sized to their count,
          with the foot deliberately left for this.

          Ask what SETTING a run is in, never whether an entry happens to
          have an image. `!illustrated` alone read like that test for as long
          as only 02 had pictures, and has now been wrong three times: the
          register's records carried plates, the project stage's carry them,
          and the plate section arrived here carrying six of them the day it
          stopped paginating.
          Both times isIllustrated() started answering true and this ornament
          silently vanished from a chapter that still needed closing. Every
          picture-bearing setting has to be named here, which is why the list
          grows rather than the test getting cleverer -- see CLAUDE.md. */}
      {!illustrated &&
      !plates &&
      !projects &&
      !perspective &&
      (spread.lastOfChapter ?? true) ? (
        <div data-ink className="mt-[2em]">
          <Ornament className="w-[30%] text-slate-300" />
        </div>
      ) : null}
    </>
  );
}

/**
 * Any facing entries after the lead, set compactly beneath it. Without this a
 * verso authored with two entries silently printed only the first.
 */
function SecondaryServices({
  services,
  from,
}: {
  services: PageService[];
  from: number;
}) {
  return (
    <ul className="mt-[1em] flex flex-col">
      {services.map((service, i) => (
        <li
          key={service.title}
          data-ink
          className="flex items-center gap-[1em] border-t border-white/10 py-[0.85em]"
        >
          {service.emblem ? (
            <Emblem
              name={service.emblem}
              className="w-[clamp(26px,3.1vw,40px)] shrink-0 text-slate-300"
            />
          ) : null}
          <div>
            <p className="mb-[0.3em] text-[clamp(0.46rem,0.713vw,0.627rem)] tracking-[0.32em] text-slate-300/80">
              {roman(from + i + 1)}
            </p>
            <p className="text-[clamp(0.72rem,1.15vw,1.026rem)] leading-tight text-white">
              {service.title}
            </p>
            {service.body ? (
              <p className="mt-[0.3em] max-w-[32ch] text-[clamp(0.62rem,0.966vw,0.866rem)] leading-relaxed text-slate-300/70">
                {service.body}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}


/**
 * An engraved plate.
 *
 * The file is a greyscale mask of the engraving's line work, so this paints
 * the colour and lets the mask cut it. That is why it is a div and not an img:
 * an <img> would put a grey rectangle on a navy page, whereas a masked block
 * puts silver line on the paper and nothing else -- the plate reads as struck
 * into the page rather than pasted onto it. It also ships a third of the
 * bytes, because a flat colour does not need three channels to describe it.
 */
function EngravedPlate({
  plate,
  beside = false,
}: {
  plate: PagePlate;
  /**
   * Set the caption alongside the plate rather than beneath it.
   *
   * A plate is sized by the space it has to fill, and the two halves of the
   * book do not have the same shape of space. The verso plates drop into a
   * wide gap under short copy, so the picture takes the width and the caption
   * sits under it. The recto's gap is what is left below a list -- taller than
   * it is wide -- and the tall plate that goes there (03's flow chart) would
   * have to shrink to about 100px across to leave room for a caption beneath
   * it, at which point the chart is a texture. Putting the caption beside it
   * spends the recto's spare WIDTH, which nothing else on that page is using,
   * and buys the plate back about 60% of its height.
   */
  beside?: boolean;
}) {
  return (
    <figure
      data-ink
      className={
        beside
          ? "mt-auto flex items-end gap-[1.4em] pt-[1.6em]"
          : // 10% on a spread and not 7%, with the plate a size down to pay
            // for it.
            //
            // This figure hangs off the foot with mt-auto, so it lands where
            // the drop folio is -- and the folio is placed at 7% of the page
            // HEIGHT while this margin is a percentage of its WIDTH. At 7% of
            // ~725 the margin is 51px against a folio whose top edge is 75px
            // up, and once the caption and credit grew with the rest of the
            // chapter the credit printed straight through "07 - CONNECT" in
            // the same column. Measured at 1440x900: credit 812-827 against a
            // folio at 820-837, both at x=77.
            //
            // The width comes off the PLATE because the verso has nowhere else
            // to give: its subtitle ends at 361 and the picture started at
            // 365. 20vw is 415px of picture where 445 is all there is once the
            // caption, the credit and the reserved folio are counted.
            //
            // The margin is lg-ONLY, and that is not a detail. On a spread this figure
            // hangs off the foot with mt-auto and the extra margin lifts it
            // clear of the folio. Below lg the verso is stacked in an
            // auto-height column where mt-auto does nothing, so the same
            // margin only pushes the contact rows BELOW it further down --
            // measured at 390x844 it cost 7px on a page that is already short.
            // hidden below lg, which is a fix and not a preference. This is
            // 07's verso, the only page that uses the non-beside figure, and
            // portrait stacks the whole chapter onto one sheet: at 390x844
            // that sheet measures 475px in a 390px window, so 45px of its foot
            // is off-screen before anything is printed and this plate is 385
            // of what is left. With it in, the business enquiry and the action
            // under it were both in the clipped band -- the chapter's own
            // reason for existing, printed below the fold. 04's verso drops
            // its engraving at portrait for the same reason, and the two
            // remaining figures are still Fig. 1 and Fig. 2 on the spread,
            // where the numbering lives.
            "mt-auto hidden w-[clamp(150px,18.5vw,268px)] lg:block"
      }
    >
      <div
        role="img"
        aria-label={plate.caption}
        className={`opacity-80 ${
          beside ? "w-[clamp(100px,12.3vw,176px)] shrink-0" : "w-full"
        }`}
        style={
          {
            aspectRatio: plate.ratio,
            backgroundColor: "#dce7f7",
            maskImage: `url("${plate.src}")`,
            WebkitMaskImage: `url("${plate.src}")`,
            maskSize: "contain",
            WebkitMaskSize: "contain",
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
            maskPosition: "center",
            WebkitMaskPosition: "center",
            // The file is opaque greyscale with no alpha channel, and CSS
            // masking defaults to alpha -- under which every pixel is fully
            // opaque and the mask passes the whole rectangle. Reading it by
            // LUMINANCE is what makes the white line work show and the black
            // paper drop out. Without this the page gets a pale slab.
            maskMode: "luminance",
            WebkitMaskSourceType: "luminance",
          } as React.CSSProperties
        }
      />
      <figcaption className={beside ? "pb-[0.4em]" : "mt-[0.9em]"}>
        <p className="text-[clamp(0.52rem,0.828vw,0.73rem)] tracking-[0.28em] text-slate-300/80">
          {plate.caption.toUpperCase()}
        </p>
        <p className="mt-[0.45em] text-[clamp(0.5rem,0.759vw,0.661rem)] tracking-[0.06em] text-slate-400/35 italic">
          {plate.credit}
        </p>
      </figcaption>
    </figure>
  );
}

/**
 * A numbered procedure, run down the page as a ruled sequence.
 *
 * sample.jpeg draws this as six circles on one horizontal line, which is a
 * banner and not a page. A book sets a procedure as numbered steps down the
 * measure -- three on the verso and three on the recto, the numbering carrying
 * across the gutter, each step a circled plate against its own rule.
 */
function StepList({ steps, from }: { steps: PageStep[]; from: number }) {
  return (
    <ol className="flex flex-col">
      {steps.map((step, i) => (
        <li
          key={step.title}
          data-ink
          className="flex items-start gap-[1.1em] border-t border-white/12 py-[1.1em] lg:py-[1.5em]"
        >
          <span className="relative flex aspect-square w-[clamp(34px,4.2vw,52px)] shrink-0 items-center justify-center rounded-full border border-white/15">
            <Emblem name={step.emblem} className="w-[58%] text-slate-200" />
          </span>
          <div className="pt-[0.15em]">
            <p className="mb-[0.35em] text-[clamp(0.5rem,0.782vw,0.684rem)] tracking-[0.34em] text-slate-300/80 tabular-nums">
              {roman(from + i + 1)}
            </p>
            <p className="text-[clamp(0.78rem,1.242vw,1.117rem)] leading-tight text-white">
              {step.title}
            </p>
            <p className="mt-[0.4em] max-w-[34ch] text-[clamp(0.64rem,1.012vw,0.912rem)] leading-relaxed text-slate-300/75">
              {step.body}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * THE TEAM SPREAD: the people, portrait left and words right.
 *
 * It borrows the process spread's shared grid -- a head slot and then equal
 * rows, the same template on both pages -- so member 01 sits on exactly the
 * line member 03 does and the rules run straight across the gutter. `rows` is
 * the larger half, so an odd team leaves the recto's last row blank rather
 * than respacing one page against the other.
 */
/**
 * The run cut across the gutter as SLOTS, the chapter head counting as one.
 *
 * Every slot is one equal row on both pages, so every portrait is one size
 * and the verso's rows II-III sit on the recto's rows II-III. Five members
 * are head + 2 on the verso and 3 on the recto; four would be head + 2 and 2,
 * leaving the recto's last row empty rather than respacing one page.
 *
 * The recto used to spend its first slot on the leadership principles and
 * the founding belief, removed on request when Naveen joined -- which is
 * what lets it carry three people.
 */
function teamHalves(members: PageMember[]) {
  const rows = Math.ceil((members.length + 1) / 2);
  return {
    verso: members.slice(0, rows - 1),
    recto: members.slice(rows - 1),
    rows,
  };
}

function TeamRun({
  members,
  from,
  rows,
  head,
}: {
  members: PageMember[];
  from: number;
  rows: number;
  head?: React.ReactNode;
}) {
  if (!members.length) return null;
  return (
    <div
      data-team-run
      // The same three decisions as <StageRun>, for the same measured
      // reasons: the row template is lg-only (below lg both grids stack in
      // one column and `flex-1` hands the second one zero height), and the
      // bottom padding reserves the drop folio in vh because the folio is
      // placed in vh.
      // The row template is `lg` AND portrait. It was lg-only because below
      // that the two halves stacked in ONE column and `flex-1` handed the
      // second grid zero height -- members 03 and 04 were in the DOM at 0px.
      // A portrait phone prints one page per sheet, so there is one grid on
      // the page and that cannot happen; without the template its two rows
      // sat at the top and left 246px of the page blank.
      className="grid gap-y-[clamp(0.25em,0.5vh,1em)] [grid-template-rows:none] portrait:h-full portrait:min-h-0 portrait:flex-1 portrait:[grid-template-rows:var(--team-rows)] lg:h-full lg:min-h-0 lg:flex-1 lg:[grid-template-rows:var(--team-rows)]"
      style={
        {
          "--team-rows": `repeat(${rows}, minmax(0, 1fr))`,
        } as React.CSSProperties
      }
    >
      {head}
      {members.map((member, i) => (
        <MemberRow key={member.name} member={member} index={from + i} />
      ))}
    </div>
  );
}

/**
 * One member: a keyline plate on the left, the letterpress on the right.
 *
 * The plate takes its HEIGHT from the row and its width from the 4:5 portrait,
 * so four rows of one height give four plates of one size on both pages --
 * the one thing a row of faces a reader compares may not get wrong. Below lg
 * the rows are content-height, so the plate is given a width instead.
 */
function MemberRow({ member, index }: { member: PageMember; index: number }) {
  return (
    <article
      data-ink
      className="flex min-h-0 items-stretch gap-[clamp(0.9em,1.7vw,1.6em)] border-t border-white/15 py-[clamp(0.6em,1.3vh,1.1em)]"
    >
      <figure
        // Capped in vw as well as sized by the row. At 1024 the row alone made
        // the plate 150px of a 280px recto, and Ashok's sentence ran to six
        // lines beside it; the cap narrows the plate there and object-cover
        // crops the shoulders rather than the face.
        className="w-[clamp(78px,22vw,110px)] shrink-0 self-start border border-white/15 p-[4px] [@media(max-height:480px)]:w-[56px] lg:aspect-[4/5] lg:h-full lg:w-auto lg:max-w-[9vw] lg:self-stretch xl:max-w-[clamp(100px,12.5vw,200px)]"
      >
        <img
          src={member.portrait}
          alt={`${member.name}, ${member.role}`}
          width={360}
          height={450}
          draggable={false}
          className="block aspect-[4/5] w-full object-cover select-none lg:h-full"
        />
      </figure>
      <div className="flex min-w-0 flex-col justify-center">
        {/* 0.18em from xl, down from 0.3: the roles grew to "Lead Generation
            Executive" and "Business Generation Executive", and at 0.3em the
            second broke one word to a line beside a 170px portrait. */}
        <p className="flex items-baseline gap-[0.8em] text-[clamp(0.5rem,0.74vw,0.66rem)] leading-snug tracking-[0.14em] text-slate-200/90 uppercase xl:tracking-[0.18em]">
          <span aria-hidden className="tabular-nums text-slate-300/80">
            {roman(index + 1)}
          </span>
          {member.role}
        </p>
        <h3 className="mt-[0.35em] font-[family-name:var(--font-display)] text-[clamp(1.05rem,1.9vw,1.75rem)] leading-[1.1] font-light text-white">
          {member.name}
        </h3>
        {/* Dropped below 480px of viewport HEIGHT. At 844x390 the sheet shows
            about 330px under a chapter head of 150, which is 90 a row, and a
            row with its sentence is 130: Unni's printed off the foot. Role
            and name are the facts; the sentence elaborates them. The focus
            words that sat between name and sentence were removed on request,
            and the sentence moved up a little to keep the row's rhythm. */}
        <p className="mt-[0.8em] max-w-[40ch] text-[clamp(0.64rem,0.98vw,0.9rem)] leading-relaxed text-slate-300/75 [@media(max-height:480px)]:hidden">
          {member.line}
        </p>
      </div>
    </article>
  );
}

/** The team spread's recto: the second part of the run, no head. */
function TeamPage({ team }: { team: NonNullable<BookPage["team"]> }) {
  const { recto, verso, rows } = teamHalves(team.members);
  return <TeamRun members={recto} from={verso.length} rows={rows} />;
}

/**
 * The contact spread's right-hand page, set the way a professional services
 * page sets it: a headline, two buttons, then a details table.
 *
 * The buttons are the page's ONE filled object. Everything else in this book
 * acts through ruled lines and hairline panels, and this page tried both --
 * an inquiry panel, then two bordered panels -- before the brief asked for
 * something plainly professional. A solid "Email us" beside an outlined "Call
 * us" is the convention a visitor already knows how to read.
 */
function ContactPage({ page }: { page: BookPage }) {
  const contact = page.contact;
  if (!contact) return null;
  const byEmblem = (emblem: string) =>
    contact.rows.find((row) => row.emblem === emblem);
  return (
    // ON A SPREAD the page starts at the TOP, with "GET IN TOUCH" on the same
    // line as the verso's "07  CONNECT", and spreads its sections down the
    // page from there. It was centred (`my-auto`) for a revision, which put
    // the eyebrow 100px below the chapter label it answers across the gutter;
    // asked to be level with it. Below `lg` there is no facing page to be
    // level with, so the old centring stays.
    <div data-ink className="my-auto flex flex-col lg:my-0 lg:flex-1">
      {/* The eyebrow is set on <ChapterHead>'s own label line: an invisible
          copy of its headpiece and of the numeral's line box, so the baseline
          lands where the verso's does at every size without a measured
          offset. The headpiece is 38% of the VERSO's measure and its height
          follows its width (a 16:1 svg), so it is sized from this page's
          width plus the two insets that make the recto narrower -- measured
          off by 3px at 1440 when it was 38% of the recto. The numeral is a
          zero-width box: it lends the row its baseline and takes no room. */}
      <Ornament className="invisible mb-[0.9em] hidden w-[calc((100%+var(--page-text-inset-end,0px)+var(--page-index-inset,0px))*0.38)] lg:block" />
      <div className="flex items-baseline">
        <span
          aria-hidden
          className="invisible hidden w-0 font-[family-name:var(--font-display)] text-[clamp(2.2rem,4.4vw,4.4rem)] leading-[0.8] font-light lg:inline"
        >
          {roman(page.number)}
        </span>
        {/* CONNECT's size and tracking, so the two labels read as a pair. */}
        <p className="text-[clamp(0.52rem,0.828vw,0.73rem)] leading-none font-semibold tracking-[0.34em] text-[#c9d9ef] uppercase lg:text-[clamp(0.6rem,0.9vw,0.76rem)] lg:tracking-[0.4em]">
          {contact.eyebrow}
        </p>
      </div>
      <h3 className="mt-[0.45em] font-[family-name:var(--font-display)] text-[clamp(1.3rem,2.4vw,2.2rem)] lg:mt-[0.35em] leading-[1.08] font-light text-balance text-white">
        {contact.headline}
      </h3>
      {/* Gone below 480px of viewport height: at 844x390 the recto has ~330px
          and the details table is what must not be clipped. */}
      <p className="mt-[0.7em] max-w-[38ch] text-[clamp(0.7rem,1.06vw,0.96rem)] leading-relaxed text-slate-300/80 lg:mt-[1.5em] lg:leading-[1.85] [@media(max-height:480px)]:hidden">
        {contact.directBody}
      </p>

      <div className="mt-[1.2em] flex flex-wrap gap-[0.7em] lg:mt-[1.9em] [@media(max-height:480px)]:mt-[0.6em]">
        {contact.actions.map((action) => {
          const row = byEmblem(action.emblem);
          if (!row?.href) return null;
          return (
            // A BOOKPLATE, not a button: a small label plate with its corners
            // cut, a hairline edge, and a second rule standing inside each end
            // -- the frame an ex-libris plate pasted inside a cover has. Set
            // in the book's serif in small capitals rather than tracked sans,
            // so the two actions read as printed on the page like everything
            // else on it. "Email us" is still the one FILLED object in the
            // book, in the paper colour; "Call us" is the same plate in line.
            //
            // The chamfer is a clip-path, and a clip-path clips outlines too,
            // so it lives on two layers INSIDE the link -- an edge layer and a
            // fill layer 1px in -- and the link keeps a focus outline that is
            // drawn outside the plate. The fill layer has to be opaque (the
            // edge layer is a solid shape under it), so "Call us" is filled
            // with the page's own colour where it sits, sampled off the frame
            // at rgb(35,56,87); a darker navy read as a hole in the paper.
            //
            // `small-caps`, not `all-small-caps`: the initial stays a full
            // capital, which is how a printed label sets it, and at
            // all-small-caps every glyph was x-height and the label read at
            // about 9px.
            <a
              key={action.label}
              href={row.href}
              className={`group relative inline-flex items-center gap-[0.6em] px-[1.45em] py-[0.6em] font-[family-name:var(--font-display)] text-[clamp(0.88rem,1.2vw,1.12rem)] tracking-[0.08em] [font-variant-caps:small-caps] outline-none transition-[color,transform] duration-300 hover:-translate-y-px focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-[#dce7f7] motion-reduce:transition-none [@media(max-height:480px)]:py-[0.5em] ${
                action.solid ? "text-[#0b1728]" : "text-white"
              }`}
            >
              <span
                aria-hidden
                className={`absolute inset-0 transition-colors duration-300 [clip-path:polygon(8px_0,calc(100%-8px)_0,100%_8px,100%_calc(100%-8px),calc(100%-8px)_100%,8px_100%,0_calc(100%-8px),0_8px)] motion-reduce:transition-none ${
                  action.solid
                    ? "bg-[#dce7f7]"
                    : "bg-[#dce7f7]/55 group-hover:bg-[#dce7f7]"
                }`}
              />
              <span
                aria-hidden
                className={`absolute inset-px transition-colors duration-300 [clip-path:polygon(7.6px_0,calc(100%-7.6px)_0,100%_7.6px,100%_calc(100%-7.6px),calc(100%-7.6px)_100%,7.6px_100%,0_calc(100%-7.6px),0_7.6px)] motion-reduce:transition-none ${
                  action.solid
                    ? "bg-[#dce7f7] group-hover:bg-white"
                    : "bg-[#22385a] group-hover:bg-[#2b4469]"
                }`}
              />
              {/* The inner rules at each end -- the second line of the
                  plate's frame. */}
              <span
                aria-hidden
                className={`absolute inset-y-[6px] start-[6px] w-px ${
                  action.solid ? "bg-[#0b1728]/35" : "bg-[#dce7f7]/45"
                }`}
              />
              <span
                aria-hidden
                className={`absolute inset-y-[6px] end-[6px] w-px ${
                  action.solid ? "bg-[#0b1728]/35" : "bg-[#dce7f7]/45"
                }`}
              />
              <Emblem
                name={action.emblem}
                className="relative w-[1em] shrink-0 opacity-90"
              />
              <span className="relative">{action.label}</span>
              <span
                aria-hidden
                className="relative transition-transform duration-300 group-hover:translate-x-[0.25em] motion-reduce:transition-none"
              >
                &rarr;
              </span>
            </a>
          );
        })}
      </div>

      {/* The details, as a table a visitor can scan: what it is, the value,
          and what can be done with it. Copy sits outside the link -- a button
          inside an anchor is invalid -- and on a laptop that cannot dial,
          copying the number IS the action. */}
      {/* SET AS A POSTED LETTER, asked for over a plain table: a paper
          panel with an airmail border, a perforated stamp carrying the mark,
          a postmark struck across its edge, and the details written as the
          address lines, each on its own dotted rule. Everything that could be
          done with a detail still can -- the value is the link, Copy and the
          verb sit at the end of its line, now as small seals.

          The airmail border is drawn with `border-image`, which only paints
          the edge -- a masked background was tried first and the mask
          shorthand reset its composite, so the stripes ran under the text. The envelope costs ~60px over the old table, so the
          margin above it came down from 3.6em to 2.2em to pay for it; the
          measurements are in CLAUDE.md. On a small or wide-short spread
          (below xl, and 16:9-or-wider under 880px tall) its italic address
          line goes and its rows tighten: at 1024x768 the envelope's foot
          ran 5px into the folio and 1280x720 cleared it by 8. */}
      <div
        data-envelope
        className="relative mt-[1.6em] border border-[#dce7f7]/20 bg-[#dce7f7]/[0.04] px-[1.2em] pt-[1em] pb-[0.8em] lg:mt-[1.3em] xl:mt-[2.2em] [@media(min-aspect-ratio:17/10)_and_(max-height:880px)]:mt-[1.3em] [@media(max-height:480px)]:mt-[0.8em] [@media(max-height:480px)]:py-[0.5em]"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-[3px] opacity-45"
          style={{
            borderStyle: "solid",
            borderWidth: 5,
            borderImage:
              "repeating-linear-gradient(135deg, #dce7f7 0 7px, transparent 7px 14px, #7fa3d4 14px 21px, transparent 21px 28px) 5",
          }}
        />
        <div className="relative flex items-start justify-between gap-[1em]">
          <div className="pt-[0.2em]">
            <p className="text-[clamp(0.44rem,0.66vw,0.6rem)] tracking-[0.3em] text-slate-300/70 uppercase [@media(max-height:480px)]:hidden">
              {contact.detailsTitle}
            </p>
            <p className="mt-[0.3em] font-[family-name:var(--font-display)] text-[clamp(0.72rem,1.05vw,0.95rem)] text-slate-200/90 italic lg:max-xl:hidden [@media(min-aspect-ratio:17/10)_and_(max-height:880px)]:hidden [@media(max-height:480px)]:hidden">
              To be delivered to Nivlak Technologies
            </p>
          </div>
          {/* The stamp and the postmark struck across its left edge. */}
          <div aria-hidden className="relative shrink-0">
            <span className="grid h-[3.4em] w-[2.9em] place-items-center border border-dashed border-[#dce7f7]/45 bg-[#dce7f7]/[0.06] text-[clamp(0.7rem,1vw,0.9rem)] outline outline-1 outline-offset-2 outline-[#dce7f7]/15 [@media(max-height:480px)]:hidden">
              <img
                src="/logo-mark.webp"
                alt=""
                draggable={false}
                className="h-auto w-[60%] opacity-80 select-none"
              />
            </span>
            <span className="absolute top-[18%] right-[88%] grid size-[clamp(40px,3.6vw,52px)] portrait:hidden -rotate-12 place-items-center rounded-full border border-double border-[#dce7f7]/40 [border-width:3px] text-center font-[family-name:var(--font-display)] text-[clamp(0.3rem,0.42vw,0.42rem)] leading-tight tracking-[0.04em] text-[#dce7f7]/65 uppercase [@media(max-height:480px)]:hidden">
              Nagercoil
              <br />· India ·
            </span>
          </div>
        </div>
      <dl className="relative mt-[0.5em] grid grid-cols-[max-content_minmax(0,1fr)_auto] gap-x-[0.8em] [@media(max-height:480px)]:mt-0">
        {contact.rows.map((row) => (
          <div
            key={row.value}
            // LABEL BESIDE ITS VALUE at every size ("Phone  +91 ..." on one line,
            // asked for on phones, where the label used to sit above). The rows
            // are a SUBGRID of the list, so the label column is as wide as the
            // widest label ("Location") and every value starts on one line.
            className="col-span-3 grid grid-cols-subgrid items-center border-b border-dotted border-white/25 py-[0.55em] last:border-b-0 lg:py-[0.45em] xl:py-[0.85em] [@media(min-aspect-ratio:17/10)_and_(max-height:880px)]:py-[0.55em] [@media(max-height:480px)]:py-[0.3em]"
          >
            <dt className="font-[family-name:var(--font-display)] text-[clamp(0.62rem,0.86vw,0.8rem)] text-slate-200/90 italic">
              {row.label}
            </dt>
            <dd
              // LINING figures: the display face defaults to old-style digits,
              // which rise and fall about the line (3 4 7 9 below, 6 8 above),
              // and "+91 97873 04869" read as bouncing -- asked for "in a
              // single line, not up and down". Tabular so digits align too.
              className="min-w-0 break-words font-[family-name:var(--font-display)] text-[clamp(0.78rem,1.15vw,1.06rem)] text-slate-100 [font-variant-numeric:lining-nums_tabular-nums]"
            >
              {row.href ? (
                <a
                  href={row.href}
                  {...(row.href.startsWith("http")
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                  className="underline decoration-white/0 underline-offset-4 transition-colors duration-300 outline-none hover:decoration-white/60 focus-visible:decoration-white motion-reduce:transition-none"
                >
                  {/* A break opportunity before the "@": beside its label on a
                      phone the address needs ~150px of a ~95px column, and
                      without it the browser split it mid-word
                      ("nivlak.work@gm / ail.com"). */}
                  {row.value.includes("@") ? (
                    <>
                      {row.value.slice(0, row.value.indexOf("@"))}
                      <wbr />
                      {row.value.slice(row.value.indexOf("@"))}
                    </>
                  ) : (
                    row.value
                  )}
                </a>
              ) : (
                row.value
              )}
            </dd>
            <dd className="flex items-center gap-[0.4em]">
              {row.copy ? (
                <CopyButton
                  value={row.value}
                  label={row.emblem === "phone" ? "Phone number" : "Email address"}
                />
              ) : null}
              {row.href && row.action ? (
                // Hidden in the 1024-1280 band and on short screens, where the
                // recto is too narrow for value, copy and a verb on one line;
                // the value itself is the link.
                <a
                  href={row.href}
                  tabIndex={-1}
                  aria-hidden
                  {...(row.href.startsWith("http")
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                  className="rounded-full border border-[#dce7f7]/30 bg-[#dce7f7]/[0.06] px-[0.75em] py-[0.35em] text-[clamp(0.44rem,0.62vw,0.56rem)] tracking-[0.2em] text-slate-200/85 uppercase transition-colors duration-300 hover:border-[#dce7f7]/70 hover:bg-[#dce7f7]/15 hover:text-white motion-reduce:transition-none max-sm:hidden lg:max-xl:hidden [@media(max-height:480px)]:hidden"
                >
                  {row.action}
                </a>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
      </div>
    </div>
  );
}

/**
 * 07's verso under the chapter head: what the studio helps with, as tags, and
 * how getting in touch works, as three stations on a drawn rule. Nothing here
 * is clickable. lg-only: below that the chapter is one sheet and the ways to
 * reach a person come first.
 */
function ContactVerso({
  contact,
}: {
  contact: NonNullable<BookPage["contact"]>;
}) {
  return (
    // `portrait:flex` is the phone, and it is the SAME argument that hid this
    // below `lg` read the other way round. It was hidden because down there the
    // whole spread collapsed onto one sheet and this would have printed through
    // the contact table. A portrait phone prints one page per sheet now, so
    // this verso carries a chapter head and one sentence and nothing else --
    // measured at 393x851, ink stopped at y=257 and 594px of the page was
    // blank, 70% of it. The blocks left below `lg` are still hidden on a small
    // LANDSCAPE phone, which is the viewport that collapse was written for.
    // ...but NOT on a phone under 620px of height, and that is measured:
    // at 320x568 the tags and the three stations put the page 4px past its own
    // face with eight elements out of bounds. 360x640 clears by 34, which is
    // where the threshold sits. The same number the cover's scroll cue uses.
    <div
      data-ink
      className="mt-[2.2em] hidden flex-col gap-[2.4em] portrait:flex lg:flex [@media(max-height:620px)]:hidden"
    >
      <section>
        <p className="text-[clamp(0.44rem,0.66vw,0.6rem)] tracking-[0.3em] text-slate-300/80 uppercase">
          {contact.helpTitle}
        </p>
        <ul className="mt-[0.9em] flex flex-wrap gap-[0.55em]">
          {contact.help.map((tag) => (
            // Set as small BOOKPLATES, the same object as the recto's "Call
            // us": cut corners, a hairline edge, a second rule inside each
            // end, the label in the display serif's small caps. Asked for in
            // place of rounded pills, so the chapter's two sets of labels
            // read as one family. Not interactive -- no hover, no focus.
            // The chamfer is a clip-path on two layers (edge, then fill 1px
            // in), as on the button; the fill is the page's own colour here.
            <li
              key={tag}
              className="relative px-[1.15em] py-[0.42em] font-[family-name:var(--font-display)] text-[clamp(0.72rem,1.02vw,0.94rem)] tracking-[0.06em] text-slate-100 [font-variant-caps:small-caps]"
            >
              <span
                aria-hidden
                className="absolute inset-0 bg-[#dce7f7]/45 [clip-path:polygon(6px_0,calc(100%-6px)_0,100%_6px,100%_calc(100%-6px),calc(100%-6px)_100%,6px_100%,0_calc(100%-6px),0_6px)]"
              />
              <span
                aria-hidden
                className="absolute inset-px bg-[#22385a] [clip-path:polygon(5.6px_0,calc(100%-5.6px)_0,100%_5.6px,100%_calc(100%-5.6px),calc(100%-5.6px)_100%,5.6px_100%,0_calc(100%-5.6px),0_5.6px)]"
              />
              <span aria-hidden className="absolute inset-y-[5px] start-[4px] w-px bg-[#dce7f7]/35" />
              <span aria-hidden className="absolute inset-y-[5px] end-[4px] w-px bg-[#dce7f7]/35" />
              <span className="relative">{tag}</span>
            </li>
          ))}
        </ul>
      </section>
      {contact.next ? <HowItWorks next={contact.next} /> : null}
    </div>
  );
}

/**
 * Copies a value, for the two things people paste rather than click: a phone
 * number on a laptop that cannot dial, an address for a mail client that is
 * not the default. It says what it did, in place, for two seconds; a toast
 * would be a second object on a page that is a photograph of paper.
 */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          // No clipboard (insecure origin, denied permission): the value is
          // printed beside the button and can be selected by hand.
        }
      }}
      aria-label={copied ? `${label} copied` : `Copy ${label.toLowerCase()}`}
      className="shrink-0 cursor-pointer rounded-full border border-[#dce7f7]/30 bg-[#dce7f7]/[0.06] px-[0.75em] py-[0.35em] text-[clamp(0.44rem,0.62vw,0.56rem)] tracking-[0.2em] text-slate-200/85 uppercase transition-colors duration-300 outline-none hover:border-[#dce7f7]/70 hover:bg-[#dce7f7]/15 hover:text-white focus-visible:border-[#dce7f7]/70 motion-reduce:transition-none"
    >
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

/**
 * HOW IT WORKS: three stations on one drawn rule, in 05's diagram language --
 * a continuous line with a tick dropped at each stage and the book's one
 * chevron at the end -- rather than three boxes and arrows. It promises a
 * reply and nothing more: no response time.
 */
function HowItWorks({
  next,
}: {
  next: NonNullable<NonNullable<BookPage["contact"]>["next"]>;
}) {
  return (
    <section>
      <p className="text-[clamp(0.44rem,0.66vw,0.6rem)] tracking-[0.3em] text-slate-300/80 uppercase">
        {next.title}
      </p>
      <div aria-hidden className="mt-[1.3em] flex items-center gap-[0.35em]">
        <span className="h-px flex-1 bg-white/22" />
        <ArcArrow />
      </div>
      <ol className="grid grid-cols-3 gap-x-[clamp(0.8em,1.6vw,1.4em)]">
        {next.steps.map((step, i) => (
          <li key={step.title} className="relative pt-[1em]">
            <span
              aria-hidden
              className="absolute top-[-1px] left-0 block h-[9px] w-px bg-white/45"
            />
            <p className="font-[family-name:var(--font-display)] text-[clamp(1rem,1.6vw,1.45rem)] leading-none font-light text-[#dce7f7]/75 tabular-nums">
              {roman(i + 1)}
            </p>
            {/* 0.08em on a phone: at 0.22em "REACH OUT" and "WE REVIEW" broke
                one word to a line in a ~95px column. */}
            <p className="mt-[0.55em] text-[clamp(0.52rem,0.8vw,0.72rem)] tracking-[0.22em] whitespace-nowrap text-white uppercase portrait:tracking-[0.08em]">
              {step.title}
            </p>
            <p className="mt-[0.45em] text-[clamp(0.6rem,0.92vw,0.84rem)] leading-relaxed text-slate-300/70">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * The drop every page takes, on BOTH halves of its spread.
 *
 * One number for all seven, which it has not always been. It was 18% of the
 * page WIDTH -- an opener's sinkage, the classic device of starting a chapter
 * low on the page -- with 8% for 03 and 9% for 05 because those two print a
 * whole chapter on one spread and could not afford the air: 18% is 130px of
 * the 887 the sheet has, and at that drop 03's four slots divide 699px where
 * three stage rows and the chapter head need 801.
 *
 * Three drops is what the reader actually saw, though, and this page is
 * SCROLLED rather than turned: the head sat at 139px of the face on five
 * chapters, 70 on 05 and 62 on 03, so scrolling 02 -> 03 -> 04 jumped the
 * chapter opening 77px up the sheet and back down again. A book whose chapter
 * openings land at three different heights reads as three books, which is the
 * same argument that put every chapter on one type size.
 *
 * So the constrained chapter's value becomes the house value. It can only go
 * this way round -- 03 and 05 cannot be raised, they are measured to the pixel
 * -- and the five that come down gain 77px at the foot, which is air on pages
 * that were not short of anything. What was a concession for 03 is now simply
 * where a chapter starts.
 *
 * A CONTINUATION spread took its own drop, 7% rising to 11% at lg, on the
 * argument that it opens nothing and so should not take an opener's sinkage.
 * With one house drop there is nothing left for it to be an exception to, and
 * at 11% it would now start LOWER than the chapter it continues, which is the
 * wrong way round. Nothing exercises it either: only the catalogue is ever cut
 * across spreads and its five entries currently fit one. Folding it in gives a
 * continuation 23px MORE room than it had, so this cannot be the change that
 * overflows one when the catalogue grows back to two.
 */
// In portrait the drop is at LEAST the running head (<BookRunningHead>, pinned
// top-right, ~1.85rem tall) plus a hair (2.1rem: 40px against its 35 at
// 393x851; 2.35 pushed 03's phone verso 1px into its folio). 8% of a phone's width is 26-31px
// against a 26-35px running head, so a page whose first line runs the full
// measure -- 06's recto once it lost its head -- printed its rule under
// "VI -- TEAM". From ~800px wide the 8% is the larger and nothing moves.
const PAGE_SINKAGE = "pt-[8%] portrait:pt-[max(8%,2.1rem)]";

/**
 * Where every page's copy STOPS: a fixed gap above its drop folio.
 *
 * The folio is placed at 7% of the page's HEIGHT (3.5% in portrait) and the
 * page's bottom padding used to be 8% of its WIDTH. The two are different
 * numbers on every page, so any page that filled itself to the foot ran onto
 * the folio's line -- 04's colophon ended level with "IV", 02's last entry
 * 2px over "II" at 1280x720 -- and 03, 05, 06 and 01's footnote each carried
 * a private reservation to make up the difference.
 *
 * `cqh` is the page's own height (every face is a size container), so this is
 * the folio's own offset plus a line and a gap, in the folio's own terms. It
 * replaced all four reservations. 1.6rem is the folio line (~0.7rem) and its
 * clearance: at 1440x900 the copy stops at y=811 against a folio at 820.
 */
// Portrait's gap is 1.2rem, not 1.6: the folio line and half a line. 03's
// phone verso (a chapter head and three stages) ended 1px into its folio at
// 390x844 with the full 1.6 plus the running-head drop.
const PAGE_FOOT = "pb-[calc(7cqh+1.6rem)] portrait:pb-[calc(3.5cqh+1.2rem)]";

function VersoPage({
  page,
  flush = false,
}: {
  page: BookPage | BookSpread;
  /**
   * Portrait's own page: no spread inset.
   *
   * --verso-inset-start pulls a verso's type back inside the window, because
   * a sheet's back comes to rest spanning [spine - width, spine] and starts
   * off the left edge. A full-bleed sheet has its spine at x=0, so that
   * number is the whole page width and the copy would be set one screen to
   * the right of the screen. This page is a FRONT face there, so it wants
   * nothing but its own margin.
   */
  flush?: boolean;
}) {
  const inset = flush ? "11%" : "calc(11% + var(--verso-inset-start, 0px))";
  // A verso RESERVES THE THUMB INDEX only when it is a portrait page.
  //
  // On a spread this page is the left half and the index is pinned to the
  // window's right edge, an inch of paper and a gutter away. In portrait the
  // sheet is the whole screen, so the index floats over this page exactly as
  // it does over a recto -- and nothing reserved it: measured at 390x844,
  // 02's "…keep working as more people use them." ran to x=352 under numerals
  // that start at 330. `--page-index-inset` is published for whichever page
  // fills the sheet, which in this mode is this one.
  const endInset = flush
    ? "calc(11% + var(--page-index-inset, 0px))"
    : "11%";
  return (
    <div
      className={`relative flex h-full w-full flex-col justify-start text-slate-200 ${PAGE_SINKAGE} ${PAGE_FOOT}`}
      style={{ paddingInlineStart: inset, paddingInlineEnd: endInset }}
    >
      <FacingCopy page={page} />

      {/* THE FOOTNOTE, and only where this page is the whole sheet.
          It is set in the `[data-left-page]` layer on a spread -- the one page
          in the book that is not a sheet's back -- so a phone, whose verso IS
          a sheet, never printed it at all. 01 is the only chapter that has
          one, and its phone page ended at y=574 of 851 without it. `flush` is
          exactly the condition: this page is a front face filling the screen.
          mt-auto drops it at the foot, where a book puts an aside. */}
      {flush && page.facing?.note ? (
        <div data-ink className="mt-auto max-w-[42ch]">
          <span
            aria-hidden
            className="mb-[0.9em] block h-px w-[26%] bg-white/15"
          />
          <p className="text-[clamp(0.62rem,0.966vw,0.866rem)] leading-relaxed text-slate-200/90">
            <sup className="me-[0.4em] align-super text-[0.7em] tabular-nums">
              1
            </sup>
            {page.facing.note}
          </p>
        </div>
      ) : null}

      <p
        className="absolute bottom-[7%] portrait:bottom-[3.5%] text-[clamp(0.55rem,0.8vw,0.7rem)] tracking-[0.35em] text-slate-300/80 tabular-nums"
        style={{ insetInlineStart: inset }}
      >
        {roman(page.number)} &mdash; {page.title.toUpperCase()}
      </p>
      <FootMark end={endInset} />
    </div>
  );
}

/** A defined-terms list -- the letters of NIV, set against their meanings. */
function Terms({ page }: { page: BookPage }) {
  if (!page.terms) return null;
  return (
    // CENTRED, and the gaps taken out rather than the leading.
    //
    // The page used to run from the top with the mark hung off the foot by
    // `mt-auto`, which printed the three terms in the upper 55% and left a
    // 190px hole above the plate at 1440x900. Centring the column and letting
    // the mark sit under the ornament closes it without touching a line of
    // type: every `py` and `mt` below came down, and the leading did not.
    <div className="flex min-h-0 flex-1 flex-col justify-center">
      {page.termsTitle ? (
        <p
          data-ink
          className="mb-[1.3em] text-[clamp(0.6rem,1.035vw,0.855rem)] tracking-[0.35em] text-slate-200/90"
        >
          {page.termsTitle.toUpperCase()}
        </p>
      ) : null}
      <dl className="flex flex-col">
        {page.terms.map((term) => (
          <div
            key={term.letter}
            data-ink
            className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-[clamp(0.9em,1.6vw,1.5em)] border-t border-white/10 py-[0.7em] lg:py-[clamp(0.45em,calc(4.6vh-27.8px),0.85em)] [@media(min-aspect-ratio:17/10)_and_(max-height:880px)]:py-[0.45em]"
          >
            {/* The letter is the artwork on this page -- same silver as the
                lit page edge in the frame, so it reads as pressed into the
                paper rather than typed onto it. */}
            {/* THE LETTER BESIDE ITS WORD: its own column, one width for all
                three (1em of the letter's own size, centred), so N, I and V
                sit in one column and "Novel", "Intelligent" and "Visionary"
                start on one line beside them. The column was 1.4em of the
                BODY size -- 22px -- and a 50px N ran straight into "Novel". */}
            <dt className="w-[1em] text-center font-[family-name:var(--font-display)] text-[clamp(1.6rem,3.45vw,3.192rem)] leading-none font-light text-[#dce7f7]">
              {term.letter}
            </dt>
            <dd>
              <p className="mb-[0.4em] text-[clamp(0.85rem,1.438vw,1.254rem)] leading-none text-white">
                {term.term}
              </p>
              <p className="text-[clamp(0.72rem,1.15vw,1.049rem)] leading-relaxed text-slate-200/90 lg:leading-[1.7] [@media(min-aspect-ratio:17/10)_and_(max-height:880px)]:leading-relaxed">
                {term.body}
              </p>
              {/* The second line is the reason behind the first, so it is set
                  a shade quieter and in the display italic, the way a book
                  sets a gloss under a definition. */}
              {term.detail ? (
                <p className="mt-[0.35em] font-[family-name:var(--font-display)] text-[clamp(0.74rem,1.12vw,1.02rem)] leading-relaxed text-slate-200/90 italic lg:leading-[1.6]">
                  {term.detail}
                </p>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
      {page.termsFoot ? (
        <p
          data-ink
          className="mt-[1em] border-t border-white/10 pt-[0.9em] text-[clamp(0.7rem,1.092vw,1.003rem)] tracking-[0.02em] text-slate-200/90"
        >
          {page.termsFoot}
        </p>
      ) : null}
      {page.terms ? (
        <div data-ink className="mt-[1.2em]">
          {/* Tailpiece: the ornament that closes a chapter's text. */}
          <Ornament className="w-[30%] text-slate-300" />
        </div>
      ) : null}
    </div>
  );
}

/*
 * THE DROP FOLIO SITS LOWER ON A PORTRAIT PAGE, and that is what bought the
 * bigger type its last 26px.
 *
 * 7% is of the page's HEIGHT, which on a spread puts the folio 62px up from a
 * foot the body never reaches -- every page there stops short of its own
 * padding. A portrait page does not: it is the whole screen, the body's own
 * padding is 8% of its WIDTH (31px, not 45), and the two overlap. Measured at
 * 393x851 with the phone type at 19px, 02's first page ended 4px INTO the
 * folio. At 3.5% the folio is 30px lower, the body clears it by 26, and no
 * word moved.
 *
 * It cannot be paid for at the top instead: 02's entries are a grid of equal
 * rows filling the face, so taking 15px off the drop only makes the rows
 * taller and the last line lands where it did -- measured, 2px of the 15.
 */
function PageFoot({ page }: { page: BookPage }) {
  return (
    <div
      data-ink
      className="absolute inset-x-0 bottom-[8%] flex justify-start ps-[12%]"
    >
      <p className="text-[clamp(0.55rem,0.8vw,0.7rem)] tracking-[0.35em] text-slate-300/80 tabular-nums">
        {roman(page.number)} &mdash; {page.title.toUpperCase()}
      </p>
    </div>
  );
}

function PageBody({ page }: { page: BookPage | BookSpread }) {
  return (
    // --page-index-inset reserves the thumb index. It is measured rather than
    // guessed, and it lives on the recto only, because <BookIndex> is pinned to
    // the WINDOW's right edge -- the fore-edge -- and the recto is the page
    // under it. See the note where layoutSheets computes it.
    <div
      // 11% at the gutter and 9% at the fore-edge. It was 10/10, went to 13/7
      // when the left margin was widened, and came back to 11/9 when that read
      // as too much everywhere except the opening spread -- which keeps its
      // 13% (see the facing layer). The pair always sums to 20, so the measure
      // is the same at every setting and no line rewraps. The 9% is also
      // RECTO_END_MARGIN in layoutSheets, which reserves the thumb index
      // against it; the two numbers are one number.
      className={`flex h-full w-full flex-col ps-[11%] pe-[calc(9%+var(--page-text-inset-end,0px)+var(--page-index-inset,0px))] text-slate-200 ${
        // Both halves of a spread take the same drop, so their first lines sit
        // on one line across the gutter. See PAGE_SINKAGE.
        page.facing
          ? `justify-start ${PAGE_SINKAGE} ${PAGE_FOOT}`
          : `justify-center pt-[8%] ${PAGE_FOOT}`
      }`}
    >
      {page.services?.length ? (
        <ServicesPage page={page} />
      ) : page.steps?.length ? (
        <>
          <StepList steps={page.steps} from={page.facing?.steps?.length ?? 0} />
          {/* The recto's plate. A procedure spread runs its list down the
              verso and off the recto halfway, so the picture goes in what is
              left rather than under copy that reaches the foot. */}
          {page.plate ? <EngravedPlate plate={page.plate} beside /> : null}
        </>
      ) : (page as BookPage).team ? (
        <TeamPage team={(page as BookPage).team!} />
      ) : page.contact ? (
        <ContactPage page={page} />
      ) : page.terms ? (
        <Terms page={page} />
      ) : (
        <div data-ink>
          <p className="mb-3 text-[clamp(0.6rem,0.9vw,0.75rem)] tracking-[0.35em] text-slate-200/90 tabular-nums">
            {roman(page.number)} &mdash; {page.title.toUpperCase()}
          </p>
          <h2 className="mb-[0.4em] font-[family-name:var(--font-display)] text-[clamp(1.9rem,4vw,3.9rem)] leading-[1.03] font-light text-white">
            {page.title}
          </h2>
          {page.body ? (
            <p className="max-w-[34ch] text-[clamp(0.8rem,1.15vw,1.05rem)] leading-relaxed text-slate-300/90">
              {page.body}
            </p>
          ) : null}
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
      )}

      {/* Drop folio, flush with this page's outside margin -- the right. */}
      {/* The folio on an opener; on every right page, opener or not, the
          home mark just past it. A continuation page prints no number, so the
          folio box is empty there and the mark stands on its line alone. */}
      <p
        data-ink
        className="absolute bottom-[7%] portrait:bottom-[3.5%] end-[calc(10%+var(--page-text-inset-end,0px)+var(--page-index-inset,0px))] min-h-[1em] text-[clamp(0.55rem,0.8vw,0.7rem)] tracking-[0.3em] text-slate-300/80 tabular-nums"
      >
        {page.facing ? roman(page.number) : null}
        {/* The home mark, just AFTER the folio on the same line, in the
            margin past the column's end (asked: "right of the page number"). */}
        <HomeMark side="right" />
      </p>
    </div>
  );
}

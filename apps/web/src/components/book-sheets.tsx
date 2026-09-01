"use client";

import {
  FRAME_COUNT,
  FRAME_SRC,
  FRAME_W,
  LETTERBOX,
  PAPER_EDGE_BAND,
  type Tier,
  finalFrameRect,
  spreadAt,
} from "@/components/book-camera";
import { Emblem } from "@/components/book-emblems";
import {
  BOOK_PAGES,
  BOOK_SPREADS,
  PAGE_SLOTS,
  type BookPage,
  type BookSpread,
  type PageFigure,
  type PagePlate,
  type PageService,
  type PageStep,
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

/**
 * Put the sheets on the book, and point each face at the part of the
 * photograph it is covering.
 *
 * Called on ScrollTrigger's refresh rather than on raw resize: while pinned,
 * GSAP writes explicit pixel dimensions onto the section, so a resize handler
 * reads the stale pinned size and the fresh one only lands on the next refresh.
 */
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
  const visible = width - right.x;
  const fullBleed = visible < right.width * 0.6 || visible < 320;

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
  // whole window, so on a portrait phone there is no left page to print on and
  // the copy moves inline instead; the two are mutually exclusive.
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
  for (const inline of stage.querySelectorAll<HTMLElement>(
    "[data-facing-inline]",
  )) {
    inline.style.display = fullBleed ? "" : "none";
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
  // How far each page runs past its side of the window, so the type can be
  // pulled back inside without moving the paper. The right page overhangs to
  // the right; the left page starts off the left edge.
  stage.style.setProperty(
    "--page-text-inset-end",
    `${Math.max(0, sheetRect.x + sheetRect.width - width)}px`,
  );
  stage.style.setProperty(
    "--facing-inset-start",
    `${Math.max(0, -left.x)}px`,
  );

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
  // The printed border's inset from the page edge. In px off the page's WIDTH,
  // not a percentage per side: a percentage resolves against a different axis
  // top-to-bottom than left-to-right, so on a 674x762 page a flat "5.5%" would
  // sit 37px in at the sides and 42px in at head and foot, and a rule box that
  // is not an even distance from the edge all the way round reads as crooked.
  // The page's own size, for anything that has to be sized against the PAGE
  // rather than the viewport. The two stopped being interchangeable when the
  // camera learned to settle: a page is now 674x762 inside a 1440x900 window,
  // so a plate at 20vw is 43% of the page's width rather than the ~36% it was
  // drawn for, and it pushed its own caption through the bottom rule.
  stage.style.setProperty("--page-w", `${Math.round(sheetRect.width)}px`);
  stage.style.setProperty("--page-h", `${Math.round(sheetRect.height)}px`);

  const ruleInset = Math.round(sheetRect.width * 0.055);
  stage.style.setProperty("--page-rule-inset", `${ruleInset}px`);

  // The OUTER inset is bigger than the inner one, and not for taste.
  //
  // A page rect reaches past the paper by PAPER_EDGE_BAND of source px -- that
  // is the lit edge of the page block in the photograph. Inset the same 36px
  // all round, the outer side of the rule lands INSIDE that silver band and is
  // swallowed by it: scanning a row of the render at 1440x900, the verso's
  // outer rule sat at x=53 inside a band running x=46..70 and simply could not
  // be seen, while the other three sides were fine.
  //
  // So the outer side gives the band back first and then takes the same margin
  // as the spine, which puts an equal ~36px of PAPER on all four sides of every
  // page -- which is what "the same border on both pages" actually means here.
  const edgeBand = Math.round(PAPER_EDGE_BAND * (frame.width / FRAME_W));
  stage.style.setProperty("--page-rule-outer", `${ruleInset + edgeBand}px`);

  // And the same again for a verso printed on a sheet's BACK, which is a
  // further correction. A sheet is the RIGHT page's width; the photographed
  // left page is wider (955 source px against 927, 20 CSS px here), so a
  // sheet's back covers the left page but stops short of its outer edge. Left
  // uncorrected, one spread carried three borders in three positions.
  stage.style.setProperty(
    "--page-rule-outer-verso",
    `${Math.max(ruleInset, ruleInset + edgeBand - Math.max(0, left.width - sheetRect.width))}px`,
  );

  const indexEl = section.querySelector<HTMLElement>("[data-book-index]");
  const indexWidth = indexEl
    ? width - indexEl.getBoundingClientRect().left
    : 0;
  // Air between the last character and the notch. At 0 they touch and the type
  // reads as running into the tabs even though it no longer overlaps them.
  const INDEX_GUTTER = 18;
  const pageRight = Math.min(width, sheetRect.x + sheetRect.width);
  stage.style.setProperty(
    "--page-index-inset",
    `${Math.max(0, pageRight - sheetRect.width * 0.1 - (width - indexWidth - INDEX_GUTTER))}px`,
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

/** The turnable sheets, stacked on the book's right-hand page. */
export function BookSheets() {
  // Index 0 by definition: only the first page can have a facing page, because
  // every later left-hand page is the back of an already-turned sheet.
  const opening = BOOK_SPREADS[0];

  return (
    <div
      data-stage
      className="absolute inset-0"
      style={{ perspective: "2200px" }}
    >
      {opening?.facing ? (
        <div
          data-left-page
          className="absolute z-[5] overflow-hidden"
          style={{ display: "none" }}
        >
          {/* overflow-hidden is safe HERE and nowhere else in this file: this
              page never turns and carries no 3D transform, so clipping it does
              not flatten anything. The sheets must never have it -- see the
              note in CLAUDE.md about grouping properties.

              It is also load-bearing rather than tidy. Once the camera settles,
              the page is 762px tall instead of 900, and 01's footnote ran off
              the bottom and printed on the bare ground under the book. */}
          {/* The true left page, not a sheet's back: it is the full width
              of the photographed verso, so it takes the uncorrected outer. */}
          <PageRule outer="start" />
          <div className="flex h-full w-full flex-col justify-start pt-[7%] pb-[7%] pe-[12%] lg:pt-[11%] ps-[calc(10%+var(--facing-inset-start,0px))] text-slate-200">
            <FacingCopy page={opening} />

            {/* Footnote. Behind a short rule at the foot of the page, which is
                where a book puts an aside it does not want interrupting the
                paragraph. mt-auto drops it there however long the text above
                turns out to be. */}
            {opening.facing?.note ? (
              <div data-ink className="mt-auto mb-[9%] max-w-[42ch]">
                <span
                  aria-hidden
                  className="mb-[0.9em] block h-px w-[26%] bg-white/15"
                />
                <p className="text-[clamp(0.62rem,0.84vw,0.76rem)] leading-relaxed text-slate-400/65">
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
            style={{ bottom: "calc(var(--page-rule-inset, 5.5%) + 1.9em)" }}
            className="absolute start-[calc(10%+var(--facing-inset-start,0px))] text-[clamp(0.55rem,0.8vw,0.7rem)] tracking-[0.35em] text-slate-400/40"
          >
            NIVLAK
          </p>
        </div>
      ) : null}

      {BOOK_SPREADS.map((page, index) => (
        <div
          key={`${page.number}-${index}`}
          data-sheet
          className="absolute origin-left [transform-style:preserve-3d] [will-change:transform]"
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
/**
 * The printed border: one hairline box on every page.
 *
 * A ruled border is INK -- the thing a printer put on the paper -- which is why
 * it is allowed here when a drawn gutter shadow or edge highlight is not. Those
 * would be a second copy of something the photograph already has, and would
 * drift out of agreement with it on resize. This has no counterpart in the
 * frame at all.
 *
 * It is drawn on the face rather than around the text so that both halves of a
 * spread carry the same box whatever is printed inside them -- including the
 * pages that are nearly empty, where the border is most of what says the page
 * is a page.
 */
/**
 * Which side of this face is the book's OUTER edge -- the fore-edge.
 *
 * "start" for anything that lands on the left of the spread, "end" for the
 * right. It is stated rather than derived because a turned sheet's back is
 * mirrored and the obvious derivation gets it backwards: the face carries
 * rotateY(180deg), so you would expect its start edge to come to rest on the
 * screen's right -- and measured, it does not. With start=36 the turned verso's
 * rule landed at x=73, i.e. start resolved to the screen's LEFT. The rotation
 * is about the element's own centre, so the visual box maps start back onto the
 * left. Measurement over reasoning.
 */
function PageRule({
  outer,
  verso = false,
}: {
  outer: "start" | "end";
  /** Printed on a sheet's back, which is narrower than the page it covers. */
  verso?: boolean;
}) {
  const outerInset = verso
    ? "var(--page-rule-outer-verso, var(--page-rule-inset, 5.5%))"
    : "var(--page-rule-outer, var(--page-rule-inset, 5.5%))";
  const inner = "var(--page-rule-inset, 5.5%)";
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute border border-white/25"
      style={{
        insetBlock: inner,
        insetInlineStart: outer === "start" ? outerInset : inner,
        insetInlineEnd: outer === "end" ? outerInset : inner,
      }}
    />
  );
}

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
      <PageRule
        outer={side === "back" ? "start" : "end"}
        verso={side === "back"}
      />
      {children}
      <div
        data-shade
        className="pointer-events-none absolute inset-0 bg-black opacity-0"
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
    <figure data-ink className="mt-[2.2em] max-w-[42ch]">
      <svg
        viewBox="0 0 320 30"
        aria-hidden="true"
        focusable="false"
        className="w-full text-slate-300"
        fill="none"
      >
        <path d="M8 11h304" stroke="currentColor" strokeWidth="1" opacity="0.26" />
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
              <circle cx={x} cy="11" r="3.3" fill="currentColor" opacity="0.75" />
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
            <p className="text-[clamp(0.66rem,0.9vw,0.82rem)] leading-none text-slate-200">
              {step.label}
            </p>
            <p className="mt-[0.45em] text-[clamp(0.52rem,0.72vw,0.64rem)] tracking-[0.16em] text-slate-400/55">
              {step.note}
            </p>
          </div>
        ))}
      </div>
      <figcaption className="mt-[1.3em] text-[clamp(0.52rem,0.74vw,0.64rem)] tracking-[0.26em] text-slate-400/45">
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
  epigraph?: string;
}) {
  return (
    // NOT min-h-0. A flex item with its automatic minimum removed can be
    // shrunk below its own content, and once the settle cut the page from 900px
    // to 762px the opening verso no longer fit -- so the head collapsed and its
    // epigraph printed on top of the subtitle under it. `shrink-0` keeps the
    // head at its content height and lets the page overflow instead, which the
    // face clips; type over type is the worse failure by far.
    <div data-ink className="shrink-0 self-start">
      {/* Headpiece: the ornament that fills the blank at a chapter's head. */}
      <Ornament className="mb-[0.9em] w-[38%] text-slate-300" />
      <div className="flex items-baseline gap-[0.7em]">
        <span
          aria-hidden
          className="font-[family-name:var(--font-display)] text-[clamp(2.2rem,4.4vw,4.4rem)] leading-[0.8] font-light text-[#dce7f7]/85 tabular-nums"
        >
          {page.number}
        </span>
        <span className="text-[clamp(0.56rem,0.82vw,0.68rem)] leading-none tracking-[0.42em] text-slate-400/80">
          {page.title.toUpperCase()}
        </span>
      </div>
      <h2 className="mt-[0.3em] font-[family-name:var(--font-display)] text-[clamp(1.5rem,3vw,3rem)] leading-[1.03] font-light text-balance text-white">
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
  if (!page.facing) return null;
  const { headline, subtitle, intro, epigraph, note, figure } = page.facing;
  const spread = page as Partial<BookSpread>;
  const from = spread.servicesFrom ?? 0;

  // A continuation spread's verso is more of the catalogue, not the start of
  // anything, so it takes NONE of the opener devices -- no headpiece, no
  // chapter title, no epigraph. Printing a chapter title again on the second
  // spread of the same chapter is the thing a book never does.
  if (spread.continued) {
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

  return (
    <>
      <ChapterHead page={page} headline={headline} epigraph={epigraph} />

      {/* Guarded: an opener set with an epigraph and no subtitle -- which is
          what a chapter title page is -- otherwise printed an empty paragraph
          and its margin, dropping everything below it by a line for nothing. */}
      {subtitle ? (
        <p
          data-ink
          className="mt-[1em] max-w-[30ch] text-[clamp(0.82rem,1.18vw,1.05rem)] leading-relaxed text-balance text-slate-300/85"
        >
          {subtitle}
        </p>
      ) : null}

      {intro ? (
        <p
          data-ink
          className="mt-[1.6em] max-w-[44ch] text-[clamp(0.76rem,1.02vw,0.94rem)] leading-relaxed text-slate-300/75 first-letter:float-left first-letter:me-[0.08em] first-letter:mt-[0.04em] first-letter:text-[3.4em] first-letter:leading-[0.82] first-letter:font-light first-letter:text-[#dce7f7]"
        >
          <span className="[font-variant-caps:all-small-caps] tracking-[0.08em] text-slate-200">
            {intro.lead}
          </span>
          {note ? (
            <sup className="ms-[0.15em] text-[0.62em] align-super text-slate-400/70 tabular-nums">
              1
            </sup>
          ) : null}{" "}
          {intro.body}
        </p>
      ) : null}

      {figure ? <Figure figure={figure} /> : null}

      {/* An illustrated catalogue sets its entries full measure and starts
          them straight under the subtitle; an engraved one hangs its lead
          plate off the foot of the page. Both are catalogues, but only the
          second has a blank lower half to hang anything in. */}
      {isIllustrated(page.facing.services) ? null : page.facing.services?.[0] ? (
        <div className="mt-[1.4em] lg:mt-auto lg:mb-[7%]">
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
      {page.founder ? <Portrait founder={page.founder} /> : null}
      {page.contact && !page.facing.plate ? (
        <MarkPlate caption="NIVLAK TECHNOLOGIES" />
      ) : null}
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
const ROMAN_PARTS: [number, string][] = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
  [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
  [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];
function roman(n: number) {
  let rest = n;
  let out = "";
  for (const [value, numeral] of ROMAN_PARTS) {
    while (rest >= value) {
      out += numeral;
      rest -= value;
    }
  }
  return out;
}

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
            className="w-[clamp(58px,calc(var(--page-w,796px)*0.13),126px)] shrink-0 text-slate-200"
          />
        ) : null}
        <div className="pt-[0.2em]">
          <p className="mb-[0.55em] text-[clamp(0.5rem,0.7vw,0.62rem)] tracking-[0.34em] text-slate-400/55">
            PLATE {roman(1)}
          </p>
          <p className="font-[family-name:var(--font-display)] text-[clamp(1.1rem,1.75vw,1.6rem)] leading-tight font-light text-white">
            {service.title}
          </p>
          <p className="mt-[0.5em] max-w-[30ch] text-[clamp(0.7rem,0.96vw,0.88rem)] leading-relaxed text-slate-300/75">
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
      className={`flex min-h-0 items-center gap-[clamp(1em,2.4vw,2.4em)] self-center ${
        plateOnTheRight ? "flex-row-reverse" : ""
      }`}
    >
      {service.image ? <ServicePlate image={service.image} /> : null}
      <div className="min-w-0 flex-1">
        <p className="mb-[0.5em] text-[clamp(0.5rem,0.68vw,0.6rem)] tracking-[0.34em] text-slate-400/60">
          {roman(index + 1)}
        </p>
        <p className="font-[family-name:var(--font-display)] text-[clamp(0.9rem,1.32vw,1.22rem)] leading-tight font-light text-balance text-white">
          {service.title}
        </p>
        {service.body ? (
          <p className="mt-[0.5em] text-[clamp(0.64rem,0.88vw,0.8rem)] leading-relaxed text-slate-300/75">
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
      className="w-[32%] shrink-0 select-none lg:w-[42%]"
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
  // A grid of PAGE_SLOTS equal rows filling the page, NOT a flex column with a
  // gap. The gap version packed the entries against the top and left a third of
  // every page blank at the foot -- and because a chapter opening spends its
  // first slot on the head, the verso's entries then sat at different heights
  // from the recto's, so nothing lined up across the gutter. On equal rows they
  // line up by construction and the page fills itself.
  return (
    <div
      className="grid h-full min-h-0 flex-1"
      // Auto-placement does the offsetting: with a head present it takes row 1
      // and the entries follow into rows 2 and 3; without one they start at row
      // 1. No explicit row numbers, so adding a slot changes one constant.
      style={{ gridTemplateRows: `repeat(${PAGE_SLOTS}, minmax(0, 1fr))` }}
    >
      {head}
      {services.map((service, i) => (
        <ServiceEntry key={service.title} service={service} index={from + i} />
      ))}
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
          className={`flex flex-col border-t border-white/12 py-[1.15em] lg:py-[1.45em] ${
            i % 2 === 0 ? "pe-[1.4em]" : "border-s ps-[1.4em]"
          }`}
        >
          {service.emblem ? (
            <Emblem
              name={service.emblem}
              className="mb-[0.8em] w-[clamp(34px,calc(var(--page-w,796px)*0.072),58px)] text-slate-300"
            />
          ) : null}
          <p className="mb-[0.55em] text-[clamp(0.52rem,0.7vw,0.62rem)] tracking-[0.34em] text-slate-400/70">
            {roman(from + i + 1)}
          </p>
          <p className="text-[clamp(0.72rem,1.02vw,0.92rem)] leading-tight text-white">
            {service.title}
          </p>
          <p className="mt-[0.45em] text-[clamp(0.62rem,0.86vw,0.78rem)] leading-relaxed text-slate-300/70">
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
  if (!page.services?.length) return null;
  // Where this page's entries sit in the CHAPTER's run: what the spread starts
  // at, plus whatever its own verso already used. On an engraved chapter there
  // is no offset to carry and servicesFrom is 0, so this is the count it always
  // was.
  const spread = page as Partial<BookSpread>;
  const from = (spread.servicesFrom ?? 0) + (page.facing?.services?.length ?? 0);
  const illustrated = isIllustrated(page.services);
  return (
    <>
      {illustrated ? (
        <ServiceEntries services={page.services} from={from} />
      ) : (
        <ServiceGrid services={page.services} from={from} />
      )}
      {/* Tailpiece, closing the catalogue the way 01 closes its text -- but
          only where the catalogue actually ends. On the first of two spreads
          the run carries on over the page, and an ornament there would sign
          off a chapter that has not finished.

          Not on the illustrated pages: their entries fill a grid that is the
          whole height of the page, so there is no foot to put an ornament in --
          and since every page now carries a printed border, the ornament has
          nothing left to do there anyway. */}
      {!illustrated && (spread.lastOfChapter ?? true) ? (
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
            <p className="mb-[0.3em] text-[clamp(0.46rem,0.62vw,0.55rem)] tracking-[0.32em] text-slate-400/60">
              {roman(from + i + 1)}
            </p>
            <p className="text-[clamp(0.72rem,1vw,0.9rem)] leading-tight text-white">
              {service.title}
            </p>
            {service.body ? (
              <p className="mt-[0.3em] max-w-[32ch] text-[clamp(0.62rem,0.84vw,0.76rem)] leading-relaxed text-slate-300/70">
                {service.body}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The mark, struck at the foot of a page that would otherwise trail off. */
function MarkPlate({ caption = "THE MARK" }: { caption?: string }) {
  return (
    <figure
      data-ink
      className="mt-auto mb-[8%] flex items-center gap-[1.1em]"
    >
      <img
        src="/logo-mark.webp"
        alt=""
        aria-hidden="true"
        width={192}
        height={192}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="h-auto w-[clamp(56px,7vw,96px)] opacity-90 select-none"
      />
      <figcaption className="text-[clamp(0.5rem,0.72vw,0.62rem)] tracking-[0.32em] text-slate-400/45">
        {caption}
      </figcaption>
    </figure>
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
          ? "mt-auto mb-[9%] flex items-end gap-[1.4em] pt-[1.6em]"
          : "mt-auto mb-[5%] w-[clamp(130px,calc(var(--page-w,796px)*0.32),290px)]"
      }
    >
      <div
        role="img"
        aria-label={plate.caption}
        className={`opacity-80 ${
          beside ? "w-[clamp(100px,12.3vw,176px)] shrink-0" : "w-full"
        }`}
        style={{
          aspectRatio: plate.ratio,
          // Capped against the PAGE, so a tall plate cannot run its caption
          // through the foot rule. maskSize:contain means the drawing simply
          // sits smaller inside the box rather than being cropped.
          maxHeight: "calc(var(--page-h, 900px) * 0.24)",
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
        } as React.CSSProperties}
      />
      <figcaption className={beside ? "pb-[0.4em]" : "mt-[0.9em]"}>
        <p className="text-[clamp(0.52rem,0.72vw,0.64rem)] tracking-[0.28em] text-slate-400/55">
          {plate.caption.toUpperCase()}
        </p>
        <p className="mt-[0.45em] text-[clamp(0.5rem,0.66vw,0.58rem)] tracking-[0.06em] text-slate-400/35 italic">
          {plate.credit}
        </p>
      </figcaption>
    </figure>
  );
}

/**
 * The founder's plate.
 *
 * A book prints a portrait as a plate with a keyline and the sitter's name
 * under it, so that is the frame. There is no photograph in the repo yet:
 * until `founder.portrait` points at one under public/, the keyline holds an
 * empty ground with the mark in it, which is a plate awaiting its cut rather
 * than a broken image.
 */
function Portrait({
  founder,
}: {
  founder: NonNullable<BookPage["founder"]>;
}) {
  return (
    <figure data-ink className="mt-auto mb-[6%] lg:mt-auto">
      <div className="relative w-[clamp(120px,15vw,200px)] border border-white/15 p-[6px]">
        <div className="relative aspect-[4/5] w-full overflow-hidden bg-white/[0.03]">
          {founder.portrait ? (
            <img
              src={founder.portrait}
              alt={`${founder.name}, ${founder.role}`}
              draggable={false}
              className="h-full w-full object-cover select-none"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center">
              <img
                src="/logo-mark.webp"
                alt=""
                aria-hidden="true"
                width={192}
                height={192}
                draggable={false}
                className="h-auto w-[42%] opacity-25 select-none"
              />
            </span>
          )}
        </div>
      </div>
      <figcaption className="mt-[0.9em]">
        <p className="font-[family-name:var(--font-display)] text-[clamp(1.05rem,1.55vw,1.45rem)] leading-tight font-light text-white">
          {founder.name}
        </p>
        <p className="mt-[0.35em] text-[clamp(0.52rem,0.72vw,0.64rem)] tracking-[0.32em] text-slate-400/70">
          {founder.role.toUpperCase()}
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
            <p className="mb-[0.35em] text-[clamp(0.5rem,0.68vw,0.6rem)] tracking-[0.34em] text-slate-400/60 tabular-nums">
              {String(from + i + 1).padStart(2, "0")}
            </p>
            <p className="text-[clamp(0.78rem,1.08vw,0.98rem)] leading-tight text-white">
              {step.title}
            </p>
            <p className="mt-[0.4em] max-w-[34ch] text-[clamp(0.64rem,0.88vw,0.8rem)] leading-relaxed text-slate-300/75">
              {step.body}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * The founder spread's right-hand page: the bio, then the principles.
 *
 * The portrait belongs on the verso beside the heading, so this page is prose
 * against a ruled list. The principles are numbered and ruled rather than
 * bulleted, because a book does not use bullets.
 */
function FounderPage({ page }: { page: BookPage }) {
  const founder = page.founder;
  if (!founder) return null;
  return (
    <>
      {founder.bio.map((paragraph, i) => (
        <p
          key={paragraph.slice(0, 24)}
          data-ink
          className={`max-w-[36ch] text-[clamp(0.7rem,0.98vw,0.9rem)] leading-relaxed text-slate-300/80 ${
            i ? "mt-[1em]" : ""
          }`}
        >
          {paragraph}
        </p>
      ))}
      <p
        data-ink
        className="mt-[1.8em] mb-[0.5em] text-[clamp(0.52rem,0.72vw,0.64rem)] tracking-[0.34em] text-slate-400/70"
      >
        {founder.principlesTitle.toUpperCase()}
      </p>
      <ul className="flex flex-col">
        {founder.principles.map((principle, i) => (
          <li
            key={principle}
            data-ink
            className="flex items-baseline gap-[0.9em] border-t border-white/10 py-[0.62em]"
          >
            <span className="text-[clamp(0.5rem,0.66vw,0.58rem)] tracking-[0.2em] text-slate-400/50">
              {roman(i + 1)}
            </span>
            <span className="text-[clamp(0.72rem,1vw,0.9rem)] text-slate-200">
              {principle}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** The contact spread's right-hand page: the details, then the invitation. */
function ContactPage({ page }: { page: BookPage }) {
  const contact = page.contact;
  if (!contact) return null;
  const mail = contact.rows.find((r) => r.href?.startsWith("mailto:"))?.href;
  return (
    <>
      <ul className="flex flex-col">
        {contact.rows.map((row) => {
          const line = (
            <>
              <Emblem
                name={row.emblem}
                className="w-[clamp(16px,1.8vw,22px)] shrink-0 text-slate-300"
              />
              <span className="text-[clamp(0.72rem,1vw,0.92rem)] text-slate-200">
                {row.value}
              </span>
            </>
          );
          return (
            <li
              key={row.value}
              data-ink
              className="border-t border-white/10 py-[0.85em]"
            >
              {row.href ? (
                <a
                  href={row.href}
                  className="flex items-center gap-[0.9em] transition-colors duration-300 hover:text-white"
                >
                  {line}
                </a>
              ) : (
                <span className="flex items-center gap-[0.9em]">{line}</span>
              )}
            </li>
          );
        })}
      </ul>

      <div data-ink className="mt-[2em] border-t border-white/12 pt-[1.3em]">
        <p className="mb-[0.5em] text-[clamp(0.52rem,0.72vw,0.64rem)] tracking-[0.34em] text-slate-400/70">
          {contact.enquiryTitle.toUpperCase()}
        </p>
        <p className="max-w-[32ch] text-[clamp(0.72rem,1vw,0.92rem)] leading-relaxed text-slate-300/80">
          {contact.enquiryBody}
        </p>
        <a
          href={mail ?? "#"}
          className="group mt-[1.2em] inline-flex items-center gap-[0.8em] border-b border-white/25 pb-[0.4em] text-[clamp(0.6rem,0.82vw,0.74rem)] tracking-[0.26em] text-white transition-colors duration-300 hover:border-white/60"
        >
          {contact.cta.toUpperCase()}
          <span
            aria-hidden
            className="transition-transform duration-300 group-hover:translate-x-[0.25em]"
          >
            &rarr;
          </span>
        </a>
      </div>
    </>
  );
}

function VersoPage({ page }: { page: BookPage | BookSpread }) {
  // Sinkage is an opener device: a chapter's first page starts low, and both
  // halves of that spread take the same drop so their first lines sit on one
  // line across the gutter. A continuation spread opens nothing, so it starts
  // where any ordinary page does and gets the space back for entries.
  const continued = (page as Partial<BookSpread>).continued === true;
  return (
    <div
      className={`relative flex h-full w-full flex-col justify-start pb-[8%] pe-[12%] ps-[calc(10%+var(--verso-inset-start,0px))] text-slate-200 ${
        continued ? "pt-[6%] lg:pt-[8%]" : "pt-[7%] lg:pt-[11%]"
      }`}
    >
      <FacingCopy page={page} />
      <p
        style={{ bottom: "calc(var(--page-rule-inset, 5.5%) + 1.9em)" }}
        className="absolute start-[calc(10%+var(--verso-inset-start,0px))] text-[clamp(0.55rem,0.8vw,0.7rem)] tracking-[0.35em] text-slate-400/40 tabular-nums"
      >
        {page.number} &mdash; {page.title.toUpperCase()}
      </p>
    </div>
  );
}

/** A defined-terms list -- the letters of NIV, set against their meanings. */
function Terms({ page }: { page: BookPage }) {
  if (!page.terms) return null;
  return (
    <>
      {page.termsTitle ? (
        <p data-ink className="mb-[1.3em] text-[clamp(0.6rem,0.9vw,0.75rem)] tracking-[0.35em] text-slate-400/80">
          {page.termsTitle.toUpperCase()}
        </p>
      ) : null}
      <dl className="flex flex-col">
        {page.terms.map((term) => (
          <div
            key={term.letter}
            data-ink
            className="grid grid-cols-[1.4em_1fr] gap-x-[0.8em] border-t border-white/10 py-[0.9em]"
          >
            {/* The letter is the artwork on this page -- same silver as the
                lit page edge in the frame, so it reads as pressed into the
                paper rather than typed onto it. */}
            <dt className="font-[family-name:var(--font-display)] text-[clamp(1.6rem,3vw,2.8rem)] leading-none font-light text-[#dce7f7]">
              {term.letter}
            </dt>
            <dd>
              <p className="mb-[0.4em] text-[clamp(0.85rem,1.25vw,1.1rem)] leading-none text-white">
                {term.term}
              </p>
              <p className="max-w-[32ch] text-[clamp(0.72rem,1vw,0.92rem)] leading-relaxed text-slate-300/85">
                {term.body}
              </p>
            </dd>
          </div>
        ))}
      </dl>
      {page.termsFoot ? (
        <p
          data-ink
          className="mt-[1.4em] border-t border-white/10 pt-[1.1em] text-[clamp(0.7rem,0.95vw,0.88rem)] tracking-[0.02em] text-slate-400/75"
        >
          {page.termsFoot}
        </p>
      ) : null}
      {page.terms ? (
        <div data-ink className="mt-[1.8em]">
          {/* Tailpiece: the ornament that closes a chapter's text. */}
          <Ornament className="w-[30%] text-slate-300" />
        </div>
      ) : null}

      {/* The plate. A chapter's blank lower half is where a book puts a
          picture, and the recto has the most of it. The same mark that is
          embossed on the cover in the reveal, cut out of its photographic card
          so the page shows through the circuit grooves -- inlaid in the paper
          rather than pasted onto it. It sits on this page rather than the
          verso for two reasons: the space is here, and this page is also the
          full-bleed sheet a portrait phone gets, so the plate survives there
          instead of disappearing with the left-hand page. */}
      {page.terms ? (
        <figure
          data-ink
          className="mt-auto mb-[9%] flex items-center gap-[1.1em] pt-[2em]"
        >
          <img
            src="/logo-mark.webp"
            alt=""
            aria-hidden="true"
            width={192}
            height={192}
            loading="lazy"
            decoding="async"
            draggable={false}
            className="h-auto w-[clamp(74px,9.5vw,128px)] opacity-90 select-none"
          />
          <figcaption className="text-[clamp(0.5rem,0.72vw,0.62rem)] tracking-[0.32em] text-slate-400/45">
            THE MARK
          </figcaption>
        </figure>
      ) : null}
    </>
  );
}

function PageFoot({ page }: { page: BookPage }) {
  return (
    <div
      data-ink
      style={{ bottom: "calc(var(--page-rule-inset, 5.5%) + 1.9em)" }}
      className="absolute inset-x-0 flex justify-start ps-[12%]"
    >
      <p className="text-[clamp(0.55rem,0.8vw,0.7rem)] tracking-[0.35em] text-slate-400/45 tabular-nums">
        {page.number} &mdash; {page.title.toUpperCase()}
      </p>
    </div>
  );
}

function PageBody({ page }: { page: BookPage | BookSpread }) {
  const continued = (page as Partial<BookSpread>).continued === true;
  return (
    // --page-index-inset reserves the thumb index. It is measured rather than
    // guessed, and it lives on the recto only, because <BookIndex> is pinned to
    // the WINDOW's right edge -- the fore-edge -- and the recto is the page
    // under it. See the note where layoutSheets computes it.
    <div
      className={`flex h-full w-full flex-col ps-[10%] pe-[calc(10%+var(--page-text-inset-end,0px)+var(--page-index-inset,0px))] text-slate-200 ${
        // Sinkage: a chapter opener starts low on the page rather than centred,
        // and both halves of this spread take the same drop so their first
        // lines sit on one line across the gutter.
        page.facing
          ? `justify-start pb-[7%] ${
              continued ? "pt-[6%] lg:pt-[8%]" : "pt-[7%] lg:pt-[11%]"
            }`
          : "justify-center py-[8%]"
      }`}
    >
      {/* Portrait fallback. A full-bleed sheet is the whole window, so there is
          no facing page to print on and its copy is set above this page's own.
          layoutSheets decides which of the two is showing; they are never both
          on screen. */}
      {page.facing ? (
        <div
          data-facing-inline
          className="mb-[1.6em]"
          style={{ display: "none" }}
        >
          <FacingCopy page={page} />
        </div>
      ) : null}

      {page.services?.length ? (
        <ServicesPage page={page} />
      ) : page.steps?.length ? (
        <>
          <StepList
            steps={page.steps}
            from={page.facing?.steps?.length ?? 0}
          />
          {/* The recto's plate. A procedure spread runs its list down the
              verso and off the recto halfway, so the picture goes in what is
              left rather than under copy that reaches the foot. */}
          {page.plate ? <EngravedPlate plate={page.plate} beside /> : null}
        </>
      ) : page.founder ? (
        <FounderPage page={page} />
      ) : page.contact ? (
        <ContactPage page={page} />
      ) : page.terms ? (
        <Terms page={page} />
      ) : (
        <div data-ink>
          <p className="mb-3 text-[clamp(0.6rem,0.9vw,0.75rem)] tracking-[0.35em] text-slate-400/80 tabular-nums">
            {page.number} &mdash; {page.title.toUpperCase()}
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
      {page.facing ? (
        <p
          data-ink
          // Positioned off the RULE, not off the page. At bottom-[7%] the
          // folio landed within a pixel of the border and read as sitting on
          // the line rather than inside it.
          style={{
            bottom: "calc(var(--page-rule-inset, 5.5%) + 1.9em)",
          }}
          className="absolute end-[calc(10%+var(--page-text-inset-end,0px)+var(--page-index-inset,0px))] text-[clamp(0.55rem,0.8vw,0.7rem)] tracking-[0.3em] text-slate-400/40 tabular-nums"
        >
          {page.number}
        </p>
      ) : null}
    </div>
  );
}

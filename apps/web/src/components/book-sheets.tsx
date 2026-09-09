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
import {
  BOOK_PAGES,
  BOOK_SPREADS,
  PAGE_SLOTS,
  type BookPage,
  type BookSpread,
  type PageFigure,
  type PageMask,
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
            className={`flex h-full w-full flex-col justify-start pb-[8%] pe-[12%] ps-[calc(10%+var(--facing-inset-start,0px))] text-slate-200 ${PAGE_SINKAGE}`}
          >
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
                <p className="text-[clamp(0.62rem,0.966vw,0.866rem)] leading-relaxed text-slate-400/65">
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
            className="absolute bottom-[7%] start-[calc(10%+var(--facing-inset-start,0px))] text-[clamp(0.55rem,0.92vw,0.798rem)] tracking-[0.35em] text-slate-400/40"
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
            <p className="mt-[0.45em] text-[clamp(0.52rem,0.828vw,0.73rem)] tracking-[0.16em] text-slate-400/55">
              {step.note}
            </p>
          </div>
        ))}
      </div>
      <figcaption className="mt-[1.3em] text-[clamp(0.52rem,0.851vw,0.73rem)] tracking-[0.26em] text-slate-400/45">
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
    const { verso, rows } = stageHalves(BOOK_PAGES[plateChapter]?.services);
    return (
      <StageRun
        services={verso}
        from={0}
        rows={rows}
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
        <p
          data-ink
          className="mt-[1.6em] max-w-[44ch] text-[clamp(0.76rem,1.173vw,1.072rem)] leading-relaxed text-slate-300/75 first-letter:float-left first-letter:me-[0.08em] first-letter:mt-[0.04em] first-letter:text-[3.4em] first-letter:leading-[0.82] first-letter:font-light first-letter:text-[#dce7f7]"
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
        <div className="mt-[1em] flex min-h-0 items-start gap-[clamp(0.7em,1.6vw,1.5em)] [@media(max-height:480px)]:mt-[0.5em]">
          <PerspectiveIndex
            services={page.services ?? []}
            intro={subtitle}
          />
          {(page as BookPage).columnPlate ? (
            <PerspectiveColumn plate={(page as BookPage).columnPlate!} />
          ) : null}
        </div>
      ) : null}

      {/* The index of projects, on the half-title facing the stage. Same reason
          the perspectives' index reads page.services and not facing.services:
          the run belongs to the CHAPTER, and both halves of the spread need all
          four of it -- the verso to name them, the recto to hold the window. */}
      {isProjects(page.services) ? (
        <ProjectIndex services={page.services ?? []} />
      ) : null}

      {/* The chapter's qualification, on the half-title -- but ONLY below 480px
          of viewport height, where its twin at the foot of the stage cannot
          fit. Measured at 844x390: the recto there runs index 26 + plate 172 +
          category, title, metadata and action, and lands the colophon at y=379
          in a window whose bottom 45px are already off-screen. The verso at the
          same size is carrying a head, an epigraph and a subtitle in 390px and
          has the room, because its engraving has already gone (portrait
          collapses the spread and the plate is the one thing there carrying no
          information).

          The line saying these four are studies is the last thing in this
          chapter that may be dropped for space, which is why it moves pages
          rather than disappearing. */}
      {isProjects(page.services) && (page as BookPage).colophon ? (
        <div
          data-ink
          className="mt-[1.6em] hidden [@media(max-height:480px)]:block"
        >
          <span
            aria-hidden
            className="mb-[0.9em] block h-px w-[26%] bg-white/15"
          />
          <p className="text-[clamp(0.55rem,0.862vw,0.775rem)] leading-relaxed text-slate-400/60">
            {(page as BookPage).colophon}
          </p>
        </div>
      ) : null}

      {/* An illustrated catalogue sets its entries full measure and starts
          them straight under the subtitle; an engraved one hangs its lead
          plate off the foot of the page. Both are catalogues, but only the
          second has a blank lower half to hang anything in. */}
      {isIllustrated(page.facing.services) ? null : page.facing
          .services?.[0] ? (
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
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
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
            className="w-[clamp(70px,8.8vw,126px)] shrink-0 text-slate-200"
          />
        ) : null}
        <div className="pt-[0.2em]">
          <p className="mb-[0.55em] text-[clamp(0.5rem,0.805vw,0.707rem)] tracking-[0.34em] text-slate-400/55">
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
// The head slot, as a multiple of one stage row.
//
// Measured, not chosen. At 1440x900 the four slots have 699px between them; a
// stage row will not set below ~157 of those with its plate, its activities,
// its deliverable and its outcome all printed; and the chapter head with its
// description is 201 once the epigraph comes off. The three gaps come off the
// page first -- 1vh each, 27px -- so 744 is what the four slots divide:
// 201 + 3x181 = 744, and 201/181 = 1.11.
//
// Every one of those numbers was measured rather than chosen, and the spread
// is over-subscribed enough that all of them are load-bearing. At 1.2 the head
// had 187px and printed its last two lines through stage 01; at the opener's
// full sinkage the rows had 148 and needed 182, so every row printed its
// deliverable through its own activities.
const STAGE_HEAD_SLOT = 1.11;

/** The run split across the gutter. Derived, so a seventh stage rebalances. */
function stageHalves(services: PageService[] | undefined) {
  const entries = services?.filter((service) => service.stage) ?? [];
  const half = Math.ceil(entries.length / 2);
  const verso = entries.slice(0, half);
  const recto = entries.slice(half);
  return { entries, verso, recto, rows: Math.max(verso.length, recto.length) };
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
function StageRow({ service, index }: { service: PageService; index: number }) {
  const stage = service.stage!;
  const number = String(index + 1).padStart(2, "0");
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
      className="grid grid-cols-[auto_minmax(0,1fr)] content-start gap-x-[clamp(0.6em,1.3vw,1em)] gap-y-[0.3em] border-t border-white/12 pt-[0.55em] lg:gap-y-[0.75em] lg:pt-[1.1em]"
    >
      {/* The stage's own line: numeral and name at the leading edge, the plate
          number opposite. The plate number is set right because it belongs to
          the PICTURE and not to the stage -- the numeral has already numbered
          the stage, and printing IV beside 04 is one fact at two sizes. */}
      <div className="col-span-2 row-start-1 flex items-baseline justify-between gap-[0.8em]">
        <h3 className="flex min-w-0 items-baseline gap-[0.6em]">
          <span
            aria-hidden
            className="shrink-0 font-[family-name:var(--font-display)] text-[clamp(0.72rem,1.02vw,0.95rem)] leading-none font-light text-[#dce7f7]/80 tabular-nums"
          >
            {number}
          </span>
          <span className="truncate text-[clamp(0.52rem,0.72vw,0.64rem)] tracking-[0.28em] text-white uppercase">
            {service.title}
          </span>
        </h3>
        <p className="shrink-0 text-[clamp(0.44rem,0.58vw,0.52rem)] tracking-[0.26em] text-slate-400/45">
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
        className="col-start-1 row-span-2 row-start-2 h-full w-[70px] self-stretch object-cover object-center opacity-90 transition-opacity duration-300 ease-out select-none hover:opacity-100 lg:row-span-1 lg:h-auto lg:w-[clamp(80px,8.5vw,130px)] lg:self-start motion-reduce:transition-none"
      />

      <div className="col-start-2 row-start-2 flex min-w-0 flex-col">
        <h4 className="shrink-0 font-[family-name:var(--font-display)] text-[clamp(0.8rem,1.16vw,1.05rem)] leading-tight font-light text-balance text-[#dce7f7]">
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
        <ul className="mt-auto hidden shrink-0 flex-wrap items-baseline gap-x-[0.6em] gap-y-[0.15em] pt-[0.5em] text-[clamp(0.53rem,0.72vw,0.66rem)] leading-relaxed text-slate-300/60 lg:flex">
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
      <dl className="col-start-2 row-start-3 grid grid-cols-[auto_1fr] gap-x-[1em] gap-y-[0.15em] border-t border-white/18 pt-[0.4em] lg:col-span-2 lg:col-start-1 lg:gap-y-[0.45em] lg:pt-[0.75em]">
        <dt className="text-[clamp(0.44rem,0.58vw,0.52rem)] tracking-[0.24em] text-slate-400/70">
          DELIVERABLE
        </dt>
        <dd className="text-[clamp(0.62rem,0.86vw,0.8rem)] leading-tight text-white">
          {stage.deliverable}
        </dd>
        <dt className="text-[clamp(0.44rem,0.58vw,0.52rem)] tracking-[0.24em] text-slate-400/70">
          OUTCOME
        </dt>
        <dd className="text-[clamp(0.58rem,0.78vw,0.72rem)] leading-snug text-slate-300/75">
          {stage.outcome}
        </dd>
      </dl>
    </article>
  );
}

/**
 * The arc: the four words the six stages add up to, drawn as a drafting
 * diagram rather than written as a sentence.
 *
 * It is NOT the arc this chapter used to carry at its foot, which was the six
 * stage names run on with arrows -- that one was a restatement of the list
 * directly above it and went for that reason. These four are a level up from
 * the six: nothing else on the spread says that the whole procedure turns an
 * idea into growth, and no stage can, because each one only knows its own
 * link. Four abstract nouns against six named stages is a different claim, not
 * the same claim twice.
 *
 * Drawn with a hairline and a chevron per link, at the weight of a rule rather
 * than of type, because it is furniture: the reader should be able to take it
 * in without stopping on it. The connectors carry the flex, so the diagram
 * spans the measure at every width instead of clustering at the leading edge.
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
      className="h-[0.6em] w-[0.75em] shrink-0 text-slate-400/45"
    >
      <path d="M7.5 1.2 10.6 4 7.5 6.8" />
    </svg>
  );
}

function ProcessArc({ labels, note }: { labels: string[]; note?: string }) {
  if (!labels.length) return null;
  return (
    // The arc LEADS the slot and the note hangs off its foot, which is the
    // reverse of how this page was set for two revisions.
    //
    // It was the other way round on the argument that a running head for the
    // second half of the procedure belongs against the thing it heads, sitting
    // directly over stage 04's rule. This order is the more conventional one
    // and it costs nothing: a running head sits at the TOP of a page, level
    // with the ornament that opens the verso, so both pages now begin with a
    // horizontal device on the same line. It also moves the note to where it
    // is of most use -- immediately above the stages it qualifies rather than
    // five inches from them.
    //
    // What this slot may NOT have is the space at one end and the ink at the
    // other. See the note below for the 102px hole that taught that, and why
    // enlarging the note rather than moving it is what closed it.
    //
    // Hidden below `lg`, note and all. Down there the spread has collapsed
    // onto one sheet and the arc would sit between stage 03 and stage 04 --
    // a summary of six stages printed halfway down them -- for 28px this
    // page does not have. It is a device for a SPREAD, where it heads the
    // second page; a column has no second page to head.
    <div
      data-ink
      className="hidden min-h-0 flex-col pb-[1.1em] lg:flex"
    >
      <ol className="flex w-full list-none items-center p-0">
        {labels.map((label, i) => (
          <li
            key={label}
            className={`flex items-center ${i > 0 ? "min-w-0 flex-1" : "shrink-0"}`}
          >
            {i > 0 ? (
              <span
                aria-hidden
                className="mx-[0.55em] flex min-w-[1.1em] flex-1 items-center gap-[0.2em]"
              >
                <span className="h-px flex-1 bg-white/18" />
                <ArcArrow />
              </span>
            ) : null}
            <span className="shrink-0 text-[clamp(0.44rem,0.62vw,0.56rem)] tracking-[0.26em] text-slate-300/65 uppercase">
              {label}
            </span>
          </li>
        ))}
      </ol>
      {/* The chapter's qualification -- that a reader need not start at stage
          01 -- printed HERE and not on the verso, where it belongs by rights
          and where it was.

          The verso ran out of page: its head slot has ~220px and the chapter
          head takes 189 of them. Hung off the FOOT of this slot it also lands
          where it is of most use -- immediately above the stages it qualifies,
          and at the reader halfway through the six rather than at the one who
          has not begun.

          Dropped below `lg`, where the whole spread collapses onto one 844px
          sheet carrying all six stages: it is the only line here that no
          reader needs in order to follow the procedure, which makes it the
          right last thing to go.

          IT IS SET AT THE PAGE'S OWN SIZE AND AT 30ch, and both numbers are
          about the hole this slot used to have in it. The slot is 201px at
          1440x900 and shared with the verso, which fills it -- chapter head
          62..206, subtitle to 269. This side had the note at the top in 11px
          type, three lines ending at 130, and the arc hung off the bottom at
          232: 102px of nothing between them, on the one spread in the book
          with no slack anywhere else. `mb-auto` is what opens it, absorbing
          every spare pixel between the two.

          Enlarging the note is what closed it, and it stayed closed when the
          two later swapped ends -- which is the point: moving the ink around
          only moves the hole, and the slot has to be FILLED. 11px on a page
          whose body is 15px was already the caption-block mistake recorded
          against 05, and correcting it to the verso subtitle's size gets 3
          lines to 4; 30ch rather than 46 gets it to 5. 28px of gap where there
          were 102, and no word was cut to find it. The measure is 60% of the
          recto, the same fraction of its own page as the verso's 42ch
          subtitle.

          Measured across the desktop range, since this is the only breakpoint
          band where the note prints at all: the gap is 42px at 1024, 23 at
          1280, 28 at 1440 and 66 at 1920, and content clears the slot bottom
          by 17-18px at every one of them. It grows at 1920 because the type
          stops at its clamp maximum around 1466px of width while the slot
          keeps growing with page HEIGHT -- the verso carries 26px of the same
          slack there, so the two pages stay matched. */}
      {note ? (
        <p className="mt-auto hidden max-w-[30ch] text-[clamp(0.68rem,1.058vw,0.969rem)] leading-relaxed text-slate-400/70 italic lg:block">
          {note}
        </p>
      ) : null}
    </div>
  );
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
  services,
  from,
  rows,
  head,
}: {
  services: PageService[];
  from: number;
  rows: number;
  head?: React.ReactNode;
}) {
  if (!services.length) return null;
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
      className="grid gap-y-[clamp(0.25em,0.5vh,1em)] [grid-template-rows:none] lg:h-full lg:min-h-0 lg:flex-1 lg:pb-[clamp(14px,2vh,24px)] lg:[grid-template-rows:var(--stage-rows)]"
      style={
        {
          "--stage-rows": `minmax(0, ${STAGE_HEAD_SLOT}fr) repeat(${rows}, minmax(0, 1fr))`,
        } as React.CSSProperties
      }
    >
      {head}
      {services.map((service, i) => (
        <StageRow key={service.title} service={service} index={from + i} />
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
}: {
  plate: PageMask;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={plate.alt}
      className={className}
      style={{
        aspectRatio: plate.ratio,
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
        maskSize: "contain",
        WebkitMaskSize: "contain",
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
function PerspectiveIndex({
  services,
  intro,
}: {
  services: PageService[];
  intro?: string;
}) {
  return (
    <div data-ink className="min-w-0 flex-1">
      {/* Wider and a size down from the house subtitle, and that is a
          measurement rather than a preference: at 30ch of 1.05rem this ran to
          five lines, and the six rows below it then finished 30px past the
          foot of the page. At 46ch it is three. */}
      {intro ? (
        // Dropped below `lg`, on both phone orientations, and it is the
        // largest single thing this chapter gives up on a phone.
        //
        // At 844x390 the verso shows about 365px and perspective 06 fell off
        // the foot with it in. At 390x844 the whole spread is on ONE sheet:
        // the six domains, the argument, the diagram, three benefits and the
        // way out came to 920px of the 781 the face will show, and this
        // paragraph is 90 of them.
        //
        // It is the right one to lose because two other things on the same
        // sheet do its job -- the headline directly above says it in six
        // words, and "Why it matters" a few inches down says it in full.
        <p className="mb-[1.2em] hidden max-w-[46ch] text-[clamp(0.7rem,1.14vw,1.04rem)] leading-relaxed text-slate-300/80 lg:block">
          {intro}
        </p>
      ) : null}
      <p className="text-[clamp(0.44rem,0.66vw,0.6rem)] tracking-[0.3em] text-slate-400/55 uppercase">
        What we think about
      </p>
      <ol className="mt-[0.7em] border-t border-white/18">
        {services.map((service, i) => {
          const number = String(i + 1).padStart(2, "0");
          return (
            <li
              key={service.title}
              className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-[clamp(0.6em,1.1vw,0.95em)] border-b border-white/10 py-[0.34em] lg:py-[0.55em] [@media(max-height:480px)]:py-[0.18em]"
            >
              <span
                aria-hidden
                className="font-[family-name:var(--font-display)] text-[clamp(0.8rem,1.36vw,1.3rem)] leading-none font-light text-slate-400/45 tabular-nums"
              >
                {number}
              </span>
              <span className="min-w-0">
                <span className="block text-[clamp(0.48rem,0.74vw,0.66rem)] tracking-[0.26em] text-white uppercase">
                  {service.title}
                </span>
                {service.perspective ? (
                  <span className="mt-[0.3em] block text-[clamp(0.6rem,0.98vw,0.88rem)] leading-snug text-slate-300/65 lg:leading-relaxed">
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
      // Narrower than it was, and the width came off the PLATE rather than off
      // the type. At 166px the index had 374px of measure and two of the six
      // summaries wrapped to a second line at the larger sizes -- 38px of a
      // page that has none. At 138 the widest of them sets on one line.
      className="hidden w-[clamp(88px,9.5vw,138px)] shrink-0 opacity-85 lg:block"
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
      <h4 className="text-[clamp(0.44rem,0.66vw,0.6rem)] tracking-[0.3em] text-slate-400/55 uppercase">
        {title}
      </h4>
      <div aria-hidden className="mt-[1.1em] flex items-center gap-[0.35em]">
        <span className="h-px flex-1 bg-white/22" />
        <ArcArrow />
      </div>
      <ol className="grid grid-cols-4 gap-x-[clamp(0.35em,0.8vw,0.7em)]">
        {flow.map((node) => (
          <li key={node.label} className="relative pt-[0.85em]">
            {/* The station mark, hanging up into the rule above. */}
            <span
              aria-hidden
              className="absolute top-[-1px] left-0 block h-[9px] w-px bg-white/45"
            />
            <p className="text-[clamp(0.5rem,0.78vw,0.7rem)] tracking-[0.22em] text-white uppercase">
              {node.label}
            </p>
            <p className="mt-[0.4em] text-[clamp(0.56rem,0.9vw,0.8rem)] leading-snug text-slate-300/65 lg:leading-relaxed">
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
    <section data-ink className="shrink-0">
      <h4 className="text-[clamp(0.44rem,0.66vw,0.6rem)] tracking-[0.3em] text-slate-400/55 uppercase">
        {title}
      </h4>
      <ul className="mt-[0.7em] border-t border-white/18">
        {items.map((item) => (
          <li
            key={item.number}
            className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-[clamp(0.6em,1.1vw,0.9em)] border-b border-white/10 py-[0.55em] lg:py-[0.85em] [@media(max-height:480px)]:py-[0.25em]"
          >
            <span
              aria-hidden
              className="text-[clamp(0.42rem,0.62vw,0.56rem)] tracking-[0.24em] text-slate-400/45 tabular-nums"
            >
              {item.number}
            </span>
            <span className="min-w-0">
              <span className="block text-[clamp(0.56rem,0.86vw,0.78rem)] tracking-[0.2em] text-white uppercase">
                {item.title}
              </span>
              {/* Dropped below `lg`, on both phone orientations. The TITLES
                  stay at every size: three of them are still the answer to
                  "what do I get", where the sentence under each elaborates a
                  heading that is already printed. */}
              <span className="mt-[0.25em] hidden text-[clamp(0.54rem,0.86vw,0.78rem)] leading-snug text-slate-300/60 lg:block lg:leading-relaxed">
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
      className="mt-auto shrink-0 border-t border-white/18 pt-[0.9em]"
    >
      <h3 className="font-[family-name:var(--font-display)] text-[clamp(0.92rem,1.55vw,1.45rem)] leading-tight font-light text-balance text-white">
        {cta.headline}
      </h3>
      {/* Dropped below `lg`. The headline and the two actions are the whole
          of what this block has to do; the sentence between them is the one
          part a reader can act without. */}
      <p className="mt-[0.5em] hidden max-w-[52ch] text-[clamp(0.58rem,0.94vw,0.85rem)] leading-relaxed text-slate-300/70 lg:block">
        {cta.body}
      </p>
      <div className="mt-[0.8em] flex flex-wrap items-center gap-x-[1.6em] gap-y-[0.5em]">
        {cta.actions.map((action, i) => (
          <button
            key={action.label}
            type="button"
            data-nav-item
            data-index={action.chapter}
            className={`group flex w-fit cursor-pointer items-center gap-[0.6em] border-b pb-[0.28em] text-[clamp(0.48rem,0.76vw,0.68rem)] tracking-[0.26em] uppercase transition-colors duration-200 outline-none focus-visible:border-white focus-visible:text-white motion-reduce:transition-none ${
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
    <div // Reserving the drop folio. The call to action is hung off the foot with
      // mt-auto, so unlike every page that stops short of its own padding this
      // one lands exactly where the folio is: measured at 1440x900 the buttons
      // reached 835 against a folio whose top edge is 820. In vh because the
      // folio is placed in vh.
      className="flex min-h-0 flex-col gap-[0.75em] lg:flex-1 lg:gap-[clamp(0.9em,2.5vh,2.2em)] lg:pb-[clamp(20px,3vh,34px)] [@media(max-height:480px)]:pt-[6%]">
      <div data-ink className="shrink-0">
        <p className="text-[clamp(0.44rem,0.66vw,0.6rem)] tracking-[0.34em] text-slate-400/60 uppercase">
          {rationale.label}
        </p>
        <h3 className="mt-[0.6em] font-[family-name:var(--font-display)] text-[clamp(1.05rem,1.98vw,1.85rem)] leading-[1.1] font-light text-balance text-white">
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
      className="mt-[1.6em] border-b border-white/12 lg:border-t lg:border-b-0"
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
      <ul className="m-0 flex list-none flex-wrap items-baseline gap-x-[clamp(0.7em,3.2vw,1.4em)] gap-y-[0.5em] p-0 pb-[0.7em] lg:block lg:gap-0 lg:pb-0">
        {entries.map((service, i) => (
          <li key={service.title} className="lg:border-b lg:border-white/12">
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
              className="group flex items-baseline gap-[0.5em] border-b-2 border-transparent pb-[0.3em] text-start text-slate-400/70 transition-colors duration-200 outline-none hover:text-slate-200 focus-visible:text-white data-[current=true]:border-current data-[current=true]:text-slate-100 lg:w-full lg:gap-[0.9em] lg:border-b-0 lg:py-[0.7em] lg:pb-[0.7em] motion-reduce:transition-none"
            >
              <span className="shrink-0 text-[clamp(0.44rem,0.69vw,0.627rem)] tracking-[0.24em] tabular-nums opacity-70">
                {service.project!.number}
              </span>

              {/* The short label, below `lg` only. WEB / AI / SAAS / MOBILE --
                  four words that fit one line at 390px. */}
              <span className="text-[clamp(0.52rem,2.76vw,0.752rem)] tracking-[0.22em] uppercase lg:hidden">
                {service.project!.label}
              </span>

              {/* The named row, on the full spread only. */}
              <span className="hidden min-w-0 flex-1 lg:block">
                <span className="block text-[clamp(0.5rem,0.782vw,0.684rem)] tracking-[0.26em] uppercase">
                  {service.project!.category}
                </span>
                <span className="mt-[0.35em] block font-[family-name:var(--font-display)] text-[clamp(0.78rem,1.219vw,1.117rem)] leading-[1.15] font-light text-balance text-slate-200/90 group-data-[current=true]:text-white">
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
          <span className="text-[clamp(0.46rem,0.69vw,0.627rem)] tracking-[0.2em] text-slate-400/45 tabular-nums transition-colors duration-300 group-hover:text-slate-200 group-data-[current=true]:text-white motion-reduce:transition-none">
            {service.project!.number}
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
                {service.project!.number}
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
            <p className="text-[clamp(0.5rem,0.782vw,0.684rem)] tracking-[0.34em] text-slate-400/75 uppercase">
              {service.project!.status}
            </p>
            {/* Roman, like every other illustration in this book, and
                restarting at I for this chapter: 03's six are its own series.
                Arabic here would read as a pointer to a chapter number. */}
            <p className="shrink-0 text-[clamp(0.5rem,0.759vw,0.661rem)] tracking-[0.3em] text-slate-400/50">
              PLATE {roman(i + 1)}
            </p>
          </div>
        ))}
      </div>

      {/* The window. aspect-ratio reserves the box before a byte of image has
          landed, so nothing below it moves on load or on a swap. */}
      <div
        className="relative mt-[0.75em] grid w-full shrink-0 overflow-hidden border border-white/12 lg:mt-[0.9em]"
        style={{ aspectRatio: "16 / 9" }}
      >
        {entries.map((service, i) => (
          <img
            key={service.title}
            data-project-plate={i}
            data-current={i === 0 ? "true" : "false"}
            src={service.image!.src}
            alt={service.image!.alt}
            // The first plate is the one on screen when the spread arrives, so
            // it is the only one worth fetching eagerly; the other three are
            // behind a click that has not happened.
            loading={i === 0 ? "eager" : "lazy"}
            decoding="async"
            draggable={false}
            className="[grid-area:1/1] h-full w-full object-cover object-center transition-opacity duration-300 ease-out select-none data-[current=false]:opacity-0 motion-reduce:transition-none"
          />
        ))}
      </div>

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
                {project.services.map((item, k) => (
                  <li key={item} className="flex items-baseline gap-[0.7em]">
                    {k > 0 ? (
                      <span aria-hidden className="text-slate-400/35">
                        &middot;
                      </span>
                    ) : null}
                    {item}
                  </li>
                ))}
              </ul>
              {/* The two ruled rows, hung off the foot the way 03 hangs
                  DELIVERABLE and OUTCOME, so they sit on the same line from
                  project to project and can be read across the four. mt-auto
                  only at lg: on the stacked portrait sheet there is no page
                  foot to drop to, only the next block. */}
              <dl className="mt-[1em] grid shrink-0 grid-cols-[auto_1fr] items-baseline gap-x-[1.2em] pt-[0.6em] lg:mt-auto lg:pt-[1.2em]">
                <dt className="border-t border-white/18 pt-[0.6em] text-[clamp(0.5rem,0.759vw,0.661rem)] tracking-[0.3em] text-slate-400/70">
                  PLATFORM
                </dt>
                <dd className="border-t border-white/18 pt-[0.6em] text-[clamp(0.78rem,1.242vw,1.14rem)] leading-tight text-white">
                  {project.platform}
                </dd>
                <dt className="border-t border-white/10 pt-[0.6em] text-[clamp(0.5rem,0.759vw,0.661rem)] tracking-[0.3em] text-slate-400/70">
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
      {/* Hidden below 480px of viewport HEIGHT, where the twin of this block
          on the half-title takes over -- see the note there. It is printed in
          both places and shown in one; display:none keeps the other out of the
          accessibility tree, so nothing is announced twice. */}
      {colophon ? (
        <div data-ink className="pt-[1.6em] [@media(max-height:480px)]:hidden">
          <span
            aria-hidden
            className="mb-[0.9em] block h-px w-[26%] bg-white/15"
          />
          <p className="text-[clamp(0.55rem,0.862vw,0.775rem)] leading-relaxed text-slate-400/60">
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
      className={`flex min-h-0 items-center gap-[clamp(1em,2.4vw,2.4em)] self-center ${
        plateOnTheRight ? "flex-row-reverse" : ""
      }`}
    >
      {service.image ? <ServicePlate image={service.image} /> : null}
      <div className="min-w-0 flex-1">
        <p className="mb-[0.5em] text-[clamp(0.5rem,0.782vw,0.684rem)] tracking-[0.34em] text-slate-400/60">
          {roman(index + 1)}
        </p>
        <p className="font-[family-name:var(--font-display)] text-[clamp(0.9rem,1.518vw,1.391rem)] leading-tight font-light text-balance text-white">
          {service.title}
        </p>
        {service.body ? (
          <p className="mt-[0.5em] text-[clamp(0.64rem,1.012vw,0.912rem)] leading-relaxed text-slate-300/75">
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
          <p className="mb-[0.55em] text-[clamp(0.52rem,0.805vw,0.707rem)] tracking-[0.34em] text-slate-400/70">
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
  const halves = plates ? stageHalves(page.services) : null;
  return (
    <>
      {/* The picture-bearing settings are asked FIRST and isIllustrated LAST.
          It answers true for the plate section and the project stage as well,
          and would print their plates as thumbnails beside sentences. */}
      {plates && halves ? (
        // The recto of the process spread: the arc in the head slot, then the
        // second half of the six stages. See <StageRun> for why the arc is at
        // the head of this page rather than at its foot.
        <StageRun
          services={halves.recto}
          from={halves.verso.length}
          rows={halves.rows}
          head={
            <ProcessArc
              labels={page.tailpiece?.arc ?? []}
              note={page.tailpiece?.note}
            />
          }
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
            <p className="mb-[0.3em] text-[clamp(0.46rem,0.713vw,0.627rem)] tracking-[0.32em] text-slate-400/60">
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

/** The mark, struck at the foot of a page that would otherwise trail off. */
function MarkPlate({ caption = "THE MARK" }: { caption?: string }) {
  return (
    <figure data-ink className="mt-auto mb-[8%] flex items-center gap-[1.1em]">
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
      <figcaption className="text-[clamp(0.5rem,0.828vw,0.707rem)] tracking-[0.32em] text-slate-400/45">
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
            "mt-auto mb-[7%] hidden w-[clamp(150px,18.5vw,268px)] lg:mb-[10%] lg:block"
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
        <p className="text-[clamp(0.52rem,0.828vw,0.73rem)] tracking-[0.28em] text-slate-400/55">
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
 * The founder's plate.
 *
 * A book prints a portrait as a plate with a keyline and the sitter's name
 * under it, so that is the frame. There is no photograph in the repo yet:
 * until `founder.portrait` points at one under public/, the keyline holds an
 * empty ground with the mark in it, which is a plate awaiting its cut rather
 * than a broken image.
 */
function Portrait({ founder }: { founder: NonNullable<BookPage["founder"]> }) {
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
        <p className="font-[family-name:var(--font-display)] text-[clamp(1.05rem,1.782vw,1.653rem)] leading-tight font-light text-white">
          {founder.name}
        </p>
        <p className="mt-[0.35em] text-[clamp(0.52rem,0.828vw,0.73rem)] tracking-[0.32em] text-slate-400/70">
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
            <p className="mb-[0.35em] text-[clamp(0.5rem,0.782vw,0.684rem)] tracking-[0.34em] text-slate-400/60 tabular-nums">
              {String(from + i + 1).padStart(2, "0")}
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
          className={`max-w-[36ch] text-[clamp(0.7rem,1.127vw,1.026rem)] leading-relaxed text-slate-300/80 ${
            i ? "mt-[1em]" : ""
          }`}
        >
          {paragraph}
        </p>
      ))}
      <p
        data-ink
        className="mt-[1.8em] mb-[0.5em] text-[clamp(0.52rem,0.828vw,0.73rem)] tracking-[0.34em] text-slate-400/70"
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
            <span className="text-[clamp(0.5rem,0.759vw,0.661rem)] tracking-[0.2em] text-slate-400/50">
              {roman(i + 1)}
            </span>
            <span className="text-[clamp(0.72rem,1.15vw,1.026rem)] text-slate-200">
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
      {/* THE PROJECT FIRST, THE VISITOR SECOND -- and on the page that means
          this panel comes before anything else on the recto, including the
          telephone number. The old order was contact details, then a
          paragraph, then five prompts, then a line of type with an arrow; a
          visitor who wanted to start something had to read to the bottom of a
          434px page to find out they could.

          It is the one action in this book set as a PANEL rather than as a
          ruled line with an arrow after it. Everything else that acts --
          "Enquire about this" on 04, "Start a project" on 05 -- is a
          navigation device inside the book, and this is the thing the book is
          FOR. The border is 2px against the hairlines everywhere else, the
          label is a size up from any other action, and the arrow is set at
          1.6em: three ways of saying the same thing, because a visitor who
          misses this misses the chapter.

          The accent fills on hover and focus rather than sitting filled. A
          solid silver slab printed on a photograph of navy stock reads as a
          sticker stuck to the page -- the same failure, inverted, as the
          plates that came out darker than the paper and read as holes in it.
          A strong rule with the accent held back to a wash is a block a
          printer could actually have inked. */}
      <button
        type="button"
        data-inquiry-open
        data-ink
        className="group flex w-full cursor-pointer flex-col items-start border-2 border-[#dce7f7]/55 bg-[#dce7f7]/[0.07] px-[1.1em] py-[1.05em] text-start transition-colors duration-300 outline-none hover:border-[#dce7f7] hover:bg-[#dce7f7] focus-visible:border-[#dce7f7] focus-visible:bg-[#dce7f7] motion-reduce:transition-none"
      >
        <span className="flex w-full items-center justify-between gap-[0.8em]">
          <span className="font-[family-name:var(--font-display)] text-[clamp(1.15rem,1.9vw,1.75rem)] leading-none font-medium tracking-[0.12em] text-white uppercase transition-colors duration-300 group-hover:text-[#0b1728] group-focus-visible:text-[#0b1728] motion-reduce:transition-none">
            {contact.primary.label}
          </span>
          <span
            aria-hidden
            className="shrink-0 text-[clamp(1.5rem,2.5vw,2.3rem)] leading-none text-[#dce7f7] transition-all duration-300 group-hover:translate-x-[0.15em] group-hover:text-[#0b1728] group-focus-visible:text-[#0b1728] motion-reduce:transition-none"
          >
            &rarr;
          </span>
        </span>
        <span className="mt-[0.7em] max-w-[34ch] text-[clamp(0.66rem,1.012vw,0.912rem)] leading-relaxed text-slate-300/75 transition-colors duration-300 group-hover:text-[#0b1728]/75 group-focus-visible:text-[#0b1728]/75 motion-reduce:transition-none">
          {contact.primary.body}
        </span>
      </button>

      {/* What the chapter says WITHOUT being operated. The inquiry asks the
          same question at step four, and this list is why that is not the
          only place it is answered: a visitor who never opens the inquiry
          still has to be able to see what this studio does. */}
      <div data-ink className="mt-[1.6em] border-t border-white/12 pt-[1.2em]">
        <p className="mb-[0.5em] text-[clamp(0.52rem,0.828vw,0.73rem)] tracking-[0.34em] text-slate-400/70">
          {contact.enquiryTitle.toUpperCase()}
        </p>
        <p className="max-w-[32ch] text-[clamp(0.7rem,1.08vw,0.98rem)] leading-relaxed text-slate-300/80">
          {contact.enquiryBody}
        </p>
        {/* Where a reader recognises themselves. Set as a run of short lines
            against a hanging rule rather than as bullets: a client picking one
            of five is not reading a list of five, and the rule is what stops
            them reading as five separate offers. */}
        {contact.prompts?.length ? (
          <ul className="mt-[0.8em] flex flex-col border-t border-white/10">
            {contact.prompts.map((prompt) => (
              <li
                key={prompt}
                className="py-[0.4em] text-[clamp(0.64rem,0.989vw,0.889rem)] leading-snug text-slate-300/65"
              >
                {prompt}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* The way through without the questionnaire. It is kept whole -- four
          rows and a mail action -- because an inquiry flow that is the only
          door is a worse page than the one this replaces: some visitors have
          one question, and eight steps to ask it is an insult. */}
      <div data-ink className="mt-[1.6em] border-t border-white/12 pt-[1.2em]">
        <p className="mb-[0.4em] text-[clamp(0.52rem,0.828vw,0.73rem)] tracking-[0.34em] text-slate-400/70">
          {contact.directTitle.toUpperCase()}
        </p>
        <ul className="flex flex-col">
          {contact.rows.map((row) => {
            const line = (
              <>
                <Emblem
                  name={row.emblem}
                  className="w-[clamp(16px,1.8vw,22px)] shrink-0 text-slate-300"
                />
                <span className="text-[clamp(0.7rem,1.08vw,0.98rem)] text-slate-200">
                  {row.value}
                </span>
              </>
            );
            return (
              <li key={row.value} className="border-t border-white/10 py-[0.62em]">
                {row.href ? (
                  <a
                    href={row.href}
                    className="flex items-center gap-[0.9em] transition-colors duration-300 hover:text-white motion-reduce:transition-none"
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
        <a
          href={mail ?? "#"}
          className="group mt-[1em] inline-flex items-center gap-[0.8em] border-b border-white/25 pb-[0.4em] text-[clamp(0.6rem,0.943vw,0.844rem)] tracking-[0.26em] text-white transition-colors duration-300 hover:border-white/60 motion-reduce:transition-none"
        >
          {contact.cta.toUpperCase()}
          <span
            aria-hidden
            className="transition-transform duration-300 group-hover:translate-x-[0.25em] motion-reduce:transition-none"
          >
            &rarr;
          </span>
        </a>
      </div>
    </>
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
const PAGE_SINKAGE = "pt-[8%]";

function VersoPage({ page }: { page: BookPage | BookSpread }) {
  return (
    <div
      className={`relative flex h-full w-full flex-col justify-start pb-[8%] pe-[12%] ps-[calc(10%+var(--verso-inset-start,0px))] text-slate-200 ${PAGE_SINKAGE}`}
    >
      <FacingCopy page={page} />
      <p className="absolute bottom-[7%] start-[calc(10%+var(--verso-inset-start,0px))] text-[clamp(0.55rem,0.8vw,0.7rem)] tracking-[0.35em] text-slate-400/40 tabular-nums">
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
        <p
          data-ink
          className="mb-[1.3em] text-[clamp(0.6rem,1.035vw,0.855rem)] tracking-[0.35em] text-slate-400/80"
        >
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
            <dt className="font-[family-name:var(--font-display)] text-[clamp(1.6rem,3.45vw,3.192rem)] leading-none font-light text-[#dce7f7]">
              {term.letter}
            </dt>
            <dd>
              <p className="mb-[0.4em] text-[clamp(0.85rem,1.438vw,1.254rem)] leading-none text-white">
                {term.term}
              </p>
              <p className="max-w-[32ch] text-[clamp(0.72rem,1.15vw,1.049rem)] leading-relaxed text-slate-300/85">
                {term.body}
              </p>
            </dd>
          </div>
        ))}
      </dl>
      {page.termsFoot ? (
        <p
          data-ink
          className="mt-[1.4em] border-t border-white/10 pt-[1.1em] text-[clamp(0.7rem,1.092vw,1.003rem)] tracking-[0.02em] text-slate-400/75"
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
          <figcaption className="text-[clamp(0.5rem,0.828vw,0.707rem)] tracking-[0.32em] text-slate-400/45">
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
      className="absolute inset-x-0 bottom-[8%] flex justify-start ps-[12%]"
    >
      <p className="text-[clamp(0.55rem,0.8vw,0.7rem)] tracking-[0.35em] text-slate-400/45 tabular-nums">
        {page.number} &mdash; {page.title.toUpperCase()}
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
      className={`flex h-full w-full flex-col ps-[10%] pe-[calc(10%+var(--page-text-inset-end,0px)+var(--page-index-inset,0px))] text-slate-200 ${
        // Both halves of a spread take the same drop, so their first lines sit
        // on one line across the gutter. See PAGE_SINKAGE.
        page.facing
          ? `justify-start pb-[8%] ${PAGE_SINKAGE}`
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
          <StepList steps={page.steps} from={page.facing?.steps?.length ?? 0} />
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
          className="absolute bottom-[7%] end-[calc(10%+var(--page-text-inset-end,0px)+var(--page-index-inset,0px))] text-[clamp(0.55rem,0.8vw,0.7rem)] tracking-[0.3em] text-slate-400/40 tabular-nums"
        >
          {page.number}
        </p>
      ) : null}
    </div>
  );
}

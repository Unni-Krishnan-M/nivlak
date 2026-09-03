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
  type PagePlate,
  type PageService,
  type PageStep,
  spreadOfEntry,
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
          <div className="flex h-full w-full flex-col justify-start pt-[8%] pb-[8%] pe-[12%] lg:pt-[18%] ps-[calc(10%+var(--facing-inset-start,0px))] text-slate-200">
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
            className="absolute bottom-[7%] start-[calc(10%+var(--facing-inset-start,0px))] text-[clamp(0.55rem,0.8vw,0.7rem)] tracking-[0.35em] text-slate-400/40"
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
    // shrunk below its own content, and a verso whose copy outruns the page is
    // exactly when that happens: the head collapses and its epigraph prints on
    // top of the subtitle beneath it. `shrink-0` keeps the head at its content
    // height and lets the page overflow instead, which the face clips. Type
    // over type is the worse failure by far.
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
    const carried = page.facing.services ?? [];
    // A plate section's continuation verso is one stage, or -- on a chapter
    // whose stage count left the tailpiece opening its own spread -- the first
    // half of the tailpiece. See `tail` on BookSpread for why there are two
    // cases and no third.
    if (spread.tail === "spread") return <ChapterTailpiece page={page} half="arc" />;
    if (isPlateSection(carried)) {
      // The run comes from BOOK_PAGES rather than from the spread: a spread
      // holds one stage and the index in the head has to show all six.
      const chapter = spread.chapter ?? -1;
      return (
        <StagePlate
          service={carried[0]!}
          index={from}
          run={BOOK_PAGES[chapter]?.services ?? carried}
          chapter={chapter}
        />
      );
    }
    return isArchive(carried) ? (
      <ArchiveEntries services={carried} from={from} />
    ) : (
      <ServiceEntries services={carried} from={from} />
    );
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

      {/* The chapter's own contents, on its half-title. A plate section is the
          one setting that needs one: its stages are a SEQUENCE and a reader
          landing mid-chapter has no way to see how many there are or where
          they are in them, which a catalogue's entries never have to answer.
          It is also the only navigation in the book that addresses a page
          rather than a chapter -- see spreadOfEntry. */}
      {plateChapter >= 0 ? (
        <ChapterContents
          chapter={plateChapter}
          services={BOOK_PAGES[plateChapter]?.services ?? []}
        />
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

      {page.facing.plate ? (
        isArchive(page.services) ? (
          // Portrait collapses the spread onto ONE full-bleed page, so the
          // register's half-title and the first two records have to share
          // 844px -- and they do not: the head, the epigraph and the subtitle
          // come to ~195px, the plate and its caption to ~210, and two ledgers
          // need ~360. The plate is the only thing there carrying no
          // information a reader needs, so it is the one that goes.
          //
          // lg:contents rather than lg:block: the figure hangs off the foot of
          // the page with mt-auto, which only works while it is a child of the
          // page's own flex column.
          <div className="hidden lg:contents">
            <EngravedPlate plate={page.facing.plate} />
          </div>
        ) : (
          <EngravedPlate plate={page.facing.plate} />
        )
      ) : null}
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
 * Does this run set as an ARCHIVE -- a register of things made -- rather than
 * as a catalogue of things offered?
 *
 * Asked of the run, like isIllustrated and for the same reason: the answer
 * decides the setting for the whole chapter, and two settings down one page
 * read as two lists stacked. What separates them is not decoration. A
 * catalogue entry names a capability and is true by assertion; a register
 * entry is a record of one build, so it carries the status that says whether
 * it was built -- the first thing a reader wants to know about a portfolio and
 * the thing a portfolio most often has nowhere to say.
 */
function isArchive(services: PageService[] | undefined) {
  return Boolean(services?.some((service) => service.record));
}

/**
 * Does this run set as a PLATE SECTION -- a numbered plate per page with its
 * description under it -- rather than as a catalogue or a register?
 *
 * Asked of the run and not of each entry, like the other two and for the same
 * reason: the answer is the setting for the whole chapter.
 *
 * It has to be asked FIRST, because a stage carries `image` as well and
 * isIllustrated would claim it. That is not an ordering accident to be tidied
 * away later -- the two questions are genuinely both true of the data, and the
 * one that wins decides whether a photograph of an architecture diagram is
 * printed at the full measure of a page or at 42% of a text column. At the
 * second size none of the type inside it can be read, and being able to read
 * it is the entire reason these are photographs and not emblems.
 */
function isPlateSection(services: PageService[] | undefined) {
  return Boolean(services?.some((service) => service.stage));
}

/** Is any half of this spread set as a plate section? */
function spreadIsPlates(page: BookPage | BookSpread) {
  return isPlateSection(page.facing?.services) || isPlateSection(page.services);
}

/**
 * The stage index, run as a head across every page of the chapter.
 *
 * WHY THE CONTENTS LIST ON THE HALF-TITLE IS NOT ENOUGH
 *
 * It is on ONE page. Turn past it and there is nothing left saying how many
 * stages there are or which of them you are looking at -- and the thumb index
 * cannot answer either, because it deals in chapters and all six of these are
 * inside one.
 *
 * WHY IT MATTERS MORE HERE THAN IT WOULD ON A CATALOGUE
 *
 * A spread carries TWO stages, on facing pages. Ask for Design and the book
 * turns to Strategize | Design -- the right spread, with the page you asked
 * for on the right-hand side -- and the page your eye lands on first is
 * Strategize. The navigation was correct and read as broken, because nothing
 * on either page said which of the two had been asked for. This is what says
 * it: the mark under 03 is on the Design page and under 02 on the Strategize
 * page, so the two halves of a spread no longer look like the same answer.
 *
 * WHY IT IS THE THUMB INDEX'S VOCABULARY AND NOT A PROGRESS BAR
 *
 * A numeral over a notch, the current one cut deeper -- the same device
 * <BookIndex> uses on the fore-edge, because it is doing the same job one
 * level down. A filled bar would be a website's answer; this book already had
 * one for "where am I in a sequence" and inventing a second is how a set of
 * pages stops looking like one book.
 *
 * Hidden below lg. Portrait sets both stages of a spread on one screen, so the
 * reader can see where they are by looking, and printing the index twice down
 * a 390px page would be the loudest thing on it.
 */
function StageIndex({
  services,
  chapter,
  current,
}: {
  services: PageService[];
  chapter: number;
  /** Which stage's page this copy is printed on. */
  current: number;
}) {
  return (
    <nav
      // Not "The stages of the process" -- that is the contents list on the
      // half-title, and two navigation landmarks with the same accessible name
      // are announced identically while going to different places.
      aria-label="Stage index"
      className="hidden shrink-0 items-baseline gap-[clamp(0.5rem,1vw,0.9rem)] lg:flex"
    >
      {services.map((service, i) => {
        const number = String(i + 1).padStart(2, "0");
        const here = i === current;
        return (
          <button
            key={service.title}
            type="button"
            data-nav-item
            data-spread={spreadOfEntry(chapter, i)}
            data-anchor={`stage-${number}`}
            aria-label={`${number} ${service.title}`}
            aria-current={here ? "step" : undefined}
            className="group flex cursor-pointer flex-col items-center gap-[0.45em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
          >
            <span
              className={`text-[clamp(0.46rem,0.6vw,0.55rem)] tracking-[0.2em] tabular-nums transition-colors duration-300 ${
                here
                  ? "text-white"
                  : "text-slate-400/45 group-hover:text-slate-200"
              }`}
            >
              {number}
            </span>
            {/* The notch, cut deeper where you are. */}
            <span
              aria-hidden
              className={`block h-px transition-all duration-300 ${
                here
                  ? "w-[18px] bg-white/75"
                  : "w-[10px] bg-white/20 group-hover:w-[14px] group-hover:bg-white/45"
              }`}
            />
          </button>
        );
      })}
    </nav>
  );
}

/**
 * One stage of the procedure: a plate, and the letterpress that describes it.
 *
 * WHY THE ORDER OF THE PARTS IS THE ORDER IT IS
 *
 * A client arriving on this page is asking three questions in a fixed sequence
 * -- what is this stage, what happens in it, and what do I end up with -- and
 * the page answers them in that order and stops. The numeral and the name say
 * where in the six you are; the plate shows the actual artefact; the sentence
 * says what the stage is for; the run of phrases is the work; and the two
 * ruled rows at the foot are the two halves of the answer to the third
 * question, which is the one that decides whether a stage was worth paying
 * for.
 *
 * WHY THE WORK IS A RUN AND NOT A LIST
 *
 * Five or six bullets down a column is four to six rules and about 150px of a
 * page that also has to carry a plate. Set as one wrapped run with hairline
 * separators it is two lines, it still reads as enumerated, and it stays
 * subordinate to the deliverable and the outcome -- which are what the reader
 * came for. A bulleted list would have been the most prominent thing on the
 * page and it is the least important of the three.
 *
 * WHY THE FOOT IS RULED WHEN THE CATALOGUE'S ENTRIES ARE NOT
 *
 * ServiceEntry drops its rules because a page carrying five photographs does
 * not need ruling as well. This page carries ONE, and the rules are doing a
 * different job here anyway: they make DELIVERABLE and OUTCOME a two-row table
 * that reads across from stage to stage, so a reader can compare what they get
 * at 02 with what they get at 05 without re-reading either page. That is the
 * register's argument, applied to two rows instead of three.
 */
function StagePlate({
  service,
  index,
  run,
  chapter,
  anchored = false,
}: {
  service: PageService;
  index: number;
  /** The chapter's whole run, for the stage index in the head. */
  run: PageService[];
  chapter: number;
  /**
   * Print an id on this stage.
   *
   * Only the reduced-motion column does. Under reduced motion the sheets and
   * the column are BOTH in the document -- the book is parked open above the
   * copy rather than replaced by it -- so a stage that anchored itself in both
   * would put two `stage-04`s in the page and getElementById would answer with
   * the one inside the parked book. There is nothing to scroll to there.
   */
  anchored?: boolean;
}) {
  const stage = service.stage;
  if (!stage) return null;
  const number = String(index + 1).padStart(2, "0");
  return (
    <article
      id={anchored ? `stage-${number}` : undefined}
      data-ink
      // aria-label rather than aria-labelledby, because the id it would point
      // at is not unique. <FacingCopy> is rendered twice per spread -- once on
      // the verso and once into the hidden block the portrait fallback shows
      // instead -- so every stage's markup exists twice in the document and an
      // id on its heading would too.
      aria-label={`${number} ${service.title}`}
      // Reserving the drop folio, which no other page has had to.
      //
      // VersoPage and PageBody both print it absolutely at 7% of the page
      // HEIGHT, while their own bottom padding is a percentage of the page's
      // WIDTH -- 8% of ~700 is 56px against a folio whose top edge is ~71px
      // up. Every page before this one stopped short of its own padding, so
      // the 15px the two overlap by never showed. This one hangs its
      // deliverable off the foot with mt-auto, so it lands exactly there: the
      // verso printed "03 — APPROACH" through the last line of the outcome.
      // Reserved in vh because the folio is placed in vh; a percentage here
      // would resolve against the width and miss it again.
      //
      // h-full and the folio reservation are BOTH lg-only, and for the same
      // reason: below lg there is no spread. The portrait fallback collapses
      // both halves onto one full-bleed sheet and prints the verso's copy
      // above the recto's, so a stage is one of TWO on the page rather than
      // the page itself. h-full would then make each of them 844px tall and
      // push the second clean off the bottom, and there is no drop folio down
      // there to reserve room for.
      className="flex min-h-0 flex-col lg:h-full lg:pb-[clamp(20px,3vh,34px)]"
    >
      {/* The head: the stage's own numeral, large, and its name beside it.
          Same construction as ChapterHead's numeral and section name, one size
          down -- this is a page inside a chapter, not the chapter opening. */}
      <div className="flex shrink-0 items-baseline justify-between gap-[0.9em]">
        <div className="flex items-baseline gap-[0.6em]">
          <span
            aria-hidden
            className="font-[family-name:var(--font-display)] text-[clamp(1.7rem,3.4vw,3.2rem)] leading-[0.8] font-light text-[#dce7f7]/85 tabular-nums"
          >
            {number}
          </span>
          <h3 className="font-[family-name:var(--font-display)] text-[clamp(1rem,1.7vw,1.55rem)] leading-none font-light text-white">
            {service.title}
          </h3>
        </div>
        <StageIndex services={run} chapter={chapter} current={index} />
      </div>

      {/* The label and the plate number, on one line against the rule that
          closes the head. The plate number is set to the right because it
          belongs to the PICTURE below it rather than to the stage -- the
          numeral above already numbers the stage, and printing IV beside 04
          twice is the same fact said at two sizes. */}
      <div className="mt-[0.5em] flex shrink-0 items-baseline justify-between gap-[1em] border-t border-white/18 pt-[0.55em]">
        <p className="text-[clamp(0.5rem,0.68vw,0.6rem)] tracking-[0.34em] text-slate-400/75">
          {stage.label.toUpperCase()}
        </p>
        <p className="shrink-0 text-[clamp(0.5rem,0.66vw,0.58rem)] tracking-[0.3em] text-slate-400/50">
          PLATE {stage.figure}
        </p>
      </div>

      {service.image ? (
        // The plate is the one thing on this page that must not be allowed to
        // squeeze. `aspectRatio` from the content reserves its height before
        // the file decodes -- the sheets are laid out by measurement and a
        // plate that resizes after paint drags the copy under it -- and
        // shrink-0 keeps flex from taking the height back when the letterpress
        // is long. A plate that has been squeezed is a distorted photograph,
        // which is worse than a page that overflows its foot by a line.
        <img
          src={service.image.src}
          alt={service.image.alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          // 74% below lg, full measure above it. Two stages share 844px on
          // a portrait phone and a stage's fixed furniture -- head, label,
          // headline, work and the two ruled rows -- is about 230px of that,
          // which leaves ~160px for the plate against the 191px a full-measure
          // 16:9 needs. At 74% it is 141px and both stages land on the page.
          // Not smaller: these photographs are made of small type, and the
          // reason to print them rather than an emblem is that it can be read.
          className="mt-[0.75em] w-[74%] shrink-0 select-none lg:mt-[0.9em] lg:w-full"
          style={{ aspectRatio: service.image.ratio, objectFit: "cover" }}
        />
      ) : null}

      {/* The letterpress is set at the book's own body size and not smaller.
          It was a size down at first -- 12.4px against the 16.5px the prose
          pages use at 1440 -- which read as a caption block rather than as the
          page's text, and left about 190px of the page unfilled underneath it.
          This is the page a client reads most carefully; it takes the measure
          the rest of the book takes. */}
      <h4 className="mt-[0.85em] shrink-0 font-[family-name:var(--font-display)] text-[clamp(1.05rem,1.62vw,1.5rem)] leading-tight font-light text-balance text-[#dce7f7]">
        {stage.headline}
      </h4>

      {service.body ? (
        // Dropped below lg. It is the only part of a stage that says
        // something the page says elsewhere -- it elaborates the headline
        // above it -- so when two stages have to share a phone screen it is
        // the one that can go without the page stopping answering a question.
        // The headline, the work, the deliverable and the outcome all stay.
        <p className="mt-[0.55em] hidden shrink-0 text-[clamp(0.74rem,1.04vw,0.95rem)] leading-relaxed text-slate-300/80 lg:block">
          {service.body}
        </p>
      ) : null}

      {/* What happens here. A `ul` because it is a list and a screen reader
          should say so; the separators are decorative and are drawn by the
          rule below rather than typed into the copy, so nothing announces
          "middle dot" five times. */}
      <ul className="mt-[0.95em] flex shrink-0 flex-wrap items-baseline gap-x-[0.75em] gap-y-[0.25em] text-[clamp(0.64rem,0.88vw,0.8rem)] leading-relaxed text-slate-300/65">
        {stage.work.map((item, i) => (
          <li key={item} className="flex items-baseline gap-[0.7em]">
            {i > 0 ? (
              <span aria-hidden className="text-slate-400/35">
                &middot;
              </span>
            ) : null}
            {item}
          </li>
        ))}
      </ul>

      {/* The two rows that answer "what do I get". mt-auto hangs them off the
          foot of the page rather than letting them float under copy of
          whatever length, so they sit on the same line from stage to stage and
          can be read across the six. */}
      {/* mt-auto only at lg. On the stacked portrait sheet it would drop
          the first stage's deliverable to the foot of the screen and land it
          on top of the second stage's head. */}
      <dl className="mt-[1em] grid shrink-0 grid-cols-[auto_1fr] gap-x-[1.2em] pt-[0.6em] lg:mt-auto lg:pt-[1.2em]">
        <dt className="border-t border-white/18 pt-[0.6em] text-[clamp(0.5rem,0.66vw,0.58rem)] tracking-[0.3em] text-slate-400/70">
          DELIVERABLE
        </dt>
        <dd className="border-t border-white/18 pt-[0.6em] text-[clamp(0.78rem,1.08vw,1rem)] leading-tight text-white">
          {stage.deliverable}
        </dd>
        <dt className="border-t border-white/10 pt-[0.6em] text-[clamp(0.5rem,0.66vw,0.58rem)] tracking-[0.3em] text-slate-400/70">
          OUTCOME
        </dt>
        <dd className="border-t border-white/10 pt-[0.6em] text-[clamp(0.7rem,0.96vw,0.88rem)] leading-snug text-slate-300/80">
          {stage.outcome}
        </dd>
      </dl>
    </article>
  );
}

/**
 * The whole plate section as one run, for the reduced-motion column.
 *
 * That column sets a CHAPTER per article rather than a spread -- there are no
 * pages to turn, so the reason a chapter is cut across sheets does not apply.
 * Everything else in the book falls out of that for free, because a catalogue
 * and a register are the same object whether their run is cut or not. A plate
 * section is not: its pagination is what decides that a page holds one stage,
 * and what closes the chapter is a page rather than a paragraph. Rendered
 * through the spread path, an uncut chapter printed stage 01 and stopped --
 * five stages and the whole call to action silently missing for exactly the
 * readers who cannot see the book open.
 */
function PlateSectionColumn({ page }: { page: BookPage }) {
  return (
    <>
      {(page.services ?? []).map((service, i) => (
        <div key={service.title} className="mb-12">
          <StagePlate
            service={service}
            index={i}
            run={page.services ?? []}
            chapter={BOOK_PAGES.indexOf(page)}
            anchored
          />
        </div>
      ))}
      {page.tailpiece ? <ChapterTailpiece page={page} half="both" /> : null}
    </>
  );
}

/**
 * The contents of the chapter, printed on its half-title.
 *
 * It is the brief's "process index" and it is also just a table of contents,
 * which is the device a book already has for this and puts in the same place.
 * Derived from the run rather than written down, so a seventh stage appears
 * here without anyone remembering to add it.
 *
 * The entries seek a SPREAD rather than a chapter, which is the one thing the
 * thumb index cannot do -- see the note on spreadOfEntry. `data-nav-item` is
 * what wires them up; <Book> owns the handler, because the scroll position of
 * a page in a pinned section is a time on a playhead and nothing in this file
 * can know it.
 */
function ChapterContents({
  chapter,
  services,
}: {
  chapter: number;
  services: PageService[];
}) {
  return (
    <nav
      data-ink
      aria-label="The stages of the process"
      className="mt-[0.7em] border-t border-white/18 lg:mt-[1.5em]"
    >
      {/* Two columns below lg and one above it. Portrait sets this
          half-title and the whole of stage 01 on one 844px sheet, and six
          full-measure rows cost ~145px of it -- enough to push the stage's
          outcome off the foot. Paired, they cost ~72 and the list still reads
          in order, down the left column and then the right being wrong: they
          are numbered, so they are read across. */}
      <ol className="grid grid-cols-2 gap-x-[1.2em] lg:block">
        {services.map((service, i) => {
          const number = String(i + 1).padStart(2, "0");
          return (
            <li key={service.title}>
              <button
                type="button"
                data-nav-item
                data-spread={spreadOfEntry(chapter, i)}
                data-anchor={`stage-${number}`}
                // Tighter below lg. Portrait collapses the spread, so this
                // half-title shares 844px with the first stage -- at the
                // desktop rhythm the six rows cost ~180px and pushed
                // Discover's deliverable off the foot of the screen.
                className="group flex w-full cursor-pointer items-baseline gap-[0.9em] border-b border-white/10 py-[0.32em] text-start transition-colors duration-300 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 lg:py-[0.5em]"
              >
                <span className="text-[clamp(0.52rem,0.7vw,0.62rem)] tracking-[0.26em] text-slate-400/60 tabular-nums">
                  {number}
                </span>
                <span className="text-[clamp(0.66rem,0.92vw,0.84rem)] tracking-[0.16em] text-slate-200/85 transition-colors duration-300 group-hover:text-white">
                  {service.title.toUpperCase()}
                </span>
                {/* The rule and the deliverable are what a one-column list
                    has room for. Paired at 145px a column, neither fits, and
                    the deliverable is on the stage's own page anyway. */}
                <span
                  aria-hidden
                  className="mx-[0.2em] hidden h-px flex-1 bg-white/10 transition-colors duration-300 group-hover:bg-white/30 lg:block"
                />
                <span className="hidden shrink-0 text-[clamp(0.5rem,0.66vw,0.58rem)] tracking-[0.26em] text-slate-400/45 lg:inline">
                  {service.stage?.deliverable.toUpperCase()}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * The page that closes the chapter.
 *
 * WHY THE ARC IS DERIVED AND NOT WRITTEN
 *
 * The brief asked for "DISCOVER -> STRATEGIZE -> DESIGN -> ENGINEER -> LAUNCH
 * -> EVOLVE" as a line of copy. Written down it is a seventh place the stage
 * names live, and the first time one is renamed it is the place nobody
 * remembers. It is read off the run instead, which is the same rule the
 * contents on the half-title follow.
 *
 * WHY THE TWO ACTIONS ARE RULED LINES AND NOT BUTTONS
 *
 * They ARE buttons -- they seek the timeline, they take focus, they say what
 * they do. What they are not is a pair of filled pills, because the contact
 * page four sheets later already has this exact device (a tracked capital
 * line over a rule, with an arrow) and a book that invents a second button
 * style on its own last-but-one page has stopped being a book. Matching it
 * costs nothing and is the difference between a page of a printed thing and a
 * landing page that happens to have paper behind it.
 */
function ChapterTailpiece({
  page,
  half,
}: {
  page: BookPage | BookSpread;
  half: "arc" | "cta" | "both";
}) {
  const tail = page.tailpiece;
  if (!tail) return null;
  const stages = page.services?.length
    ? page.services
    : (page.facing?.services ?? []);
  // The run this page summarises is the CHAPTER's, and by the time the
  // tailpiece is reached the spread it sits on carries at most one stage of
  // it. BOOK_PAGES is where the whole run still is.
  const chapter = (page as Partial<BookSpread>).chapter;
  const run =
    chapter === undefined ? stages : (BOOK_PAGES[chapter]?.services ?? stages);

  // The arc and the value list are the two things on this page that RESTATE
  // rather than say: the arc is the six names the half-title already listed
  // and the reader has just turned through, and the values are the six
  // deliverables already printed on the stages. On a desktop spread they earn
  // their place as the summary a procedure ends on. On portrait this page is
  // sharing 844px with the whole of stage 06, and keeping them cost the CTA --
  // which is the one thing on the page that is not a restatement of anything.
  const summary = (
    <div className="hidden lg:contents">
      <p className="text-[clamp(0.5rem,0.68vw,0.6rem)] tracking-[0.34em] text-slate-400/70">
        {tail.arcTitle.toUpperCase()}
      </p>
      {/* The six names, run on with arrows and allowed to wrap. A single line
          would have to set at about 7px on a 460px column to fit; wrapped, it
          keeps the body size and still reads as one sequence. */}
      <p className="mt-[0.7em] flex flex-wrap items-baseline gap-x-[0.5em] gap-y-[0.15em] border-t border-white/18 pt-[0.8em] text-[clamp(0.62rem,0.86vw,0.78rem)] tracking-[0.14em] text-slate-200/85">
        {run.map((service, i) => (
          <span key={service.title} className="flex items-baseline gap-[0.5em]">
            {i > 0 ? (
              <span aria-hidden className="text-slate-400/40">
                &rarr;
              </span>
            ) : null}
            {service.title.toUpperCase()}
          </span>
        ))}
      </p>

      <p className="mt-[1.6em] text-[clamp(0.5rem,0.68vw,0.6rem)] tracking-[0.34em] text-slate-400/70">
        {tail.valueTitle.toUpperCase()}
      </p>
      {/* Two columns, because six short words down one column is a list of
          six things and in two it is a block of one thing -- which is what it
          is: the process, restated as what it buys. */}
      <ul className="mt-[0.6em] grid grid-cols-2 border-t border-white/18">
        {tail.value.map((item, i) => (
          <li
            key={item}
            className={`py-[0.5em] text-[clamp(0.64rem,0.88vw,0.8rem)] text-slate-200/85 ${
              i % 2 === 0 ? "pe-[1em]" : "border-s border-white/10 ps-[1em]"
            }`}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );

  const arc = (
    <>
      {summary}
      {/* Where a footnote goes and doing a footnote's job: the qualification
          the reader needs having just counted six stages, which the running
          text should not stop for. Same place `colophon` is set. It stays on
          portrait: "you do not have to start at stage one" is the one thing
          here a reader could not have worked out from the pages behind them. */}
      <p className="mt-[1em] border-t border-white/10 pt-[0.8em] text-[clamp(0.62rem,0.82vw,0.74rem)] leading-relaxed text-slate-400/70 italic lg:mt-[1.2em]">
        {tail.note}
      </p>
    </>
  );

  const cta = (
    <>
      <Ornament className="mb-[1em] hidden w-[30%] text-slate-300/70 lg:block" />
      <p className="text-[clamp(0.5rem,0.68vw,0.6rem)] tracking-[0.34em] text-slate-400/70">
        {tail.cta.eyebrow.toUpperCase()}
      </p>
      <h3 className="mt-[0.4em] font-[family-name:var(--font-display)] text-[clamp(1.3rem,2.4vw,2.3rem)] leading-[1.05] font-light text-balance text-white">
        {tail.cta.headline}
      </h3>
      <p className="mt-[0.7em] max-w-[38ch] text-[clamp(0.64rem,0.88vw,0.8rem)] leading-relaxed text-slate-300/75">
        {tail.cta.body}
      </p>
      <div className="mt-[1.4em] flex flex-wrap items-center gap-x-[2em] gap-y-[0.8em]">
        {[tail.cta.primary, tail.cta.secondary].map((action, i) => (
          <button
            key={action.label}
            type="button"
            data-nav-item
            data-index={action.chapter}
            className={`group inline-flex cursor-pointer items-center gap-[0.8em] border-b pb-[0.4em] text-[clamp(0.58rem,0.8vw,0.72rem)] tracking-[0.26em] transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/60 ${
              // The primary is struck in the page's own silver over a brighter
              // rule; the secondary is body-weight over a hairline. One pair
              // of ink values apart, which is as much hierarchy as two lines
              // of tracked capitals can carry without one of them becoming a
              // pill.
              i === 0
                ? "border-white/45 text-white hover:border-white/80"
                : "border-white/18 text-slate-300/80 hover:border-white/45 hover:text-white"
            }`}
          >
            {action.label.toUpperCase()}
            <span
              aria-hidden
              className="transition-transform duration-300 group-hover:translate-x-[0.25em]"
            >
              &rarr;
            </span>
          </button>
        ))}
      </div>
    </>
  );

  if (half === "arc") return arc;
  if (half === "cta") return <div className="lg:mt-auto">{cta}</div>;
  return (
    <>
      {arc}
      <div className="mt-[1.4em] lg:mt-auto lg:pt-[1.8em]">{cta}</div>
    </>
  );
}

/**
 * One entry in the register: a ruled ledger, not a card.
 *
 * WHY NOT THE CATALOGUE SETTING, WHICH ALREADY EXISTS
 *
 * Because 04 used to BE the catalogue setting, and that was the bug. It read
 * Web Applications / AI Platforms / SaaS Products / Mobile Apps / Brand
 * Experiences -- 02's five entries, one spread later, with the photographs and
 * the sentences taken off. Two chapters in the same setting saying the same
 * five words is how the repetition stayed invisible for as long as it did.
 *
 * A register is ruled, labelled, and asks the same three questions of every
 * entry, so the reader COMPARES entries instead of reading them one at a time.
 * That is the difference between a portfolio and an archive, and it is carried
 * by the setting rather than by the copy.
 *
 * WHY THE RULE IS BACK, HAVING BEEN TAKEN OFF THE CATALOGUE
 *
 * ServiceEntry drops its rules because a page already carrying five
 * photographs does not need ruling as well -- the pictures were the strongest
 * thing there and the lines competed with them. There are no photographs here.
 * The rule is what makes a row of facts a row, and without it three labelled
 * pairs under a title are just a paragraph that has been broken oddly.
 */
function ArchiveEntry({
  service,
  index,
}: {
  service: PageService;
  index: number;
}) {
  const record = service.record;
  if (!record) return null;
  return (
    // Two elements, and the inner one is why. The row is a full-height grid
    // cell and the entry is centred in it, so a rule on the OUTER box draws at
    // the top of the cell -- measured 99px above the entry it was ruling off,
    // which reads as a stray line rather than as the head of a record. The
    // rule belongs to the entry, so it goes on the box the entry is in.
    <div data-ink className="flex min-h-0 flex-col justify-center">
      {/* Tighter below lg, and it is not taste. A landscape phone gives the
          page 390px of height against a desktop half's ~620, and two ledgers
          set at desktop rhythm overran it by ~50px -- the last record lost the
          foot of its final row to the face's clip. Every value here is the
          desktop one scaled back by about a third; the type is untouched. */}
      <div className="border-t border-white/12 pt-[0.55em] lg:pt-[0.9em]">
        {/* The head of the entry: its number at the fore-edge margin and its
          year at the other, the way a register rules a line. */}
        <div className="flex items-baseline justify-between gap-[1em]">
          <p className="min-w-0 text-[clamp(0.5rem,0.68vw,0.6rem)] tracking-[0.34em] text-slate-400/60">
            PLATE {roman(index + 1)}
            {record.series ? (
              <span className="text-slate-400/40">
                {" · "}
                {record.series.toUpperCase()}
              </span>
            ) : null}
          </p>
          <p className="shrink-0 text-[clamp(0.5rem,0.68vw,0.6rem)] tracking-[0.24em] text-slate-400/45 tabular-nums">
            {record.year}
          </p>
        </div>

        <div className="mt-[0.3em] flex items-center gap-[0.6em] lg:mt-[0.5em] lg:gap-[0.7em]">
          {service.emblem ? (
            <Emblem
              name={service.emblem}
              className="w-[clamp(24px,2.7vw,38px)] shrink-0 text-slate-300"
            />
          ) : null}
          <div className="min-w-0">
            <h3 className="font-[family-name:var(--font-display)] text-[clamp(0.95rem,1.4vw,1.32rem)] leading-tight font-light text-balance text-white">
              {service.title}
            </h3>
            {/* Discipline and status on one line, at one size. Setting the
              status smaller, or in a colour, would make it the thing a reader
              skips -- which is the opposite of why it is printed. */}
            <p className="mt-[0.18em] text-[clamp(0.47rem,0.63vw,0.56rem)] tracking-[0.26em] text-slate-400/70 lg:mt-[0.3em]">
              {record.discipline.toUpperCase()}
              {" · "}
              {record.status.toUpperCase()}
            </p>
          </div>
        </div>

        {/* Labels beside their values above lg and above them below it. A fixed
          label column is what aligns the values down the page, and 7.4vw is
          the width of the longest label the chapter uses; on a portrait phone
          the whole spread is one 390px page and that column would take a fifth
          of it, so the pairs stack instead of the values wrapping to nothing. */}
        <dl className="mt-[0.45em] flex flex-col gap-y-[0.22em] text-[clamp(0.6rem,0.83vw,0.76rem)] lg:mt-[0.7em] lg:gap-y-[0.42em]">
          {record.rows.map((row) => (
            <div
              key={row.label}
              className="flex flex-col lg:flex-row lg:gap-x-[1em]"
            >
              <dt className="text-[0.8em] leading-[1.5] tracking-[0.2em] text-slate-400/60 uppercase lg:w-[clamp(4.4rem,7.4vw,6.8rem)] lg:shrink-0 lg:leading-[1.7]">
                {row.label}
              </dt>
              <dd className="min-w-0 leading-[1.45] text-slate-300/80 lg:leading-[1.55]">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/**
 * A page of the register.
 *
 * The rows are the entries ON THIS PAGE, not a fixed ARCHIVE_SLOTS of them,
 * and that is the one place this setting departs from the catalogue's. The
 * catalogue can divide every page into the same fixed number of rows because
 * its pages are always full, and that is what puts entry II on the verso onto
 * entry V's line across the gutter. The register's pages are not full: five
 * entries fall 2 / 2 / 1 across its two spreads, so a fixed template would
 * leave a third of the last recto blank beneath a stretched entry. Sizing the
 * rows to the count fills every page, and the tailpiece takes the space on the
 * last one that would otherwise have been the hole.
 */
function ArchiveEntries({
  services,
  from,
}: {
  services: PageService[];
  from: number;
}) {
  if (!services.length) return null;
  return (
    <div
      className="grid min-h-0 flex-1"
      // min-content, NOT 0, as the floor. With minmax(0, 1fr) a page whose
      // entries outrun it shrinks the rows instead of overflowing, and the
      // entries print through each other: on a 390x844 portrait page PLATE I's
      // STACK row landed across PLATE II's rule and its plate number. Overflow
      // is clipped by the face and loses the foot of the last entry, which is
      // a bad page; overprinting is two records on one line, which is not a
      // page at all.
      style={{
        gridTemplateRows: `repeat(${services.length}, minmax(min-content, 1fr))`,
      }}
    >
      {services.map((service, i) => (
        <ArchiveEntry key={service.title} service={service} index={from + i} />
      ))}
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
  const from =
    (spread.servicesFrom ?? 0) + (page.facing?.services?.length ?? 0);
  const illustrated = isIllustrated(page.services);
  const archive = isArchive(page.services);
  return (
    <>
      {archive ? (
        <ArchiveEntries services={page.services} from={from} />
      ) : illustrated ? (
        <ServiceEntries services={page.services} from={from} />
      ) : (
        <ServiceGrid services={page.services} from={from} />
      )}
      {/* Tailpiece, closing the catalogue the way 01 closes its text -- but
          only where the catalogue actually ends. On the first of two spreads
          the run carries on over the page, and an ornament there would sign
          off a chapter that has not finished.

          Not on the illustrated pages: their entries fill a grid that is
          the whole height of the page, so there is no foot left to put an
          ornament in. */}
      {!illustrated && (spread.lastOfChapter ?? true) ? (
        // shrink-0 on the register: its grid is flex-1 and would otherwise
        // take the ornament's height back off it, pushing the last entry up
        // and re-opening the gap this block is standing in.
        <div data-ink className={archive ? "mt-[1.4em] shrink-0" : "mt-[2em]"}>
          <Ornament className="w-[30%] text-slate-300" />
          {/* The qualification, set where a footnote goes and doing its job.
              Below the ornament rather than above it because it is a note
              about the chapter that has just ended, not part of it. */}
          {archive && page.colophon ? (
            // Full measure, not max-w-[46ch]. At 0.68rem that capped it to
            // ~248px of a 450px column, so it set as three short lines whose
            // last one closed 4px below the page's bottom padding and level
            // with the drop folio. A footnote is set to the measure.
            <p className="mt-[0.85em] text-[clamp(0.55rem,0.75vw,0.68rem)] leading-relaxed text-slate-400/60">
              {page.colophon}
            </p>
          ) : null}
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
          : "mt-auto mb-[7%] w-[clamp(150px,20vw,290px)]"
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
        {/* Where a reader recognises themselves. Set as a run of short lines
            against a hanging rule rather than as bullets: a client picking one
            of five is not reading a list of five, and the rule is what stops
            them reading as five separate offers. */}
        {contact.prompts?.length ? (
          <ul className="mt-[0.9em] flex flex-col border-t border-white/10">
            {contact.prompts.map((prompt) => (
              <li
                key={prompt}
                className="py-[0.42em] text-[clamp(0.64rem,0.86vw,0.78rem)] leading-snug text-slate-300/65"
              >
                {prompt}
              </li>
            ))}
          </ul>
        ) : null}
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
        continued ? "pt-[7%] lg:pt-[11%]" : "pt-[8%] lg:pt-[18%]"
      }`}
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
          className="mb-[1.3em] text-[clamp(0.6rem,0.9vw,0.75rem)] tracking-[0.35em] text-slate-400/80"
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
      className="absolute inset-x-0 bottom-[8%] flex justify-start ps-[12%]"
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
          ? `justify-start pb-[8%] ${
              continued ? "pt-[7%] lg:pt-[11%]" : "pt-[8%] lg:pt-[18%]"
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

      {(page as Partial<BookSpread>).tail ? (
        // The closing recto. On a full spread it is the second half only --
        // the arc has already been set on the verso facing it.
        <ChapterTailpiece
          page={page}
          half={(page as Partial<BookSpread>).tail === "spread" ? "cta" : "both"}
        />
      ) : isPlateSection(page.services) &&
        (page as Partial<BookSpread>).chapter === undefined ? (
        // An uncut chapter -- the reduced-motion column. `chapter` is set by
        // the pagination and by nothing else, so its absence is what says this
        // is a BookPage rather than one of the spreads it was cut into.
        <PlateSectionColumn page={page as BookPage} />
      ) : isPlateSection(page.services) ? (
        // The recto's place in the chapter's run is where the SPREAD starts
        // plus whatever the verso took -- one stage on every spread but the
        // first, whose verso is the half-title and takes none. Reading
        // servicesFrom alone printed 03 as 02 on every continuation spread.
        <StagePlate
          service={page.services![0]!}
          index={
            ((page as Partial<BookSpread>).servicesFrom ?? 0) +
            (page.facing?.services?.length ?? 0)
          }
          run={
            BOOK_PAGES[(page as Partial<BookSpread>).chapter ?? -1]?.services ??
            page.services!
          }
          chapter={(page as Partial<BookSpread>).chapter ?? -1}
        />
      ) : page.services?.length ? (
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

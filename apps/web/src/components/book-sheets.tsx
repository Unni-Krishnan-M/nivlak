"use client";

import {
  FRAME_COUNT,
  FRAME_SRC,
  LETTERBOX,
  type Tier,
  finalFrameRect,
  spreadAt,
} from "@/components/book-camera";
import { BOOK_PAGES, type BookPage } from "@/components/book-pages.content";

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

/** How many turns the pages need. The first page is already face up. */
export const TURNS = BOOK_PAGES.length - 1;

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
  const opening = BOOK_PAGES[0];

  return (
    <div
      data-stage
      className="absolute inset-0"
      style={{ perspective: "2200px" }}
    >
      {opening?.facing ? (
        <div
          data-left-page
          className="absolute z-[5]"
          style={{ display: "none" }}
        >
          <div
            data-ink
            className="flex h-full w-full flex-col justify-center py-[8%] pe-[12%] ps-[calc(10%+var(--facing-inset-start,0px))] text-slate-200"
          >
            <FacingCopy page={opening} />
          </div>
        </div>
      ) : null}

      {BOOK_PAGES.map((page) => (
        <div
          key={page.number}
          data-sheet
          className="absolute origin-left [transform-style:preserve-3d] [will-change:transform]"
        >
          {/* Front: the page you are reading. */}
          <div className="absolute inset-0 overflow-hidden [backface-visibility:hidden]">
            <PageFace side="front">
              <PageBody page={page} />
            </PageFace>
          </div>

          {/* Back: what lands on the left half once this sheet has turned. A
              running foot and nothing else -- the eye follows the new
              right-hand page, and a second column of type there would compete
              with it, but a blank half of the screen reads as a mistake. */}
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
      {BOOK_PAGES.map((page) => (
        <article
          key={page.number}
          className="mx-auto max-w-2xl px-6 py-24 text-slate-200"
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

/** The opening left-hand page: the statement, before the page that explains it. */
function FacingCopy({ page }: { page: BookPage }) {
  if (!page.facing) return null;
  return (
    <>
      <p className="mb-4 text-[clamp(0.6rem,0.9vw,0.75rem)] tracking-[0.35em] text-slate-400/80 tabular-nums">
        {page.number} &mdash; {page.title.toUpperCase()}
      </p>
      <h2 className="text-[clamp(1.7rem,3.5vw,3.4rem)] leading-[1.04] font-light text-balance text-white">
        {page.facing.headline}
      </h2>
      <span
        aria-hidden
        className="my-[1em] block h-px w-[38%] bg-white/20"
      />
      <p className="max-w-[30ch] text-[clamp(0.82rem,1.18vw,1.05rem)] leading-relaxed text-balance text-slate-300/85">
        {page.facing.subtitle}
      </p>
    </>
  );
}

/** A defined-terms list -- the letters of NIV, set against their meanings. */
function Terms({ page }: { page: BookPage }) {
  if (!page.terms) return null;
  return (
    <>
      {page.termsTitle ? (
        <p className="mb-[1.3em] text-[clamp(0.6rem,0.9vw,0.75rem)] tracking-[0.35em] text-slate-400/80">
          {page.termsTitle.toUpperCase()}
        </p>
      ) : null}
      <dl className="flex flex-col">
        {page.terms.map((term) => (
          <div
            key={term.letter}
            className="grid grid-cols-[1.4em_1fr] gap-x-[0.8em] border-t border-white/10 py-[0.9em]"
          >
            {/* The letter is the artwork on this page -- same silver as the
                lit page edge in the frame, so it reads as pressed into the
                paper rather than typed onto it. */}
            <dt className="text-[clamp(1.35rem,2.5vw,2.3rem)] leading-none font-light text-[#dce7f7]">
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

function PageBody({ page }: { page: BookPage }) {
  return (
    <div
      data-ink
      className="flex h-full w-full flex-col justify-center py-[8%] ps-[10%] pe-[calc(10%+var(--page-text-inset-end,0px))] text-slate-200"
    >
      {/* Portrait fallback. A full-bleed sheet is the whole window, so there is
          no facing page to print on and its copy is set above this page's own.
          layoutSheets decides which of the two is showing; they are never both
          on screen. */}
      {page.facing ? (
        <div
          data-facing-inline
          className="mb-[1.8em]"
          style={{ display: "none" }}
        >
          <FacingCopy page={page} />
        </div>
      ) : null}

      {page.terms ? (
        <Terms page={page} />
      ) : (
        <>
          <p className="mb-3 text-[clamp(0.6rem,0.9vw,0.75rem)] tracking-[0.35em] text-slate-400/80 tabular-nums">
            {page.number} &mdash; {page.title.toUpperCase()}
          </p>
          <h2 className="mb-[0.4em] text-[clamp(1.6rem,3.4vw,3.25rem)] leading-[1.05] font-light text-white">
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
        </>
      )}
    </div>
  );
}

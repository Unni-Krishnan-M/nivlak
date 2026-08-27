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
  type BookPage,
  type PageService,
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
          <div className="flex h-full w-full flex-col justify-start pt-[18%] pb-[8%] pe-[12%] ps-[calc(10%+var(--facing-inset-start,0px))] text-slate-200">
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

      {BOOK_PAGES.map((page, index) => (
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

          {/* Back: the left half of the spread this sheet turns you into. */}
          <div
            className="absolute inset-0 overflow-hidden [backface-visibility:hidden]"
            style={{ transform: "rotateY(180deg)" }}
          >
            <PageFace side="back">
              {/* This face IS the left-hand page of the next spread, so it
                  carries that page's verso if it has one. Where it does not,
                  it stays what it was: a running foot on bare paper. */}
              {BOOK_PAGES[index + 1]?.facing ? (
                <VersoPage page={BOOK_PAGES[index + 1]} />
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
 * The opening left-hand page.
 *
 * Laid out as a book chapter opener, which is a specific thing and not just a
 * big heading: sinkage (the text starts low, not centred), a drop cap on the
 * first paragraph, and the first sentence in small capitals to carry the eye
 * from that oversized initial back down to body size. Those conventions belong
 * to openers only, which is exactly why they appear on this page and on no
 * other -- consistency here means NOT repeating them.
 */
function FacingCopy({ page }: { page: BookPage }) {
  if (!page.facing) return null;
  const { headline, subtitle, intro, epigraph, note, figure } = page.facing;
  return (
    <>
      <div data-ink>
        {/* Headpiece: the ornament that fills the blank at a chapter's head. */}
        <Ornament className="mb-[1.4em] w-[42%] text-slate-300" />
        <p className="mb-4 text-[clamp(0.6rem,0.9vw,0.75rem)] tracking-[0.35em] text-slate-400/80 tabular-nums">
          {page.number} &mdash; {page.title.toUpperCase()}
        </p>
        <h2 className="text-[clamp(1.7rem,3.5vw,3.4rem)] leading-[1.04] font-light text-balance text-white">
          {headline}
        </h2>
        {/* Epigraph: the line a book sets under a chapter title, held off the
            margin by a rule so it reads as quoted rather than as body text. */}
        {epigraph ? (
          <p className="mt-[1.1em] border-s border-white/15 ps-[1em] text-[clamp(0.74rem,1vw,0.92rem)] leading-relaxed text-slate-300/70 italic">
            {epigraph}
          </p>
        ) : null}
        <span aria-hidden className="mt-[1.1em] block h-px w-[38%] bg-white/20" />
      </div>

      <p
        data-ink
        className="mt-[1em] max-w-[30ch] text-[clamp(0.82rem,1.18vw,1.05rem)] leading-relaxed text-balance text-slate-300/85"
      >
        {subtitle}
      </p>

      {intro ? (
        <p
          data-ink
          className="mt-[1.6em] max-w-[44ch] text-[clamp(0.76rem,1.02vw,0.94rem)] leading-relaxed text-slate-300/75 first-letter:float-left first-letter:me-[0.08em] first-letter:mt-[0.04em] first-letter:text-[3.4em] first-letter:leading-[0.82] first-letter:font-light first-letter:text-[#dce7f7]"
        >
          <span className="[font-variant-caps:small-caps] tracking-[0.06em] text-slate-200">
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

      {page.facing.services?.[0] ? (
        <LeadService service={page.facing.services[0]} />
      ) : null}
    </>
  );
}

// Plates are numbered in roman, the way a book numbers its illustrations --
// which also keeps them from being confused with the 01-07 of the sections.
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

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
    <div
      data-ink
      className="mt-[1.4em] border-t border-white/12 pt-[1.5em] lg:mt-auto lg:mb-[7%]"
    >
      <div className="flex items-start gap-[1.3em]">
        <Emblem
          name={service.emblem}
          className="w-[clamp(70px,8.8vw,126px)] shrink-0 text-slate-200"
        />
        <div className="pt-[0.2em]">
          <p className="mb-[0.55em] text-[clamp(0.5rem,0.7vw,0.62rem)] tracking-[0.34em] text-slate-400/55">
            PLATE {ROMAN[0]}
          </p>
          <p className="text-[clamp(0.92rem,1.45vw,1.3rem)] leading-tight font-light text-white">
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
          <Emblem
            name={service.emblem}
            className="mb-[1.1em] w-[clamp(38px,4.9vw,68px)] text-slate-300"
          />
          <p className="mb-[0.55em] text-[clamp(0.52rem,0.7vw,0.62rem)] tracking-[0.34em] text-slate-400/70">
            {ROMAN[from + i]}
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
function ServicesPage({ page }: { page: BookPage }) {
  if (!page.services?.length) return null;
  return (
    <>
      <ServiceGrid
        services={page.services}
        from={page.facing?.services?.length ?? 0}
      />
      <div data-ink className="mt-[2em]">
        {/* Tailpiece, closing the catalogue the way 01 closes its text. */}
        <Ornament className="w-[30%] text-slate-300" />
      </div>
    </>
  );
}

function VersoPage({ page }: { page: BookPage }) {
  return (
    <div className="relative flex h-full w-full flex-col justify-start pt-[18%] pb-[8%] pe-[12%] ps-[calc(10%+var(--verso-inset-start,0px))] text-slate-200">
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

function PageBody({ page }: { page: BookPage }) {
  return (
    <div
      className={`flex h-full w-full flex-col ps-[10%] pe-[calc(10%+var(--page-text-inset-end,0px))] text-slate-200 ${
        // Sinkage: a chapter opener starts low on the page rather than centred,
        // and both halves of this spread take the same drop so their first
        // lines sit on one line across the gutter.
        page.facing ? "justify-start pt-[18%] pb-[8%]" : "justify-center py-[8%]"
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
      ) : page.terms ? (
        <Terms page={page} />
      ) : (
        <div data-ink>
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
        </div>
      )}

      {/* Drop folio, flush with this page's outside margin -- the right. */}
      {page.facing ? (
        <p
          data-ink
          className="absolute bottom-[7%] end-[calc(10%+var(--page-text-inset-end,0px))] text-[clamp(0.55rem,0.8vw,0.7rem)] tracking-[0.3em] text-slate-400/40 tabular-nums"
        >
          {page.number}
        </p>
      ) : null}
    </div>
  );
}

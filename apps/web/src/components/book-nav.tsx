"use client";

import { BOOK_PAGES } from "@/components/book-pages.content";

// The navigation, set as a running head.
//
// A book puts the title on one side of the head and where you are on the
// other, with a rule under it. That is already a navbar, so this one is not
// dressed as a website's -- no pill, no blur panel, no drop shadow floating
// over the paper. It is the head rule of the book you are reading, which is
// also why it can sit on a hero that otherwise has no chrome at all without
// looking bolted on.
//
// Set BRIGHT rather than in the page's quiet greys: at slate-400/50 the seven
// numerals were the dimmest thing on the first screen and read as disabled,
// which is the wrong signal on the one row of the page that is a control. The
// wordmark is white/90, the items slate-200/80 rising to white, and the head
// rule white/25 -- the rule is what makes the bar read as one object rather
// than as type floating on a photograph.
//
// It belongs to the CLOSED book only. Once the spread is open this bar is
// wrong, and wrong structurally rather than by taste: its rule runs the width
// of the window, straight across the gutter, and no book has ever printed a
// running head across two pages. <BookIndex> below takes over from there.
//
// Both are markup only. <Book> owns the behaviour, because the scroll position
// a section lives at is a fact about the timeline and nothing here can know
// it: these are pinned pages, so "section 04" is a time on a playhead, not an
// element with an offset. Anything carrying data-nav-item is wired up by it,
// so the two share one click handler and one active-state pass.

export function BookNav() {
  return (
    <nav
      data-book-nav
      aria-label="Sections"
      className="absolute inset-x-0 top-0 z-[100] px-[5vw] pt-[3.4vh]"
    >
      <div className="flex items-center justify-between gap-6">
        <button
          type="button"
          data-nav-item
          data-index="-1"
          aria-label="Back to the cover"
          className="flex cursor-pointer items-center gap-[0.7em] text-white/90 transition-colors duration-300 hover:text-white"
        >
          <img
            src="/logo-mark.webp"
            alt=""
            aria-hidden="true"
            width={192}
            height={192}
            draggable={false}
            className="h-auto w-[clamp(17px,1.5vw,22px)] select-none"
          />
          <span className="-me-[0.3em] text-[clamp(0.58rem,0.75vw,0.7rem)] tracking-[0.4em]">
            NIVLAK
          </span>
        </button>

        <ul className="flex items-center gap-[clamp(0.55rem,1.4vw,1.5rem)]">
          {BOOK_PAGES.map((page, index) => (
            <li key={page.number}>
              <button
                type="button"
                data-nav-item
                data-index={index}
                data-current="false"
                className="group flex cursor-pointer items-baseline gap-[0.5em] text-[clamp(0.52rem,0.68vw,0.64rem)] tracking-[0.26em] text-slate-200/80 transition-colors duration-300 hover:text-white data-[current=true]:text-white"
              >
                <span className="tabular-nums">{page.number}</span>
                {/* The titles are the first thing to go when the head runs out
                    of room; the numerals alone still say where you are. */}
                <span className="hidden xl:inline">
                  {page.title.toUpperCase()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* The head rule. */}
      <span aria-hidden className="mt-[1.7vh] block h-px w-full bg-white/25" />
    </nav>
  );
}

/**
 * The thumb index: navigation the way a book does it once it is open.
 *
 * A dictionary or a bible cuts notches into the fore-edge so a thumb can find
 * a letter without opening the book flat. That is the device here -- a stack
 * of tabs on the outer edge, each a numeral and a notch, the current one cut
 * deeper and showing its title.
 *
 * It sits at the right edge of the window rather than at the measured edge of
 * the paper because on any wide viewport the right-hand page bleeds off the
 * screen -- the window edge IS the fore-edge. And unlike the running head it
 * never crosses the gutter, which is the whole reason it exists.
 */
export function BookIndex() {
  return (
    <div
      data-book-index
      className="absolute end-0 top-1/2 z-[100] -translate-y-1/2 pe-[clamp(0.9rem,2vw,2rem)]"
    >
      <ul className="flex flex-col items-end gap-[clamp(0.5rem,1.3vh,0.9rem)]">
        {BOOK_PAGES.map((page, index) => (
          // Padding on the LI and not the button: the button is the flex
          // row the notch and numeral sit in, and padding there would push the
          // notch off the fore-edge. These numerals are 10px tall and this is
          // the only navigation a phone gets.
          <li key={page.number} className="py-[0.35rem]">
            <button
              type="button"
              data-nav-item
              data-index={index}
              data-current="false"
              aria-label={`${page.number} ${page.title}`}
              className="group relative flex cursor-pointer items-center justify-end gap-[0.75em]"
            >
              {/* The titles are hidden until a tab is current or hovered, so
                  the index is a column of numerals at rest and names itself
                  only where you are looking. They stay `lg`-only, and two
                  things that were tried below it are the reason.

                  In FLOW the label reserves width, and `layoutSheets` measures
                  this container's left edge to publish `--page-index-inset`,
                  the reservation that keeps the recto's type off the tabs. At
                  1440 that is what it is for; at 443 the widest title would
                  take about 108px off a 443px column, a quarter of the
                  measure. Out of FLOW it prints over the page instead --
                  measured, PERSPECTIVES covered 663px of 05's recto headline,
                  and a scrim behind it only turned the collision into a box
                  sitting on the headline. The page's right margin there is 10%
                  of 443, about 44px, against a 103px title: no placement in
                  the margin can hold it.

                  So below `lg` the name is not here at all. <BookRunningHead>
                  puts it in the empty strip at the top of the window, which is
                  where a book prints a running head and the one band on this
                  page with nothing in it. */}
              <span className="hidden translate-x-[0.4em] text-[clamp(0.6rem,0.66vw,0.66rem)] tracking-[0.26em] whitespace-nowrap text-slate-200 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-70 group-data-[current=true]:translate-x-0 group-data-[current=true]:opacity-100 motion-reduce:transition-none lg:inline">
                {page.title.toUpperCase()}
              </span>
              <span className="text-[clamp(0.6rem,0.66vw,0.66rem)] tabular-nums tracking-[0.2em] text-slate-400/80 transition-colors duration-300 group-hover:text-slate-200 group-data-[current=true]:text-white motion-reduce:transition-none">
                {page.number}
              </span>
              {/* The notch. The current tab is cut deeper into the edge. */}
              <span
                aria-hidden
                className="block h-px w-[10px] bg-white/35 transition-all duration-300 group-hover:w-[16px] group-hover:bg-white/55 group-data-[current=true]:w-[24px] group-data-[current=true]:bg-white/85 motion-reduce:transition-none"
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}


/**
 * The running head: which chapter is face up, below `lg` only.
 *
 * <BookNav> fades out when the pages arrive and the thumb index takes over,
 * and the index shows its titles only from `lg` up -- see the note there for
 * the two placements that were measured and rejected. That left a narrow
 * window with seven unlabelled numerals as its entire navigation, which is a
 * page a visitor cannot form a map of.
 *
 * It is `aria-hidden` on purpose. Every tab in the index already carries
 * `aria-label="04 Work"`, and the page prints its own drop folio; a third
 * voice saying the same words is noise to a screen reader. This is an
 * orientation cue for the eye.
 *
 * <Book>'s syncNav fills it, because that is where the current chapter is
 * already worked out for `data-current` -- and it writes only when the answer
 * changes, which matters on a callback that runs every scrubbed frame.
 */
export function BookRunningHead() {
  return (
    <p
      data-running-head
      aria-hidden
      className="pointer-events-none absolute end-0 top-0 z-[100] pt-[2.1vh] pe-[clamp(0.9rem,2vw,2rem)] text-[0.6rem] tracking-[0.3em] text-slate-300/75 tabular-nums opacity-0 transition-opacity duration-500 motion-reduce:transition-none lg:hidden"
    />
  );
}

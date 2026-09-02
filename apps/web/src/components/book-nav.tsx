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
          className="flex cursor-pointer items-center gap-[0.7em] text-slate-300/70 transition-colors duration-300 hover:text-slate-100"
        >
          <img
            src="/logo-mark.webp"
            alt=""
            aria-hidden="true"
            width={192}
            height={192}
            draggable={false}
            className="h-auto w-[clamp(17px,1.5vw,22px)] opacity-85 select-none"
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
                className="group flex cursor-pointer items-baseline gap-[0.5em] text-[clamp(0.52rem,0.68vw,0.64rem)] tracking-[0.26em] text-slate-400/50 transition-colors duration-300 hover:text-slate-200 data-[current=true]:text-white"
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
      <span aria-hidden className="mt-[1.7vh] block h-px w-full bg-white/10" />
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
          <li key={page.number}>
            <button
              type="button"
              data-nav-item
              data-index={index}
              data-current="false"
              aria-label={`${page.number} ${page.title}`}
              className="group flex cursor-pointer items-center justify-end gap-[0.75em]"
            >
              {/* The titles are hidden until a tab is current or hovered, so
                  the index is a column of numerals at rest and names itself
                  only where you are looking. */}
              <span className="hidden translate-x-[0.4em] text-[clamp(0.5rem,0.66vw,0.62rem)] lg:inline tracking-[0.26em] text-slate-300 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-70 group-data-[current=true]:translate-x-0 group-data-[current=true]:opacity-100">
                {page.title.toUpperCase()}
              </span>
              <span className="text-[clamp(0.5rem,0.66vw,0.62rem)] tabular-nums tracking-[0.2em] text-slate-400/45 transition-colors duration-300 group-hover:text-slate-200 group-data-[current=true]:text-white">
                {page.number}
              </span>
              {/* The notch. The current tab is cut deeper into the edge. */}
              <span
                aria-hidden
                className="block h-px w-[10px] bg-white/20 transition-all duration-300 group-hover:w-[16px] group-hover:bg-white/45 group-data-[current=true]:w-[24px] group-data-[current=true]:bg-white/75"
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

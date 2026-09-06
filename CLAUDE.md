# Nivlak

Turborepo monorepo, pnpm workspaces. Next.js 16 marketing site + Express/tRPC
API, MongoDB via Prisma, Better-Auth. Scaffolded by Better-T-Stack (`bts.jsonc`
records the exact generator invocation).

## Layout

| Path | What |
| --- | --- |
| `apps/web` | Next.js 16 App Router site. The landing page is the whole reason this repo is interesting — see below. |
| `apps/server` | Express host for the tRPC router. Thin; the logic is in `packages/api`. |
| `packages/api` | tRPC routers + request context. |
| `packages/auth` | Better-Auth configuration. |
| `packages/db` | Prisma client and schema. Owns all `db:*` scripts. |
| `packages/env` | Zod-validated env, split `server.ts` / `web.ts`. Imported for side effects (`import "@nivlak/env/web"` at the top of `next.config.ts`) so a missing var fails the build, not a request. |
| `packages/ui` | Shared shadcn/ui primitives and design tokens. |
| `packages/infra` | Alchemy IaC for the Cloudflare deploy. |
| `tools/` | Frame-pipeline and QA scripts for the landing page. |

## Commands

Run from the repo root; turbo filters to the right workspace.

```bash
pnpm dev              # web (:3001) + server (:3000)
pnpm dev:web          # web only
pnpm build
pnpm check-types      # tsc across every workspace
pnpm db:push          # prisma db push
pnpm db:studio
pnpm deploy           # alchemy deploy (Cloudflare)
```

There is no lint task and no test suite. `pnpm check-types` and a build are the
only automated gates — which is why the landing page has a screenshot harness
(below), because neither of them can see it.

## Deploy: two paths, and they disagree

Both are wired up and they are not the same target.

- **Cloudflare** — the one `bts.jsonc` and `packages/infra` describe.
  `@opennextjs/cloudflare` + `wrangler.jsonc` + `alchemy.run.ts`; `pnpm deploy`.
- **Netlify** — `netlify.toml` at the root, added later, builds
  `pnpm --filter web build` and publishes `apps/web/.next` via
  `@netlify/plugin-nextjs`.

Before touching build config, find out which one is actually serving
production. Changing `next.config.ts` or the output mode affects both.

## The landing page

`apps/web/src/app/page.tsx` is one pinned section and nothing else. No header,
no footer, no panels.

```
<Book />   one section, one pin, one timeline    +=779%
              0%..250%   the book opens (91-frame canvas scrub)
            250%..779%   six sheets turn over the frame it lands on
```

The scroll length is derived, not written down: `VH_PER_UNIT` (67% of viewport
per timeline unit) times the units the pages need, which come from
`BOOK_PAGES.length`. Add a page and the scroll grows by exactly one page's
worth with the cadence unchanged — never hardcode the total.

**It is one section on purpose.** It used to be two — a reveal and a pages
section — and two stacked full-height pins cannot be joined without a seam: the
first has to travel its own height before the second reaches the top of the
window, so for a full viewport of scroll you saw the finished book slide up
while an identical copy slid in underneath, split by a hard horizontal line.
Pulling the second up to close the gap only moved the problem — it then crept
over the first while the book was still opening. Do not split it again.

### Files, in the order to read them

0. **`book.tsx`** — the section, the pin, the single timeline, the canvas and
   the frame cache. Start here for anything about timing.
1. **`book-camera.ts`** — pure arithmetic, no DOM. This is where the reveal is
   *designed*; everything else paints what it returns. Read it first.
   - `planAt(u, w, h)` → what to draw at scroll progress `u`.
   - `spreadAt(w, h)` / `finalFrameRect(w, h)` → where the open book's halves
     land on screen, for anything that sits **on** the book rather than in it.
2. **`book-frames.generated.ts`** — generated, never hand-edit. Frame count,
   dimensions, letterbox colour, and a measured per-frame bounding box of the
   book so the pan follows the real footage instead of a guess.
3. **`book-sheets.tsx`** — the sheets' markup and geometry, and nothing that
   animates. `layoutSheets()` puts them on the book; `paintSheets()` derives
   z-order and shading from their angles. `<Book>` finds them by data attribute
   inside its own GSAP scope, so no refs are plumbed across.
4. **`book-pages.content.ts`** — the sections' copy, and the pagination that
   turns it into spreads. See "Chapters and spreads" below.

### Chapters and spreads are not the same thing

`BOOK_PAGES` is what you **write**: one entry per chapter. `BOOK_SPREADS` is
what the book **prints**: one entry per turnable sheet. They are usually the
same list, and deliberately not always.

An illustrated chapter — one whose `services` carry an `image` — holds its
entries as a single undivided run, and `book-pages.content.ts` decides how much
of that run lands on each page from the slot counts at the bottom of the file.
Add a service and the spread rebalances; add enough and the chapter opens a
second spread on its own. **Nothing in the content says which page an entry is
on**, which is the whole point: adding one is a one-line change.

What follows from that:

- **Anything that lays out or animates reads `BOOK_SPREADS`.** `TURNS` counts
  sheets, and a chapter running to two spreads is two sheets. 02 is the only
  chapter that still does.
- **Every nav item now carries a CHAPTER.** There was a second currency until
  03 stopped paginating: its contents list carried a SPREAD, the one piece of
  navigation in the book that addressed a page, because six stages were six
  pages and a chapter number sent all six to the half-title the reader was
  already looking at. Those six drive a window now, so `data-spread`,
  `spreadOfEntry` and the seek that served them are gone.
- **Only the navigation reads `BOOK_PAGES`.** A chapter keeps one tab in the
  thumb index however many spreads it runs to, so the tabs carry a *chapter*
  index: `<Book>` maps it through `FIRST_SPREAD_OF_CHAPTER` to seek, and
  through `CHAPTER_OF_SPREAD` to light the active one. Give a tab a spread
  index again and the index goes dark on every continuation.
- **`continued` and `lastOfChapter` are both needed and are not each other's
  negation.** A chapter of one spread is the first *and* the last. `continued`
  suppresses the opener devices; `lastOfChapter` is what the tailpiece keys off.
- **Only the catalogue paginates.** 03, 04 and 05 are each one spread: 04 and
  05 because a run behind one window is never cut — the index has to reach
  every entry from wherever it is printed — and 03 because its six stages are
  a run the reader is meant to COMPARE, which is a thing a spread does and two
  spreads cannot. `expandChapter` opts a chapter
  out when its entries carry `stage` or `project`, or when none carries an
  `image` — a question about the ENTRIES and never a list of chapter numbers,
  which is how 04 crossed from one side of it to the other without that file
  learning its number, and how 03 later crossed the other way. The `stage` and
  `project` tests come BEFORE the `image` test, because their entries carry
  photographs and the catalogue would otherwise claim them and cut six stages
  three to a page at 42% of a text column.

### Five settings, and the data picks which

A run of entries is set one of five ways, and nothing says which: the shape of
the entries decides, the same way it decides whether the chapter paginates.

| The entries carry | Setting | Where |
| --- | --- | --- |
| `stage` | process spread — six ruled rows, three to a page, all six printed | 03 |
| `project` | project stage — a selectable 16:9 plate over its facts | 04 |
| `image` | catalogue — photograph beside copy, alternating sides | 02 |
| `perspective` | perspectives — an index of six theses on the verso, a struck plate and its argument on the recto | 05 |
| neither | engraved — a lead plate over a modular grid | — |

The engraved grid is the fallback and currently nothing selects it: it was 05's
setting until 05 became the perspectives. It is kept because it is what a run
with no shape at all should print, not because a chapter is using it. The
`record` setting — a ruled register, which 04 was for one revision — was
removed with the same change; `git log` has it if it is ever wanted back.

`isPlateSection()`, `isProjects()`, `isIllustrated()` and `isPerspective()` ask
the question of the **whole run**, not of each entry, because the answer is the
setting for the page. Two settings down one page read as two lists stacked.

**The order of those questions is load-bearing, and `isIllustrated()` is the
one that lies.** Both 03's stages and 04's projects carry `image` as well, so
`isIllustrated()` answers true for all three of the picture-bearing settings.
`isPlateSection()` and `isProjects()` are therefore asked FIRST, in
`book-sheets.tsx` and in `expandChapter`, and the two have to agree: a run that
answers "what setting is this" twice is a bug in one of the two places, not a
chapter with two settings.

It is not only the dispatch that has to ask in that order. Any test written as
`!isIllustrated(...)` meaning "not the catalogue" is a bug waiting for the day
another setting gains pictures — which has now happened twice. The tailpiece in
`ServicesPage` was exactly that, and the day 04's records gained plates the
ornament **and the colophon under it** vanished from the end of the chapter:
the one page in the book that has to carry the line saying which entries are
studies. It names every picture-bearing setting now
(`!illustrated && !projects && !perspective`), and the list grows rather than
the test getting cleverer. Ask what setting a run is in, never whether an entry
happens to have an image.

**03 is a process spread: six stages, all six printed, three to a page.** It
has been three things — six one-line `steps`, then four paginated spreads one
stage to a page, then one spread with a window — and the window is the one
worth understanding, because it was reverted deliberately.

**Why the window went.** Its argument was that six stages a page apart are six
page turns to compare two of them, and a procedure is the thing in this book a
reader most wants to compare. That was true, and it was the wrong fix: it
bought comparison by hiding five of the six behind a click. A procedure is the
one chapter a client reads to find out what they are BUYING, and a reader who
never clicks learns that the studio has a process and nothing about it. A
spread answers both at once — six rows across two facing pages compare at a
glance, which is what a spread is *for* and what a scrolling page cannot do —
and nothing is hidden. **Nothing in this chapter may go behind a gesture.**

**It also ends the collapse this file has been warning about.** For one
revision 03, 04 and 05 were three consecutive chapters set as an index on the
verso and a window on the recto, and the standing note here is that two
chapters set the same way one spread apart stop reading as two chapters. There
are two windows again, and they are 04 and 05, which are held apart by the
shape of their rows and their windows: 04's rows are a small tracked category
over a display title and its window is a photograph of software; 05's lead with
a large serif numeral and carry the thesis itself, and its window is a struck
drawing. That is a narrower margin than it was — 05's rows were one line of
tracked capitals until they took the thesis — so see the note under 05. **A
third window is the thing not to add.**

**Both pages share one grid template**, `minmax(0,1.2fr)` for a head and then
one equal row per stage, so stage 01 sits on exactly the line stage 04 does and
the six rules run straight across the gutter. That is `<ServiceEntries>`'s
device and it is here for the same reason: rules that *nearly* line up read as
a mistake, and the reader is being invited to compare rows, which they can only
do if the rows are on lines. The row count is derived — seven stages would set
as four and three, both grids taking four rows so the recto's last is blank,
which is what a book does rather than respacing one page against the other.

**It is over-subscribed, and every number in it was measured.** Six stages do
not comfortably fit two pages of 699px, and the levers that made it fit are all
recorded in `book-sheets.tsx`. Read those comments before changing any of them;
the short version is that the type is already at the floor this file warns
about elsewhere, so nothing here may be fixed by making something smaller.

**A stage has no `body`, and that is what bought the page its air.** It had
one — a sentence under each headline — and with it in, a row used 180 of its
181 pixels: rules sat directly on type and six rows of that read as a table
rather than as a chapter. The description is the right field to lose because it
is the only one that restates another, elaborating the headline printed
directly above it, where the activity run, the deliverable and the outcome each
say something nothing else on the page says. It also makes the row ONE object
at every size, since it was already dropped below `lg`. There is now about 30px
between one stage's outcome and the next stage's rule. **If something has to be
added back to a row, something else comes out — the page has no slack.**

- **The chapter opening lost its drop cap and its epigraph.** The head shares a
  grid with three stage rows: at 1440x900 the four slots have 699px between
  them, a row will not set below ~180 of those with everything printed, and the
  head therefore has ~200. A drop cap is 3.4em tall by definition, so the
  shortest paragraph that can carry one is three lines — measured at 339px in a
  187px slot, printing straight through stage 01. 02 has no intro either, for
  the same reason: a verso carrying the chapter's entries has no room for an
  opening paragraph as well. The epigraph went next, for 27px, because the
  description under it says what it said and only one of the two is the
  brief's.
- **The spread takes an ordinary page's sinkage, not an opener's.** `pt-[18%]`
  is 130px of the 887 this sheet has. With it, the three rows and the head came
  to 801px against 699 available; at 8% they have 771 and it fits. Both halves
  still take the same drop, which is the part that actually matters — the first
  lines sit on one line across the gutter.
- **BOTH pages reserve the drop folio**, where normally no page has to.
  `VersoPage` and `PageBody` print it at 7% of the page HEIGHT while their own
  bottom padding is a percentage of its WIDTH — 8% of ~725 is 58px against a
  folio whose top edge is 73px up. Every page that stops short of its own
  padding never sees the 15px they overlap by; this one fills its page to the
  last pixel by construction, and stage 03's outcome printed through
  "03 — APPROACH". Reserved in vh, because the folio is placed in vh.
- **The plate is a FIXED width**, where every other plate in the book is a
  percentage of its column. The recto is 434px wide against the verso's 562 —
  the thumb index is reserved out of the right-hand page and nothing out of the
  left — so a percentage printed stage 01 half as large again as stage 04
  across the gutter. Six plates a reader is invited to compare have to be one
  size. It keeps the file's own 16:9; a 4:3 crop was 31% more picture for the
  same width and cost 25px of every row, which is 25px the page has not got.
  Cropping the page's air away to enlarge a plate that is a texture at either
  size is the wrong way round.
- **The copy was cut to the RECTO's measure, which is the binding one.** Two
  lines of description in a 434px page is about 88 characters; two lines of
  outcome in the deliverable table is about 55. A sentence over either ran to a
  third line, and a third line on three rows overflows the page. That is why
  every description and every outcome in this chapter is shorter than it was.
- **The plate reads as a texture and that is the price of printing all six.**
  These photographs are *made* of small type — a notebook of interview notes, a
  strategy blueprint, a wireframe sheet, an architecture diagram, a deployment
  pipeline, an analytics dashboard — and at 132px none of it can be read. The
  window could read them and hid five. A picture a reader cannot decode is
  worth less than a stage a reader never opens, but it is a real cost and it is
  written down rather than left to be found as a bug.
- **The row is a GRID and the plate changes which rows it spans.** On a spread
  the plate sits beside the headline, with the deliverable table running the
  full measure under both. Below `lg` the whole chapter is on one sheet and
  that shape does not fit: measured at 390x844 the face clips at 781px and six
  rows came to 866. The fix is not a smaller plate but a TALLER one — spanning
  the deliverable rows as well, the picture takes its height from them and
  costs the row nothing, where beside the headline alone it cost 23px a row and
  138 over the chapter. **Spanning does not work on a spread**, which was tried:
  it puts the deliverable table in the narrow column, the outcome wraps to a
  third and fourth line, and the six plates come out four different heights —
  the one thing they may not be. Line numbers rather than named areas:
  `grid-template-areas` through an arbitrary variant is one string that has to
  be got right twice.
- **The slot template is `lg`-only, and that is a correctness fix.** Below `lg`
  both grids render into the same column — the facing copy above, the page's
  own below. With `h-full flex-1` on each, the first took the entire column and
  the second was handed zero height: stages 04, 05 and 06 were in the DOM at
  0px. Auto rows down there, so the two stack at their content height.
- **Two things go at small sizes and each has its own threshold.** The ACTIVITY
  RUN goes below `lg`, and it hurts: it is the brief's KEY ACTIVITIES and it is
  a fact rather than a restatement. It goes because it is the largest thing
  left in the row — 33px of a 94px landscape row — and because what a stage
  PRODUCES survives it: the deliverable and the outcome are the two lines a
  client is deciding on, and they print at every size. The chapter DESCRIPTION
  goes below 480px of viewport HEIGHT, where the head cell has 104px and needs
  138 with it in; the head overflows first because a chapter opening cannot be
  made shorter — the numeral, the title and the rule are what say which chapter
  this is.
- **The arc is `hidden lg:flex`.** Below `lg` it would sit between stage 03 and
  stage 04 — a summary of six stages printed halfway down them — for 28px the
  page does not have. It is a device for a SPREAD, where it heads the second
  page; a column has no second page to head.
- **`data-process-run` is a hook for `tools/scroll-shots.mjs`, not styling.**
  Every fit on this spread is a measurement, the slots overflow silently
  because `minmax(0,1fr)` lets them, and a probe that has to guess which div is
  the grid measures the wrong thing. Named `process-run` and not `stage-run`:
  `layoutSheets` owns `[data-stage]`, and near-misses on that selector have
  cost a day.

**The arc is at the HEAD of the recto and the brief asked for it at the foot.**
That is the one place this chapter knowingly departs from the brief, and the
reason is the grid: the verso spends its head slot on the chapter opening, so
the recto has to spend a slot of the same height on something or its three rows
ride up and none of the six rules line up. So IDEAS → STRATEGY → PRODUCT →
GROWTH is set there, hung off the bottom of the slot where it reads as a
running head over the second half. Moving it to the foot costs the alignment of
all six rows; it is one `justify-end` away if that trade is ever judged the
wrong way round.

**The arc is not the arc that was removed.** The old one named the six stages
and was a restatement of the list beside it. These four are a level up — no
single stage can say that the whole procedure turns an idea into growth, and
nothing else on the spread says it either.

**The chapter kept its note and still has no tailpiece.** The closing page had
four things on it: an arc, a value list of the six deliverables, the note, and
a call to action. The value list is now printed in full on the spread itself,
one deliverable per row, so it would be the same list twice within eight
inches. The call to action went for 05's reason — 07 is four sheets later and
is the whole of that argument. The note is on the RECTO's head slot rather than
the verso's, because the verso ran out of page: its head has ~200px and the
chapter head takes 189. It also lands the line where it is of most use, at the
reader halfway through the six rather than the one who has not begun.

**04 is a project stage: four studies, one window, one spread — and it keeps
03's ORDER even though 03 is no longer a page like it.** Head, rule, label and
plate number, plate, headline, sentence, the run of work, and two ruled rows
hung off the foot. That was `StagePlate`'s order, and `StagePlate` is gone with
the window it belonged to, but the order is not arbitrary and did not go with
it: a reader arriving on either page asks the same three questions in the same
sequence — what is this, what does it look like, and what would it involve.
03's rows still answer them in that order, six times smaller. It also fills a
page that was a third empty; with the plate at the very top and nothing above
it the letterpress ran out two thirds down and the colophon sat alone at the
foot with a hole between them.

What keeps 04 from collapsing into 03 is that 03 prints SIX stages at a glance
and this prints ONE project at a time — six small ruled rows against a single
16:9 window that changes under a click. They are now the two ends of the same
trade, one chapter apart, which is a contrast rather than a repetition.

**04 is a project stage: four studies, one window, one spread.** It has been
three things now — a catalogue, a register, and this — and the two rewrites are
worth knowing because each fixed what the one before it could not say.

As a catalogue it read Web Applications / AI Platforms / SaaS Products / Mobile
Apps: 02's entries one spread later with the pictures taken off. As a register
it was five ruled ledgers with a `status` on every one, which fixed the
duplication and answered *which of these exists*. What it could not answer was
*what does the work look like*: its plates sat at about 150px beside the rows,
and these four images are pictures of software — panels, table rows, the
direction a graph is read in — where everything worth printing is small. At
150px an interface is a texture.

The stage gives one of them the full measure of the recto and lets the index
change which. That is also why the chapter costs one spread instead of two:
`+=1101%` became `+=1021%`, and 03 doing the same took it to `+=779%`.

Consequences worth knowing before touching it:

- **The four projects are 02's first four services again**, in the brief's own
  words, and that is the repetition the register was built to remove. It is
  survivable only because the two chapters are now set nothing like each other
  and because every entry here carries `Nivlak Lab · Concept` where 02's are
  offers. Give any of these four a specific identity — a name, a thing that
  exists — and the overlap goes. It is recorded above the chapter in
  `book-pages.content.ts` so that nobody has to rediscover it.
- **`status` is required, and the page says it four times.** None of these is
  delivered client work. It prints on the label line under the head, at the
  size 03 sets a stage's subject; the plate number beside it puts the picture
  in a numbered series rather than presenting it as a record; the colophon says
  it again in a sentence; and `cta` says it once more by being an enquiry
  rather than the brief's "VIEW PROJECT →" — there is nothing
  to view, no route exists, and inventing one would mean inventing the results
  to put on it. A large photograph of an interface is believed the moment it is
  seen, which is why the label is not left to do the work alone.
- **The colophon changes PAGE below 480px of viewport height.** Probed at
  844x390: the sheet measures 475px in a 390px viewport — it is sized to the
  photographed page, which at that aspect is taller than the window — so it
  hangs 40px off the top and 45px off the bottom and the section clips both.
  That measurement is the reason for three separate rules in this file; it is
  written down here because this is where it first cost something. The recto
  there runs index + plate + category + title + metadata + action and lands the
  colophon at y=379, inside the clipped band. The
  verso at that size is carrying a head, an epigraph and a subtitle in 390px
  and has the room, because portrait has already dropped its engraving. It is
  printed in both places and shown in one; `display:none` keeps the other out
  of the accessibility tree. The line saying these are studies is the last
  thing in the chapter that may be dropped for space, so it moves rather than
  disappears.
- **The description is the only thing that goes below `lg`-height**, and only
  below 480px — unlike 03's rows, which lose both their description and their
  activity run at `lg`. Six stages have to share a portrait sheet; a project
  does not, because only one of the four is showing. Measured at 390x844 the whole recto
  ends ~100px short of the sheet with the paragraph in. Everything that is a *fact* — category, status, services,
  platform — stays at every size; the sentence that goes is the one the plate
  and the headline have already said.
- **All four plates are in the markup and three are transparent**, sharing one
  grid cell, so the 16:9 box is fixed from the first paint and nothing below it
  moves on a swap. Rendering only the current one would mean a decode per
  click — a blank frame in the window, which is the one thing a window may not
  do. The first is `loading="eager"`; the other three are behind a click that
  has not happened.
- **There are TWO indices, and the second one is not redundant.** 04's window
  shows one project at a time, so `ProjectHeadIndex` is not resolving an
  ambiguity — nothing about which project is showing is unclear. What it does
  is give the head a name on the left and numbered notches on the right, and a
  second
  place to change the plate for a reader whose eye is already on the recto
  rather than back across the gutter. **One instance, not one per project**:
  the heads are stacked four deep in one grid cell with three transparent, and
  an index inside each would be sixteen buttons for four destinations, twelve
  of them in an `aria-hidden` subtree. It is `hidden lg:flex`, because below
  `lg` the verso's own index is a few inches up the same collapsed sheet.
- **The status is the label line, on the left, where 03 sets its subject** —
  because on this page it is the subject: what these four are is the first fact
  about them. That is now the FOURTH place the chapter says it (see below).
- **The index is on the verso, where an engraving used to be, and it changes
  shape at `lg`.** It was a running head above the plate — four tracked words,
  WEB AI SAAS MOBILE — which is a tab strip's worth of information: a reader
  choosing between four studies wants to know what each one *is*, and those
  words only existed on the plate they had to choose first. So it took the
  page, and took the room to name things: category as a label, the project's
  own title under it.

  Below `lg` it collapses back to that one compact row, and that is not a
  preference. Portrait puts the whole spread on one 844px sheet, and four
  two-line rows measure 143px there against 30 for one strip — keeping them
  printed the metadata, the action and the colophon through each other. The
  titles are also the one thing on that page that repeats itself: the current
  project's title is already set under the plate a few inches down.

  Two more measurements from the same page. The strip's current mark is an
  underline on the button below `lg`, not the inline rule the spread uses,
  because the rule costs width and there is none — the four items needed 335px
  of a 284px column and MOBILE ran 51px past the page edge. And the list is
  `flex-wrap`, as the backstop for a phone narrower than 390.
- **It is not 05's index, though both sit on a verso and share a mechanism.**
  05's rows are now two lines as well, so this is the narrowest that margin has
  ever been: what separates them is that 05 leads with a LARGE SERIF NUMERAL
  and its second line is the thesis itself, where these lead with a small
  tracked category and a display title. One is a list of positions, this is a
  table of contents with titles in it. Two adjacent chapters running the same
  mechanism read as one repeated page unless the settings differ, which is the
  same failure that collapsed 04 into 02 when both were catalogues.
- **The epigraph is not "a studio is what it has built".** It was, when one of
  the five entries was a delivered build. With four concepts it would be the
  page arguing against its own colophon two inches away.

**05 is a volvelle, and that is why a page in this book is allowed to change
without turning.** Its six perspectives are not six pages: they are six answers
to one question, and a reader wants to compare them rather than read through
them. A volvelle — the rotating paper disc bound into books since the
thirteenth century — is the printed precedent for a page that shows one of
several states in a fixed window, and it is the only device in the book that
moves without the scroll moving it.

**It has pictures now, having had none.** Every entry carried a struck emblem,
and the reason was written down at the time: no artwork had been supplied, and
the brief asking for a picture also forbade stock photography, which is the
same answer twice. Artwork has now been supplied. `PERSPECTIVES_VISUAL.png` is
cut into six 16:9 plates and one tall column by
`tools/build-perspective-plates.sh`, and the emblems are gone — an emblem and a
plate are two pictures of one idea on one page, and the emblem was the one
standing in for the other.

**The plates are MASKS, which is the third kind of picture in this book and the
reason this chapter needed no toning script.** `build-process-plates.sh` and
`build-work-plates.sh` both exist to solve one problem: a photograph has a
GROUND, and a ground darker than the page is a hole punched in it while a
lighter one is a label stuck on it. This source is line work on a flat pale
ground, so it is keyed the way the engravings in `fetch-plates.sh` are —
negate the luminance, ship the negative, let the page paint the silver and use
the file as a CSS mask. What lands on the paper is the drawing and the
photograph of the page shows through everywhere else. **There is no ground to
tone and none to get wrong.**

- **`mask-mode: luminance` has to be declared, and this is the trap.** The mask
  files are greyscale with no alpha channel, so under the default
  `match-source` the browser reads their alpha — opaque everywhere — and every
  plate paints as a solid silver rectangle. That is exactly what the first
  render of this chapter produced: six of them on one spread.
  `<EngravedPlate>` does *not* declare it and 01 and 07 render correctly
  anyway, which makes this worse rather than better — the two that work are
  relying on undeclared behaviour the new files did not get. **Declare it on
  anything new.**
- **The ink is capped at 50%, which the engravings are not.** Three panels in
  this artwork are solid dark, and a solid dark area negates to solid white,
  which is full opacity. Struck at full strength those print as near-white
  blocks and become the brightest thing in the monograph — brighter than any
  headline on any page. Proofed against the real paper: 0.75 leaves holes in
  the page, 0.62 is still the lightest thing on the spread, 0.50 reads as
  tinted plates with the line work intact. A tonal operator cannot separate the
  two, because a hairline and a filled panel are the same black in the source.
- **Six crops, not one picture six times.** The picture that does not change
  while everything around it does is the one the eye stops believing. Each is
  chosen for its subject and all six are cut 16:9, so the window is one box at
  every setting. They are ASSOCIATIVE, not documentary, which abstract artwork
  is allowed to be — unlike 04's plates, which are pictures of software and are
  believed as evidence the moment they are seen.
- **Ink coverage is the number that judges a crop**, and the only way to judge
  one is to proof the composite. The whole artwork measures 15.7%; anything at
  or below that is a tile of empty page with a detail in the corner. The margin
  column was first cut from the sparsest part of the drawing at 13.6%, and at
  150px wide it read as a smudge. The script's header has the table.

**The index carries the THESIS now, not just the category.** It was six
category names, which told a reader the topic of each perspective and not the
view — and a chapter called Perspectives whose index holds no opinion is a
contents page again, which is the thing this chapter was rebuilt to stop being.
All six positions are now readable with nothing hovered, clicked or scrolled,
and the window is where you go to read one properly rather than the only place
to find out what it says.

**That is also the sharpest the 04/05 collapse has ever been.** Both are an
index on a verso driving a window one spread away, and both rows are now two
lines. The standing warning is that two chapters set the same way one spread
apart stop reading as two chapters. What holds them apart is the shape of the
row and the kind of picture: 04 leads with a small tracked category over a
display title and its window is a photograph of software; 05 leads with a LARGE
SERIF NUMERAL over a tracked category and a sentence, and its window is a
struck drawing. 05's verso also carries the column plate, which 04's has no
equivalent of. **If either of those is levelled, they collapse.**

Consequences worth knowing before touching it:

- **The index is on the verso and the window is on the recto, which are
  different sheets.** A verso is the back of the sheet before it, so the six
  buttons and the six panels they drive sit in sibling subtrees with nothing
  above them to hold state. `<Book>` therefore queries from the DOCUMENT, not
  from the section, and sets every copy. There are three copies of the index —
  the verso, the hidden portrait duplicate inside `data-facing-inline`, and the
  reduced-motion column — and keeping them all in step is simpler than deciding
  which one is live.
- **HOVER PREVIEWS, CLICK PINS, and the two are different state.** 05 asks for
  it and 04 does not, which is why it is
  `bindWindow("perspective", { preview: true })` and not the behaviour: 04's
  four projects are things to compare deliberately, where 05's six are
  positions to skim, and a plate changing under the pointer on the way
  somewhere else would make 04's window twitch for nothing. Without the
  pinned/previewed distinction a glance would overwrite the choice, and moving
  away would leave the window on whatever the pointer passed over last.
  - **Restoring is bound to the enclosing `<nav>`, not to each button.** Moving
    between two rows of one index fires a leave and an enter on every row
    crossed, so per-button restore put the pinned panel back for a frame each
    time — the window flickering all the way down the list. `focusout` checks
    `relatedTarget` for the same reason: arrow keys move focus from one row to
    the next inside the same nav, and that is not leaving the index.
  - **Mouse only.** A touch `pointerenter` fires once, immediately before the
    click that pins the same row, and there is no `pointerleave` to undo it —
    so on a phone the preview is at best redundant and at worst a panel left
    previewed with nothing chosen.
- **There are TWO indices and they are different objects.** `PerspectiveIndex`
  is on the verso: six rows of numeral, category and thesis. `PerspectiveStrip`
  is along the foot of the recto: the six plates in miniature, and the only
  place in the chapter where all six DRAWINGS are visible at once. A reader who
  has looked at one plate and wants to know what the others look like has
  nowhere else to find out, and crossing the gutter to a list of words does not
  answer that. Their landmark names are "Perspectives" and "Perspective plates"
  and must stay different: two navigation landmarks with one accessible name
  are announced identically while going to the same six places by different
  routes.
- **There is no "READ PERSPECTIVE" action, and the brief asked for one.** There
  is nothing to read: these six are positions, not articles; no route exists,
  and inventing one would mean inventing the writing to put behind it. That is
  the argument that took "VIEW PROJECT →" off 04, and it matters more here — a
  link promising an article would be the page describing writing that does not
  exist, one revision after it stopped doing exactly that.
- **The metadata line is the book's currency, not the brief's.** It asked for
  "INDEX / 2026" and "FIG. 05". A year dates the page the moment it turns over,
  and an arabic 05 inside chapter 05 names either the chapter or the picture
  with no way to tell which — which is the whole reason plates are roman here.
  It reads `PERSPECTIVE 01 / 06` and `PLATE I` instead.
- **Two thresholds, and each was measured.** The index rows tighten below 480px
  of viewport HEIGHT and the gap above them closes: at 844x390 the sheet is
  475px in a 390px window, so its bottom 45px are off-screen before anything is
  printed, and six two-line rows with a chapter head came to 410px of a page
  showing 365 — perspective 06's thesis was cut in half by the foot. The
  recto's own margins tighten below `lg`, where the whole spread is on one
  844px sheet and the KEY THEMES table was landing on the sheet edge.
- **`bindWindow(group, options)` in `book.tsx` drives this and 04.** One
  factory called twice — `("project")` and `("perspective", { preview: true })`
  — because the mechanism is identical and the settings are not. It was called three times for one
  revision, when 03 was a window too; 03 is a printed spread again and binds
  nothing. Two is also the most this mechanism should carry: three consecutive
  windows stopped reading as three chapters. It reads `[data-<group>]` for the index and both
  `[data-<group>-panel]` (copy, which leaves the accessibility tree when it is
  not showing) and `[data-<group>-plate]` (pictures, which do not: their alt
  text is already reachable only through the current panel, and an
  `aria-hidden` `<img>` mid-fade reads as a flicker to some AT). Adding a
  window is one more call, not another handler. Pick the group name against the
  DOM, though: `data-stage` is already `layoutSheets`'s — it is how it finds
  the element it writes the page-image variables onto — and the revision of 03
  that was a window put its six index buttons and the book's own stage element
  into the same call under that name, where a click blanked the whole recto.
  The lesson outlived the chapter: any new group name has to be checked against
  what `layoutSheets` already queries.
- **Arrow-key focus is scoped to the enclosing `<nav>`, not to a landmark
  name.** It was the name for as long as every copy of an index shared one —
  04's verso list, its portrait duplicate and the reduced-motion column are all
  "Projects" — and 04's head index broke that: a fourth copy driving the same
  four plates under its own name, because two landmarks announced identically
  while going to the same place is what those names exist to prevent. Keyed on
  the name, an arrow press inside the head index matched nothing, fell back to
  the document, and moved focus to the verso list a page away. Every index copy
  is a `<nav>` and none nests inside another, so `el.closest("nav")` is the
  scope that keeps working as copies are added.
- **All six panels are in the markup and five are transparent.** They share one
  grid cell, so the window is as tall as the longest thesis from the first
  paint and does not resize on a click. `opacity` is safe here and nowhere near
  a sheet: a panel is inside a face, which its own clip has already flattened.
  The five that are off are `aria-hidden` and `pointer-events-none`.
- **This chapter has no tailpiece**, and the guard in `ServicesPage` says so
  (`&& !perspective`). An ornament under a window that is about to change is
  signing off a page that has not finished.
- **The panel takes extra sinkage below 480px of viewport HEIGHT.** At 844x390
  the page's top 40px is off-screen (see 04's colophon note above) and the
  page's own 8% sinkage resolves against WIDTH to 33px, which does not clear
  it. Every other recto leads with type, whose line box carries leading above
  the cap and hides the cut; this one leads with a struck emblem that starts
  flush at the top of its box, and the chip's pins came off. Hiding the emblem
  only moves the cut onto the kicker.

### Rules that are not obvious from the code

- **Illustrations are numbered in roman and chapters in arabic**, and 03 is
  why that rule earns its keep rather than merely being a convention. Its plate
  labels read `PLATE IV`, not the `FIG. 04` the brief asked for: an arabic 04
  printed inside chapter 03 reads as a pointer to chapter 04, which is one tab
  away in the thumb index and is a real chapter. The engraved `Fig. 1`–`Fig. 2`
  are a separate series — diagrams, not photographs — and stay sentence-case.
  Three of the five engravings have now been retired — 03's when it gained six
  photographs (the reason 02 has none), 05's when it became the perspectives,
  and 04's when its verso took the index of projects — and the numbering closed
  up behind each one. That is the whole reason the engraved series is numbered
  separately from the plates. The two left, 01's flow chart and 07's
  telegraphy, are `Fig. 1` and `Fig. 2`.

  **The plates restart per chapter**: 03's six photographs are `PLATE I`–`VI`,
  04's four are `PLATE I`–`IV` and 05's six struck crops are `PLATE I`–`VI`
  again, so `PLATE III` names three different pictures in one book. That is a deliberate choice and not an oversight — a
  chapter numbers its own plates from one, the way its stages and its projects
  are numbered from one. The rule that still holds without exception is the
  NUMERAL SYSTEM: plates roman, chapters arabic, engraved figures their own
  sentence-case series. Nothing in the book ever refers to a plate from
  outside the chapter it is in, which is what makes restarting safe.
- **Geometry comes from the camera, never from CSS.** Sheets sit on the real
  gutter because `spreadAt()` runs the same arithmetic the painter runs. A
  hardcoded `50%` will drift apart from the photograph on resize.
- **`FRAME_SET` is part of the URL for a reason.** Frames are served
  `immutable, max-age=31536000` (`next.config.ts`). A rebuilt set reuses the
  same filenames, so it must go in a **new** `/frames/<set>/` directory or
  every returning visitor keeps the old book for a year.
- **Pass `revertOnUpdate: true` to `useGSAP` when it has dependencies.** It
  runs your cleanup on a dependency change but does not revert the context, so
  a pinned ScrollTrigger leaves its spacing on the document and any `gsap.set`
  inline styles stay put. A manual `kill(true)` covers the spacing only.
- **Do not set `refreshPriority` on these triggers.** It sorts the opposite way
  to the intuition (higher refreshes first), and page order is already the
  default via `_sortY`. Setting it broke the reveal's scroll length.
- **Under a scrub, prefer `ease: "none"`.** An eased tween spends most of its
  motion in the middle of its duration, so the interesting part of a turn goes
  past in a couple of hundred pixels of wheel. The scrub's own catch-up is the
  weight an ease would have added.
- **Redraw on ScrollTrigger's `refresh`, not on `resize`.** While pinned, GSAP
  writes explicit pixel dimensions onto the section, so a resize handler reads
  the stale pinned size.
- **A spread is never one element.** Sheets hinge at the spine and cover only
  the right-hand page, so what you look at is
  `[sheet k-1 back] | [sheet k front]`. A page's `facing` copy is therefore
  printed on the **back of the sheet before it** — page k's verso lives on
  sheet k−1. The opening spread is the exception, having no preceding sheet:
  page 0's verso is `[data-left-page]`, a layer under the stack that sheet 0's
  back buries when it turns. Give any page a `facing` and it becomes a spread;
  no extra sheet is needed.
- **Chapter-opener conventions key off `page.facing`, not off page 01.** A page
  with a facing verso is a chapter opening and gets the opener devices —
  headpiece, sinkage, drop folios. The ones that need their own data appear
  only where that data exists: the drop cap and small-caps lead-in need
  `facing.intro`, so 01 has them and 02 does not. Pages without `facing` stay
  centred with no opener furniture at all, which is correct: they are
  continuation pages.
- **The sheets are hidden until the book has finished opening**, and switched
  on with `gsap.set`, not a fade. Their paper is the same photograph the canvas
  is showing by then, at the same rect, so there is nothing to dissolve — and a
  fractional opacity would flatten their 3D at exactly the wrong moment (see
  below). Only the first page's ink fades.
- **Never put `opacity`, `overflow`, or `filter` on a sheet.** Per CSS
  Transforms 2, those are grouping values: any of them forces
  `transform-style: flat` on the element, dropping it out of the 3D context so
  its faces stop being separate planes. Fade the ink inside a face (already
  flattened by its own clip), never the sheet. Same reason the sheets carry no
  `overflow: hidden` — only the faces do.
- **Every pinned section needs a plain `<div>` wrapper, and it is not
  decoration.** `pin: true` builds a `div.pin-spacer`, inserts it where the
  section was, and moves the section inside it (`ScrollTrigger.js:668`). React
  is never told, so it still believes the section is a direct child of the body
  container; the next time it places or removes a sibling there it throws
  `NotFoundError: The node before which the new node is to be inserted is not a
  child of this node`. The wrapper gives React a reference node GSAP never
  reparents. Deleting it reintroduces a runtime crash that no build catches.
- **The thumb index floats over the recto and nothing used to reserve it.**
  `<BookIndex>` is pinned to the *window's* right edge, not the paper's, and
  for a long time every spread cleared it by luck — whatever sat at its height
  happened to be short. `layoutSheets` now measures it and publishes
  `--page-index-inset`, which the recto adds to its own margin. Measure against
  the **widest** tab, not the current one: a tab shows its title when it is
  current *or* hovered, so PERSPECTIVES is the constraint on every spread.
- **A photographic plate is lifted to the paper, never darkened toward it.**
  The page is a photograph of navy stock at about `rgb(20,41,68)` — not
  `GENERATED_LETTERBOX`, which is the colour of the letterbox *around* the
  book and is far darker. Toning a plate against the letterbox is how
  `build-service-plates.sh` first produced plates darker than the page they sat
  on, which read as holes punched in it. Proof against a crop of the real
  spread.
- **The pages are the photograph, not a drawing of it.** Each face shows the
  region of frame-091 it covers, via `--page-image`/`--page-front-pos`/
  `--page-back-pos` set on the stage by `layout()`. Do not add a gutter shadow,
  vignette, or edge highlight — the frame has real ones, and a second set
  drifts out of agreement with them on resize.
- **Portrait phones take a different path.** The 16:9 frame crops to a tall
  band and the spine lands two thirds across, leaving the right-hand page mostly
  off-screen. `layout()` falls back to a full-bleed sheet hinged at the
  viewport edge.

### Rebuilding the frames

`tools/build-work-plates.sh` turns the four interface mockups into the plates on
04's stage. Two things are wrong with the sources and only one
is cosmetic. They arrive as marketing compositions — a wordmark, a paragraph of
body copy, a feature list, and on one of them a set of design annotations
printed into the pixels — so each is cropped to its interface panel. And they
are populated with **invented clients and invented revenue**: named companies
against amounts paid, MRR, churn. Chapter 04's whole argument is that a reader
can tell a study from a build, and a picture of a named client paying an invoice
printed beside an entry that says CONCEPT does not read as a contradiction — the
picture wins and the label becomes decoration. Those regions are blurred, under one rule the header
states: **blur where a third party is named; money goes only when it is
attached to one.** Both halves of the claim are needed — a company that could
be phoned *against* an amount that could have been paid. The rule used to be
the disjunction, names OR money, and 04's mobile plate is what proved that too
broad: seven boxes covered both revenue cards, the axis labels, the sales chart
and a Top Products table listing Nivlak's OWN products, and once the tone came
up to 03's contrast the plate read as a censored phone. Six of the seven were
over the app talking about itself. What is left is 96x28 over one customer
name. A KPI card in a dashboard mockup is the demo app's sample data, the same
kind of thing as "128 tasks completed, up 24%"; the two client TABLES on the
web and SaaS plates are the other kind and never come off.

The 560px output used to be the backstop that made the redaction true rather
than merely covered. It is not any more: a full-measure stage needs 1240px
against crops of 828–1337, so the resize is about 1:1 and destroys nothing.
**The blur is now the whole redaction**, which is why every box has to be proved
by looking at the OUTPUT at 100%, not by reading the list. Read the header
before changing a crop or a box; the first run measured the boxes against the
crop instead of the source and put a smear over a chart while leaving every
client name legible.

**Two things about the crops are load-bearing and neither is composition.**
Immediately *below* three of them, still inside the source, sit a table of
named clients against progress and dates and a paid invoice — they do not ship
because the crop ends above them, not because anything blurs them. Extending a
crop downward for a better picture puts them back. And every crop *starts*
below the browser chrome: 03's plates are photographs of screens in a room and
carry none, and a window frame with traffic lights is the one thing in these
pictures that says "export from a mockup tool" rather than "software".

**MOBILE is the one crop that is PAINTED and not only cut, and it is the only
place either plate script invents a pixel.** Its three phones occupy
x 348–1444, y 68–866 of the source; the left-hand marketing copy ends at
x=263, so a crop that excludes it cannot start further left than ~275, which
caps the width at 1397 and the 16:9 height at 786 — 13px shorter than the
phones. There is no 16:9 crop of that composition that both excludes the copy
and contains the phones, and an evenly-margined one caps 100px short. So the
copy is REMOVED instead of avoided: `fills` (`TO:FROM`, both in source pixels)
stretches a 40px column of background over it and a 60px column over the
right-hand registration bracket, which buys `1470x827+161+54` — centred on the
phone group in both axes, all three whole, 187px of air at the sides. Only
background is invented, and only where marketing furniture stood; the same
thing every other crop achieves by cutting, done by painting because here
cutting cannot reach. Take the left strip from x=270 and not from nearer the
phone: at x=310 it catches phone 1's side buttons and smears three dark bars
down the margin.

**The tone is 03's, exactly** — same SHADOW, HIGHLIGHT, SATURATION, SIGMOIDAL
and width, copied from `build-process-plates.sh`, because two sets of plates in
one book toned by different arithmetic read as two books. Getting there needed
the *opposite* operator from the one this file first used. Gamma cannot touch
these at all (a light-mode UI is clipped white, a dark one clipped black —
there are no midtones to move). `+level`, which compresses each source into a
narrower range, does land the medians together and is what shipped for one
revision; the number that says it was wrong is the standard deviation, 0.05
against 03's 0.12–0.22. That is a wash, not a photograph. `-level` **expands**
instead — it stretches the band where each source's information actually lives
out to full, and the shared `+level-colors` then puts it back inside the book's
ink. For the light interfaces the white point runs *above* 100% (180%, 165%),
which is how a white dashboard comes down to the page without being flattened
onto it.

**Every crop keeps its dark sidebar**, and that is not framing either: it is
the only dark thing in a light-mode screenshot and it is carrying the contrast.
Cropping past WEB's sidebar measured std 0.050; the same crop with it in
measures 0.152. Cropping *into* it is worse than either — truncated nav labels
down the edge read as a mis-crop rather than as an interface.

`tools/build-process-plates.sh` turns the six process photographs into the
plates of chapter 03. They arrive as finished pictures with no ground to key,
so nothing here is cut out — what is wrong with them is TONE, and in two ways
at once: three of the six measure *darker than the paper* (LAUNCH's median is
0.047 against the recto's 0.205), which is a hole punched in the page rather
than a picture; and 0.047 to 0.598 across the set is two collections of stock
photographs rather than one chapter. `+level-colors` fixes both in one pass by
compressing every plate into a shared band between the book's navy and its
silver, and per-image gammas close the day/night gap *part* of the way and stop
there — paper by daylight becoming screens at night is the arc of the chapter.
The script fails rather than ships if any plate lands at or below the paper.
Read its header before changing any number in it.

`tools/build-service-plates.sh` turns the service renders into the plates on
spread 02. Like the frame sources, the renders it reads are **not in the repo**
— it expects them at the repo root. Its header explains the keying, the seeds
and the tone; read it before changing any of the three.

`tools/build-book-frames.sh` decodes `nivlak-book-opening.mp4` (not in the repo)
into two tiers plus the measured camera track. `tools/stamp-book-logo.py`
replaces the approximated logo on the cover in the encoded webps; it is not
idempotent — `git checkout apps/web/public/frames/v5` before a second run. Both
scripts carry long headers explaining the decisions and the measurements behind
them. Read those before changing either.

## Verifying scroll work

**Use the `scroll-reveal-qa` skill** (`.claude/skills/scroll-reveal-qa/`) for any
change to the reveal, the pages, the camera, the frame set, or any pin/scrub
timing. It drives `tools/scroll-shots.mjs`, which screenshots the running dev
server at real scroll positions and can dump live DOM state at a scroll offset.

A build log is not evidence about this page. Every bug it has had — a fallback
firing on the wrong viewports, doubled pin spacing, type printed over type —
compiled and typechecked cleanly and was obvious in a screenshot.

## Conventions

- Comments explain **why**, with the measurement that settled it. The existing
  comments in `book-camera.ts`, `build-book-frames.sh` and `next.config.ts` are
  the house style: they name the alternative that was rejected and the number
  that rejected it. Match that density; do not narrate what the code says.
- `apps/web/AGENTS.md` is written and re-added by `next dev`. Commit it with
  your work rather than reverting it — removing it only re-creates the change.
- Next.js 16 differs from older versions in APIs and conventions. Check
  `node_modules/next/dist/docs/` (resolve from `apps/web`, not the repo root)
  rather than assuming.
- Shared UI goes in `packages/ui`, not `apps/web/src/components`. Design tokens
  live in `packages/ui/src/styles/globals.css`.

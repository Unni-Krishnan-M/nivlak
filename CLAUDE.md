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
<Book />   one section, one pin, one timeline   +=1101%
              0%..250%   the book opens (91-frame canvas scrub)
           250%..1101%   ten sheets turn over the frame it lands on
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
  sheets, and a chapter running to two spreads is two sheets.
- **Only the navigation reads `BOOK_PAGES`.** A chapter keeps one tab in the
  thumb index however many spreads it runs to, so the tabs carry a *chapter*
  index: `<Book>` maps it through `FIRST_SPREAD_OF_CHAPTER` to seek, and
  through `CHAPTER_OF_SPREAD` to light the active one. Give a tab a spread
  index again and the index goes dark on every continuation.
- **`continued` and `lastOfChapter` are both needed and are not each other's
  negation.** A chapter of one spread is the first *and* the last. `continued`
  suppresses the opener devices; `lastOfChapter` is what the tailpiece keys off.
- **Chapter 05 does not paginate.** Its two halves — a lead plate on the verso,
  a modular grid on the recto — were composed by hand, and re-cutting them on a
  slot count would throw away a layout that was designed rather than computed.
  `expandChapter` opts a chapter out when no entry carries an `image` or a
  `record`, so the test is a question about the entries and never a list of
  chapter numbers — which is how 04 crossed from one side of it to the other
  without that file learning its number.

### Four settings, and the data picks which

A run of entries is set one of four ways, and nothing says which: the shape of
the entries decides, the same way it decides whether the chapter paginates.

| The entries carry | Setting | Where |
| --- | --- | --- |
| `stage` | plate section — one full-measure plate per page, with its letterpress | 03 |
| `image` | catalogue — photograph beside copy, alternating sides | 02 |
| `record` | register — a ruled ledger, three labelled rows | 04 |
| neither | engraved — a lead plate over a modular grid | 05 |

`isPlateSection()`, `isIllustrated()` and `isArchive()` ask the question of the
**whole run**, not of each entry, because the answer is the setting for the
page. Two settings down one page read as two lists stacked.

**The order of those three questions is load-bearing.** A stage carries `image`
as well, so `isIllustrated()` would claim it — and `isPlateSection()` is asked
first in both `book-sheets.tsx` and `expandChapter`. The two have to agree: a
run that answers "what setting is this" twice is a bug in one of the two
places, not a chapter with two settings.

**03 is a plate section and not a second catalogue, for the reason 04 is not
one either.** Two chapters set the same way one spread apart stop reading as
two chapters. And the catalogue's plate is 42% of a text column — about 260px
at 1440 — where these six photographs are *made of* small type: a notebook of
interview notes, a strategy blueprint, a wireframe sheet, an architecture
diagram, a deployment pipeline, an analytics dashboard. At 260px none of it is
readable and the plate is a texture. Being able to read it is the whole reason
they are photographs and not emblems.

Consequences worth knowing before touching it:

- **Its pagination is arithmetic, not a slot policy.** A stage is a plate over
  its own description and there is room for exactly one to a page, so
  `expandPlateChapter` lays out page 0 as a half-title, pages 1..n as the
  stages, and the last as the tailpiece. Six stages make eight pages and four
  spreads with nothing left over. An **odd** stage count would leave the
  tailpiece opening a spread with a blank facing it, so it takes the whole
  closing spread instead — that is what `tail: "recto" | "spread"` is for, and
  why there is no third value.
- **The chapter navigates by SPREAD, and it is the only thing in the book that
  does.** Every other nav item carries a CHAPTER; the contents list on the
  half-title and the stage index in every stage's head carry a spread, via
  `spreadOfEntry`, because six stages are six pages of one chapter and a
  chapter number would send all six to the half-title the reader is already
  looking at. `<Book>` dispatches on `data-spread` before `data-index`.
- **`StageIndex` exists because a spread carries two stages.** Ask for Design
  and the book turns to Strategize | Design — the right spread, with the page
  you asked for on the right — and the page your eye lands on first is
  Strategize. The navigation was correct and read as broken, because nothing on
  either page said which of the two had been asked for. The mark under 03 sits
  on the Design page and under 02 on the Strategize page, so the two halves of
  a spread stop looking like the same answer. It is a numeral over a notch —
  `<BookIndex>`'s own device, doing the same job one level down; a progress bar
  would be a second answer to a question this book had already answered.
  Hidden below `lg`, where both stages are on one screen anyway. Its
  `aria-label` is "Stage index" and not "The stages of the process", which is
  the contents list's: two landmarks with one name are announced identically
  while going to different places.
- **The reduced-motion column needs its own branch.** That column sets an
  uncut CHAPTER per article, and a catalogue or a register is the same object
  cut or not. A plate section is not: its pagination is what says a page holds
  one stage, and what closes the chapter is a page. Routed through the spread
  path it printed stage 01 and stopped — five stages and the whole call to
  action missing for exactly the readers who never see the book open.
  `PlateSectionColumn` is that branch, and `chapter === undefined` is what
  selects it.
- **Portrait sheds the description, the summary and the arc, and keeps the
  plates.** The fallback collapses a spread onto one 844px sheet and prints the
  verso's copy above the recto's, so two whole stages share a phone screen. The
  parts dropped below `lg` are the only ones that restate something the page
  says elsewhere: a stage's `body` elaborates its own headline, and the
  tailpiece's arc and value list are the six stage names and the six
  deliverables again. The headline, the work, the deliverable and the outcome
  never go.
- **A stage reserves the drop folio; nothing before it had to.** `VersoPage`
  and `PageBody` print the folio at 7% of the page HEIGHT while their own
  bottom padding is a percentage of its WIDTH — 56px against a folio whose top
  edge is 71px up. Every earlier page stopped short of its own padding so the
  15px overlap never showed. A stage hangs its deliverable off the foot with
  `mt-auto` and lands exactly there: the verso printed `03 — APPROACH` through
  the last line of the outcome.

**04 is a register and not a second catalogue, and that is the point of it.**
It used to be set as a catalogue and it read Web Applications / AI Platforms /
SaaS Products / Mobile Apps / Brand Experiences — 02's five entries, one spread
later, with the pictures and the sentences taken off. Two chapters in the same
setting saying the same five words is how the repetition stayed invisible. 02
says what we offer; 04 says what exists, so its entries are things rather than
capabilities and every one carries a `status` that says whether it was built.
Do not let a concept onto that page without one.

Consequences worth knowing before touching it:

- **The register's opening verso takes no entries** (`OPENER_ARCHIVE_VERSO_SLOTS
  = 0`). The head, epigraph, subtitle and sinkage come to ~260px of a ~460px
  column at 1440x900 and one ledger needs ~150 of what is left, so an entry
  there would sit marooned while the recto carried three. The verso is a
  half-title facing the first page of the register, and it takes the plate.
- **Its rows are floored at `min-content`, not at 0.** The catalogue can use
  `minmax(0, 1fr)` because its pages are always full; the register's are not,
  and on a 390x844 portrait page the shrinking rows printed PLATE I's `STACK`
  row across PLATE II's rule. Overflow is clipped by the face and loses a line;
  overprinting is two records on one line, which is not a page at all.
- **The rule belongs to the entry, not to the grid row.** A `border-t` on the
  row draws at the top of a full-height cell — measured 99px above the entry it
  was ruling off, which reads as a stray line.
- **The register's opener drops its plate below `lg`.** Portrait collapses the
  spread onto one page, so the half-title and the first two records share 844px
  and do not fit. The plate is the only thing there carrying no information.

### Rules that are not obvious from the code

- **Illustrations are numbered in roman and chapters in arabic**, and 03 is
  why that rule earns its keep rather than merely being a convention. Its plate
  labels read `PLATE IV`, not the `FIG. 04` the brief asked for: an arabic 04
  printed inside chapter 03 reads as a pointer to chapter 04, which is one tab
  away in the thumb index and is a real chapter. The engraved `Fig. 1`–`Fig. 4`
  are a separate series — diagrams, not photographs — and stay sentence-case.
  03's own engraving was retired when it gained six photographs (the reason 02
  has none), which closed the gap behind it: 04, 05 and 07 are now Fig. 2, 3
  and 4.
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

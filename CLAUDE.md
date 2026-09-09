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

## Deploy: NETLIFY serves production, and pushing does not deploy

Two paths are wired up and only one of them is live.

- **Netlify — this is the one.** `netlify.toml` at the root builds
  `pnpm --filter web build` and publishes `apps/web/.next` via
  `@netlify/plugin-nextjs`. Production is **https://nivlak.netlify.app**.
- **Cloudflare** — what `bts.jsonc` and `packages/infra` describe.
  `@opennextjs/cloudflare` + `wrangler.jsonc` + `alchemy.run.ts`; `pnpm deploy`.
  Not serving anything. `pnpm deploy` is NOT how this site ships.

**The site has no continuous deployment**, which is the thing that catches
people out. `netlify api getSite` reports `build_settings: {}`, no `repo_url`,
`deploy_hook: null`, and `commit_ref: null` on every recent deploy — the
project is not connected to the GitHub repo at all. **Pushing to `main` deploys
nothing.** Every release is a CLI deploy:

```bash
netlify deploy --build --prod --filter web
```

`--filter web` is required and is not optional tidiness: without it the CLI
stops on "We've detected multiple projects inside your repository" and, in a
TTY, opens an interactive picker that will hang a scripted run. It still reads
the ROOT `netlify.toml`, which is what you want.

**`JSONHTTPError: Forbidden` from the CLI means the account is out of
credits**, and nothing about the message says so. The CLI throws away the
response body; the deploy is failing at `api.createSiteDeploy` and the body
reads `Account credit usage exceeded - new deploys are blocked until credits
are added`. Everything else looks healthy while this is true — `netlify status`
authenticates, the site is linked and `state: current`, `getAccountBuildStatus`
reports 0 minutes used and 0 builds active, and the account object even reports
`credits: {included: 300, used: 0}`. DRAFT deploys still succeed; only
production ones are blocked, which is the fastest way to tell this apart from a
permissions problem. To read the real error:

```bash
TOKEN=$(python3 -c "import json;d=json.load(open('$HOME/.config/netlify/config.json'));print(d['users'][d['userId']]['auth']['token'])")
curl -s -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -X POST https://api.netlify.com/api/v1/sites/<site_id>/deploys \
  -d '{"draft":true,"deploy_source":"cli","files":{}}'
```

Use `draft: true`. A non-draft probe with an empty `files` digest has nothing to
upload, so it can go straight to ready and PUBLISH AN EMPTY SITE over
production. Note also that `~/.config/netlify/config.json` holds more than one
account here — the live one is the entry keyed by the file's own `userId`, not
the first in `users`.

Two consequences worth holding on to. `apps/server` is **not deployed** — only
`apps/web` is built and published — so `NEXT_PUBLIC_SERVER_URL` resolves to
nothing in production and a tRPC procedure added to `packages/api` works in
`pnpm dev` and 404s on the live site. Anything the site itself has to call
belongs in a route handler under `apps/web/src/app/api/`, which ships with the
site. And because `next.config.ts` is shared, changing it or the output mode
affects both targets even though only one of them runs.

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
| `perspective` | perspectives — six domains listed on the verso, the argument for them on the recto | 05 |
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
is ONE window left in the whole book, and it is 04's. 05 followed 03 off the
mechanism for the same reason a revision later, so there is nothing left for
this warning to be about except 04 itself. **The thing not to add is a second
one.**

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
- **This chapter is why the whole book's drop is 8%.** `pt-[18%]` is 130px of
  the 887 this sheet has. With it, the three rows and the head came to 801px
  against 699 available; at 8% they have 771 and it fits. That was 03's
  exception for one revision and is now `PAGE_SINKAGE`, the house value — see
  "One drop, one head" below. Both halves still take the same drop, which is
  the part that actually matters: the first lines sit on one line across the
  gutter.
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
- **The recto's note is set at the page's own size and at 30ch, and both
  numbers close a hole.** The head slot is 201px at 1440x900 and shared with
  the verso, which fills it. This side had the note pinned to the top in 11px
  type — three lines ending at 130 — and the arc hung off the bottom at 232:
  **102px of nothing between them**, on the one spread in the book with no
  slack anywhere else. `mb-auto` on the note is what opens it, absorbing every
  spare pixel between the two.

  Neither obvious fix works. Dropping the note down to meet the arc only moves
  the hole to the top of the page, and the arc cannot come up because sitting
  over stage 04's rule is the entire reason it is a running head. So the note
  fills the slot instead: 11px on a page whose body is 15px was already the
  caption-block mistake recorded against 05, and correcting it to the verso
  subtitle's size takes the note from 3 lines to 4; 30ch instead of 46 takes it
  to 5, ending at 204 against an arc at 232. **28px, and no word was cut.** The
  measure is 60% of the recto — the same fraction of its own page as the
  verso's 42ch subtitle, which is why the two now read as one spread.

  Measured across the desktop band, the only one where this note prints at all:
  the gap is 42px at 1024, 23 at 1280, 28 at 1440 and 66 at 1920, and content
  clears the slot bottom by 17–18px at every width. It opens up at 1920 because
  the type stops at its clamp maximum near 1466px of width while the slot keeps
  growing with page HEIGHT; the verso carries 26px of the same slack there, so
  the pages stay matched rather than one of them holing.
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
  05's rows are two lines as well, but they no longer drive anything: that
  chapter is a printed list beside an argument, and this is an index driving a
  window. The two are different kinds of object again, which is what ended a
  warning this file carried through three revisions. It is worth keeping in
  mind anyway — two adjacent chapters running the same mechanism read as one
  repeated page unless the settings differ, which is the failure that collapsed
  04 into 02 when both were catalogues.
- **The epigraph is not "a studio is what it has built".** It was, when one of
  the five entries was a delivered build. With four concepts it would be the
  page arguing against its own colophon two inches away.

**05 is a spread that argues, and it is no longer a window.** The verso lists
the six domains the studio thinks about, one line each; the recto says what
that thinking is for — a diagram from idea to product, three things a client
gets out of it, and the way in. **Nothing on this spread is behind a click, a
hover or a tab.**

**It has been three things, and the third is a reversal of the second.** It was
six category names under sentences saying the studio was interested in each
category. Then a volvelle: an index of six theses driving a window that showed
one plate and one argument at a time. It is now printed whole. The volvelle was
a good device and the reason it went is the reason 03's window went one chapter
earlier — a reader who does not operate the page learns that the studio has
opinions and not one of them. A page that has to be worked before it will speak
is a page most readers never hear.

**That also finally settles the 04/05 collapse this file warned about through
three revisions.** They are no longer the same kind of object at all: 04 is an
index driving a window, and this is a list beside an argument. The warning now
attaches to 04 alone, which is the only window left in the book.

- **The rows are not controls.** No `data-perspective`, no panels, no
  `bindWindow` call. The factory is down to one caller and the note under it
  says why.
- **A perspective is a `summary` now and not a `thesis`.** It held one — "The
  next interface is intelligence." — on the argument that a perspective must be
  a claim someone could disagree with. That argument was right about the
  chapter it was written for and does not survive this one: the CHAPTER now
  carries the argument on the facing page, so the rows do not have to. Six
  aphorisms down a verso are six things to decode before reaching the point;
  six plain lines are a list of what we think about, which is what a reader is
  looking for at that moment. `git log` has the theses.
- **The diagram is the chapter's one picture that is not artwork**, and it is
  drawn rather than illustrated: one continuous rule with a tick dropped at
  each station, which is how a measured drawing marks a stage — not four boxes
  joined by arrows, which is how a slide does it. The chevron is 03's, because
  a book that invents a second arrowhead has stopped being one book. **The
  QUESTION under each label is the load-bearing part**: four nouns in a row is
  decoration, and the same four with the question each answers is the whole
  argument of the chapter in one line.
- **The call to action came back, and the note that removed it has expired.**
  It said a chapter that is a WINDOW has no closing page, and an ornament with
  a way out under a page that is about to change signs off something that has
  not finished. Nothing on this spread changes any more, so the page finishes
  where the reader finishes reading it — which is exactly where an action
  belongs. Both actions turn to a chapter that EXISTS, 07 and 04, which is the
  rule that took "VIEW PROJECT" off 04 and "READ PERSPECTIVE" off this chapter:
  an action may only promise something the book can turn to. They carry
  `data-nav-item` and `data-index`, so they are the book's own navigation and
  not a second kind of link that looks like it.
- **Six of the seven plates are retired and the column is not.** The six were
  one per perspective, shown one at a time in a window; with no window, six
  pictures on one spread are six things competing with the argument, which is
  the one thing this chapter is now for. The column stays because every other
  chapter carries a picture and a chapter with none would be the only one — and
  because at 166px in a margin it is a mark, not an illustration. The crops are
  listed in `tools/build-perspective-plates.sh` rather than deleted: each was
  measured against ink coverage and proofed on the real paper, and restoring
  one is a single `key` line.
- **`mask-mode: luminance` still has to be declared** on the one plate that is
  left. The files are greyscale with no alpha, so under the default
  `match-source` the browser reads their alpha — opaque everywhere — and the
  plate paints as a solid silver rectangle. `<EngravedPlate>` does *not*
  declare it and 01 and 07 render correctly anyway, which makes this a trap
  rather than a convention. **Declare it on anything new.**

**What was measured, and what it cost.** The spread is over-subscribed on a
phone and the cuts are in the brief's own priority order:

- **The type is set at the book's own body size, not a caption size.** It was
  11-12px at 1440 against the 16.5 the prose pages use, which is the mistake
  `<StageWindow>`'s note warned about in another chapter: copy a size down from
  the page it is on reads as a caption block rather than as the page's text.
  Raising it cost 27px on the verso and 55 on the recto, and all of it was
  found rather than taken out of the content:
  - **The opener's sinkage drops to 9%**, and later to the house 8%. 18% of the
    page WIDTH is 130px of the 887 it has, which an opener can spend on air and
    a page carrying a whole chapter cannot. 03 takes 8% for the same reason,
    and the book now takes it everywhere — see "One drop, one head" below.
  - **The margin plate narrows to 138px.** At 166 the index had 374px of
    measure and two of the six summaries wrapped to a second line — 38px. The
    width came off the PICTURE rather than off the type, which is the right way
    round on a page whose job is reading.
  - **Two paragraphs were measured narrower than their own column.** The
    recto's opening sentence was capped at 48ch and its call to action at 44ch
    inside a 434px page, so each ran a line longer than it needed to. A `max-w`
    that is tighter than the column it sits in costs height for nothing.
  - **The recto reserves the drop folio.** Its call to action is hung off the
    foot with `mt-auto`, so unlike every page that stops short of its own
    padding this one lands exactly where the folio is: the buttons reached 835
    against a folio whose top edge is 820.
- **The clamp MINIMUMS are what a phone gets, and they were left alone.** At
  390px viewport `0.98vw` is 3.8px, so every size on this spread sits on its
  floor there. Raising the floors along with the rest grew the type on a sheet
  that is already carrying the entire chapter and put the call to action off
  the foot. **Only the `vw` term and the maximum went up**, so the spread grows
  from about 1100px of viewport width and is unchanged below it.
- **The chapter subtitle is not the house subtitle.** Everywhere else it is
  30ch of 1.05rem, which is right on a page introducing one thing and wrong on
  a page that also carries six rows: at 1440x900 it ran to five lines and
  pushed perspective 06 down through the drop folio. It is set at 46ch, a size
  down, inside the index block — and `FacingCopy` guards the generic one out
  for this chapter so it is not printed twice.
- **Four things drop below `lg`, and each is a paragraph under a heading that
  stays**: the chapter's opening sentence, the recto's opening sentence, the
  three benefit descriptions and the call to action's sentence. At 390x844 the
  whole spread is on ONE sheet — six domains, the argument, the diagram, three
  benefits and the way out came to 920px of the 781 the face will show. The
  opening sentence is the largest single loss at 90px, and it goes because two
  other things on the same sheet do its job: the headline directly above says
  it in six words and "Why it matters" a few inches down says it in full.
- **The index rows tighten again below 480px of viewport HEIGHT.** At 844x390
  the sheet is 475px in a 390px window, so its bottom 45px are off-screen
  before anything is printed and the verso shows about 365.

**Three things the brief asked for that this chapter does not do**, all for the
same reason — it is a photograph of a page, not a stylesheet:

- **A warm off-white paper ground with near-black text.** The page is a
  photograph of navy stock. One white spread inside a navy book is not a colour
  change, it is a different frame set. The brief's own last question is whether
  the section belongs to the existing site, and belonging wins.
- **ALL-CAPS headlines.** Briefs are written in caps; this book sets chapter
  headlines in the display serif in sentence case, and 05 doing otherwise would
  be the only one. The words are the brief's exactly.
- **A `NIVLAK TECHNOLOGIES / 05 / 06` footer.** The book already prints its own
  drop folios two lines below where that would go.

**And one it does not do for a different reason: entrance animation.** The
brief asks for the rows to stagger in and the diagram's line to draw. The
sheets already arrive by turning — that IS the entrance — and a second
animation inside a page that is mid-turn fights the first. The standing rule in
this file is also that nothing may put `opacity` on a sheet, and the brief's own
line is that animation must never delay comprehension.

- **`bindWindow(group)` in `book.tsx` drives 04, and only 04.** It has been
  three calls and two. 03 was a window until its six stages were printed on one
  spread, and 05 until the same argument was made about its six perspectives: a
  reader should not have to operate a page before it will tell them anything.
  The factory stays because 04 is genuinely the case for it — four full-measure
  photographs of software cannot be printed four-up at a size where they can be
  read. It reads `[data-<group>]` for the index and both
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
### The type grew, and the MINIMUMS did not

05's type was raised to the book's own body size (above), and the same
treatment was then applied to **01, 02, 04, 06 and 07** — every chapter except
the two that set their own sizes by measurement. The rule, applied in one pass
over `book-sheets.tsx`:

> the clamp MINIMUM is unchanged; the `vw` term is multiplied by 1.15 and the
> MAXIMUM by 1.14.

`text-[clamp(min,Xvw,max)]` is the handle — 101 of them in the file, 61 scaled
and 40 deliberately left.

**Why the minimum is untouched is the whole point.** At a 390px viewport
`1vw` is 3.9px, which is below every minimum in the file, so on a phone the
clamp is pinned to its floor and the floor is the only number that renders.
Raising the floors along with the rest grows type on sheets that are already
carrying an entire chapter on one face — which is what pushed 05's call to
action off the foot when it was tried there. So the book grows from about
1100px of viewport width upward and is **pixel-identical below it**. A phone
regression from this change is therefore a real bug and not a trade-off; check
against a frame taken before it.

**The 40 that were left out, and why each is not an oversight:**

- **03's and 05's own blocks** (11 and 18). Both are over-subscribed spreads
  where every size is a recorded measurement — 03 fills its page to the last
  pixel by construction, and 05's sizes were raised by hand with the room found
  lever by lever. A blanket multiplier on either overflows the sheet.
- **`ChapterHead`** (4). Its sizes are shared by every chapter *including* 03
  and 05, so scaling them scales the two that must not grow.
- **`VersoPage`, `PageFoot` and `PageBody`** (7). The drop folios and running
  heads. These are the furniture the pages are measured *against*; 03 and 05
  both reserve space for the folio in vh, and a bigger folio invalidates both
  reservations at once.

**One collision came out of it and it is recorded in the code**: 07's plate
credit printed through its drop folio (credit 812–827 against a folio at
820–837, both at x=77 at 1440x900), because `EngravedPlate`'s non-beside figure
hangs off the foot with `mt-auto` and its bottom margin is a percentage of the
page's WIDTH while the folio is placed at 7% of its HEIGHT. Fixed by raising
the margin to 10% and taking the width back off the PICTURE
(`20vw`/290px → `18.5vw`/268px), because the verso had nothing else to give —
its subtitle ends at 361 and the plate started at 365. **The margin is `lg`
only**, which is the second half of the fix: below `lg` the verso is a stacked
auto-height column where `mt-auto` does nothing, so the same margin only pushed
the contact rows below it further down — 7px, on a page measured at 390x844
that is already short.

**07 is a chapter with a door in it.** The spread is still a spread — a
chapter head and a description on the verso, Fig. 2 and the four ways to reach
a person on the recto — but the recto now leads with a PANEL, and the panel
opens a project inquiry that is not printed in the book at all.

**The order on the recto is the whole argument.** It used to be contact
details, a paragraph, five prompts, and a line of type with an arrow. A visitor
who wanted to start something had to read to the bottom of a 434px page to find
out they could. It is now the action, then what the studio can help with, then
the direct contact — `primary`, `enquiryTitle`/`prompts`, `directTitle`/`rows`
in `book-pages.content.ts`, in that order.

- **The panel is the one action in this book set as a panel.** Everything else
  that acts — 04's "Enquire about this", 05's "Start a project" — is a ruled
  line with an arrow, because those are navigation INSIDE the book. This is
  the thing the book is for. 2px border against hairlines everywhere else, a
  label a size up from any other action, and a 2.3rem arrow: three ways of
  saying the same thing, because a visitor who misses it misses the chapter.
- **The accent fills on hover and focus rather than sitting filled.** The brief
  asked for the brand accent as a background. A solid `#dce7f7` slab printed on
  a photograph of navy stock reads as a sticker stuck to the page — the same
  failure as the plates that came out darker than the paper and read as holes
  punched in it, inverted. A strong rule with the accent held to a 7% wash is a
  block a printer could have inked.
- **07's engraving is `hidden lg:block` now.** This is the only page using
  `EngravedPlate`'s non-beside variant, and portrait stacks the whole chapter
  onto one sheet: at 390x844 that sheet measures 475px in a 390px window, so
  45px of its foot is off-screen before anything is printed and the plate is
  385 of what is left. With it in, the enquiry block AND the action were both
  in the clipped band. 04's verso drops its engraving at portrait for the same
  reason, and the two figures are still Fig. 1 and Fig. 2 on the spread, which
  is where the numbering lives.
- **The description was split across the gutter rather than shortened.** The
  brief's supporting text is 158 characters and the verso has about 115 of
  measure between the chapter head and the plate. The half that asks the
  question is the subtitle; the half that says what happens next is
  `primary.body`, printed under the action where it is of use. Neither page
  prints the other's half.

### The project inquiry

`book-inquiry.tsx`. Eight steps: six about the PROJECT, then a name, then an
address. The order is the design — by question seven a visitor has spent two
minutes describing their own problem, and giving an address to hear back about
it is the natural next thing rather than the price of entry.

- **It is not printed in the book, and that is a measurement.** A sheet is
  887px tall and its recto 434px wide, on a pinned scrub. Question four alone
  is seven options. There is no version of this that goes on that page.
- **The standing rule about gestures does not reach it.** "Nothing may go
  behind a gesture" is about CONTENT — a reader who never clicks must still
  learn what the studio thinks and how it works, which is why 03's and 05's
  windows were both removed. Question six of an inquiry is not content a reader
  is owed; it is a step in an action they chose to take. What the chapter has
  to say unoperated is all printed on the spread. **It is also not a second
  window**: `bindWindow` still has exactly one caller, and this is a `<dialog>`
  in the top layer, not a panel swap inside a page.
- **Native `<dialog>` + `showModal()`, not a div with a z-index.** It buys the
  focus trap, Escape, the inert background, the correct AT semantics, and — the
  reason it is load-bearing here — the TOP LAYER, which is what lifts it clear
  of the pinned section's transforms and stacking context without a portal.
- **`showModal()` focuses the first focusable descendant, which is the close
  button.** So the question takes focus instead, on open and on every step
  change. That is also why there is no `aria-live` region: moving focus to the
  new heading announces it once, where a live region wrapping the step would
  re-read all seven options with it.
- **The scrub runs on window scroll, so the document is locked while it is
  open** — `documentElement.style.overflow`, not the body, and the scroll
  POSITION is never touched, because that is what ScrollTrigger reads on
  refresh. Verified: open at y=6833, run the whole flow, close, still 6833.
- **The opener is a delegated document listener, not a prop.** The button is
  printed three times — the recto of sheet 6, the portrait sheet's inline copy,
  and the reduced-motion column, which is outside the pinned section — exactly
  as `[data-nav-item]` is. It is a plain effect and deliberately NOT inside the
  `useGSAP` block, which reverts and rebuilds on a dependency change.
- **Real radios and checkboxes, visually hidden.** Not buttons with hand-written
  `aria-checked`. The browser then gives arrow-key movement within the group,
  the roving tab stop, form association and the announcement for free. What the
  brief asks to avoid is a TINY radio; the target here is the whole row.
- **Four answers are required and four are not.** What they are building, the
  problem, a name, an address. Stage, needs, timeline and scale are useful and
  none is worth losing an inquiry over — which is also why scale offers "Not
  sure yet" instead of a number.
- **`<dialog>` is placed BEFORE the reduced-motion column in `book.tsx`**, so
  the column is still the last child of the wrapper and React's insertion of it
  is still an append. An append needs no reference node, which is the one DOM
  operation that cannot trip over a reparented pin.

**Submission: one env var, and it never lies.** `apps/web/src/app/api/inquiry/
route.ts` validates and forwards to whatever `INQUIRY_WEBHOOK_URL` names. That
variable is the integration point and the only thing to configure.

It is a route handler and NOT a tRPC mutation, because `apps/server` is not
deployed — see the deploy section. It reads `process.env` directly and not
through `@nivlak/env`, which is imported for side effects so a missing variable
fails the BUILD; that is right for a variable the site cannot run without and
wrong for one whose absence has a defined behaviour.

**Unset, it returns `delivered: false` rather than pretending**, and the client
carries two confirmations: "We've got the idea." when something downstream
accepted the inquiry, and "One step left." — with the whole inquiry already
written into a `mailto:` — when it did not. Nothing writes to the database:
`packages/db` is not in the web app's build, and adding Prisma to make a POST
look successful would be a fake backend by another name. All four branches were
exercised against a local webhook: `not-configured`, `delivered`, `unreachable`
(502) and validation (422/400).

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
  and 04's four are `PLATE I`–`IV` again, so `PLATE III` names two different
  pictures in one book. (05 numbered six struck crops the same way for one
  revision; they are retired and it numbers nothing now.) That is a deliberate choice and not an oversight — a
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
  headpiece, chapter head, drop folios. The ones that need their own data
  appear only where that data exists: the drop cap and small-caps lead-in need
  `facing.intro`, so 01 has them and 02 does not. Pages without `facing` stay
  centred with no opener furniture at all, which is correct: they are
  continuation pages. **Sinkage is no longer on that list** — every page in the
  book now takes the same drop, opener or not.

- **One drop, one head.** Two things about a chapter opening used to vary from
  chapter to chapter, and both were invisible in the code and obvious the
  moment the seven were measured side by side.

  **The drop was three different numbers.** 18% of the page WIDTH for five
  chapters, 8% for 03 and 9% for 05, because those two print a whole chapter on
  one spread and cannot afford an opener's air. On the page that is 139px of
  the face against 70 and 62 — and this book is SCROLLED, so scrolling
  02 → 03 → 04 jumped the chapter opening 77px up the sheet and back down.
  `PAGE_SINKAGE` is now `pt-[8%]` for every page. It could only go this way
  round: 03 and 05 are measured to the pixel and cannot be raised, while the
  five that come down gain 77px at the foot, which is air on pages that were
  not short of anything. **Say it in three places or 01 drifts**: `VersoPage`,
  `PageBody`, and the `[data-left-page]` layer, which is not a `VersoPage` and
  carries its own padding.

  **The head was seven different widths.** `<ChapterHead>` is `self-start` in a
  flex column, where `align-self` is the CROSS axis, so it shrink-wrapped to
  its widest child — the headline — and the rule under it, being `w-full` of
  that, came out the length of whatever the chapter happened to be called:
  306px on 06, 361 on 04, 400 on 07, 419 on 01, 562 on 02. The headpiece above
  it, at 38% of the same box, varied with it. 02 and 05 were the two that
  looked right, and only because their head is a GRID item, where `self-start`
  is the block axis and the inline axis stretches by default. `w-full` on the
  head makes all seven the page's own 562px measure. **Nothing gets taller**: a
  shrink-wrapped headline is by definition one line, and giving it more room
  leaves it one line.

  Measured after, at 1440x900: six of the seven heads are pixel-identical —
  left 77, right 639, rule at y=205. **01 is 3px off and that is the camera,
  not a bug.** Its verso is the `[data-left-page]` layer laid on `spreadAt()`'s
  LEFT rect, which spans [-64, 732]; every other verso is a turned sheet's
  back, which is the RIGHT page's box and spans [-41, 732]. The photographed
  left page is genuinely 23px wider, the type is inset from each page's own
  edges by percentages of that page's width, and 3px of offset with a 557px
  measure against 562 is what falls out. Closing it would mean insetting one
  page by another page's measure, which is the hardcoded-percentage mistake
  this file warns about, for 0.9%.

  05's rule sits 44px lower than the other six because its headline is two
  lines. That is content, not design; the head's top, headpiece, numeral, label
  and headline all start on the same line as everyone else's.
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

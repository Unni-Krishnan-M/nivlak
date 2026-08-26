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
<Book />   one section, one pin, one timeline   +=779%
             0%..250%   the book opens (91-frame canvas scrub)
           250%..779%   seven sheets turn over the frame it lands on
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
4. **`book-pages.content.ts`** — the six sections' copy. Currently placeholder.

### Rules that are not obvious from the code

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
  `[sheet k-1 back] | [sheet k front]`. Only the *opening* spread can carry copy
  on both halves without an extra turn, because every later left page is the
  back of a sheet already turned past — that is what `[data-left-page]` is, a
  layer under the stack that sheet 0's back buries when it turns. Do not try to
  give a later page a facing page without adding a sheet for it.
- **Chapter-opener conventions belong to 01 Company and nowhere else.** The
  sinkage, drop cap, small-caps lead-in and drop folios on that spread are
  opener-only devices in real book setting — repeating them on 02–07 would be
  the mistake, not the inconsistency. `PageBody` switches on `page.facing`.
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

---
name: scroll-reveal-qa
description: Verify the landing page's scroll-driven book reveal and turning pages by screenshotting the running dev server at real scroll positions. Use whenever changing book-scroll-reveal.tsx, book-pages.tsx, book-camera.ts, book-pages.content.ts, the frame set under public/frames, or any ScrollTrigger/pin/scrub timing on the landing page — and before reporting that any such change works.
---

# Verifying the scroll reveal

## Why this exists

`next build` passing tells you nothing about this page. The landing page is one
continuous scrubbed animation across two pinned ScrollTrigger sections, and every
interesting failure it has had compiled and typechecked cleanly:

- a full-bleed fallback firing on desktop, because the threshold compared the
  right-hand page against the viewport width instead of against its own — the
  right page is about half the screen by definition, so "not enough room" was
  always true;
- a pinned trigger killed without `revert`, leaving its pin spacing on the
  document, so an effect re-run stacked a second 450% of padding and the page
  became fifteen viewports of mostly nothing;
- a cross-fade that showed the *next* sheet's heading straight through the one
  fading in, printing two titles on top of each other.

None of those are visible in a diff, a type error, or a build log. They are
visible in a screenshot. **Take the screenshots.**

## The loop

A dev server must already be running (`pnpm dev:web`, port 3001).

```bash
# Whole document, 16 stops
node tools/scroll-shots.mjs --out /tmp/shots

# Contact sheet, then look at it
magick montage /tmp/shots/*.png -tile 4x4 -geometry 360x225+3+3 \
  -background '#111' /tmp/shots/sheet.png
```

Read `sheet.png`. Then read the individual full-size PNGs for anything that
looks wrong — the montage is for finding the suspect frame, not for judging it.

## What to check, every time

1. **Document height.** The tool prints it. It should be
   `(1 + reveal%) + (1 + pages%)` viewports — currently `5 + 5.5 = 10.5`.
   Anything larger means pin spacing is being left behind by a killed trigger.
2. **No black stretch.** A run of near-empty dark frames means sheets are
   mispositioned, turned away, or hidden — not that the design is dark.
3. **The join.** The handover from reveal to pages must be a dissolve from the
   photographed right-hand page to the drawn one, with no doubled type.
4. **Every heading appears**, in order, once.
5. **The turn reads as a page.** Sample one turn densely and confirm you get
   foreshortening and shading, not a fade.

## Zooming in on one transition

```bash
node tools/scroll-shots.mjs --out /tmp/turn --from 5200 --to 6300 --shots 12
```

Pick the range off the full pass: each stop's scroll position is in its filename.

## When a frame is wrong, probe before theorising

A dark rectangle has many causes and CSS is rarely one of them. Get the facts:

```bash
node tools/scroll-shots.mjs --probe --shots 3 --from 5200 --to 6300
```

This prints pin-spacer heights, section rects, the frame `<img>`'s inline
geometry, and every sheet's z-index, opacity, visibility, width and transform.
All three bugs listed above were identified from this output in one pass.

## Viewports that matter

Run all four before calling a change done. They exercise genuinely different
code paths, not just different widths.

```bash
node tools/scroll-shots.mjs --out /tmp/d  --viewport 1440x900   # desktop
node tools/scroll-shots.mjs --out /tmp/m  --viewport 390x844    # portrait: full-bleed fallback
node tools/scroll-shots.mjs --out /tmp/l  --viewport 844x390    # landscape phone: sd tier
node tools/scroll-shots.mjs --out /tmp/rm --reduced-motion      # no pin, plain column
```

Portrait is the one that breaks: the camera crops the 16:9 frame to a tall band,
the spine lands two thirds across, and the geometric right-hand page is mostly
off-screen. `layout()` in `book-pages.tsx` falls back to a full-bleed sheet
hinged at the viewport's left edge there. Confirm it fired — the pages should
fill the screen, not sit in a sliver.

## Do not

- **Do not trim `--settle`.** The scrub has ~1s of catch-up. Screenshotting
  sooner catches frames mid-flight and makes every run disagree with the last.
- **Do not conclude from the montage alone.** Read the full-size PNG.
- **Do not report a scroll change as working on a build log.** It is not
  evidence about this page.

## Two GSAP traps this page has already fallen into

**`refreshPriority` is inverted from what you would guess, and you almost
certainly do not need it.** The official `gsap-scrolltrigger` skill's option
table says "Lower = refreshed first ... first on page = lower number." The
source disagrees — `ScrollTrigger.js`, the refresh comparator:

```
(a.vars.refreshPriority || 0) * -1e6 + a._sortY - (b._sortY + (b.vars.refreshPriority || 0) * -1e6)
```

The key is `-1e6 * refreshPriority + _sortY`, sorted ascending, so **higher
priority refreshes first**. Setting the reveal to `0` and the pages to `1`
refreshed the second section's pin before the one its start is measured
against, and the reveal lost most of its scroll length — headings appeared
during the book animation and four viewports went black. And it was never
needed: `_sortY` is the trigger's position on the page, so page order is
already the default. Leave it alone here.

**`useGSAP` does not revert on a dependency change unless you ask.** It runs
your returned cleanup, but the context — the timeline, its pinned
ScrollTrigger, and any `gsap.set` inline styles — survives. This page's
`reduced` dependency flips right after mount, so the reduced-motion document
was carrying ~1638px of orphaned pin spacing from the killed trigger. Fixed
with `revertOnUpdate: true` in the hook config, which is also the only thing
that clears the `autoAlpha: 0` written onto the sheets; a manual `kill(true)`
covers the spacing but never the inline styles.

Both were invisible in a build log and obvious in a contact sheet.

## Geometry is not CSS's job

Anything that has to sit *on* the book asks the camera where the book is:
`spreadAt()` and `finalFrameRect()` in `book-camera.ts` run the same arithmetic
the canvas painter runs. If a sheet drifts off the gutter on resize, the bug is
that something hardcoded a percentage instead of asking.

"use client";

// THE SOUND OF A PAGE TURNING: a real recording, public/sounds/page-turn.mp3.
//
// Cut from the "page turn sound.mp3" supplied for it: the source is 2.6s with
// 0.7s of silence before the turn and 0.85s after, which would have made every
// flip land two thirds of a second late. The shipped file is 0.70-1.82s of it,
// mono, 15ms fade in and 100ms fade out, loudness-normalised to -20 LUFS --
// 14KB. (A synthesised flip came first; its low "landing tap" read as a drum
// beat, and a recording is what a page actually sounds like.)
//
// It is decoded ONCE into an AudioBuffer and replayed through Web Audio, so a
// turn plays instantly and several can overlap; an <audio> element would
// stutter on rapid turns. <Book> dispatches `book:turn` each time a new sheet
// lands.
//
// Browsers only let a page make sound after the visitor has interacted with
// it -- a click, a tap or a key; scrolling with a wheel does NOT count -- so
// the file is fetched and the AudioContext created on the first such gesture,
// and the book is silent until then. That is the platform's rule, not a bug.
//
// A reader can switch it off with the speaker under the thumb index; the
// choice is kept in localStorage, which is a per-visitor convenience and
// degrades to "on" when storage is unavailable.

const KEY = "nivlak:page-sound";
const SRC = "/sounds/page-turn.mp3";
let ctx: AudioContext | null = null;
let flip: AudioBuffer | null = null;
let last = 0;

export function soundEnabled() {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
  window.dispatchEvent(new CustomEvent("book:sound", { detail: on }));
}

function unlock() {
  if (ctx) {
    if (ctx.state === "suspended") void ctx.resume();
    return;
  }
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return;
  const audio = new AC();
  ctx = audio;
  void fetch(SRC)
    .then((response) => response.arrayBuffer())
    .then((data) => audio.decodeAudioData(data))
    .then((buffer) => {
      flip = buffer;
    })
    .catch(() => {
      // No sound is the right failure: the book works without it.
    });
}

export function playPageTurn() {
  if (!ctx || !flip || !soundEnabled()) return;
  if (ctx.state !== "running") return;
  // One flip per ~250ms: a fast scrub lands several sheets a second, and a
  // flip on each read as a rhythm rather than as pages.
  const now = performance.now();
  if (now - last < 250) return;
  last = now;

  const source = ctx.createBufferSource();
  source.buffer = flip;
  // A touch of variation so consecutive turns are not identical.
  source.playbackRate.value = 0.95 + Math.random() * 0.1;
  const gain = ctx.createGain();
  gain.gain.value = 0.8;
  source.connect(gain).connect(ctx.destination);
  source.start();
}

/** Wire the sound up once; returns a teardown. */
export function installPageTurnSound() {
  const gestures = ["pointerdown", "keydown", "touchend"] as const;
  for (const g of gestures) window.addEventListener(g, unlock, { passive: true });
  const onTurn = () => playPageTurn();
  window.addEventListener("book:turn", onTurn);
  return () => {
    for (const g of gestures) window.removeEventListener(g, unlock);
    window.removeEventListener("book:turn", onTurn);
  };
}

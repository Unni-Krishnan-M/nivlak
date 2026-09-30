"use client";

// THE SOUND OF A PAGE TURNING: a real recording, public/sounds/page-turn.mp3.
//
// Cut from "page turn sound new .mp3": the source is 2.6s with 0.69s of
// silence before the turn and ~1s after, which would make every flip land
// late. The shipped file is 0.67-1.64s of it, made MILD on request: a
// gentle low-pass at 6kHz takes the edge off the paper's crackle, 40ms fade
// in and 220ms fade out, loudness -24 LUFS -- 12KB. (A synthesised flip came
// first; its low "landing tap" read as a drum beat.)
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
// The file's BYTES are fetched as soon as the book mounts, not on the first
// click, so the first turn after that click already has something to play.
// Decoding waits for the AudioContext, which a browser only allows after a
// gesture; decoding a 1s file takes a few milliseconds.
let bytes: Promise<ArrayBuffer | null> | null = null;
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
  void (bytes ?? Promise.resolve(null))
    .then((data) => (data ? audio.decodeAudioData(data.slice(0)) : null))
    .then((buffer) => {
      if (buffer) flip = buffer;
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
  source.playbackRate.value = 0.97 + Math.random() * 0.06;
  // Mild: a quiet presence under the page, not an effect on top of it.
  const gain = ctx.createGain();
  gain.gain.value = 0.55;
  source.connect(gain).connect(ctx.destination);
  source.start();
}

/** Wire the sound up once; returns a teardown. */
export function installPageTurnSound() {
  bytes ??= fetch(SRC)
    .then((response) => (response.ok ? response.arrayBuffer() : null))
    .catch(() => null);
  const gestures = ["pointerdown", "keydown", "touchend"] as const;
  for (const g of gestures) window.addEventListener(g, unlock, { passive: true });
  const onTurn = () => playPageTurn();
  window.addEventListener("book:turn", onTurn);
  return () => {
    for (const g of gestures) window.removeEventListener(g, unlock);
    window.removeEventListener("book:turn", onTurn);
  };
}

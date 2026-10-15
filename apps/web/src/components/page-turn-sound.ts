"use client";

// THE SOUND OF A PAGE TURNING: a real recording, public/sounds/page-turn.mp3.
//
// Cut from "page turn sound new .mp3": 0.67-1.29s of it -- the rustle and
// nothing else; the source goes on into a sharp "tuck" at 1.37s, cut on
// request. Then made SLOW and SMOOTH, also on request:
//   - stretched to 75% speed, pitch kept (ffmpeg atempo), so 0.8s;
//   - low-passed at 4.8kHz;
//   - its own loudness divided out moment by moment (a 25ms RMS envelope),
//     so the paper texture is even, then ONE rise-and-fall laid over it --
//     rising to 42% of the clip, falling for the rest. Straight from the
//     recording, neighbouring 40ms windows differed by up to 3x, which is
//     what read as "fast and not smooth"; now the swell has no steps;
//   - -24 LUFS, ~10KB.
// (A synthesised flip came first; its low "landing tap" read as a beat.)
//
// THE COVER has two more, both real recordings, both CC0 from Freesound:
//   - public/sounds/book-open.mp3: freesound.org/s/554837 (The_Runner_01,
//     "Book - Open/Close"), 4.80-6.10s -- the air of the cover swinging and
//     a soft low swell as it lies down; no hard transient, because a cover
//     laid open does not slam. +23dB, limited to -6dBFS.
//   - public/sounds/book-close.mp3: freesound.org/s/612174 (MayelinOrozco,
//     "closing a book"), 14.80-15.60s -- ONE thump, starting 50ms before it,
//     so the hit lands on the frame where the covers meet rather than after a
//     swish of pre-roll. -3dB, limited to -3dBFS (the source clipped).
//   Both high-passed at 60Hz, low-passed at 9.5kHz, mono 96k like the turn;
//   ~-28 LUFS each, lifted at playback (GAIN) to sit with the turn.
//
// Each is decoded ONCE into an AudioBuffer and replayed through Web Audio, so
// it plays instantly and several can overlap; an <audio> element would
// stutter on rapid turns. <Book> dispatches `book:turn` each time a new sheet
// lands, and `book:open` / `book:close` as the film passes the frame where
// the covers part.
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
type Sound = "turn" | "open" | "close";
const SRC: Record<Sound, string> = {
  turn: "/sounds/page-turn.mp3",
  open: "/sounds/book-open.mp3",
  close: "/sounds/book-close.mp3",
};
// Mild: a quiet presence under the page, not an effect on top of it. The
// cover's two are ~3.5dB quieter files than the turn, hence the higher gain.
const GAIN: Record<Sound, number> = { turn: 0.55, open: 0.9, close: 0.75 };
// One of each per this many ms: a fast scrub lands several sheets a second,
// and a flip on each read as a rhythm rather than as pages. The cover's
// thresholds already have hysteresis; this only stops a jittering scroll
// right on them from drumming.
const MIN_GAP: Record<Sound, number> = { turn: 250, open: 400, close: 400 };
const SOUNDS = Object.keys(SRC) as Sound[];
let ctx: AudioContext | null = null;
const buffers: Partial<Record<Sound, AudioBuffer>> = {};
// The files' BYTES are fetched as soon as the book mounts, not on the first
// click, so the first sound after that click already has something to play.
// Decoding waits for the AudioContext, which a browser only allows after a
// gesture; decoding a 1s file takes a few milliseconds.
let bytes: Partial<Record<Sound, Promise<ArrayBuffer | null>>> | null = null;
const last: Record<Sound, number> = { turn: 0, open: 0, close: 0 };

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
  // Only inside a REAL user activation. A touch that becomes a scroll fires
  // pointerdown and touchend but is not one, and creating or resuming the
  // context then is refused with a console warning -- one per swipe, logged
  // on a Pixel 5 at every page turn. Where the API is missing, try anyway.
  const activation = (navigator as Navigator & {
    userActivation?: { isActive: boolean };
  }).userActivation;
  if (activation && !activation.isActive) return;
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
  for (const name of SOUNDS) {
    void (bytes?.[name] ?? Promise.resolve(null))
      .then((data) => (data ? audio.decodeAudioData(data.slice(0)) : null))
      .then((buffer) => {
        if (buffer) buffers[name] = buffer;
      })
      .catch(() => {
        // No sound is the right failure: the book works without it.
      });
  }
}

function play(name: Sound) {
  const buffer = buffers[name];
  if (!ctx || !buffer || !soundEnabled()) return;
  if (ctx.state !== "running") return;
  const now = performance.now();
  if (now - last[name] < MIN_GAP[name]) return;
  last[name] = now;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  // Always the same speed: a random pitch per turn read as unevenness.
  const gain = ctx.createGain();
  gain.gain.value = GAIN[name];
  source.connect(gain).connect(ctx.destination);
  source.start();
}

export const playPageTurn = () => play("turn");

/** Wire the sounds up once; returns a teardown. */
export function installPageTurnSound() {
  bytes ??= Object.fromEntries(
    SOUNDS.map((name) => [
      name,
      fetch(SRC[name])
        .then((response) => (response.ok ? response.arrayBuffer() : null))
        .catch(() => null),
    ]),
  );
  const gestures = ["pointerdown", "keydown", "touchend", "click"] as const;
  for (const g of gestures) window.addEventListener(g, unlock, { passive: true });
  const listeners = SOUNDS.map((name) => {
    const event = name === "turn" ? "book:turn" : `book:${name}`;
    const listener = () => play(name);
    window.addEventListener(event, listener);
    return () => window.removeEventListener(event, listener);
  });
  return () => {
    for (const g of gestures) window.removeEventListener(g, unlock);
    for (const remove of listeners) remove();
  };
}

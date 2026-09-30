"use client";

// THE SOUND OF A PAGE TURNING, synthesised rather than recorded.
//
// No audio file ships with the book: a flip is a burst of noise swept through
// a band-pass filter (the paper sliding) followed by a short low "settle" (the
// leaf landing), which Web Audio builds in a few lines and costs nothing to
// download. <Book> dispatches `book:turn` each time a new sheet lands; this
// module plays one flip per event.
//
// Browsers only let a page make sound after the visitor has interacted with
// it -- a click, a tap or a key; scrolling with a wheel does NOT count -- so
// the AudioContext is created on the first such gesture and the book is
// silent until then. That is the platform's rule, not a bug.
//
// A reader can switch it off with the speaker under the thumb index; the
// choice is kept in localStorage, which is a per-visitor convenience and
// degrades to "on" when storage is unavailable.

const KEY = "nivlak:page-sound";
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
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
  ctx = new AC();
  const length = Math.floor(ctx.sampleRate * 0.6);
  noise = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
}

export function playPageTurn() {
  if (!ctx || !noise || !soundEnabled()) return;
  if (ctx.state !== "running") return;
  // A fast scrub lands several sheets a second; one flip per ~140ms reads as
  // riffling through pages rather than a buzz.
  const now = performance.now();
  if (now - last < 140) return;
  last = now;

  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 0.32;
  out.connect(ctx.destination);

  // The swish: noise through a band-pass that sweeps down as the leaf travels.
  const swish = ctx.createBufferSource();
  swish.buffer = noise;
  swish.playbackRate.value = 0.9 + Math.random() * 0.2;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 0.9;
  band.frequency.setValueAtTime(3800, t);
  band.frequency.exponentialRampToValueAtTime(900, t + 0.32);
  const high = ctx.createBiquadFilter();
  high.type = "highpass";
  high.frequency.value = 350;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(0.9, t + 0.04);
  env.gain.exponentialRampToValueAtTime(0.25, t + 0.2);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
  swish.connect(band).connect(high).connect(env).connect(out);
  swish.start(t);
  swish.stop(t + 0.4);

  // The settle: a short, low, soft tap as the page lands.
  const tap = ctx.createBufferSource();
  tap.buffer = noise;
  const low = ctx.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 420;
  const tapEnv = ctx.createGain();
  tapEnv.gain.setValueAtTime(0.0001, t + 0.3);
  tapEnv.gain.exponentialRampToValueAtTime(0.7, t + 0.315);
  tapEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  tap.connect(low).connect(tapEnv).connect(out);
  tap.start(t + 0.3);
  tap.stop(t + 0.45);
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

"use client";

// THE SOUND OF A PAGE TURNING, synthesised rather than recorded.
//
// No audio file ships with the book. A turning page is not a hit: it is a
// soft RUSTLE that swells as the leaf lifts and fades as it settles, a scatter
// of tiny high CRINKLES (the paper's own texture) through the middle of the
// turn, and a faint low WHOOSH of air. All three are rendered ONCE into a
// buffer (OfflineAudioContext) and replayed with a slight random pitch, so
// no two turns are identical. The first version ended in a low filtered
// "tap" for the leaf landing; that transient is what read as a drum beat,
// and it is gone. <Book> dispatches `book:turn` each time a new sheet lands; this
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
let flip: AudioBuffer | null = null;
let last = 0;
const DURATION = 0.75;

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

/** A smooth rise-and-fall, 0..1, peaking at `peak` (fraction of the turn). */
function swell(n: number, peak: number, sharp = 1.6) {
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    const y = x < peak ? x / peak : (1 - x) / (1 - peak);
    curve[i] = Math.pow(Math.sin((y * Math.PI) / 2), sharp);
  }
  return curve;
}

async function render(sampleRate: number) {
  const length = Math.floor(sampleRate * DURATION);
  const off = new OfflineAudioContext(1, length, sampleRate);

  const white = off.createBuffer(1, length, sampleRate);
  const w = white.getChannelData(0);
  for (let i = 0; i < length; i++) w[i] = Math.random() * 2 - 1;

  // RUSTLE: paper sliding over paper -- mid-high band, gentle swell.
  const rustle = off.createBufferSource();
  rustle.buffer = white;
  const hp = off.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 900;
  const bp = off.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 0.55;
  bp.frequency.setValueAtTime(2600, 0);
  bp.frequency.linearRampToValueAtTime(4200, DURATION * 0.45);
  bp.frequency.linearRampToValueAtTime(2200, DURATION);
  const rustleEnv = off.createGain();
  // The swell times an irregular FLUTTER (a smoothed random walk, 0.55-1):
  // a leaf bending does not hiss evenly, and a smooth envelope alone read as
  // a steady "shhh" of noise rather than paper.
  const env = swell(256, 0.38);
  let walk = 0.8;
  let smooth = 0.8;
  for (let i = 0; i < env.length; i++) {
    walk = Math.min(1, Math.max(0.55, walk + (Math.random() - 0.5) * 0.35));
    smooth += (walk - smooth) * 0.35;
    env[i] = env[i]! * smooth;
  }
  rustleEnv.gain.setValueCurveAtTime(env, 0, DURATION);
  rustle.connect(hp).connect(bp).connect(rustleEnv).connect(off.destination);

  // CRINKLE: a scatter of 1-4ms grains, densest mid-turn, high and dry.
  const grains = off.createBuffer(1, length, sampleRate);
  const g = grains.getChannelData(0);
  const count = 70;
  for (let k = 0; k < count; k++) {
    // Clustered toward the middle of the turn.
    const at = (0.12 + 0.62 * ((Math.random() + Math.random() + Math.random()) / 3)) * DURATION;
    const start = Math.floor(at * sampleRate);
    const len = Math.floor(sampleRate * (0.001 + Math.random() * 0.003));
    const amp = 0.15 + Math.random() * 0.45;
    for (let i = 0; i < len && start + i < length; i++) {
      g[start + i] += (Math.random() * 2 - 1) * amp * Math.exp((-5 * i) / len);
    }
  }
  const crinkle = off.createBufferSource();
  crinkle.buffer = grains;
  const chp = off.createBiquadFilter();
  chp.type = "highpass";
  chp.frequency.value = 2400;
  const crinkleGain = off.createGain();
  crinkleGain.gain.value = 0.55;
  crinkle.connect(chp).connect(crinkleGain).connect(off.destination);

  // WHOOSH: the air the leaf moves -- low, soft, slower swell.
  const whoosh = off.createBufferSource();
  whoosh.buffer = white;
  whoosh.playbackRate.value = 0.5;
  const lp = off.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 650;
  const whooshEnv = off.createGain();
  whooshEnv.gain.setValueCurveAtTime(
    swell(256, 0.5, 2.2).map((v) => v * 0.35),
    0,
    DURATION,
  );
  whoosh.connect(lp).connect(whooshEnv).connect(off.destination);

  rustle.start(0);
  crinkle.start(0);
  whoosh.start(0);
  const out = await off.startRendering();

  // Normalise, so the level is set by `gain` in playPageTurn alone.
  const d = out.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]!));
  if (peak > 0) for (let i = 0; i < d.length; i++) d[i]! /= peak;
  return out;
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
  void render(ctx.sampleRate).then((buffer) => {
    flip = buffer;
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
  source.playbackRate.value = 0.9 + Math.random() * 0.18;
  const gain = ctx.createGain();
  gain.gain.value = 0.28;
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


#!/usr/bin/env node
// Scroll the running dev server and screenshot it, for scroll-driven work.
//
// The landing page is one long scrubbed animation across two pinned sections.
// Nothing about whether it is RIGHT survives `next build` -- a page can compile,
// typecheck and still hand you a black screen for nine viewports, which is
// exactly what the first version of <BookPages> did. The only check that catches
// that is looking, and looking by hand does not survive being asked to look
// again after the next change.
//
// So: drive headless Chrome over CDP, walk the document, write a PNG per stop.
// Feed the directory to `magick montage` for a contact sheet.
//
//   node tools/scroll-shots.mjs --out /tmp/shots
//   node tools/scroll-shots.mjs --out /tmp/turn --from 5200 --to 6300 --shots 12
//   node tools/scroll-shots.mjs --out /tmp/m --viewport 390x844
//   node tools/scroll-shots.mjs --out /tmp/rm --reduced-motion
//
// Needs a dev server already running (pnpm dev:web) and google-chrome-stable.
// --probe prints the live DOM state at each stop instead of writing a PNG,
// which is how you find out that a sheet is at z-index 40 with no transform
// rather than guessing from a dark rectangle.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const arg = (flag, dflt) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const OUT = path.resolve(arg("--out", path.join(os.tmpdir(), "scroll-shots")));
const URL_ = arg("--url", "http://localhost:3001/");
const SHOTS = Number(arg("--shots", 16));
const FROM = Number(arg("--from", 0));
const TO = arg("--to", null) === null ? null : Number(arg("--to"));
const SETTLE = Number(arg("--settle", 1400));
const READY = Number(arg("--ready", 9000));
const PROBE = has("--probe");
const REDUCED = has("--reduced-motion");
const [W, H] = arg("--viewport", "1440x900").split("x").map(Number);

// Refuse rather than proceed: a mistyped --viewport used to sail through as
// NaN, and Chrome quietly fell back to its own window size. The run then
// reported "NaNxundefined", wrote a full set of screenshots at the wrong
// viewport, and looked like it had passed.
for (const [flag, value, min] of [
  ["--viewport width", W, 1],
  ["--viewport height", H, 1],
  ["--shots", SHOTS, 1],
  ["--from", FROM, 0],
  ["--to", TO ?? 0, 0],
]) {
  if (!Number.isFinite(value) || value < min) {
    console.error(`bad ${flag}: ${value}`);
    process.exit(2);
  }
}

const CHROME = "/usr/bin/google-chrome-stable";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The scrub has a catch-up of about a second, so a screenshot taken straight
// after window.scrollTo catches the animation mid-flight and every run
// disagrees with the last. --settle is that lag plus a margin; do not trim it
// to make the run faster, you will only make it lie.
if (SETTLE < 1000) console.warn(`warning: --settle ${SETTLE}ms is under the scrub's catch-up; frames may be caught mid-flight`);

if (!PROBE) fs.mkdirSync(OUT, { recursive: true });

const port = 9300 + Math.floor(Math.random() * 600);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "scroll-shots-chrome-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-sandbox",
    "--disable-gpu",
    "--hide-scrollbars",
    // Without this a HiDPI host doubles every screenshot and the contact
    // sheets stop being comparable between machines.
    "--force-device-scale-factor=1",
    `--window-size=${W},${H}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

const cleanup = () => {
  try { chrome.kill(); } catch {}
  // Best-effort. Chrome is still tearing down its own profile as we exit, so
  // this races and throws ENOTEMPTY often enough that letting it kill the run
  // would mean a green screenshot pass reporting a crash.
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    /* the OS will reap it from tmp */
  }
};
process.on("exit", cleanup);

let target;
for (let i = 0; i < 60; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = list.find((t) => t.type === "page");
    if (target) break;
  } catch {
    /* chrome is still coming up */
  }
  await sleep(250);
}
if (!target) {
  console.error(`no chrome target after 15s -- is ${CHROME} installed?`);
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let nextId = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message.result);
    pending.delete(message.id);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result?.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: W,
  height: H,
  deviceScaleFactor: 1,
  mobile: false,
});
if (REDUCED) {
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
}
await send("Page.navigate", { url: URL_ });
// The frame set is fetched in batches after mount; screenshotting before it
// has landed measures the loader, not the reveal.
await sleep(READY);

const total = await evaluate("document.documentElement.scrollHeight");
const lo = FROM;
const hi = TO ?? total - H;
console.log(
  `${W}x${H}${REDUCED ? " reduced-motion" : ""}  scrollHeight=${total} (${(total / H).toFixed(1)} viewports)  sampling ${lo}..${hi} in ${SHOTS}`,
);

// What a dark rectangle actually is. Read this before theorising about CSS.
const PROBE_JS = `(() => {
  const out = { scrollY: window.scrollY };
  out.spacers = [...document.querySelectorAll('.pin-spacer')]
    .map((p) => ({ height: p.offsetHeight, top: Math.round(p.getBoundingClientRect().top) }));
  out.sections = [...document.querySelectorAll('section')].map((s) => {
    const r = s.getBoundingClientRect();
    return { top: Math.round(r.top), height: Math.round(r.height), position: getComputedStyle(s).position };
  });
  const img = document.querySelector('section img');
  out.frame = img && { left: img.style.left, top: img.style.top, width: img.style.width, height: img.style.height, natural: img.naturalWidth };
  const stage = document.querySelector('[style*="perspective"]');
  out.sheets = stage ? [...stage.children].map((el) => ({
    z: el.style.zIndex,
    opacity: el.style.opacity,
    visibility: el.style.visibility,
    left: el.style.left,
    width: el.style.width,
    transform: el.style.transform.slice(0, 70),
  })) : null;
  return out;
})()`;

for (let i = 0; i < SHOTS; i++) {
  const y = Math.round(lo + (hi - lo) * (SHOTS === 1 ? 0 : i / (SHOTS - 1)));
  await evaluate(`window.scrollTo(0, ${y})`);
  await sleep(SETTLE);

  if (PROBE) {
    console.log(`\n--- y=${y} ---`);
    console.log(JSON.stringify(await evaluate(PROBE_JS), null, 1));
    continue;
  }
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  const file = path.join(OUT, `${String(i).padStart(2, "0")}-y${y}.png`);
  fs.writeFileSync(file, Buffer.from(data, "base64"));
}

ws.close();
if (!PROBE) {
  console.log(`\n${SHOTS} frames -> ${OUT}`);
  console.log(`contact sheet:\n  magick montage ${OUT}/*.png -tile 4x4 -geometry 360x225+3+3 -background '#111' ${OUT}/sheet.png`);
}
process.exit(0);

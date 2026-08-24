#!/usr/bin/env node
// Headless QA renderer for apps/web/src/components/book-camera.ts
//
// Transpiles the REAL camera module, drives it from a self-contained HTML
// harness inside headless Chrome, and produces (a) a labelled contact sheet
// PNG per viewport and (b) frame-to-frame difference / geometry metrics.
//
// Usage: node tools/qa-book-camera.mjs [--out DIR] [--samples N]

import { execFileSync, execFileSync as run } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const SRC = path.join(REPO, "apps/web/src/components/book-camera.ts");
const FRAMES_DIR = path.join(REPO, "apps/web/public/frames/v4/hd");
const GEN = path.join(REPO, "apps/web/src/components/book-frames.generated.ts");
const CHROME = "/usr/bin/google-chrome-stable";

const argv = process.argv.slice(2);
const argOf = (flag, dflt) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const OUT = path.resolve(
  argOf("--out", path.join(os.tmpdir(), "qa-book-camera")),
);
const SAMPLES = Number(argOf("--samples", "61"));
const COLS = 8;
const MIN_CELL_W = 360;

// The book anchors, read straight out of the generated table the build script
// writes. Scraped rather than imported because the node side would otherwise
// need its own transpile pass; the render path always uses the real module.
const FRAMES = [...fs.readFileSync(GEN, "utf8").matchAll(
  /\{\s*ax:\s*(-?\d+)\s*,\s*ay:\s*(-?\d+)\s*,\s*sw:\s*(-?\d+)\s*,\s*sh:\s*(-?\d+)\s*\}/g,
)].map(([, ax, ay, sw, sh]) => ({ ax: +ax, ay: +ay, sw: +sw, sh: +sh }));
if (!FRAMES.length) throw new Error(`no frames parsed out of ${GEN}`);
const FRAME_COUNT = FRAMES.length;
const FRAME_W_SRC = Number(
  /GENERATED_FRAME_W\s*=\s*(\d+)/.exec(fs.readFileSync(GEN, "utf8"))?.[1],
);

const VIEWPORTS = [
  [1600, 900],
  [1440, 1080],
  [390, 844],
  [844, 390],
];

fs.mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- 1. transpile
function transpile() {
  const stage = path.join(OUT, "tsc");
  const srcDir = path.join(OUT, "tsc-src");
  fs.mkdirSync(stage, { recursive: true });
  fs.mkdirSync(srcDir, { recursive: true });
  // Compile byte copies outside the repo: tsc refuses to take a file on the
  // command line while a tsconfig.json is in scope. The generated frame table
  // comes along too, with the path alias rewritten relative, because tsc has no
  // tsconfig here to resolve "@/" against.
  const copy = path.join(srcDir, "book-camera.ts");
  fs.writeFileSync(
    copy,
    fs.readFileSync(SRC, "utf8").replace(
      /["']@\/components\/book-frames\.generated["']/g,
      '"./book-frames.generated"',
    ),
  );
  const genCopy = path.join(srcDir, "book-frames.generated.ts");
  fs.copyFileSync(GEN, genCopy);
  run(
    "npx",
    [
      "tsc", copy, genCopy,
      "--outDir", stage,
      "--target", "es2022",
      "--module", "es2022",
      "--moduleResolution", "bundler",
      "--skipLibCheck",
      "--ignoreConfig",
    ],
    { cwd: REPO, stdio: "inherit" },
  );
  const js = path.join(stage, "book-camera.js");
  if (!fs.existsSync(js)) throw new Error("tsc produced no book-camera.js");
  // The harness inlines the module into one <script type="module">, so the two
  // files are concatenated with the import between them dropped and the export
  // keywords stripped -- everything then shares that one module scope.
  const gen = fs
    .readFileSync(path.join(stage, "book-frames.generated.js"), "utf8")
    .replace(/^export /gm, "");
  const cam = fs
    .readFileSync(js, "utf8")
    .replace(/^import[\s\S]*?from\s*["'][^"']+["'];?[ \t]*$/m, "")
    .replace(/^export /gm, "");
  return `${gen}\n${cam}`;
}

// ------------------------------------------------------------------ 2. harness
function harnessHtml(moduleJs, W, H) {
  // Cell geometry for the contact sheet.
  const rows = Math.ceil(SAMPLES / COLS);
  const cellW = Math.max(MIN_CELL_W, 0);
  const cellH = Math.round((cellW * H) / W);
  const LABEL = 26;
  const PAD = 4;
  const sheetW = COLS * (cellW + PAD) + PAD;
  const sheetH = rows * (cellH + LABEL + PAD) + PAD;

  const frameUrls = Array.from({ length: FRAME_COUNT }, (_, i) =>
    "file://" + path.join(FRAMES_DIR, `frame-${String(i + 1).padStart(3, "0")}.webp`),
  );

  const imgTags = frameUrls
    .map((u, i) => `<img id="f${i}" src="${u}" width="8" height="8">`)
    .join("\n");

  return `<!doctype html>
<meta charset="utf-8">
<title>rendering</title>
<style>
  html,body{margin:0;padding:0;background:#101014;}
  #sheet{display:block;}
  #preload{position:absolute;left:-99999px;top:0;}
  #metrics{position:absolute;left:-99999px;top:0;white-space:pre;}
</style>
<canvas id="sheet" width="${sheetW}" height="${sheetH}"></canvas>
<div id="preload">
${imgTags}
</div>
<pre id="metrics"></pre>
<script type="module">
${moduleJs}

const W = ${W}, H = ${H}, N = ${SAMPLES};
const COLS = ${COLS}, CELL_W = ${cellW}, CELL_H = ${cellH}, LABEL = ${LABEL}, PAD = ${PAD};

// Everything runs synchronously inside the load handler: headless Chrome
// serialises the DOM (--dump-dom) / paints (--screenshot) once load has been
// dispatched, so any work left on a promise would be missed.
function render(){
  const imgs = [];
  for (let i = 0; i < FRAME_COUNT; i++) imgs.push(document.getElementById("f" + i));
  for (const im of imgs){
    if (!im.naturalWidth) throw new Error("frame not decoded: " + im.src);
  }

  const off = document.createElement("canvas");
  off.width = W; off.height = H;
  const ox = off.getContext("2d", { willReadFrequently: true });

  const sheet = document.getElementById("sheet");
  const sx = sheet.getContext("2d");
  sx.fillStyle = "#101014";
  sx.fillRect(0, 0, sheet.width, sheet.height);

  const plans = [];
  const diffs = [];
  let prev = null;

  for (let i = 0; i < N; i++){
    const u = N === 1 ? 0 : i / (N - 1);
    const plan = planAt(u, W, H);

    // paint exactly as <BookScrollReveal> does
    ox.globalAlpha = 1;
    ox.fillStyle = LETTERBOX;
    ox.fillRect(0, 0, W, H);
    for (const L of plan.layers){
      ox.globalAlpha = L.alpha;
      ox.drawImage(imgs[L.index], L.x, L.y, L.width, L.height);
    }
    ox.globalAlpha = 1;


    // mean absolute per-pixel difference against the previous sample
    const cur = ox.getImageData(0, 0, W, H).data;
    if (prev){
      let acc = 0;
      for (let p = 0; p < cur.length; p += 4){
        acc += Math.abs(cur[p] - prev[p])
             + Math.abs(cur[p+1] - prev[p+1])
             + Math.abs(cur[p+2] - prev[p+2]);
      }
      diffs.push(acc / ((cur.length / 4) * 3));
    }
    prev = cur;

    // blit into the contact sheet
    const col = i % COLS, row = (i / COLS) | 0;
    const cx = PAD + col * (CELL_W + PAD);
    const cy = PAD + row * (CELL_H + LABEL + PAD);
    sx.drawImage(off, cx, cy, CELL_W, CELL_H);
    sx.strokeStyle = "#2a3550";
    sx.lineWidth = 1;
    sx.strokeRect(cx + 0.5, cy + 0.5, CELL_W - 1, CELL_H - 1);
    sx.fillStyle = "#000";
    sx.fillRect(cx, cy + CELL_H, CELL_W, LABEL);
    sx.fillStyle = "#7CFFB2";
    sx.font = "bold 17px monospace";
    sx.textBaseline = "middle";
    sx.fillText(
      "#" + String(i).padStart(2,"0") +
      "  u=" + u.toFixed(3) +
      "  ph=" + plan.playhead.toFixed(2),
      cx + 6, cy + CELL_H + LABEL/2
    );

    plans.push({
      i, u,
      playhead: plan.playhead, base: plan.base,
      mix: plan.mix, dip: plan.dip,
      layers: plan.layers.map(L => ({
        index: L.index, alpha: L.alpha,
        x: L.x, y: L.y, width: L.width, height: L.height,
      })),
    });
  }

  return { viewport: [W, H], samples: N, sheet: [sheet.width, sheet.height], plans, diffs };
}

function go(){
  let payload;
  try { payload = render(); }
  catch (e) { payload = { error: String((e && e.stack) || e) }; }
  document.getElementById("metrics").textContent = JSON.stringify(payload);
  document.title = "READY";
}

if (document.readyState === "complete") go();
else window.addEventListener("load", go);
</script>
`;
}

// -------------------------------------------------------------------- 3. drive
function chrome(args, extra = {}) {
  return execFileSync(
    CHROME,
    [
      "--headless=old",
      "--no-sandbox",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--allow-file-access-from-files",
      "--disable-dev-shm-usage",
      "--run-all-compositor-stages-before-draw",
      "--virtual-time-budget=20000",
      "--timeout=60000",
      ...args,
    ],
    { encoding: "buffer", maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "pipe"], ...extra },
  );
}

function unescapeHtml(s) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

// ---------------------------------------------------------------- 4. reporting
function stats(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
  return { min: s[0], max: s[s.length - 1], median: q(0.5) };
}

function report(W, H, m) {
  const lines = [];
  const P = (s = "") => lines.push(s);
  P(`\n${"=".repeat(72)}`);
  P(`VIEWPORT ${W}x${H}   samples=${m.samples}   sheet=${m.sheet.join("x")}`);
  P("=".repeat(72));

  const { median, max, min } = stats(m.diffs);
  P(`\nconsecutive mean-abs-diff (0-255): median=${median.toFixed(3)} min=${min.toFixed(3)} max=${max.toFixed(3)}`);
  const spikes = m.diffs
    .map((d, i) => ({ i, d }))
    .filter((r) => r.d > 3 * median);
  if (!spikes.length) P("  no sample pair exceeds 3x the median (no hard jumps)");
  for (const s of spikes) {
    const a = m.plans[s.i], b = m.plans[s.i + 1];
    P(`  JUMP  ${String(s.i).padStart(2)}->${String(s.i + 1).padStart(2)}  ` +
      `u=${a.u.toFixed(3)}->${b.u.toFixed(3)}  ` +
      `playhead=${a.playhead.toFixed(3)}->${b.playhead.toFixed(3)}  ` +
      `diff=${s.d.toFixed(2)} (${(s.d / median).toFixed(1)}x median)`);
  }

  // letterbox
  P("\nletterbox bars:");
  let lb = [];
  for (const p of m.plans) {
    const L = p.layers[0];
    const barX = Math.max(0, L.x);
    const barY = Math.max(0, L.y);
    if (barX > 0.5 || barY > 0.5) lb.push({ p, barX, barY });
  }
  if (!lb.length) P("  none - the image covers the viewport at every sample");
  else {
    const maxX = Math.max(...lb.map((r) => r.barX));
    const maxY = Math.max(...lb.map((r) => r.barY));
    P(`  present in ${lb.length}/${m.plans.length} samples`);
    P(`  playhead range ${lb[0].p.playhead.toFixed(3)} .. ${lb[lb.length - 1].p.playhead.toFixed(3)}` +
      `  (u ${lb[0].p.u.toFixed(3)} .. ${lb[lb.length - 1].p.u.toFixed(3)})`);
    P(`  max side bar ${maxX.toFixed(1)}px per side (${(200 * maxX / W).toFixed(1)}% of width)`);
    P(`  max top bar  ${maxY.toFixed(1)}px per side (${(200 * maxY / H).toFixed(1)}% of height)`);
  }

  // dissolve registration: how far apart the two books sit mid-dissolve
  P("\nmid-dissolve registration (distance between the two frames' book centres):");
  const mid = new Map();
  for (const p of m.plans) {
    if (p.layers.length < 2) continue;
    const cur = mid.get(p.base);
    if (cur && Math.abs(cur.mix - 0.5) <= Math.abs(p.mix - 0.5)) continue;
    mid.set(p.base, p);
  }
  for (const [b, p] of [...mid.entries()].sort((a, x) => a[0] - x[0])) {
    const [L0, L1] = p.layers;
    const s = L0.width / FRAME_W_SRC;
    const dx = (L0.x + FRAMES[L0.index].ax * s) - (L1.x + FRAMES[L1.index].ax * s);
    const dy = (L0.y + FRAMES[L0.index].ay * s) - (L1.y + FRAMES[L1.index].ay * s);
    const flag = Math.hypot(dx, dy) > 40 ? "   <-- visible double image" : "";
    P(`  frame ${b + 1}->${b + 2}  sample #${String(p.i).padStart(2)} mix=${p.mix.toFixed(2)}  ` +
      `dx=${dx.toFixed(0).padStart(5)}px dy=${dy.toFixed(0).padStart(4)}px${flag}`);
  }

  // upscale
  let best = { f: 0 };
  for (const p of m.plans) {
    const f = p.layers[0].width / FRAME_W_SRC;
    if (f > best.f) best = { f, p };
  }
  const first = m.plans[0].layers[0].width / FRAME_W_SRC;
  P(`\nupscale factor (layer.width / FRAME_W):`);
  P(`  at u=0: ${first.toFixed(3)}x`);
  P(`  max   : ${best.f.toFixed(3)}x at sample #${best.p.i} u=${best.p.u.toFixed(3)} playhead=${best.p.playhead.toFixed(3)}`);

  return lines.join("\n");
}

// ------------------------------------------------------------------------ main
const moduleJs = transpile();
const allReports = [];
const allMetrics = {};

for (const [W, H] of VIEWPORTS) {
  const tag = `${W}x${H}`;
  const html = harnessHtml(moduleJs, W, H);
  const htmlPath = path.join(OUT, `harness-${tag}.html`);
  fs.writeFileSync(htmlPath, html);
  const url = "file://" + htmlPath;

  // sheet size, recomputed here for --window-size
  const rows = Math.ceil(SAMPLES / COLS);
  const cellW = MIN_CELL_W;
  const cellH = Math.round((cellW * H) / W);
  const sheetW = COLS * (cellW + 4) + 4;
  const sheetH = rows * (cellH + 26 + 4) + 4;

  process.stderr.write(`\n[${tag}] dumping metrics ...\n`);
  const dom = chrome([`--window-size=800,600`, "--dump-dom", url]).toString("utf8");
  const mtx = /<pre id="metrics">([\s\S]*?)<\/pre>/.exec(dom);
  if (!mtx) {
    console.error(dom.slice(0, 2000));
    throw new Error(`[${tag}] no metrics element in dumped DOM`);
  }
  const m = JSON.parse(unescapeHtml(mtx[1]));
  if (m.error) throw new Error(`[${tag}] harness error: ${m.error}`);
  allMetrics[tag] = m;

  process.stderr.write(`[${tag}] screenshotting sheet ${sheetW}x${sheetH} ...\n`);
  const shot = path.join(OUT, `sheet-${tag}.png`);
  chrome([`--window-size=${sheetW},${sheetH}`, `--screenshot=${shot}`, url]);
  if (!fs.existsSync(shot)) throw new Error(`[${tag}] no screenshot written`);

  const dims = execFileSync("magick", ["identify", "-format", "%wx%h", shot]).toString();
  const meanPct = execFileSync("magick", [shot, "-format", "%[fx:mean]", "info:"]).toString();
  process.stderr.write(`[${tag}] sheet ${dims}  mean luminance ${(+meanPct).toFixed(4)}\n`);
  if (+meanPct < 0.01) process.stderr.write(`[${tag}] WARNING: sheet is near-black\n`);

  allReports.push(report(W, H, m) + `\n\nsheet: ${shot}  (${dims}, mean lum ${(+meanPct).toFixed(4)})`);
}

fs.writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify(allMetrics, null, 1));
console.log(allReports.join("\n"));
console.log(`\nmetrics: ${path.join(OUT, "metrics.json")}`);

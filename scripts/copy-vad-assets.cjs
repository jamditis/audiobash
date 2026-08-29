// Copies the voice-activity-detection runtime assets (Silero model, audio worklet, and the
// ONNX Runtime WebAssembly) from node_modules into public/vad. Vite serves public/ in dev and
// copies it into dist/ on build, so the app loads these from its own origin instead of fetching
// them from a remote CDN at runtime. useVAD.ts points baseAssetPath/onnxWASMBasePath at ./vad/.
//
// Run before `vite` / `vite build` (wired into the npm scripts). public/vad is gitignored so the
// binaries are never committed; this script regenerates them from the installed package versions.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const destDir = path.join(root, 'public', 'vad');

// [source path under node_modules, destination filename]
const assets = [
  ['@ricky0123/vad-web/dist/vad.worklet.bundle.min.js', 'vad.worklet.bundle.min.js'],
  ['@ricky0123/vad-web/dist/silero_vad_legacy.onnx', 'silero_vad_legacy.onnx'],
  ['onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.wasm'],
  ['onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.mjs'],
];

// This directory is generated and gitignored. Recreate it so a removed model or renamed runtime
// file cannot remain in a later build.
fs.rmSync(destDir, { recursive: true, force: true });
fs.mkdirSync(destDir, { recursive: true });

let copied = 0;
let missing = 0;
for (const [src, name] of assets) {
  const from = path.join(root, 'node_modules', src);
  const to = path.join(destDir, name);
  if (!fs.existsSync(from)) {
    console.error(`[copy-vad-assets] Missing source asset: ${src}`);
    missing++;
    continue;
  }
  // Always overwrite so public/vad is guaranteed to match the installed package versions. A
  // size-only check could silently keep a stale or corrupted asset whose size happened to match,
  // and these are security-sensitive runtime binaries, so a few small copies per build is cheap.
  fs.copyFileSync(from, to);
  copied++;
}

console.log(`[copy-vad-assets] ${copied}/${assets.length} VAD assets present in public/vad`);
if (missing > 0) {
  console.error(
    '[copy-vad-assets] One or more source assets were missing. Run `npm install` first.',
  );
  process.exit(1);
}

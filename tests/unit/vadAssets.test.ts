import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { readdirSync } from 'fs';
import { join } from 'path';

const rootDir = join(__dirname, '../..');
const generatedVADDirectory = join(rootDir, 'public', 'vad');

describe('VAD runtime asset generation', () => {
  it('generates only the selected legacy model and its runtime files', () => {
    const output = execFileSync(process.execPath, [join(rootDir, 'scripts/copy-vad-assets.cjs')], {
      cwd: rootDir,
      encoding: 'utf8',
    });

    expect(readdirSync(generatedVADDirectory).sort()).toEqual(
      [
        'ort-wasm-simd-threaded.mjs',
        'ort-wasm-simd-threaded.wasm',
        'silero_vad_legacy.onnx',
        'vad.worklet.bundle.min.js',
      ].sort(),
    );
    expect(output).toContain('4/4 VAD assets present');
  });
});

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { join } from 'path';

interface VADBundleReport {
  entryChunk: string;
  entryCharacters: number;
  entryBytes: number;
  vadOwnerChunks: Array<{ fileName: string; characters: number; bytes: number }>;
  staticVADModules: string[];
  allVADOwnersAreDeferred: boolean;
  entryPreloadsVAD: boolean;
}

const rootDir = join(__dirname, '../..');
const inspectorPath = join(rootDir, 'tests/helpers/inspect-vad-bundle.mjs');

describe('renderer VAD bundle boundary', () => {
  it('keeps the VAD and ONNX runtime outside the initial static chunk closure', () => {
    const report = JSON.parse(
      execFileSync(process.execPath, [inspectorPath, rootDir], {
        cwd: rootDir,
        encoding: 'utf8',
      }),
    ) as VADBundleReport;

    expect(report.entryChunk).toMatch(/^assets\/index-.*\.js$/);
    expect(report.entryBytes).toBeGreaterThan(0);
    expect(report.entryBytes).toBeGreaterThan(report.entryCharacters);
    expect(report.vadOwnerChunks.length).toBeGreaterThan(0);
    for (const chunk of report.vadOwnerChunks) {
      expect(chunk.bytes).toBeGreaterThanOrEqual(chunk.characters);
    }
    expect(report.staticVADModules).toEqual([]);
    expect(report.allVADOwnersAreDeferred).toBe(true);
    expect(report.entryPreloadsVAD).toBe(false);
  });
});

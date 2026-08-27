import { execFileSync as systemExecFileSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createRequire } from 'module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);

interface RepairOptions {
  nodePtyRoot: string;
  targetArchitecture: 'arm64' | 'x64';
  releaseMode: boolean;
  execFileSync: typeof systemExecFileSync;
  chmodSync?: (path: string, mode: number) => void;
}

const { repairNodePtyBinaries, verifyNodePtyBinaries } =
  require('../../scripts/nodePtyBinaries.cjs') as {
    repairNodePtyBinaries: (options: RepairOptions) => boolean;
    verifyNodePtyBinaries: (options: RepairOptions) => boolean;
  };

const temporaryDirectories: string[] = [];

function createNodePtyPrebuild(architecture: 'arm64' | 'x64'): string {
  const nodePtyRoot = mkdtempSync(join(tmpdir(), 'audiobash-node-pty-'));
  temporaryDirectories.push(nodePtyRoot);

  const prebuildRoot = join(nodePtyRoot, 'prebuilds', `darwin-${architecture}`);
  mkdirSync(prebuildRoot, { recursive: true });

  for (const fileName of ['spawn-helper', 'pty.node']) {
    const filePath = join(prebuildRoot, fileName);
    writeFileSync(filePath, 'test binary');
    chmodSync(filePath, 0o644);
  }

  return nodePtyRoot;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('node-pty binary repair', () => {
  it.each(['arm64', 'x64'] as const)(
    'repairs and validates the %s macOS prebuild',
    (targetArchitecture) => {
      const nodePtyRoot = createNodePtyPrebuild(targetArchitecture);
      const execFileSync = vi.fn<typeof systemExecFileSync>();

      repairNodePtyBinaries({
        nodePtyRoot,
        targetArchitecture,
        releaseMode: true,
        execFileSync,
      });

      const prebuildRoot = join(nodePtyRoot, 'prebuilds', `darwin-${targetArchitecture}`);
      const spawnHelperPath = join(prebuildRoot, 'spawn-helper');
      const ptyNodePath = join(prebuildRoot, 'pty.node');

      expect(statSync(spawnHelperPath).mode & 0o777).toBe(0o755);
      expect(execFileSync.mock.calls).toEqual([
        ['/usr/bin/codesign', ['--force', '--sign', '-', spawnHelperPath], { stdio: 'pipe' }],
        ['/usr/bin/codesign', ['--force', '--sign', '-', ptyNodePath], { stdio: 'pipe' }],
        ['/usr/bin/codesign', ['--verify', '--strict', spawnHelperPath], { stdio: 'pipe' }],
        ['/usr/bin/codesign', ['--verify', '--strict', ptyNodePath], { stdio: 'pipe' }],
      ]);
    },
  );

  it('throws when signing fails in release mode', () => {
    const targetArchitecture = 'arm64';
    const nodePtyRoot = createNodePtyPrebuild(targetArchitecture);
    const execFileSync = vi.fn<typeof systemExecFileSync>(() => {
      throw new Error('injected signing failure');
    });

    expect(() =>
      repairNodePtyBinaries({
        nodePtyRoot,
        targetArchitecture,
        releaseMode: true,
        execFileSync,
      }),
    ).toThrow(/injected signing failure/);
  });

  it('throws when permission repair fails in release mode', () => {
    const targetArchitecture = 'arm64';
    const nodePtyRoot = createNodePtyPrebuild(targetArchitecture);

    expect(() =>
      repairNodePtyBinaries({
        nodePtyRoot,
        targetArchitecture,
        releaseMode: true,
        execFileSync: vi.fn<typeof systemExecFileSync>(),
        chmodSync: () => {
          throw new Error('injected chmod failure');
        },
      }),
    ).toThrow(/injected chmod failure/);
  });

  it('throws when a required release file is missing', () => {
    const targetArchitecture = 'arm64';
    const nodePtyRoot = createNodePtyPrebuild(targetArchitecture);
    unlinkSync(join(nodePtyRoot, 'prebuilds', 'darwin-arm64', 'pty.node'));

    expect(() =>
      repairNodePtyBinaries({
        nodePtyRoot,
        targetArchitecture,
        releaseMode: true,
        execFileSync: vi.fn<typeof systemExecFileSync>(),
      }),
    ).toThrow(/Required native file is missing/);
  });

  it('throws when release verification finds a non-executable helper', () => {
    const targetArchitecture = 'arm64';
    const nodePtyRoot = createNodePtyPrebuild(targetArchitecture);

    expect(() =>
      verifyNodePtyBinaries({
        nodePtyRoot,
        targetArchitecture,
        releaseMode: true,
        execFileSync: vi.fn<typeof systemExecFileSync>(),
      }),
    ).toThrow(/mode 644 instead of required mode 755/);
  });

  it('throws when a repaired release signature does not verify', () => {
    const targetArchitecture = 'arm64';
    const nodePtyRoot = createNodePtyPrebuild(targetArchitecture);
    let commandCount = 0;
    const execFileSync = vi.fn<typeof systemExecFileSync>(() => {
      commandCount += 1;
      if (commandCount === 3) {
        throw new Error('injected verification failure');
      }
      return undefined as never;
    });

    expect(() =>
      repairNodePtyBinaries({
        nodePtyRoot,
        targetArchitecture,
        releaseMode: true,
        execFileSync,
      }),
    ).toThrow(/injected verification failure/);
  });
});

// @vitest-environment node

import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { exercisePackagedProcessTree, packagePaths, runPackageProbe, terminateWindowsProcessTree } =
  require('../../scripts/verify-windows-package.cjs') as {
    exercisePackagedProcessTree(
      controller: Record<string, unknown>,
      command: string,
    ): Promise<void>;
    packagePaths(rootDirectory: string): Record<string, string>;
    runPackageProbe(rootDirectory?: string): Promise<void>;
    terminateWindowsProcessTree(child: { kill(signal: string): boolean }): boolean;
  };

describe('packaged Windows process-owner probe', () => {
  it('resolves the executable, physical helper, ASAR, and controller paths', () => {
    const rootDirectory = process.cwd();
    const resources = path.join(rootDirectory, 'release', 'win-unpacked', 'resources');

    expect(packagePaths(rootDirectory)).toEqual({
      asar: path.join(resources, 'app.asar'),
      executable: path.join(rootDirectory, 'release', 'win-unpacked', 'AudioBash.exe'),
      helper: path.join(resources, 'windowsJobOwner.ps1'),
      processTree: path.join(resources, 'app.asar', 'electron', 'processTree.cjs'),
    });
  });

  it.runIf(process.platform !== 'win32')('rejects execution outside Windows', async () => {
    await expect(runPackageProbe()).rejects.toThrow(
      'The packaged Windows process-owner probe requires Windows',
    );
  });

  it('stops the owned launcher when the packaged target result fails', async () => {
    const owned = {
      child: {
        stdout: { destroy: vi.fn(), resume: vi.fn() },
        stderr: { destroy: vi.fn(), resume: vi.fn() },
      },
      closeTracker: {
        claimStreamErrors: vi.fn(() => ({})),
        closePromise: Promise.resolve({ code: 7, processError: undefined, signal: null }),
        exitPromise: Promise.resolve({ code: 7, signal: null }),
      },
    };
    const controller = {
      spawn: vi.fn(async () => owned),
      stop: vi.fn(async () => ({ forced: false })),
    };

    await expect(
      exercisePackagedProcessTree(controller, 'C:\\Windows\\System32\\cmd.exe'),
    ).rejects.toThrow('Packaged Windows target failed with code 7');
    expect(controller.stop).toHaveBeenCalledWith(owned);
  });

  it('terminates the exact outer probe handle', () => {
    const child = { kill: vi.fn(() => true) };

    expect(terminateWindowsProcessTree(child)).toBe(true);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });
});

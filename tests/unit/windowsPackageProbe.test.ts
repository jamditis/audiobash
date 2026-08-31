// @vitest-environment node

import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  exercisePackagedProcessTree,
  exercisePackagedPty,
  exitPackagedProbe,
  packagePaths,
  runPackageProbe,
  terminateWindowsProcessTree,
} = require('../../scripts/verify-windows-package.cjs') as {
  exercisePackagedProcessTree(controller: Record<string, unknown>, command: string): Promise<void>;
  exercisePackagedPty(
    pty: Record<string, unknown>,
    shell: string,
    timeoutMs?: number,
  ): Promise<void>;
  exitPackagedProbe(
    output: { write(message: string, callback: () => void): boolean },
    exit: (code: number) => void,
  ): void;
  packagePaths(rootDirectory: string, applicationDirectory?: string): Record<string, string>;
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
      ptyModule: path.join(resources, 'app.asar.unpacked', 'node_modules', 'node-pty'),
      ptyPackage: path.join(
        resources,
        'app.asar.unpacked',
        'node_modules',
        'node-pty',
        'package.json',
      ),
    });
  });

  it('resolves an installed AppX application root without changing direct-package paths', () => {
    const installedRoot = path.join('C:\\Program Files\\WindowsApps', 'AudioBash', 'app');
    const resources = path.join(installedRoot, 'resources');

    expect(packagePaths(process.cwd(), installedRoot)).toEqual(
      expect.objectContaining({
        executable: path.join(installedRoot, 'AudioBash.exe'),
        helper: path.join(resources, 'windowsJobOwner.ps1'),
      }),
    );
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

  it('flushes the success marker before exiting the packaged probe', () => {
    let flush = () => {};
    const output = {
      write: vi.fn((_message: string, callback: () => void) => {
        flush = callback;
        return true;
      }),
    };
    const exit = vi.fn();

    exitPackagedProbe(output, exit);

    expect(output.write).toHaveBeenCalledWith(
      'AUDIOBASH_PACKAGED_WINDOWS_PROCESS_TREE_OK\n',
      expect.any(Function),
    );
    expect(exit).not.toHaveBeenCalled();

    flush();

    expect(exit).toHaveBeenCalledWith(0);
  });

  it('exercises packaged PowerShell input, output, resize, and exit', async () => {
    let dataHandler: (data: string) => void = () => {};
    let exitHandler: (event: { exitCode: number; signal?: number }) => void = () => {};
    const terminal = {
      kill: vi.fn(),
      onData: vi.fn((handler) => {
        dataHandler = handler;
      }),
      onExit: vi.fn((handler) => {
        exitHandler = handler;
      }),
      resize: vi.fn(),
      write: vi.fn((value: string) => {
        if (value.includes('Write-Output')) {
          queueMicrotask(() => dataHandler('AUDIOBASH_PACKAGED_WINDOWS_PTY_OK'));
        }
        if (value.includes('exit')) queueMicrotask(() => exitHandler({ exitCode: 0 }));
      }),
    };
    const pty = { spawn: vi.fn(() => terminal) };

    await expect(
      exercisePackagedPty(pty, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'),
    ).resolves.toBeUndefined();
    expect(terminal.write.mock.calls[0][0]).not.toContain('AUDIOBASH_PACKAGED_WINDOWS_PTY_OK');
    expect(terminal.resize).toHaveBeenCalledWith(100, 40);
    expect(terminal.kill).not.toHaveBeenCalled();
  });
});

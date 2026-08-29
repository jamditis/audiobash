// @vitest-environment node

import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createProcessTreeController } = require('../../electron/processTree.cjs') as {
  createProcessTreeController(): {
    spawn(
      command: string,
      args: string[],
      options?: Record<string, unknown>,
    ): Promise<OwnedProcess>;
    stop(process: OwnedProcess): Promise<unknown>;
  };
};

interface OwnedProcess {
  child: import('node:child_process').ChildProcess;
  closeTracker: {
    closePromise: Promise<{ code: number | null; processError?: Error }>;
    exitPromise: Promise<{ code: number | null }>;
  };
}

const fixture = join(__dirname, '../fixtures/processTreeParent.cjs');
const cleanupPids = new Set<number>();
const cleanupDirectories = new Set<string>();
const cleanupOwned = new Map<OwnedProcess, ReturnType<typeof createProcessTreeController>>();

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

afterEach(async () => {
  for (const [owned, controller] of cleanupOwned) {
    try {
      await controller.stop(owned);
    } catch {
      owned.child.kill('SIGKILL');
    }
  }
  cleanupOwned.clear();
  for (const pid of cleanupPids) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // The test process already stopped.
    }
  }
  cleanupPids.clear();
  for (const directory of cleanupDirectories) {
    rmSync(directory, { force: true, recursive: true });
  }
  cleanupDirectories.clear();
});

describe.runIf(process.platform === 'win32')('Windows Job Object integration', () => {
  it('rejects a missing bare executable before target creation', async () => {
    const controller = createProcessTreeController();

    await expect(
      controller.spawn('audiobash-command-that-does-not-exist', []),
    ).rejects.toMatchObject({
      code: 'PROCESS_LAUNCHER_START_FAILED',
      cause: expect.objectContaining({
        code: 'PROCESS_LAUNCHER_TARGET_START_FAILED',
        message: expect.stringContaining('audiobash-command-that-does-not-exist'),
      }),
    });
  });

  it('preserves arguments through the native CreateProcess path', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'audiobash-windows-arguments-'));
    cleanupDirectories.add(directory);
    const argumentsPath = join(directory, 'arguments.json');
    const argumentsFixture = join(__dirname, '../fixtures/processTreeArguments.cjs');
    const expectedArguments = [
      '',
      'two words',
      'café-雪',
      'embedded"quote',
      'trailing\\',
      'two-trailing\\\\',
      '&|<>%! literal',
      'line one\nline two',
    ];
    const controller = createProcessTreeController();
    const owned = await controller.spawn(
      process.execPath,
      [argumentsFixture, ...expectedArguments],
      {
        env: { ...process.env, AUDIOBASH_ARGUMENTS_PATH: argumentsPath },
      },
    );
    cleanupOwned.set(owned, controller);

    await expect(owned.closeTracker.exitPromise).resolves.toMatchObject({ code: 0 });
    await controller.stop(owned);
    cleanupOwned.delete(owned);
    expect(JSON.parse(readFileSync(argumentsPath, 'utf8'))).toEqual(expectedArguments);
  });

  it('resolves a bare executable from a Unicode PATH entry', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'audiobash-windows-path-雪-'));
    cleanupDirectories.add(directory);
    const executableName = 'audiobash-node-雪.exe';
    copyFileSync(process.execPath, join(directory, executableName));
    const argumentsPath = join(directory, 'arguments.json');
    const argumentsFixture = join(__dirname, '../fixtures/processTreeArguments.cjs');
    const controller = createProcessTreeController();
    const owned = await controller.spawn('audiobash-node-雪', [argumentsFixture, 'path-ok'], {
      env: {
        ...process.env,
        AUDIOBASH_ARGUMENTS_PATH: argumentsPath,
        PATH: `${directory};${process.env.PATH || ''}`,
        PATHEXT: '.EXE',
      },
    });
    cleanupOwned.set(owned, controller);

    await expect(owned.closeTracker.exitPromise).resolves.toMatchObject({ code: 0 });
    await controller.stop(owned);
    cleanupOwned.delete(owned);
    expect(JSON.parse(readFileSync(argumentsPath, 'utf8'))).toEqual(['path-ok']);
  });

  it.each([0, 7])('reaps a detached descendant after target exit code %i', async (exitCode) => {
    const directory = mkdtempSync(join(tmpdir(), 'audiobash-windows-job-'));
    cleanupDirectories.add(directory);
    const idsPath = join(directory, 'process-ids.json');
    const controller = createProcessTreeController();
    const owned = await controller.spawn(process.execPath, [fixture], {
      env: {
        ...process.env,
        AUDIOBASH_EXIT_AFTER_SPAWN: '1',
        AUDIOBASH_EXIT_CODE: String(exitCode),
        AUDIOBASH_CHILD_DETACHED: '1',
        AUDIOBASH_PROCESS_IDS_PATH: idsPath,
      },
    });
    cleanupOwned.set(owned, controller);

    await expect
      .poll(
        () => {
          if (!existsSync(idsPath)) return undefined;
          try {
            return JSON.parse(readFileSync(idsPath, 'utf8'));
          } catch {
            return undefined;
          }
        },
        { timeout: 10_000, interval: 50 },
      )
      .toEqual(expect.objectContaining({ childPid: expect.any(Number) }));
    const { childPid } = JSON.parse(readFileSync(idsPath, 'utf8'));
    cleanupPids.add(childPid);
    expect(isRunning(childPid)).toBe(true);

    await expect(owned.closeTracker.exitPromise).resolves.toMatchObject({ code: exitCode });
    await controller.stop(owned);
    cleanupOwned.delete(owned);
    await expect.poll(() => isRunning(childPid), { timeout: 5000, interval: 50 }).toBe(false);
    cleanupPids.delete(childPid);
    await expect(owned.closeTracker.closePromise).resolves.toMatchObject({ code: exitCode });
  });

  it('closes the Job and reaps its members when the Node launcher exits', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'audiobash-windows-launcher-loss-'));
    cleanupDirectories.add(directory);
    const idsPath = join(directory, 'process-ids.json');
    const controller = createProcessTreeController();
    const owned = await controller.spawn(process.execPath, [fixture], {
      env: {
        ...process.env,
        AUDIOBASH_CHILD_DETACHED: '1',
        AUDIOBASH_PROCESS_IDS_PATH: idsPath,
      },
    });
    cleanupOwned.set(owned, controller);

    await expect.poll(() => existsSync(idsPath), { timeout: 10_000, interval: 50 }).toBe(true);
    const { childPid, parentPid } = JSON.parse(readFileSync(idsPath, 'utf8'));
    cleanupPids.add(parentPid);
    cleanupPids.add(childPid);

    owned.child.kill();
    await expect(owned.closeTracker.closePromise).resolves.toMatchObject({
      processError: expect.objectContaining({ code: 'PROCESS_LAUNCHER_STATUS_INVALID' }),
    });
    cleanupOwned.delete(owned);
    await expect.poll(() => isRunning(parentPid), { timeout: 5000, interval: 50 }).toBe(false);
    await expect.poll(() => isRunning(childPid), { timeout: 5000, interval: 50 }).toBe(false);
    cleanupPids.delete(parentPid);
    cleanupPids.delete(childPid);
  });

  it('closes the Job when Electron loses its launcher status channel', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'audiobash-windows-parent-loss-'));
    cleanupDirectories.add(directory);
    const idsPath = join(directory, 'process-ids.json');
    const controller = createProcessTreeController();
    const owned = await controller.spawn(process.execPath, [fixture], {
      env: {
        ...process.env,
        AUDIOBASH_CHILD_DETACHED: '1',
        AUDIOBASH_PROCESS_IDS_PATH: idsPath,
      },
    });
    cleanupOwned.set(owned, controller);

    await expect.poll(() => existsSync(idsPath), { timeout: 10_000, interval: 50 }).toBe(true);
    const { childPid, parentPid } = JSON.parse(readFileSync(idsPath, 'utf8'));
    cleanupPids.add(parentPid);
    cleanupPids.add(childPid);

    owned.child.stdio[4]?.destroy();
    await expect(owned.closeTracker.closePromise).resolves.toMatchObject({
      processError: expect.objectContaining({ code: 'PROCESS_LAUNCHER_STATUS_INVALID' }),
    });
    cleanupOwned.delete(owned);
    await expect.poll(() => isRunning(parentPid), { timeout: 5000, interval: 50 }).toBe(false);
    await expect.poll(() => isRunning(childPid), { timeout: 5000, interval: 50 }).toBe(false);
    cleanupPids.delete(parentPid);
    cleanupPids.delete(childPid);
  });
});

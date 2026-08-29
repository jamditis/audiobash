// @vitest-environment node

import { spawn as spawnChild } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeChildProcess } from '../helpers/fakeChildProcess';

const require = createRequire(import.meta.url);
const { createProcessTreeController } = require('../../electron/processTree.cjs') as {
  createProcessTreeController(options: Record<string, unknown>): {
    spawn(
      command: string,
      args: string[],
      options?: Record<string, unknown>,
    ): Promise<OwnedProcess>;
    stop(process: OwnedProcess): Promise<{ forced: boolean }>;
  };
};

interface OwnedProcess {
  child: FakeChildProcess;
  closeTracker: {
    readonly closePromise: Promise<unknown>;
    readonly closed: boolean;
    readonly exitPromise?: Promise<unknown>;
  };
  groupId?: number;
}

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

function createPosixHarness() {
  const child = new FakeChildProcess(4101);
  const spawn = vi.fn(() => child);
  const kill = vi.fn();
  const getProcessGroupId = vi.fn(async (pid: number) => (pid === child.pid ? child.pid : 77));
  const isProcessGroupRunning = vi.fn(async () => !child.closed);
  const controller = createProcessTreeController({
    platform: 'darwin',
    parentPid: 900,
    spawn,
    kill,
    getProcessGroupId,
    isProcessGroupRunning,
    gracefulTimeoutMs: 3000,
    forceTimeoutMs: 2000,
  });
  return { child, controller, getProcessGroupId, kill, spawn };
}

describe('process-tree ownership', () => {
  it('spawns a POSIX child in a proved process group before group termination is allowed', async () => {
    const { child, controller, getProcessGroupId, kill, spawn } = createPosixHarness();
    const owned = await controller.spawn('ffmpeg', ['-version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringContaining('processTreeLauncher.cjs'), 'ffmpeg', '-version'],
      expect.objectContaining({
        detached: true,
        env: expect.objectContaining({ ELECTRON_RUN_AS_NODE: '1' }),
        stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'],
      }),
    );
    expect(getProcessGroupId).toHaveBeenCalledWith(child.pid, 1000);
    expect(getProcessGroupId).toHaveBeenCalledWith(900, 1000);
    expect(owned.groupId).toBe(child.pid);

    const stopping = controller.stop(owned);
    expect(kill).toHaveBeenCalledWith(-child.pid, 'SIGTERM');
    child.finish(0, 'SIGTERM');
    await expect(stopping).resolves.toEqual(expect.objectContaining({ forced: false }));
    expect(kill).not.toHaveBeenCalledWith(-child.pid, 'SIGKILL');
  });

  it('refuses a negative-PID signal when the child group is not isolated', async () => {
    const { child, getProcessGroupId, kill, spawn } = createPosixHarness();
    getProcessGroupId.mockResolvedValue(77);
    const controller = createProcessTreeController({
      platform: 'darwin',
      parentPid: 900,
      spawn,
      kill,
      getProcessGroupId,
      listDescendantPids: vi.fn(async () => []),
    });

    await expect(controller.spawn('ffmpeg', [])).rejects.toMatchObject({
      code: 'PROCESS_GROUP_NOT_ISOLATED',
    });
    expect(kill).not.toHaveBeenCalledWith(expect.any(Number), expect.any(String));
    child.finish(1);
  });

  it('escalates from SIGTERM at three seconds and waits for close after SIGKILL', async () => {
    vi.useFakeTimers();
    const { child, controller, kill } = createPosixHarness();
    const owned = await controller.spawn('whisper', []);

    const stopping = controller.stop(owned);
    await vi.advanceTimersByTimeAsync(2999);
    expect(kill).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(kill).toHaveBeenNthCalledWith(2, -child.pid, 'SIGKILL');

    let settled = false;
    void stopping.finally(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    child.finish(null, 'SIGKILL');
    await expect(stopping).resolves.toEqual(expect.objectContaining({ forced: true }));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('coalesces two stop calls into one signal sequence', async () => {
    const { child, controller, kill } = createPosixHarness();
    const owned = await controller.spawn('whisper', []);

    const first = controller.stop(owned);
    const second = controller.stop(owned);
    expect(second).toBe(first);
    expect(kill).toHaveBeenCalledTimes(1);

    child.finish(0, 'SIGTERM');
    await first;
  });

  it('does not treat a closed parent as clean while its process group remains', async () => {
    vi.useFakeTimers();
    const child = new FakeChildProcess(4201);
    let groupRunning = true;
    const kill = vi.fn((_child: FakeChildProcess, signal: string | number) => {
      if (signal === 'SIGKILL') groupRunning = false;
    });
    const controller = createProcessTreeController({
      platform: 'darwin',
      parentPid: 900,
      spawn: vi.fn(() => child),
      kill,
      getProcessGroupId: vi.fn(async (pid: number) => (pid === child.pid ? child.pid : 77)),
      isProcessGroupRunning: vi.fn(async () => groupRunning),
      gracefulTimeoutMs: 3000,
      forceTimeoutMs: 2000,
    });
    const owned = await controller.spawn('whisper', []);
    child.finish(0);

    const stopping = controller.stop(owned);
    await vi.advanceTimersByTimeAsync(3000);
    expect(kill).toHaveBeenNthCalledWith(1, -child.pid, 'SIGTERM');
    expect(kill).toHaveBeenNthCalledWith(2, -child.pid, 'SIGKILL');
    await expect(stopping).resolves.toEqual({ forced: true });
  });

  it('uses the persistent launcher handle as the Windows tree root', async () => {
    const child = new FakeChildProcess(5101);
    const spawn = vi.fn(() => child);
    const signalWindowsLauncher = vi.fn(async () => child.finish(null, 'SIGKILL'));
    const kill = vi.fn();
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn,
      kill,
      signalWindowsLauncher,
      gracefulTimeoutMs: 3000,
      forceTimeoutMs: 2000,
    });
    const owned = await controller.spawn('ffmpeg.exe', []);

    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringContaining('processTreeLauncher.cjs'), 'ffmpeg.exe'],
      expect.objectContaining({
        detached: false,
        env: expect.objectContaining({
          AUDIOBASH_LAUNCHER_HOLD: '1',
          ELECTRON_RUN_AS_NODE: '1',
        }),
        stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'],
        windowsHide: true,
      }),
    );
    await expect(controller.stop(owned)).resolves.toEqual({ forced: true });
    expect(signalWindowsLauncher).toHaveBeenCalledOnce();
    expect(signalWindowsLauncher).toHaveBeenCalledWith(child, true, 5000);
    expect(kill).not.toHaveBeenCalled();
  });

  it('force-terminates the exact Windows launcher handle once', async () => {
    const child = new FakeChildProcess(5105);
    const killLauncher = vi.spyOn(child, 'kill');
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn: vi.fn(() => child),
      gracefulTimeoutMs: 100,
      forceTimeoutMs: 50,
    });
    const owned = await controller.spawn('ffmpeg.exe', []);

    await expect(controller.stop(owned)).resolves.toEqual({ forced: true });

    expect(killLauncher).toHaveBeenCalledOnce();
    expect(killLauncher).toHaveBeenCalledWith('SIGKILL');
  });

  it('reports forced cleanup when the Windows launcher signal succeeds', async () => {
    const child = new FakeChildProcess(5102);
    const signalWindowsLauncher = vi.fn(async () => child.finish(null, 'SIGKILL'));
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn: vi.fn(() => child),
      signalWindowsLauncher,
    });
    const owned = await controller.spawn('ffmpeg.exe', []);

    await expect(controller.stop(owned)).resolves.toEqual({ forced: true });
    expect(signalWindowsLauncher).toHaveBeenCalledOnce();
    expect(signalWindowsLauncher).toHaveBeenCalledWith(child, true, 5000);
  });

  it('does not report a forced stop when an unsignalable handle closes naturally', async () => {
    vi.useFakeTimers();
    const child = new FakeChildProcess(5104);
    const signalWindowsLauncher = vi.fn(async () => {
      setTimeout(() => child.finish(0), 25);
      throw Object.assign(new Error('The process was not found'), { code: 128 });
    });
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn: vi.fn(() => child),
      signalWindowsLauncher,
      gracefulTimeoutMs: 100,
      forceTimeoutMs: 50,
    });
    const owned = await controller.spawn('ffmpeg.exe', []);

    const stopping = controller.stop(owned);
    await vi.advanceTimersByTimeAsync(25);
    await expect(stopping).resolves.toEqual({ forced: false });
    expect(signalWindowsLauncher).toHaveBeenCalledOnce();
    expect(signalWindowsLauncher).toHaveBeenCalledWith(child, true, 150);
  });

  it('removes the internal Windows hold flag from a POSIX launcher environment', async () => {
    const { child, controller, spawn } = createPosixHarness();
    const owned = await controller.spawn('ffmpeg', [], {
      env: { AUDIOBASH_LAUNCHER_HOLD: '1', PATH: process.env.PATH },
    });

    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringContaining('processTreeLauncher.cjs'), 'ffmpeg'],
      expect.objectContaining({
        env: expect.not.objectContaining({ AUDIOBASH_LAUNCHER_HOLD: expect.anything() }),
      }),
    );

    const stopping = controller.stop(owned);
    child.finish(0, 'SIGTERM');
    await stopping;
  });

  it('allows the full bounded Windows owner startup sequence to finish', async () => {
    vi.useFakeTimers();
    const child = new FakeChildProcess(5103, { reportOwner: false });
    const signalWindowsLauncher = vi.fn(async () => child.finish(0));
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn: vi.fn(() => child),
      signalWindowsLauncher,
      helperTimeoutMs: 5000,
    });

    const spawning = controller.spawn('ffmpeg.exe', []);
    await vi.advanceTimersByTimeAsync(15_000);
    child.reportOwner();
    const owned = await spawning;

    await controller.stop(owned);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('publishes the owned Windows launcher before its start gate settles', async () => {
    const child = new FakeChildProcess(5105);
    const start = Promise.withResolvers<void>();
    const spawn = vi.fn(() => child);
    const onOwned = vi.fn();
    const signalWindowsLauncher = vi.fn(async () => child.finish(0));
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn,
      signalWindowsLauncher,
      startLauncher: vi.fn(() => start.promise),
    });

    const spawning = controller.spawn('ffmpeg.exe', [], { onOwned });
    await vi.waitFor(() => expect(onOwned).toHaveBeenCalledOnce());
    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.not.objectContaining({ onOwned: expect.anything() }),
    );

    start.resolve();
    const owned = await spawning;
    await controller.stop(owned);
  });

  it.each([
    ['clean', 0],
    ['nonzero', 7],
  ])('reaps the persistent Windows tree after a %s target exit', async (_label, code) => {
    const child = new FakeChildProcess(5151);
    const signalWindowsLauncher = vi.fn(async () => {
      child.finish(0);
    });
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn: vi.fn(() => child),
      signalWindowsLauncher,
    });
    const owned = await controller.spawn('whisper.exe', []);

    child.finishTarget(code);
    await owned.closeTracker.exitPromise;
    await expect(controller.stop(owned)).resolves.toEqual({ forced: true });
    expect(signalWindowsLauncher).toHaveBeenCalledOnce();
    const timeoutMs = signalWindowsLauncher.mock.calls[0][2];
    expect(timeoutMs).toBeGreaterThan(0);
    expect(timeoutMs).toBeLessThanOrEqual(5000);
    await expect(owned.closeTracker.closePromise).resolves.toMatchObject({ code });
  });

  it('never signals a reported Windows Job owner PID after the launcher closes', async () => {
    const child = new FakeChildProcess(5161);
    const signalWindowsLauncher = vi.fn(async (launcher: FakeChildProcess) => {
      if (launcher === child) throw Object.assign(new Error('missing'), { code: 128 });
    });
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn: vi.fn(() => child),
      signalWindowsLauncher,
    });
    const owned = await controller.spawn('whisper.exe', []);

    child.finish(124);
    await expect(controller.stop(owned)).resolves.toEqual({ forced: false });
    expect(signalWindowsLauncher).not.toHaveBeenCalledWith(
      6161,
      expect.any(Boolean),
      expect.any(Number),
    );
  });

  it('does not force after the launcher handle reports the process missing', async () => {
    vi.useFakeTimers();
    const child = new FakeChildProcess(5160);
    const signalWindowsLauncher = vi.fn(async () => {
      throw Object.assign(new Error('The process was not found'), { code: 128 });
    });
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn: vi.fn(() => child),
      signalWindowsLauncher,
      gracefulTimeoutMs: 100,
      forceTimeoutMs: 50,
    });
    const owned = await controller.spawn('whisper.exe', []);

    const stopping = controller.stop(owned);
    const rejection = expect(stopping).rejects.toMatchObject({
      code: 'PROCESS_TREE_CLEANUP_TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(150);
    await rejection;
    expect(signalWindowsLauncher).toHaveBeenCalledOnce();
    expect(signalWindowsLauncher).toHaveBeenCalledWith(child, true, 150);

    child.finish(124);
  });

  it('does not signal a Windows handle after the launcher has exited', async () => {
    vi.useFakeTimers();
    const child = new FakeChildProcess(5158);
    const signalWindowsLauncher = vi.fn();
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn: vi.fn(() => child),
      signalWindowsLauncher,
      gracefulTimeoutMs: 100,
      forceTimeoutMs: 50,
    });
    const owned = await controller.spawn('whisper.exe', []);
    child.exitCode = 124;
    child.emit('exit', 124, null);

    const stopping = controller.stop(owned);
    const rejection = expect(stopping).rejects.toMatchObject({
      code: 'PROCESS_TREE_CLEANUP_TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(150);
    await rejection;
    expect(signalWindowsLauncher).not.toHaveBeenCalled();

    child.finish(124);
  });

  it('does not signal the Windows handle again after it exits during cleanup', async () => {
    vi.useFakeTimers();
    const child = new FakeChildProcess(5159);
    const signalWindowsLauncher = vi.fn(async () => {
      child.exitCode = 124;
      child.emit('exit', 124, null);
    });
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn: vi.fn(() => child),
      signalWindowsLauncher,
      gracefulTimeoutMs: 100,
      forceTimeoutMs: 50,
    });
    const owned = await controller.spawn('whisper.exe', []);

    const stopping = controller.stop(owned);
    const rejection = expect(stopping).rejects.toMatchObject({
      code: 'PROCESS_TREE_CLEANUP_TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(150);
    await rejection;
    expect(signalWindowsLauncher).toHaveBeenCalledOnce();
    expect(signalWindowsLauncher).toHaveBeenCalledWith(child, true, 150);

    child.finish(124);
  });

  it('does not return a Windows owner until the Job owner PID is reported', async () => {
    vi.useFakeTimers();
    const child = new FakeChildProcess(5162, { reportOwner: false });
    const signalWindowsLauncher = vi.fn(async () => child.finish(0));
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn: vi.fn(() => child),
      signalWindowsLauncher,
      helperTimeoutMs: 100,
      windowsOwnerTimeoutMs: 100,
    });

    const spawning = controller.spawn('whisper.exe', []);
    const rejection = expect(spawning).rejects.toMatchObject({
      code: 'PROCESS_LAUNCHER_START_FAILED',
      cause: expect.objectContaining({ code: 'PROCESS_LAUNCHER_OWNER_TIMEOUT' }),
    });
    await vi.advanceTimersByTimeAsync(200);
    await rejection;
    expect(signalWindowsLauncher).toHaveBeenCalledWith(child, true, 5000);
  });

  it('rejects a Windows target result that arrives before ownership proof', async () => {
    const child = new FakeChildProcess(5163, { reportOwner: false });
    const signalWindowsLauncher = vi.fn(async () => child.finish(0));
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn: vi.fn(() => child),
      signalWindowsLauncher,
    });

    child.finishTarget(0);
    await expect(controller.spawn('whisper.exe', [])).rejects.toMatchObject({
      code: 'PROCESS_LAUNCHER_START_FAILED',
      cause: expect.objectContaining({ code: 'PROCESS_LAUNCHER_STATUS_INVALID' }),
    });
  });

  it('rejects a duplicate Windows ownership frame', async () => {
    const child = new FakeChildProcess(5164);
    const signalWindowsLauncher = vi.fn(async () => child.finish(0));
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn: vi.fn(() => child),
      signalWindowsLauncher,
    });
    const owned = await controller.spawn('whisper.exe', []);

    child.reportOwner();
    await owned.closeTracker.exitPromise;
    await controller.stop(owned);
    await expect(owned.closeTracker.closePromise).resolves.toMatchObject({
      processError: expect.objectContaining({ code: 'PROCESS_LAUNCHER_STATUS_INVALID' }),
    });
  });

  it('rejects extra fields in a Windows ownership frame', async () => {
    const child = new FakeChildProcess(5165, { reportOwner: false });
    const signalWindowsLauncher = vi.fn(async () => child.finish(0));
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn: vi.fn(() => child),
      signalWindowsLauncher,
    });

    child.targetStatus.write(
      `${JSON.stringify({ type: 'owner-ready', ownerPid: 6165, trusted: true })}\n`,
    );
    await expect(controller.spawn('whisper.exe', [])).rejects.toMatchObject({
      cause: expect.objectContaining({ code: 'PROCESS_LAUNCHER_STATUS_INVALID' }),
    });
  });

  it('rejects data after the terminal Windows target result', async () => {
    const child = new FakeChildProcess(5166);
    const signalWindowsLauncher = vi.fn(async () => child.finish(0));
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn: vi.fn(() => child),
      signalWindowsLauncher,
    });
    const owned = await controller.spawn('whisper.exe', []);

    child.targetStatus.write(
      `${JSON.stringify({ type: 'target-result', code: 0, signal: null })}\n`,
    );
    child.targetStatus.end(`${JSON.stringify({ type: 'target-result', code: 0, signal: null })}\n`);
    await owned.closeTracker.exitPromise;
    await controller.stop(owned);
    await expect(owned.closeTracker.closePromise).resolves.toMatchObject({
      processError: expect.objectContaining({ code: 'PROCESS_LAUNCHER_STATUS_INVALID' }),
    });
  });

  it('rejects an oversized Windows status frame', async () => {
    const child = new FakeChildProcess(5167, { reportOwner: false });
    const signalWindowsLauncher = vi.fn(async () => child.finish(0));
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn: vi.fn(() => child),
      signalWindowsLauncher,
    });

    child.targetStatus.write('x'.repeat(1025));
    await expect(controller.spawn('whisper.exe', [])).rejects.toMatchObject({
      cause: expect.objectContaining({ code: 'PROCESS_LAUNCHER_STATUS_INVALID' }),
    });
  });

  it('accepts a large batch of complete Windows parent-lease heartbeats', async () => {
    const child = new FakeChildProcess(5169, { reportOwner: false });
    const signalWindowsLauncher = vi.fn(async () => child.finish(0));
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn: vi.fn(() => child),
      signalWindowsLauncher,
    });
    const ownerPid = child.pid + 1000;

    child.targetStatus.write(
      `${'\n'.repeat(1025)}${JSON.stringify({ type: 'owner-ready', ownerPid })}\n`,
    );

    const owned = await controller.spawn('whisper.exe', []);
    expect(owned.closeTracker.windowsOwnerPid).toBe(ownerPid);
    await controller.stop(owned);
  });

  it('rejects an oversized whitespace-padded Windows status frame', async () => {
    const child = new FakeChildProcess(5170, { reportOwner: false });
    const signalWindowsLauncher = vi.fn(async () => child.finish(0));
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn: vi.fn(() => child),
      signalWindowsLauncher,
    });

    child.targetStatus.write(
      `${' '.repeat(1025)}\n${JSON.stringify({
        type: 'owner-ready',
        ownerPid: child.pid + 1000,
      })}\n`,
    );

    await expect(controller.spawn('whisper.exe', [])).rejects.toMatchObject({
      cause: expect.objectContaining({ code: 'PROCESS_LAUNCHER_STATUS_INVALID' }),
    });
  });

  it('preserves the bounded Windows startup diagnostic', async () => {
    const child = new FakeChildProcess(5168, { reportOwner: false });
    const signalWindowsLauncher = vi.fn(async () => child.finish(125));
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn: vi.fn(() => child),
      signalWindowsLauncher,
    });

    child.targetStatus.end(
      `${JSON.stringify({ type: 'startup-error', message: 'CreateJobObject failed: access denied' })}\n`,
    );

    await expect(controller.spawn('whisper.exe', [])).rejects.toMatchObject({
      code: 'PROCESS_LAUNCHER_START_FAILED',
      message: expect.stringContaining('CreateJobObject failed: access denied'),
      cause: expect.objectContaining({
        code: 'PROCESS_LAUNCHER_TARGET_START_FAILED',
        message: expect.stringContaining('CreateJobObject failed: access denied'),
      }),
    });
  });

  it('preserves a bounded non-ASCII Windows startup diagnostic', async () => {
    const child = new FakeChildProcess(5171, { reportOwner: false });
    const signalWindowsLauncher = vi.fn(async () => child.finish(125));
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn: vi.fn(() => child),
      signalWindowsLauncher,
    });
    const message = '診断'.repeat(64);

    child.targetStatus.end(`${JSON.stringify({ type: 'startup-error', message })}\n`);

    await expect(controller.spawn('whisper.exe', [])).rejects.toMatchObject({
      cause: expect.objectContaining({
        code: 'PROCESS_LAUNCHER_TARGET_START_FAILED',
        message: expect.stringContaining(message),
      }),
    });
  });

  it('rejects a Windows startup diagnostic longer than 128 characters', async () => {
    const child = new FakeChildProcess(5173, { reportOwner: false });
    const signalWindowsLauncher = vi.fn(async () => child.finish(125));
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn: vi.fn(() => child),
      signalWindowsLauncher,
    });

    child.targetStatus.end(
      `${JSON.stringify({ type: 'startup-error', message: 'x'.repeat(129) })}\n`,
    );

    await expect(controller.spawn('whisper.exe', [])).rejects.toMatchObject({
      cause: expect.objectContaining({ code: 'PROCESS_LAUNCHER_STATUS_INVALID' }),
    });
  });

  it('reports cleanup failure when a proved launcher survives startup-gate failure', async () => {
    vi.useFakeTimers();
    const child = new FakeChildProcess(5181);
    const controller = createProcessTreeController({
      platform: 'darwin',
      parentPid: 900,
      spawn: vi.fn(() => child),
      kill: vi.fn(),
      getProcessGroupId: vi.fn(async (pid: number) => (pid === child.pid ? child.pid : 77)),
      isProcessGroupRunning: vi.fn(async () => true),
      startLauncher: vi.fn(async () => {
        throw new Error('gate rejected');
      }),
      helperTimeoutMs: 100,
      gracefulTimeoutMs: 100,
      forceTimeoutMs: 50,
    });

    const spawning = controller.spawn('whisper', []);
    const rejection = expect(spawning).rejects.toMatchObject({
      code: 'PROCESS_TREE_CLEANUP_TIMEOUT',
      cause: expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({ message: 'gate rejected' }),
          expect.objectContaining({ code: 'PROCESS_TREE_CLEANUP_TIMEOUT' }),
        ]),
      }),
    });
    await vi.advanceTimersByTimeAsync(150);
    await rejection;
    expect(child.stdio[3]?.destroyed).toBe(true);
    expect(child.stdout.destroyed).toBe(true);
    expect(child.stderr.destroyed).toBe(true);
  });

  it('retains a launcher-start rejection after its proved group stops', async () => {
    const child = new FakeChildProcess(5182);
    const kill = vi.fn((_child: FakeChildProcess, signal: NodeJS.Signals) =>
      child.finish(null, signal),
    );
    const controller = createProcessTreeController({
      platform: 'darwin',
      parentPid: 900,
      spawn: vi.fn(() => child),
      kill,
      getProcessGroupId: vi.fn(async (pid: number) => (pid === child.pid ? child.pid : 77)),
      isProcessGroupRunning: vi.fn(async () => !child.closed),
      startLauncher: vi.fn(async () => {
        throw new Error('gate rejected');
      }),
    });

    await expect(controller.spawn('whisper', [])).rejects.toMatchObject({
      code: 'PROCESS_LAUNCHER_START_FAILED',
      cause: expect.objectContaining({ message: 'gate rejected' }),
    });
    expect(kill).toHaveBeenCalledWith(-child.pid, 'SIGTERM');
    expect(child.stdio[3]?.destroyed).toBe(true);
  });

  it('closes and reaps a proved launcher after its start gate times out', async () => {
    vi.useFakeTimers();
    const child = new FakeChildProcess(5183);
    const kill = vi.fn((_child: FakeChildProcess, signal: NodeJS.Signals) =>
      child.finish(null, signal),
    );
    const controller = createProcessTreeController({
      platform: 'darwin',
      parentPid: 900,
      spawn: vi.fn(() => child),
      kill,
      getProcessGroupId: vi.fn(async (pid: number) => (pid === child.pid ? child.pid : 77)),
      isProcessGroupRunning: vi.fn(async () => !child.closed),
      startLauncher: vi.fn(() => new Promise(() => {})),
      helperTimeoutMs: 100,
    });

    const spawning = controller.spawn('whisper', []);
    const rejection = expect(spawning).rejects.toMatchObject({
      code: 'PROCESS_LAUNCHER_START_FAILED',
      cause: expect.objectContaining({ code: 'PROCESS_LAUNCHER_TIMEOUT' }),
    });
    await vi.advanceTimersByTimeAsync(100);
    await rejection;
    expect(kill).toHaveBeenCalledWith(-child.pid, 'SIGTERM');
    expect(child.stdio[3]?.destroyed).toBe(true);
  });

  it('does not hide a group-signal failure behind a launcher-start error', async () => {
    const child = new FakeChildProcess(5191);
    const signalError = Object.assign(new Error('denied'), { code: 'EACCES' });
    const controller = createProcessTreeController({
      platform: 'darwin',
      parentPid: 900,
      spawn: vi.fn(() => child),
      kill: vi.fn(() => {
        throw signalError;
      }),
      getProcessGroupId: vi.fn(async (pid: number) => (pid === child.pid ? child.pid : 77)),
      isProcessGroupRunning: vi.fn(async () => true),
      startLauncher: vi.fn(async () => {
        throw new Error('gate rejected');
      }),
    });

    await expect(controller.spawn('whisper', [])).rejects.toMatchObject({
      code: 'PROCESS_TREE_SIGNAL_FAILED',
    });
    expect(child.stdio[3]?.destroyed).toBe(true);
    expect(child.stdout.destroyed).toBe(true);
    expect(child.stderr.destroyed).toBe(true);
  });

  it('settles malformed Windows target status so cleanup can start', async () => {
    const child = new FakeChildProcess(5192);
    const signalWindowsLauncher = vi.fn(async () => child.finish(0));
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn: vi.fn(() => child),
      signalWindowsLauncher,
    });
    const owned = await controller.spawn('whisper.exe', []);

    child.targetStatus.end('{bad json}\n');
    await owned.closeTracker.exitPromise;
    await controller.stop(owned);
    await expect(owned.closeTracker.closePromise).resolves.toMatchObject({
      processError: expect.objectContaining({ code: 'PROCESS_LAUNCHER_STATUS_INVALID' }),
    });
  });

  it('settles an empty Windows target-status channel so cleanup can start', async () => {
    const child = new FakeChildProcess(5193);
    const signalWindowsLauncher = vi.fn(async () => child.finish(0));
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn: vi.fn(() => child),
      signalWindowsLauncher,
    });
    const owned = await controller.spawn('whisper.exe', []);
    let targetSettled = false;
    void owned.closeTracker.exitPromise?.then(() => {
      targetSettled = true;
    });

    child.targetStatus.end();
    await new Promise((resolve) => setImmediate(resolve));
    expect(targetSettled).toBe(true);

    await controller.stop(owned);
    await expect(owned.closeTracker.closePromise).resolves.toMatchObject({
      processError: expect.objectContaining({ code: 'PROCESS_LAUNCHER_STATUS_INVALID' }),
    });
  });

  it('settles a close-only Windows target-status channel so cleanup can start', async () => {
    const child = new FakeChildProcess(5194);
    const signalWindowsLauncher = vi.fn(async () => child.finish(0));
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn: vi.fn(() => child),
      signalWindowsLauncher,
    });
    const owned = await controller.spawn('whisper.exe', []);
    let targetSettled = false;
    void owned.closeTracker.exitPromise?.then(() => {
      targetSettled = true;
    });

    child.targetStatus.destroy();
    await new Promise((resolve) => setImmediate(resolve));
    expect(targetSettled).toBe(true);

    await controller.stop(owned);
    await expect(owned.closeTracker.closePromise).resolves.toMatchObject({
      processError: expect.objectContaining({ code: 'PROCESS_LAUNCHER_STATUS_INVALID' }),
    });
  });

  it('rejects a Windows launcher with no target-status channel before opening its gate', async () => {
    const child = new FakeChildProcess(5195);
    child.stdio[4] = null;
    const startLauncher = vi.fn(async () => undefined);
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn: vi.fn(() => child),
      startLauncher,
    });

    await expect(controller.spawn('whisper.exe', [])).rejects.toMatchObject({
      code: 'PROCESS_LAUNCHER_NO_STATUS',
    });
    expect(startLauncher).not.toHaveBeenCalled();
    expect(child.closed).toBe(true);
  });

  it('exits a held launcher when its parent status channel fails', async () => {
    const launcherPath = path.join(process.cwd(), 'electron/processTreeLauncher.cjs');
    const child = spawnChild(
      process.execPath,
      [launcherPath, process.execPath, '-e', 'setTimeout(() => {}, 20)'],
      {
        env: {
          ...process.env,
          AUDIOBASH_LAUNCHER_HOLD: '1',
          ELECTRON_RUN_AS_NODE: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'],
      },
    );
    child.stdout.resume();
    child.stderr.resume();
    child.stdio[4]?.destroy();
    child.stdio[3]?.end('start');
    const closed = new Promise<{ code: number | null }>((resolve) =>
      child.once('close', (code) => resolve({ code })),
    );
    let deadline: ReturnType<typeof setTimeout>;
    const result = await Promise.race([
      closed,
      new Promise<'timeout'>((resolve) => {
        deadline = setTimeout(() => resolve('timeout'), 2000);
      }),
    ]);
    clearTimeout(deadline!);
    if (result === 'timeout') {
      child.kill('SIGKILL');
      await closed;
    }

    expect(result).toEqual({ code: 124 });
  });

  it('accepts a launcher start token split across pipe writes', async () => {
    const launcherPath = path.join(process.cwd(), 'electron/processTreeLauncher.cjs');
    const child = spawnChild(
      process.execPath,
      [launcherPath, process.execPath, '-e', 'process.stdout.write("split-ok")'],
      { stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'] },
    );
    const output: Buffer[] = [];
    child.stdout.on('data', (chunk) => output.push(Buffer.from(chunk)));
    child.stderr.resume();
    child.stdio[4]?.resume();

    child.stdio[3]?.write('st');
    child.stdio[3]?.end('art');
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve) => child.once('close', (code, signal) => resolve({ code, signal })),
    );

    expect(result).toEqual({ code: 0, signal: null });
    expect(Buffer.concat(output).toString()).toBe('split-ok');
  });

  it.runIf(process.platform !== 'win32')(
    'contains a real missing target command inside the proved launcher',
    async () => {
      const controller = createProcessTreeController({
        platform: process.platform,
      });

      const owned = await controller.spawn('audiobash-command-that-does-not-exist', []);
      owned.child.stdout?.resume();
      owned.child.stderr?.resume();
      await expect(owned.closeTracker.closePromise).resolves.toMatchObject({ code: 127 });
      await expect(controller.stop(owned)).resolves.toEqual({ forced: false });
    },
  );

  it('uses the complete combined timeout for the Windows launcher signal', async () => {
    vi.useFakeTimers();
    const child = new FakeChildProcess(5299);
    const signalWindowsLauncher = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      child.finish(null, 'SIGKILL');
    });
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn: vi.fn(() => child),
      signalWindowsLauncher,
    });
    const owned = await controller.spawn('whisper.exe', []);

    const stopping = controller.stop(owned);
    const result = expect(stopping).resolves.toEqual({ forced: true });
    await vi.advanceTimersByTimeAsync(1500);
    await result;
    expect(signalWindowsLauncher).toHaveBeenCalledOnce();
    expect(signalWindowsLauncher).toHaveBeenCalledWith(child, true, 5000);
  });

  it('accepts a stopped Windows tree when force termination uses the full budget', async () => {
    vi.useFakeTimers();
    const child = new FakeChildProcess(5300);
    let currentTime = 0;
    const signalWindowsLauncher = vi.fn(async () => {
      currentTime += 2000;
      child.finish(null, 'SIGKILL');
    });
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn: vi.fn(() => child),
      signalWindowsLauncher,
      gracefulTimeoutMs: 1,
      forceTimeoutMs: 2000,
      now: () => currentTime,
    });
    const owned = await controller.spawn('whisper.exe', []);

    const stopping = controller.stop(owned);
    const result = expect(stopping).resolves.toEqual({ forced: true });
    await vi.advanceTimersByTimeAsync(1);
    await result;
  });

  it('bounds a process-group lookup that never settles', async () => {
    vi.useFakeTimers();
    const child = new FakeChildProcess(5201);
    const kill = vi.fn();
    const controller = createProcessTreeController({
      platform: 'darwin',
      parentPid: 900,
      spawn: vi.fn(() => child),
      kill,
      getProcessGroupId: vi.fn(() => new Promise(() => {})),
      isProcessGroupRunning: vi.fn(async () => false),
      helperTimeoutMs: 100,
    });

    const spawning = controller.spawn('whisper', []);
    const rejection = expect(spawning).rejects.toMatchObject({
      code: 'PROCESS_GROUP_PROOF_FAILED',
    });
    await vi.advanceTimersByTimeAsync(100);
    await rejection;
    expect(kill).not.toHaveBeenCalled();
    expect(child.closed).toBe(true);
  });

  it('bounds a Windows tree helper that never settles', async () => {
    vi.useFakeTimers();
    const child = new FakeChildProcess(5301);
    const controller = createProcessTreeController({
      platform: 'win32',
      spawn: vi.fn(() => child),
      signalWindowsLauncher: vi.fn(() => new Promise(() => {})),
      gracefulTimeoutMs: 100,
      forceTimeoutMs: 100,
      helperTimeoutMs: 50,
    });
    const owned = await controller.spawn('whisper.exe', []);

    const stopping = controller.stop(owned);
    const rejection = expect(stopping).rejects.toMatchObject({
      code: 'PROCESS_TREE_CLEANUP_TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(200);
    await rejection;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects forged and modified owner handles before any group signal', async () => {
    const { child, controller, kill } = createPosixHarness();
    const owned = await controller.spawn('whisper', []);
    const forged = {
      ...owned,
      groupId: 9999,
      isolatedProcessGroup: true,
      pid: 9999,
    } as OwnedProcess;

    await expect(controller.stop(forged)).rejects.toMatchObject({
      code: 'INVALID_PROCESS_OWNER',
    });
    expect(() => Object.assign(owned, { groupId: 9999 })).toThrow();
    expect(kill).not.toHaveBeenCalledWith(-9999, expect.anything());

    const stopping = controller.stop(owned);
    child.finish(0, 'SIGTERM');
    await stopping;
  });

  it('rejects after the final forced-cleanup deadline when the group remains', async () => {
    vi.useFakeTimers();
    const child = new FakeChildProcess(5401);
    const controller = createProcessTreeController({
      platform: 'darwin',
      parentPid: 900,
      spawn: vi.fn(() => child),
      kill: vi.fn(),
      getProcessGroupId: vi.fn(async (pid: number) => (pid === child.pid ? child.pid : 77)),
      isProcessGroupRunning: vi.fn(async () => true),
      gracefulTimeoutMs: 100,
      forceTimeoutMs: 50,
    });
    const owned = await controller.spawn('whisper', []);
    child.finish(0);
    const stopping = controller.stop(owned);
    const rejection = expect(stopping).rejects.toMatchObject({
      code: 'PROCESS_TREE_CLEANUP_TIMEOUT',
    });

    await vi.advanceTimersByTimeAsync(150);
    await rejection;
    expect(vi.getTimerCount()).toBe(0);
  });
});

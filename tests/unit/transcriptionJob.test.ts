// @vitest-environment node

import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeChildProcess } from '../helpers/fakeChildProcess';

const require = createRequire(import.meta.url);
const { createTranscriptionJob } = require('../../electron/transcriptionJob.cjs') as {
  createTranscriptionJob(options: Record<string, unknown>): {
    cancel(reason?: string): Promise<void>;
    run(stages: Record<string, unknown>): Promise<{ stdout: string }>;
    shutdown(): Promise<void>;
    readonly status: string;
  };
};
const { createProcessTreeController } = require('../../electron/processTree.cjs') as {
  createProcessTreeController(options: Record<string, unknown>): {
    spawn(command: string, args: string[], options?: Record<string, unknown>): Promise<unknown>;
    stop(process: unknown): Promise<{ forced: boolean }>;
  };
};

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

function createHarness(timeoutMs = 60_000) {
  const children: FakeChildProcess[] = [];
  const spawn = vi.fn(async () => {
    const child = new FakeChildProcess(6000 + children.length);
    children.push(child);
    let closed = false;
    const closePromise = new Promise((resolve) => {
      child.once('close', (code, signal) => {
        closed = true;
        resolve({ code, processError: undefined, signal });
      });
    });
    return {
      child,
      closeTracker: {
        closePromise,
        get closed() {
          return closed;
        },
      },
      groupId: child.pid,
    };
  });
  const stop = vi.fn(async (owned: { child: FakeChildProcess }) => {
    if (owned.child.exitCode === null) owned.child.finish(null, 'SIGTERM');
    return { forced: false };
  });
  const statuses: string[] = [];
  const job = createTranscriptionJob({
    processTree: { spawn, stop },
    timeoutMs,
    onStatus: (status: string) => statuses.push(status),
  });
  return { children, job, spawn, statuses, stop };
}

const stages = {
  conversion: { command: 'ffmpeg', args: ['input.webm', 'output.wav'] },
  transcription: { command: 'whisper', args: ['output.wav'] },
};

describe('local transcription job ownership', () => {
  it('starts Whisper only after FFmpeg closes and both output streams drain', async () => {
    const { children, job, spawn, statuses } = createHarness();
    const result = job.run(stages);
    await vi.waitFor(() => expect(children).toHaveLength(1));
    expect(spawn).toHaveBeenNthCalledWith(
      1,
      'ffmpeg',
      ['input.webm', 'output.wav'],
      expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe'] }),
    );

    children[0].finish(0, null, { closeStreams: false });
    await Promise.resolve();
    expect(children).toHaveLength(1);
    children[0].closeStreams();
    await vi.waitFor(() => expect(children).toHaveLength(2));

    children[1].stdout.write('final transcript');
    children[1].finish(0);
    await expect(result).resolves.toEqual({ stdout: 'final transcript' });
    expect(statuses).toEqual(['running', 'complete']);
  });

  it('does not publish completion until late stdout drains', async () => {
    const { children, job, statuses } = createHarness();
    const result = job.run({ transcription: stages.transcription });
    await vi.waitFor(() => expect(children).toHaveLength(1));

    children[0].stdout.write('first ');
    children[0].finish(0, null, { closeStreams: false });
    await Promise.resolve();
    expect(statuses).toEqual(['running']);

    children[0].stdout.write('last');
    children[0].closeStreams();
    await expect(result).resolves.toEqual({ stdout: 'first last' });
    expect(statuses).toEqual(['running', 'complete']);
  });

  it('uses the controller close record when the child exits during ownership proof', async () => {
    const child = new FakeChildProcess(6050);
    const childGroup = Promise.withResolvers<number>();
    const parentGroup = Promise.withResolvers<number>();
    const processTree = createProcessTreeController({
      platform: 'darwin',
      parentPid: 900,
      spawn: vi.fn(() => child),
      getProcessGroupId: vi.fn((pid: number) =>
        pid === child.pid ? childGroup.promise : parentGroup.promise,
      ),
      isProcessGroupRunning: vi.fn(async () => false),
    });
    const job = createTranscriptionJob({ processTree });
    const result = job.run({ transcription: stages.transcription });
    await Promise.resolve();

    child.finish(0);
    childGroup.resolve(child.pid);
    parentGroup.resolve(77);

    await expect(result).resolves.toEqual({ stdout: '' });
    expect(job.status).toBe('complete');
  });

  it('reports a clear installation action when FFmpeg is missing', async () => {
    const { children, job } = createHarness();
    const result = job.run({ conversion: stages.conversion, transcription: stages.transcription });
    await vi.waitFor(() => expect(children).toHaveLength(1));

    children[0].stderr.write('Could not start ffmpeg: spawn ffmpeg ENOENT');
    children[0].finish(127);

    await expect(result).rejects.toMatchObject({
      code: 'TRANSCRIPTION_PROCESS_FAILED',
      message: 'FFmpeg was not found. Install FFmpeg and add it to PATH.',
    });
  });

  it('reports the same FFmpeg installation action for a Windows startup failure', async () => {
    const missingExecutable = new Error('Windows target is not an absolute executable: ffmpeg');
    const startupFailure = Object.assign(
      new Error(`Windows Job startup failed: ${missingExecutable.message}`, {
        cause: missingExecutable,
      }),
      { code: 'PROCESS_LAUNCHER_TARGET_START_FAILED' },
    );
    const ownershipFailure = Object.assign(
      new Error(`Could not start the owned process for PID 6052: ${startupFailure.message}`, {
        cause: startupFailure,
      }),
      { code: 'PROCESS_LAUNCHER_START_FAILED' },
    );
    const processTree = {
      spawn: vi.fn(async () => {
        throw ownershipFailure;
      }),
      stop: vi.fn(),
    };
    const job = createTranscriptionJob({ processTree });

    await expect(
      job.run({ conversion: stages.conversion, transcription: stages.transcription }),
    ).rejects.toMatchObject({
      code: 'TRANSCRIPTION_PROCESS_FAILED',
      message: 'FFmpeg was not found. Install FFmpeg and add it to PATH.',
    });
  });

  it('reports a child error emitted during ownership proof without hanging', async () => {
    const child = new FakeChildProcess(6051);
    const childGroup = Promise.withResolvers<number>();
    const parentGroup = Promise.withResolvers<number>();
    const processTree = createProcessTreeController({
      platform: 'darwin',
      parentPid: 900,
      spawn: vi.fn(() => child),
      getProcessGroupId: vi.fn((pid: number) =>
        pid === child.pid ? childGroup.promise : parentGroup.promise,
      ),
      isProcessGroupRunning: vi.fn(async () => false),
    });
    const job = createTranscriptionJob({ processTree });
    const result = job.run({ transcription: stages.transcription });
    const processError = Object.assign(new Error('native start failed'), { code: 'EACCES' });
    child.emit('error', processError);
    child.finish(-2);
    childGroup.resolve(child.pid);
    parentGroup.resolve(77);

    await expect(result).rejects.toMatchObject({
      code: 'TRANSCRIPTION_PROCESS_ERROR',
      cause: processError,
    });
    expect(job.status).toBe('failed');
  });

  it.each(['stdout', 'stderr'] as const)(
    'stops the owned tree when %s fails while the child remains alive',
    async (streamName) => {
      const { children, job, statuses, stop } = createHarness();
      const result = job.run({ transcription: stages.transcription });
      await vi.waitFor(() => expect(children).toHaveLength(1));
      const streamError = Object.assign(new Error(`${streamName} failed`), { code: 'EIO' });

      children[0][streamName].emit('error', streamError);

      await expect(result).rejects.toBe(streamError);
      expect(stop).toHaveBeenCalledOnce();
      expect(statuses).toEqual(['running', 'failed']);
    },
  );

  it('cancels FFmpeg once, waits for cleanup, and never starts Whisper', async () => {
    const { children, job, spawn, statuses, stop } = createHarness();
    const result = job.run(stages);
    await vi.waitFor(() => expect(children).toHaveLength(1));

    const firstCancel = job.cancel();
    const secondCancel = job.cancel();
    expect(secondCancel).toBe(firstCancel);
    await firstCancel;
    await expect(result).rejects.toMatchObject({ code: 'TRANSCRIPTION_CANCELLED' });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual(['running', 'cancelled']);
  });

  it('times out through tree cleanup and publishes failure only after cleanup completes', async () => {
    vi.useFakeTimers();
    const child = new FakeChildProcess(7001);
    const cleanup = Promise.withResolvers<void>();
    let closed = false;
    const closePromise = new Promise((resolve) => {
      child.once('close', (code, signal) => {
        closed = true;
        resolve({ code, processError: undefined, signal });
      });
    });
    const stop = vi.fn(async () => {
      await cleanup.promise;
      child.finish(null, 'SIGKILL');
      return { forced: true };
    });
    const statuses: string[] = [];
    const job = createTranscriptionJob({
      processTree: {
        spawn: vi.fn(async () => ({
          child,
          closeTracker: {
            closePromise,
            get closed() {
              return closed;
            },
          },
          groupId: child.pid,
        })),
        stop,
      },
      timeoutMs: 1000,
      onStatus: (status: string) => statuses.push(status),
    });
    const result = job.run({ transcription: stages.transcription });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(stop).toHaveBeenCalledOnce();
    expect(statuses).toEqual(['running']);

    cleanup.resolve();
    await expect(result).rejects.toMatchObject({ code: 'TRANSCRIPTION_TIMEOUT' });
    expect(statuses).toEqual(['running', 'failed']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses the same bounded cleanup path for app shutdown', async () => {
    const { children, job, statuses, stop } = createHarness();
    const result = job.run({ transcription: stages.transcription });
    await vi.waitFor(() => expect(children).toHaveLength(1));

    await job.shutdown();
    await expect(result).rejects.toMatchObject({ code: 'TRANSCRIPTION_SHUTDOWN' });
    expect(stop).toHaveBeenCalledOnce();
    expect(statuses).toEqual(['running', 'cancelled']);
  });

  it('stops an owned Windows launcher while ownership startup is still pending', async () => {
    const child = new FakeChildProcess(7003);
    const spawnResult = Promise.withResolvers<unknown>();
    const closeResult = Promise.withResolvers<unknown>();
    const owned = {
      child,
      closeTracker: {
        closePromise: closeResult.promise,
        exitPromise: closeResult.promise,
      },
    };
    const stop = vi.fn(async () => {
      child.finish(null, 'SIGTERM');
      closeResult.resolve({ code: null, processError: undefined, signal: 'SIGTERM' });
      return { forced: false };
    });
    const spawn = vi.fn(
      async (
        _command: string,
        _args: string[],
        options: { onOwned?: (value: unknown) => void },
      ) => {
        options.onOwned?.(owned);
        return spawnResult.promise;
      },
    );
    const job = createTranscriptionJob({ processTree: { spawn, stop } });

    const run = job.run({ transcription: stages.transcription });
    await Promise.resolve();
    const shutdown = job.shutdown();
    await vi.waitFor(() => expect(stop).toHaveBeenCalledWith(owned));

    spawnResult.resolve(owned);
    await expect(run).rejects.toMatchObject({ code: 'TRANSCRIPTION_SHUTDOWN' });
    await expect(shutdown).resolves.toBeUndefined();
  });

  it('fails closed after draining stdout that exceeds the memory bound', async () => {
    const { children, job, statuses } = createHarness();
    const result = job.run({ transcription: stages.transcription });
    await vi.waitFor(() => expect(children).toHaveLength(1));

    children[0].stdout.write(Buffer.alloc(4 * 1024 * 1024 + 1));
    children[0].finish(0, null, { closeStreams: false });
    expect(statuses).toEqual(['running']);
    children[0].closeStreams();

    await expect(result).rejects.toMatchObject({ code: 'TRANSCRIPTION_OUTPUT_LIMIT' });
    expect(statuses).toEqual(['running', 'failed']);
  });

  it('stops a child as soon as stdout exceeds the memory bound', async () => {
    const { children, job, stop } = createHarness();
    const result = job.run({ transcription: stages.transcription });
    await vi.waitFor(() => expect(children).toHaveLength(1));

    children[0].stdout.write(Buffer.alloc(4 * 1024 * 1024 + 1));

    await expect(result).rejects.toMatchObject({ code: 'TRANSCRIPTION_OUTPUT_LIMIT' });
    expect(stop).toHaveBeenCalledOnce();
  });

  it('keeps an error owner while output-limit cleanup destroys the stream', async () => {
    const child = new FakeChildProcess(7002);
    const cleanupError = Object.assign(new Error('tree still exists'), {
      code: 'PROCESS_TREE_CLEANUP_TIMEOUT',
    });
    const job = createTranscriptionJob({
      processTree: {
        spawn: vi.fn(async () => ({
          child,
          closeTracker: {
            closePromise: new Promise(() => {}),
            exitPromise: new Promise(() => {}),
          },
        })),
        stop: vi.fn(() => Promise.reject(cleanupError)),
      },
    });
    const result = job.run({ transcription: stages.transcription });
    await Promise.resolve();

    child.stdout.write(Buffer.alloc(4 * 1024 * 1024 + 1));
    const ownedErrorListeners = child.stdout.listenerCount('error');
    child.stdout.once('error', () => {});

    await expect(result).rejects.toMatchObject({ code: 'TRANSCRIPTION_CLEANUP_FAILED' });
    expect(ownedErrorListeners).toBeGreaterThan(0);
  });

  it('settles run and cancellation with a cleanup error without publishing success', async () => {
    const child = new FakeChildProcess(7101);
    let closed = false;
    const closePromise = new Promise((resolve) => {
      child.once('close', (code, signal) => {
        closed = true;
        resolve({ code, processError: undefined, signal });
      });
    });
    const statuses: string[] = [];
    const job = createTranscriptionJob({
      processTree: {
        spawn: vi.fn(async () => ({
          child,
          closeTracker: {
            closePromise,
            get closed() {
              return closed;
            },
          },
          groupId: child.pid,
        })),
        stop: vi.fn(() =>
          Promise.reject(
            Object.assign(new Error('tree still exists'), {
              code: 'PROCESS_TREE_CLEANUP_TIMEOUT',
            }),
          ),
        ),
      },
      timeoutMs: 60_000,
      onStatus: (status: string) => statuses.push(status),
    });
    const run = job.run({ transcription: stages.transcription });
    await Promise.resolve();
    const cancellation = job.cancel();
    child.finish(null, 'SIGKILL');

    await expect(run).rejects.toMatchObject({ code: 'TRANSCRIPTION_CLEANUP_FAILED' });
    await expect(cancellation).rejects.toMatchObject({ code: 'TRANSCRIPTION_CLEANUP_FAILED' });
    expect(job.status).toBe('cleanup-failed');
    expect(statuses).toEqual(['running', 'cleanup-failed']);
  });

  it('settles a cleanup error when the child never emits exit or close', async () => {
    const child = new FakeChildProcess(7102);
    const cleanupError = Object.assign(new Error('tree still exists'), {
      code: 'PROCESS_TREE_CLEANUP_TIMEOUT',
    });
    const statuses: string[] = [];
    const job = createTranscriptionJob({
      processTree: {
        spawn: vi.fn(async () => ({
          child,
          closeTracker: {
            closePromise: new Promise(() => {}),
            exitPromise: new Promise(() => {}),
            get closed() {
              return false;
            },
          },
          groupId: child.pid,
        })),
        stop: vi.fn(() => Promise.reject(cleanupError)),
      },
      onStatus: (status: string) => statuses.push(status),
    });
    const run = job.run({ transcription: stages.transcription });
    await Promise.resolve();
    const cancellation = job.cancel();

    await expect(run).rejects.toMatchObject({ code: 'TRANSCRIPTION_CLEANUP_FAILED' });
    await expect(cancellation).rejects.toMatchObject({ code: 'TRANSCRIPTION_CLEANUP_FAILED' });
    expect(job.status).toBe('cleanup-failed');
    expect(statuses).toEqual(['running', 'cleanup-failed']);
  });
});

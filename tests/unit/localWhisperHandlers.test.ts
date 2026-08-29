// @vitest-environment node

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const nodeFs = require('node:fs') as typeof import('node:fs');
const { registerLocalWhisperHandlers } = require('../../electron/localWhisperHandlers.cjs') as {
  registerLocalWhisperHandlers(options: Record<string, unknown>): { shutdown(): Promise<void> };
};

const fixtureDirectories: string[] = [];

function createHarness(
  overrides: Record<string, unknown> = {},
  beforeRegister?: (tempRoot: string) => void,
) {
  const tempRoot = mkdtempSync(join(tmpdir(), 'audiobash-local-handler-'));
  fixtureDirectories.push(tempRoot);
  beforeRegister?.(tempRoot);
  type Handler = (event: unknown, request?: unknown) => Promise<unknown>;
  const handlers: Record<string, Handler> = {};
  const ipcMain = {
    handle: vi.fn((channel: string, handler: Handler) => {
      handlers[channel] = handler;
    }),
  };
  const whisperService = {
    cancel: vi.fn(() => ({ cancelled: true, queued: false })),
    shutdown: vi.fn(async () => undefined),
    transcribe: vi.fn(),
  };
  const lifecycle = registerLocalWhisperHandlers({
    ipcMain,
    whisperService,
    getTempPath: () => tempRoot,
    logError: vi.fn(),
    logWarning: vi.fn(),
    ...overrides,
  });
  return { handlers, lifecycle, tempRoot, whisperService };
}

afterEach(() => {
  for (const directory of fixtureDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('local Whisper IPC ownership', () => {
  it('validates canonical base64 without a full decoded-buffer re-encode', () => {
    const source = readFileSync(join(process.cwd(), 'electron/localWhisperHandlers.cjs'), 'utf8');

    expect(source).not.toContain("audioBuffer.toString('base64')");
  });

  it('removes an orphaned Whisper audio directory when handlers start', () => {
    const { tempRoot } = createHarness({}, (root) => {
      const orphan = join(root, 'whisper-orphan');
      mkdirSync(orphan);
      writeFileSync(join(orphan, 'input.webm'), 'recorded audio');
      mkdirSync(join(root, 'unrelated-directory'));
    });

    expect(existsSync(join(tempRoot, 'whisper-orphan'))).toBe(false);
    expect(existsSync(join(tempRoot, 'unrelated-directory'))).toBe(true);
  });

  it('keeps one unique input file until the owned job settles, then removes it', async () => {
    const { handlers, tempRoot, whisperService } = createHarness();
    const result = Promise.withResolvers<{ text: string }>();
    whisperService.transcribe.mockReturnValue(result.promise);

    const response = handlers['whisper-transcribe'](
      {},
      {
        requestId: 'local-handler-1',
        modelName: 'small.en',
        audioBase64: Buffer.from('audio bytes').toString('base64'),
      },
    );
    await vi.waitFor(() => expect(whisperService.transcribe).toHaveBeenCalledOnce());

    const [audioPath, request] = whisperService.transcribe.mock.calls[0];
    expect(readFileSync(audioPath, 'utf8')).toBe('audio bytes');
    expect(request).toEqual({ requestId: 'local-handler-1', modelName: 'small.en' });
    expect(existsSync(audioPath)).toBe(true);

    result.resolve({ text: 'done' });
    await expect(response).resolves.toEqual({ text: 'done' });
    expect(readdirSync(tempRoot)).toEqual([]);
  });

  it('rejects decoded audio larger than 25 MB before it creates a job', async () => {
    const { handlers, tempRoot, whisperService } = createHarness();
    const response = await handlers['whisper-transcribe'](
      {},
      {
        requestId: 'local-handler-2',
        modelName: 'small.en',
        audioBase64: Buffer.alloc(25 * 1024 * 1024 + 1).toString('base64'),
      },
    );

    expect(response).toEqual({
      text: '',
      error: 'Audio data is invalid or exceeds the 25 MB limit',
    });
    expect(whisperService.transcribe).not.toHaveBeenCalled();
    expect(readdirSync(tempRoot)).toEqual([]);
  });

  it('rejects an oversized encoded payload before it decodes or writes audio', async () => {
    const { handlers, tempRoot, whisperService } = createHarness();
    const maximumEncodedLength = Math.ceil((25 * 1024 * 1024) / 3) * 4;

    await expect(
      handlers['whisper-transcribe'](
        {},
        {
          requestId: 'local-handler-encoded-limit',
          modelName: 'small.en',
          audioBase64: 'A'.repeat(maximumEncodedLength + 4),
        },
      ),
    ).resolves.toEqual({
      text: '',
      error: 'Audio data is invalid or exceeds the 25 MB limit',
    });
    expect(whisperService.transcribe).not.toHaveBeenCalled();
    expect(readdirSync(tempRoot)).toEqual([]);
  });

  it.each([
    [{ modelName: 'small.en', audioBase64: 'YXVkaW8=' }, 'Invalid local transcription request ID'],
    [
      { requestId: 'local-handler-4', modelName: 'base.en', audioBase64: 'YXVkaW8=' },
      'Invalid local transcription model',
    ],
    [
      { requestId: 'local-handler-5', modelName: 'small.en', audioBase64: '!!!!YXVkaW8=' },
      'Audio data is not valid base64',
    ],
    [
      { requestId: 'local-handler-padding', modelName: 'small.en', audioBase64: 'AB==' },
      'Audio data is not valid base64',
    ],
    [
      { requestId: 'local-handler-single-padding', modelName: 'small.en', audioBase64: 'AAB=' },
      'Audio data is not valid base64',
    ],
  ])('rejects malformed request data before it writes a file', async (request, error) => {
    const { handlers, tempRoot, whisperService } = createHarness();

    await expect(handlers['whisper-transcribe']({}, request)).resolves.toEqual({
      text: '',
      error,
    });
    expect(whisperService.transcribe).not.toHaveBeenCalled();
    expect(readdirSync(tempRoot)).toEqual([]);
  });

  it('blocks new work and waits for handler file cleanup during shutdown', async () => {
    const { handlers, lifecycle, tempRoot, whisperService } = createHarness();
    const transcription = Promise.withResolvers<{ text: string }>();
    whisperService.transcribe.mockReturnValue(transcription.promise);
    const response = handlers['whisper-transcribe'](
      {},
      {
        requestId: 'local-handler-6',
        modelName: 'small.en',
        audioBase64: 'YXVkaW8=',
      },
    );
    await vi.waitFor(() => expect(readdirSync(tempRoot)).toHaveLength(1));

    let shutdownSettled = false;
    const shutdown = lifecycle.shutdown().finally(() => {
      shutdownSettled = true;
    });
    await Promise.resolve();
    expect(shutdownSettled).toBe(false);
    await expect(
      handlers['whisper-transcribe'](
        {},
        {
          requestId: 'local-handler-7',
          modelName: 'small.en',
          audioBase64: 'YXVkaW8=',
        },
      ),
    ).resolves.toMatchObject({ errorCode: 'TRANSCRIPTION_SHUTDOWN' });

    transcription.resolve({ text: 'done' });
    await expect(response).resolves.toEqual({ text: 'done' });
    await shutdown;
    expect(readdirSync(tempRoot)).toEqual([]);
  });

  it('waits for temporary-file cleanup before it reports a service shutdown error', async () => {
    const { handlers, lifecycle, tempRoot, whisperService } = createHarness();
    const transcription = Promise.withResolvers<{ text: string }>();
    const shutdownError = new Error('native cleanup failed');
    whisperService.transcribe.mockReturnValue(transcription.promise);
    whisperService.shutdown.mockRejectedValue(shutdownError);
    const response = handlers['whisper-transcribe'](
      {},
      {
        requestId: 'local-handler-cleanup-error',
        modelName: 'small.en',
        audioBase64: 'YXVkaW8=',
      },
    );
    await vi.waitFor(() => expect(readdirSync(tempRoot)).toHaveLength(1));

    let shutdownSettled = false;
    const shutdown = lifecycle.shutdown().finally(() => {
      shutdownSettled = true;
    });
    const rejection = expect(shutdown).rejects.toBe(shutdownError);
    await Promise.resolve();
    expect(shutdownSettled).toBe(false);

    transcription.resolve({ text: 'done' });
    await response;
    await rejection;
    expect(readdirSync(tempRoot)).toEqual([]);
  });

  it('retries a locked temporary directory during lifecycle shutdown', async () => {
    const rmSync = vi.fn((directory: string, options: import('node:fs').RmDirOptions) => {
      if (rmSync.mock.calls.length === 1) {
        throw Object.assign(new Error('temporary file is busy'), { code: 'EBUSY' });
      }
      nodeFs.rmSync(directory, options);
    });
    const { handlers, lifecycle, tempRoot, whisperService } = createHarness({
      fileSystem: { ...nodeFs, rmSync },
    });
    whisperService.transcribe.mockResolvedValue({ text: 'done' });

    await handlers['whisper-transcribe'](
      {},
      {
        requestId: 'local-handler-locked-cleanup',
        modelName: 'small.en',
        audioBase64: 'YXVkaW8=',
      },
    );
    expect(readdirSync(tempRoot)).toHaveLength(1);

    await lifecycle.shutdown();
    expect(readdirSync(tempRoot)).toEqual([]);
    expect(rmSync).toHaveBeenCalledTimes(2);
    expect(rmSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ maxRetries: 3, retryDelay: 100 }),
    );
  });

  it('retries a locked temporary directory when a later request starts', async () => {
    const rmSync = vi.fn((directory: string, options: import('node:fs').RmDirOptions) => {
      if (rmSync.mock.calls.length === 1) {
        throw Object.assign(new Error('temporary file is busy'), { code: 'EBUSY' });
      }
      nodeFs.rmSync(directory, options);
    });
    const { handlers, tempRoot, whisperService } = createHarness({
      fileSystem: { ...nodeFs, rmSync },
    });
    whisperService.transcribe.mockResolvedValue({ text: 'done' });

    await handlers['whisper-transcribe'](
      {},
      {
        requestId: 'local-handler-retry-first',
        modelName: 'small.en',
        audioBase64: 'YXVkaW8=',
      },
    );
    expect(readdirSync(tempRoot)).toHaveLength(1);

    await handlers['whisper-transcribe'](
      {},
      {
        requestId: 'local-handler-retry-second',
        modelName: 'small.en',
        audioBase64: 'YXVkaW8=',
      },
    );

    expect(readdirSync(tempRoot)).toEqual([]);
    expect(rmSync).toHaveBeenCalledTimes(3);
  });

  it('rotates bounded cleanup retries past four permanently locked directories', async () => {
    const attemptedDirectories: string[] = [];
    const rmSync = vi.fn((directory: string) => {
      attemptedDirectories.push(directory);
      throw Object.assign(new Error('temporary file is busy'), { code: 'EBUSY' });
    });
    const { handlers, whisperService } = createHarness({
      fileSystem: { ...nodeFs, rmSync },
    });
    whisperService.transcribe.mockResolvedValue({ text: 'done' });

    for (let request = 1; request <= 7; request += 1) {
      await handlers['whisper-transcribe'](
        {},
        {
          requestId: `local-handler-rotation-${request}`,
          modelName: 'small.en',
          audioBase64: 'YXVkaW8=',
        },
      );
    }

    const uniqueDirectories = [...new Set(attemptedDirectories)];
    expect(uniqueDirectories).toHaveLength(7);
    expect(
      attemptedDirectories.filter((directory) => directory === uniqueDirectories[4]),
    ).toHaveLength(2);
  });

  it('rejects excess active requests before it decodes or writes their audio', async () => {
    const { handlers, tempRoot, whisperService } = createHarness();
    const requests = [
      Promise.withResolvers<{ text: string }>(),
      Promise.withResolvers<{ text: string }>(),
    ];
    whisperService.transcribe
      .mockReturnValueOnce(requests[0].promise)
      .mockReturnValueOnce(requests[1].promise);
    const first = handlers['whisper-transcribe'](
      {},
      {
        requestId: 'local-handler-busy-1',
        modelName: 'small.en',
        audioBase64: 'YXVkaW8=',
      },
    );
    const second = handlers['whisper-transcribe'](
      {},
      {
        requestId: 'local-handler-busy-2',
        modelName: 'small.en',
        audioBase64: 'YXVkaW8=',
      },
    );
    await vi.waitFor(() => expect(readdirSync(tempRoot)).toHaveLength(2));

    await expect(
      handlers['whisper-transcribe'](
        {},
        {
          requestId: 'local-handler-busy-3',
          modelName: 'small.en',
          audioBase64: Buffer.alloc(1024).toString('base64'),
        },
      ),
    ).resolves.toMatchObject({ errorCode: 'TRANSCRIPTION_BUSY' });
    expect(readdirSync(tempRoot)).toHaveLength(2);

    requests[0].resolve({ text: 'first' });
    requests[1].resolve({ text: 'second' });
    await Promise.all([first, second]);
    expect(readdirSync(tempRoot)).toEqual([]);
  });

  it('routes cancellation to the exact local request ID', async () => {
    const { handlers, whisperService } = createHarness();

    await expect(handlers['whisper-cancel']({}, 'local-handler-3')).resolves.toEqual({
      cancelled: true,
      queued: false,
    });
    expect(whisperService.cancel).toHaveBeenCalledWith('local-handler-3');
  });
});

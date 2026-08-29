import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import transcriptionRequestModule from '../../electron/transcriptionRequest.cjs';

interface TranscriptionAttemptContext {
  attempt: number;
  signal: AbortSignal;
  timeoutMs: number;
}

interface TranscriptionOperation {
  runStage<T>(
    label: string,
    attempt: (context: TranscriptionAttemptContext) => Promise<T>,
  ): Promise<T>;
}

interface TranscriptionRequestModule {
  createTranscriptionRequest(options?: { signal?: AbortSignal }): TranscriptionOperation;
}

const { createTranscriptionRequest } =
  transcriptionRequestModule as unknown as TranscriptionRequestModule;

function createHttpError(status: number): Error & { status: number } {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

function waitForAbort(signal: AbortSignal): Promise<never> {
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }

  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}

function resolveAfter<T>(delayMs: number, value: T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), delayMs);
  });
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('main-process transcription request policy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    const pendingTimerCount = vi.getTimerCount();
    vi.clearAllTimers();
    vi.useRealTimers();
    expect(pendingTimerCount).toBe(0);
  });

  it('clears the attempt deadline after a successful request', async () => {
    const operation = createTranscriptionRequest();

    const result = await operation.runStage('Gemini transcription', async ({ attempt, signal }) => {
      expect(attempt).toBe(1);
      expect(signal.aborted).toBe(false);
      return 'transcript';
    });

    expect(result).toBe('transcript');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses exact one-second and two-second retry delays', async () => {
    const operation = createTranscriptionRequest();
    const attemptStarts: number[] = [];
    const request = operation.runStage('OpenAI transcription', async () => {
      attemptStarts.push(Date.now());
      if (attemptStarts.length < 3) {
        throw createHttpError(503);
      }
      return 'recovered';
    });

    await flushAsyncWork();
    expect(attemptStarts).toEqual([0]);

    await vi.advanceTimersByTimeAsync(999);
    expect(attemptStarts).toEqual([0]);

    await vi.advanceTimersByTimeAsync(1);
    expect(attemptStarts).toEqual([0, 1000]);

    await vi.advanceTimersByTimeAsync(1999);
    expect(attemptStarts).toEqual([0, 1000]);

    await vi.advanceTimersByTimeAsync(1);
    await expect(request).resolves.toBe('recovered');
    expect(attemptStarts).toEqual([0, 1000, 3000]);
  });

  it.each([408, 429, 500, 503, 599])('retries transient HTTP status %s', async (status) => {
    const operation = createTranscriptionRequest();
    let attempts = 0;
    const request = operation.runStage('ElevenLabs transcription', async () => {
      attempts += 1;
      if (attempts === 1) {
        throw createHttpError(status);
      }
      return 'recovered';
    });

    await flushAsyncWork();
    await vi.advanceTimersByTimeAsync(1000);

    await expect(request).resolves.toBe('recovered');
    expect(attempts).toBe(2);
  });

  it.each([400, 401, 403, 404])('does not retry non-transient HTTP status %s', async (status) => {
    const operation = createTranscriptionRequest();
    const failure = createHttpError(status);
    let attempts = 0;

    const request = operation.runStage('Anthropic transcription', async () => {
      attempts += 1;
      throw failure;
    });

    await expect(request).rejects.toBe(failure);
    expect(attempts).toBe(1);
  });

  it.each([400, 401, 403, 404])(
    'does not retry HTTP status %s when a nested message says fetch failed',
    async (status) => {
      const operation = createTranscriptionRequest();
      const failure = Object.assign(new Error(`HTTP ${status}`), {
        status,
        cause: new TypeError('fetch failed'),
      });
      let attempts = 0;

      const request = operation.runStage('OpenAI transcription', async () => {
        attempts += 1;
        throw failure;
      });
      const requestRejection = expect(request).rejects.toBe(failure);

      await vi.advanceTimersByTimeAsync(3000);
      await requestRejection;
      expect(attempts).toBe(1);
    },
  );

  it('retries a network failure found in a nested cause chain', async () => {
    const operation = createTranscriptionRequest();
    const socketError = Object.assign(new Error('socket reset'), { code: 'ECONNRESET' });
    const transportError = Object.assign(new Error('request failed'), { cause: socketError });
    const sdkError = Object.assign(new Error('provider request failed'), { cause: transportError });
    let attempts = 0;

    const request = operation.runStage('Gemini transcription', async () => {
      attempts += 1;
      if (attempts === 1) {
        throw sdkError;
      }
      return 'recovered';
    });
    const requestExpectation = expect(request).resolves.toBe('recovered');

    await flushAsyncWork();
    await vi.advanceTimersByTimeAsync(1000);

    await requestExpectation;
    expect(attempts).toBe(2);
  });

  it('retries a nested network message when outer fields do not describe the cause', async () => {
    const operation = createTranscriptionRequest();
    const networkFailure = new TypeError('fetch failed');
    const sdkError = Object.assign(new Error('Provider request failed'), {
      cause: networkFailure,
      code: undefined,
    });
    let attempts = 0;

    const request = operation.runStage('Gemini transcription', async () => {
      attempts += 1;
      if (attempts === 1) {
        throw sdkError;
      }
      return 'recovered';
    });

    await flushAsyncWork();
    await vi.advanceTimersByTimeAsync(1000);

    await expect(request).resolves.toBe('recovered');
    expect(attempts).toBe(2);
  });

  it('aborts a stalled attempt at 30 seconds before retrying', async () => {
    const operation = createTranscriptionRequest();
    const attemptSignals: AbortSignal[] = [];
    const request = operation.runStage('Gemini transcription', ({ attempt, signal }) => {
      attemptSignals.push(signal);
      return attempt === 1 ? waitForAbort(signal) : Promise.resolve('recovered');
    });

    await flushAsyncWork();
    expect(attemptSignals).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(29_999);
    expect(attemptSignals[0].aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(attemptSignals[0].aborted).toBe(true);
    expect(attemptSignals).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(attemptSignals).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(request).resolves.toBe('recovered');
    expect(attemptSignals).toHaveLength(2);
  });

  it('shares one 100-second operation budget across sequential stages', async () => {
    const operation = createTranscriptionRequest();
    let firstStageAttempts = 0;
    const firstStage = operation.runStage('Whisper transcription', ({ attempt, signal }) => {
      firstStageAttempts += 1;
      return attempt < 3 ? waitForAbort(signal) : resolveAfter(10_000, 'words');
    });

    await vi.advanceTimersByTimeAsync(73_000);
    await expect(firstStage).resolves.toBe('words');
    expect(firstStageAttempts).toBe(3);
    expect(Date.now()).toBe(73_000);

    let secondStageSignal: AbortSignal | undefined;
    const secondStage = operation.runStage('Claude processing', ({ signal, timeoutMs }) => {
      secondStageSignal = signal;
      expect(timeoutMs).toBe(27_000);
      return waitForAbort(signal);
    });
    const secondStageRejection = expect(secondStage).rejects.toMatchObject({
      code: 'TRANSCRIPTION_DEADLINE_EXCEEDED',
    });

    await flushAsyncWork();
    await vi.advanceTimersByTimeAsync(26_999);
    expect(secondStageSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(secondStageSignal?.aborted).toBe(true);
    await secondStageRejection;
    expect(Date.now()).toBe(100_000);
  });

  it('preserves caller cancellation during an active attempt and does not retry', async () => {
    const caller = new AbortController();
    const operation = createTranscriptionRequest({ signal: caller.signal });
    const cancellation = new Error('Caller cancelled transcription');
    let attempts = 0;
    let attemptSignal: AbortSignal | undefined;
    const request = operation.runStage('OpenAI transcription', ({ signal }) => {
      attempts += 1;
      attemptSignal = signal;
      return waitForAbort(signal);
    });
    const requestRejection = expect(request).rejects.toBe(cancellation);

    await flushAsyncWork();
    caller.abort(cancellation);

    await requestRejection;
    expect(attemptSignal?.aborted).toBe(true);
    expect(attempts).toBe(1);
  });

  it('preserves caller cancellation during a retry delay and starts no later attempt', async () => {
    const caller = new AbortController();
    const operation = createTranscriptionRequest({ signal: caller.signal });
    const cancellation = new Error('Caller cancelled during backoff');
    let attempts = 0;
    const request = operation.runStage('ElevenLabs transcription', async () => {
      attempts += 1;
      throw createHttpError(503);
    });
    const requestRejection = expect(request).rejects.toBe(cancellation);

    await flushAsyncWork();
    await vi.advanceTimersByTimeAsync(500);
    caller.abort(cancellation);

    await requestRejection;
    await vi.advanceTimersByTimeAsync(2500);
    expect(attempts).toBe(1);
  });

  it('stops inside a retry delay when the shared operation budget expires', async () => {
    const operation = createTranscriptionRequest();
    const firstStage = operation.runStage('Long first stage', ({ attempt, signal }) =>
      attempt < 3 ? waitForAbort(signal) : resolveAfter(29_000, 'first result'),
    );

    await vi.advanceTimersByTimeAsync(92_000);
    await expect(firstStage).resolves.toBe('first result');

    const secondStage = operation.runStage('Second stage', () =>
      resolveAfter(7500, 'second result'),
    );
    await vi.advanceTimersByTimeAsync(7500);
    await expect(secondStage).resolves.toBe('second result');
    expect(Date.now()).toBe(99_500);

    let attempts = 0;
    const finalStage = operation.runStage('Final stage', async () => {
      attempts += 1;
      throw createHttpError(503);
    });
    const finalStageRejection = expect(finalStage).rejects.toMatchObject({
      code: 'TRANSCRIPTION_DEADLINE_EXCEEDED',
    });
    await flushAsyncWork();
    await vi.advanceTimersByTimeAsync(500);

    await finalStageRejection;
    expect(attempts).toBe(1);
    expect(Date.now()).toBe(100_000);
  });

  it('never makes more than three attempts', async () => {
    const operation = createTranscriptionRequest();
    const failure = createHttpError(503);
    let attempts = 0;
    const request = operation.runStage('OpenAI transcription', async () => {
      attempts += 1;
      throw failure;
    });
    const requestRejection = expect(request).rejects.toBe(failure);

    await flushAsyncWork();
    await vi.advanceTimersByTimeAsync(3000);

    await requestRejection;
    expect(attempts).toBe(3);
  });

  it('isolates concurrent operations and their caller signals', async () => {
    const firstCaller = new AbortController();
    const secondCaller = new AbortController();
    const firstOperation = createTranscriptionRequest({ signal: firstCaller.signal });
    const secondOperation = createTranscriptionRequest({ signal: secondCaller.signal });
    const firstCancellation = new Error('Cancel only the first operation');
    let firstSignal: AbortSignal | undefined;
    let secondSignal: AbortSignal | undefined;

    const firstRequest = firstOperation.runStage('First transcription', ({ signal }) => {
      firstSignal = signal;
      return waitForAbort(signal);
    });
    const secondRequest = secondOperation.runStage('Second transcription', ({ signal }) => {
      secondSignal = signal;
      return resolveAfter(5000, 'second result');
    });

    await flushAsyncWork();
    firstCaller.abort(firstCancellation);

    await expect(firstRequest).rejects.toBe(firstCancellation);
    expect(firstSignal?.aborted).toBe(true);
    expect(secondSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(5000);
    await expect(secondRequest).resolves.toBe('second result');
    expect(secondSignal?.aborted).toBe(false);
  });
});

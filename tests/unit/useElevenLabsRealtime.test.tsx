import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

interface RealtimeConfig {
  apiKey: string;
  onFinalTranscript: (text: string) => void;
  onError: (error: Error) => void;
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

const realtimeRuntime = {
  connectGate: null as Deferred<void> | null,
  instances: [] as FakeRealtimeService[],
};

class FakeRealtimeService {
  readonly config: RealtimeConfig;
  isConnected = false;
  private disconnected = false;

  connect = vi.fn(async () => {
    await realtimeRuntime.connectGate?.promise;
    if (!this.disconnected) {
      this.isConnected = true;
    }
  });

  disconnect = vi.fn(() => {
    const wasConnected = this.isConnected;
    this.disconnected = true;
    this.isConnected = false;
    if (wasConnected) {
      this.config.onSessionEnd?.();
    }
  });

  commit = vi.fn();
  sendAudio = vi.fn();

  emitFinal(text: string): void {
    this.config.onFinalTranscript(text);
  }

  emitServerError(error: Error): void {
    this.config.onError(error);
    this.disconnect();
  }

  constructor(config: RealtimeConfig) {
    this.config = config;
    realtimeRuntime.instances.push(this);
  }
}

const pcmRuntime = {
  start: vi.fn(async () => undefined),
  stop: vi.fn(),
  onAudioData: null as ((pcmBase64: string) => void) | null,
};

async function renderRealtimeHook() {
  const { useElevenLabsRealtime } = await import('../../src/hooks/useElevenLabsRealtime');
  const callbacks = {
    onFinalTranscript: vi.fn(),
    onError: vi.fn(),
    onSessionStart: vi.fn(),
    onSessionEnd: vi.fn(),
  };
  const hook = renderHook(() =>
    useElevenLabsRealtime({
      apiKey: 'test-api-key',
      ...callbacks,
    }),
  );

  return { hook, callbacks };
}

async function renderRealtimeHookWithoutKey() {
  const { useElevenLabsRealtime } = await import('../../src/hooks/useElevenLabsRealtime');
  const callbacks = {
    onFinalTranscript: vi.fn(),
    onError: vi.fn(),
    onSessionStart: vi.fn(),
    onSessionEnd: vi.fn(),
  };
  const hook = renderHook(() =>
    useElevenLabsRealtime({
      apiKey: '',
      ...callbacks,
    }),
  );

  return { hook, callbacks };
}

beforeEach(() => {
  vi.resetModules();
  realtimeRuntime.connectGate = createDeferred<void>();
  realtimeRuntime.instances = [];
  pcmRuntime.start.mockReset().mockResolvedValue(undefined);
  pcmRuntime.stop.mockReset();
  pcmRuntime.onAudioData = null;

  vi.doMock('../../src/services/elevenLabsRealtimeService', () => ({
    ElevenLabsRealtimeService: FakeRealtimeService,
  }));
  vi.doMock('../../src/hooks/usePCMCapture', () => ({
    usePCMCapture: (options: { onAudioData: (pcmBase64: string) => void }) => {
      pcmRuntime.onAudioData = options.onAudioData;
      return {
        start: pcmRuntime.start,
        stop: pcmRuntime.stop,
        isCapturing: false,
        error: null,
      };
    },
  }));
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.doUnmock('../../src/services/elevenLabsRealtimeService');
  vi.doUnmock('../../src/hooks/usePCMCapture');
});

describe('useElevenLabsRealtime setup lifecycle', () => {
  it('reports false for a second start while the first setup owns the session', async () => {
    const { hook } = await renderRealtimeHook();
    const firstStart = hook.result.current.start();
    await waitFor(() => expect(realtimeRuntime.instances).toHaveLength(1));

    await expect(hook.result.current.start()).resolves.toBe(false);

    await act(async () => {
      realtimeRuntime.connectGate?.resolve(undefined);
      await expect(firstStart).resolves.toBe(true);
    });
    expect(pcmRuntime.start).toHaveBeenCalledOnce();
    hook.unmount();
  });

  it('does not start PCM capture after stop cancels pending setup', async () => {
    const { hook } = await renderRealtimeHook();
    let startPromise!: Promise<void>;

    act(() => {
      startPromise = hook.result.current.start();
    });
    await waitFor(() => expect(realtimeRuntime.instances).toHaveLength(1));

    act(() => hook.result.current.stop());
    expect(pcmRuntime.stop).toHaveBeenCalledOnce();

    await act(async () => {
      realtimeRuntime.connectGate?.resolve(undefined);
      await Promise.allSettled([startPromise]);
    });

    expect(pcmRuntime.start).not.toHaveBeenCalled();
    expect(realtimeRuntime.instances[0].disconnect).toHaveBeenCalledOnce();
    expect(hook.result.current.isConnected).toBe(false);
    expect(hook.result.current.isListening).toBe(false);

    hook.unmount();
  });

  it('does not start PCM capture when setup resolves after unmount', async () => {
    const { hook } = await renderRealtimeHook();
    let startPromise!: Promise<void>;

    act(() => {
      startPromise = hook.result.current.start();
    });
    await waitFor(() => expect(realtimeRuntime.instances).toHaveLength(1));

    hook.unmount();
    expect(realtimeRuntime.instances[0].disconnect).toHaveBeenCalledOnce();

    await act(async () => {
      realtimeRuntime.connectGate?.resolve(undefined);
      await Promise.allSettled([startPromise]);
    });

    expect(pcmRuntime.start).not.toHaveBeenCalled();
  });

  it('rejects start and disconnects when PCM capture cannot start', async () => {
    const captureError = new Error('Microphone unavailable');
    pcmRuntime.start.mockRejectedValueOnce(captureError);
    const { hook } = await renderRealtimeHook();

    const startPromise = hook.result.current.start();
    await waitFor(() => expect(realtimeRuntime.instances).toHaveLength(1));

    await act(async () => {
      realtimeRuntime.connectGate?.resolve(undefined);
      await expect(startPromise).rejects.toBe(captureError);
    });

    expect(realtimeRuntime.instances[0].disconnect).toHaveBeenCalledOnce();
    expect(hook.result.current.isConnected).toBe(false);
    expect(hook.result.current.isListening).toBe(false);

    hook.unmount();
  });

  it('stores a WebSocket setup failure in the public error state', async () => {
    const setupError = new Error('WebSocket setup failed');
    const { hook } = await renderRealtimeHook();
    const startPromise = hook.result.current.start();
    await waitFor(() => expect(realtimeRuntime.instances).toHaveLength(1));

    await act(async () => {
      realtimeRuntime.connectGate?.reject(setupError);
      await expect(startPromise).rejects.toBe(setupError);
    });

    expect(hook.result.current.error).toBe('WebSocket setup failed');
    hook.unmount();
  });

  it('allows one final transcript during graceful stop and ends the session at once', async () => {
    const { hook, callbacks } = await renderRealtimeHook();
    const startPromise = hook.result.current.start();
    realtimeRuntime.connectGate?.resolve(undefined);
    await act(async () => startPromise);
    const service = realtimeRuntime.instances[0];

    vi.useFakeTimers();
    act(() => hook.result.current.stop());
    act(() => service.emitFinal('committed transcript'));

    expect(service.commit).toHaveBeenCalledOnce();
    expect(callbacks.onFinalTranscript).toHaveBeenCalledOnce();
    expect(callbacks.onFinalTranscript).toHaveBeenCalledWith('committed transcript');
    expect(service.disconnect).toHaveBeenCalledOnce();
    expect(callbacks.onSessionEnd).toHaveBeenCalledOnce();
    expect(hook.result.current.isConnected).toBe(false);
    expect(hook.result.current.isListening).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
    hook.unmount();
  });

  it('rejects setup when the API key is empty', async () => {
    const { hook, callbacks } = await renderRealtimeHookWithoutKey();

    await act(async () => {
      await expect(hook.result.current.start()).rejects.toThrow('No ElevenLabs API key configured');
    });

    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(realtimeRuntime.instances).toHaveLength(0);
    expect(pcmRuntime.start).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('ends a graceful stop without a final transcript and ignores repeated stop', async () => {
    const { hook, callbacks } = await renderRealtimeHook();
    const startPromise = hook.result.current.start();
    realtimeRuntime.connectGate?.resolve(undefined);
    await act(async () => startPromise);
    const service = realtimeRuntime.instances[0];

    vi.useFakeTimers();
    act(() => {
      hook.result.current.stop();
      hook.result.current.stop();
    });

    expect(service.commit).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => vi.advanceTimersByTimeAsync(500));

    expect(service.disconnect).toHaveBeenCalledOnce();
    expect(callbacks.onFinalTranscript).not.toHaveBeenCalled();
    expect(callbacks.onSessionEnd).toHaveBeenCalledOnce();
    expect(hook.result.current.isConnected).toBe(false);
    expect(hook.result.current.isListening).toBe(false);
    vi.useRealTimers();
    hook.unmount();
  });

  it('discards an active session without commit when cancel is called', async () => {
    const { hook, callbacks } = await renderRealtimeHook();
    const startPromise = hook.result.current.start();
    realtimeRuntime.connectGate?.resolve(undefined);
    await act(async () => startPromise);
    const service = realtimeRuntime.instances[0];

    act(() => hook.result.current.cancel());
    act(() => service.emitFinal('discarded transcript'));

    expect(service.commit).not.toHaveBeenCalled();
    expect(service.disconnect).toHaveBeenCalledOnce();
    expect(callbacks.onFinalTranscript).not.toHaveBeenCalled();
    expect(hook.result.current.isConnected).toBe(false);
    expect(hook.result.current.isListening).toBe(false);
    hook.unmount();
  });

  it('stops PCM and ends the session after one active server error', async () => {
    const { hook, callbacks } = await renderRealtimeHook();
    const startPromise = hook.result.current.start();
    realtimeRuntime.connectGate?.resolve(undefined);
    await act(async () => startPromise);
    const service = realtimeRuntime.instances[0];
    const serverError = new Error('Provider rejected the stream');

    act(() => service.emitServerError(serverError));
    pcmRuntime.onAudioData?.('late audio');

    expect(callbacks.onError).toHaveBeenCalledOnce();
    expect(callbacks.onError).toHaveBeenCalledWith(serverError);
    expect(callbacks.onSessionEnd).toHaveBeenCalledOnce();
    expect(pcmRuntime.stop).toHaveBeenCalledOnce();
    expect(service.sendAudio).not.toHaveBeenCalled();
    expect(hook.result.current.isConnected).toBe(false);
    expect(hook.result.current.isListening).toBe(false);
    hook.unmount();
  });
});

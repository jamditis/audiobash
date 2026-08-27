import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

interface ConsumerCallbacks {
  onSpeechStart?: () => void;
  onSpeechEnd?: (audio: Float32Array) => void;
}

interface VADCreationOptions {
  model?: string;
  startOnLoad?: boolean;
  baseAssetPath?: string;
  onnxWASMBasePath?: string;
  onSpeechStart: () => void;
  onSpeechEnd: (audio: Float32Array) => void;
  onVADMisfire: () => void;
}

const vadRuntime = {
  moduleLoadCount: 0,
  moduleGate: null as Promise<void> | null,
  moduleError: undefined as unknown,
  create: vi.fn(),
};

async function createMockVADModule() {
  vadRuntime.moduleLoadCount += 1;

  if (vadRuntime.moduleGate) {
    await vadRuntime.moduleGate;
  }
  if (vadRuntime.moduleError !== undefined) {
    throw vadRuntime.moduleError;
  }

  return {
    MicVAD: {
      new: vadRuntime.create,
    },
  };
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

function createFakeVAD() {
  return {
    start: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    destroy: vi.fn(async () => undefined),
  };
}

function mockVADCreation(vad: ReturnType<typeof createFakeVAD>) {
  vadRuntime.create.mockImplementationOnce(async (options: VADCreationOptions) => {
    if (options.startOnLoad) {
      await vad.start();
    }
    return vad;
  });
}

async function renderUseVAD(callbacks: ConsumerCallbacks = {}) {
  const { useVAD } = await import('../../src/hooks/useVAD');
  return renderHook(() => useVAD(callbacks));
}

function creationOptions(callIndex = 0): VADCreationOptions {
  return vadRuntime.create.mock.calls[callIndex][0] as VADCreationOptions;
}

beforeEach(() => {
  vi.resetModules();
  vadRuntime.moduleLoadCount = 0;
  vadRuntime.moduleGate = null;
  vadRuntime.moduleError = undefined;
  vadRuntime.create.mockReset();
  vi.doMock('@ricky0123/vad-web', createMockVADModule);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.doUnmock('@ricky0123/vad-web');
  vi.restoreAllMocks();
});

describe('useVAD deferred runtime and lifecycle', () => {
  it('does not load vad-web when the hook module is imported or rendered', async () => {
    const { useVAD } = await import('../../src/hooks/useVAD');

    expect(vadRuntime.moduleLoadCount).toBe(0);

    const hook = renderHook(() => useVAD({}));

    expect(vadRuntime.moduleLoadCount).toBe(0);
    expect(hook.result.current.isListening).toBe(false);
    expect(hook.result.current.isSpeaking).toBe(false);
    expect(hook.result.current.vadError).toBeNull();

    hook.unmount();
  });

  it('starts after the React StrictMode effect probe', async () => {
    const fakeVAD = createFakeVAD();
    mockVADCreation(fakeVAD);
    const { useVAD } = await import('../../src/hooks/useVAD');
    const hook = renderHook(() => useVAD({}), { wrapper: StrictMode });

    await act(async () => hook.result.current.start());

    expect(vadRuntime.create).toHaveBeenCalledOnce();
    expect(fakeVAD.start).toHaveBeenCalledOnce();
    expect(hook.result.current.isListening).toBe(true);

    await act(async () => hook.result.current.stop());
  });

  it('loads the legacy VAD once and awaits the first instance creation', async () => {
    const fakeVAD = createFakeVAD();
    const startGate = createDeferred<void>();
    fakeVAD.start.mockReturnValue(startGate.promise);
    mockVADCreation(fakeVAD);
    const hook = await renderUseVAD();
    let settled = false;
    let startPromise!: Promise<void>;

    act(() => {
      startPromise = hook.result.current.start();
      void startPromise.finally(() => {
        settled = true;
      });
    });

    await waitFor(() => expect(vadRuntime.create).toHaveBeenCalledOnce());

    expect(vadRuntime.moduleLoadCount).toBe(1);
    expect(vadRuntime.create).toHaveBeenCalledOnce();
    expect(creationOptions()).toEqual(
      expect.objectContaining({
        model: 'legacy',
        startOnLoad: true,
        baseAssetPath: './vad/',
        onnxWASMBasePath: './vad/',
      }),
    );
    expect(fakeVAD.start).toHaveBeenCalledOnce();
    expect(hook.result.current.isListening).toBe(false);
    expect(settled).toBe(false);

    await act(async () => {
      startGate.resolve(undefined);
      await startPromise;
    });

    expect(fakeVAD.start).toHaveBeenCalledOnce();
    expect(hook.result.current.isListening).toBe(true);
    expect(hook.result.current.vadError).toBeNull();

    await act(async () => hook.result.current.stop());
  });

  it('coalesces concurrent start calls into one load, one instance, and one start', async () => {
    const fakeVAD = createFakeVAD();
    const moduleGate = createDeferred<void>();
    mockVADCreation(fakeVAD);
    const hook = await renderUseVAD();
    vadRuntime.moduleGate = moduleGate.promise;
    let firstStart!: Promise<void>;
    let secondStart!: Promise<void>;

    act(() => {
      firstStart = hook.result.current.start();
      secondStart = hook.result.current.start();
    });

    await waitFor(() => expect(vadRuntime.moduleLoadCount).toBe(1));

    await act(async () => {
      moduleGate.resolve(undefined);
      await Promise.all([firstStart, secondStart]);
    });

    expect(vadRuntime.create).toHaveBeenCalledOnce();
    expect(fakeVAD.start).toHaveBeenCalledOnce();
    expect(hook.result.current.isListening).toBe(true);

    await act(async () => hook.result.current.stop());
  });

  it('supports start-stop-start without overlapping instances or leaking cleanup', async () => {
    const firstVAD = createFakeVAD();
    const secondVAD = createFakeVAD();
    const firstPauseGate = createDeferred<void>();
    firstVAD.pause.mockReturnValue(firstPauseGate.promise);
    mockVADCreation(firstVAD);
    mockVADCreation(secondVAD);
    const hook = await renderUseVAD();

    await act(async () => hook.result.current.start());

    let stopPromise!: void | Promise<void>;
    let restartPromise!: Promise<void>;
    act(() => {
      stopPromise = hook.result.current.stop();
      restartPromise = hook.result.current.start();
    });

    await Promise.resolve();

    expect(firstVAD.pause).toHaveBeenCalledOnce();
    expect(firstVAD.destroy).not.toHaveBeenCalled();
    expect(vadRuntime.create).toHaveBeenCalledOnce();
    expect(secondVAD.start).not.toHaveBeenCalled();

    await act(async () => {
      firstPauseGate.resolve(undefined);
      await Promise.all([stopPromise, restartPromise]);
    });

    expect(firstVAD.destroy).toHaveBeenCalledOnce();
    expect(vadRuntime.create).toHaveBeenCalledTimes(2);
    expect(firstVAD.start).toHaveBeenCalledOnce();
    expect(secondVAD.start).toHaveBeenCalledOnce();
    expect(vadRuntime.moduleLoadCount).toBe(1);

    await act(async () => hook.result.current.stop());

    expect(secondVAD.pause).toHaveBeenCalledOnce();
    expect(secondVAD.destroy).toHaveBeenCalledOnce();
    expect(hook.result.current.isListening).toBe(false);
    expect(hook.result.current.isSpeaking).toBe(false);
  });

  it('reports and rejects a deferred VAD module load failure', async () => {
    const moduleError = new Error('VAD chunk failed');
    const recoveredVAD = createFakeVAD();
    const hook = await renderUseVAD();
    vadRuntime.moduleError = moduleError;
    let caughtError: unknown;

    await act(async () => {
      try {
        await hook.result.current.start();
      } catch (error) {
        caughtError = error;
      }
    });

    expect(caughtError).toBe(moduleError);
    expect(hook.result.current.vadError).toBe('VAD chunk failed');
    expect(hook.result.current.isListening).toBe(false);
    expect(hook.result.current.isSpeaking).toBe(false);
    expect(vadRuntime.create).not.toHaveBeenCalled();

    vadRuntime.moduleError = undefined;
    mockVADCreation(recoveredVAD);
    await act(async () => hook.result.current.start());

    expect(vadRuntime.moduleLoadCount).toBe(2);
    expect(vadRuntime.create).toHaveBeenCalledOnce();
    expect(recoveredVAD.start).toHaveBeenCalledOnce();
    expect(hook.result.current.vadError).toBeNull();

    await act(async () => hook.result.current.stop());
  });

  it('preserves a null start rejection and reports a stable fallback', async () => {
    const failedVAD = createFakeVAD();
    failedVAD.start.mockRejectedValue(null);
    mockVADCreation(failedVAD);
    const hook = await renderUseVAD();
    let didReject = false;
    let caughtError: unknown = 'not rejected';

    await act(async () => {
      try {
        await hook.result.current.start();
      } catch (error) {
        didReject = true;
        caughtError = error;
      }
    });

    expect(didReject).toBe(true);
    expect(caughtError).toBeNull();
    expect(hook.result.current.vadError).toBe('Failed to start VAD');
    expect(hook.result.current.isListening).toBe(false);
    expect(vadRuntime.create).toHaveBeenCalledOnce();
  });

  it('does not load VAD through a stale start callback after unmount', async () => {
    const hook = await renderUseVAD();
    const staleStart = hook.result.current.start;

    hook.unmount();
    await staleStart();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(vadRuntime.moduleLoadCount).toBe(0);
    expect(vadRuntime.create).not.toHaveBeenCalled();
  });

  it('does not create or start VAD after unmount during module loading', async () => {
    const fakeVAD = createFakeVAD();
    const moduleGate = createDeferred<void>();
    const onSpeechStart = vi.fn();
    mockVADCreation(fakeVAD);
    const hook = await renderUseVAD({ onSpeechStart });
    vadRuntime.moduleGate = moduleGate.promise;
    let startPromise!: Promise<void>;

    act(() => {
      startPromise = hook.result.current.start();
    });
    await waitFor(() => expect(vadRuntime.moduleLoadCount).toBe(1));

    hook.unmount();

    await act(async () => {
      moduleGate.resolve(undefined);
      await startPromise;
    });

    expect(vadRuntime.create).not.toHaveBeenCalled();
    expect(fakeVAD.start).not.toHaveBeenCalled();
    expect(onSpeechStart).not.toHaveBeenCalled();
  });

  it('cancels a pending start on stop and permits a later clean start', async () => {
    const fakeVAD = createFakeVAD();
    const moduleGate = createDeferred<void>();
    const hook = await renderUseVAD();
    vadRuntime.moduleGate = moduleGate.promise;
    mockVADCreation(fakeVAD);
    let canceledStart!: Promise<void>;

    act(() => {
      canceledStart = hook.result.current.start();
      hook.result.current.stop();
    });
    await waitFor(() => expect(vadRuntime.moduleLoadCount).toBe(1));

    await act(async () => {
      moduleGate.resolve(undefined);
      await canceledStart;
    });

    expect(vadRuntime.create).not.toHaveBeenCalled();

    await act(async () => hook.result.current.start());

    expect(vadRuntime.create).toHaveBeenCalledOnce();
    expect(fakeVAD.start).toHaveBeenCalledOnce();
    expect(hook.result.current.isListening).toBe(true);

    await act(async () => hook.result.current.stop());
  });

  it('destroys a late started instance after unmount', async () => {
    const fakeVAD = createFakeVAD();
    const startGate = createDeferred<void>();
    fakeVAD.start.mockReturnValue(startGate.promise);
    mockVADCreation(fakeVAD);
    const hook = await renderUseVAD();
    let startPromise!: Promise<void>;

    act(() => {
      startPromise = hook.result.current.start();
    });
    await waitFor(() => expect(vadRuntime.create).toHaveBeenCalledOnce());
    expect(fakeVAD.start).toHaveBeenCalledOnce();

    hook.unmount();

    await act(async () => {
      startGate.resolve(undefined);
      await startPromise;
    });

    expect(fakeVAD.start).toHaveBeenCalledOnce();
    expect(fakeVAD.pause).toHaveBeenCalledOnce();
    expect(fakeVAD.destroy).toHaveBeenCalledOnce();
  });

  it('disposes a pending started instance before an immediate restart', async () => {
    const firstVAD = createFakeVAD();
    const secondVAD = createFakeVAD();
    const firstStartGate = createDeferred<void>();
    firstVAD.start.mockReturnValue(firstStartGate.promise);
    mockVADCreation(firstVAD);
    mockVADCreation(secondVAD);
    const hook = await renderUseVAD();
    let firstStart!: Promise<void>;
    let stopPromise!: Promise<void>;
    let restartPromise!: Promise<void>;

    act(() => {
      firstStart = hook.result.current.start();
    });
    await waitFor(() => expect(firstVAD.start).toHaveBeenCalledOnce());

    act(() => {
      stopPromise = hook.result.current.stop();
      restartPromise = hook.result.current.start();
    });

    expect(vadRuntime.create).toHaveBeenCalledOnce();
    expect(secondVAD.start).not.toHaveBeenCalled();

    await act(async () => {
      firstStartGate.resolve(undefined);
      await Promise.all([firstStart, stopPromise, restartPromise]);
    });

    expect(firstVAD.pause).toHaveBeenCalledOnce();
    expect(firstVAD.destroy).toHaveBeenCalledOnce();
    expect(secondVAD.start).toHaveBeenCalledOnce();
    expect(hook.result.current.isListening).toBe(true);

    await act(async () => hook.result.current.stop());
  });

  it('reports, rejects, and recovers when startOnLoad fails', async () => {
    const creationError = new Error('Microphone permission denied');
    const failedVAD = createFakeVAD();
    const recoveredVAD = createFakeVAD();
    failedVAD.start.mockRejectedValue(creationError);
    mockVADCreation(failedVAD);
    mockVADCreation(recoveredVAD);
    const hook = await renderUseVAD();
    let caughtError: unknown;

    await act(async () => {
      try {
        await hook.result.current.start();
      } catch (error) {
        caughtError = error;
      }
    });

    expect(caughtError).toBe(creationError);
    expect(hook.result.current.vadError).toBe('Microphone permission denied');
    expect(hook.result.current.isListening).toBe(false);
    expect(hook.result.current.isSpeaking).toBe(false);
    expect(failedVAD.start).toHaveBeenCalledOnce();

    await act(async () => hook.result.current.start());

    expect(vadRuntime.create).toHaveBeenCalledTimes(2);
    expect(recoveredVAD.start).toHaveBeenCalledOnce();
    expect(hook.result.current.isListening).toBe(true);

    await act(async () => hook.result.current.stop());
  });

  it('ignores callbacks from a stopped generation after restart', async () => {
    const firstVAD = createFakeVAD();
    const secondVAD = createFakeVAD();
    const onSpeechStart = vi.fn();
    const onSpeechEnd = vi.fn();
    mockVADCreation(firstVAD);
    mockVADCreation(secondVAD);
    const hook = await renderUseVAD({ onSpeechStart, onSpeechEnd });

    await act(async () => hook.result.current.start());
    const firstOptions = creationOptions(0);
    await act(async () => hook.result.current.stop());
    await act(async () => hook.result.current.start());
    const secondOptions = creationOptions(1);

    act(() => secondOptions.onSpeechStart());

    expect(hook.result.current.isSpeaking).toBe(true);
    expect(onSpeechStart).toHaveBeenCalledOnce();

    act(() => {
      firstOptions.onSpeechStart();
      firstOptions.onSpeechEnd(new Float32Array([0.25]));
      firstOptions.onVADMisfire();
    });

    expect(hook.result.current.isSpeaking).toBe(true);
    expect(onSpeechStart).toHaveBeenCalledOnce();
    expect(onSpeechEnd).not.toHaveBeenCalled();

    await act(async () => hook.result.current.stop());
  });
});

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { usePCMCapture } from '../../src/hooks/usePCMCapture';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function installSuccessfulCapture() {
  const stopTracks = [vi.fn(), vi.fn()];
  const closeContext = vi.fn(async () => undefined);
  const disconnectSource = vi.fn();
  const disconnectProcessor = vi.fn();
  const source = {
    connect: vi.fn(),
    disconnect: disconnectSource,
  };
  const processor = {
    connect: vi.fn(),
    disconnect: disconnectProcessor,
    onaudioprocess: null as ((event: AudioProcessingEvent) => void) | null,
  };

  class MockAudioContext {
    destination = {};
    close = closeContext;
    createMediaStreamSource = vi.fn(() => source);
    createScriptProcessor = vi.fn(() => processor);
  }

  vi.stubGlobal('AudioContext', MockAudioContext);
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => stopTracks.map((stop) => ({ stop })),
      })),
    },
  });

  return {
    closeContext,
    disconnectProcessor,
    disconnectSource,
    processor,
    stopTracks,
  };
}

describe('usePCMCapture setup failure', () => {
  it('reports and rejects a microphone access failure', async () => {
    const accessError = new Error('Microphone permission denied');
    const getUserMedia = vi.fn().mockRejectedValue(accessError);
    const onError = vi.fn();
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getUserMedia },
    });

    const hook = renderHook(() =>
      usePCMCapture({
        onAudioData: vi.fn(),
        onError,
      }),
    );

    await act(async () => {
      await expect(hook.result.current.start()).rejects.toBe(accessError);
    });

    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
    expect(hook.result.current.isCapturing).toBe(false);

    hook.unmount();
  });

  it.each(['audio-context', 'source', 'processor', 'source-connect', 'processor-connect'] as const)(
    'cleans partial microphone setup after a %s failure',
    async (failureStage) => {
      const setupError = new Error(`PCM ${failureStage} setup failed`);
      const stopTrack = vi.fn();
      const closeContext = vi.fn(async () => undefined);
      const disconnectSource = vi.fn();
      const disconnectProcessor = vi.fn();
      const source = {
        connect: vi.fn(() => {
          if (failureStage === 'source-connect') throw setupError;
        }),
        disconnect: disconnectSource,
      };
      const processor = {
        connect: vi.fn(() => {
          if (failureStage === 'processor-connect') throw setupError;
        }),
        disconnect: disconnectProcessor,
        onaudioprocess: null,
      };
      class MockAudioContext {
        destination = {};
        close = closeContext;

        constructor() {
          if (failureStage === 'audio-context') throw setupError;
        }

        createMediaStreamSource() {
          if (failureStage === 'source') throw setupError;
          return source;
        }

        createScriptProcessor() {
          if (failureStage === 'processor') throw setupError;
          return processor;
        }
      }
      vi.stubGlobal('AudioContext', MockAudioContext);
      vi.stubGlobal('navigator', {
        ...navigator,
        mediaDevices: {
          getUserMedia: vi.fn(async () => ({
            getTracks: () => [{ stop: stopTrack }],
          })),
        },
      });

      const hook = renderHook(() =>
        usePCMCapture({
          onAudioData: vi.fn(),
          onError: vi.fn(),
        }),
      );

      await act(async () => {
        await expect(hook.result.current.start()).rejects.toBe(setupError);
      });

      expect(stopTrack).toHaveBeenCalledOnce();
      if (failureStage !== 'audio-context') {
        expect(closeContext).toHaveBeenCalledOnce();
      }
      if (!['audio-context', 'source'].includes(failureStage)) {
        expect(disconnectSource).toHaveBeenCalledOnce();
      }
      if (failureStage === 'source-connect' || failureStage === 'processor-connect') {
        expect(disconnectProcessor).toHaveBeenCalledOnce();
      }
      expect(hook.result.current.isCapturing).toBe(false);
      hook.unmount();
    },
  );

  it('flushes once and releases every resource when capture stops', async () => {
    vi.useFakeTimers();
    const capture = installSuccessfulCapture();
    const onAudioData = vi.fn();
    const hook = renderHook(() => usePCMCapture({ onAudioData }));

    await act(async () => {
      await hook.result.current.start();
    });
    capture.processor.onaudioprocess?.({
      inputBuffer: {
        getChannelData: () => new Float32Array([0.25, -0.25]),
      },
    } as unknown as AudioProcessingEvent);

    act(() => {
      hook.result.current.stop();
    });

    expect(onAudioData).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(capture.processor.onaudioprocess).toBeNull();
    expect(capture.disconnectProcessor).toHaveBeenCalledOnce();
    expect(capture.disconnectSource).toHaveBeenCalledOnce();
    capture.stopTracks.forEach((stopTrack) => expect(stopTrack).toHaveBeenCalledOnce());
    expect(capture.closeContext).toHaveBeenCalledOnce();
    expect(hook.result.current.isCapturing).toBe(false);

    act(() => {
      hook.result.current.stop();
    });
    expect(onAudioData).toHaveBeenCalledOnce();
    hook.unmount();
  });

  it('releases every resource when the final audio callback throws', async () => {
    vi.useFakeTimers();
    const capture = installSuccessfulCapture();
    const callbackError = new Error('Final audio delivery failed');
    const onAudioData = vi.fn(() => {
      throw callbackError;
    });
    const onError = vi.fn();
    const hook = renderHook(() => usePCMCapture({ onAudioData, onError }));

    await act(async () => {
      await hook.result.current.start();
    });
    capture.processor.onaudioprocess?.({
      inputBuffer: {
        getChannelData: () => new Float32Array([0.5]),
      },
    } as unknown as AudioProcessingEvent);

    expect(() => {
      act(() => {
        hook.result.current.stop();
      });
    }).not.toThrow();

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Failed to send the final audio segment' }),
    );
    expect(vi.getTimerCount()).toBe(0);
    expect(capture.processor.onaudioprocess).toBeNull();
    expect(capture.disconnectProcessor).toHaveBeenCalledOnce();
    expect(capture.disconnectSource).toHaveBeenCalledOnce();
    capture.stopTracks.forEach((stopTrack) => expect(stopTrack).toHaveBeenCalledOnce());
    expect(capture.closeContext).toHaveBeenCalledOnce();
    expect(hook.result.current.isCapturing).toBe(false);
    hook.unmount();
  });
});

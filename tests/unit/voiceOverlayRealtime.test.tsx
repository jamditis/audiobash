import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import VoiceOverlay from '../../src/components/VoiceOverlay';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function stubWorkingAudioContext() {
  class MockAudioContext {
    close = vi.fn(async () => undefined);
    createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }));
    createAnalyser = vi.fn(() => ({ fftSize: 0 }));
  }
  vi.stubGlobal('AudioContext', MockAudioContext);
}

const realtimeRuntime = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
  commit: vi.fn(),
  options: null as null | {
    onError: (error: Error) => void;
    onSessionEnd?: () => void;
  },
}));

const feedbackRuntime = vi.hoisted(() => ({
  playStart: vi.fn(),
  playStop: vi.fn(),
  playSuccess: vi.fn(),
  playError: vi.fn(),
}));

const shortcutRuntime = vi.hoisted(() => ({
  cancelRecording: null as null | (() => void),
}));

vi.mock('../../src/hooks/useElevenLabsRealtime', () => ({
  useElevenLabsRealtime: (options: NonNullable<typeof realtimeRuntime.options>) => {
    realtimeRuntime.options = options;
    return {
      ...realtimeRuntime,
      isConnected: false,
      isListening: false,
      error: null,
    };
  },
}));

vi.mock('../../src/hooks/useVAD', () => ({
  useVAD: () => ({
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    isListening: false,
    isSpeaking: false,
    vadError: null,
  }),
}));

vi.mock('../../src/utils/audioFeedback', () => ({
  audioFeedback: feedbackRuntime,
}));

describe('voice overlay real-time setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtimeRuntime.options = null;
    shortcutRuntime.cancelRecording = null;
    localStorage.setItem('audiobash-model', 'elevenlabs-scribe-realtime');
    localStorage.setItem('audiobash-recording-mode', 'manual');
    realtimeRuntime.start.mockRejectedValue(new Error('Real-time setup failed'));
    window.requestAnimationFrame = vi.fn(() => 1);
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null);
    window.electron.getApiKey = vi.fn(async (provider) =>
      provider === 'elevenlabs' ? 'configured-test-key' : '',
    );
    window.electron.onToggleRecording = vi.fn(() => vi.fn());
    window.electron.onCancelRecording = vi.fn((handler) => {
      shortcutRuntime.cancelRecording = handler;
      return vi.fn();
    });
    navigator.mediaDevices.getUserMedia = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not enter recording state after real-time setup rejects', async () => {
    const setIsRecording = vi.fn();
    const { container } = render(
      <VoiceOverlay
        isOpen
        isRecording={false}
        setIsRecording={setIsRecording}
        onTranscript={vi.fn()}
        transcript=""
        onClose={vi.fn()}
        isPinned
        setIsPinned={vi.fn()}
        activeTabId="tab-1"
        mode="raw"
        setMode={vi.fn()}
      />,
    );

    const microphoneButton = container.querySelector('button.w-14');
    expect(microphoneButton).toBeInstanceOf(HTMLButtonElement);
    await waitFor(() => expect(microphoneButton).not.toBeDisabled());
    fireEvent.click(microphoneButton as HTMLButtonElement);

    await waitFor(() =>
      expect(screen.getByText('Failed to start recording: Real-time setup failed')).toBeVisible(),
    );
    expect(realtimeRuntime.start).toHaveBeenCalledOnce();
    expect(setIsRecording).not.toHaveBeenCalledWith(true);
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(feedbackRuntime.playStart).not.toHaveBeenCalled();
    expect(feedbackRuntime.playError).toHaveBeenCalledOnce();
  });

  it('does not enter recording state when another start owns the real-time session', async () => {
    realtimeRuntime.start.mockResolvedValue(false);
    const setIsRecording = vi.fn();
    const { container } = render(
      <VoiceOverlay
        isOpen
        isRecording={false}
        setIsRecording={setIsRecording}
        onTranscript={vi.fn()}
        transcript=""
        onClose={vi.fn()}
        isPinned
        setIsPinned={vi.fn()}
        activeTabId="tab-1"
        mode="raw"
        setMode={vi.fn()}
      />,
    );

    const microphoneButton = container.querySelector('button.w-14') as HTMLButtonElement;
    await waitFor(() => expect(microphoneButton).not.toBeDisabled());
    fireEvent.click(microphoneButton);

    await waitFor(() => expect(realtimeRuntime.start).toHaveBeenCalledOnce());
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(setIsRecording).not.toHaveBeenCalledWith(true);
    expect(feedbackRuntime.playStart).not.toHaveBeenCalled();
    expect(feedbackRuntime.playError).not.toHaveBeenCalled();
  });

  it('closes the visualization stream after an active real-time error', async () => {
    realtimeRuntime.start.mockResolvedValue(true);
    const stopTrack = vi.fn();
    const closeContext = vi.fn(async () => undefined);
    class MockAudioContext {
      close = closeContext;
      createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }));
      createAnalyser = vi.fn(() => ({ fftSize: 0 }));
    }
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue({
      getTracks: () => [{ stop: stopTrack }],
    } as unknown as MediaStream);

    const { container } = render(
      <VoiceOverlay
        isOpen
        isRecording={false}
        setIsRecording={vi.fn()}
        onTranscript={vi.fn()}
        transcript=""
        onClose={vi.fn()}
        isPinned
        setIsPinned={vi.fn()}
        activeTabId="tab-1"
        mode="raw"
        setMode={vi.fn()}
      />,
    );

    const microphoneButton = container.querySelector('button.w-14') as HTMLButtonElement;
    await waitFor(() => expect(microphoneButton).not.toBeDisabled());
    fireEvent.click(microphoneButton);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce());

    act(() => realtimeRuntime.options?.onError(new Error('Active server error')));

    await waitFor(() => expect(stopTrack).toHaveBeenCalledOnce());
    expect(closeContext).toHaveBeenCalledOnce();
    expect(feedbackRuntime.playError).toHaveBeenCalledOnce();
  });

  it('stops the microphone even when AudioContext close throws', async () => {
    realtimeRuntime.start.mockResolvedValue(true);
    const stopTrack = vi.fn();
    class ThrowingAudioContext {
      close = vi.fn(() => {
        throw new Error('AudioContext close failed');
      });
      createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }));
      createAnalyser = vi.fn(() => ({ fftSize: 0 }));
    }
    vi.stubGlobal('AudioContext', ThrowingAudioContext);
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue({
      getTracks: () => [{ stop: stopTrack }],
    } as unknown as MediaStream);

    const { container } = render(
      <VoiceOverlay
        isOpen
        isRecording={false}
        setIsRecording={vi.fn()}
        onTranscript={vi.fn()}
        transcript=""
        onClose={vi.fn()}
        isPinned
        setIsPinned={vi.fn()}
        activeTabId="tab-1"
        mode="raw"
        setMode={vi.fn()}
      />,
    );

    const microphoneButton = container.querySelector('button.w-14') as HTMLButtonElement;
    await waitFor(() => expect(microphoneButton).not.toBeDisabled());
    fireEvent.click(microphoneButton);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce());

    expect(() => {
      act(() => realtimeRuntime.options?.onError(new Error('Active server error')));
    }).not.toThrow();
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it('cancels real-time capture when visualization setup fails', async () => {
    realtimeRuntime.start.mockResolvedValue(true);
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(
      new Error('Visualization microphone failed'),
    );
    const setIsRecording = vi.fn();
    const { container } = render(
      <VoiceOverlay
        isOpen
        isRecording={false}
        setIsRecording={setIsRecording}
        onTranscript={vi.fn()}
        transcript=""
        onClose={vi.fn()}
        isPinned
        setIsPinned={vi.fn()}
        activeTabId="tab-1"
        mode="raw"
        setMode={vi.fn()}
      />,
    );

    const microphoneButton = container.querySelector('button.w-14') as HTMLButtonElement;
    await waitFor(() => expect(microphoneButton).not.toBeDisabled());
    fireEvent.click(microphoneButton);

    await waitFor(() =>
      expect(
        screen.getByText('Failed to start recording: Visualization microphone failed'),
      ).toBeVisible(),
    );
    expect(realtimeRuntime.cancel).toHaveBeenCalledOnce();
    expect(setIsRecording).not.toHaveBeenCalledWith(true);
    expect(feedbackRuntime.playStart).not.toHaveBeenCalled();
    expect(feedbackRuntime.playError).toHaveBeenCalledOnce();
  });

  it('closes the visualization stream when the overlay unmounts', async () => {
    realtimeRuntime.start.mockResolvedValue(true);
    const stopTrack = vi.fn();
    const closeContext = vi.fn(async () => undefined);
    class MockAudioContext {
      close = closeContext;
      createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }));
      createAnalyser = vi.fn(() => ({ fftSize: 0 }));
    }
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue({
      getTracks: () => [{ stop: stopTrack }],
    } as unknown as MediaStream);

    const { container, unmount } = render(
      <VoiceOverlay
        isOpen
        isRecording={false}
        setIsRecording={vi.fn()}
        onTranscript={vi.fn()}
        transcript=""
        onClose={vi.fn()}
        isPinned
        setIsPinned={vi.fn()}
        activeTabId="tab-1"
        mode="raw"
        setMode={vi.fn()}
      />,
    );

    const microphoneButton = container.querySelector('button.w-14') as HTMLButtonElement;
    await waitFor(() => expect(microphoneButton).not.toBeDisabled());
    fireEvent.click(microphoneButton);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce());

    unmount();

    expect(stopTrack).toHaveBeenCalledOnce();
    expect(closeContext).toHaveBeenCalledOnce();
  });

  it('stops a visualization stream that resolves after a server error', async () => {
    realtimeRuntime.start.mockResolvedValue(true);
    stubWorkingAudioContext();
    const streamGate = createDeferred<MediaStream>();
    const stopTrack = vi.fn();
    const setIsRecording = vi.fn();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(streamGate.promise);

    const { container } = render(
      <VoiceOverlay
        isOpen
        isRecording={false}
        setIsRecording={setIsRecording}
        onTranscript={vi.fn()}
        transcript=""
        onClose={vi.fn()}
        isPinned
        setIsPinned={vi.fn()}
        activeTabId="tab-1"
        mode="raw"
        setMode={vi.fn()}
      />,
    );

    const microphoneButton = container.querySelector('button.w-14') as HTMLButtonElement;
    await waitFor(() => expect(microphoneButton).not.toBeDisabled());
    fireEvent.click(microphoneButton);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce());
    act(() => realtimeRuntime.options?.onError(new Error('Active server error')));

    await act(async () => {
      streamGate.resolve({ getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream);
      await streamGate.promise;
    });

    await waitFor(() => expect(stopTrack).toHaveBeenCalledOnce());
    expect(setIsRecording).not.toHaveBeenCalledWith(true);
    expect(feedbackRuntime.playStart).not.toHaveBeenCalled();
  });

  it('stops a late visualization stream after pending start cancellation', async () => {
    realtimeRuntime.start.mockResolvedValue(true);
    stubWorkingAudioContext();
    const streamGate = createDeferred<MediaStream>();
    const stopTrack = vi.fn();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(streamGate.promise);

    const { container } = render(
      <VoiceOverlay
        isOpen
        isRecording={false}
        setIsRecording={vi.fn()}
        onTranscript={vi.fn()}
        transcript=""
        onClose={vi.fn()}
        isPinned
        setIsPinned={vi.fn()}
        activeTabId="tab-1"
        mode="raw"
        setMode={vi.fn()}
      />,
    );

    const microphoneButton = container.querySelector('button.w-14') as HTMLButtonElement;
    await waitFor(() => expect(microphoneButton).not.toBeDisabled());
    fireEvent.click(microphoneButton);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce());
    act(() => shortcutRuntime.cancelRecording?.());

    await act(async () => {
      streamGate.resolve({ getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream);
      await streamGate.promise;
    });

    await waitFor(() => expect(stopTrack).toHaveBeenCalledOnce());
    expect(realtimeRuntime.cancel).toHaveBeenCalledOnce();
    expect(feedbackRuntime.playStart).not.toHaveBeenCalled();
  });

  it('lets only one start own a pending real-time setup', async () => {
    const startGate = createDeferred<boolean>();
    realtimeRuntime.start.mockReturnValue(startGate.promise);
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue({
      getTracks: () => [],
    } as unknown as MediaStream);

    const { container } = render(
      <VoiceOverlay
        isOpen
        isRecording={false}
        setIsRecording={vi.fn()}
        onTranscript={vi.fn()}
        transcript=""
        onClose={vi.fn()}
        isPinned
        setIsPinned={vi.fn()}
        activeTabId="tab-1"
        mode="raw"
        setMode={vi.fn()}
      />,
    );

    const microphoneButton = container.querySelector('button.w-14') as HTMLButtonElement;
    await waitFor(() => expect(microphoneButton).not.toBeDisabled());
    fireEvent.click(microphoneButton);
    fireEvent.click(microphoneButton);

    expect(realtimeRuntime.start).toHaveBeenCalledOnce();
    await act(async () => {
      startGate.resolve(false);
      await startGate.promise;
    });
  });

  it('does not let a stale failed start clean the replacement stream', async () => {
    realtimeRuntime.start.mockResolvedValue(true);
    const firstStreamGate = createDeferred<MediaStream>();
    const replacementStop = vi.fn();
    const closeContexts: Array<ReturnType<typeof vi.fn>> = [];
    class MockAudioContext {
      close = vi.fn(async () => undefined);
      createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }));
      createAnalyser = vi.fn(() => ({ fftSize: 0 }));

      constructor() {
        closeContexts.push(this.close);
      }
    }
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.mocked(navigator.mediaDevices.getUserMedia)
      .mockReturnValueOnce(firstStreamGate.promise)
      .mockResolvedValueOnce({
        getTracks: () => [{ stop: replacementStop }],
      } as unknown as MediaStream);

    const { container } = render(
      <VoiceOverlay
        isOpen
        isRecording={false}
        setIsRecording={vi.fn()}
        onTranscript={vi.fn()}
        transcript=""
        onClose={vi.fn()}
        isPinned
        setIsPinned={vi.fn()}
        activeTabId="tab-1"
        mode="raw"
        setMode={vi.fn()}
      />,
    );

    const microphoneButton = container.querySelector('button.w-14') as HTMLButtonElement;
    await waitFor(() => expect(microphoneButton).not.toBeDisabled());
    fireEvent.click(microphoneButton);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce());
    act(() => shortcutRuntime.cancelRecording?.());

    fireEvent.click(microphoneButton);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2));
    expect(closeContexts).toHaveLength(1);

    await act(async () => {
      firstStreamGate.reject(new Error('Stale microphone failure'));
      await firstStreamGate.promise.catch(() => undefined);
    });

    expect(replacementStop).not.toHaveBeenCalled();
    expect(closeContexts[0]).not.toHaveBeenCalled();
  });
});

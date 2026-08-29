import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ElevenLabsRealtimeConfig,
  ElevenLabsRealtimeService,
} from '../../src/services/elevenLabsRealtimeService';

const logRuntime = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../src/utils/logger', () => ({
  transcriptionLog: logRuntime,
}));

type PromiseOutcome<T> =
  | { status: 'pending' }
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; reason: unknown };

interface CloseOptions {
  code?: number;
  reason?: string;
  wasClean?: boolean;
}

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: MockWebSocket[] = [];
  static constructorError: Error | null = null;

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  send = vi.fn();
  close = vi.fn((code = 1000, reason = '') => {
    this.emitClose({ code, reason, wasClean: code === 1000 });
  });

  constructor(url: string) {
    if (MockWebSocket.constructorError) {
      throw MockWebSocket.constructorError;
    }
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  emitOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  emitError(event: Event = new Event('error')): void {
    this.onerror?.(event);
  }

  emitMessage(message: Record<string, unknown>): void {
    this.emitRawMessage(JSON.stringify(message));
  }

  emitRawMessage(data: string): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  emitClose({
    code = 1006,
    reason = 'connection failed',
    wasClean = false,
  }: CloseOptions = {}): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason, wasClean } as CloseEvent);
  }
}

function createConfig(overrides: Partial<ElevenLabsRealtimeConfig> = {}): ElevenLabsRealtimeConfig {
  return {
    apiKey: 'test-api-key',
    onFinalTranscript: vi.fn(),
    onError: vi.fn(),
    onSessionStart: vi.fn(),
    onSessionEnd: vi.fn(),
    ...overrides,
  };
}

function observePromise<T>(promise: Promise<T>): () => PromiseOutcome<T> {
  let outcome: PromiseOutcome<T> = { status: 'pending' };

  void promise.then(
    (value) => {
      outcome = { status: 'fulfilled', value };
    },
    (reason: unknown) => {
      outcome = { status: 'rejected', reason };
    },
  );

  return () => outcome;
}

async function flushPromises(): Promise<void> {
  for (let step = 0; step < 8; step += 1) {
    await Promise.resolve();
  }
}

function socket(index: number): MockWebSocket {
  const instance = MockWebSocket.instances[index];
  if (!instance) {
    throw new Error(`Expected WebSocket instance ${index}`);
  }
  return instance;
}

function observableCalls(mock: ReturnType<typeof vi.fn>): string {
  return mock.mock.calls
    .flat()
    .map((value) =>
      value instanceof Error ? `${value.name}: ${value.message}` : JSON.stringify(value),
    )
    .join('\n');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  MockWebSocket.instances = [];
  MockWebSocket.constructorError = null;
  vi.stubGlobal('WebSocket', MockWebSocket);
});

afterEach(() => {
  const pendingTimerCount = vi.getTimerCount();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  expect(pendingTimerCount).toBe(0);
});

describe('ElevenLabsRealtimeService setup lifecycle', () => {
  it('retries when the socket reports an error before it opens', async () => {
    const service = new ElevenLabsRealtimeService(createConfig());
    const outcome = observePromise(service.connect());

    socket(0).emitError();
    await vi.advanceTimersByTimeAsync(999);
    expect(MockWebSocket.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances).toHaveLength(2);
    socket(1).emitOpen();
    await flushPromises();

    expect(outcome()).toEqual({ status: 'fulfilled', value: undefined });
  });

  it('retries when the socket closes cleanly before it opens', async () => {
    const service = new ElevenLabsRealtimeService(createConfig());
    const outcome = observePromise(service.connect());

    socket(0).emitClose({ code: 1000, reason: 'closed during setup', wasClean: true });
    await vi.advanceTimersByTimeAsync(1000);
    socket(1).emitOpen();
    await flushPromises();

    expect(outcome()).toEqual({ status: 'fulfilled', value: undefined });
  });

  it('keeps repeated connect calls pending on the same setup operation', async () => {
    const service = new ElevenLabsRealtimeService(createConfig());
    const firstOutcome = observePromise(service.connect());
    const secondOutcome = observePromise(service.connect());

    await flushPromises();

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(firstOutcome()).toEqual({ status: 'pending' });
    expect(secondOutcome()).toEqual({ status: 'pending' });

    socket(0).emitOpen();
    await flushPromises();

    expect(firstOutcome()).toEqual({ status: 'fulfilled', value: undefined });
    expect(secondOutcome()).toEqual({ status: 'fulfilled', value: undefined });
  });

  it('reconnects when the first socket closes immediately after opening', async () => {
    const service = new ElevenLabsRealtimeService(createConfig());
    const outcome = observePromise(service.connect());

    socket(0).emitOpen();
    socket(0).emitClose();
    await flushPromises();

    expect(outcome()).toEqual({ status: 'fulfilled', value: undefined });
    expect(MockWebSocket.instances).toHaveLength(2);

    socket(1).emitOpen();
    await flushPromises();

    expect(service.isConnected).toBe(true);
  });

  it('reports and ends an active session when automatic reconnect is exhausted', async () => {
    const onError = vi.fn();
    const onSessionEnd = vi.fn();
    const service = new ElevenLabsRealtimeService(createConfig({ onError, onSessionEnd }));
    const connection = service.connect();
    socket(0).emitOpen();
    await connection;

    socket(0).emitClose({ code: 1011, wasClean: false });
    await flushPromises();
    socket(1).emitError();
    await vi.advanceTimersByTimeAsync(1_000);
    socket(2).emitError();
    await vi.advanceTimersByTimeAsync(2_000);
    socket(3).emitError();
    await flushPromises();

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'ElevenLabs real-time setup failed',
        code: 'ELEVENLABS_REALTIME_SETUP_FAILED',
      }),
    );
    expect(onSessionEnd).toHaveBeenCalledOnce();
    expect(service.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects and removes setup work when disconnect is called before open', async () => {
    const onError = vi.fn();
    const service = new ElevenLabsRealtimeService(createConfig({ onError }));
    const outcome = observePromise(service.connect());

    service.disconnect();
    await flushPromises();

    expect(socket(0).close).toHaveBeenCalledWith(1000, 'User disconnect');
    expect(outcome()).toEqual({
      status: 'rejected',
      reason: expect.any(Error),
    });
    expect(onError).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses at most three setup attempts with cancelable one-second and two-second delays', async () => {
    const onError = vi.fn();
    const onSessionEnd = vi.fn();
    const service = new ElevenLabsRealtimeService(createConfig({ onError, onSessionEnd }));
    const outcome = observePromise(service.connect());

    socket(0).emitClose();
    await vi.advanceTimersByTimeAsync(999);
    expect(MockWebSocket.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances).toHaveLength(2);

    socket(1).emitClose();
    await vi.advanceTimersByTimeAsync(1999);
    expect(MockWebSocket.instances).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances).toHaveLength(3);

    socket(2).emitClose();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(MockWebSocket.instances).toHaveLength(3);
    expect(outcome()).toEqual({
      status: 'rejected',
      reason: expect.any(Error),
    });
    expect(onError).not.toHaveBeenCalled();
    expect(onSessionEnd).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not reconnect when disconnect cancels a pending retry delay', async () => {
    const onError = vi.fn();
    const service = new ElevenLabsRealtimeService(createConfig({ onError }));
    const outcome = observePromise(service.connect());

    socket(0).emitClose();
    await vi.advanceTimersByTimeAsync(500);
    service.disconnect();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(outcome()).toEqual({
      status: 'rejected',
      reason: expect.any(Error),
    });
    expect(onError).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores events from a failed socket after its replacement starts', async () => {
    const onError = vi.fn();
    const onSessionEnd = vi.fn();
    const service = new ElevenLabsRealtimeService(createConfig({ onError, onSessionEnd }));
    const outcome = observePromise(service.connect());

    socket(0).emitClose();
    await vi.advanceTimersByTimeAsync(1000);
    expect(MockWebSocket.instances).toHaveLength(2);

    socket(0).emitOpen();
    socket(0).emitError();
    socket(0).emitClose();
    await flushPromises();

    expect(outcome()).toEqual({ status: 'pending' });
    expect(onError).not.toHaveBeenCalled();
    expect(onSessionEnd).not.toHaveBeenCalled();

    socket(1).emitOpen();
    await flushPromises();

    expect(outcome()).toEqual({ status: 'fulfilled', value: undefined });
    expect(service.isConnected).toBe(true);
  });

  it('rejects exhausted setup without reporting an active-session error', async () => {
    const onError = vi.fn();
    const onSessionEnd = vi.fn();
    const service = new ElevenLabsRealtimeService(createConfig({ onError, onSessionEnd }));

    const outcome = observePromise(service.connect());
    socket(0).emitClose();
    await vi.advanceTimersByTimeAsync(1000);
    socket(1).emitClose();
    await vi.advanceTimersByTimeAsync(2000);
    socket(2).emitClose();
    await flushPromises();

    socket(0).emitError();
    socket(1).emitClose();
    socket(2).emitError();
    await vi.runAllTimersAsync();

    expect(outcome()).toEqual({
      status: 'rejected',
      reason: expect.any(Error),
    });
    expect(onError).not.toHaveBeenCalled();
    expect(onSessionEnd).not.toHaveBeenCalled();
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it('keeps the connection error when the unused session error callback would throw', async () => {
    const onError = vi.fn(() => {
      throw new Error('consumer callback failed');
    });
    const onSessionEnd = vi.fn();
    const service = new ElevenLabsRealtimeService(createConfig({ onError, onSessionEnd }));
    const outcome = observePromise(service.connect());

    socket(0).emitError();
    await vi.advanceTimersByTimeAsync(1_000);
    socket(1).emitError();
    await vi.advanceTimersByTimeAsync(2_000);
    socket(2).emitError();
    await flushPromises();

    expect(outcome()).toEqual({
      status: 'rejected',
      reason: expect.objectContaining({
        message: 'ElevenLabs real-time setup failed',
      }),
    });
    expect(onError).not.toHaveBeenCalled();
    expect(onSessionEnd).not.toHaveBeenCalled();
  });

  it('times out each setup attempt and settles after 93 seconds', async () => {
    const onError = vi.fn();
    const onSessionEnd = vi.fn();
    const service = new ElevenLabsRealtimeService(createConfig({ onError, onSessionEnd }));
    const outcome = observePromise(service.connect());

    await vi.advanceTimersByTimeAsync(92_999);
    expect(outcome()).toEqual({ status: 'pending' });

    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();

    expect(MockWebSocket.instances).toHaveLength(3);
    expect(outcome()).toEqual({
      status: 'rejected',
      reason: expect.objectContaining({ message: 'ElevenLabs real-time setup failed' }),
    });
    expect(onError).not.toHaveBeenCalled();
    expect(onSessionEnd).not.toHaveBeenCalled();
  });

  it('treats an active server error as one terminal error and session end', async () => {
    const onError = vi.fn();
    const onSessionEnd = vi.fn();
    const service = new ElevenLabsRealtimeService(createConfig({ onError, onSessionEnd }));
    const connection = service.connect();
    socket(0).emitOpen();
    await connection;

    socket(0).emitMessage({
      message_type: 'error',
      error_type: 'quota_exceeded',
      error_message: 'Quota exceeded',
    });
    socket(0).emitMessage({
      message_type: 'error',
      error_type: 'duplicate',
      error_message: 'Duplicate error',
    });

    expect(onError).toHaveBeenCalledOnce();
    expect(onSessionEnd).toHaveBeenCalledOnce();
    expect(socket(0).close).toHaveBeenCalledOnce();
    expect(service.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('closes the active socket even when the error callback throws', async () => {
    const onError = vi.fn(() => {
      throw new Error('consumer callback failed');
    });
    const onSessionEnd = vi.fn();
    const service = new ElevenLabsRealtimeService(createConfig({ onError, onSessionEnd }));
    const connection = service.connect();
    socket(0).emitOpen();
    await connection;

    socket(0).emitMessage({
      message_type: 'error',
      error_type: 'quota_exceeded',
      error_message: 'Quota exceeded',
    });

    expect(onError).toHaveBeenCalledOnce();
    expect(onSessionEnd).toHaveBeenCalledOnce();
    expect(socket(0).close).toHaveBeenCalledOnce();
    expect(service.isConnected).toBe(false);
  });

  it('does not expose provider text from an active server error', async () => {
    const onError = vi.fn();
    const secret = 'test-api-key';
    const reflectedAudio = 'AAEC/w==';
    const service = new ElevenLabsRealtimeService(createConfig({ onError }));
    const connection = service.connect();
    socket(0).emitOpen();
    await connection;

    socket(0).emitMessage({
      message_type: 'error',
      error_type: 'provider_error',
      error_message: `provider echoed key=${secret} body=${reflectedAudio}`,
    });

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'ElevenLabs real-time transcription failed',
        code: 'ELEVENLABS_REALTIME_ERROR',
      }),
    );
    const observableData = `${observableCalls(onError)}\n${observableCalls(logRuntime.error)}`;
    expect(observableData).not.toContain(secret);
    expect(observableData).not.toContain(reflectedAudio);
  });

  it('does not log a provider-controlled close reason', async () => {
    const secretReason = 'closed with key=test-api-key body=AAEC/w==';
    const service = new ElevenLabsRealtimeService(createConfig());
    const connection = service.connect();
    socket(0).emitOpen();
    await connection;

    socket(0).emitClose({ code: 1011, reason: secretReason, wasClean: false });
    await flushPromises();
    service.disconnect();

    expect(observableCalls(logRuntime.info)).not.toContain(secretReason);
  });

  it('does not log partial transcript text', async () => {
    const privateTranscript = 'private spoken text';
    const service = new ElevenLabsRealtimeService(createConfig());
    const connection = service.connect();
    socket(0).emitOpen();
    await connection;

    socket(0).emitMessage({
      message_type: 'partial_transcript',
      text: privateTranscript,
    });
    service.disconnect();

    expect(observableCalls(logRuntime.debug)).not.toContain(privateTranscript);
  });

  it('does not log data from a malformed server frame', async () => {
    const privateFrame = 'key=sk-secret body=AAEC/w==';
    const service = new ElevenLabsRealtimeService(createConfig());
    const connection = service.connect();
    socket(0).emitOpen();
    await connection;

    socket(0).emitRawMessage(privateFrame);
    service.disconnect();

    expect(observableCalls(logRuntime.error)).not.toContain('key=sk-');
    expect(observableCalls(logRuntime.error)).not.toContain('body=');
  });

  it('does not log an unknown provider-controlled message type', async () => {
    const privateType = 'key=sk-secret body=AAEC/w==';
    const service = new ElevenLabsRealtimeService(createConfig());
    const connection = service.connect();
    socket(0).emitOpen();
    await connection;

    socket(0).emitRawMessage(JSON.stringify({ message_type: privateType }));
    service.disconnect();

    expect(observableCalls(logRuntime.debug)).not.toContain(privateType);
  });

  it('does not log a provider-controlled session ID', async () => {
    const privateSessionId = 'session-key=sk-secret-body=AAEC/w==';
    const service = new ElevenLabsRealtimeService(createConfig());
    const connection = service.connect();
    socket(0).emitOpen();
    await connection;

    socket(0).emitMessage({
      message_type: 'session_started',
      session_id: privateSessionId,
    });
    service.disconnect();

    expect(observableCalls(logRuntime.info)).not.toContain(privateSessionId);
  });

  it('does not log transcript text when the consumer callback throws', async () => {
    const privateTranscript = 'private spoken command';
    const onFinalTranscript = vi.fn((text: string) => {
      throw new Error(text);
    });
    const service = new ElevenLabsRealtimeService(createConfig({ onFinalTranscript }));
    const connection = service.connect();
    socket(0).emitOpen();
    await connection;

    socket(0).emitMessage({
      message_type: 'committed_transcript',
      text: privateTranscript,
    });
    service.disconnect();

    expect(onFinalTranscript).toHaveBeenCalledWith(privateTranscript);
    expect(observableCalls(logRuntime.error)).not.toContain(privateTranscript);
  });

  it('does not log a connected WebSocket error event or its credential URL', async () => {
    const secretUrl = 'wss://example.invalid/?xi-api-key=sk-secret';
    const service = new ElevenLabsRealtimeService(createConfig());
    const connection = service.connect();
    socket(0).emitOpen();
    await connection;

    socket(0).emitError({ target: { url: secretUrl } } as unknown as Event);
    service.disconnect();

    expect(observableCalls(logRuntime.error)).not.toContain(secretUrl);
    expect(observableCalls(logRuntime.error)).not.toContain('sk-secret');
  });

  it('replaces a credential-bearing WebSocket constructor error before rejection', async () => {
    const secret = 'sk-secret-constructor';
    MockWebSocket.constructorError = new Error(
      `Failed to construct WebSocket for wss://example.invalid/?xi-api-key=${secret}`,
    );
    const service = new ElevenLabsRealtimeService(createConfig());
    const outcome = observePromise(service.connect());

    await vi.runAllTimersAsync();
    await flushPromises();

    expect(outcome()).toEqual({
      status: 'rejected',
      reason: expect.objectContaining({
        message: 'ElevenLabs real-time setup failed',
        code: 'ELEVENLABS_REALTIME_SETUP_FAILED',
      }),
    });
    expect(observableCalls(logRuntime.error)).not.toContain(secret);
  });
});

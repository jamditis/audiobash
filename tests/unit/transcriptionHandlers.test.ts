import { createRequire } from 'module';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);

interface HandlerResult {
  success: boolean;
  text?: string;
  error?: string;
  errorCode?: string;
}

type Handler = (_event: unknown, data: Record<string, unknown>) => Promise<HandlerResult>;

interface RegisteredHandlers {
  [channel: string]: Handler;
}

interface StageContext {
  signal: AbortSignal;
  timeoutMs: number;
}

const audioBase64 = Buffer.from([0, 1, 2, 255]).toString('base64');

function loadHandlersModule() {
  return require('../../electron/transcriptionHandlers.cjs') as {
    createTranscriptionRegistry: (options?: { now?: () => number }) => {
      begin: (requestId: string) => AbortController;
      cancel: (requestId: string) => { cancelled: boolean; queued: boolean };
      finish: (requestId: string, controller: AbortController) => void;
    };
    registerTranscriptionHandlers: (dependencies: Record<string, unknown>) => void;
  };
}

function createHarness() {
  const handlers: RegisteredHandlers = {};
  const ipcMain = {
    handle: vi.fn((channel: string, handler: Handler) => {
      handlers[channel] = handler;
    }),
  };

  const stageSignal = new AbortController().signal;
  const runStage = vi.fn(
    async (
      _label: string,
      operation: (context: StageContext) => Promise<unknown>,
      _callerSignal: AbortSignal,
    ) => operation({ signal: stageSignal, timeoutMs: 30_000 }),
  );
  const createRequestBudget = vi.fn(({ signal }: { signal: AbortSignal }) => ({
    runStage: (label: string, operation: (context: StageContext) => Promise<unknown>) =>
      runStage(label, operation, signal),
  }));

  const generateContent = vi.fn(async () => ({ response: { text: () => '  gemini text  ' } }));
  const getGenerativeModel = vi.fn(() => ({ generateContent }));
  const createGeminiClient = vi.fn(() => ({ getGenerativeModel }));

  const openAITranscribe = vi.fn(async () => ({ text: '  whisper text  ' }));
  const openAIComplete = vi.fn(async () => ({
    choices: [{ message: { content: '  shell command  ' } }],
  }));
  const createOpenAIClient = vi.fn(() => ({
    audio: { transcriptions: { create: openAITranscribe } },
    chat: { completions: { create: openAIComplete } },
  }));

  const anthropicMessage = vi.fn(async () => ({
    content: [{ type: 'text', text: '  claude command  ' }],
  }));
  const createAnthropicClient = vi.fn(() => ({
    messages: { create: anthropicMessage },
  }));

  const requestElevenLabs = vi.fn(async () => ({ text: '  eleven text  ' }));
  const getApiKey = vi.fn(async (provider: string) => `${provider}-test-key`);
  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  loadHandlersModule().registerTranscriptionHandlers({
    ipcMain,
    getApiKey,
    log,
    createRequestBudget,
    createGeminiClient,
    createOpenAIClient,
    createAnthropicClient,
    requestElevenLabs,
  });

  return {
    handlers,
    stageSignal,
    runStage,
    createRequestBudget,
    generateContent,
    openAITranscribe,
    openAIComplete,
    anthropicMessage,
    requestElevenLabs,
    getApiKey,
    log,
  };
}

function requestData(overrides: Record<string, unknown> = {}) {
  return {
    requestId: crypto.randomUUID(),
    audioBase64,
    prompt: '',
    modelId: 'openai-whisper',
    ...overrides,
  };
}

describe('main-process transcription handlers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('registers four provider handlers and one cancellation handler', () => {
    const { handlers } = createHarness();

    expect(Object.keys(handlers).sort()).toEqual(
      [
        'cancel-transcription',
        'transcribe-with-anthropic',
        'transcribe-with-elevenlabs',
        'transcribe-with-gemini',
        'transcribe-with-openai',
      ].sort(),
    );
  });

  it('passes the shared attempt signal and timeout to Gemini', async () => {
    const { handlers, createRequestBudget, generateContent, stageSignal } = createHarness();

    const result = await handlers['transcribe-with-gemini'](
      {},
      requestData({ modelId: 'gemini-2.5-flash', prompt: 'Transcribe' }),
    );

    expect(result).toEqual({ success: true, text: 'gemini text' });
    expect(createRequestBudget).toHaveBeenCalledOnce();
    expect(generateContent).toHaveBeenCalledWith(expect.any(Array), {
      signal: stageSignal,
      timeout: 30_000,
    });
  });

  it('disables OpenAI SDK retries for both stages and shares one budget', async () => {
    const {
      handlers,
      createRequestBudget,
      runStage,
      openAITranscribe,
      openAIComplete,
      stageSignal,
    } = createHarness();

    const result = await handlers['transcribe-with-openai'](
      {},
      requestData({ modelId: 'openai-gpt4', prompt: 'Make a command' }),
    );

    expect(result).toEqual({ success: true, text: 'shell command' });
    expect(createRequestBudget).toHaveBeenCalledOnce();
    expect(runStage).toHaveBeenCalledTimes(2);
    expect(openAITranscribe).toHaveBeenCalledWith(expect.any(Object), {
      maxRetries: 0,
      signal: stageSignal,
      timeout: 30_000,
    });
    expect(openAIComplete).toHaveBeenCalledWith(expect.any(Object), {
      maxRetries: 0,
      signal: stageSignal,
      timeout: 30_000,
    });
  });

  it('disables SDK retries for Whisper and Anthropic while sharing one budget', async () => {
    const {
      handlers,
      createRequestBudget,
      runStage,
      openAITranscribe,
      anthropicMessage,
      stageSignal,
    } = createHarness();

    const result = await handlers['transcribe-with-anthropic'](
      {},
      requestData({ modelId: 'claude-haiku', prompt: 'Make a command' }),
    );

    expect(result).toEqual({ success: true, text: 'claude command' });
    expect(createRequestBudget).toHaveBeenCalledOnce();
    expect(runStage).toHaveBeenCalledTimes(2);
    expect(openAITranscribe).toHaveBeenCalledWith(expect.any(Object), {
      maxRetries: 0,
      signal: stageSignal,
      timeout: 30_000,
    });
    expect(anthropicMessage).toHaveBeenCalledWith(expect.any(Object), {
      maxRetries: 0,
      signal: stageSignal,
      timeout: 30_000,
    });
  });

  it('passes a decoded buffer and the attempt signal to the ElevenLabs helper', async () => {
    const { handlers, requestElevenLabs, stageSignal } = createHarness();

    const result = await handlers['transcribe-with-elevenlabs']({}, requestData());

    expect(result).toEqual({ success: true, text: 'eleven text' });
    expect(requestElevenLabs).toHaveBeenCalledWith({
      apiKey: 'elevenlabs-test-key',
      audioBuffer: Buffer.from(audioBase64, 'base64'),
      signal: stageSignal,
    });
  });

  it('cancels a request before provider setup begins', async () => {
    const { handlers, getApiKey } = createHarness();
    const requestId = crypto.randomUUID();

    await handlers['cancel-transcription']({}, { requestId });
    const result = await handlers['transcribe-with-gemini']({}, requestData({ requestId }));

    expect(result).toEqual(
      expect.objectContaining({ success: false, errorCode: 'TRANSCRIPTION_CANCELLED' }),
    );
    expect(getApiKey).not.toHaveBeenCalled();
  });

  it('bounds early cancellation records by count and expiry time', () => {
    let currentTime = 0;
    const registry = loadHandlersModule().createTranscriptionRegistry({
      now: () => currentTime,
    });

    for (let index = 0; index <= 100; index += 1) {
      registry.cancel(`queued-${index}`);
    }

    const evicted = registry.begin('queued-0');
    expect(evicted.signal.aborted).toBe(false);
    registry.finish('queued-0', evicted);

    const newest = registry.begin('queued-100');
    expect(newest.signal.aborted).toBe(true);

    registry.cancel('expires');
    currentTime = 10_001;
    const expired = registry.begin('expires');
    expect(expired.signal.aborted).toBe(false);
    registry.finish('expires', expired);
  });

  it('isolates concurrent requests and cancels only the matching request ID', async () => {
    const { handlers, runStage } = createHarness();
    runStage.mockImplementation(
      (_label, _operation, callerSignal) =>
        new Promise((_, reject) => {
          if (callerSignal.aborted) {
            reject(callerSignal.reason);
            return;
          }
          callerSignal.addEventListener('abort', () => reject(callerSignal.reason), { once: true });
        }),
    );

    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();
    const first = handlers['transcribe-with-gemini']({}, requestData({ requestId: firstId }));
    const second = handlers['transcribe-with-gemini']({}, requestData({ requestId: secondId }));

    await handlers['cancel-transcription']({}, { requestId: firstId });
    await expect(first).resolves.toEqual(
      expect.objectContaining({ success: false, errorCode: 'TRANSCRIPTION_CANCELLED' }),
    );
    expect(second).toBeInstanceOf(Promise);

    await handlers['cancel-transcription']({}, { requestId: secondId });
    await expect(second).resolves.toEqual(
      expect.objectContaining({ success: false, errorCode: 'TRANSCRIPTION_CANCELLED' }),
    );
  });

  it('rejects a duplicate active request ID and releases the ID after settlement', async () => {
    const { handlers, runStage } = createHarness();
    let releaseFirst: ((value: unknown) => void) | undefined;
    runStage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseFirst = resolve;
        }),
    );

    const requestId = crypto.randomUUID();
    const first = handlers['transcribe-with-gemini']({}, requestData({ requestId }));
    const duplicate = await handlers['transcribe-with-gemini']({}, requestData({ requestId }));

    expect(duplicate).toEqual(
      expect.objectContaining({ success: false, errorCode: 'DUPLICATE_REQUEST_ID' }),
    );

    releaseFirst?.({ text: () => 'first' });
    await first;

    const reused = await handlers['transcribe-with-gemini']({}, requestData({ requestId }));
    expect(reused.success).toBe(true);
  });

  it('does not return or log provider-reflected keys and audio data', async () => {
    const { handlers, createRequestBudget, runStage, log } = createHarness();
    const data = requestData();
    const reflectedKey = 'gemini-test-key';
    const reflectedAudio = String(data.audioBase64);
    const providerError = Object.assign(
      new Error(`provider echoed key=${reflectedKey} body=${reflectedAudio}`),
      { status: 401 },
    );
    runStage.mockRejectedValueOnce(providerError);

    const result = await handlers['transcribe-with-gemini']({}, data);
    const budgetOptions = createRequestBudget.mock.calls[0][0] as {
      onRetry: (details: Record<string, unknown>) => void;
    };
    budgetOptions.onRetry({
      attempt: 1,
      delayMs: 1000,
      error: providerError,
      label: 'Gemini transcription',
    });

    const observableData = JSON.stringify({
      result,
      warn: log.warn.mock.calls,
      error: log.error.mock.calls,
    });
    expect(result).toEqual({
      success: false,
      error: 'Gemini API key was rejected',
      errorCode: 'INVALID_API_KEY',
    });
    expect(observableData).not.toContain(reflectedKey);
    expect(observableData).not.toContain(reflectedAudio);
  });

  it('does not expose text when provider errors imitate an internal request error', async () => {
    const { handlers, runStage, log } = createHarness();
    const reflectedKey = 'sk-secret-spoof';
    const reflectedAudio = audioBase64;
    runStage.mockRejectedValueOnce(
      Object.assign(new Error(`provider echoed key=${reflectedKey} body=${reflectedAudio}`), {
        name: 'TranscriptionRequestError',
        code: 'NO_API_KEY',
      }),
    );

    const result = await handlers['transcribe-with-gemini']({}, requestData());
    const observableData = JSON.stringify({ result, error: log.error.mock.calls });

    expect(result).toEqual({
      success: false,
      error: 'A required API key is not configured',
      errorCode: 'NO_API_KEY',
    });
    expect(observableData).not.toContain(reflectedKey);
    expect(observableData).not.toContain(reflectedAudio);
  });
});

'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai').default;
const Anthropic = require('@anthropic-ai/sdk').default;

const { sendElevenLabsRequest } = require('./elevenLabsRequest.cjs');
const { createRequestError, createTranscriptionRequest } = require('./transcriptionRequest.cjs');

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const EARLY_CANCELLATION_TTL_MS = 10_000;
const MAX_EARLY_CANCELLATIONS = 100;
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;
const SAFE_REQUEST_ERROR_CODES = new Set([
  'DUPLICATE_REQUEST_ID',
  'INVALID_AUDIO',
  'INVALID_REQUEST_ID',
  'NO_API_KEY',
  'RATE_LIMIT',
  'TRANSCRIPTION_ATTEMPT_TIMEOUT',
  'TRANSCRIPTION_CANCELLED',
  'TRANSCRIPTION_DEADLINE_EXCEEDED',
]);
const NETWORK_ERROR_CODES = new Set([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETDOWN',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

function validateAudioInput(audioBase64) {
  if (typeof audioBase64 !== 'string') {
    return 'Audio data must be a string';
  }
  if (audioBase64.length === 0) {
    return 'Audio data is empty';
  }

  const audioBuffer = Buffer.from(audioBase64, 'base64');
  if (audioBuffer.length === 0) {
    return 'Audio data is invalid';
  }
  if (audioBuffer.length > MAX_AUDIO_BYTES) {
    return `Audio data exceeds maximum size (${Math.round(audioBuffer.length / 1024 / 1024)}MB > 25MB)`;
  }

  return null;
}

function createTranscriptionRegistry({ now = Date.now } = {}) {
  const activeRequests = new Map();
  const earlyCancellations = new Map();

  function validateRequestId(requestId) {
    if (typeof requestId !== 'string' || !REQUEST_ID_PATTERN.test(requestId)) {
      throw createRequestError(
        'Invalid transcription request ID',
        'INVALID_REQUEST_ID',
        'Transcription',
      );
    }
  }

  function pruneEarlyCancellations() {
    const currentTime = now();
    for (const [requestId, expiresAt] of earlyCancellations) {
      if (expiresAt <= currentTime) {
        earlyCancellations.delete(requestId);
      }
    }
  }

  function rememberEarlyCancellation(requestId) {
    pruneEarlyCancellations();
    earlyCancellations.set(requestId, now() + EARLY_CANCELLATION_TTL_MS);

    while (earlyCancellations.size > MAX_EARLY_CANCELLATIONS) {
      const oldestRequestId = earlyCancellations.keys().next().value;
      earlyCancellations.delete(oldestRequestId);
    }
  }

  function begin(requestId) {
    validateRequestId(requestId);
    pruneEarlyCancellations();

    if (activeRequests.has(requestId)) {
      throw createRequestError(
        'A transcription request with this ID is already active',
        'DUPLICATE_REQUEST_ID',
        'Transcription',
      );
    }

    const controller = new AbortController();
    if (earlyCancellations.delete(requestId)) {
      controller.abort(
        createRequestError('Transcription cancelled', 'TRANSCRIPTION_CANCELLED', 'Transcription'),
      );
      return controller;
    }

    activeRequests.set(requestId, controller);
    return controller;
  }

  function finish(requestId, controller) {
    if (activeRequests.get(requestId) === controller) {
      activeRequests.delete(requestId);
    }
  }

  function cancel(requestId) {
    validateRequestId(requestId);
    const controller = activeRequests.get(requestId);
    if (controller) {
      controller.abort(
        createRequestError('Transcription cancelled', 'TRANSCRIPTION_CANCELLED', 'Transcription'),
      );
      return { cancelled: true, queued: false };
    }

    rememberEarlyCancellation(requestId);
    return { cancelled: false, queued: true };
  }

  return { begin, cancel, finish };
}

function createRateLimiter({ maxRequests = 15, windowMs = 60_000, now = Date.now } = {}) {
  let timestamps = [];

  return {
    check() {
      const currentTime = now();
      timestamps = timestamps.filter((timestamp) => currentTime - timestamp < windowMs);
      if (timestamps.length >= maxRequests) {
        return false;
      }
      timestamps.push(currentTime);
      return true;
    },
  };
}

function errorCode(error) {
  if (
    error?.name === 'TranscriptionRequestError' &&
    typeof error.code === 'string' &&
    SAFE_REQUEST_ERROR_CODES.has(error.code)
  ) {
    return error.code;
  }

  const status = Number(error?.status);
  if (status === 401 || status === 403) return 'INVALID_API_KEY';
  if (status === 429) return 'RATE_LIMIT';
  if (status >= 500 && status <= 599) return 'SERVER_ERROR';

  const providerCode = typeof error?.code === 'string' ? error.code.toUpperCase() : '';
  if (NETWORK_ERROR_CODES.has(providerCode)) return 'NETWORK_ERROR';
  if (typeof error?.message === 'string' && error.message.toLowerCase().includes('fetch failed')) {
    return 'NETWORK_ERROR';
  }
  return 'TRANSCRIPTION_FAILED';
}

function publicErrorMessage(error, provider, code) {
  switch (code) {
    case 'DUPLICATE_REQUEST_ID':
      return 'A transcription request with this ID is already active';
    case 'INVALID_AUDIO':
      return 'Audio data is invalid or exceeds the 25 MB limit';
    case 'INVALID_REQUEST_ID':
      return 'Invalid transcription request ID';
    case 'NO_API_KEY':
      return 'A required API key is not configured';
    case 'INVALID_API_KEY':
      return `${provider} API key was rejected`;
    case 'RATE_LIMIT':
      return 'Rate limit exceeded. Please wait before trying again.';
    case 'SERVER_ERROR':
      return `${provider} service is unavailable. Please try again.`;
    case 'NETWORK_ERROR':
      return `${provider} network request failed. Check your connection and try again.`;
    case 'TRANSCRIPTION_ATTEMPT_TIMEOUT':
    case 'TRANSCRIPTION_DEADLINE_EXCEEDED':
      return `${provider} transcription timed out. Please try again.`;
    case 'TRANSCRIPTION_CANCELLED':
      return 'Transcription cancelled';
    default:
      return `${provider} transcription failed`;
  }
}

function registerTranscriptionHandlers(dependencies) {
  const {
    ipcMain,
    getApiKey,
    log,
    createRequestBudget = createTranscriptionRequest,
    createGeminiClient = (apiKey) => new GoogleGenerativeAI(apiKey),
    createOpenAIClient = (apiKey) => new OpenAI({ apiKey }),
    createAnthropicClient = (apiKey) => new Anthropic({ apiKey }),
    requestElevenLabs = sendElevenLabsRequest,
    rateLimiter = createRateLimiter(),
    registry = createTranscriptionRegistry(),
  } = dependencies;

  const clientCache = {
    gemini: null,
    openai: null,
    anthropic: null,
  };

  function cachedClient(provider, apiKey, factory) {
    const cached = clientCache[provider];
    if (cached?.apiKey === apiKey) {
      return cached.client;
    }

    const client = factory(apiKey);
    clientCache[provider] = { apiKey, client };
    return client;
  }

  function createBudget(signal) {
    return createRequestBudget({
      signal,
      onRetry: ({ attempt, delayMs, error, label }) => {
        const code = errorCode(error);
        log.warn(`${label}: retrying after a transient failure`, {
          attempt,
          delayMs,
          errorCode: code,
        });
      },
    });
  }

  async function getRequiredKey(provider, message) {
    const key = await getApiKey(provider);
    if (!key) {
      throw createRequestError(message, 'NO_API_KEY', provider);
    }
    return key;
  }

  function validateRequest(audioBase64) {
    if (!rateLimiter.check()) {
      throw createRequestError(
        'Rate limit exceeded. Please wait before trying again.',
        'RATE_LIMIT',
        'Transcription',
      );
    }

    const audioError = validateAudioInput(audioBase64);
    if (audioError) {
      throw createRequestError(audioError, 'INVALID_AUDIO', 'Transcription');
    }
  }

  async function runRequest(data, provider, work) {
    let controller;

    try {
      controller = registry.begin(data?.requestId);
      if (controller.signal.aborted) {
        throw controller.signal.reason;
      }

      validateRequest(data?.audioBase64);
      return await work(controller.signal);
    } catch (error) {
      const code = errorCode(error);
      const message = publicErrorMessage(error, provider, code);
      log.error(`${provider} transcription error`, {
        code,
        message,
      });
      return { success: false, error: message, errorCode: code };
    } finally {
      if (controller) {
        registry.finish(data?.requestId, controller);
      }
    }
  }

  ipcMain.handle('cancel-transcription', async (_event, { requestId } = {}) => {
    try {
      return registry.cancel(requestId);
    } catch (error) {
      const code = errorCode(error);
      return {
        cancelled: false,
        queued: false,
        error: publicErrorMessage(error, 'Transcription', code),
      };
    }
  });

  ipcMain.handle('transcribe-with-gemini', async (_event, data) =>
    runRequest(data, 'Gemini', async (signal) => {
      const apiKey = await getRequiredKey('gemini', 'No Gemini API key configured');
      const client = cachedClient('gemini', apiKey, createGeminiClient);
      const geminiModel =
        data.modelId === 'gemini-2.5-flash' ? 'gemini-2.5-flash' : 'gemini-2.0-flash';
      const model = client.getGenerativeModel({ model: geminiModel });
      const request = createBudget(signal);

      log.info(`Transcribing with Gemini (${geminiModel})`);
      const response = await request.runStage(
        'Gemini transcription',
        async ({ signal: attemptSignal, timeoutMs }) => {
          const result = await model.generateContent(
            [
              { text: data.prompt },
              {
                inlineData: {
                  mimeType: 'audio/webm',
                  data: data.audioBase64,
                },
              },
            ],
            { signal: attemptSignal, timeout: timeoutMs },
          );
          return await result.response;
        },
      );

      return { success: true, text: response.text()?.trim() || '' };
    }),
  );

  ipcMain.handle('transcribe-with-openai', async (_event, data) =>
    runRequest(data, 'OpenAI', async (signal) => {
      const apiKey = await getRequiredKey('openai', 'No OpenAI API key configured');
      const client = cachedClient('openai', apiKey, createOpenAIClient);
      const audioBuffer = Buffer.from(data.audioBase64, 'base64');
      const request = createBudget(signal);

      log.info('Transcribing with OpenAI Whisper');
      const transcription = await request.runStage(
        'OpenAI Whisper',
        ({ signal: attemptSignal, timeoutMs }) =>
          client.audio.transcriptions.create(
            {
              file: new File([audioBuffer], 'audio.webm', { type: 'audio/webm' }),
              model: 'whisper-1',
            },
            { maxRetries: 0, signal: attemptSignal, timeout: timeoutMs },
          ),
      );

      let text = transcription.text?.trim() || '';
      if (data.prompt && data.modelId === 'openai-gpt4' && text) {
        log.info('Processing transcription with GPT-4');
        const completion = await request.runStage(
          'OpenAI GPT-4',
          ({ signal: attemptSignal, timeoutMs }) =>
            client.chat.completions.create(
              {
                model: 'gpt-4-turbo-preview',
                messages: [
                  { role: 'system', content: data.prompt },
                  { role: 'user', content: text },
                ],
                max_tokens: 200,
              },
              { maxRetries: 0, signal: attemptSignal, timeout: timeoutMs },
            ),
        );
        text = completion.choices[0]?.message?.content?.trim() || text;
      }

      return { success: true, text };
    }),
  );

  ipcMain.handle('transcribe-with-anthropic', async (_event, data) =>
    runRequest(data, 'Anthropic', async (signal) => {
      const openAIKey = await getRequiredKey(
        'openai',
        'OpenAI API key required for audio transcription with Claude',
      );
      const anthropicKey = await getRequiredKey('anthropic', 'No Anthropic API key configured');
      const openAIClient = cachedClient('openai', openAIKey, createOpenAIClient);
      const anthropicClient = cachedClient('anthropic', anthropicKey, createAnthropicClient);
      const audioBuffer = Buffer.from(data.audioBase64, 'base64');
      const request = createBudget(signal);

      log.info('Transcribing with Whisper and Anthropic');
      const transcription = await request.runStage(
        'Whisper for Anthropic',
        ({ signal: attemptSignal, timeoutMs }) =>
          openAIClient.audio.transcriptions.create(
            {
              file: new File([audioBuffer], 'audio.webm', { type: 'audio/webm' }),
              model: 'whisper-1',
            },
            { maxRetries: 0, signal: attemptSignal, timeout: timeoutMs },
          ),
      );

      let text = transcription.text?.trim() || '';
      if (data.prompt && text) {
        const model =
          data.modelId === 'claude-haiku' ? 'claude-3-haiku-20240307' : 'claude-sonnet-4-20250514';
        const message = await request.runStage(
          'Anthropic processing',
          ({ signal: attemptSignal, timeoutMs }) =>
            anthropicClient.messages.create(
              {
                model,
                max_tokens: 200,
                messages: [{ role: 'user', content: `${data.prompt}\n\n${text}` }],
              },
              { maxRetries: 0, signal: attemptSignal, timeout: timeoutMs },
            ),
        );

        const content = message.content[0];
        if (content?.type === 'text') {
          text = content.text.trim();
        }
      }

      return { success: true, text };
    }),
  );

  ipcMain.handle('transcribe-with-elevenlabs', async (_event, data) =>
    runRequest(data, 'ElevenLabs', async (signal) => {
      const apiKey = await getRequiredKey('elevenlabs', 'No ElevenLabs API key configured');
      const audioBuffer = Buffer.from(data.audioBase64, 'base64');
      const request = createBudget(signal);

      log.info('Transcribing with ElevenLabs Scribe');
      const response = await request.runStage('ElevenLabs Scribe', ({ signal: attemptSignal }) =>
        requestElevenLabs({ apiKey, audioBuffer, signal: attemptSignal }),
      );

      return { success: true, text: response.text?.trim() || '' };
    }),
  );
}

module.exports = {
  createRateLimiter,
  createTranscriptionRegistry,
  registerTranscriptionHandlers,
  validateAudioInput,
};

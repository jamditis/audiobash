'use strict';

const ATTEMPT_TIMEOUT_MS = 30_000;
const OPERATION_TIMEOUT_MS = 100_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1000, 2000];

const RETRYABLE_NETWORK_CODES = new Set([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETDOWN',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'ETIMEDOUT',
  'RESOURCE_EXHAUSTED',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

function createRequestError(message, code, label) {
  const error = new Error(`${label}: ${message}`);
  error.name = 'TranscriptionRequestError';
  error.code = code;
  return error;
}

function callerAbortReason(signal, label) {
  if (signal?.reason instanceof Error) {
    return signal.reason;
  }

  return createRequestError('Transcription cancelled', 'TRANSCRIPTION_CANCELLED', label);
}

function errorChainHas(error, predicate) {
  const visited = new Set();
  let current = error;

  while (current && typeof current === 'object' && !visited.has(current)) {
    visited.add(current);
    if (predicate(current)) {
      return true;
    }
    current = current.cause;
  }

  return false;
}

function findErrorValue(error, property) {
  const visited = new Set();
  let current = error;

  while (current && typeof current === 'object' && !visited.has(current)) {
    visited.add(current);
    const value = current[property];
    if (value !== undefined && value !== null) {
      return value;
    }
    current = current.cause;
  }

  return undefined;
}

function isRetryableError(error) {
  if (error?.code === 'TRANSCRIPTION_ATTEMPT_TIMEOUT') {
    return true;
  }

  const statusValue = findErrorValue(error, 'status');
  if (statusValue !== undefined) {
    const status = Number(statusValue);
    return status === 408 || status === 429 || (status >= 500 && status <= 599);
  }

  const hasRetryableCode = errorChainHas(
    error,
    (candidate) =>
      typeof candidate.code === 'string' &&
      RETRYABLE_NETWORK_CODES.has(candidate.code.toUpperCase()),
  );
  if (hasRetryableCode) {
    return true;
  }

  return errorChainHas(
    error,
    (candidate) =>
      typeof candidate.message === 'string' &&
      (candidate.message.toLowerCase().includes('fetch failed') ||
        candidate.message.includes('RESOURCE_EXHAUSTED')),
  );
}

function createTranscriptionRequest(options = {}) {
  const callerSignal = options.signal;
  const onRetry = options.onRetry;
  const operationDeadline = Date.now() + OPERATION_TIMEOUT_MS;

  function remainingOperationTime() {
    return Math.max(0, operationDeadline - Date.now());
  }

  function throwIfStopped(label) {
    if (callerSignal?.aborted) {
      throw callerAbortReason(callerSignal, label);
    }
    if (remainingOperationTime() === 0) {
      throw createRequestError(
        'Transcription deadline exceeded',
        'TRANSCRIPTION_DEADLINE_EXCEEDED',
        label,
      );
    }
  }

  async function runAttempt(label, attemptNumber, attempt) {
    throwIfStopped(label);

    const remainingMs = remainingOperationTime();
    const timeoutMs = Math.min(ATTEMPT_TIMEOUT_MS, remainingMs);
    const reachesOperationDeadline = timeoutMs === remainingMs;
    const timeoutError = createRequestError(
      reachesOperationDeadline ? 'Transcription deadline exceeded' : 'Request attempt timed out',
      reachesOperationDeadline
        ? 'TRANSCRIPTION_DEADLINE_EXCEEDED'
        : 'TRANSCRIPTION_ATTEMPT_TIMEOUT',
      label,
    );
    const attemptController = new AbortController();
    let rejectControl;
    let settled = false;

    const control = new Promise((_, reject) => {
      rejectControl = reject;
    });

    const stopAttempt = (reason) => {
      if (settled) return;
      if (!attemptController.signal.aborted) {
        attemptController.abort(reason);
      }
      rejectControl(reason);
    };

    const handleCallerAbort = () => {
      stopAttempt(callerAbortReason(callerSignal, label));
    };

    callerSignal?.addEventListener('abort', handleCallerAbort, { once: true });
    const timeout = setTimeout(() => stopAttempt(timeoutError), timeoutMs);

    try {
      return await Promise.race([
        Promise.resolve().then(() =>
          attempt({
            attempt: attemptNumber,
            signal: attemptController.signal,
            timeoutMs,
          }),
        ),
        control,
      ]);
    } finally {
      settled = true;
      clearTimeout(timeout);
      callerSignal?.removeEventListener('abort', handleCallerAbort);
    }
  }

  async function waitForRetry(label, delayMs) {
    throwIfStopped(label);

    const remainingMs = remainingOperationTime();
    const waitMs = Math.min(delayMs, remainingMs);
    const reachesOperationDeadline = waitMs === remainingMs;

    await new Promise((resolve, reject) => {
      let settled = false;

      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callerSignal?.removeEventListener('abort', handleCallerAbort);
        callback(value);
      };

      const handleCallerAbort = () => {
        finish(reject, callerAbortReason(callerSignal, label));
      };

      const timeout = setTimeout(() => {
        if (reachesOperationDeadline) {
          finish(
            reject,
            createRequestError(
              'Transcription deadline exceeded',
              'TRANSCRIPTION_DEADLINE_EXCEEDED',
              label,
            ),
          );
        } else {
          finish(resolve);
        }
      }, waitMs);

      callerSignal?.addEventListener('abort', handleCallerAbort, { once: true });
      if (callerSignal?.aborted) {
        handleCallerAbort();
      }
    });
  }

  async function runStage(label, attempt) {
    if (typeof attempt !== 'function') {
      throw new TypeError('Transcription request attempt must be a function');
    }

    let lastError;

    for (let attemptNumber = 1; attemptNumber <= MAX_ATTEMPTS; attemptNumber += 1) {
      try {
        return await runAttempt(label, attemptNumber, attempt);
      } catch (error) {
        lastError = error;
        if (callerSignal?.aborted) {
          throw callerAbortReason(callerSignal, label);
        }
        if (error?.code === 'TRANSCRIPTION_DEADLINE_EXCEEDED') {
          throw error;
        }
        if (attemptNumber === MAX_ATTEMPTS || !isRetryableError(error)) {
          throw error;
        }

        const delayMs = RETRY_DELAYS_MS[attemptNumber - 1];
        onRetry?.({ attempt: attemptNumber, delayMs, error, label });
        await waitForRetry(label, delayMs);
      }
    }

    throw lastError;
  }

  return { runStage };
}

module.exports = {
  ATTEMPT_TIMEOUT_MS,
  MAX_ATTEMPTS,
  OPERATION_TIMEOUT_MS,
  RETRY_DELAYS_MS,
  createRequestError,
  createTranscriptionRequest,
  isRetryableError,
};

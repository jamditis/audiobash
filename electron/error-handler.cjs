/**
 * AudioBash Error Handler
 * Centralized error handling, recovery, and user-friendly error messages
 */

const { logger } = require('./logger.cjs');

const errorLog = logger.category('ErrorHandler');

// Error categories for consistent handling
const ErrorCategory = {
  NETWORK: 'network',
  AUDIO: 'audio',
  TERMINAL: 'terminal',
  TRANSCRIPTION: 'transcription',
  STORAGE: 'storage',
  PERMISSION: 'permission',
  CONFIGURATION: 'configuration',
  SYSTEM: 'system',
  UNKNOWN: 'unknown',
};

// Error codes with recovery suggestions
const ErrorCodes = {
  // Network errors
  E1001: {
    code: 'E1001',
    category: ErrorCategory.NETWORK,
    message: 'Connection timeout',
    userMessage: 'Connection timed out. Please check your internet connection.',
    recovery: 'retry',
  },
  E1002: {
    code: 'E1002',
    category: ErrorCategory.NETWORK,
    message: 'WebSocket connection failed',
    userMessage: 'Could not connect to the remote server. Make sure AudioBash is running on the desktop.',
    recovery: 'reconnect',
  },
  E1003: {
    code: 'E1003',
    category: ErrorCategory.NETWORK,
    message: 'API rate limit exceeded',
    userMessage: 'Too many requests. Please wait a moment before trying again.',
    recovery: 'backoff',
  },

  // Audio errors
  E2001: {
    code: 'E2001',
    category: ErrorCategory.AUDIO,
    message: 'Microphone access denied',
    userMessage: 'Microphone access was denied. Please allow microphone access in your system settings.',
    recovery: 'permissions',
  },
  E2002: {
    code: 'E2002',
    category: ErrorCategory.AUDIO,
    message: 'Audio recording failed',
    userMessage: 'Failed to record audio. Please check your microphone is connected and working.',
    recovery: 'retry',
  },
  E2003: {
    code: 'E2003',
    category: ErrorCategory.AUDIO,
    message: 'Audio buffer overflow',
    userMessage: 'Recording was too long. Please try a shorter recording.',
    recovery: 'reset',
  },
  E2004: {
    code: 'E2004',
    category: ErrorCategory.AUDIO,
    message: 'Unsupported audio format',
    userMessage: 'Audio format not supported. Please try again.',
    recovery: 'retry',
  },

  // Terminal errors
  E3001: {
    code: 'E3001',
    category: ErrorCategory.TERMINAL,
    message: 'PTY spawn failed',
    userMessage: 'Failed to start terminal. Please try restarting the application.',
    recovery: 'restart',
  },
  E3002: {
    code: 'E3002',
    category: ErrorCategory.TERMINAL,
    message: 'Terminal process crashed',
    userMessage: 'Terminal process stopped unexpectedly. A new terminal will be opened.',
    recovery: 'respawn',
  },
  E3003: {
    code: 'E3003',
    category: ErrorCategory.TERMINAL,
    message: 'Terminal resize failed',
    userMessage: 'Failed to resize terminal. This is usually temporary.',
    recovery: 'ignore',
  },

  // Transcription errors
  E4001: {
    code: 'E4001',
    category: ErrorCategory.TRANSCRIPTION,
    message: 'Transcription API key missing',
    userMessage: 'No API key configured. Please add your API key in Settings.',
    recovery: 'configure',
  },
  E4002: {
    code: 'E4002',
    category: ErrorCategory.TRANSCRIPTION,
    message: 'Transcription failed',
    userMessage: 'Could not transcribe audio. Please try again.',
    recovery: 'retry',
  },
  E4003: {
    code: 'E4003',
    category: ErrorCategory.TRANSCRIPTION,
    message: 'Invalid API key',
    userMessage: 'API key is invalid. Please check your API key in Settings.',
    recovery: 'configure',
  },
  E4004: {
    code: 'E4004',
    category: ErrorCategory.TRANSCRIPTION,
    message: 'Audio too short',
    userMessage: 'Recording was too short. Please speak a bit longer.',
    recovery: 'retry',
  },
  E4005: {
    code: 'E4005',
    category: ErrorCategory.TRANSCRIPTION,
    message: 'No speech detected',
    userMessage: 'No speech was detected. Please try speaking more clearly.',
    recovery: 'retry',
  },

  // Storage errors
  E5001: {
    code: 'E5001',
    category: ErrorCategory.STORAGE,
    message: 'Settings file corrupted',
    userMessage: 'Settings file was corrupted. Default settings have been restored.',
    recovery: 'reset',
  },
  E5002: {
    code: 'E5002',
    category: ErrorCategory.STORAGE,
    message: 'Disk full',
    userMessage: 'Not enough disk space. Please free up some space.',
    recovery: 'cleanup',
  },

  // Permission errors
  E6001: {
    code: 'E6001',
    category: ErrorCategory.PERMISSION,
    message: 'Insufficient permissions',
    userMessage: 'Permission denied. Please run with appropriate permissions.',
    recovery: 'elevate',
  },

  // Configuration errors
  E7001: {
    code: 'E7001',
    category: ErrorCategory.CONFIGURATION,
    message: 'Invalid configuration',
    userMessage: 'Invalid configuration detected. Please check your settings.',
    recovery: 'configure',
  },

  // System errors
  E8001: {
    code: 'E8001',
    category: ErrorCategory.SYSTEM,
    message: 'Out of memory',
    userMessage: 'System is low on memory. Please close some applications.',
    recovery: 'restart',
  },
  E8002: {
    code: 'E8002',
    category: ErrorCategory.SYSTEM,
    message: 'Native module failed',
    userMessage: 'A required component failed to load. Please try reinstalling the application.',
    recovery: 'reinstall',
  },
};

// Map common error patterns to error codes
const errorPatterns = [
  { pattern: /ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i, code: 'E1001' },
  { pattern: /websocket.*fail|ws.*error/i, code: 'E1002' },
  { pattern: /rate.?limit|429|too many requests/i, code: 'E1003' },
  { pattern: /permission.*denied.*microphone|NotAllowedError/i, code: 'E2001' },
  { pattern: /mediarecorder.*error/i, code: 'E2002' },
  { pattern: /pty.*spawn|ENOENT.*shell/i, code: 'E3001' },
  { pattern: /pty.*exit.*unexpected/i, code: 'E3002' },
  { pattern: /no.*api.?key|api.?key.*missing/i, code: 'E4001' },
  { pattern: /transcription.*fail/i, code: 'E4002' },
  { pattern: /invalid.*api.?key|401.*unauthorized/i, code: 'E4003' },
  { pattern: /audio.*short|too.*short/i, code: 'E4004' },
  { pattern: /no.*speech|speech.*not.*detected/i, code: 'E4005' },
  { pattern: /json.*parse|unexpected.*token/i, code: 'E5001' },
  { pattern: /ENOSPC|disk.*full|no.*space/i, code: 'E5002' },
  { pattern: /EACCES|permission/i, code: 'E6001' },
  { pattern: /out.*of.*memory|heap.*limit/i, code: 'E8001' },
  { pattern: /node-pty|native.*module/i, code: 'E8002' },
];

/**
 * AudioBash Error class with additional context
 */
class AudioBashError extends Error {
  constructor(code, originalError = null, context = {}) {
    const errorDef = ErrorCodes[code] || {
      code: 'E0000',
      category: ErrorCategory.UNKNOWN,
      message: 'Unknown error',
      userMessage: 'An unexpected error occurred.',
      recovery: 'retry',
    };

    super(errorDef.message);
    this.name = 'AudioBashError';
    this.code = errorDef.code;
    this.category = errorDef.category;
    this.userMessage = errorDef.userMessage;
    this.recovery = errorDef.recovery;
    this.originalError = originalError;
    this.context = context;
    this.timestamp = new Date().toISOString();

    if (originalError?.stack) {
      this.stack = `${this.stack}\nCaused by: ${originalError.stack}`;
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      message: this.message,
      userMessage: this.userMessage,
      recovery: this.recovery,
      context: this.context,
      timestamp: this.timestamp,
      originalError: this.originalError?.message,
    };
  }
}

/**
 * Classify an error and return an AudioBashError
 */
function classifyError(error, context = {}) {
  const errorString = `${error.name || ''} ${error.message || ''} ${error.code || ''}`;

  for (const { pattern, code } of errorPatterns) {
    if (pattern.test(errorString)) {
      return new AudioBashError(code, error, context);
    }
  }

  // Fallback to unknown error
  return new AudioBashError('E0000', error, context);
}

/**
 * Handle an error with logging and optional recovery
 */
async function handleError(error, context = {}) {
  const classified = error instanceof AudioBashError ? error : classifyError(error, context);

  // Log the error
  errorLog.error(classified.message, new Error(classified.originalError?.message || classified.message), {
    code: classified.code,
    category: classified.category,
    recovery: classified.recovery,
    ...classified.context,
  });

  // Attempt recovery based on type
  let recovered = false;
  let recoveryResult = null;

  switch (classified.recovery) {
    case 'retry':
      recoveryResult = { action: 'retry', message: 'Please try again.' };
      break;
    case 'reconnect':
      recoveryResult = { action: 'reconnect', message: 'Attempting to reconnect...' };
      break;
    case 'backoff':
      recoveryResult = { action: 'wait', delay: 5000, message: 'Please wait 5 seconds before trying again.' };
      break;
    case 'reset':
      recoveryResult = { action: 'reset', message: 'Resetting component...' };
      break;
    case 'respawn':
      recoveryResult = { action: 'respawn', message: 'Restarting terminal...' };
      break;
    case 'configure':
      recoveryResult = { action: 'openSettings', message: 'Please update your settings.' };
      break;
    case 'permissions':
      recoveryResult = { action: 'requestPermissions', message: 'Please grant the required permissions.' };
      break;
    case 'restart':
      recoveryResult = { action: 'restart', message: 'Please restart the application.' };
      break;
    case 'ignore':
      recoveryResult = { action: 'ignore', message: '' };
      recovered = true;
      break;
    default:
      recoveryResult = { action: 'unknown', message: 'Please try again or restart the application.' };
  }

  return {
    error: classified,
    recovered,
    recovery: recoveryResult,
  };
}

/**
 * Create a safe wrapper for async functions
 */
function withErrorHandler(fn, context = {}) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      const result = await handleError(error, { ...context, args: args.slice(0, 2) });
      throw result.error;
    }
  };
}

/**
 * Create a retry wrapper with exponential backoff
 */
function withRetry(fn, options = {}) {
  const { maxRetries = 3, initialDelay = 1000, maxDelay = 10000, backoffFactor = 2 } = options;

  return async (...args) => {
    let lastError;
    let delay = initialDelay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error;
        const classified = classifyError(error);

        // Don't retry certain error types
        if (['configure', 'permissions', 'reinstall'].includes(classified.recovery)) {
          throw classified;
        }

        if (attempt < maxRetries) {
          errorLog.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`, {
            error: error.message,
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay = Math.min(delay * backoffFactor, maxDelay);
        }
      }
    }

    throw classifyError(lastError, { retryExhausted: true });
  };
}

/**
 * Create a timeout wrapper
 */
function withTimeout(fn, timeoutMs = 30000) {
  return async (...args) => {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    return Promise.race([fn(...args), timeoutPromise]);
  };
}

/**
 * Validate input and throw appropriate errors
 */
function validateInput(value, name, validators = {}) {
  if (validators.required && (value === undefined || value === null)) {
    throw new AudioBashError('E7001', null, { field: name, issue: 'required' });
  }

  if (validators.type && typeof value !== validators.type) {
    throw new AudioBashError('E7001', null, { field: name, issue: 'type', expected: validators.type });
  }

  if (validators.minLength && value?.length < validators.minLength) {
    throw new AudioBashError('E7001', null, { field: name, issue: 'minLength', expected: validators.minLength });
  }

  if (validators.maxLength && value?.length > validators.maxLength) {
    throw new AudioBashError('E7001', null, { field: name, issue: 'maxLength', expected: validators.maxLength });
  }

  if (validators.pattern && !validators.pattern.test(value)) {
    throw new AudioBashError('E7001', null, { field: name, issue: 'pattern' });
  }

  return value;
}

/**
 * Get user-friendly error message
 */
function getUserMessage(error) {
  if (error instanceof AudioBashError) {
    return error.userMessage;
  }

  const classified = classifyError(error);
  return classified.userMessage;
}

/**
 * Get error code for an error
 */
function getErrorCode(error) {
  if (error instanceof AudioBashError) {
    return error.code;
  }

  const classified = classifyError(error);
  return classified.code;
}

module.exports = {
  AudioBashError,
  ErrorCategory,
  ErrorCodes,
  classifyError,
  handleError,
  withErrorHandler,
  withRetry,
  withTimeout,
  validateInput,
  getUserMessage,
  getErrorCode,
};

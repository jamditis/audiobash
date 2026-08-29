'use strict';

const MAX_STDOUT_BYTES = 4 * 1024 * 1024;
const MAX_STDERR_BYTES = 64 * 1024;

function transcriptionJobError(message, code, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.name = 'TranscriptionJobError';
  error.code = code;
  return error;
}

function errorChainMatches(error, pattern) {
  const seen = new Set();
  let current = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    if (typeof current.message === 'string' && pattern.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}

function collectStream(stream, maximumBytes, label, priorError) {
  if (priorError) return Promise.reject(priorError);
  if (!stream) return Promise.resolve('');

  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;
    let terminalError;

    const finish = (error, keepErrorListener = false) => {
      if (settled) return;
      settled = true;
      stream.removeListener('data', onData);
      stream.removeListener('end', onEnd);
      stream.removeListener('close', onEnd);
      if (keepErrorListener) {
        stream.once('close', () => stream.removeListener('error', onError));
      } else {
        stream.removeListener('error', onError);
      }
      if (error || terminalError) reject(error || terminalError);
      else resolve(Buffer.concat(chunks, totalBytes).toString());
    };
    const onData = (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;
      if (terminalError) return;
      if (totalBytes > maximumBytes) {
        terminalError = transcriptionJobError(
          `${label} exceeded ${maximumBytes} bytes`,
          'TRANSCRIPTION_OUTPUT_LIMIT',
        );
        finish(terminalError, true);
        stream.resume();
        return;
      }
      chunks.push(buffer);
    };
    const onEnd = () => finish();
    const onError = (error) => finish(error);

    stream.on('data', onData);
    stream.once('end', onEnd);
    stream.once('close', onEnd);
    stream.once('error', onError);
    if (stream.readableEnded || stream.destroyed) finish();
  });
}

function createTranscriptionJob({
  processTree,
  timeoutMs = 60_000,
  onStatus = () => {},
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  if (!processTree?.spawn || !processTree?.stop) {
    throw new TypeError('A process-tree controller is required');
  }

  let status = 'created';
  let runPromise;
  let activeProcess;
  let activeStopPromise;
  let activeCleanupFailureHandler;
  let stopReason;
  let timeout;
  let settleTerminal;
  const terminal = new Promise((resolve) => {
    settleTerminal = resolve;
  });
  let cancellationPromise;

  function asCleanupFailure(error) {
    if (error?.code === 'TRANSCRIPTION_CLEANUP_FAILED') return error;
    return transcriptionJobError(
      `Could not prove that the transcription process tree stopped: ${error.message}`,
      'TRANSCRIPTION_CLEANUP_FAILED',
      error,
    );
  }

  function observeStopFailure(promise) {
    void promise.catch((error) => activeCleanupFailureHandler?.(asCleanupFailure(error)));
  }

  function publish(nextStatus) {
    status = nextStatus;
    onStatus(nextStatus);
  }

  function requestStop(error) {
    if (!stopReason) stopReason = error;
    if (activeProcess && !activeStopPromise) {
      status = 'stopping';
      activeStopPromise = processTree.stop(activeProcess);
      observeStopFailure(activeStopPromise);
    }
    return activeStopPromise || Promise.resolve();
  }

  async function finishOwnedProcess() {
    if (!activeProcess) return;
    const owned = activeProcess;
    if (!activeStopPromise) {
      activeStopPromise = processTree.stop(owned);
      observeStopFailure(activeStopPromise);
    }
    try {
      await activeStopPromise;
    } catch (error) {
      throw asCleanupFailure(error);
    } finally {
      activeProcess = undefined;
      activeStopPromise = undefined;
    }
  }

  async function runStage(stageName, stage) {
    if (stopReason) throw stopReason;
    let owned;
    try {
      owned = await processTree.spawn(stage.command, stage.args || [], {
        ...(stage.options || {}),
        onOwned(process) {
          activeProcess = process;
          activeStopPromise = undefined;
          if (stopReason) void requestStop(stopReason).catch(() => {});
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      if (stopReason) throw stopReason;
      if (
        stageName === 'FFmpeg conversion' &&
        errorChainMatches(
          error,
          /(?:Windows target is not an absolute executable:\s*ffmpeg(?:\.exe)?|spawn\s+ffmpeg\s+ENOENT)/i,
        )
      ) {
        throw transcriptionJobError(
          'FFmpeg was not found. Install FFmpeg and add it to PATH.',
          'TRANSCRIPTION_PROCESS_FAILED',
          error,
        );
      }
      throw error;
    }
    if (activeProcess !== owned) {
      activeProcess = owned;
      activeStopPromise = undefined;
    }

    if (!owned.closeTracker?.closePromise) {
      throw transcriptionJobError(
        `Process owner for ${stageName} has no close record`,
        'TRANSCRIPTION_PROCESS_OWNER_INVALID',
      );
    }

    const streamErrors = owned.closeTracker.claimStreamErrors?.() || {};
    const stdout = collectStream(
      owned.child.stdout,
      MAX_STDOUT_BYTES,
      `${stageName} stdout`,
      streamErrors.stdoutError,
    );
    const stderr = collectStream(
      owned.child.stderr,
      MAX_STDERR_BYTES,
      `${stageName} stderr`,
      streamErrors.stderrError,
    );
    const closed = owned.closeTracker.closePromise;
    const exited = owned.closeTracker.exitPromise || closed;
    let rejectCleanupFailure;
    const cleanupFailureSignal = new Promise((_, reject) => {
      rejectCleanupFailure = reject;
    });
    activeCleanupFailureHandler = (error) => {
      owned.child.stdout?.destroy(error);
      owned.child.stderr?.destroy(error);
      rejectCleanupFailure(error);
    };
    if (activeStopPromise) observeStopFailure(activeStopPromise);

    const stopOnStreamFailure = (promise) => {
      void promise.catch((error) => requestStop(error).catch(() => {}));
    };
    stopOnStreamFailure(stdout);
    stopOnStreamFailure(stderr);

    const treeSettled = Promise.resolve(exited)
      .then(() => finishOwnedProcess())
      .catch((error) => {
        owned.child.stdout?.destroy(error);
        owned.child.stderr?.destroy(error);
        throw error;
      });

    if (stopReason) requestStop(stopReason);
    let streamResults;
    try {
      streamResults = await Promise.race([
        Promise.allSettled([closed, stdout, stderr, treeSettled]),
        cleanupFailureSignal,
      ]);
    } finally {
      activeCleanupFailureHandler = undefined;
    }

    const cleanupFailure = streamResults[3];
    if (cleanupFailure.status === 'rejected') throw cleanupFailure.reason;

    if (stopReason) throw stopReason;
    const streamFailure = streamResults.slice(0, 3).find((result) => result.status === 'rejected');
    if (streamFailure) throw streamFailure.reason;
    const [{ value: closeResult }, { value: stdoutText }, { value: stderrText }] = streamResults;
    const { code, processError, signal } = closeResult;
    if (processError) {
      throw transcriptionJobError(
        `Failed to run ${stageName}: ${processError.message}`,
        'TRANSCRIPTION_PROCESS_ERROR',
        processError,
      );
    }
    if (code !== 0) {
      if (stageName === 'FFmpeg conversion' && code === 127 && /ENOENT/i.test(stderrText)) {
        throw transcriptionJobError(
          'FFmpeg was not found. Install FFmpeg and add it to PATH.',
          'TRANSCRIPTION_PROCESS_FAILED',
        );
      }
      throw transcriptionJobError(
        `${stageName} failed with code ${code}${signal ? ` (${signal})` : ''}: ${stderrText.slice(-500)}`,
        'TRANSCRIPTION_PROCESS_FAILED',
      );
    }
    return { stdout: stdoutText, stderr: stderrText };
  }

  async function runInternal(stages) {
    publish('running');
    timeout = setTimeoutFn(() => {
      void requestStop(
        transcriptionJobError(
          `Transcription timed out after ${timeoutMs} milliseconds`,
          'TRANSCRIPTION_TIMEOUT',
        ),
      ).catch(() => {});
    }, timeoutMs);

    let terminalError;
    try {
      if (stages.conversion) await runStage('FFmpeg conversion', stages.conversion);
      const result = await runStage('Whisper transcription', stages.transcription);
      publish('complete');
      return { stdout: result.stdout };
    } catch (error) {
      terminalError = error;
      if (activeProcess) {
        try {
          await finishOwnedProcess();
        } catch (cleanupError) {
          terminalError = cleanupError;
        }
      }
      if (terminalError?.code === 'TRANSCRIPTION_CLEANUP_FAILED') {
        publish('cleanup-failed');
      } else if (
        terminalError?.code === 'TRANSCRIPTION_CANCELLED' ||
        terminalError?.code === 'TRANSCRIPTION_SHUTDOWN'
      ) {
        publish('cancelled');
      } else {
        publish('failed');
      }
      throw terminalError;
    } finally {
      clearTimeoutFn(timeout);
      settleTerminal(terminalError);
    }
  }

  function run(stages) {
    if (!runPromise) runPromise = runInternal(stages);
    return runPromise;
  }

  function stopWith(code, message) {
    if (!cancellationPromise) {
      const reason = transcriptionJobError(message, code);
      void requestStop(reason).catch(() => {});
      cancellationPromise = terminal.then((error) => {
        if (error?.code === 'TRANSCRIPTION_CLEANUP_FAILED') throw error;
      });
    }
    return cancellationPromise;
  }

  return {
    run,
    cancel() {
      return stopWith('TRANSCRIPTION_CANCELLED', 'Transcription cancelled');
    },
    shutdown() {
      return stopWith('TRANSCRIPTION_SHUTDOWN', 'Transcription stopped during app shutdown');
    },
    get status() {
      return status;
    },
  };
}

module.exports = { createTranscriptionJob, transcriptionJobError };

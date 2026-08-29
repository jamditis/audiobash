'use strict';

function createAppShutdownCoordinator({
  closeTranscriptions,
  closeOtherResources,
  quit,
  logError = () => {},
  timeoutMs = 6500,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}) {
  let allowQuit = false;
  let shutdownPromise;

  function beforeQuit(event) {
    if (allowQuit) return undefined;
    event.preventDefault();
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = (async () => {
      try {
        let deadlineTimer;
        const deadline = new Promise((_, reject) => {
          deadlineTimer = setTimeoutFn(() => {
            const error = new Error(`Transcription cleanup exceeded ${timeoutMs} milliseconds`);
            error.code = 'APP_SHUTDOWN_TIMEOUT';
            reject(error);
          }, timeoutMs);
        });
        try {
          await Promise.race([closeTranscriptions(), deadline]);
        } finally {
          clearTimeoutFn(deadlineTimer);
        }
      } catch (error) {
        logError(error);
      } finally {
        try {
          closeOtherResources();
        } catch (error) {
          logError(error);
        } finally {
          allowQuit = true;
          quit();
        }
      }
    })();
    return shutdownPromise;
  }

  return { beforeQuit };
}

module.exports = { createAppShutdownCoordinator };

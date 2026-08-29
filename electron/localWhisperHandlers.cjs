'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_ENCODED_AUDIO_BYTES = Math.ceil(MAX_AUDIO_BYTES / 3) * 4;
const MAX_ACTIVE_REQUESTS = 2;
const MAX_PENDING_CLEANUP_RETRIES = 4;
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

function base64Value(code) {
  if (code >= 65 && code <= 90) return code - 65;
  if (code >= 97 && code <= 122) return code - 97 + 26;
  if (code >= 48 && code <= 57) return code - 48 + 52;
  if (code === 43) return 62;
  if (code === 47) return 63;
  return -1;
}

function isStrictBase64(value) {
  if (value.length === 0 || value.length % 4 !== 0) return false;
  let contentLength = value.length;
  if (value.endsWith('==')) contentLength -= 2;
  else if (value.endsWith('=')) contentLength -= 1;

  for (let index = 0; index < contentLength; index += 1) {
    if (base64Value(value.charCodeAt(index)) < 0) return false;
  }
  for (let index = contentLength; index < value.length; index += 1) {
    if (value.charCodeAt(index) !== 61) return false;
  }
  const paddingLength = value.length - contentLength;
  const lastValue = base64Value(value.charCodeAt(contentLength - 1));
  if (paddingLength === 2 && (lastValue & 0x0f) !== 0) return false;
  if (paddingLength === 1 && (lastValue & 0x03) !== 0) return false;
  return true;
}

function registerLocalWhisperHandlers({
  ipcMain,
  whisperService,
  getTempPath,
  fileSystem = fs,
  logError = () => {},
  logWarning = () => {},
  maxActiveRequests = MAX_ACTIVE_REQUESTS,
}) {
  const activeRequests = new Set();
  const pendingTempDirectories = new Set();
  let shuttingDown = false;

  function removeTempDirectory(directory) {
    try {
      fileSystem.rmSync(directory, {
        force: true,
        recursive: true,
        maxRetries: 3,
        retryDelay: 100,
      });
      pendingTempDirectories.delete(directory);
    } catch (error) {
      pendingTempDirectories.add(directory);
      logWarning(error);
    }
  }

  function retryPendingTempDirectories() {
    for (const directory of [...pendingTempDirectories].slice(0, MAX_PENDING_CLEANUP_RETRIES)) {
      pendingTempDirectories.delete(directory);
      removeTempDirectory(directory);
    }
  }

  function removeOrphanedTempDirectories() {
    let entries;
    const tempRoot = getTempPath();
    try {
      entries = fileSystem.readdirSync(tempRoot, { withFileTypes: true });
    } catch (error) {
      if (error.code !== 'ENOENT') logWarning(error);
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && /^whisper-[a-zA-Z0-9_-]+$/.test(entry.name)) {
        removeTempDirectory(path.join(tempRoot, entry.name));
      }
    }
  }

  removeOrphanedTempDirectories();

  async function transcribe(request) {
    let tempDirectory;
    try {
      const { requestId, modelName, audioBase64 } = request || {};
      if (typeof requestId !== 'string' || !REQUEST_ID_PATTERN.test(requestId)) {
        return { text: '', error: 'Invalid local transcription request ID' };
      }
      if (modelName !== 'small.en') {
        return { text: '', error: 'Invalid local transcription model' };
      }
      if (typeof audioBase64 !== 'string' || audioBase64.length === 0) {
        return { text: '', error: 'Audio data is empty' };
      }
      if (audioBase64.length > MAX_ENCODED_AUDIO_BYTES) {
        return { text: '', error: 'Audio data is invalid or exceeds the 25 MB limit' };
      }
      if (!isStrictBase64(audioBase64)) {
        return { text: '', error: 'Audio data is not valid base64' };
      }
      retryPendingTempDirectories();
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      if (audioBuffer.length === 0 || audioBuffer.length > MAX_AUDIO_BYTES) {
        return { text: '', error: 'Audio data is invalid or exceeds the 25 MB limit' };
      }

      const tempRoot = getTempPath();
      fileSystem.mkdirSync(tempRoot, { recursive: true });
      tempDirectory = fileSystem.mkdtempSync(path.join(tempRoot, 'whisper-'));
      const audioPath = path.join(tempDirectory, 'input.webm');
      fileSystem.writeFileSync(audioPath, audioBuffer, { flag: 'wx' });

      return await whisperService.transcribe(audioPath, { requestId, modelName });
    } catch (error) {
      logError(error);
      return { text: '', error: error.message };
    } finally {
      if (tempDirectory) {
        removeTempDirectory(tempDirectory);
      }
    }
  }

  ipcMain.handle('whisper-transcribe', (_event, request) => {
    if (shuttingDown) {
      return Promise.resolve({
        text: '',
        error: 'Local transcription is shutting down',
        errorCode: 'TRANSCRIPTION_SHUTDOWN',
      });
    }
    if (activeRequests.size >= maxActiveRequests) {
      return Promise.resolve({
        text: '',
        error: 'Too many local transcription requests are active',
        errorCode: 'TRANSCRIPTION_BUSY',
      });
    }

    const requestPromise = transcribe(request);
    activeRequests.add(requestPromise);
    void requestPromise.then(
      () => activeRequests.delete(requestPromise),
      () => activeRequests.delete(requestPromise),
    );
    return requestPromise;
  });

  ipcMain.handle('whisper-cancel', async (_event, requestId) => whisperService.cancel(requestId));

  return {
    async shutdown() {
      shuttingDown = true;
      let shutdownError;
      try {
        await whisperService.shutdown();
      } catch (error) {
        shutdownError = error;
      }
      await Promise.allSettled([...activeRequests]);
      for (const directory of [...pendingTempDirectories]) removeTempDirectory(directory);
      if (shutdownError) throw shutdownError;
    },
  };
}

module.exports = { registerLocalWhisperHandlers };

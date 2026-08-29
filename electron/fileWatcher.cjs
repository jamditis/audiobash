'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEBOUNCE_MS = 300;
const STABILITY_INTERVAL_MS = 100;
const MAX_STABILITY_CHECKS = 20;
const MAX_RECOVERY_MS = 2000;
const MAX_NATIVE_RECOVERY_ATTEMPTS = 20;
const NATIVE_RECOVERY_WINDOW_MS = 2000;

function createFileWatchError(entry, code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.name = 'FileWatchError';
  error.code = code;
  error.filepath = entry.filepath;
  error.watcherId = entry.watcherId;
  return error;
}

function metadataSignature(stats) {
  return {
    dev: String(stats.dev),
    ino: String(stats.ino),
    mtime: String(stats.mtimeNs ?? stats.mtimeMs),
    size: String(stats.size),
  };
}

function signaturesEqual(first, second) {
  return (
    first?.dev === second?.dev &&
    first?.ino === second?.ino &&
    first?.mtime === second?.mtime &&
    first?.size === second?.size
  );
}

function eventTargetsFile(filename, targetBasenames) {
  if (filename === null || filename === undefined) return true;

  const eventBasename = Buffer.isBuffer(filename) ? filename.toString() : String(filename);
  if (process.platform === 'win32' || process.platform === 'darwin') {
    const normalizedEventBasename = eventBasename.toLowerCase();
    return [...targetBasenames].some(
      (targetBasename) => normalizedEventBasename === targetBasename.toLowerCase(),
    );
  }
  return targetBasenames.has(eventBasename);
}

function createFileWatcherManager(options) {
  const onChange = options.onChange;
  const onError = options.onError ?? (() => {});
  const realpath = options.realpath ?? fs.promises.realpath;
  const stat = options.stat ?? fs.promises.stat;
  const watch = options.watch ?? fs.watch;
  const fileWatchers = new Map();
  let watcherIdCounter = 0;

  function isCurrent(entry, generation) {
    return !entry.closed && entry.generation === generation;
  }

  function clearEntryTimers(entry) {
    clearTimeout(entry.debounceTimer);
    clearTimeout(entry.stabilityTimer);
    entry.debounceTimer = undefined;
    entry.stabilityTimer = undefined;
  }

  function reportError(entry, error) {
    if (entry.closed) return;
    try {
      onError(error);
    } catch {
      // An error observer must not create an unhandled main-process rejection.
    }
  }

  function closeNativeWatcher(nativeWatcher) {
    try {
      nativeWatcher?.close();
    } catch {
      // A native watcher can already be closed after its error event.
    }
  }

  function isActiveSlot(entry, slot) {
    return entry.requestedSlot === slot || entry.canonicalSlot === slot;
  }

  function attachNativeWatcher(entry, slot) {
    const nativeWatcher = watch(slot.directory, { persistent: false }, (_eventType, filename) =>
      handleFileSignal(entry, slot, filename),
    );
    nativeWatcher.on?.('error', (cause) => {
      handleNativeWatcherError(entry, slot, nativeWatcher, cause);
    });
    return nativeWatcher;
  }

  function createNativeWatcherSlot(entry, role, directory, targetBasenames) {
    const slot = {
      directory,
      role,
      targetBasenames: new Set(targetBasenames),
      watcher: undefined,
    };
    slot.watcher = attachNativeWatcher(entry, slot);
    return slot;
  }

  function replaceNativeWatcher(entry, slot) {
    const previousWatcher = slot.watcher;
    const replacementWatcher = attachNativeWatcher(entry, slot);
    slot.watcher = replacementWatcher;
    if (previousWatcher !== replacementWatcher) {
      closeNativeWatcher(previousWatcher);
    }
  }

  function closeNativeWatcherSlot(slot) {
    if (!slot) return;
    const nativeWatcher = slot.watcher;
    slot.watcher = undefined;
    closeNativeWatcher(nativeWatcher);
  }

  function closeEntry(entry) {
    if (entry.closed) return;

    entry.closed = true;
    entry.generation += 1;
    clearEntryTimers(entry);
    fileWatchers.delete(entry.watcherId);
    closeNativeWatcherSlot(entry.requestedSlot);
    closeNativeWatcherSlot(entry.canonicalSlot);
    entry.requestedSlot = undefined;
    entry.canonicalSlot = undefined;
  }

  function handleNativeWatcherError(entry, slot, failedWatcher, cause) {
    if (entry.closed || !isActiveSlot(entry, slot) || slot.watcher !== failedWatcher) return;

    const now = Date.now();
    const recoveryWindowStart = now - NATIVE_RECOVERY_WINDOW_MS;
    entry.nativeRecoveryFailures = entry.nativeRecoveryFailures.filter(
      (failureTime) => failureTime > recoveryWindowStart,
    );
    entry.nativeRecoveryFailures.push(now);

    const nativeError = createFileWatchError(
      entry,
      'FILE_WATCH_NATIVE_ERROR',
      `File watcher failed: ${entry.filepath}`,
      cause,
    );
    reportError(entry, nativeError);

    if (entry.nativeRecoveryFailures.length > MAX_NATIVE_RECOVERY_ATTEMPTS) {
      entry.startupError = createFileWatchError(
        entry,
        'FILE_WATCH_NATIVE_RECOVERY_TIMEOUT',
        `File watcher failed more than ${MAX_NATIVE_RECOVERY_ATTEMPTS} times within ${NATIVE_RECOVERY_WINDOW_MS / 1000} seconds: ${entry.filepath}`,
        cause,
      );
      reportError(entry, entry.startupError);
      closeEntry(entry);
      return;
    }

    try {
      replaceNativeWatcher(entry, slot);
      if (slot.role === 'requested') {
        entry.topologyDirty = true;
      }
      scheduleReconciliation(entry);
    } catch (recoveryCause) {
      entry.startupError = createFileWatchError(
        entry,
        'FILE_WATCH_NATIVE_RECOVERY_FAILED',
        `Could not restore file watcher: ${entry.filepath}`,
        recoveryCause,
      );
      reportError(entry, entry.startupError);
      closeEntry(entry);
    }
  }

  function reportRecoveryTimeout(entry, generation) {
    if (!isCurrent(entry, generation)) return;

    entry.stabilityTimer = undefined;
    reportError(
      entry,
      createFileWatchError(
        entry,
        'FILE_WATCH_RECOVERY_TIMEOUT',
        `File did not become stable within ${MAX_RECOVERY_MS / 1000} seconds: ${entry.filepath}`,
      ),
    );
  }

  function scheduleStabilityCheck(entry, generation) {
    if (!isCurrent(entry, generation)) return;

    const elapsedMs = Date.now() - entry.recoveryStartedAt;
    if (entry.stabilityChecks >= MAX_STABILITY_CHECKS || elapsedMs >= MAX_RECOVERY_MS) {
      reportRecoveryTimeout(entry, generation);
      return;
    }

    entry.stabilityTimer = setTimeout(
      () => void checkStability(entry, generation),
      Math.min(STABILITY_INTERVAL_MS, MAX_RECOVERY_MS - elapsedMs),
    );
  }

  async function checkStability(entry, generation) {
    if (!isCurrent(entry, generation)) return;

    entry.stabilityTimer = undefined;
    entry.stabilityChecks += 1;
    let signature;
    try {
      const stats = await stat(entry.filepath, { bigint: true });
      signature = metadataSignature(stats);
    } catch (error) {
      if (!isCurrent(entry, generation)) return;
      if (error?.code === 'ENOENT') {
        entry.previousSignature = undefined;
        scheduleStabilityCheck(entry, generation);
        return;
      }

      reportError(
        entry,
        createFileWatchError(
          entry,
          'FILE_WATCH_STAT_FAILED',
          `Could not inspect watched file: ${entry.filepath}`,
          error,
        ),
      );
      return;
    }

    if (!isCurrent(entry, generation)) return;
    if (!signaturesEqual(entry.previousSignature, signature)) {
      entry.previousSignature = signature;
      scheduleStabilityCheck(entry, generation);
      return;
    }

    if (signaturesEqual(entry.publishedSignature, signature)) return;

    try {
      onChange({ watcherId: entry.watcherId, filepath: entry.filepath });
      entry.publishedSignature = signature;
    } catch (cause) {
      reportError(
        entry,
        createFileWatchError(
          entry,
          'FILE_WATCH_CHANGE_FAILED',
          `Could not publish watched file change: ${entry.filepath}`,
          cause,
        ),
      );
    }
  }

  function beginReconciliation(entry, generation) {
    if (!isCurrent(entry, generation)) return;

    entry.debounceTimer = undefined;
    if (entry.topologyDirty) {
      void refreshTopologyAndCheckStability(entry, generation);
      return;
    }
    beginStabilityCheck(entry, generation);
  }

  function beginStabilityCheck(entry, generation) {
    if (!isCurrent(entry, generation)) return;

    entry.previousSignature = undefined;
    entry.recoveryStartedAt = Date.now();
    entry.stabilityChecks = 0;
    void checkStability(entry, generation);
  }

  function configureWatcherTopology(entry, canonicalFilepath, canonicalRequestedDirectory) {
    const canonicalDirectory = path.dirname(canonicalFilepath);
    const canonicalBasename = path.basename(canonicalFilepath);
    const requestedBasename = path.basename(entry.filepath);
    entry.requestedSlot.targetBasenames = new Set([requestedBasename]);

    if (canonicalDirectory === canonicalRequestedDirectory) {
      entry.requestedSlot.targetBasenames.add(canonicalBasename);
      closeNativeWatcherSlot(entry.canonicalSlot);
      entry.canonicalSlot = undefined;
      return false;
    }

    if (entry.canonicalSlot?.directory === canonicalDirectory) {
      entry.canonicalSlot.targetBasenames = new Set([canonicalBasename]);
      return false;
    }

    const previousCanonicalSlot = entry.canonicalSlot;
    const replacementCanonicalSlot = createNativeWatcherSlot(
      entry,
      'canonical',
      canonicalDirectory,
      [canonicalBasename],
    );
    entry.canonicalSlot = replacementCanonicalSlot;
    closeNativeWatcherSlot(previousCanonicalSlot);
    return true;
  }

  async function refreshTopologyAndCheckStability(entry, generation) {
    let canonicalFilepath;
    let canonicalRequestedDirectory;
    try {
      [canonicalFilepath, canonicalRequestedDirectory] = await Promise.all([
        realpath(entry.filepath),
        realpath(path.dirname(entry.filepath)),
      ]);
    } catch (error) {
      if (!isCurrent(entry, generation)) return;
      if (error?.code !== 'ENOENT') {
        reportError(
          entry,
          createFileWatchError(
            entry,
            'FILE_WATCH_REALPATH_FAILED',
            `Could not resolve watched file: ${entry.filepath}`,
            error,
          ),
        );
        return;
      }
    }

    if (!isCurrent(entry, generation)) return;
    if (canonicalFilepath && canonicalRequestedDirectory) {
      try {
        configureWatcherTopology(entry, canonicalFilepath, canonicalRequestedDirectory);
      } catch (error) {
        reportError(
          entry,
          createFileWatchError(
            entry,
            'FILE_WATCH_NATIVE_RECOVERY_FAILED',
            `Could not update file watcher paths: ${entry.filepath}`,
            error,
          ),
        );
        closeEntry(entry);
        return;
      }
      entry.topologyDirty = false;
    }

    if (!isCurrent(entry, generation)) return;
    beginStabilityCheck(entry, generation);
  }

  function scheduleReconciliation(entry) {
    entry.generation += 1;
    const generation = entry.generation;
    clearEntryTimers(entry);
    entry.debounceTimer = setTimeout(() => beginReconciliation(entry, generation), DEBOUNCE_MS);
  }

  function handleFileSignal(entry, slot, filename) {
    if (entry.closed || !isActiveSlot(entry, slot)) return;

    if (entry.initializing) {
      entry.pendingAnySignal = true;
      if (eventTargetsFile(filename, slot.targetBasenames)) {
        entry.pendingTargetSignal = true;
        if (slot.role === 'requested') {
          entry.pendingTopologySignal = true;
        }
      }
      return;
    }

    if (!eventTargetsFile(filename, slot.targetBasenames)) return;

    if (slot.role === 'requested') {
      entry.topologyDirty = true;
    }
    scheduleReconciliation(entry);
  }

  async function watchFile(filepath) {
    const watcherId = `watcher-${watcherIdCounter++}`;
    const entry = {
      closed: false,
      debounceTimer: undefined,
      filepath,
      generation: 0,
      initializing: true,
      nativeRecoveryFailures: [],
      pendingAnySignal: false,
      pendingTargetSignal: false,
      pendingTopologySignal: false,
      previousSignature: undefined,
      publishedSignature: undefined,
      recoveryStartedAt: 0,
      requestedSlot: undefined,
      stabilityChecks: 0,
      stabilityTimer: undefined,
      canonicalSlot: undefined,
      topologyDirty: false,
      watcherId,
    };

    try {
      entry.requestedSlot = createNativeWatcherSlot(entry, 'requested', path.dirname(filepath), [
        path.basename(filepath),
      ]);
      fileWatchers.set(watcherId, entry);

      const [canonicalFilepath, canonicalRequestedDirectory, initialStats] = await Promise.all([
        realpath(filepath),
        realpath(path.dirname(filepath)),
        stat(filepath, { bigint: true }),
      ]);
      if (entry.closed) {
        throw (
          entry.startupError ??
          createFileWatchError(
            entry,
            'FILE_WATCH_STARTUP_CANCELLED',
            `File watcher startup was cancelled: ${entry.filepath}`,
          )
        );
      }
      const addedCanonicalWatcher = configureWatcherTopology(
        entry,
        canonicalFilepath,
        canonicalRequestedDirectory,
      );
      const canonicalBasename = path.basename(canonicalFilepath);
      const canonicalBasenameChanged = canonicalBasename !== path.basename(filepath);
      const receivedTargetSignal =
        entry.pendingTargetSignal || (entry.pendingAnySignal && canonicalBasenameChanged);
      entry.topologyDirty = entry.pendingTopologySignal;
      entry.pendingAnySignal = false;
      entry.pendingTargetSignal = false;
      entry.pendingTopologySignal = false;
      entry.publishedSignature =
        receivedTargetSignal || addedCanonicalWatcher ? undefined : metadataSignature(initialStats);
      entry.initializing = false;
      if (receivedTargetSignal || addedCanonicalWatcher) {
        scheduleReconciliation(entry);
      }
      return watcherId;
    } catch (error) {
      closeEntry(entry);
      throw error;
    }
  }

  function unwatchFile(watcherId) {
    const entry = fileWatchers.get(watcherId);
    if (!entry) return undefined;

    closeEntry(entry);
    return { filepath: entry.filepath, watcherId };
  }

  function closeAll() {
    for (const entry of [...fileWatchers.values()]) {
      closeEntry(entry);
    }
  }

  return { closeAll, unwatchFile, watchFile };
}

module.exports = { createFileWatcherManager };

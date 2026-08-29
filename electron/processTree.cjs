'use strict';

const { execFile: systemExecFile, spawn: systemSpawn } = require('node:child_process');
const path = require('node:path');
const { PARENT_STARTUP_MESSAGE_LIMIT_CHARACTERS } = require('./windowsOwnerProtocol.cjs');

const DEFAULT_GRACEFUL_TIMEOUT_MS = 3000;
const DEFAULT_FORCE_TIMEOUT_MS = 2000;
const DEFAULT_HELPER_TIMEOUT_MS = 1000;
const DEFAULT_WINDOWS_OWNER_TIMEOUT_MS = 20_000;
const PROCESS_CHECK_INTERVAL_MS = 25;
const WINDOWS_STATUS_LIMIT_BYTES = 1024;

function processTreeError(message, code, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.name = 'ProcessTreeError';
  error.code = code;
  return error;
}

function defaultGetProcessGroupId(pid, timeoutMs = DEFAULT_HELPER_TIMEOUT_MS) {
  const psPath = process.platform === 'darwin' ? '/bin/ps' : 'ps';
  return new Promise((resolve, reject) => {
    systemExecFile(
      psPath,
      ['-o', 'pgid=', '-p', String(pid)],
      { killSignal: 'SIGKILL', timeout: timeoutMs },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        const groupId = Number(String(stdout).trim());
        if (!Number.isSafeInteger(groupId) || groupId <= 0) {
          reject(processTreeError(`Invalid process group for PID ${pid}`, 'INVALID_PROCESS_GROUP'));
          return;
        }
        resolve(groupId);
      },
    );
  });
}

function defaultSignalWindowsLauncher(child) {
  if (!child || typeof child.kill !== 'function') {
    throw processTreeError(
      'A Windows launcher process handle is required',
      'PROCESS_LAUNCHER_HANDLE_INVALID',
    );
  }
  return child.kill('SIGKILL') !== false;
}

function defaultStartLauncher(child) {
  return new Promise((resolve, reject) => {
    const gate = child.stdio?.[3];
    if (!gate || typeof gate.end !== 'function') {
      reject(processTreeError('Process launcher gate is unavailable', 'PROCESS_LAUNCHER_NO_GATE'));
      return;
    }
    const onError = (error) => reject(error);
    gate.once('error', onError);
    gate.end('start', () => {
      gate.removeListener('error', onError);
      resolve();
    });
  });
}

function createProcessTreeController({
  platform = process.platform,
  parentPid = process.pid,
  spawn = systemSpawn,
  kill = process.kill.bind(process),
  getProcessGroupId = defaultGetProcessGroupId,
  isProcessGroupRunning,
  signalWindowsLauncher = defaultSignalWindowsLauncher,
  startLauncher = defaultStartLauncher,
  launcherPath = path.join(__dirname, 'processTreeLauncher.cjs'),
  gracefulTimeoutMs = DEFAULT_GRACEFUL_TIMEOUT_MS,
  forceTimeoutMs = DEFAULT_FORCE_TIMEOUT_MS,
  helperTimeoutMs = DEFAULT_HELPER_TIMEOUT_MS,
  windowsOwnerTimeoutMs = DEFAULT_WINDOWS_OWNER_TIMEOUT_MS,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  now = Date.now,
} = {}) {
  const stopPromises = new WeakMap();
  const ownedRecords = new WeakMap();
  const isWindows = platform === 'win32';

  function withTimeout(promise, timeoutMs, message, code) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeoutFn(() => {
        if (settled) return;
        settled = true;
        reject(processTreeError(message, code));
      }, timeoutMs);
      void Promise.resolve(promise).then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeoutFn(timer);
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          clearTimeoutFn(timer);
          reject(error);
        },
      );
    });
  }

  function trackClose(child, { trackTargetStatus = false } = {}) {
    let closed = child.exitCode !== null;
    let launcherExited = child.exitCode !== null;
    let processError;
    let closeResult = closed
      ? { code: child.exitCode, processError, signal: child.signalCode || null }
      : undefined;
    let resolveClose;
    let resolveExit;
    let stderrError;
    let stdoutError;
    let targetResult;
    let targetStatusText = '';
    let targetStatusState = trackTargetStatus ? 'awaiting-owner' : 'unused';
    let targetStatusEnded = false;
    let windowsOwnerPid;
    let resolveWindowsOwner;
    let windowsOwnerSettled = false;
    const closePromise = new Promise((resolve) => {
      resolveClose = resolve;
    });
    let exited = child.exitCode !== null;
    let exitResult = exited
      ? { code: child.exitCode, signal: child.signalCode || null }
      : undefined;
    const exitPromise = new Promise((resolve) => {
      resolveExit = resolve;
    });
    const windowsOwnerPromise = new Promise((resolve) => {
      resolveWindowsOwner = resolve;
    });

    const settleWindowsOwner = (pid) => {
      if (windowsOwnerSettled) return;
      windowsOwnerSettled = true;
      resolveWindowsOwner(pid);
    };

    const onError = (error) => {
      processError = error;
    };
    const onStderrError = (error) => {
      stderrError = error;
    };
    const onStdoutError = (error) => {
      stdoutError = error;
    };
    const onClose = (code, signal) => {
      launcherExited = true;
      settleWindowsOwner(undefined);
      if (trackTargetStatus && targetStatusState !== 'terminal' && !processError) {
        processError = processTreeError(
          'Process launcher closed before it returned a target result',
          'PROCESS_LAUNCHER_STATUS_INVALID',
        );
      }
      if (!exited) {
        exited = true;
        exitResult = { code, signal };
        resolveExit(exitResult);
      }
      if (closed) return;
      closed = true;
      closeResult = {
        code: targetResult ? targetResult.code : code,
        processError,
        signal: targetResult ? targetResult.signal : signal,
      };
      child.removeListener('error', onError);
      resolveClose(closeResult);
    };
    const onExit = (code, signal) => {
      launcherExited = true;
      if (exited) return;
      exited = true;
      exitResult = { code, signal };
      resolveExit(exitResult);
    };
    child.on('error', onError);
    child.stderr?.on('error', onStderrError);
    child.stdout?.on('error', onStdoutError);
    if (trackTargetStatus) {
      const targetStatus = child.stdio?.[4];
      const settleTargetStatusFailure = (error) => {
        if (targetStatusState === 'invalid') return;
        targetStatusState = 'invalid';
        settleWindowsOwner(undefined);
        processError = error;
        if (!exited) {
          exited = true;
          exitResult = { code: null, signal: null };
          resolveExit(exitResult);
        }
      };
      const rejectTargetStatus = (message, cause) => {
        settleTargetStatusFailure(
          processTreeError(message, 'PROCESS_LAUNCHER_STATUS_INVALID', cause),
        );
      };
      const hasExactKeys = (value, keys) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
        const actualKeys = Object.keys(value).sort();
        const expectedKeys = [...keys].sort();
        return (
          actualKeys.length === expectedKeys.length &&
          actualKeys.every((key, index) => key === expectedKeys[index])
        );
      };
      const acceptTargetStatus = (line) => {
        if (targetStatusState === 'invalid') return;
        try {
          const parsed = JSON.parse(line);
          if (
            targetStatusState !== 'terminal' &&
            hasExactKeys(parsed, ['type', 'message']) &&
            parsed.type === 'startup-error' &&
            typeof parsed.message === 'string' &&
            parsed.message.length > 0 &&
            parsed.message.length <= PARENT_STARTUP_MESSAGE_LIMIT_CHARACTERS
          ) {
            settleTargetStatusFailure(
              processTreeError(
                `Windows Job startup failed: ${parsed.message}`,
                'PROCESS_LAUNCHER_TARGET_START_FAILED',
              ),
            );
            return;
          }
          if (targetStatusState === 'awaiting-owner') {
            if (
              !hasExactKeys(parsed, ['type', 'ownerPid']) ||
              parsed.type !== 'owner-ready' ||
              !Number.isSafeInteger(parsed.ownerPid) ||
              parsed.ownerPid <= 0
            ) {
              throw new TypeError('Expected one valid Windows Job ownership frame');
            }
            windowsOwnerPid = parsed.ownerPid;
            targetStatusState = 'awaiting-target';
            settleWindowsOwner(windowsOwnerPid);
            return;
          }
          if (
            targetStatusState !== 'awaiting-target' ||
            !hasExactKeys(parsed, ['type', 'code', 'signal']) ||
            parsed.type !== 'target-result' ||
            !Number.isSafeInteger(parsed.code) ||
            parsed.signal !== null
          ) {
            throw new TypeError('Expected one valid Windows Job target-result frame');
          }
          targetResult = { code: parsed.code, signal: parsed.signal };
          targetStatusState = 'terminal';
          if (!exited) {
            exited = true;
            exitResult = targetResult;
            resolveExit(exitResult);
          }
        } catch (error) {
          rejectTargetStatus('Process launcher returned invalid target status', error);
        }
      };
      const consumeTargetStatus = (final = false) => {
        let newline = targetStatusText.indexOf('\n');
        while (newline >= 0) {
          const rawLine = targetStatusText.slice(0, newline);
          targetStatusText = targetStatusText.slice(newline + 1);
          if (Buffer.byteLength(rawLine, 'utf8') > WINDOWS_STATUS_LIMIT_BYTES) {
            rejectTargetStatus(
              `Process launcher target status exceeded ${WINDOWS_STATUS_LIMIT_BYTES} bytes`,
            );
            return;
          }
          const line = rawLine.trim();
          if (line) acceptTargetStatus(line);
          newline = targetStatusText.indexOf('\n');
        }
        if (final && targetStatusText.trim()) {
          const line = targetStatusText.trim();
          targetStatusText = '';
          acceptTargetStatus(line);
        }
      };
      const resolveTargetStatus = () => {
        targetStatusEnded = true;
        consumeTargetStatus(true);
        if (targetStatusState !== 'terminal' && targetStatusState !== 'invalid') {
          rejectTargetStatus('Process launcher returned no target result');
        }
      };
      targetStatus?.setEncoding?.('utf8');
      targetStatus?.on('data', (chunk) => {
        targetStatusText += chunk;
        consumeTargetStatus();
        if (Buffer.byteLength(targetStatusText, 'utf8') > WINDOWS_STATUS_LIMIT_BYTES) {
          rejectTargetStatus(
            `Process launcher target status exceeded ${WINDOWS_STATUS_LIMIT_BYTES} bytes`,
          );
          targetStatus.destroy?.();
        }
      });
      targetStatus?.once('end', resolveTargetStatus);
      targetStatus?.once('error', (error) => {
        rejectTargetStatus('Process launcher target-status channel failed', error);
      });
      targetStatus?.once('close', () => {
        if (!targetStatusEnded && targetStatusState !== 'invalid') {
          rejectTargetStatus('Process launcher target-status channel closed without a result');
        }
      });
    } else {
      child.stdio?.[4]?.resume?.();
    }
    child.once('exit', onExit);
    child.once('close', onClose);
    if (exited) resolveExit(exitResult);
    if (closed) resolveClose(closeResult);

    return {
      claimStreamErrors() {
        child.stderr?.removeListener('error', onStderrError);
        child.stdout?.removeListener('error', onStdoutError);
        return { stderrError, stdoutError };
      },
      closePromise,
      exitPromise,
      windowsOwnerPromise,
      get windowsOwnerPid() {
        return windowsOwnerPid;
      },
      get statusError() {
        return processError;
      },
      get closed() {
        return closed;
      },
      get launcherExited() {
        return launcherExited;
      },
    };
  }

  async function waitForDirectClose(closeTracker, pid) {
    return withTimeout(
      closeTracker.closePromise,
      helperTimeoutMs,
      `Direct child ${pid} did not close after ownership proof failed`,
      'PROCESS_OWNERSHIP_CLEANUP_TIMEOUT',
    );
  }

  async function spawnOwned(command, args = [], options = {}) {
    const { onOwned, ...childOptions } = options;
    const launcherEnvironment = {
      ...(childOptions.env || process.env),
      ELECTRON_RUN_AS_NODE: '1',
    };
    if (isWindows) launcherEnvironment.AUDIOBASH_LAUNCHER_HOLD = '1';
    else delete launcherEnvironment.AUDIOBASH_LAUNCHER_HOLD;
    const child = spawn(process.execPath, [launcherPath, command, ...args], {
      ...childOptions,
      detached: !isWindows,
      env: launcherEnvironment,
      stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    if (!child || typeof child.once !== 'function') {
      throw processTreeError(`Failed to start ${command}`, 'PROCESS_START_FAILED');
    }
    const targetStatus = child.stdio?.[4];
    const canTrackTargetStatus =
      !isWindows ||
      (targetStatus &&
        typeof targetStatus.on === 'function' &&
        typeof targetStatus.once === 'function');
    const closeTracker = Object.freeze(
      trackClose(child, { trackTargetStatus: isWindows && canTrackTargetStatus }),
    );
    const pid = child?.pid;
    if (!Number.isSafeInteger(pid) || pid <= 0) {
      const closeResult = await waitForDirectClose(closeTracker, 'unknown');
      throw processTreeError(
        `Failed to start ${command}`,
        'PROCESS_START_FAILED',
        closeResult?.processError,
      );
    }

    if (!canTrackTargetStatus) {
      child.stdio?.[3]?.destroy();
      child.stdout?.destroy();
      child.stderr?.destroy();
      child.kill?.('SIGKILL');
      await waitForDirectClose(closeTracker, pid);
      throw processTreeError(
        `Process launcher target-status channel is unavailable for PID ${pid}`,
        'PROCESS_LAUNCHER_NO_STATUS',
      );
    }

    const owned = Object.freeze({
      child,
      closeTracker,
      pid,
      platform,
      groupId: isWindows ? undefined : pid,
    });

    if (isWindows) {
      const windowsState = { ownerStopped: false };
      ownedRecords.set(owned, Object.freeze({ child, closeTracker, pid, platform, windowsState }));
      void closeTracker.closePromise.then(() => {
        windowsState.ownerStopped = true;
      });
      try {
        if (typeof onOwned === 'function') onOwned(owned);
        await withTimeout(
          startLauncher(child),
          helperTimeoutMs,
          `Process launcher did not start PID ${pid}`,
          'PROCESS_LAUNCHER_TIMEOUT',
        );
        const ownerPid = await withTimeout(
          closeTracker.windowsOwnerPromise,
          windowsOwnerTimeoutMs,
          `Windows Job owner was not reported for PID ${pid}`,
          'PROCESS_LAUNCHER_OWNER_TIMEOUT',
        );
        if (!Number.isSafeInteger(ownerPid) || ownerPid <= 0) {
          if (closeTracker.statusError) throw closeTracker.statusError;
          throw processTreeError(
            `Windows Job owner is invalid for PID ${pid}`,
            'PROCESS_LAUNCHER_OWNER_INVALID',
          );
        }
      } catch (error) {
        await cleanupFailedLaunch(owned, error);
      }
      return owned;
    }

    let childGroupId;
    let parentGroupId;
    try {
      [childGroupId, parentGroupId] = await Promise.all([
        withTimeout(
          getProcessGroupId(pid, helperTimeoutMs),
          helperTimeoutMs,
          `Process-group lookup timed out for PID ${pid}`,
          'PROCESS_GROUP_HELPER_TIMEOUT',
        ),
        withTimeout(
          getProcessGroupId(parentPid, helperTimeoutMs),
          helperTimeoutMs,
          `Process-group lookup timed out for owner PID ${parentPid}`,
          'PROCESS_GROUP_HELPER_TIMEOUT',
        ),
      ]);
    } catch (error) {
      child.kill?.('SIGKILL');
      child.stdout?.destroy();
      child.stderr?.destroy();
      child.stdio?.[3]?.destroy();
      await waitForDirectClose(closeTracker, pid);
      throw processTreeError(
        `Could not prove process-group ownership for PID ${pid}`,
        'PROCESS_GROUP_PROOF_FAILED',
        error,
      );
    }

    if (childGroupId !== pid || childGroupId === parentGroupId) {
      child.kill?.('SIGKILL');
      child.stdout?.destroy();
      child.stderr?.destroy();
      child.stdio?.[3]?.destroy();
      await waitForDirectClose(closeTracker, pid);
      throw processTreeError(
        `Process group ${childGroupId} is not isolated from owner group ${parentGroupId}`,
        'PROCESS_GROUP_NOT_ISOLATED',
      );
    }

    ownedRecords.set(
      owned,
      Object.freeze({ child, closeTracker, groupId: childGroupId, pid, platform }),
    );
    try {
      if (typeof onOwned === 'function') onOwned(owned);
      await withTimeout(
        startLauncher(child),
        helperTimeoutMs,
        `Process launcher did not start PID ${pid}`,
        'PROCESS_LAUNCHER_TIMEOUT',
      );
    } catch (error) {
      await cleanupFailedLaunch(owned, error);
    }
    return owned;
  }

  async function cleanupFailedLaunch(owned, startError) {
    const record = ownedRecords.get(owned);
    record.child.stdio?.[3]?.destroy();
    let cleanupError;
    try {
      await stop(owned);
    } catch (error) {
      cleanupError = error;
    } finally {
      record.child.stdout?.destroy();
      record.child.stderr?.destroy();
      record.child.stdio?.[4]?.destroy();
    }
    if (cleanupError) {
      throw processTreeError(
        cleanupError.message,
        cleanupError.code || 'PROCESS_LAUNCHER_CLEANUP_FAILED',
        new AggregateError(
          [startError, cleanupError],
          `Process startup and cleanup both failed for PID ${record.pid}`,
        ),
      );
    }
    const startMessage = startError?.message;
    throw processTreeError(
      `Could not start the owned process for PID ${record.pid}${startMessage ? `: ${startMessage}` : ''}`,
      'PROCESS_LAUNCHER_START_FAILED',
      startError,
    );
  }

  async function groupIsRunning(record) {
    if (typeof isProcessGroupRunning === 'function') {
      return Boolean(await isProcessGroupRunning(record.groupId));
    }
    try {
      kill(-record.groupId, 0);
      return true;
    } catch (error) {
      if (error?.code === 'ESRCH') return false;
      if (error?.code === 'EPERM') return true;
      throw error;
    }
  }

  async function stopped(record) {
    if (!record.closeTracker.closed) return false;
    if (isWindows) return record.windowsState.ownerStopped;
    return !(await groupIsRunning(record));
  }

  function waitForStop(record, timeoutMs) {
    return new Promise((resolve, reject) => {
      let deadlineTimer;
      let pollTimer;
      let finished = false;
      let checking = false;

      const finish = (value, error) => {
        if (finished) return;
        finished = true;
        clearTimeoutFn(deadlineTimer);
        clearTimeoutFn(pollTimer);
        if (error) reject(error);
        else resolve(value);
      };

      const check = async () => {
        if (finished || checking) return;
        checking = true;
        try {
          const isStopped = await stopped(record);
          checking = false;
          if (finished) return;
          if (isStopped) {
            finish(true);
            return;
          }
          pollTimer = setTimeoutFn(check, PROCESS_CHECK_INTERVAL_MS);
        } catch (error) {
          checking = false;
          finish(false, error);
        }
      };

      deadlineTimer = setTimeoutFn(() => finish(false), timeoutMs);
      void record.closeTracker.closePromise.then(() => {
        clearTimeoutFn(pollTimer);
        void check();
      });
      void check();
    });
  }

  function sendPosixSignal(record, signal) {
    if (
      record.groupId !== record.pid ||
      !Number.isSafeInteger(record.groupId) ||
      record.groupId <= 0
    ) {
      throw processTreeError(
        `Refusing to signal an unproved process group for PID ${record.pid}`,
        'PROCESS_GROUP_NOT_PROVED',
      );
    }
    try {
      kill(-record.groupId, signal);
      return true;
    } catch (error) {
      if (error?.code === 'ESRCH') return false;
      throw processTreeError(
        `Could not send ${signal} to process group ${record.groupId}`,
        'PROCESS_TREE_SIGNAL_FAILED',
        error,
      );
    }
  }

  async function signalWindows(record, force, timeoutMs) {
    try {
      const signaled = await withTimeout(
        Promise.resolve(signalWindowsLauncher(record.child, force, timeoutMs)),
        timeoutMs,
        `Windows launcher signal timed out for PID ${record.pid}`,
        'PROCESS_TREE_HELPER_TIMEOUT',
      );
      return signaled !== false;
    } catch (error) {
      if (error?.code === 'ESRCH' || error?.code === 128) return false;
      if (error?.code === 'PROCESS_TREE_HELPER_TIMEOUT') throw error;
      throw processTreeError(
        `Could not stop Windows launcher ${record.pid}`,
        'PROCESS_TREE_SIGNAL_FAILED',
        error,
      );
    }
  }

  function stop(owned) {
    const record = ownedRecords.get(owned);
    if (!record) {
      return Promise.reject(
        processTreeError('A process-tree owner handle is required', 'INVALID_PROCESS_OWNER'),
      );
    }
    const existing = stopPromises.get(owned);
    if (existing) return existing;

    const stopping = (async () => {
      if (record.closeTracker.closed && (await stopped(record))) return { forced: false };

      if (isWindows) {
        const cleanupTimeoutMs = gracefulTimeoutMs + forceTimeoutMs;
        if (record.closeTracker.launcherExited) {
          if (await waitForStop(record, cleanupTimeoutMs)) {
            return { forced: false };
          }
          throw processTreeError(
            `Process tree ${record.pid} did not close after its launcher exited`,
            'PROCESS_TREE_CLEANUP_TIMEOUT',
          );
        }
        const phaseStarted = now();
        let forceSignalSent;
        try {
          forceSignalSent = await signalWindows(record, true, cleanupTimeoutMs);
        } catch (error) {
          if (error?.code === 'PROCESS_TREE_HELPER_TIMEOUT') {
            throw processTreeError(
              `Process tree ${record.pid} did not stop after forced termination`,
              'PROCESS_TREE_CLEANUP_TIMEOUT',
              error,
            );
          }
          if (await stopped(record)) return { forced: false };
          throw error;
        }
        const remaining = Math.max(0, cleanupTimeoutMs - (now() - phaseStarted));
        if (remaining > 0 && (await waitForStop(record, remaining))) {
          return { forced: forceSignalSent };
        }
        if (await stopped(record)) return { forced: forceSignalSent };
        throw processTreeError(
          forceSignalSent
            ? `Process tree ${record.pid} did not stop after forced termination`
            : `Process tree ${record.pid} did not close after its launcher handle was unsignalable`,
          'PROCESS_TREE_CLEANUP_TIMEOUT',
        );
      }

      sendPosixSignal(record, 'SIGTERM');
      if (await waitForStop(record, gracefulTimeoutMs)) return { forced: false };
      sendPosixSignal(record, 'SIGKILL');
      if (await waitForStop(record, forceTimeoutMs)) return { forced: true };

      throw processTreeError(
        `Process tree ${record.pid} did not stop`,
        'PROCESS_TREE_CLEANUP_TIMEOUT',
      );
    })();

    stopPromises.set(owned, stopping);
    return stopping;
  }

  return { spawn: spawnOwned, stop };
}

const defaultController = createProcessTreeController();

module.exports = {
  createProcessTreeController,
  spawnProcessTree: defaultController.spawn,
  stopProcessTree: defaultController.stop,
};
